# REB 2.3C: Current Mode Implementation (Post-Rollback State)

**Status**: CURRENT SYSTEM AUDIT COMPLETE  
**Date**: November 22, 2025  
**Audit Type**: READ-ONLY  
**Scope**: Mode system & passive learning in current codebase

---

## Executive Summary

This report documents the **Current State** of mode system and passive learning implementation following the GitHub sync rollback. The audit reveals **partial survival** of mode isolation architecture, but **complete loss** of passive learning integration in critical subsystems (FX5 scanner, metrics pipeline, orchestrator).

**Key Finding**: Mode infrastructure exists (mode-registry, system-config), but passive learning behavior is **disconnected** from the scanning and metrics pipelines.

---

## Current Mode Infrastructure

### 1. Mode Registry (`server/services/mode-registry.ts`)

**Status**: ✅ **FULLY INTACT**

```typescript
export interface ModeStatus {
  engineStatus: 'stopped' | 'starting' | 'running' | 'paused' | 'error';
  riskSummary: Record<string, any>;
  alerts: number;
  trades: number;
  lastUpdate: Date;
}

export const ModeRegistry: ModeRegistryType = {
  paper: { engineStatus: 'stopped', ... },
  live: { engineStatus: 'stopped', ... },
};
```

**Capabilities**:
- ✅ Separate mode tracking (paper vs live)
- ✅ Engine instance registry per mode
- ✅ Mode status updates with WebSocket broadcast
- ✅ Trade/alert counters per mode

**Phase Markers**:
- Phase 27.F.14.MICRO: Engine management
- Phase 27.F.15.B.4: Production telemetry layer

**Verdict**: Architecture intact, mode separation present

---

### 2. System Config (`server/services/system-config.ts`)

**Status**: ✅ **FULLY INTACT**

```typescript
export class SystemConfigService {
  private configCache: {
    passiveLearning: boolean;
  } | null = null;
  
  async getConfig(): Promise<{ passiveLearning: boolean }> {
    // Returns passiveLearning flag from database
    // Phase 32.BS: Defaults to TRUE
  }
  
  isPassiveLearningEnabled(): boolean {
    return this.configCache?.passiveLearning ?? false;
  }
}
```

**Capabilities**:
- ✅ `passiveLearning` flag in database (system_config table)
- ✅ Default value: TRUE (Phase 32.BS)
- ✅ updateConfig() method to toggle flag
- ✅ WebSocket broadcast on mode change

**Phase Markers**:
- Phase 31.H: System configuration service
- Phase 32.BS: Passive mode as default

**Verdict**: Infrastructure intact, but **NOT integrated** into scan/metrics pipelines

---

### 3. Trading State Sync (`server/services/trading-state-sync.ts`)

**Status**: ✅ **MOSTLY INTACT**

```typescript
async setEngineActive(userId: string, isActive: boolean, mode: 'live' | 'paper'): Promise<void> {
  // Phase 33.A: Instant broadcast BEFORE heavy operations
  await contextBridge.broadcast({
    type: 'trading_state_changed',
    payload: {
      userId,
      mode,
      active: isActive,
      isEngineActivePaper: mode === 'paper' ? isActive : undefined,
      isEngineActiveLive: mode === 'live' ? isActive : undefined,
      passiveLearning: !isActive, // <-- Passive flag set based on engine state
      portfolioOverview,
      timestamp,
    },
    mode
  });
}
```

**Capabilities**:
- ✅ Tracks `isEngineActive` per mode (paper/live)
- ✅ Broadcasts `passiveLearning` flag to frontend
- ✅ Mode-based system context in database
- ✅ Instant broadcast (Phase 33.A/33.C)
- ✅ Reconciliation guard (30s interval)

**Phase Markers**:
- Phase 27.F.3: Update engine active state
- Phase 27.F.13.O: Mode-based global context
- Phase 32.D-Fix.6: Reset stale engine flags on startup
- Phase 33.A/33.C: Instant broadcast for <100ms latency

**Verdict**: State management intact, broadcasts working, but passive flag is **informational only** (not enforced in backend logic)

---

### 4. Active Filter Pool (`server/services/active-filter-pool.ts`)

**Status**: ✅ **INTACT** (Restored in REB 2.2)

