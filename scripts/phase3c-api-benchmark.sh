#!/bin/bash
# Phase 3C: API Latency Benchmark
# Tests key API endpoints and measures response times

set -e -o pipefail

: "${USERNAME:?Set USERNAME for the benchmark account}"
: "${PASSWORD:?Set PASSWORD for the benchmark account}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 Phase 3C: API Latency Benchmark"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Configuration
BASE_URL="${BASE_URL:-http://localhost:5000}"
OUTPUT_FILE="logs/phase3c-api-latency.csv"

echo "🔐 Authenticating..."
if ! TOKEN=$(
  jq -cn '{username: env.USERNAME, password: env.PASSWORD}' |
    curl -fsS --header 'Content-Type: application/json' --data-binary @- "$BASE_URL/api/auth/login" |
    jq -ers 'select(length == 1) | .[0] | (.accessToken // .token) | strings |
             select(length > 0 and (test("[\r\n]") | not))' 2>/dev/null
); then
  echo "❌ Authentication failed" >&2
  exit 1
fi

echo "✅ Authentication successful"
echo ""

echo "endpoint,time_total_ms,http_code" > "$OUTPUT_FILE"

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
  RESPONSE=$(
    printf '%s\n' "Authorization: Bearer $TOKEN" |
      curl -sS --header @- -w '\n%{http_code}\n%{time_total}' -o /dev/null "$BASE_URL$ENDPOINT"
  )

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
