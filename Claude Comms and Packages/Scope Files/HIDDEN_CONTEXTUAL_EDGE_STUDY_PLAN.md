# Hidden-Contextual-Edge Study — Design Plan (Kyle directive 2026-06-04)

> **Status:** DESIGN PLAN, v2 (rewritten after verified data-foundation sweep + Langston review). READ-ONLY analysis effort; no production code change in the study phase. Author: Claude Code. Reviewer: Langston (v1 reviewed; v2 §2/S1 re-review requested at diff level).

## 0. Purpose

Pattern conditional-edge work (2026-06-04) proved a strategy with no edge *on average* can hide a **profitable subset** whose winners share an identifiable context (for patterns: continuation + high-volatility/trending; reversal-in-calm is a reliable loser, cross-confirmed on both asset classes). Kyle's directive: do this **systematically for ALL strategies** — mine our wins and losses for the contextual conditions under which each strategy's winners cluster, so we can gate each strategy to its favorable context and lift **both win-rate and per-trade profit**. Findings feed a tuning decision (separate, later); the *methodology* becomes a repeatable engine an ML process runs periodically (and to catch drift, since these edges may not be permanent).

## 1. Hard constraints (Kyle)

1. **Bullish-only.** No shorting. Every candidate edge/gate is on the BUY side (continuation = buy with the trend; reversal = buy against it = the known loser).
2. **No fixed-duration cap.** Outcome = the system's actual managed exit (stop/target/trailing/BE/time-stop), NOT a fixed horizon. (This is why the B3.1a fixed-horizon tool is the WRONG engine — see §2.)
3. **Net of friction.** Every outcome is realized P&L AFTER round-trip cost, per asset class. (Largely solved at source — see §2/§3.)
4. **Identify, don't tune.** The study only SURFACES candidate gates with evidence. Tuning is a separate Kyle-approved batch afterward.
5. **Reusable for periodic ML.** Parameterized, schedulable engine; output = ranked candidate gates + a drift signal. Frequency TBD.
6. **No data-snooping.** Mining many slices surfaces spurious "edges." Out-of-sample + temporal-stability validation, FDR control, and a hard per-cell sample floor are mandatory before any finding is trusted.

## 1a. Calibration-robustness — survive Phase 25 re-tuning (Kyle 2026-06-04)

Distinction: the study finds (i) **real market relationships** (a buy aligned with a strong high-volatility uptrend travels further) that are properties of the *territory* and INVARIANT to where we move threshold lines, vs (ii) findings **pinned to our labels/gates** ("wins in the ST regime") that shift when we redraw a boundary or change which trades exist. Design principles (Langston-refined):

1. **Anchor findings on RAW market features, not labels.** Express each candidate edge primarily in actual underlying values (realized-vol number, DBS magnitude/sign, trend-strength, continuation-vs-reversal), not only the regime label or admitted-gate output. Report both; the raw-feature form is the durable finding, the label/gate form the as-of-this-calibration view.
2. **Bin raw features in FIXED ABSOLUTE units, never quantiles (Langston).** Quantile bins re-derive their edges from whatever trades exist under the current calibration — smuggling label-dependence back in. Pin bands to absolute values (ATR% in fixed % bands, DBS in raw score units) so the same trade lands in the same bin across calibration epochs.
3. **Derive continuation-vs-reversal from RAW trend sign, not regime_label (Langston).** Compute from raw DBS sign + a fixed-lookback trend slope, identically across epochs. regime_label is itself a moved boundary; deriving continuation from it makes the flag flip when Phase 25 redraws the line.
4. **Report the dose-response CURVE, not a knife-edge threshold (Langston).** Express each edge as a monotone response of expectancy across the raw-feature range, not a single best cut-point. A monotone relationship is far more likely to be territory than a threshold coinciding with today's gate; it hands Phase 25 the curve to pick the operating point; and single-threshold "edges" are the easiest thing for the gate-hunt to overfit.
5. **Re-run after every calibration (and periodically).** The label/gate-tied portion is refreshed by re-running under new settings — this IS the periodic ML scan (S6) + drift monitor (S5/S6).
6. **Findings INFORM calibration.** Evidence a strategy only earns its keep in a raw context is direct input to where Phase 25 sets that strategy's gates. Sequence: run now (raw-anchored) → feed Phase 25 → re-run after.
7. **Tag the geometry + threshold epoch** each run was measured under, so every finding is bound to its calibration.

