# Confidence audit — PRELIMINARY: the current confidence score against outcomes on closed PAPER trades (2026-11-05, CC-A)

> Kyle's first ask under KD-30 (relayed by PM Claude 2026-11-05 ~11:25Z): before the audit, a preliminary calculation of the current confidence score against outcomes on ALL closed paper trades. **Preliminary — not decision-grade.** No batch, no plan row; the audit itself is placed by PM Claude.

## Object and population
- **Object:** `closed_trades.confidence` (decimal, 0-100 scale as stored) on paper trades, against `net_pnl_percent` (return after costs) and a win flag (`net_pnl > 0`).
- **Population:** `mode='paper'`, `closed_at IS NOT NULL`, `close_reason <> 'never_filled'` (a never-filled maker is not a trade) — **1,371 trades**, 2026-07-15 → 2026-11-05: crypto 591, xStock 780. Every row carries both a confidence and a net return (591/591, 780/780). Confidence ranges: crypto 40.85-86.52 (518 distinct values), xStock 29.68-71.30 (690 distinct).
- **Not yet established:** that this stored `confidence` is the SAME quantity as the VTS score measured anti-predictive in July (rho −0.045 on 12,058 VTS trades). That is the audit's first provenance question; this note does not assume it.

## Result
| slice | n | Spearman, confidence vs net return | correlation, confidence vs win | win rate |
|---|---|---|---|---|
| all paper | 1,371 | +0.122 | +0.072 (Pearson) | 33.1 % |
| crypto | 591 | +0.101 | −0.038 | 43.7 % |
| xStock | 780 | +0.195 | −0.150 | 25.1 % |

**By month (rank correlations within class and month):**
| class | month | n | vs net return | vs win | win rate |
|---|---|---|---|---|---|
| crypto | 2026-07 | 223 | −0.145 | −0.210 | 46.6 % |
| crypto | 2026-08 | 119 | −0.097 | −0.029 | 53.8 % |
| crypto | 2026-09 | 169 | +0.076 | −0.167 | 37.9 % |
| crypto | 2026-10 | 70 | +0.208 | +0.002 | 37.1 % |
| crypto | 2026-11 | 10 | +0.042 | — | 0 % |
| xStock | 2026-07 | 129 | +0.060 | +0.044 | 35.7 % |
| xStock | 2026-08 | 112 | −0.283 | −0.250 | 42.0 % |
| xStock | 2026-09 | 71 | +0.185 | −0.040 | 31.0 % |
| xStock | 2026-10 | 406 | +0.327 | −0.098 | 17.5 % |
| xStock | 2026-11 | 62 | +0.486 | −0.118 | 16.1 % |

**Quintiles, pooled (for shape only — the pooled set mixes two classes on different confidence scales):** win rate 32.4 / 26.6 / 30.3 / 32.5 / 43.8 % from lowest to highest confidence; average net return −0.62 / −1.54 / −0.07 / −0.25 / −0.46 %.

## Reading (hedged, because the numbers are)
1. **There is no stable relationship.** The sign against net return flips between months in both classes; against winning it is negative in 7 of the 9 months that have one.
2. **The pooled +0.12 is not evidence that paper confidence works.** It mixes two classes whose confidence scales and win rates differ (crypto sits higher on both), and it is dominated by xStock October-November (468 of 780 xStock trades), where high-confidence trades lost LESS per trade while winning LESS often — a pattern that points at trade geometry (stop and target distance) rather than at the score ranking good trades.
3. **The months straddle known regime-of-the-system changes** (price-side, fee and geometry batches; `ADJUSTMENT_FRAMEWORK` epoch rule 7 forbids pooling across a calibration epoch, and no `calibration_epoch` constant is set in `module_constants` today — the boundaries must be dated by deploy, which this note did not do).
⇒ **Preliminary answer to Kyle's question: paper does not show the score to be predictive. It is not clearly inverted either — it is unstable, and on the win/lose question it leans the wrong way.**

## What the audit must do with this
- Establish the provenance of `closed_trades.confidence` (what writes it, which stage of the confidence chain, whether paper and VTS store the same quantity).
- Split by strategy and by deploy-dated epoch before any conclusion; control for geometry (R-multiple, not raw return).
- Then the chicken-and-egg question Kyle posed: whether other calibration can proceed before confidence is fixed.

## Reproduce
Staging, read-only, as deploy: the two queries are recorded in the commit message of this file's commit.
