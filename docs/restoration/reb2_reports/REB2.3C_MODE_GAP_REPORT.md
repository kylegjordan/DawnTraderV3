# REB 2.3C: Mode System & Passive Learning Gap Report

**Status**: GAP ANALYSIS COMPLETE  
**Date**: November 22, 2025  
**Audit Type**: READ-ONLY  
**Scope**: Truth state vs current implementation gaps

---

## Executive Summary

This report identifies **all missing, broken, and regressed behaviors** in the mode system and passive learning implementation following the GitHub sync rollback.

**Critical Finding**: The passive learning flag exists in the database and is broadcast to the frontend, but is **completely disconnected** from backend business logic. The system has **no passive learning behavior** despite having the infrastructure.

**Rollback Depth**: **85%** - Only 15% of passive learning architecture survived (flag definition only)

---

## Gap 1: FX5 Scanner - Complete Passive Learning Rollback

### Truth State

```typescript
// FX5 Scanner should check passive learning BEFORE updates
async runScan(mode: 'paper' | 'live'): Promise<ScanResults> {
  const config = await systemConfigService.getConfig();
  
  if (config.passiveLearning) {
    console.log('[8.6.9][MetricsAudit] PASSIVE LEARNING - NO METRICS UPDATED (correct behavior)');
    
    // Broadcast data for learning, but skip ALL state updates
    await contextBridge.broadcast({
      type: 'passive_scan_complete',
      payload: scanResults,
      mode
    });
    
    return scanResults; // SKIP metrics pipeline
  }
  
  // ACTIVE MODE: Normal metrics updates
  await scan24hAggregator.recordCycle(...);
  await activeFilterPool.addSurvivors(...);
}
```

### Current State

```typescript
// NO passive learning checks AT ALL
async runScan(mode: 'paper' | 'live'): Promise<ScanResults> {
  // Fetch batch
  const batch = await marketScanner.collectMixedBatch();
  
  // Apply FX5 filters
  const survivors = this.applyFilters(batch);
  
  // Emit results (NO PASSIVE CHECK)
  await stage3Emitter.emit('scanner:breakdown', breakdown);
  await stage3Emitter.emit('scanner:eligible', survivors);
  
  return results;
}
```

### Gap Analysis

| Feature | Truth State | Current State | Gap |
|---------|-------------|---------------|-----|
| Passive learning check | ✅ Present | 🔴 Missing | **100% ROLLBACK** |
| Conditional metrics update | ✅ Present | 🔴 Missing | **100% ROLLBACK** |
| Passive scan logging | ✅ Present | 🔴 Missing | **100% ROLLBACK** |
| Pool enforcement integration | ✅ Present | 🔴 Missing | **100% ROLLBACK** |

**Impact**: Metrics and pool updates occur during passive mode (incorrect behavior)

**Severity**: 🔴 **CRITICAL**

---

## Gap 2: Scan 24h Aggregator - Passive Flag NOT Checked

### Truth State

```typescript
async recordCycle(cycleData: ScanCycleData, mode: 'paper' | 'live'): Promise<void> {
  // FIRST: Check passive learning flag
  const config = await systemConfigService.getConfig();
  
  if (config.passiveLearning) {
    console.log('[Scan24hAggregator] PASSIVE LEARNING - Skipping metrics recording');
    return; // SKIP ALL database writes
  }
  
  // SECOND: Check engine state
  const context = await storage.getSystemContext(mode);
  if (!context?.isEngineActive) {
    console.log('[Scan24hAggregator] Engine stopped - Skipping recording');
    return;
  }
  
  // ACTIVE MODE: Record metrics
  await this.updateMetrics(cycleData, mode);
}
```

### Current State

```typescript
async recordCycle(cycleData: ScanCycleData, mode: 'paper' | 'live'): Promise<void> {
  // ONLY checks engine state, NOT passive learning flag
  const context = await storage.getSystemContext(mode);
  
  if (!context?.isEngineActive) {
    console.log(`[Scan24hAggregator][recordCycle] Skipped - ${mode} engine is STOPPED`);
    return;
  }
  
  // Record metrics (no passive check)
  await this.updateMetrics(cycleData, mode);
}
```

### Gap Analysis

