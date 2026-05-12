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
import { isPairDataFresh } from '../../utils/data-freshness.js';
import { XSTOCK_SPOT_SYMBOLS, XSTOCK_SPOT_24_7_SYMBOLS } from '../../../shared/asset-classes.js';
import { db } from '../../db.js';
import { sql } from 'drizzle-orm';

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
}

interface TickerSnapRow extends Record<string, unknown> {
  symbol: string;
  price: string;        // numeric stored as string in pg
  volume24h: string;    // 24h rolling SHARE volume from Kraken ticker; multiply by price for USD
  capturedAt: Date;
}

class XstockSpotScannerService {
  private isRunning = false;
  private isScanning = false;
  private clockTickHandler: ((tick: ClockTick) => Promise<void>) | null = null;

  // ── Per-cycle rotation (Kyle directive 2026-05-12) ──
  // Each cycle scans 70 rotated symbols + 5 pinned benchmarks = 75 total.
  // Sequential OHLC fetch at ~150ms/pair × 75 = ~11s — clean margin under the
  // 25s SCAN_TIMEOUT_MS. Full universe (~260 xstocks) covered every 3.5 cycles
  // = ~1m 45s sweep. Trade-off: each pair evaluated ~every two 1-min candles
  // instead of every cycle. Accepted for VTS observation phase. Benchmarks
  // pinned every cycle because index-level signals matter at all times.
  private static readonly CYCLE_BATCH_SIZE = 75;
  private static readonly PINNED_BENCHMARKS: readonly string[] = [
    'SPY/USD', 'QQQ/USD', 'IWM/USD', 'DIA/USD', 'GLD/USD',
  ];
  private rotationCursor = 0;

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
    lastUniverseSize: 0,
    lastArcaOpen: false,
    hostileSimActive: false,
    lastCycleEvalCounters: null,
    evalCountersLifetime: null,
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

      // B79.0c (per-symbol predicate) + B79.0L (unified weekend close):
      // Three states the universe-filter handles:
      //   1. Inside unified Fri 20:00 ET → Sun 20:00 ET weekend close: ALL
      //      xStocks closed (including the extended-hours set). Cycle scans
      //      empty universe — recorded as cycle-skipped for legacy counter.
      //   2. Outside weekend close, ARCA open: full xstock universe scans.
      //   3. Outside weekend close, ARCA closed (e.g., Mon-Thu overnight):
      //      restrict to extended-hours set (XSTOCK_SPOT_24_7_SYMBOLS) which
      //      remain open continuously during the work-week window.
      // Hostile-sim bypasses entirely so the no-shed posture test can run
      // regardless of when (e.g. weekend) Step 7+8 verify happens.
      const arcaOpenSampleSym = 'NON_24_7_SAMPLE/USD'; // any non-extended sym → ARCA schedule (not extended-hours short-circuit)
      const arcaOpen = isXstockMarketOpenUTC(arcaOpenSampleSym);
      // B79.0L: probe an extended-hours name to detect the unified weekend
      // close. If AAPL/USD is also closed, we're inside the Fri-Sun close
      // window — extended-hours set is also closed; scan empty universe.
      const extendedHoursOpen = isXstockMarketOpenUTC('AAPL/USD');
      const insideUnifiedWeekendClose = !arcaOpen && !extendedHoursOpen;