```typescript
/**
 * Enforce passive mode behavior: clear pool when engine stops
 * REB 2.2: Truth state requirement from chat archives
 */
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

**Capabilities**:
- ✅ Separate pools per mode (paper vs live)
- ✅ TTL expiry (5 minutes)
- ✅ Deduplication logic
- ✅ `enforcePassiveModeIfStopped()` method exists

**REB 2.2 Restoration**:
- Phase 8.6.7: Pool management
- Phase 8.6.10: TTL/deduplication

**Issue**: Method exists but is **NOT currently being called** by any component

**Verdict**: Logic intact, but **disconnected** - no caller found in codebase

---

### 5. FX5 Scanner (`server/services/fx5-scanner.ts`)

**Status**: 🔴 **PASSIVE LEARNING LOGIC MISSING**

**Searched For**:
- `passiveLearning` - NOT FOUND
- `passive_learning` - NOT FOUND
- `passiveMode` - NOT FOUND
- `systemConfig` - NOT FOUND
- `isEngineActive` check - NOT FOUND

**Current Implementation**:
```typescript
async runScan(mode: 'paper' | 'live'): Promise<ScanResults> {
  // Fetch batch
  const batch = await marketScanner.collectMixedBatch();
  
  // Apply FX5 filters
  const survivors = this.applyFilters(batch);
  
  // Emit results
  await stage3Emitter.emit('scanner:breakdown', breakdown);
  await stage3Emitter.emit('scanner:eligible', survivors);
  
  // NO PASSIVE LEARNING CHECKS
  // NO METRICS SKIP LOGIC
  // NO POOL ENFORCEMENT
  
  return results;
}
```

**Missing**:
- 🔴 NO `systemConfigService.isPassiveLearningEnabled()` check
- 🔴 NO conditional metrics updates
- 🔴 NO `enforcePassiveModeIfStopped()` call
- 🔴 NO passive learning logging

**Verdict**: **Complete rollback** of Phase 8.6.9 passive learning integration

---

### 6. Scan 24h Aggregator (`server/services/scan-24h-aggregator.ts`)

**Status**: 🔴 **PASSIVE LEARNING LOGIC MISSING**

**Searched For**:
- `passiveLearning` - NOT FOUND
- `passive.*mode` - NOT FOUND
- `systemConfig` - NOT FOUND

**Current Implementation**:
```typescript
async recordCycle(cycleData: ScanCycleData, mode: 'paper' | 'live'): Promise<void> {
  // Check if engine is active
  const context = await storage.getSystemContext(mode);
  
  if (!context?.isEngineActive) {
    console.log(`[Scan24hAggregator][recordCycle] Skipped - ${mode} engine is STOPPED`);
    return; // <-- ONLY checks isEngineActive, NOT passiveLearning flag
  }
  
  // Record metrics
  await this.updateMetrics(cycleData, mode);
}
```

**Findings**:
- ⚠️  Has `isEngineActive` check (partial passive behavior)
- 🔴 Does NOT check `passiveLearning` flag explicitly
- 🔴 Relies on `isEngineActive` as proxy for passive mode

**Issue**: If `isEngineActive=true` but `passiveLearning=true`, metrics WOULD update (conflict)

**Verdict**: **Partial survival** - uses engine state as proxy, but not explicit passive flag

---

### 7. Trading Engine (`server/services/trading-engine.ts`)

**Status**: 🔴 **WARMUP LOGIC MISSING**

**Current Implementation**:
```typescript
export class TradingEngine {
  private isRunning = false;
  
