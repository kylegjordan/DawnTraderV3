# BATCH 61 — A.1 Provisional — DBS Formula Review

**Phase:** 15b (Regime / DBS / Strategy / Filter Restructure)
**Sub-Phase:** A — DBS Validation
**Stage:** A.1 Provisional (scope §4 A.1, pre-audit §7 steps 11–13)
**Date:** 2026-04-15
**Author:** Claude Code
**Status:** DRAFT — exploratory / non-gating

---

## 0. Status labels (read these first)

- **NON-GATING** — this document cannot bless any B62 decision. Its sole role is to surface early patterns before the cycle-sampled collection window matures for A.1 Final.
- **STATISTICALLY UNDERPOWERED** — runs on the first ~12 hours of forward cycle-sampled MCE telemetry. Formal statistical tests are deferred to A.1 Final.
- **DATA-SOURCE REROUTE FROM SCOPE §4** — scope §4 A.1 Provisional was written assuming VTS trade logs carried DBS component fields (slopeComponent / returnComponent / emaComponent). Verified 2026-04-15: VTS trade records carry only the category string (`'UP_MODERATE'`, etc.) — no numeric score, no component breakdown. This made the scope version of A.1 Provisional unexecutable. Rerouted to the B61 cycle-sampled MCE telemetry, which is strictly better for formula validation anyway (not selection-biased, carries components and sentinelZero flag, captures the full pair universe). Reroute GREEN'd by Langston on Thread 21 without scope edit.

---

## 1. Data source

- **File:** `logs/phase15b_dbs_telemetry/2026-04-15.jsonl` on Hetzner staging (188.245.193.8)
- **Window:** 2026-04-15 00:45:10 UTC → 2026-04-15 12:18 UTC (~11.5 hours of forward cycle-sampled MCE output)
- **Raw samples:** 13,796 (13,592 at first snapshot, growing continuously)
- **sentinelZero count:** **0 of 13,796** — no early-return triggering, every pair has sufficient OHLC and non-zero ATR throughout the window
- **Clean samples (sentinelZero = false):** 13,796
- **Unique symbols:** 58 (the active FX5 universe during this window; note: not 88 — scope §2 uses an older count)
- **Per-pair sample distribution:** min 46, p25 129, median 133, p75 379, max 488 (a 10× spread — MCE is called more often on some pairs than others. Not a defect but noted.)

Schema followed pre-audit §6.3 exactly. `classifier.confidence` is NOT present in the output (explicit pre-audit requirement).

---

## 2. Formula reconstruction check

**Claim:** `score = slopeComponent + returnComponent + emaComponent`, clamped to [-1, +1].

**Test:** for every clean sample, compute `sum = slopeComponent + returnComponent + emaComponent` and check `|stored_score - sum|`.

**Result:** **max delta = 0.00e+00 across 13,796 samples.** Zero mismatch.

**Verdict: PASS.** The formula composition is exactly what the documentation claims. Rules out a whole class of potential defects (wrong field reference, sign errors, miscopied weights, stale cache). The score stored in telemetry IS the weighted sum.

---

## 3. Component independence (correlation matrix)

**Claim:** The three components (slope, return, EMA alignment) measure different flavors of directional bias. If they are highly correlated, the weights are lying about diversification — the composite is effectively 2-dimensional or lower.

**Pass criterion (scope §4 A.1 item 1):** if any two components are ≥ 0.90 correlated, the composite is effectively 2D and the A.1 recommendation flags the weights as overstating diversification.

### 3.1 Pooled correlation (all pairs, all cycles)

| | slopeComponent | returnComponent | emaComponent |
|---|---|---|---|
| slopeComponent | 1.000 | +0.6848 | **+0.7493** |
| returnComponent | | 1.000 | +0.5439 |
| emaComponent | | | 1.000 |

