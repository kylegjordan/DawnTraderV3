# B-XSTOCK-SNAPSHOT-RETENTION — Step 10 governance reconciliation

Date: 2026-11-12
Owner: ANALYST Codex (CC-C stand-in)
Change class: `architecture`
Runtime: deployed `fbbe0b5e4af86be3a87fa0d6c2362f3e7bc899e4`
Independent verification: Coltrane PROCEED at exact ref `33e5162af1fbb460fddec9b204322fcb9fe8528e`

## Final contract reconciled

- Hot retention is 30 complete UTC days plus the newest 240 fifteen-minute / 60 sixty-minute rows per symbol.
- Older complete days move through one kernel-locked B75 lane. Source, exported and downloaded counts, ordered keys, canonical full rows and checksum must agree before the proven keys are deleted.
- Initial exercised proof: 100 fifteen-minute objects / 2,163,663 rows and 111 sixty-minute objects / 573,523 rows, all source-count-matched.
- The frozen selector then returned zero eligible rows against 495-symbol controls; both writers advanced and the next run deleted zero.
- Known limits: future provider/database availability is not proven; contention defers work; ordinary vacuum need not shrink relation files immediately.

CHANGE-CLASS: architecture

| # | document | verdict | one-line reason |
|---|---|---|---|
| T1 | `BATCH_CATALOG.md` | ✅ | Added the Step-10 architecture record, exercised totals and known limits. |
| T1 | `PHASE_HISTORY.md` | ✅ | Added the dated Step-10 lifecycle result and pending Step-11 boundary. |
| T1 | active `SPRINT_TO_LIVE_PLAN.md` row | ✅ | Advanced pre-sprint Stage 3 order 6 to Step 10 complete with deploy and evidence refs. |
| T1 | `PHASE_19_PLAN.md` | N/A | This non-`P19-*` batch has no row there. |
| T1 | shared `MEMORY.md` + `MEMORY_CC_C.md` | ✅ | Added the retention invariant and advanced Analyst position to Step 11 while keeping both files under cap. |
| T1 | batch `SCOPE` | ✅ | Recorded the seven-objective green disposition and exact exercised populations. |
| T1 | batch `PRE_AUDIT` | ✅ | Reconciled P1-P10 to the deployed design, live values and known limits. |
| T1 | `COMPLETION_REPORT` | ✅ | Step 11 creates the final report from this exact ledger; no report is written early. |
| T1 | `Observation` column | N/A | The registered natural-writer and next-run proof completed inside Step 7; no post-close window remains. |
| T1 | four session task lists | ✅ mine / N/A ×3 | Updated `CC_C_SESSION_TASK_LIST.md`; the OLD, NEW and INFRA lists are not mine. |
| T1 | Langston `/home/langston/MEMORY.md` | ✅ | Replaced a fetchable B75 mechanics line with the retention invariant; loaded set fell 143,031 → 143,004 bytes. |
| T2 | `SYSTEM_MANUAL.md` | ✅ | Corrected false stored-row bounds and documented the ranked archive/delete lifecycle. |
| T2 | `SYSTEM_IMPACT_MAP.md` | ✅ | Corrected both snapshot components and added the retention lifecycle component. |
| T2 | `RUNNING_ISSUES.md` | ✅ | Marked `#1194` fixed with exact exercised evidence; Step 11 close remains explicit. |
| T2 | `CHANGES_AND_FIXES.md` | ✅ | Added the defect, repair, evidence and known-limit record. |
| T2 | `POST_AUDIT_ROADMAP.md` | N/A | The batch changes no phase-level sequence or roadmap item. |
| T2 | `ADJUSTMENT_FRAMEWORK.md` | N/A | No strategy, regime, filter or calibration parameter changed. |
| T2 | `AUTHORITY_BASELINE.md` | N/A | No constitutional authority or decision boundary changed. |
| T2 | `STORAGE_POLICY.md` | ✅ | Added both tables, 30-day-plus-floor policy, proof contract, kernel launcher and exercised manifest evidence. |
| T2 | `MULTI_ASSET_VTS_EXPANSION_PLAN.md` | ✅ | Reviewed the 15-minute working list: no status/epoch change; older eras now require proven rehydrate. |
| T2 | `ASSET_CLASS_ONBOARDING_WORKFLOW.md` | N/A | No asset-class onboarding learning or new class was introduced. |
| T2 | `BUILD_METHOD_PLAYBOOK.md` | N/A | No role, workflow gate or build method changed. |
| T2 | `LANGSTON_ARCHITECTURE.md` | N/A | The reviewer runtime, invocation and read path are unchanged. |
| T2 | `CLAUDE.md` / `CONDUCT.md` | N/A | No stable crew rule changed. |
| T2 | `_archive/CLAUDE_MD_RULE_HISTORY.md` | N/A | `CLAUDE.md` was not changed. |
| T2 | `DELETED_COMPONENTS_LOG.md` | ✅ | Recorded the retired age-reclaimed/unlinked O_EXCL sweep lock and its checked-in kernel-lock replacement; this ledger omission was found and filled during Step 11. |
| T2 | `MISTAKE_PATTERNS.md` | N/A | No `MISTAKE:` trailer was written and no weekly pass ran. |
| T2 | `GOVERNANCE_EXCEPTIONS.md` | N/A | Kyle granted no exception to a governed rule. |
| T2 | `ALERT_HANDLING_PROTOCOL.md` | N/A | Alert acknowledgement and resolution semantics are unchanged; separate waits remain open. |
| T2 | `DELIVERY_BOARD_PROTOCOL.md` | N/A | Existing protocol was followed; only the card status moved to Governance. |
| T2 | `CLAUDE_CODE_FEATURE_WATCH.md` | N/A | The daily model/feature check did not run in this batch. |

## Delivery Board

Card `PVTI_lAHODmulEM4BfQP4zhAulos` is `Governance`, `Review = Approved`, `Blocked on = Nothing`, owner `Analyst`, phase `Phase 19`.

## Step 11 handoff

Create the completion report by transcribing the ledger above from the Step-10 commit, change the plan/catalog/history/issue/task-list records from Step-10-pending to closed, obtain Coltrane's exact-ref confirmation, move the card to Complete, and preserve every separate alert/window wait.
