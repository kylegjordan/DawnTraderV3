# B-XSTOCK-DBS-TO-STRATEGIES — COMPLETION REPORT — ✅ CLOSED 2026-11-06 (Langston confirmed Steps 10-11, 12:21Z)

**change-class: architecture** · `#1235` · sprint plan pre-sprint stage 00, order 4 (Kyle KD-2, 2026-11-04) · owner CC-B (NEW Claude)
Scope `Scope Files/B_XSTOCK_DBS_TO_STRATEGIES_SCOPE.md` · pre-audit and plan `Scope Files/B_XSTOCK_DBS_TO_STRATEGIES_PRE_AUDIT.md` · Step 6-8 record `Change Lists/B_XSTOCK_DBS_TO_STRATEGIES_STEP7.md`

## ⚠️ OPEN AT CLOSE — stated first
| item | owner | home | closes when | fails when |
|---|---|---|---|---|
| **F2, xStock half:** xStock's `xstock-strong_trend` lane attaches no strong-trend stop/target override (crypto's does). The intent for xStock is not established (crypto's values were built for crypto's lane, and xStock trades 15-minute bars). | decision: Kyle, or the crew under KD-34 | `#1235` (stays open for this alone) | a decision is recorded, with its work placed if any | — |
| **`#1249`:** nothing announces a staging deploy that lands inside another batch's pre-registered observation window. | Kyle (slot) | `#1249`, SURFACED FOR KYLE, not placed | Kyle slots it or declines | — |
| **strong_bull_trend's xStock replacement window** (C-1): opened at this deploy. | CC-B | sprint row 52, `B_SILENT_STRATEGY_CENSUS_PROGRESS_REPORT.md` §3a; alerts `05cc82da` (daily), `f82e69ac` (backstop 11-26) | 20 filled closes, the B-ENTRY-GATE inc-A deploy, or 2026-11-26 | every end reports to Kyle (amended 2026-11-06) |
| **KD-7 switch-ons** (adaptive_flow, reverse_impulse, volatility_edge, support_bounce for xStock) | CC-B | `B-SILENT-STRATEGY-CENSUS` O3, row 52 | each switched after its feasibility read | — |

## What it was for
The xStock evaluation loop computed a real direction score (DBS) for every xStock with enough history, but never handed it to the strategies. Every strategy reads `dbsScore ?? 0`, so on xStock the score was always zero: `strong_bull_trend` could never fire, and the guards that refuse counter-trend and strong-trend entries never fired. 95 of 521 xStock paper trades since the 2026-10-06 reset were trades those guards exist to refuse.

## What shipped
Deployed `8636040255b9ffb0a83edf6bf189d97e6e227763`, 2026-11-05T05:36:24Z, `dt-deploy --by cc-b`; the migration ran before the restart; rollback `10df95fb0`. 11 files: `server/asset_classes/xstock_spot/detect-indicators.ts` (new builder), `eval-cycle.ts`, `scanner.ts`, `server/services/strong-trend-geometry.ts` (new), `vts-runner.ts`, `server/strategies/volatility-edge.ts`, the B72 consistency test, a new unit test file, and migration `2026-11-05-b-xstock-dbs-to-strategies.sql` (+ rollback, MANIFEST).
**CI on the deployed sha:** run `41974716842` — TypeScript Check (baseline gate), Build, Test Suite, Docker Build: all success.
**Reviews:** Step 4 PROCEED (Langston, on `e3a295e93`; re-landed byte-identical as `d35670b5c`, condition fix `da796affa`). Step 8 CONFIRMED (Langston, 2026-11-06 ~11:44Z; Review = Approved, read back).

