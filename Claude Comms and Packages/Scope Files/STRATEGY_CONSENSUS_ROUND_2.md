# Strategy Specification — Consensus Round 2

> **Date**: 2026-03-03
> **Context**: You are one of four LLMs (xAI/Grok, Google Gemini, ChatGPT/OpenAI, Claude/Anthropic) reviewing a mathematical specification for 8 new trading strategy signal generators for DawnTrader, a cryptocurrency algorithmic trading system on Kraken.
>
> In Round 1, each of you independently reviewed the specification and provided recommendations on bugs, safeguards, calibration values, and enhancements. Your recommendations have been collected and compared. Many items reached unanimous agreement. Some did not.
>
> **Your task in this round**: Review the full comparison below. For items where you were in the minority or where there's a split, read the other reviewers' reasoning carefully. Then state whether you **maintain** or **change** your position on each disagreement, with a brief explanation. The goal is to reach consensus — not for its own sake, but because the strongest answer usually emerges when all reasoning is on the table.

---

## How to Read This Document

- **Section 1**: Items where all 4 of you agreed. These are locked in. No action needed — just listed for completeness.
- **Section 2**: Items where 3 of you agreed and 1 dissented. The dissenter's argument is presented in full. Each of you should confirm you're comfortable with the majority position, or argue for the dissent if you find it compelling.
- **Section 3**: Items where you split 2-vs-2. Both arguments are presented in full. Each of you should state your position after reading the opposing view.

At the end, there's a response template. Please fill it out so we can tabulate final positions.

---

## Section 1: Unanimous Agreement (4/4) — Locked In

These items are decided. All four reviewers independently reached the same conclusion.

### Bugs — All Accepted

| Item | Decision | Reasoning (shared by all) |
|------|----------|--------------------------|
| **BUG-1**: pivot_shift stop uses `min()` instead of `max()` | Fix: use `max()`, use `entryPrice` consistently | For a BUY, "tighter stop" = higher price (closer to entry). `min()` selects the wider stop, contradicting the spec's stated intent. |
| **BUG-2**: support_bounce proximity score can go negative | Fix: add `max(0, ...)` | Prevents a penalty where the spec intends zero contribution. |
| **BUG-3**: reverse_impulse confidence uses current momentum instead of the min that triggered entry | Fix: use `minMomentum(RI_LOOKBACK)` in confidence | Confidence should reflect the extremity of the spike that caused the exhaustion signal, not the recovered value at the time of entry. |
| **BUG-4**: volatility_edge fibQuality can go negative | Fix: add `max(0, ...)` | Same principle as BUG-2 — prevent penalty where zero is intended. |
| **BUG-5**: pivot_shift ADX slope score can go negative | Fix: add `max(0, ...)` | Defense-in-depth even though the entry condition requires positive slope. |

### Safeguards

| Item | Decision | Reasoning |
|------|----------|-----------|
| **GUARD-1**: Minimum stop distance | Accept: `MIN_STOP_DISTANCE_BPS = 20` (0.2%) | On Kraken, a round-trip of fees + spread is ~0.15-0.20%. A stop within 0.2% of entry would be consumed by transaction friction alone. |

### Calibration

| Item | Decision | Reasoning |
|------|----------|-----------|
| **CAL-1**: support_bounce cluster tolerance | ATR-scaled: `max(0.005, ATR/price × 0.5)` | Static 0.5% fails on high-beta pairs and is too tight for BTC. ATR-scaling adapts per asset automatically, matching the spec's philosophy everywhere else. |
| **CAL-3**: adaptive_flow trend suppression | Add `ADX(14) < 25` as entry condition #6 | Regime classifiers can lag during transitions. ADX < 25 is the standard quantitative definition of "no meaningful trend" — clean, well-understood, already computed. |
| **CAL-9**: defensive_hedge confidence rebalance | Accept: 0.45 pattern / 0.25 decorrelation | A marginal signal scoring 0.27 means the confidence score provides almost no differentiation. Rebalancing lifts the floor so the score is actually useful. |
| **CAL-10**: adaptive_flow structure-based stop | Accept: use `min(threeSoldiersLow × (1 - buffer), currentPrice - ATR stop)` | Every other strategy ties its stop to structural invalidation. A purely ATR stop has no semantic meaning. The pattern low provides the anchor. |

### Enhancements

