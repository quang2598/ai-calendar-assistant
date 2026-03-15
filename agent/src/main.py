from utility import setup_logging
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from loguru import logger
from config import firestore_db
from agent import agent_settings, run_calendar_agent_turn
from dto import SendChatRequest, SendChatResponse


app = FastAPI()


def _map_runtime_error_to_http(exc: RuntimeError) -> HTTPException:
    error_text = str(exc).strip()
    lowered = error_text.lower()

    if (
        "google token document is missing" in lowered
        or "google refreshtoken is missing" in lowered
    ):
        return HTTPException(
            status_code=401,
            detail={
                "code": "calendar_auth_required",
                "message": "Google Calendar is not connected for this user.",
            },
        )

    if "unable to refresh google access token" in lowered:
        return HTTPException(
            status_code=401,
            detail={
                "code": "calendar_auth_refresh_failed",
                "message": "Unable to refresh Google Calendar access token.",
            },
        )

    if "403" in lowered and "calendar" in lowered:
        return HTTPException(
            status_code=403,
            detail={
                "code": "calendar_access_denied",
                "message": "Google Calendar access is denied for this user.",
            },
        )

    if (
        "invalid datetime" in lowered
        or "invalid timezone" in lowered
        or "window is invalid" in lowered
        or "end_time must be after start_time" in lowered
        or "exceeds configured maximum" in lowered
    ):
        return HTTPException(
            status_code=422,
            detail={
                "code": "invalid_calendar_input",
                "message": error_text,
            },
        )

    if "failed to list calendar events" in lowered or "failed to create calendar event" in lowered:
        return HTTPException(
            status_code=502,
            detail={
                "code": "calendar_provider_error",
                "message": "Calendar provider request failed.",
            },
        )

    return HTTPException(
        status_code=500,
        detail={
            "code": "internal_server_error",
            "message": "Server Error",
        },
    )


@app.post("/agent/send-chat", response_model=SendChatResponse)
async def send_chat(payload: SendChatRequest) -> SendChatResponse:
    logger.info(
        "Received chat request: uid={}, conversation_id={}",
        payload.uid,
        payload.conversationId,
    )
    try:
        return run_calendar_agent_turn(payload=payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "invalid_request",
                "message": str(exc),
            },
        ) from exc
    except RuntimeError as exc:
        raise _map_runtime_error_to_http(exc) from exc


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """
    Custom exception handler for request validation errors.
    """
    logger.error("Validation error: {}", exc)
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "body": exc.body},
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    Custom exception handler for request validation errors.
    """
    logger.error("Runtime Error: {}", exc)
    return JSONResponse(
        status_code=500,
        content={
            "detail": {
                "code": "internal_server_error",
                "message": "Server Error",
            }
        },
    )
