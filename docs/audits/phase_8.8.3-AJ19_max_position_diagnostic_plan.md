# Phase 8.8.3-AJ19: Max Position Guardrail Diagnostic Plan

## Problem Statement

Based on user evidence from AJ18 diagnostic session:
- **16,636 total execution attempts**
- **15 trades opened** (0.1% success rate)
- **16,292 MAX_POSITION blocks** (99.9% of all blocks)
- Other block reasons: negligible

The MAX_POSITION guardrail (from `checkPositionSizeCap()`) is blocking nearly all RTB signals after initial trades open successfully.

## Block Reason Clarification

| Block Code | Function | Description |
|------------|----------|-------------|
| `MAX_POSITION` | `checkPositionSizeCap()` | Position value exceeds `maxPositionPercent`% of portfolio |
| `MAX_TRADES` | `checkMaxOpenTrades()` | Total open trades count >= `maxOpenTrades` |
| `POSITION_LIMIT` | `checkMaxPositionsPerAsset()` | Already have position in same symbol |

## Root Cause Hypotheses

### H1: Portfolio Value Inconsistency
P2 (sizing) uses one portfolio value, but P3 (guardrail check) uses a different value, causing properly-sized trades to fail the % check.

### H2: Pre-Computed Notional Missing
Signals reaching P3 without pre-computed notional from P2, forcing recalculation that differs from original sizing.

### H3: Max Position Percent Too Low
The `maxPositionPercent` guardrail setting might be too restrictive for the risk % being used.

### H4: Position Size Accumulation
The check might be using cumulative position values instead of individual trade values.

## AJ19 Implementation

### Diagnostic Service (`server/services/aj19-max-position-diagnostic.ts`)

A singleton service that:
1. Logs every position size check with full details
2. Tracks P2 sizing values vs P3 validation values
3. Identifies portfolio value mismatches
4. Tracks missing pre-computed notional flags
5. Supports dry-run mode (log but don't block)

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/diagnostics/aj19/status` | GET | Get diagnostic status and summary |
| `/api/diagnostics/aj19/enable` | POST | Enable/disable diagnostic logging |
| `/api/diagnostics/aj19/dry-run` | POST | Toggle dry-run mode |
| `/api/diagnostics/aj19/entries` | GET | Get recent diagnostic entries |
| `/api/diagnostics/aj19/export` | GET | Export full diagnostic data |
| `/api/diagnostics/aj19/clear` | POST | Clear diagnostic data |

### Modified Files

- `server/services/trade-safety.ts`: Added AJ19 logging to `checkPositionSizeCap()`
- `server/services/aj19-max-position-diagnostic.ts`: New diagnostic service
- `server/routes.ts`: Added AJ19 API endpoints

## Testing Protocol

### Step 1: Enable Diagnostic
```bash
curl -X POST http://localhost:5000/api/diagnostics/aj19/enable \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'
```

### Step 2: Run Trading Session
Start paper trading and let it run for 5-10 minutes until RTB starvation begins.

### Step 3: Check Summary
```bash
curl http://localhost:5000/api/diagnostics/aj19/status \
  -H "Authorization: Bearer $TOKEN"
```

### Step 4: Analyze Blocked Entries
Look for patterns in:
- `portfolioValueMismatch` flags
- `preComputedNotionalMissing` flags
- P3 vs P2 value discrepancies

### Step 5: Test Dry-Run Mode
If MAX_POSITION is confirmed as the blocker, enable dry-run to verify signals would pass:
```bash
curl -X POST http://localhost:5000/api/diagnostics/aj19/dry-run \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'
```

## Expected Outcomes

1. **Diagnostic Data**: Collect detailed position sizing data across P2/P3 pipeline
2. **Root Cause Identification**: Pinpoint exactly why MAX_POSITION is blocking
3. **Fix Validation**: Use dry-run mode to prove fix effectiveness before permanent changes

## Success Criteria

- Identify specific cause of MAX_POSITION blocks
- Document fix in subsequent phase
- Restore RTB signal flow to expected levels (10-20 signals per cycle)

---

**Phase Status**: IMPLEMENTED  
**Date**: 2025-12-03  
**Files Modified**: 3  
**API Endpoints Added**: 6
