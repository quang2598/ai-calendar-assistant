from __future__ import annotations

import json
import re
from datetime import datetime
from typing import List, Optional
from zoneinfo import ZoneInfo

from langchain.tools import tool
from loguru import logger
from pydantic import BaseModel, ConfigDict, Field

from utility.tracing_utils import trace_span, track_action
from utility.google_calendar_utility import (
    CreateCalendarEventRequest,
    ModifyCalendarEventRequest,
    create_user_calendar_event,
    modify_user_calendar_event,
    delete_user_calendar_event,
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
    store_action_history,
    trigger_frontend_calendar_update,
    mark_action_as_rolled_back,
    get_latest_action,
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
            "Event start datetime in ISO-8601 format. Required."
        ),
    )
    end_time: Optional[str] = Field(
        default=None,
        description=(
            "Event end datetime in ISO-8601 format. Required."
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
        description=(
            "Optional event notes only (agenda, context, reminders). "
            "Do NOT put venue/address/business name here."
        ),
    )
    location: Optional[str] = Field(
        default=None,
        description=(
            "Event location. Put address or business name here. "
        ),
    )
    invitees: Optional[List[str]] = Field(
        default=None,
        description="Optional invitee emails.",
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
        description="New title (optional).",
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
        description=(
            "New event notes only (agenda/context). "
            "Do NOT place venue/address/business name here."
        ),
    )
    location: Optional[str] = Field(
        default=None,
        description=(
            "New event location (address or business name). "
            "Use this field for venue/address updates."
        ),
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
    """Input for the rollback_event tool - undoes the most recent action on a specific event."""
    event_id: str = Field(
        description="The ID of the event to rollback. Must be an event created by the agent."
    )
    calendar_id: Optional[str] = Field(
        default=None,
        description="Optional calendar id. Defaults to configured calendar.",
    )

    model_config = ConfigDict(extra="forbid")


class CheckAgentEventInput(BaseModel):
    event_id: str = Field(
        description="The event ID to check. Verify if this event was created by the agent."
    )
    calendar_id: Optional[str] = Field(
        default=None,
        description="Optional calendar id. Defaults to configured calendar.",
    )

    model_config = ConfigDict(extra="forbid")


class ListAgentEventsInput(BaseModel):
    model_config = ConfigDict(extra="forbid")


class GetEventDetailsInput(BaseModel):
    """Query calendar events by date/time range and/or text filters.
    
    USAGE EXAMPLES:
    
    1. FOR A SPECIFIC DAY (e.g., "What events on Thursday?"):
       - start_date: "2026-04-16"
       - end_date: "2026-04-16"  (same as start_date)
       - start_time: "00:00"
       - end_time: "23:59"
       Returns all events on that day.
    
    2. FOR A DATE RANGE (e.g., "Events next week?"):
       - start_date: "2026-04-14"
       - end_date: "2026-04-20"
       - start_time: "00:00"
       - end_time: "23:59"
       Returns all events in that date range.
    
    3. FOR TIME OF DAY (e.g., "What's on my calendar this afternoon?"):
       - start_date: "2026-04-16"
       - end_date: "2026-04-16"  (same day)
       - start_time: "12:00"
       - end_time: "18:00"
       Returns events in that time window.
    
    4. WITH TEXT FILTERS (e.g., "Find dinner events on Friday"):
       - start_date: "2026-04-18"
       - end_date: "2026-04-18"
       - title: "dinner"
       Returns events matching "dinner" on that day.
    """
    start_date: Optional[str] = Field(
        default=None,
        description="Optional start date (YYYY-MM-DD).",
    )
    start_time: Optional[str] = Field(
        default=None,
        description="Optional start time (HH:MM).",
    )
    end_date: Optional[str] = Field(
        default=None,
        description="Optional end date (YYYY-MM-DD).",
    )
    end_time: Optional[str] = Field(
        default=None,
        description="Optional end time (HH:MM).",
    )
    title: Optional[str] = Field(
        default=None,
        description="Filter by title (partial match).",
    )
    location: Optional[str] = Field(
        default=None,
        description="Filter by location (partial match).",
    )
    timezone: Optional[str] = Field(
        default=None,
        description="Optional IANA timezone.",
    )
    calendar_id: Optional[str] = Field(
        default=None,
        description="Optional calendar id. Defaults to configured calendar.",
    )

    model_config = ConfigDict(extra="forbid")


class GetDeletedEventDetailsInput(BaseModel):
    title: Optional[str] = Field(
        default=None,
        description="Filter by title of deleted event (partial match, case-insensitive).",
    )
    location: Optional[str] = Field(
        default=None,
        description="Filter by location of deleted event (partial match, case-insensitive).",
    )
    start_date: Optional[str] = Field(
        default=None,
        description="Optional start date (YYYY-MM-DD) to filter deleted events.",
    )
    end_date: Optional[str] = Field(
        default=None,
        description="Optional end date (YYYY-MM-DD) to filter deleted events.",
    )

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


def _strip_location_suffix_from_title(title: str, location: Optional[str]) -> str:
    """Remove trailing ' at <location>' from title when it duplicates the location field."""
    cleaned_title = (title or "").strip()
    cleaned_location = (location or "").strip()
    if not cleaned_title or not cleaned_location:
        return cleaned_title

    suffix = f" at {cleaned_location}"
    if cleaned_title.lower().endswith(suffix.lower()):
        return cleaned_title[: -len(suffix)].rstrip()
    return cleaned_title


def _extract_business_name_from_location(location: Optional[str]) -> str:
    """Extract likely business name from location text like 'Name, 123 Street, City'.
    
    Prefers addresses (starting with numbers) and extracts business name only if present.
    If location looks like a full address, returns it as-is to preserve full address.
    """
    cleaned_location = (location or "").strip()
    if not cleaned_location:
        return ""

    # If the location looks like it starts with an address (number + street), 
    # it's likely a full address like "2729 Shadowview, Eugene" - return as-is
    if re.match(r"^\d+\s", cleaned_location):
        return ""  # Don't extract business name from full address
    
    # Otherwise extract first segment (likely business name) before comma
    first_segment = cleaned_location.split(",", 1)[0].strip()
    if not first_segment:
        return ""

    return first_segment


def _looks_like_address_text(value: str) -> bool:
    """Heuristic: detect address-like fragments in title suffixes."""
    cleaned = (value or "").strip().lower()
    if not cleaned:
        return False

    if re.search(r"\d", cleaned):
        return True

    address_tokens = (" street", " st", " avenue", " ave", " road", " rd", " boulevard", " blvd", " lane", " ln", " drive", " dr")
    return any(token in cleaned for token in address_tokens)


def _ensure_business_name_in_title(title: str, location: Optional[str]) -> str:
    """Keep title readable: include business name, avoid full-address suffix."""
    cleaned_title = _strip_location_suffix_from_title(title, location)
    cleaned_location = (location or "").strip()
    business_name = _extract_business_name_from_location(cleaned_location)

    if not cleaned_title:
        return business_name
    if not business_name:
        return cleaned_title

    # Check if business name is already in the title (avoid "visit Japanese Garden at Japanese Garden")
    if business_name.lower() in cleaned_title.lower():
        return cleaned_title

    marker = " at "
    idx = cleaned_title.lower().find(marker)

    # No business segment in title yet -> add it.
    if idx < 0:
        return f"{cleaned_title} at {business_name}"

    prefix = cleaned_title[:idx].strip()
    suffix = cleaned_title[idx + len(marker):].strip()

    # Replace address-like or location-equal suffix with business name.
    if not suffix or suffix.lower() == cleaned_location.lower() or _looks_like_address_text(suffix):
        return f"{prefix} at {business_name}".strip()

    return cleaned_title


def _capitalize_business_name_in_title(title: str) -> str:
    """Capitalize business name part in titles like 'Dinner at pho place'."""
    cleaned_title = (title or "").strip()
    if not cleaned_title:
        return cleaned_title

    marker = " at "
    idx = cleaned_title.lower().find(marker)
    if idx < 0:
        return cleaned_title

    prefix = cleaned_title[:idx].strip()
    business_name = cleaned_title[idx + len(marker):].strip()
    if not business_name:
        return cleaned_title

    capitalized_business_name = " ".join(
        part.capitalize() if not (len(part) > 1 and part.isupper()) else part
        for part in business_name.split()
    )
    return f"{prefix} at {capitalized_business_name}"


def _extract_location_from_title(title: Optional[str]) -> str:
    """Extract location/business segment from titles like 'Dinner at Panda Express'."""
    cleaned_title = (title or "").strip()
    if not cleaned_title:
        return ""

    marker = " at "
    idx = cleaned_title.lower().find(marker)
    if idx < 0:
        return ""

    return cleaned_title[idx + len(marker):].strip()


def _verify_agent_created_event(uid: str, event_id: str):
    """Verify that an event was created by the agent.
    
    Returns the agent_event object if it exists, None otherwise.
    """
    agent_event = get_agent_created_event(uid=uid, google_event_id=event_id)
    found = agent_event is not None
    logger.info("Verify agent created event: event_id={}, found={}", event_id, found)
    return agent_event


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

    # Check timeout before making API call
    try:
        from agent.service import _is_agent_timed_out
        if _is_agent_timed_out():
            return _json_tool_response(
                status="agent_timeout",
                message="Agent operation timed out. Calendar events were not retrieved.",
            )
    except ImportError:
        pass  # Timeout check not available, continue

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
@track_action("add")
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
    cleaned_location = (location or "").strip()
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

    # Keep business name in title, but avoid adding full address into title.
    cleaned_title = _ensure_business_name_in_title(cleaned_title, cleaned_location)
    cleaned_title = _capitalize_business_name_in_title(cleaned_title)

    # Keep location user-friendly: prefer explicit location (address/business),
    # otherwise derive business name from title.
    if not cleaned_location:
        cleaned_location = _extract_location_from_title(cleaned_title)

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

    # Check timeout before making API call
    try:
        from agent.service import _is_agent_timed_out
        if _is_agent_timed_out():
            return _json_tool_response(
                status="agent_timeout",
                message="Agent operation timed out. Calendar event was not created.",
            )
    except ImportError:
        pass  # Timeout check not available, continue

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
                location=cleaned_location,
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
    logger.info(f"Result status: {result.get('status')}, has event: {'event' in result}")
    if result.get("status") == "success" and "event" in result:
        event_data = result["event"]
        event_id = event_data.get("id", "")
        logger.info(f"Event created successfully, event_id={event_id}")
        
        if event_id:
            try:
                # Store the simple event snapshot in Firestore
                # This keeps the stored data clean and readable
                logger.info(f"Storing agent-created event in Firestore: event_id={event_id}")
                store_agent_created_event(
                    uid=uid,
                    google_event_id=event_id,
                    calendar_id=calendar_id or "primary",
                    snapshot=event_data,
                )
                logger.info(f"Successfully stored agent-created event")
                
                # Trigger frontend to fetch updated events and switch to event's date
                event_start = event_data.get("start")
                logger.info(f"Calling trigger_frontend_calendar_update with event_start={event_start}")
                trigger_frontend_calendar_update(
                    uid=uid, 
                    event_id=event_id,
                    event_start=event_start
                )
                logger.info(f"Successfully triggered frontend calendar update")
            except Exception as exc:
                # Log but don't fail - event was created, just tracking failed
                import logging
                logger.exception(f"Failed to store/trigger event in Firestore: {exc}")
                logging.getLogger(__name__).warning(
                    "Failed to store agent-created event in Firestore: {}", exc
                )
        else:
            logger.warning("Event created but no event_id returned")
    else:
        logger.info(f"Event creation failed or incomplete: status={result.get('status')}")
    
    return result_json


@trace_span("tool_modify_event")
@track_action("update")
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
    agent_event = _verify_agent_created_event(uid=uid, event_id=event_id.strip())
    if not agent_event:
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
        # Get current event snapshot before modification (for rollback)
        current_snapshot = agent_event.snapshot if agent_event else {}
        current_title = current_snapshot.get("title", "") if current_snapshot else ""
        current_location = current_snapshot.get("location", "") if current_snapshot else ""
        
        # logger.info(f"Modify event - current_title='{current_title}', current_location='{current_location}'")
        # logger.info(f"Modify event - input title='{title}', input location='{location}'")
        
        # Apply provided updates or keep current values
        new_title = title.strip().capitalize() if title is not None else current_title
        new_location = location.strip() if isinstance(location, str) else (current_location if location is None else "")
        
        # logger.info(f"Modify event - new_title before location update='{new_title}', new_location='{new_location}'")
        
        # If location changed, update title with new business name
        if location is not None and isinstance(location, str):
            new_business_name = _extract_business_name_from_location(new_location)
            # logger.info(f"Location changed to: {new_location}, extracted business name: '{new_business_name}'")
            
            # Extract the current business name from the title (the " at X" part)
            current_title_business = _extract_location_from_title(new_title)
            # logger.info(f"Current business name in title: '{current_title_business}'")
            
            # If there's a business name in the title and it's different from the new one, replace it
            if current_title_business and new_business_name and current_title_business.lower() != new_business_name.lower():
                # Replace the old business name with the new one in the title
                import re
                old_pattern = f" at {current_title_business}"
                new_pattern = f" at {new_business_name}"
                title_pattern = re.compile(re.escape(old_pattern), re.IGNORECASE)
                new_title = title_pattern.sub(new_pattern, new_title)
                # logger.info(f"Replaced '{old_pattern}' → '{new_pattern}' in title")
            elif new_business_name and not current_title_business:
                # No business name in current title, add it
                new_title = _ensure_business_name_in_title(new_title, new_location)
                # logger.info(f"No business name in title, added via _ensure_business_name_in_title")
            elif new_business_name:
                # Ensure new business name is in title
                new_title = _ensure_business_name_in_title(new_title, new_location)
                # logger.info(f"Ensured new business name in title via _ensure_business_name_in_title")
        
        # Finalize title formatting
        if new_title:
            new_title = _capitalize_business_name_in_title(new_title)
        
        # logger.info(f"Final modified_title='{new_title}'")
        
        modified_title = new_title
        modified_location = new_location if new_location else None
        
        # IMPORTANT: Fetch the CURRENT event from Google Calendar to get fresh state
        # This ensures we capture what actually changed, not stale stored snapshots
        current_google_event = None
        try:
            from utility.google_calendar_utility import _resolve_calendar_id
            from googleapiclient.discovery import build
            from utility.google_calendar_utility import _execute_with_auth_retry, _map_calendar_event
            
            resolved_calendar_id = _resolve_calendar_id(calendar_id)
            
            def get_operation(service):
                return service.events().get(calendarId=resolved_calendar_id, eventId=event_id.strip()).execute()
            
            current_google_event_raw = _execute_with_auth_retry(uid=uid, operation=get_operation)
            # Extract just the fields we need for change tracking
            if current_google_event_raw:
                current_google_event = {
                    "title": str(current_google_event_raw.get("summary", "")).strip() or "(untitled event)",
                    "start": current_google_event_raw.get("start", {}).get("dateTime") or current_google_event_raw.get("start", {}).get("date"),
                    "end": current_google_event_raw.get("end", {}).get("dateTime") or current_google_event_raw.get("end", {}).get("date"),
                    "location": current_google_event_raw.get("location"),
                    "description": current_google_event_raw.get("description"),
                }
        except Exception as e:
            logger.warning(f"Failed to fetch current Google event for change tracking: {e}")
            current_google_event = None
        
        # Check timeout before making API call
        try:
            from agent.service import _is_agent_timed_out
            if _is_agent_timed_out():
                return _json_tool_response(
                    status="agent_timeout",
                    message="Agent operation timed out. Calendar event was not modified.",
                )
        except ImportError:
            pass  # Timeout check not available, continue
        
        # Perform the modification
        modified_event = modify_user_calendar_event(
            uid=uid,
            request=ModifyCalendarEventRequest(
                event_id=event_id.strip(),
                title=modified_title,
                start_time=start_dt,
                end_time=end_dt,
                timezone_name=timezone,
                description=description,
                location=modified_location,
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
    
    # Compute what changed for action history description
    changes = {}
    # Use fresh Google event data if available, otherwise fall back to stored snapshot
    old_state = current_google_event if current_google_event else current_snapshot
    
    if old_state:
        # Only include fields that actually changed (old value != new value)
        # Skip if both values are None or empty
        old_title = old_state.get("title")
        if old_title != modified_event.title and not (not old_title and not modified_event.title):
            changes["title"] = (old_title, modified_event.title)
        
        old_start = old_state.get("start")
        if old_start != modified_event.start and not (not old_start and not modified_event.start):
            changes["start"] = (old_start, modified_event.start)
        
        old_end = old_state.get("end")
        if old_end != modified_event.end and not (not old_end and not modified_event.end):
            changes["end"] = (old_end, modified_event.end)
        
        old_location = old_state.get("location")
        if old_location != modified_event.location and not (not old_location and not modified_event.location):
            changes["location"] = (old_location, modified_event.location)
        
        old_description = old_state.get("description")
        if old_description != modified_event.description and not (not old_description and not modified_event.description):
            changes["description"] = (old_description, modified_event.description)
        
        old_invitees = old_state.get("invitees")
        if old_invitees != modified_event.invitees and not (not old_invitees and not modified_event.invitees):
            changes["attendees"] = (old_invitees, modified_event.invitees)
    
    # Trigger frontend update for modified event
    try:
        event_start = modified_event.start
        logger.info(f"Calling trigger_frontend_calendar_update for modified event with event_start={event_start}")
        trigger_frontend_calendar_update(
            uid=uid,
            event_id=event_id,
            event_start=event_start
        )
        logger.info(f"Successfully triggered frontend calendar update for modified event")
    except Exception as exc:
        logger.exception(f"Failed to trigger frontend update for modified event: {exc}")
    
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
        },
        changes=changes,
    )


@trace_span("tool_delete_event")
@track_action("delete")
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
    agent_event = _verify_agent_created_event(uid=uid, event_id=event_id.strip())
    if not agent_event:
        return _json_tool_response(
            status="unauthorized",
            message="I can only manage events that I previously created.",
        )
    
    try:
        # Get current snapshot before deletion (for rollback)
        current_snapshot = agent_event.snapshot if agent_event else {}
        
        # Check timeout before making API call
        try:
            from agent.service import _is_agent_timed_out
            if _is_agent_timed_out():
                return _json_tool_response(
                    status="agent_timeout",
                    message="Agent operation timed out. Calendar event was not deleted.",
                )
        except ImportError:
            pass  # Timeout check not available, continue
        
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
    
    # Include event data in response for @track_action decorator
    event_title = ""
    event_start = None
    if agent_event and agent_event.snapshot:
        event_title = agent_event.snapshot.get("title", "")
        event_start = agent_event.snapshot.get("start")
    display_title = event_title or "this event"
    
    # Trigger frontend update for deleted event (use event's original date)
    try:
        logger.info(f"Calling trigger_frontend_calendar_update for deleted event_id={event_id} with event_start={event_start}")
        trigger_frontend_calendar_update(
            uid=uid,
            event_id=event_id,
            event_start=event_start
        )
        logger.info(f"Successfully triggered frontend calendar update for deleted event")
    except Exception as exc:
        logger.exception(f"Failed to trigger frontend update for deleted event: {exc}")
    
    return _json_tool_response(
        status="success",
        message=f"{display_title} has been deleted successfully. No worries—you can restore it anytime by saying 'bring it back' or 'undo that'. Just let me know!",
        event={
            "id": event_id.strip(),
            "title": event_title,
        },
        can_restore=True,
    )


def _rollback_event_impl(
    uid: str,
    event_id: str,
    calendar_id: Optional[str],
    agent_event=None,
) -> str:
    """Rollback (undo) the most recent modification to a calendar event.
    
    This is the pure rollback logic. Call _rollback_event_tool_impl for validation.
    Assumes event_id is already validated and is agent-created.
    
    Args:
        uid: User ID
        event_id: Event ID to rollback
        calendar_id: Optional calendar ID
        agent_event: Optional pre-fetched agent event object to avoid duplicate lookup
    """
    try:
        # Use provided agent_event or fetch it
        if agent_event is None:
            agent_event = get_agent_created_event(uid=uid, google_event_id=event_id)
        event_title = ""
        if agent_event and agent_event.snapshot:
            event_title = str(agent_event.snapshot.get("title", "") or "").strip()
        elif agent_event and agent_event.previous_snapshot:
            event_title = str(agent_event.previous_snapshot.get("title", "") or "").strip()
        display_title = event_title or "this event"
        
        if not agent_event:
            return _json_tool_response(
                status="not_found",
                message="I couldn't find that event in agent-created events.",
            )
        
        # Case 1: previous_snapshot is null (event just created) - delete the event
        if agent_event.previous_snapshot is None:
            logger.info(f"Rollback case 1: event just created, deleting event_id={event_id}")
            try:
                # Call the delete tool implementation to trigger @track_action("delete") decorator
                delete_response = _delete_event_impl(
                    uid=uid,
                    event_id=event_id,
                    calendar_id=calendar_id,
                )
                
                # Check if deletion was successful
                try:
                    delete_result = json.loads(delete_response)
                    if delete_result.get("status") != "success":
                        raise RuntimeError(f"Delete failed: {delete_result.get('message')}")
                except json.JSONDecodeError:
                    raise RuntimeError("Invalid response from delete operation")
                
                # Mark the original action as rolled back
                try:
                    mark_action_as_rolled_back(uid=uid, event_id=event_id)
                except Exception as exc:
                    logger.warning("Failed to mark action as rolled back: {}", exc)
                
                success_msg = f"Rollback completed: {display_title} (which was just created) has been deleted."
                logger.info(f"Agent response: {success_msg}")
                return _json_tool_response(
                    status="success",
                    message=success_msg,
                )
            except Exception as exc:
                raise RuntimeError(f"Failed to delete event during rollback: {exc}") from exc
        
        # Case 2: current_snapshot is null (event was deleted) - recreate with different ID using previous snapshot
        elif agent_event.snapshot is None:
            logger.info(f"Rollback case 2: event was deleted, recreating with new ID using previous snapshot, original_id={event_id}")
            try:
                # Build the create request from previous snapshot
                previous = agent_event.previous_snapshot
                
                # Parse datetime strings from snapshot
                from datetime import datetime
                start_time = datetime.fromisoformat(previous.get("start")) if previous.get("start") else None
                end_time = datetime.fromisoformat(previous.get("end")) if previous.get("end") else None
                
                if not start_time or not end_time:
                    raise ValueError("Cannot recreate event: start and end times are required")
                
                # Call the tracking wrapper to handle event creation + Firestore storage + frontend notification
                # Convert datetime objects to ISO-8601 strings for the tool
                create_response = _add_event_to_calendar_with_tracking_impl(
                    uid=uid,
                    title=previous.get("title", "Restored Event"),
                    start_time=start_time.isoformat(),
                    end_time=end_time.isoformat(),
                    timezone=None,  # The times already have timezone info
                    description=previous.get("description"),
                    location=previous.get("location"),
                    invitees=previous.get("invitees"),
                    calendar_id=calendar_id,
                )
                
                # Check if creation was successful
                try:
                    create_result = json.loads(create_response)
                    if create_result.get("status") != "success":
                        raise RuntimeError(f"Create failed: {create_result.get('message')}")
                    restored_event_data = create_result.get("event", {})
                    restored_event_id = restored_event_data.get("id")
                except json.JSONDecodeError:
                    raise RuntimeError("Invalid response from create operation")
                
                # Mark the recovery add action as already rolled back
                try:
                    mark_action_as_rolled_back(uid=uid, event_id=restored_event_id)
                    logger.info(f"Marked recovery add action as already rolled back: new_event_id={restored_event_id}")
                except Exception as exc:
                    logger.warning("Failed to mark recovery add action as already rolled back: {}", exc)
                
                restored_title = str(restored_event_data.get("title", "") or "").strip() or display_title
                success_msg = f"Rollback completed: {restored_title} has been restored."
                logger.info(f"Agent response: {success_msg}")
                return _json_tool_response(
                    status="success",
                    message=success_msg,
                    event=restored_event_data,
                )
            except Exception as exc:
                raise RuntimeError(f"Failed to restore deleted event: {exc}") from exc
        
        # Case 3: both snapshots exist (event was updated) - update with previous snapshot, keep same ID
        else:
            logger.info(f"Rollback case 3: event was updated, restoring to previous state with same ID, event_id={event_id}")
            try:
                # Extract previous state details
                previous = agent_event.previous_snapshot
                
                # Parse datetime strings from snapshot
                from datetime import datetime
                start_time = datetime.fromisoformat(previous.get("start")) if previous.get("start") else None
                end_time = datetime.fromisoformat(previous.get("end")) if previous.get("end") else None
                
                # Call the modify event tool implementation to trigger @track_action("update") decorator
                modify_response = _modify_event_impl(
                    uid=uid,
                    event_id=event_id,
                    title=previous.get("title"),
                    start_time=start_time.isoformat() if start_time else None,
                    end_time=end_time.isoformat() if end_time else None,
                    timezone=None,  # Times already have timezone info
                    description=previous.get("description"),
                    location=previous.get("location"),
                    invitees=previous.get("invitees"),
                    calendar_id=calendar_id,
                )
                
                # Check if modification was successful
                try:
                    modify_result = json.loads(modify_response)
                    if modify_result.get("status") != "success":
                        raise RuntimeError(f"Modify failed: {modify_result.get('message')}")
                    restored_event_data = modify_result.get("event", {})
                except json.JSONDecodeError:
                    raise RuntimeError("Invalid response from modify operation")
                
                # Mark the original update action as rolled back
                try:
                    mark_action_as_rolled_back(uid=uid, event_id=event_id)
                except Exception as exc:
                    logger.warning("Failed to mark action as rolled back: {}", exc)
                
                restored_title = str(restored_event_data.get("title", "") or "").strip() or display_title
                success_msg = f"Rollback completed: {restored_title} has been restored to its previous state."
                logger.info(f"Agent response: {success_msg}")
                return _json_tool_response(
                    status="success",
                    message=success_msg,
                    event=restored_event_data,
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


@trace_span("tool_rollback_event")
def _rollback_event_tool_impl(uid: str, event_id: str, calendar_id: Optional[str]) -> str:
    """Tool implementation for rolling back a specific event.
    
    This validates the event and ensures it's the latest action before rolling back.
    """
    if not event_id or not event_id.strip():
        return _json_tool_response(
            status="invalid_input",
            message="event_id is required to rollback an event.",
        )
    
    # Verify event was created by agent and get the event object
    event_found = _verify_agent_created_event(uid=uid, event_id=event_id.strip())
    if not event_found:
        return _json_tool_response(
            status="unauthorized",
            message="I can only rollback events that I previously created.",
        )
    
    # Extract display title from event snapshots
    snapshot = event_found.snapshot or event_found.previous_snapshot or {}
    event_display_title = "this event"
    if isinstance(snapshot, dict):
        event_display_title = str(snapshot.get("title") or "").strip() or "this event"
    
    # Get the latest action to verify this event has the latest action
    try:
        latest_action = get_latest_action(uid=uid)
    except Exception as exc:
        return _json_tool_response(
            status="error",
            message=f"Failed to retrieve latest action: {exc}",
        )
    
    if not latest_action:
        return _json_tool_response(
            status="not_found",
            message="No actions found in history. There's nothing to undo for this event.",
        )
    
    # Check if the latest action is for this event
    if latest_action.event_id != event_id.strip():
        return _json_tool_response(
            status="invalid_state",
            message=f"Cannot rollback {event_display_title}: the most recent action is on a different event. "
                   f"I can only undo the most recent action. Would you like to undo the most recent action instead?",
        )
    
    # Check if the action has already been rolled back
    if latest_action.already_rolled_back:
        return _json_tool_response(
            status="invalid_state",
            message=f"This action has already been undone. I cannot undo it again.",
        )
    
    # Proceed with the rollback, passing the already-fetched agent_event to avoid duplicate lookup
    return _rollback_event_impl(
        uid=uid,
        event_id=event_id.strip(),
        calendar_id=calendar_id,
        agent_event=event_found,
    )


def _lookup_events_by_identifier(
    uid: str,
    title: Optional[str],
    start_date: Optional[str],
    start_time: Optional[str],
    end_date: Optional[str],
    end_time: Optional[str],
    location: Optional[str],
    timezone: Optional[str],
    calendar_id: Optional[str],
) -> List[object]:
    """Helper function to search for all events matching ALL provided filter criteria.
    
    Returns events that match ALL specified filters (title AND location AND timeframe).
    At least one filter must be provided.
    Returns empty list if no matches or timezone is unknown.
    
    Args:
        start_date: ISO date string (YYYY-MM-DD). Combines with start_time to form start datetime.
        start_time: ISO time string (HH:MM). Combines with start_date to form start datetime.
        end_date: ISO date string (YYYY-MM-DD). Combines with end_time to form end datetime.
        end_time: ISO time string (HH:MM). Combines with end_date to form end datetime.
    """
    # Get user's timezone for search
    try:
        timezone_used = (
            timezone.strip() if timezone and timezone.strip() 
            else get_user_calendar_timezone(uid=uid, calendar_id=calendar_id)
        )
    except Exception:
        timezone_used = "unknown"
    
    if timezone_used.lower() == "unknown":
        return []
    
    try:
        # Validate at least one filter is provided
        if not any([title, location, start_date, start_time, end_date, end_time]):
            return []
        
        # Build datetime boundaries by combining date + time fields
        now = datetime.now(ZoneInfo(timezone_used))
        
        # Construct start_dt from start_date and start_time
        if start_date:
            try:
                start_dt = datetime.fromisoformat(f"{start_date}T00:00:00").replace(tzinfo=ZoneInfo(timezone_used))
                if start_time:
                    # Parse HH:MM format and update the time
                    time_parts = start_time.split(":")
                    start_dt = start_dt.replace(hour=int(time_parts[0]), minute=int(time_parts[1]))
            except (ValueError, TypeError, IndexError):
                start_dt = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
                start_dt = start_dt.replace(month=max(1, start_dt.month - 1))
        else:
            # No start_date provided, use 1 month before now
            start_dt = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            start_dt = start_dt.replace(month=max(1, start_dt.month - 1))
        
        # Construct end_dt from end_date and end_time
        if end_date:
            try:
                end_dt = datetime.fromisoformat(f"{end_date}T23:59:59").replace(tzinfo=ZoneInfo(timezone_used))
                if end_time:
                    # Parse HH:MM format and update the time
                    time_parts = end_time.split(":")
                    end_dt = end_dt.replace(hour=int(time_parts[0]), minute=int(time_parts[1]), second=59)
            except (ValueError, TypeError, IndexError):
                end_dt = now.replace(day=28, hour=23, minute=59, second=59, microsecond=999999)
                end_dt = end_dt.replace(month=min(12, end_dt.month + 1))
        else:
            # No end_date provided, use 1 month after now
            end_dt = now.replace(day=28, hour=23, minute=59, second=59, microsecond=999999)
            end_dt = end_dt.replace(month=min(12, end_dt.month + 1))
        
        # Get all events in the range
        events = list_user_calendar_events(
            uid=uid,
            start_time=start_dt,
            end_time=end_dt,
            timezone_name=timezone_used,
            calendar_id=calendar_id,
            max_results=250,
        )
        
        # Precise filtering: ALL provided filters must match
        matched_events = []
        
        # Filter by all provided criteria (ALL must match)
        for event in events:
            # Check title filter - match ALL keywords (order-independent)
            if title:
                if not event.title:
                    continue
                title_words = title.lower().split()
                event_title_lower = event.title.lower()
                if not all(word in event_title_lower for word in title_words):
                    continue
            
            # Check location filter - match ALL keywords (order-independent)
            if location:
                if not event.location:
                    continue
                location_words = location.lower().split()
                event_location_lower = event.location.lower()
                if not all(word in event_location_lower for word in location_words):
                    continue
            
            # All filters matched, add event once
            matched_events.append(event)
        
        return matched_events
    
    except Exception:
        return []


@trace_span("list_agent_events")
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
            snapshot_to_use = event.previous_snapshot
        else:
            # Skip events with no usable snapshot
            logger.info(
                "Skipping event with no snapshot: event_id={}, status={}",
                event.google_event_id,
                event.status,
            )
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


@trace_span("tool_get_event_details")
def _get_event_details_impl(
    uid: str,
    start_date: Optional[str] = None,
    start_time: Optional[str] = None,
    end_date: Optional[str] = None,
    end_time: Optional[str] = None,
    title: Optional[str] = None,
    location: Optional[str] = None,
    timezone: Optional[str] = None,
    calendar_id: Optional[str] = None,
) -> str:
    """Get events from the user's calendar using filters, timeframe, or both.
    
    UNIFIED MODE: Accepts any combination of filters (title, location) and/or date/time parameters.
    - With title/location: Filtered search (returns specific matching events)
    - With date/time only: Timeframe browse (returns all events in range)  
    - With both: Filtered search within timeframe (returns matching events in range)
    
    Returns all matching events with their full details (date, time, location, attendees, description, etc),
    which you can then use with modify_event, delete_event, or rollback_event.
    
    If multiple events are found and the user wants to perform a CRUD action (modify/delete/rollback),
    list the events and ask the user which one they want to proceed with. Example:
    "I found 2 events matching 'dinner on Friday':
    1. Dinner with Sarah (Friday 7pm at home)
    2. Dinner at Italian Place (Friday 6:30pm)
    Which one would you like to modify?"
    
    If no events found, ask user to be more specific with additional filters.
    """
    try:
        # Check if any filter is provided (title, location, or date/time)
        if not any([title, location, start_date, start_time, end_date, end_time]):
            return _json_tool_response(
                status="invalid_input",
                message="Please provide either: 1) start_date/start_time and/or end_date/end_time for timeframe browse, OR 2) at least one filter (title, location) for specific search.",
            )
        
        # Check timeout before making API call
        try:
            from agent.service import _is_agent_timed_out
            if _is_agent_timed_out():
                return _json_tool_response(
                    status="agent_timeout",
                    message="Agent operation timed out. Events were not retrieved.",
                )
        except ImportError:
            pass  # Timeout check not available, continue
        
        # Look up all events matching provided criteria (handles both filtered and timeframe modes)
        matching_events = _lookup_events_by_identifier(
            uid=uid,
            title=title,
            start_date=start_date,
            start_time=start_time,
            end_date=end_date,
            end_time=end_time,
            location=location,
            timezone=timezone,
            calendar_id=calendar_id,
        )
        
        if not matching_events:
            # Check if it's a timezone issue
            try:
                timezone_used = (
                    timezone.strip() if timezone and timezone.strip() 
                    else get_user_calendar_timezone(uid=uid, calendar_id=calendar_id)
                )
                if timezone_used.lower() == "unknown":
                    return _json_tool_response(
                        status="timezone_required",
                        message="I need to know your timezone before I can search for events. "
                               "Could you please tell me your timezone? For example: America/New_York, Europe/London, Asia/Tokyo, etc.",
                    )
            except Exception:
                pass
            
            # Build search description for user feedback
            search_parts = []
            if title:
                search_parts.append(f"title '{title}'")
            if start_date:
                search_parts.append(f"from {start_date}")
            if start_time:
                search_parts.append(f"at {start_time}")
            if end_date:
                search_parts.append(f"to {end_date}")
            if end_time:
                search_parts.append(f"until {end_time}")
            if location:
                search_parts.append(f"location '{location}'")
            search_desc = " and ".join(search_parts)
            
            return _json_tool_response(
                status="not_found",
                message=f"No events found matching {search_desc}. Please try with different filters or fewer criteria.",
            )
        
        # Format all matching events
        events_list = [
            {
                "id": event.event_id,
                "title": event.title,
                "start": event.start,
                "end": event.end,
                "location": event.location or "",
                "description": event.description or "",
                "invitees": event.invitees or [],
                "status": event.status,
            }
            for event in matching_events
        ]
        
        # Determine message based on number of matches and what was searched
        search_criteria = []
        if title:
            search_criteria.append(f"title '{title}'")
        if location:
            search_criteria.append(f"location '{location}'")
        if start_date or start_time or end_date or end_time:
            if start_date and end_date:
                search_criteria.append(f"between {start_date} and {end_date}")
            elif start_date:
                search_criteria.append(f"on {start_date}")
            if start_time and end_time:
                search_criteria.append(f"from {start_time} to {end_time}")
            elif start_time:
                search_criteria.append(f"at {start_time}")
        
        criteria_str = " and ".join(search_criteria) if search_criteria else "timeframe"
        
        if len(events_list) == 1:
            message = f"Found event matching {criteria_str}"
        else:
            message = f"Found {len(events_list)} events matching {criteria_str}"
        
        return _json_tool_response(
            status="success",
            message=message,
            events=events_list,
            event_count=len(events_list),
        )
    
    except Exception as exc:
        logger.exception("Error getting event details")
        return _json_tool_response(
            status="error",
            message=f"Failed to get event details: {exc}",
        )


@trace_span("tool_get_deleted_event_details")
def _get_deleted_event_details_impl(
    uid: str,
    title: Optional[str] = None,
    location: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> str:
    """Get deleted events created by the agent from Firestore.
    
    Queries deleted agent-created events stored in Firestore (previous_snapshot).
    Use this to find deleted events so you can restore them with rollback_event.
    
    Args:
        uid: User ID
        title: Filter by deleted event title (partial match, case-insensitive)
        location: Filter by deleted event location (partial match, case-insensitive)
        start_date: Filter events deleted on or after this date (YYYY-MM-DD)
        end_date: Filter events deleted on or before this date (YYYY-MM-DD)
    
    Returns: JSON with deleted events or empty list
    """
    try:
        # Get all agent-created events from Firestore
        agent_events = list_agent_created_events(uid=uid)
        
        # Filter for deleted events only
        deleted_events = [e for e in agent_events if e.status == "deleted"]
        
        if not deleted_events:
            return _json_tool_response(
                status="success",
                message="No deleted events found.",
                events=[],
                event_count=0,
            )
        
        # Apply filters to deleted events
        matched_events = []
        
        for event in deleted_events:
            # Use previous_snapshot for deleted events (current snapshot is None)
            snapshot = event.previous_snapshot or {}
            
            if not snapshot:
                logger.warning(f"Deleted event {event.google_event_id} has no previous_snapshot")
                continue
            
            event_title = snapshot.get("title", "")
            event_location = snapshot.get("location", "")
            event_start = snapshot.get("start", "")
            
            # Check title filter - match ALL keywords (order-independent)
            if title:
                title_words = title.lower().split()
                event_title_lower = (event_title or "").lower()
                if not all(word in event_title_lower for word in title_words):
                    continue
            
            # Check location filter - match ALL keywords (order-independent)
            if location:
                location_words = location.lower().split()
                event_location_lower = (event_location or "").lower()
                if not all(word in event_location_lower for word in location_words):
                    continue
            
            # Check date filters using event start time
            if start_date or end_date:
                event_date = None
                if event_start:
                    try:
                        # Extract date from ISO datetime string (YYYY-MM-DD part)
                        event_date = event_start.split("T")[0]
                    except (ValueError, IndexError):
                        pass
                
                if start_date and event_date and event_date < start_date:
                    continue
                if end_date and event_date and event_date > end_date:
                    continue
            
            # All filters matched, add event
            matched_events.append(event)
        
        if not matched_events:
            search_parts = []
            if title:
                search_parts.append(f"title '{title}'")
            if location:
                search_parts.append(f"location '{location}'")
            if start_date or end_date:
                if start_date and end_date:
                    search_parts.append(f"between {start_date} and {end_date}")
                elif start_date:
                    search_parts.append(f"from {start_date}")
                elif end_date:
                    search_parts.append(f"until {end_date}")
            search_desc = " and ".join(search_parts) if search_parts else "criteria"
            
            return _json_tool_response(
                status="not_found",
                message=f"No deleted events found matching {search_desc}.",
                events=[],
                event_count=0,
            )
        
        # Format matched events
        events_list = []
        for event in matched_events:
            snapshot = event.previous_snapshot or {}
            events_list.append({
                "id": event.google_event_id,
                "title": snapshot.get("title", "(untitled)"),
                "start": snapshot.get("start", ""),
                "end": snapshot.get("end", ""),
                "location": snapshot.get("location", "") or "",
                "description": snapshot.get("description", "") or "",
                "deleted_at": event.last_modified_at.isoformat() if event.last_modified_at else "",
                "can_restore": True,
            })
        
        # Determine message
        search_criteria = []
        if title:
            search_criteria.append(f"title '{title}'")
        if location:
            search_criteria.append(f"location '{location}'")
        if start_date or end_date:
            if start_date and end_date:
                search_criteria.append(f"between {start_date} and {end_date}")
            elif start_date:
                search_criteria.append(f"from {start_date}")
            elif end_date:
                search_criteria.append(f"until {end_date}")
        
        criteria_str = " and ".join(search_criteria) if search_criteria else "all deleted events"
        
        if len(events_list) == 1:
            message = f"Found 1 deleted event matching {criteria_str}"
        else:
            message = f"Found {len(events_list)} deleted events matching {criteria_str}"
        
        return _json_tool_response(
            status="success",
            message=message,
            events=events_list,
            event_count=len(events_list),
        )
    
    except Exception as exc:
        logger.exception("Error getting deleted event details")
        return _json_tool_response(
            status="error",
            message=f"Failed to get deleted event details: {exc}",
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
        """Get events in a date/time range.
        
        Args:
            start_time: Start datetime (ISO-8601)
            end_time: End datetime (ISO-8601)
            timezone: Optional IANA timezone
            calendar_id: Optional calendar id
            max_results: Max events (default 20)
        
        Returns: JSON with event list
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
        """Create calendar event. Requires: title, start_time, end_time.
        
        Args:
            title: Event title (required)
            start_time: Event start datetime in ISO-8601 format (required)
            end_time: Event end datetime in ISO-8601 format (required)
            timezone: Optional IANA timezone
            description: Optional event notes (not address/business)
            location: Optional event location (address or business name)
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
        """Modify an agent-created event (only agent-created events).
        
        Args:
            event_id: The event ID to modify (required, must be agent-created)
            title: New event title (optional)
            start_time: New start datetime in ISO-8601 format (optional)
            end_time: New end datetime in ISO-8601 format (optional)
            timezone: Optional IANA timezone for new times
            description: New event notes (optional, not address/business)
            location: New event location (optional, address or business name)
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
        """Delete an agent-created event (can restore with rollback).
        
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
        """Undo the most recent action on an agent-created event.
        
        Args:
            event_id: Event ID to rollback (must be agent-created)
            calendar_id: Optional calendar id
        
        Returns: JSON with success/error
        """
        return _rollback_event_tool_impl(
            uid=cleaned_uid,
            event_id=event_id,
            calendar_id=calendar_id,
        )

    @tool(args_schema=CheckAgentEventInput)
    def check_agent_event(event_id: str, calendar_id: Optional[str] = None) -> str:
        """Check if an event was created by the agent (for debugging/confirmation).
        
        Use this tool only when you need to verify if the agent created a specific event.
        CRUD operations (modify, delete, rollback) already check this internally.
        
        Args:
            event_id: The event ID to verify
            calendar_id: Optional calendar id. Defaults to configured calendar.
        
        Returns: JSON confirming if event is agent-created with its details
        """
        agent_event = _verify_agent_created_event(uid=cleaned_uid, event_id=event_id)
        
        if not agent_event:
            return _json_tool_response(
                status="not_found",
                message=f"Event {event_id} was NOT created by the agent.",
                is_agent_created=False,
            )
        
        # Get event details from snapshot
        snapshot = agent_event.snapshot or agent_event.previous_snapshot or {}
        display_status = "active" if agent_event.snapshot else ("deleted" if agent_event.status == "deleted" else agent_event.status)
        
        return _json_tool_response(
            status="success",
            message=f"Event {event_id} WAS created by the agent.",
            is_agent_created=True,
            event={
                "id": agent_event.google_event_id,
                "title": snapshot.get("title", "(untitled)"),
                "start": snapshot.get("start", ""),
                "end": snapshot.get("end", ""),
                "calendar": agent_event.calendar_id,
                "status": display_status,
                "created_at": agent_event.created_at.isoformat() if agent_event.created_at else "",
            },
        )

    @tool(args_schema=ListAgentEventsInput)
    def list_agent_events() -> str:
        """List all calendar events created by the agent.
        
        Returns: JSON with event list
        """
        return _list_agent_events_impl(uid=cleaned_uid)

    @tool(args_schema=GetEventDetailsInput)
    def get_event_details(
        start_date: Optional[str] = None,
        start_time: Optional[str] = None,
        end_date: Optional[str] = None,
        end_time: Optional[str] = None,
        title: Optional[str] = None,
        location: Optional[str] = None,
        timezone: Optional[str] = None,
        calendar_id: Optional[str] = None,
    ) -> str:
        """Search/browse calendar by timeframe and/or filters.
        
        Args:
            start_date: Start date (YYYY-MM-DD)
            start_time: Start time (HH:MM)
            end_date: End date (YYYY-MM-DD)
            end_time: End time (HH:MM)
            title: Filter by title (partial match, case-insensitive)
            location: Filter by location (partial match, case-insensitive)
            timezone: Optional IANA timezone
            calendar_id: Optional calendar id
        
        Returns: JSON with matching events or empty list
        """
        return _get_event_details_impl(
            uid=cleaned_uid,
            start_date=start_date,
            start_time=start_time,
            end_date=end_date,
            end_time=end_time,
            title=title,
            location=location,
            timezone=timezone,
            calendar_id=calendar_id,
        )

    @tool(args_schema=GetDeletedEventDetailsInput)
    def get_deleted_event_details(
        title: Optional[str] = None,
        location: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> str:
        """Search deleted events created by the agent (for restoration).
        
        Queries Firestore for deleted agent-created events. Use this to find and identify
        which deleted event to restore with rollback_event.
        
        Args:
            title: Filter by deleted event title (partial match, case-insensitive)
            location: Filter by deleted event location (partial match, case-insensitive)
            start_date: Filter events deleted on or after this date (YYYY-MM-DD)
            end_date: Filter events deleted on or before this date (YYYY-MM-DD)
        
        Returns: JSON with deleted events matching filters or empty list
        """
        return _get_deleted_event_details_impl(
            uid=cleaned_uid,
            title=title,
            location=location,
            start_date=start_date,
            end_date=end_date,
        )

    return [
        # get_user_calendar,  # DEPRECATED: Use get_event_details with start_time/end_time instead
        # list_agent_events,
        check_agent_event,
        get_event_details,
        get_deleted_event_details,
        add_event_to_calendar,
        modify_event,
        delete_event,
        rollback_event,
    ]

