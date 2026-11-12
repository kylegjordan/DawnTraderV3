/**
 * P19-B5c — continuous Q-D (quote-depth) friction probe cron registration (#86).
 *
 * Mirrors `xstock-universe-cron.ts` (the established same-host node-cron shape):
 *   - cron.schedule(...) + B-NEW-49 observability: cronRegistry.register +
 *     scheduledJobsAudit.writeFireRow (every fire, success AND error) +
 *     logCronArm. A silent arming failure on an always-on telemetry probe is the
 *     worst case (looks healthy, collects nothing) — the registry + boot
 *     smoke-test + 15-min fire-evidence verifier close that gap.
 *   - cadence is module_constants-resolved (qd_probe.cadence_minutes): the cron
 *     EXPRESSION is built from it at registration, so changing cadence is a
 *     constant bump + a restart (no code change). cadence_minutes must divide 60.
 *
 * D7 fire-evidence: the meta carries {market_open, universe_size, rows_written,
 * symbols_skipped_no_snap, symbols_stale} so a weekend is DISTINGUISHABLE from a
 * probe breakage. ⚠️ A weekend does NOT zero rows_written (Langston Step-4): the
 * feed PAUSES (market_open=false) but Friday's last snaps REMAIN in the table
 * within their 30d retention, so DISTINCT ON returns them → they write with
 * stale=true → rows_written ≈ universe_size and symbols_stale ≈ universe_size.
 * The genuine rows_written=0 cases are a DUP-FIRE (all dedup-skipped in-bucket)
 * and ALL-NO-SNAP (empty snap table, e.g. fresh deploy). So a future breakage
 * alert must key off {market_open=false + symbols_stale≈universe} for "weekend"
 * and off fire-row presence/staleness (the B-NEW-49 verifier) for "broke" —
 * NEVER off rows_written>0.
 *
 * Failure semantics: a probe fire that throws does NOT crash the server; the
 * callback try/catch logs loud + still writes the (error) fire-evidence row.
 */

import * as cron from 'node-cron';
import { cronRegistry } from './cron-registry.js';
import { logCronArm } from './cron-arm-logger.js';
import { cronOccurrenceRunner } from './cron-occurrence-runner.js';
import {
  loadQdProbeConfig,
  runQdProbeOnce,
  type QdProbeFireSummary,
} from '../asset_classes/xstock_spot/qd-probe-service.js';

const JOB_NAME = 'xstock_qd_probe_cron';

let _cronTask: cron.ScheduledTask | null = null;

/**
 * Register the Q-D probe cron. Async because it resolves the cadence from
 * module_constants to build the cron grid. Idempotent (double-register guard).
 * Fail-loud if the qd_probe constants are unseeded (Kyle: DB-governed settings
 * never silently default) — the caller wraps this so a missing seed logs loud
 * without crashing boot, and the absent registry entry is visible in the
 * boot-time "registered N schedules" log.
 */
export async function registerXstockQdProbeCron(): Promise<void> {
  if (_cronTask) {
    console.warn('[P19-B5c][qd-probe][cron] registerXstockQdProbeCron called twice — ignoring second call');
    return;
  }

  const config = await loadQdProbeConfig(); // throws (fail-loud) if unseeded/invalid
  const expression = `*/${config.cadenceMinutes} * * * *`;
  const intervalSeconds = config.cadenceMinutes * 60;

  _cronTask = cron.createTask(
    expression,
    async (context) => {
      await cronOccurrenceRunner.runNatural(JOB_NAME, context.date);
    },
    // B-DB-POOL-GUARD P5-3 (Langston C-4): a fire that would start while the previous one still runs is SKIPPED by
    // node-cron (4.2.1 `noOverlap`), so the burst cap cannot be doubled by two overlapping runs.
    { timezone: 'UTC', noOverlap: true },
  );
  // B-DB-POOL-GUARD P5 (Langston take (a)): node-cron's own overlap warning names no task and a skipped fire writes no
  // audit row, so without this a halved capture rate would look like nothing happened.
  _cronTask.on('execution:overlap', () => {
    console.warn(`[P19-B5c][qd-probe][cron] fire SKIPPED at ${new Date().toISOString()} — the previous fire is still running (noOverlap); no capture this tick`);
  });
  cronRegistry.register({
    name: JOB_NAME,
    task: _cronTask,
    expression,
    timezone: 'UTC',
    intervalSeconds,
    enabled: true,
    recovery: {
      policyKey: JOB_NAME,
      run: async (context) => {
        // Q-D reads current snapshots. Use the actual start clock for market
        // state, freshness and grid bucketing; scheduledFor remains the durable
        // occurrence/audit identity. The missed policy guarantees an admitted
        // catch-up still starts before the next Q-D boundary.
        const summary: QdProbeFireSummary = await runQdProbeOnce(context.firedAt, config);
        return {
          meta: {
            market_open: summary.marketOpen,
            universe_size: summary.universeSize,
            rows_written: summary.rowsWritten,
            symbols_skipped_no_snap: summary.symbolsSkippedNoSnap,
            symbols_stale: summary.symbolsStale,
          },
        };
      },
    },
  });
  _cronTask.on('execution:missed', (context) => {
    cronOccurrenceRunner.dispatchMissed(JOB_NAME, context.date);
  });
  await cronOccurrenceRunner.prepareJob(JOB_NAME);
  _cronTask.start();
  console.log(
    `[P19-B5c][qd-probe][cron] registered after startup reconciliation `
    + `(expr=${expression}, freshness_ceiling_ms=${config.freshnessCeilingMs})`,
  );
  logCronArm(cronRegistry.get(JOB_NAME)!);
}

export function stopXstockQdProbeCron(): void {
  if (_cronTask) {
    _cronTask.stop();
    _cronTask = null;
  }
}
