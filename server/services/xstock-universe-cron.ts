/**
 * B79.0n.UNIVERSE-DISCOVERY — daily cron registration.
 *
 * Per Langston Q-PA-6 ACK 2026-05-21:
 *   - Schedule: 06:00 UTC daily (3.5 hours before ARCA open at 13:30 UTC).
 *   - Same node-cron host as B-NEW-36 session-lifecycle controller (single-
 *     cron-host shape is established + working).
 *   - Grep-able log line markers (Q8): [CRON][B79.0n.UNIVERSE-DISCOVERY]
 *     daily refresh started + completed pair as silent-failure detector.
 *
 * Failure semantics: discovery failure does NOT crash the server. The
 * `runDiscovery()` orchestrator already writes a `discovery_runs` audit row
 * + falls back gracefully. The cron callback wraps in try/catch so any
 * unexpected throw is logged but doesn't propagate to the cron scheduler.
 */

import * as cron from 'node-cron';
import { runDiscovery } from './xstock-universe-discoverer.js';
import { cronRegistry } from './cron-registry.js';
import { logCronArm } from './cron-arm-logger.js';
import { cronOccurrenceRunner } from './cron-occurrence-runner.js';

const CRON_06_00_UTC = '0 6 * * *';
const JOB_NAME = 'xstock_universe_discovery_cron';
const INTERVAL_SECONDS = 86400;  // daily

let _cronTask: cron.ScheduledTask | null = null;

export function registerXstockUniverseCron(): void {
  if (_cronTask) {
    console.warn('[B79.0n.UNIVERSE-DISCOVERY][cron] registerXstockUniverseCron called twice — ignoring second call');
    return;
  }
  _cronTask = cron.schedule(
    CRON_06_00_UTC,
    async (context) => {
      await cronOccurrenceRunner.runNatural(JOB_NAME, context.date);
    },
    { timezone: 'UTC' },
  );
  console.log('[B79.0n.UNIVERSE-DISCOVERY][cron] registered daily refresh at 06:00 UTC');

  // B-NEW-49: register with cron-registry + emit arm-logger evidence.
  cronRegistry.register({
    name: JOB_NAME,
    task: _cronTask,
    expression: CRON_06_00_UTC,
    timezone: 'UTC',
    intervalSeconds: INTERVAL_SECONDS,
    enabled: true,
    recovery: {
      policyKey: JOB_NAME,
      run: async () => {
        await runDiscovery('cron_daily');
      },
    },
  });
  _cronTask.on('execution:missed', (context) => {
    cronOccurrenceRunner.dispatchMissed(JOB_NAME, context.date);
  });
  logCronArm(cronRegistry.get(JOB_NAME)!);
  cronOccurrenceRunner.dispatchReconciliation(JOB_NAME);
}

export function stopXstockUniverseCron(): void {
  if (_cronTask) {
    _cronTask.stop();
    _cronTask = null;
  }
}
