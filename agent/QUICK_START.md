# Reservation System - Quick Start Guide

## 30-Second Overview

You now have a complete reservation system that:
- Sends emails via Gmail API
- Sends SMS via Twilio  
- Attempts OpenTable for restaurants, falls back to email/SMS
- Works in mock mode (testing) and real mode (production)

## Quick Start (5 minutes)

### 1. Install Dependencies
```bash
cd agent
pip install -r requirements.txt
```

### 2. Test It (No Setup Required)
```bash
python test_integration.py
```

You should see:
```
============================================================
✓ ALL TESTS PASSED
============================================================
```

### 3. Review What You Got

Three new files in `src/service/`:
- `notification_service.py` - Email/SMS handler
- `reservation_service.py` - Reservation orchestration
- One new file in `src/agent/tools/`:
- `reservation_tools.py` - Agent tools

All with full documentation in `RESERVATION_SYSTEM.md`

## Using in Mock Mode (Development)

Default behavior - **no actual emails/SMS sent**, just logged:

```python
from service.reservation_service import ReservationService, ReservationRequest, BusinessType

# Service is in mock mode by default
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
    business_email="reservations@tonys.com",
    business_phone="+12125552370"
)

result = service.make_reservation(request)
print(f"Success: {result.success}")
print(f"Method: {result.method}")  # 'email', 'sms', or 'email,sms'
```

## Using with Agent

Add to your agent's tools:

```python
from agent.tools.reservation_tools import make_reservation, send_reservation_reminder

# In agent setup:
tools = [
    # ... existing tools ...
    make_reservation,
    send_reservation_reminder,
]
```

Now the agent can handle:
- "Book a table for 4 at Tony's Pizza on Friday at 7:30pm"
- "Make me a dentist appointment next Tuesday"
- "Send a reminder about my restaurant reservation"

## Setting Up Real Email (Gmail)

When ready for production emails:

1. **Create Google Cloud Project**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create new project

2. **Enable Gmail API**
   - Search for "Gmail API"
   - Click "Enable"

3. **Create OAuth Credentials**
   - Go to "Credentials"
   - Create "OAuth 2.0 Client ID" (Desktop app)
   - Download JSON file

4. **Save Credentials**
   ```bash
   # Place downloaded file in project root as:
   # agent/src/credentials.json
   ```

5. **Use Real Mode**
   ```python
   service = ReservationService(use_mock_notifications=False)
   # First run will open browser to authenticate
   ```

## Setting Up Real SMS (Twilio)

When ready for production SMS:

1. **Create Twilio Account**
   - Go to [Twilio.com](https://twilio.com)
   - Sign up for free trial ($15 credit)

2. **Get Credentials**
   - Find "Account SID" in console
   - Find "Auth Token" in console
   - Get a phone number from "Phone Numbers" section

3. **Set Environment Variables**
   ```bash
   # On Windows:
   $env:TWILIO_ACCOUNT_SID = "your_account_sid"
   $env:TWILIO_AUTH_TOKEN = "your_auth_token"
   $env:TWILIO_PHONE_NUMBER = "+1234567890"
   
   # Or in .env file:
   TWILIO_ACCOUNT_SID=your_account_sid
   TWILIO_AUTH_TOKEN=your_auth_token
   TWILIO_PHONE_NUMBER=+1234567890
   ```

4. **Use Real Mode**
   ```python
   service = ReservationService(use_mock_notifications=False)
   ```

## Environment Variables

```bash
# Mock mode (default) - no actual sends
NOTIFICATION_MOCK_MODE=true

# Real mode - actually send emails/SMS
NOTIFICATION_MOCK_MODE=false

# Twilio (optional)
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_PHONE_NUMBER=+1234567890

# OpenTable (optional, future)
OPENTABLE_API_KEY=your_key
```

## Supported Business Types

```
restaurant  → Tries OpenTable, falls back to email/SMS
hotel       → Email/SMS
salon       → Email/SMS
clinic      → Email/SMS
dentist     → Email/SMS
spa         → Email/SMS
gym         → Email/SMS
other       → Email/SMS
```

## Common Scenarios

### Scenario 1: Restaurant Reservation
```python
make_reservation(
    business_name="Tony's Pizza",
    business_type="restaurant",
    customer_name="John Smith",
    customer_email="john@example.com",
    customer_phone="+12125552368",
    reservation_date="2026-03-20",
    reservation_time="19:30",
    party_size=4,
    special_requests="Window seat if possible",
    business_email="reservations@tonys.com",
    business_phone="+12125552370"
)
```

### Scenario 2: Salon Appointment
```python
make_reservation(
    business_name="Luxe Hair Salon",
    business_type="salon",
    customer_name="Alice Johnson",
    customer_email="alice@example.com",
    customer_phone="+12125552372",
    reservation_date="2026-03-25",
    reservation_time="14:00",
    special_requests="Haircut and highlights",
    business_email="appointments@salon.com"
)
```

### Scenario 3: Dentist Appointment
```python
make_reservation(
    business_name="Bright Smile Dental",
    business_type="dentist",
    customer_name="Bob Wilson",
    customer_email="bob@example.com",
    reservation_date="2026-03-28",
    reservation_time="10:00",
    special_requests="Routine checkup",
    business_email="scheduling@dental.com"
)
```

## What Happens Behind the Scenes

### For Restaurants (if OpenTable available):
1. Try to book via OpenTable API
2. If successful, return OpenTable confirmation
3. If fails, fall back to email/SMS

### For All Businesses:
1. Send email to business_email (if provided)
2. Send SMS to business_phone (if provided)
3. Return success if at least one sent
4. Return failure if neither provided

### In Mock Mode:
- Logs all operations to console
- Returns "mock_sent" status
- No actual emails/SMS sent
- Perfect for testing!

## Testing Examples

```bash
# Run full integration test
python test_integration.py

# Run specific tests (from agent directory)
cd agent
python -m pytest test/test_notification_service.py -v
python -m pytest test/test_reservation_service.py -v
```

## Troubleshooting

**Q: Emails not sending in real mode?**
- Check `credentials.json` exists in project root
- Verify Gmail API is enabled
- Check logs for error messages
- Try first run in browser auth mode

**Q: SMS not sending in real mode?**
- Verify environment variables are set
- Check phone numbers are E.164 format (+12125552368)
- Verify Twilio account has balance
- Check sandbox settings if in trial

**Q: Getting "module not found" errors?**
- Make sure you're in agent directory: `cd agent`
- Run: `pip install -r src/requirements.txt`

## Documentation

- **Full Documentation**: See [RESERVATION_SYSTEM.md](RESERVATION_SYSTEM.md)
- **Implementation Details**: See [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)  
- **Examples**: See [examples_reservation.py](examples_reservation.py)

## Next Steps

1. ✅ Understand how the system works (you're reading this!)
2. ✅ Run integration tests to verify: `python test_integration.py`
3. 📋 When ready for real emails: Set up Gmail API
4. 📋 When ready for real SMS: Set up Twilio
5. 📋 Add tools to your agent's tool registry
6. 📋 Test with actual reservations

## Need Help?

- Check [RESERVATION_SYSTEM.md](RESERVATION_SYSTEM.md) for detailed setup
- Review [examples_reservation.py](examples_reservation.py) for code examples
- Look at [test_integration.py](test_integration.py) for working code
- Check logs - they show exactly what's happening

---

**You're ready to go!** 🚀

Start with mock mode, test it, then set up real services when needed.
