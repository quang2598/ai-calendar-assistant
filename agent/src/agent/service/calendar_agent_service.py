from __future__ import annotations

import os
import json
from contextvars import ContextVar
from functools import lru_cache
from typing import List, Optional
from dataclasses import dataclass

from langchain.agents import create_agent
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, ToolMessage
from langchain_ollama import ChatOllama
from langchain_openai import ChatOpenAI
from loguru import logger

from utility.tracing_utils import trace_span
from config.agent_config import agent_settings
from agent.prompt import build_system_prompt
from dto import SendChatRequest, SendChatResponse
from utility import ConversationMessage, get_user_calendar_timezone, load_agent_history_messages
from agent.tools import build_calendar_tools, build_location_tools


@dataclass
class AgentResponse:
    """Parsed agent response with interpreted question and response."""
    interpreted_question: Optional[str]
    response: str

# Request-scoped context for timezone caching to avoid redundant Google Calendar API calls
_request_timezone_cache: ContextVar[str] = ContextVar("request_timezone_cache", default="")


@lru_cache(maxsize=256)
def _get_cached_calendar_tools(uid: str):
    """Cache calendar tools by user id to avoid rebuilding every turn."""
    return tuple(build_calendar_tools(uid=uid))


@lru_cache(maxsize=256)
def _get_cached_location_tools(
    google_places_api_key: str,
    user_location: Optional[tuple[float, float]],
):
    """Cache location tools and maps client by API key and coarse location."""
    return tuple(
        build_location_tools(
            google_places_api_key=google_places_api_key,
            user_location=user_location,
        )
    )


def _parse_agent_response(raw_output: str, fallback_interpreted_question: str = "") -> AgentResponse:
    """
    Parse agent response that should be valid JSON with this schema:
    {
      "interpreted_question": "<corrected question>",
      "response": "<actual response>"
    }
    
    If JSON parsing fails, attempts to extract JSON from text or uses a safe
    fallback that still conforms to the response contract.
    
    Args:
        raw_output: Raw output from agent (should be JSON but may be text)
        fallback_interpreted_question: Original user question to use when the
            model fails to return JSON.
        
    Returns:
        AgentResponse with parsed interpreted_question and response
        
    Raises:
        ValueError: If unable to extract valid response in any format
    """
    if not raw_output or not raw_output.strip():
        logger.error("_parse_agent_response called with empty input!")
        raise ValueError("Agent response is empty")
    
    # First, try direct JSON parsing
    try:
        parsed = json.loads(raw_output)
        return _validate_and_extract_response(parsed, raw_output, fallback_interpreted_question)
    except json.JSONDecodeError:
        logger.warning("Agent response is not valid JSON, attempting fallback extraction")
    
    # Fallback 1: Try to find JSON object in the text
    # Look for { ... } pattern
    text = raw_output.strip()
    json_start = text.find('{')
    if json_start >= 0:
        json_end = text.rfind('}')
        if json_end > json_start:
            json_candidate = text[json_start:json_end + 1]
            try:
                parsed = json.loads(json_candidate)
                logger.info("Successfully extracted JSON from text")
                return _validate_and_extract_response(parsed, raw_output, fallback_interpreted_question)
            except json.JSONDecodeError:
                logger.warning("Found { } but content is not valid JSON")
    
    # Fallback 2: If we have plain text, use it as the response
    # Use the text as-is since the model failed to follow JSON format
    logger.warning("No valid JSON found in response, using fallback format")
    logger.warning("Raw output (first 200 chars): {}", text[:200])
    
    # Use the plain text as the response field, leave interpreted_question empty
    return AgentResponse(
        interpreted_question=(fallback_interpreted_question or "").strip(),
        response=text[:1000]  # Limit response length to avoid huge outputs
    )


