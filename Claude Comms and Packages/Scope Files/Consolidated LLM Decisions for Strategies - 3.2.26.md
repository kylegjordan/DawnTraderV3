GEMINI
SECTION A: BUGS
BUG-1: pivot_shift stop min→max

Recommendation: Accept fix (use max, use entryPrice consistently).

Why: This is a hard mathematical error in the original spec. For a long position, a "tighter" stop is numerically higher. Using min() explicitly selects the wider, riskier stop. Locking it to entryPrice also prevents execution slippage from distorting your risk sizing.

BUG-2, BUG-4, BUG-5: Negative Score Floors

Recommendation: Accept fixes for all three (add max(0, ...)).

Why: Confidence scoring should measure the presence of an edge, not penalize an asset for having a slightly malformed pattern if it still passed the hard entry gates.

BUG-3: reverse_impulse momentum value

Recommendation: Accept fix (use minMomentum in confidence).

Why: You want the strategy to score the violent intensity of the actual spike that caused the exhaustion, not the muted momentum of the recovery candle that triggered the entry.

BUG-6: volatility_edge target base

Recommendation: Use cPointLow (textbook, wider target).

Why: Harmonic patterns derive their energy from structural pivots (troughs and peaks). Measuring the C→D leg from the breakout point (cPointHigh) artificially truncates the measured move. Since you're already clipping the exit to 90% of the target, measuring from the true base (cPointLow) is the mathematically correct baseline.

SECTION B: MISSING SAFEGUARDS
GUARD-1: Min stop distance

Recommendation: Accept (MIN_STOP_DISTANCE_BPS = 20).

Why: With maker/taker fees and standard Kraken spread, a stop tighter than 20 basis points (0.2%) is just feeding the exchange.

GUARD-2: ATR floor/ceiling

Recommendation: Reject below floor, clamp at ceiling.

Why: If an asset's 14-period ATR drops below 0.1% of its price, it is effectively flatlining (or a stablecoin). It's safer to reject the signal entirely than to artificially clamp it and trade a dead asset. Clamping at the 10% ceiling perfectly defends against flash-crash math distortion.

GUARD-4: Fee-adjusted R:R Check

Recommendation: Keep at 1.5 (canonical cost model handles it downstream).

Why: Don't duplicate logic. Since the downstream isSignalProfitable() function already accounts for entry/exit fees and slippage, keeping the pre-filter at 1.5 prevents you from double-taxing the strategy during signal generation.

SECTION C: CALIBRATION
CAL-1: support_bounce Cluster Tolerance

Recommendation: ATR-scaled (max(0.005, ATR/price × 0.5)).

Why: Crypto volatility is heteroskedastic. A static 0.5% tolerance will fail on high-beta pairs and work on quiet ones. ATR-scaling ensures the clustering logic dynamically adapts to the specific asset's current heartbeat.

CAL-2: Min touches 2→3

Recommendation: Increase to 3.

Why: In technical analysis, two points make a trendline, but three confirm a structural boundary. In noisy markets, two touches are too easily formed by random chance.

CAL-3: adaptive_flow trend suppression

Recommendation: Add ADX(14) < 25 as an entry condition.

Why: Relying solely on the overarching regime classifier leaves you vulnerable to calculation lag during sudden transitions. An explicit ADX check ensures you don't accidentally buy a minor pullback in a roaring trend.

CAL-4 & CAL-11: defensive_hedge Correlation Window & Threshold

Recommendation: Keep at 30, switch to Spearman rank, raise threshold to 0.40.

Why: Expanding to 50+ candles blends too many micro-regimes. 30 candles is perfect for catching current decoupling, and switching to Spearman rank correlation protects that small sample size from being ruined by a single flash-crash wick. Furthermore, raising the threshold to 0.40 is necessary; in a universe of ~40-60 crypto pairs, a 0.30 correlation is incredibly rare. 0.40 opens up the signal funnel while maintaining a valid hedge.

CAL-5: pivot_shift ADX slope minimum

Recommendation: Require 2 consecutive positive slopes.

Why: ADX is a lagging, noisy oscillator. A single +0.5 tick is often just math jitter. Requiring two consecutive positive slopes proves actual momentum is building.

CAL-6: morning_star vol mult

Recommendation: Keep at 1.2.

