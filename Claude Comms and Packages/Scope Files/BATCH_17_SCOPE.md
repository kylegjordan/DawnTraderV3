# Batch 17 Scope — Phase 14.1 HF9: Column Fix, Governance Gate → SQE, DSS Deletion, VTS IMF Relaxation

**Date**: 2026-03-07
**Branch**: dawntrader-v4
**Base commit**: `a2b67ab8` (Batch 16B — governance)
**Phase**: 14.1 HF9 (final hotfix)
**Test baseline**: 790 pass / 91 fail (881 total)

---

## Context

After HF8, the VTS produces real trades (~15 open in 2 hours). Three issues need resolution:

1. Closed simulated trades table shows dashes for 5 context columns (data computed but never persisted)
2. The governance gate (11.7R-E, regime stability → strategy eligibility) was supposed to be centralized in SQE alongside the confidence floor (11.7S) but was NOT moved in HF8 — it still lives only in paper-execution-engine.ts
3. The Dynamic Strategy Selector (DSS) is dead/broken code — it has been architecturally superseded by MCE's regime-based strategy filtering and individual detect functions' internal condition checks. The only useful DSS function (NetEV > 0 enforcement) needs to be preserved as a simple inline check.

### What Changed from the Previous Scope

The previous scope proposed making `secondaryMetrics` programmatically evaluable and converting DSS to a pre-selector. After analysis, we determined:
- The strategy detect functions already check these conditions internally — a pre-selector would be redundant
- The `secondaryMetrics` strings in the canonical map are documentation of what detect functions check, not an independent gate
- Making them evaluable adds complexity and over-filtering risk for zero throughput benefit
- Kyle approved: **delete the DSS entirely, keep it simple**

---

## Item A: Closed Trade Column Persistence Fix

### Problem
Five context columns in the Machine Learning tab's "Closed Simulated Trades" table show "—" for all trades:
- Global Regime (`globalRegime`)
- Pair Friction (`pairFriction`)
- Global Friction (`globalFriction`)
- Pair DBS (`pairDirectionalBias`)
- Global DBS (`globalDirectionalBias`)

### Root Cause
The fields ARE computed at trade open time (vts-runner.ts lines 792-801) and carried through to the close logic (lines 1054-1058), but the `persistRealPriceTrade()` call (lines 1084-1106) does NOT pass them. The `VirtualTrade` interface in vts-service.ts doesn't declare them. So they never reach the JSON log files.

### Changes (3 files)

**File 1: `server/services/vts-service.ts`**
- Add 5 optional fields to `VirtualTrade` interface (lines 76-106):
  - `globalRegime?: string`
  - `pairFriction?: number`
  - `globalFriction?: number`
  - `pairDirectionalBias?: string`
  - `globalDirectionalBias?: string`
- Add 5 fields to `persistRealPriceTrade()` parameter type (lines 671-694)
- Include 5 fields in the `VirtualTrade` object construction (lines 732-760)
- Fix `source` type: add `'vts'` to the union (`'simulation' | 'live' | 'vts'`)

**File 2: `server/services/vts-runner.ts`**
- Add 5 fields to the `persistRealPriceTrade()` call site (lines 1084-1106):
  ```typescript
  globalRegime: trade.globalRegime,
  pairFriction: trade.pairFriction,
  globalFriction: trade.globalFriction,
  pairDirectionalBias: trade.pairDirectionalBias,
  globalDirectionalBias: trade.globalDirectionalBias,
  ```

**File 3: `server/utils/export-csv.ts`**
- Add the 5 fields to the return type declaration of `getClosedVTSTradesFromLogs()` (lines 64-90)

### Risk: LOW
- No behavioral change to trade opening/closing logic
- Only adds data to existing persistence path
- New trades will have the columns; old trades in existing JSON logs will continue showing dashes (no backfill)

---

## Item B: Governance Gate (11.7R-E) → SQE

### Problem
In HF8, we moved the confidence floor (11.7S) into SQE. The governance gate (11.7R-E) — which checks regime stability and blocks HIGH-dependency strategies in UNSTABLE regimes — was also supposed to be moved to SQE but was NOT. It currently lives only in `paper-execution-engine.ts` (lines 2127-2151), meaning signals aren't blocked until late in the pipeline.

