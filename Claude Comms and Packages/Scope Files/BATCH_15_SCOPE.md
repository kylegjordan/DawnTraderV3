# BATCH 15 SCOPE — Phase 14: VTS Real Calculations, Directional Bias & Regime Rename

> **Author**: Claude Code (System Cartographer & Lead Architect)
> **Created**: 2026-03-05
> **Revised**: 2026-03-05 (v2 — Kyle review corrections: global regime/friction already exist, market-indicators.ts stale parallel data fix, capture-at-open-only, no backfill engine, SQL migration requirement, analytics additions)
> **Phase**: 14 (VTS Real Calculations & Signal Model Enrichment)
> **Batch**: 15 (code) + 15B (governance)
> **Branch**: dawntrader-v4
> **Last Commit**: `fe6aa73f`
> **Test Baseline**: 791 pass / 90 fail (881 total)
> **Pre-Batch Snapshot**: SNAPSHOT-023 (to be created before implementation)

---

## Scope Summary

Phase 14 is the "make the signals real" phase. Seven workstreams in one mega-batch:

1. **Regime Rename** — Remove directional language from 5 canonical regime names + eliminate stale parallel regime data in `market-indicators.ts`
2. **Directional Bias System** — New DBS calculation, 7 categories, soft confidence modifier, global DBS display on Analytics Overview tab
3. **Signal Metadata Expansion** — 6 context dimensions captured at trade OPEN time, using existing global regime/friction calculations (not rebuilding them), with SQL migrations
4. **VTS Real Strategy Calculations** — Replace 3 simulation stubs with real strategy module calls
5. **Predictive Learning Data Capture** — All scoring metrics + 6 context dimensions flow into learning, full rollback of simulation-based learning
6. **Math Validation** — Document formula review findings including global regime/friction calculation assessment
7. **VTS Data Clear & Fresh Start** — Flag old records, roll back learning, start fresh (no backfill engine)

**Key decisions already made:**
- Short trading is DEFERRED (Kraken requires $10M ECP for US margin)
- Directional bias is SOFT ACTIVE (confidence modifier, not hard block)
- Regime rename uses the 5 approved new names
- One mega-batch (Batch 15 code + Batch 15B governance)

---

## Workstream 1: Regime Rename

### Objective
Remove directional language from the 5 canonical regime names. "Regime" describes market structure (volatility, noise, stability), not price direction. Direction is now the job of the new Directional Bias system. Additionally, eliminate the stale parallel regime data in `market-indicators.ts` that currently prevents the canonical map from being the single source of truth for the UI.

### Name Changes

| Old Name | New Name |
|----------|----------|
| `BULL_STABLE` | `TREND_FRIENDLY_STABLE` |
| `BEAR_VOLATILE` | `HIGH_VOLATILITY_UNSTABLE` |
| `LOW_VOL_CHOP` | `RANGE_BOUND_STABLE` |
| `HIGH_VOL_IMPULSE` | `IMPULSE_EXPANSION` |
| `TRANSITION` | `STRUCTURAL_TRANSITION` |

### Critical Fix: market-indicators.ts Stale Parallel Data

`server/services/market-indicators.ts` has its own parallel regime data that does NOT reference `canonical-regime-strategy-map.ts`:

1. **`regimeNarratives` object (lines 64-97)** — Hardcoded descriptions for 8 regime names including ghost regimes (BULL_VOLATILE, BEAR_STABLE, HIGH_VOL_CHOP, MIXED_TRANSITION, EXTREME_NOISE) that don't match the canonical 5.
2. **`REGIME_DESCRIPTIONS` record (lines 113-144)** — Maps a 6-value `MarketRegime` type to `RegimeInfo` objects. Uses old names.
3. **`mapToBaseRegime()` function (lines 251-258)** — Lossy adapter that maps canonical names to the old 6-value type: `HIGH_VOL_IMPULSE → BULL_VOLATILE`, `TRANSITION → LOW_VOL_CHOP`. This is why the UI shows wrong regime names.
4. **`MarketRegime` type** — Imported from `dynamic-strategy-selector.ts` as `CanonicalRegimeType | 'EXTREME_NOISE'`. After rename, this type must reference the new canonical names.

