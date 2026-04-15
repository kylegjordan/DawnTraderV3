# B61 Provisional Findings Report — DBS Validation, Wave 1

**Phase:** 15b (Regime / DBS / Strategy / Filter Restructure)
**Batch:** B61 (Sub-Phase A — DBS Validation)
**Date:** 2026-04-15
**Author:** Claude Code (current session)
**Intended audience:** Kyle, Langston, and the previous Claude Code session that Kyle wants to solicit feedback from on the DBS-specific strategy question
**Status:** Interim. Three of eight audit deliverables complete (A.1 / A.4 / A.2 Provisional). Non-gating. Finals and the authoritative verdict come after cycle-sampled maturity.

---

## 0. What this document is

This is a mid-batch synthesis of what we've learned so far in the DBS (Directional Bias Score) validation audit. It pulls the three B61 provisional deliverables (A.1 formula review, A.4 data quality, A.2 threshold review) into one narrative for people who don't want to read 30+ pages of technical detail, and it surfaces one strategic question for the previous Claude Code session to weigh in on.

**Important framing caveats before the findings:**

1. This is a **12-hour snapshot** of cycle-sampled telemetry running on Hetzner staging. The Finals that actually gate B62 kickoff will run on a ≥72-hour mature window. The direction of the findings is clear; the exact magnitudes will tighten with more data.
2. The audit is **non-gating by design** for the provisional pass. No decisions about classifier redesign, strategy additions, or threshold changes are being made right now. B61's sole job is to determine whether DBS is trustworthy enough to become a first-class input to the regime classifier in B62.
3. The provisional findings are **consistent with B59's investigation direction but larger in magnitude.** Where B59 said "range bleed is caused by drift-contaminated false range labels," B61 is quantifying that problem and so far finding it's worse than B59 thought.

---

## 1. Executive summary in one paragraph

The DBS formula is mechanically sound (score reconstructs exactly from the three components, no hidden math bugs). The formula has three known imperfections — slope and EMA components overlap more than their weights suggest, ATR normalization is borderline failing on high-volatility pairs, and an internal clamp on the slope component means heavy slope-weighting paradoxically collapses the extreme categories — but none of these block B62 from using DBS as a classifier input. The big finding isn't about DBS itself; it's about what the current regime classifier is doing with the signal it should be using. **72.59% of pairs labeled RANGE_BOUND_STABLE by the current vol+ADX+momentum classifier have non-NEUTRAL DBS — they have measurable directional bias the classifier is ignoring. 54% of strongly directional pair-cycles are being routed to range strategies because the classifier mislabels them as range-bound. IMPULSE_EXPANSION — the regime that wakes up four trend strategies — is empirically 0.12% of cycles, which means those four strategies are starving. The case for DBS-integrated classifier redesign in B62 is stronger than B59 suggested, not weaker.**

> **📦 Boxed headline metric.** Of the ~3,864 strong-DBS pair-cycles observed across the 58-pair universe in a 12-hour window, **only 7.35% actually reached trend-permissive regimes** (TREND_FRIENDLY_STABLE or IMPULSE_EXPANSION). The remaining 92.65% were routed away from trend strategies by the current classifier — 54.48% to RANGE_BOUND_STABLE, 38.17% to HIGH_VOLATILITY_UNSTABLE or STRUCTURAL_TRANSITION. **B62's explicit success metric should be "raise 7.35% to >X%"** where X is chosen based on the replay analysis in §7.6. This single number is the cleanest expression of the size of the opportunity gap the audit is measuring.

---

## 2. Background context for the outside reader

### 2.1 What DBS is
The Directional Bias Score is a per-pair, per-cycle composite number in [-1, +1] measuring directional bias and strength. Computed every 60 seconds for every pair in the active FX5 universe by the Market Context Engine (MCE). Formula:

```
DBS = 0.40 × slopeComponent
    + 0.35 × returnComponent
    + 0.25 × emaComponent
```

Where each component is computed over a 48-candle lookback window and ATR-normalized (so pairs of different volatility regimes can be compared on the same scale):

- **slopeComponent** — the slope of a linear regression line fitted to the log of closing prices, scaled by `avgPrice / ATR`, clamped to [-0.40, +0.40]
- **returnComponent** — the simple start-to-end percent return over the window, multiplied by 10 and clamped to [-0.35, +0.35]
- **emaComponent** — `(EMA_fast - EMA_slow) / ATR`, clamped to [-0.25, +0.25]

The final score is clamped to [-1, +1] and mapped to one of 7 categories: UP_STRONG (≥ +0.60), UP_MODERATE (≥ +0.30), UP_WEAK (≥ +0.10), NEUTRAL (−0.10 to +0.10), and the mirrored bearish versions.

### 2.2 The starting assumption (pre-B61)
Governance docs (SIM §5.1b, System Manual Layer 1b) said DBS was an "orphan metric" — computed every MCE cycle, logged to trade metadata, but **never consumed by any decision layer**. The implicit plan was to audit DBS, then wire it into the classifier in B62 so the classifier would stop mislabeling drifting pairs as range-bound.

### 2.3 What Phase 3a (the codebase grep) found
Before writing any analysis code, I ran a consumer grep on the codebase and found the "orphan" claim was factually wrong. Two consumer-site references to `computeBiasConfidenceModifier` exist in source:

- **`server/services/signal-orchestrator.ts:454`** — a **dormant consumer wire**. Imports and calls the modifier, would multiply signal confidence by the result and recompute FinalScore for RTB ranking. Has never executed against any captured cycle because active trading has been continuously OFF since at least 2026-01-12 (verified against zero rows in `trades`, `paper_trades`, `paper_sim_trades` and audit_log latest timestamp 2026-01-12 19:05 UTC, seven weeks before DBS integration on 2026-03-05). The wire was born dormant. There's also a second bug at L453 where `mce.computeContext()` is called with 1 argument instead of 5, silently caught by a try/catch — a second reason the wire has never energized.
- **`server/services/vts-runner.ts:877`** — a **half-wired dead code path**. Imports the modifier, computes `biasModifier = computeBiasConfidenceModifier(biasCategory)`, then never uses `biasModifier` again. Every VTS-emitted trade across the 15-day B61 audit window has the modifier computed and immediately discarded.

Corrected framing: **"dormant wire on orchestrator, no-op half-wire on VTS, both buried under ambiguous orphan language."** The 15-day VTS audit window is genuinely DBS-clean (nothing captured was ever modified by DBS) even though the code paths to do the modification are present in source. B61 measurement integrity is intact. Both dormant/dead-code findings are carried-as-discovered, not fixed during B61 (fixing them mid-audit would introduce confounders in the forward measurement window).

### 2.4 What got deployed to enable the audit
Under the Phase 15b code freeze (no changes to `directional-bias.ts` or `market-regime.ts`), the only instrumentation change was adding observational telemetry emitters. Three emission sites:

