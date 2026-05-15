# B-NEW-33 — Crypto Factor Calibration Verdicts

**Asset class:** crypto_spot
**Run timestamp:** 2026-05-15T15:42:16.309Z
**Decision-grade gates:** n ≥ 150 per tertile bucket AND |spread| ≥ 7pp AND p < 0.05

## Drain stats (Phase 1)
- Pending rows processed: **33049**
- Matched (replay outcome computed): **13830**
- Unmatched (marked unreplayable_real_rejected): **19219**

## Per-factor verdicts

| Factor | n | Real WR tertiles (low/mid/high) | Real spread | Alt spread | Lift | p-value | Mean |Δconf| | Verdict | Reason |
|---|---:|---|---:|---:|---:|---:|---:|---|---|
| b67_1_btc_dominance | 2250 | 16.8% / 25.3% / 20.8% | 4.0pp | 2.5pp | 1.5pp | 0.0474 | 0.0127 | **INCONCLUSIVE** | real spread 4.0pp < 7pp (no monotonic signal) |
| b67_1_funding_rates | 2250 | 16.8% / 25.3% / 20.8% | 4.0pp | 3.5pp | 0.5pp | 0.0474 | 0.0084 | **INCONCLUSIVE** | lever effectively dormant (mean abs confidence shift 0.0084 < 0.01) |
| b67_1_mcap_momentum | 2250 | 16.7% / 25.6% / 20.7% | 4.0pp | 3.7pp | 0.3pp | 0.0468 | 0.0013 | **INCONCLUSIVE** | lever effectively dormant (mean abs confidence shift 0.0013 < 0.01) |
| b67_2_phase_preference | 2138 | 16.6% / 26.1% / 20.8% | 4.2pp | 1.8pp | 2.4pp | 0.0427 | 0.0146 | **INCONCLUSIVE** | real spread 4.2pp < 7pp (no monotonic signal) |
| b67_4_outcome_feedback | 2192 | 17.3% / 25.7% / 20.4% | 3.1pp | 0.5pp | 2.6pp | 0.1268 | 0.0160 | **INCONCLUSIVE** | real spread 3.1pp < 7pp (no monotonic signal) |
| b68_1_multi_tf_agreement | 1802 | 18.5% / 30.3% / 19.5% | 1.0pp | -0.0pp | 1.0pp | 0.6690 | 0.0145 | **INCONCLUSIVE** | real spread 1.0pp < 7pp (no monotonic signal) |
| b68_2_volume_regime | 2134 | 17.6% / 25.7% / 20.6% | 3.1pp | 1.2pp | 1.8pp | 0.1415 | 0.0136 | **INCONCLUSIVE** | real spread 3.1pp < 7pp (no monotonic signal) |
| b68_3_pair_correlation | 2133 | 17.7% / 25.7% / 20.5% | 2.8pp | 1.7pp | 1.1pp | 0.1775 | 0.0162 | **INCONCLUSIVE** | real spread 2.8pp < 7pp (no monotonic signal) |
| b68_4_regime_age | 2192 | 17.1% / 25.7% / 20.5% | 3.4pp | 0.5pp | 2.9pp | 0.0968 | 0.0159 | **INCONCLUSIVE** | real spread 3.4pp < 7pp (no monotonic signal) |
| b68_5_path_b_sustainability | 2082 | 17.0% / 26.4% / 20.5% | 3.5pp | 9.5pp | -6.1pp | 0.0987 | 0.4291 | **INCONCLUSIVE** | real spread 3.5pp < 7pp (no monotonic signal) |

## Verdict summary
- **KEEP** (decision-grade ADD): 0 — (none)
- **DROP** (decision-grade REMOVE): 0 — (none)
- **INCONCLUSIVE**: 10 — b67_1_btc_dominance, b67_1_funding_rates, b67_1_mcap_momentum, b67_2_phase_preference, b67_4_outcome_feedback, b68_1_multi_tf_agreement, b68_2_volume_regime, b68_3_pair_correlation, b68_4_regime_age, b68_5_path_b_sustainability

## Next step
B67.5 consumer-gate design reads this report. KEEP factors get wired into the 7 consumer sites with chain-final confidence; DROP factors are removed from the modulation chain; INCONCLUSIVE factors stay shadow-only until more cohort data is available.
