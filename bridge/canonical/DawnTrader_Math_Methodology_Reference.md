# DawnTrader — Mathematical Methodology Reference

**Document Created:** January 08, 2026  
**Last Updated:** January 08, 2026  
**Purpose:** Comprehensive reference for all mathematical formulas, algorithms, and quantitative methods used in DawnTrader  
**Current Phase:** Phase 11 (Directive 11.0D)

> **Note:** This document describes formulas and algorithms as implemented in the codebase. Actual runtime behavior depends on configuration values in SYSTEM_GUARDS, EXECUTION_CONFIG, and screener_filters. All constants reference source code files for verification.

---

# Table of Contents

1. [Core Quantitative Metrics](#1-core-quantitative-metrics)
2. [Signal Scoring System](#2-signal-scoring-system)
3. [Trade Evaluation (CWQI)](#3-trade-evaluation-cwqi)
4. [Risk Management Mathematics](#4-risk-management-mathematics)
5. [Adaptive Algorithms](#5-adaptive-algorithms)
6. [Pattern Recognition & Decay](#6-pattern-recognition--decay)
7. [Machine Learning Integration](#7-machine-learning-integration)
8. [Configuration Constants](#8-configuration-constants)

---

# 1. Core Quantitative Metrics

## 1.1 Log-Liquidity (LQ)

**Purpose:** Measure market liquidity on a normalized 0-100 scale.

**Formula:**
```
LQ = max(0, min(100, 10 × (ln(V × C) - ln(S / C) - 10)))
```

**Implementation:** `server/utils/analysis-utils.ts`

```typescript
calculateLogLiquidity(V: number, C: number, S: number): number {
  const spread = Math.max(S, 1e-8);
  const count = Math.max(C, 1);
  const raw = 10 * (Math.log(V * count) - Math.log(spread / count) - 10);
  return Math.max(0, Math.min(100, raw));
}
```

**Parameters:**
- V = Volume (24h trading volume)
- C = Count (number of trades)
- S = Spread (bid-ask spread)

**Threshold:** LQ >= 40 required for trade eligibility

---

## 1.2 Directional Integrity (DI)

**Purpose:** Measure trend consistency and price movement direction.

**Formula:**
```
DI = |Close - Open| / (High - Low)
```

**Interpretation:**
- DI near 1.0 = Strong directional move (body fills entire range)
- DI near 0.0 = Indecision (doji-like candle)

---

## 1.3 Volatility Noise (VolNoise)

**Purpose:** Measure erratic price behavior indicating unsuitable trading conditions.

**Formula:**
```
VolNoise = 1 - (|NetMove| / TotalRange)
```

Where:
- NetMove = Close - Open (net price change)
- TotalRange = Sum of all intra-period movements

**Threshold:** VolNoise <= 0.6 required (extreme noise stop vetoes trading above 0.6)

---

## 1.4 Sigma (σ)

**Purpose:** Standard deviation of returns for volatility measurement.

**Formula:**
```
σ = sqrt(Σ(r_i - μ)² / n)
```

Where:
- r_i = Individual period return
- μ = Mean return
- n = Number of periods

---

# 2. Signal Scoring System

## 2.1 FinalScore Formula

**Purpose:** Unified signal quality score combining multiple intelligence sources.

**Formula:**
```
FinalScore = (hybridScore × 0.4) + (confidence × 0.3) + (regimeWeight × 0.2) - (decayPenalty × 0.1)
```

**Implementation:** `server/core/utils/score-calculator.ts`

```typescript
export function calculateFinalScore(metrics: ScoreMetrics): number {
  const hybrid = metrics.hybridScore ?? metrics.confidence ?? 0.5;
  const confidence = metrics.confidence ?? metrics.ngc ?? 0.5;
  const regime = metrics.regimeWeight ?? 0.5;
  const decay = metrics.decayPenalty ?? 0;
  
  const raw = (hybrid * 0.4) + (confidence * 0.3) + (regime * 0.2) - (decay * 0.1);
  return Math.max(0, Math.min(1, raw));
}
```

**Configuration:** `server/config/score-weights.config.ts`

```typescript
export const SCORE_WEIGHTS = {
  HYBRID: 0.4,      // Hybrid ensemble score
  CONFIDENCE: 0.3,  // Predictive confidence
  REGIME: 0.2,      // Market regime alignment
  DECAY: 0.1,       // Pattern decay penalty
} as const;
```

---

## 2.2 RegimeWeight Formula

**Purpose:** Measure alignment with current market regime.

**Formula:**
```
RegimeWeight = (trendStrength × 0.7) + ((1 - volatility) × 0.3)
```

**Implementation:**

```typescript
export function calculateRegimeWeight(metrics: RegimeMetrics): number {
  const trend = metrics.trendStrength ?? 0.5;
  const vol = metrics.volatility ?? 0.3;
  const raw = (trend * 0.7) + ((1 - vol) * 0.3);
  return Math.max(0.1, Math.min(1, raw));
}
```

---

## 2.3 Hybrid Ensemble Score

**Purpose:** Combine signals from multiple intelligence sources.

**Formula:**
```
EnsembleScore = (quantScore × 0.4) + (patternScore × 0.4) + (mlScore × 0.2)
```

**Implementation:** `server/services/hybrid-integration.ts`

**Weights:**
- Quantitative signals: 40%
- Pattern recognition: 40%
- ML predictions: 20%

---

# 3. Trade Evaluation (CWQI)

## 3.1 CWQI v5 — Net Expectancy Model

**Purpose:** Two-stage trade evaluation with expectancy gate and quality score.

### Stage 1: Raw Expected Value (EV)

```
EV_raw = (P_win × Dist_Target) - (P_loss × Dist_Stop)
```

Where:
- P_win = Probability of winning (0.40 <= P_win <= 0.60)
- P_loss = 1 - P_win
- Dist_Target = Distance to take-profit
- Dist_Stop = Distance to stop-loss

### Stage 2: Friction Calculation

```
Friction = (Entry + Exit) × Qty × (Fee + Slippage)
```

**Configuration:** `SYSTEM_GUARDS.BASE_FEE_SLIPPAGE = 0.005` (0.5%)

### Stage 3: Net Expectancy (Gate Variable)

```
EV_net = EV_raw - Friction
```

**Gate Rule:** Trade passes only if EV_net > 0

### Stage 4: CWQI Quality Score

```
Score = Normalize(EV_net / Risk) × DI × (1 - VolNoise) × (1 - ρ_avg)
```

Where:
- Normalize maps [-1, +1] to [0, 100]
- DI = Directional Integrity
- VolNoise = Volatility Noise
- ρ_avg = Average correlation with portfolio

**If EV_net <= 0, Score = 0**

---

## 3.2 Win Probability Bounds

**Configuration:**
```typescript
MIN_PWIN: 0.40,  // Minimum win probability
MAX_PWIN: 0.60,  // Maximum win probability
```

**Rationale:** Bounds prevent overconfidence in prediction accuracy.

---

# 4. Risk Management Mathematics

## 4.1 Covariance Penalty

**Purpose:** Reduce position size when correlated with existing portfolio.

**Formula:**
```
Penalty = 1 / sqrt(1 + (N - 1) × ρ_avg)
```

Where:
- N = Number of positions including new one
- ρ_avg = Average correlation with existing positions

**Implementation:** `server/engines/covariance-engine.ts`

```typescript
calculateCovariancePenalty(correlations: number[]): number {
  if (!correlations.length) return 1.0;
  const N = correlations.length + 1;
  const sumRho = correlations.reduce((s, r) => s + Math.max(0, r), 0);
  const avgRho = sumRho / correlations.length;
  return 1 / Math.sqrt(1 + (N - 1) * avgRho);
}
```

---

## 4.2 Position Sizing

**Formula:**
```
Qty = (R_max × PV × Penalty) / (Entry × StopDistance)
```

Where:
- R_max = Maximum risk per trade (default 2%)
- PV = Portfolio value
- Penalty = Covariance penalty
- Entry = Entry price
- StopDistance = Distance to stop-loss as decimal

---

## 4.3 Adaptive Sizing (TEC)

**Implementation:** `server/config/execution-config.ts`

**Trendline Reinforcement:**
```
AdjustedSize = BaseSize × 1.10  // +10% on strong trend
```

**Trendline Weakness:**
```
AdjustedSize = BaseSize × 0.90  // -10% on weak trend
```

---

## 4.4 Trailing Stop Formula

**Dynamic Distance:**
```
StopDistance = BaseDistance + (Profit × Acceleration)
```

**Configuration:**
```typescript
TRAILING_STOP_BASE: 0.015,        // 1.5% base distance
TRAILING_STOP_ACCELERATION: 0.002  // Acceleration factor
```

---

# 5. Adaptive Algorithms

## 5.1 Adaptive Kalman Filter

**Purpose:** Dynamically adjust trend smoothing based on market efficiency.

**Efficiency Ratio (ER):**
```
ER = |NetChange| / SumOfAbsChanges
```

Where:
- NetChange = Close[n] - Close[0]
- SumOfAbsChanges = Σ|Close[i] - Close[i-1]|

**Adaptive Smoothing:**
```
α = ER × (fast - slow) + slow
```

Where:
- fast = 2 / (2 + 1) = 0.667
- slow = 2 / (30 + 1) = 0.0645

**Implementation:** `server/engines/adaptive-kalman.ts`

---

## 5.2 Adaptive Rolling Normalization

**Purpose:** Normalize metrics relative to recent history.

**Formula:**
```
Normalized = (Value - Rolling_Min) / (Rolling_Max - Rolling_Min)
```

With 24-hour rolling window for min/max calculation.

---

# 6. Pattern Recognition & Decay

## 6.1 Pattern Decay (Temporal Memory)

**Purpose:** Reduce pattern strength over time.

**Formula:**
```
DecayedStrength = OriginalStrength × e^(-λt)
```

Where:
- λ = Decay constant (default 0.1)
- t = Time since pattern detection (in candles)

**Implementation:**

```typescript
function applyPatternDecay(strength: number, candlesSinceDetection: number): number {
  const lambda = 0.1;
  return strength * Math.exp(-lambda * candlesSinceDetection);
}
```

---

## 6.2 Confluence Window

**Purpose:** Require signal agreement within time window.

**Configuration:**
```typescript
MAX_CONFLUENCE_WINDOW: 5  // Maximum candles for signal alignment
CANDLE_INTERVAL_MS: 3600000  // 1 hour
```

---

# 7. Machine Learning Integration

## 7.1 Promotion Probability

**Purpose:** Predict likelihood of signal promotion to trade.

**Model Input Features:**
- FinalScore
- RegimeWeight
- Symbol volatility
- Strategy historical performance

**Output:** Probability [0, 1]

---

## 7.2 Profit Prediction

**Purpose:** Predict expected profit for candidate trade.

**Model Input Features:**
- Entry conditions
- Market regime
- Historical similar trades
- Current volatility

**Output:** Expected profit percentage

---

## 7.3 ML Calibration Service

**Purpose:** Learn from VTS (Virtual Trade Simulator) outcomes.

**Process:**
1. Analyze recent hybrid trades
2. Calculate actual win rates and expectancy
3. Generate parameter adjustment recommendations

**Implementation:** `server/services/ml-calibration.ts`

---

# 8. Configuration Constants

## 8.1 SYSTEM_GUARDS

**Location:** `server/config/system-guards.ts`

```typescript
SYSTEM_GUARDS = {
  VERSION: "Phase10_Final",
  
  // Liquidity & Noise
  MIN_LIQUIDITY_SCORE: 40,
  MAX_VOL_NOISE: 0.6,
  
  // Friction
  BASE_FEE_SLIPPAGE: 0.005,  // 0.5%
  
  // Win Probability Bounds
  MIN_PWIN: 0.40,
  MAX_PWIN: 0.60,
  
  // Correlation
  CORRELATION_THRESHOLD: 0.75,
  
  // Parity Tolerance
  PARITY_TOLERANCE: 0.000001,
  
  // SQE Thresholds
  MIN_FINAL_SCORE: 0.35,
  MIN_REGIME_WEIGHT: 0.30,
}
```

---

## 8.2 HYBRID_PARAMS

```typescript
HYBRID_PARAMS: {
  MIN_SCORE: 0.65,
  MAX_CONFLUENCE_WINDOW: 5,
  CANDLE_INTERVAL_MS: 3600000,
  WEIGHTS: {
    QUANT: 0.4,
    PATTERN: 0.4,
    ML: 0.2
  }
}
```

---

## 8.3 EXECUTION_CONFIG

**Location:** `server/config/execution-config.ts`

```typescript
EXECUTION_CONFIG = {
  ADAPTIVE_EXPAND_FACTOR: 1.10,
  ADAPTIVE_CONTRACT_FACTOR: 0.90,
  TRAILING_STOP_BASE: 0.015,
  TRAILING_STOP_ACCELERATION: 0.002,
  MAX_POSITION_RISK: 0.02,
  VERSION: "v1.0.0"
}
```

---

## 8.4 SCORE_WEIGHTS

**Location:** `server/config/score-weights.config.ts`

```typescript
SCORE_WEIGHTS = {
  HYBRID: 0.4,
  CONFIDENCE: 0.3,
  REGIME: 0.2,
  DECAY: 0.1
}
```

---

# Summary

DawnTrader's mathematical methodology is built on:

1. **Physics First** — No trade executes unless Net EV > 0
2. **Extreme Noise Stop** — Auto-veto when VolNoise > 0.6
3. **Centralized Constants** — All thresholds in SYSTEM_GUARDS
4. **Adaptive Algorithms** — Self-tuning based on market conditions
5. **Ensemble Intelligence** — Multiple signal sources with weighted fusion
6. **Risk-Aware Sizing** — Covariance penalty and adaptive adjustments

---

**End of File — DawnTrader Mathematical Methodology Reference**
