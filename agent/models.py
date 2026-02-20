"""
Pydantic models for request/response validation
"""
from pydantic import BaseModel, Field, field_validator
from typing import Optional
from enum import Enum


class MessageRole(str, Enum):
    """Valid message roles"""
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class ChatMessage(BaseModel):
    """Represents a single message in the conversation"""
    role: MessageRole = Field(..., description="Role of the message sender")
    content: str = Field(..., description="Content of the message")
    
    class Config:
        json_schema_extra = {
            "example": {
                "role": "user",
                "content": "What is the weather today?"
            }
        }


class ChatRequest(BaseModel):
    """Request model for the chat endpoint"""
    question: str = Field(
        ...,
        min_length=1,
        max_length=5000,
        description="The user's question"
    )
    conversation_history: Optional[list[ChatMessage]] = Field(
        default=None,
        description="Optional conversation history for context"
    )
    model: Optional[str] = Field(
        default=None,
        description="Optional model override (if not provided, uses default)"
    )
    temperature: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=2.0,
        description="Model temperature (0.0 to 2.0)"
    )
    max_tokens: Optional[int] = Field(
        default=None,
        ge=1,
        le=8000,
        description="Maximum tokens in response"
    )
    
    @field_validator('question')
    def question_not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError('Question cannot be empty or whitespace only')
        return v.strip()
    
    class Config:
        json_schema_extra = {
            "example": {
                "question": "How can I improve my productivity?",
                "conversation_history": None,
                "temperature": 0.7,
                "max_tokens": 2048
            }
        }


class ChatResponse(BaseModel):
    """Response model for successful chat requests"""
    answer: str = Field(..., description="The AI's response to the question")
    model: str = Field(..., description="The model used for this response")
    tokens_used: dict = Field(
        ...,
        description="Token usage statistics"
    )
    tool_calls: Optional[list] = Field(
        default=None,
        description="List of tool calls made by the agent (if any)"
    )
    
    class Config:
        json_schema_extra = {
            "example": {
                "answer": "To improve productivity, you can...",
                "model": "qwen/qwen3-235b-a22b-2507",
                "tokens_used": {
                    "prompt_tokens": 45,
                    "completion_tokens": 120,
                    "total_tokens": 165
                },
                "tool_calls": [
                    {
                        "tool": "create_event",
                        "input": "Meeting on 2024-01-15 at 10:00"
                    }
                ]
            }
        }


class ErrorResponse(BaseModel):
    """Error response model"""
    error: str = Field(..., description="Error message")
    status_code: int = Field(..., description="HTTP status code")
    details: Optional[str] = Field(
        default=None,
        description="Additional error details"
    )
    
    class Config:
        json_schema_extra = {
            "example": {
                "error": "Invalid request",
                "status_code": 400,
                "details": "Question cannot be empty"
            }
        }


class HealthCheckResponse(BaseModel):
    """Health check response"""
    status: str = Field(..., description="Service status")
    version: str = Field(..., description="Service version")
    
    class Config:
        json_schema_extra = {
            "example": {
                "status": "healthy",
                "version": "1.0.0"
            }
        }
