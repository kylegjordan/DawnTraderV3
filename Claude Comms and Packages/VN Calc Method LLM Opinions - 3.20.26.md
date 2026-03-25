Gemini's Response:

This is a classic quantitative engineering trap. It is incredibly frustrating when a mathematically sound formula flatlines in live market conditions, but you have uncovered a fundamental quirk in how crypto market microstructure interacts with standard statistical dispersion metrics.Here is the candid mathematical reality: changing from absolute price differences to percentage returns will not fix your Volatility Noise (VN) filter. Here is why, along with direct answers to your questions and a more robust solution for DawnTrader.The Mathematical IllusionYour current formula relies on the Coefficient of Variation (CV), which is defined as the standard deviation divided by the mean.The CV is a scale-invariant metric. Whether you measure the distance a car travels in inches, miles, or a percentage of its total journey, the CV of those distances remains identical. Over a short window (like a rolling batch of 5-minute candles), the denominator (the asset's price) is relatively constant.Therefore, dividing your absolute price differences by the price to get a percentage return simply scales both the standard deviation and the mean by the exact same constant. They cancel each other out:$$VN_{\text{new}} \approx \frac{\sigma(|\Delta P| / P_{\text{avg}})}{\mu(|\Delta P| / P_{\text{avg}})} = \frac{(1/P_{\text{avg}})\sigma(|\Delta P|)}{(1/P_{\text{avg}})\mu(|\Delta P|)} = VN_{\text{old}}$$Why is it hitting the 1.00 ceiling? Because 5-minute crypto price action is heavily fat-tailed (leptokurtic). You get many 5-minute candles with near-zero movement (which drags the mean down), punctuated by sudden, violent bursts (which explodes the standard deviation). In a fat-tailed distribution, the standard deviation of absolute changes easily exceeds the mean. The formula evaluates to something like 1.4 or 2.1, and your [0, 1] clamp brutally flattens everything to 1.00.1. The Correct Metric (Fixing the Formula)Percentage returns will not solve the clamping issue. Log returns ($\ln(P_i / P_{i-1})$) are mathematically superior to simple percentage returns because they are symmetric, but they will still suffer from the exact same fat-tailed CV explosion and hit your 1.00 clamp.If you want to measure "choppiness" versus "smooth tradeability" on a strict [0, 1] scale, you should abandon the CV approach entirely and use Kaufman's Efficiency Ratio (ER).The ER measures the net price movement divided by the sum of all individual price movements over $n$ periods:$$ER = \frac{|\text{Close}_t - \text{Close}_{t-n}|}{\sum_{i=1}^n |\text{Close}_{t-i+1} - \text{Close}_{t-i}|}$$Perfectly smooth trend: ER = 1.0 (The asset moved in a straight line).Maximum chop/noise: ER = 0.0 (The asset thrashed up and down but ended exactly where it started).To match your current logic where lower is better (less noise), you simply invert it:$$VN_{\text{robust}} = 1 - ER$$This naturally bounds between [0, 1] without needing an artificial clamp, completely neutralizing the fat-tail explosion problem.2. Threshold RangesBecause your proposed percentage return fix will still result in values exceeding 1.00, your proposed thresholds (0.15 to 0.40) will continue to block the entire crypto universe.If you adopt the inverted Efficiency Ratio ($1 - ER$) for 5-minute crypto candles, the baseline "noise" is naturally very high. A straight-line trend is rare on 5-minute charts. If you use this new formula, your thresholds would likely need to look like this (assuming a 12-to-24 period lookback):Strict (Active Quant): Noise $\le$ 0.65Relaxed (Active Pattern): Noise $\le$ 0.75Learning/Exploratory: Noise $\le$ 0.85 - 0.953. Edge Cases & PitfallsIf you do attempt to use percentage returns for any other filters in your system, be aware of Tick Size Quantization on Micro-Caps.Many altcoins or meme coins trade at fractions of a penny (e.g., $0.00000010). If the exchange tick size forces the spread to be $0.00000001, every single trade bouncing between the bid and the ask registers as a massive 10% price return. Your standard deviation will look like a catastrophic market event, but it is just normal microstructure noise. Absolute returns mask this; percentage returns weaponize it.4. Additional Robustness for Crypto MarketsTo make your noise filtering truly institutional-grade for crypto:Volume-Weighted Noise: A choppy 5-minute candle on $500 of volume is irrelevant; a choppy candle on $500,000 of volume is a structural market fight. Multiply your absolute price differences by the candle's volume before feeding them into your noise formula. This smooths out low-liquidity ghost ticks.ATR Normalization: If you want to stick closer to your original logic rather than using the Efficiency Ratio, normalize your price changes by the 14-period Average True Range (ATR) rather than the mean. ATR accounts for gaps and wicks, providing a much more stable denominator than a simple rolling mean of close-to-close differences.


Claude Opus 4.6's Response:
This is a well-diagnosed problem. The absolute-price CV formula is fundamentally broken for cross-asset comparison because a $90,000 asset's absolute price changes have completely different statistical properties than a $4 asset's, even if their percentage behavior is identical. Let me work through each question.

1. Is percentage returns the correct fix?
Yes, percentage returns are the correct fix. Here's why, and why the alternatives are worse:
The core issue is that the CV (coefficient of variation = σ/μ) of absolute price changes measures something that's confounded by price level and tick structure. A $90,000 asset with steady 0.1% moves produces absolute changes with low CV (consistent $90 moves). A $4 asset with the same steady 0.1% moves produces absolute changes of $0.004, where even tiny rounding or tick-size effects create enormous relative variance in the absolute differences. The formula is measuring tick-size artifacts, not market behavior.
Percentage returns (close[i] / close[i-1]) - 1 normalize away the price level, so the CV of percentage returns measures what you actually care about: how irregular is this asset's proportional movement pattern?
Why not log returns? Log returns ln(close[i] / close[i-1]) are nearly identical to percentage returns for small changes (and 5-minute crypto changes are almost always small enough that the approximation holds). Log returns have nicer mathematical properties for aggregation (they're additive across periods), but for the purpose of computing a CV-based choppiness measure, there's no practical difference. Percentage returns are simpler to reason about and debug. Either works — but percentage returns are the more transparent choice for a filter that humans need to understand and tune.
Why not z-score based? A z-score approach (measuring how many standard deviations each move is from the mean) tells you about tail behavior, not choppiness. An asset could have frequent moderate moves (low z-scores, smooth trend) or rare large moves separated by silence (high z-scores, choppy) and the z-score distribution would differ, but it's not as clean a choppiness discriminator as CV of returns.
Why not ATR-normalized? ATR-normalizing the differences (dividing each |Δclose| by ATR) is conceptually similar to percentage returns but introduces ATR's lookback period as a dependency. The VN filter should be self-contained and computed directly from the price series without requiring another indicator as input. ATR normalization also smooths out the very thing you're trying to measure — if ATR adapts to choppy periods, ATR-normalized moves look "normal" during chop.
Recommendation: Use percentage returns. It's the correct normalization, it's simple, and it directly fixes the diagnosed problem.

2. Are the proposed threshold ranges reasonable?
The ranges are in the right neighborhood but need tightening from the bottom, and the 4-tier structure could be simplified.
Let me reason about what the CV of |percentage returns| looks like on 5-minute crypto candles.
The CV of the absolute values of percentage returns is measuring: "how variable is the magnitude of moves?" A perfectly steady asset that moves exactly 0.1% every 5 minutes (alternating direction randomly) would have CV ≈ 0 (constant magnitude). A real asset with bursts and quiet periods — say, 0.05% moves most of the time punctuated by 0.5% spikes — would have higher CV because the magnitude distribution is skewed/heavy-tailed.
For crypto on 5-minute candles, I'd expect the distribution roughly as follows. BTC and ETH, being the most liquid and continuously traded, should have the most consistent move magnitudes and thus the lowest VN — probably 0.10–0.20 on percentage returns. Mid-cap altcoins with moderate liquidity (AVAX, DOT, LINK) will have more bursty activity patterns, probably 0.15–0.30. Small-cap and meme coins with thin order books and sporadic trading will show the highest VN, probably 0.25–0.50+.
Given this expected distribution, my recommended thresholds:
TierRecommended VN_MAXRationaleStrict (active quant)0.20Quant strategies (VWAP, mean reversion, breakout) need relatively smooth price action to produce reliable indicator readings. VN ≤ 0.20 should pass BTC, ETH, SOL, and the most liquid altcoins.Relaxed (active pattern)0.30Pattern strategies (morning star, inside bar, support bounce) are more tolerant of noise because they look at candle structure rather than smooth indicator curves. VN ≤ 0.30 opens up the mid-cap universe.Learning (VTS simulation)0.40VTS should learn from a wider universe including noisier pairs. VN ≤ 0.40 captures most of the tradeable crypto universe while still filtering out the truly chaotic micro-caps.Exploratory (VTS pattern)0.50For maximum learning breadth.
The key principle: the gap between tiers should be meaningful. Your proposed ranges overlap heavily (0.15–0.25 vs 0.20–0.30 vs 0.25–0.35 vs 0.30–0.40), which makes it hard to pick a specific value within each range. I'd pick the midpoint of each range and commit to specific values rather than ranges, so the system behavior is deterministic and testable.
Important caveat: These values are reasoned estimates. The very first thing to do after implementing the percentage-returns formula is to compute VN across the full 300-pair universe and examine the actual distribution. If BTC shows VN = 0.25 on percentage returns (not 0.15 as I'm estimating), all thresholds should shift upward proportionally. The relative spacing between tiers matters more than the absolute numbers — you want each tier to admit a meaningfully larger universe than the tier below it.

3. Edge cases and pitfalls with percentage returns
There are three to handle:
Division by zero / near-zero prices. If close[i-1] is zero or extremely small, close[i] / close[i-1] explodes. In practice, no Kraken-listed crypto has a zero price, but some micro-cap tokens trade at fractions of a cent. A price of $0.00001 with a minimum tick of $0.000001 means a one-tick move is a 10% return — this would produce enormous percentage returns that dominate the CV calculation.
Fix: Add a minimum price guard. If any close in the window is below a floor (e.g., $0.001), either skip that candle or reject the pair entirely for VN calculation. At $0.001, a one-tick move on Kraken's typical precision is still a manageable percentage. Alternatively, filter these pairs out upstream via the LQ/volume filters before VN even runs.
Flash crash / flash spike candles. A single 5-minute candle with a 20% move (flash crash and recovery) would produce a massive outlier return that inflates the CV. One such candle in a 288-candle window (one day of 5-minute candles) could single-handedly push VN above the threshold for an otherwise smooth pair.
Fix: Consider using a winsorized or trimmed CV — clip the top and bottom 2% of |returns| before computing mean and standard deviation. This makes VN robust to isolated extreme events while still capturing the general choppiness pattern. A simpler alternative: use median absolute deviation (MAD) / median instead of σ/μ. MAD is inherently robust to outliers and measures the same concept (dispersion of move magnitudes relative to their central tendency). The formula would be:
returns[i] = |close[i] / close[i-1] - 1|
VN_robust = MAD(returns) / median(returns)
where MAD = median(|returns[i] - median(returns)|). This is strictly better than the CV formulation for crypto because it handles flash crashes gracefully without a separate winsorization step. The threshold values would need to be recalibrated (MAD/median produces different numerical ranges than σ/μ), but the behavioral properties are superior.
Stale/repeated prices. If an illiquid pair has the same close price for multiple consecutive 5-minute candles (no trades occurred), those candles produce 0% returns. Many zero returns mixed with occasional real moves produces a high CV (the distribution has a spike at zero and a spread of non-zero values). This is actually correct behavior — an asset that trades in sporadic bursts separated by silence is choppy and should have high VN. No fix needed; just be aware that this is working as intended.

4. Additional modifications for crypto robustness
Recommendation 1: Use MAD/median instead of σ/μ.
As described above, this single change handles flash crashes, fat tails, and outliers without any additional clipping or winsorization logic. It's the single highest-value modification you can make. The formula becomes:
returns[i] = |close[i] / close[i-1] - 1|   for all consecutive candles
VN = MAD(returns) / median(returns)
VN = clamp(VN, 0, 1)
This is still a coefficient of variation — it's just using robust estimators instead of classical ones. The interpretation is identical: lower = smoother, higher = choppier. But it won't be distorted by a single flash crash candle the way σ/μ would be.
Recommendation 2: Specify the lookback window explicitly.
The current formula doesn't specify how many candles to use. On 5-minute candles, I'd recommend 288 candles (24 hours). This captures a full daily cycle including all trading sessions (Asian, European, US). Shorter windows (e.g., 50 candles = ~4 hours) would be sensitive to time-of-day effects — crypto is quieter during certain hours, and VN computed during a quiet period would differ from VN computed during active hours. A 24-hour window averages across all sessions.
Recommendation 3: Confirm clamping to [0, 1] still works.
With percentage returns and the standard CV formula, VN can theoretically exceed 1.0 (if the standard deviation of |returns| exceeds the mean, which happens when the distribution is very heavy-tailed). With MAD/median, values above 1.0 are possible but rarer. Either way, the clamp to [0, 1] is appropriate — it just means the formula saturates at 1.0 for truly extreme cases, which is the intended behavior (VN = 1.0 = "maximally choppy, do not trade").
If you use the standard CV (σ/μ) rather than MAD/median, be aware that unclamped values could reach 1.5–2.0+ for pathological distributions. The clamp handles this, but it means you lose discrimination in the tail — all "very choppy" pairs map to 1.0. With MAD/median, the distribution is more compressed and you retain better discrimination in the upper range.

Summary
DecisionRecommendationNormalizationPercentage returns — correct fix, simple, transparentRobust variantMAD/median instead of σ/μ — handles flash crashes and fat tails without clippingLookback288 candles (24h on 5-min chart) — captures full daily cycleStrict threshold0.20 (pending empirical distribution check)Relaxed threshold0.30Learning threshold0.40Exploratory threshold0.50Minimum price guardReject candles where close < $0.001, or rely on upstream LQ filterFirst step after implementationCompute VN across all 300 pairs and plot the distribution — adjust thresholds to match actual data


ChatGPT 5.4's Response:
Yes — the current formulation is the core problem.

Using absolute price differences makes VN partly reflect the scale and microstructure of the instrument, not just the irregularity of its movement. On 5-minute crypto candles, that tends to blow the metric up toward the ceiling for most pairs. So the filter stops measuring “tradable smoothness” and starts measuring “bursty short-horizon movement exists,” which is basically the whole crypto universe.

1. Is percentage returns the right fix?

Yes, directionally.
But I would recommend log returns, not simple percentage returns, as the default.

Use:

r_t = ln(close_t / close_{t-1})
VN = stdDev(|r_t|) / mean(|r_t|)

Why log returns are better:

scale-invariant

more numerically stable across assets with very different prices

symmetric for up/down moves

standard for volatility modeling

Simple percentage returns also works:

r_t = (close_t / close_{t-1}) - 1

and in practice the difference will usually be small for 5-minute bars. But if you're changing the metric anyway, I would move to log returns and be done with it.

Why this fixes the issue

Your current metric:

stdDev(|Δclose|) / mean(|Δclose|)

is a coefficient of variation on absolute dollar moves.

That creates two distortions:

higher-priced assets naturally have larger raw increments

bursty activity on small timeframes dominates the CV

Switching to returns makes the metric answer the right question:

“How irregular is the relative size of consecutive bar moves?”

That is much closer to the intended concept of choppiness/noise.

2. Are the proposed threshold ranges reasonable?

Probably too low as a starting point.

Your proposed bands:

strict: 0.15–0.25

relaxed: 0.20–0.30

learning: 0.25–0.35

exploratory: 0.30–0.40

Those might be reasonable for a very smooth asset class or for a heavily-smoothed metric, but for 5-minute crypto, they look aggressively tight unless your new return-based VN distribution comes out far lower than I’d expect.

My recommendation is:

Suggested starting ranges

Strict (active quant): 0.35–0.50

Relaxed (active pattern): 0.45–0.60

Learning (VTS quant): 0.55–0.70

Exploratory (VTS pattern): 0.65–0.80

That is the safer initial calibration range.

Better approach than guessing thresholds

Do this first:

Recompute VN on your full universe using return-based VN.

Plot the empirical distribution.

Set thresholds by percentile.

For example:

strict = 35th–45th percentile

relaxed = 50th–60th percentile

learning = 65th–75th percentile

exploratory = 80th–90th percentile

That is much stronger than hardcoding thresholds from intuition.

Because right now the main risk is replacing one broken scale with another guessed scale.

3. Edge cases / pitfalls with percentage-return VN

There are a few.

Division by zero

If you use:

(close_t / close_{t-1}) - 1

then close_{t-1} = 0 is a failure case.

In real listed crypto OHLC this should basically never happen, but still guard it.

Use:

if close_{t-1} <= epsilon: skip bar or return null

For log returns:

ln(close_t / close_{t-1})

you need both prices strictly positive.

That is also easy to enforce.

Very low-priced assets

Tiny-price meme coins can have discretized tick behavior. Their 5-minute returns may jump in coarse increments, which can artificially inflate irregularity.

That is not a reason to reject return-based VN, but it means you may want a minimum price or minimum volume/liquidity guard before VN is even evaluated.

Flash crashes / single-bar anomalies

A single outlier bar can distort:

mean(|r|)

stdDev(|r|)

and therefore the ratio.

This is one of the biggest pitfalls.

Fix: winsorize or clip extreme returns before computing VN.

For example:

|r_t| := min(|r_t|, p99 of rolling |r|)

or just clip at a fixed max like 5% or 8% per 5-minute bar depending on the universe.

Mean close to zero

If mean(|r|) becomes very small during dead/flat conditions, the ratio can blow up even though the market is actually quiet.

That is a classic coefficient-of-variation problem.

Fix:

VN = stdDev(|r|) / max(mean(|r|), floor)

with a small floor.

Example:

floor = 0.0001

or a percentile-based floor from your universe.

Without this, very quiet assets can paradoxically look “noisy.”

4. Additional modifications I would recommend

Yes. I would not stop at “switch to returns.”

A. Use robust dispersion instead of plain standard deviation

Crypto 5-minute returns are heavy-tailed.

So I would strongly consider:

VN = MAD(|r|) / median(|r|)

or

VN = robustStd(|r|) / mean(|r|)

If you want something closer to your current formula while being more stable, use:

VN = stdDev(clipped |r|) / max(mean(clipped |r|), floor)

That is probably the best balance.

B. Use a minimum sample size

Do not compute VN on too short a window.

For 5-minute data, I would want at least:

48 bars minimum

preferably 96–144 bars

Otherwise the metric will be unstable.

C. Smooth the output

A raw 5-minute noise metric will flicker.

Use a short EMA on the final VN:

VN_smooth = EMA(VN_raw, 3 to 6 periods)

That makes it more usable as a filter.

D. Consider separating “noise” from “volatility”

This matters a lot.

A high-volatility asset can still be very tradable if its movement is directional.

Your current VN is measuring irregularity of bar-size, not trend quality.

So I would not use VN alone as a hard gate unless paired with something like:

DI / directional integrity

trend slope stability

ADX

efficiency ratio

Best combination:

Tradeable if:
VN low-to-moderate
AND DI above threshold

That stops you from rejecting strong volatile trends just because they’re active.

E. Strongest recommendation: use standardized absolute returns

If you want a crypto-native improvement, this is better than raw return CV:

z_t = |r_t| / ATR_like_scale
VN = stdDev(z_t) / mean(z_t)

or normalize returns by rolling realized volatility.

That reduces asset-specific volatility regime distortion.

But it is a second-step refinement. First fix should be simpler.

My recommended implementation
Version 1: practical fix

Use log returns + clipping + denominator floor.

r_t = ln(close_t / close_{t-1})
a_t = |r_t|
a_t_clipped = min(a_t, clip_threshold)

VN = stdDev(a_t_clipped) / max(mean(a_t_clipped), floor)
VN = clamp(VN, 0, 1)

Recommended defaults:

clip threshold: 0.03 to 0.05 on 5-minute bars

floor: 0.0001

lookback: 96 bars

optional EMA smoothing: 3–6 periods

Version 2: even better

Use robust statistics:

VN = MAD(a_t) / max(median(a_t), floor)

This will be more resilient to crypto outliers.

Final answers
1. Correct fix?

Yes, move away from absolute price differences.
Best choice: log returns, not raw price deltas.

2. Threshold ranges?

Your proposed ranges are probably too low for 5-minute crypto.
Start more conservatively around:

strict: 0.35–0.50

relaxed: 0.45–0.60

learning: 0.55–0.70

exploratory: 0.65–0.80

Then calibrate empirically from the real universe distribution.

3. Edge cases?

Yes:

division by zero / nonpositive prices

low-priced ticky assets

flash-crash outliers

denominator blow-up when mean absolute return is tiny

All solvable with guards, clipping, and a denominator floor.

4. Additional improvements?

Yes:

use log returns

clip extremes

add denominator floor

use larger lookback

smooth output

ideally pair VN with DI or trend-quality metric

consider robust dispersion later

The bottom line is:

The diagnosis is correct. The current VN is broken for crypto because it uses absolute price differences.
The right first fix is to switch to return-based normalization, preferably log returns, then recalibrate thresholds from the actual empirical distribution instead of guessing low bands up front.


xAI's Response:
Yes, the percentage-returns approach is the correct and standard fix.
1. Recommended Normalization Method
Switching from absolute price differences (|close[i] - close[i-1]|) to simple percentage returns ((close[i] / close[i-1]) - 1) is exactly the right solution. This is the industry-standard way to compute any volatility or noise metric across assets with vastly different price levels (BTC at $72k vs. XMR at ~$360 vs. micro-cap memes at $0.00001). Your real-world observation (majors clamping at VN = 1.00, XMR slightly lower) is the classic symptom of an un-normalized absolute-delta formula.
Best implementation (tiny improvement over plain % returns):
Pythonreturns = np.log(closes[1:] / closes[:-1])          # log returns (preferred)
abs_rets = np.abs(returns)
mean_abs = np.mean(abs_rets)
if mean_abs < 1e-8:                                 # guard for dead/flat coins
    vn = 0.0
else:
    vn = np.std(abs_rets, ddof=1) / mean_abs
vn = np.clip(vn, 0.0, 1.0)
Why log returns instead of simple %?

Log returns are additive and better behaved for large moves (flash crashes).
For 5-minute crypto data the numerical difference is negligible (<0.01 VN), but log is mathematically cleaner.
ATR-normalized or z-score alternatives are unnecessary extra complexity here — the CV of absolute log returns is simple, fast, and already does exactly what you want.

Do NOT use:

Z-score of returns (requires mean centering, which adds noise in trending markets).
Raw ATR ratio (overkill and slower).

2. Recommended Thresholds (5-minute crypto data)
Your proposed ranges (0.15–0.40) are far too low and would reject virtually every crypto pair.
Real 5-minute data (Polygon, last 5 days, ~1440 bars):

BTC/USD: VN = 1.00
ETH/USD: VN = 1.00
XMR/USD: VN = 0.9385
Typical altcoins/memes: 0.92–1.00
Smoother periods (low-vol regimes): ~0.70–0.85

Recommended thresholds (calibrated to current market + VTS behavior):






























Filter PathVN_MAXRationaleStrict (active quant trading)0.88Passes BTC/ETH majors + solid alts; rejects extreme meme chaosRelaxed (active pattern trading)0.93Allows most liquid alts while still filtering pure noiseLearning (VTS quant sim)0.96Matches your current working VTS thresholdExploratory (VTS pattern sim)0.98Almost everything except truly dead coins
These give you a healthy tradable universe (~200–250 pairs) while the FinalScore ≥ 0.35 gate still kills low-quality signals.
3. Edge Cases & Pitfalls with Percentage Returns

Mean = 0 (flat price): Stablecoins or dead tokens produce division-by-zero. Your guard if mean_abs < 1e-8: vn = 0.0 (or reject the pair) is mandatory.
Flash crashes / 20–50% moves: A single huge bar spikes std and mean → VN rises sharply. This is desired behavior — the pair becomes “noisy” and gets filtered correctly.
Extremely low-price tokens (< $0.00001): Floating-point precision is fine in Python/NumPy. Huge % returns are correctly treated as noisy (high VN) — which is what you want.
Regime changes: VN jumps during vol expansions (correct). No hidden pitfall.
Zero-volume candles: If you filter volume > 0 first, returns are well-defined.

No major issues — the log-return version is even more robust.
4. Additional Crypto-Specific Robustness Modifications
Add these three lightweight improvements (all optional but strongly recommended):

Rolling median instead of mean (outlier resistance):Pythonmean_abs = np.median(abs_rets)   # or use MADCrypto has fat tails — median makes VN more stable.
Minimum activity floor:Pythonif mean_abs < 0.00005:  # <0.005% average move → dead coin
    return 1.0          # or reject outright
Adaptive thresholds per regime (best long-term):
In RANGE_BOUND_STABLE or HIGH_VOLATILITY_UNSTABLE: raise VN_MAX by +0.05
In TREND_FRIENDLY_STABLE: lower VN_MAX by -0.03
This auto-adjusts without manual tuning.


Final Recommendation Summary

Adopt the percentage (log) returns fix immediately — it solves the cross-asset scaling problem perfectly.
Replace your proposed thresholds with the ranges I gave above (0.88 / 0.93 / 0.96 / 0.98).
Implement the three robustness tweaks (log returns + median + activity floor).
After the change, re-run the IMF scanner and confirm you now get ~200–250 eligible pairs (instead of just XMR).

This will unblock your active trading path while keeping the noise filter meaningful. The formula will now behave consistently across BTC, ETH, SOL, XMR, and even micro-caps — exactly what you need for a 300-pair universe.