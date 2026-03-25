# Crypto Strategy Recalibration — Expert Consensus Request

## Context

DawnTrader V3 is an automated cryptocurrency trading system that runs on Kraken, trading ~300 crypto pairs (BTC, ETH, SOL, altcoins, stablecoins, meme coins). It uses 60-minute OHLC candles for signal detection. The system is long-only (no short selling).

The system has 17 canonical trading strategies split into three categories:
- **9 Quant strategies**: momentum-based, mean-reversion, breakout, range-trading, etc.
- **3 Pattern strategies**: morning star, inside bar reversal, support bounce
- **5 Hybrid strategies**: combine pattern recognition with quant indicators

**The problem**: After fixing several data pipeline bugs, the system is generating very few trade signals (~2 trades per 12 scan cycles across ~300 pairs). Investigation suggests the strategy detect function thresholds were originally calibrated for **equity/stock market characteristics** and are too restrictive for cryptocurrency markets.

We need expert review of the proposed threshold adjustments to ensure they are appropriate for crypto while maintaining signal quality.

---

## Current Thresholds vs. Proposed Crypto-Adjusted Thresholds

For each parameter below, we provide:
- The current value (suspected stock-calibrated)
- The proposed crypto-adjusted value
- The rationale

**Please evaluate each proposed adjustment and recommend whether to adopt it, modify it, or reject it. If you suggest a different value, please explain your reasoning.**

---

### 1. Mean Reversion — Deviation Threshold

| | Value | Notes |
|---|---|---|
| **Current** | 2.5% (configurable, defaults to 2.5 in code) | Defines how far below the mean price must drop before triggering an "oversold" signal |
| **Proposed** | 3.5-4.0% | Crypto routinely deviates 3-5% from mean on 60-min candles without reverting |

**Question**: For 60-minute crypto candles, what deviation from mean (VWAP/SMA20) constitutes a genuine mean-reversion opportunity vs. normal noise? Should this be dynamic (e.g., ATR-based) rather than fixed?

---

### 2. Breakout — Consolidation Range Width

| | Value | Notes |
|---|---|---|
| **Current** | Max 3% width required for range detection | A price range wider than 3% isn't considered "consolidation" |
| **Proposed** | 5-8% | Crypto consolidation ranges are naturally wider due to higher volatility |

**Question**: What is a reasonable consolidation range width for crypto on 60-minute candles? Should the threshold scale with the pair's recent ATR or volatility?

---

### 3. Breakout — Volume Multiplier

| | Value | Notes |
|---|---|---|
| **Current** | 2.0x average volume required for breakout confirmation | |
| **Proposed** | 1.3-1.5x | Crypto volume is irregular/spiky; sustained 2.0x rarely occurs |

**Question**: For crypto breakout confirmation on 60-minute candles, what volume multiplier is sufficient to distinguish genuine breakouts from noise? Is 1.3x too low (risk of false breakouts)?

---

### 4. VWAP Bounce — Proximity Threshold

| | Value | Notes |
|---|---|---|
| **Current** | 0.5% proximity to VWAP required | Price must be within 0.5% of VWAP |
| **Proposed** | 1.5-2.0% | Crypto deviates 3-5% from VWAP routinely on 60-min candles |

**Question**: For VWAP-based strategies on crypto, what proximity threshold is appropriate? Is VWAP even a reliable reference for lower-liquidity altcoins?

---

### 5. VWAP Pullback — Proximity Threshold

| | Value | Notes |
|---|---|---|
| **Current** | 2.0% pullback zone | Price must be within 2% of VWAP for pullback entry |
| **Proposed** | 3.0-4.0% | Similar reasoning to VWAP bounce |

**Question**: Same as above — what pullback distance from VWAP signals a buying opportunity in crypto?

---

### 6. Range Trading — Minimum Range Width

| | Value | Notes |
|---|---|---|
| **Current** | 3% minimum width, 12-hour minimum duration, 3 boundary touches | |
| **Proposed** | Width: 3-6%, Duration: 8 hours, Touches: 2 | Crypto ranges are wider, form faster, and have fewer clean touches due to noise |

**Question**: What defines a tradeable range in crypto? Should boundary touch detection use a tolerance zone (e.g., within 0.5% of level) rather than requiring precise touches?

---

### 7. Reverse Impulse — RSI Oversold Gate

| | Value | Notes |
|---|---|---|
| **Current** | RSI < 35 required (14-period RSI on 60-min candles) | |
| **Proposed** | RSI < 40 | Crypto RSI can stay in the 25-35 zone for extended periods; 35 may be too deep |

**Question**: For crypto mean-reversion on impulse exhaustion, what RSI level indicates genuine oversold on 60-minute candles? Is 40 too aggressive (catching falling knives)?

---

### 8. Pivot Shift — RSI Neutral Zone

| | Value | Notes |
|---|---|---|
| **Current** | RSI must be between 40-60 (neutral zone) | |
| **Proposed** | 35-65 | This 20-point window is extremely narrow for crypto's noisy RSI |

**Question**: For a strategy that looks for Morning Star patterns in RSI-neutral territory, what RSI range is appropriate for crypto? Wider is more permissive but may reduce signal quality.

---

### 9. Defensive Hedge — BTC Correlation Maximum

| | Value | Notes |
|---|---|---|
| **Current** | Spearman correlation |r| < 0.30 (30-bar window) | Asset must show low BTC correlation |
| **Proposed** | |r| < 0.50 | Most altcoins show 0.65-0.90 BTC correlation normally; 0.30 is nearly impossible |

