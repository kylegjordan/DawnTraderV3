# Phase 8.8.3-J2: Execution Diagnostics Audit

**Date**: December 2, 2025  
**Status**: DIAGNOSTIC ONLY (No fixes applied)  
**Purpose**: Trace why P2 → P3 never fires (no trades execute despite FX5 survivors)

---

## Executive Summary

The execution pipeline stalls at the **ACTIVE POOL GATING** stage because:

1. **Engine is NOT running** (`isRunning=false`)
2. **Passive Learning Mode Active** (engine stopped = passive mode)
3. **Active Pool Cleared** by `enforcePassiveModeIfStopped()` after each FX5 cycle
4. **Empty Pool = No Execution** - `scanForSignals()` exits early when pool empty

**ROOT CAUSE**: The trading engine must be explicitly STARTED for execution to occur. While stopped, the system operates in "passive learning mode" which intentionally clears the active pool to prevent trades.

---

## Pipeline Architecture Map

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          EXECUTION PIPELINE FLOW                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐    ┌──────────────────┐    ┌─────────────────────────┐   │
│  │  FX5 SCANNER │───>│  ACTIVE FILTER   │───>│  PAPER EXECUTION ENGINE │   │
│  │   (P0.5)     │    │     POOL (P1)    │    │      (P2/P3)            │   │
│  └──────────────┘    └──────────────────┘    └─────────────────────────┘   │
│        │                     │                         │                    │
│        │                     │                         │                    │
│  Evaluates 60         enforcePassive          scanForSignals()             │
│  symbols per cycle    ModeIfStopped()         checkSymbolForSignal()       │
│        │                     │                executeSimulatedTrade()       │
│        ▼                     ▼                         │                    │
│  17 survivors          POOL CLEARED                   │                    │
│  (paper mode)         (isRunning=false)               │                    │
│                              │                         ▼                    │
│                              └────────────> activePool.length === 0        │
│                                             Early return (line 363)        │
│                                             NO EXECUTION ATTEMPTS          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Critical Stall Points

### Stall Point 1: Engine STOPPED State

**Location**: `server/services/paper-execution-engine.ts:18`

```typescript
private isRunning: boolean = false;  // Default is STOPPED
```

**Evidence from logs**:
```
[Addendum-K.4.1] PaperDataSource = Database (balance: $862, strategies: 8, engine: stopped)
GET /api/paper-sim/status 304 :: {"isRunning":false,"sessionInfo":null,…
```

**Impact**: When `isRunning=false`:
- `start()` not called → `monitoringCycle()` never starts
- Even if FX5 populates survivors, they cannot be evaluated

---

### Stall Point 2: Passive Learning Mode Enforcement

**Location**: `server/services/active-filter-pool.ts:234-241`

```typescript
enforcePassiveModeIfStopped(mode: 'paper' | 'live', isEngineRunning: boolean): void {
  if (!isEngineRunning) {
    const pool = this.getPool(mode);
    if (pool.size > 0) {
      console.log(`[8.6.7][DEBUG] Engine stopped for ${mode} - clearing Active Pool (passive mode enforcement)`);
      this.clearPool(mode);
    }
  }
}
```

**Evidence from logs**:
```
[REB 2.8.7][ActivePool] Engine stopped - pool cleared (passive learning mode)
```

**Impact**: After every FX5 cycle, if engine is stopped, the active pool is cleared.

---

### Stall Point 3: Empty Active Pool Gate

**Location**: `server/services/paper-execution-engine.ts:363-374`

```typescript
// Get pairs from Active Filter Pool
const activePool = activeFilterPool.getActivePool(this.mode);

if (activePool.length === 0) {
  // [REB 2.2.6][PASSIVE_LEARNING] No symbols to evaluate when pool empty
  console.log(`[PaperExecution:${this.mode}] No symbols in active pool - passive learning mode`);
  return;  // <-- EARLY EXIT: No execution attempts possible
}
```

**Impact**: When `activePool.length === 0`, `scanForSignals()` returns immediately without evaluating any symbols or generating any signals.

---

### Stall Point 4: Strategy Evaluation Gap (Secondary Issue)

**Location**: `server/services/paper-execution-engine.ts:541-562`

**Problem**: Only 3 of 9 strategies are being evaluated in `checkSymbolForSignal()`:

| # | Strategy | Called in checkSymbolForSignal? | Line |
|---|----------|--------------------------------|------|
| 1 | vwap_pullback | ✅ YES | 541 |
| 2 | abcd_long | ✅ YES | 548 |
| 3 | sma_trend_ride | ✅ YES | 555 |
| 4 | breakout | ❌ NO | - |
| 5 | mean_reversion | ❌ NO | - |
| 6 | range_trading | ❌ NO | - |
| 7 | vwap_bounce | ❌ NO | - |
| 8 | liquidity_trap | ❌ NO | - |
| 9 | dhma | ❌ NO | - |

**Impact**: Even if the engine was running, 6 strategies would never generate signals in the paper execution engine.

**Note**: Other components (signal-orchestrator.ts, stage-b-validator.ts, market-scanner.ts) DO evaluate all 9 strategies, but these are NOT wired into the P2→P3 execution path.

---

## Data Flow Trace

### FX5 Scanner Output (P0.5)

```json
{
  "cycle": 407,
  "mode": "paper",
  "totals": { "evaluated": 60, "survived": 17 },
  "breakdown": {
    "failedPrice": 27,
    "failedRange": 5,
    "failedSpread": 5,
    "failedStablecoin": 2,
    "failedHistory": 4,
    "passed": 17
  }
}
```

**Observation**: FX5 correctly finds 17 eligible pairs for paper mode.

---

### Active Pool State (P1)