## Objectives
| # | objective | result | evidence |
|---|---|---|---|
| OBJ-1 | the xStock detect input carries the DBS | **YES** | `{ ...mceContext.indicators, dbsScore, dbsCategory, dbsSlope }` built in `detect-indicators.ts`; unit tests incl. the absent case (fields absent, not 0); on staging, 11-04 → 11-05 strong_bull_trend rows with a null `detectDbsScore`: 31,509 of 31,509 → 0 (Langston) |
| OBJ-1b | `volatility_edge` reads its strong-DBS threshold from the database | **YES** | the row seeded (0.35); B72 suite 5 of 5 on staging and 5 of 5 in CI; crypto `volatility_edge` exclusion share 0.01 % before and after |
| OBJ-1c | crypto's strong-trend override read from settings | **YES** | two rows seeded; crypto `vwap_pullback` strong-trend admitted rows at span 16.0000 (4 ATR + 3 R): 14 of 14 before, 11 of 11 after; control lane ranges 8.96-90.53 |
| OBJ-2 | paper xStock inherits it | **YES** | traced at Step 2; strong_bull_trend's first xStock paper trades opened 11-05 (19 to date) |
| OBJ-3b | the archive records the score detect received | **YES** | `features.detectDbsScore` present; null arm 0 of 276,740 xStock VTS rows in the session (Langston) |
| OBJ-3 | coverage on the cycle summary | **YES** | `detect_evals` / `dbs_carried` / `dbs_ge_035`, coverage 100 % on the first cycles |
| OBJ-4 (a) | per-row agreement | **YES** | 0 disagreements on 182,812 rows of the four guarded strategies; the 1 % floor binds on morning_star (61.6 % / 7.8 %) and is met |
| OBJ-4 (a′) | share vs an independent instrument | **YES** | matched 96.87 % (≥ 93.9 %), equal 99.52 % at the column's own scale (1e-9 struck — see deltas) |
| OBJ-4 (b) | strong_bull_trend clears its floor | **YES** | `dbs_below_threshold` 38.5 % (12,138 of 31,530), from 100 % |
| OBJ-4 (c) | crypto unchanged | **YES** | decision-grade read on the batch's two changed crypto paths (above); the one-hour 11-04 vs 11-05 comparison was not decision-grade and is not used |
| OBJ-4 (d) | Filter Diagnostics shows the new refusals | **PARTIAL** | the page renders, but the per-strategy detect breakdown is not emitted on the active path (`#662`, `#675` residual), so the batch's effect is not observable there — an instrument gap, not a zero |
| OBJ-5 | KD-7 switch-ons | **carried, not in scope** | `B-SILENT-STRATEGY-CENSUS` O3 |

## Numeric deltas
- **PREVIOUSLY STATED:** (a′) equality tolerance |Δ| < 1e-9 (pre-audit). **NOW:** |Δ| < 1e-6, the column's own scale. **REASON:** `pair_scan_archive.dbs_score` is `numeric(10,6)`; 1e-9 was unsatisfiable by construction (max observed 4.998e-7, inside the 5e-7 half-unit).
- **PREVIOUSLY STATED:** (a′) matchable ≥ 90 %. **NOW:** ≥ 93.9 %. **REASON:** C-3's pre-registered baseline minus 3 points superseded it; all three copies corrected (`:123`, `:175`, and P10 at `:194` — the third found by Langston at Step 11).
- **PREVIOUSLY STATED:** (a) "all xStock VTS rows" = 182,812. **NOW:** 182,812 = the four guarded strategies; all xStock VTS rows = 276,740. **REASON:** population label corrected at Step 8.
- **PREVIOUSLY STATED:** the session read ran on one build. **NOW:** three restarts after the deploy, one inside the session (14:40:03Z). **REASON:** staging reflog; the diff to that build has zero changes on the hand-off identifiers, so no result moves.
- **PREVIOUSLY STATED (pre-audit):** the B72 suite is skipped in CI. **NOW:** it runs and passes 5 of 5. **REASON:** `vitest.config.ts:10` always sets `DATABASE_URL`.