1. **MCE cycle-sampled emitter** — writes one JSONL line per pair per cycle capturing the DBS score, the three components, the `sentinelZero` flag, the classifier's vol/adx/mom/regime for cross-reference, and ATR + OHLC length. This is the real audit data source. Has been running on staging since 2026-04-15 00:45 UTC and currently contains ~14,000 clean samples across 58 pairs.
2. **Signal-orchestrator dormant-wire emitter** — captures pre/post confidence and pre/post FinalScore if the dormant branch ever executes. Expected firing rate during B61: zero. Provides future-proof measurement capacity for when active trading resumes.
3. **VTS half-wire emitter** — captures the biasModifier value and pre/post confidence/FinalScore with `dbsApplied: false` hardcoded, empirically confirming the dead-code status. Currently firing ~7 lines/minute.

All three sites are feature-flagged on `DT_PHASE15B_DBS_TELEMETRY=1` and fire-and-forget (emission errors are caught and rate-limit-warned, never break caller behavior). Disk budget is ~12 MB/day, well under the 50 MB/day ceiling.

### 2.5 The 8-deliverable audit plan
B61 produces 8 deliverables, split across 4 sub-analyses run in two passes each:

- **A.0 Baseline** — legacy classifier flicker rate, needed as a reference point for A.4 Final's flicker comparison. Not yet run. Scheduled for the next session with Langston's methodology adjustments (matched-symbol-matched-timestamp comparison, stablecoin side bucket).
- **A.1 Formula Review** — does the DBS formula produce defensible, mathematically coherent output? Provisional complete. Final deferred to after cycle-sampled maturity + responsiveness injection test.
- **A.2 Threshold Review** — are the fixed category thresholds (±0.60 / ±0.30 / ±0.10) behaviorally meaningful? Provisional complete. Final deferred.
- **A.3 Global DBS Methodology** — is the weighted-median-by-volume aggregation sound? Is the pair universe stable? Does global DBS agree with external market indicators? Not yet run. Originally assigned to Langston; I'm taking it over at Kyle's direction (next session).
- **A.4 Data Quality** — is DBS stable cycle-to-cycle, does it respond appropriately to shocks, are the components individually sane? Provisional complete (sanity portion). Final deferred to after mature window + shock-injection test.

Finals are gated behind a maturity test (2-of-3 conditions on the forward cycle-sampled window, scope §3) that Langston confirms in writing before any Final pass runs.

### 2.5a A note on the A.3 ownership transfer

A.3 ownership transferred from Langston to Claude Code by Kyle directive after a status check found no A.3 deliverable file yet committed to disk. A.3 (Global DBS Methodology) is now owned by CC and will be delivered in the next session alongside A.0 Baseline.

### 2.6 A note on the data-source reroute
Scope §4 assumed A.1 Provisional and A.4 Provisional would run on the 15-day VTS trade window, which was expected to carry DBS component breakdowns alongside the trade records. **That assumption was wrong**: VTS trade records carry only the DBS category string (`'UP_MODERATE'`, etc.), no numeric score, no slope/return/EMA breakdown. The analyses were rerouted to the cycle-sampled MCE telemetry, which is actually a strictly better data source (not selection-biased, captures the full pair universe, carries both the components and the real `sentinelZero` flag instead of a NEUTRAL-category proxy). Reroute GREEN'd by Langston on Thread 21 without a scope edit.

**In direct response to this reroute finding**: Kyle has instructed me to also capture the numeric DBS score in trade metadata going forward, so that future analyses don't hit the same data-availability wall. That code change has been implemented in this session — the `telemetry_history` table gains two new columns (`pair_directional_bias_score` and `global_directional_bias_score`) and all the in-memory interfaces and pass-through code have been updated to carry the numeric scores alongside the category strings. Old trade records can't be retrofitted, but everything flowing through VTS from now on will carry both.

---

## 3. A.1 — Formula Review (what we learned about DBS itself)

### 3.1 The formula reconstruction is perfect
Across 13,796 clean samples, the stored score exactly equals `slopeComponent + returnComponent + emaComponent` to machine precision (max delta = 0.00e+00). **This rules out a whole class of potential defects**: wrong field references, caching bugs, format-conversion issues, stale writes, threading hazards. The number stored in the telemetry file is exactly the weighted sum of the three components as computed at emit time.

### 3.2 The three components are doing real work — but slope and EMA overlap more than they should
Pooled correlation matrix (all pairs, all cycles):
- **slope × ema: +0.7493** ← borderline redundant
- slope × return: +0.6848
- return × ema: +0.5439

None of these crosses the 0.90 collinearity threshold, so the formula is formally 3D. But slope × ema at 0.75 is high enough that the composite is effectively ~2.5-dimensional: the slope and EMA components are both measuring trend structure (linear-regression steepness vs fast-slow-EMA gap) and they agree most of the time. The 0.40 + 0.25 = 0.65 combined weight on slope and EMA is arguably over-counting the same information.

**At the per-pair level the picture is much more variable**: about 10% of pairs have one component pair with |r| ≥ 0.90 (effectively 2D locally), and a separate subset has *negatively* correlated components (down to r = -0.95) where the slope component and the return component cancel each other during mid-window reversals, producing near-zero DBS that doesn't reflect the directional intensity that actually happened.

**Verdict**: the formula is 3D enough to proceed, but slope/EMA redundancy and anti-correlation cancellation are carry-forward improvement candidates for B62. Not a halt.

### 3.3 The current weights aren't on a cliff
Tested the formula under three alternate weight sets vs the current 0.40/0.35/0.25:

| Weight set | Mean \|Δ\| vs current | % of observations flipping category |
|---|---|---|
| Slope-heavy (0.50/0.30/0.20) | 0.0267 | 12.12% |
| Equal (0.33/0.33/0.34) | 0.0377 | 18.30% |
| Slope-EMA rebalance (0.40/0.20/0.40) | 0.0739 | **36.56%** |

**Interpretation:**
- The formula is **on a plateau** around 0.40/0.35/0.25. Small weight changes produce small shifts. The specific choice of weights isn't critical — 0.40/0.35/0.25 is approximately as good as 0.50/0.30/0.20 or 0.33/0.33/0.34.
- The **return component is load-bearing**: cutting its weight in half (the slope-EMA rebalance) flips 36% of categories and has max|Δ| = 0.20. If return were noise or pure redundancy, halving it would have no effect.
- **Unexpected property**: the slope-heavy variant produces **zero UP_STRONG and zero DOWN_STRONG**. Why: slopeComponent has an internal clamp at ±0.40. Loading weight onto slope scales its max contribution to ±0.50 under a 0.50 weight, still below the ±0.60 thresholds for UP_STRONG and DOWN_STRONG. Meanwhile demoting return and EMA reduces their contributions too. So upweighting slope paradoxically collapses the tails of the distribution. This is a subtle formula property worth documenting — if anyone proposes "just make slope more important" during B62, we can point to this result and say "that won't do what you think."

### 3.4 ATR normalization is borderline failing — but the verdict is deferred
The IQR (interquartile range) of DBS scores, bucketed by pair volatility:

