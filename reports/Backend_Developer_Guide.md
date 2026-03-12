# Backend Developer Guide

A guide for understanding and working with the General Request Service.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Architecture Overview](#architecture-overview)
3. [How the Code Connects](#how-the-code-connects)
4. [Key Files Explained](#key-files-explained)
5. [API Endpoints](#api-endpoints)
6. [Running Tests](#running-tests)
7. [Docker Development](#docker-development)
8. [Vercel Deployment](#vercel-deployment)

---

## Quick Start

```bash
# 1. Install dependencies
cd backend
npm install

# 2. Run tests (no credentials needed — uses in-memory mocks)
npm test

# 3. Run linter
npm run lint

# 4. Start dev server (needs Firebase credentials in .env)
cp .env.example .env
# Edit .env with real values
npm run dev
```

---

## Architecture Overview

```
Request Flow:

  Client
    │
    ▼
  Express App (app.js)
    │
    ├── Middleware: CORS → JSON Parser → Request Logger
    │
    ├── Routes (routes/index.js)
    │     │
    │     ├── GET  /api/health    → healthController  → checks Firestore + Agent
    │     ├── CRUD /api/history/* → historyController  → historyService → Firestore
    │     └── POST /api/agent/*   → agentController    → agentService   → Agent Server
    │
    ├── 404 Handler (unmatched routes)
    └── Error Handler (catches all errors → JSON response)
```

### Layer Pattern

```
Routes  →  Controllers  →  Services  →  Models/External
(HTTP)     (validation)    (logic)      (data access)
```

- **Routes** — Define URL paths, map to controller functions
- **Controllers** — Validate request input, call services, send responses
- **Services** — Business logic, error handling (throws ApiError)
- **Models** — Direct Firestore operations (ConversationHistory.js)

---

## How the Code Connects

### App Startup (`server.js`)

```
server.js
  ├── initializeFirebase()      ← connects to Firestore
  └── app.listen(PORT)          ← starts Express on port 3000
```

`server.js` initializes Firebase, then starts the Express app. The app itself is defined in `app.js` (separated so tests can import it without starting a server).

### Request Lifecycle

```
1. Request arrives at Express
2. CORS middleware checks origin
3. Body parser extracts JSON
4. Morgan logs the request
5. Router matches URL to controller
6. Controller validates input → calls service
7. Service performs logic → calls model
8. Model interacts with Firestore
9. Response travels back up the chain
10. If any error: caught by error handler middleware
```

### Agent Proxy (`/api/agent/chat`)

```
Client → Backend (port 3000) → Agent Server (port 8000)
                axios POST /api/chat
                timeout: 30s
```

The backend doesn't process AI requests itself. It validates the input, then forwards to the Python Agent Server via HTTP and returns the response.

### Firebase Data Flow

```
Controller → historyService → ConversationHistory → Firestore
                                    │
                                    ├── create()        → collection.add()
                                    ├── findByUserId()  → where().orderBy().offset().limit()
                                    ├── findById()      → doc().get()
                                    ├── appendMessages() → FieldValue.arrayUnion() (atomic)
                                    └── deleteById()    → doc().delete()
```

---

## Key Files Explained

### Core Application

| File | Purpose |
|------|---------|
| `src/server.js` | Entry point. Initializes Firebase, starts Express server |
| `src/app.js` | Express app config. Middleware chain, route mounting. No `.listen()` (for testability) |
| `src/config/index.js` | Environment config: `port`, `agentServerUrl`, `nodeEnv` |
| `src/config/firebase.js` | Firebase Admin SDK init. Singleton pattern. Parses `FIREBASE_SERVICE_ACCOUNT` env var (JSON string) |

### Data Layer

| File | Purpose |
|------|---------|
| `src/models/ConversationHistory.js` | Firestore data access. Collection: `conversations`. CRUD functions + atomic message append via `FieldValue.arrayUnion()` |
| `src/services/historyService.js` | Business logic wrapper. Adds pagination metadata, 404 handling |
| `src/services/agentService.js` | HTTP client to Agent Server. Uses axios with 30s timeout |

### HTTP Layer

| File | Purpose |
|------|---------|
| `src/controllers/healthController.js` | Health check. Tests Firestore + Agent Server connectivity |
| `src/controllers/historyController.js` | Conversation CRUD. Validates input, delegates to service |
| `src/controllers/agentController.js` | Agent proxy. Validates `message` field, forwards to agent |
| `src/routes/index.js` | Route aggregator. Mounts health, history, agent routes at `/api/*` |

### Middleware & Utilities

| File | Purpose |
|------|---------|
| `src/middleware/errorHandler.js` | Global error catcher. Returns `{error: {message}}`. Shows stack in dev mode |
| `src/middleware/notFound.js` | 404 handler for unmatched routes |
| `src/middleware/requestLogger.js` | Morgan HTTP logger. Skipped in test env |
| `src/utils/ApiError.js` | Custom error class with `statusCode`. Used throughout for consistent errors |

### Tests

| File | Purpose |
|------|---------|
| `tests/setup.js` | Jest setup. Mocks Firebase (`initializeFirebase`, `getDb`). Clears mock store after each test |
| `tests/__mocks__/firestore.js` | In-memory Firestore emulator (~200 lines). Supports full query API: `where`, `orderBy`, `offset`, `limit`, `arrayUnion` |
| `tests/unit/historyService.test.js` | 14 tests — CRUD operations, pagination, error cases |
| `tests/unit/agentService.test.js` | 7 tests — chat proxy, status check, error handling (mocks axios) |
| `tests/integration/health.test.js` | 3 tests — health endpoint fields, agent connected/disconnected |
| `tests/integration/history.test.js` | 8 tests — all CRUD endpoints via HTTP, validation errors, 404s |
| `tests/integration/agent.test.js` | 5 tests — chat proxy, missing message, agent down |

### Deployment

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage build. `node:20-alpine`, non-root user, health check built in |
| `docker-compose.yml` | Backend + stub agent server (for local dev without real agent) |
| `api/index.js` | Vercel serverless wrapper. Initializes Firebase, exports Express app |
| `vercel.json` | Vercel config. Routes all `/*` to `api/index.js`, 30s max duration |

---

## API Endpoints

### Health
```bash
GET /api/health
# Response:
{
  "status": "ok",
  "service": "general-request-service",
  "uptime": 123.45,
  "firestore": "connected",      # or "disconnected"
  "agent": "connected",           # or "disconnected" / "degraded"
  "timestamp": "2026-02-26T..."
}
```

### Conversation History
```bash
# Create conversation
POST /api/history
Body: { "sessionId": "abc", "userId": "user1" }

# List conversations (paginated)
GET /api/history?userId=user1&page=1&limit=10

# Get single conversation
GET /api/history/:id

# Append messages
PUT /api/history/:id
Body: { "messages": [{ "role": "user", "content": "hello" }] }

# Delete conversation
DELETE /api/history/:id
```

### Agent Proxy
```bash
# Chat with AI agent
POST /api/agent/chat
Body: { "message": "hello", "sessionId": "abc", "userId": "user1" }

# Check agent status
GET /api/agent/status
```

---

## Running Tests

### Run all tests
```bash
cd backend
npm test
```

Output: **37 tests** across 5 test suites (runs in ~1 second)

### How tests work (no credentials needed)

Tests use an **in-memory Firestore mock** (`tests/__mocks__/firestore.js`) that simulates the Firestore API entirely in memory. No Firebase project, no Docker, no emulator required.

```
tests/setup.js
  ├── jest.mock('../src/config/firebase')    ← replaces real Firebase
  │     ├── initializeFirebase → no-op
  │     └── getDb → returns mockDb           ← in-memory store
  └── jest.mock('firebase-admin/firestore')
        └── FieldValue → MockFieldValue      ← mock arrayUnion
```

The mock supports: `collection()`, `doc()`, `add()`, `get()`, `set()`, `update()`, `delete()`, `where()`, `orderBy()`, `offset()`, `limit()`, `count()`.

### Run with coverage
```bash
npm run test:coverage
```

### Run linter
```bash
npm run lint
```

### Test structure
```
tests/
├── setup.js                    # Mock wiring (runs before all tests)
├── __mocks__/
│   └── firestore.js            # In-memory Firestore (the magic)
├── unit/
│   ├── historyService.test.js  # 14 tests — service layer
│   └── agentService.test.js    #  7 tests — agent proxy (mocks axios)
└── integration/
    ├── health.test.js          #  3 tests — health endpoint
    ├── history.test.js         #  8 tests — CRUD via HTTP
    └── agent.test.js           #  5 tests — agent proxy via HTTP
```

---

## Docker Development

### Backend only (with stub agent)
```bash
cd backend
npm run docker:up      # builds and starts backend + stub agent
npm run docker:down    # stops and removes containers
```

The stub agent (`docker-compose.yml` in backend/) is a tiny Node.js server that mimics the real Agent Server's `/api/health` and `/api/chat` endpoints.

### Full stack (backend + real agent)
```bash
# From project root
cp .env.example .env
# Edit .env with FIREBASE_SERVICE_ACCOUNT and OPENROUTER_API_KEY

docker compose up --build
```

This starts:
- **backend** on port 3000 (waits for agent health check)
- **agent** on port 8000 (Python/FastAPI with real LLM)

### E2E smoke test
```bash
./tests/e2e/docker-compose.test.sh
```

Automatically builds, starts, tests inter-service communication, and tears down.

---

## Vercel Deployment

The backend can deploy as a Vercel serverless function:

```
api/index.js          ← Entry point (wraps Express app)
vercel.json           ← Routes all requests to api/index.js
```

### Required Vercel Environment Variables
- `FIREBASE_SERVICE_ACCOUNT` — Firebase service account JSON string
- `AGENT_SERVER_URL` — Deployed Agent Server URL
- `NODE_ENV` — Set to `production`

### How it works
1. Vercel receives request
2. `api/index.js` initializes Firebase (once, cached across invocations)
3. Express app processes the request as normal
4. Response returned to client

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3000` | Server port |
| `FIREBASE_SERVICE_ACCOUNT` | Yes | — | Firebase service account JSON string |
| `AGENT_SERVER_URL` | No | `http://localhost:8000` | Agent Server base URL |
| `NODE_ENV` | No | `development` | `development` / `production` / `test` |
