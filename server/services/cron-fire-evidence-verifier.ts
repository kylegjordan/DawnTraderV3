/**
 * ═══════════════════════════════════════════════════════════════════════════
 * B-NEW-49 — cron-fire-evidence verifier (2026-05-31)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Mode-B coverage (per Langston Step-1 ACK note 1): catches "schedule armed
 * correctly but stopped firing mid-process-lifetime" — exactly the May 29-31
 * BUG-2026-05-31-B failure pattern where node-cron schedules silently
 * stopped firing for ~31 hours.
 *
 * Mechanism:
 *   1. Every 15 minutes via setInterval (NOT node-cron — independent of the
 *      mechanism being monitored, per scope §1.4 + §2.4 invariant).
 *   2. For each registered cron job, query MAX(fired_at) from
 *      scheduled_tasks_audit WHERE task_name = job.name.
 *   3. Compute expected_by = lastFire + intervalSeconds × 1.5 (grace window).
 *   4. If NOW > expected_by → write system-alert (severity=warning,
 *      category=breakage).
 *
 * Boot-grace handling: skip a job if (cronRegistry.registeredAt + intervalSeconds)
 * is in the future — schedule registered but hasn't had time to fire yet.
 * Without this grace, the verifier would false-positive on every boot.
 *
 * Mode-A coverage (arming failed) is handled by the sibling smoke test
 * (`cron-arm-smoke-test.ts`).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { cronRegistry } from './cron-registry.js';
import { addAlert } from './system-alerts.js';
import { computePrevFire } from './cron-next-fire.js';

const VERIFIER_INTERVAL_MS = 15 * 60 * 1000;  // 15 minutes
const FIRE_GRACE_MULTIPLIER = 1.5;  // interval-fallback only: expected_by = lastFire + intervalSeconds × 1.5

// B-NEW-51 (2026-06-02): cadence-aware staleness constants.
// FIRE_LATENCY_GRACE_MS — the gap we allow between a schedule's occurrence and
// its fire-evidence row landing in scheduled_tasks_audit. A schedule is judged
// stale only if its most-recent scheduled occurrence is older than this grace
// AND no evidence exists at/after (occurrence − grace).
const FIRE_LATENCY_GRACE_MS = 10 * 60 * 1000;  // 10 minutes
// BOOT_GRACE_MS — don't judge any job until the process has been up this long,
// so we never race boot-time evidence writes. Replaces the old interval-derived
// boot grace (which was meaningless for calendar schedules).
const BOOT_GRACE_MS = 5 * 60 * 1000;  // 5 minutes

// Track when the process started so we apply boot-grace correctly. Set at
// module-init time (= server boot). intervalSeconds × FIRE_GRACE_MULTIPLIER
// grace from process start.
let processStartMs = Date.now();

/** Test-only: override the recorded process-start so boot-grace can be
 * exercised deterministically. */
export function _setProcessStartForTest(ms: number): void {
  processStartMs = ms;
}

/**
 * Query last fire-row from scheduled_tasks_audit for each registered job.
 * Returns one row per job name. Job names with no fire-row return null.
 *
 * RUNNING_ISSUES #167 fix (2026-05-31): previously used
 * `WHERE task_name = ANY(${jobNames}::text[])` which Drizzle's sql template
 * does not escape correctly for Postgres text[] casts — query silently
 * returned zero rows, causing false-positive "no_fires_ever_past_boot_grace"
 * alerts on healthy schedules. Replaced with unfiltered GROUP BY + JS-side
 * filter against the registered job set. Table has ~10-20 distinct task_name
 * values (B-NEW-36 + B-NEW-49 + boot_state_reconciliation), perf negligible.
 */
async function queryLastFires(jobNames: string[]): Promise<Map<string, Date | null>> {
  const result = new Map<string, Date | null>();
  // Default all to null so jobs with zero rows get a returned entry.
  for (const name of jobNames) result.set(name, null);

  if (jobNames.length === 0) return result;

  const wantedNames = new Set(jobNames);

  try {
    const rows = await db.execute(sql`
      SELECT task_name, MAX(fired_at) AS last_fired_at
      FROM scheduled_tasks_audit
      GROUP BY task_name
    `);
    // Drizzle's execute returns { rows: T[] } for postgres-js / pg, but the
    // result shape varies; normalize both shapes.
    const list: any[] = (rows as any).rows ?? (Array.isArray(rows) ? rows : []);
    for (const row of list) {
      if (
        row.task_name &&
        row.last_fired_at &&
        wantedNames.has(row.task_name)
      ) {
        result.set(row.task_name, new Date(row.last_fired_at));
      }
    }
  } catch (err) {
    console.error(
      `[CRON-FIRE-VERIFIER][QUERY_FAIL] ` +
      (err instanceof Error ? err.message : err),
    );
    // Return defaults; verifier silently skips this run rather than alerting
    // spuriously on a DB hiccup.
  }
  return result;
}

