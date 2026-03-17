#!/usr/bin/env bash
# Inter-service smoke test for docker-compose orchestration
# Usage: ./tests/e2e/docker-compose.test.sh
# Requires: docker compose, curl, jq

set -euo pipefail

COMPOSE_FILE="docker-compose.yml"
BACKEND_URL="http://localhost:3000"
MAX_WAIT=120
PASSED=0
FAILED=0

cd "$(git rev-parse --show-toplevel)"

cleanup() {
  echo ""
  echo "=== Tearing down ==="
  docker compose -f "$COMPOSE_FILE" down --volumes --remove-orphans 2>/dev/null || true
}
trap cleanup EXIT

pass() {
  echo "  PASS: $1"
  PASSED=$((PASSED + 1))
}

fail() {
  echo "  FAIL: $1"
  FAILED=$((FAILED + 1))
}

echo "=== Building and starting services ==="
docker compose -f "$COMPOSE_FILE" up -d --build

echo "=== Waiting for backend to be ready (max ${MAX_WAIT}s) ==="
elapsed=0
until curl -sf "$BACKEND_URL/api/health" > /dev/null 2>&1; do
  if [ $elapsed -ge $MAX_WAIT ]; then
    echo "ERROR: Backend did not become ready within ${MAX_WAIT}s"
    docker compose -f "$COMPOSE_FILE" logs
    exit 1
  fi
  sleep 2
  elapsed=$((elapsed + 2))
  echo "  Waiting... (${elapsed}s)"
done
echo "  Backend ready after ${elapsed}s"

echo ""
echo "=== Running smoke tests ==="

# Test 1: Health endpoint returns expected fields
echo "[Test 1] GET /api/health — check response fields"
HEALTH=$(curl -sf "$BACKEND_URL/api/health")
if echo "$HEALTH" | jq -e '.status == "ok"' > /dev/null 2>&1; then
  pass "status is ok"
else
  fail "status is not ok: $HEALTH"
fi

if echo "$HEALTH" | jq -e '.firestore' > /dev/null 2>&1; then
  pass "firestore field present"
else
  fail "firestore field missing"
fi

if echo "$HEALTH" | jq -e '.agent' > /dev/null 2>&1; then
  pass "agent field present"
else
  fail "agent field missing"
fi

# Test 2: Agent connectivity via health
echo "[Test 2] GET /api/health — agent connectivity"
AGENT_STATUS=$(echo "$HEALTH" | jq -r '.agent')
if [ "$AGENT_STATUS" = "connected" ]; then
  pass "agent is connected"
else
  fail "agent status is '$AGENT_STATUS', expected 'connected'"
fi

# Test 3: Agent chat proxy
echo "[Test 3] POST /api/agent/chat — inter-service communication"
CHAT_RESPONSE=$(curl -sf -X POST "$BACKEND_URL/api/agent/chat" \
  -H "Content-Type: application/json" \
  -d '{"message":"hello from e2e test"}' 2>&1) || true

if [ -n "$CHAT_RESPONSE" ]; then
  pass "agent chat proxy returned a response"
else
  fail "agent chat proxy returned empty response"
fi

# Summary
echo ""
echo "=== Results ==="
echo "  Passed: $PASSED"
echo "  Failed: $FAILED"
echo ""

if [ $FAILED -gt 0 ]; then
  echo "SOME TESTS FAILED"
  exit 1
else
  echo "ALL TESTS PASSED"
  exit 0
fi
