from functools import wraps
from loguru import logger
from time import perf_counter
import inspect
from typing import Callable, Optional
from datetime import datetime
import re



def trace_span(span_name: str):
    def decorator(func):
        if inspect.iscoroutinefunction(func):

            @wraps(func)
            async def async_wrapper(*args, **kwargs):
                start = perf_counter()
                logger.info(f"Entering span: {span_name}", extra={"span": span_name})

                try:
                    return await func(*args, **kwargs)
                except Exception as exc:
                    logger.error(f"Error in span {span_name}: {exc}", extra={"span": span_name, "error": str(exc)})
                    raise
                finally:
                    duration = perf_counter() - start
                    logger.info(
                        f"Exiting span {span_name}, took {duration * 1000} ms",
                        extra={"span": span_name, "duration_ms": duration * 1000},
                    )

            return async_wrapper

        @wraps(func)
        def wrapper(*args, **kwargs):
            start = perf_counter()
            logger.info(f"Entering span: {span_name}", extra={"span": span_name})

            try:
                return func(*args, **kwargs)
            except Exception as exc:
                logger.error(f"Error in span {span_name}: {exc}", extra={"span": span_name, "error": str(exc)})
                raise
            finally:
                duration = perf_counter() - start
                logger.info(
                    f"Exiting span {span_name}, took {duration * 1000} ms",
                    extra={"span": span_name, "duration_ms": duration * 1000},
                )

        return wrapper
    return decorator


def track_action(action_type: str):
    """
    Decorator to track calendar actions (create/update/delete) in Firestore.
    
    Args:
        action_type: Type of action ("add", "update", or "delete")
        
    The decorated function should:
    - Accept uid, event_id, and event_title as parameters (or in kwargs)
    - Return a result that can be inspected for success/failure
    
    Usage:
        @track_action("add")
        def _add_event_to_calendar_impl(uid, ...):
            ...
    """
    def decorator(func: Callable) -> Callable:
        if inspect.iscoroutinefunction(func):
            @wraps(func)
            async def async_wrapper(*args, **kwargs):
                result = await func(*args, **kwargs)
                _record_action_history(action_type, func, args, kwargs, result)
                return result
            return async_wrapper
        
        @wraps(func)
        def wrapper(*args, **kwargs):
            result = func(*args, **kwargs)
            _record_action_history(action_type, func, args, kwargs, result)
            return result
        
        return wrapper
    return decorator


def _record_action_history(
    action_type: str, 
    func: Callable, 
    args: tuple, 
    kwargs: dict, 
    result: object
) -> None:
    """
    Helper to record action history after a tool completes.
    Extracts uid, event_id, and event_title from function parameters.
    Generates detailed descriptions of what changed for update operations.
    """
    try:
        # Extract uid from parameters
        uid = kwargs.get("uid")
        if not uid and len(args) > 0:
            # Try to get from function signature
            sig = inspect.signature(func)
            param_names = list(sig.parameters.keys())
            if "uid" in param_names:
                uid_index = param_names.index("uid")
                if uid_index < len(args):
                    uid = args[uid_index]
        
        if not uid:
            logger.warning("Could not extract uid for action tracking in {}", func.__name__)
            return
        
        # Extract event_id, event_title, and other details from result (expect JSON string with success status)
        event_id = None
        event_title = None
        description = None
        
        if isinstance(result, str):
            try:
                import json
                result_obj = json.loads(result)
                if result_obj.get("status") == "success":
                    event_data = result_obj.get("event", {})
                    event_id = event_data.get("id")
                    event_title = event_data.get("title")
                    
                    # Generate detailed description based on action type
                    if action_type == "add":
                        description = _build_add_description(event_title, event_data)
                    elif action_type == "update":
                        description = _build_update_description(event_title, result_obj)
                    elif action_type == "delete":
                        description = _build_delete_description(event_title)
            except (json.JSONDecodeError, AttributeError, TypeError):
                pass
        
        # If we couldn't get event info from result, skip tracking
        if not event_id or not event_title:
            logger.debug(
                "Could not extract event_id or event_title for action tracking from {}. "
                "Action tracking skipped.",
                func.__name__
            )
            return
        
        # Import here to avoid circular imports
        from utility.firestore_utility import store_action_history
        
        # Record the action
        store_action_history(
            uid=uid,
            action_type=action_type,
            event_id=event_id,
            event_title=event_title,
            already_rolled_back=False,
            description=description,
        )
        
    except Exception as exc:
        # Log but don't fail - action tracking is secondary
        logger.warning("Failed to record action history: {}", exc)