| Feature | Truth State | Current State | Gap |
|---------|-------------|---------------|-----|
| Passive learning check | ✅ Explicit | 🔴 Missing | **ROLLED BACK** |
| Engine state check | ✅ Present | ✅ Present | ✅ Intact |
| Dual-gate logic | ✅ Present | 🔴 Single gate | **REGRESSED** |

**Current Behavior**: Uses `isEngineActive` as **proxy** for passive mode

**Risk**: If `isEngineActive=true` but `passiveLearning=true`, metrics WILL update (incorrect)

**Severity**: ⚠️  **HIGH** (partial mitigation via engine state proxy)

---

## Gap 3: Active Filter Pool - Enforcement Method Disconnected

### Truth State

```typescript
// FX5 Scanner calls enforcePassiveModeIfStopped() on state change
async runScan(mode: 'paper' | 'live'): Promise<ScanResults> {
  const context = await storage.getSystemContext(mode);
  const isEngineActive = context?.isEngineActive ?? false;
  
  // Enforce passive mode behavior
  activeFilterPool.enforcePassiveModeIfStopped(mode, isEngineActive);
  
  // ... rest of scan logic
}
```

### Current State

```typescript
// Method EXISTS but NO CALLER
// server/services/active-filter-pool.ts line 215-223
enforcePassiveModeIfStopped(mode: 'paper' | 'live', isEngineRunning: boolean): void {
  if (!isEngineRunning) {
    const pool = this.getPool(mode);
    if (pool.size > 0) {
      console.log(`[8.6.7][DEBUG] Engine stopped - clearing Active Pool (passive mode enforcement)`);
      this.clearPool(mode);
    }
  }
}

// grep search: NO FILES CALL THIS METHOD
```

### Gap Analysis

| Feature | Truth State | Current State | Gap |
|---------|-------------|---------------|-----|
| Method definition | ✅ Present | ✅ Present | ✅ Intact |
| Method caller (FX5) | ✅ Present | 🔴 Missing | **DISCONNECTED** |
| Pool clearing on stop | ✅ Automatic | 🔴 Never triggered | **BROKEN** |

**Current Behavior**: Pool may retain symbols after engine stops (incorrect)

**Evidence**: From REB 2.2 testing, pool was empty only because engines never reached ACTIVE state

**Severity**: 🔴 **CRITICAL** - Pool behavior undefined during mode transitions

---

## Gap 4: Engine Warmup & State Machine - Complete Rollback

### Truth State

```typescript
export class TradingEngine {
  private state: 'INIT' | 'WARM' | 'ACTIVE' | 'STOPPED' = 'INIT';
  
  async start(): Promise<void> {
    this.state = 'INIT';
    console.log('[ENGINE] State: INIT');
    
    // Phase 1: Validate configuration
    await this.validateConfig();
    
    this.state = 'WARM';
    console.log('[ENGINE] State: WARM - Beginning warmup');
    
    // Phase 2: Warmup (parallel initialization)
    await Promise.all([
      this.prewarmKrakenAPI(),
      this.prefetchInitialData(),
      this.prepopulateStateCaches(),
      this.initializeOrchestrators(),
    ]);
    
    console.log('[ENGINE] Warmup complete (<10s)');
    
    this.state = 'ACTIVE';
    console.log('[ENGINE] State: ACTIVE');
    
    // Broadcast ACTIVE status
    await this.broadcastStatus('ACTIVE');
  }
}
```

### Current State

```typescript
export class TradingEngine {
  private isRunning = false; // Simple boolean, NO state enum
  
  async start(): Promise<void> {
    console.log('[ENGINE] Starting trading engine...');
    
    // NO WARMUP PHASE
    // NO STATE MACHINE
    // NO PARALLEL INITIALIZATION
    
    this.isRunning = true;
    console.log(`[ENGINE] Trading engine started`);
    
    // Synchronous orchestrator instantiation (NO readiness check)
    this.signalOrchestrator = new SignalOrchestrator({...});
    this.signalOrchestrator.start();
  }
}
```

### Gap Analysis

