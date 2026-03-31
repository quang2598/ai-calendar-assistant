from __future__ import annotations

import json
from datetime import datetime
from typing import List, Optional
from zoneinfo import ZoneInfo

from langchain.tools import tool
from loguru import logger
from pydantic import BaseModel, ConfigDict, Field

from config import trace_span
from utility.google_calendar_utility import (
    CreateCalendarEventRequest,
    ModifyCalendarEventRequest,
    create_user_calendar_event,
    modify_user_calendar_event,
    delete_user_calendar_event,
    rollback_user_calendar_event,
    get_user_calendar_timezone,
    list_user_calendar_events,
    build_user_google_credentials,
    _resolve_calendar_id,
)
from utility.firestore_utility import (
    get_agent_created_event,
    list_agent_created_events,
    update_agent_event_snapshot,
    store_agent_created_event,
    delete_agent_created_event_record,
)


class GetUserCalendarInput(BaseModel):
    start_time: Optional[str] = Field(
        default=None,
        description=(
            "Optional start datetime in ISO-8601 format, "
            "for example: 2026-03-12T09:00:00-05:00"
        ),
    )
    end_time: Optional[str] = Field(
        default=None,
        description=(
            "Optional end datetime in ISO-8601 format, "
            "for example: 2026-03-15T23:59:59-05:00"
        ),
    )
    timezone: Optional[str] = Field(
        default=None,
        description="Optional IANA timezone, for example: America/Chicago",
    )
    calendar_id: Optional[str] = Field(
        default=None,
        description="Optional calendar id. Defaults to configured calendar.",
    )
    max_results: int = Field(
        default=20,
        ge=1,
        le=250,
        description="Maximum number of events to return.",
    )

    model_config = ConfigDict(extra="forbid")


class AddEventToCalendarInput(BaseModel):
    title: Optional[str] = Field(
        default=None,
        description="Event title. Required to create an event.",
    )
    start_time: Optional[str] = Field(
        default=None,
        description=(
            "Event start datetime in ISO-8601 format, "
            "for example: 2026-03-12T09:00:00-05:00. Required."
        ),
    )
    end_time: Optional[str] = Field(
        default=None,
        description=(
            "Event end datetime in ISO-8601 format, "
            "for example: 2026-03-12T10:00:00-05:00. Required."
        ),
    )
    timezone: Optional[str] = Field(
        default=None,
        description=(
            "Optional IANA timezone. Used when provided datetimes do not include timezone."
        ),
    )
    description: Optional[str] = Field(
        default=None,
        description="Optional event description.",
    )
    location: Optional[str] = Field(
        default=None,
        description="Optional event location.",
    )
    invitees: Optional[List[str]] = Field(
        default=None,
        description=(
            "Optional list of invitee email addresses, for example: "
            '["alex@example.com", "sam@example.com"]'
        ),
    )
    calendar_id: Optional[str] = Field(
        default=None,
        description="Optional calendar id. Defaults to configured calendar.",
    )

    model_config = ConfigDict(extra="forbid")


class ModifyEventInput(BaseModel):
    event_id: str = Field(
        description="The ID of the event to modify. Must be an event created by the agent."
    )
    title: Optional[str] = Field(
        default=None,
        description="New event title (optional).",
    )
    start_time: Optional[str] = Field(
        default=None,
        description="New start datetime in ISO-8601 format (optional).",
    )
    end_time: Optional[str] = Field(
        default=None,
        description="New end datetime in ISO-8601 format (optional).",
    )
    timezone: Optional[str] = Field(
        default=None,
        description="Optional IANA timezone for new times.",
    )
    description: Optional[str] = Field(
        default=None,
        description="New event description (optional).",
    )
    location: Optional[str] = Field(
        default=None,
        description="New event location (optional).",
    )
    invitees: Optional[List[str]] = Field(
        default=None,
        description="New list of invitee email addresses (optional).",
    )
    calendar_id: Optional[str] = Field(
        default=None,
        description="Optional calendar id. Defaults to configured calendar.",
    )

    model_config = ConfigDict(extra="forbid")


class DeleteEventInput(BaseModel):
    event_id: str = Field(
        description="The ID of the event to delete. Must be an event created by the agent."
    )
    calendar_id: Optional[str] = Field(
        default=None,
        description="Optional calendar id. Defaults to configured calendar.",
    )

    model_config = ConfigDict(extra="forbid")


