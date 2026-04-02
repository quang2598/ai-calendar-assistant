"""Firebase authentication middleware for FastAPI."""

from typing import Callable

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from loguru import logger
from starlette.middleware.base import BaseHTTPMiddleware

from utility.firebase_auth_utils import FirebaseAuthError, verify_firebase_token


class FirebaseAuthMiddleware(BaseHTTPMiddleware):
    """
    Middleware to extract and verify Firebase ID tokens from request headers.
    
    Expects Firebase ID token in the 'Authorization: Bearer {token}' header.
    Verifies the token using Firebase Admin SDK and stores the decoded claims 
    and uid in request.state.
    
    If token is missing, invalid, or expired, returns 401 Unauthorized.
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """
        Process the request, validate Firebase ID token, and extract user claims.
        
        Args:
            request: FastAPI request object
            call_next: Next middleware/handler in the chain
            
        Returns:
            Response from the next handler, or 401 if Firebase token validation fails
        """
        # Extract token from Authorization header
        auth_header = request.headers.get("Authorization", "").strip()
        logger.debug("Firebase Auth Middleware: auth_header present={}, length={}", 
                     bool(auth_header), len(auth_header) if auth_header else 0)
        
        if not auth_header:
            logger.warning("Request missing Authorization header")
            return JSONResponse(
                status_code=401,
                content={
                    "detail": {
                        "code": "missing_token",
                        "message": "Missing Firebase ID token in Authorization header",
                    }
                },
            )
        
        # Extract Bearer token from "Authorization: Bearer {token}"
        if not auth_header.startswith("Bearer "):
            logger.warning("Authorization header does not start with 'Bearer '")
            return JSONResponse(
                status_code=401,
                content={
                    "detail": {
                        "code": "invalid_auth_format",
                        "message": "Authorization header must be 'Bearer {token}'",
                    }
                },
            )
        
        firebase_id_token = auth_header[7:].strip()  # Remove "Bearer " prefix
        
        # Verify and decode token
        try:
            logger.debug("Attempting to verify Firebase ID token")
            decoded_token = verify_firebase_token(firebase_id_token)
            
            # Store both the token and decoded claims in request state
            request.state.firebase_id_token = firebase_id_token
            request.state.decoded_token = decoded_token
            request.state.uid = decoded_token["uid"]
            
            logger.debug("Firebase token verified for uid={}", decoded_token["uid"])
            
        except FirebaseAuthError as exc:
            logger.warning("Firebase token verification failed: {}", exc)
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
            logger.error("Unexpected error during Firebase token verification: {}", exc)
            import traceback
            logger.error("Traceback: {}", traceback.format_exc())
            return JSONResponse(
                status_code=401,
                content={
                    "detail": {
                        "code": "token_verification_error",
                        "message": "Token verification failed",
                    }
                },
            )
        
        # Token is valid, proceed to next handler
        return await call_next(request)
