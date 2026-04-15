# BATCH 61 — A.2 Provisional — DBS Threshold & Category Review

**Phase:** 15b (Regime / DBS / Strategy / Filter Restructure)
**Sub-Phase:** A — DBS Validation
**Stage:** A.2 Provisional (scope §4 A.2, pre-audit §7 step 13)
**Date:** 2026-04-15
**Author:** Claude Code
**Status:** DRAFT — exploratory / non-gating

---

## 0. Status labels

- **NON-GATING.** Cannot bless any B62 decision. Final verdict requires cycle-sampled maturity per scope §3.
- **DUAL DATA SOURCE.** Uses both the 15-day VTS window (category-level trade-time view) and the ~12h early cycle-sampled MCE telemetry (full-universe view). This is the split Langston approved in his "make the split explicit" note on Thread 21.
- Runs after A.1 Provisional cleared the formula-gate rule (§4 first, §2 second).

---

## 1. Headline findings

**The drift-contamination problem B59 identified is real, and bigger than B59 thought.**

| Metric | B59 snapshot (2026-04-14) | A.2 VTS trade-sampled (1,904 trades) | A.2 MCE cycle-sampled (13,954 cycles) |
|---|---|---|---|
| % of RANGE_BOUND_STABLE-labeled units with **non-NEUTRAL DBS** | ~47% | **78.32%** | **72.59%** |
| % of strong-DBS units **locked out of trend regimes** (in RBS) | — | **39.96%** | **54.48%** |
| % IMPULSE_EXPANSION labels | ~2.4% | 1.89% | **0.12%** |
| % TREND_FRIENDLY_STABLE labels | ~19.3% | 9.40% | 3.11% |
| % RANGE_BOUND_STABLE labels | ~54.5% | 55.72% | **59.45%** |

**Three headline numbers:**

- **Drift contamination: 72–78%** of RANGE_BOUND_STABLE-labeled units have non-NEUTRAL DBS. Nearly 3 of every 4 "range-bound" pairs show measurable directional bias. B59's 47% estimate was too conservative.
- **Strategy lockout: 40–54%** of strong-DBS units (UP/DOWN_MODERATE or STRONG) are in RANGE_BOUND_STABLE, which excludes trend strategies entirely. **This is the concrete answer to Kyle's DBS-as-strategy-discovery question**: there is a large, measurable pool of directional-bias trading opportunities that the current regime classifier is routing to range strategies (like `range_trade`, which bleeds at a 76% loss rate).
- **IMPULSE_EXPANSION is essentially empty: 0.12%** at the full-universe level. The 4 strategies mapped to that regime (`momentum_burst`, `breakout_pull`, `continuation_push`, `adx_ignition`) are starving for opportunities — the classifier gives them almost nothing to work with.

---

## 2. Full cross-tabulation — VTS trade-sampled

**Source:** `logs/virtual_trades/*.json` for all files with date ≥ 2026-03-05 (DBS era). Total DBS-era trades: **1,904**.

### 2.1 Matrix (DBS category rows × classifier regime columns)

| DBS category | TFS | IE | HVU | ST | RBS | total | % |
|---|---|---|---|---|---|---|---|
| UP_STRONG | 57 | 3 | 0 | 6 | 36 | 102 | 5.36% |
| UP_MODERATE | 80 | 23 | 1 | 85 | 204 | 393 | 20.64% |
| UP_WEAK | 31 | 0 | 7 | 29 | 259 | 326 | 17.12% |
| NEUTRAL | 7 | 0 | 28 | 51 | 230 | 316 | 16.60% |
| DOWN_WEAK | 3 | 0 | 41 | 27 | 160 | 231 | 12.13% |
| DOWN_MODERATE | 1 | 4 | 190 | 41 | 143 | 379 | 19.91% |
| DOWN_STRONG | 0 | 6 | 118 | 4 | 29 | 157 | 8.25% |
| **Total** | **179** | **36** | **385** | **243** | **1061** | **1904** | |
| **col %** | **9.40%** | **1.89%** | **20.22%** | **12.76%** | **55.72%** | | |

(TFS = TREND_FRIENDLY_STABLE, IE = IMPULSE_EXPANSION, HVU = HIGH_VOLATILITY_UNSTABLE, ST = STRUCTURAL_TRANSITION, RBS = RANGE_BOUND_STABLE)

### 2.2 VTS derived