Why: Reversals are exhaustion events; they rarely feature the massive volume explosions seen in breakouts.

CAL-7: volatility_edge target ATR mult

Recommendation: Keep at 2.5.

Why: The measured move is the primary target. Keeping the ATR fallback conservative is smart.

CAL-8: Counter-trend R:R

Recommendation: Keep 1.5, revisit after backtesting.

Why: Counter-trend plays naturally have tighter targets. Forcing a 2.0 R:R at the signal generation level will likely choke off perfectly valid, high-probability scalp setups before the backtester even gets to look at them.

CAL-9: defensive_hedge confidence rebalance

Recommendation: Accept rebalance (0.45 pattern / 0.25 decorrelation).

Why: A signal that cleanly passes all rigorous entry gates shouldn't mathematically fail to achieve a decent confidence score just because of harsh weighting.

CAL-10: adaptive_flow structure-based stop

Recommendation: Accept (add structure-based stop).

Why: Naked ATR stops are a legacy retail trap. You should always anchor risk to a point of structural pattern invalidation.

SECTION D: ENHANCEMENTS
ENH-1 (Explicit Regime Check): Add it. Clearer architectural specs mean Claude Code will write cleaner logic.

ENH-2 (Morning star SMA filter): Defer. Don't over-engineer filters before seeing the backtest data.

ENH-3 (Inside bar SELL RSI): Tighten to 45. RSI 36 is functionally oversold; selling there is chasing the bottom.

ENH-4 (Regime stability): Defer. * ENH-5 (DH BTC self-correlation): Add. Excellent for computational efficiency.

ENH-6 (VE dynamic mult): Keep fixed. * ENH-7 (Spearman rank): Add. (See CAL-4).

ENH-8 (Max sums): Add table. This will be a massive help for your unit testing.

ENH-9 (BUY-only note): Add note.

ENH-10 (RI momentum strictness): Change to -0.01. This creates better mathematical separation between the RSI requirement and the momentum requirement.


ChatGPT
SECTION A: BUGS
BUG-1: pivot_shift stop min→max

Recommendation: Accept fix (use max, use entryPrice consistently).

Why: This is a hard mathematical error in the original spec. For a long position, a "tighter" stop is numerically higher. Using min() explicitly selects the wider, riskier stop. Locking it to entryPrice also prevents execution slippage from distorting your risk sizing.

BUG-2, BUG-4, BUG-5: Negative Score Floors

Recommendation: Accept fixes for all three (add max(0, ...)).

Why: Confidence scoring should measure the presence of an edge, not penalize an asset for having a slightly malformed pattern if it still passed the hard entry gates.

BUG-3: reverse_impulse momentum value

Recommendation: Accept fix (use minMomentum in confidence).

Why: You want the strategy to score the violent intensity of the actual spike that caused the exhaustion, not the muted momentum of the recovery candle that triggered the entry.

BUG-6: volatility_edge target base

Recommendation: Use cPointLow (textbook, wider target).

Why: Harmonic patterns derive their energy from structural pivots (troughs and peaks). Measuring the C→D leg from the breakout point (cPointHigh) artificially truncates the measured move. Since you're already clipping the exit to 90% of the target, measuring from the true base (cPointLow) is the mathematically correct baseline.

SECTION B: MISSING SAFEGUARDS
GUARD-1: Min stop distance

Recommendation: Accept (MIN_STOP_DISTANCE_BPS = 20).

Why: With maker/taker fees and standard Kraken spread, a stop tighter than 20 basis points (0.2%) is just feeding the exchange.

GUARD-2: ATR floor/ceiling

Recommendation: Reject below floor, clamp at ceiling.

Why: If an asset's 14-period ATR drops below 0.1% of its price, it is effectively flatlining (or a stablecoin). It's safer to reject the signal entirely than to artificially clamp it and trade a dead asset. Clamping at the 10% ceiling perfectly defends against flash-crash math distortion.

GUARD-4: Fee-adjusted R:R Check

Recommendation: Keep at 1.5 (canonical cost model handles it downstream).

Why: Don't duplicate logic. Since the downstream isSignalProfitable() function already accounts for entry/exit fees and slippage, keeping the pre-filter at 1.5 prevents you from double-taxing the strategy during signal generation.

SECTION C: CALIBRATION
CAL-1: support_bounce Cluster Tolerance

