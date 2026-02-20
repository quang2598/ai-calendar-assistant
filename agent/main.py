"""
FastAPI Application for AI Agent Microservice
Main entry point for the backend service with LangChain agent
"""
import os
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.openapi.utils import get_openapi

from config import settings
from logger_config import logger
from models import ChatRequest, ChatResponse, ErrorResponse, HealthCheckResponse
from llm_client import get_agent, initialize_agent

# Create logs directory if it doesn't exist
os.makedirs('logs', exist_ok=True)

# Validate configuration on startup
try:
    settings.validate()
    # Initialize the LangChain agent
    initialize_agent()
    logger.info("LangChain agent initialized successfully")
except ValueError as e:
    logger.critical(f"Configuration error: {e}")
    raise
except Exception as e:
    logger.critical(f"Failed to initialize agent: {e}")
    raise

# Initialize FastAPI application
app = FastAPI(
    title="AI Agent Microservice",
    description="Backend service for AI-powered chat agent with LLM integration",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# Add CORS middleware for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Length", "X-Process-Time"],
)


# Custom OpenAPI schema
def custom_openapi():
    """Customize OpenAPI schema"""
    if app.openapi_schema:
        return app.openapi_schema
    
    openapi_schema = get_openapi(
        title="AI Agent Microservice",
        version="1.0.0",
        description="API endpoints for AI agent chat functionality",
        routes=app.routes,
    )
    
    openapi_schema["info"]["x-logo"] = {
        "url": "https://fastapi.tiangolo.com/img/logo-margin/logo-teal.png"
    }
    
    app.openapi_schema = openapi_schema
    return app.openapi_schema


app.openapi = custom_openapi


# Middleware for logging requests
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all incoming requests"""
    logger.debug(f"Incoming request: {request.method} {request.url.path}")
    response = await call_next(request)
    logger.debug(f"Response status: {response.status_code}")
    return response


# Health check endpoint
@app.get(
    "/health",
    response_model=HealthCheckResponse,
    tags=["Health"],
    summary="Health Check",
    description="Check if the service is running and healthy"
)
async def health_check():
    """
    Health check endpoint for monitoring
    Returns the service status and version
    """
    logger.debug("Health check requested")
    return HealthCheckResponse(
        status="healthy",
        version="1.0.0"
    )


# Configuration endpoint
@app.get(
    "/api/config",
    tags=["Configuration"],
    summary="Get Service Configuration",
    description="Get current service configuration (for debugging)"
)
async def get_config():
    """
    Returns current service configuration
    Note: Only available in debug mode for security reasons
    """
    if not settings.DEBUG:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Configuration endpoint only available in debug mode"
        )
    
    logger.info("Configuration requested")
    return settings.to_dict()


# Tools endpoint
@app.get(
    "/api/tools",
    tags=["Tools"],
    summary="Get Available Tools",
    description="Get information about tools the agent can use"
)
async def get_tools():
    """
    Returns information about available tools
    """
    try:
        logger.info("Tools information requested")
        agent = get_agent()
        tools_info = agent.get_tools_info()
        
        return {
            "tools": tools_info,
            "count": len(tools_info),
        }
    except Exception as e:
        logger.error(f"Error getting tools info: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not retrieve tools information"
        )


# Main chat endpoint
@app.post(
    "/api/chat",
    response_model=ChatResponse,
    status_code=status.HTTP_200_OK,
    tags=["Chat"],
    summary="Send Message to AI Agent",
    description="Send a question to the AI agent and receive a response"
)
async def chat(request: ChatRequest):
    """
    Chat with the AI agent
    
    This endpoint accepts a question and returns an AI-generated response.
    It supports conversation history for context-aware responses.
    The agent has access to tools and can use them to accomplish tasks.
    
    Args:
        request: ChatRequest object with question and optional parameters
    
    Returns:
        ChatResponse with the AI's answer, token usage, and any tool calls made
    
    Raises:
        HTTPException: If there's an error processing the request
    """
    try:
        logger.info(f"Chat request received. Question length: {len(request.question)}")
        
        # Get the agent
        agent = get_agent()
        
        # Call the agent
        result = await agent.chat(
            question=request.question,
            conversation_history=request.conversation_history,
            model=request.model,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
        )
        
        logger.info("Chat request processed successfully")
        
        return ChatResponse(
            answer=result["answer"],
            model=result["model"],
            tokens_used=result["tokens_used"],
            tool_calls=result.get("tool_calls"),
        )
    
    except Exception as e:
        error_msg = f"Agent error: {str(e)}"
        logger.error(error_msg)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to process request. Please try again later."
        )


# Exception handler for validation errors
@app.exception_handler(ValueError)
async def value_error_exception_handler(request: Request, exc: ValueError):
    """Handle validation errors"""
    logger.error(f"Validation error: {str(exc)}")
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content=ErrorResponse(
            error="Validation Error",
            status_code=400,
            details=str(exc)
        ).dict()
    )


# Exception handler for HTTP exceptions
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Handle HTTP exceptions"""
    logger.warning(f"HTTP error: {exc.status_code} - {exc.detail}")
    return JSONResponse(
        status_code=exc.status_code,
        content=ErrorResponse(
            error="HTTP Error",
            status_code=exc.status_code,
            details=exc.detail
        ).dict()
    )


# Root endpoint
@app.get(
    "/",
    tags=["Info"],
    summary="API Information",
    description="Get information about the API"
)
async def root():
    """Root endpoint with API information"""
    return {
        "name": "AI Agent Microservice",
        "version": "1.0.0",
        "status": "running",
        "docs": "/api/docs",
        "health": "/health"
    }


if __name__ == "__main__":
    import uvicorn
    
    logger.info(f"Starting AI Agent Microservice on {settings.HOST}:{settings.PORT}")
    logger.info(f"Debug mode: {settings.DEBUG}")
    
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level=settings.LOG_LEVEL.lower()
    )
