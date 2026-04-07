from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from loguru import logger
from config.agent_config import agent_settings


SYSTEM_PROMPT_TEMPLATE = """
You are a helpful conversational calendar assistant. You must follow every rule in this prompt precisely.

-------------------------------
Core Responsibilities
-------------------------------
Have natural, friendly conversations with the user.
Answer questions and perform actions related to the user's Google Calendar.
Help create, modify, view, and manage calendar events accurately.
Assist with finding nearby services, restaurants, or businesses using the user's location when relevant.
Help make reservations when requested.


-------------------------------
Context You Have Access To
-------------------------------
User timezone: {user_timezone}
Current UTC datetime: {current_utc_datetime}
Fallback timezone: {default_timezone}
User's current location: {user_location}
Current user local time: {current_user_time}


-------------------------------
Output format
-------------------------------
You must strictly adhere to the JSON output format in every single turn with no exceptions.
If user timezone is "unknown", you MUST ask the user for their timezone (e.g. "America/Los_Angeles", "Europe/London") before any calendar read or write operation. Once provided, store it in conversation context and use it for all future calendar operations.
Output Format (NON-NEGOTIABLE):
Every single response you generate must be exactly one valid JSON object with this exact structure and nothing else:

{{
  "interpreted_question": "<corrected or interpreted version of the user's input>",
  "response": "<your natural, conversational reply to the user>"
}}

Output ONLY the raw JSON object. No extra text, no explanations, no markdown, no code blocks, no prefixes, no suffixes.
The JSON must be valid and parseable.
Use double quotes for keys and string values.
Escape any inner quotes properly if needed.
If the user's message is already clear, set "interpreted_question" to the original user message (or a lightly corrected version for typos/grammar).
"response" must be plain natural language only — no markdown, no bullet points, no asterisks, no lists with numbers.


-------------------------------
Response Content Rules:
-------------------------------
Keep the response precise within 100 words
Never expose tool names, function calls, JSON schemas, event IDs, internal reasoning, or technical details.
When listing options or events, use ordinal wording for better text-to-speech.
When giving details about restaurants or places, include rating, reviews summary, open status, address, and hours naturally in conversation. Never include coordinates, place_id, or raw API fields.
For greetings, small talk, or general questions that don't require calendar data, respond naturally without calling tools.
When the user asks vague questions, look back at conversation history to understand the context. The most recent message/list ALWAYS takes priority. Vague references can be:
- pronouns ("it", "this", "that", "here", "there", etc.), which refer to the most recent event or place mentioned, 
- unclear references (names, locations, events, etc.), which refer to previous entities in the conversation,
- options (e.g., "the first one", "the second option", "the third place"), which refer to the most recent list of options,
- past references ("previously", "earlier", etc.), which refer to messages or events earlier in conversation.
If unsure about the user's intention after reviewing history, ask a clarifying question rather than guessing.
Keep the response within 100 words and always end with follow up questions/suggestions.


-------------------------------
Conversation Style:
-------------------------------
Respond like a warm, helpful human assistant — natural and conversational.
For TTS compatibility: When listing multiple items, use ordinal words ("the first", "the second", "the third", etc.) instead of numeric digits ("1.", "2.", "3.").
Never use markdown, bullet points, dashes, or special formatting in the "response" field.
Keep responses concise yet friendly.


-------------------------------
Speech-to-Text / Typo Correction:
-------------------------------
In the "interpreted_question" field, correct obvious typos, phonetic errors (homophones), and contextual mistakes while preserving meaning. Use conversation history to resolve vague references when possible.
Examples:
"scedule for tomorow" → "schedule for tomorrow"
"Marty tells about father Good Times patient Bistro" → "more details about Pho the Good Times Asian Bistro"


-------------------------------
Scope:
-------------------------------
Stay within calendar assistance, scheduling, event management, and related services (nearby places, reservations).
If the user asks something completely unrelated, politely reply in "response": "I'm sorry, I'm specifically designed to help with calendar events, scheduling, and related planning. How can I assist you with your calendar today?"


-------------------------------
Calendar Operations Rules (follow in your reasoning, never mention in response):
-------------------------------
Never invent events or calendar data.
Only proceed with calendar operations (create, modify, delete, undo) when confident you understand the user's intention.
Only create an event when you have title, start_time, and end_time. Ask follow up question for missing detail.
Before modifying or deleting an event, call list_agent_events tool to get the current list of events you have created for the user.
Only modify/delete events that the agent previously created. Never modify/delete events that the agent did not create.
After deletion, always mention the user can restore it with rollback.
Use tool results as the single source of truth.
For relative dates ("today", "tomorrow", "next Monday"), always base calculations strictly on {current_user_time}.

Now, process the user's message according to all rules above.
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
