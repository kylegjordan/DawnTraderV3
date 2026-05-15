# B-NEW-36 — Cohort Diagnostic Report

**Run timestamp:** 2026-05-15T21:45:57.541Z
**Cohort:** crypto_spot, 40642 rows total (21423 matched, 19219 unmatched)
**Pre-stall cutoff:** 2026-05-15

## PHASE 1 — Framework-version split (Langston A1)

Hypothesis: pre-stall cohort dominated by legacy framework; post-stall by mix of b76 + legacy. Framework version may be the dominant upstream artifact.

- **b76_chain_final** — n=8926, WR=25.4%, shape: **undefined**
- **Legacy** — n=12497, WR=18.3%, shape: **u-shape (mid-dip)**

### Decile shape: b76_chain_final

| Decile | n | conf range | WR |
|---:|---:|---|---:|
| 1 | 892 | 0.200–0.200 | 35.3% |
| 2 | 893 | 0.200–0.210 | 40.5% |
| 3 | 892 | 0.210–0.240 | 33.2% |
| 4 | 893 | 0.240–0.259 | 35.3% |
| 5 | 893 | 0.259–0.295 | 32.3% |
| 6 | 892 | 0.295–0.324 | 20.0% |
| 7 | 893 | 0.324–0.359 | 20.2% |
| 8 | 892 | 0.359–0.422 | 19.5% |
| 9 | 893 | 0.422–0.493 | 6.7% |
| 10 | 893 | 0.493–0.839 | 11.2% |

### Decile shape: Legacy

| Decile | n | conf range | WR |
|---:|---:|---|---:|
| 1 | 1249 | 0.047–0.144 | 36.2% |
| 2 | 1250 | 0.144–0.149 | 13.1% |
| 3 | 1250 | 0.149–0.150 | 19.2% |
| 4 | 1249 | 0.150–0.151 | 15.0% |
| 5 | 1250 | 0.151–0.157 | 8.1% |
| 6 | 1250 | 0.157–0.159 | 9.0% |
| 7 | 1249 | 0.159–0.175 | 16.8% |
| 8 | 1250 | 0.175–0.222 | 20.4% |
| 9 | 1250 | 0.222–0.266 | 18.9% |
| 10 | 1250 | 0.266–0.953 | 26.6% |

## PHASE 2 — Cohort × framework × shape (the source of the "shape flip")

| Cell | matched n | WR % | shape |
|---|---:|---:|---|
| pre-stall LEGACY | 7544 | 17.8% | u-shape (mid-dip) |
| pre-stall b76 | 49 | 83.7% | undefined |
| post-stall LEGACY | 4953 | 19.1% | u-shape (mid-dip) |
| post-stall b76 | 8877 | 25.1% | undefined |

## PHASE 3 — Stratified decile shapes (b76 cohort only — control for framework)

Decomposing the b76_chain_final subset by other dimensions. Strata with n<150 flagged; strata with n<75 dropped (Langston Q1).

### Stratification: sourcePool

| Stratum | n | WR % | shape | decision-grade? |
|---|---:|---:|---|---|
| quant-strong_trend | 5882 | 33.0% | undefined | ✓ |
| quant-reversal | 1700 | 9.8% | inverted-u (mid-peak) | ✓ |
| quant-trend | 840 | 15.5% | undefined | ✓ |
| pattern | 484 | 6.2% | u-shape (mid-dip) | ✓ |

### Stratification: regimeLabel

| Stratum | n | WR % | shape | decision-grade? |
|---|---:|---:|---|---|
| TREND_FRIENDLY_STABLE | 5490 | 32.3% | undefined | ✓ |
| RANGE_BOUND_STABLE | 1658 | 7.6% | inverted-u (mid-peak) | ✓ |
| STRUCTURAL_TRANSITION | 870 | 10.3% | inverted-u (mid-peak) | ✓ |
| IMPULSE_EXPANSION | 768 | 34.9% | monotonic-down | ✓ |
| HIGH_VOLATILITY_UNSTABLE | 140 | 7.1% | monotonic-up | — (need 150+) |

### Stratification: phase

| Stratum | n | WR % | shape | decision-grade? |
|---|---:|---:|---|---|
| EARLY | 4398 | 20.1% | undefined | ✓ |
| PRIME | 2344 | 25.1% | undefined | ✓ |
| LATE | 2184 | 36.4% | monotonic-down | ✓ |

### Stratification: strategy

