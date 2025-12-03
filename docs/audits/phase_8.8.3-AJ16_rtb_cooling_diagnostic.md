# Phase 8.8.3-AJ16: RTB Cooling Diagnostic

**Created:** December 3, 2024  
**Phase:** 8.8.3-AJ16  
**Status:** Implementation Complete

---

## Overview

This phase implements comprehensive diagnostic instrumentation to identify why Ready-To-Buy (RTB) signals dry up after approximately 10 minutes of paper trading activity.

### Problem Statement

Observed behavior:
- Initial RTB signals appear and trades open successfully
- After ~10 minutes, RTB count drops to zero
- 20-70 pairs remain in Active Filtered Pool but none generate signals
- System appears to "cool down" with no new buy opportunities

---

## Implementation Summary

### AJ16.1 - Strategy Signal Output Logging

**File:** `server/services/paper-execution-engine.ts`

Each strategy detection call now logs:
- `[AJ16][STRATEGY_SIGNAL]` - When a strategy emits a signal
- `[AJ16][STRATEGY_NO_SIGNAL]` - When a strategy fails to emit

Logged data includes:
- `cycleId` - Unique identifier for the evaluation cycle
- `pair` - Symbol being evaluated
- `strategy` - Strategy name (vwap_pullback, abcd_long, etc.)
- `signalEmitted` - Boolean indicating if signal was produced
- `price` - Entry price if signal generated
- `signalValue` - Confidence value
- `indicators` - Key indicator values (VWAP, SMA, etc.)

### AJ16.2 - Cooldown Logging

**File:** `server/services/trade-safety.ts`

Cooldown check function instrumented to log:
- `[AJ16][COOLDOWN_CHECK]` - Every cooldown evaluation
- Internal cooldown status
- Guardrail cooldown status
- Remaining cooldown time (in seconds)
- Last trade timestamp

### AJ16.3 - Position Exclusion Logging

**File:** `server/services/paper-execution-engine.ts`

When symbols are skipped due to existing positions:
- `[AJ16][ACTIVE_POSITION_EXCLUDE]` - Logs each exclusion
- Includes position ID and symbol
- Tracks count for diagnostic snapshots

### AJ16.4 - Indicator Sanity Logging

**File:** `server/services/paper-execution-engine.ts`

Validates and logs indicator health:
- `[AJ16][INDICATOR_STATUS]` - Logs indicator values
- Validates VWAP, SMA, price, and volume
- Flags invalid indicators with reason

### AJ16.5 - RTB Generation Logging

**File:** `server/services/paper-execution-engine.ts`

Final gate logging for RTB flow:
- `[AJ16][BECAME_RTB]` - When signal becomes Ready-To-Buy
- `[AJ16][RTB_REJECT]` - When signal is rejected
- Includes strategy, confidence, and rejection reason

### AJ16.6 - 5-Minute Snapshot Export

**File:** `server/services/aj16-rtb-diagnostic.ts`

Automatic snapshots every 5 minutes containing:
- Active filtered pairs count
- Pairs producing signals
- Pairs failing cooldown
- Pairs failing strategies
- Pairs failing guardrails
- RTB generation count
- Open positions count
- Strategy breakdown (signals/no-signals per strategy)
- Top failure reasons

### AJ16.7 - CycleId Tagging

All AJ16 logs include a unique `cycleId` for:
- Replay analysis
- Cross-referencing logs from same evaluation cycle
- Tracking signal flow from detection to execution

### AJ16.8 - Diagnostic Report Generation

**File:** `server/services/aj16-rtb-diagnostic.ts`

Generates comprehensive markdown report containing:
1. Strategy signal production table
2. Top failure reasons
3. Cooldown analysis
4. Position exclusion metrics
5. Indicator health summary
6. RTB flow summary
7. Recent snapshot history
8. Automated diagnosis

---

## API Endpoints

### GET `/api/diagnostics/aj16-rtb`

Returns current diagnostic state:
```json
{
  "ok": true,
  "cycleId": "paper_cycle_123_1733250000000",
  "cycleSummary": {
    "signals": 5,
    "noSignals": 150,
    "cooldownBlocks": 3,
    "positionExclusions": 12,
    "guardrailBlocks": 0,
    "rtbGenerated": 5,
    "rtbRejected": 0
  },
  "strategyStats": {
    "vwap_pullback": { "signals": 2, "noSignals": 20 },
    "breakout": { "signals": 1, "noSignals": 25 }
  },
  "topFailures": [
    { "reason": "failed_criteria", "count": 150 },
    { "reason": "active_position_exists", "count": 12 }
  ],
  "recentSnapshots": [],
  "generatedAt": "2024-12-03T12:00:00.000Z"
}
```

