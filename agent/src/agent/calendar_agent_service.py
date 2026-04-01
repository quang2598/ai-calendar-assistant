from __future__ import annotations

import os
from typing import List, Optional

from langchain.agents import create_agent
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langchain_ollama import ChatOllama
from langchain_openai import ChatOpenAI
from loguru import logger

from config import trace_span
from dto import SendChatRequest, SendChatResponse
from utility import ConversationMessage, get_user_calendar_timezone, load_agent_history_messages
from .agent_config import agent_settings
from .system_prompt import build_system_prompt
from .tools import build_calendar_tools, build_location_tools
import os
from langchain_openai import ChatOpenAI



def _map_role_to_langchain_message(message: ConversationMessage) -> BaseMessage | None:
    role = message.role.strip().lower()
    if role in {"user", "human"}:
        return HumanMessage(content=message.text)
    if role == "system":
        return AIMessage(content=message.text)

    logger.warning("Skipping unsupported message role in history: {}", message.role)
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
    # Build calendar tools
    calendar_tools = build_calendar_tools(uid=uid)
    
    # Build location tools if API key is available
    location_tools = []
    if agent_settings.google_places_api_key:
        try:
            location_tools = build_location_tools(
                google_places_api_key=agent_settings.google_places_api_key,
                user_location=user_location,
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
) -> str:
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
        The agent's response
    """
    agent = build_calendar_agent(uid=uid, user_timezone=user_timezone, user_location=user_location)
    
    # Build messages list for the new API
    messages = list(chat_history) + [HumanMessage(content=user_message)]
    
    result = agent.invoke(
        {
            "messages": messages,
        }
    )

    # The new create_agent API returns various formats
    output = ""
    
    # If it's a BaseMessage, extract content
    if isinstance(result, BaseMessage):
        output = str(result.content or "").strip()
    # If it's a dict, check multiple possible keys
    elif isinstance(result, dict):
        output = result.get("output", "")
        if not output:
            output = result.get("messages", "")
        if isinstance(output, list) and output:
            # If messages is a list, get the last message's content
            last_msg = output[-1]
            if isinstance(last_msg, BaseMessage):
                output = str(last_msg.content or "").strip()
            elif isinstance(last_msg, dict):
                output = str(last_msg.get("content", "")).strip()
        output = str(output or "").strip()
    else:
        output = str(result or "").strip()
    
    if not output:
        raise RuntimeError("Agent returned an empty response.")
    return output


@trace_span("run_calendar_agent_turn")
def run_calendar_agent_turn(payload: SendChatRequest, uid: str) -> SendChatResponse:
    history = load_agent_history_messages(
        uid=uid,
        conversation_id=payload.conversationId,
        latest_user_message=payload.message,
    )
    langchain_history = build_langchain_history_messages(history=history)
    
    # Limit to 6 most recent messages (3 user + 3 agent)
    if len(langchain_history) > 6:
        langchain_history = langchain_history[-6:]
    
    # Extract user location from request if available
    user_location = None
    if payload.userLocation:
        user_location = (payload.userLocation.latitude, payload.userLocation.longitude)

    
    # Try to get user's timezone from Google Calendar settings
    # This is the primary source of truth for user's timezone
    user_timezone = None
    try:
        user_timezone = get_user_calendar_timezone(uid=uid)
        if user_timezone and user_timezone.strip().lower() != "unknown":
            logger.info("Retrieved user timezone from Google Calendar: {}", user_timezone)
    except Exception as exc:
        logger.warning("Failed to retrieve user timezone from Google Calendar: {}", exc)
    
    # If we couldn't get timezone from Google Calendar, check if it's been established in the conversation
    if not user_timezone or user_timezone.strip().lower() == "unknown":
        # Check conversation history for timezone information
        # Look for patterns in previous responses that might indicate user has provided timezone
        for msg in history:
            msg_lower = msg.text.lower()
            # Check if user has mentioned common timezone indicators
            if any(tz_indicator in msg_lower for tz_indicator in [
                "america/", "europe/", "asia/", "australia/", "pacific/",
                "utc", "est", "cst", "mst", "pst", "gmt", "timezone"
            ]):
                # User has mentioned timezone info in conversation
                logger.info("Detected potential timezone mention in conversation history")
                break
        
        # Fallback to agent settings default, but mark as fallback
        user_timezone = agent_settings.calendar_default_timezone
        logger.info("User timezone not explicitly set; will use fallback and may prompt user: {}", user_timezone)
    output_text = invoke_calendar_agent(
        uid=uid,
        user_timezone=user_timezone,
        user_message=payload.message,
        chat_history=langchain_history,
        user_location=user_location,
    )
    logger.info("Agent received user message with timezone: {}, user_location: {}", user_timezone, user_location)

    if _looks_like_internal_protocol_leak(output_text):
        logger.warning(
            "Detected internal protocol leak in assistant output. "
            "This may indicate the agent is exposing internal details."
        )
    return SendChatResponse.from_text(output_text)
