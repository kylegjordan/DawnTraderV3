# B-ALERT-INSERT-CONTRACT — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN (Step 2, r1)

change-class: non_architecture · Issue `#1255` · Owner CC-B · Scope `B_ALERT_INSERT_CONTRACT_SCOPE.md` r1 (`8b333d089`), Langston Step-1 PROCEED 2026-11-14 (msg `1571155825194565797`), which requires five additions (F-1…F-5) and settles Q1-Q3.
**Read at:** `origin/migration/aws-supabase` head `2dbfcece4`, plus the staging database, error logs and out-logs on 2026-11-14.

---

## 0. PREVIOUSLY STATED vs NOW

> **PREVIOUSLY STATED (scope §1.7 / OBJ-4): the carrier rate was "at least 8 of 18 days".** **NOW:** feed-health alerts were stored on **6 of 18 days**, and the last was 11-08 01:55Z (Langston, F-3). The primary carrier is now the formula audit, which collides **every day at 03:00:00Z: 14 of the 14 retained error logs** (§A.6). **REASON:** abort days save nothing, and mechanism 2 needs a cycle that saves.
> **PREVIOUSLY STATED (scope §5 / F-1): "every read ignores `user_id`".** **NOW:** **two** reads filter on it: `acknowledgeFeedHealthAlerts` (`alerts-service.ts:268-284`) and the action route's ownership check (`routes.ts:18640-18648`). **REASON:** found by the reader census (§A.2). Plan items P5 and A.2b deal with them.
> **PREVIOUSLY STATED (scope OBJ-5): owner = "the first admin, as now".** **NOW:** the owner is chosen deterministically, by `created_at` then `id` (F-1). **REASON:** `getAllUsers()` (`storage.ts:2922-2924`) has no ORDER BY, and the owner has changed month to month (Langston's measurement).

## A. AUDIT

### A.1 Entry points that write `system_alerts` (enumerated repo-wide at the ref, tests excluded)
`git grep "insert(systemAlerts)"` finds exactly two sites: **`alerts-service.ts:46`** and **`storage.ts:4450`**. No raw `INSERT INTO system_alerts` appears in `server`, `shared`, `scripts` or `client/src` (searched for `system_alerts`; positive control: the same search finds `shared/schema.ts:1544`). Every writer reaches one of those two sites:

| caller | site | loop | message cardinality | today's guard |
|---|---|---|---|---|
| feed-health grade path | `feed-integrity-auto-check.ts:187,:208` | **per admin**, live then paper | text of grade + issues; repeats while the condition holds | none: the throw aborts the check |
| feed-health catch path | `:265,:275` | **per admin** | `Feed Health Check Failed: ${error.message}`, constant per error | caught at `:287`, then `:291` rethrows the original |
| formula audit | `formula-auto-audit.ts:109,:119` | **per admin**, paper then live | `Formula Audit Warning — Volatility (Daily Range Proxy) deviated 0.00% (0.1-1%)`, the same every day (§A.6) | caught at `:132`, so the alert is lost every day |
| unknown-strategy tripwire | `unknown-strategy-counter.ts:71` | **per admin**, paper | constant per token | none |
| daily-loss budget | `daily-loss-budget.ts:280` | single | varies | guarded `:275-293` |
| Expert Insights (×9) | `expert-insights-alerts.ts` | single; the caller picks `users.find(isAdmin)` (`weekly-expert-insights-task.ts:25-28,:124-126`) | some constant | callers vary; the double run is `#1039` |
| OpenAI rate limiter | `storage.createSystemAlert` via `openai-rate-limiter.ts:144` | **per `role='owner'`** (F-2; both admins are owners) | constant | caught `:156` |

### A.2 Readers, mutators and deleters (enumerated)
- **Reads that ignore `user_id`:** `getUnacknowledgedAlerts` (`:95`), `getAllAlerts` (`:117`), `acknowledgeAlert` (`:134`), `acknowledgeAll` (`:180`), `muteLowSeverity` (`:227`). Route callers: `routes.ts:15108-15191` and `:18516-18616`.
- **a. `acknowledgeFeedHealthAlerts(userId)` (`:268-284`) FILTERS on `user_id`.** Callers: the healthy-cycle clear, which loops over admins (`feed-integrity-auto-check.ts:138-143`); `clearFeedHealthAlertsOnStop(userId)` (`:417-422`), reached from the `engine_state_changed` listener (`:364`) and the admin route `routes.ts:15078`. A stop by an admin who does not own the row misses it, today and after this batch, unless the filter goes. → **P5.**
- **b. `POST /alerts/:id/action` (`routes.ts:18640-18648`) filters on `user_id`** as an ownership check before an action button runs. **No writer in A.1 sets `actionButtons`** (`git grep actionButtons` outside `alerts-service.ts` and `alert-action-handler`: 0 sites). So no row this batch writes is reachable through it, and it is left unchanged.
- **Deleter:** `cleanupOldAlerts` (`:247-262`) has **zero callers** outside its own file (census above). It is dead code, which matters because the refresh changes the age key it would read. → **P7, rule 18.**
- **Schedulers:** `feed_integrity_cron` (node-cron, `:317/:327`), `formula_audit_cron` (`0 3 * * *`), the weekly Expert Insights task (scheduler-registry), event-driven `unknown-strategy-counter` and the rate limiter. Exactly one scheduler per writer, and no two share a row key concurrently except the per-admin loops, which are sequential within one call.

### A.3 The contract and the database
`pg_constraint` on staging: `system_alerts_pkey`, `unique_global_alert UNIQUE (mode, alert_type, message)`. `pg_indexes`: those two plus `system_alerts_user_mode_timestamp_idx` UNIQUE `(user_id, mode, timestamp)`. All three are created by `drizzle/migrations/2026-04-22-initial-schema.sql` (`:12443`, `:17041`), which `scripts/db-migrate.ts` reads from `drizzle/migrations`. The stale tree `migrations/0000_flaky_freak.sql` is never read (F-3 rider). Deploy and CI run `db:migrate`, never `drizzle-kit push`, so **no DDL is needed or generated.** `max(length(message)) = 239` (Langston), far below the btree row limit.

### A.4 F-5: the second unique contract
`ON CONFLICT (mode, alert_type, message)` arbitrates **only** `unique_global_alert`. A `DO UPDATE SET timestamp = now()` writes into `system_alerts_user_mode_timestamp_idx`'s key. A collision there needs the same `(user_id, mode)` and the same `now()`, and `now()` is the transaction clock. The callers use autocommit, one statement per transaction, so two writes in one transaction do not happen today. The test will still pin the case (P1 test 5). Measured exposure: 0 retained error lines name that index, against 155 `unique_global_alert` lines from the same instrument (Langston).

### A.5 Provenance (carried from scope §2): `unique_global_alert`'s intent is INFERRED-FROM-CODE (global alerts per mode, `aa9fefb57`); B63 already called for "upsert needs ON CONFLICT". The per-admin loops predate global alerts (disposition 2). `storage.createSystemAlert` is disposition 4. `cleanupOldAlerts` is disposition 5.

### A.6 The carriers (measured)
- **Formula audit, daily.** Each retained error log (14 files, `error__2026-11-01` … `error__2026-11-14`) holds exactly one `[FORMULA-AUDIT] ❌ Alert creation error: … "unique_global_alert"`, stamped `03:00:00` on the day before the file's name. 14 of 14. Today's audit (out-log 11-14 03:00:00Z) reports `PASS=9 WARNING=1 FAIL=0`; the warning is `Volatility (Daily Range Proxy)`, deviation 0. Its message equals stored rows `7151827f` (paper, acknowledged) and `5d665e33` (live, unacknowledged), both from 2025-10-26. The **paper** write runs first and collides.
- **Feed health:** stored rows on 6 of 18 days (Langston F-3); natural, no forcing.
- **F-4, durable:** each feed-health abort fails its `feed_integrity_cron` occurrence (`[CRON-RECOVERY][CORE_FAIL]`), and that is what mints `cron_recovery:failed` / `cron_stale`. Pass = **no such row minted for `feed_integrity_cron` after the deploy boundary**, read from `system-alerts.jsonl`, which does not depend on log retention.

### A.7 A visible effect Kyle should know about
After deploy, the formula audit's standing warning, *"Formula Audit Warning — Volatility (Daily Range Proxy) deviated 0.00%"*, **reappears unacknowledged every morning**. It has failed to save every day for months. That is the alert system working as designed, but it is new noise on the alert banner. Whether a documented approximation should raise a warning at all is a formula-audit question, outside this batch. **DISPOSITION: decision required — no work in this batch.** The finding goes to Kyle's list as a proposal, citing this section.

### A.8 SIM and System Manual
The **System Impact Map has no entry for `system_alerts` or `AlertsService`.** It names `AlertsService.createAlert(feed_health)` only as a downstream of the feed monitor (§2.1.1). That silence is a governance gap; Step 10 adds the entry (writers, readers, the two unique contracts, the refresh rule). **System Manual:** §16 states the alarm "raises `AlertsService.createAlert(feed_health)`". My judgement is that a one-line note in §16 is warranted, saying a repeat re-raises the stored row and no longer aborts the check, because §16 describes the alarm's behaviour. Langston read it as not applying; it is recorded at Step 10 either way.

## B. PLAN (each item cites the finding it comes from)

- **P1 ← A.3, A.4, scope OBJ-1.** `AlertsService.createAlert` becomes `db.insert(systemAlerts).values(...).onConflictDoUpdate({ target: [mode, alertType, message], set: { acknowledged: false, timestamp: sql\`now()\`, severity, category, metadata, actionButtons } }).returning({ ...columns, inserted: sql\`(xmax = 0)\` })`. `user_id` is not in `set`. The broadcast payload is unchanged apart from `action: 'created' | 'refreshed'`; the client invalidates on any `alerts_updated` (`alert-banner.tsx:50-69`). A refresh logs `[AlertsService] refreshed <id> mode=<m> type=<t>`. **Tests:** (1) a new row is inserted; (2) a repeat does not throw and returns the same id, re-raised, with `user_id` unchanged; (3) an acknowledged row is re-raised; (4) a non-conflict error still throws; (5) F-5: two `createAlert` calls for the same `(user_id, mode)` inside one transaction. Tests 2, 3 and 5 run against real Postgres, because a mock cannot test a constraint. The CI Test Suite job runs a `pgvector/pgvector:pg17` service and applies `db:migrate` before vitest (`.github/workflows/ci.yml` `test` job), and the `server/tests/integration/` lane already uses it. These tests seed and remove their own `users` row for the foreign key. **Verify names what it does not cover:** a clean `unique_global_alert` log says nothing about `system_alerts_user_mode_timestamp_idx`.
- **P2 ← A.1, scope OBJ-2.** Delete `storage.createSystemAlert` (`:4448-4456`) and its interface line (`:673`). `openai-rate-limiter` calls `AlertsService.createAlert` once, for the owner from P4 (F-2). Recorded in `DELETED_COMPONENTS_LOG.md` with the state-write census: it wrote only `system_alerts`, and every reader of that table survives.
- **P3 ← A.3, scope OBJ-3, F-3 rider.** `shared/schema.ts` gains `uniqueGlobalAlert: unique("unique_global_alert").on(table.mode, table.alertType, table.message)`, and P1's target is written from those columns. **Test:** parses the `ADD CONSTRAINT unique_global_alert UNIQUE (...)` line from the file `scripts/db-migrate.ts` resolves, **asserting the path is that resolved directory** (not `migrations/`), then requires equality with the ORM's declared columns.
- **P4 ← A.1, F-1, F-2, Q1.** One owner helper, `AlertsService.getAlertOwnerId()`: the admin users ordered by `created_at, id`, taking the first; `null` if there are none, in which case the caller logs and skips. The per-admin and per-owner loops collapse to one write per mode in `feed-integrity-auto-check` (grade path and catch path), `formula-auto-audit`, `unknown-strategy-counter` and `openai-rate-limiter`. **The stated basis (F-1):** an arbitrary but fixed `user_id` is tolerable only because every read ignores it after P5, and A.2b's ownership check reaches no row these writers make.
- **P5 ← A.2a.** `acknowledgeFeedHealthAlerts()` drops the `user_id` filter (global per mode, like every other acknowledgement). The healthy-cycle clear calls it once. `clearFeedHealthAlertsOnStop(userId)` keeps `userId` only for its log line. ⇒ A stop by either admin clears the row.
- **P6 ← A.1 catch path, Q2 condition.** The fallback text stays constant. The write carries `metadata: { error: error.message, trigger, at: <ISO> }`, so a refreshed row shows its current cause. The rethrow at `:291` stays: a genuine check failure must still fail its occurrence.
- **P7 ← A.2, rule 18.** Delete `cleanupOldAlerts` (zero callers), with a `DELETED_COMPONENTS_LOG.md` row. It is the one path that would have read the refreshed `timestamp` as an age.
- **P8 ← A.6, KD-56.** Register the observation window in **this** commit: `1-system-manual/DEPLOY_WINDOWS.jsonl` gets an `open` row with `until_event` = the first 03:00Z formula audit after this batch's deploy, `expected_by 2026-11-15T03:30:00Z`, `review_by 2026-11-15T09:00:00Z`. It disturbs only a deploy that lands between this batch's deploy and that audit **without** this batch's code. Before this batch deploys, the window blocks other deploys unless they name it, so OLD Claude's bundled evening deploy runs with `--in-window B-ALERT-INSERT-CONTRACT`. **Why only the 03:00Z leg gets a window:** the feed-health (OBJ-4) and F-4 legs read per-cycle carriers that any restart leaves intact, so long as the code is present, and blocking the crew's deploys for 7 days protects nothing. If the deploy slips past tonight, I amend `expected_by`. If the batch closes on a progress report, the declared-open `GOVERNANCE_EXCEPTIONS` row lands at Step 10.

### Staging verification (pre-registered, before any data)
1. **03:00Z the morning after deploy (OBJ-1 primary):** PASS = no `[FORMULA-AUDIT] ❌ Alert creation error`, plus a `[AlertsService] refreshed` line for `formula_audit` in both modes, plus rows `7151827f` and `5d665e33` with `timestamp` within 03:00:00-03:00:05Z and `acknowledged = false`. FAIL = any `unique_global_alert` line, or a third `formula_audit` row for that message.
2. **F-4, durable, 7 days:** PASS = zero `cron_recovery:failed:feed_integrity_cron` or `cron_stale:feed_integrity_cron` rows minted after the deploy instant whose failure is this collision (each one read, not counted).
3. **OBJ-4, natural, 7 days:** the first feed-health alerting cycle logs `Creating … alert`, then `refreshed` or an insert, then `Check complete`, with no `Check failed`. **If none arrives, the result is UNOBSERVED, not passed.**
4. **Error-log sweep:** zero `unique_global_alert` lines from any writer after the deploy instant, stating that this cannot see the second index (F-5).

### UNAUDITED
None. Every plan item above cites its finding.

---
**Plain-language summary.** The audit confirmed the cause and found two more places where the alert table assumes one owner per alert, so those get fixed too. It also found an unused clean-up routine to remove. The fix is proven by the nightly formula audit, which fails the same way every morning at 03:00 UTC: after the fix, that alert should save instead of crashing. One visible side effect: that formula warning will start showing on the alert banner every morning, because it has been failing to save for months.
