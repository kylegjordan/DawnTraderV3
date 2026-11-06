# B-VTS-TELEMETRY-AGGREGATES — COMPLETION REPORT

**Batch:** `B-VTS-TELEMETRY-AGGREGATES` · owner CC-C · sprint row 4a · `#1141` · **change-class `non_architecture`** (scope header).
**State:** ✅ CLOSED 2026-11-06 — Step 11 CONFIRMED by Langston (Discord `1568233493538934946`, re-read at `0ca665c8e`). Written 2026-11-06. ⚠️ His note 1: the Step-10 ledger marked `SPRINT_TO_LIVE_PLAN` ✅ at `9b0e047ba` while row 4a still read IN FLIGHT with a dash report cell and cited the withdrawn decrease arm; `75aeb7fad` fixed it after the checker's alert `712203c4` (resolved with that sha).

## OPEN ITEMS AND LIMITS — STATED FIRST
1. **The eviction is evidenced on ONE arm, not two (Langston, Step 8).** The "a cell's tradeCount fell" arm is WITHDRAWN as non-discriminating: the old code also reassigned cells that had trades in the window, so their counts could fall before the fix too. The 13 decreases of 2026-10-08 are real and prove nothing about this batch. The discharging evidence is the ABSENT arm (below).
2. **The empty-window clear path (`vts-telemetry.ts`, the `totalProcessed === 0` branch) has never run.** It writes no snapshot by design, so the snapshot record can never show it either way; its only trace is the log line `No entries in the 7-day window — store cleared, no snapshot`, measured at 0 against a reaching `[11.7B][Telemetry]` control (Langston's measurement, Step 8). No silence may be cited for it.
3. **No live decision reads these values today** (pre-audit r3 §B1: every reader is shadow, log-only, manual or unreachable). The fix makes the store honest before anything starts deciding on it; it does not change a trade.
4. **Out of scope, homed:** the never-count records, class pooling and the pWin-corpus fence → row 148a `B-PWIN-CALIBRATION` (CC-A).

## 1. WHAT THE BATCH IS FOR, AND WHAT SHIPPED
The VTS keeps a 7-day store of win rate and P&L for every regime × strategy pair; the SQE's predictive confidence reads it. Two lookup defects made it answer with the wrong numbers:
- **The `SKIPPED` fallback is gone (objective 1).** A strategy with no cell of its own used to be answered with ANOTHER strategy's metrics under its name; now it gets its own cell or nothing (neutral 0.5).
- **Each run REPLACES the store (objective 2).** It used to merge, so a pair with no trade in the window kept its last win rate until the next restart (224 such cells in 170 of 926 retained snapshots). Now the store is exactly what the window yields.
- **Skip ratio relabelled regime-level (objective 3, Step 2's choice):** relabel only; the archive column is not re-keyed, so no historical row changes meaning.
- **Rule 18 (objective 4):** `getAdjustedMinROI`, `getAdaptiveExpectancy`, `checkExpectancyDrift`, `checkConfidenceDrift` (+ its log path), `clearPredictiveConfidenceCache`, `simulateTrade` deleted (`DELETED_COMPONENTS_LOG` 2026-10-06; archived under `_archive/deleted-code/`).
- **The `ready_to_buy_service.ts` "third call site" comment restated as history (objective 5).**
- **Step 10 (Langston's Step-8 carry 2):** the comment that called a gap in the manifest's versions "an empty-window run" is corrected — `version` is in-memory and restarts with the process, so no such record exists.

## 2. EVERY STEP, WITH ITS EVIDENCE
- **Step 1:** scope r1 at `c0045ae5a` (measure-first: the fallback never fired, stale cells in 18% of 926 snapshots); Langston's six conditions folded at Step 2.
- **Step 2:** `Scope Files/B_VTS_TELEMETRY_AGGREGATES_PRE_AUDIT.md` (`5ebeb3ff5`), P1-P6.
- **Step 3:** `d4c688b88`; Step-4 send-back folded at `03fc60c11` and `c8a35d6d9`.
- **Step 4:** APPROVED by Langston 2026-10-07 01:05Z at `c8a35d6d9` (`60a8ea58e`), conditions folded. Change list `Change Lists/B_VTS_TELEMETRY_AGGREGATES_CHANGE_LIST.md`.
- **Steps 5-6:** deployed in release 2026-10-07, `dt-deploy 0c8ef5da2582e03effd21070fb09b9ad5715ed77 --by cc-b` at 15:56:00Z (CI `37566679783` success on that exact head).
- **Step 7 (CC-C, 2026-10-07):** deployment proof — the new process's first aggregation (`…_VTS_2241.json`, 15:55:57Z) held 22 cells, 0 stale. My discriminating criterion tested the wrong gap (6 hours, not the 7-day window): `MISTAKE: wrong-object`, recorded in `Change Lists/RELEASE_DEPLOY_2026-10-07_PLAN.md`.
- **Step 8:** Langston 2026-10-07 confirmed deployment proof only and re-registered the eviction criterion. Read 2026-11-06: RANGE_BOUND_STABLE/morning_star, present in `_VTS_2336`, ABSENT in `…2026-10-10_VTS_1899.json` (03:55Z); the manifest's `version` ran monotone from 1 at the deploy boot to 11 at that snapshot (Langston's enumeration of `regime_performance_manifest.json`, Step 8), so it is the same process lifetime — which rules out the old code's restart reset. **CONFIRMED by Langston 2026-11-06 (Discord `1568213302369194096`), re-derived at `a85e1b10b`, on the absent arm.**
- **Step 9:** none.
- **Step 10:** this turn, plus the comment correction in `server/core/logging/vts-telemetry.ts` (comment only; CI on the commit).

## 3. OBJECTIVES
| # | objective | result | evidence |
|---|---|---|---|
| 1 | delete the `SKIPPED` fallback | **YES** | unit test + fence (`b-vts-telemetry-aggregates.test.ts`: the fallback text is gone); Step 4 |
| 2 | evict stale cells — each run replaces the store | **YES, on the absent arm** | Step 8 above; the decrease arm withdrawn (item 1 above) |
| 3 | the regime-level skip ratio | **YES (relabel only)** | Step 2's choice; P3 |
| 4 | rule 18 deletions | **YES** | `DELETED_COMPONENTS_LOG` 2026-10-06 entry; fence test; tsc at Step 5 |
| 5 | the `:1112` comment restated | **YES** | P5 at the ref |

## 4. NEW FINDINGS
None owed beyond Langston's two Step-8 carries, both folded here (items 1-2 above and the comment fix).

## 5. GOVERNANCE — THE STEP-10 LEDGER
CHANGE-CLASS: non_architecture

| tier | document | verdict | line |
|---|---|---|---|
| R | scope | ✅ | `Scope Files/B_VTS_TELEMETRY_AGGREGATES_SCOPE.md` |
| R | pre-audit | ✅ | `Scope Files/B_VTS_TELEMETRY_AGGREGATES_PRE_AUDIT.md` |
| R | completion report | ✅ | this file |
| R | `BATCH_CATALOG.md` | ✅ | new entry |
| R | `PHASE_HISTORY.md` | ✅ | new entry |
| judged | `SYSTEM_MANUAL.md` | ✅ | the per-class ROI line no longer lists the deleted `getAdjustedMinROI` (pre-audit P6, required) |
| judged | `SYSTEM_IMPACT_MAP.md` | ✅ | new §8.3b, the VTS telemetry store: per-strategy lookup, replace-not-merge, the in-memory `version`, the unexercised clear path, its readers |
| judged | `LEVER_INVENTORY.md` | N/A | rows B72-CORE-008/009/010 were already struck at Step 3 (pre-audit P6) |
| judged | `DELETED_COMPONENTS_LOG.md` | ✅ | written at Step 3 (2026-10-06 entry) |
| judged | `RUNNING_ISSUES.md` | ✅ | `#1141` annotated with this close |
| judged | `CHANGES_AND_FIXES.md` | N/A | not a hotfix |
| judged | `POST_AUDIT_ROADMAP.md` | N/A | no roadmap item moves |
| judged | `ADJUSTMENT_FRAMEWORK.md` | N/A | no tunable or epoch |
| judged | `PHASE_19_PLAN.md` | N/A — no row there | a sprint-era row |
| plan | `SPRINT_TO_LIVE_PLAN.md` | ✅ | row 4a closed, report linked |
| — | shared `MEMORY.md` | N/A | no new consensus truth |
| — | `MEMORY_CC_C.md` | ✅ | position |
| — | Langston's `MEMORY.md` | N/A | no line on this batch (checked 2026-11-06) |
| T1 | session task lists (`CC_A`, `CC_B`, `CC_C`, `CC_INFRA`) | ✅ mine / N/A ×3 | `CC_C_SESSION_TASK_LIST.md` row 4a |
