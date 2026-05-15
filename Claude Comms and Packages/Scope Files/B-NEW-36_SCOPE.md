# B-NEW-36 — Tertile non-monotonicity diagnostic + 58% unmatched-rate audit

**Status:** SCOPE DRAFT (Step 1) — pending Langston review
**Date:** 2026-05-15
**Owner:** CC (impl) + Langston (review)
**Branch:** `migration/aws-supabase`
**Prerequisite:** B-NEW-33 closed (drain done, all 10 factors verdict INCONCLUSIVE, gate locked at 7pp per Kyle Option 1)
**Unblocks:** Re-run of B-NEW-33 (post-diagnostic), then B67.5 consumer-gate design

---

## 1. Background

B-NEW-33 delivered all-INCONCLUSIVE verdicts on the 10 crypto confidence levers (n=1800-2250 per factor, 16-day cohort). The parity check vs the May 5/6 screenshot CONFIRMED the calculation is sound — confidence-shift values (top table) match exactly. The bottom table (predictive-lift tertile WRs) shows two structural findings that block B67.5:

### Finding 1: tertile non-monotonicity across all 10 factors

Post-drain full-cohort tertile WRs from B-NEW-33:

| Factor | Low | Mid | High |
|---|---|---|---|
| b67_4_outcome_feedback | 17.3% | **25.7%** | 20.4% |
| b68_1_multi_tf_agreement | 18.5% | **30.3%** | 19.5% |
| b68_2_volume_regime | 17.6% | **25.7%** | 20.6% |
| b68_3_pair_correlation | 17.7% | **25.7%** | 20.5% |
| b68_4_regime_age | 17.1% | **25.7%** | 20.5% |
| b68_5_path_b_sustainability | 17.0% | **26.4%** | 20.5% |

Mid wins more than both low AND high across every factor. The pattern is identical across all 10 factors, which means it's **one upstream artifact showing up everywhere** — not 10 independent signals.

**Pre-drain (May 1-10) cohort had a DIFFERENT shape** — the parity check showed pre-stall rows had mid as the LOWEST bucket (e.g., b68_2: 19.6% / 11.8% / 24.5%). The shape FLIPPED between pre-stall (May 1-10) and post-stall (May 11-15) data.

### Finding 2: 58% of pending rows marked unreplayable_real_rejected

19,219 of 33,049 pending rows had no closed trade match in either DB or JSONL. Interpretation: "signal emitted but rejected at gates downstream of signal generation (Kelly sizing 0, position-cap, duplicate-symbol cap, etc.)".

**Initial dimension survey (this scope draft, 2026-05-15):** the unmatched rows are heavily skewed by strategy:

| Strategy | Unmatched n | % of unmatched |
|---|---:|---:|
| strong_bull_trend | 12,235 | **64%** |
| vwap_pullback | 4,719 | **25%** |
| morning_star | 855 | 4% |
| range_trade | 840 | 4% |
| reverse_impulse | 269 | 1% |
| Others | <300 | <2% |

Two strategies account for **89% of unmatched signals**. The matched cohort under-represents what those strategies actually signal — selection bias hypothesis CONFIRMED.

---

## 2. Hypotheses to test

Per Langston B-NEW-33 Step 8 review:

**Hypothesis A — Base confidence distribution has non-monotonic relationship with outcome.** High-confidence signals may be routed into thinner-liquidity contexts or specific regime/strategy contexts where realized WR degrades.

**Hypothesis B — Matched cohort is selection-biased.** What survives the replay match (= what opened as a trade) isn't a representative sample of what the signal pipeline actually emits. The pre-trade-open gates (Kelly sizing 0, position-cap, duplicate-symbol cap, friction-too-high) systematically remove certain signal types.

The strategy-skew finding in §1 already provides strong evidence FOR Hypothesis B. B-NEW-36 produces the full decomposition.

---

## 3. Objectives

