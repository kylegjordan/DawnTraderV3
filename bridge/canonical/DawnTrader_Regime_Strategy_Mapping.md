# DawnTrader Regime–Strategy Mapping

> **Schema Version**: regime-mapping/v3.0.0
> **Last Updated**: 2026-04-12T00:00:00Z
> **Source**: Canonical TypeScript (auto-generated)

## DriftScore Integration

DriftScore quantifies the statistical distance between a strategy's operating environment
and its canonical regime's ideal volatility/trend profile. See `drift-definitions.ts` for
ideal Z-score targets and weights per regime.

---

# Asset class: crypto_spot

## TREND_FRIENDLY_STABLE

**Metrics**: Low noise, low volatility, orderly price action with confirmed directional trend. Post-B62: DBS score is a classifier input; TFS typically correlates with moderate-to-strong directional DBS (|DBS| in 0.15-0.50 band). Post-B63: strong_bull_trend is registered here when DBS crosses 0.35 threshold and routes via the quant-strong_trend sourcePool.

| Strategy | Signal Type | Pattern | Secondary Metrics |
|----------|-------------|---------|-------------------|
| VWAP Pullback | QUANT | — | VWAP deviation < −1σ • Momentum > 0 • Blocked when DBS ≤ −0.35 (counter-trend LONG guard, B63 Item 10) • Also eligible in strong-trend lane at DBS ≥ 0.35 with Variant E geometry (4×ATR stop, 3R target, B63 Items 11–12) |
| Morning Star / Evening Star | PATTERN | MORNING_STAR | 3-bar sequence; momentum flip > 0.3% • Blocked when DBS ≥ 0.35 (B63 Item 6, lane routing) or DBS ≤ −0.35 (counter-trend LONG guard, B63 Item 10) |
| Pivot Shift | HYBRID | MORNING_STAR | RSI 45–55 • ADX slope > 0.5 |
| Strong Bull Trend | QUANT | — | DBS ≥ 0.35 • N6 Donchian breakout + 0.15×ATR • body ≤ 1.5×ATR (B63.1: slope gate dropped, N 12→6) |

- **Risk Multiplier**: 1.2
- **Min Confidence**: 0.65

---

## HIGH_VOLATILITY_UNSTABLE

**Metrics**: High volatility, high noise, wide dispersion with strong trend confirmation. Post-B62: DBS-aware classification distinguishes HVU from IE based on volatility-first vs momentum-first dominance.

| Strategy | Signal Type | Pattern | Secondary Metrics |
|----------|-------------|---------|-------------------|
| Mean Reversion | QUANT | — | RSI < 30 or > 70 • Price deviation > 1σ |
| Reverse Impulse | HYBRID | PINBAR | Volume > 1.5× avg • Momentum spike < −0.5% • Blocked when |DBS| ≥ 0.35 (B63 Items 6 + 10 — counter-trend LONG guard + positive-DBS lane routing) |
| Defensive Hedge | HYBRID | ENGULFING | BTC Corr < 0.3 • Vol Offset > 1σ • Blocked when |DBS| ≥ 0.35 (B63 Items 6 + 10) |
| Inside Bar Reversal | PATTERN | INSIDE_BAR | Parent > Child × 1.3 • Breakout Volume > 1.5× avg |

- **Risk Multiplier**: 0.7
- **Min Confidence**: 0.75

---

## RANGE_BOUND_STABLE

**Metrics**: Flat market with no directionality and narrow range. Post-B62: DBS typically near-neutral (|DBS| < 0.15). RBS is where mean-reversion and range-bound strategies (range_trade, support_bounce) have their strongest historical performance. Note: B63 Item 18 audit found current RegimeWeight formula produces low RW values in RBS despite strong strategy performance — recalibration targeted in B66.

| Strategy | Signal Type | Pattern | Secondary Metrics |
|----------|-------------|---------|-------------------|
| Range Trading | QUANT | — | Bollinger Bandwidth < 0.14 • RSI 45–55 • ADX < 20 |
| Support Bounce | PATTERN | PINBAR | Price ≈ Local Min ± 1σ • Volume > 1.2× avg |
| ABCD Long | QUANT | — | AB:CD ≈ 1.0 • Volume > 1.2× avg |
| Adaptive Flow | HYBRID | TRI_STAR | Momentum inversion ≥ 3 • Volatility percentile > 70% |

- **Risk Multiplier**: 0.9
- **Min Confidence**: 0.6

---

