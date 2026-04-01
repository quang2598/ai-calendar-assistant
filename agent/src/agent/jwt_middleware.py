"""JWT authentication middleware for FastAPI."""

from typing import Callable

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from loguru import logger
from starlette.middleware.base import BaseHTTPMiddleware

from utility.jwt_utils import JWTDecodeError, decode_user_token


class JWTAuthMiddleware(BaseHTTPMiddleware):
    """
    Middleware to extract and verify JWT tokens from request headers.
    
    Expects JWT token in the 'X-User-Token' header.
    Extracts the uid from the token and stores it in request.state.uid.
    
    If token is missing, invalid, or expired, returns 401 Unauthorized.
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """
        Process the request, validate JWT token, and extract user ID.
        
        Args:
            request: FastAPI request object
            call_next: Next middleware/handler in the chain
            
        Returns:
            Response from the next handler, or 401 if JWT validation fails
        """
        # Extract token from header
        auth_header = request.headers.get("X-User-Token", "").strip()
        logger.debug("JWT Middleware: auth_header present={}, length={}", bool(auth_header), len(auth_header) if auth_header else 0)
        
        if not auth_header:
            logger.warning("Request missing X-User-Token header")
            return JSONResponse(
                status_code=401,
                content={
                    "detail": {
                        "code": "missing_token",
                        "message": "Missing authentication token",
                    }
                },
            )
        
        # Verify and decode token
        try:
            logger.debug("Attempting to decode JWT token")
            payload = decode_user_token(auth_header)
            # Extract uid and store in request state for use in endpoint handlers
            request.state.uid = payload["uid"]
            logger.debug("JWT token validated for uid={}", payload["uid"])
        except JWTDecodeError as exc:
            logger.warning("JWT validation failed: {}", exc)
            return JSONResponse(
                status_code=401,
                content={
                    "detail": {
                        "code": "invalid_token",
                        "message": str(exc),
                    }
                },
            )
        except Exception as exc:
            logger.error("Unexpected error during JWT validation: {}", exc)
            import traceback
            logger.error("Traceback: {}", traceback.format_exc())
            return JSONResponse(
                status_code=401,
                content={
                    "detail": {
                        "code": "token_validation_error",
                        "message": "Token validation failed",
                    }
                },
            )
        
        # Token is valid, proceed to next handler
        return await call_next(request)
