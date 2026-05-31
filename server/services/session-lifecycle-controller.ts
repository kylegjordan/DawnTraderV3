/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B-NEW-36 sub-batch (b) — Off-hours session-lifecycle controller
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Schedules two timers around the unified xStock weekend close window
 * (empirically verified Fri 8PM ET → Sun 8PM ET; B-NEW-36 sub-batch (c)
 * §0.5 Findings):
 *
 *   - Fri 20:00 ET → `weekend_shutdown`:
 *       1. Run pre-warm so the snapshot table captures closing-week bars.
 *       2. Bulk-mark all open xstock_spot trades as `weekend_suspended`
 *          (DB + in-memory Map mirror).
 *       3. Pause the xstockSpotScanner so it no-ops every centralClock tick
 *          for the 48-hour weekend window (vs the previous
 *          universe-0-cycle-every-30s pattern).
 *       4. Write an audit row to scheduled_tasks_audit.
 *
 *   - Sun 20:00 ET → `weekend_restart`:
 *       1. Run pre-warm again (refresh-on-restart per Langston Q3 B-NEW-34b).
 *       2. Resume the xstockSpotScanner.
 *       3. Bulk-restore all weekend_suspended xstock_spot trades to `open`.
 *       4. Audit row.
 *
 * Boot-time affirmative state reconciliation (per Langston Q7 + Q7.1):
 *   On every server start, init() computes whether NOW is inside the
 *   weekend close window and reconciles BOTH scanner state AND trade state
 *   to match. Closes:
 *     - Mode A: PM2 restart mid-weekend → scanner would otherwise resume
 *       cycles against a closed market.
 *     - Mode B: long restart gap straddling Sun-restart → trades would
 *       stay weekend_suspended past the boundary, falling out of the sim
 *       cycle until the next Sun fire (could be days).
 *
 * Pre-warm circuit-breaker (per Langston Q6):
 *   Pre-warm failure does NOT crash the server AND does NOT block the rest
 *   of the hook. Failure → audit row status='error' with error_message;
 *   STILL ATTEMPT scanner pause/resume + trade state updates.
 *
 * Reference: Claude Comms and Packages/Scope Files/B_NEW_36_SCOPE.md §2;
 *            Claude Comms and Packages/Scope Files/B_NEW_36_PRE_AUDIT.md §3.10 + §4
 * ═════════════════════════════════════════════════════════════════════════════
 */

import * as cron from 'node-cron';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { isXstockMarketOpenUTC } from '../asset_classes/xstock_spot/market-hours.js';
import { addAlert } from './system-alerts.js';
import { cronRegistry } from './cron-registry.js';
import { logCronArm } from './cron-arm-logger.js';
import { scheduledJobsAudit } from './scheduled-jobs-audit.js';

// Sample symbol used purely to satisfy the predicate's backward-compatible
// signature. Post-B-NEW-36 sub-batch (c) the predicate is symbol-independent,
// so this value is irrelevant — any registered xStock would return the same
// answer.
const SAMPLE_SYMBOL_FOR_HOURS_CHECK = 'AAPL/USD';

// B-NEW-36 poll-reconcile (2026-05-31): trigger-source label written into
// scheduled_tasks_audit.meta and used to distinguish cron-path vs poll-path
// vs boot-path in dashboards / queries.
export type TriggerSource = 'cron' | 'poll' | 'boot';

// Cron expressions (interpreted in America/New_York timezone — node-cron 4.x
// uses Intl, same DST-awareness as our market-hours predicate).
// Format: `minute hour day-of-month month day-of-week`.
const CRON_FRI_8PM_ET = '0 20 * * 5';   // 20:00 every Friday
const CRON_SUN_8PM_ET = '0 20 * * 0';   // 20:00 every Sunday
const TIMEZONE_ET = 'America/New_York';

type AuditStatus = 'pending' | 'success' | 'error';
type TaskName = 'weekend_shutdown' | 'weekend_restart' | 'boot_state_reconciliation';

