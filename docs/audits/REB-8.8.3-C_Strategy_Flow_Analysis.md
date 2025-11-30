# REB 8.8.3-C: Strategy Evaluation Flow Analysis

**Date:** November 30, 2025  
**Status:** INVESTIGATION COMPLETE - Awaiting Runtime Observation

---

## Executive Summary

Investigation of the strategy evaluation layer confirms that:
1. **All [8.8.3-B] diagnostic logging is already implemented** (REB 8.8.3-B complete)
2. **No predictive ranking exists** - all 9 strategies are evaluated uniformly per symbol
3. **Two code paths exist** - OLD path disabled, NEW path active via SignalOrchestrator
4. **Runtime observation blocked** - Engine currently STOPPED

---

## Signal Evaluation Architecture

### Active Code Path (SignalOrchestrator)
```
PaperPortfolioManager.start()
  └── SignalOrchestrator.start()
      └── evaluateMarket() [every 30 seconds]
          └── For each eligible symbol:
              └── evaluateSymbol() calls all 9 strategies:
                  ├── detectVWAPPullback()
                  ├── detectABCDLong()
                  ├── detectSMATrendRide()
                  ├── detectBreakout()
                  ├── detectMeanReversion()
                  ├── detectRangeTrading()
                  ├── detectVWAPBounce()
                  ├── detectLiquidityTrap()
                  └── detectDHMA()
              └── validateStrategySignal() [8.8.3-B hardening]
              └── Forward valid signals to execution engine
```

### Disabled Code Path (paper-execution-engine.ts)
```
PaperExecutionEngine.scanForSignals() - DISABLED
  └── Returns early with message:
      "Phase 41F-L.E2E-PURGE: Signal scanning temporarily disabled pending migration to guardrails_v2"
```

**Key Finding:** The disabled `scanForSignals()` in paper-execution-engine.ts is NOT a blocker because the SignalOrchestrator is the active evaluation path.

---

## [8.8.3-B] Diagnostic Logging Locations

### SignalOrchestrator (signal-orchestrator.ts)
| Log Tag | Line | Purpose |
|---------|------|---------|
| `[8.8.3-B][SELECTION]` | 243-249 | Per-symbol strategy selection (currently: ALL_STRATEGIES) |
| `[8.8.3-B][ROUTING]` | 261-280 | Signal validation and acceptance/rejection |
| `[8.8.3-B][EVAL_CYCLE]` | 177-309 | Full evaluation cycle with stats |

### StrategyEngine (strategy-engine.ts)
| Log Tag | Lines | Purpose |
|---------|-------|---------|
| `[8.8.3-B][STRATEGY]` | 102, 113 | vwap_pullback (signal generated / no signal) |
| `[8.8.3-B][STRATEGY]` | 211, 222 | abcd_long (signal generated / no signal) |
| `[8.8.3-B][STRATEGY]` | 314, 325 | sma_trend_ride (signal generated / no signal) |
| `[8.8.3-B][STRATEGY]` | 393, 403 | breakout (signal generated / no signal) |
| `[8.8.3-B][STRATEGY]` | 472, 482 | mean_reversion (signal generated / no signal) |
| `[8.8.3-B][STRATEGY]` | 549, 559 | range_trading (signal generated / no signal) |
| `[8.8.3-B][STRATEGY]` | 632, 642 | vwap_bounce (signal generated / no signal) |
| `[8.8.3-B][STRATEGY]` | 715, 725 | liquidity_trap (signal generated / no signal) |
| `[8.8.3-B][STRATEGY]` | 1103-1213 | dhma (multiple states) |

**Total: 20 diagnostic log statements across all 9 strategies**

---

## Strategy Selection Logic

### Current Implementation (line 240-249 in signal-orchestrator.ts)
```typescript
// [8.8.3-B][SELECTION] Log strategy selection per symbol
// Currently all strategies are evaluated uniformly - no regime-based selection
const selectedStrategies = Array.from(this.enabledStrategies);
console.log("[8.8.3-B][SELECTION]", JSON.stringify({
  symbol,
  regime: null, // No regime classification implemented
  selectedStrategies: "ALL_STRATEGIES",
  skippedStrategies: [],
  enabledCount: selectedStrategies.length
}));
```

**Confirmed:** NO predictive ranking or regime-based strategy selection exists. All 9 strategies are evaluated for every eligible symbol.

---

## Signal Validation (StrategySignal Hardening)

### validateStrategySignal() (lines 524-541)
Validates before forwarding to execution engine:
- Symbol presence
- Strategy name presence
- Entry price: must be positive, finite number
- Stop price: must be positive, finite, and less than entry price (for longs)
- Target price: must be positive, finite, and greater than entry price (for longs)
- Confidence: must be 0-100, finite number

Invalid signals logged as `[8.8.3-B][ROUTING] Dropped malformed StrategySignal` with reason.

---

## Current Blocker: Engine Stopped

### Evidence from Logs
```
[Phase-27.F.3] Unified State: mode=paper, active=false
[Addendum-K.4.1] PaperDataSource = Database (balance: $800, strategies: 8, engine: stopped)
```

### Resolution
Start paper trading engine to trigger SignalOrchestrator evaluation loop:
```
POST /api/paper-sim/start
```

This will:
1. Create PaperPortfolioManager instance
2. Start SignalOrchestrator with 30-second evaluation interval
3. Begin logging [8.8.3-B] diagnostic output

---

## Files Analyzed

| File | Purpose |
|------|---------|
| `server/services/signal-orchestrator.ts` | Main evaluation loop, signal routing |
| `server/services/strategy-engine.ts` | 9 strategy detection methods |
| `server/services/paper-portfolio-manager.ts` | Starts SignalOrchestrator for paper mode |
| `server/services/paper-execution-engine.ts` | OLD path (disabled), processes forwarded signals |
| `server/services/paper-sim-service.ts` | Paper simulation lifecycle management |

---

## Critical Runtime Finding: Kill Switch Enabled

### Evidence from Logs (November 30, 2025)
```
[SafetyGuardrails] ⛔ Kill switch is ENABLED - blocking all trading/execution
[34.A][BROADCAST] type=safety_event, payload={"severity":"critical","policyHits":["KILL_SWITCH"],"actor":"autonomy_controller","action":"self_check","blocked":true}
[AutonomyController] Policy hits: KILL_SWITCH
[AutonomyScheduler] ⚠️ Issues detected: [
  'Critical health score: 0.23',
  'SAFETY VIOLATION: Kill switch is enabled: Manual activation from UI'
]
```

### Impact
- **SignalOrchestrator cannot run** - Kill switch prevents strategy evaluation
- **No [8.8.3-B] logs generated** - Evaluation loop blocked at safety layer
- **Engine starts but cannot execute** - Safety guardrails override engine state

### Resolution Required
1. **Disable Kill Switch** - Via UI or direct database update
2. **Or** - Add bypass flag for paper mode signal evaluation (testing only)

---

## Next Steps

1. **Disable Kill Switch** - Required before SignalOrchestrator can run
2. **Start paper trading engine** - Trigger via UI or API
3. **Observe [8.8.3-B] logs** - Verify all diagnostic logging fires as expected
4. **Validate guardrail behavior** - Confirm signals pass through GuardrailPolicy
5. **Generate final diagnostic report** - Capture runtime evidence

---

*Generated by REB 8.8.3-C Strategy Flow Analysis*
