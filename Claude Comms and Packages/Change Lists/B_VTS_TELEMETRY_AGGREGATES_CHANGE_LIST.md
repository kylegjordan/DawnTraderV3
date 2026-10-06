# B-VTS-TELEMETRY-AGGREGATES — change list (Step 4)

## Dispatch header
| # | field | value |
|---|---|---|
| i | change-class | `non_architecture` (scope r1) |
| ii | doc set | scope present (`B_VTS_TELEMETRY_AGGREGATES_SCOPE.md` r1) · pre-audit + plan present (`B_VTS_TELEMETRY_AGGREGATES_PRE_AUDIT.md` r1 + r2) · running_issues present (`#1141`, `#1156`) · DELETED_COMPONENTS_LOG present · SYSTEM_MANUAL (`:421`) and LEVER_INVENTORY (`:60-62`) **required at Step 10** (A6) · SIM: the store's lifetime changes (merge → replace) — Step-10 row |
| iii | Step 2 | `B_VTS_TELEMETRY_AGGREGATES_PRE_AUDIT.md` (Langston PROCEED 17:40Z) |

## The change, file by file
- **`server/core/logging/vts-telemetry.ts`** — P1: `getRegimePerformance` returns `regimeData[strategy] ?? null` (the `|| regimeData['SKIPPED']` fallback deleted). P2: the aggregation builds `next` from this run's `metrics` and assigns `vtsTelemetry.regimePerformance = next` under the lock (was: assign only the present cells into the old object); an empty window now clears the store too (was: early return that left it). `checkConfidenceDrift` + `DRIFT_LOG_PATH` deleted. `skipRatio`/`illiquidRatio` documented as REGIME-LEVEL in the type (P3, no re-key).
- **`server/core/calculations/expectancy.ts`** — `getAdaptiveExpectancy`, `getAdjustedMinROI`, `checkExpectancyDrift` deleted; the `vts-telemetry` import gone; the `expectancy_tuning` comment restated.
- **`server/core/utils/score-calculator.ts`** — the no-data 0.5 path is counted (`noDataFallbackCount`, `servedCount`, `predictiveConfidenceFallbackCounts()`); `clearPredictiveConfidenceCache` deleted.
- **`server/services/autonomy-scheduler.ts`** — the 6-hourly aggregation job prints the two counts.
- **`server/services/vts-service.ts`** — `simulateTrade` deleted; the `:951` comment restated.
- **`server/startup/b72-warmup.ts`** — `'expectancy_tuning'` no longer prefetched.
- **`server/core/rtb/ready_to_buy_service.ts`** — the "★third call site" comment restated as history (P5).
- **`client/src/pages/machine-learning.tsx`** — `skipRatio` labelled regime-level.
- **Tests** — `server/tests/unit/b-vts-telemetry-aggregates.test.ts` (5): P1 null despite a SKIPPED cell (control: the SKIPPED cell itself is still readable); P2 a quiet strategy has no cell after the next run (control: the present cell rebuilt), an empty window empties the store; the fallback counter; the deletion fence (control: the warm-up list still read). **Mutation-proved:** with the old `vts-telemetry.ts` restored, tests 1, 2, 3 and 5 fail.
- `tsc` baseline gate: 338 = 338.

## What changes at runtime
No automatic decision changes today: the only gate that reads this value on the live lane (the AMR confidence floor, xStock) is in shadow for both classes (pre-audit A3). The change can only refuse, never newly admit (r2 C1). Deploy: not before 2026-10-07T15:53Z (`#1154`).

## Judgement calls — attack these
1. The empty-window case now CLEARS the store (was: left it). Same contract, but it is a behaviour change you did not see in the plan.
2. The counter prints only with the 6-hourly aggregation line — enough, or a per-hour line?
