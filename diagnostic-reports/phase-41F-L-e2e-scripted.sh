#!/bin/bash
# Phase 41F-L.E2E: Autonomous End-to-End Paper-Mode Validation
# Tests complete data flow with lineage tracking: Kraken → Filters → Signals → Trades → Portfolio

set -e

BASE_URL="http://localhost:5000"
OUTPUT_FILE="diagnostic-reports/phase-41F-L-e2e-results.json"
LINEAGE_FILE="diagnostic-reports/phase-41F-L-e2e-lineage.ndjson"

# Test credentials
USERNAME="testuser123"
PASSWORD="SecurePass123!"

echo "🚀 Phase 41F-L.E2E: End-to-End Paper-Mode Validation with Lineage Tracking"
echo "=========================================================================="
echo ""

# Initialize results
echo "{" > "$OUTPUT_FILE"
echo "  \"testStart\": \"$(date -Iseconds)\"," >> "$OUTPUT_FILE"
echo "  \"steps\": {" >> "$OUTPUT_FILE"

# STEP 1: Authenticate
echo "Step 1: Authenticating as $USERNAME..."
AUTH_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}")

TOKEN=$(echo "$AUTH_RESPONSE" | jq -r '.token // empty')

if [ -z "$TOKEN" ]; then
  echo "  ❌ Authentication failed"
  echo "    \"auth\": {\"status\": \"failed\", \"error\": \"No token received\"}," >> "$OUTPUT_FILE"
  exit 1
fi

echo "  ✓ Authenticated successfully"
echo "    \"auth\": {\"status\": \"success\"}," >> "$OUTPUT_FILE"
echo ""

