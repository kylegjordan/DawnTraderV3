#!/bin/bash

echo "=================================================="
echo "API-Direct Paper Trading Engine Test"
echo "Portfolio Balance: \$820"
echo "=================================================="
echo ""

# Login
echo "[1/9] 🔐 Logging in as testuser123..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser123","password":"SecurePass123!"}')

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ Login failed"
  exit 1
fi

echo "✅ Token acquired"
echo ""

# Confirm balance first
echo "[2/9] ✅ Confirming portfolio balance at \$820..."
CONFIRM_RESPONSE=$(curl -s -X POST http://localhost:5000/api/paper-sim/confirm-balance \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "x-app-mode: paper" \
  -d '{"balance":820,"mode":"paper"}')

echo "$CONFIRM_RESPONSE" | jq '.'
echo ""

# Check initial status
echo "[3/9] 📊 Checking initial engine status..."
STATUS_1=$(curl -s http://localhost:5000/api/paper-sim/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-app-mode: paper")

echo "$STATUS_1" | jq '{isRunning, sessionInfo, diagnostics}'
echo ""

# Start the engine
echo "[4/9] 🚀 Starting paper trading engine with \$820 balance..."
echo "⏱️  Looking for [ENGINE_CHECKPOINT_12] in logs..."
START_RESPONSE=$(curl -s -X POST http://localhost:5000/api/paper-sim/start \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "x-app-mode: paper" \
  -d '{"startingBalance":820,"skipAutoWatchlist":true}')

echo "$START_RESPONSE" | jq '.'

if echo "$START_RESPONSE" | grep -q '"success":true'; then
  echo "✅ Start API returned success=true"
else
  echo "❌ Start API returned success=false"
fi
echo ""

# Wait for engine to fully initialize
echo "[5/9] ⏳ Waiting 5 seconds for engine initialization..."
sleep 5

# Check status after start
echo "[6/9] 📊 Checking status after start..."
STATUS_2=$(curl -s http://localhost:5000/api/paper-sim/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-app-mode: paper")

echo "$STATUS_2" | jq '{isRunning, sessionInfo, diagnostics}'

if echo "$STATUS_2" | grep -q '"isRunning":true'; then
  echo "✅ Engine is RUNNING"
else
  echo "❌ Engine is NOT running"
fi
echo ""

# Stop the engine
echo "[7/9] 🛑 Stopping paper trading engine..."
echo "⏱️  Looking for [ENGINE_STOPPED] in logs..."
STOP_RESPONSE=$(curl -s -X POST http://localhost:5000/api/paper-sim/stop \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "x-app-mode: paper")

echo "$STOP_RESPONSE" | jq '.'

if echo "$STOP_RESPONSE" | grep -q '"success":true'; then
  echo "✅ Stop API returned success=true"
else
  echo "❌ Stop API returned success=false"
fi
echo ""

# Wait for clean shutdown
echo "[8/9] ⏳ Waiting 2 seconds for clean shutdown..."
sleep 2

# Check final status
echo "[9/9] 📊 Final status after stop..."
STATUS_3=$(curl -s http://localhost:5000/api/paper-sim/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-app-mode: paper")

echo "$STATUS_3" | jq '{isRunning, sessionInfo, diagnostics}'

if echo "$STATUS_3" | grep -q '"isRunning":false'; then
  echo "✅ Engine is STOPPED"
else
  echo "❌ Engine is still running"
fi
echo ""

echo "=================================================="
echo "Test Complete"
echo "=================================================="
echo ""
echo "Checking server logs for key checkpoints..."
echo ""

