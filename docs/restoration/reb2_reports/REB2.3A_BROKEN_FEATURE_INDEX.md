# REB 2.3A: Broken Feature Index

**Status**: READ-ONLY AUDIT COMPLETE  
**Date**: November 22, 2025  
**Scope**: All missing/broken backend behaviors from Phase 8.1-8.5 truth state

---

## Executive Summary

This index catalogs **all backend behaviors guaranteed by Phase 8.1-8.5 truth state that are currently missing, broken, or uncertain** in the post-rollback system. Features are categorized by severity and restoration complexity.

**Total Broken/Missing Features**: **18**
- 🔴 Critical (User-Facing): **8**
- ⚠️  High (System-Facing): **4**
- 🟡 Medium (Uncertain): **6**

---

## 🔴 CRITICAL - User-Facing Broken Features

### 1. Engine Startup Takes 143+ Seconds

**Category**: Performance Regression  
**Phase**: 8.1-8.2 (Warmup/Bootstrap)  
**Severity**: 🔴 **CRITICAL**

**Truth State Guarantee**:
- Engine activates in <10 seconds
- User sees progress indicators during startup
- Smooth transition from start request to ACTIVE status

**Current Broken Behavior**:
- Engine takes **143 seconds** to reach "running" status
- API times out after 10 seconds, returns error to user
- Engine continues starting silently in background
- No progress indicators shown

**User Impact**:
- User clicks "Start Trading"
- Sees error message after 10 seconds
- Believes engine failed to start
- May click start again (creating duplicate attempts)
- Engine finally starts 2+ minutes later (silently)

**Evidence**:
```
22:35:53 - Start command sent
22:36:03 - API timeout error (10.1s)
22:38:16 - Engine reaches "running" (143s)
```

**Restoration Required**: Yes - high priority

---

### 2. API Returns Timeout Error Despite Eventual Success

**Category**: API Behavior Regression  
**Phase**: 8.1-8.2 (Warmup Integration)  
**Severity**: 🔴 **CRITICAL**

**Truth State Guarantee**:
- API waits for engine to fully start before responding
- Returns success when engine is ACTIVE
- Timeout value matches actual startup time

**Current Broken Behavior**:
- API has hardcoded 10-second timeout
- Returns error: "Engine start timeout"
- Engine continues starting after API response
- User sees failure, but engine eventually succeeds

**User Impact**:
- Confusing error messages
- User doesn't know if start succeeded or failed
- Must manually check status to confirm engine state
- Poor user experience

**Evidence**:
```typescript
// server/routes.ts line 2487
const ENGINE_START_TIMEOUT = 10000; // 10 seconds - TOO SHORT
```

**Restoration Required**: Yes - high priority

---

### 3. Engine Status Never Shows "ACTIVE"

**Category**: State Synchronization Broken  
**Phase**: 8.1-8.2 (State Machine)  
**Severity**: 🔴 **CRITICAL**

**Truth State Guarantee**:
- Engine status transitions through states: INIT → WARM → ACTIVE
- `/api/trading/status` reflects actual engine state
- UI shows "ACTIVE" when engine is fully operational

**Current Broken Behavior**:
- Engine status shows "RUNNING" instead of "ACTIVE"
- Internal state (Scan24hAggregator) shows "ACTIVE"
- External API shows "RUNNING"
- Status never transitions to "ACTIVE" in API response

**User Impact**:
- UI shows confusing status ("RUNNING" vs "ACTIVE")
- User uncertain if engine is fully operational
- Cannot distinguish between starting and running states

**Evidence**:
```
[Scan24hAggregator] Engine state updated: paper = ACTIVE
WebSocket: "status": "RUNNING", "isEngineActive": true
```

**Restoration Required**: Yes - medium priority

---

### 4. No Engine Startup Progress Indicators

**Category**: UX Feature Missing  
**Phase**: 8.1-8.2 (Warmup Progress)  
**Severity**: 🔴 **CRITICAL**

**Truth State Guarantee**:
- User sees real-time progress during engine startup
- Progress indicators show: "Initializing...", "Loading data...", "Activating...", "Ready"
- User knows engine is starting (not stuck)

**Current Broken Behavior**:
- No progress updates during 143-second startup
- User sees loading spinner with no status
- After 10 seconds, sees error (even though starting continues)
- No feedback on what's happening

**User Impact**:
- User thinks application is frozen
- No indication that startup is progressing
- Poor user experience during wait time

**Evidence**:
- No progress logs visible during startup
- No WebSocket progress broadcasts
- No status updates between "starting" and "running"

**Restoration Required**: Yes - medium priority

---

### 5. Engine Start Appears to Fail (But Succeeds Later)

**Category**: User Feedback Broken  
**Phase**: 8.1-8.2 (API Response)  
**Severity**: 🔴 **CRITICAL**

