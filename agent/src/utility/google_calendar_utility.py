from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Callable, List, Optional, Tuple
from zoneinfo import ZoneInfo

from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import Resource, build
from googleapiclient.errors import HttpError
from loguru import logger

from utility.tracing_utils import trace_span
from .firestore_utility import (
    UserGoogleToken,
    fetch_user_google_token,
    update_user_google_access_token,
    store_agent_created_event,
    get_agent_created_event,
    update_agent_event_snapshot,
)

GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar"


def _get_agent_settings():
    from config.agent_config import agent_settings

    return agent_settings


@dataclass(frozen=True)
class CalendarEvent:
    event_id: str
    title: str
    start: str
    end: str
    status: str
    description: Optional[str] = None
    location: Optional[str] = None
    invitees: Optional[List[str]] = None
    html_link: Optional[str] = None


@dataclass(frozen=True)
class CreateCalendarEventRequest:
    title: str
    start_time: datetime
    end_time: datetime
    timezone_name: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None
    invitees: Optional[List[str]] = None
    calendar_id: Optional[str] = None


def _utc_now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _fallback_timezone_name() -> str:
    return _get_agent_settings().calendar_default_timezone.strip()


def _validate_timezone_name(timezone_name: str) -> str:
    cleaned = timezone_name.strip()
    if not cleaned:
        raise RuntimeError("Invalid timezone: empty value")
    try:
        ZoneInfo(cleaned)
    except Exception as exc:
        raise RuntimeError(f"Invalid timezone: {cleaned}") from exc
    return cleaned


def _resolve_timezone(timezone_name: str) -> ZoneInfo:
    target_timezone = _validate_timezone_name(timezone_name)
    try:
        return ZoneInfo(target_timezone)
    except Exception as exc:
        raise RuntimeError(f"Invalid timezone: {target_timezone}") from exc


def _ensure_datetime_timezone(value: datetime, timezone_name: str) -> datetime:
    """Attach timezone info to a datetime using ZoneInfo.
    
    Args:
        value: The datetime (may be naive or aware)
        timezone_name: The timezone name
        
    Returns:
        A datetime with proper timezone information
    """
    target_timezone = _resolve_timezone(timezone_name)
    
    if value.tzinfo is None:
        # Naive datetime - attach timezone using replace()
        return value.replace(tzinfo=target_timezone)
    else:
        # Aware datetime - convert to target timezone
        return value.astimezone(target_timezone)


def _normalize_to_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _is_access_token_expired(token: UserGoogleToken) -> bool:
    if not token.access_token:
        return True

    if token.updated_at is None:
        return True

    token_age = _utc_now() - _normalize_to_utc(token.updated_at)
    ttl = timedelta(seconds=_get_agent_settings().google_oauth_access_token_ttl_seconds)
    return token_age >= ttl


def _build_refreshable_credentials(token: UserGoogleToken) -> Credentials:
    settings = _get_agent_settings()
    return Credentials(
        token=token.access_token,
        refresh_token=token.refresh_token,
        token_uri=settings.google_oauth_token_uri,
        client_id=settings.google_oauth_client_id,
        client_secret=settings.google_oauth_client_secret,
        scopes=[GOOGLE_CALENDAR_SCOPE],
    )


def _build_calendar_service(uid: str) -> Resource:
    credentials = build_user_google_credentials(uid=uid)
    return build("calendar", "v3", credentials=credentials, cache_discovery=False)


def _http_error_status_code(exc: HttpError) -> Optional[int]:
    response = getattr(exc, "resp", None)
    status_code = getattr(response, "status", None)
    if isinstance(status_code, int):
        return status_code
    return None


def _is_auth_http_error(exc: HttpError) -> bool:
    return _http_error_status_code(exc) in {401, 403}


def _execute_with_auth_retry(uid: str, operation: Callable[[Resource], object]) -> object:
    service = _build_calendar_service(uid=uid)
    try:
        return operation(service)
    except HttpError as exc:
        if not _is_auth_http_error(exc):
            raise

    logger.warning("Calendar API auth error detected. Refreshing token and retrying for uid={}", uid)
    refresh_user_google_access_token(uid=uid)
    service = _build_calendar_service(uid=uid)
    return operation(service)


