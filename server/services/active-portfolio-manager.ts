import { storage } from '../storage';
import { ActiveExecutionEngine } from './active-execution-engine';
import { MicroExecutionService } from './micro-execution-service';
import { KrakenService } from '../exchanges/kraken/kraken.js';
import { registerEngine, registerMicroService } from './mode-registry';
import { SignalOrchestrator } from './signal-orchestrator';
import type { StrategySignal } from './strategy-engine';
import { i1TradeLifecycleDiagnostics } from './i1-trade-lifecycle-diagnostics.js';
import { livePricingAdapter, type PriceProducer } from './live-pricing-adapter.js';

interface PortfolioMetrics {
  totalTrades: number;
  openPositions: number;
  closedTrades: number;
  totalPnl: number;
  totalPnlPercent: number;
  winRate: number;
  avgReturn: number;
  avgHoldingTime: number;
  maxDrawdown: number;
  sharpeRatio: number;
  profitFactor: number;
  byStrategy: Array<{
    strategy: string;
    count: number;
    winRate: number;
    avgReturn: number;
    totalPnl: number;
  }>;
}

interface PortfolioHealth {
  status: 'healthy' | 'warning' | 'critical';
  issues: string[];
  metrics: {
    drawdownPercent: number;
    exposurePercent: number;
    openPositionCount: number;
  };
}

export class ActivePortfolioManager {
  private mode: 'live' | 'paper'; // Phase 27.F.13.O: Mode-based (not per-user)
  private userId: string; // Phase 27.F.13.O: Kept for audit/logging only
  private executionEngine: ActiveExecutionEngine;
  private microExecutionService: MicroExecutionService; // Phase 27.F.14.MICRO
  private kraken: KrakenService;
  private isRunning: boolean = false;
  private watchlistRefreshInterval: NodeJS.Timeout | null = null;
  private signalOrchestrator: SignalOrchestrator | null = null; // Phase 37: Signal generation
  private isRefreshingWatchlist: boolean = false; // Phase 41F-E: Prevent overlapping refresh cycles
  
  // Phase 8.8.3-I2: Hard-stop freeze flag - prevents new trades during stop
  private isStopInProgress: boolean = false;
  
  // Portfolio-level guardrails
  private readonly MAX_DRAWDOWN_PERCENT = 20; // Max 20% drawdown
  private readonly MAX_OPEN_POSITIONS = 10; // Max 10 concurrent positions
  private readonly MAX_PORTFOLIO_EXPOSURE_PERCENT = 80; // Max 80% capital deployed
  private readonly WATCHLIST_REFRESH_INTERVAL_MS = 30 * 1000; // 30 seconds

  constructor(mode: 'live' | 'paper', userId?: string) {
    this.mode = mode;
    this.userId = userId || 'system'; // Fallback for backward compatibility
    // P19-B3b: ActiveExecutionEngine is mode-based — the legacy userId constructor
    // arg was dropped (engine no longer user-coupled). Pass mode only.
    this.executionEngine = new ActiveExecutionEngine(mode);
    this.microExecutionService = new MicroExecutionService(mode); // Phase 27.F.14.MICRO
    this.kraken = new KrakenService();
    
    // Phase 27.F.14.MICRO: Link micro-service to main execution engine
    this.microExecutionService.setPaperEngine(this.executionEngine);
    
    // Phase 8.8.3-B9.FIX-WS-START: Diagnostic log on construction
    console.log('[DEBUG-B9][MANAGER_CREATED]', {
      createdAt: new Date().toISOString(),
      mode: this.mode,
      userId: this.userId,
    });
  }
  
  // Phase 8.8.3-B9.FIX-WS-START: Expose isRunning state for control flow checks
  getIsRunning(): boolean {
    return this.isRunning;
  }

  // Phase 8.8.3-I2: Hard-stop freeze flag accessors
  markStopInProgress(): void {
    this.isStopInProgress = true;
    console.log(`[8.8.3-I2][STOP_FLAG_SET] Stop in progress flag set for mode=${this.mode}`);
  }

  clearStopInProgress(): void {
    this.isStopInProgress = false;
    console.log(`[8.8.3-I2][STOP_FLAG_CLEARED] Stop in progress flag cleared for mode=${this.mode}`);
  }

