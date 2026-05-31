# B-NEW-49 — Step 4 Code Review Dispatch

**Batch:** B-NEW-49 (node-cron observability + deploy-state arming verification)
**Status:** Implementation complete + local verification green. Awaiting Step 4 ACK to push.
**Adjustments vs scope:** §3 Chunk A (migration) DROPPED — pre-audit found existing `scheduled_tasks_audit` table is shape-compatible; just reuse. Net change: 1 fewer chunk than scope §5, scope effectively §5 minus Chunk A.

> **INFRASTRUCTURE NOTE: DO NOT cd to /mnt/gdrive. Use `ssh staging` for repo-side inspection. All diffs embedded inline.**

---

## 1. Pre-audit decision (Step 2 finding)

The existing `scheduled_tasks_audit` table (B-NEW-36, columns: `task_name`, `scheduled_for`, `fired_at`, `status`, `error_message`, `meta jsonb`, `created_at`) has EXACTLY the shape needed for B-NEW-49's per-fire writes. **No new migration. No new table.** All 5 new schedule writes use this table with disjoint task_name values from B-NEW-36's existing values. This significantly simplifies the batch — Chunk A dropped from scope.

Full pre-audit at: `Claude Comms and Packages/Scope Files/B_NEW_49_PRE_AUDIT.md`

---

## 2. Changeset summary

**6 modified files, 5 new modules, 5 new test files. ZERO migration. ZERO schema changes.**

| File | Status | Purpose |
|---|---|---|
| `server/services/cron-registry.ts` | NEW (~85 LOC) | In-memory registry of all cron schedules; getter for smoke test + verifier |
| `server/services/cron-arm-logger.ts` | NEW (~70 LOC) | `[CRON-REGISTRATION]` log line emitter; tags WARNING_NULL/PAST_NEXT_RUN |
| `server/services/scheduled-jobs-audit.ts` | NEW (~80 LOC) | `writeFireRow()` shared INSERT helper (failure-safe) |
| `server/services/cron-arm-smoke-test.ts` | NEW (~140 LOC) | Boot + boot+5min smoke test; Mode-A arming check; alerts on PAST_DUE / TOO_FAR_FUTURE / NULL_NEXT_RUN |
| `server/services/cron-fire-evidence-verifier.ts` | NEW (~180 LOC) | 15-min setInterval verifier; Mode-B mid-lifetime tick-loop-death check; alerts on stale fire-evidence |
| `server/services/session-lifecycle-controller.ts` | MODIFIED (+26) | B-NEW-36's 2 cron schedules → register with cron-registry + log arm |
| `server/services/xstock-universe-cron.ts` | MODIFIED (+36) | Register + log arm + add fire-evidence write |
| `server/jobs/formula-auto-audit.ts` | MODIFIED (+52) | STORE cron handle (was fire-and-forget) + register + log arm + fire-evidence |
| `server/jobs/feed-integrity-auto-check.ts` | MODIFIED (+56) | Register + log arm + fire-evidence (after jitter sleep) |
| `server/services/awareness-scheduler.ts` | MODIFIED (+63) | Register both schedules + log arm + fire-evidence on both |
| `server/index.ts` | MODIFIED (+16) | Invoke smoke test + start verifier AFTER awareness-scheduler init |
| `server/tests/unit/cron-registry.test.ts` | NEW (5 tests) | Idempotency, get-by-name, reset |
| `server/tests/unit/cron-arm-logger.test.ts` | NEW (4 tests) | OK + NULL + PAST + throw classifications |
| `server/tests/unit/scheduled-jobs-audit.test.ts` | NEW (4 tests) | INSERT shape, error_message field, failure-safe |
| `server/tests/unit/cron-arm-smoke-test.test.ts` | NEW (6 tests) | All 5 statuses + aggregate ok + disabled-skipped |
| `server/tests/unit/cron-fire-evidence-verifier.test.ts` | NEW (5 tests) | Stale alert, healthy no-alert, disabled-skipped, empty-registry, DB failure-safe |

