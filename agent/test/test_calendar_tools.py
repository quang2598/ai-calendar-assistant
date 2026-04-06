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
        invitees=None,
        calendar_id=None,
    )

    payload = json.loads(result)
    assert payload["status"] == "missing_fields"
    assert payload["missing_fields"] == ["title", "start_time", "end_time"]


def test_add_event_to_calendar_returns_created_event(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(calendar_tools, "get_user_calendar_timezone", lambda uid, calendar_id=None: "America/Chicago")
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
        invitees=["alex@example.com", "sam@example.com"],
        calendar_id=None,
    )

    payload = json.loads(result)
    assert payload["status"] == "success"
    assert payload["event"]["title"] == "Planning"
    assert payload["timezone_used"] == "America/Chicago"


def test_get_user_calendar_returns_events(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(calendar_tools, "get_user_calendar_timezone", lambda uid, calendar_id=None: "America/Chicago")
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
                invitees=["alex@example.com"],
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
    assert payload["events"][0]["invitees"] == ["alex@example.com"]
    assert payload["timezone_used"] == "America/Chicago"


def test_get_user_calendar_returns_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(calendar_tools, "get_user_calendar_timezone", lambda uid, calendar_id=None: "America/Chicago")
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
        invitees=None,
        calendar_id=None,
    )

    payload = json.loads(result)
    assert payload["status"] == "invalid_input"