## 2. Data foundation (VERIFIED 2026-06-05; do not assume)

**PRIMARY — VTS daily trade logs.** `/home/deploy/dawntrader/logs/virtual_trades/YYYY-MM-DD.json` (writer `vts-service.ts:459-475 logTrade`), one record per closed VTS trade. **VERIFIED by parsing all files:** 145 files, **22,801 trades**, **2026-01 → 2026-06-05** (the lone 2025-12-29 file is corrupt → usable history starts January). Each record carries realized outcome (`grossProfit`, `netProfit`, `fees`, `frictionCost`), the managed `exitReason`, entry/exit time+price, and rich context (`regime`, `globalRegime`, `pairDirectionalBias[Score]`, `globalDirectionalBias[Score]`, `predictiveConfidence`, `regimeConfidenceRaw/Modulated`, `macroModifierValue`, `phase`, `strategy`, `signalType`, `sourcePool`, `entryLiquidity*`, `positionSize`, ...).

**FIELD-COMPLETENESS IS TIERED (verified):**
- **Backbone — ALL ~22,801 trades (Jan-Jun):** `netProfit`/`grossProfit`/`fees`, `regime` (pair), `strategy`, `signalType`, `predictiveConfidence`, `exitReason` — 100% present every month.
- **Full context — ~May onward (~6,000+ trades; partial April):** `globalRegime` (0% Jan-Feb → 28% Mar → 100% Apr+), `pairDirectionalBiasScore` + `globalDirectionalBiasScore` (0% ≤Mar → 64% Apr → ~100% May+), `phase` (May+), explicit `assetClass` (May 60% → Jun 100%; Jan-Apr unlabeled but all crypto by construction → inferable).
- **Gap — liquidity** (`entryLiquidityValue`): ~0% until June (40%). Recompute from order-book history or accept missing.

**SECONDARY / CROSS-CHECK — `exit_decision_archive`** (Postgres, B70, writer `data-archive/exit-decision-archiver.ts`). Structured subset, **5,428 rows, 2026-05-05→2026-06-05**, managed exits (`exit_reason`, `pnl_pct`, `r_multiple`, `duration_min`) + context (`regime_at_entry/exit`, `dbs_at_entry/exit`, `atr_at_exit`, `state_snapshot`). 90-day hot retention (B70 sweep) — partitions drop after 90d; the JSON logs are the durable long record. Use to validate the JSON loader.

**REJECTED-ARM + CONTEXT-BACKFILL — B73 exit-strategy-replay** (`server/services/exit-strategy-replay.ts`, NOT B3.1a). B3.1a (`b-xstock-calib-b31a-gate-audit.ts`) is a FIXED-HORIZON (60/240-min) forward-return tool that violates constraint #2 — dropped. B73 fetches 1-min OHLC per trade window and simulates true stop/target/trailing/BE/time-stop exits; already asset-class-aware (B82). Its 12-variant output is persisted to **`exit_strategy_alternates`** (~72k rows) = ready-made alternative-exit lens (answers §8 Q2 by JOIN, no new build). Use B73 for: **(a) replaying the REJECTED signals** — enumerated from **`signal_eval_archive` filtered on `reject_stage`** (VERIFIED mode=`vts`/source=`vts-runner` = the SAME VTS pipeline as the admitted trades; June admitted 1,233 ≈ June JSON trades 1,283 → admits + rejects reconciled, not cross-pipeline; **Langston Flag 1 RESOLVED**). Counterfactual = the NEAR-MISS stages (`sqe`, optionally `tcl`); EXCLUDE `strategy_internal` (~2.8M ambient non-signals — mining them re-discovers "most states aren't setups," not a gate edge; Flag 2). `signal_eval_archive` exists only from ~May 2026 → the admitted-vs-rejected COMMON WINDOW is ~May+, which caps every selection-bias comparison (Langston secondary). **(b)** recomputing missing older context (DBS/global/phase) at each backbone trade's symbol+entry-time to extend the full-context set toward 22,801.

