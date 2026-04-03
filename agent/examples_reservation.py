"""
Example: Using the Reservation System with the AI Calendar Agent

This example demonstrates how to integrate the reservation tools
with your calendar agent.
"""

import json
import sys
import os

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

# Setup for demo (mocks Firebase)
from unittest.mock import MagicMock
sys.modules['firebase_admin'] = MagicMock()
sys.modules['firebase_admin.credentials'] = MagicMock()
sys.modules['firebase_admin.firestore'] = MagicMock()


def example_1_make_restaurant_reservation():
    """Example 1: Make a restaurant reservation using hybrid approach."""
    print("\n" + "="*70)
    print("EXAMPLE 1: Restaurant Reservation (Hybrid - OpenTable or Email/SMS)")
    print("="*70)
    
    from agent.tools.reservation_tools import make_reservation
    
    # Make a reservation at a restaurant
    result = make_reservation(
        business_name="Chez Restaurant",
        business_type="restaurant",
        customer_name="Jane Smith",
        customer_email="jane.smith@example.com",
        customer_phone="+14155552671",
        reservation_date="2026-03-22",
        reservation_time="19:30",
        party_size=4,
        special_requests="Window seat preferred, vegetarian menu",
        business_email="reservations@chez.com",
        business_phone="+14155552680"
    )
    
    result_data = json.loads(result)
    print(f"\nResult:")
    print(f"  Success: {result_data['success']}")
    print(f"  Method: {result_data['method']}")
    print(f"  Message: {result_data['message']}")
    print(f"  Reservation ID: {result_data.get('reservation_id')}")


def example_2_make_salon_appointment():
    """Example 2: Make a salon appointment."""
    print("\n" + "="*70)
    print("EXAMPLE 2: Salon Appointment (Direct Email/SMS)")
    print("="*70)
    
    from agent.tools.reservation_tools import make_reservation
    
    # Make an appointment at a salon
    result = make_reservation(
        business_name="Luxe Hair Salon",
        business_type="salon",
        customer_name="Alice Johnson",
        customer_email="alice.j@example.com",
        customer_phone="+14155552672",
        reservation_date="2026-03-25",
        reservation_time="14:00",
        special_requests="Haircut and highlights, usual style",
        business_email="appointments@luxehair.com",
        business_phone="+14155552681"
    )
    
    result_data = json.loads(result)
    print(f"\nResult:")
    print(f"  Success: {result_data['success']}")
    print(f"  Method: {result_data['method']}")
    print(f"  Message: {result_data['message']}")


def example_3_make_dental_appointment():
    """Example 3: Make a dental appointment."""
    print("\n" + "="*70)
    print("EXAMPLE 3: Dental Appointment")
    print("="*70)
    
    from agent.tools.reservation_tools import make_reservation
    
    # Make a dental appointment
    result = make_reservation(
        business_name="Bright Smile Dental",
        business_type="dentist",
        customer_name="Bob Wilson",
        customer_email="bob.wilson@example.com",
        customer_phone="+14155552673",
        reservation_date="2026-03-28",
        reservation_time="10:00",
        special_requests="Routine checkup",
        business_email="scheduling@brightsmile.com"
    )
    
    result_data = json.loads(result)
    print(f"\nResult:")
    print(f"  Success: {result_data['success']}")
    print(f"  Message: {result_data['message']}")


def example_4_send_reservation_reminder():
    """Example 4: Send a reservation reminder to customer."""
    print("\n" + "="*70)
    print("EXAMPLE 4: Send Reservation Reminder to Customer")
    print("="*70)
    
    from agent.tools.reservation_tools import send_reservation_reminder
    
    # Send reminder to customer
    result = send_reservation_reminder(
        customer_email="jane.smith@example.com",
        customer_phone="+14155552671",
        business_name="Chez Restaurant",
        reservation_date="2026-03-22",
        reservation_time="19:30",
        confirmation_number="CHEZ-12345"
    )
    
    result_data = json.loads(result)
    print(f"\nResult:")
    print(f"  Success: {result_data['success']}")
    print(f"  Message: {result_data['message']}")
    print(f"  Methods used: {result_data['results']}")


