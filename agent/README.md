# AI Agent Microservice

A professional-grade backend microservice for an AI chat agent with **tool calling capabilities**. Built with LangChain and FastAPI, integrating with OpenRouter LLM API following industry best practices.

## Features

- **LangChain Integration**: Intelligent agent with automatic tool calling
- **Tool Calling**: Agent can invoke tools to accomplish tasks
- **Built-in Tools**: 6 ready-to-use tools (calendar, reminders, email, weather, etc.)
- **FastAPI Framework**: High-performance, async-ready web framework with automatic API documentation
- **OpenRouter Integration**: Seamless integration with OpenRouter LLM API
- **Request Validation**: Pydantic models for automatic request/response validation
- **Error Handling**: Comprehensive error handling with detailed error responses
- **Logging**: Structured logging with file and console output
- **CORS Support**: Pre-configured CORS middleware for frontend integration
- **Health Checks**: Built-in health check endpoint for monitoring
- **API Documentation**: Auto-generated Swagger UI and ReDoc documentation
- **Environment Configuration**: 12-factor app methodology with .env support
- **Async Support**: Full async/await support for non-blocking I/O

## Project Structure

```
agent-server/
├── main.py                 # FastAPI application entry point
├── llm_client.py          # LangChain agent client with tool calling
├── tools.py               # Tool definitions for agent (@tool decorated functions)
├── models.py              # Pydantic request/response models
├── config.py              # Configuration management
├── logger_config.py       # Logging setup
├── requirements.txt       # Python dependencies
├── .env                   # Environment variables (not in git)
├── .env.example           # Example environment variables
├── Dockerfile             # Docker configuration
├── docker-compose.yml     # Docker Compose configuration
├── logs/                  # Log files directory (created at runtime)
└── README.md              # This file
```

## Installation

### Prerequisites

- Python 3.12+

- pip or conda package manager
- OpenRouter API key

### Setup

1. **Clone or navigate to the project directory**

```bash
cd agent-server
```

2. **Create a virtual environment (optional but recommended)**

```bash
# Using venv
python -m venv venv

# Activate virtual environment
# On Windows:
venv\Scripts\activate
# On macOS/Linux:
source venv/bin/activate
```

3. **Install dependencies**

```bash
pip install -r requirements.txt
```

4. **Configure environment variables**

Edit the `.env` file and set your OpenRouter API key:

```env
OPENROUTER_API_KEY=your_actual_api_key_here
```

Other configuration options:
- `MODEL_NAME`: The LLM model to use (default: qwen/qwen3-235b-a22b-2507)
- `MODEL_TEMPERATURE`: Model temperature 0-2 (default: 0.7)
- `MODEL_MAX_TOKENS`: Maximum tokens in response (default: 2048)
- `DEBUG`: Enable debug mode (default: False)
- `PORT`: Server port (default: 8000)

## Running the Service

### Development Mode

```bash
python main.py
```

The service will start on `http://localhost:8000`

### Production Mode

```bash
# Set debug to false in .env first
DEBUG=False

# Run with gunicorn (install: pip install gunicorn)
gunicorn -w 4 -k uvicorn.workers.UvicornWorker main:app
```

## API Endpoints

### Health Check
- **GET** `/health`
- Check if the service is running

**Response:**
```json
{
  "status": "healthy",
  "version": "1.0.0"
}
```

### Chat Endpoint
- **POST** `/api/chat`
- Send a question to the AI agent

**Request:**
```json
{
  "question": "What is machine learning?",
  "conversation_history": null,
  "temperature": 0.7,
  "max_tokens": 2048
}
```

**Response:**
```json
{
  "answer": "Machine learning is a subset of artificial intelligence...",
  "model": "qwen/qwen3-235b-a22b-2507",
  "tokens_used": {
    "prompt_tokens": 45,
    "completion_tokens": 120,
    "total_tokens": 165
  },
  "tool_calls": [
    {
      "tool": "search_calendar",
      "input": "meeting on Friday"
    }
  ]
}
```