  async start(): Promise<void> {
    console.log('[ENGINE] Starting trading engine...');
    
    // NO WARMUP PHASE
    // NO STATE MACHINE (INIT → WARM → ACTIVE)
    // NO PRE-WARM THROTTLING
    
    this.isRunning = true;
    console.log(`[ENGINE] Trading engine started`);
    
    // Instantiate orchestrator (synchronous, no warmup)
    this.signalOrchestrator = new SignalOrchestrator({...});
    this.signalOrchestrator.start();
  }
}
```

**Missing**:
- 🔴 NO warmup phase
- 🔴 NO state machine (INIT→WARM→ACTIVE)
- 🔴 NO parallel initialization
- 🔴 NO orchestrator readiness checks
- 🔴 NO pre-warm throttling

**Evidence of Regression**:
- Simple `isRunning` boolean (no state enum)
- Synchronous orchestrator instantiation
- No warmup logs
- No state transition events

**Verdict**: **Complete rollback** of Phase 8.1-8.2 warmup logic

---

### 8. Paper Execution Engine (`server/services/paper-execution-engine.ts`)

**Status**: 🔴 **SIMPLE START, NO WARMUP**

**Current Implementation**:
```typescript
export class PaperExecutionEngine {
  async start(): Promise<void> {
    console.log('[PaperEngine] Starting...');
    
    // NO WARMUP
    // Simple start logic
    
    this.isRunning = true;
  }
}
```

**Missing**:
- 🔴 NO warmup phase
- 🔴 NO pre-initialization
- 🔴 NO readiness checks

**Verdict**: No warmup logic, contributes to 143s startup delay

---

### 9. Paper Sim Service (`server/services/paper-sim-service.ts`)

**Status**: 🔴 **STARTUP DELAY (143s)**

**Function Signature**:
```typescript
export async function startPaperSimulation(
  userId: string,
  options?: { startingBalance?: number; skipAutoWatchlist?: boolean }
): Promise<any> {
  console.log(`[41F][QUEUE] startPaperSimulation called`);
  
  // ... (143 seconds of unexplained delay occurs here)
  
  return { success: true };
}
```

**Issue**: Function takes 143 seconds to complete (from REB 2.3B measurements)

**Suspected Cause**:
- Sequential initialization instead of parallel
- Heavy database operations not optimized
- Missing warmup/bootstrap logic from Phase 8.1-8.2

**Verdict**: **Regressed** - missing startup optimizations

---

### 10. REST API Endpoints (`server/routes.ts`)

**Status**: 🔴 **TIMEOUT REGRESSED**

**Current Implementation**:
```typescript
// Line 2486-2512
apiRouter.post('/trading/start', authenticateToken, requireEditor, async (req, res) => {
  // ...
  
  const ENGINE_START_TIMEOUT = 10000; // 10 seconds - TOO SHORT
  
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
  
  // Returns error after 10s, but engine continues starting for 143s
});
```

**Issues**:
- 🔴 Hardcoded 10-second timeout (too short)
- 🔴 Engine continues starting after timeout error
- 🔴 No progress indicators
- 🔴 No warmup integration

**Verdict**: **Regressed** - timeout mismatched with actual startup time

---

## Current Mode Behavior Analysis

### Paper Mode (Active) - Current Behavior

**What Works**:
- ✅ Engine state tracked: `isEngineActive=true`
- ✅ Mode-specific database contexts
- ✅ Separate Active Filter Pools (architecture exists)
- ✅ WebSocket broadcasts with mode info

**What's Broken**:
- 🔴 143-second startup delay (no warmup)
- 🔴 API timeout after 10s (mismatch)
- 🔴 Status shows "RUNNING" not "ACTIVE"
- 🔴 `enforcePassiveModeIfStopped()` never called

**Partial Behaviors**:
- ⚠️  Metrics update (but not via passive flag check)
- ⚠️  Pool populated (but no explicit passive enforcement)

---

### Passive Learning Mode - Current Behavior

**What Works**:
- ✅ `passiveLearning` flag exists in database
- ✅ Flag broadcast to frontend via WebSocket
- ✅ UI can show passive learning banner

**What's Broken**:
- 🔴 FX5 scanner does NOT check `passiveLearning` flag
- 🔴 Metrics pipeline does NOT skip on `passiveLearning`
- 🔴 Active Pool NOT cleared when engine stops (no caller)
- 🔴 No logging: `[8.6.9][MetricsAudit] PASSIVE LEARNING - NO METRICS UPDATED`

**Current Isolation Method**:
- ⚠️  Uses `isEngineActive=false` as proxy for passive mode
- ⚠️  Scan24hAggregator skips recording if engine stopped
- ⚠️  Relies on engine state instead of explicit `passiveLearning` flag

**Risk**: If `isEngineActive` and `passiveLearning` ever desync, behavior is undefined

---

### Live Mode - Current Behavior

**What Works**:
- ✅ Separate mode tracking in mode-registry
- ✅ Separate database context
- ✅ Separate engine instance registration

**What's Uncertain**:
- 🟡 Live pool isolation (architecture exists, runtime untested)
- 🟡 Live engine startup (untested, likely same 143s delay)

---

## Mode Isolation - Current Status

### Database-Level Isolation

**✅ INTACT**:
```sql
-- Separate contexts
system_context WHERE mode = 'paper'
system_context WHERE mode = 'live'

-- Separate portfolios
portfolio_state WHERE mode = 'paper'
portfolio_state WHERE mode = 'live'
```

**✅ Code References**:
```typescript
// storage.ts methods accept mode parameter
await storage.getSystemContext('paper');
await storage.getSystemContext('live');

await storage.getPortfolioState({ mode: 'paper' });
await storage.getPortfolioState({ mode: 'live' });
```

**Verdict**: Database schema and storage methods support full mode isolation

---

### Service-Level Isolation

**✅ INTACT** (Architecture):
```typescript
// mode-registry.ts
const engineInstances: Map<string, PaperExecutionEngine | null> = new Map();
engineInstances.set('paper', paperEngine);
engineInstances.set('live', liveEngine);

// active-filter-pool.ts
private paperPool: Map<string, ActiveFilteredPair> = new Map();
private livePool: Map<string, ActiveFilteredPair> = new Map();

