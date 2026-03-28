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


# Agent-Created Events Tracking
# ==============================
# Firestore schema for agent-created-events subcollection:
# 
# /users/{uid}/agent-created-events/{eventId}
# {
#   "googleEventId": "string",           # Google Calendar event ID
#   "calendarId": "string",              # Calendar ID where event was created
#   "createdAt": datetime,               # When agent created the event
#   "metadata": {
#     "summary": "string",               # Event title
#     "start": "string",                 # ISO-8601 start time
#     "end": "string",                   # ISO-8601 end time
#     "timezone": "string",              # Event timezone
#     "description": "string" (optional),
#     "location": "string" (optional),
#     "invitees": ["email1", "email2"] (optional)
#   },
#   "snapshot": {                        # Full original event data right after creation
#     "id": "string",
#     "summary": "string",
#     "start": {...},
#     "end": {...},
#     ... (all Google Calendar event fields)
#   },
#   "previousSnapshot": {                # Previous state before last modification (for rollback)
#     "snapshot": {...},
#     "modifiedAt": datetime,
#   },
#   "lastModifiedAt": datetime (optional)
# }


@dataclass(frozen=True)
class AgentCreatedEvent:
    """Represents a calendar event created by the agent."""
    google_event_id: str
    calendar_id: str
    created_at: datetime
    metadata: dict
    snapshot: dict
    previous_snapshot: Optional[dict] = None
    last_modified_at: Optional[datetime] = None


def _agent_created_events_collection(uid: str):
    """Get reference to user's agent-created-events subcollection."""
    return (
        firestore_db.collection("users")
        .document(uid)
        .collection("agent-created-events")
    )


@trace_span("store_agent_created_event")
def store_agent_created_event(
    uid: str,
    google_event_id: str,
    calendar_id: str,
    metadata: dict,
    snapshot: dict,
) -> None:
    """
    Store a record of an agent-created event in Firestore.
    
    Args:
        uid: User ID
        google_event_id: Google Calendar event ID
        calendar_id: Calendar ID where event was created
        metadata: Event metadata (summary, start, end, timezone, description, location, invitees)
        snapshot: Full event data right after creation (for rollback)
    """
    cleaned_uid = uid.strip()
    cleaned_event_id = google_event_id.strip()
    cleaned_calendar_id = calendar_id.strip()
    
    if not cleaned_uid or not cleaned_event_id or not cleaned_calendar_id:
        raise ValueError("uid, google_event_id, and calendar_id must not be empty")
    
    if not isinstance(metadata, dict) or not isinstance(snapshot, dict):
        raise ValueError("metadata and snapshot must be dictionaries")
    
    created_at = datetime.now(tz=timezone.utc)
    
    _agent_created_events_collection(cleaned_uid).document(cleaned_event_id).set(
        {
            "googleEventId": cleaned_event_id,
            "calendarId": cleaned_calendar_id,
            "createdAt": created_at,
            "metadata": metadata,
            "snapshot": snapshot,
            "previousSnapshot": snapshot,  # Initialize with the same snapshot for first rollback
            "lastModifiedAt": None,
        },
        merge=False,
    )
    logger.info(
        "Stored agent-created event record: uid={}, eventId={}, calendar={}",
        cleaned_uid,
        cleaned_event_id,
        cleaned_calendar_id,
    )


@trace_span("get_agent_created_event")
def get_agent_created_event(uid: str, google_event_id: str) -> Optional[AgentCreatedEvent]:
    """
    Retrieve an agent-created event record from Firestore.
    
    Args:
        uid: User ID
        google_event_id: Google Calendar event ID
        
    Returns:
        AgentCreatedEvent if found, None otherwise
    """
    cleaned_uid = uid.strip()
    cleaned_event_id = google_event_id.strip()
    
    if not cleaned_uid or not cleaned_event_id:
        return None
    
    doc = _agent_created_events_collection(cleaned_uid).document(cleaned_event_id).get()
    
    if not doc.exists:
        return None
    
    payload = doc.to_dict() or {}
    
    return AgentCreatedEvent(
        google_event_id=str(payload.get("googleEventId", "")),
        calendar_id=str(payload.get("calendarId", "")),
        created_at=_to_datetime(payload.get("createdAt")) or datetime.now(tz=timezone.utc),
        metadata=payload.get("metadata", {}),
        snapshot=payload.get("snapshot", {}),
        previous_snapshot=payload.get("previousSnapshot", {}) or None,
        last_modified_at=_to_datetime(payload.get("lastModifiedAt")),
    )


@trace_span("list_agent_created_events")
def list_agent_created_events(uid: str) -> List[AgentCreatedEvent]:
    """
    List all events created by the agent for a user.
    
    Args:
        uid: User ID
        
    Returns:
        List of AgentCreatedEvent records
    """
    cleaned_uid = uid.strip()
    if not cleaned_uid:
        return []
    
    results: List[AgentCreatedEvent] = []
    for doc in _agent_created_events_collection(cleaned_uid).stream():
        payload = doc.to_dict() or {}
        event = AgentCreatedEvent(
            google_event_id=str(payload.get("googleEventId", "")),
            calendar_id=str(payload.get("calendarId", "")),
            created_at=_to_datetime(payload.get("createdAt")) or datetime.now(tz=timezone.utc),
            metadata=payload.get("metadata", {}),
            snapshot=payload.get("snapshot", {}),
            previous_snapshot=payload.get("previousSnapshot", {}) or None,
            last_modified_at=_to_datetime(payload.get("lastModifiedAt")),
        )
        results.append(event)
    
    return results


@trace_span("update_agent_event_snapshot")
def update_agent_event_snapshot(
    uid: str,
    google_event_id: str,
    current_snapshot: dict,
    new_snapshot: dict,
) -> None:
    """
    Update the snapshot of an agent-created event before modifying it.
    Saves the current snapshot as previousSnapshot for rollback.
    
    Args:
        uid: User ID
        google_event_id: Google Calendar event ID
        current_snapshot: The current event snapshot (will become previousSnapshot)
        new_snapshot: The new event snapshot to store
    """
    cleaned_uid = uid.strip()
    cleaned_event_id = google_event_id.strip()
    
    if not cleaned_uid or not cleaned_event_id:
        raise ValueError("uid and google_event_id must not be empty")
    
    if not isinstance(current_snapshot, dict) or not isinstance(new_snapshot, dict):
        raise ValueError("Snapshots must be dictionaries")
    
    now = datetime.now(tz=timezone.utc)
    
    _agent_created_events_collection(cleaned_uid).document(cleaned_event_id).set(
        {
            "previousSnapshot": current_snapshot,  # Store just the snapshot for consistency
            "snapshot": new_snapshot,
            "lastModifiedAt": now,
        },
        merge=True,
    )
    logger.info(
        "Updated snapshot for agent-created event: uid={}, eventId={}",
        cleaned_uid,
        cleaned_event_id,
    )


@trace_span("delete_agent_created_event_record")
def delete_agent_created_event_record(uid: str, google_event_id: str) -> None:
    """
    Delete the Firestore record of an agent-created event.
    
    Args:
        uid: User ID
        google_event_id: Google Calendar event ID
    """
    cleaned_uid = uid.strip()
    cleaned_event_id = google_event_id.strip()
    
    if not cleaned_uid or not cleaned_event_id:
        raise ValueError("uid and google_event_id must not be empty")
    
    _agent_created_events_collection(cleaned_uid).document(cleaned_event_id).delete()
    logger.info(
        "Deleted Firestore record for agent-created event: uid={}, eventId={}",
        cleaned_uid,
        cleaned_event_id,
    )