- **Drift contamination in RBS:** 831 / 1,061 = **78.32%** of RANGE_BOUND_STABLE-labeled trades have non-NEUTRAL DBS. Only 230 / 1,061 (21.68%) of "range" trades actually had NEUTRAL directional bias at trade time.
- **Strong-DBS trades** (DOWN_STRONG + DOWN_MODERATE + UP_MODERATE + UP_STRONG): 1,031 total
  - In trend-permissive regimes (TFS + IE): **174 (16.88%)** — actually got routed to trend strategies
  - In RANGE_BOUND_STABLE: **412 (39.96%)** — locked out of trend strategies
  - In HIGH_VOLATILITY_UNSTABLE or STRUCTURAL_TRANSITION: 445 (43.16%) — got routed to volatility or transition strategies
- **Specific strategy-lockout cases of interest:**
  - 204 UP_MODERATE trades labeled RBS (bullish pairs that got range strategies)
  - 143 DOWN_MODERATE trades labeled RBS (bearish pairs that got range strategies)
  - 36 UP_STRONG trades labeled RBS (strongly bullish pairs labeled range)
  - 29 DOWN_STRONG trades labeled RBS (strongly bearish pairs labeled range)
  - **Total strong-DBS-in-RBS: 412 trades** — each one is a trend opportunity that was routed to a range strategy.

---

## 3. Full cross-tabulation — MCE cycle-sampled (full universe)

**Source:** `logs/phase15b_dbs_telemetry/2026-04-15.jsonl`. Total clean cycle samples: **13,954** (sentinelZero excluded, 0 of which existed).

### 3.1 Matrix

| DBS category | TFS | IE | HVU | ST | RBS | total | % |
|---|---|---|---|---|---|---|---|
| UP_STRONG | 15 | 0 | 0 | 173 | 0 | 188 | 1.35% |
| UP_MODERATE | 255 | 14 | 110 | 544 | 618 | 1541 | 11.04% |
| UP_WEAK | 135 | 3 | 233 | 622 | 2494 | 3487 | 24.99% |
| NEUTRAL | 29 | 0 | 737 | 604 | 2274 | 3644 | 26.11% |
| DOWN_WEAK | 0 | 0 | 794 | 743 | 1422 | 2959 | 21.21% |
| DOWN_MODERATE | 0 | 0 | 234 | 312 | 1333 | 1879 | 13.47% |
| DOWN_STRONG | 0 | 0 | 56 | 46 | 154 | 256 | 1.83% |
| **Total** | **434** | **17** | **2164** | **3044** | **8295** | **13954** | |
| **col %** | **3.11%** | **0.12%** | **15.51%** | **21.81%** | **59.45%** | | |

### 3.2 MCE derived

- **Drift contamination in RBS:** 6,021 / 8,295 = **72.59%** of RANGE_BOUND_STABLE-labeled pair-cycles have non-NEUTRAL DBS. Only 2,274 / 8,295 (27.41%) of "range" pair-cycles actually had NEUTRAL directional bias.
- **Strong-DBS pair-cycles** (the 4 strong categories combined): 3,864 total
  - In trend-permissive regimes: **284 (7.35%)**
  - In RANGE_BOUND_STABLE: **2,105 (54.48%)**
- **The all-zero cells tell a story:**
  - 0 DOWN_WEAK / DOWN_MODERATE / DOWN_STRONG cycles ever got TREND_FRIENDLY_STABLE or IMPULSE_EXPANSION labels. Every single bearish-DBS pair-cycle was routed to HVU, ST, or RBS.
  - 0 UP_STRONG cycles in RANGE_BOUND_STABLE. But 173 UP_STRONG cycles in STRUCTURAL_TRANSITION — these are strongly bullish pairs getting treated as regime-uncertain.
- **The classifier labels only 3.11% of cycles as TREND_FRIENDLY_STABLE and 0.12% as IMPULSE_EXPANSION — a combined 3.23%.** Meanwhile, the DBS distribution has 24.63% in MODERATE or STRONG categories. A DBS-informed classifier could realistically push the combined TFS+IE share toward **~24% instead of 3%**, which is an **~8× increase** in trend-strategy opportunity flow.

---

## 4. Selection bias check (VTS vs MCE category mass)

Per Langston's request: explicit side-by-side of the two data sources.

| Category | VTS % | MCE % | delta |
|---|---|---|---|
| UP_STRONG | 5.36% | 1.35% | +4.01% * |
| UP_MODERATE | 20.64% | 11.04% | +9.60% * |
| UP_WEAK | 17.12% | 24.99% | -7.87% * |
| NEUTRAL | 16.60% | 26.11% | -9.52% * |
| DOWN_WEAK | 12.13% | 21.21% | -9.07% * |
| DOWN_MODERATE | 19.91% | 13.47% | +6.44% * |
| DOWN_STRONG | 8.25% | 1.83% | +6.41% * |

