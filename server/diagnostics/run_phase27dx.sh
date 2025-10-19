#!/bin/bash

# Phase 27.DX Diagnostic Test Runner
# This script enables diagnostic mode and provides instructions for manual testing

echo "=========================================="
echo "PHASE 27.DX DIAGNOSTIC TEST SEQUENCE"
echo "=========================================="
echo ""
echo "This script will:"
echo "1. Enable DIAGNOSTIC_MODE environment variable"
echo "2. Restart the application server"
echo "3. Guide you through manual test sequence"
echo ""
echo "Press Enter to continue..."
read

# Enable diagnostic mode
export DIAGNOSTIC_MODE=true

echo "✓ DIAGNOSTIC_MODE enabled"
echo ""
echo "=========================================="
echo "MANUAL TEST SEQUENCE"
echo "=========================================="
echo ""
echo "PART 1: GOALS SAVE TRACE"
echo "------------------------"
echo "1. Navigate to the Goals Engine tab in the app"
echo "2. Change 'Earnings per Day' goal to 507"
echo "3. Click 'Save Goals'"
echo "4. Watch the console logs for [DX-GOALS] traces"
echo "5. Look for:"
echo "   - Request payload"
echo "   - db.before state"
echo "   - db.after state"
echo "   - Immediate verification read"
echo ""
echo "Press Enter when complete..."
read

echo ""
echo "PART 2: TRADING MODE TOGGLE TRACE"
echo "----------------------------------"
echo "1. Click the Trading toggle to start Paper mode"
echo "2. Watch the console logs for [DX-TRADING] traces"
echo "3. Look for:"
echo "   - Request payload"
echo "   - system_context.before"
echo "   - system_context.after"
echo "   - WS event emission"
echo "4. Try to switch to Live mode (if available)"
echo "5. Note if buttons are disabled and capture tooltip/error"
echo ""
echo "Press Enter when complete..."
read

echo ""
echo "PART 3: DATABASE DIAGNOSTICS"
echo "-----------------------------"
echo "Run these SQL queries in the database console:"
echo ""
cat server/diagnostics/phase27dx_queries.sql
echo ""
echo "Copy the output to reports/PHASE_27_DX_TRACE.md"
echo ""
echo "Press Enter when complete..."
read

echo ""
echo "PART 4: FRONTEND CONSOLE LOGS"
echo "------------------------------"
echo "1. Open browser DevTools (F12)"
echo "2. Check Console tab for errors"
echo "3. Check Network tab for failed requests"
echo "4. Look for:"
echo "   - Any errors on /api/trading/status or /api/goals"
echo "   - WebSocket trading_state_changed events"
echo "   - Button disabled states"
echo ""
echo "Press Enter when complete..."
read

echo ""
echo "=========================================="
echo "DIAGNOSTIC COLLECTION COMPLETE"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Gather all console logs from server"
echo "2. Gather all frontend console/network logs"
echo "3. Gather SQL query results"
echo "4. Compile into reports/PHASE_27_DX_TRACE.md"
echo ""
echo "To disable diagnostic mode:"
echo "  unset DIAGNOSTIC_MODE"
echo "  (or restart server without the env var)"
echo ""