Total: 24 new tests + 28 adjacent (B-NEW-36 + sync-canonical-bridge) all green; tsc baseline 493 (1 below current 494 baseline = no regression).

---

## 3. Embedded diff — shared modules (most important)

### 3.a `cron-registry.ts` (NEW) — core public API

```ts
export interface RegisteredCronJob {
  name: string;                    // matches task_name written to audit table
  task: ScheduledTask;             // node-cron 4.x handle
  expression: string;
  timezone: string;
  intervalSeconds: number;         // computed at registration
  enabled: boolean;
}

const registry = new Map<string, RegisteredCronJob>();

export function register(job: RegisteredCronJob): void {
  if (registry.has(job.name)) {
    console.warn(`[CRON-REGISTRY] Duplicate registration for job=${job.name} — ignoring`);
    return;
  }
  registry.set(job.name, job);
  console.log(`[CRON-REGISTRY] Registered job=${job.name} expr=${job.expression} ...`);
}

export function getAll(): RegisteredCronJob[] { return Array.from(registry.values()); }
export function get(name: string): RegisteredCronJob | undefined { return registry.get(name); }
// Test-only helpers: _resetForTest(), _countForTest()
```

### 3.b `cron-arm-logger.ts` (NEW) — `[CRON-REGISTRATION]` log emitter

```ts
export function logCronArm(job: RegisteredCronJob): void {
  let nextFire: Date | null = null;
  let warningTag = '';
  try {
    nextFire = job.task.getNextRun();  // node-cron 4.x public API
  } catch (err) {
    console.error(`[CRON-REGISTRATION] job=${job.name} getNextRun() threw: ${err}`);
    nextFire = null;
  }
  if (nextFire === null) warningTag = ' [WARNING_NULL_NEXT_RUN]';
  else if (nextFire.getTime() < Date.now()) warningTag = ' [WARNING_PAST_NEXT_RUN]';
  console.log(
    `[CRON-REGISTRATION] job=${job.name} expr=${job.expression} ` +
    `tz=${job.timezone} interval_seconds=${job.intervalSeconds} ` +
    `next_fire=${nextFire?.toISOString() ?? 'null'} enabled=${job.enabled}${warningTag}`,
  );
}
```

### 3.c `scheduled-jobs-audit.ts` (NEW) — failure-safe INSERT helper

```ts
export async function writeFireRow(opts: WriteFireRowOptions): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO scheduled_tasks_audit
        (task_name, scheduled_for, fired_at, status, error_message, meta)
      VALUES
        (${opts.jobName}, ${opts.scheduledFor.toISOString()}::timestamptz,
         ${opts.firedAt.toISOString()}::timestamptz, ${opts.status},
         ${opts.errorMessage ?? null}, ${JSON.stringify(opts.meta ?? {})}::jsonb)
    `);
  } catch (err) {
    console.error(`[SCHEDULED-JOBS-AUDIT][WRITE_FAIL] job=${opts.jobName}: ${err}`);
    // Swallow — audit-write failure must not block the cron callback.
  }
}
```

### 3.d `cron-arm-smoke-test.ts` (NEW) — Mode-A coverage

Classification logic:
```ts
if (nextFire === null) status = 'NULL_NEXT_RUN';
else if (nextFire.getTime() < now) status = 'PAST_DUE';
else if (nextFire.getTime() > now + intervalSeconds * 2 * 1000) status = 'TOO_FAR_FUTURE';
else status = 'OK';

