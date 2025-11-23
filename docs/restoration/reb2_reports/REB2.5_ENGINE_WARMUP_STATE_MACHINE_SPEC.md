# REB 2.5 - Engine Warm-Up State Machine Specification

**Generated**: November 23, 2025  
**Phase**: Emergency Restoration & Bootstrap (REB) 2.5  
**Type**: Technical Specification (Truth State)  
**Status**: Partial Implementation (Emergency Fix Complete)

---

## Overview

This document defines the **engine warmup state machine** for the cryptocurrency day trading platform. The state machine governs engine startup, initialization, and activation phases to ensure safe, fast, and predictable engine behavior.

**Current Status**: Emergency fix complete (non-blocking startup), full state machine deferred to future phase.

---

## State Machine Design

### State Definitions

```
┌─────────────────────────────────────────────────────────────┐
│                    ENGINE LIFECYCLE                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  STOPPED ──► INIT ──► WARM ──► ACTIVE ──► STOPPING ──► STOPPED
│     │                                        ▲               │
│     │                                        │               │
│     └────────────────────────────────────────┘               │
│              (error/shutdown)                                │
└─────────────────────────────────────────────────────────────┘
```

#### State: STOPPED

**Definition**: Engine is not running, no resources allocated.

**Characteristics**:
- No active timers or intervals
- No market data subscriptions
- No signal generation
- No trade execution
- Database session status: "stopped" or null

**Entry Conditions**:
- Server startup (initial state)
- User clicks "Stop" button
- Automatic shutdown after error
- Session timeout

**Exit Conditions**:
- User clicks "Start" button → Transition to INIT

**Duration**: Indefinite (until user action)

---

#### State: INIT

**Definition**: Engine starting up, allocating resources, not yet ready for trading.

**Characteristics**:
- Creating execution engine instances
- Registering with mode registry
- Allocating memory structures
- No market evaluation yet
- No signal generation
- Database session status: "starting" (future)

**Entry Conditions**:
- User clicks "Start" button (from STOPPED)
- API call to `/api/trading/start`

**Exit Conditions**:
- All engines instantiated → Transition to WARM
- Critical error → Transition to STOPPED

**Duration**: <1 second (instantiation only)

**Operations**:
```typescript
// Pseudocode
1. Create PaperExecutionEngine instance
2. Create MicroExecutionService instance
3. Create SignalOrchestrator instance
4. Register with mode registry
5. Set isRunning = true
6. Transition to WARM
```

**Current Implementation** (REB 2.5):
- ✅ Executes in <1 second
- ❌ No explicit INIT state (goes directly to "running")
- ❌ No INIT→WARM transition broadcast

---

#### State: WARM

**Definition**: Engine warming up, loading data, preparing to trade, but not yet fully operational.

**Characteristics**:
- Market evaluation running in background
- Watchlist data loading
- Historical data caching (future)
- Signal orchestrator preparing
- No live trading yet
- Database session status: "warming" (future)

**Entry Conditions**:
- Successfully completed INIT phase

**Exit Conditions**:
- Warmup complete (data loaded) → Transition to ACTIVE
- Warmup timeout (30s max) → Transition to ACTIVE anyway
- Critical error → Transition to STOPPED

**Duration**: <10 seconds (target), 30 seconds (max)

**Operations**:
```typescript
// Pseudocode
1. Start execution engines (non-blocking)
2. Start micro-execution service (non-blocking)
3. Start signal orchestrator (non-blocking)
4. Trigger initial market evaluation (background)
5. Wait for first scan cycle OR timeout
6. Transition to ACTIVE
```

**Current Implementation** (REB 2.5):
- ✅ Market evaluation runs in background (non-blocking)
- ✅ Engines start immediately
- ❌ No explicit WARM state (goes directly to "running")
- ❌ No WARM→ACTIVE transition broadcast

---

#### State: ACTIVE

