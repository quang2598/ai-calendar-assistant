from __future__ import annotations

from datetime import datetime, timezone

import pytest

import utility.google_calendar_utility as google_calendar_utility
from utility.firestore_utility import UserGoogleToken
from utility.google_calendar_utility import CalendarEvent, CreateCalendarEventRequest


def test_is_access_token_expired_when_token_missing() -> None:
    token = UserGoogleToken(
        access_token=None,
        refresh_token="refresh-token",
        updated_at=datetime.now(tz=timezone.utc),
    )

    assert google_calendar_utility._is_access_token_expired(token) is True


def test_resolve_timezone_rejects_invalid_timezone() -> None:
    with pytest.raises(RuntimeError, match="Invalid timezone"):
        google_calendar_utility._resolve_timezone("Not/AZone")


def test_validate_timezone_name_rejects_empty() -> None:
    with pytest.raises(RuntimeError, match="empty"):
        google_calendar_utility._validate_timezone_name("   ")


def test_ensure_datetime_timezone_applies_default_timezone() -> None:
    value = datetime(2026, 3, 13, 9, 0)

    result = google_calendar_utility._ensure_datetime_timezone(value, "UTC")

    assert result.tzinfo is not None


def test_normalize_to_utc_adds_timezone_to_naive_datetime() -> None:
    value = datetime(2026, 3, 13, 9, 0)

    result = google_calendar_utility._normalize_to_utc(value)

    assert result.tzinfo == timezone.utc


def test_get_valid_user_google_access_token_refreshes_when_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        google_calendar_utility,
        "fetch_user_google_token",
        lambda uid: UserGoogleToken(
            access_token=None,
            refresh_token="refresh-token",
            updated_at=datetime.now(tz=timezone.utc),
        ),
    )
    monkeypatch.setattr(
        google_calendar_utility,
        "refresh_user_google_access_token",
        lambda uid: "fresh-token",
    )

    result = google_calendar_utility.get_valid_user_google_access_token("user-1")

    assert result == "fresh-token"


def test_get_valid_user_google_access_token_returns_existing_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        google_calendar_utility,
        "fetch_user_google_token",
        lambda uid: UserGoogleToken(
            access_token="existing-token",
            refresh_token="refresh-token",
            updated_at=datetime.now(tz=timezone.utc),
        ),
    )

    result = google_calendar_utility.get_valid_user_google_access_token("user-1")

    assert result == "existing-token"


def test_build_user_google_credentials_uses_existing_token(monkeypatch: pytest.MonkeyPatch) -> None:
    token = UserGoogleToken(
        access_token="access-token",
        refresh_token="refresh-token",
        updated_at=datetime.now(tz=timezone.utc),
    )
    monkeypatch.setattr(google_calendar_utility, "fetch_user_google_token", lambda uid: token)

    credentials = google_calendar_utility.build_user_google_credentials("user-1")

    assert credentials.token == "access-token"
    assert credentials.refresh_token == "refresh-token"