# STEP 2: Capture initial portfolio state
echo "Step 2: Capturing initial portfolio state..."
INITIAL_PORTFOLIO=$(curl -s "$BASE_URL/api/dashboard/metrics" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-app-mode: paper")

INITIAL_VALUE=$(echo "$INITIAL_PORTFOLIO" | jq -r '.portfolioValue // 900')
echo "  Initial portfolio value: \$$INITIAL_VALUE"
echo "    \"initialPortfolio\": {\"value\": $INITIAL_VALUE}," >> "$OUTPUT_FILE"
echo ""

# STEP 3: Execute 3 trades with lineage tracking
echo "Step 3: Executing 3 paper trades with lineage tracking..."
echo "    \"trades\": [" >> "$OUTPUT_FILE"

TRADE_SYMBOLS=("BTC/USD" "ETH/USD" "BTC/USD")
TRADE_ACTIONS=("buy" "buy" "sell")
TRADE_AMOUNTS=(0.01 0.05 0.01)
TRACE_IDS=()

for i in {0..2}; do
  SYMBOL="${TRADE_SYMBOLS[$i]}"
  ACTION="${TRADE_ACTIONS[$i]}"
  AMOUNT="${TRADE_AMOUNTS[$i]}"
  
  echo ""
  echo "  Trade $((i+1)): $ACTION $AMOUNT $SYMBOL..."
  
  TRADE_RESPONSE=$(curl -s -X POST "$BASE_URL/api/paper/trade/test" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -H "x-app-mode: paper" \
    -d "{\"symbol\":\"$SYMBOL\",\"action\":\"$ACTION\",\"amount\":$AMOUNT}")
  
  TRADE_OK=$(echo "$TRADE_RESPONSE" | jq -r '.ok // false')
  TRADE_ID=$(echo "$TRADE_RESPONSE" | jq -r '.trade.id // "unknown"')
  TRACE_ID=$(echo "$TRADE_RESPONSE" | jq -r '.traceId // "unknown"')
  PORTFOLIO_VALUE=$(echo "$TRADE_RESPONSE" | jq -r '.portfolio.totalValue // 0')
  PORTFOLIO_PL=$(echo "$TRADE_RESPONSE" | jq -r '.portfolio.totalPL // 0')
  
  if [ "$TRADE_OK" = "true" ]; then
    echo "    ✓ Trade executed: ID=$TRADE_ID, TraceID=$TRACE_ID"
    echo "    Portfolio: \$$PORTFOLIO_VALUE (PL: \$$PORTFOLIO_PL)"
    TRACE_IDS+=("$TRACE_ID")
    
    [ $i -gt 0 ] && echo "      ," >> "$OUTPUT_FILE"
    echo "      {" >> "$OUTPUT_FILE"
    echo "        \"tradeNumber\": $((i+1))," >> "$OUTPUT_FILE"
    echo "        \"symbol\": \"$SYMBOL\"," >> "$OUTPUT_FILE"
    echo "        \"action\": \"$ACTION\"," >> "$OUTPUT_FILE"
    echo "        \"amount\": $AMOUNT," >> "$OUTPUT_FILE"
    echo "        \"tradeId\": \"$TRADE_ID\"," >> "$OUTPUT_FILE"
    echo "        \"traceId\": \"$TRACE_ID\"," >> "$OUTPUT_FILE"
    echo "        \"portfolioValue\": $PORTFOLIO_VALUE," >> "$OUTPUT_FILE"
    echo "        \"portfolioPL\": $PORTFOLIO_PL," >> "$OUTPUT_FILE"
    echo "        \"status\": \"success\"" >> "$OUTPUT_FILE"
    echo "      }" >> "$OUTPUT_FILE"
  else
    ERROR=$(echo "$TRADE_RESPONSE" | jq -r '.error // "Unknown error"')
    echo "    ⚠️  Trade failed: $ERROR"
    
    [ $i -gt 0 ] && echo "      ," >> "$OUTPUT_FILE"
    echo "      {" >> "$OUTPUT_FILE"
    echo "        \"tradeNumber\": $((i+1))," >> "$OUTPUT_FILE"
    echo "        \"symbol\": \"$SYMBOL\"," >> "$OUTPUT_FILE"
    echo "        \"action\": \"$ACTION\"," >> "$OUTPUT_FILE"
    echo "        \"amount\": $AMOUNT," >> "$OUTPUT_FILE"
    echo "        \"status\": \"failed\"," >> "$OUTPUT_FILE"
    echo "        \"error\": \"$ERROR\"" >> "$OUTPUT_FILE"
    echo "      }" >> "$OUTPUT_FILE"
  fi
done

echo "    ]," >> "$OUTPUT_FILE"
echo ""

# STEP 4: Verify lineage completeness
echo "Step 4: Verifying lineage completeness..."
echo "    \"lineageValidation\": {" >> "$OUTPUT_FILE"

LINEAGE_COMPLETE=true

for i in "${!TRACE_IDS[@]}"; do
  TRACE_ID="${TRACE_IDS[$i]}"
  echo ""
  echo "  Checking lineage for trace $((i+1)): $TRACE_ID"
  
  # Check if lineage NDJSON file exists and contains this traceId
  if [ -f "$LINEAGE_FILE" ]; then
    LINEAGE_EVENTS=$(grep "\"traceId\":\"$TRACE_ID\"" "$LINEAGE_FILE" | wc -l)
    echo "    Found $LINEAGE_EVENTS lineage events in NDJSON file"
    
    # Expected stages: filter_snapshot, signal_snapshot, order_submitted, order_filled, portfolio_update
    EXPECTED_STAGES=("filter_snapshot" "signal_snapshot" "order_submitted" "order_filled" "portfolio_update")
    MISSING_STAGES=()
    
    for STAGE in "${EXPECTED_STAGES[@]}"; do
      if ! grep -q "\"traceId\":\"$TRACE_ID\".*\"stage\":\"$STAGE\"" "$LINEAGE_FILE"; then
        MISSING_STAGES+=("$STAGE")
      fi
    done
    
    if [ ${#MISSING_STAGES[@]} -eq 0 ]; then
      echo "    ✓ Complete lineage: All 5 stages present"
      [ $i -gt 0 ] && echo "      ," >> "$OUTPUT_FILE"
      echo "      \"trace$((i+1))\": {" >> "$OUTPUT_FILE"
      echo "        \"traceId\": \"$TRACE_ID\"," >> "$OUTPUT_FILE"
      echo "        \"status\": \"complete\"," >> "$OUTPUT_FILE"
      echo "        \"eventsFound\": $LINEAGE_EVENTS" >> "$OUTPUT_FILE"
      echo "      }" >> "$OUTPUT_FILE"
    else
      echo "    ⚠️  Incomplete lineage: Missing stages: ${MISSING_STAGES[*]}"
      LINEAGE_COMPLETE=false
      [ $i -gt 0 ] && echo "      ," >> "$OUTPUT_FILE"
      echo "      \"trace$((i+1))\": {" >> "$OUTPUT_FILE"
      echo "        \"traceId\": \"$TRACE_ID\"," >> "$OUTPUT_FILE"
      echo "        \"status\": \"incomplete\"," >> "$OUTPUT_FILE"
      echo "        \"eventsFound\": $LINEAGE_EVENTS," >> "$OUTPUT_FILE"
      echo "        \"missingStages\": [\"${MISSING_STAGES[*]}\"]" >> "$OUTPUT_FILE"
      echo "      }" >> "$OUTPUT_FILE"
    fi
  else
    echo "    ⚠️  Lineage file not found: $LINEAGE_FILE"
    LINEAGE_COMPLETE=false
    [ $i -gt 0 ] && echo "      ," >> "$OUTPUT_FILE"
    echo "      \"trace$((i+1))\": {" >> "$OUTPUT_FILE"
    echo "        \"traceId\": \"$TRACE_ID\"," >> "$OUTPUT_FILE"
    echo "        \"status\": \"file_not_found\"" >> "$OUTPUT_FILE"
    echo "      }" >> "$OUTPUT_FILE"
  fi
done

echo "    }," >> "$OUTPUT_FILE"
echo ""

# STEP 5: Verify final portfolio state
echo "Step 5: Verifying final portfolio state..."
FINAL_PORTFOLIO=$(curl -s "$BASE_URL/api/dashboard/metrics" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-app-mode: paper")

FINAL_VALUE=$(echo "$FINAL_PORTFOLIO" | jq -r '.portfolioValue // 900')
FINAL_PL=$(echo "$FINAL_PORTFOLIO" | jq -r '.totalPL // 0')
OPEN_POSITIONS=$(echo "$FINAL_PORTFOLIO" | jq -r '.openPositions // 0')

echo "  Final portfolio value: \$$FINAL_VALUE"
echo "  Total P/L: \$$FINAL_PL"
echo "  Open positions: $OPEN_POSITIONS"

echo "    \"finalPortfolio\": {" >> "$OUTPUT_FILE"
echo "      \"value\": $FINAL_VALUE," >> "$OUTPUT_FILE"
echo "      \"totalPL\": $FINAL_PL," >> "$OUTPUT_FILE"
echo "      \"openPositions\": $OPEN_POSITIONS" >> "$OUTPUT_FILE"
echo "    }," >> "$OUTPUT_FILE"
echo ""

# STEP 6: Check trade history persistence
echo "Step 6: Checking trade history persistence..."
TRADE_HISTORY=$(curl -s "$BASE_URL/api/trades/history" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-app-mode: paper")

HISTORY_COUNT=$(echo "$TRADE_HISTORY" | jq '. | length')
echo "  Trade history count: $HISTORY_COUNT"

echo "    \"tradeHistory\": {" >> "$OUTPUT_FILE"
echo "      \"count\": $HISTORY_COUNT" >> "$OUTPUT_FILE"
echo "    }" >> "$OUTPUT_FILE"

# Close results JSON
echo "  }," >> "$OUTPUT_FILE"
echo "  \"testEnd\": \"$(date -Iseconds)\"" >> "$OUTPUT_FILE"
echo "}" >> "$OUTPUT_FILE"

echo ""
echo "=========================================================================="
echo "📊 Test Summary"
echo "=========================================================================="
echo "  Trades executed: ${#TRACE_IDS[@]} / 3"
echo "  Initial portfolio: \$$INITIAL_VALUE"
echo "  Final portfolio: \$$FINAL_VALUE"
echo "  Portfolio change: \$$(bc <<< "$FINAL_VALUE - $INITIAL_VALUE")"
echo "  Trade history count: $HISTORY_COUNT"
echo "  Lineage complete: $LINEAGE_COMPLETE"
echo ""
echo "  Results saved to: $OUTPUT_FILE"
echo "  Lineage events in: $LINEAGE_FILE"
echo ""

# Final verdict
if [ ${#TRACE_IDS[@]} -eq 3 ] && [ "$LINEAGE_COMPLETE" = true ]; then
  echo "✅ Phase 41F-L.E2E PASSED"
  exit 0
else
  echo "❌ Phase 41F-L.E2E FAILED"
  exit 1
fi
