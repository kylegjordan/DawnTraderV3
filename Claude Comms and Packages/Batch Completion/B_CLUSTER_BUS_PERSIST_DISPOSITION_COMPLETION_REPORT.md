# B-CLUSTER-BUS-PERSIST-DISPOSITION — Completion Report

**Owner:** CC-B (NEW Claude) · **change-class:** `non_architecture` · **Sprint plan row:** 2a0c, after row 2a0b · **Issue:** `#1159` (closed at Step 10); `#1163` (row 2a0e) unchanged
**Scope / pre-audit:** `Claude Comms and Packages/Scope Files/B_CLUSTER_BUS_PERSIST_DISPOSITION_SCOPE.md` r2, `…_PRE_AUDIT.md` · **Change list:** `Change Lists/B_CLUSTER_BUS_PERSIST_DISPOSITION_STEP4_CHANGE_LIST.md`
**Code:** `b523c86bf` (Step 3) → `9ab39a45a` (Step-4 conditions, APPROVED) · **Deployed:** in CC-C's 10-10 release `ad01f5339b558ee968a7686d719e98b66e5fd01d` (2026-10-10T11:59:29Z); migration applied 2026-10-10 11:59:18.507Z. The running tree is now `a52f16a52`, a descendant; Langston confirmed the batch's five files unchanged from the approved bytes.