**Pooled verdict:** no collinearity under the ≥ 0.90 threshold. Formula retains 3D structure at the aggregate level. **But slope×ema at 0.7493 is high enough that the composite is effectively ~2.5-dimensional.** The slope and EMA components are measuring *very* similar aspects of trend structure (steepness of linear fit vs fast-slow EMA gap) and contribute largely overlapping information.

### 3.2 Per-pair correlation distribution

For each pair with ≥ 20 samples (58 pairs qualify):

| Pair component pair | n | mean r | min r | median r | max r | Count with |r| ≥ 0.90 |
|---|---|---|---|---|---|---|
| slope × return | 58 | +0.135 | -0.947 | +0.141 | +0.959 | **6** |
| slope × ema | 57 | +0.246 | -0.867 | +0.398 | +0.989 | **9** |
| return × ema | 57 | +0.375 | -0.950 | +0.456 | +0.946 | **5** |

**Per-pair heterogeneity is striking.** ~10% of pairs show two components collinear (|r| ≥ 0.90) at the per-pair level — for those pairs, the formula is effectively 2D. Another notable subset shows **anti-correlated components** (negative r): when slope is up, return is down (the pair reversed mid-window). For those pairs the slope and return components literally cancel in the sum, producing a near-zero DBS even when directional movement is clearly present.

**Per-pair verdict:** ~10% of the universe is reducing the formula to 2D locally; a separate subset is experiencing cancellation artifacts from anti-correlated components during reversals.

### 3.3 Component-independence overall verdict

**DEFENSIBLE BUT NOT OPTIMAL.** The formula meets the "no collinearity" pass criterion at the pooled level but has two nuances worth surfacing:

1. **slope × ema 0.7493 pooled** — the formula over-counts trend structure. Slope and EMA are measuring highly overlapping aspects of directional bias. A cleaner formula could either replace one of them, or use an orthogonalized transform before combining.
2. **Anti-correlation cancellation** — pairs experiencing mid-window reversals produce near-zero DBS that doesn't reflect directional *intensity*. This is arguably a feature (DBS should be low when the market is reversing) but it's worth being explicit about.

These are flagged as B62 improvement candidates, NOT as reasons to halt A.2.

---

## 4. Weight sensitivity

**Method:** recompute DBS score under alternate weight sets (unscale stored components by original weights, reweight, re-sum, re-clamp, re-categorize). Roundtrip reconstruction check passed with max delta 0.00e+00.

### 4.1 Category mass under alternates

| Category | Current (0.40/0.35/0.25) | Slope-heavy (0.50/0.30/0.20) | Equal (0.33/0.33/0.34) | Slope-EMA (0.40/0.20/0.40) |
|---|---|---|---|---|
| UP_STRONG | 1.37% | **0.00%** | 1.98% | 1.29% |
| UP_MODERATE | 11.10% | 10.13% | 10.64% | 9.64% |
| UP_WEAK | 24.96% | 26.75% | 21.19% | 14.74% |
| NEUTRAL | 26.14% | 29.49% | 25.25% | 29.70% |
| DOWN_WEAK | 21.12% | 21.19% | 20.94% | 21.80% |
| DOWN_MODERATE | 13.51% | 12.44% | 15.92% | 19.49% |
| DOWN_STRONG | 1.81% | **0.00%** | 4.08% | 3.34% |

### 4.2 Category change rate vs current

| Alternate | Observations changing category |
|---|---|
| Slope-heavy | 1,667 / 13,757 = **12.12%** |
| Equal | 2,518 / 13,757 = **18.30%** |
| Slope-EMA rebalance | 5,030 / 13,757 = **36.56%** |

### 4.3 Mean absolute score delta vs current

| Alternate | mean\|Δ\| | max\|Δ\| |
|---|---|---|
| Slope-heavy | 0.0267 | 0.0872 |
| Equal | 0.0377 | 0.0978 |
| Slope-EMA rebalance | **0.0739** | **0.2038** |

### 4.4 Weight sensitivity verdict