### Tools Endpoint
- **GET** `/api/tools`
- Get information about available tools the agent can use

**Response:**
```json
{
  "tools": [
    {
      "name": "get_current_time",
      "description": "Get the current time in a specified timezone. Returns time in HH:MM:SS format."
    },
    {
      "name": "add_reminder",
      "description": "Add a reminder for a specific date and time. Specify days from now and/or hours from now."
    },
    {
      "name": "search_calendar",
      "description": "Search calendar for events on a specific date or matching a query string."
    },
    {
      "name": "create_event",
      "description": "Create a new calendar event with title, date, time, and duration."
    },
    {
      "name": "get_weather",
      "description": "Get weather information for a specified location."
    },
    {
      "name": "send_email",
      "description": "Send an email with recipient, subject, and body content."
    }
  ],
  "count": 6
}
```

### Configuration (Debug Mode Only)
- **GET** `/api/config`
- Get current service configuration

## API Documentation

Access the interactive API documentation:
- **Swagger UI**: `http://localhost:8000/api/docs`
- **ReDoc**: `http://localhost:8000/api/redoc`

## Frontend Integration

### Next.js Example

```typescript
// hooks/useChat.ts
async function sendQuestion(question: string) {
  const response = await fetch('http://localhost:8000/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      question: question,
      temperature: 0.7,
      max_tokens: 2048
    })
  });
  
  if (!response.ok) {
    throw new Error('Failed to get response from AI agent');
  }
  
  return response.json();
}
```

## Error Handling

The API returns standardized error responses:

```json
{
  "error": "Error Type",
  "status_code": 400,
  "details": "Specific error message"
}
```

Common status codes:
- `200`: Success
- `400`: Bad request (invalid input)
- `500`: Internal server error
- `503`: Service unavailable (LLM API down)

## Logging

Logs are stored in `logs/ai_agent.log` with rotation every 10MB.

To view logs in real-time:
```bash
tail -f logs/ai_agent.log
```

## Development Guidelines

### Adding New Endpoints

1. Create request/response models in `models.py`
2. Add endpoint in `main.py`
3. Use async functions for better performance
4. Add proper error handling and logging
5. Update this README with new endpoint documentation

### Environment Variables

When adding new configuration options:
1. Add to `config.py` in the `Settings` class
2. Document in this README
3. Add to `.env` with sensible defaults

## Security Considerations

- ✅ API key is loaded from environment variables, not hardcoded
- ✅ CORS is configured to allow only specified origins
- ✅ Input validation with Pydantic
- ✅ Configuration endpoint disabled in production
- ✅ Error messages don't expose sensitive information
- ✅ Timeout protection against hanging requests

## Performance Tips

1. Use conversation_history for better context (without making requests too long)
2. Adjust MODEL_TEMPERATURE based on use case (0.7 is balanced)
3. Set MAX_QUESTION_LENGTH to prevent excessively long requests
4. Use multiple workers in production with gunicorn

## Troubleshooting

### Issue: OPENROUTER_API_KEY not found
**Solution**: Make sure the `.env` file exists in the same directory as `main.py` and contains `OPENROUTER_API_KEY=your_key`

### Issue: CORS errors from frontend
**Solution**: Add your frontend URL to `ALLOWED_ORIGINS` in `config.py`

### Issue: Timeout errors
**Solution**: Increase `REQUEST_TIMEOUT` in `.env` or reduce `MODEL_MAX_TOKENS`

## Future Enhancements

- [ ] Database integration for conversation persistence
- [ ] Rate limiting middleware
- [ ] Request caching
- [ ] Multiple model support with automatic fallback
- [ ] User authentication and authorization
- [ ] Monitoring and metrics collection
- [ ] WebSocket support for real-time streaming responses

## License

[Add your license here]

## Support

For issues or questions, please open an issue in the repository.
