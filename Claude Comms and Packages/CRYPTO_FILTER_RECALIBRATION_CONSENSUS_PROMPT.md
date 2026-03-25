# Crypto Filter & System Threshold Recalibration — Expert Consensus Request

## Context

DawnTrader V3 is an automated cryptocurrency trading system running on Kraken, trading ~300 crypto pairs (BTC, ETH, SOL, altcoins, stablecoins, meme coins). It uses 60-minute OHLC candles for signal detection. The system is long-only (no short selling).

**Background**: We recently completed a strategy-level threshold recalibration (Batch 18H) that relaxed strategy detection parameters for crypto markets. That change increased signal diversity from 2 to 7 active strategies and increased signal volume 48×.

**The problem now**: The **upstream filter layer** (IMF — Institutional Math Filters) still uses stock-calibrated thresholds that are blocking nearly all non-benchmark crypto pairs from reaching the strategies. Specifically:

- **Volatility Noise (VN) ≤ 0.60** — All crypto pairs show VN = 0.89–1.00 on 60-min candles. This filter produces **ZERO** non-benchmark tradable pairs. When the trading engine activates, it will have nothing to trade.
- **Correlation threshold 0.75** — Most crypto pairs show 0.80–0.95 BTC correlation, so this also blocks most of the universe.
- **Log-Liquidity (LQ) ≥ 40** — Two different formulas exist in the codebase (see Section 7), producing inconsistent scores.

The VTS (Virtual Trade Simulator) uses relaxed thresholds (VN ≤ 0.95, LQ ≥ 25) and successfully generates signals and trades. But the **active trading path** uses the strict thresholds and will produce zero tradable pairs.

We need expert review of proposed threshold adjustments for the entire filter and system parameter stack to ensure they are appropriate for crypto while maintaining signal quality and risk control.

---

## What Has Already Been Crypto-Calibrated

The following components were already recalibrated for crypto in HF7 (Batch 16) and are **included here for completeness and confirmation only**:

| Component | Parameter | Stock Value | Crypto Value (HF7) |
|-----------|-----------|-------------|---------------------|
| Regime DX thresholds | Ranging / Moderate / Strong / Very Strong | 25 (single) | 45 / 50 / 55 / 60 |
| Regime volatility | Low / Elevated | (not documented) | 0.012 / 0.020 |
| Regime momentum | Noise / Meaningful | (not documented) | ±0.003 / ±0.005 |
| Momentum lookback | Window (candles) | 14 | 30 |

**Question 0**: Are these HF7 regime thresholds appropriate for crypto on 60-minute candles? Any further adjustment needed?

---

## Section 1: Volatility Noise (VN) — CRITICAL

### What VN Measures
VN quantifies market choppiness on a 0–1 scale. Formula:
```
diffs = |price[i] - price[i-1]| for all consecutive prices
mean = average(diffs)
variance = average((diff - mean)²)
VN = sqrt(variance) / mean
```
Lower VN = smoother trends. Higher VN = noisy/choppy. Clamped to [0, 1].

### Current Thresholds (Three Tiers)

| Tier | VN Threshold | Purpose |
|------|-------------|---------|
| **Active Trading (strict)** | VN ≤ 0.60 | Pairs eligible for real trades (paper or live) |
| **Passive Learning** | VN ≤ 0.80 | Pairs for IMF metric persistence |
| **VTS (relaxed)** | VN ≤ 0.95 | Pairs for virtual trade simulation / ML training |

### Observed Crypto Data
- All non-benchmark crypto pairs produce VN = 0.89–1.00 on 60-minute candles
- Even benchmark pairs (BTC, ETH, SOL) show VN = 0.75–0.92
- The strict 0.60 threshold produces **exactly zero** non-benchmark tradable pairs
- The VTS 0.95 threshold works — VTS generates 7+ strategy signals across multiple pairs

### Proposed Adjustments