| Stratum | n | WR % | shape | decision-grade? |
|---|---:|---:|---|---|
| strong_bull_trend | 5514 | 33.4% | monotonic-down | ✓ |
| range_trade | 1164 | 8.2% | inverted-u (mid-peak) | ✓ |
| morning_star | 904 | 14.4% | inverted-u (mid-peak) | ✓ |
| vwap_pullback | 556 | 28.8% | undefined | ✓ |
| reverse_impulse | 354 | 5.6% | u-shape (mid-dip) | ✓ |
| support_bounce | 324 | 6.2% | monotonic-up | ✓ |

## PHASE 4 — Unmatched-row audit (Langston A2 — side-by-side + chi-square)

Total unmatched (unreplayable_real_rejected): **19219**

### strategy

| Bucket | Matched | Unmatched | Total | Unmatched % |
|---|---:|---:|---:|---:|
| strong_bull_trend | 14985 | 12235 | 27220 | 44.9% |
| vwap_pullback | 2528 | 4719 | 7247 | 65.1% |
| range_trade | 1588 | 840 | 2428 | 34.6% |
| morning_star | 1253 | 855 | 2108 | 40.6% |
| reverse_impulse | 450 | 269 | 719 | 37.4% |
| support_bounce | 435 | 131 | 566 | 23.1% |
| volatility_edge | 66 | 108 | 174 | 62.1% |
| pivot_shift | 78 | 20 | 98 | 20.4% |
| defensive_hedge | 30 | 32 | 62 | 51.6% |
| mean_reversion | 10 | 10 | 20 | 50.0% |

χ² test of independence (matched-status × strategy): χ²=1383.7, df=8, **p=0.00e+0** — *** highly significant skew

### sourcePool

| Bucket | Matched | Unmatched | Total | Unmatched % |
|---|---:|---:|---:|---:|
| quant-strong_trend | 17011 | 16324 | 33335 | 49.0% |
| quant-reversal | 2330 | 1288 | 3618 | 35.6% |
| quant-trend | 1347 | 1069 | 2416 | 44.2% |
| pattern | 715 | 538 | 1253 | 42.9% |
| quant-oscillator | 20 | 0 | 20 | 0.0% |

χ² test of independence (matched-status × sourcePool): χ²=254.6, df=3, **p=0.00e+0** — *** highly significant skew

### regimeLabel

| Bucket | Matched | Unmatched | Total | Unmatched % |
|---|---:|---:|---:|---:|
| TREND_FRIENDLY_STABLE | 15876 | 15726 | 31602 | 49.8% |
| RANGE_BOUND_STABLE | 2231 | 1208 | 3439 | 35.1% |
| IMPULSE_EXPANSION | 1947 | 1418 | 3365 | 42.1% |
| STRUCTURAL_TRANSITION | 1141 | 717 | 1858 | 38.6% |
| HIGH_VOLATILITY_UNSTABLE | 228 | 150 | 378 | 39.7% |

χ² test of independence (matched-status × regimeLabel): χ²=382.6, df=4, **p=0.00e+0** — *** highly significant skew

### phase

| Bucket | Matched | Unmatched | Total | Unmatched % |
|---|---:|---:|---:|---:|
| (null) | 0 | 19219 | 19219 | 100.0% |
| EARLY | 9280 | 0 | 9280 | 0.0% |
| PRIME | 6510 | 0 | 6510 | 0.0% |
| LATE | 5633 | 0 | 5633 | 0.0% |

χ² test of independence (matched-status × phase): χ²=40642.0, df=3, **p=0.00e+0** — *** highly significant skew

### framework_version

| Bucket | Matched | Unmatched | Total | Unmatched % |
|---|---:|---:|---:|---:|
| legacy | 12497 | 10297 | 22794 | 45.2% |
| b76 | 8926 | 8922 | 17848 | 50.0% |

χ² test of independence (matched-status × framework_version): χ²=93.1, df=1, **p=0.00e+0** — *** highly significant skew

### symbol (top 15)

