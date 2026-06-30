# P19-B7.1 — Completion Report (the ranking fix)

**Batch:** P19-B7.1 (the live-picker ranking fix — pluggable expected-R-multiple ranker)
**Owner:** Claude New (CC-B) · **Reviewer:** Langston (Step-1/4/8) · **2nd-eyes:** Claude Old (CC-A) · **Decider:** Kyle
**change-class:** architecture
**Date:** 2026-06-30
**Head:** `0dacd34f2` · **CI:** run `28478843721` — all-4-green (TypeScript Check, Test Suite, Build, Docker Build) · **Deploy:** staging restart#427, HTTP 200, boot clean · **Migrations:** 2 applied + self-verified

---

## 🚨 SCAFFOLDING-VS-FUNCTIONAL (§9.1)
**This batch makes the new ranker the DEFAULT but it is DORMANT — the live picker does not run until paper-active trading is turned ON (P19-B8).** The R-multiple ranker is configured, deployed, and proven by unit tests + staging boot, but it ranks nothing live today (active trading OFF → `getRankedSignals` has no live caller exercising it). Its empirical proof (the no-double-sample row-count-flat check, and any real selection-IC) lands at the B8 switch-on. The within-class ranking improvement is real and immediate at switch-on; the full cross-asset promise is gated on the Phase-25 pWin calibration (RUNNING_ISSUES #399).

## Objectives checklist (YES / NO / PARTIAL + evidence)

| OBJ | Status | Evidence |
|---|---|---|
| **OBJ-1 — pluggable ranker, default R-multiple, no hidden default** | ✅ YES | `getRankedSignals` reads `getActiveRanker()` (fail-hard `getCachedStringRequired('rtb_ranking','active_ranker',…, RANKER_STRATEGIES)`); arms `r_multiple`(default)\|`confidence`\|`ranking_score`. Staging DB confirms `active_ranker="r_multiple"`. Test: `RANKER_STRATEGIES` set. Boot did not crash on the fail-hard reader → seed resolves. |
| **OBJ-2 — surface kernel R-multiple; rank-time reuses wrapper; no-double-sample** | ✅ YES | `netRewardToRisk` + `pWinFloored` surfaced on `TradeExpectancyResult` (4 touch points incl. unclassifiable early-return); `evaluateTradeExpectancy` `quiet` param; `signalRMultiple` reuses the wrapper. Tests: R-multiple identity (`netRewardToRisk===netEV/distStop`), dimensionless cross-asset ($0.50 vs $200), sign, distStop=0 guard; no-double-sample source proof (`recordEvInputSample` absent in the wrapper, present only at the open path). **Empirical row-count-flat = B8 switch-on item** (dormant now). |
| **OBJ-3 — degenerate-geometry REJECT-primary + microstructure floor** | ✅ YES | `passesGeometryFloor` rejects pre-sort; pure `computeRankRiskFloor` `max(min_atr_fraction×ATR, min_abs_risk_fraction×entry)`. Tests: ATR-primary, abs-fallback, reject/keep. Capital-independent; defense-in-depth with emit-stage GUARD-1 (see Q1 below). |
| **OBJ-4 — shadow R-multiple + selection-IC harness** | ✅ YES | 3 cols (`predicted_r_multiple`/`pwin_floored`/`cross_class_promotion`) on BOTH shadow grains (migration self-verified 6 cols); capture wired through `registerOpenShadowTrade`/`insertShadowPoolMember`. NEW pure `server/core/metrics/selection-ic.ts`. Tests: Spearman ±1/tie/zero-var-null; computeSelectionIC min-N/degenerate/per-regime/clustered-SE/period-weighted. |
| **OBJ-5 — sizing ≤R invariant + clamp-bind telemetry** | ✅ YES | `effectiveRiskFractionRatio` returned by the sizer (absorbs notional clamp + `correlationScale`); ≤R upper-bound invariant warn; `rtbMetricsService.recordSizingClampSample`/`getSizingClampProof` (boundRate), recorded INSIDE the opened-gate. |

## Verification (Step-7, staging)
- HTTP 200; boot clean (no fail-hard ranker-config crash → the 3 seed rows resolve; only a pre-existing unrelated `/home/runner` perm warning).
- 2 migrations applied + their internal `DO`-block assertions passed (3 `rtb_ranking` rows + 6 shadow columns).
- Staging DB: `active_ranker="r_multiple"`, `min_atr_fraction_floor=0.10`, `min_abs_risk_fraction=0.0005`.
- Bench: tsc-baseline GREEN (0 regressions); **20** new B7.1 tests + **51** affected existing tests pass.
- CI: run `28478843721` all-4-green.
- §9.3 Claude-in-Chrome: N/A — B7.1 has no UI surface (scope: "§9.3 applies only if a ranker-selection UI surfaces"). The empirical no-double-sample row-count-flat check is a B8 switch-on verification (dormant).

## Langston Step-4 (CHANGES-NEEDED → APPROVED) — 3 fixes landed
- **CHANGE-1 (blocking):** moved `recordSizingClampSample` INSIDE the `quantity>0 && estimatedValue>0` opened-gate (population = actually-opened positions; a zero-quantity result can't inflate boundRate) + `meanRatio` guarded against non-finite.
- **CHANGE-2 (Q2):** my `pwin_floored` derivation (`strong-trend && null-dbs`) was INCOMPLETE — the kernel also floors on the DI≤0 branch. Flipped to reading the kernel's OWN output `pWin ≤ minPWin` (surfaced on `TradeExpectancyResult`) — complete across ALL floor paths, no consumer re-implementation, no kernel change. Test locks floor-on-DI=0, floor-on-strong-trend-null-dbs, no-floor-on-healthy-DI.
- **CHANGE-3:** `computeSelectionIC` point estimate is now PERIOD-equal (mean of per-cycle ICs), SE still window-clustered. Test with 2-cycles-in-one-window proves it.

## Q-confirms
- **Q3 (pre-push):** rank-R and gate-R use the IDENTICAL null-target default — `rtbSignals.targetPrice` is nullable, and `executePromotedSignal` (open path) defaults null→`entry*1.02`, matching `signalRMultiple`. No divergence.
- **Q1 (split-brain):** found the emit-stage GUARD-1 `strategy-helpers.ts MIN_STOP_DISTANCE_BPS=30`. Dispositioned (Langston non-objected, CC-A validated) as defense-in-depth — different stage (emit vs rank), different basis (flat-bps vs cross-asset ATR-fraction) — NOT a same-gate split-brain; single-sourcing the absolute bps is a considered Phase-25 cleanup (#399). Documented in SysManual Ch1 + SIM.

## Non-blocking notes ON RECORD (Langston/CC-A; for future cleanup, none blocking)
- `evaluateTradeExpectancy` runs twice per candidate per cycle for `r_multiple` (rankKey + shadow capture) — pool ≤15, fine; optional memo-reuse later.
- `effectiveRiskFractionRatio` is computed pre-`modeOverlay.positionSizeMultiplier` (uniform scalar → no rank effect; "executed size" reads post-overlay — noted).
- `getSizingClampProof`: `boundRate` divides by all samples while `meanRatio` divides by finite-only (defensible asymmetry; non-finite shouldn't occur on the opened path).
- `selection-ic.ts` `clusteredStats` equal-weights cluster means for the SE — conservative, a Phase-25 min-variance refinement candidate.

## §13 — Phase-25 homes (all in RUNNING_ISSUES #399, each home named)
(a) pWin calibration pipeline · (b) fractional-Kelly sizing · (c) xStock dbsScore-gap closure (HARD prereq for xStock LIVE) · (d) selection-IC GO/NO-GO · (e) per-class pWin haircut decision. NOTE: CC-B's #370–399 reservation range is exhausted by #399 — revisit/extend before the next CC-B issue.

## Governance files changed
`server/*` (8 code files) + `shared/schema.ts` + `server/core/metrics/selection-ic.ts` (new) + `server/tests/unit/p19-b7-1-ranking.test.ts` (new) · 2 migrations + MANIFEST · **SYSTEM_MANUAL.md** (Ch1 "P19-B7.1 — Live-picker ranker" + Chapter-11 selection-quality extension) · **SYSTEM_IMPACT_MAP.md** (B7.1 ranking-fix callout) · **BATCH_CATALOG.md** · **PHASE_HISTORY.md** · **PHASE_19_PLAN.md** (§1 board + §5 design-lock + close) · **ADJUSTMENT_FRAMEWORK.md** (ranker knobs) · **RUNNING_ISSUES.md** (#399 umbrella) · MEMORY (CC-B + Langston §10.b) · this completion report.

## Status
Code shipped + deployed + verified (Step-7). **Langston Step-8 + Kyle acknowledgment pending.** Batch CLOSED only after both.