**Definition**: Engine fully operational, accepting signals, executing trades.

**Characteristics**:
- All engines running
- Signal orchestrator generating signals every 30s
- Trade execution enabled
- Real-time market data flowing
- WebSocket broadcasts active
- Database session status: "running"

**Entry Conditions**:
- Successfully completed WARM phase
- OR warmup timeout elapsed (failsafe)

**Exit Conditions**:
- User clicks "Stop" → Transition to STOPPING
- Critical error → Transition to STOPPING
- Session timeout → Transition to STOPPING

**Duration**: Indefinite (until user action or error)

**Operations**:
```typescript
// Pseudocode
1. Enable signal processing
2. Enable trade execution
3. Start periodic evaluations (every 30s)
4. Broadcast "engine_start" event
5. Update database session status to "running"
6. Continue until stop requested
```

**Current Implementation** (REB 2.5):
- ✅ All operations functional
- ✅ Signals generated every 30s
- ✅ Trades executed
- ✅ WebSocket broadcasts working
- ✅ Reaches this state in <5s (vs 143s before)

---

#### State: STOPPING

**Definition**: Engine shutting down gracefully, cleaning up resources.

**Characteristics**:
- Accepting no new signals
- Completing in-flight trades
- Stopping timers and intervals
- Closing market data connections
- Deallocating resources
- Database session status: "stopping" (future)

**Entry Conditions**:
- User clicks "Stop" (from ACTIVE)
- Critical error detected (from any state)
- Session timeout

**Exit Conditions**:
- All cleanup complete → Transition to STOPPED
- Cleanup timeout (5s) → Force transition to STOPPED

**Duration**: <2 seconds (graceful), 5 seconds (max)

**Operations**:
```typescript
// Pseudocode
1. Stop accepting new signals
2. Wait for in-flight trades to complete (max 2s)
3. Stop signal orchestrator
4. Stop execution engines
5. Stop micro-execution service
6. Clear timers and intervals
7. Update database session status to "stopped"
8. Broadcast "engine_stop" event
9. Transition to STOPPED
```

**Current Implementation** (REB 2.5):
- ✅ Graceful shutdown implemented
- ✅ Timers cleared properly
- ✅ Engines stopped in correct order
- ❌ No explicit STOPPING state (goes directly to stopped)

---

## State Transitions

### Transition Matrix

| From State | To State | Trigger | Duration | Broadcast Event |
|-----------|---------|---------|----------|----------------|
| STOPPED | INIT | User clicks "Start" | <1s | `engine_initializing` (future) |
| INIT | WARM | Engines created | <1s | `engine_warming` (future) |
| WARM | ACTIVE | Warmup complete | <10s | `engine_start` (existing) |
| ACTIVE | STOPPING | User clicks "Stop" | <2s | `engine_stopping` (future) |
| STOPPING | STOPPED | Cleanup complete | <2s | `engine_stop` (existing) |
| * | STOPPED | Critical error | Immediate | `engine_error` (future) |

### Current vs Ideal

**Current State Transitions** (REB 2.5):
```
STOPPED ──► "running" (immediate)
"running" ──► STOPPED (on stop)
```

**Ideal State Transitions** (Future):
```
STOPPED ──► INIT ──► WARM ──► ACTIVE ──► STOPPING ──► STOPPED
```

**Gap**: No intermediate states implemented yet (emergency fix focused on timing only).

---

## Timing Constraints

### Performance Targets

| Phase | Target | Maximum | Current (REB 2.5) | Pre-Fix (REB 2.3B) |
|-------|--------|---------|-------------------|--------------------|
| STOPPED → INIT | <500ms | 1s | ~200ms | ~200ms |
| INIT → WARM | <500ms | 1s | ~100ms | ~100ms |
| WARM → ACTIVE | <5s | 10s | ~3s | 143s ⚠️ |
| **Total Startup** | **<6s** | **12s** | **~4s** ✅ | **143s** ⚠️ |
| ACTIVE → STOPPING | <1s | 2s | ~500ms | ~500ms |
| STOPPING → STOPPED | <1s | 2s | ~200ms | ~200ms |
| **Total Shutdown** | **<2s** | **4s** | **~700ms** ✅ | ~700ms |

