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
 *      from `xstock_spot_ticker_snap` (single round-trip, Langston rev 2 #1).
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
 * when cycle duration exceeds budget. NEVER triggers asset-class shedding
 * (per RUNNING_ISSUES #81); the in-progress mutex skip (`reason=scan_in_progress`)
 * is normal serialization — same precedent as `fx5-scanner.ts:577` — and
 * is distinct from the forbidden asset-class shed. Hostile-sim env flag
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
import { XSTOCK_SPOT_SYMBOLS, XSTOCK_SPOT_REGISTRY } from '../../../shared/asset-classes.js';
import { db } from '../../db.js';
import { sql } from 'drizzle-orm';
// B-PHASE-A2 (2026-05-17): pre-cycle DBS compute imports.
import { computeDirectionalBias } from '../../core/metrics/directional-bias.js';
import { xstockDirectionalBiasStore } from '../../core/metrics/directional-bias-store.js';
import type { OHLCData } from '../../types/market-regime.types.js';

/**
 * B-PHASE-A2 (2026-05-17): ATR helper for DBS pre-compute (mirrors fx5-scanner.ts:66-78).
 * Computes 14-period ATR over a 60-min OHLC bar sequence. Used to normalize the
 * DBS slope + EMA components for cross-pair comparability.
 */
function computeATRFromOHLC(ohlcData: OHLCData[], period: number = 14): number {
  if (ohlcData.length < period + 1) return 0;
  const recent = ohlcData.slice(-(period + 1));
  let trSum = 0;
  for (let i = 1; i < recent.length; i++) {
    const high = recent[i].high;
    const low = recent[i].low;
    const prevClose = recent[i - 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trSum += tr;
  }
  return trSum / period;
}

// 30 seconds — same as FX5 scanner. Aligned with central-clock budget.
const SCAN_INTERVAL_SECONDS = 30;

// Hostile-sim sleep duration (Langston Q5 lock — gated by NODE_ENV check).
// 28s — exceeds the 25s `[B79.0a][BACKPRESSURE_OBSERVED]` threshold so the
// telemetry signal trips, but stays under the 30s `SCAN_INTERVAL_SECONDS`
// tick anchor so cycles continue firing every 30 ticks (no in-progress-skip).
// Per Langston Step 4 Finding #2: preserves the strict "no skip" verification
// surface in PIA §3 hostile-sim acceptance.
const HOSTILE_SIM_SLEEP_MS = 28_000;

interface ScannerDiagnostics {
  isRunning: boolean;
  isScanning: boolean;
  // B-NEW-36 (2026-05-20): paused state distinct from stopped. When paused,
  // the scanner is subscribed-but-no-op-on-tick: clockTickHandler still
  // checks isPaused first and skips work without unsubscribing. Set by
  // pause(); cleared by resume(). Surfaced on /api/xstocks/filter-diagnostics
  // so the dashboard can show paused vs running vs stopped at a glance.
  isPaused: boolean;
  lastTickAt: number | null;
  lastCycleDurationMs: number | null;
  cyclesCompleted: number;
  cyclesSkippedMarketClosed: number;
  pairsScannedLastCycle: number;
  pairsFreshLastCycle: number;
  pairsStaleLastCycle: number;
  lastError: string | null;
  hostileSimActive: boolean;
  // B79.0c — universe-split telemetry for diagnostics endpoint.
  lastUniverseSize: number;
  lastArcaOpen: boolean;
  // B79.0m.b — per-cycle eval-pipeline counters from xstock eval-cycle.
  // Populated by runCycle after evaluateXstockPairForVTS loop completes;
  // surfaced to /api/xstocks/filter-diagnostics so the xStocks tab funnel
  // panels show real numbers (pre-B79.0m.b they showed all zeros because
  // no in-memory counters were exposed and signal_eval_archive was empty).
  lastCycleEvalCounters: any | null;
  // Rolling-24h-style accumulator (process-lifetime): merged on each cycle
  // so the "24-Hour Rolling Aggregates" panel has live numbers even before
  // signal_eval_archive accumulates. NOT a true 24h sliding window — that
  // would require periodic decay; this is a since-start accumulator. Future
  // B79.0m.b2 may replace with a 24h windowed buffer.
  evalCountersLifetime: any | null;
  // B-PHASE-A2 (2026-05-17): one-shot flag — first publish-success of each ARCA
  // session emits the FIRST_FLOOR_CLEAR telemetry. Resets to false on PM2 restart
  // (cold start) so post-restart first publish is captured.
  firstFloorClearLogged: boolean;
}

interface TickerSnapRow extends Record<string, unknown> {
  symbol: string;
  price: string;        // numeric stored as string in pg
  volume24h: string;    // 24h rolling SHARE volume from Kraken ticker; multiply by price for USD
  // B-NEW-14 (2026-05-14): bid/ask added back to the scan read so the
  // max_bid_ask_spread global filter has the data it needs. Mirrors
  // crypto's fx5-scanner.ts:1037-1053 pattern — same architecture, the
  // xstock feed lands in the snap table instead of arriving inline from
  // a live Kraken ticker call, but the data shape is identical (Kraken
  // populates the same fields on both the futures REST endpoint AND the
  // xstock ticker REST endpoint that the archiver scrapes every minute).
  // Sentinel handling: null/zero bid or ask → caller maps to -1
  // bidAskSpreadPct ("skip check") per the global-filter contract.
  bid: string | null;
  ask: string | null;
  capturedAt: Date;
}

class XstockSpotScannerService {
  private isRunning = false;
  private isScanning = false;
  // B-NEW-36 (2026-05-20): pause flag for the off-hours session-lifecycle
  // controller. Distinct from stop()/start() — pause() keeps the
  // clockTickHandler reference and the centralClock subscription intact;
  // the handler observes isPaused at every tick and skips work without
  // unsubscribing. resume() re-arms; no clockTickHandler rebuild needed.
  private isPaused = false;
  private clockTickHandler: ((tick: ClockTick) => Promise<void>) | null = null;

  // ── Per-cycle rotation (Kyle directive 2026-05-12) ──
  // Each cycle scans 70 rotated symbols + 5 pinned benchmarks = 75 total.
  // Sequential OHLC fetch at ~150ms/pair × 75 = ~11s — clean margin under the
  // 25s SCAN_TIMEOUT_MS. Full universe (~260 xstocks) covered every 3.5 cycles
  // = ~1m 45s sweep. Trade-off: each pair evaluated ~every two 1-min candles
  // instead of every cycle. Accepted for VTS observation phase. Benchmarks
  // pinned every cycle because index-level signals matter at all times.
  private static readonly CYCLE_BATCH_SIZE = 75;
  // Pinned to xstock universe membership only. SPY (S&P 500) + QQQ (Nasdaq
  // 100) + GLD (Gold) cover broad-US + commodity index signals. IWM (Russell
  // 2000) and DIA (Dow Jones) ETFs are not tokenized by Backed Finance so
  // they don't exist as xstocks; previously hardcoded but silently filtered
  // out by `symbolList.includes` — moot rows.
  private static readonly PINNED_BENCHMARKS: readonly string[] = [
    'SPY/USD', 'QQQ/USD', 'GLD/USD',
  ];
  private rotationCursor = 0;

  private diag: ScannerDiagnostics = {
    isRunning: false,
    isScanning: false,
    isPaused: false,
    lastTickAt: null,
    lastCycleDurationMs: null,
    cyclesCompleted: 0,
    cyclesSkippedMarketClosed: 0,
    pairsScannedLastCycle: 0,
    pairsFreshLastCycle: 0,
    pairsStaleLastCycle: 0,
    lastError: null,
    lastUniverseSize: 0,
    lastArcaOpen: false,
    hostileSimActive: false,
    lastCycleEvalCounters: null,
    evalCountersLifetime: null,
    firstFloorClearLogged: false,
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

    // Hostile-sim flag — Langston Q5 conditions + staging override.
    // Default: refuse in production. Staging override:
    //   `HOSTILE_SIM_OVERRIDE=1` AND `BACKPRESSURE_TEST_MODE=1`
    // lets the no-shed posture test run on staging (which is itself
    // NODE_ENV=production-named for parity with prod). The double-flag
    // prevents accidental enablement — both must be set explicitly.
    const testFlagSet = process.env.BACKPRESSURE_TEST_MODE === '1';
    const isProdEnv = process.env.NODE_ENV === 'production';
    const stagingOverride = process.env.HOSTILE_SIM_OVERRIDE === '1';
    const hostileSimEnabled = testFlagSet && (!isProdEnv || stagingOverride);
    if (hostileSimEnabled) {
      this.diag.hostileSimActive = true;
      console.warn(
        `[B79.0a][HOSTILE_SIM_ACTIVE] BACKPRESSURE_TEST_MODE=1 detected (NODE_ENV=${process.env.NODE_ENV}, OVERRIDE=${stagingOverride}); scanner cycles will artificially sleep to validate no-shed posture`,
      );
    } else if (testFlagSet && isProdEnv && !stagingOverride) {
      console.error(
        '[B79.0a][HOSTILE_SIM_BLOCKED] BACKPRESSURE_TEST_MODE=1 set in production without HOSTILE_SIM_OVERRIDE=1 — refusing to enable. Unset the flag, or set HOSTILE_SIM_OVERRIDE=1 if this is staging.',
      );
    }

    this.clockTickHandler = async (tick: ClockTick) => {
      this.diag.lastTickAt = tick.timestamp;
      // B-NEW-36 (2026-05-20): graceful drain semantics for pause(). When
      // paused, observe the flag and no-op without unsubscribing — the
      // session-lifecycle controller toggles this around the Fri 8PM ET →
      // Sun 8PM ET weekend window. In-flight cycle (if any) finishes
      // naturally because isScanning is checked separately below.
      if (this.isPaused) {
        // Low-frequency log so a stuck-paused scanner is detectable, but
        // not so chatty it fills logs across a 48-hour weekend.
        if (tick.tickNumber % 600 === 0) {
          console.log(`[B-NEW-36][SCAN_PAUSED] tickNumber=${tick.tickNumber} no-op (weekend window)`);
        }
        return;
      }
      if (!this.isRunning || this.isScanning) {
        if (this.isScanning) {
          console.log(`[B79.0a][SKIP] tickNumber=${tick.tickNumber} reason=scan_in_progress`);
        }
        return;
      }
      // Run every 30 ticks (30 seconds).
      if (tick.tickNumber > 0 && tick.tickNumber % SCAN_INTERVAL_SECONDS === 0) {
        // Hard-timeout protection — mirrors crypto fx5-scanner.ts:572 + 604-624.
        // Without this, a single slow runCycle (e.g. DB pool saturation) wedges
        // the scanner forever: isScanning stays true, every subsequent 30s tick
        // SKIPs, no recovery. 25s is intentionally below the 30s interval so
        // a timed-out cycle releases isScanning before the next scheduled tick.
        const SCAN_TIMEOUT_MS = 25000;
        const cycleStartTs = Date.now();
        const timeoutPromise = new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('Scan timeout')), SCAN_TIMEOUT_MS),
        );
        await Promise.race([this.runCycle(tick), timeoutPromise]).catch((err) => {
          console.error(
            `[B79.0a][SCAN_TIMEOUT] tick=${tick.tickNumber} duration_ms=${Date.now() - cycleStartTs}: ${err?.message ?? err}`,
          );
          // runCycle's own finally will eventually reset these as well, but
          // force-reset here so the next scheduled tick is not blocked while
          // the background promise drains. Concurrent next-cycle is acceptable
          // — counters merge cleanly via in-memory accumulator.
          this.isScanning = false;
          this.diag.isScanning = false;
        });
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
    this.isPaused = false;
    this.diag.isRunning = false;
    this.diag.isScanning = false;
    this.diag.isPaused = false;
    console.log('[B79.0a][SHUTDOWN] XstockSpotScanner stopped');
  }

  /**
   * B-NEW-36 (2026-05-20) — graceful pause for the off-hours session-lifecycle
   * controller. Distinct from stop():
   *   - The centralClock subscription stays active.
   *   - The clockTickHandler reference is preserved (so resume() doesn't
   *     have to rebuild it; capture is held via closures over scanner state).
   *   - The handler observes isPaused at every tick and returns immediately.
   *
   * Graceful drain: if a cycle is already in-flight when pause() is called,
   * it finishes naturally (isScanning gate); the NEXT tick observes isPaused
   * and no-ops. Synchronous-with-flag-set (caller proceeds immediately).
   *
   * Idempotent. Logs a single transition line for traceability.
   */
  pause(): void {
    if (!this.isRunning) {
      console.warn('[B-NEW-36][SCAN_PAUSE_NOOP] scanner not running — ignoring pause()');
      return;
    }
    if (this.isPaused) {
      return;
    }
    this.isPaused = true;
    this.diag.isPaused = true;
    console.log('[B-NEW-36][SCAN_PAUSE] XstockSpotScanner paused (centralClock subscription retained)');
  }

  /**
   * B-NEW-36 (2026-05-20) — resume after a pause(). Idempotent.
   * No clockTickHandler rebuild — the existing handler resumes on the next
   * centralClock tick because isPaused is now false.
   */
  resume(): void {
    if (!this.isRunning) {
      console.warn('[B-NEW-36][SCAN_RESUME_NOOP] scanner not running — call start() instead');
      return;
    }
    if (!this.isPaused) {
      return;
    }
    this.isPaused = false;
    this.diag.isPaused = false;
    console.log('[B-NEW-36][SCAN_RESUME] XstockSpotScanner resumed (next clock tick will scan)');
  }

  /** B-NEW-36 (2026-05-20) — public read-only access to the paused state. */
  getIsPaused(): boolean {
    return this.isPaused;
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

      // B-NEW-36 sub-batch (c) (2026-05-20): unified two-state universe.
      // All xStocks share identical hours per empirical Q9 verification
      // (Sun 8PM ET → Fri 8PM ET open; Fri 8PM ET → Sun 8PM ET closed).
      //   1. Inside weekend close: empty universe (recorded as cycle-skipped
      //      for legacy counter).
      //   2. Outside weekend close: full xstock universe scans (including
      //      off-ARCA-hours pre-market + after-hours bands — previously
      //      restricted to a 10-name subset; the restriction was empirically
      //      wrong and silently shrank the scanner universe by ~96%).
      // Hostile-sim bypasses so the no-shed posture test can run regardless
      // of when (e.g. weekend) Step 7+8 verify happens.
      // Symbol param to isXstockMarketOpenUTC is kept for backward compat
      // but no longer consulted internally.
      const xstockOpen = isXstockMarketOpenUTC('AAPL/USD');

      // Build per-cycle universe.
      let symbolList: string[];
      if (this.diag.hostileSimActive) {
        symbolList = Array.from(XSTOCK_SPOT_SYMBOLS); // hostile-sim always full
      } else if (xstockOpen) {
        symbolList = Array.from(XSTOCK_SPOT_SYMBOLS);
      } else {
        symbolList = []; // weekend close — ALL xStocks closed
      }
      this.diag.lastUniverseSize = symbolList.length;
      this.diag.lastArcaOpen = xstockOpen;

      // ── Per-cycle rotation (Kyle directive 2026-05-12) ──
      // Pre-rotation length captured above as lastUniverseSize so the
      // diagnostic still reports the full universe.
      // Rotation only applies when we have more than CYCLE_BATCH_SIZE candidates.
      // Hostile-sim bypasses rotation so the load test sees the full universe.
      if (!this.diag.hostileSimActive && symbolList.length > XstockSpotScannerService.CYCLE_BATCH_SIZE) {
        const pinned = XstockSpotScannerService.PINNED_BENCHMARKS.filter((s) => symbolList.includes(s));
        const rotatable = symbolList.filter((s) => !pinned.includes(s));
        const rotatedSize = XstockSpotScannerService.CYCLE_BATCH_SIZE - pinned.length;
        const rotatedSlice: string[] = [];
        for (let i = 0; i < rotatedSize && i < rotatable.length; i++) {
          rotatedSlice.push(rotatable[(this.rotationCursor + i) % rotatable.length]);
        }
        this.rotationCursor = (this.rotationCursor + rotatedSize) % rotatable.length;
        symbolList = [...pinned, ...rotatedSlice];
        console.log(
          `[B79.0a][ROTATION] tick=${tick.tickNumber} batch=${symbolList.length} ` +
          `(pinned=${pinned.length} rotated=${rotatedSlice.length}) cursor=${this.rotationCursor}/${rotatable.length}`,
        );
      }
      if (!xstockOpen && !this.diag.hostileSimActive) {
        this.diag.cyclesSkippedMarketClosed++; // legacy counter, retained for compat
        if (this.diag.cyclesSkippedMarketClosed % 30 === 1) {
          console.log(`[B-NEW-36][SCAN_WEEKEND_CLOSE] tick=${tick.tickNumber} universe=0 (Fri 8PM ET → Sun 8PM ET unified window)`);
        }
      }

      // Hostile-sim sleep (no-op in production — flag is gated).
      if (this.diag.hostileSimActive) {
        await new Promise((r) => setTimeout(r, HOSTILE_SIM_SLEEP_MS));
      }

      // B79.0L: empty universe (during unified weekend close) — short-circuit
      // before issuing the DB read. `IN ()` is a Postgres syntax error and
      // there's no work to do anyway.
      if (symbolList.length === 0) {
        const cycleDurationMs = Date.now() - cycleStart;
        this.diag.lastCycleDurationMs = cycleDurationMs;
        this.diag.cyclesCompleted++;
        this.diag.pairsScannedLastCycle = 0;
        this.diag.pairsFreshLastCycle = 0;
        this.diag.pairsStaleLastCycle = 0;
        return;
      }

      // ════════════════════════════════════════════════════════════════════
      // B-NEW-34 (2026-05-15): 60-min bar parity with crypto.
      // Replaces the prior ticker-snap + 90s freshness gate with local-DB
      // aggregation of 60-min bars (via xstockOhlcCache + ohlc-aggregator).
      // Bid/ask enrichment kept as a best-effort side query — drives the
      // max_bid_ask_spread filter when fresh quote data is available, sentinel
      // -1 otherwise. No freshness GATE — OHLC bar history is the source of
      // truth, gated only by min_ohlc_history_bars (module_constants, default
      // 24 bars = ~1 trading day of context).
      //
      // Architecture: Kraken has no public xstock REST endpoint at any tier
      // (BATCH_79_0k verdict, re-verified 2026-05-15). The only data source
      // is the WebSocket-fed xstock_spot_ohlc_1m archive, which we roll up
      // to 60-min + 240-min via aggregator. 240-min cache is warmed fire-
      // and-forget per cycle so future multi-TF agreement (Phase B of
      // XSTOCK_CALIBRATION_PLAN) has its data ready.
      // ════════════════════════════════════════════════════════════════════
      const dbStart = Date.now();
      const { xstockOhlcCache } = await import('../../services/xstock-ohlc-cache.js');

      // Single SQL round-trip for 60-min bars across the rotation batch.
      // Per Langston R2#4: WHERE symbol = ANY($1), postgres groups in-process.
      const ohlcBatch = await xstockOhlcCache.getOHLCDataBatch(symbolList, 60);

      // 240-min warm-fetch SUSPENDED in B-NEW-34 hotfix 3 (2026-05-15).
      //
      // Root cause: the underlying `xstock_spot_ohlc_1m` table has 18-56×
      // duplicate rows per (symbol, interval_begin) from the B74 WS archive
      // write pattern (tracked as B-NEW-35 source-side dedup). At 30-bar depth
      // the 240-min lookback window is 120 hours; multiplied by ~21× dup
      // factor and 75 symbols = ~9M source rows per warm-fetch. Postgres
      // statement_timeout (2 min) was canceling every warm call, AND the
      // concurrent disk-IO load against the same partition was starving the
      // synchronous 60-min query causing SCAN_TIMEOUT (25s scanner ceiling).
      //
      // 240-min data is NOT YET CONSUMED by any canonical scanner path. It
      // was added as forward-pre-warm for future multi-TF agreement wiring
      // (B68.1 pattern on xstocks, currently scoped to Phase D of the
      // XSTOCK_CALIBRATION_PLAN). Disabling it has zero functional impact on
      // the current 60-min pipeline.
      //
      // Re-enable path: once B-NEW-35 lands (B74 source dedup) the 240-min
      // batch query will run ~21× faster and concurrent execution will no
      // longer starve the 60-min critical path. At that point this fire-and-
      // forget block is restored. Multi-TF consumer wiring stays as a
      // separate later batch independent of this warm-fetch decision.
      // void xstockOhlcCache.getOHLCDataBatch(symbolList, 240).catch((err) => {
      //   console.warn(`[B-NEW-34][AGGREGATOR_240M] warm-fetch error: ${err instanceof Error ? err.message : err}`);
      // });

      // Bid/ask enrichment — best-effort. Drives the max_bid_ask_spread
      // filter (B-NEW-14). NOT a gate — symbols without recent ticker data
      // still get evaluated; they just pass the sentinel -1 ("skip check"
      // per the global-filter contract). Wider 30-minute window than the
      // prior 5-minute gate because we're enriching, not gating.
      const symbolListSql = symbolList.map((s) => `'${s.replace(/'/g, "''")}'`).join(',');
      const tickerResult = await db.execute<TickerSnapRow>(sql`
        SELECT DISTINCT ON (symbol)
          symbol::text AS symbol,
          last::text AS price,
          COALESCE(volume_24h, 0)::text AS "volume24h",
          bid::text AS bid,
          ask::text AS ask,
          captured_at AS "capturedAt"
        FROM xstock_spot_ticker_snap
        WHERE captured_at > NOW() - INTERVAL '30 minutes'
          AND symbol IN (${sql.raw(symbolListSql)})
        ORDER BY symbol, captured_at DESC
      `);
      const dbDurationMs = Date.now() - dbStart;
      const tickerRawRows = (tickerResult as any).rows ?? (tickerResult as unknown as TickerSnapRow[]);
      const tickerRows: TickerSnapRow[] = Array.isArray(tickerRawRows) ? tickerRawRows : [];
      const tickerEnrichmentBySymbol = new Map<string, { bidAskSpreadPct: number; volume24hShares: number }>();
      for (const row of tickerRows) {
        const bidRaw = row.bid ?? null;
        const askRaw = row.ask ?? null;
        const bid = bidRaw !== null ? parseFloat(bidRaw) : NaN;
        const ask = askRaw !== null ? parseFloat(askRaw) : NaN;
        const bidAskSpreadPct = (Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask > 0 && ask >= bid)
          ? ((ask - bid) / ((ask + bid) / 2)) * 100
          : -1;
        tickerEnrichmentBySymbol.set(row.symbol, {
          bidAskSpreadPct,
          volume24hShares: parseFloat(row.volume24h ?? '0'),
        });
      }

      // Telemetry — pairs with sufficient OHLC history are "ready for eval"
      // (replaces the freshCount/staleCount semantics).
      const xstockInstances = getXstockSpotInstances();
      let readyForEval = 0;
      let insufficientHistory = 0;
      const cacheStats = xstockOhlcCache.getStats();
      console.log(
        `[B-NEW-34][AGGREGATOR] 60m batch — universe=${symbolList.length} ` +
        `cache_hit_rate=${cacheStats.hitRatePct}% size=${cacheStats.size} db_ms=${dbDurationMs}`,
      );

      // ════════════════════════════════════════════════════════════════════
      // B-NEW-34 (2026-05-15): route rotation batch into VTS evaluation pipeline.
      // For each rotated xstock pair WITH SUFFICIENT OHLC HISTORY: global
      // filter → IMF → MCE → strategy detect → SQE → archive → register-open-
      // trade. No tick-freshness gate — bar history is the source of truth.
      // Hostile-sim bypasses (no eval during artificial sleep).
      // ════════════════════════════════════════════════════════════════════
      if (!this.diag.hostileSimActive && symbolList.length > 0) {
        const { evaluateXstockPairForVTS, makeEmptyXstockCycleCounters, loadXstockFilterConfigs } =
          await import('./eval-cycle.js');
        const cycleCounters = makeEmptyXstockCycleCounters();
        // Pre-load 7 screener_filters rows ONCE per cycle (mirrors crypto
        // fx5-scanner.ts:737-815). Pre-bundle, each filter function did its
        // own per-pair DB lookup — for a 234-fresh-pair cycle that was 1638
        // redundant Supabase round-trips, saturating the connection pool and
        // dragging cycle time from ~22s to 280s.
        const cycleConfigs = await loadXstockFilterConfigs('paper');

        // B-NEW-34: configurable min-OHLC-history floor (module_constants).
        // Default 24 if row missing — matches the Langston R3 floor recommendation
        // (4-bar BB/SMA(20) headroom + Monday-morning resilience vs the prior
        // hardcoded 60). Strict source-of-truth is the DB row but we fall back
        // to 24 to keep the system functional during the migration window.
        let minOhlcHistoryBars = 24;
        try {
          const { getConstant } = await import('../../services/module-constants-service.js');
          const dbValue = await getConstant<number>('xstock_spot', 'min_ohlc_history_bars', {
            exchange: '*', assetClass: 'xstock_spot', strategy: '*', regime: '*',
          });
          if (typeof dbValue === 'number' && dbValue > 0) minOhlcHistoryBars = dbValue;
          else console.warn(`[B-NEW-34] module_constants xstock_spot.min_ohlc_history_bars missing/invalid; using fallback ${minOhlcHistoryBars}`);
        } catch (err) {
          console.warn(`[B-NEW-34] module_constants read failed; using fallback ${minOhlcHistoryBars}: ${err instanceof Error ? err.message : err}`);
        }

        // ════════════════════════════════════════════════════════════════════
        // B-PHASE-A2 (2026-05-17): pre-cycle DBS compute.
        // ════════════════════════════════════════════════════════════════════
        // Before the eval loop dispatches, compute per-pair DBS + slope for
        // every symbol with sufficient OHLC + ATR. Feed xstockDirectionalBiasStore
        // for end-of-cycle global aggregation. Stash per-pair result in
        // `dbsBySymbol` so the eval loop threads it through evaluateXstockPairForVTS
        // → mce.computeContext → calculatePairRegime (replacing the prior
        // synthesized-neutral fallback at MCE non-crypto branch).
        //
        // Graceful degrade: pairs with insufficient OHLC (< minOhlcHistoryBars)
        // OR ATR <= 0 do NOT enter dbsBySymbol; eval-cycle calls with
        // propagatedDbs=undefined; MCE's non-crypto branch synthesizes neutral
        // as before (preserves today's behavior for thin pairs).
        //
        // Mirror of fx5-scanner.ts:1098-1118 pattern. Empirical timing per
        // B_PHASE_A2_DBS_PRE_AUDIT.md §11: 0.16% of cycle budget @ 250 pairs.
        // ════════════════════════════════════════════════════════════════════
        const dbsCycleStart = Date.now();
        const dbsBySymbol = new Map<string, { score: number; category: string; slope: number }>();
        for (const symbol of symbolList) {
          const ohlc = ohlcBatch.get(symbol) ?? [];
          if (ohlc.length < minOhlcHistoryBars) continue;
          const atr = computeATRFromOHLC(ohlc, 14);
          if (atr <= 0) continue;

          const registryEntry = XSTOCK_SPOT_REGISTRY.get(symbol);
          const sector = registryEntry?.sector;
          if (!sector) {
            // Defense-in-depth: registry guarantees sector is required, but log
            // if scanner ever encounters a symbol missing from registry.
            console.warn(`[B-PHASE-A2][SECTOR_MISSING] ${symbol} not in XSTOCK_SPOT_REGISTRY; skipping DBS write`);
            continue;
          }

          const dbsResult = computeDirectionalBias(ohlc, atr);
          let slope = 0;
          const priorOHLC = ohlc.slice(0, -3);
          if (priorOHLC.length >= 20) {
            const priorAtr = computeATRFromOHLC(priorOHLC, 14);
            if (priorAtr > 0) {
              const priorDbs = computeDirectionalBias(priorOHLC, priorAtr);
              slope = dbsResult.score - priorDbs.score;
            }
          }

          // Volume for the store: best-effort 24h USD (shares × latest bar close).
          // Falls back to 0 when ticker enrichment missed; computeGlobalDirectionalBias
          // gracefully handles zero volumes via its sentinel path.
          const enrich = tickerEnrichmentBySymbol.get(symbol);
          const volume24hShares = enrich?.volume24hShares ?? 0;
          const latestPrice = ohlc[ohlc.length - 1].close;
          const volume24hUSD = Number.isFinite(volume24hShares) && volume24hShares > 0 && Number.isFinite(latestPrice) && latestPrice > 0
            ? volume24hShares * latestPrice
            : 0;

          xstockDirectionalBiasStore.updatePair(
            symbol, dbsResult.score, dbsResult.sentinelZero, volume24hUSD, sector,
          );
          dbsBySymbol.set(symbol, { score: dbsResult.score, category: dbsResult.category, slope });
        }
        const dbsComputeDurationMs = Date.now() - dbsCycleStart;
        console.log(
          `[B-PHASE-A2][CYCLE_DBS_TIMING] tick=${tick.tickNumber} dbs_compute_ms=${dbsComputeDurationMs} ` +
          `pairs_with_dbs=${dbsBySymbol.size} universe=${symbolList.length}`,
        );

        // ════════════════════════════════════════════════════════════════════
        // Eval loop — same as before, plus thread propagatedDbs.
        // ════════════════════════════════════════════════════════════════════
        for (const symbol of symbolList) {
          const ohlc = ohlcBatch.get(symbol) ?? [];
          if (ohlc.length < minOhlcHistoryBars) {
            insufficientHistory++;
            continue;
          }
          readyForEval++;

          // Price source: most recent bar's close. Consistent across all
          // evaluated pairs — same source the strategies use internally.
          // Avoids ticker-vs-bar drift; matches crypto's pattern of pulling
          // price from the OHLC array.
          const latestBar = ohlc[ohlc.length - 1];
          const price = latestBar.close;
          if (!Number.isFinite(price) || price <= 0) continue;

          // Bid/ask + 24h-volume enrichment from ticker_snap side-query.
          // Missing → use sentinels (-1 spread = skip-check; 0 volume = skip-check).
          const enrich = tickerEnrichmentBySymbol.get(symbol);
          const bidAskSpreadPct = enrich?.bidAskSpreadPct ?? -1;
          const volume24hShares = enrich?.volume24hShares ?? 0;

          // 24h dollar-volume — Kraken's rolling 24h share volume × last price.
          // Falls back to 0 when ticker enrichment missed (then global-filter
          // Layer-1-passes the min_volume gate per the skip-check contract).
          const volume24hUSD = Number.isFinite(volume24hShares) && volume24hShares > 0
            ? volume24hShares * price
            : 0;
          // B-PHASE-A2: thread propagatedDbs from pre-cycle compute. When undefined
          // (insufficient OHLC / ATR=0 / sector missing), MCE non-crypto branch
          // synthesizes neutral as before (graceful degrade).
          const propagatedDbs = dbsBySymbol.get(symbol);
          await evaluateXstockPairForVTS(
            symbol, ohlc, price, volume24hUSD, 'paper',
            cycleCounters, cycleConfigs, bidAskSpreadPct, propagatedDbs,
          );
        }

        // B-PHASE-A2: end-of-cycle global xStock DBS snapshot publish.
        // mode='xstock' applies GICS-only counting + sector partition + dual floors
        // per directional-bias-store.ts publishSnapshot().
        const xstockGlobalSnapshot = xstockDirectionalBiasStore.publishSnapshot();
        if (xstockGlobalSnapshot && !xstockGlobalSnapshot.isStale) {
          // Telemetry on first publish-success per session for §C4 (Step 7 verification).
          if (!this.diag.firstFloorClearLogged) {
            console.log(
              `[B-PHASE-A2][FIRST_FLOOR_CLEAR] tick=${tick.tickNumber} ` +
              `pairs=${xstockGlobalSnapshot.coverage} ` +
              `global_dbs=${xstockGlobalSnapshot.value.score.toFixed(3)} ` +
              `category=${xstockGlobalSnapshot.value.category}`,
            );
            this.diag.firstFloorClearLogged = true;
          }
        }
        // Surface counters to the /api/xstocks/filter-diagnostics endpoint.
        this.diag.lastCycleEvalCounters = cycleCounters;
        // Lifetime accumulator (process-restart resets it).
        if (!this.diag.evalCountersLifetime) {
          this.diag.evalCountersLifetime = {
            pairsEntered: 0, pairsFailedMarketHours: 0, pairsFailedGlobalFilter: 0,
            pairsFailedAllFamilies: 0, pairsPassedFamilies: 0, strategiesEvaluated: 0,
            strategyNulls: 0, signalsGenerated: 0, signalsArchived: 0,
            signalsRejectedBySQE: 0, tradesOpened: 0, errors: 0,
            // B79.0m.b2: pattern path lifetime counters.
            pairsPassedPattern: 0, pairsFailedPattern: 0,
            patternRejectByMinHistory: 0, patternFanOut: 0,
            patternFilterCounters: {},
            patternPerMetric: { failedLQ: 0, failedVN: 0, failedDI: 0, passed: 0, total: 0 },
            // B79.0m.b2-followup (2026-05-12): per-lane VTS Evaluation Detail split.
            quantPairsEvaluated: 0, patternPairsEvaluated: 0,
            quantStrategiesEvaluated: 0, patternStrategiesEvaluated: 0,
            quantStrategyNulls: 0, patternStrategyNulls: 0,
            quantSignalsGenerated: 0, patternSignalsGenerated: 0,
            quantSignalsRejected: 0, patternSignalsRejected: 0,
            quantTradesOpened: 0, patternTradesOpened: 0,
            setupHashDeduped: 0,
            archiveFailures: 0,
            globalFilterCounters: {}, imfFilterCounters: {},
            imfPerMetric: { failedLQ: 0, failedVN: 0, failedCorr: 0, failedDI: 0, passed: 0, total: 0 },
            imfPerFamily: {},
            familyFanOutSum: 0, familyQualifiedUnique: 0, benchmarksRemoved: 0, vtsDestination: 0,
            byStrategyNullReasons: {}, nullReasonAggregate: {},
            quantNullReasonAggregate: {}, patternNullReasonAggregate: {},
            byStrategy: {},
          };
        }
        const lt = this.diag.evalCountersLifetime;
        for (const k of ['pairsEntered', 'pairsFailedMarketHours', 'pairsFailedGlobalFilter',
          'pairsFailedAllFamilies', 'pairsPassedFamilies', 'strategiesEvaluated',
          'strategyNulls', 'signalsGenerated', 'signalsArchived', 'signalsRejectedBySQE',
          'tradesOpened', 'errors', 'familyFanOutSum', 'familyQualifiedUnique',
          'benchmarksRemoved', 'vtsDestination',
          // B79.0m.b2 pattern + extra counters.
          'pairsPassedPattern', 'pairsFailedPattern',
          'patternRejectByMinHistory', 'patternFanOut', 'archiveFailures',
          // B79.0m.b2-followup (2026-05-12): per-lane split.
          'quantPairsEvaluated', 'patternPairsEvaluated',
          'quantStrategiesEvaluated', 'patternStrategiesEvaluated',
          'quantStrategyNulls', 'patternStrategyNulls',
          'quantSignalsGenerated', 'patternSignalsGenerated',
          'quantSignalsRejected', 'patternSignalsRejected',
          'quantTradesOpened', 'patternTradesOpened',
          'setupHashDeduped'] as const) {
          lt[k] = (lt[k] ?? 0) + ((cycleCounters as any)[k] ?? 0);
        }
        for (const k of Object.keys(cycleCounters.globalFilterCounters)) {
          lt.globalFilterCounters[k] = (lt.globalFilterCounters[k] ?? 0) + cycleCounters.globalFilterCounters[k];
        }
        for (const k of Object.keys(cycleCounters.imfFilterCounters)) {
          lt.imfFilterCounters[k] = (lt.imfFilterCounters[k] ?? 0) + cycleCounters.imfFilterCounters[k];
        }
        // B79.0m.b2: pattern-filter counter accumulator.
        if (!lt.patternFilterCounters) lt.patternFilterCounters = {};
        for (const k of Object.keys(cycleCounters.patternFilterCounters)) {
          lt.patternFilterCounters[k] = (lt.patternFilterCounters[k] ?? 0) + cycleCounters.patternFilterCounters[k];
        }
        // Per-metric IMF + per-strategy + null-reason accumulators.
        for (const k of ['failedLQ', 'failedVN', 'failedCorr', 'failedDI', 'passed', 'total'] as const) {
          lt.imfPerMetric[k] = (lt.imfPerMetric[k] ?? 0) + (cycleCounters.imfPerMetric[k] ?? 0);
        }
        // B79.0m.b2: pattern per-metric accumulator.
        if (!lt.patternPerMetric) lt.patternPerMetric = { failedLQ: 0, failedVN: 0, failedDI: 0, passed: 0, total: 0 };
        for (const k of ['failedLQ', 'failedVN', 'failedDI', 'passed', 'total'] as const) {
          lt.patternPerMetric[k] = (lt.patternPerMetric[k] ?? 0) + ((cycleCounters.patternPerMetric as any)[k] ?? 0);
        }
        // Per-family IMF breakdown.
        if (!lt.imfPerFamily) lt.imfPerFamily = {};
        for (const fam of Object.keys(cycleCounters.imfPerFamily)) {
          if (!lt.imfPerFamily[fam]) {
            lt.imfPerFamily[fam] = { evaluated: 0, failedLQ: 0, failedVN: 0, failedCorr: 0, failedDI: 0, passed: 0 };
          }
          const src = cycleCounters.imfPerFamily[fam];
          const dst = lt.imfPerFamily[fam];
          dst.evaluated += src.evaluated;
          dst.failedLQ += src.failedLQ;
          dst.failedVN += src.failedVN;
          dst.failedCorr += src.failedCorr;
          dst.failedDI += src.failedDI;
          dst.passed += src.passed;
        }
        for (const reason of Object.keys(cycleCounters.nullReasonAggregate)) {
          lt.nullReasonAggregate[reason] = (lt.nullReasonAggregate[reason] ?? 0) + cycleCounters.nullReasonAggregate[reason];
        }
        // B-NEW-12.b per-lane null reason accumulators
        if (!(lt as any).quantNullReasonAggregate) (lt as any).quantNullReasonAggregate = {};
        if (!(lt as any).patternNullReasonAggregate) (lt as any).patternNullReasonAggregate = {};
        for (const reason of Object.keys(cycleCounters.quantNullReasonAggregate)) {
          (lt as any).quantNullReasonAggregate[reason] = ((lt as any).quantNullReasonAggregate[reason] ?? 0) + cycleCounters.quantNullReasonAggregate[reason];
        }
        for (const reason of Object.keys(cycleCounters.patternNullReasonAggregate)) {
          (lt as any).patternNullReasonAggregate[reason] = ((lt as any).patternNullReasonAggregate[reason] ?? 0) + cycleCounters.patternNullReasonAggregate[reason];
        }
        for (const strat of Object.keys(cycleCounters.byStrategyNullReasons)) {
          if (!lt.byStrategyNullReasons[strat]) lt.byStrategyNullReasons[strat] = {};
          for (const r of Object.keys(cycleCounters.byStrategyNullReasons[strat])) {
            lt.byStrategyNullReasons[strat][r] = (lt.byStrategyNullReasons[strat][r] ?? 0) + cycleCounters.byStrategyNullReasons[strat][r];
          }
        }
        for (const strat of Object.keys(cycleCounters.byStrategy)) {
          if (!lt.byStrategy[strat]) lt.byStrategy[strat] = { evaluated: 0, nulls: 0, signals: 0, rejected: 0, trades: 0 };
          const cs = cycleCounters.byStrategy[strat];
          lt.byStrategy[strat].evaluated += cs.evaluated;
          lt.byStrategy[strat].nulls += cs.nulls;
          lt.byStrategy[strat].signals += cs.signals;
          lt.byStrategy[strat].rejected += cs.rejected;
          lt.byStrategy[strat].trades += cs.trades;
        }
        console.log(
          `[B79.0m.b2][SCAN_EVAL_DONE] tick=${tick.tickNumber} ` +
          `entered=${cycleCounters.pairsEntered} ` +
          `failed_market_hours=${cycleCounters.pairsFailedMarketHours} ` +
          `failed_global=${cycleCounters.pairsFailedGlobalFilter} ` +
          `failed_all_families=${cycleCounters.pairsFailedAllFamilies} ` +
          `passed_families=${cycleCounters.pairsPassedFamilies} ` +
          // B79.0m.b2: pattern path counters.
          `passed_pattern=${cycleCounters.pairsPassedPattern} ` +
          `failed_pattern=${cycleCounters.pairsFailedPattern} ` +
          `pattern_reject_min_history=${cycleCounters.patternRejectByMinHistory} ` +
          `pattern_fanout=${cycleCounters.patternFanOut} ` +
          `family_fanout_sum=${cycleCounters.familyFanOutSum} ` +
          `strats_evaled=${cycleCounters.strategiesEvaluated} ` +
          `strategy_nulls=${cycleCounters.strategyNulls} ` +
          `signals=${cycleCounters.signalsGenerated} ` +
          `archived=${cycleCounters.signalsArchived} ` +
          `archive_failures=${cycleCounters.archiveFailures} ` +
          `sqe_rejects=${cycleCounters.signalsRejectedBySQE} ` +
          `trades_opened=${cycleCounters.tradesOpened} ` +
          `errors=${cycleCounters.errors}`,
        );
      }

      const cycleDurationMs = Date.now() - cycleStart;
      this.diag.lastCycleDurationMs = cycleDurationMs;
      this.diag.cyclesCompleted++;
      // B-NEW-34: pairs* counters now reflect OHLC-history-floor semantics.
      // readyForEval = pairs that passed min_ohlc_history_bars and entered the
      // eval pipeline. insufficientHistory = rotation members skipped because
      // not enough bars yet. Empty universe / hostile-sim leave both at 0.
      this.diag.pairsFreshLastCycle = readyForEval;
      this.diag.pairsStaleLastCycle = insufficientHistory;
      this.diag.pairsScannedLastCycle = readyForEval;

      console.log(
        `[B79.0a][SCAN_CYCLE_DONE] tick=${tick.tickNumber} duration_ms=${cycleDurationMs} ` +
        `db_roundtrip_ms=${dbDurationMs} attempted=${symbolList.length} ` +
        `pairs_scanned=${this.diag.pairsScannedLastCycle} insufficient_history=${this.diag.pairsStaleLastCycle}`,
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