**PLATEAU around current weights, CLIFF only when return component is demoted.** The formula is robust to nearby weight choices (mean|Δ| ≤ 0.04, category changes ≤ 18% for slope-heavy and equal), which means the specific choice of 0.40/0.35/0.25 is not critical. However the slope-EMA rebalance — which halves the return component weight and redistributes to slope+EMA — produces 36.6% category changes and max|Δ| = 0.20. **That is informative:** it proves the return component is carrying non-redundant signal that the formula's current weighting actively relies on. If return were noise or pure redundancy, demoting it would have no effect.

### 4.5 Unexpected finding — slope-heavy collapses extremes

**The slope-heavy weighting (0.50/0.30/0.20) produces ZERO UP_STRONG and ZERO DOWN_STRONG.**

**Why:** the `slopeComponent` is internally clamped to ±0.40 before the weighting multiplies it. Under the current 0.40 slope weight, slope's max contribution to the composite is ±0.40 × 1.0 = ±0.40. Under a 0.50 weight it becomes ±0.40 × (0.50/0.40) = ±0.50 — still below the ±0.60 UP_STRONG / DOWN_STRONG threshold. Under a 0.50 weight with return and EMA *demoted*, the composite's max reachable magnitude drops because the slope component alone cannot cross ±0.60 and the other two contribute less. **Upweighting slope actively destroys extreme readings.**

This is a **non-obvious formula property worth naming**: slopeComponent's internal clamp interacts with category thresholds such that slope-heavy weighting defeats its own goal. Flagged for B62 classifier design.

---

## 5. ATR-bucket distributions

**Claim:** DBS is ATR-normalized so pairs of different volatility regimes can be compared on the same [-1, +1] scale. Test: bucket by per-pair median ATR (bottom 20%, middle 60%, top 20%), compare score distributions.

**Pass criterion (scope §4 A.1 item 3a):** if low-ATR has a radically wider DBS spread than mid/high, normalization is under-compensating; the mirror case is over-compensating; either is a failure. A.1 Provisional uses IQR ratio (LOW_IQR / HIGH_IQR) within [0.5, 2.0] as the pass band.

### 5.1 Bucket composition

- **LOW_ATR (11 pairs, median ATR ≤ 0.000767):** EUR/CHF, EUR/GBP, HBAR/USD, KAS/USD, MON/USD, NIGHT/USD, TRX/EUR, TRX/USD, USDG/USD, USDG/USDC, XDC/USD — stablecoin pairs, fiat FX, low-volatility altcoins
- **MID_ATR (35 pairs):** majority of the universe
- **HIGH_ATR (12 pairs, median ATR > 0.424286):** BNB/USD, PAXG/EUR, PAXG/USD, RAVE/USD, RIVER/USD, TAO/EUR, TAO/USD, XAUT/USD, XAUT/USDT, XMR/USD, XMR/USDT, ZEC/USD — gold proxies, privacy coins, large-cap crypto

### 5.2 Score distribution per bucket

| Bucket | n | mean | median | IQR | p05..p95 range |
|---|---|---|---|---|---|
| LOW_ATR | 2,214 | -0.1407 | -0.1254 | 0.3315 | [-0.5537, +0.3022] |
| MID_ATR | 9,199 | +0.0034 | +0.0430 | 0.2793 | [-0.4152, +0.3463] |
| HIGH_ATR | 2,383 | +0.0588 | -0.0698 | **0.6715** | [-0.4265, **+0.6542**] |

### 5.3 Category mass per bucket

| Category | LOW_ATR | MID_ATR | HIGH_ATR |
|---|---|---|---|
| UP_STRONG | 0.00% | 0.16% | **7.26%** |
| UP_MODERATE | 5.28% | 7.72% | **29.46%** |
| UP_WEAK | 12.69% | 31.31% | 11.88% |
| NEUTRAL | 26.24% | 32.42% | **1.85%** |
| DOWN_WEAK | 28.77% | 16.20% | 33.11% |
| DOWN_MODERATE | 24.71% | 10.06% | 16.37% |
| DOWN_STRONG | 2.30% | 2.14% | 0.08% |

