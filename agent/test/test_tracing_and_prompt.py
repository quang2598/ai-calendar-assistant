from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import pytest

import agent.agent_config as agent_config
from agent.system_prompt import build_system_prompt
from config.tracing_config import trace_span


def test_build_system_prompt_includes_runtime_context() -> None:
    prompt = build_system_prompt(
        datetime(2026, 3, 12, 18, 0, tzinfo=timezone.utc),
        user_timezone="America/Chicago",
    )

    assert "2026-03-12T18:00:00+00:00" in prompt
    assert "America/Chicago" in prompt
    assert "Fallback timezone if calendar timezone is unavailable" in prompt


def test_trace_span_wraps_sync_function() -> None:
    @trace_span("sample_span")
    def add(a: int, b: int) -> int:
        return a + b

    assert add(2, 3) == 5


def test_trace_span_wraps_async_function() -> None:
    @trace_span("async_span")
    async def add_async(a: int, b: int) -> int:
        return a + b

    assert asyncio.run(add_async(2, 4)) == 6


def test_agent_settings_init_returns_cached_instance() -> None:
    first = agent_config.init_agent_settings()
    second = agent_config.init_agent_settings()

    assert first is second


def test_agent_settings_validator_rejects_invalid_window() -> None:
    with pytest.raises(ValueError):
        agent_config.AgentSettings(
            AGENT_LLM_MODEL="ollama:llama3",
            GOOGLE_OAUTH_CLIENT_ID="client-id",
            GOOGLE_OAUTH_CLIENT_SECRET="client-secret",
            CALENDAR_DEFAULT_WINDOW_DAYS=30,
            CALENDAR_MAX_WINDOW_DAYS=10,
        )
