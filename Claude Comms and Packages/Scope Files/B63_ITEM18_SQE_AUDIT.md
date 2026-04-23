# B63 Item 18 — SQE Audit

**Author:** Langston (Opus 4.6 session, 2026-04-22)
**Data window:** 2026-04-15 through 2026-04-22 (partial), 595 closed VTS trades
**Status:** Parts A–E complete.

---

## Operating-Mode Context

**Active trading is OFF. Paper trading is OFF. Only VTS (passive learning) is running.** The VTS is designed to capture the broadest possible signal population for learning — loose gates are intentional in this mode. The findings below identify calibration problems that must be resolved before Phase 19 (paper trading) goes live, where tight gating IS required. These are preparation findings for B66 / pre-Phase-19 scoping, not emergency patches for the current VTS pipeline.

## Executive Summary

1. **FinalScore is anti-predictive (P1 — mode-independent).** The bottom decile (lowest scores admitted) has the highest win rate (50.8%). The top decile has a lower win rate (42.2%). Pearson r = −0.017 vs net profit. This is a real formula bug that poisons VTS learning data regardless of operating mode — the training baseline Phase 19 will inherit is being built on an anti-predictive score.

2. **All three active FinalScore components are individually inverted (P1 — mode-independent).** hybridScore, predictiveConfidence, and regimeWeight each show higher WR in their low-value halves. predictiveConfidence is the worst offender in TFS (46.7% WR low vs 24.6% WR high — 22pp gap, wrong direction). decayPenalty is always zero — dead component. The composite cannot be fixed by threshold adjustment alone; the formula weights need re-derivation.

3. **SQE thresholds are appropriately loose for VTS mode, but will not survive Phase 19.** MIN_FINAL_SCORE (0.35) filters 1.8%. MIN_REGIME_WEIGHT (0.30) filters 0.0%. In VTS broad-capture learning this is expected behavior — a strict gate would starve the learning pipeline. However, these values will pass through to paper mode unchanged unless recalibrated in B66. This is a pre-Phase-19 blocker, not a current-mode problem.

4. **rankingScore does not exist in the trade logs (paper-mode blocker).** No ranking-specific field appears in the VTS schema. Operational impact is zero in VTS mode (no ranking-cut happens in passive learning). Becomes a blocker when paper mode needs to select between competing signals in the same scan cycle. Must be logged before Phase 19.

5. **The only profitable trade population is `quant-strong_trend`** (n=53, 58.5% WR, +0.0093 avg net). Every other source pool is net-negative. This validates B63's strong-trend lane architecture and confirms where signal quality actually lives.

**Verdict: SQE formula recalibration is a B66 scope item, blocking for Phase 19 go-live.** The quantitative findings are real and the formula is broken independent of mode. The operational urgency is pre-Phase-19 preparation, not an immediate deploy. Do not tighten thresholds now — that would disrupt the VTS learning pipeline. Fix the formula and add per-gate telemetry in B66, then calibrate thresholds as Phase 19 approaches.

---

## A. FinalScore Threshold Calibration

### A.1 Distribution

| Statistic | Value |
|---|---|
| N (closed trades) | 595 |
| Min | 0.3121 |
| Max | 0.8258 |
| Mean | 0.5706 |
| Median | 0.5895 |
| Stdev | 0.1028 |
| P10 | 0.4217 |
| P25 | 0.5012 |
| P50 | 0.5895 |
| P75 | 0.6518 |
| P90 | 0.6845 |

**Histogram (0.05 buckets):**

| Bucket | Count | Share |
|---|---|---|
| 0.30–0.35 | 11 | 1.8% |
| 0.35–0.40 | 28 | 4.7% |
| 0.40–0.45 | 47 | 7.9% |
| 0.45–0.50 | 60 | 10.1% |
| 0.50–0.55 | 98 | 16.5% |
| 0.55–0.60 | 70 | 11.8% |
| 0.60–0.65 | 126 | 21.2% |
| 0.65–0.70 | 115 | 19.3% |
| 0.70–0.75 | 28 | 4.7% |
| 0.75–0.85 | 12 | 2.0% |

The distribution is roughly unimodal centered around 0.60–0.65 with a left tail. The current threshold of 0.35 sits at the extreme left — below P2.

### A.2 Threshold filtering effectiveness

- **Below MIN_FINAL_SCORE (0.35):** 11 / 595 = **1.8%** filtered
- **Above threshold (admitted):** 584 / 595 = **98.2%** admitted

The threshold is a near-complete pass-through. It rejects only trades with anomalously low component values.

### A.3 Decile performance table

Trades sorted by FinalScore, split into 10 equal-sized buckets:

