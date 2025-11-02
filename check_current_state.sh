#!/bin/bash

echo "=== Checking Current Simulation State ==="

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
echo ""

# Check portfolio balance
echo "📊 Current portfolio balance:"
curl -s -X GET "http://localhost:5000/api/portfolio/overview?mode=paper" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-app-mode: paper" | jq '{totalValue, cash, crypto}'

echo ""

# Check paper-sim status
echo "⚙️ Paper simulation status:"
curl -s -X GET http://localhost:5000/api/paper-sim/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-app-mode: paper" | jq '{isRunning, sessionInfo}'

