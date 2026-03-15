from __future__ import annotations

import re
from typing import List

from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_ollama import ChatOllama
from loguru import logger

from config import trace_span
from dto import SendChatRequest, SendChatResponse
from utility import ConversationMessage, get_user_calendar_timezone, load_agent_history_messages
from .agent_config import agent_settings
from .system_prompt import (
    build_general_conversation_system_prompt,
    build_system_prompt,
)
from .tools import build_calendar_tools



def _map_role_to_langchain_message(message: ConversationMessage) -> BaseMessage | None:
    role = message.role.strip().lower()
    if role in {"user", "human"}:
        return HumanMessage(content=message.text)
    if role == "system":
        return AIMessage(content=message.text)

    logger.warning("Skipping unsupported message role in history: {}", message.role)
    return None

def _build_llm():
    return ChatOllama(
        model=agent_settings.agent_llm_model,
        temperature=agent_settings.agent_llm_temperature,
        timeout=agent_settings.agent_llm_timeout_seconds,
    )


def _normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().lower())


def _contains_calendar_intent(user_message: str) -> bool:
    normalized = _normalize_text(user_message)
    calendar_keywords = (
        "calendar",
        "schedule",
        "event",
        "meeting",
        "availability",
        "available",
        "busy",
        "free",
        "appointment",
        "book",
        "reschedule",
        "move ",
        "invite",
        "tomorrow",
        "today",
        "tonight",
        "next week",
        "this week",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
    )
    if any(keyword in normalized for keyword in calendar_keywords):
        return True
    return re.search(r"\b\d{1,2}(:\d{2})?\s?(am|pm)\b", normalized) is not None


def _is_general_conversation_turn(user_message: str) -> bool:
    normalized = _normalize_text(user_message)
    if not normalized or _contains_calendar_intent(normalized):
        return False

    general_patterns = (
        r"^(hi|hello|hey|yo)\b[!. ]*$",
        r"^(hi|hello|hey)\b.*\b(there|again|everyone|friend)\b[!. ]*$",
        r"^good (morning|afternoon|evening|night)\b[!. ]*$",
        r"^how are you\b.*$",
        r"^i am\b.*\bhow about you\b.*$",
        r"^what'?s up\b.*$",
        r"^thanks\b.*$",
        r"^thank you\b.*$",
        r"^nice to meet you\b.*$",
    )
    return any(re.match(pattern, normalized) for pattern in general_patterns)


def _looks_like_internal_protocol_leak(output_text: str) -> bool:
    normalized = _normalize_text(output_text)
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


@trace_span("build_calendar_agent_executor")
def build_calendar_agent_executor(uid: str, user_timezone: str) -> AgentExecutor:
    tools = build_calendar_tools(uid=uid)
    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", build_system_prompt(user_timezone=user_timezone)),
            MessagesPlaceholder(variable_name="chat_history"),
            ("human", "{input}"),
            MessagesPlaceholder(variable_name="agent_scratchpad"),
        ]
    )

    llm = _build_llm()

    agent = create_tool_calling_agent(
        llm=llm,
        tools=tools,
        prompt=prompt,
    )
    return AgentExecutor(
        agent=agent,
        tools=tools,
        max_iterations=agent_settings.agent_max_iterations,
        handle_parsing_errors=True,
        verbose=False,
    )


def _build_conversation_prompt(user_timezone: str) -> ChatPromptTemplate:
    return ChatPromptTemplate.from_messages(
        [
            ("system", build_general_conversation_system_prompt(user_timezone=user_timezone)),
            MessagesPlaceholder(variable_name="chat_history"),
            ("human", "{input}"),
        ]
    )


@trace_span("invoke_calendar_agent")
def invoke_calendar_agent(
    uid: str,
    user_timezone: str,
    user_message: str,
    chat_history: List[BaseMessage],
) -> str:
    executor = build_calendar_agent_executor(uid=uid, user_timezone=user_timezone)
    result = executor.invoke(
        {
            "input": user_message,
            "chat_history": chat_history,
        }
    )

    output = str(result.get("output", "")).strip()
    if not output:
        raise RuntimeError("Agent returned an empty response.")
    return output


@trace_span("invoke_conversation_reply")
def invoke_conversation_reply(
    user_timezone: str,
    user_message: str,
    chat_history: List[BaseMessage],
) -> str:
    prompt = _build_conversation_prompt(user_timezone=user_timezone)
    llm = _build_llm()
    response = (prompt | llm).invoke(
        {
            "input": user_message,
            "chat_history": chat_history,
        }
    )
    output = str(getattr(response, "content", "")).strip()
    if not output:
        raise RuntimeError("Assistant returned an empty conversational response.")
    return output


@trace_span("run_calendar_agent_turn")
def run_calendar_agent_turn(payload: SendChatRequest) -> SendChatResponse:
    history = load_agent_history_messages(
        uid=payload.uid,
        conversation_id=payload.conversationId,
        latest_user_message=payload.message,
    )
    langchain_history = build_langchain_history_messages(history=history)
    user_timezone = get_user_calendar_timezone(uid=payload.uid)
    if _is_general_conversation_turn(payload.message):
        output_text = invoke_conversation_reply(
            user_timezone=user_timezone,
            user_message=payload.message,
            chat_history=langchain_history,
        )
    else:
        output_text = invoke_calendar_agent(
            uid=payload.uid,
            user_timezone=user_timezone,
            user_message=payload.message,
            chat_history=langchain_history,
        )
        if _looks_like_internal_protocol_leak(output_text):
            logger.warning(
                "Detected internal protocol leak in assistant output; retrying without tools."
            )
            output_text = invoke_conversation_reply(
                user_timezone=user_timezone,
                user_message=payload.message,
                chat_history=langchain_history,
            )
    return SendChatResponse.from_text(output_text)
