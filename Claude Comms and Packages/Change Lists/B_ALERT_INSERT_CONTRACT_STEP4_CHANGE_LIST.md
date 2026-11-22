# B-ALERT-INSERT-CONTRACT — Step 4 change list (r2: Step-8 corrections + Step-10 tier ledger)

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
  - **The 23:10 cycle refreshed the 22:50 rows,** carrying the same ids `22f1ca44…` / `b7794840…` (OBJ-1's refresh). **The 00:50 cycle also refreshed, and its rows predate the deploy:** `out__2026-11-15_16-10-54.log:331624,:331634` read `[AlertsService] refreshed 1e61157e… mode=live` / `186a7bbf… mode=paper`, and that line prints only on the not-inserted branch (`alerts-service.ts:93-94`). So the cycle collapsed onto rows that already existed before 21:15Z, which is the `#1255` mechanism (1) case and strengthens OBJ-1. *(Corrected at Step 10, Langston's Step-8 read: this line first said "new ids". That the two rows predate the deploy is RULED ON REPORTED FACT, resting on the 2,944-per-mode baseline at leg 3.)*
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

## Step 7 end-of-window leg reads — 2026-11-22 ~12:00Z (CC-B), window 2026-11-14T21:15Z → 11-21T21:15Z (closed)

**This is the Step-8 read.** Every leg re-read after the window closed; the interim reads above stand where this section does not supersede them.

- **Leg 2 — feed health, natural. PASS: the OBJ-4 carrier was observed well inside 7 days, and every alerting cycle completed.**
  - **Alerting cycles in the window, each read in full by timestamp** (not a fixed-width grep window — an `-A60` window first made 11-18 09:30 look incomplete because noisy lines crowded it; the timestamp read shows it complete):
    | cycle (UTC) | what it logged | completion |
    |---|---|---|
    | 11-14 22:50:14, 23:10:06 | interim read only — see residual (a) | `Check complete`, Grade C (interim) |
    | 11-15 00:50:14 | refreshed ×2, `1e61157e…` (live) / `186a7bbf…` (paper), rows that predate the deploy | `Check complete`, Grade C |
    | 11-17 08:05:06 | critical; broadcast ×2; **the window's only insert per mode** (no `refreshed` line; `feed_health` 2,945 live / 2,945 paper against the 2,944 baseline) | `Check complete in 250ms`, Grade F, critical |
    | 11-18 09:30:19 | `[AlertsService] refreshed 8bfae336…` (live) + `c13b3d87…` (paper) | `Check complete in 311ms`, Grade F, warning |
    | 11-18 09:40:05 | same two ids refreshed | `Check complete in 238ms` |
    | 11-21 02:25:27 | refreshed `1e61157e…` / `186a7bbf…` — **the 11-15 00:50 ids, six days later** (OBJ-1's refresh across a long gap) | `Check complete in 251ms`, Grade C |
  - **`Check failed`: 0** across every `out` and `error` log from 11-15 through 11-22. Positive control: `error__2026-11-13_00-00-00.log` = 5.
  - **The occurrence rows (residual from the interim read, now discharged via `dt-sql`, KD-96):** `scheduled_job_occurrences` for `feed_integrity_cron` reads `succeeded` at every five-minute slot spanning each cycle above (11-15 00:45-00:55, 11-17 08:00-08:10, 11-18 09:25-09:45, 11-21 02:20-02:30 — 14 rows, 14 `succeeded`). Whole window: **1,996 rows, all `succeeded`**, against 2,017 five-minute slots (11-14 21:15Z → 11-21 21:15Z, both ends inclusive). **21 slots carry no row, and they are one contiguous run, 11-16 04:25Z → 06:05Z** (`dt-sql`, generated slot series against the table): the Supabase ban (`#1259`) plus the client's lane latch, cleared by the 06:08:17Z restart. 2,017 − 21 = 1,996. None falls on an alerting cycle above. *(Corrected at Step 10, Langston's Step-8 read: this line first said 2,016 slots and 20 empty, cause not read.)* **Positive control:** the same table holds `failed` ×5 for this job at 2026-11-12 21:00-21:20Z, before the deploy — the five `Check failed` lines in `error__2026-11-13`. The instrument records a failure; none occurred in the window.
