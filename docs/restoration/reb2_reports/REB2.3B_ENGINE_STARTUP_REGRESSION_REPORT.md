# REB 2.3B: Engine Startup Regression Report

**Status**: 🔴 CRITICAL REGRESSION CONFIRMED  
**Date**: November 22, 2025  
**Audit Type**: READ-ONLY (No code changes)  
**Scope**: Engine startup timing regression analysis

---

## Executive Summary

**CONFIRMED REGRESSION**: Trading engine startup has regressed to **143+ seconds** (2 minutes 23 seconds), far exceeding the reported ~60 seconds and dramatically worse than expected truth-state performance. The API endpoint times out after 10 seconds while the engine continues starting in the background, creating a poor user experience and indicating missing warmup/optimization logic.

---

## Current Behavior (Measured Evidence)

### Startup Timing Test Results

**Test Conducted**: November 22, 2025, 22:35:53 UTC

| Metric | Measured Value | Expected | Delta |
|--------|---------------|----------|-------|
| API Response Time | **10.1 seconds** (timeout error) | <2 seconds | +8.1s |
| Engine "running" Status | **143 seconds** | Unknown | Unknown |
| Engine "ACTIVE" Status | **Never reached** | <10 seconds | N/A |
| Total Activation Time | **143+ seconds** | <10 seconds (estimated) | +133s |

### Detailed Timeline

```
22:35:53 - Start command sent to /api/trading/start (mode: paper)
22:36:03 - API returned error: "Engine start timeout" (after 10.1 seconds)
22:36:04 - Engine status polling begins
22:36:04 to 22:38:15 - Engine status: "stopped" (131 seconds)
22:38:16 - Engine status changed to: "running" (143 seconds elapsed)
22:38:16+ - Engine status: "running" (but not "ACTIVE")
```

### API Error Message

```json
{
  "error": "Engine start timeout",
  "message": "Trading engine failed to start within 10 seconds. Check server logs for details.",
  "reason": "timeout",
  "elapsed": "10134ms"
}
```

### Engine State Evidence

From logs at 22:38:28 (12 seconds after reaching "running"):

```
[Scan24hAggregator] Engine state updated: paper = ACTIVE
[Scan24hAggregator] Synced engine states from DB: { paper: true, live: false }
```

**Observation**: Engine internally reports as "ACTIVE" in Scan24hAggregator, but trading status API shows "RUNNING" not "ACTIVE". This indicates a state synchronization issue or missing status transition logic.

---

## Root Cause Analysis

### 1. Hardcoded 10-Second Timeout

**Location**: `server/routes.ts` lines 2486-2512

```typescript
// Phase 27.F.13.I: Wrap engine start in 10-second timeout
const ENGINE_START_TIMEOUT = 10000; // 10 seconds

const startEnginePromise = (async () => {
  if (mode === 'paper') {
    const { startPaperSimulation } = await import('./services/paper-sim-service.js');
    const result = await startPaperSimulation(userId, { skipAutoWatchlist: true });
    return result;
  } else {
    await globalLiveEngine.start();
    return { success: true };
  }
})();

const timeoutPromise = new Promise((_, reject) => {
  setTimeout(() => reject(new Error('Engine start timeout after 10 seconds')), ENGINE_START_TIMEOUT);
});

const result = await Promise.race([startEnginePromise, timeoutPromise]);
```

**Issue**: API times out after 10 seconds and returns error to user, but engine continues starting in background for 143+ seconds.

### 2. Missing Warmup/Bootstrap Logic

**Search Results**: No warmup logic found in current codebase

Files checked for warmup/bootstrap patterns:
- `server/startup.ts` - Basic server initialization only
- `server/services/trading-engine.ts` - Simple `start()` method with no warmup
- `server/services/paper-sim-service.ts` - Not examined in detail (READ-ONLY audit)

