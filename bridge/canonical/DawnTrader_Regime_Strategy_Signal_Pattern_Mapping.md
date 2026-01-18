# DawnTrader: Regime-Strategy-Signal Type-Pattern Type Mapping
## Canonical Reference Document

**Document Created:** January 18, 2026  
**Last Updated:** January 18, 2026  
**Purpose:** Comprehensive canonical mapping of regimes, strategies, signal types, and pattern types  
**Schema Version:** v11.5.0

---

# Table of Contents

1. [Canonical Regimes and Defining Metrics](#1-canonical-regimes-and-defining-metrics)
2. [Z-Score Normalization](#2-z-score-normalization)
3. [Macro-State Conditions](#3-macro-state-conditions)
4. [Strategies by Signal Type](#4-strategies-by-signal-type)
5. [Complete Regime-Strategy-Signal Type Map](#5-complete-regime-strategy-signal-type-map)
6. [Canonical Pattern Types](#6-canonical-pattern-types)
7. [Quick Reference Tables](#7-quick-reference-tables)

---

# 1. Canonical Regimes and Defining Metrics

The DawnTrader system uses a 5-class market regime model to classify current market conditions. Each regime has specific metric thresholds that determine classification.

## 1.1 Regime Definitions

| Regime | Primary Metrics & Ranges | Interpretation |
|--------|-------------------------|----------------|
| **BULL_STABLE** | Momentum > +0.005 (+0.5%) • ADX > 25 • Volatility < 0.025 | Sustained, directional uptrend with low–moderate volatility |
| **BEAR_VOLATILE** | Momentum < −0.005 (−0.5%) • ADX > 25 • Volatility > 0.03 | Accelerating downtrend with expanding volatility |
| **LOW_VOL_CHOP** | Momentum abs < 0.002 (±0.2%) • ADX < 20 • Volatility < 0.015 | Flat, range-bound market with no directionality |
| **HIGH_VOL_IMPULSE** | Momentum abs > 0.010 (±1%) • ADX > 30 • Volatility > 0.030 | Explosive breakouts or capitulations; panic or euphoria phases |
| **TRANSITION** | Momentum ±0.004 (−0.004 to +0.004) • ADX 20–25 • Volatility 0.015–0.030 | Transitional hand-off between stable and volatile regimes; indecisive market state |

## 1.2 Regime Characteristics

| Regime | Risk Multiplier | Min Confidence | Trading Style |
|--------|-----------------|----------------|---------------|
| BULL_STABLE | 1.0 | 0.60 | Trend-following, momentum |
| BEAR_VOLATILE | 0.5 | 0.75 | Defensive, reversal-focused |
| LOW_VOL_CHOP | 0.8 | 0.65 | Range trading, mean reversion |
| HIGH_VOL_IMPULSE | 0.7 | 0.70 | Breakout, momentum surge |
| TRANSITION | 0.6 | 0.70 | Pivot detection, regime anticipation |

---

# 2. Z-Score Normalization

**File:** `server/utils/rolling-stats.ts`

Regime detection uses Z-Score normalization to adapt thresholds to each pair's historical behavior.

## 2.1 Rolling Statistics Configuration

| Parameter | Value | Description |
|-----------|-------|-------------|
| **Window Size** | 300 periods | Rolling window for mean/stdDev calculation |
| **Warmup Requirement** | 30 samples | Minimum samples before valid Z-Score |
| **Calculation Frequency** | Per regime detection call | Updated with each new data point |

## 2.2 Z-Score Formula

```
Z-Score = (value - mean) / standardDeviation
```

Where:
- `value` = Current metric value (momentum, volatility, ADX)
- `mean` = Rolling 300-period mean
- `standardDeviation` = Rolling 300-period standard deviation

## 2.3 Z-Score Interpretation

| Z-Score Range | Interpretation |
|---------------|----------------|
| Z < -2 | Extremely below normal |
| -2 ≤ Z < -1 | Moderately below normal |
| -1 ≤ Z ≤ +1 | Normal range |
| +1 < Z ≤ +2 | Moderately above normal |
| Z > +2 | Extremely above normal |

## 2.4 Regime Detection with Z-Scores

```typescript
getNormalizedRegimeWithDetails(pair: string): {
  regime: CanonicalRegimeType;
  zScores: {
    momentum: number;
    volatility: number;
    adx: number;
  };
  confidence: number;
  isWarmedUp: boolean;
}
```

---

# 3. Macro-State Conditions

**File:** `server/core/metrics/macro-state.ts`

Macro-state detection identifies global market conditions that affect all trading pairs. These conditions trigger dynamic adjustments to IMF (Institutional Math Filter) thresholds.

## 3.1 Macro Condition Detection

Uses rolling Z-scores of aggregate market metrics (300-period window, 30-sample warmup):

| Condition | Z-Score Detection | Description |
|-----------|-------------------|-------------|
| **NORMAL** | Default (no thresholds exceeded) | Standard market conditions |
| **VOLATILITY_EXPANSION** | avgVolatilityZ > 2 | Market-wide volatility spike |
| **LIQUIDITY_CRUNCH** | liquidityZ < -1 | Low liquidity across markets |
| **SPECULATIVE_SURGE** | correlationZ > 1.5 | High cross-asset correlation (speculation) |

## 3.2 IMF Threshold Adjustments

| Macro Condition | LQ Multiplier | VolNoise Multiplier | Effect |
|-----------------|---------------|---------------------|--------|
| NORMAL | 1.0× | 1.0× | Standard thresholds |
| VOLATILITY_EXPANSION | 1.2× | 0.8× | Stricter liquidity, relaxed noise |
| LIQUIDITY_CRUNCH | 1.5× | 1.0× | Much stricter liquidity |
| SPECULATIVE_SURGE | 1.1× | 0.7× | Slightly stricter liquidity, relaxed noise |

## 3.3 Base IMF Thresholds

| Metric | Base Threshold | Purpose |
|--------|----------------|---------|
| LQ (Log-Liquidity) | ≥ 40 | Minimum liquidity requirement |
| VolNoise | ≤ 0.6 | Maximum noise tolerance |
| DI (Directional Integrity) | ≥ 45 | Trend strength requirement |

## 3.4 Adjusted Threshold Calculation

```
adjustedLQ = baseLQ × macroLQMultiplier
adjustedVolNoise = baseVolNoise × macroVolNoiseMultiplier
```

---

# 4. Strategies by Signal Type

## 4.1 QUANT Strategies (9)

| Strategy | Secondary Metrics & Ranges | Logic / Intent |
|----------|---------------------------|----------------|
| **VWAP Pullback** | VWAP Deviation < −1σ • Momentum > 0 | Short-term pullback in strong uptrend |
| **ABCD Long** | AB:CD Ratio 0.95–1.05 • Volume > 1.2× avg | Harmonic completion confirmation |
| **SMA Trend Ride** | Price > SMA(50) by > 0.5% • ADX > 25 | Captures sustained trend continuation |
| **Breakout** | Momentum > +0.7% • Volume > 2× avg | Directional expansion beyond resistance |
| **Mean Reversion** | RSI < 30 or > 70 • Price Deviation > 1σ • Volatility < 0.025 | Counter-trend rebound from extremes |
| **Range Trading** | Bollinger Bandwidth < 0.10 • ADX < 20 | Oscillation inside bounded range |
| **VWAP Bounce** | VWAP Deviation > +1σ • Momentum −0.3 to −0.6% | Opposite-phase mean-reversion |
| **Liquidity Trap** | (Lower Wick / Body) > 2 or Depth Imbalance > 1.4 | Detects false breakdowns / absorption |
| **DHMA** | HMA(9) cross HMA(21) • ADX Slope Flattening | Adaptive trend confirmation |

## 4.2 PATTERN Strategies (3)

| Strategy | Secondary Metrics & Ranges | Pattern Type(s) |
|----------|---------------------------|-----------------|
| **Support Bounce** | Price = Local Min ±1σ • Volume > 1.2× avg | Pinbar / Rejection Wick |
| **Morning Star / Evening Star** | 3-Bar Sequence (Bear→Doji→Bull) • Momentum Flip > 0.3% | Morning / Evening Star |
| **Inside Bar Reversal** | Parent-Bar Range > Child × 1.3 • Breakout Volume > 1.5× avg | Inside Bar / Engulfing |

## 4.3 HYBRID Strategies (5)

| Strategy | Secondary Metrics & Ranges | Pattern Type (if applicable) |
|----------|---------------------------|------------------------------|
| **Adaptive Flow** | Momentum Inversion ≥ 3 • Volatility Percentile > 70% | — |
| **Pivot Shift** | RSI 45–55 • ADX Slope > 0.5 | — |
| **Reverse Impulse** | Volume > 1.5× avg • Momentum Spike < −0.5% | Optional Pinbar confirmation |
| **Defensive Hedge** | BTC Correlation < 0.3 • Volatility Offset > 1σ | — |
| **Volatility Edge** | Volatility Percentile > 80 • Regime Mismatch = True | — |

---

# 5. Complete Regime-Strategy-Signal Type Map

## 5.1 BULL_STABLE Regime

| Strategy | Secondary Metrics & Ranges | Signal Type | Pattern Type |
|----------|---------------------------|-------------|--------------|
| SMA Trend Ride | Price > SMA(50) by > 0.5% • ADX > 25 | QUANT | — |
| VWAP Pullback | VWAP Deviation < −1σ • Momentum > 0 | QUANT | — |
| Morning Star / Evening Star | 3-Bar Sequence (Bear→Doji→Bull) • Momentum Flip > 0.3% | PATTERN | Morning Star / Evening Star |
| Pivot Shift | RSI 45–55 • ADX Slope > 0.5 | HYBRID | Morning / Evening Star |

**Regime Metrics:** Momentum > +0.005 • ADX > 25 • Volatility < 0.025

## 5.2 BEAR_VOLATILE Regime

| Strategy | Secondary Metrics & Ranges | Signal Type | Pattern Type |
|----------|---------------------------|-------------|--------------|
| Mean Reversion | RSI < 30 or > 70 • Price Deviation > 1σ • Volatility < 0.025 | QUANT | — |
| Reverse Impulse | Volume > 1.5× avg • Momentum Spike < −0.5% | HYBRID | Pinbar (optional) |
| Defensive Hedge | BTC Correlation < 0.3 • Volatility Offset > 1σ | HYBRID | Engulfing / Inside Bar |
| Inside Bar Reversal | Parent Range > Child × 1.3 • Breakout Volume > 1.5× avg | PATTERN | Inside Bar / Engulfing |

**Regime Metrics:** Momentum < −0.005 • ADX > 25 • Volatility > 0.03

## 5.3 LOW_VOL_CHOP Regime

| Strategy | Secondary Metrics & Ranges | Signal Type | Pattern Type |
|----------|---------------------------|-------------|--------------|
| Range Trading | Bollinger Bandwidth < 0.10 • ADX < 20 | QUANT | — |
| Support Bounce | Price = Local Min ±1σ • Volume > 1.2× avg | PATTERN | Pinbar / Rejection Wick |
| ABCD Long | AB:CD Ratio 0.95–1.05 • Volume > 1.2× avg | QUANT | — |
| Adaptive Flow | Momentum Inversion ≥ 3 • Volatility Percentile > 70% | HYBRID | Tri-Star / Three Soldiers |

**Regime Metrics:** Momentum abs < 0.002 • ADX < 20 • Volatility < 0.015

## 5.4 HIGH_VOL_IMPULSE Regime

| Strategy | Secondary Metrics & Ranges | Signal Type | Pattern Type |
|----------|---------------------------|-------------|--------------|
| Breakout | Momentum > +0.7% • Volume > 2× avg | QUANT | — |
| VWAP Bounce | VWAP Deviation > +1σ • Momentum −0.3 to −0.6% | QUANT | — |
| Volatility Edge | Volatility Percentile > 80 • Regime Mismatch = True | HYBRID | ABCD Geometric |
| DHMA | HMA(9) cross HMA(21) • ADX Slope Flattening | QUANT | — |

**Regime Metrics:** Momentum abs > 0.010 • ADX > 30 • Volatility > 0.030

## 5.5 TRANSITION Regime

| Strategy | Secondary Metrics & Ranges | Signal Type | Pattern Type |
|----------|---------------------------|-------------|--------------|
| Liquidity Trap | (Lower Wick / Body) > 2 or Depth Imbalance > 1.4 | QUANT | Pinbar (proxy) |
| Pivot Shift | RSI 45–55 • ADX Slope > 0.5 | HYBRID | Morning / Evening Star |
| Morning Star / Evening Star | 3-Bar Sequence (Bear→Doji→Bull) • Momentum Flip > 0.3% | PATTERN | Morning / Evening Star |

**Regime Metrics:** Momentum ±0.004 • ADX 20–25 • Volatility 0.015–0.030

---

# 6. Canonical Pattern Types

The DawnTrader signal engine recognizes five canonical pattern archetypes:

| Pattern Type | Description / Structure | Typical Use Case |
|--------------|------------------------|------------------|
| **Pinbar (Rejection Wick)** | Wick > 2× Body; reversal rejection at key level | Liquidity absorption, support bounce, false break |
| **Engulfing / Inside Bar** | Complete candle body overlap or containment | Momentum reversal, compression breakout |
| **Morning Star / Evening Star** | 3-candle sequence (Bear → Doji → Bull or vice versa) | Transitional reversals, regime shifts |
| **ABCD (Geometric)** | Ratio between AB and CD legs ≈ 1.0 | Harmonic geometric symmetry; range or trend exhaustion |
| **Tri-Star / 3 Soldiers (Extended)** | Sequential confirmation of reversal (Bullish or Bearish) | Extended pattern confirmation under high ADX |

---

# 7. Quick Reference Tables

## 7.1 Signal Type Summary

| Signal Type | Strategy Count | Description |
|-------------|----------------|-------------|
| **QUANT** | 9 | Quantitative indicator-based strategies |
| **PATTERN** | 3 | Candlestick pattern recognition strategies |
| **HYBRID** | 5 | Combined Quant + Pattern ensemble strategies |

## 7.2 Regime-Strategy Count

| Regime | QUANT | PATTERN | HYBRID | Total |
|--------|-------|---------|--------|-------|
| BULL_STABLE | 2 | 1 | 1 | 4 |
| BEAR_VOLATILE | 1 | 1 | 2 | 4 |
| LOW_VOL_CHOP | 2 | 1 | 1 | 4 |
| HIGH_VOL_IMPULSE | 3 | 0 | 1 | 4 |
| TRANSITION | 1 | 1 | 1 | 3 |

## 7.3 Pattern Type Usage

| Pattern Type | Strategies Using It |
|--------------|---------------------|
| Pinbar / Rejection Wick | Support Bounce, Liquidity Trap, Reverse Impulse |
| Engulfing / Inside Bar | Inside Bar Reversal, Defensive Hedge |
| Morning Star / Evening Star | Morning Star / Evening Star, Pivot Shift |
| ABCD (Geometric) | ABCD Long, Volatility Edge |
| Tri-Star / 3 Soldiers | Adaptive Flow |

## 7.4 Friction Tiers

| Tier | Total Cost Range | Color | Trading Recommendation |
|------|------------------|-------|------------------------|
| LOW | < 0.3% | Green | Favorable conditions |
| MODERATE | 0.3% – 0.5% | Yellow | Proceed with caution |
| HIGH | 0.5% – 0.8% | Orange | Reduce position size |
| EXTREME | > 0.8% | Red | Avoid trading |

---

# Document History

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-18 | 1.0 | Initial creation with Z-Score and Macro-State sections |

---

*This document serves as the canonical reference for regime-strategy-signal type-pattern type mappings in DawnTrader V3.1. All subsystems must align with these specifications.*
