# Epic 4: Back-End Development — Sprint Report

**Date:** February 26, 2026
**Sprint:** 3
**Branch:** `SCRUM-31-epic4-backend-service`
**PR:** Pending review (2 approvals required)

---

## Architecture Overview

```
┌─────────────┐       ┌──────────────────────┐       ┌─────────────────────┐
│   Frontend   │──────▶│   General Request    │──────▶│   Agent Server      │
│  (Next.js)   │ HTTP  │   Service (Node.js)  │ HTTP  │   (Python/FastAPI)  │
│  Port: 3001  │       │   Port: 3000         │       │   Port: 8000        │
└─────────────┘       └──────────┬───────────┘       └─────────────────────┘
                                 │                            │
                                 ▼                            ▼
                      ┌──────────────────┐          ┌─────────────────┐
                      │ Firebase Firestore│          │   OpenRouter    │
                      │ (Conversation DB) │          │   (LLM API)    │
                      └──────────────────┘          └─────────────────┘
```

### Docker Compose Orchestration

```
docker-compose.yml (root)
├── backend     (build: ./backend, port 3000)
│   ├── depends_on: agent (healthy)
│   ├── env: FIREBASE_SERVICE_ACCOUNT, AGENT_SERVER_URL
│   └── network: app-network
├── agent       (build: ./agent, port 8000)
│   ├── healthcheck: GET /health
│   ├── env: OPENROUTER_API_KEY, MODEL_NAME
│   └── network: app-network
└── networks: app-network (bridge)
```

---

## Story 4.1 — General Request Handler Service (SCRUM-29)

**Status:** Complete | **Points:** 3

### What was built

| Component | Description |
|-----------|-------------|
| Express App | `app.js` / `server.js` separation for testability |
| Firebase Firestore | Replaced MongoDB/Mongoose with Firebase Admin SDK |
| Conversation History | Full CRUD data access layer with atomic message appends |
| Agent Proxy | Gateway to Agent Server via axios with timeout handling |
| Health Endpoint | Reports service status + Firestore connectivity |
| Vercel Config | `api/index.js` + `vercel.json` for serverless deployment |
| Dockerfile | Multi-stage build, non-root user, health check |
| Test Suite | 37 tests (unit + integration) with in-memory Firestore mock |

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Service status, Firestore + Agent connectivity |
| POST | `/api/history` | Create conversation |
| GET | `/api/history?userId=X` | List conversations (paginated) |
| GET | `/api/history/:id` | Get single conversation |
| PUT | `/api/history/:id` | Append messages |
| DELETE | `/api/history/:id` | Delete conversation |
| POST | `/api/agent/chat` | Forward chat to Agent Server |
| GET | `/api/agent/status` | Check Agent Server health |

### Project Structure

```
backend/
├── src/
│   ├── app.js                        # Express setup
│   ├── server.js                     # Entry point
│   ├── config/
│   │   ├── index.js                  # Env config
│   │   └── firebase.js               # Firebase init
│   ├── models/ConversationHistory.js  # Firestore data layer
│   ├── controllers/                   # Request handlers
│   ├── services/                      # Business logic
│   ├── routes/                        # Express routers
│   ├── middleware/                     # Error handler, logger
│   └── utils/ApiError.js             # Custom error class
├── tests/
│   ├── __mocks__/firestore.js         # In-memory Firestore mock
│   ├── unit/                          # Service tests
│   └── integration/                   # HTTP tests (supertest)
├── api/index.js                       # Vercel entry point
├── vercel.json                        # Vercel config
└── Dockerfile                         # Production image
```

---

## Story 4.2 — Microarchitecture Reliability (SCRUM-31)

**Status:** Complete | **Points:** 2

### What was built

| Component | Description |
|-----------|-------------|
| Root `docker-compose.yml` | Orchestrates backend + agent with shared network |
| Health Check Enhancement | Agent connectivity check (`connected`/`disconnected`) |
| Port Alignment | Unified all configs from port 4000 → 8000 |
| E2E Test Script | `tests/e2e/docker-compose.test.sh` — smoke test for inter-service communication |
| Root `.env.example` | Documents all required environment variables |

### Health Endpoint Response (Enhanced)

```json
{
  "status": "ok",
  "service": "general-request-service",
  "uptime": 123.456,
  "firestore": "connected",
  "agent": "connected",
  "timestamp": "2026-02-26T19:00:00.000Z"
}
```

### Inter-Service Communication Flow

```
Client Request
     │
     ▼
[POST /api/agent/chat]
     │
     ▼
Backend (port 3000)
  ├── Validates request (message required)
  ├── Forwards to Agent Server via axios
  │        │
  │        ▼
  │   Agent Server (port 8000)
  │     ├── Processes with LangChain + OpenRouter
  │     └── Returns AI response
  │        │
  │        ▼
  ├── Returns response to client
  └── (Optional) Saves to Firestore conversation history
```

---

## Verification Summary

| Check | Result |
|-------|--------|
| Unit + Integration Tests (37) | PASS |
| ESLint | PASS |
| Root docker-compose.yml syntax | PASS |
| Backend docker-compose.yml syntax | PASS |
| E2E test script syntax | PASS |
| Docker build + full stack test | Pending (needs credentials) |

---

## Remaining / Next Steps

1. **Firebase Setup** — Team needs shared Firebase project credentials
2. **Docker Full Stack Test** — `docker compose up --build` with real credentials
3. **PR Review** — Awaiting 2 team approvals on `SCRUM-31-epic4-backend-service`
4. **Next Epic** — Frontend integration with backend API endpoints
