# BATCH 30 SCOPE: Counter Truth Part 2 — Null Attribution, Rejection Unification, Label Clarity

**Phase:** 14.6
**Date:** 2026-03-26
**Approved by:** Kyle (autonomous directive), Langston (technical review)

## Context
After Batch 26-29 deployment + server restart, Kyle identified 7 discrepancies in Filter Diagnostics. This batch addresses the counter accuracy and labeling issues (discrepancies #1-#5). Strategy null reason codes (#6) move to Batch 31. LQ calibration (#7) moves to Batch 32.

## Changes

### Fix 1: Null Reason Breakdown — Separate Pair-Level from Strategy-Level
**Bug:** `nullReasons` mixes per-pair counters (maxOpenTrades, regimeNoStrategies) with per-strategy counters (conditionsNotMet, adxGuard, duplicatePosition, familyFilterMismatch). The sum of nullReasons (~13K) is much less than total strategy nulls (~179K) because pair-level reasons skip ALL strategies for a pair but only increment once.

**Fix (vts-runner.ts):**
- Add new `pairLevelSkips` object alongside `nullReasons`: `{ maxOpenTrades: 0, regimeNoStrategies: 0, noPrice: 0, insufficientOHLC: 0 }`
- Move maxOpenTrades and regimeNoStrategies out of `nullReasons` into `pairLevelSkips`
- Move pairsSkippedNoPrice and pairsSkippedInsufficientOHLC into `pairLevelSkips` too
- `nullReasons` now only contains per-strategy reasons: conditionsNotMet, adxGuard, duplicatePosition, familyFilterMismatch
- This makes nullReasons sum comparable to total strategy nulls

**Fix (machine-learning.tsx):**
- Render pairLevelSkips as a separate "Pair-Level Skips" section above the strategy-level "Null Reason Breakdown"
- Each pair-level skip shows count and estimated strategies skipped (count × avg strategies per pair)

### Fix 2: Add Cumulative Labels to All 24h Rolling Metrics
**Bug:** Only "Pairs Evaluated" has the cumulative clarifier. All other 24h metrics lack it.

**Fix (machine-learning.tsx):**
- Add "(cumulative, 24h rolling)" to: Total Strategy Evaluations, Strategy Returned Null, Signals Rejected, Signals Generated
- Add "(cumulative across scan cycles, not unique pairs)" to Total Survivors (24h) row

### Fix 3: Pattern Detection Row — Show N/A When Pattern Pool Empty
**Bug:** Shows "0 / 0 (0% hit)" when pattern pool has no evaluations, which looks like failure rather than N/A.

**Fix (machine-learning.tsx):**
- When patternPairsEvaluated === 0, show "—" instead of "0 / 0 (0% hit)"

### Fix 4: Null Reason Percentage Base — Use Strategy Nulls Not Reason Sum
**Bug:** Null reason percentages use sum of reasons as denominator, but reasons don't sum to strategy nulls (because of the per-pair vs per-strategy mismatch). After Fix 1 (separating pair-level), the new denominator should be `quantStrategyNulls + patternStrategyNulls` for strategy-level reasons.

**Fix (machine-learning.tsx):**
- Change percentage denominator from `Object.values(ve.nullReasons).reduce(...)` to `ve.quantStrategyNulls + (ve.patternStrategyNulls ?? 0)`

### Fix 5: Verify byStrategy Attribution Gap
**Bug (from pre-audit):** The 179K vs 167K gap was caused by maxOpenTrades and regimeNoStrategies being counted in totals but not in byStrategy. After Fix 1, maxOpenTrades and regimeNoStrategies move to pairLevelSkips and no longer inflate the strategy null totals. However, we need to verify that INSIDE the strategy loop, every path that increments quantStrategyNulls/patternStrategyNulls ALSO increments byStrategy[key].nulls.

**Verification:** Read every strategy-loop path after deployment and confirm all increments are paired.

## Desired Outcomes
1. Sum of nullReasons (strategy-level only) should be close to quantStrategyNulls + patternStrategyNulls (within rounding)
2. Pair-level skips clearly separated with their own section
3. All 24h rolling metrics clearly labeled as cumulative
4. Pattern detection row shows N/A when appropriate
5. Percentage calculations use correct denominator

## Verification Plan
1. Code review: verify all counter paths in vts-runner.ts
2. Preview site: After restart, wait 30 min, then check:
   - Null Reason Breakdown percentages should sum close to 100%
   - Pair-Level Skips section visible with maxOpenTrades, regimeNoStrategies counts
   - All labels include cumulative qualifier
   - Pattern detection shows actual data or N/A