## New findings
- **`#1249`** — in-window deploys are not announced to the window's owner (Langston, Step 8). Surfaced for Kyle, not placed.
- **(b-observe)(i) fired:** 14 strong_bull_trend xStock paper opens in the first session (> 10). Reported to Kyle 2026-11-05 with the trades. It is an observation with no cause claimed; the stay-on disposition is row 52's.
- **(a′) residue:** 203 matched rows (0.479 %) differ beyond rounding (max 0.1192). Mechanism: a HYPOTHESIS only (the minute-before join arm picking a different cycle's scan). Inside the allowance; no batch.

## Honest residual
- The ±0.35 guard thresholds were set on crypto's DBS scale; whether they suit xStock is a Phase-25 calibration question (scope F3). This batch makes the guards live; it does not show they are right for xStock.
- strong_bull_trend's first 12 xStock closes are all losses (−1.386 % mean, one session). That is evidence for row 52's window and for calibration, not a verdict on this batch.

## Governance — tier ledger
CHANGE-CLASS: architecture

| # | document | verdict | one line |
|---|---|---|---|
| T1 | `BATCH_CATALOG.md` | ✅ | entry added |
| T1 | `PHASE_HISTORY.md` | ✅ | entry added |
| T1 | the running plan — `SPRINT_TO_LIVE_PLAN.md` (`PHASE_19_PLAN.md` takes no new rows, Langston 2026-09-30) | ✅ | pre-sprint stage 00 order 4 marked closed, open items named |
| T1 | shared `MEMORY.md` + own `MEMORY_CC_B.md` | ✅ mine / N/A shared | own file: position updated; shared: no project-wide truth changed |
| T1 | the batch `SCOPE` | ✅ | written at Step 1 (r1b → r4), unchanged at close |
| T1 | the batch `PRE_AUDIT` | ✅ | (a′) tolerance and coverage swept at both copies (Langston Step-8 fold-in 1) |
| T1 | this completion report | ✅ | this file |
| T1 | the four session task lists (`CC_A`, `CC_B`, `CC_C`, `CC_INFRA`) | ✅ mine / N/A ×3 | CC-B item 2 closed, KD-7 follow-on kept; the other three not mine |
| T1 | Langston's `MEMORY.md` | ✅ | written by Langston at the close (read back at his line 136) |
| T2 | `SYSTEM_MANUAL.md` | ✅ | xStock DBS chapter: the hand-off correction after invariant 6, the new settings, the F3 calibration caveat |
| T2 | `SYSTEM_IMPACT_MAP.md` | ✅ | strong-trend override row corrected (scope r4-5) and now settings-backed; new row for the xStock detect-input hand-off |
| T2 | `RUNNING_ISSUES.md` | ✅ | `#1235` annotated (defect closed, F2 open); `#1249` filed |
| T2 | `CHANGES_AND_FIXES.md` | N/A | the fix is recorded in `#1235`, this report and the catalog; not a hotfix |
| T2 | `POST_AUDIT_ROADMAP.md` | N/A | no roadmap change (F3 already sits with Phase 25) |
| T2 | `ADJUSTMENT_FRAMEWORK.md` | N/A | three settings rows seeded at the values the code already used; no parameter-governance change |
| T2 | `AUTHORITY_BASELINE.md` | N/A | no baseline change |
| T2 | `STORAGE_POLICY.md` | N/A | one additive jsonb key; no retention change |
| T2 | `MULTI_ASSET_VTS_EXPANSION_PLAN.md` | N/A | reviewed the xStock 15-minute working list; nothing in it is reset by this batch |
| T2 | `ASSET_CLASS_ONBOARDING_WORKFLOW.md` | N/A | no new onboarding learning beyond `#560`'s class (computed, then dropped in transit), already captured |
| T2 | `BUILD_METHOD_PLAYBOOK.md` | N/A | method unchanged |
| T2 | `LANGSTON_ARCHITECTURE.md` | N/A | reviewer build unchanged |
| T2 | `CLAUDE.md` / `CONDUCT.md` | N/A | no rule change |
| T2 | `GOVERNANCE_EXCEPTIONS.md` | ✅ | the 2026-11-05 declared-open row flipped to `open-retired` before the open-age nag is resolved |