### GET `/api/diagnostics/aj16-rtb/report`

Returns full markdown diagnostic report (Content-Type: text/markdown)

### POST `/api/diagnostics/aj16-rtb/snapshot`

Forces immediate snapshot capture regardless of 5-minute interval.

---

## Diagnostic Service Class

**File:** `server/services/aj16-rtb-diagnostic.ts`

Key methods:
- `startCycle(mode)` - Start new evaluation cycle
- `getCycleId()` - Get current cycle identifier
- `logStrategySignal(data)` - Log strategy evaluation
- `logCooldownCheck(data)` - Log cooldown check
- `logPositionExclusion(data)` - Log position skip
- `logIndicatorStatus(data)` - Log indicator health
- `logRTBEvent(data)` - Log RTB generation/rejection
- `logGuardrailBlock(cycleId, symbol, code, reason)` - Log guardrail block
- `captureSnapshot(mode, data)` - Auto-capture (5-min interval)
- `forceSnapshot(mode, data)` - Force immediate capture
- `getRecentSnapshots(limit)` - Get snapshot history
- `getStrategyStats()` - Get strategy statistics
- `getTopFailureReasons(limit)` - Get failure breakdown
- `getCycleSummary()` - Get current cycle counts
- `generateDiagnosticReport()` - Generate markdown report
- `resetStats()` - Reset all statistics

---

## Expected Diagnostic Insights

The AJ16 diagnostic will help identify:

1. **Strategy Misfires** - Which strategies never fire and why
2. **Cooldown Choking** - If cooldowns block too many signals
3. **Position Saturation** - If max positions quickly fills up
4. **Indicator Staleness** - If indicator data becomes invalid
5. **Guardrail Blocks** - If risk checks block valid signals

---

## Log Format Examples

```
[AJ16][CYCLE_START] mode=paper | cycleId=paper_cycle_42_1733250000000
[AJ16][ACTIVE_POSITION_EXCLUDE] symbol=BTC/USD | reason="already_has_open_position" | existingPositionId=123 | cycleId=paper_cycle_42_1733250000000
[AJ16][INDICATOR_STATUS] pair=ETH/USD | vwap=2500.00 | sma=2480.50 | price=2510.00 | vol24h=1500000 | valid=true | cycleId=paper_cycle_42_1733250000000
[AJ16][STRATEGY_NO_SIGNAL] pair=ETH/USD | strategy=vwap_pullback | reason="failed_criteria" | indicators={"vwap":2500,"pctFromVwap":"0.40"} | cycleId=paper_cycle_42_1733250000000
[AJ16][STRATEGY_SIGNAL] pair=SOL/USD | strategy=breakout | price=180.50 | cooldownOk=true | riskOk=true | signalValue=0.75 | reason="met_criteria" | cycleId=paper_cycle_42_1733250000000
[AJ16][BECAME_RTB] pair=SOL/USD | strategy=breakout | confidence=0.75 | reason="signal_enqueued_to_rtb_list" | cycleId=paper_cycle_42_1733250000000
[AJ16][COOLDOWN_CHECK] symbol=BTC/USD | internalCooldown=false | guardrailCooldown=true | cooldownRemaining=180sec | cycleId=paper_cycle_42_1733250000000
[AJ16][SNAPSHOT] timestamp=2024-12-03T12:05:00.000Z | mode=paper | activePairs=45 | signals=3 | noSignals=378 | cooldownBlocks=5 | positionExclusions=15 | guardrailBlocks=0 | RTB=3 | openPositions=3
```

---

## Files Modified

| File | Changes |
|------|---------|
| `server/services/aj16-rtb-diagnostic.ts` | New diagnostic service (created) |
| `server/services/paper-execution-engine.ts` | Added AJ16 logging instrumentation |
| `server/services/trade-safety.ts` | Added cooldown logging |
| `server/routes.ts` | Added API endpoints |

---

## Usage

1. Start the paper trading engine
2. Monitor logs with `[AJ16]` prefix
3. Wait for snapshots to accumulate (5-minute intervals)
4. Access `/api/diagnostics/aj16-rtb` for JSON data
5. Access `/api/diagnostics/aj16-rtb/report` for markdown report

---

## Next Steps

After collecting diagnostic data:
1. Analyze strategy signal rate per strategy
2. Identify dominant failure reasons
3. Check if position exclusions dominate after initial trades
4. Review cooldown configuration impact
5. Consider strategy parameter adjustments based on findings
