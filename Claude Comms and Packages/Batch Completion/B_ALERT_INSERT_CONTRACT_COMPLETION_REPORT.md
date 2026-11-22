# B-ALERT-INSERT-CONTRACT — COMPLETION REPORT (Step 11)

**Batch:** B-ALERT-INSERT-CONTRACT · `RUNNING_ISSUES` `#1255` · Kyle slot KD-78 (CC-B pre-sprint list item 3a) · owner CC-B
**Change-class:** `non_architecture` (scope header, unchanged at close)
**Code:** commit `7714d0fdb1636f14b1a916b5ad19915ba09b4180` (parent `ec916a2a6`) · Step-4 change list `Claude Comms and Packages/Change Lists/B_ALERT_INSERT_CONTRACT_STEP4_CHANGE_LIST.md` (r3)
**Deployed:** `7c5b45c67cd943b577db7475eb00e006508a989c` (contains `7714d0fdb`), live 2026-11-14T21:15:29Z, by OLD Claude in the agreed bundle (`dt-deploy --in-window`)
**Reviews:** Step 1 scope approved · Step 2 PROCEED at r3 (Langston `1571168431426904085`) · Step 4 approved at `7714d0fdb` · Step 8 PROCEED 2026-11-22 (Langston `1574033312454811761`)
**Governance commit:** `c61ca13cc` (Step 10)
**Status:** ✅ CLOSED 2026-11-22 — Langston confirmed Step 11 2026-11-22 (Discord `1574044299778195468`). The close commit also flipped the plan row 3a, `BATCH_CATALOG`, `PHASE_HISTORY`, `#1255` and the session task list (Langston's condition on the confirm).

No progress report exists for this batch: the only observation window was Step 7's seven-day leg window, pre-registered in the pre-audit and read in full at its end. This report is written fresh from the change list, which captured each leg as it was read.

---

## OPEN ITEMS AND RESIDUALS (stated first)

| # | item | owner | home | closing condition |
|---|---|---|---|---|
| R-1 | **No database foreign key on `system_alerts.user_id`.** `shared/schema.ts:1546` declares `.references(() => users.id)`; the database holds only `system_alerts_pkey` and `unique_global_alert`, and staging carries 12 orphan rows (`ce50e56b` ×10, `3ace5ebb` ×2). Rule-24 outcome 2 (working as designed, unaddressed). Pre-audit §C. | Kyle (decision) | **DISPOSITION: decision required — no work.** Sent to PM Claude as a proposal for Kyle's list with this report (outside KD-78; adding the key would fail on the 12 rows). Not a plan row. | Kyle slots it or declines it. |
| R-2 | **(a) Two early cycles rest on the interim read.** The out-log segment holding the 2026-11-14 22:50 and 23:10 cycles rotated off staging; both were read on 11-16 (`Check complete`, Grade C, the 23:10 cycle refreshing the 22:50 ids) and cannot be re-read. | — | No work: every later cycle was re-read in full. | — |
| R-3 | **(f) Deploy-window under-coverage.** `DEPLOY_WINDOWS.jsonl:4` opened this batch's window and `:5` closed it at 2026-11-15T03:12Z, after leg 1; 10 of the 12 staging HEAD movements came after that close. Leg 5 read every one, but the window row did not cover them. | CC-B | **Forward rule, applied from my next window row:** a window row's `until_event` matches the batch's longest leg, not its first. | Held by practice; no tooling change in this batch. |
| R-4 | **(g) No `GOVERNANCE_EXCEPTIONS` row for this batch**, so its change list cannot satisfy the `completion_report` exception path (`scripts/governance-checker/config.mjs:141`). | CC-A | Already homed on `#744` B-GATE-GUARD. **DISPOSITION: no work — withdrawn, citing `#744`;** nothing to retire at close. | `#744` closes. |

**For CC-C (attribution only, no routing change):** the 2026-11-12 21:00–21:20Z `feed_integrity_cron` failures (5 `failed` occurrence rows, 5 `Check failed` lines in `error__2026-11-13`) were this collision: the grade path threw, the catch path's message embedded the error and collided in turn, and the rethrow failed the occurrence. That contributor is gone since 2026-11-14T21:15:29Z, so a new `feed_integrity_cron` failure row after that instant is evidence about the cron or the feeds, not this collision.

---

## OBJECTIVES

| # | objective (scope r1) | verdict | evidence |
|---|---|---|---|
| **OBJ-1** | A repeat refreshes the alert instead of throwing (`INSERT … ON CONFLICT (mode, alert_type, message) DO UPDATE`; re-raise, keep `user_id`; result says inserted or refreshed; other errors still throw). | **YES** | **Tests** (CI `43641435091`, real Postgres): `b-alert-insert-contract-db.test.ts` 1+2 (insert, then refresh), 3a (a dismissed row re-raises), 4 (a non-conflict error still throws) — all ✓. **Staging:** leg 1, 2026-11-15 03:00Z formula audit refreshed `7151827f…` (paper) and `5d665e33…` (live) instead of inserting; leg 2, `refreshed` lines on every alerting cycle but one, including the 11-21 02:25 cycle refreshing the 11-15 00:50 ids six days later; leg 4, **0** `unique_global_alert` lines in every `error` file 11-16 → 11-22 plus the live `error.log` (positive control: `error__2026-11-15`, holding 11-14, = 1 line, before the deploy). The carrier had the opportunity daily: **14 conflict-branch writes** by the formula audit over 11-15 → 11-21. |
| **OBJ-2** | One insert path: delete `storage.createSystemAlert` and its interface line; `openai-rate-limiter` calls `AlertsService.createAlert`; record the removal. | **YES** | `git grep "insert(systemAlerts)" origin/migration/aws-supabase -- server shared` → exactly one hit, `server/services/alerts-service.ts:72`. `storage.createSystemAlert` is gone (`server/storage.ts:669` holds only the deletion note); the limiter's remaining `createSystemAlert` is its own private method, which now writes through the service. `tsc` baseline gate green (CI `43641435091`). Logged in `DELETED_COMPONENTS_LOG.md` with `cleanupOldAlerts` (zero callers) at Step 3. |
| **OBJ-3** | The ORM declares the real constraint, and OBJ-1's conflict target is written from those columns. | **YES** | `shared/schema.ts` adds `unique("unique_global_alert").on(mode, alertType, message)`. Unit test P3 in `b-alert-insert-contract.test.ts` reads the migration from the `db-migrate` directory and pins the ORM to the database's columns — ✓ in CI. Integration test 5 (F-5) pins the conflict target — ✓. |
| **OBJ-4** | The feed-health check survives an alerting cycle: no throw, reaches `updateAlertState`, the occurrence succeeds; staging carrier within 7 days, else UNOBSERVED. | **YES — carrier OBSERVED** | **Test:** `b-feed-health-grade-arm.test.ts:103` — two admins, the cycle writes once per mode under the owner and `updateAlertState` runs — ✓. **Staging:** alerting cycles 11-15 00:50, 11-17 08:05 (critical; the window's only insert per mode, 2,945/2,945 against the 2,944 baseline), 11-18 09:30 and 09:40, 11-21 02:25 — each logged `Check complete`. `Check failed` after the deploy: **0** across every `out` and `error` log 11-15 → 11-22 (control `error__2026-11-13` = 5). Occurrence table (`dt-sql`): **1,996 of 2,017** five-minute slots in the window carry a row, **all `succeeded`**; the 21 empty slots are one contiguous run, 11-16 04:25Z → 06:05Z, the database ban (`#1259`), none on an alerting cycle. Control: the same table holds `failed` ×5 at 11-12 21:00–21:20Z. |
| **OBJ-5** | Collapse the per-admin loops (Q1). | **YES** | `feed-integrity-auto-check.ts` (grade and catch paths), `formula-auto-audit.ts` and `unknown-strategy-counter.ts` each write once per mode under `getAlertOwner` (integration test 7 pins owner order — ✓). `expert-insights-alerts` was found not to loop (its caller picks one admin, pre-audit table row "Expert Insights"); its double run is `#1039`, out of scope. Staging: one row pair per alerting cycle (leg 2 table). |

Out of scope and untouched, as stated in the scope: `#1039` row 73, `#1218` arm 2, the dashboard display of alerts (the main Dashboard is off-limits, Kyle 2026-10-19).

**UI verification:** no surface on a page this batch may verify on. Alerts render only on the main Dashboard (off-limits); the broadcast payload's only change is `action: 'created' | 'refreshed'`, which nothing renders. Judgement recorded at Step 7, not skipped.

---

## STAGING LEGS (pre-registered in the pre-audit; window 2026-11-14T21:15Z → 11-21T21:15Z)

| leg | what | result |
|---|---|---|
| 1 | first 03:00Z formula audit after deploy refreshes, does not crash | **PASS** (11-15 03:00Z; refreshed ×2; 0 crash lines; control in the rotated 11-14 log) |
| 2 | feed health, natural carrier within 7 days | **PASS** (six alerting cycles, all `Check complete`; 0 `Check failed`; 1,996/1,996 recorded occurrences `succeeded`) |
| 3 | first healthy cycle closes the open episode and stamps it | **PASS** (11-14 21:15:55Z: 5,888 rows closed, 2,944 per mode, `episodeClosedAt` stamped in one statement; next cycle idempotent) |
| 4 | error-log sweep for the constraint, and F-5 (the second unique index) | **PASS** (0 lines for `unique_global_alert`; 0 for `system_alerts_user_mode_timestamp_idx` and 0 `duplicate key` on an alert; control `error__2026-11-13` = 21) |
| 5 | every deploy in the window carries the fix | **PASS** (12 HEAD movements, 11 distinct shas, all `merge-base --is-ancestor 7c5b45c67` rc=0; controls `cc1a1c2df`, `65132e2eb`, `9591ba8c2`, `415b3051f` rc=1) |

Langston re-derived legs 2, 4 and 5 at Step 8 (reflog enumeration, the live `error.log`, the occurrence table).

---

## CI

| run | sha | Test Suite | TypeScript Check (baseline gate) | Build | Docker Build |
|---|---|---|---|---|---|
| **`43641435091`** (the graded run, at the deploy sha) | `7c5b45c67` | ✅ 444 files / 5,876 tests passed | ✅ | ✅ | ✅ |
| `43606388277` | `7714d0fdb` | cancelled by a later push on the branch (not a result) | | | |
| `45023165510` (Step 10, documents only) | `c61ca13cc` | cancelled by a later push (not a result) | ✅ | ✅ | ✅ |

The batch's own tests in the graded run: the six integration cases (1+2, 3a, 3b+6, 4, 5 F-5, 7) and the four unit cases (P3 parity, three P6 message cases) — each ✓.

---

## GOVERNANCE FILES CHANGED — transcribed from the Step-10 ledger (change list r3)

`CHANGE-CLASS: non_architecture`

| tier | document | verdict | one line |
|---|---|---|---|
| T1 | `BATCH_CATALOG.md` | ✅ | B-ALERT-INSERT-CONTRACT entry: why, what was built, verified, not discharged |
| T1 | `PHASE_HISTORY.md` | ✅ | plain-language 2026-11-14 entry; closes at Step 11 |
| T1 | `PHASE_19_PLAN.md` | N/A | no row there (the sprint plan owns this batch) |
| T1 | `SPRINT_TO_LIVE_PLAN.md` CC-B list row 3a | ✅ | status → Step 10 done; legs 1-5 PASS; Step 8 PROCEED |
| T1 | shared `MEMORY.md` | ✅ | one consensus line: the operator alert table is repeat-safe; a closed episode re-opens |
| T1 | `MEMORY_CC_B.md` + mirror | ✅ | position block → Step 10 done, next Step 11 |
| T1 | the batch `SCOPE` | ✅ | written at Step 1; stands as approved, no change at close |
| T1 | the batch `PRE_AUDIT` | ✅ | written at Step 2 (r3); nothing it predicted was overturned |
| T1 | `COMPLETION_REPORT` | ✅ | written at Step 11, next |
| T1 | session task lists — CC_B ✅ / CC_A, CC_C, CC_INFRA N/A | ✅ mine / N/A ×3 | CC-B row added (Step 10 done, waits on Step 11); the other three not mine |
| T1 | Langston's `MEMORY.md` | ✅ | via `langston-memory-write`, net-zero |
| T1 | the Observation column | N/A | the scope registers no observation window beyond Step 7's seven-day leg window, which has closed and been read |
| T2 | `SYSTEM_MANUAL.md` | ✅ | §16: a repeat feed-health alert refreshes the stored row and no longer aborts the check; re-raise only after a healthy cycle closes the episode |
| T2 | `SYSTEM_IMPACT_MAP.md` | ✅ | new §2.1.1.a: the operator alert store — one writer, two unique rules, refresh/re-open rule, owner per mode, readers, blast radius |
| T2 | `RUNNING_ISSUES.md` | ✅ | `#1255` annotation (deploy, legs, Step 8, residuals); stays OPEN until Step 11 |
| T2 | `CHANGES_AND_FIXES.md` | ✅ | FIX-2026-11-22-C |
| T2 | `POST_AUDIT_ROADMAP.md` | N/A | no roadmap item changed |
| T2 | `ADJUSTMENT_FRAMEWORK.md` | N/A | no tunable changed |
| T2 | `AUTHORITY_BASELINE.md` | N/A | no constitutional change |
| T2 | `STORAGE_POLICY.md` | N/A | no retention changed: the deleted `cleanupOldAlerts` had zero callers, and the policy holds no `system_alerts` entry before or after |
| T2 | `MULTI_ASSET_VTS_EXPANSION_PLAN.md` | N/A | no VTS change; xStock working list reviewed, nothing owed |
| T2 | `ASSET_CLASS_ONBOARDING_WORKFLOW.md` | N/A | no onboarding learning |
| T2 | `BUILD_METHOD_PLAYBOOK.md` | N/A | method unchanged |
| T2 | `LANGSTON_ARCHITECTURE.md` | N/A | reviewer build unchanged |
| T2 | `CLAUDE.md` / `CONDUCT.md` | N/A | no rule changed |
| T2 | `_archive/CLAUDE_MD_RULE_HISTORY.md` | N/A | no rule changed |
| T2 | `DELETED_COMPONENTS_LOG.md` | ✅ | `createSystemAlert` + `cleanupOldAlerts` logged at Step 3 (`7714d0fdb`) |
| T2 | `MISTAKE_PATTERNS.md` | N/A | no MISTAKE trailer at this step |
| T2 | `GOVERNANCE_EXCEPTIONS.md` | N/A | no row for this batch; residual (g), homed on `#744` |
| T2 | `ALERT_HANDLING_PROTOCOL.md` | N/A | the staging alert queue's ack/resolve process is unchanged; this batch is the operator `system_alerts` table |
| T2 | `DELIVERY_BOARD_PROTOCOL.md` | N/A | protocol unchanged; card moved per it |
| T2 | `CLAUDE_CODE_FEATURE_WATCH.md` | N/A | no feature finding |

**At Step 11 (this commit and Langston's confirm):** this report; `RUNNING_ISSUES.md` `#1255` closes after Langston confirms; `MEMORY_CC_B.md` + mirror collapse the batch to one line then.

---

## NEW FINDINGS

1. **The ORM declares a foreign key the database lacks** (`system_alerts.user_id`, 12 orphan rows). Found at implementation (pre-audit §C) while writing the parity test; settled by reading `pg_constraint` on staging. Decision item R-1 above.
2. **A code comment stated the opposite of its caller** (`feed-integrity-monitor.ts` at `getLastStatus` said the clear fires only on a recorded non-healthy → healthy transition; its own caller clears on every healthy cycle). Corrected in `7714d0fdb`; no behaviour change.

Findings settled as not defects are left out.

---

## HONEST RESIDUAL — what this batch did not establish

- **The 22:50 and 23:10 cycles of 11-14 rest on one read (11-16)**; their log segment has rotated off (R-2).
- **The 2,944-per-mode baseline comes from one read**, leg 3's close count on 2026-11-14 (5,888 rows, 2,944 per mode). The 11-17 "only insert per mode" reading (2,945 against 2,944) is measured against it.
- **The staging refresh evidence names two writers only** (the feed-health check and the formula audit). The rate limiter and the unknown-strategy counter go through the same single write path and are covered by tests; whether either fired on staging in the window was **NOT RE-READ**.
- **No UI evidence**, by design (the only rendering surface is off-limits).
- **F-5 (the second unique index) is a measured zero over seven days,** not a proof that the shape cannot occur; the collision needs two alerts for one user and mode in one transaction, and no path in this batch creates one.

REVIEWER: none spawned at this step — the load-bearing claims (the five legs) were re-derived independently by Langston at Step 8; the CI per-job table and the `insert(systemAlerts)` census were re-read at the ref for this report.
