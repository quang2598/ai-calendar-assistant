from __future__ import annotations

import pytest
from pydantic import ValidationError

from dto.chat_dto import SendChatRequest, SendChatResponse


def test_send_chat_request_trims_fields() -> None:
    payload = SendChatRequest(
        uid=" user-123 ",
        conversationId=" convo-1 ",
        message=" hello ",
    )

    assert payload.uid == "user-123"
    assert payload.conversationId == "convo-1"
    assert payload.message == "hello"


def test_send_chat_request_rejects_empty_conversation_id() -> None:
    with pytest.raises(ValidationError):
        SendChatRequest(
            uid="user-123",
            conversationId="   ",
            message="hello",
        )


def test_send_chat_response_from_text_trims_message() -> None:
    response = SendChatResponse.from_text("  hi there  ")

    assert response.responseMessage.text == "hi there"