Recommendation: ATR-scaled (max(0.005, ATR/price × 0.5)).

Why: Crypto volatility is heteroskedastic. A static 0.5% tolerance will fail on high-beta pairs and work on quiet ones. ATR-scaling ensures the clustering logic dynamically adapts to the specific asset's current heartbeat.

CAL-2: Min touches 2→3

Recommendation: Increase to 3.

Why: In technical analysis, two points make a trendline, but three confirm a structural boundary. In noisy markets, two touches are too easily formed by random chance.

CAL-3: adaptive_flow trend suppression

Recommendation: Add ADX(14) < 25 as an entry condition.

Why: Relying solely on the overarching regime classifier leaves you vulnerable to calculation lag during sudden transitions. An explicit ADX check ensures you don't accidentally buy a minor pullback in a roaring trend.

CAL-4 & CAL-11: defensive_hedge Correlation Window & Threshold

Recommendation: Keep at 30, switch to Spearman rank, raise threshold to 0.40.

Why: Expanding to 50+ candles blends too many micro-regimes. 30 candles is perfect for catching current decoupling, and switching to Spearman rank correlation protects that small sample size from being ruined by a single flash-crash wick. Furthermore, raising the threshold to 0.40 is necessary; in a universe of ~40-60 crypto pairs, a 0.30 correlation is incredibly rare. 0.40 opens up the signal funnel while maintaining a valid hedge.

CAL-5: pivot_shift ADX slope minimum

Recommendation: Require 2 consecutive positive slopes.

Why: ADX is a lagging, noisy oscillator. A single +0.5 tick is often just math jitter. Requiring two consecutive positive slopes proves actual momentum is building.

CAL-6: morning_star vol mult

Recommendation: Keep at 1.2.

Why: Reversals are exhaustion events; they rarely feature the massive volume explosions seen in breakouts.

CAL-7: volatility_edge target ATR mult

Recommendation: Keep at 2.5.

Why: The measured move is the primary target. Keeping the ATR fallback conservative is smart.

CAL-8: Counter-trend R:R

Recommendation: Keep 1.5, revisit after backtesting.

Why: Counter-trend plays naturally have tighter targets. Forcing a 2.0 R:R at the signal generation level will likely choke off perfectly valid, high-probability scalp setups before the backtester even gets to look at them.

CAL-9: defensive_hedge confidence rebalance

Recommendation: Accept rebalance (0.45 pattern / 0.25 decorrelation).

Why: A signal that cleanly passes all rigorous entry gates shouldn't mathematically fail to achieve a decent confidence score just because of harsh weighting.

CAL-10: adaptive_flow structure-based stop

Recommendation: Accept (add structure-based stop).

Why: Naked ATR stops are a legacy retail trap. You should always anchor risk to a point of structural pattern invalidation.

SECTION D: ENHANCEMENTS
ENH-1 (Explicit Regime Check): Add it. Clearer architectural specs mean Claude Code will write cleaner logic.

ENH-2 (Morning star SMA filter): Defer. Don't over-engineer filters before seeing the backtest data.

ENH-3 (Inside bar SELL RSI): Tighten to 45. RSI 36 is functionally oversold; selling there is chasing the bottom.

ENH-4 (Regime stability): Defer. * ENH-5 (DH BTC self-correlation): Add. Excellent for computational efficiency.

ENH-6 (VE dynamic mult): Keep fixed. * ENH-7 (Spearman rank): Add. (See CAL-4).

ENH-8 (Max sums): Add table. This will be a massive help for your unit testing.

ENH-9 (BUY-only note): Add note.

ENH-10 (RI momentum strictness): Change to -0.01. This creates better mathematical separation between the RSI requirement and the momentum requirement.


xAI
As Grok, I reviewed the consolidated feedback from the multi-LLM audit (including my own inputs). The spec is solid, but these fixes and tweaks will make it more robust for crypto's volatile nature. My recommendations prioritize safety (fix all bugs, add key guards), practicality (adapt to crypto specifics like high vol spikes), and simplicity (avoid over-complication unless it adds clear value). I've focused on minimizing false positives while keeping signal generation viable. For enhancements, I suggest implementing only the high-impact ones to avoid scope creep before backtesting.
Below, I've filled out the Decision Summary Template with my recommended choices, followed by brief explanations for each. These are based on crypto trading best practices (e.g., regime awareness, structure-based risk management) and the rationale from the reviewers.
Decision Summary

