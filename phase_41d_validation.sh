#!/bin/bash

echo "========================================================"
echo "Phase 41D Validation: Three Start/Stop Cycles"
echo "========================================================"
echo ""

# Login once
echo "🔐 Authenticating..."
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

# Function to run one test cycle
run_cycle() {
  local CYCLE=$1
  local BALANCE=$2
  
  echo "========================================================"
  echo "CYCLE $CYCLE: Portfolio Balance = \$$BALANCE"
  echo "========================================================"
  echo ""
  
  # START
  echo "📊 Starting simulation..."
  START_TIME=$(date +%s%3N)
  
  START_RESPONSE=$(curl -s -X POST http://localhost:5000/api/paper-sim/start \
    -H "Authorization: Bearer $TOKEN" \
    -H "x-app-mode: paper" \
    -H "Content-Type: application/json" \
    -d "{\"mode\":\"new\",\"initialBalance\":$BALANCE}")
  
  START_END=$(date +%s%3N)
  START_DURATION=$((START_END - START_TIME))
  
  echo "Response time: ${START_DURATION}ms"
  echo "Response:"
  echo "$START_RESPONSE" | jq '.'
  
  if [ $START_DURATION -gt 3000 ]; then
    echo "⚠️  WARNING: Response took > 3 seconds"
  else
    echo "✅ Response time acceptable (< 3s)"
  fi
  echo ""
  
  # Wait 3 seconds
  echo "⏳ Waiting 3 seconds..."
  sleep 3
  echo ""
  
  # STATUS CHECK
  echo "🔍 Checking status..."
  STATUS_RESPONSE=$(curl -s -X GET http://localhost:5000/api/paper-sim/status \
    -H "Authorization: Bearer $TOKEN" \
    -H "x-app-mode: paper")
  
  echo "$STATUS_RESPONSE" | jq '{isRunning, sessionInfo}'
  
  IS_RUNNING=$(echo "$STATUS_RESPONSE" | jq -r '.isRunning')
  if [ "$IS_RUNNING" = "true" ]; then
    echo "✅ Engine is running"
  else
    echo "❌ Engine is NOT running"
  fi
  echo ""
  
  # PORTFOLIO CHECK
  echo "💰 Checking portfolio balance..."
  PORTFOLIO_RESPONSE=$(curl -s -X GET "http://localhost:5000/api/portfolio/overview?mode=paper" \
    -H "Authorization: Bearer $TOKEN" \
    -H "x-app-mode: paper")
  
  echo "$PORTFOLIO_RESPONSE" | jq '{totalValue, cash, crypto}'
  
  ACTUAL_BALANCE=$(echo "$PORTFOLIO_RESPONSE" | jq -r '.totalValue')
  if [ "$ACTUAL_BALANCE" = "$BALANCE" ]; then
    echo "✅ Balance matches: \$$ACTUAL_BALANCE"
  else
    echo "❌ Balance mismatch: Expected \$$BALANCE, got \$$ACTUAL_BALANCE"
  fi
  echo ""
  
  # STOP
  echo "🛑 Stopping simulation..."
  STOP_TIME=$(date +%s%3N)
  
  STOP_RESPONSE=$(curl -s -X POST http://localhost:5000/api/paper-sim/stop \
    -H "Authorization: Bearer $TOKEN" \
    -H "x-app-mode: paper")
  
  STOP_END=$(date +%s%3N)
  STOP_DURATION=$((STOP_END - STOP_TIME))
  
  echo "Response time: ${STOP_DURATION}ms"
  echo "Response:"
  echo "$STOP_RESPONSE" | jq '.'
  
  if echo "$STOP_RESPONSE" | grep -q "Engine is busy"; then
    echo "❌ BUSY FLAG ERROR DETECTED"
  else
    echo "✅ No busy flag errors"
  fi
  
  if [ $STOP_DURATION -gt 3000 ]; then
    echo "⚠️  WARNING: Stop response took > 3 seconds"
  else
    echo "✅ Stop response time acceptable (< 3s)"
  fi
  echo ""
  
  # Final status check
  echo "🔍 Final status check..."
  FINAL_STATUS=$(curl -s -X GET http://localhost:5000/api/paper-sim/status \
    -H "Authorization: Bearer $TOKEN" \
    -H "x-app-mode: paper")
  
  FINAL_RUNNING=$(echo "$FINAL_STATUS" | jq -r '.isRunning')
  if [ "$FINAL_RUNNING" = "false" ]; then
    echo "✅ Engine stopped successfully"
  else
    echo "❌ Engine still running after stop"
  fi
  echo ""
  
  echo "========== CYCLE $CYCLE COMPLETE =========="
  echo ""
  sleep 2
}

# Run three cycles
run_cycle 1 845
run_cycle 2 850
run_cycle 3 855

echo "========================================================"
echo "Phase 41D Validation Complete"
echo "========================================================"
echo ""
echo "✅ Check logs for [41D-FIX] entries to verify non-blocking broadcasts"
