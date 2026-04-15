# BATCH 61 — A.4 Provisional — Data Quality

**Phase:** 15b (Regime / DBS / Strategy / Filter Restructure)
**Sub-Phase:** A — DBS Validation
**Stage:** A.4 Provisional (scope §4 A.4, pre-audit §7 step 14)
**Date:** 2026-04-15
**Author:** Claude Code
**Status:** DRAFT — exploratory / non-gating

---

## 0. Status labels

- **NON-GATING.** Does not bless any B62 decision.
- **DATA-SOURCE REROUTE.** Scope §4 A.4 Provisional was written for VTS trade metadata (20 closed trades stratified by outcome). Verified 2026-04-15: VTS trade records carry only the DBS category string, no numeric score or component breakdown, so the spot check can't run on that source. Rerouted to cycle-sampled MCE telemetry (which has the components and the real `sentinelZero` flag). Stratification changed from "by outcome" to "by ATR bucket × category spread" per Langston's request for category diversity and the available dimensions of the new data source. GREEN'd on Thread 21.

---

## 1. Silent-zero count

**Data source:** `logs/phase15b_dbs_telemetry/2026-04-15.jsonl` on staging (Hetzner 188.245.193.8)
**Window:** 11.5 hours of forward cycle-sampled MCE telemetry
**Samples inspected:** 13,896

| Metric | Value |
|---|---|
| `sentinelZero = true` samples | **0** |
| `sentinelZero = false` samples | 13,896 |
| Silent-zero rate | **0.00%** |

**Verdict: PASS.** The early-return guard in `directional-bias.ts` (triggered when `ohlcLen < lookbackPeriod` OR `atr ≤ 0`) has NOT fired on any pair during the observation window. Every pair in the active FX5 universe has sufficient OHLC history and non-zero ATR.

**Note on reroute quality.** The original scope called for the silent-zero count to be derived indirectly from VTS trade metadata. That would have been a proxy — VTS writes the category string (`'NEUTRAL'`), and NEUTRAL includes both "real NEUTRAL from a valid score in [-0.10, +0.10]" and "SENTINEL_ZERO masquerading as NEUTRAL after the early-return." Those two cases are indistinguishable from VTS metadata alone. The MCE telemetry reroute gives us the **real** `sentinelZero` boolean flag derived at emit-time from `DEFAULT_DBS_CONFIG` live values (not hardcoded 30/21/48/26). This is a strictly better measurement.

---

## 2. 20-pair component sanity spot check