ItemDecisionBUG-1: pivot_shift stop min→maxAccept fix (use max, use entryPrice consistently)BUG-2: support_bounce proximity floorAccept fix (add max(0, ...))BUG-3: reverse_impulse momentum valueAccept fix (use minMomentum in confidence)BUG-4: volatility_edge fibQuality floorAccept fix (add max(0, ...))BUG-5: pivot_shift ADX score floorAccept fix (add max(0, ...))BUG-6: volatility_edge target baseUse cPointLow (textbook, wider target)GUARD-1: Min stop distanceAccept (MIN_STOP_DISTANCE_BPS = 20, 0.2%)GUARD-2: ATR floor/ceilingAccept (clamp ATR to 0.1%-10% of price)GUARD-4: Fee-adjusted R:RRaise MIN_RR_RATIO to 1.6 (simple, accounts for costs)CAL-1: Cluster tolerance scalingATR-scaled: max(0.005, ATR/price × 0.5) — adapts per assetCAL-2: Min touches 2→3Increase to 3CAL-3: Adaptive flow trend suppressionAdd ADX(14) < 25 as entry condition #6CAL-4: Correlation windowKeep at 30 (more regime-relevant for crypto)CAL-5: ADX slope minimumRaise to 1.0CAL-6: Morning star vol multIncrease to 1.5CAL-7: VE target ATR multIncrease to 3.0CAL-8: Counter-trend R:R2.0 for counter-trend (reverse_impulse, defensive_hedge)CAL-9: DH confidence rebalanceAccept rebalance (0.45 pattern / 0.25 decorrelation)CAL-10: AF structure-based stopAccept (add structure-based stop using pattern low)CAL-11: DH correlation thresholdKeep at 0.30 (strict, fewer but higher quality signals)ENH-1 through ENH-10ENH-1: Add note; ENH-3: Tighten to 45; ENH-4: Add filter; ENH-5: Add; ENH-6: Add dynamic scaling; ENH-7: Switch to Spearman; ENH-8: Add table to spec; ENH-9: Add note; ENH-10: Change to -0.01; Skip ENH-2 (defer to backtesting)
Explanations for Selections
BUGS (All must be fixed—prioritize these for correctness)

BUG-1: Accept the fix. Using min() would select the wider (riskier) stop, which contradicts the intent of a "tighter" stop in a BUY setup. Switching to max() ensures conservatism, and using entryPrice consistently avoids minor inconsistencies. This prevents over-risking in volatile crypto moves.
BUG-2: Accept the fix. Negative scores distort confidence unfairly; the floor ensures marginal cases don't penalize unnecessarily, aligning with the scoring philosophy.
BUG-3: Accept the fix. Confidence should reflect the triggering event (the extreme min momentum), not the current value, to avoid under-scoring strong reversals. This keeps the strategy honest to its impulse-reversal concept.
BUG-4: Accept the fix. Similar to BUG-2; prevents unintended penalties from edge patterns, ensuring confidence only adds value or stays neutral.
BUG-5: Accept the fix. Even with the entry condition, a guard adds defense-in-depth—crypto indicators like ADX can glitch briefly, so this avoids rare negative scores.
BUG-6: Use cPointLow. This matches harmonic pattern theory for accurate projections. cPointHigh is too conservative for HIGH_VOL_IMPULSE, where crypto often overshoots—wider targets capture more upside without much added risk (R:R check still applies).

GUARDS (Add these for robustness in crypto edges)

GUARD-1: Accept with 0.2%. Crypto spreads (0.1-0.5% on Kraken) can eat tiny stops; this ensures viability without over-filtering. 0.2% is a good balance for pairs like BTC/USD.
GUARD-2: Accept the clamp. Crypto can have dead zones (low ATR) or panics (high ATR); clamping prevents nonsense signals while adapting to price scale.
GUARD-4: Raise to 1.6. Simplest way to buffer fees/slippage without duplicating downstream logic. Crypto costs add up quickly in frequent trading.

CALIBRATIONS (Tune for crypto-specific performance)