**Question**: What BTC correlation threshold is realistic for identifying "decorrelated" crypto assets? Is 0.50 too loose (most alts still move with BTC at 0.50)? Would a narrower window (10-15 bars) capture transient decorrelation better?

---

### 10. Volatility Edge — Volatility Percentile Gate

| | Value | Notes |
|---|---|---|
| **Current** | Volatility must be ≥ 80th percentile (50-candle lookback) | |
| **Proposed** | ≥ 65th percentile | Crypto's baseline volatility is already elevated; 80th percentile is very rare in crypto-relative terms |

**Question**: For a strategy that exploits high-volatility ABCD patterns, what volatility percentile threshold makes sense for crypto? Should this be relative to the pair's own history (which it is — 50-candle lookback), or relative to the broader crypto market?

---

### 11. Adaptive Flow — Volatility Percentile Gate

| | Value | Notes |
|---|---|---|
| **Current** | Volatility must be ≥ 70th percentile (50-candle lookback) | |
| **Proposed** | ≥ 55-60th percentile | Same reasoning as Volatility Edge |

**Question**: For a choppy-market strategy (Three Soldiers + momentum inversions), what volatility percentile is appropriate?

---

### 12. Adaptive Flow — ADX Anti-Trend Gate

| | Value | Notes |
|---|---|---|
| **Current** | ADX must be < 25 (confirms non-trending/choppy market) | |
| **Proposed** | ADX < 30-35 | Crypto can show ADX 25-30 even during meaningful but noisy directional moves |

**Question**: For crypto on 60-minute candles, what ADX level distinguishes "trending" from "choppy"? The standard stock interpretation (ADX > 25 = trending) may not apply to crypto's noisier price action.

---

### 13. Pattern Strength Minimums (across all pattern/hybrid strategies)

| Strategy | Current Min | Proposed Min |
|---|---|---|
| Morning Star | 0.60 | 0.50 |
| Inside Bar Reversal | (compression ≤ 0.75) | (compression ≤ 0.80) |
| Support Bounce | 0.55 | 0.45 |
| Pivot Shift | 0.55 | 0.45 |
| Reverse Impulse | 0.65 | 0.55 |
| Defensive Hedge | 0.55 | 0.45 |
| Adaptive Flow | 0.55 | 0.45 |
| Volatility Edge | (no explicit min) | (no change) |

**Question**: Crypto patterns are inherently noisier than stock patterns. How much should pattern strength thresholds be relaxed? Is a 0.10 reduction across the board appropriate, or should some strategies be more/less aggressive?

---

### 14. Boundary Touch Counts

| | Current | Proposed |
|---|---|---|
| Range Trading | 3 touches | 2 touches |
| Liquidity Trap | 3 touches | 2 touches |
| Support Bounce | 3 touches (min cluster) | 2 touches |

**Question**: Crypto price action is noisier, so exact boundary touches are rarer. Should touch detection use a tolerance zone (e.g., within ATR/4 of the level), or is reducing the count from 3 to 2 sufficient?

---

## Additional Questions for Expert Review

### A. Strategy Architecture for Crypto

Are there any of these 17 strategies that fundamentally don't work for crypto and should be deprioritized or disabled? For example:
- Is VWAP meaningful for low-liquidity altcoins?
- Does the DHMA microstructure strategy make sense without Level 2 order book data?
- Should range trading strategies be weighted lower in crypto (which trends more than it ranges)?

### B. Regime-Conditional Parameters

Rather than static threshold changes, should some of these parameters be **regime-conditional**? For example:
- Tighter breakout thresholds in RANGE_BOUND regime, wider in IMPULSE_EXPANSION
- Lower volume multiplier in HIGH_VOLATILITY_UNSTABLE (volume already elevated)
- Wider mean-reversion deviation in TREND_FRIENDLY_STABLE (trends persist longer)

### C. Asset-Class Abstraction

We plan to eventually add exchanges that support stocks/ETFs. Should the architecture support **asset-class-specific parameter profiles** from the start? For example:
```
ASSET_CLASS: CRYPTO  → use crypto-calibrated thresholds
ASSET_CLASS: EQUITY  → use stock-calibrated thresholds (current values)
```

### D. Risk of Over-Relaxation

What are the specific risks of relaxing thresholds too much? For each adjustment:
- How does it affect false positive rate?
- How does it affect the quality of signals that pass?
- Is there a "sweet spot" between the current (too tight) and proposed (potentially too loose) values?

---

## System Context for Reference

- **Exchange**: Kraken (crypto only, for now)
- **Timeframe**: 60-minute OHLC candles
- **Universe**: ~300 crypto pairs (all Kraken-listed)
- **Direction**: Long-only (no shorts)
- **Signal quality gate**: FinalScore ≥ 0.35 (composite of confidence, regime weight, NetEV)
- **Regime model**: 5 canonical regimes (TREND_FRIENDLY_STABLE, HIGH_VOLATILITY_UNSTABLE, RANGE_BOUND_STABLE, IMPULSE_EXPANSION, STRUCTURAL_TRANSITION)
- **Portfolio**: ~$834, 4-5 open trade slots
- **Current result**: ~2 trade signals per 12 scan cycles across ~300 pairs (too few)

---

**Please provide your assessment of each proposed adjustment with specific recommended values and reasoning. If you disagree with any proposed change, explain what value you would use instead and why.**
