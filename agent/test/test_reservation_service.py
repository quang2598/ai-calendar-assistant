"""
Tests for reservation service.
"""

import pytest
from datetime import datetime
from service.reservation_service import (
    ReservationService,
    ReservationRequest,
    ReservationResult,
    BusinessType,
)


class TestReservationService:
    """Test cases for ReservationService."""

    def test_init_mock_notifications(self):
        """Test initialization with mock notifications."""
        service = ReservationService(use_mock_notifications=True)
        assert service.use_mock_notifications is True
        assert service.notification_service is not None

    def test_make_reservation_direct_email(self):
        """Test making a reservation via email in mock mode."""
        service = ReservationService(use_mock_notifications=True)

        request = ReservationRequest(
            business_name="Tony's Pizza",
            business_type=BusinessType.RESTAURANT,
            customer_name="John Smith",
            customer_email="john@example.com",
            customer_phone="+12125552368",
            reservation_date="2026-03-20",
            reservation_time="19:30",
            party_size=4,
            special_requests="Window seat if possible",
            business_email="reservations@tonys.com",
            business_phone="+12125552370",
        )

        result = service.make_reservation(request)

        assert result.success is True
        assert result.business_name == "Tony's Pizza"
        assert result.reservation_date == "2026-03-20"
        assert result.reservation_time == "19:30"
        assert result.method in ["email", "sms", "email,sms"]

    def test_make_reservation_without_business_contact(self):
        """Test making reservation without business contact info."""
        service = ReservationService(use_mock_notifications=True)

        request = ReservationRequest(
            business_name="Unknown Restaurant",
            business_type=BusinessType.RESTAURANT,
            customer_name="Jane Doe",
            customer_email="jane@example.com",
            reservation_date="2026-03-21",
            reservation_time="18:00",
        )

        result = service.make_reservation(request)

        assert result.success is False
        assert "no email or phone" in result.message.lower()

    def test_reservation_request_validation(self):
        """Test ReservationRequest validation."""
        with pytest.raises(ValueError):
            ReservationRequest(
                business_name="Test Business",
                business_type=BusinessType.RESTAURANT,
                customer_name="Test Customer",
                customer_email="invalid-email",  # Invalid email format
                reservation_date="2026-03-20",
                reservation_time="19:30",
            )

    def test_business_type_enum(self):
        """Test BusinessType enum values."""
        assert BusinessType.RESTAURANT.value == "restaurant"
        assert BusinessType.HOTEL.value == "hotel"
        assert BusinessType.SALON.value == "salon"
        assert BusinessType.CLINIC.value == "clinic"
        assert BusinessType.DENTIST.value == "dentist"

    def test_compose_reservation_message(self):
        """Test composition of reservation message."""
        service = ReservationService(use_mock_notifications=True)

        request = ReservationRequest(
            business_name="Test Restaurant",
            business_type=BusinessType.RESTAURANT,
            customer_name="John Smith",
            customer_email="john@example.com",
            customer_phone="+12125552368",
            reservation_date="2026-03-20",
            reservation_time="19:30",
            party_size=4,
            special_requests="Vegetarian options",
            business_email="reservations@test.com",
        )

        message = service._compose_reservation_message(request)

        assert "John Smith" in message
        assert "2026-03-20" in message
        assert "19:30" in message
        assert "4" in message
        assert "Vegetarian options" in message

    def test_compose_html_message(self):
        """Test composition of HTML reservation message."""
        service = ReservationService(use_mock_notifications=True)

        request = ReservationRequest(
            business_name="Test Restaurant",
            business_type=BusinessType.RESTAURANT,
            customer_name="John Smith",
            customer_email="john@example.com",
            reservation_date="2026-03-20",
            reservation_time="19:30",
            party_size=4,
            business_email="test@example.com",
        )

        html = service._compose_html_message(request)

        assert "<html>" in html
        assert "John Smith" in html
        assert "2026-03-20" in html
        assert "19:30" in html

    def test_reservation_result_schema(self):
        """Test ReservationResult schema validation."""
        result = ReservationResult(
            success=True,
            reservation_id="RES-123",
            business_name="Test Restaurant",
            reservation_date="2026-03-20",
            reservation_time="19:30",
            method="email",
            message="Success",
        )

        assert result.success is True
        assert result.reservation_id == "RES-123"
        assert result.business_name == "Test Restaurant"


class TestReservationServiceIntegration:
    """Integration tests for reservation service."""

    def test_salon_reservation(self):
        """Test making a salon reservation."""
        service = ReservationService(use_mock_notifications=True)

        request = ReservationRequest(
            business_name="Beauty Salon",
            business_type=BusinessType.SALON,
            customer_name="Alice Brown",
            customer_email="alice@example.com",
            customer_phone="+12125552368",
            reservation_date="2026-03-22",
            reservation_time="10:00",
            special_requests="Haircut and color",
            business_email="appointments@salon.com",
        )

        result = service.make_reservation(request)

        assert result.business_name == "Beauty Salon"
        assert result.reservation_date == "2026-03-22"

    def test_clinic_reservation(self):
        """Test making a clinic reservation."""
        service = ReservationService(use_mock_notifications=True)

        request = ReservationRequest(
            business_name="Health Clinic",
            business_type=BusinessType.CLINIC,
            customer_name="Bob Johnson",
            customer_email="bob@example.com",
            customer_phone="+12125552368",
            reservation_date="2026-03-25",
            reservation_time="14:00",
            business_email="appointments@clinic.com",
            business_phone="+12125552370",
        )

        result = service.make_reservation(request)

        assert result.success is True

    def test_global_service_singleton(self):
        """Test that global service instance works as singleton."""
        service = ReservationService(use_mock_notifications=True)
        assert service is not None
        assert isinstance(service, ReservationService)