| Item | Decision | Reasoning |
|------|----------|-----------|
| **ENH-3**: inside_bar SELL RSI filter | Tighten to RSI > 45 | RSI 36-44 is functionally near oversold — selling there is chasing the bottom with limited downside room. |
| **ENH-5**: defensive_hedge BTC self-correlation shortcircuit | Add | One line of code, zero risk, avoids pointless computation for BTC/USD. |
| **ENH-7**: Switch to Spearman rank correlation | Switch from Pearson | Pearson is sensitive to outliers (flash crashes distort small-sample correlation). Spearman is more robust. All four agreed. |
| **ENH-8**: Max confidence sums table | Add to spec | Pure documentation improvement. Helps implementers verify their code and aids unit testing. |
| **ENH-9**: BUY-only direction note | Add note | Most strategies are BUY-only by design. This should be explicit so implementers don't assume SELL logic is missing. |

---

## Section 2: Majority Agreement (3 vs 1) — Confirm or Challenge

For each item below, three reviewers agreed and one dissented. The dissenting argument is presented in full. **All four of you should weigh in**: confirm the majority, or argue for the dissent.

---

### 2A: GUARD-2 — ATR Floor/Ceiling Behavior

**Majority (Gemini, ChatGPT, Claude)**: Reject signals below floor (ATR < 0.1% of price), clamp at ceiling (ATR capped at 10% of price).

