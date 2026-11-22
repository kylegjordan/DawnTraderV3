/**
 * B-UNIVERSE-REFRESH-ACTS (#1018, KD-26) — daily crypto spot universe refresh, in-app.
 *
 * Replaces the root-crontab line that ran `server/scripts/b74-refresh-universe.ts` as a
 * separate process at 03:00Z (pre-audit A.9). That process rewrote a cache file the running
 * recorder never re-read, so the recorder's subscriptions stayed frozen at its boot list.
 * This job runs INSIDE the app, so the refresh acts on the running recorder connections
 * (`applyCryptoUniverseChange`, crypto-spot-archiver.ts) instead of on a file.
 *
 * Shape: `xstock-universe-cron.ts` — one node-cron task, registered with the cron registry,
 * natural and missed occurrences routed through the shared occurrence runner
 * (B-CRON-MISSED-CATCHUP). Policy key `crypto_universe_refresh_cron`, max lag 4 h
 * (pre-audit §2.8, Langston YES): a missed 03:00Z run caught up by 07:00Z is still a
 * same-day answer; later than that it is never run.
 *
 * Failure semantics: a gate refusal is a RECORDED outcome (a run row + a rung alert), never a
 * throw. Anything else that throws propagates to the occurrence runner, which records the
 * occurrence as failed; it never reaches the node-cron scheduler.
 */

import * as cron from 'node-cron';
import { cronRegistry } from './cron-registry.js';
import { logCronArm } from './cron-arm-logger.js';
import { cronOccurrenceRunner } from './cron-occurrence-runner.js';

const CRON_03_00_UTC = '0 3 * * *';
export const CRYPTO_UNIVERSE_REFRESH_JOB = 'crypto_universe_refresh_cron';
const INTERVAL_SECONDS = 86400; // daily

let _cronTask: cron.ScheduledTask | null = null;

export async function registerCryptoUniverseRefreshCron(): Promise<void> {
  if (_cronTask) {
    console.warn('[B-UNIVERSE-REFRESH-ACTS][cron] registerCryptoUniverseRefreshCron called twice — ignoring second call');
    return;
  }
  _cronTask = cron.createTask(
    CRON_03_00_UTC,
    async (context) => {
      await cronOccurrenceRunner.runNatural(CRYPTO_UNIVERSE_REFRESH_JOB, context.date);
    },
    { timezone: 'UTC' },
  );
  cronRegistry.register({
    name: CRYPTO_UNIVERSE_REFRESH_JOB,
    task: _cronTask,
    expression: CRON_03_00_UTC,
    timezone: 'UTC',
    intervalSeconds: INTERVAL_SECONDS,
    enabled: true,
    recovery: {
      policyKey: CRYPTO_UNIVERSE_REFRESH_JOB,
      run: async (ctx) => {
        const { runCryptoUniverseRefresh } = await import('./crypto-universe-refresh.js');
        const result = await runCryptoUniverseRefresh({
          occurrenceId: ctx.occurrenceId,
          triggerSource: ctx.triggerSource,
        });
        return {
          meta: {
            outcome: result.outcome,
            refusal_reason: result.refusalReason,
            count_before: result.countBefore,
            count_after: result.countAfter,
            added: result.addedCount,
            dropped: result.droppedCount,
            consecutive_refusals: result.consecutiveRefusals,
          },
        };
      },
    },
  });
  _cronTask.on('execution:missed', (context) => {
    cronOccurrenceRunner.dispatchMissed(CRYPTO_UNIVERSE_REFRESH_JOB, context.date);
  });
  await cronOccurrenceRunner.prepareJob(CRYPTO_UNIVERSE_REFRESH_JOB);
  _cronTask.start();
  console.log('[B-UNIVERSE-REFRESH-ACTS][cron] registered daily crypto universe refresh at 03:00 UTC after startup reconciliation');
  logCronArm(cronRegistry.get(CRYPTO_UNIVERSE_REFRESH_JOB)!);
}
