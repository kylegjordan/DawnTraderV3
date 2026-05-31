# B-NEW-49 — Pre-Audit (Step 2)

**Batch:** B-NEW-49 — node-cron observability + deploy-state arming verification
**Scope:** `Scope Files/B_NEW_49_SCOPE.md` (Langston ACK clean on all 6 questions, 2026-05-31)
**Author:** CC, 2026-05-31

---

## §1 Per-component verification (5 schedule registration sites)

### 1.1 `server/services/session-lifecycle-controller.ts` (B-NEW-36)
- **Registrations:** 2 cron schedules at L252 (`friShutdownTask`) + L260 (`sunRestartTask`).
- **Cron expressions:** `0 20 * * 5` + `0 20 * * 0` (America/New_York timezone).
- **Existing fire-evidence:** writes to `scheduled_tasks_audit` with task_name in {`weekend_shutdown`, `weekend_restart`, `boot_state_reconciliation`}. Now with `meta.trigger_source` discriminator from B-NEW-36 poll-reconcile. **Already standardized.**
- **Existing safety net:** poll-reconcile + boot-reconcile (B-NEW-36).
- **Caller-surface:** invoked from `server/index.ts` boot via `sessionLifecycleController.init()`. Triple-protected.
- **B-NEW-49 work:** add to `cronRegistry.register()` (new); double-write to new generic `scheduled_jobs_audit` (additive, existing rich `scheduled_tasks_audit` writes UNCHANGED). Skip prewarm note: poll-fire skips prewarm; cron-fire runs it; new generic audit row should record this via `meta.prewarm_status`.

### 1.2 `server/services/xstock-universe-cron.ts`
- **Registrations:** 1 cron schedule at L29 (`_cronTask`).
- **Cron expression:** `0 6 * * *` (UTC).
- **Existing fire-evidence:** writes to `discovery_runs` table via `runDiscovery('cron_daily')`. Confirmed populated daily May 21-29, **MISSED May 30**, resumed May 31 (post-restart).
- **Existing safety net:** none.
- **Caller-surface:** invoked from `server/index.ts` via `registerXstockUniverseCron()`. Single-call. Failure path: cron callback wraps `runDiscovery` in try/catch + logs; ALSO calls `runDiscovery('boot')` at boot per other code path (cross-reference: B79.0n.UNIVERSE-DISCOVERY SIM).
- **B-NEW-49 work:** add to `cronRegistry.register()`; double-write to `scheduled_jobs_audit` (additive). Existing `discovery_runs` rich writes UNCHANGED.

### 1.3 `server/jobs/formula-auto-audit.ts`
- **Registrations:** 1 cron schedule at L195 (no stored handle — fire-and-forget).
- **Cron expression:** `0 3 * * *` (default, env-overridable via `FORMULA_AUDIT_SCHEDULE`), timezone `Etc/UTC`.
- **Existing fire-evidence:** writes `/tmp/audit_report_YYYYMMDD.txt` + `/tmp/audit_report_latest.txt`. Confirmed dated files May 23-29, **MISSED May 30 + May 31**.
- **Existing safety net:** none. No DB row written.
- **Caller-surface:** invoked from `server/index.ts` via `registerFormulaAuditJob()`. Env-gated (`FORMULA_AUDIT_ENABLED`).
- **B-NEW-49 work:** STORE the `ScheduledTask` handle (currently fire-and-forget, prevents `getNextRun()` introspection). Add to `cronRegistry.register()`. Add `scheduled_jobs_audit` row write on fire (success + error). Keep `/tmp` file writes UNCHANGED (operator-readable summary, per Langston Q3 ACK).
- **Caller-surface caution:** if `ENABLED === false`, the cron is NOT registered — `cronRegistry` should NOT register a row for it (would trigger false-positive smoke alerts). Handle the disabled case explicitly.