def _validate_and_extract_response(
    parsed: dict,
    raw_output: str,
    fallback_interpreted_question: str = "",
) -> AgentResponse:
    """
    Validate and extract fields from parsed JSON object.
    
    Args:
        parsed: Parsed JSON dict
        raw_output: Original raw output (for logging)
        
    Returns:
        AgentResponse with validated fields
        
    Raises:
        ValueError: If validation fails
    """
    # Validate schema
    if not isinstance(parsed, dict):
        logger.error("Agent response JSON is not a dict, got: {}", type(parsed).__name__)
        raise ValueError("Agent response JSON must be an object/dict")
    
    interpreted_question = parsed.get("interpreted_question", "").strip()
    response = parsed.get("response", "").strip()

    if not interpreted_question and fallback_interpreted_question:
        interpreted_question = fallback_interpreted_question.strip()
    
    # Both fields should be present and non-empty for valid JSON response
    if not interpreted_question or not response:
        logger.warning("Agent JSON missing required fields or has empty values")
        logger.warning("interpreted_question present: {}", bool(interpreted_question))
        logger.warning("response present: {}", bool(response))
        
        # If we're missing fields but have a response, still return it
        # interpreted_question can be empty (use original)
        if response:
            logger.info("Using response field even though interpreted_question is missing")
            return AgentResponse(
                interpreted_question=interpreted_question or "",
                response=response
            )
        raise ValueError("Agent response missing required 'response' field or it's empty")
    
    # Validate both are strings
    if not isinstance(interpreted_question, str):
        logger.error("'interpreted_question' must be a string, got: {}", type(interpreted_question).__name__)
        raise ValueError("Field 'interpreted_question' must be a string")
    
    if not isinstance(response, str):
        logger.error("'response' must be a string, got: {}", type(response).__name__)
        raise ValueError("Field 'response' must be a string")
    
    logger.debug("Successfully parsed agent JSON response")
    logger.debug("Interpreted question (first 100 chars): {}", interpreted_question[:100] if interpreted_question else "(empty)")
    logger.debug("Response (first 100 chars): {}", response[:100])
    
    return AgentResponse(
        interpreted_question=interpreted_question,
        response=response
    )


def _map_role_to_langchain_message(message: ConversationMessage) -> BaseMessage | None:
    role = message.role.strip().lower()
    if role in {"user", "human"}:
        return HumanMessage(content=message.text)
    if role == "system":
        return AIMessage(content=message.text)

    logger.warning("Skipping unsupported message role in history: {}", message.role)
    return None


def _set_request_timezone(timezone: str) -> None:
    """Cache timezone for the current request to avoid redundant lookups."""
    _request_timezone_cache.set(timezone)


def _get_cached_timezone(uid: str) -> Optional[str]:
    """Get timezone from cache if available, otherwise fetch from Google Calendar."""
    cached = _request_timezone_cache.get()
    if cached:
        logger.info("Using cached timezone for request: {}", cached)
        return cached
    
    # Not in cache, fetch from Google Calendar
    try:
        user_timezone = get_user_calendar_timezone(uid=uid)
        if user_timezone and user_timezone.strip().lower() != "unknown":
            _set_request_timezone(user_timezone)
            logger.info("Retrieved and cached user timezone from Google Calendar: {}", user_timezone)
            return user_timezone
    except Exception as exc:
        logger.warning("Failed to retrieve user timezone from Google Calendar: {}", exc)
    
    return None


def _build_llm():
    if os.getenv("VERCEL_OIDC_TOKEN"):
        return ChatOpenAI(
            model=agent_settings.agent_llm_model,
            temperature=agent_settings.agent_llm_temperature,
            timeout=agent_settings.agent_llm_timeout_seconds,
            api_key=os.getenv("VERCEL_OIDC_TOKEN"),
            base_url="https://ai-gateway.vercel.sh/v1",
        )
    return ChatOllama(
        model=agent_settings.agent_llm_model,
        temperature=agent_settings.agent_llm_temperature,
        timeout=agent_settings.agent_llm_timeout_seconds,
    )


def _looks_like_internal_protocol_leak(output_text: str) -> bool:
    normalized = output_text.lower().strip()
    leak_markers = (
        "no calendar functions are needed",
        "no calendar tools are needed",
        "i don't need to call any functions",
        "to follow the format",
        '"name": "<nil>"',
        '"parameters": {}',
        "function-calling",
        "tool call",
        "tool output",
    )
    return any(marker in normalized for marker in leak_markers)


@trace_span("build_langchain_history_messages")
def build_langchain_history_messages(
    history: List[ConversationMessage],
) -> List[BaseMessage]:
    results: List[BaseMessage] = []
    for item in history:
        converted = _map_role_to_langchain_message(item)
        if converted is not None:
            results.append(converted)
    return results


@trace_span("build_calendar_agent")
def build_calendar_agent(uid: str, user_timezone: str, user_location: Optional[tuple[float, float]] = None):
    """Build a calendar agent that can handle calendar operations, location-based services, and general conversations.
    
    Args:
        uid: User ID for calendar operations
        user_timezone: User's timezone for proper time handling
        user_location: User's geolocation as (latitude, longitude) tuple from browser geolocation API
        
    Returns:
        A calendar agent instance
    """
    # Build calendar tools (cached by uid)
    cleaned_uid = uid.strip()
    calendar_tools = list(_get_cached_calendar_tools(cleaned_uid))
    
    # Build location tools if API key is available
    location_tools = []
    if agent_settings.google_places_api_key:
        try:
            location_tools = list(
                _get_cached_location_tools(
                    agent_settings.google_places_api_key.strip(),
                    user_location,
                )
            )
        except ValueError as exc:
            logger.warning("Could not build location tools: {}", exc)
    
    # Combine all tools
    all_tools = calendar_tools + location_tools
    
    system_prompt = build_system_prompt(user_timezone=user_timezone, user_location=user_location)
    llm = _build_llm()

    agent = create_agent(
        model=llm,
        tools=all_tools,
        system_prompt=system_prompt,
    )
    return agent