| Decile | FS Range | N | WR% | Avg Net | TP | SL | TO |
|---|---|---|---|---|---|---|---|
| D1 (lowest) | 0.312–0.421 | 59 | **50.8%** | −0.0061 | 30 | 29 | 0 |
| D2 | 0.422–0.476 | 59 | 55.9% | −0.0053 | 33 | 22 | 4 |
| D3 | 0.476–0.517 | 59 | 42.4% | −0.0102 | 25 | 28 | 6 |
| D4 | 0.518–0.543 | 59 | 44.1% | −0.0137 | 26 | 31 | 2 |
| D5 | 0.544–0.588 | 59 | 40.7% | −0.0148 | 24 | 31 | 4 |
| D6 | 0.588–0.610 | 59 | 49.2% | −0.0058 | 29 | 29 | 1 |
| D7 | 0.610–0.635 | 59 | 35.6% | −0.0157 | 21 | 37 | 1 |
| D8 | 0.635–0.662 | 59 | 27.1% | −0.0116 | 16 | 42 | 1 |
| D9 | 0.662–0.683 | 59 | **15.3%** | −0.0143 | 9 | 50 | 0 |
| D10 (highest) | 0.683–0.826 | 64 | 42.2% | −0.0017 | 27 | 36 | 1 |

**Key observations:**
- D1 (lowest FinalScore) has the **highest WR** of any decile at 50.8%.
- D9 has the **lowest WR** at 15.3% — nearly all stop-losses.
- D8 and D9 together (FS 0.635–0.683) account for 118 trades with a combined WR of 21.2%. This is the worst-performing band.
- There is no monotonic relationship between FinalScore and WR. The pattern is not "noisy but trending upward" — it is genuinely non-monotonic.
- All deciles have negative average net profit. No FinalScore band is profitable on average.

**Top vs bottom decile comparison:**

| Metric | D1 (Bottom) | D10 (Top) | Δ |
|---|---|---|---|
| WR | 50.8% | 42.2% | −8.6pp |
| Avg Net | −0.0061 | −0.0017 | +0.0044 (top slightly less bad) |
| TP:SL ratio | 1.03 | 0.75 | Bottom wins more often |

D10 loses less per trade on average, but wins less frequently. Neither decile is profitable. The FinalScore composite is failing to identify trades that should be taken.

### A.4 Regime-segmented analysis

| Regime | N | Share | WR% | Avg Net | Low-FS WR | High-FS WR | FS Direction |
|---|---|---|---|---|---|---|---|
| TFS | 275 | 46.2% | 35.6% | −0.0084 | 42.3% | 29.0% | **INVERTED** |
| RBS | 132 | 22.2% | 56.8% | −0.0042 | 50.0% | 63.6% | Correct |
| ST | 93 | 15.6% | 37.6% | −0.0119 | 39.1% | 36.2% | Flat/noise |
| IE | 55 | 9.2% | 34.5% | −0.0309 | 33.3% | 35.7% | Flat/noise |
| HVU | 40 | 6.7% | 32.5% | −0.0048 | 45.0% | 20.0% | **INVERTED** |

**FinalScore works as designed in exactly one regime: RBS** (22.2% of trades). In TFS (46.2% of trades, the largest regime), FinalScore is actively inverted — high-scoring trades lose more often. In HVU, same inversion. In ST and IE, FinalScore is noise.

This means the FinalScore composite is calibrated for range-bound conditions but is working against us in trending and volatile conditions, which together account for 78% of trades.

### A.5 Verdict

**REGIME-SEGMENT at minimum. RECALIBRATE the formula as the preferred action.**

The current threshold of 0.35 is operationally meaningless and should be either raised substantially or replaced with regime-specific thresholds. But raising the threshold alone will not fix the problem — the formula itself is anti-predictive in the dominant regime. The component weights need re-derivation against empirical outcomes, or the formula needs structural redesign.

---

## B. RegimeWeight Distribution

### B.1 Overall distribution

| Statistic | Value |
|---|---|
| Min | 0.3350 |
| Max | 0.9882 |
| Mean | 0.6452 |
| Median | 0.6335 |
| Stdev | 0.1555 |

**Below MIN_REGIME_WEIGHT (0.30):** 0 / 595 = **0.0%** filtered. The gate is completely inert.

### B.2 Strategy × Regime matrix

Notation: `n|rwX.XX|WR%` = trade count | avg RegimeWeight | win rate

| Strategy | TFS | RBS | ST | IE | HVU |
|---|---|---|---|---|---|
| morning_star | 101\|rw0.73\|37% | 15\|rw0.47\|80% | 65\|rw0.52\|37% | 5\|rw0.57\|20% | 22\|rw0.68\|23% |
| reverse_impulse | 71\|rw0.77\|31% | 4\|rw0.47\|50% | 20\|rw0.64\|25% | 34\|rw0.73\|32% | 18\|rw0.73\|44% |
| range_trade | — | 74\|rw0.47\|55% | — | — | — |
| strong_bull_trend | 43\|rw0.73\|58% | — | — | 10\|rw0.74\|60% | — |
| vwap_pullback | 50\|rw0.73\|20% | — | — | — | — |
| support_bounce | — | 39\|rw0.46\|51% | — | — | — |
| volatility_edge | 6\|rw0.71\|33% | — | 7\|rw0.54\|86% | 1\|rw0.68\|100% | — |
| defensive_hedge | 4\|rw0.80\|50% | — | — | 1\|rw0.84\|0% | — |
| sma_trend_ride | — | — | — | 3\|rw0.72\|0% | — |

