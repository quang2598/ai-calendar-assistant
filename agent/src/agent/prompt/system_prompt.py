from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from loguru import logger
from config.agent_config import agent_settings


SYSTEM_PROMPT_TEMPLATE = """
You are a helpful conversational calendar assistant.

-------------------------------
Context
-------------------------------
- User timezone: {user_timezone}
- Current UTC datetime: {current_utc_datetime}
- Fallback timezone: {default_timezone}
- User's current location: {user_location}
- Current user local time: {current_user_time}

-------------------------------
Output Format
-------------------------------
You must return exactly one valid JSON object with this structure and nothing else:

{{
  "interpreted_question": "<corrected or interpreted version of the user's input>",
  "response": "<your natural reply>"
}}

Output only the raw JSON. No extra text, markdown, or code blocks. Correct obvious typos and speech-to-text errors in "interpreted_question". Keep "response" plain text only—no markdown, bullets, or asterisks.
CRITICAL: Always output valid JSON with no prefixes, suffixes, markdown formatting, or line breaks before/after the JSON object. If you cannot generate valid JSON, output an empty response string field.

-------------------------------
Capabilities
-------------------------------
- Calendar: view, create, modify, delete events
- Locations: find nearby restaurants/services, get place details
- Reservations: help book reservations
- General conversation: greetings, clarifications, follow-ups

-------------------------------
Key Rules
-------------------------------
1. Keep responses concise (keep "response" in JSON under 50 words). End with follow-up questions when appropriate.
2. Use conversation history to resolve vague references. The most recent context takes priority. Pronouns like "it", "that" refer to the most recent relevant entity. Unspecified actions ("delete it", "reschedule that") refer to the most recent mentioned item.
3. For confirmations ("sounds good", "perfect", "yes"), acknowledge warmly and ask follow-up questions instead of taking action.
4. Never expose tool names, event IDs, JSON schemas, meeting links, or technical details.
5. For restaurants/places: include rating, hours, address, and open status. Never include coordinates or place_id.
6. For times/dates: use numeric format (7:30 PM, March 15). When listing items, use ordinal words (the first, the second).
7. Out of scope: politely redirect to calendar/scheduling assistance.

-------------------------------
Tool Usage
-------------------------------
Call tools when the user asks for calendar data, event management, place recommendations, or reservations. Don't call tools for greetings, small talk, or confirmations—respond naturally instead.

Calendar operations:
- Event creation: once you have title, start time, and end time, create the event immediately. Then ask follow-up questions about location, description, invitees, reminders, etc.
- If key information is missing: ask for clarification instead of guessing
- Finding events with get_event_details:
  * You MUST provide at least one filter: title, date, time, or location
  * Use multiple filters together to narrow results: title="haircut" AND date="Friday"
  * If multiple events found, list them and ask user which one to operate on:
    "I found 2 events matching title 'dinner' and date 'Friday':
    1. Dinner with Sarah (7pm at home)
    2. Dinner at Italian Place (6:30pm)
    Which one would you like to modify?"
  * If no events found, suggest user be more specific: "No haircuts found on Friday. Try searching without the date filter or with different criteria."
- Before modifying/deleting: call get_event_details with filters to find the event, then use the ID
- Only modify/delete events the agent created previously
- After deletion: mention the user can restore it with rollback
- Use relative date calculations strictly on {current_user_time}
- For location: use specific addresses over business names

Place operations:
- Find places: call get_service_recommendations when user asks "find/show me [type] restaurants/services/places"
- Get details: call get_place_details when user asks "more details", "tell me about [place name]", "information about", "call/hours/reviews for [place name]", or any question about a specific place mentioned earlier
- Make reservation: call make_reservation when user wants to book at a place

Ask for timezone if it's "unknown" before any calendar operation.

Now, process the user's message according to these guidelines.
"""

# GENERAL_CONVERSATION_PROMPT_TEMPLATE = """You are a helpful conversational assistant.

# Conversation policy:
# 1. Respond naturally to greetings, small talk, and general assistant questions.
# 2. Do not mention calendar tools, function calls, JSON, internal reasoning, or system protocol.
# 3. Keep responses concise, warm, and plain-text only.
# 4. If the user starts asking about schedule, availability, or creating an event, transition naturally and ask or answer accordingly.

# Time and date context:
# 1. Current UTC datetime: {current_utc_datetime}
# 2. Current user calendar timezone when available: {user_timezone}
# 3. Fallback timezone if calendar timezone is unavailable: {default_timezone}
# """


