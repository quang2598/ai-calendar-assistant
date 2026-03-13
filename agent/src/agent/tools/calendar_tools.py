from __future__ import annotations

import json
from datetime import datetime
from typing import List, Optional

from langchain_core.tools import BaseTool, StructuredTool
from pydantic import BaseModel, ConfigDict, Field

from config import trace_span
from utility.google_calendar_utility import (
    CreateCalendarEventRequest,
    create_user_calendar_event,
    list_user_calendar_events,
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
    calendar_id: Optional[str] = Field(
        default=None,
        description="Optional calendar id. Defaults to configured calendar.",
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
        events = list_user_calendar_events(
            uid=uid,
            start_time=start_dt,
            end_time=end_dt,
            timezone_name=timezone,
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
        )

    return _json_tool_response(
        status="success",
        message=f"Found {len(items)} calendar events.",
        events=items,
        event_count=len(items),
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
    calendar_id: Optional[str],
) -> str:
    missing_fields: List[str] = []

    cleaned_title = (title or "").strip()
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
        created_event = create_user_calendar_event(
            uid=uid,
            request=CreateCalendarEventRequest(
                title=cleaned_title,
                start_time=start_dt,
                end_time=end_dt,
                timezone_name=timezone,
                description=description,
                location=location,
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
        event={
            "id": created_event.event_id,
            "title": created_event.title,
            "start": created_event.start,
            "end": created_event.end,
            "status": created_event.status,
            "location": created_event.location,
            "description": created_event.description,
            "htmlLink": created_event.html_link,
        },
    )


def build_calendar_tools(uid: str) -> List[BaseTool]:
    cleaned_uid = uid.strip()
    if not cleaned_uid:
        raise ValueError("uid must not be empty when building calendar tools.")

    def get_user_calendar(
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
        timezone: Optional[str] = None,
        calendar_id: Optional[str] = None,
        max_results: int = 20,
    ) -> str:
        return _get_user_calendar_impl(
            uid=cleaned_uid,
            start_time=start_time,
            end_time=end_time,
            timezone=timezone,
            calendar_id=calendar_id,
            max_results=max_results,
        )

    def add_event_to_calendar(
        title: Optional[str] = None,
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
        timezone: Optional[str] = None,
        description: Optional[str] = None,
        location: Optional[str] = None,
        calendar_id: Optional[str] = None,
    ) -> str:
        return _add_event_to_calendar_impl(
            uid=cleaned_uid,
            title=title,
            start_time=start_time,
            end_time=end_time,
            timezone=timezone,
            description=description,
            location=location,
            calendar_id=calendar_id,
        )

    get_user_calendar_tool = StructuredTool.from_function(
        func=get_user_calendar,
        name="get_user_calendar",
        description=(
            "Read events from the user's Google Calendar for a given timeframe. "
            "If timeframe is missing, defaults are applied. "
            "Use this before answering calendar availability questions."
        ),
        args_schema=GetUserCalendarInput,
    )

    add_event_to_calendar_tool = StructuredTool.from_function(
        func=add_event_to_calendar,
        name="add_event_to_calendar",
        description=(
            "Create a Google Calendar event for the user. "
            "Requires title, start_time, and end_time. "
            "If required fields are missing, the tool returns missing_fields."
        ),
        args_schema=AddEventToCalendarInput,
    )

    return [get_user_calendar_tool, add_event_to_calendar_tool]