1. **Confidence-decile analysis (not tertile).** Split matched rows into 10 deciles by `real_decision.confidence`. Compute WR per decile. Look for the actual SHAPE — is it monotonic, U-shaped, inverted-U, step-function?
2. **Pre-stall vs post-stall decile comparison.** Same analysis but split by `replay_completed_at < 2026-05-15` (pre-drain) vs `>=` (post-drain). Where does the shape flip?
3. **Decompose by `sourcePool`.** quant-strong_trend (81% of matched), quant-reversal (11%), quant-trend (6%), pattern (3%). Does the non-monotonicity hold within each pool? Or is it a pool-mix effect?
4. **Decompose by `regimeLabel`.** TREND_FRIENDLY_STABLE (76%), RANGE_BOUND_STABLE (11%), IMPULSE_EXPANSION (9%), STRUCTURAL_TRANSITION (5%), HIGH_VOLATILITY_UNSTABLE (1%). Same question.
5. **Decompose by `phase_at_entry`.** EARLY / PRIME / LATE. Does WR-by-confidence relationship change across the regime-phase lifecycle?
6. **Unmatched-row distribution audit.** Group 19,219 unreplayable rows by:
   - strategy (already surveyed; strong_bull_trend + vwap_pullback = 89%)
   - symbol (which symbols dominate the unmatched pile?)
   - hour-of-day (UTC) — are weekend/off-hour signals over-represented?
   - day-of-week
   - sourcePool
   - regimeLabel
   - factor_name (each signal emits 10 ablation rows — they should be uniformly unmatched across factors per signal)
7. **Matched-vs-unmatched distribution comparison.** Side-by-side: what's the strategy/sourcePool/regime/phase distribution in the MATCHED cohort vs the UNMATCHED cohort? If they're radically different, the matched cohort is a biased sample.
8. **Verdict on Hypotheses A and B.** Concrete recommendation for next step: re-run B-NEW-33 with a corrected matching strategy? With a stratified-by-sourcePool analysis? With a different gate threshold conditional on dimension?

---

## 4. Out of scope (for this batch)

- **Building a forward-simulation harness** for the 19,219 unreplayable rows. That's a Phase 19 deliverable per the original B67.0 design notes. Out of scope.
- **Changing the existing computeFactorCalibration aggregator** in `drift-dashboard-aggregator.ts`. The aggregator is fine; the diagnostic is about the COHORT, not the aggregator.
- **Modifying B-NEW-33's CLI or the cron.** Both are working correctly as of 2026-05-15. Diagnostic is OUT-OF-BAND.
- **Wiring any factor into B67.5 consumer-gates.** Strictly diagnostic. B67.5 wiring waits on B-NEW-33 re-run AFTER this batch's findings inform the right analysis approach.
- **xstock_spot factor calibration.** Phase E of `XSTOCK_CALIBRATION_PLAN.md`. Crypto-only here.

---

## 5. Architectural decisions (proposed — Langston review please)

### 5.1 CLI tool, not UI panel

**Proposed:** new one-shot CLI `npm run b-new-36:cohort-diagnostic`. Mirrors the B-NEW-33 pattern. Output: Markdown report to stdout + `Claude Comms and Packages/Batch Completion/B-NEW-36_DIAGNOSTIC.md`.

**Rationale:** the analysis is a 30-day-cadence diagnostic informing B67.5 design, NOT an ongoing UI surface. If patterns emerge that warrant continuous monitoring, a follow-up batch can promote the most useful chart to the existing Drift Dashboard.

### 5.2 Decile granularity, not tertile