**Fix plan:**
1. Remove `mapToBaseRegime()` — it's a lossy legacy adapter
2. Rewrite `regimeNarratives` to use the 5 new canonical names only (drop ghost regime narratives — they map through GHOST_REGIME_NORMALIZATION at the application layer)
3. Rewrite `REGIME_DESCRIPTIONS` to use the 5 new canonical names
4. Wire `getMarketIndicators()` to return canonical regime names directly (no lossy mapping)
5. Update `MarketRegime` type in `dynamic-strategy-selector.ts` to use new canonical names

### Additional Parallel Data Sources to Fix

Also found during audit:
- **`bridge/canonical/mapping-regime-strategy.json`** — Bridge JSON file used by `server/core/strategy-mapper.ts`. Has old regime keys (BULL_STABLE, BEAR_VOLATILE, etc.). Must be updated to new names.
- **`server/core/strategy-mapper.ts`** — Reads from bridge JSON. No code changes needed if JSON keys are updated, but verify.
- **`server/config/adaptive-thresholds.ts`** — Check for hardcoded regime name references.
- **`server/core/risk/dynamic-sizing-engine.ts`** — Check for regime name references.
- **`server/core/calculations/expectancy.ts`** — Has regime-keyed ROI thresholds. Verify and update.

### Files Affected

**Server — Core (type definitions, canonical map, regime logic):**
- `server/config/canonical-regime-strategy-map.ts` — `CanonicalRegimeType`, `REGIMES`, `CANONICAL_REGIME_STRATEGY_MAP`, `REGIME_METRICS`, `GHOST_REGIME_NORMALIZATION`
- `server/types/market-regime.types.ts` — `REGIME_WEIGHTS`, `REGIME_DESCRIPTIONS`
- `server/core/metrics/market-regime.ts` — `calculatePairRegime()` return values, `getNormalizedRegime()`, `calculateRegimeScore()` switch cases
- `bridge/canonical/mapping-regime-strategy.json` — Bridge JSON regime keys

**Server — Stale Parallel Data (critical fix):**
- `server/services/market-indicators.ts` — Remove `mapToBaseRegime()`, rewrite `regimeNarratives` and `REGIME_DESCRIPTIONS` to canonical 5
- `server/services/dynamic-strategy-selector.ts` — Update `MarketRegime` type

**Server — Consumers (import and use regime names):**
- `server/services/market-context-engine.ts` — regime lookups
- `server/services/vts-runner.ts` — regime references in simulation logic
- `server/services/signal-orchestrator.ts` — regime-based routing
- `server/services/telemetry-aggregator.ts` — regime-keyed aggregation
- `server/services/telemetry-repository.ts` — regime enum in DB writes
- `server/services/drift-detector.ts` — per-regime drift baselines
- `server/services/vts-service.ts` — regime references
- `server/services/adaptive-ratio-manager.ts` — regime-based pool logic
- `server/core/archival/regime-archiver.ts` — regime-keyed archive
- `server/core/governance/learning-cooldown.ts` — regime-aware gating
- `server/core/strategy-mapper.ts` — reads bridge JSON
- `server/core/calculations/expectancy.ts` — regime-keyed ROI thresholds
- `server/core/risk/dynamic-sizing-engine.ts` — regime references
- `server/config/adaptive-thresholds.ts` — regime references
- `shared/schema.ts` — `pairRegime` enum definition (DB schema)

**Client — UI components:**
- `client/src/utils/frictionColor.ts` — `getRegimeBadgeClassName()` color mapping
- `client/src/pages/analytics.tsx` — hardcoded regime map (Overview tab)
- Any other components displaying regime badges/names

**Tests (~34 files):**
- All test files referencing regime names (string literals in assertions)

### GHOST_REGIME_NORMALIZATION Update
Add old canonical names as ghost mappings so any persisted data or stale references resolve correctly:

```typescript
export const GHOST_REGIME_NORMALIZATION: Record<string, CanonicalRegimeType> = {
  // Legacy ghost regimes (pre-existing)
  BULL_VOLATILE: 'IMPULSE_EXPANSION',
  BEAR_STABLE: 'HIGH_VOLATILITY_UNSTABLE',
  EXTREME_NOISE: 'RANGE_BOUND_STABLE',
  HIGH_VOL_CHOP: 'IMPULSE_EXPANSION',
  MIXED_TRANSITION: 'STRUCTURAL_TRANSITION',
  // Old canonical names (Phase 14 rename)
  BULL_STABLE: 'TREND_FRIENDLY_STABLE',
  BEAR_VOLATILE: 'HIGH_VOLATILITY_UNSTABLE',
  LOW_VOL_CHOP: 'RANGE_BOUND_STABLE',
  HIGH_VOL_IMPULSE: 'IMPULSE_EXPANSION',
  TRANSITION: 'STRUCTURAL_TRANSITION',
};
```

