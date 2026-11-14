# B-ALERT-INSERT-CONTRACT — Step 4 change list (r1)

**READY AT:** `7714d0fdb1636f14b1a916b5ad19915ba09b4180` on `origin/migration/aws-supabase` (one commit, parent `ec916a2a6`).

| field | value |
|---|---|
| **i. DECLARED CHANGE-CLASS** | `non_architecture` (scope header, verbatim) |
| **ii. DOC SET (non_architecture)** | SCOPE — **present** `Claude Comms and Packages/Scope Files/B_ALERT_INSERT_CONTRACT_SCOPE.md` · PRE_AUDIT — **present** `Claude Comms and Packages/Scope Files/B_ALERT_INSERT_CONTRACT_PRE_AUDIT.md` (r3 + implementation-time §C) · COMPLETION_REPORT — **absent** (Step 11) · BATCH_CATALOG, PHASE_HISTORY — **absent** (Step 10) · PHASE_19_PLAN, shared MEMORY + MEMORY_CC_B, Langston MEMORY — **absent** (Step 10) · SYSTEM_IMPACT_MAP — **judged applicable**, lands at Step 10 (new `system_alerts`/`AlertsService` entry, pre-audit A.8) · SYSTEM_MANUAL — **judged applicable**, one-line §16 note at Step 10 · CHANGES_AND_FIXES — judged at Step 10 · DELETED_COMPONENTS_LOG — **present in this commit** |
| **iii. STEP-2 REFERENCE** | `Claude Comms and Packages/Scope Files/B_ALERT_INSERT_CONTRACT_PRE_AUDIT.md`, PROCEED at r3 (Langston msg `1571168431426904085`) |

**Untracked check:** `git status --porcelain` at commit time showed only `.claude/launch.json` (local config, not part of the batch). The two new test files are in the commit.

## Files (14)
| file | change | plan item |
|---|---|---|
| `server/services/alerts-service.ts` | upsert; `getAlertOwner`; `acknowledgeFeedHealthAlerts()` global + stamp; `formatCheckFailedMessage`; `cleanupOldAlerts` deleted | P1, P4, P5, P6, P7 |
| `server/storage.ts` | `createSystemAlert` + interface line + 3 imports deleted | P2 |
| `server/services/openai-rate-limiter.ts` | one write via the service, under the owner | P2, P4 |
| `server/jobs/feed-integrity-auto-check.ts` | grade path and catch path: one write per mode under the owner; healthy clear = one call; stop clear global; `storage` import gone | P4, P5, P6 |
| `server/jobs/formula-auto-audit.ts` | one write per mode under the owner; `storage` import gone | P4 |
| `server/core/observability/unknown-strategy-counter.ts` | one write under the owner; `storage` import gone | P4 |
| `server/services/feed-integrity-monitor.ts` | comment at `getLastStatus` corrected (Step-2 finding) | §C |
| `shared/schema.ts` | `unique("unique_global_alert").on(mode, alertType, message)` — 4 lines, byte-preserving (mixed line endings kept) | P3 |
| `server/tests/unit/b-alert-insert-contract.test.ts` | NEW — P3 parity pinned to the `db-migrate` directory; P6 format | P3, P6 |
| `server/tests/integration/b-alert-insert-contract-db.test.ts` | NEW — real Postgres: tests 1, 2, 3a, 3b, 4, 5 (F-5), 6 (clear), 7 (owner order) | P1, P4, P5 |
| `server/tests/unit/b-feed-health-grade-arm.test.ts` | mocks `getAlertOwner`/`formatCheckFailedMessage`; clear called with no args; +3 cases (two admins, no admin, check-failed message) | P4, P5, P6 |
| `server/tests/unit/b-formula-health-audit-freshness.test.ts` | mock gains `getAlertOwner` | P4 |
| `1-system-manual/DELETED_COMPONENTS_LOG.md` | entry for both deletions | P2, P7 |
| pre-audit | Step-2 PROCEED corrections 1-4 + §C findings | — |

## Load-bearing hunks

