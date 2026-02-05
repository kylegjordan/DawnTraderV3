# Phase 11 Implementation History — Complete Reference

**Document Version:** 3.0  
**Last Updated:** February 5, 2026  
**Schema Version:** v1.8.3  
**Directive Range:** 11.0 through 11.8C

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Directive 11.0 — Metric Engine Consolidation](#directive-110--metric-engine-consolidation)
3. [Directive 11.1 — Canonical Regime-Strategy Mapping](#directive-111--canonical-regime-strategy-mapping)
4. [Directive 11.2 — VTS Modernization & Regime-Driven Simulation](#directive-112--vts-modernization--regime-driven-simulation)
5. [Directive 11.3 — Adaptive Scanning Intelligence](#directive-113--adaptive-scanning-intelligence)
6. [Directive 11.4 — Market Indicators & Analytics Hardening](#directive-114--market-indicators--analytics-hardening)
7. [Directive 11.5 — Math, Macro, and Regime Synchronization](#directive-115--math-macro-and-regime-synchronization)
8. [Directive 11.6 — Data Purge & Machine Learning Reset](#directive-116--data-purge--machine-learning-reset)
9. [Directive 11.7 — Regime Archive & Telemetry Infrastructure](#directive-117--regime-archive--telemetry-infrastructure)
10. [Directive 11.8 — Authority Unification & Legacy Decommission](#directive-118--authority-unification--legacy-decommission)
11. [File Artifacts Index](#file-artifacts-index)
12. [Architecture Diagrams](#architecture-diagrams)

---

## Executive Summary

Phase 11 represents the mathematical and operational hardening of the DawnTrader trading platform. The phase spans from metric consolidation (11.0) through authority unification and legacy decommission (11.8), establishing:

- **Unified Scoring**: Single `FinalScore` metric replacing legacy CWQI/NGC/ProfitRate
- **Canonical Mappings**: Single source of truth for regime-to-strategy relationships
- **VTS Modernization**: Phase-10 compatible virtual trading simulator with regime-driven simulation
- **Adaptive Scanning**: Dual-pool (Ideal + Rotational) pair selection with telemetry feedback
- **Mathematical Foundations**: Z-Score normalization, profitability gates, and macro-state awareness
- **Regime Archive**: Weekly regime metric archival with manifest tracking
- **Authority Unification**: Single Net Expectancy Kernel, Phase 11 Predictive Learning as sole authority
- **Legacy Decommission**: LATTi, Goals ML, ARA, Strategy Presets fully removed

**Key Statistics (as of February 5, 2026):**
- Total Directives: 8 major (11.0 through 11.8C)
- Sub-Directives: 55+
- Files Modified: 200+
- Files Deleted: 15+ (legacy decommission)
- New Modules Created: 30+

---

## Directive 11.0 — Metric Engine Consolidation

### Overview

Directive 11.0 completes the transition from legacy multi-metric scoring to the unified FinalScore system. This three-phase initiative establishes FinalScore as the sole operational metric.

---

### Phase 11.0E — FinalScore Transition Phase

**Schema Version:** v1.4.6  
**Status:** ✅ Complete

#### Objectives
- Deprecate legacy metrics (CWQI, NGC, ProfitRate) in favor of FinalScore
- Establish the canonical FinalScore formula
- Update Signal Quality Evaluator (SQE) to use FinalScore-based filtering

#### Key Changes

1. **Formula Definition**: Established the canonical FinalScore calculation:
   ```
   FinalScore = (HybridScore × 0.4) + (Confidence × 0.3) + (RegimeWeight × 0.2) - (DecayPenalty × 0.1)
   ```

2. **Threshold Standardization**: Set `MIN_FINAL_SCORE = 0.35` as the universal quality threshold

3. **SQE Integration**: Signal Quality Evaluator updated to filter by `finalScoreMin` and `regimeWeightMin`

4. **Deprecation Markers**: Legacy columns (cwqi, ngc, profit_rate) marked for removal

---

### Phase 11.0F — Legacy Data Purge & Schema Finalization

**Schema Version:** v1.5.0  
**Status:** ✅ Complete

#### Objectives
- Permanently remove legacy metric columns from database schema
- Archive historical metric data for audit purposes
- Lock scoring coefficients as immutable constants

#### Key Changes

1. **Column Removal**: Dropped `cwqi`, `ngc`, and `profit_rate` columns from `rtb_signals` table

2. **Legacy Archive Created**: 
   - File: `server/legacy/data/legacy_metrics_snapshot.json`
   - Contains archived metric definitions and formulas

3. **Immutable Coefficients**: Score weights locked in `server/config/score-weights.config.ts`:
   ```typescript
   export const SCORE_WEIGHTS = Object.freeze({
     HYBRID: 0.4,
     CONFIDENCE: 0.3,
     REGIME: 0.2,
     DECAY: 0.1
   });
   ```

4. **Metric Engine v1.0**: Declared FinalScore as the canonical and sole operational metric

---

### Phase 11.0G — Schema Integrity & Telemetry Validation Hardening

**Schema Version:** v1.5.1  
**Status:** ✅ Complete

#### Key Changes

1. **Formal Migration File**: `drizzle/migrations/2026-11-0G-schema-hardening.sql`

2. **Archive Integrity Checksum**: SHA-256 verification via `sealLegacyArchive()`, `verifyArchiveIntegrity()`

3. **Schema Version Tracking**: `server/config/schema-version.ts`

4. **Telemetry Schema Validation**: Method `validateSchemaSync(frontendVersion)` with health status indicators

5. **ExecutionConfig Read-Only Lock**: `Object.freeze()` prevents runtime modification

---

## Directive 11.1 — Canonical Regime-Strategy Mapping

### Overview

Establishes a single source of truth for all regime-to-strategy and regime-to-signal-type mappings, replacing scattered mappings throughout the codebase.

**Status:** ✅ Complete  
**Schema Version:** v1.5.2

---

### Phase 11.1A — Canonical Dictionary Creation

#### Key Changes

1. **Single Source File**: `server/core/regime/canonical-regime-strategy-map.ts`

2. **10 Market Regimes Defined**:
   | Regime | Description | Risk Multiplier |
   |--------|-------------|-----------------|
   | R1 | Range-Bound (Low ADX, Low Vol) | 1.0 |
   | R2 | Trending Quiet (High ADX, Low Vol) | 1.0 |
   | R3 | Breakout Potential (Low ADX, Rising Vol) | 0.9 |
   | R4 | Momentum Surge (High ADX, High Vol, +Trend) | 0.85 |
   | R5 | Volatile Chop (Low ADX, High Vol) | 0.7 |
   | R6 | Trend Exhaustion (Falling ADX, High Vol) | 0.75 |
   | R7 | Quiet Drift (Low Vol, Unclear Trend) | 0.95 |
   | R8 | Compression (Very Low Vol, Tightening Range) | 0.9 |
   | R9 | High Vol Impulse (Sudden Vol Spike) | 0.6 |
   | R10 | Transition (Mixed Signals) | 0.8 |

3. **Strategy Mappings**: Each regime maps to:
   - `primaryStrategies[]` — Main strategies to deploy
   - `secondaryStrategies[]` — Backup strategies
   - `signalTypes[]` — QUANT, PATTERN, or HYBRID
   - `riskMultiplier` — Position sizing adjustment

4. **Helper Functions**:
   - `selectContextAwareStrategy(regime, pattern, liquidity)` — Context-aware selection
   - `getFavoredStrategiesForRegime(regime)` — UI display
   - `getFavoredSignalTypesForRegime(regime)` — UI display

---

### Phase 11.1B — Validation Middleware

#### Key Changes

1. **Governance Validation**: All signals must have valid regime and strategy from canonical map

2. **Runtime Assertions**: Invalid combinations rejected with detailed logging

3. **Cross-Module Enforcement**: VTS, Signal Orchestrator, and RTB all use canonical map

---

## Directive 11.2 — VTS Modernization & Regime-Driven Simulation

### Overview

Modernizes the Virtual Trading Simulator (VTS) to use Phase-10 canonical metrics and regime-driven simulation cycles.

**Status:** ✅ Complete  
**Schema Version:** v1.5.4

---

### Phase 11.2A — Phase-10 Metric Alignment

#### Key Changes

1. **Canonical Metrics Used**:
   - `FinalScore` — Primary quality metric
   - `HybridScore` — Combined strategy score
   - `RegimeWeight` — Market alignment
   - `DecayPenalty` — Signal freshness
   - `ExpectedEdge` — Profit potential minus costs
   - `FrictionCost` — Total trading costs

2. **Schema Version**: VTS records include `schemaVersion: "1.6.7"`

3. **Trade Record Format**:
   ```typescript
   interface Phase10TradeRecord {
     id: string;
     signal: VirtualSignal;
     status: 'open' | 'closed';
     entryTime: number;
     exitTime?: number;
     exitPrice?: number;
     resultType?: 'take_profit' | 'stop_loss' | 'timeout';
     grossProfit?: number;
     netProfit?: number;
     fees: number;
     calibrated: boolean;
     finalScore: number;
     hybridScore: number;
     predictiveConfidence: number;
     regimeWeight: number;
     decayPenalty: number;
     expectedEdge: number;
     frictionCost: number;
     signalType: string;
     strategy: string;
     regime: string;
     pool: 'ideal' | 'rotational';
     source: 'simulation';
     schemaVersion: string;
   }
   ```

---

### Phase 11.2B — 5-Class Regime Model

#### Key Changes

1. **Dynamic Regime Calculation**: Per-pair regime calculated using:
   - ADX (trend strength)
   - Volatility (price movement)
   - Momentum (directional bias)

2. **Regime Score**: 0-100 scale for regime confidence

3. **Function**: `calculatePairRegime(ohlcData)` in `server/core/metrics/market-regime.ts`

---

### Phase 11.2C — VTS Auto-Start During Passive Learning

#### Key Changes

1. **Passive Learning Mode**: VTS runs automatically when trading engines are stopped

2. **60-Second Simulation Cycles**: Each cycle processes 100 pairs from Ideal Pool

3. **Data Segregation**: VTS writes to dedicated telemetry aggregator (no pollution of live data)

4. **Telemetry Integration**: VTS is the sole source of telemetry writes during passive learning

---

## Directive 11.3 — Adaptive Scanning Intelligence

### Overview

Replaces static pair selection with learning-driven dual-pool selection system.

**Status:** ✅ Complete  
**Schema Version:** v1.5.5

---

### Phase 11.3A — Dual-Pool Architecture

#### Key Changes

1. **Pool Types**:
   | Pool | Purpose | Selection Criteria |
   |------|---------|-------------------|
   | Ideal Pool | High-performing pairs | Ranked by telemetry score |
   | Rotational Pool | Discovery/exploration | Random sampling with cooldowns |

2. **Batch Composition**: 100 pairs per cycle
   - 70% from Ideal Pool (70 pairs)
   - 30% from Rotational Pool (30 pairs)

3. **Adaptive Ratio**: Ratio can shift based on market conditions

---

### Phase 11.3B — Telemetry Aggregator Service

#### Key Changes

1. **Service**: `server/services/telemetry-aggregator.ts`

2. **Rolling 24-Hour Window**: Collects per-pair performance metrics

3. **Metrics Tracked**:
   - Win rate
   - Average profit
   - Signal count
   - Regime distribution
   - Strategy performance

4. **Pair Ranking**: `getDominantRegime()` aggregates pair regimes for global view

---

### Phase 11.3C — Pair Failure Tracking

#### Key Changes

1. **Cooldown Blacklisting**: Pairs with consistent failures enter cooldown

2. **Service**: `PairFailureTracker` in adaptive scan manager

3. **Dynamic Fill Algorithm**: Maintains batch size when pairs are blacklisted

---

## Directive 11.4 — Market Indicators & Analytics Hardening

### Overview

Comprehensive hardening of market indicators, analytics endpoints, and UI data binding.

**Status:** ✅ Complete  
**Sub-Directives:** 11.4A through 11.4H.6G

---

### Phase 11.4A — IMF (Institutional Math Filters) Integration

#### Key Changes

1. **Core Metrics**:
   | Metric | Description | Threshold |
   |--------|-------------|-----------|
   | LQ (Log-Liquidity) | Liquidity assessment | ≥ 40 |
   | VolNoise | Volatility noise ratio | ≤ 0.6 |
   | DI (Directional Integrity) | Trend quality | Variable |
   | σ (Sigma) | Standard deviation | Variable |

2. **Filter Logic**: Pairs must pass both LQ and VolNoise thresholds

3. **Benchmark Bypass**: Blue-chip and stablecoin pairs can bypass VolNoise filter for scanning only (not trading)

---

### Phase 11.4B — Benchmark List System

#### Key Changes

1. **Benchmark Pairs**: Pre-defined list of major trading pairs always included in scans

2. **Force-Include Logic**: Benchmarks appear in UI even when not passing all filters

3. **Rank Validation**: Unscanned pairs show "—" instead of invalid rank

---

### Phase 11.4C — Pattern Detection & Injection

#### Key Changes

1. **Pattern Scanner**: `scanPatterns(candles, symbol)` in `server/core/patterns/pattern-scanner.ts`

2. **Detected Patterns**:
   - MORNING_STAR
   - EVENING_STAR
   - HAMMER
   - SHOOTING_STAR
   - ENGULFING_BULL
   - ENGULFING_BEAR
   - DOJI
   - PINBAR

3. **Pattern Injection**: VTS injects detected patterns into signals

---

### Phase 11.4H — Analytics & UI Binding

#### Sub-Phases

| Phase | Description | Status |
|-------|-------------|--------|
| 11.4H.1 | Regime display in analytics | ✅ Complete |
| 11.4H.2 | Benchmark pair display | ✅ Complete |
| 11.4H.3 | Friction calculation audit | ✅ Complete |
| 11.4H.4 | Passive learning mode detection | ✅ Complete |
| 11.4H.4A | Global regime from telemetry | ✅ Complete |
| 11.4H.5 | Market indicators endpoint | ✅ Complete |
| 11.4H.6 | Favored strategies/signals binding | ✅ Complete |
| 11.4H.6A | Strategy mapper integration | ✅ Complete |
| 11.4H.6B | Frontend query keys | ✅ Complete |
| 11.4H.6C | Rank validation | ✅ Complete |
| 11.4H.6D | Cache bypass for live data | ✅ Complete |
| 11.4H.6E | Authenticated query restoration | ✅ Complete |
| 11.4H.6G | Canonical logging | ✅ Complete |

---

## Directive 11.5 — Math, Macro, and Regime Synchronization

### Overview

Establishes mathematical foundations for profitability validation, Z-Score normalization, and macro-state awareness. This is the most recent directive implemented.

**Status:** ✅ Complete  
**Implemented:** January 18, 2026

---

### Task 1 — Profitability Validation (Net Expectancy Gate)

#### Purpose
Ensures no virtual trade executes unless mathematically profitable after all costs.

#### Implementation

1. **Module Created**: `server/core/calculations/expectancy.ts`

2. **Function**: `isMathematicallyProfitable(entryPrice, targetPrice, spread, slippage, feeRate)`

3. **Formula**:
   ```
   grossProfit = (targetPrice - entryPrice) / entryPrice
   totalCost = (feeRate × 2) + (spread × 1.1) + slippage
   
   Returns: grossProfit > totalCost
   ```

4. **Integration**: VTS runner calls this before creating any virtual trade

5. **Logging**: `[11.5][ProfitGate] Skipping {symbol}: Net expectancy below 0`

---

### Task 2 — Rolling Z-Score Normalization

#### Purpose
Provides statistical normalization for market metrics using rolling 300-period windows.

#### Implementation

1. **Module Created**: `server/utils/rolling-stats.ts`

2. **Class**: `RollingStats`
   ```typescript
   class RollingStats {
     constructor(windowSize: number = 300);
     push(value: number): void;
     mean(): number;
     stdDev(): number;
     zScore(value: number): number;
     isWarmedUp(minSamples: number = 30): boolean;
   }
   ```

3. **Z-Score Formula**:
   ```
   zScore = (value - mean) / stdDev
   ```

4. **Integration Points**:
   - **VTS Runner**: Calls `getNormalizedRegimeWithDetails()` for per-pair Z-Score logging
   - **DSS (Dynamic Strategy Selector)**: Tracks `volNoise` and `trendSlope` Z-Scores

5. **Logging**:
   - VTS: `[11.5][ZScore] {symbol}: regime={regime} zScores={adx=X, vol=Y, mom=Z}`
   - DSS: `[11.5][DSS_ZScore] volZ=X trendZ=Y raw_vol=Z raw_trend=W`

---

### Task 3 — Macro-State Module

#### Purpose
Detects global market conditions that affect all trading pairs.

#### Implementation

1. **Module Created**: `server/core/metrics/macro-state.ts`

2. **Function**: `getGlobalMacroCondition()`

3. **Detected States**:
   | State | Description | Detection Criteria |
   |-------|-------------|-------------------|
   | NORMAL | Standard conditions | Default |
   | VOLATILITY_EXPANSION | Market-wide vol spike | Global vol > 2σ above mean |
   | LIQUIDITY_CRUNCH | Thin order books | Global liquidity < 1σ below mean |
   | SPECULATIVE_SURGE | FOMO/mania conditions | Momentum + volume spike |

4. **Usage**: Adjusts secondary metric thresholds based on macro state

---

### Task 4 — Secondary Metric Adjustment

#### Purpose
Dynamically adjusts metric thresholds based on macro conditions.

#### Implementation

1. **Module Created**: `server/core/metrics/secondary-metrics.ts`

2. **Function**: `adjustMetricRanges(baseThresholds, macroCondition)`

3. **Adjustment Logic**:
   | Macro State | LQ Adjustment | VolNoise Adjustment |
   |-------------|---------------|---------------------|
   | NORMAL | 1.0× | 1.0× |
   | VOLATILITY_EXPANSION | 1.2× | 0.8× (stricter) |
   | LIQUIDITY_CRUNCH | 1.5× (stricter) | 1.0× |
   | SPECULATIVE_SURGE | 1.1× | 0.7× (stricter) |

---

### Task 5 — Filter Logic Correction

#### Purpose
Ensures blue-chip and stablecoin pairs are scanned but only tradable when passing IMF filters.

#### Implementation

1. **File Modified**: `server/services/fx5-scanner.ts`

2. **Logic**: Benchmark pairs bypass volatility filters for *scanning* but not for *trading*

3. **Logging**: `[11.4H.6][BYPASS] Benchmark bypass active: {count} pairs bypassed volatility/boring filters`

---

### Task 6 — Strategy-Specific Guardrails

#### Purpose
Adds strategy-specific entry requirements beyond global filters.

#### Implementation

1. **File Modified**: `server/services/vts-runner.ts`

2. **Guardrail**: `sma_trend_ride` strategy requires ADX > 25
   ```typescript
   if (strategy === 'sma_trend_ride' && regimeResult.adx < 25) {
     console.log(`[11.5][Guardrail] Skipping ${symbol}: ADX ${adx} < 25 for sma_trend_ride`);
     return null;
   }
   ```

---

### Task 7 — Strategy Performance Audit

#### Purpose
Analyzes per-strategy win rates and provides recommendations.

#### Implementation

1. **Module Created**: `server/core/strategy-analyzer.ts`

2. **Function**: `auditStrategyPerformance(trades, minSampleSize)`

3. **Output Structure**:
   ```typescript
   interface StrategyAuditResult {
     strategy: string;
     sampleSize: number;
     winRate: number;
     avgProfit: number;
     recommendation: 'KEEP' | 'MONITOR' | 'DISABLE';
     reason: string;
   }
   ```

4. **Recommendation Thresholds**:
   | Win Rate | Recommendation |
   |----------|----------------|
   | ≥ 50% | KEEP |
   | 35-50% | MONITOR |
   | < 35% | DISABLE |

---

## File Artifacts Index

### Core Configuration Files

| File | Purpose | Directive |
|------|---------|-----------|
| `server/config/score-weights.config.ts` | Immutable FinalScore coefficients | 11.0F |
| `server/config/schema-version.ts` | Schema version tracking | 11.0G |
| `server/core/regime/canonical-regime-strategy-map.ts` | Canonical regime/strategy mappings | 11.1 |

### Calculation Modules

| File | Purpose | Directive |
|------|---------|-----------|
| `server/core/calculations/expectancy.ts` | Profitability validation | 11.5.1 |
| `server/utils/rolling-stats.ts` | Z-Score normalization | 11.5.2 |
| `server/core/metrics/market-regime.ts` | Regime calculation + Z-Score | 11.2, 11.5 |
| `server/core/metrics/macro-state.ts` | Macro condition detection | 11.5.3 |
| `server/core/metrics/secondary-metrics.ts` | Dynamic threshold adjustment | 11.5.4 |
| `server/core/strategy-analyzer.ts` | Strategy performance audit | 11.5.7 |

### Service Files

| File | Purpose | Directive |
|------|---------|-----------|
| `server/services/vts-runner.ts` | Virtual Trading Simulator | 11.2, 11.5 |
| `server/services/fx5-scanner.ts` | Market scanner with IMF | 11.4A |
| `server/services/telemetry-aggregator.ts` | Performance telemetry | 11.3B |
| `server/services/dynamic-strategy-selector.ts` | DSS with Z-Score | 11.5.2 |
| `server/services/market-indicators.ts` | Analytics endpoints | 11.4H |

### Legacy Archives

| File | Purpose | Directive |
|------|---------|-----------|
| `server/legacy/data/legacy_metrics_snapshot.json` | Archived CWQI/NGC/ProfitRate | 11.0F |
| `server/legacy/metrics_archive.ts` | Archive checksum functions | 11.0G |

### Documentation

| File | Purpose |
|------|---------|
| `docs/directive_11_summary.md` | This document |
| `docs/schema_reference_v1_5_1.md` | Schema reference |
| `replit.md` | Project state and architecture |

---

## Architecture Diagrams

### Signal Flow (Post-Phase 11)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            MARKET DATA LAYER                                │
├─────────────────────────────────────────────────────────────────────────────┤
│  Kraken API → OHLC Cache → Price Cache → WebSocket Feed                     │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FX5 SCANNER (Directive 11.4)                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  1. Fetch Kraken Universe (1419 pairs)                                      │
│  2. Apply IMF Filters (LQ ≥ 40, VolNoise ≤ 0.6)                            │
│  3. Calculate per-pair metrics (LQ, DI, VolNoise, σ)                        │
│  4. Force-include benchmark pairs                                           │
│  5. Produce: classifiedSurvivors[]                                          │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
                    ▼                             ▼
┌─────────────────────────────────┐ ┌─────────────────────────────────────────┐
│   PASSIVE LEARNING PATH         │ │         ACTIVE TRADING PATH             │
│   (Engine Stopped)              │ │         (Engine Running)                │
├─────────────────────────────────┤ ├─────────────────────────────────────────┤
│                                 │ │                                         │
│  ┌─────────────────────────┐    │ │  ┌─────────────────────────────────┐    │
│  │   VTS RUNNER (11.2)     │    │ │  │   SIGNAL ORCHESTRATOR           │    │
│  ├─────────────────────────┤    │ │  ├─────────────────────────────────┤    │
│  │ 1. 60s simulation cycle │    │ │  │ 1. Generate live signals        │    │
│  │ 2. 100 pairs per cycle  │    │ │  │ 2. Calculate FinalScore         │    │
│  │ 3. Calculate regime     │    │ │  │ 3. Apply regime weight          │    │
│  │ 4. Z-Score normalize    │    │ │  └──────────────┬──────────────────┘    │
│  │ 5. Pattern detection    │    │ │                 │                       │
│  │ 6. Profitability gate   │    │ │                 ▼                       │
│  │ 7. Strategy guardrails  │    │ │  ┌─────────────────────────────────┐    │
│  │ 8. Generate virtual     │    │ │  │   SQE (Signal Quality Eval)     │    │
│  │    trades               │    │ │  ├─────────────────────────────────┤    │
│  └──────────┬──────────────┘    │ │  │ Filter: FinalScore ≥ 0.35      │    │
│             │                   │ │  │ Filter: RegimeWeight ≥ min      │    │
│             ▼                   │ │  └──────────────┬──────────────────┘    │
│  ┌─────────────────────────┐    │ │                 │                       │
│  │ TELEMETRY AGGREGATOR    │    │ │                 ▼                       │
│  ├─────────────────────────┤    │ │  ┌─────────────────────────────────┐    │
│  │ - 24h rolling window    │    │ │  │   RTB QUEUE (Ready-to-Buy)      │    │
│  │ - Per-pair win rates    │    │ │  ├─────────────────────────────────┤    │
│  │ - Regime distribution   │    │ │  │ - Signal staging                │    │
│  │ - Dominant regime calc  │    │ │  │ - Periodic refresh (5s)         │    │
│  └──────────┬──────────────┘    │ │  │ - Decay penalty application     │    │
│             │                   │ │  └──────────────┬──────────────────┘    │
│             ▼                   │ │                 │                       │
│  ┌─────────────────────────┐    │ │                 ▼                       │
│  │ JSON FILE STORAGE       │    │ │  ┌─────────────────────────────────┐    │
│  ├─────────────────────────┤    │ │  │   TCL (Trade Criteria Limiter)  │    │
│  │ logs/virtual_trades/    │    │ │  │   → TEC (Trade Exec Controller) │    │
│  │   YYYY-MM-DD.json       │    │ │  │   → ORDER MANAGEMENT            │    │
│  └─────────────────────────┘    │ │  └─────────────────────────────────┘    │
└─────────────────────────────────┘ └─────────────────────────────────────────┘
```

### Metric Flow (Directive 11.5)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         METRIC CALCULATION FLOW                             │
└─────────────────────────────────────────────────────────────────────────────┘

Raw OHLC Data
     │
     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CORE METRIC CALCULATIONS                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │   ADX (Trend)   │  │   Volatility    │  │    Momentum     │             │
│  │   0-100 scale   │  │   0-1 scale     │  │   -1 to +1      │             │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘             │
│           │                    │                    │                       │
│           └────────────────────┼────────────────────┘                       │
│                                │                                            │
│                                ▼                                            │
│                    ┌───────────────────────┐                                │
│                    │   ROLLING STATS       │                                │
│                    │   (300-period window) │                                │
│                    ├───────────────────────┤                                │
│                    │  push(value)          │                                │
│                    │  mean() → μ           │                                │
│                    │  stdDev() → σ         │                                │
│                    │  zScore() → (x-μ)/σ   │                                │
│                    └───────────┬───────────┘                                │
│                                │                                            │
│                                ▼                                            │
│                    ┌───────────────────────┐                                │
│                    │   Z-SCORE OUTPUT      │                                │
│                    ├───────────────────────┤                                │
│                    │  adxZ: normalized ADX │                                │
│                    │  volZ: normalized vol │                                │
│                    │  momZ: normalized mom │                                │
│                    │  isWarmedUp: boolean  │                                │
│                    └───────────────────────┘                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       REGIME CLASSIFICATION                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Based on ADX + Volatility + Momentum → One of 10 Regimes (R1-R10)        │
│                                                                             │
│   ┌─────────┬─────────┬─────────┬─────────┬─────────┐                      │
│   │   R1    │   R2    │   R3    │   R4    │   R5    │                      │
│   │ Range   │Trending │Breakout │Momentum │Volatile │                      │
│   │ Bound   │ Quiet   │Potential│ Surge   │  Chop   │                      │
│   └─────────┴─────────┴─────────┴─────────┴─────────┘                      │
│   ┌─────────┬─────────┬─────────┬─────────┬─────────┐                      │
│   │   R6    │   R7    │   R8    │   R9    │   R10   │                      │
│   │ Trend   │ Quiet   │Compress │High Vol │Transition                      │
│   │Exhaust  │ Drift   │  -ion   │ Impulse │         │                      │
│   └─────────┴─────────┴─────────┴─────────┴─────────┘                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PROFITABILITY GATE (11.5.1)                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   isMathematicallyProfitable(entry, target, spread, slippage, fee)         │
│                                                                             │
│   grossProfit = (target - entry) / entry                                   │
│   totalCost = (fee × 2) + (spread × 1.1) + slippage                        │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────┐          │
│   │  IF grossProfit > totalCost  →  PROCEED (create signal)    │          │
│   │  ELSE                        →  REJECT (log and skip)      │          │
│   └─────────────────────────────────────────────────────────────┘          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Directive 11.6 — Data Purge & Machine Learning Reset

### Overview

Directive 11.6 addresses contaminated trade and ML data caused by the random exit bug in VTS simulation. This directive purges affected records, resets dependent adaptive components, and prepares the system for clean data ingestion.

**Status:** ✅ Complete  
**Implemented:** January 21, 2026  
**Timestamp Reference:** `2026-01-21T00:00:00Z` (pre-11.6D trades purged)

### Phase 11.6A — Data Purge Implementation

#### Objectives
- Purge all VTS trades contaminated by random exit outcomes
- Reset ML data directories to clean state
- Clear rolling statistics cache
- Reset adaptive component defaults
- Control learning ingestion until VTS fix confirmed

#### Key Implementation

1. **File Created**: `server/core/data-purge-11-6a.ts`

2. **Purge Logic**:
   - Identify trades before Directive 11.6D timestamp
   - Archive affected VTS trade files
   - Clear contaminated ML model data
   - Reset adaptive component parameters

3. **Learning Control**:
   ```typescript
   setLearningIngestionEnabled(enabled: boolean)
   shouldSkipLearningIngestion(mode: string)
   isLearningIngestionEnabled()
   ```

4. **Affected Directories**:
   - `logs/vts_trades/*.json` — VTS trade records
   - `logs/ml_data/` — Machine learning training data
   - Rolling statistics cache (in-memory)

5. **Logging Format**: `[11.6A][Component] Message`

#### Purge Report Structure
```typescript
interface DataPurgeReport {
  timestamp: string;
  vtsTradesPurged: PurgeResult;
  mlDataReset: boolean;
  adaptiveComponentsReset: boolean;
  rollingStatsReset: boolean;
  learningDisabled: boolean;
}
```

### Phase 11.6D — VTS Exit Logic Fix

#### Objectives
- Fix random exit logic in VTS simulation
- Establish clean baseline timestamp for future trades

#### Implementation
- VTS trades after `2026-01-21T00:00:00Z` use fixed exit logic
- Pre-11.6D trades flagged for purge

---

## Directive 11.7 — Regime Archive & Telemetry Infrastructure

### Overview

Directive 11.7 establishes the regime archive system for historical regime metrics persistence and weekly archival with manifest tracking.

**Status:** ✅ Complete  
**Date Range:** January 2026

### Phase 11.7E — Regime Archive System

#### Objectives
- Create weekly regime metric archival system
- Implement manifest tracking for archive files
- Provide API endpoints for archive retrieval

#### Key Changes

1. **Archive Scheduler**: Weekly archival runs Sunday 00:45 UTC via `archival-scheduler.ts`

2. **Archive Storage**: JSON files in `logs/regime_archive/YYYY-MM-DD.json` format

3. **Manifest System**: Tracks archive files with checksums and entry counts

4. **API Endpoints**:
   | Endpoint | Purpose |
   |----------|---------|
   | `GET /api/vts/regime-archive` | Retrieve archive records with pagination |
   | `GET /api/vts/regime-archive/summary` | Get archive statistics summary |
   | `GET /api/vts/regime-archive/manifest` | Get archive file manifest |
   | `GET /api/vts/regime-archive/latest` | Get most recent archive |

5. **UI Integration**: Machine Learning page Regime Archive tab displays historical data

#### Key Files
- `server/core/archival/regime-archiver.ts` — Core archive logic
- `server/core/archival/archival-scheduler.ts` — Weekly scheduler
- `server/routes/regime-archive.ts` — API endpoints
- `client/src/pages/machine-learning.tsx` — UI integration

---

### Phase 11.7F — Canonical Regime & Strategy Lock-In

**Date:** January 23, 2026  
**Status:** ✅ Complete

#### Objectives
- Establish single source of truth for regime-strategy mappings
- Implement strategy realignment based on empirical performance
- Add DriftScore computation and Z-Score persistence

#### Strategy Realignment (v1.4b)

| Strategy | Previous Regime | New Regime | Rationale |
|----------|-----------------|------------|-----------|
| SMA Trend Ride | BULL_STABLE | HIGH_VOL_IMPULSE | Better alignment with trend momentum patterns |
| Range Trading | (confirmed) | LOW_VOL_CHOP | Confirmed as optimal regime with updated metrics |

#### Key Implementation

1. **Canonical Map Lock-In**: `server/config/canonical-regime-strategy-map.ts`
   - Schema version: `regime-mapping/v1.4c`
   - All subsystems MUST import from this file
   - Local inference or mapping logic PROHIBITED

2. **DriftScore Integration**:
   - Per-regime-strategy DriftScore computation
   - Rolling 50-sample Z-score history buffer
   - volZ/trendZ persistence in telemetry

3. **API Endpoints (Directive 11.7F)**:
   | Endpoint | Purpose |
   |----------|---------|
   | `GET /api/system/mapping-drift` | Compare canonical vs empirical regimes |
   | `GET /api/system/canonical-map` | Get canonical regime-strategy mapping |
   | `POST /api/system/force-sync-canonical` | Force sync bridge documents |
   | `GET /api/system/mapping-drift/export` | Export drift data as CSV |

4. **Validation Middleware**: Rejects invalid regime-strategy combinations with detailed logging

#### Key Files
- `server/config/canonical-regime-strategy-map.ts` — Single source of truth
- `server/core/analytics/mapping-drift-calculator.ts` — Drift analysis
- `server/config/drift-descriptions.ts` — Drift category descriptions
- `server/config/drift-definitions.ts` — Drift thresholds

---

## Directive 11.8 — Authority Unification & Legacy Decommission

### Overview

Directive 11.8 is the culminating phase that establishes Phase 11 Predictive Learning as the **single authority** for all parameter adjustment. All parallel learning systems, legacy adaptive mechanisms, and decorative UI artifacts are decommissioned.

**Status:** ✅ Complete  
**Date Range:** February 2-4, 2026

---

### Phase 11.8A — Predictive & Learning Authority Audit

**Date:** February 2, 2026  
**Status:** ✅ COMPLETE (READ-ONLY AUDIT)

#### Objectives
- Complete file-level audit of all predictive/learning write paths
- Map authority ownership for strategy behavior, scoring, filters, risk, guardrails
- Identify dual-role conflicts and authority overlaps

#### Key Findings

1. **Canonical Authority Sources**:
   | Resource | Role |
   |----------|------|
   | `bridge/canonical/phase9_predictive-learning.json` | Regime weight vectors (baseline) |
   | `server/config/score-weights.config.ts` | FinalScore coefficients (immutable) |
   | `server/config/system-guards.ts` | Threshold constants (immutable) |
   | `server/config/strategy-governance.ts` | Strategy dependency levels |

2. **Learning Systems Identified for Decommission**:
   - LATTi/Heuristic Trader (parallel adaptive system)
   - Goals ML Engine (preset-driven parameter mutation)
   - Adaptive Risk Advisor (parallel risk system)
   - DHMA Tuning Service (auto-tuning)

3. **Database Fields Frozen**:
   - `tunedByLatti` — preserved but no longer written
   - `managedByLottie` — preserved but no longer written

---

### Phase 11.8B — Decommission Execution

Directive 11.8B executes the decommission in a controlled sequence of sub-directives.

---

#### 11.8B-A: Net Expectancy Authority Unification

**Date:** February 3, 2026  
**Status:** ✅ COMPLETE

**Objective:** Create single authoritative Net Expectancy calculation.

**Key Changes:**
- Created `server/core/calculations/net-expectancy-kernel.ts`
- Pure synchronous function with no I/O or side effects
- Single `computeNetExpectancyKernel()` for all Net EV math

**Formula:**
```typescript
netEV = (pWin × avgWin) - (pLoss × avgLoss) - friction
```

---

#### 11.8B-A2: VTS Net Expectancy Alignment

**Date:** February 3, 2026  
**Status:** ✅ COMPLETE

**Objective:** Align VTS profitability decisions with canonical Net EV kernel.

**Key Changes:**
- VTS now uses `computeNetExpectancyKernel()` for profitability gate
- Eliminated unique EV math in VTS
- `netEV > 0` gate enforced consistently

---

#### 11.8B-B: LATTi Decommission & Authority Cleanup

**Date:** February 3, 2026  
**Status:** ✅ COMPLETE

**Objective:** Remove all LATTi/Heuristic Trader parallel learning systems.

**Files Deleted:**
| File | Reason |
|------|--------|
| `server/services/heuristic-trader.ts` | Core LATTi service |
| `server/services/lottie-oversight-service.ts` | DHMA health monitoring |
| `server/services/baseline-indicator.ts` | LATTi baseline service |
| `server/services/walter-standby.ts` | Walter/LATTi placeholder |
| `server/services/walter-adaptive-heuristics.ts` | Adaptive heuristics |
| `client/src/components/latti-toast-listener.tsx` | Toast notifications |
| `client/src/components/monitoring/lottie-tuning-tab.tsx` | Tuning UI |
| `client/src/components/dashboard/dashboard-latti-widget.tsx` | Dashboard widget |
| `client/src/hooks/use-baseline-status.ts` | Baseline hook |

**Routes Removed:**
- `/api/system/latti-tuning`
- `/api/system/latti-insights`
- `/api/system/latti-cross-strategy`
- `/api/system/latti-strategy-usage`
- `/api/latti/targets`

---

#### 11.8B-B1: Authority Surface Cleanup

**Date:** February 4, 2026  
**Status:** ✅ COMPLETE

**Objective:** Remove all LATTi authority toggles/badges from UI control surfaces.

**Key Changes:**
- Removed LATTi badges from core guardrails, filters, LPCP
- UI now shows "Manual Control" / "Configured" badges
- Schema defaults updated: `managedByLottie=false`, `manualOverrideEnabled=true`
- Database fields FROZEN (not deleted) per directive

---

#### 11.8B-C: Goals ML & Preset System Decommission

**Date:** February 4, 2026  
**Status:** ✅ COMPLETE

**Objective:** Remove Goals ML Engine, Preset Grid, and Adaptive Risk Advisor.

**Files Deleted:**
| File | Reason |
|------|--------|
| `client/src/components/goals/tuning-tab.tsx` | Goals ML UI |
| `client/src/components/goals/presets-grid.tsx` | Preset System UI |
| `client/src/components/goals/adaptive-risk-advisor.tsx` | ARA UI |
| `server/services/dhma-tuning-service.ts` | DHMA auto-tuning |
| `server/jobs/cognitive-tuning-job.ts` | Scheduled tuning job |

**Routes Deprecated (410 Gone):**
- `GET /api/goals-presets`
- `GET /api/goals-presets/active`
- `PUT /api/goals-presets/select`
- `GET /api/goals-learning/summary`
- `POST /api/goals-learning/trigger`

**UI Changes:**
- Tuning tab removed from Goals Engine
- PresetsGrid removed from Goals tab
- AdaptiveRiskAdvisor removed from Goals tab
- LPCP hidden from Guardrails tab (backend preserved)

---

#### 11.8B-C2: Purpose Tab & Strategy Preset Decommission

**Date:** February 4, 2026  
**Status:** ✅ COMPLETE

**Objective:** Remove dead UI surfaces (Purpose tab, Strategy Presets).

**Files Deleted:**
| File | Reason |
|------|--------|
| `client/src/components/goals/walter-purpose-tab.tsx` | Dead UI surface |
| `server/services/strategy-presets.ts` | Static preset definitions |

**Routes Removed:**
- `GET /api/strategies/presets`
- `GET /api/strategies/presets/:strategy/:presetName`

**UI Changes:**
- Purpose tab removed from Guardrails & Filters page
- Strategy preset selector removed from Strategies tab
- Tab count reduced from 6 to 5
- Page renamed to "Guardrails & Filters" to reflect true purpose

---

### Phase 11.8 Preserved Systems

The following systems were **NOT touched** (distinct from decommissioned systems):

| System | Location | Purpose |
|--------|----------|---------|
| Trading Pace Presets | `goals-table.tsx` | Trading pace configuration |
| Core Four Presets | `coherency-rules-tab.tsx` | Risk preset selection |
| LATTI Targets Display | `target-daily-goals.tsx` | Display only (read-only) |
| Coherency System | `coherency-rules-tab.tsx` | Rule validation display |
| Phase 11 Predictive Learning | `server/core/calibration/*` | **SOLE AUTHORITY** |
| Phase 11 Governance | `server/core/governance/*` | Regime governance |
| Net Expectancy Kernel | `server/core/calculations/net-expectancy-kernel.ts` | **SOLE EV AUTHORITY** |

---

### Phase 11.8 Authority Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PHASE 11.8 AUTHORITY MODEL                          │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────┐       ┌─────────────────────────┐
│   SOLE AUTHORITIES      │       │   DECOMMISSIONED        │
├─────────────────────────┤       ├─────────────────────────┤
│ Phase 11 Predictive     │       │ ❌ LATTi/Heuristic      │
│ Learning                │       │ ❌ Goals ML Engine      │
│                         │       │ ❌ Adaptive Risk Advisor│
│ Net Expectancy Kernel   │       │ ❌ DHMA Tuning Service  │
│                         │       │ ❌ Cognitive Tuning Job │
│ System Guards (immut.)  │       │ ❌ Strategy Presets     │
│                         │       │ ❌ Goals Presets        │
│ Score Weights (immut.)  │       │ ❌ Purpose Tab          │
└─────────────────────────┘       └─────────────────────────┘
```

---

## Summary

Phase 11 represents the mathematical and operational maturation of DawnTrader:

| Directive | Focus | Key Deliverable |
|-----------|-------|-----------------|
| 11.0 | Metric Consolidation | FinalScore as sole metric |
| 11.1 | Canonical Mappings | Single source of truth for regimes |
| 11.2 | VTS Modernization | Phase-10 compatible simulator |
| 11.3 | Adaptive Scanning | Dual-pool selection system |
| 11.4 | Analytics Hardening | Reliable UI data binding |
| 11.5 | Mathematical Foundations | Z-Score, profitability gates, macro-state |
| 11.7 | Regime Archive | Weekly archival with manifest tracking |
| 11.8 | Authority Unification | Phase 11 Predictive Learning as sole authority |

**Current State (February 5, 2026):**
- All Phase 11 directives complete (11.0-11.8C)
- Phase 11 Predictive Learning is **sole authority** for parameter adjustment
- All parallel learning systems decommissioned (LATTi, Goals ML, ARA, DHMA Tuning)
- Net Expectancy Kernel is **sole authority** for EV calculations
- Regime Archive system operational with weekly archival
- Database fields `tunedByLatti` and `managedByLottie` FROZEN
- UI simplified: "Guardrails & Filters" page with 5 tabs
- Ready for Phase 12 planning

---

*Document maintained by DawnTrader Development Team*  
*Last updated: February 5, 2026*