- **Leg 4 — error-log sweep. PASS.** `unique_global_alert` lines after the deploy instant: **0** in every file `error__2026-11-16` through `error__2026-11-22` plus the live `error.log`. Positive control: `error__2026-11-15` (holding 11-14) = 1 line, 2026-11-14 03:00:00Z `[FORMULA-AUDIT]` duplicate, before the deploy; `error__2026-11-14` = 1.
  - **F-5, the second unique index, measured as a zero on its own object (Langston's Step-8 read, re-derived by me).** `system_alerts_user_mode_timestamp_idx UNIQUE (user_id, mode, timestamp)`: 0 lines naming it, and 0 lines matching `duplicate key` on an alert, in every `error` file 11-16 → 11-22 plus the live `error.log`. Positive control for the generic pattern: `error__2026-11-13` = 21 lines. The collision shape is two alerts for the same user and mode written in one transaction (same `now()`), and no path in this batch creates it.
  - **The carrier had the opportunity every day.** The 03:00Z formula audit refreshed `7151827f…` (paper) and `5d665e33…` (live) on all seven days 11-15 → 11-21: 14 writes that each took the conflict branch. This answers a zero-opportunity reading of the 0.
  - The window's first 2 h 45 min (11-14 21:15Z → 24:00Z) sits in `error__2026-11-15`, whose only match is the pre-deploy 03:00Z line above.
- **Leg 5 — every deploy in the window. PASS.** Staging reflog HEAD movements 2026-11-14T21:15Z → 11-21T21:15Z: `7c5b45c67` (11-14 21:15), `f8fc53153` (11-15 03:09), `3e2504129` (04:22), `84eeb168e` (11:05), `8fac86e5e` (11-16 03:38, again 06:07), `ecbdf882e` (11-20 00:03), `85e7ce638` (07:58), `4456f515d` (21:40), `6a9b6802f` (23:25), `2a501de33` (11-21 00:07), `c21c1502a` (05:08) — **12 movements, 11 distinct shas, every one carries `7c5b45c67`** (`git merge-base --is-ancestor`, rc=0, run on the staging clone). No movement between 11-21 05:08 and window end; HEAD at read time = `c21c1502a…`. **Positive control:** `cc1a1c2df`, `65132e2eb`, `9591ba8c2` (11-14, before the deploy) rc=1; Langston added `415b3051f` rc=1 (re-run by me on the staging clone, rc=1).
- **Residuals, named:**
  - (a) the out-log segment holding the 22:50 and 23:10 cycles (the one rotated at 2026-11-15 00:00Z) has **rotated off staging**; those two cycles rest on the interim read of 11-16 and cannot be re-read.
  - (b) F-5 is now a measured zero on its own object (leg 4 above), not a blind spot.
  - (f) **Deploy-window under-coverage.** `DEPLOY_WINDOWS.jsonl:4` opened this batch's window and `:5` closed it at 2026-11-15T03:12Z, after leg 1; 10 of the 12 HEAD movements in leg 5 came after that close. The legs still read every one, but the window row did not cover them. **Forward rule:** a window row's `until_event` must match the batch's longest leg, not its first.
  - (g) **GOVERNANCE_EXCEPTIONS gap.** This batch has no `open` row there, so its change list cannot satisfy the `completion_report` exception path (`scripts/governance-checker/config.mjs:141`). Already homed on `#744` B-GATE-GUARD (CC-A). DISPOSITION: no work — withdrawn, citing `#744`; nothing to retire at close.
- **Step 8 dispatched** 2026-11-22 (Discord `1574030163019038811`) — Langston's independent read (reflog enumeration, live `error.log`, the occurrence table).

## r3 — Step 8 + Step 10, 2026-11-22 (CC-B)

- **Step 8: Langston PROCEED, 2026-11-22** (Discord `1574033312454811761`). He re-derived legs 2, 4 and 5 himself (reflog enumeration, the live `error.log`, the occurrence table) and added the control `415b3051f` (rc=1). His nits are applied in the body above, not stacked here.
- **Step 10: governance landed in this commit.** Tier ledger:

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

- **Next:** Step 11 — the completion report, then Langston's confirm.