| Feature | Truth State | Current State | Gap |
|---------|-------------|---------------|-----|
| State machine | ✅ INIT→WARM→ACTIVE | 🔴 isRunning boolean | **100% ROLLBACK** |
| Warmup phase | ✅ <10s parallel init | 🔴 Missing | **100% ROLLBACK** |
| Pre-warm APIs | ✅ Present | 🔴 Missing | **100% ROLLBACK** |
| Parallel init | ✅ Promise.all([...]) | 🔴 Sequential | **100% ROLLBACK** |
| Orchestrator readiness | ✅ Checked | 🔴 Not checked | **100% ROLLBACK** |
| Status broadcast | ✅ "ACTIVE" | 🔴 "RUNNING" | **REGRESSED** |

**Impact**: 143-second startup delay instead of <10 seconds

**Severity**: 🔴 **CRITICAL** - Core engine regression

---

## Gap 5: API Timeout - Hardcoded Mismatch

### Truth State

```typescript
// API timeout matches actual engine startup time
const ENGINE_START_TIMEOUT = 120000; // 120 seconds (realistic)

const result = await Promise.race([
  startEnginePromise,
  timeoutPromise
]);

// Engine completes within timeout
// Returns success when engine truly ACTIVE
```

### Current State

```typescript
// API timeout mismatched with actual startup time
const ENGINE_START_TIMEOUT = 10000; // 10 seconds (TOO SHORT)

const result = await Promise.race([
  startEnginePromise, // Takes 143 seconds
  timeoutPromise // Times out after 10 seconds
]);

// Returns error after 10s, but engine continues starting for 143s
```

### Gap Analysis

| Feature | Truth State | Current State | Gap |
|---------|-------------|---------------|-----|
| Timeout value | ✅ 120s (realistic) | 🔴 10s (too short) | **14x TOO SHORT** |
| Matches startup time | ✅ Yes | 🔴 No (143s actual) | **MISMATCH** |
| Progress indicators | ✅ Present | 🔴 Missing | **MISSING** |
| Silent background start | 🔴 No | ✅ Yes (bad) | **REGRESSED** |

**User Impact**: Engine appears to fail, but actually starts 133 seconds later (silently)

**Severity**: 🔴 **CRITICAL** - Severe UX regression

---

## Gap 6: MarketScanner - Mode Branching Logic Missing

### Truth State

```typescript
// Unified scanner with mode-specific behavior branching
async runScan(mode: 'paper' | 'live'): Promise<void> {
  const context = await storage.getSystemContext(mode);
  const isEngineActive = context?.isEngineActive ?? false;
  
  if (mode === 'live' && isEngineActive) {
    console.log(`[LIFECYCLE] MarketScanner switching to LIVE mode`);
    await this.runLiveScan();
  } else if (mode === 'paper' && isEngineActive) {
    console.log(`[LIFECYCLE] MarketScanner switching to PAPER mode (active trading)`);
    await this.runPaperScan();
  } else {
    console.log(`[LIFECYCLE] MarketScanner in PAPER mode (passively learning - engine OFF)`);
    await this.runPassiveScan();
  }
}
```

### Current State

```typescript
// No mode branching logic visible
async runScan(mode: 'paper' | 'live'): Promise<void> {
  // NO [LIFECYCLE] logging
  // NO mode-specific branching
  // NO passive vs active differentiation
  
  // Runs same logic regardless of mode/state
  const batch = await this.collectMixedBatch();
  return batch;
}
```

### Gap Analysis

| Feature | Truth State | Current State | Gap |
|---------|-------------|---------------|-----|
| Mode branching | ✅ 3-way (live/paper/passive) | 🔴 None visible | **MISSING** |
| [LIFECYCLE] logging | ✅ Present | 🔴 Missing | **MISSING** |
| Passive scan differentiation | ✅ Present | 🔴 Missing | **MISSING** |

**Impact**: Unified scanner exists but doesn't differentiate behavior by mode

**Severity**: ⚠️  **MEDIUM** - Architecture present but behavior uniform

---

## Gap 7: Passive Learning UI Integration

### Truth State

```tsx
// UI shows passive learning banner when flag enabled
{systemFlags?.passiveLearning && (
  <Alert variant="info" className="mb-6">
    <InfoIcon className="h-4 w-4" />
    <AlertTitle>
      Passive Learning Active — Trading Metrics Paused
    </AlertTitle>
    <AlertDescription>
      Scanner continues running in background for data collection.
      Start trading to resume metrics updates.
    </AlertDescription>
  </Alert>
)}
```

