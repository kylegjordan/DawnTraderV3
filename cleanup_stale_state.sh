#!/bin/bash

echo "=== Cleaning Stale State ==="

# Login
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser123","password":"SecurePass123!"}')

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ Login failed"
  exit 1
fi

echo "✅ Logged in"

# Stop any running simulation
echo "Stopping any running simulation..."
curl -s -X POST http://localhost:5000/api/paper-sim/stop \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "x-app-mode: paper" | jq '.'

sleep 2

echo ""
echo "✅ Cleanup complete"
