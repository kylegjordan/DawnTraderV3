# DawnTrader Canonical Regime & Strategy Mapping Reference

**Document Version:** 1.1  
**Last Updated:** February 5, 2026  
**Schema Version:** 11.8C  
**Source File:** `server/config/canonical-regime-strategy-map.ts`

> **Note (Phase 11.8):** All regime and strategy mappings remain unchanged. Phase 11 Predictive Learning is now the sole authority for parameter adjustment. LATTi and parallel learning systems have been decommissioned.

---

## Table of Contents

1. [Overview](#overview)
2. [Canonical Regimes](#canonical-regimes)
3. [Canonical Strategies](#canonical-strategies)
4. [Canonical Signal Types](#canonical-signal-types)
5. [Canonical Pattern Types](#canonical-pattern-types)
6. [Market Friction Tiers](#market-friction-tiers)
7. [Macro Conditions](#macro-conditions)
8. [Regime-to-Strategy Mappings](#regime-to-strategy-mappings)
9. [Z-Score Normalization](#z-score-normalization)
10. [Secondary Metric Adjustments](#secondary-metric-adjustments)
11. [Legacy Normalization Maps](#legacy-normalization-maps)
12. [Validation Functions](#validation-functions)

---

## Overview

This document defines the **single source of truth** for all regime, strategy, signal type, and pattern mappings in the DawnTrader trading system. All subsystems (VTS, Signal Orchestrator, Telemetry, DSE, RTB, Bridge) MUST import from `server/config/canonical-regime-strategy-map.ts`. Local inference or mapping logic is **PROHIBITED**.

### Governance Rules

1. **Single Source**: All mappings originate from `canonical-regime-strategy-map.ts`
2. **No Local Inference**: Subsystems cannot derive or guess mappings
3. **Validation Required**: Invalid combinations are rejected with detailed logging
4. **Version Tracked**: Schema version 11.8C is enforced

---

## Canonical Regimes

The system uses a **5-class regime model** for market classification. Each regime has specific metric thresholds and trading characteristics.

| Regime | Code | Description | Risk Multiplier | Min Confidence |
|--------|------|-------------|-----------------|----------------|
| **Bull Stable** | `BULL_STABLE` | Sustained uptrend with confirmed directional trend and stable volatility | 1.2× | 0.65 |
| **Bear Volatile** | `BEAR_VOLATILE` | Downward impulse with strong bearish trend and high turbulence | 0.7× | 0.75 |
| **Low Vol Chop** | `LOW_VOL_CHOP` | Flat market with no directionality and narrow range | 0.9× | 0.60 |
| **High Vol Impulse** | `HIGH_VOL_IMPULSE` | Strong breakout with trend acceleration and violent expansion | 0.8× | 0.70 |
| **Transition** | `TRANSITION` | Reversal zone with weakening trend and volatility uplift | 0.85× | 0.55 |

### Regime Classification Metrics

| Regime | Momentum | ADX | Volatility |
|--------|----------|-----|------------|
| BULL_STABLE | > 0.005 | > 25 | < 0.025 |
| BEAR_VOLATILE | < -0.005 | > 25 | > 0.03 |
| LOW_VOL_CHOP | abs < 0.002 | < 20 | < 0.015 |
| HIGH_VOL_IMPULSE | > 0.010 | > 30 | > 0.03 |
| TRANSITION | ± 0.004 | 20-25 | 0.015-0.03 |

### Ghost Regime Normalization

Legacy or non-canonical regimes are normalized to canonical equivalents:

| Ghost Regime | Normalizes To |
|--------------|---------------|
| BULL_VOLATILE | HIGH_VOL_IMPULSE |
| BEAR_STABLE | BEAR_VOLATILE |
| EXTREME_NOISE | LOW_VOL_CHOP |
| HIGH_VOL_CHOP | HIGH_VOL_IMPULSE |
| MIXED_TRANSITION | TRANSITION |

---

## Canonical Strategies

The system supports **17 canonical strategies** mapped to specific regimes and signal types.

| Strategy Key | Display Name | Signal Type | Pattern Type | Primary Regimes |
|--------------|--------------|-------------|--------------|-----------------|
| `sma_trend_ride` | SMA Trend Ride | QUANT | — | HIGH_VOL_IMPULSE |
| `vwap_pullback` | VWAP Pullback | QUANT | — | BULL_STABLE |
| `morning_star` | Morning Star / Evening Star | PATTERN | MORNING_STAR | BULL_STABLE, TRANSITION |
| `pivot_shift` | Pivot Shift | HYBRID | MORNING_STAR | BULL_STABLE, TRANSITION |
| `mean_reversion` | Mean Reversion | QUANT | — | BEAR_VOLATILE |
| `reverse_impulse` | Reverse Impulse | HYBRID | PINBAR | BEAR_VOLATILE |
| `defensive_hedge` | Defensive Hedge | HYBRID | ENGULFING | BEAR_VOLATILE |
| `inside_bar_reversal` | Inside Bar Reversal | PATTERN | ENGULFING | BEAR_VOLATILE |
| `range_trade` | Range Trading | QUANT | — | LOW_VOL_CHOP |
| `support_bounce` | Support Bounce | PATTERN | PINBAR | LOW_VOL_CHOP |
| `abcd_long` | ABCD Long | QUANT | — | LOW_VOL_CHOP |
| `adaptive_flow` | Adaptive Flow | HYBRID | TRI_STAR | LOW_VOL_CHOP |
| `breakout` | Breakout | QUANT | — | HIGH_VOL_IMPULSE |
| `vwap_bounce` | VWAP Bounce | QUANT | — | HIGH_VOL_IMPULSE |
| `volatility_edge` | Volatility Edge | HYBRID | ABCD | HIGH_VOL_IMPULSE |
| `dhma` | DHMA | QUANT | — | HIGH_VOL_IMPULSE |
| `liquidity_trap` | Liquidity Trap | QUANT | — | TRANSITION |

### Strategy Secondary Metrics

Each strategy has specific secondary metric requirements:

| Strategy | Secondary Metrics |
|----------|-------------------|
| sma_trend_ride | Price > SMA(50) by > 0.5% • ADX > 25 |
| vwap_pullback | VWAP deviation < −1σ • Momentum > 0 |
| morning_star | 3-bar sequence; momentum flip > 0.3% |
| pivot_shift | RSI 45–55 • ADX slope > 0.5 |
| mean_reversion | RSI < 30 or > 70 • Price deviation > 1σ |
| reverse_impulse | Volume > 1.5× avg • Momentum spike < −0.5% |
| defensive_hedge | BTC Corr < 0.3 • Vol Offset > 1σ |
| inside_bar_reversal | Parent > Child × 1.3 • Breakout Volume > 1.5× avg |
| range_trade | Bollinger Bandwidth < 0.10 • ADX < 20 |
| support_bounce | Price ≈ Local Min ± 1σ • Volume > 1.2× avg |
| abcd_long | AB:CD ≈ 1.0 • Volume > 1.2× avg |
| adaptive_flow | Momentum inversion ≥ 3 • Volatility percentile > 70% |
| breakout | Momentum > +0.7% • Volume > 2× avg |
| vwap_bounce | VWAP deviation > +1σ • Momentum −0.3–−0.6% |
| volatility_edge | Volatility Percentile > 80 • Regime mismatch = True |
| dhma | HMA(9) cross HMA(21) • ADX flat |
| liquidity_trap | Wick/Body > 2 or Depth Imbalance > 1.4 |

---

## Canonical Signal Types

The system uses **3 signal types** to classify trade signals.

| Signal Type | Code | Description | Strategy Count |
|-------------|------|-------------|----------------|
| **Quantitative** | `QUANT` | Fully statistical signals derived from regression and volatility features | 9 |
| **Pattern** | `PATTERN` | Purely technical pattern-based signals (candlesticks, formations) | 3 |
| **Hybrid** | `HYBRID` | Combines quant metrics with technical patterns | 5 |

### Signal Type Distribution

```
QUANT:   ████████████████████████  53% (9 strategies)
HYBRID:  ██████████████            29% (5 strategies)
PATTERN: ██████                    18% (3 strategies)
```

---

## Canonical Pattern Types

The system recognizes **5 canonical pattern types** that trigger PATTERN or HYBRID signals.

| Pattern Type | Code | Description | Used By Strategies |
|--------------|------|-------------|-------------------|
| **Pinbar** | `PINBAR` | Wick-based reversal pattern with long wick and small body | support_bounce, reverse_impulse |
| **Engulfing** | `ENGULFING` | Two-bar pattern where second bar completely engulfs first | inside_bar_reversal, defensive_hedge |
| **Morning Star** | `MORNING_STAR` | Three-bar bullish reversal pattern | morning_star, pivot_shift |
| **ABCD** | `ABCD` | Harmonic pattern with AB:CD ratio measurement | volatility_edge |
| **Tri-Star** | `TRI_STAR` | Three consecutive doji-like bars indicating indecision | adaptive_flow |

### Pattern-to-Canonical Normalization

Non-canonical patterns detected by pattern recognizers are normalized:

| Detected Pattern | Normalizes To |
|------------------|---------------|
| INSIDE_BAR | ENGULFING |
| THREE_SOLDIERS | MORNING_STAR |
| EVENING_STAR | MORNING_STAR |
| DOJI | TRI_STAR |
| HAMMER | PINBAR |
| SHOOTING_STAR | PINBAR |

---

## Market Friction Tiers

Market friction affects trade profitability and is categorized into **4 tiers**.

| Tier | Label | Friction Range | Description | Color |
|------|-------|----------------|-------------|-------|
| 1 | **Low** | 0 – 0.25% | Minimal trading costs, high liquidity | 🟢 Green |
| 2 | **Moderate** | 0.25 – 0.50% | Standard trading costs | 🟡 Yellow |
| 3 | **High** | 0.50 – 0.75% | Elevated costs, requires larger edge | 🟠 Orange |
| 4 | **Extreme** | > 0.75% | Very high costs, most trades unprofitable | 🔴 Red |

### Friction Calculation

```
frictionCost = (feeRate × 2) + (spread × 1.1) + slippage
```

Where:
- `feeRate` = 0.001 (0.10% Kraken fee)
- `spread` = bid-ask spread percentage
- `slippage` = 0.0015 (0.15% estimated)

---

## Macro Conditions

The macro-state module detects **4 global market conditions** that affect all trading pairs.

| Condition | Code | Description | Detection Criteria | Threshold Adjustments |
|-----------|------|-------------|-------------------|----------------------|
| **Normal** | `NORMAL` | Standard market conditions | Default state | None (1.0×) |
| **Volatility Expansion** | `VOLATILITY_EXPANSION` | Market-wide volatility spike | Global vol > 2σ above mean | LQ: 1.2×, VolNoise: 0.8× |
| **Liquidity Crunch** | `LIQUIDITY_CRUNCH` | Thin order books across market | Global liquidity < 1σ below mean | LQ: 1.5×, VolNoise: 1.0× |
| **Speculative Surge** | `SPECULATIVE_SURGE` | FOMO/mania conditions | Momentum + volume spike | LQ: 1.1×, VolNoise: 0.7× |

### Macro Detection Logic

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

## Regime-to-Strategy Mappings

### BULL_STABLE

| Strategy | Signal Type | Pattern | Secondary Metrics |
|----------|-------------|---------|-------------------|
| SMA Trend Ride | QUANT | — | Price > SMA(50) by > 0.5% • ADX > 25 |
| VWAP Pullback | QUANT | — | VWAP deviation < −1σ • Momentum > 0 |
| Morning Star | PATTERN | MORNING_STAR | 3-bar sequence; momentum flip > 0.3% |
| Pivot Shift | HYBRID | MORNING_STAR | RSI 45–55 • ADX slope > 0.5 |

### BEAR_VOLATILE

| Strategy | Signal Type | Pattern | Secondary Metrics |
|----------|-------------|---------|-------------------|
| Mean Reversion | QUANT | — | RSI < 30 or > 70 • Price deviation > 1σ |
| Reverse Impulse | HYBRID | PINBAR | Volume > 1.5× avg • Momentum spike < −0.5% |
| Defensive Hedge | HYBRID | ENGULFING | BTC Corr < 0.3 • Vol Offset > 1σ |
| Inside Bar Reversal | PATTERN | ENGULFING | Parent > Child × 1.3 • Breakout Volume > 1.5× avg |

### LOW_VOL_CHOP

| Strategy | Signal Type | Pattern | Secondary Metrics |
|----------|-------------|---------|-------------------|
| Range Trading | QUANT | — | Bollinger Bandwidth < 0.10 • ADX < 20 |
| Support Bounce | PATTERN | PINBAR | Price ≈ Local Min ± 1σ • Volume > 1.2× avg |
| ABCD Long | QUANT | — | AB:CD ≈ 1.0 • Volume > 1.2× avg |
| Adaptive Flow | HYBRID | TRI_STAR | Momentum inversion ≥ 3 • Volatility percentile > 70% |

### HIGH_VOL_IMPULSE

| Strategy | Signal Type | Pattern | Secondary Metrics |
|----------|-------------|---------|-------------------|
| Breakout | QUANT | — | Momentum > +0.7% • Volume > 2× avg |
| VWAP Bounce | QUANT | — | VWAP deviation > +1σ • Momentum −0.3–−0.6% |
| Volatility Edge | HYBRID | ABCD | Volatility Percentile > 80 • Regime mismatch = True |
| DHMA | QUANT | — | HMA(9) cross HMA(21) • ADX flat |

### TRANSITION

| Strategy | Signal Type | Pattern | Secondary Metrics |
|----------|-------------|---------|-------------------|
| Liquidity Trap | QUANT | — | Wick/Body > 2 or Depth Imbalance > 1.4 |
| Pivot Shift | HYBRID | MORNING_STAR | RSI 45–55 • ADX slope > 0.5 |
| Morning Star | PATTERN | MORNING_STAR | 3-bar sequence; momentum flip > 0.3% |

---

## Z-Score Normalization

The system uses **rolling 300-period windows** for statistical normalization of market metrics.

### RollingStats Class

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

### Z-Score Formula

```
zScore = (value - mean) / stdDev
```

### Z-Score Application Points

| Subsystem | Metrics Tracked | Purpose |
|-----------|-----------------|---------|
| **VTS Runner** | ADX, Volatility, Momentum | Per-pair regime classification |
| **DSS** | VolNoise, TrendSlope | Adaptive strategy selection |
| **Market Regime** | Global ADX, Vol, Mom | Normalized regime boundaries |

### Warmup Requirements

- **Minimum Samples**: 30 periods required before Z-Scores are valid
- **Window Size**: 300 periods (rolling)
- **Cold Start**: Returns raw values until warmup complete

### Z-Score Logging

```
[11.5][ZScore] BTC/USD: regime=BULL_STABLE zScores={adx=1.23, vol=-0.45, mom=0.87}
[11.5][DSS_ZScore] volZ=0.56 trendZ=1.12 raw_vol=0.032 raw_trend=0.0045
```

---

## Secondary Metric Adjustments

Secondary metric thresholds are dynamically adjusted based on macro conditions.

### Adjustment Matrix

| Macro Condition | LQ Threshold | VolNoise Threshold |
|-----------------|--------------|-------------------|
| NORMAL | 40 (1.0×) | 0.60 (1.0×) |
| VOLATILITY_EXPANSION | 48 (1.2×) | 0.48 (0.8× = stricter) |
| LIQUIDITY_CRUNCH | 60 (1.5×) | 0.60 (1.0×) |
| SPECULATIVE_SURGE | 44 (1.1×) | 0.42 (0.7× = stricter) |

### Adjustment Formula

```typescript
function adjustMetricRanges(baseThresholds, macroCondition) {
  const multipliers = MACRO_MULTIPLIERS[macroCondition];
  return {
    minLQ: baseThresholds.minLQ * multipliers.lq,
    maxVolNoise: baseThresholds.maxVolNoise * multipliers.volNoise
  };
}
```

---

## Legacy Normalization Maps

### Strategy Name Normalization

| Legacy Name | Canonical Key |
|-------------|---------------|
| MomentumPulse | vwap_pullback |
| TrendFlow | sma_trend_ride |
| BreakoutConfirm | breakout |
| H2_Slingshot | vwap_bounce |
| ImpulseChaser | liquidity_trap |
| TriangleBreakout | abcd_long |
| VolatilityEdge | volatility_edge |
| ReverseImpulse | reverse_impulse |
| DefensiveHedge | defensive_hedge |
| MeanReversion | mean_reversion |
| PivotShift | pivot_shift |
| AdaptiveFlow | adaptive_flow |
| RangeTrade | range_trade |
| SupportBounce | support_bounce |
| InsideBarReversal | inside_bar_reversal |
| MorningStar | morning_star |
| DHMA | dhma |

---

## Validation Functions

### isValidCanonicalCombination

Validates that a regime, strategy, signal type, and pattern combination is valid.

```typescript
function isValidCanonicalCombination(
  regime: string,
  strategy: string,
  signalType: string,
  patternType?: string | null
): { valid: boolean; reason?: string }
```

**Validation Steps:**
1. Normalize regime to canonical type
2. Normalize strategy to canonical key
3. Check strategy exists for regime
4. Verify signal type matches strategy definition
5. Verify pattern type matches (for HYBRID/PATTERN)

### selectContextAwareStrategy

Selects strategy based on regime, detected pattern, and symbol hash for diversity.

```typescript
function selectContextAwareStrategy(
  regime: CanonicalRegimeType, 
  detectedPattern: string | null,
  symbolHash?: number
): { 
  signalType: CanonicalSignalType; 
  strategy: string;
  patternType: CanonicalPatternType;
  selectionReason: 'exact_match' | 'hybrid_fallback' | 'pattern_fallback' | 'diversity' | 'primary';
}
```

**Selection Priority:**
1. Exact pattern match → Return matching HYBRID/PATTERN strategy
2. Pattern detected → Fallback to any HYBRID strategy
3. Pattern detected → Fallback to any PATTERN strategy
4. Diversity (25%) → Use symbol hash to select non-primary strategy
5. Default → Return primary (first) strategy for regime

---

## Document Maintenance

**Source of Truth:** `server/config/canonical-regime-strategy-map.ts`  
**Schema Version:** 11.4F.1  
**Last Schema Update:** January 12, 2026  

This document must be updated whenever:
- New regimes are added
- New strategies are created
- Regime-to-strategy mappings change
- Pattern types are added or modified
- Z-Score normalization parameters change
- Macro condition detection logic changes

---

*Document maintained by DawnTrader Development Team*  
*Last updated: January 18, 2026*
