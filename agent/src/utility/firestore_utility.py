from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import List, Optional

from google.cloud.firestore import DocumentSnapshot
from loguru import logger

from config import firestore_db, trace_span


@dataclass(frozen=True)
class ConversationMessage:
    role: str
    text: str
    created_at: Optional[str] = None


@dataclass(frozen=True)
class UserGoogleToken:
    access_token: Optional[str]
    refresh_token: str
    updated_at: Optional[datetime] = None


def _normalize_timestamp(value: object) -> Optional[str]:
    if isinstance(value, datetime):
        return value.isoformat()
    return None


def _to_datetime(value: object) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        normalized = value.replace("Z", "+00:00")
        try:
            return datetime.fromisoformat(normalized)
        except ValueError:
            return None
    return None


def _to_conversation_message(document: DocumentSnapshot) -> Optional[ConversationMessage]:
    payload = document.to_dict() or {}
    role = str(payload.get("role", "")).strip()
    text = str(payload.get("text", "")).strip()
    if not role or not text:
        logger.warning("Skipping malformed message document: {}", document.id)
        return None

    return ConversationMessage(
        role=role,
        text=text,
        created_at=_normalize_timestamp(payload.get("createdAt")),
    )


@trace_span("fetch_conversation_messages")
def fetch_conversation_messages(uid: str, conversation_id: str) -> List[ConversationMessage]:
    """
    Fetch all conversation messages ordered by createdAt ascending.
    """
    cleaned_conversation_id = conversation_id.strip()
    if not cleaned_conversation_id:
        raise ValueError("conversation_id must not be empty.")

    query = (
        firestore_db.collection("users")
        .document(uid)
        .collection("conversations")
        .document(cleaned_conversation_id)
        .collection("messages")
        .order_by("createdAt")
    )

    results: List[ConversationMessage] = []
    for doc in query.stream():
        message = _to_conversation_message(doc)
        if message is not None:
            results.append(message)
    return results


def _exclude_latest_user_message(
    messages: List[ConversationMessage], latest_user_message: str
) -> List[ConversationMessage]:
    if not messages:
        return []

    latest_cleaned = latest_user_message.strip()
    for index in range(len(messages) - 1, -1, -1):
        item = messages[index]
        if item.role.lower() == "user" and item.text.strip() == latest_cleaned:
            return messages[:index] + messages[index + 1 :]

    # Fallback for the expected backend workflow: latest message is the newest item.
    logger.warning(
        "Latest user message not found in Firestore history; dropping most recent message for safety."
    )
    return messages[:-1]


@trace_span("load_agent_history_messages")
def load_agent_history_messages(
    uid: str, conversation_id: str, latest_user_message: str
) -> List[ConversationMessage]:
    """
    History for agent context:
    - Load all messages ordered by createdAt.
    - Exclude the latest user message (already present in API payload).
    """
    all_messages = fetch_conversation_messages(uid=uid, conversation_id=conversation_id)
    return _exclude_latest_user_message(
        messages=all_messages,
        latest_user_message=latest_user_message,
    )


def _google_token_document(uid: str):
    return firestore_db.collection("users").document(uid).collection("tokens").document("google")


@trace_span("fetch_user_google_token")
def fetch_user_google_token(uid: str) -> UserGoogleToken:
    token_doc = _google_token_document(uid).get()
    if not token_doc.exists:
        raise RuntimeError(f"Google token document is missing for user: {uid}")

    payload = token_doc.to_dict() or {}
    access_token_raw = payload.get("accessToken")
    access_token = str(access_token_raw).strip() if access_token_raw is not None else ""
    refresh_token = str(payload.get("refreshToken", "")).strip()
    updated_at = _to_datetime(payload.get("updatedAt"))

    if not refresh_token:
        raise RuntimeError(f"Google refreshToken is missing for user: {uid}")

    return UserGoogleToken(
        access_token=access_token or None,
        refresh_token=refresh_token,
        updated_at=updated_at,
    )


@trace_span("update_user_google_access_token")
def update_user_google_access_token(
    uid: str, access_token: str, updated_at: Optional[datetime] = None
) -> None:
    cleaned_access_token = access_token.strip()
    if not cleaned_access_token:
        raise ValueError("access_token must not be empty")

    updated_at_value = updated_at or datetime.now(tz=timezone.utc)
    _google_token_document(uid).set(
        {
            "accessToken": cleaned_access_token,
            "updatedAt": updated_at_value,
        },
        merge=True,
    )