## 3. Outcome variable

Per trade (BUY): `netProfit` (net of friction — taken from the stored field; **S1 must verify gross-vs-net provenance + that crypto/xStock friction models are applied identically across the JSON, archive, and B73 arms**), `win = netProfit > 0`, `grossProfit`, `r_multiple`, holding duration, `exitReason`. Slice metrics: **win-rate, expectancy (mean net P&L/trade), profit factor, net edge**, each with a significance estimate (bootstrap CI / FDR-controlled) and N. **AUC / Mann-Whitney is the threshold-free primary statistic** (tail-robust, no win-threshold; matches the B3.1a/Langston-#6 lineage).

## 4. Context feature menu

asset_class · strategy · regime (pair) · globalRegime · regime_confidence · DBS score (pair + global) · DBS slope · continuation-vs-reversal (RAW DBS sign + fixed-lookback slope, per §1a.3) · ATR%/realized-vol · trend-strength · momentum · IMF VN/DI/LQ (recomputed) · liquidity (recompute — log gap) · macro modifier · phase · time-of-day/session position · distance from recent high/low · day-of-week · confidence/final_score · signal_type · pattern_type.

## 5. Slicing angles (comprehensive)

- **Kyle's primary cuts:** asset_class × regime × strategy (headline grid); asset_class × regime (coarse).
- **Single-dimension scans:** each feature vs win-rate/expectancy, per asset_class (and per strategy).
- **Two-way interactions:** strategy × regime, regime × DBS, continuation × volatility, regime × volatility, strategy × continuation, phase × regime, session × regime.
- **Best-gate hunt:** single + 2-way (3-way ONLY when N clears the floor — see §6/S1), ranked by expectancy; top candidate gates per strategy + global.
- **Winner-vs-loser profiling:** per strategy, top vs bottom expectancy quintile context contrast.
- **Exit-reason analysis + alt-exit lens:** how winners exit (target/trail) vs losers (stop/time); JOIN `exit_strategy_alternates` to test edge survival under variant exits (secondary lens only).

## 6. Robustness (mandatory)

- **Selection bias — admitted vs rejected (Langston Concern A; THE key methodological point).** The admitted arm (JSON logs / archive) is conditioned on survival through TODAY's gates — its outcomes are not what a NEW gate would admit; mining only admitted trades re-discovers the current gate's own selection. The rejected arm (B73-replayed) is the unbiased population but with MODELED (not observed) fills, AND is a stratified SAMPLE matched to admitted (NOT a full population — the sampling design is itself a bias surface; report sample size + matching keys). **Report both arms separately; NEVER merge into one expectancy without the caveat.** Hold both arms on a common window for any direct comparison.
- **Out-of-sample holdout + temporal stability.** Time-blocked k-fold (not a single 70/30 — the full-context window is short); a candidate must hold on unseen data AND show temporal monotonicity. This stability test = the drift monitor (S6).
- **Stats bar (Langston Q4):** Benjamini-Hochberg FDR at q=0.10 (Bonferroni too harsh), bootstrap CIs on expectancy, hard floor **≥50 net trades/cell** (not 30 — friction noise on thin xStock books), AUC primary. A finding is "real" only if it clears FDR AND survives holdout AND shows temporal monotonicity (three independent gates).
- **No silent truncation:** when a slice is suppressed for low N, SAY so in the output ("3-way gates suppressed — insufficient N"), never report underpowered cells as findings.

## 7. Sections (incremental)

- **S1 — Loader + outcome foundation + EXIT-CRITERIA.** Build the JSON-log loader (22,801 backbone trades) + exit_decision_archive cross-check; validate fidelity. **S1 cannot complete until three gates pass (Langston v2):** (a) **friction provenance verified** — confirm `netProfit` is truly net and the same per-asset-class friction model is applied across JSON / archive / B73 arms (if stored P&L were gross, every expectancy is overstated ~1 round-trip and thin-book xStock edges flip sign); (b) **rejected arm concretely defined** — = `signal_eval_archive` at stage {`sqe`[, `tcl`]}, mode=`vts` (reconciled to the VTS admitted population per §2), **stratified-sampled and matched to admitted on symbol × entry-time-bucket × regime** (cannot B73-replay millions — the rejected arm is a SAMPLE; state sample size + matching keys; no silent truncation), held on the `signal_eval_archive` retention-bounded common window (~May+); (c) **geometry-reconstruction fidelity validated (Flag 4)** — since NO row carries entry geometry, B73 must SYNTHESIZE each rejected signal's stop/target by re-running the originating strategy's entry rules as-of symbol+timestamp; validate that reconstruction by blind-reconstructing a sample of admitted VTS trades whose realized `netProfit` we KNOW and confirming the modeled outcome tracks observed within tolerance (turns modeled-vs-observed from assumed-small to MEASURED). Also: tag the field-completeness tier per trade (backbone vs full-context) and stand up the B73 context-backfill path. No mining before S1 gates (a)+(b)+(c) pass.
- **S2 — Headline grid.** asset_class × regime × strategy: win-rate, expectancy, profit factor. Runs NOW on the ~22,801 backbone (regime+outcome present). Crypto + xStock from the start (read-only; never pooled).
- **S3 — Single-dim + interaction scans.** All features + 2-way where N clears floor; winner-vs-loser profiling. DBS/global/continuation cuts use the full-context tier (~6k native, extendable via backfill).
- **S4 — Best-gate hunt + per-strategy favorable-context profiles.** Ranked candidate gates with expectancy/frequency/net edge. **3-way depth GATED on ≥50/cell — suppressed + flagged until accrual; do not run full 3-way on the current sample (Langston Concern D).**
- **S5 — Robustness.** Holdout + temporal-stability + FDR validation of S4 candidates; only survivors graduate to "real." Gate the "real" verdict on ≥60d accrual where the full-context tier is thin.
- **S6 — Productionization.** Document the engine as a repeatable ML routine (inputs/outputs/cadence + drift report) → analytics runbook + onboarding-workflow.

## 8. Answers to v1 open questions (verified)

1. **Outcome source:** hybrid. PRIMARY = query the VTS JSON logs (22,801, Jan-Jun, net P&L + managed exits + context) + exit_decision_archive cross-check; B73 exit-strategy-replay (NOT B3.1a) for the rejected arm + older-context backfill.
2. **Trade-construction fidelity:** primary = current geometry (what we'd gate in production); alt-exit sensitivity comes free by JOINing `exit_strategy_alternates` (B73's 12 variants) as a SECONDARY lens — keep secondary so the ranking isn't polluted by exit-geometry variance.
3. **Window + holdout:** backbone ~5 months (Jan-Jun); full-context tier ~May+ (thin). Run S2/S3 now, tag full-context findings "provisional — pending 60-90d accrual," use time-blocked k-fold, gate S5 "real" on ≥60d. Rejected arm can reach further via replay — but hold admitted/rejected on a common window for comparison.
4. **Significance:** BH-FDR q=0.10 + bootstrap CIs + ≥50/cell floor + AUC primary; triple-gate (FDR ∧ holdout ∧ monotonicity).
5. **Crypto from start:** yes, both classes from S2 (read-only; no-touch-crypto governs production, not analysis). Two rules: never pool crypto+xStock expectancy (different friction/microstructure); session-structure cuts (time-of-day/day-of-week/phase) stay within-class (crypto 24/7 vs xStock 24/5).

## 9. Caveats / limitations (verified)

- **VTS-derived (Langston Concern C):** every trade is `mode=vts` simulated execution. Edges are in VTS's simulated fills, on a VTS-shaped population. Tag all findings "VTS-derived, pending active-paper confirmation"; re-validate at **Phase 19** before anything gates live.
- **Field-completeness tiering:** DBS/global-regime/phase/clean-asset-class only native from ~May (~6k); older backbone (Jan-Apr) needs context-backfill via B73 recompute to join the deeper cuts.
- **Liquidity gap:** not logged (≤Jun) — recompute from order-book history or exclude.
- **Friction provenance UNVERIFIED until S1 gate (a).** Hypothesis-generation only; nothing tuned until S5 survivors + Kyle approval.
