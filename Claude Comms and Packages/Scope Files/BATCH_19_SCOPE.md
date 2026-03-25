# BATCH 19 SCOPE (REVISED) — Phase 14.5: Dual-Path Pattern Scanning + Merit-Based Ranking + MCE-Derived Global Regime Overlay

**Phase**: 14.5 (Block 3)
**Batch**: 19
**Date**: 2026-03-17 (revised after three-way design discussion)
**Status**: APPROVED — Kyle handed off to Claude Code + Langston for execution
**Previous version**: 2026-03-14 (pre-discussion draft, superseded)

---

## Design Discussion Summary

This scope was revised following a three-way design discussion (Kyle, Langston, Claude Code) in Telegram topic 21 on 2026-03-17. Key changes from the original scope:

1. **Merit-based, not quota-based** — Hard cap of "max 2 pattern trades" removed. Quant and pattern signals compete on merit within normal risk limits.
2. **MCE-derived global regime** — Part C changed from "BTC-regime-informed pre-filter" to "MCE-derived global regime overlay with BTC as secondary confirmer." Current VTS-telemetry global regime is too thin (~20-60 pairs); MCE-level population (~100-300 pairs) is upstream and less selection-biased.
3. **Mode-aware regime sourcing** — Active trading mode uses MCE-derived global regime; passive/VTS mode uses existing VTS-derived global regime.
4. **Separate rankingScore** — FinalScore stays as signal quality (SQE gate authority). New rankingScore field added for cross-family RTB queue ordering.
5. **sourcePool + signalType both needed** — sourcePool = active filter path origin (quant/pattern). signalType = signal nature (QUANT/PATTERN/HYBRID). Different questions, not redundant.
6. **assetClass field** — Introduced now (default: crypto_spot) for future xStocks/futures expansion.
7. **Metadata persistence** — Context snapshot (regime, sourcePool, ranking breakdown) saved with every signal for auditability.
8. **Pattern sizing surfaced in Guardrails** — 15% display-only alongside 25% quant default.

---

## Problem Statement

DawnTrader has 17 canonical strategies: 9 quant, 3 pattern, 5 hybrid. **8 of 17 strategies (47%) are structurally dead** because the FX5 scanner applies quant-calibrated filters to ALL pairs, rejecting the very pairs that pattern and hybrid strategies need.

### Root Cause
FX5 metric filters (market-scanner.ts) enforce: LQ >= 35, VN <= 0.93, Volume >= $500K, DI_TRENDING >= 55. These are calibrated for momentum/mean-reversion quant strategies. Pattern strategies need different pairs: lower liquidity, higher volatility, different volume profiles.

### Secondary Problem: Ranking Lacks Return Magnitude
RTB queue ranks purely by FinalScore (ready_to_buy_service.ts line 1131). With $834 portfolio and ~4-5 trade slots, the system needs to maximize expected dollar returns per slot. Two signals with identical FinalScore but different return targets are treated identically.

### Tertiary Problem: No Global Market Awareness in Filtering
FX5 applies identical filter thresholds regardless of global market conditions. The existing global regime (from telemetry-aggregator.ts getDominantRegime()) is fed by thin VTS-only telemetry (~20-60 pairs, downstream, selection-biased). It needs to be sourced upstream from MCE for a broader, more representative sample.

---

## Solution Architecture

### Part A: Dual-Path Pattern Scanning

**Intent**: Open a second filter path so pattern/hybrid strategies can see pairs that quant filters reject. Purely additive — quant path unchanged.

#### A1. Pattern Filter Profile — `server/config/pattern-filter-profile.ts` (NEW, ~60 lines)

```typescript
export const PATTERN_POOL_THRESHOLDS = {
  MIN_VOLUME_USD: 250_000,    // vs $500K quant (patterns work at lower volumes)
  LQ_MIN: 20,                 // vs 35 quant (lower liquidity OK for patterns)
  VN_MAX: 0.98,               // vs 0.93 quant (patterns thrive in volatility)
  DI_TRENDING_MIN: 30,        // vs 55 quant (patterns don't need strong trends)
  RSI_MIN: 15,                // wider RSI band for reversal patterns
  RSI_MAX: 85,
};

export const PATTERN_POOL_GUARDRAILS = {
  FINAL_SCORE_FLOOR: 0.45,    // elevated vs 0.35 quant (compensates for lower-quality pairs)
  MAX_POSITION_PCT: 0.15,     // 15% max portfolio per trade (vs 25% quant)
  // NO concurrent cap — merit-based competition within normal risk limits
};

export const PATTERN_POOL_STRATEGIES: string[] = [
  'morning_star', 'inside_bar_reversal', 'support_bounce',       // PATTERN type
  'pivot_shift', 'reverse_impulse', 'defensive_hedge',            // HYBRID type
  'adaptive_flow', 'volatility_edge',
];
```

