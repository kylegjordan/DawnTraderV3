# REB 2.3C: Mode System Impact Matrix

**Status**: IMPACT ASSESSMENT COMPLETE  
**Date**: November 23, 2025  
**Audit Type**: READ-ONLY  
**Scope**: System-wide impact of mode system rollback

---

## Executive Summary

This matrix maps how the mode system and passive learning rollback impacts **every critical subsystem** in DawnTrader. The rollback has **cascading effects** across the entire architecture, with the 143-second startup delay being just one visible symptom of deeper structural regressions.

**Impact Severity Distribution**:
- 🔴 **CRITICAL** impact: 8 subsystems
- ⚠️  **HIGH** impact: 5 subsystems
- 🟡 **MEDIUM** impact: 4 subsystems
- ✅ **NONE/LOW** impact: 6 subsystems

---

## Impact Matrix

| Subsystem | Mode Dependencies | Impact Level | Specific Impacts |
|-----------|-------------------|--------------|------------------|
| **FX5 Scanner** | Passive flag, mode isolation | 🔴 **CRITICAL** | Metrics update during passive mode |
| **Stage-3 Cache** | Mode isolation, passive flag | 🔴 **CRITICAL** | State pollution across modes |
| **Active Filter Pool** | Passive enforcement, mode isolation | 🔴 **CRITICAL** | Pool not cleared, stale symbols |
| **Scan24h Aggregator** | Passive flag, metrics pipeline | 🔴 **CRITICAL** | Metrics increment during passive |
| **Trading Engine** | Warmup, state machine | 🔴 **CRITICAL** | 143s startup delay |
| **Paper Sim Service** | Startup optimization | 🔴 **CRITICAL** | 143s delay, API timeout |
| **REST API (/trading/start)** | Timeout, warmup integration | 🔴 **CRITICAL** | User sees failure, engine starts silently |
| **Filter Insights UI** | Passive banner, metrics freeze | 🔴 **CRITICAL** | UI shows "paused" but metrics update |
| **Signal Orchestrator** | Engine startup, mode | ⚠️  **HIGH** | Late initialization, no readiness check |
| **Strategy Engine** | Mode isolation, passive | ⚠️  **HIGH** | May run during passive mode |
| **Portfolio Manager** | Mode isolation | ⚠️  **HIGH** | Updates during passive mode |
| **Metrics Core** | Passive skip logic | ⚠️  **HIGH** | Metrics corruption during passive |
| **Telemetry** | Startup metrics, warmup | ⚠️  **HIGH** | No startup visibility |
| **WebSocket Broadcasts** | Mode state sync | 🟡 **MEDIUM** | State broadcasts work, but status "RUNNING" not "ACTIVE" |
| **Market Scanner** | Mode branching | 🟡 **MEDIUM** | Unified but no mode-specific behavior |
| **Ready-to-Buy Logic** | Passive mode, pool | 🟡 **MEDIUM** | May generate signals during passive |
| **Cooldown Logic** | Mode isolation | 🟡 **MEDIUM** | Assumed isolated but unverified |
| **Risk Manager** | Mode isolation | ✅ **LOW** | Database isolation intact |
| **Database Schema** | Mode columns | ✅ **NONE** | Schema fully supports modes |
| **Context Bridge** | Mode routing | ✅ **NONE** | Broadcast infrastructure intact |
| **Storage Layer** | Mode parameters | ✅ **NONE** | Mode-aware methods intact |
| **Mode Registry** | Infrastructure | ✅ **NONE** | Fully intact |
| **Kraken API** | Independence | ✅ **NONE** | No mode dependencies |

---

## Detailed Impact Analysis by Subsystem

### 1. FX5 Scanner

**Mode Dependencies**:
- `systemConfigService.getConfig().passiveLearning` (missing)
- Mode-specific behavior branching (missing)
- Active pool enforcement caller (missing)

**Impact**: 🔴 **CRITICAL**