def test_get_user_calendar_uses_explicit_timezone_without_lookup(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = {"timezone_lookup": 0}
    monkeypatch.setattr(
        calendar_tools,
        "get_user_calendar_timezone",
        lambda uid, calendar_id=None: calls.__setitem__("timezone_lookup", calls["timezone_lookup"] + 1) or "America/Chicago",
    )
    captured = {}
    monkeypatch.setattr(
        calendar_tools,
        "list_user_calendar_events",
        lambda **kwargs: captured.update(kwargs) or [],
    )

    result = calendar_tools._get_user_calendar_impl(
        uid="user-1",
        start_time=None,
        end_time=None,
        timezone="Europe/London",
        calendar_id=None,
        max_results=20,
    )

    payload = json.loads(result)
    assert payload["status"] == "success"
    assert payload["timezone_used"] == "Europe/London"
    assert captured["timezone_name"] == "Europe/London"
    assert calls["timezone_lookup"] == 0


def test_add_event_to_calendar_resolves_timezone_when_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(calendar_tools, "get_user_calendar_timezone", lambda uid, calendar_id=None: "America/Chicago")
    captured = {}
    monkeypatch.setattr(
        calendar_tools,
        "create_user_calendar_event",
        lambda uid, request: captured.update({"timezone_name": request.timezone_name})
        or CalendarEvent(
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
        invitees=None,
        calendar_id=None,
    )

    payload = json.loads(result)
    assert payload["status"] == "success"
    assert payload["timezone_used"] == "America/Chicago"
    assert captured["timezone_name"] == "America/Chicago"


def test_add_event_to_calendar_passes_invitees(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(calendar_tools, "get_user_calendar_timezone", lambda uid, calendar_id=None: "America/Chicago")
    captured = {}
    monkeypatch.setattr(
        calendar_tools,
        "create_user_calendar_event",
        lambda uid, request: captured.update({"invitees": request.invitees})
        or CalendarEvent(
            event_id="evt-1",
            title=request.title,
            start=request.start_time.isoformat(),
            end=request.end_time.isoformat(),
            status="confirmed",
            invitees=request.invitees,
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
        invitees=["alex@example.com", "sam@example.com"],
        calendar_id=None,
    )

    payload = json.loads(result)
    assert payload["status"] == "success"
    assert payload["event"]["invitees"] == ["alex@example.com", "sam@example.com"]
    assert captured["invitees"] == ["alex@example.com", "sam@example.com"]


def test_add_event_to_calendar_preserves_local_wall_clock_time_for_timezone(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(calendar_tools, "get_user_calendar_timezone", lambda uid, calendar_id=None: "America/Chicago")
    captured = {}
    monkeypatch.setattr(
        calendar_tools,
        "create_user_calendar_event",
        lambda uid, request: captured.update(
            {
                "start_time": request.start_time,
                "end_time": request.end_time,
                "timezone_name": request.timezone_name,
            }
        )
        or CalendarEvent(
            event_id="evt-1",
            title=request.title,
            start="2026-03-15T10:00:00-05:00",
            end="2026-03-15T11:00:00-05:00",
            status="confirmed",
        ),
    )

    result = calendar_tools._add_event_to_calendar_impl(
        uid="user-1",
        title="Get a haircut",
        start_time="2026-03-15T10:00:00+00:00",
        end_time="2026-03-15T11:00:00+00:00",
        timezone="America/Chicago",
        description=None,
        location=None,
        invitees=None,
        calendar_id=None,
    )

    payload = json.loads(result)
    assert payload["status"] == "success"
    assert captured["timezone_name"] == "America/Chicago"
    assert captured["start_time"].tzinfo is None
    assert captured["end_time"].tzinfo is None
    assert payload["event"]["start"] == "2026-03-15T10:00:00-05:00"


def test_add_event_to_calendar_capitalizes_business_name_in_title(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(calendar_tools, "get_user_calendar_timezone", lambda uid, calendar_id=None: "America/Chicago")
    captured = {}
    monkeypatch.setattr(
        calendar_tools,
        "create_user_calendar_event",
        lambda uid, request: captured.update({"title": request.title})
        or CalendarEvent(
            event_id="evt-1",
            title=request.title,
            start=request.start_time.isoformat(),
            end=request.end_time.isoformat(),
            status="confirmed",
        ),
    )

    result = calendar_tools._add_event_to_calendar_impl(
        uid="user-1",
        title="Dinner at pho the good times asian bistro",
        start_time="2026-03-13T09:00:00+00:00",
        end_time="2026-03-13T10:00:00+00:00",
        timezone=None,
        description=None,
        location=None,
        invitees=None,
        calendar_id=None,
    )

    payload = json.loads(result)
    assert payload["status"] == "success"
    assert payload["event"]["title"] == "Dinner at Pho The Good Times Asian Bistro"
    assert captured["title"] == "Dinner at Pho The Good Times Asian Bistro"


def test_add_event_to_calendar_derives_business_name_from_location(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(calendar_tools, "get_user_calendar_timezone", lambda uid, calendar_id=None: "America/Chicago")
    captured = {}
    monkeypatch.setattr(
        calendar_tools,
        "create_user_calendar_event",
        lambda uid, request: captured.update({"title": request.title})
        or CalendarEvent(
            event_id="evt-1",
            title=request.title,
            start=request.start_time.isoformat(),
            end=request.end_time.isoformat(),
            status="confirmed",
        ),
    )

    result = calendar_tools._add_event_to_calendar_impl(
        uid="user-1",
        title="Dinner",
        start_time="2026-03-13T09:00:00+00:00",
        end_time="2026-03-13T10:00:00+00:00",
        timezone=None,
        description=None,
        location="pho the good times asian bistro, 1395 University Street, Eugene",
        invitees=None,
        calendar_id=None,
    )

    payload = json.loads(result)
    assert payload["status"] == "success"
    assert payload["event"]["title"] == "Dinner at Pho The Good Times Asian Bistro"
    assert captured["title"] == "Dinner at Pho The Good Times Asian Bistro"


def test_add_event_to_calendar_replaces_address_suffix_with_business_name(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(calendar_tools, "get_user_calendar_timezone", lambda uid, calendar_id=None: "America/Chicago")
    captured = {}
    monkeypatch.setattr(
        calendar_tools,
        "create_user_calendar_event",
        lambda uid, request: captured.update({"title": request.title})
        or CalendarEvent(
            event_id="evt-1",
            title=request.title,
            start=request.start_time.isoformat(),
            end=request.end_time.isoformat(),
            status="confirmed",
        ),
    )

    result = calendar_tools._add_event_to_calendar_impl(
        uid="user-1",
        title="Dinner at 1395 University Street, Eugene",
        start_time="2026-03-13T09:00:00+00:00",
        end_time="2026-03-13T10:00:00+00:00",
        timezone=None,
        description=None,
        location="pho the good times asian bistro, 1395 University Street, Eugene",
        invitees=None,
        calendar_id=None,
    )

    payload = json.loads(result)
    assert payload["status"] == "success"
    assert payload["event"]["title"] == "Dinner at Pho The Good Times Asian Bistro"
    assert captured["title"] == "Dinner at Pho The Good Times Asian Bistro"


def test_add_event_to_calendar_sets_location_from_business_name_when_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(calendar_tools, "get_user_calendar_timezone", lambda uid, calendar_id=None: "America/Chicago")
    captured = {}
    monkeypatch.setattr(
        calendar_tools,
        "create_user_calendar_event",
        lambda uid, request: captured.update({"location": request.location})
        or CalendarEvent(
            event_id="evt-1",
            title=request.title,
            start=request.start_time.isoformat(),
            end=request.end_time.isoformat(),
            status="confirmed",
            location=request.location,
        ),
    )

    result = calendar_tools._add_event_to_calendar_impl(
        uid="user-1",
        title="Dinner at pho the good times asian bistro",
        start_time="2026-03-13T09:00:00+00:00",
        end_time="2026-03-13T10:00:00+00:00",
        timezone=None,
        description=None,
        location=None,
        invitees=None,
        calendar_id=None,
    )

    payload = json.loads(result)
    assert payload["status"] == "success"
    assert payload["event"]["location"] == "Pho The Good Times Asian Bistro"
    assert captured["location"] == "Pho The Good Times Asian Bistro"


def test_add_event_to_calendar_keeps_explicit_address_in_location(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(calendar_tools, "get_user_calendar_timezone", lambda uid, calendar_id=None: "America/Chicago")
    captured = {}
    monkeypatch.setattr(
        calendar_tools,
        "create_user_calendar_event",
        lambda uid, request: captured.update({"location": request.location})
        or CalendarEvent(
            event_id="evt-1",
            title=request.title,
            start=request.start_time.isoformat(),
            end=request.end_time.isoformat(),
            status="confirmed",
            location=request.location,
        ),
    )

    result = calendar_tools._add_event_to_calendar_impl(
        uid="user-1",
        title="Dinner at pho the good times asian bistro",
        start_time="2026-03-13T09:00:00+00:00",
        end_time="2026-03-13T10:00:00+00:00",
        timezone=None,
        description=None,
        location="1395 University Street, Eugene",
        invitees=None,
        calendar_id=None,
    )

    payload = json.loads(result)
    assert payload["status"] == "success"
    assert payload["event"]["location"] == "1395 University Street, Eugene"
    assert captured["location"] == "1395 University Street, Eugene"


def test_build_calendar_tools_rejects_empty_uid() -> None:
    with pytest.raises(ValueError):
        calendar_tools.build_calendar_tools("   ")


def test_build_calendar_tools_binds_uid() -> None:
    tools = calendar_tools.build_calendar_tools("user-1")

    assert [tool.name for tool in tools] == ["get_user_calendar", "add_event_to_calendar"]