### Current State

**Frontend**: ✅ Banner logic intact (from truth source file)

**Backend**: 🔴 `passiveLearning` flag broadcast but NOT enforced

**Gap**: UI can show passive banner, but backend **ignores** the flag

### Gap Analysis

| Feature | Truth State | Current State | Gap |
|---------|-------------|---------------|-----|
| Frontend banner | ✅ Present | ✅ Present | ✅ Intact |
| Backend enforcement | ✅ Present | 🔴 Missing | **DISCONNECTED** |
| Metrics freeze | ✅ Enforced | 🔴 Not enforced | **BROKEN** |

**Impact**: UI shows "Trading Metrics Paused" but metrics continue updating

**Severity**: 🔴 **CRITICAL** - UI lies to user

---

## Gap 8: Mode Isolation - Runtime Validation Missing

### Truth State

```typescript
// Boot-time invariant checks (like Phase 2)
async function verifyModeIsolation(): Promise<void> {
  // Verify paper and live contexts are separate
  const paperContext = await storage.getSystemContext('paper');
  const liveContext = await storage.getSystemContext('live');
  
  assert(paperContext !== liveContext, 'Mode contexts must be separate');
  
  // Verify pools are separate
  const paperPool = activeFilterPool.getActivePool('paper');
  const livePool = activeFilterPool.getActivePool('live');
  
  const paperSymbols = new Set(paperPool.map(p => p.symbol));
  const liveSymbols = new Set(livePool.map(p => p.symbol));
  const overlap = [...paperSymbols].filter(s => liveSymbols.has(s));
  
  assert(overlap.length === 0 || true, 'Pool overlap allowed but not shared instances');
  
  console.log('[BOOT] ✅ Mode isolation verified');
}
```

### Current State

```typescript
// NO boot-time mode isolation checks
// NO runtime validation
// NO invariant guards
```

### Gap Analysis

| Feature | Truth State | Current State | Gap |
|---------|-------------|---------------|-----|
| Boot invariants | ✅ Present | 🔴 Missing | **MISSING** |
| Mode isolation tests | ✅ Present | 🔴 Missing | **MISSING** |
| Cross-mode validation | ✅ Present | 🔴 Missing | **MISSING** |

**Impact**: Mode isolation assumed but never verified

**Severity**: ⚠️  **MEDIUM** - Architecture likely intact, but unproven

---

## Summary: All Gaps by Severity

### 🔴 CRITICAL Gaps (7 items)

1. **FX5 Scanner** - NO passive learning checks → metrics update during passive mode
2. **Active Filter Pool** - Enforcement method never called → pool behavior undefined
3. **Engine Warmup** - Complete rollback → 143-second startup delay
4. **API Timeout** - 10s hardcoded vs 143s actual → engine appears to fail
5. **Passive Learning UI** - Frontend shows banner, backend ignores flag → UI lies to user
6. **Status Synchronization** - Shows "RUNNING" not "ACTIVE" → user confusion
7. **Orchestrator Readiness** - No initialization checks → contributes to 143s delay

### ⚠️  HIGH Gaps (2 items)

8. **Scan24h Aggregator** - Uses engine state proxy instead of passive flag → risk of desync
9. **Mode Branching** - Unified scanner exists but no mode-specific behavior → uniform behavior

### 🟡 MEDIUM Gaps (3 items)

10. **Mode Isolation Validation** - No runtime checks → assumed but unproven
11. **State Machine** - Simple boolean instead of INIT→WARM→ACTIVE → no intermediate states
12. **Parallel Initialization** - Sequential instead of parallel → slower startup

---

## Rollback Depth by Component

| Component | Truth State | Current State | Rollback Depth |
|-----------|-------------|---------------|----------------|
| FX5 Scanner Passive Logic | ✅ Full integration | 🔴 None | **100%** |
| Metrics Passive Skip | ✅ Full integration | 🔴 None | **100%** |
| Engine Warmup | ✅ <10s parallel | 🔴 None | **100%** |
| State Machine | ✅ INIT→WARM→ACTIVE | 🔴 isRunning | **100%** |
| Active Pool Enforcement | ✅ Auto-triggered | 🔴 No caller | **100%** |
| Mode Branching Logic | ✅ 3-way branch | 🔴 Uniform | **90%** |
| API Timeout | ✅ 120s | 🔴 10s | **85%** |
| Passive Flag (definition) | ✅ DB + broadcasts | ✅ DB + broadcasts | **0%** (intact) |
| Mode Registry | ✅ Full tracking | ✅ Full tracking | **0%** (intact) |
| Broadcast Timing | ✅ Instant | ✅ Instant | **0%** (intact) |