(* = |delta| ≥ 3 percentage points)

**Every category has significant selection bias.** The VTS trade-sampled view systematically **over-represents strong-directional pairs** and **under-represents weak-directional and neutral pairs**. Specifically:

- Strong categories (UP_STRONG, UP_MODERATE, DOWN_MODERATE, DOWN_STRONG) are overweighted in VTS by +4 to +10 percentage points each.
- Weak/neutral categories (UP_WEAK, NEUTRAL, DOWN_WEAK) are underweighted by -8 to -10 points each.

**Interpretation:** Trades fire disproportionately on strong-directional pairs because signals require directional movement to cross confidence thresholds. This is the exact reason the scope split A.2 into Provisional (trade-sampled, non-gating) and Final (cycle-sampled, gating) — the trade-sampled view is systematically biased toward the direction tails.

**Impact on the headline findings:**
- The **drift contamination rate** should be trusted more at the MCE level (72.59%) than the VTS level (78.32%) because VTS over-represents strong categories, which inflates "non-NEUTRAL-in-RBS" counts.
- The **strategy lockout rate** should be trusted more at the MCE level (54.48%) than the VTS level (39.96%) because MCE captures the full pair universe.
- **Both directions of the bias confirm the qualitative finding:** the classifier is mislabeling large quantities of directional pairs as range-bound, whether measured at trade time or full-universe.

---

## 5. Category mass analysis (DBS alone)

Question: does the fixed-threshold category scheme produce a reasonable distribution?

| Category | MCE % (full universe) | Expected for symmetric distribution | Verdict |
|---|---|---|---|
| UP_STRONG | 1.35% | ~5% | thin |
| UP_MODERATE | 11.04% | ~13% | roughly correct |
| UP_WEAK | 24.99% | ~18% | slightly heavy |
| NEUTRAL | 26.11% | ~18% | heavy |
| DOWN_WEAK | 21.21% | ~18% | roughly correct |
| DOWN_MODERATE | 13.47% | ~13% | roughly correct |
| DOWN_STRONG | 1.83% | ~5% | thin |

**The distribution is roughly symmetric but bulges in the middle.** The UP_STRONG and DOWN_STRONG tails are sparse (combined 3.18%) while the NEUTRAL and adjacent WEAK categories are oversized (combined 72.31%).

**Provisional interpretation options:**
1. **The thresholds (0.60 / 0.30 / 0.10) are set too extreme at the tails** — very few pair-cycles ever cross 0.60, so the UP_STRONG / DOWN_STRONG bins are mostly empty.
2. **The DBS formula doesn't reach the tails** because of the internal component clamps (slopeComponent clamped at ±0.40, returnComponent at ±0.35, emaComponent at ±0.25). The max reachable composite is ±1.0 only if ALL THREE components saturate at the same extreme simultaneously, which is rare.

**Both are true.** The slope clamp at ±0.40 means slope alone can only contribute 40% of the range; return clamp at ±0.35 contributes 35%; ema clamp at ±0.25 contributes 25%. To reach UP_STRONG (≥ +0.60), at least two of the three must be near their ceiling simultaneously. In practice this happens 1.35% of the time — empirically consistent with the rare coincidence of all-three-maxed conditions.

**Recommendation (for B62, not B61):**
Consider replacing fixed thresholds with either:
- **Rolling percentile thresholds** (e.g. UP_STRONG = top 5%, UP_MODERATE = top 25%, UP_WEAK = top 50%, etc. of the live distribution). This would force balanced categories regardless of market state.
- **Looser thresholds matched to the empirical distribution** (e.g. UP_STRONG at +0.50 instead of +0.60), which would let ~5% of pair-cycles reach UP_STRONG organically.

Both of these should wait for A.2 Final to run on the mature cycle-sampled window — the current 12h sample is not enough to calibrate percentile bands confidently.

---

## 6. Classifier regime distribution (full-universe cycle-sampled)

For reference and B62 baseline:

| Regime | Count | % | vs canonical strategy map expectations |
|---|---|---|---|
| TREND_FRIENDLY_STABLE | 434 | 3.11% | Very thin — 5 strategies compete for 3% of cycles |
| IMPULSE_EXPANSION | 17 | 0.12% | **Effectively empty** — 4 strategies get essentially no opportunities |
| HIGH_VOLATILITY_UNSTABLE | 2,164 | 15.51% | Reasonable share |
| STRUCTURAL_TRANSITION | 3,044 | 21.81% | Substantial — 21% of cycles are "in transition," which may be a dumping ground for uncertain pairs |
| RANGE_BOUND_STABLE | 8,295 | **59.45%** | **Dominant** — 59% of cycles are labeled "range", but 72.59% of those have non-NEUTRAL DBS → ~43% of total cycles are drift-contaminated fake ranges |

