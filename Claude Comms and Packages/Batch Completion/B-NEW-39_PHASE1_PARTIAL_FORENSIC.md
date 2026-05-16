# B-NEW-37 — Confidence-Inversion Forensic Findings

**Run timestamp:** 2026-05-16T04:19:58.595Z
**Asset class:** crypto_spot
**Source:** `regime_factor_alternates` post-B-NEW-33-drain

## PHASE 1 — Pre vs Post Modulation WR Comparison (HALT GATE)

- Pre-modulation (`predictiveConfidenceRaw`) decile shape: **flat**
- Post-modulation (`real_decision.confidence`) decile shape: **flat**

## PHASE 2 — Per-Modulator Factor × Outcome

| Lever | won n | lost n | won_mean_factor | lost_mean_factor | ratio | MW-U p | Verdict |
|---|---:|---:|---:|---:|---:|---:|---|
| b67_2_phase_preference | 0 | 0 | N/A | N/A | N/A | N/A | **inconclusive** |
| b67_4_outcome_feedback | 0 | 0 | N/A | N/A | N/A | N/A | **inconclusive** |
| b68_1_multi_tf_agreement | 0 | 0 | N/A | N/A | N/A | N/A | **inconclusive** |
| b68_2_volume_regime | 0 | 0 | N/A | N/A | N/A | N/A | **inconclusive** |
| b68_3_pair_correlation | 0 | 0 | N/A | N/A | N/A | N/A | **inconclusive** |
| b68_4_regime_age | 0 | 0 | N/A | N/A | N/A | N/A | **inconclusive** |

No lever shows ratio<1.0 + p<0.05 — no single modulator is the obvious culprit.

## PHASE 3 — b68_5 Path-B Sustainability (Label Counterfactual)

- Winners: n=0, mean Δconf (real - alt) = N/A
- Losers: n=0, mean Δconf = N/A
- MW-U p-value (winner-deltas vs loser-deltas): N/A
- **Scenario: inconclusive**

## PHASE 4 — Floor-Clamp Analysis

- % of trades pinned at conf = 0.200: **0.0%** (n_pinned=0, n_free=3)
- Pinned-trades WR: **0.0%**
- Free-trades WR: **0.0%**

Floor is roughly neutral on WR — not the primary inversion driver.

**0.20 floor source:** grep for `confidenceFloor`, `MIN_CONFIDENCE`, `Math.max(.*0.2` in `server/services/` deferred to follow-up per Langston Q5 if Phase 4 evidence is sufficient on its own.

## PHASE 5 — Legacy vs b76 Cohort Comparison

- **Legacy** (n=0, overall WR=0.0%): shape = flat
- **b76** (n=3, overall WR=0.0%): shape = flat

### Legacy decile table

_(insufficient data)_

### b76 decile table

_(insufficient data)_

## PHASE 6 — Per-Lever DISABLE Test

For each lever, computes what decile WR would be using `alt_conf` (which represents the chain with this single lever disabled).

| Lever | alt shape | alt top WR | alt bottom WR | real top WR | real bot WR | resolves? |
|---|---|---:|---:|---:|---:|---|

## PHASE 7 — Fix Proposal

**No single-lever resolver identified.** Phase 2 + Phase 6 do not pinpoint a sign-flipped modulator. Possible causes:
- Multi-lever interaction effect (no single lever owns the inversion)
- Inversion driven by pre-modulation upstream signal (Phase 1 should have caught this; re-check)
- Floor-clamping mechanic creating artificial inversion at the top decile

**Recommended next step:** Open B-NEW-39 for multi-lever-interaction analysis or raw-classifier forensics depending on Phase 1 + Phase 4 evidence.