| Bucket | Pairs | Mean | Median | IQR |
|---|---|---|---|---|
| LOW_ATR (bottom 20% of pairs by median ATR) | 11 | −0.14 | −0.13 | 0.33 |
| MID_ATR (middle 60%) | 35 | +0.00 | +0.04 | 0.28 |
| HIGH_ATR (top 20%) | 12 | +0.06 | −0.07 | **0.67** |

The pass criterion is that the IQR ratio of LOW / HIGH should be within [0.5, 2.0] — a properly ATR-normalized formula should produce similar spread across volatility tiers. **LOW / HIGH = 0.494**, just below the 0.5 threshold. Technical fail.

Category mass per bucket is even more pointed:
- HIGH_ATR pairs are labeled NEUTRAL 1.85% of the time (vs 26.24% for LOW_ATR pairs)
- HIGH_ATR UP_STRONG is 7.26% (vs 0.00% LOW_ATR)
- High-vol pairs reach extreme DBS categories far more easily than low-vol pairs

**Two possible interpretations and we can't tell them apart from passive observation alone:**
1. **ATR normalization is under-compensating** — the divide-by-ATR math isn't fully canceling the volatility advantage, so high-vol pairs are structurally favored to reach extreme DBS categories
2. **Market reality** — high-volatility crypto genuinely has more directional conviction right now; the LOW_ATR bucket is mostly stablecoins and fiat FX (EUR/CHF, USDG/USD, TRX/EUR) which *should* be flat, and the HIGH_ATR bucket is volatile crypto (XMR, BNB, TAO) + gold proxies (PAXG, XAUT) which *are* actually moving strongly right now

The definitive test is the **responsiveness injection** in A.1 Final: pick 5 pairs per bucket, replay a 30-candle window with a synthetic +1×ATR injection at the end, measure the DBS delta. A correctly normalized formula produces approximately equal deltas per bucket. That test requires forward OHLC replay which cycle-sampled telemetry alone can't provide, so it's deferred to A.1 Final.

**Per Langston's recommendation, I am not escalating this to Kyle as a firm finding yet.** It's a borderline signal that could go either way under the definitive test. Carry-forward item for A.1 Final.

### 3.5 Edge cases and clamp saturation
- **Silent-zero rate: 0/13,896 (0.00%)** — the early-return guard in `directional-bias.ts` (`ohlcLen < lookbackPeriod` or `atr ≤ 0`) never fires. Every pair has enough data. Healthy.
- **slopeComponent saturation: 0%** — slope's clamp is generously sized relative to the actual range of ATR-normalized linear regression slopes. Never binding.
- **returnComponent saturation: 5.1%** — moderate and acceptable. The raw `return × 10` value exceeds ±1.0 about 5% of the time.
- **emaComponent saturation: 10.4%** — highest of the three. The fast-slow EMA gap exceeds ±1×ATR about 10% of the time. This is the highest saturation rate and means emaComponent is losing information at the extremes of strong trends. Worth a B62 review of either the clamp width or the normalization denominator.

### 3.6 A.1 Provisional verdict
**KEEP the formula with B62 improvement candidates.** The formula is reconstructable, its weights are on a plateau, and the known imperfections (slope/EMA redundancy, anti-correlation cancellation, borderline ATR normalization, emaComponent saturation) are all documented and carried forward. Nothing blocks A.2 from running, nothing halts B62 planning.

---

## 4. A.4 — Data Quality (is the DBS output trustworthy at the per-sample level?)

Short section, because the finding is clean.