**Specific Impacts**:
1. **Metrics Update During Passive**: Scanner emits breakdown/eligible events regardless of passive flag → metrics pipeline updates → violates passive learning isolation
2. **Pool Population During Passive**: Survivors emitted without passive check → pool may populate → incorrect state
3. **No Passive Logging**: Missing `[8.6.9][MetricsAudit] PASSIVE LEARNING - NO METRICS UPDATED` → no visibility
4. **No Pool Enforcement**: `enforcePassiveModeIfStopped()` never called → pool behavior undefined

**User-Visible Effects**:
- Filter breakdown counts update when they should be frozen
- Active pool shows symbols when it should be empty
- UI shows "Trading Metrics Paused" but metrics continue updating

**Data Integrity Risk**: **HIGH** - Metrics corrupted during passive mode

---

### 2. Stage-3 State Cache

**Mode Dependencies**:
- Mode-specific state storage (paper vs live)
- Passive learning isolation
- State synchronization

**Impact**: 🔴 **CRITICAL**

**Specific Impacts**:
1. **State Updates During Passive**: If passive flag not checked upstream (FX5), Stage-3 cache updates during passive mode
2. **Mode Isolation Uncertain**: Paper and live caches architecturally separate, but cross-mode data flow unverified
3. **Cycle Tracking During Passive**: Cycle IDs increment even when engine stopped

**Evidence**:
```
cycleId: 7 -> 8 -> 9 (during passive mode)
evaluatedCount: 60 (should be frozen)
eligibleCount: 21 (should be frozen)
```

**Data Integrity Risk**: **HIGH** - State corruption during mode transitions

---

### 3. Active Filter Pool

**Mode Dependencies**:
- `enforcePassiveModeIfStopped()` caller (missing)
- FX5 scanner integration (missing)
- Engine state monitoring

**Impact**: 🔴 **CRITICAL**

**Specific Impacts**:
1. **Pool NOT Cleared on Stop**: Method exists but never called → pool may retain symbols after engine stops
2. **Stale Symbols**: Pool entries may expire, but pool not emptied on passive transition
3. **Undefined Behavior**: Without automatic clearing, pool state during passive mode is unpredictable

**Evidence from REB 2.2**:
- Pool was empty only because engines never reached ACTIVE state
- Pool would populate if engine ever activated, then stopped
- No automatic clearing mechanism active

**Trading Risk**: **MEDIUM** - Stale symbols may trigger incorrect trades if engine restarts

---

### 4. Scan 24h Aggregator

**Mode Dependencies**:
- `systemConfigService.getConfig().passiveLearning` (missing explicit check)
- `isEngineActive` (proxy only)
- Metrics pipeline integration

**Impact**: 🔴 **CRITICAL**

**Specific Impacts**:
1. **Metrics Increment During Passive** (if engine state proxy fails): If `isEngineActive=true` but `passiveLearning=true`, metrics update incorrectly
2. **24-Hour Window Corruption**: Passive scans may pollute 24-hour aggregates
3. **Cycle Recording During Passive**: Scan cycles recorded when they should be skipped

**Current Mitigation**: Uses `isEngineActive` as proxy for passive mode (works if they stay synchronized)

**Data Integrity Risk**: **HIGH** - Metrics accuracy compromised during passive/active transitions

---

### 5. Trading Engine

**Mode Dependencies**:
- Warmup phase logic (missing)
- State machine (INIT→WARM→ACTIVE) (missing)
- Orchestrator initialization order (missing)

**Impact**: 🔴 **CRITICAL**

**Specific Impacts**:
1. **143-Second Startup Delay**: No warmup phase → cold start → sequential initialization → 14x slower than truth state
2. **No State Machine**: Simple `isRunning` boolean → no intermediate states → no progress visibility
3. **No Orchestrator Readiness**: SignalOrchestrator instantiated synchronously → may start before dependencies ready
4. **Status Mismatch**: Internal state shows "ACTIVE" but external API shows "RUNNING"

**User-Visible Effects**:
- Long wait for trading to start
- No progress indicators
- Status never shows "ACTIVE" in UI
- User believes startup failed (timeout error)

