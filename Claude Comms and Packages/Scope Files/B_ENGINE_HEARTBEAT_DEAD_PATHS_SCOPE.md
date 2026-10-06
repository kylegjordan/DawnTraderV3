# B-ENGINE-HEARTBEAT-DEAD-PATHS — SCOPE (Step 1, r1)

change-class: non_architecture

**Issue:** `#1158` · **Plan row:** `SPRINT_TO_LIVE_PLAN` 2a0b (after 2a0 `B-ENGINE-STOP-DURATION-COLUMN`) · **Owner:** CC-B · **Card:** `PVTI_lAHODmulEM4BfQP4zg--du8` · **Origin:** found in 2a0's Step-2 census; Langston confirmed the placement and folded the `/status` contract and the flag-true residual in (2026-10-06).
**Measured at:** `origin/migration/aws-supabase` `6546aa9af` (2a0's head, not yet deployed) + staging DB/logs 2026-10-06 ~20:15Z.

## 0. What is there (measured)
**`server/services/active-engine-heartbeat.ts`** — started at boot (`server/index.ts:1484-1492`): `recoverSessions(autoResume)` once, then `start()` → `runHeartbeatCheck` every 30 s. Per cycle it (a) heals an orphaned manager when no session row is running (`:67-70`), (b) runs `checkSession` per running row, (c) publishes a `task_completed` bus event (`taskType: 'simulation_heartbeat'`).
1. **`checkSession` and `recoverSessions` can never act — three independent reasons** (Langston-enriched): (i) both gate on `session.userId` (`:129`, `:248`), a column dropped from `active_engine_sessions` in Phase 2C (`188738f17`, 2025-11-06); (ii) their writes `updateActiveEngineSession(sessionId, …)` (`:158`, `:289`) pass the `paper_x` id where storage keys by the row UUID (`storage.ts:4003`); (iii) the auto-resume calls `startActiveEngine(userId)` with no `startingBalance` (`:267`), which throws. Its consistency check reads `status.reconciliation` (`:174`), a field `getActiveEngineStatus` never returns. **Live: 2,221 "missing required fields — skipping" warns in today's `error.log` by 18:29Z (Langston), one per cycle.**
2. **The bus event is the table's whole population.** `cluster_bus_event` on staging: **268,655 rows, 107 MB**; **242,022** are `active_engine_heartbeat / task_completed` (2026-07-14 → now) and **26,611** are its pre-rename twin `paper_sim_heartbeat` (2025-10-21 → 2026-06-18); every other writer together: **22 rows**. **2,880 heartbeat rows in the last 24 h** — exactly one per 30 s.
3. **Its only reader is broken and unreachable from the app.** The sole reader of those rows (and of `activeEngineHeartbeat.getStatus()`) is `auto_test_harness.ts` (`:201`, `:213-215`), reached only by `POST /api/auto-test/run` (`routes.ts:5543`). **Zero client callers** (`git grep auto-test -- client`). The harness is already broken: it starts the engine with no balance (`:146`) and reads `result.reconciliation` (`:165`); after 2a0 its start throws outright when a leftover row is closed.
4. **The table has no retention.** `clusterBus.cleanup(olderThanHours)` and `getRecentEvents` exist (`cluster-bus.ts:79-98`) and have **zero callers** (positive control: the same search finds `clusterBus.publish` callers); `STORAGE_POLICY.md` has no `cluster_bus_event` entry.
5. **The `/status` contract** (Langston, homed here): `getActiveEngineStatus` returns `isRunning = !!dbSession || hasManager` (`active-engine-service.ts`), true with no engine behind it; after 2a0 only a crash-to-boot window produces that state.
6. **The flag-true residual** (Langston, homed here): the start's `tradingStateSync.setEngineActive(userId, true)` is fire-and-forget with a console-only catch, and since 2a0 it decides whether a later start CLOSES a leftover row.

## 1. Provenance (TIER 1)
| thing | introduced | intent | disposition |
|---|---|---|---|
| `paper_sim_heartbeat.ts` (now `active-engine-heartbeat.ts`) + `auto_test_harness.ts` + the boot wiring | `4556a834e` 2025-10-19 (Replit): *"Introduces an automated test harness API endpoint, paper simulation heartbeat and recovery service, and updates AI analysis logs."* | the 30-second checker of the same day's spec (*"Runs every 30 seconds. Queries paper_sim_sessions for status='running'. Checks each session's ends_at or run_for_ms … On application startup … If expired → set status='stopped'"*, `attached_assets/4. Dawn Trader Context … 10.19.25 part 2…md:7848-7864`) — the time-limit enforcer whose limit check was never written (2a0 removed the limit) | `checkSession` / `recoverSessions` / boot recover call: **(5) dead — delete**. Orphaned-manager heal: **(1) keep** (the only live action). Bus event: **(4) connected, should be removed** (see §2 obj 2) |
| `userId` removal from `active_engine_sessions` | `188738f17` 2025-11-06 (*"95 Staged Files After Phase 2 Directives through 2F"*) | single-tenant (Phase 2C) | broke (i) silently; nothing noticed for 11 months |
| `auto_test_harness.ts` + `POST /api/auto-test/run` | `4556a834e` 2025-10-19 | a Phase-24 self-test of the sim | **(5) dead and broken — delete** (proposal; Langston ruled at 2a0 Step 2 to NAME it in this census) |
| `clusterBus.cleanup` / `getRecentEvents` | cluster-bus Phase 22 | *"Clean up old events (retention policy)"* — never scheduled | **(3) disconnected, should be reconnected OR (5) removed** — decided at Step 2 with the table's remaining writers |
Corpora searched: `git log -S` unpathed (`simulation_heartbeat`, `recoverSessions`, `Phase 2C`), `RUNNING_ISSUES` (`#1158`, `#520`, `#1067`), `STORAGE_POLICY.md`, the 2025-10-19 context asset. `bridge/canonical/`: to be searched at Step 2.

## 2. Objectives
1. **The heartbeat stops doing dead work.** `checkSession`, `recoverSessions`, the boot `recoverSessions(autoResume)` call and the `AUTO_RESUME_SIMULATIONS` path are removed; the orphaned-manager heal stays. **Stated so nobody re-adds it:** deleting the boot recovery removes, by construction, the boot-time mutual-exclusion hazard with `resumeActiveEngines` (if the `userId` gate were ever "fixed", two boot paths would start the engine concurrently). *Verify:* zero `missing required fields` lines after deploy across two hours; a unit test that a cycle with a running row and no orphan manager makes no session write and no start call.
2. **The heartbeat's bus rows stop, and the backlog goes.** Remove the `simulation_heartbeat` publish (its only reader is the harness, obj 3) and delete the existing `active_engine_heartbeat` + `paper_sim_heartbeat` rows (~268,633) by migration. *Verify:* `cluster_bus_event` heartbeat count frozen at 0 new rows over an hour; table size after `VACUUM` reported. ⚠️ **Langston said at 2a0 Step 2 "keep the bus event"** — this objective asks him to reverse that on the measurement in §0.2-3; if he keeps it, objective 2 becomes "add a retention rule" instead.
3. **The auto-test harness is removed** (`auto_test_harness.ts`, `POST /api/auto-test/run`), rule 18, with a reader census first. *Verify:* census at the ref; `DELETED_COMPONENTS_LOG` + `_archive`.
4. **`cluster_bus_event` gets a stated retention** — either the existing `cleanup()` scheduled, or the dead helpers removed and the table's ~22 rows from other writers recorded as kept. Entry in `STORAGE_POLICY.md`. *Verify:* the policy entry at the ref; if scheduled, the scheduler line.
5. **The `/status` contract is decided and stated.** Proposal: `isRunning = hasManager` (the engine that actually runs), with `hasDbSession` kept in `diagnostics`; Step 2 censuses every consumer of `getActiveEngineStatus` (routes `:13252`, `:13319`, `:13338`, `:18517`, the client) first. *Verify:* a unit test for each of the four (row, manager) combinations.
6. **The start's flag-true write is observable.** A failure of `setEngineActive(userId, true)` raises a breakage alert (it now gates a row-closing decision). *Verify:* a test forcing it to reject shows the alert.

## 3. Out of scope
- Any change to `resumeActiveEngines` (the one boot owner since `#520`) beyond what obj 1 implies.
- The other `cluster_bus_event` writers' behaviour (22 rows total) — only their retention is stated (obj 4).

## 4. Blast radius
`active-engine-heartbeat.ts`, `server/index.ts` boot block, `active-engine-service.ts` (`getActiveEngineStatus`, the start's flag write), `routes.ts` (one route removed), `cluster_bus_event` rows (deleted by migration), one deleted service file. No signal, sizing, exit or price behaviour. Deploy after 2a0.

## 5. Questions for Langston (Step 1)
1. Reverse "keep the bus event" on §0.2-3, or keep it with a retention rule?
2. Delete the auto-test harness here, or place it separately?
3. Retention: schedule the existing `cleanup()`, or remove it?
4. Change-class stays `non_architecture`?
