# Strategy Signal Generation Specification — Directive 12.3.2

> **Date**: 2026-02-27
> **Author**: Claude Code (System Cartographer)
> **Purpose**: Complete mathematical specification for the 8 strategies that lack full signal generation implementations. This document is intended for cross-LLM review and vetting before any code is written.
> **Status**: DRAFT — Awaiting Kyle + multi-LLM review

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Existing Template: How Quant Strategies Work](#2-existing-template)
3. [Shared Infrastructure & Input Data](#3-shared-infrastructure)
4. [Strategy #1: morning_star (PATTERN)](#strategy-1-morning_star)
5. [Strategy #2: inside_bar_reversal (PATTERN)](#strategy-2-inside_bar_reversal)
6. [Strategy #3: support_bounce (PATTERN)](#strategy-3-support_bounce)
7. [Strategy #4: pivot_shift (HYBRID)](#strategy-4-pivot_shift)
8. [Strategy #5: reverse_impulse (HYBRID)](#strategy-5-reverse_impulse)
9. [Strategy #6: defensive_hedge (HYBRID)](#strategy-6-defensive_hedge)
10. [Strategy #7: adaptive_flow (HYBRID)](#strategy-7-adaptive_flow)
11. [Strategy #8: volatility_edge (HYBRID)](#strategy-8-volatility_edge)
12. [Master Constants Table](#12-master-constants-table)
13. [Master Variables Table](#13-master-variables-table)
14. [Review Checklist for Auditing LLMs](#14-review-checklist)

---

## 1. Architecture Overview

### The Three Signal Lanes

DawnTrader generates trade signals through three lanes:

| Lane | How It Works | Example |
|------|-------------|---------|
| **QUANT** | Pure math — technical indicators (VWAP, SMA, volume ratios, price levels) produce entry/exit levels | `vwap_pullback`: Price pulls back to VWAP, volume confirms, enter long |
| **PATTERN** | Candlestick formation recognition — visual price shapes produce entry/exit levels | `morning_star`: Three-candle reversal pattern detected, enter long on completion |
| **HYBRID** | Confluence — a pattern detection AND a quant condition must BOTH be true simultaneously | `pivot_shift`: Morning star pattern detected AND RSI in neutral zone AND ADX slope rising → enter long with higher confidence because two independent signals agree |

### Why Hybrid Strategies Exist

A single signal source can produce false positives. A VWAP pullback that happens to coincide with a morning star pattern is a stronger trade than either signal alone — two independent methods agree. Hybrid strategies formalize this confluence requirement.

### Signal Output Format

Every strategy — QUANT, PATTERN, or HYBRID — must produce the same output:

```
StrategySignal {
  symbol:      string     — The trading pair (e.g., "BTC/USD")
  strategy:    string     — The strategy name (e.g., "pivot_shift")
  entryPrice:  number     — Price at which to enter the trade
  stopPrice:   number     — Price at which to exit if the trade goes wrong (loss limit)
  targetPrice: number     — Price at which to exit if the trade goes right (profit target)
  confidence:  number     — 0.0 to 1.0 scale, how confident the strategy is in this signal
  signalType:  string     — "QUANT" | "PATTERN" | "HYBRID"
  patternType: string     — The candlestick pattern involved (if PATTERN or HYBRID)
  metadata:    object     — Strategy-specific diagnostic data for logging and VTS learning
}
```

### Reward-to-Risk Ratio (R:R)

Every signal must have a minimum reward-to-risk ratio. This is fundamental:

```
risk     = |entryPrice - stopPrice|
reward   = |targetPrice - entryPrice|
R:R      = reward / risk
```

**Minimum R:R = 1.5** for all strategies. If a strategy's calculated target produces R:R < 1.5, the signal is rejected (return null).

### ATR — The Universal Volatility Ruler

Most stop/target calculations use ATR (Average True Range) — a measure of how much a price typically moves per candle. ATR adapts to each asset's volatility automatically.

```
True Range (per candle) = max(high - low, |high - prevClose|, |low - prevClose|)
ATR(N) = Simple Moving Average of True Range over N candles
```

Default period: **N = 14 candles** (standard, used by existing quant strategies).

ATR is already computed by DawnTrader's technical indicator infrastructure and available as an input to all strategies.

---

## 2. Existing Template: How Quant Strategies Work

To show the pattern that new strategies follow, here's how an existing quant strategy (`vwap_pullback`) is structured:

```
INPUTS:
  - priceHistory[]     (OHLCV candles)
  - indicators         (pre-computed: VWAP, SMA, ATR, volume averages)
  - userParams         (configurable thresholds, with defaults)

ENTRY CONDITIONS (all must be true):
  1. Price > VWAP                              (above value area)
  2. |price - VWAP| / VWAP < 0.02             (within 2% pullback zone)
  3. Bullish reversal detected in last 3 bars  (momentum turning up)
  4. Volume > 1.5 × avgVolume                  (participation confirmation)

EXIT LEVELS:
  - Stop:   min(VWAP × 0.997, low24h × 1.001)
  - Target: max(high24h × 0.995, entry + 2 × risk)

CONFIDENCE:
  - Base: 0.70
  - +0.10 if volume > 2.0 × avgVolume
  - +0.10 if reversal confirmed by 2+ bars
  - Final: clamp(sum, 0.0, 1.0)

OUTPUT: StrategySignal or null (if conditions not met)
```

Every new strategy follows this same structure: conditions → levels → confidence → output.

---

## 3. Shared Infrastructure & Input Data

### Available Inputs (pre-computed, available to all strategies)

| Input | Source | Description |
|-------|--------|-------------|
| `priceHistory[]` | Kraken OHLCV | Array of candles: { open, high, low, close, volume, timestamp } |
| `currentPrice` | Latest ticker | Most recent trade price |
| `ATR(14)` | Technical indicators | 14-period Average True Range |
| `VWAP` | Technical indicators | Volume-Weighted Average Price |
| `SMA(N)` | Technical indicators | Simple Moving Average (configurable period) |
| `RSI(14)` | Technical indicators | Relative Strength Index, 0-100 scale |
| `ADX(14)` | Technical indicators | Average Directional Index, trend strength 0-100 |
| `avgVolume(20)` | Technical indicators | 20-period average volume |
| `patternSignals[]` | Pattern Recognizer | Detected candlestick patterns with strength scores |
| `regime` | calculatePairRegime() | Current canonical regime (after 12.3.1) |
| `momentum` | calculatePairRegime() | Price momentum metric |
| `volatility` | calculatePairRegime() | Price volatility metric |

### Pattern Detection Results (from existing Pattern Recognizer)

The Pattern Recognizer already detects 5 candlestick patterns. Each detection returns:

```
PatternSignal {
  symbol:     string                 — Trading pair
  pattern:    PatternType            — PINBAR | ENGULFING | INSIDE_BAR | MORNING_STAR | THREE_SOLDIERS
  direction:  "BUY" | "SELL"        — Pattern's directional implication
  strength:   number                 — 0.0 to 1.0 (visual clarity/quality score)
  timestamp:  number                 — When detected
  metadata:   object                 — Pattern-specific measurements
}
```

**Pattern strategies** add trade decision logic (entry/stop/target) on top of these detections.
**Hybrid strategies** require one of these detections PLUS quantitative conditions to be true.

### Shared Constants (used by multiple strategies)

| Constant | Value | Rationale |
|----------|-------|-----------|
| `MIN_RR_RATIO` | 1.5 | Minimum reward-to-risk. Below this, expected value is negative after fees. |
| `ATR_PERIOD` | 14 | Industry standard for ATR. Matches existing quant strategies. |
| `VOLUME_BASELINE_PERIOD` | 20 | 20-candle average volume for comparison. Matches existing strategies. |
| `MIN_PATTERN_STRENGTH` | 0.55 | Below this, pattern detection is too ambiguous to trade on. Derived from existing pattern recognizer's typical output range (0.6-0.95 for valid patterns). |
| `ENTRY_PREMIUM_BPS` | 10 | 0.1% (10 basis points) above current price for limit entry. Matches existing quant strategies. |
| `MAX_CONFIDENCE` | 1.0 | Hard ceiling for confidence scoring. |
| `MIN_CONFIDENCE` | 0.0 | Hard floor for confidence scoring. |

---

## Strategy #1: morning_star (PATTERN)

### Concept

The morning star is a three-candle bullish reversal pattern. It signals that a downtrend may be ending: a large bearish candle, followed by a small indecisive candle (the "star"), followed by a large bullish candle that closes above the midpoint of the first candle.

**Analogy**: Think of it as a tug-of-war. The bears pull hard (candle 1), then both sides pause and stall (candle 2, the star), then the bulls pull hard and win (candle 3). The stall in the middle is the key — it shows the bears ran out of energy.

### Current State

Pattern Recognizer **already detects** morning star patterns and returns:
- `strength`: 0.7 base + recovery bonus + gap bonus
- `metadata`: { c1Body, c2Body, c3Body, hasGap, recoveryRatio, c1Midpoint }

Currently, Signal Orchestrator converts this to a trade signal using a **generic** conversion (`patternToTradeSignal()`) that labels it as `'breakout'` and uses default ATR multipliers. This strategy replaces that generic handling with morning-star-specific trade logic.

### Entry Conditions

All must be true:

| # | Condition | Formula | Rationale |
|---|-----------|---------|-----------|
| 1 | Morning star pattern detected | `patternSignal.pattern === 'MORNING_STAR'` | Core requirement — the three-candle formation must be present |
| 2 | Pattern direction is bullish | `patternSignal.direction === 'BUY'` | Morning star is inherently bullish |
| 3 | Pattern strength above threshold | `patternSignal.strength >= MS_MIN_STRENGTH` | Filter out weak/ambiguous formations |
| 4 | Price is below short-term SMA | `currentPrice < SMA(20)` | Confirms we're in a pullback/downtrend — buying into weakness, not chasing strength |
| 5 | Volume confirmation on candle 3 | `c3Volume >= avgVolume(20) * MS_VOL_MULT` | The bullish reversal candle should have above-average participation |

### Exit Levels

```
entryPrice  = currentPrice × (1 + ENTRY_PREMIUM_BPS / 10000)
            = currentPrice × 1.001

stopPrice   = min(c2Low, c1Low) × (1 - MS_STOP_BUFFER)
            = lowest point of the star or the first candle, minus a small buffer

            Rationale: If price drops below the star's low, the reversal has
            failed. The stop sits just below the lowest point of the formation.

targetPrice = entryPrice + MS_TARGET_ATR_MULT × ATR(14)

            Rationale: ATR-based target adapts to the asset's volatility.
            Morning stars in volatile markets get wider targets, in quiet
            markets get tighter targets.
```

**R:R Check**:
```
risk   = entryPrice - stopPrice
reward = targetPrice - entryPrice
if (reward / risk) < MIN_RR_RATIO → reject signal (return null)
```

### Confidence Scoring

```
baseConfidence = patternSignal.strength × MS_STRENGTH_WEIGHT

volumeBonus    = if c3Volume >= avgVolume × 2.0 then MS_HIGH_VOL_BONUS else 0

gapBonus       = if patternSignal.metadata.hasGap then MS_GAP_BONUS else 0

recoveryBonus  = min(MS_MAX_RECOVERY_BONUS, patternSignal.metadata.recoveryRatio × 0.05)
                 Rationale: Higher recovery ratio = candle 3 recovered more of
                 candle 1's range = stronger reversal. Capped to prevent
                 over-weighting a single factor.

confidence     = clamp(baseConfidence + volumeBonus + gapBonus + recoveryBonus,
                        MIN_CONFIDENCE, MAX_CONFIDENCE)
```

### Constants

| Constant | Value | Type | Rationale |
|----------|-------|------|-----------|
| `MS_MIN_STRENGTH` | 0.60 | Threshold | Pattern recognizer baseline for morning star is 0.70. Setting entry threshold slightly below allows moderate formations. |
| `MS_VOL_MULT` | 1.2 | Multiplier | Candle 3 volume must be at least 1.2× average. Lower than breakout's 2.0× because reversal doesn't require as much momentum as a breakout. |
| `MS_STOP_BUFFER` | 0.003 | Fraction (0.3%) | Buffer below formation low. Prevents stop hunting on minor wicks. Consistent with existing strategies (0.2-0.5% range). |
| `MS_TARGET_ATR_MULT` | 2.5 | Multiplier | Target at 2.5× ATR from entry. Consistent with existing `patternToTradeSignal()` default. |
| `MS_STRENGTH_WEIGHT` | 0.80 | Weight | Pattern strength accounts for 80% of base confidence. Pattern is the primary signal. |
| `MS_HIGH_VOL_BONUS` | 0.08 | Additive | +8% confidence for exceptional volume (2× average). |
| `MS_GAP_BONUS` | 0.07 | Additive | +7% confidence if a gap exists between candle 1 and the star. Gaps indicate stronger sentiment shift. |
| `MS_MAX_RECOVERY_BONUS` | 0.05 | Additive cap | Maximum +5% from recovery ratio. Prevents single metric domination. |

### Variables

| Variable | Source | Range |
|----------|--------|-------|
| `patternSignal.strength` | Pattern Recognizer | [0.0, 1.0] |
| `c2Low` | Pattern metadata (star candle low) | Price level |
| `c1Low` | Pattern metadata (first candle low) | Price level |
| `c3Volume` | Price history (third candle volume) | ≥ 0 |
| `avgVolume(20)` | Technical indicators | > 0 |
| `ATR(14)` | Technical indicators | > 0 |
| `SMA(20)` | Technical indicators | Price level |
| `currentPrice` | Latest ticker | > 0 |
| `recoveryRatio` | Pattern metadata | [0.0, ~2.0] |
| `hasGap` | Pattern metadata | boolean |

### Metadata Output

```
{
  patternType: "MORNING_STAR",
  patternStrength: <strength>,
  recoveryRatio: <ratio>,
  hasGap: <boolean>,
  c3VolumeRatio: c3Volume / avgVolume,
  stopBasis: "formation_low",
  targetBasis: "ATR_multiple"
}
```

---

## Strategy #2: inside_bar_reversal (PATTERN)

### Concept

An inside bar is a candle whose entire range (high to low) fits within the previous candle's range. It represents compression — the market is squeezing into a tighter range, like a coiled spring. The strategy trades the breakout from that compression.

**Analogy**: Imagine pushing a beach ball underwater. The longer and deeper you hold it, the more energy it stores. When you let go, it shoots up. An inside bar is the "holding down" phase — the breakout is the release.

### Current State

Pattern Recognizer **already detects** inside bars and returns:
- `strength`: 0.6 base + compression bonus
- `metadata`: { compressionRatio, prevRange, currentRange, parentDirection }

The detection exists but there is no strategy logic that decides WHEN to trade the breakout and WHERE to place stops/targets.

### Entry Conditions

All must be true:

| # | Condition | Formula | Rationale |
|---|-----------|---------|-----------|
| 1 | Inside bar pattern detected | `patternSignal.pattern === 'INSIDE_BAR'` | Core requirement |
| 2 | Sufficient compression | `patternSignal.metadata.compressionRatio <= IB_MAX_COMPRESSION` | The inner bar must be meaningfully smaller than the outer bar. A ratio of 0.75 means the inner bar is at most 75% of the outer bar's range. More compression = more stored energy. |
| 3 | Breakout confirmation | `currentPrice > parentHigh × (1 + IB_BREAKOUT_BUFFER)` (for BUY) or `currentPrice < parentLow × (1 - IB_BREAKOUT_BUFFER)` (for SELL) | We don't enter on the inside bar itself — we wait for price to break out of the parent bar's range. The buffer prevents false breakouts on minor wicks. |
| 4 | Breakout volume confirmation | `breakoutVolume >= avgVolume(20) × IB_VOL_MULT` | The breakout candle must have above-average volume. Low-volume breakouts frequently reverse (fakeouts). |
| 5 | Direction filter | For BUY: RSI(14) < 65. For SELL: RSI(14) > 35. | Prevents buying into overbought or selling into oversold conditions. The reversal should still have room to run. |

### Exit Levels

```
FOR BUY SIGNALS:
  entryPrice  = parentHigh × (1 + IB_BREAKOUT_BUFFER)
              Rationale: Enter at the breakout level, not the current price.
              This ensures we're only in the trade if the breakout is confirmed.

  stopPrice   = parentLow × (1 - IB_STOP_BUFFER)
              Rationale: If price returns below the parent bar's low, the
              compression breakout has completely failed. Stop sits just
              below the parent low.

  targetPrice = entryPrice + IB_TARGET_ATR_MULT × ATR(14)

FOR SELL SIGNALS:
  entryPrice  = parentLow × (1 - IB_BREAKOUT_BUFFER)
  stopPrice   = parentHigh × (1 + IB_STOP_BUFFER)
  targetPrice = entryPrice - IB_TARGET_ATR_MULT × ATR(14)
```

**R:R Check**: `if (reward / risk) < MIN_RR_RATIO → reject`

### Confidence Scoring

```
compressionScore = (1 - compressionRatio) × IB_COMPRESSION_WEIGHT
                   Rationale: Lower compressionRatio = tighter coil = more energy.
                   A ratio of 0.5 (inner bar is half the parent) gives a higher
                   score than 0.7 (inner bar is 70% of parent).

volumeScore      = min(IB_MAX_VOL_BONUS,
                       (breakoutVolume / avgVolume - 1) × IB_VOL_SCORE_RATE)
                   Rationale: More volume = more conviction. Scaled linearly
                   from the excess volume ratio, capped to prevent domination.

strengthScore    = patternSignal.strength × IB_STRENGTH_WEIGHT

confidence       = clamp(compressionScore + volumeScore + strengthScore,
                          MIN_CONFIDENCE, MAX_CONFIDENCE)
```

### Constants

| Constant | Value | Type | Rationale |
|----------|-------|------|-----------|
| `IB_MAX_COMPRESSION` | 0.75 | Threshold | Inner bar must be ≤75% of parent range. Filters out "barely inside" bars that lack meaningful compression. |
| `IB_BREAKOUT_BUFFER` | 0.002 | Fraction (0.2%) | Price must exceed parent high/low by 0.2% to confirm breakout. Prevents noise triggers. |
| `IB_VOL_MULT` | 1.5 | Multiplier | Breakout volume must be 1.5× average. Higher than morning_star (1.2×) because breakouts need volume conviction. |
| `IB_STOP_BUFFER` | 0.003 | Fraction (0.3%) | Buffer below parent low for stop. Matches other strategy stop buffers. |
| `IB_TARGET_ATR_MULT` | 2.0 | Multiplier | Target at 2.0× ATR. Slightly lower than morning_star (2.5×) because inside bar breakouts in BEAR_VOLATILE regime have shorter follow-through. |
| `IB_COMPRESSION_WEIGHT` | 0.35 | Weight | Compression ratio contributes up to 35% of confidence. |
| `IB_STRENGTH_WEIGHT` | 0.45 | Weight | Pattern strength contributes up to 45% of confidence. |
| `IB_VOL_SCORE_RATE` | 0.10 | Rate | Each 1× excess volume adds 10% to confidence. |
| `IB_MAX_VOL_BONUS` | 0.20 | Cap | Volume bonus capped at 20%. |

### Variables

| Variable | Source | Range |
|----------|--------|-------|
| `compressionRatio` | Pattern metadata | [0.0, 1.0] — lower = tighter |
| `parentHigh` | Pattern metadata (previous candle high) | Price level |
| `parentLow` | Pattern metadata (previous candle low) | Price level |
| `breakoutVolume` | Current candle volume | ≥ 0 |
| `RSI(14)` | Technical indicators | [0, 100] |
| `ATR(14)` | Technical indicators | > 0 |

---

## Strategy #3: support_bounce (PATTERN)

### Concept

A support bounce identifies a price level where the asset has historically bounced upward (support), waits for price to approach that level again, and enters long when it shows signs of bouncing again — confirmed by a reversal candlestick pattern (pinbar) and volume.

**Analogy**: Think of a ball bouncing on a floor. Each time it hits the floor and bounces, the floor is "support." This strategy watches for the ball to approach the floor, sees it start to bounce (pinbar pattern), and bets that it will bounce again.

### Current State

**No implementation exists.** This is entirely new. The Pattern Recognizer detects pinbar patterns (which serve as the bounce confirmation signal), but the support level identification and bounce logic are new.

### Support Level Identification

Before entry conditions can be evaluated, we need to identify where support is. This is a preprocessing step:

```
INPUTS: priceHistory[] (at least 50 candles)

STEP 1: Find local minima
  A candle is a local minimum if:
    candle[i].low < candle[i-1].low AND candle[i].low < candle[i+1].low

  Collect all local minima within the lookback window (SB_LOOKBACK_CANDLES).

STEP 2: Cluster nearby levels
  Group minima that are within SB_CLUSTER_TOLERANCE of each other:
    |level_a - level_b| / level_a <= SB_CLUSTER_TOLERANCE

  Each cluster's support level = average of the cluster's minima.

STEP 3: Score support levels
  supportScore = touchCount / SB_MIN_TOUCHES

  A support level with 3 touches (bounces) in the lookback window scores
  3/2 = 1.5 (capped at 1.0 for confidence contribution).

  Only levels with touchCount >= SB_MIN_TOUCHES are valid.

STEP 4: Select nearest valid support
  From valid support levels, select the one closest to (but below) currentPrice.
  If no valid support exists within SB_MAX_DISTANCE of current price → no signal.
```

### Entry Conditions

All must be true:

| # | Condition | Formula | Rationale |
|---|-----------|---------|-----------|
| 1 | Valid support level exists | `supportLevel !== null` | Must have identified a historically tested support level |
| 2 | Price is near support | `(currentPrice - supportLevel) / supportLevel <= SB_PROXIMITY` | Price must be close to the support level — we're buying near the bounce zone, not far above it |
| 3 | Pinbar pattern detected | `patternSignal.pattern === 'PINBAR' AND patternSignal.direction === 'BUY'` | A bullish pinbar (long lower wick, small body) near support confirms the bounce. The lower wick shows sellers tried to push below support but were rejected. |
| 4 | Pattern strength sufficient | `patternSignal.strength >= MIN_PATTERN_STRENGTH` | Filter weak pinbars |
| 5 | Volume on bounce candle | `bounceVolume >= avgVolume(20) × SB_VOL_MULT` | Volume confirms real buying interest at support, not just a passive drift |

### Exit Levels

```
entryPrice  = currentPrice × (1 + ENTRY_PREMIUM_BPS / 10000)

stopPrice   = supportLevel × (1 - SB_STOP_BELOW_SUPPORT)
              Rationale: If price breaks below the support level, the support
              has failed. Stop sits just below support with a buffer for wicks.

targetPrice = entryPrice + SB_TARGET_ATR_MULT × ATR(14)
              Alternative: If a resistance level is identified above, use
              min(resistanceLevel × 0.995, entryPrice + SB_TARGET_ATR_MULT × ATR(14))
```

**R:R Check**: `if (reward / risk) < MIN_RR_RATIO → reject`

### Confidence Scoring

```
patternScore   = patternSignal.strength × SB_PATTERN_WEIGHT

supportScore   = min(1.0, touchCount / SB_MIN_TOUCHES) × SB_SUPPORT_WEIGHT
                 Rationale: More touches = more tested support = higher confidence.
                 A level with 4 touches scores higher than one with 2 touches.

proximityScore = (1 - (currentPrice - supportLevel) / (supportLevel × SB_PROXIMITY))
                 × SB_PROXIMITY_WEIGHT
                 Rationale: Closer to support = better entry = higher confidence.

volumeBonus    = if bounceVolume >= avgVolume × 2.0 then SB_HIGH_VOL_BONUS else 0

confidence     = clamp(patternScore + supportScore + proximityScore + volumeBonus,
                        MIN_CONFIDENCE, MAX_CONFIDENCE)
```

### Constants

| Constant | Value | Type | Rationale |
|----------|-------|------|-----------|
| `SB_LOOKBACK_CANDLES` | 50 | Count | Look back 50 candles (~2 days on 1h chart) to identify support levels. Long enough to capture meaningful bounces, short enough to be relevant. |
| `SB_CLUSTER_TOLERANCE` | 0.005 | Fraction (0.5%) | Minima within 0.5% of each other are considered the same support level. Accounts for imprecise bounces. |
| `SB_MIN_TOUCHES` | 2 | Count | Support must have been tested at least twice. Single-touch "support" is unreliable. |
| `SB_MAX_DISTANCE` | 0.03 | Fraction (3%) | Support level must be within 3% of current price. Beyond this, the level is too far away to be immediately relevant. |
| `SB_PROXIMITY` | 0.015 | Fraction (1.5%) | Price must be within 1.5% of support to trigger. We want entries near the bounce point, not halfway between support and resistance. |
| `SB_VOL_MULT` | 1.2 | Multiplier | Bounce volume at least 1.2× average. Lower threshold than breakout strategies because bounces are quieter events. |
| `SB_STOP_BELOW_SUPPORT` | 0.005 | Fraction (0.5%) | Stop placed 0.5% below support level. Slightly wider than other strategies because support levels are approximate. |
| `SB_TARGET_ATR_MULT` | 2.0 | Multiplier | Target at 2.0× ATR from entry. Conservative — LOW_VOL_CHOP regime (where this strategy runs) has muted moves. |
| `SB_PATTERN_WEIGHT` | 0.40 | Weight | Pattern strength contributes 40% of confidence. |
| `SB_SUPPORT_WEIGHT` | 0.30 | Weight | Support quality contributes 30% of confidence. |
| `SB_PROXIMITY_WEIGHT` | 0.15 | Weight | Entry proximity contributes 15% of confidence. |
| `SB_HIGH_VOL_BONUS` | 0.08 | Additive | +8% for exceptional bounce volume (2× average). |

### Variables

| Variable | Source | Range |
|----------|--------|-------|
| `supportLevel` | Support identification algorithm | Price level or null |
| `touchCount` | Support identification algorithm | ≥ 2 (by filter) |
| `patternSignal.strength` | Pattern Recognizer (PINBAR) | [0.0, 1.0] |
| `bounceVolume` | Current candle volume | ≥ 0 |
| `currentPrice` | Latest ticker | > 0 |
| `ATR(14)` | Technical indicators | > 0 |

---

## Strategy #4: pivot_shift (HYBRID)

### Concept

A pivot shift detects a market that is transitioning from one regime to another — specifically, a market that was ranging or declining but is now showing early signs of a bullish trend (a "pivot"). It requires BOTH a morning star reversal pattern AND quantitative confirmation that the trend is starting to shift (RSI in neutral zone, ADX slope turning positive).

**Analogy**: Think of a car that's been parked (ranging) or rolling backward (declining). A pivot shift is like seeing the reverse lights turn off, the brake lights turn off, and the car start to creep forward. The morning star is seeing the car start to move. The RSI/ADX checks confirm it's actually in gear, not just rolling on a hill.

### Regime Assignment
- **BULL_STABLE**: Primary — trend is already established, pivot confirms continuation
- **TRANSITION**: Secondary — market is shifting, pivot catches the early move

### Entry Conditions

All must be true:

| # | Condition | Formula | Rationale |
|---|-----------|---------|-----------|
| 1 | Morning star pattern detected | `patternSignal.pattern === 'MORNING_STAR' AND patternSignal.direction === 'BUY'` | The reversal pattern must be present as the visual confirmation |
| 2 | Pattern strength sufficient | `patternSignal.strength >= MIN_PATTERN_STRENGTH` | Quality gate on the pattern |
| 3 | RSI in neutral zone | `PS_RSI_LOW <= RSI(14) <= PS_RSI_HIGH` | RSI between 40-60 means the market isn't overbought (no room to run) or oversold (still falling). Neutral RSI + reversal pattern = genuine pivot, not exhaustion. |
| 4 | ADX slope is positive | `ADX(14)[current] - ADX(14)[prev] > PS_ADX_SLOPE_MIN` | ADX slope measures whether trend strength is INCREASING. A rising ADX after a reversal pattern means a new trend is forming, not just noise. |
| 5 | Volume confirmation | `currentVolume >= avgVolume(20) × PS_VOL_MULT` | Institutional interest in the pivot |

### Why Both Conditions Matter

The morning star alone could be noise — it has a natural false positive rate. RSI and ADX alone could indicate a trend starting, but starting trends frequently fail. Together:
- Morning star = "the car is turning around"
- RSI neutral = "it has room to accelerate"
- ADX slope positive = "it's actually gaining speed"

This triple confirmation filters out most false starts.

### Exit Levels

```
entryPrice  = currentPrice × (1 + ENTRY_PREMIUM_BPS / 10000)

stopPrice   = min(morningStarLow, currentPrice × (1 - PS_STOP_ATR_MULT × ATR(14) / currentPrice))
              Rationale: Use the tighter of two stops — the morning star
              formation low OR an ATR-based stop. This ensures the stop
              adapts to volatility but never sits above the pattern's
              invalidation level.

targetPrice = entryPrice + PS_TARGET_ATR_MULT × ATR(14)
              Rationale: Pivot shifts in trending regimes get wider targets
              (3.0× ATR) because the new trend has room to develop.
```

**R:R Check**: `if (reward / risk) < MIN_RR_RATIO → reject`

### Confidence Scoring

```
patternScore    = patternSignal.strength × PS_PATTERN_WEIGHT

rsiScore        = (1 - |RSI(14) - 50| / 50) × PS_RSI_WEIGHT
                  Rationale: RSI closest to 50 (perfect neutral) scores highest.
                  RSI at 50 → factor = 1.0. RSI at 40 or 60 → factor = 0.8.
                  This rewards the most neutral starting position.

adxSlopeScore   = min(PS_MAX_ADX_BONUS, adxSlope × PS_ADX_SCORE_RATE)
                  Rationale: Steeper ADX slope = faster trend development.
                  Capped to prevent domination.

volumeBonus     = if currentVolume >= avgVolume × 2.0 then PS_HIGH_VOL_BONUS else 0

confidence      = clamp(patternScore + rsiScore + adxSlopeScore + volumeBonus,
                         MIN_CONFIDENCE, MAX_CONFIDENCE)
```

### Constants

| Constant | Value | Type | Rationale |
|----------|-------|------|-----------|
| `PS_RSI_LOW` | 40 | Threshold | RSI below 40 = still oversold, reversal may not stick |
| `PS_RSI_HIGH` | 60 | Threshold | RSI above 60 = approaching overbought, limited upside |
| `PS_ADX_SLOPE_MIN` | 0.5 | Threshold | ADX must increase by at least 0.5 points between candles. Very shallow slopes indicate no real trend formation. |
| `PS_VOL_MULT` | 1.3 | Multiplier | Volume at least 1.3× average. Moderate requirement — pivots are transitions, not explosions. |
| `PS_STOP_ATR_MULT` | 1.5 | Multiplier | ATR-based stop at 1.5× ATR below entry. Standard for trend-following entries. |
| `PS_TARGET_ATR_MULT` | 3.0 | Multiplier | Target at 3.0× ATR. Wider than pattern strategies because pivot shift catches early trend moves with more room to develop. |
| `PS_PATTERN_WEIGHT` | 0.40 | Weight | Pattern contributes 40% of confidence |
| `PS_RSI_WEIGHT` | 0.25 | Weight | RSI neutrality contributes 25% |
| `PS_ADX_SCORE_RATE` | 0.05 | Rate | Each 1-point ADX slope increase adds 5% confidence |
| `PS_MAX_ADX_BONUS` | 0.20 | Cap | ADX contribution capped at 20% |
| `PS_HIGH_VOL_BONUS` | 0.08 | Additive | +8% for exceptional volume |

### Variables

| Variable | Source | Range |
|----------|--------|-------|
| `patternSignal.strength` | Pattern Recognizer (MORNING_STAR) | [0.0, 1.0] |
| `RSI(14)` | Technical indicators | [0, 100] |
| `ADX(14)` | Technical indicators | [0, 100] |
| `adxSlope` | ADX[current] - ADX[prev] | Can be negative (rejected) |
| `morningStarLow` | Pattern metadata (lowest point) | Price level |
| `currentVolume` | Current candle | ≥ 0 |
| `ATR(14)` | Technical indicators | > 0 |

---

## Strategy #5: reverse_impulse (HYBRID)

### Concept

A reverse impulse catches a sharp bearish move that has overextended and is snapping back. It requires BOTH a pinbar rejection pattern (long lower wick = sellers tried and failed) AND quantitative confirmation of overextension (momentum spike + volume spike).

**Analogy**: Think of a rubber band pulled too far. The pinbar is seeing the rubber band reach its maximum stretch (the long wick that snaps back). The momentum and volume spikes confirm the stretch was violent enough that a snap-back is probable.

### Regime Assignment
- **BEAR_VOLATILE**: This strategy operates in actively bearish, high-volatility markets — the only regime where sharp snap-backs are common enough to trade.

### Entry Conditions

All must be true:

| # | Condition | Formula | Rationale |
|---|-----------|---------|-----------|
| 1 | Bullish pinbar detected | `patternSignal.pattern === 'PINBAR' AND patternSignal.direction === 'BUY'` | A bullish pinbar (long lower wick, small body near top) shows aggressive selling was rejected. |
| 2 | Pattern strength sufficient | `patternSignal.strength >= RI_MIN_STRENGTH` | Higher threshold (0.65) than other strategies because we're counter-trend trading in volatile conditions — we need strong signals. |
| 3 | Recent momentum spike down | `minMomentum(RI_LOOKBACK) <= RI_MOMENTUM_THRESHOLD` | Momentum must have spiked below -0.5% within the lookback window. This confirms a sharp move happened (not a slow grind). |
| 4 | Volume spike on rejection | `pinbarVolume >= avgVolume(20) × RI_VOL_MULT` | The rejection candle (pinbar) must have high volume. High volume on a rejection = large participants defending a level. |
| 5 | RSI in oversold zone | `RSI(14) < RI_RSI_MAX` | RSI below 35 confirms the market is stretched to the downside. We're buying when others are panic-selling. |

### Why Counter-Trend Works Here

Normally, trading against the trend is dangerous. This strategy mitigates that risk by requiring THREE independent confirmations of exhaustion: (1) the price action itself rejected (pinbar), (2) the move was violent (momentum spike), (3) the rejection had conviction (volume spike), and (4) the market is stretched (RSI oversold). All four agreeing significantly reduces false positive rate.

### Exit Levels

```
entryPrice  = currentPrice × (1 + ENTRY_PREMIUM_BPS / 10000)

stopPrice   = pinbarLow × (1 - RI_STOP_BUFFER)
              Rationale: The pinbar's lower wick tip is where selling was
              rejected. If price goes below that level, the rejection failed.
              Buffer for volatility noise in BEAR_VOLATILE regime.

targetPrice = entryPrice + RI_TARGET_ATR_MULT × ATR(14)
              Rationale: Conservative target (2.0× ATR) because this is a
              counter-trend trade. We're capturing the snap-back, not
              predicting a full reversal.
```

**R:R Check**: `if (reward / risk) < MIN_RR_RATIO → reject`

### Confidence Scoring

```
patternScore    = patternSignal.strength × RI_PATTERN_WEIGHT

momentumScore   = min(RI_MAX_MOMENTUM_BONUS,
                      |momentum - RI_MOMENTUM_THRESHOLD| × RI_MOMENTUM_RATE)
                  Rationale: The further below threshold, the more overextended
                  the move was, the stronger the snap-back signal.

rsiScore        = (1 - RSI(14) / 100) × RI_RSI_WEIGHT
                  Rationale: Lower RSI = more oversold = more stretched.
                  RSI 20 scores higher than RSI 30.

volumeBonus     = if pinbarVolume >= avgVolume × 2.5 then RI_EXTREME_VOL_BONUS else 0

confidence      = clamp(patternScore + momentumScore + rsiScore + volumeBonus,
                         MIN_CONFIDENCE, MAX_CONFIDENCE)
```

### Constants

| Constant | Value | Type | Rationale |
|----------|-------|------|-----------|
| `RI_MIN_STRENGTH` | 0.65 | Threshold | Higher bar for counter-trend. Must be a clear rejection. |
| `RI_MOMENTUM_THRESHOLD` | -0.005 | Threshold (-0.5%) | Momentum must spike below -0.5%. This filters out gentle drifts. Only sharp moves qualify. |
| `RI_LOOKBACK` | 5 | Candles | Check last 5 candles for momentum spike. ~5 hours on 1h chart — captures the impulse move. |
| `RI_VOL_MULT` | 1.5 | Multiplier | Pinbar volume at least 1.5× average. The rejection must have participation. |
| `RI_RSI_MAX` | 35 | Threshold | RSI must be below 35 (oversold territory). |
| `RI_STOP_BUFFER` | 0.005 | Fraction (0.5%) | Wider stop buffer for BEAR_VOLATILE regime. Volatile markets need more room. |
| `RI_TARGET_ATR_MULT` | 2.0 | Multiplier | Conservative target. Counter-trend trades should take profit quickly. |
| `RI_PATTERN_WEIGHT` | 0.40 | Weight | Pattern contributes 40% |
| `RI_MOMENTUM_RATE` | 10.0 | Rate | Each 0.1% beyond threshold adds 10% × 0.001 = 1% confidence |
| `RI_MAX_MOMENTUM_BONUS` | 0.20 | Cap | Momentum capped at 20% |
| `RI_RSI_WEIGHT` | 0.25 | Weight | RSI oversold contributes up to 25% |
| `RI_EXTREME_VOL_BONUS` | 0.10 | Additive | +10% for extreme volume (2.5× average) |

### Variables

| Variable | Source | Range |
|----------|--------|-------|
| `patternSignal.strength` | Pattern Recognizer (PINBAR) | [0.0, 1.0] |
| `pinbarLow` | Pattern metadata (wick low) | Price level |
| `pinbarVolume` | Pinbar candle volume | ≥ 0 |
| `momentum` | calculatePairRegime() output | Typically [-0.05, 0.05] |
| `RSI(14)` | Technical indicators | [0, 100] |
| `ATR(14)` | Technical indicators | > 0 |

---

## Strategy #6: defensive_hedge (HYBRID)

### Concept

A defensive hedge is a contrarian play during bearish volatile markets. It looks for a bullish engulfing pattern (strong reversal) on an asset that has LOW correlation with BTC — meaning if BTC continues falling, this particular asset may decouple and recover independently. The "hedge" part comes from the low correlation: you're buying something that doesn't move in lockstep with the broader market decline.

**Analogy**: In a storm, most ships sink together. But a submarine operates independently of surface conditions. A defensive hedge finds the "submarines" — assets that are showing strength (engulfing pattern) while being structurally independent of the broader sell-off (low BTC correlation).

### Regime Assignment
- **BEAR_VOLATILE**: Specifically designed for bear markets. This strategy only makes sense when the broader market is falling and you're looking for individual assets that can resist the downdraft.

### BTC Correlation Calculation

```
INPUTS: asset priceHistory[], BTC priceHistory[] (matched timestamps)

STEP 1: Calculate returns for both
  assetReturns[i]  = (assetPrice[i] - assetPrice[i-1]) / assetPrice[i-1]
  btcReturns[i]    = (btcPrice[i] - btcPrice[i-1]) / btcPrice[i-1]

STEP 2: Pearson correlation over DH_CORR_WINDOW candles
  correlation = pearson(assetReturns, btcReturns)
  Range: [-1.0, 1.0]
  -1.0 = perfectly inverse (asset goes up when BTC goes down)
   0.0 = no relationship
  +1.0 = perfectly correlated (moves in lockstep with BTC)
```

### Volatility Offset Calculation

```
assetVol  = stddev(assetReturns, DH_VOL_WINDOW)
marketVol = stddev(btcReturns, DH_VOL_WINDOW)
volOffset = (assetVol - marketVol) / marketVol

volOffset > 0 means asset is more volatile than market
volOffset > 1.0 means asset is 2× as volatile as market (1 standard deviation above)
```

### Entry Conditions

All must be true:

| # | Condition | Formula | Rationale |
|---|-----------|---------|-----------|
| 1 | Bullish engulfing detected | `patternSignal.pattern === 'ENGULFING' AND patternSignal.direction === 'BUY'` | Engulfing pattern = aggressive buying overwhelming prior selling. Strongest single-candle reversal signal. |
| 2 | Pattern strength sufficient | `patternSignal.strength >= MIN_PATTERN_STRENGTH` | Quality gate |
| 3 | Low BTC correlation | `|btcCorrelation| < DH_MAX_CORRELATION` | Asset must have low correlation with BTC. This is the "hedge" — if BTC keeps falling, this asset is statistically independent. |
| 4 | Volatility offset positive | `volOffset > DH_MIN_VOL_OFFSET` | Asset has its own volatility dynamics separate from the market. Confirms structural independence, not just temporary decorrelation. |
| 5 | Volume confirmation | `engulfingVolume >= avgVolume(20) × DH_VOL_MULT` | Real buying interest behind the engulfing candle |

### Exit Levels

```
entryPrice  = currentPrice × (1 + ENTRY_PREMIUM_BPS / 10000)

stopPrice   = engulfingLow × (1 - DH_STOP_BUFFER)
              Rationale: If price drops below the engulfing candle's low,
              the bullish reversal has failed. Wider buffer (0.5%) because
              BEAR_VOLATILE has more noise.

targetPrice = entryPrice + DH_TARGET_ATR_MULT × ATR(14)
              Rationale: Conservative target (1.8× ATR). In bear markets,
              even hedged positions should take profit quickly.
```

**R:R Check**: `if (reward / risk) < MIN_RR_RATIO → reject`

### Confidence Scoring

```
patternScore      = patternSignal.strength × DH_PATTERN_WEIGHT

decorrelScore     = (1 - |btcCorrelation| / DH_MAX_CORRELATION) × DH_DECORR_WEIGHT
                    Rationale: Lower correlation = more independent = higher
                    confidence in the hedge. Correlation 0 scores maximum.

volOffsetScore    = min(DH_MAX_VOL_BONUS,
                        volOffset × DH_VOL_OFFSET_RATE)
                    Rationale: Higher volatility offset = more independent
                    dynamics. Capped to prevent domination.

engulfRatioBonus  = if patternSignal.metadata.engulfRatio > 1.5
                    then DH_STRONG_ENGULF_BONUS else 0
                    Rationale: Engulfing ratio > 1.5 means current body is
                    50% larger than previous body — a very strong reversal.

confidence        = clamp(patternScore + decorrelScore + volOffsetScore + engulfRatioBonus,
                           MIN_CONFIDENCE, MAX_CONFIDENCE)
```

### Constants

| Constant | Value | Type | Rationale |
|----------|-------|------|-----------|
| `DH_CORR_WINDOW` | 30 | Candles | 30 candles for correlation calculation. ~30 hours on 1h chart. Long enough for statistical significance, short enough for regime relevance. |
| `DH_VOL_WINDOW` | 20 | Candles | 20 candles for volatility calculation. Matches standard baseline period. |
| `DH_MAX_CORRELATION` | 0.30 | Threshold | Correlation must be below 0.30 (absolute value). Above 0.30, the asset moves too much with BTC to be considered a hedge. |
| `DH_MIN_VOL_OFFSET` | 0.10 | Threshold (10%) | Asset must be at least 10% more volatile than BTC on its own. Confirms independent price dynamics. |
| `DH_VOL_MULT` | 1.3 | Multiplier | Engulfing volume at least 1.3× average. |
| `DH_STOP_BUFFER` | 0.005 | Fraction (0.5%) | Wider buffer for BEAR_VOLATILE regime noise. |
| `DH_TARGET_ATR_MULT` | 1.8 | Multiplier | Conservative — bear market trades should exit quickly. Below the 2.0× standard. |
| `DH_PATTERN_WEIGHT` | 0.35 | Weight | Pattern contributes 35% |
| `DH_DECORR_WEIGHT` | 0.30 | Weight | Decorrelation contributes 30% (core hedge metric) |
| `DH_VOL_OFFSET_RATE` | 0.15 | Rate | Each 10% volatility offset adds 1.5% confidence |
| `DH_MAX_VOL_BONUS` | 0.15 | Cap | Volatility offset capped at 15% |
| `DH_STRONG_ENGULF_BONUS` | 0.08 | Additive | +8% for strong engulfing (ratio > 1.5) |

### Variables

| Variable | Source | Range |
|----------|--------|-------|
| `btcCorrelation` | BTC correlation calculation | [-1.0, 1.0] |
| `volOffset` | Volatility offset calculation | Can be negative (rejected) |
| `patternSignal.strength` | Pattern Recognizer (ENGULFING) | [0.0, 1.0] |
| `engulfRatio` | Pattern metadata | > 1.0 (by engulfing definition) |
| `engulfingLow` | Engulfing candle low price | Price level |
| `engulfingVolume` | Engulfing candle volume | ≥ 0 |

### Data Dependency Note

This strategy requires **BTC price data alongside the target asset's data**. DawnTrader's data pipeline already fetches BTC/USD as a reference pair. The correlation calculation must use time-aligned candles from both assets.

---

## Strategy #7: adaptive_flow (HYBRID)

### Concept

Adaptive flow detects a market that is choppy (LOW_VOL_CHOP regime) but about to break out of its chop. It looks for BOTH a pattern signal AND quantitative evidence that the range is weakening — specifically, momentum has inverted direction multiple times (indicating the range is getting "tested" from both sides), and volatility percentile is rising (the chop is getting wider, suggesting energy building).

**Analogy**: Think of water behind a dam. During LOW_VOL_CHOP, the water level is stable but fluctuating slightly (momentum inversions). Adaptive flow detects when the fluctuations are getting bigger (rising volatility percentile) and the dam is showing cracks (a breakout pattern forming). It positions before the dam breaks.

### Regime Assignment
- **LOW_VOL_CHOP**: Specifically designed for quiet, range-bound markets where a breakout is anticipated.

### Momentum Inversion Count

```
INPUTS: momentum values over AF_LOOKBACK candles

A momentum inversion occurs when:
  momentum[i-1] > 0 AND momentum[i] < 0   (positive → negative)
  OR
  momentum[i-1] < 0 AND momentum[i] > 0   (negative → positive)

inversionCount = count of inversions in lookback window
```

### Volatility Percentile

```
INPUTS: volatility values over AF_VOL_PERCENTILE_WINDOW candles

volPercentile = percentile_rank(currentVolatility, volatilityHistory)
               = (count of values <= currentVolatility) / total count × 100

Range: [0, 100]
  0   = current volatility is the lowest in the window
  50  = median
  100 = current volatility is the highest in the window
```

### Entry Conditions

All must be true:

| # | Condition | Formula | Rationale |
|---|-----------|---------|-----------|
| 1 | Three soldiers pattern detected | `patternSignal.pattern === 'THREE_SOLDIERS' AND patternSignal.direction === 'BUY'` | Three consecutive bullish candles = directional conviction emerging from chop. Note: Canonical map specifies TRI_STAR pattern type, but Pattern Recognizer has THREE_SOLDIERS which is the equivalent bullish signal. |
| 2 | Pattern strength sufficient | `patternSignal.strength >= MIN_PATTERN_STRENGTH` | Quality gate |
| 3 | Sufficient momentum inversions | `inversionCount >= AF_MIN_INVERSIONS` | At least 3 direction changes in the lookback window confirms the market has been choppy (range-bound, oscillating). Without this, we might buy into a smooth trend (wrong context). |
| 4 | Volatility percentile rising | `volPercentile >= AF_MIN_VOL_PERCENTILE` | Current volatility must be above the 70th percentile of recent history. Rising volatility in a choppy market = energy building for a breakout. |
| 5 | Volume rising | `currentVolume >= avgVolume(20) × AF_VOL_MULT` | Participation increasing alongside the directional signal |

### Exit Levels

```
entryPrice  = currentPrice × (1 + ENTRY_PREMIUM_BPS / 10000)

stopPrice   = currentPrice × (1 - AF_STOP_ATR_MULT × ATR(14) / currentPrice)
              Rationale: ATR-based stop. In LOW_VOL_CHOP, ranges are narrow,
              so ATR produces a tight stop. The 1.5× multiplier provides
              enough room for normal chop noise.

targetPrice = entryPrice + AF_TARGET_ATR_MULT × ATR(14)
              Rationale: Wide target (3.0× ATR) because if the breakout
              succeeds, the move can be substantial relative to the prior chop.
              Breakouts from extended ranges tend to have larger follow-through.
```

**R:R Check**: `if (reward / risk) < MIN_RR_RATIO → reject`

### Confidence Scoring

```
patternScore     = patternSignal.strength × AF_PATTERN_WEIGHT

inversionScore   = min(AF_MAX_INVERSION_BONUS,
                       (inversionCount - AF_MIN_INVERSIONS + 1) × AF_INVERSION_RATE)
                   Rationale: More inversions = longer the market has been
                   coiling. 5 inversions scores higher than 3.

volPctScore      = (volPercentile - AF_MIN_VOL_PERCENTILE) / (100 - AF_MIN_VOL_PERCENTILE)
                   × AF_VOL_PCT_WEIGHT
                   Rationale: Higher percentile = more energy building.
                   At percentile 70 (minimum), score = 0.
                   At percentile 100, score = AF_VOL_PCT_WEIGHT.

volumeBonus      = if currentVolume >= avgVolume × 1.8 then AF_HIGH_VOL_BONUS else 0

confidence       = clamp(patternScore + inversionScore + volPctScore + volumeBonus,
                          MIN_CONFIDENCE, MAX_CONFIDENCE)
```

### Constants

| Constant | Value | Type | Rationale |
|----------|-------|------|-----------|
| `AF_LOOKBACK` | 20 | Candles | 20 candles to count momentum inversions. ~20 hours on 1h chart. |
| `AF_MIN_INVERSIONS` | 3 | Count | At least 3 direction changes confirms genuine chop, not a short pause in a trend. |
| `AF_VOL_PERCENTILE_WINDOW` | 50 | Candles | 50-candle window for percentile calculation. Provides meaningful distribution. |
| `AF_MIN_VOL_PERCENTILE` | 70 | Percentile | Volatility must be above 70th percentile. The "energy building" confirmation. |
| `AF_VOL_MULT` | 1.3 | Multiplier | Volume at least 1.3× average. Moderate — chop-to-breakout transitions start with moderate volume. |
| `AF_STOP_ATR_MULT` | 1.5 | Multiplier | Stop at 1.5× ATR below entry. Standard trend-following stop. |
| `AF_TARGET_ATR_MULT` | 3.0 | Multiplier | Wide target because breakout from extended chop can produce outsized moves. |
| `AF_PATTERN_WEIGHT` | 0.35 | Weight | Pattern contributes 35% |
| `AF_INVERSION_RATE` | 0.05 | Rate | Each inversion above minimum adds 5% confidence |
| `AF_MAX_INVERSION_BONUS` | 0.20 | Cap | Inversion contribution capped at 20% |
| `AF_VOL_PCT_WEIGHT` | 0.25 | Weight | Volatility percentile contributes up to 25% |
| `AF_HIGH_VOL_BONUS` | 0.08 | Additive | +8% for strong volume (1.8× average) |

### Variables

| Variable | Source | Range |
|----------|--------|-------|
| `inversionCount` | Momentum inversion calculation | ≥ 0 |
| `volPercentile` | Volatility percentile calculation | [0, 100] |
| `patternSignal.strength` | Pattern Recognizer (THREE_SOLDIERS) | [0.0, 1.0] |
| `momentum` | calculatePairRegime() output | Typically [-0.05, 0.05] |
| `currentVolume` | Current candle | ≥ 0 |
| `ATR(14)` | Technical indicators | > 0 |

---

## Strategy #8: volatility_edge (HYBRID)

### Concept

Volatility edge exploits a market that is in high-volatility impulse mode AND showing an ABCD harmonic pattern. The ABCD pattern provides a structured entry with a mathematically defined target (the D-point completion), while the high-volatility environment means the move to the D-point target should be fast and momentum-driven.

The "edge" comes from combining geometric price structure (ABCD) with volatility regime awareness. In calm markets, ABCD patterns often fail because there's not enough energy to complete the move. In high-volatility markets, the energy is already there — the pattern just provides the timing and direction.

**Analogy**: ABCD is like a blueprint for a building. High volatility is like having a powered crane on site. The blueprint alone doesn't build anything — you need the energy to execute it. The crane alone is powerful but unfocused. Together, you get a structured move powered by real market energy.

### Regime Assignment
- **HIGH_VOL_IMPULSE**: Specifically designed for volatile trending markets. This is the only regime where both conditions (strong pattern structure + high energy) regularly co-occur.

### ABCD Pattern Structure

The ABCD pattern is already detected by the existing quant strategy `abcd_long` in `strategy-engine.ts`. The pattern consists of four price points:

```
A → B: Initial impulse move (sharp up)
B → C: Pullback/consolidation (partial retrace)
C → D: Second impulse (resumes A→B direction)

Key relationships:
  B→C retraces 38.2% to 78.6% of A→B (Fibonacci)
  C→D should approximately equal A→B in magnitude (measured move)
  D = projected target
```

For `volatility_edge`, we use the pattern recognition from the existing infrastructure but add volatility regime confirmation.

### Entry Conditions

All must be true:

| # | Condition | Formula | Rationale |
|---|-----------|---------|-----------|
| 1 | ABCD pattern in progress | C-point established, price moving toward projected D | The A→B impulse and B→C pullback have occurred. Price is at or near C, beginning the C→D leg. |
| 2 | Volume spike at A-point | `aPointVolume >= avgVolume(20) × VE_A_VOL_MULT` | The initial impulse (A→B) must have been volume-confirmed. This validates that the pattern started with real institutional interest. |
| 3 | Volatility percentile extreme | `volPercentile >= VE_MIN_VOL_PERCENTILE` | Current volatility must be above 80th percentile. Confirms the "high energy" environment needed for D-point completion. |
| 4 | C-point holds above VWAP | `cPointLow > VWAP` (for bullish) | The pullback (B→C) didn't break the value area. Market structure is intact. |
| 5 | Breakout from C | `currentPrice > cPointHigh × (1 + VE_BREAKOUT_BUFFER)` | Price has broken above the C-point high, confirming the C→D leg has begun. |
| 6 | Volume on breakout | `breakoutVolume >= avgVolume(20) × VE_BREAKOUT_VOL_MULT` | Breakout from C must have volume participation |

### Exit Levels

```
entryPrice  = cPointHigh × (1 + VE_BREAKOUT_BUFFER)
              Rationale: Enter at the breakout of C-point high.
              This confirms the C→D leg has begun.

stopPrice   = cPointLow × (1 - VE_STOP_BUFFER)
              Rationale: If price drops below C, the pattern has failed.
              The measured move thesis is invalidated.

targetPrice = cPointHigh + (bPointHigh - aPointLow) × VE_MEASURED_MOVE_MULT
              Rationale: Classic measured move — the C→D leg should
              approximately equal the A→B leg. The multiplier (0.9×)
              takes profit slightly before the theoretical D-point
              completion. Better to exit at 90% of the target than
              to get stopped out reaching for 100%.

              Alternative: entryPrice + VE_TARGET_ATR_MULT × ATR(14)
              Use whichever is SMALLER (conservative).
```

**R:R Check**: `if (reward / risk) < MIN_RR_RATIO → reject`

### Confidence Scoring

```
patternScore      = VE_BASE_CONFIDENCE
                    (Fixed at 0.40 because ABCD detection is already
                    binary — the geometric structure either exists or
                    it doesn't. Strength comes from the secondary metrics.)

volPctScore       = (volPercentile - VE_MIN_VOL_PERCENTILE) / (100 - VE_MIN_VOL_PERCENTILE)
                    × VE_VOL_PCT_WEIGHT
                    Rationale: Higher volatility = more energy for D-point completion.

fibQuality        = 1.0 - |bcRetrace - 0.618| / 0.382
                    Rationale: B→C retracement closest to the golden ratio
                    (0.618) scores highest. This measures how "textbook" the
                    pattern is. Perfect golden ratio → 1.0. Edge of valid
                    range → 0.0.

fibScore          = fibQuality × VE_FIB_WEIGHT

volumeScore       = min(VE_MAX_VOL_BONUS,
                        (aPointVolume / avgVolume - 1) × VE_VOL_SCORE_RATE)

confidence        = clamp(patternScore + volPctScore + fibScore + volumeScore,
                           MIN_CONFIDENCE, MAX_CONFIDENCE)
```

### Constants

| Constant | Value | Type | Rationale |
|----------|-------|------|-----------|
| `VE_A_VOL_MULT` | 2.0 | Multiplier | A-point volume must be 2× average. The initial impulse must be significant. Same as existing `abcd_long` requirement. |
| `VE_MIN_VOL_PERCENTILE` | 80 | Percentile | Volatility above 80th percentile. Higher than adaptive_flow's 70 because this strategy specifically exploits extreme volatility. |
| `VE_BREAKOUT_BUFFER` | 0.002 | Fraction (0.2%) | Price must exceed C-point high by 0.2% to confirm breakout. |
| `VE_BREAKOUT_VOL_MULT` | 1.5 | Multiplier | Breakout volume at least 1.5× average. |
| `VE_STOP_BUFFER` | 0.003 | Fraction (0.3%) | Buffer below C-point low. Standard for pattern invalidation stops. |
| `VE_MEASURED_MOVE_MULT` | 0.90 | Multiplier | Take profit at 90% of measured move. Avoids the "last 10%" trap where price reverses just before hitting the theoretical target. |
| `VE_TARGET_ATR_MULT` | 2.5 | Multiplier | ATR-based target alternative. Use the smaller of measured move and ATR target. |
| `VE_BASE_CONFIDENCE` | 0.40 | Fixed | Baseline confidence for valid ABCD + high volatility. |
| `VE_VOL_PCT_WEIGHT` | 0.20 | Weight | Volatility percentile contributes up to 20% |
| `VE_FIB_WEIGHT` | 0.20 | Weight | Fibonacci quality contributes up to 20% |
| `VE_VOL_SCORE_RATE` | 0.05 | Rate | Each 1× excess volume at A-point adds 5% |
| `VE_MAX_VOL_BONUS` | 0.15 | Cap | Volume bonus capped at 15% |

### Variables

| Variable | Source | Range |
|----------|--------|-------|
| `aPointLow` | ABCD identification (impulse start) | Price level |
| `bPointHigh` | ABCD identification (impulse peak) | Price level |
| `cPointHigh` | ABCD identification (pullback peak) | Price level |
| `cPointLow` | ABCD identification (pullback trough) | Price level |
| `bcRetrace` | (bPointHigh - cPointLow) / (bPointHigh - aPointLow) | [0.382, 0.786] (valid Fib zone) |
| `aPointVolume` | Volume at A-point candle | ≥ 0 |
| `breakoutVolume` | Volume on C-breakout candle | ≥ 0 |
| `volPercentile` | Volatility percentile calculation | [0, 100] |
| `VWAP` | Technical indicators | Price level |
| `ATR(14)` | Technical indicators | > 0 |

---

## 12. Master Constants Table

All fixed coefficients used across all 8 strategies, in one place for review.

### Shared Constants

| Constant | Value | Used By | Category |
|----------|-------|---------|----------|
| `MIN_RR_RATIO` | 1.5 | All | Risk management |
| `ATR_PERIOD` | 14 | All | Volatility measurement |
| `VOLUME_BASELINE_PERIOD` | 20 | All | Volume comparison |
| `MIN_PATTERN_STRENGTH` | 0.55 | All (default) | Pattern quality gate |
| `ENTRY_PREMIUM_BPS` | 10 | All | Entry price offset |
| `MAX_CONFIDENCE` | 1.0 | All | Confidence ceiling |
| `MIN_CONFIDENCE` | 0.0 | All | Confidence floor |

### Strategy-Specific Constants

| Strategy | Constant | Value | Category |
|----------|----------|-------|----------|
| **morning_star** | MS_MIN_STRENGTH | 0.60 | Entry threshold |
| | MS_VOL_MULT | 1.2 | Volume gate |
| | MS_STOP_BUFFER | 0.003 | Stop placement |
| | MS_TARGET_ATR_MULT | 2.5 | Target placement |
| | MS_STRENGTH_WEIGHT | 0.80 | Confidence weight |
| | MS_HIGH_VOL_BONUS | 0.08 | Confidence bonus |
| | MS_GAP_BONUS | 0.07 | Confidence bonus |
| | MS_MAX_RECOVERY_BONUS | 0.05 | Confidence cap |
| **inside_bar_reversal** | IB_MAX_COMPRESSION | 0.75 | Entry threshold |
| | IB_BREAKOUT_BUFFER | 0.002 | Entry confirmation |
| | IB_VOL_MULT | 1.5 | Volume gate |
| | IB_STOP_BUFFER | 0.003 | Stop placement |
| | IB_TARGET_ATR_MULT | 2.0 | Target placement |
| | IB_COMPRESSION_WEIGHT | 0.35 | Confidence weight |
| | IB_STRENGTH_WEIGHT | 0.45 | Confidence weight |
| | IB_VOL_SCORE_RATE | 0.10 | Confidence rate |
| | IB_MAX_VOL_BONUS | 0.20 | Confidence cap |
| **support_bounce** | SB_LOOKBACK_CANDLES | 50 | Support identification |
| | SB_CLUSTER_TOLERANCE | 0.005 | Support identification |
| | SB_MIN_TOUCHES | 2 | Support qualification |
| | SB_MAX_DISTANCE | 0.03 | Support relevance |
| | SB_PROXIMITY | 0.015 | Entry threshold |
| | SB_VOL_MULT | 1.2 | Volume gate |
| | SB_STOP_BELOW_SUPPORT | 0.005 | Stop placement |
| | SB_TARGET_ATR_MULT | 2.0 | Target placement |
| | SB_PATTERN_WEIGHT | 0.40 | Confidence weight |
| | SB_SUPPORT_WEIGHT | 0.30 | Confidence weight |
| | SB_PROXIMITY_WEIGHT | 0.15 | Confidence weight |
| | SB_HIGH_VOL_BONUS | 0.08 | Confidence bonus |
| **pivot_shift** | PS_RSI_LOW | 40 | Entry threshold |
| | PS_RSI_HIGH | 60 | Entry threshold |
| | PS_ADX_SLOPE_MIN | 0.5 | Entry threshold |
| | PS_VOL_MULT | 1.3 | Volume gate |
| | PS_STOP_ATR_MULT | 1.5 | Stop placement |
| | PS_TARGET_ATR_MULT | 3.0 | Target placement |
| | PS_PATTERN_WEIGHT | 0.40 | Confidence weight |
| | PS_RSI_WEIGHT | 0.25 | Confidence weight |
| | PS_ADX_SCORE_RATE | 0.05 | Confidence rate |
| | PS_MAX_ADX_BONUS | 0.20 | Confidence cap |
| | PS_HIGH_VOL_BONUS | 0.08 | Confidence bonus |
| **reverse_impulse** | RI_MIN_STRENGTH | 0.65 | Entry threshold |
| | RI_MOMENTUM_THRESHOLD | -0.005 | Entry threshold |
| | RI_LOOKBACK | 5 | Entry lookback |
| | RI_VOL_MULT | 1.5 | Volume gate |
| | RI_RSI_MAX | 35 | Entry threshold |
| | RI_STOP_BUFFER | 0.005 | Stop placement |
| | RI_TARGET_ATR_MULT | 2.0 | Target placement |
| | RI_PATTERN_WEIGHT | 0.40 | Confidence weight |
| | RI_MOMENTUM_RATE | 10.0 | Confidence rate |
| | RI_MAX_MOMENTUM_BONUS | 0.20 | Confidence cap |
| | RI_RSI_WEIGHT | 0.25 | Confidence weight |
| | RI_EXTREME_VOL_BONUS | 0.10 | Confidence bonus |
| **defensive_hedge** | DH_CORR_WINDOW | 30 | Correlation calculation |
| | DH_VOL_WINDOW | 20 | Volatility calculation |
| | DH_MAX_CORRELATION | 0.30 | Entry threshold |
| | DH_MIN_VOL_OFFSET | 0.10 | Entry threshold |
| | DH_VOL_MULT | 1.3 | Volume gate |
| | DH_STOP_BUFFER | 0.005 | Stop placement |
| | DH_TARGET_ATR_MULT | 1.8 | Target placement |
| | DH_PATTERN_WEIGHT | 0.35 | Confidence weight |
| | DH_DECORR_WEIGHT | 0.30 | Confidence weight |
| | DH_VOL_OFFSET_RATE | 0.15 | Confidence rate |
| | DH_MAX_VOL_BONUS | 0.15 | Confidence cap |
| | DH_STRONG_ENGULF_BONUS | 0.08 | Confidence bonus |
| **adaptive_flow** | AF_LOOKBACK | 20 | Inversion lookback |
| | AF_MIN_INVERSIONS | 3 | Entry threshold |
| | AF_VOL_PERCENTILE_WINDOW | 50 | Percentile window |
| | AF_MIN_VOL_PERCENTILE | 70 | Entry threshold |
| | AF_VOL_MULT | 1.3 | Volume gate |
| | AF_STOP_ATR_MULT | 1.5 | Stop placement |
| | AF_TARGET_ATR_MULT | 3.0 | Target placement |
| | AF_PATTERN_WEIGHT | 0.35 | Confidence weight |
| | AF_INVERSION_RATE | 0.05 | Confidence rate |
| | AF_MAX_INVERSION_BONUS | 0.20 | Confidence cap |
| | AF_VOL_PCT_WEIGHT | 0.25 | Confidence weight |
| | AF_HIGH_VOL_BONUS | 0.08 | Confidence bonus |
| **volatility_edge** | VE_A_VOL_MULT | 2.0 | Volume gate |
| | VE_MIN_VOL_PERCENTILE | 80 | Entry threshold |
| | VE_BREAKOUT_BUFFER | 0.002 | Entry confirmation |
| | VE_BREAKOUT_VOL_MULT | 1.5 | Volume gate |
| | VE_STOP_BUFFER | 0.003 | Stop placement |
| | VE_MEASURED_MOVE_MULT | 0.90 | Target placement |
| | VE_TARGET_ATR_MULT | 2.5 | Target alternative |
| | VE_BASE_CONFIDENCE | 0.40 | Confidence base |
| | VE_VOL_PCT_WEIGHT | 0.20 | Confidence weight |
| | VE_FIB_WEIGHT | 0.20 | Confidence weight |
| | VE_VOL_SCORE_RATE | 0.05 | Confidence rate |
| | VE_MAX_VOL_BONUS | 0.15 | Confidence cap |

---

## 13. Master Variables Table

All dynamic inputs used by the strategies, their sources, and their value ranges.

| Variable | Source | Type | Range | Used By |
|----------|--------|------|-------|---------|
| `currentPrice` | Latest ticker | Price | > 0 | All |
| `ATR(14)` | Technical indicators | Volatility | > 0 | All |
| `avgVolume(20)` | Technical indicators | Volume | > 0 | All |
| `SMA(20)` | Technical indicators | Price | > 0 | morning_star |
| `RSI(14)` | Technical indicators | Oscillator | [0, 100] | inside_bar, pivot_shift, reverse_impulse |
| `ADX(14)` | Technical indicators | Trend strength | [0, 100] | pivot_shift |
| `VWAP` | Technical indicators | Price | > 0 | volatility_edge |
| `momentum` | calculatePairRegime() | Directional | [-0.05, 0.05] | reverse_impulse, adaptive_flow |
| `volatility` | calculatePairRegime() | Dispersion | [0, 0.1] | adaptive_flow, volatility_edge |
| `regime` | calculatePairRegime() | Categorical | 5 canonical values | All (filtering) |
| `patternSignal.strength` | Pattern Recognizer | Quality | [0.0, 1.0] | All |
| `patternSignal.metadata` | Pattern Recognizer | Diagnostic | Object | Varies |
| `btcReturns[]` | BTC price history | Returns | Unbounded | defensive_hedge |
| `assetReturns[]` | Asset price history | Returns | Unbounded | defensive_hedge |
| `priceHistory[]` | Kraken OHLCV | Candle array | Variable length | All |

---

## 14. Review Checklist for Auditing LLMs

When reviewing this specification, please verify the following for each strategy:

### Mathematical Correctness
- [ ] Are all formulas dimensionally consistent? (prices compared to prices, ratios compared to ratios)
- [ ] Can any confidence score exceed 1.0 or go below 0.0? (must be clamped)
- [ ] Does the R:R check correctly reject signals below 1.5?
- [ ] Are stop prices always between the entry and the invalidation level?
- [ ] Can the target price formula ever produce a target BELOW the entry price for a BUY signal?

### Constant Reasonableness
- [ ] Are volume multipliers in a reasonable range (1.0-3.0)?
- [ ] Are ATR target multipliers consistent with the strategy's risk profile? (counter-trend = tighter, trend-following = wider)
- [ ] Do confidence weights sum to a value that allows confidence to reach 0.6-0.8 for strong signals? (not too high, not too low)
- [ ] Are threshold values consistent with the regime's characteristics? (BEAR_VOLATILE thresholds should be stricter than BULL_STABLE)

### Signal Quality
- [ ] Does each strategy require at least 3 independent conditions? (prevents false positives)
- [ ] Is there a volume confirmation in every strategy? (no "phantom" signals on zero volume)
- [ ] Does the confidence scoring reward independent factors, not correlated factors?
- [ ] Are the entry/stop/target levels based on market structure (not arbitrary percentages)?

### Architectural Consistency
- [ ] Does each strategy produce the same StrategySignal output format?
- [ ] Are pattern type requirements consistent with the canonical regime-strategy map?
- [ ] Do regime assignments match the canonical map exactly?
- [ ] Are all input variables available from existing DawnTrader infrastructure?

### Risk Management
- [ ] Counter-trend strategies (reverse_impulse, defensive_hedge) have tighter targets and stricter entry requirements than trend-following strategies
- [ ] BEAR_VOLATILE strategies have wider stop buffers to account for noise
- [ ] LOW_VOL_CHOP strategies have tighter stops (smaller ATR) but wider R:R targets (breakout potential)
- [ ] No strategy can produce signals with R:R below 1.5

---

*This document is a DRAFT specification for multi-LLM review. No code should be written until all reviewing parties agree on the mathematics, constants, and methodology described above.*
