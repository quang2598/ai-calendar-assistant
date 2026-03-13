from __future__ import annotations

import asyncio

from fastapi import Request
from fastapi.testclient import TestClient

import main
from dto.chat_dto import SendChatResponse


client = TestClient(main.app)


def test_map_runtime_error_to_http_for_auth_required() -> None:
    exc = main._map_runtime_error_to_http(RuntimeError("Google token document is missing for user"))

    assert exc.status_code == 401
    assert exc.detail["code"] == "calendar_auth_required"


def test_map_runtime_error_to_http_other_branches() -> None:
    invalid = main._map_runtime_error_to_http(RuntimeError("Invalid timezone: bad"))
    provider = main._map_runtime_error_to_http(RuntimeError("Failed to create calendar event: boom"))
    denied = main._map_runtime_error_to_http(RuntimeError("403 calendar access denied"))
    fallback = main._map_runtime_error_to_http(RuntimeError("unknown"))

    assert invalid.status_code == 422
    assert provider.status_code == 502
    assert denied.status_code == 403
    assert fallback.status_code == 500


def test_send_chat_endpoint_returns_agent_response(monkeypatch) -> None:
    monkeypatch.setattr(
        main,
        "run_calendar_agent_turn",
        lambda payload: SendChatResponse.from_text("hello from agent"),
    )

    response = client.post(
        "/agent/send-chat",
        json={
            "uid": "user-1",
            "conversationId": "convo-1",
            "message": "hello",
        },
    )

    assert response.status_code == 200
    assert response.json() == {"responseMessage": {"text": "hello from agent"}}


def test_send_chat_endpoint_maps_runtime_errors(monkeypatch) -> None:
    monkeypatch.setattr(
        main,
        "run_calendar_agent_turn",
        lambda payload: (_ for _ in ()).throw(RuntimeError("Unable to refresh Google access token")),
    )

    response = client.post(
        "/agent/send-chat",
        json={
            "uid": "user-1",
            "conversationId": "convo-1",
            "message": "hello",
        },
    )

    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "calendar_auth_refresh_failed"


def test_send_chat_endpoint_maps_value_errors(monkeypatch) -> None:
    monkeypatch.setattr(
        main,
        "run_calendar_agent_turn",
        lambda payload: (_ for _ in ()).throw(ValueError("bad request")),
    )

    response = client.post(
        "/agent/send-chat",
        json={
            "uid": "user-1",
            "conversationId": "convo-1",
            "message": "hello",
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "invalid_request"


def test_validation_exception_handler_returns_expected_shape() -> None:
    response = client.post(
        "/agent/send-chat",
        json={
            "uid": "user-1",
            "message": "hello",
        },
    )

    assert response.status_code == 422
    assert "detail" in response.json()


def test_generic_exception_handler_returns_expected_shape() -> None:
    request = Request(scope={"type": "http"})
    response = asyncio.run(main.generic_exception_handler(request, Exception("boom")))

    assert response.status_code == 500