// stage3-state-cache.ts
getState(mode: 'paper' | 'live'): ScannerState | null
```

**Verdict**: Service layer architecture supports mode isolation, but runtime behavior **not tested**

---

### Runtime Isolation - Current Status

**Uncertain**:
- 🟡 No evidence of cross-mode data leakage
- 🟡 No evidence of shared state pollution
- 🟡 Cannot confirm isolation without dual-mode testing

**Missing**:
- 🔴 No boot-time invariant checks (like Phase 2 verification)
- 🔴 No mode isolation tests
- 🔴 No cross-mode validation

---

## Passive Learning Integration - Gap Analysis

### Where Passive Flag Should Be Checked (Truth State)

**Truth State Pattern**:
```typescript
// In any component that updates metrics or state
const config = await systemConfigService.getConfig();

if (config.passiveLearning) {
  console.log('[PASSIVE LEARNING] Skipping state updates');
  // Broadcast data for learning, but skip DB writes
  return;
}

// ACTIVE MODE: Normal state updates
await updateMetrics(...);
await updateActivePool(...);
```

### Current Integration Status

| Component | Should Check? | Currently Checks? | Status |
|-----------|---------------|-------------------|--------|
| FX5 Scanner | ✅ Yes | 🔴 NO | **MISSING** |
| Scan24h Aggregator | ✅ Yes | ⚠️  Proxy only | **PARTIAL** |
| Active Filter Pool | ✅ Yes (via caller) | 🔴 NO caller | **DISCONNECTED** |
| Metrics Pipeline | ✅ Yes | 🔴 NO | **MISSING** |
| Stage-3 Emitter | ✅ Yes | 🔴 NO | **MISSING** |
| Trading Engine | ✅ Yes (integration) | 🔴 NO | **MISSING** |

**Verdict**: Passive learning flag is **defined** but **NOT integrated** into critical subsystems

---

## Stage 1H Refactor - Current Status

### Unified Scanner Architecture

**Search Results**:
- ✅ `market-scanner.ts` exists
- ✅ `fx5-scanner.ts` exists
- 🟡 No evidence of duplicate scanners (PaperScanner, LiveScanner)

**Findings**:
- ✅ Single MarketScanner (unified)
- ✅ collectMixedBatch() method (batch-first)
- 🔴 NO mode branching logic visible in logs
- 🔴 NO `[LIFECYCLE]` mode switch logging

**Evidence of Stage 1H**:
- No legacy scanner files found
- Unified architecture present
- But mode-specific behavior branching **MISSING**

**Verdict**: Unified scanner exists, but **mode branching logic regressed**

---

### Broadcast Timing - Current Status

**Current Implementation** (trading-state-sync.ts):
```typescript
// Phase 33.A: Instant broadcast BEFORE heavy operations
await contextBridge.broadcast({...});
console.log('[Phase-33.C] ⚡ Instant broadcast sent: latency=<50ms');

// Then update database asynchronously
setTimeout(async () => {
  await storage.updateSystemContext(...);
}, 0);
```

**Findings**:
- ✅ Broadcast is BLOCKING (awaited)
- ✅ Broadcast fires BEFORE HTTP response
- ✅ Phase 33.A/33.C markers present
- ✅ Stage 1H fix survived

**Verdict**: **INTACT** - broadcast timing optimization present

---

## Summary: Current vs Truth State

| Feature | Truth State | Current State | Status |
|---------|-------------|---------------|--------|
| Mode Registry | ✅ Present | ✅ Present | ✅ INTACT |
| System Config | ✅ Present | ✅ Present | ✅ INTACT |
| Passive Flag | ✅ Integrated | 🔴 Defined only | 🔴 DISCONNECTED |
| FX5 Passive Check | ✅ Present | 🔴 Missing | 🔴 ROLLED BACK |
| Metrics Passive Skip | ✅ Present | 🔴 Missing | 🔴 ROLLED BACK |
| Pool Enforcement | ✅ Integrated | 🔴 No caller | 🔴 DISCONNECTED |
| Engine Warmup | ✅ <10s | 🔴 143s delay | 🔴 ROLLED BACK |
| State Machine | ✅ INIT→WARM→ACTIVE | 🔴 isRunning only | 🔴 ROLLED BACK |
| API Timeout | ✅ Realistic | 🔴 10s hardcoded | 🔴 REGRESSED |
| Mode Isolation (DB) | ✅ Full | ✅ Full | ✅ INTACT |
| Mode Isolation (Runtime) | ✅ Full | 🟡 Uncertain | 🟡 UNTESTED |
| Unified Scanner | ✅ Mode branching | 🔴 No branching | 🔴 PARTIAL |
| Broadcast Timing | ✅ Instant | ✅ Instant | ✅ INTACT |

---

**Report Generated**: November 22, 2025, 23:59 UTC  
**Audit Program**: Emergency Restoration & Bootstrap (REB)  
**Phase**: REB 2.3C - Mode System & Passive Learning Rollback Audit  
**Status**: CURRENT SYSTEM DOCUMENTED  
**Next**: Gap analysis and impact assessment