### Current Governance Gate Logic
1. `computeGlobalStability()` classifies regime as STABLE / TRANSITION / UNSTABLE based on:
   - `driftScore` (≤0.8 STABLE, ≤1.5 TRANSITION, >1.5 UNSTABLE)
   - `|volZ|` (≤1.2 STABLE, ≤2.0 TRANSITION, >2.0 UNSTABLE)
   - `regimeConfidence` (≥0.65 STABLE, ≥0.45 TRANSITION, <0.45 UNSTABLE)
   - `flipRate` 7d (<2 STABLE, <4 TRANSITION, ≥4 UNSTABLE)
2. `isStrategyEligible()` blocks HIGH-dependency strategies in UNSTABLE regime
   - HIGH dependency (blocked): vwap_pullback, sma_trend_ride, range_trade, morning_star, vwap_bounce, support_bounce, breakout, liquidity_trap, reverse_impulse, inside_bar_reversal
   - MEDIUM/LOW dependency: always allowed (different position sizing weights applied elsewhere)

### Proposed Change
Move the governance gate check into `evaluateSignalQuality()` in SQE, following the same pattern as the confidence floor:

1. Add `strategy` to `SQEInput` (if not already present)
2. Add `skipGovernanceGate` to `SQEOptions` (VTS bypass, same as `skipConfidenceFloor`)
3. After the confidence floor check in SQE, add the governance gate:
   - Import `isStrategyEligible`, `getStrategyDependency`, `computeGlobalStability`
   - Compute stability from `regimeStability` (already on SQEInput from HF8) or from `driftScore`/`volZ`/`regimeConfidence` in input
   - Call `isStrategyEligible(strategy, regimeStability, dependency)`
   - If not eligible → add to failures
4. Remove the governance gate from `paper-execution-engine.ts` (lines 2127-2151)
5. VTS calls SQE with `skipGovernanceGate: true` (same as `skipConfidenceFloor: true`)

### Changes (3 files)

**File 1: `server/core/filters/signal_quality_evaluator.ts`**
- Add `strategy` to SQEInput interface (for dependency lookup)
- Add `skipGovernanceGate` to SQEOptions interface
- Add governance gate check block after confidence floor check
- Import governance functions

**File 2: `server/services/paper-execution-engine.ts`**
- Remove governance gate block (lines 2127-2151) — SQE now handles this
- Clean up related imports if no longer used elsewhere in the file

**File 3: `server/services/vts-runner.ts`**
- Add `skipGovernanceGate: true` to the SQE options in the VTS evaluation call
- Add `strategy` field to the SQE input if not already passed

### Risk: MEDIUM
- Moving a gate changes WHERE signals are blocked — signals that currently reach paper-execution-engine before being blocked will now be blocked earlier in SQE
- Need to verify that the SQE input has the necessary data (regimeStability, driftScore, volZ, regimeConfidence) or that we can pass them
- VTS bypass must work correctly — VTS intentionally generates trades for all strategies regardless of regime stability
- Need to verify paper-execution-engine doesn't rely on the governance gate for anything else downstream

---

## Item C: DSS Full Deletion

### Rationale
The DSS has been architecturally superseded:
- **Regime-based strategy filtering**: Done by MCE → `allowedStrategies` (signal-orchestrator.ts lines 843-847)
- **Strategy-specific condition checking**: Done inside each strategy's detect function
- **NetEV enforcement**: The DSS post-filter block in signal-orchestrator.ts (lines 1243-1321) was supposed to do this, but it's BROKEN — references undefined variables `dss`, `dssMetrics`, `regimeInfo`. It has never executed.
- **Regime classification**: DSS's `determineRegime()` is used by telemetry-aggregator, but MCE provides canonical regime classification that should be used instead

The only useful function is NetEV > 0 enforcement, which will be preserved as a simple inline check.

### Files to Change (8 files)

**DELETE (2 files):**

| File | Lines | Reason |
|------|-------|--------|
| `server/services/dynamic-strategy-selector.ts` | 276 | The DSS itself — fully redundant |
| `server/tests/integration/dss.test.ts` | 177 | Tests for deleted code |

**MODIFY (6 files):**

