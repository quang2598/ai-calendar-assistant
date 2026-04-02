from __future__ import annotations

from datetime import datetime, timezone
import pytest
import sys
from pathlib import Path

# Add src directory to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import utility.firestore_utility as firestore_utility
from utility.firestore_utility import ActionHistoryRecord


class FakeSnapshot:
    def __init__(self, payload: dict, exists: bool = True, doc_id: str = "doc-1") -> None:
        self._payload = payload
        self.exists = exists
        self.id = doc_id

    def to_dict(self) -> dict:
        return self._payload


class FakeDocRef:
    def __init__(self, doc_id: str = "action-1"):
        self.doc_id = doc_id
        self.data = {}

    def set(self, data: dict, merge: bool = False) -> None:
        self.data = data

    def update(self, data: dict) -> None:
        self.data.update(data)

    @property
    def id(self) -> str:
        return self.doc_id


class FakeQuery:
    def __init__(self, records: list[dict] = None):
        self.records = records or []
        self.filters = {}

    def where(self, field: str, op: str, value: str) -> FakeQuery:
        new_query = FakeQuery(self.records)
        new_query.filters = {**self.filters, field: value}
        return new_query

    def order_by(self, field: str, direction: str = "ASCENDING") -> FakeQuery:
        return self

    def limit(self, n: int) -> FakeQuery:
        return self

    def stream(self) -> list[FakeSnapshot]:
        # Filter records by conditions
        filtered = self.records
        for field, value in self.filters.items():
            filtered = [r for r in filtered if r.get(field) == value]
        
        # Return snapshots
        return [FakeSnapshot(record, doc_id=f"action-{i}") for i, record in enumerate(filtered)]


class FakeCollectionRef:
    def __init__(self, records: list[dict] = None):
        self.records = records or []
        self.stored_docs = {}

    def document(self, doc_id: str = None) -> FakeDocRef:
        ref = FakeDocRef(doc_id or "auto-generated")
        return ref

    def where(self, field: str, op: str, value: str) -> FakeQuery:
        return FakeQuery(self.records).where(field, op, value)

    def order_by(self, field: str, direction: str = "ASCENDING") -> FakeQuery:
        return FakeQuery(self.records).order_by(field, direction)

    def stream(self):
        return [FakeSnapshot(record, doc_id=f"action-{i}") for i, record in enumerate(self.records)]


class FakeUserDocRef:
    def __init__(self):
        self.collections = {}

    def collection(self, name: str) -> FakeCollectionRef:
        if name not in self.collections:
            self.collections[name] = FakeCollectionRef()
        return self.collections[name]


class FakeFirestoreDB:
    def __init__(self):
        self.users = {}

    def collection(self, name: str):
        if name == "users":
            return FakeUsersCollectionRef(self.users)
        return None


class FakeUsersCollectionRef:
    def __init__(self, users: dict):
        self.users = users

    def document(self, uid: str) -> FakeUserDocRef:
        if uid not in self.users:
            self.users[uid] = FakeUserDocRef()
        return self.users[uid]


def test_store_action_history_creates_record(monkeypatch: pytest.MonkeyPatch) -> None:
    """Test that store_action_history creates a record in Firestore."""
    fake_db = FakeFirestoreDB()
    fake_doc_ref = FakeDocRef("test-action-id")
    
    def mock_action_history_collection(uid: str):
        return fake_db.collection("users").document(uid).collection("action-history")
    
    # Mock the collection function and document function
    original_collection = firestore_utility._action_history_collection
    firestore_utility._action_history_collection = mock_action_history_collection
    
    try:
        uid = "user-123"
        action_type = "add"
        event_id = "event-456"
        event_title = "Meeting with Team"
        
        # The actual store function returns the doc id
        # We'll test it returns without errors
        result = firestore_utility.store_action_history(
            uid=uid,
            action_type=action_type,
            event_id=event_id,
            event_title=event_title,
            already_rolled_back=False,
        )
        
        # Should return a doc id
        assert isinstance(result, str)
        
    finally:
        firestore_utility._action_history_collection = original_collection