**Truth State Guarantee**:
- User receives immediate feedback on start success/failure
- API response indicates actual outcome
- User knows definitively if engine started

**Current Broken Behavior**:
- API returns error after 10 seconds
- User believes start failed
- Engine actually succeeds 133 seconds later
- No notification of eventual success

**User Impact**:
- User sees failure message
- Doesn't know engine will eventually start
- May abandon application or retry (creating conflicts)
- Loss of trust in system reliability

**Evidence**:
```json
{
  "error": "Engine start timeout",
  "message": "Trading engine failed to start within 10 seconds..."
}
```

**Restoration Required**: Yes - high priority

---

### 6. "Already Active" Breakdown Category Not Visible

**Category**: Filter Insights Incomplete  
**Phase**: 8.1 ("Already Active" Logic)  
**Severity**: 🔴 **MEDIUM-HIGH** (uncertain if broken or just not triggered)

**Truth State Guarantee**:
- Filter breakdown shows "already_active" count
- User can see how many symbols are in active pool
- Filter Insights tab displays complete breakdown

**Current Broken Behavior**:
- No "already_active" count in breakdown logs
- Breakdown shows all other categories, missing this one
- Cannot confirm if logic exists or is missing

**User Impact**:
- Cannot see how many symbols are currently active
- Filter breakdown incomplete
- May affect trade strategy decisions

**Evidence**:
```
breakdown: {
  failed_min_price: 34,
  failed_stablecoin: 2,
  failed_quote_currency: 3,
  passed_all_filters: 21
  // No "already_active" category
}
```

**Restoration Required**: Uncertain - needs validation with active pool

---

### 7. Long Startup Delay Blocks All Trading Operations

**Category**: System Availability  
**Phase**: 8.1-8.2 (Startup Optimization)  
**Severity**: 🔴 **CRITICAL**

**Truth State Guarantee**:
- Engine available for trading within seconds
- Fast iteration during development/testing
- Quick recovery from stops

**Current Broken Behavior**:
- 143-second startup delay blocks all operations
- Cannot trade for 2+ minutes after start request
- Development/testing severely impaired

**User Impact**:
- Long wait times to begin trading
- Cannot quickly test changes
- Productivity severely reduced
- Frustrating development experience

**Evidence**:
- Measured 143-second delay
- No operations possible during startup

**Restoration Required**: Yes - highest priority

---

### 8. Engine May Start Multiple Times If User Retries

**Category**: Idempotency Broken  
**Phase**: 8.1-8.2 (Start Logic)  
**Severity**: 🔴 **HIGH** (suspected)

**Truth State Guarantee**:
- Multiple start requests are idempotent
- Second start returns "already running"
- No duplicate engine instances

**Current Broken Behavior** (suspected):
- After timeout error, user may click start again
- Second request may create duplicate processes
- No clear idempotency protection visible

**User Impact**:
- May create conflicting engine instances
- Unpredictable behavior if multiple starts issued
- Potential resource leaks

**Evidence**:
- Cannot confirm without testing
- No idempotency logs visible
- Suspected based on API timeout pattern

**Restoration Required**: Uncertain - needs validation

---

## ⚠️  HIGH - System-Facing Broken Features

### 9. No Engine Warmup Phase

**Category**: Initialization Missing  
**Phase**: 8.1-8.2 (Warmup Logic)  
**Severity**: ⚠️  **HIGH**

**Truth State Guarantee**:
- Engine pre-warms data sources before activation
- Initial market data fetched during warmup
- Orchestrators initialized in parallel
- State caches pre-populated

**Current Broken Behavior**:
- No warmup phase in `start()` method
- Engine immediately sets `isRunning = true`
- No pre-warm logic visible
- Likely causes 143-second delay (cold start)

**System Impact**:
- Slow cold starts
- Sequential initialization instead of parallel
- No data pre-fetching
- Poor startup performance

**Evidence**:
```typescript
// server/services/trading-engine.ts
async start(): Promise<void> {
  this.isRunning = true;
  // No warmup logic
  this.signalOrchestrator = new SignalOrchestrator({...});
}
```

**Restoration Required**: Yes - critical path

---

### 10. No State Machine Transitions (INIT→WARM→ACTIVE)

**Category**: State Management Missing  
**Phase**: 8.1-8.2 (State Machine)  
**Severity**: ⚠️  **HIGH**

**Truth State Guarantee**:
- Engine transitions through defined states
- Each state has clear entry/exit conditions
- Status API reflects current state
- State transitions broadcast to UI

**Current Broken Behavior**:
- No state machine implementation visible
- Engine has binary state: running or not running
- No intermediate states (INIT, WARM)
- No state transition events

**System Impact**:
- Cannot track initialization progress
- No fine-grained status reporting
- Cannot implement state-specific logic
- Poor observability

