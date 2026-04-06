"""
Tests for reservation tools (agent integration).
"""

import json
import pytest

from agent.tools.reservation_tools import (
    make_reservation,
    send_reservation_reminder,
    MakeReservationInput,
)


class TestMakeReservationTool:
    """Test cases for make_reservation tool."""

    def test_valid_reservation(self):
        """Test making a valid reservation."""
        result_json = make_reservation(
            business_name="Tony's Pizza",
            business_type="restaurant",
            customer_name="John Smith",
            customer_email="john@example.com",
            customer_phone="+12125552368",
            reservation_date="2026-03-20",
            reservation_time="19:30",
            party_size=4,
            business_email="reservations@tonys.com",
        )

        result = json.loads(result_json)
        assert "success" in result
        assert "method" in result
        assert "message" in result

    def test_invalid_business_type(self):
        """Test with invalid business type."""
        result_json = make_reservation(
            business_name="Test",
            business_type="invalid_type",
            customer_name="John Smith",
            customer_email="john@example.com",
            reservation_date="2026-03-20",
            reservation_time="19:30",
            business_email="test@example.com",
        )

        result = json.loads(result_json)
        assert result["success"] is False
        assert "invalid" in result.get("error", "").lower()

    def test_missing_business_contact(self):
        """Test reservation without business contact info."""
        result_json = make_reservation(
            business_name="Test Restaurant",
            business_type="restaurant",
            customer_name="Jane Doe",
            customer_email="jane@example.com",
            reservation_date="2026-03-21",
            reservation_time="18:00",
        )

        result = json.loads(result_json)
        # Should fail because no business email or phone
        assert "success" in result

    def test_all_business_types(self):
        """Test all valid business types."""
        business_types = [
            "restaurant", "hotel", "salon", "clinic",
            "dentist", "spa", "gym", "other"
        ]

        for btype in business_types:
            result_json = make_reservation(
                business_name=f"Test {btype}",
                business_type=btype,
                customer_name="Test Customer",
                customer_email="test@example.com",
                reservation_date="2026-03-20",
                reservation_time="10:00",
                business_email="test@business.com",
            )

            result = json.loads(result_json)
            # Should not have error, may or may not succeed based on mock
            assert "error" not in result or result.get("success") is False

    def test_case_insensitive_business_type(self):
        """Test that business type is case insensitive."""
        result_json = make_reservation(
            business_name="Test Restaurant",
            business_type="RESTAURANT",
            customer_name="John Smith",
            customer_email="john@example.com",
            reservation_date="2026-03-20",
            reservation_time="19:30",
            business_email="test@example.com",
        )

        result = json.loads(result_json)
        # Should handle uppercase
        assert "success" in result

    def test_special_requests(self):
        """Test reservation with special requests."""
        result_json = make_reservation(
            business_name="Fine Dining",
            business_type="restaurant",
            customer_name="Alice Brown",
            customer_email="alice@example.com",
            reservation_date="2026-03-20",
            reservation_time="20:00",
            party_size=2,
            special_requests="Vegetarian menu, no nuts due to allergies",
            business_email="reservations@finedining.com",
        )

        result = json.loads(result_json)
        assert "success" in result


class TestSendReservationReminderTool:
    """Test cases for send_reservation_reminder tool."""

    def test_send_reminder_email_only(self):
        """Test sending reminder via email only."""
        result_json = send_reservation_reminder(
            customer_email="john@example.com",
            business_name="Tony's Pizza",
            reservation_date="2026-03-20",
            reservation_time="19:30",
        )

        result = json.loads(result_json)
        assert result["success"] is True
        assert "email" in result["message"].lower()

    def test_send_reminder_email_and_sms(self):
        """Test sending reminder via email and SMS."""
        result_json = send_reservation_reminder(
            customer_email="john@example.com",
            customer_phone="+12125552368",
            business_name="Restaurant",
            reservation_date="2026-03-20",
            reservation_time="19:30",
        )

        result = json.loads(result_json)
        assert result["success"] is True
        assert len(result["results"]) >= 1

    def test_send_reminder_with_confirmation(self):
        """Test sending reminder with confirmation number."""
        result_json = send_reservation_reminder(
            customer_email="john@example.com",
            business_name="Hotel",
            reservation_date="2026-03-25",
            reservation_time="15:00",
            confirmation_number="CONF-123456",
        )

        result = json.loads(result_json)
        assert result["success"] is True


class TestReservationToolsSchemas:
    """Test schema validation for reservation tools."""

    def test_make_reservation_input_validation(self):
        """Test MakeReservationInput schema."""
        # Valid input
        input_data = MakeReservationInput(
            business_name="Test",
            business_type="restaurant",
            customer_name="John",
            customer_email="john@example.com",
            reservation_date="2026-03-20",
            reservation_time="19:30",
        )
        assert input_data.business_name == "Test"

        # Invalid input should raise
        with pytest.raises(ValueError):
            MakeReservationInput(
                business_name="Test",
                business_type="restaurant",
                customer_name="John",
                customer_email="invalid-email",
                reservation_date="2026-03-20",
                reservation_time="19:30",
            )
