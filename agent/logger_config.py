"""
Logging configuration for the AI Agent Microservice
"""
import logging
import logging.handlers
import os
import sys
from config import settings


def _resolve_log_dir() -> str:
    """Resolve a writable log directory, falling back to /tmp for serverless."""
    preferred = os.getenv("LOG_DIR", "logs")
    try:
        os.makedirs(preferred, exist_ok=True)
        return preferred
    except (OSError, PermissionError):
        fallback = "/tmp/ai_agent_logs"
        os.makedirs(fallback, exist_ok=True)
        return fallback


def setup_logging() -> logging.Logger:
    """
    Configure logging with both console and file handlers
    Returns the configured logger instance
    """
    logger = logging.getLogger("ai_agent")
    logger.setLevel(getattr(logging, settings.LOG_LEVEL))
    
    # Remove existing handlers to avoid duplicates
    logger.handlers.clear()
    
    # Create formatters
    detailed_formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    
    simple_formatter = logging.Formatter(
        '%(levelname)s - %(message)s'
    )
    
    # Console handler (stdout)
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(getattr(logging, settings.LOG_LEVEL))
    console_handler.setFormatter(simple_formatter if settings.DEBUG else detailed_formatter)
    logger.addHandler(console_handler)
    
    # File handler
    try:
        log_dir = _resolve_log_dir()
        file_handler = logging.handlers.RotatingFileHandler(
            os.path.join(log_dir, 'ai_agent.log'),
            maxBytes=10485760,  # 10MB
            backupCount=5
        )
        file_handler.setLevel(logging.DEBUG)
        file_handler.setFormatter(detailed_formatter)
        logger.addHandler(file_handler)
    except (FileNotFoundError, OSError) as e:
        logger.warning(f"Could not setup file handler: {e}")
    
    return logger


logger = setup_logging()
