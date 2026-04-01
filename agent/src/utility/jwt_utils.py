"""JWT token encoding and decoding utilities for user authentication."""

import os
from datetime import datetime, timedelta, timezone
from typing import Dict, Any

import jwt
from loguru import logger


class JWTError(Exception):
    """Base exception for JWT-related errors."""
    pass


class JWTDecodeError(JWTError):
    """Raised when JWT decoding fails."""
    pass


def _get_secret_key() -> str:
    """Get JWT secret key from environment."""
    secret = os.getenv("JWT_SECRET_KEY", "").strip()
    logger.debug("JWT_SECRET_KEY lookup: value_present={}, value_length={}", bool(secret), len(secret))
    
    # Log all environment variables that contain 'JWT' for debugging
    jwt_vars = {k: v[:20] + "..." if len(v) > 20 else v for k, v in os.environ.items() if "JWT" in k.upper()}
    if jwt_vars:
        logger.debug("Found JWT-related env vars: {}", jwt_vars)
    else:
        logger.debug("No JWT-related env vars found in environment")
    
    if not secret:
        logger.error("JWT_SECRET_KEY is empty or not set. Available env keys: {}", list(os.environ.keys())[:10])
        raise JWTError("JWT_SECRET_KEY environment variable is not set")
    return secret


def encode_user_token(uid: str, token_ttl_hours: int = 1) -> str:
    """
    Encode a user ID into a JWT token.
    
    Args:
        uid: User ID to encode
        token_ttl_hours: Token time-to-live in hours (default: 1 hour)
        
    Returns:
        Encoded JWT token
        
    Raises:
        JWTError: If secret key is not configured
    """
    if not uid or not uid.strip():
        raise JWTError("uid cannot be empty")
    
    secret = _get_secret_key()
    now = datetime.now(timezone.utc)
    expiration = now + timedelta(hours=token_ttl_hours)
    
    payload = {
        "uid": uid.strip(),
        "iat": int(now.timestamp()),
        "exp": int(expiration.timestamp()),
        "iss": "ai-calendar-agent",
    }
    
    try:
        token = jwt.encode(payload, secret, algorithm="HS256")
        logger.debug("Generated JWT token for uid={}", uid)
        return token
    except Exception as exc:
        logger.error("Failed to encode JWT token: {}", exc)
        raise JWTError(f"Failed to encode JWT token: {exc}") from exc


def decode_user_token(token: str) -> Dict[str, Any]:
    """
    Decode and verify a JWT token.
    
    Args:
        token: JWT token to decode
        
    Returns:
        Decoded token payload containing uid and other claims
        
    Raises:
        JWTDecodeError: If token is invalid, expired, or verification fails
    """
    if not token or not token.strip():
        raise JWTDecodeError("Token cannot be empty")
    
    secret = _get_secret_key()
    
    try:
        payload = jwt.decode(token.strip(), secret, algorithms=["HS256"])
        
        # Validate required claims
        if "uid" not in payload:
            raise JWTDecodeError("Token missing required 'uid' claim")
        
        uid = payload["uid"]
        if not uid or not str(uid).strip():
            raise JWTDecodeError("Token has empty 'uid' claim")
        
        logger.debug("Successfully decoded JWT token for uid={}", uid)
        return payload
        
    except jwt.ExpiredSignatureError as exc:
        logger.warning("JWT token has expired")
        raise JWTDecodeError("Token has expired") from exc
    except jwt.InvalidSignatureError as exc:
        logger.warning("JWT token has invalid signature")
        raise JWTDecodeError("Invalid token signature") from exc
    except jwt.DecodeError as exc:
        logger.warning("Failed to decode JWT token: {}", exc)
        raise JWTDecodeError(f"Failed to decode token: {exc}") from exc
    except Exception as exc:
        logger.error("Unexpected error decoding JWT token: {}", exc)
        raise JWTDecodeError(f"Unexpected error: {exc}") from exc