def example_5_handle_missing_business_contact():
    """Example 5: Error handling - missing business contact info."""
    print("\n" + "="*70)
    print("EXAMPLE 5: Error Handling - Missing Business Contact")
    print("="*70)
    
    from agent.tools.reservation_tools import make_reservation
    
    # This will fail because no business email or phone provided
    result = make_reservation(
        business_name="Unknown Restaurant",
        business_type="restaurant",
        customer_name="Charlie Brown",
        customer_email="charlie@example.com",
        reservation_date="2026-03-25",
        reservation_time="18:00"
        # Missing business_email and business_phone!
    )
    
    result_data = json.loads(result)
    print(f"\nResult:")
    print(f"  Success: {result_data['success']}")
    print(f"  Message: {result_data['message']}")
    print(f"  (This correctly fails - need business contact info)")


def example_6_service_usage():
    """Example 6: Using the service directly (not as tool)."""
    print("\n" + "="*70)
    print("EXAMPLE 6: Direct Service Usage (Not via Agent Tool)")
    print("="*70)
    
    from service.reservation_service import (
        ReservationService,
        ReservationRequest,
        BusinessType,
    )
    
    # Create service in mock mode
    service = ReservationService(use_mock_notifications=True)
    
    # Create request
    request = ReservationRequest(
        business_name="The Bistro",
        business_type=BusinessType.RESTAURANT,
        customer_name="David Lee",
        customer_email="david.lee@example.com",
        customer_phone="+14155552674",
        reservation_date="2026-03-30",
        reservation_time="20:00",
        party_size=2,
        special_requests="Anniversary dinner - surprise with champagne",
        business_email="reservations@bistro.com",
        business_phone="+14155552682"
    )
    
    # Make reservation
    result = service.make_reservation(request)
    
    print(f"\nDirect Service Result:")
    print(f"  Success: {result.success}")
    print(f"  Reservation ID: {result.reservation_id}")
    print(f"  Method: {result.method}")
    print(f"  Message: {result.message}")
    print(f"  Timestamp: {result.timestamp}")


def example_7_using_with_langchain_agent():
    """Example 7: How to integrate with LangChain agent."""
    print("\n" + "="*70)
    print("EXAMPLE 7: Integration with LangChain Agent")
    print("="*70)
    
    print("""
To integrate the reservation tools with your LangChain agent:

1. Import the tools:
   from agent.tools.reservation_tools import make_reservation, send_reservation_reminder

2. Add to your agent's tools list:
   tools = [
       get_user_calendar,
       add_event_to_calendar,
       search_for_business,
       get_business_details,
       make_reservation,           # <-- Add this
       send_reservation_reminder,  # <-- And this
   ]

3. Create the agent:
   agent = create_tool_calling_agent(
       llm=llm,
       tools=tools,
       prompt=system_prompt,
   )

4. The agent can now understand and execute:
   User: "Book a reservation at Tony's Pizza for 4 people on March 20 at 7:30pm"
   
   Agent will:
   - Parse the request
   - Call make_reservation() with appropriate parameters
   - Get confirmation and return result to user

5. Environment Setup:
   
   Development (Testing):
   - Set NOTIFICATION_MOCK_MODE=true
   - Notifications are logged but not actually sent
   
   Production:
   - Set NOTIFICATION_MOCK_MODE=false
   - Set up Gmail API credentials (credentials.json)
   - Set Twilio env vars:
     * TWILIO_ACCOUNT_SID
     * TWILIO_AUTH_TOKEN
     * TWILIO_PHONE_NUMBER
   - Set OpenTable API key (optional):
     * OPENTABLE_API_KEY
""")


if __name__ == "__main__":
    print("\n" + "="*70)
    print("RESERVATION SYSTEM EXAMPLES")
    print("="*70)
    
    # Run all examples
    example_1_make_restaurant_reservation()
    example_2_make_salon_appointment()
    example_3_make_dental_appointment()
    example_4_send_reservation_reminder()
    example_5_handle_missing_business_contact()
    example_6_service_usage()
    example_7_using_with_langchain_agent()
    
    print("\n" + "="*70)
    print("Examples completed!")
    print("="*70)
    print("\nFor more details, see RESERVATION_SYSTEM.md")