**Operational Risk**: **CRITICAL** - Engine appears broken, users lose confidence

---

### 6. Paper Sim Service

**Mode Dependencies**:
- Startup optimization (missing)
- Parallel initialization (missing)
- Warmup integration (missing)

**Impact**: 🔴 **CRITICAL**

**Specific Impacts**:
1. **143-Second Delay in `startPaperSimulation()`**: Function takes 2+ minutes to complete
2. **API Timeout**: 10-second timeout too short → returns error to user
3. **Silent Background Start**: Engine continues starting after timeout → user unaware

**Current Behavior**:
```
00:00 - User clicks "Start Trading"
00:10 - API returns error: "Engine start timeout"
02:23 - Engine actually starts (silently, 143s later)
```

**User Experience Impact**: **CRITICAL** - Appears broken, extremely confusing

---

### 7. REST API (/api/trading/start)

**Mode Dependencies**:
- Engine startup time
- Timeout configuration
- Warmup progress indicators

**Impact**: 🔴 **CRITICAL**

**Specific Impacts**:
1. **Timeout Mismatch**: 10s timeout vs 143s actual startup = 14.3x mismatch
2. **False Failure**: Returns error when engine actually starting
3. **No Progress Indicators**: User sees spinner, then error, no status updates
4. **Silent Success**: Engine activates 133 seconds after error shown

**API Contract Violation**: Returns error (HTTP 500 timeout) when operation actually succeeds

**User Trust Impact**: **CRITICAL** - System appears unreliable

---

### 8. Filter Insights UI

**Mode Dependencies**:
- `passiveLearning` flag from backend
- Metrics freeze during passive mode
- Passive learning banner

**Impact**: 🔴 **CRITICAL**

**Specific Impacts**:
1. **UI Lies to User**: Banner shows "Trading Metrics Paused" but metrics continue updating
2. **Metrics Stale vs Live Confusion**: UI can't distinguish passive (frozen) from active (live) data
3. **User Loses Trust**: System shows incorrect information

**Truth State UI**:
```tsx
{passiveLearning && (
  <Alert>Passive Learning Active — Trading Metrics Paused</Alert>
)}
```

**Current Reality**: Banner shows, but backend ignores `passiveLearning` flag

**UX Impact**: **CRITICAL** - Trust violation, confusing feedback

---

### 9. Signal Orchestrator

**Mode Dependencies**:
- Engine startup sequence
- Warmup phase
- Initialization order

**Impact**: ⚠️  **HIGH**

**Specific Impacts**:
1. **Late Initialization**: Instantiated during 143s startup delay → may delay signal generation
2. **No Readiness Check**: Starts immediately without validating dependencies ready
3. **May Start Before Data Ready**: Orchestrator running before FX5 scanner warmed up

**Trading Risk**: **MEDIUM** - May miss early trading opportunities or generate invalid signals

---

### 10. Strategy Engine

**Mode Dependencies**:
- Passive learning isolation
- Mode-specific behavior
- Active pool integration

**Impact**: ⚠️  **HIGH**

**Specific Impacts**:
1. **May Run During Passive Mode**: If orchestrator starts, strategies may evaluate
2. **May Process Stale Pool Data**: If pool not cleared, strategies see old symbols
3. **Mode Isolation Uncertain**: Paper vs live strategy execution untested

**Trading Risk**: **MEDIUM** - Strategies may generate signals when they shouldn't

---

### 11. Portfolio Manager

**Mode Dependencies**:
- Mode isolation (paper vs live portfolios)
- Passive learning freeze
- Trade execution isolation

**Impact**: ⚠️  **HIGH**