def _format_datetime(datetime_str: str) -> Optional[str]:
    """
    Format a datetime string into a natural format like 'Mar 16 7pm UTC-7'.
    Handles ISO format strings like '2026-04-01T19:00:00' or with timezone info.
    """
    try:
        # Try to parse ISO format
        if datetime_str.endswith('Z'):
            dt = datetime.fromisoformat(datetime_str.replace('Z', '+00:00'))
        else:
            dt = datetime.fromisoformat(datetime_str)
        
        # Extract timezone info if present
        tz_str = ""
        if dt.tzinfo:
            tz_offset = dt.strftime('%z')
            if tz_offset:
                # Format as UTC-7 or UTC+5, etc.
                hours = int(tz_offset[:3])
                tz_str = f" UTC{hours:+d}" if hours != 0 else " UTC"
        
        # Format as "Mar 16 7pm"
        month_day = dt.strftime('%b %-d').lstrip('0') if hasattr(dt, 'day') else dt.strftime('%b %d').lstrip('0')
        hour = dt.hour % 12 or 12
        am_pm = "am" if dt.hour < 12 else "pm"
        
        return f"{month_day} {hour}{am_pm}{tz_str}"
    except (ValueError, AttributeError):
        return None


def _build_add_description(event_title: str, event_data: dict) -> str:
    """Build a concise description for an add (create) action with essential info only."""
    parts = []
    
    # Always include title
    if event_title:
        parts.append(f"'{event_title}'")
    
    # Include start time only (formatted naturally)
    start = event_data.get("start") or event_data.get("start_time") or event_data.get("startTime")
    if start:
        formatted_time = _format_datetime(start)
        if formatted_time:
            parts.append(f"at {formatted_time}")
    
    if parts:
        return f"Created event {' '.join(parts)}"
    return f"Created event '{event_title}'"


def _build_update_description(event_title: str, result_obj: dict) -> str:
    """Build a description for an update action showing only what changed."""
    changes = result_obj.get("changes", {})
    
    if not changes:
        return f"Updated event '{event_title}'"
    
    change_details = []
    
    # Map field names to human-readable labels
    field_labels = {
        "title": "title",
        "start": "start time",
        "start_time": "start time",
        "startTime": "start time",
        "end": "end time",
        "end_time": "end time",
        "endTime": "end time",
        "location": "location",
        "description": "description",
        "attendees": "attendees",
    }
    
    for field, (old_val, new_val) in changes.items():
        label = field_labels.get(field, field)
        
        # Format time values naturally if they look like timestamps
        if label in ["start time", "end time"]:
            formatted_old = _format_datetime(old_val) if old_val else "empty"
            formatted_new = _format_datetime(new_val) if new_val else "empty"
            change_details.append(f"{label}: {formatted_old} → {formatted_new}")
        else:
            # Format other values simply
            old_str = f"'{old_val}'" if old_val else "empty"
            new_str = f"'{new_val}'" if new_val else "empty"
            change_details.append(f"{label}: {old_str} → {new_str}")
    
    if change_details:
        return f"Updated {', '.join(change_details)}"
    return f"Updated event '{event_title}'"


def _build_delete_description(event_title: str) -> str:
    """Build a detailed description for a delete action."""
    return f"Deleted event '{event_title}'"
