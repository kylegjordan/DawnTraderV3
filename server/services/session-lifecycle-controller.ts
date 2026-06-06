/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B-NEW-36 sub-batch (b) — Off-hours session-lifecycle controller
 *   ★ B-NEW-52 (2026-06-06): fire-once weekend node-cron RETIRED. The
 *     continuous reconcile (boot + 30s poll) is now the SINGLE SOURCE OF TRUTH.
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Manages the unified xStock weekend close window (empirically verified
 * Fri 8PM ET → Sun 8PM ET; B-NEW-36 sub-batch (c) §0.5 Findings):
 *
 *   - Entering the weekend window (market closed) → `weekend_shutdown`:
 *       1. Run pre-warm so the snapshot table captures closing-week bars
 *          (so DBS isn't cold at the Sunday reopen).
 *       2. Bulk-mark all open xstock_spot trades as `weekend_suspended`
 *          (DB + in-memory Map mirror).
 *       3. Pause the xstockSpotScanner so it no-ops every centralClock tick
 *          for the 48-hour weekend window (vs the previous
 *          universe-0-cycle-every-30s pattern).
 *       4. Write an audit row to scheduled_tasks_audit.
 *
 *   - Leaving the weekend window (market open) → `weekend_restart`:
 *       1. Run pre-warm again (refresh-on-restart per Langston Q3 B-NEW-34b).
 *       2. Resume the xstockSpotScanner.
 *       3. Bulk-restore all weekend_suspended xstock_spot trades to `open`.
 *       4. Audit row.
 *
 * ★ B-NEW-52 — why the weekend node-cron was retired (Kyle directive 2026-06-06):
 *   `weekend_shutdown`/`weekend_restart` were fire-once-a-week in-process
 *   node-cron alarms. The app is deployed/restarted multiple times a week, and
 *   the once-weekly alarm repeatedly failed to fire at its next Fri/Sun 20:00 ET
 *   occurrence after a mid-week restart (3rd recurrence: stale since 2026-05-23,
 *   despite B-NEW-49 monitoring; #161/#162/#163). A continuous self-correcting
 *   reconcile loop is strictly more reliable than a fire-once alarm and cannot
 *   be knocked out by a restart, so the alarm was removed entirely (the
 *   NO-PATCHES answer — remove the fragile dependency, don't chase its exact
 *   internal failure for a 4th time). The two reconcile paths below are now the
 *   ONLY drivers; they always existed and ran the SAME shared shutdown/restart
 *   core the cron did (full action, not just scanner-pause).
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
 * 30-second poll reconciliation (B-NEW-36 poll-reconcile 2026-05-31; promoted
 *   to PRIMARY by B-NEW-52):
 *   xstockSpotScanner.clockTickHandler calls reconcileWindowState() every 30s
 *   (above the isPaused early-out, so the Sunday reopen fires even while paused).
 *   On window-vs-scanner drift it calls runShutdownFromPoll / runRestartFromPoll,
 *   which invoke the same shared core. The core fires once per boundary
 *   (idempotent: pause()/markSuspended are no-ops when already in state, +
 *   inFlight mutex), so running every 30s is safe.
 *
 * Pre-warm circuit-breaker (per Langston Q6):
 *   Pre-warm failure does NOT crash the server AND does NOT block the rest
 *   of the hook. Failure → audit row status='error' with error_message;
 *   STILL ATTEMPT scanner pause/resume + trade state updates.
 *
 * Reference: Claude Comms and Packages/Scope Files/B_NEW_36_SCOPE.md §2;
 *            Claude Comms and Packages/Scope Files/B_NEW_36_PRE_AUDIT.md §3.10 + §4;
 *            Claude Comms and Packages/Langston Design Asks/BNEW52_WEEKEND_CRON_RETIREMENT_DESIGN.md
 * ═════════════════════════════════════════════════════════════════════════════
 */

import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { isXstockMarketOpenUTC } from '../asset_classes/xstock_spot/market-hours.js';

// Sample symbol used purely to satisfy the predicate's backward-compatible
// signature. Post-B-NEW-36 sub-batch (c) the predicate is symbol-independent,
// so this value is irrelevant — any registered xStock would return the same
// answer.
const SAMPLE_SYMBOL_FOR_HOURS_CHECK = 'AAPL/USD';

// B-NEW-36 poll-reconcile (2026-05-31): trigger-source label written into
// scheduled_tasks_audit.meta and used to distinguish reconcile-path vs
// boot-path in dashboards / queries.
//   B-NEW-52 (2026-06-06): the fire-once weekend node-cron was retired, so the
//   'cron' source no longer occurs for this controller. 'poll' is now the
//   NORMAL (primary) driver — the 30s reconcile loop — NOT a fallback for a
//   missed cron. (The shared scheduled-jobs-audit writer still declares 'cron'
//   for backward-compatibility with historical rows + other schedules.)
export type TriggerSource = 'poll' | 'boot';

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
   *
   * B-NEW-52 (2026-06-06): no longer registers any scheduled timer. The 30s
   * poll-reconcile (xstockSpotScanner.clockTickHandler → reconcileWindowState)
   * is the continuous self-correcting driver; this boot reconciliation covers
   * the restart-instant; together they are the single source of truth.
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
      // Don't rethrow — boot reconciliation is best-effort. The 30s
      // poll-reconcile will still self-correct any drift on subsequent ticks.
    }

    this.initialized = true;
    console.log(
      `[B-NEW-52][LIFECYCLE_INIT_DONE] boot reconciliation complete — ` +
      `weekend lifecycle now driven by the continuous 30s poll-reconcile ` +
      `(no scheduled timers registered)`,
    );
  }

  /**
   * B-NEW-36 poll-reconcile (2026-05-31): the 30s reconcile shutdown entry,
   * called by xstockSpotScanner.clockTickHandler when the periodic reconcile
   * check detects window state drift (insideWindow=true but scanner is not
   * paused — i.e. we have crossed the Fri 8PM ET boundary into the closed
   * window and need to shut down).
   *
   * B-NEW-52 (2026-06-06): this is now the PRIMARY (normal) driver, not a
   * fallback for a missed cron. The fire-once weekend node-cron was retired.
   *   - Pre-warm RUNS here (folded in from the old cron path, Langston Q2=(b))
   *     so the OHLC 60m+15m snapshot pre-warm still happens at the boundary —
   *     needed so DBS isn't cold at the Sunday reopen. The core fires once per
   *     boundary (idempotent + scanner-state gate below), so pre-warm runs once
   *     per Friday close, not every 30s.
   *   - Audit-row meta.trigger_source='poll' (the normal value; NOT an error
   *     signal). No "cron silently missed" breakage alert is emitted — this is
   *     the expected path, so an alert would be weekly false-alarm noise.
   *
   * Mutex semantics: inFlight prevents concurrent reconcile invocations from
   * double-firing the core. Re-checks scanner state after acquiring the mutex
   * so a tick that overlaps an in-progress run no-ops.
   */
  async runShutdownFromPoll(now: Date): Promise<void> {
    // ATOMIC mutex acquire — check+set in a single synchronous step (no awaits
    // in between, so two concurrent invocations cannot both pass the gate).
    if (this.inFlight) {
      console.log('[B-NEW-36][POLL_SHUTDOWN_SKIP] inFlight=true (prior reconcile holding mutex)');
      return;
    }
    this.inFlight = true;
    try {
      // Post-mutex state recheck — a prior reconcile tick may have shut down
      // between drift-detection and entry. If scanner is already paused, the
      // boundary was handled; we no-op WITHOUT writing audit (no spurious
      // duplicate row).
      const { xstockSpotScanner } = await import('../asset_classes/xstock_spot/scanner.js');
      if (xstockSpotScanner.getIsPaused()) {
        console.log('[B-NEW-36][POLL_SHUTDOWN_NOOP] scanner already paused (boundary already handled this run)');
        return;
      }
      console.log('[B-NEW-52][POLL_SHUTDOWN_FIRE] reconcile crossing Fri-close boundary — shutting down');
      await this.runWeekendShutdownCore({
        scheduledFor: now,
        triggerSource: 'poll',
        runPrewarm: true,
      });
    } finally {
      this.inFlight = false;
    }
  }

  /**
   * B-NEW-36 poll-reconcile (2026-05-31): the 30s reconcile restart entry,
   * mirror of runShutdownFromPoll for the Sun 8PM ET reopen boundary.
   *
   * B-NEW-52 (2026-06-06): PRIMARY driver. Pre-warm RUNS here (refresh-on-
   * restart). No breakage alert — this is the normal path. The reconcile loop
   * runs ABOVE the scanner's isPaused early-out, so this fires even though the
   * scanner is paused over the weekend (that ordering is locked by a unit test).
   */
  async runRestartFromPoll(now: Date): Promise<void> {
    if (this.inFlight) {
      console.log('[B-NEW-36][POLL_RESTART_SKIP] inFlight=true (prior reconcile holding mutex)');
      return;
    }
    this.inFlight = true;
    try {
      const { xstockSpotScanner } = await import('../asset_classes/xstock_spot/scanner.js');
      if (!xstockSpotScanner.getIsPaused()) {
        console.log('[B-NEW-36][POLL_RESTART_NOOP] scanner already running (boundary already handled this run)');
        return;
      }
      console.log('[B-NEW-52][POLL_RESTART_FIRE] reconcile crossing Sun-reopen boundary — restarting');
      await this.runWeekendRestartCore({
        scheduledFor: now,
        triggerSource: 'poll',
        runPrewarm: true,
      });
    } finally {
      this.inFlight = false;
    }
  }

  /**
   * Shared shutdown core. Used by both the 30s poll-reconcile entry and the
   * boot reconciliation. Prewarm is OPTIONAL (the reconcile boundary fire runs
   * it; a caller may pass false to skip). trigger_source is recorded in
   * audit-row meta for query distinction.
   *   B-NEW-52 (2026-06-06): the fire-once weekend node-cron path was retired;
   *   the poll-reconcile is the sole boundary driver and passes runPrewarm:true.
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
   * Tear-down for shutdown / tests. Clears the initialized flag so a
   * subsequent init() re-runs boot reconciliation. Idempotent.
   *   B-NEW-52 (2026-06-06): no scheduled timers to stop anymore (the weekend
   *   node-cron was retired); the only state to reset is `initialized`.
   */
  shutdown(): void {
    this.initialized = false;
    console.log('[B-NEW-52][LIFECYCLE_SHUTDOWN] controller reset (no scheduled tasks to stop)');
  }
}

export const sessionLifecycleController = new SessionLifecycleController();