| Tier | Current | Proposed | Rationale |
|------|---------|----------|-----------|
| Active Trading | 0.60 | **?** | Must pass enough crypto pairs for trading while rejecting truly chaotic price action |
| Passive Learning | 0.80 | **?** | Should be slightly above active trading threshold |
| VTS | 0.95 | 0.95 (keep) | Already working well for ML data collection |

**Question 1a**: What VN threshold should be used for active crypto trading? The range of observed crypto VN is 0.75–1.00. We need a value that allows the tradeable universe through while still rejecting genuinely untradeable noise.

**Question 1b**: Is the VN formula itself appropriate for crypto? The formula measures price *change magnitude variability* — if crypto price changes are inherently more variable than stocks (they are), VN will always be high regardless of actual tradeability. Should the formula be modified for crypto, or is adjusting the threshold sufficient?

**Question 1c**: Should VN thresholds be dynamic/adaptive? For example: `VN_MAX = median(VN across universe) + 1σ` to auto-calibrate to actual market conditions?

---

## Section 2: Log-Liquidity (LQ) — HIGH PRIORITY

### What LQ Measures
LQ is a logarithmic liquidity index on a 0–100 scale. Two formulas exist:

**Formula A** (analysis-utils.ts — used by `passesCoreMetricFilters()`):
```
raw = 10 * (ln(V × C) - ln(S / C) - 10)
LQ = clamp(raw, 0, 100)
```
Where V = 24h volume (USD), C = trade count (24h), S = bid-ask spread.

**Formula B** (fx5-scanner.ts — used for OHLC-based per-candle LQ):
```
LQ = clamp(log10(avgVolumeUSD + 1) × 10, 0, 100)
```
Where avgVolumeUSD = average per-candle USD volume from ~720 OHLC candles.

### Current Thresholds

| Tier | LQ Threshold | Purpose |
|------|-------------|---------|
| Active Trading (strict) | LQ ≥ 40 | Minimum liquidity for real trades |
| VTS (relaxed) | LQ ≥ 25 | Minimum liquidity for virtual trades |

### The Problem
- Formula A (ln-based) saturates at 100 for all crypto because 24h aggregate volume is too large
- Formula B (log10 per-candle) produces discriminating values (typically 30–60) but uses a completely different scale
- The FX5 scanner uses Formula B when OHLC data is available, Formula A as fallback
- This means the LQ threshold of 40 is evaluated against two different scales depending on data availability

### Proposed Adjustments

| Tier | Current | Proposed | Rationale |
|------|---------|----------|-----------|
| Active Trading | 40 | **?** | Needs to work with whichever LQ formula is active |
| VTS | 25 | **?** | Should be proportionally relaxed |

**Question 2a**: What LQ threshold is appropriate for crypto active trading? The per-candle log10 formula produces 30–60 for most crypto pairs. Is 40 still reasonable, or should it be lowered?

**Question 2b**: Should we standardize on one LQ formula? The dual-formula situation creates inconsistency. Which approach is more meaningful for crypto liquidity assessment — aggregate 24h volume or per-candle average volume?

**Question 2c**: Should LQ thresholds scale with the pair's volume class (SMALL < $1M, MID $1M–$10M, LARGE > $10M)?

---

## Section 3: Correlation Threshold — HIGH PRIORITY

### What It Measures
The correlation threshold (`CORRELATION_THRESHOLD`) gates how correlated a pair can be with benchmark assets (BTC, ETH) while still being eligible for trading. This prevents the portfolio from being overexposed to a single market factor.

### Current Value
```
CORRELATION_THRESHOLD: 0.75
```
Pairs with correlation > 0.75 to BTC/ETH are filtered out in some code paths.

### Observed Crypto Data
- Most altcoins show 0.80–0.95 correlation with BTC on 60-min candles
- Even "decorrelated" crypto assets (stablecoins aside) rarely drop below 0.70
- At 0.75, most of the tradable universe is blocked

### Proposed Adjustment

