from __future__ import annotations

from pathlib import Path
from pydantic import Field, ValidationError, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from loguru import logger

agent_settings = None

# Resolve .env path relative to agent directory
ENV_FILE = Path(__file__).parent.parent.parent / ".env"

class AgentSettings(BaseSettings):
    model_config = SettingsConfigDict(
        # env_file=".env",
        env_file=str(ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    agent_llm_model: str = Field(default="llama3.1", alias="AGENT_LLM_MODEL")
    agent_llm_temperature: float = Field(
        default=0.0,
        ge=0.0,
        le=1.0,
        alias="AGENT_LLM_TEMPERATURE",
    )
    agent_llm_timeout_seconds: int = Field(
        default=60,
        ge=5,
        le=300,
        alias="AGENT_LLM_TIMEOUT_SECONDS",
    )
    agent_max_iterations: int = Field(default=6, ge=1, le=20, alias="AGENT_MAX_ITERATIONS")

    calendar_default_window_days: int = Field(
        default=60,
        ge=1,
        le=1095,
        alias="CALENDAR_DEFAULT_WINDOW_DAYS",
    )
    calendar_max_window_days: int = Field(
        default=1095,
        ge=1,
        le=1095,
        alias="CALENDAR_MAX_WINDOW_DAYS",
    )
    calendar_default_timezone: str = Field(
        default="UTC",
        min_length=1,
        alias="CALENDAR_DEFAULT_TIMEZONE",
    )
    google_calendar_default_id: str = Field(
        default="primary",
        min_length=1,
        alias="GOOGLE_CALENDAR_DEFAULT_ID",
    )

    google_oauth_client_id: str = Field(
        min_length=1,
        alias="GOOGLE_OAUTH_CLIENT_ID",
    )
    google_oauth_client_secret: str = Field(
        min_length=1,
        alias="GOOGLE_OAUTH_CLIENT_SECRET",
    )
    google_oauth_token_uri: str = Field(
        default="https://oauth2.googleapis.com/token",
        min_length=1,
        alias="GOOGLE_OAUTH_TOKEN_URI",
    )
    google_oauth_access_token_ttl_seconds: int = Field(
        default=3300,
        ge=60,
        le=3600,
        alias="GOOGLE_OAUTH_ACCESS_TOKEN_TTL_SECONDS",
    )

    @field_validator(
        "agent_llm_model",
        "calendar_default_timezone",
        "google_calendar_default_id",
        "google_oauth_client_id",
        "google_oauth_client_secret",
        "google_oauth_token_uri",
    )
    @classmethod
    def validate_non_empty(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("must not be empty")
        return cleaned

    @field_validator("calendar_max_window_days")
    @classmethod
    def validate_calendar_window(cls, value: int, info) -> int:
        default_window = info.data.get("calendar_default_window_days")
        if isinstance(default_window, int) and value < default_window:
            raise ValueError("must be greater than or equal to calendar_default_window_days")
        return value


def get_agent_settings() -> AgentSettings:
    try:
        return AgentSettings()
    except ValidationError as exc:
        raise RuntimeError(f"Invalid agent environment configuration: {exc}") from exc


def init_agent_settings() -> AgentSettings:
    """
    Initialize Agent settings exactly once and return settings.
    Safe to call multiple times.
    """
    global agent_settings

    if agent_settings is not None:
        return agent_settings

    agent_settings = get_agent_settings()
    return agent_settings


init_agent_settings()
if agent_settings:
    logger.info("Agent settings initialized successfully. LLM Model: {}", agent_settings.agent_llm_model)
else:
    raise RuntimeError("Agent settings initialization failed.")