CAL-1: Go with ATR-scaled. Fixed 0.5% is too rigid for alts like SOL (higher vol)—scaling adapts automatically, reducing missed clusters in choppy markets.
CAL-2: Increase to 3. Two touches are often noise in crypto; three adds reliability without overly restricting signals in a 50-candle lookback.
CAL-3: Add ADX <25. Regime classifiers aren't perfect; this suppresses false positives in early trends, crucial for chop-to-breakout strategies.
CAL-4: Keep at 30. Crypto regimes shift fast—longer windows dilute relevance. Statistical robustness is secondary to timeliness here.
CAL-5: Raise to 1.0. 0.5 is jitter-prone in crypto; 1.0 ensures real trend emergence, improving signal quality.
CAL-6: Increase to 1.5. Reversals in crypto need more conviction than 1.2x—matches breakout thresholds and filters quiet fakes.
CAL-7: Increase to 3.0. HIGH_VOL_IMPULSE deserves wider targets for crypto swings; the measured move caps it anyway.
CAL-8: 2.0 for counter-trend. These have lower win rates (~40% vs. 50% for trends), so higher R:R compensates for EV without over-filtering.
CAL-9: Accept rebalance. Marginal signals scoring too low (0.27) wastes opportunities; shifting weight to pattern emphasizes the core reversal while keeping decorrelation important.
CAL-10: Accept. Aligns with other strategies' structure-based stops—pure ATR is too generic for a pattern hybrid.
CAL-11: Keep at 0.30. With ~50 pairs on Kraken, strictness yields quality hedges; looser risks correlated "hedges" that fail in BTC dumps.

ENHANCEMENTS (Implement high-value ones only)

ENH-1: Add note—clarifies without bloating strategy code.
ENH-2: Skip—defer; adds another filter that might over-restrict before backtesting.
ENH-3: Tighten to 45—prevents selling into potential bottoms, symmetric to BUY's RSI<65.
ENH-4: Add filter—regime stability is key in crypto; avoids whipsaw signals.
ENH-5: Add—efficient, prevents pointless computation.
ENH-6: Add dynamic—rewards high-conviction vol for better targets in extremes.
ENH-7: Switch to Spearman—crypto outliers (e.g., 20% drops) skew Pearson; Spearman is robust.
ENH-8: Add table—useful for devs to verify implementations.
ENH-9: Add note—documents asymmetry clearly.
ENH-10: Change to -0.01—reduces correlation with RSI, making conditions more independent.

Once these are locked in, the spec should be ready for coding. If you want me to simulate backtests on sample data or refine any further, let me know!


Claude
Here are my recommendations for each decision, with reasoning:

SECTION A: BUGS
BUG-1 — pivot_shift stop min→max: Accept fix (use max, use entryPrice consistently). The spec's own language says "tighter of two stops" — min() directly contradicts that intent. Using max() gives the closer, tighter stop which is the safer choice: if the ATR stop is too distant, the pattern low provides a structural backstop, and vice versa. Mixing currentPrice and entryPrice is also a real consistency issue since entry includes the 10bps premium.
BUG-2 — support_bounce proximity floor: Accept fix. Trivial one-line change, no downside, prevents a scoring anomaly.
BUG-3 — reverse_impulse momentum value: Accept fix. This is the most important of the non-obvious bugs. The whole thesis of the strategy is "the impulse was extreme" — confidence should reflect the extremity of that impulse, not wherever momentum happens to be after recovery. Using the current value actively punishes the best setups (where price has already started snapping back, meaning momentum has recovered from its extreme).
BUG-4 — volatility_edge fibQuality floor: Accept fix. Same reasoning as BUG-2 — trivial guard, no downside.
BUG-5 — pivot_shift ADX score floor: Accept fix. Defense-in-depth costs nothing.
BUG-6 — volatility_edge target base: Keep cPointHigh (conservative, current spec). My reasoning: the entry is at cPointHigh + buffer, so measuring the target from the entry's anchor point (cPointHigh) gives a target that represents the actual distance price needs to travel from where you got in. Using cPointLow would be textbook-correct for the abstract pattern, but it overstates the reward because you're not entering at cPointLow — you're entering at the breakout above cPointHigh. Since R:R is calculated against the actual entry, the conservative base produces a more honest reward estimate. In crypto, where ABCD patterns frequently undershoot the theoretical D-point, taking the conservative anchor is wise.

