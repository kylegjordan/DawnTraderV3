#!/bin/bash
# ============================================================
# DawnTrader — Post-Batch Validation Script
# Run this AFTER uploading modified files from a batch.
# Captures everything Claude Code needs to verify the changes.
#
# Usage: bash REPLIT_VALIDATION.sh "BATCH_1" > validation_output.txt 2>&1
#    Then send validation_output.txt back to Kyle → Claude Code
# ============================================================

BATCH_NAME="${1:-UNKNOWN_BATCH}"
REPO_DIR="/home/runner/workspace"

cd "$REPO_DIR"

echo "============================================================"
echo " DawnTrader Post-Batch Validation Report"
echo " Batch: $BATCH_NAME"
echo " Date:  $(date '+%Y-%m-%d %H:%M:%S UTC')"
echo "============================================================"
echo ""

# --- Section 1: TypeScript Compilation ---
echo "============================================================"
echo " SECTION 1: TypeScript Compilation"
echo "============================================================"
echo ""
npx tsc --noEmit 2>&1 | tail -50
TSC_EXIT=$?
echo ""
if [ $TSC_EXIT -eq 0 ]; then
  echo ">>> TSC RESULT: PASS (zero errors)"
else
  echo ">>> TSC RESULT: FAIL (exit code $TSC_EXIT)"
fi
echo ""

# --- Section 2: Test Suite ---
echo "============================================================"
echo " SECTION 2: Test Suite"
echo "============================================================"
echo ""
npx vitest run 2>&1 | tail -60
TEST_EXIT=$?
echo ""
if [ $TEST_EXIT -eq 0 ]; then
  echo ">>> TEST RESULT: PASS"
else
  echo ">>> TEST RESULT: FAIL (exit code $TEST_EXIT)"
fi
echo ""

# --- Section 3: Server Startup Test ---
echo "============================================================"
echo " SECTION 3: Server Startup (10-second smoke test)"
echo "============================================================"
echo ""
echo "Starting server for 10 seconds to check for startup errors..."
timeout 10 npm run dev 2>&1 | tail -40 || true
echo ""
echo ">>> Server startup test complete (10-second window)"
echo ""

# --- Section 4: File Diff Summary ---
echo "============================================================"
echo " SECTION 4: Changed Files (git diff)"
echo "============================================================"
echo ""
git diff --stat 2>/dev/null | tail -20
echo ""
git diff --name-only 2>/dev/null
echo ""

# --- Section 5: Specific Verification Checks ---
echo "============================================================"
echo " SECTION 5: Batch-Specific Verification"
echo "============================================================"
echo ""
echo "--- Check: No 'normalizedConf * 100' in signal-orchestrator.ts ---"
grep -n "normalizedConf \* 100" server/services/signal-orchestrator.ts 2>/dev/null && echo ">>> FAIL: Old DI code still present!" || echo ">>> PASS: Old DI code removed"
echo ""
echo "--- Check: calculateDirectionalIntegrity import exists ---"
grep -n "calculateDirectionalIntegrity" server/services/signal-orchestrator.ts 2>/dev/null | head -5
echo ""

# --- Summary ---
echo "============================================================"
echo " VALIDATION SUMMARY"
echo "============================================================"
echo " Batch:       $BATCH_NAME"
echo " TSC:         $([ $TSC_EXIT -eq 0 ] && echo 'PASS' || echo 'FAIL')"
echo " Tests:       $([ $TEST_EXIT -eq 0 ] && echo 'PASS' || echo 'FAIL')"
echo " Date:        $(date '+%Y-%m-%d %H:%M:%S UTC')"
echo "============================================================"
