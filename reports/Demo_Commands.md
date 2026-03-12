# Demo Commands — Epic 4 Progress

Run these commands to verify the backend service implementation.

---

## 1. Install Dependencies

```bash
cd backend
npm install
```

---

## 2. Run Test Suite (37 tests)

```bash
npm test
```

Expected:
```
Test Suites: 5 passed, 5 total
Tests:       37 passed, 37 total
```

---

## 3. Run Tests with Coverage Report

```bash
npm run test:coverage
```

---

## 4. Run Linter

```bash
npm run lint
```

Expected: no output (clean code)

---

## 5. Validate Docker Compose Files

```bash
# Root orchestration (backend + agent)
cd .. && docker compose config --quiet && echo "Root compose: VALID"

# Backend compose (backend + stub agent)
cd backend && docker compose config --quiet && echo "Backend compose: VALID"
```

---

## 6. Start Backend Server

```bash
cd backend
node src/server.js
```

Expected output:
```
WARNING: FIREBASE_SERVICE_ACCOUNT not set. Firestore features will be unavailable.
Starting without Firestore — history endpoints will be unavailable
General Request Service running on port 3000
```

---

## 7. Test Endpoints (while server is running)

Open a **new terminal** and run:

### Health Check
```bash
curl http://localhost:3000/api/health
```
Response:
```json
{
  "status": "ok",
  "service": "general-request-service",
  "uptime": 12.5,
  "firestore": "disconnected",
  "agent": "disconnected",
  "timestamp": "2026-02-26T..."
}
```

### Agent Status
```bash
curl http://localhost:3000/api/agent/status
```
Response: `502` — Agent Server not running (expected)

### Agent Chat
```bash
curl -X POST http://localhost:3000/api/agent/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "hello"}'
```
Response: `502` — Agent Server not running (expected)

### Agent Chat — Validation
```bash
curl -X POST http://localhost:3000/api/agent/chat \
  -H "Content-Type: application/json" \
  -d '{}'
```
Response: `400` — `{"error":{"message":"message is required"}}`

### Create Conversation
```bash
curl -X POST http://localhost:3000/api/history \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "test-1", "userId": "user1"}'
```
Response: `500` — Firestore not configured (expected)

### Create Conversation — Validation
```bash
curl -X POST http://localhost:3000/api/history \
  -H "Content-Type: application/json" \
  -d '{}'
```
Response: `400` — `{"error":{"message":"sessionId and userId are required"}}`

### List Conversations
```bash
curl http://localhost:3000/api/history?userId=user1
```
Response: `500` — Firestore not configured (expected)

### List Conversations — Validation
```bash
curl http://localhost:3000/api/history
```
Response: `400` — `{"error":{"message":"userId query parameter is required"}}`

### 404 Handler
```bash
curl http://localhost:3000/api/unknown
```
Response: `404` — `{"error":{"message":"Not found: /api/unknown"}}`

---

## 8. Stop the Server

Press `Ctrl+C` in the terminal running the server.

---

## Summary of What Works

| Feature | Status | Notes |
|---------|--------|-------|
| 37 unit + integration tests | PASS | In-memory Firestore mock, no credentials needed |
| ESLint | PASS | Clean code |
| Server starts without Firebase | PASS | Graceful degradation |
| Health endpoint (`/api/health`) | PASS | Reports Firestore + Agent status |
| Agent proxy (`/api/agent/chat`) | PASS | Returns 502 when agent is down (correct behavior) |
| History endpoints (`/api/history`) | PASS | Returns 500 without Firestore (correct behavior) |
| Input validation | PASS | Returns 400 with clear error messages |
| 404 handling | PASS | Returns proper JSON error |
| Error handling middleware | PASS | Consistent JSON error format |
| Docker Compose config | PASS | Valid YAML for both root and backend |
| Dockerfile | PASS | Multi-stage build, non-root user |
| Vercel config | PASS | Serverless entry point configured |

### Pending (needs team credentials)
- Full stack Docker test (`docker compose up --build`)
- Live Firestore CRUD operations
- End-to-end agent chat with real LLM
