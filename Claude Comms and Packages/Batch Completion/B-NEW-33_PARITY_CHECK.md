# B-NEW-33 Parity Check — CLI Methodology vs Existing Aggregator

**Run timestamp:** 2026-05-15T20:19:46.207Z
**Pre-drain cohort:** rows with replay_completed_at < 2026-05-15 (cron-replayed, pre-B-NEW-33-drain)
**Total rows:** raw=7593 / B76-filtered=4232

## TOP TABLE — Confidence-shift distribution (the panel Kyle was watching pre-stall)

Reproduces the existing aggregator's top table (`drift-dashboard-aggregator.ts:1106-1126`): avgConfidenceShift, avgAbsConfidenceShift, maxAbsConfidenceShift, shiftIsZeroFraction. These metrics describe HOW MUCH each lever moves the confidence number — independent of trade outcomes. **B76 frozen-factor filter applied** (matching the aggregator).

| Factor | n | avg shift | avg abs shift | max abs shift | % at zero | shape |
|---|---:|---:|---:|---:|---:|---|
| b67_1_btc_dominance | 4 | 0.0212 | 0.0212 | 0.0370 | 25.0% | meaningful movement |
| b67_1_funding_rates | 4 | -0.0213 | 0.0213 | 0.0449 | 25.0% | meaningful movement |
| b67_1_mcap_momentum | 3 | -0.0015 | 0.0015 | 0.0024 | 33.3% | dormant |
| b67_2_phase_preference | 7 | 0.0048 | 0.0219 | 0.0353 | 0.0% | meaningful movement |
| b67_4_outcome_feedback | 805 | -0.0033 | 0.0202 | 0.1001 | 0.0% | meaningful movement |
| b68_1_multi_tf_agreement | 388 | -0.0069 | 0.0202 | 0.1396 | 0.0% | meaningful movement |
| b68_2_volume_regime | 735 | -0.0010 | 0.0190 | 0.1001 | 0.0% | small movement |
| b68_3_pair_correlation | 736 | -0.0030 | 0.0199 | 0.1079 | 0.0% | small movement |
| b68_4_regime_age | 814 | -0.0012 | 0.0149 | 0.0646 | 9.2% | small movement |
| b68_5_path_b_sustainability | 736 | -0.4431 | 0.4456 | 0.9526 | 0.0% | large movement |

## BOTTOM TABLE — Tertile WR + predictive lift (B76 frozen-factor filter APPLIED)

| Factor | n | Agg low/mid/high WR | Real spread | Alt spread | Lift | min n/bkt | Decision-grade? |
|---|---:|---|---:|---:|---:|---:|---|
| b67_1_btc_dominance | 4 | 0.0% / 100.0% / 100.0% | 100.0pp | 100.0pp | 0.0pp | 1 | NO |
| b67_1_funding_rates | 4 | 0.0% / 100.0% / 100.0% | 100.0pp | 100.0pp | 0.0pp | 1 | NO |
| b67_1_mcap_momentum | 3 | 0.0% / 100.0% / 100.0% | 100.0pp | 100.0pp | 0.0pp | 1 | NO |
| b67_2_phase_preference | 7 | 50.0% / 50.0% / 100.0% | 50.0pp | 50.0pp | 0.0pp | 2 | NO |
| b67_4_outcome_feedback | 805 | 19.4% / 12.3% / 23.4% | 4.0pp | 0.7pp | 3.4pp | 268 | YES |
| b68_1_multi_tf_agreement | 388 | 23.3% / 14.0% / 26.9% | 3.7pp | -4.8pp | 8.5pp | 129 | NO |
| b68_2_volume_regime | 735 | 19.6% / 11.8% / 24.5% | 4.9pp | 0.8pp | 4.1pp | 245 | YES |
| b68_3_pair_correlation | 736 | 20.0% / 12.2% / 24.0% | 4.0pp | 0.3pp | 3.7pp | 245 | YES |
| b68_4_regime_age | 814 | 19.6% / 12.5% / 24.6% | 5.1pp | 2.1pp | 2.9pp | 271 | YES |
| b68_5_path_b_sustainability | 736 | 17.1% / 13.1% / 21.1% | 4.0pp | 8.1pp | -4.1pp | 245 | YES |

## Per-factor comparison (B76 filter NOT applied — what the CLI currently does)

| Factor | n | CLI low/mid/high WR | Real spread | Alt spread | Lift | p-value | Mean |Δconf| | Verdict |
|---|---:|---|---:|---:|---:|---:|---:|---|
| b67_1_btc_dominance | 854 | 17.3% / 13.3% / 22.8% | 5.6pp | 4.1pp | 1.4pp | 0.0980 | 0.0088 | **INCONCLUSIVE** |
| b67_1_funding_rates | 853 | 18.3% / 12.3% / 22.8% | 4.5pp | 4.5pp | 0.0pp | 0.1845 | 0.0072 | **INCONCLUSIVE** |
| b67_1_mcap_momentum | 852 | 18.0% / 12.7% / 22.5% | 4.6pp | 4.6pp | 0.0pp | 0.1746 | 0.0016 | **INCONCLUSIVE** |
| b67_2_phase_preference | 820 | 16.8% / 13.2% / 23.0% | 6.1pp | 7.2pp | -1.1pp | 0.0721 | 0.0030 | **INCONCLUSIVE** |
| b67_4_outcome_feedback | 805 | 19.0% / 13.1% / 23.0% | 4.0pp | 0.3pp | 3.7pp | 0.2533 | 0.0202 | **INCONCLUSIVE** |
| b68_1_multi_tf_agreement | 388 | 24.8% / 11.6% / 27.7% | 2.9pp | -4.8pp | 7.7pp | 0.5976 | 0.0202 | **INCONCLUSIVE** |
| b68_2_volume_regime | 735 | 19.6% / 12.2% / 24.1% | 4.5pp | 0.8pp | 3.7pp | 0.2290 | 0.0190 | **INCONCLUSIVE** |
| b68_3_pair_correlation | 736 | 20.0% / 12.2% / 24.0% | 4.0pp | 0.3pp | 3.7pp | 0.2866 | 0.0199 | **INCONCLUSIVE** |
| b68_4_regime_age | 814 | 19.6% / 12.9% / 24.3% | 4.7pp | 2.1pp | 2.6pp | 0.1849 | 0.0149 | **INCONCLUSIVE** |
| b68_5_path_b_sustainability | 736 | 16.7% / 13.5% / 21.1% | 4.4pp | 8.1pp | -3.7pp | 0.2131 | 0.4456 | **INCONCLUSIVE** |