**Dissent (xAI)**: Clamp at both ends (don't reject at floor, clamp small ATR to the minimum and still trade).

| Position | Argument |
|----------|----------|
| **Reject below floor** | If ATR is below 0.1% of price, the asset is effectively flatlining (or is a stablecoin). Any signal on a dead asset is noise. Clamping a tiny ATR to an artificial minimum and then trading produces meaningless stops and targets — the numbers are technically valid but the trade has no edge. Better to reject outright. |
| **Clamp both** | There may be legitimate consolidation phases where ATR temporarily drops very low before a breakout. Rejecting outright could miss the exact moment a dead asset wakes up. Clamping preserves the opportunity while bounding the math. |

---

### 2B: GUARD-4 — Fee-Adjusted R:R (Keep 1.5 vs Raise to 1.6)

**Majority (Gemini, ChatGPT, Claude)**: Keep MIN_RR_RATIO at 1.5.

**Dissent (xAI)**: Raise to 1.6 to implicitly buffer for fees and slippage.

| Position | Argument |
|----------|----------|
| **Keep 1.5** | DawnTrader already has a canonical cost model downstream (`isSignalProfitable()`) that accounts for entry/exit fees and slippage using real Kraken fee schedules. The R:R check in these strategies is a PRE-filter. Bumping it to 1.6 embeds a hidden fee assumption (what rate is 1.6 implicitly covering?) that could drift out of sync with actual fees. Don't duplicate logic in two places — it creates a maintenance liability. |
| **Raise to 1.6** | It's the simplest way to buffer fees/slippage without touching downstream logic. Crypto costs add up in frequent trading. A 0.1 bump is small insurance. Even if downstream catches it, a tighter pre-filter reduces wasted computation on signals that will fail profitability checks anyway. |

---

### 2C: CAL-2 — support_bounce Minimum Touches (2 vs 3)

**Majority (Gemini, ChatGPT, xAI)**: Increase to 3.

**Dissent (Claude)**: Keep at 2.

| Position | Argument |
|----------|----------|
| **Increase to 3** | In technical analysis, two points define a line but three confirm a structural boundary. In noisy crypto markets, two touches are too easily formed by random chance. Three touches proves the level has been genuinely tested and defended. |
| **Keep at 2** | In a 50-candle lookback window (~2 days on 1h chart), requiring 3 touches is quite demanding — it means the support level was tested 3 times in 2 days, which implies frequent revisits. That's a narrow scenario. The confidence scoring already rewards more touches naturally (the `supportScore` formula scales linearly with touch count), so 3-touch levels produce higher confidence signals while 2-touch levels produce lower confidence signals. This design lets confidence differentiate quality rather than using a hard gate that eliminates valid setups. |

---

### 2D: CAL-6 — morning_star Volume Multiplier (Keep 1.2 vs Raise to 1.5)

**Majority (Gemini, ChatGPT, Claude)**: Keep at 1.2.

**Dissent (xAI)**: Increase to 1.5.

| Position | Argument |
|----------|----------|
| **Keep 1.2** | Morning stars are reversal patterns, not breakouts. Reversals are exhaustion events — they characteristically develop on gradually increasing volume rather than explosive volume spikes. The volume gate is confirmation, not the primary signal. 1.2× already filters zero-volume ghosts. Raising to 1.5 would align it with breakout thresholds, but morning stars aren't breakouts — applying the same standard would filter legitimate reversals on moderately liquid pairs. |
| **Raise to 1.5** | Crypto reversals need more conviction than 1.2×. In crypto markets, volume can spike 5-10× on real events. A 1.2× threshold could let through marginal signals during quiet periods on low-liquidity pairs. 1.5× ensures meaningful participation behind the reversal candle. |

---

### 2E: CAL-7 — volatility_edge Target ATR Multiplier (Keep 2.5 vs Raise to 3.0)

**Majority (Gemini, ChatGPT, Claude)**: Keep at 2.5.

**Dissent (xAI)**: Increase to 3.0.

| Position | Argument |
|----------|----------|
| **Keep 2.5** | The measured move is the primary target; the ATR multiplier is the conservative fallback (the strategy uses whichever is SMALLER). In HIGH_VOL_IMPULSE, ATR is already naturally large, so 2.5× ATR produces wide absolute targets. In most cases the measured move will be smaller than 2.5× ATR anyway. Raising to 3.0 has minimal practical impact and weakens the conservative intent of the fallback. |
| **Raise to 3.0** | HIGH_VOL_IMPULSE has bigger swings by definition. The strategy is designed to exploit volatility — a wider ATR target captures more of those swings. Since the measured move caps the upside anyway, a 3.0× fallback only matters when the measured move is large, which is exactly when you want the wider target. |

---

### 2F: CAL-8 — Counter-Trend R:R Minimum (Keep 1.5 vs Raise to 2.0)

**Majority (Gemini, ChatGPT, Claude)**: Keep at 1.5, revisit after backtesting.

**Dissent (xAI)**: Raise to 2.0 for counter-trend strategies (reverse_impulse, defensive_hedge).

| Position | Argument |
|----------|----------|
| **Keep 1.5** | Counter-trend strategies already have tighter targets (1.8-2.0× ATR vs 2.5-3.0) and stricter entry requirements. Layering a 2.0 R:R minimum on top of tight targets creates a very narrow window: the stop would need to be very close to entry to produce R:R ≥ 2.0 with a 2.0× ATR target, but GUARD-1 prevents stops from being too close (minimum 0.2%). This combination could effectively kill these strategies. Let backtesting reveal the actual win rate first — that's when R:R minimums should be tuned. |
| **Raise to 2.0** | Counter-trend trades have lower win rates (~40% vs ~50% for trend-following). Basic expected value math: at 40% win rate, you need R:R ≥ 1.5 to break even BEFORE fees. After fees, you need more. A 2.0 R:R compensates for the inherently lower win rate and ensures positive expected value even at pessimistic win rates. |

---

### 2G: ENH-2 — morning_star Distance-from-SMA Filter

**Majority (Gemini, ChatGPT, xAI)**: Defer to backtesting.

**Dissent (Claude)**: Add filter now (reject if price > 5% below SMA).

| Position | Argument |
|----------|----------|
| **Defer** | Don't over-engineer filters before seeing backtest data. Adding conditions before knowing whether the problem (catching falling knives) actually manifests in practice is premature optimization. If backtesting shows morning_star signals 5%+ below SMA have poor win rates, add the filter then with empirical evidence. |
| **Add now** | A morning star forming 5%+ below the SMA is a fundamentally different trade than one 0.3% below. The first is catching a falling knife in a crash; the second is buying a pullback in an uptrend. The 5% threshold is generous enough to never filter valid pullbacks, but it prevents the most dangerous scenario (buying into multi-day waterfall declines). This is cheap insurance — one condition, no complexity. |

---

### 2H: ENH-4 — Regime Stability Filter for Hybrids

**Majority (Gemini, ChatGPT, Claude)**: Defer.

**Dissent (xAI)**: Add filter (no hybrid signal if regime changed within last 3 candles).

| Position | Argument |
|----------|----------|
| **Defer** | The regime classifier's behavior during transitions isn't well-characterized. Adding a filter for something we haven't measured yet is premature. Observe in backtesting first, then add if needed. |
| **Add now** | Regime stability is crucial in crypto. A regime that just changed is by definition unstable — the classifier might be wrong or might flip back. Trading a hybrid strategy (which depends on regime context) during the first 3 candles of a new regime is high risk. This is a simple, low-cost guard. |

---

### 2I: ENH-6 — volatility_edge Dynamic Measured Move Multiplier

**Majority (Gemini, ChatGPT, Claude)**: Keep fixed at 0.90.

**Dissent (xAI)**: Add dynamic scaling (0.95 when volPercentile > 90).

| Position | Argument |
|----------|----------|
| **Keep fixed** | The dynamic scaling adds complexity for a marginal improvement. The relationship between volPercentile and pattern completion rate isn't established — it's a hypothesis, not a proven relationship. Keep it simple, observe in backtesting, then add nuance if the data supports it. |
| **Add dynamic** | When volatility is extreme (>90th percentile), the market has more energy to complete the measured move. Rewarding higher conviction with a slightly closer-to-full target (0.95 vs 0.90) is a small, logical optimization that could meaningfully improve returns on the strongest signals. |

---

### 2J: ENH-10 — reverse_impulse Momentum Threshold (-0.005 vs -0.01)

**Majority (Gemini, ChatGPT, xAI)**: Change to -0.01.

**Dissent (Claude)**: Keep at -0.005.

| Position | Argument |
|----------|----------|
| **Change to -0.01** | The entry conditions include BOTH momentum < threshold AND RSI < 35. These two conditions are partially correlated (~60% overlap) — when momentum is strongly negative, RSI tends to be low. Making the momentum threshold stricter (-0.01) creates better mathematical separation between the two requirements, ensuring each condition provides genuinely independent filtering. At -0.005, many signals that pass the momentum check also trivially pass RSI — the two gates aren't doing separate work. |
| **Keep at -0.005** | RSI and momentum measure different things: RSI measures cumulative displacement (how far the asset has moved), while momentum measures velocity (how fast it's moving right now). The 60% correlation still means 40% independent information. A gradual decline can produce low RSI with modest momentum (passes RSI, fails momentum at -0.01). A sharp one-candle spike can produce extreme momentum but RSI may not have caught up yet (passes momentum, fails RSI). The -0.005 threshold captures "moderate but genuine overextension" cases that are the bread and butter of mean-reversion trades. Doubling it to -0.01 restricts the strategy to only extreme crash events, which are rare. |

---

## Section 3: True Splits (2 vs 2) — All Must Weigh In

These items had no majority. Both sides have strong arguments. **Every reviewer must state their position after reading the opposing argument.**

---

### SPLIT-1: BUG-6 — volatility_edge Measured Move Target Base

**The question**: Should the ABCD measured move target be calculated from `cPointLow` (the C trough) or `cPointHigh` (the C breakout level)?

| cPointLow — Textbook (Gemini, ChatGPT, xAI) | cPointHigh — Conservative (Claude) |
|-----------------------------------------------|-------------------------------------|
| Harmonic patterns derive their energy from structural pivots (troughs and peaks). The classic ABCD measured move theory measures C→D from the C TROUGH, not the C breakout. The formula `targetPrice = cPointLow + (bPointHigh - aPointLow) × 0.90` is the mathematically correct expression. Using cPointHigh artificially truncates the measured move by the width of the C consolidation range. Since you're already clipping to 90% of the target, the wider base is safe — the 10% haircut provides the conservatism. | You don't enter at cPointLow — you enter at the breakout above cPointHigh. The distance from cPointLow to cPointHigh is distance the trade never captured (price was below entry). Measuring from cPointLow overstates the reward when calculating R:R because it includes distance between the structural base and the actual entry. The R:R check should reflect what the trade can actually capture: distance from entry to target. In crypto, ABCD patterns frequently undershoot the theoretical D-point, so conservative measurement is wise. Furthermore, the 0.90 multiplier was calibrated under the assumption that cPointHigh was the base. Switching to cPointLow AND keeping 0.90 produces a wider target than either approach alone — arguably too aggressive. |

**Additional context**: The entry price for this strategy is `cPointHigh × (1 + VE_BREAKOUT_BUFFER)`. The stop is at `cPointLow × (1 - VE_STOP_BUFFER)`. So:
- With cPointLow base: target includes distance from cPointLow to cPointHigh (which the trader didn't capture) plus 90% of the A→B impulse leg
- With cPointHigh base: target is purely the distance from near-entry to 90% of the impulse leg measured from the breakout point

---

### SPLIT-2: CAL-5 — pivot_shift ADX Slope Minimum

**The question**: How should the ADX noise filtering work — a higher single threshold, or persistence at the original threshold?

| Raise to 1.0 (xAI, Claude) | Require 2 consecutive positive slopes at 0.5 (Gemini, ChatGPT) |
|-----------------------------|----------------------------------------------------------------|
| ADX noise of ±1-2 points per candle is well-documented in crypto. A 0.5-point threshold is within the noise floor — it's essentially testing "did ADX move at all?" rather than "is a trend forming?" At 1.0, you're catching genuine trend formation (ADX moving up 1+ points per candle is a meaningful signal) while filtering jitter. This is simpler to implement, simpler to backtest, and has one clear threshold to tune. | Rather than raising the bar for a single reading, require persistence. Two consecutive positive slopes proves the trend is building over time, not just a one-candle blip. This catches real momentum while tolerating lower individual readings. A single 1.0 jump could be a one-time spike (e.g., after a sudden volatility expansion), while two consecutive 0.5+ readings demonstrate sustained directional pressure. ADX is inherently a lagging oscillator — requiring persistence is more aligned with how ADX actually behaves. |

---

### SPLIT-3: CAL-11 — defensive_hedge Correlation Threshold (0.30 vs 0.40)

**The question**: How strictly should the BTC decorrelation requirement be set?

**Context**: DawnTrader scans ~40-60 Kraken crypto pairs. Most crypto altcoins have BTC correlations of 0.5-0.9 during normal conditions, rising to 0.9+ during broad sell-offs. The strategy operates in BEAR_VOLATILE regime. All four reviewers agreed to keep the window at 30 candles and switch to Spearman rank correlation.

| Keep at 0.30 — Strict (xAI, Claude) | Raise to 0.40 — Moderate (Gemini, ChatGPT) |
|--------------------------------------|---------------------------------------------|
| The whole thesis of "defensive hedge" is finding assets that are structurally decorrelated from BTC during bear markets. At 0.40 correlation, the asset still has a meaningful positive relationship with BTC — when BTC falls, this asset falls with it 40% of the time. That's not a hedge. If no assets qualify at 0.30, that's valuable information: it means no genuine hedge opportunity exists, and the strategy correctly stays out. Low signal frequency is a feature for a counter-trend hedge strategy, not a bug. With ~50 pairs on Kraken, strictness yields quality over quantity. | With only 40-60 pairs in the universe, a 0.30 threshold is so restrictive that the strategy may produce near-zero signals over extended periods. A strategy that never fires provides zero value regardless of theoretical soundness. At 0.40, the asset still has LOW correlation with BTC — it's in the bottom quartile of crypto correlations. This is "relatively decorrelated" in a market where most assets correlate 0.7+. Furthermore, we've already switched to Spearman (which tends to produce slightly different correlation values than Pearson), and raised the pattern weight in confidence scoring. These changes shift the overall strategy dynamics, and 0.40 may produce signal frequency closer to what 0.30 would have produced under the original Pearson + old weights configuration. |

---

## Response Template

Please copy the template below and fill in your positions. For items in Section 1, no response is needed (they're locked). For Section 2, state whether you **confirm the majority** or **switch to the dissent**. For Section 3, state your position and a one-sentence reason.

```
## [Your LLM Name] — Round 2 Positions

### Section 2: Majority Items (confirm or switch)

2A (GUARD-2 ATR behavior):     [confirm majority / switch to dissent]
2B (GUARD-4 R:R 1.5 vs 1.6):  [confirm majority / switch to dissent]
2C (CAL-2 touches 2 vs 3):    [confirm majority / switch to dissent]
2D (CAL-6 MS vol 1.2 vs 1.5): [confirm majority / switch to dissent]
2E (CAL-7 VE ATR 2.5 vs 3.0): [confirm majority / switch to dissent]
2F (CAL-8 CT R:R 1.5 vs 2.0): [confirm majority / switch to dissent]
2G (ENH-2 MS SMA filter):     [confirm majority / switch to dissent]
2H (ENH-4 regime stability):  [confirm majority / switch to dissent]
2I (ENH-6 VE dynamic mult):   [confirm majority / switch to dissent]
2J (ENH-10 RI momentum):      [confirm majority / switch to dissent]

### Section 3: Split Items (state position)

SPLIT-1 (BUG-6 target base):  [cPointLow / cPointHigh] — reason:
SPLIT-2 (CAL-5 ADX slope):    [raise to 1.0 / 2 consecutive slopes] — reason:
SPLIT-3 (CAL-11 DH threshold):[keep 0.30 / raise to 0.40] — reason:

### Changed Positions (if any)

[List any items where you changed your Round 1 position and why, or "None"]
```

---

*Please return your completed template. Once all four responses are collected, we will tabulate final consensus and lock the specification.*
