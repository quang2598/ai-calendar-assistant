from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import List, Optional

from google.cloud.firestore import DocumentSnapshot
from loguru import logger

from config import firestore_db
from utility.tracing_utils import trace_span


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
def fetch_conversation_messages(uid: str, conversation_id: str, limit: int = 10) -> List[ConversationMessage]:
    """
    Fetch conversation messages ordered by createdAt descending (latest first).
    
    Args:
        uid: User ID
        conversation_id: Conversation ID
        limit: Maximum number of messages to fetch (default 50 to optimize I/O)
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
        .order_by("createdAt", direction="DESCENDING")
        .limit(limit)
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
# Firestore schema for event-managed-by-agent subcollection:
# 
# /users/{uid}/event-managed-by-agent/{eventId}
# {
#   "googleEventId": "string",           # Google Calendar event ID
#   "calendarId": "string",              # Calendar ID where event was created
#   "createdAt": datetime,               # When agent created the event
#   "status": "active" | "deleted",      # Event status (active or deleted)
#   "snapshot": {                        # Full event data right after creation
#     "id": "string",
#     "summary": "string",
#     "start": {...},
#     "end": {...},
#     "timezone": "string",
#     "description": "string" (optional),
#     "location": "string" (optional),
#     "invitees": ["email1", "email2"] (optional),
#     ... (all other Google Calendar event fields)
#   },
#   "previousSnapshot": {                # Previous state before last modification (for rollback)
#     "id": "string",
#     "summary": "string",
#     ... (all fields from snapshot)
#   },
#   "lastModifiedAt": datetime (optional)
# }


@dataclass(frozen=True)
class AgentCreatedEvent:
    """Represents a calendar event created by the agent."""
    google_event_id: str
    calendar_id: str
    created_at: datetime
    status: str  # "active" or "deleted"
    snapshot: Optional[dict]  # current event state (None if deleted)
    previous_snapshot: Optional[dict] = None  # state before last modification
    last_modified_at: Optional[datetime] = None


def _agent_created_events_collection(uid: str):
    """Get reference to user's event-managed-by-agent subcollection."""
    return (
        firestore_db.collection("users")
        .document(uid)
        .collection("event-managed-by-agent")
    )


@trace_span("store_agent_created_event")
def store_agent_created_event(
    uid: str,
    google_event_id: str,
    calendar_id: str,
    snapshot: dict,
) -> None:
    """
    Store a record of an agent-created event in Firestore.
    
    Args:
        uid: User ID
        google_event_id: Google Calendar event ID
        calendar_id: Calendar ID where event was created
        snapshot: Full event data right after creation (for rollback)
    """
    cleaned_uid = uid.strip()
    cleaned_event_id = google_event_id.strip()
    cleaned_calendar_id = calendar_id.strip()
    
    if not cleaned_uid or not cleaned_event_id or not cleaned_calendar_id:
        raise ValueError("uid, google_event_id, and calendar_id must not be empty")
    
    if not isinstance(snapshot, dict):
        raise ValueError("snapshot must be a dictionary")
    
    created_at = datetime.now(tz=timezone.utc)
    
    _agent_created_events_collection(cleaned_uid).document(cleaned_event_id).set(
        {
            "googleEventId": cleaned_event_id,
            "calendarId": cleaned_calendar_id,
            "createdAt": created_at,
            "status": "active",
            "snapshot": snapshot,
            "previousSnapshot": None,  # No previous snapshot for new events
            "lastModifiedAt": None,
        },
        merge=False,
    )
    logger.info(
        "Stored agent-created event record: eventId={}, calendar={}",
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
        status=str(payload.get("status", "active")),
        snapshot=payload.get("snapshot"),
        previous_snapshot=payload.get("previousSnapshot"),
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
            status=str(payload.get("status", "active")),
            snapshot=payload.get("snapshot"),
            previous_snapshot=payload.get("previousSnapshot"),
            last_modified_at=_to_datetime(payload.get("lastModifiedAt")),
        )
        results.append(event)
    
    return results


@trace_span("update_agent_event_snapshot")
def update_agent_event_snapshot(
    uid: str,
    google_event_id: str,
    current_snapshot: Optional[dict],
    new_snapshot: Optional[dict],
    status: str = "active",
) -> None:
    """
    Update the snapshot of an agent-created event.
    Saves the current snapshot as previousSnapshot for rollback.
    
    Args:
        uid: User ID
        google_event_id: Google Calendar event ID
        current_snapshot: The current event snapshot (will become previousSnapshot)
        new_snapshot: The new event snapshot to store (can be None if deleted)
        status: Event status ("active" or "deleted")
    """
    cleaned_uid = uid.strip()
    cleaned_event_id = google_event_id.strip()
    
    if not cleaned_uid or not cleaned_event_id:
        raise ValueError("uid and google_event_id must not be empty")
    
    if status not in ("active", "deleted"):
        raise ValueError("status must be 'active' or 'deleted'")
    
    now = datetime.now(tz=timezone.utc)
    
    _agent_created_events_collection(cleaned_uid).document(cleaned_event_id).set(
        {
            "status": status,
            "previousSnapshot": current_snapshot,
            "snapshot": new_snapshot,
            "lastModifiedAt": now,
        },
        merge=True,
    )


