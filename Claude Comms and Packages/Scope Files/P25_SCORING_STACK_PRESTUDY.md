# Phase-25 Pre-Study — The Scoring/Confidence Stack: what feeds ranking + gating, and what deserves to survive

**Author:** CC-A (Claude Old), 2026-07-13, per Kyle directive ("dig into all the numbers that feed the ranking system and the final score… what makes sense keeping, what no longer makes sense"). Research artifact, NOT a batch scope — it is the input to the Phase-25 scoring-consolidation scope(s) (25-1/2/3/4/10/19/20 + #399).

---

## 1. Where the ranking rework actually stands (corrects the "deferred until after go-live" memory)

- **The ranking FORMULA was already replaced** — P19-B7.1 (CLOSED 2026-06-30, Langston Step-8 PASS): the live picker `getRankedSignals` (`ready_to_buy_service.ts:1904`) ranks by **expected R-multiple = netEV ÷ risk** (`signalRMultiple` :1857, kernel `netRewardToRisk` at `net-expectancy-kernel.ts:117`), pluggable + DB-governed (`module_constants.rtb_ranking.active_ranker`, default `r_multiple`; `confidence` and `ranking_score` kept only as shadow A/B controls).
- **BUT it is DORMANT** — the live picker doesn't run until paper-active switches ON (P19-B8.5). The no-double-sample proof + the first real selection-IC land at switch-on.
- **What WAS deferred to Phase 25 = the calibration of its inputs**, five named homes under **RUNNING_ISSUES #399**: (a) **pWin calibration (the make-or-break)**, (b) fractional-Kelly sizing, (c) xStock dbsScore-gap (hard prereq for xStock live), (d) selection-IC GO/NO-GO, (e) per-class pWin haircut decision.

## 2. The three-layer map (from the full code audit, 2026-07-13)

**LAYER 1 — RANKING (new, structurally sound, input-starved).**
`R = netEV ÷ risk`; `netEV = pWin·distTarget − pLoss·distStop − friction` (kernel :99-117). Friction is real (cost-model round-trip). **The soft spot is `pWin`: `clamp(0.40 + DI/200, 0.40…0.60)`** (strong-trend variant `0.40 + |dbs|/2`) — a crude placeholder floored at 0.40 and capped at 0.60, never calibrated against outcomes. The ranker's ORDER is only as predictive as pWin's spread. (DB-tunable: `expectancy_kernel.pwin_floor/pwin_ceiling`, `directional_integrity.di_pwin_factor`.)

**LAYER 2 — GATING (old stack, hardcoded weights, empirically broken confidence).**
- `finalScore = hybrid×0.4 + confidence×0.3 + regimeWeight×0.2 − decay×0.1` — weights **hardcoded + frozen** (`score-weights.config.ts:36-43`, "v1.0.1, DO NOT MODIFY"). Lost its ranking job at B7.1 but **still the SQE gate authority** (`finalScore ≥ 0.35`, `signal_quality_evaluator.ts:316`).
- Upstream hardcoded blends: deterministic confidence `0.60/0.20/0.20` (`quality_index.ts:54`); extended confidence `0.50/0.30/0.20` (`:294`); hybrid ensemble `QUANT 0.4 / PATTERN 0.4 / PREDICTIVE 0.2` + `MIN_SCORE 0.65` (`system-guards.ts:61-65`); regimeWeight `trend×0.7 + (1−vol)×0.3` (`score-calculator.ts:78`); orchestrator hybrid-confidence `0.4/0.4/0.2` (`signal-orchestrator.ts:1603`); PredictiveConfidence `sigmoid((winRate−0.5)×6)` (`score-calculator.ts:124`).
- **The evidence against this layer:** finalScore correlates NEGATIVELY with outcomes (r=−0.140 full post-B62; §19.4 — direction robust, magnitude to re-validate with sibling controls); the regime confidence-chain was **INVERTED** (TFS-rated pairs 13.8% WR vs 83.3% on lower-rated STR — B65.6); Item-18's "quant-strong_trend only profitable" claim was inverted from truth and discarded. This is the B-NEW-33/36/37/39 workstream → 25-2/25-3/25-10.

**LAYER 3 — DEAD / LEGACY (computed but not deciding, or outright removed).**
- `rankingScore` + all of `ranking-weights.ts` (Phase-14.5 profiles, context bonus): **inert** in the live path — only the VTS shadow (`vts-runner.ts:5510`) and the non-default control arm consume it; context bonus computes nothing (#217); dead import in the orchestrator (:136).
- `calculateQualityScore` 0-100 (`expectancy.ts:566`): display/telemetry only, superseded.
- DBS confidence modifier: removed at B62 (dead).
- `getTopSignal()` (`ready_to_buy_service.ts:1374`): a **pre-B7.1 remnant picker** still on finalScore-gap logic (`FINAL_SCORE_GAP_OVERRIDE=0.10`) — ⚠ MUST verify which picker the promotion loop actually calls (also flagged at `PHASE_19_PLAN.md:269` "getTopSignal cross-class sort on clamped finalScore → Phase-25 + B9 watch").
- Legacy EV helpers with magic `(fee×2)+(spread×1.1)+slippage` (`expectancy.ts:135/149/173`); NGC/`quality_index.ts` legacy carriers ("still active in error", removal deferred to MCE); stale const mirrors (`MIN_QUEUE_CONFIDENCE=0.55`).

## 3. Keep / Recalibrate / Retire (the study's answer, for crew debate)

**KEEP AS-IS (structurally right):** the R-multiple ranker + pluggable arm machinery; the netEV>0 gate + kernel; the cost-model friction; DI; DBS (its narrow pWin path); LQ/IMF admission gates; decay penalty (already DB-governed).

**RECALIBRATE (Phase 25, in priority order):**
1. **pWin** — the single highest-value item (#399a): replace `0.40 + DI/200` with an outcome-calibrated mapping (bucketed realized win-rates by DI/dbs/regime/class on VTS + paper-active history). Everything downstream (netEV, R, the gate) inherits its quality.
2. **The finalScore gate question** — recalibrate the 0.4/0.3/0.2/0.1 weights **or retire the gate in favor of kernel-based gating** (netEV>0 + floors already exist). Given finalScore's anti-predictive record, "recalibrate vs retire" is a genuine architecture decision for Kyle+crew at the Phase-25 scope — flagged, not pre-decided.
3. The confidence blends (0.60/0.20/0.20; 0.50/0.30/0.20; hybrid 0.4/0.4/0.2; regimeWeight 0.7/0.3; sigmoid slope 6) — calibrate against paper-active outcomes or fold into whatever replaces finalScore; migrate survivors to DB governance (per §5 rule 15, per-class).
4. SQE thresholds (0.35/0.30/pattern 0.45) — re-derive from paper-active distributions (25-4).

**RETIRE CANDIDATES (rule-18 dispositions at the Phase-25 batch):** `ranking-weights.ts` + rankingScore machinery (after the shadow A/B has served the selection-IC comparison); `getTopSignal` legacy path (pending the caller check); qualityScore display path (or keep explicitly as telemetry, labeled); NGC/quality_index legacy carriers; legacy EV helpers; stale const mirrors. Open sores to fold in: **#211** (two drifted finalScore implementations — orchestrator vs vts-runner disagree), **#212** (admit-only capture blinds score comparison), **#328** (dead CriteriaLimiter), **#221/#217** (cross-class leveling + inert context bonus — retire with rankingScore or rebuild deliberately).

## 4. What can be probed NOW (cheap, ad-hoc, on existing data — the Kyle workflow step-1)

1. **P0 — the caller check: ✅ DONE 2026-07-13, CLEAN.** The promotion path IS the B7.1 ranker: `active-execution-engine.ts:1825 → getRankedSignals()` (only external caller besides unit tests). The legacy picker chain — `checkForPromotion()` (`ready_to_buy_service.ts:1779`) → `getTopSignal()` (`:1374`, finalScore-gap logic) — has **ZERO callers anywhere**: orphaned dead code, never reached at switch-on. ⇒ upgrade both from "verify" to a clean **rule-18 retire candidate** at the Phase-25 batch (delete `checkForPromotion` + `getTopSignal` + `FINAL_SCORE_GAP_OVERRIDE`, with the usual blast-radius trace at deletion time).
2. **P1 — pWin reality probe (the make-or-break, days):** on VTS/paper history, bucket realized win-rates by DI (and dbs/regime/class) and compare against the placeholder `0.40 + DI/200`. Answers: is pWin even directionally informative? What should the calibrated mapping look like? This is the direct prep for #399a and reuses the 25-24 probe harness (per-bucket stats + t-stats).
3. **P2 — retro selection-IC on the R-multiple (days):** compute predicted-R on archived per-cycle candidate sets and run the B7.1 selection-IC harness retroactively — does predicted-R order realized outcomes? (This is the VALID version of the 25-22 idea — pointed at the NEW ranker, not the superseded finalScore.)
4. **NOT now:** re-testing finalScore's edge (superseded), 25-22 on the old score (Kyle's catch 2026-07-13 — correct), 25-23 HMM / 25-25 stat-arb (bigger lifts, after P1/P2).

## 5. Honest caveats
- All Layer-1 validation is bottlenecked on REAL paper-active outcomes (the ranker is dormant; VTS outcomes carry the known confidence-inversion contamination — §19.4's warning that classifier accuracy must be measured on forward-continuation, not trade outcomes, applies to P1's design).
- The §19.4 mandate stands: the anti-predictive-finalScore magnitude must be re-validated with sibling-strategy controls before any formula change ships.
- Nothing in this doc changes code. It is the map + the probe plan.
