# Strategy Signal Generation Specification — Directive 12.3.2

> **Date**: 2026-03-03
> **Author**: Claude Code (System Cartographer)
> **Revision**: FINAL — Incorporates all 30 multi-LLM consensus decisions from Round 2
> **Reviewers**: xAI (Grok), Google Gemini, ChatGPT (OpenAI), Claude (Anthropic)
> **Purpose**: Complete mathematical specification for the 8 strategies that lack full signal generation implementations. All formulas, constants, and methodology have been vetted through a two-round multi-LLM review process and are ready for implementation.
> **Status**: APPROVED — Ready for implementation

---

## Change Log (vs. Draft)

| ID | Category | Change | Rationale |
|----|----------|--------|-----------|
| BUG-1 | Bug fix | `pivot_shift` stop: `min()` → `max()`, use `entryPrice` consistently | Selects tighter (closer to entry) stop for BUY signals |
| BUG-2 | Bug fix | `support_bounce` proximity score: add `max(0, ...)` floor | Prevents negative score if price drifts past boundary |
| BUG-3 | Bug fix | `reverse_impulse` confidence: use `minMomentum(lookback)` not current momentum | Scores the spike that triggered entry, not recovered value |
| BUG-4 | Bug fix | `volatility_edge` fibQuality: add `max(0, ...)` floor | Prevents negative quality for degenerate retracements |
| BUG-5 | Bug fix | `pivot_shift` ADX score: add `max(0, ...)` floor | Defense-in-depth against negative slope edge cases |
| BUG-6 | Bug fix | `volatility_edge` target base: `cPointLow` at 0.85 multiplier | Compromise: textbook base (cPointLow) with tighter multiplier to maintain conservatism |
| GUARD-1 | Safeguard | Add `MIN_STOP_DISTANCE_BPS = 20` (0.2% minimum) | Prevents absurdly tight stops from spread/tick noise |
| GUARD-2 | Safeguard | ATR: reject below 0.1% of price, clamp at 10% ceiling | Filters dead assets; caps flash-crash ATR |
| GUARD-4 | Safeguard | Keep `MIN_RR_RATIO = 1.5` | Canonical cost model handles fees downstream; avoid duplicating |
| CAL-1 | Calibration | Cluster tolerance: `max(0.005, ATR(14)/price × 0.5)` | ATR-scaled tolerance adapts to each asset's volatility |
| CAL-2 | Calibration | `SB_MIN_TOUCHES`: 2 → 3 | In LOW_VOL_CHOP, 3 touches is achievable and meaningfully more robust |
| CAL-3 | Calibration | `adaptive_flow`: add `ADX(14) < 25` condition | Explicit anti-trend gate; prevents firing during trending markets with minor pullbacks |
| CAL-4 | Calibration | Keep `DH_CORR_WINDOW = 30`, switch to Spearman rank | 30 is regime-relevant for crypto; Spearman is robust to outliers |
| CAL-5 | Calibration | ADX slope: 2 consecutive positive slopes ≥ 0.5 | Persistence test matches ADX's lagging nature better than single threshold |
| CAL-6 | Calibration | Keep `MS_VOL_MULT = 1.2` | Reversals rely on structure, not volume explosions |
| CAL-7 | Calibration | Keep `VE_TARGET_ATR_MULT = 2.5` | ATR target is a fallback cap; measured move usually governs |
| CAL-8 | Calibration | Keep `MIN_RR_RATIO = 1.5` for counter-trend | Revisit after backtesting reveals actual win rates |
| CAL-9 | Calibration | DH weights: pattern 0.35→0.45, decorrelation 0.30→0.25 | Prevents cliff-like dropoff near correlation threshold |
| CAL-10 | Calibration | `adaptive_flow` stop: add structure anchor (pattern low) | Every other strategy anchors stops to market structure |
| CAL-11 | Calibration | `DH_MAX_CORRELATION = 0.30` with conditional raise | Start strict; raise to 0.40 if <1 signal per 500 evaluation cycles |
| ENH-1 | Enhancement | Add regime filtering note at orchestrator level | Clarifies regime check happens before strategy evaluation |
| ENH-2 | Enhancement | Defer MS SMA distance filter to backtesting | Let data determine if/when the filter is needed |
| ENH-3 | Enhancement | IB SELL RSI filter: 35 → 45 | Prevents selling near oversold territory |
| ENH-4 | Enhancement | Defer regime stability filter to backtesting | System-level governance already handles regime transitions |
| ENH-5 | Enhancement | Add BTC self-correlation short-circuit | Avoids wasted computation on BTC/USD pair |
| ENH-6 | Enhancement | Keep `VE_MEASURED_MOVE_MULT` fixed (not dynamic) | Dynamic scaling is speculative; test in backtesting first. Note: fixed value changed from 0.90 to 0.85 per BUG-6 (cPointLow base requires tighter multiplier). |
| ENH-7 | Enhancement | Switch to Spearman rank correlation | Covered by CAL-4; more robust to flash crashes |
| ENH-8 | Enhancement | Add confidence bounds table | Aids implementation verification |
| ENH-9 | Enhancement | Add BUY-only design note | Clarifies intentional long-only design for most strategies |
| ENH-10 | Enhancement | `RI_MOMENTUM_THRESHOLD`: -0.005 → -0.01 | Better mathematical separation from RSI condition (3/4 majority) |

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
14. [Confidence Bounds Table](#14-confidence-bounds-table)
15. [Deferred Items (Backtesting Candidates)](#15-deferred-items)
16. [Review Checklist for Auditing LLMs](#16-review-checklist)

---

## 1. Architecture Overview

### The Three Signal Lanes

DawnTrader generates trade signals through three lanes:

| Lane | How It Works | Example |
|------|-------------|---------|
| **QUANT** | Pure math — technical indicators (VWAP, SMA, volume ratios, price levels) produce entry/exit levels | `vwap_pullback`: Price pulls back to VWAP, volume confirms, enter long |
| **PATTERN** | Candlestick formation recognition — visual price shapes produce entry/exit levels | `morning_star`: Three-candle reversal pattern detected, enter long on completion |
| **HYBRID** | Confluence — a pattern detection AND a quant condition must BOTH be true simultaneously | `pivot_shift`: Morning star pattern detected AND RSI in neutral zone AND ADX slope rising — enter long with higher confidence because two independent signals agree |

### Why Hybrid Strategies Exist

A single signal source can produce false positives. A VWAP pullback that happens to coincide with a morning star pattern is a stronger trade than either signal alone — two independent methods agree. Hybrid strategies formalize this confluence requirement.

### Regime Filtering (ENH-1)

> **Important**: Regime filtering occurs at the **Signal Orchestrator** level, BEFORE strategy evaluation. Each strategy is only invoked when the current canonical regime (from `calculatePairRegime()`) matches the strategy's regime assignment in the canonical regime-strategy map. Individual strategies do NOT need to re-check their regime — the orchestrator guarantees correct regime context.

### Direction Design Note (ENH-9)

> **Design decision**: All strategies in this specification are **BUY-only** except `inside_bar_reversal`, which has explicit SELL logic. This is intentional — crypto trading systems overwhelmingly favor long positions due to market structure (perpetual upward drift in liquid assets, funding rate dynamics, broader adoption trends). SELL signals for additional strategies may be added in future iterations if backtesting demonstrates sufficient edge.

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

**Minimum R:R = 1.5** for all strategies (GUARD-4). If a strategy's calculated target produces R:R < 1.5, the signal is rejected (return null).

> **Note on fees**: The R:R check is a PRE-filter. DawnTrader's canonical cost model (`isSignalProfitable()`) handles entry/exit fees and slippage downstream. The 1.5 threshold is structural, not fee-adjusted. This avoids duplicating fee logic and prevents drift if exchange fee tiers change.

### Minimum Stop Distance (GUARD-1)

All strategies must enforce a minimum distance between entry and stop:

```
MIN_STOP_DISTANCE_BPS = 20  (0.2% minimum)

After calculating stopPrice:
  if |entryPrice - stopPrice| / entryPrice < MIN_STOP_DISTANCE_BPS / 10000:
    reject signal (return null)
```

This prevents absurdly tight stops that would be hit by the bid-ask spread alone, and protects against divide-by-zero in R:R calculations.

### ATR — The Universal Volatility Ruler (GUARD-2)

Most stop/target calculations use ATR (Average True Range) — a measure of how much a price typically moves per candle. ATR adapts to each asset's volatility automatically.

```
True Range (per candle) = max(high - low, |high - prevClose|, |low - prevClose|)
ATR(N) = Simple Moving Average of True Range over N candles
```

Default period: **N = 14 candles** (standard, used by existing quant strategies).

**ATR Guard Rails**:
```
ATR_MIN_RATIO = 0.001   (0.1% of price)
ATR_MAX_RATIO = 0.10    (10% of price)

Before using ATR in any calculation:
  if ATR(14) < currentPrice × ATR_MIN_RATIO:
    REJECT signal entirely (return null)
    — Asset is too flat to trade (stablecoin, dead pair, or data stale)

  effectiveATR = min(ATR(14), currentPrice × ATR_MAX_RATIO)
    — Clamp at ceiling for flash-crash scenarios

All strategy formulas below use effectiveATR (referred to simply as ATR(14) for readability).
```

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
  4. Volume > 1.5 x avgVolume                  (participation confirmation)

EXIT LEVELS:
  - Stop:   min(VWAP x 0.997, low24h x 1.001)
  - Target: max(high24h x 0.995, entry + 2 x risk)

CONFIDENCE:
  - Base: 0.70
  - +0.10 if volume > 2.0 x avgVolume
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
| `MIN_RR_RATIO` | 1.5 | Minimum reward-to-risk. Structural pre-filter; canonical cost model handles fees downstream. |
| `ATR_PERIOD` | 14 | Industry standard for ATR. Matches existing quant strategies. |
| `VOLUME_BASELINE_PERIOD` | 20 | 20-candle average volume for comparison. Matches existing strategies. |
| `MIN_PATTERN_STRENGTH` | 0.55 | Below this, pattern detection is too ambiguous to trade on. Derived from existing pattern recognizer's typical output range (0.6-0.95 for valid patterns). |
| `ENTRY_PREMIUM_BPS` | 10 | 0.1% (10 basis points) above current price for limit entry. Matches existing quant strategies. |
| `MAX_CONFIDENCE` | 1.0 | Hard ceiling for confidence scoring. |
| `MIN_CONFIDENCE` | 0.0 | Hard floor for confidence scoring. |
| `MIN_STOP_DISTANCE_BPS` | 20 | 0.2% minimum stop distance. Prevents spread-triggered stops. (GUARD-1) |
| `ATR_MIN_RATIO` | 0.001 | 0.1% of price — below this, reject signal entirely. (GUARD-2) |
| `ATR_MAX_RATIO` | 0.10 | 10% of price — clamp ATR ceiling for calculations. (GUARD-2) |

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

> **Deferred (ENH-2)**: Distance-from-SMA filter (`(SMA - currentPrice) / SMA > 0.05` rejection). To be evaluated in backtesting — may help filter falling knife scenarios but the threshold needs empirical calibration.

### Exit Levels

```
entryPrice  = currentPrice x (1 + ENTRY_PREMIUM_BPS / 10000)
            = currentPrice x 1.001

stopPrice   = min(c2Low, c1Low) x (1 - MS_STOP_BUFFER)
            = lowest point of the star or the first candle, minus a small buffer

            Rationale: If price drops below the star's low, the reversal has
            failed. The stop sits just below the lowest point of the formation.

targetPrice = entryPrice + MS_TARGET_ATR_MULT x ATR(14)

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

**Stop Distance Check (GUARD-1)**:
```
if (entryPrice - stopPrice) / entryPrice < MIN_STOP_DISTANCE_BPS / 10000 → reject
```

### Confidence Scoring

```
baseConfidence = patternSignal.strength x MS_STRENGTH_WEIGHT

volumeBonus    = if c3Volume >= avgVolume x 2.0 then MS_HIGH_VOL_BONUS else 0

gapBonus       = if patternSignal.metadata.hasGap then MS_GAP_BONUS else 0

recoveryBonus  = min(MS_MAX_RECOVERY_BONUS, patternSignal.metadata.recoveryRatio x 0.05)
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
| `MS_VOL_MULT` | 1.2 | Multiplier | Candle 3 volume must be at least 1.2x average. Lower than breakout's 2.0x because reversal doesn't require as much momentum as a breakout. (CAL-6: confirmed, reversals rely on structure not volume explosions.) |
| `MS_STOP_BUFFER` | 0.003 | Fraction (0.3%) | Buffer below formation low. Prevents stop hunting on minor wicks. Consistent with existing strategies (0.2-0.5% range). |
| `MS_TARGET_ATR_MULT` | 2.5 | Multiplier | Target at 2.5x ATR from entry. Consistent with existing `patternToTradeSignal()` default. |
| `MS_STRENGTH_WEIGHT` | 0.80 | Weight | Pattern strength accounts for 80% of base confidence. Pattern is the primary signal. |
| `MS_HIGH_VOL_BONUS` | 0.08 | Additive | +8% confidence for exceptional volume (2x average). |
| `MS_GAP_BONUS` | 0.07 | Additive | +7% confidence if a gap exists between candle 1 and the star. Gaps indicate stronger sentiment shift. |
| `MS_MAX_RECOVERY_BONUS` | 0.05 | Additive cap | Maximum +5% from recovery ratio. Prevents single metric domination. |

### Variables

| Variable | Source | Range |
|----------|--------|-------|
| `patternSignal.strength` | Pattern Recognizer | [0.0, 1.0] |
| `c2Low` | Pattern metadata (star candle low) | Price level |
| `c1Low` | Pattern metadata (first candle low) | Price level |
| `c3Volume` | Price history (third candle volume) | >= 0 |
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
| 3 | Breakout confirmation | `currentPrice > parentHigh x (1 + IB_BREAKOUT_BUFFER)` (for BUY) or `currentPrice < parentLow x (1 - IB_BREAKOUT_BUFFER)` (for SELL) | We don't enter on the inside bar itself — we wait for price to break out of the parent bar's range. The buffer prevents false breakouts on minor wicks. |
| 4 | Breakout volume confirmation | `breakoutVolume >= avgVolume(20) x IB_VOL_MULT` | The breakout candle must have above-average volume. Low-volume breakouts frequently reverse (fakeouts). |
| 5 | Direction filter | For BUY: `RSI(14) < 65`. For SELL: `RSI(14) > 45` (ENH-3). | Prevents buying into overbought or selling into oversold conditions. SELL threshold raised from 35 to 45 to prevent selling near oversold territory where downward momentum is typically exhausted. |

### Exit Levels

```
FOR BUY SIGNALS:
  entryPrice  = parentHigh x (1 + IB_BREAKOUT_BUFFER)
              Rationale: Enter at the breakout level, not the current price.
              This ensures we're only in the trade if the breakout is confirmed.

  stopPrice   = parentLow x (1 - IB_STOP_BUFFER)
              Rationale: If price returns below the parent bar's low, the
              compression breakout has completely failed. Stop sits just
              below the parent low.

  targetPrice = entryPrice + IB_TARGET_ATR_MULT x ATR(14)

FOR SELL SIGNALS:
  entryPrice  = parentLow x (1 - IB_BREAKOUT_BUFFER)
  stopPrice   = parentHigh x (1 + IB_STOP_BUFFER)
  targetPrice = entryPrice - IB_TARGET_ATR_MULT x ATR(14)
```

**R:R Check**: `if (reward / risk) < MIN_RR_RATIO → reject`
**Stop Distance Check (GUARD-1)**: `if |entryPrice - stopPrice| / entryPrice < MIN_STOP_DISTANCE_BPS / 10000 → reject`

### Confidence Scoring

```
compressionScore = (1 - compressionRatio) x IB_COMPRESSION_WEIGHT
                   Rationale: Lower compressionRatio = tighter coil = more energy.
                   A ratio of 0.5 (inner bar is half the parent) gives a higher
                   score than 0.7 (inner bar is 70% of parent).

volumeScore      = min(IB_MAX_VOL_BONUS,
                       (breakoutVolume / avgVolume - 1) x IB_VOL_SCORE_RATE)
                   Rationale: More volume = more conviction. Scaled linearly
                   from the excess volume ratio, capped to prevent domination.

strengthScore    = patternSignal.strength x IB_STRENGTH_WEIGHT

confidence       = clamp(compressionScore + volumeScore + strengthScore,
                          MIN_CONFIDENCE, MAX_CONFIDENCE)
```

### Constants

| Constant | Value | Type | Rationale |
|----------|-------|------|-----------|
| `IB_MAX_COMPRESSION` | 0.75 | Threshold | Inner bar must be <=75% of parent range. Filters out "barely inside" bars that lack meaningful compression. |
| `IB_BREAKOUT_BUFFER` | 0.002 | Fraction (0.2%) | Price must exceed parent high/low by 0.2% to confirm breakout. Prevents noise triggers. |
| `IB_VOL_MULT` | 1.5 | Multiplier | Breakout volume must be 1.5x average. Higher than morning_star (1.2x) because breakouts need volume conviction. |
| `IB_STOP_BUFFER` | 0.003 | Fraction (0.3%) | Buffer below parent low for stop. Matches other strategy stop buffers. |
| `IB_TARGET_ATR_MULT` | 2.0 | Multiplier | Target at 2.0x ATR. Slightly lower than morning_star (2.5x) because inside bar breakouts in BEAR_VOLATILE regime have shorter follow-through. |
| `IB_COMPRESSION_WEIGHT` | 0.35 | Weight | Compression ratio contributes up to 35% of confidence. |
| `IB_STRENGTH_WEIGHT` | 0.45 | Weight | Pattern strength contributes up to 45% of confidence. |
| `IB_VOL_SCORE_RATE` | 0.10 | Rate | Each 1x excess volume adds 10% to confidence. |
| `IB_MAX_VOL_BONUS` | 0.20 | Cap | Volume bonus capped at 20%. |
| `IB_SELL_RSI_MIN` | 45 | Threshold | SELL signals require RSI > 45 (ENH-3). Prevents selling into oversold conditions. |

### Variables

| Variable | Source | Range |
|----------|--------|-------|
| `compressionRatio` | Pattern metadata | [0.0, 1.0] — lower = tighter |
| `parentHigh` | Pattern metadata (previous candle high) | Price level |
| `parentLow` | Pattern metadata (previous candle low) | Price level |
| `breakoutVolume` | Current candle volume | >= 0 |
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

STEP 2: Cluster nearby levels (CAL-1: ATR-scaled)
  Cluster tolerance is ATR-adaptive:
    clusterTolerance = max(SB_CLUSTER_TOLERANCE_BASE, ATR(14) / currentPrice x 0.5)

  Group minima that are within clusterTolerance of each other:
    |level_a - level_b| / level_a <= clusterTolerance

  Each cluster's support level = average of the cluster's minima.

  Rationale: Fixed 0.5% was too tight for volatile assets. For BTC at $90K
  with ATR $900 (1%), tolerance becomes max(0.5%, 0.5%) = 0.5%. For BTC
  at $90K with ATR $1800 (2%), tolerance becomes max(0.5%, 1.0%) = 1.0%.
  Adapts to each asset's volatility.

STEP 3: Score support levels
  supportScore = touchCount / SB_MIN_TOUCHES

  A support level with 4 touches (bounces) in the lookback window scores
  4/3 = 1.33 (capped at 1.0 for confidence contribution).

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
| 5 | Volume on bounce candle | `bounceVolume >= avgVolume(20) x SB_VOL_MULT` | Volume confirms real buying interest at support, not just a passive drift |

### Exit Levels

```
entryPrice  = currentPrice x (1 + ENTRY_PREMIUM_BPS / 10000)

stopPrice   = supportLevel x (1 - SB_STOP_BELOW_SUPPORT)
              Rationale: If price breaks below the support level, the support
              has failed. Stop sits just below support with a buffer for wicks.

targetPrice = entryPrice + SB_TARGET_ATR_MULT x ATR(14)
              Alternative: If a resistance level is identified above, use
              min(resistanceLevel x 0.995, entryPrice + SB_TARGET_ATR_MULT x ATR(14))
```

**R:R Check**: `if (reward / risk) < MIN_RR_RATIO → reject`
**Stop Distance Check (GUARD-1)**: `if (entryPrice - stopPrice) / entryPrice < MIN_STOP_DISTANCE_BPS / 10000 → reject`

### Confidence Scoring

```
patternScore   = patternSignal.strength x SB_PATTERN_WEIGHT

supportScore   = min(1.0, touchCount / SB_MIN_TOUCHES) x SB_SUPPORT_WEIGHT
                 Rationale: More touches = more tested support = higher confidence.
                 A level with 4 touches scores higher than one with 3 touches.

proximityScore = max(0, (1 - (currentPrice - supportLevel) / (supportLevel x SB_PROXIMITY)))
                 x SB_PROXIMITY_WEIGHT
                 Rationale: Closer to support = better entry = higher confidence.
                 (BUG-2 FIX: max(0, ...) prevents negative score if price drifts
                 slightly past proximity boundary between condition check and
                 confidence calculation.)

volumeBonus    = if bounceVolume >= avgVolume x 2.0 then SB_HIGH_VOL_BONUS else 0

confidence     = clamp(patternScore + supportScore + proximityScore + volumeBonus,
                        MIN_CONFIDENCE, MAX_CONFIDENCE)
```

### Constants

| Constant | Value | Type | Rationale |
|----------|-------|------|-----------|
| `SB_LOOKBACK_CANDLES` | 50 | Count | Look back 50 candles (~2 days on 1h chart) to identify support levels. Long enough to capture meaningful bounces, short enough to be relevant. |
| `SB_CLUSTER_TOLERANCE_BASE` | 0.005 | Fraction (0.5%) | Minimum clustering tolerance. ATR-scaled formula may produce higher values: `max(0.005, ATR(14)/currentPrice x 0.5)`. (CAL-1) |
| `SB_MIN_TOUCHES` | 3 | Count | Support must have been tested at least three times. (CAL-2: increased from 2. In LOW_VOL_CHOP, price oscillates in a range, making 3 touches achievable and meaningfully more reliable.) |
| `SB_MAX_DISTANCE` | 0.03 | Fraction (3%) | Support level must be within 3% of current price. Beyond this, the level is too far away to be immediately relevant. |
| `SB_PROXIMITY` | 0.015 | Fraction (1.5%) | Price must be within 1.5% of support to trigger. We want entries near the bounce point, not halfway between support and resistance. |
| `SB_VOL_MULT` | 1.2 | Multiplier | Bounce volume at least 1.2x average. Lower threshold than breakout strategies because bounces are quieter events. |
| `SB_STOP_BELOW_SUPPORT` | 0.005 | Fraction (0.5%) | Stop placed 0.5% below support level. Slightly wider than other strategies because support levels are approximate. |
| `SB_TARGET_ATR_MULT` | 2.0 | Multiplier | Target at 2.0x ATR from entry. Conservative — LOW_VOL_CHOP regime (where this strategy runs) has muted moves. |
| `SB_PATTERN_WEIGHT` | 0.40 | Weight | Pattern strength contributes 40% of confidence. |
| `SB_SUPPORT_WEIGHT` | 0.30 | Weight | Support quality contributes 30% of confidence. |
| `SB_PROXIMITY_WEIGHT` | 0.15 | Weight | Entry proximity contributes 15% of confidence. |
| `SB_HIGH_VOL_BONUS` | 0.08 | Additive | +8% for exceptional bounce volume (2x average). |

### Variables

| Variable | Source | Range |
|----------|--------|-------|
| `supportLevel` | Support identification algorithm | Price level or null |
| `touchCount` | Support identification algorithm | >= 3 (by filter) |
| `patternSignal.strength` | Pattern Recognizer (PINBAR) | [0.0, 1.0] |
| `bounceVolume` | Current candle volume | >= 0 |
| `currentPrice` | Latest ticker | > 0 |
| `ATR(14)` | Technical indicators | > 0 |

---

## Strategy #4: pivot_shift (HYBRID)

### Concept

A pivot shift detects a market that is transitioning from one regime to another — specifically, a market that was ranging or declining but is now showing early signs of a bullish trend (a "pivot"). It requires BOTH a morning star reversal pattern AND quantitative confirmation that the trend is starting to shift (RSI in neutral zone, ADX slope turning positive with persistence).

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
| 4 | ADX slope positive (persistent) | `ADX(14)[current] - ADX(14)[prev] >= PS_ADX_SLOPE_MIN AND ADX(14)[prev] - ADX(14)[prev-1] >= PS_ADX_SLOPE_MIN` | (CAL-5) ADX slope must be >= 0.5 for TWO consecutive candles. ADX is a lagging oscillator that builds slowly — a single positive reading could be a volatility expansion event (one big candle), not sustained trend formation. Two consecutive readings prove persistence, which is what ADX is designed to capture. |
| 5 | Volume confirmation | `currentVolume >= avgVolume(20) x PS_VOL_MULT` | Institutional interest in the pivot |

### Why Both Conditions Matter

The morning star alone could be noise — it has a natural false positive rate. RSI and ADX alone could indicate a trend starting, but starting trends frequently fail. Together:
- Morning star = "the car is turning around"
- RSI neutral = "it has room to accelerate"
- ADX slope positive (persistent) = "it's actually gaining speed, not just a bump"

This triple confirmation filters out most false starts.

### Exit Levels

```
entryPrice  = currentPrice x (1 + ENTRY_PREMIUM_BPS / 10000)

stopPrice   = max(morningStarLow, entryPrice - PS_STOP_ATR_MULT x ATR(14))
              (BUG-1 FIX: Changed from min() to max(). For a BUY signal, both
              candidates are below entry. The "tighter" stop (closer to entry)
              is the HIGHER value. max() selects the tighter stop. Also
              changed from currentPrice to entryPrice for consistency.)

              Rationale: Use the tighter of two stops — the morning star
              formation low OR an ATR-based stop. The tighter stop limits
              risk while still respecting pattern structure.

targetPrice = entryPrice + PS_TARGET_ATR_MULT x ATR(14)
              Rationale: Pivot shifts in trending regimes get wider targets
              (3.0x ATR) because the new trend has room to develop.
```

**R:R Check**: `if (reward / risk) < MIN_RR_RATIO → reject`
**Stop Distance Check (GUARD-1)**: `if (entryPrice - stopPrice) / entryPrice < MIN_STOP_DISTANCE_BPS / 10000 → reject`

### Confidence Scoring

```
patternScore    = patternSignal.strength x PS_PATTERN_WEIGHT

rsiScore        = (1 - |RSI(14) - 50| / 50) x PS_RSI_WEIGHT
                  Rationale: RSI closest to 50 (perfect neutral) scores highest.
                  RSI at 50 → factor = 1.0. RSI at 40 or 60 → factor = 0.8.
                  This rewards the most neutral starting position.

adxSlopeScore   = max(0, min(PS_MAX_ADX_BONUS, adxSlope x PS_ADX_SCORE_RATE))
                  (BUG-5 FIX: Added max(0, ...) floor. Entry condition already
                  requires positive slope, but this provides defense-in-depth
                  against edge cases where slope turns negative between condition
                  check and confidence calculation.)

volumeBonus     = if currentVolume >= avgVolume x 2.0 then PS_HIGH_VOL_BONUS else 0

confidence      = clamp(patternScore + rsiScore + adxSlopeScore + volumeBonus,
                         MIN_CONFIDENCE, MAX_CONFIDENCE)
```

### Constants

| Constant | Value | Type | Rationale |
|----------|-------|------|-----------|
| `PS_RSI_LOW` | 40 | Threshold | RSI below 40 = still oversold, reversal may not stick |
| `PS_RSI_HIGH` | 60 | Threshold | RSI above 60 = approaching overbought, limited upside |
| `PS_ADX_SLOPE_MIN` | 0.5 | Threshold | ADX must increase by at least 0.5 points for TWO consecutive candles (CAL-5). Persistence test aligned with ADX's lagging nature. |
| `PS_VOL_MULT` | 1.3 | Multiplier | Volume at least 1.3x average. Moderate requirement — pivots are transitions, not explosions. |
| `PS_STOP_ATR_MULT` | 1.5 | Multiplier | ATR-based stop at 1.5x ATR below entry. Standard for trend-following entries. |
| `PS_TARGET_ATR_MULT` | 3.0 | Multiplier | Target at 3.0x ATR. Wider than pattern strategies because pivot shift catches early trend moves with more room to develop. |
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
| `ADX(14)` | Technical indicators (current + 2 previous) | [0, 100] |
| `adxSlope` | ADX[current] - ADX[prev] | Can be negative (rejected by entry condition) |
| `morningStarLow` | Pattern metadata (lowest point) | Price level |
| `currentVolume` | Current candle | >= 0 |
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
| 3 | Recent momentum spike down | `minMomentum(RI_LOOKBACK) <= RI_MOMENTUM_THRESHOLD` | Momentum must have spiked below -1.0% within the lookback window (ENH-10: tightened from -0.5%). This confirms a violent move happened (not a slow grind). The stricter threshold provides better mathematical separation from the RSI condition — momentum measures "violence of the move" while RSI measures "depth of displacement." |
| 4 | Volume spike on rejection | `pinbarVolume >= avgVolume(20) x RI_VOL_MULT` | The rejection candle (pinbar) must have high volume. High volume on a rejection = large participants defending a level. |
| 5 | RSI in oversold zone | `RSI(14) < RI_RSI_MAX` | RSI below 35 confirms the market is stretched to the downside. We're buying when others are panic-selling. |

### Why Counter-Trend Works Here

Normally, trading against the trend is dangerous. This strategy mitigates that risk by requiring THREE independent confirmations of exhaustion: (1) the price action itself rejected (pinbar), (2) the move was violent (momentum spike), (3) the rejection had conviction (volume spike), and (4) the market is stretched (RSI oversold). All four agreeing significantly reduces false positive rate.

### Exit Levels

```
entryPrice  = currentPrice x (1 + ENTRY_PREMIUM_BPS / 10000)

stopPrice   = pinbarLow x (1 - RI_STOP_BUFFER)
              Rationale: The pinbar's lower wick tip is where selling was
              rejected. If price goes below that level, the rejection failed.
              Buffer for volatility noise in BEAR_VOLATILE regime.

targetPrice = entryPrice + RI_TARGET_ATR_MULT x ATR(14)
              Rationale: Conservative target (2.0x ATR) because this is a
              counter-trend trade. We're capturing the snap-back, not
              predicting a full reversal.
```

**R:R Check**: `if (reward / risk) < MIN_RR_RATIO → reject`
**Stop Distance Check (GUARD-1)**: `if (entryPrice - stopPrice) / entryPrice < MIN_STOP_DISTANCE_BPS / 10000 → reject`

### Confidence Scoring

```
patternScore    = patternSignal.strength x RI_PATTERN_WEIGHT

momentumScore   = min(RI_MAX_MOMENTUM_BONUS,
                      |minMomentum(RI_LOOKBACK) - RI_MOMENTUM_THRESHOLD| x RI_MOMENTUM_RATE)
                  (BUG-3 FIX: Uses minMomentum(RI_LOOKBACK) — the minimum
                  momentum value from the lookback window that triggered entry —
                  not the current candle's momentum which may have recovered.)
                  Rationale: The further below threshold, the more overextended
                  the move was, the stronger the snap-back signal.

rsiScore        = (1 - RSI(14) / 100) x RI_RSI_WEIGHT
                  Rationale: Lower RSI = more oversold = more stretched.
                  RSI 20 scores higher than RSI 30.

volumeBonus     = if pinbarVolume >= avgVolume x 2.5 then RI_EXTREME_VOL_BONUS else 0

confidence      = clamp(patternScore + momentumScore + rsiScore + volumeBonus,
                         MIN_CONFIDENCE, MAX_CONFIDENCE)
```

### Constants

| Constant | Value | Type | Rationale |
|----------|-------|------|-----------|
| `RI_MIN_STRENGTH` | 0.65 | Threshold | Higher bar for counter-trend. Must be a clear rejection. |
| `RI_MOMENTUM_THRESHOLD` | -0.01 | Threshold (-1.0%) | (ENH-10: tightened from -0.005.) Momentum must spike below -1.0%. Stricter threshold provides better mathematical separation from RSI condition — reduces overlap from ~60% to ~30%. Momentum becomes the "violence of the move" filter; RSI handles "depth of displacement." (3/4 majority) |
| `RI_LOOKBACK` | 5 | Candles | Check last 5 candles for momentum spike. ~5 hours on 1h chart — captures the impulse move. |
| `RI_VOL_MULT` | 1.5 | Multiplier | Pinbar volume at least 1.5x average. The rejection must have participation. |
| `RI_RSI_MAX` | 35 | Threshold | RSI must be below 35 (oversold territory). |
| `RI_STOP_BUFFER` | 0.005 | Fraction (0.5%) | Wider stop buffer for BEAR_VOLATILE regime. Volatile markets need more room. |
| `RI_TARGET_ATR_MULT` | 2.0 | Multiplier | Conservative target. Counter-trend trades should take profit quickly. (CAL-8: confirmed at 1.5 R:R minimum, revisit after backtesting.) |
| `RI_PATTERN_WEIGHT` | 0.40 | Weight | Pattern contributes 40% |
| `RI_MOMENTUM_RATE` | 10.0 | Rate | Each 0.1% beyond threshold adds 10% x 0.001 = 1% confidence |
| `RI_MAX_MOMENTUM_BONUS` | 0.20 | Cap | Momentum capped at 20% |
| `RI_RSI_WEIGHT` | 0.25 | Weight | RSI oversold contributes up to 25% |
| `RI_EXTREME_VOL_BONUS` | 0.10 | Additive | +10% for extreme volume (2.5x average) |

### Variables

| Variable | Source | Range |
|----------|--------|-------|
| `patternSignal.strength` | Pattern Recognizer (PINBAR) | [0.0, 1.0] |
| `pinbarLow` | Pattern metadata (wick low) | Price level |
| `pinbarVolume` | Pinbar candle volume | >= 0 |
| `minMomentum(RI_LOOKBACK)` | Min of momentum values over lookback window | Typically [-0.05, 0] |
| `RSI(14)` | Technical indicators | [0, 100] |
| `ATR(14)` | Technical indicators | > 0 |

---

## Strategy #6: defensive_hedge (HYBRID)

### Concept

A defensive hedge is a contrarian play during bearish volatile markets. It looks for a bullish engulfing pattern (strong reversal) on an asset that has LOW correlation with BTC — meaning if BTC continues falling, this particular asset may decouple and recover independently. The "hedge" part comes from the low correlation: you're buying something that doesn't move in lockstep with the broader market decline.

**Analogy**: In a storm, most ships sink together. But a submarine operates independently of surface conditions. A defensive hedge finds the "submarines" — assets that are showing strength (engulfing pattern) while being structurally independent of the broader sell-off (low BTC correlation).

### Regime Assignment
- **BEAR_VOLATILE**: Specifically designed for bear markets. This strategy only makes sense when the broader market is falling and you're looking for individual assets that can resist the downdraft.

### BTC Correlation Short-Circuit (ENH-5)

```
if symbol === 'BTC/USD' or symbol === 'BTC/USDT':
  return null   — BTC correlation with itself is always 1.0; skip computation
```

### BTC Correlation Calculation (CAL-4 / ENH-7: Spearman Rank)

```
INPUTS: asset priceHistory[], BTC priceHistory[] (matched timestamps)

STEP 1: Calculate returns for both
  assetReturns[i]  = (assetPrice[i] - assetPrice[i-1]) / assetPrice[i-1]
  btcReturns[i]    = (btcPrice[i] - btcPrice[i-1]) / btcPrice[i-1]

STEP 2: Spearman rank correlation over DH_CORR_WINDOW candles
  a. Rank each series independently (ties get average rank)
  b. Compute Pearson correlation on the RANKS:
     correlation = pearson(rank(assetReturns), rank(btcReturns))

  Range: [-1.0, 1.0]
  -1.0 = perfectly inverse (asset goes up when BTC goes down)
   0.0 = no relationship
  +1.0 = perfectly correlated (moves in lockstep with BTC)

  Rationale for Spearman over Pearson (CAL-4, ENH-7):
    Spearman is robust to outliers (flash crashes, liquidation cascades)
    that would distort Pearson correlation. In crypto, extreme moves are
    common and should not dominate the correlation estimate. Spearman
    measures monotonic relationship strength regardless of magnitude.

  Rationale for 30-candle window (CAL-4):
    Longer windows (50-60) blend multiple regimes in fast-moving crypto,
    producing stale estimates. 30 candles (~30h on 1h chart) is regime-
    relevant and provides sufficient statistical power for Spearman.
```

### Volatility Offset Calculation

```
assetVol  = stddev(assetReturns, DH_VOL_WINDOW)
marketVol = stddev(btcReturns, DH_VOL_WINDOW)
volOffset = (assetVol - marketVol) / marketVol

volOffset > 0 means asset is more volatile than market
volOffset > 1.0 means asset is 2x as volatile as market (1 standard deviation above)
```

### Entry Conditions

All must be true:

| # | Condition | Formula | Rationale |
|---|-----------|---------|-----------|
| 1 | Bullish engulfing detected | `patternSignal.pattern === 'ENGULFING' AND patternSignal.direction === 'BUY'` | Engulfing pattern = aggressive buying overwhelming prior selling. Strongest single-candle reversal signal. |
| 2 | Pattern strength sufficient | `patternSignal.strength >= MIN_PATTERN_STRENGTH` | Quality gate |
| 3 | Low BTC correlation | `|btcCorrelation| < DH_MAX_CORRELATION` | Asset must have low Spearman rank correlation with BTC. This is the "hedge" — if BTC keeps falling, this asset is statistically independent. |
| 4 | Volatility offset positive | `volOffset > DH_MIN_VOL_OFFSET` | Asset has its own volatility dynamics separate from the market. Confirms structural independence, not just temporary decorrelation. |
| 5 | Volume confirmation | `engulfingVolume >= avgVolume(20) x DH_VOL_MULT` | Real buying interest behind the engulfing candle |

### Exit Levels

```
entryPrice  = currentPrice x (1 + ENTRY_PREMIUM_BPS / 10000)

stopPrice   = engulfingLow x (1 - DH_STOP_BUFFER)
              Rationale: If price drops below the engulfing candle's low,
              the bullish reversal has failed. Wider buffer (0.5%) because
              BEAR_VOLATILE has more noise.

targetPrice = entryPrice + DH_TARGET_ATR_MULT x ATR(14)
              Rationale: Conservative target (1.8x ATR). In bear markets,
              even hedged positions should take profit quickly.
```

**R:R Check**: `if (reward / risk) < MIN_RR_RATIO → reject`
**Stop Distance Check (GUARD-1)**: `if (entryPrice - stopPrice) / entryPrice < MIN_STOP_DISTANCE_BPS / 10000 → reject`

### Confidence Scoring

```
patternScore      = patternSignal.strength x DH_PATTERN_WEIGHT

decorrelScore     = (1 - |btcCorrelation| / DH_MAX_CORRELATION) x DH_DECORR_WEIGHT
                    Rationale: Lower correlation = more independent = higher
                    confidence in the hedge. Correlation 0 scores maximum.

volOffsetScore    = min(DH_MAX_VOL_BONUS,
                        volOffset x DH_VOL_OFFSET_RATE)
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
| `DH_CORR_WINDOW` | 30 | Candles | 30 candles for Spearman correlation calculation. ~30 hours on 1h chart. Regime-relevant for crypto without blending multiple market regimes. (CAL-4) |
| `DH_VOL_WINDOW` | 20 | Candles | 20 candles for volatility calculation. Matches standard baseline period. |
| `DH_MAX_CORRELATION` | 0.30 | Threshold | Spearman correlation must be below 0.30 (absolute value). Above 0.30, the asset moves too much with BTC to be considered a hedge. (CAL-11: Start at 0.30. If backtesting reveals < 1 signal per 500 evaluation cycles, raise to 0.40. 0.40 is bottom quartile for crypto Spearman correlations.) |
| `DH_MIN_VOL_OFFSET` | 0.10 | Threshold (10%) | Asset must be at least 10% more volatile than BTC on its own. Confirms independent price dynamics. |
| `DH_VOL_MULT` | 1.3 | Multiplier | Engulfing volume at least 1.3x average. |
| `DH_STOP_BUFFER` | 0.005 | Fraction (0.5%) | Wider buffer for BEAR_VOLATILE regime noise. |
| `DH_TARGET_ATR_MULT` | 1.8 | Multiplier | Conservative — bear market trades should exit quickly. Below the 2.0x standard. |
| `DH_PATTERN_WEIGHT` | 0.45 | Weight | (CAL-9: raised from 0.35.) Pattern contributes 45%. Rebalanced to prevent cliff-like confidence dropoff near correlation threshold. |
| `DH_DECORR_WEIGHT` | 0.25 | Weight | (CAL-9: lowered from 0.30.) Decorrelation contributes 25%. Still the core hedge metric but rebalanced for smoother scoring. |
| `DH_VOL_OFFSET_RATE` | 0.15 | Rate | Each 10% volatility offset adds 1.5% confidence |
| `DH_MAX_VOL_BONUS` | 0.15 | Cap | Volatility offset capped at 15% |
| `DH_STRONG_ENGULF_BONUS` | 0.08 | Additive | +8% for strong engulfing (ratio > 1.5) |

### Variables

| Variable | Source | Range |
|----------|--------|-------|
| `btcCorrelation` | Spearman rank correlation calculation | [-1.0, 1.0] |
| `volOffset` | Volatility offset calculation | Can be negative (rejected) |
| `patternSignal.strength` | Pattern Recognizer (ENGULFING) | [0.0, 1.0] |
| `engulfRatio` | Pattern metadata | > 1.0 (by engulfing definition) |
| `engulfingLow` | Engulfing candle low price | Price level |
| `engulfingVolume` | Engulfing candle volume | >= 0 |

### Data Dependency Note

This strategy requires **BTC price data alongside the target asset's data**. DawnTrader's data pipeline already fetches BTC/USD as a reference pair. The Spearman rank correlation calculation must use time-aligned candles from both assets.

---

## Strategy #7: adaptive_flow (HYBRID)

### Concept

Adaptive flow detects a market that is choppy (LOW_VOL_CHOP regime) but about to break out of its chop. It looks for BOTH a pattern signal AND quantitative evidence that the range is weakening — specifically, momentum has inverted direction multiple times (indicating the range is getting "tested" from both sides), volatility percentile is rising (the chop is getting wider, suggesting energy building), AND the market is confirmed non-trending (ADX < 25).

**Analogy**: Think of water behind a dam. During LOW_VOL_CHOP, the water level is stable but fluctuating slightly (momentum inversions). Adaptive flow detects when the fluctuations are getting bigger (rising volatility percentile) and the dam is showing cracks (a breakout pattern forming). It positions before the dam breaks.

### Regime Assignment
- **LOW_VOL_CHOP**: Specifically designed for quiet, range-bound markets where a breakout is anticipated.

### Momentum Inversion Count

```
INPUTS: momentum values over AF_LOOKBACK candles

A momentum inversion occurs when:
  momentum[i-1] > 0 AND momentum[i] < 0   (positive -> negative)
  OR
  momentum[i-1] < 0 AND momentum[i] > 0   (negative -> positive)

inversionCount = count of inversions in lookback window
```

### Volatility Percentile

```
INPUTS: volatility values over AF_VOL_PERCENTILE_WINDOW candles

volPercentile = percentile_rank(currentVolatility, volatilityHistory)
               = (count of values <= currentVolatility) / total count x 100

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
| 5 | Volume rising | `currentVolume >= avgVolume(20) x AF_VOL_MULT` | Participation increasing alongside the directional signal |
| 6 | No established trend | `ADX(14) < AF_ADX_MAX` | (CAL-3) Explicit anti-trend condition. ADX < 25 is the standard "no trend" threshold. Prevents adaptive_flow from firing during trending markets with minor pullbacks — if the regime classifier has any latency in detecting CHOP→TREND transition, this gate catches it. |

### Exit Levels

```
entryPrice  = currentPrice x (1 + ENTRY_PREMIUM_BPS / 10000)

stopPrice   = min(threeSoldiersLow x (1 - AF_STOP_BUFFER),
                  entryPrice - AF_STOP_ATR_MULT x ATR(14))
              (CAL-10: Added structure-based anchor. Uses the LOWER of:
              1. Three soldiers formation low minus buffer (structural)
              2. ATR-based stop (volatility-based)
              This anchors the stop to market structure like every other
              strategy, while the ATR stop provides a floor if the pattern
              low is unrealistically far away.)

              Rationale: In LOW_VOL_CHOP, ranges are narrow, so ATR produces
              a tight stop. The formation low provides structural context.
              Using min() ensures we get the wider (more protective) stop.

targetPrice = entryPrice + AF_TARGET_ATR_MULT x ATR(14)
              Rationale: Wide target (3.0x ATR) because if the breakout
              succeeds, the move can be substantial relative to the prior chop.
              Breakouts from extended ranges tend to have larger follow-through.
```

**R:R Check**: `if (reward / risk) < MIN_RR_RATIO → reject`
**Stop Distance Check (GUARD-1)**: `if (entryPrice - stopPrice) / entryPrice < MIN_STOP_DISTANCE_BPS / 10000 → reject`

### Confidence Scoring

```
patternScore     = patternSignal.strength x AF_PATTERN_WEIGHT

inversionScore   = min(AF_MAX_INVERSION_BONUS,
                       (inversionCount - AF_MIN_INVERSIONS + 1) x AF_INVERSION_RATE)
                   Rationale: More inversions = longer the market has been
                   coiling. 5 inversions scores higher than 3.

volPctScore      = (volPercentile - AF_MIN_VOL_PERCENTILE) / (100 - AF_MIN_VOL_PERCENTILE)
                   x AF_VOL_PCT_WEIGHT
                   Rationale: Higher percentile = more energy building.
                   At percentile 70 (minimum), score = 0.
                   At percentile 100, score = AF_VOL_PCT_WEIGHT.

volumeBonus      = if currentVolume >= avgVolume x 1.8 then AF_HIGH_VOL_BONUS else 0

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
| `AF_VOL_MULT` | 1.3 | Multiplier | Volume at least 1.3x average. Moderate — chop-to-breakout transitions start with moderate volume. |
| `AF_ADX_MAX` | 25 | Threshold | (CAL-3) ADX must be below 25. Standard "no trend" threshold. Prevents firing in trending markets. |
| `AF_STOP_ATR_MULT` | 1.5 | Multiplier | Stop at 1.5x ATR below entry. Standard trend-following stop. |
| `AF_STOP_BUFFER` | 0.003 | Fraction (0.3%) | Buffer below three soldiers formation low. (CAL-10) |
| `AF_TARGET_ATR_MULT` | 3.0 | Multiplier | Wide target because breakout from extended chop can produce outsized moves. |
| `AF_PATTERN_WEIGHT` | 0.35 | Weight | Pattern contributes 35% |
| `AF_INVERSION_RATE` | 0.05 | Rate | Each inversion above minimum adds 5% confidence |
| `AF_MAX_INVERSION_BONUS` | 0.20 | Cap | Inversion contribution capped at 20% |
| `AF_VOL_PCT_WEIGHT` | 0.25 | Weight | Volatility percentile contributes up to 25% |
| `AF_HIGH_VOL_BONUS` | 0.08 | Additive | +8% for strong volume (1.8x average) |

### Variables

| Variable | Source | Range |
|----------|--------|-------|
| `inversionCount` | Momentum inversion calculation | >= 0 |
| `volPercentile` | Volatility percentile calculation | [0, 100] |
| `patternSignal.strength` | Pattern Recognizer (THREE_SOLDIERS) | [0.0, 1.0] |
| `momentum` | calculatePairRegime() output | Typically [-0.05, 0.05] |
| `ADX(14)` | Technical indicators | [0, 100] |
| `threeSoldiersLow` | Pattern metadata (lowest point of formation) | Price level |
| `currentVolume` | Current candle | >= 0 |
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
A -> B: Initial impulse move (sharp up)
B -> C: Pullback/consolidation (partial retrace)
C -> D: Second impulse (resumes A->B direction)

Key relationships:
  B->C retraces 38.2% to 78.6% of A->B (Fibonacci)
  C->D should approximately equal A->B in magnitude (measured move)
  D = projected target
```

For `volatility_edge`, we use the pattern recognition from the existing infrastructure but add volatility regime confirmation.

### Entry Conditions

All must be true:

| # | Condition | Formula | Rationale |
|---|-----------|---------|-----------|
| 1 | ABCD pattern in progress | C-point established, price moving toward projected D | The A->B impulse and B->C pullback have occurred. Price is at or near C, beginning the C->D leg. |
| 2 | Volume spike at A-point | `aPointVolume >= avgVolume(20) x VE_A_VOL_MULT` | The initial impulse (A->B) must have been volume-confirmed. This validates that the pattern started with real institutional interest. |
| 3 | Volatility percentile extreme | `volPercentile >= VE_MIN_VOL_PERCENTILE` | Current volatility must be above 80th percentile. Confirms the "high energy" environment needed for D-point completion. |
| 4 | C-point holds above VWAP | `cPointLow > VWAP` (for bullish) | The pullback (B->C) didn't break the value area. Market structure is intact. |
| 5 | Breakout from C | `currentPrice > cPointHigh x (1 + VE_BREAKOUT_BUFFER)` | Price has broken above the C-point high, confirming the C->D leg has begun. |
| 6 | Volume on breakout | `breakoutVolume >= avgVolume(20) x VE_BREAKOUT_VOL_MULT` | Breakout from C must have volume participation |

### Exit Levels

```
entryPrice  = cPointHigh x (1 + VE_BREAKOUT_BUFFER)
              Rationale: Enter at the breakout of C-point high.
              This confirms the C->D leg has begun.

stopPrice   = cPointLow x (1 - VE_STOP_BUFFER)
              Rationale: If price drops below C, the pattern has failed.
              The measured move thesis is invalidated.

targetPrice = cPointLow + (bPointHigh - aPointLow) x VE_MEASURED_MOVE_MULT
              (BUG-6 FIX: Base changed from cPointHigh to cPointLow.
              Multiplier changed from 0.90 to 0.85.)

              Rationale: Classic ABCD theory measures the C->D leg from the
              C trough (cPointLow), not the C high. The 0.85 multiplier
              (reduced from 0.90) maintains equivalent conservatism with the
              wider base — takes profit at 85% of the theoretical measured
              move, accounting for the larger projection distance.

              Compromise: cPointLow is the textbook base per harmonic pattern
              theory. The tighter 0.85 multiplier compensates for the wider
              target, keeping the effective take-profit level similar to the
              original cPointHigh x 0.90 formulation.

              Alternative: entryPrice + VE_TARGET_ATR_MULT x ATR(14)
              Use whichever is SMALLER (conservative).
```

**R:R Check**: `if (reward / risk) < MIN_RR_RATIO → reject`
**Stop Distance Check (GUARD-1)**: `if (entryPrice - stopPrice) / entryPrice < MIN_STOP_DISTANCE_BPS / 10000 → reject`

### Confidence Scoring

```
patternScore      = VE_BASE_CONFIDENCE
                    (Fixed at 0.40 because ABCD detection is already
                    binary — the geometric structure either exists or
                    it doesn't. Strength comes from the secondary metrics.)

volPctScore       = (volPercentile - VE_MIN_VOL_PERCENTILE) / (100 - VE_MIN_VOL_PERCENTILE)
                    x VE_VOL_PCT_WEIGHT
                    Rationale: Higher volatility = more energy for D-point completion.

fibQuality        = max(0, 1.0 - |bcRetrace - 0.618| / 0.382)
                    (BUG-4 FIX: Added max(0, ...) floor. Prevents negative
                    fibQuality for degenerate retracements at the edges
                    of the valid Fibonacci range.)
                    Rationale: B->C retracement closest to the golden ratio
                    (0.618) scores highest. This measures how "textbook" the
                    pattern is. Perfect golden ratio -> 1.0. Edge of valid
                    range -> 0.0. Beyond valid range -> 0.0 (floored).

fibScore          = fibQuality x VE_FIB_WEIGHT

volumeScore       = min(VE_MAX_VOL_BONUS,
                        (aPointVolume / avgVolume - 1) x VE_VOL_SCORE_RATE)

confidence        = clamp(patternScore + volPctScore + fibScore + volumeScore,
                           MIN_CONFIDENCE, MAX_CONFIDENCE)
```

### Constants

| Constant | Value | Type | Rationale |
|----------|-------|------|-----------|
| `VE_A_VOL_MULT` | 2.0 | Multiplier | A-point volume must be 2x average. The initial impulse must be significant. Same as existing `abcd_long` requirement. |
| `VE_MIN_VOL_PERCENTILE` | 80 | Percentile | Volatility above 80th percentile. Higher than adaptive_flow's 70 because this strategy specifically exploits extreme volatility. |
| `VE_BREAKOUT_BUFFER` | 0.002 | Fraction (0.2%) | Price must exceed C-point high by 0.2% to confirm breakout. |
| `VE_BREAKOUT_VOL_MULT` | 1.5 | Multiplier | Breakout volume at least 1.5x average. |
| `VE_STOP_BUFFER` | 0.003 | Fraction (0.3%) | Buffer below C-point low. Standard for pattern invalidation stops. |
| `VE_MEASURED_MOVE_MULT` | 0.85 | Multiplier | (BUG-6: changed from 0.90.) Take profit at 85% of measured move from cPointLow base. Tighter multiplier compensates for the wider base, maintaining equivalent conservatism. |
| `VE_TARGET_ATR_MULT` | 2.5 | Multiplier | ATR-based target alternative. Use the smaller of measured move and ATR target. (CAL-7: confirmed at 2.5. ATR target is a fallback cap; measured move usually governs.) |
| `VE_BASE_CONFIDENCE` | 0.40 | Fixed | Baseline confidence for valid ABCD + high volatility. |
| `VE_VOL_PCT_WEIGHT` | 0.20 | Weight | Volatility percentile contributes up to 20% |
| `VE_FIB_WEIGHT` | 0.20 | Weight | Fibonacci quality contributes up to 20% |
| `VE_VOL_SCORE_RATE` | 0.05 | Rate | Each 1x excess volume at A-point adds 5% |
| `VE_MAX_VOL_BONUS` | 0.15 | Cap | Volume bonus capped at 15% |

### Variables

| Variable | Source | Range |
|----------|--------|-------|
| `aPointLow` | ABCD identification (impulse start) | Price level |
| `bPointHigh` | ABCD identification (impulse peak) | Price level |
| `cPointHigh` | ABCD identification (pullback peak) | Price level |
| `cPointLow` | ABCD identification (pullback trough) | Price level |
| `bcRetrace` | (bPointHigh - cPointLow) / (bPointHigh - aPointLow) | [0.382, 0.786] (valid Fib zone) |
| `aPointVolume` | Volume at A-point candle | >= 0 |
| `breakoutVolume` | Volume on C-breakout candle | >= 0 |
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
| `MIN_STOP_DISTANCE_BPS` | 20 | All | Min stop distance (GUARD-1) |
| `ATR_MIN_RATIO` | 0.001 | All | ATR floor — reject below (GUARD-2) |
| `ATR_MAX_RATIO` | 0.10 | All | ATR ceiling — clamp (GUARD-2) |

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
| | IB_SELL_RSI_MIN | 45 | SELL RSI filter (ENH-3) |
| **support_bounce** | SB_LOOKBACK_CANDLES | 50 | Support identification |
| | SB_CLUSTER_TOLERANCE_BASE | 0.005 | Support identification (ATR-scaled: `max(0.005, ATR/price x 0.5)`) (CAL-1) |
| | SB_MIN_TOUCHES | 3 | Support qualification (CAL-2) |
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
| | PS_ADX_SLOPE_MIN | 0.5 | Entry threshold (2 consecutive candles) (CAL-5) |
| | PS_VOL_MULT | 1.3 | Volume gate |
| | PS_STOP_ATR_MULT | 1.5 | Stop placement |
| | PS_TARGET_ATR_MULT | 3.0 | Target placement |
| | PS_PATTERN_WEIGHT | 0.40 | Confidence weight |
| | PS_RSI_WEIGHT | 0.25 | Confidence weight |
| | PS_ADX_SCORE_RATE | 0.05 | Confidence rate |
| | PS_MAX_ADX_BONUS | 0.20 | Confidence cap |
| | PS_HIGH_VOL_BONUS | 0.08 | Confidence bonus |
| **reverse_impulse** | RI_MIN_STRENGTH | 0.65 | Entry threshold |
| | RI_MOMENTUM_THRESHOLD | -0.01 | Entry threshold (ENH-10) |
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
| **defensive_hedge** | DH_CORR_WINDOW | 30 | Spearman correlation window (CAL-4) |
| | DH_VOL_WINDOW | 20 | Volatility calculation |
| | DH_MAX_CORRELATION | 0.30 | Entry threshold (CAL-11: conditional raise to 0.40) |
| | DH_MIN_VOL_OFFSET | 0.10 | Entry threshold |
| | DH_VOL_MULT | 1.3 | Volume gate |
| | DH_STOP_BUFFER | 0.005 | Stop placement |
| | DH_TARGET_ATR_MULT | 1.8 | Target placement |
| | DH_PATTERN_WEIGHT | 0.45 | Confidence weight (CAL-9: raised from 0.35) |
| | DH_DECORR_WEIGHT | 0.25 | Confidence weight (CAL-9: lowered from 0.30) |
| | DH_VOL_OFFSET_RATE | 0.15 | Confidence rate |
| | DH_MAX_VOL_BONUS | 0.15 | Confidence cap |
| | DH_STRONG_ENGULF_BONUS | 0.08 | Confidence bonus |
| **adaptive_flow** | AF_LOOKBACK | 20 | Inversion lookback |
| | AF_MIN_INVERSIONS | 3 | Entry threshold |
| | AF_VOL_PERCENTILE_WINDOW | 50 | Percentile window |
| | AF_MIN_VOL_PERCENTILE | 70 | Entry threshold |
| | AF_VOL_MULT | 1.3 | Volume gate |
| | AF_ADX_MAX | 25 | Entry threshold (CAL-3: anti-trend gate) |
| | AF_STOP_ATR_MULT | 1.5 | Stop placement |
| | AF_STOP_BUFFER | 0.003 | Stop placement (CAL-10: structure anchor buffer) |
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
| | VE_MEASURED_MOVE_MULT | 0.85 | Target placement (BUG-6: from cPointLow base) |
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
| `ADX(14)` | Technical indicators | Trend strength | [0, 100] | pivot_shift, adaptive_flow |
| `VWAP` | Technical indicators | Price | > 0 | volatility_edge |
| `momentum` | calculatePairRegime() | Directional | [-0.05, 0.05] | reverse_impulse, adaptive_flow |
| `volatility` | calculatePairRegime() | Dispersion | [0, 0.1] | adaptive_flow, volatility_edge |
| `regime` | calculatePairRegime() | Categorical | 5 canonical values | All (orchestrator filtering) |
| `patternSignal.strength` | Pattern Recognizer | Quality | [0.0, 1.0] | All |
| `patternSignal.metadata` | Pattern Recognizer | Diagnostic | Object | Varies |
| `btcReturns[]` | BTC price history | Returns | Unbounded | defensive_hedge |
| `assetReturns[]` | Asset price history | Returns | Unbounded | defensive_hedge |
| `priceHistory[]` | Kraken OHLCV | Candle array | Variable length | All |
| `threeSoldiersLow` | Pattern metadata | Price | > 0 | adaptive_flow (CAL-10) |
| `minMomentum(RI_LOOKBACK)` | Min of momentum over lookback | Directional | [-0.05, 0] | reverse_impulse (BUG-3) |

---

## 14. Confidence Bounds Table (ENH-8)

Maximum pre-clamp confidence scores for each strategy (all components at maximum values). Useful for implementation verification.

| Strategy | Components | Max Pre-Clamp | Clamped |
|----------|-----------|--------------|---------|
| **morning_star** | 0.80 + 0.08 + 0.07 + 0.05 | 1.00 | 1.00 |
| **inside_bar_reversal** | 0.35 + 0.20 + 0.45 | 1.00 | 1.00 |
| **support_bounce** | 0.40 + 0.30 + 0.15 + 0.08 | 0.93 | 0.93 |
| **pivot_shift** | 0.40 + 0.25 + 0.20 + 0.08 | 0.93 | 0.93 |
| **reverse_impulse** | 0.40 + 0.20 + 0.25 + 0.10 | 0.95 | 0.95 |
| **defensive_hedge** | 0.45 + 0.25 + 0.15 + 0.08 | 0.93 | 0.93 |
| **adaptive_flow** | 0.35 + 0.20 + 0.25 + 0.08 | 0.88 | 0.88 |
| **volatility_edge** | 0.40 + 0.20 + 0.20 + 0.15 | 0.95 | 0.95 |

> **Note**: `defensive_hedge` max increased from 0.88 to 0.93 after CAL-9 weight rebalance (pattern weight 0.35→0.45).

---

## 15. Deferred Items (Backtesting Candidates)

The following items were identified during multi-LLM review but deferred to backtesting. They should be evaluated empirically and added in a later iteration if data supports them.

| ID | Strategy | Item | Condition for Addition |
|----|----------|------|----------------------|
| ENH-2 | morning_star | Distance-from-SMA filter (reject if >5% below SMA) | Backtesting shows falling-knife false positives are frequent enough to justify filter; empirical calibration of threshold (may be 3% or 7%, not 5%) |
| ENH-4 | All hybrids | Regime stability filter (no signal if regime changed within last 3 candles) | Backtesting shows regime transition edge cases produce losing signals; avoid double-counting with system-level governance |
| ENH-6 | volatility_edge | Dynamic measured move multiplier (0.95 if volPercentile > 90) | Backtesting confirms positive relationship between volPercentile and ABCD completion rate |
| CAL-11 | defensive_hedge | Raise DH_MAX_CORRELATION from 0.30 to 0.40 | Backtesting shows < 1 signal per 500 evaluation cycles at 0.30 threshold |

---

## 16. Review Checklist for Auditing LLMs

When reviewing this specification, please verify the following for each strategy:

### Mathematical Correctness
- [x] Are all formulas dimensionally consistent? (prices compared to prices, ratios compared to ratios)
- [x] Can any confidence score exceed 1.0 or go below 0.0? (must be clamped)
- [x] Does the R:R check correctly reject signals below 1.5?
- [x] Are stop prices always between the entry and the invalidation level?
- [x] Can the target price formula ever produce a target BELOW the entry price for a BUY signal?
- [x] Are intermediate calculations floored to prevent negative contributions? (BUG-2, BUG-4, BUG-5)
- [x] Does pivot_shift stop use max() for BUY signals? (BUG-1)
- [x] Does reverse_impulse confidence use minMomentum, not current? (BUG-3)

### Constant Reasonableness
- [x] Are volume multipliers in a reasonable range (1.0-3.0)?
- [x] Are ATR target multipliers consistent with the strategy's risk profile? (counter-trend = tighter, trend-following = wider)
- [x] Do confidence weights sum to a value that allows confidence to reach 0.6-0.8 for strong signals? (not too high, not too low)
- [x] Are threshold values consistent with the regime's characteristics? (BEAR_VOLATILE thresholds should be stricter than BULL_STABLE)

### Signal Quality
- [x] Does each strategy require at least 3 independent conditions? (prevents false positives)
- [x] Is there a volume confirmation in every strategy? (no "phantom" signals on zero volume)
- [x] Does the confidence scoring reward independent factors, not correlated factors?
- [x] Are the entry/stop/target levels based on market structure (not arbitrary percentages)?

### Safeguards
- [x] Minimum stop distance (GUARD-1) enforced in all strategies?
- [x] ATR floor/ceiling (GUARD-2) applied before any ATR-based calculation?
- [x] No division-by-zero possible in R:R calculation? (covered by GUARD-1)

### Architectural Consistency
- [x] Does each strategy produce the same StrategySignal output format?
- [x] Are pattern type requirements consistent with the canonical regime-strategy map?
- [x] Do regime assignments match the canonical map exactly?
- [x] Are all input variables available from existing DawnTrader infrastructure?
- [x] BTC self-correlation short-circuit in defensive_hedge? (ENH-5)
- [x] Spearman rank correlation used for defensive_hedge? (CAL-4/ENH-7)

### Risk Management
- [x] Counter-trend strategies (reverse_impulse, defensive_hedge) have tighter targets and stricter entry requirements than trend-following strategies
- [x] BEAR_VOLATILE strategies have wider stop buffers to account for noise
- [x] LOW_VOL_CHOP strategies have tighter stops (smaller ATR) but wider R:R targets (breakout potential)
- [x] No strategy can produce signals with R:R below 1.5
- [x] Adaptive_flow has explicit anti-trend condition (ADX < 25) (CAL-3)

---

*This specification has been vetted through a two-round multi-LLM review process (xAI, Gemini, ChatGPT, Claude) achieving unanimous or clear majority consensus on all 30 decision items. Ready for implementation.*
