# BATCH 15 HOTFIX 6 — Scope Document

**Date**: 2026-03-06
**Branch**: dawntrader-v4
**Last commit**: `9f50e70e` (Batch 15 + HF5)
**Test baseline**: 790 pass / 91 fail (881 total)

---

## Overview

Hotfix 6 addresses seven issues identified during HF5 validation. The centerpiece is
wiring the VTS to call the **same strategy detect functions** that the signal
orchestrator uses, replacing the generic volatility formula that produces identical
stops/targets across all strategies. Supporting fixes include: closed trade visibility
(source tag), global DBS persistence, scrollbar width, friction category display, a
stale trade clearing step, and an Analytics Overview tab error fix.

Items 7–10 from the prior HF6 discussion (governance gate into SQE, TCL duplicate
FinalScore check, DSS pre-selector, range_trade naming) are **deferred to Hotfix 7**.

---

## Scope Items

### Item 1: Fix `source` Tag in Trade Persistence (CRITICAL)

**Problem**: `vts-service.ts` lines 712 and 742 write `source: 'simulation'` when
persisting closed trades to disk. H5.10 and H5.45 correctly filter for `source: 'vts'`,
but since the write side uses the wrong value, ALL Phase 14 closed trades are invisible
in the ML Dashboard.

**Fix**: Change `source: 'simulation'` → `source: 'vts'` at both lines (712 and 742)
in `server/services/vts-service.ts`.

**Files**: `server/services/vts-service.ts` (2 edits)

---

### Item 2: Wire VTS to Strategy-Specific Detect Functions (CORE)

**Problem**: The VTS computes entry/stop/target using a generic volatility formula
(vts-runner.ts lines 396–404):
```
dynamicTarget = max(0.015, volatility * 0.5)
dynamicStop   = max(0.008, volatility * 0.3)
takeProfit    = entryPrice * (1 + dynamicTarget)
stopLoss      = entryPrice * (1 - dynamicStop)
```
This produces identical stops/targets for all strategies on a pair. The learning
data is meaningless because VTS trades don't reflect how the strategies actually
calculate their entries.

**Fix**: Replace the generic formula with calls to the **same StrategyEngine detect
functions** the signal orchestrator uses. All 17 strategies are accessible through
StrategyEngine class methods. The VTS already has all required inputs:

| Input | VTS has it? | Location |
|-------|------------|----------|
| `indicators` (TechnicalIndicators) | ✅ | `mceContext.indicators` (line 410) |
| `ohlcData` (candle array) | ✅ | `ohlcData` / `candles` (line 342) |
| `settings` (TradingSettings) | ✅ | Use same defaults as orchestrator (line 680) |
| `patternInput` (PatternInput) | ✅ | `detectedPatterns` (line 342) |

**Implementation approach**:

1. **Instantiate StrategyEngine**: `StrategyEngine` is NOT a singleton — create a
   module-level instance: `const strategyEngine = new StrategyEngine();`
   Import from `../services/strategy-engine.js`.
2. Construct `indicators` object from MCE context (same format as orchestrator lines 857-864):
   ```typescript
   const indicators = {
     vwap: mceContext.indicators.vwap,
     sma: mceContext.indicators.sma,
     currentPrice: mceContext.indicators.currentPrice,
     volume: mceContext.indicators.volume,
     high24h: mceContext.indicators.high24h,
     low24h: mceContext.indicators.low24h,
   };
   ```
3. Construct `patternInput` from detected patterns (same format as orchestrator lines 1048-1070)
4. Construct `settings` with same defaults as orchestrator (lines 680-688)
5. For the strategy assigned to this trade (`strategy` variable), call the corresponding
   `strategyEngine.detect*()` method:
   - If signal returned → use its `entryPrice`, `stopPrice`, `targetPrice`
   - If null returned → **skip this strategy** (conditions not met, no trade created)
6. Remove the generic volatility formula (lines 396-404)
7. Keep existing scoring (`computeRealHybridScore`, DBS modifier, etc.) — only
   entry/stop/target changes

**Special case — `detectDefensiveHedge`**: Has an optional 4th parameter
`btcCandles?: PriceData[]`. Pass `undefined` — the function degrades gracefully
without BTC correlation data (same as the signal orchestrator does at line 1120).

**Key design principle**: The VTS uses the EXACT same detect functions as the signal
orchestrator so that learning transfers directly to active trading. Both paths produce
identical entry/stop/target for the same market conditions.