interface AuditMeta {
  insideWeekendWindow?: boolean;
  scannerAction?: 'paused' | 'resumed' | 'none';
  tradesAffected?: number;
  prewarmStatus?: 'success' | 'error' | 'skipped';
  prewarmError?: string;
  prewarmSymbolErrors?: number;
  prewarmTotalUpserts?: number;
  notes?: string;
  // B-NEW-36 poll-reconcile (2026-05-31): trigger_source distinguishes
  // node-cron-invoked vs poll-tick-invoked vs boot-init-invoked fires in audit
  // queries. 'cron' = normal scheduled fire at exactly the boundary timestamp.
  // 'poll' = the cron silently failed and the 30s reconcile tick caught up.
  // 'boot' = process restart inside the window; init() reconciled state.
  trigger_source?: TriggerSource;
}

async function writeAuditRow(
  taskName: TaskName,
  scheduledFor: Date,
  firedAt: Date,
  status: AuditStatus,
  meta: AuditMeta,
  errorMessage?: string,
): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO scheduled_tasks_audit
        (task_name, scheduled_for, fired_at, status, error_message, meta)
      VALUES
        (${taskName}, ${scheduledFor.toISOString()}::timestamptz,
         ${firedAt.toISOString()}::timestamptz, ${status},
         ${errorMessage ?? null}, ${JSON.stringify(meta)}::jsonb)
    `);
  } catch (err) {
    // Audit-row failure is observability, not correctness. Log loud and
    // continue — the actual lifecycle work is what matters.
    console.error(
      `[B-NEW-36][AUDIT_WRITE_FAIL] task=${taskName} status=${status}: ` +
      (err instanceof Error ? err.message : err),
    );
  }
}

/**
 * Wrap the in-process pre-warm call so its failures don't propagate.
 * Returns a structured outcome the caller writes into the audit meta.
 */
async function runPrewarmWithCircuitBreaker(opts: { lookbackDays: number; tag: string }): Promise<{
  status: 'success' | 'error';
  symbolErrors: number;
  totalUpserts: number;
  errorMessage?: string;
}> {
  try {
    const { runPrewarm } = await import('../../scripts/b-new-34b-prewarm-snapshot.js');
    const result = await runPrewarm({ lookbackDays: opts.lookbackDays });
    console.log(
      `[B-NEW-36][PREWARM_${opts.tag}] OK upserts=${result.totalUpserts} ` +
      `errors=${result.symbolErrors}`,
    );
    return {
      status: 'success',
      symbolErrors: result.symbolErrors,
      totalUpserts: result.totalUpserts,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[B-NEW-36][PREWARM_${opts.tag}] FAIL — continuing hook: ${msg}`);
    return { status: 'error', symbolErrors: 0, totalUpserts: 0, errorMessage: msg };
  }
}

class SessionLifecycleController {
  private friShutdownTask: cron.ScheduledTask | null = null;
  private sunRestartTask: cron.ScheduledTask | null = null;
  private initialized = false;
  // B-NEW-36 poll-reconcile (2026-05-31): mutex preventing concurrent
  // cron + poll execution at the same window boundary (cron fires at HH:00:00,
  // poll arrives ~HH:00:30 — second arrival no-ops via this flag). MUST be
  // cleared in a finally block — leaking inFlight permanently disables the
  // safety net.
  private inFlight = false;

  // Exposed for tests only — read-only probe of mutex state.
  _getInFlightForTest(): boolean { return this.inFlight; }
  // Exposed for tests only — clears mutex if a test left it set.
  _resetInFlightForTest(): void { this.inFlight = false; }