| Bucket | Matched | Unmatched | Total | Unmatched % |
|---|---:|---:|---:|---:|
| XMR/USD | 315 | 151 | 466 | 32.4% |
| SPX/USD | 281 | 134 | 415 | 32.3% |
| DOT/USD | 238 | 170 | 408 | 41.7% |
| XMR/USDT | 277 | 123 | 400 | 30.8% |
| SUI/EUR | 208 | 178 | 386 | 46.1% |
| RENDER/USD | 133 | 228 | 361 | 63.2% |
| FET/USD | 127 | 231 | 358 | 64.5% |
| CRV/USD | 191 | 163 | 354 | 46.0% |
| ALGO/USD | 98 | 195 | 293 | 66.6% |
| TAO/USD | 182 | 109 | 291 | 37.5% |
| SUI/USD | 150 | 140 | 290 | 48.3% |
| TAO/EUR | 198 | 86 | 284 | 30.3% |
| TON/USD | 168 | 108 | 276 | 39.1% |
| AAVE/USD | 136 | 140 | 276 | 50.7% |
| ONDO/USD | 175 | 95 | 270 | 35.2% |

χ² test of independence (matched-status × symbol (top 15)): χ²=300.0, df=14, **p=0.00e+0** — *** highly significant skew

### hour-of-day

| Bucket | Matched | Unmatched | Total | Unmatched % |
|---|---:|---:|---:|---:|
| 21:00 UTC | 893 | 3470 | 4363 | 79.5% |
| 22:00 UTC | 1136 | 1810 | 2946 | 61.4% |
| 12:00 UTC | 1017 | 1341 | 2358 | 56.9% |
| 13:00 UTC | 1195 | 1116 | 2311 | 48.3% |
| 15:00 UTC | 879 | 972 | 1851 | 52.5% |
| 16:00 UTC | 794 | 948 | 1742 | 54.4% |
| 17:00 UTC | 800 | 870 | 1670 | 52.1% |
| 20:00 UTC | 550 | 1115 | 1665 | 67.0% |
| 10:00 UTC | 1024 | 623 | 1647 | 37.8% |
| 14:00 UTC | 897 | 732 | 1629 | 44.9% |
| 04:00 UTC | 1145 | 384 | 1529 | 25.1% |
| 07:00 UTC | 1088 | 426 | 1514 | 28.1% |
| 03:00 UTC | 1108 | 331 | 1439 | 23.0% |
| 01:00 UTC | 951 | 482 | 1433 | 33.6% |
| 19:00 UTC | 761 | 644 | 1405 | 45.8% |

χ² test of independence (matched-status × hour-of-day): χ²=3270.1, df=14, **p=0.00e+0** — *** highly significant skew

### day-of-week

| Bucket | Matched | Unmatched | Total | Unmatched % |
|---|---:|---:|---:|---:|
| Tue | 3724 | 4450 | 8174 | 54.4% |
| Wed | 4426 | 2926 | 7352 | 39.8% |
| Fri | 1848 | 4074 | 5922 | 68.8% |
| Sat | 3175 | 2613 | 5788 | 45.1% |
| Mon | 3562 | 1180 | 4742 | 24.9% |
| Thu | 1316 | 3086 | 4402 | 70.1% |
| Sun | 3372 | 890 | 4262 | 20.9% |

χ² test of independence (matched-status × day-of-week): χ²=4509.2, df=6, **p=0.00e+0** — *** highly significant skew

## PHASE 5 — Decision rule (Langston A3 — pre-committed before Step 8)

**Decision rule outcome: C — non-monotonicity PERSISTS across framework + sourcePool stratification.**

Hypothesis A (base confidence distribution has non-monotonic relationship with outcome) is alive. Recommend sub-cohort approach: re-run B-NEW-33 on the cleanest single (framework, regime, sourcePool, post-stall) cell with adequate n.

Primary candidate cell: framework=b76, regime=TREND_FRIENDLY_STABLE, sourcePool=quant-strong_trend, post-stall. Expected n>2000.

## PHASE 6 — Parity check vs existing aggregator (Langston A4)

Decile WRs collapsed to tertiles should match the existing `computeFactorCalibration` aggregator output for the same cohort. This validates that the diagnostic and the live UI are reading the same data with the same predicates.

Diagnostic tertile WRs for b67_4_outcome_feedback (n=2192): low=17.3% / mid=25.7% / high=20.4%
Cross-check against `/api/analytics/factor-calibration?window=rolling_30d` for `b67_4_outcome_feedback` — values should match to within rounding.

## VERDICT

- Pre-stall cohort: 99.4% LEGACY framework (n=7544); shape: **u-shape (mid-dip)**
- Post-stall b76 cohort: shape: **undefined**
- Unmatched audit chi-square: see Phase 4 — strategy and sourcePool likely show highly significant skew, confirming Hypothesis B (selection bias)

See Phase 5 for the concrete recommendation on the B-NEW-33 re-run path.