**Specific Impacts**:
1. **Updates During Passive Mode**: If trades execute during passive (shouldn't happen), portfolio updates
2. **Mode Isolation Architecture**: Separate portfolios in DB schema, but runtime behavior unverified
3. **Balance Corruption Risk**: If passive flag not enforced, portfolio may update incorrectly

**Data Integrity Risk**: **MEDIUM** - Portfolio state accuracy depends on passive enforcement upstream

---

### 12. Metrics Core

**Mode Dependencies**:
- Passive learning skip logic (missing)
- Metrics pipeline isolation
- Data accuracy guarantees

**Impact**: ⚠️  **HIGH**

**Specific Impacts**:
1. **Metrics Corruption**: Passive scans may pollute metrics if not skipped
2. **24-Hour Windows**: Passive scan data may be included in aggregates
3. **Historical Data Accuracy**: Cannot distinguish passive vs active periods in metrics

**Analytics Impact**: **HIGH** - Metrics analysis compromised if passive data included

---

### 13. Telemetry

**Mode Dependencies**:
- Startup metrics (missing)
- Warmup phase tracking (missing)
- Mode transition events (missing)

**Impact**: ⚠️  **HIGH**

**Specific Impacts**:
1. **No Startup Visibility**: Cannot measure 143s startup delay → cannot diagnose
2. **No Warmup Metrics**: No timing data for initialization phases
3. **No Mode Transition Logs**: Cannot trace passive→active→passive transitions

**Operational Impact**: **HIGH** - Cannot diagnose or optimize startup issues

---

### 14. WebSocket Broadcasts

**Mode Dependencies**:
- Mode-specific broadcasts
- Status synchronization
- Trading state events

**Impact**: 🟡 **MEDIUM**

**Specific Impacts**:
1. **Status Shows "RUNNING" Not "ACTIVE"**: Internal state mismatch with external API
2. **Passive Flag Broadcast**: Flag is broadcast but backend ignores it
3. **Instant Broadcast Intact**: Phase 33.A/33.C broadcast timing survived (positive)

**User-Visible Effects**: Minor confusion over status terminology

---

### 15. Market Scanner

**Mode Dependencies**:
- Mode branching logic (missing)
- [LIFECYCLE] logging (missing)
- Passive vs active differentiation (missing)

**Impact**: 🟡 **MEDIUM**

**Specific Impacts**:
1. **No Mode-Specific Behavior**: Unified scanner exists but runs same logic for all modes
2. **No Lifecycle Visibility**: Missing `[LIFECYCLE] MarketScanner switching to X mode` logs
3. **Passive Scans Indistinguishable**: Cannot tell passive scans from active scans in logs

**Operational Impact**: **MEDIUM** - Less visibility, but functionality works

---

### 16. Ready-to-Buy Logic

**Mode Dependencies**:
- Passive mode isolation
- Active pool accuracy
- Signal generation freeze

**Impact**: 🟡 **MEDIUM**

**Specific Impacts**:
1. **May Generate Signals During Passive**: If strategies run during passive, signals created
2. **Stale Pool Symbols**: If pool not cleared, signals may be based on expired data
3. **Signal Count Accuracy**: User sees signal counts during passive mode (should be frozen)

**Trading Risk**: **LOW-MEDIUM** - Signals may be generated but not executed if engine stopped

---

### 17. Cooldown Logic

**Mode Dependencies**:
- Mode isolation
- Active pool integration
- Symbol expiry

**Impact**: 🟡 **MEDIUM**

**Specific Impacts**:
1. **Mode Isolation Uncertain**: Cooldowns likely isolated (separate pools) but unverified
2. **Expiry During Passive**: TTL expiry continues during passive mode (may be correct)
3. **Integration with Pool**: Cooldown logic depends on pool accuracy

**Trading Risk**: **LOW** - Likely working correctly via pool isolation

---

### 18. Risk Manager

**Mode Dependencies**:
- Mode-specific guardrails
- Portfolio state isolation

**Impact**: ✅ **LOW**

**Specific Impacts**:
1. **Database Isolation Intact**: Guardrails stored per mode in database
2. **Portfolio Isolation Intact**: Separate portfolio states per mode
3. **No Direct Passive Dependencies**: Risk checks occur during trade execution (when active)

**Data Integrity Risk**: **NONE** - Mode isolation at database level survives

---

### 19. Database Schema

**Mode Dependencies**:
- Mode columns in tables
- Context isolation

**Impact**: ✅ **NONE**

**Why No Impact**:
- Database schema supports modes (mode columns present)
- Foreign keys and constraints intact
- Migration state unaffected by logic rollback

**Verdict**: Schema is foundation, logic rollback didn't affect it

---

### 20. Context Bridge

**Mode Dependencies**:
- Mode-specific routing
- Broadcast infrastructure

**Impact**: ✅ **NONE**

**Why No Impact**:
- WebSocket broadcast infrastructure intact
- Mode parameter correctly routed
- Instant broadcast timing (Phase 33.A) survived

**Verdict**: Infrastructure layer intact, logic layer regressed

---

### 21. Storage Layer

**Mode Dependencies**:
- Mode-aware methods

**Impact**: ✅ **NONE**

**Why No Impact**:
```typescript
// Mode-aware methods intact
storage.getSystemContext(mode)
storage.getPortfolioState({ mode })
storage.getScreenerFilters({ mode })
storage.getGuardrails({ mode })
```

**Verdict**: Storage API supports modes, caller logic regressed

---

### 22. Mode Registry

**Mode Dependencies**:
- Self (infrastructure)

**Impact**: ✅ **NONE**

**Why No Impact**:
- Mode registry fully intact (Phase 27.F.15.B.4)
- Engine instance tracking working
- Telemetry updates functional

**Verdict**: Infrastructure survived, dependent logic lost

---

### 23. Kraken API

**Mode Dependencies**:
- None (external service)

**Impact**: ✅ **NONE**

**Why No Impact**:
- External service, no mode awareness needed
- API calls same regardless of mode
- Mode isolation handled in application layer

**Verdict**: No mode dependencies

---

## Cascading Impact Chains

### Impact Chain 1: Passive Learning Rollback

```
1. FX5 Scanner (no passive check)
   ↓
2. Stage-3 Emitter (emits without skip)
   ↓
3. Scan24h Aggregator (records metrics)
   ↓
4. Database (metrics updated incorrectly)
   ↓
5. Filter Insights UI (shows updating metrics)
   ↓
6. User Confusion (banner says "paused" but data changes)
```

**Chain Impact**: 🔴 **CRITICAL** - Complete passive learning isolation failure

---

### Impact Chain 2: Engine Startup Delay

```
1. Trading Engine (no warmup)
   ↓
2. Paper Sim Service (143s delay)
   ↓
3. REST API (10s timeout)
   ↓
4. HTTP 500 Error (timeout)
   ↓
5. User (believes startup failed)
   ↓
6. Engine (starts silently 133s later)
   ↓
7. User Confusion (status shows active but they saw error)
```

**Chain Impact**: 🔴 **CRITICAL** - Severe UX degradation

---

### Impact Chain 3: Pool State Corruption

```
1. FX5 Scanner (no pool enforcement call)
   ↓
2. Active Filter Pool (method exists but orphaned)
   ↓
3. Pool (not cleared when engine stops)
   ↓
4. Engine Restart (pool may have stale symbols)
   ↓
5. Strategy Engine (evaluates stale pool)
   ↓
6. Ready-to-Buy (signals from expired symbols)
   ↓
7. Trade Execution (may trade stale opportunity)
```

**Chain Impact**: ⚠️  **HIGH** - Trading logic accuracy compromised

---

### Impact Chain 4: Status Synchronization Failure

```
1. Trading Engine (no state machine)
   ↓
2. Internal State (shows "ACTIVE")
   ↓
3. Trading State Sync (broadcasts "RUNNING")
   ↓
4. Frontend (shows "RUNNING" status)
   ↓
5. User (confused - is it ACTIVE or RUNNING?)
   ↓
6. UI Components (check for "ACTIVE" string, don't match)
   ↓
7. Features Disabled (waiting for "ACTIVE" that never comes)
```

**Chain Impact**: ⚠️  **HIGH** - UI/UX consistency broken

---

## Cross-Subsystem Dependencies

### Subsystems Blocked by Engine Startup Delay

**Directly Blocked** (cannot start until engine ready):
1. Signal Orchestrator
2. Strategy Engine  
3. Ready-to-Buy Logic
4. Trade Execution
5. Portfolio Updates

**Impact**: All trading functionality delayed 143 seconds

---

### Subsystems Affected by Passive Flag Disconnection

**Should Check Passive Flag** (but don't):
1. FX5 Scanner
2. Scan24h Aggregator (uses proxy)
3. Stage-3 Emitter
4. Metrics Core
5. Active Filter Pool (no caller)

**Impact**: Passive learning isolation completely broken

---

### Subsystems Dependent on Mode Isolation

**Architecturally Isolated**:
1. Active Filter Pool (separate pools)
2. Stage-3 Cache (separate states)
3. Portfolio Manager (separate portfolios)
4. Risk Manager (separate guardrails)

**Runtime Verification**: **MISSING** - Assumed but not proven

**Impact**: Mode isolation likely works, but unvalidated

---

## Restoration Priority Matrix

### P0 - Critical Path (Immediate)

**Must Restore** to fix 143s startup and passive learning:
1. **Engine Warmup** → Fixes 143s delay
2. **API Timeout** → Fixes false error
3. **FX5 Passive Check** → Fixes metrics during passive
4. **Pool Enforcement Caller** → Fixes stale pool
5. **Status Synchronization** → Fixes RUNNING vs ACTIVE

**Impact if Not Fixed**: System unusable, users abandon platform

---

### P1 - High Priority (Soon)

**Should Restore** for system integrity:
6. **State Machine (INIT→WARM→ACTIVE)** → Enables progress visibility
7. **Scan24h Explicit Passive Check** → Removes proxy dependency
8. **Orchestrator Readiness** → Prevents race conditions
9. **Telemetry** → Enables diagnostics
10. **Mode Branching Logging** → Improves observability

**Impact if Not Fixed**: Poor diagnostics, hidden bugs

---

### P2 - Medium Priority (Later)

**Nice to Have** for completeness:
11. **Mode Isolation Validation** → Proves runtime isolation
12. **Parallel Initialization** → Further startup optimization
13. **Passive Learning Tests** → Prevents future regressions

**Impact if Not Fixed**: Technical debt, regression risk

---

## Summary: Impact by Severity

| Severity | Count | Subsystems |
|----------|-------|------------|
| 🔴 **CRITICAL** | 8 | FX5 Scanner, Stage-3 Cache, Active Pool, Scan24h, Engine, Paper Sim, API, UI |
| ⚠️  **HIGH** | 5 | Orchestrator, Strategies, Portfolio, Metrics, Telemetry |
| 🟡 **MEDIUM** | 4 | WebSocket, MarketScanner, Ready-to-Buy, Cooldowns |
| ✅ **LOW/NONE** | 6 | Risk, DB Schema, Context, Storage, Registry, Kraken |

**Total Subsystems Analyzed**: 23  
**Subsystems Impacted**: 17 (74%)  
**Critical Impact**: 8 subsystems (35%)

---

## Operational Readiness Assessment

### Can System Trade Safely?

**Paper Mode**: 🔴 **NO** - Startup broken, passive mode broken, metrics corrupted

**Live Mode**: 🔴 **ABSOLUTELY NO** - Same issues + real money at risk

**Passive Learning**: 🔴 **BROKEN** - Metrics update when they shouldn't, UI misleading

**Recommended Action**: **DO NOT TRADE** until REB 2.4 restoration complete

---

**Report Generated**: November 23, 2025, 00:10 UTC  
**Audit Program**: Emergency Restoration & Bootstrap (REB)  
**Phase**: REB 2.3C - Mode System Impact Matrix  
**Status**: IMPACT ASSESSMENT COMPLETE  
**Critical Subsystems**: 8  
**Recommendation**: DO NOT TRADE - Restore P0 items immediately
