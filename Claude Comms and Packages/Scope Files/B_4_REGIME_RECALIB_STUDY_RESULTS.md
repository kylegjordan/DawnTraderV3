# B.4 foundation — 15-Minute Regime-Threshold Recalibration STUDY RESULTS (Phase-II)

> Read-only replay study (engine `scripts/b4-regime-recalib-study.ts`). Produces the distributions to re-center the 14 xStock regime thresholds for 15-minute bars + the regime-mix-shift demonstration + the parity inputs. Decision-grade (rolling/full distributions, rule #13; rates WITH raw counts). The candidate thresholds are percentile-preserving CANDIDATES — finals set with Langston + CALIBRATION-LENS judgment, then the joint-mix parity report = exit gate.

## §0 — Scale + method
- 3.69M 1m rows, 485 symbols, ~34 days (2026-04-30 → 2026-06-03). **60m: 101,838 bars** (484 sym); **15m: 300,951 bars** (477 sym). Bars rebuilt UNCAPPED from `xstock_spot_ohlc_1m` (direct epoch-bucket SQL; NOT the 240-cap cache aggregator). Production compute fns reused verbatim. 15m used the NEW per-class lookbacks (momentum 120, ADX 56, DBS 192/48-104, ATR 56, window 240, ≥192 prior); 60m used current production (30/14, DBS 48/12-26, ATR 14). Ran on staging against Supabase (the only place with the new per-class plumbing + DB reach).

## §1 — Headline: HOW the inputs scale 60m→15m
- **Volatility roughly HALVES** (median 0.00588 → 0.00359, ≈0.61×).
- **ADX/trend-strength COLLAPSES** (median 34.8 → 16.7, ≈0.48×).
- **Momentum near bar-size-INVARIANT** (same wall-clock lookback; median ≈0).
- **|DBS| near scale-INVARIANT** (median 0.282 → 0.341; thresholds barely move).
- **★ The 15m read is STEADIER, not jumpier: regime-flip 60m 18.96% → 15m 5.66%** (consecutive-same-bar proxy). This CONFIRMS the W1 thesis — the apparent 15m "jumpiness" was the bar-count-lookback artifact; time-anchoring the lookbacks fixed it. (Not directly comparable to W1's 37/34% directional-3-bar proxy — different measures.)

## §2 — Candidate thresholds (percentile-preserving: 60m-rank → 15m value; CANDIDATES, not finals)
| threshold | input | current (60m) | 60m %ile | candidate (15m) |
|---|---|---|---|---|
| RBS_VOL_MAX | vol | 0.006000 | 51.3% | **0.003663** |
| RBS_DX_MAX | adx | 35.00 | 50.3% | **16.81** |
| RBS_DBS_MAX | \|dbs\| | 0.1000 | 18.8% | **0.1615** |
| IE_VOL_MIN_PATH_A | vol | 0.010000 | 81.2% | **0.005916** |
| IE_DX_MIN_PATH_A | adx | 40.00 | 56.6% | **19.37** |
| IE_VOL_MIN_PATH_B | vol | 0.007500 | 65.6% | **0.004493** |
| IE_DBS_STRONG | \|dbs\| | 0.5000 | 81.9% | **0.5149** |
| TFS_MOM_MIN_PATH_A | mom | 0.001500 | 52.6% | **0.002426** |
| TFS_DX_MIN | adx | 35.00 | 50.3% | **16.81** |
| TFS_DBS_MODERATE | \|dbs\| | 0.3000 | 52.9% | **0.3529** |
| HVU_VOL_MIN | vol | 0.007500 | 65.6% | **0.004493** |
| HVU_MOM_NEG_PATH_A | mom | −0.001500 | 47.9% | **−0.000961** |
| HVU_DX_STRONG | adx | 45.00 | 62.7% | **21.98** |
| HVU_MOM_NEG_PATH_B | mom | −0.002500 | 46.3% | **−0.002074** |

Vol thresholds drop ~40%, ADX ~50%, |DBS| barely move, momentum modest — all physically consistent with §1.

## §3 — Regime-mix collapse if thresholds left UNCHANGED (current 60m cutoffs applied to 15m inputs)
| regime | 60m % | 15m-uncorrected % | Δpp |
|---|---|---|---|
| TREND_FRIENDLY_STABLE | 25.14 | 29.20 | +4.06 |
| STRUCTURAL_TRANSITION | 31.56 | **51.17** | **+19.61** |
| HIGH_VOLATILITY_UNSTABLE | 21.06 | **4.86** | **−16.20** |
| IMPULSE_EXPANSION | 15.52 | **5.44** | **−10.08** |
| RANGE_BOUND_STABLE | 6.72 | 9.33 | +2.61 |
Uncorrected, ~20pp dumps into the STRUCTURAL_TRANSITION catch-all (vol/DX-gated IE+HVU stop firing as 15m vol/DX land lower). This IS the silent collapse recalibration must correct — the whole reason for the parity exit gate.

## §4 — ★ SUBSTRATE FINDING (integrity catch — a real decision)
The clean 1m-rebuilt 60m mix here (**RBS 6.72%**) diverges from the **B.3 regime audit** (TFS~37 / ST~35 / HVU~21 / IE~7 / **RBS~0.02%**). NOT a study bug — a SUBSTRATE difference: B.3 classified the `xstock_spot_ohlc_60m_snapshot` (capped-60, DISTINCT-ON over B74's 18-56× duplicated source) → DX range-inflated → RBS killed; this study rebuilds 60m CLEANLY from the 1m archive → genuine RBS ~6.7%. **Implication:** the candidate map is anchored to the 1m-rebuild 60m (apples-to-apples with the 15m, also 1m-rebuild) — the right basis to ISOLATE the bar-size effect. But the LIVE classifier today is snapshot-fed. **Open decisions (for Langston):**
1. **Parity baseline:** 1m-rebuild-60m (clean, isolates bar-size) vs live-snapshot-60m (what production sees today)?
2. Does this re-open the B.3 conclusion (B.3 attributed RANGE_BOUND≈0 to the FORMING-BAR mechanism + weighting; this study suggests SNAPSHOT-substrate inflation is also/instead a driver)? Is the 60m snapshot still duplicate-inflated post-B-NEW-35?
3. Will the live 15m classifier (reads the 15m SNAPSHOT via the new cache branch) see clean or inflated bars — i.e. does the recalibration anchor (1m-rebuild) match the live 15m substrate?

## §5 — Open caveat for the parity step
Per-threshold percentile preservation preserves each cutoff's FRACTION of bars, but NOT the joint regime MIX (AND/OR branch structure). The parity report must apply ALL 14 finalized thresholds TOGETHER to the 15m and report the resulting joint mix vs the chosen 60m baseline — that joint assessment + "shift understood AND intended" is the exit gate.

## §6 — Next
1. Langston: confirm the candidate-threshold APPROACH + any CALIBRATION-LENS adjustments + the §4 parity-baseline decision.
2. Finalize the 14 thresholds (edit `xstock_spot/regime-thresholds.ts`) + the VN/DI re-derivation (screener_filters — same study extended).
3. Joint-mix PARITY report (apply all finals to 15m vs baseline) = EXIT GATE → Langston sign-off → only then activation.

*Engine `scripts/b4-regime-recalib-study.ts` (committed 0bbeafc81). Full output `/tmp/b4_regime_recalib.txt`. Active trading OFF.*