### 1.4 `server/jobs/feed-integrity-auto-check.ts`
- **Registrations:** 1 cron schedule at L254 (`job`).
- **Cron expression:** `*/5 * * * *` (default, env-overridable via `FEED_INTEGRITY_CRON`), timezone UTC. Callback adds 0-30s jitter sleep BEFORE invoking `runFeedIntegrityCheck('auto')`.
- **Existing fire-evidence:** log lines only (`[FeedIntegrity] Waiting Xms jitter`). Confirmed normal cadence May 29 ≤22h, **MISSED ~372 fires** between May 29 22:55 UTC → May 31 05:06 UTC.
- **Existing safety net:** none.
- **Caller-surface:** invoked from `server/index.ts` via `initFeedIntegrityAutoCheck()`. Env-gated (`DISABLE_FEED_INTEGRITY_CHECK`).
- **B-NEW-49 work:** add to `cronRegistry.register()`; add `scheduled_jobs_audit` row write inside callback AFTER jitter sleep but BEFORE invoking check (so we record the cron fire even if check throws — separate ID for check completion success/error if needed).
- **Note:** the highest-cadence schedule (12 fires/hour = 8,640/month per asset class). `scheduled_jobs_audit` writes for this alone = ~290k rows/month. Acceptable for our DB scale, but consider partitioning if it grows beyond expectations.

### 1.5 `server/services/awareness-scheduler.ts`
- **Registrations:** 2 cron schedules at L23 (`stateUpdateTask`) + L34 (`reflectionTask`).
- **Cron expressions:** `0 * * * *` (hourly) + `0 */6 * * *` (every 6h), default timezone (process tz, likely UTC on staging).
- **Existing fire-evidence:** `awareness_state_log` table (column: `timestamp`) for stateUpdate; `eventSubtype='awareness_reflection'` event log for reflection. **MISSED ~31 hourly fires** May 29 22:00 → May 31 05:00 UTC.
- **Existing safety net:** none.
- **Caller-surface:** invoked from `server/services/autonomy-scheduler.ts` boot path via `initializeAwarenessScheduler()`.
- **B-NEW-49 work:** add both schedules to `cronRegistry.register()`. Add `scheduled_jobs_audit` row write to BOTH callbacks (separate task_name values: `awareness_state_update`, `awareness_reflection`). Existing `awareness_state_log` writes UNCHANGED.

---

## §2 New shared modules (caller-surface enumeration)

### 2.1 `server/services/cron-registry.ts` (NEW)
- **Exports:**
  - `interface RegisteredCronJob { name: string; task: ScheduledTask; expression: string; timezone: string; intervalSeconds: number | null; enabled: boolean }`
  - `function register(job: RegisteredCronJob): void`
  - `function getAll(): RegisteredCronJob[]`
  - `function get(name: string): RegisteredCronJob | undefined`
- **Callers (6 registration sites):** the 5 schedule files above (sessionLifecycleController has 2 schedules).
- **Consumers:** `cron-arm-smoke-test.ts`, `cron-fire-evidence-verifier.ts`, future `/api/diagnostics/cron-registry` endpoint (deferred).
- **Storage:** module-level `Map<string, RegisteredCronJob>`. No persistence (boot-time registration is the canonical source of truth).

### 2.2 `server/services/cron-arm-logger.ts` (NEW)
- **Exports:** `function logCronArm(job: RegisteredCronJob): void`
- **Behavior:** computes `task.getNextRun()` (verified public API in node-cron 4.x — `dist/cjs/tasks/scheduled-task.d.ts` exposes `getNextRun(): Date | null`); writes log line `[CRON-REGISTRATION] job=<name> expr=<expr> tz=<tz> next_fire=<iso-or-null>`. If next_fire is null, log WARNING tag.
- **Callers (6 sites):** invoked from each schedule registration site IMMEDIATELY AFTER `cronRegistry.register()`.