| | Current | Proposed | Rationale |
|---|---------|----------|-----------|
| Correlation max | 0.75 | **?** | Must allow enough universe through; crypto is inherently BTC-correlated |

**Question 3a**: What correlation threshold is realistic for a crypto-only portfolio? Should this even be used as a filter, or should correlation be handled purely through position sizing / exposure limits?

**Question 3b**: Should correlation thresholds be regime-conditional? For example, lower threshold in IMPULSE_EXPANSION (when correlations spike) and higher in RANGE_BOUND_STABLE (when pairs decorrelate)?

---

## Section 4: Directional Integrity (DI) Thresholds

### What DI Measures
DI measures trend straightness/directional persistence on a 0–100 scale:
```
net = |price_last - price_first|
total = Σ|price[i] - price[i-1]|
DI = (net / total) × 100
```
DI ≥ 65 = stable trend. DI < 30 = choppy/non-directional.

### Current Thresholds
```
DI_TRENDING: 65
DI_CHOPPY: 30
```

These are used for pWin (probability of winning) calculation:
```
pWin factor: if DI ≥ 65 → trending boost, if DI < 30 → choppy penalty
DI_PWIN_FACTOR: 200
```

**Question 4**: Are these DI thresholds appropriate for crypto? Crypto tends to show lower DI than stocks (noisier price action). Should the trending threshold be lowered (e.g., 55) and choppy raised (e.g., 35)?

---

## Section 5: Volume Threshold

### Current Value
```
MIN_VOLUME_THRESHOLD_USD: 2,000,000
```
This is the minimum 24h USD volume for a pair to be considered tradeable.

**Question 5**: Is $2M 24h volume appropriate for crypto micro-caps and altcoins? Our portfolio is ~$834 with $40–$200 position sizes. Should this be lower (e.g., $500K) for the small positions we're taking?

---

## Section 6: Fee/Slippage Constants

### Current Values (multiple locations)

| Constant | Value | Location | Purpose |
|----------|-------|----------|---------|
| `BASE_FEE_SLIPPAGE` | 0.50% | system-guards.ts | Combined round-trip cost for filter calculations |
| `SLIPPAGE_PERCENT` | 0.15% | paper-execution-engine.ts | Per-trade slippage simulation |
| `FEE_PERCENT` | 0.10% | paper-execution-engine.ts | Per-trade fee simulation |
| `DEFAULT_SLIPPAGE` | 0.05% | cost-metrics.ts | Default slippage for cost factor |
| `DEFAULT_FEE` | 0.25% | cost-metrics.ts | Default fee for cost factor |

### Kraken Actual Fees
- Kraken maker fee: 0.16% (volume < $50K/month)
- Kraken taker fee: 0.26%
- Typical crypto slippage at our position size ($40–$200): 0.01–0.05%

### Observations
- `FEE_PERCENT: 0.10%` is lower than actual Kraken taker fee (0.26%)
- `DEFAULT_FEE: 0.25%` is close to actual
- `BASE_FEE_SLIPPAGE: 0.50%` seems high for round trip (actual: ~0.55% at taker rates)
- `SLIPPAGE_PERCENT: 0.15%` seems high for our small position sizes

**Question 6a**: Should `FEE_PERCENT` in paper-execution-engine be updated to match actual Kraken taker fee (0.26%)? Paper trading should simulate real costs accurately.

**Question 6b**: Is 0.15% slippage realistic for $40–$200 crypto positions? At these sizes, slippage should be minimal even for lower-liquidity pairs. Should this be reduced to 0.02–0.05%?

**Question 6c**: Should fee/slippage constants be configurable per asset class (crypto vs future stocks), or is the current hardcoded approach acceptable for a crypto-only system?

---

## Section 7: LQ Formula Inconsistency (Architecture Question)

Two different LQ formulas exist in the codebase and produce different scales:

