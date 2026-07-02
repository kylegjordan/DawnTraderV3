#!/bin/bash
# Phase 3C: API Latency Benchmark
# Tests key API endpoints and measures response times

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 Phase 3C: API Latency Benchmark"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Configuration
BASE_URL="${BASE_URL:-http://localhost:5000}"
USERNAME="${USERNAME:-testuser123}"
PASSWORD="${PASSWORD:-SecurePass123!}"
OUTPUT_FILE="logs/phase3c-api-latency.csv"

# Clear previous results
> "$OUTPUT_FILE"
echo "endpoint,time_total_ms,http_code" >> "$OUTPUT_FILE"

echo "🔐 Authenticating..."
# Login and get token
AUTH_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}")

TOKEN=$(echo "$AUTH_RESPONSE" | jq -r '.accessToken // .token // empty')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "❌ Authentication failed. Response:"
  echo "$AUTH_RESPONSE"
  exit 1
fi

echo "✅ Authentication successful"
echo ""

# Test endpoints with their actual paths
ENDPOINTS=(
  "/api/trading/status"
  "/api/goals"
  "/api/portfolio/overview"
  "/api/system/health"
  "/api/active-engine/status"
  "/api/guardrails-v2"
  "/api/filters-v2"
  "/api/strategies/settings"
  "/api/market/overview"
  "/api/cortex/status"
)

echo "📊 Testing ${#ENDPOINTS[@]} endpoints..."
echo ""

# Track totals for summary
TOTAL_TIME=0
COUNT=0
MIN_TIME=999999
MAX_TIME=0

for ENDPOINT in "${ENDPOINTS[@]}"; do
  # Make request and capture timing
  RESPONSE=$(curl -s -w "\n%{http_code}\n%{time_total}" -o /tmp/response_body.txt \
    -H "Authorization: Bearer $TOKEN" \
    "$BASE_URL$ENDPOINT")
  
  HTTP_CODE=$(echo "$RESPONSE" | tail -n 2 | head -n 1)
  TIME_TOTAL=$(echo "$RESPONSE" | tail -n 1)
  
  # Convert to milliseconds using awk
  TIME_MS=$(awk "BEGIN {print $TIME_TOTAL * 1000}")
  TIME_MS_INT=$(printf "%.0f" "$TIME_MS")
  
  # Update min/max
  if (( $(awk "BEGIN {print ($TIME_MS > $MAX_TIME)}") )); then
    MAX_TIME=$TIME_MS
  fi
  if (( $(awk "BEGIN {print ($TIME_MS < $MIN_TIME)}") )); then
    MIN_TIME=$TIME_MS
  fi
  
  # Track totals
  TOTAL_TIME=$(awk "BEGIN {print $TOTAL_TIME + $TIME_MS}")
  COUNT=$((COUNT + 1))
  
  # Color code based on latency
  if (( TIME_MS_INT < 100 )); then
    COLOR="\033[0;32m" # Green
    STATUS="✅"
  elif (( TIME_MS_INT < 200 )); then
    COLOR="\033[1;33m" # Yellow
    STATUS="⚠️ "
  else
    COLOR="\033[0;31m" # Red
    STATUS="❌"
  fi
  NC="\033[0m"
  
  # Log result
  echo "${ENDPOINT#/api/},$TIME_MS,$HTTP_CODE" >> "$OUTPUT_FILE"
  echo -e "$STATUS ${COLOR}${ENDPOINT}${NC}: ${TIME_MS_INT}ms (HTTP $HTTP_CODE)"
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📈 Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Calculate average using awk
AVG_TIME=$(awk "BEGIN {print $TOTAL_TIME / $COUNT}")
AVG_TIME_INT=$(printf "%.0f" "$AVG_TIME")
MIN_TIME_INT=$(printf "%.0f" "$MIN_TIME")
MAX_TIME_INT=$(printf "%.0f" "$MAX_TIME")

echo "Endpoints tested: $COUNT"
echo "Average latency:  ${AVG_TIME_INT}ms"
echo "Min latency:      ${MIN_TIME_INT}ms"
echo "Max latency:      ${MAX_TIME_INT}ms"
echo ""

# Check if passes target
if (( AVG_TIME_INT <= 120 )); then
  echo "✅ PASS - Average latency ≤ 120ms target"
  EXIT_CODE=0
else
  echo "❌ FAIL - Average latency exceeds 120ms target"
  EXIT_CODE=1
fi

echo ""
echo "Results saved to: $OUTPUT_FILE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

exit $EXIT_CODE
