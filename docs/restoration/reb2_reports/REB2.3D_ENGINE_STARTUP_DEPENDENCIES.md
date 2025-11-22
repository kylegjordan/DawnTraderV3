# REB 2.3D - Engine Startup Dependencies

**Generated**: 2025-11-22  
**Phase**: Emergency Restoration & Bootstrap (REB) 2.3D  
**Purpose**: Map engine startup dependencies for Stage-1 and warmup restoration planning

---

## Executive Summary

**Critical Path**: Stage 1f → Stage 1g → Stage 1h → Warmup State Machine

**Dependency Insights**:
- ✅ **Stage 1f is independent** - Can be restored first (no dependencies)
- ✅ **Stage 1g depends on 1f** - Requires stateVersion system for ACK tracking
- ✅ **Stage 1h depends on 1g** - Requires ACK confirmation before blocking can be verified
- ⚠️ **Warmup depends on 1h** - State transitions must broadcast synchronously

**Total Restoration Time**: ~12-18 hours (sequential work)

---

## Stage-1 Dependency Chain

### Dependency Graph

```
Stage 1f (stateVersion)
    ↓
    └──→ Stage 1g (ACK broadcast) ──→ Stage 1h (Blocking await) ──→ Warmup State Machine
                                           ↓
                                           └──→ <1s Startup Target
```

---

## Stage 1f: Authoritative Start State (FOUNDATION)

### Dependencies

**Upstream**: NONE - This is the foundation.

**Downstream**:
- Stage 1g (requires stateVersion for ACK tracking)
- Stage 1h (requires stateVersion for broadcast verification)

### Files Modified

**Backend**:
- `server/services/trading-state-sync.ts`
  - Add `nextStateVersion()` helper
  - Implement stateVersion tracking in broadcasts
  - Add rejection logic for stale events
  - Enhanced logging (`[Stage-1f][REJECT]`, `[Stage-1f][ACCEPT]`, `[Stage-1f][RENDER]`)

**Frontend**:
- `client/src/hooks/use-trading.tsx`
  - Add stateVersion comparison logic
  - Reject stale state events
  - Enhanced logging (frontend mirror of backend)

### External Dependencies

- ✅ `Date.now()` (built-in, no dependencies)
- ✅ WebSocket infrastructure (already exists)
- ✅ Logger (already exists)

### Estimated Effort

**Time**: 2-3 hours  
**Complexity**: Low  
**Risk**: Low (isolated, no side effects)

---

## Stage 1g: Immediate Event Delivery & Handshake

### Dependencies

**Upstream**:
- ✅ **Stage 1f REQUIRED** - Needs stateVersion for ACK payload

**Downstream**:
- Stage 1h (requires ACK confirmation for blocking verification)

### Files Modified

**Backend**:
- `server/services/trading-state-sync.ts`
  - Add ACK broadcast system
  - Implement socket readiness checks
  - Enhanced logging (`[Stage-1g][ACK]` backend)
- `server/services/context-bridge.ts`
  - Verify broadcast delivery
  - Add client count validation

**Frontend**:
- `client/src/hooks/use-trading.tsx`
  - Add ACK reception logging
  - Track latency (<100ms target)
  - Enhanced logging (`[Stage-1g][ACK]` frontend)

### External Dependencies

- ✅ Stage 1f stateVersion system (from previous stage)
- ✅ WebSocket infrastructure (already exists)
- ✅ Context-bridge broadcast mechanism (already exists)

### Estimated Effort

**Time**: 3-4 hours  
**Complexity**: Medium  
**Risk**: Low (builds on 1f foundation)

---

## Stage 1h: Blocking Broadcast Before HTTP Response

### Dependencies

**Upstream**:
- ✅ **Stage 1f REQUIRED** - Needs stateVersion for broadcast payload
- ✅ **Stage 1g REQUIRED** - Needs ACK confirmation to verify blocking works

**Downstream**:
- Warmup State Machine (requires synchronous broadcasts for state transitions)

### Files Modified

**Backend**:
- `server/services/paper-execution-engine.ts`
  - Add `await` to `setEngineActive()` calls
  - Capture latency from return value
  - Enhanced logging (`[Stage-1h][BROADCAST]` with timing)
- `server/services/trading-engine.ts` (if live mode exists)
  - Same changes as paper-execution-engine.ts
- `server/routes.ts` (any other START endpoints)
  - Verify all engine activation paths use blocking pattern

### External Dependencies

- ✅ Stage 1f stateVersion system (from Stage 1f)
- ✅ Stage 1g ACK confirmation (from Stage 1g)
- ✅ `setEngineActive()` method (already exists in trading-state-sync.ts)

### Estimated Effort

**Time**: 1-2 hours  
**Complexity**: Low  
**Risk**: Low (simple await addition)

---

## Warmup State Machine (INIT→WARM→ACTIVE)

### Dependencies

**Upstream**:
- ✅ **Stage 1h REQUIRED** - State transitions must broadcast synchronously (<50ms)
- ✅ **Stage 1g RECOMMENDED** - ACK confirmation helps verify warmup broadcasts
- ✅ **Stage 1f RECOMMENDED** - StateVersion prevents duplicate warmup events

