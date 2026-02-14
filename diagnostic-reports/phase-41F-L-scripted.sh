#!/usr/bin/env bash
set -e

BASE="http://localhost:5000"
USER="testuser123"
PASS="SecurePass123!"

echo "🚀 Phase 41F-L: Three-Trade Paper-Mode Simulation (Scripted)"
echo "=============================================================="

# Step 1: Authenticate
echo ""
echo "Step 1: Authenticating..."
TOKEN=$(curl -s -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USER\",\"password\":\"$PASS\"}" | jq -r '.accessToken')

if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
  echo "❌ Authentication failed"
  exit 1
fi
echo "✓ Authenticated successfully"

# Step 2: Get initial portfolio state
echo ""
echo "Step 2: Capturing initial portfolio state..."
INITIAL_PORTFOLIO=$(curl -s "$BASE/api/portfolio/overview" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-app-mode: paper")
INITIAL_VALUE=$(echo "$INITIAL_PORTFOLIO" | jq -r '.totalValue')
echo "  Initial portfolio value: \$$INITIAL_VALUE"

# Step 3: Execute 3 trades
echo ""
echo "Step 3: Executing 3 paper trades..."
echo ""

TRADE_COUNT=0
for TRADE_SPEC in "BTC/USD buy 0.01" "ETH/USD buy 0.05" "BTC/USD sell 0.01"; do
  set -- $TRADE_SPEC
  SYMBOL=$1
  ACTION=$2
  AMOUNT=$3
  
  echo "  Trade $((TRADE_COUNT + 1)): $ACTION $AMOUNT $SYMBOL..."
  
  RESULT=$(curl -s -X POST "$BASE/api/paper/trade/test" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -H "x-app-mode: paper" \
    -d "{\"symbol\":\"$SYMBOL\", \"action\":\"$ACTION\", \"amount\":$AMOUNT}")
  
  SUCCESS=$(echo "$RESULT" | jq -r '.success')
  
  if [ "$SUCCESS" = "true" ]; then
    TRADE_ID=$(echo "$RESULT" | jq -r '.trade.id')
    TRADE_PRICE=$(echo "$RESULT" | jq -r '.trade.price')
    PORTFOLIO_BALANCE=$(echo "$RESULT" | jq -r '.portfolio.balance')
    echo "    ✓ Trade executed: ID=$TRADE_ID, Price=\$$TRADE_PRICE"
    echo "    Portfolio balance: \$$PORTFOLIO_BALANCE"
    TRADE_COUNT=$((TRADE_COUNT + 1))
  else
    ERROR_MSG=$(echo "$RESULT" | jq -r '.error')
    echo "    ⚠️  Trade failed: $ERROR_MSG"
  fi
  
  echo ""
  sleep 2
done

# Step 4: Verify portfolio update
echo "Step 4: Verifying portfolio update..."
FINAL_PORTFOLIO=$(curl -s "$BASE/api/portfolio/overview" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-app-mode: paper")
FINAL_VALUE=$(echo "$FINAL_PORTFOLIO" | jq -r '.totalValue')
echo "  Final portfolio value: \$$FINAL_VALUE"

# Use awk for arithmetic comparison
CHANGED=$(echo "$INITIAL_VALUE $FINAL_VALUE" | awk '{if ($1 != $2) print "yes"; else print "no"}')
if [ "$CHANGED" = "yes" ]; then
  echo "  ✓ Portfolio updated"
else
  echo "  ⚠️  Portfolio unchanged"
fi

# Step 5: Check trade history
echo ""
echo "Step 5: Checking trade history..."
TRADE_HISTORY=$(curl -s "$BASE/api/trades?limit=10" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-app-mode: paper")
HISTORY_COUNT=$(echo "$TRADE_HISTORY" | jq '. | length')
echo "  Trade history count: $HISTORY_COUNT"

# Step 6: Check system health
echo ""
echo "Step 6: Checking system health..."
SYSTEM_HEALTH=$(curl -s "$BASE/api/system/health" \
  -H "Authorization: Bearer $TOKEN")
echo "$SYSTEM_HEALTH" | jq -r '.[] | "  [\(.mode)] Engine: \(.engine), Alerts: \(.alerts)"'

# Step 7: Check anomalies
echo ""
echo "Step 7: Checking for anomalies..."
ANOMALIES=$(curl -s "$BASE/api/health/anomalies?limit=10" \
  -H "Authorization: Bearer $TOKEN" 2>/dev/null || echo '{"anomalies":[]}')
ANOMALY_COUNT=$(echo "$ANOMALIES" | jq '.anomalies | length' 2>/dev/null || echo "0")
echo "  Recent anomalies: $ANOMALY_COUNT"

if [ "$ANOMALY_COUNT" != "0" ]; then
  echo "$ANOMALIES" | jq -r '.anomalies[] | "    [\(.level)] \(.subsystem): \(.message)"' 2>/dev/null || true
fi

# Summary
echo ""
echo "=============================================================="
echo "📊 Test Summary"
echo "=============================================================="
echo "  Trades executed: $TRADE_COUNT / 3"
echo "  Initial portfolio: \$$INITIAL_VALUE"
echo "  Final portfolio: \$$FINAL_VALUE"
echo "  Trade history count: $HISTORY_COUNT"
echo "  System anomalies: $ANOMALY_COUNT"
echo ""

# Pass/Fail determination
if [ "$TRADE_COUNT" -eq 3 ] && [ "$CHANGED" = "yes" ] && [ "$HISTORY_COUNT" -ge 2 ]; then
  echo "✅ Phase 41F-L PASSED"
  exit 0
else
  echo "❌ Phase 41F-L FAILED"
  exit 1
fi
