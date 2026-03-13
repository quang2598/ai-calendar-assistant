from __future__ import annotations

import json

import pytest

import agent.tools.calendar_tools as calendar_tools
from utility.google_calendar_utility import CalendarEvent


def test_get_user_calendar_returns_invalid_input_for_bad_datetime() -> None:
    result = calendar_tools._get_user_calendar_impl(
        uid="user-1",
        start_time="bad-datetime",
        end_time=None,
        timezone=None,
        calendar_id=None,
        max_results=20,
    )

    payload = json.loads(result)
    assert payload["status"] == "invalid_input"


def test_add_event_to_calendar_returns_missing_fields() -> None:
    result = calendar_tools._add_event_to_calendar_impl(
        uid="user-1",
        title=None,
        start_time=None,
        end_time=None,
        timezone=None,
        description=None,
        location=None,
        calendar_id=None,
    )

    payload = json.loads(result)
    assert payload["status"] == "missing_fields"
    assert payload["missing_fields"] == ["title", "start_time", "end_time"]


def test_add_event_to_calendar_returns_created_event(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        calendar_tools,
        "create_user_calendar_event",
        lambda uid, request: CalendarEvent(
            event_id="evt-1",
            title=request.title,
            start=request.start_time.isoformat(),
            end=request.end_time.isoformat(),
            status="confirmed",
        ),
    )

    result = calendar_tools._add_event_to_calendar_impl(
        uid="user-1",
        title="Planning",
        start_time="2026-03-13T09:00:00+00:00",
        end_time="2026-03-13T10:00:00+00:00",
        timezone=None,
        description=None,
        location=None,
        calendar_id=None,
    )

    payload = json.loads(result)
    assert payload["status"] == "success"
    assert payload["event"]["title"] == "Planning"


def test_get_user_calendar_returns_events(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        calendar_tools,
        "list_user_calendar_events",
        lambda **kwargs: [
            CalendarEvent(
                event_id="evt-1",
                title="Sync",
                start="2026-03-13T09:00:00+00:00",
                end="2026-03-13T10:00:00+00:00",
                status="confirmed",
            )
        ],
    )

    result = calendar_tools._get_user_calendar_impl(
        uid="user-1",
        start_time="2026-03-13T09:00:00+00:00",
        end_time="2026-03-14T09:00:00+00:00",
        timezone=None,
        calendar_id=None,
        max_results=20,
    )

    payload = json.loads(result)
    assert payload["status"] == "success"
    assert payload["event_count"] == 1


def test_get_user_calendar_returns_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        calendar_tools,
        "list_user_calendar_events",
        lambda **kwargs: (_ for _ in ()).throw(RuntimeError("boom")),
    )

    result = calendar_tools._get_user_calendar_impl(
        uid="user-1",
        start_time=None,
        end_time=None,
        timezone=None,
        calendar_id=None,
        max_results=20,
    )

    payload = json.loads(result)
    assert payload["status"] == "error"


def test_add_event_to_calendar_invalid_datetime() -> None:
    result = calendar_tools._add_event_to_calendar_impl(
        uid="user-1",
        title="Planning",
        start_time="bad",
        end_time="2026-03-13T10:00:00+00:00",
        timezone=None,
        description=None,
        location=None,
        calendar_id=None,
    )

    payload = json.loads(result)
    assert payload["status"] == "invalid_input"


def test_build_calendar_tools_rejects_empty_uid() -> None:
    with pytest.raises(ValueError):
        calendar_tools.build_calendar_tools("   ")


def test_build_calendar_tools_binds_uid() -> None:
    tools = calendar_tools.build_calendar_tools("user-1")

    assert [tool.name for tool in tools] == ["get_user_calendar", "add_event_to_calendar"]
