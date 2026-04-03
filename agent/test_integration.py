"""
Quick integration test for the reservation system.
This demonstrates how the system works without running full pytest.
"""

import sys
import os

# Add src to path FIRST
src_path = os.path.join(os.path.dirname(__file__), 'src')
if src_path not in sys.path:
    sys.path.insert(0, src_path)

# Mock Firebase before importing
from unittest.mock import MagicMock
sys.modules['firebase_admin'] = MagicMock()
sys.modules['firebase_admin.credentials'] = MagicMock()
sys.modules['firebase_admin.firestore'] = MagicMock()
sys.modules['firebase_admin.db'] = MagicMock()


def test_notification_service():
    """Test notification service in mock mode."""
    print("\n✓ Testing NotificationService (Mock Mode)")
    
    from service.notification_service import NotificationService
    
    service = NotificationService(use_mock=True)
    
    # Test email
    result = service.send_email(
        recipient="test@example.com",
        subject="Test",
        body="Test body"
    )
    assert result.status == "mock_sent"
    assert result.message_type == "email"
    print(f"  ✓ Email: {result.status} to {result.recipient}")
    
    # Test SMS
    result = service.send_sms(
        phone="+12125552368",
        message="Test SMS"
    )
    assert result.status == "mock_sent"
    assert result.message_type == "sms"
    print(f"  ✓ SMS: {result.status} to {result.recipient}")
    
    # Check status
    status = service.get_status()
    print(f"  ✓ Service status: {status}")


def test_reservation_service():
    """Test reservation service in mock mode."""
    print("\n✓ Testing ReservationService (Mock Mode)")
    
    from service.reservation_service import (
        ReservationService,
        ReservationRequest,
        BusinessType,
    )
    
    service = ReservationService(use_mock_notifications=True)
    
    # Create request
    request = ReservationRequest(
        business_name="Tony's Pizza",
        business_type=BusinessType.RESTAURANT,
        customer_name="John Smith",
        customer_email="john@example.com",
        customer_phone="+12125552368",
        reservation_date="2026-03-20",
        reservation_time="19:30",
        party_size=4,
        business_email="reservations@tonys.com",
        business_phone="+12125552370",
        special_requests="Window seat"
    )
    
    # Make reservation
    result = service.make_reservation(request)
    print(f"  ✓ Reservation success: {result.success}")
    print(f"  ✓ Business: {result.business_name}")
    print(f"  ✓ Date/Time: {result.reservation_date} at {result.reservation_time}")
    print(f"  ✓ Method used: {result.method}")
    print(f"  ✓ Message: {result.message}")


def test_reservation_without_contact():
    """Test reservation fails without business contact."""
    print("\n✓ Testing ReservationService without business contact")
    
    from service.reservation_service import (
        ReservationService,
        ReservationRequest,
        BusinessType,
    )
    
    service = ReservationService(use_mock_notifications=True)
    
    request = ReservationRequest(
        business_name="Unknown Restaurant",
        business_type=BusinessType.RESTAURANT,
        customer_name="Jane Doe",
        customer_email="jane@example.com",
        reservation_date="2026-03-21",
        reservation_time="18:00"
        # No business_email or business_phone
    )
    
    result = service.make_reservation(request)
    assert result.success is False
    print(f"  ✓ Correctly failed: {result.message}")


def test_compose_messages():
    """Test message composition."""
    print("\n✓ Testing message composition")
    
    from service.reservation_service import (
        ReservationService,
        ReservationRequest,
        BusinessType,
    )
    
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
        special_requests="Vegetarian",
        business_email="test@example.com"
    )
    
    # Test plain text message
    message = service._compose_reservation_message(request)
    assert "John Smith" in message
    assert "2026-03-20" in message
    assert "19:30" in message
    assert "4" in message
    assert "Vegetarian" in message
    print("  ✓ Plain text message composed correctly")
    
    # Test HTML message
    html = service._compose_html_message(request)
    assert "<html>" in html
    assert "John Smith" in html
    assert "2026-03-20" in html
    print("  ✓ HTML message composed correctly")


def test_business_types():
    """Test all business types."""
    print("\n✓ Testing business types")
    
    from service.reservation_service import BusinessType
    
    types = [
        "restaurant", "hotel", "salon", "clinic",
        "dentist", "spa", "gym", "other"
    ]
    
    for type_str in types:
        btype = BusinessType(type_str)
        assert btype.value == type_str
        print(f"  ✓ {type_str}")


if __name__ == "__main__":
    print("=" * 60)
    print("RESERVATION SYSTEM INTEGRATION TEST")
    print("=" * 60)
    
    try:
        test_notification_service()
        test_reservation_service()
        test_reservation_without_contact()
        test_compose_messages()
        test_business_types()
        
        print("\n" + "=" * 60)
        print("✓ ALL TESTS PASSED")
        print("=" * 60)
    except Exception as e:
        print(f"\n✗ TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
