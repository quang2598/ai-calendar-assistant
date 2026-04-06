"""
Reservation Service for making reservations via multiple channels.
Supports OpenTable API for restaurants and fallback to email/SMS for other businesses.
"""

from __future__ import annotations

import os
from datetime import datetime
from typing import Optional, Dict, Any
from enum import Enum

from loguru import logger
from pydantic import BaseModel, Field

from service.notification_service import get_notification_service, NotificationResult


class BusinessType(str, Enum):
    """Types of businesses that can accept reservations."""
    RESTAURANT = "restaurant"
    HOTEL = "hotel"
    SALON = "salon"
    CLINIC = "clinic"
    DENTIST = "dentist"
    SPA = "spa"
    GYM = "gym"
    OTHER = "other"


class ReservationRequest(BaseModel):
    """Request to make a reservation."""
    business_name: str = Field(..., description="Name of the business")
    business_type: BusinessType = Field(..., description="Type of business")
    customer_name: str = Field(..., description="Name of the customer")
    customer_email: str = Field(..., description="Customer email address")
    customer_phone: Optional[str] = Field(
        default=None,
        description="Customer phone number (E.164 format, e.g., +12125552368)"
    )
    reservation_date: str = Field(
        ...,
        description="Date of reservation (ISO format: YYYY-MM-DD)"
    )
    reservation_time: str = Field(
        ...,
        description="Time of reservation (HH:MM format)"
    )
    party_size: Optional[int] = Field(
        default=None,
        description="Number of people (for restaurants)"
    )
    special_requests: Optional[str] = Field(
        default=None,
        description="Any special requests or notes"
    )
    business_email: Optional[str] = Field(
        default=None,
        description="Business email address"
    )
    business_phone: Optional[str] = Field(
        default=None,
        description="Business phone number"
    )


class ReservationResult(BaseModel):
    """Result of a reservation attempt."""
    success: bool
    reservation_id: Optional[str] = None
    business_name: str
    reservation_date: str
    reservation_time: str
    method: str = Field(
        ...,
        description="'opentable', 'email', 'sms', or 'failed'"
    )
    message: str
    notification_results: list[NotificationResult] = Field(
        default_factory=list
    )
    timestamp: str = Field(default_factory=lambda: datetime.now().isoformat())


