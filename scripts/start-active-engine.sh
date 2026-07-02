#!/bin/bash
# Directive 8.8.4-A3.R9.0.B: CLI wrapper for starting paper trading via authenticated API
# This ensures single-engine consistency by using the same mechanism as the UI

set -e

API_URL="${API_URL:-http://localhost:5000}"
TOKEN="${ACTIVE_ENGINE_TOKEN:-}"

echo "[A3.R9.0.B] Starting paper trading via API..."
echo "[A3.R9.0.B] API URL: $API_URL"

if [ -z "$TOKEN" ]; then
  echo "[A3.R9.0.B][ERROR] No authentication token provided."
  echo "[A3.R9.0.B][ERROR] Set ACTIVE_ENGINE_TOKEN environment variable with a valid JWT token."
  echo "[A3.R9.0.B][ERROR] To get a token, login via the UI and extract it from browser storage."
  exit 1
fi

response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/active-engine/start" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json")

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" -eq 200 ] || [ "$http_code" -eq 201 ]; then
  echo "[A3.R9.0.B][SUCCESS] Paper trading started via API"
  echo "$body" | head -c 500
else
  echo "[A3.R9.0.B][ERROR] API call failed with HTTP $http_code"
  echo "$body"
  exit 1
fi