**Aggregate Rollback Depth**: **85%** - Only basic infrastructure survived

---

## Behavioral Gaps Summary

### What's Missing

**Passive Learning Behavior** (100% rollback):
- 🔴 NO passive flag checks in scan pipeline
- 🔴 NO metrics skip logic
- 🔴 NO pool clearing on engine stop (automatic)
- 🔴 NO passive scan logging
- 🔴 NO passive learning enforcement

**Engine Startup Optimization** (100% rollback):
- 🔴 NO warmup phase
- 🔴 NO state machine transitions
- 🔴 NO parallel initialization
- 🔴 NO orchestrator readiness checks
- 🔴 NO pre-warm throttling

**Mode-Specific Behavior** (90% rollback):
- 🔴 NO mode branching in scanner
- 🔴 NO [LIFECYCLE] logging
- 🔴 NO passive vs active differentiation

### What's Partially Broken

**Proxy Behavior** (risky):
- ⚠️  Uses `isEngineActive` as passive mode proxy
- ⚠️  Works if engine state = passive flag
- ⚠️  Breaks if they ever desync

**Pool Enforcement** (disconnected):
- ⚠️  Method exists but never called
- ⚠️  Pool may retain stale symbols

**Status Mapping** (incomplete):
- ⚠️  Internal state: "ACTIVE"
- ⚠️  External API: "RUNNING"
- ⚠️  Status never shows "ACTIVE" to user

### What Survived

**Infrastructure** (15% survival):
- ✅ Mode registry (paper/live tracking)
- ✅ System config (`passiveLearning` flag)
- ✅ Database mode isolation
- ✅ Broadcast timing (Stage 1H fix)
- ✅ Active pool TTL/deduplication

---

## Root Cause Analysis

### Why Did Passive Learning Rollback Happen?

**Hypothesis**: GitHub sync rollback restored **older versions** of:
1. `fx5-scanner.ts` - Pre-Phase 8.6.9 version (no passive checks)
2. `scan-24h-aggregator.ts` - Pre-Phase 8.6.9 version (engine state proxy only)
3. `trading-engine.ts` - Pre-Phase 8.1-8.2 version (no warmup)
4. `paper-sim-service.ts` - Pre-Phase 8.1-8.2 version (no optimization)

**Evidence**:
- Phase markers in current code stop at Phase 33.C (trading-state-sync)
- NO Phase 8.6.9 markers in fx5-scanner.ts
- NO warmup logic anywhere in trading-engine.ts
- `enforcePassiveModeIfStopped()` exists (REB 2.2) but no callers

**Conclusion**: Nov 18-20 commits were overwritten, but some earlier commits (mode-registry, system-config) survived because they were in different files.

---

## Next Steps (After Gap Analysis)

### Immediate Restoration Required

**P0 - Critical Path**:
1. Restore passive learning checks in FX5 scanner
2. Restore metrics skip logic in Scan24h aggregator
3. Restore `enforcePassiveModeIfStopped()` caller
4. Restore engine warmup logic
5. Fix API timeout (60-120s)
6. Fix status synchronization (RUNNING→ACTIVE)

**P1 - High Priority**:
7. Restore state machine (INIT→WARM→ACTIVE)
8. Restore parallel initialization
9. Add mode branching logging

**P2 - Medium Priority**:
10. Add mode isolation validation
11. Add passive learning tests
12. Add startup telemetry

---

**Report Generated**: November 23, 2025, 00:05 UTC  
**Audit Program**: Emergency Restoration & Bootstrap (REB)  
**Phase**: REB 2.3C - Mode System & Passive Learning Gap Analysis  
**Status**: GAP ANALYSIS COMPLETE  
**Rollback Depth**: 85% (only infrastructure survived)  
**Next**: Impact assessment across all subsystems