class RollbackEventInput(BaseModel):
    event_id: str = Field(
        description="The ID of the event to rollback. Must be an event created by the agent."
    )
    calendar_id: Optional[str] = Field(
        default=None,
        description="Optional calendar id. Defaults to configured calendar.",
    )

    model_config = ConfigDict(extra="forbid")


class ListAgentEventsInput(BaseModel):
    model_config = ConfigDict(extra="forbid")


def _json_tool_response(status: str, message: str, **payload: object) -> str:
    body = {
        "status": status,
        "message": message,
    }
    body.update(payload)
    return json.dumps(body, ensure_ascii=True)


def _parse_datetime(value: Optional[str]) -> Optional[datetime]:
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None

    normalized = cleaned.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise ValueError(
            f"Invalid datetime '{value}'. Use ISO-8601 format, for example 2026-03-12T09:00:00-05:00."
        ) from exc


def _normalize_event_creation_datetime(
    value: datetime,
    timezone_name: Optional[str],
) -> datetime:
    """Normalize datetime for event creation.
    
    When a timezone is specified, we want to pass a naive datetime that represents
    the wall-clock time in the user's timezone, along with the timezone separately.
    This ensures Google Calendar interprets "10:00 AM" as 10:00 in the user's timezone,
    not as a UTC time that needs conversion.
    
    Args:
        value: The datetime to normalize (may be timezone-aware or naive)
        timezone_name: The timezone name (if any)
        
    Returns:
        A naive datetime representing the wall-clock time in the user's timezone.
    """
    if timezone_name is None or not timezone_name.strip():
        return value
    
    # If the datetime has timezone info, convert to user's timezone first
    if value.tzinfo is not None:
        try:
            tz = ZoneInfo(timezone_name)
            local_dt = value.astimezone(tz)
            return local_dt.replace(tzinfo=None)
        except Exception:
            # If timezone conversion fails, just strip the tzinfo
            return value.replace(tzinfo=None)
    
    # If datetime is already naive, return as-is (it represents wall-clock time)
    return value


def _format_event_time_for_response(iso_datetime_str: str, timezone_name: Optional[str] = None) -> str:
    """
    Convert ISO-8601 datetime string to human-readable format.
    
    Args:
        iso_datetime_str: ISO-8601 formatted datetime string
        timezone_name: User's timezone (for future use)
        
    Returns:
        Human-readable datetime string
    """
    if not iso_datetime_str or not iso_datetime_str.strip():
        return "(unknown time)"
    
    # For now, just return the string as-is to preserve original behavior
    # The real issue is not formatting but how dates are calculated
    return iso_datetime_str


def _verify_agent_created_event(uid: str, event_id: str) -> bool:
    """Verify that an event was created by the agent.
    
    Returns True if the event exists in the event-managed-by-agent collection,
    False otherwise.
    """
    agent_event = get_agent_created_event(uid=uid, google_event_id=event_id)
    found = agent_event is not None
    logger.info(f"Verify agent created event: uid={uid}, event_id={event_id}, found={found}")
    return found


@trace_span("tool_get_user_calendar")
def _get_user_calendar_impl(
    uid: str,
    start_time: Optional[str],
    end_time: Optional[str],
    timezone: Optional[str],
    calendar_id: Optional[str],
    max_results: int,
) -> str:
    try:
        start_dt = _parse_datetime(start_time)
        end_dt = _parse_datetime(end_time)
    except ValueError as exc:
        return _json_tool_response(
            status="invalid_input",
            message=str(exc),
        )

    try:
        timezone_used = (
            timezone.strip() if timezone and timezone.strip() else get_user_calendar_timezone(uid=uid, calendar_id=calendar_id)
        )
    except Exception as exc:
        return _json_tool_response(
            status="error",
            message=f"Failed to resolve calendar timezone: {exc}",
        )
    
    # Check if timezone is unknown - this indicates user hasn't set their timezone yet
    if timezone_used.lower() == "unknown":
        return _json_tool_response(
            status="timezone_required",
            message="I need to know your timezone before I can access your calendar. "
                   "Could you please tell me your timezone? For example: America/New_York, Europe/London, Asia/Tokyo, etc.",
        )

    try:
        events = list_user_calendar_events(
            uid=uid,
            start_time=start_dt,
            end_time=end_dt,
            timezone_name=timezone_used,
            calendar_id=calendar_id,
            max_results=max_results,
        )
    except Exception as exc:
        return _json_tool_response(
            status="error",
            message=f"Failed to read calendar events: {exc}",
        )

    items = [
        {
            "id": event.event_id,
            "title": event.title,
            "start": event.start,
            "end": event.end,
            "status": event.status,
            "location": event.location,
            "description": event.description,
            "invitees": event.invitees,
            "htmlLink": event.html_link,
        }
        for event in events
    ]
    if not items:
        return _json_tool_response(
            status="success",
            message="No calendar events found in the requested time range.",
            events=[],
            event_count=0,
            timezone_used=timezone_used,
        )

    return _json_tool_response(
        status="success",
        message=f"Found {len(items)} calendar events.",
        events=items,
        event_count=len(items),
        timezone_used=timezone_used,
    )


