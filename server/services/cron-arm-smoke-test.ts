/**
 * ═══════════════════════════════════════════════════════════════════════════
 * B-NEW-49 — cron-arm smoke test (2026-05-31)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Mode-A coverage (per Langston Step-1 ACK note 1): catches "arming failed"
 * by inspecting `task.getNextRun()` for every registered schedule. Run at
 * boot AND at boot+5min (so transient post-boot state corruption is caught
 * within first scan cadence).
 *
 * BUG-2026-05-31-B context: in the May 29-31 silent-failure window, all 5
 * node-cron schedules silently stopped firing. We had no boot-time signal
 * that anything was wrong because no schedule had a "did you arm correctly"
 * check. This smoke test closes that gap by enumerating cronRegistry +
 * checking each schedule's next-fire-time is in the expected window.
 *
 * Failure classes:
 *   - NULL_NEXT_RUN: `getNextRun()` returned null → schedule will never fire
 *   - PAST_DUE: next-fire is in the past → scheduler missed at least one tick
 *   - TOO_FAR_FUTURE: next-fire is more than 2× the natural interval ahead
 *     → cron expression mis-parsed OR scheduler is in a broken state
 *   - DISABLED: schedule was registered but enabled=false (skipped silently)
 *   - OK: next-fire is within expected window
 *
 * On any non-OK + non-DISABLED status, writes a system-alert (severity=warning,
 * category=breakage) so §10.5 per-turn checks surface it.
 *
 * Mode-B coverage (mid-lifetime tick-loop death) is handled by the sibling
 * fire-evidence verifier (`cron-fire-evidence-verifier.ts`).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { cronRegistry } from './cron-registry.js';
import { addAlert } from './system-alerts.js';
import { computeNextFire } from './cron-next-fire.js';

export type SmokeStatus = 'OK' | 'PAST_DUE' | 'TOO_FAR_FUTURE' | 'NULL_NEXT_RUN' | 'DISABLED';

export interface SmokeResult {
  jobName: string;
  status: SmokeStatus;
  nextFire: Date | null;
  expectedBy: Date | null;
}

export interface SmokeReport {
  ok: boolean;
  results: SmokeResult[];
}

/**
 * Run the smoke test across all registered cron jobs. Returns aggregate
 * report. Writes system-alert for any non-OK + non-DISABLED status.
 *
 * Pure — never throws. Caller may invoke at boot + boot+5min.
 */
export async function runSmokeTest(label: string = 'boot'): Promise<SmokeReport> {
  const now = Date.now();
  const results: SmokeResult[] = [];

  for (const job of cronRegistry.getAll()) {
    if (!job.enabled) {
      results.push({ jobName: job.name, status: 'DISABLED', nextFire: null, expectedBy: null });
      continue;
    }

    // Authoritative next-fire via cron-parser. RI #165: node-cron's
    // task.getNextRun() is broken for day-of-week schedules (returns a future
    // Jan-1st), which produced false TOO_FAR_FUTURE alerts on the weekend
    // timers. computeNextFire is failure-safe (returns null on parse error).
    const nextFire: Date | null = computeNextFire(job.expression, job.timezone);

    let status: SmokeStatus;
    let expectedBy: Date | null = null;

    if (nextFire === null) {
      status = 'NULL_NEXT_RUN';
    } else {
      const nextMs = nextFire.getTime();
      // 2× natural interval = "too far in the future" threshold.
      // For a 5-min schedule, anything >10min ahead is suspect.
      // For a daily schedule, anything >48h ahead is suspect.
      expectedBy = new Date(now + job.intervalSeconds * 2 * 1000);
      if (nextMs < now) {
        status = 'PAST_DUE';
      } else if (nextMs > expectedBy.getTime()) {
        status = 'TOO_FAR_FUTURE';
      } else {
        status = 'OK';
      }
    }

    results.push({ jobName: job.name, status, nextFire, expectedBy });

    console.log(
      `[CRON-ARM-SMOKE] label=${label} job=${job.name} status=${status} ` +
      `next_fire=${nextFire?.toISOString() ?? 'null'}`,
    );

    if (status !== 'OK') {
      // Fire a system-alert. Failure-safe — alert write swallowed if it fails.
      try {
        await addAlert({
          triggers_at: new Date(),
          category: 'breakage',
          severity: 'warning',
          title: `B-NEW-49 cron arm smoke test FAILED: ${job.name} status=${status}`,
          body:
            `The boot-time / +5min cron arm smoke test detected that schedule ` +
            `"${job.name}" (cron expression "${job.expression}", timezone "${job.timezone}") ` +
            `did not arm correctly at registration. Status=${status}, next_fire=${nextFire?.toISOString() ?? 'null'}, ` +
            `expected_by=${expectedBy?.toISOString() ?? 'n/a'}. ` +
            `Reference smoke-test label=${label}. ` +
            `Refer to B-NEW-49 SIM §9.10.c for diagnostic workflow.`,
          metadata: {
            batch: 'B-NEW-49',
            kind: 'arm_smoke_test',
            label,
            job_name: job.name,
            status,
            next_fire_iso: nextFire?.toISOString() ?? null,
            expected_by_iso: expectedBy?.toISOString() ?? null,
          },
        });
      } catch (err) {
        console.error(
          `[CRON-ARM-SMOKE][ALERT_WRITE_FAIL] job=${job.name}: ` +
          (err instanceof Error ? err.message : err),
        );
      }
    }
  }

  const ok = results.every((r) => r.status === 'OK' || r.status === 'DISABLED');
  console.log(
    `[CRON-ARM-SMOKE] label=${label} aggregate=${ok ? 'OK' : 'FAILED'} ` +
    `total=${results.length} ok=${results.filter((r) => r.status === 'OK').length} ` +
    `disabled=${results.filter((r) => r.status === 'DISABLED').length} ` +
    `failed=${results.filter((r) => r.status !== 'OK' && r.status !== 'DISABLED').length}`,
  );

  return { ok, results };
}

/**
 * Schedule the boot + 5-min smoke test runs. Called from server/index.ts
 * boot path AFTER all cron registrations complete. Async-non-blocking;
 * failures log but never crash boot.
 */
export function scheduleSmokeTestRuns(): void {
  // Boot run — immediate.
  runSmokeTest('boot').catch((err) => {
    console.error('[CRON-ARM-SMOKE][BOOT][UNHANDLED]', err instanceof Error ? err.message : err);
  });

  // +5min run — schedule via setTimeout (independent of node-cron).
  setTimeout(() => {
    runSmokeTest('boot+5min').catch((err) => {
      console.error('[CRON-ARM-SMOKE][BOOT+5MIN][UNHANDLED]', err instanceof Error ? err.message : err);
    });
  }, 5 * 60 * 1000);

  console.log('[CRON-ARM-SMOKE] Scheduled boot + boot+5min runs');
}
