#!/usr/bin/env bash
set -e

echo "🚀 Phase 41F-K Dry-Run Mode Validation"
echo "=========================================="
echo ""

BASE="http://localhost:5000"
USER="testuser123"
PASS="SecurePass123!"

# Authenticate
echo "Step 1: Authenticating..."
TOKEN=$(curl -s -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"'"$USER"'","password":"'"$PASS"'"}' | jq -r '.accessToken')

if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
  echo "❌ Authentication failed"
  exit 1
fi
echo "✓ Authenticated successfully"
echo ""

# Get initial portfolio state
echo "Step 2: Capturing initial portfolio state..."
INITIAL_PORTFOLIO=$(curl -s "$BASE/api/portfolio/overview" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-app-mode: paper")
INITIAL_VALUE=$(echo "$INITIAL_PORTFOLIO" | jq -r '.totalValue // 0')
echo "  Initial portfolio value: \$$INITIAL_VALUE"
echo ""

# Execute 3 dry-run trades
echo "Step 3: Executing 3 dry-run trades (no DB mutation)..."
echo ""

TRADE_COUNT=0
SIMULATED_COUNT=0

for SYMBOL in "BTC/USD" "ETH/USD" "LTC/USD"; do
  echo "  Testing $SYMBOL..."
  
  RESPONSE=$(curl -s -X POST "$BASE/api/dryrun/trade/test" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -H "x-app-mode: paper" \
    -d "{\"symbol\":\"$SYMBOL\", \"action\":\"buy\", \"amount\":0.01}")
  
  # Check if response is valid JSON
  if ! echo "$RESPONSE" | jq empty 2>/dev/null; then
    echo "  ⚠️  Invalid JSON response for $SYMBOL"
    echo "  Response: $RESPONSE"
    continue
  fi
  
  OK=$(echo "$RESPONSE" | jq -r '.ok // false')
  SIMULATED=$(echo "$RESPONSE" | jq -r '.simulated // false')
  DRYRUN=$(echo "$RESPONSE" | jq -r '.dryrun // false')
  TRADE_ID=$(echo "$RESPONSE" | jq -r '.trade.id // "unknown"')
  
  if [ "$OK" = "true" ]; then
    ((TRADE_COUNT++))
    if [ "$SIMULATED" = "true" ] || [ "$DRYRUN" = "true" ]; then
      ((SIMULATED_COUNT++))
      echo "  ✅ $SYMBOL: simulated=$SIMULATED, dryrun=$DRYRUN, id=$TRADE_ID"
    else
      echo "  ⚠️  $SYMBOL: Trade executed but NOT marked as simulated!"
      echo "  Response: $RESPONSE"
    fi
  else
    ERROR=$(echo "$RESPONSE" | jq -r '.error // "unknown error"')
    echo "  ❌ $SYMBOL failed: $ERROR"
  fi
done

echo ""
echo "  Trades executed: $TRADE_COUNT/3"
echo "  Simulated trades: $SIMULATED_COUNT/3"
echo ""

# Wait for any async operations
echo "Step 4: Waiting for any async operations to complete..."
sleep 3
echo "✓ Wait complete"
echo ""

# Check final portfolio state
echo "Step 5: Verifying portfolio unchanged..."
FINAL_PORTFOLIO=$(curl -s "$BASE/api/portfolio/overview" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-app-mode: paper")
FINAL_VALUE=$(echo "$FINAL_PORTFOLIO" | jq -r '.totalValue // 0')
echo "  Final portfolio value: \$$FINAL_VALUE"

# Calculate change (using awk instead of bc for portability)
VALUE_CHANGE=$(awk "BEGIN {print $FINAL_VALUE - $INITIAL_VALUE}")
PERCENT_CHANGE=$(awk "BEGIN {print ($VALUE_CHANGE / $INITIAL_VALUE) * 100}")

echo "  Change: \$$VALUE_CHANGE ($PERCENT_CHANGE%)"

# Check if change is within tolerance (< 0.01%)
if awk "BEGIN {exit !($PERCENT_CHANGE < 0.01 && $PERCENT_CHANGE > -0.01)}"; then
  echo "  ✅ Portfolio unchanged (within 0.01% tolerance)"
  PORTFOLIO_OK=true
else
  echo "  ❌ Portfolio changed by ${PERCENT_CHANGE}%!"
  PORTFOLIO_OK=false
fi
echo ""

# Check for anomalies (if endpoint exists)
echo "Step 6: Checking for anomalies..."
ANOMALIES=$(curl -s "$BASE/api/health/anomalies?limit=10" \
  -H "Authorization: Bearer $TOKEN" 2>/dev/null || echo '{"anomalies":[]}')

if echo "$ANOMALIES" | jq empty 2>/dev/null; then
  DRYRUN_ANOMALIES=$(echo "$ANOMALIES" | jq '[.anomalies[] | select(.message | contains("Dry-run") or contains("dryrun"))] | length')
  CRITICAL_ANOMALIES=$(echo "$ANOMALIES" | jq '[.anomalies[] | select(.level == "critical" or .level == "warning")] | length')
  
  echo "  Dry-run anomalies: $DRYRUN_ANOMALIES"
  echo "  Critical/warning anomalies: $CRITICAL_ANOMALIES"
  
  if [ "$CRITICAL_ANOMALIES" -gt 0 ]; then
    echo "  ⚠️  Found critical/warning anomalies"
  else
    echo "  ✅ No critical anomalies"
  fi
else
  echo "  ℹ️  Anomaly endpoint not available or returned invalid data"
fi
echo ""

# Final assessment
echo "=========================================="
echo "VALIDATION SUMMARY"
echo "=========================================="
echo ""

PASS_COUNT=0
TOTAL_CHECKS=4

echo "Check 1: Trades executed successfully"
if [ "$TRADE_COUNT" -eq 3 ]; then
  echo "  ✅ PASS: All 3 trades executed"
  ((PASS_COUNT++))
else
  echo "  ❌ FAIL: Only $TRADE_COUNT/3 trades executed"
fi

echo "Check 2: Trades marked as simulated"
if [ "$SIMULATED_COUNT" -eq "$TRADE_COUNT" ]; then
  echo "  ✅ PASS: All executed trades marked as simulated"
  ((PASS_COUNT++))
else
  echo "  ❌ FAIL: Only $SIMULATED_COUNT/$TRADE_COUNT marked as simulated"
fi

echo "Check 3: Portfolio unchanged"
if [ "$PORTFOLIO_OK" = true ]; then
  echo "  ✅ PASS: Portfolio value unchanged"
  ((PASS_COUNT++))
else
  echo "  ❌ FAIL: Portfolio value changed"
fi

echo "Check 4: No critical anomalies"
if [ "${CRITICAL_ANOMALIES:-0}" -eq 0 ]; then
  echo "  ✅ PASS: No critical anomalies"
  ((PASS_COUNT++))
else
  echo "  ⚠️  WARN: Found ${CRITICAL_ANOMALIES} critical anomalies"
fi

echo ""
echo "=========================================="
echo "Result: $PASS_COUNT/$TOTAL_CHECKS checks passed"

if [ "$PASS_COUNT" -eq "$TOTAL_CHECKS" ]; then
  echo "✅ PHASE 41F-K VALIDATION PASSED"
  echo "=========================================="
  exit 0
else
  echo "⚠️  PHASE 41F-K VALIDATION INCOMPLETE"
  echo "=========================================="
  exit 1
fi
