from __future__ import annotations

from datetime import datetime, timezone

import pytest

import utility.firestore_utility as firestore_utility
from utility.firestore_utility import ConversationMessage, UserGoogleToken


class FakeSnapshot:
    def __init__(self, payload: dict, exists: bool = True, doc_id: str = "doc-1") -> None:
        self._payload = payload
        self.exists = exists
        self.id = doc_id

    def to_dict(self) -> dict:
        return self._payload


class FakeQuery:
    def __init__(self, snapshots):
        self.snapshots = snapshots

    def order_by(self, field):
        assert field == "createdAt"
        return self

    def stream(self):
        return self.snapshots


class FakeDocumentRef:
    def __init__(self, snapshots):
        self.snapshots = snapshots
        self.children = {}

    def collection(self, name: str):
        return self.children.setdefault(name, FakeCollectionRef(self.snapshots))


class FakeCollectionRef:
    def __init__(self, snapshots):
        self.snapshots = snapshots

    def document(self, doc_id: str):
        return FakeDocumentRef(self.snapshots)

    def order_by(self, field: str):
        return FakeQuery(self.snapshots)


class FakeFirestoreClient:
    def __init__(self, snapshots):
        self.snapshots = snapshots

    def collection(self, name: str):
        return FakeCollectionRef(self.snapshots)


class FakeTokenDoc:
    def __init__(self, snapshot: FakeSnapshot) -> None:
        self.snapshot = snapshot
        self.last_set = None

    def get(self) -> FakeSnapshot:
        return self.snapshot

    def set(self, payload: dict, merge: bool) -> None:
        self.last_set = {"payload": payload, "merge": merge}


def test_exclude_latest_user_message_removes_matching_user_turn() -> None:
    messages = [
        ConversationMessage(role="user", text="hello"),
        ConversationMessage(role="system", text="hi"),
        ConversationMessage(role="user", text="book a meeting"),
    ]

    result = firestore_utility._exclude_latest_user_message(messages, "book a meeting")

    assert result == messages[:2]


def test_normalize_timestamp_and_to_datetime_helpers() -> None:
    now = datetime(2026, 3, 12, 18, 0, tzinfo=timezone.utc)

    assert firestore_utility._normalize_timestamp(now) == now.isoformat()
    assert firestore_utility._normalize_timestamp("bad") is None
    assert firestore_utility._to_datetime(now.isoformat()) == now
    assert firestore_utility._to_datetime("bad") is None


def test_to_conversation_message_skips_malformed_document() -> None:
    snapshot = FakeSnapshot({"role": "user"}, doc_id="bad-doc")

    assert firestore_utility._to_conversation_message(snapshot) is None


def test_fetch_conversation_messages_orders_and_filters(monkeypatch: pytest.MonkeyPatch) -> None:
    snapshots = [
        FakeSnapshot(
            {
                "role": "user",
                "text": "hello",
                "createdAt": datetime(2026, 3, 12, 18, 0, tzinfo=timezone.utc),
            },
            doc_id="doc-1",
        ),
        FakeSnapshot({"role": "system"}, doc_id="doc-2"),
    ]
    monkeypatch.setattr(firestore_utility, "firestore_db", FakeFirestoreClient(snapshots))

    messages = firestore_utility.fetch_conversation_messages("user-1", "convo-1")

    assert messages == [
        ConversationMessage(
            role="user",
            text="hello",
            created_at="2026-03-12T18:00:00+00:00",
        )
    ]


def test_exclude_latest_user_message_falls_back_to_latest_message() -> None:
    messages = [
        ConversationMessage(role="user", text="hello"),
        ConversationMessage(role="system", text="hi"),
    ]

    result = firestore_utility._exclude_latest_user_message(messages, "not present")

    assert result == messages[:-1]


def test_load_agent_history_messages_uses_fetch(monkeypatch: pytest.MonkeyPatch) -> None:
    messages = [
        ConversationMessage(role="user", text="first"),
        ConversationMessage(role="system", text="reply"),
        ConversationMessage(role="user", text="latest"),
    ]
    monkeypatch.setattr(
        firestore_utility,
        "fetch_conversation_messages",
        lambda uid, conversation_id: messages,
    )

    result = firestore_utility.load_agent_history_messages("user-1", "convo-1", "latest")

    assert result == messages[:-1]


def test_fetch_user_google_token_allows_missing_access_token(monkeypatch: pytest.MonkeyPatch) -> None:
    token_doc = FakeTokenDoc(
        FakeSnapshot(
            {
                "refreshToken": "refresh-token",
                "updatedAt": datetime(2026, 3, 12, 18, 0, tzinfo=timezone.utc),
            }
        )
    )
    monkeypatch.setattr(firestore_utility, "_google_token_document", lambda uid: token_doc)

    token = firestore_utility.fetch_user_google_token("user-1")

    assert token == UserGoogleToken(
        access_token=None,
        refresh_token="refresh-token",
        updated_at=datetime(2026, 3, 12, 18, 0, tzinfo=timezone.utc),
    )


def test_fetch_user_google_token_rejects_missing_document(monkeypatch: pytest.MonkeyPatch) -> None:
    token_doc = FakeTokenDoc(FakeSnapshot({}, exists=False))
    monkeypatch.setattr(firestore_utility, "_google_token_document", lambda uid: token_doc)

    with pytest.raises(RuntimeError, match="missing"):
        firestore_utility.fetch_user_google_token("user-1")


def test_update_user_google_access_token_merges_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    token_doc = FakeTokenDoc(FakeSnapshot({}))
    monkeypatch.setattr(firestore_utility, "_google_token_document", lambda uid: token_doc)
    updated_at = datetime(2026, 3, 12, 18, 0, tzinfo=timezone.utc)

    firestore_utility.update_user_google_access_token(
        uid="user-1",
        access_token=" new-token ",
        updated_at=updated_at,
    )

    assert token_doc.last_set == {
        "payload": {
            "accessToken": "new-token",
            "updatedAt": updated_at,
        },
        "merge": True,
    }


def test_update_user_google_access_token_rejects_empty_token(monkeypatch: pytest.MonkeyPatch) -> None:
    token_doc = FakeTokenDoc(FakeSnapshot({}))
    monkeypatch.setattr(firestore_utility, "_google_token_document", lambda uid: token_doc)

    with pytest.raises(ValueError):
        firestore_utility.update_user_google_access_token("user-1", "   ")
