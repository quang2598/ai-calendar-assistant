"""
Notification Service for sending emails and SMS messages.
Supports mock mode for testing and real sending via Gmail API and Twilio.
"""

from __future__ import annotations

import os
from datetime import datetime
from typing import Optional, Dict, Any
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import base64

from loguru import logger
from pydantic import BaseModel, Field


class NotificationResult(BaseModel):
    """Result of a notification send attempt."""
    status: str = Field(..., description="'sent', 'mock_sent', or 'failed'")
    recipient: str = Field(..., description="Recipient email or phone")
    message_type: str = Field(..., description="'email' or 'sms'")
    timestamp: str = Field(default_factory=lambda: datetime.now().isoformat())
    error: Optional[str] = Field(default=None, description="Error message if failed")
    mock_mode: bool = Field(default=False, description="True if sent in mock mode")


class NotificationService:
    """
    Service for sending notifications via email and SMS.
    Can operate in mock mode (for testing) or real mode (actual sends).
    """

    def __init__(self, use_mock: bool = True):
        """
        Initialize NotificationService.
        
        Args:
            use_mock: If True, notifications are logged but not actually sent.
        """
        self.use_mock = use_mock
        self.gmail_credentials = None
        self.twilio_client = None
        
        if not use_mock:
            self._initialize_real_services()

    def _initialize_real_services(self):
        """Initialize real Gmail and Twilio clients."""
        try:
            from google.auth.transport.requests import Request
            from google.oauth2.credentials import Credentials
            from google_auth_oauthlib.flow import InstalledAppFlow
            from google.auth import default
            import pickle
            
            # Gmail setup
            self._setup_gmail()
        except ImportError as e:
            logger.warning(f"Gmail dependencies not available: {e}")
        
        try:
            from twilio.rest import Client
            
            # Twilio setup
            account_sid = os.getenv("TWILIO_ACCOUNT_SID")
            auth_token = os.getenv("TWILIO_AUTH_TOKEN")
            
            if account_sid and auth_token:
                self.twilio_client = Client(account_sid, auth_token)
                logger.info("Twilio client initialized")
            else:
                logger.warning("Twilio credentials not found in environment")
        except ImportError as e:
            logger.warning(f"Twilio not available: {e}")

    def _setup_gmail(self):
        """Set up Gmail API credentials."""
        try:
            from google.auth.transport.requests import Request
            from google.oauth2.credentials import Credentials
            from google_auth_oauthlib.flow import InstalledAppFlow
            import pickle
            
            SCOPES = ["https://www.googleapis.com/auth/gmail.send"]
            TOKEN_FILE = "token.pickle"
            CREDENTIALS_FILE = "credentials.json"
            
            creds = None
            
            # Load existing token if available
            if os.path.exists(TOKEN_FILE):
                with open(TOKEN_FILE, "rb") as token:
                    creds = pickle.load(token)
            
            # Get new token if needed
            if not creds or not creds.valid:
                if creds and creds.expired and creds.refresh_token:
                    creds.refresh(Request())
                else:
                    if os.path.exists(CREDENTIALS_FILE):
                        flow = InstalledAppFlow.from_client_secrets_file(
                            CREDENTIALS_FILE, SCOPES
                        )
                        creds = flow.run_local_server(port=0)
                
                # Save token for next time
                with open(TOKEN_FILE, "wb") as token:
                    pickle.dump(creds, token)
            
            self.gmail_credentials = creds
            logger.info("Gmail credentials loaded successfully")
        except Exception as e:
            logger.warning(f"Failed to setup Gmail: {e}")

    def send_email(
        self,
        recipient: str,
        subject: str,
        body: str,
        html_body: Optional[str] = None,
    ) -> NotificationResult:
        """
        Send an email.
        
        Args:
            recipient: Email address of recipient
            subject: Email subject
            body: Plain text email body
            html_body: Optional HTML email body
            
        Returns:
            NotificationResult with status and details
        """
        if self.use_mock:
            logger.info(
                f"[MOCK] Email to {recipient} | Subject: {subject}"
            )
            return NotificationResult(
                status="mock_sent",
                recipient=recipient,
                message_type="email",
                mock_mode=True,
            )

        try:
            return self._send_via_gmail(recipient, subject, body, html_body)
        except Exception as e:
            logger.error(f"Failed to send email to {recipient}: {e}")
            return NotificationResult(
                status="failed",
                recipient=recipient,
                message_type="email",
                error=str(e),
            )

    def _send_via_gmail(
        self,
        recipient: str,
        subject: str,
        body: str,
        html_body: Optional[str] = None,
    ) -> NotificationResult:
        """Send email via Gmail API."""
        try:
            from googleapiclient.discovery import build
            
            if not self.gmail_credentials:
                raise ValueError("Gmail credentials not initialized")
            
            service = build("gmail", "v1", credentials=self.gmail_credentials)
            
            # Create message
            message = MIMEMultipart("alternative")
            message["To"] = recipient
            message["Subject"] = subject
            
            # Attach plain text
            message.attach(MIMEText(body, "plain"))
            
            # Attach HTML if provided
            if html_body:
                message.attach(MIMEText(html_body, "html"))
            
            # Send message
            raw_message = base64.urlsafe_b64encode(
                message.as_bytes()
            ).decode("utf-8")
            
            service.users().messages().send(
                userId="me",
                body={"raw": raw_message}
            ).execute()
            
            logger.info(f"Email sent to {recipient}: {subject}")
            return NotificationResult(
                status="sent",
                recipient=recipient,
                message_type="email",
            )
        except Exception as e:
            logger.error(f"Gmail send failed: {e}")
            raise

    def send_sms(
        self,
        phone: str,
        message: str,
        from_number: Optional[str] = None,
    ) -> NotificationResult:
        """
        Send an SMS message.
        
        Args:
            phone: Phone number (E.164 format, e.g., +12125552368)
            message: SMS message text
            from_number: Optional Twilio phone number to send from
            
        Returns:
            NotificationResult with status and details
        """
        if self.use_mock:
            logger.info(f"[MOCK] SMS to {phone} | Message: {message}")
            return NotificationResult(
                status="mock_sent",
                recipient=phone,
                message_type="sms",
                mock_mode=True,
            )

        try:
            return self._send_via_twilio(phone, message, from_number)
        except Exception as e:
            logger.error(f"Failed to send SMS to {phone}: {e}")
            return NotificationResult(
                status="failed",
                recipient=phone,
                message_type="sms",
                error=str(e),
            )

    def _send_via_twilio(
        self,
        phone: str,
        message: str,
        from_number: Optional[str] = None,
    ) -> NotificationResult:
        """Send SMS via Twilio."""
        try:
            if not self.twilio_client:
                raise ValueError("Twilio client not initialized")
            
            if not from_number:
                from_number = os.getenv("TWILIO_PHONE_NUMBER")
                if not from_number:
                    raise ValueError("TWILIO_PHONE_NUMBER not set in environment")
            
            message_obj = self.twilio_client.messages.create(
                body=message,
                from_=from_number,
                to=phone,
            )
            
            logger.info(f"SMS sent to {phone}: {message_obj.sid}")
            return NotificationResult(
                status="sent",
                recipient=phone,
                message_type="sms",
            )
        except Exception as e:
            logger.error(f"Twilio send failed: {e}")
            raise

    def get_status(self) -> Dict[str, Any]:
        """Get current notification service status."""
        return {
            "mock_mode": self.use_mock,
            "gmail_ready": self.gmail_credentials is not None,
            "twilio_ready": self.twilio_client is not None,
        }


# Global service instance
_notification_service: Optional[NotificationService] = None


def get_notification_service(use_mock: Optional[bool] = None) -> NotificationService:
    """
    Get or create the global notification service.
    
    Args:
        use_mock: Override the mock setting. If None, uses environment variable
                 NOTIFICATION_MOCK_MODE (defaults to True)
    """
    global _notification_service
    
    if _notification_service is None:
        if use_mock is None:
            use_mock = os.getenv("NOTIFICATION_MOCK_MODE", "true").lower() == "true"
        _notification_service = NotificationService(use_mock=use_mock)
    
    return _notification_service
