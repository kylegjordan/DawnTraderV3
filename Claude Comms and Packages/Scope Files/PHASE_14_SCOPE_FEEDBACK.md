# Scope Feedback — BATCH_15_SCOPE.md

Paste everything below this line into the session that wrote BATCH_15_SCOPE.md.

---

I've reviewed BATCH_15_SCOPE.md with my lead architect from the prior session. The scope is solid overall — the 7 workstreams are correct and the implementation order is right. But there are several corrections, additions, and issues that need to be addressed before we implement. Please update the scope document with these changes.

## Correction 1: Global Regime & Friction Already Exist — Don't Rebuild

The scope treats global regime and global friction as new calculations to build. They already exist and are displayed on the Analytics & Diagnostics Overview tab. Here's where they live:

- **Global Regime**: `server/services/telemetry-aggregator.ts` → `getDominantRegime()` — counts pair-level regimes from recent telemetry, returns the mode (most common regime) with average score and percentage of pairs.
- **Global Friction**: `server/services/market-indicators.ts` → `computeGlobalFrictionWithDetails()` — averages per-pair friction scores from `activeFilterPool.getActivePool('paper')`, sampling up to 100 pairs. Per-pair formula is in `server/core/metrics/cost-metrics.ts` → `computeMarketFriction()`: `base = (spread + slippage + fee) × 10000`, `normalized = min(base / 3, 100)`.

Neither value is persisted to the database — they're computed on-demand for display only.

**What the scope should say**: Don't build new global regime/friction calculations. Tap into these existing functions, snapshot their values at trade open time, and persist them to each VTS trade record. Also add global DBS as a new section on the Analytics Overview tab alongside the existing global regime and global friction displays.

Additionally, please validate whether these existing global calculations are correct and optimal. Specifically:
- Is the mode (most common pair regime) the best way to determine global regime?
- Global friction uses the **active filter pool** (pairs that passed FX5 scanning). Should it use the ideal pool instead for a broader market-wide picture? Or is the active pool the right choice since those are the pairs we actually trade?

## Correction 2: market-indicators.ts Has Stale Parallel Regime Data — Critical Fix

This is a problem the scope didn't catch. `server/services/market-indicators.ts` has its own hardcoded `regimeDescriptions` object (around lines 70-144) and a `mapToBaseRegime()` function that maps canonical regime names to an older 6-value `MarketRegime` type:

```typescript
const regimeMap: Record<string, MarketRegime> = {
  'HIGH_VOL_IMPULSE': 'BULL_VOLATILE',
  'TRANSITION': 'LOW_VOL_CHOP',
  'HIGH_VOL_CHOP': 'BULL_VOLATILE',
  'MIXED_TRANSITION': 'LOW_VOL_CHOP',
};
```

This mapping is lossy — the UI currently shows the OLD regime names because `market-indicators.ts` doesn't reference `canonical-regime-strategy-map.ts` at all. It has its own parallel copy of regime data.

**Simply renaming the canonical map will NOT fix the UI.** The scope must include:
1. Remove `mapToBaseRegime()` from `market-indicators.ts` — it's a legacy adapter
2. Remove the hardcoded `regimeDescriptions` object from `market-indicators.ts`
3. Wire `market-indicators.ts` to read regime names, descriptions, and favored strategies from `canonical-regime-strategy-map.ts` as the single source of truth
4. Search for and fix ANY other files that have parallel hardcoded regime data instead of referencing the canonical map

This is the same kind of stale parallel data problem we fixed in Phase 12 — this one was missed.

## Correction 3: Capture All 6 Context Fields at Trade OPEN Only

The scope should specify: all 6 context dimensions (regime/friction/bias × global/pair) are captured at trade **open** time as a single snapshot. Not at close. Not at both open and close.

Rationale: The trading decision happens at open — that's when regime, friction, and directional bias influenced strategy selection and confidence. Predictive learning needs to correlate decision-time context with outcomes. For short-duration VTS trades, conditions rarely change significantly between open and close.

## Correction 4: VTS Data Clear — No Backfill Engine

The scope's Workstream 7 needs to be clearer. Here's the finalized plan:

**What to clear**: The old VTS trades have real market observations (pair, timestamp, price, spread, pair regime) but fake outcomes (random strategy selection, simulated scores, simulated entry/exit). The outcomes are noise — false correlations are worse than no data.

