# B-STORAGE-HARDEN — Wave C Completion Report (OBJ-2: the B70 never-drop tiering fix)

**Batch:** B-STORAGE-HARDEN (Wave C) · **change-class:** architecture · **Owner:** CC-A · **Reviewer:** Langston
**Date:** 2026-07-08 · **Commit:** `0c22d0293` · **CI:** 4-green `28906998071` · **Deploy:** staging (migration-first) HTTP 200
**Scope:** `B_STORAGE_HARDEN_WAVE_C_SCOPE.md` · **Pre-audit:** `B_STORAGE_HARDEN_WAVE_C_PRE_AUDIT.md`

> **Wave C covers OBJ-2 only.** The batch stays OPEN — Wave D (OBJ-4 capture-reduction → OBJ-3 daily partitions) remains. This resolves the core never-drop violation (RUNNING_ISSUES #430 V1).

## Objective
| Obj | Status | Evidence |
|---|---|---|
| **OBJ-2 — tier the B70 analytics tables (never-drop)** | ✅ **YES** | 5 tables added to the B75 sweep's `B70_TABLES` inventory; migration seeded 5 `hot_retention_days=90` keys (5/5 verified); `b70-retention-sweep.ts` DELETED + archived; proven end-to-end on `exit_decision_archive/2026-05`. |
| OBJ-4 / OBJ-3 (Wave D) | ⬜ OPEN | xStock capture reduction (consumer audit first) → daily partitions. |

## What shipped
The 5 B70 analytics tables (`signal_eval_archive`, `pair_scan_archive`, `exit_decision_archive`, `macro_feed_archive`, `signal_eval_provenance` — ~38 GB) were DROP-only at 90 days, violating Kyle's 2026-05-06 never-drop directive. They're monthly RANGE-partitioned by `captured_at` (= B74 shape), so Wave C routes them through the SAME proven B75 export→warm→cold move-not-delete path. **All 5 KEEP; none dropped.**
- `b75-retention-sweep.ts`: NEW `B70_TABLES` inventory + `PARTITIONED_TABLES=[...B74,...B70]` + O_EXCL run-lock (finally-safe).
- Migration `2026-07-08-…-b70-retention.sql`: 5 keys, ON CONFLICT DO NOTHING. Deploy-order hard-fail gate (migrate + verify-5 FIRST, then restart).
- `b70-retention-sweep.ts` DELETED (rule 18 → `.removed` + DELETED_COMPONENTS_LOG); paused cron removed. `b70-create-monthly-partitions` stays.
- Q2 catch: `archive-config.retentionDays` KEPT (live Drift Dashboard consumer found by repo-wide grep) — informational-only. #432 folded (`Number()` coercion).

## Verification (Step-7 — all met)
- Migration: 5/5 keys = 90; balance-policy state intact after an incidental idempotent b8-2 re-apply (live=824.11/paper=878, anchor v1) — the b8-2 "pending" is a db:migrate ledger gap → #437.
- hot→warm: `exit_decision_archive/2026-05` exported (8.18 MB → 930 KB, 8.79×), download-verified, dropped-after-verify.
- warm download-verify: sha256 match (`ed857220…`).
- warm→cold: cold `state=active`, `verified_at` auto-stamped (Wave-A r4 fix on a B70 object), warm→migrated; `bytes_moved=930029` summed (#432 fix live).
- rehydrate from B2: sha256 match → full hot→warm→cold+restore proven.
- b70 DROP cron removed; run-lock in place; Q3 §13 alert scheduled (`27860643`, 2026-08-30).
- CI 4-green; bench green (tsc + 26/26 archive tests).

## Langston review trail
Step-1 APPROVED (6 Qs) → Step-2 APPROVED-to-implement (5 conditions: A measured-memory-gate-cleared / B run-lock / C DDL-confirmed / D migrate-first / E governance-content) → Step-4 APPROVED-for-push (Q2 reversal verified, migration-comment fix, §15 archive confirm) → **Step-8: full chain endorsed; System Manual + SIM content-update disposition confirmed.**

## Governance files updated
`SYSTEM_MANUAL.md` (retention chapter + cron table — DROP-at-90d now false), `SYSTEM_IMPACT_MAP.md` (B70 inventory), `CHANGES_AND_FIXES.md` (FIX-2026-07-08-B), `RUNNING_ISSUES.md` (#430 FULLY RESOLVED + #432 resolved + #431/#433 re-homed + #437 new), `DELETED_COMPONENTS_LOG.md`, `BATCH_CATALOG.md`, `PHASE_HISTORY.md`, `PHASE_19_PLAN.md` §5, this report, MEMORY_CC_A + Langston MEMORY. Migration + rollback in `drizzle/migrations/` + MANIFEST.

## The one Kyle decision (at close)
`pair_scan_archive` KEEP→cold (Langston Step-1: net expectancy favors keep — cold ~$0.006/GB-mo is negligible vs the analytic value of the raw producer-agnostic scan substrate). **Recommendation: YES, keep it (archived to cold, not deleted).** Confirm.

## Remaining (Wave D)
OBJ-4 (reduce xStock ticker capture cost, after a consumer audit) → OBJ-3 (rolling-30 daily partitions). Follow-ups homed: #431 (canary deleteCold accumulation), #433 (dup module_constants row + missing-unique check), #437 (db:migrate ledger drift).