After `enforcePassiveModeIfStopped()`:
```json
{
  "activePoolCount": 0
}
```

**Observation**: Despite 17 survivors from FX5, the pool is cleared because engine is stopped.

---

### Paper Execution Engine (P2/P3)

`scanForSignals()` behavior:
```
1. Gets activePool (empty due to passive mode enforcement)
2. Checks activePool.length === 0 (TRUE)
3. Logs "[PaperExecution:paper] No symbols in active pool - passive learning mode"
4. Returns early (line 374)
5. No checkSymbolForSignal() calls made
6. No executeSimulatedTrade() calls made
```

---

## Decision Tree: Why No Trades Execute

```
START: User observes no trades executing
       │
       ├─ Q1: Is engine STARTED?
       │       │
       │       ├─ NO ──────────────────────────────────► STALL: Engine not running
       │       │                                         (This is the current state)
       │       │
       │       └─ YES
       │           │
       │           ├─ Q2: Is kill switch tripped?
       │           │       │
       │           │       ├─ YES ──────────────────────► STALL: Kill switch active
       │           │       │
       │           │       └─ NO
       │           │           │
       │           │           ├─ Q3: activePool.length > 0?
       │           │           │       │
       │           │           │       ├─ NO ───────────► STALL: FX5 not finding survivors
       │           │           │       │
       │           │           │       └─ YES
       │           │           │           │
       │           │           │           ├─ Q4: openPositions < maxPositions?
       │           │           │           │       │
       │           │           │           │       ├─ NO ► STALL: Max positions reached
       │           │           │           │       │
       │           │           │           │       └─ YES
       │           │           │           │           │
       │           │           │           │           ├─ Q5: Any strategy generates signal?
       │           │           │           │           │       │
       │           │           │           │           │       ├─ NO ► STALL: No signals
       │           │           │           │           │       │
       │           │           │           │           │       └─ YES
       │           │           │           │           │           │
       │           │           │           │           │           ├─ Q6: checkGuardrailRisk() passes?
       │           │           │           │           │           │       │
       │           │           │           │           │           │       ├─ NO ► BLOCKED by guardrails
       │           │           │           │           │           │       │
       │           │           │           │           │           │       └─ YES
       │           │           │           │           │           │           │
       │           │           │           │           │           │           └─► TRADE EXECUTES
```

---

## File References

| File | Lines | Description |
|------|-------|-------------|
| `server/services/paper-execution-engine.ts` | 18 | `isRunning` flag definition |
| `server/services/paper-execution-engine.ts` | 39-66 | `start()` method |
| `server/services/paper-execution-engine.ts` | 79-85 | `monitoringCycle()` entry |
| `server/services/paper-execution-engine.ts` | 329-374 | `scanForSignals()` with empty pool check |
| `server/services/paper-execution-engine.ts` | 541-562 | `checkSymbolForSignal()` - only 3 strategies |
| `server/services/paper-execution-engine.ts` | 671 | `executeSimulatedTrade()` call |
| `server/services/paper-execution-engine.ts` | 746-1099 | `executeSimulatedTrade()` implementation |
| `server/services/active-filter-pool.ts` | 221-242 | `clearPool()` and `enforcePassiveModeIfStopped()` |
| `server/services/fx5-scanner.ts` | 201-211 | Active pool population (blocked when engine stopped) |
| `server/services/signal-orchestrator.ts` | 363-473 | All 9 strategies called (but not wired to P2→P3) |

---

## Proposed Fixes (NOT IMPLEMENTED - Pending User Review)

### Fix 1: Start Engine on Demand
The engine must be explicitly started by user action (clicking Start button) or by configuration change to enable execution.

### Fix 2: Wire All 9 Strategies
Add the missing 6 strategies to `checkSymbolForSignal()` in paper-execution-engine.ts:
- detectBreakout
- detectMeanReversion
- detectRangeTrading
- detectVWAPBounce
- detectLiquidityTrap
- detectDHMA

### Fix 3: Alternative Execution Path
Consider wiring signal-orchestrator.ts (which evaluates all 9 strategies) directly to executeSimulatedTrade() in paper-execution-engine.ts.

---

## Constraints Applied

1. **Diagnostic Only**: No code changes made during this audit
2. **Isolation Maintained**: Diagnostic modules remain separate from trading operations
3. **No Behavior Changes**: System behavior unchanged by this analysis
4. **Guardrails Intact**: `checkGuardrailRisk()` remains the single pre-trade validation gate

---

## Next Steps

1. **User Review**: Share findings with user for approval before any fixes
2. **Engine Start Fix**: Ensure engine can be started reliably from UI
3. **Strategy Gap Fix**: Add missing 6 strategies to checkSymbolForSignal()
4. **Verification**: After fixes, run execution audit to confirm P2→P3 fires

---

## Appendix: Log Evidence

### Engine Status
```
[Addendum-K.4.1] PaperDataSource = Database (balance: $862, strategies: 8, engine: stopped)
GET /api/paper-sim/status 304 :: {"isRunning":false,"sessionInfo":null,…
```

### Active Pool Clearing
```
[REB 2.8.7][ActivePool] Engine stopped - pool cleared (passive learning mode)
activePoolCount: 0
```

### FX5 Cycle Success
```
[REB2.10][CycleSummary] {"cycle":407,"mode":"paper","totals":{"evaluated":60,"survived":17}}
```

### Stage3 Cache State
```
[Stage3Cache] Updated paper state: {
  cycleId: 1,
  evaluatedCount: 60,
  eligibleCount: 17,
  ineligibleCount: 43,
  activePoolCount: 0,  <-- ZERO despite 17 survivors
  krakenUniverseSize: 1392
}
```