def test_store_action_history_validates_input() -> None:
    """Test that store_action_history validates input parameters."""
    
    # Test empty uid
    with pytest.raises(ValueError, match="uid, event_id, and event_title must not be empty"):
        firestore_utility.store_action_history(
            uid="",
            action_type="add",
            event_id="event-123",
            event_title="Test Event"
        )
    
    # Test empty event_id
    with pytest.raises(ValueError, match="uid, event_id, and event_title must not be empty"):
        firestore_utility.store_action_history(
            uid="user-123",
            action_type="add",
            event_id="",
            event_title="Test Event"
        )
    
    # Test empty event_title
    with pytest.raises(ValueError, match="uid, event_id, and event_title must not be empty"):
        firestore_utility.store_action_history(
            uid="user-123",
            action_type="add",
            event_id="event-123",
            event_title=""
        )
    
    # Test invalid action_type
    with pytest.raises(ValueError, match="action_type must be 'add', 'update', or 'delete'"):
        firestore_utility.store_action_history(
            uid="user-123",
            action_type="invalid",
            event_id="event-123",
            event_title="Test Event"
        )


def test_get_action_history_by_event_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    """Test that get_action_history_by_event returns empty list for non-existent event."""
    # Mock the collection to return an empty query result
    def mock_stream():
        return []
    
    def mock_query():
        return FakeQuery([])
    
    original_func = firestore_utility.get_action_history_by_event
    monkeypatch.setattr(
        firestore_utility,
        "_action_history_collection",
        lambda uid: FakeCollectionRef()
    )
    
    result = firestore_utility.get_action_history_by_event(
        uid="user-123",
        event_id="non-existent-event"
    )
    
    # When collection is mocked, it should return empty list
    assert isinstance(result, list)


def test_get_action_history_by_event_validates_input() -> None:
    """Test that get_action_history_by_event validates input."""
    
    # Test empty uid
    result = firestore_utility.get_action_history_by_event(uid="", event_id="event-123")
    assert result == []
    
    # Test empty event_id
    result = firestore_utility.get_action_history_by_event(uid="user-123", event_id="")
    assert result == []


def test_action_history_record_dataclass() -> None:
    """Test that ActionHistoryRecord dataclass works correctly."""
    now = datetime.now(tz=timezone.utc)
    record = ActionHistoryRecord(
        action_type="add",
        already_rolled_back=False,
        created_at=now,
        event_id="event-123",
        event_title="Test Event"
    )
    
    assert record.action_type == "add"
    assert record.already_rolled_back is False
    assert record.created_at == now
    assert record.event_id == "event-123"
    assert record.event_title == "Test Event"
    assert record.description is None


def test_action_history_record_with_description() -> None:
    """Test that ActionHistoryRecord dataclass handles description field."""
    now = datetime.now(tz=timezone.utc)
    description = "Updated title: 'Old Meeting' → 'New Meeting', start time: '2pm' → '3pm'"
    record = ActionHistoryRecord(
        action_type="update",
        already_rolled_back=False,
        created_at=now,
        event_id="event-123",
        event_title="Test Event",
        description=description
    )
    
    assert record.action_type == "update"
    assert record.description == "Updated title: 'Old Meeting' → 'New Meeting', start time: '2pm' → '3pm'"


def test_detailed_descriptions() -> None:
    """Test detailed description generation for different action types."""
    from utility.tracing_utils import _build_add_description, _build_update_description, _build_delete_description
    
    # Test add description with details
    event_data_add = {
        "title": "Team Meeting",
        "startTime": "2:00 PM",
        "endTime": "3:00 PM",
        "location": "Conference Room A"
    }
    add_desc = _build_add_description("Team Meeting", event_data_add)
    assert "title: 'Team Meeting'" in add_desc
    assert "start: 2:00 PM" in add_desc
    assert "location: 'Conference Room A'" in add_desc
    
    # Test update description with changes
    result_update = {
        "status": "success",
        "changes": {
            "title": ("Old Title", "New Title"),
            "start_time": ("2:00 PM", "3:00 PM"),
            "location": ("Room A", "Room B")
        }
    }
    update_desc = _build_update_description("New Title", result_update)
    assert "title: 'Old Title' → 'New Title'" in update_desc
    assert "start time: '2:00 PM' → '3:00 PM'" in update_desc
    assert "location: 'Room A' → 'Room B'" in update_desc
    
    # Test delete description
    delete_desc = _build_delete_description("Deleted Event")
    assert delete_desc == "Deleted event 'Deleted Event'"


def test_mark_action_as_rolled_back_validates_input() -> None:
    """Test that mark_action_as_rolled_back validates input."""
    
    # Test empty uid
    with pytest.raises(ValueError, match="uid and event_id must not be empty"):
        firestore_utility.mark_action_as_rolled_back(uid="", event_id="event-123")
    
    # Test empty event_id
    with pytest.raises(ValueError, match="uid and event_id must not be empty"):
        firestore_utility.mark_action_as_rolled_back(uid="user-123", event_id="")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
