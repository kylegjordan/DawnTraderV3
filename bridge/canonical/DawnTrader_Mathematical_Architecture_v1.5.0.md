# DawnTrader Mathematical Architecture Overview
### *Version: Post-Directive 11.5 (Schema v1.6.7 — Metric Engine v1.0)*

**Last Updated:** January 18, 2026

---

## 1. System Overview

The DawnTrader system operates as a **multi-phase quantitative trading engine**, where every trade lifecycle is governed by layered mathematical models designed for signal generation, quality filtering, and adaptive execution.  

At its core, the platform integrates:
- **Deterministic Scoring Math** (FinalScore, RegimeWeight)  
- **Adaptive Risk Models** (Sizing Engine & Trailing Exit Math)  
- **Signal-Oriented Decision Intelligence** (Predictive and Regime-Aware Logic)  
- **Z-Score Normalization** (Rolling 300-period statistical normalization)
- **Macro-State Awareness** (Global market condition adjustments)

The complete mathematical flow:

```
[FX5 Scan + Adaptive Scanning]
      ↓
[Institutional Math Guards (IMF)]
      ↓
[Z-Score Normalization + Macro Detection]
      ↓
[Signal Orchestrator + DSS]
      ↓
[Strategy + Regime Selection]
      ↓
[Signal Quality Evaluator (SQE)]
      ↓
[Profitability Gate (Net Expectancy)]
      ↓
[Ready-to-Buy Queue (ranked by FinalScore)]
      ↓
[TCL – Promotion Manager]
      ↓
[TEC – Trade Execution Controller]
      ↓
[Order Management + Adaptive Sizing + Trailing Exits]
```

Every layer refines precision and reduces uncertainty before committing capital.

---

## 2. Core Scanning and Filtering Math

### 2.1 FX5 Scanning Engine

The **FX5 Scan** evaluates all available currency pairs and applies adaptive filters to prioritize tradable assets.  
Its math includes:

| Filter | Formula | Purpose |
|---------|----------|----------|
| Volume Filter | `Vol ≥ 100K units` | Ensure liquidity |
| Liquidity Ratio | `LQ = bidVolume / askVolume` | Enforce stability |
| VolNoise | `σ_price / mean_volume` | Filter erratic movement |
| Correlation | `ρ ≤ 0.75` | Avoid correlated pairs |
| Range Bound | `ΔP = |High – Low|` | Detect price compression |
| Stability | `LQ ≥ 40, VolNoise ≤ 0.6` | Institutional-grade quality |

### 2.2 Adaptive Scanning Layer

Adjusts pool ratios based on historical success:
```
IdealPoolRatio_t+1 = IdealPoolRatio_t × (1 + β × (WinRate_ideal – WinRate_rotational))
```

**Pool Composition (Directive 11.3):**
- 70% Ideal Pool (telemetry-ranked pairs)
- 30% Rotational Pool (exploration/discovery)

---

## 3. Institutional Math Guards (IMF)

Before any strategy math is applied, the **Institutional Guards** enforce global limits:

| Guard | Threshold | Purpose |
|-------|-----------|---------|
| `ρ` (Correlation) | ≤ 0.75 | Pair must be sufficiently uncorrelated |
| `VolNoise` | ≤ 0.6 | Price movement must be stable |
| `LQ` (Log-Liquidity) | ≥ 40 | Adequate liquidity depth |

These are non-negotiable mathematical safeguards designed to mimic institutional-quality trade screening.

### 3.1 Dynamic Threshold Adjustment (Directive 11.5)

Thresholds adjust based on macro conditions:

| Macro State | LQ Adjustment | VolNoise Adjustment |
|-------------|---------------|---------------------|
| NORMAL | 1.0× | 1.0× |
| VOLATILITY_EXPANSION | 1.2× | 0.8× (stricter) |
| LIQUIDITY_CRUNCH | 1.5× | 1.0× |
| SPECULATIVE_SURGE | 1.1× | 0.7× (stricter) |

---

## 4. Z-Score Normalization (Directive 11.5)

### 4.1 Rolling Statistics Framework

The system uses **rolling 300-period windows** for statistical normalization.

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

### 4.2 Z-Score Formula

```
zScore = (value - mean) / stdDev
```

### 4.3 Application Points

| Subsystem | Metrics Tracked | Purpose |
|-----------|-----------------|---------|
| **VTS Runner** | ADX, Volatility, Momentum | Per-pair regime classification |
| **DSS** | VolNoise, TrendSlope | Adaptive strategy selection |
| **Market Regime** | Global ADX, Vol, Mom | Normalized regime boundaries |

