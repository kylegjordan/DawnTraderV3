# Phase 8.8.3-J4: Strategy → RTB → Execution Pipeline Unification

**Date**: December 2, 2025  
**Status**: IN PROGRESS  
**Scope**: Unify strategy signal pipeline so all 9 strategies are evaluated consistently

---

## J4.1 — Audit: Current Strategy Coverage in Execution Layer

### Strategies Defined in StrategyEngine (strategy-engine.ts line 9)

| # | Strategy Type | Detect Method | Line |
|---|--------------|---------------|------|
| 1 | `vwap_pullback` | `detectVWAPPullback()` | 29 |
| 2 | `abcd_long` | `detectABCDLong()` | 123 |
| 3 | `sma_trend_ride` | `detectSMATrendRide()` | 232 |
| 4 | `breakout` | `detectBreakout()` | 335 |
| 5 | `mean_reversion` | `detectMeanReversion()` | 413 |
| 6 | `range_trading` | `detectRangeTrading()` | 492 |
| 7 | `vwap_bounce` | `detectVWAPBounce()` | 569 |
| 8 | `liquidity_trap` | `detectLiquidityTrap()` | 652 |
| 9 | `dhma` | `detectDHMA()` | 995 |

### Strategies Currently Called in paper-execution-engine.ts

In `checkSymbolForSignal()` (lines 540-559), only **3 of 9** strategies are evaluated:

```typescript
// Line 541: VWAP Pullback ✅
const vwapSignal = this.strategyEngine.detectVWAPPullback(indicators, settings, priceData);

// Line 548: ABCD Long ✅
const abcdSignal = this.strategyEngine.detectABCDLong(priceData, settings);

// Line 555: SMA Trend Ride ✅
const smaSignal = this.strategyEngine.detectSMATrendRide(indicators, priceData, settings);
```

### Strategies NOT Called (Missing 6)

| Strategy | Detect Method | Status |
|----------|--------------|--------|
| `breakout` | `detectBreakout(priceHistory, params)` | ❌ NOT CALLED |
| `mean_reversion` | `detectMeanReversion(indicators, priceHistory, params)` | ❌ NOT CALLED |
| `range_trading` | `detectRangeTrading(priceHistory, params)` | ❌ NOT CALLED |
| `vwap_bounce` | `detectVWAPBounce(indicators, priceHistory, params)` | ❌ NOT CALLED |
| `liquidity_trap` | `detectLiquidityTrap(priceHistory, params)` | ❌ NOT CALLED |
| `dhma` | `detectDHMA(indicators, priceHistory, params)` | ❌ NOT CALLED |

### Method Signatures Summary

```typescript
// Group 1: Uses TradingSettings directly
detectVWAPPullback(indicators, settings, priceHistory?) → StrategySignal | null
detectABCDLong(priceHistory, settings) → StrategySignal | null
detectSMATrendRide(indicators, priceHistory, settings) → StrategySignal | null

// Group 2: Uses generic params object (strategy-specific parameters)
detectBreakout(priceHistory, params) → StrategySignal | null
detectMeanReversion(indicators, priceHistory, params) → StrategySignal | null
detectRangeTrading(priceHistory, params) → StrategySignal | null
detectVWAPBounce(indicators, priceHistory, params) → StrategySignal | null
detectLiquidityTrap(priceHistory, params) → StrategySignal | null
detectDHMA(indicators, priceHistory, params) → StrategySignal | null
```

### Discrepancy Analysis

| Layer | Strategies Available |
|-------|---------------------|
| StrategyEngine (strategy-engine.ts) | All 9 strategies defined ✅ |
| FX5 Scanner + Active Filter Pool | Filters pairs, doesn't call strategies directly |
| paper-execution-engine.ts | Only 3 strategies called ❌ |

**Root Cause**: `checkSymbolForSignal()` hardcodes only 3 strategy calls instead of iterating over all 9.

---

## J4.2 — Unified Strategy Evaluation Path

### Solution: Add All 9 Strategy Calls

Rather than creating a new unified API (which would change strategy internals), we will:
1. Add the 6 missing strategy calls to `checkSymbolForSignal()`
2. Use default parameters for strategies that need `params` objects
3. Preserve existing signal selection logic (pick highest confidence)

### No Changes to Strategy Internals

- No new parameters added to strategies
- No threshold changes
- No new logic inside strategies
- This is **wiring only**

---

## J4.3 — RTB as Single Source for Execution

### Current Flow Analysis

```
FX5 Scanner (30s cycle)
    │
    └─► Active Filter Pool (survivors)
            │
            └─► paper-execution-engine.scanForSignals()
                    │
                    ├─► checkSymbolForSignal() runs strategies
                    │       │
                    │       └─► Saves signal to trading_signals (RTB)
                    │
                    └─► executeSimulatedTrade() immediately after signal detection
```

### Issue Identified

The current flow:
1. Scans Active Filter Pool directly
2. Runs strategies inside `checkSymbolForSignal()`
3. Saves to RTB (trading_signals table)
4. **Immediately executes** without consuming from RTB

This means RTB is populated but not consumed as the source of truth.

### Fix Required

Execution should:
1. Read from RTB (trading_signals table with status='active')
2. Consume signals (mark as 'consumed' after execution attempt)
3. Respect TTL expiry

---

## J4.4 — Engine State Gating

### Existing State Checks (Verified in J3)

| Check | Location | Purpose |
|-------|----------|---------|
| `this.isRunning` | paper-execution-engine.ts:87 | Local engine loop guard |
| `isEngineActive` | Database via storage.getSystemContext() | Canonical truth |
| Kill switch check | paper-execution-engine.ts:338 | Guardrail enforcement |

These checks are already in place and correct per J3 validation.

---

## Files Modified

| File | Changes |
|------|---------|
| `server/services/paper-execution-engine.ts` | Add 6 missing strategy calls |
| `docs/audits/phase_8.8.3-J4_strategy_to_execution_unification.md` | This document |

---

## Appendix: Default Strategy Parameters

For strategies using `params` object, defaults are used from strategy-engine.ts:

```typescript
// Breakout defaults
{ minConsolidationBars: 10, maxRangeWidth: 3, breakoutBuffer: 1, volumeMultiplier: 2, maxHoldingHours: 12 }

// Mean Reversion defaults
{ meanType: 'vwap', smaLength: 20, deviationThreshold: 2.5, partialExitPercent: 50, stopLossBuffer: 1 }

// Range Trading defaults
{ minRangeDurationHours: 12, minRangeWidth: 3, minBoundaryTouches: 3, entryZoneWidth: 0.5, stopLossBeyond: 1 }

// VWAP Bounce defaults
{ vwapProximity: 0.5, minVWAPSlope: 0.3, volumeMultiplier: 1.3, maxPullbackBars: 5, partialExitR: 1.5 }

// Liquidity Trap defaults
{ maxTrapExtension: 1.2, trapReturnBars: 2, minStopZoneSize: 'medium', minLevelTouches: 3, volumeRatio: 1.5 }

// DHMA defaults
{ theta_OBI: 0.3, epsilon_micro: 0.2, tau_toxicity: 0.7, maxSpread: 5, k_tp: 1.5, N_flow: 50, N_burst: 10, window_session: 20 }
```