**P1 — `alerts-service.ts` `createAlert` (AFTER):**
```ts
const metadata = input.metadata || {};
const [alert] = await db.insert(systemAlerts).values({ ...same as before..., metadata, acknowledged: false })
  .onConflictDoUpdate({
    target: [systemAlerts.mode, systemAlerts.alertType, systemAlerts.message],
    set: {
      acknowledged: sql`CASE WHEN (system_alerts.metadata ->> ${EPISODE_CLOSED_KEY}) IS NOT NULL THEN false ELSE system_alerts.acknowledged END`,
      timestamp: sql`now()`,
      severity: input.severity,
      category,
      metadata,
    },
  }).returning({ ...getTableColumns(systemAlerts), inserted: sql<boolean>`(xmax = 0)` });
if (!alert.inserted) console.log(`[AlertsService] refreshed ${alert.id} mode=${alert.mode} type=${alert.alertType} acknowledged=${alert.acknowledged}`);
```
BEFORE: a bare `db.insert(systemAlerts).values({...}).returning()`. `user_id` and `action_buttons` are not in `set` (C-7). The broadcast's `action` becomes `'created' | 'refreshed'`; the client invalidates on any `alerts_updated`.

**P5 — `acknowledgeFeedHealthAlerts` (AFTER, signature lost its `userId`):**
```ts
return db.update(systemAlerts)
  .set({ acknowledged: true,
         metadata: sql`coalesce(${systemAlerts.metadata}, '{}'::jsonb) || jsonb_build_object(${EPISODE_CLOSED_KEY}::text, now())` })
  .where(and(eq(systemAlerts.alertType, 'feed_health'),
             or(sql`${systemAlerts.acknowledged} IS NOT TRUE`, sql`(${systemAlerts.metadata} ->> ${EPISODE_CLOSED_KEY}) IS NULL`)))
  .returning({ id: systemAlerts.id, mode: systemAlerts.mode });
```
BEFORE: `where user_id = $1 and alert_type = 'feed_health' and acknowledged = false`, `.returning()` whole rows.

**P4 — `getAlertOwner`:** `select id, trading_mode from users where is_admin = true order by created_at, id limit 1`; `null` → caller logs and skips. The feed-health grade path (BEFORE: `for (const admin of adminUsers) { createAlert(live); createAlert(paper); }`) is now `owner ? for (mode of ['live','paper']) createAlert(...) : warn`. Same shape in the catch path, the formula audit and the unknown-strategy tripwire; the rate limiter writes once in `owner.tradingMode || 'paper'`.

**P6:** `formatCheckFailedMessage(error)` = `Feed Health Check Failed: ` + first line, digits → `#`, capped at 200 (+ `…`), never empty. `metadata: { error: <full text>, trigger, at }`.

## Judgement calls to attack
1. **The `CASE` refers to the existing row as `system_alerts.metadata` / `system_alerts.acknowledged`.** In `ON CONFLICT DO UPDATE` an unaliased table name means the existing row (`excluded.` is the proposed one). I hard-coded the table name rather than interpolating the drizzle column, because drizzle may render the column unqualified inside `set`. **NOT RE-READ** — it is first exercised by the integration test in CI.
2. **`xmax = 0` as inserted-vs-refreshed** in `RETURNING`. It is the standard Postgres signal for an upsert; **NOT RE-READ** beyond the integration test.
3. **First healthy cycle after deploy:** one `UPDATE` touching the 5,888 historical `feed_health` rows (pre-registered), returning `{id, mode}` only, inside the cron tick.
4. **The integration file has not run anywhere yet.** No local Postgres; it skips here (6 skipped, guard printed). CI's Test Suite is its first run. A green Test Suite job must show it as **run, not skipped**, and I will check its count in the job log at Step 5.
5. **Local test status:** `b-alert-insert-contract` 4/4, `b-feed-health-grade-arm` 17/17, `reorg-b2-3` 9/9, `p19-b6-daily-loss-budget` 5/5; `tsc` baseline 324 = 324. `b-formula-health-audit-freshness` has 1-2 local timeouts that **also occur on clean `ec916a2a6`** (verified by stash: same test times out at 5 s without my change; it needs the database). CI decides.
6. **P3 mutation check:** dropping `message` from the ORM declaration fails the parity test (`expected [ 'mode', 'alert_type' ] to deeply equal [ 'mode', 'alert_type', 'message' ]`), and the file was restored byte-for-byte.