### 4.4 Warmup Requirements

- **Minimum Samples**: 30 periods before Z-Scores are valid
- **Window Size**: 300 periods (rolling)
- **Cold Start Behavior**: Returns raw values until warmup complete

### 4.5 Z-Score Logging

```
[11.5][ZScore] BTC/USD: regime=BULL_STABLE zScores={adx=1.23, vol=-0.45, mom=0.87}
[11.5][DSS_ZScore] volZ=0.56 trendZ=1.12 raw_vol=0.032 raw_trend=0.0045
```

---

## 5. Macro-State Detection (Directive 11.5)

### 5.1 Global Macro Conditions

The system detects **4 global market conditions** that affect all trading pairs:

| Condition | Detection Criteria | Impact |
|-----------|-------------------|--------|
| **NORMAL** | Default state | No adjustments |
| **VOLATILITY_EXPANSION** | Global vol > 2σ above mean | Tighten VolNoise filter |
| **LIQUIDITY_CRUNCH** | Global liquidity < 1σ below mean | Raise LQ requirements |
| **SPECULATIVE_SURGE** | Momentum + volume spike | Tighten both filters |

### 5.2 Detection Algorithm

```typescript
function getGlobalMacroCondition(): MacroCondition {
  const volZ = globalVolatilityZScore();
  const liqZ = globalLiquidityZScore();
  const momZ = globalMomentumZScore();
  
  if (volZ > 2.0) return 'VOLATILITY_EXPANSION';
  if (liqZ < -1.0) return 'LIQUIDITY_CRUNCH';
  if (momZ > 1.5 && volZ > 1.0) return 'SPECULATIVE_SURGE';
  return 'NORMAL';
}
```

---

## 6. Signal Orchestration & Decision Support System (DSS)

The **Signal Orchestrator** is the brain of DawnTrader.  
It merges incoming raw scan data with strategy and regime intelligence from the **Decision Support System (DSS)** to decide *what kind of trade signal to create* and *how it should behave*.

### 6.1 DSS Market Regime Detection (5-Class Model)

| Regime | Momentum | ADX | Volatility | Description |
|--------|----------|-----|------------|-------------|
| BULL_STABLE | > 0.005 | > 25 | < 0.025 | Sustained uptrend, stable vol |
| BEAR_VOLATILE | < -0.005 | > 25 | > 0.03 | Downward impulse, high turbulence |
| LOW_VOL_CHOP | abs < 0.002 | < 20 | < 0.015 | Flat, no directionality |
| HIGH_VOL_IMPULSE | > 0.010 | > 30 | > 0.03 | Strong breakout, expansion |
| TRANSITION | ± 0.004 | 20-25 | 0.015-0.03 | Reversal zone |

### 6.2 Z-Score Enhanced Regime Classification

The DSS now uses Z-Score normalized metrics for regime boundaries:

```typescript
function getNormalizedRegimeWithDetails(metrics) {
  const adxZ = adxRollingStats.zScore(metrics.adx);
  const volZ = volRollingStats.zScore(metrics.volatility);
  const momZ = momRollingStats.zScore(metrics.momentum);
  
  // Use Z-Scores for more adaptive classification
  if (momZ > 1.0 && adxZ > 0.5 && volZ < 0) return 'BULL_STABLE';
  if (momZ < -1.0 && adxZ > 0.5 && volZ > 1.0) return 'BEAR_VOLATILE';
  // ... etc
  
  return { regime, zScores: { adx: adxZ, vol: volZ, mom: momZ } };
}
```

### 6.3 Signal Type Classification

| Type | Description | Count |
|------|-------------|-------|
| **QUANT** | Fully statistical signal from regression and volatility | 9 strategies |
| **HYBRID** | Quant + technical patterns combined | 5 strategies |
| **PATTERN** | Pure technical pattern-based | 3 strategies |

### 6.4 Strategy Selection by Regime

| Regime | Active Strategies | Risk Multiplier |
|--------|-------------------|-----------------|
| BULL_STABLE | sma_trend_ride, vwap_pullback, morning_star, pivot_shift | 1.2× |
| BEAR_VOLATILE | mean_reversion, reverse_impulse, defensive_hedge, inside_bar_reversal | 0.7× |
| LOW_VOL_CHOP | range_trade, support_bounce, abcd_long, adaptive_flow | 0.9× |
| HIGH_VOL_IMPULSE | breakout, vwap_bounce, volatility_edge, dhma | 0.8× |
| TRANSITION | liquidity_trap, pivot_shift, morning_star | 0.85× |

