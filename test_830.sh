#!/bin/bash

echo "=== Paper Trading Engine Start Test ($830 balance) ==="

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

# Start paper simulation with $830 balance (10 second timeout)
echo "📊 Starting paper simulation with $830 balance..."
echo "Waiting for response (timeout: 10s)..."

START_RESPONSE=$(timeout 10s curl -s -X POST http://localhost:5000/api/paper-sim/start \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "x-app-mode: paper" \
  -d '{"mode":"new","initialBalance":830}')

EXIT_CODE=$?

echo ""
if [ $EXIT_CODE -eq 124 ]; then
  echo "❌ TIMEOUT AFTER 10 SECONDS"
  echo "Response received: NONE (request hung)"
elif [ $EXIT_CODE -eq 0 ]; then
  echo "✅ Response received within 10 seconds:"
  echo "$START_RESPONSE" | jq '.'
else
  echo "❌ curl error (exit code: $EXIT_CODE)"
fi

echo ""
echo "=== Check logs for [41D-ROUTE-*] and [41D-DEBUG-*] entries ==="