  getStopInProgress(): boolean {
    return this.isStopInProgress;
  }

  // Phase 8.8.3-I7-ROOT-FIX-2: Expose engine and orchestrator for diagnostics
  getEngine(): any {
    return this.executionEngine;
  }

  getOrchestrator(): any {
    return this.signalOrchestrator;
  }

  // Phase 8.8.3-I7-PM-FOCUS: Status snapshot for diagnostics
  // Timestamps are now pulled from execution engine directly
  
  getStatusSnapshot(): {
    mode: 'paper' | 'live';
    isRunning: boolean;
    isStopped: boolean;
    openPositionsCount: number | null;
    lastTickAt: string | null;
    lastExitEvalAt: string | null;
  } {
    // Phase 8.8.3-I7-PM-FOCUS: Get timestamps from engine snapshot
    const engineSnapshot = this.executionEngine?.getEngineStatusSnapshot();
    
    return {
      mode: this.mode,
      isRunning: this.isRunning,
      isStopped: this.isStopInProgress || !this.isRunning,
      openPositionsCount: null, // Will be populated by caller from storage
      lastTickAt: engineSnapshot?.lastCycleAtIso || null,
      lastExitEvalAt: engineSnapshot?.lastEvaluateAtIso || null,
    };
  }

  async start(source: 'api' | 'internal' | 'unknown' = 'unknown'): Promise<void> {
    // Phase 8.8.3-B9.FIX-WS-START: Diagnostic log on start
    console.log('[DEBUG-B9][MANAGER_START_CALLED]', {
      mode: this.mode,
      userId: this.userId,
      wasAlreadyRunning: this.isRunning,
      source,
    });
    
    if (this.isRunning) {
      console.log(`[PaperPortfolio:${this.userId}] Already running`);
      return;
    }

    // Phase 8.8.3-B7.B: Bypass legacy max drawdown check for V3 paper mode
    // The legacy portfolio health check uses historical data that may carry over
    // from previous sessions. For V3 paper mode, hard reset clears positions/trades
    // at start, so we skip this check. The V3 guardrail system (Core Four) handles
    // real-time risk management during trading instead.
    if (this.mode === 'paper') {
      console.log(`[B7.B][PaperPortfolio:${this.userId}] Skipping legacy portfolio health check for V3 paper mode`);
      // Log health status for observability, but don't block start
      const health = await this.checkPortfolioHealth();
      console.log(`[B7.B][PaperPortfolio:${this.userId}] Portfolio health status (informational only):`, {
        status: health.status,
        issues: health.issues,
        metrics: health.metrics
      });
    } else {
      // Live mode retains the legacy check for safety
      const health = await this.checkPortfolioHealth();
      if (health.status === 'critical') {
        console.error(`[PaperPortfolio:${this.userId}] Cannot start - portfolio in critical state:`);
        health.issues.forEach(issue => console.error(`  - ${issue}`));
        throw new Error(`Portfolio in critical state: ${health.issues.join(', ')}`);
      }
    }

    this.isRunning = true;
    this.isStopInProgress = false; // Phase 8.8.3-I7-PM-FOCUS: Clear stop flag on start
    
    console.log(`[I7-PM-FOCUS][START] mode=${this.mode} sessionId=${this.userId}`);
    console.log(`[PaperPortfolio:${this.userId}] Starting paper portfolio manager`);

    // Phase 27.F.14.MICRO: Register engines with mode registry
    registerEngine(this.mode, this.executionEngine);
    registerMicroService(this.mode, this.microExecutionService);

    // Start execution engine with provenance tracking (A3.R9.0.B)
    await this.executionEngine.start(source);

    // Phase 27.F.14.MICRO: Start micro-execution service
    await this.microExecutionService.start();

    // Phase 37: Start signal orchestrator for automatic signal generation
    // P19-B4a C5: the hardcoded enabledStrategies allowlist was DISPOSED (rule-18).
    // Per-asset-class strategy enablement is now DB-resolved at the orchestrator's
    // buildSizedSignalForStrategy chokepoint (strategy_gates); per-symbol selection is
    // regime-driven. The orchestrator no longer accepts an enabledStrategies config.
    console.log(`[PaperPortfolio:${this.userId}] Starting signal orchestrator...`);
    this.signalOrchestrator = new SignalOrchestrator({
      mode: this.mode,
      evaluationIntervalMs: 30000, // 30 seconds
    });

    // [8.8.4-C.10][FLOW_FIX] Dual-path removed - signals flow through RTB queue only
    // SignalOrchestrator → SQE → RTB Queue → TCL → Execution
    // No direct processSignal() call - RTB promotion handles execution
    await this.signalOrchestrator.start(async (signal: StrategySignal) => {
      // Log signal reception but do NOT forward directly to execution engine
      // Signals are queued via SQE in SignalOrchestrator, then promoted by TCL
      console.log(`[8.8.4-C.10][FLOW_FIX] Signal received for ${signal.symbol} - queued via RTB (not direct execution)`);
    });

    console.log(`[PaperPortfolio:${this.userId}] Signal orchestrator started successfully`);

    // REB 8.8.3-D-FIX: Watchlist refresh cycle DISABLED
    // Strategy evaluation now uses Active Filtered Pool from FX5 scanner
    // Watchlist is no longer used as a trading input
    console.log(`[PaperPortfolio:${this.userId}] Watchlist refresh DISABLED - using Active Filtered Pool for trading`);
  }

