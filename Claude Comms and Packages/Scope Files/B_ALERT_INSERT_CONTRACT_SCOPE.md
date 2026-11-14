# B-ALERT-INSERT-CONTRACT — SCOPE (Step 1, r1)

change-class: non_architecture

**Issue:** `#1255` (new; the home line sits next to Langston's 2026-11-13 ruling inside `#1039`) · **Plan:** `SPRINT_TO_LIVE_PLAN.md` CC-B pre-sprint list, worked now ahead of items 4-5 (KD-78, Kyle 2026-11-14 ~13:05Z, slot check `1-system-manual/pm/slot-checks/20261114T130745Z_CC-B_b-alert-insert-contract-make-the-feed-he.md`) · **Owner:** CC-B
**Read at:** `origin/migration/aws-supabase` head `b4888b869`, plus the staging database and error logs on 2026-11-14.
**Deploy window (KD-78):** only after the 21:04Z B-ENTRY-GATE inc B read, bundled with OLD Claude's evening deploy, never 14:30-21:00Z.

**The fix shape this scope starts from** is Langston's ruling of 2026-11-13 13:46Z (msg `1570796983269195887`): *"Scope the insert path, not the feed-health job: `createAlert` must not take its caller down on a repeat message (conflict-aware insert refreshing the existing row, or an explicit swallow with a counter that has a reader), and the fallback text must carry something that varies."* It also carries ANALYST Claude's two corrections, which Langston confirmed at 14:04Z (msg `1570801553328181379`): there are two insert paths, and the ORM does not declare the constraint.

---

## 0. PREVIOUSLY STATED vs NOW

> **PREVIOUSLY STATED:** feed-health "fires every 5 min against a prior identical row that was never cleared" (`RUNNING_ISSUES` annotation in `#1039`, 2026-11-13).
> **NOW:** there are **two collision mechanisms**, and the second fires on **every** alerting cycle, not only on a repeat.
> **REASON:** measured on staging today, §1.4 below. With two admin users, the job writes the live row for the first admin, then the second admin's live write collides with that row in the same second.

## 1. What is there (measured)

1. **The constraint.** Staging `system_alerts` carries `unique_global_alert UNIQUE (mode, alert_type, message)`, and also `system_alerts_user_mode_timestamp_idx` UNIQUE on `(user_id, mode, timestamp)` and the primary key (read from `pg_constraint` and `pg_indexes`, 2026-11-14). The first is declared only in `drizzle/migrations/2026-04-22-initial-schema.sql:12443`. `shared/schema.ts:1556-1558` declares only the second.
2. **Insert path 1.** `AlertsService.createAlert` (`server/services/alerts-service.ts:46-56`) is a bare `db.insert(systemAlerts).values(...).returning()`, with no conflict handling. Any repeat of `(mode, alert_type, message)` throws into the caller.
3. **Insert path 2.** `storage.createSystemAlert` (`server/storage.ts:4448-4456`) is a second bare insert. Its one live caller is `openai-rate-limiter.ts:144`, which uses a constant message. Staging already holds that row (`openai_quota_exhausted`, 2025-10-24, acknowledged), so every future circuit-breaker alert collides. The caller's try/catch at `:156` logs the error and the alert is lost.
4. **Mechanism 2: same-cycle collision between admins.** Staging has **2 admin users** (`users.is_admin`, 3 users in total). Every `feed_health` row since 2026-10-28 (54 rows, listed) belongs to **one** admin, `56523b4f…`. The 2026-11-07 19:25:11Z error log shows the colliding key `(live, feed_health, Feed Health: CRITICAL (Grade F)…)` **in the same second as** the stored row `2026-11-07 19:25:11.258Z live 56523b4f`. Only one row per key can exist, so the colliding write came after it: the second admin's live write in the loop at `feed-integrity-auto-check.ts:186-228`. ⇒ **every alerting cycle that does save an alert also aborts the check**, before `monitor.updateAlertState` (`:231`).
   *Alternative not excluded:* a second concurrent run in that second. The out-log for 11-07 is no longer retained, so this cannot be read directly. The job is node-cron with one occurrence row per boundary (CC-C's `scheduled_job_occurrences` identity).
5. **Mechanism 1: an earlier identical row.** On 2026-11-12, 21:00-21:20Z, the colliding key `(live, feed_health, Feed Health: WARNING (Grade F)…)` has **no** row from 11-12 (the newest `feed_health` row is 2026-11-08 01:55Z). The first write collided with an older, acknowledged row with the same text. This is ANALYST's mechanism, confirmed.
6. **The catch path collides too.** `:265`/`:275` write `Feed Health Check Failed: ${error.message}`. That text is constant for this error and a row with it already exists, so it collides (seen at every abort in both logs), is caught at `:287`, and `:291` rethrows.
7. **Other callers** (enumerated at the ref; Step 2 re-derives): `feed-integrity-auto-check` ×4, `expert-insights-alerts` ×9, `formula-auto-audit` ×2 (both modes, per admin; caught at `:132`), `daily-loss-budget` ×1 (already guarded, `:275-293`), `unknown-strategy-counter` ×1 (per admin, constant text per token). Every caller with a per-admin loop hits mechanism 2 whenever there are two or more admins.
8. **No DDL is needed, and nothing regenerates DDL from the ORM.** Deploy and CI run `db:migrate` (SQL files; `.github/workflows/ci.yml:66`, `scripts/db-migrate.ts`), not `drizzle-kit push`. A constraint added to `shared/schema.ts` is a declaration only; the database already has it.

## 2. Provenance (1.b)

- **`unique_global_alert`: original intent NOT recoverable.** Corpora searched: `git log -S "unique_global_alert"` across all history (first appearance `ba44573b0`, 2026-04-23, in a B63 audit note; the DDL arrives only with the initial-schema dump `f11871593`, 2026-05-23); `bridge/canonical/` (0 hits for `system_alerts`); `BATCH_CATALOG`, completion reports, `RUNNING_ISSUES`. No commit adds it, so it was applied directly to the Replit-era database. **INFERRED-FROM-CODE:** it arrived with or after `aa9fefb57` (2025-10-25, verbatim: *"Adjusted alerts to be global per mode"*), which made every read ignore `userId`. One row per `(mode, type, message)` is the dedupe rule that goes with alerts being global per mode.
- **The repeat-collision has been known since B63:** `BATCH_63_COMPLETION_REPORT.md:277` — *"`FORMULA-AUDIT Alert creation error: duplicate key value violates unique constraint "unique_global_alert"` | old | pre-existing — upsert needs ON CONFLICT"*.
- **The per-admin loops** predate the move to global alerts and were not updated by it. **Disposition (2): relevant, needs updating to today's intent.** See Q1.
- **`storage.createSystemAlert`:** a second path that duplicates the service. **Disposition (4): connected, should be REMOVED** (rule 18), with its one caller re-pointed.

## 3. Objectives

**OBJ-1 — A repeat refreshes the alert instead of throwing.** `createAlert` becomes `INSERT … ON CONFLICT (mode, alert_type, message) DO UPDATE`. The update re-raises the existing row: `acknowledged = false`, `timestamp = now()`, and the caller's `severity`, `category`, `metadata` and `action_buttons`. `user_id` is left unchanged. The result says whether the row was **inserted or refreshed**, and a refresh prints its own log line naming the row id, mode and type. Any other database error still throws.
*Why re-raise:* the clear acknowledges these rows on every healthy cycle. A refresh that left `acknowledged = true` would make a recurring fault invisible, which is the harm this batch removes.
*Verify:* unit tests covering a new row, a repeat (no throw, same id, re-raised, `user_id` unchanged), and a non-conflict error that still throws. On staging, after deploy: no `unique_global_alert` line in any error log from any writer.

**OBJ-2 — One insert path.** Delete `storage.createSystemAlert` and its interface declaration (`storage.ts:673`). `openai-rate-limiter` calls `AlertsService.createAlert`. Record the removal in `DELETED_COMPONENTS_LOG.md`.
*Verify:* `git grep "insert(systemAlerts)"` at the landed sha shows only `alerts-service.ts`; `tsc` passes; a rate-limiter test.

**OBJ-3 — The ORM declares the real constraint.** `shared/schema.ts` adds `unique("unique_global_alert").on(mode, alertType, message)` next to the existing index, and OBJ-1's conflict target is written from those columns. No migration is needed (§1.8).
*Verify:* a test that reads the column list from `drizzle/migrations/2026-04-22-initial-schema.sql` and the ORM declaration and requires them to match. This catches drift in either direction.

**OBJ-4 — The feed-health check survives an alerting cycle.** With OBJ-1 in place, neither mechanism throws, so the check reaches `updateAlertState` and the cron occurrence succeeds. **The fallback text stays constant, and this departs from the 11-13 ruling's last clause on purpose:** under OBJ-1 a repeat failure refreshes the one row instead of colliding. A varying fallback text (a timestamp, say) would add a new row on every failed cycle, which is the row flood B-FEED-HEALTH-GRADE-ARM's throttle exists to stop. *(Langston to rule.)*
*Verify:* a unit test running `runFeedIntegrityCheck` with two admins and an existing identical row; it must not throw and must call `updateAlertState`. On staging, the first natural alerting cycle after deploy logs an alert line followed by `Check complete`, with no `Check failed` and a `succeeded` occurrence. **Carrier rate:** alerting cycles seen on at least 8 of the 18 days from 10-28 to 11-14: stored rows on 6 days (the §1.4 row list), plus aborts with no stored row on 11-03 and 11-12 (Langston's 11-13 log count). Support for §1.4: on 11-02 there are 2 stored row-pairs (01:05Z, 01:10Z) and Langston counted 2 aborts that day. Pre-registered window: 7 days from deploy; if no carrier arrives, OBJ-4's staging leg is reported UNOBSERVED, not passed.

**OBJ-5 (Q1) — collapse the per-admin loops?** Recommendation: **yes, in this batch,** for the callers that write once per admin (`feed-integrity-auto-check`, `formula-auto-audit`, `unknown-strategy-counter`, plus any `expert-insights-alerts` site that loops). Alerts are global per mode (`aa9fefb57`), so the second admin's write is a same-cycle duplicate by construction. After OBJ-1 it becomes a pointless second refresh per mode; before OBJ-1 it is mechanism 2. Each change is a few lines in the same blast radius. Which admin owns the single row is decided in Step 2 (the first admin, as now). If Langston rules no, it goes to Kyle's list as a proposal, not a slot.

## 4. Out of scope (named so the close cannot be read as covering them)

- `#1039` / row 73 `B-SCHEDULER-FIRST-TICK` (Infra): Weekly Expert Insights' double run. After this batch the second run refreshes instead of throwing, but the double run itself stays row 73's.
- `#1218` arm 2 (`B-CRON-SUBGRACE-CADENCE`, row 59g5, mine): unaffected.
- The seven `feed_integrity_cron` alerts are already resolved (CC-C, `6148e55ed`). The 5 unacknowledged live `feed_health` dashboard rows are the dashboard's own state, which this batch does not touch.
- The dashboard alert display (main-Dashboard rule, KD 2026-10-19). Nothing there changes; the broadcast payload is unchanged.

## 5. Blast radius (Step 2 will census in full)

Monitoring and alerting only. No signal, position, gate, SQE, RTB, sizing or VTS path writes or reads `system_alerts` (to be proven by a reader census at Step 2). Readers today: `AlertsService.get*`/`acknowledge*`/`muteLowSeverity`/`cleanupOldAlerts` and the routes that call them. A refresh moves a row to the top of `getUnacknowledgedAlerts`, which sorts by timestamp descending.

## 6. Questions for Langston

- **Q1:** OBJ-5, whether to collapse the per-admin loops (above).
- **Q2:** OBJ-4, keeping the fallback text constant against the 11-13 clause (above).
- **Q3:** Should a refresh also keep a repeat counter in `metadata`, merged on conflict? My recommendation is no: the log line is the reader, and a counter nobody reads is decoration.
