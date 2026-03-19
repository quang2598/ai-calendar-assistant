from __future__ import annotations
from pathlib import Path
from pydantic import Field, ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict

import firebase_admin
from firebase_admin import credentials, firestore
from google.cloud.firestore import Client as FirestoreClient
from loguru import logger
from .tracing_config import trace_span

firestore_db = None
_firestore_app = None

# Resolve .env path relative to agent directory
ENV_FILE = Path(__file__).parent.parent.parent / ".env"

class FireStoreSettings(BaseSettings):
    model_config = SettingsConfigDict(
        # env_file=".env",
        env_file=str(ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    firebase_project_id: str = Field(alias="FIREBASE_PROJECT_ID")
    firebase_client_email: str = Field(alias="FIREBASE_CLIENT_EMAIL")
    firebase_private_key: str = Field(alias="FIREBASE_PRIVATE_KEY")

    @property
    def firebase_private_key_normalized(self) -> str:
        # Many deploy platforms store multiline private keys with literal "\n"
        return self.firebase_private_key.replace("\\n", "\n")

def get_settings() -> FireStoreSettings:
    try:
        return FireStoreSettings()
    except ValidationError as exc:
        raise RuntimeError(f"Invalid environment configuration: {exc}") from exc
    
@trace_span("init_firestore")    
def init_firestore() -> FirestoreClient:
    """
    Initialize Firebase Admin exactly once and return a Firestore client.
    Safe to call multiple times.
    """
    global _firestore_app, firestore_db

    if firestore_db is not None:
        return firestore_db

    settings = get_settings()

    service_account_info = {
        "type": "service_account",
        "project_id": settings.firebase_project_id,
        "client_email": settings.firebase_client_email,
        "private_key": settings.firebase_private_key_normalized,
        "token_uri": "https://oauth2.googleapis.com/token",
    }

    if not firebase_admin._apps:
        cred = credentials.Certificate(service_account_info)
        _firestore_app = firebase_admin.initialize_app(
            cred,
            {"projectId": settings.firebase_project_id},
        )
    else:
        _firestore_app = firebase_admin.get_app()

    firestore_db = firestore.client(app=_firestore_app)
    return firestore_db

init_firestore()
if _firestore_app:
    logger.info("Firebase Admin app initialized successfully.")
else:
    raise RuntimeError("Firebase Admin app initialization failed.")

if firestore_db:
    logger.info("Firestore client initialized successfully.")
else:
    raise RuntimeError("Firestore client initialization failed.")