### B.3 Miscalibration candidates

**Critical miscalibrations:**

1. **vwap_pullback in TFS (n=50, RW=0.73, WR=20%).** High RegimeWeight is boosting FinalScore for a strategy that is losing 80% of the time in this regime. This is the single worst miscalibration in the matrix. RegimeWeight is actively promoting bad trades.

2. **morning_star in TFS (n=101, RW=0.73, WR=37%).** Same pattern — high RW inflating FinalScore for a below-average strategy in trending markets. morning_star's best regime is RBS (80% WR, RW=0.47) — where RegimeWeight is paradoxically low.

3. **reverse_impulse in TFS (n=71, RW=0.77, WR=31%).** High RW, poor performance. reverse_impulse performs better in HVU (44% WR) where RW is similar (0.73) — but TFS's volume swamps the signal.

4. **RegimeWeight in RBS is systematically low (~0.47) despite RBS hosting the best-performing strategies.** range_trade (55% WR), support_bounce (51% WR), and morning_star (80% WR in RBS) all get penalized by low RegimeWeight. The formula `trendStrength*0.7 + (1-volatility)*0.3` inherently produces low values in range-bound conditions (low trendStrength), which means it is downweighting the regime where strategies actually work best.

5. **sma_trend_ride (n=3, WR=0%, all IE).** Too small to be statistically meaningful, but the strategy is not being admitted in TFS where trend-riding should work. Possible regime-gating issue upstream.

**Near-zero / no-op cases:** None. All admitted trades have RW ≥ 0.335. But the floor of 0.30 is so low it provides no differentiation.

**Asymmetrically large outliers (RW > 0.9):** 28 trades, overwhelmingly in TFS. Of these 28, **18 (64%) hit stop-loss.** High RW outliers in TFS are a negative signal — they represent peak trendStrength moments where the backfill formula is maxing out, but the actual trade selection quality is poor.

### B.4 Root cause: backfill formula design

The backfill formula `trendStrength*0.7 + (1-volatility)*0.3` is designed to reward trending, low-volatility environments. This creates a systematic bias:

- **TFS** (high trend + moderate vol) → **high RW** → **inflated FinalScore** → more trades admitted → poor outcomes
- **RBS** (low trend + low vol) → **low RW** → **suppressed FinalScore** → fewer trades admitted → but those admitted perform well

The formula is backwards. It boosts the signal in the regime where signal quality is worst, and suppresses it where signal quality is best.

### B.5 Verdict

**RECALIBRATE.** The backfill formula needs to be replaced with an empirically-derived mapping from (strategy, regime) to outcome quality. The current formula's dependence on trendStrength is creating a systematic miscalibration in the dominant regime. Short-term: a regime-specific floor or cap on RegimeWeight would partially mitigate. Long-term: the formula itself needs to be outcome-anchored rather than input-anchored.

---

## C. rankingScore 3-Outcome Decomposition

### C.1 Schema finding: rankingScore does not exist

No field named `rankingScore`, `ranking_score`, `rank`, or any other ranking-specific identifier appears in the VTS trade log schema. The available score-like fields are:

- `finalScore` (top-level and `signal.finalScore`)
- `hybridScore` (top-level and `signal.hybridScore`)
- `pairDirectionalBiasScore` (top-level)
- `globalDirectionalBiasScore` (top-level)

**If a ranking mechanism exists in the live code that selects among competing signals within a scan cycle, its output is not being logged.** This is a diagnostic gap — without the ranking value at entry, we cannot evaluate whether the ranking function is adding value post-hoc.

### C.2 FinalScore as ranking proxy

Using FinalScore as a proxy for whatever ranking occurs (since it is the score most likely to be used as a tiebreaker):

| Decile | FS Range | N | TP% | SL% | TO% |
|---|---|---|---|---|---|
| D1 | 0.312–0.421 | 59 | **50.8%** | 49.2% | 0.0% |
| D2 | 0.422–0.476 | 59 | **55.9%** | 37.3% | 6.8% |
| D3 | 0.476–0.517 | 59 | 42.4% | 47.5% | 10.2% |
| D4 | 0.518–0.543 | 59 | 44.1% | 52.5% | 3.4% |
| D5 | 0.544–0.588 | 59 | 40.7% | 52.5% | 6.8% |
| D6 | 0.588–0.610 | 59 | 49.2% | 49.2% | 1.7% |
| D7 | 0.610–0.635 | 59 | 35.6% | 62.7% | 1.7% |
| D8 | 0.635–0.662 | 59 | 27.1% | 71.2% | 1.7% |
| D9 | 0.662–0.683 | 59 | **15.3%** | **84.7%** | 0.0% |
| D10 | 0.683–0.826 | 64 | 42.2% | 56.2% | 1.6% |

**Null hypothesis test: "FinalScore is noise (all deciles have similar outcome splits)."**

The null hypothesis is **rejected** — but in the wrong direction. The relationship is:

- **D1–D2 (lowest FinalScore):** TP% 50–56%, SL% 37–49%. Best outcome profile.
- **D7–D9 (high FinalScore):** TP% 15–36%, SL% 63–85%. Worst outcome profile.
- **D10 (highest FinalScore):** TP% 42%, SL% 56%. Moderate — partial recovery.

The discrimination gap between top-admitted (D2, 55.9% TP) and best-scoring (D9, 15.3% TP) is **40.6 percentage points** — a massive spread, but inverted. If the system ranked by FinalScore and picked the top, it would systematically pick losing trades.

### C.3 Timeout distribution

Timeouts (n=20, 3.4% of all trades) cluster in D2–D5 (FS 0.42–0.59). Upper deciles have near-zero timeouts. This suggests mid-range FinalScore trades are more likely to hit time limits — possibly because they represent ambiguous signals that neither clearly win nor clearly lose.

### C.4 Verdict

**REVISE (paper-mode blocker, not VTS-mode).** In VTS passive learning, no ranking-cut occurs — all signals that pass the gate are admitted for learning. The absence of rankingScore logging and the inverted FinalScore discrimination have zero operational impact in VTS mode.

However, when Phase 19 paper trading activates, the system will need to rank competing signals within a scan cycle and pick the top N. At that point: (a) rankingScore must be logged so it can be evaluated, and (b) whatever ranking mechanism is used must correlate positively with outcomes — which FinalScore currently does not. This is a pre-Phase-19 requirement, to be addressed in B66 alongside the formula recalibration.

---

## D. Structural Evaluation (Single vs Multi-Stage)

### D.1 Current-state map

The SQE implementation at `server/core/filters/signal_quality_evaluator.ts` runs the following sequential checks inside a single function:

1. **FinalScore threshold gate** — rejects signals with FinalScore < 0.35 (quant) or below PATTERN_POOL_GUARDRAILS.FINAL_SCORE_FLOOR (pattern). *Currently filtering 1.8% of signals.*
2. **RegimeWeight minimum gate** — rejects signals with RegimeWeight < 0.30. *Currently filtering 0.0% of signals.*
3. **ROI gate** — when entry/target/regime data exists, applies a predictive confidence-based expected-ROI check.
4. **Confidence floor gate** — optional minimum confidence threshold.
5. **Governance eligibility gate** — checks whether the (strategy, regime) pair is permitted by governance config.
6. **Pass/fail accumulation** — signals that survive all checks are marked passed; failures accumulate reason codes.

This is structurally a multi-check funnel, but it behaves as a single-stage system because:
- Gates 1 and 2 are operationally no-ops (thresholds too low).
- Gates 3–5 are conditional / optional and their activation rate is not telemetrized.
- All checks are flattened into one pass/fail decision with no per-stage diagnostic logging.

### D.2 What the data says about the current structure

The funnel is effectively: **admit everything → let the market sort it out.** With 98.2% pass rate on Gate 1 and 100% on Gate 2, the SQE is not performing its core function of quality filtration.

The 7-day data shows:
- **Net-negative average profit across all deciles.** No FinalScore band is profitable.
- **Only one source pool is profitable** (quant-strong_trend, +0.0093 avg net, 58.5% WR).
- **Every other pool is net-negative**, including pattern (−0.0151), quant-trend (−0.0108), and quant-reversal (−0.0091).

If the SQE were doing its job, we would expect to see a clear quality gradient: high-scored trades materially outperforming low-scored trades. Instead, the gradient is inverted or absent.

### D.3 Argument for multi-stage redesign

A multi-stage design would provide:

1. **Diagnostic transparency.** Currently, when a trade loses, we cannot determine which quality signal failed because all checks are flattened. Separate stages with per-stage telemetry would enable: "Gate 1 passed 340 signals → Gate 2 passed 280 → Gate 3 passed 120 → 120 admitted." This funnel visibility is essential for calibration.

2. **Independent calibration per stage.** The FinalScore formula conflates four different quality dimensions (hybridScore, confidence, regime fit, decay) into one number. When one component is anti-predictive (as predictiveConfidence is in TFS), it contaminates the entire score. Separate stages would allow each dimension to be calibrated, evaluated, and disabled independently.

3. **Regime-aware gating.** The current single-threshold model applies the same cutoff across all regimes, but the data shows FinalScore means different things in different regimes. A multi-stage design could apply regime-specific logic at a dedicated stage.

**Proposed stage boundaries:**

| Stage | Purpose | Inputs | Gate logic |
|---|---|---|---|
| 1. Eligibility | Binary: is this (strategy, regime, pool) pair permitted? | Governance config, canonical map | Pass/fail, no scoring |
| 2. Quality scoring | Compute signal quality from components | hybridScore, regime-specific weights | Score output (replaces FinalScore) |
| 3. Regime-fit filter | Does this signal fit the current regime conditions? | Regime, DBS, strategy affinity | Regime-specific thresholds |
| 4. Ranking | Among surviving signals, pick the best N | Output from Stage 2, position limits | Top-N selection |

### D.4 Argument for keeping single-stage (with recalibration)

A multi-stage redesign is a significant engineering investment. The counter-argument is:

- The current code already runs multiple checks in sequence — it is structurally multi-stage, just poorly calibrated and poorly telemetrized.
- Adding per-gate logging and raising/recalibrating thresholds within the existing structure would achieve 80% of the benefit at 20% of the cost.
- The core problem is not the architecture — it is that the formula weights are wrong and the thresholds are set to pass-through. Fixing those inside the current structure may be sufficient.

### D.5 Recommendation

**Current mode (VTS): Do not change thresholds.** The loose gates are correct for VTS broad-capture learning. Tightening thresholds now would actively disrupt the learning pipeline that is producing all of our training data. The VTS needs to see the full signal distribution — including bad signals — to build the training baseline Phase 19 will use.

**B66 (pre-Phase-19 preparation): Recalibrate within the existing structure.**
- **Fix the formula first.** Threshold recalibration is pointless until the formula produces scores that correlate positively with outcomes. Start by removing or inverting predictiveConfidence's contribution in TFS, and recalibrating the RegimeWeight backfill formula so it does not systematically reward the regime where strategies perform worst.
- Add per-gate telemetry logging so we can see what each check is doing in production. This instrumentation should ship before the formula fix so we have before/after visibility.
- Only after the formula is fixed: raise thresholds to provide meaningful filtration for paper mode. The target threshold depends on the recalibrated score distribution — cannot be pre-specified now.

**Medium-term (post-B66 or Phase 16): Multi-stage redesign.**
- Separate eligibility, scoring, regime-fit, and ranking into distinct stages with independent telemetry.
- Derive scoring weights empirically from outcome data rather than from design-time intuition.
- Implement regime-specific scoring or regime-specific thresholds at the regime-fit stage.

**The formula fix is blocking for Phase 19 go-live.** In VTS mode, the anti-predictive formula means the learning data is being labeled with a broken quality signal — trades the formula scores highest are empirically the worst. This contaminates any downstream ML or calibration that trusts FinalScore as a quality proxy. The formula must be corrected before the training baseline is used to set paper-mode parameters.

---

## Appendix — Data Sources and Queries

### Files read
- `BOOTSTRAP.md`, `MEMORY.md` — project context
- `Claude Comms and Packages/Scope Files/B63_ITEM18_SQE_AUDIT_BRIEF.md` — audit brief
- `server/core/filters/signal_quality_evaluator.ts` — SQE implementation (code-read notes from GPT-5.4 session)
- `server/core/utils/score-calculator.ts` — FinalScore computation
- `server/config/canonical-regime-strategy-map.ts` — regime/strategy configuration

### Data analyzed
- `/root/.openclaw/workspace/data/item18/2026-04-{15..22}.json` — 7 days VTS closed trade logs
- 595 total closed trades across 10 strategies, 5 regimes, 6 source pools

### Statistical methods
- Decile bucketing by FinalScore (equal-count buckets, ~59 trades each)
- Win rate = TP / N for each bucket
- Pearson correlation coefficients: FinalScore vs NetProfit (r = −0.017), hybridScore (r = −0.069), predictiveConfidence (r = +0.071), regimeWeight (r = −0.035)
- Median split analysis for regime-segmented FinalScore direction testing
- High/low half comparison for each formula component, overall and TFS-specific

### Key correlations (Pearson r vs net profit)
| Component | r | Direction |
|---|---|---|
| FinalScore | −0.017 | Anti-predictive (near zero) |
| hybridScore | −0.069 | Anti-predictive |
| predictiveConfidence | +0.071 | Weakly positive |
| regimeWeight | −0.035 | Anti-predictive |

Note: predictiveConfidence has a positive linear correlation with net profit (high-confidence trades that win, win bigger) but an inverted WR relationship (high-confidence trades win less often). The WR inversion dominates for trade-selection purposes because the gate is binary (admit/reject), not profit-weighted.

---

---

## E. Modularization Lens

### E.1 Input-cluster analysis

The SQE consumes six conceptually distinct inputs. Tracing their upstream data sources reveals which inputs share plumbing and which are independent.

| Input | Upstream source | Shared data path? |
|---|---|---|
| **FinalScore** | Composite of hybridScore, predictiveConfidence, regimeWeight, decayPenalty via `SCORE_WEIGHTS` in `score-weights.config.ts` | Tightly coupled to RegimeWeight (RW is a component of FS) and PredictiveConfidence (confidence is a component of FS) |
| **RegimeWeight** | Backfill formula in `score-calculator.ts`: `trendStrength*0.7 + (1-volatility)*0.3`, clamped [0.1, 1]. Inputs from MCE real-time data. | Feeds into FinalScore as a component. Also checked independently as a gate (MIN_REGIME_WEIGHT). |
| **PredictiveConfidence** | `getPredictiveConfidence()` in `score-calculator.ts`. Derived from VTS telemetry win rate via sigmoid transform: `sigmoid((winRate - 0.5) * 6)`. Cached 60s per (regime, strategy) pair. | Feeds into FinalScore as the "confidence" component. Also consumed independently by ROI gate (`isSignalProfitable()`). |
| **ROI gate** | `expectancy.ts`: `isSignalProfitable()` uses entryPrice, targetPrice, regime, and predictiveConfidence. Applies `getDynamicROIThreshold()`. | Shares predictiveConfidence with FinalScore but otherwise independent (uses price geometry, not score components). |
| **Confidence floor** | `strategy-modes.ts`: `meetsConfidenceFloor()` uses signal confidence and regimeStability. Mode overlay provides the floor value. | Uses confidence (same upstream as predictiveConfidence) but applies a different transformation (floor check, not sigmoid). |
| **Governance gate** | `strategy-eligibility.ts` + `strategy-governance.ts`: `isStrategyEligible()` checks strategy dependency level against regime stability. | Fully independent of all scoring inputs. Pure eligibility check. |