def _parse_event_time(raw_event: dict, key: str) -> str:
    payload = raw_event.get(key, {}) or {}
    return str(payload.get("dateTime") or payload.get("date") or "")


def _extract_invitees(raw_event: dict) -> Optional[List[str]]:
    attendees = raw_event.get("attendees")
    if not isinstance(attendees, list):
        return None

    invitees: List[str] = []
    for attendee in attendees:
        if not isinstance(attendee, dict):
            continue
        email = str(attendee.get("email", "")).strip().lower()
        if email:
            invitees.append(email)

    return invitees or None


def _normalize_invitees(invitees: Optional[List[str]]) -> List[str]:
    if not invitees:
        return []

    normalized: List[str] = []
    seen = set()
    for invitee in invitees:
        cleaned = str(invitee or "").strip().lower()
        if not cleaned:
            raise ValueError("Invitee emails must not be empty.")
        if "@" not in cleaned or cleaned.startswith("@") or cleaned.endswith("@") or " " in cleaned:
            raise ValueError(f"Invalid invitee email: {invitee}")
        if cleaned in seen:
            continue
        seen.add(cleaned)
        normalized.append(cleaned)

    return normalized


def _map_calendar_event(raw_event: dict) -> CalendarEvent:
    return CalendarEvent(
        event_id=str(raw_event.get("id", "")),
        title=str(raw_event.get("summary", "")).strip() or "(untitled event)",
        start=_parse_event_time(raw_event, "start"),
        end=_parse_event_time(raw_event, "end"),
        status=str(raw_event.get("status", "")),
        description=raw_event.get("description"),
        location=raw_event.get("location"),
        invitees=_extract_invitees(raw_event),
        html_link=raw_event.get("htmlLink"),
    )


def _resolve_calendar_id(calendar_id: Optional[str]) -> str:
    return (calendar_id or _get_agent_settings().google_calendar_default_id).strip()


def _extract_timezone(payload: object, field_name: str) -> Optional[str]:
    raw_value = None
    if isinstance(payload, dict):
        raw_value = payload.get(field_name)

    cleaned = str(raw_value or "").strip()
    if not cleaned:
        return None

    try:
        return _validate_timezone_name(cleaned)
    except RuntimeError:
        logger.warning(
            "Ignoring invalid timezone returned by Google Calendar: field={}, value={}",
            field_name,
            cleaned,
        )
        return None


@trace_span("get_user_calendar_timezone")
def get_user_calendar_timezone(uid: str, calendar_id: Optional[str] = None) -> str:
    fallback_timezone = _fallback_timezone_name()
    resolved_calendar_id = _resolve_calendar_id(calendar_id)
    def settings_operation(service: Resource) -> object:
        return service.settings().get(setting="timezone").execute()

    try:
        response = _execute_with_auth_retry(uid=uid, operation=settings_operation)
    except Exception as exc:
        logger.warning(
            "Unable to resolve Google Calendar settings timezone for uid={}; using fallback. Error: {}",
            uid,
            exc,
        )
    else:
        timezone_name = _extract_timezone(response, "value")
        if timezone_name is not None:
            logger.info("User calendar timezone: {}", timezone_name)
            return timezone_name

    def calendar_operation(service: Resource) -> object:
        return service.calendars().get(calendarId=resolved_calendar_id).execute()

    try:
        response = _execute_with_auth_retry(uid=uid, operation=calendar_operation)
    except Exception as exc:
        logger.warning(
            "Unable to resolve Google Calendar timezone from calendar metadata for uid={}; using fallback. Error: {}",
            uid,
            exc,
        )
        logger.info("User calendar fallback timezone: {}", fallback_timezone)
        return fallback_timezone

    timezone_name = _extract_timezone(response, "timeZone")
    return timezone_name or fallback_timezone


def _resolve_effective_timezone_name(
    uid: str,
    timezone_name: Optional[str],
    calendar_id: Optional[str] = None,
) -> str:
    if timezone_name is not None and timezone_name.strip():
        return _validate_timezone_name(timezone_name)
    return get_user_calendar_timezone(uid=uid, calendar_id=calendar_id)