  async stop(): Promise<void> {
    // Phase 8.8.3-B9.FIX-WS-START: Diagnostic log on stop
    console.log('[DEBUG-B9][MANAGER_STOP_CALLED]', {
      mode: this.mode,
      userId: this.userId,
      wasRunning: this.isRunning,
    });
    
    if (!this.isRunning) {
      return;
    }

    // Phase 8.8.3-I7-PM-FOCUS: Set stop flag FIRST to prevent late trades
    this.isStopInProgress = true;
    this.isRunning = false;
    
    console.log(`[I7-PM-FOCUS][STOP] mode=${this.mode} reason=user_request`);
    console.log(`[PaperPortfolio:${this.userId}] Stopping paper portfolio manager`);

    // Phase 37: Stop signal orchestrator
    if (this.signalOrchestrator) {
      console.log(`[PaperPortfolio:${this.userId}] Stopping signal orchestrator...`);
      this.signalOrchestrator.stop();
      this.signalOrchestrator = null;
      console.log(`[PaperPortfolio:${this.userId}] Signal orchestrator stopped`);
    }

    // Stop watchlist refresh
    if (this.watchlistRefreshInterval) {
      clearInterval(this.watchlistRefreshInterval);
      this.watchlistRefreshInterval = null;
      console.log(`[PaperPortfolio:${this.userId}] Stopped watchlist refresh`);
    }

    // Phase 27.F.14.MICRO: Stop micro-execution service
    await this.microExecutionService.stop();

    // Stop execution engine
    await this.executionEngine.stop();
  }

