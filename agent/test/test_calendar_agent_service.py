from __future__ import annotations

from langchain_core.messages import AIMessage, HumanMessage
import pytest

import agent.service.calendar_agent_service as calendar_agent_service
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
        "get_user_calendar_timezone",
        lambda uid: "America/Chicago",
    )
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
        lambda uid, user_timezone, user_message, chat_history: "You have one meeting.",
    )

    response = calendar_agent_service.run_calendar_agent_turn(payload)

    assert response.responseMessage.text == "You have one meeting."


def test_build_calendar_agent_executor_builds_executor(monkeypatch: pytest.MonkeyPatch) -> None:
    captured = {}

    monkeypatch.setattr(calendar_agent_service, "build_calendar_tools", lambda uid: ["tool-a"])
    monkeypatch.setattr(
        calendar_agent_service,
        "build_system_prompt",
        lambda user_timezone=None: f"system prompt::{user_timezone}",
    )
    monkeypatch.setattr(calendar_agent_service, "_build_llm", lambda: "fake-llm")

    def fake_create_tool_calling_agent(llm, tools, prompt):
        captured["agent"] = {"llm": llm, "tools": tools, "prompt": prompt}
        return "agent-instance"

    class FakeExecutor:
        def __init__(self, **kwargs):
            captured["executor_kwargs"] = kwargs

    monkeypatch.setattr(calendar_agent_service, "create_tool_calling_agent", fake_create_tool_calling_agent)
    monkeypatch.setattr(calendar_agent_service, "AgentExecutor", FakeExecutor)

    executor = calendar_agent_service.build_calendar_agent_executor("user-1", "America/Chicago")

    assert isinstance(executor, FakeExecutor)
    assert captured["agent"]["llm"] == "fake-llm"
    assert captured["agent"]["tools"] == ["tool-a"]
    assert captured["executor_kwargs"]["agent"] == "agent-instance"


def test_build_conversation_prompt_uses_general_conversation_system_prompt(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        calendar_agent_service,
        "build_general_conversation_system_prompt",
        lambda user_timezone=None: f"general prompt::{user_timezone}",
    )

    prompt = calendar_agent_service._build_conversation_prompt("America/Chicago")
    rendered = prompt.format(chat_history=[], input="hello there")

    assert "general prompt::America/Chicago" in rendered


def test_invoke_calendar_agent_rejects_empty_output(monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeExecutor:
        def invoke(self, payload):
            return {"output": "   "}

    monkeypatch.setattr(
        calendar_agent_service,
        "build_calendar_agent_executor",
        lambda uid, user_timezone: FakeExecutor(),
    )

    with pytest.raises(RuntimeError, match="empty response"):
        calendar_agent_service.invoke_calendar_agent("user-1", "America/Chicago", "hello", [])


def test_general_conversation_turn_detection() -> None:
    assert calendar_agent_service._is_general_conversation_turn("hello there")
    assert calendar_agent_service._is_general_conversation_turn("how are you?")
    assert calendar_agent_service._is_general_conversation_turn("I am really great, how about you?")
    assert not calendar_agent_service._is_general_conversation_turn("what is on my calendar tomorrow?")


def test_internal_protocol_leak_detection() -> None:
    assert calendar_agent_service._looks_like_internal_protocol_leak(
        'I do not need to call any functions. {"name": "<nil>", "parameters": {}}'
    )
    assert calendar_agent_service._looks_like_internal_protocol_leak(
        "No calendar functions are needed for this question."
    )
    assert not calendar_agent_service._looks_like_internal_protocol_leak("Hello there, how can I help?")


def test_run_calendar_agent_turn_uses_conversation_path_for_general_chat(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = SendChatRequest(
        uid="user-1",
        conversationId="convo-1",
        message="hello there",
    )
    history = [ConversationMessage(role="system", text="hi")]

    monkeypatch.setattr(calendar_agent_service, "get_user_calendar_timezone", lambda uid: "America/Chicago")
    monkeypatch.setattr(
        calendar_agent_service,
        "load_agent_history_messages",
        lambda uid, conversation_id, latest_user_message: history,
    )
    monkeypatch.setattr(
        calendar_agent_service,
        "build_langchain_history_messages",
        lambda history: [AIMessage(content="hi")],
    )
    calls = {"conversation": 0, "calendar": 0}
    monkeypatch.setattr(
        calendar_agent_service,
        "invoke_conversation_reply",
        lambda user_timezone, user_message, chat_history: calls.__setitem__("conversation", calls["conversation"] + 1)
        or "Hello!",
    )
    monkeypatch.setattr(
        calendar_agent_service,
        "invoke_calendar_agent",
        lambda uid, user_timezone, user_message, chat_history: calls.__setitem__("calendar", calls["calendar"] + 1)
        or "calendar",
    )

    response = calendar_agent_service.run_calendar_agent_turn(payload)

    assert response.responseMessage.text == "Hello!"
    assert calls == {"conversation": 1, "calendar": 0}


def test_run_calendar_agent_turn_falls_back_when_protocol_leaks(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = SendChatRequest(
        uid="user-1",
        conversationId="convo-1",
        message="hi there one more time",
    )

    monkeypatch.setattr(calendar_agent_service, "get_user_calendar_timezone", lambda uid: "America/Chicago")
    monkeypatch.setattr(
        calendar_agent_service,
        "load_agent_history_messages",
        lambda uid, conversation_id, latest_user_message: [],
    )
    monkeypatch.setattr(
        calendar_agent_service,
        "build_langchain_history_messages",
        lambda history: [],
    )
    monkeypatch.setattr(
        calendar_agent_service,
        "invoke_calendar_agent",
        lambda uid, user_timezone, user_message, chat_history: 'To follow the format, {"name": "<nil>", "parameters": {}}',
    )
    monkeypatch.setattr(
        calendar_agent_service,
        "invoke_conversation_reply",
        lambda user_timezone, user_message, chat_history: "Hi again.",
    )

    response = calendar_agent_service.run_calendar_agent_turn(payload)

    assert response.responseMessage.text == "Hi again."