@trace_span("tool_add_event_to_calendar")
def _add_event_to_calendar_impl(
    uid: str,
    title: Optional[str],
    start_time: Optional[str],
    end_time: Optional[str],
    timezone: Optional[str],
    description: Optional[str],
    location: Optional[str],
    invitees: Optional[List[str]],
    calendar_id: Optional[str],
) -> str:
    missing_fields: List[str] = []

    cleaned_title = (title or "").strip().capitalize()
    cleaned_description = (description or "").strip().capitalize()
    cleaned_start_time = (start_time or "").strip()
    cleaned_end_time = (end_time or "").strip()

    if not cleaned_title:
        missing_fields.append("title")
    if not cleaned_start_time:
        missing_fields.append("start_time")
    if not cleaned_end_time:
        missing_fields.append("end_time")

    if missing_fields:
        return _json_tool_response(
            status="missing_fields",
            message="Need required event fields before creating a calendar event.",
            missing_fields=missing_fields,
        )

    try:
        start_dt = _parse_datetime(cleaned_start_time)
        end_dt = _parse_datetime(cleaned_end_time)
        if start_dt is None or end_dt is None:
            raise ValueError("start_time and end_time are required.")
    except ValueError as exc:
        return _json_tool_response(
            status="invalid_input",
            message=str(exc),
        )

    try:
        timezone_used = (
            timezone.strip() if timezone and timezone.strip() else get_user_calendar_timezone(uid=uid, calendar_id=calendar_id)
        )
    except Exception as exc:
        return _json_tool_response(
            status="error",
            message=f"Failed to resolve calendar timezone: {exc}",
        )
    
    # Check if timezone is unknown - this indicates user hasn't set their timezone yet
    if timezone_used.lower() == "unknown":
        return _json_tool_response(
            status="timezone_required",
            message="I need to know your timezone before I can create calendar events. "
                   "Could you please tell me your timezone? For example: America/New_York, Europe/London, Asia/Tokyo, etc.",
        )

    try:
        normalized_start_dt = _normalize_event_creation_datetime(start_dt, timezone_used)
        normalized_end_dt = _normalize_event_creation_datetime(end_dt, timezone_used)
        created_event = create_user_calendar_event(
            uid=uid,
            request=CreateCalendarEventRequest(
                title=cleaned_title,
                start_time=normalized_start_dt,
                end_time=normalized_end_dt,
                timezone_name=timezone_used,
                description=cleaned_description,
                location=location,
                invitees=invitees,
                calendar_id=calendar_id,
            ),
        )
    except Exception as exc:
        return _json_tool_response(
            status="error",
            message=f"Failed to create calendar event: {exc}",
        )

    return _json_tool_response(
        status="success",
        message="Calendar event created successfully.",
        timezone_used=timezone_used,
        event={
            "id": created_event.event_id,
            "title": created_event.title,
            "start": created_event.start,
            "end": created_event.end,
            "status": created_event.status,
            "location": created_event.location,
            "description": created_event.description,
            "invitees": created_event.invitees,
            "htmlLink": created_event.html_link,
        },
    )


