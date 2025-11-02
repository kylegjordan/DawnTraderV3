#!/bin/bash

echo "=== API-Direct Paper Trading Engine Test (With Balance Confirmation) ==="
echo "Testing portfolio balance: \$820"
echo ""

# Login
echo "[1/7] Logging in..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser123","password":"SecurePass123!"}')

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)
echo "✅ Token acquired"
echo ""

# Check initial status
echo "[2/7] Checking initial status..."
curl -s http://localhost:5000/api/paper-sim/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-app-mode: paper" | jq '.'
echo ""

# Start with balance confirmation (confirmBalance: true)
echo "[3/7] Starting engine with \$820 balance (confirmBalance: true)..."
START_RESPONSE=$(curl -s -X POST http://localhost:5000/api/paper-sim/start \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "x-app-mode: paper" \
  -d '{"startingBalance":820,"skipAutoWatchlist":true,"confirmBalance":true}')

echo "$START_RESPONSE" | jq '.'
echo ""

# Wait for engine to fully start
echo "[4/7] Waiting 5 seconds for engine initialization..."
sleep 5

# Check status after start
echo "[5/7] Checking status after start..."
curl -s http://localhost:5000/api/paper-sim/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-app-mode: paper" | jq '.'
echo ""

# Stop the engine
echo "[6/7] Stopping engine..."
STOP_RESPONSE=$(curl -s -X POST http://localhost:5000/api/paper-sim/stop \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "x-app-mode: paper")

echo "$STOP_RESPONSE" | jq '.'
echo ""

# Wait for clean shutdown
sleep 2

# Final status
echo "[7/7] Final status after stop..."
curl -s http://localhost:5000/api/paper-sim/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-app-mode: paper" | jq '.'
echo ""

echo "=== Test Complete - Check logs for [ENGINE_CHECKPOINT_12] and [ENGINE_STOPPED] ==="