def _resolve_window(
    uid: str,
    start_time: Optional[datetime],
    end_time: Optional[datetime],
    timezone_name: Optional[str] = None,
    calendar_id: Optional[str] = None,
) -> Tuple[datetime, datetime]:
    settings = _get_agent_settings()
    effective_timezone_name = _resolve_effective_timezone_name(
        uid=uid,
        timezone_name=timezone_name,
        calendar_id=calendar_id,
    )
    current_time = datetime.now(tz=_resolve_timezone(effective_timezone_name))
    if start_time is None and end_time is None:
        start_time = current_time
        end_time = start_time + timedelta(days=settings.calendar_default_window_days)
    elif start_time is None and end_time is not None:
        end_time = _ensure_datetime_timezone(end_time, effective_timezone_name)
        start_time = end_time - timedelta(days=settings.calendar_default_window_days)
    elif start_time is not None and end_time is None:
        start_time = _ensure_datetime_timezone(start_time, effective_timezone_name)
        end_time = start_time + timedelta(days=settings.calendar_default_window_days)
    else:
        start_time = _ensure_datetime_timezone(start_time, effective_timezone_name)
        end_time = _ensure_datetime_timezone(end_time, effective_timezone_name)

    if start_time >= end_time:
        raise ValueError("Calendar window is invalid: start_time must be before end_time.")

    max_window = timedelta(days=settings.calendar_max_window_days)
    if (end_time - start_time) > max_window:
        raise ValueError(
            "Calendar window exceeds configured maximum of "
            f"{settings.calendar_max_window_days} days."
        )

    return start_time, end_time


@trace_span("refresh_user_google_access_token")
def refresh_user_google_access_token(uid: str) -> str:
    token = fetch_user_google_token(uid=uid)
    credentials = _build_refreshable_credentials(token)

    try:
        credentials.refresh(GoogleAuthRequest())
    except Exception as exc:
        raise RuntimeError(f"Unable to refresh Google access token for user {uid}: {exc}") from exc

    refreshed_access_token = str(credentials.token or "").strip()
    if not refreshed_access_token:
        raise RuntimeError(f"Google token refresh returned empty access token for user: {uid}")

    update_user_google_access_token(uid=uid, access_token=refreshed_access_token)
    logger.info("Google access token refreshed for user: {}", uid)
    return refreshed_access_token


@trace_span("get_valid_user_google_access_token")
def get_valid_user_google_access_token(uid: str) -> str:
    token = fetch_user_google_token(uid=uid)
    if _is_access_token_expired(token):
        logger.info("Detected missing or expired Google access token for user: {}", uid)
        return refresh_user_google_access_token(uid=uid)
    return str(token.access_token)


@trace_span("build_user_google_credentials")
def build_user_google_credentials(uid: str) -> Credentials:
    settings = _get_agent_settings()
    token = fetch_user_google_token(uid=uid)
    access_token = token.access_token
    if _is_access_token_expired(token):
        access_token = refresh_user_google_access_token(uid=uid)

    return Credentials(
        token=str(access_token),
        refresh_token=token.refresh_token,
        token_uri=settings.google_oauth_token_uri,
        client_id=settings.google_oauth_client_id,
        client_secret=settings.google_oauth_client_secret,
        scopes=[GOOGLE_CALENDAR_SCOPE],
    )


@trace_span("list_user_calendar_events")
def list_user_calendar_events(
    uid: str,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    calendar_id: Optional[str] = None,
    timezone_name: Optional[str] = None,
    max_results: int = 50,
) -> List[CalendarEvent]:
    if max_results < 1 or max_results > 250:
        raise ValueError("max_results must be between 1 and 250.")

    window_start, window_end = _resolve_window(
        uid=uid,
        start_time=start_time,
        end_time=end_time,
        timezone_name=timezone_name,
        calendar_id=calendar_id,
    )
    resolved_calendar_id = _resolve_calendar_id(calendar_id)
    effective_timezone_name = _resolve_effective_timezone_name(
        uid=uid,
        timezone_name=timezone_name,
        calendar_id=calendar_id,
    )

    def operation(service: Resource) -> object:
        return (
            service.events()
            .list(
                calendarId=resolved_calendar_id,
                timeMin=_normalize_to_utc(window_start).isoformat(),
                timeMax=_normalize_to_utc(window_end).isoformat(),
                maxResults=max_results,
                singleEvents=True,
                orderBy="startTime",
                timeZone=effective_timezone_name,
            )
            .execute()
        )

    try:
        response = _execute_with_auth_retry(uid=uid, operation=operation)
    except HttpError as exc:
        raise RuntimeError(f"Failed to list calendar events for user {uid}: {exc}") from exc

    items = list((response or {}).get("items", []))
    events = [_map_calendar_event(item) for item in items]
    # logger.info(
    #     "Listed calendar events for user {}: requested_window=({} to {}), effective_timezone={}, returned_events={}",
    #     uid,
    #     window_start.isoformat(),
    #     window_end.isoformat(),
    #     effective_timezone_name,
    #     events,
    # )
    return [_map_calendar_event(item) for item in items]