if (status !== 'OK') {
  await addAlert({ category: 'breakage', severity: 'warning', ... });
}
```

Boot wiring (called after all 5 schedule registrations complete):
```ts
runSmokeTest('boot');  // immediate
setTimeout(() => runSmokeTest('boot+5min'), 5 * 60 * 1000);
```

### 3.e `cron-fire-evidence-verifier.ts` (NEW) — Mode-B coverage

Loop: every 15 min via `setInterval` (NOT node-cron — independent of monitored mechanism).

Query: `SELECT task_name, MAX(fired_at) FROM scheduled_tasks_audit WHERE task_name = ANY(...) GROUP BY task_name`

Logic:
```ts
for (const job of jobs) {
  const lastFire = lastFires.get(job.name);
  const graceMs = job.intervalSeconds * 1.5 * 1000;
  const bootGraceMs = job.intervalSeconds * 1000 + graceMs;
  const inBootGrace = Date.now() - processStartMs < bootGraceMs;
  if (lastFire === null && inBootGrace) continue;  // no alert during grace
  if (lastFire === null) await emitStaleAlert('no_fires_ever_past_boot_grace');
  else if (Date.now() > lastFire.getTime() + graceMs) await emitStaleAlert('stale_fire_evidence');
}
```

---

## 4. Embedded diff — wiring into 5 schedule sites

### 4.a `session-lifecycle-controller.ts` — register both weekend timers

After `cron.schedule(...)` for `friShutdownTask` + `sunRestartTask`:

```ts
cronRegistry.register({
  name: 'weekend_shutdown',
  task: this.friShutdownTask,
  expression: CRON_FRI_8PM_ET,
  timezone: TIMEZONE_ET,
  intervalSeconds: 604800,  // weekly
  enabled: true,
});
logCronArm(cronRegistry.get('weekend_shutdown')!);
// (mirror for weekend_restart)
```

NOTE: B-NEW-36 already writes audit rows to `scheduled_tasks_audit` via `runWeekendShutdownCore`/`runWeekendRestartCore`. No additional `writeFireRow` calls needed at this site — the verifier will see those existing rows. Only cronRegistry registration + arm log are added.

### 4.b `xstock-universe-cron.ts` — wrap callback with fire-evidence write

```ts
_cronTask = cron.schedule(CRON_06_00_UTC, async () => {
  const firedAt = new Date();
  const startMs = firedAt.getTime();
  let status: 'success' | 'error' = 'success';
  let errorMessage: string | undefined;
  try {
    await runDiscovery('cron_daily');
  } catch (err) {
    status = 'error';
    errorMessage = err instanceof Error ? err.message : String(err);
    console.error('[B79.0n.UNIVERSE-DISCOVERY][cron] daily refresh threw unexpectedly:', err);
  } finally {
    await scheduledJobsAudit.writeFireRow({
      jobName: 'xstock_universe_discovery_cron',
      scheduledFor: firedAt, firedAt, status, errorMessage,
      meta: { trigger_source: 'cron', duration_ms: Date.now() - startMs },
    });
  }
}, { timezone: 'UTC' });