      // Build per-cycle universe.
      let symbolList: string[];
      if (this.diag.hostileSimActive) {
        symbolList = Array.from(XSTOCK_SPOT_SYMBOLS); // hostile-sim always full
      } else if (insideUnifiedWeekendClose) {
        symbolList = []; // B79.0L: ALL xStocks closed during Fri-Sun window
      } else if (arcaOpen) {
        symbolList = Array.from(XSTOCK_SPOT_SYMBOLS);
      } else {
        symbolList = Array.from(XSTOCK_SPOT_24_7_SYMBOLS); // ARCA closed but extended-hours open
      }
      this.diag.lastUniverseSize = symbolList.length;
      this.diag.lastArcaOpen = arcaOpen;

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
      if (!arcaOpen && !this.diag.hostileSimActive) {
        this.diag.cyclesSkippedMarketClosed++; // legacy counter, retained for compat
        if (this.diag.cyclesSkippedMarketClosed % 30 === 1) {
          if (insideUnifiedWeekendClose) {
            console.log(`[B79.0L][SCAN_WEEKEND_CLOSE] tick=${tick.tickNumber} universe=0 (Fri 8PM ET → Sun 8PM ET unified window)`);
          } else {
            console.log(`[B79.0c][SCAN_EXTENDED_ONLY] tick=${tick.tickNumber} universe=${symbolList.length} (10 names; ARCA closed but extended-hours names open)`);
          }
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

      // Batched DB read — Langston rev 2 #1 commitment.
      const dbStart = Date.now();
      // Drizzle's sql template can't bind a JS array directly to PG ANY().
      // XSTOCK_SPOT_SYMBOLS is a hardcoded const Set (not user input) so
      // literal-list injection is safe and avoids the parameter-binding pitfall.
      const symbolListSql = symbolList.map((s) => `'${s.replace(/'/g, "''")}'`).join(',');
      // Constrain to last 5 minutes — freshness gate rejects anything > 90s
      // old anyway, so wider scans waste time + risk statement timeout on
      // the 13-partition table. 5min window covers any reasonable freshness
      // ceiling future B79.x calibration might pick.
      const result = await db.execute<TickerSnapRow>(sql`
        SELECT DISTINCT ON (symbol)
          symbol::text AS symbol,
          last::text AS price,
          COALESCE(volume_24h, 0)::text AS "volume24h",
          captured_at AS "capturedAt"
        FROM xstock_spot_ticker_snap
        WHERE captured_at > NOW() - INTERVAL '5 minutes'
          AND symbol IN (${sql.raw(symbolListSql)})
        ORDER BY symbol, captured_at DESC
      `);
      const dbDurationMs = Date.now() - dbStart;
      // Langston Step 4 Finding #7 nit: defensive cast hardened with runtime
      // Array guard so a drizzle shape regression fails loudly instead of
      // silently iterating over a non-array.
      const rawRows = (result as any).rows ?? (result as unknown as TickerSnapRow[]);
      if (!Array.isArray(rawRows)) {
        throw new Error(`[B79.0a] xstock_spot_ticker_snap query returned non-array shape; got ${typeof rawRows}`);
      }
      const rows = rawRows;

      // Per-pair freshness gate + telemetry.
      const xstockInstances = getXstockSpotInstances();
      const now = Date.now();
      let freshCount = 0;
      let staleCount = 0;
      const freshSymbols: Array<{ symbol: string; price: number; volume24hShares: number }> = [];
      for (const row of rows as TickerSnapRow[]) {
        const lastTickMs = new Date(row.capturedAt).getTime();
        const fresh = await isPairDataFresh(row.symbol, 'xstock_spot', lastTickMs, now);
        if (fresh) {
          freshCount++;
          freshSymbols.push({
            symbol: row.symbol,
            price: parseFloat(row.price),
            volume24hShares: parseFloat(row.volume24h ?? '0'),
          });
        } else {
          staleCount++;
        }
      }

      // ════════════════════════════════════════════════════════════════════
      // B79.0m.b — route fresh pairs into VTS evaluation pipeline.
      // For each fresh xstock pair: fetch OHLC → global filter → IMF →
      // MCE → strategy detect → SQE → archive → register-open-trade.
      // Hostile-sim bypasses (no eval during artificial sleep).
      // ════════════════════════════════════════════════════════════════════
      if (!this.diag.hostileSimActive && freshSymbols.length > 0) {
        const { evaluateXstockPairForVTS, fetchXstockOHLC, makeEmptyXstockCycleCounters, loadXstockFilterConfigs } =
          await import('./eval-cycle.js');
        const cycleCounters = makeEmptyXstockCycleCounters();
        // Pre-load 7 screener_filters rows ONCE per cycle (mirrors crypto
        // fx5-scanner.ts:737-815). Pre-bundle, each filter function did its
        // own per-pair DB lookup — for a 234-fresh-pair cycle that was 1638
        // redundant Supabase round-trips, saturating the connection pool and
        // dragging cycle time from ~22s to 280s.
        const cycleConfigs = await loadXstockFilterConfigs('paper');
        for (const { symbol, price, volume24hShares } of freshSymbols) {
          if (!Number.isFinite(price) || price <= 0) continue;
          const ohlc = await fetchXstockOHLC(symbol, 120);
          if (ohlc.length < 60) continue; // global-filter min-history floor
          // 24h dollar-volume = Kraken-reported rolling 24h share volume × last price.
          // Source: xstock_spot_ticker_snap.volume_24h (already a 24h rolling
          // window from the exchange ticker, NOT current-bar). Multiplied by
          // last price to land in USD so global/pattern min_volume thresholds
          // can compare apples-to-apples (DB thresholds are USD per Langston
          // B-NEW-1 review 2026-05-12). When the snap has no volume_24h yet
          // (cold-start, brand-new symbol) we pass 0 and the gate Layer-1-passes
          // per the global-filter contract (caller=0 → skip-check).
          const volume24hUSD = Number.isFinite(volume24hShares) && volume24hShares > 0
            ? volume24hShares * price
            : 0;
          await evaluateXstockPairForVTS(symbol, ohlc, price, volume24hUSD, 'paper', cycleCounters, cycleConfigs);
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
            setupHashDeduped: 0,
            archiveFailures: 0,
            globalFilterCounters: {}, imfFilterCounters: {},
            imfPerMetric: { failedLQ: 0, failedVN: 0, failedCorr: 0, failedDI: 0, passed: 0, total: 0 },
            imfPerFamily: {},
            familyFanOutSum: 0, familyQualifiedUnique: 0, benchmarksRemoved: 0, vtsDestination: 0,
            byStrategyNullReasons: {}, nullReasonAggregate: {},
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