/**
 * Run the verifier across all registered cron jobs. Returns true if all
 * jobs are healthy (or in boot-grace window), false if any alert was fired.
 *
 * Never throws — verifier-failure is observability, not correctness.
 */
export async function runVerification(nowMs: number = Date.now()): Promise<{ ok: boolean; stale: string[] }> {
  const jobs = cronRegistry.getAll().filter((j) => j.enabled);
  const now = nowMs;
  const stale: string[] = [];

  if (jobs.length === 0) {
    console.log('[CRON-FIRE-VERIFIER] No enabled jobs registered; skipping run');
    return { ok: true, stale: [] };
  }

  // B-NEW-51: process-level boot-grace. Don't judge any job until the process
  // has been up long enough that a just-occurred fire has had time to write its
  // evidence row. Avoids false-positives in the first minutes after a restart.
  if (now - processStartMs < BOOT_GRACE_MS) {
    console.log(
      `[CRON-FIRE-VERIFIER] in_boot_grace (uptime ` +
      `${Math.round((now - processStartMs) / 1000)}s < ${BOOT_GRACE_MS / 1000}s); skipping run`,
    );
    return { ok: true, stale: [] };
  }

  const lastFires = await queryLastFires(jobs.map((j) => j.name));

  for (const job of jobs) {
    const lastFire = lastFires.get(job.name) ?? null;

    // B-NEW-51: cadence-aware expected fire — the most recent scheduled
    // occurrence STRICTLY before now, per the job's actual cron expression +
    // timezone (cron-parser .prev(), the trusted introspection path). Replaces
    // the old `lastFire + intervalSeconds × 1.5` model, which judged a weekly
    // Friday job as "should have fired by Tuesday".
    const prevOccurrence = computePrevFire(job.expression, job.timezone, new Date(now));

    if (prevOccurrence === null) {
      // Unparseable expression (registry requires a valid one, so this is a
      // belt-and-suspenders fallback). Retain the legacy interval×1.5 model so
      // we never go blind on a job we can't calendar-evaluate.
      const graceWindowMs = job.intervalSeconds * 1000 * FIRE_GRACE_MULTIPLIER;
      if (lastFire === null) {
        stale.push(job.name);
        await emitStaleAlert(
          job.name, null, new Date(now), 'no_fires_ever_interval_fallback',
          `cron_stale:${job.name}:no_prev_parse`,
        );
      } else if (now > lastFire.getTime() + graceWindowMs) {
        stale.push(job.name);
        const expectedBy = new Date(lastFire.getTime() + graceWindowMs);
        console.warn(
          `[CRON-FIRE-VERIFIER] job=${job.name} STALE (interval-fallback) ` +
          `last_fire=${lastFire.toISOString()} expected_by=${expectedBy.toISOString()}`,
        );
        await emitStaleAlert(
          job.name, lastFire, expectedBy, 'stale_fire_evidence_interval_fallback',
          `cron_stale:${job.name}:${expectedBy.toISOString()}`,
        );
      } else {
        console.log(`[CRON-FIRE-VERIFIER] job=${job.name} healthy (interval-fallback)`);
      }
      continue;
    }

    const prevMs = prevOccurrence.getTime();

    // If the most recent scheduled occurrence is within the fire-latency grace
    // of now, its evidence row may not be written yet — not stale.
    if (now - prevMs < FIRE_LATENCY_GRACE_MS) {
      console.log(
        `[CRON-FIRE-VERIFIER] job=${job.name} prev_occurrence_within_grace ` +
        `(${prevOccurrence.toISOString()}); skipping`,
      );
      continue;
    }

    // Stale iff there's no fire-evidence at/after the most recent scheduled
    // occurrence (minus grace for write latency).
    const staleThresholdMs = prevMs - FIRE_LATENCY_GRACE_MS;
    const isStale = lastFire === null || lastFire.getTime() < staleThresholdMs;

    if (isStale) {
      stale.push(job.name);
      const dedupeKey = `cron_stale:${job.name}:${prevOccurrence.toISOString()}`;
      console.warn(
        `[CRON-FIRE-VERIFIER] job=${job.name} STALE last_fire=${lastFire?.toISOString() ?? 'NEVER'} ` +
        `prev_occurrence=${prevOccurrence.toISOString()} dedupe_key=${dedupeKey}`,
      );
      await emitStaleAlert(
        job.name, lastFire, prevOccurrence,
        lastFire === null ? 'no_fires_ever' : 'stale_fire_evidence',
        dedupeKey,
      );
    } else {
      console.log(
        `[CRON-FIRE-VERIFIER] job=${job.name} healthy last_fire=${lastFire?.toISOString()} ` +
        `prev_occurrence=${prevOccurrence.toISOString()}`,
      );
    }
  }

  return { ok: stale.length === 0, stale };
}