### Formula A: `calculateLogLiquidity()` in analysis-utils.ts
```typescript
function calculateLogLiquidity(V: number, C: number, S: number): number {
  const spread = Math.max(S, 1e-8);
  const count = Math.max(C, 1);
  const raw = 10 * (Math.log(V * count) - Math.log(spread / count) - 10);
  return Math.max(0, Math.min(100, raw));
}
```
- Uses natural log (ln)
- Inputs: 24h aggregate volume, trade count, spread
- Saturates at 100 for all crypto pairs (volumes too large)

### Formula B: Per-candle OHLC LQ in fx5-scanner.ts
```typescript
const LQ = Math.min(100, Math.max(0, Math.log10(avgVolumeUSD + 1) * 10));
```
- Uses log10
- Input: average per-candle USD volume from OHLC data
- Produces discriminating values (30–60 typical for crypto)

### Current Behavior
The FX5 scanner uses Formula B when OHLC data is available (most of the time), Formula A as fallback. The LQ threshold of 40 is evaluated against whichever formula produced the score.

**Question 7a**: Should we standardize on Formula B (log10 per-candle) since it produces more useful discrimination for crypto?

**Question 7b**: If we standardize on Formula B, should the LQ threshold remain 40, or be adjusted? A `log10(avgVolumeUSD + 1) × 10` score of 40 means avgVolumeUSD ≈ $10,000 per candle. Is that an appropriate minimum for crypto trading?

**Question 7c**: Should Formula A be retired or kept as a fallback for non-OHLC contexts?

---

## Section 8: Components Confirmed as Asset-Class Agnostic (No Changes Expected)

The following components were audited and determined to require no crypto-specific calibration. They are included here for expert confirmation.

### 8A. Directional Bias Score (DBS)

DBS uses ATR-normalized, price-relative computations:
```
Components: log-price slope (w=0.40), normalized return (w=0.35), EMA trend alignment (w=0.25)
Thresholds: ±0.60 (strong), ±0.30 (moderate), ±0.10 (weak)
Lookback: 48 candles, EMA 12/26
```
All components normalize by price or ATR — no absolute values that would differ between asset classes.

**Question 8A**: Confirm DBS is asset-class agnostic? Any crypto-specific concern with EMA 12/26 periods on 60-min candles?

### 8B. Signal Quality Evaluator (SQE)

```
MIN_FINAL_SCORE: 0.35
MIN_REGIME_WEIGHT: 0.30
```
FinalScore is a composite of confidence, regime weight, and NetEV — all relative/normalized metrics.

**Question 8B**: Confirm SQE thresholds are asset-class agnostic?

### 8C. Position Sizing

Percentage-based sizing (15–25% of portfolio per position). No absolute dollar thresholds.

**Question 8C**: Confirm position sizing is asset-class agnostic?

### 8D. Global Guards (Strategy Helpers)

```
MIN_RR_RATIO: 1.5          (reward:risk ratio)
ATR_PERIOD: 14              (standard ATR period)
ENTRY_PREMIUM_BPS: 10       (0.1% entry premium)
MIN_STOP_DISTANCE_BPS: 20   (0.2% minimum stop)
ATR_MIN_RATIO: 0.001        (reject if ATR < 0.1% of price)
ATR_MAX_RATIO: 0.10         (clamp ATR at 10% of price)
```
All BPS-based or ATR-relative.

**Question 8D**: Are these guard values appropriate for crypto? Is `MIN_STOP_DISTANCE_BPS: 20` (0.2%) too tight for volatile crypto pairs? Should `ATR_MIN_RATIO: 0.001` be smaller (crypto can have very tight ATR in quiet periods)?

### 8E. MCE Indicators

Standard ATR(14), SMA(20), VWAP, RSI(14), ADX(14) — all well-established technical indicators with no asset-class-specific calibration.

**Question 8E**: Confirm MCE indicator periods are appropriate for 60-min crypto candles?

---

## Section 9: Architecture Questions

### 9A. Asset-Class Parameter Profiles

