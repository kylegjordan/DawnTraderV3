# Phase 8.8.3-J3: Execution Engine Start Wiring & Passive Mode Fix

**Date**: December 2, 2025  
**Status**: IN PROGRESS  
**Scope**: Strictly limited to engine start/stop wiring and passive mode clearing

---

## J3.1 — Execution Engine State Audit

### Engine State Storage Locations

| Location | Type | Purpose |
|----------|------|---------|
| `paper-execution-engine.ts:isRunning` | Local (in-memory) | Tracks if engine loop is actively running |
| `paper-portfolio-manager.ts:isRunning` | Local (in-memory) | Tracks if portfolio manager is active |
| `storage.getSystemContext(mode).isEngineActive` | Database | **Canonical source of truth** for trading state |

### APIs That Affect Engine State

| API Endpoint | Effect |
|--------------|--------|
| `POST /api/trading/start?mode=paper` | Starts paper trading, sets `isEngineActive=true` |
| `POST /api/trading/stop?mode=paper` | Stops paper trading, sets `isEngineActive=false` |
| `POST /api/trading/force-stop` | Admin force stop, sets `isEngineActive=false` |

### Start Flow Trace

```
POST /api/trading/start?mode=paper
    │
    ├─► routes.ts:2614 → startPaperSimulation(userId, options)
    │       │
    │       └─► paper-sim-service.ts:266 → Creates PaperPortfolioManager
    │               │
    │               └─► paper-portfolio-manager.ts:68 → start()
    │                       │
    │                       ├─► Sets this.isRunning = true (line 82)
    │                       │
    │                       └─► paper-execution-engine.ts:39 → start()
    │                               │
    │                               └─► Sets this.isRunning = true (line 45)
    │                                   Starts monitoringInterval (line 60-62)
    │
    └─► routes.ts:2666 → storage.updateSystemContext(mode, { isEngineActive: true })
```

### Stop Flow Trace

```
POST /api/trading/stop?mode=paper
    │
    ├─► routes.ts:2774 → stopPaperSimulation(userId)
    │       │
    │       └─► paper-sim-service.ts → manager.stop()
    │               │
    │               └─► paper-portfolio-manager.ts:127 → stop()
    │                       │
    │                       ├─► Sets this.isRunning = false
    │                       │
    │                       └─► paper-execution-engine.ts:68 → stop()
    │                               │
    │                               └─► Sets this.isRunning = false
    │
    ├─► routes.ts:2785 → activeFilterPool.enforcePassiveModeIfStopped(mode, false)
    │       │
    │       └─► CLEARS the active pool immediately
    │
    └─► routes.ts:2792 → storage.updateSystemContext(mode, { isEngineActive: false })
```

### FX5 Scanner Interaction

```
FX5 Scanner (30-second interval)
    │
    ├─► fx5-scanner.ts:198 → context = storage.getSystemContext(mode)
    │
    ├─► fx5-scanner.ts:199 → isEngineActive = context?.isEngineActive || false
    │
    ├─► fx5-scanner.ts:202 → activeFilterPool.enforcePassiveModeIfStopped(mode, isEngineActive)
    │       │
    │       ├─► IF isEngineActive=false → CLEARS pool
    │       │
    │       └─► IF isEngineActive=true → Pool preserved
    │
    └─► fx5-scanner.ts:205-212 → Only populates pool if isEngineActive=true
```

### Key Finding: The Flow IS Correct

The wiring from UI start/stop to engine state IS working correctly:

1. ✅ `/api/trading/start` calls `startPaperSimulation`
2. ✅ `startPaperSimulation` starts `PaperPortfolioManager.start()`
3. ✅ `PaperPortfolioManager.start()` starts `PaperExecutionEngine.start()`
4. ✅ `PaperExecutionEngine.start()` sets `isRunning=true` and starts the monitoring loop
5. ✅ Then `isEngineActive=true` is set in the database

### Verified Issues (from live logs)

The current logs show:
```
[Addendum-K.4.1] PaperDataSource = Database (balance: $862, strategies: 8, engine: stopped)
GET /api/paper-sim/status :: {"isRunning":false,"sessionInfo":null,…
[REB 2.8.7][ActivePool] Engine stopped - pool cleared (passive learning mode)
```

This confirms the engine is currently STOPPED and the wiring is working - the issue is simply that the engine hasn't been started by the user yet.

---

## J3.2 — Fix Engine Start/Stop Wiring

**Status**: VERIFIED - Wiring is correct

The current implementation correctly:
1. Sets `paper-execution-engine.isRunning=true` when user starts trading
2. Sets `isEngineActive=true` in database after engine starts
3. Sets both flags to `false` when user stops trading
4. FX5 scanner respects the database `isEngineActive` flag

**No changes needed to basic wiring** - the system is correctly designed.

---

## J3.3 — Fix Passive Mode Clearing Behavior

**Issue Identified**: When FX5 scanner runs, it always calls:
```typescript
activeFilterPool.enforcePassiveModeIfStopped(mode, isEngineActive);
```

This is CORRECT behavior - when `isEngineActive=false`, the pool should be cleared.

**When engine IS running (`isEngineActive=true`)**:
- Pool is NOT cleared by `enforcePassiveModeIfStopped`
- FX5 adds survivors to the pool
- Paper execution engine can scan the pool

**When engine IS NOT running (`isEngineActive=false`)**:
- Pool IS cleared (passive learning mode)
- This prevents unintended trades
- This is CORRECT behavior

---

## Verification Steps

### Before Fix (Current State)

1. Engine is STOPPED (`isRunning=false`, `isEngineActive=false`)
2. FX5 scanner finds 17 eligible pairs
3. But pool is cleared because `isEngineActive=false`
4. Paper execution engine sees empty pool, exits early
5. No trades execute

### After User Starts Engine

1. User clicks "Start Trading"
2. `PaperExecutionEngine.isRunning=true`
3. Database `isEngineActive=true`
4. FX5 scanner sees `isEngineActive=true`
5. Pool is populated with survivors
6. Paper execution engine scans pool for signals
7. Trades can execute

---

## Files Modified

| File | Changes |
|------|---------|
| `server/services/paper-execution-engine.ts` | Added J3.4 diagnostic logging |
| `docs/audits/phase_8.8.3-J3_execution_engine_fix.md` | This document |

---

## Appendix: Code References

### paper-execution-engine.ts (Engine Start)
```typescript
async start(): Promise<void> {
  if (this.isRunning) {
    console.log(`[PaperExecution:${this.mode}] Already running`);
    return;
  }
  this.isRunning = true;  // ← Local state set
  // ...
  this.monitoringInterval = setInterval(async () => {
    await this.monitoringCycle();
  }, this.MONITOR_INTERVAL_MS);
}
```

### fx5-scanner.ts (Passive Mode Check)
```typescript
const context = await storage.getSystemContext(mode);
const isEngineActive = context?.isEngineActive || false;

activeFilterPool.enforcePassiveModeIfStopped(mode, isEngineActive);

if (isEngineActive) {
  const poolStats = activeFilterPool.addSurvivors(mode, survivors);
} else {
  console.log(`[REB 2.8.7][ActivePool] Engine stopped - pool cleared (passive learning mode)`);
}
```

### active-filter-pool.ts (Pool Clearing)
```typescript
enforcePassiveModeIfStopped(mode: 'paper' | 'live', isEngineRunning: boolean): void {
  if (!isEngineRunning) {
    const pool = this.getPool(mode);
    if (pool.size > 0) {
      this.clearPool(mode);
    }
  }
}
```