**Stratification:**
- Bucketed 58 pairs by per-pair median ATR (LOW = bottom 20%, MID = middle 60%, HIGH = top 20%)
- Selected 6 LOW + 8 MID + 6 HIGH = 20 total
- Within each bucket, picked pairs round-robin across DBS categories to avoid monoculture (per Langston's 2026-04-15 request)
- Used the most-recent clean sample per selected pair

### 2.1 Spot check data

| Bucket | Symbol | Category | Score | slope | return | ema | Checks |
|---|---|---|---|---|---|---|---|
| LOW | USDG/USD | NEUTRAL | -0.0038 | -0.0015 | +0.0000 | -0.0024 | ✅ cat-ok, sum-ok, bounds-ok, signs-partial |
| LOW | XDC/USD | DOWN_WEAK | -0.1839 | -0.0170 | -0.0630 | -0.1038 | ✅ cat-ok, sum-ok, bounds-ok, signs-all-agree |
| LOW | NIGHT/USD | DOWN_MODERATE | -0.3899 | -0.0622 | -0.2398 | -0.0880 | ✅ cat-ok, sum-ok, bounds-ok, signs-all-agree |
| LOW | TRX/EUR | UP_WEAK | +0.1712 | +0.0239 | +0.0443 | +0.1031 | ✅ cat-ok, sum-ok, bounds-ok, signs-all-agree |
| LOW | USDG/USDC | NEUTRAL | -0.0779 | -0.0059 | -0.0007 | -0.0714 | ✅ cat-ok, sum-ok, bounds-ok, signs-all-agree |
| LOW | TRX/USD | UP_WEAK | +0.2198 | +0.0374 | +0.0680 | +0.1145 | ✅ cat-ok, sum-ok, bounds-ok, signs-all-agree |
| MID | USD/CHF | DOWN_WEAK | -0.1112 | -0.0455 | -0.0305 | -0.0352 | ✅ cat-ok, sum-ok, bounds-ok, signs-all-agree |
| MID | EUR/USD | NEUTRAL | +0.0933 | +0.0485 | +0.0217 | +0.0230 | ✅ cat-ok, sum-ok, bounds-ok, signs-all-agree |
| MID | AUD/USD | UP_WEAK | +0.2180 | +0.0525 | +0.0377 | +0.1278 | ✅ cat-ok, sum-ok, bounds-ok, signs-all-agree |
| MID | ALGO/USD | UP_MODERATE | +0.4253 | +0.0347 | +0.2258 | +0.1648 | ✅ cat-ok, sum-ok, bounds-ok, signs-all-agree |
| MID | ZRO/USD | DOWN_MODERATE | -0.3634 | -0.0476 | -0.0869 | -0.2290 | ✅ cat-ok, sum-ok, bounds-ok, signs-all-agree |
| MID | DASH/USD | DOWN_STRONG | -0.6229 | -0.0972 | -0.2758 | -0.2500 | ✅ cat-ok, sum-ok, bounds-ok, signs-all-agree |
| MID | ADA/EUR | DOWN_WEAK | -0.1394 | -0.0234 | -0.0311 | -0.0849 | ✅ cat-ok, sum-ok, bounds-ok, signs-all-agree |
| MID | ONDO/USD | NEUTRAL | -0.0388 | -0.0042 | -0.0008 | -0.0337 | ✅ cat-ok, sum-ok, bounds-ok, signs-all-agree |
| HIGH | RIVER/USD | DOWN_MODERATE | -0.3281 | +0.0126 | -0.1861 | -0.1546 | ✅ cat-ok, sum-ok, bounds-ok, **signs-partial** |
| HIGH | RAVE/USD | UP_MODERATE | +0.3590 | +0.0298 | **+0.3500** | -0.0208 | ✅ cat-ok, sum-ok, bounds-ok, **signs-partial** |
| HIGH | XMR/USD | DOWN_WEAK | -0.2850 | -0.0195 | -0.0656 | -0.1999 | ✅ cat-ok, sum-ok, bounds-ok, signs-all-agree |
| HIGH | BNB/USD | UP_WEAK | +0.2269 | +0.0331 | +0.1092 | +0.0846 | ✅ cat-ok, sum-ok, bounds-ok, signs-all-agree |
| HIGH | TAO/EUR | DOWN_MODERATE | -0.3149 | -0.0500 | -0.2240 | -0.0410 | ✅ cat-ok, sum-ok, bounds-ok, signs-all-agree |
| HIGH | XMR/USDT | DOWN_WEAK | -0.2645 | -0.0184 | -0.0588 | -0.1873 | ✅ cat-ok, sum-ok, bounds-ok, signs-all-agree |

### 2.2 Aggregate

| Check | Pass count |
|---|---|
| Category-threshold consistency (stored category matches stored score's threshold) | **20 / 20** |
| Sum-reconstruction consistency (score = slope + return + ema, exact) | **20 / 20** |
| Numeric bounds ([-1, +1]) | **20 / 20** |
| Sign unanimity (all three components same direction) | 17 / 20 |
| Sign partial (2 of 3 agree) | 3 / 20 |
| Sign mixed (all three differ) | 0 / 20 |

### 2.3 Interpretation of the 3 "signs-partial" cases

- **USDG/USD (NEUTRAL, -0.0038)** — stablecoin pair sitting essentially at zero. `return = +0.0000` and other components slightly negative. This is noise at the precision level and does not indicate a formula issue.
- **RIVER/USD (DOWN_MODERATE, -0.3281)** — `slope = +0.0126` (slightly positive), `return = -0.186` (down), `ema = -0.155` (down). The linear regression over the lookback window is mildly positive while net return and EMA are both down — classic **reversal in progress**. The window started higher and has been declining, but the overall regression line still tilts up because of the early part of the window. This is an expected feature, not a bug.
- **RAVE/USD (UP_MODERATE, +0.3590)** — `slope = +0.030` (mildly up), `return = +0.350` **clamped at the ceiling** (raw return was ≥ +10% over the window), `ema = -0.021` (slightly negative). This is a pair that rallied hard during most of the lookback window but is now weakening — the return component is saturated at max positive while the EMA has flipped slightly negative reflecting recent weakness. **This case is the A.1 return-component saturation concern materializing in a specific spot check.** The formula correctly categorizes it as UP_MODERATE because the saturated return dominates, but the saturation is hiding information about the weakening EMA.

None of the three partial cases suggests a formula bug. They are, in order: a noise-level stablecoin, a legitimate reversal, and a saturation-hiding-deceleration case that we already flagged in A.1 Provisional §6.2 as a known concern.

---

## 3. A.4 Provisional verdict

**PASS** — no data quality issues surfaced that block A.2 or A.1 Final. Specifically:

- **Silent-zero rate is 0%** — the early-return guard is not affecting the data
- **Category-threshold consistency is 100%** — no sample has a miscategorized score
- **Sum-reconstruction is exact** — the score stored in telemetry is exactly `slope + return + ema` (rules out caching, threading, or format-conversion defects)
- **Bounds compliance is 100%** — no score exceeds [-1, +1]
- **Sign coherence is high (85% all-agree, 15% partial, 0% mixed)** — the components behave coherently as directional indicators
- **The one saturation case in the spot check (RAVE/USD)** is a concrete example of the A.1 Provisional §6.2 finding: emaComponent and returnComponent clamps can mask information at the extremes. Already flagged, already tracked for A.1 Final + B62 consideration.

**Does A.4 Provisional clear the gate to A.4 Final?** Yes — nothing here requires redesign before Finals. The Final pass adds:
- Flicker / 1-cycle category flip rate vs A.0 baseline (needs mature window)
- Latency simulation with ±2×ATR shock injection (needs forward OHLC replay)
- Mechanical forward-return component agreement (needs forward prices per pair)

---

## 4. Next

- **A.2 Provisional** next — DBS × classifier-regime cross-tabulation on VTS window + full-universe category mass from MCE telemetry. This answers whether the classifier is systematically mislabeling strong-DBS pairs.
- **A.3** — to be taken over by CC (was Langston's; no deliverable on disk)
- **A.0 Baseline** — cycle-sampled data is past the 6-hour minimum
- **A.4 Final** — gated on §3 maturity

---

*End of BATCH_61_A4_DATA_QUALITY_PROVISIONAL.md — exploratory / non-gating.*