cronRegistry.register({
  name: 'xstock_universe_discovery_cron',
  task: _cronTask,
  expression: CRON_06_00_UTC,
  timezone: 'UTC',
  intervalSeconds: 86400,
  enabled: true,
});
logCronArm(cronRegistry.get('xstock_universe_discovery_cron')!);
```

### 4.c `formula-auto-audit.ts` — STORE the handle (was fire-and-forget!) + same wrapper

Before B-NEW-49: `cron.schedule(SCHEDULE, async () => {...})` — handle DISCARDED.
After: `const _task = cron.schedule(SCHEDULE, async () => { /* wrapper with try/finally writeFireRow */ })` + dynamic-imported cron-registry register.

This is the only site that needed the structural change of "stop being fire-and-forget" — every other site already stored the handle.

### 4.d `feed-integrity-auto-check.ts` — fire-evidence written AFTER jitter sleep

```ts
job = cron.schedule(cronSchedule, async () => {
  const jitter = Math.floor(Math.random() * 30 * 1000);
  await new Promise(resolve => setTimeout(resolve, jitter));
  // Fire-evidence written AFTER jitter — captures the actual cron-fire-then-check window
  const firedAt = new Date();
  // ... wrapper with try/finally writeFireRow (meta includes jitter_ms)
}, { timezone: 'UTC' });
```

### 4.e `awareness-scheduler.ts` — both schedules wired same pattern

Both `stateUpdateTask` + `reflectionTask` wrapped with try/finally + writeFireRow + cronRegistry registration. Disjoint task_names: `awareness_state_update_cron` (hourly, 3600s) + `awareness_reflection_cron` (6h, 21600s).

### 4.f `server/index.ts` — boot wiring AFTER all 5 schedule sites init

After `initializeAwarenessScheduler()`:
```ts
try {
  const { scheduleSmokeTestRuns } = await import('./services/cron-arm-smoke-test.js');
  scheduleSmokeTestRuns();  // boot + setTimeout(5min)
  const { startCronFireEvidenceVerifier } = await import('./services/cron-fire-evidence-verifier.js');
  startCronFireEvidenceVerifier();  // 15-min setInterval
  console.log('[B-NEW-49] ✅ Cron observability layer started');
} catch (error) {
  console.error('[B-NEW-49] ⚠️ Cron observability startup failed:', error);
}
```

---

## 5. Verification gates

| Gate | Result |
|---|---|
| tsc baseline | 493 / 494 (UNCHANGED; actually 1 below) |
| New unit tests | 24 / 24 green (5 test files) |
| Adjacent suites (B-NEW-36 + sync-canonical-bridge) | 28 / 28 green; no regressions |
| Producer-consumer contract (ASSET_CLASS_ONBOARDING_WORKFLOW §4.25) | Reuses existing `scheduled_tasks_audit` schema; producer = `writeFireRow`, consumer = `runVerification`. Test `scheduled-jobs-audit.test.ts` asserts INSERT shape. |

Local verification: ✅ COMPLETE. Ready to push pending Step-4 ACK.

---

## 6. Three review questions

1. **Mode-A vs Mode-B framing in code comments + SIM §9.10.c (Langston Step-1 ACK note 1):** documented explicitly in all 5 new modules' header comments AND will document in SIM at Step 10. Confirm framing reads correctly:
   - Mode-A: arming failed → smoke test catches at boot + boot+5min
   - Mode-B: armed correctly, tick loop died mid-lifetime → fire-evidence verifier catches within 15-min cadence

2. **Boot grace window** for fire-evidence verifier: currently `intervalSeconds + intervalSeconds × 1.5 = 2.5x interval`. For daily schedules that's ~60 hours of post-boot tolerance before first fire is mandatory. Acceptable, or do you want it tighter? My lean: leave at 2.5x — the smoke test catches arming failure separately, so the verifier's only job is mid-lifetime detection.

3. **`task` field stored in cronRegistry** — direct reference to the node-cron `ScheduledTask`. If node-cron silently fails again and the underlying scheduler state corrupts, the `task` reference may still be intact but the underlying timer won't fire. The smoke test will catch this via `getNextRun()` returning past/null. The verifier will catch this via stale fire-evidence rows. No additional guard needed?

---

## 7. Plan if you ACK

1. Commit + push to GitHub on `migration/aws-supabase` with commit message: `"B-NEW-49 — node-cron observability + deploy-state arming verification"`
2. Watch CI 4 jobs all-green via `gh run watch`
3. Deploy to staging (`git pull` + `npm run build` + `pm2 restart dawntrader`) — no migration step (scope §1.1 reuses existing table)
4. Step 7 verify: 5 `[CRON-REGISTRATION]` log lines at boot; boot smoke-test logs `[CRON-ARM-SMOKE] aggregate=OK`; +5min smoke-test re-fires; verifier first-15min cycle reports all healthy; first `feed_integrity_cron` row appears in `scheduled_tasks_audit` within 5 min of boot
5. Step 8: you do second-pass verification
6. Step 10: governance close (SIM §9.10.c NEW, BATCH_CATALOG + PHASE_HISTORY + CHANGES_AND_FIXES BUG-2026-05-31-B-UPDATE + RUNNING_ISSUES #164 CLOSED + ASSET_CLASS_ONBOARDING_WORKFLOW §4.26 reinforcement)
7. Step 11: completion report

Active trading remains OFF throughout. Zero capital risk.

---

*Reply ACK to push, ACK-W-REVISIONS with specifics, or BLOCK with reasoning. Reply target <600 tokens.*