### Analytics Page — Dynamic Regime Map
Replace the hardcoded regime/strategy table in `analytics.tsx` with a dynamic component:
- Add API endpoint that returns `CANONICAL_REGIME_STRATEGY_MAP` data (regime names, metrics, strategies, risk multipliers, descriptions)
- Check existing routing structure: project uses `server/routes/` directory for domain-specific route files (audit.ts, health.ts, vts.ts, etc.) alongside the monolithic `routes.ts`. **Add the new endpoint to an existing route file** (e.g., `server/routes/status.ts` or as a new lightweight `server/routes/regime-map.ts`) rather than the monolithic `routes.ts`.
- Frontend fetches and renders from API response
- If the canonical map changes, the UI updates automatically

### DB Schema — pairRegime Enum
The `pairRegime` enum in `shared/schema.ts` currently has 6 values:
```
EXTREME_NOISE, BULL_STABLE, BULL_VOLATILE, BEAR_STABLE, BEAR_VOLATILE, LOW_VOL_CHOP
```
This needs updating to the 5 new canonical names plus keeping old names for backward compatibility with existing rows. Approach: expand the enum to include both old and new names. New writes use new names. Old rows remain readable via GHOST_REGIME_NORMALIZATION at the application layer.

**Requires SQL migration** (see Workstream 3 for migration details).

---

## Workstream 2: Directional Bias System

### Objective
Add a new dimension to the market model: Directional Bias. This quantifies price trajectory (up/down/neutral) independently of structural regime (volatility/stability/noise).

### Directional Bias Score (DBS)

**Pair-Level DBS:**
```
DBS_pair = w1 * slope(log(price), N) + w2 * normalized_return(N) + w3 * EMA_trend_alignment
```
Where:
- `N` = rolling window (48–96 candles depending on available OHLC depth)
- Slope normalized by ATR or realized volatility
- Output normalized to [-1.0, +1.0]
- Default weights: w1=0.40, w2=0.35, w3=0.25 (tunable)

**Global DBS:**
```
DBS_global = weighted_median(DBS_pair across active FX5 universe)
```
Weighted by 24h volume (liquidity proxy).

### 7 Directional Bias Categories

| DBS Range | Category |
|-----------|----------|
| >= +0.60 | `UP_STRONG` |
| +0.30 to +0.59 | `UP_MODERATE` |
| +0.10 to +0.29 | `UP_WEAK` |
| -0.09 to +0.09 | `NEUTRAL` |
| -0.10 to -0.29 | `DOWN_WEAK` |
| -0.30 to -0.59 | `DOWN_MODERATE` |
| <= -0.60 | `DOWN_STRONG` |

Symmetric, interpretable, tunable. Thresholds are configurable constants.

### New Files
- `server/core/metrics/directional-bias.ts` — DBS calculation (pair + global), category classification
- `server/types/directional-bias.types.ts` — Type definitions (DirectionalBiasCategory, DirectionalBiasResult, etc.)

### Soft Integration — Confidence Modifier
Directional bias acts as a **confidence modifier** in the regime-strategy mapping, not a hard block:

- When directional bias **opposes** strategy direction (e.g., `DOWN_STRONG` for a long-only breakout strategy), **dampen confidence** via multiplier (e.g., 0.70–0.85)
- When directional bias **aligns** with strategy direction (e.g., `UP_STRONG` for a momentum-following strategy), **amplify confidence** slightly (e.g., 1.05–1.15)
- When directional bias is `NEUTRAL`, no modifier applied (1.0)
- **Signals still generate regardless** — maximum learning data. Only confidence changes.

The modifier is applied in the signal orchestrator (active path) and VTS runner (passive path) after strategy signal generation, before FinalScore computation.

### DBS Computation Location
DBS is computed inside MCE as an extension of `computeContext()`. MCE already receives OHLC data and computes regime — DBS is a natural addition. The `MarketContext` output gains a new `directionalBias` field.

### MCE Interface Extension
```typescript
interface MarketContext {
  symbol: string;
  timestamp: number;
  indicators: MarketIndicators;
  regime: RegimeContext;
  raw: RegimeCalculationResult;
  // NEW:
  directionalBias: {
    score: number;           // -1.0 to +1.0
    category: DirectionalBiasCategory;  // UP_STRONG through DOWN_STRONG
  };
}
```