**Downstream**:
- NONE - This is the final optimization

### Files Modified

**Backend**:
- `server/services/paper-execution-engine.ts`
  - Define `EngineState` enum (INIT, WARM, ACTIVE)
  - Implement state transition logic
  - Add warmup phase (data loading, connections)
  - Enhanced logging (state transitions)
  - Target <1s total startup time
- `server/services/trading-engine.ts` (if live mode exists)
  - Same changes as paper-execution-engine.ts

### External Dependencies

- ✅ Stage 1h blocking broadcast (CRITICAL - state transitions must broadcast immediately)
- ✅ Database connection (for data loading in WARM phase)
- ✅ Kraken service (for connection verification in WARM phase)
- ❓ Unknown other dependencies (need more truth documentation)

### Estimated Effort

**Time**: 4-6 hours  
**Complexity**: Medium-High  
**Risk**: Medium (requires deep engine refactor)

**Uncertainty**: Truth documentation sparse on warmup implementation details.

---

## Restoration Sequence

### Phase 1: Foundation (Stage 1f)

**Order**: 1st  
**Duration**: 2-3 hours  
**Blockers**: NONE

**Tasks**:
1. Add `nextStateVersion()` helper to trading-state-sync.ts
2. Implement stateVersion tracking in broadcasts
3. Add rejection logic for stale events
4. Enhanced logging (backend + frontend)
5. Test: Verify duplicate broadcasts rejected

**Success Criteria**:
- ✅ `[Stage-1f][REJECT]` logs show stale events rejected
- ✅ `[Stage-1f][ACCEPT]` logs show new events accepted
- ✅ Frontend logs match backend logs
- ✅ StateVersion increases monotonically

---

### Phase 2: Confirmation (Stage 1g)

**Order**: 2nd (AFTER Stage 1f)  
**Duration**: 3-4 hours  
**Blockers**: Requires Stage 1f completion

**Tasks**:
1. Add ACK broadcast system to trading-state-sync.ts
2. Implement socket readiness checks
3. Enhanced logging (backend + frontend)
4. Verify delivery in context-bridge.ts
5. Test: Verify ACK latency <100ms

**Success Criteria**:
- ✅ `[Stage-1g][ACK]` backend logs show broadcast confirmation
- ✅ `[Stage-1g][ACK]` frontend logs show reception within <100ms
- ✅ Socket readiness verified before broadcast
- ✅ Client count validation working

---

### Phase 3: Blocking (Stage 1h)

**Order**: 3rd (AFTER Stage 1g)  
**Duration**: 1-2 hours  
**Blockers**: Requires Stage 1g completion

**Tasks**:
1. Add `await` to all `setEngineActive()` calls
2. Capture latency from return value
3. Enhanced logging (`[Stage-1h][BROADCAST]` with timing)
4. Verify all engine activation paths
5. Test: Verify TopBar updates <200ms

**Success Criteria**:
- ✅ `[Stage-1h][BROADCAST]` logs show <50ms latency
- ✅ TopBar updates within <200ms (not 30-40s)
- ✅ All START endpoints use blocking pattern
- ✅ No fire-and-forget broadcasts remain

---

### Phase 4: Warmup (State Machine)

**Order**: 4th (AFTER Stage 1h)  
**Duration**: 4-6 hours  
**Blockers**: Requires Stage 1h completion

**Tasks**:
1. Define `EngineState` enum (INIT, WARM, ACTIVE)
2. Implement state transition logic
3. Add warmup phase (data loading, connections)
4. Enhanced logging (state transitions)
5. Test: Verify <1s total startup time

**Success Criteria**:
- ✅ State machine logs show INIT → WARM → ACTIVE transitions
- ✅ Total startup <1s (not 143s)
- ✅ Each state transition broadcasts immediately (<50ms)
- ✅ Warmup phase loads data and verifies connections
- ✅ Edge cases handled (STOP during WARM, etc.)

---

## Critical Path Analysis

### Parallel Work Opportunities

**NONE** - All stages are sequential:
- Stage 1g requires Stage 1f stateVersion
- Stage 1h requires Stage 1g ACK confirmation
- Warmup requires Stage 1h blocking broadcasts

**Implication**: Restoration must be sequential. No parallelization possible.

---

### Risk Analysis

| Stage | Risk Level | Risk Factors | Mitigation |
|-------|-----------|--------------|------------|
| Stage 1f | **Low** | Isolated change, no side effects | Thorough testing of rejection logic |
| Stage 1g | **Low** | Builds on 1f, well-documented | Verify socket readiness before broadcast |
| Stage 1h | **Low** | Simple await addition | Test under load (rapid START/STOP) |
| Warmup | **Medium** | Deep refactor, sparse truth docs | Search for more truth docs, ask user for context |

---

### Uncertainty Factors

**1. Warmup Implementation Details**

**Gap**: Truth documentation sparse on INIT→WARM→ACTIVE implementation.

