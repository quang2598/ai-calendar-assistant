"""
Tool definitions for the LangChain AI Agent
Define custom tools that the agent can use to accomplish tasks
"""
from langchain.tools import tool
from typing import Optional
import json
from datetime import datetime, timedelta
from logger_config import logger


# Example tools - Customize these based on your needs

@tool
def get_current_time(timezone: str = "UTC") -> str:
    """
    Get the current time in a specified timezone
    
    Args:
        timezone: Timezone string (e.g., 'UTC', 'EST', 'PST')
    
    Returns:
        Current time as a formatted string
    """
    try:
        logger.info(f"Tool called: get_current_time for timezone {timezone}")
        now = datetime.now()
        return f"Current time: {now.strftime('%Y-%m-%d %H:%M:%S')} {timezone}"
    except Exception as e:
        logger.error(f"Error in get_current_time: {e}")
        return f"Error: Could not get time for timezone {timezone}"


@tool
def add_reminder(reminder_text: str, days_from_now: int = 0, hours_from_now: int = 0) -> str:
    """
    Add a reminder for the user
    
    Args:
        reminder_text: What to remind about
        days_from_now: Number of days from now
        hours_from_now: Number of hours from now
    
    Returns:
        Confirmation message
    """
    try:
        logger.info(f"Tool called: add_reminder - '{reminder_text}' in {days_from_now} days, {hours_from_now} hours")
        
        when = datetime.now() + timedelta(days=days_from_now, hours=hours_from_now)
        reminder_time = when.strftime('%Y-%m-%d %H:%M:%S')
        
        # In a real app, this would save to a database
        logger.info(f"Reminder scheduled for: {reminder_time}")
        
        return f"Reminder set: '{reminder_text}' scheduled for {reminder_time}"
    except Exception as e:
        logger.error(f"Error in add_reminder: {e}")
        return f"Error: Could not set reminder"


@tool
def search_calendar(date: str, query: Optional[str] = None) -> str:
    """
    Search for events in the user's calendar
    
    Args:
        date: Date to search (YYYY-MM-DD format)
        query: Optional search query for event title
    
    Returns:
        List of matching events
    """
    try:
        logger.info(f"Tool called: search_calendar for {date}")
        
        # In a real app, this would query a calendar service/database
        # For now, return a placeholder response
        return f"Calendar search for {date}: No events found (database not connected)"
    except Exception as e:
        logger.error(f"Error in search_calendar: {e}")
        return f"Error: Could not search calendar"


@tool
def create_event(title: str, date: str, time: str, duration_minutes: int = 60) -> str:
    """
    Create a new calendar event
    
    Args:
        title: Event title
        date: Event date (YYYY-MM-DD format)
        time: Event time (HH:MM format)
        duration_minutes: Duration in minutes
    
    Returns:
        Confirmation message with event details
    """
    try:
        logger.info(f"Tool called: create_event - '{title}' on {date} at {time}")
        
        # In a real app, this would create an event in a calendar service
        end_time_hours = duration_minutes / 60
        
        return f"Event created: '{title}' on {date} at {time} for {duration_minutes} minutes"
    except Exception as e:
        logger.error(f"Error in create_event: {e}")
        return f"Error: Could not create event"


@tool
def get_weather(location: str) -> str:
    """
    Get weather information for a location
    
    Args:
        location: City or location name
    
    Returns:
        Weather information
    """
    try:
        logger.info(f"Tool called: get_weather for {location}")
        
        # In a real app, this would call a weather API
        # For now, return a placeholder
        return f"Weather for {location}: Unable to fetch (API not connected)"
    except Exception as e:
        logger.error(f"Error in get_weather: {e}")
        return f"Error: Could not get weather for {location}"


@tool
def send_email(recipient: str, subject: str, body: str) -> str:
    """
    Send an email
    
    Args:
        recipient: Email address to send to
        subject: Email subject
        body: Email body
    
    Returns:
        Confirmation message
    """
    try:
        logger.info(f"Tool called: send_email to {recipient}")
        
        # In a real app, this would send an actual email
        # For now, just log it
        logger.info(f"Email prepared: To={recipient}, Subject={subject}")
        
        return f"Email sent to {recipient} with subject '{subject}'"
    except Exception as e:
        logger.error(f"Error in send_email: {e}")
        return f"Error: Could not send email"


# Export all tools
def get_all_tools():
    """Return list of all available tools for the agent"""
    return [
        get_current_time,
        add_reminder,
        search_calendar,
        create_event,
        get_weather,
        send_email,
    ]


def get_tools_by_name(tool_names: list) -> list:
    """
    Get specific tools by name
    
    Args:
        tool_names: List of tool names to retrieve
    
    Returns:
        List of tool objects
    """
    all_tools = {
        "get_current_time": get_current_time,
        "add_reminder": add_reminder,
        "search_calendar": search_calendar,
        "create_event": create_event,
        "get_weather": get_weather,
        "send_email": send_email,
    }
    
    return [all_tools[name] for name in tool_names if name in all_tools]
