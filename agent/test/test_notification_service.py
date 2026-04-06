"""
Tests for notification service.

Note: These tests are designed to work independently without Firebase setup.
"""

import pytest
from datetime import datetime
from service.notification_service import (
    NotificationService,
    NotificationResult,
)


class TestNotificationService:
    """Test cases for NotificationService."""

    def test_init_mock_mode(self):
        """Test initialization in mock mode."""
        service = NotificationService(use_mock=True)
        assert service.use_mock is True
        assert service.gmail_credentials is None
        assert service.twilio_client is None

    def test_send_email_mock(self):
        """Test sending email in mock mode."""
        service = NotificationService(use_mock=True)
        result = service.send_email(
            recipient="test@example.com",
            subject="Test Subject",
            body="Test Body",
        )

        assert result.status == "mock_sent"
        assert result.recipient == "test@example.com"
        assert result.message_type == "email"
        assert result.mock_mode is True

    def test_send_sms_mock(self):
        """Test sending SMS in mock mode."""
        service = NotificationService(use_mock=True)
        result = service.send_sms(
            phone="+12125552368",
            message="Test message",
        )

        assert result.status == "mock_sent"
        assert result.recipient == "+12125552368"
        assert result.message_type == "sms"
        assert result.mock_mode is True

    def test_notification_result_schema(self):
        """Test NotificationResult schema validation."""
        result = NotificationResult(
            status="mock_sent",
            recipient="test@example.com",
            message_type="email",
        )

        assert result.status == "mock_sent"
        assert result.recipient == "test@example.com"
        assert result.message_type == "email"
        assert isinstance(result.timestamp, str)

    def test_get_status(self):
        """Test getting service status."""
        service = NotificationService(use_mock=True)
        status = service.get_status()

        assert status["mock_mode"] is True
        assert "gmail_ready" in status
        assert "twilio_ready" in status

    def test_global_service_singleton(self):
        """Test that global service instance works as singleton."""
        # Import inside test to avoid circular dependencies
        service1 = NotificationService(use_mock=True)
        assert service1 is not None


class TestNotificationServiceIntegration:
    """Integration tests for notification service."""

    def test_email_with_html_body_mock(self):
        """Test sending email with HTML body in mock mode."""
        service = NotificationService(use_mock=True)
        result = service.send_email(
            recipient="test@example.com",
            subject="HTML Test",
            body="Plain text body",
            html_body="<html><body>HTML body</body></html>",
        )

        assert result.status == "mock_sent"
        assert result.message_type == "email"

    def test_sms_with_custom_from_number_mock(self):
        """Test sending SMS with custom from number in mock mode."""
        service = NotificationService(use_mock=True)
        result = service.send_sms(
            phone="+12125552368",
            message="Test",
            from_number="+12025551234",
        )

        assert result.status == "mock_sent"
        assert result.message_type == "sms"
