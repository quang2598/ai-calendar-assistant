import os
from utility import setup_logging
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger
from config import firestore_db
from config.agent_config import agent_settings
from agent.service import run_calendar_agent_turn
from service import FirebaseAuthMiddleware
from agent.tools.calendar_tools import _rollback_event_impl
from dto import SendChatRequest, SendChatResponse

app = FastAPI()

# Configure CORS policy
allowed_origins = []

# Add vercel app URL if configured
vercel_app_url = os.getenv("VERCEL_APP_URL", "").strip()
if vercel_app_url:
    allowed_origins.append(vercel_app_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add Firebase authentication middleware
app.add_middleware(FirebaseAuthMiddleware)

# Log startup info for debugging
logger.info("Agent API starting up...")
vercel_url = os.getenv("VERCEL_APP_URL", "").strip()
logger.info("CORS allowed origins: {}", allowed_origins)
logger.info("Firebase Admin authentication enabled")


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
async def send_chat(request: Request, payload: SendChatRequest) -> SendChatResponse:
    # Extract Firebase ID token and verified claims from Firebase auth middleware
    firebase_id_token = getattr(request.state, "firebase_id_token", None)
    decoded_token = getattr(request.state, "decoded_token", None)
    
    if not firebase_id_token or not decoded_token:
        raise HTTPException(
            status_code=401,
            detail={
                "code": "unauthorized",
                "message": "Firebase authentication failed",
            },
        )
    
    uid = decoded_token.get("uid")
    logger.info(
        "Received chat request: conversation_id={}",
        payload.conversationId,
    )
    try:
        return run_calendar_agent_turn(payload=payload, uid=uid)
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


@app.post("/agent/rollback")
async def rollback_event(request: Request) -> dict:
    """Rollback (undo) a calendar event modification.
    
    This endpoint is called from the Next.js backend and doesn't require JWT auth
    since it's a trusted backend-to-backend call.
    """
    try:
        body = await request.json()
        uid = body.get("uid")
        event_id = body.get("event_id")
        calendar_id = body.get("calendar_id")
        
        if not uid or not event_id:
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "missing_params",
                    "message": "uid and event_id are required",
                },
            )
        
        logger.info("Rollback request: event_id={}", event_id)
        
        # Call the internal rollback implementation
        result = _rollback_event_impl(uid=uid, event_id=event_id, calendar_id=calendar_id)
        
        # Parse the JSON response from the tool
        import json
        try:
            result_dict = json.loads(result)
            
            # Check if the rollback was successful
            if result_dict.get("status") != "success":
                raise HTTPException(
                    status_code=400,
                    detail={
                        "code": "rollback_failed",
                        "message": result_dict.get("message", "Failed to rollback event"),
                    },
                )
            
            return result_dict
        except json.JSONDecodeError:
            raise HTTPException(
                status_code=500,
                detail={
                    "code": "internal_error",
                    "message": "Invalid response from rollback operation",
                },
            )
    except HTTPException:
        raise
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
    except Exception as exc:
        logger.error("Rollback error: {}", exc)
        raise HTTPException(
            status_code=500,
            detail={
                "code": "internal_server_error",
                "message": str(exc),
            },
        ) from exc


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
