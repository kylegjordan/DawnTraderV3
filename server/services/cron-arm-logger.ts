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
 * B-NEW-50 (RUNNING_ISSUES #165): the authoritative `next_fire` now comes from
 * `computeNextFire()` (cron-parser), NOT node-cron's `task.getNextRun()` — the
 * latter is BROKEN for day-of-week schedules >= ~2 days out (returns a future
 * Jan-1st instead of the imminent date). We STILL emit node-cron's raw value as
 * a labelled `raw_nodecron_next=… [UNTRUSTED ncv=…]` diagnostic so a future
 * upstream fix is detectable via a trivial grep — but it NEVER drives the
 * warning tags. See cron-next-fire.ts for the full root-cause writeup.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { RegisteredCronJob } from './cron-registry.js';
import { computeNextFire } from './cron-next-fire.js';

/**
 * Installed node-cron version, surfaced in the `[UNTRUSTED ncv=…]` tag so a
 * future bump auto-self-documents the RI #165 drift-watch grep.
 * UPDATE THIS when bumping node-cron in package.json.
 */
const NODE_CRON_VERSION = '4.2.1';

/**
 * Log the canonical `[CRON-REGISTRATION]` line for a registered cron job.
 * Call IMMEDIATELY after `cronRegistry.register({...})`.
 *
 * Side effects: console.log only. Never throws.
 */
export function logCronArm(job: RegisteredCronJob): void {
  // Authoritative next-fire (cron-parser) — drives warning tags + next_fire field.
  const nextFire: Date | null = computeNextFire(job.expression, job.timezone);

  // Raw node-cron value — DIAGNOSTIC ONLY (RI #165 drift detector). Never alerts.
  let rawNextIso: string;
  try {
    const raw = job.task.getNextRun();
    rawNextIso = raw ? raw.toISOString() : 'null';
  } catch (err) {
    console.error(
      `[CRON-REGISTRATION] job=${job.name} raw getNextRun() threw: ` +
      (err instanceof Error ? err.message : err),
    );
    rawNextIso = 'threw';
  }

  let nextFireIso: string;
  let warningTag = '';
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
    `next_fire=${nextFireIso} enabled=${job.enabled} ` +
    `raw_nodecron_next=${rawNextIso} [UNTRUSTED ncv=${NODE_CRON_VERSION}]${warningTag}`,
  );
}
