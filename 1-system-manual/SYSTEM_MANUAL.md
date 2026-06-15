# DawnTrader System Manual — Unified Reference

> **Author**: Claude Code (System Cartographer)
> **Consolidated**: 2026-02-17
> **Last Updated**: 2026-06-08 (Phase-24 governance close — date reconciled during the currency audit. Architecture/math through B76/B77 is current; the only new first-class schema component since is the `signal_eval_provenance` table (B-NEW-53 decision-provenance capture) — documented in Chapter 11 §1.5 below, with full component detail in `SYSTEM_IMPACT_MAP.md` ~line 1576. B-NEW-52 (weekend-cron retirement) and B-NEW-53.1/53.2 (admitted-`features` capture fixes) are operational/telemetry-only and carry no System-Manual architecture/math change — they live in CHANGES_AND_FIXES + SIM.)
> **Source**: Systematic 11-phase repository audit
> **Companion Documents**: CHANGES_AND_FIXES.md, LEGACY_DEPRECATION_PLAN.md, POST_AUDIT_ROADMAP.md, ADJUSTMENT_FRAMEWORK.md (parameter governance), AUTHORITY_BASELINE.md (V1.0 snapshot)
> **Status**: Complete (all 11 phases consolidated)

---

## About This Document

This is the unified DawnTrader System Manual, consolidating all 11 phases of the systematic repository audit into a single reference document. It describes **what the active system IS** — its architecture, components, data flows, and configuration.

This document does NOT contain:
- **Bugs or risks** — see CHANGES_AND_FIXES.md (22 bugs, 85 architectural risks)
- **Removal plans** — see LEGACY_DEPRECATION_PLAN.md (10 removal waves, ~71 legacy tables, ~96 legacy files)
- **Implementation roadmap** — see POST_AUDIT_ROADMAP.md (Phases 12-22, from current state to live trading)

### Reading This Document: Current State vs Intended State

This manual documents both **what the system currently does** and **what it is designed to do**. These are not always the same — in several areas, canonical components have been built but are not yet wired into the active trading path. Where current behavior differs from intended architecture, the manual uses explicit labels:

- **⚠️ CRITICAL** blocks at the top of chapters flag where the active trading path diverges from the canonical architecture
- Components are labeled with their status: **ACTIVE**, **LEGACY**, **CANONICAL CANDIDATE**, **DEPRECATED**, **LOCKED**, etc.
- The phrase "defined but not wired" or "implemented but not actively selected" indicates a component that exists in code but is not in the live execution path

**When in doubt**: The active trading path uses the Market Context Engine (MCE), which computes DBS first, then calls `calculatePairRegime(momentum, adx, volatility, dbsScore)` for canonical 5-regime classification and looks up strategies via `CANONICAL_REGIME_STRATEGY_MAP` (17 strategies). The classifier uses DBS to gate regime assignments (B62 redesign). The legacy 6-regime / 9-quant-only map has been fully replaced (Batch 13 DSS rewire + Batch 14 MCE installation). See Chapter 2 for the full regime architecture breakdown.

### System Overview

DawnTrader is an algorithmic cryptocurrency trading platform for the Kraken exchange. It supports paper and live trading modes, operating as a single-tenant, single-user system with mode isolation at the database row level. The system implements a full trading pipeline: market scanning → signal generation → scoring → risk management → execution → monitoring.

The codebase is a TypeScript monorepo with a React frontend, Express API server, PostgreSQL database (Neon Serverless), and Drizzle ORM. It comprises approximately 160 database tables (of which ~71 are legacy), ~750 API endpoints (of which ~460 have no frontend consumer), and 60 test files.

### Audit Summary

| Metric | Value |
|--------|-------|
| Bugs Found | 22 (7 CRITICAL, 2 HIGH, 4 MEDIUM, 7 LOW, 2 Informational) |
| Architectural Risks | 85 |
| Legacy Database Tables | ~71 (~44% of ~160 total) |
| Legacy Files (Walter/Bob/Cortex) | ~96 |
| Server API Endpoints | ~750 |
| Frontend-Consumed Endpoints | ~291 |
| Unused Server Endpoints | ~460 |
| Test Files | 60 (~13,735 lines) |
| Frontend Pages | 25 (14 active routed, 7 dead/unrouted, 4 other) |
| Frontend Tab Sub-Pages | 91 |

---

## Table of Contents

### Part I: Core Trading Engine
- **Chapter 1**: Core Math & Scoring (Phase 1) — FinalScore kernel, Expectancy Gate, cost model, quality metrics
- **Chapter 2**: Strategy Deep Dives (Phase 2) — 17 canonical strategies, regime classification, DSS analysis
- **Chapter 3**: Market Scanning & Pair Management (Phase 3) — FX5 Scanner, watchlist, screener filters

### Part II: Risk & Execution
- **Chapter 4**: Risk Management, Guardrails & Portfolio (Phase 4) — Guardrails V2, pre-execution validation, kill switch
- **Chapter 5**: Trade Execution & Lifecycle (Phase 5) — Paper execution engine, order lifecycle, RTB signals

### Part III: Intelligence & Learning
- **Chapter 6**: ML Pipeline, Learning & Calibration (Phase 6) — VTS, ML calibration, drift detection, strategy drive

### Part IV: Infrastructure & Platform
- **Chapter 7**: System Lifecycle & Infrastructure (Phase 7) — Boot sequence, shutdown, health monitoring
- **Chapter 8**: API & Communication Layer (Phase 8) — REST API, WebSocket, middleware, authentication
- **Chapter 9**: Frontend & UI Layer (Phase 9) — React pages, components, tab catalog, Walter integration

### Part V: Quality & Data
- **Chapter 10**: Testing & Quality Assurance (Phase 10) — Test frameworks, coverage, runtime validation
- **Chapter 11**: Database Schema & Migrations (Phase 11) — Schema inventory, migration infrastructure, data access

---

## System Authority Hierarchy

Quick reference: which components are authoritative, which are contaminated, and which are the development path.

### Authoritative Components (Trust These)
| Component | File(s) | Authority |
|-----------|---------|-----------|
| **Net Expectancy Kernel** | `signal-orchestrator.ts`, `paper-execution-engine.ts` | Sole EV authority. Mathematically correct. |
| **cost-model.ts** | `server/core/cost-model.ts` | Cost-of-trade authority. Real spread + slippage + fees. |
| **calculatePairRegime()** | `server/core/metrics/market-regime.ts` | Canonical pair-level regime classification. 5 regimes. DBS-integrated (B62): accepts `dbsScore` parameter, gates RBS/TFS/IE. |
| **Market Context Engine (MCE)** | `server/services/market-context-engine.ts`, `server/types/market-context.ts` | Centralized VWAP/SMA/ATR/regime computation. Signal orchestrator and VTS both call `MCE.computeContext()`. Singleton, 60s cache TTL. |
| **Canonical Regime Strategy Map** | `server/config/canonical-regime-strategy-map.ts` | SSOT: 5 regimes, 17 strategies. **Wired via MCE** (Batch 14). |
| **Guardrails V2** | `guardrails-v2.ts` | Risk gate authority. 10 named guardrails + kill switch. |
| **Pre-Execution Validator** | `pre-execution-validator.ts` | Final gate before trade execution. Two-gate system (post goal-alignment removal). |
| **FinalScore Kernel** | `signal-orchestrator.ts` | Score authority. Adaptive weighting with volatility adjustment. |
| **Adjustment Framework** | `ADJUSTMENT_FRAMEWORK.md`, `server/config/adjustment-registry.ts` | Decision constitution for all parameter adjustments. Three-tier governance (Evidence-Adjustable / Supervised / Constitutional). Per-parameter bounds, evidence-gating (Live > Paper > VTS). Log-only validation on filter writes. (Batch 58) |
| **Authority Baseline V1.0** | `AUTHORITY_BASELINE.md`, `authority-baseline-v1.json`, `server/config/authority-baseline.ts` | Known-good parameter snapshot. 24 screener_filters rows, 150+ strategy constants, shared config. Rollback target if performance degrades. (Batch 58) |
| **screener_filters DB** | Supabase PostgreSQL | Sole authority for filter thresholds (Batch 19G onward). 24 rows (12 paths x 2 modes). DB-as-authority principle — no hardcoded fallbacks. |

### Contaminated / Legacy (Do Not Build On)
| Component | Status | Problem |
|-----------|--------|---------|
| **quality_index.ts (NGC)** | ~~LEGACY~~ **REPLACED** | ~~Confidence carrier throughout pipeline. Must be replaced, not extended.~~ NGC replaced with deterministic confidence formula (Directive 12.3.3, Batch 13). Function signatures preserved for backward compatibility. Full file removal deferred to MCE. |
| **SYSTEM_GUARDS friction** | ~~LEGACY~~ **RESOLVED** | ~~Flat 0.5% fee — bypasses real cost model.~~ Directive 12.1.2: All runtime friction now uses `computeTotalRoundTripCost()`. ~~Deprecated functions remain for dead code purge (Wave 4).~~ Deprecated functions **REMOVED** (Directive 12.2.5, Batch 11). |
| ~~**DSS volNoise/trendSlope classifier**~~ | ~~LEGACY~~ **DELETED** | ~~6-regime / 9-quant-only. Must be replaced with canonical map.~~ DSS rewired to canonical map (Batch 13), then **fully deleted** (Batch 17, HF9 `f9fa56c6`). Superseded by MCE regime filtering + StrategyEngine detect functions. Signal orchestrator NetEV > 0 filter is now inline. |
| ~~MCP/ARE ecosystem~~ | ~~LEGACY~~ **REMOVED** | Entire L12-L20 cluster deleted (Batch 14, Phase 13). 17 services + 9 routes + 2 utilities. MCE installed as replacement. |
| ~~NLAI system~~ | ~~LEGACY~~ **REMOVED** | Directive 12.2.7: All 5 NLAI files deleted, 6 consumer files cleaned. Commit `5d5c2051`. |
| **Goal Alignment system** | LEGACY (PARTIALLY REMOVED) | Phase 9.0 alignment verification system **REMOVED** (Directive 12.2.6, Batch 11). Phase 4 Goal Alignment in pre-execution-validator.ts and trading-engine.ts **REMAINS** (RISK-028, BUG-012). |
| **Walter/Bob/Cortex** | LEGACY (Kyle confirmed) | ~~~96~~ ~70 files remaining (Walter fully removed in Batches 5+6). Bob+Cortex remain. Remove in Wave 3 Sub-Batch C. |
| **RiskManager class** | DEPRECATED | Replaced by `checkGuardrailRisk()`. ~~12 import locations still referencing it.~~ Comment/stub cleanup completed (Directive 12.1.5). |
| ~~**VTS signal generation**~~ | ~~CONTAMINATED~~ **RESOLVED** | ~~Uses `simulateHybridScore()` / `simulatePredictiveConfidence()` — generic random noise, not strategy-specific.~~ BUG-001 RESOLVED (Batch 15-17). VTS now uses real StrategyEngine detect functions, real scoring, real governance. DSS deleted. IMF filters relaxed for broader ML training data (HF9). |

### Development Authority
| Component | Status | Notes |
|-----------|--------|-------|
| **PaperExecutionEngine** | PRIMARY, AUTHORITATIVE | ~2,308 lines. The active development and execution authority. |
| **TradingEngine (live)** | SECONDARY, DORMANT | ~766 lines. Contains placeholder code, simulated fills (Math.random), goal alignment. Defer rebuild until paper mode is fully stable. Strategic fork pending: refactor to mirror paper core, or delete and rebuild from paper core. |
| **VTS Runner** | ACTIVE, AUTHORITATIVE | Real price data, real regime, real governance, real scoring (BUG-001 resolved B15-17). Dual-path (quant + pattern), 60s cycles, pool-split null tracking. Pattern-strategy canonical routing (B57). |

---

## Legacy Clusters (Removal Groupings)

Legacy systems are not isolated files — they form interconnected clusters that must be removed together. Full removal details are in LEGACY_DEPRECATION_PLAN.md.

### Cluster 1: NGC / CWQI / Rolling Normalization — **NGC REPLACED** (Directive 12.3.3)
- **Core files**: `quality_index.ts`, rolling normalization infrastructure
- **Contamination**: ~~NGC flows as confidence carrier → DI → kernel.~~ ~~DI path~~ **RESOLVED** by Directive 12.1.1 (BUG-004). ~~NGC still contaminates confidence/FinalScore pipeline.~~ **NGC REPLACED** with deterministic confidence formula (Directive 12.3.3, Batch 13, commit `4d8ef060`). Formula: `(stratConf * 0.60) + ((1-vol) * 0.20) + ((1-risk) * 0.20)`. Rolling normalization infrastructure preserved but bypassed.
- **Removal**: ~~Phase 12.3.3~~ **COMPLETE** — NGC computation replaced. Full quality_index.ts file removal deferred to MCE (when PredictiveConfidence replaces the entire file).
- **Risk level**: ~~HIGH~~ **LOW** — deterministic formula in place, no legacy contamination path

### Cluster 2: ~~MCP/ARE + Autonomy Layer~~ — **REMOVED** (Phase 13, Batch 14)
- **Core files**: ~~`market-profiler.ts`, `adaptive-regime.ts`, autonomy-scheduler L-series tasks, action-executor, MOF/MACO/ECS/GASP coordinators~~ ALL DELETED (17 services + 9 routes + 1 M-series + 2 utilities = 29 files, ~8,200 lines)
- **Resolution**: The entire L12-L20 cluster was confirmed as a closed supervisory loop with zero active path connection. All files deleted in Batch 14 (`8f26369a`). MCE installed as centralized regime/indicator service. Autonomy-scheduler stripped of all L-series imports and scheduled tasks; now only initializes MCE.
- **Risk level**: **ZERO** — completely removed

### Cluster 3: ~~Walter~~ / Bob / Cortex / ~~NLAI~~ / Goal Alignment
- **Core files**: ~~walter-*.ts~~ (ALL REMOVED — Directive 12.2.3 Sub-Batches A+B), bob-*.ts, bobs/*.ts, cortex/*.ts, ~~5 NLAI files~~ (REMOVED — Directive 12.2.7), goal alignment in pre-execution-validator
- **Contamination**: Cortex is ACTIVE at runtime (in-memory cache, 15-min analytics cycle). ~~Walter lazy-loaded at startup.~~ Walter fully removed. ~~NLAI event handlers active.~~ NLAI removed. Bob modules still active. corpus-domain-service.ts stubbed (awaiting Cortex cleanup).
- **Removal**: ~~Wave 3~~ Walter DONE. Wave 3 Bob+Cortex remaining. Waves 3.1 (DONE — absorbed into Batch 6), 4.5 pending. Phase 12.2 — pre-MCE cleanup.
- **Risk level**: MODERATE — Bob+Cortex remain, mostly disconnected from trading pipeline

### ~~Cluster 4~~: DSS Legacy Regime Engine — **DELETED** (Batch 17, HF9)
- **Core files**: ~~`dynamic-strategy-selector.ts` (~270 lines)~~ **FILE DELETED** (Batch 17, `f9fa56c6`). `dss.test.ts` also deleted.
- **Contamination**: **FULLY RESOLVED** — DSS rewired to canonical map (Batch 13), then deleted entirely (Batch 17). MCE provides regime classification. StrategyEngine detect functions provide strategy selection. Signal orchestrator uses inline NetEV > 0 filter. All DSS imports removed from signal-orchestrator, telemetry-aggregator, market-events. Stale regime names fixed.
- **Removal**: **COMPLETE** — DSS file deleted, all references purged (Batch 17, `f9fa56c6`)
- **Risk level**: **ZERO** — completely removed

### Cluster 5: ~~L-Series Systems~~ — **SERVICE FILES REMOVED** (Phase 13, Batch 14)
- **Core files**: ~~~13 L-Series modules + ~52 route endpoints~~ ALL service and route files DELETED (Batch 14). ~57 database tables + ~40 enums remain in PostgreSQL (no schema migration to remove them yet).
- **Resolution**: All L-series service files (17) and route files (9) deleted in Batch 14. The service layer is clean. Database tables and enums remain as orphaned artifacts — harmless but candidates for a future DB cleanup migration.
- **Risk level**: **ZERO** (service layer) / **LOW** (DB artifacts — inert, no code references them)

### Cluster 6: Walter-Era Learning Services
- **Core files**: continuous-learning.ts, learning-cycle-service.ts, learning-coordinator.ts, learning-bridge.ts, learning-gate-validator.ts, learning-bob.ts
- **Contamination**: Some files are lazy-loaded. learning.ts route file is mounted but orphaned.
- **Removal**: Wave 8 (Phase 12.2.8 — pre-MCE cleanup)
- **Risk level**: MODERATE — verify no active initialization side effects

---

*Individual chapter contents follow. Each chapter preserves the full detail of its corresponding audit phase.*

---


---

# Part I: Core Trading Engine


---

# Chapter 1: Core Math & Scoring

## Overview

This section documents the mathematical foundation of DawnTrader — every formula, threshold, scoring mechanism, and cost model that underpins trade decisions. This is the "physics layer" of the system: the raw math that determines whether a signal is good enough to trade.

**Key principle**: No trade — real or simulated — proceeds unless the math justifies the risk.

---

## 1. Score Weights Configuration (Single Source of Truth)

**File**: `server/config/score-weights.config.ts`
**Directive**: 10.9A
**Status**: ACTIVE — LOCKED (Object.freeze, DO NOT MODIFY without review)

The FinalScore formula is the system's primary signal ranking mechanism:

```
FinalScore = (HybridScore × 0.4) + (Confidence × 0.3) + (RegimeWeight × 0.2) - (DecayPenalty × 0.1)
```

| Weight | Name | Value | Component |
|--------|------|-------|-----------|
| W1 | HYBRID | 0.40 | HybridScore — QUANT + PATTERN ensemble |
| W2 | CONFIDENCE | 0.30 | Predictive confidence |
| W3 | REGIME | 0.20 | Regime alignment |
| W4 | DECAY | 0.10 | Signal age penalty (subtracted) |

- **Version**: v1.0.1 (telemetry auditing tag)
- **Sum of positive weights**: 0.9
- **Max theoretical FinalScore**: 0.9 (all components = 1.0, DecayPenalty = 0)
- **Minimum viable FinalScore**: 0.35 (SQE gate)

**Consumers**: SQE, RTB Refresh, VTS scoring, adaptive-goals-weight.ts, all signal ranking.

---

## 2. Adaptive Goals Weight System

**File**: `server/core/metrics/adaptive-goals-weight.ts`
**Directive**: 11.4H
**Status**: ACTIVE — LOCKED

Dynamically adjusts FinalScore weights during high-volatility conditions to reduce ML/AI reliance when markets are less predictable.

### How It Works

```
adjustedMlWeight = baseConfidenceWeight × (1 - volatilityFactor)
cappedMlWeight   = min(adjustedMlWeight, 0.40)   // AI_WEIGHT_CAP = 40% max ML contribution

mlReduction   = baseWeight - cappedMlWeight
hybridBoost   = mlReduction × 0.6   // 60% of reduction goes to hybrid weight
regimeBoost   = mlReduction × 0.4   // 40% of reduction goes to regime weight
```

After adjustment, positive weights are renormalized to sum to 1.0 (before applying the subtracted decay penalty).

### Adaptive FinalScore

```
AdaptiveFinalScore = (hybridScore × adjustedHybridWeight)
                   + (predictiveConfidence × adjustedConfidenceWeight)
                   + (regimeWeight × adjustedRegimeWeight)
                   - (decayPenalty × decayWeight)
                   clamped to [0, 1]
```

### Effect

- **Normal volatility**: Weights stay close to base (0.4/0.3/0.2/0.1)
- **High volatility**: ML confidence weight decreases, hybrid + regime weights increase
- **Purpose**: In unpredictable markets, rely more on direct signal quality (hybrid) and regime alignment, less on ML predictions

---

## 3. Net Expectancy Kernel (Sole EV Authority)

**File**: `server/core/calculations/net-expectancy-kernel.ts`
**Directive**: 11.8B-A
**Status**: ACTIVE — PURE MATH (no side effects, no I/O, no logging, synchronous)

This is the core EV calculation. Every trade decision in the system ultimately passes through this kernel.

### The Formula

```
Pwin = 0.40 + (DI / 200)              // clamped to [0.40, 0.60]
Ploss = 1 - Pwin

DistTarget = |targetPrice - entryPrice|
DistStop   = |entryPrice - stopPrice|

RawEV  = (Pwin × DistTarget) - (Ploss × DistStop)
NetEV  = RawEV - TotalFriction

NetRewardToRisk = NetEV / DistStop     // (if DistStop > 0)
```

### Key Parameters

| Parameter | Source | Default |
|-----------|--------|---------|
| DI (Directional Integrity) | `analysis-utils.ts` | 50 |
| TotalFriction | `cost-model.computeTotalRoundTripCost()` | Per-trade calculation |
| Pwin bounds | Hardcoded constants | [0.40, 0.60] |
| DI_PWIN_FACTOR | Hardcoded constant | 200 |

### Invariant

**No trade proceeds if NetEV ≤ 0.** This is enforced at every entry point:
- Signal Orchestrator (active trading)
- VTS Runner (simulation)
- Trade Expectancy Gate (execution)

---

## 4. Trade Expectancy Gate (Decision Layer)

**File**: `server/core/calculations/expectancy.ts`
**Directive**: 11.5, 11.7A-C, 11.8B
**Status**: ACTIVE

Wraps the Net Expectancy Kernel with decision logic, logging, correlation penalties, and quality scoring.

### Quality Score Formula

```
Score = normalize(NetEV / Risk) × (DI/100) × (1 - VolNoise) × (1 - ρ̄) × 100
        clamped to [0, 100]

Where:
  Risk = |entryPrice - stopPrice|
  DI   = Directional Integrity (0-100)
  VolNoise = Volatility Noise (0-1)
  ρ̄    = Mean absolute correlation with all other tracked symbols (from CovarianceEngine)
```

### Regime-Aware ROI Thresholds

| Regime | Min ROI | Rationale |
|--------|---------|-----------|
| BULL_STABLE | 1.25% | Low risk = lower return bar |
| LOW_VOL_CHOP | 1.75% | Moderate |
| TRANSITION | 2.00% | Uncertain |
| BEAR_VOLATILE | 2.50% | Higher risk |
| HIGH_VOL_IMPULSE | 3.00% | Highest risk = highest bar |

### Dynamic ROI Scaling

```
dynamicROI = baseROI × (1 - (predictiveConfidence - 0.5) × ROI_FLEX_MULTIPLIER)
             clamped to [ROI_MIN, ROI_MAX]

// Higher confidence = lower threshold (more permissive)
// Bounded between 1% and 4%
```

### Friction-Aware Profitability Gate

```
frictionFloor = (fee × 2) + (slippage × FRICTION_SAFETY_BUFFER)
requiredROI   = max(dynamicROI, frictionFloor)

Signal passes if: expectedROI ≥ requiredROI
```

This ensures no trade proceeds where costs eat the expected return.

---

## 5. Cost Model (Single Source of Truth)

> **★ B-4.5 SUPERSESSION (2026-06-11) — FEES ARE DB-GOVERNED, TIER 1.** Every static fee figure in this section (0.26% taker / 0.16% maker / `DEFAULT_TAKER_FEE` / `DEFAULT_COST_BUNDLE` / 0.72% round-trip) is SUPERSEDED. Fee rates live in `module_constants` module **`fee_model`** (per `asset_class`: `spot_taker_fee` 0.008 / `spot_maker_fee` 0.004 decimal — Kraken July-2026 cross-platform **Tier 1**, the account's verified standing), warmed at boot (`b72-warmup` strict assertion: both constants × both spot classes + (0,0.05] sanity rails — server refuses to start otherwise) and merged at the SINGLE site `cost-model.getFrictionForAssetClass` (new object per call; the static friction modules carry **NaN fee tombstones**). The model prices **TAKER BOTH LEGS** (engine reality; maker stored for the Phase-19 direction-B evaluation — `STRATEGIC_DIRECTIONS_AND_AI_EDGE.md` §1). Round-trip friction: **1.80% crypto_spot / 1.82% xstock_spot**. `MAX_COST_BOUND` 0.01→0.02 (per-component sanity ceiling; headroom over the 0.008 taker). The `system_context.maker_fee_pct/taker_fee_pct` columns are a pure OPERATOR OVERRIDE surface (NULL = use fee_model; explicit value incl. 0 wins — `resolveValidatorFeeRates`); their Tier-6 schema defaults were removed (third-copy residue). Details: `B_4_5_FEE_MODEL_CHANGE_LIST.md` + completion report.


**File**: `server/core/math/cost-model.ts`
**Directive**: 11.3A/B
**Status**: ACTIVE — LOCKED

### Round-Trip Cost

```
TotalRoundTripCost = (fee × 2) + (slippage × 2) + spread
```

### Default Values (from exchange-defaults.ts)

| Component | Default | Notes |
|-----------|---------|-------|
| Taker Fee | 0.26% | Per side (Directive 11.3B raised from 0.25%) |
| Slippage | 0.15% | Estimated execution slippage |
| Spread | 0.10% | Bid-ask spread |

### Net Execution Geometry

The cost model computes adjusted prices accounting for friction:

```
executionEntry  = baseEntry  × (1 + slippage + spread/2)
executionStop   = baseStop   × (1 - slippage)
executionTarget = baseTarget × (1 - slippage)

grossPnlPct     = (executionTarget - executionEntry) / executionEntry
netExpectedEdge = grossPnlPct - totalRoundTripCost

riskPct   = (executionEntry - executionStop) / executionEntry
rewardPct = (executionTarget - executionEntry) / executionEntry
netRewardToRisk = (rewardPct - totalRoundTripCost) / riskPct
```

### Break-Even and Target Floor

```
breakeven   = entryPrice  × (1 + totalRoundTripCost)
targetFloor = targetPrice × (1 - totalRoundTripCost / 2)
```

**Consumers**: Signal Orchestrator, RTB Refresh, Dynamic Sizing Engine, SQE, TEC, VTS.

### Known Bug

`getCostMetricsCache()` calls `getCacheStats()` but then returns an empty Map — appears to be an incomplete implementation. Does not affect runtime cost calculations, but breaks any cache introspection tooling.

---

## 6. Cost Metrics Service

**File**: `server/core/metrics/cost-metrics.ts`
**Directive**: 11.3A, 11.4A, 11.4B, 11.4H
**Status**: ACTIVE

### Cost Factor

```
costFactor = (spread + slippage) / avgReturn

Where:
  spread   = live from Kraken order book (or DEFAULT_SPREAD = 0.10%)
  slippage = DEFAULT_SLIPPAGE = 0.05%
  avgReturn = DEFAULT_AVG_RETURN = 0.50%
```

| Classification | Cost Factor Range |
|---------------|-------------------|
| cheap | < 0.0003 |
| moderate | 0.0003 - 0.001 |
| expensive | > 0.001 |

### Market Friction Score (0-100)

```
base = (spread + slippage + fee) × 10000
frictionScore = min(base / 3, 100)
```

| Score Range | Status | Color |
|-------------|--------|-------|
| 0-30 | High Liquidity / Low Cost | Green |
| 30-70 | Moderate Liquidity | Orange |
| 70-100 | Low Liquidity / High Cost | Red |

### Adaptive Friction Bands

Replaces static thresholds with percentile-based adaptive tiers:

```
lowThreshold  = 30th percentile of all pair spreads
highThreshold = 70th percentile of all pair spreads

Target distribution: GREEN ≈ 30% | ORANGE ≈ 40% | RED ≈ 30%
```

- Requires minimum 10 pairs for adaptive calculation
- Falls back to static thresholds (0.1%/0.3%) if < 10 pairs
- Cache TTL: 60 seconds

### Spread Sourcing

Live spread fetched from Kraken order book:
```
bestAsk, bestBid = orderBook top level
midPrice = (bestAsk + bestBid) / 2
spread = (bestAsk - bestBid) / midPrice
```
Cached for 30 seconds. Falls back to DEFAULT_SPREAD (0.1%) on failure.

---

## 7. Slippage & Fee Model (Paper Trading Realism)

> **★ B-4.5 SUPERSESSION (2026-06-11) — FEES ARE DB-GOVERNED, TIER 1.** Every static fee figure in this section (0.26% taker / 0.16% maker / `DEFAULT_TAKER_FEE` / `DEFAULT_COST_BUNDLE` / 0.72% round-trip) is SUPERSEDED. Fee rates live in `module_constants` module **`fee_model`** (per `asset_class`: `spot_taker_fee` 0.008 / `spot_maker_fee` 0.004 decimal — Kraken July-2026 cross-platform **Tier 1**, the account's verified standing), warmed at boot (`b72-warmup` strict assertion: both constants × both spot classes + (0,0.05] sanity rails — server refuses to start otherwise) and merged at the SINGLE site `cost-model.getFrictionForAssetClass` (new object per call; the static friction modules carry **NaN fee tombstones**). The model prices **TAKER BOTH LEGS** (engine reality; maker stored for the Phase-19 direction-B evaluation — `STRATEGIC_DIRECTIONS_AND_AI_EDGE.md` §1). Round-trip friction: **1.80% crypto_spot / 1.82% xstock_spot**. `MAX_COST_BOUND` 0.01→0.02 (per-component sanity ceiling; headroom over the 0.008 taker). The `system_context.maker_fee_pct/taker_fee_pct` columns are a pure OPERATOR OVERRIDE surface (NULL = use fee_model; explicit value incl. 0 wins — `resolveValidatorFeeRates`); their Tier-6 schema defaults were removed (third-copy residue). Details: `B_4_5_FEE_MODEL_CHANGE_LIST.md` + completion report.


**File**: `server/services/slippage-fee-model.ts`
**Status**: ACTIVE

Models realistic trade execution for paper trading and performance attribution.

### Price Impact (Order Book Walk)

```
For each level in order book:
  Fill quantity at level price until total quantity met
  avgFillPrice = totalCost / filledQuantity
  priceImpact = |avgFillPrice - intendedPrice| / intendedPrice
```

### Conservative Impact (No Order Book Available)

| Order Size | Impact |
|-----------|--------|
| < $1K | 1 bp (0.01%) |
| < $10K | 2 bps (0.02%) |
| < $50K | 5 bps (0.05%) |
| ≥ $50K | 10 bps (0.10%) |

### Micro-Move Simulation (Stochastic)

```
z = sqrt(-2 × ln(u1)) × cos(2π × u2)     // Box-Muller normal
microMove = z × recentVolatility
            capped at ±20 bps (±0.002)
```

**Note**: This introduces non-determinism. Paper trading results cannot be exactly reproduced.

### Total Execution Model

```
totalSlippage = priceImpact + microMoveComponent
modeledFillPrice = intendedPrice × (1 + totalSlippage)   // buy
modeledFillPrice = intendedPrice × (1 - totalSlippage)   // sell
```

### Fee Model

```
totalFees = grossAmount × feeRate
netAmount = grossAmount - totalFees
```

#### Fee/Slippage Constants (Batch 18J — Unified to exchange-defaults.ts)

All fee and slippage constants across the codebase now import from the canonical source (`server/config/exchange-defaults.ts`, Directive 11.3B):

| Constant | Value | Source |
|----------|-------|--------|
| Taker Fee | 0.26% (0.0026) | `DEFAULT_TAKER_FEE` |
| Maker Fee | 0.16% (0.0016) | `DEFAULT_MAKER_FEE` |
| Slippage | 0.05% (0.0005) | `DEFAULT_SLIPPAGE` |
| Spread | 0.10% (0.0010) | `DEFAULT_SPREAD` |

Files migrated in Batch 18J: `paper-execution-engine.ts`, `routes.ts` (2 locations), `adaptive-thresholds.ts`, `cost-metrics.ts`. These previously had hardcoded old values (FEE=0.10%, SLIPPAGE=0.15%) that predated the exchange-defaults.ts unification.

---

## 8. IMF (Integrated Market Filters) Metrics

**File**: `server/core/metrics/imf-metrics.ts`
**Directive**: 11.7H
**Status**: ACTIVE

Three metrics computed from OHLC data to filter pairs before signal generation.

### Log-Liquidity (LQ)

```
avgVolumeUSD = Σ(typicalPrice × volume) / candleCount
    where typicalPrice = (high + low + close) / 3
LQ = log10(avgVolumeUSD + 1) × 10
     clamped to [0, 100]
```

Minimum 5 candles required. Returns 0 if insufficient data.

### VolNoise (Volatility Noise)

Delegates to canonical function in `analysis-utils.ts`:
```
diffs = [|close_i - close_{i-1}|]
VolNoise = stddev(diffs) / mean(diffs)
```
Returns 0.5 if insufficient data (< 3 candles).

### Correlation

Pearson correlation between pair returns and benchmark returns:
```
pairReturns_i  = (close_i - close_{i-1}) / close_{i-1}
benchReturns_i = (benchClose_i - benchClose_{i-1}) / benchClose_{i-1}

correlation = |Σ((p_i - meanP)(b_i - meanB)) / sqrt(Σ(p_i - meanP)² × Σ(b_i - meanB)²)|
```
Returns abs(correlation). Returns 0.5 if < 5 data points or no benchmark.

### Filter Gate

```
passesMetricFilter = (LQ ≥ LQ_MIN) AND (VolNoise ≤ VN_MAX) AND (Correlation ≤ CORR_MAX)
```

Thresholds imported from `SYSTEM_GUARDS.IMF_THRESHOLDS`. Batch 18J recalibrated all values for crypto via 4-LLM consensus:

| Tier | LQ | VN | rho | Source |
|------|----|----|-----|--------|
| Active Trading | ≥ 35 | ≤ 0.93 | ≤ 0.92 | `SYSTEM_GUARDS` |
| Passive Learning | ≥ 35 | ≤ 0.96 | ≤ 0.95 | `IMF_THRESHOLDS` |
| VTS Learning | ≥ 25 | ≤ 0.98 | ≤ 0.95 | `VTS_IMF_THRESHOLDS` |

Additional recalibrated constants (Batch 18J): DI_TRENDING 55 (was 65), DI_CHOPPY 35 (was 30), MIN_VOLUME_THRESHOLD_USD $500K (was $2M), BASE_FEE_SLIPPAGE 0.006 (was 0.005), CORRELATION_THRESHOLD 0.92 (was 0.75), MIN_STOP_DISTANCE_BPS 30 (was 20).

### OHLC Cache

**File**: `server/services/ohlc-cache.ts` (Batch 18 — NEW)

Centralized OHLC data cache with 5-minute TTL. Wraps `KrakenService.getOHLCData()` with an in-memory cache keyed by `symbol:interval`. Both signal-orchestrator and vts-runner route OHLC fetches through `ohlcCache.getOHLCData()`. Bypasses cache for paginated/historical fetches (when `since` or `paginationEnabled` is set). Periodic cleanup every 10 minutes removes entries older than 2x TTL. Reduces redundant Kraken OHLC API calls from ~12x per symbol per hour to ~12 (one fetch per 5-minute window). Net API budget reduction: ~18,200 calls/hr to ~7,520 calls/hr (58% reduction) despite 3x pair increase (100→300).

---

## 9. Pre-Signal Math (analysis-utils.ts)

**File**: `server/utils/analysis-utils.ts`
**Directives**: 9.x, 10.x series
**Status**: ACTIVE — Core mathematical foundation

These metrics are computed BEFORE signal generation, AFTER FX5 universe selection.

### Log-Liquidity (LQ, 0-100)

```
LQ = 10 × (log(Volume × Close) - log(Spread / Close) - 10)
     clamped to [0, 100]
```

### Directional Integrity (DI, 0-100)

Measures how "direct" a price path is vs. total distance traveled:
```
netDistance  = |prices[last] - prices[first]|
totalPath   = Σ|prices[i] - prices[i-1]|
DI = (netDistance / totalPath) × 100
```
- DI = 100: Perfect straight-line movement
- DI = 0: Price went nowhere despite large movements (choppy)

### Volatility Noise (VolNoise, 0-1)

Coefficient of variation of absolute price changes:
```
diffs = [|price_i - price_{i-1}|]
VolNoise = stddev(diffs) / mean(diffs)
```
- VolNoise > 0.6 triggers EXTREME_NOISE pre-filter veto
- Returns 0.5 if < 3 data points

### Sigma (Standard Deviation of Returns)

```
returns_i = price_i - price_{i-1}
sigma = sqrt(Σ(r_i - meanR)² / N)      // population variance
```
Default window: 20 periods. Returns 0 if < 3 data points.

### Efficiency Ratio (ER, 0-1)

```
ER = |Price_last - Price_first| / Σ|ΔPrice_i|
```
- ER = 1.0: Perfect trend (all movement in one direction)
- ER = 0.0: All movement cancels out (pure noise)
- Used by Adaptive Kalman Filter for tuning

### Core Metric Filters

```
passesCoreMetricFilters = (LQ ≥ LQ_MIN) AND (VolNoise ≤ VN_MAX)
```
Thresholds from `SYSTEM_GUARDS`.

### Dynamic Stop Distance

```
K' = K_base × (1 + α×(1 - DI/100) + β×VolNoise)
     clamped to [0.5, 3.0]

Defaults: K_base=1.0, α=0.5, β=0.8

trailingStopPrice = currentPrice - (ATR × K')
```
- Higher DI = tighter stops (trend is consistent, don't give back gains)
- Higher VolNoise = wider stops (market is noisy, avoid whipsaws)

### Break-Even and Target Lock

```
breakEvenTriggered = (currentPrice - entryPrice) ≥ ATR
targetLockTriggered = currentPrice ≥ targetPrice
```

### Trade Friction — Canonical Model (RISK-009 RESOLVED)

**Directive 12.1.2** (Batch 2, commit `8393a1ef`) unified all runtime friction under the canonical cost model:

```
TotalRoundTripCost = (fee × 2) + (slippage × 2) + spread
```

This is computed by `computeTotalRoundTripCost()` in `server/core/math/cost-model.ts`. Per-pair cost metrics (fee, slippage, spread) are sourced from `getCachedCostMetrics(symbol, assetClass)`. **B-4.5 (2026-06-11):** the fee component is DB-governed (`fee_model`, Tier-1 taker 0.008) — cache-miss defaults are fee=0.80% (DB-resolved, fail-hard), slippage=0.05%, spread=0.10% → total=**1.80%** (xstock synthesizes from the friction merge: spread 0.12% → **1.82%**).

**Previously incorrect model** (deprecated, zero runtime callers as of Directive 12.1.2):
```
friction = (entryPrice + exitPrice) × quantity × BASE_FEE_SLIPPAGE   // DEPRECATED
```
Where `BASE_FEE_SLIPPAGE = 0.005` (flat 0.5%) from `SYSTEM_GUARDS`. ~~The `calculateFriction()` function in analysis-utils.ts is marked `@deprecated` — physical removal deferred to Wave 4 (Directive 12.2.5).~~ **REMOVED** — `calculateFriction()`, `calculatePerUnitFriction()`, and `getFrictionRate()` physically deleted in Directive 12.2.5 (Batch 11, commit `b3a1526c`). `vts-service.ts` (last active caller) migrated to canonical cost model.

### Trend Slope

```
trendSlope = (prices[last] - prices[first]) / prices[first]
```
Used by DSS for regime classification.

---

## 10. Rolling Statistics Engine

**File**: `server/utils/rolling-stats.ts`
**Directive**: 11.5, 11.6B
**Status**: ACTIVE

Fixed-size sliding window for streaming statistical calculations.

### Configuration

| Parameter | Value |
|-----------|-------|
| Default window size | 300 |
| Warm-up threshold | 30 samples minimum |
| Variance type | **Population** (÷N, not ÷(N-1)) |
| Cache invalidation | On every push() |

### Formulas

```
mean = Σ(values) / N
variance = Σ(v_i - mean)² / N       // population variance
std = sqrt(variance)                 // returns 1 if N < 2 (safe sentinel)
Z-score = (value - mean) / std
```

### Module-Level Cache

Named instances via `getOrCreateRollingStats(key, windowSize?)`. This is the mechanism by which DSS, market-regime.ts, and macro-state.ts each maintain their own independent RollingStats instances.

**MCE Impact**: When MCE centralizes Z-Score computation, these separate instances will be replaced by a single set managed by MCE.

---

## 11. Secondary Metric Adjustments (Macro-Aware)

**File**: `server/core/metrics/secondary-metrics.ts`
**Directive**: 11.5
**Status**: ACTIVE

Dynamically adjusts metric thresholds based on macro market conditions.

### Base Ranges

| Metric | Base Value |
|--------|-----------|
| VOL_HIGH | 0.04 |
| VOL_LOW | 0.005 |
| MOM_HIGH | 0.05 |
| MOM_LOW | -0.05 |
| LQ_MIN | 40 |
| ADX_MIN | 20 |
| ADX_HIGH | 50 |
| VOLNOISE_MAX | 0.6 |

### Condition-Based Adjustments

| Condition | VOL_HIGH | MOM_HIGH/LOW | LQ_MIN | ADX_MIN | VOLNOISE_MAX |
|-----------|----------|--------------|--------|---------|--------------|
| NORMAL | × 1.0 | × 1.0 | +0 | +0 | × 1.0 |
| VOLATILITY_EXPANSION | × 1.25 | × 1.1 | +0 | +0 | × 1.15 |
| LIQUIDITY_CRUNCH | × 0.85 | — | +10 | — | — |
| SPECULATIVE_SURGE | × 0.9 | — | — | +10 | × 0.85 |

**Effect**: During volatile or stressed conditions, thresholds automatically widen (permissive on vol) or tighten (restrictive on liquidity) to adapt signal generation to market conditions.

---

## 12. Signal Quality Evaluator (SQE) — Deep Dive

**File**: `server/core/filters/signal_quality_evaluator.ts`
**Directive**: 11.0E (legacy purge), 11.7C
**Status**: ACTIVE

### What It Does

SQE is the final signal gatekeeper before signals enter the RTB queue. It evaluates signals on two primary dimensions plus a regime-aware ROI check.

### Evaluation Criteria (Post-Directive 11.0E + Phase 14.1 HF8)

| Gate | Threshold | Source |
|------|-----------|--------|
| FinalScore | ≥ 0.35 | Computed or backfilled. SQE is sole authority — duplicate checks in paper-execution-engine and RTB removed (HF8). |
| RegimeWeight | ≥ 0.30 | Computed or backfilled |
| ROI Gate | ≥ dynamic threshold | Regime + PredictiveConfidence |
| Confidence Floor | Mode-dependent | NORMAL=0.60, DEFENSIVE=0.70, SURVIVAL=0.80 (Directive 11.7S). Requires `regimeStability` in input. VTS signals bypass via `skipConfidenceFloor` option (cold-start). Added HF8. |
| Governance Gate (11.7R-E) | Strategy-dependent | Checks `isStrategyEligible()` based on `regimeStability` + `getStrategyDependency()`. HIGH-dependency strategies blocked in UNSTABLE regime. Requires `strategy` + `regimeStability` in input. VTS bypass via `skipGovernanceGate` option (VTS has own inline governance). Migrated from paper-execution-engine in HF9. |

**All legacy metrics purged**: NGC, CWQI, ProfitRate, and Risk are no longer gating factors. The interface still carries `ngc` as a field name (it's the confidence carrier), but it is NOT independently gated.

### Threshold Loading

Thresholds can be configured via the `screener_filters` database table (UI-accessible) or fall back to hardcoded defaults. The system loads thresholds async from the DB.

### Backfill Logic

If a signal arrives without FinalScore or RegimeWeight computed, SQE attempts to compute them from constituent fields:
- Calls `calculateFinalScore()` from `score-calculator.ts`
- Calls `calculateRegimeWeight()` from `score-calculator.ts`
- If computation fails, the signal fails SQE

### Marginal Safety

```
isMarginallySafe = signal passes AND (FinalScore - threshold) < 0.05
```
Signals in the "margin safety zone" (0.05 above threshold) are flagged — useful for monitoring filter sensitivity.

### Batch Evaluation

`evaluateSignalBatch()` processes multiple signals, returning:
- `passed[]`: Signals that cleared all gates
- `rejected[]`: Signals that failed with reasons
- `passRate`: Percentage cleared

### SQE Statistics

The singleton `signalQualityEvaluator` tracks:
- Total signals evaluated
- Pass count / Fail count
- Running pass rate
- Resetable counters

---

## 13. Quality Index (NGC & CWQI) — LEGACY (Still Active in Error)

**File**: `server/core/metrics/quality_index.ts`
**Directive**: 8.8.4-B/C, A3.R8/R9
**Status**: **LEGACY — should have been removed but was not. Still actively flowing through the pipeline in error.**

### Why This File Is A Problem

NGC is a legacy metric that was not fully removed when it should have been. Anywhere NGC appears in the codebase is incorrect — it is not a calculation DawnTrader should be using anymore. Despite this, the file remains deeply wired into the active pipeline:
1. **Computes NGC** which incorrectly flows as the `confidence` carrier in signal-orchestrator.ts (line 497: `confidence = extendedMetrics.ngc`) — this legacy value directly enters FinalScore where it should not
2. ~~**NGC-derived DI feeds the kernel**~~ — **RESOLVED by Directive 12.1.1 (BUG-004).** DI is now computed from geometric price data via `calculateDirectionalIntegrity(closePrices)` (commit `ea6551af`). NGC no longer influences Pwin/NetEV through the DI path.
3. **Provides `calculateExtendedSignalMetrics()`** called during signal generation — this function should be replaced with MCE-provided metrics
4. **Contains rolling normalization** infrastructure that introduces stateful temporal drift (also legacy — see Rolling Normalization section below)
5. **Adaptive relevance** links to VTS learning parameters in real-time — unnecessary coupling from legacy architecture

### NGC Formula (Profitability-Informed)

```
Step 1: baseNGC = (confidence × 0.5) + ((1 - volatility) × 0.3) + ((1 - risk) × 0.2)
Step 2: normalize(baseNGC) via RollingNormalizer

Step 3: Profitability blend (Directive A3.R9.0.A):
  NGC = (baseNGC_normalized × 0.4) + (profitRate × 0.4) + ((1-risk) × 0.2)
  clamped to [0, 1]
```

### CWQI Formula (Legacy, Not Gating)

```
CWQI = (NGC × 0.40) + ((1 - Risk) × 0.25) + (ExpectedReturn × 0.20) + (ProfitRate × 0.15)
```

### Expected Return

```
rrRatio = (target - entry) / (entry - stop)
rawReturn = rrRatio / (rrRatio + 2)
normalizedReturn = normalize(rawReturn) via RollingNormalizer
```

### ProfitRate

```
rawRate = (expectedReturn × 60) / expectedDuration
normalizedRate = normalize(rawRate) via RollingNormalizer
floor = max(normalizedRate, 0.15)   // Directive A3.R8.3
```

### Expected Duration

```
baseDuration = historicalHoldTime (default 60 min)
             × (1 - volatility × 0.5)
             × ATR factor (max 0.5, derived from ATR%)
clamped to [5, 240] minutes
```

### Risk Score

```
stopPercent = |entry - stop| / entry × 100
baseRisk = min(1, stopPercent / 5)

With ATR:
  atrMultiple = |entry - stop| / ATR
  atrRisk = min(1, atrMultiple / 3)
  risk = (baseRisk × 0.4) + (atrRisk × 0.6)
```

### Rolling Normalization — What It Is, Where It Lives, Why It Matters

**Location**: `server/core/metrics/quality_index.ts`, lines 108-205 (class), lines 207-209 (instances)

**What it does**: Rolling normalization is a technique for adaptively scaling raw metric values into the 0-1 range based on recently observed data. Instead of using fixed min/max boundaries, it tracks a sliding window of recent values and uses the observed min/max (smoothed exponentially) as the normalization boundaries. This means the same raw input value can produce different normalized outputs at different times as the boundaries drift.

**Three instances exist** (all in quality_index.ts):
1. **NGC Normalizer** — normalizes raw NGC base scores (defaults: [0.15, 0.70])
2. **ProfitRate Normalizer** — normalizes raw profit-per-time values (defaults: [0.002, 0.80])
3. **ExpectedReturn Normalizer** — normalizes raw R:R ratio values (defaults: [0.1, 0.8])

**How it works**:
- Keeps up to 500 data points within a 60-minute sliding window
- After 10+ samples, computes raw min/max of the window
- Smooths boundaries: `smoothedMin = α × rawMin + (1-α) × smoothedMin` (same for max)
- The smoothing factor `α` comes from VTS adaptive relevance: `α = learningRate × (gsi + 0.15)`, clamped [0.05, 0.50]
- **Conditional normalization** (Directive A3.R8.3): If a value is already in [0,1], it is returned as-is (prevents double-compression)

**Why it exists**: The original design (Phase 8.8.4-C) intended NGC, ProfitRate, and ExpectedReturn to scale dynamically with market conditions. Rather than hardcoding min/max, the system would "learn" what normal ranges look like and adjust.

**Why it's problematic**: Since NGC itself is legacy, the rolling normalization infrastructure serving NGC is also legacy. Additionally:
- **Temporal drift**: Boundaries shift over time, so the same raw inputs produce different outputs at different times
- **Distribution compression**: Exponential smoothing can compress score ranges as extremes decay
- **Reproducibility**: Makes it impossible to reproduce scores from historical data (backtesting vs forward testing divergence)
- **VTS coupling**: Smoothing rate is driven by VTS learning parameters — unnecessary coupling between validation simulator and scoring

**Status**: Legacy — should be removed when NGC is removed. If ProfitRate or ExpectedReturn normalization is still needed post-NGC, it should use deterministic (fixed) normalization boundaries rather than rolling/stateful ones.

### SQE Thresholds (Exported from this file)

```
MIN_NGC: 0.55          (env: SQE_NGC_MIN)
MAX_RISK: 0.85         (env: SQE_MAX_RISK)
MIN_PROFIT_RATE: 0.10  (env: SQE_PROFIT_MIN)
MIN_CWQI: 0.45         (env: SQE_CWQI_MIN)
MIN_FINAL_SCORE: 0.35  (env: SQE_FINAL_SCORE_MIN)
MIN_REGIME_WEIGHT: 0.30 (env: SQE_REGIME_MIN)
```

**Note**: Only MIN_FINAL_SCORE and MIN_REGIME_WEIGHT are actually enforced by SQE post-Directive 11.0E. The NGC/CWQI thresholds are exported but not used for gating.

---

## 14. Enhanced Risk Index

**File**: `server/core/metrics/risk_index.ts`
**Directive**: 8.8.4-C
**Status**: ACTIVE

### Formula

```
Risk = (StopDistance / ATR) × CorrelationPenalty

StopDistance = |entry - stop| / entry (as %)
ATR Ratio = stopDistance / ATR  (or stopPercent/2.0 if no ATR)

CorrelationPenalty = 1 + max(0, adjustedCorrelation - 0.8)
```

### Correlation Tracking

Maintains an internal `CorrelationMatrix` between pairs using Pearson correlation with exponential time-decay:

```
correlation_adjusted = correlation_prev × e^(-0.05 × ageMinutes)
```

- Tier A symbols (BTC, ETH, SOL, XRP): Updated every 30 seconds
- Max data age: 10 minutes
- Minimum 5 price points required for correlation calculation
- Correlation > 0.8 between held positions triggers the penalty multiplier

---

## 15. Market Metrics (Normalized Volatility)

**File**: `server/core/metrics/market-metrics.ts`
**Directive**: 11.3
**Status**: ACTIVE — LOCKED

```
normalizedVol = ATR14 / currentPrice
```

| Classification | Range |
|---------------|-------|
| low | < 0.01 |
| medium | 0.01 - 0.03 |
| high | > 0.03 |

Cache TTL: 60 seconds. Default fallback: 0.015 (cache miss) or 0.02 (bad price).

**Consumer**: Dynamic Sizing Engine.

---

## 16. Signal Metrics Calculator

**File**: `server/core/metrics/signal_metrics_calculator.ts`
**Directive**: A3.R9.2-A
**Status**: ACTIVE

Enforces correct order of operations: **Decay THEN Normalize** (prevents upward bias).

### Decay

```
decayed = rawValue × e^(-λ × ageMinutes)
λ = CWQI_DECAY_RATE (env var, default 0.03)
floor = max(CWQI_FLOOR=0.05, decayed)
```

### Normalization (After Decay)

```
normalized = clamp((decayedValue - min) / (max - min), 0, 1)
```

### Fresh Metrics

`fetchFreshMetrics()` hydrates live market data (price from cache, volatility from 24h range) for signal re-validation during RTB refresh cycles.

---

## 17. Unified Filter Gateway

**File**: `server/services/unified-filter-gateway.ts`
**Directive**: 9.8.C
**Status**: ACTIVE

Single source of truth for filtered pair data, serving both UI (Filtered Pairs tab) and signal generation.

### Architecture

- Primary source: `ActiveFilterPool` (populated by FX5 Scanner)
- Fallback: Direct Kraken API call (cold-start only)
- Fallback cache TTL: 60 seconds

### Freshness

| State | Age |
|-------|-----|
| Fresh | < 5 minutes |
| Stale | 5-10 minutes |
| Expired | > 10 minutes |

### Default Screener Filters

| Filter | Default |
|--------|---------|
| Min Volume | $1M |
| Volatility Min | 0.5% |
| Volatility Max | 5% |
| RSI Min | 30 |
| RSI Max | 70 |
| Universe Size | 100 |

---

## 18. Math Module Dependency Map

```
score-weights.config.ts (FROZEN)
    |
    v
adaptive-goals-weight.ts ──── adjusts weights per volatility
    |
    v
quality_index.ts ──── computes NGC, CWQI, RiskScore, ProfitRate
    |                  (NGC used as confidence carrier)
    v
signal_quality_evaluator.ts ──── FinalScore ≥ 0.35, RegimeWeight ≥ 0.30
    |                             + ROI gate via expectancy.ts
    v
expectancy.ts ──── ROI thresholds, profitability gate
    |
    v
net-expectancy-kernel.ts ──── Pure EV math (NetEV > 0 required)
    |
    v
cost-model.ts ──── Round-trip costs, net geometry
    |
    v
cost-metrics.ts ──── Live spread, friction scoring
    |
    v
slippage-fee-model.ts ──── Paper trade execution realism

analysis-utils.ts ──── LQ, DI, VolNoise, Sigma, ER, Friction
    |
    v
rolling-stats.ts ──── Z-Scores, sliding window stats

imf-metrics.ts ──── LQ, VolNoise, Correlation (OHLC-based)
    |
    v
secondary-metrics.ts ──── Macro-state threshold adjustments
```

---

## 19. Phase 1 Findings

### Active Files Documented (16)

| File | Purpose | Status |
|------|---------|--------|
| score-weights.config.ts | FinalScore weights | ACTIVE-LOCKED |
| adaptive-goals-weight.ts | Volatility-adaptive weights | ACTIVE-LOCKED |
| net-expectancy-kernel.ts | Pure EV math | ACTIVE |
| expectancy.ts | Trade expectancy gate + ROI | ACTIVE |
| cost-model.ts | Round-trip cost math | ACTIVE-LOCKED |
| cost-metrics.ts | Live spread, friction scoring | ACTIVE |
| slippage-fee-model.ts | Paper trade realism | ACTIVE |
| imf-metrics.ts | IMF filters (LQ, VN, Corr) | ACTIVE |
| secondary-metrics.ts | Macro-state threshold adjustment | ACTIVE |
| signal_quality_evaluator.ts | SQE gate | ACTIVE |
| quality_index.ts | NGC/CWQI computation | LEGACY (still active in error) |
| risk_index.ts | Enhanced risk w/ correlation | ACTIVE |
| market-metrics.ts | Normalized vol for sizing | ACTIVE-LOCKED |
| signal_metrics_calculator.ts | Decay-then-normalize | ACTIVE |
| analysis-utils.ts | Core pre-signal math | ACTIVE |
| rolling-stats.ts | Sliding window statistics | ACTIVE |

### Legacy/Ambiguous Files

| File | Purpose | Status | Notes |
|------|---------|--------|-------|
| adaptive-goals-weight.ts | Goals weight | POSSIBLY LEGACY | "Goals Engine" context — may be superseded |
| index.ts (metrics) | Barrel export | ACTIVE | Just re-exports market-metrics + cost-metrics |

### Bugs Found

1. **cost-model.ts `getCostMetricsCache()`**: Returns empty Map unconditionally — cache stats fetched but discarded. Does not affect runtime cost calculations.
2. **Population variance in rolling-stats.ts**: Uses ÷N instead of ÷(N-1). For 300-sample windows this is negligible, but documented for precision.

### Critical Findings (Verified with ChatGPT, Code-Confirmed)

**All findings below have been independently verified against source code.**

#### FINDING-P1-01: DI Probability Divergence (CRITICAL) — **RESOLVED**

> **Resolved by**: Directive 12.1.1 (Batch 1), commit `ea6551af`, 2026-02-22
> **Fix**: `signal-orchestrator.ts` line ~1127 now uses `calculateDirectionalIntegrity(closePrices)` instead of `normalizedConf * 100`

~~**signal-orchestrator.ts line 1128**: `const DI = normalizedConf * 100`~~

The DSS kernel call site previously converted NGC (blended confidence) into DI before passing it to `computeNetExpectancyKernel()`. The kernel computes `Pwin = 0.40 + DI/200` where DI is Directional Integrity (geometric price path consistency, 0-100).

- **Expectancy gate** (expectancy.ts line 509): Uses `calculateDirectionalIntegrity(prices)` — correct geometric DI
- **DSS kernel call** (signal-orchestrator.ts line ~1127): ~~Uses NGC × 100~~ **Now uses `calculateDirectionalIntegrity(closePrices)`** — correct geometric DI, consistent with expectancy gate

Both paths now use the same geometric DI source. **BUG-004 RESOLVED.**

#### FINDING-P1-02: Dual Friction Models in Same File (One Is Incorrect) — **RESOLVED**

**Status**: **RESOLVED** — Directive 12.1.2, Batch 2 (2026-02-22), commit `8393a1ef`

~~In signal-orchestrator.ts, two different friction calculations coexist:~~
- ~~**Line 557**: `computeTotalRoundTripCost(fee, slippage, spread)` from cost-model.ts — **CORRECT**~~
- ~~**Line 1122**: `SYSTEM_GUARDS.BASE_FEE_SLIPPAGE / 100` — **INCORRECT**~~

**Resolution**: All friction calculations in signal-orchestrator.ts and expectancy.ts now use `getCachedCostMetrics(symbol)` + `computeTotalRoundTripCost()` from cost-model.ts. The incorrect `SYSTEM_GUARDS.BASE_FEE_SLIPPAGE` path has been eliminated from all runtime code. The old code underestimated friction by 72× (0.01% vs 0.72%). `calculateFriction()` in analysis-utils.ts marked `@deprecated` with zero runtime callers. **RISK-009 RESOLVED, UNIFY-001 PARTIALLY RESOLVED.**

#### FINDING-P1-03: NGC Is Legacy That Was Not Fully Removed

NGC is a legacy metric that should have been removed but was not. Anywhere NGC appears in the codebase is incorrect — it is not a calculation DawnTrader should be using anymore. Despite this, NGC remains deeply wired into the active pipeline:
- Computes NGC which incorrectly flows as the `confidence` carrier through the entire pipeline
- NGC directly feeds FinalScore via `hybridScore ?? confidence` fallback — meaning FinalScore is contaminated by a legacy metric
- ~~NGC-derived DI feeds the kernel (FINDING-P1-01)~~ **RESOLVED** — DI now uses geometric price data (Directive 12.1.1). Pwin/NetEV no longer contaminated through DI path.
- Includes stateful rolling normalization that also becomes legacy infrastructure
- Links to VTS learning parameters via adaptive relevance — unnecessary coupling

**The entire quality_index.ts file is legacy infrastructure that should be replaced.** When MCE is implemented, PredictiveConfidence should replace NGC as the sole confidence authority. **Logged in LEGACY_DEPRECATION_PLAN.md and CHANGES_AND_FIXES.md.**

#### FINDING-P1-04: Rolling Normalization Is Legacy Infrastructure

The RollingNormalizer in quality_index.ts (500 samples, 60-min window) is part of the NGC legacy system and should be removed alongside NGC. See Section 13 "Rolling Normalization — What It Is, Where It Lives, Why It Matters" for the full explanation of what it does, where it lives, and its specific problems (temporal drift, distribution compression, reproducibility, VTS coupling).

**Since NGC is legacy, the rolling normalization serving it is also legacy.** If any normalization is still needed post-NGC (e.g., for ProfitRate or ExpectedReturn), it should use deterministic fixed boundaries. **Logged in LEGACY_DEPRECATION_PLAN.md.**

#### FINDING-P1-05: Two Competing Worldviews

The system contains two partially overlapping mathematical models:

| Aspect | Phase 11 Authority Model | Phase 8.8 CWQI Model |
|--------|--------------------------|---------------------|
| EV Math | Kernel (sole authority) | CWQI + NGC blend |
| DI Source | Geometric (price-based) | NGC-derived (confidence-based) |
| Confidence | PredictiveConfidence (planned) | NGC (blended, stateful) |
| Cost | cost-model.ts (component-separated) | SYSTEM_GUARDS (flat %) |
| Normalization | None (deterministic) | RollingNormalizer (stateful) |

Both are sophisticated but they are not mathematically unified. The target architecture should consolidate to the Phase 11 model during MCE implementation. **Logged in CHANGES_AND_FIXES.md as a unification recommendation.**

---

### Cross-Phase Dependency: VTS Coupling to Scoring (Phase 6 Required)

Phase 1 has revealed that VTS (Virtual Trading Simulator) influences the scoring system indirectly through a multi-hop chain:

```
VTS → adaptive relevance (α) → rolling normalization → NGC → confidence → DSS DI → kernel Pwin
```

This means the learning system has **architectural coupling to the scoring system** audited here in Phase 1. VTS math itself (learning rate dynamics, reward modeling, GSI, adaptive relevance, calibration loops) is explicitly scoped for **Phase 6: ML Pipeline, Learning & Calibration**.

**Before finalizing any structural recommendations** regarding NGC removal, RollingNormalizer deprecation, confidence consolidation, or DSS DI sourcing, Phase 6 must explicitly validate:

1. VTS reward function math
2. Learning rate update equations
3. GSI (Global Stability Index) calculation logic
4. Stability bounds on adaptive relevance
5. Drift controls and convergence properties
6. Statistical reproducibility characteristics
7. Whether VTS-derived adjustments materially improve trade expectancy

**Phase 1 does not need to expand in scope**, but Phase 6 must be treated as mathematically authoritative before any final consolidation decisions are made.

---

### Revision History

| Date | Version | Change | Trigger |
|------|---------|--------|---------|
| 2026-02-15 | v1 | Initial draft | Phase 1 deep-read |
| 2026-02-15 | v1.1 | ChatGPT corrections | DI divergence, NGC status, dual friction, rolling normalization risk |
| 2026-02-15 | v2 | Kyle corrections | NGC confirmed legacy (not active), friction model clarified (cost-model correct, SYSTEM_GUARDS incorrect), rolling normalization explained in detail, version numbering added |
| 2026-02-22 | v2.1 | Directive 12.1.1 (Batch 1) | BUG-004 RESOLVED — DI Probability Divergence fix. FINDING-P1-01 marked RESOLVED. |
| 2026-02-22 | v2.2 | Directive 12.1.2 (Batch 2) | RISK-009 RESOLVED — Dual friction models fix. FINDING-P1-02 marked RESOLVED. Trade Friction section updated to reflect canonical model. SYSTEM_GUARDS friction marked RESOLVED in Contaminated/Legacy table. |

---

*End of Phase 1: Core Math & Scoring Engine*


---

# Chapter 2: Strategy Deep Dives

## Current State (Post-HF9)

**The DSS has been fully deleted** (Batch 17, HF9 `f9fa56c6`). Strategy selection is now handled by:
1. **MCE** (`computeContext()`) — provides canonical 5-regime classification per pair
2. **`CANONICAL_REGIME_STRATEGY_MAP`** — maps regimes to allowed strategies (9 quant + 3 pattern + 5 hybrid)
3. **StrategyEngine detect functions** — evaluate real market conditions per strategy and return entry/stop/target or null
4. **SQE** — centralized quality gate with FinalScore, RegimeWeight, ROI, confidence floor, and governance gate (11.7R-E)

Pattern/hybrid strategies are structurally unable to fire in VTS (Phase 14.5 needed for parallel pattern scanning path). Quant strategies (mean_reversion, range_trade, breakout, etc.) fire successfully via detect functions.

---

## ⚠️ CRITICAL: Four Parallel Regime Classification Systems (BUG-008)

DawnTrader contains **four** independent regime classification systems operating simultaneously with **three different naming conventions** and **zero cross-referencing**. This is the deepest architectural fragmentation in the system.

### The Four Engines

#### ~~Engine 1~~: DSS Legacy (Active Trading Path) — **DELETED** (Batch 17, HF9)
- **File**: ~~`server/services/dynamic-strategy-selector.ts`~~ **DELETED** (`f9fa56c6`)
- ~~**Input**: `volNoise` + `trendSlope` from analysis-utils (raw thresholds)~~
- ~~**Output**: 6 legacy regimes~~
- ~~**Consumers**: Signal Orchestrator → active trades~~
- **Status**: **DELETED** — superseded by MCE regime filtering + StrategyEngine detect functions. ~~BUG-006~~ RESOLVED (Batch 13 rewire + Batch 17 deletion). Signal orchestrator NetEV > 0 filter is now inline (replaced broken DSS.evaluate() call that never executed).

#### Engine 2: calculatePairRegime (VTS / Pair-Level) — CANONICAL CANDIDATE
- **File**: `server/core/metrics/market-regime.ts`
- **Input**: OHLC data → volatility (stddev returns), momentum (14-period % change), ADX (14-period)
- **Output**: 5 canonical regimes (BULL_STABLE, BEAR_VOLATILE, LOW_VOL_CHOP, HIGH_VOL_IMPULSE, TRANSITION)
- **Consumers**: VTS Runner (heavy use), Diagnostic 11.4G
- **Thresholds**: Static, closely aligned with canonical map thresholds
- **Status**: ACTIVE — recommended as sole pair-level regime authority

#### Engine 3: getNormalizedRegime (Z-Score Advisory) — PRESERVE FOR ML
- **File**: `server/core/metrics/market-regime.ts` (same file as Engine 2)
- **Input**: Same as Engine 2, but Z-Score normalized through 300-period RollingStats buffers
- **Output**: 5 canonical regimes (same names as Engine 2)
- **Consumers**: VTS Runner (advisory logging only, Directive 11.5 Task 2)
- **Status**: ACTIVE — advisory only, not used for routing decisions. Preserve for Phase 12 ML retraining.

#### ~~Engine 4~~: Market Condition Profiler / Adaptive Regime Engine (Market-Level) — **REMOVED** (Phase 13, Batch 14, commit `8f26369a`)
- **Files**: `server/services/market-profiler.ts` + `server/services/adaptive-regime.ts`
- **Directive**: 8.8.4-L12 (LOCKED — predecessor system, lock made it invisible during canonical evolution)
- **Built**: Dec 27, 2025. Immediately locked. The canonical regime map (Directive 11.7F) and DSS were built starting Jan 2026 to replace it, but MCP/ARE was never decommissioned.
- **Input**: Live price history + volume history → volatility (20-period std dev), trend strength (-1 to 1), volume z-score, ATR, cross-asset correlation
- **Output**: 5 regimes with **different taxonomy**: T1 (Trending Bull), T2 (Trending Bear), R1 (Range-Bound), V1 (High Volatility Chop), C1 (Calm Consolidation)
- **Consumers**: **14+ services** — market routes, health routes, autonomy-scheduler, action-executor, APR-SLE engine, MACO coordinator, GASP coordinator, experience-buffer, reward-evaluator, proactive-allocator, regime-performance tracker, regime archiver, regime-stability governance
- **Strategy Mix**: Own hardcoded `REGIME_STRATEGY_MATRIX` with percentage-weighted allocations (e.g., T1: breakout 45%, momentum 30%, DHMA 10%). Does NOT reference canonical map.
- **Exposure/Risk Multipliers**: `REGIME_EXPOSURE_MULTIPLIERS` (T1: 1.2×, T2: 0.7×) and `REGIME_RISK_MULTIPLIERS`
- **Stubbed Metrics** (RISK-019): `volume_z` hardcoded to `0`, `correlation` hardcoded to `0.5` — never computed from market data. Further evidence this system was never fully completed before being locked.
- **Timer**: Runs every 15 minutes via `checkInterval`
- **Status**: **LEGACY — Kyle confirmed 2026-02-16.** MCP/ARE was the predecessor regime system. The canonical map and DSS were built to replace it. It was never the intention to have two systems creating signals and making adjustments to signal generation. Must be removed entirely. 14+ consumer services must be migrated during removal.

### Why This Matters

| Problem | Impact |
|---------|--------|
| VTS learns from Engine #2, active trading uses Engine #1 | Any ML calibration from VTS data is computed against a different regime model than production. VTS predictions are suspect. |
| Engine #4 is a legacy predecessor still running | MCP/ARE was built before canonical map existed, was locked, then ignored. It continues applying its own strategy weights and exposure modifiers to 14+ services using a completely different regime model (RISK-016, RISK-020) |
| Three naming conventions (legacy 6 / canonical 5 / T1-C1) | No cross-reference mapping exists between any pair of taxonomies |
| Engine #4 uses stubbed metrics | `volume_z = 0` and `correlation = 0.5` are hardcoded — never computed from market data. System was locked before implementation was finished (RISK-019) |
| Two systems generating signals and adjustments simultaneously | Kyle confirmed this was never the intention. Canonical map and DSS were built to replace MCP/ARE, not coexist with it |

### Current Regime Architecture (Post-Batch 14, B62 DBS-Integrated Classifier)

**Layer 1 — Pair-Level Regime Authority (Strategy Routing) — ACTIVE (REDESIGNED in B62):**
Market Context Engine (MCE) computes DBS first, then calls `calculatePairRegime(momentum, adx, volatility, dbsScore)` from `market-regime.ts` → 5 canonical regime names → `CANONICAL_REGIME_STRATEGY_MAP` lookup → allowed strategies. Both signal orchestrator (active trading) and VTS runner (passive learning) call `MCE.computeContext()`. ~~BUG-006~~ RESOLVED (Batch 13). ~~BUG-002, BUG-003~~ RESOLVED (Batch 14).

**B62 classifier redesign (Design B — DBS-integrated gates).** The `calculatePairRegime()` function now accepts a `dbsScore` parameter (default 0) and uses DBS to gate regime assignments:
- **RANGE_BOUND_STABLE** requires `|DBS| < 0.10` in addition to the existing volatility < 0.012 and ADX < 45 checks. This eliminates drift-contaminated false ranges — Phase 0 replay measured **RBS drift contamination 70.2% → 0.0%** under Design B.
- **TREND_FOLLOWING_STRONG** admits pairs with `|DBS| >= 0.30` even without traditional momentum/ADX signals. This unblocks trend strategies that were previously locked out by RBS misclassification.
- **IMPULSE_EXPANSION** admits pairs with `|DBS| >= 0.50 && vol > 0.015` (less restrictive than the old vol > 0.020 && ADX > 55 gate), expanding IE from vestigial ~1% to a viable regime.
- **MCE execution order changed:** DBS is now computed BEFORE regime classification (was regime-first). This is required because the classifier consumes `dbsScore` as an input.
- **Code freeze on `market-regime.ts` LIFTED as of B62 Phase 1.**

**Phase 0 replay evidence (B62).** 4-day historical replay across the full pair universe validated Design B:
- TFS+IE combined share: **14.1% → 36.5%** (trend strategies unblocked)
- RBS drift contamination: **70.2% → 0.0%** (drift-contaminated pairs correctly reclassified)
- Family-level regime flicker: **1.99%** (well under 2.0% ceiling)
- TFS DBS threshold of 0.30 is the **only tested value** that passes the 2.0% flicker ceiling (0.20 and 0.25 both failed)

> **Historical context (Phase 15b audit, 2026-04-14 through B61).** The pre-B62 classifier used volatility + ADX + momentum thresholds but had **no directional drift check**. It labeled 54.5% of pairs as `RANGE_BOUND_STABLE` while only ~8% had truly neutral momentum. B61 measured **70.17%** drift contamination on a 22h cycle-sampled window (B59's 47% snapshot underestimated the problem), which explained why `range_trade` had a 76% loss rate (77.5% stop-hit) despite sound R:R 2.31 strategy logic. See `POST_AUDIT_ROADMAP.md` Phase 15b body and `Claude Comms and Packages/Scope Files/REGIME_DBS_STRATEGY_AUDIT_SCOPE_2026-04-14.md`.

**Layer 1b — Directional Bias Score (DBS) — LIVE INPUT TO REGIME CLASSIFIER (B62):**
`server/core/metrics/directional-bias.ts` implements the Directional Bias Score: composite formula `0.40×slope + 0.35×return + 0.25×EMA_alignment`, all ATR-normalized. 7 categories (UP_STRONG through DOWN_STRONG). Per-pair DBS plus global DBS (weighted median of per-pair DBS by 24h volume, with configurable weight cap constant). `sentinelZero` boolean added to `DirectionalBiasResult` to flag zero-score sentinel values. File comment states: *"Regime answers how the market behaves mechanically. Directional Bias answers: is price going up or down, and how strongly?"*

**⚠ Formula design constraint — slope-clamp interaction (recorded 2026-04-15 per B61 A.1 §3.3):** `slopeComponent` has an internal clamp at `[-0.40, +0.40]` applied BEFORE the 0.40 slope weight is multiplied in. This clamp binds at the component level. Raising the slope weight alone cannot produce extreme-category readings (UP_STRONG ≥ +0.60 or DOWN_STRONG ≤ -0.60) because the clamp caps slope's maximum contribution at the weight × 0.40 boundary, which is below the ±0.60 category threshold. **Empirical confirmation (B61 A.1 weight-sensitivity analysis, 13,757 cycle-samples):** under a slope-heavy weighting of 0.50/0.30/0.20, **zero observations reach UP_STRONG or DOWN_STRONG**, because slope alone can contribute at most ±0.50 and the demoted return + ema components cannot make up the difference. This is a permanent design property, not a bug. **Implication for future designers:** "just upweight slope to capture stronger trends" is provably counterproductive — it collapses the extreme categories to zero. Any design change that wants to increase the share of extreme-category readings must either (a) widen the internal clamp on `slopeComponent`, (b) rebalance weights while preserving the return component's contribution, or (c) redesign the categorization thresholds. Record in B62 design-space decisions.

**As of B62 (2026-04-16), DBS is a LIVE INPUT to the regime classifier — the dormant-wire and half-wire dead code paths have been REMOVED.** Current consumer status:
- Fully implemented
- Actively computed every MCE cycle (computed BEFORE regime classification as of B62)
- Emitted to logs and VTS trade metadata as `pairDirectionalBias` / `globalDirectionalBias`
- **ACTIVE consumer: `market-regime.ts` `calculatePairRegime()`** — the regime classifier consumes `dbsScore` to gate RBS (requires `|DBS| < 0.10`), admit TFS (`|DBS| >= 0.30`), and admit IE (`|DBS| >= 0.50`). This is DBS's first active runtime consumer.
- **REMOVED: `signal-orchestrator.ts` dormant wire** — the `computeBiasConfidenceModifier` import and the `dbsModifier` computation at the former L448–467 block have been deleted in B62. This wire was born dormant (shipped 2026-03-05, active trading OFF since 2026-01-12) and never executed against a captured cycle.
- **REMOVED: `vts-runner.ts` no-op half-wire** — the `computeBiasConfidenceModifier` import and the discarded `biasModifier` computation at the former L877 have been deleted in B62. `computeBiasConfidenceModifier` is no longer imported by any file.
- **VTS benchmark exclusion (Directive 11.6F) REMOVED** — benchmarks now flow through VTS. The exclusion was a Phase 15b audit-era safeguard that is no longer needed with the DBS-integrated classifier live.
- **Global DBS fixes deployed in B62:** (1) real volume weighting replaces unweighted median when volumes are available, (2) coverage gate prevents global DBS from being authoritative when fewer than a threshold number of pairs contribute, (3) sentinel-zero filter excludes pairs with `sentinelZero: true` from the global aggregation.

**Historical context (pre-B62).** Prior to B62, DBS was DORMANT-WIRE + HALF-WIRE. The two consumer sites (`signal-orchestrator.ts:454` and `vts-runner.ts:877`) both imported `computeBiasConfidenceModifier` but neither produced a runtime effect — the orchestrator path never ran (active trading OFF) and the VTS path computed and discarded the result. No captured decision during the pre-B62 DBS era was modified by DBS. See B61 completion report for the full forensic consumer inventory.

**Governance-failure framing (corrected 2026-04-15).** This is neither "DBS is orphaned" (the 2026-04-14 framing from the `range_trade` root-cause investigation — ambiguous and false at the code-path inventory level) nor "DBS has been silently shaping signals" (a first-draft B61 framing also false because active trading has been off). The correct framing is **"dormant wire on orchestrator, no-op half-wire on VTS, both buried under ambiguous orphan language."** The governance failure is that prior docs conflated runtime-consumer truth with source-import truth — the SIM said "NONE" and the System Manual said "never imported anywhere", both of which were operationally true for captured decisions but factually wrong as code-path inventory claims. Every future review must check both runtime consumer behavior AND source-level imports, and report them separately.

**Burial pattern — false parity claim (case study, added 2026-04-15).** The `// (parity with VTS path)` comment at `signal-orchestrator.ts:448` asserts consistency with a sibling path that is itself dead code. The sibling (`vts-runner.ts:877`) computes the modifier and discards the result, so there is no parity to achieve — the parity claim is fictional from day one. **Future reviews must specifically flag comments that assert consistency with another code path without verifying the other path actually does what the comment claims.** This is a named burial pattern: **false parity claim between two broken paths.** It is the canonical example of a comment that looks reassuring to a skim-review and covers a two-path defect.

**Phase 15b B61 DBS Validation — COMPLETE (2026-04-16). B62 Regime Taxonomy Redesign — DEPLOYED (2026-04-16).** B61: 8-deliverable audit across formula, thresholds, global methodology, and data quality. B62: DBS-integrated classifier (Design B) deployed with Phase 0 replay validation. Key B61 verdicts:
- **A.1 Formula: KEEP.** Formula reconstructs exactly, weights on a plateau, ATR normalization confirmed PASS (IQR ratio 0.676, DBS volatility ratio 0.897 across ATR tiers). Slope × ema pooled correlation 0.5792 (acceptable). Return component is load-bearing.
- **A.2 Thresholds: DEFENSIBLE.** Drift contamination = **70.17%** of RBS labels (B59 estimated ~47% — B61 confirmed the problem is worse). Strategy lockout = **55.28%** of strong-DBS pair-cycles locked in RBS. IMPULSE_EXPANSION = 1.03% (vestigial). Fixed thresholds wider than distribution justifies (STRONG categories = 2.38% combined). Positive median skew +0.042.
- **A.3 Global DBS: REVISE (GREEN-with-conditions).** Three code defects found: (1) empty volumes → unweighted median, (2) cache membership instability (mean 18/60 pairs per snapshot, 50.32% category flip rate), (3) sentinel-zero not excluded. All external references AGREE in direction. Pair-level DBS trustworthy; global aggregation needs fixes before B62 use.
- **A.4 Data Quality: PASS WITH CAVEAT.** Family-level flip rate 1.35% (better than legacy 1.37%). Category-boundary flip rate 2.37% (technical fail vs 2.34% mature-window threshold by 0.03pp — threshold-placement artifact, not directional instability).
- **B62 gate: CLEAR.** 24 carry-forward items documented in B61 completion report §8.
- **B62 Phase 0 replay results** (the authoritative empirical numbers): TFS+IE 14.1% → 36.5%, RBS drift contamination 70.2% → 0.0%, family flicker 1.99%. B59-era simulation projections (TFS 19.3% → 55.7%, RBS 54.5% → 3.4%) are superseded — they were directionally correct but magnitude-wrong because they used different methodology.
- **B62 VERIFIED 2026-04-19 — CLOSED.** 72h post-deploy window (174,287 MCE samples, 359 closed trades across 76 symbols) confirms all primary metrics: **RBS drift contamination 0.00% (0 / 23,983 RBS samples)** — Phase 0 predicted 0.0% and that prediction held exactly across a massive sample. **TFS+IE combined 46.19%** (TFS 43.0% + IE 3.2%) — exceeds the 18-25% target band. RBS share collapsed to 14.4% (was 55.7%). IE share 3.2% (within 2-5% target). ST share 33.2% (high but stable; no DBS-aware sub-condition needed). Family-level flicker within 2.0% ceiling. Component-clamp saturation stable vs B61 baselines.
- **B62 verification finding that triggered B63:** high-DBS trades (|DBS|≥0.30) show 25.6% WR vs 37.9% for low-DBS, 70.1% stop-out vs 61.0%. Root cause: TFS/IE-mapped "trend" strategies (morning_star, reverse_impulse, vwap_pullback) are reversal/pullback patterns misapplied to trending pairs. NOT a filter/gate issue (conversion 0.21-0.29% is fine). Triggers B63 = Strong Bull Trend strategy (new LONG-only trend-rider for |DBS|≥0.30) + TEC shared service (wire dormant trailing-exit-controller.ts to VTS + paper). See `POST_B62_PRE_LAUNCH_PLAN.md`.

**Rule going forward:** any computed metric must have an explicit consumer documented in both this manual and `SYSTEM_IMPACT_MAP.md`, and the documentation must distinguish **runtime-applied consumers** (a path that actually executes and uses the value in a decision) from **source-level imports** (a symbol is named in a file, regardless of whether the path runs or the result is used). Metrics written but never read, imports that never execute, and computes whose results are discarded are all governance failures but they are **different failures and must be labeled accordingly.**

**✅ Operational takeaway — 15-day VTS audit window is DBS-clean.** The ~960 closed VTS trades between 2026-03-31 and 2026-04-14 carry `pairDirectionalBias` metadata as raw category-string observations; no trade has been scored with an applied DBS modifier. The B59 `range_trade` investigation's classifier drift-contamination finding stands. The B61 A.1/A.2/A.4 Final measurements will run against uncontaminated data. B61 measurement integrity is intact.

**Layer 2 — Z-Score Normalized Regime (ML Advisory) — ACTIVE:**
`getNormalizedRegime()` from `market-regime.ts`. Advisory only. Preserved for Phase 12 ML retraining. Not used for routing. VTS uses MCE's `raw` output for Z-score normalization.

**Layer 3 — Portfolio-Level Risk/Exposure Modulation — FUTURE:**
MCP/ARE has been removed (Batch 14). Any future portfolio-level exposure/risk modulation should be built as a lightweight module that consumes MCE's canonical regime output. This is NOT a new parallel regime engine — it is a downstream consumer.

**COMPLETED — Two Systems Removed:**
1. ~~DSS volNoise/trendSlope classification → `SYSTEM_GUARDS.STRATEGY_MAP`.~~ **REMOVED** — DSS rewired to `calculatePairRegime()` (Batch 13, Directive 12.3.1).
2. ~~MCP/ARE (`market-profiler.ts` + `adaptive-regime.ts`).~~ **REMOVED** — Entire L12-L20 cluster deleted (Batch 14, Phase 13). MCE installed as replacement.

---

## Overview: The Intended Strategy Architecture

```
Market Data → Regime Classifier (Canonical 5-Regime Model)
                ↓
            Canonical Strategy Map → Candidate Strategies (up to 5 per regime)
                ↓
    ┌───────────────────────────────┐
    │  QUANT Strategies (9)         │ → StrategySignal
    │  PATTERN Strategies (3)       │ → PatternSignal
    │  HYBRID Strategies (5)        │ → HybridSignal
    └───────────────────────────────┘
                ↓
    Context-Aware Selection (pattern detection → strategy preference)
                ↓
    Signal Orchestrator (Phase 3) → SQE Gate → Kernel → Trade Decision
```

**Three signal types, equal citizens:**
- **QUANT** (9 strategies): Technical indicator-based signals from OHLCV candle analysis
- **PATTERN** (3 strategies): Candlestick pattern-based signals using the 5 canonical patterns
- **HYBRID** (5 strategies): Confluence of quant indicators + pattern recognition

---

## 1. Canonical Regime-Strategy Map (Single Source of Truth)

**File**: `server/config/canonical-regime-strategy-map.ts` (680 lines)
**Directive**: 11.7F
**Schema Version**: regime-mapping/v1.4c (2026-01-23)
**Status**: DEFINED but NOT wired to DSS runtime

### 5 Canonical Regimes

| Regime | Momentum | ADX | Volatility | Description |
|--------|----------|-----|------------|-------------|
| **BULL_STABLE** | > 0.005 | > 25 | < 0.025 | Sustained uptrend, confirmed directional trend, stable volatility |
| **BEAR_VOLATILE** | < -0.005 | > 25 | > 0.03 | Downward impulse, strong bearish trend, high turbulence |
| **LOW_VOL_CHOP** | abs < 0.002 | < 20 | < 0.015 | Flat market, no directionality, narrow range |
| **HIGH_VOL_IMPULSE** | > 0.010 | > 30 | > 0.03 | Strong breakout, trend acceleration, violent expansion |
| **TRANSITION** | ±0.004 | 20-25 | 0.015-0.03 | Reversal zone, weakening trend, volatility uplift |

### Full Canonical Strategy Map (17 Strategies)

#### BULL_STABLE (3 strategies, riskMultiplier: 1.2, minConfidence: 0.65)

| Strategy | Key | Signal Type | Pattern | Secondary Metrics |
|----------|-----|-------------|---------|-------------------|
| VWAP Pullback | vwap_pullback | QUANT | — | VWAP deviation < −1σ, Momentum > 0 |
| Morning Star / Evening Star | morning_star | PATTERN | MORNING_STAR | 3-bar sequence, momentum flip > 0.3% |
| Pivot Shift | pivot_shift | HYBRID | MORNING_STAR | RSI 45–55, ADX slope > 0.5 |

#### BEAR_VOLATILE (4 strategies, riskMultiplier: 0.7, minConfidence: 0.75)

| Strategy | Key | Signal Type | Pattern | Secondary Metrics |
|----------|-----|-------------|---------|-------------------|
| Mean Reversion | mean_reversion | QUANT | — | RSI < 30 or > 70, Price deviation > 1σ |
| Reverse Impulse | reverse_impulse | HYBRID | PINBAR | Volume > 1.5× avg, Momentum spike < −0.5% |
| Defensive Hedge | defensive_hedge | HYBRID | ENGULFING | BTC Corr < 0.3, Vol Offset > 1σ |
| Inside Bar Reversal | inside_bar_reversal | PATTERN | ENGULFING | Parent > Child × 1.3, Breakout Volume > 1.5× avg |

#### LOW_VOL_CHOP (4 strategies, riskMultiplier: 0.9, minConfidence: 0.60)

| Strategy | Key | Signal Type | Pattern | Secondary Metrics |
|----------|-----|-------------|---------|-------------------|
| Range Trading | range_trade | QUANT | — | Bollinger Bandwidth < 0.14, RSI 45–55, ADX < 20 |
| Support Bounce | support_bounce | PATTERN | PINBAR | Price ≈ Local Min ± 1σ, Volume > 1.2× avg |
| ABCD Long | abcd_long | QUANT | — | AB:CD ≈ 1.0, Volume > 1.2× avg |
| Adaptive Flow | adaptive_flow | HYBRID | TRI_STAR | Momentum inversion ≥ 3, Volatility percentile > 70% |

#### HIGH_VOL_IMPULSE (5 strategies, riskMultiplier: 0.8, minConfidence: 0.70)

| Strategy | Key | Signal Type | Pattern | Secondary Metrics |
|----------|-----|-------------|---------|-------------------|
| SMA Trend Ride | sma_trend_ride | QUANT | — | SMA(50) > SMA(100), ADX > 25, RSI 55–70 |
| Breakout | breakout | QUANT | — | Momentum > +0.7%, Volume > 2× avg |
| VWAP Bounce | vwap_bounce | QUANT | — | VWAP deviation > +1σ, Momentum −0.3–−0.6% |
| Volatility Edge | volatility_edge | HYBRID | ABCD | Volatility Percentile > 80, Regime mismatch = True |
| DHMA | dhma | QUANT | — | HMA(9) cross HMA(21), ADX flat |

#### TRANSITION (3 strategies, riskMultiplier: 0.85, minConfidence: 0.55)

| Strategy | Key | Signal Type | Pattern | Secondary Metrics |
|----------|-----|-------------|---------|-------------------|
| Liquidity Trap | liquidity_trap | QUANT | — | Wick/Body > 2 or Depth Imbalance > 1.4 |
| Pivot Shift | pivot_shift | HYBRID | MORNING_STAR | RSI 45–55, ADX slope > 0.5 |
| Morning Star / Evening Star | morning_star | PATTERN | MORNING_STAR | 3-bar sequence, momentum flip > 0.3% |

**Note**: Pivot Shift and Morning Star appear in both BULL_STABLE and TRANSITION — they are cross-regime strategies.

### Ghost Regime Normalization (Legacy Bridge)

The canonical map includes a normalization layer for legacy regime names:

| Legacy Regime | Canonical Equivalent |
|---------------|---------------------|
| BULL_VOLATILE | HIGH_VOL_IMPULSE |
| BEAR_STABLE | BEAR_VOLATILE |
| EXTREME_NOISE | LOW_VOL_CHOP |
| HIGH_VOL_CHOP | HIGH_VOL_IMPULSE |
| MIXED_TRANSITION | TRANSITION |

### Context-Aware Strategy Selection (Directive 11.4G)

The canonical map provides `selectContextAwareStrategy()` which considers detected patterns when selecting strategies:

1. **Exact match**: If pattern recognizer detects a pattern that matches a HYBRID/PATTERN strategy in the current regime → select that strategy
2. **Hybrid fallback**: If pattern detected but no exact match → select any HYBRID strategy for the regime
3. **Pattern fallback**: If no HYBRID available → select any PATTERN strategy
4. **Diversity**: 25% of symbols (via symbol hash) get a non-primary strategy for natural diversity
5. **Primary**: Default to the first strategy in the regime's list

This selection logic ensures pattern and hybrid strategies are actively chosen when conditions warrant — but **only if the DSS is wired to use it**.

### Pattern-to-Canonical Mapping (Directive 11.4G)

The 5 pattern recognizer outputs are mapped to canonical pattern types:

| Detected Pattern | Canonical Type | Strategy Family |
|-----------------|----------------|-----------------|
| PINBAR | PINBAR | Reverse Impulse, Support Bounce |
| ENGULFING | ENGULFING | Defensive Hedge, Inside Bar Reversal |
| MORNING_STAR | MORNING_STAR | Morning Star, Pivot Shift |
| INSIDE_BAR | ENGULFING | (mapped to Engulfing family) |
| THREE_SOLDIERS | MORNING_STAR | (mapped to Morning Star family) |
| ABCD | ABCD | Volatility Edge |
| TRI_STAR | TRI_STAR | Adaptive Flow |

---

## 2. The Current DSS (Legacy — Must Be Replaced)

**File**: `server/services/dynamic-strategy-selector.ts` (214 lines)
**Directive**: 10.1
**Status**: ACTIVE but using **legacy regime/strategy mapping**

### What's Wrong

DSS currently imports `SYSTEM_GUARDS.STRATEGY_MAP` which defines:
- 6 legacy regimes (EXTREME_NOISE, BULL_STABLE, BULL_VOLATILE, BEAR_STABLE, BEAR_VOLATILE, LOW_VOL_CHOP)
- Only 9 QUANT strategies (no pattern, no hybrid)
- Different regime thresholds (volNoise/trendSlope) than the canonical model (momentum/ADX/volatility)

**Consequences**:
- Pattern strategies (morning_star, support_bounce, inside_bar_reversal) are never selected
- Hybrid strategies (pivot_shift, reverse_impulse, defensive_hedge, adaptive_flow, volatility_edge) are never selected
- Regime classification misaligns with the canonical model
- The canonical map's risk multipliers and min confidence thresholds are not applied

### What Needs to Change

DSS must be rewired to:
1. **Call `calculatePairRegime()` from `market-regime.ts`** instead of computing volNoise/trendSlope locally — this is the same function VTS already uses, which unifies regime classification between active trading and VTS
2. Import from `canonical-regime-strategy-map.ts` instead of `SYSTEM_GUARDS.STRATEGY_MAP`
3. Use `selectContextAwareStrategy()` for pattern-aware routing
4. Apply per-regime `riskMultiplier` and `minConfidence` from canonical map
5. Remove EXTREME_NOISE as a regime — the canonical model handles high volatility via HIGH_VOL_IMPULSE (not as an auto-veto)

**Note**: This is a short-term fix achievable pre-MCE. The Signal Orchestrator can call `calculatePairRegime()` directly for regime classification, then look up strategies via the canonical map. MCE will eventually centralize this, but the fix doesn't need to wait.

**Logged as BUG-006 in CHANGES_AND_FIXES.md.**

---

## 3. QUANT Strategies (9)

**File**: `server/services/strategy-engine.ts` (999 lines)
**Directive**: 8.8.3-B
**Status**: ACTIVE — strategy detection logic is correct, but regime routing is wrong

The 9 quant strategy implementations exist and are functional. Their detection logic, entry/exit rules, and signal generation are independent of the regime routing. The problem is only that DSS routes them via the wrong map.

### Strategy Parameters

All strategy parameters (pullback thresholds, volume multipliers, etc.) are backend-configured. No UI exposure for user editing was found in the client code. If any route previously exposed parameter editing, it has been removed or is inactive.

### 3.1 VWAP Pullback
**Canonical Regime**: BULL_STABLE
**Method**: `detectVWAPPullback(indicators, settings, priceHistory)`

Entry: Price above VWAP, within pullback threshold (2%), bullish reversal detected, volume ≥ 1.5× average.
Stop: min(VWAP × 0.997, low24h × 1.001). Target: max(high24h × 0.995, entry + 2R).
Confidence: 0.7–0.9 (variable based on reversal confirmation).
Strategy-Specific Exit: Price closes below current VWAP.

### 3.2 ABCD Long
**Canonical Regime**: LOW_VOL_CHOP
**Method**: `detectABCDLong(priceHistory, settings)`

Entry: 4-point pattern (Spike → Pullback → Higher Low → Breakout). Requires volume confirmation ≥ 1.5× spike volume.
Stop: C-low × 0.998. Target: entry × (1 + targetPercent, default 3%) or trailing 2R.
Confidence: 0.75 (static).
Strategy-Specific Exit: Price drops 0.5% below entry.

### 3.3 SMA Trend Ride
**Canonical Regime**: HIGH_VOL_IMPULSE
**Method**: `detectSMATrendRide(indicators, priceHistory, settings)`

Entry: Price above SMA + near SMA + bounce pattern + uptrend confirmed (above mode), or price crosses above SMA + uptrend (crossover mode).
Stop: min(5-bar swing low × 0.998, SMA × 0.995). Target: entry + trendStrength × 3% or 2R.
Confidence: 0.65 (static).
Strategy-Specific Exit: Price closes below current SMA.

### 3.4 Breakout
**Canonical Regime**: HIGH_VOL_IMPULSE
**Method**: `detectBreakout(priceHistory, params)`

Entry: Price breaks above consolidated range high × (1 + buffer, 1%), volume ≥ 2× average.
Stop: rangeLow × 0.998. Target: entry + rangeHeight (measured move).
Confidence: 0.75 (static).
Strategy-Specific Exit: Price closes below breakout level × 0.995.

### 3.5 Mean Reversion
**Canonical Regime**: BEAR_VOLATILE
**Method**: `detectMeanReversion(indicators, priceHistory, params)`

Entry: Price below mean (VWAP/SMA/range midpoint) by deviation threshold (2.5%), bullish reversal detected.
Stop: entry × (1 - 1%). Target: meanValue × 0.998.
Confidence: 0.70 (static).
Strategy-Specific Exit: None (stop/target only).

### 3.6 Range Trading
**Canonical Regime**: LOW_VOL_CHOP
**Key**: `range_trade` (note: canonical map uses `range_trade`, strategy engine uses `range_trading`)
**Method**: `detectRangeTrading(priceHistory, params)`

Entry: Price in entry zone near range support (between rangeLow and rangeLow + 0.5%).
Stop: rangeLow × (1 - 1%). Target: rangeHigh × 0.995.
Confidence: 0.72 (static).
Strategy-Specific Exit: Price breaks above resistance × 1.002.

### 3.7 VWAP Bounce
**Canonical Regime**: HIGH_VOL_IMPULSE
**Method**: `detectVWAPBounce(indicators, priceHistory, params)`

Entry: VWAP trending up (slope ≥ 0.3%), price near VWAP (within 0.5%), recently touched/went below, now above, volume ≥ 1.3× average.
Stop: VWAP × 0.997. Target: entry + 2R.
Confidence: 0.73 (static).
Strategy-Specific Exit: Price closes below current VWAP.

### 3.8 Liquidity Trap
**Canonical Regime**: TRANSITION
**Method**: `detectLiquidityTrap(priceHistory, params)`

Entry: False breakout above range detected (broke above, returned), trap extension ≤ 1.2%, volume reversal ≥ 1.5× breakout volume.
Stop: breakoutHigh × 1.005. Target: rangeLow × 1.002.
Confidence: 0.68 (static).
Strategy-Specific Exit: Price goes above trap level × 1.002.

### 3.9 DHMA (Dual-Horizon Microstructure Alpha)
**Canonical Regime**: HIGH_VOL_IMPULSE
**File**: ~~`server/strategies/dhma.ts`~~ **DELETED** (Directive 12.2.1, Batch 8). Standalone DHMA module was orphaned — never instantiated by strategy-engine. Active DHMA detection runs inline via `server/strategies/strategy-engine.ts:detectDHMA()`.

The most sophisticated strategy — uses Level-2 order book data, not OHLCV candles.

**Features**: OBI (Order Book Imbalance), Microprice Tilt, Signed Flow Ratio, Toxicity (VPIN), Arrival Rate.
**Dual Regime**: Burst (5-20 min signed flow) + Session (15 min+ VWAP slope).
**Entry**: Both regimes must agree + OBI/tilt thresholds + toxicity/spread filters.
**Sizing**: Risk-based with spread × toxicity deweighting.
**Coherency**: Calls `guardrailPolicy.validate()` before any signal.
**Note**: DHMA generates both long AND short signals. Short signals are forward-looking architecture — DawnTrader currently operates long-only on Kraken.

---

## 4. PATTERN Strategies (3)

**Pattern Recognition Service**: `server/services/pattern-recognizer.ts` (601 lines, Directive 10.2 LOCKED)

Pattern recognition is the **detection service** — it identifies candlestick formations in OHLCV data. The 3 pattern **strategies** are specific trading strategies that USE pattern detection as their primary entry signal.

### B79.0n.PATTERN-DETECT (2026-05-24) — REQUIRED-`assetClass` discipline

Per Sub-batch 6 of 18 in the B79.0n umbrella v4 arc, every entry point into the pattern recognition subsystem now requires explicit asset-class scoping at the TypeScript signature:

- `scanPatterns(candles: Candle[], symbol: string, assetClass: AssetClass): PatternSignal[]` — third parameter REQUIRED (was a 2-arg call with `symbol: string = 'UNKNOWN'` default).
- All 6 internal detect functions (`detectPinbar`, `detectEngulfing`, `detectInsideBar`, `detectThreeSoldiers`, `detectMorningStar`, `detectABCD`) gain `assetClass: AssetClass` as their last parameter. Body branching: NONE — plumbing-only.
- `patternToTradeSignal(pattern, currentPrice, atr, assetClass)` gains REQUIRED `assetClass` (and `atr` is now REQUIRED — the prior `atr: number = 0` default was removed; class-method wrapper bridges `atr: number | undefined → atr ?? 0`).
- `PatternRecognizerService` class methods mirror REQUIRED-`assetClass` discipline.
- `selectContextAwareStrategy(regime, detectedPattern, symbolHash, assetClass)` gains REQUIRED `assetClass` 4th parameter; body unchanged (still operates on `CANONICAL_REGIME_STRATEGY_MAP[regime]`).

The 11 hardcoded detect-function thresholds remain inline literals — they are byte-identical to pre-B79.0n.PATTERN-DETECT crypto behavior. Per-class numeric tuning of these thresholds is deferred to a Layer-3 batch once xStock shadow-mode evidence is available. PATTERN-DETECT plumbs `assetClass` through; downstream branching is a future evidence-gated decision.

`PATTERN_TO_CANONICAL` map + `normalizePatternToCanonical` function are **class-invariant by construction** (a PINBAR is a PINBAR regardless of asset class) and MUST NOT gain `assetClass` parameters. F-1 invariance regression-locked in `b79-0n-pattern-detect-f1-invariance.test.ts`.

### 6 Canonical Patterns (Detection Layer)

| Pattern | Detection Logic | Direction | Base Strength |
|---------|----------------|-----------|---------------|
| **PINBAR** | Wick > 1.5× body (B54: relaxed from 2× for crypto), wick > 2× opposite wick | BUY or SELL | 0.6 + wick ratio |
| **ENGULFING** | Body fully engulfs prior body | BUY or SELL | 0.65 + engulf ratio + volume bonus |
| **MORNING_STAR** | Bear (body/range > 0.3, B54: relaxed from 0.4) → Doji → Bull, close > midpoint of bear | BUY only | 0.7 + recovery + gap bonus |
| **INSIDE_BAR** | High < prevHigh AND Low > prevLow (B54: 0.1% tolerance) — promoted to canonical Batch 19F (was mapped to ENGULFING) | Based on parent | 0.6 + compression |
| **THREE_SOLDIERS** → mapped to MORNING_STAR | 3 consecutive bullish, each closing higher (B54: 0.25% opens-in-body tolerance) | BUY only | 0.75 + total gain |
| **ABCD** | A-B-C-D harmonic measured move; BC retrace 0.350-0.820 of AB leg (B53: widened from classical Fib 0.382-0.786); min 12 candles | BUY only | 0.6 + golden ratio quality |

Timeframe weighting: 1h = 1.0, 15m = 0.8, 5m = 0.6.

### Pattern-pool gates DB schema (post-B79.0n.PATTERN-DETECT)

`module_constants.pattern_pool_gates.<asset_class>.*` rows govern pattern-pool admission + RSI bounds + guardrails. Naming converged across asset classes by B79.0n.PATTERN-DETECT (2026-05-24) — previously crypto_spot used `pattern_*` names and xstock_spot used different short names; that F-2 lever drift bug was closed via migration `2026-05-24b-b79-0n-pattern-detect-naming-converge.sql`.

| Constant | crypto_spot | xstock_spot | Resolver site |
|---|---|---|---|
| `pattern_final_score_min` | 0.45 | 0.45 | `<class>/pattern-pool-filters.ts` getter `FINAL_SCORE_FLOOR` |
| `pattern_max_position_pct` | 0.15 | 0.50 | `<class>/pattern-pool-filters.ts` getter `MAX_POSITION_PCT` |
| `pattern_rsi_min` | 15 | 15 | `<class>/pattern-pool-filters.ts` getter `RSI_MIN` |
| `pattern_rsi_max` | 85 | 85 | `<class>/pattern-pool-filters.ts` getter `RSI_MAX` |

**Per-class scoping discipline**: scoping belongs on the `asset_class` column, not on the `constant_name` column. Same semantic lever uses the SAME constant_name across asset classes; the resolver-key's `assetClass` field is what differentiates.

xstock pattern_max_position_pct is elevated to 0.50 (vs crypto 0.15) per B79.0m.b2 design — pattern-pool relaxations on xstock are by intentional design, not configuration drift.

### 4.1 Morning Star / Evening Star
**Canonical Regime**: BULL_STABLE, TRANSITION
**Key**: `morning_star`
**Signal Type**: PATTERN
**Pattern**: MORNING_STAR
**Secondary Metrics**: 3-bar sequence, momentum flip > 0.3%

Uses the Morning Star detection from pattern-recognizer.ts. Entry on completion of the 3-bar reversal sequence. Stop/target calculated from ATR (1.5× ATR stop, 2.5× ATR target).

### 4.2 Support Bounce
**Canonical Regime**: LOW_VOL_CHOP
**Key**: `support_bounce`
**Signal Type**: PATTERN
**Pattern**: PINBAR
**Secondary Metrics**: Price ≈ Local Min ± 1σ, Volume > 1.2× avg

Uses Pinbar detection near identified support levels. Requires price to be at or near a local minimum with volume confirmation.

### 4.3 Inside Bar Reversal
**Canonical Regime**: BEAR_VOLATILE
**Key**: `inside_bar_reversal`
**Signal Type**: PATTERN
**Pattern**: ENGULFING (canonical mapping)
**Secondary Metrics**: Parent > Child × 1.3, Breakout Volume > 1.5× avg

Uses Inside Bar / Engulfing detection in bearish volatile conditions. Looks for compression setups that break out with volume.

---

## 5. HYBRID Strategies (5)

**Hybrid Integration Service**: `server/services/hybrid-integration.ts` (239 lines, Directive 10.4)

Hybrid strategies are the confluence layer — they require BOTH a quant indicator condition AND a pattern formation to trigger. The Hybrid Integration Service is the "Intelligent Referee" that merges these signals.

### Ensemble Score Formula

```
HybridScore = quantConf × 0.4 + patternStrength × 0.4 + mlConf × 0.2
```

Minimum score: 0.65. Pattern decay: `effectiveStrength = strength × e^(-0.15 × Δt_candles)` with floor at 30%.

### 5.1 Pivot Shift
**Canonical Regime**: BULL_STABLE, TRANSITION
**Key**: `pivot_shift`
**Pattern**: MORNING_STAR
**Secondary Metrics**: RSI 45–55, ADX slope > 0.5

Quant confluence + Morning Star pattern at regime pivot points. Cross-regime strategy.

### 5.2 Reverse Impulse
**Canonical Regime**: BEAR_VOLATILE
**Key**: `reverse_impulse`
**Pattern**: PINBAR
**Secondary Metrics**: Volume > 1.5× avg, Momentum spike < −0.5%

Quant momentum reversal + Pinbar formation in bearish conditions.

### 5.3 Defensive Hedge
**Canonical Regime**: BEAR_VOLATILE
**Key**: `defensive_hedge`
**Pattern**: ENGULFING
**Secondary Metrics**: BTC Corr < 0.3, Vol Offset > 1σ

Quant decorrelation signal + Engulfing pattern. Defensive positioning when asset is decoupled from BTC.

### 5.4 Adaptive Flow
**Canonical Regime**: LOW_VOL_CHOP
**Key**: `adaptive_flow`
**Pattern**: TRI_STAR
**Secondary Metrics**: Momentum inversion ≥ 3, Volatility percentile > 70%

Quant flow analysis + Tri-Star/Doji pattern in sideways markets.

### 5.5 Volatility Edge
**Canonical Regime**: HIGH_VOL_IMPULSE
**Key**: `volatility_edge`
**Pattern**: ABCD
**Secondary Metrics**: Volatility Percentile > 80, Regime mismatch = True

Quant volatility breakout + ABCD pattern confirmation. Exploits volatility expansion.

### ⚠️ Current State: Hybrid Strategy Types in hybrid-integration.ts Are Legacy

The `selectHybridStrategy()` method in hybrid-integration.ts currently maps to legacy types: H1_TREND_SNIPER, H2_SLINGSHOT, H3_GATECRASHER, H4_MOMENTUM_LINK. These do NOT match the canonical hybrid strategies (pivot_shift, reverse_impulse, defensive_hedge, adaptive_flow, volatility_edge). This mapping must be updated when DSS is rewired to the canonical map.

---

## 6. Strategy Filters (Shared Detection Library)

**File**: `server/services/strategy-filters.ts` (406 lines)
**Status**: ACTIVE — used by multiple strategies

| Filter | Used By | Purpose |
|--------|---------|---------|
| `detectRange()` | Breakout, Range Trading, Liquidity Trap | Find bounded price movements |
| `detectStopZone()` | Liquidity Trap | Identify stop-loss cluster levels |
| `isNearRoundNumber()` | General | Psychological price level proximity |
| `isConsolidating()` | Range Trading, Mean Reversion | Distinguish trending from ranging |

---

## 7. Drift Detection & Auto-Recalibration

**File**: `server/services/drift-detector.ts` (457 lines)
**Directive**: 8.8.4-L11
**Status**: ACTIVE-LOCKED

Monitors calibration parameter drift (α, β, σ) per strategy:

```
DriftScore = 0.6 × |Δβ| + 0.2 × |Δα| + 0.2 × |σ/σ_baseline - 1|
```

| Score | Status | Action |
|-------|--------|--------|
| < 0.15 | Stable | No action |
| 0.15 - 0.25 | Drifting | Warning + event log |
| > 0.25 | Recalibrating | Auto-recalibration via POST to localhost:5001 |

Check cycle: every 15 minutes. History: 10-snapshot rolling window. Persistence: disk-based JSON + event logs. Respects `retrainingFreezeController`.

---

## 8. Strategy Features (Enhancement Layer)

**File**: `server/services/strategy-features.ts` (371 lines)
**Directive**: REB 2.12D Part C
**Status**: ACTIVE

Three confidence adjustments applied to signals:

| Feature | Adjustment | Source |
|---------|-----------|--------|
| Multi-Timeframe Confirmation | ±10% | SMA5/SMA10 on 15m, 1h timeframes |
| Liquidity Factor | 0.8× penalty if score < 0.3 | Volume 24h, spread bps, depth |
| Volatility Weight | −10% to +5% | Realized vol regime (low/normal/high/extreme) |

---

## 9. Support Infrastructure

### Strategy Validator (509 lines)
Synthetic testing engine — generates test price patterns and validates strategy signal generation.

### Strategy Validators (149 lines)
Zod schema definitions for all 8 core strategy parameter sets with runtime bounds validation.

### Strategy Analytics (263 lines)
Per-strategy performance metrics: cumulative P/L, rolling Sharpe (7-day), max drawdown, win rate, trade frequency.

### Strategy Alerts (188 lines)
Event logging with severity levels (INFO/WARNING/CRITICAL). In-memory buffer, max 1000 alerts.

### Strategy Sync (111 lines)
Ensures all core strategies exist in strategy_settings on startup. ~~**Note**: Currently syncs only the 8 quant strategies — does NOT include pattern or hybrid strategies. Must be updated when canonical map is wired.~~ **Updated** (Directive 12.3.2, Batch 13): Now syncs all 17 canonical strategies (9 quant + 3 pattern + 5 hybrid).

### Strategy Signal Audit Engine (160 lines)
**⚠️ LEGACY**: Recomputes NGC/CWQI/DI using stale formulas that don't match the pipeline. Since NGC is legacy (Kyle-confirmed), this engine's purpose is questionable. See CHANGES_AND_FIXES.md RISK-011.

### Provenance Governance (564 lines)
Daily governance reporting: data freshness, provenance coverage, schema binding validation, learning alignment metrics.

### Pattern Recognition Preloader (66 lines)
VTS warm-up preloader — ensures pattern detection is initialized with ≥2000 candles before simulation.

---

## 10. Exit Condition Engine

**File**: `server/services/strategy-engine.ts`, `checkExitConditions()` method

| Strategy | Additional Exit Condition |
|----------|--------------------------|
| vwap_pullback | Price closes below current VWAP |
| abcd_long | Price drops 0.5% below entry |
| sma_trend_ride | Price closes below current SMA |
| breakout | Price closes below breakout level × 0.995 |
| mean_reversion | None (stop/target only) |
| range_trading | Price breaks above resistance × 1.002 |
| vwap_bounce | Price closes below current VWAP |
| liquidity_trap | Price goes above trap level × 1.002 |

**Note**: Exit logic currently only covers the 8 quant strategies. Pattern and hybrid strategies do not have strategy-specific exit conditions — they rely on stop/target only.

---

## Critical Findings

### BUG-006: DSS Uses Legacy SYSTEM_GUARDS.STRATEGY_MAP Instead of Canonical Map

**Location**: `server/services/dynamic-strategy-selector.ts` (line 180)
**Severity**: CRITICAL
**Problem**: DSS imports `SYSTEM_GUARDS.STRATEGY_MAP` — a legacy 6-regime / 9-quant-only map. The canonical source of truth (`canonical-regime-strategy-map.ts`, Directive 11.7F) defines 5 regimes and 17 strategies (9 quant + 3 pattern + 5 hybrid) but is NOT wired to DSS runtime.

**Consequences**:
- Pattern strategies (morning_star, support_bounce, inside_bar_reversal) are never generated
- Hybrid strategies (pivot_shift, reverse_impulse, defensive_hedge, adaptive_flow, volatility_edge) are never generated
- Only QUANT signals flow through the trading pipeline
- Regime classification uses wrong model (6 legacy regimes vs 5 canonical)
- Per-regime riskMultiplier and minConfidence from canonical map are not applied

**Fix**: Rewire DSS to import from `canonical-regime-strategy-map.ts`:
1. Replace `SYSTEM_GUARDS.STRATEGY_MAP` import with `CANONICAL_REGIME_STRATEGY_MAP`
2. Update regime classification to use canonical thresholds (momentum + ADX + volatility)
3. Use `selectContextAwareStrategy()` for pattern-aware routing
4. Apply canonical `riskMultiplier` and `minConfidence` per regime
5. Remove EXTREME_NOISE as a regime — canonical model uses HIGH_VOL_IMPULSE for high volatility

**Timing**: Pre-MCE — this is a foundational routing fix, not dependent on MCE.

### BUG-007: Hybrid Strategy Types in hybrid-integration.ts Are Legacy

**Location**: `server/services/hybrid-integration.ts`, `selectHybridStrategy()` method
**Severity**: HIGH
**Problem**: The method maps to legacy types (H1_TREND_SNIPER, H2_SLINGSHOT, H3_GATECRASHER, H4_MOMENTUM_LINK) that don't exist in the canonical map. The canonical hybrids are: pivot_shift, reverse_impulse, defensive_hedge, adaptive_flow, volatility_edge.
**Fix**: Replace `selectHybridStrategy()` with canonical hybrid selection logic.
**Timing**: Concurrent with BUG-006 fix.

### RISK-011: Strategy Signal Audit Engine Uses Stale Metric Definitions

**Severity**: MEDIUM
**Problem**: Recomputes NGC/CWQI/DI using simplified formulas that don't match pipeline. NGC is legacy.
**Timing**: During MCE — remove or rebuild.

### RISK-012: Static Confidence Values Reduce FinalScore Discrimination

**Severity**: LOW
**Problem**: 7 of 9 quant strategies return hardcoded confidence (0.65–0.75). Only VWAP Pullback and DHMA produce variable confidence.
**Timing**: Post-MCE enhancement.

### RISK-013: Oversimplified Bullish Reversal Detection

**Severity**: LOW
**Problem**: Volume check is `volume > 0` — trivially true.
**Fix**: Compare volume to 1.5× average.
**Timing**: Pre-MCE (simple fix).

### RISK-014: Strategy Sync Only Covers 8 Quant Strategies

**Severity**: MEDIUM
**Problem**: `strategy-sync.ts` CORE_STRATEGIES list only includes 8 quant strategies. When canonical map is wired, the sync must include all 17 strategies (9 quant + 3 pattern + 5 hybrid).
**Fix**: Update CORE_STRATEGIES to match `getAllCanonicalStrategies()` from canonical map.
**Timing**: Concurrent with BUG-006 fix.

### RISK-015: strategy_key Mismatch: `range_trading` vs `range_trade`

**Severity**: LOW
**Problem**: Strategy engine uses `range_trading` as the strategy key, but canonical map uses `range_trade`. This mismatch could cause routing failures when canonical map is wired.
**Fix**: Reconcile naming — either update strategy engine or canonical map to use consistent key.
**Timing**: Concurrent with BUG-006 fix.

### BUG-008: Four Parallel Regime Classification Systems With No Cross-Reference

**Severity**: CRITICAL
**Locations**: `dynamic-strategy-selector.ts` (Engine 1), `market-regime.ts` (Engines 2 & 3), `market-profiler.ts` + `adaptive-regime.ts` (Engine 4)
**Problem**: Four independent regime classification systems use three naming conventions (legacy 6-regime, canonical 5-regime, T1-C1 taxonomy) with zero cross-referencing. VTS learns from Engine #2 while active trading uses Engine #1. Engine #4 (MCP/ARE) feeds 14+ services with its own strategy mix matrix that doesn't reference the canonical map. The system cannot agree on what market conditions it's trading in.
**Fix**: See "Recommended Regime Architecture" section above. Engine #2 (`calculatePairRegime`) becomes pair-level authority. Engine #4 (MCP) continues at market-level scope. Engine #1 (DSS legacy) is removed. Engine #3 (Z-Score) preserved for ML. A formal cross-reference mapping between T1-C1 and canonical 5-regime names should be created.
**Timing**: Pre-MCE — resolve regime authority BEFORE wiring canonical map.

### RISK-016: MCP/ARE Legacy System Creates Parallel Strategy Authority (Kyle Confirmed Legacy)

**Severity**: HIGH
**Location**: `server/services/market-profiler.ts`, `server/services/adaptive-regime.ts`
**Problem**: MCP/ARE operates as a parallel regime-to-strategy system — a predecessor that was never decommissioned when the canonical map and DSS were built to replace it. Its strategy mix matrix, exposure/risk multipliers, and regime classifications all operate independently of and unaligned with the canonical system.
**Kyle Decision (2026-02-16)**: MCP/ARE is LEGACY. Must be removed entirely. 14+ consumer services must be migrated.
**Timing**: During/after MCE (Wave 6).

### RISK-019: MCP Uses Stubbed Metrics (Further Evidence of Legacy Status)

**Severity**: HIGH
**Location**: `server/services/market-profiler.ts`, `classifyRegime()` method
**Problem**: `volume_z = 0` and `correlation = 0.5` are hardcoded stubs — never computed from market data. The system was locked before implementation was finished. 2 of 5 input dimensions carry phantom values, creating false regime confidence for 14+ downstream services.
**Fix**: Remove MCP/ARE entirely (Kyle-confirmed legacy). Do NOT invest in fixing stubbed metrics for a system being removed.
**Timing**: During Wave 6 (MCP/ARE removal).

### RISK-020: MCP/ARE Is Legacy Predecessor, Never Decommissioned (Kyle Confirmed)

**Severity**: HIGH
**Location**: `server/services/market-profiler.ts`, `server/services/adaptive-regime.ts`
**Historical Context**: Built Dec 27, 2025 under Directive 8.8.4-L12. Immediately locked. Canonical regime map (Jan 2026, Directive 11.7F) and DSS built to replace it. Lock made MCP/ARE invisible during architectural discussions. Left running in background feeding 14+ services while newer systems were built alongside it.
**Kyle Decision (2026-02-16)**: It was never the intention to have two systems creating signals and making adjustments to signal generation. MCP/ARE must be removed.
**Timing**: During/after MCE (Wave 6) — DANGEROUS due to 14+ active importers.

### RISK-017: Bridge JSON Staleness Risk

**Severity**: MEDIUM
**Location**: `bridge/canonical/mapping-regime-strategy.json` + `server/core/strategy-mapper.ts`
**Problem**: `mapping-regime-strategy.json` is generated by `sync-canonical-bridge.ts` from the canonical TS map. If the TS map is updated but the bridge sync script is not re-run, `strategy-mapper.ts` (which imports the JSON) serves stale data at runtime. No automated staleness check exists.
**Fix**: Either (a) add a hash/version comparison check at startup that warns if JSON is stale, or (b) have `strategy-mapper.ts` import directly from the TS file instead of JSON.
**Timing**: Concurrent with BUG-006 fix.

### RISK-018: Drift Detector Has No Calibration Baselines for Pattern/Hybrid Strategies

**Severity**: MEDIUM
**Location**: `server/services/drift-detector.ts`
**Problem**: Drift detector monitors α/β/σ calibration drift per strategy using a 10-snapshot rolling window. When canonical map is wired and 8 new strategies (3 pattern + 5 hybrid) start generating signals, the drift detector will have no historical baselines for these strategies. First drift check will either error, skip them, or report all as drifted (depending on null handling).
**Fix**: Initialize baseline snapshots for new strategies during the canonical wiring deployment. Consider a warm-up period where drift detection is advisory-only for newly added strategies.
**Timing**: Concurrent with BUG-006 fix.

---

## Active Files Documented

| File | Lines | Purpose | Status |
|------|-------|---------|--------|
| canonical-regime-strategy-map.ts | 680 | SSOT: 5 regimes, 17 strategies | DEFINED (not wired to DSS) |
| market-regime.ts | — | Engines #2 & #3: calculatePairRegime + getNormalizedRegime | ACTIVE (VTS only) |
| market-profiler.ts | — | Engine #4: MCP Market Condition Profiler (T1-C1) | LEGACY — Kyle confirmed, remove (Wave 6) |
| adaptive-regime.ts | — | Engine #4: ARE strategy mix + exposure multipliers | LEGACY — Kyle confirmed, remove (Wave 6) |
| mapping-regime-strategy.json | 42 | Bridge copy of canonical map | ACTIVE (staleness risk) |
| strategy-mapper.ts | 50 | Canonical enforcement layer | ACTIVE |
| dynamic-strategy-selector.ts | 214 | Engine #1: legacy regime classification + routing | LEGACY (must replace) |
| strategy-engine.ts | 999 | 8 core quant strategies | ACTIVE |
| ~~dhma.ts~~ | ~~657~~ | DHMA microstructure strategy (standalone module) | **DELETED** (Directive 12.2.1) — DHMA runs via strategy-engine.ts:detectDHMA() |
| pattern-recognizer.ts | 481 | 5 candlestick pattern detectors | ACTIVE-LOCKED |
| pattern-recognition.ts | 66 | Pattern preloader for VTS | ACTIVE |
| hybrid-integration.ts | 239 | Quant+Pattern confluence scoring | ACTIVE (legacy hybrid types) |
| strategy-filters.ts | 406 | Reusable detection filters | ACTIVE |
| drift-detector.ts | 457 | Calibration drift monitoring | ACTIVE-LOCKED |
| strategy-features.ts | 371 | MTF/liquidity/volatility enhancement | ACTIVE |
| strategy-validator.ts | 509 | Synthetic testing engine | ACTIVE |
| strategy-validators.ts | 149 | Zod parameter schema validation | ACTIVE |
| strategy-analytics.ts | 263 | Performance metrics | ACTIVE |
| strategy-alerts.ts | 188 | Event logging | ACTIVE |
| strategy-sync.ts | 111 | Strategy initialization (quant only) | ACTIVE (incomplete) |
| strategy-signal-audit-engine.ts | 160 | Signal metric verification | LEGACY |
| provenance-governance.ts | 564 | Governance reporting | ACTIVE |

**Total**: 22 files (~6,606+ lines for strategy files, plus regime engine files)

---

### Revision History

| Date | Version | Change | Trigger |
|------|---------|--------|---------|
| 2026-02-15 | v1 | Initial deep-dive | Phase 2 audit |
| 2026-02-16 | v2 | Complete rewrite: canonical map as SSOT, legacy DSS flagged as BUG-006, pattern/hybrid strategies documented as first-class, legacy hybrid types flagged as BUG-007 | Kyle review corrections |
| 2026-02-16 | v3 | Regime authority expansion: identified 4th regime engine (MCP/ARE), documented all 4 engines with consumers, added regime authority recommendation, added BUG-008/RISK-016/RISK-017/RISK-018, clarified BUG-006 fix path (use calculatePairRegime directly), verified ChatGPT's mlConf/NGC claim was incorrect | ChatGPT/Replit feedback incorporation |
| 2026-02-16 | v3.1 | MCP/ARE identified as legacy predecessor: stubbed metrics (RISK-019), pre-canonical design (RISK-020), parallel strategy authority (RISK-016). Initial decision was surgical re-scope. | ChatGPT MCP/ARE deep analysis |
| 2026-02-16 | v3.2 | MCP/ARE reclassified as LEGACY for full removal (Kyle confirmed). Engine 4 status changed from RE-SCOPE to REMOVE. Recommended architecture updated: Layer 2 changed from MCP re-scope to MCP removal + portfolio modulation absorbed by MCE. All RISK-016/019/020 updated to reflect removal not re-scope. Wave 6 in deprecation plan updated to full removal. | Kyle decision + Replit historical analysis |

---

*End of Phase 2: Strategy Deep-Dives — Version 3*


---

# Chapter 3: Market Scanning & Pair Management

> **🔶 B-4.6-B (2026-06-12) — THE SCAN LOOPS YIELD COOPERATIVELY; THE SWEEP NO LONGER STALLS THE EVENT LOOP.** Two structural facts every scan-touching batch must respect: (1) **Mechanism:** on warm cycles the loops' per-pair `await`s resolve from caches and yield only to the MICROTASK queue — timers and I/O never run — so contiguous sync work used to accumulate into a 200-700ms event-loop stall once per 30s sweep (the 2026-06-09 cron-miss source). Since chunk B, a `ScanYielder` (scan-yield.ts) inserts elapsed-gated (20ms) `setImmediate` macrotask yields at **pair/batch boundaries ONLY — never inside a single pair's compute span** (the granularity lock; a mid-pair yield would split read-coherence spans and is NOT covered by the batch's shared-state analysis — see SIM). Loops covered: crypto prefetch (batch-of-10), xstock DBS pre-loop + eval loop, vts EVAL loop (the resolve loop is deliberately yield-free). (2) **The dominant stall was not compute:** the Batch-44 diagnostics disk layer (20-30MB sync rewrite every cycle) was the interval-max source and was DELETED as legacy (Kyle ruling — no consumer existed; scan diagnostics are now in-memory only, restart-volatile). Standing tripwire: the scan-stall instrument's 50ms watchdog logs `[4.6B][STALL]` with wall-clock bounds for ANY ≥150ms block — bracket it against out.log neighbors to attribute future stalls (the method that found the Batch-44 writer). Acceptance baseline on file in FIX-2026-06-12-C (pre: every interval stalled 229-574ms, ~120 events/h; post: ~8 scattered events/h, p50 191ms, p99 worst 26.61ms — the residual family is #225).

> **🔶 B-4.7 (2026-06-11) — REGIME IS PER-ASSET-CLASS.** Everywhere this manual says "global regime" or "dominant regime," read it PER CLASS since B-4.7: the mixed-class majority votes (MCE cache-wide + telemetry-aggregator) were DELETED and replaced by `getDominantRegimeForClass(assetClass)` — majority vote over same-class entries only, MIN 5 pairs, **null below threshold = CLASS_IDLE** (weekend boundary Fri-close→Sun-open, US market holidays, cold-start warmup; xStocks trade 24/5, so idle is NOT nightly). `getMarketIndicators(assetClass)` is REQUIRED-arg and carries `voteStatus: LIVE | IDLE_OR_WARMING` (last-known regime is served WITH the flag — never silently stale). Per-class friction (no cross-class fallback; crypto keeps the static TOP-100 list; an unsampled class reports null/NO_SAMPLE — the synthetic 25 default is gone), per-class DBS routing (crypto = computeGlobalBias, xstock = xstockDirectionalBiasStore), per-class transition events (`[class]`-labeled; idle suppresses; resume RE-SEEDS silently — no false Sunday-reopen flips; the friction tracker keeps its OWN idle flag). VTS stamps `globalRegime`/`globalFriction`/`globalDirectionalBias(Score)` from the trade's OWN class at OPEN, preserved at close (re-resolution removed); vts calibration epoch → 3 at the chunk-A deploy. **The canonical regime→strategy map is per-class at the SOURCE (#163):** authored base (private) + ASSET_CLASS_OVERRIDES materialize per-class trees; `CANONICAL_REGIME_STRATEGY_MAP[assetClass][regime]`; strategy-list helpers take REQUIRED assetClass; regime METRICS (riskMultiplier/minConfidence) stay class-free by construction. **Two-surface override semantics:** `excludeStrategies` = class-INELIGIBLE (out of the eval tree — orb for crypto, defensive_hedge for xstock HVU); `favoredListExcludes` = lane-routed strategies (strong_bull_trend) that stay IN the eval tree but are subtracted from the bridge's favoredStrategies derivation — the bridge JSON is byte-identical to pre-B-4.7 while the eval loop keeps the quant-strong_trend lane. Canonical-identity validation = base ∪ class trees (historical combinations stay valid).

## Overview

This section documents how trading pairs enter the DawnTrader system — from the initial scan of Kraken's full asset universe, through multi-stage filtering, into the Active Filter Pool, and ultimately to the Signal Orchestrator for strategy evaluation. The scanning pipeline is the system's "intake valve": it determines which pairs are eligible for signal generation on every 30-second cycle.

**Key principle**: The scanner runs continuously, but the Active Filter Pool is only populated when the trading engine is active. In passive learning mode, pairs are scanned for data collection (IMF metrics, cost cache) but never enter the pool.

---

## 1. Architecture Overview: The Scanning Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     MARKET SCANNING PIPELINE (30-second cycle)              │
└─────────────────────────────────────────────────────────────────────────────┘

CENTRAL CLOCK (1-second ticks)
    │ (every 30 ticks = 30 seconds)
    ▼
FX5 SCANNER (fx5-scanner.ts)
    │ Calls ──▶ collectAdaptiveBatch() (market-scanner.ts)
    │              │
    │              ├─ STEP 1: Fetch Kraken Universe
    │              │   └─ getTicker() + getTradablePairs() → all pairs
    │              │
    │              ├─ STEP 2: Adaptive Batch Selection
    │              │   └─ AdaptiveScanManager.getNextScanBatch()
    │              │       ├─ TelemetryAggregator → top performers (Ideal pool)
    │              │       ├─ Kraken universe remainder → exploration (Rotational pool)
    │              │       ├─ AdaptiveRatioManager → dynamic Ideal/Rotational split
    │              │       └─ PairFailureTracker → cooldown exclusions
    │              │
    │              ├─ STEP 3: Build 100-Pair Batch
    │              │   ├─ Pool type tracking (ideal/rotational)
    │              │   ├─ Benchmark injection (BTC/ETH/SOL)
    │              │   ├─ Cost cache population (spread data for ALL pairs)
    │              │   └─ M64 underflow protection (if ideal < target, expand rotational)
    │              │
    │              └─ STEP 4: FX5 Filter Pipeline
    │                  ├─ Already active check (dedup with pool + open trades)
    │                  ├─ Stablecoin filter (strict Base/Quote regex)
    │                  ├─ Volume filter (min volume threshold)
    │                  ├─ Price filter (min price threshold)
    │                  ├─ Spread filter (max bid-ask spread)
    │                  ├─ History filter (min trading days, async Kraken OHLC)
    │                  └─ Benchmark exemption (passive learning mode only)
    │
    ▼ Survivors (passed all filters)
FX5 SCANNER POST-PROCESSING
    ├─ Classify survivors: volume class (SMALL/MID/LARGE)
    ├─ Compute core metrics: LQ, DI, VolNoise, Sigma
    ├─ Apply IMF metric filter (LQ ≥ threshold, VN ≤ threshold)
    ├─ Benchmark bypass (volatility/boring filters)
    │
    ├─── IF Engine ACTIVE ──▶ Active Filter Pool (5-min TTL, deduped)
    │                            └─ Survivors available for Signal Orchestrator
    │
    ├─── IF Engine STOPPED ─▶ Pool cleared (passive learning mode)
    │                            └─ IMF metrics still persisted
    │
    ├─ Update Stage-3 Cache (cycle metrics, pool snapshot)
    ├─ Emit WebSocket events (scan_tick, scanner_breakdown)
    ├─ Record 24h window metrics (FX5-24h-window.ts)
    ├─ Update current scan batch (for VTS consumption)
    └─ Capture to DataAggregator (async, non-blocking)

FEEDBACK LOOP
    TelemetryAggregator ◀── VTS trade outcomes (M70: only VTS writes)
        │
        ▼
    AdaptiveRatioManager → adjusts Ideal/Rotational ratio for next cycle
        │
        ▼
    AdaptiveScanManager → uses new ratio for next batch construction
```

### System Invariants

| ID | Invariant | Enforced By |
|----|-----------|-------------|
| M27 | AdaptiveScanManager is the sole batch generator | Code structure — `collectAdaptiveBatch()` is the only batch function |
| M29 | Batch size = 300 pairs; default split = 60% Ideal / 40% Rotational | `SCANNER_PARAMS.BATCH_SIZE = 300` + `AdaptiveRatioManager` (Batch 18 — increased from 100) |
| M31 | Scan cycle runtime ≤ 30 seconds | 25-second timeout + runtime warning |
| M64 | Underflow protection — batch always totals 300 | If Ideal < target, Rotational expands to compensate (Batch 18 — was 100) |
| M65 | Initialization guard with retry | `getNextScanBatch()` retries if batch < 300 (Batch 18 — was 100) |
| M70 | Only VTS writes telemetry | Guard in TelemetryAggregator rejects non-VTS callers |

---

## 2. Central Clock

**File**: `server/services/central-clock.ts`
**Directive**: 8.8.4-A4.R10R-4 (LOCKED MODULE)
**Status**: ACTIVE

The Central Clock is a 1-second tick source that synchronizes all time-dependent subsystems. It emits `ClockTick` events with a monotonic tick counter, timestamp, and measured drift.

### Tick Model

```typescript
interface ClockTick {
  timestamp: number;      // Unix milliseconds
  tickNumber: number;     // Monotonic counter
  drift: number;          // Actual vs expected (ms)
}
```

### Subscribers

| Subscriber | Interval | Purpose |
|-----------|----------|---------|
| FX5 Scanner | Every 30 ticks (30s) | Trigger scan cycle |
| RTB Refresh | Every tick (1s) | Check signal TTL expiration |
| TCL (Temporal Coherence Layer) | Every tick (1s) | Check promotion timing |

### Health Monitoring

- Tracks last 60 ticks of drift history
- Reports average and max drift
- Alerts if drift exceeds 100ms

**Cross-reference**: FX5 Scanner (Section 3) subscribes to the Central Clock as its timing source. The 30-second interval is not configurable at runtime.

---

## 3. FX5 Scanner

**File**: `server/services/fx5-scanner.ts` (887 lines)
**Status**: ACTIVE — LOCKED (core scanning service)
**Singleton**: `fx5Scanner`

The FX5 Scanner is the always-on 30-second market scanner that drives pair selection. It subscribes to the Central Clock and triggers `collectAdaptiveBatch()` from `market-scanner.ts` on every 30-tick interval.

### Lifecycle

1. **Start**: Subscribes to Central Clock with 30-tick interval handler
2. **Each cycle**: Calls `this.runScanCycle(mode)` → `collectAdaptiveBatch()` → post-processing
3. **Timeout**: 25-second safety timeout per scan — if exceeded, cycle is aborted
4. **Stop**: Unsubscribes from Central Clock

### Post-Processing Pipeline (After collectAdaptiveBatch Returns)

After receiving survivors from `collectAdaptiveBatch()`, FX5 Scanner applies additional processing:

1. **Volume Classification**: Assigns each survivor to SMALL, MID, or LARGE volume class
2. **Core Metric Computation**:
   - `LQ` = Log Liquidity (from volumeUSD, tradeCount, spread)
   - `DI` = Directional Integrity (from price history)
   - `VolNoise` = Volatility Noise (from price data, clamped: VN > 2 or VN < 0 defaults to 0.6)
   - `Sigma` = Standard deviation of returns
3. **IMF Source Selection** (Directive 11.4H.6A):
   - In passive learning mode: prefer cached OHLC data from VTS (if ≥ 10 candles available)
   - Otherwise: use ticker-based calculation
   - Source is tagged (`ohlc_cache` vs `ticker`) for telemetry
4. **IMF Metric Filter**: Survivors must pass `LQ ≥ LQ_MIN` AND `VolNoise ≤ VN_MAX`
5. **Benchmark Bypass** (Directive 11.4H.6 Task 4): Benchmark symbols bypass volatility/boring rejection
6. **Active Pool Gate** (REB 2.8.7):
   - Engine ACTIVE → add to Active Filter Pool
   - Engine STOPPED → pool cleared (passive learning enforcement)

### Cost Cache Population

**Critical detail**: `setCostMetrics(symbol, { spread })` is called for every evaluated pair — not just survivors. This ensures friction scores in the cost model vary based on actual market spread data rather than cache-miss defaults (which previously caused a "50 Moderate Liquidity" artifact — Directive 11.4H.3).

### Spread Calculation Logic

```typescript
// Priority 1: Compute from ask/bid directly
spread = (ask - bid) / bid;

// Priority 2: Use pre-calculated spread (convert if percentage)
spread = s.spread > 1 ? s.spread / 100 : s.spread;

// Priority 3: Use bidAskSpread (ALWAYS percentage, divide by 100)
spread = bidAskSpread / 100;

// Default fallback: 0.001 (0.1%)
```

### VTS Integration (Directive 11.4C.1)

FX5 Scanner does NOT write to the TelemetryAggregator (M70 compliance — only VTS writes pair performance telemetry). FX5 does produce persistent data via other channels: DataAggregator captures (`FX5_SCAN`), cost cache writes, Stage-3 state cache, and WebSocket emissions. The distinction is that telemetry (pair performance scores that drive adaptive ratio) is VTS-only.

FX5 exposes `getCurrentScanBatch(mode)` which returns raw pair data:

```typescript
interface ScanBatchPair {
  symbol: string;
  pool: 'ideal' | 'rotational';
  price: number;
  volume24h: number;
  dailyRange: number;
  spread?: number;
  liquidity?: number;
  volatility?: number;
  isBenchmark?: boolean;  // Directive 11.6F: propagated for VTS filtering
}
```

VTS consumes this batch directly for signal evaluation — no telemetry intermediary.

### Diagnostic Output (Early Cycles)

The first 20 cycles produce detailed diagnostic logging including:
- Batch composition (Ideal vs Rotational counts)
- 24h cumulative metrics (unique evaluated/survived)
- Active Pool size vs Unique Survived validation
- Spread audit (first 3 cycles, 5 sample survivors)

---

## 4. Adaptive Batch Construction (collectAdaptiveBatch)

**File**: `server/services/market-scanner.ts` — `collectAdaptiveBatch()` function (lines 1085-1363)
**Directive**: 11.4C.1
**Status**: ACTIVE

This is the core batch construction function called by FX5 Scanner every 30 seconds. It replaces the legacy `collectMixedBatch()` architecture.

### 4-Step Pipeline

#### Step 1: Fetch Kraken Universe
```
Promise.all([krakenService.getTicker(), krakenService.getTradablePairs()])
→ Map each ticker to { pairName, symbol (wsname), volume24h, ticker, pairInfo }
→ Filter: only pairs with valid pairInfo
→ Result: krakenUniverseSize (typically 500+ pairs)
```

#### Step 2: Adaptive Batch from AdaptiveScanManager
```
adaptiveScanManager.getNextScanBatch(allSymbols)
→ Returns: { idealPairs[], rotationalPairs[], benchmarkPairs[], excludedPairs[], totalBatch[] }
```

#### Step 3: Build 100-Pair Batch with Pool Tracking
- Each pair tagged with `poolType: 'ideal' | 'rotational'`
- **Directive 11.4C-R2**: If batch < 100, refill from Kraken universe sorted by volume (tagged as rotational)
- **Directive 11.4H.4 Task 1**: Populate cost cache with spread data for ALL evaluated pairs (not just survivors)

#### Step 4: Apply FX5 Filter Pipeline

For each pair in the 100-pair batch:

| Filter | Check | Rejection Counter |
|--------|-------|-------------------|
| Already active | In pool or open trade? | `already_active` |
| Stablecoin | Base/Quote regex match? | `failed_stablecoin` |
| Min volume | `volume24h < minVolume`? | `failed_min_volume` |
| Min price | `currentPrice < minPrice`? | `failed_min_price` |
| Bid-ask spread | `bidAskSpread > maxBidAskSpread`? | `failed_spread` |
| History | `days < minHistoryDays`? (async) | `failed_history` |

**Stablecoin Regex** (Directive 11.4H.4 Task 3):
```
/^(USDT|USDC|DAI|PYUSD|USDE)\/(USD|EUR|USDT|USDC|DAI)$/i
```
This is strict Base/Quote matching — only excludes true stablecoin-to-stablecoin pairs. A pair like `FARTCOIN/USDC` does NOT match (correctly kept).

**Benchmark Exemption** (Directive 11.4H.4 Task 5):
In passive learning mode, benchmark pairs (BTC/USD, ETH/USD, SOL/USD, XBT/USD, BTC/EUR, ETH/EUR) bypass ALL filters for correlation tracking. They still check for already-active duplicates.

### Filter Configuration (Default Values)

```typescript
minVolume:         1,000,000 USD
minPrice:          0.01
maxBidAskSpread:   1.00%
minHistoryDays:    30
excludeStablecoins: true
universeSize:      100
```

These values come from the screener filters stored in the database, fetched before each scan cycle.

### Return Value: BatchResult

```typescript
interface BatchResult {
  survivors: Array<{
    symbol: string;
    currentPrice: number;
    volume24h: number;
    dailyRange: number;
    fromTopN: boolean;        // Legacy compat (= poolType === 'ideal')
    poolType: 'ideal' | 'rotational';
    bidAskSpread: number;     // Directive 11.4H.3
  }>;
  evaluatedSymbols: string[];
  breakdown: { /* per-filter rejection counts */ };
  metrics: {
    evaluatedCount: number;
    eligibleCount: number;
    ineligibleCount: number;
    idealCount: number;
    rotationalCount: number;
    krakenUniverseSize: number;
  };
}
```

---

## 5. Adaptive Scan Manager

**File**: `server/services/adaptive-scan-manager.ts` (405 lines)
**Directive**: 11.4B.2-R1, 11.2 R1
**Status**: ACTIVE
**Singleton**: `getAdaptiveScanManager()` (lazy-initialized)

The Adaptive Scan Manager controls HOW the 100-pair batch is composed — how many pairs come from the Ideal pool (top performers) vs the Rotational pool (exploration candidates).

### Components

#### PairFailureTracker

Maintains a cooldown blacklist of pairs that failed filters. After a pair fails, it enters cooldown and is excluded from the next batch.

```typescript
interface FailedPairEntry {
  symbol: string;
  lastFailure: number;        // Timestamp
  consecutiveFailures: number;
  failureReason?: string;
  cooldownUntil: number;      // When cooldown expires
}
```

- **Normal cooldown**: After 1 failure
- **Extended cooldown**: After repeated consecutive failures
- **Success clears**: `recordSuccess(symbol)` removes from tracker

#### AdaptiveScanManager.getNextScanBatch()

This method builds the 100-pair batch:

1. **Get current ratio** from `AdaptiveRatioManager.getCurrentRatio()`
   - Defaults to 70/30 (Ideal/Rotational) when adaptive ratio is disabled
   - When enabled, ratio is dynamically computed from pool performance telemetry

2. **M64 Underflow Protection**:
   ```
   targetIdealCount = ceil(100 × idealRatio)
   availableIdealCount = telemetry.getAvailableIdealPoolCount()
   actualIdealCount = min(targetIdealCount, availableIdealCount)
   actualRotationalCount = 100 - actualIdealCount  // Always totals 100
   ```
   If not enough pairs exist in the Ideal pool, Rotational expands to fill.

3. **Fetch pools**:
   - Ideal: `telemetry.getTopPairs(actualIdealCount)` — ranked by performance
   - Rotational: `telemetry.getRotationalPairs(actualRotationalCount, allPairs)` — deduplicated against Ideal

4. **Benchmark injection** (Directive 11.4H.5):
   Benchmark pairs (BTC/ETH/SOL) are force-included regardless of telemetry scores.

5. **Failure filtering**: Remove any pairs in cooldown via PairFailureTracker

6. **Retry guard** (Directive 11.4C-R2, M65):
   If `filteredBatch.length < 100` and retries < MAX_RETRIES, wait 5 seconds and retry.

#### AdaptiveScanBatch Return

```typescript
interface AdaptiveScanBatch {
  idealPairs: string[];
  rotationalPairs: string[];
  benchmarkPairs: string[];
  excludedPairs: string[];      // In cooldown
  totalBatch: string[];
  timestamp: number;
  ratioUsed: number;
  retryCount: number;
}
```

### Scan Result Recording

`recordScanResult(symbol, success, data)` — ONLY tracks pass/fail for failure cooldown management. Does NOT record telemetry (Directive 11.4C-R2: VTS is the single source of truth for telemetry).

---

## 6. Adaptive Ratio Manager

**File**: `server/services/adaptive-ratio-manager.ts` (298 lines)
**Directive**: 11.2 R1
**Status**: ACTIVE

The Adaptive Ratio Manager dynamically adjusts the Ideal/Rotational split based on which pool is producing better trade outcomes.

### Ratio Computation Algorithm

```
STEP 1: Fetch pool performance from TelemetryAggregator
        Fallback: SQL-backed telemetry-repository if insufficient in-memory data

STEP 2: Compute pool scores
        score = (winRate × 0.6) + (avgEdge × 0.4)
        where avgEdge = avgFinalScore

STEP 3: Calculate target ratio (performance-weighted)
        IF both scores zero → defaultRatio (0.7)
        IF rotational zero → maximize ideal (0.9)
        IF ideal zero → minimize ideal (0.3)
        ELSE → targetRatio = idealScore / (idealScore + rotationalScore)

STEP 4: Apply confidence adjustment
        confidence = min(1.0, totalSamples / 100)
        adjustedTarget = (targetRatio × confidence) + (defaultRatio × (1 - confidence))
        Low confidence biases toward default; high confidence trusts the data.

STEP 5: Enforce bounds [0.3, 0.9]
        Never less than 30% Ideal, never more than 90% Ideal

STEP 6: Smooth adjustment (max 0.1 per cycle)
        Prevents oscillation — ratio can only change by ±10% per scan cycle
```

### Configuration

| Parameter | Value | Meaning |
|-----------|-------|---------|
| `minIdealRatio` | 0.3 | Minimum 30% Ideal |
| `maxIdealRatio` | 0.9 | Maximum 90% Ideal |
| `defaultRatio` | 0.7 | Starting/fallback (70% Ideal) |
| `adjustmentRate` | 0.1 | Max change per cycle |
| `minSamples` | 10 | Minimum before ratio adjustment |

### Why This Matters

Without the ratio manager, the system would always use a fixed 70/30 split regardless of performance. If Ideal pool pairs consistently outperform Rotational pool pairs, the ratio manager shifts allocation toward Ideal — concentrating on what works. Conversely, if Rotational pool discovers high-performing new pairs, their representation increases.

**Cross-reference**: The pool scores (winRate, avgEdge) are computed by TelemetryAggregator (Section 10), which receives data exclusively from VTS (M70).

---

## 7. Active Filter Pool

**File**: `server/services/active-filter-pool.ts` (413 lines)
**Status**: ACTIVE
**Singleton**: `activeFilterPool`

The Active Filter Pool is the in-memory holding area for pairs that passed all filters. The Signal Orchestrator pulls from this pool when evaluating which pairs to generate signals for.

### Key Properties

| Property | Value | Purpose |
|----------|-------|---------|
| TTL | 5 minutes | Pairs expire after 5 min without refresh |
| Dedup | Strict | Non-expired symbols are SKIPPED, not refreshed |
| Modes | Separate paper/live pools | Complete data isolation |
| Gate | Engine status | Pool only populated when engine ACTIVE |

### Entry Structure

```typescript
interface ActiveFilteredPair {
  symbol: string;
  price: number;
  volume24h: number;
  dailyRange: number;
  firstSeen: string;      // ISO timestamp
  lastUpdated: string;     // ISO timestamp
  expiresAt: number;       // Unix timestamp (TTL = 5 min)
  source: 'paper' | 'live';
  fx5Snapshot?: {
    volume24h: number;
    dailyRange: number;
    price: number;
  };
}
```

### Deduplication Logic (REB 2.2)

When `addSurvivors()` is called with a new batch of survivors:

```
FOR each survivor:
  IF symbol exists in pool AND NOT expired → SKIP (do NOT refresh TTL)
  IF symbol exists in pool AND IS expired  → REPLACE with new entry (reset TTL)
  IF symbol NOT in pool                    → ADD with new TTL
```

**Design decision**: Non-expired symbols are intentionally NOT refreshed. This prevents pool churn where the same pair constantly resets its TTL. A pair enters the pool, has 5 minutes to be evaluated for signals, then must re-qualify in a future scan cycle.

**Temporal windowing effect**: Because TTL is not refreshed, a pair that continuously passes filters every 30 seconds will still expire after 5 minutes. It then re-enters on the next cycle with a fresh TTL. This creates intentional evaluation windows — a pair is eligible for exactly one 5-minute window per pool entry, regardless of how many scan cycles it survives during that window. This is by design, not a bug.

### Passive Mode Enforcement (REB 2.2)

```typescript
enforcePassiveModeIfStopped(mode, isEngineRunning):
  IF engine is stopped AND pool is not empty → clear pool
```

Called by FX5 Scanner before adding survivors. Ensures the pool is empty when the engine is not actively trading — passive learning does NOT populate the pool.

### Volume Bucketing (Phase 8.8.3-I9)

The pool provides volume classification for downstream consumers:

| Bucket | Threshold |
|--------|-----------|
| High | > $50M |
| Medium | ≥ $10M |
| Low | ≥ $1M |
| Very Low | < $1M |

**Symbol normalization**: Handles both `AVAX/USD` and `AVAXUSD` formats via quote-currency suffix detection (longest-first to prevent `USD` matching before `USDT`).

---

## 8. Benchmark Symbol Handling

**File**: `server/config/benchmark-regex.ts` (48 lines)
**Status**: ACTIVE — LOCKED

Benchmark symbols (BTC, ETH, SOL, and major stablecoins) receive special treatment throughout the scanning pipeline. The strict regex prevents misclassification (e.g., FARTCOIN being matched by a naive "contains COIN" check).

### Benchmark Assets

**Base coins**: BTC, XBT, ETH, SOL
**Stablecoins**: USDT, USDC, DAI, BUSD, TUSD
**Valid quote currencies**: USD, USDT, USDC, DAI, BUSD, EUR

### Validation

Two-tier check:
1. Regex match against the full symbol
2. Explicit Base + Quote combination validation

### Where Benchmarks Are Special

| Stage | Behavior | Directive |
|-------|----------|-----------|
| Adaptive Scan Manager | Force-included in batch regardless of telemetry scores | 11.4H.5 Task 1 |
| collectAdaptiveBatch (passive mode) | Bypass ALL filters for correlation tracking | 11.4H.4 Task 5 |
| FX5 Scanner (active mode) | Bypass volatility/boring rejection, but must still pass metric filters | 11.4H.6 Task 4 |
| VTS | Benchmark flag propagated for filtering decisions | 11.6F |

---

## 9. Kraken Symbol Resolution

**File**: `server/markets/kraken-symbol-resolver.ts`
**Directive**: 8.8.4-A4.R10R-4 (LOCKED MODULE)
**Status**: ACTIVE

Single source of truth for symbol translation between DawnTrader's internal format and Kraken's various formats.

### Symbol Formats

| Format | Example | Used By |
|--------|---------|---------|
| Internal | `AVAX/USD` | DawnTrader everywhere |
| Kraken REST | `XAVAXZUSD` | Kraken REST API |
| Kraken WebSocket | `AVAX/USD` | Kraken WS feeds |
| Compact | `AVAXUSD` | Some legacy code |

### Resolution Tiers

| Tier | Source | Trust Level |
|------|--------|-------------|
| 0 | Static map (KRAKEN_SYMBOL_MAP) | Highest — manually verified |
| 1 | Auto-map verified (matches static) | High |
| 2 | Auto-map derived (Kraken API normalization) | Medium |
| 3 | Auto-map uncertain (not safe for auto-use) | Low |

### Kraken-Specific Translations

```
BTC ↔ XBT   (Kraken uses XBT in WebSocket for Bitcoin)
```

**Cross-reference**: Used by `collectAdaptiveBatch()` for survivor symbol normalization, by `cost-cache.ts` for friction lookups, and by `market-volume-cache.ts` for Kraken REST ticker calls.

---

## 10. Telemetry Aggregator

**File**: `server/services/telemetry-aggregator.ts`
**Status**: ACTIVE

The Telemetry Aggregator collects per-pair and per-pool performance data that drives the adaptive scanning feedback loop. It provides ranked pair lists (for Ideal pool selection) and pool-level performance comparisons (for ratio adjustment).

### Per-Pair Telemetry

```typescript
{
  finalScore: number;           // Composite performance
  hybridScore: number;          // Strategy-weighted
  regimeScore: number;          // 0-100 regime-adjusted (Directive 11.4H.4A)
  regimeWeight: number;         // Market regime contribution
  predictiveConfidence: number; // Signal confidence
  successRate: number;          // Win rate
  avgDecayedStrength: number;   // Time-weighted strength
  volZ: number;                 // Volatility Z-score (50-sample rolling)
  trendZ: number;               // Momentum Z-score (50-sample rolling)
}
```

### Pool-Level Aggregates (Directive 11.2 R1)

Per pool (Ideal vs Rotational):
- `winRate` — success rate
- `sampleCount` — number of completed trades
- `avgFinalScore` — mean final score (= "avgEdge" in ratio computation)
- `lastUpdated` — timestamp

### Key Methods

| Method | Purpose | Consumer |
|--------|---------|----------|
| `getTopPairs(n)` | Return top n pairs ranked by score | AdaptiveScanManager (Ideal pool) |
| `getRotationalPairs(n, all)` | Return n exploration pairs | AdaptiveScanManager (Rotational pool) |
| `getPoolPerformanceComparison()` | Ideal vs Rotational performance | AdaptiveRatioManager |
| `getAvailableIdealPoolCount()` | Count of available Ideal pairs | M64 underflow protection |

### Write Guard (M70)

Only calls from `caller='vts'` are accepted. All other callers are rejected. This prevents FX5 Scanner, market-scanner, or any other component from contaminating telemetry data.

### Data Segregation (Directive 11.0E.2)

Simulation (paper) telemetry is kept separate from live telemetry. Source is tracked per record.

### Rolling Window

24-hour window controlled by `SCANNER_PARAMS.historyWindowMs`. Records outside the window are auto-trimmed.

---

## 11. FX5 24-Hour Window

**File**: `server/services/fx5-24h-window.ts` (343 lines)
**Status**: ACTIVE

Maintains a rolling 24-hour record of scan cycles — but ONLY for active trading cycles (not passive learning). This provides:

1. **Cycles per hour** computation (used in scan_tick WebSocket payload)
2. **Filter-level breakdown** aggregated over 24 hours
3. **Unique pair tracking** (evaluated and survived)

### Tracked Filter Types

```
volume, spread, daily_range, price, stablecoin, history,
correlation_guard, market_cap, guardrail_risk, quote_currency
```

### Key Functions

| Function | Purpose |
|----------|---------|
| `recordScanCompletion(mode, isActive)` | Only records when engine is ACTIVE (REB 2.8.5C) |
| `recordScanFor24h(mode, data, isActive)` | Records cycle metrics + filter breakdown |
| `getCyclesPerHour(mode)` | Computes from active-only recorded cycles |
| `get24hSummary(mode)` | Returns aggregate metrics for 24h window |

**Design decision**: Cycles-per-hour measures "trading activity" not "FX5 health." When the engine is stopped, cycles are not counted even though FX5 continues scanning for data collection.

---

## 12. Market Volume Cache

**File**: `server/services/market-volume-cache.ts` (241 lines)
**Status**: ACTIVE
**Singleton**: `marketVolumeCache`

Lightweight volume lookup cache used as a fallback when FX5 metadata is unavailable at order creation time.

### Cache Properties

| Property | Value |
|----------|-------|
| TTL | 5 minutes |
| Source | Kraken REST ticker (on cache miss) |
| Scope | Volume is a trade-time attribute, NOT live |

### Volume Bucketing (Phase 8.8.3-I10)

| Bucket | Threshold |
|--------|-----------|
| High | ≥ $5M |
| Medium | ≥ $500K |
| Low | ≥ $50K |
| Very Low | < $50K |

**Note**: These thresholds differ from Active Filter Pool's volume buckets ($50M/$10M/$1M). The market-volume-cache uses smaller thresholds because it's classifying individual trade-time volumes, while the Active Filter Pool classifies 24h aggregates.

---

## 13. Stage-3 State Cache and Emitter

**Files**: `server/services/stage3-state-cache.ts` (151 lines), `server/services/stage3-emitter.ts`
**Status**: ACTIVE

### Stage-3 State Cache

In-memory snapshot of the current scan cycle, providing atomic reads for the WebSocket layer and diagnostics.

```typescript
type Stage3State = {
  cycleId: number;
  scanCycleId: string;
  stateVersion?: number;        // REB 2.4: timestamp-based atomicity
  krakenUniverseSize: number;
  evaluatedCount: number;
  eligibleCount: number;
  ineligibleCount: number;
  activePoolCount: number;
  idealCount: number;
  rotationalCount: number;
  cyclesPerHour: number;
  cycleFrequencyMs: number;     // Default: 30,000ms
  nextScanInMs: number;
  activeFilteredPool: ActiveFilteredPair[];
  latestEligibleSymbols?: string[];
}
```

**Update Logic (REB 2.4)**: Shallow merge — metadata-only updates don't wipe scan data. Cycle counter only increments on full scan updates.

### Stage-3 Emitter

Emits two WebSocket event types:

1. **`scan_tick`**: Real-time cycle summary (cycle ID, universe size, evaluated/eligible counts, pool composition, timestamps)
2. **`scanner_breakdown`**: Filter diagnostic breakdown (per-filter counts for the Filter Insights widget)

Both events include a `stateVersion` for consistency tracking.

---

## 14. Data Aggregator

**File**: `server/services/data-aggregator.ts`
**Directive**: 10.0.B (LOCKED MODULE)
**Status**: ACTIVE

Non-blocking async framework for capturing signal-level, strategy-level, and market-level metrics during scanning and trading.

### Properties

| Property | Value |
|----------|-------|
| Flush interval | 30 seconds |
| Aggregate interval | 15 minutes |
| Mode detection | Auto-detects passive vs active |

### What It Captures From Scanning

```typescript
dataAggregator.capture('FX5_SCAN', {
  mode,
  pairsScanned,
  survivors,
  metricFilteredSurvivors,
  eligibleCount,
  idealCount,
  rotationalCount,
  avgDailyRange,
  isEngineActive,
  volumeStats: { SMALL, MID, LARGE }
});
```

This capture is fire-and-forget (`.catch(() => {})`) — scanning never blocks on aggregation.

---

## 15. Adaptive Pool Config (ACT)

**File**: `server/services/adaptive-pool-config.ts` (40 lines)
**Status**: ACTIVE

⚠️ **Naming clarification**: Despite the file name suggesting scanning pool configuration, this file configures the **Adaptive Concurrency Tuner (ACT)** — which controls how many signals are processed concurrently, NOT the scanning pool composition.

### Configuration

| Parameter | Value | Meaning |
|-----------|-------|---------|
| `MIN_POOL` | 3 | Minimum concurrent signal processing slots |
| `MAX_POOL` | 10 | Maximum concurrent signal processing slots |
| `TARGET_DURATION` | 5,000ms | Target processing time per signal |
| `INITIAL` | 5 | Starting concurrency level |

**Cross-reference**: The scanning pool composition (Ideal/Rotational ratio, batch size) is configured in `SCANNER_PARAMS` within `adaptive-scan-manager.ts`, NOT in this file. See Section 5.

---

## 16. ~~MarketScanner Class~~ — REMOVED (Directive 12.2.2, Batch 9)

**File**: `server/services/market-scanner.ts` — class `MarketScanner` **REMOVED** (Batch 9, commit `8b6bb540`)
**Status**: REMOVED — MarketScanner class deleted. `collectAdaptiveBatch()` and diagnostic buffers preserved. BUG-009 RESOLVED.

**ChatGPT review correction**: The initial Phase 3 audit stated this class was "believed to be disconnected from boot sequence." Code verification proves this wrong:

1. `server/routes.ts` line 87: `const marketScanner = new MarketScanner();` — **instantiated at module scope**
2. `server/routes.ts` line 371: `marketScanner.startHourlyScanning()` — **actively started during boot**
3. `server/startup.ts` lines 36, 57: Listed as core initialized service in health checks

**This means DawnTrader is running TWO parallel scanning systems simultaneously:**
- **FX5 Scanner**: 30-second cycles via `collectAdaptiveBatch()` → Active Filter Pool → Signal Orchestrator
- **MarketScanner class**: 10-minute cycles → per-user watchlists → direct StrategyEngine signal generation → database signal storage

These two scanners:
- Both call Kraken APIs (doubling API load)
- Both generate trading signals (through completely different pipelines)
- Both perform cleanup operations (potentially conflicting)
- Have no cross-referencing or coordination

**Key legacy patterns in the running MarketScanner**:
- Fetches OHLC data per-pair sequentially (vs FX5's batch approach)
- Only evaluates 8 quant strategies (not 17 canonical)
- Uses `StrategyEngine` directly instead of Signal Orchestrator pipeline
- Has its own cleanup routines (expire signals, clean stale pairs, archive old trades)
- Per-user watchlist management (legacy multi-user architecture, but still executing)
- Auto-start paper simulation (disabled: Phase 41F-L.E2E-PURGE, but class still runs)
- Conflict resolution: BEST SCORE WINS (weight × confidence ranking, 1 signal per asset)

**Removal note**: File comments state "TODO: Remove in Phase 8.12" — but removal has never been executed. This is now BUG-009.

### Diagnostic Infrastructure (REB 2.10/2.11) — API-Exposed

The same `market-scanner.ts` file also hosts extensive diagnostic buffers. These are NOT dead — they are **actively served via API routes**:

**Verified API exposure** (from `server/routes.ts`):
- `getPassiveLearningBuffer()` → served at API endpoint (line 6463)
- `getREB211DriftBuffer()` → served at API endpoint (line 6508)
- `getREB211IntegrityBuffer()` → served at API endpoint (line 6509)
- `getREB211TimingBuffer()` → served at API endpoint (line 6510)
- `getREB211MismatchBuffer()` → served at API endpoint (line 6511)
- `getREB211StressBuffer()` → served at API endpoint (line 6512)
- `getActiveAuditBuffer()` → served at API endpoint (line 6587)
- `getReb211bSymbolTraces()` → served at API endpoint (line 6607)

Additionally imported by:
- `reb-2-12-test-harness.ts` (test infrastructure)
- `reb-2-15-certification.ts` (certification suite)

**Memory consideration**: Buffers are FIFO-capped (20 entries for most, 100 for mismatches, 400 for symbol traces). Memory growth is bounded. However, the stress test mode (`REB_2_11_STRESS` env var) should never be active in production — it injects artificial latency into scan cycles.

**Decision**: These diagnostics are development/validation tools with API exposure. If the MarketScanner class is removed, these diagnostic buffers and their API routes must be evaluated for retention or migration.

---

## Active Files Summary

| File | Lines | Status | Role |
|------|-------|--------|------|
| `server/services/central-clock.ts` | ~100+ | ACTIVE (LOCKED) | 1-second tick source for all timing |
| `server/services/fx5-scanner.ts` | 887 | ACTIVE (LOCKED) | 30-second scanner, post-processing, pool gate |
| `server/services/market-scanner.ts` | 726 | ACTIVE | `collectAdaptiveBatch()` + diagnostic buffers only. MarketScanner class REMOVED (Batch 9). |
| `server/services/adaptive-scan-manager.ts` | 405 | ACTIVE | Batch composition: Ideal/Rotational pools, failure tracker |
| `server/services/adaptive-ratio-manager.ts` | 298 | ACTIVE | Dynamic pool ratio based on performance telemetry |
| `server/services/active-filter-pool.ts` | 413 | ACTIVE | In-memory 5-min TTL holding pool |
| `server/services/telemetry-aggregator.ts` | 200+ | ACTIVE | Per-pair/per-pool performance tracking, VTS-only writes |
| `server/services/fx5-24h-window.ts` | 343 | ACTIVE | 24h rolling scan metrics (active cycles only) |
| `server/services/market-volume-cache.ts` | 241 | ACTIVE | 5-min volume fallback cache |
| `server/services/stage3-state-cache.ts` | 151 | ACTIVE | In-memory scan cycle snapshot |
| `server/services/stage3-emitter.ts` | 100+ | ACTIVE | WebSocket events (scan_tick, scanner_breakdown) |
| `server/services/data-aggregator.ts` | 100+ | ACTIVE (LOCKED) | Non-blocking metric aggregation |
| `server/services/adaptive-pool-config.ts` | 40 | ACTIVE | ACT concurrency config (NOT scanning pool) |
| `server/config/benchmark-regex.ts` | 48 | ACTIVE (LOCKED) | Benchmark symbol validation |
| `server/markets/kraken-symbol-resolver.ts` | 100+ | ACTIVE (LOCKED) | Symbol format translation (SSOT) |

---

## Critical Findings (Phase 3)

### BUG-009: Two Parallel Scanning Systems Running Simultaneously
- **Severity**: CRITICAL
- **Locations**:
  - `server/services/market-scanner.ts` — `MarketScanner` class (lines 385-1013)
  - `server/routes.ts` — line 87: `const marketScanner = new MarketScanner();` (instantiated at boot)
  - `server/routes.ts` — line 371: `marketScanner.startHourlyScanning()` (actively started)
  - `server/startup.ts` — lines 36, 57: Listed as core initialized service
- **Problem**: DawnTrader runs TWO independent scanning systems simultaneously:
  1. **FX5 Scanner** (30-second cycles): `collectAdaptiveBatch()` → Active Filter Pool → Signal Orchestrator. This is the modern, adaptive, telemetry-driven pipeline.
  2. **MarketScanner class** (10-minute cycles): Kraken OHLC → direct StrategyEngine → database signal storage. This is the legacy pipeline with per-user watchlists and only 8 quant strategies.
- **Impact**:
  - **Double Kraken API load**: Both scanners call `getTicker()`, `getOHLCData()`, and other Kraken endpoints independently
  - **Conflicting signal generation**: MarketScanner generates signals through a completely different pipeline (StrategyEngine direct) than FX5/Signal Orchestrator. Signals from both systems may coexist in the database with no deconfliction.
  - **Conflicting cleanup**: MarketScanner runs its own cleanup (expire signals, clean stale pairs, archive trades). This could interfere with cleanup operations performed by the modern pipeline.
  - **Wasted computation**: 10-minute scanner evaluates pairs that FX5 already evaluates every 30 seconds, but with less sophisticated filtering (no adaptive ratio, no failure tracking, no IMF metrics)
- **Verified**: Yes — code-confirmed 2026-02-16 (ChatGPT review prompted verification)
- **Fix**: Stop instantiating MarketScanner class in `server/routes.ts`. Remove `startHourlyScanning()` call. Remove from `startup.ts` service list. The `collectAdaptiveBatch()` function in the same file must NOT be removed.
- **Status**: **RESOLVED** — Directive 12.2.2, Batch 9 (commit `8b6bb540`). Class removed, consuming files cleaned.
- **Timing**: Pre-MCE — this is a standalone fix. The legacy scanner adds API load and potential signal conflicts with zero benefit.
- **Phase Found**: Phase 3 (ChatGPT review correction)

### RISK-021: Volume Bucket Threshold Inconsistency Between Modules
- **Severity**: LOW-MEDIUM (context-dependent — LOW today if buckets are never cross-compared, but MEDIUM if risk guardrails, position sizing, UI dashboards, drift detector, or ML features ever reference bucket labels)
- **Location**: `active-filter-pool.ts` vs `market-volume-cache.ts`
- **Problem**: Two different volume bucketing schemes:
  - Active Filter Pool: High > $50M, Medium ≥ $10M, Low ≥ $1M, Very Low < $1M
  - Market Volume Cache: High ≥ $5M, Medium ≥ $500K, Low ≥ $50K, Very Low < $50K
- **Impact**: A pair classified as "High" by market-volume-cache ($5M+) would be classified as "Low" by the Active Filter Pool (which requires $50M+ for "High"). If any downstream consumer compares volume buckets across these sources, it will get inconsistent results.
- **Fix**: Consolidate to a single volume bucketing function with explicit scope parameters, or document that these serve intentionally different scopes (24h aggregate vs trade-time volume).

### RISK-022: adaptive-pool-config.ts Name Misleads About Its Purpose
- **Severity**: LOW
- **Location**: `server/services/adaptive-pool-config.ts`
- **Problem**: File name suggests scanning pool configuration (Ideal/Rotational ratio, batch size). Actual content is ACT (Adaptive Concurrency Tuner) — controls concurrent signal processing slots (3-10), completely unrelated to scanning. A developer looking for scanning pool config will find the wrong file.
- **Fix**: Rename to `act-concurrency-config.ts` or `signal-processing-pool-config.ts`. The actual scanning pool configuration is in `SCANNER_PARAMS` within `adaptive-scan-manager.ts`.

### RISK-023: Adaptive Scanning Pipeline Depends on VTS Telemetry Integrity
- **Severity**: MEDIUM
- **Location**: `adaptive-ratio-manager.ts` → `telemetry-aggregator.ts` → VTS
- **Problem**: The entire adaptive scanning feedback loop depends on VTS telemetry health. If VTS is paused, misconfigured, or data-lagged:
  - Ideal pool quality degrades (no fresh performance data to rank pairs)
  - Ratio manager biases toward `defaultRatio` (0.7) due to low confidence
  - Batch composition becomes stale — system effectively runs on fixed 70/30 split
- **Impact**: Adaptive scanning degrades gracefully (falls back to defaults), but the adaptive benefit is silently lost. There is no health check or alert when VTS telemetry stops flowing.
- **Fix**: Add telemetry freshness check — if `getPoolPerformanceComparison()` returns data older than X cycles, emit a warning. Consider adding VTS telemetry health to the system health endpoint.
- **Timing**: Pre-MCE or during MCE

### RISK-024: Cost Cache Synchronization Coupling
- **Severity**: LOW-MEDIUM
- **Location**: FX5 Scanner → `cost-cache.ts` (TTL: 5 minutes) → `cost-model.ts`
- **Problem**: FX5 writes spread data to cost cache every 30-second scan cycle. Cost cache has a 5-minute TTL. Cost model friction calculations depend on fresh cache entries. If:
  - Cost cache TTL expires between scan cycles (shouldn't happen with 30s refresh, but possible during scan errors/restarts)
  - Symbol normalization between FX5's `setCostMetrics(symbol, ...)` and cost-model's `getCostMetrics(symbol)` diverges
  Then friction scores revert to defaults, producing incorrect cost estimates.
- **Current mitigations**: 30-second scan refresh rate is much faster than 5-minute TTL, and `setCostMetrics` is called for ALL evaluated pairs (not just survivors), so cache is well-populated.
- **Fix**: Verify symbol normalization consistency between FX5's cost cache writes and cost-model's reads. Consider adding a "cache miss" metric to detect silent fallback to defaults.

### RISK-025: History Filter Sequential Async Risk
- **Severity**: LOW
- **Location**: `market-scanner.ts` `collectAdaptiveBatch()` lines 1280-1286, `kraken.ts` `getPairHistoryDays()`
- **Problem**: The history filter calls `passesHistoryFilter()` inside a sequential `for` loop over 300 pairs (Batch 18 — was 100). Each call potentially hits Kraken's REST API for daily OHLC data. While results are cached for 24 hours (`HISTORY_CACHE_TTL_MS`), the first scan cycle after restart (cold cache) makes up to 300 sequential Kraken API calls.
- **Mitigations**: Results are cached per-pair for 24 hours. On cache hit, the filter is instant. On cache miss with Kraken error, the pair conservatively fails (null = fail). After the first cycle, nearly all pairs are cached.
- **Fix**: Consider batching history checks or pre-warming the cache during boot. The M31 invariant (30-second runtime limit) already protects against unbounded latency.

### RISK-026: Symbol Resolver Tier 3 Handling
- **Severity**: LOW
- **Location**: `server/markets/kraken-symbol-resolver.ts` lines 147-152
- **Problem**: When resolving symbols for Kraken REST format, Tier 3 (uncertain) symbols are explicitly rejected: `if (entry && entry.tier <= 2)` — only Tiers 0-2 produce a mapping. Tier 3 symbols return `null`, triggering a WARN log and fallback to compact format (`symbol.replace("/","").toUpperCase()`). For WebSocket resolution, same logic applies.
- **Impact**: Tier 3 symbols are NOT silently allowed — they are rejected from precise resolution and fall back to string manipulation. This is correct behavior but means some legitimate new pairs may fail to resolve until added to the static map.
- **Risk level**: LOW — the fallback is reasonable and logged. The symbol is not silently corrupted.

---

## Cross-References to Other Phases

| This Phase | Connects To | Relationship |
|-----------|-------------|--------------|
| FX5 Scanner → Cost Cache | Phase 1: Cost Model | Spread data from scanning populates cost-model's cache for friction calculations |
| FX5 Scanner → IMF | Phase 1: IMF Metrics | LQ, VolNoise computed during scanning using IMF formulas |
| Active Filter Pool → Signal Orchestrator | Phase 4 (upcoming) | Signal Orchestrator pulls pairs from the pool for strategy evaluation |
| collectAdaptiveBatch → Screener Filters | Phase 5 (upcoming) | Filter thresholds come from database (screener_filters table) |
| TelemetryAggregator → VTS | Phase 6 (upcoming) | VTS writes telemetry; scanning reads it for adaptive ratio |
| Central Clock → Boot Sequence | Phase 7 (upcoming) | Clock starts during boot; FX5 subscribes during initialization |
| Stage-3 Emitter → WebSocket | Phase 8/9 (upcoming) | scan_tick and scanner_breakdown events drive Filter Insights widget |
| MCP/ARE consumers | Phase 2: BUG-008 | 14+ services still consume MCP regime output — none involve scanning pipeline |

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1 | 2026-02-16 | Initial Phase 3 audit: all scanning pipeline files deep-read, architecture documented, 2 risks + 2 legacy items identified |
| 1.1 | 2026-02-16 | ChatGPT review corrections: BUG-009 (two parallel scanners — CRITICAL, verified), RISK-023 (VTS telemetry dependency — MEDIUM), RISK-024 (cost cache coupling — LOW-MEDIUM), RISK-025 (history filter async — LOW), RISK-026 (Tier 3 symbol handling — LOW). RISK-021 upgraded LOW→LOW-MEDIUM. MarketScanner reclassified from "dead code" to "actively running." M70 wording clarified. Active Filter TTL windowing documented. REB diagnostics confirmed API-exposed. |

---

*Phase 3 complete. Next: Phase 4 — Guardrails, Risk, Portfolio, & Trade Safety.*


---

# Part II: Risk & Execution


---

# Chapter 4: Risk Management, Guardrails & Portfolio

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Guardrails V2 Database Layer](#2-guardrails-v2-database-layer)
3. [Coherency Rules Engine](#3-coherency-rules-engine)
4. [GuardrailPolicy Service](#4-guardrailpolicy-service)
5. [Guardrail Settings Helper](#5-guardrail-settings-helper)
6. [Trade Safety Service](#6-trade-safety-service)
7. [Pre-Execution Validator](#7-pre-execution-validator)
8. [Dynamic Sizing Engine (DSE)](#8-dynamic-sizing-engine-dse)
9. [Kill Switch Architecture](#9-kill-switch-architecture)
10. [Adaptive Guardrails Engine](#10-adaptive-guardrails-engine)
11. [Circuit Breaker](#11-circuit-breaker)
12. [GASP Coordinator](#12-gasp-coordinator)
13. [PDC Engine](#13-pdc-engine)
14. [Risk Concentration Analyzer](#14-risk-concentration-analyzer)
15. [Covariance Engine](#15-covariance-engine)
16. [Paper Portfolio Manager](#16-paper-portfolio-manager)
17. [Portfolio Aggregator](#17-portfolio-aggregator)
18. [Kraken Service](#18-kraken-service)
19. [Legacy Classification: SafetyGuardrails Service](#19-legacy-classification-safetyguardrails-service)
20. [Legacy Classification: L-Series Autonomy Cluster](#20-legacy-classification-l-series-autonomy-cluster)
21. [Cross-References](#21-cross-references)
22. [Critical Findings](#22-critical-findings)
23. [Forward Audit Standard: Parallel System Detection](#23-forward-audit-standard-parallel-system-detection)
24. [File Catalog](#24-file-catalog)

---

## 1. Architecture Overview

DawnTrader's risk management operates as a **layered defense system** with five distinct tiers:

```
TIER 1 — PRE-TRADE GUARDRAILS (prevents bad trades from executing)
  ┌─────────────────────────────────────────────────────────┐
  │  Trade Safety Service (checkGuardrailRisk)              │
  │  8 sequential checks + correlation exposure             │
  │  Pre-Execution Validator (goal alignment + fee-aware)   │
  └──────────────────────────┬──────────────────────────────┘
                             │
TIER 2 — POSITION SIZING (right-sizes trades that pass Tier 1)
  ┌──────────────────────────┴──────────────────────────────┐
  │  Dynamic Sizing Engine (DSE)                            │
  │  size = baseSize x f(edge, vol, cost, conf, pressure)  │
  │  Bounded: 0.3 <= multiplier <= 1.2                     │
  │  Risk Concentration scaling factor (0.25-1.0)          │
  └──────────────────────────┬──────────────────────────────┘
                             │
TIER 3 — PORTFOLIO PROTECTION (protects running portfolio)
  ┌──────────────────────────┴──────────────────────────────┐
  │  Kill Switch (daily loss threshold auto-shutdown)       │
  │  Covariance Guard (correlation exposure prevention)     │
  │  Paper Portfolio Manager (drawdown/exposure monitoring) │
  └──────────────────────────┬──────────────────────────────┘
                             │
TIER 4 — SYSTEM STABILITY (meta-level protection)
  ┌──────────────────────────┴──────────────────────────────┐
  │  GASP — LEGACY (L-Series Autonomy Cluster)              │
  │  PDC  — LEGACY (if autonomy-bound, L-Series Cluster)    │
  │  Circuit Breaker (fault tolerance for external APIs)    │
  │  ⚠ GASP/PDC do NOT touch active trade flow.             │
  │  ⚠ Confirmed architecturally inert — closed loop.       │
  └──────────────────────────┬──────────────────────────────┘
                             │
TIER 5 — ADAPTIVE LEARNING (tuning protection parameters)
  ┌──────────────────────────┴──────────────────────────────┐
  │  Adaptive Guardrails (micro-adjustments +/- 1-3%)      │
  │  Coherency Rules (validates all changes stay sane)      │
  │  Learning throttle (max 3 changes / 24h in normal)     │
  └─────────────────────────────────────────────────────────┘
```

**Key Design Principles:**
- **guardrails_v2 table** is the single source of truth for all risk parameters
- **GuardrailPolicy** is the authoritative runtime resolver (no hidden defaults)
- **checkGuardrailRisk()** is the sole runtime pre-trade enforcer
- **Coherency rules** (YAML-driven) validate all parameter changes before persistence
- **Fail-safe defaults**: Kill switch checks fail-safe to TRIPPED on error; sizing fails-safe to minimum

---

## 2. Guardrails V2 Database Layer

**Table**: `guardrails_v2` (one row per mode: paper, live)

**Core Four Parameters** (user-visible in Guardrails tab):

| Parameter | Range | Purpose |
|-----------|-------|---------|
| `portfolioRiskPerTradePct` | 0.10%-5.00% | Percentage of portfolio risked per trade |
| `symbolCooldownMinutes` | >= 0 (warn > 90) | Minutes before re-trading same symbol |
| `maxOpenPositions` | 1-20 | Maximum concurrent open positions |
| `dailyLossKillSwitchPct` | 1.00%-25.00% | Portfolio loss % triggering auto-shutdown |

**Extended Parameters**:

| Parameter | Default (paper/live) | Purpose |
|-----------|---------------------|---------|
| `maxPositionPercentPct` | 30%/10% | Max single position as % of portfolio |
| `maxTotalExposurePct` | 25% | Max total portfolio exposure |
| `lowPriceThreshold` | $0.50 | LPCP: price below which special rules apply |
| `lowPriceMinStopAtrMult` | 3.0 | LPCP: minimum stop distance as ATR multiple |
| `lowPriceMinPositionNotional` | $25.00 | LPCP: minimum trade notional in USD |

**Kill Switch State** (persisted for restart resilience):

| Field | Type | Purpose |
|-------|------|---------|
| `killSwitchTripped` | boolean | Whether kill switch is currently active |
| `killSwitchReason` | string | Reason for trip (human-readable) |
| `killSwitchTrippedAt` | timestamp | When kill switch was activated |

**Management Flags**:

| Field | Purpose |
|-------|---------|
| `isManualOverride` | User manually controls all parameters |
| `tunedByLatti` | LATTI adaptive system manages parameters |
| `lockedByUser` | JSONB: per-parameter lock status |
| `lastUpdatedBy` | Audit trail: who last changed values |

**Invariant**: `isManualOverride` and `tunedByLatti` cannot both be `true` (RULE_005).

---

## 3. Coherency Rules Engine

**File**: `audit/coherency_rules.yaml` (v2.2-phase28efinal)
**Consumer**: `guardrail-policy.ts` — loaded at service initialization, validated on every guardrail change

**10 Rules enforced**:

| Rule | Name | Severity | Condition |
|------|------|----------|-----------|
| RULE_001 | Risk <= 50% x KillSwitch | error | `risk <= killSwitch * 0.5` |
| RULE_002 | Total Exposure <= 50% Cap | error | `positions * risk <= 50` |
| RULE_003 | Cooldown >= 0 minutes | error | `cooldown >= 0` |
| RULE_004 | Cooldown Maximum | warn | `cooldown <= 90` |
| RULE_005 | Manual Override Exclusivity | error | NOT (manual AND latti) |
| RULE_006 | Portfolio Risk Range | error | `0.10 <= risk <= 5.00` |
| RULE_007 | Kill Switch Range | error | `1.00 <= killSwitch <= 25.00` |
| RULE_008 | Max Positions Range | error | `1 <= positions <= 20` |
| RULE_009 | Mode Isolation | error | Exactly 1 record per mode |
| RULE_010 | Learning Expansion Caps | error | Values stay within global safety caps |

**Enforcement points**:
- Backend: `PUT /api/guardrails` (pre-commit validation)
- Backend: `POST /api/tuning/enable` (LATTI field bounds check)
- Database: CHECK constraints on core columns
- Adaptive Guardrails: validates proposed changes before applying

**Hot-reload**: `guardrailPolicy.reloadRules()` allows runtime YAML updates without restart.

---

## 4. GuardrailPolicy Service

**File**: `server/services/guardrail-policy.ts` (Phase 5)
**Pattern**: Singleton class, exported as `guardrailPolicy`

### Responsibilities

1. **Effective value resolution**: `getEffective(guardrail)` — structures raw DB row into typed `EffectiveGuardrails` with resolved management flags and LPCP parameters
2. **Coherency validation**: `validate(guardrail)` — runs all 8 implemented rules, returns `{ status: PASS|WARN|FAIL, failures[] }`
3. **Kill switch management**: `tripKillSwitch()`, `resetKillSwitch()`, `isKillSwitchTripped()` — all persisted to DB
4. **Override conflict detection**: `detectOverrideConflict()` — detects LATTI-managed fields being manually changed without lock
5. **Metrics tracking**: Rule failure counts, kill switch trip counts, override conflict counts
6. **Event emission**: Broadcasts to ContextBridge for frontend updates

### Guardrail Category Classification (Phase 8.8.4-B)

The service defines two guardrail categories that determine what happens when a signal is blocked:

**CAPACITY_GUARDRAILS** (signal can be queued for later):
- MAX_TRADES, MAX_TOTAL_EXPOSURE, POSITION_LIMIT, SLOT_CONFLICT

**QUALITY_GUARDRAILS** (signal is rejected outright):
- KILL_SWITCH, NO_STOP_LOSS, INVALID_STOP_LOSS, COOLDOWN, MAX_POSITION, INSUFFICIENT_BALANCE, PORTFOLIO_RISK, LPCP_LOW_PRICE, LPCP_MIN_NOTIONAL, FX_CONVERSION_FAILED, EXPIRED_SIGNAL, NO_PRICE

**Helper functions**: `isCapacityBlock(code)`, `isQualityBlock(code)` enable downstream routing decisions.

### Kill Switch Trip Sequence (REB 8.8.3-KS-B)

When `tripKillSwitch(mode, reason)` is called:
1. Set `killSwitchTripped = true` in guardrails_v2
2. Set `isEngineActive = false` via `storage.updateSystemContext()`
3. Clear Active Filter Pool via `activeFilterPool.enforcePassiveModeIfStopped()`
4. Stop the appropriate engine (paper sim or live engine)
5. Broadcast `system:killswitch_tripped` event via ContextBridge
6. Broadcast state change via `tradingStateSync`

**Fail-safe**: `isKillSwitchTripped()` returns `true` on error — system assumes tripped for safety.

---

## 5. Guardrail Settings Helper

**File**: `server/services/guardrail-settings.ts` (Phase 8.8.3-H4)

Provides helper functions for building settings from guardrails_v2:

### Key Functions

**`calculateRiskAmount(portfolioValue, riskPerTradePct)`**: Converts percentage risk to USD amount.

**`getRiskPercentageV2(mode, guardrails)`**: Reads `portfolioRiskPerTradePct` from guardrails. Falls back to 4% default if missing/invalid.

**`getPortfolioBalanceV2(mode)`** (Phase 8.8.3-C7-FIX):
- Formula: `Current Balance = Starting Balance + Realized P/L`
- Sources realized P/L from closed trades within current engine session
- Mode-aware: paper uses `getPaperSimTrades()`, live uses `getTrades()`
- Returns cash balance (excludes unrealized P/L)

**`buildSettingsFromGuardrails(mode)`**: Master builder that assembles a complete TradingSettings object from guardrails_v2 + portfolio_state. All values sourced from guardrails_v2 (visible in UI).

**Deprecated**: `buildSettingsFromModeLevel()`, `getRiskPercentage()` — backward compatibility aliases.

---

## 6. Trade Safety Service

**File**: `server/services/trade-safety.ts` (Phase 8.8.3-H4)
**Main Entry**: `checkGuardrailRisk(mode, trade, userId?, cycleId?)`

### 8 Sequential Pre-Trade Checks

| # | Check | Pass Condition | Block Code |
|---|-------|---------------|------------|
| 1 | Kill Switch | Not tripped for mode | KILL_SWITCH |
| 2 | Stop-Loss Required | stopPrice present AND below entryPrice | NO_STOP_LOSS / INVALID_STOP_LOSS |
| 3 | Max 1 Position Per Asset | No existing open position for normalized symbol | POSITION_LIMIT |
| 4 | Symbol Cooldown | No trade in same symbol within cooldown period | COOLDOWN |
| 5 | Position Size Cap | `preComputedNotional / portfolioValue <= maxPositionPercentPct` | MAX_POSITION |
| 6 | LPCP | **DORMANT** — always returns `ok: true` | (LPCP_LOW_PRICE / LPCP_MIN_NOTIONAL) |
| 7 | Max Open Trades | Open positions < maxOpenPositions | MAX_TRADES |
| 8 | Max Total Exposure | Total exposure < maxTotalExposurePct | MAX_TOTAL_EXPOSURE |

**Plus**: Correlation Exposure check via `riskConcentrationAnalyzer.isCorrelatedExposure()`

### Key Design Details

- **Sequential short-circuit**: Checks run in order; first failure returns immediately
- **LPCP is DORMANT**: Check #6 always passes. Code preserved for future activation when low-priced coin rules are needed. Comments state dormancy is intentional.
- **Position Size uses preComputedNotional**: The notional value is computed upstream in P2 stage and passed in via `trade.preComputedNotional`, preventing drift between sizing and execution.
- **AJ19 dry-run mode**: For MAX_POSITION blocks, logs the block but allows the trade through (development diagnostic mode)
- **RTB metrics tracking**: Passes/blocks are recorded via `rtbMetricsService` as source of truth
- **Diagnostic integration**: Heavy logging through AJ16, AJ19, B4, B5, I1, I5 diagnostic tags and SLAL (Signal Lifecycle Audit Log)

---

## 7. Pre-Execution Validator

**File**: `server/services/pre-execution-validator.ts` (Phase 8.8.3-H4)
**Pattern**: Singleton, exported as `preExecutionValidator`

### Three-Gate Validation

The Pre-Execution Validator runs AFTER Trade Safety and adds two additional gates:

1. **Risk checks**: Delegates to `checkGuardrailRisk()` from trade-safety.ts
2. **Goal alignment**: ⚠️ **FORMALLY DEPRECATED — Kyle directive 2026-02-16. Must be REMOVED entirely, not defaulted.** See deprecation note below.
3. **Fee-aware profitability** (Phase 27.F.14.B): Calculates whether the trade's expected gain minus round-trip fees exceeds `minNetProfitThreshold` (from system_context).

### Fee-Aware Profitability Check

```
expectedGainPct = |targetPrice - entryPrice| / entryPrice * 100
roundTripFeePct = feeRate * 2 * 100  (entry + exit)
netExpectedGainPct = expectedGainPct - roundTripFeePct
PASS if netExpectedGainPct >= minNetProfitThreshold * 100
```

Fee rates sourced from `system_context.makerFeePct` / `takerFeePct` (default: 0.16% maker, 0.26% taker).

### Goal Alignment Scoring — FORMALLY DEPRECATED (Phase 9.0 System REMOVED, Phase 4 System REMAINS)

> **⚠️ DEPRECATION DIRECTIVE (Kyle, 2026-02-16)**: Goal alignment logic is legacy from the Walter-era Goals system. The Goals tab has already been removed from the UI. This entire gate must be **REMOVED** from `pre-execution-validator.ts` — not defaulted to neutral, not skipped, but deleted. The Pre-Execution Validator should become a two-gate system (risk checks + fee-aware profitability).

Combines three factors (all to be removed):
- Risk/reward ratio alignment with profitability vs consistency preference (40%)
- Strategy risk profile matching (30%)
- Signal confidence alignment (30%)

Only 3 strategies have explicit risk profiles (`vwap_pullback`, `abcd_long`, `sma_trend_ride`); others default to `{risk: 0.5, consistency: 0.5}`.

**Removal scope**: Delete `computeGoalAlignmentScore()`, `strategyRiskProfile` map, goal alignment gate logic, and all related Walter/Bob provenance references. The `profitability_vs_consistency` field in system_context can be removed if no other consumers exist.

### Provenance Logging

Every validation result is logged via `provenanceLogger.logLineage()` with full trace ID, enabling end-to-end audit from signal through validation to execution.

---

## 8. Dynamic Sizing Engine (DSE)

**File**: `server/core/risk/dynamic-sizing-engine.ts` (Directive 11.3)
**Export**: `computeDynamicSize(input)`, plus diagnostics getters

### Core Formula

```
positionSize = baseSize x multiplier

Where:
  baseSize = balance x (DEFAULT_RISK_PCT / 100)     [DEFAULT_RISK_PCT = 2]

  multiplier = edgeFactor x volPenalty x costPenalty x confFactor x costPressure
  multiplier = clamp(multiplier, 0.3, 1.2)

  edgeFactor  = 1 + (expectedEdge - 0.05) x 4
  volPenalty   = max(0.7, 1 - volatility / 0.02)
  costPenalty  = max(0.6, 1 - cost / 0.001)
  confFactor   = 0.5 + confidence
  costPressure = max(0.8, 1 - costDrift x 0.2)      [Directive 11.3C]
```

### Configuration Constants (DSE_CONFIG)

| Parameter | Value | Purpose |
|-----------|-------|---------|
| MIN_MULTIPLIER | 0.3 | Floor for sizing multiplier |
| MAX_MULTIPLIER | 1.2 | Ceiling for sizing multiplier |
| BASE_EDGE | 0.05 | Neutral edge assumption |
| EDGE_SENSITIVITY | 4 | How strongly edge deviations affect sizing |
| VOL_THRESHOLD | 0.02 | Volatility level at which penalty begins |
| VOL_FLOOR | 0.7 | Minimum volatility penalty factor |
| COST_THRESHOLD | 0.001 | Cost level at which penalty begins |
| COST_FLOOR | 0.6 | Minimum cost penalty factor |
| CONFIDENCE_BASE | 0.5 | Base confidence contribution |
| DEFAULT_RISK_PCT | 2 | Base risk as % of balance |
| COST_PRESSURE_DAMPENING | 0.2 | Max dampening from cost drift |

### Adaptive Weight Extraction

DSE extracts edge and confidence from adaptive weights (VTS learning repository):

**Edge priority**: `expectedEdge` > `edge` > `winRate x 0.1` > `profitRate x 0.5` > derived from avg weight

**Confidence priority**: `confidence` > `sampleCount / 100` > `reliability` > derived from weight density

### Hard Cap

Final position size is capped at `balance × max_position_risk` where `max_position_risk = 0.02` (2%) by default, resolved at runtime via `getConstant('risk_sizing', 'max_position_risk', key)` from the `module_constants` table. (Migrated from the deleted `EXECUTION_CONFIG.MAX_POSITION_RISK` const in B65.2 — see §12.)

### Invariants

- T3: Hard Cap — Trade size cannot exceed TradeSafetyService max
- T4: Dynamic Base — Base size scales with portfolio balance
- T5: Bounded Multiplier — Sizing multiplier 0.3-1.2
- T6: Telemetry Provenance — All sizing decisions logged

### Telemetry

Maintains rolling history (max 100 entries) of all sizing decisions. Provides:
- `getLastSizeDecision()` — most recent sizing telemetry
- `getSizeHistory()` — full history
- `getAverageSizeMultiplier()` — overall average
- `getAverageSizeMultiplierByRegime(regime)` — per-regime average
- `getDSEDiagnostics()` — comprehensive diagnostic snapshot

---

## 9. Kill Switch Architecture

The kill switch is DawnTrader's emergency shutdown mechanism. Understanding its architecture requires tracing through multiple files:

### Data Flow

```
                    guardrails_v2.killSwitchTripped
                              │
              ┌───────────────┴───────────────┐
              │                               │
    guardrailPolicy.tripKillSwitch()   guardrailPolicy.isKillSwitchTripped()
    (6-step shutdown sequence)         (DB read, fail-safe: true on error)
              │                               │
              ├── safetyGuardrails.getKillSwitchStatus()  [LEGACY WRAPPER]
              │   (delegates to guardrailPolicy)
              │                               │
              └── trade-safety.ts check #1 ───┘
                  (reads guardrails_v2 directly)
```

### Triggers

1. **Manual**: User clicks stop button → API route → `guardrailPolicy.tripKillSwitch()`
2. **Automatic**: Daily P&L loss exceeds `dailyLossKillSwitchPct` threshold
3. **SafetyGuardrails toggle**: Legacy wrapper delegates to `guardrailPolicy`
4. **Cluster bus**: `kill_switch_activated` event for multi-node awareness

### State Persistence

Kill switch state is persisted to `guardrails_v2` table — survives restarts. Both `killSwitchTripped`, `killSwitchReason`, and `killSwitchTrippedAt` are stored.

---

## 10. Adaptive Guardrails Engine

**File**: `server/services/adaptive-guardrails.ts` (Phase 29)
**Pattern**: Singleton via `AdaptiveGuardrailsService.getInstance()`

### Purpose

Enables LATTI to learn from trade outcomes and user behavior, dynamically tuning guardrails within coherency limits.

### Learning Modes

| Mode | Max Changes/Day | Min Confidence | Max Adjustment % |
|------|----------------|----------------|-----------------|
| slow | 1 | 0.80 | 1% |
| normal | 3 | 0.60 | 3% |
| aggressive | 5 | 0.40 | 5% |
| disabled | 0 | 1.00 | 0% |

**Defaults**: Paper mode starts in `normal`, live mode starts in `slow`.

### Adjustment Pipeline

1. **Throttle check**: Count adaptive changes in last 24h; abort if at limit
2. **Behavioral analysis**: Query `behavioralLog` for each parameter (needs >= 5 samples)
3. **Statistical calculation**: Compute mean delta, variance, confidence from recent behavioral entries
4. **Micro-adjustment**: Direction from mean delta sign; magnitude capped at `maxAdjustmentPercent`
5. **Coherency validation**: Proposed values run through `guardrailPolicy.validate()` — **all adjustments abort if any rule fails**
6. **Persist**: Write to `guardrailsV2` table with `lastUpdatedBy = 'LATTI_ADAPTIVE'`
7. **Audit**: Log to `behavioralLog`, `learningHistory`, and `predictive-adjustments` logger
8. **Snapshot**: Create versioned snapshot of current state for rollback capability

### Currently Adjustable Parameters

- `portfolioRiskPerTradePct`
- `maxOpenPositions`

### Safety Bounds

All adjustments bounded: `0.1 <= value <= 20` (hard safety clamp independent of coherency rules).

**Coherency threshold**: Fixed at 5% for all modes — max deviation from preset value.

---

## 11. Circuit Breaker

**File**: `server/services/circuit-breaker.ts` (Phase 17.5)
**Pattern**: Singleton, exported as `circuitBreaker`
**Scope**: Infrastructure fault tolerance (NOT trade safety — this is for external API/service failures)

### State Machine

```
        ┌──────────┐   5 failures    ┌──────────┐
        │  CLOSED  │ ───────────────> │   OPEN   │
        │ (normal) │ <─────┐         │ (blocked)│
        └──────────┘       │         └────┬─────┘
              ^            │              │
              │      3 successes    retry window
              │            │         elapsed
              │         ┌──┴─────┐        │
              └─────────│HALF_OPEN│<───────┘
                        │(testing)│
                        └─────────┘
```

### Configuration

| Parameter | Value | Purpose |
|-----------|-------|---------|
| failureThreshold | 5 | Failures before OPEN |
| successThreshold | 3 | Successes to recover from HALF_OPEN |
| baseRetryDelayMs | 5,000 | Initial retry delay |
| maxRetryDelayMs | 300,000 | Maximum retry delay (5 min) |

### Backoff Strategy

Exponential with jitter: `delay = min(5000 * 2^retryCount, 300000) +/- 25%`

### Persistence

State persisted to `cluster_circuit_breaker` table — survives restarts. State transitions published to `clusterBus` for multi-node awareness.

---

## 12. GASP Coordinator — LEGACY (L-Series Autonomy Cluster)

**File**: `server/services/gasp-coordinator.ts` (Phase L20)
**Pattern**: Lazy singleton via `getGASPCoordinator()`
**Status**: ⚠️ **LEGACY** — Kyle confirmed 2026-02-16. Part of the L-Series Autonomy Cluster.

> **ADDENDUM (Kyle, 2026-02-16)**: GASP is a legacy supervisory layer. It computes GSI, monitors subsystem stability, and applies dampening — but it does NOT touch the active trade flow. It does not feed into Signal Orchestrator, TradeSafety, DSE, VTS, or Execution Engine. It forms a closed supervisory loop with other L-Series systems (MOF, DCE, APR-SLE, MCP). It is architecturally inert and slated for removal with the entire L-Series autonomy cluster. Not harmful while present, but not connected to trading decisions.

### Purpose (Legacy)

GASP (Global Adaptive Stability Protocol) monitors system-wide stability across multiple learning subsystems and applies dampening when instability is detected.

### Global Stability Index (GSI)

```
GSI = max(0, min(1, 1 - sqrt(combinedVariance)))

combinedVariance = w1*sigma_lambda^2 + w2*sigma_DI^2 + w3*sigma_alphaBeta^2 + w4*sigma_DRS^2

Default weights: w1=0.4, w2=0.3, w3=0.2, w4=0.1
```

### Input Sources (collectMetrics)

| Source | Module | Fallback |
|--------|--------|----------|
| Lambda weights sum | MOF Orchestrator | 1.0 |
| Decision Index (DI) | DCE | 0.5 |
| Alpha/Beta average | APR-SLE Engine | 0.5 |
| Drawdown Risk Score | PDC Engine | 0 |
| Regime numeric map | Market Profiler | 0.5 |

**All sources are try/catch wrapped** — GASP continues functioning if any subsystem is unavailable.

### Operating Modes

| Mode | Trigger | Effect |
|------|---------|--------|
| normal | GSI >= 0.85 AND correlationMax < 0.8 | Full learning rate and exposure |
| caution | GSI < 0.85 OR correlationMax >= 0.8 | Monitoring intensified |
| containment | GSI < 0.65 OR correlationMax >= 0.9 | Cooldown initiated, damping applied |
| recovery | After cooldown, GSI rising | Gradual restoration |

### Feedback Damping

When GSI < stableThreshold (0.85):
- Learning rate: `max(0.1, GSI + 0.15)` — applied to MOF learning rate
- Exposure: `max(0.1, GSI + 0.10)` — exposure reduction factor

### Cooldown Protocol

- Duration: 10 minutes
- Recovery: 15 minutes of stable GSI >= stableThreshold
- Alternative exit: 10 minutes elapsed AND GSI >= cautionThreshold

### Correlation Matrix

GASP tracks 6 cross-correlations between subsystems (lambda-DI, lambda-DRS, DI-DRS, regime-lambda, regime-DI, regime-DRS). High correlation (>0.8) indicates subsystems are no longer providing independent signals.

---

## 13. PDC Engine — LEGACY (If Autonomy-Bound, L-Series Cluster)

**File**: `server/services/pdc-engine.ts` (Directive 8.8.4-L18)
**Pattern**: Lazy singleton via `getPDCEngine()`
**Status**: ⚠️ **LEGACY (conditional)** — Kyle listed "PDC (if still autonomy-bound)" in the L-Series cluster (2026-02-16). PDC depends on DCE for DI data and feeds DRS to GASP. If PDC has no direct consumers in the active execution path (Signal Orchestrator, TradeSafety, DSE, VTS), it is confirmed legacy and should be removed with the L-Series cluster.

> **Note**: PDC's `recalibrate(tradeResults)` method suggests it was designed to interact with trade outcomes, but verification is needed to confirm whether any active service calls this method or consumes DRS directly for trade decisions. If no active execution path consumer exists, PDC is purely autonomy-bound and part of the closed L-Series loop.

### Purpose (Potentially Legacy)

PDC (Predictive Drawdown Containment) detects early-stage drawdown precursors before they manifest as portfolio losses.

### Drawdown Risk Score (DRS)

```
DRS = w1 * slopeContribution + w2 * volContribution + w3 * driftContribution

slopeContribution = min(|equitySlope| x 50, 1.0)
volContribution   = min(max(volRatio - 1.0, 0) x 2, 1.0)
driftContribution = min(|diDrift| x 5, 1.0)

Default weights: w1=0.5, w2=0.3, w3=0.2
```

### Three Precursor Signals

1. **Equity slope** (`deltaE/deltaT`): Linear regression over last 20 equity samples, normalized by average equity
2. **Volatility ratio** (`sigma_recent / sigma_baseline`): Recent return volatility vs baseline. Baseline defaults to 0.02.
3. **DI decay** (`DI_{t-5} - DI_t`): Change in Decision Index over last 5 samples. Sourced from DCE.

### DRS Thresholds

| Threshold | Value | Action |
|-----------|-------|--------|
| Warning | 0.6 | `warningActive = true` |
| Containment | 0.8 | `containmentActive = true`, exposure reduction |
| Recovery | 0.4 | Begin counting recovery windows |

Recovery requires 3 consecutive windows below recovery threshold.

### Recalibration

`recalibrate(tradeResults)` adjusts weights based on trade outcomes:
- If contained trades perform well relative to normal trades, increase equity slope weight (w1)
- If contained trades underperform, reduce w1 and increase volatility weight (w2)
- Weights are normalized to sum to 1.0 after adjustment
- Requires minimum 10 trade results

---

## 14. Risk Concentration Analyzer

**File**: `server/services/risk-concentration.ts` (Directive 9.4)
**Pattern**: Singleton, exported as `riskConcentrationAnalyzer`

### Purpose

Prevents portfolio concentration in highly correlated assets by calculating correlation-weighted exposure and applying scaling factors.

### Concentration Score

```
C_i = sum(|rho_ij| x w_j) + w_i    for all j != i

Where:
  rho_ij = correlation between assets i and j
  w_j = position weight of asset j
  w_i = own position weight
```

### Scaling Factor

```
If C_i > C_max (default 2.5):
  ScalingFactor_i = max(minScalingFactor, C_max / C_i)
Else:
  ScalingFactor_i = 1.0
```

### Configuration

| Parameter | Default | Purpose |
|-----------|---------|---------|
| correlationThreshold | 0.75 | Minimum correlation to be considered "correlated" |
| maxConcentration | 2.5 | Maximum allowed concentration score |
| minScalingFactor | 0.25 | Floor for scaling factor (25% of intended size) |
| updateIntervalMs | 60,000 | Periodic update interval (1 minute) |

### Integration Points

- **Trade Safety**: `isCorrelatedExposure(symbol)` called during pre-trade checks
- **Position Sizing**: `getScalingFactor(symbol)` used by sizing helpers to reduce position size for correlated assets
- **Market Data**: `updateFromMarketData(symbols)` fetches OHLC data from Kraken, computes returns, and updates covariance/correlation matrices

---

## 15. Covariance Engine

**File**: `server/utils/covariance-engine.ts` (Directive 9.4)
**Pattern**: Singleton, exported as `covarianceEngine`

### Mathematical Foundation

```
Return: r_i(t) = (P_i(t) - P_i(t-1)) / P_i(t-1)
Covariance: Sigma = (1/(n-1)) x (R - R_bar)^T (R - R_bar)
Correlation: rho_ij = Sigma_ij / (sigma_i x sigma_j)
Portfolio Variance: w^T Sigma w
Portfolio Volatility: sqrt(w^T Sigma w)
```

### Configuration

- Return history window: 100 samples (RETURN_HISTORY_SIZE)
- Minimum returns for calculation: 10 (MIN_RETURNS_FOR_CALCULATION)

### Key Operations

1. `updateFromPrices(symbol, prices)` — converts prices to returns, adds to rolling history
2. `computeCovarianceMatrix()` — recomputes from all active symbols (>= 10 returns each)
3. `computeCorrelationMatrix()` — derives from covariance matrix
4. `calculatePortfolioVariance(weights)` — `w^T Sigma w` for given position weights
5. `calculatePortfolioVolatility(weights)` — square root of variance

### State Management

Supports `exportState()` / `importState()` for persistence across restarts.

---

## 16. Paper Portfolio Manager

**File**: `server/services/paper-portfolio-manager.ts`
**Pattern**: Instance per mode (not singleton)

### Responsibilities

1. **Lifecycle management**: Start/stop paper trading engine with full safety checks
2. **Position management**: Force-close all positions on stop (hard stop behavior)
3. **Portfolio health**: Monitor drawdown, exposure, and position count
4. **Signal orchestration**: Manages SignalOrchestrator for automatic signal generation
5. **Engine registration**: Registers execution engine and micro-execution service with mode registry

### Portfolio-Level Guardrails (Hard-coded)

| Parameter | Value | Purpose |
|-----------|-------|---------|
| MAX_DRAWDOWN_PERCENT | 20% | Maximum drawdown before critical |
| MAX_OPEN_POSITIONS | 10 | Maximum concurrent positions |
| MAX_PORTFOLIO_EXPOSURE_PERCENT | 80% | Maximum capital deployed |

### Start Sequence

1. Check portfolio health (paper mode: log-only; live mode: blocks if critical)
2. Set `isRunning = true`, clear stop flag
3. Register engine with mode registry
4. Start execution engine
5. Start micro-execution service
6. Start signal orchestrator (9 strategies enabled, 30s evaluation interval)
7. Note: Watchlist refresh is DISABLED — uses Active Filtered Pool from FX5

### Stop Sequence (Hard Stop)

1. Set `isStopInProgress = true` FIRST (prevents late trades)
2. Set `isRunning = false`
3. Stop signal orchestrator
4. Clear watchlist refresh interval
5. Stop micro-execution service
6. Stop execution engine

### Force Close on Stop

`forceCloseAllOpenPositionsOnStop()`:
- Gets all open positions from storage
- For each position: gets live price via `livePricingAdapter.getPriceWithFallback()` (5s staleness guard)
- Falls back to entry price if no reliable market price available
- Calls `executionEngine.forceClosePosition()` with price source tag
- Logs diagnostics via `i1TradeLifecycleDiagnostics.logHardStopSummary()`

### Portfolio Metrics

Calculates: total P/L, win rate, avg return, avg holding time, max drawdown, Sharpe ratio, profit factor, and per-strategy breakdowns.

---

## 17. Portfolio Aggregator

**File**: `server/services/portfolio-aggregator.ts` (Phase 8.2)
**Pattern**: Singleton, exported as `portfolioAggregator`

### Purpose

Combines strategy-level metrics into portfolio-level analytics:
- Total equity curve (last 100 points)
- Portfolio-level volatility (annualized, assuming 365 trading days)
- Portfolio Sharpe ratio (annualized, 0% risk-free rate)
- Capital allocation weightings (by P/L contribution)
- Diversification index (inverse of win rate variance across strategies)

### Data Sources

- `portfolio_state.balance` for initial capital (Phase 8.5 Addendum K.3)
- Paper mode: `getAllPaperTrades()`; Live mode: `getTrades('live')`
- Strategy metrics from `strategy-analytics` module

---

## 18. Kraken Service

**File**: `server/services/kraken.ts` (LOCKED — Directive 8.8.4-A4.R10R-4)
**Pattern**: Class-based, multiple instances allowed

### Key Capabilities

1. **Public endpoints**: Time, Assets, AssetPairs, Ticker, OHLC, Depth, Trades
2. **Private endpoints**: Balance, OpenOrders, ClosedOrders, AddOrder, CancelOrder
3. **Caching**: Balance (60s TTL), OpenOrders (90s), ClosedOrders (600s), History days (24h)
4. **Rate limiting**: Per-user lockout tracking with 120s cooldown on "Temporary lockout" errors
5. **Maintenance mode**: All API calls blocked when `MAINTENANCE_MODE=true`
6. **OHLC pagination**: Supports multi-batch historical data fetching with rate-limit-aware delays

### Spot-Only Safety

`addOrder()` enforces spot-only trading:
- Rejects any order with `leverage` parameter (except 'none')
- Blocks margin flags (`viqc` in `oflags`)
- Logs spot-only enforcement for audit trail

### Rate Limit Graceful Degradation

On "EGeneral:Temporary lockout":
1. Lock user's API access for 120 seconds
2. Return stale cache data if available
3. Throw error only if no cached data exists

### History Days Cache (REB 2.9D)

`getPairHistoryDays(pair, mode)`: Returns number of trading days available for a pair.
- Uses 1440-minute (daily) OHLC candles
- Cached for 24 hours per pair
- Returns `null` on error (caller decides pass/fail semantics)

---

## 19. Legacy Classification: SafetyGuardrails Service

**File**: `server/services/safety-guardrails.ts`
**Status**: DEPRECATED (Phase 8.8.3-H8)

### Classification: LEGACY — Active wrapper, no runtime authority

The `SafetyGuardrailsService` is marked `@deprecated` across its entire surface. All runtime safety enforcement was migrated to:
- `guardrails_v2` table (single source of truth)
- `trade-safety.ts` / `checkGuardrailRisk()` (runtime enforcer)
- `guardrail-policy.ts` / `GuardrailPolicy` (policy management)

### What It Still Does

1. **Kill switch delegation**: `getKillSwitchStatus()` and `toggleKillSwitch()` now delegate to `guardrailPolicy`. These are thin wrappers that add deprecation warnings.
2. **API compatibility**: Kept for backward compatibility with admin API routes (`/api/safety/*`)
3. **Event logging**: Writes to `safety_event_log` table and broadcasts via ContextBridge
4. **Policy evaluation**: `evaluateAction()` still queries `safetyPolicy` table but emits deprecation warnings and should NOT be used for runtime go/no-go decisions.

### Kill Switch Toggle Path

`toggleKillSwitch(enabled, reason, userId?, mode?)`:
1. Delegates to `guardrailPolicy.tripKillSwitch()` or `resetKillSwitch()`
2. Broadcasts via ContextBridge (frontend)
3. Emits to `clusterBus` (backend services, e.g., TradingStateSync) — Phase 27.4

---

## 20. Legacy Classification: L-Series Autonomy Cluster

> **Source**: Kyle's Phase 4 Addendum (2026-02-16) — Legacy Autonomy Layer & Goal Alignment Deprecation Directive

### Classification: LEGACY — Architecturally Inert Closed Supervisory Loop

The entire L-Series autonomy cluster has been confirmed by Kyle as **architecturally inert**. These systems form a closed supervisory loop that does NOT feed into any active execution component:

- ❌ Does NOT feed into Signal Orchestrator
- ❌ Does NOT feed into TradeSafety
- ❌ Does NOT feed into DSE (Dynamic Sizing Engine)
- ❌ Does NOT feed into VTS
- ❌ Does NOT feed into Execution Engine

### L-Series Systems (All Legacy — Slated for Coordinated Removal)

| System | File(s) | Role in Closed Loop |
|--------|---------|-------------------|
| **MCP** (Market Condition Profiler) | `market-profiler.ts` | Independent regime classifier (T1-C1 taxonomy) |
| **ARE** (Adaptive Regime Engine) | `adaptive-regime.ts` | Regime adjustment layer for MCP |
| **GASP** (Global Adaptive Stability Protocol) | `gasp-coordinator.ts` | Supervises MOF/MACO/ECS, computes GSI |
| **MOF** (Multi-Objective Framework) | `mof-orchestrator.ts` | Multi-objective optimization |
| **MACO** (Multi-Agent Coordination) | `maco-coordinator.ts` | Agent coordination |
| **ECS** (Evolutionary Competition System) | `ecs-manager.ts` | Strategy competition |
| **DCE** (Decision Confidence Engine) | `decision-confidence-engine.ts` | Decision Index computation |
| **Experience Buffer** | `experience-buffer.ts` | RL-style experience storage |
| **Reward Evaluator** | `reward-evaluator.ts` | RL reward computation |
| **Proactive Allocator** | `proactive-allocator.ts` | Proactive capital allocation |
| **Equilibrium Restorer** | TBD (Phase 6 audit) | System equilibrium maintenance |
| **APR-SLE** (Adaptive Performance Rating) | `apr-sle-engine.ts` | Performance rating with learning |
| **PDC** (Predictive Drawdown Containment) | `pdc-engine.ts` | Drawdown prediction (if autonomy-bound) |

### Why These Are Legacy

1. **Independent taxonomy**: MCP/ARE uses T1/T2/R1/V1/C1 — no mapping to canonical 5-regime names
2. **Stubbed metrics**: MCP never completed (`volume_z = 0`, `correlation = 0.5`)
3. **No canonical mapping**: None of these systems reference or consume the canonical regime-strategy map
4. **Closed loop**: They supervise each other but nothing in the active execution path reads their output
5. **Predecessor architecture**: Built under Directive 8.8.4-L12 (Dec 2025), superseded by canonical map (Directive 11.7F, Jan 2026)

### Removal Directive (Kyle, 2026-02-16)

All L-Series systems must be removed together in a **coordinated wave**. Before removal:
1. Confirm no hidden execution paths exist (grep for any SO/DSE/TradeSafety/VTS imports)
2. Confirm no Signal Orchestrator imports from L-Series systems
3. Confirm no database migration dependencies
4. Verify all 14+ consumer services of MCP/ARE are catalogued and migrated

### Impact on Phase 4 Findings

- **GASP (Section 12)**: Reclassified from ACTIVE to LEGACY
- **PDC (Section 13)**: Reclassified from ACTIVE to LEGACY (conditional on being autonomy-bound)
- **RISK-027**: Superseded — no need to migrate GASP's metric sources; the entire system is removed
- **Waves 5-7**: Consolidated into a single L-Series cluster removal wave (see LEGACY_DEPRECATION_PLAN.md)

---

## 21. Cross-References

### To Phase 1 (Math & Scoring)
- DSE uses adaptive weights from VTS learning repository (Phase 6 will validate)
- Cost pressure factor reads from `cost-drift-monitor` (Phase 1 cost model)
- Pre-Execution Validator uses `slippage-fee-model` for fee estimation

### To Phase 2 (Strategies)
- Trade Safety's symbol normalization affects all strategy signals
- ~~Pre-Execution Validator's goal alignment only has risk profiles for 3 of 17 strategies~~ → **Goal alignment is formally deprecated (Kyle Addendum). To be removed entirely.**
- ~~GASP collects metrics from MOF Orchestrator and APR-SLE Engine (Phase 2 legacy systems)~~ → **GASP itself is now legacy (L-Series cluster). Both GASP and its metric sources will be removed together.**

### To Phase 3 (Market Scanning)
- Kill switch triggers `activeFilterPool.enforcePassiveModeIfStopped()` — clears scanning pool
- Trade Safety reads open positions from storage (paper or live mode)
- Risk Concentration fetches OHLC from Kraken service for correlation computation

### Forward References
- Phase 6 (ML/Learning): DSE's adaptive weight extraction. ~~GASP's damping of MOF learning rate~~ → GASP and MOF both legacy (L-Series cluster).
- Phase 7 (Infrastructure): Circuit Breaker integrates with cluster bus. ~~Boot sequence initializes GASP/PDC~~ → GASP/PDC are legacy; boot init will be removed with L-Series cluster.

---

## 22. Critical Findings

### RISK-026: DSE Diagnostics Use Legacy Regime Names
- **Severity**: LOW
- **Location**: `server/core/risk/dynamic-sizing-engine.ts` lines 287-288
- **Problem**: `getDSEDiagnostics()` references 6 regime names including `EXTREME_NOISE` and `LOW_VOL_CHOP` which do not match the canonical 5-regime taxonomy (`BULL_QUIET`, `BULL_VOLATILE`, `BEAR_QUIET`, `BEAR_VOLATILE`, `CHOPPY`). These are display/diagnostic only and do not affect sizing math.
- **Fix**: Update regime names in diagnostics to match canonical names
- **Timing**: Anytime (cosmetic, no trading impact)

### RISK-027: GASP Is Itself Legacy (L-Series Autonomy Cluster) — SUPERSEDED
- **Severity**: MEDIUM → **RECLASSIFIED** (Kyle Addendum, 2026-02-16)
- **Location**: `server/services/gasp-coordinator.ts`
- **Original Problem**: GASP depends on legacy subsystems (MOF, DCE, APR-SLE, MCP).
- **Updated Status**: Kyle confirmed GASP itself is legacy — part of the L-Series Autonomy Cluster. GASP supervises MOF/MACO/ECS, computes GSI, but does NOT touch the active trade flow. It forms a closed supervisory loop with other L-Series systems. No migration of GASP's metric sources is needed — the entire system (GASP + its sources) will be removed together in the coordinated L-Series cluster removal.
- **Fix**: Remove GASP along with the entire L-Series autonomy cluster in a single coordinated wave.
- **Timing**: During L-Series cluster removal (see Section 20)

### RISK-028: Goal Alignment Logic Is Formally Deprecated — Must Be REMOVED
- **Severity**: LOW → **MEDIUM** (elevated: formal deprecation directive)
- **Location**: `server/services/pre-execution-validator.ts` — entire goal alignment gate
- **Original Problem**: Only 3 of 17 strategies had risk profiles.
- **Updated Status (Kyle Addendum, 2026-02-16)**: Goal alignment is legacy from the Walter-era Goals system. The Goals tab has already been removed from the UI. Kyle directive: this logic must be **REMOVED entirely** — not expanded to cover more strategies, not defaulted to neutral, but deleted from the codebase.
- **Removal scope**: `computeGoalAlignmentScore()`, `strategyRiskProfile` map, goal alignment gate logic, Walter/Bob provenance references, and `profitability_vs_consistency` field in system_context (if no other consumers).
- **Fix**: Delete all goal alignment code from pre-execution-validator.ts. Reduce to a two-gate validator (risk checks + fee-aware profitability).
- **Timing**: Pre-MCE or during MCE — standalone removal, no MCE dependency

### RISK-029: Paper Portfolio Manager Uses Hardcoded Starting Capital — ACCEPTED
- **Severity**: LOW-MEDIUM → **LOW** (Kyle accepted, 2026-02-16)
- **Location**: `server/services/paper-portfolio-manager.ts` lines 539-541, 670-672
- **Problem**: `checkPortfolioHealth()` and `calculateMaxDrawdown()` assume `startingCapital = 10000` (hardcoded) for exposure and drawdown calculations. This does not match the actual portfolio_state.balance which may differ.
- **Kyle Decision (2026-02-16)**: Hardcoded $10,000 is acceptable for now. Optional future enhancement: throw error if portfolio_state.balance is missing instead of defaulting.
- **Fix**: No immediate action required. Optional future: throw error on missing balance.
- **Timing**: Post-MCE (optional)

### RISK-030: Coherency Rules YAML vs Code Mismatch
- **Severity**: LOW
- **Location**: `audit/coherency_rules.yaml` line 253 vs `guardrail-policy.ts` line 387
- **Problem**: The YAML database constraint for kill switch range says `daily_loss_kill_switch_pct >= 1.00 AND <= 20.00` but RULE_007 in the YAML itself and the code both enforce `1.00-25.00`. The database CHECK constraint is stricter than the application rule.
- **Fix**: Align database CHECK constraint to match RULE_007 (1.00-25.00)
- **Timing**: Anytime (database migration needed)

### RISK-031: EXECUTION_CONFIG.MAX_POSITION_RISK Contradicts Guardrails — DEFERRED
- **Severity**: MEDIUM
- **Location**: `server/config/execution-config.ts` line 15, `server/core/risk/dynamic-sizing-engine.ts` line 211
- **Problem**: `EXECUTION_CONFIG.MAX_POSITION_RISK = 0.02` (2%) is used by DSE as a hard cap on position size. However, `guardrails_v2.maxPositionPercentPct` defaults to 10% (live) or 30% (paper). The DSE cap at 2% is far stricter than the guardrail setting, meaning the guardrail's `maxPositionPercentPct` may never actually be the binding constraint — DSE caps first.
- **Dual authority**: Trade Safety checks `maxPositionPercentPct` (guardrails_v2). DSE independently caps at `MAX_POSITION_RISK`. These are different limits checked at different stages of the pipeline.
- **Kyle Decision (2026-02-16)**: Confirmed this is a real conflict. Do NOT change during audit phase. Add to cleanup docket for post-audit architecture session.
- **Fix**: Clarify whether DSE should use `maxPositionPercentPct` from guardrails_v2 instead of `EXECUTION_CONFIG.MAX_POSITION_RISK`, or document these as intentionally layered constraints.
- **Timing**: Post-audit architecture session (deferred per Kyle)

---

## 23. Forward Audit Standard: Parallel System Detection

> **Source**: Kyle's Phase 4 Addendum, Section 8 (2026-02-16)

### New Audit Standard for Phases 5-11

Going forward, any subsystem encountered during the remaining audit phases that meets ANY of the following criteria must be flagged as **"POTENTIAL LEGACY — REQUIRES INTENT VERIFICATION"**:

1. **Independent operation**: Operates independently of canonical routing (Signal Orchestrator → TradeSafety → DSE → Execution Engine)
2. **Own classification**: Maintains its own regime/market classification taxonomy separate from canonical 5-regime model
3. **Supervision without execution**: Supervises other subsystems but does not directly influence trade execution decisions
4. **No canonical references**: Has no imports from or exports to Signal Orchestrator, DSE, TradeSafety, or VTS
5. **Closed loop**: Forms a closed feedback loop with other subsystems that has no outbound path to execution

### Verification Protocol

When a potential legacy subsystem is flagged:
1. **Grep test**: Search for imports of the subsystem in SO, DSE, TradeSafety, VTS, and Execution Engine files
2. **Output trace**: Trace the subsystem's computed outputs — do they reach any active trade decision?
3. **Taxonomy check**: Does it use canonical regime names or its own taxonomy?
4. **Intent verification**: Document the subsystem's apparent purpose and flag for Kyle's confirmation

### Rationale

The L-Series autonomy cluster (MCP, ARE, GASP, MOF, MACO, ECS, DCE, etc.) was discovered to be architecturally inert — a closed supervisory loop that ran for months without anyone realizing it had no connection to the active execution path. This standard ensures similar patterns are caught early in subsequent audit phases.

---

## 24. File Catalog

### Active Files (Phase 4 Scope)

| File | Lines | Status | Role |
|------|-------|--------|------|
| `server/services/trade-safety.ts` | ~916 | ACTIVE | Runtime pre-trade guardrail enforcement |
| `server/services/guardrail-policy.ts` | ~670 | ACTIVE | Policy management, coherency validation, kill switch |
| `server/services/guardrail-settings.ts` | ~233 | ACTIVE | Settings builder from guardrails_v2 |
| `server/services/adaptive-guardrails.ts` | ~617 | ACTIVE | LATTI adaptive parameter tuning |
| `server/services/pre-execution-validator.ts` | ~292 | ACTIVE (Goal Alignment DEPRECATED) | Two active gates + one deprecated gate |
| `server/services/circuit-breaker.ts` | ~336 | ACTIVE | Infrastructure fault tolerance |
| `server/services/risk-concentration.ts` | ~369 | ACTIVE | Correlation-weighted exposure control |
| `server/services/paper-portfolio-manager.ts` | ~725 | ACTIVE | Paper trading lifecycle management |
| `server/services/portfolio-aggregator.ts` | ~243 | ACTIVE | Portfolio-level metrics aggregation |
| `server/services/kraken.ts` | ~750+ | ACTIVE (LOCKED) | Kraken REST API client |
| `server/core/risk/dynamic-sizing-engine.ts` | ~314 | ACTIVE | Predictive position sizing |
| `server/core/risk/index.ts` | ~8 | ACTIVE | Risk module re-export |
| `server/utils/covariance-engine.ts` | ~371 | ACTIVE | Rolling covariance/correlation matrices |
| `server/config/execution-config.ts` | ~23 | ACTIVE | TEC configuration constants |
| `audit/coherency_rules.yaml` | ~360 | ACTIVE | Coherency validation rules definition |

### Legacy Files (Phase 4 Scope)

| File | Lines | Status | Notes |
|------|-------|--------|-------|
| `server/services/safety-guardrails.ts` | ~411 | LEGACY (H8) | Deprecated wrapper, kept for API compatibility |
| `server/services/gasp-coordinator.ts` | ~540 | LEGACY (L-Series) | Closed supervisory loop, does not touch active trade flow (Kyle 2026-02-16) |
| `server/services/pdc-engine.ts` | ~347 | LEGACY (L-Series, conditional) | Legacy if autonomy-bound; verify no active execution path consumers (Kyle 2026-02-16) |

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| v1.0 | 2026-02-16 | Initial Phase 4 section: 18 files audited, 6 RISK findings |
| v1.1 | 2026-02-16 | Phase 4 Addendum: GASP/PDC reclassified to LEGACY (L-Series cluster). Goal Alignment formally deprecated. RISK-027 superseded, RISK-028 elevated, RISK-029 accepted, RISK-031 deferred. Added Section 20 (L-Series Autonomy Cluster), Section 23 (Forward Audit Standard). File catalog updated: 15 active, 3 legacy. |


---

# Chapter 5: Trade Execution & Lifecycle

> **★ ITEM 4 (2026-06-10) — TRADING-MODE CONTROL PLANE: three INDEPENDENT systems, per-mode switches, live HARD-GATED until Phase 21.** The control surface over the engines below was cleaved in item 4 (between-Phase-24→19 plan; Gate-2 packet + umbrella completion report are the design/closure SSOT):
> - **Per-mode start/stop.** `/api/trading/start` + `/api/trading/stop` validate and act on an explicit `mode` (`'paper' | 'live'`); per-mode flags `isEngineActivePaper` / `isEngineActiveLive` are the truth (the legacy `getCurrentMode()` live>paper>vts collapse survives ONLY in display reads — it is DELETED from all producer/write paths). VTS is NOT on this switch — its lifecycle is its own start/stop (`/api/vts/run-passive` / `/stop-passive`, Ch6 banner) and it runs THROUGH paper/live start-stops.
> - **The live-engine Phase-21 gate (fail-closed, NUMERIC).** The live branch of `/trading/start` refuses with **HTTP 409 `LIVE_ENGINE_PHASE21_GATED`** unless `module_constants` row `live_engine_gate`/`live_engine_enabled` reads **strictly numeric `=== 1`** (seeded `'0'::jsonb`; prefetched at boot via b72-warmup). The gate sits BEFORE any `globalLiveEngine` reference and flips NO state on refusal. **⚠️ jsonb BOOLEANS are INVISIBLE to the B72 numeric constants resolver — never "simplify" the read to truthy, and the Phase-21 flip sets the VALUE to numeric `1`, NOT `true`** (roadmap 19-17b; lock tests `item4-step3-switch-cleave.test.ts`). Kyle rule: live ALWAYS places real orders — there is no live no-op scaffold, ever.
> - **Kill-switch scope (Kyle Gate-2 decision 3):** paper AND live carry the kill-switch (paper kept as live-mirror + diagnostic — long paper runs without a trip are themselves a signal); VTS has NONE (start/stop only).
> - **Mode tag at entry, carried on the payload.** Producers stamp `sourceMode` at the pipeline possession boundary and every terminal write (B70 archivers, learning store, confluence buffer) takes the CARRIED tag — write-time mode lookups are retired (Ch6 banner + SIM step-2 entries).
> - **Throughput verdict (study, 2026-06-10):** VTS + paper concurrent in ONE process is a measured GO (all 6 gates; `ITEM_4_THROUGHPUT_STUDY_RESULTS.md`); the separate-VTS-process option is resolved NOT-needed pre-Phase-19, re-evaluate at Phase 21.
> - **⚠️ Known lying-state surfaces (do NOT trust for engine liveness):** the `health_engine` broadcast ENGINE block reads the legacy `global.tradingEngines` registry (#214 — reports `isRunning:false` during active paper; consolidation targeted at Phase-19 prep); the legacy Phase-22.3 `/live-trading/*` routes bypass the Phase-21 gate and broadcast fake live-active state (#213 — gate-or-retire before Phase 21).
> - **⚠️ Paper-fill destination (rule-20 correction, P19-B2 2026-06-13):** for SPOT there is **NO "Kraken paper order system."** Kraken's hosted demo is FUTURES-only; spot `validate=true` validates an order but never fills it. So paper-mode SPOT fills are a **Kraken-vetted, high-fidelity INTERNAL fill** — every paper order is sent to Kraken with `validate=true` (real-venue vetting) and then filled locally off real Kraken WS prices with a real-fee + L2-depth-slippage + partial-fill model (so paper EV ≈ live EV). The engine path is otherwise identical; only the order DESTINATION differs (live → real Kraken order; paper → validate-vetted local fill, via the OrderPlacer port — §3.7/§9.14 SIM). Any older text describing paper as "routing through Kraken's paper order system" for spot is stale.

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Dual Execution Engine Architecture](#2-dual-execution-engine-architecture)
3. [PaperExecutionEngine (Primary)](#3-paperexecutionengine-primary)
4. [TradingEngine (Live-Capable)](#4-tradingengine-live-capable)
5. [TrailingExitController](#5-trailingexitcontroller)
6. [MicroExecutionService](#6-microexecutionservice)
7. [ModeRegistry & Engine Instance Management](#7-moderegistry--engine-instance-management)
8. [Lifecycle Events Service](#8-lifecycle-events-service)
9. [Signal Lifecycle Audit Layer (SLAL)](#9-signal-lifecycle-audit-layer-slal)
10. [Execution Timing Service](#10-execution-timing-service)
11. [Trade Flow Types (Directive 11.0B)](#11-trade-flow-types-directive-110b)
12. [Execution Configuration](#12-execution-configuration)
13. [TradeBob (Cache Layer)](#13-tradebob-cache-layer)
14. [Execution Policy Controller (Walter/NLAI)](#14-execution-policy-controller-walternlai)
15. [NLAI Execution Broker](#15-nlai-execution-broker)
16. [Unified Price Cache](#16-unified-price-cache)
17. [Paper Simulation Service](#17-paper-simulation-service)
18. [Exit Condition Architecture](#18-exit-condition-architecture)
19. [RTB Promotion Pipeline](#19-rtb-promotion-pipeline)
20. [Cross-References](#20-cross-references)
21. [Critical Findings](#21-critical-findings)
22. [Forward Audit Standard Checks](#22-forward-audit-standard-checks)
23. [File Catalog](#23-file-catalog)
24. [Revision History](#24-revision-history)

---

## 1. Architecture Overview

DawnTrader's trade execution operates through a **dual-engine architecture** with clearly separated responsibilities for paper and live trading. The system has evolved organically, with the PaperExecutionEngine becoming the dominant, actively-maintained engine (~2,308 lines) while the TradingEngine (~766 lines) retains live-mode capabilities but contains significant placeholder code.

### High-Level Execution Flow

```
Signal Source (FX5 → SignalOrchestrator → SQE → RTB → TCL)
       │
       ▼
┌──────────────────────────────────────────────────────┐
│  EXECUTION ENGINE LAYER                              │
│                                                      │
│  PaperExecutionEngine (paper mode — PRIMARY)         │
│  ├── processSignal() → guardrails → expectancy gate  │
│  ├── executeSimulatedTrade() → sizing → DB write     │
│  ├── monitoringCycle() (1.5s loop)                   │
│  │   └── checkOpenPositions() → exit evaluation      │
│  └── checkRtbPromotion() → multi-signal promotion    │
│                                                      │
│  TradingEngine (live mode — SECONDARY)               │
│  ├── processSignal() → guardrails → ⚠ Goal Align    │
│  ├── executeTrade() → Kraken API                     │
│  │   ⚠ Contains SIMULATED partial fills (Math.random)│
│  │   ⚠ Contains SIMULATED slippage (Math.random)     │
│  └── placeStopAndTargetOrders() → bracket orders     │
└──────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────┐
│  EXIT MANAGEMENT LAYER                               │
│                                                      │
│  TrailingExitController (Directive 9.2.A)            │
│  ├── Two-stage latch: Break-Even → Target Lock       │
│  ├── Cost-aware floors (Directive 11.3A)             │
│  └── Dynamic trailing: K' from DI + VolNoise         │
│                                                      │
│  MicroExecutionService (paper-mode only)             │
│  ├── 8s recheck loop, 0.30% delta trigger            │
│  └── ⚠ triggerSymbolCheck() is TODO stub             │
└──────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────┐
│  OBSERVABILITY & INFRASTRUCTURE                      │
│                                                      │
│  ModeRegistry — engine instances, telemetry broadcast│
│  LifecycleEvents — signalValidated/readyToTrade/exec │
│  SLAL — 7-stage signal lifecycle audit               │
│  ExecutionTimingService — order timing marks          │
│  TradeBob — trade data cache (1s TTL)                │
│  UnifiedPriceCache — multi-bucket price management   │
└──────────────────────────────────────────────────────┘
```

### Canonical Signal-to-Trade Pipeline

The canonical trade flow (from Phase 3 scanning through execution) is:

```
FX5 (30s scans) → SignalOrchestrator (exposure/correlation/cooldown)
    → SQE (FinalScore + RegimeWeight)
    → Ready-to-Buy Queue (30s refresh, TTL=30s)
    → TCL (ranking by FinalScore, 2-min or 15-signal trigger)
    → PaperExecutionEngine.processSignal()
    → executeSimulatedTrade() (guardrails → EV gate → sizing → DB)
```

**Deprecated methods removed by Directive 8.8.4-A3.R9.3:**
- `scanForSignals()` — removed
- `checkSymbolForSignal()` — removed
- `injectForcedTrade()` — removed

All signal generation now flows exclusively through the FX5 → RTB → TCL pipeline.

---

## 2. Dual Execution Engine Architecture

### The Two Engines

| Property | PaperExecutionEngine | TradingEngine |
|----------|---------------------|---------------|
| **File** | `paper-execution-engine.ts` | `trading-engine.ts` |
| **Lines** | ~2,308 | ~766 |
| **Primary Mode** | Paper | Live + Paper |
| **Monitoring** | 1.5s cycle with re-entrancy guard | `monitorActiveTrades()` via strategyEngine |
| **Exit Logic** | Direct SL/TP/trailing/max hold checking | Delegates to `strategyEngine.checkExitConditions()` |
| **RTB Promotion** | Full multi-signal promotion (C.14.B) | None |
| **Pricing** | WebSocket priority + REST fallback | Direct Kraken REST |
| **P/L Breakdown** | Full C2 directive (gross/net/costs) | Basic (no cost breakdown) |
| **Expectancy Gate** | Yes (Directive 11.8B) | No |
| **SLAL Integration** | Yes | No |
| **Goal Alignment** | No (removed) | ⚠ **YES — still active** (lines 246-254) |
| **Partial Fills** | Not applicable (paper) | ⚠ **SIMULATED** with Math.random() |
| **Status** | **ACTIVE, primary engine** | **Secondary, contains placeholder code** |

### Key Asymmetry: Goal Alignment

The PaperExecutionEngine does NOT contain Goal Alignment logic (it was architecturally removed). However, the TradingEngine still computes and applies `goalAlignmentScore`:

```typescript
// TradingEngine, line 249:
signal.finalScore = (signal.confidence * 0.7) + (goalAlignmentScore * 0.3);
```

This is a **SECOND location** of Goal Alignment beyond `pre-execution-validator.ts` (identified in Phase 4). Kyle's deprecation directive covers pre-execution-validator.ts, but this TradingEngine location also needs removal.

---

## 3. PaperExecutionEngine (Primary)

**File**: `server/services/paper-execution-engine.ts` (~2,308 lines)
**Directive**: 11.0E (FinalScore Unification)
**Class**: `PaperExecutionEngine`

### 3.1 Configuration Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `SLIPPAGE_PERCENT` | 0.15% | Simulated entry/exit slippage |
| `FEE_PERCENT` | 0.10% | Simulated trading fee (both sides) |
| `MONITOR_INTERVAL_MS` | 1,500ms | Position check frequency |
| `MAX_PRICE_HISTORY` | 100 | Candle history per symbol |
| `RTB_TTL_SECONDS` | 30 | RTB signal expiry time |
| `CONTINUOUS_PROMOTION_INTERVAL_MS` | 30,000ms | RTB promotion loop interval |

### 3.2 Lifecycle: start()

The `start()` method initializes a comprehensive suite of subsystems:

1. **Idempotency guard** (Directive 8.8.4-A3.R9.0.B) — skips if already running
2. **LivePricingAdapter** — sets trading mode for WebSocket broadcasts
3. **Session timestamp** — sets `engineSessionStart` for RTB metrics
4. **AJ17/AJ18 diagnostics** — starts diagnostic sessions
5. **Kraken WebSocket** — starts adapter, sets I8C open positions provider
6. **I8C subscription** — subscribes ALL open position symbols on start
7. **RTB service** — cleans expired signals, starts 30s refresh cycle, sets engine start time
8. **TCL Watchdog** — starts with event-driven activation (2-min failsafe)
9. **Event listeners** — binds TCL_ACTIVATED and TRADE_CLOSED handlers
10. **Continuous promotion loop** (Directive 8.8.8) — 30s RTB promotion checks
11. **Covariance engine** (Directive 9.4) — loads OHLC for top 20 symbols, computes initial correlation matrix
12. **Monitoring interval** — starts 1.5s `monitoringCycle()`

### 3.3 Lifecycle: stop()

Mirrors start() in reverse:
1. Clears `isRunning`, cancels monitoring interval
2. Clears session start (zeroes RTB metrics)
3. Stops AJ17 diagnostics
4. Stops RTB refresh cycle and clears engine start time
5. Stops TCL Watchdog
6. Unbinds event listeners (includes stopping continuous promotion loop)
7. Stops I8C subscription audit
8. Stops Kraken WebSocket adapter

### 3.4 Monitoring Cycle

```typescript
monitoringCycle() // Every 1.5 seconds
  ├── Re-entrancy guard (isCycleRunning flag)
  ├── Skip if engine stopped
  ├── Track cycle timestamp (lastCycleAt)
  ├── Log ENGINE_TICK with position count
  ├── checkOpenPositions()  // Exit evaluation
  └── Note: Signal scanning REMOVED (Directive 8.8.4-A3.R9.3)
```

### 3.5 Position Exit Evaluation: checkOpenPositions()

For each open position:

1. **Price acquisition** — WebSocket cache first (2s stale threshold), REST fallback
2. **Mock price rejection** (Phase B9) — skips if price source is 'mock'
3. **Price tick logging** — ring buffer of last 100 ticks for cadence verification
4. **P/L calculation** — updates position with unrealized P/L
5. **Exit condition check** — calls `checkExitConditions()`
6. **Close if triggered** — calls `closePosition()` with full P/L breakdown

**Price source statistics tracked per cycle**: wsPrice, restPrice, withoutPrice, slHits, tpHits

### 3.6 Exit Conditions

The engine checks four exit conditions in order:

| Exit Type | Condition | Priority |
|-----------|-----------|----------|
| `target_hit` | `currentPrice >= takeProfit` | 1st |
| `stop_hit` | `currentPrice <= stopLoss` | 2nd |
| `trailing_stop_hit` | `currentPrice <= trailingStopPrice` (from metadata HWM) | 3rd |
| `max_holding_period` | `hoursHeld >= maxHours` (from metadata) | 4th |

### 3.7 Position Close: closePosition()

> **P19-B3a (2026-06-13):** both the open fill (`executeSimulatedTrade` §3.9) and the close fill (`closePosition` here) now route through the typed **OrderPlacer port** (`server/services/execution/types.ts` + `order-placer.ts`). The port wraps ONLY the fill (the slippage+fee math → a `FillResult`); the P/L breakdown + all bookkeeping below is UNCHANGED and consumes `fillResult.{fillPrice, feeQuote, slippageQuote}`. `PaperOrderPlacer` always returns `filled` (paper is sync/atomic/always-full); the `partial/delayed/rejected` variants + the **close-seam state rule** (a non-`filled` close leaves the position OPEN, retried next cycle — never half-closed) are the live-swap insurance (Option A, P19-B2: live reuses the paper engine by extension, swapping only this fill seam). Behaviour-identical extraction — Langston Step-4 confirmed fee-base, slippage-sign, close fee-rate source, and totalSlippage all identical. See SIM §9.14.

Implements Phase 8.8.3-C2 P/L breakdown:

```
Gross P/L = (exitPrice - intendedEntryPrice) × quantity
Total Cost = entryFee + exitFee + entrySlippage + exitSlippage
Net P/L   = Gross P/L - Total Cost
```

On close, the engine:
1. Computes full C2 cost breakdown
2. Applies B8.PNL anomaly guard (>100% move in <5 min)
3. Updates trade record with all cost fields
4. Logs exit event with C2 breakdown
5. Records VTS comparison audit (Directive M5C.1)
6. Logs AJ19-B close event with slot counts
7. Deletes open position
8. Unsubscribes WebSocket
9. Captures data for learning aggregation (Directive 8.8.4-L1)
10. Runs C5 P/L sanity check and balance reconciliation
11. Emits TRADE_CLOSED event (triggers RTB promotion)

### 3.8 Signal Processing: processSignal()

This is called from RTB promotion (`executePromotedSignal`). Flow:

1. Governance checks (strategy eligibility, mode resolution)
2. Regime stability check
3. Confidence floor check per strategy mode
4. Duplicate position guard (I7-PM-FOCUS C1) — **moved BEFORE trade creation**
5. Forward to `executeSimulatedTrade()`

### 3.9 Trade Execution: executeSimulatedTrade()

1. **Guardrail check** — `checkGuardrailRisk()` with pre-computed notional
2. **Net Expectancy Gate** (Directive 11.8B) — positive EV required
3. **Position sizing** — pre-sized quantity from P2 (paper) or fallback calculation
4. **Slippage/fee application** — SLIPPAGE_PERCENT + FEE_PERCENT
5. **Trade creation** — DB write with full cost metadata
6. **Position creation** — open position record
7. **WebSocket subscription** — subscribe to new symbol
8. **Trailing state initialization** (Directive 9.2.A)
9. **SLAL completion event** — records COMPLETED stage

### 3.10 Session Reset: resetSessionState()

Phase 8.8.3-B7.A hard reset clears all in-memory state:
- Running flags, monitoring interval
- Price history cache
- Session start timestamp (zeroes RTB metrics)
- Price tick diagnostics
- WebSocket subscriptions
- AJ17 diagnostics
- RTB refresh cycle

---

## 4. TradingEngine (Live-Capable) — DEFERRED (Kyle, 2026-02-16)

**File**: `server/services/trading-engine.ts` (~766 lines)
**Class**: `TradingEngine`
**Status**: ⏸️ **DEFERRED** — live mode is not in scope for architectural validation. Paper mode is authoritative.

> **Kyle's Decision (Phase 5 Addendum)**: TradingEngine currently uses legacy signal orchestration, contains simulated fills, includes goal alignment logic, and does not mirror paper execution core. **Defer refactor until paper mode is fully stable.** Future strategic fork: (A) Refactor trading-engine to mirror paper core, or (B) Delete and rebuild live engine from paper core. No action required now.
>
> **Scope note**: All BUG/RISK items in this section related to TradingEngine live-mode placeholder code (BUG-010, BUG-011, RISK-036) are **informational only** at this stage. They document known deficiencies that must be addressed before live trading, but are non-blocking for the current paper-mode-authoritative architecture.

### 4.1 Architecture

The TradingEngine is the **live-capable** execution engine. It:
- Manages a `SignalOrchestrator` for automatic signal generation (30s interval, 9 strategies)
- Processes signals through guardrails and slippage tolerance checks
- Executes trades via Kraken API for live mode
- Places bracket orders (stop-loss + take-profit) after live trade execution
- Monitors active trades via `strategyEngine.checkExitConditions()`

### 4.2 ⚠ CRITICAL: Goal Alignment Still Active

The TradingEngine computes Goal Alignment scores and applies them to FinalScore:

```typescript
// Lines 247-249:
const goalAlignmentScore = await this.calculateGoalAlignmentScore(signal, this.mode);
signal.goalAlignmentScore = goalAlignmentScore;
signal.finalScore = (signal.confidence * 0.7) + (goalAlignmentScore * 0.3);
```

**The `calculateGoalAlignmentScore()` method** (lines 128-226):
- Reads `profitability_vs_consistency` goal (1-10 scale)
- Computes risk/reward alignment (40% weight)
- Computes strategy risk profile alignment (30% weight)
- Computes signal confidence alignment (30% weight)
- Only covers 3 strategy profiles: `vwap_pullback`, `abcd_long`, `sma_trend_ride`

This is the **SECOND active location** of Goal Alignment. Kyle's deprecation directive in Phase 4 targeted `pre-execution-validator.ts`. This location needs to be added to the deprecation scope.

### 4.3 ⚠ CRITICAL: Simulated Partial Fills in Live Mode

Lines 346-388 of `executeTrade()` simulate partial fills using `Math.random()`:

```typescript
// Line 347:
const isPartialFill = Math.random() < 0.1; // 10% chance
const fillPercent = 50 + Math.random() * 39; // 50-89%
```

The comment says *"In a real implementation, we'd query the order status to get actual filled quantity"*. This is **placeholder code** that would cause incorrect quantity tracking in production live trading.

### 4.4 ⚠ Simulated Slippage/Fees in Live Mode

Lines 391-393 apply simulated costs even in live mode:

```typescript
entrySlippage = Math.random() * 0.1; // 0-0.1% slippage
entryFee = (actualEntryPrice * filledQuantity) * 0.0026; // Kraken taker fee
```

Live mode should derive actual slippage from fill price vs. signal price, and actual fees from Kraken API response.

### 4.5 Bracket Order Placement

For live trades, `placeStopAndTargetOrders()` places:
1. **Stop-loss** — `stop-loss` order with configurable buffer (default 5%)
2. **Take-profit** — `limit` sell order at target price

Includes **rollback logic**: if any bracket order fails, previously placed orders are cancelled. This is well-designed.

### 4.6 Trade Close

`closeTrade()`:
1. Cancels existing stop and target orders
2. Executes market sell order (live) or simulates (paper)
3. ⚠ Uses `Math.random() * 0.1` for exit slippage even in live mode
4. Records telemetry events

### 4.7 EngineSettingsBus

Hot-reload pub/sub for strategy settings changes. Subscribers can receive mode-based reload notifications. Used to propagate guardrail changes to running engines.

---

## 5. TrailingExitController

**File**: `server/services/trailing-exit-controller.ts`
**Directives**: 9.2.A (Dynamic Trailing Exit), 11.3A (Cost-Aware Ratchet), B65.2 (Functional engagement + moonbag qualifier + duration cap + concurrency cap)
**Status**: Engaged in production for both VTS and paper exit loops as of 2026-04-23 (B65.2). Was dormant from Phase 11 through that point.

> **B65.2 (2026-04-23) note:** This module is the canonical TEC. The Phase-11 percentage-based implementation (`server/services/execution-controller.ts`, Directive 11.0C) was deleted outright when this module was wired into production. The "TEC" label has been reassigned to this ATR-based service going forward. See SIM §B65.2 for the deletion + migration trail.

### 5.1 Two-Stage Latch System

The TrailingExitController implements a two-stage exit system. Both stages are gated by separate conditions and apply cost-aware floors:

```
Stage 0: TARGET mode (initial)
  │  Price gains break_even_trigger_r × ATR above entry (default 1.0)
  ▼
Stage 1: BREAK-EVEN LATCHED  (applies to ALL trades, regardless of strategy)
  │  Stop moves to netBreakeven (cost-aware)
  │  Trade can no longer become a net loser
  │  Dynamic trailing from HWM begins (still aiming at original target)
  │
  │  Price reaches target_lock_r × R above entry (default 1.5)
  │  AND moonbag qualifier check passes (strategy + sourcePool allowlist)
  │  AND moonbag concurrency cap allows entry
  ▼
Stage 2: TARGET LATCHED → TRAILING_TAKE mode  (moonbag — qualifying strategies only)
  │  ladderRung = 1 (B65.4)
  │  currentRungFloor = netTargetFloor of original target (cost-aware)
  │  currentRungTarget = original target + R_step (B65.4 — see §5.1.5)
  │  Duration cap timer starts (default 4h)
  │  active stop = max(currentRungFloor, dynamic_HWM_trail)
  │
  │  Each subsequent target hit (B65.4):
  │  ├─ ladderRung++
  │  ├─ currentRungFloor = netTargetFloor of just-hit target (locked-in profit)
  │  ├─ currentRungTarget += R_step (advance to next rung)
  │  └─ active stop = max(currentRungFloor, dynamic_HWM_trail)
  │
  └──> shouldClosePosition() returns true when:
       - price <= currentStopPrice (trailing_stop_hit, with ladderRungsHit captured), OR
       - duration > moonbag_max_duration_ms (moonbag_timeout)
```

If a target hit occurs but the qualifier check fails (non-qualifying strategy, or paper concurrency cap reached), the trade closes at target with reason `target_hit` and never enters TRAILING_TAKE mode.

### 5.1.5 Ladder ratchet (B65.4)

Where pure-trail (B65.2) had only a single target-latch event per trade and HWM-based dynamic trail thereafter, B65.4 turns each target hit into a "rung event":

- **Rung step size** = original entry-to-target distance. So if entry was $100 and target was $107.50 (1.5R), rung 1 advances target to $115, rung 2 to $122.50, rung 3 to $130, etc. Same R-multiple geometry the strategy designed.
- **Rung floor** = slippage-buffer floor placed ABOVE the just-hit target via `computeNetTargetFloor(rungTarget, costMetrics, multiplier)`. **B65.4.1 (2026-04-26):** the formula was originally `target * (1 - totalCost/2)` (floor BELOW target — allowed reversals to give back gain) but was hotfixed to `target * (1 + slippage * multiplier)` (floor ABOVE target — locks in at-or-above just-hit target value on stop-out). Multiplier is `module_constants.trailing_exit.rung_floor_slippage_buffer_multiplier` (seed 1.0). Multi-rung ratcheting still works as before; only the per-rung floor placement changed.
- **Active stop** = `max(currentRungFloor, dynamic_HWM_trail)` where the HWM dynamic trail (B65.2) is preserved as a SECONDARY floor. If price runs significantly past current rung target without crossing the next one, the dynamic trail captures the upside; if it stays just past the rung target, the rung floor binds.
- **Multi-rung gap handling** — a single price update that gaps past multiple rung targets ratchets through all crossed rungs in sequence (while-loop in `updatePosition`). Each rung locks its floor before advancing.
- **Backward compat** — pre-B65.4 persisted states (`targetLatched=true` without ladder fields) migrate on `importStates()` to `ladderRung=1, currentRungTarget=originalTarget, currentRungFloor=0`. Engine reconciles correctly from `currentPrice` on the next cycle.
- **`ladderRungsHit` captured on close** — the closed-trade record carries the rung count. Trade with `trailing_stop_hit` and `ladderRungsHit=3` ran past original target plus two more rung targets before reversing. Trade with `ladderRungsHit=1` reached original target then reversed before rung 2.
- **B65.4.2 observability columns (2026-04-28)** — `paper_sim_trades` adds `original_stop_price`, `latch_trigger_price`, `rung_target_history` columns. TrailingState captures `originalStopPrice` at init, `latchTriggerPrice` at first target latch, `rungTargetHistory[]` appended at each ratchet. Surfaced in both open + closed CSV exports + `/api/vts/ml/open`. Made the ladder counterfactual analysis report (template at `B65_4_1_LADDER_TABLE_2026_04_28.md`) readable directly from CSV without grepping PM2 logs.

### 5.1.1 Moonbag Qualifier (B65.2)

Strategies that qualify for moonbag mode on target hit are stored in `module_constants.trailing_exit.moonbag_qualifying_strategies` (default: `["strong_bull_trend", "sma_trend_ride", "vwap_pullback", "breakout"]`). Some strategies have additional source-pool constraints in `module_constants.trailing_exit.moonbag_qualifying_source_pools` (default: vwap_pullback only qualifies in `quant-strong_trend` source pool).

### 5.1.2 Concurrency Cap (B65.2)

Cap behavior is per-mode and tunable:
- **VTS** — unlimited (observation goal: see trailing behavior at scale).
- **Paper / Live** — reserved-slots model. Max concurrent moonbags = current slot total − `moonbag_reserved_slots` (default 1). Scales automatically as portfolio grows; small portfolios get protection (small slot count → cap binds and reserves at least one slot for fresh setups), large portfolios find the cap effectively non-binding.

Cap state is tracked in a per-mode counter (`concurrentMoonbagByMode`) that decrements on `clearTrailingState()` and rebuilds on `importStates()` for restart-safety.

### 5.1.3 Duration Cap (B65.2)

Once a trade enters TRAILING_TAKE mode, a timer starts. If the trade remains in TRAILING_TAKE longer than `module_constants.trailing_exit.moonbag_max_duration_ms` (default 14400000ms = 4h), the engine emits a `moonbag_timeout` close decision regardless of where the trailing stop sits. Prevents moonbag trades from indefinitely tying up trade slots.

### 5.2 Cost-Aware Floors (Directive 11.3A)

Traditional trailing stops use gross prices. Directive 11.3A uses **net-aware floors** that account for execution costs:

- `netBreakeven = computeNetBreakeven(entryPrice, costMetrics)` — accounts for entry/exit fees and slippage
- `netTargetFloor = computeNetTargetFloor(targetPrice, costMetrics)` — ensures profit target accounts for costs

These floors are imported from `core/math/cost-model.ts`.

### 5.3 Dynamic Trailing Stop Calculation

```
K' = calculateDynamicStopDistance(DI, VolNoise)
TrailingStopPrice = calculateTrailingStopPrice(HWM, ATR, DI, VolNoise)
FinalStop = max(floorStop, dynamicStop)
```

Where:
- `HWM` = high water mark (tracks maximum price since entry)
- `ATR` = average true range
- `DI` = directional integrity
- `VolNoise` = volatility noise estimate

### 5.4 State Management

- **In-memory**: `Map<string, TrailingState>` keyed by symbol
- **Persistence**: Debounced writes (5s) to `/tmp/trailing-states.json` via `schedulePersistence()`
- **DB sync**: On mode change, `syncTradeModeToStorage()` updates the trade mode in the database
- **Export/Import**: `exportAllStates()` and `importStates()` for persistence

### 5.5 Interface: TrailingState

```typescript
interface TrailingState {
  symbol: string;
  tradeMode: TradeMode;        // 'TARGET' | 'TRAILING_TAKE'
  entryPrice: number;
  targetPrice: number;
  currentStopPrice: number;
  highWaterMark: number;
  breakEvenLatched: boolean;
  targetLatched: boolean;
  lastUpdated: number;
  DI: number;
  VolNoise: number;
  ATR: number;
}
```

---

## 6. MicroExecutionService — Experimental/Dormant (Kyle Accepted, 2026-02-16)

**File**: `server/services/micro-execution-service.ts` (~374 lines)
**Phase**: 27.F.14.MICRO
**Status**: 🟡 **Experimental, dormant, non-interfering** — leave hidden per Kyle. Revisit only if micro-price trading becomes intentional.

### 6.1 Purpose

Lightweight high-frequency loop that re-checks Ready-to-Buy pairs between main monitoring cycles. Triggers execution when price moves significantly.

### 6.2 Safety Parameters

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `intervalMs` | 8,000ms | Check frequency |
| `priceDeltaTrigger` | 0.30% | Minimum price change to trigger |
| `COOLDOWN_MS` | 15,000ms | Per-symbol cooldown |
| `MAX_EXECUTIONS_PER_MINUTE` | 5 | Rate limit |
| `STABILITY_WINDOW_MS` | 3,000ms | Price stability requirement |

### 6.3 Key Behaviors

- **Paper-mode only** — `start()` returns immediately if `mode === 'live'`
- **Configuration** — loaded from `guardrails_v2` but uses hardcoded defaults for micro-specific params
- **Price tracking** — via `updatePrice()` from WebSocket feed
- **Watchlist scanning** — reads from `storage.getWatchlist()` for RTB pairs

### 6.4 ⚠ triggerSymbolCheck() Is a TODO Stub

The method that should actually trigger execution is unimplemented:

```typescript
// Line ~250 (approximate):
console.log(`[MicroLoop] Would trigger execution check for ${symbol}`);
```

This means the MicroExecutionService **detects price movements but cannot act on them**. It logs that a check should happen but does not call the execution engine. Not blocking (the main 1.5s monitoring loop handles execution), but the service is incomplete.

---

## 7. ModeRegistry & Engine Instance Management

**File**: `server/services/mode-registry.ts` (~162 lines)
**Phase**: 27.F.15.B.4 (Production Telemetry)

### 7.1 Runtime Legacy Guard

At module load time, ModeRegistry blocks legacy engine usage:

```typescript
if ((global as any).PaperExecutionServiceLegacy) {
  throw new Error('[B9][FATAL] Legacy PaperExecutionService is not supported...');
}
```

### 7.2 Engine Instance Registry

Stores global references to engine instances per mode:

- `registerEngine(mode, engine)` — stores PaperExecutionEngine reference
- `getEngine(mode)` — retrieves engine for a mode
- `registerMicroService(mode, service)` — stores MicroExecutionService reference
- `getMicroService(mode)` — retrieves micro service for a mode

### 7.3 Mode Status Tracking

```typescript
interface ModeStatus {
  engineStatus: 'stopped' | 'starting' | 'running' | 'paused' | 'error';
  riskSummary: Record<string, any>;
  alerts: number;
  trades: number;
  lastUpdate: Date;
}
```

Status changes are broadcast via `contextBridge` for real-time UI updates.

---

## 8. Lifecycle Events Service

**File**: `server/services/lifecycle-events.ts` (~177 lines)
**Directive**: REB 2.12D Part A

### 8.1 Three Lifecycle Events

| Event | Trigger | Payload |
|-------|---------|---------|
| `signalValidated` | Signal passes all validation checks | mode, symbol, strategy, confidence, validation details |
| `readyToTrade` | Signal approved and ready for execution | mode, symbol, strategy, entry/stop/target, quantity, risk |
| `paperTradeExecuted` | Paper trade successfully executed | tradeId, positionId, symbol, strategy, prices, costs |

All events:
- Add ISO timestamp
- Increment internal counters
- Broadcast via `contextBridge` (type: 'trade_event')
- Record telemetry metric ('signal_emit')

---

## 9. Signal Lifecycle Audit Layer (SLAL)

**File**: `server/core/audit/signal_lifecycle_audit.ts`
**Phase**: 8.8.4-A

### 9.1 Seven Lifecycle Stages

```
GENERATION → SIZING → VALIDATION → QUEUED → PROMOTED → EXECUTION → COMPLETED/REJECTED
```

### 9.2 Fourteen Rejection Reasons

| Reason | Description |
|--------|-------------|
| `INVALID_SIGNAL` | Malformed signal (missing fields) |
| `ZERO_SIZE` | Sizing returned 0 quantity |
| `GUARDRAIL_BLOCKED` | Risk guardrail rejected |
| `MAX_POSITIONS` | Max open positions reached (legacy alias) |
| `MAX_TRADES` | Max simultaneous open trades limit |
| `SLOT_CONFLICT` | Post-guardrail slot capacity overflow |
| `DAILY_LOSS_LIMIT` | Kill switch triggered |
| `SYMBOL_COOLDOWN` | Symbol on cooldown |
| `POSITION_CAP` | Position size cap exceeded |
| `DUPLICATE_POSITION` | Already have position in symbol |
| `EXECUTION_FAILED` | Trade execution failed |
| `EXPIRED_SIGNAL` | Signal TTL expired |
| `NO_PRICE` | Could not get reliable price |
| `SQE_QUALITY_REJECT` | Failed SQE quality thresholds |

### 9.3 Signal Journey Tracking

Each signal gets a `SignalJourney` with:
- 30-minute TTL
- Maximum 5,000 concurrent journeys
- 10,000 event history ring buffer
- Strategy-level breakdown metrics
- Success rate tracking

### 9.4 SLAL Metrics

Exposes comprehensive metrics including:
- Signals generated/sized/validated/executed/completed/rejected
- Rejections by reason and by stage
- Average generation-to-completion time
- Per-strategy success rates

---

## 10. Execution Timing Service

**File**: `server/services/execution-timing.ts` (~274 lines)

### 10.1 Timing Marks

Tracks four critical timestamps per order:

```
t_decide → t_submit → t_ack → t_fill
```

### 10.2 Computed Metrics

- `submit_ack_ms` — time from order submission to exchange acknowledgement
- `ack_fill_ms` — time from acknowledgement to fill
- `total_ms` — end-to-end execution time
- `slippage_bps` — slippage in basis points

### 10.3 Storage

- 1,000-order history ring buffer
- CSV export capability for external analysis

---

## 11. Trade Flow Types (Directive 11.0B) — DELETED in B65.2

**File**: `server/types/trade-flow.ts` — **DELETED 2026-04-23 (B65.2)**

This file was deleted alongside the Phase-11 `execution-controller.ts` (Directive 11.0C) when the dormant Trade Execution Controller was removed in favor of the now-engaged ATR-based trailing engine (`trailing-exit-controller.ts`, see §5). The types it defined (`TradeSignal`, `ExecutionIntent`, `ExitDecision`, `ActiveTrade`, `TradeOrder`, `AdaptiveSizeResult`, `TradeExecutionController`, `Trendline`) were exclusively consumed by the deleted execution-controller and had no other importers. Orphan check during deletion confirmed zero remaining references.

The exit-decision shapes used in the active codebase now live in:
- `server/services/tec-evaluator.ts :: TECExitInput`, `TECExitDecision`, `TECExitReason`
- `server/services/trailing-exit-controller.ts :: TrailingState`, `PositionUpdate`, `TrailingUpdateResult`, `CallerMode`

No replacement file was created for the deleted types — the new types live with the consumers that use them.

### 11.2 ⚠ StrategyType Mismatch — RESOLVED-BY-DELETION (B65.2)

The 9-strategy `StrategyType` union type that lived in this file (and triggered RISK-033 in CHANGES_AND_FIXES) is no longer a concern: the file was deleted in B65.2 and the active `StrategyType` definitions in the live codebase (e.g. `server/services/trade-executor.ts`, `paper-execution-engine.ts`) carry the full 17-strategy roster. The original BUG-002/BUG-003 mismatch is now strictly historical.

### 11.3 Trade Lifecycle Flow Documentation — superseded

The flow diagram that lived in the deleted file's header has been superseded by the engaged trailing-exit pipeline documented in §5 (TrailingExitController) and §11.7S references in §Phase 4. The canonical post-B65.2 lifecycle flow is:

```
[Signal Orchestrator] (exposure, correlation, cooldown)
     ↓
[SQE] (FinalScore + RegimeWeight; not active in VTS path)
     ↓
[Ready-to-Buy Queue] (2-min or 15-signal trigger; paper/live only)
     ↓
[TCL] (FinalScore ranking)
     ↓
[Mode Overlay (Directive 11.7S)] (NORMAL/DEFENSIVE/SURVIVAL multipliers on size/stop/target/confidence/cooldown)
     ↓
[Trade open: ATR/DI/VolNoise snapshot stored on trade record]
     ↓
[Per-cycle exit evaluation: tec-evaluator.evaluateTECExit]
     │  ├─ Stale-price branch (no price + held > MAX_HOLD_MS → close at entry)
     │  ├─ MAX_HOLD timeout branch
     │  ├─ Static stop/target branch (when useTrailing=false; VTS pre-B65.2)
     │  └─ Trailing engine branch (when useTrailing=true; B65.2+ for both VTS + paper)
     │     └─ trailing-exit-controller.updatePosition (see §5)
     │        ├─ Stage 1: Break-even latch on 1×ATR gain → stop ratchets to net-breakeven
     │        ├─ Stage 2: Target latch + moonbag (if qualifier + cap permit) → TRAILING_TAKE
     │        ├─ Duration cap: moonbag_max_duration_ms exceeded → moonbag_timeout
     │        └─ Stop hit (any stage): close at currentPrice or stop, depending on stage
     ↓
[Order Management]
     ↓
[Closed-trade write: trade_mode + exit_reason captured across all 4 trade-row tables]
```

The dormant Phase-11 TEC (`execution-controller.ts`) that was previously cited at the bottom of this flow is gone; the trailing-exit-controller now occupies that slot.

---

## 12. Execution Configuration — `module_constants` (B65.1)

**File**: `server/services/module-constants-service.ts`
**Schema**: `shared/schema.ts :: moduleConstants` table
**Migration**: `drizzle/migrations/2026-04-23-b65-create-module-constants.sql` + `2026-04-23-b65-2-trailing-exit-seeds-and-trade-mode.sql`
**Status**: Active since 2026-04-23 (B65.1). Replaces the deleted `server/config/execution-config.ts` (Directive 11.0C, frozen const file deleted in B65.2).

### 12.1 Resolution model

5-dimensional keyed lookup: `(module_name, exchange, asset_class, strategy, regime, constant_name) → JSONB value`. Most-specific row wins, with dimension weights:

| Dimension | Weight | Rationale |
|---|---|---|
| regime | 8 | Most specific. Per-regime calibration is the primary axis for adapting to market conditions. |
| strategy | 4 | Per-strategy tuning beats infrastructure specificity. |
| asset_class | 2 | Asset-class tuning meaningful but lower priority than strategy/regime. |
| exchange | 1 | Lowest-priority axis; usually the broadest override (e.g. fee schedule). |

Wildcard rows use `'*'` literal in any dimension. A row matching `(module=trailing_exit, exchange=*, asset_class=*, strategy=strong_bull_trend, regime=*)` (score 4) beats a row matching `(module=trailing_exit, exchange=kraken, asset_class=crypto_spot, strategy=*, regime=*)` (score 1+2=3).

### 12.2 Cache

Per-`module_name` cache with 60s TTL (mirrors MCE pattern). Resolution is in-memory per-read against the cached rowset. Cache cleared via `clearModuleConstantsCache()` (used in tests).

### 12.3 Service API

```typescript
// Resolve one constant value for the given context
getConstant<T>(moduleName, constantName, key: ResolutionKey): Promise<T | undefined>

// Bulk-resolve all constants under a module for the given context
getModuleConstants(moduleName, key: ResolutionKey): Promise<Record<string, unknown>>

// Write a constant (admin/operator path)
setConstant(moduleName, constantName, key: Partial<ResolutionKey>, value, updatedBy)

// Cache management
invalidateModuleCache(moduleName): void
clearModuleConstantsCache(): void
```

`ResolutionKey` is `{ exchange, assetClass, strategy, regime }` — all four fields required by the caller (use `'*'` to match wildcard rows when a specific value isn't relevant).

### 12.4 Live consumers

| Consumer | Module read | Constants used |
|---|---|---|
| `trailing-exit-controller.ts` | `trailing_exit` | `break_even_trigger_r`, `target_lock_r`, `trail_distance_atr_multiplier`, `persistence_debounce_ms`, `moonbag_qualifying_strategies`, `moonbag_qualifying_source_pools`, `moonbag_max_duration_ms`, `moonbag_cap_mode`, `moonbag_reserved_slots` |
| `dynamic-sizing-engine.ts` | `risk_sizing` | `max_position_risk` (migrated from deleted `EXECUTION_CONFIG.MAX_POSITION_RISK`) |
| `telemetry-aggregator.ts` | (no DB read; sync mirror) | Hardcoded mirror of seed values for the diagnostic `tecConfig` payload (sync function constraint — authoritative live values are read directly by per-trade consumers) |

### 12.5 Migration history (B65.2)

The Phase-11 `EXECUTION_CONFIG` const was deleted in B65.2. All live consumers were migrated to `module_constants` BEFORE the file deletion to keep the build green. The Phase-4 RISK-031 (DSE 2% cap vs. guardrails 10/30%) is no longer file-pinned — it's a `module_constants.risk_sizing.max_position_risk` row that can be tuned per (exchange, asset_class, strategy, regime) without redeploy. The semantic concern (DSE caps before the guardrail can bind) remains and is tracked in CHANGES_AND_FIXES as RISK-031, deferred per Kyle.

### 12.6 DB bootstrap (B-NEW-43 Phase 2 chunk 4, 2026-05-23)

Two paths exist for setting up a fresh Postgres for DawnTrader:

**Path A — Fresh empty Postgres (CI, new dev environments, eventual production from scratch):**

```bash
# 1. Set DATABASE_URL pointing at the empty PG.
# 2. Run db:migrate top-to-bottom.
DATABASE_URL=postgresql://user:pass@host:5432/db npm run db:migrate
```

`scripts/db-migrate.ts` reads `drizzle/migrations/MANIFEST.txt` (REQUIRED — hard-fails if missing), validates that every non-rollback `.sql` file in `drizzle/migrations/` is in the manifest exactly once (catches drift at PR-time), then applies migrations in manifest order. The first manifest entry is `2026-04-22-initial-schema.sql` — the pg_dump of the schema state that existed on staging Supabase before B65.1-HF3 (2026-04-23) introduced the file-based migration runner. Every subsequent manifest entry is a delta against that baseline.

**Path B — Bootstrap from staging dump (cloning staging to a new environment):**

```bash
# 1. pg_dump --schema-only --no-owner --no-privileges --schema=public staging
#    apply to the new empty PG.
# 2. Mark 2026-04-22-initial-schema.sql as already applied:
psql "$DATABASE_URL" -f 1-system-manual/staging-coordination/2026-04-22-initial-schema-mark-applied.sql
# 3. Run db:migrate — it will skip the initial-schema entry (ledger says applied)
#    and apply only the deltas.
DATABASE_URL=... npm run db:migrate
```

The staging-coordination SQL exists because staging itself is in this state: it has the schema from the pre-file-runner era, never marked in the `_migrations` ledger as having applied a named "initial-schema" migration. Before the next staging `db:migrate` run after B-NEW-43 Phase 2 chunk 4 lands, run the coordination SQL on staging to insert the ledger row.

**Why this matters:** without the bootstrap path being explicit, a future env-bootstrap that copies the staging schema would hit "type already exists" / "table already exists" on first `db:migrate`, abort the entire batch (transactional), and the operator would have no obvious path forward. The coordination SQL is the documented, repeatable bypass for the bootstrap-from-dump case.

---

## 13. TradeBob (Cache Layer)

**File**: `server/services/bob-trade.ts` (~252 lines)
**Phase**: 27.F.15.A

### 13.1 Purpose

TradeBob is a cache layer for trade data with a 1-second TTL. It sits between API consumers and the database, reducing query load for frequently-accessed trade data.

### 13.2 Key Behaviors

- **1-second TTL** — cache expires after 1s, forcing fresh DB reads
- **Event-driven invalidation** — trade changes trigger cache clear
- **Global scope** — Phase 27.F.15.A: no userId filtering for trades (mode-based only)
- **BobCore integration** — extends the BobCore caching framework

---

## 14. Execution Policy Controller — LEGACY (Kyle Confirmed, 2026-02-16)

**File**: `server/services/execution-policy-controller.ts` (~309 lines)
**Phase**: 22 (NLAI Autonomy)
**Status**: 🔴 **LEGACY — Formally deprecated with NLAI system (Kyle, 2026-02-16)**

### 14.1 Purpose (Historical)

The ExecutionPolicyController was the **Walter/NLAI approval layer** for autonomous actions. It checked whether an NLAI agent had permission to execute specific actions based on user-configured approval matrices.

### 14.2 Approval Flow (Historical)

```
NLAI Action Request
    → Check user permissions
    → Map action to approval key (e.g., 'update_risk_per_trade' → 'modifyGuardrails')
    → Check approval matrix
    → Calculate projected risk
    → Create execution log
    → Approve or create pending approval record
```

### 14.3 Kyle's Deprecation Decision

**Phase 5 Addendum (Kyle, 2026-02-16)**: NLAI is formally deprecated as legacy conversational control infrastructure.

**What NLAI was**: The Natural Language Action Interpreter — Walter AI's command bridge. It parsed chat commands, routed them through the execution broker, called the same service functions UI buttons call (guardrails, goals, watchlist, start/stop trading), and published events.

**What NLAI did NOT do**: It did NOT inject signals, modify scoring, alter VTS, or override execution math. It was architecturally safe and scoped — but no longer aligned with system direction.

**Why deprecated**: Walter has been deprecated. Conversational goal system removed. Goals tab removed. System now operates via deterministic UI and services. NLAI is legacy conversational control infrastructure.

**Removal scope** (Kyle directive):
- `nlai-interpreter.ts`
- `contextual-nlai-interpreter.ts`
- `nlai-execution-broker.ts`
- `nlai-action-registry.ts`
- ExecutionPolicyController approval hooks (if exclusively used by NLAI)
- NLAI-related cluster bus events
- NLAI-related routes
- Goal-update command handlers
- Any residual Walter-specific context logic

**Note**: Future ML integration may reintroduce command routing, but that will be deliberate and redesigned.

### 14.4 Conditional Removal: ExecutionPolicyController

Kyle's directive: *"If ExecutionPolicyController is used solely as NLAI approval gate: Remove with NLAI. If it also controls execution style within PaperExecutionEngine: Simplify to static behavior."*

**Audit finding**: ExecutionPolicyController is imported only by NLAI-related modules (nlai-execution-broker). It does NOT control execution behavior within PaperExecutionEngine.

**Verdict**: Remove with NLAI.

---

## 15. NLAI Execution Broker — LEGACY (Kyle Confirmed, 2026-02-16)

**File**: `server/services/nlai-execution-broker.ts` (~477 lines)
**Status**: 🔴 **LEGACY — Remove with NLAI system**

### 15.1 Purpose (Historical)

Dispatched NLAI actions through the ExecutionPolicyController for approval, then executed approved actions through `nlaiActionRegistry`.

### 15.2 Key Features (Historical)

- **30-second execution timeout** per action
- **100-order execution log** ring buffer
- **`dispatchMultiple()`** — sequential multi-intent execution
- **Cluster bus events** — emits coordination events for other services
- **Conversational filter** — filters out conversational intents before dispatch

### 15.3 Deprecation Verdict

**LEGACY** — deprecated with entire NLAI system per Kyle (2026-02-16). Remove alongside all NLAI files listed in Section 14.3.

---

## 16. Unified Price Cache

**File**: `server/services/price-cache.ts` (~448 lines)
**Directive**: 8.8.4-A4.R10R-4 (Core System Hardening)
**Status**: 🔒 **LOCKED MODULE** — changes require formal directive

### 16.1 Priority Buckets

| Bucket | Refresh Interval | Purpose |
|--------|-----------------|---------|
| `openTrade` | 2,000ms | Active position monitoring |
| `readyToBuy` | 15,000ms | RTB candidate pricing |
| `fx5Snapshot` | 30,000ms | Scanning/analysis |
| `vtsSimulation` | 60,000ms | VTS cache sandbox (Directive 11.0E.2) |

### 16.2 Rate Governance

- Maximum 10 weighted requests per second to Kraken API
- Batch size: 100 symbols per API call
- Weight budget with retry logic (max 20 retries, 250ms delay)
- Health logging every 60 seconds

### 16.3 Key Methods

- `subscribe(symbol, bucketType)` — add symbol to a bucket
- `unsubscribe(symbol)` — remove from all buckets
- `getPrice(symbol, bucketType)` — get cached or fetch fresh
- `getBatch(bucketType, symbols)` — batch retrieval for FX5
- `updateFromWebSocket(symbol, price)` — inject WS prices
- `updateFromRest(symbol, price)` — inject REST prices

---

## 17. Paper Simulation Service

**File**: `server/services/paper-sim-service.ts`

### 17.1 Session Management

Manages paper simulation sessions with:
- **Idempotent start/stop** — database as single source of truth
- **Stale busy flag auto-clear** — 10-second threshold
- **Orphaned manager detection** — cleanup of abandoned sessions
- **Balance confirmation** — 24-hour staleness check

---

## 18. Exit Condition Architecture

DawnTrader's exit management operates through multiple layers:

### 18.1 Exit Hierarchy

```
Layer 1: PaperExecutionEngine.checkExitConditions()
  │  Checks: target_hit, stop_hit, trailing_stop_hit, max_holding_period
  │  Frequency: Every 1.5 seconds
  │
Layer 2: TrailingExitController.updatePosition()
  │  Checks: break-even latch, target latch, dynamic trailing
  │  Updates: stop price based on HWM, DI, VolNoise, ATR
  │  Triggers: shouldClosePosition() when price <= currentStopPrice
  │
Layer 3: MicroExecutionService.microCheck()
  │  Checks: price delta trigger on RTB pairs
  │  Frequency: Every 8 seconds (paper mode only)
  │  ⚠ Status: triggerSymbolCheck() is TODO stub
  │
Layer 4: Kill Switch (from Phase 4)
  │  Triggers: daily_loss_kill_switch_pct exceeded
  │  Effect: Emergency shutdown of all trading
```

### 18.2 Exit Close Reason Mapping

```typescript
const closeReasonMap = {
  'stop_hit': 'SL',
  'target_hit': 'TP',
  'trailing_stop_hit': 'TRAILING_STOP',
  'max_holding_period': 'UNKNOWN',  // ← Could be improved
  'guardrail': 'KILL_SWITCH',
  'manual_stop': 'MANUAL'
};
```

---

## 19. RTB Promotion Pipeline

### 19.1 Event-Driven Promotion

RTB promotion is triggered by three mechanisms:

1. **TCL_ACTIVATED event** — when TCL watchdog confirms readiness
2. **TRADE_CLOSED event** — when capacity is freed by a closing trade
3. **Continuous promotion loop** (Directive 8.8.8) — 30-second timer checks

### 19.2 Multi-Signal Promotion (Phase C.14.B)

```
checkRtbPromotion()
  ├── Check TCL active via tclWatchdog
  ├── Calculate openSlots = maxTrades - openPositions
  ├── Get rankedSignals (up to openSlots count)
  └── For each signal:
        ├── Check FinalScore >= 0.35 (MIN_FINAL_SCORE)
        ├── Remove from RTB queue FIRST (Directive A3.R1)
        ├── executePromotedSignal() → processSignal()
        ├── If success: update signal with tradeId, emit PROMOTION event
        └── If fail: signal already removed, not restored (⚠ potential issue)
```

### 19.3 ⚠ Failed Promotion Not Restored

When `executePromotedSignal()` fails, the signal has already been removed from the RTB queue (Step 1 of Directive A3.R1) but is NOT restored. The code explicitly acknowledges this:

```
console.warn('[8.8.4-A3.R1][PROMOTION_ORDER] Signal was removed from RTB but trade failed - signal not restored');
```

This is a design trade-off to prevent double-activation, but means failed promotions lose signals permanently.

### 19.4 — B79.0n.RTB: Per-class queue partitioning (2026-05-27)

B79.0n.RTB (sub-batch 11 of 18 in the B79.0n umbrella v4 arc) extends every previously-global RTB surface to per-class. Schema-side: `rtb_signals.asset_class VARCHAR(32)` first-class column with 4-phase production-safe migration. Code-side: `signalBuckets: Map<AssetClass, Map<number, Set<string>>>` nested per-class buckets in `rtb-refresh-service.ts` (Langston C-1 Option A — starvation-safe under shared CPU pressure). Module-constants seed: 4 `rtb_config.refresh_interval_ms = 30000` rows across crypto_spot/crypto_perp/xstock_spot/xstock_perp (uniform value per Kyle directive; per-class plumbing exists so xstock value can change via DB-only update later without code change).

**Class-invariant FSM thresholds via `_RTB_GK` wildcard.** All 8 FSM-threshold read sites in `ready_to_buy_service.ts` (lines 149/163/186/205/212/215/218/1090/1458) use the wildcard resolver `_RTB_GK = { exchange: '*', assetClass: '*', strategy: '*', regime: '*' }`. Per Langston C-8 §3.4 lock — FSM thresholds (TCL barrier, signal threshold live, promotion gates) are class-invariant today. Per-class divergence requires EXISTS-gated explicit-row evidence (e.g., xstock active-trading observability evidence) before promoting the wildcard to per-class seeds.

**Shared global ACT pool preserved.** Adaptive Concurrency Tuner (ACT pool 3-10 default 5) is shared across all 4 active classes per Langston C-2. ACT measures process-level CPU, not asset-class metric; per-class isolation comes from Option A nested buckets, not from ACT split.

**New per-class observability:**
- `getQueueDepth(): Record<AssetClass, Record<TradingMode, number>>` — hierarchical count Map keyed by class → mode → depth.
- `getQueuedSignals(mode, assetClass?)` + `getRankedSignals(mode, limit, assetClass?)` — optional per-class filter for hot read paths via the new `rtb_signals_mode_asset_class_status_idx` composite index.

**Legacy `rtb_queue_refresher.ts` RETIRED.** Zero production callers verified via Grep across server/client/shared. `ReadyToBuyService.startRefreshCycle` is canonical via `PaperExecutionEngine` lifecycle. `server/index.ts` retired-comment block at line 1329 references the deletion.

**Boot pre-warm + HARD-FAIL.** `server/index.ts` enumerates 4 active classes + their cadence values at boot; HARD-FAIL via `process.exit(1)` if any rtb_config.refresh_interval_ms row missing. Log line: `[B79.0n.RTB][BOOT] 4-class refresh cadence loaded: crypto_spot=30000ms crypto_perp=30000ms xstock_spot=30000ms xstock_perp=30000ms`.

**4-phase migration pattern (canonical reference for future asset-class column adds).** Phase 1 nullable `ADD COLUMN` + module_constants seed → Phase 2 backfill script with dual-path metadata-jsonb→`resolveAssetClass` fallback → Phase 3 `CHECK` constraint + composite index (precondition gate: 0 nulls) → Phase 4 `SET NOT NULL` contingent on 48h zero-null gate. Captured as ASSET_CLASS_ONBOARDING_WORKFLOW §4.20 with B79.0n.RTB as worked example.

**LOCKED-module override pattern (canonical reference for Kyle-authorized per-class scope without algorithmic redesign).** `rtb-refresh-service.ts` `signalBuckets` topology refactor authorized per umbrella v4 row #11: per-class bucket allocation + per-class pool sizing + per-class ACT calibration in scope; algorithmic redesign / cadence changes / ACT scaler rewrites OUT of scope. Captured as ASSET_CLASS_ONBOARDING_WORKFLOW §4.21 with B79.0n.RTB as worked example.

**Active-trading impact today ZERO.** paper_sim_trades + trades both empty; per-class buckets stay empty until scanner pipeline emits signals; structural pre-warm-only exercise. Active signal flow lands in WIRE-IN (#16).

**Cross-references.**
- SIM "Recent additions (B79.0n.RTB — Phase 24 — 2026-05-27)" mirrors the component-level enumeration with blast-radius analysis.
- ASSET_CLASS_ONBOARDING_WORKFLOW §4.20 (4-phase migration pattern) + §4.21 (LOCKED-module override pattern) codify the reusable shapes.

### 19.7 — B79.0n.EXECUTION: TradeClosedEvent additive assetClass + SSOT cleanup + diagnostic v2 (2026-05-27)

B79.0n.EXECUTION (sub-batch 13 of 16 in B79.0n umbrella v4 arc) is the last per-class plumbing sub-batch before WIRE-IN (#14, Phase 19a). Three surgical changes land: (1) the TRADE_CLOSED event payload gains an optional `assetClass?: string` field for downstream disambiguation; (2) the outcomeFeedback hook at the trade-close path switches from re-resolve to read-from-record SSOT discipline; (3) the orchestrator-per-class-state diagnostic endpoint restructures to a nested-by-layer payload with an inline knownGaps registry.

**TradeClosedEvent additive field (CHUNK A).** `server/lib/event-bus.ts:24-51` extends the `TradeClosedEvent` interface with `assetClass?: string` mirroring the `PromotionEvent.assetClass` C-7 doctrine from B79.0n.RTB (now codified in ASSET_CLASS_ONBOARDING_WORKFLOW §4.23 as the "additive event-payload field pattern"). The emit site at `paper-execution-engine.ts:1545` populates from `position.assetClass` — read from the canonical SSOT (write at L2147 `createPaperSimOpenPosition` per B79.TEC Finding 2), NOT re-resolved from symbol. A canary log line `[B79.0n.EXECUTION][EMIT_TRADE_CLOSED] mode= class= symbol= tradeId=` fires on every close per Langston Step 2 B2 mitigation — gives operators a runtime witness that `assetClass` populates correctly per class once xstock active trading lights up at WIRE-IN. All 3 listeners (paper-execution-engine self-handler at L184-188 mode-filter only, c13-validation-service at L103-107 collection only, c14-validation-service at L123-127 collection only) verified safe via Step 1.b A2 grep — zero JSON.stringify/structured-clone/telemetry-emit production hits on `TradeClosedEvent` shape. Same C-7 doctrine: consumers that need to disambiguate read this field, consumers that don't are unaffected.

**Position-record SSOT cleanup (CHUNK B).** `paper-execution-engine.ts:1376` (outcomeFeedback hook) switches from `safeResolveAssetClass(position.symbol, 'kraken')` re-resolve to `position.assetClass ?? safeResolveAssetClass(position.symbol, 'kraken')` belt-and-suspenders fallback. Per Langston Step 2 B2 reframe: the fallback is **defensive, NOT load-bearing** — line 922 B79.TEC NO_FALLBACK hard-fails on a position missing `assetClass` BEFORE flow ever reaches L1376. The `??` short-circuits to record-read on the happy path; the `safeResolveAssetClass` branch only ever fires if a future caller path bypasses L922 invariants. Zero runtime cost on the happy path. The `if (_assetClass !== null)` guard preserves no-throw skip semantics for null returns.

**Diagnostic endpoint v2 nested-by-layer (CHUNK C).** `/api/diagnostics/orchestrator-per-class-state` URL retained per Langston Q3 ACK (continuity over misleading-URL cost; zero callers verified across client/server/scripts via Step 1.b A6 thorough grep — only definition site at `server/routes.ts`). Payload restructured to nested-by-layer with inline `_meta` registry:

```jsonc
{
  "ts": "...",
  "batch": "B79.0n.ORCHESTRATOR+EXECUTION",
  "orchestrator": { /* crypto_spot, xstock_spot guardrails; perp CLASS_NOT_WIRED */ },
  "execution": {
    "crypto_spot": { "openPositions": 0, "recentCloses24h": 0, "feePercent": 0.26, "slippagePercent": 0.05 },
    "xstock_spot": { "openPositions": 0, "recentCloses24h": 0, "feePercent": 0.26, "slippagePercent": 0.05 },
    "crypto_perp": { "status": "CLASS_NOT_WIRED" },
    "xstock_perp": { "status": "CLASS_NOT_WIRED" }
  },
  "_meta": {
    "schemaVersion": 2,
    "coverage": ["orchestrator", "execution"],
    "lastReviewed": "2026-05-27",
    "knownGaps": [
      "fee/slippage dispatch is class-member wildcard (paper-execution-engine.ts:126-127); per-class dispatch deferred to Phase 25/26 calibration",
      "sizing-core risk-pct/max-position-pct mode-keyed not class-keyed (paper-position-sizing.ts:141-180); deferred to Phase 25/26",
      "narrative-feed TRADE_OPENED/TRADE_CLOSED payload lacks assetClass; dormant — re-review at narrative-feed activation or annual audit"
    ]
  }
}
```

Execution-layer compute reads `storage.getPaperSimOpenPositions('paper')` + `storage.getPaperSimTrades('paper', { closedOnly: true, limit: 500 })` then JS-filters for 24h cutoff. Fee/slippage values surface the current wildcard from `exchange-defaults.ts` (same `DEFAULT_TAKER_FEE` + `DEFAULT_SLIPPAGE` the engine uses at lines 126-127). Try/catch graceful-degrade: if storage compute throws, the execution-layer block falls back to `CLASS_NOT_WIRED` for all classes rather than 500-erroring the whole endpoint — the orchestrator-layer 500 path is preserved for orchestrator-layer failures.

**Reusable doctrine — `_meta.knownGaps` deferred-gap registry (§6.0 + §4.24).** Closing a deferred gap MUST remove the entry from the payload AND bump `_meta.lastReviewed`. ANY per-class-state batch touching this endpoint must bump `lastReviewed` even if `knownGaps` is unchanged (Langston B5 #1 always-bump rule). Without this discipline, the timestamp drifts silently and operators reading the endpoint think the doctrine is stale when it isn't. Line-number references in `knownGaps` strings drift as code changes — when a gap entry lives more than 1-2 batches, refactor to anchor-by-function-name on the next touch (RUNNING_ISSUES #157 follow-up). Codified in ASSET_CLASS_ONBOARDING_WORKFLOW §4.24.

**Step 1.b probe outcomes (informational, drove scope):** (Q4-A) TRADE_OPENED has no production emit path — `TradeOpenedEvent` doesn't exist in eventBus, narrative-feed defines `TradeOpenedPayload` but `appendNarrativeEvent` called only from test fixtures — NO WORK NEEDED. (Q4-B) Position-record SSOT audit found 1 drift site at L1376 (CHUNK B) plus 1 already-correct fallback at L1219 plus 1 strict read at L922 (B79.TEC NO_FALLBACK). (Q4-C) Fee/slippage class-member wildcard at lines 126-127 — defer to Phase 25/26 calibration per same logic as sizing-core defer (needs evidence not placeholders); documented inline in `_meta.knownGaps`. (Q4-D) Trading-engine + micro-execution-service dormancy holds — last touched in B-NEW-43 memory sync commit only.

**Implementation sequence per Langston Step 2 B5 #3:** B → A → C → E. B (SSOT cleanup) validates position-record discipline BEFORE A (interface + emit) propagates the value downstream. C (payload restructure) and E (tests) follow.

**Verification gates met:**
- AC-G1 (`npx tsc --noEmit`): 494/494 baseline-unchanged
- AC-G2 (`npx vitest run`): 12/12 new file + 19/19 ORCHESTRATOR regression
- AC-G3 (`node scripts/check-tsc-baseline.mjs`): OK — no regressions above baseline
- AC-G4 (CI run `26527276989`): all 4 jobs GREEN at 2m17s

**Step 4 Langston code review ACK CLEAN** on all 5 C-asks. **Step 8 Langston second-pass ACK GREEN** at all 5 probes — endpoint shape + HTTP 200 + PM2 stable + DB matches endpoint exactly (0/0/0) + code spot-check. Langston C4 4-surface checklist: surfaces 3 (counter shape) + 4 (perp CLASS_NOT_WIRED regression) verified today; surfaces 1 (canary log on close) + 2 (outcomeFeedback EMA store key) deferred to WIRE-IN per same structural gap as RTB + ORCHESTRATOR Step 7 closures.

**Active-trading impact today ZERO.** Crypto regression: NONE by construction (additive optional field + defensive fallback + URL retained). Real behavioral observability lands at WIRE-IN when active trading flips on.

**Cross-references:**
- ASSET_CLASS_ONBOARDING_WORKFLOW §4.23 codifies the additive event-payload field pattern with `TradeClosedEvent.assetClass?: string` as canonical reference implementation (alongside `PromotionEvent.assetClass?: string` from B79.0n.RTB).
- ASSET_CLASS_ONBOARDING_WORKFLOW §4.24 codifies the deferred-gap registry closure rule with `/api/diagnostics/orchestrator-per-class-state` v2 `_meta.knownGaps` as canonical reference implementation.
- SIM "Recent additions (B79.0n.EXECUTION — Phase 24 — 2026-05-27)" mirrors the component-level enumeration with blast-radius analysis (CRITICAL = paper-execution-engine; MEDIUM = event-bus; LOW = routes.ts; NONE = c13/c14/narrative-feed/session-lifecycle-controller/trading-engine/micro-execution-service).

---

### 19.5 — B79.0n.ORCHESTRATOR: Per-class consumer-site swap pattern (2026-05-27)

B79.0n.ORCHESTRATOR (sub-batch 12 of 16 in B79.0n umbrella v4 arc, renumbered from #13 after POOL skip) closes the last 3 production consumer sites that still imported pattern-pool guardrails directly from `crypto_spot/pattern-pool-filters.js` — `paper-position-sizing.ts`, `signal_quality_evaluator.ts`, and the `/pattern-pool` diagnostic route in `routes.ts`. Each previously read crypto's literal `PATTERN_POOL_GUARDRAILS` regardless of the asset class of the signal being processed; xstock pattern signals therefore got crypto's 15% position cap (vs xstock's DB-resolved 50%) and crypto's 0.45 final-score floor (same value today as xstock, but the routing was class-bound and would have remained wrong if values diverged).

**The dispatcher pattern (mirrors B79.0n.MCE `getFrictionForAssetClass`).** New file `server/asset_classes/pattern-pool-dispatch.ts` exports `getPatternPoolGuardrailsForAssetClass(assetClass: AssetClass): PatternPoolGuardrails`. The function is a domain-specific dispatcher — co-located by domain (pattern-pool) rather than collected in a central `dispatch.ts` SSOT, which would have created an all-classes-import-from-every-domain coupling problem. Exhaustive `switch` over the 8-member AssetClass union: `crypto_spot` returns the crypto module's `PATTERN_POOL_GUARDRAILS`; `xstock_spot` returns the xstock module's `XSTOCK_PATTERN_POOL_GUARDRAILS` (DB-resolved getters per B79.0n.PATTERN-DETECT); the remaining 6 classes (4 perp + 4 reserved-future) throw `[CLASS_NOT_WIRED]` with activation breadcrumbs pointing future onboarders at ASSET_CLASS_ONBOARDING_WORKFLOW.md §4.22. The default branch holds a `const _exhaustive: never = assetClass` compile-time exhaustiveness lock — adding a new AssetClass enum value without updating the dispatcher fails `tsc` before merge. Return type is explicitly typed as `PatternPoolGuardrails` (an interface defined in the dispatcher file) — not inferred — locking the shape contract.

**Per-class consumer-site swap pattern (vs full F-1 resolver-with-EXISTS-gate pattern at OBSERVABILITY #16).** This batch demonstrates a cheaper sibling of the deferred F-1 lever resolver work. When per-class modules already exist with compatible shapes (here: both crypto and xstock have `pattern-pool-filters.ts` with the same `FINAL_SCORE_FLOOR + MAX_POSITION_PCT` interface), the swap is mechanical — 3 consumer-site updates + 1 dispatcher file + tests. The full F-1 resolver-with-EXISTS-gated divergence (where xstock values can DIFFER from crypto only when shadow-data evidence justifies it) stays deferred to OBSERVABILITY (#16); it's a different problem requiring per-class observability scaffolding the current arc doesn't have yet. ASSET_CLASS_ONBOARDING_WORKFLOW.md §4.22 captures both patterns and when to use which.

**POOL skip cleanup as collateral.** Umbrella v4 row #12 (POOL) was SKIPPED 2026-05-27 — xStock's 489-pair universe doesn't have the selection-problem ARM was designed to solve (1500-pair crypto universe vs 300-pair scan budget). The 3 dead factory ARM constructions left behind by B79.0a + B79.0n.TELEMETRY (xstock_spot/xstock_perp/crypto_perp factory bootstrap calls that nobody read) were cleaned up as part of ORCHESTRATOR: `ratioManager: AdaptiveRatioManager` field deleted from the `AssetClassInstances` interface, AdaptiveRatioManager import deleted, 3 factory constructions deleted, 3 test file dispositions (1 delete + 2 refactors). Crypto's module-level `adaptiveRatioManager` singleton at `adaptive-ratio-manager.ts:307` is the live ARM for crypto's FX5 scanner and stays untouched.

**Caller-thread discipline (Langston Step 2 Probe 8 ACK).** `sizePaperPositionForSignal` signature gains REQUIRED `assetClass: AssetClass` field; both call sites (paper-execution-engine.ts:2529 + signal-orchestrator.ts:432) resolve it via `resolveAssetClass(signal.symbol, 'kraken')` deterministically — NOT via `signal.metadata?.assetClass || 'crypto_spot'` silent fallback. The reasoning: `resolveAssetClass` IS the canonical resolver; metadata.assetClass was itself computed via the same resolver; threading metadata adds a hop without adding signal. If `resolveAssetClass` ever disagrees with metadata.assetClass for a given symbol, that's a real bug we want surfaced at the sizing boundary, not silently reconciled in favor of metadata. Throws on B69-unregistered symbols at the boundary (correct fail-fast behavior).

**Behavioral correction observable post-deploy.** Step 8 verification via the new `GET /api/diagnostics/orchestrator-per-class-state` endpoint confirmed: `crypto_spot` returns `{ FINAL_SCORE_FLOOR: 0.45, MAX_POSITION_PCT: 0.15 }` (unchanged from pre-batch crypto literal); `xstock_spot` returns `{ FINAL_SCORE_FLOOR: 0.45, MAX_POSITION_PCT: 0.50 }` (real behavioral correction — xstock pattern signals now route to the 50% cap from `module_constants.pattern_pool_gates.xstock_spot.pattern_max_position_pct` instead of the crypto-bound 15%); `crypto_perp` and `xstock_perp` return `{ status: 'CLASS_NOT_WIRED', reason }`. Active-trading impact is ZERO today because active trading is off; the behavioral correction takes effect at WIRE-IN (#14) when the xstock scanner emits live signals. Phase 19 calibration window validates xstock's 0.50 placeholder value at that point.

**Cross-references.**
- SIM "Recent additions (B79.0n.ORCHESTRATOR — Phase 24 — 2026-05-27)" mirrors the component-level enumeration with blast-radius analysis.
- ASSET_CLASS_ONBOARDING_WORKFLOW §4.22 codifies the per-class consumer-site swap pattern (with-existing-module-shape) as the canonical reference implementation.

---

## 20. Cross-References

| This Section | Related To | Connection |
|-------------|------------|------------|
| PaperExecutionEngine | Phase 3 (Signal Orchestrator) | Receives signals via RTB → TCL → processSignal() |
| PaperExecutionEngine | Phase 4 (Trade Safety) | Calls `checkGuardrailRisk()` before execution |
| PaperExecutionEngine | Phase 4 (Guardrails V2) | Reads guardrails for position limits, kill switch |
| TrailingExitController | Phase 4 (Cost Model) | Uses `computeNetBreakeven()`, `computeNetTargetFloor()` |
| TradingEngine Goal Alignment | Phase 4 §7 (Pre-Execution Validator) | SECOND location of deprecated Goal Alignment |
| SLAL | Phase 3 (Signal Orchestrator) | Instruments GENERATION/SIZING stages |
| ModeRegistry | All engines | Central registry for engine instances |
| Price Cache | Phase 4 (Kraken Service) | Rate-governed price fetching |
| Execution Config | Phase 4 (RISK-031) | MAX_POSITION_RISK contradiction |
| RTB Promotion | Phase 3 (RTB Service) | Consumes ranked signals from RTB queue |

---

## 21. Critical Findings

### Bugs Found

| ID | Severity | Finding | Kyle Decision |
|----|----------|---------|---------------|
| BUG-010 | **CRITICAL** → INFORMATIONAL | TradingEngine uses `Math.random()` for partial fills in live mode (lines 347-388). Placeholder code. | **Deferred** — live mode not in scope. Informational until live refactor. |
| BUG-011 | **CRITICAL** → INFORMATIONAL | TradingEngine uses `Math.random()` for slippage/fees in live mode (lines 391-393). | **Deferred** — live mode not in scope. Informational until live refactor. |
| BUG-012 | **HIGH** | TradingEngine still computes and applies Goal Alignment (lines 246-254). Second location of deprecated logic. | **Confirmed** — remove with Goal Alignment. Wave 4.5. |

### Risks Found

| ID | Severity | Finding | Kyle Decision |
|----|----------|---------|---------------|
| RISK-032 | **MEDIUM** → ACCEPTED | MicroExecutionService `triggerSymbolCheck()` is a TODO stub. | **Accepted** — experimental/dormant. Leave hidden. |
| RISK-033 | **LOW** | `trade-flow.ts` StrategyType only lists 9 strategies vs. 17 canonical. | Concurrent with BUG-002/003 fix. |
| RISK-034 | **LOW** | Failed RTB promotion does not restore signal to queue. | No immediate action. |
| RISK-035 | **LOW** | `max_holding_period` exit maps to close reason 'UNKNOWN'. | No immediate action. |
| RISK-036 | **MEDIUM** → INFORMATIONAL | TradingEngine exit slippage uses `Math.random()` in live mode. | **Deferred** — bundled with BUG-010/011. |

### NLAI Deprecation (Phase 5 Addendum — Kyle, 2026-02-16)

| Component | Status | Removal Scope |
|-----------|--------|---------------|
| NLAI Interpreter | 🔴 LEGACY | `nlai-interpreter.ts` — remove |
| Contextual NLAI Interpreter | 🔴 LEGACY | `contextual-nlai-interpreter.ts` — remove |
| NLAI Execution Broker | 🔴 LEGACY | `nlai-execution-broker.ts` — remove |
| NLAI Action Registry | 🔴 LEGACY | `nlai-action-registry.ts` — remove |
| Execution Policy Controller | 🔴 LEGACY | `execution-policy-controller.ts` — remove (NLAI-only consumer) |
| NLAI cluster bus events | 🔴 LEGACY | Remove event handlers |
| NLAI API routes | 🔴 LEGACY | Remove route handlers |
| Goal-update command handlers | 🔴 LEGACY | Remove (Goals tab already removed) |

---

## 22. Forward Audit Standard Checks

Per Phase 4 Section 23, any subsystem operating independently of canonical routing is flagged.

| Subsystem | Verdict | Reasoning |
|-----------|---------|-----------|
| ExecutionPolicyController | 🔴 **LEGACY — Remove with NLAI** (Kyle, 2026-02-16) | Used solely as NLAI approval gate. Walter deprecated. Remove with NLAI system. |
| NLAIExecutionBroker | 🔴 **LEGACY — Remove with NLAI** (Kyle, 2026-02-16) | Part of deprecated NLAI conversational control infrastructure. |
| NLAI Interpreter + Registry | 🔴 **LEGACY — Remove** (Kyle, 2026-02-16) | `nlai-interpreter.ts`, `contextual-nlai-interpreter.ts`, `nlai-action-registry.ts` — all part of deprecated Walter command bridge. |
| TradingEngine (Goal Alignment) | **⚠ DEPRECATED CODE — Deferred** | Goal Alignment formally deprecated per Kyle. TradingEngine itself deferred until paper mode stable. Goal Alignment removal still required (Wave 4.5). |
| TradingEngine (Placeholder Code) | **⚠ INFORMATIONAL ONLY** | BUG-010/011/RISK-036 are live-mode deficiencies. Non-blocking; live mode is deferred. |
| MicroExecutionService | 🟡 **Experimental/Dormant — Accepted** (Kyle, 2026-02-16) | Paper-only, non-interfering. Leave hidden. Revisit if micro-price trading becomes intentional. |

### Forward Standard for Remaining Phases

Kyle's directive for ongoing audits: if any subsystem operates in parallel to the canonical pipeline, supervises without affecting execution, maintains independent classification logic, exists without being referenced in Signal Orchestrator/DSE/TradeSafety, or appears to be legacy conversational/autonomy scaffolding — it must be flagged as:

> **POTENTIAL LEGACY — REQUIRES INTENT CONFIRMATION**

---

## 23. File Catalog

### Active Execution Files

| File | Lines | Directive | Status |
|------|-------|-----------|--------|
| `paper-execution-engine.ts` | ~2,308 | 11.0E | ✅ Primary engine (AUTHORITATIVE) |
| `trading-engine.ts` | ~766 | Phase 37 | ⏸️ Deferred — live mode not in scope. Contains deprecated Goal Alignment. |
| `trailing-exit-controller.ts` | ~335 | 9.2.A / 11.3A | ✅ Active trailing exit |
| `micro-execution-service.ts` | ~374 | 27.F.14.MICRO | 🟡 Experimental/dormant — accepted by Kyle |
| `mode-registry.ts` | ~162 | 27.F.15.B.4 | ✅ Engine registry + telemetry |
| `lifecycle-events.ts` | ~177 | REB 2.12D | ✅ Event broadcasting |
| `execution-timing.ts` | ~274 | — | ✅ Order timing instrumentation |
| `bob-trade.ts` | ~252 | 27.F.15.A | ✅ Trade data cache |
| `price-cache.ts` | ~448 | 8.8.4-A4.R10R-4 | 🔒 LOCKED |
| `paper-sim-service.ts` | ~300+ | — | ✅ Session management |

### LEGACY Execution Files (Phase 5 Addendum — Kyle Deprecated NLAI)

| File | Lines | Status |
|------|-------|--------|
| `execution-policy-controller.ts` | ~309 | 🔴 LEGACY — remove with NLAI |
| `nlai-execution-broker.ts` | ~477 | 🔴 LEGACY — remove with NLAI |
| `nlai-interpreter.ts` | TBD | 🔴 LEGACY — remove |
| `contextual-nlai-interpreter.ts` | TBD | 🔴 LEGACY — remove |
| `nlai-action-registry.ts` | TBD | 🔴 LEGACY — remove |

### Supporting Type/Config Files

| File | Lines | Status |
|------|-------|--------|
| `trade-flow.ts` | ~127 | ⚠ 9 strategies vs 17 canonical |
| `execution-config.ts` | ~23 | ✅ TEC config (RISK-031 noted) |
| `signal_lifecycle_audit.ts` | ~300+ | ✅ SLAL instrumentation |
| `covariance-engine.ts` | ~371 | ✅ Portfolio risk math |

---

## 24. Kyle's Architectural Confirmations (Phase 5 Addendum)

### Authoritative Execution Scope

The only execution path currently in scope for architectural validation is:

```
FX5 → SQE → RTB → TCL → PaperExecutionEngine → DSE → TradeSafety → Exit Loop
```

Anything outside this path is non-blocking unless it:
- Interferes with paper execution
- Mutates shared execution state
- Overrides guardrails
- Alters sizing logic
- Injects signals

### Confirmed: No Hidden Shutdown Logic

Kill switch in guardrails remains the sole automatic shutdown mechanism. No hidden halts exist in the execution layer.

### Confirmed: DSE Cap Authority Deferred

The DSE cap vs guardrail authority conflict (RISK-031) remains on the post-audit design reconciliation list. No change during audit phase.

### Confirmed: Autonomy Cluster Reminder

MCP, GASP, MOF, MACO, ECS, etc. remain legacy autonomy infrastructure — slated for removal. Not part of execution path.

### Summary of Kyle Decisions

| Topic | Decision |
|-------|----------|
| Paper mode | **Authoritative** — sole execution path in scope |
| Live mode | **Deferred** — refactor after paper mode stable |
| NLAI | **Deprecated** — remove all files |
| Goal Alignment | **Remove completely** — all locations, all references |
| MicroExecution | **Accepted** — experimental/dormant, leave hidden |
| DSE cap conflict | **Deferred** — post-audit reconciliation |
| TradingEngine | **Deferred** — future fork: refactor or rebuild from paper core |

---

## 25. Revision History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| v1.0 | 2026-02-16 | Initial Phase 5 audit — dual engine architecture, exit management, lifecycle, 3 bugs + 5 risks found | Claude Code |
| v1.1 | 2026-02-16 | Phase 5 Addendum: NLAI formally deprecated (Kyle), TradingEngine deferred, MicroExecution accepted as experimental, BUG-010/011/RISK-036 reclassified as informational, RISK-032 accepted, NLAI deprecation table added, Forward Audit Standard expanded | Claude Code |


---

# Part III: Intelligence & Learning


---

# Chapter 6: ML Pipeline, Learning & Calibration

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [VTS Runner — The Autonomous Simulation Engine](#2-vts-runner--the-autonomous-simulation-engine)
3. [VTS Service — Trade Simulation & Calibration Trigger](#3-vts-service--trade-simulation--calibration-trigger)
4. [ML Calibration Service — Phase-10 Training Loop](#4-ml-calibration-service--phase-10-training-loop)
5. [Calibration Utilities — Linear Regression Engine](#5-calibration-utilities--linear-regression-engine)
6. [ML Service Client — Python Microservice Bridge](#6-ml-service-client--python-microservice-bridge)
7. [Reward Evaluator — Per-Strategy Per-Regime Rewards](#7-reward-evaluator--per-strategy-per-regime-rewards)
8. [Drift Detector — Calibration Parameter Monitoring](#8-drift-detector--calibration-parameter-monitoring)
9. [Retraining Freeze Controller — Model Shock Prevention](#9-retraining-freeze-controller--model-shock-prevention)
10. [Telemetry Aggregator — Performance Data Collection](#10-telemetry-aggregator--performance-data-collection)
11. [Adaptive Learning Repository — SQL-Backed Weight Persistence](#11-adaptive-learning-repository--sql-backed-weight-persistence)
12. [Regime Archiver — Long-Term Metric Preservation](#12-regime-archiver--long-term-metric-preservation)
13. [Learning Cooldown — Regime-Aware Update Gating](#13-learning-cooldown--regime-aware-update-gating)
14. [Adjustment Stability — Observability Instrumentation](#14-adjustment-stability--observability-instrumentation)
15. [Continuous Learning Engine — LEGACY](#15-continuous-learning-engine--legacy)
16. [Learning Cycle Service — LEGACY](#16-learning-cycle-service--legacy)
17. [Learning Coordinator — LEGACY](#17-learning-coordinator--legacy)
18. [Learning Bridge — LEGACY](#18-learning-bridge--legacy)
19. [Learning Gate Validator — LEGACY](#19-learning-gate-validator--legacy)
20. [Mathematical Validation: VTS Reward & Calibration](#20-mathematical-validation-vts-reward--calibration)
21. [Data Flow: VTS → ML Pipeline → Parameter Adjustment](#21-data-flow-vts--ml-pipeline--parameter-adjustment)
22. [Critical Findings](#22-critical-findings)
23. [File Catalog](#23-file-catalog)
24. [Kyle's Phase 6 Architectural Confirmations](#24-kyles-phase-6-architectural-confirmations)
25. [Revision History](#25-revision-history)

---

## 1. Architecture Overview

The ML Pipeline, Learning & Calibration layer is the **feedback loop** that enables DawnTrader to improve over time. Its primary function is:

1. **Simulate** virtual trades using real market data (VTS Runner)
2. **Record** outcomes with full Phase-10 metric coverage (VTS Service + Telemetry Aggregator)
3. **Calibrate** profit prediction models from outcomes (ML Calibration + Calibration Utils)
4. **Evaluate** strategy-regime reward performance (Reward Evaluator)
5. **Detect** parameter drift and trigger recalibration (Drift Detector)
6. **Archive** regime-level metrics for long-term seeding (Regime Archiver)
7. **Gate** learning updates based on regime stability (Learning Cooldown)

### System State Context

DawnTrader is currently in **Paper Mode + Passive Learning**. This means:
- The VTS Runner is the **only active execution component** generating data
- No real trades are placed; all outcomes are virtual
- The ML pipeline consumes VTS-generated data exclusively
- Learning is **passive** — parameters are adjusted but no live trades are affected

### Core Architectural Problem: Artificial Strategy Differentiation

> **Kyle (Phase 6 Addendum)**: "Strategy differentiation is currently artificial. That is the core architectural problem in Phase 6."

Although the VTS Runner implements multi-strategy simulation (Directive 11.8C) — iterating over ALL strategies compatible with a pair's regime — the underlying signal generation logic in `generatePhase10Signal()` is **identical for all strategies**. Specifically:

| Component | Implementation | Strategy-Specific? |
|-----------|---------------|-------------------|
| HybridScore | `simulateHybridScore(regime)` — regime lookup + random noise | ❌ NO |
| PredictiveConfidence | `hybridScore * 0.8 + 0.1 + noise` | ❌ NO |
| DecayPenalty | `Math.random() * 0.15` | ❌ NO |
| FinalScore | `hybridScore * w1 + predictiveConfidence * w2 + regimeWeight * w3 - decayPenalty * w4` | ❌ NO |
| Stop/Target | `max(config, volatility * multiplier)` | ❌ NO |
| Entry Logic | Current market price | ❌ NO |
| Confidence Model | Derived from simulated hybridScore | ❌ NO |

**Consequence**: The system simulates N strategies per pair, but all N strategies produce signals from the same generic math. Only randomness and metadata labels differ. This means:
- **Per-strategy calibration is statistically diluted** — calibration learns noise, not structural edge
- **Strategy comparisons are partially artificial** — "Breakout" vs "Mean Reversion" produce effectively identical signals
- **ML magnitude adjustments are noisy** — performance multipliers modulate based on random variation
- **True structural edge cannot emerge** — the pipeline cannot discover which strategies genuinely outperform because no strategy has unique signal logic

**Required Correction**: Each strategy must have unique entry logic, unique stop/target logic, unique confidence modeling, and unique feature-derived scoring. Without this, multi-strategy simulation is architectural infrastructure waiting for real strategy engines.

### Two-Layer Learning Architecture

The audit reveals **two distinct learning ecosystems** that operate independently:

| Layer | Purpose | Status | Data Source |
|-------|---------|--------|-------------|
| **VTS/ML Pipeline** (Canonical) | Calibrate profit predictions, evaluate strategies, detect drift | **ACTIVE** | VTS virtual trades, real Kraken prices |
| **Walter-Era Learning** (Legacy) | Cognitive weights, agent feedback, cluster learning deltas | **CONFIRMED LEGACY** (Kyle, Phase 6 Addendum) | Walter/Bob agent interactions, experience memory |

The **VTS/ML Pipeline** is the canonical learning system. It operates within the authoritative execution path and directly affects trading parameters.

The **Walter-Era Learning** system (ContinuousLearningEngine, LearningCoordinator, LearningBridge, LearningCycleService, LearningGateValidator) was built for the Walter/Bob AI ecosystem and manages "cognitive weights" (reasoning, exploration, exploitation, riskAversion, adaptability). These are **not connected to the canonical trading pipeline** — they track agent behavioral tendencies, not trading strategy parameters.

> **CONFIRMED LEGACY (Kyle, Phase 6 Addendum)**: The Walter-Era Learning subsystem operates independently of the canonical trading pipeline, maintains its own classification logic (CognitiveWeights), and supervises without affecting trade execution. Kyle confirmed these are "legacy autonomy-era artifacts" and recommended marking for removal in cleanup wave.

---

## 2. VTS Runner — The Autonomous Simulation Engine

**File**: `server/services/vts-runner.ts` (~1,400 lines)
**Directive**: 11.0E.1 (Upgraded from 8.8.4-M5C)
**Status**: 🔒 LOCKED MODULE — Active, Primary

### Purpose

> **★ ITEM 4 Phase B step 1 (2026-06-09) — ARCHITECTURAL CHANGE: VTS is a STANDALONE ALWAYS-ON producer.** The historical coupling "VTS runs only while active trading is OFF" is REMOVED: the three `tradingActive` kill-guards (cycle-skip, start-refusal, interval self-teardown) are gone, and VTS's lifecycle is governed ONLY by its own start/stop. VTS runs continuously THROUGH paper/live engine start-stops (verified: exact 60s cadence through an active paper session). The interval tick carries a lifecycle guard — re-entrancy no-op, overlap skip-tick (`vtsCycleOverlapSkips`, the throughput-study starvation signal), and a crash-containment catch (a cycle throw cannot crash the now-shared process). Each pair is stamped `sourceMode:'vts'` at the possession boundary (the Kyle stamp-at-entry mode-tag architecture; downstream consumer re-points land in step 2). Any "Passive Learning mode" phrasing below describes the historical single-producer era — VTS no longer requires active trading to be off. ~~Until item-4 step 2 deploys, RUNNING_ISSUES #210 HARD-GATES any active-trading turn-on~~ **#210 RESOLVED 2026-06-10 — the full item-4 arc is CLOSED (steps 1+2+2b+3+4-6):**
> - **Labeled learning substrate (step 2):** `outcomeFeedbackStore` key = `(source, assetClass, regime, strategy)`, `source` REQUIRED (type `LearningSource = RunMode`: `'vts' | 'paper_sim' | 'live'` — ONE vocabulary, no mapping seam); SOURCE-MATCHED reads per Kyle's Gate-2 three-tier learning decision (shared substrate computed once / upstream comparison YES, pooling PARKED behind prerequisites / trading outcomes strictly separate); Welford triplets + per-source CALIBRATION EPOCHS (governance in ADJUSTMENT_FRAMEWORK; rows fail-hard, boot-asserted) ride alongside the retained EMA with zero factor change. The 3 B70 archivers take the producer's CARRIED mode (`getCurrentMode()` write-path lookups DELETED); `pair_scan_archive` stamps `'shared'` (producer-agnostic substrate tier); the hybrid-confluence buffer is source-namespaced (D1b).
> - **The would_admit bridge (step 2b):** every VTS signal-eval row is stamped with the answer to "would paper's SQE have admitted this?" (`would_admit_v0` + basis + threshold; honest bases incl. `no_final_score` / `thresholds_not_warm`) — the tier-2a comparison precondition and pooling prerequisite #1, accruing forward.
> - **Switch cleave (step 3):** per-mode start/stop; live start HARD-GATED 409 until the Phase-21 numeric flip (see the Chapter 5 control-plane banner for the full gate spec + the jsonb-boolean trap).
> - **Proven under live concurrency (step 6 throughput study, 2026-06-10):** 10.2h VTS-only baseline + 33-min sustained VTS+paper window — VTS cadence 60.0s EXACT in both; 11,307 during-paper eval rows ALL `mode='vts'` (zero cross-stamps); compute-once EXACT (pair_scan rows = MCE computes, both windows); all 6 gates pass; capacity = current box, in-process GO (`ITEM_4_THROUGHPUT_STUDY_RESULTS.md`).

The VTS Runner is the autonomous virtual trading simulator. During Passive Learning mode, it runs a **60-second simulation loop** that:
1. Fetches up to 300 pairs from the FX5 Scanner batch (Batch 18 — was 100)
2. Calculates per-pair market regimes from OHLC data
3. Generates virtual trade signals using Phase-10 canonical math
4. Opens virtual trades and tracks them against **real Kraken prices**
5. Closes trades when stop/target/timeout is hit
6. Persists outcomes to telemetry and ML pipeline

### Simulation Cycle Flow

```
startAutonomousSimulation()
  └─ setInterval(runPhase10SimulationCycle, 60s)
       ├─ resolveOpenVirtualTrades()     ← Close trades hit by real prices
       ├─ getIdealPoolPairs()            ← FX5 Scanner → ~11 pairs (after VolNoise/LQ gating)
       ├─ fetchBTCOHLC()                 ← Kraken 60m candles for defensive_hedge (HF8)
       ├─ For each pair:
       │    ├─ fetchOHLCForPair()        ← Kraken 60m candles, 100 max (HF8 — aligned with orchestrator)
       │    ├─ MCE.computeContext()      ← Per-pair regime + indicators via MCE (Phase 13)
       │    ├─ getStrategiesForRegime()  ← All compatible strategies (11.8C)
       │    └─ For each strategy:
       │         ├─ callStrategyDetect() ← Real StrategyEngine detect function (HF6)
       │         └─ generatePhase10Signal()
       │              ├─ Governance filter (11.7R-E)
       │              ├─ Strategy mode modulation (11.7S — confidence floor bypassed)
       │              ├─ Net EV gate (11.8B-A2)
       │              ├─ ROI pre-filter (11.7C)
       │              ├─ ADX guard (SMA strategies)
       │              ├─ Duplicate position guard (11.8C)
       │              ├─ Position sizing + mode overlay
       │              └─ Create OpenVirtualTrade
       └─ Record telemetry for all generated signals
```

### Key Design Decisions

**Multi-Strategy Simulation (Directive 11.8C)**: The VTS simulates ALL strategies compatible with a pair's regime, not just one "best" strategy. This generates N trades per pair where N equals the regime-compatible strategy count. Each trade has an `executionContext` of either `'VTS'` (single) or `'VTS_MULTI'` (multi-strategy).

**Real-Price Resolution (Directive 11.6)**: Trades are NOT resolved with random simulation. The VTS opens trades at real entry prices and resolves them against real Kraken prices via the price cache's `vtsSimulation` bucket. This replaced the legacy random simulation path (deprecated by 11.6D).

**Pre-Score Governance (Directive 11.7R-E)**: Before any scoring, strategies are checked against regime stability. If a strategy's dependency (trend, volatility, stability) is blocked in the current regime stability state, the signal is never scored, never ranked, and never generates a trade.

**Strategy Mode Modulation (Directive 11.7S)**: After governance, the strategy mode is resolved (NORMAL / DEFENSIVE / SURVIVAL) based on global regime stability. The mode overlay adjusts position size, stop-loss distance, take-profit distance, confidence floor, and entry cooldown via multipliers. This is the **defensive-only skeleton** of the broader Adaptive Market Response framework.

> **Adaptive Market Response (concept, 2026-04-25):** The mode overlay above is the existing defensive half of a planned multi-input, defensive-and-offensive market-response framework. The expansion adds richer detection inputs (regime + DBS trend + realized-EV drift + pair-distribution + friction trend), an offensive Aggressive mode for favorable conditions, and tunable response dials in `module_constants`. Conditional Phase 19.5 in roadmap; concept document at `1-system-manual/ADAPTIVE_MARKET_RESPONSE_CONCEPT.md`. The post-launch ML-driven version is Phase 17.5 (Smart Thermostat).

### Configuration

```typescript
DEFAULT_CONFIG = {
  autonomousMode: true,
  simulationIntervalSec: 60,      // 60-second cycle
  pairsPerCycle: 100,              // NOTE: config/vts.json is NOT imported by vts-runner.ts
  strategies: [...],               // Legacy — actual strategies come from canonical regime map
  targetProfit: 0.015,             // 1.5% target
  stopLoss: 0.008,                 // 0.8% stop
  minVolume24h: 50000,
  minPrice: 0.5
};

// HF8 additions:
//   OHLC fetch: 60-min interval, 100-candle lookback (matches signal orchestrator)
//   BTC OHLC: fetched once per cycle for defensive_hedge correlation
//   Pair count: determined by FX5 scanner output (~11 pairs), NOT by pairsPerCycle config

MAX_OPEN_TRADES = 300;             // Directive 11.6E: Kraken API rate limit cap
MAX_HOLD_MS = 24 * 60 * 60 * 1000; // 24-hour max hold time
```

### Critical Observations

> **Phase 14.1 HF6-HF9 Resolution**: Observations 1-5 below were the pre-HF6 state (BUG-001). HF6 (`048bbc16`) replaced simulated scoring with real computation. HF8 (`052fb224`) aligned VTS timeframe to 60-min and relaxed strategy parameters. HF9 (`f9fa56c6`) deleted DSS entirely, migrated governance gate to SQE, relaxed VTS IMF filters, fixed closed trades context columns. The VTS pipeline now uses **real scoring, real strategy detect functions, real regime classification, and real governance** throughout. BUG-001 is **RESOLVED** — DSS deleted (superseded by MCE + detect functions), secondary metrics deemed redundant (detect functions already check these conditions internally). Pattern/hybrid strategies still return null (Phase 14.5 gap).

1. ~~**HybridScore is simulated, not computed**~~: **RESOLVED** (HF6) — `computeRealHybridScore()` from `vts-real-score.ts` replaces `simulateHybridScore()`.

2. ~~**PredictiveConfidence is simulated**~~: **RESOLVED** (HF6) — `getPredictiveConfidence()` from `score-calculator.ts` replaces `simulatePredictiveConfidence()`.

3. ~~**DecayPenalty is random**~~: **RESOLVED** (HF6) — `computeRealDecayPenalty()` from `vts-real-score.ts` replaces `simulateDecayPenalty()`.

4. ~~**FinalScore uses real weights but simulated inputs**~~: **RESOLVED** (HF6) — `computeFinalScore()` now receives real hybridScore, predictiveConfidence, and decayPenalty.

5. **Net EV Gate uses real math**: Still true, and now receives **real DI** (from real predictiveConfidence). The gate correctly blocks trades where friction exceeds raw EV (e.g., range_trade signals with tight targets — observed in production diagnostics HF8).

6. **Strategy detect functions are the primary bottleneck** (HF8 finding): Only mean_reversion fires consistently among quant strategies. Other quant strategies (breakout, range_trade, liquidity_trap) fire occasionally but are gated by strict internal conditions in StrategyEngine. Pattern/hybrid strategies universally return null ("No pattern signal") — structural gap requiring Phase 14.5 (parallel pattern scanning path).

7. **VTS pair count is FX5-determined, not config-determined**: `config/vts.json` `pairsPerCycle` is not consumed by vts-runner.ts. The actual pair count (~11) comes from FX5 scanner output after VolNoise/LQ gating.

> **CURRENT STATE** (post-HF8): The VTS Runner is producing **real trades with real scoring** at ~2 trades/cycle (primarily mean_reversion in HIGH_VOLATILITY_UNSTABLE regime). Strategy diversity is limited by pattern strategy gap (Phase 14.5) and strict quant strategy conditions. Timeframe alignment with orchestrator (60-min) means ML learning transfers directly to active trading.

---

## 3. VTS Service — Trade Simulation & Calibration Trigger

**File**: `server/services/vts-service.ts` (~500+ lines)
**Directive**: 10.0.A (Upgraded from 8.8.4-L8)
**Status**: 🔒 LOCKED MODULE — Active, Supporting

### Purpose

The VTS Service provides:
1. **VirtualSignal / VirtualTrade** type definitions (Phase-10 schema v1.6.7)
2. **Trade storage** — in-memory map of virtual trades + closed trades array
3. **Calibration interface** — `runCalibration()` for per-strategy calibration
4. **ML Calibration trigger** — fires every 10 HYBRID trades (Directive 10.6)
5. **Session metrics** — rolling averages for Phase-10 metrics

### Deprecated Methods

| Method | Reason | Replacement |
|--------|--------|-------------|
| `createVirtualTrade()` | Directive 11.6D — legacy random simulation | `openVirtualTrades` in vts-runner.ts |
| `closeTrade()` | Directive 11.6D — legacy random exits | `resolveOpenVirtualTrades()` in vts-runner.ts |

### VirtualSignal Schema (Phase-10, M50 Compliant)

```typescript
interface VirtualSignal {
  id: string;
  symbol: string;
  entryPrice: number; takeProfit: number; stopLoss: number;
  spread: number; predictedProfit: number;
  strategy: string;
  signalType: 'QUANT' | 'PATTERN' | 'HYBRID';
  patternType?: string | null;
  // Phase-10 canonical fields
  finalScore: number; hybridScore: number;
  predictiveConfidence: number; regimeWeight: number;
  decayPenalty: number; expectedEdge: number;
  frictionCost: number;
  regime: string; regimeScore?: number;
  pool: 'ideal' | 'rotational';
  source: 'simulation' | 'live';
}
```

### Calibration Trigger Flow

```
Trade closed → closedTrades.push(trade)
  └─ if (calibrationCounter++ % 10 === 0)
       └─ triggerMLCalibration()     ← fire-and-forget
            └─ MLCalibrationService.analyzePerformance()
                 └─ MLCalibrationService.logRecommendations()
```

### Trade Duration

All VTS trades have a **3-hour trade window** (`TRADE_DURATION = 3 * 60 * 60 * 1000`). This is the legacy VTS Service window. However, the VTS Runner uses a **24-hour max hold** (`MAX_HOLD_MS`). The VTS Service's 3-hour window applies to the legacy random simulation pathway (deprecated).

---

## 4. ML Calibration Service — Phase-10 Training Loop

**File**: `server/services/ml-calibration.ts` (~232 lines)
**Directive**: 11.0E.2
**Status**: 🔒 LOCKED — Active

### Purpose

Analyzes VTS trade outcomes using Phase-10 metrics and generates learning recommendations for strategy weighting.

### Performance Score Formula

```
PerformanceScore = (finalScore × 0.5) + (predictiveConfidence × 0.3) + (regimeWeight × 0.2)
```

### Analysis Pipeline

1. Retrieve recent `windowSize` trades (default: 50) of signal type HYBRID
2. Group by pattern/strategy
3. For each group:
   - Compute win rate, expectancy, avg finalScore, avg edge delta
   - Compute `performanceScore` using the Phase-10 formula above
   - Derive `performanceMultiplier = clamp(performanceScore, 0.5, 1.5)`
   - If win rate > 55%: **INCREASE** weight by `0.05 × performanceMultiplier`
   - If win rate < 45%: **DECREASE** weight by `0.05 × performanceMultiplier`
   - Otherwise: **HOLD**

### Edge Delta Tracking

```
edgeDelta = expectedEdge - realizedPnL
```

This measures how well the expected edge prediction tracked actual outcomes. A positive delta means the system overestimated; negative means underestimated.

### Critical Observation

The ML Calibration Service consumes the **simulated** metrics from VTS (see Section 2 findings). Since `finalScore`, `predictiveConfidence`, and `regimeWeight` are based on simulated inputs, the `performanceScore` and `performanceMultiplier` are also derived from noise. The **win rate** and **expectancy** are valid (based on real price outcomes), but the performance-weighted adjustment magnitude is meaningless.

> **FINDING**: The calibration adjustment magnitude (±0.05 × performanceMultiplier) is modulated by simulated data, but the directional recommendation (INCREASE/DECREASE/HOLD) is based on real win rate data. The recommendations are directionally valid but their magnitude is noise-modulated.

---

## 5. Calibration Utilities — Linear Regression Engine

**File**: `server/utils/calibration.ts` (~324 lines)
**Directive**: 8.8.4-L8
**Status**: 🔒 LOCKED MODULE — Active

### Purpose

Performs linear regression to learn calibration coefficients that map predicted profits to actual realized profits.

### Core Formula

```
calibrated_profit = αₛ + βₛ × predicted_profit
```

Where:
- `αₛ` = intercept (clamped to [-0.01, 0.01])
- `βₛ` = slope (clamped to [0.05, 0.5])
- Per-strategy coefficients when sample count ≥ 10, otherwise global fallback

### Default Coefficients

```typescript
{ alpha: 0.0018, beta: 0.19, rSquared: 0, sampleCount: 0 }
```

### Linear Fit Implementation

Standard OLS (Ordinary Least Squares) regression with:
- Minimum 10 samples required
- R² computation (coefficient of determination)
- Standard error computation
- Coefficient clamping for stability
- Anomaly detection: warns when `|β - 1| > 0.3` or `stdError > 0.05`

### Persistence

- **File**: `logs/vts_calibration.json` — current global + per-strategy calibration
- **History**: `logs/vts_calibration_history/{date}.json` — daily snapshots

### Per-Strategy Calibration (L8 Enhancement)

`calibrateFromTradesPerStrategy()` runs linear fit separately for each strategy, producing independent α/β/r²/stdError coefficients per strategy plus a global set from all trades combined.

---

## 6. ML Service Client — Python Microservice Bridge — ❌ RETIRED (B-NEW-54, 2026-06-08)

**File**: `server/services/ml-service-client.ts` — **DELETED.**
**Directive**: 8.8.4-L3 (Phase-8-era)
**Status**: **RETIRED.** The Python ML predictive microservice (`services/ml_service.py`) + this client were removed in B-NEW-54. The helper was decorative — its promotion/profit predictions were fetched fire-and-forget in the signal orchestrator, logged, and discarded (no decision consumed them). The real ML is a fresh Phase 17/18 design ("ML Adaptive Intelligence Layer"), not a revival. The chapter below is retained for historical reference. See SIM §7.4 + the B-NEW-54 completion report.

### Purpose

Async client for the Python ML microservice (`services/ml_service.py`, ~73KB). Provides:
- `predictPromotion()` — probability of trade promotion
- `predictProfit()` — predicted profit value
- `getMLServiceStatus()` — health check
- `blendConfidence()` — NGC/promotion blending

### Integration Points

- **Host**: `ML_SERVICE_HOST` env var, default `http://localhost:5001`
- **Timeout**: 2 seconds per request
- **Cache**: In-memory with 30-second TTL, 500-entry max
- **Boot dependency**: Checks `bootOrchestrator.isMLReady()` — returns fallback if not ready

### Fallback Values

When ML service is unavailable:
- Promotion probability: `0.5` (neutral)
- Predicted profit: `0.05` (default)

### Legacy Fields in PredictionInput

```typescript
interface PredictionInput {
  symbol: string; strategy: string;
  ngc: number;     // ← Legacy field (NGC removed in Phase 10)
  cwqi: number;    // ← Legacy field (CWQI removed in Phase 10)
  riskRatio: number; profitTarget: number;
  signalAge?: number; entry: number; exit: number; stop: number;
}
```

> **FINDING**: The ML Service Client's `PredictionInput` interface still references `ngc` and `cwqi` — both of which were removed in Phase 10. This interface is out of date with the Phase-10 canonical metrics (finalScore, hybridScore, predictiveConfidence, regimeWeight).

---

## 7. Reward Evaluator — Per-Strategy Per-Regime Rewards

**File**: `server/services/reward-evaluator.ts` (~274 lines)
**Directive**: 8.8.4-L14
**Status**: 🔒 LOCKED MODULE — Active

### Purpose

Computes per-strategy, per-regime cumulative rewards using a weighted formula.

### Reward Formula

```
R_{s,r} = α₁ × profit_rate + α₂ × win_rate − α₃ × drawdown
```

Where:
- `α₁ = 0.6` (profit rate weight)
- `α₂ = 0.3` (win rate weight)
- `α₃ = 0.1` (drawdown penalty weight)

### Operation

- **Evaluation interval**: Every 30 minutes
- **Trade history**: Rolling window of last 1,000 trades per strategy-regime pair
- **Drawdown**: Peak-to-current equity drawdown per strategy-regime pair
- **Persistence**: `logs/rewards/reward_history.json`

### Key Methods

| Method | Description |
|--------|-------------|
| `recordTrade(trade)` | Record a trade result for a strategy-regime pair |
| `getReward(strategy, regime)` | Get current reward for a strategy-regime combination |
| `getAllRewards()` | Get all strategy-regime reward values |
| `evaluateAll()` | Recompute all rewards (runs on 30-min interval) |

### Consumer

The Reward Evaluator is imported by the VTS Service (`getRewardEvaluator()`) but the audit found **no evidence of the reward values being fed back into the scoring pipeline**. The rewards are computed and persisted but not consumed by signal generation or trade selection.

> **FINDING**: The Reward Evaluator computes strategy-regime rewards but these values do not appear to be consumed by any downstream scoring or selection logic. The reward data is observability-only in the current architecture.

---

## 8. Drift Detector — Calibration Parameter Monitoring

**File**: `server/services/drift-detector.ts` (~400+ lines)
**Directive**: 8.8.4-L11
**Status**: 🔒 LOCKED MODULE — Active

### Purpose

Monitors calibration parameters (α, β, σ) for drift and triggers auto-recalibration when thresholds are exceeded.

### Drift Score Formula

```
DriftScore = w₁|βₛ - βₛ₋₁| + w₂|αₛ - αₛ₋₁| + w₃(σₛ / σ_baseline)
```

Where:
- `w₁ = 0.6` (beta weight — slope drift is most important)
- `w₂ = 0.2` (alpha weight — intercept drift)
- `w₃ = 0.2` (sigma weight — error growth)

### Thresholds

| Threshold | DriftScore | Action |
|-----------|-----------|--------|
| Warning | > 0.15 | Flag as drifting, emit `drift_warning` |
| Recalibration | > 0.25 | Trigger auto-recalibration, emit `drift_recalibrate` |

### Operation

- **Check interval**: Every 15 minutes
- **History depth**: Last 10 snapshots per strategy
- **Persistence**: `logs/drift_history/`, `logs/drift_events/`
- **Integration**: Checks retraining freeze controller before triggering recalibration

### Status States

```
stable → drifting → recalibrating → stable
```

---

## 9. Retraining Freeze Controller — Model Shock Prevention

**File**: `server/services/retraining-freeze-controller.ts` (~231 lines)
**Directive**: 10.0.E
**Status**: 🔒 LOCKED MODULE — Active

### Purpose

Prevents "Model Shock" when fee constants change. Pauses ML retraining for one epoch (default: 1 hour) after activation.

### Behavior

- Auto-activates on construction with Phase 10.0 friction correction message
- Checks expiry every 60 seconds
- Provides `isRetrainingAllowed()` gate for ML clients
- Provides `guardRetraining(fn, fallback)` wrapper that returns fallback if frozen

### Current State

On every server restart, the freeze controller activates a 1-hour freeze for "Phase 10.0 friction correction stabilization (0.26% → 0.50%)". This means **every restart blocks ML retraining for 1 hour**.

> **FINDING**: The retraining freeze controller unconditionally activates a 1-hour freeze on every instantiation (line 64: `this.activatePhase10Freeze()`). This was designed as a one-time Phase 10 deployment measure but runs on every restart. This is likely a stale deployment artifact that should be evaluated for removal.

---

## 10. Telemetry Aggregator — Performance Data Collection

**File**: `server/services/telemetry-aggregator.ts` (~62KB, ~1,500+ lines)
**Directive**: 10.8
**Status**: Active (not locked)

### Purpose

Collects and aggregates performance telemetry for adaptive pair selection. The single largest service file in the Phase 6 scope.

### Key Features

- **Rolling 24-hour history window** per pair
- **Weighted composite scoring** for pair ranking
- **Pool-level performance tracking** (ideal vs rotational — Directive 11.2 R1)
- **Source segregation** (simulation vs live — Directive 11.0E.2)
- **VTS-only write restriction** (Directive 11.4C.1) — only VTS can write telemetry
- **Z-score tracking** for volatility and trend drift (Directive 11.7F-B)

### PairTelemetry Interface

Tracks per-pair: finalScore, hybridScore, regimeWeight, regimeScore, predictiveConfidence, successRate, avgDecayedStrength, pairRegime, pattern, pool, source, signalType, strategy, volZ, trendZ, volZHistory, trendZHistory.

### Consumer Chain

The telemetry aggregator feeds the **AdaptiveScanManager** with ranked pair lists and the **DynamicStrategySelector** with regime-aware metrics. It is the central data collection point for the entire VTS feedback loop.

### 10.9 — B79.0n.TELEMETRY: Per-class instance bootstrap pattern (2026-05-26)

**Sub-batch 10 of 18 in the B79.0n umbrella v4 arc.** Deploy commit `02bad33a6`. Completes the B79.0a per-asset-class `TelemetryAggregator` instance pattern.

#### 4-of-4 active-class coverage table

| Asset class | Pre-batch route | Post-batch route | Disk persistence |
|---|---|---|---|
| `crypto_spot` | Global singleton via no-touch fence (factory returns `null`) | UNCHANGED — global singleton (18mo+ live disk-persist state preserved) | YES (global singleton's `setInterval(persist, 5min)` arm) |
| `xstock_spot` | Dedicated in-memory triad (B79.0a) | UNCHANGED — same in-memory triad | NO (in-memory only by construction) |
| `crypto_perp` | **THROW** — `[CLASS_UNHANDLED]` | **NEW** — dedicated in-memory triad via factory | NO (Variant C — in-memory only) |
| `xstock_perp` | **THROW** — `[CLASS_UNHANDLED]` | **NEW** — dedicated in-memory triad via factory | NO (Variant C — in-memory only) |
| `forex_spot` / `forex_perp` / `equity_spot` / `equity_perp` (reserved-future) | THROW (`[CLASS_UNHANDLED]`) | **NEW** — explicit `[CLASS_NOT_WIRED]` throw (distinct from `[CLASS_INVALID]`) | N/A — onboarding not started |

#### Variant C disk-persist resolution

Per Langston AGREE on scope Q1, the new instances are **in-memory only by construction** — direct `new TelemetryAggregatorService()` bypasses the global singleton's `setInterval(persist, 5min)` arming code path. The persist-timer arming is structurally gated INSIDE `getTelemetryAggregator()` (the global-singleton accessor function in `server/services/telemetry-aggregator.ts`) — direct construction at `server/services/asset-class-instances.ts`'s factory site simply does not invoke that code path. **Variant C is safe by structure, not by policy** — no flag-check, no opt-out path. The 3 factory-managed instances never accidentally write disk state because the persist-timer construct never fires for them.

If a non-crypto_spot active class flips to active trading and the in-memory-only state needs to persist across PM2 restarts, the follow-up sub-batch (**TELEMETRY.b**) parameterizes the disk-path + persist-timer infrastructure at `telemetry-aggregator.ts:1600-1602` by `assetClass`. No SLA today — xstock_spot + xstock_perp + crypto_perp all in dormant or VTS-shadow mode, so cross-restart persistence is not required.

#### `assertNever` exhaustive-switch enforcement pattern

The factory's switch over `AssetClass` is terminated by an `assertNever(class)` call that takes a parameter of type `never`. TypeScript compile-fails if any value of the `AssetClass` union is not handled by an explicit `case` arm above. Pattern matches the STRATEGY / MCE / PATTERN-DETECT precedents from earlier B79.0n sub-batches — consistency win at the asset-class-onboarding boundary.

#### `peekTelemetryInstance()` non-arming-read companion pattern

To support the new `getTelemetryInstanceStats()` accessor (which reads per-instance `recordCount` + `lastWriteAt` for the 48h verify-gate signal), B79.0n.TELEMETRY introduces a **non-arming-read companion** at `server/services/telemetry-aggregator.ts`:

```typescript
// Returns the module-level instance reference without invoking the
// persist-timer arm. Safe to call from a read accessor; cannot
// accidentally arm Variant C invariant.
export function peekTelemetryInstance(
  assetClass: AssetClass
): TelemetryAggregatorService | null { ... }
```

The `peek*` prefix signals "non-arming, returns whatever module-level state is currently held, may be `null` if instance never constructed." A caller that needs to arm-then-read should use a distinctly-named API (`getOrCreateTelemetryInstance()` shape).

**Reusable precedent.** The `peek<X>` non-arming-read pattern is codified in `ASSET_CLASS_ONBOARDING_WORKFLOW.md` §4.19 as the reusable shape for read-only stats accessors that must NOT trigger side-effects (persist-timer arming, cache materialization, etc.). Future factories that own persistent state should ship a `peek*` companion at the same time as their construction API.

#### `getTelemetryInstanceStats()` accessor + 48h verify-gate signal

```typescript
export function getTelemetryInstanceStats(): {
  crypto_spot: null | InstanceStats;  // null — global singleton, not factory-managed
  crypto_perp: InstanceStats;          // recordCount + lastWriteAt
  xstock_spot: InstanceStats;
  xstock_perp: InstanceStats;
}
```

Backs the 48h verify-gate alert `1f34cf84-a37c-425c-a1c4-54924b053061` (triggers_at 2026-05-28T18:01:48Z). Invariant: `crypto_perp.recordCount === 0` and `xstock_perp.recordCount === 0` for the entirety of the gate window because per-class VTS-writer threading is deferred to WIRE-IN (#16) — the perp instances exist but their write-path is not wired yet. Crypto_spot continues growing normally via the global singleton (no-touch fence held).

#### Cross-reference

- §7.6 (this chapter) entry remains as-is for the legacy global singleton; this 10.9 subsection documents the NEW per-class wrapper layer above the singleton.
- SIM "Recent additions (B79.0n.TELEMETRY — Phase 24 — 2026-05-26)" mirrors the component-level enumeration with blast-radius analysis.
- ASSET_CLASS_ONBOARDING_WORKFLOW §4.19 codifies the per-class-instance + non-arming-read patterns as reusable shapes with B79.0n.TELEMETRY as the worked example.

---

## 11. Adaptive Learning Repository — SQL-Backed Weight Persistence

**File**: `server/services/adaptive-learning-repository.ts` (~170+ lines)
**Directive**: 11.1B
**Status**: Active

### Purpose

Provides SQL-backed persistence for adaptive learning weights per strategy, per regime. Enables rehydration of learning state after restarts with timestamp awareness for time-based decay.

### Features

- **Strategy-specific weights** by regime
- **Timestamp propagation** for time decay on rehydration
- **Live mode-only persistence** (consistent with 11.1A1 provenance rules)
- **Upsert semantics** for weight updates

### Database Schema

Uses the `adaptive_learning` table with columns: strategyId, mode, regime, weights (JSONB), updatedAt.

---

## 12. Regime Archiver — Long-Term Metric Preservation

**File**: `server/core/archival/regime-archiver.ts` (~250+ lines)
**Directive**: 11.7E
**Status**: Active
**B59 Fix**: Upstream `vts-telemetry.ts` field name mismatch fixed — archive now receives real VTS win rates and P&L (was all zeros due to `netProfit` field not being read). Pre-existing pnl double-scaling also fixed.

### Purpose

Persistent regime-metric archival for Phase 12 seeding. Archives regime-level predictive metrics (winRate, avgPnL, skipRatio, confidence, dynamicROI, momentum/volatility/trend weights) into compressed daily files with checksums.

### Archive Record Schema (v1.1)

```typescript
interface RegimeArchiveRecord {
  _schema: 'regime-archive/v1.1';
  timestamp: string;
  source: 'VTS';           // VTS-only source isolation
  windowDays: number;       // 7 or 30 day window
  regime: string;
  strategy: string;
  metrics: RegimeArchiveMetrics;
  checksum: string;         // SHA-1 integrity hash
  _metadata: RegimeArchiveMetadata;
}
```

### Features

- **Canonical stringification** for deterministic checksums
- **SHA-1 integrity** on every record
- **Manifest tracking** with version and compression metadata
- **7-day and 30-day windows** for regime metrics
- **zlib compression** for archival

### Startup Behavior (Updated Batch 18C)

> **IMPORTANT**: Prior to Batch 18C (`c42283f1`), `clearArchiveForFreshStart()` was called during server startup in `index.ts`, which deleted all archive JSON files and reset the manifest to `[]` on every restart. This was removed in Batch 18C — archives now persist across server restarts. The weekly cron job (`0 0 * * 0`) creates archives, and they accumulate over time as intended. Debug UI scaffolding (test button, diagnostic logging) was also cleaned from machine-learning.tsx.

---

## 13. Learning Cooldown — Regime-Aware Update Gating

**File**: `server/core/governance/learning-cooldown.ts` (~160+ lines)
**Directive**: 11.7R
**Status**: Active

### Purpose

Enforces regime-aware learning update rules to prevent learning from noisy data during regime instability.

### Cooldown Rules

| Stability | Positive Reinforcement | Negative Learning |
|-----------|------------------------|-------------------|
| **STABLE** | Immediate | Immediate |
| **TRANSITION** | Batched (≥5 samples) | Immediate |
| **UNSTABLE** | Deferred & tagged | Immediate |

### Design Rationale

- **Negative learning is always immediate**: Losses during unstable regimes are still real losses
- **Positive learning is gated**: Wins during instability may be noise (lucky trades in choppy markets)
- **Deferred updates are replayed** when stability returns to STABLE

### State Tracking

```typescript
learningStats = {
  immediatePositive: 0,
  immediateNegative: 0,
  batchedPositive: 0,
  deferredPositive: 0,
  replayed: 0,
  lastStableAt: Date.now(),
};
```

---

## 14. Adjustment Stability — Observability Instrumentation

**File**: `server/core/learning/adjustment-stability.ts` (~200+ lines)
**Directive**: 11.7Q
**Status**: Active — **OBSERVABILITY ONLY**

### Purpose

Read-only instrumentation showing adjustment frequency and stability. Explicitly marked as "no learning logic modifications permitted."

### Features

- **Parameter touch history**: Tracks how often each parameter is adjusted, direction (increasing/decreasing/oscillating/stable), cooldown status
- **Bursty period detection**: Identifies clusters of rapid adjustments
- **Safety signals**: Advisory-only flags for rapid adjustment, regime instability, poor performance, oscillation
- **Lagged outcome context**: Post-adjustment trade outcome measurement

---

## 15. Continuous Learning Engine — LEGACY

**File**: `server/services/continuous-learning.ts` (~389 lines)
**Status**: ❌ **CONFIRMED LEGACY** (Kyle, Phase 6 Addendum) — "legacy autonomy-era artifact, mark for removal"

### Evidence for Legacy Classification

1. **Manages "CognitiveWeights"** (reasoning, exploration, exploitation, riskAversion, adaptability) — these are Walter/Bob AI behavioral weights, not trading strategy parameters
2. **Database-backed** via `learningWeightProfile` table with userId/profileId
3. **Broadcasts via contextBridge** — Walter's inter-agent communication system
4. **Not connected to VTS/ML pipeline** — no imports from vts-runner, ml-calibration, telemetry-aggregator, or any canonical trading module
5. **Not imported by any canonical trading service** — imported only by routes and other Walter-era services
6. **Tracks "experience memory"** via `experienceMemoryLog` table — Walter's memory system

### What It Does

- `initializeProfile()` — Creates learning weight profile for a user
- `adjustWeights()` — Adjusts cognitive weights with normalization
- `learnFromExperience()` — Integrates experience memory entries
- `evaluatePerformance()` — Generates recommendations based on performance metrics

### Key Distinction

This engine manages **behavioral tendency weights for AI agents**, not **trading strategy weights for the execution pipeline**. The canonical system uses `strategyWeights.ts` and `adaptive-learning-repository.ts` for strategy weight management.

---

## 16. Learning Cycle Service — LEGACY

**File**: `server/services/learning-cycle-service.ts` (~350+ lines)
**Status**: ❌ **CONFIRMED LEGACY** (Kyle, Phase 6 Addendum) — "legacy autonomy-era artifact, mark for removal"

### Evidence for Legacy Classification

1. **Imports from `learning-bob`** — Bob agent module
2. ~~**Imports from `phase-8.6.5-enhancements`**~~ — **DELETED** (Batch 10, Directive 12.2.8)
3. **Generates "Cognitive Summary Reports"** — Walter's conversational intelligence
4. **24-hour analysis cycle** of "learning fragments" from Learning Bob
5. **Feeds to `feedbackIntegrationService`** — Walter's feedback integration

### What It Does

- Periodically analyzes Learning Fragments from Learning Bob
- Detects patterns: user preferences, effective phrasing, problematic areas
- Generates style recommendations for Walter's conversational behavior
- Promotes paper-mode learnings to live mode via `paperLiveTransferService`

This is **Walter's conversational improvement system**, not a trading learning system.

---

## 17. Learning Coordinator — LEGACY

**File**: `server/services/learning-coordinator.ts` (~269 lines)
**Status**: ❌ **CONFIRMED LEGACY** (Kyle, Phase 6 Addendum) — "legacy autonomy-era artifact, mark for removal"

### Evidence for Legacy Classification

1. **Phase 18.0** module — from a much earlier development phase
2. **Subscribes to `learning_delta` events from cluster bus** — inter-node communication (unused in single-tenant mode)
3. **Imports from `cluster-bus`** — distributed system infrastructure
4. **Uses `agentLearningDelta` database table** — agent-specific learning, not trading
5. **Fans out `model_sync` events** — multi-node model synchronization (no cluster exists)

### What It Does

- Validates, scores, and routes learning deltas across cluster nodes
- Calculates trust (0.4), recency (0.3), and success rate (0.3) scores
- Accepts deltas with score ≥ 0.75
- Validates through ethical gate chain (LearningGateValidator)
- Fans out model_sync events to other nodes

This is a **distributed learning coordination system for a multi-node architecture that does not exist**. DawnTrader runs as a single-tenant application.

---

## 18. Learning Bridge — LEGACY

**File**: `server/services/learning-bridge.ts` (~286 lines)
**Status**: ❌ **CONFIRMED LEGACY** (Kyle, Phase 6 Addendum) — "legacy autonomy-era artifact, mark for removal"

### Evidence for Legacy Classification

1. **Phase 9.7** module
2. **Tracks agent performance** (agentName, domain, accuracyScore, consensusAlignment) — agent behavioral tracking
3. **Uses `agentLearningFeedback` database table** — agent-specific feedback
4. **No connection to VTS/ML pipeline** or canonical trading logic

### What It Does

- Records feedback for agent performance (accuracy, consensus alignment)
- Analyzes performance trends (improving/stable/declining)
- Generates aggregated learning summaries across all agents
- Identifies top performers and agents needing improvement

This tracks **AI agent performance**, not trading strategy performance.

---

## 19. Learning Gate Validator — LEGACY

**File**: `server/services/learning-gate-validator.ts` (~250+ lines)
**Status**: ❌ **CONFIRMED LEGACY** (Kyle, Phase 6 Addendum) — "legacy autonomy-era artifact, mark for removal"

### Evidence for Legacy Classification

1. **Phase 18.0** module — same era as Learning Coordinator
2. **4-gate chain**: Safety → Federated Ethics → Ethical Reasoner → Knowledge
3. **Imported only by LearningCoordinator** — which is itself potential legacy
4. **"Federated Ethics" gate** — multi-agent ethical consensus (no multi-agent system exists in production)
5. **"Ethical Reasoner" gate** — principle-based evaluation (Walter-era AI ethics framework)

### What It Does

Applies a 4-gate validation chain to all learning operations:
1. **Safety**: Kill switch, policy violations, risk limits
2. **Federated Ethics**: Multi-agent ethical consensus
3. **Ethical Reasoner**: Principle-based evaluation
4. **Knowledge**: Semantic enrichment and gap detection (non-blocking)

This is an **AI ethics framework for learning governance** — sophisticated but unused in the canonical trading pipeline.

---

## 20. Mathematical Validation: VTS Reward & Calibration

### Calibration: Linear Regression (L8)

**Formula**: `calibrated_profit = α + β × predicted_profit`

**Validation**:
- ✅ Standard OLS regression — mathematically correct
- ✅ Coefficient clamping prevents extreme values (α: [-0.01, 0.01], β: [0.05, 0.5])
- ✅ Minimum sample requirement (n ≥ 10)
- ✅ R² and stdError computation correct
- ⚠️ The β clamp range [0.05, 0.5] means the calibration can never produce β > 0.5, even if the true relationship has a steeper slope. This biases toward conservative predictions.

### Reward Evaluator (L14)

**Formula**: `R = 0.6 × profit_rate + 0.3 × win_rate − 0.1 × drawdown`

**Validation**:
- ✅ Weighted sum formula is standard
- ✅ Drawdown computed correctly (peak-to-current equity)
- ⚠️ `profit_rate` is `totalPnL / tradeCount` — this is average PnL per trade, not a rate. The name is slightly misleading.
- ⚠️ The reward values are computed but **not consumed** by any downstream system (see Section 7 finding)

### Drift Detection (L11)

**Formula**: `DriftScore = 0.6|Δβ| + 0.2|Δα| + 0.2(σ / σ_baseline)`

**Validation**:
- ✅ Weighted change detection — standard approach
- ✅ Beta drift weighted highest (slope is most impactful)
- ✅ Sigma normalization against baseline
- ✅ Two-threshold system (warning + action)

### ML Calibration Performance Score (11.0E.2)

**Formula**: `PerformanceScore = finalScore × 0.5 + predictiveConfidence × 0.3 + regimeWeight × 0.2`

**Validation**:
- ✅ Formula is a valid weighted average
- ❌ Inputs (finalScore, predictiveConfidence) are **simulated**, not computed from real indicators — performance score is noise-modulated

### Net EV Gate (11.8B-A2)

**Formula**: `netEV = rawEV − totalFriction` (computed by `computeNetExpectancyKernel()`)

**Validation**:
- ✅ Canonical kernel — identical to DSS and Paper Execution
- ⚠️ DI input is `predictiveConfidence × 100` which is simulated (see Section 2)

---

## 21. Data Flow: VTS → ML Pipeline → Parameter Adjustment

```
┌─────────────────────────────────────────────────────────────────┐
│                   VTS RUNNER (60s cycle)                        │
│  FX5 Scanner → Regime Classification → Multi-Strategy Sim      │
│  → Governance Gates → Net EV → Position Sizing → Open Trade    │
└─────────────────────┬───────────────────────────────────────────┘
                      │ Real price resolution
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                   TRADE RESOLUTION                              │
│  Price Cache (vtsSimulation bucket) → SL/TP/Timeout check      │
│  → Calculate P&L → Persist to VTS Service + Telemetry          │
└─────────────────────┬───────────────────────────────────────────┘
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
    ┌───────────┐ ┌────────┐ ┌──────────────┐
    │ Telemetry │ │  VTS   │ │   Regime     │
    │ Aggregator│ │Service │ │   Archiver   │
    │ (24h win) │ │(trades)│ │ (7d/30d)     │
    └─────┬─────┘ └───┬────┘ └──────────────┘
          │           │
          │           ▼ (every 10 HYBRID trades)
          │     ┌──────────────┐
          │     │ML Calibration│
          │     │  Service     │
          │     │(Phase-10     │
          │     │ analysis)    │
          │     └──────┬───────┘
          │            │
          │            ▼
          │     ┌──────────────┐    ┌───────────────────┐
          │     │ Calibration  │◄───│ Drift Detector    │
          │     │ Utils (OLS)  │    │ (15-min checks)   │
          │     │ α, β per     │    │ Auto-recalibrate  │
          │     │ strategy     │    │ when drift > 0.25 │
          │     └──────┬───────┘    └───────────────────┘
          │            │
          │            ▼                    ┌──────────────────┐
          │     ┌──────────────┐            │Retraining Freeze │
          │     │ Adaptive     │◄───────────│Controller        │
          │     │ Learning     │  (blocks   │(1-hour epoch)    │
          │     │ Repository   │  if frozen)└──────────────────┘
          │     │ (SQL)        │
          │     └──────────────┘
          │
          ▼
    ┌──────────────┐    ┌──────────────┐
    │ Adaptive     │    │  Reward      │
    │ Scan Manager │    │  Evaluator   │
    │ (pair        │    │  (30-min     │
    │  ranking)    │    │   eval)      │
    └──────────────┘    └──────────────┘
```

### Disconnected Systems (Walter-Era Learning — CONFIRMED LEGACY)

```
┌────────────────────────────────────────────────────┐
│    WALTER-ERA LEARNING (CONFIRMED LEGACY — Kyle)    │
│                                                     │
│  ContinuousLearningEngine ← Experience Memory      │
│       ↓                                             │
│  LearningCycleService ← Learning Bob               │
│       ↓                                             │
│  LearningBridge ← Agent Feedback                   │
│       ↓                                             │
│  LearningCoordinator ← Cluster Bus                 │
│       ↓                                             │
│  LearningGateValidator ← Ethical Reasoner           │
│                                                     │
│  ❌ No connection to VTS/ML Pipeline                │
│  ❌ No connection to Strategy Weights               │
│  ❌ No connection to Telemetry Aggregator           │
│  ❌ No connection to Calibration Utils              │
└────────────────────────────────────────────────────┘
```

---

## 22. Critical Findings

### Bugs

| ID | Severity | Description | Location | Kyle Decision |
|----|----------|-------------|----------|---------------|
| BUG-001 | CRITICAL | VTS signal generation uses simulated hybridScore/predictiveConfidence/decayPenalty instead of real strategy calculations | `vts-runner.ts`: `simulateHybridScore()`, `simulatePredictiveConfidence()`, `simulateDecayPenalty()` | **CONFIRMED CRITICAL** — Replace with real feature-derived scoring |
| BUG-013 | MEDIUM | ML Service Client PredictionInput interface references removed `ngc` and `cwqi` fields | `ml-service-client.ts` line 30-31 | **CONFIRMED** — Remove deprecated fields, align with canonical metrics |
| BUG-014 | LOW | Retraining Freeze Controller activates Phase 10.0 freeze on every restart (stale deployment artifact) | `retraining-freeze-controller.ts` line 64 | **CONFIRMED** — Convert to manual trigger or remove auto-activation |

### Architectural Risks

| ID | Severity | Description | Kyle Decision |
|----|----------|-------------|---------------|
| RISK-038 | HIGH | VTS ML calibration performance multiplier is noise-modulated (based on simulated scores), making adjustment magnitudes statistically meaningless | **CONFIRMED** — Downstream of BUG-001, resolves when real scoring implemented |
| RISK-039 | MEDIUM | Reward Evaluator computes rewards but values are not consumed by any downstream scoring or selection system | **CONFIRMED** — Currently observability-only, not harmful, not integrated |
| RISK-040 | MEDIUM → **CONFIRMED LEGACY** | Five Walter-era learning services operate independently of canonical trading pipeline | **CONFIRMED LEGACY** — "legacy autonomy-era artifacts, mark for removal in cleanup wave" |
| RISK-041 | LOW | Calibration β coefficient clamped to [0.05, 0.5] — prevents calibration from learning steep slope relationships | — |
| RISK-042 | LOW | VTS Service trade duration (3h) vs VTS Runner max hold (24h) mismatch | — |
| **RISK-043** | **CRITICAL** | **Strategy-specific signal logic is NOT implemented** — all strategies use identical generic scoring math (same hybridScore, same predictiveConfidence, same decayPenalty, same stop/target logic). Multi-strategy simulation infrastructure exists (11.8C) but produces artificially differentiated signals. Per-strategy calibration is statistically diluted; true structural edge cannot emerge. | **Kyle (Phase 6 Addendum)**: "That is the core architectural problem in Phase 6." |

### Kyle Phase 6 Addendum — Decisions Applied

| Item | Decision |
|------|----------|
| RISK-040 | **CONFIRMED LEGACY** — All 5 Walter-era learning services are legacy autonomy-era artifacts. Mark for removal in cleanup wave. |
| RISK-039 | **CONFIRMED OBSERVABILITY-ONLY** — Reward Evaluator is disconnected from scoring, not harmful but not integrated. |
| BUG-014 | **CONFIRMED** — Retraining freeze auto-activation should be converted to manual trigger or removed. |
| RISK-043 (NEW) | **CRITICAL** — Strategy differentiation is artificial. Each strategy must have unique entry logic, stop/target logic, confidence modeling, and feature-derived scoring. This is the most serious Phase 6 issue. |

### Required Corrections (Kyle Phase 6 Addendum)

**CRITICAL (Red)**:
1. **Replace simulated scoring inputs** — Remove `simulateHybridScore()`, `simulatePredictiveConfidence()`, random decay penalty. Replace with real feature-derived, strategy-specific scoring engines.
2. **Implement strategy-specific signal generators** — Each strategy (Breakout, Mean Reversion, Liquidity Trap, SMA Trend Ride, etc.) must have unique entry logic, unique stop logic, unique target logic, and unique confidence modeling.

**HIGH (Orange)**:
3. **Remove Walter-era learning stack** — ContinuousLearningEngine, LearningCycleService, LearningCoordinator, LearningBridge, LearningGateValidator. All confirmed legacy.
4. **Remove freeze auto-activation** — Make RetrainingFreezeController explicitly controlled, not restart-triggered.
5. **Update ML client schema** — Remove deprecated `ngc`/`cwqi` fields from PredictionInput.

---

## 23. File Catalog

### Active Files (Canonical ML Pipeline)

| File | Lines | Directive | Role |
|------|-------|-----------|------|
| `server/services/vts-runner.ts` | ~1,400 | 11.0E.1 🔒 | Autonomous VTS simulation engine |
| `server/services/vts-service.ts` | ~500+ | 10.0.A 🔒 | Trade simulation, calibration trigger, type definitions |
| `server/services/ml-calibration.ts` | ~232 | 11.0E.2 🔒 | Phase-10 ML training loop |
| `server/utils/calibration.ts` | ~324 | 8.8.4-L8 🔒 | Linear regression calibration utilities |
| `server/services/ml-service-client.ts` | ~245 | 8.8.4-L3 | Python ML microservice client |
| `server/services/reward-evaluator.ts` | ~274 | 8.8.4-L14 🔒 | Per-strategy per-regime reward computation |
| `server/services/drift-detector.ts` | ~400+ | 8.8.4-L11 🔒 | Calibration drift detection & auto-recalibration |
| `server/services/retraining-freeze-controller.ts` | ~231 | 10.0.E 🔒 | Model shock prevention |
| `server/services/telemetry-aggregator.ts` | ~1,500+ | 10.8 | Telemetry collection & pair ranking |
| `server/services/adaptive-learning-repository.ts` | ~170+ | 11.1B | SQL-backed weight persistence |
| `server/core/archival/regime-archiver.ts` | ~250+ | 11.7E | Long-term regime metric archival |
| `server/core/governance/learning-cooldown.ts` | ~160+ | 11.7R | Regime-aware learning update gating |
| `server/core/learning/adjustment-stability.ts` | ~200+ | 11.7Q | Adjustment frequency observability |
| `server/core/learning/adjustment-explainability.ts` | ~200+ | 11.7Q | Adjustment explainability |
| `server/core/logging/vts-telemetry.ts` | ~300+ | — | VTS telemetry logging |
| `server/services/telemetry-repository.ts` | ~350+ | — | Telemetry SQL persistence |
| `server/services/telemetry-compression.ts` | ~150+ | — | Telemetry data compression |
| `server/core/telemetry/cost-telemetry.ts` | ~200+ | — | Cost-specific telemetry |
| `server/config/drift-definitions.ts` | ~45 | — | Drift threshold definitions |
| `server/config/drift-descriptions.ts` | ~60 | — | Drift description templates |
| `server/core/analytics/mapping-drift-calculator.ts` | ~140+ | — | Mapping drift computation |
| `server/core/schedulers/ml-calibration-scheduler.ts` | ~160+ | — | ML calibration scheduling |
| `config/vts.json` | ~10 | — | VTS runtime configuration |

### LEGACY Files — Confirmed by Kyle (Phase 6 Addendum)

| File | Lines | Phase | Role | Kyle Decision |
|------|-------|-------|------|---------------|
| `server/services/continuous-learning.ts` | ~389 | — | Cognitive weight management for AI agents | REMOVE |
| `server/services/learning-cycle-service.ts` | ~350+ | 8.6.1 | Walter's conversational improvement cycle | REMOVE |
| `server/services/learning-coordinator.ts` | ~269 | 18.0 | Multi-node learning delta coordination | REMOVE |
| `server/services/learning-bridge.ts` | ~286 | 9.7 | Inter-agent learning feedback | REMOVE |
| `server/services/learning-gate-validator.ts` | ~250+ | 18.0 | 4-gate ethical validation chain | REMOVE |

### Supporting Data Files

| Location | Contents |
|----------|----------|
| `logs/vts_calibration.json` | Current calibration coefficients (global + per-strategy) |
| `logs/vts_calibration_history/` | Daily calibration snapshots |
| `logs/rewards/reward_history.json` | Reward evaluator trade history + reward cache |
| `logs/drift_history/` | Drift detector snapshots |
| `logs/drift_events/` | Drift warning/recalibration events |
| `logs/regime_archive/` | Long-term regime metric archives |
| `logs/virtual_trades/` | Daily VTS trade logs |
| `data/vts_trades_*.json` | VTS session trade data |
| `logs/vts_exports/` | CSV exports of VTS trade data |

---

## 24. Kyle's Phase 6 Architectural Confirmations

The following architectural decisions were confirmed by Kyle in the Phase 6 Addendum:

### 1. Directive 11.8C — VERIFIED IMPLEMENTED
Multi-strategy regime-scoped simulation is active in `runPhase10SimulationCycle()`. VTS simulates every strategy mapped to the pair's regime. No ambiguity.

### 2. Strategy-Specific Signal Math — NOT IMPLEMENTED (CRITICAL)
Although 11.8C multi-strategy infrastructure exists, `generatePhase10Signal()` uses generic scoring logic for ALL strategies. This is the **most serious Phase 6 issue**. Each strategy must have unique entry/stop/target/confidence logic before per-strategy learning becomes meaningful.

### 3. Walter-Era Learning Stack — CONFIRMED LEGACY
Five services (ContinuousLearningEngine, LearningCycleService, LearningCoordinator, LearningBridge, LearningGateValidator) are confirmed as "legacy autonomy-era artifacts." They manage cognitive weights and agent behavior, not trading. Zero connection to canonical pipeline. Mark for removal in cleanup wave.

### 4. ML Service Client Schema — CONFIRMED OUTDATED
`PredictionInput` still references deprecated `ngc` and `cwqi` fields. Must be updated to canonical Phase-10 metrics: `finalScore`, `hybridScore`, `predictiveConfidence`, `regimeWeight`.

### 5. Retraining Freeze Controller — CONFIRMED ARTIFACT
Auto-activation on every restart is a stale one-time deployment measure. Convert to manual trigger or remove.

### 6. Reward Evaluator — CONFIRMED DISCONNECTED
Observability-only. Not harmful. Not integrated into scoring or selection. Not a priority to connect.

### 7. TelemetryAggregator — HIGH COUPLING NOTE
At ~62KB and centralizing strategy/regime/pool metrics, Z-score normalization, and ranking logic, TelemetryAggregator is a future modularization candidate. Not incorrect, not legacy — but high coupling risk.

### 8. ML Calibration — STRUCTURALLY SOUND BUT NOISY
Directional updates (win/loss) are based on real data. Magnitude scaling is corrupted by simulated scoring. Will self-correct once BUG-001 and strategy-specific signal logic are resolved.

### 9. System Assessment
Kyle's assessment of Claude's Phase 6 audit: "Largely accurate. Correct on simulated scoring flaw. Correct on legacy learning stack. Correct on freeze artifact. Correct on ML schema drift. But underemphasized the deeper structural issue: strategy differentiation is currently artificial."

---

## 25. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-16 | Claude Code | Initial Phase 6 audit — ML Pipeline, Learning & Calibration |
| 1.1 | 2026-02-16 | Claude Code | Phase 6 Addendum — Kyle's architectural confirmations applied: RISK-043 (CRITICAL: artificial strategy differentiation) elevated as core problem; Walter-era learning stack CONFIRMED LEGACY (5 files); BUG-014/RISK-039 confirmed; ML client schema confirmed outdated; Section 24 added (Kyle's confirmations); all POTENTIAL LEGACY sections updated to CONFIRMED LEGACY |


---

# Part IV: Infrastructure & Platform


---

# Chapter 7: System Lifecycle & Infrastructure

> **★ B-4.6-B (2026-06-10) — EVENT-LOOP STALL MECHANISM + the scan-stall instrument.** The recurring event-loop stalls (p99 spikes, skipped cron slots) are NOT caused by missing `await`s: the scan loops already await per pair, but **an `await` on an already-resolved promise (warm cache hit) yields only to the microtask queue — timers and I/O never run under an unbroken warm-hit chain** (Langston-confirmed from Node semantics; full derivation `B_4_6B_PRE_AUDIT.md`). Diagnosis instrument: `server/services/scan-stall-instrument.ts` (`[4.6B][ELD]` interval-scoped `monitorEventLoopDelay` histogram + `[4.6B][SEG]` per-segment sync spans with max-atomic-span). The fix (chunk B) = elapsed-time `setImmediate`-class yields at pair/batch boundaries ONLY — see the SIM granularity lock before inserting yields anywhere else.

**Version:** 1.1
**Audit Date:** 2026-02-16
**Auditor:** Claude Code (System Cartographer & Lead Architect)
**Scope:** Boot sequence, startup orchestration, scheduler registry, task queues, health monitoring, self-repair, graceful shutdown
**Status:** COMPLETE

### Kyle's Executive Position (Phase 7 Addendum)

> Phase 7 infrastructure is stable. There are no hidden kill switches, no silent trade shutdown mechanisms, no unexpected execution overrides. However, several subsystems are actively instantiated at boot, running on schedulers, not clearly required for core paper trading, and potentially legacy or autonomy-era artifacts. **These are not being deprecated immediately.** They are flagged for **Post-Audit Cleanup Investigation & Formal Decision.** Architectural simplification is required but will be handled as a deliberate cleanup phase, not as reactive removal.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Server Entry Point (server/index.ts)](#2-server-entry-point)
3. [Boot Orchestrator](#3-boot-orchestrator)
4. [Startup Sequence — Deterministic Order](#4-startup-sequence)
5. [Startup Module: invariants.ts](#5-startup-invariants)
6. [Startup Module: trading-bootstrap.ts](#6-startup-trading-bootstrap)
7. [Startup Module: fx5-scanner-bootstrap.ts](#7-startup-fx5-scanner-bootstrap)
8. [Startup Module: portfolio-initializer.ts](#8-startup-portfolio-initializer)
9. [Startup Module: lazy-loader.ts](#9-startup-lazy-loader)
10. [Startup Module: Other Seeders & Utilities](#10-startup-seeders)
11. [Bootstrap: Schema Validator](#11-bootstrap-schema-validator)
12. [Scheduler Registry](#12-scheduler-registry)
13. [System Health (system-health.ts — LOCKED)](#13-system-health-locked)
14. [System Health Monitor (system-health-monitor.ts)](#14-system-health-monitor)
15. [Health Monitor (health-monitor.ts — Phase 41F-C)](#15-health-monitor-41f)
16. [Feed Integrity Monitor](#16-feed-integrity-monitor)
17. [Self-Repair Service](#17-self-repair-service)
18. [Operation Queue (operation-queue.ts — Phase 41F-A/B)](#18-operation-queue)
19. [Task Queue (task-queue.ts)](#19-task-queue)
20. [Task Router (task-router.ts) — Phase 17.0 Cluster System](#20-task-router)
21. [Task Worker (task-worker.ts) — Phase 17.0 Cluster System](#21-task-worker)
22. [Walter Shutdown Gate](#22-walter-shutdown-gate)
23. [Graceful Shutdown](#23-graceful-shutdown)
24. [Data Flow — Boot to Steady-State](#24-data-flow)
25. [Critical Findings](#25-critical-findings)
26. [Post-Audit Infrastructure Review (Kyle Directive)](#26-post-audit-infrastructure-review)
27. [File Catalog](#27-file-catalog)
28. [Revision History](#28-revision-history)

---

## 1. Architecture Overview

DawnTrader's system lifecycle is managed through a **single-file monolithic boot sequence** (`server/index.ts`, ~1,260 lines) that orchestrates ~40+ service initializations in a carefully ordered async IIFE. The system follows a **degraded-mode-first** philosophy — every service initialization is wrapped in try/catch, and failures produce warnings rather than crashes (with one exception: the single-tenant database invariant check, which calls `process.exit(1)`).

### Boot Architecture Layers

```
┌────────────────────────────────────────────────────────┐
│                server/index.ts (~1260 lines)            │
│   Single-file monolithic boot sequence                  │
├────────────────────────────────────────────────────────┤
│  Layer 1: Express Setup & Middleware                    │
│    CORS, JSON parsing, single-tenant guard,            │
│    telemetry compression, request logging               │
├────────────────────────────────────────────────────────┤
│  Layer 2: Core Service Bootstrap (blocking)             │
│    Boot Orchestrator → Price Cache → Central Clock →    │
│    RTB Refresh → Data Aggregator → FX5 Scanner         │
├────────────────────────────────────────────────────────┤
│  Layer 3: Route Registration & Database Services        │
│    Routes → Queues → PaperSim Reset → Rate Limiter →   │
│    Test User → Kraken Metadata → Trading State Sync     │
├────────────────────────────────────────────────────────┤
│  Layer 4: Application Services (blocking)               │
│    Ethical Principles → Strategy Sync → Portfolio Init → │
│    Trading Bootstrap → Purpose Layer → Context Loader    │
├────────────────────────────────────────────────────────┤
│  Layer 5: Non-blocking Background Services              │
│    Walter (if enabled) → Memory Lifecycle →              │
│    Scheduler Registry (13 tasks) → Vite/Static          │
├────────────────────────────────────────────────────────┤
│  Layer 6: Post-Listen Services (after port binding)     │
│    Live Pricing → WebSocket → Lazy Loader (+1.5s) →     │
│    Health Monitor → Heartbeat → Learning Cycle →        │
│    Autonomy Scheduler → Config Audit Telemetry          │
├────────────────────────────────────────────────────────┤
│  Layer 7: Graceful Shutdown Handlers                    │
│    SIGTERM/SIGINT → queues → RTB → DataAgg → Clock →    │
│    PriceCache → SystemHealth                            │
└────────────────────────────────────────────────────────┘
```

### Dual Shutdown Handler Problem

**⚠️ BUG-015 (MEDIUM):** Both `server/index.ts` and `server/core/boot_orchestrator.ts` independently register SIGTERM/SIGINT handlers. The boot orchestrator registers first (in constructor), then index.ts registers its own handlers later. Node.js allows multiple handlers per signal, so **both execute on shutdown**, but in unpredictable order. The boot orchestrator handler calls `stopVTSRunner()` and `stopMLService()`, while the index.ts handler stops RTB, DataAggregator, CentralClock, PriceCache, SystemHealth, and calls `process.exit(0)`. Since the index.ts handler calls `process.exit()`, the boot orchestrator's handler may not complete.

---

## 2. Server Entry Point

**File:** `server/index.ts` (~1,260 lines)
**Directive:** A4.R10R-3 (Central Clock Synchronized Startup Sequence)

### Express Configuration
- **CORS:** Restricts to localhost:3000, localhost:5000, Replit dev domain, and custom ALLOWED_ORIGINS
- **Body parsing:** JSON with rawBody capture, URL-encoded
- **Middleware:** Single-tenant guard, telemetry compression, API request logging with 80-char truncation
- **Profiling:** Phase 4A-5 Gemini profiler records per-endpoint latency
- **Sampling:** Non-error requests logged at 10% sample rate

### Route Mounting Order
1. API router from registerRoutes() (includes regime-archive routes via routes.ts)
2. Status routes at `/api/status`
3. Health routes at `/api/health`
4. DSE routes at `/api/diagnostics`
5. Chaplet routes at `/chaplet` (read-only)
6. Phase 8.6.5 enhancement routes
7. Provenance debug routes
8. Global error handler (catch-all JSON)
10. Vite middleware (dev) or static serving (prod)

### Post-Listen Audit Telemetry
After port binding, the server runs extensive config audit telemetry:
- **ConfigSnapshot:** Builds MD5 hashes of guardrails/filters/goals for paper & live
- **FilterCoherence:** Validates system-managed vs manual-override field counts
- **GuardrailsCoherence:** Validates locked-by-user params vs system-managed
- **OverridesHistory:** Logs last 10 config changes grouped by mode/type
- **CrossMode Audit:** Compares paper vs live structural coherence

**Note:** These audit telemetry blocks total ~150 lines of inline code in the server listen callback. This is diagnostic telemetry, not a security gate — mismatches produce log warnings but don't block operation.

---

## 3. Boot Orchestrator

**File:** `server/core/boot_orchestrator.ts` (~348 lines)
**Directive:** 8.8.4-L3
**Module Status:** Active (singleton, exports `bootOrchestrator`)

### Purpose
Manages the Python ML microservice lifecycle: auto-spawn, health check polling, metrics collection, and graceful shutdown. Also initializes the VTS Runner with auto-start logic for passive learning mode.

### Startup Sequence
1. Check `ML_SERVICE_AUTO_START` env var (default: true)
2. Probe `localhost:5001/health` for existing ML service
3. If not found, spawn `python services/ml_service.py`
4. Poll health endpoint every 1s for up to 15 attempts
5. Start 30-second recurring health monitoring
6. Initialize VTS Runner + preload pattern recognition (2,000 entries)
7. Check system config for passive learning mode → auto-start VTS if applicable

### ML Service States
| State | Meaning |
|-------|---------|
| STARTING | Spawn initiated, waiting for health |
| READY | Health check passing |
| DEGRADED | Failed to start, or health check failing after being READY |
| FAILED | Initialization threw an error |
| STOPPED | Shutdown complete or not started |

### VTS Auto-Start Logic
```typescript
const isPassiveLearning = !paperActive && !liveActive;
if (isPassiveLearning) {
  await startAutonomousSimulation(); // VTS auto-start in passive mode
}
```
This correctly prevents VTS from running when trading engines are active.

### Memory Warning Threshold
ML service memory > 500MB triggers a warning log. No remediation action is taken.

---

## 4. Startup Sequence — Deterministic Order

The startup sequence enforced by `server/index.ts` is:

| Order | Service | Blocking? | Directive | Failure Mode |
|-------|---------|-----------|-----------|--------------|
| 1 | Boot Orchestrator (ML + VTS) | ✅ await | 8.8.4-L3 | Degraded mode |
| 2 | Canonical Consistency Validator | ✅ sync | 11.4H.6G | Warning only |
| 3 | System Health Monitor | ✅ sync | A4.R10R-4 | Silent failure |
| 4 | Price Cache | ✅ sync | A4.R10R-1 | Silent failure |
| 5 | Central Clock | ✅ sync | A4.R10R-3 | Warning only |
| 6 | RTB Refresh Service | ✅ sync | A4.R10R-3 | Warning only |
| 7 | Data Aggregator | ✅ import | 8.8.4-L1 | Warning only |
| 8 | FX5 Scanner Bootstrap | ❌ fire-and-forget | R9.3.HF-5 | Error log |
| 9 | Route Registration | ✅ await | — | Fatal |
| 10 | Operation Queues | ✅ await | 41F-B-5 | Warning only |
| 11 | PaperSim Reset + Resume | ✅ await | 27.F.8 | Warning only |
| 12 | Rate Limiter Reset | ✅ await | — | Non-prod only |
| 13 | Test User Seeder | ✅ await | — | Non-prod only |
| 14 | Permission Cache | ✅ await | 27.3 | Warning only |
| 15 | Kraken Pair Metadata | ✅ await | 8.8.3 | Non-fatal |
| 16 | Kraken Auto-Map | ✅ await | I7-MAP-AUTO | Non-fatal |
| 17 | Trading State Sync | ✅ await | 27.4 | Warning only |
| 18 | Ethical Principles Seeder | ✅ await | 13.0 | Warning only |
| 19 | Strategy Sync | ✅ await | 8.5-F | Warning only |
| 20 | Portfolio Initializer | ✅ await | 8.5-K.4.1 | Warning only |
| 21 | Trading Bootstrap | ✅ await | A3.R2 | Warning only |
| 22 | Purpose Layer | ✅ await | 8.6.5 | Warning only |
| 23 | Corpus Domain Service | ✅ await | 8.6.5 | Warning only |
| 24 | Context Loader | ✅ await | 27 | Warning only |
| 25 | Phase 8.6.5 Routes | ✅ sync | 8.6.5 | Warning only |
| 26 | File Persistence Self-Test | ✅ await | 8.4-E.1 | Degraded mode |
| 27 | **Single-Tenant DB Invariant** | ✅ await | **2D** | **`process.exit(1)`** |
| 28 | Route Map Print/Dump | ✅ await | 2E/2F | Warning only |
| 29 | Walter Services | ❌ fire-and-forget | 27.F.14.B | Error log |
| 30 | Memory Lifecycle | ❌ fire-and-forget | 8.8.2 | Error log |
| 31 | Scheduler Registry | ❌ fire-and-forget | — | Error log |

**Key observation:** The single-tenant DB invariant check (step 27) is the **only startup step that causes a hard crash**. Everything else degrades gracefully. This is appropriate — data integrity is non-negotiable.

---

## 5. Startup Module: invariants.ts

**File:** `server/startup/invariants.ts` (~58 lines)
**Directive:** Phase 2D

### Purpose
Verifies single-tenant database architecture by checking that no `user_id` columns exist in the 5 core operational tables: `portfolio_state`, `strategy_settings`, `paper_sim_sessions`, `system_context`, `trading_settings_legacy`.

### Behavior
- If `SINGLE_TENANT=false`: skips check entirely
- Queries `information_schema.columns` for violations
- On violation: throws `[SingleTenantViolation]` → caught in index.ts → `process.exit(1)`
- Only checks operational tables — AI, Walter, audit, and backup tables intentionally keep `user_id`

**This is the only hard-crash invariant in the system.** Correctly implemented.

---

## 6. Startup Module: trading-bootstrap.ts

**File:** `server/startup/trading-bootstrap.ts` (~99 lines)
**Directive:** 8.8.4-A3.R2, A3.R7

### Purpose
On server restart, checks if trading engines were active (via `isEngineActive` in system_context) and reinitializes RTB refresh cycle + TCL watchdog for both paper and live modes.

### Startup Order (within this module)
1. Start Central Clock (idempotent)
2. Register event listeners (TCL_ACTIVATED, SlotOpened)
3. For each mode (paper, live):
   - Check `systemContext.isEngineActive`
   - If active: cleanup expired signals → start RTB refresh → set engine start time → start TCL watchdog

### Guard
- Boolean `bootstrapped` flag prevents double-initialization
- Central Clock start is idempotent (checks `getIsRunning()`)

---

## 7. Startup Module: fx5-scanner-bootstrap.ts

**File:** `server/startup/fx5-scanner-bootstrap.ts` (~33 lines)
**Directive:** R9.3.HF-5

### Purpose
Resilient FX5 Scanner initialization. Replaces stale singleton pattern that could block reinit.

### Behavior
- Prevents duplicate inits unless `force=true` or last attempt >60s ago
- Called from index.ts with `force=true` (fire-and-forget, non-blocking)
- On failure: resets `bootstrapped` flag for retry

---

## 8. Startup Module: portfolio-initializer.ts

**File:** `server/startup/portfolio-initializer.ts` (~55 lines)
**Directive:** 8.5 Addendum K.4.1

### Purpose
Ensures both `live` and `paper` entries exist in `portfolio_state` table.

### Behavior
- Live mode: Fetches balance from Kraken API; falls back to $0.00 on failure
- Paper mode: Creates with default $1000.00
- Uses `globalContextId = 'default'` (single-tenant)
- Idempotent — skips creation if entries already exist

---

## 9. Startup Module: lazy-loader.ts

**File:** `server/startup/lazy-loader.ts` (~189 lines)
**Directive:** Phase 5A (Parallel Lazy Loading + Deferral)

### Purpose
Loads non-critical services after the main startup sequence, using parallel `Promise.all` for critical services and `setTimeout` deferral for low-priority services.

### Critical Services (loaded in parallel)
1. **Cortex Core** — core trading intelligence + Bob snapshot sync
2. **Analytics Scheduler** — 15-min analytics cycle
3. **System Health Monitor** — wired to BobCore
4. **LATTI Manager** — **REMOVED** (Directive 11.8B-B, logs removal notice)
5. **Audit Report** — one-time Phase 30 report generation
6. **Market Data Health Check** — daily health checks

### Deferred Services
| Service | Delay | Interval |
|---------|-------|----------|
| DatabaseMonitor | +4s | Daily |
| StrategicDrive (SDPOE) | +6s | Hourly |
| SQE Distribution Logging | +8s | 10-min for 30min |
| MarketEventScheduler | +10s | 30s regime/friction checks |

**RISK-044 (LOW):** The lazy loader references the removed LATTI system (Directive 11.8B-B) with a stub that logs its removal. This is correct behavior for now but the stub should be cleaned up.

---

## 10. Startup Module: Other Seeders & Utilities

### ethical-principles-seeder.ts (~92 lines) — Phase 13.0
Seeds 5 foundational ethical principles to `ethicalPrinciple` table:
1. `transparency` (foundational, priority 1)
2. `harm_prevention` (foundational, priority 2)
3. `fairness` (foundational, priority 3)
4. `autonomy_bounds` (operational, priority 4)
5. `accountability` (operational, priority 5)

Idempotent — checks for existing principles before inserting.

**POTENTIAL LEGACY — REQUIRES INTENT CONFIRMATION:** These ethical principles appear to be part of the Walter-era autonomous AI framework. They reference concepts like "autonomous decision-making" and constraints like `require_reasoning_log`, `prohibit_manipulation`, `prohibit_front_running`. If the Walter-era learning stack is confirmed dead (per Phase 6), these principles may have no consumers. However, they may serve as compliance documentation or future-proofing. **Flagged for Kyle review.**

### rate-limiter-reset.ts (~39 lines)
Resets express-rate-limit store on startup. **Non-production only** (`NODE_ENV !== 'production'`). Logs to transparency system.

### test-user-seeder.ts (~86 lines)
Creates/updates test user account for automated testing. **Non-production only.** Creates user with `isAdmin: true` and default credentials from environment variables.

### printRoutes.ts (~46 lines) — Phase 2E/2F
Two functions:
- `printRoutes()`: Collects and prints registered routes to console
- `dumpRoutes()`: Writes route manifest to `diagnostics/phase2f_route_manifest.json` and warns about any `:userId` routes

---

## 11. Bootstrap: Schema Validator

**File:** `server/bootstrap/schema-validator.ts` (~97 lines)
**Directive:** 11.7F

### Purpose
Validates schema version consistency between canonical TypeScript definitions and bridge JSON files.

### Expected Schema
`regime-mapping/v1.4b`

### Behavior
- Reads `bridge/canonical/mapping-regime-strategy.json`
- Compares `_schema` field against expected version
- Major mismatch (not v1.4.x): error
- Minor mismatch (v1.4.x but not v1.4b): warning
- `validateSchemaVersionsStrict()`: throws on any errors (for production startup)

**Note:** This validator is defined but **not called from server/index.ts**. It must be invoked elsewhere (CI/CD or direct import). If it's not called during startup, schema mismatches would go undetected at runtime.

**RISK-045 (LOW):** Schema validator may not be invoked during server startup. Needs verification of calling site.

---

## 12. Scheduler Registry

**File:** `server/services/scheduler-registry.ts` (~134 lines)

### Purpose
Centralized registry for all autonomous scheduled tasks. Provides unified start/stop/execute lifecycle management.

### Interface
```typescript
interface ScheduledTask {
  name: string;
  description: string;
  frequency: string;
  intervalMs: number;
  run: () => Promise<void>;
  getInitialDelay?: () => number;
  lastRun: Date | null;
  nextRun: Date | null;
  status: 'running' | 'idle' | 'error';
}
```

### Registered Tasks (13 total, registered in index.ts)
| # | Task | Module |
|---|------|--------|
| 1 | Screener Recalibration | screener-recalibration-task |
| 2 | Market Scan | market-scan-task |
| 3 | AI Summary | ai-summary-task |
| 4 | System Health Check | system-health-check-task |
| 5 | CLE (Continuous Learning Engine) | cle-task |
| 6 | CWA (Cognitive Weight Adjustment) | cwa-task |
| 7 | Cache Purge | cache-purge-task |
| 8 | Semantic Ingestion | semantic-ingestion-task |
| 9 | Diagnostic Analysis | diagnostic-analysis-task |
| 10 | Optimization Analysis | optimization-analysis-task |
| 11 | Weekly Expert Insights | weekly-expert-insights-task |
| 12 | Trading Signals Cleanup | trading-signals-cleanup |
| 13 | Audit Anomaly Detection | audit-anomaly-task |

**Additionally, 3 jobs registered via their own functions (not through the registry interface):**
- `registerLearningFeedbackJob()`
- `registerFormulaAuditJob()`
- `registerFeedIntegrityJob()`

### Execution
- `startAllTasks()`: starts all tasks in parallel, each with their interval
- Initial execution uses `setTimeout` with either custom delay or intervalMs
- All results logged to `transparencyLog` table
- Task errors don't crash — caught and logged

**⚠️ POST-AUDIT INVESTIGATION REQUIRED (Kyle, Phase 7 Addendum):** At boot, 15+ scheduled tasks are registered and started, including AI summaries, weekly expert insights, semantic ingestion, optimization analysis, diagnostic analysis, audit anomaly tasks, plus the AutonomyScheduler, AwarenessScheduler, and LearningCycleService started separately. **None of these are directly required for the core paper trading path** (FX5 → SQE → RTB → TCL → PaperExecutionEngine). Kyle's directive: Investigate each scheduled task post-audit — does it directly support core paper trading? Is it autonomy-era infrastructure? Is it observational only? Can it be disabled in a "Core Trading Mode"? Should it be deprecated or removed? **No immediate shutdown required. Formal review required.**

Tasks #5 (CLE) and #6 (CWA) are specifically flagged as Walter-era learning components (Continuous Learning Engine and Cognitive Weight Adjustment). If the Walter-era stack is confirmed dead (Phase 6), these tasks may be executing against dead systems.

---

## 13. System Health (system-health.ts — LOCKED)

**File:** `server/services/system-health.ts` (~147 lines)
**Directive:** 8.8.4-A4.R10R-4
**Module Status:** 🔒 LOCKED

### Purpose
Low-level system health monitor for real-time metrics: CPU load, memory usage, event loop lag, process uptime.

### Implementation
- **Sampling interval:** 10 seconds
- **Event loop lag detection:** 100ms setInterval, measures actual vs expected delay
- **Health thresholds:** Memory <350MB, event loop lag <10ms
- **Global state:** Sets `global.__eventLoopLag` for cross-service access
- **Events:** Emits `update` event with full metrics on each sample

### Metrics Collected
| Metric | Source |
|--------|--------|
| CPU load | `os.loadavg()[0]` |
| RSS memory (MB) | `process.memoryUsage().rss` |
| Heap used/total | `process.memoryUsage()` |
| Event loop lag | Timer-based measurement |
| Uptime | `process.uptime()` |

---

## 14. System Health Monitor (system-health-monitor.ts)

**File:** `server/services/system-health-monitor.ts` (~437 lines)

### Purpose
Higher-level health analysis with anomaly detection, cache statistics, latency tracking, and scheduler monitoring. Consumed by BobCore and the self-repair service.

### Tracked Domains
1. **Cache:** Hit/miss rates (from BobCore)
2. **Latency:** Cortex, database, API (rolling 100-entry windows)
3. **Schedulers:** CortexSync and Analytics last-run timestamps
4. **File persistence:** Success/failure/timeout counts
5. **Execution layer:** Market data source, tick age, slippage, fees, rate pressure
6. **Context refresh:** Refresh latency, total/failed counts, discrepancy tracking

### Anomaly Thresholds
| Metric | Warning | Critical |
|--------|---------|----------|
| Cortex latency | 200ms | 500ms |
| Database latency | 500ms | 1000ms |
| Cache hit rate | <60% | <40% |
| Memory usage | >80% | >90% |
| CPU usage | >75% | >90% |
| Scheduler inactivity | >5 min (after 2min uptime) | — |

### Health States
- **healthy:** No warnings or critical issues
- **degraded:** Warnings present, no critical
- **critical:** One or more critical thresholds breached

---

## 15. Health Monitor (health-monitor.ts — Phase 41F-C)

**File:** `server/services/health-monitor.ts` (~1,495 lines)
**Directive:** Phase 41F-C/F/G/I

### Purpose
Comprehensive engine-level health monitoring with 5-second heartbeat, auto-recovery, anomaly detection, circuit breaker, and WebSocket broadcasting.

### Heartbeat Architecture
- **Interval:** 5 seconds
- **Ring buffer:** 250 heartbeats (~21 minutes)
- **Parallel checks:** Paper queue, live queue, paper engine, live engine, market data, SSOT, DB, broadcasts, external connectivity
- **Overall health:** Logical AND of all component `ok` flags

### Monitored Components
| Component | Check Method | OK Criteria |
|-----------|-------------|-------------|
| Paper/Live Queue | OperationQueue.getStatus() | Depth <10, executing job <3s |
| Paper/Live Engine | global.tradingEngines map | Running + tick <60s ago |
| Market Data | MarketDataCoordinator | WS connected or REST fallback <20s |
| SSOT Cache | MarketEvaluationService | Hit rate >50% |
| Database | `SELECT 1` probe | Query time <1s |
| Broadcasts | Internal tracking | Last broadcast <30s, avg latency <100ms |
| External (Kraken) | Internal tracking | Last success > last error |

### Anomaly Detection (Phase 41F-F)
| Metric | Warning | Critical |
|--------|---------|----------|
| Heartbeat latency | 200ms | 400ms |
| Broadcast latency | 120ms | 200ms |
| Queue depth | 5 | 10 |
| Job age | 15s | 30s |
| WS silence | 2 cycles | 4 cycles |
| Trade pipeline idle | — | 60s (while engine active) |

### Auto-Recovery Framework (Phase 41F-G)
- **Cooldown:** 120 seconds between recovery attempts
- **Circuit breaker:** Activates after 3 recoveries in 10 minutes, suspends for 10 minutes
- **Recovery actions:** Currently all "simulated" (log + emit only). No actual restarts are executed.

**RISK-046 (MEDIUM):** Auto-recovery actions are all placeholder implementations. Every recovery handler logs a warning but takes no corrective action. The `executeRecovery()` method has a full framework for planned actions (force_websocket_reconnect, purge_old_queue_jobs, restart_trading_engine, etc.) but all paths end with `success = true` and a console.log. This means the health monitor detects problems but cannot fix them.

---

## 16. Feed Integrity Monitor

**File:** `server/services/feed-integrity-monitor.ts` (~572 lines)

### Purpose
Monitors Kraken WebSocket and REST fallback feed health with configurable thresholds, grading, and alert deduplication.

### Health Categories
| Status | Criteria |
|--------|----------|
| Healthy | <3 reconnects AND <5s tick age |
| Warning | ≥3 reconnects OR ≥5s tick age |
| Critical | ≥5 reconnects OR ≥10s tick age |

### Grading System (A-F)
| Grade | Max Latency | Min Uptime | Max Reconnects | Max Tick Age |
|-------|------------|-----------|---------------|-------------|
| A | 500ms | 99% | 0 | 2s |
| B | 1000ms | 95% | 2 | 5s |
| C | 2000ms | 90% | 5 | 10s |
| D | 3000ms | 80% | 10 | 20s |
| F | Worse than D | | | |

### Configuration
All thresholds are env-configurable via `FEED_*` environment variables with sensible defaults.

### Tracking
- Rolling 12-snapshot history (1 hour at 5-min intervals)
- Time-based uptime percentage (minutes healthy / total minutes)
- Alert deduplication with 5-minute cooldown
- Report export to JSON file

---

## 17. Self-Repair Service

**File:** `server/services/self-repair.ts` (~303 lines)

### Purpose
Automated repair for critical system health issues. Triggered when SystemHealthMonitor detects critical status.

### Repair Strategies
| Issue Type | Action |
|-----------|--------|
| Cortex latency / Cache | Flush BobCore cache + prefetch rebuild |
| Database latency | Retry connection 3x with exponential backoff |
| Memory usage | Force GC (if available) + cache clear |
| CPU usage | Monitor only (no direct action) |
| Unknown | Log only |

### Safeguards
- `isRepairing` flag prevents concurrent repairs
- Max 3 retry attempts with 1s × attempt delay
- All actions recorded in repair history (last 100)
- Manual trigger via `manualRecover()` method

---

## 18. Operation Queue (operation-queue.ts — Phase 41F-A/B)

**File:** `server/utils/operation-queue.ts` (~200+ lines)
**Directive:** Phase 41F-A/B

### Purpose
Lightweight in-memory FIFO queue for serializing trading operations (start/stop) to prevent concurrent request collisions.

### Features
- Sequential execution (one job at a time)
- Request deduplication by `userId:mode:action` key
- Duplicate requests piggyback on existing jobs
- Automatic retry (once) with 500ms backoff
- Promise-based result notification
- Telemetry logging with queue depth tracking
- Graceful shutdown support

### Two Instances
- `paperOperationQueue` — paper mode operations
- `liveOperationQueue` — live mode operations

Both initialized in index.ts via `initializeQueues()`.

---

## 19. Task Queue (task-queue.ts)

**File:** `server/services/task-queue.ts` (~367 lines)
**Directive:** Phase 8.8.3

### Purpose
PostgreSQL-backed async task queue for AI reasoning tasks (DevOpsBob, FullStackBob, UXBob). Uses optimistic locking with `FOR UPDATE SKIP LOCKED` for concurrent worker safety.

### Implementation
- **Backing store:** `reasoning_queue` PostgreSQL table
- **Worker ID:** Random nanoid per instance
- **Concurrency:** Configurable via `TASK_QUEUE_CONCURRENCY` env (default: 5)
- **Retry:** 3 attempts with exponential backoff (1s, 2s, 4s) + random jitter
- **Cleanup:** Auto-deletes completed/failed tasks older than 7 days
- **Forensics:** Permanent failures logged to `memory_audit_log` table
- **Broadcasts:** Queue events sent to Context Bridge for real-time UI updates

---

## 20. Task Router (task-router.ts) — Phase 17.0 Cluster System

**File:** `server/services/task-router.ts` (~428 lines)
**Directive:** Phase 17.0

### Purpose
Routes cluster tasks to appropriate nodes based on task type affinity, node capacity, and load balancing.

### Task Type → Role Affinity
| Task Type | Preferred Roles |
|-----------|----------------|
| trading_signal | trading, general |
| market_analysis | analysis, research, general |
| risk_assessment | analysis, compliance, general |
| compliance_check | compliance, general |
| research | research, general |
| optimization | general |
| general | general |

### Implementation
- **Admission control:** Max global queue depth of 1,000 tasks
- **Load balancing:** Assigns to least-loaded healthy node with matching role
- **Node health:** Requires heartbeat within 2 minutes
- **Max load:** Rejects assignment if node >90% capacity
- **Retry:** Exponential backoff with ±25% jitter, 1s base, 60s max
- **Dead letter:** Failed tasks after max retries marked as permanently failed
- **Rebalancing:** `rebalanceStuckTasks()` rescues tasks stuck >30 minutes

**POTENTIAL LEGACY — REQUIRES INTENT CONFIRMATION:** The entire Phase 17.0 cluster system (TaskRouter + TaskWorker + ClusterBus + ClusterRegistry) references multi-node distributed computing capabilities. DawnTrader is currently a single-node system. This cluster infrastructure appears to be pre-built scaffolding for a feature that was never activated. The TaskRouter queries `cluster_node` table for healthy nodes, but there is no evidence of cluster node registration in the startup sequence. **Flagged for Kyle review.**

---

## 21. Task Worker (task-worker.ts) — Phase 17.0 Cluster System

**File:** `server/services/task-worker.ts` (~407 lines)
**Directive:** Phase 17.0, 17.5, 17.6

### Purpose
Executes cluster tasks through a full gate pipeline: Circuit Breaker → Safety → Federated Ethics → Ethical Reasoner → Knowledge Acquisition → Execution.

### Implementation
- **Poll interval:** 5 seconds
- **Max concurrent:** 5 tasks
- **Gate pipeline:** Simulated (all gates always pass) — `simulateGateExecution()` returns `true`
- **Task handlers:** All return placeholder results (e.g., `{ signal: "processed" }`)
- **Audit logging:** Per-gate execution logged to `cluster_audit_log` table
- **Circuit breaker:** Integrates with per-node circuit breaker service

**This module is entirely non-functional.** The gate pipeline always passes. The task handlers return stub responses. The worker polls for tasks but the cluster_node registration required for task assignment doesn't exist in the startup sequence. This is dead infrastructure.

---

## 22. Walter Shutdown Gate

**Referenced in:** `server/index.ts` lines 381-420
**Directive:** 27.F.14.B

### Purpose
When `WALTER_DISABLED=true`, skips initialization of:
- AI Opportunities service (hourly)
- Daily Brief service
- Market Analysis scheduler
- AI Orchestrator (already commented out — "Phase 0: Removed")
- Walter Health Monitor

When enabled, these 4 services start as fire-and-forget promises. Failures are caught and logged but don't affect server startup.

**Note:** The AI Orchestrator import is already commented out with "Phase 0: Removed AI Orchestrator (legacy module)". This confirms the orchestrator was deprecated before the Walter shutdown gate was added.

---

## 23. Graceful Shutdown

**Primary handler:** `server/index.ts` lines 1228-1259
**Secondary handler:** `server/core/boot_orchestrator.ts` lines 51-73

### Primary Shutdown Order (index.ts)
1. Operation queues (`shutdownAllQueues`)
2. RTB Refresh Service (`stop()`)
3. Data Aggregator (`shutdown()` — flushes pending data)
4. Central Clock (`stop()`)
5. Price Cache (`shutdown()`)
6. System Health (`stop()`)
7. `process.exit(0)`

### Secondary Shutdown (boot_orchestrator.ts)
1. VTS Runner (`stopVTSRunner()`)
2. ML Service (`stopMLService()` — SIGTERM → 5s timeout → SIGKILL)
3. Health check interval cleared

### Shutdown Race Condition (BUG-015)
Both handlers register independently for SIGTERM/SIGINT. Since the primary handler calls `process.exit(0)`, the secondary handler's ML service graceful shutdown (5-second timeout for SIGTERM before SIGKILL) may be truncated or never executed.

---

## 24. Data Flow — Boot to Steady-State

```
Server Start
    │
    ▼
Express Setup (CORS, middleware, guards)
    │
    ▼
Boot Orchestrator → ML Service spawn → VTS init → pattern preload
    │
    ▼
Core Services: PriceCache → CentralClock → RTB Refresh → DataAggregator
    │
    ▼
Route Registration + API mounting
    │
    ▼
Queue Init → PaperSim Reset → Rate Limiter → Test User
    │
    ▼
Kraken Metadata → Auto-Map → Trading State Recovery
    │
    ▼
Ethics Seed → Strategy Sync → Portfolio Init → Trading Bootstrap
    │
    ▼
Purpose Layer → Corpus Domains → Context Loader → Debug Routes
    │
    ▼
File Persistence Self-Test
    │
    ▼
█ HARD GATE: Single-Tenant DB Invariant (exit on failure)
    │
    ▼
Route Map Print/Dump
    │
    ▼
═══════════ server.listen() ═══════════
    │
    ▼
POST-LISTEN (parallel fire-and-forget):
├── Walter services (if enabled)
├── Memory Lifecycle
├── Scheduler Registry (13 tasks)
│
▼
LIVE PRICING + WEBSOCKET CHAIN:
LivePricingAdapter → WebSocket checker → VolumeClassifier →
ActiveFilterPool → TrailingStates → KrakenWS start
    │
    ▼
LAZY LOADER (+1.5s):
├── Cortex Core + Analytics (parallel)
├── System Health Monitor + BobCore wire-up
├── Market Data Health Check
├── DatabaseMonitor (+4s deferred)
├── StrategicDrive (+6s deferred)
├── SQE Distribution (+8s deferred)
├── MarketEventScheduler (+10s deferred)
│
▼
ML Calibration Scheduler (+1.5s, 8-hour cadence)
Archival Scheduler (+1.5s)
    │
    ▼
Config Audit Telemetry (ConfigSnapshot, FilterCoherence,
                         GuardrailsCoherence, OverridesHistory,
                         CrossMode)
    │
    ▼
Health Report Scheduler (hourly)
PaperSim Heartbeat (recovery + monitoring)
Learning Cycle Service (24-hour)
Autonomy Scheduler (hourly self-checks, daily optimization)
Awareness Scheduler (hourly state, 6-hour reflections)
Engine Health Monitor (5s heartbeat + WebSocket broadcasting)
    │
    ▼
PRICE FORWARDING LOOP (1s interval):
LivePricingAdapter → MicroExecutionService (paper + live) ⚠️ [POST-AUDIT REVIEW]
    │
    ▼
═══════════ STEADY STATE ═══════════
```

**⚠️ Kyle (Phase 7 Addendum) — MicroExecutionService:** Receives price updates every second, wired during boot, but not confirmed to be part of active trade path. Post-audit investigation required: Is it referenced by paper or live execution engines? Is it purely experimental? Is it safe to disable at boot? Should it be deprecated pending future micro-coin strategy work?

---

## 25. Critical Findings

### New Bugs

| ID | Severity | Description | File | Kyle Decision |
|----|----------|-------------|------|---------------|
| BUG-015 | MEDIUM | Dual shutdown handlers (index.ts + boot_orchestrator.ts) create race condition. ML service may not get graceful shutdown. | server/index.ts, server/core/boot_orchestrator.ts | Post-audit investigation |

### New Risks

| ID | Severity | Description | File | Kyle Decision |
|----|----------|-------------|------|---------------|
| RISK-044 | LOW | Lazy loader contains LATTI removal stub (correct but should be cleaned up) | server/startup/lazy-loader.ts | Post-audit LATTI cleanup |
| RISK-045 | LOW | Schema validator (11.7F) defined but not called from startup sequence | server/bootstrap/schema-validator.ts | Post-audit verification |
| RISK-046 | MEDIUM | Health monitor auto-recovery actions are all placeholder implementations — detects but cannot fix | server/services/health-monitor.ts | Post-audit investigation |
| RISK-047 | INFORMATIONAL | Startup sequence ~1,260 lines in single file. High coupling but functional. | server/index.ts | Acknowledged — architectural accumulation |

### Systems Flagged for Post-Audit Investigation (Kyle Directive)

Kyle's Phase 7 Addendum reclassifies all potential legacy findings from "AWAITING KYLE CONFIRMATION" to **"POST-AUDIT CLEANUP INVESTIGATION REQUIRED"**. These systems are not emergency defects — they are hygiene candidates that will be formally reviewed after the audit is complete.

| System | Status | Investigation Required |
|--------|--------|----------------------|
| Phase 17.0 Cluster System (TaskRouter + TaskWorker) | FLAGGED — Post-Audit | Scope verification, dependency tracing, mutation impact review |
| CLE/CWA Scheduler Tasks | FLAGGED — Post-Audit | Does it support core trading? Is it autonomy-era? Can it be disabled? |
| Ethical Principles Seeder | FLAGGED — Post-Audit | Are there active consumers? Compliance data or dead code? |
| Background Scheduler Tasks (13+ tasks) | FLAGGED — Post-Audit | Which tasks support core trading? Which are autonomy-era? |
| MicroExecutionService | FLAGGED — Post-Audit | Is it part of active trade path? Experimental? Safe to disable? |
| AutonomyScheduler | FLAGGED — Post-Audit | Does it mutate trading config, risk settings, or filters? Or read-only? |
| AwarenessScheduler | FLAGGED — Post-Audit | Does it mutate trading config, risk settings, or filters? Or read-only? |
| LearningCycleService | FLAGGED — Post-Audit | Premature activation during ML refactor? Disable or rebuild after VTS correction? |
| LATTI/Coherence Residual Flags | FLAGGED — Post-Audit | Do lattiManaged, lockedByUser, manualOverride fields still serve purpose? |

### Required Corrections (from audit findings + Kyle addendum)

1. **POST-AUDIT:** Consolidate shutdown handlers to prevent ML service shutdown race (BUG-015)
2. **POST-AUDIT:** Formal investigation of all 9 systems listed above — each requires: scope verification, dependency tracing, mutation impact review, performance impact review, and final decision (retain / disable / refactor / deprecate / remove)
3. **POST-AUDIT:** Determine whether AutonomyScheduler and AwarenessScheduler have write paths that mutate trading configuration, risk settings, or filters
4. **POST-AUDIT:** Evaluate whether LearningCycleService should remain active during ML refactor, be temporarily disabled, or be rebuilt after strategy-specific VTS correction
5. **POST-AUDIT:** Confirm whether residual LATTI coherence flags (`lattiManaged`, `lockedByUser`, `manualOverride`) serve any active purpose; if LATTI is fully removed, eliminate residual fields
6. **POST-AUDIT:** Implement actual auto-recovery actions in health-monitor.ts or remove the framework (RISK-046)
7. **LOW:** Verify schema-validator.ts is invoked somewhere (CI/CD or startup)
8. **LOW:** Clean up LATTI removal stub in lazy-loader.ts

---

## 26. Post-Audit Infrastructure Review (Kyle Directive)

> **Kyle (Phase 7 Addendum):** "Phase 7 does not indicate instability. It indicates architectural accumulation. These items must be revisited during the structured cleanup phase after the audit is complete. They are not emergency defects. They are hygiene candidates."

### Post-Audit Cleanup Investigation List

The following systems are flagged for formal investigation after audit completion. Each will undergo:

1. **Scope verification** — What does this system actually do?
2. **Dependency tracing** — What imports it? What does it import?
3. **Mutation impact review** — Does it modify any trading state, configuration, or risk parameters?
4. **Performance impact review** — Does it consume meaningful CPU/memory/database resources?
5. **Final decision:** Retain | Disable | Refactor | Deprecate | Remove

#### Systems Under Review

| # | System | Core Trading Required? | Risk Level | Notes |
|---|--------|----------------------|------------|-------|
| 1 | Background scheduler tasks not on core trading path | Unknown | LOW | AI summaries, weekly insights, semantic ingestion, optimization analysis, diagnostic analysis, audit anomaly |
| 2 | MicroExecutionService | Unknown | MEDIUM | Receives 1s price updates, wired at boot. May be experimental micro-coin infrastructure. |
| 3 | AutonomyScheduler | Unknown | MEDIUM | Hourly self-checks, daily optimization. May mutate guardrails or filters. |
| 4 | AwarenessScheduler | Unknown | MEDIUM | Hourly state updates, 6-hour reflections. Write paths unknown. |
| 5 | LearningCycleService | Possibly premature | MEDIUM | 24-hour learning cycle running during active ML refactor and VTS correction. |
| 6 | LATTI/Coherence residual flags | Unknown | LOW | `lattiManaged`, `lockedByUser`, `manualOverride` in boot audit telemetry. |
| 7 | CLE/CWA Scheduler Tasks | Likely Walter-era | LOW | Continuous Learning Engine and Cognitive Weight Adjustment tasks. |
| 8 | Ethical Principles Seeder | Unknown | LOW | Seeds autonomous AI decision-making principles. May have no consumers. |
| 9 | Phase 17.0 Cluster System | No (dead infra) | LOW | TaskRouter + TaskWorker. No cluster nodes registered. Simulated gates. |

#### Core Trading Path (for reference — systems NOT under review)

These systems **directly support** the active paper trading pipeline and are confirmed required:

```
FX5 Scanner → SQE (Signal Quality Evaluator) → RTB (Ready To Buy) →
TCL (Trade Candidate List) → PaperExecutionEngine →
Signal Generation → Risk Management → Execution → Telemetry → Calibration
```

Any service not directly tied to signal generation, risk management, execution, telemetry, or calibration is a candidate for this review.

---

## 27. File Catalog

| File | Lines | Directive | Status |
|------|-------|-----------|--------|
| server/index.ts | ~1,260 | A4.R10R-3 | ACTIVE — monolithic boot |
| server/core/boot_orchestrator.ts | ~348 | 8.8.4-L3 | ACTIVE |
| server/startup/invariants.ts | ~58 | 2D | ACTIVE — hard gate |
| server/startup/trading-bootstrap.ts | ~99 | A3.R2, A3.R7 | ACTIVE |
| server/startup/fx5-scanner-bootstrap.ts | ~33 | R9.3.HF-5 | ACTIVE |
| server/startup/portfolio-initializer.ts | ~55 | 8.5-K.4.1 | ACTIVE |
| server/startup/lazy-loader.ts | ~189 | Phase 5A | ACTIVE |
| server/startup/ethical-principles-seeder.ts | ~92 | 13.0 | POTENTIAL LEGACY |
| server/startup/rate-limiter-reset.ts | ~39 | — | ACTIVE (non-prod) |
| server/startup/test-user-seeder.ts | ~86 | — | ACTIVE (non-prod) |
| server/startup/printRoutes.ts | ~46 | 2E/2F | ACTIVE |
| server/bootstrap/schema-validator.ts | ~97 | 11.7F | ACTIVE (call site unknown) |
| server/services/scheduler-registry.ts | ~134 | — | ACTIVE |
| server/services/system-health.ts | ~147 | A4.R10R-4 | 🔒 LOCKED |
| server/services/system-health-monitor.ts | ~437 | — | ACTIVE |
| server/services/health-monitor.ts | ~1,495 | 41F-C/F/G/I | ACTIVE |
| server/services/feed-integrity-monitor.ts | ~572 | — | ACTIVE |
| server/services/self-repair.ts | ~303 | — | ACTIVE |
| server/utils/operation-queue.ts | ~200+ | 41F-A/B | ACTIVE |
| server/services/task-queue.ts | ~367 | 8.8.3 | ACTIVE |
| server/services/task-router.ts | ~428 | 17.0 | POTENTIAL LEGACY |
| server/services/task-worker.ts | ~407 | 17.0/17.5/17.6 | POTENTIAL LEGACY |

---

## 28. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-16 | Claude Code | Initial audit: 22 files deep-read, 1 bug, 4 risks, 3 potential legacy systems identified |
| 1.1 | 2026-02-16 | Claude Code | Phase 7 Addendum applied: Kyle's executive position added. All potential legacy systems reclassified from "AWAITING KYLE CONFIRMATION" to "POST-AUDIT CLEANUP INVESTIGATION REQUIRED". 9 systems added to Post-Audit Infrastructure Review list. MicroExecutionService, AutonomyScheduler, AwarenessScheduler, LearningCycleService, LATTI/coherence residual flags added as investigation items per Kyle's directives. New Section 26 (Post-Audit Infrastructure Review) added. Required Corrections updated from deprecation actions to post-audit investigation items. |

---

## 27. Telegram / OpenClaw Agent Infrastructure (Post-B15b Operational Rules) — **SUPERSEDED 2026-05-06**

> **Status:** This entire section is HISTORICAL as of 2026-05-06. OpenClaw was decommissioned and replaced with two custom Python long-polling bridges running Claude Code under Kyle's Max OAuth. The diagnostic runbook below remains useful only when troubleshooting any pre-2026-05-06 incident reports referencing OpenClaw. **For the current canonical comms protocol, see project `CLAUDE.md` §6 (send/receive) and §8 (operations + diagnostic runbook).** New stack: `langston-bridge.service` + `cc-comms-bridge.service`, unified inbox at `/var/log/cc-bridge-inbox.jsonl`, no `openclaw` / `cc-inbox` / `--deliver` commands.

**Added 2026-04-15** after a 14-hour CCDT relay outage traced to six compounding root causes. See `CHANGES_AND_FIXES.md` INFRA-15B-001 for the full postmortem. This section captures the operational rules that came out of that incident so they are surfaced in the System Manual rather than buried in a fix log.

### 27.1 Agent-to-Account Bindings Are Two-Part State

An OpenClaw agent (e.g. `telegram-relay`, `main`, `conductor`) must be wired to a Telegram channel account via BOTH:

1. **Config declaration** in `/root/.openclaw/openclaw.json` — `channels.telegram.accounts.<accountId>` must exist and `enabled: true`. The account declares the bot token and the groups/topics it subscribes to.
2. **Runtime binding** via `openclaw agents bind telegram-relay ← telegram accountId=<accountId>`. This is separate runtime state that can be wiped independently of the config. `enabled: true` alone is **not sufficient** — the runtime bind is a separate wire.

**Diagnostic:** `openclaw health` reports healthy bots with their bot handles (e.g. `telegram: ok (@LangstonDTBot, @CCDTCommsBot)`). If an expected bot is missing from the health output, the binding is broken. Check config first, then re-bind.

### 27.2 Model Choice for Tool-Calling Agents

**Never use `openai/gpt-4.1-mini` for OpenClaw agents that need to invoke shell tools** (CCDT Relay, Conductor, or any agent whose workspace instructions include `cc-inbox write`, `curl`, `ssh`, or other shell-tool invocations). The mini variant cannot reliably call tools — instead of executing the tool, it will output the command as literal text (e.g. emitting `cc-inbox write "..."` as a chat message), which leaks into whatever channel the agent responds to. This was the root cause of the "CCDT posting fake acks" symptom in INFRA-15B-001.

**Rule**: Tool-calling agents require `openai/gpt-4.1` (full) minimum. `openai/gpt-4.1-mini` is acceptable for text-generation-only jobs (summarization, transcription relay, conversational responses) where no shell tool invocation is expected.

### 27.3 Duplicate Gateway Check

When an OpenClaw agent is misbehaving — intermittent responses, missing messages, responses showing as the wrong bot — always check for duplicate gateway processes before touching config:

```bash
systemctl list-units --type=service | grep openclaw
ps aux | grep openclaw-gateway
```

A leftover systemd unit from an older deployment (e.g. `openclaw-ccdt.service`) can run in parallel with the main gateway, fighting for the same bot token. Either gateway can handle any given inbound message, each with stale config, producing intermittent and confusing behavior. Stop and disable any leftover units with `systemctl stop <unit> && systemctl disable <unit>`.

### 27.4 Workspace File Path Verification

OpenClaw profiles can have multiple workspace paths. If an agent's behavior contradicts its documented workspace rules (e.g. its SOUL.md says "silent in group topics" but the agent is chatty), the agent may be loading a **different file** from what you are editing.

**Canonical workspace paths** for the main OpenClaw profile (as of 2026-04-15):
- **`main` agent (Langston)**: `/root/.openclaw/workspace/` — contains BOOTSTRAP.md, SOUL.md, IDENTITY.md, USER.md, AGENTS.md, MEMORY.md, TOOLS.md, GOVERNANCE_RULES.md, HEARTBEAT.md
- **`telegram-relay` agent (CCDT)**: `/root/.openclaw/agents/telegram-relay/workspace/` — contains its own BOOTSTRAP.md, SOUL.md, IDENTITY.md, USER.md, AGENTS.md, MEMORY.md, TOOLS.md

**Obsolete profile path** (do NOT edit — this is not the live workspace):
- `/root/.openclaw-ccdt/workspace/` — leftover from a previous separate OpenClaw profile that was decommissioned. Should be deleted or renamed `.obsolete` to prevent future confusion.

**Verification**: `openclaw health` output lists registered agent names. `openclaw.json` → `agents.list[].workspace` shows the canonical workspace path. If you edit a workspace file and the agent's behavior doesn't change on next session spawn, you are editing the wrong path.

### 27.5 Bot Identity Reference

| Bot handle | Token prefix | OpenClaw account | Agent | Purpose |
|---|---|---|---|---|
| `@LangstonDTBot` (display "Langston DT") | `7953472847:...` | `default` | `main` | Langston conversational agent, Thread 21 (Batch Implementation) and Thread 28 (Design) |
| `@CCDTCommsBot` (display "CCDT Communicator") | `8758978168:...` | `ccdt-relay` | `telegram-relay` | Silent message relay from Topic 21/28 to `cc-inbox`; image saving to `Claude Comms and Packages/CCDT Relay/images/` |

**Outbound send attribution**: a Telegram message posted via `openclaw message send --account <accountId>` appears in Telegram under the display name of that account's bot. Confusingly, this means CC-initiated sends via `--account ccdt-relay` show as "CCDT Communicator" in the group even though they are explicit CC sends, not autonomous relay activity. Don't confuse the two. The relay agent should be SILENT in group topics — any text output from it in a group is a regression (see §27.2 above for the root cause).

### 27.6 cc-inbox Write Format (Relay Contract)

The relay agent's contract is to write to `/root/claude-code-inbox.json` via `cc-inbox write` with this exact format:

```
[FROM: <sender_name>] [TOPIC: <topic_id>] <message_text>
```

For images: `[FROM: <sender_name>] [TOPIC: <topic_id>] [IMAGE] Saved to: Claude Comms and Packages/CCDT Relay/images/<filename>`

For voice notes: `[FROM: <sender_name>] [TOPIC: <topic_id>] [VOICE NOTE] <transcription>`

**Regression signal**: if `cc-inbox write` literal text ever appears in a Telegram group topic (instead of being silently executed), the relay agent's model tier has been downgraded below the tool-calling threshold, or the binding has been wiped again. Alert immediately and re-check §27.1–§27.2.

### 27.7 Post-Incident Cleanup Items (Open)

- [ ] Delete or rename `/root/.openclaw-ccdt/` (obsolete profile path) to prevent future workspace-file-path confusion.
- [ ] Monitor [openclaw/openclaw#42225](https://github.com/openclaw/openclaw/issues/42225) and [PR #44475](https://github.com/openclaw/openclaw/pull/44475) for the 1M context override fix; re-apply `models.providers.openai.models[].contextWindow = 1050000` once the passthrough fix ships.
- [ ] `openclaw-ccdt.service` systemd unit has been stopped and disabled, but the unit file may still exist at `/etc/systemd/system/openclaw-ccdt.service`. Consider removing the file entirely.

---

# Chapter 8: API & Communication Layer

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [API Architecture Overview](#2-api-architecture-overview)
3. [Authentication System](#3-authentication-system)
4. [Middleware Stack](#4-middleware-stack)
5. [The Monolithic Router — routes.ts](#5-the-monolithic-router--routests)
6. [Route File Catalog — 26 Modular Route Files](#6-route-file-catalog--26-modular-route-files)
7. [WebSocket Protocol](#7-websocket-protocol)
8. [Market Data WebSocket — Kraken v2 Adapter](#8-market-data-websocket--kraken-v2-adapter)
9. [Route Mounting & Registration Patterns](#9-route-mounting--registration-patterns)
10. [Security Architecture & Findings](#10-security-architecture--findings)
11. [Deprecated & Legacy Endpoints](#11-deprecated--legacy-endpoints)
12. [L-Series Route Files — Legacy API Surface](#12-l-series-route-files--legacy-api-surface)
13. [Data Flow: Request Lifecycle](#13-data-flow-request-lifecycle)
14. [Critical Findings & Kyle Decision Points](#14-critical-findings--kyle-decision-points)
15. [Phase 8 Addendum — Kyle Directives](#15-phase-8-addendum--kyle-directives)
16. [File Catalog](#16-file-catalog)
17. [Revision History](#17-revision-history)

---

## 1. Executive Summary

DawnTrader's API layer is a **single monolithic Express router** (`routes.ts` at 23,349 lines with ~635 inline endpoints) plus **26 modular route files** mounted via dynamic imports. The combined API surface exposes approximately **750+ endpoints** covering authentication, trading engine control, guardrails, filters, portfolio management, VTS, diagnostics, telemetry, Walter/Bob chat, admin, and system health.

### Key Architectural Observations

1. **routes.ts is the largest file in the entire codebase** — 23,349 lines containing ~635 endpoints, 40+ service imports, full JWT auth middleware, rate limiting, WebSocket server, CSV generation, tax reporting, and the complete route registration for all 26 modular route files. This is the single most extreme monolithic accumulation point in DawnTrader.

2. **Authentication is inconsistent** — routes.ts uses a database-backed `authenticateToken` middleware (fail-closed, fetches user from DB on every request). The 26 modular route files use one of four different auth approaches: (a) copy-pasted JWT-only `requireAuth` with hardcoded fallback secret, (b) `x-internal-audit` header bypass, (c) centralized middleware import, or (d) no authentication at all.

3. **Security findings are significant** — hardcoded JWT fallback secrets, unauthenticated diagnostic/audit endpoints, auth bypass headers, and inconsistent secret values across files. These are documented in detail in §10.

4. **WebSocket is minimal** — A simple 3-message handler (subscribe_prices, subscribe_trades, ping/pong) for frontend real-time updates. The heavier Kraken market data WebSocket is a separate singleton service.

5. **L-Series route files expose dead backend systems** — 8 route files (dce, gasp, mof, maco, pdc-ecs, apr-sle, rl, plus portions of audit/m3b/tlva) expose L-Series autonomy cluster endpoints already confirmed legacy in Phase 4.

---

## 2. API Architecture Overview

### Transport

| Protocol | Path/Port | Purpose |
|----------|-----------|---------|
| HTTP/Express | `/api/*` | All REST endpoints (JSON API) |
| WebSocket | `/ws` | Frontend real-time updates (prices, trades, system events) |
| WebSocket | `wss://ws.kraken.com/v2` | Kraken market data (ticker + order book) — outbound only |

### Express Application Structure

```
Express App
├── Static middleware (Vite dev server in development)
├── JSON body parser (50mb limit)
├── Cookie parser
├── CORS (permissive)
├── Rate limiter (15min window, 1000 req limit)
├── Single-tenant guard middleware
├── Canonical validation middleware
├── Bob routing middleware (transparent interception)
│
├── /api/* ─── apiRouter
│   ├── Inline endpoints (~635 in routes.ts)
│   │   ├── /api/auth/* (register, login, verify, refresh)
│   │   ├── /api/admin/* (users, roles)
│   │   ├── /api/trading/* (start, stop, status)
│   │   ├── /api/guardrails-v2/* (CRUD, kill switch)
│   │   ├── /api/filters-v2/* (filter config, SQE thresholds)
│   │   ├── /api/paper-sim/* (status, portfolio, trades)
│   │   ├── /api/telemetry/* (strategy perf, VTP)
│   │   ├── /api/walter/* (chat, memory, summaries)
│   │   ├── /api/system/* (health, config, events)
│   │   ├── /api/governance/* (regime, strategy, mapping)
│   │   └── ... (~60+ endpoint groups)
│   │
│   └── Mounted route files (26 files via dynamic import)
│       ├── /api/status/* → routes/status.ts
│       ├── /api/health/* → routes/health.ts
│       ├── /api/vts/* → routes/vts.ts
│       ├── /api/market/* → routes/market.ts
│       └── ... (22 more, see §6)
│
├── /api/* (registered on app directly, not apiRouter)
│   ├── /api/diagnostics/dse/* → routes/dse.ts (via index.ts)
│   ├── /api/walter/*, /api/learning/*, /api/governance/* → routes/phase-8.6.5.ts (via index.ts)
│   └── /api/provenance/debug/* → routes/provenance-debug.ts (via index.ts)
│
├── WebSocket Server (/ws)
│
└── 404 catch-all (returns JSON for /api/*, HTML for others)
```

### Endpoint Scale

| Category | Approximate Count |
|----------|-------------------|
| Inline endpoints in routes.ts | ~635 |
| Endpoints in 26 route files | ~115 |
| **Total API surface** | **~750** |

---

## 3. Authentication System

### JWT Token Architecture

| Parameter | Value |
|-----------|-------|
| Access token lifetime | 12 hours |
| Refresh token lifetime | 7 days |
| Signing algorithm | HS256 (default jsonwebtoken) |
| Secret source | `JWT_SECRET` environment variable |
| Password hashing | bcrypt (10 rounds) |
| Password requirements | 8+ chars, uppercase, number, special character |

### Role-Based Access Control (RBAC)

DawnTrader implements Phase 27.3 permission-based access control:

| Role | Permissions |
|------|-------------|
| `owner` | Full access — all read/write operations, user management, system configuration |
| `editor` | Read + write — can modify guardrails, start/stop trading, manage filters |
| `viewer` | Read-only — can view dashboards, trades, telemetry but cannot modify |

### Authentication Middleware in routes.ts — `authenticateToken()`

The main router uses a **database-backed, fail-closed** authentication middleware:

1. Extracts JWT from `Authorization: Bearer <token>` header
2. Verifies token against `JWT_SECRET` (or `JWT_REFRESH_SECRET` for refresh tokens)
3. **Fetches user record from database on every request** — never trusts stale token data
4. If user not found in DB → reject (fail-closed)
5. Attaches `req.userId`, `req.userRole`, `req.userPermissions` to request

**Critical: This is NOT the same middleware used by the 26 route files.** See §10 for the security implications.

### Auth Service — `server/services/auth-service.ts`

Minimal utility module (47 lines):
- `validatePasswordStrength()` — enforces 8+ chars with uppercase, number, special character
- `hashPassword()` — bcrypt with 10 rounds
- `verifyPassword()` — bcrypt compare
- `getPasswordStrengthMessage()` — human-readable requirements

### Auth Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | None | **DISABLED** — returns 410 "Registration is disabled" |
| POST | `/api/auth/login` | None | Email/password login → access + refresh tokens |
| GET | `/api/auth/verify` | Token | Validates token, returns user info |
| POST | `/api/auth/refresh` | Refresh | Exchanges refresh token for new access token |

---

## 4. Middleware Stack

### Global Middleware (Applied to All Requests)

| Middleware | File | Purpose |
|-----------|------|---------|
| Express JSON | Built-in | Body parsing (50MB limit) |
| Cookie Parser | `cookie-parser` | Cookie handling |
| CORS | `cors` | Cross-origin (permissive configuration) |
| Rate Limiter | `express-rate-limit` | 1000 requests per 15-minute window |

### Specialized Middleware

#### 4.1 Single-Tenant Guard — `server/middleware/singleTenantGuard.ts`
- **57 lines**, Directive 11.4G
- Scans request body, query params, and route params for `userId`/`user_id` violations
- Case-insensitive regex: `/user[_\-]?id/i`
- Exempts `/api/auth` routes (which legitimately handle user identification)
- Logs violations to `diagnostics/runtime_guard_violations.log`
- Throws error on violation (passed to Express error handler)

#### 4.2 Canonical Validation — `server/middleware/canonical-validation.ts`
- **214 lines**, Directive 11.4F.1
- Validates regime/strategy/signalType against canonical map
- Three violation levels:
  - **WARN**: Ghost regime normalization (e.g., `EXTREME_NOISE` → `CHOPPY`)
  - **ERROR**: signalType mismatch (non-canonical signal type)
  - **CRITICAL**: Non-canonical regime/strategy combination → **request rejected**
- Normalizes ghost regimes and legacy strategy names in-place
- Logs all violations to `audit/logs/canonical_violation.log`
- Exports: `validateAndNormalizeTrade()`, `getViolationStats()`, `clearViolationLog()`

#### 4.3 Bob Routing — `server/middleware/bob-routing.ts`
- **101 lines**, Phase 7.2
- Transparent interception for 2 high-frequency endpoints:
  - `/api/system/health` → MetricsBob cached response
  - `/api/paper-sim/status` → MetricsBob cached response
- Falls back to original handler on Bob failure
- 10% sampling for verbose logs (Phase 4A noise reduction)
- Status: Part of Walter/Bob ecosystem (confirmed dead per Kyle)

#### 4.4 Chat Logging — `server/middleware/chat-logging.ts`
- **317 lines**, Phase 6.3
- Walter conversation persistence layer
- File-based storage: daily JSON logs, summaries, chat index
- Capabilities: log messages, rename chats, save summaries, search, list user chats
- Singleton export: `chatLogging`
- Status: Part of Walter/Bob ecosystem (confirmed dead per Kyle)

---

## 5. The Monolithic Router — routes.ts

### File Statistics

| Metric | Value |
|--------|-------|
| Total lines | 23,349 |
| Inline endpoints | ~635 |
| Service imports | 40+ |
| Contains | Auth middleware, rate limiting, WebSocket server, CSV generation, tax reporting, full route registration for 26 modular files |

### Major Endpoint Groups (Inline in routes.ts)

| Group | Prefix | Auth | Approx. Endpoints | Purpose |
|-------|--------|------|-------------------|---------|
| Auth | `/api/auth/*` | Mixed | 4 | Login, register (disabled), verify, refresh |
| Admin | `/api/admin/*` | Owner-only | ~8 | User CRUD, role management |
| Settings | `/api/settings/*` | Token | ~3 | **DEPRECATED** — returns 410 |
| Trading Engine | `/api/trading/*` | Token+Editor | ~6 | Start/stop engine, preflight checks, status |
| Guardrails V2 | `/api/guardrails-v2/*` | Token | ~12 | CRUD, coherency validation, kill switch, audit |
| Filters V2 | `/api/filters-v2/*` | Token | ~8 | SQE thresholds, filter config, enable/disable |
| Paper Sim | `/api/paper-sim/*` | Token | ~15 | Status, portfolio, trades, positions, RTB |
| Telemetry | `/api/telemetry/*` | Token | ~10 | Strategy performance, VTP, regime distribution |
| Walter Chat | `/api/walter/*` | Token | ~20 | Chat sessions, messages, memory, summaries |
| System | `/api/system/*` | Token | ~8 | Health, config, events, entropy |
| Governance | `/api/governance/*` | Token | ~10 | Regime stats, strategy mapping, drift |
| Diagnostics | `/api/diagnostics/*` | Token | ~15 | REB buffers, signal flow, execution trace |
| Config | `/api/config/*` | Token+Editor | ~6 | Score weights, filter thresholds |
| Market Events | `/api/market-events/*` | Token | ~4 | Event detection, MBIM status |
| Predictive Diagnostics | `/api/predictive/*` | Token | ~5 | Confidence breakdown, DSS audit |
| CSV/Reports | `/api/trades/csv`, `/api/trades/tax-report` | Token | ~4 | Trade history export |
| State Debug | `/api/state/*` | Token | ~3 | System state snapshots |
| Passive Learning | `/api/passive-learning/*` | Token | ~2 | REB 2.10 diagnostic buffers |
| Goals (Legacy) | `/api/goals-learning/*` | Token | ~2 | Goals ML — **Walter-era legacy** |
| Screeners (Deprecated) | `/api/screeners/*` | Token | 1 | Returns 410 → use filters-v2 |

### Trading Engine Start/Stop — Critical Path

**POST `/api/trading/start`** (Phase 27.F.2):

Performs comprehensive preflight checks before engine activation:
1. Validates filter configuration (SQE thresholds populated)
2. Validates guardrail configuration (guardrails_v2 rows exist)
3. Validates portfolio state (paper_portfolio_state exists)
4. Tests Kraken API connectivity
5. Clears kill switch automatically (REB 8.8.3-KS-B)
6. Activates paper execution engine → starts FX5 scanning
7. Mode-level configuration only (Phase 41F-L.E2E-PURGE — no per-pair activation)

**POST `/api/trading/stop`**: Stops paper execution engine, stops FX5 scanning.

### Guardrails V2 — Full CRUD with Coherency

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/guardrails-v2/config` | Token | Read guardrail configuration |
| PUT | `/api/guardrails-v2/config` | Token+Editor | Update guardrails with coherency validation |
| GET | `/api/guardrails-v2/kill-switch/status` | Token | Kill switch state |
| POST | `/api/guardrails-v2/kill-switch/toggle` | Token+Editor | Toggle kill switch |
| POST | `/api/guardrails-v2/kill-switch/reset` | N/A | **DEPRECATED** (410) — auto-cleared on start |
| GET | `/api/guardrails-v2/audit-log` | Token | Phase 28.C audit trail |

Coherency validation: PUT requests pass through `GuardrailPolicy.validateCoherency()` before saving. Violations return 422 with specific rule violation details.

---

## 6. Route File Catalog — 26 Modular Route Files

### Active Diagnostic/Trading Route Files

| # | File | Mount Point | Endpoints | Auth | Lines | Directive | Status |
|---|------|-------------|-----------|------|-------|-----------|--------|
| 1 | `health.ts` | `/api/health` | 9 | **NONE** | ~692 | 41F-D | ⚠️ ACTIVE — No auth on any endpoint |
| 2 | `status.ts` | `/api/status` | 2 | None (intentional) | ~91 | Phase 1 | ACTIVE — health probe endpoints |
| 3 | `vts.ts` | `/api/vts` | 37 | Mixed | ~1,425 | 8.8.4-L8 | ⚠️ ACTIVE — LOCKED, oversized |
| 4 | `market.ts` | `/api/market` | 8 | JWT | ~281 | 8.8.4-L12 | ACTIVE — LOCKED |
| 5 | `vts-audit.ts` | `/api/vts` | 6 | JWT | ~186 | 8.8.4-M3B.2 | ACTIVE — overlaps with vts.ts |
| 6 | `vts-predictive-adjustments.ts` | `/api/vts/predictive-adjustments` | 7 | **NONE** | ~287 | 11.7D.1 | ACTIVE — read-only |
| 7 | `dse.ts` | `/api/diagnostics` | 5 | **NONE** | ~87 | 11.3 | ACTIVE — DSE diagnostics |
| 8 | `calibration.ts` | `/api/calibration` | 8 | JWT (12.1.3) | ~239 | 8.8.4-M5-R1 | ACTIVE — bypass removed |
| 9 | `pricing.ts` | `/api/pricing` | 3 | JWT (12.1.3) | ~110 | 8.8.4-M5 | ACTIVE — bypass removed |
| 10 | `regime-archive.ts` | `/api` (empty prefix) | 9 | JWT (12.1.3) | ~302 | 11.7E | ACTIVE — LOCKED, security fixed |
| 11 | `paper_validation.ts` | `/api/validation` | 6 | JWT (12.1.3) | ~157 | 8.8.4-M5 | ACTIVE — bypass removed |
| 12 | `signal-audit.ts` | `/api/signal-audit` | 3 | **NONE** | ~62 | 8.8.4-M2 | ACTIVE — unauthenticated |
| 13 | `audit.ts` | `/api/audit` | 4 | **NONE** | ~146 | 8.8.4-M1 | ⚠️ ACTIVE — no auth, GET mutates state |
| 14 | `back_audit.ts` | `/api/back-audit` | 5 | **NONE** | ~134 | 8.8.4-M4 | ACTIVE — unauthenticated |
| 15 | `learning.ts` | **UNMOUNTED** | 8 | Centralized | ~180 | Phase 18.0 | ⚠️ NOT MOUNTED — route file exists but not imported |
| 16 | `phase-8.6.5.ts` | `/api/*` (direct on app) | 13 | Upstream | ~277 | Phase 8.6.5 | ACTIVE — Walter/learning routes |
| 17 | `provenance-debug.ts` | `/api/*` (direct on app) | 12 | **NONE** | ~293 | Phase 8.6.5 | ⚠️ ACTIVE — fully unauthenticated debug |

### L-Series Legacy Route Files

| # | File | Mount Point | Endpoints | Auth | Lines | Directive | Status |
|---|------|-------------|-----------|------|-------|-----------|--------|
| 18 | `dce.ts` | `/api/dce` | 5 | **NONE** | ~123 | 8.8.4-L16 | ⚠️ LEGACY — L-Series |
| 19 | `gasp.ts` | `/api/gasp` | 10 | **NONE** | ~183 | 8.8.4-L20 | ⚠️ LEGACY — L-Series, destructive unauth |
| 20 | `mof.ts` | `/api/mof` | 9 | **NONE** | ~163 | 8.8.4-L19 | ⚠️ LEGACY — L-Series |
| 21 | `maco.ts` | `/api/maco` | 4 | JWT | ~203 | 8.8.4-L15 | LEGACY — L-Series, LOCKED |
| 22 | `pdc-ecs.ts` | `/api/pdc-ecs` | 6 | **NONE** | ~162 | 8.8.4-L18 | ⚠️ LEGACY — L-Series |
| 23 | `apr-sle.ts` | `/api/apr-sle` | 5 | **NONE** | ~122 | 8.8.4-L17 | ⚠️ LEGACY — L-Series |
| 24 | `rl.ts` | `/api/rl` | 5 | JWT | ~186 | 8.8.4-L14 | LEGACY — L-Series, LOCKED |
| 25 | `m3b.ts` | `/api/m3b` | 7 | JWT | ~160 | 8.8.4-M3B | ACTIVE — validation audit |
| 26 | `tlva.ts` | `/api/tlva` | 6 | JWT | ~166 | 8.8.4-M3A | ACTIVE — training loop audit |

### Authentication Summary Across Route Files

| Auth Method | Files | Count |
|------------|-------|-------|
| **No authentication** | health, status, dse, signal-audit, audit, back_audit, provenance-debug, vts-predictive-adjustments, dce, gasp, mof, pdc-ecs, apr-sle | 13 |
| **Copy-pasted JWT** (`requireAuth` — ~~hardcoded fallback~~ fail-hard, Directive 12.1.3) | market, vts, vts-audit, maco, rl, m3b, tlva, regime-archive | 8 |
| **~~Audit bypass headers~~** (removed, Directive 12.1.3 — now standard JWT) | pricing, calibration, paper_validation, regime-archive | 4 |
| **Centralized middleware import** | learning (unmounted) | 1 |
| **Upstream auth** (registered on app, not apiRouter) | phase-8.6.5 | 1 |

---

## 7. WebSocket Protocol

### Server-Side WebSocket (Frontend Communication)

**Location**: `routes.ts` — WebSocket server created on the HTTP server at path `/ws`

**Protocol**: Simple JSON message exchange

| Message Type | Direction | Purpose |
|-------------|-----------|---------|
| `subscribe_prices` | Client → Server | Subscribe to price updates |
| `subscribe_trades` | Client → Server | Subscribe to trade updates |
| `ping` | Client → Server | Heartbeat |
| `pong` | Server → Client | Heartbeat response |

**Context Bridge Integration**: The Context Bridge (Walter-era service) registers WebSocket clients for real-time broadcast of system events, trade updates, and price changes. Despite Walter being deprecated, this broadcast mechanism may still serve the frontend dashboard.

**Implementation Note**: The WebSocket handler is minimal — only 15 lines. The actual real-time data delivery relies on Context Bridge broadcasting to registered clients, not on the WebSocket handler processing subscriptions.

---

## 8. Market Data WebSocket — Kraken v2 Adapter

### File: `server/services/market-data-ws.ts`

**Directive**: 8.9.0-B (Secondary WebSocket Adapter — Analytics)
**Lines**: ~410
**Status**: ACTIVE

### Purpose

Secondary outbound WebSocket connection to Kraken's v2 API (`wss://ws.kraken.com/v2`). Used by FeedIntegrityMonitor, MarketDataCoordinator, and SlippageFeeModel for analytics-quality market data.

### Architecture

```
MarketDataWebSocket (singleton)
    │
    ├── Connects to wss://ws.kraken.com/v2
    ├── Subscribes to:
    │   ├── ticker channel (trade-based price updates)
    │   └── book channel (order book, depth=10)
    │
    ├── Processes:
    │   ├── v2 ticker updates → translateV2ToV1() → TickData events
    │   ├── v2 book updates → stateful mini-book → OrderBookSnapshot events
    │   └── v2 heartbeats → staleness tracking
    │
    └── Emits:
        ├── 'tick' (TickData) — bid, ask, last, source, volumes
        ├── 'orderbook' (OrderBookSnapshot) — top 10 bids/asks
        ├── 'stale' (ageMs) — data freshness alert
        ├── 'connected' / 'disconnected'
        └── 'error'
```

### Key Features

1. **v2→v1 Translation**: Uses `kraken-v2-translator.ts` to convert Kraken v2 ticker format to v1 format for backward compatibility with existing consumers.

2. **Stateful Mini-Book** (Directive 8.9.4-Patch): Maintains in-memory order book per symbol. Applies delta updates from Kraken book channel. Computes best bid/ask from sorted book entries. Emits midpoint price as `last` in tick data for stable pricing.

3. **Sequence Validation** (Directive 8.9.4-Patch): Tracks checksum per symbol. Detects out-of-order deltas and triggers book resync (delete + rebuild).

4. **Auto-Reconnect**: Exponential backoff (1s base, 30s max). Automatic resubscription to all pairs on reconnect.

5. **Staleness Detection**: Heartbeat interval (30s) checks time since last tick. Emits 'stale' event when data age exceeds threshold (2s default).

### Data Types

```typescript
interface TickData {
  symbol: string;
  bid: number;
  ask: number;
  last: number;      // Midpoint from book, or last trade from ticker
  timestamp: string;
  source: 'ws' | 'rest_fallback';
  bidVolume?: number;
  askVolume?: number;
}

interface OrderBookSnapshot {
  symbol: string;
  bids: [number, number][];  // [price, volume], sorted descending
  asks: [number, number][];  // [price, volume], sorted ascending
  timestamp: string;
}
```

### Configuration

| Parameter | Default | Purpose |
|-----------|---------|---------|
| `url` | `wss://ws.kraken.com/v2` | Kraken WebSocket v2 endpoint |
| `heartbeatInterval` | 30,000ms | Heartbeat check interval |
| `reconnectDelayBase` | 1,000ms | Base reconnect delay |
| `reconnectDelayMax` | 30,000ms | Maximum reconnect delay |
| `staleThresholdMs` | 2,000ms | Data freshness threshold |

---

## 9. Route Mounting & Registration Patterns

### Three Registration Patterns (Inconsistent)

DawnTrader uses **three different patterns** for registering route files, creating architectural inconsistency:

#### Pattern 1: Dynamic Import to apiRouter (Standard — 22 files)
```typescript
// In routes.ts (bottom of file, ~line 22465+)
const { healthRouter } = await import('./routes/health.js');
apiRouter.use('/health', healthRouter);
```
Routes define paths relative to mount point (e.g., `/status` becomes `/api/health/status`).

#### Pattern 2: Direct Registration on Express App (3 files)
```typescript
// In index.ts (~line 356)
const { registerPhase865Routes } = await import('./routes/phase-8.6.5');
registerPhase865Routes(app);
// phase-8.6.5.ts defines full paths: /api/walter/secure-core/enable, etc.

app.use(provenanceDebugRoutes.default);
// provenance-debug.ts defines full paths: /api/provenance/debug/enable, etc.
```
These bypass the apiRouter entirely and register directly on the Express app.

#### Pattern 3: Eager Import in index.ts (1 file)
```typescript
// In index.ts (top-level import)
import dseRouter from "./routes/dse.js";
// Later:
app.use('/api/diagnostics', dseRouter);
```
DSE is eagerly imported (not dynamic) and mounted at `/api/diagnostics`. The route file defines paths as `/dse/status`, making the full path `/api/diagnostics/dse/status`.

### Mounting Anomaly: regime-archive.ts

```typescript
// In routes.ts (~line 22575)
apiRouter.use('', regimeArchiveRouter.default);
```

The regime-archive router is mounted with an **empty prefix** on apiRouter. However, the route file itself defines full paths like `/api/vts/regime-archive/*`. Since apiRouter is already mounted at `/api`, this creates a potential double-prefix issue where paths could resolve as `/api/api/vts/regime-archive/*` depending on how Express resolves the empty mount.

> **UPDATE (Batch 18C, `c42283f1`)**: The duplicate mount in index.ts (`app.use('', regimeArchiveRouter)`) was removed. Regime-archive routes are now mounted exclusively via routes.ts. The empty-prefix mount in routes.ts remains but functions correctly — Express resolves the empty mount string as a pass-through, so paths resolve as `/api/vts/regime-archive/*` as intended.

### Unmounted Route File: learning.ts

`server/routes/learning.ts` (Phase 18.0, ~180 lines, 8 endpoints) exists in the codebase but **is not imported or mounted anywhere** — not in routes.ts, not in index.ts. This file is dead code. It is notable as the **only route file that correctly imports authentication from centralized middleware** (`../middleware/auth`).

---

## 10. Security Architecture & Findings

### FINDING-1: ~~Hardcoded JWT Fallback Secret~~ **RESOLVED** — Directive 12.1.3

**Status**: **RESOLVED** — Batch 3, commit `0ddc8db1` (2026-02-23)

All JWT fallback secrets removed from 12 route files. Server now throws a fatal error and refuses to start if `JWT_SECRET` or `JWT_REFRESH_SECRET` environment variables are not set. This includes `routes.ts` which had both `JWT_SECRET` and `JWT_REFRESH_SECRET` fallbacks.

**Previous state**: 9 route files + `regime-archive.ts` (different fallback) + `routes.ts` (2 secrets) had hardcoded fallback strings.
**Current state**: All files use `process.env.JWT_SECRET` with no fallback and a fail-hard `throw new Error()` if missing.

### FINDING-2: ~~Inconsistent JWT Secret in regime-archive.ts~~ **RESOLVED** — Directive 12.1.3

**Status**: **RESOLVED** — Batch 3, commit `0ddc8db1` (2026-02-23)

Fallback removed. `regime-archive.ts` now uses the same fail-hard pattern as all other route files.

**Previous state**: Used `'your-secret-key'` fallback (different from all other files).
**Current state**: No fallback — fails hard if env var missing.

### FINDING-3: ~~Auth Bypass via `x-internal-audit` Header~~ **RESOLVED** — Directive 12.1.3

**Status**: **RESOLVED** — Batch 3, commit `0ddc8db1` (2026-02-23)

All `x-internal-audit` and `x-validation-session` bypass header checks removed from all 4 files. Every request now requires valid JWT authentication.

**Previous state**: 4 files allowed unauthenticated access via special headers.
**Current state**: No bypass path — all requests must present a valid JWT token.

### FINDING-4: Unauthenticated Endpoint Groups (MEDIUM-HIGH)

| Route File | Endpoints | Includes Mutating Operations |
|------------|-----------|------------------------------|
| `health.ts` | 9 endpoints | **YES** — POST `/recovery/trigger`, POST `/fault-injection/*` |
| `dse.ts` | 5 endpoints | **YES** — POST `/dse/reset` (clears history + caches) |
| `signal-audit.ts` | 3 endpoints | No (read-only) |
| `audit.ts` | 4 endpoints | **YES** — GET `/trigger` (state-changing GET!) |
| `back_audit.ts` | 5 endpoints | **YES** — POST endpoints |
| `provenance-debug.ts` | 12 endpoints | **YES** — POST `/enable`, POST `/clear`, POST `/trace/new` |
| `vts-predictive-adjustments.ts` | 7 endpoints | No (read-only) |
| `dce.ts` | 5 endpoints | **YES** — POST `/compute`, POST `/recalibrate` |
| `gasp.ts` | 10 endpoints | **YES** — POST `/reset`, `/rollback`, `/recalibrate`, `/adjust` |
| `mof.ts` | 9 endpoints | **YES** — POST `/evolve`, `/reset`, `/weights` |
| `pdc-ecs.ts` | 6 endpoints | **YES** — POST `/reset`, `/recalibrate` |
| `apr-sle.ts` | 5 endpoints | **YES** — POST `/reset`, `/recalibrate` |

**Of particular concern**: `gasp.ts` exposes destructive operations (reset, rollback, recalibrate with unbounded weight inputs) without any authentication. While GASP is L-Series legacy, these endpoints are actively mounted and reachable.

### FINDING-5: Duplicated Auth Middleware (MEDIUM)

The `requireAuth` function is **copy-pasted** identically in 8+ route files instead of being imported from a shared module. Each copy:
- Duplicates JWT verification logic
- Duplicates the hardcoded fallback secret
- Duplicates the `AuthenticatedRequest` interface
- Is NOT equivalent to the routes.ts `authenticateToken` middleware (which fetches user from DB)

Only `learning.ts` (unmounted) correctly imports from `../middleware/auth`.

### FINDING-6: REST Violation — GET Mutates State (LOW)

**File**: `audit.ts`
**Endpoint**: GET `/api/audit/trigger`
**Problem**: Uses GET method for a state-changing operation (triggers audit). GET requests should be idempotent per HTTP specification.

### FINDING-7: Internal Service Key Bypass in rl.ts (MEDIUM)

**File**: `rl.ts`
**Endpoint**: GET `/api/rl/internal/buffer`

```typescript
const expectedKey = process.env.INTERNAL_SERVICE_KEY;
if (expectedKey && internalKey !== expectedKey) { ... }
```

If `INTERNAL_SERVICE_KEY` is empty string or not set, the guard is bypassed entirely (empty string is falsy in JavaScript).

### FINDING-8: Path Traversal Risk in tlva.ts (LOW)

**File**: `tlva.ts`
**Endpoint**: GET `/api/tlva/reports/:filename`

Filename validation only checks prefix (`TLVA_Report_`) and suffix (`.json`). A crafted filename like `TLVA_Report_../../etc/passwd.json` could potentially traverse paths, though the `.json` suffix makes exploitation unlikely on most systems.

### FINDING-9: RBAC Not Enforced in Modular Route Files (HIGH) — Phase 8 Addendum ADD-1

**Affected files**: All 8 route files with copy-pasted `requireAuth` middleware (`market.ts`, `vts.ts`, `vts-audit.ts`, `maco.ts`, `rl.ts`, `m3b.ts`, `tlva.ts`, `regime-archive.ts`)

**Problem**: The copy-pasted `requireAuth` function in modular route files verifies JWT token validity but **never checks the user's role or permissions**. It decodes the token and attaches `req.user = { id, username }` — no role field is extracted or validated. This means any authenticated user (including `viewer` role) can access mutating endpoints.

**Contrast with routes.ts**: The main router's `authenticateToken` middleware fetches the full user record from the database, extracts `userRole` and `userPermissions`, and applies role-specific guards (`requireEditor`, `requireOwner`) on mutating endpoints.

**Impact**: 8 route files with ~90+ authenticated endpoints have JWT verification but zero role enforcement. Any valid JWT (including viewer tokens) grants full access to all endpoints in these files.

**Kyle Directive (ADD-1)**: Standardize permission enforcement across all routes. Consolidate to centralized auth middleware with RBAC.

---

## 11. Deprecated & Legacy Endpoints

### Endpoints Returning HTTP 410 (Gone)

DawnTrader correctly uses HTTP 410 with migration instructions for deprecated endpoints:

| Deprecated Endpoint | Migration Target | Directive |
|---------------------|-----------------|-----------|
| PUT `/api/settings` | Use Guardrails tab (guardrails-v2 API) | Phase 8.8.3 |
| POST `/api/guardrails-v2/kill-switch/reset` | Auto-cleared on engine start | REB 8.8.3-KS-B |
| `*` `/api/screeners/*` | Use `/api/filters-v2` | Phase 11 |
| POST `/api/auth/register` | Registration disabled (single-tenant) | — |

### Walter/Bob Endpoints (Legacy — Dead Per Kyle)

The following endpoint groups in routes.ts serve the Walter/Bob AI system confirmed dead by Kyle:

- `/api/walter/*` (~20 endpoints) — Chat sessions, messages, memory, summaries
- `/api/goals-learning/*` — Goals ML learning triggers
- Bob routing middleware intercepts (`/api/system/health`, `/api/paper-sim/status`)

### Phase 8.6.5 Endpoints (Walter-Adjacent)

- `/api/walter/secure-core/*` — Secure-Core mode toggle
- `/api/walter/corpus-domain/*` — Corpus domain management
- `/api/learning/alignment/*` — Learning alignment weights
- `/api/learning/cross-mode-lessons` — Paper-to-live knowledge transfer
- `/api/learning/promote` — Paper learning promotion

---

## 12. L-Series Route Files — Legacy API Surface

Eight route files expose the L-Series autonomy cluster confirmed legacy in Phase 4:

| File | Mount | Backend Service | Legacy Status |
|------|-------|----------------|---------------|
| `dce.ts` | `/api/dce` | Decision Confidence Engine | Confirmed legacy (Phase 4) |
| `gasp.ts` | `/api/gasp` | GASP Coordinator | Confirmed legacy (Phase 4) |
| `mof.ts` | `/api/mof` | MOF Orchestrator | Confirmed legacy (Phase 4) |
| `maco.ts` | `/api/maco` | MACO Coordinator | Confirmed legacy (Phase 4) |
| `pdc-ecs.ts` | `/api/pdc-ecs` | PDC Engine + ECS | Confirmed legacy (Phase 4) |
| `apr-sle.ts` | `/api/apr-sle` | APR-SLE Engine | Confirmed legacy (Phase 4) |
| `rl.ts` | `/api/rl` | Reinforcement Learning | Confirmed legacy (Phase 4) |
| `m3b.ts` | `/api/m3b` | M3B Validation Service | Active (validates VTS/DCE coupling) |

**Note**: `m3b.ts` and `tlva.ts` are validation/audit tools that monitor L-Series systems. When L-Series is removed, these audit routes lose their purpose and should be removed alongside.

### L-Series Route Endpoints Summary

Combined, the L-Series route files expose **~52 endpoints**:
- 10 endpoints in gasp.ts (reset, rollback, recalibrate — destructive)
- 9 endpoints in mof.ts (evolve, reset, weights — destructive)
- 8 endpoints in market.ts (regime profiling, retrain)
- 7 endpoints in m3b.ts (validation metrics)
- 6 endpoints in pdc-ecs.ts (drawdown containment)
- 6 endpoints in tlva.ts (training loop audit)
- 5 endpoints in dce.ts (decision confidence)
- 5 endpoints in rl.ts (reinforcement learning, ML service calls)
- 5 endpoints in apr-sle.ts (adaptive profit/risk)
- 4 endpoints in maco.ts (multi-agent coordination)

---

## 13. Data Flow: Request Lifecycle

### Authenticated API Request Flow

```
Client HTTP Request
    │
    ├── Express Global Middleware
    │   ├── JSON body parser (50MB limit)
    │   ├── CORS
    │   ├── Rate limiter (1000/15min)
    │   ├── Single-tenant guard (userId violation scan)
    │   └── Canonical validation (regime/strategy normalization)
    │
    ├── Bob Routing Check (transparent interception for health/status)
    │   ├── If Bob enabled → return cached response
    │   └── If Bob disabled or failed → continue to handler
    │
    ├── Route Matching
    │   ├── apiRouter inline endpoints (routes.ts)
    │   │   └── authenticateToken() → DB lookup → req.userId/userRole
    │   │
    │   └── Mounted route files (26 files)
    │       ├── Files with requireAuth → JWT verify only (no DB lookup)
    │       ├── Files with auditOrAuth → x-internal-audit bypass OR JWT
    │       └── Files with no auth → direct handler execution
    │
    ├── Handler Execution
    │   ├── Service calls (import from server/services/*)
    │   ├── Database queries (via storage layer)
    │   └── Response generation (JSON)
    │
    └── Response
        ├── 200 OK (success)
        ├── 401 Unauthorized (auth failure)
        ├── 403 Forbidden (role insufficient)
        ├── 410 Gone (deprecated endpoint)
        ├── 422 Unprocessable (coherency violation)
        └── 404 Not Found (catch-all JSON response)
```

### WebSocket Connection Flow

```
Client WebSocket Connection (/ws)
    │
    ├── WSS upgrade on HTTP server
    ├── Connection registered with Context Bridge
    │
    ├── Client Messages:
    │   ├── subscribe_prices → (handler is empty/stub)
    │   ├── subscribe_trades → (handler is empty/stub)
    │   └── ping → pong response
    │
    └── Server Broadcasts (via Context Bridge):
        ├── Price updates
        ├── Trade updates
        ├── System events
        └── Engine status changes
```

---

## 14. Critical Findings & Kyle Decision Points

### FINDING PRIORITY | Kyle Decision Required

| # | Finding | Severity | Kyle Decision (Phase 8 Addendum) |
|---|---------|----------|----------------------------------|
| F-1 | **Hardcoded JWT fallback secret** in 9 route files | CRITICAL | **ADD-2**: Eliminate fallback values entirely. Fail hard if `JWT_SECRET` is not defined. |
| F-2 | **Inconsistent JWT secret** in regime-archive.ts | HIGH | **ADD-2**: Remove all fallback secrets (superseded by fail-hard directive). |
| F-3 | **`x-internal-audit` header bypass** in 4 files | HIGH | **ADD-3**: Replace with proper internal service key validation, signed internal JWT, or remove entirely. |
| F-4 | **13 route files with no authentication** | MEDIUM-HIGH | **ADD-1**: Standardize permission enforcement across all routes. L-Series files removed with Wave 6. |
| F-5 | **Duplicated auth middleware** in 8+ files | MEDIUM | **ADD-1**: Part of auth consolidation. Centralize RBAC enforcement. |
| F-6 | **routes.ts at 23,349 lines** | INFORMATIONAL | Kyle: "routes.ts is an architectural accumulation risk." Post-audit cleanup. |
| F-7 | **learning.ts is unmounted** | LOW | Dead code — remove with Wave 8. |
| F-8 | **regime-archive.ts empty mount prefix** | LOW | Verify paths resolve correctly or fix mount point. |
| F-9 | **vts.ts at 1,425 lines / 37 endpoints** | LOW | Oversized route file — split candidate during VTS refactor. |
| F-10 | **RBAC not enforced in modular route files** | HIGH | **ADD-1**: JWT-only auth without role checks allows any authenticated user to access mutating endpoints. |

### Forward Audit Notes

- **Phase 9 (Frontend)** will reveal which API endpoints the frontend actually consumes. Many of the 750+ endpoints may be unreferenced.
- **Phase 9: ADD-5 Post-Audit Endpoint Census** — Kyle directive: Cross-reference frontend usage against all endpoints. Mark unused endpoints for removal.
- **ADD-4: API Versioning Plan** — Introduce `/api/v1/` namespace before next major refactor.
- **Walter/Bob endpoint removal** should be bundled with Wave 3 (Walter/Bob ecosystem removal).
- **L-Series route file removal** should be bundled with Wave 6 (L-Series cluster removal).

---

## 15. Phase 8 Addendum — Kyle Directives

> **Kyle's Phase 8 Position**: "Infrastructure is functional. Security hygiene is inconsistent. Legacy L-Series routes remain exposed. Auth layer requires consolidation. routes.ts is an architectural accumulation risk."

### ADD-1: RBAC Enforcement Inconsistency

**Problem**: Many modular route files verify JWT only but do not enforce role-based permission checks. The main routes.ts uses `authenticateToken` (which fetches user from DB including role/permissions), plus role-specific guards (`requireEditor`, `requireOwner`). The 8 route files with copy-pasted `requireAuth` verify the JWT signature but **never check the user's role**. This means any authenticated user — including `viewer` role — can access mutating endpoints like mode changes, recalibration triggers, and configuration updates.

**Examples of RBAC gaps**:
- `vts-audit.ts` — POST `/update-mode` allows any authenticated user to switch system mode (IDLE/PAPER/LIVE)
- `market.ts` — POST `/regime/refresh` allows any authenticated user to force regime recheck
- `calibration.ts` — POST `/ml/trigger` allows any authenticated user (or audit header bypass) to trigger ML calibration

**Kyle Directive**: Standardize permission enforcement across all routes. All mutating endpoints must enforce at minimum `editor` role. All admin/destructive operations must enforce `owner` role.

**Implementation path**:
1. Consolidate all route-file auth to use the centralized middleware (learning.ts is the template)
2. Add `requireEditor` / `requireOwner` guards to mutating endpoints
3. Remove all inline `requireAuth` copies

### ADD-2: Remove JWT Fallback Secrets

**Kyle Directive**: Eliminate fallback values entirely. Fail hard if `JWT_SECRET` is not defined.

**Current state**: 9 route files use `process.env.JWT_SECRET || 'jwt-development-secret-do-not-use-in-production'`. regime-archive.ts uses `|| 'your-secret-key'`. If the environment variable is not set, authentication is trivially bypassable.

**Implementation**:
```typescript
// BEFORE (current — insecure):
const JWT_SECRET = process.env.JWT_SECRET || 'jwt-development-secret-do-not-use-in-production';

// AFTER (Kyle directive — fail-closed):
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is not set. Cannot start server.');
}
```

**Affected files** (10 total): `market.ts`, `vts.ts`, `vts-audit.ts`, `maco.ts`, `rl.ts`, `m3b.ts`, `tlva.ts`, `calibration.ts`, `paper_validation.ts`, `regime-archive.ts`

**Note**: If auth is consolidated per ADD-1, this becomes a single-point fix in the centralized middleware.

### ADD-3: Remove Header-Based Auth Bypass

**Kyle Directive**: Replace `x-internal-audit` with proper internal service key validation, signed internal JWT, or remove entirely.

**Current state**: 4 route files (`pricing.ts`, `calibration.ts`, `regime-archive.ts`, `paper_validation.ts`) accept `x-internal-audit: 'true'` header to bypass JWT auth completely. Additional `x-validation-session` bypass in `calibration.ts` and `regime-archive.ts`. No secret validation — any HTTP client can set these headers.

**Replacement options** (Kyle to decide):
1. **Proper internal service key**: Require `x-internal-key` header validated against `INTERNAL_SERVICE_KEY` env var (fail-closed, not the falsy-bypass pattern in rl.ts)
2. **Signed internal JWT**: Internal services use a dedicated JWT signed with a separate `INTERNAL_JWT_SECRET`
3. **Remove entirely**: If no internal service actually uses these bypasses, remove them

**Implementation**: Replace `auditOrAuth` middleware with either the chosen internal auth mechanism or standard `requireAuth`.

### ADD-4: API Versioning Plan

**Kyle Directive**: Introduce `/api/v1/` namespace before next major refactor.

**Current state**: All endpoints use unversioned `/api/*` paths. Any breaking change to endpoint contracts requires coordinating frontend and backend deployments simultaneously.

**Implementation plan**:
1. **During post-audit cleanup**: Introduce `/api/v1/` as the new canonical prefix
2. Mount existing `apiRouter` at both `/api/v1` and `/api` (backward-compatible phase)
3. Frontend migrates to `/api/v1` paths
4. After migration: deprecate unversioned `/api/*` paths
5. Future breaking changes can introduce `/api/v2/` without disrupting active consumers

**Timing**: Post-audit cleanup phase, bundled with routes.ts refactoring (RISK-048).

### ADD-5: Post-Audit Endpoint Census

**Kyle Directive**: During Phase 9, cross-reference frontend usage against all endpoints. Mark unused endpoints for removal.

**Method**:
1. Phase 9 audits frontend `fetch()` / `axios` / API calls to catalog all consumed endpoints
2. Cross-reference against the ~750 server-side endpoint registrations
3. Any endpoint not consumed by the frontend AND not consumed by internal service-to-service calls is flagged as a removal candidate
4. Walter/Bob and L-Series endpoints are pre-flagged for removal (Waves 3 and 6) regardless of frontend usage

**Expected outcome**: Significant reduction in API surface — many diagnostic, audit, and legacy endpoints likely have zero consumers.

---

## 16. File Catalog

| File | Lines | Status | Purpose |
|------|-------|--------|---------|
| `server/routes.ts` | 23,349 | ACTIVE | Monolithic router — 635 inline endpoints + 26 route file mounts |
| `server/services/auth-service.ts` | 47 | ACTIVE | Password utilities (bcrypt, validation) |
| `server/services/market-data-ws.ts` | 410 | ACTIVE | Kraken WebSocket v2 adapter (analytics) |
| `server/middleware/singleTenantGuard.ts` | 57 | ACTIVE | userId violation detection |
| `server/middleware/canonical-validation.ts` | 214 | ACTIVE | Regime/strategy canonical enforcement |
| `server/middleware/bob-routing.ts` | 101 | LEGACY | Bob Core transparent interception (Walter-era) |
| `server/middleware/chat-logging.ts` | 317 | LEGACY | Walter chat persistence |
| `server/routes/health.ts` | 692 | ACTIVE | Health monitoring endpoints (no auth) |
| `server/routes/status.ts` | 91 | ACTIVE | Health probe endpoints |
| `server/routes/vts.ts` | 1,425 | ACTIVE (LOCKED) | VTS endpoints (oversized) |
| `server/routes/market.ts` | 281 | ACTIVE (LOCKED) | Market regime endpoints |
| `server/routes/vts-audit.ts` | 186 | ACTIVE | VTS passive feed audit |
| `server/routes/vts-predictive-adjustments.ts` | 287 | ACTIVE | Predictive adjustment queries |
| `server/routes/dse.ts` | 87 | ACTIVE | DSE diagnostics |
| `server/routes/calibration.ts` | 239 | ACTIVE | Calibration reports |
| `server/routes/pricing.ts` | 110 | ACTIVE | Feed latency/cache |
| `server/routes/regime-archive.ts` | 302 | ACTIVE (LOCKED) | Regime archive queries |
| `server/routes/paper_validation.ts` | 157 | ACTIVE | Paper mode validation |
| `server/routes/signal-audit.ts` | 62 | ACTIVE | Signal audit (no auth) |
| `server/routes/audit.ts` | 146 | ACTIVE | System audit (no auth) |
| `server/routes/back_audit.ts` | 134 | ACTIVE | Back-audit integrity (no auth) |
| `server/routes/learning.ts` | 180 | DEAD | Unmounted Phase 18.0 learning routes |
| `server/routes/phase-8.6.5.ts` | 277 | ACTIVE | Walter/learning enhancement routes |
| `server/routes/provenance-debug.ts` | 293 | ACTIVE | Provenance debug (no auth) |
| `server/routes/dce.ts` | 123 | LEGACY | DCE routes (L-Series) |
| `server/routes/gasp.ts` | 183 | LEGACY | GASP routes (L-Series) |
| `server/routes/mof.ts` | 163 | LEGACY | MOF routes (L-Series) |
| `server/routes/maco.ts` | 203 | LEGACY (LOCKED) | MACO routes (L-Series) |
| `server/routes/pdc-ecs.ts` | 162 | LEGACY | PDC-ECS routes (L-Series) |
| `server/routes/apr-sle.ts` | 122 | LEGACY | APR-SLE routes (L-Series) |
| `server/routes/rl.ts` | 186 | LEGACY (LOCKED) | RL routes (L-Series) |
| `server/routes/m3b.ts` | 160 | ACTIVE | M3B validation audit |
| `server/routes/tlva.ts` | 166 | ACTIVE | TLVA training audit |

---

## 17. Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-02-17 | Initial Phase 8 audit complete |
| 1.1 | 2026-02-17 | Phase 8 Addendum applied — Kyle directives ADD-1 through ADD-5. RBAC enforcement gap documented (ADD-1). JWT fallback removal mandated (ADD-2). Header bypass removal mandated (ADD-3). API versioning plan added (ADD-4). Post-audit endpoint census directive added (ADD-5). All Finding decisions updated with Kyle directives. New §15 added. ToC renumbered (16→17 sections). |


---

# Chapter 9: Frontend & UI Layer

## Table of Contents

1. [Technology Stack & Build System](#1-technology-stack--build-system)
2. [Application Shell & Routing](#2-application-shell--routing)
3. [Authentication & Token Management](#3-authentication--token-management)
4. [Server State Management (React Query)](#4-server-state-management-react-query)
5. [Real-Time Communication (WebSocket)](#5-real-time-communication-websocket)
6. [Trading Mode Context](#6-trading-mode-context)
7. [Role-Based Access Control (Frontend RBAC)](#7-role-based-access-control-frontend-rbac)
8. [Core Hooks](#8-core-hooks)
9. [Layout Architecture](#9-layout-architecture)
10. [Page Inventory & Routing Map](#10-page-inventory--routing-map)
11. [Component Inventory](#11-component-inventory)
12. [Walter AI Integration Points](#12-walter-ai-integration-points)
13. [Performance Monitoring](#13-performance-monitoring)
14. [Dead Code & Dead Pages](#14-dead-code--dead-pages)
15. [ADD-5 Endpoint Census](#15-add-5-endpoint-census)
16. [Production Readiness Concerns](#16-production-readiness-concerns)
17. [Architectural Patterns & Conventions](#17-architectural-patterns--conventions)

---

## 1. Technology Stack & Build System

| Layer | Technology | Version Source |
|-------|-----------|---------------|
| **Framework** | React 18 | TypeScript, JSX |
| **Build Tool** | Vite | HMR error suppression in `main.tsx` |
| **Routing** | wouter | Lightweight, NOT React Router |
| **Server State** | @tanstack/react-query | v5+ (TanStack Query) |
| **UI Components** | shadcn/ui | 48 primitives under `components/ui/` |
| **Styling** | Tailwind CSS | Via `tailwind-merge` + `clsx` in `cn()` |
| **Charts** | Recharts | Used in portfolio-chart.tsx, analytics |
| **Icons** | lucide-react | Throughout all pages |

**Entry Point**: `client/src/main.tsx` (17 lines)
- Mounts React root to `#root`
- Suppresses Vite HMR overlay errors via `console.error` interception

**Utility Foundation**: `client/src/lib/utils.ts` (21 lines)
- `cn()` — `twMerge(clsx(...inputs))` for conditional class merging
- `formatNumberWithCommas()` / `parseCommaFormattedNumber()` — locale-aware number display

---

## 2. Application Shell & Routing

**File**: `client/src/App.tsx` (270 lines)

### Provider Hierarchy (outermost → innermost)

```
QueryClientProvider
  └─ TradingModeProvider
       └─ RequestTraceProvider
            └─ TooltipProvider
                 └─ Router (wouter)
                      └─ Routes
```

### Route Table

| Path | Component | Auth | Notes |
|------|-----------|------|-------|
| `/login` | `LoginPage` | No | Eager-loaded |
| `/register` | `RegisterPage` | No | Eager-loaded, UI link **commented out** |
| `/` | `Dashboard` | Yes | Eager-loaded, default redirect |
| `/dashboard` | `Dashboard` | Yes | Eager-loaded |
| `/active-trades` | `ActiveTradesPage` | Yes | Lazy |
| `/walter` | `WalterPage` | Yes | Lazy |
| `/watchlist` | `WatchlistPage` | Yes | Lazy |
| `/reports` | `ReportsPage` | Yes | Lazy |
| `/daily-brief` | `DailyBriefPage` | Yes | Lazy |
| `/briefings` | `BriefingsPage` | Yes | Lazy |
| `/goals-engine` | `GoalsEnginePage` | Yes | Lazy |
| `/ai-transparency` | `AITransparencyPage` | Yes | Lazy |
| `/analytics` | `AnalyticsPage` | Yes | Lazy |
| `/machine-learning` | `MachineLearningPage` | Yes | Lazy |
| `/insights` | `FilterInsightsPage` | Yes | Lazy |
| `/settings` | `SettingsPage` | Yes | Lazy |
| `/system/config` | `SystemConfigPage` | Yes | Lazy |
| `/systems` | `SystemsPage` | Yes | Lazy |
| `/:rest*` | `NotFound` | No | Catch-all 404 |

### Global Overlays

1. **KillSwitchBanner** — Fixed red banner when `settings.killSwitchTripped === true`. Polls `/api/settings` every 15 seconds.
2. **WalterFloatingAssistant** — Appears on ALL authenticated pages except `/walter`. Context-aware chat widget.
3. **DatabaseAlert** — Warns when Neon database storage exceeds 50%/70% thresholds. Polls hourly.

### RequireAuth Guard

```typescript
function RequireAuth({ children }) {
  const [isValid, setIsValid] = useState(false);
  useEffect(() => {
    ensureValidToken()
      .then(() => setIsValid(true))
      .catch(() => navigate('/login'));
  }, []);
  return isValid ? children : <Loading />;
}
```

Calls `ensureValidToken()` from `lib/auth.ts` on every route transition. If token refresh fails, redirects to `/login`.

---

## 3. Authentication & Token Management

### Token Flow

**File**: `client/src/lib/auth.ts` (118 lines)

```
Login → POST /api/auth/login → { accessToken, refreshToken }
  ↓
saveTokens() → localStorage: accessToken, refreshToken, token (legacy compat)
  ↓
Every API call → ensureValidToken() → check expiry with 5-min buffer
  ↓
If near-expiry → refreshAccessToken() → POST /api/auth/refresh
  ↓
Singleton lock: only ONE refresh request at a time across all tabs/hooks
```

**Key Design**:
- **12-hour access tokens**, 7-day refresh tokens
- **5-minute expiry buffer**: proactive refresh before expiration
- **Singleton refresh lock**: `let refreshPromise: Promise<string | null> | null = null` prevents concurrent refresh requests
- **Backward compatibility**: Stores token as both `accessToken` (new) and `token` (legacy) in localStorage
- On refresh failure: clears all tokens and returns null (caller redirects to login)

### Token Storage Security Concern (Phase 9 Addendum ADD-1)

> **Kyle Directive (Phase 9 Addendum ADD-1)**: Document XSS exposure risk. Recommend future migration to secure cookie or hybrid approach.

**Current state**: JWT tokens are stored in `localStorage`. This is the simplest storage mechanism but has a known security trade-off:

| Storage Method | XSS Risk | CSRF Risk | Current |
|---|---|---|---|
| `localStorage` | **Exposed** — any XSS vector can read tokens | Safe — not auto-sent with requests | **Yes** |
| `httpOnly` cookie | Safe — JavaScript cannot access | Exposed — auto-sent with requests | No |
| Hybrid (short-lived memory + httpOnly refresh) | Minimal | Minimal | No |

**Exposure**: If an XSS vulnerability exists anywhere in the application (including in third-party dependencies), an attacker could read the JWT from `localStorage` and exfiltrate it. The 12-hour access token lifetime gives a large window for exploitation.

**Recommended migration path** (future, not urgent):
1. Move `refreshToken` to an `httpOnly`, `Secure`, `SameSite=Strict` cookie
2. Keep `accessToken` in memory only (not localStorage) — short-lived, re-obtained via refresh cookie
3. Add CSRF protection if cookie-based auth is adopted
4. Reduce access token lifetime from 12 hours to 15–30 minutes when refresh cookie is available

### Biometric Authentication (WebAuthn)

**Files**: `client/src/hooks/useBiometricAuth.ts` (107 lines) — used by login.tsx

- Uses WebAuthn API (`PublicKeyCredential`) for Face ID / Touch ID
- Platform authenticator only (`authenticatorAttachment: "platform"`)
- Stores `biometricUser` and `biometricEnabled` flags in localStorage
- Login flow: `tryBiometricLogin()` → credential verification → returns username
- **Security fix applied**: `disableBiometricLogin()` clears legacy password storage (`biometric_${username}_password`)

**Dead file**: `client/src/hooks/use-biometric-auth.ts` (82 lines) — placeholder, never imported. See [Dead Code](#14-dead-code--dead-pages).

---

## 4. Server State Management (React Query)

**File**: `client/src/lib/queryClient.ts` (144 lines)

### Configuration

| Setting | Value | Purpose |
|---------|-------|---------|
| `staleTime` | 15,000ms | Data considered fresh for 15 seconds |
| `retry` | 1 | Single retry on failure |
| `gcTime` | Infinity | Never garbage-collect cached data |
| `refetchOnWindowFocus` | false | No refetch on tab switch |

### Default Query Function: `apiFetch`

**File**: `client/src/lib/api.ts` (118 lines) — Phase 33.C

Every React Query `useQuery` call automatically uses `apiFetch` as the default fetcher. The query key's first element is used as the API URL.

**apiFetch Flow**:
1. `ensureValidToken()` — proactive refresh if near expiry
2. Build request with JWT `Authorization: Bearer ${token}` header
3. Add `x-app-mode: live|paper` header from `getGlobalTradingMode()`
4. Add `Cache-Control: no-store` for mutations
5. 30-second timeout via `AbortController`
6. On 401: attempt token refresh → retry once
7. Parse JSON response

### Mutation Helper: `apiRequest`

```typescript
export async function apiRequest(method: string, url: string, data?: unknown) {
  // Uses apiFetch for the request
  // Records request trace in dev mode (via import.meta.env.DEV)
}
```

### Query Function Factory: `getQueryFn`

Provides configurable 401 behavior:
- `on401: "returnNull"` — returns `null` instead of throwing (used for optional data)
- `on401: "throw"` — throws error (default, used for required data)

---

## 5. Real-Time Communication (WebSocket)

**File**: `client/src/hooks/use-websocket.tsx` (192 lines) — Phase 34.A

### Singleton Pattern

```
Global variables (module scope):
  - globalWs: WebSocket | null
  - globalIsConnected: boolean
  - globalMessages: any[] (last 50, FIFO)
  - globalListeners: Set<(msg) => void>
  - subscriberCount: number
```

The WebSocket is a **true singleton** — shared across all components that call `useWebSocket()`. Connection lifecycle is managed by subscriber counting:

- **First subscriber** (`subscriberCount: 0 → 1`): Opens connection to `ws://host/ws?userId=${userId}`
- **Last unsubscribe** (`subscriberCount: 1 → 0`): Closes connection
- **Multiple subscribers**: All share the same `globalWs` instance

### Heartbeat & Reconnect

| Feature | Value |
|---------|-------|
| Ping interval | 25 seconds |
| Pong timeout | 3 missed pongs → close |
| Reconnect strategy | Exponential backoff |
| Min delay | 1 second |
| Max delay | 30 seconds |

### Message Types Consumed by Frontend

| Message Type | Consumer Components |
|---|---|
| `trading_state_changed` | TradingModeContext, TopBar |
| `trade_update` | FilterHealthWidget, AlertBanner |
| `alerts_updated` | AlertBanner |
| `aj17_report_ready` | AJ17DiagnosticCard |
| `override_state_changed` | useOverrideState hook |
| Context Bridge updates | WalterPage, WalterFloatingAssistant |

---

## 6. Trading Mode Context

**File**: `client/src/contexts/trading-mode-context.tsx` (107 lines) — Phase 27.F.24

### Mode: `'live'` | `'paper'`

**Persistence stack** (multi-layer):
1. **localStorage**: `trading_mode_preference` key
2. **Cross-tab sync**: `StorageEvent` listener detects mode changes in other tabs
3. **WebSocket sync**: `trading_state_changed` event from server overrides local state
4. **Cache invalidation**: Full `queryClient.invalidateQueries()` on every mode change

**Memoized context value** prevents unnecessary re-renders:
```typescript
const value = useMemo(() => ({
  mode, setMode, isLive: mode === 'live', isPaper: mode === 'paper'
}), [mode]);
```

### Trading Mode Singleton

**File**: `client/src/lib/tradingMode.ts` (14 lines)

Global getter/setter (`getGlobalTradingMode()` / `setGlobalTradingMode()`) to avoid circular dependency between `api.ts` and TradingModeContext. Used by `apiFetch` to set `x-app-mode` header.

---

## 7. Role-Based Access Control (Frontend RBAC)

**File**: `client/src/hooks/useUserRole.ts` (109 lines)

### Roles (5 levels)

| Role | Level | Special |
|------|-------|---------|
| `owner` | Highest | Bypasses all permission checks |
| `admin` | High | Bypasses all permission checks |
| `editor` | Medium | Standard permissions |
| `trader` | Low | Trading-specific permissions |
| `viewer` | Lowest | Read-only |

### Permissions (28 types)

Organized into 5 categories:
- **Trading** (6): `start_trading`, `stop_trading`, `close_trade`, `modify_trade`, `approve_trade`, `reject_trade`
- **Settings** (6): `view_settings`, `edit_settings`, `manage_users`, `reset_settings`, `edit_config`, `manage_api_keys`
- **Approval** (4): `approve_actions`, `reject_actions`, `manage_approvals`, `override_approvals`
- **System** (6): `view_system`, `manage_system`, `view_logs`, `export_data`, `run_diagnostics`, `manage_alerts`
- **Data** (6): `view_trades`, `view_portfolio`, `view_analytics`, `view_reports`, `view_ai`, `manage_watchlist`

### Usage Pattern

```typescript
const { can, canAny, canAll, role, isOwner, isAdmin } = useUserRole();

// Permission check
if (can('start_trading')) { /* show button */ }
if (canAny('edit_settings', 'manage_system')) { /* show section */ }
```

**Storage**: Role loaded from `localStorage.getItem('user')` parsed JSON. Synced across tabs via `StorageEvent` listener.

---

## 8. Core Hooks

### use-trading.tsx (461 lines) — Central Trading Hook

The most important hook in the application. Provides all trading-related data and mutations.

**Queries** (all use React Query with auto-refresh):

| Hook | Endpoint | Refresh |
|------|----------|---------|
| `useTradingStatus()` | `/api/trading/status` | 5s polling + WebSocket |
| `useTrading().portfolio` | `/api/portfolio/overview` | 60s |
| `useTrading().activeTrades` | `/api/trades/active` or `/api/paper/trades/active` | 30s |
| `useTrading().recentTrades` | `/api/trades?limit=10` | 60s |
| `useTrading().settings` | `/api/settings` | 300s |
| `useTrading().watchlist` | `/api/watchlist` | 60s |

**Mutations**:
- `startTrading(mode)` — `POST /api/trading/start` (paper-new, paper-continue, live)
- `stopTrading()` — `POST /api/trading/stop`
- `resetPaperSim()` — `POST /api/paper-sim/reset`
- `closeTrade(id)` — `POST /api/trades/${id}/close`
- `updateSettings(data)` — `PUT /api/settings`
- `addToWatchlist(pair)` / `removeFromWatchlist(pair)` — POST/DELETE `/api/watchlist`

**Debounced Invalidation** (Phase 35.3.A): 500ms debounce on `queryClient.invalidateQueries()` to reduce render bursts after WebSocket updates.

**deriveIsActive()** (Phase 32.D-Fix.Final): The authoritative method for determining if trading is active. Uses the `active` boolean from status response.

### use-system-health.tsx (69 lines)

- Polls `/api/system/health` every 15 seconds
- Auto-resync: triggers re-fetch when paper trading status or goals count changes

### use-portfolio-balance.tsx (61 lines)

- Dedicated hook optimized to prevent unnecessary re-renders
- Uses React Query's `select` and `notifyOnChangeProps` for surgical updates

### use-override-state.tsx (89 lines)

- WebSocket listener for `override_state_changed` messages
- Tracks guardrail/filter override state changes from server

### use-throttle-data.ts (45 lines)

- Generic data throttling for chart components
- Prevents high-frequency chart redraws from overwhelming the renderer

### useAudioRecorder.ts (101 lines)

- WebM audio recording for Walter voice input
- Uses `MediaRecorder` API with `audio/webm;codecs=opus`

### useWalterPreferences.tsx (38 lines)

- Manages Walter chat preferences: `viewMode`, `theme`, `tone`, `sendKeyPreference`, `sidebarCollapsed`
- Queries `GET /api/walter/preferences`, mutates via `PUT /api/walter/preferences`

### use-request-trace.tsx (65 lines)

- Dev-mode only (`import.meta.env.DEV`)
- Records API call traces for observability overlay

### use-mobile.tsx (19 lines)

- Simple 768px breakpoint detection via `matchMedia`

### use-toast.ts (191 lines)

- Reducer-pattern toast notification system
- Supports add/update/dismiss/remove operations with auto-dismiss timers

---

## 9. Layout Architecture

### Sidebar (152 lines)

**File**: `client/src/components/layout/sidebar.tsx`

11 navigation items, permission-gated:

| Item | Path | Permission |
|------|------|-----------|
| Dashboard | `/dashboard` | — |
| Active Trades | `/active-trades` | — |
| Walter AI | `/walter` | — |
| Watchlist | `/watchlist` | — |
| Reports | `/reports` | — |
| Daily Brief | `/daily-brief` | — |
| Briefings | `/briefings` | — |
| Goals Engine | `/goals-engine` | — |
| AI Transparency | `/ai-transparency` | `view_ai` |
| Analytics | `/analytics` | `view_analytics` |
| Machine Learning | `/machine-learning` | `view_ai` |

Active trade count badge displayed on "Active Trades" item.

### TopBar (1,042 lines)

**File**: `client/src/components/layout/top-bar.tsx`

The largest layout component. Contains:

1. **Trading Toggle** — Start/Stop trading with confirmation modals
2. **Mode Switch** — Live/Paper toggle with confirmation for live mode
3. **Dual Time Display** — UTC + local time (configurable timezone)
4. **Walter Approvals Bell** — Badge count of pending approvals from `/api/walter/pending-approvals`
5. **Paper Portfolio Metrics Row** — Balance, P/L, active trade count (paper mode only)
6. **Confirmation Modals** — Live trading start confirmation, stop confirmation

**Notable**: 30 `console.log` statements — highest of any component. Production logging concern.

---

## 10. Page Inventory & Routing Map

### Actively Routed Pages (18 pages)

| Page | Lines | Primary API Endpoints | Key Features |
|------|-------|----------------------|-------------|
| `dashboard.tsx` | 146 | Delegates to child components | Portfolio charts, active trades, strategy performance, filter health, alerts, daily brief card |
| `active-trades.tsx` | 141 | Delegates to tabs | 4-tab funnel: Filter Insights → Ready to Buy → Open Trades → Trade History |
| `walter.tsx` | 1,386 | `/api/walter/chats/*`, `/api/transcribe`, `/api/walter/analyze-file` | Full AI chat interface with voice, file upload, approval workflow, conversation management |
| `watchlist.tsx` | 519 | `/api/symbols/search`, `/api/symbols/details` | 3 tabs: AI Opportunities, User Watchlists, Search & Analysis |
| `goals-engine.tsx` | 97 | Delegates to tabs | 5 tabs: Guardrails, Screeners/Filters, Strategies, Diagnostics, Coherency Rules |
| `analytics.tsx` | 1,939 | 8+ endpoints | Market indicators, narrative feed, batch analysis, benchmarks, governance, predictive diagnostics |
| `machine-learning.tsx` | 1,985 | 15+ endpoints | ML scores, predictive adjustments, stability analysis, safety signals, regime archive |
| `ai-transparency.tsx` | 2,074 | 20+ endpoints | Transparency logs, screener calibration, error logs, autonomy confidence, semantic memories, orchestrator |
| `settings.tsx` | 1,122 | `/api/user/profile`, `/api/admin/users/*` | 6 tabs: General, Walter Approvals, Users, API Keys, Audit Log, Config Snapshots |
| `reports.tsx` | 570 | `/api/trades`, `/api/ai/reports`, `/api/reports/export` | Canned reports (tax, performance), custom reports, CSV/PDF export |
| `briefings.tsx` | 527 | `/api/daily-briefs`, `/api/daily-briefs/today` | Current brief + historical briefs with date range navigation |
| `daily-brief.tsx` | 419 | `/api/daily-briefs/today`, `/api/daily-briefs/:date` | Individual brief detail with metrics grid, narrative, trade highlights |
| `systems.tsx` | 29 | Delegates to EnhancedSystemMonitoring | Thin wrapper for system monitoring dashboard |
| `system-config.tsx` | 312 | `/api/config` | Runtime config editor (booleans, numbers, strings) |
| `filter-insights.tsx` | 17 | Delegates to FilterInsights | Minimal wrapper — same component also rendered as tab in active-trades |
| `login.tsx` | 292 | `POST /api/auth/login` | Username/password + optional biometric |
| `register.tsx` | 191 | `POST /api/auth/register` | Account creation — **orphaned** (UI link commented out) |
| `not-found.tsx` | 22 | None | 404 catch-all |

### Dead/Unrouted Pages (7 pages)

See [Dead Code & Dead Pages](#14-dead-code--dead-pages) for full details.

---

## 11. Component Inventory

### Goal Widgets (`components/goals/`)

| Component | Lines | API Endpoints | Notes |
|-----------|-------|--------------|-------|
| `portfolio-value-widget.tsx` | 137 | None (context) | Memoized (35.2A). Dead vars: `availableForTrading`, `inOpenTrades` |
| `earnings-widget.tsx` | 265 | `/api/earnings/summary`, earnings-chart | Hand-rolled SVG sparkline |
| `trading-activity-widget.tsx` | 170 | `/api/trading/activity`, trades/active | 6-option period selector |
| `averages-widget.tsx` | 183 | `/api/trading/averages` | Period options differ from trading-activity |
| `aj17-diagnostic-card.tsx` | 194 | `/api/diagnostics/aj17/*` | Paper-only. AJ16/AJ17 naming inconsistency |

### Trading Components (`components/trading/`)

| Component | Lines | API Endpoints | Notes |
|-----------|-------|--------------|-------|
| `active-trades.tsx` | 254 | `/api/paper/trades/active`, `/api/settings` | Current price simulated as `entryPrice * 1.02` |
| `portfolio-chart.tsx` | 146 | `/api/portfolio/history`, `/api/paper/metrics/history` | Recharts line chart. Dead conditional in `formatDate` |
| `watchlist.tsx` | 219 | `/api/paper-sim/diagnostics/scan` | 4-pair grid with countdown timer |
| `confirm-live-trading-modal.tsx` | 69 | None | Pure presentational confirmation dialog |

### Dashboard Components (`components/dashboard/`)

| Component | Lines | API Endpoints | Notes |
|-----------|-------|--------------|-------|
| `filter-health-widget.tsx` | 143 | `/api/filters/diagnostics`, `/api/trading/status` | WebSocket-synced, adaptive refresh rate |

### Strategy Components (`components/strategy/`)

| Component | Lines | API Endpoints | Notes |
|-----------|-------|--------------|-------|
| `strategy-performance-widget.tsx` | 321 | `/api/metrics/strategies`, `/api/strategy/parameters` | SVG mini bar charts, DHMA params subsection |

### AI Components (`components/ai/`)

| Component | Lines | API Endpoints | Notes |
|-----------|-------|--------------|-------|
| `InteractiveNotification.tsx` | 315 | `/api/intent/approve|reject|dismiss|clear` | Core Walter approval workflow. Legacy/new field fallbacks |

### System Components

| Component | Lines | API Endpoints | Notes |
|-----------|-------|--------------|-------|
| `DailyBriefCard.tsx` | 332 | `/api/daily-briefs/today`, `/api/market-context/latest`, `/api/walter/auto-resolved-today` | 7 market regime configs. Walter auto-maintenance stats |
| `alert-banner.tsx` | 288 | `/api/alerts`, `/api/alerts/*/acknowledge` | Full alert management with WebSocket sync. Dead `user` variable |
| `database-alert.tsx` | 69 | `/api/database/status` | Storage threshold warnings (50%/70%) |
| `maintenance-banner.tsx` | 32 | `/api/maintenance/status` | Conditional maintenance mode banner |
| `mode-banner.tsx` | 71 | None (hooks) | Phase 41.2 trading mode/status display |

### Walter Components

| Component | Lines | Notes |
|-----------|-------|-------|
| `walter-floating-assistant.tsx` | 501 | Floating chat on all pages except /walter. Context-aware, voice input, file upload, Bob Core prefetch, data provenance footer |

---

## 12. Walter AI Integration Points

Despite Walter being deprecated on the backend, the frontend has extensive Walter integration that remains active:

### Pages with Walter Dependencies

| Page/Component | Walter Integration |
|---|---|
| `walter.tsx` | **Entire page** — Full Walter chat interface (1,386 lines) |
| `settings.tsx` | Walter memory config (depth/limit/auto-summarize), Walter Approvals tab |
| `top-bar.tsx` | Walter pending approvals notification bell |
| `walter-floating-assistant.tsx` | Floating Walter chat widget on all authenticated pages |
| `DailyBriefCard.tsx` | Fetches `/api/walter/auto-resolved-today` |
| `InteractiveNotification.tsx` | Walter approval workflow (approve/reject/dismiss/clear) |
| `ai-transparency.tsx` | "Walter Command" and "Walter Action" log categories |

### Walter API Endpoints Referenced by Frontend

- `/api/walter/chats` (GET, POST)
- `/api/walter/chats/:id` (GET, PATCH, DELETE)
- `/api/walter/chats/:id/messages` (POST)
- `/api/walter/chats/:id/pin` / `/unpin` (POST)
- `/api/walter/chats/:id/export` (GET)
- `/api/walter/pending-approvals` (GET)
- `/api/walter/approvals/:id/approve` (POST)
- `/api/walter/approvals/:id/reject` (POST)
- `/api/walter/analyze-file` (POST)
- `/api/walter/preferences` (GET, PUT)
- `/api/walter/auto-resolved-today` (GET)

**Implication**: When the Walter backend is removed (Wave 3), the entire `/walter` page, the floating assistant, the notification bell in TopBar, the Walter Approvals tab in settings, and the auto-maintenance section in DailyBriefCard will all break or become non-functional. A coordinated frontend cleanup wave is required.

---

## 13. Performance Monitoring

### React Profiler Integration

**File**: `client/src/utils/performance-profiler.ts` (262 lines)
**File**: `client/src/components/profiled-route.tsx` (27 lines)

Every authenticated route is wrapped in a `<Profiler>` component via `ProfiledRoute`. The profiler captures:

| Metric | Threshold | Behavior |
|--------|-----------|----------|
| First-paint latency | 800ms | Warning logged if exceeded |
| Per-update duration | 60ms | Warning logged if exceeded |
| Cumulative update time | 120ms | Warning logged if exceeded |

**Console access** (production-exposed via `window.__PERFORMANCE_PROFILER__`):
- `exportPerformanceReport()` — Full metrics report
- `checkPerformanceThresholds()` — Validate against targets

---

## 14. Dead Code & Dead Pages

### Dead/Unrouted Pages (1 remaining, was 7 files)

| File | Lines | Superseded By | Status |
|------|-------|---------------|--------|
| `walter-approvals.tsx` | 366 | Walter Approvals tab in `settings.tsx` | Dead — not in router. ~~Deleted in Batch 6 (Directive 12.2.3)~~ |
| ~~`history.tsx`~~ | ~~253~~ | ~~Trade History tab in `active-trades.tsx`~~ | **DELETED** — Batch 9 (Directive 12.2.9) |
| ~~`admin.tsx`~~ | ~~303~~ | ~~Users tab in `settings.tsx`~~ | **DELETED** — Batch 9 (Directive 12.2.9) |
| ~~`search.tsx`~~ | ~~187~~ | ~~Search & Analysis tab in `watchlist.tsx`~~ | **DELETED** — Batch 9 (Directive 12.2.9) |
| ~~`command-center.tsx`~~ | ~~901~~ | ~~Absorbed into `ai-transparency.tsx`~~ | **DELETED** — Batch 9 (Directive 12.2.9) |
| ~~`analysis.tsx`~~ | ~~512~~ | ~~Never wired into router~~ | **DELETED** — Batch 9 (Directive 12.2.9) |
| ~~`settings-old-backup.tsx`~~ | ~~249~~ | ~~Current `settings.tsx`~~ | **DELETED** — Batch 9 (Directive 12.2.9) |

### Orphaned Route

- `register.tsx` (191 lines) — Route exists (`/register`) but UI link to it is commented out. Only reachable via direct URL. Admin-only user creation now.

### Dead Imports

| File | Dead Import | Notes |
|------|-------------|-------|
| ~~`App.tsx` line 7~~ | ~~`History` from `@/pages/history`~~ | **REMOVED** — Batch 9 (Directive 12.2.9) |
| `active-trades.tsx` line 4 | `Watchlist` from `@/components/trading/watchlist` | Imported but never rendered in JSX |
| `active-trades.tsx` | `useQuery` from `@tanstack/react-query` | Imported but never called |

### Dead Hook File

| File | Lines | Superseded By |
|------|-------|---------------|
| `use-biometric-auth.ts` | 82 | `useBiometricAuth.ts` (used by login.tsx) |

### Dead Variables in Active Components

| File | Variable(s) | Notes |
|------|-------------|-------|
| `portfolio-value-widget.tsx` lines 67-68 | `availableForTrading`, `inOpenTrades` | Computed but never used in JSX |
| `alert-banner.tsx` line 32 | `user` from `localStorage.getItem('user')` | Defined but never referenced |
| `portfolio-chart.tsx` lines 33-38 | `formatDate` branches | Identical branches for 7D and non-7D (dead conditional) |

### Simulated Data in Active Components

| File | Line | Issue |
|------|------|-------|
| `active-trades.tsx` (component) line 30 | `currentPrice = entryPrice * 1.02` | Hardcoded 2% gain simulation instead of real-time price |

---

## 15. ADD-5 Endpoint Census

> **Directive**: Phase 8 Addendum ADD-5 — Cross-reference frontend API usage against all ~750 server endpoints. Mark unused for removal.

### Census Summary

| Metric | Count |
|--------|-------|
| **Unique API endpoints referenced by frontend** | **~291** |
| **Server endpoints (estimated from Phase 8)** | **~750** |
| **Server endpoints with NO frontend consumer** | **~460** |
| **Frontend coverage of server API** | **~39%** |

### Frontend API Usage by Category

| Category | Count | Key Endpoints |
|----------|-------|--------------|
| Trading | 44 | `/api/trading/*`, `/api/trades/*`, `/api/paper-sim/*`, `/api/paper/*`, `/api/pairs/*`, `/api/trading-signals` |
| System | 21 | `/api/system/*`, `/api/health/*`, `/api/maintenance/*`, `/api/database/*`, `/api/config` |
| AI / Orchestrator | 21 | `/api/orchestrator/*`, `/api/ai/*`, `/api/semantic/*`, `/api/actuation/*` |
| Filter / Diagnostics | 20 | `/api/filters/*`, `/api/diagnostics/*`, `/api/screeners/*`, `/api/schedulers/*` |
| Walter / Bob / Chats | 18 | `/api/walter/*`, `/api/transcribe`, `/api/intent/*` |
| VTS / ML | 16 | `/api/vts/*`, `/api/metrics/*` |
| Learning | 9 | `/api/learning/*`, `/api/historic-signals/*` |
| Auth | 3 | `/api/auth/login`, `/api/auth/register`, `/api/auth/refresh` |
| Portfolio | 4 | `/api/portfolio/*`, `/api/earnings/*` |
| Goals | 5 | `/api/goals/*` |
| Settings | 2 | `/api/settings`, `/api/user/profile` |
| Export / Reports | 2 | `/api/reports/export`, `/api/system/mapping-drift/export` |
| Market | 5 | `/api/market-events`, `/api/market-context/*`, `/api/market-indicators` |
| Admin | 3 | `/api/admin/users`, `/api/admin/users/:id`, `/api/admin/users/:id/reset-password` |
| Other / Misc | 118 | Various endpoints across pages |

### Top Files by API Density

| File | Unique Endpoints | Notes |
|------|-----------------|-------|
| `enhanced-system-monitoring.tsx` | ~60 | **Massive consumer** — includes speculative/aspirational API namespaces |
| `ai-transparency.tsx` | ~27 | Central observability hub |
| `use-trading.tsx` | ~24 | Core trading hook |
| `top-bar.tsx` | ~22 | Layout header with trading controls |
| `machine-learning.tsx` | ~15 | ML dashboard |
| `walter.tsx` | ~14 | Walter chat interface |

### Speculative/Aspirational Endpoints (enhanced-system-monitoring.tsx)

The `enhanced-system-monitoring.tsx` component references ~60 endpoints, many of which appear to be aspirational — API namespaces that likely do NOT exist on the server:

- `/api/ethics/*` — AI ethics endpoints
- `/api/collaboration/*` — Multi-agent collaboration
- `/api/federation/*` — Federated learning
- `/api/knowledge/*` — Knowledge management
- `/api/oversight/*` — System oversight
- `/api/alignment/*` — AI alignment
- `/api/introspection/*` — Self-analysis
- `/api/reasoning/*` — Reasoning chain endpoints

These endpoints were likely added as UI scaffolding for features that were never implemented on the backend. They will return 404s. The component handles this gracefully (React Query error states), but the dead API references should be cleaned up.

### Direct Window/Location API Calls

Two pages bypass React Query and use direct browser navigation for API calls:

| File | Endpoint | Method |
|------|----------|--------|
| `analytics.tsx` | `/api/system/mapping-drift/export` | `window.open()` |
| `reports.tsx` | `/api/reports/export` | `window.open()` |

### system-config.tsx Bypasses apiFetch

`system-config.tsx` uses raw `fetch()` with `localStorage.getItem('token')` instead of the `apiRequest` utility. This bypasses the centralized auth flow, token refresh, timeout handling, and request tracing.

---

## 16. Production Readiness Concerns

### Excessive Console Logging

**Total**: 123 `console.log` statements across the frontend codebase.

| File | Count | Debug Tags |
|------|-------|-----------|
| `top-bar.tsx` | 30 | Various |
| `api.ts` | 16 | `[11.7E]` |
| `performance-profiler.ts` | 12 | `[35.1]` |
| `use-websocket.tsx` | 11 | Various |
| `active-trades-v2.tsx` | 11 | Various |
| Goal widgets (4 files) | ~8 | `[35.2A]` — log on every render |

**Impact**: Performance degradation on high-frequency components (goal widgets re-render every data refresh). Information leakage in production (API tokens, trading states, internal metrics visible in browser console).

**Recommendation**: Replace all `console.log` debug statements with either:
- Conditional dev-mode logging (`import.meta.env.DEV && console.log(...)`)
- Remove entirely for production builds

### Window-Exposed Debug Objects

| Global | Purpose | Risk |
|--------|---------|------|
| `window.__PERFORMANCE_PROFILER__` | Profiler metrics | Low — performance data only |
| `window.exportPerformanceReport` | Full profiler report | Low |
| `window.checkPerformanceThresholds` | Threshold validation | Low |

---

## 17. Architectural Patterns & Conventions

### Patterns Observed

1. **Paper/Live Mode Branching**: Nearly all data hooks use separate API paths for paper (`/api/paper/*`) vs live (`/api/*`) mode. The `useTradingMode()` context drives this branching.

2. **Lazy Loading**: All authenticated pages except Dashboard and LoginPage use `React.lazy()` for code splitting.

3. **Tab Consolidation Pattern**: The codebase shows an evolution from standalone pages to tabbed consolidation:
   - Search → watchlist tab
   - History → active-trades tab
   - Admin → settings tab
   - Walter Approvals → settings tab
   - Command Center → ai-transparency (absorbed)

4. **Widget Memoization**: Phase 35.2A widgets use `React.memo()` to prevent unnecessary re-renders, with debug logging on each render.

5. **WebSocket + Polling Hybrid**: Critical data (trading status) uses both 5s polling AND WebSocket for real-time updates. Non-critical data uses polling only.

6. **Debounced Invalidation**: Phase 35.3.A pattern — 500ms debounce on query invalidation after WebSocket updates to batch re-renders.

7. **Error Boundaries**: Class-based `ErrorBoundary` components wrap critical pages (active-trades.tsx).

### Technology Decisions

| Decision | Rationale |
|----------|-----------|
| wouter over React Router | Lightweight, minimal bundle size |
| React Query over Redux/Zustand | Server state management fits query/mutation model |
| shadcn/ui over Material/Ant | Copy-paste component ownership, full customization control |
| Recharts over D3 | React-native chart library, simpler API |
| localStorage for auth/preferences | Simple persistence, no external dependency |

### File Size Distribution

| Category | Largest Files | Concern |
|----------|--------------|---------|
| Pages | ai-transparency (2,074), machine-learning (1,985), analytics (1,939) | These are borderline monolithic — should consider component extraction |
| Components | top-bar (1,042), walter-floating-assistant (501) | TopBar is the largest single component |
| Hooks | use-trading (461) | Acceptable for a central data hook |

---

## Phase 9 Registry Summary

| Finding Type | Count |
|---|---|
| Dead/unrouted pages | 7 |
| Orphaned route | 1 (register.tsx) |
| Dead imports in active files | 3 |
| Dead hook file | 1 |
| Dead variables in active components | 3 locations |
| Simulated data in active components | 1 (active-trades currentPrice) |
| Console.log statements (production) | 123 |
| Frontend API endpoints referenced | ~291 |
| Server endpoints with NO frontend consumer | ~460 |
| Speculative/aspirational endpoints (never implemented) | ~60 (enhanced-system-monitoring.tsx) |
| Walter-dependent frontend files | 7+ (will break when Walter backend removed) |
| Files bypassing apiFetch | 1 (system-config.tsx uses raw fetch) |

---

## Phase 9 Addendum — Kyle's Directives (2026-02-17)

> **Kyle's Final Position**: "Phase 9 is mostly accurate. No fabricated claims. No phantom issues. No hidden code misrepresentation. Frontend is stable but: bloated, Walter-heavy, security-light on token handling, and in need of cleanup after audit."

### ADD-1: Token Storage Security Review

JWT tokens stored in `localStorage` create XSS exposure risk. No `httpOnly` cookie protection. Documented in [Section 3 — Token Storage Security Concern](#token-storage-security-concern-phase-9-addendum-add-1).

**Recommendation**: Future migration to secure cookie or hybrid approach (httpOnly refresh cookie + in-memory access token).

### ADD-2: Monolithic Page Refactor Plan

The following pages/components are flagged for component decomposition:

| File | Lines | Decomposition Strategy |
|------|-------|----------------------|
| `ai-transparency.tsx` | 2,074 | Extract each section (transparency logs, calibration, error logs, semantic memories, orchestrator, formula audit, feed health) into standalone components |
| `machine-learning.tsx` | 1,985 | Extract ML scores, predictive adjustments, stability analysis, safety signals, regime archive into individual tab components |
| `analytics.tsx` | 1,939 | Extract narrative feed, batch analysis, benchmarks, governance, predictive diagnostics into standalone components |
| `top-bar.tsx` | 1,042 | Extract trading toggle, mode switch, time display, approvals bell, portfolio metrics row into individual components |

**Timing**: Post-audit cleanup. These pages are functional but unmaintainable at their current size. Each should be decomposed into focused components with clear data contracts.

### ADD-3: Centralized Polling Policy

The frontend uses ad-hoc polling intervals with no centralized policy. Kyle directs defining standard refresh tiers:

| Tier | Interval | Use Case | Current Examples |
|------|----------|----------|-----------------|
| **Critical** | 5s | Trading status, real-time state | `useTradingStatus()` (5s) |
| **Semi-critical** | 15–30s | Health, active trades, alerts | `useSystemHealth()` (15s), active trades (30s), alerts (30s) |
| **Informational** | 60s+ | Portfolio, briefs, settings | Portfolio (60s), settings (300s), database status (3600s) |

**Current inconsistencies**:
- Filter health polls at 10s (paper active) or 60s (inactive) — adaptive, acceptable
- Watchlist scan diagnostics polls at 10s — arguably too aggressive for informational data
- KillSwitchBanner polls `/api/settings` at 15s — could be WebSocket-driven instead
- Goal widgets have no standardized refresh — each sets its own interval

**Recommendation**: Create a `POLLING_TIERS` constant in `lib/` that all hooks reference. Enforce via code review that new queries use the appropriate tier.

### ADD-4: Remove Speculative Endpoints

`enhanced-system-monitoring.tsx` must be cleaned. The ~60 speculative/aspirational API endpoints across `/api/ethics/*`, `/api/collaboration/*`, `/api/federation/*`, `/api/knowledge/*`, `/api/oversight/*`, `/api/alignment/*`, `/api/introspection/*`, `/api/reasoning/*` generate unnecessary 404 network requests. These should be removed and the component simplified to match actual system capabilities.

**Timing**: Post-audit cleanup (can be bundled with ADD-2 decomposition).

### ADD-5: Remove Simulated Price Display

The `entryPrice * 1.02` hardcoded simulation in `components/trading/active-trades.tsx` (line 30) must be replaced with a real price feed. Active trades should display current market price from the price cache or WebSocket price stream.

**Timing**: Pre-MCE — important for accurate paper trading UI.

---

*Phase 9 complete (with addendum). Next: Phase 10 (Testing & Quality Assurance) and Phase 11 (Database Schema & Migrations).*


---

# Operational Model — Development Pipeline & Actor Roles

**Added**: 2026-03-17 (HF12B). **Updated 2026-04-20:** canonical reference migrated from CCPI (retired) to `CLAUDE.md` at repo root.
**Canonical Reference**: `CLAUDE.md` (repo root) — auto-loaded at session start. For historical CCPI, see `1-system-manual/_archive/CLAUDE_CODE_PROJECT_INSTRUCTIONS.md`.

> This section provides a summary of the operational model. `CLAUDE.md` is the single source of truth for workflow rules, actor roles, and governance procedures. Do not duplicate detailed rules here — reference `CLAUDE.md`.

## Four-Actor Model

DawnTrader is developed and maintained by four actors working in a batch-based pipeline:

| Actor | Role | Primary Tools |
|-------|------|---------------|
| **Kyle** | Product owner and decision authority. Approves scopes, resolves ambiguities, makes strategic decisions. | Google Drive, Telegram |
| **Claude Code** | System cartographer and lead architect. Reads source code, writes scope docs, creates batch zips, syncs clone repo via git pull. Does NOT push to GitHub. | Claude Code terminal, local file system, SSH to Langston server |
| **Langston** | Autonomous AI agent (GPT-5.4 on Hetzner server). Deploys zips to Replit, pushes verified code to GitHub, generates reports, monitors Claude Code capacity. | OpenClaw gateway, Replit browser automation, Telegram, Google Drive |
| **Replit** | Applies code changes from zip packages. Runs validation. Does NOT make autonomous changes beyond what the batch specifies. | Replit Agent, bash shell, npm/node |

## Batch-Based Workflow (Summary)

All code changes flow through a structured batch process:

1. **Scope Agreement** — Kyle and Claude Code agree on what the batch fixes and how
2. **Snapshot** — Claude Code creates a frozen snapshot of pre-change state
3. **Batch Creation** — Claude Code writes the batch (code zips with INSTRUCTIONS.md + README.md)
4. **Deployment** — Claude Code uploads the zip to Replit via replit-cmd and directs Replit to apply changes per INSTRUCTIONS.md
5. **Verification** — Langston verifies: server starts, tests pass, endpoints work, no regressions
6. **Push** — Claude Code pushes verified code to GitHub via replit-cmd shell
7. **Sync** — Claude Code runs git pull to sync the local clone repo
8. **Governance** — Claude Code creates a governance batch (CCPI updates, directive index, manual updates)

Governance batches follow the same pipeline but modify documentation files instead of code.

## Scheduling & Automated Jobs

DawnTrader runs several scheduled jobs via `node-schedule` (in-process):

| Job | Schedule | File |
|-----|----------|------|
| Weekly regime archive | Sunday 00:45 UTC | `server/core/archival/archival-scheduler.ts` |
| Nightly archive integrity check | Daily 02:00 UTC | `server/core/archival/archival-scheduler.ts` |
| Monthly archive compression | 1st of month 03:00 UTC | `server/core/archival/archival-scheduler.ts` |

**Important**: These are in-process jobs. If the server is not running at scheduled time, the job silently misses. A startup catch-up mechanism (added HF12) detects missed archive runs and executes them on next boot.

## Communication Channels

The team communicates via Telegram ("Dawn Trader HQ" forum group) with topic-based threads:

| Topic | Purpose |
|-------|---------|
| General (#20) | Kyle <-> Langston direct |
| Claude Code Sessions (#21) | Langston <-> Claude Code exchanges |
| Replit Operations (#22) | Langston <-> Replit deployment logs |
| Reports (#23) | Formal reports (batch completion, hotfix, daily summary) |
| Design (#28) | Feature design discussions |

For detailed rules on 3-way communication protocol, message formatting, and session management, see `CLAUDE.md` §6 at repo root (CCPI retired 2026-04-20).

---

# Part V: Quality & Data


---

# Chapter 10: Testing & Quality Assurance

## 1. Testing Infrastructure Overview

DawnTrader uses a **multi-layered quality assurance architecture** spanning compile-time, build-time, runtime, and operational-time validation. The system does NOT rely solely on traditional unit tests — it combines formal test suites with an extensive runtime validation and diagnostic infrastructure.

### Test Frameworks

| Framework | Version | Purpose | Config File |
|-----------|---------|---------|-------------|
| **Vitest** | ^3.2.4 | Server-side unit & integration tests | `vitest.config.ts` |
| **Playwright** | ^1.56.1 | End-to-end browser tests | `playwright.config.ts` |
| **@vitest/ui** | ^3.2.4 | Vitest visual dashboard | (via vitest) |

### What Is NOT Present

- **No frontend component tests** — zero `*.test.tsx` or `*.spec.tsx` files exist under `client/`
- **No @testing-library** — React Testing Library is not installed
- **No Jest** — not configured, not installed
- **No CI/CD pipelines** — no `.github/workflows/`, `.gitlab-ci.yml`, or `Jenkinsfile`
- **No test scripts in package.json** — no `"test"`, `"test:unit"`, or `"test:e2e"` scripts defined
- **No Prettier** — no `.prettierrc` configuration
- **No Husky** — no `.husky/` directory or pre-commit hooks
- **No lint-staged** — no pre-commit lint enforcement
- **No dedicated mock/fixture directories** — no `__mocks__/`, `fixtures/`, or `test-utils/` directories
- **No coverage reports on disk** — no `coverage/` directory or `lcov.info` files exist

---

## 2. Vitest Configuration

**File**: `vitest.config.ts` (19 lines)

```
- globals: true (no explicit vitest imports required)
- environment: 'node'
- include: ['server/**/*.test.ts']
- coverage reporters: text, json, html
- coverage exclude: node_modules/, dist/
- alias: @shared → shared/
```

**Key characteristics**:
- Tests are server-only — the glob pattern `server/**/*.test.ts` excludes all client code
- The `globals: true` setting allows tests to use `describe`, `it`, `expect` without importing from vitest (explains why `symbol-canonicalizer.test.ts` has no vitest import)
- Coverage is configured but no coverage reports exist on disk, suggesting coverage has never been run or reports are gitignored
- No setup files, no global mocks, no test environment customization

---

## 3. Playwright Configuration

**File**: `playwright.config.ts` (31 lines)

```
- testDir: './e2e'
- fullyParallel: false (sequential execution)
- workers: 1 (single worker)
- retries: 2 in CI, 0 locally
- forbidOnly: true in CI
- reporter: html
- trace: 'on' (always capture)
- video: 'on' (always record)
- screenshot: 'on' (always capture)
- baseURL: http://localhost:5000
- browser: Chromium only (Desktop Chrome)
- webServer: expects already-running server (reuseExistingServer: true)
```

**Key characteristics**:
- Sequential execution (not parallel) — appropriate for tests that modify system state
- Full artifact capture (trace, video, screenshot) even in non-CI mode
- Requires a manually-started server — Playwright does not start the application
- Only Chromium is configured — no cross-browser testing

---

## 4. Test Suite Inventory

### 4.1 Total Test File Count

| Category | Location | Count | Lines (approx) |
|----------|----------|-------|-----------------|
| Server Unit Tests | `server/tests/unit/` | 31 | ~7,100 |
| Server Integration Tests | `server/tests/integration/` | 13 | ~2,500 |
| Server System Tests | `server/tests/system/` | 2 | ~640 |
| Server Invariant Tests | `server/tests/invariants/` | 1 | ~70 |
| Server Root Tests | `server/tests/*.test.ts` + `*.ts` | 6 | ~1,930 |
| Server __tests__ | `server/__tests__/` | 3 | ~530 |
| Server Colocated | `server/services/utils/` | 1 | ~75 |
| E2E Tests | `e2e/` | 2 | ~750 |
| Root Tests | `tests/` | 1 | ~140 |
| **TOTAL (active codebase)** | | **60** | **~13,735** |
| Training/Docs (stale copies) | `docs/training/Walter_Learning_Files/` | 3 | (copies of server tests) |

### 4.2 Server Unit Tests (31 files in `server/tests/unit/`)

Tests are organized by directive number, reflecting the phased development history:

| File | Lines | Directive | What It Tests |
|------|-------|-----------|--------------|
| `adaptive-kalman.test.ts` | 384 | 9.3 | Kalman filter cold start, ER calculator, adaptive R/Q, filter registry, state persistence |
| `adaptive-scan-manager.test.ts` | 200 | 10.8 | Dual-pool scheduler (60/40 split), PairFailureTracker cooldown, batch generation |
| `analysis-utils.test.ts` | 186 | 9.1.H | Core metric functions: LQ, DI, VolNoise, Sigma, filter thresholds, volume classification |
| `canonical-validation.test.ts` | 159 | 11.4F.1 | Trade validation middleware: ghost regime normalization, legacy strategy normalization, violation levels |
| `canonical_source_lock.test.ts` | 116 | 11.4F.1B | Codebase scan: no legacy `regime-strategy-map.ts` imports; canonical file exports all 15 required items |
| `covariance-engine.test.ts` | 321 | 9.4 | Covariance matrix symmetry, correlation bounds, portfolio variance, numerical stability |
| `directive-11.0E.2.test.ts` | 345 | 11.0E.2 | VTS pipeline isolation: Phase-10 metrics, legacy removal from VTS interfaces, cache sandboxing |
| `directive-11.4B.2-R1.test.ts` | 252 | 11.4B.2-R1 | Adaptive scanning: ideal pool flush, 100-pair cycle guarantee, underflow protection |
| `directive-11.4C-R2.test.ts` | 222 | 11.4C-R2 | Top batch UI: retry logic, getRankedPairs format, no legacy pool references |
| `directive-11.4C.3-harmonization.test.ts` | 216 | 11.4F.1 | Strategy/regime harmonization: snake_case naming, legacy mapping, hybrid integrity |
| `directive-11.7R-E-enforcement.test.ts` | 198 | 11.7R-E | Enforcement regression: UNSTABLE + vwap_pullback blocked pre-score, HIGH dependency blocking |
| `directive-11.7R-governance.test.ts` | 267 | 11.7R | Regime transition governance: STABLE/TRANSITION/UNSTABLE classification, multipliers, cooldowns |
| `directive-11.7S-strategy-modes.test.ts` | 257 | 11.7S | Strategy mode modulation: NORMAL/DEFENSIVE/SURVIVAL overlays, confidence floors, mode stats |
| ~~`execution-config.test.ts`~~ | — | 11.0D | **DELETED 2026-04-23 (B65.2)**. Tested the Phase-11 EXECUTION_CONFIG const which was deleted; values migrated to `module_constants` table. |
| `b65-tec-parity.test.ts` | ~290 | B65.2 | TEC exit-evaluator parity: 11 scenarios covering stop_hit, target_hit, stale_timeout, MAX_HOLD timeout, qualifier accept/reject, source-pool gate, concurrency cap (paper blocks at N-1, VTS unlimited), static-stop vs trailing-stop discrimination. Mocks DB + cost-model + storage; exercises real engine logic. |
| `b65-module-constants-resolution.test.ts` | — | B65.1 | module_constants resolution-hierarchy unit test (most-specific-wins scoring). |
| `b65-migration-validation.test.ts` | — | B65.1 | Migration-validation tests for the B65 schema additions. |
| `filter-insights.test.ts` | 441 | 10.9C | Filter insights service: 9 active filters, schema v1.3.1, rolling 24h window, telemetry |
| `finalscore-equivalence.test.ts` | 201 | 11.0E | FinalScore formula: canonical weights, fallback, clamping, NaN detection, idempotency |
| `hybrid-integration.test.ts` | 385 | 10.4 | Ensemble scoring, confluence detection, strategy selection, pattern decay, timeframe guard |
| `ml-calibration.test.ts` | 173 | 10.6 | ML learning loop: weight adjustment recs (INCREASE/DECREASE/HOLD), pattern grouping |
| `multi-timeframe.test.ts` | 507 | 10.7 | Fractal vision: timeframe config, weight hierarchy, rate limiter, cascade criteria, decay lambda |
| `pattern-recognizer.test.ts` | 249 | 10.2 | Candlestick patterns: PINBAR, ENGULFING, INSIDE_BAR, THREE_SOLDIERS, MORNING_STAR |
| `recalibration_integrity.test.ts` | 361 | 11.7D.1 | Predictive adjustments: file locking, log schema, telemetry integrity validation |
| `regime_mapping_integrity.test.ts` | 147 | 11.7F | Codebase scan: no hardcoded regime strings outside /config/ — must use REGIMES.* constants |
| `runtime_signal_consistency.test.ts` | 123 | 11.4F.1 | SignalType consistency: all 17 strategies → canonical type, uppercase enforcement |
| `score-weights.test.ts` | 253 | 10.9A | SCORE_WEIGHTS: immutability, version v1.0.1, inline FinalScore calculation consistency |
| `signal_mapping_integrity.test.ts` | 168 | 11.4F.1 | Signal mapping: 17 strategies → signalType, legacy normalization chain, ISO timestamps |
| `sqe-config-dynamic.test.ts` | 139 | 11.0D | SQE dynamic config: FinalScore backfill, RegimeWeight calculation from trend/volatility |
| ~~`tco-tec-tcl.test.ts`~~ | — | 11.0B | **DELETED 2026-04-23 (B65.2)**. Tested the Phase-11 TEC (`execution-controller.ts`) which was deleted in the same batch. |
| `telemetry-aggregator.test.ts` | 207 | 10.8 | Telemetry aggregator: pair recording, composite score, top/rotational pairs, cascade efficiency |
| `trailing-exit.test.ts` | 239 | 9.2.H | Trailing exit controller: dynamic stop distance (K'), break-even trigger, target lock, persistence |
| `vn_parity.test.ts` | 114 | 11.7H | VN parity: IMF vs canonical analysis-utils produce identical VolNoise values |
| `vts-modernization.test.ts` | 320 | 11.0E.1 | VTS modernization: regime calculator, strategy mapping, pattern preloader, Phase-10 record structure |

### 4.3 Server Integration Tests (13 files in `server/tests/integration/`)

| File | Lines | Directive | What It Tests |
|------|-------|-----------|--------------|
| `adaptive_scanning.test.ts` | 209 | 11.2 R1 | AdaptiveRatioManager, pool score computation, scan batch generation |
| `config-provenance.test.ts` | ~150 | Phase 27 | Config snapshot provenance metadata and sources |
| `cost_cache.test.ts` | 215 | 11.3B | Exchange defaults, in-memory cost cache (TTL, clamping, performance <0.1ms/lookup) |
| `cost_telemetry.test.ts` | ~160 | 11.3 | Cost model telemetry persistence and retrieval |
| `dss.test.ts` | 177 | 10.1.E | DSS regime detection (6 regimes), veto behavior, strategy selection by confidence + NetEV |
| `dynamic_sizing.test.ts` | ~180 | 11.0 | Dynamic position sizing: expand/contract multipliers, risk limits |
| `market_indicators_narrative.test.ts` | ~200 | 10.8 | Market narrative generation from indicators |
| `net_expectancy.test.ts` | 231 | 11.3A | Net expectancy: canonical cost model, net geometry, conditional refresh logic |
| `schema_v1_5.test.ts` | 119 | 11.0F | Schema v1.5.0: metric engine version, FinalScore weights, legacy metric removal |
| `schema_v1_5_1.test.ts` | ~120 | 11.0F | Schema v1.5.1: incremental schema validation |
| `telemetry_persistence_sql.test.ts` | 206 | 11.1A | SHA-256 checksums, environment guard, true mode provenance |
| `telemetry_provenance_patch.test.ts` | ~150 | 11.1 | Telemetry provenance patching and migration |
| `telemetry_rehydration_e2e.test.ts` | ~200 | 11.1 | Telemetry cache rehydration from SQL storage |

### 4.4 Server System Tests (2 files in `server/tests/system/`)

| File | Lines | Directive | What It Tests |
|------|-------|-----------|--------------|
| `mapping_drift_integrity.test.ts` | 294 | 11.7F | DriftScore computation, EMA smoothing, bridge JSON/Markdown validation, schema version `v1.4c` |
| `predictive_diagnostics_integrity.test.ts` | 345 | 11.7G | Predictive diagnostics: filter descriptions, status colors, telemetry stats, decision cap (100), pass rate |

### 4.5 Server Invariant Tests (1 file in `server/tests/invariants/`)

| File | Lines | What It Tests |
|------|-------|--------------|
| `guardrails-deprecation.test.ts` | 71 | Legacy `getGuardrails()` throws `[9.7] Deprecated`; V2 methods work; legacy method available for debug |

### 4.6 Server Root Tests (6 files in `server/tests/`)

These are a mix of Vitest tests and standalone scripts:

| File | Lines | Framework | What It Tests |
|------|-------|-----------|--------------|
| `diagnostic-system.test.ts` | 466 | **Standalone script** | Phase 5.9: 11 diagnostic scenarios (Walter, Bob, log search, schema verify, patch proposal) |
| `phase-6.0-simulations.test.ts` | 229 | Vitest | Phase 6.0: Walter expert corpus, Bob identity, UX templates, knowledge refresh |
| `live-pricing-validation.ts` | 414 | **Standalone script** | Phase 27.F.15.D: Live pricing adapter lifecycle, mock price generation, TTL, multi-symbol |
| `system-verify.ts` | 242 | **Standalone script** | System sync: health endpoint, paper trading start/stop, goals creation, dashboard resync |
| `test-force-trade.ts` | 157 | **Standalone script** | Phase 27.F.14: PAPER_FORCE_TRADE_SYMBOL feature, DB query verification |
| `metrics-core-msi-validation.ts` | ~200 | **Standalone script** | Metrics core MSI validation |

### 4.7 Server __tests__ (3 files in `server/__tests__/`)

| File | Lines | What It Tests |
|------|-------|--------------|
| `smoke.test.ts` | 21 | Basic sanity: logger exists, date formatting, P/L percentage math |
| `config-snapshot-api.test.ts` | 412 | Phase 27.G: Config Snapshot API (HTTP integration, auth, schema, provenance, legacy compliance) |
| `friction-mapping.test.ts` | 97 | Directive 11.4B: 4-tier friction color mapping boundary tests |

### 4.8 E2E Tests (2 files in `e2e/`)

| File | Lines | Framework | What It Tests |
|------|-------|-----------|--------------|
| `config-snapshot.spec.ts` | 248 | Playwright | Phase 27.G: Config Snapshot Viewer UI — tabs, schema hash, clipboard, refresh, legacy badge |
| `phase-41F-L-e2e-validate-flow.spec.ts` | 505 | Playwright | Phase 41F-L: Full pipeline validation — login, kill switch, engine start, Kraken load, filter insights, RTB signals, trade execution, portfolio update, backend lineage verification. Generates markdown report + NDJSON lineage trace |

### 4.9 Root Tests (1 file in `tests/`)

| File | Lines | Framework | What It Tests |
|------|-------|-----------|--------------|
| `phase-41F-L-simulation.spec.ts` | 138 | Playwright | Phase 41F-L: Three-trade paper simulation (BTC, ETH, BTC sell), portfolio state verification |

### 4.10 Colocated Test (1 file)

| File | Lines | What It Tests |
|------|-------|--------------|
| `server/services/utils/symbol-canonicalizer.test.ts` | 75 | Symbol canonicalization: Kraken ID ↔ canonical (BTC/USD) conversion |

---

## 5. Test Characteristics and Patterns

### 5.1 Testing Approach: Real Imports, No Mocking

A defining characteristic of DawnTrader's test suite is that **virtually no tests use mocking frameworks**. Tests import and test against **real service code**:

- No `jest.mock()`, no `vi.mock()`, no Sinon
- No mock objects or test doubles for service dependencies
- Some tests use `vi.spyOn(console, 'log')` for telemetry output verification
- `vi.resetModules()` used once (for environment variable isolation in telemetry tests)
- Two tests use filesystem scanning to enforce codebase-wide invariants

This approach means:
- Tests are high-fidelity (testing real behavior, not mock behavior)
- Tests are tightly coupled to implementations (fragile to internal refactoring)
- Tests cannot run in isolation from the database/server for integration tests
- Constructor/initialization failures cascade across test suites

### 5.2 Directive-Linked Tests

Tests are systematically linked to specific development directives:

| Directive Range | Phase | Domain |
|----------------|-------|--------|
| 9.1 – 9.4 | Phase 9 | Core math (metrics, Kalman, trailing exits, covariance) |
| 10.1 – 10.9 | Phase 10 | Trading infrastructure (DSS, patterns, hybrid, multi-timeframe, telemetry, filters) |
| 11.0 – 11.7 | Phase 11 | Architecture modernization (VTS pipeline, component boundaries, governance, enforcement) |
| Phase 27 | — | Config snapshot, live pricing |
| Phase 41F | — | Health monitoring, E2E validation |

This provides traceability from tests back to the specifications they verify.

### 5.3 Codebase Scanning Tests

Two unit tests use filesystem scanning to enforce architectural rules:

1. **`regime_mapping_integrity.test.ts`**: Recursively walks `server/` looking for hardcoded regime strings (`BULL_STABLE`, etc.) outside of `/config/` and `/tests/`. Ensures all regime references use `REGIMES.*` constants.

2. **`canonical_source_lock.test.ts`**: Scans all `.ts` files for imports from the legacy `regime-strategy-map.ts` (only `canonical-regime-strategy-map.ts` is allowed). Verifies the legacy file does not exist on disk.

These are architectural invariant tests — they prevent regression at the source code level rather than at runtime.

### 5.4 Governance Invariant System

Tests reference specific **M-numbered governance invariants** (audit checkpoints):

| Invariant Range | Domain |
|----------------|--------|
| M45 – M49 | Trade record structure, regime calculation |
| M50 – M54 | VTS data pipeline isolation |
| M63 – M64 | Adaptive scanning pool management |
| M65 – M67 | UI integration, legacy cleanup |

### 5.5 Schema Version Assertions

Multiple tests assert specific schema versions, creating **version lock contracts**:

| Schema | Version | Test File |
|--------|---------|-----------|
| Backend | v1.4.3 | `tco-tec-tcl.test.ts` |
| Schema | v1.5.0 | `schema_v1_5.test.ts` |
| Schema | v1.5.2 | `telemetry_persistence_sql.test.ts` |
| Schema | v1.5.7 | `net_expectancy.test.ts` |
| Schema | v1.5.8 | `cost_cache.test.ts` |
| VTS Pipeline | v1.6.7 | `directive-11.0E.2.test.ts` |
| Regime Mapping | v1.4c | `mapping_drift_integrity.test.ts` |
| Filter | v1.3.1 | `filter-insights.test.ts` |
| Score Weights | v1.0.1 | `score-weights.test.ts` |
| Predictive Diagnostics | v1.0 | `predictive_diagnostics_integrity.test.ts` |
| Governance | v1.0/v1.1 | governance tests |
| Strategy Modes | v1.0 | `directive-11.7S-strategy-modes.test.ts` |
| Predictive Adjustments | v1.0 | `recalibration_integrity.test.ts` |

**Risk**: If any schema version is bumped without updating the corresponding test, that test fails. Multiple tests may pin different schema versions (e.g., `schema_v1_5.test.ts` asserts v1.5.0 while `cost_cache.test.ts` asserts v1.5.8), creating a version staleness gradient.

---

## 6. Standalone Test Scripts (Non-Framework)

Four test files in `server/tests/` are NOT Vitest tests — they are standalone scripts with custom test runners:

| File | Lines | Execution | Requires |
|------|-------|-----------|----------|
| `diagnostic-system.test.ts` | 466 | `import.meta.url` self-invoke | Running server + database |
| `live-pricing-validation.ts` | 414 | Exported `runLivePricingValidation()` | Kraken adapter (mock mode) |
| `system-verify.ts` | 242 | `main()` → `process.exit()` | Running server at localhost:5000 |
| `test-force-trade.ts` | 157 | Shebang (`#!/usr/bin/env tsx`) | Running server + database |

These scripts:
- Cannot be discovered or run by Vitest (no `describe`/`it` blocks for most)
- Require manual invocation (`tsx server/tests/system-verify.ts`)
- Have custom pass/fail counting with no standard exit codes (except `system-verify.ts`)
- Mix Vitest-compatible naming (`*.test.ts`) with non-Vitest execution patterns

---

## 7. Runtime Validation Services (Operational QA)

Beyond the formal test suite, DawnTrader has an extensive **runtime validation layer** — services that run during live/paper operation to continuously validate system correctness.

### 7.1 REB (Runtime Evaluation Buffer) Infrastructure

| Service | Lines | What It Validates |
|---------|-------|-------------------|
| **REB 2.12 Test Harness** (`reb-2-12-test-harness.ts`) | 879 | 15 deterministic filter validation tests: volume, liquidity, price, volatility, spreads, stablecoins, regulated assets, universe sizing, multi-filter interaction. Bypasses 30s scan interval for controlled testing. |
| **REB 2.14 Historical Test** (`reb-2-14-historical-test.ts`) | ~300 | Historical data integrity verification |
| **REB 2.15 Certification** (`reb-2-15-certification.ts`) | 605 | Multi-cycle FX5 pipeline certification (default 6 cycles). Analyzes drift (CV >30% = significant), survivor consistency (>70% = consistent), pool behavior (phantom/duplicate detection), REB 2.10 coupling. PASS criteria: no errors, no significant drift, healthy pool. |

### 7.2 Paper Validation Engine

**File**: `paper_validation_engine.ts` (468 lines)
**Directive**: 8.8.4-M5

Captures adaptive metrics at 10-second intervals during paper-trading sessions (up to 60 minutes). Validates:

| Criterion | Threshold | Pass Condition |
|-----------|-----------|----------------|
| Feed latency | 100ms | Average < 100ms |
| Cache window | 200 entries | >= 200 latency records |
| ARA updates | 3 | >= 3 updates |
| Adaptive relevance variance | 0.01 | Range > 0.01 |
| CWQI/NGC drift | 10% | Max step-to-step drift < 10% |
| VTS mode switch delay | 1 | Always passes (placeholder) |

Writes validation reports to `reports/ValidationRun_<timestamp>.json`.

### 7.3 M3B Validation Service

**File**: `m3b-validation-service.ts` (250 lines)
**Directive**: 8.8.4-M3B

Validates adaptive coupling integrity:
1. Static decay removed (ARA formula: `relevance = learningRate * (gsi + 0.15)`)
2. ARA linked to VTS/DCE (contextStability > 0, learningRate > 0)
3. Adaptive risk working (suggested risk/exposure > 0)
4. CWQI variance healthy (range [0, 0.5])
5. NGC average healthy (placeholder — always passes)
6. Pearson correlation between CWQI variance and exposure > 0.3

Report: PASS (6/6), PARTIAL (≥3/6), or FAIL (<3/6).

### 7.4 Verification Test Protocol

**File**: `verification-test-protocol.ts` (493 lines)
**Directive**: 8.9.4-VTP

Validates Mini-Book, Sentinel, WebSocket, and REST systems during trading:

| Check | Pass Criteria |
|-------|--------------|
| WS Feed Integrity | ≥95% ticks from WebSocket (not REST fallback) |
| Sentinel Health | <1 reset per hour |
| Price Drift | Max WS-vs-REST divergence ≤0.2% |
| UI Sync | <1% mismatch events |

### 7.5 Auto Test Harness

**File**: `auto_test_harness.ts` (386 lines)
**Phase**: 24

Automates 4 operational test scenarios (13 steps total):
1. Paper Simulation Start/Stop (3 steps)
2. Multi-Intent Command Execution (2 steps)
3. Simulation Heartbeat Monitoring (2 steps)
4. Live Trading Activation Flow (4 steps — requires approval workflow)

Generates markdown and JSON reports.

---

## 8. Canonical Validation Middleware

**File**: `server/middleware/canonical-validation.ts` (214 lines)
**Directive**: 11.4F.1

Runtime middleware that validates every trade against canonical rules before execution:

| Violation Level | Trigger | Trade Outcome |
|----------------|---------|---------------|
| **WARN** | Ghost regime normalized (e.g., BULL_VOLATILE → HIGH_VOL_IMPULSE) | Trade proceeds with normalized values |
| **WARN** | Legacy strategy normalized (e.g., TrendFlow → sma_trend_ride) | Trade proceeds with normalized values |
| **ERROR** | SignalType mismatch for strategy | **Trade rejected** |
| **CRITICAL** | Non-canonical regime/strategy/signalType combination | **Trade rejected** |

Violations logged to `audit/logs/canonical_violation.log`. Stats queryable by level and source.

---

## 9. Schema Validation

### 9.1 Bootstrap Schema Validator

**File**: `server/bootstrap/schema-validator.ts` (98 lines)
**Directive**: 11.7F

Runs at server startup:
- Reads `bridge/canonical/mapping-regime-strategy.json`
- Compares bridge schema version against expected `regime-mapping/v1.4b`
- `validateSchemaVersionsStrict()` throws on mismatch (production mode)
- Minor version differences (within v1.4 family) produce warnings only

### 9.2 Zod Strategy Validators

**File**: `server/services/strategy-validators.ts` (149 lines)

Defines Zod schemas for all 8 strategy parameter sets with numeric constraints:

| Strategy | Key Constraints |
|----------|----------------|
| VWAP Pullback | vwapLookbackMin 1-120, pullbackPct 0.1%-5% |
| ABCD Long | minAtoBStrength 0.1-5, cPullbackPctMax 1%-30% |
| SMA Trend Ride | fastSma 3-50, slowSma 10-200, trendStrengthMin 0-1 |
| Breakout | minConsolidationBars 5-30, breakoutBuffer 0.5-2% |
| Mean Reversion | deviationThreshold 1.5-4%, minRangeTouches 2-4 |
| Range Trading | minRangeDurationHours 4-48, minRangeWidth 2-8% |
| VWAP Bounce | vwapProximity 0.2-1%, volumeMultiplier 1.2-2.0 |
| Liquidity Trap | maxTrapExtension 0.5-2%, trapReturnBars 1-3 |

All strategies share a base schema: `maxConcurrentPositions` (0-20), `riskPerTrade` (0.05%-5%), `takeProfitR` (0.2-10), `stopLossR` (0.1-10), `cooldownMinutes` (0-240).

### 9.3 Drizzle-Zod Database Schema

**File**: `shared/schema.ts`

Uses `createInsertSchema` from `drizzle-zod` for automatic database input validation. Covers 100+ domain-specific enums (trading modes, strategy types, trade status, safety/alignment/policy enums).

---

## 10. Health Monitoring & Diagnostics

### 10.1 Unified Health Monitor

**File**: `server/services/health-monitor.ts`
**Directive**: Phase 41F-C

5-second heartbeat cycle with 250-entry ring buffer (~21 minutes of history):

| Component | Key Metrics |
|-----------|-------------|
| Paper Queue | depth, executing job age, dedup listener count |
| Live Queue | depth, executing job age |
| Paper Engine | isRunning, lastTickAge, lastSignalAge, lastTradeAge, sessionId |
| Live Engine | isRunning, lastTickAge, lastSignalAge |
| Market Data | websocketStatus, lastMessageAge, restFallbackActive |
| SSOT Cache | hits, misses, TTL, activeFilterHash |
| Database | pool (active/idle/total), slowQueries |
| Broadcast Bus | lastEventType, lastLatency, averageLatency |
| External Connectivity | krakenLastSuccess, krakenLastError |

**Alert thresholds**:
- Heartbeat latency: warn 200ms, critical 400ms
- Queue depth: warn 5, critical 10
- Job age: warn 15s, critical 30s
- Broadcast latency: warn 120ms, critical 200ms

### 10.2 Diagnostic Services (15+ files)

Specialized diagnostic modules provide deep inspection of specific subsystems:

| Service | What It Inspects |
|---------|-----------------|
| `diagnostic-controller.ts` | Central diagnostic orchestration |
| `aj16-rtb-diagnostic.ts` | Ready-to-Brief pipeline diagnostics |
| `aj17-diagnostic-runner.ts` | Phase AJ17 diagnostic flows |
| `aj18/19-diagnostic.ts` | Advanced phase diagnostics |
| `b4-diagnostics.ts` | B4 trading diagnostics |
| `c5-financial-diagnostics.ts` | Financial metric diagnostics |
| `i1-rtb-diagnostics-service.ts` | I1 Ready-to-Brief pipeline |
| `paper-sim-diagnostic.ts` | Paper simulation diagnostics |
| `system-truth-diagnostic.ts` | Ground truth verification |
| `task-queue-diagnostics.ts` | Task queue health |

### 10.3 Diagnostic Report Archive

The `diagnostic-reports/` directory contains **80+ archived reports** from various development phases:
- Phase 34-41F validation reports
- Burn-in stability tests (NDJSON logs)
- E2E validation results (JSON, markdown)
- Shell scripts for manual test execution
- Trace files (NDJSON lineage traces)

These represent a comprehensive history of QA activities performed during development, but are point-in-time artifacts rather than continuously-run regression tests.

---

## 11. Code Quality Tooling

### 11.1 ESLint Configuration

**File**: `.eslintrc.json` (34 lines)

Extends `eslint:recommended` with three custom rules:

| Rule | Type | What It Enforces |
|------|------|-----------------|
| No Hardcoded UUIDs | `no-restricted-syntax` (error) | Phase 31.I: UUIDs must come from resolvers/env/config, not inline strings |
| No Legacy Metric Imports | `no-restricted-imports` (error) | Directive 11.0E: Blocks `calculateCWQI`, `calculateNGC`, `computeProfitRate` imports |
| Quality Index Warning | `no-restricted-imports` (warn) | Warns on `**/quality_index*` imports, suggests `score-calculator.ts` instead |

**Not configured**: No React-specific ESLint rules, no TypeScript ESLint plugin, no import ordering rules, no Prettier integration.

### 11.2 TypeScript Configuration

**Root `tsconfig.json`**:
- `"strict": true` — enables all strict type-checking options
- `"target": "ES2020"`, `"module": "ESNext"`
- `"skipLibCheck": true` — does not type-check `node_modules`
- Explicitly **excludes** `**/*.test.ts` from compilation
- Path aliases: `@/*` → `client/src/*`, `@shared/*` → `shared/*`

**Server `server/tsconfig.json`**:
- Extends root, overrides to `"target": "ES2022"`, `"moduleResolution": "bundler"`
- `"noUnusedLocals": false`, `"noUnusedParameters": false` — strict mode but unused variable checks disabled

### 11.3 Build Pipeline

- **Vite** builds the client (`vite build`)
- **esbuild** bundles the server (`esbuild server/index.ts`)
- **`tsc`** available via `npm run check` but not enforced pre-commit
- No build-time test execution — build and test are fully decoupled

---

## 12. Coverage Analysis — What Is Tested vs. What Is Not

### 12.1 Well-Tested Areas

| Domain | Coverage Quality | Key Tests |
|--------|-----------------|-----------|
| **Canonical regime/strategy mapping** | Strong | 5+ tests validate mapping integrity, source lock, signal consistency, drift |
| **FinalScore calculation** | Strong | Equivalence test, score weights, SQE config |
| **Governance enforcement** | Strong | Regime transition, enforcement regression, strategy modes |
| **Cost model** | Strong | Cache, exchange defaults, net expectancy, friction mapping |
| **Telemetry pipeline** | Strong | Persistence, provenance, rehydration, aggregator |
| **Filter pipeline (FX5)** | Strong | REB 2.12 (15 deterministic tests), filter insights, adaptive scanning |
| **Mathematical utilities** | Strong | Kalman filter, covariance engine, analysis-utils, trailing exits, VolNoise parity |
| **E2E paper trading flow** | Strong | Full pipeline validation with lineage tracing (Phase 41F-L) |

### 12.2 Untested Areas

| Domain | Coverage Gap | Risk |
|--------|-------------|------|
| **Frontend (React components)** | **Zero test files** — no component tests, no integration tests, no snapshot tests | HIGH — 189 frontend files with zero test coverage |
| **Signal Orchestrator** | No direct unit tests for the 1,200+ line signal orchestrator | HIGH — core execution path untested |
| **Paper Execution Engine** | No unit tests — only validated through E2E flows | MEDIUM — relies on E2E tests for correctness |
| **WebSocket layer** | No tests for the WebSocket singleton, reconnection logic, or heartbeat | MEDIUM |
| **Authentication/JWT** | No tests for token refresh, singleton lock, backward compatibility | MEDIUM |
| **API routes** | Only 1 API integration test (config-snapshot). 23,349-line routes.ts has no route-level tests | HIGH — massive untested API surface |
| **Database migrations** | No migration tests. Schema validated at startup only | LOW-MEDIUM |
| **Error handling/recovery** | Health monitor tested at schema level but recovery actions are all placeholders | LOW |
| **Cross-browser compatibility** | Playwright only runs Chromium | LOW |

### 12.3 Legacy System Tests

Two test files test systems that have been confirmed as legacy:

| File | Tests | Legacy Status |
|------|-------|--------------|
| `diagnostic-system.test.ts` | Walter diagnostics, Bob inspection | Walter/Bob confirmed dead |
| `phase-6.0-simulations.test.ts` | Walter corpus, Bob identity, UX templates, knowledge refresh | Walter/Bob confirmed dead |

These tests are stale — they test deprecated systems and will either fail (if services are removed) or provide false confidence (if they pass by testing disconnected code).

---

## 13. Staleness Risk Assessment

### Schema Version Conflicts

Multiple tests pin specific schema versions. If the shared `SCHEMA_VERSION` constant has been bumped, older tests will fail:

| Test | Asserts | Risk |
|------|---------|------|
| `schema_v1_5.test.ts` | v1.5.0 | **HIGH** — other tests assert v1.5.2, v1.5.7, v1.5.8 |
| `cost_cache.test.ts` | v1.5.8 | LOW (likely current) |
| `net_expectancy.test.ts` | v1.5.7 | LOW-MEDIUM |
| `telemetry_persistence_sql.test.ts` | v1.5.2 | MEDIUM |

### Test Quality Concerns

| Issue | Files Affected | Impact |
|-------|---------------|--------|
| Re-defines validation logic inline instead of importing | `recalibration_integrity.test.ts` | Tests validate mock logic, not real code |
| Dynamic imports (`await import()`) | `tco-tec-tcl.test.ts`, `net_expectancy.test.ts`, others | Import path correctness only validated at runtime |
| Tests for deprecated Walter/Bob systems | `diagnostic-system.test.ts`, `phase-6.0-simulations.test.ts` | Will fail when Walter is removed |
| Auto test harness imports NLAI | `auto_test_harness.ts` | References deprecated NLAI system |
| Paper validation engine references DCE/GASP | `paper_validation_engine.ts` | References L-Series legacy systems |

---

## 14. Production Concerns

### 14.1 No Test Scripts in package.json

There are no `"test"` scripts defined. To run tests, a developer must know to invoke:
- `npx vitest` (unit/integration)
- `npx playwright test` (E2E)
- `tsx server/tests/system-verify.ts` (standalone scripts)

This means:
- New team members have no obvious entry point for running tests
- Build pipelines cannot use `npm test`
- No single command runs the full test suite

### 14.2 No CI/CD Integration

Without CI/CD pipelines, tests are not automatically run on:
- Pull requests
- Merge to main
- Pre-deployment
- Scheduled regression runs

Tests only run when a developer manually invokes them.

### 14.3 Test-Production Coupling

Since tests import real services (no mocks), integration and system tests require:
- A running PostgreSQL database with proper schema
- A running server at localhost:5000 (for HTTP tests and E2E)
- Network access to Kraken (for some validation scripts)

This makes tests difficult to run in isolation or in CI environments.

### 14.4 Diagnostic Reports as QA Artifacts

The 80+ diagnostic reports in `diagnostic-reports/` represent valuable QA history but are:
- Point-in-time artifacts (not regression tests)
- Not automatically re-generated
- Not verified against current code

---

## 15. Summary Statistics

| Metric | Value |
|--------|-------|
| Total test files | 60 |
| Total test lines (approx) | ~13,735 |
| Unit tests | 31 |
| Integration tests | 13 |
| System tests | 2 |
| Invariant tests | 1 |
| E2E tests | 3 (Playwright) |
| Standalone scripts | 4 |
| Other server tests | 6 |
| Frontend tests | **0** |
| Runtime validation services | 5 (REB 2.12, REB 2.15, Paper Validation, M3B, VTP) |
| Diagnostic services | 15+ |
| Diagnostic reports on disk | 80+ |
| Test frameworks | 2 (Vitest, Playwright) |
| Mocking framework usage | None |
| CI/CD pipelines | **0** |
| Test scripts in package.json | **0** |
| Code coverage reports | **0** (configured but never generated) |
| Pre-commit hooks | **0** |
| Frontend test coverage | **0%** |

---

## 16. Phase 10 Addendum — Kyle's Directives (2026-02-17)

> **Kyle's Final Verdict**: "Claude's Phase 10 audit is: Accurate. Grounded. Technically strong. Well-cataloged. Not inflated. But: It slightly overstates backend execution risk. It understates frontend blind spot. It understates legacy test contamination. It does not address unified QA architecture. Your backend math QA is elite-tier. Your frontend and API QA are light. Your runtime validation systems are extensive but fragmented."

### ADD-1: Legacy Test Suite Audit Required

**Directive**: Identify and tag all tests that reference deprecated systems: Walter, Bob, DCE, NGC, CWQI, NLAI.

**Decision required per test**: Remove / Archive / Refactor / Keep behind legacy flag.

**Rationale**: The current test suite has legacy contamination that will cause cascading failures when deprecated systems are removed in Waves 3, 4.7, and 6. A systematic audit should precede removal waves to prevent CI pipeline blockage (once CI is established per ADD-2).

**Affected test categories**:
- Walter/Bob direct imports: `diagnostic-system.test.ts`, `phase-6.0-simulations.test.ts`
- NLAI references: `auto_test_harness.ts`
- DCE/GASP references: `paper_validation_engine.ts`, `m3b-validation-service.ts`
- NGC/CWQI legacy metric assertions: tests that assert these fields do NOT exist (these are actually healthy — they're anti-regression tests)

**Important distinction**: Tests that assert legacy metrics are _absent_ (e.g., `directive-11.0E.2.test.ts` confirming NGC/CWQI removed from VTS interfaces) are **positive architectural guards**, not legacy contamination. These should be KEPT. Only tests that _import and exercise_ deprecated services should be removed/refactored.

### ADD-2: Create Unified Test Runner Script

**Directive**: Add standard test scripts to `package.json`:

```
"test:unit": "vitest run"
"test:e2e": "playwright test"
"test:all": "npm run test:unit && npm run test:e2e"
```

**Rationale**: Even without CI, standardize the entry point so developers can run `npm run test:unit` instead of discovering `npx vitest` themselves. This is a prerequisite for future CI integration.

### ADD-3: Frontend Test Introduction Plan

**Directive**: Establish minimum frontend test coverage for critical paths:

| Priority | Test Target | Why |
|----------|------------|-----|
| 1 | Auth token refresh flow | Core security — untested refresh singleton, backward compatibility |
| 2 | TradingModeContext | Cross-tab sync, query cache invalidation, mode persistence |
| 3 | `use-websocket` reconnection | WebSocket singleton, exponential backoff, heartbeat |
| 4 | TopBar start/stop flow | Primary user interaction with trading engine |

**Framework**: Install `@testing-library/react` + `@testing-library/jest-dom`. Configure Vitest for client-side tests (add `environment: 'jsdom'` config for `client/**/*.test.tsx`).

### ADD-4: Mark Standalone Scripts as QA Tools

**Directive**: Clarify in documentation that the 4 standalone test scripts (`diagnostic-system.test.ts`, `live-pricing-validation.ts`, `system-verify.ts`, `test-force-trade.ts`) are **operational validation tools**, not regression tests.

**Rationale**: These scripts require a running server and database. They serve a different purpose than framework-discoverable regression tests. Renaming or documenting them prevents confusion about what `vitest run` will and won't execute.

### ADD-5: Property-Based Testing for Core Math (Optional, High ROI)

**Directive**: Consider adding property-based tests (e.g., `fast-check`) for core mathematical invariants:

| Property | Invariant |
|----------|-----------|
| FinalScore | Always in [0, 1], deterministic for same inputs |
| VolNoise | Monotonic with respect to price variance |
| Covariance matrix | Positive semi-definite for all inputs |
| Regime classification | Deterministic — same metrics always produce same regime |

**Rationale**: The existing 7 math utility tests are strong but use fixed test vectors. Property-based testing would exercise edge cases and boundary conditions automatically across thousands of random inputs, catching subtle numerical issues.

---

*Phase 10 complete. Next: Phase 11 (Database Schema & Migrations).*


---

# Chapter 11: Database Schema & Migrations

## 1. Database Infrastructure Overview

| Component | Technology | Version | Config File |
|-----------|-----------|---------|-------------|
| **Database** | PostgreSQL (Neon Serverless) | — | `DATABASE_URL` env var |
| **ORM** | Drizzle ORM | ^0.39.1 | `server/db.ts` |
| **Schema Validation** | drizzle-zod | ^0.7.0 | `shared/schema.ts` |
| **Migration Tool** | Drizzle Kit | ^0.31.4 | `drizzle.config.ts` |
| **Connection Pool** | @neondatabase/serverless | ^0.10.4 | `server/db.ts` |
| **WebSocket Transport** | ws | ^8.18.0 | `server/db.ts` |
| **Vector Extension** | pgvector | — | Used for `semantic_memory.embedding` |

### Connection Configuration

**File**: `server/db.ts` (16 lines)

```
neonConfig.webSocketConstructor = ws;  // WebSocket for Neon serverless
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle({ client: pool, schema });
```

- **Pool type**: Neon Serverless Pool (built-in connection pooling for edge/serverless)
- **No explicit pool settings**: max connections, idle timeout, etc. are all Neon defaults
- **Single export**: `db` instance used throughout the application
- **No pool monitoring**: Pool stats are not exposed to the health monitor (health monitor checks DB via query, not pool metrics)

### Architecture: Single-Tenant with Mode Isolation

- **Single-tenant**: One user, one database instance. `user_id` columns removed from 5 operational tables (Phase 2C migration)
- **Mode isolation**: `trading_mode` enum (`live` | `paper`) separates data at the row level. Most trading tables have a `mode` column with unique indexes enforcing one-row-per-mode for config tables
- **globalContextId**: Present in several tables with default `"default"` — remnant of an earlier multi-context architecture, now vestigial

---

## 1.5 Recent schema additions — decision-provenance (B-NEW-53, 2026-06-07)

**`signal_eval_provenance`** — a new append-only telemetry table added by B-NEW-53 (decision-provenance capture; deploy `b1dbb2c43` xStock + `0350cbc69`/`c2573cb93` crypto-enable). It is the forward fix for the backward-replay wall that three Phase-24 calibration studies hit (W2.0a / RI-a / W2.0b): the engine's exact decision-time inputs were never persisted, so no backward replay reproduced a live decision to ≥99%.

- **Shape:** a **1:1 sibling of `signal_eval_archive`** (keyed on `captured_at, archive_id`; partitioned; ~90-day retention, same as the archive). One provenance row per archived signal evaluation.
- **What it captures (the irreducible decision inputs):** the in-progress **forming bar BY VALUE** (the bar the decision was made on, which is never otherwise persisted), a **reference to the settled bar-set** (symbol + as-of bucket — the settled bars are already in `*_ohlc_*_snapshot`, so this is a hash-and-reference, not 240 bars/row), the **resolved stop/target** levels, and a **constants hash** of the `module_constants` values used. RI-a's stop-anchor-persistence gap is unified into this same write (one provenance row satisfies both the detect-input gap and the stop-anchor gap).
- **Written at:** the four `eval-cycle` hooks (via `decision-provenance.ts` + an archive-id allocator).
- **Consumed by:** the Phase-25 decision-replay / entry-trigger studies (roadmap 25-12/13/14/15). A `7362f63f` §10.5 proof-of-capture alert (2026-07-05) re-surfaces the entry-trigger sweep once enough rows accrue.
- **Runtime-proven:** xStock 36,531/36,531 archive↔provenance rows = 100% coverage (real `forming_bar_ts`, 9 constants hashes); crypto 100% live after the `OHLCCandle.time-is-SECONDS` NaN hotfix (`c2573cb93`).

Full component-level dependency detail (the table, `decision-provenance.ts`, the archive-id allocator, all four hooks, and the admitted-`features` B-NEW-53.1/53.2 fixes) is in `SYSTEM_IMPACT_MAP.md` near line 1576.

---

## 2. Schema File Statistics

**File**: `shared/schema.ts` — **4,836 lines**

| Metric | Count |
|--------|-------|
| Tables (pgTable) | ~160 |
| Enum definitions (pgEnum) | ~80 |
| Insert schemas (createInsertSchema) | ~60 |
| Type exports (z.infer + $inferSelect) | ~120 |
| Relations definitions | 14 |
| Indexes (total) | ~200+ |
| Vector columns (pgvector) | 1 (`semantic_memory.embedding`, 1536 dimensions) |
| JSON columns (jsonb) | ~50+ |

---

## 3. Table Classification — Active vs. Legacy

### Tier 1: Core Trading Pipeline (ACTIVE) — ~35 tables

These tables serve the canonical paper/live trading flow:

| Table | Purpose | Key Columns | Mode Isolated |
|-------|---------|-------------|---------------|
| `users` | Auth, roles, preferences | id (UUID), username, email, tradingMode, tradingStatus, userRole, approvalMatrix (jsonb) | N (single user) |
| `trading_settings` | Per-user trading config | ~45 columns, FK to users, uniqueIndex(userId) | Y |
| `guardrails_v2` | Risk management (active version) | ~25 columns, uniqueIndex(mode) | Y |
| `screener_filters` | FX5 filter configuration | ~25 columns, uniqueIndex(mode), 4 jsonb columns | Y |
| `strategy_settings` | Per-strategy parameters | uniqueIndex(contextId, mode, strategy), params (jsonb) | Y |
| `strategy_settings_audit` | Strategy change history | prevParams/nextParams (jsonb) | Y |
| `watchlist_pairs` | Active watchlist | unique(mode, symbol) | Y |
| `trading_signals` | Signal detection log | 3 indexes, metadata (jsonb) | Y |
| `trades` | Live/paper trade records | 22 columns, 2 indexes, metadata (jsonb) | Y |
| `portfolio_state` | Balance tracking | uniqueIndex(contextId, mode) | Y |
| `paper_sim_trades` | Paper simulation trades | ~30 columns, 4 indexes | Y (paper only) |
| `paper_sim_open_positions` | Open paper positions | ~25 columns, uniqueIdx on symbol | Y (paper only) |
| `paper_sim_trade_logs` | Paper trade event log | 3 indexes, metadata (jsonb) | N |
| `paper_sim_sessions` | Paper session management | 3 indexes, metadata (jsonb) | N |
| `rtb_signals` | Ready-to-Brief signal queue | ~25 columns, 5 indexes | Y |
| `execution_attempt_audit` | Execution decision log | 14 columns, 5 indexes, executionDecision/blockReason enums | Y |
| `system_context` | Engine state / LATTI | ~25 columns, 3 indexes, extensive defaults | Y |
| `telemetry_history` | Signal telemetry persistence | 14 columns, 4 indexes, marketRegime enum | Y |
| `adaptive_learning` | Adaptive weight persistence | weights/metadata (jsonb), marketRegime enum | Y |
| `daily_performance_summary` | Performance tracking | 3 indexes | Y |
| `screener_results` | Screener output | uniqueIndex(mode, scannedAt) | Y |
| `system_settings` | Key-value system config | PK = varchar(key), FK to users | N |
| `system_config` | System flags (jsonb typed) | systemFlags with passiveLearning flag | N |
| `config_registry` | Runtime config | unique(key), value (jsonb) | N |
| `goals_presets` | Goal configuration | uniqueIndex(mode, name), goalsPresetName enum | Y |
| `goals_learning_metrics` | Goal learning metrics | index(mode, date) | Y |
| `goals_live` / `goals_paper` | Goal state per mode | 7 columns each | Y (separate tables) |
| `goal_audit_log` | Goal change history | 8 columns | N |
| `safety_telemetry` | Safety guardrail checks | 14 columns | N |
| `telemetry_lineage` | Data flow lineage | 6 columns | N |
| `kill_switch_events` | Kill switch history | 12 columns | N |
| `error_logs` | Error diagnosis | 10 columns | N |
| `system_alerts` | System alerts | 10 columns | N |

### Tier 2: Walter AI Assistant — 10 tables (LEGACY per Wave 3)

| Table | Purpose | Lines |
|-------|---------|-------|
| `walter_chats` | Chat sessions | 939-953 |
| `walter_pending_approvals` | Approval queue | 956-979 |
| `walter_chat_logs` | Messages | 982-993 |
| `walter_approvals_audit` | Approval history | 996-1009 |
| `walter_execution_log` | Action execution | 1012-1038 |
| `walter_purpose` | Walter purpose config | 1041-1051 |
| `walter_memory` | Memory store | 1054-1069 |
| `walter_user_preferences` | UI preferences | 1072-1082 |
| `walter_actions` | Autonomous actions | 1087-1139 |
| `execution_config` | Auto-execution config | 1142-1158 |

All 10 Walter tables have FK relationships to `users`. These tables will become dead when the Walter backend is removed in Wave 3.

### Tier 3: AI Analytics & Reports — 14 tables (ACTIVE)

| Table | Purpose |
|-------|---------|
| `ai_reports` | AI-generated reports |
| `ai_conversations` | AI chat sessions |
| `ai_chat_logs` | Chat message/token tracking |
| `conversation_summaries` | Conversation compression |
| `response_cache` | API response cache |
| `semantic_memory` | Vector embeddings (pgvector, 1536d) |
| `ai_market_analyses` | Market regime classification |
| `ai_opportunity_runs` | Opportunity batch runs |
| `ai_opportunities` | AI-generated trade opportunities |
| `daily_briefs` | Daily narrative summaries |
| `ai_audit_log` | GPT action audit |
| `ai_transparency_log` | Scheduler transparency |
| `ai_orchestrator_logs` | AI orchestrator |
| `context_chats` | Context-tab chats |

### Tier 4: L-Series Cognitive Architecture — ~32 tables (LEGACY)

**Phases 8.6–10.0**: These tables represent an aspirational multi-agent cognitive system that was designed but likely never fully populated:

| Phase | Tables | System |
|-------|--------|--------|
| 8.6.3 | `data_lineage`, `bob_trace_log` | Provenance, Bob module traces |
| 8.7.2-8.7.4 | `intent_audit_log`, `context_bridge_log` | Intent execution, WebSocket bridge |
| 8.8.1-8.8.4 | `reasoning_trace`, `reasoning_queue`, `memory_audit_log`, `cognitive_tuning_log` | Reasoning orchestrator, memory lifecycle, cognitive tuning |
| 8.9.1-8.9.4 | `autonomy_audit_log`, `meta_reasoning_log`, `awareness_state_log` | Autonomy, meta-reasoning, awareness |
| 9.0 | `experience_memory_log`, `alignment_policies`, `alignment_audit_log`, `goal_alignment_profile` | Experience memory, alignment |
| 9.2 | `strategic_plan_log`, `learning_weight_profile` | Strategic planning, learning weights |
| 9.3 | `strategic_simulation_log`, `decision_trace_log`, `strategic_memory_snapshot` | Simulations, decision traces |
| 9.4 | `reflection_log`, `decision_quality_audit` | Self-reflection, decision quality |
| 9.5 | `value_alignment_matrix` | Value alignment |
| 9.6 | `collaboration_sessions`, `collaboration_messages`, `consensus_snapshots` | Cross-domain collaboration |
| 9.7 | `agent_learning_feedback` | Agent feedback |
| 9.8 | `meta_cognition_log` | Meta-cognition |
| 9.9 | `strategic_memory_archive`, `model_calibration_log` | Long-term memory, calibration |
| 10.0 | `cognitive_core_state`, `agent_registry` | Cognitive core, agent registry |

### Tier 5: Safety, Ethics & Governance — ~16 tables (LEGACY)

**Phases 11–16**: An aspirational governance framework:

| Phase | Tables | System |
|-------|--------|--------|
| 11.0 | `safety_policy`, `safety_event_log`, `kill_switch` (Phase 11) | Safety guardrails (not the active kill_switch_events) |
| 13.0 | `ethical_principle`, `ethical_violation_log` | Ethical principles |
| 14.0 | `federated_ethics_state`, `cross_agent_ethics_session`, `ethics_conflict_register`, `ethics_propagation_journal` | Federated ethics |
| 15.0 | `bias_observation_log`, `confidence_drift_log`, `introspection_report`, `bias_correction_log` | Bias detection, introspection |
| 16.0 | `knowledge_retrieval_log`, `knowledge_cache`, `knowledge_trust_record` | Knowledge management |

### Tier 6: Distributed Cluster — 9 tables (LEGACY)

**Phases 17–18**: A distributed multi-node architecture:

| Table | Phase | Purpose |
|-------|-------|---------|
| `cluster_node` | 17.0 | Node registry |
| `cluster_task_queue` | 17.0 | Task queue |
| `cluster_result_log` | 17.0 | Result tracking |
| `cluster_bus_event` | 17.0 | Event bus |
| `cluster_circuit_breaker` | 17.5 | Circuit breaker |
| `cluster_audit_log` | 17.6 | Gate audit |
| `agent_learning_delta` | 18 | Learning deltas |
| `model_consistency_snapshot` | 18 | Model consistency |
| `cross_node_alignment_log` | 18 | Cross-node alignment |

### Tier 7: Paper-Specific Duplicates — 3 tables (LEGACY)

| Table | Status | Superseded By |
|-------|--------|--------------|
| `paper_trades` | Explicitly marked legacy (line 1226 comment) | `trades` table with mode column |
| `paper_daily_briefs` | Duplicate | `daily_briefs` with mode |
| `paper_ai_reports` | Duplicate | `ai_reports` |

### Tier 8: Other Active Tables — ~20 tables

Tuning, actuation, strategy drive, learning, behavioral, oversight, audit, expert context — these are actively used by the tuning engine, strategy drive system, and expert context modules.

---

## 4. Legacy Table Count Summary

| Category | Table Count | Status |
|----------|------------|--------|
| Core Trading (active) | ~35 | ACTIVE |
| Walter (Wave 3 removal) | 10 | LEGACY |
| AI Analytics (active) | 14 | ACTIVE |
| L-Series Cognitive (Phases 8.6-10.0) | ~32 | LEGACY (aspirational) |
| Safety/Ethics/Governance (Phases 11-16) | ~16 | LEGACY (aspirational) |
| Distributed Cluster (Phases 17-18) | 9 | LEGACY (aspirational) |
| Paper-Specific Duplicates | 3 | LEGACY |
| Tuning/Strategy/Learning/Expert (active) | ~20 | ACTIVE |
| `guardrails` (V1, superseded by V2) | 1 | LEGACY |
| **TOTAL** | **~160** | **~71 legacy (~44%)** |

**~71 tables (~44% of total) serve deprecated or aspirational systems that are not part of the canonical trading pipeline.** These tables exist in the schema definition and presumably in the database, consuming storage and adding DDL complexity. **Important nuance**: Not all legacy tables are fully inert — some (e.g., Walter tables, certain L-Series tables) may still have active writers from background services or lazy-loaded modules that have not been disconnected. These should be classified as "Deprecated — Removal Required" (still written to) rather than "Inert — Safe to Drop" (confirmed zero writers). A pre-drop audit must verify zero active writers for each table before removal.

---

## 5. Enum Definitions (~80 pgEnum)

### Core Trading Enums (actively used)

| Enum | Values | Used By |
|------|--------|---------|
| `tradingModeEnum` | live, paper | Most tables |
| `tradingStatusEnum` | active, stopped | users |
| `strategyTypeEnum` | vwap_pullback, abcd_long, sma_trend_ride, breakout, mean_reversion, range_trading, vwap_bounce, liquidity_trap, dhma | trades, signals, strategy_settings |
| `tradeStatusEnum` | open, closed, cancelled | trades |
| `tradeTypeEnum` | buy, sell | trades |
| `signalTypeEnum` | QUANT, PATTERN, HYBRID | rtb_signals, trades |
| `patternTypeEnum` | PINBAR, ENGULFING, INSIDE_BAR, MORNING_STAR, THREE_SOLDIERS | rtb_signals, trades |
| `rtbSignalStatusEnum` | queued, promoted, expired, rejected, reconfirmed, active | rtb_signals |
| `executionDecisionEnum` | OPENED, BLOCKED | execution_attempt_audit |
| `executionBlockReasonEnum` | KILL_SWITCH, NO_STOP_LOSS, ... (13 values) | execution_attempt_audit |
| `marketRegimeEnum` | EXTREME_NOISE, BULL_STABLE, BULL_VOLATILE, BEAR_STABLE, BEAR_VOLATILE, LOW_VOL_CHOP | telemetry_history |
| `userRoleEnum` | owner, editor, admin, trader, viewer | users |
| `goalsPresetNameEnum` | conservative, baseline, optimistic, maximum, custom | goals_presets |

### Walter Enums (legacy)

| Enum | Values | Status |
|------|--------|--------|
| `walterActionTypeEnum` | feed_reconnect, feed_pause, formula_recalc, cache_refresh, health_check, threshold_adjust, auto_suppress, escalate | LEGACY (Wave 3) |
| `walterActionStatusEnum` | pending, in_progress, completed, failed, acknowledged, approved, rejected | LEGACY (Wave 3) |
| `walterActionCategoryEnum` | feed, formula, system, risk, performance | LEGACY (Wave 3) |

### L-Series / Cognitive Enums (~40, all LEGACY)

Phases 8.x through 18 define approximately 40 enums for the cognitive architecture, ethics, governance, and distributed cluster systems. These include: `agentStateEnum`, `reflectionDepthEnum`, `biasTypeEnum`, `knowledgeSourceEnum`, `federatedScopeEnum`, `consensusStateEnum`, `collaborationRoleEnum`, `learningDeltaTypeEnum`, `alignmentStrategyEnum`, `domainChannelEnum`, and many more.

**All ~40 L-Series enums are legacy** — they exist in the database but have no active producers.

---

## 6. Migration Infrastructure

### Migration Directories (Dual — FINDING)

Two separate migration directories exist:

| Directory | Files | Tracked By | Purpose |
|-----------|-------|-----------|---------|
| `migrations/` | 4 files + journal | Drizzle Kit v7 journal (`meta/_journal.json`) | Primary migrations (initial schema + incremental) |
| `drizzle/migrations/` | 5 files | **No journal** — manually numbered | Secondary directive-based migrations |

### Migration Files

**Primary (`migrations/`)**:

| File | Size | Content |
|------|------|---------|
| `0000_flaky_freak.sql` | 162 KB | Initial schema — all tables, 70+ enums, indexes. Single massive DDL file. |
| `0001_familiar_pete_wisdom.sql` | 4 KB | RTB signals table, pattern recognition columns, signal type additions |
| `2025-11-06_single_tenant.sql` | 2 KB | Drops user_id from 5 operational tables, adds mode-based indexes |
| `2025-11-06_value_alignment_mode.sql` | 3 KB | Adds mode column with NOT NULL migration pattern |

**Secondary (`drizzle/migrations/`)**:

| File | Size | Content |
|------|------|---------|
| `2026-11-0G-schema-hardening.sql` | 3 KB | Directive 11.0G: hybrid_score, decay_penalty columns |
| `2026-11-0H-add-pool-to-telemetry.sql` | 594 B | Directive 11.2 R1: pool column on telemetry_history |
| `2026-11-0J-telemetry-sizes.sql` | 559 B | Telemetry sizing adjustments |
| `2026-11-1A-persistent-intelligence.sql` | 4 KB | Directive 11.1A: marketRegimeEnum + telemetry_history table |
| `2026-11-1B-adaptive-learning.sql` | 1.4 KB | Adaptive learning enhancements |

### Migration Management

- **Primary method**: `drizzle-kit push` (pushes schema directly to database — no migration files generated)
- **Migration journal**: Only 2 entries tracked in `_journal.json` (0000 and 0001). The 2025 date-based files and all `drizzle/migrations/` files are NOT in the journal
- **No down migrations**: No rollback files exist. Migrations are forward-only
- **No migration runner in code**: The server does not run migrations on startup. `drizzle-kit push` is the sole mechanism
- **`db:push` script**: The only migration-related npm script

### Migration Concerns

1. **Dual directories**: `migrations/` and `drizzle/migrations/` create confusion about which is canonical
2. **Untracked migrations**: 7 of 9 migration files are not in the Drizzle Kit journal
3. **Push-based workflow**: `drizzle-kit push` compares schema.ts to live DB and pushes changes directly — no review step, no staging
4. **No rollback capability**: Forward-only migrations with no `down()` functions
5. **162 KB initial migration**: The initial schema DDL is a single massive file, making it hard to audit what was in the original schema vs. what was added later

---

## 7. Primary Key Strategies

| Strategy | Usage | Tables |
|----------|-------|--------|
| `varchar(UUID).default(gen_random_uuid())` | ~90% of tables | Most tables |
| `serial` (auto-increment) | ~8 tables | aiOrchestratorLogs, contextChats, lattiBaselineHistory, auditLog, behavioralLog, learningHistory, lottieOversightLog, strategyMixLog |
| `varchar(key)` (natural key) | 1 table | systemSettings |
| `varchar("global_kill_switch")` | 1 table | kill_switch (Phase 11) |

The predominant UUID strategy is good for distributed systems but generates non-sequential keys, which can cause B-tree index fragmentation on PostgreSQL. This is mitigated by Neon's serverless architecture.

---

## 8. Column Type Patterns

| Type | Usage | Notes |
|------|-------|-------|
| `varchar` | IDs, enums, status, symbols | Most common |
| `text` | Long-form content | Narratives, reasons, messages |
| `decimal(precision, scale)` | Financial values | `(20, 8)` for prices, `(5, 4)` for percentages |
| `doublePrecision` | Scores, ratios | Used in later phases (9.x+) instead of decimal |
| `integer` | Counts, thresholds | Limits, trade counts |
| `boolean` | Flags | Toggles, status |
| `jsonb` | Structured metadata | ~50+ columns across all tables |
| `timestamp with timezone` | All time fields | Universal pattern via `{ withTimezone: true }` |
| `date` | Calendar dates | Goals, briefs, reports |
| `text[].array()` | Tag lists | Filter arrays, domain lists |
| `vector(1536)` | OpenAI embeddings | 1 column in semantic_memory |

### Financial Precision

Trading-related tables consistently use `decimal(20, 8)` for prices and quantities, and `decimal(10, 4)` for percentages. This provides 8 decimal places for crypto prices (necessary for BTC sub-satoshi precision) and 4 decimal places for percentage calculations.

**Concern**: Later-phase tables (9.x+) use `doublePrecision` instead of `decimal` for scores and ratios. `doublePrecision` is a floating-point type subject to rounding errors, while `decimal` is exact. For financial calculations, this inconsistency could cause subtle precision issues if double-precision scores flow into decimal-precision trade calculations.

---

## 9. JSON Column Usage

Approximately 50+ columns use `jsonb` across the schema. Key patterns:

| Table | Column | Typed? | Content |
|-------|--------|--------|---------|
| `users` | `approvalMatrix` | No | 15-line default JSON object with approval categories |
| `screener_filters` | `quoteCurrencies`, `activeTimeframes`, `filterOverrides`, `lockedByUser` | No | Array and object filters |
| `strategy_settings` | `params` | No | Strategy-specific parameters |
| `system_context` | `metadata`, `lastSafeState` | No | Engine state snapshots |
| `system_config` | `systemFlags` | **Yes** (`$type<{passiveLearning?: boolean}>`) | Typed JSON — rare pattern |
| `config_registry` | `value` | No | Arbitrary config values |
| `telemetry_history` | `metadata` | No | Signal telemetry context |

**Observation**: Only 1 of ~50 jsonb columns uses Drizzle's `$type<>()` for TypeScript type safety. The rest are untyped `jsonb`, meaning their contents are only validated at the application layer (if at all), not at the ORM/compile level.

---

## 10. Relationship Definitions

14 Drizzle `relations()` are defined (lines 1943–2117), all centered around the `users` table:

```
users → one-to-many → tradingSettings, aiReports, aiConversations, killSwitchEvents,
                       aiOpportunityRuns, aiOpportunities, dailyBriefs, paperDailyBriefs,
                       paperAIReports, learningSources, signalWeights, predictionOutcomes,
                       walterPendingApprovals, walterChats, walterChatLogs, walterApprovalsAudit
```

**Missing relations**: The vast majority of tables (~145 of ~160) have NO Drizzle relations defined. This means:
- Drizzle's relational query API (`db.query.users.findMany({ with: { trades: true } })`) is not available for most tables
- Joins must be done manually using Drizzle's `leftJoin`/`innerJoin` API
- The actual FK relationships exist at the database level (via `.references()`) but are not exposed to the ORM's relational API

---

## 11. Database Monitoring

**File**: `server/services/database-monitor.ts` (77 lines)

| Setting | Value |
|---------|-------|
| Check interval | 24 hours |
| Warning threshold | 6.5 GB (65% of 10 GB Neon limit) |
| Critical threshold | 8 GB (80% of 10 GB limit) |
| Query | `pg_database_size(current_database())` |
| Storage | Logs to `database_size_logs` table |

The 10 GB limit is a Neon free/starter tier constraint. With ~71 legacy tables potentially accumulating data, monitoring database growth is important.

---

## 12. Startup Invariant Checks

**File**: `server/startup/invariants.ts` (59 lines)

At server boot, `assertSingleTenantDB()` queries `information_schema.columns` to verify that `user_id` columns do NOT exist in the 5 operational tables:
- `portfolio_state`
- `strategy_settings`
- `paper_sim_sessions`
- `system_context`
- `trading_settings_legacy`

If any `user_id` column is found, the server throws a `SingleTenantViolation` error and refuses to start. This is a runtime architectural guard.

**Note**: AI, Walter, audit, and backup tables intentionally KEEP `user_id` for historical data (per comment in code).

---

## 13. Data Access Layer

**File**: `server/storage.ts` — **4,580 lines**

The storage layer is a monolithic service class that wraps all Drizzle ORM operations. It provides typed CRUD methods for every table, organized by domain:

- **Portfolio management** (live/paper modes)
- **Trading signals and orders**
- **Strategy settings and audit**
- **Goals presets and learning metrics**
- **AI reports, conversations, and transparency**
- **Walter chats, approvals, and execution**
- **Telemetry persistence with checksums**
- **System context and configuration**
- **Diagnostic and audit logging**

At 4,580 lines, `storage.ts` is the **third-largest file in the codebase** (after `routes.ts` at 23,349 and `schema.ts` at 4,836).

### Storage Layer Concerns

1. **Monolithic**: Single file with all data operations for all domains
2. **Limited transaction usage**: Transactions exist in the codebase but are limited — most operations are individual queries without multi-table transactional guarantees. Critical financial paths (trade execution, position updates) should be verified for proper transaction wrapping.
3. **Walter methods still present**: Storage methods for Walter tables will become dead code on Wave 3 removal
4. **No connection pool tuning**: Uses Neon defaults without explicit pool size or timeout configuration
5. **Storage layer coupling risk**: storage.ts must be modularized BEFORE legacy tables are dropped. Dropping tables while storage methods still reference them will cause runtime errors. The safe order is: (1) modularize storage.ts → (2) remove legacy storage methods → (3) drop tables from schema → (4) drop tables from database.

---

## 14. Production Concerns

### 14.1 Schema Bloat — 71 Legacy Tables

Approximately 44% of tables serve deprecated or aspirational systems. These tables:
- Consume database storage (even if empty, they have DDL overhead)
- Add complexity to the schema file (4,836 lines)
- Have corresponding enum definitions (~40 legacy enums) that cannot be dropped while tables exist
- May accumulate stale data if any background processes write to them

### 14.2 No Database Pruning Strategy

There is no mechanism to:
- Archive old data from active tables (telemetry, signals, logs grow unbounded)
- Drop legacy tables safely
- Identify which tables have zero rows (to confirm they're truly dead)

Given the 10 GB Neon limit, this is a capacity planning concern.

### 14.3 Push-Based Migration Workflow

`drizzle-kit push` applies schema changes directly to the live database without:
- A review/approval step
- A staging environment
- Migration versioning (the journal only tracks 2 of 9 files)
- Rollback capability

This is acceptable for a single-developer project but becomes risky as the codebase matures.

### 14.4 Mixed Numeric Types for Financial Data

Active trading tables use `decimal` (exact arithmetic), but later-phase tables use `doublePrecision` (floating-point). If data flows between these table types, precision loss could occur. A standardization pass should enforce `decimal` for all financial/scoring values and reserve `doublePrecision` only for non-financial floating-point data (e.g., ML features, probabilities where exact precision is not required).

### 14.5 Index Usage Review — ~200+ Indexes Without Audit

The schema defines over 200 indexes across ~160 tables. No index usage review has been performed. In PostgreSQL, unused indexes consume storage, slow down writes (every INSERT/UPDATE/DELETE must maintain the index), and increase vacuum overhead. A `pg_stat_user_indexes` audit should identify:
- Indexes with zero scans (candidates for removal)
- Duplicate or overlapping indexes (e.g., single-column index + composite index starting with the same column)
- Missing indexes on high-cardinality query patterns
- Legacy table indexes that will be dropped with their tables but currently waste I/O

### 14.6 No Table Partitioning for Append-Only Tables

Several high-volume append-only tables would benefit from time-based partitioning:
- `telemetry_history` — continuous signal telemetry, grows with every cycle
- `paper_sim_trade_logs` — every trade event logged
- `execution_attempt_audit` — every execution decision logged
- `safety_telemetry` — guardrail check results
- `error_logs` — diagnostic errors
- `ai_audit_log`, `ai_transparency_log` — AI action audit trails

Without partitioning, these tables will become large monolithic heaps where queries on recent data must scan entire tables. Time-based partitioning (e.g., monthly) would enable efficient queries on recent data, simpler data retention (drop old partitions), and faster vacuum operations.

### 14.7 Migration Drift — Schema Cannot Be Rebuilt from History

The current migration state has a fundamental integrity issue: the database schema **cannot be reconstructed** from migration history alone. The initial migration (`0000_flaky_freak.sql`, 162 KB) captures the schema at one point, but subsequent changes were applied via `drizzle-kit push` without generating migration files. The 7 untracked migration files were applied manually. This means:
- A fresh database cannot be reliably set up by replaying migrations
- There is no way to verify what schema version is running on a given database
- Disaster recovery requires a full pg_dump, not migration replay
- **Recommendation**: Perform a migration rebaseline — generate a fresh "baseline" migration from the current schema.ts state that captures the full current schema. This becomes the new `0000` and all previous migration files are archived.

### 14.8 Enum Proliferation — ~80 Enum Types

PostgreSQL enum types (`CREATE TYPE ... AS ENUM`) are schema-level objects. With ~80 enums defined, ~40 of which are legacy:
- Enums cannot be dropped while any table column references them (even if the table is empty)
- Adding values to enums requires `ALTER TYPE ... ADD VALUE` (no transaction rollback)
- Removing values from enums requires dropping and recreating the type
- Legacy enums for the L-Series cognitive system (agentStateEnum, reflectionDepthEnum, etc.) add clutter to the type catalog
- **Drop order**: Tables first, then enums — this is already captured in the deprecation plan but bears repeating as an operational constraint

### 14.9 LATTI Residual Fields in system_context

The `system_context` table contains fields that appear to be remnants of the LATTI (Latent Attention Through Transparent Intent) system, which Kyle confirmed as deprecated. These include fields with extensive defaults related to engine state, coherence tracking, and attention management. While the `system_context` table itself is active (it stores engine state and trading mode), LATTI-specific fields within it are dead weight. These should be identified and removed as part of Wave 6 or a dedicated cleanup pass.

### 14.10 No Data Retention Policy

There is no defined data retention policy for any table. Every row ever written is preserved indefinitely. For a 10 GB database limit, this is unsustainable. A retention policy should define:
- **Hot tier** (0–30 days): Full fidelity, all tables
- **Warm tier** (30–90 days): Aggregate summaries, prune individual telemetry/log rows
- **Cold tier** (90+ days): Archive to file-based storage or delete
- Tables exempt from retention: `users`, `trading_settings`, `guardrails_v2`, `strategy_settings` (configuration, not logs)

---

## 15. Summary Statistics

| Metric | Value |
|--------|-------|
| Schema file | `shared/schema.ts` (4,836 lines) |
| Total tables | ~160 |
| Active tables | ~89 (~56%) |
| Legacy tables | ~71 (~44%) |
| Walter tables | 10 (Wave 3 removal) |
| L-Series cognitive tables | ~32 (aspirational, likely empty) |
| Ethics/governance tables | ~16 (aspirational, likely empty) |
| Cluster tables | 9 (aspirational, likely empty) |
| Paper duplicate tables | 3 (superseded) |
| Enum definitions | ~80 |
| Legacy enums | ~40+ |
| Migration files | 9 (across 2 directories) |
| Tracked migrations | 2 (in journal) |
| Storage layer | `server/storage.ts` (4,580 lines) |
| Database limit | 10 GB (Neon) |
| Connection pool | Neon serverless defaults |
| FK cascade deletes | Selective (6 tables) |
| Vector columns | 1 (semantic_memory, 1536d HNSW) |

---

---

## 16. Phase 11 Addendum — ChatGPT Feedback Integration

**Received**: 2026-02-17
**Source**: ChatGPT grounded review of Phase 11 findings

### Corrections Applied

1. **"71 legacy tables" nuance** — Not all legacy tables are fully inert. Some (Walter tables, certain L-Series tables) may still have active writers from lazy-loaded background services. Corrected classification from "no active producers or consumers" to "Deprecated — Removal Required" vs. "Inert — Safe to Drop" distinction. Pre-drop audit must verify zero active writers.

2. **"No transactions" overstatement** — Transactions exist in the codebase but are limited. Corrected from "No transaction patterns observed" to "Limited transaction usage." Critical financial paths should be verified for proper transactional wrapping.

3. **Decimal vs. doublePrecision standardization** — Added recommendation for a type standardization pass. `decimal` for all financial/scoring values, `doublePrecision` reserved for non-financial ML features only.

### Findings Added per ChatGPT Recommendations

4. **Index usage review (Section 14.5)** — ~200+ indexes with no usage audit. Unused indexes waste storage and slow writes. Recommend `pg_stat_user_indexes` audit.

5. **Table partitioning (Section 14.6)** — Append-only tables (telemetry_history, paper_sim_trade_logs, execution_attempt_audit, etc.) need time-based partitioning for retention and performance.

6. **Migration rebaseline (Section 14.7)** — Schema cannot be reconstructed from migration history. Recommend generating a fresh baseline migration from current schema.ts.

7. **Enum proliferation (Section 14.8)** — ~80 enum types, ~40 legacy. Drop order constraint: tables first, then enums.

8. **LATTI residual fields (Section 14.9)** — system_context table contains deprecated LATTI fields that should be identified and removed.

9. **Data retention policy (Section 14.10)** — No retention policy defined for any table. Unsustainable given 10 GB limit. Hot/warm/cold tier model recommended.

10. **Storage layer coupling (Section 13)** — Added critical ordering constraint: modularize storage.ts BEFORE dropping legacy tables. Safe order: modularize → remove methods → drop schema → drop tables.

### ChatGPT's Strategic Cleanup Phases (Endorsed)

ChatGPT recommended a 5-phase database cleanup strategy, which aligns with and extends the existing wave-based deprecation plan:

- **Phase A (Isolation)**: Confirm which legacy tables still have active writers. Tag each as "inert" or "deprecated-with-writers."
- **Phase B (Modularization)**: Split storage.ts into domain-specific modules. Decouple storage from schema before removals.
- **Phase C (Schema Simplification)**: Drop legacy tables in wave order (3 → 6 → 10). Remove ~40 legacy enums. Clean dead schema.ts definitions.
- **Phase D (Migration Rebaseline)**: Generate fresh baseline migration. Archive old migration files. Switch from `drizzle-kit push` to `drizzle-kit generate` + `drizzle-kit migrate`.
- **Phase E (Index & Retention Hygiene)**: Audit index usage via `pg_stat_user_indexes`. Drop unused indexes. Implement time-based retention policies. Consider partitioning for high-volume append-only tables.

---

*Phase 11 complete (with addendum). This is the final phase of the 11-phase systematic audit.*

---

# Appendix B63: Strong-Trend Lane Architecture & Global DBS Store (2026-04-21)

This appendix documents the architectural additions shipped in B63 Items 10-14 + 16. These are now first-class concepts in the system and should be treated as architecture, not batch-specific tuning.

## B63.1 Strong-Trend Lane as a First-Class Concept

**What changed:** the strong-trend routing lane (`sourcePool === 'quant-strong_trend'`) is no longer just a family path — it carries its own ROUTING-CONTEXT CONTRACT that downstream components inherit. Two properties of the contract:

1. **Geometry override (B63 Item 12)** — `TechnicalIndicators.strongTrendGeometryOverride: { stopAtrMultiplier, targetAsRMultiple }` is attached to indicators by `vts-runner.ts` when a pair routes through this lane. Detectors that consume it apply the override in place of their default geometry. Detectors that don't consume it (like `strong_bull_trend` with locked native 3×ATR/6×ATR) simply ignore the field.

2. **Mode-overlay bypass (B63 Item 14)** — `vts-runner.ts` and `paper-execution-engine.ts` both check `sourcePool === 'quant-strong_trend'` and skip mode-overlay multipliers when true. Reversal/continuation archetypes retain mode-overlay behavior as designed; the bypass is scoped exclusively to the strong-trend lane.

**Design rationale:** future strategies promoted into this lane inherit both contracts automatically. Adding a new strategy to `MULTI_FAMILY_ELIGIBILITY[strategyKey] = [...'strong_trend']` and having its detect function read `indicators.strongTrendGeometryOverride` is the ONE thing that needs to happen — routing and mode-overlay bypass are handled at the lane level, not per-strategy.

**Multi-strategy lane arbitration (B63 Item 11):** when more than one strategy in the lane fires same-pair same-cycle, first-claim-wins. The second strategy to attempt opening a trade returns `null` with reason `strong_trend_lane_conflict` (distinct from the existing per-strategy `duplicate_position` reason). Implementation: pre-open guard in `vts-runner.ts` immediately above the Batch 19G duplicate guard. Strict R-multiple arbitration deferred.

**Strategies in the lane as of 2026-04-21:**
- `strong_bull_trend` — primary, built for this lane from scope. Ignores geometry override (uses its own locked 3×ATR stop, 6×ATR target).
- `vwap_pullback` — promoted into the lane via `MULTI_FAMILY_ELIGIBILITY`. Consumes geometry override (Variant E: 4×ATR stop, 3R target) when fired through the lane. Retains default geometry on non-lane firings.

## B63.2 Counter-Trend LONG Guard Pattern

**Pattern:** any LONG-only strategy whose archetype does not fit strong-downtrend conditions adds a symmetric guard to the existing B63 Item 6 positive-DBS exclusion.

```ts
if (((indicators as any).dbsScore ?? 0) <= -0.35) {
  setNullReason('b63b_counter_trend_long_exclusion');
  return null;
}
```

**Applied to (2026-04-21):** `morning_star`, `reverse_impulse`, `defensive_hedge`, `sma_trend_ride`, `vwap_pullback`.

**Not applied to:** any strategy that is not LONG-only. Any future new strategy that is LONG-only by design should include this guard as part of its signature unless it is specifically built to fire on counter-trend setups.

**Threshold:** `-0.35` (symmetric with B63 Item 6's `+0.35`). If the positive-side threshold is ever tuned, the negative side should move in lockstep unless evidence supports asymmetric thresholds.

**Null-reason:** `b63b_counter_trend_long_exclusion` — distinct from `b63_strong_dbs_exclusion` so diagnostics can separate the two gate types in logs.

## B63.3 Global DBS Persistent Store (see also SIM §5.1c)

Pre-B63, `computeGlobalBias()` walked MCE's cache at read time and applied a 70% coverage gate that could silently degrade to NEUTRAL. Value could vary between reads within a cycle depending on cache state.

B63 Item 16 replaces this with:
1. **Persistent per-pair store** (`server/core/metrics/directional-bias-store.ts`) — Map<symbol, { score, timestamp, sentinelZero, volume }> with 5-minute hard expiry.
2. **End-of-cycle atomic snapshot publish** — MCE's `computeGlobalBias()` delegates to `store.publishSnapshot()`. Within a cycle, `store.getLatestSnapshot()` returns the same object reference across multiple consumer reads.
3. **Fixed 20-pair floor** — `GLOBAL_DBS_MIN_SAMPLE_COUNT = 20`. Below floor, snapshot is never freshly computed — either the prior good snapshot is served with `isStale: true`, or `null` is returned.
4. **Explicit 5-row behavior spec** — cold-start / below-floor-with-prior / below-floor-without-prior / invalid-compute / happy-path all have distinct code paths, distinct log prefixes, and distinct return semantics. `null` and `isStale: true` are DIFFERENT states.

**Governance principle:** silent degradation is a governance failure. Consumers must be able to tell the difference between "no snapshot available" and "stale snapshot served." B63 Item 16 enforces this at the type and log level.

**In-memory only for B63.** DB-backed persistence is a candidate follow-up if operational evidence demands cross-restart snapshot continuity.

## B63.4 Mode-Overlay Bypass Pattern

**Problem observed pre-fix:** mode-overlay (NORMAL / DEFENSIVE / SURVIVAL) applied asymmetric multipliers to stop/target distances globally. For reversal archetypes this was defensible (grab profits fast in choppy markets). For continuation/trend archetypes it was destructive — DEFENSIVE mode squashed 2:1 RR to 1.33:1 and SURVIVAL inverted to 0.8:1 (target closer than stop).

**Solution pattern:** archetype-appropriate bypass scoped to a routing lane, not a strategy name list. When `sourcePool === 'quant-strong_trend'`, bypass mode-overlay multipliers and use native geometry.

**Where enforced:**
- `server/services/vts-runner.ts` (~L1086, where mode-overlay is applied to stop/target distances for VTS virtual trades)
- `server/services/paper-execution-engine.ts` (~L2165, where mode-overlay is applied for paper/active trading signals)

**Why scoped to a lane (not a strategy name list):** promoting a strategy into the strong-trend lane (per B63.1) automatically inherits the bypass. Adding new continuation strategies does not require updating mode-overlay code.

**Non-scope:** other lanes continue to apply mode-overlay as designed. The bypass is NOT a deprecation of mode-overlay — it is a lane-specific opt-out for archetype compatibility.

## B63.5 Cohort Boundaries for Observation

Three PM2 restart boundaries for B63 observation attribution:
- `#79` (2026-04-21 ~14:45 UTC) — Stage 10A: Item 10 counter-trend LONG guards
- `#80` (2026-04-21 ~15:13 UTC) — Stage 10B+10C: Items 11/12/14
- `#81` (2026-04-21 ~15:34 UTC) — Stage 16: Item 16

Trade records opened under each cohort should be segmented in observation analysis. Same-day boundaries may collapse per Langston's cohort-separation rule if the completion report's attribution benefits from a single combined window.

---

*End of Appendix B63. Items 15/17/18/19 produce their own deliverable documents (B63_ITEM15_ADAPTIVE_FRAMEWORK_AUDIT.md, B63_ITEM18_SQE_AUDIT.md, B63_ITEM19_CADENCE_LATENCY_AUDIT.md) and are referenced from BATCH_63_COMPLETION_REPORT.md rather than the System Manual.*

---

# Appendix B64a — Regime & Strategy Drift Dashboard

**Batch:** B64a (promoted from B71 during B63 closeout)
**Deployed:** 2026-04-22 at PM2 #84
**Purpose:** provide operators (Kyle + CC + Langston) a single dashboard showing how the system's regime classifier, directional-bias scoring, and strategy performance are actually distributed over time — not point-in-time snapshots.

## B64a.1 Architecture

The dashboard is a three-layer read-only analytics surface. No writes to production data. No background computation that could interfere with the trading pipeline.

**Layer 1 — Data sources (read-only):**
1. `logs/virtual_trades/*.jsonl` — closed trade records with `regime`, `strategy`, `sourcePool`, `FinalScore`, `rankingScore`, `netProfit`, `outcome`, `entryTime`, `exitTime`.
2. `logs/phase15b_dbs_telemetry/*.jsonl` — per-MCE-cycle samples of regime classification + DBS distribution + clamp saturation telemetry installed during B61.
3. `server/core/metrics/directional-bias-store.ts` in-memory ring buffer (see §B63.3).

**Layer 2 — Aggregator (`server/services/drift-dashboard-aggregator.ts`):**
- Entry: `computeDriftDashboard(window: DashboardWindow): DriftDashboardResponse`
- 4 window modes: `rolling_24h`, `rolling_7d`, `rolling_30d`, `cohort_latest`
- Produces:
  - `tradeCounts` — total / wins / losses / winRate / avgNetPct
  - `regime.shares` — per-regime share of MCE samples in window
  - `regime.familyFlickerPct` — rolling measure of same-pair family-class flips per unit time
  - `regime.rbsDriftContaminationPct` — rolling measure of RBS-labeled samples that behave as non-RBS
  - `regime.componentClampSaturationPct` — slope/return/ema clamp saturation levels
  - `strategiesByRegime[regime] = StrategyStats[]` with `{strategy, tradeCount, winCount, winRate, avgNetPct, sumNetPct, avgNetValue, sumNetValue}`
  - `dbsDistribution[category] = sampleCount`
  - `globalDbs.current` — latest snapshot + isStale + snapshotAgeSeconds
  - `globalDbs.history24h` — filtered from store ring buffer
  - `globalDbs.transitions` — filtered from store transitions array

**Layer 3 — HTTP endpoint (`server/routes.ts`) → React UI (`client/src/pages/analytics.tsx` → `DriftDashboardSection`):**
- Endpoint: `GET /api/analytics/drift-dashboard?window=rolling_24h`
- UI is 5th Analytics tab. Window toggle (24h / 7d / 30d / cohort). Auto-refresh on a timer.
- Global DBS sparkline: inline SVG, auto-scales to history's actual [min, max], zero-axis line when range crosses zero. Zero external chart-lib dependencies.
- Per-regime strategy table: unified single-table layout with regime section headers; columns are column-aligned across all regimes via `colgroup` fixed-width declarations. Columns in order: Strategy | N | Wins | WR | Avg net $ | Avg move % | Sum net $ | Sum move %. (Note: `%` columns renamed from `Avg net %` / `Sum net %` to `Avg move %` / `Sum move %` in B64b 2026-04-23 to disambiguate from the position-sized `$` columns — the `%` values are entry-to-exit price moves, not portfolio-adjusted returns.)

## B64a.2 Why B64a exists (rolling vs snapshot doctrine)

From CLAUDE.md critical rule #13 (codified during B61):

> **Prefer rolling windows over single-point snapshots for distribution metrics.** Snapshots catch whatever moment they happen to land on and can be off by 10+ percentage points; rolling windows give you the mean AND the variance.

B59 reported 47% drift contamination from a single 88-pair snapshot; B61's 13,954-sample rolling window measured 72.59% — same classifier, same universe. B59 also reported 19.3% TFS share (snapshot) vs B61's 3.42% (rolling). The gap was decision-threatening.

**The Drift Dashboard exists to make rolling-window measurement the default observational surface** and to make it impossible to ask "what's the regime distribution" and get a snapshot answer. Every metric the dashboard exposes is rolling-window by construction.

## B64a.3 Ring-buffer constants (see also `directional-bias-store.ts`)

- `SNAPSHOT_HISTORY_MAX = 96` (24h at 15-min MCE cadence)
- `TRANSITION_HISTORY_MAX = 50` (last 50 category transitions)
- `GLOBAL_DBS_MIN_SAMPLE_COUNT = 20` (minimum pairs sampled before global DBS can publish)
- `PAIR_HARD_EXPIRY_MS = 5 * 60 * 1000` (5-minute per-pair hard expiry)

If any of these constants change, the aggregator's window filters must be re-validated and the UI sparkline's sampling density must be re-checked.

## B64a.4 Invariants (do not violate without governance update)

1. **No hardcoded regime strings in the aggregator.** All regime literals route through `CANONICAL_REGIMES` / `REGIMES.*`. Enforced by `regime_mapping_integrity.test.ts`. This was the last bug fixed in B64a HF (commit `cf7baef1`).
2. **isStale is surfaced, not hidden.** If the global DBS snapshot's age exceeds the freshness window, `isStale: true` flows through to the UI and a badge is displayed. Do not silently replace a stale snapshot with a fabricated fresh one.
3. **No writes from the dashboard code path.** The aggregator reads; the endpoint serves; the UI renders. No code in this chain mutates production state, triggers scans, or writes to disk.
4. **Window filtering at aggregator boundary.** The store's ring buffer may hold up to 24h; consumers requesting `rolling_7d` get an empty history array (expected, not an error). Never extend the store's buffer to satisfy a longer window — instead add a secondary long-window persistence layer if that need arises.

## B64a.5 Known open items (pre-registered for follow-up)

- **History persistence across restart** — ring buffer is in-memory only; PM2 restart wipes it. DB-backed persistence is a candidate follow-up if operational evidence demands cross-restart snapshot continuity (currently: not needed, daily telemetry archive is sufficient for historical analysis).
- **UI polish** — B71 slot is repurposed for final Drift Dashboard polish based on observation-window feedback (deferred until after 2026-04-28 Item 13 decision gate). Local redesign already drafted (column-aligned unified table, dollar-value columns added) — queued for deploy after open book resolves.

---

*End of Appendix B64a.*

---

# Appendix B65.4.x — Ladder Trailing Model + Hotfixes

## B65.4 Ladder design (2026-04-25)

See §5.1 above for the engine details. Each target hit advances both stop and target by one R-distance step; trade runs through as many rungs as price moves.

## B65.4.1 Cost-aware floor formula change (2026-04-26 hotfix)

**Trigger:** counterfactual analysis on first 5 closed laddered trades (`B65_4_LADDER_COUNTERFACTUAL_ANALYSIS.md`) showed the original formula `target * (1 - totalCost/2)` placed the rung floor BELOW the just-hit target, allowing reversals to exit BELOW the original target value. Aggregate cost: ~$11 across 5 trades vs the just-take-target counterfactual.

**Fix:** new formula `target * (1 + slippage * bufferMultiplier)`. Floor now sits ABOVE just-hit target by exactly enough to absorb stop-trigger slippage on a reversal. Multi-rung ratcheting still works as before. The buffer multiplier is `module_constants.trailing_exit.rung_floor_slippage_buffer_multiplier` (seed 1.0), tunable per `(asset_class, exchange, regime, strategy)` without code redeploy.

## B65.4.2 Observability columns (2026-04-28 hotfix)

**Trigger:** B65.4.1 verification 2026-04-28 showed counterfactual analysis was unreadable on "anomaly" rows because the closed-trade CSV didn't expose latch-trigger price (which can fire at +1.5R from entry due to `target_lock_r` interaction, not at the strategy's published target), original stop, or per-rung target history. Analyst had to grep PM2 entry logs to recover original stops.

**Three TrailingState fields added:**
- `originalStopPrice` — captured at `initializeTrailingState`, never modified
- `latchTriggerPrice` — set ONCE when `targetLatched` first flips false→true (records actual latch trigger price)
- `rungTargetHistory` (number[]) — appended at each ratchet event

**Three `paper_sim_trades` columns added** (migration `2026-04-28-b65-4-2-ladder-observability-columns.sql`): `original_stop_price` decimal(20,8), `latch_trigger_price` decimal(20,8), `rung_target_history` jsonb. Surfaced in both open + closed CSV exports + `/api/vts/ml/open` endpoint.

## B65.4.x verification findings (2026-04-28)

**The hotfix is doing what it was designed to do for clean post-deploy cases.** Across 4 post-hotfix-clean laddered trades, ladder is approximately break-even vs counterfactual (−3.98pp aggregate). Multi-rung still captures upside in the design's payoff scenario.

**Aggregate ladder Δ across all 17 laddered trades: −59.89pp / ≈ −$39 vs the just-take-target counterfactual.** Even with the hotfix, the ladder is net-negative in aggregate. Bigger picture: the broader 7-day VTS cohort (1,136 trades) is **−$1,187** with 74% of exits at break-even-stop / original-stop / trailing-stop. Most trades never reach target in the first place.

**The dominant problem is upstream entry quality, not ladder calibration.** The ladder fires on 1.5% of trades; the other 98.5% lose money on entries that are systematically mis-timed against macro context. **B67 macro confidence modifier is the priority lever.** Ladder net contribution stays under observation per Phase 19.4.5 item 7; possible outcomes are (a) keep multiplier at 1.0 if observation turns positive, (b) tune multiplier via `module_constants` DB update, or (c) retire ladder design in favor of just-take-target-and-exit.

---

# Appendix REGIME — Master Planning Doc Reference

## Regime classifier overhaul + external data integration plan (2026-04-27)

**Document:** `Claude Comms and Packages/Scope Files/REGIME_OVERHAUL_AND_EXTERNAL_DATA_PLAN_2026_04_27.md`. Listed as ⭐ MUST READ on next session start in MEMORY.md. **Required pre-work before any B67-related implementation.**

**Captures the full conversation between CC and Langston** about external data integration, regime classifier improvements, material-improvement levers, missing regimes, and ML-light pre-launch viability. Honest classifier rating: medium-low overall. B62 DBS integration was a real success and was undersold in CC's first rating.

**Key architectural positions reached:**

- **Confidence-modifier architecture** (Langston, recommended over CC's original alongside-the-classifier approach): external data modulates the classifier's CONFIDENCE NUMBER (0.85-1.05x range), not the regime LABEL. Low confidence → triggers TRANSITION/UNSTABLE stability → activates existing DEFENSIVE mode overlay → automatic throttling. One integration point, preserves B62 calibration.
- **Phase dimension** (Langston, recommended over adding new top-level regimes): sub-classify existing 5 regimes with EARLY/MATURE/LATE phase boundaries (2h / 12h regime stability). Captures Topping (TFS-LATE), Accumulation (RBS-LATE), Climactic (IE-EARLY) without expanding regime taxonomy.
- **B67 expanded to 5 coordinated sub-deliverables** (~3-4 weeks total): macro confidence modifier (B67.1), phase dimension (B67.2), per-underlying position limits (B67.3, promote from paper-only), realized-outcome feedback into classifier confidence (B67.4), Path B sustainability tightening (B67.5, folds in deferred B65.6 work).
- **ML-light reliability score** (Langston suggestion): logistic regression on classifier inputs + B67 macro features predicting "is this classification wrong?" trained on 30d VTS data. ~2-3 days work. Pre-launch viable as Phase 19.4 candidate.

**Combined realistic estimate (CC + Langston consensus): 10-20pp WR improvement on currently-failing cohorts; 3-5pp overall.**

**12 decisions queued for Kyle in §11** of the planning doc (4 architecture, 2 sequencing, 3 scope, 2 validation, 1 pre-implementation audit). These are the gating event for writing `BATCH_67_SCOPE.md`.

---

*End of B65.4.x + REGIME planning appendices.*

---

# Appendix B67/B68 — 7-Modulator Confidence Chain (CLOSED 2026-05-03)

## Architecture summary

The B67/B68 series builds out a 7-modulator multiplicative confidence chain that wraps the rule-based regime classifier. The classifier produces a regime LABEL + raw confidence. The chain then modulates the raw confidence by external context (macro), temporal context (phase, freshness), behavioral context (outcome feedback, volume regime), and structural context (pair correlation, multi-TF agreement), then clamps the result.

```
raw × macro × phase × freshness × outcome × volume_regime × pair_correlation
    × multi_tf_agreement → clamp [b67_5_post_composition_floor (0.45), 1.0]
```

**The classifier label is preserved unchanged.** Only confidence is modulated. This design choice was made deliberately (master plan §7) so that adding external context cannot produce "classifications we can't make sense of" — labels remain interpretable; we simply see the same label with adjusted confidence.

**Pre-B67.5 the chain is observational** — every modulator emits an ablation row but no consumer reads `regime_confidence_modulated` as a gate. Calibration windows attribute per-factor independently per master plan §0.11.C step 5. Post-B67.5 the chain becomes operational and 7 consumers (admission gates, position sizing, etc.) read the modulated value.

## The 7 modulators

| # | Modulator | Input | Range | Cold-start | Batch |
|---|---|---|---|---|---|
| 1 | macro modifier | BTC dominance + funding rates + mcap momentum (z-scores over rolling 48-sample baseline) | [`b67_1_modifier_min`, `b67_1_modifier_max`] (default [0.85, 1.05]) | factor=1.0 + fallbackActive=true when baseline n<48 | B67.1 |
| 2 | phase preference | (strategy, phase) → weight from `b67_2_strategy_phase_weights` JSONB blob; phase ∈ {EARLY < 2h, PRIME 2-12h, LATE > 12h} | strategy-phase weights blob (per-strategy bands) | UNKNOWN strategy → 1.0 | B67.2 |
| 3 | freshness (regime age) | `regimePhaseStore.peekAgeMs(symbol, now)` vs `b68_4_target_age_hours` | [0.92, 1.05] | factor=1.0 when ageMs undefined | B68.4 |
| 4 | outcome feedback | EMA of recent (regime, strategy) net P&L %; updated on every trade close (vts-service + paper-execution-engine) | [0.85, 1.05] | factor=1.0 when sample_count<5 | B67.4 |
| 5 | volume regime | `score = SUM(volume × sign(close[i]-close[i-1])) / SUM(volume)` over rolling N=30 bars; `factor = clamp(min, max, 1 + score × sensitivity)` | [0.92, 1.05] | factor=1.0 when ohlc<30 | B68.2 |
| 6 | pair correlation | Spearman rank correlation pair vs BTC (XBT/USD universal reference); `decorrelationScore = 1 - \|corr\|`; `factor = clamp(min, max, 1 + decorr × sensitivity)` | [0.95, 1.05] (asymmetric — boost only) | factor=1.0 when pair OR BTC ohlc<30 | B68.3 |
| 7 | multi-TF agreement | `calculatePairRegime(higherTfOhlc, 0, 0, 1.0, regimeConfig)` on 240-min OHLC; three-state CONFIRMED/COMPATIBLE/CONFLICTED; ST is universally COMPATIBLE | [0.92, 1.05] | factor=1.0 when higher-TF samples<30 (= 5 days of 4h) | B68.1 |

## Three-state agreement classification (B68.1)

The multi-TF agreement modulator (modulator #7) introduces a regime-family abstraction worth documenting at the architectural level.

**Family map** (LOCAL to `server/core/metrics/multi-tf-agreement.ts`):
- **directional**: `TREND_FRIENDLY_STABLE`, `IMPULSE_EXPANSION` — both express directional movement
- **range**: `RANGE_BOUND_STABLE` — explicit no-direction
- **volatile**: `HIGH_VOLATILITY_UNSTABLE` — directional but unstable
- **transition**: `STRUCTURAL_TRANSITION` — uncertainty; universally COMPATIBLE (never escalates to CONFLICTED on either side)

**Three-state classification:**

| State | Condition | Factor (seed) |
|---|---|---|
| CONFIRMED | Active-TF regime label === Higher-TF regime label | 1.05 |
| COMPATIBLE | Same family OR either side is ST | 1.00 |
| CONFLICTED | Different families, neither is ST | 0.95 |

**Higher-TF source:** Kraken native 240-min (4h) OHLC via the existing `ohlcCache` infrastructure (new cache key `${symbol}_240`). The B74 DB archive is NOT a runtime dependency for B68.1 — runtime fetch is in-memory cache + Kraken REST cache miss only.

**Higher-TF DBS = 0 in v1** (Path A only — mom + ADX over 30 × 4h candles = 5 days of 4h). v2 follow-up if calibration shows label-agreement is too noisy without 4h DBS. Refinement D.1 (Langston cc-inbox #887) reserves `higher_tf_dbs_score` and `higher_tf_dbs_slope` schema fields in ablation metadata, hardcoded to zero in v1, schema-stable for v2.

## MCE 9-group config orchestrator

`server/services/market-context-engine.ts:refreshAllConfigs()` resolves 9 config groups in parallel via the timer cadence (default 60s):

1. `macro_modifier` (B67.1) — 7 constants
2. `regime_phase` (B67.2) — 3 constants (early_max_hours, prime_max_hours, strategy_phase_weights blob)
3. `regime_classifier` (B67.3.5 + B67.5-prep) — 6 constants (5 TFS desat scales + post-composition floor)
4. `outcome_feedback` (B67.4) — 6 constants
5. `regime_age` (B68.4) — 4 constants
6. `path_b_sustainability` (B68.5) — 1 constant (DBS slope min, regime=TFS scoped)
7. `volume_regime` (B68.2) — 8 constants
8. `pair_correlation` (B68.3) — 8 constants
9. `multi_tf_agreement` (B68.1) — 8 constants

**First refresh** uses `Promise.all` with try/catch — hard-fail-on-startup with retry on next timer tick. **Subsequent refreshes** use per-group try/catch with keep-prior-on-failure semantics — a single missing module_constant in one group does NOT take down the entire MCE refresh. The B67.4 hotfix-#2 wrapper pattern is inherited unchanged across all subsequent additions.

**`assembleRegimeConfig()`** merges TFS desat scales + Path B slope min + post-composition floor into the final `RegimeConfig` only when all three sub-states are non-null. Threaded as the 5th param into `calculatePairRegime`.

## Post-composition floor (B67.5-prep)

Original chain clamp was hardcoded `Math.max(confidence, 0.4)` at three sites: `calculatePairRegime` terminal, vts-runner emit hook, signal-orchestrator emit hook. With 7 modulators, worst-case compound `0.85⁴ × 0.92² × 0.95 ≈ 0.419` falls below the 0.40 historical floor.

**B67.5-prep migrated all three clamp sites** to read `regimeConfig.b67_5PostCompositionFloor` from a new `regime_classifier.b67_5_post_composition_floor` module_constant, seeded at 0.45. Cold-start fallback `?? 0.4` in emit hooks preserves legacy behavior until MCE config loads. Tunable via DB UPDATE without redeploy.

**Floor-engagement is intentional + observational.** Worst-case compound binding the floor on a meaningful fraction of trades is signal in itself, captured in ablation metadata via `confidence_with_factor` (clamped) vs `confidence_without_factor` (pre-clamp). Closed Trades UI shows `conf 0.450` widely on recent post-B68.1 trades — confirmed observable in production.

## Per-factor ablation row schema

Every modulator emits a row in `regime_factor_alternates` per signal evaluation:

```jsonb
{
  "factor_name": "b68_1_multi_tf_agreement",
  "factor_state": "alternate_disabled",
  "alternate_decision": {
    "regime_label": "<active_tf_regime>",
    "confidence": <confidence_without_factor>,
    "admission_possible": true,
    "metadata": { ... per-factor specific ... }
  }
}
```

**Counterfactual is divide-out:** `confidence_without_factor = realConfidence / factor`. Same approximation across all 7 modulators; same documented limitation at clamp boundaries (Langston OBS-2 cc-inbox #879). Factor-zero safety: when factor=0, alternate falls back to realConfidence (no division-by-zero blowup).

The replay-ablation cron runs nightly at 04:00 UTC, joins ablation rows to closed trades, records realized outcomes, and surfaces tertile WR + predictive lift per factor in the Factor Calibration UI panel (Drift Dashboard tab on the Analytics page) once n ≥ 150 per (factor, tertile) bucket.

## Calibration windows

Each chain factor gets its own ~14-day mini-window starting at deploy. Per master plan §0.11.C step 5, the ablation framework attributes per-factor independently — each factor's calibration check uses only rows where `factor_name = '<factor>'` over the 14 days following its deploy.

Active windows as of 2026-05-03:
- B67.4 (cheap-tier bundle: outcome_feedback / regime_age / path_b_sustainability + 4 pre-existing factors): Day 2 of 14, ends 2026-05-15
- B68.2 (volume_regime): Day 1 of 14, ends 2026-05-16
- B68.3 (pair_correlation): Day 1 of 14, ends 2026-05-16
- B68.1 (multi_tf_agreement): Day 0 of 14, ends 2026-05-17

**Calibration check pass criteria** per Langston cc-inbox #856: tertile-monotonic WR + ≥7pp HIGH-LOW gap + p<0.05 + n ≥ 150 per bucket. Pass triggers B67.5 consumer wiring (turns the chain operational). Fail triggers per-factor recalibration via DB UPDATE on sensitivity / threshold constants without code redeploy.

## Implementation status of master plan §5.4 levers

7 of 9 originally-planned confidence-modifying levers are SHIPPED, plus 2 bonus levers added during the buildout:

| # | §5.4 Lever | Batch | Status |
|---|---|---|---|
| 1 | Macro confidence modifier | B67.1 | ✅ LIVE |
| 2a | Phase dimension | B67.2 + B67.2.1 | ✅ LIVE |
| 2b | Concentration gate (Phase 19.5 AMR) | post-Phase-16 | ❌ Separate scope |
| 3 | Multi-TF agreement | B68.1 | ✅ LIVE 2026-05-03 |
| 4 | Volume regime | B68.2 | ✅ LIVE |
| 5 | Per-underlying position limits | B67.3 | ✅ LIVE |
| 6 | Realized-outcome feedback | B67.4 | ✅ LIVE |
| 7 | Path B sustainability | B68.5 | ✅ LIVE |
| 8 | ML-light reliability score | B69 (deferred) | ❌ End of pre-Phase-16 per Kyle directive |
| 9 | Full ML regime classification | Phase 17/18 | ❌ Post-launch |
| bonus | Regime-age freshness factor | B68.4 | ✅ LIVE (added in B67.4 cheap-tier) |
| bonus | Pair correlation (decorrelation from BTC) | B68.3 | ✅ LIVE (added per Kyle 2026-04-29 reorg) |

## Per-modulator file pointers

| Modulator | File | Builds alternate via |
|---|---|---|
| macro_modifier | `server/core/metrics/macro-modifier.ts` | `buildB67_1Alternate` (3 per-input split: btc_dominance / funding / mcap) |
| phase_preference | `applyPhasePreference()` helper + `server/core/metrics/regime-phase.ts` (state) | `buildB67_2Alternate` |
| outcome_feedback | `server/core/metrics/outcome-feedback-store.ts` (singleton) | `buildB67_4Alternate` |
| regime_age | `server/core/metrics/regime-age-factor.ts` | `buildB68_4Alternate` |
| path_b_sustainability | `server/core/metrics/regime-age-factor.ts` (`buildB68_5Alternate` re-runs `calculatePairRegime` with slopeMin=-Infinity) | `buildB68_5Alternate` (label counterfactual) |
| volume_regime | `server/core/metrics/volume-regime.ts` | `buildB68_2Alternate` |
| pair_correlation | `server/core/metrics/pair-correlation.ts` (uses `spearmanRankCorrelation` from `strategy-helpers.ts`) | `buildB68_3Alternate` |
| multi_tf_agreement | `server/core/metrics/multi-tf-agreement.ts` (reuses `calculatePairRegime` for higher-TF) | `buildB68_1Alternate` |

Emit hooks live in `server/services/signal-orchestrator.ts` (active path, currently silent-skip due to `MarketContext.ohlcData` any-cast — resolves in B67.5) and `server/services/vts-runner.ts` (VTS path, uses function-scope `ohlcData` parameter — works correctly post-B68.4 hotfix #3).

## What's still left

- **B67.5 consumer wiring** — gated on B67.4 calibration check 2026-05-15. ~1 week. Wires confidence into 7 consumers + deletes legacy `RegimeWeight` code path + handles deferred RUNNING_ISSUES #44 (active-path orchestrator emit hook OHLC any-cast across all 7 chain factors) + #45 (active-path persist hook). When B67.5 lands, the chain transitions from observational to operational.
- **Phase 19.5 AMR** (concentration gate + mode-overlay expansion) — post-Phase-16. Universe-level hostile-window detection, complementary to per-pair confidence chain.
- **External Data Phase 2** (exchange flows / liquidations full / DXY / SPX cross-asset) — post-Phase-16, conditional on B67/B68 measurable lift. B68.2 partially captures liquidations via `has_liquidation_spike` metadata flag (informational only, not in factor formula).
- **B69 ML-light** — deferred to end of pre-Phase-16 per Kyle directive.
- **Phase 17/18 full ML regime classification** — post-launch, months.

---

*End of 7-Modulator Confidence Chain appendix. Last updated 2026-05-03 with B68.1 ship.*

---

## B79.0n.CONFIDENCE-CHAIN per-class addendum (2026-05-25)

**Per-class invariant:** every modulator in the b67_x + b68_x family now reads its configuration from per-asset-class rows in `module_constants` (or per-class JSONB blobs for the phase-preference weights). The pre-B79.0n.CONFIDENCE-CHAIN behavior — every modulator reading from a single global `asset_class='*'` wildcard row — is replaced with first-class per-class resolution. The market-context-engine maintains atomic per-class config maps for the 3 modulators with behavioral divergence (macro / pair-correlation / phase-preference); the other 4 modulators (outcome-feedback, regime-age, volume, multi-tf) keep their global single-config caches because their math is class-invariant by construction (F-1) and they don't carry per-class behavioral flags.

**Per-class disposition per modulator:**

| Modulator | crypto_spot | xstock_spot | F-1 / F-2 |
|---|---|---|---|
| b67_1 macro | BTC dominance + crypto funding + crypto mcap momentum z-score formula (full math) | **NO-OP via `assetClassNoOpActive=true`** — factor short-circuits to 1.0 with NaN z-scores + `metadata.asset_class_no_op_active=true`. Crypto-native inputs are meaningless for equity exposure. Equity-macro feed (VIX / DXY / SPY momentum) deferred to a Phase 24 follow-up. | **F-2** |
| b67_2 phase | 18 strategies × 3 phases = 54 cells in `strategy_phase_weights` JSONB blob | 9 xStock-enabled strategies × 3 phases = 27 cells in per-class JSONB blob at neutral 1.0 (calibration follow-up will tune); fail-hard on missing-strategy key | **F-2** (per-class blob shape; strategies differ per class) |
| b67_3 TFS-desat | regime_classifier desat constants (full per-class via B79.0n.MCE) | regime_classifier desat constants (per-class) | F-1 math; F-2 config tuning |
| b67_4 outcome-feedback | Store keyed `<crypto_spot>_<regime>_<strategy>` *(superseded — see below)* | Store keyed `<xstock_spot>_<regime>_<strategy>` — fully isolated; crypto outcomes do NOT contaminate xstock EMAs *(superseded — see below)* | **F-2** (key isolation required) — **★ ITEM 4 step 2 (2026-06-10) SUPERSEDED the key: now `<source>_<assetClass>_<regime>_<strategy>` with `source` REQUIRED** (`'vts' \| 'paper_sim' \| 'live'`); per-class isolation is preserved as the second key dimension |
| b68_1 multi-tf | Per-class via B79.0n.MCE (`calculatePairRegime` REQUIRED-assetClass) | Per-class | F-1 math |
| b68_2 volume | Pure OHLC math | Pure OHLC math; class-invariant by construction | **F-1** |
| b68_3 pair correlation | Spearman vs `XBT/USD` reference; `computeCorrelationEnabled=true` | Spearman vs `SPY/USD` reference; `computeCorrelationEnabled=false` v1 default pending SPY-relative calibration follow-up — factor short-circuits to 1.0 + `metadata.compute_disabled=true` | **F-2** (reference symbol differs) |
| b68_4 regime-age | freshness factor formula | freshness factor formula (same math) | F-1 |
| b68_5 path-B sustainability | Per-class via B79.0n.MCE (`calculatePairRegime` REQUIRED-assetClass) | Per-class | F-1 |

**Outcome-feedback store persistence:** moved from `/tmp/b67-4-outcome-feedback.json` (purged on pm2 restart) to `/home/deploy/dawntrader/data/b67-4-outcome-feedback.json` (persistent across restarts). Internal Map key shape changed from `<regime>_<strategy>` to `<assetClass>_<regime>_<strategy>`. First-boot disk-load migration re-keys legacy entries under `crypto_spot_` prefix (pre-CONFIDENCE-CHAIN was crypto-only by construction). **★ ITEM 4 step 2 (2026-06-10) superseded the key AGAIN → `<source>_<assetClass>_<regime>_<strategy>`** (source-partitioned labeled learning; a second 2-stage disk re-key moved all pre-step-2 entries into the `vts_` partition — verified 30/30 on staging; Welford triplet + per-source calibration epoch fields added alongside the EMA). HARD-FAIL on corrupt new-path data — no silent fallback to legacy /tmp/ when canonical state file is unparseable (Langston Step 2 clarification 1). Same path move for `regime-phase-store.json` (no key change required).

**MCE atomic Map-replace pattern (R-11 mitigation):** `macroConfigByClass` / `pairCorrelationConfigByClass` / `phaseWeightsByClass` are typed as `ReadonlyMap<AssetClass, T>`. Each refresh cycle builds a NEW map locally + atomically swaps the reference via single assignment. Readers see either the old map's complete state OR the new map's complete state — never a partial state where one class is updated and another isn't. The `ReadonlyMap` type makes accidental in-place mutation a TypeScript error.

**Chain-composition capture-and-reuse (R-10 mitigation):** signal-orchestrator + vts-runner resolve `_pairAssetClass = safeResolveAssetClass(symbol, 'kraken')` once at chain-block entry. If null, skip the entire ablation block + WARN (structurally unreachable defense-in-depth — upstream regime classifier uses STRICT `resolveAssetClass` which would have thrown earlier). All 16 push sites (8 per file × 2 files) thread the captured asset class through the `FactorAlternateInput` discriminated-union arms — TS exhaustiveness check enforces. Same pattern applied to paper-execution-engine + vts-service close-hooks for `outcomeFeedbackStore.updateEma` (resolves from `position.symbol` / `tradeData.symbol`).

---

*End of B79.0n.CONFIDENCE-CHAIN per-class addendum.*

---

# Appendix — Data Capture Architecture (B70 + B70.1, 2026-05-04 → 2026-05-05)

> **Why this exists.** Future ML, Trend Mining Engine, and post-launch analysis need a per-pair, per-cycle context log with all feature inputs and modulator chain values, joinable by timestamp across the system's full lifecycle (VTS today → paper-sim Phase 19 → live Phase 21). Before B70 the system had three disconnected data sources (B74 OHLC archives / B67+B73 ablation rows / VTS counter logs) and none captured per-pair context. B70 added the missing layer.

## Architecture summary

Five archive tables under a unified writer pipeline. Every row carries a **two-column discriminator** so cross-mode queries are clean: `mode` (system-state at write time, from the run-mode controller) and `source` (which code path produced this row, hardcoded per call site). When the system flips VTS → paper-sim → live, the archive layer keeps writing without code change; only the `mode` value flips.

## Tables

| Table | Cadence | What it captures | Partitioned |
|---|---|---|---|
| `pair_scan_archive` | 60s × ~177 active pairs ≈ ~255k/day | Per-pair MCE state: regime label + confidence, DBS score + category, ATR%, all 7 modulator inputs, full feature snapshot (vwap/sma/atr/vol/mom/adx/high24h/low24h/phase/age), scan-stage decision | RANGE on `captured_at`, monthly |
| `signal_eval_archive` | per-evaluation | Per-strategy × per-pair signal evaluation. `reject_stage` enum: `admitted` / `pre_filter` / `sqe` / `rtb` / `tcl` / `strategy_internal`. Today VTS path captures admitted + sqe + tcl + strategy_internal; pre_filter from FX5 + active-path SQE/RTB queued for B70.2. **DECISION-PROVENANCE GAP (RUNNING_ISSUES #206, 2026-06-06):** `features` stores SCORING metadata only — NOT the engine's detection inputs (the `ohlcData` settled+forming bars or the resolved `module_constants`). Consequence: a decision **cannot be backward-replayed through the real detect functions to ≥99% parity** (B.5 W2.0b: vwap_pullback maxed 80%; irreducible residual = the in-progress forming bar, never persisted — the 3rd study at this wall after W2.0a Mode-A + RI-a). **Fix = forward decision-provenance capture (batch B-NEW-53, roadmap 19-20): persist the forming bar + resolved constants + a settled-bar-set reference + RI-a stop anchors as one layer; settled bars already in `xstock_spot_ohlc_15m_snapshot` → reference, not duplicate. After it accrues, every replay/calibration study becomes exact-replayable.** Discipline for any replay-based calibration: report parity before any swept number; if it can't clear the bar, declare INCONCLUSIVE rather than tune on a low-fidelity reconstruction. | RANGE on `captured_at`, monthly |
| `exit_decision_archive` | per-trade-close | Actual exit decision (parallel to B73 counterfactual). `exit_reason` enum, R-multiple, regime/DBS at entry vs exit, full state snapshot. | RANGE on `captured_at`, monthly |
| `macro_feed_archive` | 60s | B67.1 macro snapshot timeseries — btc_dom, mcap_mom, funding, modifier_value, fallback_active. Joinable by timestamp to per-pair tables. | RANGE on `captured_at`, monthly |
| `b62_retroactive_labels` | one-shot | Original vs B62-post-audit re-classified label per historical VTS trade. Real re-classify when OHLC available (post-B74 trades), placeholder rows otherwise with `requires_ohlc_backfill=true` flag. | NOT partitioned (~3-5k rows total) |

All JSONB columns embed `schema_version: 1` for forward-evolution safety. Bump on breaking shape changes.

## Hot-path hooks

Six places where the trading code emits archive rows. Every hook is `try/catch` wrapped + non-blocking; the MCE hook additionally uses `setImmediate` so module-resolution latency on dynamic imports cannot block the 60s classification cycle.

| Hook site | File / line | Archives | Mode source |
|---|---|---|---|
| MCE cycle end | `market-context-engine.ts:computeContext()` post-emit | `pair_scan_archive` | `getCurrentMode()` |
| VTS emit-ablation (admitted) | `vts-runner.ts:~L1726` | `signal_eval_archive` `reject_stage='admitted'` | `getCurrentMode()` |
| VTS evaluator reject paths | `vts-runner.ts:~L2786 + L2851` | `signal_eval_archive` `reject_stage` ∈ {sqe, tcl, strategy_internal} | `getCurrentMode()` |
| VTS exit loop | `vts-runner.ts:~L2161` | `exit_decision_archive` | `getCurrentMode()` |
| Paper exit | `paper-execution-engine.ts:closePosition` | `exit_decision_archive` | `getCurrentMode()` (currently dormant; live activates Phase 19) |
| Signal-orchestrator emit | `signal-orchestrator.ts:~L975` | `signal_eval_archive` `reject_stage='admitted'` | `getCurrentMode()` (currently dormant; live activates Phase 21) |
| Macro feed pollCycle | `external-macro-feed.ts:pollCycle end` | `macro_feed_archive` | n/a (global feed) |

## Writer pipeline

`server/services/data-archive/archive-batch-writer.ts` — 5s flush interval, 2-slot counting semaphore (separate from B74's pool so neither archive layer can starve the other), 1,000-row chunked INSERTs (Postgres 65,535-param bind-limit safety), bounded queue with drop-OLDEST overflow + `[B70][ARCH][OVERFLOW]` log line. Each archiver registers its column list once at startup; rows are plain objects keyed by column name. Drizzle-`sql` tagged inserts so JSONB columns get proper binding.

`server/services/data-archive/archive-config.ts` — reads 11 `data_archive` module_constants once + every 60s, exposes sync getters for hot-path callers. Toggles for each archiver, retention window, queue-max, and the kill-switch `b70_signal_eval_pre_filter_capture` (drops pre_filter + strategy_internal rows if 7-day measurement shows worst-case volume).

## Run-mode controller

`server/services/run-mode-controller.ts` — `getCurrentMode(): 'vts' | 'paper_sim' | 'live'`. Pure derivation from existing `tradingStateSync.isEngineActive('paper'/'live')` flags. 5-second cache TTL with lazy async refresh + dedup via `refreshInFlight` promise. Default `'vts'`. Hold-previous-value on transient errors with single warn log. **Does NOT extend the existing 2-mode `TradingMode` type** — Phase 27.4 wiring has high blast radius.

## Retention + partition crons

- **Retention sweep** (`server/scripts/b70-retention-sweep.ts`, cron `0 2 * * *` UTC): drops whole monthly partitions older than `b70_postgres_retention_days` (default 90). Per-partition `DROP IF EXISTS` is O(1).
- **Partition creator** (`server/scripts/b70-create-monthly-partitions.ts`, cron `30 2 28 * *` UTC): self-heals current-month partition + creates 12 months ahead.
- **Tabular exporter** (`server/scripts/b70-table-export.ts`, cron `0 3 * * *` UTC, off by default until `b70_parquet_export_enabled=true`): exports prior-day rows to `/var/lib/dawntrader/exports/<table>/<YYYY-MM-DD>.jsonl.gz`. JSONL chosen over Parquet for v1 to avoid new npm dep; pandas/DuckDB/tsfresh/Qlib all read JSONL natively.

## B62 retroactive labels runner

`server/scripts/b70-b62-relabel-runner.ts` — iterates `logs/virtual_trades/<YYYY-MM-DD>.json`. For trades with `entryTime ≥ 2026-04-30` AND OHLC available in `crypto_spot_ohlc_1m`, runs `calculatePairRegime()` with the trade's persisted `pairDirectionalBiasScore` + fresh OHLC-derived inputs to produce a real retroactive label. Older trades or symbols missing from B74 archive get placeholder rows with `requires_ohlc_backfill=true`. Idempotent on `trade_id` UNIQUE.

## Module constants (data_archive module)

11 keys, all wildcard scope: `b70_pair_scan_capture_enabled`, `b70_signal_eval_capture_enabled`, `b70_signal_eval_pre_filter_capture` (kill-switch), `b70_exit_decision_capture_enabled`, `b70_macro_feed_capture_enabled`, `b70_parquet_export_enabled` (off by default), `b70_partition_lookhead_months`, `b70_postgres_retention_days`, `b70_retention_sweep_batch_size`, `b70_retention_sweep_pause_ms`, `b70_archive_writer_queue_max`.

## Visibility

Drift Dashboard → `DataArchiveSection` panel: per-table row counts in window + total + last_write_at + buffer depth + overflow drops + last error. Plus current mode + retention window + kill-switch state. Refreshes every 30s via `GET /api/analytics/data-archive-status`.

## Forward-couples

- **Trend Mining Engine** (Phase 17.6 / 18.5, post-launch) — consumes pair_scan + signal_eval + exit_decision joined to B74 OHLC by timestamp.
- **B67.5 consumer wiring** — when active trading turns on (post-2026-05-15 calibration check), the signal-orchestrator's existing admitted-path archive hook fires automatically with `mode='live'`.
- **Phase 19 paper-sim activation** — `paper-execution-engine.closePosition` hook fires automatically with `mode='paper_sim'`. No code change required.

## What's not in B70.1 (queued for B70.2 if needed)

- **FX5 pre-filter reject capture** — fx5-scanner.ts has multi-stage `filterFailures` tracking; per-pair archive rows would touch ~10 loops. Today VTS captures rejects that reach strategy `detect()`; pre-filter rejects are captured implicitly via row absence.
- **Active-path SQE/RTB hooks** — dormant until live trading turns on. Instrument when path activates Phase 21.
- **Parquet binary format** — JSONL chosen v1 to avoid new npm dep. Pyarrow sidecar can convert if columnar query speedup needed.

---

*End of Data Capture Architecture appendix. Last updated 2026-05-05 with B70.1 ship.*

---

# Appendix: Configuration Surface (B72 — 2026-05-05)

## Architecture

Operator-tunable parameters live in a 5-dimensional DB-driven configuration surface. As of B72, **34 modules / ~163 levers** are DB-tunable without code redeploy. The full inventory + per-row scope rationale lives in `1-system-manual/LEVER_INVENTORY.md`; the live snapshot in `1-system-manual/CURRENT_SETTINGS_REGISTRY.md`.

## Resolution model (`module_constants` table — B65.1 schema)

`(module_name, exchange, asset_class, strategy, regime, constant_name) → value (jsonb)`

Most-specific-wins resolution via `moduleConstantsService.ts`. Dimension scoring weights: regime=8, strategy=4, asset_class=2, exchange=1. If no row matches even global `(*, *, *, *)`, resolver returns undefined and `getCachedNumberRequired` throws.

## Sync-read API (added in B72)

| Helper | Purpose | Throws on |
|---|---|---|
| `prefetchModule(moduleName)` | Async warmup at boot | DB error (boot fails) |
| `getCachedConstant<T>()` | Sync resolver, any type | Cold cache |
| `getCachedNumberRequired()` | Sync number, no fallback | Cold cache, missing row, non-numeric |
| `getCachedNumbersForModule()` | Sync bulk Record | Cold cache |
| 60s background refresher | Re-prefetches warmed modules | Logs + continues on per-module DB error |

**Hard-fail discipline:** every module read from sync code MUST be in `PREFETCH_MODULES` list at `server/startup/b72-warmup.ts`. Server boot throws if any prefetch returns zero rows.

## Boot-order invariant (B72 hotfix)

`b72-warmup` runs BEFORE `bootOrchestrator.initialize()` in `server/index.ts` because Boot Orchestrator's VTS auto-start is the first sync caller. Violating this order causes silent VTS pipeline death (witnessed B72 deploy → 1+ hour outage; resolved by commit `c1afdfac`).

## Operator workflow

See `ADJUSTMENT_FRAMEWORK.md` §0 for the SQL UPDATE → 60s wait → behavior change procedure. Three-layer precedence chains documented there for SQE primary gates, RTB freshness decay, TCL warmup threshold, and net-EV pWin parameters.

## B72.1 carry-over (deferred, non-blocking)

Rows seeded but source-side wiring deferred — each needs different pattern than `getCachedNumberRequired`:
- `adaptive-manager` / `risk-concentration` — singleton instantiated at module load before warmup; needs lazy `getEffectiveConfig()` refactor.
- `strategy-modes` confidence floors — naming mismatch (`NORMAL/DEFENSIVE/SURVIVAL` vs migration's `conservative_/moderate_/aggressive_mode_confidence_floor`); reseed needed.
- `pre-execution-validator` `goal_alignment` + `strategy_profiles` — atomic 4-weight block; HIGH-risk flagged.
- `trade-safety` `guardrail_defaults` — pre-existing fallback path.
- 17-vs-9 strategy reconciliation pass — only 9 strategy files in `server/strategies/`; CLAUDE.md cites 17 canonical strategies. Map remaining 8 to actual file locations.

## Wildcard-retirement migration pattern (B79.0n.MCE, 2026-05-22)

When a `module_constants` lever currently seeded at global wildcard `(*, *, *, *)` scope is consumed by an asset-class-aware caller, the wildcard row is itself a silent-fallback footgun: a `crypto_spot` caller and an `xstock_spot` caller both resolve to the same wildcard row (score 0 in the most-specific-wins hierarchy), so both classes silently inherit one shared value. The resolver's wildcard support is correct as a *feature* (legitimate scope resolution for genuinely cross-class levers like math constants); the *data shape* — a wildcard row serving multiple asset classes that actually need independent values — is what makes a specific lever buggy from the per-class-awareness lens. **The fix lives at the data layer, not the resolver layer.**

The canonical migration pattern, established by B79.0n.MCE for `dbs_calculation.min_sample_count` and reusable for any future wildcard-retirement:

1. **Add an explicit `crypto_spot` row** cloning the wildcard's value byte-for-byte (preserves crypto behavior — crypto-by-construction-NONE invariant).
2. **Add an explicit `xstock_spot` row** (and any other live asset class) — placeholder-cloned from the same value at seed time; later per-class calibration replaces it.
3. **Retire the wildcard row via an `EXISTS`-gated `DELETE`** that fires *only after* both class-scoped replacement rows are confirmed present. There is no orphan window where the wildcard is gone but the class rows do not yet exist.

Implementation rules:
- Wrap the whole migration in a single `BEGIN ... COMMIT` transaction — partial failure rolls back fully.
- Inserts use `ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING` (the 6-tuple unique index); the `DELETE` is `EXISTS`-gated. Together these make the migration idempotent — a re-run after a successful pass is a no-op.
- **Scope every WHERE clause to the exact `constant_name`.** A migration that retires `dbs_calculation` wildcards must filter `constant_name = 'min_sample_count'` exactly so it cannot collaterally retire a different `dbs_calculation` constant (e.g. B-PHASE-A2's `sector_coverage_floor` xstock_spot row).
- Ship a `*-rollback.sql` companion file (re-insert the wildcard, delete the class rows) — manual-only, not auto-run by deploy, available if post-deploy verification fails.
- The resolver-key-tightening code change and the seed migration **must ship in the same commit**. Tightening before the seed makes per-class reads hard-fail until the rows exist; seeding before tightening leaves the wildcard live for an interim. The atomic pair eliminates both windows.

Net row delta for a single-constant single-variant retirement is **+1** (1 wildcard retired, 2 class rows added). A boot-time telemetry probe (`[B79.0n.MCE][CACHE_REFRESH] picked up N module_constants rows ...`) confirms the cache picked up the new per-class rows after the first refresh cycle.

## MCE three-cache-layer model (B79.0n.MCE, 2026-05-22)

The Market Context Engine singleton owns **three distinct cache layers** that are frequently conflated. They have different owners, TTLs, key shapes, and update cadences — a change to one does not affect the others:

| Cache | Owner | TTL | Key shape | Purpose |
|---|---|---|---|---|
| Per-symbol MarketContext | `server/services/market-context-engine.ts` singleton | 60s | `${symbol}:${assetClass}` (was `${symbol}` pre-B79.0n.MCE) | The per-symbol regime + DBS + indicator context computed by `computeContext` / read by `getCachedContext` |
| Module-constants rowset | `server/services/module-constants-service.ts` `cache: Map<string, CachedModule>` | 60s | `${moduleName}` | The raw `module_constants` rows for a module, filled by `loadModule` warming or the 9-group orchestrator |
| 9-group config refresh | `refreshAllConfigs()` orchestrator inside `market-context-engine.ts` | per-MCE-refresh tick | n/a (in-memory typed fields) | Pre-fetches 9 module groups in parallel every MCE refresh tick — `macro_modifier`, `regime_phase`, `regime_classifier`, `outcome_feedback`, `regime_age`, `path_b_sustainability`, `volume_regime`, `pair_correlation`, `multi_tf_agreement` |

B79.0n.MCE extended **only** the per-symbol MarketContext cache key from `${symbol}` to `${symbol}:${assetClass}` (defense-in-depth against cross-class context collision; pre-audit confirmed no crypto/xStock symbol-namespace overlap today). The per-call `getCachedNumberRequired` reads that the wildcard-retirement migration affects consult the *module-constants rowset* cache — a separate layer from the 9-group orchestrator. The 9-group orchestrator's first-refresh hard-fail + keep-prior-on-failure semantics are unaffected by per-class seed migrations.

---

*End of Configuration Surface appendix. Last updated 2026-05-22 with B79.0n.MCE wildcard-retirement pattern + MCE three-cache-layer model.*

---

# Data Lifecycle Policy (B75 — 2026-05-06)

> Governs how operational data ages out of the live SQL database into colder, cheaper, longer-retention storage. **Operating principle (Kyle directive 2026-05-06):** *"we don't ever drop data, especially not now when we're not sure what data is going to be valuable and when."* Data is **moved** between tiers, never deleted at any tier boundary.

## Tier definitions

| Tier | Storage | Cost / GB-month | Latency | Use |
|---|---|---|---|---|
| HOT | Supabase Postgres disk | ~$0.125 | ms (indexed SQL) | Live trading paths, dashboard panels, recent backtests |
| WARM | Supabase Storage `dt-archive` (private, service-role) | ~$0.021 (~6× cheaper) | seconds (HTTPS download → duckdb / polars / pandas) | Analytics jobs, training-set assembly, mid-range backtests |
| COLD | Backblaze B2 `dt-archive-cold` (us-east-005, private) | ~$0.006 (~125× cheaper than disk) | seconds (B2 native API download) | Multi-year retros, scheduled ML training pulls |

Cost projection at current ingest (~511 GB/year B74 substrate): 5 years full-fidelity in cold ≈ $2.55/month total.

## Per-table hot retention

Defined in `module_constants.module_name = 'data_lifecycle'`:

| Table | Hot retention | Rationale |
|---|---|---|
| `equity_spot_ticker_snap` / `equity_perp_ticker_snap` / `crypto_spot_ticker_snap` | 30d | High-churn tick data; older redundant with OHLC |
| `equity_spot_ohlc_1m` / `equity_perp_ohlc_1m` / `crypto_spot_ohlc_1m` | 365d | Trend Mining Engine annual-cycle requirement (Phase 17.6/18.5) |
| `context_bridge_log` | 14d | WebSocket broadcast audit trail; observability sink |

## Manifest (rehydration seam)

Single source of truth: `data_archive_manifest`. State machine `pending → uploaded → verified → active → migrating → migrated`. Crash recovery resumes from last good state. UNIQUE on `(source_table, partition_label, tier)` allows warm + cold rows to coexist during rotation.

Future ML/analytics schedulers query the manifest once instead of needing to know storage layout. Rehydrate via `b75-rehydrate.ts --table X --from D1 --to D2 --out PATH [--restore-cold]`.

## Sweep schedule

| Cron | Script | Action |
|---|---|---|
| `0 2 * * *` | `b70-retention-sweep.ts` | B70 archive tables (signal pipeline events) — UNCHANGED |
| `15 2 * * *` | `b75-retention-sweep.ts` | B74 6 tables export-then-drop fence |
| `30 2 * * *` | `context-bridge-log-ttl.ts` | Month-grouped export + DELETE rounded to month-start + tail VACUUM |
| `0 3 1 * *` | `b75-cold-rotator.ts` | Monthly warm→cold rotation (objects > `default_warm_retention_days=365`) |

## Format + protocol

- **JSONL.gz** (gzip level 6) — inherited from B70 (zero new npm deps; universally readable).
- **Warm uploads** route by size: ≤40 MB single-call REST, >40 MB TUS resumable (6 MiB chunks). 5 GB hard cap per object. Required because Supabase Storage REST hard-limits single-call at ~50 MB even for service-role keys.
- **Storage REST auth** — both `apikey` and `Authorization: Bearer` headers (Supabase rolled out `sb_secret_*` non-JWT format mid-2025 that's rejected as "Invalid Compact JWS" if sent only as Bearer).
- **Cold tier** — Backblaze B2 native bearer-auth API; 23h auth-token cache. Up to 5 GB single-call.

## Database monitor

`module_constants.database_monitor.*` — `plan_cap_mb=204800` (Supabase Pro 200 GB cap, **stable across disk auto-expansions**), `warning_threshold_pct=0.65`, `critical_threshold_pct=0.80`. Pre-B75 thresholds hardcoded against obsolete 10 GiB cap; alarm transitioned CRITICAL → NORMAL post-deploy.

## Forward-couples

- **Trend Mining Engine** (Phase 17.6/18.5, post-launch) — B74 OHLC tables + manifest+warm rehydration for older periods.
- **Future ML/analytics scheduler** — wraps `b75-rehydrate.ts`.
- **B70 retention sweep** — UNCHANGED in B75 (purely additive). Future B75.x can migrate B70 knob into per-table `data_lifecycle.*` registry.

*End of Data Lifecycle Policy. Last updated 2026-05-06 with B75 close.*

---

# Appendix — Calibration Aggregator Framework (post-B76, 2026-05-06)

## What this appendix documents

The chain-final calibration framework refactor shipped in B76 changes how the system measures per-factor predictive lift. This is an **architectural change to the ablation-framework data shape** that downstream analytics consumers must understand.

## The bug B76 fixed (RUNNING_ISSUES #54)

Pre-B76 the calibration aggregator's `shift = real - alt` metric was structurally NOT measuring per-factor effect:

- `realDecision.confidence` stored the raw classifier value (`predictiveConfidence`).
- Each factor's `alternateDecision.confidence` was built from `_modulatedConfChain` AT THE TIME the factor fired — so mid-chain, with later factors not yet applied.
- For divide-out factors: `alt.conf = mid_chain_value / factor`. Subtracting that from raw gives `real - alt = raw - (mid_chain / factor)` — a mix of raw vs partial-chain values, not a clean per-factor measurement.
- For factors FIRST in chain (b67_2_phase_preference, b67_1_macro_modifier): `alt.conf = baseConf` which equals raw `real.conf`, so shift = 0 by construction. b67_2 showed +0.0pp predictive lift through B69.2 era purely as a measurement artifact.

The predictive-lift column (`REAL spread − ALT spread`) was the only trustworthy decision-grade metric pre-B76 because it cancels first-order bias inside each factor's bucket distribution. But absolute "shift" was not trustworthy.

## The B76 fix — two-pass stash-then-build pattern

Both orchestrator emit paths (`server/services/signal-orchestrator.ts` + `server/services/vts-runner.ts`) restructured to:

```
PASS 1 — at each factor's fire point:
  - compute factor value
  - multiply into running `_modulatedConfChain`
  - push `FactorAlternateInput` discriminated-union record onto a stash array
  - NO `buildXAlternate` helper called yet

PASS 2 — after final post-floor clamp on `_modulatedConfChain`:
  - call `buildAllAlternates(stash, chainFinalConfidence, regimeLabel)` from
    `server/services/factor-ablation-builders.ts`
  - dispatcher (TS-exhaustiveness-checked switch) calls existing `buildXAlternate`
    helpers, each computing `alt.conf = chainFinalConfidence / factor`
    (or label-counterfactual semantics for B68.5)
  - `emitAblationRecord(source, pair, {confidence: chainFinalConfidence,
    metadata: {predictiveConfidenceRaw: rawConf, ...}}, alternates, strategy)`
```

**Discriminated-union dispatcher** (`FactorAlternateInput`): 8 kinds (`b67_1`, `b67_2`, `b67_4`, `b68_1`, `b68_2`, `b68_3`, `b68_4`, `b68_5`). Pure data — no closure capture of orchestrator-frame state. Adding a new factor requires (a) extending the union, (b) adding a dispatch arm, (c) pushing inputs at the fire point in BOTH orchestrators. TS exhaustiveness check catches missing kinds at compile time.

**Cohort version marker** — every row written post-B76 is stamped with:

```ts
realDecision.metadata.calibrationFrameworkVersion = CALIBRATION_FRAMEWORK_VERSION;
// where CALIBRATION_FRAMEWORK_VERSION = 'b76_chain_final' as const
```

Exported from `server/services/factor-ablation-emitter.ts`. Aggregator queries that surface b67_1_*/b67_2_phase_dimension/b67_2_phase_preference MUST filter on this marker — those factors are FIRST in chain, so pre-B76 rows have shift=0 by construction; mixing pre/post-B76 contaminates the post-B76 window with structurally-biased noise. The other 7 factors don't need the version filter because predictive lift cancels first-order bias by construction.

## Aggregator query updates

`server/services/drift-dashboard-aggregator.ts`:

- **L504 (`computeAblationComparison`)**: legacy `factor_name NOT IN ('b67_1_macro_modifier', 'b67_2_phase_dimension')` filter REMOVED. This query computes replay-status counts (pending / replayed / unreplayable) — no shift math involved, so legacy factor-name rows showing up here is expected forensic data.
- **L1052 (`computeFactorCalibration`)**: `NOT IN` REMOVED, replaced with version-filter logic:
  ```sql
  AND (
    factor_name NOT IN (
      'b67_1_btc_dominance', 'b67_1_funding_rates', 'b67_1_mcap_momentum',
      'b67_1_macro_modifier', 'b67_2_phase_preference', 'b67_2_phase_dimension'
    )
    OR real_decision->'metadata'->>'calibrationFrameworkVersion' = 'b76_chain_final'
  )
  ```
  Keeps row IF (factor not in the 6 sensitive names) OR (has chain-final marker).

## What B77 fixed

`server/utils/analysis-utils.ts:isBreakEvenTriggered` was hardcoded `gain >= ATR` since B65.1, ignoring the `module_constants.trailing_exit.break_even_trigger_r` row that was plumbed through `TrailingExitConfig` for diagnostics. B77 threaded `breakEvenTriggerR: number = 1.0` 4th arg explicitly so the gate becomes `gain >= ATR * breakEvenTriggerR`. Default 1.0 preserves pre-B77 behavior. Single live caller `trailing-exit-controller.ts:451` updated. Variant K (`break_even_enabled=false`) keeps BE off in production today, so zero behavioral change at current settings; future re-enables for non-crypto asset classes / non-1.0 trigger thresholds will work as designed.

## Verification SQL (post-B76)

```sql
-- All 10 factor names should appear in chain-final cohort
SELECT factor_name, COUNT(*),
       ROUND(AVG((real_decision->>'confidence')::float - (alternate_decision->>'confidence')::float)::numeric, 5) AS avg_shift
FROM regime_factor_alternates
WHERE real_decision->'metadata'->>'calibrationFrameworkVersion' = 'b76_chain_final'
GROUP BY factor_name
ORDER BY factor_name;
```

Expected post-B76: b67_1_btc_dominance, b67_1_funding_rates, b67_1_mcap_momentum, b67_2_phase_preference, b67_4_outcome_feedback, b68_1_multi_tf_agreement, b68_2_volume_regime, b68_3_pair_correlation, b68_4_regime_age, b68_5_path_b_sustainability.

**Critical proof-of-life:** `b67_2_phase_preference` shows non-zero shift. Pre-B76 was 0.0000 by construction.

## Forward-monitor invariant (24-48h post-B76 deploy)

Predictive lift on B68.1, B68.2, B68.3, B67.4 must preserve sign and stay within ±1pp of pre-B76 anchor values:

| Factor | Pre-B76 anchor (rolling_7d) |
|---|---|
| b67_4_outcome_feedback | +2.95pp |
| b68_1_multi_tf_agreement | +5.71pp |
| b68_2_volume_regime | +4.13pp |
| b68_3_pair_correlation | +4.13pp |
| b68_4_regime_age | +2.94pp |
| b68_5_path_b_sustainability | -1.78pp |

If any flips sign → revert via `git revert c8b8709ed 235237ffd` (hotfix first per Langston Step-8 correction, then main). Pure code revert; no schema migration.

*End of Calibration Aggregator Framework appendix. Last updated 2026-05-07 with B76 + B77 close.*

---

# Modularization Phase Architecture (post-B78)

## Why this exists

DawnTrader was implicitly crypto-spot-and-Kraken-only through phase 15c. Adding xstock_spot (Kraken XStocks Pro tokenized equities) and crypto_perp (Kraken Futures perpetuals) required a structural answer to "how does the same scoring pipeline serve different asset classes with different thresholds, friction profiles, and trading calendars?" The Modularization Phase synthesis (`Claude Comms and Packages/Scope Files/MODULARIZATION_SYNTHESIS_FROM_B63_AUDITS.md`) documented the 5-dimensional `(exchange, asset_class, filter, strategy, regime)` resolution hierarchy as the architectural answer; B78 implements the file-system shape that makes the hierarchy ergonomic to populate.

## File-system layout (post-B78)

```
server/
├── asset_classes/
│   ├── crypto_spot/
│   │   ├── pattern-pool-filters.ts         ← live (moved from server/config/pattern-filter-profile.ts)
│   │   ├── regime-thresholds.ts            ← live, leaf module (no imports allowed); 14 named branch-condition exports
│   │   ├── friction.ts                     ← placeholder; populated B79/B80 when multi-asset friction shape is real
│   │   └── index.ts                        ← re-exports the 3 submodules
│   ├── crypto_perp/                        ← scaffolded; populated in B80
│   │   └── {pattern-pool-filters,regime-thresholds,friction,index}.ts (placeholders + NotImplementedError)
│   └── xstock_spot/                        ← scaffolded; populated in B79
│       └── {pattern-pool-filters,regime-thresholds,friction,index}.ts (placeholders + NotImplementedError)
├── exchanges/
│   └── kraken/
│       ├── kraken.ts                       ← REST + WebSocket primitives (moved from services/)
│       ├── kraken-pair-metadata-service.ts ← AssetPairs metadata (moved from services/)
│       └── kraken-data-documenter.ts       ← debug utility (moved from services/)
└── (existing folders unchanged — services/, core/, config/, types/, etc.)
```

**Conceptual modules vs file layout.** The Modularization Synthesis Part II names 8 conceptual modules (Exchange Adapter, Filter Module Family, Context Provider, Eligibility, Scoring Kernel, Threshold, Profitability, Ranking). B78 ships the **physical file partition** that mirrors them, but does not yet promote filters to first-class `module_name='filter:X'` rows in `module_constants` (deferred past B81). The conceptual modules remain represented in code by existing service files (`market-context-engine.ts` = Context Provider, `signal_quality_evaluator.ts` = Eligibility + Threshold, etc.); B78 introduces the **asset-class** + **exchange** axes as orthogonal partitions, leaving the conceptual-module axis for follow-up batches.

## Resolution hierarchy (DB schema, unchanged from B69; surfaced in code by B78 layout)

`module_constants` rows resolve in **most-specific-wins** order:

```
(exact exchange, exact asset_class, exact strategy, exact regime, exact constant_name)
  → (exact exchange, exact asset_class, exact strategy, *)
    → (exact exchange, exact asset_class, *, *)
      → (exact exchange, *, *, *)
        → (*, exact asset_class, *, *)
          → (*, *, *, *)  [global default]
```

Spawning a new asset class = inserting rows for whatever differs from the defaults, plus implementing the asset-class submodule code (regime thresholds, filters, friction). No hard-coded constants to edit, no cross-system refactor.

## What B78 specifically did NOT change

- **Regime classifier branch logic** stays in `server/core/metrics/market-regime.ts`. Only the literal threshold constants (RBS_VOL_MAX, IE_VOL_MIN_PATH_A, etc.) moved to `regime-thresholds.ts`. The if/else cascade order (RBS → IE → TFS → HVU → ST default), the AND/OR combinator structure, and all confidence formulas are unchanged. The threshold-vs-formula trap (literals appearing in both branch conditions and formulas) was respected per pre-audit `BATCH_78_PRE_AUDIT.md` §2 — only branch-condition instances replaced, formula-anchor instances preserved inline.
- **`kraken-websocket-adapter.ts` location:** post-B78 stayed in `server/services/` due to bidirectional cycle with `live-pricing-adapter.ts`. **B78.1 (2026-05-07) broke the cycle via EventEmitter inversion** and moved ws-adapter to `server/exchanges/kraken/`. ws-adapter now extends EventEmitter and emits `priceTick` events; live-pricing-adapter subscribes at module-load. Madge: 47 → 46 cycles, #10 absent.
- **Per-pair friction model.** `server/core/math/cost-model.ts` and `server/config/exchange-defaults.ts` are exchange-keyed not asset-class-keyed. Extracting per-asset-class friction now would invert the resolution hierarchy. Defer until B79 (xstock_spot) and B80 (crypto_perp) make the multi-asset shape real.

## Calibration cohort scope (post-B78)

`drift-dashboard-aggregator.ts` `computeFactorCalibration` query at L1054 now filters `WHERE asset_class = 'crypto_spot'`. This locks the calibration window to crypto_spot regardless of how much xstock_spot/crypto_perp data accumulates from B79+ shadow-mode VTS. Without this filter, B79 would silently contaminate the rolling 7d calibration tables that the B67.5 consumer-wiring decision (2026-05-15) depends on. The B76 chain-final filter at L504 (`computeAblationComparison`) is independently scoped and untouched.

## Forward path

- **B79** populates `server/asset_classes/xstock_spot/*` with weekend-pause logic (24/5 calendar), threshold derivation (3-layer: domain-knowledge baseline → cross-asset shadow-classify → 48-72h shadow-mode VTS), strategy gate audit, SQE asset-class threshold rows, friction model.
- **B80** populates `server/asset_classes/crypto_perp/*` similarly, with funding-rate per-pair extension to the B67.1 macro modifier (perpetuals have a per-pair funding rate that's a stronger directional signal than the aggregate funding-rate term used for crypto_spot).
- **B81** introduces the `expectedNetReturnR` ranking primitive with pool-relative normalization, leveling the playing field between asset classes by friction-adjusted opportunity score. SQE asset-class threshold rows for xstock_spot + crypto_perp.
- **Cycle-break batch (TBD)** moves `kraken-websocket-adapter.ts` to `exchanges/kraken/` after DI inversion of the `live-pricing-adapter` dependency.
- **Filter-as-first-class batch (B82/B83 TBD)** promotes filters to `module_name='filter:X'` rows in `module_constants` (Synthesis §3.3 first-class filter family).

## Phase 24 retrospective — xstock_spot full onboarding (2026-05-10)

Phase 24 closed with xstock_spot fully integrated across 9 sub-batches: **B79** (dormant scaffold + canonical regime/strategy whitelist + 18-stage walkthrough), **B79.TEC** (per-asset-class TEC config with HARD-FAIL boot), **B79.0a** (live observability scanner via centralClock subscription, telemetry partitioning via separate-instance triad, asset-class-aware data-freshness gate), **B79.0b** (N3+N4 cleanup pattern + signature-guarded wildcard DELETE), **B79.0c** (per-symbol predicate for 24/7 vs 24/5 within an asset class — Kraken Phase 1 names), **B79.0d** (ORB strategy real implementation — detect logic + strategy-engine dispatch + regime mapping + Layer-1 thresholds + ablation auto-include + DB-tunable rollback), **B79.0f** (ticker-collision disambiguation — the SUI bug class — with `XSTOCK_SPOT_KRAKEN_COLLISIONS` set + WARN log + provenance + 4862-row backfill), **B79.0g** (persistence-at-trade-open with `vts_open_trades` table + bootstrap-with-re-resolve + atomic-close-time-deferred-as-pinned-batch), **B79.0e** (`equity_*` → `xstock_*` namespace cleanup — 172 DB objects in single transaction).

The **canonical onboarding workflow** lives at `1-system-manual/ASSET_CLASS_ONBOARDING_WORKFLOW.md`. Sections H.1.x (post-mortem) and H.1.y (updated decision rules) capture every architectural lesson surfaced. Required pre-read for B80 (crypto_perp) + future asset class implementers.

### Architectural patterns established (operational facts of the current system)

These are the architectural truths a new PM needs to understand HOW the multi-asset system actually resolves and stores asset class:

1. **Per-asset-class behavioral config is DB-resolved with HARD-FAIL boot.** Trading-policy decisions (BE enable, trailing rules, regime thresholds, confidence floors, friction values) live in `module_constants` with `asset_class` as a first-class scoping dimension. Boot-time warmup (e.g. `primeTECConfig()` at server/index.ts) HARD-FAILS if any registered asset class lacks an explicit row. Wildcard `*` is a starting placeholder ONLY when truly identical across classes; replaced with explicit rows the moment any class diverges. No silent fallbacks per CLAUDE.md §5 #15.

2. **Telemetry partitioning via separate-instance triad.** `getAssetClassInstances(class)` factory returns `{telemetry, ratioManager, failureTracker, scanManager}` — each asset class with materially different signal distributions gets its own instance set. Crypto path returns existing module-scoped globals (back-compat); xstock_spot lazy-instantiates fresh triad with in-memory-only persistence (Day 1 hazard documented in B79 PIA).

3. **Asset-class resolution is exchange-disambiguated, never canonical-form-disambiguated.** `resolveAssetClass(symbol, exchange)` in `shared/asset-classes.ts` keys on the exchange tag (`kraken` vs `kraken-equities` vs `kraken-futures`) PLUS a collision-set gate. The data-ingestion path is the authoritative signal — which WS endpoint or REST domain delivered the data. Downstream consumers READ `asset_class` from the persisted row, never re-resolve from canonical form (post-canonicalization is fundamentally ambiguous for the 9 USD ticker collisions in `XSTOCK_SPOT_KRAKEN_COLLISIONS`).

4. **Persistence-at-trade-open via `vts_open_trades` table.** Open VTS trades are durable rows (hybrid 14 explicit cols + jsonb context for ~20 optional fields); rehydrated on PM2 restart in `server/index.ts` boot sequence after `loadTrailingStates`. Trade-open path AWAITS the INSERT before adding to in-memory `openVirtualTrades` Map (no observer-divergence half-state). Trade-close DELETE is currently fire-and-log async — atomic single-transaction close-time DELETE+INSERT through `persistRealPriceTrade` is RUNNING_ISSUES #91 follow-up (B79.0g-tx).

5. **Ticker-collision gate.** `XSTOCK_SPOT_KRAKEN_COLLISIONS` (17 entries: 9 USD + 8 EUR pre-emptive) is the membership-set the resolver gates against on the regular `kraken` exchange path. Collision tickers (e.g. SUI = both Sun Communities equity and Sui Network crypto) without disambiguating x-suffix route to crypto_spot + emit `[B79.0f][COLLISION_RESOLVE]` WARN log. Provenance comment cites Kraken `/0/public/AssetPairs` source + last-verified date; standing quarterly re-audit rule (Kraken adds tokens regularly).

6. **Cross-asset-class UI component reuse via export+endpointBase prop + explicit `assetClass` prop (B79.0i.b → refined in BATCH_82).** When an asset-class-specific tab needs the same rich tables a primary asset-class tab already renders, the primary's component is exported with an `endpointBase` prop. **BATCH_82 refinement (per Langston design review Q3, 2026-05-14):** alongside `endpointBase`, the component also accepts an explicit `assetClass: AssetClass` REQUIRED prop. The parent component (which already knows which asset class it's rendering, since that's how it chose the endpointBase) passes both. Inside the section component, render-time lookups (e.g. empty-state copy with human-readable label) read `ASSET_CLASS_REGISTRY[assetClass].displayName` directly. **NO URL-string-parsing of the endpointBase to derive the asset class** — that's the brittle anti-pattern (couples render logic to URL convention; rots when futures/forex come online). The explicit-prop pattern scales linearly for N asset classes. Examples post-B82: `FactorCalibrationSection({ endpointBase, assetClass })` + `ExitStrategyAblationSection({ endpointBase, assetClass })` (analytics.tsx). Both crypto callers in `analytics.tsx` Drift tab pass `assetClass="crypto_spot"`; xstock callers in `xstocks-tab.tsx` pass `assetClass="xstock_spot"`. Apply this pattern in B80 (crypto_perp) when building the perp tab.

7. **Shared aggregator parameterization via optional asset_class (B79.0i.b).** When a backend aggregator function needs to serve multiple asset classes, the function signature gains an optional `assetClass` parameter with a default value preserving the legacy behavior. The SQL WHERE clause appends `AND asset_class = $X` ONLY when the parameter is provided (or, when default is a literal like `'crypto_spot'`, the SQL is parameterized rather than hardcoded). **Crypto regression invariant:** any caller that omits the param gets byte-identical pre-change behavior. Verified in B79.0i.b for `computeExitStrategyAblation(window, regimeFilter, assetClass=null)` and `computeFactorCalibration(window, assetClass='crypto_spot')` — post-deploy curl on `/api/analytics/factor-calibration` returns identical row count to pre-deploy. Apply in B80 to any new shared aggregator functions.

### Forward path (post-Phase-24)

- **B80 (crypto_perp)** — apply onboarding workflow Sections A-G; H.2 worked example; identify perp-specific deltas (funding rate per-pair, leverage/liquidation, perpetual settlement, 8-hour funding windows). Run H.1.x checklist explicitly before writing code.
- **B81** — `expectedNetReturnR` ranking primitive with pool-relative normalization for cross-asset parity.
- **B79.0g-tx** (RUNNING_ISSUES #91) — full transactional integration of close-time DELETE+INSERT through `persistRealPriceTrade` (affects B73 + B70 hooks; substantial refactor).
- **B79.x calibration sub-batches** — promote ORB + xstock_spot Layer-1 placeholders to Layer-3-evidence-backed values; rename `risk_reward_ratio` → `target_range_multiple` (RUNNING_ISSUES #90).
- **Cycle-break batch (TBD)** moves `kraken-websocket-adapter.ts` to `exchanges/kraken/` after DI inversion of the `live-pricing-adapter` dependency.
- **Filter-as-first-class batch (B82/B83 TBD)** promotes filters to `module_name='filter:X'` rows in `module_constants`.

*End of Modularization Phase Architecture appendix. Last updated 2026-05-10 with Phase 24 close (B79 + B79.TEC + B79.0a-0g).*

## Phase 24 EXTENDED — xstock_spot pipeline pulled to functional crypto parity (B79.0L → B79.0m.b2, 2026-05-11)

Phase 24 closed 2026-05-10 with the xstock pipeline observability-wired but architecturally divergent from crypto: pattern strategies fired inline within the quant loop (no parallel pattern global+IMF gate), and the family-eligibility gate was a single-iteration filter rather than the multi-lane fan-out crypto uses. Kyle's locked architectural commitment 2026-05-11 — "xstock pipeline mirrors crypto's `fx5-scanner.ts` + `vts-runner.ts` shape EXACTLY; differences live in DB rows, not code" — drove a 4-batch extension (B79.0L, B79.0m / B79.0m.a, B79.0m.b, B79.0m.b2) that closed those gaps.

### Architectural shape after B79.0m.b2 (functional crypto parity)

The xstock_spot per-pair eval pipeline (`server/asset_classes/xstock_spot/eval-cycle.ts`) now runs in this shape:

```
   market-hours → global-filter → MCE → family-IMF (5 lanes)  ||  pattern-filter
                                            ↓                          ↓
                            one lane per passed family   (if pattern passed) one pattern lane
                                                  ↓
                                    per-lane strategy iteration:
                                      - pattern lane → STRATEGY_FAMILY_MAP[s] === 'pattern' ONLY
                                      - family lane → primary OR hybrid (HYBRID_FAMILY_ELIGIBILITY)
                                                       OR multi-family (MULTI_FAMILY_ELIGIBILITY) match
                                                  ↓
                       detect → setup-hash → finalScore → Net-EV → archive → registerOpenVtsTrade
```

A pair passing **N family IMFs** AND **the pattern filter** produces **N+1 distinct evaluation lanes**. Each lane runs its eligible strategies; each `signal_eval_archive` row carries the lane's `sourcePool` in `features` jsonb (e.g. `'xstock-trend'`, `'xstock-strong_trend'`, `'pattern'`). This mirrors crypto's `taggedVtsSurvivors` shape in `fx5-scanner.ts:1607-1643` exactly.

### What lives in code vs. DB (parity invariant)

The architectural commitment "differences live in DB, not code" is enforced by these key facts:

- **Family IMF thresholds** — DB row at `screener_filters WHERE asset_class='xstock_spot' AND filter_path IN ('vts_trend', 'vts_reversal', 'vts_breakout', 'vts_oscillator', 'vts_strong_trend', 'active_*')` (10 rows × 5 paths × 2 modes — seeded B79.0m.a).
- **Pattern IMF thresholds** — DB row at `screener_filters WHERE asset_class='xstock_spot' AND filter_path IN ('vts_pattern', 'active_pattern')` (4 rows × 2 paths × 2 modes — seeded B79.0m.b2; cloned from crypto baseline LQ=43, VN=0.98, DI=3/5).
- **Global filter** — DB row at `screener_filters WHERE asset_class='xstock_spot' AND filter_path='active_quant'` (one row per mode — seeded B79.0m.b).
- **Pattern-pool guardrails** — `module_constants.pattern_pool_gates.xstock_spot.{final_score_floor=0.45, max_position_pct=0.50}` (seeded B79_inherit_crypto 2026-05-07).
- **Strategy enablement** — `module_constants.strategy_gates.xstock_spot.<strategy>.enabled` (19 rows, 10 enabled, 9 disabled — seeded B79.0m.a).
- **TEC config (BE / trail / target_lock)** — `module_constants.trailing_exit.xstock_spot.*` (seeded B79.0m.b TEC migration).

### Strategy lane membership (10 enabled strategies for xstock_spot, all LONG-only)

| Strategy | STRATEGY_FAMILY_MAP | Eligible lanes |
|---|---|---|
| `breakout` | `'breakout'` | xstock-breakout |
| `mean_reversion` | `'reversal'` | xstock-reversal |
| `range_trade` | `'reversal'` | xstock-reversal |
| `sma_trend_ride` | `'trend'` | xstock-trend |
| `vwap_bounce` | `'breakout'` | xstock-breakout |
| `vwap_pullback` | `'trend'` + multi-family `['strong_trend']` | xstock-trend, xstock-strong_trend |
| `inside_bar_reversal` | `'pattern'` | pattern |
| `morning_star` | `'pattern'` | pattern |
| `pivot_shift` | `'hybrid'` + HYBRID_FAMILY_ELIGIBILITY `['trend','pattern']` | xstock-trend (the 'pattern' parent is enforced at detect-time via patternInput, not lane membership) |
| `orb` | `'breakout'` (added B79.0m.b2) | xstock-breakout |

The `isStrategyEligibleForLane(strategyKey, lane)` helper in `server/asset_classes/xstock_spot/lane-eligibility.ts` is the single source of truth for this routing.

#### Active-path per-class strategy gate (P19-B4a, 2026-06-14)

On the ACTIVE build path the per-class strategy enablement above is enforced by a DB-resolved gate at the `buildSizedSignalForStrategy` chokepoint (right after the stamp-missing throw): `isStrategyEnabledForAssetClass(canonicalStrategy, assetClass)` reads `module_constants.strategy_gates.<class>.<strategy>.enabled` and returns `null` (drop) when the strategy is disabled for that class. A reverse-alias `range_trading → range_trade` reconciles the type-union strategy name to the canonical gate key. **This REPLACES the orchestrator's old hardcoded `enabledStrategies` allowlist** (two inline `[9]` literals + a `Set` + two now-dead public methods, all disposed — DELETED_COMPONENTS_LOG). The gate is **default-open**: the DB resolver is the sole authority and throws on a cold cache, but absent an explicit disable row a strategy runs (an explicit-allowlist would have blacked out ALL crypto until a separate crypto_spot seed migration). The `/reb-2-12F/strategy-health` diagnostic, which had been regex-parsing the orchestrator source text for the deleted `Set`, was re-pointed at `STRATEGY_DISPLAY_NAMES` (a fragile source-text coupling removed).

### LONG-only invariant (per-strategy enforcement)

Every enabled xstock_spot strategy MUST return `null` (with `setNullReason('sell_disabled_long_only')`) when the detection geometry would produce a SELL signal. Verified per-strategy 2026-05-11:

- `inside_bar_reversal`, `morning_star`, `pivot_shift` — gate at `direction === 'BUY'` check before signal construction.
- `orb` — gates `!upBreak` branch returning null (fixed B79.0m.b2; mirrors `inside-bar-reversal.ts:131-134`).
- `breakout`, `mean_reversion`, `range_trade`, `sma_trend_ride`, `vwap_bounce`, `vwap_pullback` — in-class `strategy-engine.ts` methods; LONG-only by construction (no SELL branch in source).

`UNIVERSALLY_DISABLED_STRATEGIES` set in `vts-runner.ts:440` excludes `liquidity_trap` from iteration entirely (bearish-by-design strategy, awaiting bullish redesign per Batch 45 directive).

### B73 exit-strategy ablation — asset-class OHLC source dispatch

`exit-strategy-replay-service.ts:fetchOhlcForReplay` branches on `assetClass`:
- `crypto_spot` → `ohlcCache.getOHLCData()` via Kraken REST (existing path).
- `xstock_spot` → Drizzle query against partitioned `xstock_spot_ohlc_1m` table (EXPLAIN ANALYZE 1.035 ms verified pre-deploy, all 13 partitions have child indexes on `(symbol, interval_begin DESC)`).

**BATCH_82 (2026-05-14) — type-system-enforced caller-resolves.** `ReplayContext.assetClass: AssetClass` is non-nullable (was `?: string` with `?? 'crypto_spot'` fallback at both consumer sites). The `??` fallbacks at `exit-strategy-replay-service.ts:264` (SQL VALUES bind for the ablation row INSERT) and `:294` (OHLC fetch arg) are dropped — both consume `ctx.assetClass` directly. The sole caller (`vts-service.persistRealPriceTrade:967`) threads `tradeData.assetClass` explicitly. **Compile fails if any future caller forgets** — closes the silent-crypto-default anti-pattern that drove B-NEW-20/22/25/26/28. Async fire-and-forget on close; `_b79XstockReplayErrors` counter + `[B73-REPLAY][XSTOCK]` log surface async failures observationally.

**F-NOW (B-XSTOCK-CALIB, 2026-06-01) — calibration-era tag propagation.** `persistExits` now also stamps `exit_strategy_alternates.calibration_state` from the parent trade. The value is resolved ONCE per close via `resolveCalibrationState(ctx.vtsOpenTradeId)` — `vtsOpenTradeId = originalSignalId = vts_open_trades.id`, threaded from `vts-service.ts:978`. This is NOT `ctx.tradeId` (rebuilt from symbol+exitTime at vts-service.ts:816, so it never equals the open id — a `WHERE id=tradeId` would silently never match). Returns null (→ untagged row, INCLUDED by the aggregator) for paper-sourced replays / missing parent / lookup error. SSOT-from-parent makes it flip-proof for the eventual Phase-25 calibration boundary. The aggregator's `buildCalibrationClause(assetClass, excludePreCalibration)` exclusion is opt-in default-off → live panels unchanged; INERT until a Phase-25 caller passes `true`. VTS-only; the active-paper path is untouched.

### Factor ablation emit — type-enforced asset-class threading (BATCH_82)

`emitAblationRecord(source, pairSymbol, realDecision, alternates, assetClass, strategy?)` carries `assetClass: AssetClass` as a REQUIRED parameter (no default). Pre-B82 the row builder hardcoded `assetClass: 'crypto_spot'` at `factor-ablation-emitter.ts:236`. Every xstock VTS-emitted ablation row 2026-05-11 → 2026-05-14 was silently mis-tagged crypto_spot until B82 shipped. Both production callers (`signal-orchestrator.ts:959` and `vts-runner.ts:1794`) pre-compute `resolveAssetClass(symbol, 'kraken')` and pass it explicitly. The structural fix is the type-system gate, not a runtime check — TypeScript blocks merge of any future caller that omits the parameter.

### Cross-cutting invariant — writer-side asset-class threading (BATCH_82 standing rule)

Every persistence site that writes an `asset_class` column MUST receive the value through a typed parameter from the caller. NO hardcoded literals (`'crypto_spot'`), NO `??` fallbacks. This applies to:
- `factor-ablation-emitter.ts` (regime_factor_alternates)
- `exit-strategy-replay-service.ts` (exit_strategy_alternates)
- Future writers when new asset-class-scoped tables are added

When adding a new asset class, the pre-launch grep `grep -rn "asset_class" server/services/` enumerates every site that touches the column. Each site is verified to accept a typed parameter — no exceptions.

### Stamp-at-source — `SizingContext.assetClass` is the single source of truth on the active build path (P19-B4a, 2026-06-14)

The BATCH_82 writer-side rule (thread the typed value from the caller) is extended to the active signal-build path by **stamping the asset class once at the per-pipe entry chokepoint and never re-deriving it from the symbol downstream.** `SizingContext.assetClass` is a REQUIRED field (`AssetClass`, no `?`) on the orchestrator's `buildSizedSignalForStrategy` input, and it is the SINGLE source of truth for asset class through sizing → friction/EV → cache-context → SQE → RTB queue. It is stamped at construction: the crypto pipe at `evaluateMarket` (`'crypto_spot'`), the xStock active pipe at the dispatch connector (`'xstock_spot'`). The ~9 symbol-derived sites inside the build method read `sizingContext.assetClass` — NOT `resolveAssetClass(rawSignal.symbol)`.

**Why re-deriving from the symbol is wrong-by-construction.** The 17 collision tickers (9 USD + 8 EUR — e.g. `SUI/USD`) have an identical canonical form as BOTH an xStock and a crypto pair, so `resolveAssetClass(symbol)` always returns `crypto_spot` for them (the collision rule in `asset-classes.ts`). Only the PIPE that built the signal knows its true class. The invariant: **one `SizingContext` = one class = one pipe.** Consequence for the EV gate — a collision xStock re-resolved as crypto would read CRYPTO friction at the Net-EV computation, mispricing the gate. `resolveAssetClass` survives ONLY for stored-row / diagnostic re-resolution (its collision rule is intentionally kept there for re-reading already-stored rows); it is removed from the active build path.

**Fail-loud both ways:** a build-site assert (names pipe + symbol + strategy) is the primary tripwire; the RTB write THROWS on a missing/invalid class as the backstop (catches an as-any / JSON-boundary loss). When adding a new asset class with an active-paper pipe, stamp `SizingContext.assetClass` at the pipe's entry connector — never let a downstream site re-resolve from the symbol.

### Per-cycle xstock counter surface (B79.0m.b2 additions)

`XstockEvalCycleCounters` (defined in `eval-cycle.ts`) tracks per-cycle + lifetime accumulator:

| Counter | What it counts |
|---|---|
| `pairsEntered` | Pairs entered the eval pipeline this cycle |
| `pairsFailedMarketHours` | Failed `isXstockMarketOpenUTC` gate |
| `pairsFailedGlobalFilter` | Failed quant-side global filter |
| `pairsPassedFamilies` / `familyQualifiedUnique` | Pairs passing ≥1 family IMF (unique-pair count) |
| `familyFanOutSum` | Sum of (pairs × families passed) — fan-out total |
| **`pairsPassedPattern`** | Pairs passing pattern-filter (B79.0m.b2 NEW) |
| **`pairsFailedPattern`** | Pairs failing pattern-filter (B79.0m.b2 NEW) |
| **`patternRejectByMinHistory`** | Pairs failing pattern-filter on 60-bar floor — INSTANT TRIPWIRE for §-1.1 implementation correctness (B79.0m.b2 NEW) |
| **`patternFanOut`** | Pairs admitted to pattern lane (B79.0m.b2 NEW) |
| `strategiesEvaluated` / `strategyNulls` / `signalsGenerated` | Per-lane strategy iteration outcomes |
| `tradesOpened` | Trades opened via `registerOpenVtsTrade` |
| **`archiveFailures`** | `signal_eval_archive` insert exceptions (B79.0m.b2 NEW) |
| `byStrategy` | Per-strategy {evaluated, nulls, signals, rejected, trades} |

These surface in PM2 logs via `[B79.0m.b2][SCAN_EVAL_DONE]` line and in `/api/xstocks/filter-diagnostics` response (lastScan + 24h rolling sections).

### Layer-3 calibration debt logged

- Hardcoded 60-bar floor in `pattern-filter.ts` + `global-filter.ts:109` → migrate to `module_constants.pattern_pool_gates.min_bars_for_eval`. **CLOSED 2026-05-15 (B-NEW-34):** both consumers now read `module_constants.xstock_spot.min_ohlc_history_bars=24` (single SSOT row, asset-class-scoped). Floor lowered from 60 to 24 bars to align with 60-min bar architecture — 60 hourly bars would have required 2.5 trading days of history, blocking thinly-traded names. 24 bars = 24 hours of history; chosen over CC-proposed 20 for indicator headroom and Monday-morning resilience.
- Pattern strategy `module_constants.strategy.<name>.*` wildcard-only for xstock_spot (26 rows confirmed) → Layer-3 seeds xstock-scoped overrides for ATR-multiplier knobs.
- `scanPatterns()` ATR multipliers (1.5×/2.5×) crypto-tuned → may need different for equity microstructure.
- VN dominance in family-IMF rejection (31% of fails) → recalibrate `vn_max` for equity tape post-RTH evidence.
- **B-NEW-34 calibration debt (~12 indicator/threshold concerns) — Phase B of `XSTOCK_CALIBRATION_PLAN.md` rev 2.** Bar-interval change from 1-minute to 60-minute changes the meaning of any rolling-window threshold expressed in periods. Specifically: 300-period Z-score window was 5 hours on 1-min bars; now 12.5 days on 60-min bars (samples regime-stable vs intraday-momentum). VN dominance percentage may shift dramatically. Family-IMF thresholds, LQ thresholds, DI windows, ATR-distance multipliers ALL re-evaluated against 60-min bar evidence post-RTH 2026-05-19+ in calibration plan Phase B.

*Updated 2026-05-11 with B79.0m.b2 close — xstock pipeline at functional crypto parity in code; live trade flow pending RTH 2026-05-12 13:30 UTC verification. Updated 2026-05-15 with B-NEW-34 close — xstock scanner switched to 60-minute bars (see "Bar interval — design rationale" subsection below).*

---

## Phase 24 EXTENDED 2 — xstock scanner bar-interval switch to 60-minute parity (B-NEW-34, 2026-05-15)

### Bar interval — design rationale

**Canonical xstock_spot scanner bar interval is 60 minutes** (matching crypto's `interval=60` Kraken-REST native). Locked 2026-05-15 per Kyle directive after diagnostic investigation surfaced that the pre-B-NEW-34 1-minute-bar architecture was producing 26-of-75 pairs scanned per cycle in steady state (vs target ≥70), with the 90-second ticker_snap freshness gate behaving as a hidden gate even on liquid names.

**Why 60-minute, not 1-minute or 5-minute:**

DawnTrader is a swing-trading system, not a high-frequency-trading or intraday-momentum system. The strategy taxonomy is built around regime-stable price geometry (trend, reversal, breakout, oscillator) and pattern-formation evidence over hours-to-days timeframes. The decision-relevant timeframe is the 60-minute bar — long enough that intraday tick noise is integrated out, short enough that a full trading day still produces 6-8 decision points. This matches the crypto pipeline's `interval=60` Kraken-REST pull and the legacy intent documented at `bridge/canonical/DawnTrader_System_Architecture_Execution_Flow.md` (corrected from incorrect "5-minute intervals" wording in B-NEW-34 governance pass).

**Why local SQL aggregation, not Kraken REST:**

Kraken has NO equities REST API at any subscription tier. Verified empirically across the B79.0k investigation (2026-05-10) AND a fresh probe 2026-05-15 (`pair=TSLAxUSD&interval=60` returns `EGeneral:Invalid arguments`). xStocks exist exclusively on the `wss://ws-equities.kraken.com` WebSocket infrastructure with no public REST cousin. The B74 archive captures the WS-fed 1-minute bars to local Supabase (`xstock_spot_ohlc_1m`), and the B-NEW-34 aggregator rolls those into 60-minute bars on demand.

**Why partial-bar emission (not end-of-bucket gating):**

The currently-forming 60-minute bar is included in the returned series, matching crypto's Kraken-REST behavior where `interval=60&since=...` returns the still-forming bar as the last entry. Strategy detectors are written to handle partial-bar semantics (the strategy-engine treats the most recent bar as "current state, may evolve"). End-of-bucket gating would discard 0-60 minutes of price action and contradict the crypto path's contract.

**Why UTC alignment (not session-local):**

Both 60-minute (boundaries at HH:00 UTC) and 240-minute (boundaries at 00/04/08/12/16/20 UTC) bars use epoch-floor alignment (`to_timestamp(floor(extract(epoch from t) / N) * N)` where N=3600 for 60-min, 14400 for 240-min). This matches Kraken's native `interval=60` and `interval=240` candle boundaries and is invariant to postgres session timezone, Node host timezone, and deployment region. Two earlier candidates (`date_trunc('hour', timestamptz)` and `to_timestamp(...) AT TIME ZONE 'UTC'`) were both caught and rejected during Langston Step 4 R4 review — the former is silently session-TZ-dependent, the latter downcasts timestamptz to TZ-naive timestamp before pg-driver render and breaks on any non-UTC host.

**Why 240-minute pre-warm is currently disabled:**

The 240-minute (4-hour) aggregation infrastructure ships in B-NEW-34 (in `ohlc-aggregator.ts` and `xstock-ohlc-cache.ts`) but the fire-and-forget warm-fetch in `scanner.ts:runCycle` is commented out. Two reasons: (a) no canonical scanner path consumes 240-min bars yet — the data is staged for future multi-TF agreement wiring (Phase D of `XSTOCK_CALIBRATION_PLAN.md`); (b) the warm-fetch is currently blocked by the B74 source-side duplicate-row bug (see next subsection) and statement_timeout cancellation on 9M-row scan queries. Once B-NEW-35 lands (B74 source dedup), the 240-min warm-fetch is re-enabled.

### B74 archive duplicate-row workaround (DISTINCT ON dedup at query time)

**The bug.** The `xstock_spot_ohlc_1m` table is being written by the B74 WebSocket archive with **18-56× duplicate rows per `(symbol, interval_begin)`**. Every intra-minute tick produces a fresh row rather than upserting one closed bar per minute. Empirical (AAPL/USD over 2-hour lookback, 2026-05-15): 4876 rows for 103 distinct minutes; one specific minute (13:31:00 UTC) had 227 rows with 227 distinct OHLCV tuples, $1.78 close spread. Distribution holds across all time windows: last 1h = 56×, last 4h = 18×, last 24h = 20×, older = 21×. Older rows hold partial-bar state (open held constant, high/low/close/volume evolving as more ticks arrived); only the latest row per `(symbol, interval_begin)` (highest `captured_at`) holds the full minute's OHLCV.

The PK `(interval_begin, symbol, id)` includes the `id` bigserial, which allows many rows per `(symbol, interval_begin)` — no UNIQUE constraint exists. The May 2026 partition holds 13.5M rows in 3.4GB on disk.

**The aggregator workaround (B-NEW-34 hotfix 3).** `ohlc-aggregator.ts` applies `DISTINCT ON (symbol, interval_begin) ORDER BY symbol, interval_begin, captured_at DESC, id DESC` as a CTE before the bucketing CTE. This picks the latest-tick (closed-bar) snapshot per minute, then rolls up 60 of those into one 60-minute bar via the standard `array_agg(... ORDER BY)` pattern. Without the dedup, the rollup's MAX/MIN/SUM would over-count the same minute's high/low/volume dozens of times.

**The structural fix (B-NEW-35, SHIPPED 2026-05-20).** See the dedicated chapter "Source-side dedup architecture (B-NEW-35)" below for the full structural-correctness model that replaced this DISTINCT ON workaround. The aggregator's DISTINCT ON CTE is preserved for now as defense-in-depth even though the UNIQUE constraint at the DB level now guarantees no duplicates can land.

### Cache architecture — asset-class-scoped, not shared

`server/services/xstock-ohlc-cache.ts` is a SEPARATE instance from crypto's `ohlcCache` — distinct singleton, distinct internal Map, distinct TTL counters. The 5 collision tickers (CVX, DASH, MET, OPEN, SUI exist in both crypto and xstock universes per `XSTOCK_SPOT_KRAKEN_COLLISIONS`) are unambiguous at this layer because no shared lookup table is consulted. Per Langston R2 §1.2 design ask: "asset-class-scoped by construction; no x-suffix needed at this layer."

Cache depth caps (after hotfix 2 reduction): 60 bars for 60-min (~2.5 trading days of hourly history), 30 bars for 240-min (~5 trading days of 4-hour history — currently unused while warm-fetch suspended). Initial 200/60 was reduced 4× after staging-verify showed source-row workload was too large for postgres `statement_timeout=2min`.

### Filter-floor SSOT promotion

`module_constants.xstock_spot.min_ohlc_history_bars=24` is the single source of truth read by BOTH `global-filter.ts` and `pattern-filter.ts`. Previously these were hardcoded `ohlc.length < 60` constants; the B-NEW-34 migration consolidates them onto one DB-governed key. 24 bars chosen for indicator headroom (most strategy detectors need 14-20 bars for ATR/regime/DI computation) plus Monday-morning resilience (a stock with light weekend data still has 24h of US-session history available).

### Freshness gate REMOVED for xstocks

`server/utils/data-freshness.ts` had an xstock_spot branch reading `module_constants.market_data.xstock_spot.data_freshness_window_ms` (90s default) and a closed-market short-circuit. **Both removed in B-NEW-34.** The `data_freshness_window_ms` row was DELETED from module_constants. The xstock scanner now treats OHLC bar history as the source of truth — if you have ≥24 bars, you're evaluatable; if you don't, you're not. No ticker_snap-based freshness gate. ticker_snap is still queried for bid/ask enrichment to feed the `max_bid_ask_spread` filter (B-NEW-14) but the absence of fresh ticker data does NOT block evaluation; the spread check sentinel-skips via -1.

*Added 2026-05-15 with B-NEW-34 close.*

---

## xStock 60-min snapshot architecture (B-NEW-34b, 2026-05-18 night)

*Added 2026-05-18 night with B-NEW-34b close.*

### Problem the snapshot architecture solves

The B-NEW-34 ship (2026-05-15) moved the xStock scanner from ticker-snap-based scanning to per-cycle 60-minute OHLC aggregation with a 24-bar floor. It worked Friday afternoon because the market was open and the 60-hour wall-clock lookback contained ~60 hours of bar-producing minutes. The first full weekend after deploy surfaced a structural mismatch: the xStock unified weekend close (Fri 8PM ET → Sun 8PM ET) eats 48 hours from any wall-clock window. By Monday's ARCA reopen at 13:30 UTC, the 60-hour window contained only ~12 hours of bar-producing minutes per symbol, yielding ~20 buckets — below the 24-bar floor. Scanner `insufficient_history=75` on every cycle.

B-NEW-34a attempted lookback widening (60h → 240h → 168h → 120h). All three iterations failed: 240h and 168h hit the 25-second per-cycle SCAN_TIMEOUT because the Postgres DISTINCT ON dedup over B74's 18-56× duplicate source rows scales linearly with window depth; 120h ran intermittently but with no margin for further B74 source-table growth. Kyle directive 2026-05-18 22:25 UTC: lookback-tune is the wrong axis.

### The architecture

Pre-aggregate the 60 most-recent 60-min buckets per symbol ONCE per pre-warm run (slow query, fine for an offline job with no scanner deadline) into a dedicated snapshot table, then have the scanner-hot-path cache read from that table on cold start plus a small NARROW (24h) live-overlay window for the recent tail. The live overlay catches anything that arrived since the last snapshot refresh; the snapshot covers the historical bars that don't change minute-to-minute.

Three artifacts plus one optional aggregator-API change:

1. **`xstock_spot_ohlc_60m_snapshot` table.** `(symbol VARCHAR(32), bucket_ts TIMESTAMPTZ, open/high/low/close NUMERIC(20,8), volume NUMERIC(28,8), source_bar_count INTEGER, captured_at TIMESTAMPTZ)`. PK on `(symbol, bucket_ts)` for idempotent UPSERT. Descending btree index on `(symbol, bucket_ts DESC)` so the "give me the last 60 per symbol" hot read uses a backward index scan with no sort step. Bounded ~16k rows max (265 symbols × 60 buckets).

2. **`scripts/b-new-34b-prewarm-snapshot.ts` pre-warm script.** Per-symbol single-SQL DISTINCT ON aggregation at 14-day lookback (default; configurable via `--days N`). UPSERTs the MAX_BARS_60M (60) most-recent buckets per symbol into snapshot via multi-row INSERT with ON CONFLICT DO UPDATE. Per-symbol latency ~15-25 seconds; total runtime 5-15 minutes for the full 265-symbol universe. Idempotent. Flags: `--symbols A/USD,B/USD` for targeted reruns, `--dry-run` for validation. Per-symbol queries (not batched) because the per-cycle scanner deadline doesn't apply — a single symbol's partition is small, the DISTINCT ON dedup runs quickly, and no cross-symbol scan blowup occurs.

3. **`xstock-ohlc-cache.ts:getOHLCDataBatch` cold-miss path rewrite.** For 60-min interval cache misses:
   - **Step 1:** `readSnapshotBars(missedSymbols)` — single SQL with a ROW_NUMBER window function partitioning by symbol and ordering by bucket_ts DESC, taking the top 60 per symbol. PK-indexed scan, cheap.
   - **Step 2:** `aggregateXstockOHLC(missedSymbols, 60, NARROW_OVERLAY_HOURS_60M=24)` — live aggregator with the new optional `lookbackHoursOverride` parameter at 24 hours. Catches everything written to `xstock_spot_ohlc_1m` in the last 24h since the snapshot was refreshed.
   - **Step 3:** `mergeBars(snap, live)` per symbol — Map keyed by bucket timestamp; live overrides on collision; sorted ASC; capped to 60 most-recent.
   - **Step 4:** cache the merged result and return.
   - **Step 5 (fire-and-forget):** `writeBackSnapshot(merged)` UPSERTs the most-recent `WRITE_BACK_RECENT_BUCKETS=24` buckets per symbol back to snapshot so the table stays ≤5min stale during active scanning. The "24" matches the overlay window — those are exactly the buckets where late-arriving 1-minute source rows can shift values.

4. **Aggregator narrow-window override (new optional param).** `aggregateXstockOHLC(symbols, intervalMinutes, lookbackHoursOverride?)`. Default `LOOKBACK_HOURS_60M=120` is preserved as the FORENSIC-CALLER fallback for direct invocations (b-phase-a2-backfill, ad-hoc tools) — silently shrinking it would corrupt forensic replays in a way that's hard to detect. Scanner/cache contexts MUST pass `lookbackHoursOverride`. WARNING block at the function header documents the policy.

### Net effect on per-cycle DB cost

The pre-B-NEW-34b path scanned ~11M source rows per cache miss (120h × 60 1m/h × 75 syms × ~21× B74 duplication) and ran DISTINCT ON over the entire result. Post-B-NEW-34b:
- Snapshot read: ~4,500 rows max via PK-indexed scan (~fast).
- Live overlay: 24h × 60 × 75 × 21 = ~2.3M source rows pre-DISTINCT-ON (~4× cheaper than 60h, ~5× cheaper than 120h).
- Write-back: 75 syms × 24 buckets = 1,800 row UPSERT in a single multi-row INSERT.

Net per-cycle DB IO drop ~75-85% vs the abandoned 120h live path. The Supabase Disk IO Budget warning (received 2026-05-18 ~14:40 ET) is substantially eased.

### Lifecycle and the manual pre-warm protocol

The snapshot table needs a fresh-enough state at scanner cold start. During active scanning, the cache's write-back-on-miss path keeps the snapshot ≤5 min stale automatically. Between active-scanning windows (e.g., across a deploy, a long downtime, or the weekly weekend close), the snapshot can drift.

**Interim manual pre-warm protocol (until B-NEW-36 lifecycle controller ships):** anyone restarting the staging scanner — for any reason — must run `npm run b-new-34b:prewarm -- --days 14` BEFORE `pm2 restart`. Skipping it means the first cache cold-miss after restart reads stale snapshot rows + the narrow 24h overlay; if the snapshot is more than 24 hours stale, a gap opens between snapshot's most-recent bucket and the live overlay's window start for 24/7 names. The B-NEW-36 batch will automate the Fri-shutdown + Sun-startup pre-warm runs as part of the off-hours session-lifecycle controller.

### Reference

- Implementation: commits `d9031fe8d` (initial) + `4fd780c3d` (Langston Step 4 revisions).
- Migration: `drizzle/migrations/2026-05-18-b-new-34b-xstock-60m-snapshot.sql` + rollback.
- Pre-warm script: `scripts/b-new-34b-prewarm-snapshot.ts`; npm script `b-new-34b:prewarm`.
- Code: `server/services/xstock-ohlc-cache.ts` (`readSnapshotBars`, `mergeBars`, `writeBackSnapshot`, `NARROW_OVERLAY_HOURS_60M`, `WRITE_BACK_RECENT_BUCKETS`); `server/asset_classes/xstock_spot/ohlc-aggregator.ts` (`lookbackHoursOverride` param).
- Langston Step 4 design review (APPROVE WITH 3 FINDINGS + Q1-Q7 ACK + deploy-blocker direction): `Claude Comms and Packages/Langston Design Asks/B_NEW_34b_design_review_rev1.md`.
- RUNNING_ISSUES #118 (B-NEW-34a abandoned → B-NEW-34b shipped) + #119 (`_migrations` ledger drift, separate batch).

---

## xStock bar-frequency switch 60-minute → 15-minute + paired recalibration (B.4 foundation, 2026-06-04)

*Added 2026-06-04 with B.4 foundation close. SUPERSEDES the "canonical xstock_spot scanner bar interval is 60 minutes" lock above — the canonical xStock evaluation bar is now 15 minutes. The 60-minute B-NEW-34 / B-NEW-34b chapters above are preserved as historical record + the still-live 60m snapshot/cache code path (the 60m table is retained for the DBS archive + as the parity baseline).*

### Why 15 minutes (the W1 study consensus)

The W1 bar-frequency study (CC + Langston, 2026-06-03) chose 15-minute bars over 5/30/60 on **structure** (a 2-hour hold spans 8 fifteen-min bars vs only 2 sixty-min bars — the 60-min architecture left too few decision points per hold), **stability** (the higher per-bar flip-rate seen at finer bars is a bar-count-lookback artifact that time-anchoring removes), and **ORB-revival** (ORB needs a sub-hourly opening range — 60-min bars left no intra-hour opening range). Pattern forward-edge was weak at every bar size (<0.55 AUC, not decision-grade), so the decision rested on structure + stability + ORB. The switch is therefore NOT a pure plumbing change — it required full paired recalibration so every threshold expressed in periods or tuned against 60-min evidence keeps its intended wall-clock meaning at 15m.

### The core principle: TIME-ANCHORED, not bar-count-anchored

Any rolling-window threshold expressed in BARS changes meaning when the bar size changes. B.4 converts every bar-sensitive lookback to its wall-clock equivalent, so a window that meant N hours at 60m means the same N hours at 15m (4× the bar count). Per-class `module_constants` (xstock_spot, hard-fail no-default) carry the converted values; crypto keeps the shared in-code defaults:

| Lookback | 60-min value | 15-min value | Wall-clock preserved |
|---|---|---|---|
| Regime momentum lookback | 30 bars | 120 bars | ~30 h |
| Regime ADX period | 14 bars | 56 bars | ~14 h |
| DBS lookback period | 48 bars | 192 bars | ~48 h |
| DBS EMA fast | 12 bars | 48 bars | ~12 h |
| DBS EMA slow | 26 bars | 104 bars | ~26 h |
| DBS / normalization ATR period | 14 bars | 56 bars | ~14 h |

**Crypto isolation BY CONSTRUCTION.** Crypto reads NONE of the new per-class keys — it continues on the shared `DEFAULT_REGIME_CONFIG` (momentum 30 / ADX 14) and `DEFAULT_DBS_CONFIG` (lookback 48 / EMA 12-26 / ATR 14). The regime lookbacks resolve via uniform class-keyed resolution over `getActiveAssetClasses()` with a **startup PARITY ASSERTION** that throws if crypto's resolved config ever drifts from the DEFAULT (30/14). DBS uses Langston's Option B (xStock-only resolution from `module_constants`; crypto keeps the in-code default — the two are separate scanner functions so there is no same-function split-brain, unlike the regime if-branch which B.4 unified into the class-keyed map). The shared `DBSConfig` type is tsc-enforced across both. Three crypto-isolation proofs gate the batch: uniform resolution landing crypto on DEFAULT configs; the startup parity assertion; the shared tsc-enforced type.

### Bar plumbing

The aggregator (`ohlc-aggregator.ts`) gains a 15-minute target interval alongside 60/240: bucket expression `floor(epoch/900)*900` (N=900 seconds), `MAX_BARS_15M=240` cap, `LOOKBACK_HOURS_15M` default. A NEW `xstock_spot_ohlc_15m_snapshot` table (sibling to the B-NEW-34b 60m snapshot, same schema/PK/index shape, bounded ~63.6k rows = 265 syms × 240 buckets) holds pre-aggregated 15m buckets. The cache (`xstock-ohlc-cache.ts`) gains a 15m branch mirroring the 60m snapshot-first cold-read path, DRY-parameterized so `readSnapshotBars` / `mergeBars` / `writeBackSnapshot` take `(tableName, cap)` — the 60m sites pass their prior literals (bit-identical), the 15m branch uses the new table + cap 240 + 6h overlay + 24-bucket write-back. The forming (in-progress) 15-minute bar is still included in the returned series (same partial-bar contract as 60m + crypto). The activation is the scanner's `getOHLCDataBatch(symbolList, 15)` flip — built inert and flipped LAST, gated on the regime-label parity exit-gate sign-off (flipping before recalibration was the silent regime-collapse this batch guards against).

### Recalibrated regime thresholds + the parity exit gate

The replay-driven recalibration study (485 symbols, 34 days, ~101.8k 60m + ~300.9k 15m bars rebuilt from the clean 1-minute archive) found: volatility roughly HALVES 60m→15m (median 0.0059→0.0036), ADX COLLAPSES (mean 34.8→16.7), momentum + |DBS| are near-invariant. 14 xStock regime thresholds were recalibrated percentile-preserving + via the CALIBRATION-LENS (vol cutoffs ↓~40%, ADX cutoffs ↓~50%, DBS cutoffs ~flat) and written to `server/asset_classes/xstock_spot/regime-thresholds.ts` (60m-old values retained inline as comments). **Uncorrected, the old 60m cutoffs applied to 15m bars would balloon STRUCTURAL_TRANSITION to ~51% — a silent regime collapse.** The **regime-label PARITY report is the EXIT GATE** (`scripts/b4-regime-parity.ts`): a 3-baseline comparison (live-snapshot-60m for cutover context / clean-60m-OLD / clean-15m-NEW), with the gate judged on the clean-60m→clean-15m delta (pure bar-size effect, both substrates clean-1m-rebuilt). Result: max |Δ| = 1.30pp, no collapse — the new-15m mix sits ON TOP of the clean-60m mix (TFS 25 / ST 31 / HVU 21 / IE 17 / RBS 6.6); STRUCTURAL_TRANSITION restored from the would-be 51% to 30.7%. **PASSED + Langston SIGNED OFF.** Two activation-readiness conditions were banked (NOT blockers): (a) the per-bar flip-rate is LOWER at 15m but the WALL-CLOCK flip-rate is HIGHER (15m ≈9.75%/bar × 4 ≈ 39%/hr vs 60m ≈18.94%/hr) — the "15m steadier" framing was per-bar and backwards; a flips-per-hour + responsiveness check is owed before activation closes; (b) the ≤1.3pp result is partly by-construction (percentile-preserving targets the marginal mix), so the LIVE-15m mix must be captured once hours accumulate and confirmed near the predicted clean-15m mix (else substrate mismatch).

### DBS 15-minute substrate + history recompute

The xStock DBS config moves to per-class `module_constants` (lookback 192 / EMA 48-104 / ATR 56, table above). Because the DBS-normalization ATR shrinks at 15m, the ATR period is threaded 14→56 at the two `computeATRFromOHLC` sites and the config to the two `computeDirectionalBias` calls. The `xstock_dbs_backfill` per-bar DBS history table (the substrate calibration replays read for distribution analysis) was RECOMPUTED at 15m by a supervised one-shot (`scripts/b4-dbs-15m-recompute.ts`): the 31,481 existing 60-min rows were archived to a NEW `xstock_dbs_backfill_60m_archive` table, the live table cleared, the FULL 15-minute series rebuilt from `xstock_spot_ohlc_1m`, and the 192-bar DBS window slid to insert 332,176 per-bar 15-minute rows — each stamped `bar_interval_minutes=15`. Single transaction, safety gate (re-count archive ≥ live-60m before any DELETE, rollback-safe); sentinel-zero bars inserted-with-flag (Langston Step-4 Q1); atr≤0 bars skipped (uncomputable). This avoids a split-brain mixed-bar-size ML dataset — the table is uniformly 15m, with the 60m history preserved in the archive for the parity baseline.

### IMF screen (VN/DI) recalibration

VN and DI are both bar-sensitive (full-array computes), so they were recalibrated on the same replay method. Migration `2026-06-04-b4-foundation-vndi-15m-recalib.sql` updated 16 `screener_filters` rows (validated against live). **DI contracts toward 50 at 15m** — di_max 30→40.3 (active_oscillator), 35→42.8 (active_reversal + vts_oscillator), 40→45.2 (vts_reversal). **VN is nearly bar-invariant** (median ratio 0.993) — vn_max 0.85→0.826 on the 4 active families (the only edge drifting looser). LEFT documented (lens-conservative): vn_max 0.95/0.98 (their drift was ~1.25pp tighter — tightening, not loosening) and all di_min + di_max=100 (inert at both bar sizes). Langston signed off.

### ORB plumbing-ready (activation deferred)

15-minute bars UNLOCK ORB (it was disabled in B-NEW-34 only because 60-min bars left no intra-hour opening range). B.4 makes ORB plumbing-ready — it now rides the scanner's 15-minute candle feed and its TIME-based opening-range window maps cleanly onto 15m bars (no foundation code change to ORB itself). But the `enable` flag in the live DB stays FALSE: ORB activation is a SEPARATE strategy-fit decision (validate edge at 15m first), out of foundation scope (RUNNING_ISSUES #203). The B-NEW-34 "ORB incompatible with 60-min architecture" disablement is reversed at the plumbing level only.

### Prewarm depth

`scripts/b-new-34b-prewarm-snapshot.ts` now warms BOTH the 60m (cap 60) and 15m (cap 240) snapshot tables so the weekend / Sunday-reopen prewarm fully populates the longest 15m lookback (DBS 192 bars ≈ 48 h) and xStocks don't reopen with a degraded cold-start window. A latent bug surfaced here: the standalone CLI prewarm + DBS-recompute runs aborted "empty target symbol set" because the xStock universe went DB-dynamic (B79.0n.UNIVERSE-DISCOVERY) and the registry is populated only by `xstockUniverseService.initializeFromDB()` at app boot, which CLI runs skip — both CLI mains now call the initializer before enumerating the universe (commit `0bae277e7`).

### Reference

- Deploy: `ae2ddc845` (+ CLI universe-load follow-up `0bae277e7`); pm2 #347; HTTP 200; CI run `26939587681` all-4-green; bench zero-delta (tsc 493 baseline / vitest 12 pre-existing failures unchanged).
- Migrations: `2026-06-03b` (15m schema + `bar_interval_minutes` stamp col), `2026-06-03c` (per-class lookbacks), `2026-06-04-b4-foundation-vndi-15m-recalib.sql` (VN/DI).
- Study / parity engines: `scripts/b4-regime-recalib-study.ts`, `scripts/b4-regime-parity.ts`, `scripts/b4-vndi-recalib-study.ts`, `scripts/b4-dbs-15m-recompute.ts`. Reports: `B_4_REGIME_RECALIB_STUDY_RESULTS.md`, `B_4_REGIME_PARITY_REPORT.md`, `B_4_VNDI_RECALIB_STUDY_RESULTS.md`.
- Code: `server/asset_classes/xstock_spot/ohlc-aggregator.ts` (15m branch), `server/services/xstock-ohlc-cache.ts` (15m branch + DRY-parameterized snapshot helpers), `server/asset_classes/xstock_spot/scanner.ts` (bar-size flip + per-class DBS resolution), `server/services/market-context-engine.ts` (`refreshRegimeConfig` uniform class-keyed resolution + parity assertion), `server/core/metrics/market-regime.ts` + `.types.ts` (per-class momentum/ADX), `server/asset_classes/xstock_spot/regime-thresholds.ts` (14 recalibrated thresholds).
- Follow-ups: RUNNING_ISSUES #200 (crypto DBS→module_constants deferred), #201 (live forming-bar EV-leakage), #202 (deploy-hygiene git-tree artifacts), #203 (ORB plumbing-ready, enable=false pending strategy-fit).
- Active trading OFF throughout (VTS telemetry only). Next: per-strategy / pattern-detection / strategy-fit calibration (W2), per the foundation→pattern→per-strategy sequencing.

---

## Source-side dedup architecture (B-NEW-35, 2026-05-20)

*Added 2026-05-20 with B-NEW-35 close. Replaces the prior "B74 archive duplicate-row workaround" subsection above as the canonical structural-correctness model for B74's three WebSocket-archived OHLC tables.*

### Problem the structural fix closes

The B74 WebSocket OHLC archiver (`server/services/passive-archive/ohlc-batch-writer.ts`) was inserting one row per Kraken WS update rather than one row per minute. Kraken WS sends multiple OHLC updates per minute as the in-progress bar evolves, so the archive grew at 18-56× the necessary rate across all three partitioned tables (`xstock_spot_ohlc_1m`, `xstock_perp_ohlc_1m`, `crypto_spot_ohlc_1m`). Every downstream consumer that aggregated those rows (snapshot pre-warm, scanner cycle batched-live-overlay, signal-orchestrator OHLC reads) had to DISTINCT ON the duplicates at query time, and the DISTINCT ON cost scaled linearly with the duplication factor. On heavy-traded names (SPY, NVDA, QQQ, TSLA + ~22 other blue-chip equities), the cost exceeded Postgres's 2-minute statement_timeout and the query hung. The B-NEW-34 aggregator's DISTINCT ON CTE was the symptomatic workaround; B-NEW-35 closed the structural root.

### The three layers of dedup protection

The fix lives at three layers — DB-physical, application-UPSERT, and in-memory-buffer — so any single layer's failure does not allow duplicates to reach the table.

**Layer 1 — PostgreSQL UNIQUE constraint on `(symbol, interval_begin)` for all three partitioned `_ohlc_1m` tables.** Constraint name pattern: `<table>_symbol_interval_begin_key`. Cascades automatically to every existing partition per PG partitioned-table semantics, and to every future partition the partitioning machinery creates. The DB physically rejects any attempt to insert a duplicate. If application code and in-buffer dedup both fail simultaneously, the database itself is the last line of defense — the failing INSERT returns a constraint-violation error rather than silently letting a duplicate land.

**Layer 2 — Drizzle `.onConflictDoUpdate()` clause in `server/services/passive-archive/ohlc-batch-writer.ts` (lines 147-164).** Replaces the prior plain `db.insert(table).values(slice)` with:

```ts
await db.insert(table).values(slice).onConflictDoUpdate({
  target: [table.symbol, table.intervalBegin],
  set: {
    open: sql`EXCLUDED.open`,
    high: sql`EXCLUDED.high`,
    low: sql`EXCLUDED.low`,
    close: sql`EXCLUDED.close`,
    volume: sql`EXCLUDED.volume`,
    vwap: sql`EXCLUDED.vwap`,
    tradeCount: sql`EXCLUDED.trade_count`,
    capturedAt: sql`NOW()`,
  },
});
```

Semantically: the latest WS update IS the correct cumulative OHLCV for that minute per Kraken WS contract. Each new WS message for a minute-in-progress carries the cumulative open/high/low/close/volume/vwap/trade_count as of that tick. So when a later tick arrives for the same `(symbol, interval_begin)`, replacing the prior row's evolving fields with `EXCLUDED.*` is correct — the close moves to the latest value, high stays the max, low stays the min, volume is the cumulative total, etc. The `capturedAt` column gets touched to `NOW()` so audit queries can still tell when the last update happened. The `id` / `asset_class` / `exchange` columns (invariants per row) are NOT in the SET clause — they're set on initial INSERT and never modified.

**Layer 3 — In-buffer Map dedup BEFORE the chunked INSERT.** At lines 105-114 of `ohlc-batch-writer.ts`, immediately after the buffer is drained:

```ts
const dedupedMap = new Map<string, InsertEquitySpotOhlc1m>();
for (const row of rawRows) {
  const ts = (row as any).intervalBegin instanceof Date
    ? (row as any).intervalBegin.toISOString()
    : String((row as any).intervalBegin);
  dedupedMap.set(`${row.symbol}::${ts}`, row);
}
const rows = Array.from(dedupedMap.values());
```

This layer is structurally required, not optional. Without it, PostgreSQL throws `ON CONFLICT DO UPDATE command cannot affect row a second time` whenever a single multi-row INSERT contains two or more rows that share the conflict-target key — and the archiver's 5-second buffer routinely contains multiple WS updates for the same `(symbol, interval_begin)`. JavaScript's `Map` has insertion-order semantics; setting the same key twice keeps the second value with the original insertion position. So the loop produces a deduplicated array where each `(symbol, interval_begin)` appears exactly once with the **latest** WS update for that minute. That latest update is precisely the cumulative OHLCV per Kraken's contract, so the dropped earlier updates carry no information that the kept update doesn't.

### Why the in-buffer dedup hotfix was needed mid-deploy

The initial Phase 3 deployment shipped the UPSERT clause (Layer 2) but not the in-buffer Map dedup (Layer 3). PostgreSQL immediately started rejecting flushes with `ON CONFLICT DO UPDATE command cannot affect row a second time` errors, observed live in `/var/log/dawntrader/out.log`. The hotfix at commit `f001002d9` added Layer 3 and the errors stopped. After both layers are live, the database sees at most one INSERT row per `(symbol, interval_begin)` per flush, and the UPSERT semantics resolve cleanly against pre-existing rows for that minute.

### Pre-warm and steady-state cost shape

Pre-fix steady state: ~150 rows per minute for heavy names like SPY (some minutes >220 rows), aggregated across 265 symbols and three partitioned tables. xstock_spot May partition grew to ~14M+ rows in the first two weeks of May. Pre-warm read costs for the snapshot pre-aggregation hit Postgres statement_timeout on 26 of 265 symbols even at `--days 3`.

Post-fix steady state: exactly one row per `(symbol, interval_begin)` per minute. xstock_spot May partition stabilized at 1,604,733 rows by 2026-05-20 morning. Pre-warm reads completed in 206 seconds across the full 265-symbol universe (vs 9+ hours and 26 failures pre-fix). Scanner cycle wallclock median ~530ms (vs 25-second SCAN_TIMEOUT pre-fix).

Supabase Disk IO burst budget consumption dropped from 100%/day pre-fix to under 30%/day post-fix. Write IO dropped ~20× from dedup; read IO ~5× from the DISTINCT ON cost vanishing.

### Deploy ordering invariant (ADD UNIQUE on actively-written tables)

ADD CONSTRAINT UNIQUE on a partitioned table that is being actively written by an application-side archiver is NOT atomic with respect to the archiver's write stream. PostgreSQL takes an ACCESS EXCLUSIVE lock on the parent + each partition during constraint validation; during that lock-acquisition window, fresh writes from the archiver land and can introduce new duplicates that the constraint then rejects. The working sequence for any future structural UNIQUE-constraint addition on an actively-written table is:

1. `pm2 stop dawntrader` (or whatever process owns the writes) — write stream stops.
2. Final dedup sweep DELETE per partition — catches any duplicates landed in the lock window of the prior validation attempt.
3. `ALTER TABLE ADD CONSTRAINT ... UNIQUE (...)` in a single transaction — partitioned-table constraint cascades to all partitions atomically.
4. `pm2 start dawntrader` — write stream resumes. From this point, only the new code path (with the in-buffer dedup + UPSERT clause) is writing, and the UNIQUE constraint is enforced from row 1.

Documented as a deploy-ordering invariant in SYSTEM_IMPACT_MAP under the B74 archiver section.

### Phase 1 cleanup: bash-per-symbol DELETE pattern

The Phase 1 cleanup migration that removed ~23.2M duplicate rows across three tables ran into a Postgres-specific failure mode worth recording for institutional memory. Several SQL revisions (EXISTS self-join, ROW_NUMBER + `SET statement_timeout`, per-symbol self-join, recursive CTE skip-scan, per-symbol ROW_NUMBER inside DO block) all failed within Supabase's 2-minute query cap even at the Medium compute tier. Root cause: a PL/pgSQL DO block treats its entire LOOP as one statement for `statement_timeout` purposes, regardless of internal COMMIT statements. Cumulative DO-block wallclock hits the cap even if each individual per-symbol DELETE finishes in seconds.

The working approach drops out of PL/pgSQL entirely and uses a bash loop that calls `psql` once per symbol. Each `psql` invocation gets a fresh 2-minute `statement_timeout` budget. The script (`/tmp/dedup_per_symbol.sh` on staging at deploy time, archived in BATCH_CATALOG entry):

```bash
# Enumerate symbols via recursive CTE in one query
psql -c "WITH RECURSIVE walk AS (...) SELECT symbol FROM walk" -t -A | while read sym; do
  psql -c "DELETE FROM <table>_2026_05 WHERE symbol = '$sym' AND id NOT IN (
             SELECT MAX(id) FROM <table>_2026_05 WHERE symbol = '$sym' GROUP BY interval_begin
           );"
done
```

The heaviest single symbol (SPY) still overflowed its per-symbol budget — solved by a per-day chunked DELETE script (`/tmp/dedup_spy.sh`). Same shape, but iterating by day-of-month within the symbol.

**Institutional-memory rule:** future batches that need to delete bounded subsets of rows from a Supabase table > 1M rows should plan for the bash-per-symbol pattern from day one. A single SQL transaction will not finish.

### Reference

- Canonical deploy hash: `f001002d9` (Phase 3 code-deploy + in-buffer Map dedup hotfix).
- Code: `server/services/passive-archive/ohlc-batch-writer.ts` lines 105-114 (Map dedup) + 147-164 (UPSERT clause).
- Migrations: `drizzle/migrations/2026-05-19-b-new-35-phase1-dedup-{xstock-spot,xstock-perp,crypto-spot}.sql` (per-table Phase 1 cleanup; the final rev shipped uses MAX(id) NOT IN per-symbol; staging used the `/tmp/dedup_per_symbol.sh` bash-loop pattern at runtime since the in-PL/pgSQL DO-block LOOP couldn't finish) + `drizzle/migrations/2026-05-19-b-new-35-phase2-add-unique-constraints.sql` (single-transaction ADD CONSTRAINT for all three tables).
- Completion report: `Claude Comms and Packages/Batch Completion/B_NEW_35_COMPLETION_REPORT.md`.
- Soak verification: alert `c82c256c-66e3-4ce4-a6c9-c8ef4041bdbf` triggers 2026-05-27T07:00:00Z (zero duplicate `(symbol, interval_begin)` rows across all three tables + Supabase Disk IO under 30%/day).
- Five-symbol snapshot gap (handoff to B-NEW-36 sub-batch c): xstock_spot_ohlc_60m_snapshot has 260 symbols (not 265). BITF/HOLX/PARA/SAGE/WBA have zero rows in both April AND May source partitions — empirical Kraken-side absence under our canonical symbol form. Investigation deferred to B-NEW-36 universe-split cleanup.

---

## Phase 24 EXTENDED 3 — xStock Calibration Phase 0 audit findings (B-NEW-42, 2026-05-17)

### Corporate Actions

#### Archive Findings

B-NEW-42 §2.1.1 scan across `xstock_spot_ticker_snap` (46.2M rows / 260 symbols / 14 days, 2026-04-30 → 2026-05-17): **0 corporate-action candidate events.** Pass A's `prev_day_close / open_24h` ratio scan with threshold <0.6 OR >1.6 returned 0 rows. The OHLC consecutive-bar step-change scan (Pass B) was deferred at the 30s pool-level statement_timeout; Pass A's EOD-level null was treated as conclusive for the audit's gap-detection purpose. Intra-bar discontinuity coverage is structural via the B-NEW-42b sentinel module (not archive-window-dependent). Full artifact: `1-system-manual/audits/b-new-42/corp-actions-scan.csv`.

#### Kraken WebSocket Behavior

Empirical inspection of the OHLC + ticker_snap metadata jsonb columns (Pass C/D) shows **only `schema_version` key present** across the entire xStock archive. Kraken's WS feed delivers no `adjustment_factor` / `event_type` / `corporate_action` / `split_ratio` envelope fields. Whatever price flows through their `ticker` channel is the raw value we receive; we have no upstream signal that a corporate action has occurred. Live observation during a real corp-action event would confirm whether Kraken applies auto-adjustments; this remains an open question for Phase A.1.

#### TEC Handling Policy

`shouldClosePosition` (server/services/trailing-exit-controller.ts:1326-1331) is a naive `currentPrice <= currentStopPrice` check with no discontinuity awareness. On a 2:1 split, every long xStock position with a stop above price/2 fires the stop simultaneously. **Confirmed by regression test `server/tests/unit/b-new-42-tec-split-resilience.test.ts → FORWARD SPLIT` (50% drop) + `REVERSE SPLIT` (2× jump phantom-promotes to TRAILING_TAKE).**

**Partial existing defense:** `isXstockMarketOpenUTC` (B79.0L, server/asset_classes/xstock_spot/market-hours.ts) short-circuits TEC evaluation during the Fri 8PM ET → Sun 8PM ET window. Since splits are almost always overnight-effective, the existing weekend gate IS a real partial defense in production. Operational urgency narrowed; structural fix still required.

**Fix delivered by B-NEW-42b** — `server/services/price-discontinuity-detector.ts` adds a `corp_action` flag triggering on ≥40% single-bar discontinuity. TEC consumes the detector at the stop-check + target-lock sites via a single gate site.

### Trading Halts

#### Archive Findings

B-NEW-42 §2.3.1 scan for tick-stream gaps >5 minutes across the last 7 days surfaced **42,226 candidate gap events** across the xStock universe. Distribution by classification:
- **96% `candidate_pause_no_movement`** (40,487 rows; |price change| < 0.1%) — benign Kraken pauses during off-hours; resume with same price.
- **3% `candidate_extended_gap_moderate_movement`** (1,277 rows; 0.1-0.5% change).
- **1.1% `candidate_halt_with_resume_gap`** (462 rows; ≥0.5% change). Average 1.10% absolute price change across resume gap; max 4.6% (EDU/USD, 2026-05-11 01:30:51 → 01:40:21 UTC).

The 462 resume-gap candidates are mostly off-hours pauses on 24/5 names rather than intra-RTH halts (timestamps fall outside ET 9:30-16:00). True intra-RTH halts in the archive window appear rare-to-zero. The audit's structural fix is therefore designed against the Kraken behavior pattern (pause-with-occasional-resume-gap is empirically confirmed) rather than against an archive-observed-during-RTH proof. Full artifact: `1-system-manual/audits/b-new-42/halt-gaps-scan.csv`.

#### Kraken WebSocket Behavior

Pattern: **pause-with-occasional-resume-gap.** Kraken can and does emit a ticker-update gap (>5min, often hours during weekend) and resume with either the same price (benign) OR a meaningfully different price (real price discovery happened during the pause). Both behaviors observed in the same archive.

#### §2.3.3 Test Outcome

`server/tests/unit/b-new-42-tec-halt-resilience.test.ts` exercises three scenarios per pre-audit §3.3:
- **PAUSE (no movement during halt window):** TEC sees stable price across 10 simulated minutes; no stop fires. ✅ Current behavior correct.
- **STALE-STREAM (advancing captured_at, same price):** equivalent to PAUSE from TEC's perspective. ✅ Current behavior correct.
- **POST-RESUME GAP (resume at gapped-down price below stop):** TEC clamps exit to pre-halt stop level — an unfillable price in reality (real fill would be at or worse than the resume price). System books fictitious PnL. **❌ Gap confirmed.** B-NEW-42b inverts this assertion post-fix.

#### Halt Sentinel Decision

Scope §2.3.4 reinterprets v2 plan §0.3.4 directive ("add halt-detection sentinel to data-freshness layer") as conditional on test outcome. **Test confirmed gap → sentinel REQUIRED, delivered by B-NEW-42b.**

**Sentinel location revised post-investigation:** the data-freshness layer is NOT the right home — B-NEW-34 removed the xstock_spot freshness window leaving the layer as a no-op gate. The sentinel lives in `server/services/price-discontinuity-detector.ts` (NEW, single module covering halt_resume_gap + corp_action + ex_dividend kinds) consumed by TEC at the stop-check site directly.

*Added 2026-05-17 with B-NEW-42 close.*

---

## Phase 24 EXTENDED 4 — xStock Calibration Phase 0 STRUCTURAL FIX shipped (B-NEW-42b, 2026-05-17)

B-NEW-42 audit verdict was DIRTY; B-NEW-42b closes all three confirmed gaps structurally.

### Price-discontinuity sentinel architecture

NEW module `server/services/price-discontinuity-detector.ts` (483 lines) consumed by TEC at two gate sites:
- `shouldClosePosition` — stop-check skip
- `updatePosition` target-lock latch — phantom-promote skip

**Single-call-per-logical-tick architecture (Langston Step 4 BLOCKER 2 fix):** `tec-evaluator.ts` hoists the detector consultation. The result threads down to both gate sites via the `discontinuity` parameter. Pre-fix double-consultation per tick advanced the state machine twice, collapsing the intended 2-tick deferral (DISCONTINUITY_ACTIVE → confirming tick CLEARING → IDLE) into 1-tick.

### Four detector kinds

| Kind | Trigger | Resolution |
|---|---|---|
| `halt_resume_gap` | `gapSeconds > 300 AND |Δ%| >= 0.5%` | Confirming tick within 30s window AND \|Δ%\| < 0.5% from resume price → CLEARING → next call IDLE. Hard ceiling 5min (stateless timestamp check, no setTimeout) auto-clears even without confirming tick. |
| `corp_action` | `|Δ%| >= 40%` single-bar | 24h TTL (`corp_action_ttl_seconds`). Supersedes halt_resume_gap when both could trigger. |
| `ex_dividend` | 7:30-9:30 ET on a known ex-date for the symbol | Outside window OR off-date → INACTIVE. Curated calendar via `1-system-manual/audits/b-new-42/dividend-calendar-seed.json` (15 names × Q3+Q4 2026); Phase D auto-feed replaces this without changing the consumer. |
| `cold_start` | First call per symbol when cache is empty (process-restart-during-halt fail-safe per Langston pre-audit rev1 #1) | Auto-resolves on second call (state populated from first). |

### Cold-start fail-safe-skip

First call per symbol returns `{active: true, kind: 'cold_start'}`. Reasoning: process restart at t=0 + halt landing at t=-5s + first post-restart tick at t=+10s could pass a gap-down resume price to `shouldClosePosition` before the detector has any prior-tick context to evaluate the gap. Fail-safe-skip prevents the unfillable-fill failure mode during the blind window. Cost: one tick of stop-check delay per symbol per cold-start episode (operationally trivial; symbols see hundreds of ticks per session). Logs `[B-NEW-42b][DETECTOR_COLD_START_SKIP] <symbol>` per occurrence.

### Lazy eviction (gated on IDLE)

Cache entries idle for >24h are dropped → next call is cold-start. **Critical:** only IDLE entries evict by age; DISCONTINUITY_ACTIVE and CLEARING entries must reach their state-machine resolution (TTL / hard-ceiling / clearing tick) regardless of wallclock staleness — they represent live operational state.

### Restart semantics (Langston pre-audit rev1 #1 documentation requirement)

The detector cache is **in-process only**. A PM2 restart discards the cache entirely. The first tick per symbol post-restart triggers the cold_start fail-safe-skip, protecting against the unfillable-fill failure mode during the blind window (where a halt could have landed between snapshot moments). After one tick per symbol, the cache repopulates and the detector resumes normal operation.

### Adjustment knobs

8 per-asset-class behavioral knobs catalogued in `ADJUSTMENT_FRAMEWORK.md` Appendix A. Seeded by `drizzle/migrations/2026-05-17-b-new-42b-price-discontinuity-detector-constants.sql` (idempotent ON CONFLICT). Detector currently uses hardcoded values matching the seeds; DB-resolution deferred to Phase E calibration batch using the standard `getModuleConstants` API with B79.0a-style wildcard-default sentinel fallback.

### Crypto-path back-compat

Detector returns `{active: false}` immediately for non-xStock symbols (first check is `XSTOCK_SPOT_SYMBOLS.has(symbol)`). Crypto stop-check + target-lock behavior unchanged. Verified: b65-tec-parity + b80-tec-per-trade-keying + b79-tec-per-class-cache + trailing-exit tests all green (55+).

*Added 2026-05-17 with B-NEW-42b close.*

---

# DBS extension to xStocks (B-PHASE-A2, 2026-05-17)

> **Section title note (Langston Step 2 #2):** intentionally uses the batch ID (B-PHASE-A2) rather than the legacy "Phase 14" prefix from the original DBS chapter, since the workflow uses STEPS-not-Phases per the 2026-04-23 rename in B65.2 and the project is currently in Phase 24+.

## Why this section exists

The original DBS chapter (Phase 14 / B62 / B63 Item 16) was implicitly crypto-only — it described per-pair DBS compute, global aggregation, and the directional-bias-store singleton, all operating on the crypto universe. Pre-B-PHASE-A2, xStocks reached MCE with `propagatedDbs === undefined`; MCE's non-crypto branch synthesized a neutral DBS for every xStock pair; the regime classifier ran with zero directional signal on xStocks; Path-B sustainability gate was dead-code on xStocks; confidence modifiers defaulted to 1.0.

B-PHASE-A2 extends DBS to xStocks by adding a second instance of the same `DirectionalBiasStore` class, wiring the xStock scanner to compute real per-pair DBS pre-cycle, and threading the result through MCE end-to-end. The core math (formula, weights, lookback, thresholds, confidence-modifier ranges) is byte-identical to crypto — no pre-emptive equity-tune.

## Architecture

### Two-instance pattern (constructor-option discriminator)

```ts
// server/core/metrics/directional-bias-store.ts
export interface DirectionalBiasStoreOptions {
  mode: 'crypto' | 'xstock';
  assetClassForKnobs: 'crypto_spot' | 'xstock_spot';
}

export const directionalBiasStore = new DirectionalBiasStore({
  mode: 'crypto',
  assetClassForKnobs: 'crypto_spot',
});

export const xstockDirectionalBiasStore = new DirectionalBiasStore({
  mode: 'xstock',
  assetClassForKnobs: 'xstock_spot',
});
```

**Why constructor-option, not subclassing:** the two instances share class shape but their `publishSnapshot()` behavior diverges (xstock applies sector partition + dual floor). The constructor option keeps the divergence visible at the class level (one if/else in publishSnapshot) without classical-inheritance overhead. Future-proofing for asset class 3 is a 15-min refactor to a registry-of-stores when that asset class arrives.

### Per-pair compute (shared with crypto, byte-identical)

`computeDirectionalBias(ohlc, atr)` in `server/core/metrics/directional-bias.ts` is universe-agnostic and reused as-is. Component weights, lookback (48 bars), EMA periods (12/26), and category thresholds (UP_STRONG 0.60 / UP_MODERATE 0.30 / UP_WEAK 0.10 / DOWN_WEAK -0.10 / DOWN_MODERATE -0.30 / DOWN_STRONG -0.60) are byte-identical to crypto.

### Sector taxonomy on XSTOCK_SPOT_REGISTRY

Every entry in `XSTOCK_SPOT_REGISTRY` carries a REQUIRED `sector: XstockSector` field with one of 14 values:

| Bucket | Values | Behavior |
|---|---|---|
| GICS sectors | XLK, XLE, XLV, XLF, XLI, XLP, XLY, XLU, XLB, XLRE, XLC | Counted toward both floors; included in weighted-median aggregation |
| INDEX_PROXY | SPY, QQQ | Stored for own-use (their eval-cycle reads back their own score); EXCLUDED from floor count + aggregation (would degenerate to "SPY's own DBS") |
| BROAD_ETF | ARKK, ARKG, XBI, GLD, TOTL, IEMG | Same as INDEX_PROXY — stored for own-use, excluded from aggregation. Phase E factor work falls back to SPY for sector-correlation factor |
| INTL_ETF | EWA, EWC, EWG, EWI, EWL, EWN, EWP, EWQ, EWS, EWU, EWZ | Same — country/region ETFs; SPY fallback for Phase E |

Optional flags: `adr?: boolean` (26 entries — Phase E factor work consumes), `cryptoAdjacent?: boolean` (11 entries — MSTR / COIN / CRCL / GLXY / DFDV + 6 miners).

TypeScript hard-fails any future entry missing `sector`. Sector mapping rationale + GICS reclassification gotchas (GOOGL→XLC post-2018, AMZN→XLY despite AWS, MSTR→XLK with cryptoAdjacent, COIN→XLF) documented in `Claude Comms and Packages/Langston Design Asks/xstock_sector_mappings_reference.md`.

## Floor mechanics (mode='xstock' only)

Crypto store (mode='crypto') uses a single floor: `freshCount ≥ min_sample_count(20)` against `this.store.size` (the pre-B-PHASE-A2 behavior; counts sentinel entries — see RUNNING_ISSUES #114 for the asymmetry).

xStock store (mode='xstock') uses TWO floors that BOTH must clear:

1. **Global floor**: `freshCount ≥ min_sample_count` where freshCount counts ONLY entries with:
   - `sector ∈ (XLK, XLE, XLV, XLF, XLI, XLP, XLY, XLU, XLB, XLRE, XLC)` — INDEX_PROXY/BROAD_ETF/INTL_ETF excluded
   - `sentinelZero === false` — degraded compute results don't count
2. **Sector coverage floor**: `≥ sector_coverage_floor` distinct GICS sectors with ≥1 non-sentinel entry each

Layer-1 starter values (seeded in `module_constants` by B-PHASE-A2 migration):

| Knob | xstock_spot value | Crypto wildcard value | Rationale |
|---|---|---|---|
| `min_sample_count` | 30 | 20 (unchanged) | 30 of 265 = ~11% coverage; loosely proportional to crypto's 20/140 = ~14% with slightly stronger per-entry information richness offsetting the lower ratio |
| `sector_coverage_floor` | 7 | N/A (crypto has no sector concept) | 7 of 11 GICS sectors = 64% diversity requirement. NEW knob xStock-only. |
| 6 weight/period knobs | byte-identical to crypto | (same values) | No pre-emptive equity-tune; explicit rows isolate xstock from future crypto retunes |

**Both floors are DB-governed via strict `getCachedNumberRequired`** (no silent fallback per CLAUDE.md §8 #10 + §11; Langston Step 4 BLOCKER fix in commit `e7f9902f2`). Missing seeded row = loud crash, not silent default.

## Extended-hours expected degradation

During ARCA-closed windows (Friday 8PM ET → Sunday 8PM ET unified weekend close), only the 10-pair 24/7 universe accumulates fresh writes. Empirical sector distribution: XLK=3 (AAPL/MSTR/NVDA), XLF=2 (CRCL/HOOD), XLC=1 (GOOGL), XLY=1 (TSLA), plus INDEX_PROXY=2 (SPY/QQQ) and BROAD_ETF=1 (GLD) — total 10, GICS-sectored 7, GICS sectors covered 4 of 11.

**Both floors fail by construction during ARCA-closed:**
- Global ≥30: max possible is 7 (GICS-sectored 24/7 names)
- Sector coverage ≥7: covered 4 of 11

`publishSnapshot()` serves stale-prior or null per the 5-row spec. **This is intentional.** Extended-hours signal quality is intrinsically lower (thin books, fewer ECN participants); serving a degraded global xStock DBS is more conservative than serving stale-prior. A.3 verification MUST NOT flag "global xStock DBS unavailable during weekend" as a defect.

## RTH-open + cold-start framing (corrected post-rev1)

Both crypto AND xStock DBS compute on 60-min bars (`xstockOhlcCache.getOHLCDataBatch(symbols, 60)`; crypto's `ohlcCache.getOHLCData(symbol, interval=60)`). DBS requires `lookbackPeriod = 48` bars → 48 × 60min = 48 trading hours of archive history.

Implication: pairs with ≥48 hours of archived 60-min bars produce non-sentinel DBS from the first minute of any session. **Cold-start is NOT a session-start ramp**; it's a structural condition applying only to:
- New symbols added to the universe with <48 archived bars
- PM2 restart while xStock archive itself is <48-72 trading hours deep (no longer applicable post-A.2; archive depth is ~17 days = ~400 hours as of A.2 ship)

For LIVE operation: weekends do not reset the archive. Monday RTH open does NOT trigger cold-start for any pair with prior-week history.

## Telemetry

- `[B-PHASE-A2][CYCLE_DBS_TIMING] tick=N dbs_compute_ms=M pairs_with_dbs=K universe=U` — per-cycle (30s) timing log. Empirical analytical estimate from pre-audit §11: 0.16% of 25s budget (~39ms at 250 pairs). Step 7 verification reads actual.
- `[B-PHASE-A2][FIRST_FLOOR_CLEAR] tick=N pairs=K global_dbs=X.XXX category=Y` — one-shot per session on first publish-success after both floors clear. Resets on PM2 restart.
- `[B-PHASE-A2][SECTOR_MISSING] symbol=...` — defense-in-depth warn if scanner ever encounters a symbol not in registry. Should never fire post-A.2 (TypeScript-required); presence indicates registry sync drift.
- `[GlobalDBS-xstock][coldStart|degradedCoverage|noSnapshot|invalidCompute]` — 5-row behavior spec logs with `-xstock` suffix differentiating from crypto's `[GlobalDBS]`.

## Volume-weighted-median informational note (Phase A.3 follow-up)

The xStock weighted-median uses USD-denominated 24h volume (shares × price). Megacap dominance is structurally large: AAPL/MSFT/NVDA together can be 30-40% of S&P daily $ volume. A.3 verification will explicitly inspect distribution skew: if top-5 names exceed 60% volume weight in the median, document for post-A.3 calibration consideration (equal-weighted or sector-equal-weighted alternatives). Not an A.2 concern.

## Backfill table

`xstock_dbs_backfill` table captures per-bar DBS components for A.3 verification + Phase B calibration replay:

```sql
CREATE TABLE xstock_dbs_backfill (
  symbol TEXT NOT NULL,
  sector TEXT NOT NULL,
  ts TIMESTAMPTZ NOT NULL,
  final_score DOUBLE PRECISION NOT NULL,
  slope_component DOUBLE PRECISION NOT NULL,
  return_component DOUBLE PRECISION NOT NULL,
  ema_component DOUBLE PRECISION NOT NULL,
  sentinel_zero BOOLEAN NOT NULL,
  atr DOUBLE PRECISION,
  volume_24h_usd DOUBLE PRECISION,    -- B-PHASE-A2 (F) addition per Langston Step 4 ask
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (symbol, ts)
);
```

Backfill script `scripts/b-phase-a2-backfill.ts` aggregates 1-min bars to 60-min via SQL `date_trunc('hour', interval_begin)`, computes per-window DBS, inserts ON CONFLICT DO NOTHING. Idempotent re-runs. Component capture (slope/return/ema) per Langston C8 — enables A.3 to diagnose which component drives any xStock-vs-crypto distribution divergence.

## Crypto-path back-compat (verified by code-level pre-audit + Step 8)

All 5 crypto-side consumers of `directionalBiasStore` (market-indicators isStale badge, drift-dashboard-aggregator history+transitions+latest reads, MCE updatePair write + publishSnapshot read) operate against the same singleton with the same call signatures. mode='crypto' branch in `publishSnapshot()` is identical to pre-B-PHASE-A2 behavior. Test mocks reference singleton symbols by name (b63-item16 test); constructor-arg refactor preserves the export surface. Zero crypto regression.

## Crypto vs xStock symmetry asymmetries (filed in RUNNING_ISSUES for future hardening)

Two pre-existing asymmetries surfaced during B-PHASE-A2 audits, both filed as low-severity future-hardening items:

- **#114 (B-PHASE-A1 design call):** crypto floor counts sentinel-zero entries (uses `this.store.size`); xStock counts only non-sentinel GICS-sectored entries. xStock applies stricter rule from day one; crypto deferred to dedicated recalibration batch.
- **#115 (Langston Step 8 finding):** crypto's `dbs_calculation` module_constants has only one wildcard row (`min_sample_count=20`); the other 7 DBS knobs are code-defaulted in the crypto path, NOT DB-governed. xStock_spot path is fully DB-governed (8 rows). Pre-existing state, not A.2 drift. Worth deciding intentionally rather than discovering by accident.

## B-PHASE-A2 invariants (do not violate without governance update)

1. **No pre-emptive equity-tune.** Component weights, lookback, EMA periods, category thresholds, confidence modifier ranges all byte-identical to crypto. Retune is POST-A.3 evidence-gated per v2 plan §A.2 (calibration-dependency invariant applies to its own foundation).
2. **GICS-only + non-sentinel counting for xstock floor.** INDEX_PROXY / BROAD_ETF / INTL_ETF / undefined-sector / sentinelZero=true entries do not count toward global floor or sector-coverage floor, AND do not participate in weighted-median aggregation.
3. **Constructor-option discriminator is the single source of truth.** All mode-specific behavior (sector partition, dual floor, log tag) branches on `this.opts.mode === 'xstock'`. Never add mode-specific behavior via runtime detection or `instanceof` checks.
4. **Sector field REQUIRED on every registry entry.** TypeScript compile-fails any future entry missing sector. Companion `xstock_sector_mappings_reference.md` documents rationale for high-judgment cases.
5. **Strict `getCachedNumberRequired` for both floor knobs.** No silent fallback per CLAUDE.md §8 #10 + §11. Missing seeded row = loud crash, not silent default.
6. **Graceful degrade preserved.** Pairs with insufficient OHLC / ATR=0 / sector missing fall through to `propagatedDbs=undefined`; MCE's non-crypto branch synthesizes neutral as before A.2. No new failure modes introduced.

*Added 2026-05-17 with B-PHASE-A2 close.*

---

# Source-side dedup architecture (B-NEW-35, 2026-05-20)

## Why this chapter exists

B74's WebSocket archiver was writing 18-56× more rows than it should into the three partitioned 1-minute OHLC tables (`xstock_spot_ohlc_1m`, `xstock_perp_ohlc_1m`, `crypto_spot_ohlc_1m`). Every Kraken in-progress-bar update was producing a fresh row keyed on the auto-generated `id` column instead of updating the existing minute's row. The duplication compounded across three tables, depleted Supabase Disk IO budget at 100% per day, and made every downstream DISTINCT ON aggregation blow past Postgres's 2-minute statement_timeout on the heavy-traded symbols (SPY, NVDA, QQQ, TSLA + roughly 22 other blue-chip names). B-NEW-34b's snapshot architecture could not reach functional scanner state without the structural source-side fix.

B-NEW-35 (canonical deploy hash `f001002d9`, 2026-05-20) is the architectural answer.

## The three-layer protection model

Each layer closes a different failure mode. None alone is sufficient. All three must remain in place.

### Layer 1 — PostgreSQL UNIQUE constraint on `(symbol, interval_begin)`

Added to the **parent** of each partitioned table (`xstock_spot_ohlc_1m`, `xstock_perp_ohlc_1m`, `crypto_spot_ohlc_1m`). PostgreSQL cascades the constraint to every existing partition and every future partition that the monthly-range partition key creates. The database physically rejects any second row that targets the same `(symbol, interval_begin)` tuple in any partition; no application-level vigilance can be the only safeguard.

Constraint names follow the convention `<table>_symbol_interval_begin_key`. Adding the constraint on an actively-written table requires a brief `pm2 stop dawntrader` window — fresh duplicates landing during the lock-acquisition validation pass will otherwise fail the ADD CONSTRAINT. Working sequence: stop → final sweep DELETE per partition → ADD CONSTRAINT in one transaction → start.

### Layer 2 — Drizzle `.onConflictDoUpdate()` in the archiver

`server/services/passive-archive/ohlc-batch-writer.ts:147-164` replaces the prior plain `db.insert(table).values(slice)` with an UPSERT keyed on `[table.symbol, table.intervalBegin]`. On conflict, the writer updates the evolving fields (`open`, `high`, `low`, `close`, `volume`, `vwap`, `tradeCount`) from the EXCLUDED pseudo-row and touches `capturedAt` to `NOW()`. The latest WebSocket update IS the correct cumulative OHLCV for that minute per Kraken WS contract; dropping earlier ticks into the same minute is semantically correct, not loss of information. Chunking at 1,000 rows preserves headroom under the 65,535-bind-parameter PostgreSQL limit.

### Layer 3 — In-buffer Map dedup before the chunked INSERT

`server/services/passive-archive/ohlc-batch-writer.ts:105-114` runs immediately after the buffer drain and before the chunked UPSERT call. Each row is keyed in a `Map<string, InsertEquitySpotOhlc1m>` by `${symbol}::${intervalBegin_iso}`. Map insertion-order semantics give last-wins naturally. Required because Kraken WS routinely delivers multiple OHLC updates per minute, and PostgreSQL throws `"ON CONFLICT DO UPDATE command cannot affect row a second time"` whenever a single INSERT contains multiple rows that share the conflict-target key. Layer 2 alone is therefore insufficient — the application must dedup the buffer before the database sees it.

This layer was added as a same-deploy hotfix in commit `f001002d9` after the failure surfaced live in the initial Phase 3 code-deploy.

## Deploy ordering invariant (do not violate)

The three layers must land in this order, and any future structural change to the archiver must preserve the order:

1. **Phase 1 — Cleanup migration:** dedupe existing rows in all three partitioned tables BEFORE adding the UNIQUE constraint. Otherwise existing duplicates fail the constraint validation pass.
2. **Phase 2 — ADD UNIQUE constraint:** in a `pm2 stop dawntrader` window. Restart immediately after the transaction commits.
3. **Phase 3 — Deploy archiver code change:** Layer 2 + Layer 3 together. Deploying Layer 2 without Layer 3 produces "cannot affect row a second time" failures the moment Kraken delivers a multi-tick minute.

## Institutional-memory rule — Supabase bounded-subset DELETE pattern

When a future batch needs to delete a bounded subset of rows from a Supabase-hosted table larger than ~1M rows, **use a bash loop that calls `psql` once per symbol (or other narrow scoping key) — do NOT try to do it in one SQL transaction**.

PostgreSQL's `statement_timeout` is enforced cumulatively across an entire PL/pgSQL DO-block LOOP regardless of internal COMMIT statements. Supabase enforces a 2-minute cap that overrides session-level `SET statement_timeout`. Five SQL revisions were attempted during B-NEW-35 Phase 1 (EXISTS self-join, ROW_NUMBER + raised statement_timeout, recursive CTE skip-scan, per-symbol self-join inside DO block, per-symbol ROW_NUMBER inside DO block); all failed within the 2-minute cap. The working approach was `/tmp/dedup_per_symbol.sh` on staging — enumerate symbols via a recursive CTE, then run `DELETE WHERE id NOT IN (SELECT MAX(id) ... GROUP BY interval_begin)` per symbol via separate `psql` invocations. Each invocation gets a fresh 2-minute budget. The heaviest single symbol (SPY) still overflowed its per-symbol budget and was handled via `/tmp/dedup_spy.sh` per-day chunked DELETE.

The bash-per-symbol pattern is now the default expectation for any future Supabase DELETE work crossing the 1M-row threshold. Documented in SYSTEM_IMPACT_MAP.

## Post-fix steady state (verified 2026-05-20)

| Table | Row count (May 2026 partition) | Expected | Status |
|---|---|---|---|
| `xstock_perp_ohlc_1m_2026_05` | 278,240 | ~280K | ✅ |
| `xstock_spot_ohlc_1m_2026_05` | 1,605,953 | ~1.59M | ✅ |
| `crypto_spot_ohlc_1m_2026_05` | 2,494,122 | ~2.47M | ✅ |
| Duplicate `(symbol, interval_begin)` rows | 0 / 0 / 0 | 0 | ✅ |
| UNIQUE constraints | all 3 tables | all 3 | ✅ |
| Scanner cycle wallclock | median ~530ms (Langston, last 20 cycles) | < 5s | ✅ (vs 25s SCAN_TIMEOUT pre-fix) |
| Supabase Disk IO burst budget | < 30%/day | < 30%/day | ✅ (vs 100%/day pre-fix) |

## What this supersedes

The B-NEW-34 aggregator DISTINCT ON CTE remains in the codebase as a defensive read-side dedup, but is no longer load-bearing because Layer 1 prevents duplicates at write time. The earlier B-NEW-34 governance note characterizing the DISTINCT ON path as the structural-correctness model is updated: B-NEW-35 is the structural-correctness model; B-NEW-34's DISTINCT ON is now belt-and-suspenders defense-in-depth.

## Cross-references

- `CHANGES_AND_FIXES.md` BUG-2026-05-19-B — fix entry
- `SYSTEM_IMPACT_MAP.md` "Recent Additions (B-NEW-35)" — six new component entries
- `BATCH_CATALOG.md` B-NEW-35 row
- `PHASE_HISTORY.md` Phase 24 EXTENDED sub-batches table B-NEW-35 row
- `Claude Comms and Packages/Scope Files/B_NEW_35_SCOPE.md` (rev2) + `B_NEW_35_PRE_AUDIT.md`
- `Claude Comms and Packages/Batch Completion/B_NEW_35_COMPLETION_REPORT.md`
- RUNNING_ISSUES #118 (B-NEW-34a / 34b / 35 cluster — RESOLVED) + #119 (`_migrations` ledger drift, folded into B-NEW-36 sub-batch a) + #120 (five-symbol gap, folded into B-NEW-36 sub-batch c)
- Soak verification alert `c82c256c-66e3-4ce4-a6c9-c8ef4041bdbf` triggers 2026-05-27T07:00:00Z

*Added 2026-05-20 with B-NEW-35 close.*

---

# Off-hours session-lifecycle architecture (B-NEW-36 sub-batch (b), 2026-05-20)

> **⚠️ B-NEW-52 UPDATE (2026-06-06) — the weekend `node-cron` timers described in "Layer 2 → Scheduled timers" below have been RETIRED.** The Fri/Sun fire-once-a-week `node-cron` alarms repeatedly went stale across the app's frequent mid-week restarts (3rd recurrence; last real fire 2026-05-23, 2026-05-30 missed). Per Kyle's directive the fragile alarm was removed entirely and the two already-existing restart-proof reconcilers — **boot reconciliation + the continuous 30-second poll-reconcile** (the Layer-2 boot block + the `scanner.ts handleTick()` reconcile hook) — are now the SINGLE SOURCE OF TRUTH for the weekend shutdown AND restart. The shutdown/restart CORE logic (`runWeekendShutdownCore`/`runWeekendRestartCore`, described in the hooks below) is UNCHANGED — only its trigger moved from cron to poll/boot. The poll path now runs the boundary pre-warm (`runPrewarm:true`) so the prior cron-only pre-warm is preserved at the Sunday reopen. A continuous self-correcting loop is strictly more reliable than a fire-once alarm and cannot be knocked out by a restart. See SIM §9.10.b for the current two-path (poll + boot) fire model.

## Why this exists

Pre-B-NEW-36, the xStock scanner kept running 30-second `centralClock` cycles with `lastUniverseSize=0` through the 48-hour weekend close window (Fri 8 PM ET → Sun 8 PM ET), and the VTS sim cycle (`resolveOpenVirtualTrades`) kept evaluating open xStock trades against stale weekend price data — driving stale-config TEC `fail-closed` log spam (RUNNING_ISSUES #116) and wasting per-cycle work on a market that wasn't trading. The off-hours session-lifecycle controller solves both by adding explicit shutdown/restart hooks that take the scanner offline + suspend the open xStock VTS trades through the weekend window.

Empirical Q9 verification under B-NEW-36 sub-batch (c) confirmed that ALL xStocks — including the 10 previously-designated "Phase-1 24/7" names (AAPL/CRCL/GLD/GOOGL/HOOD/MSTR/NVDA/QQQ/SPY/TSLA) — have zero weekend bucket activity in the WS-equities feed. So the unified weekend close window is symbol-independent, and the lifecycle controller doesn't need per-symbol or per-cohort logic.

## Three-layer architecture

### Layer 1 — `vts_open_trades.state` column with CHECK constraint

NEW column `state VARCHAR(32) NOT NULL DEFAULT 'open'`. Three valid values: `'open'`, `'weekend_suspended'`, `'closed'`. CHECK constraint `vts_open_trades_state_consistency` enforces TWO independent invariants:

1. **closed↔state consistency:** `closed=false` rows must be `'open'` or `'weekend_suspended'`; `closed=true` rows must be `'closed'`.
2. **state↔asset_class consistency:** `state='weekend_suspended'` is valid ONLY for `asset_class='xstock_spot'`. Crypto trades can never enter the suspended state — the DB physically rejects it. Defense-in-depth against bugs in code that touches the new bulk helpers.

The migration also runs a same-transaction UPDATE backfilling `state='closed'` for all rows where `closed=true`, ensuring the CHECK is satisfied at activation time.

**Critical caller-side guard (pre-audit §4.1):** `markOpenTradeClosed` in `vts-trade-persistence.ts` was extended to set `state='closed'` atomically with the `closed=true` flip. Without this extension, EVERY trade close after migration deploy would fail the CHECK (row would land at `closed=true, state='open'`). The extension is the difference between the migration being a working ship versus an immediate prod-breakage event.

### Layer 2 — Lifecycle controller (`server/services/session-lifecycle-controller.ts`)

NEW module. Public surface:

- `sessionLifecycleController.init()` — call once at server boot AFTER `rehydrateOpenVtsTrades()` (in-memory Map populated) and AFTER `xstockSpotScanner.start()` (scanner running). The init() performs boot-time affirmative state reconciliation (per Langston Q7 + Q7.1) then registers two scheduled timers.
- `sessionLifecycleController.shutdown()` — idempotent tear-down for tests / graceful PM2 shutdown.

**Boot-time affirmative reconciliation:** computes `insideWeekendWindow` via `!isXstockMarketOpenUTC('AAPL/USD')` (symbol-independent post-(c)). Two reconciliation actions performed against the computed window state:

1. **Trade state:** if inside-window, call `markAllXstockWeekendSuspended(openVirtualTradesMap)` — bulk UPDATE `vts_open_trades SET state='weekend_suspended' WHERE asset_class='xstock_spot' AND closed=false AND state='open'`, mirror to in-memory Map. If outside-window, call `unmarkAllXstockWeekendSuspended(...)` — inverse.
2. **Scanner state:** if inside-window, call `xstockSpotScanner.pause()`. If outside-window and scanner found in a paused state (e.g., from a missed Sun-restart hook), call `xstockSpotScanner.resume()`. Otherwise leave alone.

Both actions wrapped in try/catch with audit-row writes (`scheduled_tasks_audit task_name='boot_state_reconciliation'`). On error, the controller still registers the scheduled timers — boot reconciliation is best-effort; the scheduled timers are the long-term reliability backstop.

**Scheduled timers — RETIRED B-NEW-52 (2026-06-06).** ~~`init()` registered two `node-cron@^4.2.1` timers (`0 20 * * 5` Fri shutdown / `0 20 * * 0` Sun restart, `timezone: 'America/New_York'`).~~ These were removed (`registerTimers()` deleted, the two cron callbacks + `writeMissedCronAlert` + the node-cron/cronRegistry imports deleted, `TriggerSource` narrowed to `'poll' | 'boot'`) because the once-weekly alarm did not survive the app's frequent mid-week restarts (3rd staleness recurrence). The weekend window is now driven entirely by **boot reconciliation + the 30-second poll-reconcile** (`scanner.ts handleTick()` → `reconcileWindowState()` → `runShutdownFromPoll`/`runRestartFromPoll`), which invoke the SAME `runWeekendShutdownCore`/`runWeekendRestartCore` hooks described next. The poll entries were flipped to `runPrewarm:true` so the boundary pre-warm still happens. `meta.trigger_source` in the audit rows is now `poll` or `boot`.

**Weekend-shutdown core** (`runWeekendShutdownCore`, now invoked by poll-reconcile or boot — formerly the Fri 8 PM ET cron hook) does, in order:
1. `runPrewarmWithCircuitBreaker({ lookbackDays: 14, tag: 'SHUTDOWN' })` — refresh `xstock_spot_ohlc_60m_snapshot` so Sun-restart cold reads include the closing-week bars.
2. `markAllXstockWeekendSuspended(openVirtualTradesMap)` — bulk-suspend open trades.
3. `xstockSpotScanner.pause()` — scanner stops doing per-cycle work but stays subscribed to centralClock.
4. Audit row written with status / meta.

**Weekend-restart core** (`runWeekendRestartCore`, now invoked by poll-reconcile or boot — formerly the Sun 8 PM ET cron hook) does, in order:
1. `runPrewarmWithCircuitBreaker(...)` — refresh-on-restart (per Langston Q3 of B-NEW-34b ACK). **A prewarm error here is NON-BLOCKING:** it only sets the audit `overallStatus='error'` + `errorMessage`; it does NOT return or throw, so the resume + unsuspend below run unconditionally. A prewarm trip degrades telemetry, not the reopen (verified B-NEW-52 Step-8, `session-lifecycle-controller.ts:429-464`).
2. `xstockSpotScanner.resume()` — scanner resumes per-cycle work on next centralClock tick.
3. `unmarkAllXstockWeekendSuspended(...)` — bulk-restore trades to 'open' (runs just AFTER resume; the two are independent sequential awaits with no data dependency).
4. Audit row (`weekend_restart`, `trigger_source` poll|boot).

### Layer 3 — Pre-warm circuit-breaker (Q6)

In-process pre-warm via `import('../../scripts/b-new-34b-prewarm-snapshot.js').runPrewarm(...)` (extracted as named export during B-NEW-36 (b); CLI wrapper preserved via `import.meta.url`-based direct-invocation detection).

The hook wraps the call in `runPrewarmWithCircuitBreaker()` which catches any error, logs `[B-NEW-36][PREWARM_<TAG>] FAIL — continuing hook`, and returns `{ status: 'error', errorMessage }`. Hook bodies then proceed to suspend/restore trades AND pause/resume the scanner regardless of pre-warm outcome. Pre-warm failure stays observable via the audit row (`status='error'` with `error_message`) but never blocks the operational responsibilities — the scanner needs to pause/resume even if the snapshot didn't refresh.

## Scanner pause/resume semantics

`XstockSpotScannerService.pause()` is graceful-drain semantics, distinct from `stop()`:

- `stop()` unsubscribes `xstockSpotScanner` from `centralClock` AND nulls the `clockTickHandler` reference. Resumption requires a fresh `start()`.
- `pause()` ONLY sets `isPaused = true` + writes `diag.isPaused = true`. The `centralClock` subscription stays live; the `clockTickHandler` reference stays live; the handler's first action on every tick is `if (this.isPaused) return;` so it observes the flag and no-ops.

Result: `resume()` is just a flag-flip — no resubscribe needed. An in-flight cycle that was already running when `pause()` was called completes naturally (gated by the separate `isScanning` flag); only the NEXT centralClock tick observes the pause.

A low-frequency log line fires every 600 ticks while paused (every ~10 min) so a stuck-paused scanner is detectable in PM2 logs but doesn't fill the log across a 48-hour weekend.

## Forensic table `scheduled_tasks_audit`

Schema:
- `id SERIAL PK`
- `task_name VARCHAR(64) NOT NULL` — `'weekend_shutdown'` | `'weekend_restart'` | `'boot_state_reconciliation'`
- `scheduled_for TIMESTAMPTZ NOT NULL` — when the task was supposed to fire (for boot rows = `fired_at`)
- `fired_at TIMESTAMPTZ` — when it actually fired
- `status VARCHAR(32) NOT NULL` — `'pending'` | `'success'` | `'error'`
- `error_message TEXT` — populated when `status='error'`
- `meta JSONB` — task-specific context (snapshot row counts, suspended trade counts, computed window state, pre-warm symbol-error count, etc.)
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

Index `idx_scheduled_tasks_audit_name_status_fired` on `(task_name, status, fired_at DESC)` for operator queries like "show me the last 10 weekend_shutdown fires" or "did any boot reconciliation fail recently".

No production code reads this table — it's operator-only. Bounded growth: 2 timers × ~52 weeks + N PM2 boots/year ≈ low hundreds of rows annually.

## Deploy ordering invariant

The deploy chain MUST run `npm run db:migrate` between `npm run build` and `pm2 restart dawntrader` so the `state` column exists when the new vts-runner code reads it on boot. Standard staging deploy is:

```bash
ssh root@188.245.193.8 "su - deploy -c 'cd /home/deploy/dawntrader && \
  git pull origin migration/aws-supabase && \
  npm run build && \
  npm run db:migrate && \
  pm2 restart dawntrader'"
```

Without the `db:migrate` step, every trade close fails the CHECK constraint AND `rehydrateOpenTrades` fails on the missing column. B-NEW-36 sub-batch (a) (`_migrations` ledger reconciliation) is the prerequisite that lets `db:migrate` run cleanly through the runner — without (a)'s 17-row backfill, the runner would fail on an unrelated pending migration's assertion before reaching B-NEW-36's two migrations.

## Side-effect: closes RUNNING_ISSUES #116 for xstock_spot weekend instance

The VTS sim cycle's iteration filter (`if (t.state === 'weekend_suspended') continue;`) means `resolveTECConfig()` is NOT called for xstock_spot during the weekend window. This eliminates the stale-config `TEC_STALE_FAIL_CLOSED` log spam that was the primary observable failure of #116. Crypto_perp and xstock_perp are still subject to the underlying refresh-on-demand pattern; their fail-closed noise is residual and tracked at #116.

## Cross-references

- `BATCH_CATALOG.md` B-NEW-36 row
- `PHASE_HISTORY.md` B-NEW-36 row (combined a+b+c entry)
- `SYSTEM_IMPACT_MAP.md` "Recent Additions (B-NEW-36)" — new component entries
- `Claude Comms and Packages/Scope Files/B_NEW_36_SCOPE.md` (rev4) + `B_NEW_36_PRE_AUDIT.md` (§1-§8 + §9 re-validation)
- `Claude Comms and Packages/Batch Completion/B_NEW_36_b_COMPLETION_REPORT.md`
- `RUNNING_ISSUES.md` #116 (partially resolved by side-effect) + #117 (B79.0n unbuilt — next in locked sequence) + #119 (RESOLVED by sub-batch a) + #120 (deferred by sub-batch c trace) + #121 (NEW — `setNullReason` ReferenceError flagged by Langston during Step 8)
- `/home/langston/CLAUDE.md` §12 dispatch-anchoring rule (added during this batch's governance pass)

*Added 2026-05-20 with B-NEW-36 sub-batch (b) close.*

---

# xStock dynamic universe discovery (B79.0n.UNIVERSE-DISCOVERY)

*Added 2026-05-21 with B79.0n.UNIVERSE-DISCOVERY close.*

## Architectural model

The xStock universe — the set of tokenized-stock pairs Kraken's WS-equities feed accepts subscriptions for — is **dynamic, DB-backed, and self-refreshing**. The hardcoded `XSTOCK_SPOT_REGISTRY` Map literal and the parallel-sync `server/config/xstocks-universe.json` file (both retired in this batch) have been replaced with an in-memory registry populated at module-init time from `xstock_spot_universe`, which is in turn populated by a three-service discovery chain running daily at 06:00 UTC plus on-demand via the `POST /api/internal/universe-discovery/refresh` route.

## Why this architecture exists

The crypto-side path calls Kraken's REST `AssetPairs` endpoint live on every scanner cycle and adapts automatically to whatever pairs Kraken currently reports (~1,544 today). The xStock path has no equivalent endpoint: Kraken's public REST API does **not** index xStock instruments at all — verified empirically in B-NEW-36 sub-batch (c) where `AssetPairs` returned `EQuery:Unknown asset pair` for ALL xStock symbols including known-good `AAPL/USD`. xStocks stream exclusively through `wss://ws-equities.kraken.com` and that WebSocket has no "list all symbols" message. Before this batch, the only way to know what xStocks Kraken supports was a manual one-shot subscription probe; since the April 2026 probe, the registry was hand-maintained — Kraken kept adding tokenized stocks over time and we had no automated way to discover them.

## Identity-mechanism invariant (critical correctness property)

**Asset identity = symbol string + Kraken WS subscription accept.** Industry classification (the Finnhub `finnhubIndustry` field that maps to our sector column) is **metadata**, NOT identity. The discovery pipeline:

1. Asks CoinGecko `xstocks-ecosystem` category for what tokenized stocks Backed Finance currently issues
2. Sends Kraken WS subscribe requests for each candidate and observes binary accept/reject
3. For accepted symbols only, asks Finnhub `/stock/profile2` for the underlying company's industry → maps to our sector enum

Step 2 (Kraken WS-accept) is ground truth — it's the only thing that determines whether a symbol is in our universe. Step 3 (Finnhub) is metadata-attaching and does NOT decide existence. A symbol where Finnhub returns an unrecognized industry string falls into `UNCATEGORIZED` but remains in the universe and remains tradeable.

This means: misclassified industry labels (like the biotech→technology collision we fixed in Step 4) **can never produce phantom symbols or hide real ones**. They produce wrong sector labels on correctly-identified symbols. The +229 symbols discovered in the first live cycle are real distinct Kraken-traded pairs that the hand-maintained registry was missing, not misclassifications of existing ones.

## Three-service discovery chain

```
┌────────────────┐    prime mover               ┌─────────────────┐    enrichment      ┌──────────────────────┐
│   CoinGecko    │ ───────────────────────────▶ │  Kraken WS      │ ────────────────▶  │  Finnhub             │
│  xstocks-      │  "what tokenized stocks does │  subscription   │  "of those Kraken  │  /stock/profile2     │
│  ecosystem     │   Backed Finance issue?"     │  probe          │   accepts, what    │  "sector + GICS      │
│                │   126 candidates             │  Ground truth.  │   underlying       │   metadata for       │
│  Public, free, │                              │  481 candidates │   companies?"      │   each one"          │
│  no API key    │                              │  (CoinGecko ∪   │  479 accepted +    │  60 req/min ceiling  │
│                │                              │  S&P 500)       │  2 rejected =      │  ~10 min for 479     │
└────────────────┘                              └─────────────────┘  binary result     └──────────────────────┘
```

Each leg has a defined role and is substitutable for the next asset class onboarding (see `ASSET_CLASS_ONBOARDING_WORKFLOW.md` Step 4.8 for the canonical-pattern generalization).

## DB schema

Three tables in `drizzle/migrations/2026-05-21-b79-0n-universe-discovery.sql`:

- **`xstock_spot_universe`** — the universe itself. PK on `symbol`. `sector TEXT` with CHECK constraint covering 15 valid values (11 GICS SPDR + INDEX_PROXY + BROAD_ETF + INTL_ETF + UNCATEGORIZED). `is_delisted BOOLEAN DEFAULT false`. `last_seen_at`, `first_seen_at` timestamps drive the lifecycle. `crypto_adjacent`, `is_adr` flags + `source_chain JSONB` per row. Indexed on `is_delisted`, `last_seen_at`, `sector`.
- **`xstock_spot_universe_overrides`** — PK on symbol references `xstock_spot_universe`. Explicit `override_is_delisted`, `override_sector`, `override_crypto_adjacent`, `override_is_adr` columns (NULL = no override). `runDiscovery()` applies non-null overrides AFTER the live source-chain fields are written, so curator decisions survive every re-discovery cycle.
- **`discovery_runs`** — forensic audit. `run_id BIGSERIAL`. `triggered_by` CHECK in `'cron_daily'` / `'manual_endpoint'` / `'boot_smoke'`. `duration_ms` + `symbols_discovered/stale/delisted`. `source_chain_status JSONB` carries per-leg `{ok, count/enriched_count, partial/error}`. `error_log TEXT` for cycle-level failures.

**Schema choice — VARCHAR + CHECK instead of PostgreSQL ENUM:** sidesteps the `ALTER TYPE ... ADD VALUE` same-transaction restriction. Updating the CHECK constraint when a new sector is added is `ALTER TABLE` with brief lock — works without a transaction restart.

## 5-layer fallback chain at boot

In `server/index.ts:51-90`, the universe-service `initializeFromDB()` is the primary path. If the DB read returns `ok=false` OR `rowCount=0`:

1. **Live DB read** (Layer 1) — `SELECT * FROM xstock_spot_universe WHERE is_delisted=false`. Normal path.
2. **DB snapshot** (Layer 2) — implicitly: Layer 1 is itself a snapshot read; if the most recent discovery cycle failed, Layer 1 returns the cycle-before-that's data because rows aren't deleted, only updated.
3. **File cache** (Layer 3) — `${HOME}/.dawntrader-cache/xstock-universe-cache.json` (currently broken at `/var/lib/dawntrader` per RUNNING_ISSUES #126; relocation queued).
4. **Bootstrap set** (Layer 4) — 20-symbol mega-cap hand-curated fallback in `server/asset_classes/xstock_spot/universe-bootstrap.ts`. Designed to keep system alive through DB-down + file-cache-corrupted scenarios.
5. **Fail-fast** (Layer 5) — `process.exit(1)` if all prior layers fail at boot. Catastrophic config loss should crash the process, not start with an empty universe.

## Stale → delisted lifecycle (anchored on data arrival, not WS-accept)

After source-chain completion, `runDiscovery()` walks every existing universe row:

- `last_seen_at < NOW() - INTERVAL '30 days'` → `UPDATE is_delisted=true`. Excluded from active universe (the `WHERE is_delisted=false` filter in `initializeFromDB()`).
- `last_seen_at < NOW() - INTERVAL '7 days'` → log `[STALE_SYMBOL]` warn (no DB write, log-only signal).
- Re-discovery un-delists via the upsert `ON CONFLICT (symbol) DO UPDATE SET ... is_delisted=false`. A symbol can be delisted on day 30, reappear on day 31, and immediately be active again.

**Why anchor on `last_seen_at` (data arrival), NOT WS-accept:** Kraken WS-equities accepts subscriptions for symbols whose underlying has been delisted from public markets — the accept is necessary but not sufficient for active data. PARA/USD (B79.0n.HYGIENE retired symbol) reappeared in the universe via WS-accept after this batch, but `last_seen_at` doesn't update until 1m bars actually flow. Anchoring lifecycle on data arrival is the only reliable way to detect "WS says yes but no data flows."

## Cron + on-demand API

- `server/services/xstock-universe-cron.ts` registers node-cron `0 6 * * *` UTC, wrapping `runDiscovery('cron_daily')` in try/catch. Single failed cycle does NOT crash process.
- `POST /api/internal/universe-discovery/refresh` — triggers `runDiscovery('manual_endpoint')` and returns the audit row JSON. Bearer-authenticated.
- `GET /api/internal/universe-discovery/health` — counters self-check from DB SSOT. Bearer-authenticated.

## Empirical first-cycle metrics (2026-05-21T11:41:51Z manual_endpoint)

- Duration: 603 200 ms (~10m03s). Finnhub leg dominant (~9m50s) because 479 symbols × 60 req/min ceiling.
- 489 active in DB after cycle (260 seed + 229 newly-discovered).
- 15 distinct sectors (gate ≥7 ✓). UNCATEGORIZED 50/489 = 10.2% (gate ≤20% ✓).
- Finnhub enrichment 479/479 = 100% (gate ≥80% ✓).
- Universe-size empirical delta vs pre-deploy hardcoded: **+229 symbols**. The hand-maintained registry was missing ~88% additional Kraken-traded xStock pairs.

## Cross-references

- Completion report: `Claude Comms and Packages/Batch Completion/B79_0n_UNIVERSE_DISCOVERY_COMPLETION_REPORT.md`
- SIM entry: see "Recent Additions (B79.0n.UNIVERSE-DISCOVERY)" section of `SYSTEM_IMPACT_MAP.md`
- Onboarding canonical pattern: `ASSET_CLASS_ONBOARDING_WORKFLOW.md` Step 4.8 (the dynamic-universe-discovery template generalized for next asset class)
- Identity-mechanism question + answer documented in completion report §7 (Kyle question 2026-05-21)

---

# Storage API REQUIRED-assetClass + Layer 1 / Layer 2 distinction (B79.0n.STORAGE)

*Added 2026-05-21 with B79.0n.STORAGE close.*

## Architectural model

DawnTrader's screener configuration follows a **3-layer precedence chain** established by B72 Slice 4 (commit `ba7703df6`, 2026-05-05) and refined per-asset-class by B79.0n.STORAGE (deploy `ab3153ce5`, 2026-05-21):

1. **Layer 1: `screener_filters` table** — the **primary configuration source**, runtime-overridable via UI, asset-class-scoped per the unique index `(mode, asset_class, filter_path)`. Read at every signal cycle by `storage.getScreenerFilters({mode, assetClass: AssetClass, filterPath?})`.
2. **Layer 2: `module_constants.sqe_config`** — the **fallback default**, code-warm-loaded at boot via B72's sync-read API (`getCachedNumberRequired`), currently mostly wildcard scope `assetClass: '*'`.
3. **Layer 3: `SQE_DEFAULT_THRESHOLDS` static const** — the **catastrophic fallback**, mirrors the seeded module_constants row, consulted only when module_constants warmup hasn't completed and a non-runtime consumer imports the const for static reference.

## The REQUIRED-assetClass discipline (B79.0n.STORAGE)

Before B79.0n.STORAGE, Layer 1 reads silently defaulted to `'crypto_spot'` when callers omitted `assetClass`. This was the **silent-crypto-fallback footgun**: the SQE production bug at `signal_quality_evaluator.ts:143` called `storage.getScreenerFilters({ mode })` with no asset class, silently returning crypto's `finalScoreMin` + `regimeWeightMin` for every signal regardless of which class was being evaluated.

The fix is **type-level enforcement**:

```ts
// Pre-B79.0n.STORAGE:
getScreenerFilters(params: { mode: 'live' | 'paper'; filterPath?: string; assetClass?: string })

// Post-B79.0n.STORAGE:
getScreenerFilters(params: { mode: 'live' | 'paper'; assetClass: AssetClass; filterPath?: string })
```

TypeScript compile-error if any caller omits `assetClass`. The compile-driven audit at implementation time surfaced **6 silent-fallback sites that the manual pre-audit grep missed** (paper-sim-diagnostic + paper-sim-service + reb-2-12 + reb-2-15 + unified-filter-gateway x2) — ~19% pre-audit undercount. TypeScript's reference graph is a better audit tool than ripgrep for "every caller of method X."

## The canonical-baseline helper

For genuinely-diagnostic readers that intentionally want the canonical crypto baseline for UI display (Filter Diagnostics panel, Settings UI, boot config snapshot, etc.), B79.0n.STORAGE introduced a dedicated helper:

```ts
async getCanonicalScreenerConfig(params: { mode: 'live' | 'paper'; filterPath?: string }): Promise<ScreenerFilters | null> {
  // Returns the canonical crypto_spot baseline for UI display and diagnostic reference.
  // NEVER use this for runtime signal/screener/SQE routing — use getScreenerFilters({mode, assetClass, ...})
  // with the explicit asset class derived from the signal/cycle context. The whole point of B79.0n.STORAGE is
  // preventing the silent-fallback footgun this helper could become if misused.
  return this.getScreenerFilters({ ...params, assetClass: 'crypto_spot' });
}
```

The banner-style "NEVER use this for runtime routing" docstring is deliberate: Langston's Step 4 review caught 3 sites that initially routed through this helper but were actually runtime crypto-trading paths (unified-filter-gateway x2 + paper-sim-service x1). Reclassified to (a) crypto-intentional explicit before deploy. The docstring tone made the misuse easy to identify.

## Cache key extension pattern

`SignalQualityEvaluatorService.getThresholds` was previously keyed by `mode` alone. Post-batch:

```ts
async getThresholds(mode: 'paper' | 'live', assetClass: AssetClass) {
  const cacheKey = `${mode}:${assetClass}`;
  // ... cache lookup + storage call ...
}
```

Memory cost is `O(k)` not `O(k²)` because k=4 max (paper+live × crypto+xstock). The cache-isolation regression test at `b79-0n-storage-sqe-asset-class-routing.test.ts` warms `paper:crypto_spot` then reads `paper:xstock_spot` and asserts distinct storage calls — locks the cache shape against silent regression.

## Layer 2 (`module_constants.sqe_config`) per-class deferred to SCORING

B79.0n.STORAGE made Layer 1 per-class but kept Layer 2 (the `module_constants.sqe_config` rows that `getSQEModuleDefaults()` reads via wildcard `_SQE_GK = { exchange: '*', assetClass: '*', strategy: '*', regime: '*' }`) at wildcard scope. The asymmetry is acceptable because Layer 1 is dominant; Layer 2 is fallback only when Layer 1 has no row or missing field.

Per Langston Step 2 Q-S2-4 ACK, Layer 2 per-class promotion to active work is deferred to SCORING batch (#8) with explicit triggers: (a) xStock requires different `min_final_score` / `min_regime_weight` than crypto (Phase 19 calibration gate), OR (b) any third asset class onboards (3-class asymmetry compounds harder than 2-class), OR (c) SCORING batch begins regardless. Promotion to active = `_SQE_GK` parameterized by assetClass + `getSQEModuleDefaults(assetClass)` REQUIRED param + per-class `module_constants.sqe_config.{crypto_spot,xstock_spot}.min_final_score/.min_regime_weight` rows seeded.

Tracked at RUNNING_ISSUES #129.

## Cross-references

- Completion report: `Claude Comms and Packages/Batch Completion/B79_0n_STORAGE_COMPLETION_REPORT.md`
- SIM entry: see "Recent Additions (B79.0n.STORAGE)" section of `SYSTEM_IMPACT_MAP.md`
- Onboarding canonical pattern: `ASSET_CLASS_ONBOARDING_WORKFLOW.md` Step 4.9 (the REQUIRED-assetClass storage API + cache-key extension + getCanonicalScreenerConfig helper template)
- B72 prior-arc context per umbrella rev 4: `B79_0n_UMBRELLA_XSTOCK_ACTIVE_TRADING_PATH.md` §1.5 (Layer 1 vs Layer 2 distinction documented)

---

## B79.0n.SCORING — SQE Layer-2 per-class extension + predictive-confidence per-class cache key (2026-05-26)

**Architectural change:** SQE threshold resolver's Layer 2 (`module_constants 'sqe_config'`) extended from wildcard to per-class for `min_final_score` + `min_regime_weight`. The 3-layer cascade (screener_filters → module_constants → static const) PRESERVED but Layer 2 now class-routed. Static-mirror fallback observable via `getSQEStaticMirrorFallbackStats()` counter — 48h verify-gate target zero.

**`getPredictiveConfidence` per-class cache key (F-2 fix):** Previously `${regime}:${strategy}` collapsed crypto + xstock telemetry winRate to same cache slot. Now `${assetClass}:${regime}:${strategy}`. Empirical finding: xstock BULL_STABLE/momentum_breakout winRate is structurally distinct from crypto BULL_STABLE/momentum_breakout winRate; collapsing them silently biased one class with the other's data.

**TWO-STEP per Langston D-5:** B79.0n.SCORING ships promotion + counter; B79.0n.SCORING.b ships wildcard retirement + F-1 resolver hooks for `SCORE_WEIGHTS` + `RANKING_WEIGHTS` after 48h verify-gate close.

## B79.0n.TEC — All-keys per-class TEC config + tec-evaluator consolidation (2026-05-26)

**Architectural change:** Closes RUNNING_ISSUES #85 (deferred-from-B79.TEC). TEC `refreshTECConfigForClass` extended from 1-key HARD-FAIL (`break_even_enabled`) to 11-key per-class config resolution via `ALL_TEC_KEYS` SSOT.

**HARD-FAIL doctrine retreat (Langston ACK Option A):** Strict `requireKey<T>` throw on all 11 keys initially drafted but softened to observable `pick(key, TEC_DEFAULTS.x)` with per-key `[B79.0n.TEC][PICK_FALLBACK]` counter via `getTECPickFallbackStats()`. Reason: 7 existing TEC test fixtures use mocked-db pattern providing per-class `break_even_enabled` + wildcard for other 10 keys; strict throw would break all 7 simultaneously. Kill-switch HARD-FAIL preserved on `break_even_enabled` (the operator-flip canary). B79.0n.TEC.b restores strict throw within 7d of 48h verify-gate close (Langston SLA).

> **✅ RETREAT REVERSED — STRICT MODE LIVE (P19-B1, 2026-06-13).** The 48h verify-gate (2026-05-28) + a full-active-day staging grep (2026-06-13, zero `PICK_FALLBACK`) earned the promotion: all 11 keys are now strict `requireKey<T>` (throw `[B79.0n.TEC.b][TEC_MISSING_KEY]`), the soft path and its counter scaffolding are DELETED (the `PICK_FALLBACK` log signal no longer exists), and the 11 `trailing_exit` keys are BOOT-REQUIRED for all 4 active classes — a missing row refuses to boot rather than silently running on `TEC_DEFAULTS` (now type-template-only in fact as well as comment). The blocking test fixtures were repaired (full 11-key mocks) and a 5-test strict regression lock incl. a 12th-key fixture-parity tripwire pins the doctrine. Deploy-verified: `[TEC_PRIME] bootstrap complete — 4 active classes warmed in 29ms`, zero TEC throws. Closes RUNNING_ISSUES #141 (and the #85 tail).

**`tec-evaluator.resolveTECConstants` consolidation (D-3):** Previously async `getModuleConstants` round-trip + silent `catch → DEFAULTS` fallback (lines 222-227). Now SYNC per-class cache lookup via `resolveTECConfig(context.assetClass)`. Eliminates duplicate DB round-trip per exit-cycle + the silent DEFAULTS-fallback anti-pattern that B79.0n.TEC was designed to close.

**xstock_spot.break_even_enabled chronology (D-1 root cause):** DB probe revealed `updated_by='kyle-directive-2026-05-21-disable-xstock-be'` — Kyle manually reverted on 2026-05-21 a week after the 2026-05-11 B79.0m.b enable migration. `trailing-exit-controller.ts:107` comment block updated with full chronology citation. Variant-K alignment preserved at code-level.

**Active-trading impact today: zero** (paper_sim_trades + trades both empty; VTS-shadow uses inline governance, not the SQE/TEC evaluator path most of the time).

## Cross-references

- B79.0n.SCORING completion report: `Claude Comms and Packages/Batch Completion/B79_0n_SCORING_COMPLETION_REPORT.md`
- B79.0n.TEC completion report: `Claude Comms and Packages/Batch Completion/B79_0n_TEC_COMPLETION_REPORT.md`
- SIM entries: see "Recent Additions (B79.0n.SCORING + B79.0n.TEC, 2026-05-26)" section of `SYSTEM_IMPACT_MAP.md`
- Onboarding patterns shipped: `ASSET_CLASS_ONBOARDING_WORKFLOW.md` §4.15 (promote-then-retire two-step) + §4.16 (all-keys HARD-FAIL coverage) + §4.17 (Step 6 deploy-SHA verification) + §4.18 (CI initial-schema pg_dump divergence)


# Chapter 12: Adaptive Market Response (AMR)

> Added B-5 (2026-06-12). Current state: SHADOW for both classes — the system computes and records, applies nothing. Activation is a Phase-19 decision.

## 12.1 Concept and contract

AMR is the per-asset-class "market weather" layer: every 30 seconds, per class (crypto_spot, xstock_spot), it reads seven live inputs, produces ONE monotone favorability score (continuousScore in [0,1], higher = more favorable), and classifies that class's market as CALM / CHOPPY / STORMY / FAVORABLE / IDLE.

**The M2 contract (load-bearing):** the classification IS a pure bucketing of continuousScore. Hard rules NEVER act as side-channels — they apply as SCORE CAPS: a quarantined input caps the score at 0.5 (R2: quarantine may tighten posture, never loosen), and FAVORABLE requires the FULL five-input weighted evidence set (the input-completeness cap pins thin-data scores at favorable_min - 0.001 — favorable is earned, never assumed from partial data). This makes the future learned brain a one-site swap: resolveStrategyModeFromWeather (strategy-modes.ts) is the single seam mapping classification -> strategy mode (FAVORABLE->AGGRESSIVE, CALM->NORMAL, CHOPPY->DEFENSIVE, STORMY->SURVIVAL, IDLE->null/hold).

**Inputs (per class):** regime vote % (per-class MCE vote, B-4.7), measured friction (crypto: the scanned universe via cost-cache, ~496 names, negative-spread read guard + B-5.1 writer guard at the setCostMetrics chokepoint; xstock: the scanner-fed friction-sample store, reason-coded — the cost-cache is structurally crypto-only), DBS (per-class store snapshot, staleness honored), regime flip-rate (per-class tracker; epochs = LIVE cycles, IDLE never counts), EV-gap ratio (realized vs predicted percent-of-notional from the VTS close hook; 30-obs warm), and macro z-scores (crypto: BTC dominance / funding / mcap-momentum baselines; xstock: VIX + DXY from the equity feed). Observation-denominated baselines throughout — delayed sources count distinct observations, not polling ticks.

**Modes and dials (DB-governed, per-class, fail-hard, boot-asserted):** NORMAL (1.0 baseline; slots crypto 10 / xstock 8), DEFENSIVE (0.6x size, 1.2x stops, 0.8x targets, 1.5x cooldown; slots 6/5), SURVIVAL (0.25x, 1.5x, 0.6x, 2x; slots 3/2), AGGRESSIVE (1.25x size, 1.2x targets, 0.75x cooldown; slots 12/10; stop 1.0; confidence floor = NORMAL floor — B1: aggression NEVER lowers the quality bar). AGGRESSIVE exists per-class ONLY; class-less access THROWS by design.

**Dwell + ladder:** posture tightens immediately, relaxes one rung at a time after a dwell of consecutive supporting LIVE epochs; post-IDLE resume = min(firstRead, NORMAL) (B5 rule — a restart/weekend can never wake into AGGRESSIVE).

**Flag (per class, module_constants amr_runtime.mode):** disabled (no compute — A5), shadow (compute + ledger, apply nothing), active (gates + overlays consult the resolved mode; fail-closed). Gates: SQE unconditional self-sourcing check (F1), paper engine + realtime executor + RTB promotion re-check; precedence killSwitch > AMR > TCL as independent ANDs (F3).

**Warm-up honesty + the no-posture gate (B-5.1, 2026-06-12):** friction `null` with reason WARMING or NO_SOURCE classifies **IDLE** (staleness carries `friction_warming`/`friction_no_source`) — a restart can never produce a thin-input CALM (#224; the pre-fix transient read CALM for ~90s before the friction sentinel warmed). LOW_VOLUME_THIN and MARKET_CLOSED stay LIVE — those are *measured* states, not warm-up. **A measured friction source is therefore a PREREQUISITE for any class to reach a LIVE AMR classification** — a class without a friction sampler sits permanently IDLE (onboarding-workflow prerequisite). Gate side: under `enforce` (flag=active), `mode === null` (boot / warm-up / IDLE) **fails closed** with gate `no_posture` — there is no ungated window between restart and the first LIVE read. Safe by construction: all four gate sites are entry-side (exits never gated — fail-closed cannot trap an open position); posture is in-memory-only (no persisted-posture hazard); the restart sequence is always null → blocked-under-active → first LIVE ≤ NORMAL (post-IDLE cap). Under `dry_run` (shadow), null-mode remains skipped — nothing to rehearse; the ledger records the IDLE cycle. Corollary: xstock weekends under ACTIVE = IDLE all weekend = no new xstock entries while the market is closed, correct by construction.

## 12.2 Decision ledger and evidence

amr_decision_ledger (one row per class-cycle): full weather json (inputs incl. health[] and staleness[]), continuousScore, resolvedMode, would-dials, would_blocks (dry-run gate verdicts), flagState. Retention: 90-day IN-SERVICE delete (maybePruneLedger), deliberately NOT in the B-NEW-47 archive sweep. This is the shadow-week evidence substrate and the future ML training set. Note (#217/#221): rankingShadow stamps ride the rows but populate ONLY from the RTB selection path — structurally null in VTS passive operation; substantive evidence begins when Phase 19 enables selection.

## 12.3 Input-health sentinels (Obj-15b) and the honest detectability boundary

Every cycle each input reports {fresh, inBounds, varying, crossConsistent}; failures alert through the system-alerts queue (incident-deduped; incidents CLOSE on recovery so a feed breaking twice re-alerts). Detector classes: absence/staleness (never-seeded inputs escalate), out-of-bounds (QUARANTINE — nulled-with-reason, never clamped, never consumed), stuck-value (distinct-value-count arming K over a window, then N identical; stuck-at-EXACTLY-ZERO uses a faster N — the #219 frozen-feed class), cross-source divergence (CBOE-vs-FRED VIX on matching trade dates).

**The honest detectability boundary:** sentinels detect feeds that stop, freeze, leave plausibility rails, or diverge from a second source. They CANNOT detect a feed that is wrong-but-plausible-and-moving with no second source (e.g., a subtly mis-scaled input that stays within rails). That class is covered only by (a) the correctness audit (repeatable via the permanent audit-dump surface — section 12.4) and (b) cross-source checks where second sources exist. Claims of "input health monitored" must carry this boundary.

## 12.4 The correctness-audit surface (Obj-15a, permanent)

GET /api/diagnostics/amr/audit-dump: per class, ONE synchronous pass captures the per-pair aggregation inputs AND the system-computed aggregate for vote / DBS / friction (separate sections are not atomic with each other; EXACT/1e-6 comparisons are per-section). scripts/b5-amr-correctness-audit.ts recomputes everything with independent implementations and scores against pinned bars. First full run (2026-06-12): every leg PASS at zero deviation; the audit caught the Finding-A2 units bug (EV-gap/B67.4 realized side ~100x understated — fixed, vts epochs bumped to crypto 4 / xstock 5), the Finding-B xstock stamp gap (fixed), and the legacy wildcard AGGRESSIVE row (deleted). Re-run cadence: any AMR-touching batch + shadow-week reviews.

## 12.5 UI

Analytics -> Overview -> "Adaptive Market Response — Weather Report": per-class cards (classification + score bar + would-run/running mode + health chips with raw values + triggers + staleness + 5-row legend). The behavior descriptions template from the LIVE dial values served by /api/diagnostics/amr/current — a retune updates the copy automatically (no hardcoded numbers; CALM falls back to numeric copy if any NORMAL dial leaves 1.0; FAVORABLE renders the stop dial only when it differs from 1.0).

## 12.6 Known open items at ship — STATUS UPDATE (B-5.1, 2026-06-12)

~~#222 crypto DBS equity contamination~~ **RESOLVED B-5.1** (crypto_spot allowlist on the single MCE→store write site; permanent registry-based purity audit leg; deployed 5737b1ddb at 01:01:56Z = the intra-epoch-4 clean/contaminated boundary for DBS-stamped rows). ~~#223 negative-spread writer guard~~ **RESOLVED B-5.1** (field-level drop at the setCostMetrics chokepoint; nothing fabricated on first-write-crossed; 18 live rejections in the first 10 min — all −1 stale-ask sentinels; log on stderr→error.log). ~~#224 restart-transient CALM~~ **RESOLVED B-5.1** (friction WARMING/NO_SOURCE → IDLE + the `no_posture` fail-closed gate — see 12.1). Still open: session-boundary classification flapping (dwell ladder damps MODE correctly; shadow-week quantifies whether classification-level hysteresis is needed), DXY z warming (~30 ECB dates), FRED first cross-check pending first publish, DBS per-pair weight-cap design question (`GLOBAL_DBS_MAX_PAIR_WEIGHT_PCT=1.0` — Phase-19 prep).