@trace_span("create_user_calendar_event")
def create_user_calendar_event(uid: str, request: CreateCalendarEventRequest) -> CalendarEvent:
    title = request.title.strip()
    if not title:
        raise ValueError("Event title must not be empty.")

    effective_timezone_name = _resolve_effective_timezone_name(
        uid=uid,
        timezone_name=request.timezone_name,
        calendar_id=request.calendar_id,
    )
    event_start = _ensure_datetime_timezone(request.start_time, effective_timezone_name)
    event_end = _ensure_datetime_timezone(request.end_time, effective_timezone_name)
    if event_start >= event_end:
        raise ValueError("Event end_time must be after start_time.")

    resolved_calendar_id = _resolve_calendar_id(request.calendar_id)
    resolved_timezone = effective_timezone_name
    normalized_invitees = _normalize_invitees(request.invitees)

    event_payload = {
        "summary": title,
        "start": {
            "dateTime": event_start.isoformat(),
            "timeZone": resolved_timezone,
        },
        "end": {
            "dateTime": event_end.isoformat(),
            "timeZone": resolved_timezone,
        },
    }

    if request.description:
        event_payload["description"] = request.description.strip()
    if request.location:
        event_payload["location"] = request.location.strip()
    if normalized_invitees:
        event_payload["attendees"] = [{"email": invitee} for invitee in normalized_invitees]

    def operation(service: Resource) -> object:
        return (
            service.events()
            .insert(
                calendarId=resolved_calendar_id,
                body=event_payload,
            )
            .execute()
        )

    try:
        created_event = _execute_with_auth_retry(uid=uid, operation=operation)
    except HttpError as exc:
        raise RuntimeError(f"Failed to create calendar event for user {uid}: {exc}") from exc

    return _map_calendar_event(created_event or {})


# Modify, Delete, and Rollback Functions
# ========================================


@dataclass(frozen=True)
class ModifyCalendarEventRequest:
    event_id: str
    title: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    timezone_name: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None
    invitees: Optional[List[str]] = None
    calendar_id: Optional[str] = None


