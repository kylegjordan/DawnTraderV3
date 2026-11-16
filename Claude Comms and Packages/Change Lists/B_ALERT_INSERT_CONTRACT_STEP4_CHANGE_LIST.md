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


## Step 6 + Step 7 (first legs), 2026-11-14

- **Step 6:** deployed by OLD Claude in the agreed bundle at `7c5b45c67cd943b577db7475eb00e006508a989c` (contains `7714d0fdb`; CI 43641435091 4/4 at that sha; runtime commits since the live `cc1a1c2df` = `7714d0fdb` + B-DISK-FILE-TIERING 3b items 2-5 and 3c, read by me with `git log cc1a1c2df..7c5b45c67 -- server/ shared/ drizzle/ scripts/ client/`), `dt-deploy --in-window B-ALERT-INSERT-CONTRACT`, live 21:15:29Z. On the box at 21:2xZ: `git rev-parse HEAD` = `7c5b45c67…`; `pm2 jlist` pid 4997, `restart_time` 703.
- **Pre-registered leg 3 (the first healthy cycle stamps the history) — PASS.** `out.log` 21:15:55Z: `[FeedIntegrity][CLEAR] healthy (recorded healthy): closed 5888 feed alert episode row(s) (live 2944, paper 2944)`, then `Check complete … Grade: A`. The next cycle (same second, the initial check) closed nothing and completed — idempotent. Database, read 21:2xZ: `feed_health` live 2944 / paper 2944, every row `acknowledged` and carrying `episodeClosedAt` = 2026-11-14T21:15:54.452931Z (one statement).
- **OBJ-1 staging leg — no crash line yet, NOT a result.** `unique_global_alert` in `error.log` + `out.log`: 1 line before 21:15:29Z today (the instrument sees them), 0 after — over ~10 minutes in which no alert was written (`system_alerts` rows with `timestamp ≥ 21:15:29Z`: 0). The carrier is the 03:00Z formula audit (leg 1).
- **UI:** no surface on a tab this batch may verify on. Alerts render only on the main Dashboard, which is off-limits (Kyle 2026-10-19) and was named out of scope (§4); the broadcast payload's only change is `action: 'created' | 'refreshed'`, read by nothing that renders. Judgement stated, not skipped.
- **OBJ-1 leg 1 (the 03:00Z formula audit, 2026-11-15) — PASS.** The audit ran on `7c5b45c67` (`[FORMULA-AUDIT] completed in 6ms PASS=9 WARNING=1 FAIL=0`, out.log). Both rows of the pair refreshed instead of inserting: `[AlertsService] refreshed 7151827f-c2a7-4af4-8901-be95524e2329 mode=paper type=formula_audit acknowledged=true` and `... 5d665e33-34d5-418b-8b4e-637e55322879 mode=live ... acknowledged=false`; `system_alerts` reads paper `timestamp 03:00:00.341215` acknowledged t, live `03:00:00.4528` acknowledged f. Crash line `unique_global_alert`: 0 in today's `error.log` (47,170 lines since the 00:00Z rotation). Positive control: the rotated `error__2026-11-15_00-00-00.log` (holding 11-14) carries exactly the old line, `2026-11-14 03:00:00 [FORMULA-AUDIT] ❌ Alert creation error: duplicate key value violates unique constraint "unique_global_alert"`, and `error__2026-11-14_00-00-00.log` one more — the instrument sees the crash; it did not happen tonight. DEPLOY_WINDOWS row closed at 03:12Z.
- **Next (after leg 1):** legs 2-5 (the OBJ-4 carrier within 7 days, or UNOBSERVED) and Step 8.

## Step 7 interim leg reads — 2026-11-16 ~12:30Z (CC-B), window 2026-11-14T21:15Z → 11-21T21:15Z

**Interim, not the Step-8 read:** the window is still open, so each leg below is re-read at its end.

- **Leg 2 — feed health, natural. Three alerting cycles OBSERVED, each read individually:**
  - **The cycles:** 2026-11-14 22:50:14Z and 23:10:06Z (`out__2026-11-14_12-23-22.log`), and 2026-11-15 00:50:14Z (`out__2026-11-15_16-10-54.log`).
  - **What each logged, in order:** `[FeedIntegrity] Creating warning alert` → `AlertSync … Broadcasting alert creation` (×2, live and paper) → `✅ Check complete … Grade: C, Status: warning`.
  - **The 23:10 cycle refreshed the 22:50 rows,** carrying the same ids `22f1ca44…` / `b7794840…` (OBJ-1's refresh). The 00:50 cycle carries new ids `1e61157e…` / `186a7bbf…`.
  - **`Check failed` after the deploy: 0.** Positive control: the same grep over `error__2026-11-03…11-13` returns 2+1+8+4+5 = 20 lines in 5 files, which is Langston's pre-audit measurement exactly.
  - **The cron verifier reports `feed_integrity_cron healthy` at every 15-minute check across the three cycles.** `mature_occurrence=2026-11-14T22:50:00Z` at 23:00:26Z, and `2026-11-15T00:50:00Z` at 01:00:26Z; for 23:10 the boundaries are 23:15 / 23:20 healthy.
  - **Residual, named:** the per-occurrence `succeeded` row in the cron occurrence table was **not read**. The direct database read path is paused under the KD-93 interim rule (no hand-built staging login). The verifier's `healthy` status is the instrument used.
  - **Cron alert rows for `feed_integrity_cron` after the deploy:** only 2026-11-16 04:25-05:53Z (`claim_unavailable`, `stale_fire_evidence` ×3). They fall inside the 04:20-05:20Z database outage (`#1259`), not on an alerting cycle. Read, not a leg-2 failure.
- **Leg 4 — error-log sweep, interim:**
  - `unique_global_alert` lines after the deploy instant: **0** (`error__2026-11-16_00-00-00.log`, which holds 11-15, and the live `error.log`, which holds 11-16 to ~12:30Z).
  - Positive control: `error__2026-11-15_00-00-00.log` (holding 11-14) has 1 line, 2026-11-14 03:00:00Z `[FORMULA-AUDIT] ❌ … unique_global_alert`, which is before the deploy.
  - This cannot see the second index (F-5).
- **Leg 5 — every deploy in the window, interim:**
  - Staging reflog HEAD movements from 7c5b45c67 (21:15:00Z, the deploy) onward: `f8fc53153` (11-15 03:09), `3e2504129` (04:22), `84eeb168e` (11:05), `8fac86e5e` (11-16 03:38, again 06:07). **All carry 7c5b45c67** (`git merge-base --is-ancestor`).
  - Positive control: the four 11-14 movements before the deploy (`9591ba8c2`, `415b3051f`, `65132e2eb`, `cc1a1c2df`) read MISSING.
- **Next:** the same three legs re-read at the window's end (2026-11-21T21:15Z), then Step 8.
