# Local Testing & Running Instructions

Instructions to test and run the AI Calendar Assistant backend locally.

---

## 1. Run Tests (No credentials needed)

```bash
cd backend
npm install
npm test
```

**Expected output:**
```
PASS tests/integration/history.test.js
PASS tests/integration/agent.test.js
PASS tests/integration/health.test.js
PASS tests/unit/historyService.test.js
PASS tests/unit/agentService.test.js

Test Suites: 5 passed, 5 total
Tests:       37 passed, 37 total
Time:        ~1 s
```

### Run linter
```bash
npm run lint
```
Expected: no output (clean)

### Run with coverage report
```bash
npm run test:coverage
```

---

## 2. Start the Backend Server

### Prerequisites
- Node.js 20+
- A Firebase project with Firestore enabled

### Setup

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env`:
```
PORT=3000
FIREBASE_SERVICE_ACCOUNT=<paste your Firebase service account JSON here>
AGENT_SERVER_URL=http://localhost:8000
NODE_ENV=development
```

### Start in dev mode (auto-reload)
```bash
npm run dev
```

**Expected output:**
```
Firebase initialized successfully
Server running on port 3000
```

### Test endpoints in browser or terminal

**Health check:**
```bash
curl http://localhost:3000/api/health
```
Expected response:
```json
{
  "status": "ok",
  "service": "general-request-service",
  "uptime": 5.123,
  "firestore": "connected",
  "agent": "disconnected",
  "timestamp": "2026-02-26T19:00:00.000Z"
}
```
> Note: `agent` will show `"disconnected"` until the Agent Server is running on port 8000.

**Create a conversation:**
```bash
curl -X POST http://localhost:3000/api/history \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "test-session-1", "userId": "user1"}'
```

**List conversations:**
```bash
curl http://localhost:3000/api/history?userId=user1
```

**Append messages to a conversation:**
```bash
curl -X PUT http://localhost:3000/api/history/<CONVERSATION_ID> \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Hello!"}, {"role": "assistant", "content": "Hi there!"}]}'
```

**Get a single conversation:**
```bash
curl http://localhost:3000/api/history/<CONVERSATION_ID>
```

**Delete a conversation:**
```bash
curl -X DELETE http://localhost:3000/api/history/<CONVERSATION_ID>
```

---

## 3. Run Full Stack with Docker

### Prerequisites
- Docker Desktop running
- Firebase credentials
- OpenRouter API key

### Setup

```bash
# From project root
cp .env.example .env
```

Edit `.env`:
```
FIREBASE_SERVICE_ACCOUNT=<Firebase service account JSON>
OPENROUTER_API_KEY=<your OpenRouter API key>
```

### Start all services
```bash
docker compose up --build
```

This starts:
| Service | URL | Description |
|---------|-----|-------------|
| Backend | http://localhost:3000 | General Request Service |
| Agent | http://localhost:8000 | AI Agent Server (Python) |

### Test the full stack

**Health check (should show both connected):**
```bash
curl http://localhost:3000/api/health
```
Expected:
```json
{
  "status": "ok",
  "service": "general-request-service",
  "firestore": "connected",
  "agent": "connected",
  ...
}
```

**Chat with AI agent (end-to-end):**
```bash
curl -X POST http://localhost:3000/api/agent/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is the weather today?"}'
```

**Check agent status:**
```bash
curl http://localhost:3000/api/agent/status
```

### Stop all services
```bash
docker compose down
```

---

## 4. Run Backend Only with Stub Agent (No Python needed)

If you don't have the Agent Server or OpenRouter key, you can run the backend with a stub agent:

```bash
cd backend
docker compose up --build
```

This starts:
| Service | URL | Description |
|---------|-----|-------------|
| Backend | http://localhost:3000 | General Request Service |
| Stub Agent | http://localhost:8000 | Fake agent (echoes messages) |

**Test with stub:**
```bash
curl -X POST http://localhost:3000/api/agent/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "hello"}'
```
Expected:
```json
{
  "reply": "Stub response to: hello"
}
```

---

## 5. URLs Summary

| What | URL | When available |
|------|-----|----------------|
| Health Check | http://localhost:3000/api/health | Backend running |
| Conversation History | http://localhost:3000/api/history | Backend + Firebase |
| Agent Chat | http://localhost:3000/api/agent/chat | Backend + Agent |
| Agent Status | http://localhost:3000/api/agent/status | Backend running |
| Agent Health (direct) | http://localhost:8000/health | Agent running |

---

## Quick Reference

| Command | What it does | Needs credentials? |
|---------|-------------|-------------------|
| `cd backend && npm test` | Run 37 tests | No |
| `cd backend && npm run lint` | Check code style | No |
| `cd backend && npm run dev` | Start backend server | Firebase credentials |
| `cd backend && docker compose up --build` | Backend + stub agent | Firebase credentials |
| `docker compose up --build` (from root) | Full stack | Firebase + OpenRouter |
| `docker compose down` | Stop everything | No |