@trace_span("modify_user_calendar_event")
def modify_user_calendar_event(
    uid: str,
    request: ModifyCalendarEventRequest,
) -> CalendarEvent:
    """
    Modify an existing calendar event.
    
    Args:
        uid: User ID
        request: Modification request with event_id and fields to update
        
    Returns:
        Updated CalendarEvent
        
    Raises:
        RuntimeError: If event not found, modification fails, or user doesn't have permission
    """
    resolved_calendar_id = _resolve_calendar_id(request.calendar_id)
    event_id = request.event_id.strip()
    
    if not event_id:
        raise ValueError("event_id must not be empty")
    
    # Fetch the current event first
    def get_operation(service: Resource) -> object:
        return service.events().get(calendarId=resolved_calendar_id, eventId=event_id).execute()
    
    try:
        current_event = _execute_with_auth_retry(uid=uid, operation=get_operation)
    except HttpError as exc:
        status_code = _http_error_status_code(exc)
        if status_code == 404:
            raise RuntimeError(f"Calendar event not found: event_id={event_id}")
        raise RuntimeError(f"Failed to fetch calendar event for modification: {exc}") from exc
    
    # Build update payload
    update_payload = {}
    
    # Handle title - always include existing title to prevent it from being lost
    if request.title is not None:
        cleaned_title = request.title.strip()
        if cleaned_title:
            update_payload["summary"] = cleaned_title
        # If title is empty string, keep the existing title
        else:
            existing_title = str(current_event.get("summary", "")).strip()
            if existing_title:
                update_payload["summary"] = existing_title
    else:
        # If title is None (not being changed), preserve the existing title
        existing_title = str(current_event.get("summary", "")).strip()
        if existing_title:
            update_payload["summary"] = existing_title
    
    # IMPORTANT: For timed events, Google Calendar API requires BOTH start AND end times
    # to be present in the update payload, even if you're only changing other fields like location
    existing_start = current_event.get("start")
    existing_end = current_event.get("end")
    is_all_day_event = "date" in existing_start and "dateTime" not in existing_start
    
    if not is_all_day_event:
        # For timed events, always include start and end in update payload
        effective_timezone_name = request.timezone_name or _extract_timezone(current_event, "timeZone") or _fallback_timezone_name()
        
        if request.start_time is not None:
            event_start = _ensure_datetime_timezone(request.start_time, effective_timezone_name)
            update_payload["start"] = {
                "dateTime": event_start.isoformat(),
                "timeZone": effective_timezone_name,
            }
        else:
            # Use existing start time if not being changed
            if existing_start:
                update_payload["start"] = existing_start
        
        if request.end_time is not None:
            event_end = _ensure_datetime_timezone(request.end_time, effective_timezone_name)
            update_payload["end"] = {
                "dateTime": event_end.isoformat(),
                "timeZone": effective_timezone_name,
            }
        else:
            # Use existing end time if not being changed
            if existing_end:
                update_payload["end"] = existing_end
        
        # Validate that start < end
        start_val = update_payload.get("start") or current_event.get("start")
        end_val = update_payload.get("end") or current_event.get("end")
        if start_val and end_val:
            start_str = str(start_val.get("dateTime", "") or start_val.get("date", ""))
            end_str = str(end_val.get("dateTime", "") or end_val.get("date", ""))
            if start_str >= end_str:
                raise ValueError("Event end_time must be after start_time")
    elif request.start_time is not None or request.end_time is not None:
        # For all-day events, handle time changes
        effective_timezone_name = request.timezone_name or _extract_timezone(current_event, "timeZone") or _fallback_timezone_name()
        
        if request.start_time is not None:
            event_start = _ensure_datetime_timezone(request.start_time, effective_timezone_name)
            update_payload["start"] = {
                "dateTime": event_start.isoformat(),
                "timeZone": effective_timezone_name,
            }
        
        if request.end_time is not None:
            event_end = _ensure_datetime_timezone(request.end_time, effective_timezone_name)
            update_payload["end"] = {
                "dateTime": event_end.isoformat(),
                "timeZone": effective_timezone_name,
            }
        
        # Validate that start < end
        start_val = update_payload.get("start") or current_event.get("start")
        end_val = update_payload.get("end") or current_event.get("end")
        if start_val and end_val:
            start_str = str(start_val.get("dateTime", "") or start_val.get("date", ""))
            end_str = str(end_val.get("dateTime", "") or end_val.get("date", ""))
            if start_str >= end_str:
                raise ValueError("Event end_time must be after start_time")
    
    # Handle description - preserve existing if not being changed
    if request.description is not None:
        update_payload["description"] = request.description.strip() or None
    else:
        existing_description = current_event.get("description")
        if existing_description:
            update_payload["description"] = existing_description
    
    # Handle location - preserve existing if not being changed
    if request.location is not None:
        update_payload["location"] = request.location.strip() or None
    else:
        existing_location = current_event.get("location")
        if existing_location:
            update_payload["location"] = existing_location
    
    # Handle invitees/attendees - preserve existing if not being changed
    if request.invitees is not None:
        normalized_invitees = _normalize_invitees(request.invitees)
        update_payload["attendees"] = [{"email": invitee} for invitee in normalized_invitees] or None
    else:
        existing_attendees = current_event.get("attendees")
        if existing_attendees:
            update_payload["attendees"] = existing_attendees
    
    if not update_payload:
        raise ValueError("No fields provided to update")
    
    # Perform the update
    def update_operation(service: Resource) -> object:
        return (
            service.events()
            .update(
                calendarId=resolved_calendar_id,
                eventId=event_id,
                body=update_payload,
            )
            .execute()
        )
    
    try:
        updated_event = _execute_with_auth_retry(uid=uid, operation=update_operation)
    except HttpError as exc:
        raise RuntimeError(f"Failed to modify calendar event {event_id}: {exc}") from exc
    
    return _map_calendar_event(updated_event or {})


