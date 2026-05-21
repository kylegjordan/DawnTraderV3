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

const CRON_06_00_UTC = '0 6 * * *';

let _cronTask: cron.ScheduledTask | null = null;

export function registerXstockUniverseCron(): void {
  if (_cronTask) {
    console.warn('[B79.0n.UNIVERSE-DISCOVERY][cron] registerXstockUniverseCron called twice — ignoring second call');
    return;
  }
  _cronTask = cron.schedule(
    CRON_06_00_UTC,
    async () => {
      try {
        await runDiscovery('cron_daily');
      } catch (err) {
        console.error(
          '[B79.0n.UNIVERSE-DISCOVERY][cron] daily refresh threw unexpectedly (audit row not written):',
          err instanceof Error ? `${err.message}\n${err.stack}` : String(err),
        );
      }
    },
    { timezone: 'UTC' },
  );
  console.log('[B79.0n.UNIVERSE-DISCOVERY][cron] registered daily refresh at 06:00 UTC');
}

export function stopXstockUniverseCron(): void {
  if (_cronTask) {
    _cronTask.stop();
    _cronTask = null;
  }
}