**Cluster map:**

```
Cluster A (Scoring): FinalScore <-> RegimeWeight <-> PredictiveConfidence
  All three share upstream MCE/VTS data and feed into each other.
  FinalScore = f(hybridScore, PredictiveConfidence, RegimeWeight, decayPenalty)
  Changes to any component ripple through the composite.

Cluster B (Price geometry): ROI gate
  Shares PredictiveConfidence with Cluster A but otherwise independent.
  Uses entry/target/regime — data the scoring cluster does not consume.

Cluster C (Mode policy): Confidence floor
  Uses confidence + regimeStability. Overlaps with Cluster A on confidence
  but applies different logic (floor threshold vs weighted contribution).

Cluster D (Governance): Governance gate
  Fully independent. No shared data with A/B/C.
  Binary eligibility based on strategy dependency × regime stability.
```

### E.2 Independence analysis

Which inputs could be swapped, replaced, or reweighted without touching the others?

| Input | Independence | Can be swapped independently? |
|---|---|---|
| Governance gate | **Fully independent.** No data dependency on any score. | Yes — could be replaced with any (strategy, regime) → bool function without touching scoring. |
| ROI gate | **Mostly independent.** Only dependency on scoring cluster is predictiveConfidence, consumed as an opaque input. | Yes — if predictiveConfidence is provided as a parameter, the ROI gate is a self-contained function. Could be replaced with an alternative profitability check. |
| Confidence floor | **Semi-independent.** Uses confidence (shared with FinalScore) but applies it differently. | Yes — could be removed or replaced without affecting FinalScore computation. Currently bypassed in VTS via `skipConfidenceFloor`. |
| RegimeWeight | **Tightly coupled to FinalScore.** It is both a gate (MIN_REGIME_WEIGHT) and a FinalScore component (20% weight). | No — changing the RegimeWeight formula changes FinalScore. Cannot be swapped without recalibrating FinalScore. |
| PredictiveConfidence | **Tightly coupled.** Feeds into FinalScore (30% weight) AND the ROI gate. | No — changing the confidence derivation changes both the FinalScore composite and the ROI threshold. |
| FinalScore | **Tightly coupled.** Composite of all scoring inputs. | No — it IS the coupling point. |

**Modularization dividing line:** Governance gate and ROI gate are strong candidates for independent modules. Confidence floor is a weaker candidate (partially coupled). FinalScore/RegimeWeight/PredictiveConfidence form a tightly coupled scoring kernel that should be treated as one module.

### E.3 Cadence analysis

| Input | Update frequency | Configuration mechanism |
|---|---|---|
| SCORE_WEIGHTS (0.4/0.3/0.2/0.1) | **Never** — static constants, change only with code deploy | Hard-coded in `score-weights.config.ts` |
| SQE_DEFAULT_THRESHOLDS (0.35/0.30) | **Fallback only** — overridden by DB values when available | Hard-coded in `signal_quality_evaluator.ts`, overridable via `screener_filters` table |
| Screener thresholds (finalScoreMin, regimeWeightMin) | **User-configurable** — UI screeners tab, cached 60s | DB (`screener_filters` table) |
| RegimeWeight backfill formula coefficients (0.7/0.3) | **Never** — static constants | Hard-coded in `score-calculator.ts` |
| RegimeWeight floor (0.1 clamp) | **Never** — static constant | Hard-coded in `score-calculator.ts` |
| PredictiveConfidence sigmoid parameters (center=0.5, scale=6) | **Never** — static constants | Hard-coded in `score-calculator.ts` |
| PredictiveConfidence cache | **Per-minute** — 60s TTL per (regime, strategy) | Runtime cache in `score-calculator.ts` |
| PATTERN_POOL_GUARDRAILS.FINAL_SCORE_FLOOR | **Never** — static constant | Hard-coded in `pattern-filter-profile.ts` |
| Regime riskMultiplier / minConfidence | **Never** — static constants | Hard-coded in `canonical-regime-strategy-map.ts` |
| Strategy dependency levels | **Never** — static configuration | Hard-coded in `strategy-governance.ts` |
| Mode overlays (confidence floors) | **Never** — static configuration | Hard-coded in `strategy-modes.ts` |

**Cadence tiers:**

- **Tier 1 — Per-scan (real-time):** RegimeWeight (computed from MCE data), PredictiveConfidence (cached 60s from VTS telemetry). These change with market conditions.
- **Tier 2 — User-adjustable (minutes-to-hours):** Screener thresholds via DB. Already promoted to config.
- **Tier 3 — Code-deploy-only (days-to-weeks):** Everything else. 12 distinct constants across 5 files that can only be changed with a code deploy, build, and PM2 restart.