Global DBS is computed separately (not per-symbol cached). MCE gets a new method:
```typescript
computeGlobalBias(pairResults: Map<string, MarketContext>, volumes: Map<string, number>): GlobalDirectionalBias
```

### Global DBS on Analytics Overview Tab
Add a "Global Directional Bias" section to the Analytics & Diagnostics Overview tab, positioned alongside the existing "Global Market Regime" and "Global Friction Score" sections. It should display:
- The global DBS score (numeric, -1.0 to +1.0)
- The category label (UP_STRONG through DOWN_STRONG)
- A visual color indicator (color-coded similar to friction: green for UP_STRONG/UP_MODERATE, yellow for NEUTRAL/UP_WEAK/DOWN_WEAK, orange for DOWN_MODERATE, red for DOWN_STRONG)
- Sample size (number of pairs in the calculation)

---

## Workstream 3: Signal Metadata Expansion

### Objective
Every signal (VTS and active) captures 6 context dimensions at trade **OPEN** time so predictive learning has complete market context for correlation and trend analysis.

### Capture at Trade OPEN Only
All 6 context dimensions are captured as a single snapshot at trade **open** time, not at close, not at both.

**Rationale**: The trading decision happens at open — that's when regime, friction, and directional bias influenced strategy selection and confidence. Predictive learning needs to correlate decision-time context with outcomes. For short-duration VTS trades, conditions rarely change significantly between open and close.

### 6 Context Fields

| Field | Level | Source | Status |
|-------|-------|--------|--------|
| Structural Regime | Pair | MCE `computeContext()` → `regime.regime` | **Already captured** in `pairRegime` column |
| Structural Regime | Global | `telemetry-aggregator.ts` → `getDominantRegime()` | **Already computed**, NOT persisted — snapshot & persist |
| Directional Bias | Pair | MCE `computeContext()` → `directionalBias.category` | **NEW** — build & persist |
| Directional Bias | Global | MCE `computeGlobalBias()` | **NEW** — build & persist |
| Friction | Pair | `cost-metrics.ts` → `computeMarketFriction()` per pair | **Already computed**, NOT persisted — snapshot & persist |
| Friction | Global | `market-indicators.ts` → `computeGlobalFrictionWithDetails()` | **Already computed**, NOT persisted — snapshot & persist |

**Key correction**: Global regime and global friction are NOT new calculations to build. They already exist and are displayed on the Analytics Overview tab:
- **Global Regime**: `telemetry-aggregator.ts` → `getDominantRegime()` — counts pair-level regimes from recent telemetry, returns the mode (most common regime) with average score and percentage of pairs.
- **Global Friction**: `market-indicators.ts` → `computeGlobalFrictionWithDetails()` — averages per-pair friction scores from `activeFilterPool.getActivePool('paper')`, sampling up to 100 pairs. Per-pair formula: `base = (spread + slippage + fee) × 10000`, `normalized = min(base / 3, 100)`.

**What we do**: Tap into these existing functions, snapshot their values at trade open time, and persist them to each VTS trade record and telemetry_history.

### Where Context Is Attached
- **VTS Runner** — Each VTS trade record gains all 6 fields (snapshotted at trade open)
- **Signal Orchestrator** — Each SizedStrategySignal gains all 6 fields (snapshotted at signal generation)
- **Telemetry Repository** — All 6 fields persisted to `telemetry_history` table

### DB Schema Changes — With SQL Migration
After the Batch 14-hotfix lesson (strategy_type enum crash), all DB schema changes include a SQL migration file.

**Migration file**: `migrations/0003_batch15_signal_metadata_expansion.sql`

Contents:
1. **Expand pairRegime enum** — Add 5 new canonical names, keep old names for backward compatibility:
   ```sql
   ALTER TYPE "pair_regime" ADD VALUE IF NOT EXISTS 'TREND_FRIENDLY_STABLE';
   ALTER TYPE "pair_regime" ADD VALUE IF NOT EXISTS 'HIGH_VOLATILITY_UNSTABLE';
   ALTER TYPE "pair_regime" ADD VALUE IF NOT EXISTS 'RANGE_BOUND_STABLE';
   ALTER TYPE "pair_regime" ADD VALUE IF NOT EXISTS 'IMPULSE_EXPANSION';
   ALTER TYPE "pair_regime" ADD VALUE IF NOT EXISTS 'STRUCTURAL_TRANSITION';
   ALTER TYPE "pair_regime" ADD VALUE IF NOT EXISTS 'HIGH_VOL_IMPULSE';
   ```

