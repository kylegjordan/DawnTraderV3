# B-ENGINE-HEARTBEAT-DEAD-PATHS — Completion Report

**Owner:** CC-B (NEW Claude) · **change-class:** `non_architecture` · **Sprint plan row:** 2a0b, after row 2a0 · **Issues:** `#1158` merged into `#521` (both closed), `#404` (closed); `#214` moved to row 2a0i
**Scope / pre-audit:** `Claude Comms and Packages/Scope Files/B_ENGINE_HEARTBEAT_DEAD_PATHS_SCOPE.md`, `…_PRE_AUDIT.md` · **Change list:** `Change Lists/B_ENGINE_HEARTBEAT_DEAD_PATHS_STEP4_CHANGE_LIST.md`
**Code:** `4a17ca8f4` (Step 3) → `cb246ba12` (r2) → `635e7132d` (r3) · **Deployed:** `0c8ef5da2582e03effd21070fb09b9ad5715ed77`, 2026-10-07T15:56:00Z; CI run `37566679783` on that sha, 4/4.

## 1. What it was for
The engine heartbeat had two dead paths. Its 30-second session check and its boot recovery both required a `session.userId` that the single-tenant `active_engine_sessions` row no longer carries, so they could never act (`#521`, found 2026-07-16; `#1158`, re-found 2026-10-06; `#404`). Every 30 seconds it also published cluster-bus events that nothing read. On 10-06 Kyle asked whether the "heartbeat" was the Central Clock; the provenance read showed it is not (pre-audit §1b). This batch removed the dead parts, kept and repaired the one live job, and settled what `/status` reports.

## 2. What shipped
| item | change |
|---|---|
| one orphan rule | `stopAndClearOrphanManager(mode, source)` + `healOrphanManagerQueued()`: stop the orphaned manager, then clear it, queued on `activeOperationQueue` (action `orphan-heal`) so it never runs beside a start or stop. The start path's orphan branch uses the same helper; before this it cleared without stopping |
| dead paths removed | `recoverSessions`, `checkSession`, the boot recovery call, the auto-test harness (file + route + import), `clearStaleBusyFlag` (zero callers), the bus's `getRecentEvents`/`cleanup` |
| publish removed | both `clusterBus.publish` calls on the heartbeat path |
| `/status` | `isRunning = hasManager` |
| flag writes | a failed `setEngineActive(true\|false)` raises `engine-start/stop-flag-write-failed-<mode>` (resolve, never ack), re-reading the system context first (r1 BLOCKER, r2) |
| retention | `cluster_bus_event` registered in `PLAIN_RETENTION_TABLES`, 30 days, seed migration in the same deploy |
| tests | `server/tests/unit/b-engine-heartbeat-dead-paths.test.ts` (17); four single-rule mutants each caught (change list) |