## Pre-drain vs post-drain confidence-shift comparison

Same top-table metrics computed on (a) pre-drain rows only (cron-replayed, what Kyle saw before the stall) vs (b) post-drain rows only (the 13,830 newly-matched + 19,219 unreplayable rows from B-NEW-33). Looks at whether the data character changed during the stall window.

| Factor | Pre n | Post n | Pre avg abs shift | Post avg abs shift | Pre max abs | Post max abs | Δ avg abs shift |
|---|---:|---:|---:|---:|---:|---:|---:|
| b67_1_btc_dominance | 4 | 1794 | 0.0212 | 0.0181 | 0.0370 | 0.1958 | -0.0031 |
| b67_1_funding_rates | 4 | 1794 | 0.0213 | 0.0116 | 0.0449 | 0.1672 | -0.0098 |
| b67_1_mcap_momentum | 3 | 1795 | 0.0015 | 0.0014 | 0.0024 | 0.1307 | -0.0001 |
| b67_2_phase_preference | 7 | 1725 | 0.0219 | 0.0241 | 0.0353 | 0.0827 | +0.0021 |
| b67_4_outcome_feedback | 805 | 3332 | 0.0202 | 0.0144 | 0.1001 | 0.1133 | -0.0057 |
| b68_1_multi_tf_agreement | 388 | 3152 | 0.0202 | 0.0133 | 0.1396 | 0.1363 | -0.0070 |
| b68_2_volume_regime | 735 | 3272 | 0.0190 | 0.0118 | 0.1001 | 0.1133 | -0.0072 |
| b68_3_pair_correlation | 736 | 3262 | 0.0199 | 0.0146 | 0.1079 | 0.1082 | -0.0052 |
| b68_4_regime_age | 814 | 3323 | 0.0149 | 0.0162 | 0.0646 | 0.0731 | +0.0013 |
| b68_5_path_b_sustainability | 736 | 3229 | 0.4456 | 0.4338 | 0.9526 | 0.8451 | -0.0118 |

**Interpretation guide:**
- If Δ avg abs shift is near zero across the board → confidence-shift character is stable; the all-INCONCLUSIVE verdict is about TERTILE WR, not lever activity.
- If Δ is large for some factors → factor producers may have changed behavior during the stall window. Worth investigating before re-running B-NEW-33.
- If "post avg abs shift" is much smaller than "pre" for the levers Kyle remembered as active → the recent two weeks have a structurally different confidence signal.

## Methodology delta analysis

Two known differences between the existing aggregator and the B-NEW-33 CLI:

1. **B76 frozen-factor filter.** The aggregator excludes pre-B76 rows for `b67_1_*` and `b67_2_phase_*` factors via `calibrationFrameworkVersion = "b76_chain_final"` predicate (drift-dashboard-aggregator.ts:1063-1069). The B-NEW-33 CLI does NOT apply this filter. Impact: for the 6 affected factor_names, the CLI may include pre-B76 structurally-biased rows that dilute spreads toward zero.

2. **Unreplayable-row inclusion in WR denominator.** The aggregator includes ALL `replay_completed_at IS NOT NULL` rows (including `unreplayable_real_rejected`) and counts them as zero-win contributions in tertile WR. The B-NEW-33 CLI excludes unreplayable rows from analysis. Pre-drain: no unreplayable rows exist (cron left unmatched as pending) so this delta is invisible in THIS comparison. Post-drain: 19,219 unreplayable rows exist and would dilute the aggregator's WR figures.

## Interpretation

Compare the two tables above:
- If the per-factor spreads are IDENTICAL between the B76-filtered and unfiltered tables for the SIX b67_1_* / b67_2_phase_* factors: the B76 filter has no impact on pre-drain data (rows are already all b76_chain_final).
- If they DIFFER: the CLI was including pre-B76 contamination, and re-running B-NEW-33 with the B76 filter applied would produce different verdicts.
- For the OTHER 4 factors (b67_4, b68_1-5): the B76 filter does not apply; the two methods should produce identical real/alt spreads. Differences would indicate a deeper tertile-bucketing or sort-stability bug.

## Recommendation

- Re-run the B-NEW-33 verdict pipeline with the B76 filter applied (mirroring the existing aggregator).
- Compare verdicts: if the all-INCONCLUSIVE outcome persists, the upstream-artifact hypothesis (B-NEW-36) stands.
- If the post-fix verdicts show some KEEP/DROP factors that match what Kyle observed pre-stall, then B67.5 design proceeds with the corrected CLI output.