@trace_span("invoke_calendar_agent")
def invoke_calendar_agent(
    uid: str,
    user_timezone: str,
    user_message: str,
    chat_history: List[BaseMessage],
    user_location: Optional[tuple[float, float]] = None,
) -> AgentResponse:
    """Invoke the calendar agent to handle user messages.
    
    The agent can handle both calendar-related queries and general conversation
    using detailed system prompts for proper behavior.
    
    Args:
        uid: User ID
        user_timezone: User's timezone for proper time handling
        user_message: The user's message
        chat_history: Previous messages in the conversation
        user_location: User's geolocation as (latitude, longitude) tuple
        
    Returns:
        AgentResponse with parsed interpreted_question and response
    """
    agent = build_calendar_agent(uid=uid, user_timezone=user_timezone, user_location=user_location)
    
    # Build messages list for the create_agent API
    messages = list(chat_history) + [HumanMessage(content=user_message)]
    
    # create_agent returns a CompiledStateGraph that returns messages list
    result = agent.invoke(
        {
            "messages": messages,
        }
    )

    logger.info("Agent result: {}", result)
    # extract the last message from the messages list - create_agent returns {"messages": [...]}
    output = ""
    
    if isinstance(result, dict) and "messages" in result:
        messages_list = result.get("messages", [])
        if isinstance(messages_list, list) and messages_list:
            # Find the last AIMessage with NON-EMPTY content
            # Tool-calling agents will have tool calls and tool results, so we need to find 
            # the final assistant response that actually has content
            last_ai_msg = None
            for msg in reversed(messages_list):
                if isinstance(msg, AIMessage):
                    # Check if AIMessage has content
                    msg_content = str(msg.content or "").strip()
                    if msg_content:  # Only accept AIMessages with actual content
                        last_ai_msg = msg
                        break
                elif isinstance(msg, dict) and msg.get("type") == "ai":
                    msg_content = str(msg.get("content", "")).strip()
                    if msg_content:  # Only accept AI dicts with actual content
                        last_ai_msg = msg
                        break
            
            if last_ai_msg:
                if isinstance(last_ai_msg, AIMessage):
                    output = str(last_ai_msg.content or "").strip()
                elif isinstance(last_ai_msg, dict) and "content" in last_ai_msg:
                    output = str(last_ai_msg.get("content", "")).strip()
                logger.debug("Found last non-empty AIMessage in message history")
            else:
                # Fallback: if no non-empty AIMessage found, try to get the first AIMessage
                # (which often contains the actual response before tool calls)
                for msg in messages_list:
                    if isinstance(msg, AIMessage):
                        msg_content = str(msg.content or "").strip()
                        if msg_content:
                            output = msg_content
                            logger.warning("No non-empty AIMessage at end, using first non-empty AIMessage from history")
                            break
                    elif isinstance(msg, dict) and msg.get("type") == "ai":
                        msg_content = str(msg.get("content", "")).strip()
                        if msg_content:
                            output = msg_content
                            logger.warning("No non-empty AIMessage at end, using first non-empty AI dict from history")
                            break
                
                if not output:
                    # Last resort: get the last message of any type
                    last_msg = messages_list[-1]
                    if isinstance(last_msg, BaseMessage):
                        output = str(last_msg.content or "").strip()
                        logger.warning("No non-empty AIMessage found, using last message which is: {}", type(last_msg).__name__)
                    elif isinstance(last_msg, dict) and "content" in last_msg:
                        output = str(last_msg.get("content", "")).strip()
                        logger.warning("No non-empty AIMessage found, using last dict message")
    elif isinstance(result, BaseMessage):
        # Fallback if result is directly a BaseMessage
        output = str(result.content or "").strip()
    elif isinstance(result, dict):
        # Fallback to check other common keys
        output = result.get("output", "")
        if not output:
            output = result.get("answer", "")
        if not output:
            output = result.get("text", "")
        output = str(output or "").strip()
    else:
        output = str(result or "").strip()
    
    # Log detailed info before checking for empty output
    logger.debug("Extracted output from agent: length={}, type={}", len(output), type(output))
    if output:
        logger.debug("First 500 chars of output: {}", output[:500])
    else:
        logger.error("Agent returned empty response. Result type: {}", type(result))
        if isinstance(result, dict):
            logger.error("Result dict keys: {}", list(result.keys()) if isinstance(result, dict) else "N/A")
        
        if 'messages_list' in locals() and messages_list:
            logger.error("Total messages in list: {}", len(messages_list))
            for i, msg in enumerate(messages_list):
                msg_type = type(msg).__name__
                msg_content = ""
                if hasattr(msg, 'content'):
                    msg_content = str(msg.content)[:100] if msg.content else "(empty)"
                elif isinstance(msg, dict) and 'content' in msg:
                    msg_content = str(msg.get('content', ''))[:100]
                logger.error("  Message {}: type={}, content={}", i, msg_type, msg_content)
        else:
            logger.error("Messages list: {} (not available in locals)", "N/A")
        
        raise RuntimeError("Agent returned an empty response.")

    # Parse the response to extract interpreted question and response
    try:
        parsed = _parse_agent_response(output, fallback_interpreted_question=user_message)
        logger.info("Parsed agent response - interpreted_question: {}, response: {}", 
                    parsed.interpreted_question[:50],
                    parsed.response[:50])
        return parsed
    except ValueError as exc:
        logger.error("Failed to parse agent response: {}", str(exc))
        logger.error("Agent output was: {}", output[:500] if len(output) > 500 else output)
        raise RuntimeError(f"Agent response format error: {str(exc)}")


