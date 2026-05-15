# B-NEW-37 — Confidence-Inversion Forensic Findings

**Run timestamp:** 2026-05-15T22:20:51.225Z
**Asset class:** crypto_spot
**Source:** `regime_factor_alternates` post-B-NEW-33-drain

## PHASE 1 — Pre vs Post Modulation WR Comparison (HALT GATE)

- Pre-modulation (`predictiveConfidenceRaw`) decile shape: **u-shape**
- Post-modulation (`real_decision.confidence`) decile shape: **mixed**

## PHASE 2 — Per-Modulator Factor × Outcome

| Lever | won n | lost n | won_mean_factor | lost_mean_factor | ratio | MW-U p | Verdict |
|---|---:|---:|---:|---:|---:|---:|---|
| b67_2_phase_preference | 222 | 241 | 0.9818 | 0.9759 | 1.006 | 4.62e-1 | **inert** |
| b67_4_outcome_feedback | 228 | 251 | 1.0228 | 1.0180 | 1.005 | 6.98e-3 | **correct sign** |
| b68_1_multi_tf_agreement | 228 | 251 | 1.0221 | 1.0155 | 1.007 | 1.99e-2 | **correct sign** |
| b68_2_volume_regime | 228 | 251 | 1.0111 | 1.0111 | 1.000 | 8.75e-1 | **inert** |
| b68_3_pair_correlation | 228 | 251 | 1.0328 | 1.0340 | 0.999 | 1.08e-1 | **inert** |
| b68_4_regime_age | 228 | 251 | 0.9954 | 1.0047 | 0.991 | 1.73e-1 | **inert** |

No lever shows ratio<1.0 + p<0.05 — no single modulator is the obvious culprit.

## PHASE 3 — b68_5 Path-B Sustainability (Label Counterfactual)

- Winners: n=222, mean Δconf (real - alt) = -0.4058
- Losers: n=241, mean Δconf = -0.3914
- MW-U p-value (winner-deltas vs loser-deltas): 9.41e-2
- **Scenario: B: uniform-too-aggressive**

## PHASE 4 — Floor-Clamp Analysis

- % of trades pinned at conf = 0.200: **15.4%** (n_pinned=139, n_free=762)
- Pinned-trades WR: **34.5%**
- Free-trades WR: **23.6%**

**The 0.20 floor is concentrating winners** (pinned WR 34.5% > free WR 23.6%). The floor mechanic is FIGHTING the chain — high-WR trades being clamped down to the floor while low-WR free-floating trades drift higher. This is a major contributor to the inversion.

**0.20 floor source:** grep for `confidenceFloor`, `MIN_CONFIDENCE`, `Math.max(.*0.2` in `server/services/` deferred to follow-up per Langston Q5 if Phase 4 evidence is sufficient on its own.

## PHASE 5 — Legacy vs b76 Cohort Comparison

- **Legacy** (n=0, overall WR=0.0%): shape = flat
- **b76** (n=901, overall WR=25.3%): shape = mixed

### Legacy decile table

_(insufficient data)_

### b76 decile table

| Decile | n | conf range | WR |
|---:|---:|---|---:|
| 1 | 90 | 0.200–0.200 | 47.8% |
| 2 | 90 | 0.200–0.210 | 27.8% |
| 3 | 90 | 0.210–0.240 | 33.3% |
| 4 | 90 | 0.240–0.259 | 34.4% |
| 5 | 90 | 0.259–0.295 | 32.2% |
| 6 | 90 | 0.295–0.324 | 20.0% |
| 7 | 90 | 0.324–0.359 | 20.0% |
| 8 | 90 | 0.360–0.421 | 20.0% |
| 9 | 90 | 0.421–0.493 | 6.7% |
| 10 | 91 | 0.493–0.839 | 11.0% |

## PHASE 6 — Per-Lever DISABLE Test

For each lever, computes what decile WR would be using `alt_conf` (which represents the chain with this single lever disabled).

| Lever | alt shape | alt top WR | alt bottom WR | real top WR | real bot WR | resolves? |
|---|---|---:|---:|---:|---:|---|
| b67_2_phase_preference | monotonic-down | 11.6% | 22.4% | 11.6% | 44.7% | no |
| b67_4_outcome_feedback | mixed | 11.0% | 56.7% | 11.0% | 47.8% | no |
| b68_1_multi_tf_agreement | mixed | 11.0% | 51.1% | 11.0% | 50.0% | no |
| b68_2_volume_regime | mixed | 11.0% | 36.7% | 11.0% | 50.0% | no |
| b68_3_pair_correlation | mixed | 11.0% | 37.8% | 11.0% | 46.7% | no |
| b68_4_regime_age | mixed | 14.3% | 25.6% | 11.0% | 45.6% | no |

## PHASE 7 — Fix Proposal

**No single-lever resolver identified.** Phase 2 + Phase 6 do not pinpoint a sign-flipped modulator. Possible causes:
- Multi-lever interaction effect (no single lever owns the inversion)
- Inversion driven by pre-modulation upstream signal (Phase 1 should have caught this; re-check)
- Floor-clamping mechanic creating artificial inversion at the top decile

**Recommended next step:** Open B-NEW-39 for multi-lever-interaction analysis or raw-classifier forensics depending on Phase 1 + Phase 4 evidence.
