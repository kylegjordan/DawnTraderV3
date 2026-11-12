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
 *   2. For each registered cron job, query the latest successful scheduled
 *      boundary across the audit stream and durable occurrence ledger.
 *   3. Compare it with the job's cadence-aware previous calendar occurrence.
 *   4. If that occurrence has no successful boundary → write system-alert (severity=warning,
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
import { cronRegistry, type RegisteredCronJob } from './cron-registry.js';
import { cronOccurrenceRunner } from './cron-occurrence-runner.js';
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

// B-CRON-VERIFIER-QUERY-FAIL (row 59g2, #1211): a failed history read is a SKIPPED run, not "every job never fired".
// The staleness check is level-triggered on each job's most recent occurrence, so one skipped run costs no
// detection — it delays it by one interval. At 4 consecutive skips (an hour at the 15-minute cadence) an hourly
// job's occurrence passes unexamined, so the verifier says it is blind — once per episode, never per run.
// A verifier liveness constant, not a trading setting.
const BLIND_ESCALATION_SKIPS = 4;
let consecutiveSkips = 0;
let totalSkips = 0;
let firstSkipAt: Date | null = null;

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
 * Query the latest successfully completed scheduled boundary for each job.
 * The occurrence ledger is included because its durable success is the truth
 * when the failure-safe audit write is unavailable.
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
async function queryLastFires(jobNames: string[]): Promise<Map<string, Date | null> | null> {
  const result = new Map<string, Date | null>();
  // Default all to null so jobs with zero rows get a returned entry.
  for (const name of jobNames) result.set(name, null);

  if (jobNames.length === 0) return result;

  const wantedNames = new Set(jobNames);

  try {
    const rows = await db.execute(sql`
      SELECT task_name, MAX(scheduled_for) AS last_scheduled_for
        FROM (
          SELECT task_name, scheduled_for
            FROM scheduled_tasks_audit
           WHERE status = 'success'
          UNION ALL
          SELECT job_name AS task_name, scheduled_for
            FROM scheduled_job_occurrences
           WHERE status = 'succeeded'
        ) successful_boundaries
       GROUP BY task_name
    `);
    // Drizzle's execute returns { rows: T[] } for postgres-js / pg, but the
    // result shape varies; normalize both shapes.
    const list: any[] = (rows as any).rows ?? (Array.isArray(rows) ? rows : []);
    for (const row of list) {
      if (
        row.task_name &&
        row.last_scheduled_for &&
        wantedNames.has(row.task_name)
      ) {
        result.set(row.task_name, new Date(row.last_scheduled_for));
      }
    }
  } catch (err) {
    console.error(
      `[CRON-FIRE-VERIFIER][QUERY_FAIL] ` +
      (err instanceof Error ? err.message : err),
    );
    // B-CRON-VERIFIER-QUERY-FAIL (#1211): report the failure so the caller SKIPS the run. Returning the pre-filled
    // nulls (as this did until 2026-10-18) read every job as "never fired" and paged the hourly-to-daily ones.
    return null;
  }
  return result;
}

/**
 * Run the verifier across all registered cron jobs. Returns true if all
 * jobs are healthy (or in boot-grace window), false if any alert was fired.
 *
 * Never throws — verifier-failure is observability, not correctness.
 */
export async function runVerification(
  nowMs: number = Date.now(),
): Promise<{
  ok: boolean;
  stale: string[];
  skipped?: 'query_fail' | 'locked_recheck_fail';
  blind?: string[];
}> {
  const jobs = cronRegistry.getAll().filter((j) => j.enabled);
  const now = nowMs;
  const stale: string[] = [];
  const blind: string[] = [];

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

  const lastSuccessfulBoundaries = await queryLastFires(jobs.map((j) => j.name));
  if (lastSuccessfulBoundaries === null) {
    // The history could not be read: judge nothing (no evidence is not evidence of a missed fire).
    consecutiveSkips += 1;
    totalSkips += 1;
    if (!firstSkipAt) firstSkipAt = new Date(now);
    console.warn(
      `[CRON-FIRE-VERIFIER][SKIPPED_QUERY_FAIL] consecutive=${consecutiveSkips} total_since_boot=${totalSkips} ` +
      `since=${firstSkipAt.toISOString()}`,
    );
    // `>=`, not `===` (Langston C-8): the alert write can fail (addAlert rejects an off-SSOT category) and is
    // swallowed, so a one-shot at exactly 4 could leave an episode never paged. The dedupe key makes `>=` still
    // one row per episode; after a hand-resolve while still blind, the next skip re-pages — the honest behaviour.
    if (consecutiveSkips >= BLIND_ESCALATION_SKIPS) await emitBlindAlert(firstSkipAt);
    return { ok: true, stale: [], skipped: 'query_fail' };
  }
  if (consecutiveSkips > 0 && firstSkipAt) {
    // The recovery signal the blind alert's body names: same stream (stderr → error.log) and retention as the
    // SKIPPED lines it discharges. A `healthy` line goes to stdout and may not print at all on a tick where
    // every job is inside its latency grace (Langston, Step-4 record item).
    console.warn(
      `[CRON-FIRE-VERIFIER][READ_RECOVERED] after=${consecutiveSkips} consecutive skips since=${firstSkipAt.toISOString()} ` +
      `total_since_boot=${totalSkips}`,
    );
  }
  consecutiveSkips = 0;
  firstSkipAt = null;

  for (const job of jobs) {
    const lastSuccessfulBoundary = lastSuccessfulBoundaries.get(job.name) ?? null;

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
      if (lastSuccessfulBoundary === null) {
        stale.push(job.name);
        await emitStaleAlert(
          job.name, null, new Date(now), 'no_fires_ever_interval_fallback',
          `cron_stale:${job.name}:no_prev_parse`,
          false,
        );
      } else if (now > lastSuccessfulBoundary.getTime() + graceWindowMs) {
        stale.push(job.name);
        const expectedBy = new Date(lastSuccessfulBoundary.getTime() + graceWindowMs);
        console.warn(
          `[CRON-FIRE-VERIFIER] job=${job.name} STALE (interval-fallback) ` +
          `last_successful_boundary=${lastSuccessfulBoundary.toISOString()} expected_by=${expectedBy.toISOString()}`,
        );
        await emitStaleAlert(
          job.name, lastSuccessfulBoundary, expectedBy, 'stale_fire_evidence_interval_fallback',
          `cron_stale:${job.name}:${expectedBy.toISOString()}`,
          false,
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
    const isStale = lastSuccessfulBoundary === null
      || lastSuccessfulBoundary.getTime() < staleThresholdMs;

    if (isStale) {
      // The first read identifies a candidate. Re-read and mint while holding
      // the same cross-process job lock used by natural and catch-up runs. This
      // closes the old gap where a successful core could resolve an absent
      // alert, release its lock, and then be paged by an already-stale read.
      const outcome = await emitCadenceStaleIfStillMissing(job, now);
      if (outcome === 'stale') stale.push(job.name);
      else if (outcome === 'blind') blind.push(job.name);
    } else {
      console.log(
        `[CRON-FIRE-VERIFIER] job=${job.name} healthy ` +
        `last_successful_boundary=${lastSuccessfulBoundary?.toISOString()} ` +
        `prev_occurrence=${prevOccurrence.toISOString()}`,
      );
    }
  }

  if (blind.length > 0) {
    return { ok: false, stale, skipped: 'locked_recheck_fail', blind };
  }
  return { ok: stale.length === 0, stale };
}

async function emitCadenceStaleIfStillMissing(
  job: RegisteredCronJob,
  nowMs: number,
): Promise<'stale' | 'healthy' | 'blind'> {
  try {
    return await cronOccurrenceRunner.runVerifierLocked(job.name, async () => {
      const lockedRead = await queryLastFires([job.name]);
      if (lockedRead === null) {
        console.warn(`[CRON-FIRE-VERIFIER][LOCKED_RECHECK_SKIPPED] job=${job.name} history read failed`);
        return 'blind' as const;
      }

      const expectedOccurrence = computePrevFire(job.expression, job.timezone, new Date(nowMs));
      if (!expectedOccurrence || nowMs - expectedOccurrence.getTime() < FIRE_LATENCY_GRACE_MS) {
        return 'healthy' as const;
      }

      const lastSuccessfulBoundary = lockedRead.get(job.name) ?? null;
      const staleThresholdMs = expectedOccurrence.getTime() - FIRE_LATENCY_GRACE_MS;
      if (
        lastSuccessfulBoundary !== null
        && lastSuccessfulBoundary.getTime() >= staleThresholdMs
      ) {
        console.log(
          `[CRON-FIRE-VERIFIER] job=${job.name} recovered_before_locked_recheck ` +
          `last_successful_boundary=${lastSuccessfulBoundary.toISOString()}`,
        );
        return 'healthy' as const;
      }

      const dedupeKey = `cron_stale:${job.name}:${expectedOccurrence.toISOString()}`;
      console.warn(
        `[CRON-FIRE-VERIFIER] job=${job.name} STALE ` +
        `last_successful_boundary=${lastSuccessfulBoundary?.toISOString() ?? 'NEVER'} ` +
        `prev_occurrence=${expectedOccurrence.toISOString()} dedupe_key=${dedupeKey}`,
      );
      await emitStaleAlert(
        job.name,
        lastSuccessfulBoundary,
        expectedOccurrence,
        lastSuccessfulBoundary === null ? 'no_fires_ever' : 'stale_fire_evidence',
        dedupeKey,
        true,
      );
      return 'stale' as const;
    });
  } catch (err) {
    console.error(
      `[CRON-FIRE-VERIFIER][LOCKED_RECHECK_FAIL] job=${job.name}: `
      + (err instanceof Error ? err.message : err),
    );
    return 'blind';
  }
}

async function emitStaleAlert(
  jobName: string,
  lastSuccessfulBoundary: Date | null,
  /** The most recent expected occurrence (cadence-aware) OR, for the
   * interval-fallback path, the computed expected-by time. */
  expectedOccurrence: Date,
  reason: string,
  /** B-NEW-51: dedup key — collapses the every-15-min re-check into one alert
   * per missed occurrence. Same key → suppressed by addAlert. */
  dedupeKey: string,
  /** Only calendar-derived occurrence identities are immutable one-shot keys.
   * Interval fallback keys represent a reusable condition and may recur. */
  oneShot: boolean,
): Promise<void> {
  try {
    await addAlert({
      triggers_at: new Date(),
      category: 'breakage',
      severity: 'warning',
      dedupe_key: dedupeKey,
      ...(oneShot ? { one_shot: true } : {}),
      title: `B-NEW-49 cron schedule "${jobName}" missed its scheduled fire (reason=${reason})`,
      body:
        `The cron-fire-evidence verifier found NO successful completion boundary in ` +
        `scheduled_tasks_audit or scheduled_job_occurrences at or after this schedule's ` +
        `most recent expected occurrence.\n` +
        `Schedule: "${jobName}". Most recent expected occurrence: ${expectedOccurrence.toISOString()}. ` +
        `Last successful boundary: ${lastSuccessfulBoundary?.toISOString() ?? 'NEVER'}.\n\n` +
        `B-NEW-51: this check is now CADENCE-AWARE (compares against the schedule's actual calendar ` +
        `occurrence via cron-parser, not a fixed interval) and DE-DUPLICATED (one alert per missed ` +
        `occurrence, not one per 15-min cycle). NOTE: a process restart or a later natural fire does NOT ` +
        `erase this missed occurrence. Only successful recovery of this exact scheduled occurrence clears ` +
        `the alert; a skipped, failed or indeterminate recovery remains open. See SIM §9.10.c.\n\n` +
        `Investigate both completed audit rows and scheduled_job_occurrences for '${jobName}'.`,
      metadata: {
        batch: 'B-NEW-49',
        kind: 'fire_evidence_verifier',
        job_name: jobName,
        reason,
        last_successful_boundary_iso: lastSuccessfulBoundary?.toISOString() ?? null,
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

/**
 * B-CRON-VERIFIER-QUERY-FAIL (#1211): the verifier could not read job history for BLIND_ESCALATION_SKIPS
 * consecutive runs. One alert per blind episode (the key carries the first skip's time). It states a FLOOR — the
 * row is minted once, so the live count is the SKIPPED_QUERY_FAIL log line. Nothing resolves it in code — a CHOICE,
 * not a limit (`resolveAlertsByDedupeKey` exists and B-VENUE-QUIET-ALERTING uses it, and a resolve erases nothing:
 * the row persists with its resolution stamps): a human confirming the read really came back is the recovery
 * check this alert wants. Never ack it — an ack is non-terminal and would silence this episode's key while the
 * verifier stays blind (#982).
 */
async function emitBlindAlert(since: Date): Promise<void> {
  try {
    await addAlert({
      triggers_at: new Date(),
      // `breakage`, as the sibling cron_stale page (Langston C-9). Delivery is already carried by severity `warning`
      // (`shouldDeliverToDiscord`); `breakage` is also in `ALWAYS_DELIVER_CATEGORIES`, the belt beside it — a blind
      // verifier means missed fires go unreported, so it must reach someone either way.
      category: 'breakage',
      severity: 'warning',
      dedupe_key: `cron_verifier_blind:${since.toISOString()}`,
      title: `Cron fire-evidence verifier is blind: it could not read job history for at least ${BLIND_ESCALATION_SKIPS} consecutive checks`,
      body:
        `The cron-fire-evidence verifier could not read scheduled_tasks_audit for at least ${BLIND_ESCALATION_SKIPS} ` +
        `consecutive checks since ${since.toISOString()} (one check every ${VERIFIER_INTERVAL_MS / 60000} minutes). ` +
        `Until it can, every schedule is unchecked: ` +
        `a missed fire in this window will not page. The live count is in the [CRON-FIRE-VERIFIER][SKIPPED_QUERY_FAIL] ` +
        `log line (consecutive= and total_since_boot=); the cause is in the [CRON-FIRE-VERIFIER][QUERY_FAIL] line ` +
        `before it.\n\n` +
        `Resolve this row by hand once the read is back (a [CRON-FIRE-VERIFIER][READ_RECOVERED] line, in the same ` +
        `error log as the SKIPPED lines) — it does not clear itself, by design (B-CRON-VERIFIER-QUERY-FAIL, #1211). NEVER ACK it: an ` +
        `ack is not terminal and would silence this episode's key while the verifier is still blind.`,
      metadata: {
        batch: 'B-CRON-VERIFIER-QUERY-FAIL',
        kind: 'fire_evidence_verifier_blind',
        since_iso: since.toISOString(),
        escalation_skips: BLIND_ESCALATION_SKIPS,
      },
    });
  } catch (err) {
    console.error(
      `[CRON-FIRE-VERIFIER][ALERT_WRITE_FAIL] blind: ` + (err instanceof Error ? err.message : err),
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