@trace_span("delete_user_calendar_event")
def delete_user_calendar_event(
    uid: str,
    event_id: str,
    calendar_id: Optional[str] = None,
) -> None:
    """
    Delete a calendar event.
    
    Args:
        uid: User ID
        event_id: Google Calendar event ID
        calendar_id: Optional calendar ID (defaults to configured calendar)
        
    Raises:
        RuntimeError: If event not found, deletion fails, or user doesn't have permission
    """
    resolved_calendar_id = _resolve_calendar_id(calendar_id)
    cleaned_event_id = event_id.strip()
    
    if not cleaned_event_id:
        raise ValueError("event_id must not be empty")
    
    def operation(service: Resource) -> object:
        service.events().delete(
            calendarId=resolved_calendar_id,
            eventId=cleaned_event_id,
        ).execute()
        return None
    
    try:
        _execute_with_auth_retry(uid=uid, operation=operation)
    except HttpError as exc:
        status_code = _http_error_status_code(exc)
        if status_code == 404:
            raise RuntimeError(f"Calendar event not found: event_id={cleaned_event_id}")
        raise RuntimeError(f"Failed to delete calendar event {cleaned_event_id}: {exc}") from exc
    
    logger.info("Deleted calendar event: uid={}, eventId={}", uid, cleaned_event_id)


@trace_span("rollback_user_calendar_event")
def rollback_user_calendar_event(
    uid: str,
    event_id: str,
    previous_snapshot: dict,
    calendar_id: Optional[str] = None,
) -> CalendarEvent:
    """
    Restore a calendar event to its previous state using a saved snapshot.
    This is used for undoing modifications (Case 3 only).
    For deleted events, use create_user_calendar_event instead.
    
    Args:
        uid: User ID
        event_id: Google Calendar event ID
        previous_snapshot: The previous event state to restore
        calendar_id: Optional calendar ID (defaults to configured calendar)
        
    Returns:
        CalendarEvent with the restored data
        
    Raises:
        RuntimeError: If rollback fails or event doesn't exist
    """
    if not isinstance(previous_snapshot, dict) or not previous_snapshot:
        raise ValueError("previous_snapshot must be a non-empty dictionary")
    
    resolved_calendar_id = _resolve_calendar_id(calendar_id)
    cleaned_event_id = event_id.strip()
    
    if not cleaned_event_id:
        raise ValueError("event_id must not be empty")
    
    # Build update payload from snapshot
    update_payload = {}
    if "title" in previous_snapshot:
        update_payload["summary"] = previous_snapshot.get("title")
    if "description" in previous_snapshot:
        update_payload["description"] = previous_snapshot.get("description")
    if "location" in previous_snapshot:
        update_payload["location"] = previous_snapshot.get("location")
    if "start" in previous_snapshot:
        update_payload["start"] = previous_snapshot.get("start")
    if "end" in previous_snapshot:
        update_payload["end"] = previous_snapshot.get("end")
    if "invitees" in previous_snapshot:
        invitees = previous_snapshot.get("invitees")
        if invitees:
            update_payload["attendees"] = [{"email": email} for email in invitees]
    
    if not update_payload or "summary" not in update_payload:
        raise ValueError("previous_snapshot does not contain required fields (title and start/end) for restoration")
    
    # Update the existing event to restore previous state
    def update_operation(service: Resource) -> object:
        return (
            service.events()
            .update(
                calendarId=resolved_calendar_id,
                eventId=cleaned_event_id,
                body=update_payload,
            )
            .execute()
        )
    
    try:
        restored_event = _execute_with_auth_retry(uid=uid, operation=update_operation)
        logger.info(f"Restored calendar event by updating: {cleaned_event_id}")
    except HttpError as exc:
        status_code = _http_error_status_code(exc)
        if status_code == 404:
            raise RuntimeError(f"Cannot restore deleted event using rollback. Event {cleaned_event_id} no longer exists. Use create event instead.") from exc
        raise RuntimeError(f"Failed to restore calendar event: {exc}") from exc
    
    logger.info("Rolled back calendar event: uid={}, eventId={}", uid, cleaned_event_id)
    return _map_calendar_event(restored_event or {})