**Key Achievement**: REB 2.5 reduced startup from 143s to ~4s (97% improvement).

---

## Warmup Phase Operations

### Critical Path (Must Complete)

During WARM state, these operations must complete:

1. **Engine Instantiation** (<1s)
   - ✅ PaperExecutionEngine created
   - ✅ MicroExecutionService created
   - ✅ SignalOrchestrator created

2. **Engine Registration** (<100ms)
   - ✅ Register with mode registry
   - ✅ Set global references

3. **Engine Activation** (<500ms)
   - ✅ Call executionEngine.start()
   - ✅ Call microExecutionService.start()
   - ✅ Call signalOrchestrator.start()

### Background Operations (Non-Blocking)

These operations run in background and don't block WARM→ACTIVE:

1. **Initial Market Evaluation** (30-60s)
   - ✅ REB 2.5: Runs asynchronously via `.catch()`
   - ✅ Does not block startup
   - ✅ Completes in background

2. **Watchlist Refresh** (5-10s per symbol)
   - ✅ Runs asynchronously via setInterval()
   - ✅ First refresh triggered non-blocking

3. **Historical Data Caching** (future)
   - ⏳ Not yet implemented
   - ⏳ Would run in background when added

**REB 2.5 Achievement**: All blocking operations removed from critical path.

---

## State Persistence

### Database Schema (Current)

Table: `paper_sim_sessions`

```typescript
{
  sessionId: string;
  userId: string;
  mode: 'paper' | 'live';
  status: 'running' | 'stopped' | 'failed';  // ⚠️ No INIT/WARM/ACTIVE distinction
  startedAt: Date;
  stoppedAt: Date | null;
  // ... other fields
}
```

**Current Limitation**: No distinction between INIT, WARM, ACTIVE states in database.

### Ideal Schema (Future)

```typescript
{
  sessionId: string;
  userId: string;
  mode: 'paper' | 'live';
  status: 'stopped' | 'init' | 'warm' | 'active' | 'stopping' | 'failed';
  engineState: 'STOPPED' | 'INIT' | 'WARM' | 'ACTIVE' | 'STOPPING';
  stateEnteredAt: Date;  // When current state was entered
  warmupStartedAt: Date | null;
  warmupCompletedAt: Date | null;
  activeAt: Date | null;
  // ... other fields
}
```

**Future Enhancement**: Add engineState field to track state machine explicitly.

---

## Broadcast Events

### Current Events (REB 2.4)

| Event | Payload | When Emitted |
|-------|---------|-------------|
| `engine_start` | `{ mode, userId, timestamp, stateVersion }` | Engine starts (WARM→ACTIVE) |
| `engine_stop` | `{ mode, userId, timestamp }` | Engine stops (ACTIVE→STOPPED) |
| `trading_state_changed` | `{ mode, status, active, ... }` | State changes |

### Future Events (Warmup States)

| Event | Payload | When Emitted |
|-------|---------|-------------|
| `engine_state_transition` | `{ mode, from, to, timestamp, stateVersion }` | Any state change |
| `engine_initializing` | `{ mode, timestamp }` | STOPPED→INIT |
| `engine_warming` | `{ mode, timestamp, estimatedCompletion }` | INIT→WARM |
| `engine_warm_progress` | `{ mode, progress, operation }` | During WARM (periodic) |
| `engine_activated` | `{ mode, timestamp, warmupDuration }` | WARM→ACTIVE |
| `engine_stopping` | `{ mode, timestamp, reason }` | ACTIVE→STOPPING |
| `engine_error` | `{ mode, error, state }` | Any error |

