# Reservation System Implementation

This document describes the hybrid reservation system implementation for the AI Calendar Agent, which supports email, SMS, and OpenTable API for making reservations.

## Overview

The reservation system uses a **hybrid approach**:
1. **For restaurants**: First attempts to use OpenTable API (if configured)
2. **For all businesses**: Falls back to sending email and/or SMS directly to the business

This approach ensures flexibility and works with any business type.

## Architecture

### Components

#### 1. **notification_service.py** - Email & SMS Handler
Handles sending notifications via:
- **Gmail API** - For email notifications
- **Twilio** - For SMS notifications

**Key Features:**
- Mock mode for testing (doesn't actually send)
- Real mode for production sends
- Supports both plain text and HTML emails
- Graceful error handling

**Usage:**
```python
from service.notification_service import get_notification_service

# Get service instance
notification_service = get_notification_service(use_mock=True)  # Mock mode

# Send email
result = notification_service.send_email(
    recipient="customer@example.com",
    subject="Your Reservation",
    body="Confirmation details..."
)

# Send SMS
result = notification_service.send_sms(
    phone="+12125552368",
    message="Your reservation is confirmed"
)
```

#### 2. **reservation_service.py** - Reservation Logic
Orchestrates the reservation process:
- Validates reservation details
- Tries OpenTable API for restaurants
- Falls back to email/SMS for other businesses
- Tracks reservation attempts

**Key Classes:**
- `ReservationRequest` - Input validation
- `ReservationResult` - Outcome tracking
- `BusinessType` - Enum of supported business types
- `ReservationService` - Main service class

**Usage:**
```python
from service.reservation_service import (
    get_reservation_service,
    ReservationRequest,
    BusinessType,
)

service = get_reservation_service(use_mock_notifications=True)

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
    special_requests="Window seat preferred"
)

result = service.make_reservation(request)
print(f"Success: {result.success}")
print(f"Method: {result.method}")  # 'opentable', 'email', 'sms', or combined
```

#### 3. **reservation_tools.py** - Agent Integration
LangChain tools for the agent:

**Tool 1: `make_reservation`**
Makes a reservation using the hybrid approach.

**Tool 2: `send_reservation_reminder`**
Sends a reminder email/SMS to customer about their reservation.

## Setup Instructions

### Prerequisites

#### Gmail API Setup
1. Create a Google Cloud project
2. Enable Gmail API
3. Create OAuth 2.0 credentials (Desktop application)
4. Download `credentials.json` and place in project root
5. First run will open browser to authorize access
6. `token.pickle` file will be created automatically

#### Twilio Setup
1. Create Twilio account (free trial available)
2. Get Account SID and Auth Token from console
3. Get a Twilio phone number
4. Set environment variables:
```bash
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890
```

#### OpenTable API (Optional)
1. Get OpenTable API key from developer portal
2. Set environment variable:
```bash
OPENTABLE_API_KEY=your_api_key
```

#### Configuration
Create `.env` file in project root:
```bash
# Gmail (auto-configured via credentials.json)
# No setup needed if using OAuth flow

# Twilio
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890

# OpenTable (optional)
OPENTABLE_API_KEY=your_api_key

# Notification mode
NOTIFICATION_MOCK_MODE=true  # Set to false for real sends
```

### Installation

1. Install dependencies:
```bash
pip install -r requirements.txt
```

Required packages:
- `twilio>=9.3.0` - SMS sending
- `google-auth-oauthlib>=1.2.1` - Gmail OAuth
- `google-auth-httplib2>=0.2.0` - Gmail HTTP client

2. Set up Gmail credentials:
```bash
# Place credentials.json in project root
# First run will authenticate
```

3. Set environment variables for Twilio (if using real SMS)

## Testing

### Mock Mode (Recommended for Development)

Mock mode logs all notifications without actually sending them:

```python
from service.reservation_service import get_reservation_service

# Use mock mode
service = get_reservation_service(use_mock_notifications=True)

# Notifications won't be actually sent
result = service.make_reservation(request)
```

### Real Mode (Production)

```python
# Use real mode
service = get_reservation_service(use_mock_notifications=False)

# Notifications will be sent via Gmail/Twilio
result = service.make_reservation(request)
```

### Running Tests

```bash
# Run all tests
pytest

# Run specific test file
pytest test/test_reservation_service.py

# Run with coverage
pytest --cov=agent.tools --cov=service test/
```

### Test Email/SMS Services

**For Email:**
- Use Gmail test accounts or your personal email
- Check inbox for actual emails

**For SMS:**
- Twilio free trial includes sandbox that sends to approved numbers only
- Add your test phone number to Twilio console
- SMS will be delivered to that number

## Supported Business Types

```
- restaurant     - Restaurants (can use OpenTable)
- hotel          - Hotels and accommodations
- salon          - Hair salons and barber shops
- clinic         - Medical clinics
- dentist        - Dental offices
- spa            - Spas and massage centers
- gym            - Fitness centers
- other          - Any other business type
```

## Reservation Flow

### For Restaurants:
```
make_reservation()
    ↓
Try OpenTable API
    ↓
[Success] → Return OpenTable confirmation
[Failed] → Fall back to email/SMS
    ↓
Send email to business_email
Send SMS to business_phone
    ↓
Return result with methods used
```

### For Other Businesses:
```
make_reservation()
    ↓
Send email to business_email
Send SMS to business_phone
    ↓
Return result with methods used
```

## Example Usage in Agent

```python
# Add to your agent's tool list
from agent.tools.reservation_tools import make_reservation, send_reservation_reminder

# The agent can now use:
make_reservation(
    business_name="Chez Restaurant",
    business_type="restaurant",
    customer_name="Jane Smith",
    customer_email="jane@example.com",
    customer_phone="+12125552368",
    reservation_date="2026-03-20",
    reservation_time="19:30",
    party_size=4,
    special_requests="Vegetarian options preferred",
    business_email="reservations@chez.com",
    business_phone="+12025551234"
)

# Send reminder before reservation
send_reservation_reminder(
    customer_email="jane@example.com",
    customer_phone="+12125552368",
    business_name="Chez Restaurant",
    reservation_date="2026-03-20",
    reservation_time="19:30",
    confirmation_number="RES-123456"
)
```

## Environment Variables Summary

```
NOTIFICATION_MOCK_MODE      # 'true' or 'false' - Enable mock mode
TWILIO_ACCOUNT_SID          # Twilio account identifier
TWILIO_AUTH_TOKEN           # Twilio authentication token
TWILIO_PHONE_NUMBER         # Twilio phone number for sending SMS
OPENTABLE_API_KEY           # OpenTable API key (optional)
```

## Error Handling

The system gracefully handles:
- Missing Gmail credentials → Warning, email disabled
- Missing Twilio config → Warning, SMS disabled
- Missing business contact info → Reservation fails with clear message
- Invalid business type → Returns error
- Network failures → Logged and returned in result

## Future Enhancements

1. **OpenTable Integration** - Full implementation with API calls
2. **Database Tracking** - Store reservation attempts and confirmations
3. **Confirmation Parsing** - Extract confirmation numbers from business responses
4. **Retry Logic** - Automatic retry for failed reservations
5. **Multi-language Support** - Email/SMS templates in multiple languages
6. **Webhook Integration** - Receive confirmation callbacks from businesses
7. **SMS-based Confirmations** - Parse confirmation SMS from businesses

## Troubleshooting

### Gmail Issues
- **"Gmail credentials not initialized"** - Run credentials OAuth flow again
- **"token.pickle not found"** - First run needs browser authorization
- Check logs for detailed auth errors

### Twilio Issues
- **"Twilio client not initialized"** - Check `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`
- **Message delivery failed** - Verify phone numbers are in E.164 format (+12125552368)
- Sandbox mode requires approved recipient numbers

### OpenTable Issues
- **Not implemented yet** - Placeholder for future implementation
- Set `OPENTABLE_API_KEY` to enable (when fully implemented)

## Security Considerations

1. **Credentials** - Store API keys in environment variables, never commit to git
2. **Phone Numbers** - Use E.164 format for international support
3. **Email Validation** - Pydantic validates email format
4. **Rate Limiting** - Implement per-business rate limits in production
5. **Audit Logging** - All reservation attempts are logged

## References

- [Gmail API Documentation](https://developers.google.com/gmail/api/guides)
- [Twilio SMS Documentation](https://www.twilio.com/docs/sms)
- [OpenTable API](https://platform.opentable.com/docs/api)
- [LangChain Tools](https://python.langchain.com/docs/modules/tools/)