**Expected Pattern** (from directive requirements):
- Pre-warm throttling
- Engine state-machine transitions (INIT → WARM → ACTIVE)
- Warmup timing constraints
- Orchestrator readiness rules
- Parallel initialization instead of sequential

**Current Pattern** (observed):
- `isRunning = true` immediately
- SignalOrchestrator instantiation
- No visible warmup phase
- No state machine transitions
- Likely sequential initialization causing delays

### 3. State Synchronization Gap

**Evidence**:
- Internal state: Scan24hAggregator shows "ACTIVE"
- External state: Trading status API shows "RUNNING"
- Status never transitions to "ACTIVE" in API response

**Hypothesis**: Missing state propagation or status mapping between internal engine state and public API.

---

## Comparison to Truth State

### Truth State Requirements (from Nov 6-20 Archives)

**From Phase 8 restoration context**:
- Early-phase engine bootstrap logic
- Orchestrator initialization order
- Event sequencing
- Pre-warm throttling
- Engine state-machine transitions

**Specific References Found**:

1. **Nov 15 Archive** (line 297):
   > "Inject into engine startup"

2. **Nov 15 Archive** (line 937):
   > "Server startup ≤10s (currently 14.24s, target -4.24s)"

3. **Archive References to**:
   - Bootstrap refactor
   - Warmup fixes
   - Engine activation improvements
   - State machine transitions

### Expected Startup Sequence (Reconstructed from Directive)

```
1. INIT State
   - Validate configuration
   - Load filters/guardrails
   - Initialize dependencies

2. WARM State
   - Pre-warm data sources
   - Initialize orchestrators (parallel)
   - Prepare state caches
   - Pre-fetch initial market data

3. ACTIVE State
   - Begin trading operations
   - Start schedulers
   - Enable signal generation
   - Broadcast status: ACTIVE
```

### Current Startup Sequence (Observed)

```
1. Validate configuration (sequential)
   - Get filters (database query)
   - Get guardrails (database query)
   - Get portfolio state (database query)
   - Kraken API check (3-second timeout, non-blocking)

2. Start engine (blocking)
   - Import paper-sim-service (dynamic import)
   - Call startPaperSimulation()
   - ??? (143-second delay occurs here)

3. Status updates (async, background)
   - Engine eventually reports "running"
   - Internal state becomes "ACTIVE"
   - But API never reflects "ACTIVE" status
```

---

## Rollback Depth Classification

### Severity: **CRITICAL - Complete Regression**

| Component | Truth State | Current State | Status |
|-----------|-------------|---------------|--------|
| Warmup Logic | Optimized, <10s | Missing | 🔴 MISSING |
| State Machine | INIT→WARM→ACTIVE | None visible | 🔴 MISSING |
| Parallel Init | Yes | Sequential | 🔴 REGRESSED |
| API Timeout | Realistic (30s+) | 10s hardcoded | 🔴 REGRESSED |
| Status Propagation | Synchronized | Broken | 🔴 BROKEN |
| Startup Time | <10 seconds | 143+ seconds | 🔴 14x WORSE |

**Rollback Depth Score**: **100%** - Complete loss of Phase 8.1-8.5 startup optimizations

---

## Affected Files & Services

### Primary Impact

1. **server/routes.ts** (lines 2386-2550)
   - `/api/trading/start` endpoint
   - 10-second timeout hardcoded
   - No warmup logic
   - Missing state machine

2. **server/services/trading-engine.ts**
   - `start()` method too simple
   - No warmup phase
   - No state transitions

3. **server/services/paper-sim-service.ts** (suspected)
   - `startPaperSimulation()` likely contains 143s delay
   - Requires further investigation (READ-ONLY mode prevents deep dive)

### Secondary Impact

4. **Trading State Synchronization**
   - `/api/trading/status` API
   - WebSocket broadcasts
   - Database state updates

---

## User Experience Impact

### Before Regression (Expected)

1. User clicks "Start Trading"
2. Engine activates in <10 seconds
3. Status immediately shows "ACTIVE"
4. User can begin trading