class ReservationService:
    """
    Service for making reservations using multiple channels.
    Tries OpenTable for restaurants, falls back to email/SMS for others.
    """

    def __init__(self, use_mock_notifications: bool = True):
        """
        Initialize ReservationService.
        
        Args:
            use_mock_notifications: If True, notifications are mocked (not actually sent)
        """
        self.notification_service = get_notification_service(
            use_mock=use_mock_notifications
        )
        self.openTable_api_key = os.getenv("OPENTABLE_API_KEY")
        self.use_mock_notifications = use_mock_notifications

    def make_reservation(
        self,
        request: ReservationRequest,
    ) -> ReservationResult:
        """
        Make a reservation using the best available method.
        
        For restaurants with OpenTable: tries OpenTable first
        For other businesses: sends email/SMS to business
        
        Args:
            request: ReservationRequest with all necessary details
            
        Returns:
            ReservationResult with outcome and details
        """
        logger.info(
            f"Making reservation for {request.business_name} "
            f"on {request.reservation_date} at {request.reservation_time}"
        )

        # Try OpenTable for restaurants
        if (request.business_type == BusinessType.RESTAURANT 
            and self.openTable_api_key):
            try:
                result = self._make_opentable_reservation(request)
                if result.success:
                    return result
                logger.warning(
                    f"OpenTable reservation failed: {result.message}, "
                    "falling back to email/SMS"
                )
            except Exception as e:
                logger.warning(f"OpenTable error: {e}, falling back to email/SMS")

        # Fall back to email/SMS
        return self._make_direct_reservation(request)

    def _make_opentable_reservation(
        self,
        request: ReservationRequest,
    ) -> ReservationResult:
        """
        Make a reservation via OpenTable API.
        
        This is a placeholder for actual OpenTable integration.
        In production, you would call the OpenTable API here.
        """
        try:
            # This is a placeholder implementation
            # In production, integrate with OpenTable API:
            # https://platform.opentable.com/docs/api

            logger.info(
                f"[OpenTable] Would reserve {request.business_name} "
                f"for {request.customer_name} "
                f"on {request.reservation_date} at {request.reservation_time} "
                f"(party size: {request.party_size})"
            )

            # For now, return a mock success response
            if self.use_mock_notifications:
                return ReservationResult(
                    success=True,
                    reservation_id=f"OT-{datetime.now().timestamp()}",
                    business_name=request.business_name,
                    reservation_date=request.reservation_date,
                    reservation_time=request.reservation_time,
                    method="opentable",
                    message=(
                        f"Mock OpenTable reservation confirmed for "
                        f"{request.customer_name} at {request.business_name}"
                    ),
                )
            
            # In production, call OpenTable API here
            raise NotImplementedError(
                "Production OpenTable integration not yet implemented"
            )

        except Exception as e:
            logger.error(f"OpenTable reservation failed: {e}")
            return ReservationResult(
                success=False,
                business_name=request.business_name,
                reservation_date=request.reservation_date,
                reservation_time=request.reservation_time,
                method="opentable",
                message=f"OpenTable reservation failed: {str(e)}",
            )

    def _make_direct_reservation(
        self,
        request: ReservationRequest,
    ) -> ReservationResult:
        """
        Make a reservation by sending email and/or SMS to the business.
        """
        notification_results = []
        methods_used = []

        # Compose reservation message
        message_body = self._compose_reservation_message(request)

        # Send email if available
        if request.business_email:
            email_result = self.notification_service.send_email(
                recipient=request.business_email,
                subject=(
                    f"Reservation Request from {request.customer_name} - "
                    f"{request.reservation_date} at {request.reservation_time}"
                ),
                body=message_body,
                html_body=self._compose_html_message(request),
            )
            notification_results.append(email_result)
            methods_used.append("email")
            logger.info(f"Email sent to {request.business_email}")

        # Send SMS if available
        if request.business_phone:
            sms_message = (
                f"Reservation request: {request.customer_name} for "
                f"{request.reservation_date} at {request.reservation_time}. "
                f"Contact: {request.customer_phone or request.customer_email}"
            )
            sms_result = self.notification_service.send_sms(
                phone=request.business_phone,
                message=sms_message,
            )
            notification_results.append(sms_result)
            methods_used.append("sms")
            logger.info(f"SMS sent to {request.business_phone}")

        # Determine success
        success = any(
            r.status in ["sent", "mock_sent"]
            for r in notification_results
        )

        return ReservationResult(
            success=success,
            reservation_id=(
                f"DIR-{datetime.now().timestamp()}"
                if success else None
            ),
            business_name=request.business_name,
            reservation_date=request.reservation_date,
            reservation_time=request.reservation_time,
            method=",".join(methods_used) or "failed",
            message=(
                f"Reservation request sent to {request.business_name} "
                f"via {', '.join(methods_used)}"
                if success
                else "Failed to send reservation request (no email or phone)"
            ),
            notification_results=notification_results,
        )

    def _compose_reservation_message(
        self,
        request: ReservationRequest,
    ) -> str:
        """Compose a plain text reservation message."""
        lines = [
            "=== RESERVATION REQUEST ===",
            "",
            f"Customer: {request.customer_name}",
            f"Email: {request.customer_email}",
        ]

        if request.customer_phone:
            lines.append(f"Phone: {request.customer_phone}")

        lines.extend([
            "",
            f"Date: {request.reservation_date}",
            f"Time: {request.reservation_time}",
        ])

        if request.party_size:
            lines.append(f"Party Size: {request.party_size}")

        if request.special_requests:
            lines.extend([
                "",
                f"Special Requests: {request.special_requests}",
            ])

        lines.extend([
            "",
            "Please confirm this reservation at your earliest convenience.",
            "",
            "Thank you!",
        ])

        return "\n".join(lines)

    def _compose_html_message(
        self,
        request: ReservationRequest,
    ) -> str:
        """Compose an HTML reservation message."""
        special_requests_html = ""
        if request.special_requests:
            special_requests_html = f"""
            <tr>
                <td><strong>Special Requests:</strong></td>
                <td>{request.special_requests}</td>
            </tr>
            """

        party_size_html = ""
        if request.party_size:
            party_size_html = f"""
            <tr>
                <td><strong>Party Size:</strong></td>
                <td>{request.party_size}</td>
            </tr>
            """

        html = f"""
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; }}
                .container {{ max-width: 600px; margin: 0 auto; }}
                table {{ width: 100%; border-collapse: collapse; }}
                td {{ padding: 8px; border-bottom: 1px solid #eee; }}
                .header {{ background-color: #f5f5f5; font-weight: bold; }}
                .footer {{ margin-top: 20px; font-size: 12px; color: #666; }}
            </style>
        </head>
        <body>
            <div class="container">
                <h2>Reservation Request</h2>
                <table>
                    <tr>
                        <td><strong>Customer:</strong></td>
                        <td>{request.customer_name}</td>
                    </tr>
                    <tr>
                        <td><strong>Email:</strong></td>
                        <td>{request.customer_email}</td>
                    </tr>
                    {f'<tr><td><strong>Phone:</strong></td><td>{request.customer_phone}</td></tr>' if request.customer_phone else ''}
                    <tr>
                        <td><strong>Date:</strong></td>
                        <td>{request.reservation_date}</td>
                    </tr>
                    <tr>
                        <td><strong>Time:</strong></td>
                        <td>{request.reservation_time}</td>
                    </tr>
                    {party_size_html}
                    {special_requests_html}
                </table>
                <div class="footer">
                    <p>Please confirm this reservation at your earliest convenience.</p>
                </div>
            </div>
        </body>
        </html>
        """
        return html


# Global service instance
_reservation_service: Optional[ReservationService] = None


def get_reservation_service(
    use_mock_notifications: bool = True,
) -> ReservationService:
    """
    Get or create the global reservation service.
    
    Args:
        use_mock_notifications: If True, notifications are mocked
    """
    global _reservation_service
    
    if _reservation_service is None:
        _reservation_service = ReservationService(
            use_mock_notifications=use_mock_notifications
        )
    
    return _reservation_service