### 5.4 Component magnitudes per bucket (mean absolute value)

| Bucket | \|slope\| | \|return\| | \|ema\| |
|---|---|---|---|
| LOW_ATR | 0.0304 | 0.1004 | 0.1241 |
| MID_ATR | 0.0296 | 0.1119 | 0.0991 |
| HIGH_ATR | 0.0392 | **0.1538** | **0.1495** |

### 5.5 ATR normalization verdict

**BORDERLINE FAIL.**

- **IQR ratio LOW_IQR / HIGH_IQR = 0.3315 / 0.6715 = 0.494** — this is **just below** the 0.5 pass threshold. Technically fails the "within [0.5, 2.0]" band.
- HIGH_ATR NEUTRAL at **1.85%** vs LOW_ATR NEUTRAL at 26.24% — high-volatility pairs almost never register as neutral.
- HIGH_ATR UP_STRONG at **7.26%** vs LOW_ATR UP_STRONG at 0.00% — high-volatility pairs reach extreme categories *much* more easily.
- Component magnitudes confirm: |return| is 53% larger in high-ATR (0.154 vs 0.100), |ema| is 51% larger (0.150 vs 0.099). The ATR normalization is NOT fully canceling the volatility advantage.

**Important nuance** — the LOW_ATR bucket is mostly stablecoin pairs and fiat FX, which *should* naturally skew neutral because stablecoins are pegged. The HIGH_ATR bucket is gold proxies and volatile crypto, which *are* actually moving strongly right now. The asymmetry has two possible causes:

1. **ATR normalization is under-compensating** (high-vol pairs get inflated DBS)
2. **Market reality** (high-vol crypto genuinely has more directional conviction right now)

To tell these apart definitively requires the **responsiveness injection** test (scope §4 A.1 item 3b): pick 5 pairs from each bucket, replay with a synthetic +1×ATR candle injection, measure the DBS delta, compare across buckets. A correctly normalized formula produces approximately equal deltas per bucket. I cannot run responsiveness injection on cycle-sampled telemetry alone — it requires forward OHLC replay. **Deferred to A.1 Final** where the injection test is mandatory.

**Provisional disposition:** **flag as borderline failure, escalate to A.1 Final responsiveness injection for the definitive call.** Carry forward as a known imbalance that should inform B62 classifier design. Possible mitigations to consider in B62:
- DBS thresholds could vary by pair volatility class
- The classifier input could be an ATR-adjusted DBS rather than the raw score
- The emaComponent's normalization (`/ATR`) could be reviewed — it is saturating 10.4% of the time (more than other components)

---

## 6. Edge cases

### 6.1 Silent-zero (sentinelZero flag)

**Result:** 0 / 13,796 (0.00%). Every sampled observation has sufficient OHLC history and non-zero ATR. The early-return guard in `directional-bias.ts` never triggered during the observation window.

### 6.2 Clamp saturation

Each component is clamped at the individual level before weighting:

| Component | Clamp range | At floor | At ceiling | Total saturated |
|---|---|---|---|---|
| slope | [-0.40, +0.40] | 0 (0.0%) | 0 (0.0%) | **0.0%** |
| return | [-0.35, +0.35] | 166 (1.2%) | 542 (3.9%) | **5.1%** |
| ema | [-0.25, +0.25] | 901 (6.6%) | 528 (3.8%) | **10.4%** |

**Interpretation:**
- **slopeComponent never saturates** during the window. Its clamp is generously sized relative to the actual range of ATR-normalized linear regression slopes. Good — the clamp is not binding and no information is lost.
- **returnComponent saturates 5.1% of the time.** The raw `(close[N]-close[0])/close[0] * 10` value exceeds ±1.0 about 5% of the time, which is the saturation rate. Moderate, acceptable.
- **emaComponent saturates 10.4% of the time.** The fast-slow EMA gap exceeds ±1×ATR about 10% of the time. This is the highest saturation rate of the three and means the emaComponent is losing information at the extremes of strong trends. **Worth a review in B62** — either relax the clamp or normalize by a larger denominator.