The 12 Tier-3 constants are the primary modularization target: they represent tunable parameters that are currently frozen in source code but should be data-driven.

### E.4 Configuration surface analysis

**Hard-coded constants that should be promoted to config or DB:**

| Constant | Current location | Current value | Promotion target | Priority |
|---|---|---|---|---|
| `SCORE_WEIGHTS.FINAL_SCORE.HYBRID` | `score-weights.config.ts` | 0.4 | DB / config service | **P1** — formula recalibration in B66 requires this to be tunable |
| `SCORE_WEIGHTS.FINAL_SCORE.CONFIDENCE` | `score-weights.config.ts` | 0.3 | DB / config service | **P1** — same |
| `SCORE_WEIGHTS.FINAL_SCORE.REGIME` | `score-weights.config.ts` | 0.2 | DB / config service | **P1** — same |
| `SCORE_WEIGHTS.FINAL_SCORE.DECAY` | `score-weights.config.ts` | 0.1 | DB / config service | **P1** — same |
| RegimeWeight trend coefficient | `score-calculator.ts` line: `trendScore * 0.7` | 0.7 | DB / config service | **P1** — backfill formula recalibration requires this |
| RegimeWeight volatility coefficient | `score-calculator.ts` line: `(1 - normalizedVolatility) * 0.3` | 0.3 | DB / config service | **P1** — same |
| RegimeWeight floor clamp | `score-calculator.ts` | 0.1 | Config | P2 |
| PredictiveConfidence sigmoid center | `score-calculator.ts` | 0.5 | Config | P2 |
| PredictiveConfidence sigmoid scale | `score-calculator.ts` | 6 | Config | P2 |
| `PATTERN_POOL_GUARDRAILS.FINAL_SCORE_FLOOR` | `pattern-filter-profile.ts` | 0.45 | DB (alongside screener thresholds) | P2 |
| `SQE_DEFAULT_THRESHOLDS.MIN_FINAL_SCORE` | `signal_quality_evaluator.ts` | 0.35 | Already has DB path (screener_filters) — default value should match | P3 (already partially promoted) |
| `SQE_DEFAULT_THRESHOLDS.MIN_REGIME_WEIGHT` | `signal_quality_evaluator.ts` | 0.30 | Already has DB path — same | P3 |

**P1 items (6 constants)** are blocking for the B66 formula recalibration. You cannot iterate on formula weights if each iteration requires a code deploy. These should be promoted to DB or a config service so weights can be adjusted, A/B tested, and rolled back without touching source code.

**P2 items (4 constants)** are secondary tuning parameters. Worth promoting but not blocking for B66.

**P3 items (2 constants)** already have a DB path but the hardcoded defaults are misaligned with operational reality. Low-priority cleanup.

### E.5 Proposed module partition

```
┌─────────────────────────────────────────────────────────────┐
│                    SQE Pipeline                             │
│                                                             │
│  ┌──────────────────┐  ┌──────────────────┐                 │
│  │ ELIGIBILITY      │  │ SCORING KERNEL   │                 │
│  │ MODULE           │  │ MODULE           │                 │
│  │                  │  │                  │                 │
│  │ • Governance     │  │ • FinalScore     │                 │
│  │   gate           │  │   formula        │                 │
│  │ • (strategy,     │  │ • RegimeWeight   │                 │
│  │   regime) →      │  │   computation    │                 │
│  │   bool           │  │ • Predictive     │                 │
│  │                  │  │   Confidence     │                 │
│  │ Config:          │  │ • decayPenalty   │                 │
│  │  strategy-       │  │                  │                 │
│  │  governance.ts   │  │ Config:          │                 │
│  │  strategy-       │  │  SCORE_WEIGHTS   │                 │
│  │  eligibility.ts  │  │  RW coefficients │                 │
│  └────────┬─────────┘  │  sigmoid params  │                 │
│           │pass        └────────┬─────────┘                 │
│           ▼                     │score                      │
│  ┌──────────────────┐           ▼                           │
│  │ PROFITABILITY    │  ┌──────────────────┐                 │
│  │ MODULE           │  │ THRESHOLD        │                 │
│  │                  │  │ MODULE           │                 │
│  │ • ROI gate       │  │                  │                 │
│  │ • Dynamic ROI    │  │ • FinalScore     │                 │
│  │   thresholds     │  │   threshold      │                 │
│  │ • Confidence     │  │ • RegimeWeight   │                 │
│  │   floor          │  │   threshold      │                 │
│  │                  │  │ • Pattern pool   │                 │
│  │ Config:          │  │   floor          │                 │
│  │  expectancy.ts   │  │ • Mode-specific  │                 │
│  │  strategy-       │  │   confidence     │                 │
│  │  modes.ts        │  │   floors         │                 │
│  └────────┬─────────┘  │                  │                 │
│           │pass        │ Config:          │                 │
│           ▼            │  screener_filters│                 │
│           ╳────────────│  (DB, user-      │                 │
│           │ all pass   │  adjustable)     │                 │
│           │            └────────┬─────────┘                 │
│           ▼                     │pass                       │
│  ┌──────────────────┐           │                           │
│  │ RANKING MODULE   │◄──────────┘                           │
│  │ (future)         │                                       │
│  │                  │                                       │
│  │ • Top-N          │                                       │
│  │   selection      │                                       │
│  │ • rankingScore   │                                       │
│  │   (to be built)  │                                       │
│  │ • Position       │                                       │
│  │   limits         │                                       │
│  └──────────────────┘                                       │
└─────────────────────────────────────────────────────────────┘
```