**Actions**:
1. Flag old VTS trade records in telemetry_history as `source: 'legacy_simulation'` — exclude from all learning queries but do NOT delete the database rows. They may have archival value.
2. Roll back all predictive learning that was based on simulated data:
   - Reset calibration weights
   - Clear regime archive entries
   - Reset drift detector baselines
3. Clear VTS in-memory trade history
4. Reset telemetry aggregator rolling windows
5. Log the reset event with `type: 'lifecycle'`
6. Start fresh — real data accumulates from the moment Phase 14 goes live

**Do NOT build a backtesting/backfill engine.** We considered retroactively recalculating old trades through MCE + real strategy modules, but the old trades have fake entries that shouldn't have existed — you can't "fix" a trade that was never a real signal. Clean slate is the right approach.

## Correction 5: DB Schema Changes Need SQL Migration

After the Batch 14-hotfix lesson (strategy_type enum crash), all DB schema changes must include:
- A SQL migration file (e.g., `migrations/0003_batch15_signal_metadata_expansion.sql`)
- Drizzle schema update in `shared/schema.ts`
- INSTRUCTIONS.md must specify: **SQL migration runs FIRST**, then schema file placement

This applies to:
- The pairRegime enum expansion (add 5 new canonical names, keep old names for backward compatibility)
- Any new columns added to telemetry_history (globalRegime, pairFriction, globalFriction, pairDirectionalBias, globalDirectionalBias)
- Any new directional bias enum if we use one

## Correction 6: analytics.tsx Regime Table Must Be Dynamic

The scope mentions this but needs to be more specific. The Overview tab in `analytics.tsx` has TWO problems:

1. **Hardcoded regime/strategy matrix table** — the "Market Regime Definitions" section is fully static JSX. Must be replaced with dynamic rendering from a new API endpoint that exposes `CANONICAL_REGIME_STRATEGY_MAP` data.
2. **Global regime display** — currently fed by `market-indicators.ts` which has stale parallel regime data (see Correction 2). Once `market-indicators.ts` is rewired to the canonical map, the global regime display will show the correct new names.

Decide whether the API endpoint should be a new route file or added to the existing `routes.ts` — check how routing is structured in the current architecture before creating a new route file.

## Addition 1: Global DBS on Analytics Overview Tab

Add a "Global Directional Bias" section to the Analytics & Diagnostics Overview tab, positioned alongside the existing "Global Market Regime" and "Global Friction Score" sections. It should display:
- The global DBS score (numeric, -1.0 to +1.0)
- The category label (UP_STRONG through DOWN_STRONG)
- A visual indicator (color-coded like friction)
- Sample size (number of pairs in the calculation)

## Addition 2: INSTRUCTIONS.md Format

INSTRUCTIONS.md in the batch zip must include:
- Replit Autonomy Constraints block at the top
- PART A: File placements (which files go where)
- PART B: Surgical edits (for large files too large to include wholesale)
- PART C: SQL migration execution (BEFORE file placement)
- PART D: Validation commands
- PART E: Commit message using `REPLIT_PUSH_SCRIPT.sh`

## Summary of What Needs to Change in the Scope

1. **Workstream 1 (Regime Rename)**: Add the `market-indicators.ts` rewiring as an explicit task. It's not just renaming strings — it's eliminating a stale parallel data source and wiring to the canonical map.
2. **Workstream 2 (Directional Bias)**: Add global DBS display to the Analytics Overview tab.
3. **Workstream 3 (Signal Metadata)**: Specify that global regime and friction values come from existing `getDominantRegime()` and `computeGlobalFrictionWithDetails()` — don't build new calculations. Capture at trade open only. Include SQL migration details.
4. **Workstream 5 (Predictive Learning)**: Specify the full rollback plan — reset calibration, clear archive, reset drift baselines, flag old data as legacy_simulation.
5. **Workstream 6 (Math Validation)**: Add validation of the global regime calculation (is mode the best approach?) and global friction calculation (is active filter pool the right source?).
6. **Workstream 7 (VTS Data Clear)**: Replace with the clear plan above. No backfill engine. Flag old records, roll back learning, start fresh.

Please update BATCH_15_SCOPE.md with these corrections and present it back for final approval before implementation.