### 2.3 `server/services/scheduled-jobs-audit.ts` (NEW)
- **Exports:**
  - `interface ScheduledJobAuditMeta { trigger_source?: 'cron' | 'poll' | 'boot'; duration_ms?: number; [k: string]: any }`
  - `async function writeFireRow(opts: { jobName: string; scheduledFor: Date; firedAt: Date; status: 'success' | 'error'; errorMessage?: string; meta?: ScheduledJobAuditMeta }): Promise<void>`
- **Behavior:** INSERT into `scheduled_jobs_audit`. Failure swallowed + logged (audit-write failure must not block the cron callback).
- **Callers (6 sites):** invoked from each cron callback after fire completes (success path AND error path).
- **Storage:** existing `scheduled_tasks_audit` table SCHEMA is reusable. **Pre-audit decision:** instead of creating a new `scheduled_jobs_audit` table, REUSE `scheduled_tasks_audit` (existing schema: `id`, `task_name varchar(64)`, `scheduled_for`, `fired_at`, `status`, `error_message`, `meta jsonb`, `created_at`). Saves a migration and a table; existing B-NEW-36 fire-evidence stays compatible; new schedules write rows with their own `task_name` values. **Updating scope §1.1 / §1.3 / §1.4 / §1.5 / §3.A accordingly: NO new migration needed.** This is a meaningful simplification from scope draft §3 Chunk A.

### 2.4 `server/services/cron-arm-smoke-test.ts` (NEW)
- **Exports:** `async function runSmokeTest(): Promise<{ ok: boolean; results: Array<{ jobName: string; status: 'OK' | 'PAST_DUE' | 'TOO_FAR_FUTURE' | 'NULL_NEXT_RUN' | 'DISABLED'; nextFire: Date | null; expectedBy: Date | null }> }>`
- **Behavior:** iterates `cronRegistry.getAll()`; for each, compute `task.getNextRun()`; classify status; aggregate result. On any `PAST_DUE` / `TOO_FAR_FUTURE` / `NULL_NEXT_RUN` → write system-alert (severity=warning, category=breakage) via existing `addAlert()`. Skip schedules with `enabled=false`.
- **Callers:** invoked from `server/index.ts` boot path AFTER all 5 schedule registrations complete (so all 6 entries are present in cronRegistry). Then again at +5min via `setTimeout`.
- **Failure handling:** wrapped in try/catch; smoke-test errors log + alert but do NOT crash boot.

