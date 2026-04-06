"""
Reservation tools for the agent.
Provides agent tools for making reservations via email, SMS, and OpenTable.
"""

from __future__ import annotations

import json
from typing import Optional

from langchain.tools import tool
from loguru import logger
from pydantic import BaseModel, ConfigDict, Field

from utility.tracing_utils import trace_span, track_action
from service.reservation_service import (
    get_reservation_service,
    ReservationRequest,
    BusinessType,
)


class MakeReservationInput(BaseModel):
    """Input for making a reservation."""
    business_name: str = Field(
        ...,
        description="Name of the business where you want to make a reservation",
    )
    business_type: str = Field(
        ...,
        description=(
            "Type of business: 'restaurant', 'hotel', 'salon', 'clinic', "
            "'dentist', 'spa', 'gym', or 'other'"
        ),
    )
    customer_name: str = Field(
        ...,
        description="Full name of the customer making the reservation",
    )
    customer_email: str = Field(
        ...,
        description="Email address of the customer",
    )
    customer_phone: Optional[str] = Field(
        default=None,
        description=(
            "Phone number of the customer in E.164 format "
            "(e.g., +12125552368)"
        ),
    )
    reservation_date: str = Field(
        ...,
        description=(
            "Date of the reservation in ISO format (YYYY-MM-DD), "
            "for example: 2026-03-20"
        ),
    )
    reservation_time: str = Field(
        ...,
        description=(
            "Time of the reservation in HH:MM format (24-hour), "
            "for example: 19:30"
        ),
    )
    party_size: Optional[int] = Field(
        default=None,
        description=(
            "Number of people for the reservation "
            "(mainly for restaurants)"
        ),
    )
    special_requests: Optional[str] = Field(
        default=None,
        description=(
            "Any special requests or notes "
            "(e.g., 'window seat', 'allergies', etc.)"
        ),
    )
    business_email: Optional[str] = Field(
        default=None,
        description="Email address of the business",
    )
    business_phone: Optional[str] = Field(
        default=None,
        description=(
            "Phone number of the business in E.164 format "
            "(e.g., +12125552368)"
        ),
    )

    model_config = ConfigDict(extra="forbid")


@tool(args_schema=MakeReservationInput)
@trace_span(name="make_reservation_tool")
def make_reservation(
    business_name: str,
    business_type: str,
    customer_name: str,
    customer_email: str,
    customer_phone: Optional[str] = None,
    reservation_date: Optional[str] = None,
    reservation_time: Optional[str] = None,
    party_size: Optional[int] = None,
    special_requests: Optional[str] = None,
    business_email: Optional[str] = None,
    business_phone: Optional[str] = None,
) -> str:
    """
    Make a reservation at a business via email, SMS, or OpenTable.
    
    This tool attempts to make a reservation using the best available method:
    - For restaurants: First tries OpenTable API if available
    - For all businesses: Falls back to sending email and/or SMS to the business
    
    The tool will return a success status and reservation details.
    
    Args:
        business_name: Name of the business (required)
        business_type: Type of business - one of: restaurant, hotel, salon,
                      clinic, dentist, spa, gym, or other (required)
        customer_name: Full name of the customer (required)
        customer_email: Customer's email address (required)
        customer_phone: Customer's phone number (optional, E.164 format)
        reservation_date: Date in YYYY-MM-DD format (required)
        reservation_time: Time in HH:MM format 24-hour (required)
        party_size: Number of people (optional, for restaurants)
        special_requests: Any special notes or requests (optional)
        business_email: Business email for reservation request (optional)
        business_phone: Business phone for SMS reservation (optional)
    
    Returns:
        JSON string with reservation result including:
        - success: Whether the reservation was made
        - reservation_id: ID if successful
        - method: How it was sent (opentable, email, sms, etc.)
        - message: Human-readable status message
    
    Example:
        >>> make_reservation(
        ...     business_name="Tony's Pizza",
        ...     business_type="restaurant",
        ...     customer_name="John Smith",
        ...     customer_email="john@example.com",
        ...     customer_phone="+12125552368",
        ...     reservation_date="2026-03-20",
        ...     reservation_time="19:30",
        ...     party_size=4,
        ...     business_email="reservations@tonys.com",
        ...     business_phone="+12125552368"
        ... )
    """
    try:
        # Validate business type
        try:
            business_type_enum = BusinessType(business_type.lower())
        except ValueError:
            return json.dumps({
                "success": False,
                "error": (
                    f"Invalid business type: {business_type}. "
                    "Must be one of: restaurant, hotel, salon, clinic, "
                    "dentist, spa, gym, or other"
                ),
            })

        # Create reservation request
        request = ReservationRequest(
            business_name=business_name,
            business_type=business_type_enum,
            customer_name=customer_name,
            customer_email=customer_email,
            customer_phone=customer_phone,
            reservation_date=reservation_date,
            reservation_time=reservation_time,
            party_size=party_size,
            special_requests=special_requests,
            business_email=business_email,
            business_phone=business_phone,
        )

        # Get service and make reservation
        service = get_reservation_service(use_mock_notifications=False)
        result = service.make_reservation(request)

        # Track action
        track_action(
            action="make_reservation",
            details={
                "business_name": business_name,
                "business_type": business_type,
                "reservation_date": reservation_date,
                "reservation_time": reservation_time,
                "success": result.success,
                "method": result.method,
            },
        )

        # Return result as JSON
        return json.dumps({
            "success": result.success,
            "reservation_id": result.reservation_id,
            "business_name": result.business_name,
            "reservation_date": result.reservation_date,
            "reservation_time": result.reservation_time,
            "method": result.method,
            "message": result.message,
            "timestamp": result.timestamp,
        })

    except ValueError as e:
        logger.error(f"Validation error in make_reservation: {e}")
        return json.dumps({
            "success": False,
            "error": f"Validation error: {str(e)}",
        })
    except Exception as e:
        logger.error(f"Error making reservation: {e}")
        return json.dumps({
            "success": False,
            "error": f"Error making reservation: {str(e)}",
        })