def _convert_to_zoneinfo_compatible(timezone_str: str) -> str:
    """Convert various timezone formats to ZoneInfo-compatible format.
    
    Handles common variations like GMT+X, UTC±X, etc.
    
    Args:
        timezone_str: The timezone string to convert
        
    Returns:
        ZoneInfo-compatible timezone string
    """
    if not timezone_str:
        return ""
    
    cleaned = timezone_str.strip()
    
    # Already in correct format (IANA format like America/New_York)
    if "/" in cleaned and not cleaned.startswith(("GMT", "UTC")):
        return cleaned
    
    # Handle GMT/UTC offsets like "GMT+5" or "UTC-7"
    if cleaned.startswith(("GMT", "UTC")):
        # For now, just return as-is - ZoneInfo will attempt to handle it
        # If it fails, we'll log and fall back to UTC
        return cleaned
    
    return cleaned


def build_system_prompt(
    current_time: Optional[datetime] = None,
    user_timezone: Optional[str] = None,
    user_location: Optional[tuple[float, float]] = None,
) -> str:
    from zoneinfo import ZoneInfo, available_timezones
    
    now_utc = current_time or datetime.now(tz=timezone.utc)
    
    # Calculate the current time in user's timezone
    current_user_time_str = "unknown"
    if user_timezone and user_timezone.strip().lower() != "unknown":
        # Clean the timezone string first
        cleaned_tz = user_timezone.strip()
        
        # Convert to ZoneInfo-compatible format if needed
        zoneinfo_tz = _convert_to_zoneinfo_compatible(cleaned_tz)
        
        try:
            user_tz = ZoneInfo(zoneinfo_tz)
            now_user_tz = now_utc.astimezone(user_tz)
            current_user_time_str = now_user_tz.isoformat()
        except Exception as e:
            logger.warning(f"Failed to use ZoneInfo for timezone '{zoneinfo_tz}': {e}")
            logger.warning(f"Timezone string details: original='{cleaned_tz}', converted='{zoneinfo_tz}', type={type(cleaned_tz)}, repr={repr(cleaned_tz)}")
            
            # Log available timezones for debugging
            try:
                available = available_timezones()
                if zoneinfo_tz not in available:
                    logger.warning(f"Timezone '{zoneinfo_tz}' is not in available_timezones (count: {len(available)})")
                    # Try to find similar timezones
                    similar = [tz for tz in available if zoneinfo_tz.split('/')[-1].lower() in tz.lower()]
                    if similar:
                        logger.warning(f"Similar available timezones: {similar[:5]}")
            except Exception as tz_list_error:
                logger.warning(f"Could not check available timezones: {tz_list_error}")
            
            # Fall back to UTC if ZoneInfo fails
            logger.warning(f"Falling back to UTC for timezone calculations")
            current_user_time_str = "unknown"
    else:
        logger.warning(f"User timezone is unknown or not provided: {repr(user_timezone)}")
    
    # Format user location for the prompt
    user_location_str = "unknown"
    if user_location and len(user_location) == 2:
        try:
            lat, lng = user_location
            user_location_str = f"Latitude {lat:.6f}, Longitude {lng:.6f}"
            logger.debug("✓ Formatted user location for prompt: {}", user_location_str)
        except Exception as e:
            logger.warning("Failed to format user location: {}", e)
            user_location_str = "unknown"
    else:
        if user_location is None:
            logger.debug("User location not provided to build_system_prompt")
        else:
            logger.debug("User location has invalid format: {}", user_location)
    
    final_tz = (user_timezone or "").strip() or "unknown"
    
    return SYSTEM_PROMPT_TEMPLATE.format(
        current_utc_datetime=now_utc.isoformat(),
        user_timezone=final_tz,
        current_user_time=current_user_time_str,
        default_timezone=agent_settings.calendar_default_timezone,
        user_location=user_location_str,
    )


# def build_general_conversation_system_prompt(
#     current_time: Optional[datetime] = None,
#     user_timezone: Optional[str] = None,
# ) -> str:
#     now = current_time or datetime.now(tz=timezone.utc)
#     return GENERAL_CONVERSATION_PROMPT_TEMPLATE.format(
#         current_utc_datetime=now.isoformat(),
#         user_timezone=(user_timezone or "").strip() or "unknown",
#         default_timezone=agent_settings.calendar_default_timezone,
#     )
