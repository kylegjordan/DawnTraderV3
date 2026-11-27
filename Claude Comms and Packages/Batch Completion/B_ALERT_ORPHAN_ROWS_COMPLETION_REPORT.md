# B-ALERT-ORPHAN-ROWS — Completion report

**Step 11 submitted for Coltrane confirmation.** CC-B row 3c, #1255 R-1, KD-116 and KD-126. **Historical C-2 is closed unproven under Kyle’s exception.** The original 02:31:33 UTC generated row statements are unavailable. The contemporaneous comparison result was reported as 12/12, and the committed rollback file, aggregate output, and independent database and System Alerts evidence are retained. CC-B owns the wider `#1267` user-link census in `PRE_LIVE_SPRINT.md`, **Legacy and dead-code cleanup**, before #1264. Its review must count orphans by table and trace writers before deciding where enforcement fits. The current cleanup’s governance alert remains open until normal sign-off.

## Registered readback and decision

The registered O1 criterion in `B_ALERT_ORPHAN_ROWS_SCOPE.md` was “orphan count = **0**; total rows = `pre_total − pre_orphans`, both from the same pre-deploy read.” The C-2 condition required “immediately before deploy, the generator in the rollback header is re-run on staging and its output must match the file line-for-line, else the file is regenerated and re-committed first.”

Staging Phase A served `5ecd7ee24fb7a741e8e015e0e6a262a464e7d016`, restart 716. ANALYST’s original preflight stdout at `75790fcea60100b66a456dd1bf29894ac0c318f7` recorded 5,936 operator alerts and 12 orphans at 02:31:33.848808 UTC, setting an expected total of 5,924. The migration ledger records the forward migration at 02:32:03.327920 UTC. The 02:43 UTC staging read recorded 5,924 rows and zero orphans. The second read repeated both counts and matched zero of the 12 rollback primary keys against the whole table. Coltrane repeated the database read and found a known-present row through the same key lookup. His counterexample reparented all 12 in a read-only fixture: the orphan filter reported zero while the key lookup still found the target rows. Chrome rendered two linked operator alerts before sign-off. This verifies the expected total and absence of the exact rollback IDs in the measured read. A complete survivor-ID comparison would require a retained preflight snapshot of every other ID.

The retained stdout shows the command reported its ordered 12/12 comparison. The original generated rows were consumed during the command. The tracked rollback blob `eca6c17dec44a63df2687a57872971e9ef0dc5b3` contains the expected statements and gives an exact comparison target. Under KD-126 at `06f1e278c6529d457317acb394083ccb26d14be3`, Kyle accepted the missing historical independent comparison. Coltrane confirmed Step 8 on November 27 at 03:30:17 UTC on `dbf3f76e91cb41ebf668659cbe31f692e1f5ad35` with that boundary. The rollback file remains tracked and was unused in the Phase A cleanup.

## Objectives

| Objective | Result | Evidence |
|---|---|---|
| O1 · Remove the orphaned staging operator alerts | YES | Retained aggregate, migration ledger, two matching staging counts, exact key lookup with positive control and independent System Alerts read. See change list §§6–8. |
| O2 · Retain the exact-restore rollback record, including historical preflight evidence | PARTIAL · C-2 CLOSED-UNPROVEN | The Phase A rollback file carries 12 distinct statements with `ON CONFLICT DO NOTHING`. Its runtime execution was outside this cleanup. The historical C-2 comparison is reported 12/12. Independent closure of that sub-claim would require the original ordered generator output; a present-day rerun cannot supply it. Kyle accepted this limit under KD-126. |
| O3 · Resolve the database user-link design | YES | Coltrane’s November 22 ruling `1574139970585886853` leaves the user link to the separate #1267 census. This migration applies only to the orphaned data rows. |

## CI and records

- Phase A run `45589022150` at `5ecd7ee24`: TypeScript Check, Test Suite, Build and Docker Build all passed.
- Step 10 `e0a18855fb369763a05052fc4e4c513d5fcdf3c4`: topic run `45937406031`, all four jobs passed before the shared fast-forward.
- Source evidence: `B_ALERT_ORPHAN_ROWS_STEP4_CHANGE_LIST.md` §§6–8 and KD-126, ANALYST preflight stdout at `75790fcea`, and the Phase A rollback blob recorded above.

The two rendered linked alerts establish that System Alerts remained populated for the signed-in user. The database key read supplies the evidence about the 12 targets.

