/**
 * ═══════════════════════════════════════════════════════════════════════════
 * B-NEW-49 — scheduled-jobs-audit writer (2026-05-31)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Shared writer for the `scheduled_tasks_audit` table. Every node-cron
 * callback in the system MUST call `writeFireRow()` on every fire (success
 * path AND error path) so silent failures become detectable via SQL query:
 *
 *   SELECT task_name, MAX(fired_at), NOW() - MAX(fired_at) AS staleness
 *   FROM scheduled_tasks_audit
 *   WHERE task_name LIKE '%_cron' OR task_name IN ('weekend_shutdown', 'weekend_restart')
 *   GROUP BY task_name
 *   HAVING NOW() - MAX(fired_at) > INTERVAL 'X minutes';
 *
 * BUG-2026-05-31-B context: 4 of 5 node-cron schedules had NO fire-evidence
 * mechanism before this batch, so silent failures (May 29-31 31h window)
 * were only detectable via manual log archaeology. This writer + the
 * fire-evidence verifier (`cron-fire-evidence-verifier.ts`) close that gap.
 *
 * Failure handling: audit-write failure is observability, not correctness.
 * Log loud + continue. The actual cron callback's work has already happened;
 * losing an audit row is a regression in observability but does NOT break
 * the cron's downstream effects.
 *
 * Pre-audit (Step 2 §2.3): REUSES the existing `scheduled_tasks_audit` table
 * (same shape as B-NEW-36 writes from `session-lifecycle-controller.ts`).
 * No new migration needed.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { sql } from 'drizzle-orm';
import { db } from '../db.js';

export interface ScheduledJobAuditMeta {
  /** Distinguishes cron-path / poll-path / boot-path fires.
   * Match B-NEW-36 poll-reconcile convention. */
  trigger_source?: 'cron' | 'poll' | 'boot';
  /** Fire duration in milliseconds (callback start → callback resolve). */
  duration_ms?: number;
  /** Free-form per-job context. */
  [k: string]: any;
}

export interface WriteFireRowOptions {
  /** Schedule identifier (must match cronRegistry name + audit query patterns). */
  jobName: string;
  /** When the schedule was supposed to fire (cron-boundary timestamp). For
   * boot-path / poll-path, use the actual NOW(). */
  scheduledFor: Date;
  /** When the callback actually started (NOW() at callback entry). */
  firedAt: Date;
  /** Fire outcome. */
  status: 'success' | 'error';
  /** If status='error', the exception message. */
  errorMessage?: string;
  /** Per-job context. */
  meta?: ScheduledJobAuditMeta;
}

/**
 * Write a single fire-evidence row to `scheduled_tasks_audit`. NEVER throws —
 * audit-write failure is observability, not correctness.
 */
export async function writeFireRow(opts: WriteFireRowOptions): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO scheduled_tasks_audit
        (task_name, scheduled_for, fired_at, status, error_message, meta)
      VALUES
        (${opts.jobName},
         ${opts.scheduledFor.toISOString()}::timestamptz,
         ${opts.firedAt.toISOString()}::timestamptz,
         ${opts.status},
         ${opts.errorMessage ?? null},
         ${JSON.stringify(opts.meta ?? {})}::jsonb)
    `);
  } catch (err) {
    console.error(
      `[SCHEDULED-JOBS-AUDIT][WRITE_FAIL] job=${opts.jobName} status=${opts.status}: ` +
      (err instanceof Error ? err.message : err),
    );
    // Swallow — do not propagate to the cron callback.
  }
}

export const scheduledJobsAudit = { writeFireRow };