@trace_span("tool_add_event_to_calendar_with_tracking")
def _add_event_to_calendar_with_tracking_impl(
    uid: str,
    title: Optional[str],
    start_time: Optional[str],
    end_time: Optional[str],
    timezone: Optional[str],
    description: Optional[str],
    location: Optional[str],
    invitees: Optional[List[str]],
    calendar_id: Optional[str],
) -> str:
    """Wrapper around add_event that also tracks the event in Firestore."""
    # First, try to create the event
    result_json = _add_event_to_calendar_impl(
        uid=uid,
        title=title,
        start_time=start_time,
        end_time=end_time,
        timezone=timezone,
        description=description,
        location=location,
        invitees=invitees,
        calendar_id=calendar_id,
    )
    
    try:
        result = json.loads(result_json)
    except Exception:
        return result_json
    
    # If creation was successful, store the event record in Firestore
    if result.get("status") == "success" and "event" in result:
        event_data = result["event"]
        event_id = event_data.get("id", "")
        
        if event_id:
            try:
                # Store the simple event snapshot in Firestore
                # This keeps the stored data clean and readable
                store_agent_created_event(
                    uid=uid,
                    google_event_id=event_id,
                    calendar_id=calendar_id or "primary",
                    snapshot=event_data,
                )
            except Exception as exc:
                # Log but don't fail - event was created, just tracking failed
                import logging
                logging.getLogger(__name__).warning(
                    "Failed to store agent-created event in Firestore: {}", exc
                )
    
    return result_json


@trace_span("tool_modify_event")
def _modify_event_impl(
    uid: str,
    event_id: Optional[str],
    title: Optional[str],
    start_time: Optional[str],
    end_time: Optional[str],
    timezone: Optional[str],
    description: Optional[str],
    location: Optional[str],
    invitees: Optional[List[str]],
    calendar_id: Optional[str],
) -> str:
    """Modify a calendar event created by the agent."""
    if not event_id or not event_id.strip():
        return _json_tool_response(
            status="invalid_input",
            message="event_id is required to modify an event.",
        )
    
    # Verify event was created by agent
    if not _verify_agent_created_event(uid=uid, event_id=event_id.strip()):
        return _json_tool_response(
            status="unauthorized",
            message="I can only manage events that I previously created.",
        )
    
    # Parse datetimes if provided
    try:
        start_dt = _parse_datetime(start_time) if start_time else None
        end_dt = _parse_datetime(end_time) if end_time else None
    except ValueError as exc:
        return _json_tool_response(
            status="invalid_input",
            message=str(exc),
        )
    
    try:
        # Get current event snapshot before modification
        agent_event = get_agent_created_event(uid=uid, google_event_id=event_id.strip())
        current_snapshot = agent_event.snapshot if agent_event else {}
        
        # Perform the modification
        modified_event = modify_user_calendar_event(
            uid=uid,
            request=ModifyCalendarEventRequest(
                event_id=event_id.strip(),
                title=title,
                start_time=start_dt,
                end_time=end_dt,
                timezone_name=timezone,
                description=description,
                location=location,
                invitees=invitees,
                calendar_id=calendar_id,
            ),
        )
        
        # Update snapshot in Firestore (save current as previous for rollback)
        if agent_event:
            update_agent_event_snapshot(
                uid=uid,
                google_event_id=event_id.strip(),
                current_snapshot=current_snapshot,
                new_snapshot={
                    "id": modified_event.event_id,
                    "title": modified_event.title,
                    "start": modified_event.start,
                    "end": modified_event.end,
                    "status": modified_event.status,
                    "description": modified_event.description,
                    "location": modified_event.location,
                    "invitees": modified_event.invitees,
                    "htmlLink": modified_event.html_link,
                },
            )
    except ValueError as exc:
        return _json_tool_response(
            status="invalid_input",
            message=str(exc),
        )
    except RuntimeError as exc:
        return _json_tool_response(
            status="error",
            message=str(exc),
        )
    except Exception as exc:
        return _json_tool_response(
            status="error",
            message=f"Failed to modify calendar event: {exc}",
        )
    
    return _json_tool_response(
        status="success",
        message="Calendar event modified successfully.",
        event={
            "id": modified_event.event_id,
            "title": modified_event.title,
            "start": modified_event.start,
            "end": modified_event.end,
            "status": modified_event.status,
            "location": modified_event.location,
            "description": modified_event.description,
            "invitees": modified_event.invitees,
            "htmlLink": modified_event.html_link,
        },
    )