`REVIEWER: claim-only · what objects distinguish deletion, reparenting, matching totals and historical C-2 equality? · HIT: exact IDs separate reparenting; aggregate/key checks are narrower than a full survivor comparison; rendered linked items test UI delivery; historical ordered rows are unavailable · re-derived y`

## Governance files and Tier Ledger

Step 10 ledger from the change list at `e0a18855f`, with the completion-report row updated for this submission.

| Tier | Document | Verdict | Record |
|---|---|---|---|
| T1 | BATCH_CATALOG.md | ✅ | Record the Phase A cleanup, retained rollback and KD-126 evidence limit. |
| T1 | PHASE_HISTORY.md | ✅ | Record the Nov 26 Phase A deletion and verified readback. |
| T1 | SPRINT_TO_LIVE_PLAN.md | ✅ | Reconcile CC-B row 3c with KD-126 and the #1267 follow-up. |
| T1 | PHASE_19_PLAN.md | N/A | No batch row is in flight in Phase 19. |
| T1 | Shared MEMORY.md and MEMORY_CC_B.md | ✅ | Record the retained rollback, evidence exception and return to final sign-off. |
| T1 | SCOPE | ✅ | The reviewed Step 1 scope is tracked. |
| T1 | PRE_AUDIT | ✅ | The reviewed Step 2 audit and plan is tracked. |
| T1 | COMPLETION_REPORT | ✅ Filed | This document. Coltrane’s Step 11 confirmation is pending. |
| T1 | Observation column | N/A | The scope uses immediate post-migration readback and carries no elapsed observation. |
| T1 | CC_A, CC_B, CC_C and CC_INFRA SESSION_TASK_LISTs | ✅ CC-B / N/A ×3 | CC-B records the sign-off path and the other lists belong to their owners. |
| T1 | Coltrane memory store | ✅ | Record the KD-126 evidence boundary and rollback for future review. |
| T2 | SYSTEM_MANUAL.md | ✅ | Record the data-only cleanup and the unchanged user-link design. |
| T2 | SYSTEM_IMPACT_MAP.md | ✅ | Record the historical cleanup and rollback in the operator alert store. |
| T2 | RUNNING_ISSUES.md | ✅ | Annotate #1255 R-1 and retain #1267 as the separate user-link census. |
| T2 | CHANGES_AND_FIXES.md | ✅ | Record the removal and the historical verification exception. |
| T2 | POST_AUDIT_ROADMAP.md | N/A | The 12-row cleanup adds no roadmap phase. |
| T2 | ADJUSTMENT_FRAMEWORK.md | N/A | The migration changes operator alert rows only. |
| T2 | AUTHORITY_BASELINE.md | N/A | The batch uses the existing decision and review authority. |
| T2 | STORAGE_POLICY.md | N/A | The one-time deletion changes no retention policy. |
| T2 | MULTI_ASSET_VTS_EXPANSION_PLAN.md | N/A | Working list reviewed and the operator-alert migration touches none of its calibration inputs. |
| T2 | ASSET_CLASS_ONBOARDING_WORKFLOW.md | N/A | The batch introduces no asset class or onboarding step. |
| T2 | BUILD_METHOD_PLAYBOOK.md | N/A | The batch follows the existing workflow. |
| T2 | LANGSTON_ARCHITECTURE.md | N/A | The batch changes no reviewer runtime or access. |
| T2 | CLAUDE.md / CONDUCT.md | N/A | The implementation changes no project rule. |
| T2 | CLAUDE_MD_RULE_HISTORY.md | N/A | The batch contains no CLAUDE.md rule revision. |
| T2 | DELETED_COMPONENTS_LOG.md | N/A | The migration removes rows and preserves the alert service and schema. |
| T2 | MISTAKE_PATTERNS.md | N/A | The batch adds no mistake trailer or weekly pass. |
| T2 | GOVERNANCE_EXCEPTIONS.md | N/A | KD-126 is an evidence exception in DECISIONS.md and the change list, with no governance-timing waiver. |
| T2 | ALERT_HANDLING_PROTOCOL.md | N/A | Acknowledgement and resolution rules still apply as written. |
| T2 | DELIVERY_BOARD_PROTOCOL.md | N/A | The existing board status and fields support the closeout. |
| T2 | CLAUDE_CODE_FEATURE_WATCH.md | N/A | The batch includes no daily feature or model review. |