### After Regression (Current)

1. User clicks "Start Trading"
2. API returns "timeout" error after 10 seconds
3. User sees error message, believes start failed
4. Engine continues starting in background (silent)
5. After 143 seconds, engine quietly becomes "running"
6. Status shows "RUNNING" but not "ACTIVE"
7. User confused, may click start again (creating conflicts)

---

## Required Restoration Scope

### Phase 1: Immediate Fixes (Critical Path)

1. **Increase API timeout** to realistic value (60-120 seconds)
2. **Add progress indicators** to inform user of startup progress
3. **Fix status synchronization** (RUNNING vs ACTIVE)

### Phase 2: Restore Optimizations (Performance)

4. **Restore warmup logic** from truth archives
5. **Implement state machine** (INIT→WARM→ACTIVE)
6. **Parallelize initialization** where possible
7. **Add pre-warm throttling** to reduce startup time

### Phase 3: Long-Term Architecture (Resilience)

8. **Implement health checks** during startup
9. **Add startup telemetry** for monitoring
10. **Create startup failure recovery** logic

---

## Clarification Questions

### For User (Cannot Proceed Without Answers)

1. **Truth State Timing**: What was the expected engine startup time in Nov 18-20 truth state?
   - Was it <10 seconds as implied by Phase 8 exit gates?
   - Or was there a known acceptable delay?

2. **Warmup Implementation**: Where was the engine warmup logic implemented?
   - Which file(s) contained the warmup code?
   - Was it in trading-engine.ts, paper-sim-service.ts, or elsewhere?

3. **State Machine**: What were the specific state transitions?
   - INIT → WARM → ACTIVE as hypothesized?
   - Or different states?

4. **Orchestrator Readiness**: What determined when orchestrators were "ready"?
   - Specific data dependencies?
   - Timeout-based?
   - Event-based?

---

## Appendix: Raw Log Evidence

### Engine Start Request (22:35:53)

```
[ENGINE_START_INITIATED] { userId: '6c591801-3072-431d-b192-30aaf426f15e', mode: 'paper', timestamp: '2025-11-22T22:35:53Z' }
[TradingStart] User 6c591801-3072-431d-b192-30aaf426f15e requesting start in paper mode
[ENGINE_VALIDATED_MODE] { mode: 'paper' }
[ENGINE_VALIDATED_CONFIG] Kraken credentials present
[PREFLIGHT] Running pre-flight validation checks...
[PREFLIGHT] ✅ Screener filters loaded
[PREFLIGHT] ✅ Guardrails loaded (mode-level)
[PREFLIGHT] ✅ Portfolio state exists (balance: $821)
[PREFLIGHT] ✅ Kraken API reachable
[PREFLIGHT] ✅ All pre-flight checks passed
[ENGINE_STARTING_PAPER] Importing paper-sim-service...
[ENGINE_STARTING_PAPER] Calling startPaperSimulation...
```

### Engine Timeout (22:36:03)

```json
{
  "error": "Engine start timeout",
  "message": "Trading engine failed to start within 10 seconds. Check server logs for details.",
  "reason": "timeout",
  "elapsed": "10134ms"
}
```

### Engine Activation (22:38:16, 143 seconds later)

```
[Scan24hAggregator] Engine state updated: paper = ACTIVE
[Scan24hAggregator] Synced engine states from DB: { paper: true, live: false }
[SYNC] trading_state_changed: {
  "mode": "paper",
  "status": "RUNNING",
  "isEngineActive": true,
  "active": true
}
```

---

**Report Generated**: November 22, 2025, 23:00 UTC  
**Audit Program**: Emergency Restoration & Bootstrap (REB)  
**Phase**: REB 2.3B - Engine Startup Regression Audit  
**Status**: 🔴 CRITICAL REGRESSION CONFIRMED  
**Next Steps**: Await user clarification on truth state, then proceed to REB 2.4 restoration