SECTION B: SAFEGUARDS
GUARD-1 — Min stop distance: Accept at 20 bps (0.2%). On Kraken, a round-trip of fees + spread is roughly 0.15-0.20% on liquid pairs. A stop within 0.2% of entry would be consumed by costs alone. 20 bps is the minimum where the stop has actual meaning beyond transaction friction.
GUARD-2 — ATR floor/ceiling: Reject below floor, clamp at ceiling. This is the hybrid of Claude's and xAI's proposals. If ATR is below 0.1% of price, the asset is too flat to trade — any signal is noise, so reject outright. But if ATR is extremely high (post-flash-crash), there may still be legitimate trading opportunities; you just don't want the target to be 45% away. Clamping at the ceiling (10%) keeps trades viable while bounding risk. Rejecting at the floor is cleaner than clamping because an artificially inflated ATR on a flat asset produces meaningless stops and targets.
GUARD-3: Covered by GUARD-1. No additional action.
GUARD-4 — Fee-adjusted R:R: Keep at 1.5. The doc itself notes that the canonical cost model already runs downstream via isSignalProfitable(). Bumping to 1.6 is a belt-and-suspenders move that adds a hidden assumption (what fee rate is 1.6 implicitly covering?) that could drift out of sync with actual Kraken fees. The architecture is already right — pre-filter with a clean 1.5 threshold, then the downstream cost model applies real fees. Duplicating the logic in two places is a maintenance liability.

SECTION C: CALIBRATION
CAL-1 — Cluster tolerance: ATR-scaled: max(0.005, ATR/price × 0.5). The fixed 1% alternative works for BTC but would be too loose for tight-spread altcoins. The ATR-scaled formula adapts automatically per asset, which is the same philosophy the spec uses everywhere else (ATR-based stops, ATR-based targets). Consistency matters.
CAL-2 — Min touches 2→3: Keep at 2. In a 50-candle lookback window (≈2 days on 1h chart), requiring 3 touches is quite demanding — it means the support level was tested 3 times in 2 days, which implies frequent revisits to the same zone. That's a narrow scenario. Two touches already means "this level bounced before" which is the core thesis. The confidence scoring already rewards more touches (the supportScore formula scales linearly with touch count), so 3-touch levels will naturally produce higher confidence signals. Raising the minimum to 3 would eliminate valid signals; keeping at 2 and letting confidence differentiate is the better design.
CAL-3 — Adaptive flow trend suppression: Add ADX(14) < 25 as entry condition #6. ADX < 25 is the standard quantitative definition of "no meaningful trend." It's clean, well-understood, already computed in the infrastructure, and directly addresses the failure mode (regime classifier lag). The momentum-based alternatives are more complex and less battle-tested. ADX < 25 is the simplest robust fix.
CAL-4 — Correlation window: Keep at 30 but switch to Spearman rank correlation. This is the key tension in the whole document. I maintain my original position: in crypto, 50-60 candle windows blend regimes, producing stale correlation estimates. A 30-candle window is more responsive to the current regime. The statistical robustness concern is real, though — Pearson at n=30 is marginal. Spearman resolves this because it's less sensitive to the exact magnitudes (which is what makes Pearson unreliable at small n), and it handles the flash crash outlier problem that xAI and ChatGPT are rightly worried about. You get regime freshness AND robustness in one change.
CAL-5 — ADX slope minimum: Raise to 1.0. ADX noise of ±1-2 points per candle is well-documented in crypto. A 0.5-point threshold is within the noise floor — it's essentially testing "did ADX move at all?" rather than "is a trend forming?" At 1.0, you're still catching genuine trend formation (ADX moving up 1+ points per candle is a meaningful signal) while filtering out the jitter. The alternative (2 consecutive positive slopes at 0.5) adds implementation complexity for the same effect.
CAL-6 — Morning star volume multiplier: Keep at 1.2. The spec's original rationale is correct: morning stars are primarily price structure signals. The volume gate is confirmation, not the signal itself. Raising to 1.5 would align it with breakout strategies, but morning stars aren't breakouts — they're reversals, which characteristically develop on gradually increasing volume rather than explosive volume. The 1.2 threshold already filters zero-volume ghosts; 1.5 would filter legitimate reversals on moderately liquid pairs.
CAL-7 — VE target ATR mult: Keep at 2.5. As the counter-argument notes, the measured move target is the primary exit, and the ATR target is the fallback (use the smaller). In most cases the measured move will be smaller than 2.5× ATR in a HIGH_VOL_IMPULSE regime (because ATR is already large). Raising to 3.0 has minimal practical impact and weakens the conservative intent of the fallback.
CAL-8 — Counter-trend R:R: Keep 1.5 for all, revisit after backtesting. The counter-trend strategies already have tighter targets (1.8-2.0× ATR vs. 2.5-3.0) and stricter entry requirements (higher pattern strength, more conditions). Layering a 2.0 R:R minimum on top of tight targets creates a very narrow window where signals can exist: the stop would need to be very close to entry to produce R:R ≥ 2.0 with a 2.0× ATR target, but GUARD-1 prevents the stop from being too close. This combination could effectively kill these strategies. Backtesting will reveal the actual win rate, and that's when the R:R minimum should be tuned.
CAL-9 — DH confidence rebalance: Accept rebalance (0.45 pattern / 0.25 decorrelation). The math I showed in the original review is clear — a marginal signal scoring 0.27 means the confidence score is providing almost no information for this strategy. If nearly every passing signal is below 0.40, the confidence becomes a formality rather than a differentiator. Raising the pattern weight to 0.45 lifts the floor so marginal signals land around 0.40-0.50 and strong signals around 0.60-0.75, which is where the system can actually make meaningful quality distinctions.
CAL-10 — Adaptive flow structure-based stop: Accept (add structure-based stop using pattern low). Every other strategy ties its stop to a structural invalidation level. A purely ATR-based stop in adaptive_flow means the stop has no logical meaning — it's just "price moved X distance." Using the three soldiers pattern low as the invalidation anchor gives the stop semantic meaning: "if price drops below the formation that triggered the signal, the thesis is invalid." The min() formulation keeps the ATR stop as a fallback if the pattern low is extremely far away.
CAL-11 — DH correlation threshold: Keep at 0.30. The whole thesis of defensive_hedge is finding structurally decorrelated assets during bear markets. Raising the threshold to 0.40-0.45 dilutes the core concept — at 0.45 correlation, the asset has a meaningful positive relationship with BTC, which undermines the "hedge" rationale. With 40-60 Kraken pairs, even strict filtering should produce occasional signals. If it produces zero signals over an extended period, that's actually valuable information — it means no genuine hedge opportunities exist, and the strategy correctly stays out. Low signal frequency is a feature for a counter-trend hedge strategy, not a bug.