## 1. What it was for
The cluster bus wrote a database row for every event on seven topics into `cluster_bus_event`. After row 2a0b removed its main writer (the engine heartbeat's status event), the table had no reader at all — only about 22 non-heartbeat rows ever, the newest from 2025-11-06 (`#1159`). This batch kept the in-memory bus, which live code uses, and removed the persistence.

## 2. What shipped
| item | change |
|---|---|
| the bus | `server/services/cluster-bus.ts` — `publish()` keeps its signature and only emits to in-process subscribers; the persist branch, `persistTopics` and the `db` imports removed |
| the schema | `shared/schema.ts` — the table, its enum and their types removed; `BusEventTopic` kept as a plain union of the same eight labels |
| the retention | `b75-retention-sweep.ts` — the table's entry removed, with its `data_lifecycle` seed (the two must leave together: the sweep reads every registered key before it starts) |
| the migration | `2026-10-07-b-cluster-bus-persist-remove.sql` — delete the seed, drop the table, drop the type, no `CASCADE`, one transaction; rollback tracked, **run it FIRST, then revert the code** |
| tests | `b-cluster-bus-persist-remove.test.ts` (6) + 2a0b's fence inverted; mutant (`CASCADE` added) caught |

## 3. Objectives
| # | objective | verdict | evidence |
|---|---|---|---|
| 1 | remove the database write; the in-memory emit unchanged | **YES** | unit test: a formerly persisted topic reaches a subscriber with a `db` mock that throws on any access, zero touches; fences on the bus's imports |
| 2 | drop the table, and the retention entry + seed in the same deploy | **YES** | staging (Langston re-derived): `to_regclass('public.cluster_bus_event')` NULL (control `closed_trades` resolves), 0 `bus_event_topic` types against 96 live enums, 0 leftover objects, 0 columns typed on it, the seed gone against 17 other `hot_retention_days` keys. **The gate:** the 2026-10-11 02:15Z sweep (`b75-retention.log` lines 2249-2273) printed no `cluster_bus_event` line against 3 other plain-table lines in the same block, `failed=0 plain_failed=0`, and `plain_deleted = 137,376` = `xstock_qd_probe_history` alone — the total fell by exactly the removed table's share (10-09: 140,264 incl. 2,888; 10-10: 140,254 incl. 2,878) |
| 3 | census of every reader before the cut | **YES** | the pre-audit's tree-wide census (code, scripts, reports, exported types): no reader survived the cut |

## 4. Reviews
- **Step 1:** PROCEED (Langston), C1-C5 carried; the wider cluster layer homed at row 2a0e (`#1163`).
- **Step 2:** PROCEED — rollback order corrected (the SQL first, then the code).
- **Step 4:** APPROVED at `9ab39a45a`, recorded by CC-C at the 10-10 release (Langston 11:57Z, re-affirmed 14:16Z).
- **Step 7:** CC-B, `Scope Files/RELEASE_DEPLOY_2026-10-10_PLAN.md` row 2a0c — table and type gone (10-10), the 10-11 sweep (above).
- **Step 8:** **CONFIRMED** by Langston 2026-10-11, re-derived on staging. He settled the question the evidence alone did not — by design, not swallowed: the plain-table list has exactly three entries, and a stale entry would have aborted the whole sweep before its `started at` line, so a complete block is itself proof there is no stale entry.

## 5. Numeric corrections
- **PREVIOUSLY STATED** (change list): the System Manual inventory row at `:11053`. **NOW:** `:11078`, and its section mirror `sections/PHASE11_DATABASE_SCHEMA_AND_MIGRATIONS.md:182`. **REASON:** line drift since Step 4; the mirror was not cited. Both removed at Step 10.
- **PREVIOUSLY STATED** (change list): the `STORAGE_POLICY.md:51` row. **NOW:** `:51` and `:56` (the delete-exceptions bullet). Both handled at Step 10.

## 6. New findings / dispositions
- **A comment, attributed to Langston, asserted the opposite of the deploy-ordering premise** (`b75-retention-sweep.ts:101`: *"a B70 config gap fails ONLY that table's `reqNum`, never a B74 table"*). At the ref `reqNum` throws and nothing catches it, so a missing key on any entry aborts the whole night's sweep — which is why the rollback must restore the seed first. **Disposition 1, folded:** the comment corrected at Step 10 beside the rollback it protects. A wrong comment, not a code defect.

## 7. Governance ledger
CHANGE-CLASS: non_architecture

| tier | document | verdict | one line |
|---|---|---|---|
| T1 | BATCH_CATALOG.md | ✅ | entry |
| T1 | PHASE_HISTORY.md | ✅ | plain-language entry |
| T1 | SPRINT_TO_LIVE_PLAN.md (row 2a0c) | ✅ | at Step 11 with this report in the report column |
| T1 | PHASE_19_PLAN.md | N/A — no row there | the row is sprint row 2a0c |
| T1 | shared MEMORY.md + MEMORY_CC_B.md | ✅ mine / N/A shared | mine: position |
| T1 | the batch SCOPE | ✅ | r2 |
| T1 | the batch PRE_AUDIT | ✅ | with the reader census and the corrected rollback order |
| T1 | COMPLETION_REPORT | ✅ | this file |
| T1 | the four session task lists | ✅ mine / N/A ×3 | CC-B: 2a0c moved to Step 11 |
| T1 | Langston's MEMORY.md | ⏳ owed at Step 11 | Langston writes his own with his Step-11 confirm; ticked when the write lands |
| T2 | SYSTEM_MANUAL.md | ✅ | Step 10: the table-inventory row removed (`:11078` and its section mirror); §20 (the Phase 17 cluster layer) annotated — the bus is in-memory only, the layer is `#1163`'s |
| T2 | SYSTEM_IMPACT_MAP.md | ✅ | Step 10: the cluster bus as cross-cutting state — in-memory only, what was removed, the rollback order, the remaining publishers |
| T2 | RUNNING_ISSUES.md | ✅ | `#1159` closed |
| T2 | STORAGE_POLICY.md | ✅ | Step 10: the `:51` row removed and the `:56` delete-exception struck with the drop recorded |
| T2 | DELETED_COMPONENTS_LOG.md | ✅ | Step 10: table, enum, persist branch, retention entry and seed, with the archive copy and the rollback |
| T2 | CHANGES_AND_FIXES.md | N/A | legacy removal of a write-only table, not a trading-system bug or risk |
| T2 | POST_AUDIT_ROADMAP.md · ADJUSTMENT_FRAMEWORK.md · AUTHORITY_BASELINE.md · MULTI_ASSET_VTS_EXPANSION_PLAN.md · ASSET_CLASS_ONBOARDING_WORKFLOW.md · BUILD_METHOD_PLAYBOOK.md · LANGSTON_ARCHITECTURE.md · CLAUDE.md / CONDUCT.md · PRE_LIVE_SPRINT.md | N/A | not touched by an internal table removal |
| T2 | MISTAKE_PATTERNS.md | N/A | no new instance |

## 8. Honest residual
- The table's ~269k rows went with the `DROP`; the rollback recreates it empty.
- The Phase 17-22 cluster layer still runs and now leaves no record of anything it does; whether it stays is `#1163` (row 2a0e).