async function emitStaleAlert(
  jobName: string,
  lastFire: Date | null,
  /** The most recent expected occurrence (cadence-aware) OR, for the
   * interval-fallback path, the computed expected-by time. */
  expectedOccurrence: Date,
  reason: string,
  /** B-NEW-51: dedup key — collapses the every-15-min re-check into one alert
   * per missed occurrence. Same key → suppressed by addAlert. */
  dedupeKey: string,
): Promise<void> {
  try {
    await addAlert({
      triggers_at: new Date(),
      category: 'breakage',
      severity: 'warning',
      dedupe_key: dedupeKey,
      title: `B-NEW-49 cron schedule "${jobName}" missed its scheduled fire (reason=${reason})`,
      body:
        `The cron-fire-evidence verifier found NO fire-evidence row in scheduled_tasks_audit ` +
        `at or after this schedule's most recent expected occurrence.\n` +
        `Schedule: "${jobName}". Most recent expected occurrence: ${expectedOccurrence.toISOString()}. ` +
        `Last recorded fire: ${lastFire?.toISOString() ?? 'NEVER'}.\n\n` +
        `B-NEW-51: this check is now CADENCE-AWARE (compares against the schedule's actual calendar ` +
        `occurrence via cron-parser, not a fixed interval) and DE-DUPLICATED (one alert per missed ` +
        `occurrence, not one per 15-min cycle). NOTE: a PM2 restart does NOT fix a calendar/arming miss — ` +
        `if a missed occurrence has no later occurrence yet, this clears automatically on the next ` +
        `successful fire. See SIM §9.10.c.\n\n` +
        `Investigate: SELECT * FROM scheduled_tasks_audit WHERE task_name = '${jobName}' ` +
        `ORDER BY fired_at DESC LIMIT 5;`,
      metadata: {
        batch: 'B-NEW-49',
        kind: 'fire_evidence_verifier',
        job_name: jobName,
        reason,
        last_fire_iso: lastFire?.toISOString() ?? null,
        expected_occurrence_iso: expectedOccurrence.toISOString(),
        dedupe_key: dedupeKey,
      },
    });
  } catch (err) {
    console.error(
      `[CRON-FIRE-VERIFIER][ALERT_WRITE_FAIL] job=${jobName}: ` +
      (err instanceof Error ? err.message : err),
    );
  }
}

let _verifierIntervalId: NodeJS.Timeout | null = null;

/**
 * Start the verifier setInterval loop. Called from autonomy-scheduler boot
 * path. Idempotent — second call is a no-op.
 */
export function startCronFireEvidenceVerifier(): void {
  if (_verifierIntervalId) {
    console.warn('[CRON-FIRE-VERIFIER] startCronFireEvidenceVerifier called twice; ignoring');
    return;
  }
  // First run after first interval, NOT at boot (boot-grace + smoke-test
  // covers the boot moment).
  _verifierIntervalId = setInterval(() => {
    runVerification().catch((err) => {
      console.error(
        '[CRON-FIRE-VERIFIER][LOOP_UNHANDLED] ' +
        (err instanceof Error ? err.message : err),
      );
    });
  }, VERIFIER_INTERVAL_MS);

  console.log(
    `[CRON-FIRE-VERIFIER] Started; interval=${VERIFIER_INTERVAL_MS / 1000}s, ` +
    `grace_multiplier=${FIRE_GRACE_MULTIPLIER}x`,
  );
}

/** Test-only: stop the verifier (clears the setInterval). */
export function _stopForTest(): void {
  if (_verifierIntervalId) {
    clearInterval(_verifierIntervalId);
    _verifierIntervalId = null;
  }
}