@trace_span("tool_delete_event")
def _delete_event_impl(
    uid: str,
    event_id: Optional[str],
    calendar_id: Optional[str],
) -> str:
    """Delete a calendar event created by the agent."""
    if not event_id or not event_id.strip():
        return _json_tool_response(
            status="invalid_input",
            message="event_id is required to delete an event.",
        )
    
    # Verify event was created by agent
    if not _verify_agent_created_event(uid=uid, event_id=event_id.strip()):
        return _json_tool_response(
            status="unauthorized",
            message="I can only manage events that I previously created.",
        )
    
    try:
        # Get current snapshot before deletion (for rollback)
        agent_event = get_agent_created_event(uid=uid, google_event_id=event_id.strip())
        current_snapshot = agent_event.snapshot if agent_event else {}
        
        # Perform the deletion
        delete_user_calendar_event(
            uid=uid,
            event_id=event_id.strip(),
            calendar_id=calendar_id,
        )
        
        # Verify the event was actually deleted by trying to fetch it
        try:
            from utility.google_calendar_utility import list_user_calendar_events
            from datetime import datetime, timedelta, timezone as dt_timezone
            # Try to list events to see if the deleted event still exists
            # Use a time window around the event to verify it's gone
            now = datetime.now(tz=dt_timezone.utc)
            start = now - timedelta(days=1)
            end = now + timedelta(days=31)
            
            events = list_user_calendar_events(
                uid=uid,
                start_time=start,
                end_time=end,
                calendar_id=calendar_id,
                max_results=250
            )
            
            # Check if the deleted event is still in the list
            for event in events:
                if event.event_id == event_id.strip():
                    # Event still exists - deletion failed
                    return _json_tool_response(
                        status="error",
                        message=f"Event deletion did not complete - the event still exists on the calendar. Please try again or contact support.",
                    )
        except Exception as verify_exc:
            # If verification fails, log it but don't fail the deletion
            pass
        
        # Update snapshot: save current state as previous, set current to null, mark as deleted
        if agent_event:
            update_agent_event_snapshot(
                uid=uid,
                google_event_id=event_id.strip(),
                current_snapshot=current_snapshot,
                new_snapshot=None,  # Current snapshot is null for deleted events
                status="deleted",
            )
    except RuntimeError as exc:
        return _json_tool_response(
            status="error",
            message=str(exc),
        )
    except Exception as exc:
        return _json_tool_response(
            status="error",
            message=f"Failed to delete calendar event: {exc}",
        )
    
    return _json_tool_response(
        status="success",
        message=f"Calendar event {event_id.strip()} has been deleted successfully. If you change your mind, I can restore this event using the rollback feature. Just let me know if you'd like me to bring it back!",
        event_id=event_id.strip(),
        can_restore=True,
    )


