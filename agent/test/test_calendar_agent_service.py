from __future__ import annotations

from langchain_core.messages import AIMessage, HumanMessage
import pytest

import agent.calendar_agent_service as calendar_agent_service
from dto.chat_dto import SendChatRequest
from utility.firestore_utility import ConversationMessage


def test_map_role_to_langchain_message_maps_user_and_system() -> None:
    user_message = calendar_agent_service._map_role_to_langchain_message(
        ConversationMessage(role="user", text="hello")
    )
    system_message = calendar_agent_service._map_role_to_langchain_message(
        ConversationMessage(role="system", text="hi there")
    )

    assert isinstance(user_message, HumanMessage)
    assert isinstance(system_message, AIMessage)


def test_build_langchain_history_messages_skips_unknown_roles() -> None:
    history = [
        ConversationMessage(role="user", text="hello"),
        ConversationMessage(role="unknown", text="skip me"),
        ConversationMessage(role="system", text="hi"),
    ]

    result = calendar_agent_service.build_langchain_history_messages(history)

    assert len(result) == 2
    assert isinstance(result[0], HumanMessage)
    assert isinstance(result[1], AIMessage)


def test_run_calendar_agent_turn_orchestrates(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = SendChatRequest(
        uid="user-1",
        conversationId="convo-1",
        message="what is on my calendar?",
    )
    history = [ConversationMessage(role="user", text="old message")]

    monkeypatch.setattr(
        calendar_agent_service,
        "load_agent_history_messages",
        lambda uid, conversation_id, latest_user_message: history,
    )
    monkeypatch.setattr(
        calendar_agent_service,
        "build_langchain_history_messages",
        lambda history: [HumanMessage(content="old message")],
    )
    monkeypatch.setattr(
        calendar_agent_service,
        "invoke_calendar_agent",
        lambda uid, user_message, chat_history: "You have one meeting.",
    )

    response = calendar_agent_service.run_calendar_agent_turn(payload)

    assert response.responseMessage.text == "You have one meeting."


def test_build_calendar_agent_executor_builds_executor(monkeypatch: pytest.MonkeyPatch) -> None:
    captured = {}

    monkeypatch.setattr(calendar_agent_service, "build_calendar_tools", lambda uid: ["tool-a"])
    monkeypatch.setattr(calendar_agent_service, "build_system_prompt", lambda: "system prompt")
    monkeypatch.setattr(calendar_agent_service, "_build_llm", lambda: "fake-llm")

    def fake_create_tool_calling_agent(llm, tools, prompt):
        captured["agent"] = {"llm": llm, "tools": tools, "prompt": prompt}
        return "agent-instance"

    class FakeExecutor:
        def __init__(self, **kwargs):
            captured["executor_kwargs"] = kwargs

    monkeypatch.setattr(calendar_agent_service, "create_tool_calling_agent", fake_create_tool_calling_agent)
    monkeypatch.setattr(calendar_agent_service, "AgentExecutor", FakeExecutor)

    executor = calendar_agent_service.build_calendar_agent_executor("user-1")

    assert isinstance(executor, FakeExecutor)
    assert captured["agent"]["llm"] == "fake-llm"
    assert captured["agent"]["tools"] == ["tool-a"]
    assert captured["executor_kwargs"]["agent"] == "agent-instance"


def test_invoke_calendar_agent_rejects_empty_output(monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeExecutor:
        def invoke(self, payload):
            return {"output": "   "}

    monkeypatch.setattr(calendar_agent_service, "build_calendar_agent_executor", lambda uid: FakeExecutor())

    with pytest.raises(RuntimeError, match="empty response"):
        calendar_agent_service.invoke_calendar_agent("user-1", "hello", [])