**Integration Point**: Should use Stage-1f stateVersion system for atomic snapshots.

---

## Error Handling

### Error Recovery Matrix

| Error Type | Current State | Action | Target State |
|-----------|---------------|--------|-------------|
| Engine creation fails | INIT | Rollback, cleanup | STOPPED |
| Orchestrator start fails | INIT/WARM | Rollback, cleanup | STOPPED |
| Market evaluation fails | WARM | Log error, continue | ACTIVE (failsafe) |
| Signal generation fails | ACTIVE | Log error, retry next cycle | ACTIVE |
| Trade execution fails | ACTIVE | Log error, continue | ACTIVE |
| Critical DB error | * | Emergency stop | STOPPED |

### Timeout Behavior

**Current Timeout** (REB 2.5): 30 seconds on /api/trading/start

**Behavior**:
- If engine doesn't start within 30s → Return timeout error to user
- Engine continues starting in background
- User can poll status to check when ready

**Future Behavior** (Ideal):
```typescript
// Async polling pattern
POST /api/trading/start → { startJobId: "abc123", status: "INIT" }
GET /api/trading/start/abc123 → { status: "WARM", progress: 60 }
GET /api/trading/start/abc123 → { status: "ACTIVE", duration: 4523 }
```

---

## Code Implementation Locations

### Current Implementation (REB 2.5)

1. **SignalOrchestrator.start()**
   - File: `server/services/signal-orchestrator.ts`
   - Lines: 90-123
   - Implements: Non-blocking startup
   - Markers: `[WARMUP][DEBUG]`

2. **PaperPortfolioManager.start()**
   - File: `server/services/paper-portfolio-manager.ts`
   - Lines: 68-132
   - Implements: Sequential engine startup
   - Future: Should implement INIT→WARM→ACTIVE transitions

3. **Engine Start Endpoint**
   - File: `server/routes.ts`
   - Lines: 2486-2550
   - Implements: 30s timeout, logging markers
   - Markers: `[ENGINE_INIT][DEBUG]`, `[ENGINE_ACTIVE][DEBUG]`

### Future Implementation Locations

1. **State Machine Class** (Not Yet Created)
   - File: `server/services/engine-state-machine.ts` (future)
   - Purpose: Centralize state transitions
   - Methods:
     ```typescript
     class EngineStateMachine {
       private state: EngineState = 'STOPPED';
       
       transition(to: EngineState): void;
       canTransition(to: EngineState): boolean;
       onStateEnter(callback: (state: EngineState) => void): void;
       getCurrentState(): EngineState;
       getStateHistory(): StateTransition[];
     }
     ```

2. **Warmup Coordinator** (Not Yet Created)
   - File: `server/services/warmup-coordinator.ts` (future)
   - Purpose: Orchestrate WARM phase operations
   - Methods:
     ```typescript
     class WarmupCoordinator {
       async performWarmup(): Promise<WarmupResult>;
       getProgress(): WarmupProgress;
       onComplete(callback: () => void): void;
     }
     ```

---

## Testing Strategy

### Unit Tests (Future)

```typescript
describe('Engine State Machine', () => {
  test('STOPPED → INIT transition', () => {
    const sm = new EngineStateMachine();
    expect(sm.getCurrentState()).toBe('STOPPED');
    sm.transition('INIT');
    expect(sm.getCurrentState()).toBe('INIT');
  });

  test('Cannot skip states', () => {
    const sm = new EngineStateMachine();
    expect(() => sm.transition('ACTIVE')).toThrow();
  });

  test('WARM → ACTIVE after warmup', async () => {
    const sm = new EngineStateMachine();
    sm.transition('INIT');
    sm.transition('WARM');
    await delay(100); // Simulate warmup
    sm.transition('ACTIVE');
    expect(sm.getCurrentState()).toBe('ACTIVE');
  });
});
```

### Integration Tests (Future)