---

## 7. Signal Quality Evaluation (SQE)

The SQE mathematically validates whether a signal is worth trading.  
It uses **FinalScore** and **RegimeWeight** exclusively.

### 7.1 SQE Filtering Formulas

```
Signal passes if:
  FinalScore ≥ FinalScore_min (default: 0.35)
  AND
  RegimeWeight ≥ RegimeWeight_min (default: 0.40)
```

### 7.2 FinalScore Formula (Directive 11.0E)

```
FinalScore = 0.4 × HybridScore + 0.3 × Confidence + 0.2 × RegimeWeight − 0.1 × DecayPenalty
```

**Coefficients (Immutable):**
```typescript
export const SCORE_WEIGHTS = Object.freeze({
  HYBRID: 0.4,
  CONFIDENCE: 0.3,
  REGIME: 0.2,
  DECAY: 0.1
});
```

### 7.3 Decay Penalty Function

Signals lose weight over time to favor recency:

```
DecayPenalty = e^(−λ × Δt)
```
Where `λ = 0.015` (tunable decay constant), and `Δt` = time since signal creation in seconds.

---

## 8. Profitability Gate (Directive 11.5)

### 8.1 Net Expectancy Validation

No trade executes unless mathematically profitable after all costs.

**Module:** `server/core/calculations/expectancy.ts`

### 8.2 Profitability Formula

```typescript
function isMathematicallyProfitable(
  entryPrice: number,
  targetPrice: number,
  spread: number,
  slippage: number = 0.0015,
  feeRate: number = 0.001
): boolean {
  const grossProfit = (targetPrice - entryPrice) / entryPrice;
  const totalCost = (feeRate * 2) + (spread * 1.1) + slippage;
  
  return grossProfit > totalCost;
}
```

### 8.3 Cost Components

| Component | Value | Description |
|-----------|-------|-------------|
| Entry Fee | 0.10% | Kraken taker fee |
| Exit Fee | 0.10% | Kraken taker fee |
| Entry Slippage | 0.15% | Estimated market impact |
| Exit Slippage | 0.15% | Estimated market impact |
| Spread | Variable | Bid-ask spread (× 1.1 buffer) |

### 8.4 Logging

```
[11.5][ProfitGate] Skipping XRP/USD: Net expectancy below 0 (gross=0.32%, cost=0.45%)
[11.5][ProfitGate] PASS BTC/USD: gross=0.85%, cost=0.42%, edge=0.43%
```

---

## 9. Ready-to-Buy Queue & TCL Logic

The **Ready-to-Buy Queue (RTB)** holds all validated signals, ranked purely by FinalScore.

### 9.1 Queue Ordering

```
RTB.sort((a, b) => b.finalScore - a.finalScore)
```

### 9.2 TCL Promotion Triggers

1. Two-minute failsafe timer  
2. When 15 signals accumulate in RTB  
3. When a trading slot opens  

The **TCL** (Trade Criteria Limiter) promotes the *highest-ranked* signal from RTB when a slot becomes available. It performs no filtering — that occurs earlier in the SQE.

---

## 10. Trade Execution Controller (TEC)

Once a signal is promoted, the **TEC** governs trade management, including adaptive sizing and exits.

### 10.1 Adaptive Sizing (Trendline Feedback Model)

```
If Trendline Reinforced → Size_new = Size × 1.10
If Trendline Weakening → Size_new = Size × 0.90
```

### 10.2 Trailing Exit Logic

Trailing stops dynamically adjust based on volatility:

```
TrailingStop = BaseStop × (1 + Acceleration × TrendSlope)
```

Typical parameters:
- BaseStop = 1.5%
- Acceleration = 0.002 × slope(EMA20)

### 10.3 Strategy-Specific Guardrails (Directive 11.5)

Additional entry requirements beyond global filters:

| Strategy | Guardrail | Threshold |
|----------|-----------|-----------|
| sma_trend_ride | ADX requirement | > 25 |

---

## 11. Position Sizing Engine

Integrates predictive learning with risk control.

### 11.1 Predictive Sizing Formula

```
Risk_per_Trade = BaseRisk × PredictiveConfidence × RegimeWeight
```

Where:
- **BaseRisk** = constant percentage of capital risked (e.g., 2%)
- **PredictiveConfidence** = ML-derived probability of success
- **RegimeWeight** = macro regime favorability (0.6 - 1.2)

### 11.2 Friction and Slippage Modeling

```
NetEdge = ExpectedProfit - (Fees + Slippage)
```

