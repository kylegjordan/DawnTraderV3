#!/bin/bash
# Phase 41F-I Trade Telemetry Validation Script
# Tests trade lifecycle events, signal emissions, and health monitor integration

set -e

API_BASE="http://localhost:5000"
AUTH_ENDPOINT="$API_BASE/api/auth/login"
HEALTH_ENDPOINT="$API_BASE/api/health/latest"
PAPER_ENGINE_START="$API_BASE/api/trading/start"
PAPER_ENGINE_STOP="$API_BASE/api/trading/stop"

USERNAME="testuser123"
PASSWORD="SecurePass123!"

echo "================================================"
echo "Phase 41F-I: Trade Telemetry Validation Test"
echo "================================================"
echo ""
echo "Test Objective: Validate trade event telemetry hooks,"
echo "health monitor integration, and idle watchdog"
echo ""

# Authenticate and get JWT token
echo "[1/7] Authenticating..."
LOGIN_RESPONSE=$(curl -s -X POST "$AUTH_ENDPOINT" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}")

TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"accessToken":"[^"]*"' | sed 's/"accessToken":"//;s/"//')

if [ -z "$TOKEN" ]; then
  echo "✗ Authentication failed"
  echo "$LOGIN_RESPONSE"
  exit 1
fi

echo "✓ Authentication successful"

# Helper function to make authenticated requests
auth_request() {
  local method=$1
  local endpoint=$2
  local data=$3
  
  if [ -n "$data" ]; then
    curl -s -X "$method" "$endpoint" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $TOKEN" \
      -d "$data"
  else
    curl -s -X "$method" "$endpoint" \
      -H "Authorization: Bearer $TOKEN"
  fi
}

# Get baseline health
echo ""
echo "[2/7] Capturing baseline health metrics..."
BASELINE_HEALTH=$(auth_request GET "$HEALTH_ENDPOINT")
BASELINE_TS=$(echo "$BASELINE_HEALTH" | grep -o '"ts":"[^"]*"' | head -1)
echo "✓ Baseline captured at $BASELINE_TS"

# Start paper trading engine
echo ""
echo "[3/7] Starting paper trading engine..."
START_RESPONSE=$(auth_request POST "$PAPER_ENGINE_START" '{"mode":"paper"}')
if echo "$START_RESPONSE" | grep -q "started\|already\|active"; then
  echo "✓ Paper engine started"
else
  echo "✗ Failed to start paper engine"
  echo "$START_RESPONSE"
fi

# Wait 30 seconds and check for engine activity tracking
echo ""
echo "[4/7] Waiting 30s to observe engine activity tracking..."
sleep 30

HEALTH_30s=$(auth_request GET "$HEALTH_ENDPOINT")
ENGINE_RUNNING=$(echo "$HEALTH_30s" | grep -o '"isRunning":true' | wc -l)

if [ "$ENGINE_RUNNING" -gt 0 ]; then
  echo "✓ Engine activity detected (isRunning:true found)"
else
  echo "⚠ No engine activity detected"
fi

# Wait 40 more seconds to trigger 60s idle watchdog (if no trades)
echo ""
echo "[5/7] Waiting 40s more to test 60s idle watchdog (total 70s)..."
sleep 40

HEALTH_70s=$(auth_request GET "$HEALTH_ENDPOINT")
IDLE_WARNING=$(echo "$HEALTH_70s" | grep -o 'tradePipeline.*idle' | wc -l)

if [ "$IDLE_WARNING" -gt 0 ]; then
  echo "✓ Idle watchdog triggered (60s without trade activity)"
else
  echo "⚠ No idle watchdog warning detected (expected for no-trade scenario)"
fi

# Get final health metrics
echo ""
echo "[6/7] Capturing final health metrics..."
FINAL_HEALTH=$(auth_request GET "$HEALTH_ENDPOINT")
FINAL_TS=$(echo "$FINAL_HEALTH" | grep -o '"ts":"[^"]*"' | head -1)
echo "✓ Final metrics captured at $FINAL_TS"

# Stop engine
echo ""
echo "[7/7] Stopping paper trading engine..."
STOP_RESPONSE=$(auth_request POST "$PAPER_ENGINE_STOP" '{"mode":"paper"}')
if echo "$STOP_RESPONSE" | grep -q "stopped\|already"; then
  echo "✓ Paper engine stopped"
else
  echo "⚠ Failed to stop paper engine"
fi

echo ""
echo "================================================"
echo "Test Complete"
echo "================================================"
echo ""
echo "Key Validation Points:"
echo "  1. Engine activity tracking (isRunning detection)"
echo "  2. 60s idle watchdog triggering"
echo "  3. Health monitor integration with trade telemetry"
echo ""
echo "Review output above for warnings (⚠) or failures (✗)"
echo "Expected: At least one ✓ for engine activity"
