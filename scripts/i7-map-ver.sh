#!/bin/bash
# Phase 8.8.3-I7-MAP-VER - Mapping Verification & Coverage Correlation
# This script is diagnostic-only and does not change trading behavior.

set -e

OUTPUT_DIR="docs/diagnostics/I7-MAP-VER"
mkdir -p "$OUTPUT_DIR"

echo "=========================================="
echo "Phase 8.8.3-I7-MAP-VER - Mapping Verification"
echo "Started at: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "=========================================="

# V1.1 - Get Auth Token
echo ""
echo "[V1.1] Authenticating..."
TOKEN=$(
  curl -s -X POST "http://localhost:5000/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"username":"'"$APP_TEST_USERNAME"'","password":"'"$APP_TEST_PASSWORD"'"}' \
  | jq -r '.token // .accessToken // empty'
)

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "ERROR: Failed to obtain authentication token"
  echo "Make sure APP_TEST_USERNAME and APP_TEST_PASSWORD are set"
  exit 1
fi
echo "  ✓ Authentication successful"

# V1.2 - Capture Core Mapping Diagnostics
echo ""
echo "[V1.2] Capturing core mapping diagnostics..."

echo "  → I7-MAP-AUTO Summary"
curl -s "http://localhost:5000/api/diagnostics/i7-map-auto/summary" \
  -H "Authorization: Bearer $TOKEN" \
  > "$OUTPUT_DIR/map_auto_summary.json"

echo "  → I7-MAP-AUTO Audit"
curl -s "http://localhost:5000/api/diagnostics/i7-map-auto/audit" \
  -H "Authorization: Bearer $TOKEN" \
  > "$OUTPUT_DIR/map_auto_audit.json"

echo "  → I7-MAP-FIX Check"
curl -s "http://localhost:5000/api/diagnostics/i7-map-fix/check" \
  -H "Authorization: Bearer $TOKEN" \
  > "$OUTPUT_DIR/map_fix_check.json" 2>/dev/null || echo '{"ok":false,"error":"endpoint not available"}' > "$OUTPUT_DIR/map_fix_check.json"

echo "  → I7-WS-F Coverage"
curl -s "http://localhost:5000/api/diagnostics/i7-ws-f/coverage" \
  -H "Authorization: Bearer $TOKEN" \
  > "$OUTPUT_DIR/ws_f_coverage.json"

echo "  → Active Trades (Paper Sim)"
curl -s "http://localhost:5000/api/active-engine/active-trades" \
  -H "Authorization: Bearer $TOKEN" \
  > "$OUTPUT_DIR/active_trades.json"

echo "  ✓ Core diagnostics captured"

# V2 - Symbol Correlation & Mismatch Detection
echo ""
echo "[V2] Computing symbol correlation..."