**File 1: `server/services/signal-orchestrator.ts`**
- Remove DSS import (line 58): `import { getDynamicStrategySelector, type DSSMetrics } from './dynamic-strategy-selector.js'`
- Remove broken DSS post-filter block (lines 1243-1321) — this code crashes on `dss.evaluate()` due to undefined `dss` variable
- Replace with simple NetEV > 0 post-check:
  ```typescript
  // NetEV > 0 enforcement (replaces broken DSS block)
  if (signals.length > 0) {
    const preFilterCount = signals.length;
    // Filter signals with NetEV <= 0 using canonical kernel
    signals = signals.filter(signal => {
      const costMetrics = getCachedCostMetrics(symbol);
      const frictionPct = computeTotalRoundTripCost(costMetrics.fee, costMetrics.slippage, costMetrics.spread);
      const DI = calculateDirectionalIntegrity(closePrices);
      const kernel = computeNetExpectancyKernel({
        entryPrice: signal.entryPrice || 0,
        stopPrice: signal.stopPrice || 0,
        targetPrice: signal.targetPrice || 0,
        totalFriction: frictionPct * (signal.entryPrice || 0),
        DI
      });
      return kernel.netEV > 0;
    });
    if (signals.length < preFilterCount) {
      console.log(`[NetEV] ${symbol}: Filtered ${preFilterCount} → ${signals.length} signals (NetEV > 0)`);
    }
  }
  ```
- Update comments referencing DSS (lines 813, 828, 843)
- Remove `DSS_TRADE_SNAPSHOT` telemetry capture (was inside the broken block)

**File 2: `server/services/telemetry-aggregator.ts`**
- Remove DSS import (line 38)
- Remove `private dss = new DynamicStrategySelector()` (line 127)
- Replace `DSS_TO_CANONICAL` mapping (lines 457-462) — inline the mapping or use canonical regime types directly
- Replace `updateMarketRegime()` method (lines 766-768) — use MCE regime classification instead of `this.dss.determineRegime(metrics)`. The telemetry aggregator already receives regime data from MCE via event bus / signal processing — verify and wire directly.
- Update references at lines 489-490, 549, 554

**File 3: `server/utils/market-events.ts`**
- Change `MarketRegime` import from DSS to `market-indicators.ts` (line 17):
  ```typescript
  // BEFORE:
  import type { MarketRegime } from '../services/dynamic-strategy-selector.js';
  // AFTER:
  import type { MarketRegime } from '../services/market-indicators.js';
  ```
  (`MarketRegime` is independently defined in market-indicators.ts at line 44)

**File 4: `server/tests/unit/regime_mapping_integrity.test.ts`**
- Remove DSS from exclusion list (lines 51-54): `'dynamic-strategy-selector'` entry
- Update comments (lines 17-27) referencing DSS exclusions

**File 5: `server/config/system-guards.ts`**
- Update `VERSION` string (line 12): `"Phase10_DSS"` → `"Phase14_HF9"`

**File 6: `bridge/runtime/repo-map.json`**
- Remove DSS entries (lines 127, 340)

### Risk Assessment

| Change | Risk | Notes |
|--------|------|-------|
| Delete DSS file | LOW | No working code depends on it |
| Delete DSS tests | LOW | Tests for deleted code |
| Remove broken post-filter | LOW | Code already crashes silently |
| Add NetEV inline check | LOW | Same math, simpler wiring |
| Rewire telemetry-aggregator | **MEDIUM** | `updateMarketRegime()` is called actively — must verify it receives regime from MCE instead |
| Re-source MarketRegime type | LOW | Type alias exists in market-indicators.ts |
| Update test exclusion list | LOW | Cosmetic |

### Telemetry Aggregator — Key Investigation