2. **Add new columns to telemetry_history**:
   ```sql
   ALTER TABLE "telemetry_history" ADD COLUMN IF NOT EXISTS "global_regime" VARCHAR(40);
   ALTER TABLE "telemetry_history" ADD COLUMN IF NOT EXISTS "pair_friction" DECIMAL(5, 2);
   ALTER TABLE "telemetry_history" ADD COLUMN IF NOT EXISTS "global_friction" DECIMAL(5, 2);
   ALTER TABLE "telemetry_history" ADD COLUMN IF NOT EXISTS "pair_directional_bias" VARCHAR(20);
   ALTER TABLE "telemetry_history" ADD COLUMN IF NOT EXISTS "global_directional_bias" VARCHAR(20);
   ALTER TABLE "telemetry_history" ADD COLUMN IF NOT EXISTS "decay_penalty" DECIMAL(5, 4);
   ```

3. **Drizzle schema update** in `shared/schema.ts` — Add matching column definitions.

**INSTRUCTIONS.md must specify: SQL migration runs FIRST, then schema file placement, then remaining files.**

---

## Workstream 4: VTS Real Strategy Calculations

### Objective
Replace the 3 simulation stubs in `vts-runner.ts` with real strategy module calls. VTS signals become real, strategy-specific calculations instead of regime-based random numbers.

### Stubs to Replace

| Stub | Current Behavior | Replacement |
|------|-----------------|-------------|
| `simulateHybridScore(regime)` | Base score per regime ± random(0.2) | Real strategy module `detect*()` → signal.confidence as hybridScore |
| `simulatePredictiveConfidence(regime, hybrid)` | `hybrid * 0.8 + 0.1 ± random(0.15)` | Deterministic confidence formula (same as signal orchestrator uses) |
| `simulateDecayPenalty()` | `random() * 0.15` | `0.0` (VTS signals are fresh — no age-based decay) |

### How VTS Will Generate Real Signals

For each pair in the VTS universe, per cycle:
1. MCE `computeContext()` → get regime, indicators, directional bias
2. Snapshot global regime (from `getDominantRegime()`), global friction (from `computeGlobalFrictionWithDetails()`), global DBS at cycle start
3. Look up `allowedStrategies` for the regime from canonical map
4. For **each** allowed strategy:
   a. Call the strategy module's `detect*()` function with MCE indicators + OHLC
   b. If signal returned (not null): use real entry/stop/target/confidence
   c. If no signal: strategy has no setup for this pair right now — skip
5. For each real signal: compute FinalScore using real components (no simulation)
6. Apply directional bias confidence modifier
7. Record trade with all 6 context dimensions (snapshotted at open) + full scoring metrics

### Strategy Module Calling Pattern
VTS needs access to the strategy engine's `detect*()` methods. Two approaches:
- **Option A**: Import strategy engine and call detect methods directly (VTS already has OHLC + MCE indicators)
- **Option B**: Create a lightweight `evaluateStrategiesForPair()` function that wraps the strategy engine calls

**Recommended: Option A** — Direct calls. VTS already has all the inputs. No new abstraction needed.

### Pattern Recognition for VTS
Pattern strategies (HYBRID/PATTERN types) need pattern recognition input. VTS must run the pattern recognizer on OHLC data before calling pattern-dependent strategies. The pattern recognizer is a pure function — no active trading state needed.

### Volume Impact
Today VTS generates 1 signal per pair per cycle (random strategy). With real calculations, VTS generates **up to N signals per pair** (one per allowed strategy that has a valid setup). This dramatically increases learning data volume — exactly what Kyle's directional bias doc recommends.

---

## Workstream 5: Predictive Learning Data Capture

### Objective
Ensure all scoring metrics AND all 6 context dimensions flow into predictive learning for correlation and trend analysis. Roll back all learning that was based on simulated data.

### Scoring Metrics (verify capture)
These are already in `telemetry_history` but need to be verified as flowing into ML Calibration:

| Metric | In telemetry_history? | Flowing to ML Calibration? | Action |
|--------|----------------------|---------------------------|--------|
| finalScore | Yes | Yes (primary) | Verify |
| hybridScore | Yes | Partial (used indirectly) | Verify full flow |
| regimeWeight | Yes | Yes | Verify |
| predictiveConfidence | Yes | Yes | Verify |
| decayPenalty | No (computed, not stored) | No | **Add column & persist** |
| successRate | Yes | No (not used by calibration) | Wire into calibration |
| sampleCount | Yes | No (not used by calibration) | Wire into calibration |
| pool | Yes | No (not stratified by pool) | Wire into calibration |

### Action Items
1. **Verify** that ML Calibration scheduler reads all scoring metrics from telemetry_history, not just win rate
2. **Add** the 6 new context dimensions (global regime, pair/global friction, pair/global directional bias) to the data that calibration analyzes
3. **Add** decayPenalty column to telemetry_history (included in SQL migration, see Workstream 3)
4. **Ensure** regime archive captures all new dimensions for long-term historical memory
5. **Ensure** drift detector baselines are updated for new regime names
6. **Ensure** predictive adjustments logger captures directional bias context

### Full Learning Rollback Plan
Old VTS trades have real market observations (pair, timestamp, price, spread, pair regime) but fake outcomes (random strategy selection, simulated scores, simulated entry/exit). The outcomes are noise — false correlations are worse than no data.

**Rollback actions:**
1. Flag old VTS trade records in telemetry_history as `source: 'legacy_simulation'` — exclude from all learning queries but do NOT delete database rows (archival value)
2. Reset calibration weights to defaults
3. Clear regime archive entries (old entries used simulation-era regime names and fake outcomes)
4. Reset drift detector baselines (new regime names, fresh real data needed)
5. Clear VTS in-memory trade history
6. Reset telemetry aggregator rolling windows
7. Log the reset event in predictive adjustments with `type: 'lifecycle'`