### 2.5 `server/services/cron-fire-evidence-verifier.ts` (NEW)
- **Exports:** `async function runVerification(): Promise<void>`
- **Behavior:** for each `cronRegistry.getAll()` entry, query last fire-row from `scheduled_tasks_audit` (last `MAX(fired_at)` for `task_name`). Compute `expected_by = lastFire + intervalSeconds × 1.5`. If `now > expected_by` → write system-alert.
- **Callers:** invoked every 15 minutes via `setInterval` (NOT node-cron — independent mechanism). Wired into `server/services/autonomy-scheduler.ts` boot path (Langston Q5 ACK).
- **Per-schedule interval-second source:** stored on `RegisteredCronJob.intervalSeconds`. For non-trivial cron expressions (`0 * * * *` = 3600s, `*/5 * * * *` = 300s, `0 3 * * *` = 86400s, etc.) — pre-computed at registration time from the cron expression. Use `cron-parser` if needed; otherwise hardcode per-schedule (only 6 entries; trivial).
- **Boot grace:** verifier skips entries whose `cronRegistry` entry was registered <intervalSeconds ago (no last fire row yet, but not silent failure — just hasn't fired yet).

---

## §3 Producer-consumer contract audit (per ASSET_CLASS_ONBOARDING_WORKFLOW §4.25 — new mandatory pre-audit line)

### Canonical artifacts touched by this batch:
- **`scheduled_tasks_audit` table** — REUSED for new fire-evidence writes; existing B-NEW-36 reads via `psql` queries + future verifier reads.
  - Producer (existing): `session-lifecycle-controller.ts:writeAuditRow`
  - Producer (NEW this batch): `scheduled-jobs-audit.ts:writeFireRow`
  - Consumer (existing): manual psql queries; B-NEW-36 audit
  - Consumer (NEW this batch): `cron-fire-evidence-verifier.ts:runVerification`
  - **Contract:** both producers write same column shape (`task_name`, `scheduled_for`, `fired_at`, `status`, `error_message`, `meta`). Verified compatible via existing schema. ✅
- **`system-alerts.jsonl`** — REUSED for smoke-test + verifier alerts.
  - Producer (existing): B-NEW-36 `writeMissedCronAlert`, several other call sites
  - Producer (NEW this batch): `cron-arm-smoke-test.ts`, `cron-fire-evidence-verifier.ts`
  - Consumer: §10.5 per-turn check, dispatcher, etc.
  - **Contract:** existing `addAlert()` shape — `triggers_at`, `category`, `severity`, `title`, `body`, `metadata`. ✅
- **No new generated artifacts.** No new JSON files. No new schema migrations.

---

## §4 Open governance gaps (to close at Step 10)

- **SIM §9.10.c NEW:** "node-cron observability layer + scheduled-jobs-audit pattern" — document cronRegistry, smoke-test, verifier, fire-evidence-row pattern; cross-reference §9.10.b (B-NEW-36 weekend-lifecycle controller).
- **SYSTEM_MANUAL:** no changes needed — observability layer doesn't affect math/architecture.
- **CHANGES_AND_FIXES:** BUG-2026-05-31-B UPDATE entry — fold in the audit findings from RUNNING_ISSUES #164 + this batch's mitigation. Closes the "blast-radius unverified" hanging thread.
- **RUNNING_ISSUES:** CLOSE #164 with this batch's mitigation; OPEN #165 (deferred: poll-reconcile for 4 non-B-NEW-36 schedules, conditional on post-deploy evidence).
- **BATCH_CATALOG + PHASE_HISTORY:** add B-NEW-49 entry.
- **ASSET_CLASS_ONBOARDING_WORKFLOW §4.26:** reinforce — this batch is the canonical implementation of "scheduled-task verification via audit-table rows" (§4.26 written 2026-05-31, now has a worked example).

---

## §5 Implementation chunks (revised vs scope §5)

- **Chunk A — DELETED.** No migration needed (reusing `scheduled_tasks_audit`).
- **Chunk B — NEW** `server/services/cron-registry.ts` — self-registration interface + getter.
- **Chunk C — NEW** `server/services/cron-arm-logger.ts` — `logCronArm()` helper.
- **Chunk D — NEW** `server/services/scheduled-jobs-audit.ts` — `writeFireRow()` helper (this is the shared write API).
- **Chunk E — NEW** `server/services/cron-fire-evidence-verifier.ts` + wire into `autonomy-scheduler.ts` setInterval.
- **Chunk F — NEW** `server/services/cron-arm-smoke-test.ts` + wire into `server/index.ts` boot path (boot + setTimeout(5min)).
- **Chunk G — Wire into 5 schedule sites:** (1) session-lifecycle-controller (2 schedules); (2) xstock-universe-cron; (3) formula-auto-audit (also: STORE the handle, currently fire-and-forget); (4) feed-integrity-auto-check; (5) awareness-scheduler (2 schedules). Each site: `cronRegistry.register()` → `logCronArm()` immediately after; callback adds `scheduledJobsAudit.writeFireRow()` on success + error paths.
- **Chunk H — 5 new unit test files:** `cron-registry.test.ts`, `cron-arm-logger.test.ts`, `scheduled-jobs-audit.test.ts`, `cron-arm-smoke-test.test.ts`, `cron-fire-evidence-verifier.test.ts`.
- **Chunk I — tsc baseline + vitest gate.**

LOC estimate: +800 production / +600 test = +1,400 LOC total across ~10 files modified + 6 new files.

---

## §6 Langston framing notes folded (Step 1 ACK)

**Note 1 (Langston, scope ACK):** "deploy-state arming verification" framing too narrow — also covers "arming succeeded, internal scheduler tick loop died later." Both modes matter. **Action:** SIM §9.10.c documentation explicitly enumerates both modes:
- **Mode A (arming failed):** schedule registered but `getNextRun()` returns null OR returns a past timestamp. Caught by boot + 5min smoke test.
- **Mode B (tick loop died mid-lifetime):** schedule armed correctly, fired N times, then silently stopped firing. Caught by fire-evidence verifier (15-min latency).

**Note 2 (Langston, scope ACK):** verify `task.getNextRun()` is public API. **Verified:** `dist/cjs/tasks/scheduled-task.d.ts` (node-cron 4.2.1) exposes `getNextRun(): Date | null` as a public interface method on `ScheduledTask`. ✅ Not internal. If a future minor version removes it, smoke test falls back to `cron-parser` library or hardcoded next-fire computation from cron expression.

---

## §7 Risks (revised vs scope §3)

| Risk | Mitigation |
|---|---|
| Boot-time smoke test blocks server boot | Wrapped in try/catch; failures log + alert but do NOT call `process.exit(1)`. Async-non-blocking. |
| Per-fire audit-row writes add DB load | Quantified: peak 290k rows/month from feed-integrity (highest cadence). DB current load: ~28GB/month xStock ticker writes (96M rows/mo). Audit-row writes = 0.3% incremental. Negligible. |
| System-alert spam | Verifier has built-in dedup via §10.5 (one alert per stale schedule per 15-min check). Smoke-test alerts gate on PAST_DUE / TOO_FAR_FUTURE / NULL_NEXT_RUN classifications — rare. |
| Verifier uses node-cron → meta-failure | `setInterval`, NOT node-cron. Explicitly documented in code + test asserts the import doesn't reference node-cron. |
| `formula-auto-audit` registration change (storing handle) breaks env-gated disabled case | Handle stored in module-scoped `let` only when `ENABLED === true`. Disabled case: no registration, no cronRegistry entry, no smoke-test inclusion — same as today. |
| `awareness-scheduler` writes a duplicate fire-evidence row in `scheduled_tasks_audit` for stateUpdate + already writes `awareness_state_log` row | Two consumers, two purposes: `awareness_state_log` is the AI's state record (read by other AI logic); `scheduled_tasks_audit` is the silent-failure detector (read by verifier). No conflict; both write. |
| Existing B-NEW-36 `task_name` values collide with new schedule names | Verified: existing values are {`weekend_shutdown`, `weekend_restart`, `boot_state_reconciliation`}. New values: {`xstock_universe_discovery_cron`, `formula_audit_cron`, `feed_integrity_cron`, `awareness_state_update_cron`, `awareness_reflection_cron`}. Disjoint. ✅ |

---

## §8 Verification gates (revised vs scope §5)

Same gates as scope §5 + add per Langston note 1:
- 8. After 30 min post-deploy, query `SELECT task_name, MAX(fired_at) FROM scheduled_tasks_audit WHERE task_name LIKE '%_cron' GROUP BY task_name` — expect at LEAST `feed_integrity_cron` to have a recent row (5-min cadence). Other schedules may not have fired yet (longer cadence) but their cronRegistry entries + boot smoke-test pass = sufficient proof of arming.

---

## §9 Pre-audit summary

**No new migration. No SQL schema changes. Reuses existing `scheduled_tasks_audit` table** (pre-audit discovery, saves a chunk of work + simplifies the migration boundary). 6 new modules + 5 schedule-site wirings + 5 new test files. Active-trading impact ZERO. Crypto path UNTOUCHED (cron mechanism is asset-class-agnostic; this is infra).

**Step 3 ready to proceed.** No blocking gaps surfaced.

---

*End B-NEW-49 pre-audit (CC, 2026-05-31).*