The `updateMarketRegime()` method in telemetry-aggregator.ts calls `this.dss.determineRegime(metrics)`. This is the only place DSS actively executes. The method needs to be replaced with:
- Option A: Use MCE's canonical regime directly (passed via event bus or from signal processing)
- Option B: Inline the regime determination logic (DSS's `determineRegime()` is ~40 lines of threshold checks)

The pre-implementation audit will determine which approach is correct by tracing how `updateMarketRegime()` is called and what data is available.

---

## Item D: VTS IMF Filter Relaxation + UI Section

### Problem
The VTS currently receives pairs filtered with the **same strict IMF thresholds** as active trading (VolNoise ≤ 0.6, LQ ≥ 40, Correlation ≤ 0.75). This limits VTS to ~11 pairs per cycle, reducing trade throughput and ML training data volume. Interestingly, `system-guards.ts` already defines a separate `IMF_THRESHOLDS` constant with looser values (VN_MAX: 0.80, CORR_MAX: 0.95) intended for "broader passive learning data collection" — but it's **not wired** into the FX5 scanner's VTS batch path.

### Current IMF Architecture

The FX5 scanner runs a single scan cycle that feeds two consumers:
1. **Active Filter Pool** → Signal Orchestrator (active trading) — strict thresholds
2. **Current Batch** → VTS Runner via `getCurrentScanBatch('paper')` — also strict thresholds (should be relaxed)

The metric filtering happens at one point (`passesCoreMetricFilters()` in `analysis-utils.ts`), and the same boolean result is used for both paths.

**Current thresholds (both paths):**
| Filter | Active Trading | VTS (Current) | VTS (Proposed) |
|--------|---------------|---------------|----------------|
| Liquidity (LQ) | ≥ 40 | ≥ 40 | **≥ 25** |
| VolNoise | ≤ 0.6 | ≤ 0.6 | **≤ 0.80** |
| Correlation | ≤ 0.75 | ≤ 0.75 | **≤ 0.95** |

Note: The Correlation Guard has infrastructure in the codebase but is **not actively filtering** pairs in the FX5 scan pipeline — `failed_correlation` is always 0. It exists in `imf-metrics.ts` but isn't called in the main scan loop. For completeness, we'll include the relaxed threshold in the VTS config.

### Proposed Change

**1. Add VTS-specific IMF thresholds in `system-guards.ts`:**
```typescript
export const VTS_IMF_THRESHOLDS = {
  LQ_MIN: 25,           // Relaxed from 40 — lets in moderately liquid pairs
  VN_MAX: 0.80,         // Relaxed from 0.6 — matches existing IMF_THRESHOLDS
  CORR_MAX: 0.95,       // Relaxed from 0.75 — matches existing IMF_THRESHOLDS
} as const;
```

**2. Modify FX5 scanner to produce two filtered sets:**
At the metric filtering step (fx5-scanner.ts ~line 613), instead of one filter pass:
- `strictFiltered` = pairs passing `CORE_METRIC_THRESHOLDS` (for Active Filter Pool)
- `vtsFiltered` = pairs passing `VTS_IMF_THRESHOLDS` (for VTS batch via `updateCurrentBatch()`)

Active Filter Pool continues to use strict filtering. VTS batch uses relaxed filtering.

**3. Propagate IMF scores to `ScanBatchPair` interface:**
Currently the `ScanBatchPair` interface does NOT include numeric IMF scores (LQ, VolNoise). These are computed during scanning but lost before reaching VTS. Add:
```typescript
interface ScanBatchPair {
  // ... existing fields ...
  lqScore?: number;        // Log-liquidity score (0-100)
  volNoiseScore?: number;  // Volatility noise score (0-1)
  filterTier?: 'standard' | 'relaxed';  // Which threshold set the pair passed
}
```

**4. Tag VTS trades with filter tier:**
In vts-runner.ts, when creating `OpenVirtualTrade` objects, include the `filterTier` from the `ScanBatchPair`. This propagates through to the persisted trade JSON, allowing the ML system to analyze relaxed-filter trades separately.

**5. Add VTS IMF section to Screeners UI:**
In `client/src/components/goals/filters-with-override.tsx`, after the existing "Institutional Math Filters" panel (line 522), add a "VTS IMF Filters" panel:

```
┌─────────────────────────────────────────────────────┐
│  🔬 VTS IMF Filters (Relaxed for ML Data Collection)│
├──────────────┬──────────────┬───────────────────────┤
│ Liquidity    │ Noise Guard  │ Correlation Guard     │
│ LQ >= 25     │ VN <= 0.80   │ ρ <= 0.95             │
│ (Active: 40) │ (Active: 0.6)│ (Active: 0.75)        │
│ 🟢 Active    │ 🟢 Active    │ 🟢 Active             │
└──────────────┴──────────────┴───────────────────────┘
│ VTS Pairs: 24 (vs 11 Active)  │ Relaxed-only: 13    │
└─────────────────────────────────────────────────────┘
```

The panel shows:
- VTS thresholds with active trading thresholds for comparison
- Live pair counts: how many pairs pass VTS filters vs active filters
- How many additional pairs the relaxed filters let through

**6. API endpoint for VTS IMF data:**
Add `GET /api/vts/imf-status` endpoint that returns:
```json
{
  "thresholds": {
    "active": { "lqMin": 40, "vnMax": 0.6, "corrMax": 0.75 },
    "vts": { "lqMin": 25, "vnMax": 0.80, "corrMax": 0.95 }
  },
  "pairCounts": {
    "activePairs": 11,
    "vtsPairs": 24,
    "relaxedOnly": 13
  }
}
```

### Changes (6 files)

**File 1: `server/config/system-guards.ts`**
- Add `VTS_IMF_THRESHOLDS` constant with relaxed values
- Update `VERSION` string (already planned in Item C)

**File 2: `server/services/fx5-scanner.ts`**
- Import `VTS_IMF_THRESHOLDS`
- At metric filtering step (~line 613): create two filtered sets
  - Strict set → Active Filter Pool (unchanged behavior)
  - Relaxed set → VTS batch via `updateCurrentBatch()`
- Add LQ/VolNoise scores to `ScanBatchPair` objects in `updateCurrentBatch()`
- Add `filterTier` tag to each pair

**File 3: `server/services/vts-runner.ts`**
- Read `filterTier` from `ScanBatchPair` and propagate to `OpenVirtualTrade`
- Add `filterTier` to the `OpenVirtualTrade` type/creation (already touched in Item A)
- Pass `filterTier` through `persistRealPriceTrade()` (already touched in Item A)

**File 4: `server/services/vts-service.ts`**
- Add `filterTier?: 'standard' | 'relaxed'` to `VirtualTrade` interface (already touched in Item A)
- Include in `persistRealPriceTrade()` parameter type and object construction

**File 5: `server/routes.ts` (or `server/routes/vts.ts`)**
- Add `GET /api/vts/imf-status` endpoint
- Returns thresholds (active vs VTS) and pair counts from FX5 scanner

**File 6: `client/src/components/goals/filters-with-override.tsx`**
- Add "VTS IMF Filters" panel after existing IMF panel
- Fetch from `/api/vts/imf-status`
- Display VTS thresholds with active comparison, live pair counts

### Isolation Safeguard
The relaxed thresholds **only** affect the VTS batch path. Active trading continues to use `CORE_METRIC_THRESHOLDS` (strict) via the Active Filter Pool. The separation is enforced at the FX5 scanner level — two different filtered sets from the same scan cycle, routed to different consumers.

### Risk: LOW-MEDIUM
- Active trading path is UNCHANGED — strict thresholds, same Active Filter Pool
- VTS gets more pairs, which means more OHLC fetches from Kraken per cycle — need to verify rate limiting is not impacted (VTS already processes pairs sequentially with rate-limited OHLC fetches)
- Relaxed-filter trades are tagged (`filterTier: 'relaxed'`) so ML can weight or analyze them separately
- The existing `IMF_THRESHOLDS` constant (with VN_MAX: 0.80, CORR_MAX: 0.95) validates that relaxed thresholds were always intended for passive learning

---

## Dependency Order

```
Item A (Column Fix)         ← Independent
Item B (Governance → SQE)   ← Independent
Item C (DSS Deletion)       ← Independent
Item D (VTS IMF Relaxation) ← Shares files with A (vts-service, vts-runner) but changes are additive
```

All four items ship in a single mega-batch (Batch 17), followed by governance batch (Batch 17B).

---

## Files Summary

| # | File | Item(s) | Action |
|---|------|---------|--------|
| 1 | `server/services/vts-service.ts` | A, D | Add 5 context fields + filterTier to VirtualTrade + persistence |
| 2 | `server/services/vts-runner.ts` | A, B, D | Pass context fields + skipGovernanceGate + filterTier propagation |
| 3 | `server/utils/export-csv.ts` | A | Add 5 fields to return type |
| 4 | `server/core/filters/signal_quality_evaluator.ts` | B | Add governance gate check |
| 5 | `server/services/paper-execution-engine.ts` | B | Remove governance gate (SQE handles it now) |
| 6 | `server/services/dynamic-strategy-selector.ts` | C | **DELETE** |
| 7 | `server/tests/integration/dss.test.ts` | C | **DELETE** |
| 8 | `server/services/signal-orchestrator.ts` | C | Remove DSS import + broken block, add NetEV inline check |
| 9 | `server/services/telemetry-aggregator.ts` | C | Rewire regime classification from DSS to MCE |
| 10 | `server/utils/market-events.ts` | C | Re-source MarketRegime type |
| 11 | `server/tests/unit/regime_mapping_integrity.test.ts` | C | Update exclusion list + comments |
| 12 | `server/config/system-guards.ts` | C, D | Update version string + add VTS_IMF_THRESHOLDS |
| 13 | `bridge/runtime/repo-map.json` | C | Remove DSS entries |
| 14 | `server/services/fx5-scanner.ts` | D | Dual-path filtering (strict for active, relaxed for VTS) |
| 15 | `server/routes.ts` or `server/routes/vts.ts` | D | Add /api/vts/imf-status endpoint |
| 16 | `client/src/components/goals/filters-with-override.tsx` | D | Add VTS IMF section to Screeners tab |

**16 files total** (2 deleted, 14 modified) across 4 items.

---

## Dead Code Cleanup (While We're Here)

The governance investigation found dead imports that can be cleaned up:
- `applyGovernance` imported in vts-runner.ts (line 76) and paper-execution-engine.ts (line 84) — **never called** in either file
- `GovernanceDecision` type imported in paper-execution-engine.ts — never used
- These should be removed alongside the Item B/C changes

---

## Pre-Implementation Audit Checklist

Before writing code, verify:
1. [ ] SQE input data — what fields are currently available (confirm `strategy`, `regimeStability`, `driftScore`, `volZ`, `regimeConfidence`)
2. [ ] VTS SQE call — where does VTS call `evaluateSignalQuality()` and what options does it pass
3. [ ] Telemetry aggregator — how is `updateMarketRegime()` called, what data is available, what's the MCE alternative
4. [ ] Signal orchestrator catch block (line 1324) — confirm the broken DSS block silently fails
5. [ ] Paper-execution-engine — confirm no downstream code depends on the governance gate variables
6. [ ] `DSS_TO_CANONICAL` in telemetry-aggregator — are these regime normalizations still needed with canonical regimes
7. [ ] MarketRegime type in market-indicators.ts — confirm it matches what market-events.ts needs
8. [ ] FX5 scanner `updateCurrentBatch()` — confirm ScanBatchPair interface location and how VTS reads the data
9. [ ] FX5 scanner OHLC fetch rate — how many additional OHLC fetches will relaxed filters cause per VTS cycle
10. [ ] VTS `OpenVirtualTrade` type — where it's defined, confirm filterTier can be added cleanly
11. [ ] Existing `IMF_THRESHOLDS` usage — confirm it's only used in documentation/display, not actively gating

---

## Success Criteria

1. **Column Fix**: Closed simulated trades show values (not dashes) for Global Regime, Pair/Global Friction, Pair/Global DBS for all NEW trades
2. **Governance Gate**: SQE rejects HIGH-dependency strategies in UNSTABLE regime; VTS bypasses via `skipGovernanceGate`; paper-execution-engine no longer has duplicate gate
3. **DSS Deletion**: `dynamic-strategy-selector.ts` and `dss.test.ts` deleted; zero imports remain; telemetry-aggregator uses MCE regime; signal-orchestrator has inline NetEV check; `npx tsc --noEmit` passes
4. **VTS IMF Relaxation**: VTS receives more pairs than active trading (~20-30 vs ~11); all trades tagged with `filterTier`; active trading thresholds UNCHANGED; Screeners tab shows VTS IMF section with live pair counts
5. **Test baseline**: 790 pass / 91 fail or better (accounting for deleted DSS tests — net test count will decrease but pass/fail ratio should improve or stay stable)
6. **TypeScript**: `npx tsc --noEmit` passes with 0 errors