SECTION D: ENHANCEMENTS
ENH-1 (Regime check): Add note that regime filtering occurs at Signal Orchestrator level. Adding it as an explicit condition to each strategy creates ambiguity about whether it's checked in two places.
ENH-2 (Morning star SMA distance): Add filter. This is cheap insurance against catching falling knives. The 5% threshold is generous enough to avoid filtering valid pullbacks.
ENH-3 (Inside bar SELL RSI): Tighten to 45. RSI 36-44 on a SELL is marginal territory — the asset is close to oversold and has limited downside room.
ENH-4 (Regime stability filter): Defer. This adds complexity and the regime classifier's behavior during transitions isn't well-characterized in the spec. Better to observe in backtesting first.
ENH-5 (BTC self-correlation shortcut): Add. One line of code, zero risk, avoids unnecessary computation.
ENH-6 (Dynamic measured move mult): Keep fixed at 0.90. The dynamic scaling adds complexity for a marginal improvement, and the relationship between volPercentile and pattern completion rate isn't established.
ENH-7 (Spearman rank): Already recommended in CAL-4. Switch to Spearman.
ENH-8 (Confidence bounds table): Add table to spec. Pure documentation improvement, helps implementers verify their code.
ENH-9 (Direction completeness note): Add note. Important for anyone reading the spec who might assume SELL logic should be implemented for all strategies.
ENH-10 (Momentum threshold stricter): Keep at -0.005. As I noted in the original review, RSI and momentum measure different things (displacement vs velocity). The 60% correlation xAI cites still means 40% independent information. Tightening to -0.01 would filter out the "moderate but genuine overextension" cases that are the bread and butter of mean-reversion trades. The -0.005 threshold already requires a meaningful down-move; doubling it would restrict the strategy to only extreme events.