**Evidence**:
- No state enum/types defined
- No state transition methods
- Status only shows "stopped" or "running"

**Restoration Required**: Yes - high priority

---

### 11. No Orchestrator Initialization Order/Readiness

**Category**: Orchestrator Logic Missing  
**Phase**: 8.1-8.2 (Orchestrator Bootstrap)  
**Severity**: ⚠️  **HIGH**

**Truth State Guarantee**:
- Orchestrators initialize in correct order
- Readiness checks before orchestrator start
- Dependencies validated before activation
- Event sequencing guaranteed

**Current Broken Behavior**:
- SignalOrchestrator instantiated synchronously
- No initialization order logic
- No readiness validation
- No dependency checks

**System Impact**:
- May cause race conditions
- Orchestrators may start before dependencies ready
- Unpredictable initialization order
- Potential startup failures

**Evidence**:
```typescript
// Immediate instantiation, no readiness check
this.signalOrchestrator = new SignalOrchestrator({...});
this.signalOrchestrator.start();
```

**Restoration Required**: Yes - medium-high priority

---

### 12. No Startup Telemetry/Metrics

**Category**: Observability Missing  
**Phase**: 8.1-8.2 (Startup Monitoring)  
**Severity**: ⚠️  **HIGH**

**Truth State Guarantee**:
- Startup timing metrics collected
- Warmup phase durations tracked
- Initialization steps logged
- Performance telemetry broadcast

**Current Broken Behavior**:
- No startup metrics visible
- No warmup timing data
- Cannot diagnose slow startups
- No performance monitoring

**System Impact**:
- Cannot measure startup performance
- Cannot identify bottlenecks
- Cannot track regression over time
- Poor operational visibility

**Evidence**:
- No telemetry logs during startup
- No metrics broadcasts
- No timing instrumentation

**Restoration Required**: Yes - medium priority

---

## 🟡 MEDIUM - Uncertain/Unvalidated Features

### 13. Race Condition Prevention Between Passive/Active Cycles

**Category**: Concurrency Safety  
**Phase**: 8.2 (Passive Learning Isolation)  
**Severity**: 🟡 **MEDIUM** (uncertain if broken)

**Truth State Guarantee**:
- Passive learning cycles isolated from active trading
- Mutex/locks prevent concurrent access
- No race conditions between modes
- Thread-safe state updates

**Current Broken Behavior** (suspected):
- No visible mutex/lock implementation
- Cannot confirm if race prevention exists
- Passive skip logic present, but isolation uncertain

**System Impact** (if broken):
- Potential data corruption
- State inconsistencies
- Unpredictable behavior during mode switches

**Evidence**:
- Some skip logic exists in Scan24hAggregator
- No mutex patterns visible in code
- Cannot confirm without deep analysis

**Restoration Required**: Uncertain - needs validation

---

### 14. Deep Passive Learning Path Isolation

**Category**: Data Flow Isolation  
**Phase**: 8.2 (Passive Isolation)  
**Severity**: 🟡 **MEDIUM** (uncertain if broken)

**Truth State Guarantee**:
- Passive learning uses completely separate data paths
- No shared state between passive and active
- Passive cannot affect trading decisions

**Current Broken Behavior** (suspected):
- Basic skip logic exists
- Deep isolation uncertain
- Data flow during passive mode unclear

**System Impact** (if broken):
- Passive learning may influence trading
- State leakage between modes
- Unexpected trading behavior

**Evidence**:
- Logs show data flowing during passive mode
- Cannot determine if isolated properly
- Requires deep analysis

**Restoration Required**: Uncertain - needs validation

---

### 15. Scan Cadence Drift Prevention

**Category**: Timing Stability  
**Phase**: 8.3 (Scan Cadence)  
**Severity**: 🟡 **LOW-MEDIUM** (uncertain if broken)

**Truth State Guarantee**:
- 30-second cadence maintained perfectly
- No timing drift over long periods
- Overlapping cycles prevented
- Timing corrections applied

**Current Broken Behavior** (suspected):
- 30-second cadence working (observed)
- Long-term drift not tested
- Drift prevention mechanism unclear

**System Impact** (if broken):
- Gradual timing drift over hours/days
- Scans may eventually overlap
- Cadence instability

**Evidence**:
- Short-term cadence correct
- No long-term testing performed
- No drift correction logic visible

**Restoration Required**: Uncertain - needs long-term validation

---

### 16. "Already Active" Integration with Cooldowns

**Category**: Cooldown Logic  
**Phase**: 8.1 (Already Active)  
**Severity**: 🟡 **MEDIUM** (uncertain if broken)

**Truth State Guarantee**:
- Symbols in active pool respect cooldowns
- "Already active" symbols skipped appropriately
- Cooldown tracking integrated

**Current Broken Behavior** (suspected):
- Active pool deduplication working
- Cooldown integration uncertain
- Cannot verify without active trading

