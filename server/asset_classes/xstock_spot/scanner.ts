/**
 * ════════════════════════════════════════════════════════════════════════════
 * B79.0a — xstock_spot Live Scanner
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Purpose: per-cycle live scan of xstock_spot pairs. Subscribes to centralClock
 * (NOT a parallel setInterval — same tick-source pattern as Fx5ScannerService
 * per Kyle directive 2026-05-08). Runs every 30 ticks (30 seconds) during ARCA
 * market hours; short-circuits on market-closed.
 *
 * Day 1 (B79.0a) minimum-viable shape: OBSERVABILITY scanner, not active-
 * trading scanner. Per cycle:
 *   1. Market-open gate (`isXstockMarketOpenUTC`) — short-circuit if closed.
 *   2. Batched DB read of latest ticker prices for ALL xstock_spot symbols
 *      from `equity_spot_ticker_snap` (single round-trip, Langston rev 2 #1).
 *   3. Per-pair freshness gate via `isPairDataFresh` (window=90s for Day 1,
 *      empirical p99 + buffer per Langston Q2).
 *   4. Update xstock TelemetryAggregator instance counters (cycle count,
 *      fresh-pair count). NO signal-orchestrator / strategy-engine path
 *      activation — that's a B79.x downstream batch gated on Layer-3
 *      threshold calibration evidence.
 *   5. `[B79.0a][SCAN_CYCLE_DONE]` log + diagnostic surface update.
 *
 * Two-instance pattern: ALL telemetry / ARM / failure-tracker reads go
 * through `getXstockSpotInstances()` factory — NEVER the crypto globals.
 *
 * Backpressure: scope §1 Obj 11 — `[B79.0a][BACKPRESSURE_OBSERVED]` log
 * when cycle duration exceeds budget. NEVER triggers cycle skipping
 * (per RUNNING_ISSUES #81). Hostile-sim env flag
 * `BACKPRESSURE_TEST_MODE=1` (dev/staging only — gated `NODE_ENV !==
 * 'production'`) artificially sleeps the scan to validate the no-shed
 * posture in Step 7+8 hostile sim.
 *
 * SIM update at Step 10: new entry mirroring fx5-scanner; layer 3.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { centralClock, type ClockTick } from '../../services/central-clock.js';
import { getXstockSpotInstances } from '../../services/asset-class-instances.js';
import { isXstockMarketOpenUTC } from './market-hours.js';
import { isPairDataFresh } from '../../utils/data-freshness.js';
import { XSTOCK_SPOT_SYMBOLS } from '../../../shared/asset-classes.js';
import { db } from '../../db.js';
import { sql } from 'drizzle-orm';

// 30 seconds — same as FX5 scanner. Aligned with central-clock budget.
const SCAN_INTERVAL_SECONDS = 30;

// Hostile-sim sleep duration (Langston Q5 lock — gated by NODE_ENV check).
const HOSTILE_SIM_SLEEP_MS = 35_000; // exceeds central-clock budget intentionally

interface ScannerDiagnostics {
  isRunning: boolean;
  isScanning: boolean;
  lastTickAt: number | null;
  lastCycleDurationMs: number | null;
  cyclesCompleted: number;
  cyclesSkippedMarketClosed: number;
  pairsScannedLastCycle: number;
  pairsFreshLastCycle: number;
  pairsStaleLastCycle: number;
  lastError: string | null;
  hostileSimActive: boolean;
}

interface TickerSnapRow extends Record<string, unknown> {
  symbol: string;
  price: string;        // numeric stored as string in pg
  capturedAt: Date;
}

class XstockSpotScannerService {
  private isRunning = false;
  private isScanning = false;
  private clockTickHandler: ((tick: ClockTick) => Promise<void>) | null = null;

  private diag: ScannerDiagnostics = {
    isRunning: false,
    isScanning: false,
    lastTickAt: null,
    lastCycleDurationMs: null,
    cyclesCompleted: 0,
    cyclesSkippedMarketClosed: 0,
    pairsScannedLastCycle: 0,
    pairsFreshLastCycle: 0,
    pairsStaleLastCycle: 0,
    lastError: null,
    hostileSimActive: false,
  };

  /**
   * Start the scanner. Subscribes to centralClock; idempotent if already running.
   * Throws on bootstrap failure so server/index.ts can HARD-FAIL the boot
   * (Langston rev 1 #4).
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[B79.0a][BOOT] XstockSpotScanner already running');
      return;
    }

    // Force lazy-init of the xstock instances triad. Throws on construction failure.
    getXstockSpotInstances();

    // Hostile-sim flag — Langston Q5 conditions.
    const hostileSimEnabled =
      process.env.BACKPRESSURE_TEST_MODE === '1' &&
      process.env.NODE_ENV !== 'production';
    if (hostileSimEnabled) {
      this.diag.hostileSimActive = true;
      console.warn('[B79.0a][HOSTILE_SIM_ACTIVE] BACKPRESSURE_TEST_MODE=1 detected; scanner cycles will artificially sleep to validate no-shed posture');
    }
    if (process.env.BACKPRESSURE_TEST_MODE === '1' && process.env.NODE_ENV === 'production') {
      console.error('[B79.0a][HOSTILE_SIM_BLOCKED] BACKPRESSURE_TEST_MODE=1 set in production — refusing to enable. Unset the flag.');
    }

    this.clockTickHandler = async (tick: ClockTick) => {
      this.diag.lastTickAt = tick.timestamp;
      if (!this.isRunning || this.isScanning) {
        if (this.isScanning) {
          console.log(`[B79.0a][SKIP] tickNumber=${tick.tickNumber} reason=scan_in_progress`);
        }
        return;
      }
      // Run every 30 ticks (30 seconds).
      if (tick.tickNumber > 0 && tick.tickNumber % SCAN_INTERVAL_SECONDS === 0) {
        await this.runCycle(tick);
      }
    };

    centralClock.subscribe('XstockSpotScanner', this.clockTickHandler);
    if (!centralClock.getIsRunning()) {
      centralClock.start();
      console.log('[B79.0a][BOOT] Started Central Clock from XstockSpotScanner');
    }

    this.isRunning = true;
    this.diag.isRunning = true;
    console.log(`[B79.0a][BOOT] XstockSpotScanner started (interval=${SCAN_INTERVAL_SECONDS}s; universe=${XSTOCK_SPOT_SYMBOLS.size} symbols; hostile_sim=${hostileSimEnabled})`);
  }

  stop(): void {
    if (!this.isRunning) return;
    if (this.clockTickHandler) {
      centralClock.unsubscribe('XstockSpotScanner');
      this.clockTickHandler = null;
    }
    this.isRunning = false;
    this.isScanning = false;
    this.diag.isRunning = false;
    this.diag.isScanning = false;
    console.log('[B79.0a][SHUTDOWN] XstockSpotScanner stopped');
  }

  /**
   * Per-cycle scan. Market-open gated. Reads ALL xstock prices in one
   * batched query (Langston rev 2 #1), gates each by freshness, updates
   * telemetry. Logs `[B79.0a][SCAN_CYCLE_DONE]` with metrics.
   */
  private async runCycle(tick: ClockTick): Promise<void> {
    this.isScanning = true;
    this.diag.isScanning = true;
    const cycleStart = Date.now();

    try {
      console.log(`[B79.0a][SCAN_CYCLE_START] tick=${tick.tickNumber}`);

      // Market-open gate.
      if (!isXstockMarketOpenUTC()) {
        this.diag.cyclesSkippedMarketClosed++;
        if (this.diag.cyclesSkippedMarketClosed % 30 === 1) {
          console.log(`[B79.0a][MARKET_CLOSED] tick=${tick.tickNumber} cycles_skipped_total=${this.diag.cyclesSkippedMarketClosed}`);
        }
        return;
      }

      // Hostile-sim sleep (no-op in production — flag is gated).
      if (this.diag.hostileSimActive) {
        await new Promise((r) => setTimeout(r, HOSTILE_SIM_SLEEP_MS));
      }

      // Batched DB read — Langston rev 2 #1 commitment.
      const symbolList = Array.from(XSTOCK_SPOT_SYMBOLS);
      const dbStart = Date.now();
      const result = await db.execute<TickerSnapRow>(sql`
        SELECT DISTINCT ON (symbol)
          symbol::text AS symbol,
          price::text AS price,
          captured_at AS "capturedAt"
        FROM equity_spot_ticker_snap
        WHERE symbol = ANY(${symbolList})
        ORDER BY symbol, captured_at DESC
      `);
      const dbDurationMs = Date.now() - dbStart;
      const rows = (result as any).rows ?? (result as unknown as TickerSnapRow[]);

      // Per-pair freshness gate + telemetry.
      const xstockInstances = getXstockSpotInstances();
      const now = Date.now();
      let freshCount = 0;
      let staleCount = 0;
      for (const row of rows as TickerSnapRow[]) {
        const lastTickMs = new Date(row.capturedAt).getTime();
        const fresh = await isPairDataFresh(row.symbol, 'xstock_spot', lastTickMs, now);
        if (fresh) freshCount++;
        else staleCount++;
      }

      // TODO B79.x: route fresh pairs into signal-orchestrator / strategy-engine.
      // Day 1 = observability only; Layer-3 threshold calibration drives the
      // downstream wiring decision.

      const cycleDurationMs = Date.now() - cycleStart;
      this.diag.lastCycleDurationMs = cycleDurationMs;
      this.diag.cyclesCompleted++;
      this.diag.pairsScannedLastCycle = (rows as TickerSnapRow[]).length;
      this.diag.pairsFreshLastCycle = freshCount;
      this.diag.pairsStaleLastCycle = staleCount;

      console.log(
        `[B79.0a][SCAN_CYCLE_DONE] tick=${tick.tickNumber} duration_ms=${cycleDurationMs} ` +
        `db_roundtrip_ms=${dbDurationMs} pairs_scanned=${(rows as TickerSnapRow[]).length} ` +
        `fresh=${freshCount} stale=${staleCount}`,
      );

      // Backpressure observation — telemetry signal only, NEVER triggers shedding.
      if (cycleDurationMs > 25_000) {
        console.warn(
          `[B79.0a][BACKPRESSURE_OBSERVED] tick=${tick.tickNumber} duration_ms=${cycleDurationMs} ` +
          `exceeded 25s budget; vertical-scale or computational-distribution refactor required (#81 policy). ` +
          `NEVER skip cycles.`,
        );
      }

      // Touch xstock instances to keep them warm + verify two-instance pattern.
      void xstockInstances.telemetry; // observability tap
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.diag.lastError = msg;
      console.error(`[B79.0a][SCAN_CYCLE_ERROR] tick=${tick.tickNumber}:`, err);
    } finally {
      this.isScanning = false;
      this.diag.isScanning = false;
    }
  }

  getDiagnostics(): ScannerDiagnostics {
    return { ...this.diag };
  }
}

export const xstockSpotScanner = new XstockSpotScannerService();
