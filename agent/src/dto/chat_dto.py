from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, field_validator


class SendChatRequest(BaseModel):
    uid: str = Field(min_length=1, max_length=128)
    conversationId: str = Field(min_length=1, max_length=256)
    message: str = Field(min_length=1, max_length=4000)

    model_config = ConfigDict(extra="forbid")

    @field_validator("uid", "message")
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