**Questions**:
- What happens in WARM phase? (data loading? connection checks?)
- How long should WARM phase take? (sub-1s total, but how distributed?)
- What triggers WARM → ACTIVE transition?
- How are errors handled? (WARM fails → INIT? or stay in WARM?)

**Mitigation**: Search for Phase 27.F directives, interview user for memory.

---

**2. Unknown Stage 1a-1e Dependencies**

**Gap**: Stages 1a-1e inferred but not documented.

**Risk**: If 1a-1e introduced foundational changes that 1f-1h depend on, restoration may fail.

**Mitigation**: Thoroughly test each stage after implementation. If failures occur, search for missing 1a-1e context.

---

## External Dependencies Map

### Stage 1f Dependencies
```
nextStateVersion()
    ↓
Date.now() (built-in)

stateVersion tracking
    ↓
WebSocket broadcasts (context-bridge)
    ↓
Logger (existing)
```

### Stage 1g Dependencies
```
ACK broadcast
    ↓
├─→ Stage 1f stateVersion (for ACK payload)
└─→ context-bridge.ts (for delivery verification)

Socket readiness
    ↓
WebSocket infrastructure (existing)
```

### Stage 1h Dependencies
```
Blocking await
    ↓
├─→ setEngineActive() method (trading-state-sync)
│       ↓
│       ├─→ Stage 1f stateVersion (for broadcast payload)
│       └─→ Stage 1g ACK confirmation (for verification)
└─→ All engine activation paths (paper-execution-engine, trading-engine, routes)
```

### Warmup Dependencies
```
State Machine
    ↓
├─→ Stage 1h blocking broadcast (CRITICAL)
├─→ Database connection (for WARM phase data loading)
├─→ Kraken service (for connection verification)
└─→ Unknown other dependencies (need more truth docs)
```

---

## Testing Dependencies

### Stage 1f Testing Requires
- ✅ WebSocket connection (use-websocket.tsx)
- ✅ Browser console access (for frontend logs)
- ✅ Backend logs access (for server logs)
- ✅ Ability to click START multiple times (to generate stale events)

### Stage 1g Testing Requires
- ✅ Stage 1f implementation (for stateVersion in ACK)
- ✅ Socket readiness (context-bridge working)
- ✅ Latency measurement tools (browser console timing)

### Stage 1h Testing Requires
- ✅ Stage 1g implementation (for ACK confirmation)
- ✅ TopBar component (for visual verification)
- ✅ Load testing ability (rapid START/STOP cycles)

### Warmup Testing Requires
- ✅ Stage 1h implementation (for synchronous broadcasts)
- ✅ Database seeded with data (for WARM phase loading)
- ✅ Kraken connection active (for connection verification)
- ✅ Performance measurement tools (startup timing)

---

## Restoration Roadmap

### Total Time Estimate: 12-18 hours

**Breakdown**:
- Stage 1f: 2-3 hours
- Stage 1g: 3-4 hours
- Stage 1h: 1-2 hours
- Warmup: 4-6 hours
- Testing & verification: 2-3 hours

**Critical Path**: SEQUENTIAL (no parallel work)

**Buffer**: +20% for unexpected issues (add 2-4 hours)

**Total with buffer**: 14-22 hours

---

## Recommendations

### 1. Restore in Dependency Order

**Rationale**: Each stage depends on the previous. Skipping ahead will fail.

**Approach**: 1f → 1g → 1h → Warmup (strict order)

---

### 2. Test Thoroughly After Each Stage

**Rationale**: Dependencies mean later stages fail if earlier stages have bugs.

**Approach**: Complete testing checklist after each stage before proceeding.

---

### 3. Search for Missing Warmup Documentation

**Rationale**: Warmup truth documentation sparse, need more details.

**Approach**:
- Search for Phase 27.F directives in truth archives
- Check for INIT/WARM/ACTIVE references in Nov 20 archive
- Interview user for memory of warmup implementation

---

### 4. Consider Incremental Deployment

**Rationale**: Restore 1f/1g/1h first (easier), defer warmup if time-constrained.

**Approach**:
- Deploy 1f/1g/1h to get <200ms UI updates (biggest user impact)
- Defer warmup to get <1s startup (performance optimization)

**Benefit**: Quick wins (eliminate 30-40s delays) without full warmup complexity.

---

## Next Report

**REB2.3D_RESTORATION_RECOMMENDATIONS.md**: Final report with prioritized restoration plan

---

## References

### Truth Archives
- `docs/restoration/truth/DawnTrader_Chat_Archive_11-15-25_1763821067416.md` (Stage-1 sequence)
- `docs/stage-1h-analysis/ANALYSIS_SUMMARY.md` (Stage 1h details)
- `docs/restoration/reb2_reports/REB2.3D_STAGE_1H_TRUTH_REPORT.md` (Stage-1 truth vs current)

### Current State
- `server/services/trading-state-sync.ts` (setEngineActive implementation)
- `server/services/paper-execution-engine.ts` (engine startup)
- `client/src/hooks/use-trading.tsx` (frontend state management)

---

**Document Version**: 1.0  
**Last Updated**: 2025-11-22  
**Next Report**: REB2.3D_RESTORATION_RECOMMENDATIONS.md (FINAL)