- **Silent-zero count**: 0 / 13,896 samples. Every sample has `sentinelZero = false`. The guard never fires.
- **20-pair spot check** stratified by ATR bucket (6 LOW + 8 MID + 6 HIGH) with category spread within each bucket (per Langston's request — no monoculture): 
  - 20/20 pass category lookup (stored category matches stored score under the fixed thresholds)
  - 20/20 pass sum reconstruction (score exactly equals slope + return + ema)
  - 20/20 pass numeric bounds (every score is in [-1, +1])
  - 17/20 have all three components pointing the same direction (strong unanimity)
  - 3/20 have partial sign agreement (two of three); these are all interpretable:
    - USDG/USD sitting essentially at zero (stablecoin noise)
    - RIVER/USD in mid-window reversal — regression slope mildly positive, return and EMA both negative
    - RAVE/USD with return component *clamped at the ceiling* (pair rallied more than +10% over the window) while the EMA is slightly negative (recent weakness). **This is a concrete example of the A.1 §3.5 concern**: when the return component saturates, it can mask a weakening EMA signal

No formula bugs, no threading hazards, no cache-staleness issues. Data quality at the per-sample level is clean.

---

## 5. A.2 — Threshold Review (the finding that actually matters for B62)

### 5.1 Headline result
Cross-tabulated DBS category × classifier regime label on two data sources:

1. **VTS trade-sampled** — 1,904 DBS-era trades (from 2026-03-05 when DBS was added through 2026-04-15)
2. **MCE cycle-sampled full universe** — 13,954 clean pair-cycles from the 12-hour forward window on staging

| Metric | B59 snapshot estimate | VTS trade-sampled | **MCE cycle-sampled (authoritative)** |
|---|---|---|---|
| % of RANGE_BOUND_STABLE labels with **non-NEUTRAL DBS** (drift contamination) | ~47% | 78.32% | **72.59%** |
| % of strong-DBS units locked into RBS | — | 39.96% | **54.48%** |
| IMPULSE_EXPANSION share | ~2.4% | 1.89% | **0.12%** |
| TREND_FRIENDLY_STABLE share | ~19.3% | 9.40% | 3.11% |
| RANGE_BOUND_STABLE share | ~54.5% | 55.72% | 59.45% |

**Three numbers that matter most:**

- **72.59% of "range-bound" labels are drift-contaminated.** Nearly 3 out of every 4 pairs that the current classifier says is range-bound actually have measurable directional bias. B59 estimated 47% drift contamination; the actual full-universe rate is 72.59%. **B59 underestimated the problem.**
- **54.48% of strongly directional pair-cycles are locked out of trend strategies** by the classifier routing them to RANGE_BOUND_STABLE. In the 12-hour window: 3,864 pair-cycles had strong DBS (UP_MODERATE/STRONG or DOWN_MODERATE/STRONG). Of those, **2,105 were labeled RBS** (locked out of `momentum_burst`, `breakout_pull`, `continuation_push`, `adx_ignition`, `vwap_pullback` etc.), 1,475 landed in HIGH_VOLATILITY_UNSTABLE or STRUCTURAL_TRANSITION (partially locked out), and only 284 (**7.35%**) actually reached trend-permissive regimes.
- **IMPULSE_EXPANSION is empirically 0.12% of cycles.** The 4 strategies mapped to that regime are getting essentially zero opportunities. This is the starving-strategy problem in one number, confirmed.

### 5.2 Selection bias between the two data sources
Every DBS category shows ≥3 percentage points of divergence between VTS and MCE:

| Category | VTS % | MCE % | VTS − MCE |
|---|---|---|---|
| UP_STRONG | 5.36% | 1.35% | +4.01 pp |
| UP_MODERATE | 20.64% | 11.04% | +9.60 pp |
| UP_WEAK | 17.12% | 24.99% | −7.87 pp |
| NEUTRAL | 16.60% | 26.11% | −9.52 pp |
| DOWN_WEAK | 12.13% | 21.21% | −9.07 pp |
| DOWN_MODERATE | 19.91% | 13.47% | +6.44 pp |
| DOWN_STRONG | 8.25% | 1.83% | +6.41 pp |

**Pattern**: VTS over-represents strong-directional categories and under-represents weak/neutral categories. This is exactly what we'd expect — strategies are more likely to fire signals on strongly moving pairs, so VTS trades are biased toward the direction tails. This confirms the scope §3 decision to make A.2 Final cycle-sampled rather than trade-sampled. The MCE numbers should be trusted more than the VTS numbers for full-universe conclusions.

### 5.3 DBS category mass analysis
The current fixed thresholds produce a **bulge-in-the-middle** distribution:

| Category | MCE cycle-sampled % |
|---|---|
| UP_STRONG | 1.35% |
| UP_MODERATE | 11.04% |
| UP_WEAK | 24.99% |
| NEUTRAL | 26.11% |
| DOWN_WEAK | 21.21% |
| DOWN_MODERATE | 13.47% |
| DOWN_STRONG | 1.83% |

**UP_STRONG + DOWN_STRONG combined is only 3.18% of cycles.** The tails are sparse because of the internal component clamps: to reach UP_STRONG (≥ +0.60), at least two of the three components must be near their individual ceilings simultaneously, which is an empirically rare coincidence.

**Options for B62 (recommendations, not decisions):**
1. **Rolling percentile thresholds** — UP_STRONG = top 5% of the current-window distribution, UP_MODERATE = top 25%, etc. This forces balanced categories regardless of market state.
2. **Looser fixed thresholds matched to the empirical distribution** — e.g. UP_STRONG at +0.50 instead of +0.60, which would let ~5% of cycles reach UP_STRONG organically.
3. **Leave as-is and use the raw score directly in the classifier** — categories become UI/telemetry labels only, not a decision surface.

A.2 Final will produce specific threshold recommendations once the mature cycle-sampled window is available.

### 5.4 Classifier regime distribution (full universe)

| Regime | % of cycles | Notes |
|---|---|---|
| TREND_FRIENDLY_STABLE | 3.11% | Very thin — 5 strategies compete for 3% of cycles |
| IMPULSE_EXPANSION | 0.12% | **Effectively empty** — 4 strategies get essentially no opportunities |
| HIGH_VOLATILITY_UNSTABLE | 15.51% | Reasonable share |
| STRUCTURAL_TRANSITION | 21.81% | **Strongly suspicious.** 22% is too large for a regime that is supposed to represent a transient state. The most likely explanation is that STRUCTURAL_TRANSITION is a default fallback catching everything not confidently labeled elsewhere, making it 22% by accident rather than by design. B62 should treat ST's definition as a separate design question, not tacitly inherit it. If it really is a "transition zone," it should be small and time-limited; 22% of cycles is inconsistent with that semantics. |
| RANGE_BOUND_STABLE | 59.45% | **Dominant, and 72.59% of it is drift-contaminated fake range** — so roughly 43% of total pair-cycles are mislabeled |

The independent "Mapping Drift" tab in the Analytics & Diagnostics UI on staging independently shows the same regime distribution (I read the backend code to confirm it's sourced from `calculatePairRegime()`, the same classifier we're auditing). The UI displays "Drift Score: 0.968" and "Drift Detected" — it already knows the system is misaligned, it just measures misalignment differently than we do (it's a weighted Euclidean distance between smoothed (volZ, trendZ) and hard-coded per-regime ideal targets). **The regime distribution portion of that tab is corroborating evidence for B61's findings; the Drift Score portion is measuring a different question.**

---

## 6. What this means for B62 direction

### 6.1 The case for DBS-integrated classifier redesign is strengthened
- The drift contamination problem is real, bigger than B59 thought, and affects the majority of "range-bound" labels
- The starvation of IMPULSE_EXPANSION strategies is confirmed at 0.12%
- The DBS formula itself is trustworthy enough to carry into the classifier design

### 6.2 But the A.1 findings constrain how DBS should be integrated
- **slope/ema overlap at 0.75**: using raw DBS as a classifier input means the classifier is partly trend-counting the same signal twice. Acceptable, but worth noting.
- **Anti-correlation cancellation**: pairs in mid-window reversal produce low DBS that doesn't reflect real directional intensity. The classifier can't tell "genuinely neutral" from "violently reversing" using DBS alone — it needs vol + ADX to distinguish.
- **ATR normalization borderline fail**: if confirmed in A.1 Final, the classifier may need to apply a pair-volatility-class-specific DBS threshold rather than using a global threshold. Or use ATR-adjusted DBS.
- **Tail sparsity (3.18% in UP_STRONG+DOWN_STRONG combined)**: if the classifier gates IMPULSE_EXPANSION on "DBS ≥ UP_STRONG threshold", the new IE share would only be about 3% — better than 0.12% but not dramatically so. Either thresholds need to shift or the gating should be broader (e.g. "DBS magnitude ≥ 0.50" instead of "≥ UP_STRONG category").

### 6.3 Decision framework for the B62 scoping
After A.2 Final (mature cycle-sampled window, ~3–5 days from now), B62 scoping should be able to answer:
- **How many additional pair-cycles would land in IE and TFS** under a DBS-integrated classifier design?
- **How many of those would survive the existing strategy-detection logic** (SQE, RTB, Net EV, confidence floor, pattern-pool guardrails, etc.)?
- **What's the survival ratio** from "eligible by regime" → "actually becomes a trade"?

The survival ratio is the number that determines whether Kyle's Path D question becomes live or stays dormant. Which brings me to the strategic question I want the previous CC session to weigh in on.

### 6.4 IMPULSE_EXPANSION as an empirically vestigial regime — a B62 design decision

At 0.12% observed share, IMPULSE_EXPANSION is **two orders of magnitude smaller** than the original 2–5% taxonomy assumption. The 4 strategies mapped to IE (`momentum_burst`, `breakout_pull`, `continuation_push`, `adx_ignition`) are starving not because IE is "rare" but because IE is "essentially never observed" in current market conditions. This raises a regime-taxonomy design question that B62 must explicitly resolve:

1. **Delete IE entirely** and redistribute its 4 strategies to TFS / HVU / STRUCTURAL_TRANSITION based on where each strategy actually wants to fire.
2. **Redefine IE** with a less-restrictive criterion that matches observed behavior — e.g. drop the ADX > 55 requirement and use DBS magnitude + a volatility envelope instead.
3. **Keep IE as a genuine rare-event regime** (0.1% is its real rate) and repurpose the 4 starving strategies for a different regime, reserving IE for actual rare events.

**Recommended B62 sequencing (CC + Langston consensus 2026-04-15):**
- **Step 1:** Redefine IE with a less-restrictive criterion based on observed DBS + volatility behavior. This is the least-destructive change and the most reversible.
- **Step 2:** Measure the redefined IE share over at least 72 hours of cycle-sampled data.
- **Step 3:** If the redefined IE is still < 1% of cycles or is behaviorally indistinct from TFS / HVU, then delete IE and redistribute the 4 strategies. If > 1% and behaviorally distinct, keep the redefined version.

No pre-commitment to delete or keep. A clear decision tree B62 can execute against.

### 6.5 Strategy capacity planning — consequence of the corrected drift-contamination number

The B59-era simulation showing "RBS drops from 54.5% to 3.4% under DBS-based classifier" was using the B59 drift-contamination estimate of ~47%. B61 measures 72.59%. That means the real regime distribution shift under a DBS-integrated classifier will be **more dramatic than the simulation predicted**. Specifically:

- The 5 strategies currently routed to TREND_FRIENDLY_STABLE will see significantly more flow than the simulation projected. B62 should audit their individual capacity, concurrency limits, and RTB ranking behavior to confirm they can handle a ~7–8× increase in candidate signal volume without ranking-queue starvation or confluence-buffer overflow.
- The newly redefined or reallocated IE strategies (per §6.4) will absorb some of the new flow. B62 should plan the redistribution explicitly.
- The existing dormant strategies (all currently starving because of IE's 0.12% share) will need a concurrency-limit review before they can absorb their fair share of the new routing.

**Strategy capacity planning is an explicit B62 scoping input**, not a footnote. B62 should produce a per-strategy capacity review as part of its scope doc.

---

## 7. Strategic question — the DBS-native strategy path

### 7.0 Failure-mode decomposition: regime scarcity vs gate rejection

**This section was added 2026-04-15 in response to a Langston observation during CC + Langston consensus review of the prior CC session's cross-review.** It is load-bearing for the rest of §7 and should be read before the four paths.

The 54.48% strategy-lockout number reported in A.2 can be produced by **two distinct failure modes** which require **different fixes**. Distinguishing them is the primary purpose of the replay analysis in §7.6.

**Failure mode A — regime-scarcity lockout.** The classifier mislabels a strong-DBS pair as RBS / HVU / ST, so the pair never reaches the regime → strategy lookup for trend strategies. The lockout happens *before* any strategy-level gate runs. The pair is lost at the routing stage.
- **Fix:** Paths A (classifier redesign) / B (regime override) / C (mixed) — change the routing itself. Existing trend strategies wake up naturally once the pair reaches them.
- **Observable signature in the replay:** a pair-cycle that flips from RBS to TFS/IE under the counterfactual classifier AND has at least one trend strategy eligible under the canonical map AND the strategy's detect function fires a signal AND the signal survives SQE/RTB/NetEV gates. If this happens for a large fraction of the flipped cycles, the failure mode is scarcity-dominant.

**Failure mode B — post-eligibility gate rejection.** The classifier correctly routes a strong-DBS pair to TFS/IE (or would, under the counterfactual classifier), the regime → strategy lookup admits it, and one or more trend strategies evaluate it — but then:
- The strategy's detect function rejects the setup (pattern-pool guardrail, confidence floor, pattern-type mismatch, etc.), OR
- The detect function fires a signal but the signal fails the SQE confidence floor, RTB ranking cutoff, or Net EV threshold downstream.

Either way, the pair was routed correctly but still didn't become a trade. The failure is not in the classifier; it is in the gates after the classifier.
- **Fix:** Path D (dedicated trend-rider with filter thresholds tuned for trend-following entries) OR re-tuning the existing gates OR both.
- **Observable signature in the replay:** a pair-cycle that flips from RBS to TFS/IE AND reaches at least one trend strategy's detect function AND either the detect rejects OR the resulting signal fails a downstream gate. If this happens for a large fraction of the flipped cycles, the failure mode is gate-rejection-dominant.

**Why this distinction drives the Path D decision:**
- If the replay shows mostly Failure Mode A across the trend strategies, Paths A/B/C alone will recover most of the opportunity. Path D is redundant.
- If the replay shows mostly Failure Mode B, the classifier fix alone will not help — the gates are filtering out the opportunities and the only way to capture them is either re-tuning the gates (bad, affects all strategies) or adding a dedicated trend-rider path with gates tuned for trend-following (Path D, targeted).
- If the mix is roughly even or varies by strategy, Path D becomes a targeted addition for the gate-rejection-heavy strategies, not a wholesale parallel pipeline.

The replay's primary deliverable is the **x/y split** per strategy, where **x = Failure Mode A percentage** and **y = Failure Mode B percentage** for that strategy's newly-eligible pair-cycles.

### 7.1 Kyle's original framing (2026-04-15)
> *"When we see very strong bullish trending pairs, is that in itself an opportunity for a strategy that we don't have in our bag of strategies? Is that something that if we looked at it earlier, perhaps in the filtering process, and we identify pairs that are trading on such a strong bullish trend that there's a strategy out there that can pick up on this and make strong signals that have a likelihood of opening and closing with a profitable trade, and that that strategy may look at a completely different set of filters. Maybe volume or liquidity is as important as it would be for the other signal types..."*

And later (2026-04-15):
> *"There's a fourth scenario where a strong enough DBS score, maybe it has to go through the global filters, but then is routed through a separate set of filters. And if it survives those filters, then there's a strategy waiting on the other side of that that isn't a part of our current set of strategies, one that is much more loose and forgiving and is only looking to ride the trend..."*

### 7.2 The four paths Kyle is considering
| Path | Description | B61 data status |
|---|---|---|
| **A. Fix the classifier** | Redesign `calculatePairRegime()` to use DBS as an input. Pairs with strong DBS get correctly labeled TFS or IE. Existing trend strategies wake up naturally. | ~54% of strong-DBS pair-cycles are currently mislabeled RBS. This is the opportunity target. |
| **B. Regime override** | Add a DBS-based override: if `DBS ≥ +0.60` (or whatever threshold), force-label the pair as TREND_FRIENDLY_STABLE regardless of vol/ADX/mom. Simpler than Path A. | Same target. Simpler to implement. |
| **C. Mixed** | Path A for most regimes + Path B as a safety net for strong-DBS cases. | Same target. |
| **D. DBS-native strategy family** | Keep the regime classifier as-is OR combine with A/B/C. ADDITIONALLY: build a new strategy branch that takes strong-DBS pairs through a separate global-filter stack, then through a loose/forgiving secondary filter, then hands them to a new trend-rider strategy that doesn't exist in the current 17-strategy bag. Different gate thresholds, volume/liquidity priority, pure trend-following entry logic. | Same target via a parallel pipeline. Not gated by the regime classifier at all. |

### 7.3 Why the decision can't be made yet
B61's data tells us **the opportunity gap exists** — ~54% of strong-DBS pair-cycles are being routed away from trend strategies. But it doesn't tell us whether:
1. The existing trend strategies (once reachable via Paths A/B/C) would actually convert those opportunities into profitable trades, or
2. The existing strategies would reject most of those opportunities because of their gate logic (SQE confidence floors, pattern-matching requirements, RTB ranking cutoffs, Net EV thresholds), leaving a large residual pool that only a new trend-rider (Path D) could capture

To answer #2 we need to see what the **existing strategies** do with the **opportunities they don't currently see**. B62's classifier redesign is the natural experiment that generates that data — once DBS-integrated regime labeling deploys and strong-DBS pairs start landing in TFS/IE, we can measure the survival ratio from "eligible by regime" → "becomes a trade":

- High survival ratio (>50%) → Paths A/B/C are sufficient; Path D is not needed
- Medium survival ratio (20–50%) → Paths A/B/C capture most of the opportunity; Path D is a nice-to-have enhancement for the residual
- Low survival ratio (<20%) → the existing strategies are rejecting most strong-DBS opportunities on grounds other than regime labeling; Path D becomes valuable because the existing gate logic is itself too restrictive for pure trend-ride setups

### 7.4 When the right data will be available
The earliest defensible decision point is **after B62 deploys to staging and runs for at least a week**. The measurement sequence:

1. **T0**: B61 Finals close. DBS is validated. Governance deltas applied.
2. **T0 + 1 week**: B62 classifier redesign deploys. Strong-DBS pairs start landing in TFS/IE. New regime distribution in production.
3. **T0 + 2 weeks**: Measure:
   - `regime_transition_rate`: how many pair-cycles that were RBS under the old classifier are now TFS/IE under the new classifier
   - `strategy_eligibility_rate`: of those, how many get evaluated by at least one trend strategy (i.e. pass the regime→strategy lookup in `CANONICAL_REGIME_STRATEGY_MAP`)
   - `strategy_signal_rate`: of those evaluated, how many generate a raw signal (pattern detection or indicator trigger fires)
   - `gate_survival_rate`: of those signals, how many survive SQE + confidence floor + RTB ranking + Net EV gate to become actual VTS trades
   - `outcome_rate`: of those trades, how many close profitable (tells us whether they're *good* opportunities, not just *additional* ones)
4. **T0 + 3 weeks**: the Path D decision can be made based on these numbers

B61 can't generate any of these numbers because they all require the classifier change to have happened.

### 7.5a Replay analysis methodology (added 2026-04-15 after CC + Langston consensus)

**What the replay replaces.** Originally §7.4 proposed a 3-week wait for live B62 data to answer the Path D question. That timeline was a false constraint — the answer can be produced in ~4 days via counterfactual replay on existing cycle-sampled telemetry. The prior CC session proposed this, Langston confirmed, and the replay is now the canonical mechanism for making the Path D decision.

**When the replay runs.** After A.2 Final's mature cycle-sampled window is confirmed by Langston's written maturity check (scope §3). **Not on the 12-hour early window.** The replay is too strategic to base on underpowered data.

**Packaging.** Fold into **B62 Phase 0** as the first analytic before any code changes. No formal B61.5 batch needed (CC lean; Langston concurs). B62 scoping cannot proceed without the replay output, which enforces the sequencing naturally.

**Replay design (5 steps):**

1. **Counterfactual regime labeling.** Apply a candidate DBS-integrated classifier to each MCE cycle-sample in the mature window. Produce a `counterfactual_regime` column per pair-cycle. The candidate classifier is whichever design B62 is testing (Path A, Path B, or a Mixed variant).
2. **Counterfactual eligibility.** For each pair-cycle that flips from its actual regime to TFS / IE / HVU under the counterfactual, compute which trend strategies become newly eligible via the canonical regime → strategy map. Pure lookup, zero fidelity concerns.
3. **Counterfactual signal generation.** For each newly-eligible (pair, cycle, strategy) tuple, replay the strategy's `detect` function against the actual OHLC at that cycle. Strategy detect functions are deterministic given OHLC + indicators, both of which are recorded in the cycle snapshot.
4. **Counterfactual gate survival.** For each generated signal, replay the SQE confidence floor, RTB ranking, Net EV gate, pattern-pool guardrail, and any other gate logic deterministically.
5. **Output.** A per-strategy table with columns:

| Strategy | Currently eligible per cycle | Newly eligible under counterfactual | % that detect a signal | % of signals that survive gates | Failure Mode A share | Failure Mode B share |

### 7.5b Replay fidelity: non-OHLC dependencies frozen / approximated

**Critical honesty check.** The replay is only as trustworthy as its accounting for dependencies that are NOT just OHLC. The deliverable MUST include a subsection enumerating every non-OHLC input and stating how it is held constant or approximated. At minimum:

- **MCE 60s TTL cache.** Cycle-sampled snapshots may not align exactly with cache-write timestamps. A small fraction of replays will hit different cached values than the live system would have. Bounded noise, not a fidelity wall. Report should say results may differ ~3–5% from forward-live measurement due to MCE cache timing.
- **Global friction cache.** Need either frozen snapshot (use the recorded value at cycle time) or an approximation rule (e.g. EMA of recent values). Document which.
- **Global DBS cache.** Same treatment as global friction. The MCE telemetry already records global DBS per cycle, so a frozen snapshot is straightforward.
- **Active pair-pool / filter-pool state.** The FX5 scanner output at cycle time determines which pairs are eligible at all. Needs to be reconstructed from FX5 scanner logs or frozen from a recorded pool snapshot.
- **Telemetry-aggregator-derived regime context.** Some strategy logic consults the telemetry aggregator for derived context (dominant regime, regime transition, etc.). Needs either reconstruction or a frozen snapshot.
- **Time-of-call branching inside strategy detect or gate logic.** Any code path that branches on `new Date()`, session timers, or cooldown windows needs explicit handling.
- **Double-count / path-collision effects.** If a pair would qualify both through the normal regime path and the trend-rider path in the counterfactual, the replay must apply a canonical ownership tag (`regime_gated` or `trend_rider_routed`) to prevent double-counting. Downstream telemetry / ML / audit code must respect the tag exclusively.

**Replay deliverable rule:** the report MUST include a "Non-OHLC dependencies frozen / approximated" section that enumerates every non-OHLC input used and states how it was held constant or approximated. This is the honesty check that prevents over-claiming. A replay report without this subsection is rejected.

### 7.5c Architectural risk framing for Path D (corrected from §7.2)

The prior CC session + Langston pointed out that my "two parallel pipelines" framing for Path D in §7.2 overstates the cost. A more accurate framing is **"one pipeline with an additional entry point."** Shared infrastructure (OHLC fetching, MCE, base SQE, RTB, Net EV gate, paper execution engine, telemetry) does not duplicate. What actually gets added:

- A routing branch in the pre-strategy stage that reads "if DBS magnitude ≥ threshold, route this pair-cycle through the trend-rider eligibility path in addition to the regime-gated path." Tens of lines of code.
- A separate filter chain for the trend-rider path — a parallel SQE/RTB-equivalent with different thresholds tuned for trend-following entries. This is the actual additional surface area.
- One or more new strategy files implementing the trend-rider entry/exit logic. Comparable to adding a new strategy to the existing 17-strategy bag.
- Separate telemetry for the trend-rider pipeline, so it can be measured independently of the main pipeline.

**Cost estimate:** 1–2 weeks of implementation, 500–1000 lines of new code, **if the trend-rider path is kept narrow**. Sprawls if it becomes a generic parallel-framework exercise. **The real cost is governance and verification overhead, not raw LOC.** Comparable in scope to Phase 14.5's dual quant+pattern path, which DawnTrader already absorbed cleanly.

**Five real architectural risks (expanded from the three I originally noted):**

1. **Governance burial surface area increases.** New filter chain + thresholds + routing rules creates new places for drift from System Manual docs. Mitigation: document the trend-rider path as a first-class SIM + System Manual citizen from day one. No half-measures.
2. **Phase 16 DB cleanup scope grows.** New strategy + new filter chain + new telemetry stream means new tables or new columns. Mitigation: minimal DB footprint, prefer column additions over new tables.
3. **Phase 19 paper audit scope grows.** Two code paths (not two pipelines) to verify in paper mode before live mode. Mitigation: same audit checklist applies to both paths; unavoidable but bounded.
4. **ML adaptive layer (Phase 17/18 post-live) gets more complex.** Two state spaces, two reward signals, potentially competing optimizations. Mitigation: defer this concern; post-live ML is a year+ away. The architectural decision today should optimize for pre-live data quality, not post-live ML simplicity.
5. **Attribution ambiguity / double-credit risk** (added by Langston 2026-04-15). If the same market opportunity can be surfaced by both the regime-gated path and the trend-rider path, telemetry, ML reward signals, and post-hoc audits can get muddy fast unless identity and ownership rules are explicit from day one. Mitigation: at the routing branch, each pair-cycle gets a single canonical ownership tag — `regime_gated` or `trend_rider_routed` — and downstream telemetry / ML / audit code respects that tag exclusively. No double-counting even if both paths would have generated a signal for the same pair-cycle.

**Asymmetric-reversibility bias.** Building Path D and later finding it is unnecessary is cheaper to undo (delete the routing branch, keep the strategy file in the bag) than NOT building Path D and later finding it was needed (another batch cycle to retrofit). Slight bias toward **"don't build Path D unless the replay data demands it"** — deletion is cheaper than addition once the gate logic settles. This is the default going into B62 Phase 0.

### 7.5 What I'd like the previous CC session's take on
Specifically three things:

1. **Do you think the survival-ratio framing is the right way to gate the Path D decision**, or is there a better experimental design? For example: could we run the measurement on historical cycle-sampled data (replay the last 30 days through a new classifier + same strategies and see what would have happened) rather than waiting for B62 to deploy live? That would compress the decision timeline from 3 weeks to about 4 days of analysis work but adds replay fidelity concerns.

2. **Do you see any architectural risk in Path D that I'm missing?** Path D means maintaining a parallel strategy pipeline alongside the regime-gated one, with its own filter stack and its own entry/exit logic. The operational cost of "two pipelines" vs "one pipeline with better routing" is non-trivial. Does it cross a line where we should avoid it on principle, or is it reasonable if the data supports it?

3. **Is there anything in the B61 provisional findings that shifts your confidence in the overall Phase 15b approach?** The original plan was: validate DBS → redesign classifier with DBS → measure strategy opportunity flow → adjust. The findings are consistent with that plan but the magnitudes are bigger. Does that change any recommendations on sequencing, or does the plan still look right?

---

## 8. What's done, what's next

### Completed in this session
- Phase 3a (codebase consumer grep + halt gate + Kyle's corrected framing + Langston consensus)
- Phase 3b (instrumentation implementation, commit `1bfd3bf6`, CI success, staging deploy, telemetry live)
- Four governance files corrected in place (SCOPE, PRE_AUDIT, SIM, SYSTEM_MANUAL)
- A.1 / A.4 / A.2 Provisional deliverables written and Langston-reviewed
- Mapping Drift tab backend investigated + tabled for post-launch teardown
- DBS numeric score capture added to the telemetry schema and all relevant TypeScript interfaces (this session's in-flight code change, diff pending Langston review)

### Next session resumes at
1. **A.3 Global DBS Methodology** — CC owned (transferred from Langston per Kyle). Weighted-median-by-volume review, pair-universe stability, external cross-reference against Crypto Fear & Greed, BTC dominance, altcoin momentum indices.
2. **A.0 Baseline** — legacy classifier flicker rate on cycle-sampled data (>6h already collected). Methodology adjustments from Langston: matched-symbol-matched-timestamp comparison, report both category-boundary and family-level sign flip rates, separate stablecoin/ultra-low-vol side bucket.
3. **Maturity gate** — post 2-of-3 values (global DBS crossed NEUTRAL both ways, ≥3 distinct 2σ moves across different symbols, RBS/TFS ratio divergence ≥ ±10pp) to Thread 21 once the window clears the thresholds.
4. **A.1 / A.2 / A.4 Finals** — on mature cycle-sampled data after Langston's written maturity confirmation.
5. **B61 completion report** and governance close-out.

### Deliverables on disk (in `Claude Comms and Packages/`)
- `Scope Files/BATCH_61_SCOPE.md` (updated 2026-04-15 with Phase 3a amendment)
- `Scope Files/BATCH_61_PRE_AUDIT.md` (updated 2026-04-15)
- `Scope Files/BATCH_61_A1_FORMULA_REVIEW_PROVISIONAL.md`
- `Scope Files/BATCH_61_A4_DATA_QUALITY_PROVISIONAL.md`
- `Scope Files/BATCH_61_A2_THRESHOLD_REVIEW_PROVISIONAL.md`
- `B61_PROVISIONAL_FINDINGS_REPORT_2026-04-15.md` (this document)
- Analysis scripts: `scripts/phase15b/*.py` (re-runnable on staging data)

---

---

## 9. Addendum — CC + Langston consensus response to the prior CC cross-review (2026-04-15)

Kyle shared an earlier draft of this report with a prior Claude Code session for independent review. The prior CC returned a substantive cross-review with three strategic answers, six "things the report doesn't address" items, and six procedural recommendations. Langston and I iterated to consensus on incorporation. This appendix records what was folded in and where.

### 9.1 Methodological note — B59 47% → B61 72.59% delta

**What B59 reported:** 47% drift contamination in RANGE_BOUND_STABLE labels, based on a single 88-pair point-in-time snapshot taken 2026-04-14 during the `range_trade` root-cause investigation.

**What B61 measures:** 72.59% drift contamination in RANGE_BOUND_STABLE labels, based on 13,954 cycle-samples across 58 pairs spanning a 12-hour rolling window on staging.

**Why the delta (hypothesis, not confirmed):** The most plausible explanation is that the B59 snapshot caught a moment of less-than-average drift contamination, while the B61 rolling window captures the mean. Single-point snapshots of drift contamination are inherently noisy — they sample a single instant in a time series with non-trivial variance. Cycle-sampled rolling windows are the appropriate instrument.

**Methodological lesson:** point-in-time snapshots of drift metrics should NOT be used as a basis for decisions. Cycle-sampled rolling windows are authoritative, point-in-time snapshots are indicative at best. This rule should carry forward into B62 and beyond.

**Caveat:** the "snapshot caught a low-drift moment" hypothesis is plausible but unverified. Definitive root-cause analysis would require comparing the B59 snapshot's exact timestamps against the B61 cycle-sampled window to see where the B59 observation lands in the distribution. That cross-reference is deferred — the lesson stands regardless of which exact moment the snapshot caught.

### 9.2 Freeze-envelope compliance for the DBS numeric score capture

The Phase 15b code freeze covers `server/core/metrics/directional-bias.ts` and `server/core/metrics/market-regime.ts`. The numeric DBS score capture change implemented during this session (commit `62a7e358`, signature patch `22730c96`, rollback `82b601cb`) touched several adjacent files but NOT the two frozen files. Compliance accounting:

**Touched (all outside the freeze envelope):**
- `server/services/market-indicators.ts` — new `cachedGlobalDBSScore` state + `getLastGlobalDBSScore()` exported getter. Adjacent to the freeze but not frozen. No behavior change.
- `server/services/vts-runner.ts` — interface additions + write-site capture + passthrough sites. Not frozen. No behavior change beyond the new telemetry field.
- `server/services/vts-service.ts` — `VirtualTrade` interface + `persistRealPriceTrade` parameter signature + trade object construction. Not frozen. No behavior change.
- `server/utils/export-csv.ts` — export interface + return value. Not frozen.

**Touched then rolled back (out-of-scope, corrected per Kyle directive):**
- `shared/schema.ts` — two decimal columns added to `telemetry_history`, then removed when Kyle clarified scope. Adjacent to the freeze but not frozen.
- `server/services/telemetry-repository.ts` — TelemetryEntry interface + two insert passthroughs, then reverted. Not frozen.

**Production DB action (executed then reversed):** `ALTER TABLE telemetry_history ADD COLUMN` for two columns, then `DROP COLUMN` once scope was corrected. Zero data affected — the table had zero rows throughout.

**Not touched:**
- `server/core/metrics/directional-bias.ts` — frozen, untouched
- `server/core/metrics/market-regime.ts` — frozen, untouched

**Freeze compliance: GREEN.** All modifications were outside the frozen envelope. The score-capture change is strictly additive (new fields populated alongside existing fields), feature-compatible (old code paths that don't set the new fields still work), and no behavior downstream of the writers was changed (nothing reads the new fields yet except future B62 consumers).

A future audit will be able to verify compliance by checking the git history of `directional-bias.ts` and `market-regime.ts` from 2026-04-14 (Phase 15b lock) through B61 close. Both files will show zero commits in that window.

### 9.3 Consensus log with Langston (2026-04-15)

The prior CC session's cross-review was forwarded to Langston on Thread 21 in four parts. Langston responded with full agreement on all six recommendations plus three substantive additions. The convergence produced this appendix and the inline edits to §1, §2.5a, §5.4, §6.4, §6.5, §7.0, and §7.5a–7.5c.

**Accepted additions from Langston beyond the prior CC's scope:**

1. **Replay fidelity — "non-OHLC dependencies frozen / approximated" subsection** (§7.5b above). Langston flagged that the replay must enumerate every non-OHLC input and document how it is held constant or approximated. This is the honesty check that prevents over-claiming.
2. **A.2 Final mature window gate.** Replay must wait for A.2 Final's mature cycle-sampled window per scope §3. No running Path D decision analysis on the 12-hour early window. The Path D decision sits behind the maturity gate, not in front of it.
3. **Attribution ambiguity / double-credit as the fifth architectural risk** (§7.5c above). If the same opportunity can be surfaced by both paths, telemetry / ML / audit get muddy unless ownership rules are explicit. Mitigation via a canonical ownership tag (`regime_gated` or `trend_rider_routed`) at the routing branch.
4. **Cost caveat: the real cost is governance and verification overhead, not raw LOC.** (§7.5c) The 1–2 week / 500–1000 LOC estimate is plausible only if the trend-rider path is kept narrow. Sprawls if it becomes a generic parallel-framework exercise.
5. **IE redefine-first sequencing** (§6.4). Step 1 redefine, Step 2 measure, Step 3 delete/keep. No pre-commitment to delete or keep.
6. **Neutral wording on the A.3 ownership transfer** (§2.5a). Factual, no pattern-recognition language.
7. **Scarcity vs gate-rejection failure mode decomposition** (§7.0). The biggest substantive addition from Langston. The replay's primary deliverable is now defined as the x/y split per strategy: x = Failure Mode A (regime-scarcity lockout), y = Failure Mode B (post-eligibility gate rejection). This decomposition sharpens the Path D decision from a vibe question into a measurable one.

**Accepted from prior CC verbatim (no modification):**
- Replay analysis in ~4 days instead of 3-week live wait
- B62 Phase 0 packaging (CC lean; Langston concurs) rather than formalized B61.5
- "One pipeline + entry point" framing correction for Path D
- B59→B61 methodological lesson on single-point snapshots (§9.1 above)
- Three B62-design-material findings: drift contamination magnitude, IE vestigial, slope-clamp constraint
- Six addendums (1–6 above, inlined in §2.5a, §5.4, §6.4, §6.5, §7.0, §7.5a–7.5c, §9.1, §9.2)
- Six procedural recommendations (all executed in this appendix cycle)

**B61 close-out governance action:** the slope-clamp constraint from A.1 §3.3 will be recorded in `1-system-manual/SYSTEM_MANUAL.md` Layer 1b during the B61 close-out Phase 10 pass. Language: "design constraint: `slopeComponent` has an internal ±0.40 clamp; raising the slope weight alone cannot produce extreme-category readings because the clamp binds before the ±0.60 threshold. Heavy-slope weighting produces the paradoxical effect of collapsing UP_STRONG / DOWN_STRONG shares to zero."

### 9.4 Outstanding items (deferred to next session and beyond)

- **A.3 Global DBS Methodology** — CC owned, delivered next session. Weighted-median-by-volume review, pair-universe stability analysis, external cross-reference against Crypto Fear & Greed / BTC dominance / altcoin momentum.
- **A.0 Baseline** — legacy classifier flicker rate with Langston's adjustments: matched-symbol-matched-timestamp comparison, report both category-boundary and family-level sign flip rates, separate stablecoin / ultra-low-vol side bucket.
- **Maturity gate** — post 2-of-3 values to Thread 21, wait for Langston written confirmation, then run Finals.
- **A.1 / A.2 / A.4 Finals** — on mature cycle-sampled telemetry. A.1 Final includes the responsiveness injection that will give the definitive ATR normalization verdict. A.2 Final includes non-overlapping forward-return behavioral validation and rolling-percentile threshold simulation.
- **B61 completion report** — YES/NO/PARTIAL on each gate condition from scope §6, governance-files-changed list, and the Phase 10 updates to SIM, System Manual Layer 1b (slope-clamp constraint), and CHANGES_AND_FIXES.
- **B62 Phase 0 replay analysis** — first analytic in B62, uses A.2 Final's mature cycle-sampled window, produces the failure-mode x/y split per trend strategy, and locks the Path D decision before any B62 code changes.

---

*End of B61_PROVISIONAL_FINDINGS_REPORT_2026-04-15.md.*