class SendReservationReminderInput(BaseModel):
    """Input for sending a reservation reminder to customer."""
    customer_email: str = Field(
        ...,
        description="Email address of the customer",
    )
    customer_phone: Optional[str] = Field(
        default=None,
        description=(
            "Phone number of the customer in E.164 format "
            "(e.g., +12125552368)"
        ),
    )
    business_name: str = Field(
        ...,
        description="Name of the business",
    )
    reservation_date: str = Field(
        ...,
        description="Date of reservation (YYYY-MM-DD)",
    )
    reservation_time: str = Field(
        ...,
        description="Time of reservation (HH:MM)",
    )
    confirmation_number: Optional[str] = Field(
        default=None,
        description="Reservation confirmation number if available",
    )

    model_config = ConfigDict(extra="forbid")


@tool(args_schema=SendReservationReminderInput)
@trace_span(name="send_reservation_reminder_tool")
def send_reservation_reminder(
    customer_email: str,
    business_name: str,
    reservation_date: str,
    reservation_time: str,
    customer_phone: Optional[str] = None,
    confirmation_number: Optional[str] = None,
) -> str:
    """
    Send a reservation reminder to the customer via email and/or SMS.
    
    This tool sends a reminder message to the customer about their upcoming
    reservation. It can send via email, SMS, or both.
    
    Args:
        customer_email: Customer's email address (required)
        business_name: Name of the business (required)
        reservation_date: Date of reservation in YYYY-MM-DD format (required)
        reservation_time: Time of reservation in HH:MM format (required)
        customer_phone: Customer's phone for SMS (optional, E.164 format)
        confirmation_number: Reservation confirmation number (optional)
    
    Returns:
        JSON string with reminder send status
    
    Example:
        >>> send_reservation_reminder(
        ...     customer_email="john@example.com",
        ...     customer_phone="+12125552368",
        ...     business_name="Tony's Pizza",
        ...     reservation_date="2026-03-20",
        ...     reservation_time="19:30",
        ...     confirmation_number="RES123456"
        ... )
    """
    try:
        service = get_reservation_service(use_mock_notifications=False)
        notification_service = service.notification_service

        results = []

        # Compose reminder message
        email_body = (
            f"Reminder: You have a reservation at {business_name}\n"
            f"Date: {reservation_date}\n"
            f"Time: {reservation_time}\n"
        )
        if confirmation_number:
            email_body += f"Confirmation #: {confirmation_number}\n"
        email_body += "\nPlease arrive 10-15 minutes early.\n"

        # Send email reminder
        email_result = notification_service.send_email(
            recipient=customer_email,
            subject=f"Reminder: Reservation at {business_name}",
            body=email_body,
        )
        results.append(("email", email_result.status))
        logger.info(f"Reminder email sent to {customer_email}")

        # Send SMS reminder if phone provided
        if customer_phone:
            sms_message = (
                f"Reminder: Your reservation at {business_name} "
                f"is on {reservation_date} at {reservation_time}"
            )
            sms_result = notification_service.send_sms(
                phone=customer_phone,
                message=sms_message,
            )
            results.append(("sms", sms_result.status))
            logger.info(f"Reminder SMS sent to {customer_phone}")

        # Track action
        track_action(
            action="send_reservation_reminder",
            details={
                "business_name": business_name,
                "reservation_date": reservation_date,
                "reservation_time": reservation_time,
                "results": results,
            },
        )

        return json.dumps({
            "success": True,
            "message": f"Reminder sent via {', '.join(r[0] for r in results)}",
            "results": results,
        })

    except Exception as e:
        logger.error(f"Error sending reminder: {e}")
        return json.dumps({
            "success": False,
            "error": f"Error sending reminder: {str(e)}",
        })