#### A2. FX5 Scanner Changes (~70 lines in `server/services/market-scanner.ts`)

After metric filter stage, collect rejected pairs and run them through pattern thresholds:
- quantPool = survivors passing existing metric filters (unchanged)
- patternPool = pairs FAILING quant filters BUT passing PATTERN_POOL_THRESHOLDS
- Pools are mutually exclusive by construction
- Pattern survivors tagged with `sourcePool: 'pattern'`, `filterTier: 'pattern'`

#### A3. Active Filter Pool Changes (~25 lines in `server/services/adaptive-ratio-manager.ts`)

- Add `sourcePool?: 'quant' | 'pattern'` to filtered pair interface
- Add `assetClass?: string` (default: 'crypto_spot')
- New method: `getPatternPool(mode)` returns only pattern-tagged pairs
- Existing `getActivePool()` returns quant pairs (backward compatible)

#### A4. Signal Orchestrator Changes (~100 lines in `server/services/signal-orchestrator.ts`)

Two processing loops:
1. Quant pool → all 17 strategies (existing, unchanged)
2. Pattern pool → PATTERN + HYBRID strategies only (8 strategies)

Pattern pool signals tagged with `sourcePool: 'pattern'` throughout.

#### A5. SQE Changes (~15 lines in `server/core/filters/signal_quality_evaluator.ts`)

- When `sourcePool === 'pattern'`: use FINAL_SCORE_FLOOR (0.45) instead of MIN_FINAL_SCORE (0.35)
- All other gates unchanged

#### A6. Paper Execution Engine Changes (~15 lines in `server/services/paper-execution-engine.ts`)

- Position sizing cap: when `sourcePool === 'pattern'`, cap at MAX_POSITION_PCT (15%)
- No concurrent pattern trade limit (merit-based)

#### A7. VTS Changes (~30 lines in `server/services/vts-runner.ts`)

- VTS processes pattern-pool pairs with PATTERN + HYBRID strategies only
- Tags `sourcePool: 'pattern'` + `filterTier: 'pattern'` for ML segmentation

#### A8. Frontend: Pattern Scanning Tab (~200 lines)

- New tab in Trading page mirroring FX5 tab structure
- Shows: total pairs scanned, pattern-path entrants, filter passes/fails by category
- Active pattern/hybrid pool counts
- Clearly separates quant vs pattern display
- Guardrails section shows pattern sizing (15% display-only) alongside quant sizing (25%)

---

### Part B: Merit-Based Ranking with rankingScore

**Intent**: When multiple signals compete for a trade slot, rank by expected value, not just quality. FinalScore stays as signal quality gate. rankingScore is the separate cross-family queue ordering metric.

#### B1. Ranking Formula

```
rankingScore = FinalScore * qualityWeight
             + netReturn * returnWeight
             - frictionPenalty * frictionWeight
             + contextBonus
```

Three weight profiles (QUANT / PATTERN / HYBRID) to account for different signal family characteristics.

#### B2. Net Return Computation

```typescript
const grossReturn = (targetPrice - entryPrice) / entryPrice;
const roundTripCost = computeTotalRoundTripCost(symbol); // from cost-model.ts
const netReturn = Math.max(0, grossReturn - roundTripCost);
const normalizedNetReturn = Math.min(1.0, netReturn / 0.05); // 5% net = 1.0 ceiling
```

#### B3. Context Bonus

Modifier based on regime agreement:
- Pair regime + global regime agree: small positive bonus
- Pair regime + global regime disagree: small negative penalty
- BTC regime confirms global: additional small bonus

#### B4. Ranking Weights Config — `server/config/ranking-weights.ts` (NEW, ~30 lines)

Signal-family-specific weights. Starting points (tunable):
- QUANT: heavier on FinalScore + netReturn
- PATTERN: heavier on regime fit + friction conditions
- HYBRID: balanced across all components

#### B5. RTB Changes (~40 lines in `server/core/rtb/ready_to_buy_service.ts`)