## IMPULSE_EXPANSION

**Metrics**: Sharp directional moves with trend acceleration and violent expansion. Post-B62 (2026-04-19): classification incorporates DBS score alongside momentum/ADX/volatility — pairs entering IE typically show |DBS| >= 0.50 combined with rapid momentum expansion. Post-B63 (2026-04-21): IE-registered strategies are sma_trend_ride, breakout, vwap_bounce, volatility_edge, dhma, and strong_bull_trend (which routes via quant-strong_trend sourcePool when DBS crosses 0.35).

| Strategy | Signal Type | Pattern | Secondary Metrics |
|----------|-------------|---------|-------------------|
| SMA Trend Ride | QUANT | — | SMA(50) > SMA(100) • ADX > 25 • RSI 55–70 • Blocked when DBS ≤ −0.35 (counter-trend LONG guard, B63 Item 10) |
| Breakout | QUANT | — | Momentum > +0.7% • Volume > 2× avg |
| VWAP Bounce | QUANT | — | VWAP deviation > +1σ • Momentum −0.3–−0.6% |
| Volatility Edge | HYBRID | ABCD | Volatility Percentile > 80 • Regime mismatch = True |
| DHMA | QUANT | — | HMA(9) cross HMA(21) • ADX flat |
| Strong Bull Trend | QUANT | — | DBS ≥ 0.35 • N6 Donchian breakout + 0.15×ATR • body ≤ 1.5×ATR (B63.1: slope gate dropped, N 12→6) |

- **Risk Multiplier**: 0.8
- **Min Confidence**: 0.7

---

## STRUCTURAL_TRANSITION

**Metrics**: Boundary state between regimes with weakening trend and volatility uplift. Post-B62: DBS-aware classification flags pairs mid-transition before full regime commitment. STRUCTURAL_TRANSITION is often a short-lived regime between TFS and HVU/IE as conditions intensify.

| Strategy | Signal Type | Pattern | Secondary Metrics |
|----------|-------------|---------|-------------------|
| Liquidity Trap | QUANT | — | Wick/Body > 2 or Depth Imbalance > 1.4 |
| Pivot Shift | HYBRID | MORNING_STAR | RSI 45–55 • ADX slope > 0.5 |
| Morning Star / Evening Star | PATTERN | MORNING_STAR | 3-bar sequence; momentum flip > 0.3% |

- **Risk Multiplier**: 0.85
- **Min Confidence**: 0.55

---

# Asset class: xstock_spot

## TREND_FRIENDLY_STABLE

**Metrics**: Low noise, low volatility, orderly price action with confirmed directional trend. Post-B62: DBS score is a classifier input; TFS typically correlates with moderate-to-strong directional DBS (|DBS| in 0.15-0.50 band). Post-B63: strong_bull_trend is registered here when DBS crosses 0.35 threshold and routes via the quant-strong_trend sourcePool.

| Strategy | Signal Type | Pattern | Secondary Metrics |
|----------|-------------|---------|-------------------|
| VWAP Pullback | QUANT | — | VWAP deviation < −1σ • Momentum > 0 • Blocked when DBS ≤ −0.35 (counter-trend LONG guard, B63 Item 10) • Also eligible in strong-trend lane at DBS ≥ 0.35 with Variant E geometry (4×ATR stop, 3R target, B63 Items 11–12) |
| Morning Star / Evening Star | PATTERN | MORNING_STAR | 3-bar sequence; momentum flip > 0.3% • Blocked when DBS ≥ 0.35 (B63 Item 6, lane routing) or DBS ≤ −0.35 (counter-trend LONG guard, B63 Item 10) |
| Pivot Shift | HYBRID | MORNING_STAR | RSI 45–55 • ADX slope > 0.5 |
| Strong Bull Trend | QUANT | — | DBS ≥ 0.35 • N6 Donchian breakout + 0.15×ATR • body ≤ 1.5×ATR (B63.1: slope gate dropped, N 12→6) |
| Opening Range Breakout | QUANT | — | xstock_spot 24/5 only • 14:30–15:00 UTC range • 0.15×ATR breakout buffer • 1.5× vol multiple • R:R 2:1 |

- **Risk Multiplier**: 1.2
- **Min Confidence**: 0.65

---

## HIGH_VOLATILITY_UNSTABLE

**Metrics**: High volatility, high noise, wide dispersion with strong trend confirmation. Post-B62: DBS-aware classification distinguishes HVU from IE based on volatility-first vs momentum-first dominance.