@trace_span("run_calendar_agent_turn")
def run_calendar_agent_turn(payload: SendChatRequest, uid: str) -> SendChatResponse:
    # uid is already verified by Firebase middleware, no need to re-verify
    if not uid:
        raise ValueError("Token missing uid claim")
    
    history = load_agent_history_messages(
        uid=uid,
        conversation_id=payload.conversationId,
        latest_user_message=payload.message,
    )
    langchain_history = build_langchain_history_messages(history=history)
    
    # Extract user location from request if available
    user_location = None
    if payload.userLocation:
        user_location = (payload.userLocation.latitude, payload.userLocation.longitude)

    
    # Try to get user's timezone from Google Calendar settings
    # This is the primary source of truth for user's timezone
    user_timezone = _get_cached_timezone(uid=uid)
    
    # If we couldn't get timezone from Google Calendar, use fallback
    if not user_timezone or user_timezone.strip().lower() == "unknown":
        user_timezone = agent_settings.calendar_default_timezone
        logger.info("User timezone not found from Google Calendar; using fallback: {}", user_timezone)
    else:
        # Cache it for subsequent tool calls
        _set_request_timezone(user_timezone)
    
    try:
        agent_response = invoke_calendar_agent(
            uid=uid,
            user_timezone=user_timezone,
            user_message=payload.message,
            chat_history=langchain_history,
            user_location=user_location,
        )
    except RuntimeError as exc:
        if "empty response" in str(exc).lower():
            logger.warning("Agent returned empty response for message: {}", payload.message)
            response_text = "I'm unable to respond to that question at the moment. Could you please rephrase or ask something else?"
            corrected_message = None
        else:
            raise
    else:
        response_text = agent_response.response
        corrected_message = None
        
        # Prepare corrected message to send back to backend
        # Backend is responsible for updating Firestore
        if agent_response.interpreted_question:
            original_message = payload.message
            interpreted_message = agent_response.interpreted_question
            
            # Only process correction if there's an actual change
            if interpreted_message.lower() != original_message.lower():
                corrected_message = interpreted_message
                logger.info(
                    "Message correction applied: '{}' -> '{}'",
                    original_message[:100],
                    corrected_message[:100]
                )
            else:
                logger.debug(
                    "No message correction needed (interpreted question matches original): '{}'",
                    original_message[:100]
                )
        else:
            logger.debug("No interpreted question provided by agent")
    
    logger.info("Agent processing with timezone: {}, user_location: {}", user_timezone, user_location)
    
    # Log what we're returning to the backend
    logger.info(
        "Returning to backend - response_text: {}, corrected_message: {}",
        response_text[:100] if response_text else "EMPTY",
        corrected_message[:100] if corrected_message else "None"
    )

    if _looks_like_internal_protocol_leak(response_text):
        logger.warning(
            "Detected internal protocol leak in assistant output. "
            "This may indicate the agent is exposing internal details."
        )
    
    # Return response with optional corrected message
    return SendChatResponse.from_text(response_text, corrected_user_message=corrected_message)