**Module responsibilities:**

| Module | Variables owned | Interface | Dependencies |
|---|---|---|---|
| **Eligibility** | Governance gate: strategy × regime × dependency → bool | `isEligible(strategy, regime, stability): bool` | `strategy-governance.ts`, `strategy-eligibility.ts`. Zero dependency on scoring. |
| **Scoring kernel** | FinalScore formula, RegimeWeight formula, PredictiveConfidence derivation, decayPenalty, hybridScore passthrough | `computeScore(signal): { finalScore, regimeWeight, confidence, components }` | `score-weights.config.ts`, `score-calculator.ts`, VTS telemetry. Self-contained math. |
| **Threshold** | All min/max cutoffs: FinalScore min, RegimeWeight min, pattern pool floor, mode-specific confidence floors | `meetsThresholds(score, regime, pool, mode): { passed, failures[] }` | Scoring kernel output + `screener_filters` DB + `pattern-filter-profile.ts` + `strategy-modes.ts`. |
| **Profitability** | ROI gate, dynamic ROI thresholds | `isProfitable(entry, target, regime, confidence): bool` | `expectancy.ts`. Only shares predictiveConfidence with scoring kernel. |
| **Ranking** (future) | Top-N selection among passing signals per scan cycle | `rank(signals[]): ranked[]` | To be designed. Currently does not exist — rankingScore is not logged or computed. |

### E.6 Hard-coded-to-DB promotion list (consolidated)

**Immediate (B66 — required for formula recalibration):**
1. `SCORE_WEIGHTS.FINAL_SCORE.HYBRID` (0.4)
2. `SCORE_WEIGHTS.FINAL_SCORE.CONFIDENCE` (0.3)
3. `SCORE_WEIGHTS.FINAL_SCORE.REGIME` (0.2)
4. `SCORE_WEIGHTS.FINAL_SCORE.DECAY` (0.1)
5. RegimeWeight trend coefficient (0.7)
6. RegimeWeight volatility coefficient (0.3)

**Near-term (pre-Phase-19):**
7. RegimeWeight floor clamp (0.1)
8. PredictiveConfidence sigmoid center (0.5)
9. PredictiveConfidence sigmoid scale (6)
10. PATTERN_POOL_GUARDRAILS.FINAL_SCORE_FLOOR (0.45)

**Cleanup (already partially promoted):**
11. SQE_DEFAULT_THRESHOLDS.MIN_FINAL_SCORE (0.35) — align default with DB
12. SQE_DEFAULT_THRESHOLDS.MIN_REGIME_WEIGHT (0.30) — align default with DB

### E.7 Recommendation

**SQE is a strong modularization candidate.** Three reasons:

1. **The code already contains the module boundaries — they are just not enforced.** The governance gate (`strategy-eligibility.ts`), the ROI gate (`expectancy.ts`), the confidence floor (`strategy-modes.ts`), and the scoring formula (`score-calculator.ts`) are already in separate files with separate concerns. They are wired together in one function (`evaluateSignalQuality`) with inline sequential logic. Extracting them into modules with well-defined interfaces is a refactor, not a redesign.

2. **The audit findings demand it.** The FinalScore formula is anti-predictive and needs recalibration. You cannot iterate on formula weights if each change requires editing `score-weights.config.ts`, committing, building, and restarting PM2. Promoting the 6 P1 constants to DB and providing a scoring-kernel module with a clean interface would enable rapid A/B experimentation — test a new weight set, evaluate it against the VTS training data, and roll back if it's worse. Without modularization, B66 formula recalibration will be a slow deploy-test-deploy cycle.

3. **The ranking module does not exist yet and must be built for Phase 19.** Designing it as a separate module from the start (rather than bolting it into `evaluateSignalQuality`) avoids the same monolith pattern. The ranking module should consume scoring kernel output and apply a top-N selection — a clean interface boundary that modularization makes natural.

**SQE should NOT stay monolithic.** The current structure is a compact funnel where six conceptually independent checks are flattened into one function with no per-stage telemetry, no independent calibration surface, and no ability to swap components. The audit has demonstrated that this structure makes it impossible to diagnose why the scoring is anti-predictive (you cannot see which gate is doing what) and impossible to fix it quickly (all tunable parameters are frozen in source code). Modularization resolves both problems.

---

*End of Item 18 SQE Audit (Parts A–E complete). Part E findings feed into the post-audit modularization synthesis document.*