@trace_span("tool_rollback_event")
def _rollback_event_impl(
    uid: str,
    event_id: Optional[str],
    calendar_id: Optional[str],
) -> str:
    """Rollback (undo) the most recent modification to a calendar event."""
    if not event_id or not event_id.strip():
        return _json_tool_response(
            status="invalid_input",
            message="event_id is required to rollback an event.",
        )
    
    # Verify event was created by agent
    if not _verify_agent_created_event(uid=uid, event_id=event_id.strip()):
        error_msg = "I can only rollback events that I previously created."
        logger.warning(f"Rollback denied: event_id={event_id.strip()}, uid={uid}, reason=event_not_found")
        logger.info(f"Agent response: {error_msg}")
        return _json_tool_response(
            status="unauthorized",
            message=error_msg,
        )
    
    try:
        agent_event = get_agent_created_event(uid=uid, google_event_id=event_id.strip())
        
        if not agent_event:
            return _json_tool_response(
                status="not_found",
                message=f"Event {event_id.strip()} not found in agent-created events.",
            )
        
        # Case 1: previous_snapshot is null (event just created) - delete the event
        if agent_event.previous_snapshot is None:
            logger.info(f"Rollback case 1: event just created, deleting event_id={event_id.strip()}")
            try:
                delete_user_calendar_event(
                    uid=uid,
                    event_id=event_id.strip(),
                    calendar_id=calendar_id,
                )
                # Update firestore: mark as deleted
                update_agent_event_snapshot(
                    uid=uid,
                    google_event_id=event_id.strip(),
                    current_snapshot=agent_event.snapshot,
                    new_snapshot=None,
                    status="deleted",
                )
                success_msg = f"Rollback completed: Calendar event {event_id.strip()} (which was just created) has been deleted."
                logger.info(f"Agent response: {success_msg}")
                return _json_tool_response(
                    status="success",
                    message=success_msg,
                )
            except Exception as exc:
                raise RuntimeError(f"Failed to delete event during rollback: {exc}") from exc
        
        # Case 2: current_snapshot is null (event was deleted) - recreate with different ID using previous snapshot
        elif agent_event.snapshot is None:
            logger.info(f"Rollback case 2: event was deleted, recreating with new ID using previous snapshot, original_id={event_id.strip()}")
            try:
                # Build the create request from previous snapshot
                previous = agent_event.previous_snapshot
                
                # Parse datetime strings from snapshot
                from datetime import datetime
                start_time = datetime.fromisoformat(previous.get("start")) if previous.get("start") else None
                end_time = datetime.fromisoformat(previous.get("end")) if previous.get("end") else None
                
                if not start_time or not end_time:
                    raise ValueError("Cannot recreate event: start and end times are required")
                
                create_request = CreateCalendarEventRequest(
                    title=previous.get("title", "Restored Event"),
                    start_time=start_time,
                    end_time=end_time,
                    description=previous.get("description"),
                    location=previous.get("location"),
                    invitees=previous.get("invitees"),
                    calendar_id=calendar_id,
                )
                
                restored_event = create_user_calendar_event(
                    uid=uid,
                    request=create_request,
                )
                
                # Store the new event as a separate record in Firestore (don't modify the old deleted event)
                store_agent_created_event(
                    uid=uid,
                    google_event_id=restored_event.event_id,
                    calendar_id=calendar_id or "primary",
                    snapshot={
                        "id": restored_event.event_id,
                        "title": restored_event.title,
                        "start": restored_event.start,
                        "end": restored_event.end,
                        "status": restored_event.status,
                        "description": restored_event.description,
                        "location": restored_event.location,
                        "invitees": restored_event.invitees,
                    },
                )
                
                success_msg = f"Rollback completed: Deleted calendar event has been restored (with a new event ID). Original ID was {event_id.strip()}, new ID is {restored_event.event_id}."
                logger.info(f"Agent response: {success_msg}")
                return _json_tool_response(
                    status="success",
                    message=success_msg,
                    event={
                        "id": restored_event.event_id,
                        "title": restored_event.title,
                        "start": restored_event.start,
                        "end": restored_event.end,
                        "status": restored_event.status,
                        "location": restored_event.location,
                        "description": restored_event.description,
                        "invitees": restored_event.invitees,
                        "htmlLink": restored_event.html_link,
                    },
                )
            except Exception as exc:
                raise RuntimeError(f"Failed to restore deleted event: {exc}") from exc
        
        # Case 3: both snapshots exist (event was updated) - update with previous snapshot, keep same ID
        else:
            logger.info(f"Rollback case 3: event was updated, restoring to previous state with same ID, event_id={event_id.strip()}")
            try:
                restored_event = rollback_user_calendar_event(
                    uid=uid,
                    event_id=event_id.strip(),
                    previous_snapshot=agent_event.previous_snapshot,
                    calendar_id=calendar_id,
                )
                # Update firestore: swap the snapshots
                update_agent_event_snapshot(
                    uid=uid,
                    google_event_id=event_id.strip(),
                    current_snapshot=agent_event.previous_snapshot,
                    new_snapshot=agent_event.snapshot,
                    status="active",
                )
                success_msg = f"Rollback completed: Calendar event {event_id.strip()} has been restored to its previous state."
                logger.info(f"Agent response: {success_msg}")
                return _json_tool_response(
                    status="success",
                    message=success_msg,
                    event={
                        "id": restored_event.event_id,
                        "title": restored_event.title,
                        "start": restored_event.start,
                        "end": restored_event.end,
                        "status": restored_event.status,
                        "location": restored_event.location,
                        "description": restored_event.description,
                        "invitees": restored_event.invitees,
                        "htmlLink": restored_event.html_link,
                    },
                )
            except Exception as exc:
                raise RuntimeError(f"Failed to restore event: {exc}") from exc
    except RuntimeError as exc:
        return _json_tool_response(
            status="error",
            message=str(exc),
        )
    except ValueError as exc:
        return _json_tool_response(
            status="invalid_input",
            message=str(exc),
        )
    except Exception as exc:
        return _json_tool_response(
            status="error",
            message=f"Failed to rollback calendar event: {exc}",
        )
    
    return _json_tool_response(
        status="success",
        message=f"Calendar event {event_id.strip()} has been rolled back to its previous state.",
        event={
            "id": restored_event.event_id,
            "title": restored_event.title,
            "start": restored_event.start,
            "end": restored_event.end,
            "status": restored_event.status,
            "location": restored_event.location,
            "description": restored_event.description,
            "invitees": restored_event.invitees,
            "htmlLink": restored_event.html_link,
        },
    )


