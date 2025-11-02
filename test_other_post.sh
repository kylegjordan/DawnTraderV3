#!/bin/bash

echo "=== Testing if OTHER POST endpoints work ==="

# Login
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser123","password":"SecurePass123!"}')

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ Login failed"
  exit 1
fi

echo "✅ Logged in successfully"
echo ""

# Test 1: POST to /api/paper-sim/confirm-balance (should be fast no-op)
echo "Test 1: POST to /api/paper-sim/confirm-balance (10s timeout)..."
CONFIRM_RESPONSE=$(timeout 10s curl -s -X POST http://localhost:5000/api/paper-sim/confirm-balance \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "x-app-mode: paper" \
  -d '{"balance":500}')

EXIT_CODE=$?

if [ $EXIT_CODE -eq 124 ]; then
  echo "❌ TIMEOUT - confirm-balance also hangs!"
elif [ $EXIT_CODE -eq 0 ]; then
  echo "✅ Response received:"
  echo "$CONFIRM_RESPONSE" | jq '.'
else
  echo "❌ Error (exit code: $EXIT_CODE)"
fi

echo ""
echo "Test 2: POST to /api/paper-sim/stop (10s timeout)..."
STOP_RESPONSE=$(timeout 10s curl -s -X POST http://localhost:5000/api/paper-sim/stop \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "x-app-mode: paper")

EXIT_CODE=$?

if [ $EXIT_CODE -eq 124 ]; then
  echo "❌ TIMEOUT - stop also hangs!"
elif [ $EXIT_CODE -eq 0 ]; then
  echo "✅ Response received:"
  echo "$STOP_RESPONSE" | jq '.'
else
  echo "❌ Error (exit code: $EXIT_CODE)"
fi