We plan to eventually add exchanges supporting stocks/ETFs. Should the architecture support asset-class-specific parameter profiles from the start?

```
ASSET_CLASS: CRYPTO  → use crypto-calibrated filter thresholds
ASSET_CLASS: EQUITY  → use stock-calibrated thresholds (current strict values)
```

**Question 9A**: Is this worth implementing now, or should we just overwrite with crypto values and deal with stocks later?

### 9B. Adaptive vs. Fixed Thresholds

Several thresholds (VN, LQ, DI) could potentially self-calibrate based on rolling market statistics rather than being fixed constants.

**Question 9B**: For which metrics would adaptive/rolling thresholds be most valuable? What are the risks of adaptive thresholds (e.g., threshold drift during market regime changes)?

### 9C. Risk of Over-Relaxation

For each proposed filter adjustment:
- How does it affect false positive rate (bad pairs getting through)?
- How does it affect portfolio concentration risk?
- Is there a "sweet spot" between current (too tight, zero pairs) and over-relaxed (everything gets through)?

**Question 9C**: What quality metrics should we monitor after recalibration to detect if filters are too loose? (e.g., win rate by VN tier, P&L distribution by LQ tier, correlation-adjusted drawdown)

---

## System Context for Reference

- **Exchange**: Kraken (crypto only, for now)
- **Timeframe**: 60-minute OHLC candles
- **Universe**: ~300 crypto pairs (all Kraken-listed)
- **Direction**: Long-only (no shorts)
- **Signal quality gate**: FinalScore ≥ 0.35
- **Regime model**: 5 canonical regimes (TREND_FRIENDLY_STABLE, HIGH_VOLATILITY_UNSTABLE, RANGE_BOUND_STABLE, IMPULSE_EXPANSION, STRUCTURAL_TRANSITION)
- **Portfolio**: ~$834, 4-5 open trade slots, $40-$200 per position
- **IMF filter tiers**: Strict (active trading), Passive (learning), Relaxed (VTS/ML)
- **Strategy recalibration**: Already completed (Batch 18H) — strategies fire on crypto data
- **Current bottleneck**: Zero non-benchmark pairs pass strict IMF filters → trading engine has nothing to trade
- **VTS result**: Relaxed filters (VN ≤ 0.95, LQ ≥ 25) produce 7-strategy diversity and 48× signal increase

---

## Summary Table

| # | Parameter | Current | Needs Change? | Priority |
|---|-----------|---------|---------------|----------|
| 1 | VN strict (active trading) | 0.60 | **YES — CRITICAL** | P0 |
| 2 | VN passive learning | 0.80 | Likely yes | P1 |
| 3 | LQ strict (active trading) | 40 | Possibly | P1 |
| 4 | LQ relaxed (VTS) | 25 | Possibly | P2 |
| 5 | Correlation threshold | 0.75 | **YES — HIGH** | P1 |
| 6 | DI trending/choppy | 65/30 | Possibly | P2 |
| 7 | MIN_VOLUME_THRESHOLD_USD | $2M | Possibly | P2 |
| 8 | FEE_PERCENT | 0.10% | Likely yes (→ 0.26%) | P1 |
| 9 | SLIPPAGE_PERCENT | 0.15% | Possibly (→ 0.03-0.05%) | P2 |
| 10 | LQ formula inconsistency | Two formulas | Architecture fix | P1 |
| 11 | DBS thresholds | ±0.60/0.30/0.10 | Probably no | P3 |
| 12 | SQE thresholds | 0.35/0.30 | Probably no | P3 |
| 13 | Global guards | Various BPS | Probably no | P3 |
| 14 | Regime thresholds (HF7) | DX 45/55/60 | Confirm OK | P3 |

---

**Please provide your assessment of each proposed adjustment with specific recommended values and reasoning. Where you disagree with the current assessment (needs change vs. no change), explain your reasoning. For critical items (VN, correlation), please provide a specific recommended value and the logic behind it.**