  /**
   * Phase 8.8.3: Force-close all open positions on stop (Hard Stop behavior)
   * This ensures no ghost trades survive across stop/start cycles.
   * Uses real market prices from LivePricingAdapter where available.
   * 
   * @returns Summary of closure results for diagnostics
   */
  /**
   * ⛔⛔ B-FEED-MISMATCH-FIX P2 — THE ONE FLATTEN PATH. Every operator/stop flatten (engine stop, kill switch,
   * close-all, stranded clear) closes ONE position through here, so all of them get the order placer's walk,
   * the fee, the provenance stamps and the C3 non-filled rule — none books its own price any more.
   *
   * The price it REQUESTS, in order — and never the entry price:
   *   1. a quote from `getPriceWithFallback` (any source but `no_reliable_price`, INCLUDING a `last_known_good`
   *      re-serve — its `observedAt` travels into the row, so its age is on the record, not assumed);
   *   2. else the best bid of the depth snapshot the fill will walk (producer = the class's walk producer);
   *   3. else NOTHING — the position is LEFT OPEN, reported `left_open`, and an alert names it. The stop flow
   *      must then exempt it from the orphan delete (active-engine-service), or it would be deleted and booked
   *      at entry by the reconciler two lines later (Langston Step-1 BLOCKER-1).
   * The request price matters only for a COLD book (booked minus the penalty, stamped `synthetic_reference`,
   * fenced out of learning) and as the slippage reference; a book with bids is WALKED whatever was requested.
   * A close that returns without closing (C3) leaves the position in place — detected here by re-reading it,
   * because `closePosition` returns void.
   */
  private async _flattenOne(
    position: { id: string; symbol: string; assetClass?: string | null },
    tag: string,
  ): Promise<{ status: 'closed' | 'left_open' | 'failed'; reason?: string }> {
    const { getDepthSnapshot } = await import('./execution/depth-source.js');
    const { asValidAssetClass, safeResolveAssetClass } = await import('../../shared/asset-classes.js');
    const cls = asValidAssetClass(position.assetClass) ?? safeResolveAssetClass(position.symbol, 'kraken');

    let price: number | null = null;
    let provenance: { producer: PriceProducer; source: string; observedAtMs: number | null } | null = null;
    let label = '';
    const quote = await livePricingAdapter.getPriceWithFallback(position.symbol, 5000);
    if (quote && quote.price && quote.source !== 'no_reliable_price') {
      price = quote.price;
      provenance = { producer: quote.producer, source: quote.source, observedAtMs: quote.observedAt };
      label = `${tag}_${quote.source}`;
    } else if (cls) {
      const snap = await getDepthSnapshot(position.symbol, cls);
      const bestBid = snap?.bids?.[0]?.price;
      if (snap && typeof bestBid === 'number' && bestBid > 0) {
        price = bestBid;
        provenance = {
          producer: cls === 'xstock_spot' ? 'xstock_ticker_snap_walk' : 'crypto_ws_book_walk',
          source: cls === 'xstock_spot' ? 'kraken_equities_ws' : 'kraken_ws',
          observedAtMs: Date.now() - snap.ageMs,
        };
        label = `${tag}_book_best_bid`;
      }
    }

    if (price === null || provenance === null) {
      console.error(`[B-FEED-MISMATCH-FIX][FLATTEN_LEFT_OPEN] ${position.symbol} pos=${position.id} (${tag}): no quote and no book — NOT closed, NOT deleted`);
      try {
        const { addAlert } = await import('./system-alerts.js');
        await addAlert({
          triggers_at: new Date(),
          category: 'breakage',
          severity: 'warning',
          title: `Flatten left ${position.symbol} OPEN — no observed price at all`,
          body: `A ${this.mode} flatten (${tag}) could not close ${position.symbol}: no quote of any age and no order-book `
            + `bid exist, so there is no observed price to book. The position was deliberately LEFT OPEN rather than booked `
            + `at its entry price (B-FEED-MISMATCH-FIX P2) and is exempt from the stop-time orphan delete. It must be `
            + `closed once a price exists. DISPOSITION: RESOLVE, do not ACK.`,
          dedupe_key: `flatten-left-open-${this.mode}-${position.symbol}`,
        });
      } catch (alertErr) {
        console.error(`[B-FEED-MISMATCH-FIX][FLATTEN_LEFT_OPEN] addAlert failed for ${position.symbol}:`, alertErr);
      }
      return { status: 'left_open', reason: 'no observed price (no quote, no book)' };
    }

    const result = await this.executionEngine.forceClosePosition(position.id, price, label, provenance);
    if (!result.success) return { status: 'failed', reason: result.error };
    const stillOpen = await storage.getActiveOpenPosition(this.mode, position.id);
    if (stillOpen) {
      // The close seam refused (C3) — e.g. a cold book with no reference. Report it honestly.
      return { status: 'left_open', reason: 'close refused by the fill contract (position still open)' };
    }
    return { status: 'closed' };
  }