---

## 7. Answer to Kyle's DBS-as-strategy-discovery question

Kyle on 2026-04-15: *"When we see very strong bullish trending pairs, is that in itself an opportunity for a strategy that we don't have in our bag of strategies? Is that something that if we looked at it earlier, perhaps in the filtering process, and we identify pairs that are trading on such a strong bullish trend that there's a strategy out there that can pick up on this..."*

**Concrete answer from the data:**

- **~3,864 strong-DBS pair-cycles** observed in 12 hours across 58 pairs (27.7% of cycles)
- **2,105 of those (54.5%) are locked out** of the current trend-permissive regimes by the classifier routing them to RANGE_BOUND_STABLE
- **Another 1,475 (38.2%) are locked out** by being routed to HIGH_VOLATILITY_UNSTABLE or STRUCTURAL_TRANSITION (where some strategies exist but the trend-specific ones don't)
- **Only 284 (7.35%) actually reach trend-permissive regimes** where `momentum_burst`, `breakout_pull`, `continuation_push`, `adx_ignition`, `vwap_pullback` could consider them

**So yes** — there is a large, measurable pool of strongly directional pairs that the current pipeline is **actively routing away from** trend strategies. Kyle's Path D proposal (DBS-triggered separate filter stack + dedicated trend-rider strategy) has a concrete target: ~55% of strong-DBS pair-cycles would become newly available opportunities, and Kyle's Paths A (fix classifier), C (regime override), and D (new strategy branch) are all ways to reach that pool.

**Whether a dedicated new strategy family is needed** vs. **fixing the classifier so existing trend strategies wake up** is a B62 architectural call, but the data strongly suggests B62 should aim to reduce the strategy-lockout rate from 54% to near zero — either by reclassifying or by routing around the classifier for strong-DBS pairs.

---

## 8. A.2 Provisional verdict

**DBS thresholds/categories: DEFENSIBLE WITH KNOWN IMBALANCES.** The fixed thresholds produce a usable but bulge-in-the-middle distribution. Tails are thin because of component-clamp composition; middle is heavy because most pair-cycles have modest directional bias. Not broken, but not optimal either.

**Classifier mislabeling: CONFIRMED AND LARGER THAN B59 THOUGHT.**
- B59: 47% drift contamination → A.2: 72.59% (MCE) / 78.32% (VTS)
- The case for B62 classifier redesign is strengthened, not weakened, by the audit data.

**Trade-sampled vs cycle-sampled selection bias: CONFIRMED AND QUANTIFIED.** All seven categories show ≥ 3pp divergence, with strong categories over-represented in VTS by 4–10pp and weak/neutral categories under-represented by 7–10pp. This validates the scope §3 decision to make Finals cycle-sampled.

**Does A.2 Provisional change B61's direction?** **No.** The findings make the case for B62 classifier work stronger, not different. No halt, no scope expansion.

**Does A.2 Provisional substitute for A.2 Final?** **No.** Finals still need:
- Mature cycle-sampled window (72h+)
- Non-overlapping forward-return behavioral validation per scope §4 A.2 Final item 4 (gates the category-meaning claim)
- Rolling-percentile threshold simulation per §4 item 3
- Neutral-zone reproduction of the B59 snapshot per §4 item 5

---

## 9. Carry-forward items for B62 / B63

1. **Classifier redesign must reduce RANGE_BOUND_STABLE drift contamination from 72% to < 30%.**
2. **Classifier redesign must push IMPULSE_EXPANSION share from 0.12% toward ~3%** (matching the UP_STRONG + DOWN_STRONG share of DBS).
3. **Classifier redesign must push TREND_FRIENDLY_STABLE share from 3.11% toward ~22%** (matching UP_MODERATE + DOWN_MODERATE).
4. **B62 should explicitly evaluate Kyle's Path D** (dedicated trend-rider strategy family) against the simpler Paths A/C (fix classifier / regime override). The 54% strategy-lockout rate is the concrete gap Path D would be designed to close.
5. **Fixed thresholds may be replaced with rolling percentiles in B62** — A.2 Final will generate the specific percentile recommendations from mature cycle-sampled data.
6. **STRUCTURAL_TRANSITION at 21.81%** is high and deserves a second look. Is it a legitimate regime with a reason 22% of pair-cycles are "transitioning", or is it a dumping ground for pairs the classifier can't confidently categorize?

---

*End of BATCH_61_A2_THRESHOLD_REVIEW_PROVISIONAL.md — exploratory / non-gating.*
