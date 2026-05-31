/**
 * ═══════════════════════════════════════════════════════════════════════════
 * B-NEW-49 — cron-arm-logger (2026-05-31)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Helper for emitting the canonical `[CRON-REGISTRATION]` log line at every
 * cron registration site. Per scope §1.2 + ASSET_CLASS_ONBOARDING_WORKFLOW
 * §4.26, every node-cron `cron.schedule(...)` call MUST log the computed
 * next-fire-time at registration so operators have positive boot-time
 * evidence each schedule armed correctly.
 *
 * BUG-2026-05-31-B context: prior to B-NEW-49, schedule registration was
 * silent — schedules either armed or didn't, with no observable signal at
 * boot time. The May 29-31 silent-failure window had no log evidence to
 * distinguish "registration succeeded but firing stopped" from "registration
 * itself never armed." This logger closes that ambiguity.
 *
 * Public API verification (Langston Step-1 ACK note 2): `task.getNextRun()`
 * is a public method on node-cron 4.x ScheduledTask interface, exposed in
 * `node_modules/node-cron/dist/cjs/tasks/scheduled-task.d.ts`. Not internal.
 * Returns `Date | null` (null if the schedule will never fire — e.g.,
 * stopped or invalid expression).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { RegisteredCronJob } from './cron-registry.js';

/**
 * Log the canonical `[CRON-REGISTRATION]` line for a registered cron job.
 * Call IMMEDIATELY after `cronRegistry.register({...})`.
 *
 * Side effects: console.log only. Never throws.
 */
export function logCronArm(job: RegisteredCronJob): void {
  let nextFire: Date | null = null;
  let nextFireIso: string;
  let warningTag = '';

  try {
    nextFire = job.task.getNextRun();
  } catch (err) {
    // node-cron 4.x getNextRun() should not throw, but be defensive.
    console.error(
      `[CRON-REGISTRATION] job=${job.name} getNextRun() threw: ` +
      (err instanceof Error ? err.message : err),
    );
    nextFire = null;
  }

  if (nextFire === null) {
    nextFireIso = 'null';
    warningTag = ' [WARNING_NULL_NEXT_RUN]';
  } else if (nextFire.getTime() < Date.now()) {
    nextFireIso = nextFire.toISOString();
    warningTag = ' [WARNING_PAST_NEXT_RUN]';
  } else {
    nextFireIso = nextFire.toISOString();
  }

  console.log(
    `[CRON-REGISTRATION] job=${job.name} expr=${job.expression} ` +
    `tz=${job.timezone} interval_seconds=${job.intervalSeconds} ` +
    `next_fire=${nextFireIso} enabled=${job.enabled}${warningTag}`,
  );
}
