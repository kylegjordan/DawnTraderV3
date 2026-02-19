# Phase 1: Core Math & Scoring Engine — Version 2

> **Phase**: 1 of 11
> **Author**: Claude Code (System Cartographer)
> **Date**: 2026-02-15
> **Version**: 2 — Kyle corrections applied (2026-02-15)
> **Status**: REVISED — ChatGPT review corrections + Kyle review corrections applied
> **Covers Replit Items**: #8 IMF Metrics, #9 Unified Filter Gateway, #11 FinalScore Calculator, #12 Score Weights Config, #13 SQE Deep Dive, #14 Cost Model, #15 Slippage & Fee Model, #16 Cost Metrics/Cache

---

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

Thresholds imported from `SYSTEM_GUARDS.IMF_THRESHOLDS`.

### OHLC Cache

5-minute TTL cache for OHLC data per symbol. During passive learning, uses cached data if live data unavailable. Active trading mode caches after computation.

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

### Trade Friction — ⚠️ INCORRECT MODEL (Legacy)

```
friction = (entryPrice + exitPrice) × quantity × BASE_FEE_SLIPPAGE
perUnitFriction = (entry + exit) × 1 × BASE_FEE_SLIPPAGE
```
Where `BASE_FEE_SLIPPAGE = 0.005` (0.5%) from `SYSTEM_GUARDS`.

**This is the WRONG friction model.** It uses a flat percentage instead of component-separated costs. The correct friction model is in `cost-model.ts`:
```
TotalRoundTripCost = (fee × 2) + (slippage × 2) + spread
```

The `calculateFriction()` function in analysis-utils.ts and all uses of `SYSTEM_GUARDS.BASE_FEE_SLIPPAGE` for friction calculations should be replaced with `computeTotalRoundTripCost()` from cost-model.ts. **See RISK-009 and UNIFY-001 in CHANGES_AND_FIXES.md.**

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

### Evaluation Criteria (Post-Directive 11.0E)

| Gate | Threshold | Source |
|------|-----------|--------|
| FinalScore | ≥ 0.35 | Computed or backfilled |
| RegimeWeight | ≥ 0.30 | Computed or backfilled |
| ROI Gate | ≥ dynamic threshold | Regime + PredictiveConfidence |

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
2. **NGC-derived DI feeds the kernel** — signal-orchestrator.ts line 1128 converts NGC to DI (`DI = normalizedConf * 100`) before calling `computeNetExpectancyKernel()`. This means a legacy blended metric directly influences Pwin and therefore NetEV. **See BUG-004 in CHANGES_AND_FIXES.md.**
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

#### FINDING-P1-01: DI Probability Divergence (CRITICAL)

**signal-orchestrator.ts line 1128**: `const DI = normalizedConf * 100`

The DSS kernel call site converts NGC (blended confidence) into DI before passing it to `computeNetExpectancyKernel()`. But the kernel was designed to compute `Pwin = 0.40 + DI/200` where DI is Directional Integrity (geometric price path consistency, 0-100).

- **Expectancy gate** (expectancy.ts line 509): Uses `calculateDirectionalIntegrity(prices)` — correct geometric DI
- **DSS kernel call** (signal-orchestrator.ts line 1128): Uses NGC × 100 — incorrect, means Pwin is driven by blended confidence, not price geometry

These are fundamentally different probability inputs feeding the same kernel. **Logged as BUG-004.**

#### FINDING-P1-02: Dual Friction Models in Same File (One Is Incorrect)

In signal-orchestrator.ts, two different friction calculations coexist:
- **Line 557**: `computeTotalRoundTripCost(fee, slippage, spread)` from cost-model.ts — **CORRECT**: `(fee × 2) + (slippage × 2) + spread`
- **Line 1122**: `SYSTEM_GUARDS.BASE_FEE_SLIPPAGE / 100` — **INCORRECT**: flat 0.005% approximation that does not account for component separation

**Kyle confirmed**: `computeTotalRoundTripCost` is the correct friction model. The formula `(fee × 2) + (slippage × 2) + spread` correctly accounts for fees and slippage being incurred on both entry AND exit legs of the trade, while spread is incurred once at entry. `SYSTEM_GUARDS.BASE_FEE_SLIPPAGE` is incorrect and should be replaced everywhere it is used for friction. **Logged as RISK-009 and UNIFY-001.**

#### FINDING-P1-03: NGC Is Legacy That Was Not Fully Removed

NGC is a legacy metric that should have been removed but was not. Anywhere NGC appears in the codebase is incorrect — it is not a calculation DawnTrader should be using anymore. Despite this, NGC remains deeply wired into the active pipeline:
- Computes NGC which incorrectly flows as the `confidence` carrier through the entire pipeline
- NGC directly feeds FinalScore via `hybridScore ?? confidence` fallback — meaning FinalScore is contaminated by a legacy metric
- NGC-derived DI feeds the kernel (FINDING-P1-01) — meaning Pwin/NetEV are contaminated by a legacy metric
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

---

*End of Phase 1: Core Math & Scoring Engine*