@trace_span("tool_list_agent_events")
def _list_agent_events_impl(uid: str) -> str:
    """List all events created by the agent."""
    try:
        agent_events = list_agent_created_events(uid=uid)
    except Exception as exc:
        return _json_tool_response(
            status="error",
            message=f"Failed to list agent-created events: {exc}",
        )
    
    if not agent_events:
        return _json_tool_response(
            status="success",
            message="No events have been created by the agent yet.",
            events=[],
            event_count=0,
        )
    
    events = []
    for event in agent_events:
        # For active events, use the current snapshot
        if event.snapshot is not None:
            snapshot_to_use = event.snapshot
        # For deleted events, use the previous snapshot so agent can see and restore them
        elif event.status == "deleted" and event.previous_snapshot is not None:
            logger.info(f"Including deleted event in list: event_id={event.google_event_id}, uid={uid}")
            snapshot_to_use = event.previous_snapshot
        else:
            # Skip events with no usable snapshot
            logger.info(f"Skipping event with no snapshot: event_id={event.google_event_id}, uid={uid}, status={event.status}")
            continue
        
        events.append({
            "id": event.google_event_id,
            "title": snapshot_to_use.get("title", "(untitled)"),
            "start": snapshot_to_use.get("start", ""),
            "end": snapshot_to_use.get("end", ""),
            "calendar": event.calendar_id,
            "created_at": event.created_at.isoformat() if event.created_at else "",
            "last_modified_at": event.last_modified_at.isoformat() if event.last_modified_at else None,
            "status": event.status,  # Include status so agent knows if it's deleted
        })
    
    return _json_tool_response(
        status="success",
        message=f"Found {len(events)} event(s) created by the agent.",
        events=events,
        event_count=len(events),
    )



