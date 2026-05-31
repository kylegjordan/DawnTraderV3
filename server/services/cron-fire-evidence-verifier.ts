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

const VERIFIER_INTERVAL_MS = 15 * 60 * 1000;  // 15 minutes
const FIRE_GRACE_MULTIPLIER = 1.5;  // expected_by = lastFire + intervalSeconds × 1.5

// Track when the process started so we apply boot-grace correctly. Set at
// module-init time (= server boot). intervalSeconds × FIRE_GRACE_MULTIPLIER
// grace from process start.
const processStartMs = Date.now();

/**
 * Query last fire-row from scheduled_tasks_audit for each registered job.
 * Returns one row per job name. Job names with no fire-row return null.
 */
async function queryLastFires(jobNames: string[]): Promise<Map<string, Date | null>> {
  const result = new Map<string, Date | null>();
  // Default all to null so jobs with zero rows get a returned entry.
  for (const name of jobNames) result.set(name, null);

  if (jobNames.length === 0) return result;

  try {
    const rows = await db.execute(sql`
      SELECT task_name, MAX(fired_at) AS last_fired_at
      FROM scheduled_tasks_audit
      WHERE task_name = ANY(${jobNames}::text[])
      GROUP BY task_name
    `);
    // Drizzle's execute returns { rows: T[] } for postgres-js / pg, but the
    // result shape varies; normalize both shapes.
    const list: any[] = (rows as any).rows ?? (Array.isArray(rows) ? rows : []);
    for (const row of list) {
      if (row.task_name && row.last_fired_at) {
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
export async function runVerification(): Promise<{ ok: boolean; stale: string[] }> {
  const jobs = cronRegistry.getAll().filter((j) => j.enabled);
  const now = Date.now();
  const stale: string[] = [];

  if (jobs.length === 0) {
    console.log('[CRON-FIRE-VERIFIER] No enabled jobs registered; skipping run');
    return { ok: true, stale: [] };
  }

  const lastFires = await queryLastFires(jobs.map((j) => j.name));

  for (const job of jobs) {
    const lastFire = lastFires.get(job.name) ?? null;
    const intervalMs = job.intervalSeconds * 1000;
    const graceWindowMs = intervalMs * FIRE_GRACE_MULTIPLIER;

    // Boot-grace: skip if process hasn't been up long enough for first fire +
    // grace. Otherwise we'd alert on every boot for daily schedules.
    const bootGraceMs = intervalMs + graceWindowMs;
    const inBootGrace = now - processStartMs < bootGraceMs;

    if (lastFire === null) {
      if (inBootGrace) {
        console.log(
          `[CRON-FIRE-VERIFIER] job=${job.name} no_fires_yet_in_boot_grace ` +
          `(grace_remaining_seconds=${Math.round((bootGraceMs - (now - processStartMs)) / 1000)})`,
        );
        continue;
      }
      // No fires AND past boot-grace → silent failure
      stale.push(job.name);
      await emitStaleAlert(job.name, null, new Date(now), 'no_fires_ever_past_boot_grace');
      continue;
    }

    const lastFireMs = lastFire.getTime();
    const expectedByMs = lastFireMs + graceWindowMs;
    if (now > expectedByMs) {
      const stalenessMinutes = Math.round((now - lastFireMs) / 60000);
      stale.push(job.name);
      console.warn(
        `[CRON-FIRE-VERIFIER] job=${job.name} STALE last_fire=${lastFire.toISOString()} ` +
        `expected_by=${new Date(expectedByMs).toISOString()} staleness_minutes=${stalenessMinutes}`,
      );
      await emitStaleAlert(job.name, lastFire, new Date(expectedByMs), 'stale_fire_evidence');
    } else {
      console.log(
        `[CRON-FIRE-VERIFIER] job=${job.name} healthy last_fire=${lastFire.toISOString()}`,
      );
    }
  }

  return { ok: stale.length === 0, stale };
}

async function emitStaleAlert(
  jobName: string,
  lastFire: Date | null,
  expectedBy: Date,
  reason: string,
): Promise<void> {
  try {
    await addAlert({
      triggers_at: new Date(),
      category: 'breakage',
      severity: 'warning',
      title: `B-NEW-49 cron schedule "${jobName}" appears silently stopped (reason=${reason})`,
      body:
        `The cron-fire-evidence verifier detected that schedule "${jobName}" has not written ` +
        `a fire-evidence row to scheduled_tasks_audit within the expected grace window. ` +
        `Last fire: ${lastFire?.toISOString() ?? 'NEVER'}. Expected by: ${expectedBy.toISOString()}. ` +
        `This matches the BUG-2026-05-31-B silent-failure pattern. Investigate via:\n\n` +
        `  SELECT * FROM scheduled_tasks_audit WHERE task_name = '${jobName}' ` +
        `ORDER BY fired_at DESC LIMIT 5;\n\n` +
        `Likely remediation: PM2 restart (BUG-2026-05-31-B was cleared by next process restart). ` +
        `See SIM §9.10.c for diagnostic workflow.`,
      metadata: {
        batch: 'B-NEW-49',
        kind: 'fire_evidence_verifier',
        job_name: jobName,
        reason,
        last_fire_iso: lastFire?.toISOString() ?? null,
        expected_by_iso: expectedBy.toISOString(),
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