def test_refresh_user_google_access_token_updates_firestore(monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeCredentials:
        def __init__(self):
            self.token = None

        def refresh(self, request):
            self.token = "refreshed-token"

    monkeypatch.setattr(
        google_calendar_utility,
        "fetch_user_google_token",
        lambda uid: UserGoogleToken(
            access_token=None,
            refresh_token="refresh-token",
            updated_at=None,
        ),
    )
    monkeypatch.setattr(
        google_calendar_utility,
        "_build_refreshable_credentials",
        lambda token: FakeCredentials(),
    )
    updates = {}
    monkeypatch.setattr(
        google_calendar_utility,
        "update_user_google_access_token",
        lambda uid, access_token: updates.update({"uid": uid, "access_token": access_token}),
    )

    result = google_calendar_utility.refresh_user_google_access_token("user-1")

    assert result == "refreshed-token"
    assert updates == {"uid": "user-1", "access_token": "refreshed-token"}


def test_build_calendar_service_uses_google_build(monkeypatch: pytest.MonkeyPatch) -> None:
    captured = {}
    monkeypatch.setattr(google_calendar_utility, "build_user_google_credentials", lambda uid: "creds")
    monkeypatch.setattr(
        google_calendar_utility,
        "build",
        lambda api, version, credentials, cache_discovery: captured.update(
            {
                "api": api,
                "version": version,
                "credentials": credentials,
                "cache_discovery": cache_discovery,
            }
        )
        or "service",
    )

    result = google_calendar_utility._build_calendar_service("user-1")

    assert result == "service"
    assert captured["api"] == "calendar"
    assert captured["version"] == "v3"


def test_http_error_helpers() -> None:
    class FakeError(Exception):
        def __init__(self, status):
            self.resp = type("Resp", (), {"status": status})()

    error = FakeError(401)

    assert google_calendar_utility._http_error_status_code(error) == 401
    assert google_calendar_utility._is_auth_http_error(error) is True


def test_execute_with_auth_retry_refreshes_and_retries(monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeHttpError(Exception):
        def __init__(self, status):
            self.resp = type("Resp", (), {"status": status})()

    services = iter(["service-1", "service-2"])
    monkeypatch.setattr(google_calendar_utility, "_build_calendar_service", lambda uid: next(services))
    monkeypatch.setattr(google_calendar_utility, "HttpError", FakeHttpError)
    refresh_calls = []
    monkeypatch.setattr(
        google_calendar_utility,
        "refresh_user_google_access_token",
        lambda uid: refresh_calls.append(uid) or "refreshed-token",
    )

    calls = {"count": 0}

    def operation(service):
        calls["count"] += 1
        if calls["count"] == 1:
            raise FakeHttpError(401)
        return {"service": service}

    result = google_calendar_utility._execute_with_auth_retry("user-1", operation)

    assert result == {"service": "service-2"}
    assert refresh_calls == ["user-1"]


def test_parse_event_time_and_resolve_calendar_id() -> None:
    assert google_calendar_utility._parse_event_time({"start": {"dateTime": "abc"}}, "start") == "abc"
    assert google_calendar_utility._resolve_calendar_id(" custom-id ") == "custom-id"


def test_extract_timezone_returns_valid_value() -> None:
    assert google_calendar_utility._extract_timezone({"value": "America/Chicago"}, "value") == "America/Chicago"


def test_extract_timezone_ignores_invalid_value() -> None:
    assert google_calendar_utility._extract_timezone({"value": "Not/AZone"}, "value") is None


def test_extract_invitees_returns_email_list() -> None:
    assert google_calendar_utility._extract_invitees(
        {
            "attendees": [
                {"email": "Alex@example.com"},
                {"email": "sam@example.com"},
            ]
        }
    ) == ["alex@example.com", "sam@example.com"]


def test_normalize_invitees_deduplicates_and_validates() -> None:
    assert google_calendar_utility._normalize_invitees(
        ["Alex@example.com", "alex@example.com", "sam@example.com"]
    ) == ["alex@example.com", "sam@example.com"]

    with pytest.raises(ValueError, match="Invalid invitee email"):
        google_calendar_utility._normalize_invitees(["not-an-email"])

    with pytest.raises(ValueError, match="must not be empty"):
        google_calendar_utility._normalize_invitees(["   "])


def test_resolve_window_defaults_and_partial_inputs() -> None:
    timezone_calls = []
    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(
        google_calendar_utility,
        "_resolve_effective_timezone_name",
        lambda uid, timezone_name, calendar_id=None: timezone_calls.append((uid, timezone_name, calendar_id)) or "America/Chicago",
    )
    try:
        start, end = google_calendar_utility._resolve_window("user-1", None, None)
    finally:
        monkeypatch.undo()
    assert start < end
    assert timezone_calls == [("user-1", None, None)]

    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(
        google_calendar_utility,
        "_resolve_effective_timezone_name",
        lambda uid, timezone_name, calendar_id=None: "America/Chicago",
    )
    try:
        explicit_start, explicit_end = google_calendar_utility._resolve_window(
            "user-1",
            datetime(2026, 3, 13, 9, 0, tzinfo=timezone.utc),
            None,
        )
    finally:
        monkeypatch.undo()
    assert explicit_start < explicit_end

    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(
        google_calendar_utility,
        "_resolve_effective_timezone_name",
        lambda uid, timezone_name, calendar_id=None: "America/Chicago",
    )
    try:
        explicit_start, explicit_end = google_calendar_utility._resolve_window(
            "user-1",
            None,
            datetime(2026, 3, 13, 9, 0, tzinfo=timezone.utc),
        )
    finally:
        monkeypatch.undo()
    assert explicit_start < explicit_end


def test_get_user_calendar_timezone_uses_settings_first(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = []

    def fake_execute_with_auth_retry(uid, operation):
        calls.append(uid)
        return {"value": "America/Chicago"}

    monkeypatch.setattr(google_calendar_utility, "_execute_with_auth_retry", fake_execute_with_auth_retry)

    result = google_calendar_utility.get_user_calendar_timezone("user-1")

    assert result == "America/Chicago"
    assert calls == ["user-1"]


def test_get_user_calendar_timezone_falls_back_to_calendar_metadata(monkeypatch: pytest.MonkeyPatch) -> None:
    responses = iter([{"value": "Not/AZone"}, {"timeZone": "Europe/London"}])
    monkeypatch.setattr(
        google_calendar_utility,
        "_execute_with_auth_retry",
        lambda uid, operation: next(responses),
    )

    result = google_calendar_utility.get_user_calendar_timezone("user-1")

    assert result == "Europe/London"


def test_get_user_calendar_timezone_uses_configured_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        google_calendar_utility,
        "_execute_with_auth_retry",
        lambda uid, operation: (_ for _ in ()).throw(RuntimeError("boom")),
    )

    result = google_calendar_utility.get_user_calendar_timezone("user-1")

    assert result == google_calendar_utility._fallback_timezone_name()


def test_resolve_effective_timezone_name_prefers_explicit_value(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = {"lookup": 0}
    monkeypatch.setattr(
        google_calendar_utility,
        "get_user_calendar_timezone",
        lambda uid, calendar_id=None: calls.__setitem__("lookup", calls["lookup"] + 1) or "America/Chicago",
    )

    result = google_calendar_utility._resolve_effective_timezone_name(
        uid="user-1",
        timezone_name="Europe/London",
    )
    assert result == "Europe/London"
    assert calls["lookup"] == 0


def test_resolve_effective_timezone_name_uses_lookup(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        google_calendar_utility,
        "get_user_calendar_timezone",
        lambda uid, calendar_id=None: "America/Chicago",
    )

    result = google_calendar_utility._resolve_effective_timezone_name(
        uid="user-1",
        timezone_name=None,
    )

    assert result == "America/Chicago"


def test_list_user_calendar_events_maps_results(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        google_calendar_utility,
        "_resolve_effective_timezone_name",
        lambda uid, timezone_name, calendar_id=None: "America/Chicago",
    )
    monkeypatch.setattr(
        google_calendar_utility,
        "_execute_with_auth_retry",
        lambda uid, operation: {
            "items": [
                {
                    "id": "evt-1",
                    "summary": "Team Sync",
                    "start": {"dateTime": "2026-03-13T09:00:00-05:00"},
                    "end": {"dateTime": "2026-03-13T10:00:00-05:00"},
                    "status": "confirmed",
                    "attendees": [{"email": "alex@example.com"}],
                }
            ]
        },
    )

    events = google_calendar_utility.list_user_calendar_events(
        uid="user-1",
        start_time=datetime(2026, 3, 13, 9, 0, tzinfo=timezone.utc),
        end_time=datetime(2026, 3, 14, 9, 0, tzinfo=timezone.utc),
    )

    assert events == [
        CalendarEvent(
            event_id="evt-1",
            title="Team Sync",
            start="2026-03-13T09:00:00-05:00",
            end="2026-03-13T10:00:00-05:00",
            status="confirmed",
            description=None,
            location=None,
            invitees=["alex@example.com"],
            html_link=None,
        )
    ]


def test_list_user_calendar_events_rejects_max_results() -> None:
    with pytest.raises(ValueError, match="max_results"):
        google_calendar_utility.list_user_calendar_events(uid="user-1", max_results=0)


def test_list_user_calendar_events_rejects_large_window() -> None:
    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(
        google_calendar_utility,
        "_resolve_effective_timezone_name",
        lambda uid, timezone_name, calendar_id=None: "America/Chicago",
    )
    try:
        with pytest.raises(ValueError):
            google_calendar_utility.list_user_calendar_events(
                uid="user-1",
                start_time=datetime(2020, 1, 1, tzinfo=timezone.utc),
                end_time=datetime(2026, 1, 1, tzinfo=timezone.utc),
            )
    finally:
        monkeypatch.undo()


def test_list_user_calendar_events_maps_provider_error(monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeHttpError(Exception):
        pass

    monkeypatch.setattr(google_calendar_utility, "HttpError", FakeHttpError)
    monkeypatch.setattr(
        google_calendar_utility,
        "_resolve_effective_timezone_name",
        lambda uid, timezone_name, calendar_id=None: "America/Chicago",
    )
    monkeypatch.setattr(
        google_calendar_utility,
        "_execute_with_auth_retry",
        lambda uid, operation: (_ for _ in ()).throw(FakeHttpError("provider")),
    )

    with pytest.raises(RuntimeError, match="Failed to list calendar events"):
        google_calendar_utility.list_user_calendar_events(
            uid="user-1",
            start_time=datetime(2026, 3, 13, 9, 0, tzinfo=timezone.utc),
            end_time=datetime(2026, 3, 14, 9, 0, tzinfo=timezone.utc),
        )


def test_create_user_calendar_event_validates_time_order() -> None:
    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(
        google_calendar_utility,
        "_resolve_effective_timezone_name",
        lambda uid, timezone_name, calendar_id=None: "America/Chicago",
    )
    try:
        with pytest.raises(ValueError):
            google_calendar_utility.create_user_calendar_event(
                uid="user-1",
                request=CreateCalendarEventRequest(
                    title="Bad Event",
                    start_time=datetime(2026, 3, 13, 10, 0, tzinfo=timezone.utc),
                    end_time=datetime(2026, 3, 13, 9, 0, tzinfo=timezone.utc),
                ),
            )
    finally:
        monkeypatch.undo()


def test_create_user_calendar_event_rejects_empty_title() -> None:
    with pytest.raises(ValueError, match="title"):
        google_calendar_utility.create_user_calendar_event(
            uid="user-1",
            request=CreateCalendarEventRequest(
                title="   ",
                start_time=datetime(2026, 3, 13, 12, 0, tzinfo=timezone.utc),
                end_time=datetime(2026, 3, 13, 13, 0, tzinfo=timezone.utc),
            ),
        )


def test_create_user_calendar_event_maps_created_event(monkeypatch: pytest.MonkeyPatch) -> None:
    captured = {}

    class FakeInsertRequest:
        def __init__(self, body: dict) -> None:
            self.body = body

        def execute(self) -> dict:
            return self.body | {
                "id": "evt-2",
                "status": "confirmed",
                "htmlLink": "https://calendar.google.com/event?eid=evt-2",
            }

    class FakeEvents:
        def insert(self, calendarId: str, body: dict) -> FakeInsertRequest:
            captured["calendar_id"] = calendarId
            captured["payload"] = body
            return FakeInsertRequest(body)

    class FakeService:
        def events(self) -> FakeEvents:
            return FakeEvents()

    monkeypatch.setattr(
        google_calendar_utility,
        "_resolve_effective_timezone_name",
        lambda uid, timezone_name, calendar_id=None: "America/Chicago",
    )
    monkeypatch.setattr(
        google_calendar_utility,
        "_execute_with_auth_retry",
        lambda uid, operation: operation(FakeService()),
    )

    result = google_calendar_utility.create_user_calendar_event(
        uid="user-1",
        request=CreateCalendarEventRequest(
            title="Lunch",
            start_time=datetime(2026, 3, 13, 12, 0, tzinfo=timezone.utc),
            end_time=datetime(2026, 3, 13, 13, 0, tzinfo=timezone.utc),
            description="With team",
            location="Cafe",
            invitees=["alex@example.com", "sam@example.com"],
        ),
    )

    assert result.event_id == "evt-2"
    assert result.title == "Lunch"
    assert result.invitees == ["alex@example.com", "sam@example.com"]
    assert captured["calendar_id"] == "primary"
    assert captured["payload"]["attendees"] == [
        {"email": "alex@example.com"},
        {"email": "sam@example.com"},
    ]