| Strategy | Signal Type | Pattern | Secondary Metrics |
|----------|-------------|---------|-------------------|
| Mean Reversion | QUANT | — | RSI < 30 or > 70 • Price deviation > 1σ |
| Reverse Impulse | HYBRID | PINBAR | Volume > 1.5× avg • Momentum spike < −0.5% • Blocked when |DBS| ≥ 0.35 (B63 Items 6 + 10 — counter-trend LONG guard + positive-DBS lane routing) |
| Inside Bar Reversal | PATTERN | INSIDE_BAR | Parent > Child × 1.3 • Breakout Volume > 1.5× avg |

- **Risk Multiplier**: 0.7
- **Min Confidence**: 0.75

---

## RANGE_BOUND_STABLE

**Metrics**: Flat market with no directionality and narrow range. Post-B62: DBS typically near-neutral (|DBS| < 0.15). RBS is where mean-reversion and range-bound strategies (range_trade, support_bounce) have their strongest historical performance. Note: B63 Item 18 audit found current RegimeWeight formula produces low RW values in RBS despite strong strategy performance — recalibration targeted in B66.

| Strategy | Signal Type | Pattern | Secondary Metrics |
|----------|-------------|---------|-------------------|
| Range Trading | QUANT | — | Bollinger Bandwidth < 0.14 • RSI 45–55 • ADX < 20 |
| Support Bounce | PATTERN | PINBAR | Price ≈ Local Min ± 1σ • Volume > 1.2× avg |
| ABCD Long | QUANT | — | AB:CD ≈ 1.0 • Volume > 1.2× avg |
| Adaptive Flow | HYBRID | TRI_STAR | Momentum inversion ≥ 3 • Volatility percentile > 70% |

- **Risk Multiplier**: 0.9
- **Min Confidence**: 0.6

---

## IMPULSE_EXPANSION

**Metrics**: Sharp directional moves with trend acceleration and violent expansion. Post-B62 (2026-04-19): classification incorporates DBS score alongside momentum/ADX/volatility — pairs entering IE typically show |DBS| >= 0.50 combined with rapid momentum expansion. Post-B63 (2026-04-21): IE-registered strategies are sma_trend_ride, breakout, vwap_bounce, volatility_edge, dhma, and strong_bull_trend (which routes via quant-strong_trend sourcePool when DBS crosses 0.35).

| Strategy | Signal Type | Pattern | Secondary Metrics |
|----------|-------------|---------|-------------------|
| SMA Trend Ride | QUANT | — | SMA(50) > SMA(100) • ADX > 25 • RSI 55–70 • Blocked when DBS ≤ −0.35 (counter-trend LONG guard, B63 Item 10) |
| Breakout | QUANT | — | Momentum > +0.7% • Volume > 2× avg |
| VWAP Bounce | QUANT | — | VWAP deviation > +1σ • Momentum −0.3–−0.6% |
| Volatility Edge | HYBRID | ABCD | Volatility Percentile > 80 • Regime mismatch = True |
| DHMA | QUANT | — | HMA(9) cross HMA(21) • ADX flat |
| Strong Bull Trend | QUANT | — | DBS ≥ 0.35 • N6 Donchian breakout + 0.15×ATR • body ≤ 1.5×ATR (B63.1: slope gate dropped, N 12→6) |
| Opening Range Breakout | QUANT | — | xstock_spot 24/5 only • 14:30–15:00 UTC range • 0.15×ATR breakout buffer • 1.5× vol multiple • R:R 2:1 |

- **Risk Multiplier**: 0.8
- **Min Confidence**: 0.7

---

## STRUCTURAL_TRANSITION

**Metrics**: Boundary state between regimes with weakening trend and volatility uplift. Post-B62: DBS-aware classification flags pairs mid-transition before full regime commitment. STRUCTURAL_TRANSITION is often a short-lived regime between TFS and HVU/IE as conditions intensify.

| Strategy | Signal Type | Pattern | Secondary Metrics |
|----------|-------------|---------|-------------------|
| Liquidity Trap | QUANT | — | Wick/Body > 2 or Depth Imbalance > 1.4 |
| Pivot Shift | HYBRID | MORNING_STAR | RSI 45–55 • ADX slope > 0.5 |
| Morning Star / Evening Star | PATTERN | MORNING_STAR | 3-bar sequence; momentum flip > 0.3% |

- **Risk Multiplier**: 0.85
- **Min Confidence**: 0.55

---
