# B.4 foundation — Regime-Label PARITY REPORT (EXIT GATE)

> Langston's #1 binding condition: diff the OLD-60m vs NEW-15m regime labels over the same history; acceptance = "shift understood AND intended." Per-strategy re-tuning + activation are HELD until this is signed off. Engine `scripts/b4-regime-parity.ts` (reuses `b4-regime-recalib-study.ts`). Read-only. 485 sym / 34 days. **VERDICT: PASS** (pending Langston sign-off).

## §1 — Three-way regime mix (Langston-specified baselines)
| Regime | (1) live-60m | (2) clean-60m, CURRENT thresholds | (3) clean-15m, NEW thresholds |
|---|---|---|---|
| TREND_FRIENDLY_STABLE | 43.31% (2,284,829) | 25.13% (25,638) | 25.20% (75,938) |
| STRUCTURAL_TRANSITION | 34.45% (1,817,862) | 31.54% (32,176) | 30.69% (92,507) |
| HIGH_VOLATILITY_UNSTABLE | 16.45% (868,023) | 21.07% (21,493) | 20.66% (62,277) |
| IMPULSE_EXPANSION | 5.74% (303,008) | 15.55% (15,869) | 16.86% (50,804) |
| RANGE_BOUND_STABLE | 0.04% (2,357) | 6.72% (6,853) | 6.59% (19,858) |
| TOTAL N | 5,276,079 | 102,029 | 301,384 |

## §2 — EXIT-GATE BASIS: (2)→(3) PURE bar-size effect (clean-vs-clean, apples-to-apples)
**Max |Δpp| = 1.30pp.** TFS +0.07, ST −0.84, HVU −0.40, IE +1.30, RBS −0.13. With the recalibrated thresholds, the 15-minute regime mix sits essentially ON TOP of the clean-60m mix. **No collapse, no silent meaning-shift — the bar-size change is neutral on the regime distribution once the thresholds are recalibrated. This is the "shift understood AND intended" the exit gate requires: the shift is ~0.**

## §3 — Collapse-fix proof (NEW thresholds vs the uncorrected 15m collapse)
The recalibration study showed that leaving the OLD 60m thresholds on 15m bars would collapse the mix (STRUCTURAL_TRANSITION → 51.2%). The NEW thresholds fix it:
| Regime | 15m, OLD thresholds (collapse) | 15m, NEW thresholds (3) | Δ |
|---|---|---|---|
| STRUCTURAL_TRANSITION | 51.2% | 30.69% | **−20.51pp (collapse removed)** |
| HIGH_VOLATILITY_UNSTABLE | 4.9% | 20.66% | +15.76 |
| IMPULSE_EXPANSION | 5.4% | 16.86% | +11.46 |
| TREND_FRIENDLY_STABLE | 29.2% | 25.20% | −4.00 |
| RANGE_BOUND_STABLE | 9.3% | 6.59% | −2.71 |

## §4 — Stability: regime-flip rate
clean-60m CURRENT 18.94% (19,231/101,545) → clean-15m NEW **9.75%** (29,335/300,907). The recalibrated 15m read is MORE stable per-bar-transition than the 60m — confirming the W1 thesis that the earlier high 15m flip-rate was a bar-count-lookback artifact removed by time-anchoring. (Per-consecutive-bar proxy on a saturated trailing window — reads lower than W1's directional 3-bar proxy ~37%/34%; different measure, directional confirmation only.)

## §5 — The (1)→(2) substrate gap (context, NOT the gate basis)
Live-60m (1) is much more TFS-heavy (43% vs clean 25%) with near-zero RANGE_BOUND (0.04%) + IMPULSE. Driver: (1) is `signal_eval_archive.regime_label` — per-signal-DECISION events (decision-weighted by scanner activity) on the live SNAPSHOT substrate + the forming-bar mechanism — NOT a uniform per-bar log. (2)/(3) are uniform per-bar on the clean 1m-rebuild. So (1) and (2) are not apples-to-apples; the gate correctly rests on (2)→(3). **The live RANGE_BOUND≈0.04% independently confirms the EV-leakage item (live forming-bar starves the range-strategy family) — tracked SEPARATELY, not a B.4 blocker.** Substrate is CLEAN post-B-NEW-35 (UNIQUE constraint, 0 dup keys, max 1 row/key), so the clean anchor matches the live feed the 15m classifier will read.

## §6 — Verdict + the 14 finalized thresholds (written to `regime-thresholds.ts`)
**PASS — the regime-label shift from the bar-size change is ≤1.3pp (essentially zero) on the apples-to-apples basis, and the recalibrated thresholds remove the collapse. Shift understood + intended.** Method: percentile-preserving (Langston-approved) + CALIBRATION-LENS rounding.
| const | 60m (old) | 15m (new) |
|---|---|---|
| RBS_VOL_MAX | 0.006 | 0.0037 |
| RBS_DX_MAX | 35 | 17 |
| RBS_DBS_MAX | 0.10 | 0.16 |
| IE_VOL_MIN_PATH_A | 0.010 | 0.0059 |
| IE_DX_MIN_PATH_A | 40 | 19 |
| IE_VOL_MIN_PATH_B | 0.0075 | 0.0045 |
| IE_DBS_STRONG | 0.50 | 0.51 |
| TFS_MOM_MIN_PATH_A | 0.0015 | 0.0024 |
| TFS_DX_MIN | 35 | 17 |
| TFS_DBS_MODERATE | 0.30 | 0.35 |
| HVU_VOL_MIN | 0.0075 | 0.0045 |
| HVU_MOM_NEG_PATH_A | −0.0015 | −0.0010 |
| HVU_DX_STRONG | 45 | 22 |
| HVU_MOM_NEG_PATH_B | −0.0025 | −0.0021 |

## §7 — Open / next (NOT part of this regime-label gate)
- **VN/DI re-derivation** (screener_filters, bar-sensitive IMF screens) — still pending, same replay method.
- **Responsiveness backlog** (Langston Q2): confirm 15m steadiness is not sluggishness (192-bar=48h DBS) — does it still catch real transitions promptly.
- **Activation** (gated on this sign-off): DBS recompute run + scanner→15m + ORB enable + deploy + §9.3 UI verify.

*Engine `scripts/b4-regime-parity.ts`; full output `/tmp/b4_regime_parity.txt`. Active trading OFF — forward proxy; Phase-19 paper-active is the final arbiter.*