### Trend Detection — Future-Proofing
Phase 14 does NOT build a trend detection engine (that's Phase 15 rules-based / Phase 17 ML design). However, Phase 14 ensures the **data foundation** is complete:
- All 6 context dimensions persisted per trade (at open time)
- All scoring metrics persisted per trade (finalScore, hybridScore, regimeWeight, predictiveConfidence, decayPenalty, successRate, sampleCount, pool)
- Regime archive captures multi-dimensional snapshots
- Data is queryable for future correlation analysis (e.g., "how does Strategy X perform in TREND_FRIENDLY_STABLE + DOWN_MODERATE + high friction?")

The trend detection system will consume this data in later phases. Our job now is to make sure nothing is missing.

---

## Workstream 6: Math Validation

### Findings from Pre-Implementation Audit

**Regime Classification (`calculatePairRegime`)** — Sound. Uses volatility (std dev of returns), momentum (14-period price change), and ADX. Thresholds are reasonable for crypto markets. No formula changes needed — the rename is cosmetic.

**Friction (`computeTotalRoundTripCost`)** — Correct. `(fee × 2) + (slippage × 2) + spread`. Accounts for entry+exit fees, entry+exit slippage, entry spread. No changes needed.

**Proposed DBS Formula** — Good first pass:
- `slope(log(price), N)` — captures trend direction, log-scale handles compounding
- `normalized_return(N)` — captures magnitude
- `EMA_trend_alignment` — captures multi-timeframe confirmation (e.g., EMA(12) vs EMA(26) position)
- Output normalized to [-1.0, +1.0] via ATR-based normalization
- ADX intentionally excluded from DBS (it's in regime classification — no duplication)

**Confidence Modifier for DBS** — The multiplier approach is safe:
- Opposing bias: 0.70–0.85 confidence multiplier (dampens, doesn't block)
- Aligning bias: 1.05–1.15 confidence multiplier (slight boost, not aggressive)
- Neutral: 1.0 (no change)
- Signals still generate for maximum learning data

### Global Regime Calculation Assessment

**Current approach**: `getDominantRegime()` in `telemetry-aggregator.ts` uses **mode** (most common pair regime) weighted by count. Returns the regime that the most pairs fall into, with average score and percentage.

**Assessment**: Mode is a reasonable approach for global regime. It answers "what structural condition are most of our tradeable pairs experiencing?" The alternative (weighted by volume or market cap) would bias toward BTC/ETH, which may not represent the broader market. **Recommendation: keep mode-based approach.** Volume-weighting is better suited for global DBS (where large-cap direction matters more).

### Global Friction Calculation Assessment

**Current approach**: `computeGlobalFrictionWithDetails()` in `market-indicators.ts` uses the **active filter pool** (pairs that passed FX5 scanning in paper mode), sampling up to 100 pairs, averaging their friction scores.

**Assessment**: Using the active filter pool is the right choice. These are the pairs we actually trade — their friction directly impacts our execution quality. The ideal pool is a subset of the active pool (top VTS performers), which would be too narrow. A market-wide average (all pairs) would include illiquid pairs we'd never trade, inflating the friction score. **Recommendation: keep active filter pool approach.**

No formula changes recommended for any existing calculations. Document these findings in the governance batch.

---

## Workstream 7: VTS Data Clear & Fresh Start

### Objective
Clear simulation artifacts from VTS data and roll back all learning based on simulated outcomes. No backfill engine — start fresh with real calculations.

### Why No Backfill
Old VTS trades have fake entries that shouldn't have existed — random strategy selection and simulated scores. You can't "fix" a trade that was never a real signal. The market observations are real (price, spread, volume) but the outcomes are noise (random entry/stop/target). Clean slate is the right approach.

### Clear Actions
1. **Flag old records**: Update telemetry_history rows where `source = 'simulation'` to `source = 'legacy_simulation'`. Exclude `legacy_simulation` from all learning queries. Do NOT delete rows — they may have archival research value.
2. **Roll back predictive learning**:
   - Reset calibration weights to defaults
   - Clear regime archive entries
   - Reset drift detector baselines
3. **Clear VTS runtime state**:
   - Clear VTS in-memory trade history (`vts-service.ts` trades array)
   - Reset telemetry aggregator rolling windows
4. **Log the reset**: Predictive adjustments logger records lifecycle event with reason, timestamp, and batch reference
5. **Start fresh**: Real data accumulates from the moment Phase 14 goes live. VTS generates real strategy signals immediately.

---

## Implementation Order

1. **Regime Rename** (foundational — everything else uses new names, includes market-indicators.ts fix and bridge JSON update)
2. **Directional Bias types + calculation** (new module, no existing code depends on it yet)
3. **MCE extension** (add DBS to MarketContext output)
4. **Signal Metadata Expansion** (SQL migration FIRST, then add 6 fields to signals, telemetry, DB schema)
5. **VTS Real Strategy Calculations** (replace 3 stubs, wire real strategy calls, snapshot all context at open)
6. **Predictive Learning Data Capture** (verify + fix scoring metric flow, add new dimensions, full learning rollback)
7. **VTS Data Clear & Fresh Start** (flag old records, roll back learning, start fresh)

---

## Files Modified (Estimated)

### Server — New Files (~5)
- `server/core/metrics/directional-bias.ts` — DBS calculation (pair + global)
- `server/types/directional-bias.types.ts` — Type definitions
- `server/routes/regime-map.ts` — API endpoint for dynamic regime map (following existing `server/routes/` pattern)
- `migrations/0003_batch15_signal_metadata_expansion.sql` — DB schema migration
- (test files for directional bias)

### Server — Modified Files (~30-35)
- `server/config/canonical-regime-strategy-map.ts` — Regime names, ghost normalization
- `server/types/market-regime.types.ts` — Regime weights, descriptions
- `server/types/market-context.ts` — Add directionalBias to MarketContext
- `server/core/metrics/market-regime.ts` — calculatePairRegime() regime names, calculateRegimeScore() switch cases
- `server/services/market-context-engine.ts` — Add DBS computation to computeContext()
- `server/services/market-indicators.ts` — **Critical fix**: remove mapToBaseRegime(), rewrite regimeNarratives/REGIME_DESCRIPTIONS to canonical 5
- `server/services/dynamic-strategy-selector.ts` — Update MarketRegime type
- `server/services/vts-runner.ts` — Replace 3 simulation stubs, wire real strategy calls, snapshot context at open
- `server/services/signal-orchestrator.ts` — Add 6 context fields to signals, apply DBS confidence modifier
- `server/services/telemetry-aggregator.ts` — Regime-keyed aggregation with new names
- `server/services/telemetry-repository.ts` — Persist 6 new fields, handle regime enum
- `server/services/drift-detector.ts` — Reset baselines, new regime names
- `server/services/vts-service.ts` — Regime references, clear trades
- `server/services/adaptive-ratio-manager.ts` — Regime-based pool logic
- `server/services/ml-calibration.ts` — Wire all scoring metrics, add context dimensions
- `server/core/archival/regime-archiver.ts` — New regime names, clear old entries
- `server/core/governance/learning-cooldown.ts` — Regime-aware gating
- `server/core/schedulers/ml-calibration-scheduler.ts` — Wire full metrics
- `server/core/logging/predictive-adjustments.ts` — Add directional bias context
- `server/core/strategy-mapper.ts` — Verify bridge JSON compatibility
- `server/core/calculations/expectancy.ts` — Regime-keyed ROI thresholds
- `server/core/risk/dynamic-sizing-engine.ts` — Regime references
- `server/config/adaptive-thresholds.ts` — Regime references
- `bridge/canonical/mapping-regime-strategy.json` — Update regime keys
- `shared/schema.ts` — Add new columns, expand pairRegime enum
- `server/index.ts` — Route registration for regime-map endpoint

### Client — Modified Files (~3-5)
- `client/src/utils/frictionColor.ts` — Update regime badge colors to new names
- `client/src/pages/analytics.tsx` — Dynamic regime map from API, add Global DBS display section
- Any other components with hardcoded regime names

### Test Files (~34)
- All test files with regime name string literals

---

## INSTRUCTIONS.md Format (for Replit)

INSTRUCTIONS.md in the batch zip must include:
- **Header**: Replit Autonomy Constraints block
- **PART A**: File placements (which files go where, repo-relative paths)
- **PART B**: Surgical edits (for large files too large to include wholesale — e.g., routes.ts, analytics.tsx)
- **PART C**: SQL migration execution (**BEFORE file placement**): `psql $DATABASE_URL -f migrations/0003_batch15_signal_metadata_expansion.sql`
- **PART D**: Validation commands (`npx tsc --noEmit`, test suite, server startup)
- **PART E**: Commit message using `bash REPLIT_PUSH_SCRIPT.sh "Batch 15: ..."`

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Regime rename breaks string comparisons | HIGH | GHOST_REGIME_NORMALIZATION maps old→new. Comprehensive search-and-replace with verification. |
| market-indicators.ts stale data causes UI mismatch | HIGH | Remove mapToBaseRegime(), rewrite to canonical 5. Verify all UI displays show new names. |
| DB enum mismatch after rename | MEDIUM | SQL migration adds new values. Application layer normalizes via ghost map. Migration runs FIRST. |
| VTS real calculations produce unexpected signal volume | LOW | VTS already handles multi-signal per pair. Monitor signal density in first cycles. |
| DBS formula needs tuning | LOW | Weights are configurable constants. Default weights are reasonable first pass. |
| Confidence modifier is too aggressive/passive | LOW | Multiplier ranges (0.70–1.15) are conservative. All signals still generate. |
| Learning rollback loses useful data | LOW | Old data is flagged, not deleted. Simulated outcomes were noise — false correlations worse than no data. |

---

## Validation Criteria

1. `npx tsc --noEmit` — zero new compilation errors
2. Test suite — no new failures beyond existing 90 baseline failures
3. VTS generates real strategy signals (not random scores) — verify via logs
4. All 6 context dimensions appear in telemetry output at trade open time
5. Directional bias calculation produces sensible values for known market conditions
6. Regime names updated across ALL files — no stale references to old names (including market-indicators.ts, bridge JSON, expectancy.ts)
7. Analytics page regime map renders dynamically from API
8. Analytics page shows Global Directional Bias section alongside existing regime/friction displays
9. GHOST_REGIME_NORMALIZATION correctly maps old names → new names
10. Server starts successfully with all new components
11. SQL migration runs cleanly on Replit (no enum conflicts)
12. Old VTS records flagged as `legacy_simulation` and excluded from learning queries

---

## Commit Message (for Replit)

```
Batch 15: Phase 14 — VTS Real Calculations, Directional Bias & Regime Rename. 5 regimes renamed (BULL_STABLE→TREND_FRIENDLY_STABLE, etc). market-indicators.ts stale parallel data eliminated — wired to canonical map. Directional Bias System added (7-category DBS, soft confidence modifier). 6-dimension signal metadata captured at trade open (regime/friction/bias × global/pair). VTS simulation stubs replaced with real strategy module calls. Predictive learning expanded with all scoring metrics + context dimensions. Simulation-era learning rolled back. ~35 files modified, ~5 new files.
```

---

*Scope v2 ready for Kyle's final approval. No code will be written until approved.*