# Action History Tracking
# =======================
# Firestore schema for action-history subcollection:
#
# /users/{uid}/action-history/{actionId}
# {
#   "actionType": "add" | "update" | "delete",  # Type of action performed
#   "alreadyRolledBack": boolean,                # Whether action has been rolled back
#   "createdAt": datetime,                       # When the action was taken
#   "eventId": "string",                         # Google Calendar event ID
#   "eventTitle": "string",                      # Event title at time of action
# }


@dataclass(frozen=True)
class ActionHistoryRecord:
    """Represents a single action (create/update/delete) taken by the agent."""
    action_type: str  # "add", "update", or "delete"
    already_rolled_back: bool
    created_at: datetime
    event_id: str
    event_title: str
    description: Optional[str] = None  # Short summary of changes


def _action_history_collection(uid: str):
    """Get reference to user's action-history subcollection."""
    return (
        firestore_db.collection("users")
        .document(uid)
        .collection("action-history")
    )


@trace_span("store_action_history")
def store_action_history(
    uid: str,
    action_type: str,
    event_id: str,
    event_title: str,
    already_rolled_back: bool = False,
    description: Optional[str] = None,
) -> str:
    """
    Store a record of an action (create/update/delete) in Firestore.
    
    Args:
        uid: User ID
        action_type: Type of action ("add", "update", or "delete")
        event_id: Google Calendar event ID
        event_title: Event title at the time of the action
        already_rolled_back: Whether this action has been rolled back
        description: Short summary of what was changed
        
    Returns:
        The document ID of the created action history record
    """
    cleaned_uid = uid.strip()
    cleaned_action_type = action_type.strip().lower()
    cleaned_event_id = event_id.strip()
    cleaned_title = event_title.strip()
    cleaned_description = description.strip() if description else None
    
    if not cleaned_uid or not cleaned_event_id or not cleaned_title:
        raise ValueError("uid, event_id, and event_title must not be empty")
    
    if cleaned_action_type not in ("add", "update", "delete"):
        raise ValueError("action_type must be 'add', 'update', or 'delete'")
    
    created_at = datetime.now(tz=timezone.utc)
    
    # Use auto-generated document ID
    doc_ref = _action_history_collection(cleaned_uid).document()
    doc_ref.set(
        {
            "actionType": cleaned_action_type,
            "alreadyRolledBack": already_rolled_back,
            "createdAt": created_at,
            "eventId": cleaned_event_id,
            "eventTitle": cleaned_title,
            "description": cleaned_description,
        },
        merge=False,
    )
    logger.info(
        "Stored action history record: actionType={}, eventId={}, eventTitle={}, description={}",
        cleaned_action_type,
        cleaned_event_id,
        cleaned_title,
        cleaned_description,
    )
    return doc_ref.id


@trace_span("get_action_history_by_event")
def get_action_history_by_event(uid: str, event_id: str) -> List[ActionHistoryRecord]:
    """
    Get all action history records for a specific event.
    
    Args:
        uid: User ID
        event_id: Google Calendar event ID
        
    Returns:
        List of ActionHistoryRecord for the event, ordered by createdAt
    """
    cleaned_uid = uid.strip()
    cleaned_event_id = event_id.strip()
    
    if not cleaned_uid or not cleaned_event_id:
        return []
    
    # Query without order_by to avoid requiring composite index
    # We'll do client-side sorting instead
    query = _action_history_collection(cleaned_uid).where("eventId", "==", cleaned_event_id)
    
    results: List[ActionHistoryRecord] = []
    for doc in query.stream():
        payload = doc.to_dict() or {}
        record = ActionHistoryRecord(
            action_type=str(payload.get("actionType", "")).strip(),
            already_rolled_back=bool(payload.get("alreadyRolledBack", False)),
            created_at=_to_datetime(payload.get("createdAt")) or datetime.now(tz=timezone.utc),
            event_id=str(payload.get("eventId", "")).strip(),
            event_title=str(payload.get("eventTitle", "")).strip(),
            description=payload.get("description"),
        )
        results.append(record)
    
    # Sort by createdAt in ascending order (client-side)
    results.sort(key=lambda r: r.created_at)
    
    return results