**System Impact** (if broken):
- May violate cooldown rules
- Symbols may be re-entered too soon
- Trade safety compromised

**Evidence**:
- Active pool working
- Deduplication present
- Cooldown logic not tested

**Restoration Required**: Uncertain - needs active trading validation

---

### 17. Strategy Engine Integration with "Already Active"

**Category**: Strategy Execution  
**Phase**: 8.1 (Strategy Integration)  
**Severity**: 🟡 **MEDIUM** (uncertain if broken)

**Truth State Guarantee**:
- Strategies receive "already active" signals
- Ready-to-buy execution chain working
- Strategy invocation timing correct

**Current Broken Behavior** (suspected):
- SignalOrchestrator instantiated
- Integration with active pool uncertain
- Cannot verify without active trading

**System Impact** (if broken):
- Strategies may not respect active pool
- Duplicate trade attempts
- Trade logic confusion

**Evidence**:
- Orchestrator exists
- Integration not tested
- Cannot confirm without trading

**Restoration Required**: Uncertain - needs active trading validation

---

### 18. Parallel Initialization vs Sequential

**Category**: Performance Optimization  
**Phase**: 8.1-8.2 (Parallel Init)  
**Severity**: 🟡 **MEDIUM** (suspected missing)

**Truth State Guarantee**:
- Independent components initialize in parallel
- Database queries run concurrently
- Data fetches parallelized
- Faster startup through concurrency

**Current Broken Behavior** (suspected):
- Preflight checks use `Promise.all()` (good)
- Engine start appears sequential
- 143-second delay suggests sequential init

**System Impact** (if broken):
- Slow startups
- Underutilized resources
- Poor performance

**Evidence**:
```typescript
// Preflight: parallel (good)
const [filters, guardrails] = await Promise.all([...]);

// Engine start: sequential? (suspected)
const result = await startPaperSimulation(...);
// 143-second delay here
```

**Restoration Required**: Uncertain - needs profiling

---

## Feature Summary by Category

### Performance (5 features)

1. 🔴 Engine startup 143+ seconds
2. ⚠️  No warmup phase
3. ⚠️  No state machine transitions
4. 🟡 Sequential initialization suspected
5. 🟡 Timing drift prevention uncertain

### User Experience (4 features)

6. 🔴 API timeout error despite success
7. 🔴 No progress indicators
8. 🔴 Status never shows "ACTIVE"
9. 🔴 Start appears to fail

### System Reliability (5 features)

10. ⚠️  No orchestrator readiness
11. ⚠️  No startup telemetry
12. 🔴 Engine blocking all operations
13. 🔴 Multiple start attempts suspected
14. 🟡 Race conditions uncertain

### Feature Completeness (4 features)

15. 🔴 "Already active" not visible
16. 🟡 Passive isolation uncertain
17. 🟡 Cooldown integration uncertain
18. 🟡 Strategy integration uncertain

---

## Restoration Roadmap

### Phase 1: Critical Fixes (Immediate)

**Goal**: Make engine usable again

1. Restore warmup logic (fix 143s startup)
2. Fix API timeout (realistic value)
3. Add progress indicators
4. Fix status synchronization (RUNNING→ACTIVE)
5. Implement idempotency protection

**Target**: Engine starts in <10 seconds, user sees progress

---

### Phase 2: System Reliability (Soon)

**Goal**: Restore Phase 8.1-8.2 optimizations

6. Implement state machine (INIT→WARM→ACTIVE)
7. Add orchestrator readiness checks
8. Restore startup telemetry
9. Validate passive isolation
10. Test race condition prevention

**Target**: Robust, observable startup process

---

### Phase 3: Feature Validation (Later)

**Goal**: Confirm all features working

11. Validate "already active" with populated pool
12. Test cooldown integration
13. Test strategy integration
14. Validate long-term cadence stability
15. Profile parallel vs sequential init

**Target**: All Phase 8.1-8.5 features confirmed working

---

## Appendix: Feature Testing Requirements

### To Validate Uncertain Features

**Requires Active Trading Session**:
- "Already active" breakdown visibility
- Cooldown integration
- Strategy engine integration
- Multiple start idempotency

**Requires Long-Term Monitoring**:
- Cadence drift prevention
- Timing stability over days

**Requires Code Analysis**:
- Race condition prevention
- Passive path isolation
- Parallel initialization
- Mutex/lock implementation

**Requires Profiling**:
- Startup timing breakdown
- Bottleneck identification
- Sequential vs parallel analysis

---

**Report Generated**: November 22, 2025, 23:45 UTC  
**Audit Program**: Emergency Restoration & Bootstrap (REB)  
**Phase**: REB 2.3A - Broken Feature Index  
**Total Broken/Missing**: 18 features  
**Critical**: 8 features  
**High**: 4 features  
**Medium**: 6 features