# V2.1 - Extract symbol sets and compute correlation
jq -n --slurpfile active "$OUTPUT_DIR/active_trades.json" \
      --slurpfile audit "$OUTPUT_DIR/map_auto_audit.json" \
      --slurpfile coverage "$OUTPUT_DIR/ws_f_coverage.json" '
  # Extract active symbols from positions (compact format like "FORTHUSD")
  (($active[0].positions // []) | map(.symbol) | unique) as $activeSymbols |
  
  # Extract audit symbols (compact format like "FORTHUSD")
  (($audit[0].symbols // []) | map(.symbol) | unique) as $auditSymbols |
  
  # Extract coverage symbols (internal format like "FORTH/USD")
  (($coverage[0].symbols // []) | map(.internal) | unique) as $coverageSymbols |
  
  # For comparison, also get compact versions from audit
  (($audit[0].symbols // []) | map(.internalSymbol) | unique) as $auditInternalSymbols |
  
  # Compute set differences (using compact format for active vs audit)
  ($activeSymbols - $auditSymbols) as $activeNotInAudit |
  
  # For audit vs coverage, compare internal formats
  ($auditInternalSymbols - $coverageSymbols) as $auditNotInCoverage |
  
  # Coverage symbols not in active (informational)
  (($coverage[0].symbols // []) | map(.kraken_rest) | unique) as $coverageRestSymbols |
  ($coverageRestSymbols - $activeSymbols) as $coverageNotInActive |
  
  {
    timestamp: (now | todate),
    activeSymbolsCount: ($activeSymbols | length),
    auditSymbolsCount: ($auditSymbols | length),
    coverageSymbolsCount: ($coverageSymbols | length),
    activeSymbols: $activeSymbols,
    auditSymbols: $auditSymbols,
    auditInternalSymbols: $auditInternalSymbols,
    coverageSymbols: $coverageSymbols,
    active_not_in_audit: $activeNotInAudit,
    audit_not_in_coverage: $auditNotInCoverage,
    coverage_not_in_active: $coverageNotInActive
  }
' > "$OUTPUT_DIR/correlation_summary.json"

echo "  ✓ Correlation summary computed"

# V2.2 - Create per-symbol matrix
echo ""
echo "[V2.2] Building active symbol matrix..."

# Build the matrix by joining active positions with audit and coverage data
jq -s '
  .[0] as $active |
  .[1] as $audit |
  .[2] as $coverage |
  .[3] as $fix |
  
  # Create audit lookup by symbol
  (($audit.symbols // []) | INDEX(.symbol)) as $auditBySymbol |
  
  # Create coverage lookup by kraken_rest
  (($coverage.symbols // []) | INDEX(.kraken_rest)) as $coverageByRest |
  
  # Create fix lookup by symbol
  (($fix.results // []) | INDEX(.symbol)) as $fixBySymbol |
  
  # Process each active position
  [
    ($active.positions // [])[] |
    .symbol as $sym |
    ($auditBySymbol[$sym] // {}) as $a |
    ($coverageByRest[$sym] // {}) as $c |
    ($fixBySymbol[$sym] // {}) as $f |
    {
      symbol: $sym,
      internalSymbol: $a.internalSymbol,
      map_auto_tier: $a.tier,
      map_auto_status: ($a.status // "not_in_audit"),
      map_auto_tier_reason: $a.tierReason,
      ws_f_coverage_status: ($c.coverage_status // "not_in_coverage"),
      ws_f_subscribed: ($c.subscribed // false),
      ws_f_acked: ($c.acked // false),
      ws_f_first_tick: ($c.first_tick_received // false),
      is_unmappable_in_fix_check: ($f.unmappable // false),
      kraken_ws_pair: ($a.krakenWsPair // $c.kraken_ws),
      kraken_rest_pair: ($a.krakenRestPair // $c.kraken_rest)
    }
  ] | unique_by(.symbol)
' "$OUTPUT_DIR/active_trades.json" \
  "$OUTPUT_DIR/map_auto_audit.json" \
  "$OUTPUT_DIR/ws_f_coverage.json" \
  "$OUTPUT_DIR/map_fix_check.json" \
  > "$OUTPUT_DIR/active_symbol_matrix.json"

echo "  ✓ Active symbol matrix built"

# V3 - 60-Second Live Verification (Skippable with --skip-live flag)
if [ "$1" != "--skip-live" ]; then
  echo ""
  echo "[V3] Running 60-second live verification..."
  
  # V3.1 - Reset diagnostics (optional)
  echo "  → Resetting diagnostics (if available)..."
  curl -s -X POST "http://localhost:5000/api/diagnostics/i7-ws-c/reset" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" > /dev/null 2>&1 || true
  curl -s -X POST "http://localhost:5000/api/diagnostics/i7-ws/reset-tracking" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" > /dev/null 2>&1 || true
  
  # V3.2 - Start fresh simulation
  echo "  → Starting paper simulation..."
  curl -s -X POST "http://localhost:5000/api/active-engine/stop" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" > /dev/null 2>&1 || true
  
  curl -s -X POST "http://localhost:5000/api/active-engine/start" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"mode":"continue"}' \
    > "$OUTPUT_DIR/start_response.json" 2>/dev/null || echo '{"ok":false}' > "$OUTPUT_DIR/start_response.json"
  
  echo "  → Waiting 60 seconds for WebSocket activity..."
  sleep 60
  
  # V3.3 - Capture trace history
  echo "  → Capturing trace history..."
  curl -s -X GET "http://localhost:5000/api/diagnostics/i7-ws-c/trace-history" \
    -H "Authorization: Bearer $TOKEN" \
    > "$OUTPUT_DIR/trace_history_60s.json" 2>/dev/null || echo '{"traces":[],"totalTraces":0}' > "$OUTPUT_DIR/trace_history_60s.json"
  
  # Compute stage distribution
  cat "$OUTPUT_DIR/trace_history_60s.json" | jq '{
    totalTraces: (.totalTraces // (.traces | length)),
    stageCounts: (
      [.traces[]?.stages[]?.stage // empty] |
      group_by(.) |
      map({stage: .[0], count: length}) |
      sort_by(.stage)
    )
  }' > "$OUTPUT_DIR/trace_stage_summary.json" 2>/dev/null || echo '{"totalTraces":0,"stageCounts":[]}' > "$OUTPUT_DIR/trace_stage_summary.json"
  
  # Stop simulation
  curl -s -X POST "http://localhost:5000/api/active-engine/stop" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" > /dev/null 2>&1 || true
  
  echo "  ✓ Live verification complete"
else
  echo ""
  echo "[V3] Skipping live verification (--skip-live flag set)"
  echo '{"skipped":true}' > "$OUTPUT_DIR/trace_history_60s.json"
  echo '{"skipped":true,"totalTraces":0,"stageCounts":[]}' > "$OUTPUT_DIR/trace_stage_summary.json"
fi

# V4 - Generate Human-Readable Report
echo ""
echo "[V4] Generating verification report..."

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Extract key metrics for report
ACTIVE_COUNT=$(jq '.activeSymbolsCount' "$OUTPUT_DIR/correlation_summary.json")
TIER1_COUNT=$(jq '.summary.mapped_tier1 // 0' "$OUTPUT_DIR/map_auto_summary.json")
TIER2_COUNT=$(jq '.summary.mapped_tier2 // 0' "$OUTPUT_DIR/map_auto_summary.json")
TIER3_COUNT=$(jq '.summary.mapped_tier3 // 0' "$OUTPUT_DIR/map_auto_summary.json")
COVERAGE_PCT=$(jq -r '.tier_breakdown.coverage_pct // "N/A"' "$OUTPUT_DIR/map_auto_summary.json")
QUALITY_STATUS=$(jq -r '.quality.status // "UNKNOWN"' "$OUTPUT_DIR/map_auto_summary.json")
TOTAL_MAPPED=$(jq '.summary.total_kraken_pairs // 0' "$OUTPUT_DIR/map_auto_summary.json")

ACTIVE_NOT_AUDIT=$(jq -r '.active_not_in_audit | length' "$OUTPUT_DIR/correlation_summary.json")
AUDIT_NOT_COVERAGE=$(jq -r '.audit_not_in_coverage | length' "$OUTPUT_DIR/correlation_summary.json")

cat > "$OUTPUT_DIR/report.md" << EOF
# Phase 8.8.3-I7-MAP-VER - Mapping Verification Report

## Overview

| Field | Value |
|-------|-------|
| **Run Date** | $TIMESTAMP |
| **Active Trades Count** | $ACTIVE_COUNT |
| **Total Mapped Pairs** | $TOTAL_MAPPED |
| **Tier 1 (Verified)** | $TIER1_COUNT |
| **Tier 2 (Derived)** | $TIER2_COUNT |
| **Tier 3 (Uncertain)** | $TIER3_COUNT |
| **Coverage %** | $COVERAGE_PCT |
| **Quality Status** | $QUALITY_STATUS |

## Per-Symbol Status Table

$(jq -r '
  "| Symbol | Tier | WS Coverage | WS Subscribed | Unmappable |",
  "|--------|------|-------------|---------------|------------|",
  (.[] | "| \(.symbol) | \(.map_auto_tier // "N/A") | \(.ws_f_coverage_status) | \(.ws_f_subscribed) | \(.is_unmappable_in_fix_check) |")
' "$OUTPUT_DIR/active_symbol_matrix.json")

## Correlation Analysis

### Active Symbols Not in Audit
$(jq -r 'if .active_not_in_audit | length == 0 then "✅ None - all active symbols are present in audit" else "⚠️ " + (.active_not_in_audit | join(", ")) end' "$OUTPUT_DIR/correlation_summary.json")

### Audit Symbols Not in WS Coverage
$(jq -r 'if .audit_not_in_coverage | length == 0 then "✅ None - all audited symbols have WS coverage" else "⚠️ " + (.audit_not_in_coverage | join(", ")) end' "$OUTPUT_DIR/correlation_summary.json")

### WS Coverage Symbols Not Active (Informational)
$(jq -r 'if .coverage_not_in_active | length == 0 then "ℹ️ None" else "ℹ️ " + ((.coverage_not_in_active | length | tostring) + " symbols subscribed but not in active trades (normal for pre-subscriptions)") end' "$OUTPUT_DIR/correlation_summary.json")

## Mismatches & Issues

$(jq -r '
  [.[] | select(.map_auto_tier == 3 or .map_auto_tier == null or .is_unmappable_in_fix_check == true)] as $issues |
  if ($issues | length) == 0 then
    "✅ **No issues detected** - All active symbols are Tier 1/2 mapped and not flagged as unmappable."
  else
    "⚠️ **Issues Found:**\n\n" + 
    ($issues | map("- **\(.symbol)**: Tier=\(.map_auto_tier // "null"), Unmappable=\(.is_unmappable_in_fix_check)") | join("\n"))
  end
' "$OUTPUT_DIR/active_symbol_matrix.json")

## Trace Activity Summary (60s Window)

$(jq -r '
  if .skipped == true then
    "ℹ️ Live verification was skipped (--skip-live flag)"
  else
    "- **Total Traces**: \(.totalTraces)\n" +
    "- **Stage Distribution**:\n" +
    (if (.stageCounts | length) == 0 then "  - No stage data captured" else (.stageCounts | map("  - Stage \(.stage): \(.count) events") | join("\n")) end)
  end
' "$OUTPUT_DIR/trace_stage_summary.json")

## Conclusion

$(
  if [ "$ACTIVE_NOT_AUDIT" -eq 0 ] && [ "$AUDIT_NOT_COVERAGE" -eq 0 ] && [ "$QUALITY_STATUS" = "PASS" ]; then
    echo "✅ **CLEAR** - All active symbols are Tier 1/2 mapped and present in WebSocket coverage. I7-MAP-AUTO quality status is PASS."
  else
    echo "⚠️ **ATTENTION REQUIRED** - Review mismatches above. Active not in audit: $ACTIVE_NOT_AUDIT, Audit not in coverage: $AUDIT_NOT_COVERAGE"
  fi
)

---

*This report is diagnostic-only and does not propose code changes. Issues found should be addressed in separate, explicitly approved phases.*
EOF

echo "  ✓ Report generated"

# Summary
echo ""
echo "=========================================="
echo "Verification Complete"
echo "=========================================="
echo ""
echo "Output files:"
echo "  - $OUTPUT_DIR/map_auto_summary.json"
echo "  - $OUTPUT_DIR/map_auto_audit.json"
echo "  - $OUTPUT_DIR/map_fix_check.json"
echo "  - $OUTPUT_DIR/ws_f_coverage.json"
echo "  - $OUTPUT_DIR/active_trades.json"
echo "  - $OUTPUT_DIR/correlation_summary.json"
echo "  - $OUTPUT_DIR/active_symbol_matrix.json"
echo "  - $OUTPUT_DIR/trace_history_60s.json"
echo "  - $OUTPUT_DIR/trace_stage_summary.json"
echo "  - $OUTPUT_DIR/report.md"
echo ""
echo "Quick Summary:"
echo "  Active Trades: $ACTIVE_COUNT"
echo "  Mapping Coverage: $COVERAGE_PCT"
echo "  Quality Status: $QUALITY_STATUS"
echo "  Active Not in Audit: $ACTIVE_NOT_AUDIT"
echo "  Audit Not in Coverage: $AUDIT_NOT_COVERAGE"
echo ""