- `getTopSignal()`: enriches queued signals with regime/friction at query time, applies rankingScore formula, returns highest ranked
- `SQESignalInput` interface: add `rankingScore`, `sourcePool`, `assetClass`
- Persist ranking breakdown in metadata JSONB for auditability

#### B6. Safety Rule

FinalScore gap > 0.10 always wins — prevents mediocre signals from beating high-quality signals on return size alone.

---

### Part C: MCE-Derived Global Regime Overlay

**Intent**: Give FX5 and the orchestrator awareness of global market conditions to reduce pipeline noise. Use the strongest available regime source per operating mode.

#### C1. Mode-Aware Global Regime

- **Active trading mode**: MCE-derived global regime (new aggregation method on market-conditions-engine.ts). MCE sees ~100-300 pairs per cycle — upstream, less selection-biased.
- **Passive/VTS mode**: Existing VTS-derived global regime (getDominantRegime() from telemetry-aggregator.ts). Valid because VTS is the live population in that mode.

Consumer (market-indicators.ts) already checks operating mode — routes to appropriate source.

#### C2. BTC as Secondary Confirmer

- BTC's individual pair regime checked against the global dominant
- Agreement = confidence boost to contextBonus
- Disagreement = caution penalty (lower contextBonus, NOT a hard gate)
- Pair-level MCE regime remains the absolute authority for individual signals

#### C3. FX5 Threshold Adjustments Per Global Regime (~30 lines)

| Global Regime | Volume Floor Adj | VN Tolerance | DI Requirement |
|--------------|-----------------|--------------|----------------|
| IMPULSE_EXPANSION | 0.8x ($400K) | +0.05 (0.98) | -10 (45) |
| HIGH_VOLATILITY_UNSTABLE | 1.0x ($500K) | +0.03 (0.96) | -5 (50) |
| TREND_FRIENDLY_STABLE | 1.0x ($500K) | 0 (0.93) | 0 (55) |
| RANGE_BOUND_STABLE | 1.2x ($600K) | -0.03 (0.90) | +5 (60) |
| STRUCTURAL_TRANSITION | 1.0x ($500K) | 0 (0.93) | -5 (50) |

These adjust existing thresholds dynamically. Hint layer only — never overrides pair-level MCE regime.

#### C4. Orchestrator Skip Logic (~20 lines)

Soft optimization: skip clearly inappropriate strategies early based on global regime (e.g., skip breakout in RANGE_BOUND_STABLE). All pairs still go through SQE regardless.

---

## Metadata Persistence

Every signal entering RTB must carry a context snapshot:
- `sourcePool` (quant/pattern)
- `signalType` (QUANT/PATTERN/HYBRID)
- `strategyId`
- `assetClass` (crypto_spot)
- `pairRegime` (regime at signal creation time)
- `globalRegime` (global regime at signal creation time)
- `btcRegimeAgreement` (boolean — did BTC confirm global?)
- `rankingBreakdown` (quality contribution, return contribution, friction deduction, context bonus)

Stored in RTB metadata JSONB. Enables debugging: "why did this signal enter the queue? why did it beat that one?"

---

## Files Touched Summary

| File | Type | Est. Lines | Changes |
|------|------|-----------|---------|
| `server/config/pattern-filter-profile.ts` | NEW | ~60 | Pattern pool thresholds, guardrails, strategy list |
| `server/config/ranking-weights.ts` | NEW | ~30 | Signal-family-specific ranking weights |
| `server/services/market-scanner.ts` | MODIFIED | ~70 | Pattern pool output path, global regime threshold adjustments |
| `server/services/adaptive-ratio-manager.ts` | MODIFIED | ~25 | sourcePool + assetClass fields, getPatternPool() method |
| `server/services/signal-orchestrator.ts` | MODIFIED | ~100 | Pattern pool processing loop, return magnitude computation |
| `server/core/filters/signal_quality_evaluator.ts` | MODIFIED | ~15 | Pattern pool elevated threshold (0.45) |
| `server/core/rtb/ready_to_buy_service.ts` | MODIFIED | ~60 | rankingScore computation, enrichment at query time, metadata persistence |
| `server/services/paper-execution-engine.ts` | MODIFIED | ~15 | Pattern position sizing cap |
| `server/services/vts-runner.ts` | MODIFIED | ~30 | Pattern pool VTS path |
| `server/services/market-conditions-engine.ts` | MODIFIED | ~40 | MCE-level global regime aggregation method |
| `server/services/market-indicators.ts` | MODIFIED | ~15 | Mode-aware regime source routing |
| Frontend (Trading page) | MODIFIED | ~200 | Pattern Scanning tab + Guardrails pattern sizing display |