If `NetEdge < Threshold`, the trade is vetoed.

### 11.3 Volatility Normalization

```
PositionSize = (Risk_per_Trade / ATR)
```

This keeps risk constant across assets with different volatilities.

---

## 12. Secondary Metric Adjustments (Directive 11.5)

### 12.1 Dynamic Threshold System

Secondary metric thresholds adjust based on macro conditions.

**Module:** `server/core/metrics/secondary-metrics.ts`

### 12.2 Adjustment Matrix

| Macro State | LQ Threshold | VolNoise Threshold |
|-------------|--------------|-------------------|
| NORMAL | 40 (base) | 0.60 (base) |
| VOLATILITY_EXPANSION | 48 (1.2×) | 0.48 (0.8×) |
| LIQUIDITY_CRUNCH | 60 (1.5×) | 0.60 (1.0×) |
| SPECULATIVE_SURGE | 44 (1.1×) | 0.42 (0.7×) |

### 12.3 Adjustment Function

```typescript
function adjustMetricRanges(baseThresholds, macroCondition) {
  const multipliers = {
    NORMAL: { lq: 1.0, volNoise: 1.0 },
    VOLATILITY_EXPANSION: { lq: 1.2, volNoise: 0.8 },
    LIQUIDITY_CRUNCH: { lq: 1.5, volNoise: 1.0 },
    SPECULATIVE_SURGE: { lq: 1.1, volNoise: 0.7 }
  };
  
  const m = multipliers[macroCondition];
  return {
    minLQ: baseThresholds.minLQ * m.lq,
    maxVolNoise: baseThresholds.maxVolNoise * m.volNoise
  };
}
```

---

## 13. Core Quantitative Metrics

### 13.1 Primary Metrics

| Metric | Symbol | Formula | Range |
|--------|--------|---------|-------|
| Log-Liquidity | LQ | `log10(bidVolume × askVolume)` | 0-100+ |
| Directional Integrity | DI | `|momentum| / volatility` | 0-1 |
| Volatility Noise | VolNoise | `σ_price / mean_volume` | 0-1 |
| Sigma | σ | `stdDev(returns, 20)` | 0-0.10+ |

### 13.2 Composite Scores

| Score | Formula | Purpose |
|-------|---------|---------|
| FinalScore | `0.4×Hybrid + 0.3×Conf + 0.2×Regime - 0.1×Decay` | Signal quality |
| HybridScore | `avgOfStrategyScores × regimeAlignment` | Strategy strength |
| RegimeWeight | `regimeMultiplier × confidenceBoost` | Market alignment |
| ExpectedEdge | `grossProfit - totalCost` | Profitability |

---

## 14. Final Math Stack Summary

| Layer | Mathematical Purpose | Key Variables |
|--------|----------------------|----------------|
| FX5 Scanning | Identify tradable assets | Volume, Liquidity, Correlation |
| IMF Guards | Enforce trade quality | LQ, VolNoise, ρ |
| Z-Score Normalization | Statistical standardization | Rolling mean, stdDev |
| Macro Detection | Global condition awareness | volZ, liqZ, momZ |
| DSS & Strategy | Match regime to strategy | ADX, Momentum, Volatility |
| Signal Orchestrator | Compute HybridScore | Confidence, RegimeWeight |
| SQE | Validate signals | FinalScore, RegimeWeight |
| Profitability Gate | Ensure positive expectancy | grossProfit, totalCost |
| RTB Queue | Rank signals | FinalScore |
| TCL | Promote signals | Event triggers |
| TEC | Manage trades | AdaptiveSizing, TrailingExit |
| Sizing Engine | Compute position size | Risk, Confidence, ATR |

---

## 15. Closing Summary

As of **Directive 11.5**, the DawnTrader mathematical framework has reached **full maturity**:

- **Unified metric model:** FinalScore + RegimeWeight as sole operational metrics
- **Z-Score normalization:** Rolling 300-period statistical standardization
- **Macro-state awareness:** Dynamic threshold adjustment based on global conditions
- **Profitability validation:** Net expectancy gate preventing unprofitable trades
- **Strategy-specific guardrails:** Per-strategy entry requirements (e.g., ADX > 25 for sma_trend_ride)
- **Adaptive trade management:** TEC dynamically scales exposure
- **Deterministic + probabilistic math fusion:** Core of DawnTrader's edge

All subsequent phases (12+) build upon this mathematical foundation.

---

**Schema:** v1.6.7  
**Directive Reference:** 11.5  
**Last Updated:** January 18, 2026
