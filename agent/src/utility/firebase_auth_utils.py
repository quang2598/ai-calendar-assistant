"""Firebase Authentication utilities for verifying user tokens."""

from typing import Dict, Any

import firebase_admin
from firebase_admin import auth
from loguru import logger

from config.firestore_config import init_firestore


class FirebaseAuthError(Exception):
    """Exception raised when Firebase authentication fails."""
    pass


def verify_firebase_token(id_token: str) -> Dict[str, Any]:
    """
    Verify a Firebase ID token using Firebase Admin SDK.
    
    Args:
        id_token: Firebase ID token to verify
        
    Returns:
        Decoded token claims including 'uid' (user ID)
        
    Raises:
        FirebaseAuthError: If token is invalid, expired, or verification fails
    """
    if not id_token or not id_token.strip():
        raise FirebaseAuthError("Firebase ID token cannot be empty")
    
    try:
        # Ensure Firestore is initialized (initializes Firebase Admin too)
        init_firestore()
        
        # Verify the token using Firebase Admin Auth
        decoded_token = auth.verify_id_token(id_token.strip(), check_revoked=False)
        
        uid = decoded_token.get("uid")
        if not uid:
            raise FirebaseAuthError("Token missing 'uid' claim")
        
        logger.debug("Firebase token verified for uid={}", uid)
        return decoded_token
        
    except auth.ExpiredIdTokenError as exc:
        logger.warning("Firebase ID token has expired")
        raise FirebaseAuthError("Firebase ID token has expired") from exc
        
    except auth.RevokedIdTokenError as exc:
        logger.warning("Firebase ID token has been revoked")
        raise FirebaseAuthError("Firebase ID token has been revoked") from exc
        
    except auth.InvalidIdTokenError as exc:
        logger.warning("Firebase ID token is invalid")
        raise FirebaseAuthError("Firebase ID token is invalid") from exc
        
    except Exception as exc:
        logger.error("Firebase token verification error: {}", exc)
        import traceback
        logger.error("Traceback: {}", traceback.format_exc())
        raise FirebaseAuthError(f"Token verification failed: {str(exc)}") from exc
