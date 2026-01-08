# 🧠 DawnTrader Mathematical Architecture Overview
### *Version: Post-Directive 11.0F (Schema v1.5.0 — Metric Engine v1.0)*

---

## 1. 🏗️ System Overview

The DawnTrader system operates as a **multi-phase quantitative trading engine**, where every trade lifecycle is governed by layered mathematical models designed for signal generation, quality filtering, and adaptive execution.  

At its core, the platform integrates:
- **Deterministic Scoring Math** (FinalScore, RegimeWeight)  
- **Adaptive Risk Models** (Sizing Engine & Trailing Exit Math)  
- **Signal-Oriented Decision Intelligence** (Predictive and Regime-Aware Logic)  

The complete mathematical flow:

```
[FX5 Scan + Adaptive Scanning]
      ↓
[Institutional Math Guards]
      ↓
[Signal Orchestrator + DSS]
      ↓
[Strategy + Regime Selection]
      ↓
[Signal Quality Evaluator (SQE)]
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

## 2. 📊 Core Scanning and Filtering Math

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

The **Adaptive Scanning Layer** adjusts pool ratios based on historical success:
```
IdealPoolRatio_t+1 = IdealPoolRatio_t × (1 + β × (WinRate_ideal – WinRate_rotational))
```
*(Introduced under 11.2 Adaptive Scanning Fairness)*

---

## 3. 🧮 Institutional Guards

Before any strategy math is applied, the **Institutional Guards** enforce global limits:
- `ρ ≤ 0.75`  → Pair must be sufficiently uncorrelated  
- `VolNoise ≤ 0.6` → Price movement must be stable  
- `LQ ≥ 40` → Adequate liquidity depth  

These are non-negotiable mathematical safeguards designed to mimic institutional-quality trade screening.

---

## 4. ⚙️ Signal Orchestration & Decision Support System (DSS)

The **Signal Orchestrator** is the brain of DawnTrader.  
It merges incoming raw scan data with strategy and regime intelligence from the **Decision Support System (DSS)** to decide *what kind of trade signal to create* and *how it should behave*.

### 4.1 DSS Market Regime Detection

The DSS determines the current **market regime** through a combination of volatility, momentum, and trend metrics:

| Regime | Definition | Primary Metric Conditions |
|---------|-------------|----------------------------|
| **Bullish** | Positive directional trend | `EMA20 > EMA50`, `RSI > 55`, `ATR < median` |
| **Bearish** | Negative directional trend | `EMA20 < EMA50`, `RSI < 45`, `ATR < median` |
| **Neutral** | Non-directional, range-bound | `|EMA20 - EMA50| < smallThreshold`, `RSI ≈ 50` |

### 4.2 Signal Type Classification

| Type | Description | Objective |
|------|-------------|------------|
| **Quant** | Fully statistical signal derived from regression and volatility features. | Capture statistically significant mean-reversion or breakout events. |
| **Hybrid** | Combines quant metrics with technical patterns (e.g., EMA crossover + ML confidence). | Exploit predictive model outputs while enforcing structural discipline. |
| **Pattern** | Purely technical pattern-based signals (triangles, flags, channels). | Exploit classic market structure and visual confirmation. |

### 4.3 Strategy Selection by Regime

| Regime | Active Strategies | Metrics Used |
|---------|-------------------|---------------|
| Bullish | Trend-Following, EMA Momentum, Breakout | RSI, EMA slopes, ATR compression |
| Bearish | Reversal, Pullback, Countertrend | RSI divergence, MACD crossover |
| Neutral | Mean Reversion, Range Scalping | Bollinger %B, Range ratio |

The selected strategy dictates which metrics are weighted in the scoring engine.

---

## 5. 🧠 Signal Quality Evaluation (SQE)

The SQE mathematically validates whether a signal is worth trading.  
It currently uses **FinalScore** and **RegimeWeight** exclusively.

### 5.1 SQE Filtering Formulas
```
Signal passes if:
FinalScore ≥ FinalScore_min
AND
RegimeWeight ≥ RegimeWeight_min
```

Where thresholds are user-configurable via the **Screener Filters** UI.

### 5.2 FinalScore Formula

As of Directive 11.0E, the canonical formula is:

```
FinalScore = 0.4 × HybridScore + 0.3 × Confidence + 0.2 × RegimeWeight − 0.1 × DecayPenalty
```

### 5.3 Decay Penalty Function

Signals lose weight over time to favor recency:

```
DecayPenalty = e^(−λ × Δt)
```
Where `λ = 0.015` (tunable decay constant), and `Δt` = time since signal creation.

---

## 6. 🧩 Ready-to-Buy Queue & TCL Logic

The **Ready-to-Buy Queue (RTB)** holds all validated signals, ranked purely by FinalScore.

- **Ordering:**
  ```
  RTB.sort((a, b) => b.finalScore - a.finalScore)
  ```
- **Events that trigger TCL (Trade Criteria Limiter):**
  1. Two-minute failsafe timer  
  2. When 15 signals accumulate in RTB  
  3. When a trading slot opens  

The **TCL** promotes the *highest-ranked* signal from RTB when a slot becomes available.  
It performs no filtering, exposure, or correlation checks — those occur earlier in the SQE.

---

## 7. 💹 Trade Execution Controller (TEC)

Once a signal is promoted, the **TEC** governs trade management, including adaptive sizing and exits.

### 7.1 Adaptive Sizing (Trendline Feedback Model)
```
If Trendline Reinforced → Size_new = Size × 1.10
If Trendline Weakening → Size_new = Size × 0.90
```
- These factors are adjustable through the **Execution Config Panel** in Diagnostics.
- Adaptive sizing allows trades to compound strength during favorable momentum shifts.

### 7.2 Trailing Exit Logic

Trailing stops dynamically adjust based on volatility:
```
TrailingStop = BaseStop × (1 + Acceleration × TrendSlope)
```
Typical parameters:
- BaseStop = 1.5%
- Acceleration = 0.002 × slope(EMA20)

This ensures tighter stops when momentum fades and looser ones during strong trends.

---

## 8. ⚖️ Position Sizing Engine (Predictive Model)

Introduced in Phase 11.3 — integrates predictive learning with risk control.

### 8.1 Predictive Sizing Formula
```
Risk_per_Trade = BaseRisk × PredictiveConfidence × RegimeWeight
```
Where:
- **BaseRisk** is the constant percentage of total capital risked (e.g., 2%).
- **PredictiveConfidence** is ML-derived probability of success.
- **RegimeWeight** reflects macro regime favorability.

### 8.2 Friction and Slippage Modeling
```
NetEdge = ExpectedProfit - (Fees + Slippage)
```
If `NetEdge < Threshold`, the trade is vetoed.

### 8.3 Volatility Normalization
```
PositionSize = (Risk_per_Trade / ATR)
```
This keeps risk constant across assets with different volatilities.

---

## 9. 🧮 Final Math Stack Summary

| Layer | Mathematical Purpose | Key Variables |
|--------|----------------------|----------------|
| FX5 Scanning | Identify tradable assets | Volume, Liquidity, Correlation |
| Institutional Guards | Enforce trade quality | LQ, VolNoise, ρ |
| DSS & Strategy Selection | Match regime to strategy | RSI, EMA, ATR |
| Signal Orchestrator | Compute base HybridScore | Confidence, RegimeWeight |
| SQE | Validate signals | FinalScore, RegimeWeight |
| RTB Queue | Rank signals | FinalScore |
| TCL | Promote signals | Event triggers |
| TEC | Manage trades | AdaptiveSizing, TrailingExit |
| Sizing Engine | Compute position size | Risk, Confidence, RegimeWeight |
| Telemetry | Monitor system health | FinalScore distributions |

---

## 10. 🧾 Closing Summary

As of **Directive 11.0F**, the DawnTrader mathematical framework has reached **stability maturity**:
- **Unified metric model:** FinalScore + RegimeWeight  
- **Predictive intelligence hooks:** Ready for 11.1 persistent learning  
- **Adaptive trade management:** TEC dynamically scales exposure  
- **Deterministic + probabilistic math fusion:** Core of DawnTrader’s edge  

All subsequent phases (11.1–11.3) build upon this mathematical foundation — transforming DawnTrader into a self-optimizing, telemetry-aware, and predictive trading intelligence system.

---

**Authored by:**  
OpenAI System Architecture Team (Math & Intelligence Division)  
**Reviewed by:** Gemini – AI Project Manager, DawnTrader System  
**Date:** [Insert Date]  
**Schema:** v1.5.0  
**Directive Reference:** 11.0F  
