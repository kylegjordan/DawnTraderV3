#!/bin/bash

echo "=== API-Direct Paper Trading Engine Test ==="
echo "Testing portfolio balance: \$820"
echo ""

# Login and get token
echo "[1/6] Logging in as testuser123..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser123","password":"SecurePass123!"}')

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ Login failed: $LOGIN_RESPONSE"
  exit 1
fi

echo "✅ Login successful"
echo ""

# Check initial status
echo "[2/6] Checking initial engine status..."
STATUS_1=$(curl -s http://localhost:5000/api/paper-sim/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-app-mode: paper")

echo "Initial Status: $STATUS_1"
echo ""

# Start the engine
echo "[3/6] Starting paper trading engine with \$820 balance..."
START_RESPONSE=$(curl -s -X POST http://localhost:5000/api/paper-sim/start \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "x-app-mode: paper" \
  -d '{"startingBalance":820,"skipAutoWatchlist":true}')

echo "Start Response: $START_RESPONSE"
echo ""

# Wait for engine to initialize
sleep 3

# Check status after start
echo "[4/6] Checking status after start..."
STATUS_2=$(curl -s http://localhost:5000/api/paper-sim/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-app-mode: paper")

echo "After Start Status: $STATUS_2"
echo ""

# Stop the engine
echo "[5/6] Stopping paper trading engine..."
STOP_RESPONSE=$(curl -s -X POST http://localhost:5000/api/paper-sim/stop \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "x-app-mode: paper")

echo "Stop Response: $STOP_RESPONSE"
echo ""

# Wait for clean shutdown
sleep 2

# Check final status
echo "[6/6] Checking final status after stop..."
STATUS_3=$(curl -s http://localhost:5000/api/paper-sim/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-app-mode: paper")

echo "After Stop Status: $STATUS_3"
echo ""

echo "=== Test Complete ==="
echo ""
echo "Now checking server logs for checkpoints..."

