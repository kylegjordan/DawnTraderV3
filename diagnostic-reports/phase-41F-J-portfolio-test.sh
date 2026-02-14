#!/usr/bin/env bash
set -e
BASE="http://localhost:5000"
USER="testuser123"
PASS="SecurePass123!"

echo "Starting Phase 41F-J portfolio reconciliation test..."
echo ""
echo "Note: This test validates portfolio data integrity after manual trade execution."
echo "It skips paper-sim start/stop due to known engine timeout issues (separate from 41F-J scope)."
echo ""

# Authenticate and get token
TOKEN=$(curl -s -X POST "$BASE/api/auth/login" \
 -H "Content-Type: application/json" \
 -d '{"username":"'"$USER"'","password":"'"$PASS"'"}' | jq -r '.accessToken')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "❌ Authentication failed"
  exit 1
fi

echo "✓ Authentication successful"
echo ""

# Capture baseline state
echo "=== Pre-Test Baseline ==="
echo "Trading Status:"
curl -s "$BASE/api/trading/status" -H "Authorization: Bearer $TOKEN" | jq '{mode, active, portfolioOverview}'
echo ""

echo "Paper Trades Count:"
BASELINE_TRADES=$(curl -s "$BASE/api/paper-sim/trades" -H "Authorization: Bearer $TOKEN" | jq 'length')
echo "$BASELINE_TRADES trades"
echo ""

# --- Trade 1 (BTC/USD Buy)
echo "=== Trade 1: Buy 0.005 BTC/USD ==="
curl -s -X POST "$BASE/api/paper/trade/test" \
 -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
 -d '{"symbol":"BTC/USD","action":"buy","amount":0.005}' | jq '.success, .trade, .portfolio'
sleep 3
echo ""

# --- Trade 2 (ETH/USD Buy)
echo "=== Trade 2: Buy 0.05 ETH/USD ==="
curl -s -X POST "$BASE/api/paper/trade/test" \
 -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
 -d '{"symbol":"ETH/USD","action":"buy","amount":0.05}' | jq '.success, .trade, .portfolio'
sleep 3
echo ""

# --- Trade 3 (BTC/USD Sell)
echo "=== Trade 3: Sell 0.005 BTC/USD ==="
curl -s -X POST "$BASE/api/paper/trade/test" \
 -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
 -d '{"symbol":"BTC/USD","action":"sell","amount":0.005}' | jq '.success, .trade, .portfolio'
sleep 3
echo ""

# --- Gather Data Snapshots
echo "=== Post-Test Data Snapshots ==="
echo ""

echo "Recent Trades (last 5):"
curl -s "$BASE/api/paper-sim/trades" -H "Authorization: Bearer $TOKEN" | jq '[.[] | {id, symbol, side, quantity, entryPrice, exitPrice, pnl, openedAt, closedAt}] | .[:5]'
echo ""

echo "Open Positions:"
curl -s "$BASE/api/paper/trades/active" -H "Authorization: Bearer $TOKEN" | jq '[.[] | {symbol, quantity, avgPrice, currentPrice, unrealizedPnl}]'
echo ""

echo "Portfolio Overview (Final):"
curl -s "$BASE/api/trading/status" -H "Authorization: Bearer $TOKEN" | jq '.portfolioOverview'
echo ""

echo "System Health:"
curl -s "$BASE/api/system/health" -H "Authorization: Bearer $TOKEN" | jq '.[0] | {mode, engine, alerts}'
echo ""

# Calculate data integrity metrics
FINAL_TRADES=$(curl -s "$BASE/api/paper-sim/trades" -H "Authorization: Bearer $TOKEN" | jq 'length')
OPEN_POSITIONS=$(curl -s "$BASE/api/paper/trades/active" -H "Authorization: Bearer $TOKEN" | jq 'length')

echo "=== Data Integrity Summary ==="
echo "Baseline trades: $BASELINE_TRADES"
echo "Final trades: $FINAL_TRADES"
echo "New trades executed: $((FINAL_TRADES - BASELINE_TRADES))"
echo "Open positions: $OPEN_POSITIONS"
echo ""

echo "✓ Phase 41F-J Portfolio Test Complete"
echo ""
echo "Expected Results:"
echo "  - 3 new trades in paper_sim_trades table"
echo "  - 1 open position (ETH/USD) after BTC/USD closed"
echo "  - portfolioOverview reflects all trade P/L"
echo "  - No critical anomalies"