**Total**: 2 new files (~90 lines), 10 modified files (~570 lines), 1 frontend addition (~200 lines)

---

## Impact Analysis (from SYSTEM_IMPACT_MAP)

### CRITICAL Blast Radius Components Touched
- **FX5 Scanner (3.2)**: Adding pattern pool output. Downstream: Active Filter Pool, Signal Orchestrator, Cost Cache
- **Signal Orchestrator (4.1)**: Adding pattern pool processing loop. Downstream: SQE, RTB, VTS
- **FinalScore Kernel (1.1)**: NOT modified — FinalScore formula unchanged. But RTB ordering changes from FinalScore to rankingScore

### HIGH Blast Radius Components Touched
- **Active Filter Pool (3.3)**: Adding sourcePool field, new method
- **SQE (4.2)**: Adding conditional threshold for pattern pool
- **RTB Service (4.3)**: Changing ranking logic from FinalScore to rankingScore
- **Paper Execution Engine (6.1)**: Adding pattern position sizing
- **MCE (5.2.5)**: Adding global regime aggregation method
- **VTS Runner (7.1)**: Adding pattern pool processing

### Cross-Reference Checks Required
Per SYSTEM_IMPACT_MAP "If I Change X, Check Y":
- Signal Orchestrator change → check VTS Runner, SQE, Paper Execution Engine, Cost Model, Price Cache, OHLC Cache
- FX5 Scanner change → check Active Filter Pool, Signal Orchestrator, Cost Cache, Telemetry Aggregator
- MCE change → check Signal Orchestrator, VTS Runner, calculatePairRegime()

---

## Test Strategy

1. **Existing tests must pass unchanged** (~790 pass baseline) — quant path is not modified
2. **New unit tests**: pattern-filter-profile, ranking-weights, MCE global regime aggregation
3. **Integration tests**: FX5 dual output, orchestrator routing, SQE threshold branching, RTB rankingScore ordering, pattern position sizing
4. **Regression safety**: Quant pool path has ZERO logic changes — pattern pool is purely additive

---

## Verification Checklist (Post-Deploy)

- [ ] Pattern-pool pairs appear in active filter pool (tagged `sourcePool: 'pattern'`)
- [ ] Signal orchestrator generates pattern-pool signals (check logs)
- [ ] SQE applies 0.45 threshold to pattern-pool signals
- [ ] RTB queue ranks by rankingScore (not just FinalScore)
- [ ] rankingScore breakdown persisted in RTB metadata
- [ ] Pattern trades have 15% max position sizing
- [ ] Pattern trades compete on merit (no artificial concurrent cap)
- [ ] sourcePool + signalType + assetClass persist through full pipeline
- [ ] MCE-derived global regime populates when active trading is on
- [ ] VTS-derived global regime populates when passive mode is on
- [ ] Global regime adjusts FX5 thresholds dynamically
- [ ] BTC regime agreement/disagreement reflected in contextBonus
- [ ] Frontend Pattern Scanning tab displays correctly
- [ ] Guardrails shows pattern sizing (15%) alongside quant (25%)
- [ ] Existing test suite passes (790+ pass)
- [ ] No increase in Kraken API calls

---

## What This Does NOT Change

- FinalScore computation formula (score-calculator.ts unchanged)
- MCE pair-level regime classification logic
- Strategy detect function internals
- Exchange defaults (fee/slippage constants)
- Existing quant signal pipeline logic (purely additive)
- Trade lifecycle (entry, management, exit logic)
- VTS core evaluation loop (adds pattern data, doesn't modify quant data)

---

## Dependencies

- No new npm packages
- No new Kraken API calls (all data already cached)
- No database schema changes (sourcePool/assetClass/rankingBreakdown stored in existing metadata JSONB)
- No new environment variables

---

## Kyle's Stated Intent (from approval message)

- Maximize trading opportunities across market conditions
- Select the best opportunities from the larger opportunity set
- Have the overwhelming majority of opened trades be profitable, with a smaller minority of losers
- Grow portfolio value as much as possible, as fast as possible, within defined risk limits