def build_calendar_tools(uid: str) -> List:
    """Build calendar tools for a given user.
    
    Args:
        uid: User ID for calendar operations
        
    Returns:
        List of calendar tools
    """
    cleaned_uid = uid.strip()
    if not cleaned_uid:
        raise ValueError("uid must not be empty when building calendar tools.")

    @tool(args_schema=GetUserCalendarInput)
    def get_user_calendar(
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
        timezone: Optional[str] = None,
        calendar_id: Optional[str] = None,
        max_results: int = 20,
    ) -> str:
        """Read events from the user's Google Calendar for a given timeframe.
        
        If timeframe is missing, defaults are applied.
        Use this before answering calendar availability questions.
        
        Args:
            start_time: Optional start datetime in ISO-8601 format
            end_time: Optional end datetime in ISO-8601 format
            timezone: Optional IANA timezone
            calendar_id: Optional calendar id
            max_results: Maximum number of events to return
            
        Returns:
            JSON string with calendar events or error message
        """
        return _get_user_calendar_impl(
            uid=cleaned_uid,
            start_time=start_time,
            end_time=end_time,
            timezone=timezone,
            calendar_id=calendar_id,
            max_results=max_results,
        )

    @tool(args_schema=AddEventToCalendarInput)
    def add_event_to_calendar(
        title: Optional[str] = None,
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
        timezone: Optional[str] = None,
        description: Optional[str] = None,
        location: Optional[str] = None,
        invitees: Optional[List[str]] = None,
        calendar_id: Optional[str] = None,
    ) -> str:
        """Create a Google Calendar event for the user.
        
        Requires title, start_time, and end_time.
        Optional fields include description, location, invitees, and timezone.
        If required fields are missing, the tool returns missing_fields.
        
        After successful creation, the event is automatically tracked by the agent.
        
        Args:
            title: Event title (required)
            start_time: Event start datetime in ISO-8601 format (required)
            end_time: Event end datetime in ISO-8601 format (required)
            timezone: Optional IANA timezone
            description: Optional event description
            location: Optional event location
            invitees: Optional list of invitee email addresses
            calendar_id: Optional calendar id
            
        Returns:
            JSON string with created event or error message
        """
        return _add_event_to_calendar_with_tracking_impl(
            uid=cleaned_uid,
            title=title,
            start_time=start_time,
            end_time=end_time,
            timezone=timezone,
            description=description,
            location=location,
            invitees=invitees,
            calendar_id=calendar_id,
        )

    @tool(args_schema=ModifyEventInput)
    def modify_event(
        event_id: str,
        title: Optional[str] = None,
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
        timezone: Optional[str] = None,
        description: Optional[str] = None,
        location: Optional[str] = None,
        invitees: Optional[List[str]] = None,
        calendar_id: Optional[str] = None,
    ) -> str:
        """Modify an existing calendar event created by the agent.
        
        CRITICAL: This tool can ONLY modify events that the agent previously created.
        Attempting to modify pre-existing or user-created events will be rejected.
        
        At least one field (other than event_id) must be provided to modify.
        
        Args:
            event_id: The event ID to modify (required, must be agent-created)
            title: New event title (optional)
            start_time: New start datetime in ISO-8601 format (optional)
            end_time: New end datetime in ISO-8601 format (optional)
            timezone: Optional IANA timezone for new times
            description: New event description (optional)
            location: New event location (optional)
            invitees: New list of invitee email addresses (optional)
            calendar_id: Optional calendar id
            
        Returns:
            JSON string with modified event or error message
        """
        return _modify_event_impl(
            uid=cleaned_uid,
            event_id=event_id,
            title=title,
            start_time=start_time,
            end_time=end_time,
            timezone=timezone,
            description=description,
            location=location,
            invitees=invitees,
            calendar_id=calendar_id,
        )

    @tool(args_schema=DeleteEventInput)
    def delete_event(
        event_id: str,
        calendar_id: Optional[str] = None,
    ) -> str:
        """Delete a calendar event created by the agent.
        
        CRITICAL: This tool can ONLY delete events that the agent previously created.
        Attempting to delete pre-existing or user-created events will be rejected.
        
        Deleted events can be restored using the rollback_event tool.
        
        Args:
            event_id: The event ID to delete (required, must be agent-created)
            calendar_id: Optional calendar id
            
        Returns:
            JSON string with success/error message
        """
        return _delete_event_impl(
            uid=cleaned_uid,
            event_id=event_id,
            calendar_id=calendar_id,
        )

    @tool(args_schema=RollbackEventInput)
    def rollback_event(
        event_id: str,
        calendar_id: Optional[str] = None,
    ) -> str:
        """Rollback (undo) the most recent modification to a calendar event created by the agent.
        
        This tool restores an event to its previous state before the last modification or deletion.
        - If the event was modified, it will be restored to the state before the modification.
        - If the event was deleted, it will be recreated with its previous content.
        
        CRITICAL: This tool can ONLY rollback events that the agent previously created.
        Each event can be rolled back at most once (single-level rollback).
        After rollback, a new modification history starts from the restored state.
        
        Args:
            event_id: The event ID to rollback (required, must be agent-created)
            calendar_id: Optional calendar id
            
        Returns:
            JSON string with restored event or error message
        """
        return _rollback_event_impl(
            uid=cleaned_uid,
            event_id=event_id,
            calendar_id=calendar_id,
        )

    @tool(args_schema=ListAgentEventsInput)
    def list_agent_events() -> str:
        """List all calendar events that were created by the agent for this user.
        
        Returns:
            JSON string with list of agent-created events
        """
        return _list_agent_events_impl(uid=cleaned_uid)

    return [
        get_user_calendar,
        add_event_to_calendar,
        modify_event,
        delete_event,
        rollback_event,
        list_agent_events,
    ]

