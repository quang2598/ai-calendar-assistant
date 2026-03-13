from __future__ import annotations

from typing import List

from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_ollama import ChatOllama
from loguru import logger

from config import trace_span
from dto import SendChatRequest, SendChatResponse
from utility import ConversationMessage, load_agent_history_messages
from .agent_config import agent_settings
from .system_prompt import build_system_prompt
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
def build_calendar_agent_executor(uid: str) -> AgentExecutor:
    tools = build_calendar_tools(uid=uid)
    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", build_system_prompt()),
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


@trace_span("invoke_calendar_agent")
def invoke_calendar_agent(
    uid: str,
    user_message: str,
    chat_history: List[BaseMessage],
) -> str:
    executor = build_calendar_agent_executor(uid=uid)
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


@trace_span("run_calendar_agent_turn")
def run_calendar_agent_turn(payload: SendChatRequest) -> SendChatResponse:
    history = load_agent_history_messages(
        uid=payload.uid,
        conversation_id=payload.conversationId,
        latest_user_message=payload.message,
    )
    langchain_history = build_langchain_history_messages(history=history)
    output_text = invoke_calendar_agent(
        uid=payload.uid,
        user_message=payload.message,
        chat_history=langchain_history,
    )
    return SendChatResponse.from_text(output_text)