  async forceCloseAllOpenPositionsOnStop(): Promise<{
    closedCount: number;
    failedCount: number;
    skippedCount: number;
    details: Array<{ positionId: string; symbol: string; status: 'closed' | 'failed' | 'skipped' | 'left_open'; reason?: string }>;
  }> {
    console.log('[DEBUG-B9][MANAGER_FORCE_CLOSE_ON_STOP][START]', {
      mode: this.mode,
      userId: this.userId,
    });

    const openPositions = await storage.getActiveOpenPositions(this.mode);

    if (!openPositions || openPositions.length === 0) {
      console.log('[DEBUG-B9][MANAGER_FORCE_CLOSE_ON_STOP][NO_OPEN_POSITIONS]');
      return {
        closedCount: 0,
        failedCount: 0,
        skippedCount: 0,
        details: [],
      };
    }

    console.log('[DEBUG-B9][MANAGER_FORCE_CLOSE_ON_STOP][POSITIONS_FOUND]', {
      count: openPositions.length,
      symbols: openPositions.map(p => p.symbol),
    });

    const details: Array<{ positionId: string; symbol: string; status: 'closed' | 'failed' | 'skipped' | 'left_open'; reason?: string }> = [];
    let closedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (const position of openPositions) {
      try {
        console.log('[DEBUG-B9][MANAGER_FORCE_CLOSE_ON_STOP][CLOSE_POSITION]', {
          positionId: position.id,
          symbol: position.symbol,
          entryPrice: position.avgPrice,
        });

        // ⛔ B-FEED-MISMATCH-FIX P2 — ONE FLATTEN PATH, NO ENTRY-PRICE REQUEST. This loop used to request the
        // close at `position.avgPrice` when no quote existed, which made the recorded slippage equal the trade's
        // gross P&L with its sign inverted. `_flattenOne` resolves an OBSERVED price or leaves the position open.
        const outcome = await this._flattenOne(position, 'manual_stop');
        if (outcome.status === 'closed') {
          closedCount++;
          details.push({ positionId: position.id, symbol: position.symbol, status: 'closed', reason: outcome.reason });
        } else if (outcome.status === 'left_open') {
          skippedCount++;
          details.push({ positionId: position.id, symbol: position.symbol, status: 'left_open', reason: outcome.reason });
        } else {
          failedCount++;
          details.push({ positionId: position.id, symbol: position.symbol, status: 'failed', reason: outcome.reason });
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error('[ERROR][MANAGER_FORCE_CLOSE_ON_STOP][FAILED_TO_CLOSE]', {
          positionId: position.id,
          symbol: position.symbol,
          error: errorMessage,
        });
        failedCount++;
        details.push({ positionId: position.id, symbol: position.symbol, status: 'failed', reason: errorMessage });
      }
    }

    console.log('[DEBUG-B9][MANAGER_FORCE_CLOSE_ON_STOP][END]', {
      closedCount,
      failedCount,
      skippedCount,
      totalPositions: openPositions.length,
    });

    // [8.8.3-I1] Log hard stop summary for diagnostics
    const openPositionsRemaining = await storage.getActiveOpenPositions(this.mode);
    // B-BALANCE-TRUTH Step E (#618): counted in SQL. This previously fetched up to 1,000 full
    // rows and read `.length` off the array, so the count would have silently stopped counting
    // once the table outgrew that bound — and it fails in the direction that looks healthy.
    // Latent rather than live today (483 qualifying rows), but the crossing is months away, not
    // years, and Kyle's 15-slot paper directive is designed to shorten it.
    const tradesCount = await storage.getClosedTradesCount(this.mode);
    const session = await storage.getRunningEngineSession(this.mode);
    
    i1TradeLifecycleDiagnostics.logHardStopSummary({
      sessionId: session?.sessionId || 'unknown',
      openPositionsBefore: openPositions.length,
      positionsClosedByHardStop: closedCount,
      positionsRemainingOpen: openPositionsRemaining.length,
      dbCounts: {
        active_open_positions: openPositionsRemaining.length,
        closed_trades: tradesCount
      }
    });

    return { closedCount, failedCount, skippedCount, details };
  }

  private async refreshWatchlistData(): Promise<void> {
    // Phase 41F-E: Early exit if engine stopped (prevent writes after stop)
    if (!this.isRunning) {
      console.log(`[PaperPortfolio:${this.userId}] Skipping watchlist refresh - engine not running`);
      return;
    }
    
    // Phase 41F-E: Prevent overlapping refresh cycles if previous one still running
    if (this.isRefreshingWatchlist) {
      console.log(`[PaperPortfolio:${this.userId}] Skipping watchlist refresh - previous cycle still in progress`);
      return;
    }
    
    this.isRefreshingWatchlist = true;
    
    try {
      // Get the paper mode watchlist
      // P19-B3b: getWatchlist is mode-based — the legacy userId param was dropped.
      const watchlist = await storage.getWatchlist({ mode: 'paper' });
      
      if (watchlist.length === 0) {
        return; // No symbols to refresh
      }

      console.log(`[PaperPortfolio:${this.userId}] Refreshing ${watchlist.length} watchlist pairs`);

      // Refresh market data for each symbol
      for (const pair of watchlist) {
        try {
          // getTicker returns Record<string, KrakenTicker>
          const tickerResponse = await this.kraken.getTicker(pair.symbol);
          
          // Extract the ticker data (Kraken returns an object keyed by pair name)
          const tickerData = Object.values(tickerResponse)[0];
          
          if (!tickerData) {
            console.log(`[PaperPortfolio:${this.userId}] No ticker data for ${pair.symbol}`);
            continue;
          }

          // Parse raw Kraken ticker fields with null-safety
          // c[0] = last trade price, v[1] = 24h volume, p[1] = 24h VWAP
          // h[1] = 24h high, l[1] = 24h low
          const currentPrice = tickerData.c?.[0] ? parseFloat(tickerData.c[0]) : null;
          const volume24h = tickerData.v?.[1] ? parseFloat(tickerData.v[1]) : null;
          const vwap = tickerData.p?.[1] ? parseFloat(tickerData.p[1]) : null;
          const high24h = tickerData.h?.[1] ? parseFloat(tickerData.h[1]) : null;
          const low24h = tickerData.l?.[1] ? parseFloat(tickerData.l[1]) : null;
          
          // Calculate daily range percentage if we have both high and low
          const dailyRange = (high24h && low24h && low24h > 0)
            ? ((high24h - low24h) / low24h) * 100
            : null;

          // Update watchlist with fresh market data
          await storage.updateWatchlistPair(pair.id, {
            currentPrice: currentPrice?.toString() || null,
            vwap: vwap?.toString() || null,
            volume24h: volume24h?.toString() || null,
            dailyRange: dailyRange?.toString() || null,
            lastScanned: new Date()
          });
        } catch (error: any) {
          // Log but don't fail the whole refresh if one symbol fails
          console.log(`[PaperPortfolio:${this.userId}] Failed to refresh ${pair.symbol}: ${error.message}`);
        }
      }

      console.log(`[PaperPortfolio:${this.userId}] Watchlist refresh complete`);
    } catch (error) {
      console.error(`[PaperPortfolio:${this.userId}] Error refreshing watchlist:`, error);
    } finally {
      // Phase 41F-E: Always clear in-flight flag to allow next refresh
      this.isRefreshingWatchlist = false;
    }
  }

  async getPortfolioMetrics(): Promise<PortfolioMetrics> {
    const stats = await storage.getActiveEngineStats(this.mode);
    // B-BALANCE-TRUTH Step E (#618), Langston-ruled CONVERT-NOW: the 1,000-row cap is gone and
    // these four are summed in SQL over the whole closed set. The cap was LATENT here, not
    // biting (483 qualifying rows) -- so no displayed number moves today, and all four were
    // verified against the deployed endpoint to floating-point precision before the change.
    //
    // ★ THE BRANCH LOGIC BELOW IS THE THREE HELPERS' OWN, MOVED RATHER THAN REWRITTEN. Their
    // edge cases are load-bearing and easy to get subtly wrong -- profit factor is Infinity on
    // gains-with-no-losses but 0 on neither, Sharpe returns 0 on a zero deviation instead of
    // dividing, drawdown throws rather than accept a fictional denominator (B8.2). Re-deriving
    // them in SQL would have meant two statements of one rule, which is the divergence class
    // this batch exists to delete, so SQL does the summing and the branches stay in TypeScript.
    const c = await storage.getPortfolioMetricComponents(this.mode);
    const startingCapital = await this.getStartingCapitalOrThrow();

    // was calculateMaxDrawdown() -- same guard: a real denominator or nothing (P19-B8.2).
    let maxDrawdown = 0;
    if (c.rowCount > 0) {
      if (!(startingCapital > 0)) {
        throw new Error('[B8.2] portfolio metrics require a real startingCapital > 0');
      }
      maxDrawdown = (c.maxDrawdownAbs / startingCapital) * 100;
    }

    // was calculateSharpeRatio() -- 0 when there is nothing to measure or no dispersion.
    const sharpeRatio = (c.rowCount === 0 || c.returnsCount === 0 || !(c.stdDevPop > 0))
      ? 0
      : c.avgReturn / c.stdDevPop;

    // was calculateProfitFactor() -- Infinity is MEANINGFUL here (gains, zero losses), not a bug.
    const profitFactor = c.rowCount === 0
      ? 0
      : (c.grossLoss > 0 ? c.grossProfit / c.grossLoss : (c.grossProfit > 0 ? Infinity : 0));

    const totalCapitalDeployed = c.capitalDeployed;
    const totalPnlPercent = totalCapitalDeployed > 0 
      ? (stats.totalPnl / totalCapitalDeployed) * 100 
      : 0;

    return {
      totalTrades: stats.totalTrades,
      openPositions: stats.openPositions,
      closedTrades: stats.closedTrades,
      totalPnl: stats.totalPnl,
      totalPnlPercent,
      winRate: stats.winRate,
      avgReturn: stats.avgReturn,
      avgHoldingTime: stats.avgHoldingTime,
      maxDrawdown,
      sharpeRatio,
      profitFactor,
      byStrategy: stats.byStrategy
    };
  }

  async checkPortfolioHealth(): Promise<PortfolioHealth> {
    const stats = await storage.getActiveEngineStats(this.mode);
    const trades = await storage.getClosedTrades(this.mode, { limit: 1000, closedOnly: true });
    const openPositions = await storage.getActiveOpenPositions(this.mode);

    const issues: string[] = [];
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';

    // P19-B8.2: exposure/drawdown percentages are computed against the REAL
    // persisted balance. The old hardcoded $10,000 denominator silently
    // understated exposure ~11x at a real $878 balance — the heat ceilings
    // (MAX_PORTFOLIO_EXPOSURE_PERCENT / MAX_DRAWDOWN_PERCENT) were comparing
    // against a fiction. Throws when no trustworthy balance exists (the engine
    // cannot legitimately be running in that state post-B8.2).
    const startingCapital = await this.getStartingCapitalOrThrow();

    // Check drawdown
    const maxDrawdown = this.calculateMaxDrawdown(trades, startingCapital);
    if (maxDrawdown >= this.MAX_DRAWDOWN_PERCENT) {
      issues.push(`Max drawdown ${maxDrawdown.toFixed(2)}% exceeds limit ${this.MAX_DRAWDOWN_PERCENT}%`);
      status = 'critical';
    } else if (maxDrawdown >= this.MAX_DRAWDOWN_PERCENT * 0.8 && status === 'healthy') {
      issues.push(`Drawdown ${maxDrawdown.toFixed(2)}% approaching limit ${this.MAX_DRAWDOWN_PERCENT}%`);
      status = 'warning';
    }

    // Check open positions count
    if (stats.openPositions >= this.MAX_OPEN_POSITIONS) {
      issues.push(`Open positions ${stats.openPositions} at maximum ${this.MAX_OPEN_POSITIONS}`);
      status = 'critical';
    } else if (stats.openPositions >= this.MAX_OPEN_POSITIONS * 0.8 && status === 'healthy') {
      issues.push(`Open positions ${stats.openPositions} approaching limit ${this.MAX_OPEN_POSITIONS}`);
      status = 'warning';
    }

    // Check portfolio exposure
    const totalExposure = openPositions.reduce((sum, pos) => {
      const posValue = parseFloat(pos.avgPrice) * parseFloat(pos.quantity);
      return sum + posValue;
    }, 0);

    const exposurePercent = (totalExposure / startingCapital) * 100;

    if (exposurePercent >= this.MAX_PORTFOLIO_EXPOSURE_PERCENT) {
      issues.push(`Portfolio exposure ${exposurePercent.toFixed(2)}% exceeds limit ${this.MAX_PORTFOLIO_EXPOSURE_PERCENT}%`);
      status = 'critical';
    } else if (exposurePercent >= this.MAX_PORTFOLIO_EXPOSURE_PERCENT * 0.8 && status === 'healthy') {
      issues.push(`Portfolio exposure ${exposurePercent.toFixed(2)}% approaching limit ${this.MAX_PORTFOLIO_EXPOSURE_PERCENT}%`);
      status = 'warning';
    }

    return {
      status,
      issues,
      metrics: {
        drawdownPercent: maxDrawdown,
        exposurePercent,
        openPositionCount: stats.openPositions
      }
    };
  }

  /**
   * ⛔ B-FEED-MISMATCH-FIX P3 — ROUTED THROUGH THE CANONICAL CLOSE. This used to write the mark straight into
   * `exit_price` (no book walk, no fee, gross P&L, accepting a stale `last_known_good`), and when no matching
   * trade row was found it DELETED the position anyway — a position vanished with no close row, no P&L and no
   * log (Langston, Step 2). Now each position goes through `_flattenOne` → `forceClosePosition` → `closePosition`,
   * whose delete runs only after the close row is written. The operator button (`POST /active-engine/close-all`)
   * is KEPT — rule 18 applies to the implementation, not the affordance. `reason` is logged; the row's
   * `close_reason` is `manual_stop`, as every flatten's is.
   */
  async closeAllPositions(reason: string = 'manual_close'): Promise<{ closed: number; leftOpen: number; failed: number }> {
    const openPositions = await storage.getActiveOpenPositions(this.mode);
    console.log(`[PaperPortfolio:${this.userId}] Closing all ${openPositions.length} positions - ${reason}`);
    let closed = 0, leftOpen = 0, failed = 0;
    for (const position of openPositions) {
      try {
        const outcome = await this._flattenOne(position, 'manual_close_all');
        if (outcome.status === 'closed') closed++;
        else if (outcome.status === 'left_open') leftOpen++;
        else failed++;
        console.log(`[B-FEED-MISMATCH-FIX][CLOSE_ALL] ${position.symbol}: ${outcome.status}${outcome.reason ? ` - ${outcome.reason}` : ''}`);
      } catch (error) {
        failed++;
        console.error(`[PaperPortfolio:${this.userId}] Error closing position ${position.symbol}:`, error);
      }
    }
    return { closed, leftOpen, failed };
  }



  // P19-B8.2 (OBJ-2, resume-hardening seam 2 of 2): the manager's own balance
  // read refuses — throws, zero writes — when no trustworthy persisted balance
  // exists. Post-B8.2 both start paths guarantee one, so this is defense-in-depth
  // against a legacy/corrupt state row reaching percentage math.
  private async getStartingCapitalOrThrow(): Promise<number> {
    const { getAnchorState } = await import('./portfolio-anchor-service.js');
    const anchorState = await getAnchorState(this.mode as 'paper' | 'live');
    if (!anchorState || !(anchorState.balance > 0)) {
      throw new Error(
        `[B8.2][${this.mode}] No trustworthy portfolio balance exists — refusing to compute ` +
        `exposure/drawdown percentages against an invented denominator. Start a session (Kraken-mirror) first.`
      );
    }
    return anchorState.balance;
  }

  private calculateMaxDrawdown(trades: any[], startingCapital: number): number {
    if (trades.length === 0) return 0;
    if (!(startingCapital > 0)) {
      throw new Error('[B8.2] calculateMaxDrawdown requires a real startingCapital > 0');
    }

    let peak = 0;
    let maxDrawdown = 0;
    let runningPnL = 0;

    // Sort by close time
    const sortedTrades = [...trades]
      .filter(t => t.closedAt)
      .sort((a, b) => new Date(a.closedAt!).getTime() - new Date(b.closedAt!).getTime());

    for (const trade of sortedTrades) {
      runningPnL += trade.pnl ? parseFloat(trade.pnl) : 0;
      
      if (runningPnL > peak) {
        peak = runningPnL;
      }
      
      const drawdown = peak - runningPnL;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    // Convert to percentage against the REAL starting capital (P19-B8.2 —
    // the hardcoded $10,000 denominator is gone; capital is passed in).
    return (maxDrawdown / startingCapital) * 100;
  }

  // Public getters for external access
  getExecutionEngine(): ActiveExecutionEngine {
    return this.executionEngine;
  }

  getStatus(): { isRunning: boolean; userId: string } {
    return {
      isRunning: this.isRunning,
      userId: this.userId
    };
  }
}