**Impact**: Fewer VTS trades will be created (detect functions return null when
conditions aren't met), but every trade that IS created represents a real strategy
signal — far more valuable for learning.

**Signal orchestrator call pattern** (replicate this in VTS):
```typescript
// Quant strategies — different signatures per strategy:
strategyEngine.detectVWAPPullback(indicators, settings, ohlcAsAny)
strategyEngine.detectABCDLong(ohlcAsAny, settings)
strategyEngine.detectSMATrendRide(indicators, ohlcAsAny, settings)
strategyEngine.detectBreakout(ohlcAsAny, { minConsolidationBars: 10, ... })
strategyEngine.detectMeanReversion(indicators, ohlcAsAny, { ... })
strategyEngine.detectRangeTrading(ohlcAsAny, { ... })
strategyEngine.detectVWAPBounce(indicators, ohlcAsAny, { ... })
strategyEngine.detectLiquidityTrap(ohlcAsAny, { ... })
strategyEngine.detectDHMA(indicators, ohlcAsAny, { ... })

// Pattern + Hybrid strategies — all take patternInput:
strategyEngine.detectMorningStar(indicators, ohlcAsAny, patternInput)
strategyEngine.detectInsideBarReversal(indicators, ohlcAsAny, patternInput)
strategyEngine.detectSupportBounce(indicators, ohlcAsAny, patternInput)
strategyEngine.detectPivotShift(indicators, ohlcAsAny, patternInput)
strategyEngine.detectReverseImpulse(indicators, ohlcAsAny, patternInput)
strategyEngine.detectDefensiveHedge(indicators, ohlcAsAny, patternInput)  // btcCandles omitted
strategyEngine.detectAdaptiveFlow(indicators, ohlcAsAny, patternInput)
strategyEngine.detectVolatilityEdge(indicators, ohlcAsAny, patternInput)
```

**Files**: `server/services/vts-runner.ts` (major edit to processTradeSignal)

---

### Item 3: Clear Stale Trades After Strategy Wiring

**Problem**: All existing open and closed VTS trades were calculated with the generic
volatility formula. Their entry/stop/target data is incorrect. After Item 2 wires the
strategy modules, these stale trades should be cleared so only correctly-calculated
trades accumulate.

**Fix**: Run another `phase14FreshStart()` cycle — clear in-memory open trades,
clear in-memory closed trades, reset session metrics. Existing closed trade log files
on disk already have `source: 'simulation'` so they'll be filtered out by H5.45. New
trades after the fix will have `source: 'vts'` (Item 1) and correct entry/stop/target
(Item 2).

**Files**: `server/services/vts-service.ts` or `server/services/vts-runner.ts`
(clear openVirtualTrades Map)

---

### Item 4: Persist Global DBS for VTS Trade Context

**Problem**: Global DBS is computed by `mce.computeGlobalBias()` in
`getMarketIndicators()` but NOT cached — computed on-demand and discarded. The VTS
trade construction (vts-runner.ts line 637) has `globalDirectionalBias: undefined`
because there's nowhere to read the value from.

**Note**: Global friction already HAS a cached getter. `market-indicators.ts` line 142
declares `let cachedGlobalFriction: number = 25;`, line 208 updates it every cycle
(`cachedGlobalFriction = avgFriction;`), and lines 321-322 export the getter:
`export function getGlobalFriction(): number { return cachedGlobalFriction; }`.
**No friction getter needs to be created — only the DBS getter is missing.**

**Fix**:

1. In `market-indicators.ts`: Add a module-level cached variable for global DBS
   category (e.g., `let cachedGlobalDBSCategory: string = 'NEUTRAL';`). Update
   `getMarketIndicators()` to write to it after computing DBS (inside the existing
   try-catch at lines 275-284). Export a getter function
   (`getLastGlobalDBSCategory()`).
2. In `vts-runner.ts`:
   - Import `getGlobalFriction` (already exists) and `getLastGlobalDBSCategory` (new)
     from `market-indicators.ts`.
   - Replace `globalFriction: undefined` (line 635) with `globalFriction: getGlobalFriction()`.
   - Replace `globalDirectionalBias: undefined` (line 637) with
     `globalDirectionalBias: getLastGlobalDBSCategory()`.

**Files**: `server/services/market-indicators.ts` (add DBS cache + export getter),
`server/services/vts-runner.ts` (2 edits — use getters)

---

### Item 5: Top Scrollbar Width Fix

**Problem**: Both the open and closed trade tables in machine-learning.tsx have a
top scrollbar placeholder div with `width: '1800px'` (lines 387 and 604), but HF5
updated the table min-width to 2300px. The top scrollbar is 500px shorter than the
table, so it can't scroll to the rightmost columns.

**Fix**: Change `width: '1800px'` → `width: '2300px'` at lines 387 and 604.

**Files**: `client/src/pages/machine-learning.tsx` (2 edits)

---

### Item 6: Friction Category Display

**Problem**: Pair friction columns show only the raw score (e.g., 23.5) without
the category label. The client-side utility `frictionColor.ts` already has a
`getFrictionLabel()` function with 4 bands:
- 0–20: "High Liquidity" (green)
- 21–50: "Normal Liquidity" (yellow)
- 51–80: "Stressed Liquidity" (orange)
- 81–100: "Frozen / Illiquid" (red)

**Fix**: Import `getFrictionLabel` from `@/utils/frictionColor` into
machine-learning.tsx. Use it in both pair and global friction data cells to display
as "23: High Liquidity" (matching the existing label format). This reuses the
existing client-side utility rather than duplicating the server-side 3-band logic.

**Files**: `client/src/pages/machine-learning.tsx` (import + edit friction data cells)

---

### Item 7: Analytics Overview Tab Error Fix

**Problem**: The Analytics & Diagnostics Overview tab displays a full-page red error
screen ("Failed to load market indicators") instead of the Overview content. The
error handling in `analytics.tsx` (lines 1896-1907) is overly aggressive — if the
`/api/market-indicators` API call fails for ANY reason (transient network error,
server startup timing, etc.), the ENTIRE Analytics page becomes an error screen.
No tabs are rendered, preventing access to Governance, Predictive, Mapping Drift,
Top Pairs, Events, and Benchmark tabs — all of which are completely independent of
the market indicators API.

**Fix**: Replace the early-return error boundary (lines 1896-1907) with graceful
inline error handling:

1. Remove the `if (indicatorsError) { return ... }` block that replaces the entire
   page with a red error screen.
2. Let the page render normally — `MarketOverviewSection` already handles
   `indicators === undefined` with `if (!indicators?.data) return null;` (line 344).
3. Add a compact error/retry banner inside the Overview tab content (within
   `MarketOverviewSection`) so users see a retry option but can still use other tabs.

**Files**: `client/src/pages/analytics.tsx` (edit error handling)

---

## Files Touched (Summary)

| File | Items | Description |
|------|-------|-------------|
| `server/services/vts-service.ts` | 1, 3 | Source tag fix + trade clearing |
| `server/services/vts-runner.ts` | 2, 4 | Strategy module wiring + global friction/DBS getters |
| `server/services/market-indicators.ts` | 4 | DBS cache + export getter |
| `client/src/pages/machine-learning.tsx` | 5, 6 | Scrollbar width + friction category display |
| `client/src/pages/analytics.tsx` | 7 | Overview tab error handling fix |

**5 files modified**

---

## Execution Order

1. **Item 1** (source tag) — trivial, unblocks closed trade visibility
2. **Item 4** (global DBS persistence) — needed before Item 2
3. **Item 2** (strategy module wiring) — the core change, depends on Item 4
4. **Item 3** (clear stale trades) — runs after Item 2 is in place
5. **Items 5 + 6** (scrollbar + friction category) — frontend, independent
6. **Item 7** (analytics error handling) — frontend, independent

---

## Validation Criteria

After all changes applied:
- `npm run build` passes
- `npm test` — 790/91 or better (no new failures)
- VTS creates trades with **strategy-specific** entry/stop/target (different stops
  for different strategies on the same pair)
- Closed trades appear in the ML Dashboard after trades resolve (24h max hold)
- Global Friction and Global DBS columns show values (not dashes)
- Pair Friction columns show category alongside score
- Top scrollbar spans full table width for both open and closed tables
- Log: `[11.8C][Entry]` shows strategy-specific stop/target values
- Analytics Overview tab loads without red error screen
- Other Analytics tabs (Governance, Predictive, etc.) remain accessible even if
  indicators API fails

---

## Deferred to Hotfix 7

- Move governance gate + confidence floor from paper-execution-engine into SQE
- Remove duplicate FinalScore > 0.35 from TCL
- Fix DSS as pre-selector (not post-filter)
- Fix `range_trading` → `range_trade` name mismatch
- Make secondary metrics programmatically evaluable
- Fix return type declaration in `getOpenVirtualTradesForML()`