@trace_span("list_all_action_history")
def list_all_action_history(uid: str) -> List[ActionHistoryRecord]:
    """
    Get all action history records for a user.
    
    Args:
        uid: User ID
        
    Returns:
        List of all ActionHistoryRecord for the user, ordered by createdAt descending
    """
    cleaned_uid = uid.strip()
    if not cleaned_uid:
        return []
    
    query = (
        _action_history_collection(cleaned_uid)
        .order_by("createdAt", direction="DESCENDING")
    )
    
    results: List[ActionHistoryRecord] = []
    for doc in query.stream():
        payload = doc.to_dict() or {}
        record = ActionHistoryRecord(
            action_type=str(payload.get("actionType", "")).strip(),
            already_rolled_back=bool(payload.get("alreadyRolledBack", False)),
            created_at=_to_datetime(payload.get("createdAt")) or datetime.now(tz=timezone.utc),
            event_id=str(payload.get("eventId", "")).strip(),
            event_title=str(payload.get("eventTitle", "")).strip(),
            description=payload.get("description"),
        )
        results.append(record)
    
    return results


@trace_span("get_latest_action")
def get_latest_action(uid: str) -> Optional[ActionHistoryRecord]:
    """
    Get the most recent action for a user.
    
    Args:
        uid: User ID
        
    Returns:
        The latest ActionHistoryRecord for the user, or None if no actions exist
    """
    cleaned_uid = uid.strip()
    if not cleaned_uid:
        return None
    
    # Get all actions and take the first one (they're ordered descending by createdAt)
    actions = list_all_action_history(cleaned_uid)
    
    if not actions:
        return None
    
    return actions[0]  # Most recent action


@trace_span("mark_action_as_rolled_back")
def mark_action_as_rolled_back(uid: str, event_id: str) -> None:
    """
    Mark the most recent action for an event as rolled back.
    
    Args:
        uid: User ID
        event_id: Google Calendar event ID
    """
    cleaned_uid = uid.strip()
    cleaned_event_id = event_id.strip()
    
    if not cleaned_uid or not cleaned_event_id:
        raise ValueError("uid and event_id must not be empty")
    
    # Get all actions for this event and mark the most recent one
    actions = get_action_history_by_event(cleaned_uid, cleaned_event_id)
    
    if not actions:
        logger.warning(
            "No action history found to mark as rolled back: eventId={}",
            cleaned_event_id,
        )
        return
    
    # Mark the most recent action (last one, since ordered by createdAt ascending)
    most_recent = actions[-1]
    
    # Find and update the document with the most recent timestamp (highest createdAt)
    # Instead of using a filtered/ordered query (which requires a composite index),
    # iterate through all action documents and find the one with the latest timestamp
    query = _action_history_collection(cleaned_uid).where("eventId", "==", cleaned_event_id)
    
    most_recent_doc = None
    most_recent_timestamp = None
    
    for doc in query.stream():
        doc_data = doc.to_dict() or {}
        doc_created_at = doc_data.get("createdAt")
        
        # Track the document with the maximum (most recent) timestamp
        if doc_created_at is not None:
            if most_recent_timestamp is None or doc_created_at > most_recent_timestamp:
                most_recent_timestamp = doc_created_at
                most_recent_doc = doc
    
    # Update the most recent document
    if most_recent_doc:
        most_recent_doc.reference.update({"alreadyRolledBack": True})
        logger.info(
            "Marked action as rolled back: eventId={}, actionType={}, timestamp={}",
            cleaned_event_id,
            most_recent.action_type,
            most_recent_timestamp,
        )
    else:
        logger.warning(
            "Could not find action document to mark as rolled back: eventId={}",
            cleaned_event_id,
        )


@trace_span("trigger_frontend_calendar_update")
def trigger_frontend_calendar_update(
    uid: str,
    event_id: str = None,
    event_start: str = None,
) -> None:
    """
    Update user document to notify frontend that calendar was updated.
    Frontend listens for changes to the user document and fetches updated events.
    
    Args:
        uid: User ID
        event_id: Optional event ID that was updated (for debugging)
        event_start: Optional event start datetime (to jump to event's date)
    """
    cleaned_uid = uid.strip()
    
    if not cleaned_uid:
        raise ValueError("uid must not be empty")
    
    trigger_timestamp = datetime.now(tz=timezone.utc)
    
    # Update the user document with lastCalendarUpdate timestamp and event start date
    # This triggers the frontend listener on the user document
    update_data = {
        "lastCalendarUpdate": trigger_timestamp,
    }
    
    # If event start time is provided, extract the date for frontend to navigate to
    if event_start:
        update_data["lastCalendarUpdateEventDate"] = event_start
    
    firestore_db.collection("users").document(cleaned_uid).update(update_data)
    
    logger.info(
        "Triggered frontend calendar update: eventId={}, eventStart={}",
        event_id or "all",
        event_start or "unknown",
    )
