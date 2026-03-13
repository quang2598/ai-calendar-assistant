from __future__ import annotations

import src
import agent
import config
import dto
import utility


def test_package_exports_are_available() -> None:
    assert hasattr(src, "app")
    assert hasattr(agent, "run_calendar_agent_turn")
    assert hasattr(config, "firestore_db")
    assert hasattr(dto, "SendChatRequest")
    assert hasattr(utility, "load_agent_history_messages")