## 3. Objectives
| # | objective | verdict | evidence |
|---|---|---|---|
| 1 | the heartbeat writes nothing to the bus | **YES** | `cluster_bus_event` rows since the 15:56Z restart: 0; the table's last row 15:55:35.649Z, 25 s before it (Langston re-derived both) |
| 2 | the retention registration works and does not break the nightly sweep | **YES** — the HARD GATE | 10-08 02:15:02Z sweep (`/var/log/dawntrader/b75-retention.log` from line 2171): **18 of 18** registered tables printed, the same set as 10-07 plus `cluster_bus_event` (185,865 rows deleted); `DONE … failed=0 … plain_failed=0`; `plain_deleted=323241` = 137,376 + 185,865 exactly. `loadConfig` runs before the `started at` line (`b75-retention-sweep.ts:1056` vs `:1069`), so the run's existence shows every constant resolved |
| 3 | migration applied | **YES** | `2026-10-06-b-engine-heartbeat-cluster-bus-retention.sql` in `_migrations` at 15:55:49.917Z |
| 4 | the flag-write alert | **NOT EXERCISED** | it fires only on a failed engine-flag write; none occurred, so its silence carries nothing (#661 leg 3). Unit-tested only |
| 5 | the orphan backstop | **NOT EXERCISED LIVE** | it acts only on an orphaned manager; none occurred. Unit-tested (the stop-then-clear order and the queue) |

## 4. Reviews
- **Steps 1-2:** Langston approved. He folded the `/status` contract into the row when it was placed, and at Step 2 placed `#1159` (2a0c) and `#1161` (2a0d).
- **Step 4:** r1 BOUNCED on the flag-write alert only; r2 PROCEED with two conditions, one of which placed `#1166` (2a0j); **r3 APPROVED** at `635e7132d`.
- **Step 7:** CC-B, recorded in `Change Lists/RELEASE_DEPLOY_2026-10-07_PLAN.md`.
- **Step 8:** **CONFIRMED** by Langston 2026-10-08, measured himself at the deployed sha; he graded the gate at the deployed sha, not the branch head, where 2a0c's removal is already committed.

## 5. Numeric corrections
- **PREVIOUSLY STATED:** "all 20 registered tables" (Step-7 record and Step-8 dispatch). **NOW:** 18. **REASON:** my census counted the sweep's `started` and `DONE` lines as tables; corrected in place.
- **PREVIOUSLY STATED:** Central Clock subscribe sites "7 code sites, 1 unreachable, 5 live" (pre-audit; System Impact Map). **NOW:** 8 code sites, 3 unreachable, 5 live. **REASON:** the `B-ROOT-DUPLICATE-SCANNER-RETIRE` census found the `BATCH_19G_HF2` copy; corrected in place in both.

## 6. New findings / dispositions
- `#214` (the health broadcast's ENGINE block reads the legacy `global.tradingEngines`, `health-monitor.ts:444`) was attached to this row by the W41 ownership triage after Step 4. This batch never touched that file. **Disposition 2:** `HOME: B-WS-STATUS-PAYLOAD-COMPLETE, owner CC-B, placed in SPRINT_TO_LIVE_PLAN at row 2a0i, after row 2a0h`.

## 7. Governance ledger
CHANGE-CLASS: non_architecture

| tier | document | verdict | one line |
|---|---|---|---|
| T1 | BATCH_CATALOG.md | ✅ | entry: removed, kept, result, closed/moved issues |
| T1 | PHASE_HISTORY.md | ✅ | plain-language entry |
| T1 | SPRINT_TO_LIVE_PLAN.md (rows 2a0b, 2a0i) | ✅ | 2a0b at Step 11 with this report; `#214` moved onto 2a0i |
| T1 | PHASE_19_PLAN.md | N/A — no row there | the row is sprint row 2a0b |
| T1 | shared MEMORY.md + MEMORY_CC_B.md | ✅ mine / N/A shared | mine: position |
| T1 | the batch SCOPE | ✅ | written at Step 1 |
| T1 | the batch PRE_AUDIT | ✅ | Step 2; its census line corrected in place at Step 10 |
| T1 | COMPLETION_REPORT | ✅ | this file |
| T1 | the four session task lists | ✅ mine / N/A ×3 | CC-B: 2a0b its own row at Step 10, the deploy row rebuilt |
| T1 | Langston's MEMORY.md | **OWED** | one close line, written after his Step-11 confirm |
| T2 | SYSTEM_MANUAL.md | N/A | no architecture, strategy, regime, filter, pipeline or math change; the heartbeat is engine liveness infrastructure |
| T2 | SYSTEM_IMPACT_MAP.md | ✅ | in-batch (`4a17ca8f4`): the heartbeat's remaining job, the queued orphan rule, the liveness bound, the flag-write alerts, the retention; corrected at Step 10 (Central Clock census 7 → 8) |
| T2 | RUNNING_ISSUES.md | ✅ | `#521`, `#1158`, `#404` closed; `#214` re-homed |
| T2 | CHANGES_AND_FIXES.md | N/A | legacy removal and a backstop repair, not a trading-system bug or risk |
| T2 | STORAGE_POLICY.md | ✅ | in-batch: the `cluster_bus_event` row (30 d, age-delete + VACUUM, why no cold-offload) |
| T2 | DELETED_COMPONENTS_LOG.md | ✅ | in-batch: the 2026-10-06 entry with archive copies |
| T2 | POST_AUDIT_ROADMAP.md · ADJUSTMENT_FRAMEWORK.md · AUTHORITY_BASELINE.md · MULTI_ASSET_VTS_EXPANSION_PLAN.md · ASSET_CLASS_ONBOARDING_WORKFLOW.md · BUILD_METHOD_PLAYBOOK.md · LANGSTON_ARCHITECTURE.md · CLAUDE.md / CONDUCT.md · PRE_LIVE_SPRINT.md | N/A | not touched by an engine-liveness clean-up |
| T2 | MISTAKE_PATTERNS.md | N/A | the 20-vs-18 count is a `wrong-object` instance, carried in its commit trailer (`cb5f3ee70`) |

## 8. Honest residual
- The orphan backstop and the flag-write alert are both unexercised in production. Their only evidence is the unit tests.
- `cluster_bus_event` still exists, with 85,153 rows, all `task_completed`; dropping it is row 2a0c (`#1159`), next deploy.
- A stalled heartbeat now only delays an orphan clean-up. Stop, boot reset and start each clear orphans themselves (the liveness bound in the System Impact Map).