### 6.3 Thin-volume, gaps, recent listings

The MCE telemetry schema captures `ohlc.len` but **does not carry 24h volume**, so I cannot directly check thin-volume edge cases from this data source. This is a gap in my instrumentation design that I'll note as a finding.

The fact that sentinelZero is 0 across 13,796 samples indirectly suggests no pair in the current universe has insufficient OHLC history (which was the recent-listings and gap edge case). But it's not a positive confirmation — A.4 Provisional should cross-reference.

**Finding logged:** next cycle of instrumentation (B62 or Phase 16) should capture `volume24h` in the telemetry schema so thin-volume edge cases can be measured in-stream.

---

## 7. Overall A.1 Provisional verdict

**RECOMMENDATION: KEEP with B62-flagged improvements.** The formula is defensible, reconstructs exactly, and meets the formal pass criteria on component independence and weight sensitivity. It has three real but non-fatal issues that should inform B62 design but do NOT block A.2 or require a formula redesign before proceeding:

| Finding | Severity | Disposition |
|---|---|---|
| Formula reconstruction exact | PASS | No action |
| Pooled slope×ema correlation 0.7493 (near-redundant) | CONCERN | B62 candidate — consider replacing one of slope/ema or orthogonalizing |
| Per-pair component collinearity in ~10% of pairs | CONCERN | B62 candidate — flag affected pairs; possibly exclude from DBS-based classification |
| Anti-correlation cancellation artifacts | NOTED | Feature-vs-bug call deferred to B62 |
| Slope-heavy weighting collapses extreme categories | NOTED | Formula property worth documenting |
| Return component is load-bearing (demotion cliff) | CONFIRMED | Do not reduce return weight in B62 without re-audit |
| ATR normalization IQR ratio 0.494 (borderline fail) | **FLAG** | **Must run responsiveness injection in A.1 Final for definitive verdict** |
| emaComponent saturation 10.4% | CONCERN | B62 candidate — review clamp width or normalization denominator |
| slopeComponent never saturates | PASS | No action |
| sentinelZero rate 0% | PASS | No action |
| Thin-volume edge cases not directly measurable from schema | GAP | Add `volume24h` to MCE telemetry schema in B62 or Phase 16 |

**Does A.1 Provisional clear the gate to A.2 Provisional?** **YES.** The formula is coherent enough to trust for category-threshold analysis. No need to halt and fix anything before A.2.

**Does A.1 Provisional substitute for A.1 Final?** **NO.** Two critical checks cannot run on cycle-sampled data alone:
1. **Responsiveness injection** (replay with +1×ATR and -1×ATR synthetic candles per ATR bucket, measure DBS delta) — definitive ATR normalization test
2. **Maturity-tested cycle-sampled coverage** — current window is 11.5 hours, well below the 72–96h maturity bar from scope §3. Per-pair sample counts are inflated by MCE call frequency rather than temporal diversity.

Both checks run at A.1 Final, after the §3 maturity gate passes with Langston's written confirmation.

---

## 8. Next steps

1. **A.4 Provisional** — silent-zero count (already known: 0) + component sanity spot check on 20 pairs stratified by ATR bucket. Can run immediately on existing cycle-sampled data.
2. **A.2 Provisional** — DBS category × classifier regime cross-tabulation on the 15-day VTS window + full-universe category mass from MCE telemetry. Uses VTS data for the category-level part (VTS has category strings, which is all A.2 Provisional needs).
3. **A.3** — Global DBS methodology. Taken over from Langston. Can run independently.
4. **A.0 Baseline** — legacy classifier flicker rate. Runs on the cycle-sampled MCE data already collected (>6h available).
5. **A.1 Final** — after the §3 maturity gate passes. Includes responsiveness injection and full cycle-sampled coverage.

---

*End of BATCH_61_A1_FORMULA_REVIEW_PROVISIONAL.md — exploratory / non-gating.*