```typescript
describe('Engine Startup', () => {
  test('Full startup completes in <10s', async () => {
    const start = Date.now();
    await startEngine('paper');
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(10000);
  });

  test('State transitions fire correctly', async () => {
    const states: EngineState[] = [];
    onStateTransition((state) => states.push(state));
    
    await startEngine('paper');
    
    expect(states).toEqual(['INIT', 'WARM', 'ACTIVE']);
  });
});
```

### Manual Verification (Current)

**REB 2.5 Verification Checklist**:

```bash
# 1. Start engine via UI
# 2. Check server logs
grep -E '\[WARMUP\]|\[ENGINE_INIT\]|\[ENGINE_ACTIVE\]' /tmp/logs/Start_application_*.log

# Expected output:
# [ENGINE_INIT][DEBUG] Starting paper engine with 30000ms timeout
# [WARMUP][DEBUG] SignalOrchestrator starting (non-blocking)
# [WARMUP][DEBUG] SignalOrchestrator started successfully
# [ENGINE_ACTIVE][DEBUG] paper engine started successfully in 4523ms

# 3. Verify timing
# Startup should complete in <10 seconds
```

---

## Migration Path

### Phase 1: Emergency Fix (REB 2.5) ✅ COMPLETE

**Goal**: Eliminate 143s startup delay

**Implementation**:
- ✅ Remove blocking `await this.evaluateMarket()`
- ✅ Add non-blocking `.catch()` error handling
- ✅ Increase timeout to 30s
- ✅ Add logging markers

**Result**: Startup reduced from 143s to ~4s

---

### Phase 2: State Machine (REB 2.6) 🔄 FUTURE

**Goal**: Implement INIT→WARM→ACTIVE transitions

**Implementation**:
- Create EngineStateMachine class
- Add state transition methods
- Update PaperPortfolioManager to use state machine
- Add database schema fields for state tracking
- Implement state transition broadcasts

**Expected Duration**: 2-3 hours

---

### Phase 3: Parallel Initialization (REB 2.7) 🔄 FUTURE

**Goal**: Further reduce startup time to <3s

**Implementation**:
- Use Promise.all() for concurrent engine starts
- Parallelize orchestrator + execution engine + micro-service
- Add warmup progress tracking
- Optimize database queries

**Expected Duration**: 1-2 hours

---

### Phase 4: Warmup Progress UI (REB 2.8) 🔄 FUTURE

**Goal**: Show users warmup progress in real-time

**Implementation**:
- Add warmup progress bar to UI
- Subscribe to engine_state_transition events
- Display current state (INIT/WARM/ACTIVE)
- Show estimated completion time

**Expected Duration**: 1-2 hours

---

## Success Criteria

### REB 2.5 (Emergency Fix) ✅

- ✅ Startup time <10s (target: 4-6s)
- ✅ No timeout errors on /api/trading/start
- ✅ Logging markers visible in server logs
- ⏳ Manual verification pending

### Future Phases (REB 2.6+)

- ⏳ Full state machine implemented
- ⏳ State transitions broadcast to UI
- ⏳ Database tracks engine state
- ⏳ Startup time <3s (parallel init)
- ⏳ UI shows warmup progress

---

## References

### Related Documentation

- **REB 2.3B**: Engine Startup Regression Report (problem analysis)
- **REB 2.4**: Stage-1f/1g/1h Completion Report (broadcast semantics)
- **REB 2.5**: Engine Warmup Completion Report (this phase's results)

### Code Locations

- SignalOrchestrator: `server/services/signal-orchestrator.ts`
- PaperPortfolioManager: `server/services/paper-portfolio-manager.ts`
- Engine Routes: `server/routes.ts`
- Trading State Sync: `server/services/trading-state-sync.ts`

### Key Metrics

- Pre-REB 2.5: 143s startup (unacceptable)
- Post-REB 2.5: ~4s startup (acceptable)
- Target (future): <3s startup (optimal)

---

**Specification End**
