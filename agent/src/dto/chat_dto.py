from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator


class ActionHistory(BaseModel):
    """Record of an action (create/update/delete) taken by the agent on a calendar event."""
    action_type: Literal["add", "update", "delete"] = Field(
        description="Type of action: 'add' for create, 'update' for modify, 'delete' for remove"
    )
    already_rolled_back: bool = Field(
        default=False,
        description="Whether this action has been rolled back"
    )
    created_at: datetime = Field(
        description="Timestamp when the action was taken"
    )
    event_id: str = Field(
        min_length=1,
        description="Google Calendar event ID (UUID)"
    )
    event_title: str = Field(
        min_length=1,
        description="Title of the event at the time of the action"
    )
    description: Optional[str] = Field(
        default=None,
        description="Short summary of what was changed (e.g., 'Updated title and start time')"
    )

    model_config = ConfigDict(extra="forbid")


class UserLocation(BaseModel):
    """User's geolocation coordinates from browser."""
    latitude: float = Field(ge=-90, le=90, description="Latitude coordinate")
    longitude: float = Field(ge=-180, le=180, description="Longitude coordinate")
    accuracy: Optional[float] = Field(default=None, ge=0, description="Accuracy in meters")

    model_config = ConfigDict(extra="forbid")


class SendChatRequest(BaseModel):
    conversationId: str = Field(min_length=1, max_length=256)
    message: str = Field(min_length=1, max_length=4000)
    userLocation: Optional[UserLocation] = Field(default=None, description="User's geolocation from browser")

    model_config = ConfigDict(extra="forbid")

    @field_validator("message")
    @classmethod
    def strip_required_fields(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("must not be empty")
        return cleaned

    @field_validator("conversationId")
    @classmethod
    def normalize_conversation_id(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("must not be empty")
        return cleaned


class ResponseMessage(BaseModel):
    text: str = Field(min_length=1, max_length=8000)

    model_config = ConfigDict(extra="forbid")

    @field_validator("text")
    @classmethod
    def strip_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("must not be empty")
        return cleaned


class SendChatResponse(BaseModel):
    responseMessage: ResponseMessage

    model_config = ConfigDict(extra="forbid")

    @classmethod
    def from_text(cls, text: str) -> "SendChatResponse":
        return cls(responseMessage=ResponseMessage(text=text))