  /**
   * Boot-time entry point. Called from server/index.ts AFTER
   * rehydrateOpenVtsTrades() (so the in-memory Map is populated) and AFTER
   * xstockSpotScanner.start() (so the scanner is subscribed and ready to
   * pause if needed).
   *
   * Behaviour:
   *   1. Compute inside-weekend-window? at boot.
   *   2. Reconcile vts_open_trades.state for xstock_spot trades to match
   *      the computed window state (closes Q7.1 silent-stuck trade mode).
   *   3. Pause the scanner if inside-window (closes Q7 crash-mid-weekend mode).
   *   4. Write a boot_state_reconciliation audit row.
   *   5. Register the two scheduled timers.
   *
   * Idempotent: a second init() call returns immediately.
   */
  async init(): Promise<void> {
    if (this.initialized) {
      console.log('[B-NEW-36][LIFECYCLE_INIT] already initialized; skipping');
      return;
    }

    const bootAt = new Date();
    const insideWindow = !isXstockMarketOpenUTC(SAMPLE_SYMBOL_FOR_HOURS_CHECK, bootAt);
    const meta: AuditMeta = { insideWeekendWindow: insideWindow };

    console.log(
      `[B-NEW-36][LIFECYCLE_INIT] boot reconciliation — ` +
      `insideWeekendWindow=${insideWindow} (Fri 8PM ET → Sun 8PM ET window)`,
    );

    try {
      // ── Step 1: Reconcile in-memory + DB trade state to match window. ──
      const { getOpenVirtualTradesMap } = await import('./vts-runner.js');
      const tradesMap = getOpenVirtualTradesMap();
      const {
        markAllXstockWeekendSuspended,
        unmarkAllXstockWeekendSuspended,
      } = await import('./vts-trade-persistence.js');

      let tradesAffected = 0;
      if (insideWindow) {
        const r = await markAllXstockWeekendSuspended(tradesMap);
        tradesAffected = r.updated;
      } else {
        const r = await unmarkAllXstockWeekendSuspended(tradesMap);
        tradesAffected = r.updated;
      }
      meta.tradesAffected = tradesAffected;

      // ── Step 2: Reconcile scanner state. ──
      const { xstockSpotScanner } = await import('../asset_classes/xstock_spot/scanner.js');
      if (insideWindow) {
        xstockSpotScanner.pause();
        meta.scannerAction = 'paused';
      } else {
        // If the scanner happens to be paused from a prior pause that
        // wasn't restored, resume it now to match the outside-window state.
        if (xstockSpotScanner.getIsPaused()) {
          xstockSpotScanner.resume();
          meta.scannerAction = 'resumed';
        } else {
          meta.scannerAction = 'none';
        }
      }

      console.log(
        `[B-NEW-36][LIFECYCLE_INIT_OK] insideWindow=${insideWindow} ` +
        `trades_reconciled=${tradesAffected} scanner=${meta.scannerAction}`,
      );

      await writeAuditRow('boot_state_reconciliation', bootAt, bootAt, 'success', meta);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[B-NEW-36][LIFECYCLE_INIT_FAIL] ${msg}`);
      meta.notes = 'boot reconciliation failed — see error_message';
      await writeAuditRow('boot_state_reconciliation', bootAt, bootAt, 'error', meta, msg);
      // Don't rethrow — boot reconciliation is best-effort. The scheduled
      // timers below still need to register so subsequent fires recover.
    }

    // ── Step 3: Register the two scheduled timers. ──
    this.registerTimers();
    this.initialized = true;
    console.log(
      `[B-NEW-36][LIFECYCLE_INIT_DONE] timers registered — ` +
      `fri=${CRON_FRI_8PM_ET} sun=${CRON_SUN_8PM_ET} tz=${TIMEZONE_ET}`,
    );
  }

  private registerTimers(): void {
    this.friShutdownTask = cron.schedule(
      CRON_FRI_8PM_ET,
      async (ctx) => {
        await this.runWeekendShutdown(ctx.triggeredAt);
      },
      { timezone: TIMEZONE_ET, name: 'b-new-36-weekend-shutdown', noOverlap: true },
    );

    this.sunRestartTask = cron.schedule(
      CRON_SUN_8PM_ET,
      async (ctx) => {
        await this.runWeekendRestart(ctx.triggeredAt);
      },
      { timezone: TIMEZONE_ET, name: 'b-new-36-weekend-restart', noOverlap: true },
    );

    // B-NEW-49 (2026-05-31): register with cron-registry + log arming
    // evidence so the smoke-test + fire-evidence verifier can monitor.
    // Weekly cadence (1 fire per week) = 604800 seconds.
    cronRegistry.register({
      name: 'weekend_shutdown',
      task: this.friShutdownTask,
      expression: CRON_FRI_8PM_ET,
      timezone: TIMEZONE_ET,
      intervalSeconds: 604800,
      enabled: true,
    });
    logCronArm(cronRegistry.get('weekend_shutdown')!);

    cronRegistry.register({
      name: 'weekend_restart',
      task: this.sunRestartTask,
      expression: CRON_SUN_8PM_ET,
      timezone: TIMEZONE_ET,
      intervalSeconds: 604800,
      enabled: true,
    });
    logCronArm(cronRegistry.get('weekend_restart')!);
  }

  /**
   * Fri 8 PM ET cron fire path. Wraps the shared shutdown core with mutex
   * (cron-vs-poll race protection per B-NEW-36 poll-reconcile 2026-05-31)
   * and runs prewarm. Pre-warm failure does NOT block the rest of the hook.
   */
  private async runWeekendShutdown(scheduledFor: Date): Promise<void> {
    if (this.inFlight) {
      console.log('[B-NEW-36][WEEKEND_SHUTDOWN_SKIP] inFlight=true (poll or prior cron holding mutex)');
      return;
    }
    this.inFlight = true;
    try {
      await this.runWeekendShutdownCore({
        scheduledFor,
        triggerSource: 'cron',
        runPrewarm: true,
      });
    } finally {
      this.inFlight = false;
    }
  }

  /**
   * Sun 8 PM ET cron fire path. Mutex + prewarm + shared restart core.
   */
  private async runWeekendRestart(scheduledFor: Date): Promise<void> {
    if (this.inFlight) {
      console.log('[B-NEW-36][WEEKEND_RESTART_SKIP] inFlight=true');
      return;
    }
    this.inFlight = true;
    try {
      await this.runWeekendRestartCore({
        scheduledFor,
        triggerSource: 'cron',
        runPrewarm: true,
      });
    } finally {
      this.inFlight = false;
    }
  }

  /**
   * B-NEW-36 poll-reconcile (2026-05-31): poll-triggered shutdown entry,
   * called by xstockSpotScanner.clockTickHandler when the periodic reconcile
   * check detects window state drift (insideWindow=true but scanner is not
   * paused — usually because the Fri 8PM ET cron silently failed).
   *
   * Differences from cron path:
   *   - Pre-warm SKIPPED (catch-up semantics; we're already late).
   *   - Audit-row meta.trigger_source='poll' for query-side distinction.
   *   - Writes a system-alert (severity=warning, category=breakage) so we
   *     notice the cron regression rather than silently relying on poll
   *     forever (Langston Q6 + structural revision #3).
   *
   * Mutex semantics: if cron holds inFlight, poll skips (cron will handle
   * normally). If poll holds inFlight, a near-simultaneous cron also skips.
   * Re-checks scanner state after acquiring mutex to handle the race where
   * cron just finished between detection and entry.
   */
  async runShutdownFromPoll(now: Date): Promise<void> {
    // ATOMIC mutex acquire — check+set in a single synchronous step (no awaits
    // in between, so two concurrent invocations cannot both pass the gate).
    if (this.inFlight) {
      console.log('[B-NEW-36][POLL_SHUTDOWN_SKIP] inFlight=true (cron or prior poll holding mutex)');
      return;
    }
    this.inFlight = true;
    try {
      // Post-mutex state recheck — cron may have fired between drift-detection
      // and entry. If scanner is already paused, the cron handled it; we no-op
      // WITHOUT writing audit/alert (no spurious duplicate).
      const { xstockSpotScanner } = await import('../asset_classes/xstock_spot/scanner.js');
      if (xstockSpotScanner.getIsPaused()) {
        console.log('[B-NEW-36][POLL_SHUTDOWN_NOOP] scanner already paused (cron likely fired between detection and entry)');
        return;
      }
      console.warn('[B-NEW-36][POLL_SHUTDOWN_FIRE] poll-path catching up missed cron');
      console.log('[B-NEW-36][POLL_SKIP_PREWARM] reason=catchup');
      await this.runWeekendShutdownCore({
        scheduledFor: now,
        triggerSource: 'poll',
        runPrewarm: false,
      });
      await this.writeMissedCronAlert('shutdown', now);
    } finally {
      this.inFlight = false;
    }
  }

  /**
   * B-NEW-36 poll-reconcile (2026-05-31): poll-triggered restart entry,
   * mirror of runShutdownFromPoll for the Sun 8PM ET boundary.
   */
  async runRestartFromPoll(now: Date): Promise<void> {
    if (this.inFlight) {
      console.log('[B-NEW-36][POLL_RESTART_SKIP] inFlight=true (cron or prior poll holding mutex)');
      return;
    }
    this.inFlight = true;
    try {
      const { xstockSpotScanner } = await import('../asset_classes/xstock_spot/scanner.js');
      if (!xstockSpotScanner.getIsPaused()) {
        console.log('[B-NEW-36][POLL_RESTART_NOOP] scanner already running (cron likely fired between detection and entry)');
        return;
      }
      console.warn('[B-NEW-36][POLL_RESTART_FIRE] poll-path catching up missed cron');
      console.log('[B-NEW-36][POLL_SKIP_PREWARM] reason=catchup');
      await this.runWeekendRestartCore({
        scheduledFor: now,
        triggerSource: 'poll',
        runPrewarm: false,
      });
      await this.writeMissedCronAlert('restart', now);
    } finally {
      this.inFlight = false;
    }
  }

  /**
   * Shared shutdown core. Used by both cron-path and poll-path entries.
   * Prewarm is OPTIONAL (cron runs it, poll skips it for catch-up semantics).
   * trigger_source is recorded in audit-row meta for query distinction.
   */
  private async runWeekendShutdownCore(opts: {
    scheduledFor: Date;
    triggerSource: TriggerSource;
    runPrewarm: boolean;
  }): Promise<void> {
    const firedAt = new Date();
    const meta: AuditMeta = { insideWeekendWindow: true, trigger_source: opts.triggerSource };
    let overallStatus: AuditStatus = 'success';
    let errorMessage: string | undefined;

    console.log(`[B-NEW-36][WEEKEND_SHUTDOWN_START] firedAt=${firedAt.toISOString()} trigger=${opts.triggerSource}`);

    if (opts.runPrewarm) {
      const prewarm = await runPrewarmWithCircuitBreaker({ lookbackDays: 14, tag: 'SHUTDOWN' });
      meta.prewarmStatus = prewarm.status;
      meta.prewarmSymbolErrors = prewarm.symbolErrors;
      meta.prewarmTotalUpserts = prewarm.totalUpserts;
      if (prewarm.errorMessage) meta.prewarmError = prewarm.errorMessage;
      if (prewarm.status === 'error') {
        overallStatus = 'error';
        errorMessage = `prewarm failed: ${prewarm.errorMessage}`;
      }
    } else {
      meta.prewarmStatus = 'skipped';
    }

    try {
      const { getOpenVirtualTradesMap } = await import('./vts-runner.js');
      const { markAllXstockWeekendSuspended } = await import('./vts-trade-persistence.js');
      const suspended = await markAllXstockWeekendSuspended(getOpenVirtualTradesMap());
      meta.tradesAffected = suspended.updated;

      const { xstockSpotScanner } = await import('../asset_classes/xstock_spot/scanner.js');
      xstockSpotScanner.pause();
      meta.scannerAction = 'paused';

      console.log(
        `[B-NEW-36][WEEKEND_SHUTDOWN_DONE] suspended=${suspended.updated} ` +
        `prewarm=${meta.prewarmStatus} scanner=paused trigger=${opts.triggerSource}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[B-NEW-36][WEEKEND_SHUTDOWN_FAIL] ${msg}`);
      overallStatus = 'error';
      errorMessage = errorMessage ? `${errorMessage}; lifecycle: ${msg}` : `lifecycle: ${msg}`;
    }

    await writeAuditRow('weekend_shutdown', opts.scheduledFor, firedAt, overallStatus, meta, errorMessage);
  }

  /**
   * Shared restart core. Mirror of runWeekendShutdownCore.
   */
  private async runWeekendRestartCore(opts: {
    scheduledFor: Date;
    triggerSource: TriggerSource;
    runPrewarm: boolean;
  }): Promise<void> {
    const firedAt = new Date();
    const meta: AuditMeta = { insideWeekendWindow: false, trigger_source: opts.triggerSource };
    let overallStatus: AuditStatus = 'success';
    let errorMessage: string | undefined;

    console.log(`[B-NEW-36][WEEKEND_RESTART_START] firedAt=${firedAt.toISOString()} trigger=${opts.triggerSource}`);

    if (opts.runPrewarm) {
      const prewarm = await runPrewarmWithCircuitBreaker({ lookbackDays: 14, tag: 'RESTART' });
      meta.prewarmStatus = prewarm.status;
      meta.prewarmSymbolErrors = prewarm.symbolErrors;
      meta.prewarmTotalUpserts = prewarm.totalUpserts;
      if (prewarm.errorMessage) meta.prewarmError = prewarm.errorMessage;
      if (prewarm.status === 'error') {
        overallStatus = 'error';
        errorMessage = `prewarm failed: ${prewarm.errorMessage}`;
      }
    } else {
      meta.prewarmStatus = 'skipped';
    }

    try {
      const { xstockSpotScanner } = await import('../asset_classes/xstock_spot/scanner.js');
      xstockSpotScanner.resume();
      meta.scannerAction = 'resumed';

      const { getOpenVirtualTradesMap } = await import('./vts-runner.js');
      const { unmarkAllXstockWeekendSuspended } = await import('./vts-trade-persistence.js');
      const restored = await unmarkAllXstockWeekendSuspended(getOpenVirtualTradesMap());
      meta.tradesAffected = restored.updated;

      console.log(
        `[B-NEW-36][WEEKEND_RESTART_DONE] restored=${restored.updated} ` +
        `prewarm=${meta.prewarmStatus} scanner=resumed trigger=${opts.triggerSource}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[B-NEW-36][WEEKEND_RESTART_FAIL] ${msg}`);
      overallStatus = 'error';
      errorMessage = errorMessage ? `${errorMessage}; lifecycle: ${msg}` : `lifecycle: ${msg}`;
    }

    await writeAuditRow('weekend_restart', opts.scheduledFor, firedAt, overallStatus, meta, errorMessage);
  }

  /**
   * Surface a system-alert when poll-path fires (i.e. cron silently missed
   * its fire window). Per Langston review of B-NEW-36 poll-reconcile design:
   * "otherwise we silently rely on poll forever and never notice when cron
   * regresses." Severity=warning + category=breakage so the §10.5 per-turn
   * check surfaces it.
   */
  private async writeMissedCronAlert(kind: 'shutdown' | 'restart', firedAt: Date): Promise<void> {
    try {
      await addAlert({
        triggers_at: firedAt,
        category: 'breakage',
        severity: 'warning',
        title: `B-NEW-36 weekend cron silently missed ${kind} fire — poll-path caught up`,
        body:
          `The Fri 8PM ET → Sun 8PM ET weekend ${kind} timer (node-cron, registered in ` +
          `session-lifecycle-controller.ts) did not invoke its callback at the expected ` +
          `boundary. The poll-based reconciliation tick (xstockSpotScanner.clockTickHandler, ` +
          `every 30s) detected window-vs-scanner state drift and triggered the catch-up at ` +
          `${firedAt.toISOString()}. xStock VTS state is now correct, but the cron regression ` +
          `needs investigation — see scheduled_tasks_audit table for the missing cron row + ` +
          `poll-triggered row with meta.trigger_source='poll'.`,
        metadata: {
          batch: 'B-NEW-36-poll-reconcile',
          kind,
          fired_at_iso: firedAt.toISOString(),
        },
      });
      console.warn(`[B-NEW-36][MISSED_CRON_ALERT] alert written for ${kind} catch-up`);
    } catch (err) {
      console.error(`[B-NEW-36][ALERT_WRITE_FAIL] ${kind}: ${err instanceof Error ? err.message : err}`);
      // Don't rethrow — alert-write failure must not block the reconcile.
    }
  }

  /**
   * Tear-down for shutdown / tests. Stops both scheduled tasks and clears
   * the registration. Idempotent.
   */
  shutdown(): void {
    if (this.friShutdownTask) {
      try { this.friShutdownTask.stop(); } catch { /* ignore */ }
      this.friShutdownTask = null;
    }
    if (this.sunRestartTask) {
      try { this.sunRestartTask.stop(); } catch { /* ignore */ }
      this.sunRestartTask = null;
    }
    this.initialized = false;
    console.log('[B-NEW-36][LIFECYCLE_SHUTDOWN] scheduled tasks stopped');
  }
}

export const sessionLifecycleController = new SessionLifecycleController();
