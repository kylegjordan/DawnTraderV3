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
 * symbols_skipped_no_snap, symbols_stale} so a weekend feed-pause (market_open
 * false, full skip, rows_written=0) is DISTINGUISHABLE from a probe breakage.
 * ⚠️ A healthy weekend fire has rows_written=0 — downstream MUST NOT alert on
 * rows_written>0 (the B-NEW-49 verifier checks fire-row presence, not counts).
 *
 * Failure semantics: a probe fire that throws does NOT crash the server; the
 * callback try/catch logs loud + still writes the (error) fire-evidence row.
 */

import * as cron from 'node-cron';
import { cronRegistry } from './cron-registry.js';
import { logCronArm } from './cron-arm-logger.js';
import { scheduledJobsAudit } from './scheduled-jobs-audit.js';
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

  _cronTask = cron.schedule(
    expression,
    async () => {
      const firedAt = new Date();
      const startMs = firedAt.getTime();
      let status: 'success' | 'error' = 'success';
      let errorMessage: string | undefined;
      let summary: QdProbeFireSummary | null = null;
      try {
        summary = await runQdProbeOnce(firedAt, config);
      } catch (err) {
        status = 'error';
        errorMessage = err instanceof Error ? err.message : String(err);
        console.error(
          '[P19-B5c][qd-probe][cron] fire threw:',
          err instanceof Error ? `${err.message}\n${err.stack}` : String(err),
        );
      } finally {
        await scheduledJobsAudit.writeFireRow({
          jobName: JOB_NAME,
          scheduledFor: firedAt,
          firedAt,
          status,
          errorMessage,
          meta: {
            trigger_source: 'cron',
            duration_ms: Date.now() - startMs,
            // D7 observability: weekend-vs-breakage + coverage (null on error fire).
            market_open: summary ? summary.marketOpen : null,
            universe_size: summary ? summary.universeSize : null,
            rows_written: summary ? summary.rowsWritten : null,
            symbols_skipped_no_snap: summary ? summary.symbolsSkippedNoSnap : null,
            symbols_stale: summary ? summary.symbolsStale : null,
          },
        });
      }
    },
    { timezone: 'UTC' },
  );
  console.log(
    `[P19-B5c][qd-probe][cron] registered (expr=${expression}, freshness_ceiling_ms=${config.freshnessCeilingMs})`,
  );

  cronRegistry.register({
    name: JOB_NAME,
    task: _cronTask,
    expression,
    timezone: 'UTC',
    intervalSeconds,
    enabled: true,
  });
  logCronArm(cronRegistry.get(JOB_NAME)!);
}

export function stopXstockQdProbeCron(): void {
  if (_cronTask) {
    _cronTask.stop();
    _cronTask = null;
  }
}