**Proposed:** all confidence-vs-WR analyses use 10-decile splits instead of 3-tertile splits. Tertiles obscure shape detail (3 buckets can't distinguish a smooth monotonic curve from a U-shape from a step function). Deciles give 10 points per curve — enough to see the actual shape.

**Decision-grade gate impact:** none. The decision-grade gate in B-NEW-33 stays tertile-based (Langston-locked). B-NEW-36 just uses deciles for the shape diagnostic; verdict-grade analysis stays tertile.

### 5.3 Stratified analysis per dimension

**Proposed:** for each of (sourcePool, regimeLabel, phase, strategy) decompose the WR-by-confidence-decile curve. Produces N curves per dimension. If they ALL show the same non-monotonicity, the artifact is upstream of those dimensions. If only some show it, we've localized the issue.

### 5.4 Use existing matched data — no re-replay

**Proposed:** B-NEW-36 reads the existing `regime_factor_alternates` rows (post-B-NEW-33 drain). No new matching, no new DB writes. Purely a read-and-analyze pass.

---

## 6. Verification criteria

| # | Criterion | How verified |
|---|---|---|
| 1 | Decile-level WR-by-confidence curve produced for all matched rows | Report contains decile breakdown |
| 2 | Pre-stall vs post-stall comparison shows where shape flipped | Side-by-side table in report |
| 3 | Decomposition produced for sourcePool, regimeLabel, phase, strategy | 4 separate decomposition sections |
| 4 | Unmatched-row distribution by all 7 dimensions surveyed | Section in report |
| 5 | Matched-vs-unmatched side-by-side comparison | Section in report |
| 6 | Verdict on Hypotheses A and B with concrete recommendation for B-NEW-33 re-run | Conclusion section |
| 7 | No regression to live aggregator, no DB writes | Out-of-band CLI; verifiable by `git diff` on aggregator file |
| 8 | CI green | GitHub Actions run |

---

## 7. Workflow checkpoints

| Step | Owner | Deliverable |
|---|---|---|
| 1 | CC | This scope file |
| 2 | CC | `B-NEW-36_PRE_AUDIT.md` with detailed data sample + dimension validation + SIM consult |
| Langston | Langston | Combined scope + pre-audit ACK (or REVISE) |
| 3 | CC | Implementation: `scripts/b-new-36-cohort-diagnostic.ts` |
| 4 | Langston | Code-diff review pre-push (optional — small additive script) |
| 5 | CC | CI green |
| 6 | CC | Deploy to staging via npm script |
| 7 | CC | First-pass verification: run, collect report, walk through findings |
| 8 | Langston | Step 8 review of findings + recommendation for B-NEW-33 re-run path |
| 10 | CC | Governance: BATCH_CATALOG + PHASE_HISTORY + CHANGES_AND_FIXES + MEMORY |
| 11 | CC | `B-NEW-36_COMPLETION_REPORT.md` + Kyle ack |

---

## 8. Risks + concerns

- **Risk: the "shape flip" between cohorts may be sampling noise.** With ~800 rows per factor pre-stall, the tertile WRs have noticeable variance. Mitigation: decile-level analysis with confidence intervals; if intervals overlap heavily, the "flip" isn't real.
- **Risk: stratification reduces n per cell below decision-grade.** quant-strong_trend has 17K rows, but pattern has only 715 — pattern's per-decile n is ~70, below the 150 threshold. Mitigation: report decile counts alongside WRs; flag when CI gets wide.
- **Risk: the diagnostic surfaces too many candidate hypotheses to choose between.** Mitigation: end the report with a SPECIFIC recommendation for the B-NEW-33 re-run, not a buffet of options.

---

## 9. Questions for Langston

1. Decile-level granularity (10) — is that the right resolution? Or do you prefer 20-quantile or 5-quintile?
2. Stratification dimensions — I picked sourcePool, regimeLabel, phase, strategy. Anything you'd add or remove? Liquidity proxy (via separate join to pair_friction)?
3. For the unmatched-row audit, is "side-by-side comparison with matched cohort" the right framing, or do you prefer a chi-square test of independence between matched-status and each dimension?
4. After the diagnostic, what's your call on the B-NEW-33 re-run strategy: (a) full re-analysis stratified by the dimension that shows the worst contamination, (b) restricted to a sub-cohort that's known clean, (c) other?
5. Anything from the pre-existing computeFactorCalibration aggregator's logic I should preserve in the diagnostic for consistency?
