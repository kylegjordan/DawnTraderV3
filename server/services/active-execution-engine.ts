/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.0E — Paper Execution Engine
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * DIRECTIVE 11.0E: FinalScore Unification
 * - Signal quality checks use FinalScore exclusively
 * - MIN_FINAL_SCORE threshold is the canonical quality gate
 * 
 * ============================================================================
 * PRICE PIPELINE DOCUMENTATION (Goal A1)
 * ============================================================================
 * 
 * This file documents how live prices flow from Kraken into active trade
 * exit evaluation and the Active Trades UI.
 * 
 * 1. PRICE SOURCE (Kraken WebSocket)
 *    - KrakenWebSocketAdapter connects to wss://ws.kraken.com
 *    - Subscribes to ticker channel for each active trade symbol
 *    - On tick arrival: calls livePricingAdapter.updateFromWebSocket(symbol, price)
 *    - Updates priceCache Map in LivePricingAdapter
 * 
 * 2. PRICE CACHING (LivePricingAdapter.priceCache)
 *    - Map<symbol, CachedPrice> where CachedPrice includes:
 *      { symbol, price, timestamp, source, cachedAt }
 *    - source can be: 'kraken_ws' | 'kraken_rest' | 'binance' | 'coingecko' | 'last_known_good'
 *    - Cache TTL is 1 second for open-trade symbols (CACHE_TTL_MS = 1000)
 * 
 * 3. ENGINE CONSUMPTION (checkOpenPositions)
 *    - Runs every 1.5 seconds via monitoringInterval
 *    - For each open position, calls:
 *        livePricingAdapter.getPriceWithFallback(symbol, 2000)
 *    - Uses WebSocket cache if fresh (≤2s)
 *    - Falls back to Kraken REST if cache stale
 *    - Evaluates SL/TP against fetched price
 * 
 * 4. API EXPOSURE (/api/active-engine/active-trades)
 *    - For each position, calls:
 *        livePricingAdapter.getPriceWithFallback(symbol, 5000)
 *    - Returns: currentPrice, priceSource, priceAgeMs
 *    - Frontend polls this endpoint every 10 seconds
 * 
 * 5. FRONTEND REFRESH (active-trades-v2.tsx)
 *    - Uses useQuery with refetchInterval: 10000 (10 seconds)
 *    - Displays currentPrice from API response
 * 
 * ============================================================================
 */

import { storage } from '../storage';
import { tradingModeToRunMode } from './run-mode-controller.js'; // ITEM-4 step 2: single-site mode map
import { PaperOrderPlacer } from './execution/order-placer.js'; // P19-B3a: typed order-placement port
import type { OrderPlacer } from './execution/types.js'; // P19-B3a: FillResult/port contract
import { KrakenService } from '../exchanges/kraken/kraken.js';
// B72 (2026-05-05): MONITOR_INTERVAL_MS + CONTINUOUS_PROMOTION_INTERVAL_MS
// moved to module='active_execution'.
import { getCachedNumberRequired } from './module-constants-service.js';
// B65.2: centralized exit-decision primitive shared with VTS
import { evaluateTECExit } from './tec-evaluator';
// P19-B4a (C4): top-level resolveAssetClass dropped — all sites now prefer the
// stamp (asValidAssetClass) then fall through to safeResolveAssetClass (skip on null).
import { asValidAssetClass, safeResolveAssetClass, type AssetClass } from '../../shared/asset-classes.js';
import { StrategyEngine, type StrategySignal, type TechnicalIndicators } from './strategy-engine';
import { checkGuardrailRisk, type TradeCandidate, type TradeSafetyResultCode } from './trade-safety';
import { buildSettingsFromGuardrails, calculateRiskAmount } from './guardrail-settings';
import type { TradingSettings, PriceData, InsertExecutionAttemptAudit, GuardrailsV2 } from '@shared/schema';
import { contextBridge } from './context-bridge';
import { activeFilterPool, type ActiveFilteredPair } from './active-filter-pool';
import { sizeActivePositionForSignal, validateActivePortfolioValue, type StrategyType } from './active-position-sizing';
// B67.3 follow-up: re-export the cohort-hash function under a clearer name for use
// at trade-open. Same FNV-1a hash the admission gate uses — keeping a single source.
import { assignCohortHash as assignCohortHashForPersistence } from './per-underlying-cap';
// B67.2.1: read regime confidence + macro modifier + phase from MCE at trade-open
import { getMarketContextEngine } from './market-context-engine';
import { aj16Diagnostic } from './aj16-rtb-diagnostic';
import { aj17DiagnosticRunner } from './aj17-diagnostic-runner';
import { aj18Diagnostic } from './aj18-rtb-diagnostic';
import { aj19bDiagnostic } from './aj19b-lifecycle-diagnostic';
import { aj19Diagnostic } from './aj19-max-position-diagnostic';
import { livePricingAdapter } from './live-pricing-adapter';
import { krakenWebSocketAdapter } from '../exchanges/kraken/kraken-websocket-adapter.js';
import { b4Diagnostics } from './b4-diagnostics.js';
import { b5SizingAudit } from './b5-sizing-audit.js';
import { i1RtbDiagnostics } from './i1-rtb-diagnostics-service.js';
import { i1TradeLifecycleDiagnostics } from './i1-trade-lifecycle-diagnostics.js';
import { rtbMetricsService, type OpenFailStage } from './rtb-metrics-service.js';

/**
 * P19-B6.5e: the typed result of an open attempt. Replaces `executeSimulatedTrade`'s
 * silent `void` + `executePromotedSignal`'s brittle trade-count-delta success inference.
 * Every post-guardrail early-exit now returns a labelled `{opened:false, stage, reason}`,
 * so a sized signal can NEVER again vanish unaccounted (the I3 invariant reconciles).
 */
export type OpenOutcome =
  | { opened: true; tradeId: string }
  | { opened: false; stage: OpenFailStage; reason: string };
import { normalizeToInternalSymbol, getKrakenRestPair } from '../markets/kraken-symbol-resolver.js';
import { priceTraceService } from './price-trace-service.js';
import { marketVolumeCache } from './market-volume-cache.js';
import { c5FinancialDiagnostics } from './c5-financial-diagnostics.js';
import { signalLifecycleAudit } from '../core/audit/signal_lifecycle_audit.js';
import { readyToBuyService } from '../core/rtb/ready_to_buy_service.js';
import { tclWatchdog } from '../core/rtb/tcl_watchdog.js';
import { eventBus, type TCLActivatedEvent, type TradeClosedEvent } from '../lib/event-bus.js';
import { dataAggregator } from './data-aggregator.js';
// P19-B4b.1: the flat-slippage constant is retired from the fill seam — the active
// paper fill now depth-walks the real book (Langston C-Q5: RNG-free, no magic %).
import { resolveFillDepthGateConfig } from './execution/depth-gate-config.js';
import {
  getDepthSnapshot,
  assessWarmth,
  assessSufficiency,
  recordDepthGateBlock,
  type DepthSnapshot,
} from './execution/depth-source.js';
// P19-B6.6 (#236): xStock price-discovery-liveness — the 2nd half of the fill-time
// "is the book real?" guard, called at the open seam AFTER the depth gate passes.
import { evaluateXstockPriceLiveness } from '../asset_classes/xstock_spot/price-liveness.js';
// B-4.5: fees are DB-governed per asset class — resolved per symbol at the
// fill sites via the single cost-model merge (no static fee field).
import { getFrictionForAssetClass } from '../core/math/cost-model.js';
// P19-B7.2c: the pending-maker hard-drop timeout (per-class, fail-hard, load-time invariant).
import { resolveMakerMaxPendingMs } from './maker-taker-config.js';
// P19-B7.2c (R3): the xStock hard-drop must not fire inside the weekend-closed window.
import { isXstockMarketOpenUTC } from '../asset_classes/xstock_spot/market-hours.js';
// P19-B7.2c: the shared PURE pending-maker fill/drop decision (paper+VTS parity — R2).
import { evaluatePendingMaker, makerFillPrice, isMarketableAtPlacement } from '../core/trading/pending-maker-logic.js';
import { covarianceEngine } from '../utils/covariance-engine.js';
import { recordPaperTrade, type PaperTradeRecord } from './vts-live-comparison-audit.js';
import { evaluateTradeExpectancy } from '../core/calculations/expectancy.js';
// HF9: applyGovernance + getGovernanceStateForUI removed (dead imports — never called in function body)
import { getCachedStability, computeGlobalStability } from '../core/governance/regime-stability.js';
import { isStrategyEligible, logGovernanceBlock } from '../core/governance/strategy-eligibility.js';
import { getStrategyDependency, type RegimeStability } from '../config/strategy-governance.js';
import { resolveStrategyMode, getModeOverlay, meetsConfidenceFloor, recordModeExecution, type StrategyMode, type StrategyModeOverlay } from '../core/governance/strategy-modes.js';

interface ExitCondition {
  type: 'target_hit' | 'stop_hit' | 'trailing_stop_hit' | 'max_holding_period' | 'guardrail' | 'manual_stop';
  price?: number;
  reason: string;
}

// Phase 8.8.3-AJ8: Session tracking for RTB metrics reset
// Metrics only count from session start - resetting when engine stops
const engineSessionStart: Map<string, Date | null> = new Map();

export function getEngineSessionStart(mode: 'live' | 'paper'): Date | null {
  return engineSessionStart.get(mode) || null;
}

export class ActiveExecutionEngine {
  private mode: 'live' | 'paper'; // Phase 27.F.15.B.2: Mode-based only, global per mode
  private isRunning: boolean = false;
  private isCycleRunning: boolean = false; // Re-entrancy guard
  private krakenService: KrakenService;
  private strategyEngine: StrategyEngine;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private priceHistory: Map<string, PriceData[]> = new Map();
  private lastCycleSummary: any = {}; // Phase 27.F.14.DIAG: Cache last cycle for telemetry
  // P19-B3a: typed order-placement boundary (paper = atomic slippage+fee fill). The ONLY
  // thing that differs paper↔live is HOW an order fills; see execution/types.ts + order-placer.ts.
  private readonly orderPlacer: OrderPlacer;

  // Configuration
  // P19-B4b.1: the flat SLIPPAGE_PERCENT (0.05%) is RETIRED from the fill seam — the
  // active paper fill depth-walks the real order book (no flat constant on the active
  // path; Langston C-Q5 RNG-free / no-magic-% discipline).
  // B-4.5: FEE_PERCENT static field RETIRED — per-class DB-resolved per symbol.
  private feePercentFor(symbol: string, assetClass?: AssetClass): number {
    // P19-B6.5d (OBJ-4): prefer the CARRIED stamp threaded by the caller (collision-correct
    // fee tier); safe-resolve from the symbol only as a fallback. Money-boundary leaf —
    // sites 7/8/9 skip BEFORE a position can open, so a null here (neither stamp nor resolve)
    // is a broken invariant (stamp lost between sizing and fill): assert-unreachable, never
    // silently return fee=0.
    const _cls = assetClass ?? safeResolveAssetClass(symbol, 'kraken');
    if (_cls === null) {
      throw new Error('[P19-B4a][C4][INVARIANT] feePercentFor reached with unclassifiable ' + symbol + ' — sites 7/8/9 should have skipped upstream (stamp lost between sizing and fill)');
    }
    return getFrictionForAssetClass(_cls).feeRateTaker * 100;
  }

  /**
   * P19-B4b.1 (#295): the 24/5 book-depth-sufficiency + warmth gate for an OPEN,
   * replacing the B4a-C3 RTH liquid-fill-window clock proxy. Per-class, DB-resolved,
   * FAIL-CLOSED: missing config / no book / stale book / thin book / insufficient
   * depth → block the open (the caller skips loudly). On pass, returns the depth
   * snapshot so the placer walks the SAME book the gate just measured (single fetch).
   */
  private async _evaluateOpenDepthGate(
    symbol: string,
    assetClass: AssetClass,
    orderNotional: number,
  ): Promise<{ pass: boolean; reason: string; snapshot: DepthSnapshot | null }> {
    const config = await resolveFillDepthGateConfig(assetClass);
    if (!config) return { pass: false, reason: 'depth_gate_config_missing', snapshot: null };
    const snapshot = await getDepthSnapshot(symbol, assetClass);
    const warmth = assessWarmth(snapshot, 'asks', config);
    if (!warmth.warm || !snapshot) return { pass: false, reason: warmth.reason, snapshot: null };
    const suff = assessSufficiency(snapshot, 'asks', orderNotional, config);
    if (!suff.sufficient) return { pass: false, reason: suff.reason, snapshot };
    return { pass: true, reason: 'ok', snapshot };
  }
  // B72: monitoring interval read at setInterval start from module='active_execution'.
  private get MONITOR_INTERVAL_MS(): number {
    return getCachedNumberRequired('active_execution', 'monitoring_interval_ms',
      { exchange: '*', assetClass: '*', strategy: '*', regime: '*' });
  }
  private readonly MAX_PRICE_HISTORY = 100; // Keep last 100 candles per symbol
  private readonly RTB_TTL_SECONDS = 30; // REB 8.8.3-I: RTB signals expire after one FX5 cycle (30 seconds)
  
  // Phase 8.8.3-B3.5: Diagnostic counter for price tick cadence verification
  private readonly MAX_PRICE_TICK_LOGS = 100;
  private priceTickLogs: Array<{ symbol: string; refreshedAt: string; diffMs: number }> = [];
  private lastPriceTickTime: Map<string, number> = new Map();

  // I7-ROOT-FIX: minimal engine status diagnostics
  private lastEvaluateAt: number | null = null;
  private lastCycleAt: number | null = null; // Phase 8.8.3-I7-PM-FOCUS: Track monitoring cycle tick
  private lastExitChecks: {
    symbol: string;
    slotNumber?: number;
    price: number;
    priceSource: string;
    evaluatedAt: string;
    triggeredExit: boolean;
  }[] = [];

  // Phase 8.8.4-C.12: Event handler references for cleanup
  private tclActivatedHandler: ((event: TCLActivatedEvent) => void) | null = null;
  private tradeClosedHandler: ((event: TradeClosedEvent) => void) | null = null;

  // Directive 8.8.8: Continuous promotion loop interval (30 seconds)
  private continuousPromotionInterval: NodeJS.Timeout | null = null;
  // B72: RTB-promotion loop interval from module='active_execution'.
  private get CONTINUOUS_PROMOTION_INTERVAL_MS(): number {
    return getCachedNumberRequired('active_execution', 'rtb_promotion_loop_interval_ms',
      { exchange: '*', assetClass: '*', strategy: '*', regime: '*' });
  }

  constructor(mode: 'live' | 'paper') {
    this.mode = mode;
    this.krakenService = new KrakenService();
    this.strategyEngine = new StrategyEngine();
    // P19-B4b.1: inject ONLY the per-class fee resolver — the placer depth-walks the
    // real book passed on each request (no flat slippage% to inject anymore), so the
    // port stays decoupled from this engine.
    this.orderPlacer = new PaperOrderPlacer((s, ac) => this.feePercentFor(s, ac)); // P19-B6.5d (OBJ-4): thread the carried class to the fill-fee resolver
  }

  /**
   * Phase 8.8.4-C.12: Bind event listeners for TCL activation and trade close
   * These events trigger RTB queue promotion checks
   */
  private bindTCLEventListeners(): void {
    // Handler for TCL_ACTIVATED - triggers first promotion check
    this.tclActivatedHandler = async (event: TCLActivatedEvent) => {
      if (event.mode !== this.mode) return;
      console.log(`[8.8.4-C.12][EVENT_RECEIVED] TCL_ACTIVATED for ${this.mode}, reason=${event.reason}`);
      await this.checkRtbPromotion();
    };

    // Handler for TRADE_CLOSED - triggers promotion when capacity freed
    this.tradeClosedHandler = async (event: TradeClosedEvent) => {
      if (event.mode !== this.mode) return;
      console.log(`[8.8.4-C.12][EVENT_RECEIVED] TRADE_CLOSED for ${this.mode}, symbol=${event.symbol}`);

      // P19-B6: daily loss-budget evaluation on every closed trade. TICK-DEFERRED (setImmediate,
      // not merely no-await) so it runs AFTER this event frame unwinds + any close-path locks
      // release — and FIRE-AND-FORGET so it can never block or throw into the close/event path.
      // The evaluator is gated on isEngineActive (dormant in VTS/passive) and self-guards
      // re-entrancy via the in-memory killInProgress latch (the kill flatten re-emits TRADE_CLOSED).
      const _dlbMode = this.mode;
      setImmediate(() => {
        void import('./daily-loss-budget.js')
          .then(({ evaluateDailyLossBudgetOnClose }) => evaluateDailyLossBudgetOnClose(_dlbMode))
          .catch((err: any) => console.error('[DailyLossBudget] hook dispatch error:', err?.message ?? err));
      });

      await this.checkRtbPromotion();
    };

    eventBus.onTCLActivated(this.tclActivatedHandler);
    eventBus.onTradeClosed(this.tradeClosedHandler);
    console.log(`[8.8.4-C.12][EVENT_BIND] Bound TCL_ACTIVATED and TRADE_CLOSED listeners for ${this.mode}`);

    // Directive 8.8.8: Start continuous promotion loop
    this.startContinuousPromotionLoop();
  }

  /**
   * Directive 8.8.8: Continuous Promotion Loop
   * Runs every 30 seconds to check for RTB promotion when TCL is active
   * Ensures signals are promoted even when no TRADE_CLOSED events occur
   */
  private startContinuousPromotionLoop(): void {
    if (this.continuousPromotionInterval) {
      clearInterval(this.continuousPromotionInterval);
    }

    this.continuousPromotionInterval = setInterval(async () => {
      if (!this.isRunning) return;

      const tclActive = tclWatchdog.isActive(this.mode);
      if (!tclActive) return;

      const openPositions = await storage.getPaperSimOpenPositions(this.mode);
      const modeSettings = await buildSettingsFromGuardrails(this.mode);
      const maxTrades = modeSettings.maxOpenTrades || 15;
      const openSlots = maxTrades - openPositions.length;

      const rtbCount = await readyToBuyService.getPoolSize(this.mode);

      if (openSlots > 0 && rtbCount > 0) {
        console.log(`[8.8.8][TCL_LOOP] ${openSlots} slots free, checking ${rtbCount} RTB signals for promotion`);
        await this.checkRtbPromotion();
      }
    }, this.CONTINUOUS_PROMOTION_INTERVAL_MS);

    console.log(`[8.8.8][TCL_LOOP] Started continuous promotion loop (${this.CONTINUOUS_PROMOTION_INTERVAL_MS / 1000}s interval) for ${this.mode}`);
  }

  /**
   * Directive 8.8.8: Stop continuous promotion loop
   */
  private stopContinuousPromotionLoop(): void {
    if (this.continuousPromotionInterval) {
      clearInterval(this.continuousPromotionInterval);
      this.continuousPromotionInterval = null;
      console.log(`[8.8.8][TCL_LOOP] Stopped continuous promotion loop for ${this.mode}`);
    }
  }

  /**
   * Phase 8.8.4-C.12: Unbind event listeners on engine stop
   */
  private unbindTCLEventListeners(): void {
    if (this.tclActivatedHandler) {
      eventBus.offTCLActivated(this.tclActivatedHandler);
      this.tclActivatedHandler = null;
    }
    if (this.tradeClosedHandler) {
      eventBus.offTradeClosed(this.tradeClosedHandler);
      this.tradeClosedHandler = null;
    }
    // Directive 8.8.8: Stop continuous promotion loop on engine stop
    this.stopContinuousPromotionLoop();
    console.log(`[8.8.4-C.12][EVENT_UNBIND] Unbound TCL event listeners for ${this.mode}`);
  }

  async start(source: 'api' | 'internal' | 'unknown' = 'unknown'): Promise<void> {
    // Phase 8.8.3-B9.FIX-WS-START: Diagnostic log on start
    console.log('[DEBUG-B9][ENGINE_START_CALLED]', {
      mode: this.mode,
      wasAlreadyRunning: this.isRunning,
      timestamp: new Date().toISOString(),
      source,
    });
    
    // Directive 8.8.4-A3.R9.0.B: Prevent redundant engine starts
    if (this.isRunning) {
      console.warn(`[A3.R9.0.B][GUARD] Engine already active for mode=${this.mode}. Skipping redundant start.`);
      console.log(`[PaperExecution:${this.mode}] Already running`);
      // Phase 8.8.3-I6-FIX: Ensure mode is correct even on idempotent call
      livePricingAdapter.setTradingMode(this.mode);
      return;
    }

    this.isRunning = true;
    
    // Directive 8.8.4-A3.R9.0.B: Log valid activation with accurate provenance
    console.log(`[A3.R9.0.B][ENGINE_START] Activated (source=${source}, PID=${process.pid}, mode=${this.mode})`)
    
    // Phase 8.8.3-I6-FIX: Set trading mode for correct WebSocket broadcasts
    livePricingAdapter.setTradingMode(this.mode);
    console.log(`[8.8.3-I6-FIX][ENGINE_START] Trading mode set to ${this.mode}`);
    
    // Phase 8.8.3-AJ8: Set session start timestamp for RTB metrics
    // Metrics only count from this point forward (reset behavior)
    const sessionStartTime = new Date();
    engineSessionStart.set(this.mode, sessionStartTime);
    console.log(`[AJ8][SESSION_START] mode=${this.mode}, sessionStart=${sessionStartTime.toISOString()}`);
    
    // Phase 8.8.3-AJ17: Start diagnostic session to capture all AJ16 logs
    aj17DiagnosticRunner.startSession(this.mode);
    
    // Phase 8.8.3-AJ18: Start starvation diagnostic session
    aj18Diagnostic.startSession(this.mode);
    
    console.log(`[PaperExecution:${this.mode}] Starting paper trading engine`);

    // Phase 8.8.3-B3.6: Start Kraken WebSocket adapter for real-time prices
    try {
      await krakenWebSocketAdapter.start();
      console.log(`[PaperExecution:${this.mode}] Kraken WebSocket adapter started`);
      
      // Phase 8.8.3-I8C: Set up open positions provider for reconnect and audit
      const mode = this.mode;
      krakenWebSocketAdapter.setI8COpenPositionsProvider(async () => {
        const positions = await storage.getPaperSimOpenPositions(mode);
        return positions.map(p => p.symbol);
      });
      
      // Phase 8.8.3-I8C: Subscribe ALL open positions on trading START using I8C helper
      const i8cResult = await krakenWebSocketAdapter.i8cSubscribeAllOpenPositions();
      if (i8cResult.count > 0) {
        console.log(`[8.8.3-I6-FIX][WS_SUB_AUDIT] openPositionCount=${i8cResult.count} subscribedSymbols=${JSON.stringify(i8cResult.subscribed)}`);
        console.log(`[PaperExecution:${this.mode}] Subscribed to ${i8cResult.count} open position symbols via I8C`);
      } else {
        console.log(`[8.8.3-I6-FIX][WS_SUB_AUDIT] openPositionCount=0 (no subscriptions needed at start)`);
      }
      
      // Phase 8.8.3-I8C: Start 5-second subscription health audit
      krakenWebSocketAdapter.startI8CSubscriptionAudit();
      console.log(`[PaperExecution:${this.mode}] I8C subscription audit started`);
    } catch (error) {
      console.error(`[PaperExecution:${this.mode}] WebSocket adapter start failed (continuing with REST fallback):`, error);
    }

    // Directive 8.8.4-A3.R2 #6: Clean up expired signals before starting refresh cycle
    try {
      const expiredCount = await readyToBuyService.cleanupExpiredSignals(this.mode);
      if (expiredCount > 0) {
        console.log(`[A3.R2][PaperExecution:${this.mode}] Cleaned ${expiredCount} expired signals on startup`);
      }
    } catch (cleanupError) {
      console.warn(`[A3.R2][PaperExecution:${this.mode}] Expired signal cleanup failed:`, cleanupError);
    }

    // Phase 8.8.4-C.5: Start RTB 30-second refresh cycle
    readyToBuyService.startRefreshCycle(this.mode);
    console.log(`[PaperExecution:${this.mode}] RTB refresh cycle started`);

    // Directive 8.8.4-A3.R2: Set engine start time for TCL 2-minute failsafe (was 5 min)
    readyToBuyService.setEngineStartTime(this.mode);
    console.log(`[PaperExecution:${this.mode}] TCL failsafe timer started (2min failsafe)`);

    // Phase 8.8.4-C.12: Start TCL Watchdog with event-driven activation
    // R9.3.HF-1: Added explicit startup confirmation
    tclWatchdog.start(this.mode);
    console.log(`[A3.R9.3.HF-1][PaperExecution:${this.mode}] TCL Watchdog started (event-driven)`);
    console.log(`[A3.R9.3.HF-1] TCL and RTB subsystems initialized for mode=${this.mode}`);

    // Phase 8.8.4-C.12: Bind event listeners for TCL activation and trade close
    this.bindTCLEventListeners();

    // Directive 9.4: Initialize covariance engine with OHLC data for active symbols
    try {
      const watchlist = activeFilterPool.getActivePool(this.mode);
      const topSymbols = watchlist.slice(0, 20).map((p: ActiveFilteredPair) => p.symbol);
      let loadedCount = 0;
      if (topSymbols.length > 0) {
        for (const symbol of topSymbols) {
          try {
            // Convert internal symbol to Kraken REST pair format
            const krakenPair = getKrakenRestPair(symbol);
            const ohlcResult = await this.krakenService.getOHLCData(krakenPair, 60);
            if (ohlcResult?.ohlc?.length > 0) {
              const closes = ohlcResult.ohlc.map((c: any) => parseFloat(c.close));
              covarianceEngine.updateFromPrices(symbol, closes);
              loadedCount++;
            }
          } catch (err) {
            // Silently skip - individual symbol failures are not critical
          }
        }
        if (loadedCount >= 2) {
          covarianceEngine.computeCovarianceMatrix();
          covarianceEngine.computeCorrelationMatrix();
          // Import and call recalculateScores to update concentration metrics
          const { riskConcentrationAnalyzer } = await import('./risk-concentration.js');
          riskConcentrationAnalyzer.recalculateScores(this.mode); // P19-B4b D5: per-mode scores
          console.log(`[9.4][COV] Engine initialized with ${loadedCount}/${topSymbols.length} symbols`);
        } else {
          console.log(`[9.4][COV] Insufficient data (${loadedCount} symbols) - need >= 2 for correlation`);
        }
      }
    } catch (covError) {
      console.warn(`[9.4][COV] Engine initialization warning:`, covError);
    }

    // Broadcast engine start
    contextBridge.broadcast({
      type: 'trading_pipeline_event' as any,
      payload: {
        mode: this.mode,
        eventType: 'engine_started',
        message: `${this.mode} paper trading engine started`,
        timestamp: sessionStartTime.toISOString()
      }
    });

    // Start monitoring loop
    this.monitoringInterval = setInterval(async () => {
      await this.monitoringCycle();
    }, this.MONITOR_INTERVAL_MS);

    // Run initial cycle
    await this.monitoringCycle();
  }

  async stop(): Promise<void> {
    // Phase 8.8.3-B9.FIX-WS-START: Diagnostic log on stop
    console.log('[DEBUG-B9][ENGINE_STOP_CALLED]', {
      mode: this.mode,
      wasRunning: this.isRunning,
    });
    
    this.isRunning = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    // Phase 8.8.3-AJ8: Clear session start - RTB metrics reset to zero
    // When engine stops, session is cleared, next query returns 0 metrics
    console.log(`[AJ8][SESSION_STOP] mode=${this.mode}, sessionCleared=true`);
    engineSessionStart.set(this.mode, null);

    // Phase 8.8.3-AJ17: Stop diagnostic session and generate report bundle
    aj17DiagnosticRunner.stopSessionAndGenerateReport().catch(err => {
      console.error(`[AJ17] Failed to generate diagnostic report:`, err);
    });
    
    // Phase 8.8.4-C.5: Stop RTB 30-second refresh cycle
    readyToBuyService.stopRefreshCycle(this.mode);
    console.log(`[PaperExecution:${this.mode}] RTB refresh cycle stopped`);
    
    // Phase 8.8.4-C.6: Clear engine start time for TCL failsafe
    readyToBuyService.clearEngineStartTime(this.mode);

    // Phase 8.8.4-C.12: Stop TCL Watchdog
    tclWatchdog.stop(this.mode);
    console.log(`[PaperExecution:${this.mode}] TCL Watchdog stopped`);

    // Phase 8.8.4-C.12: Unbind event listeners
    this.unbindTCLEventListeners();
    
    // Phase 8.8.3-I8C: Stop subscription health audit
    try {
      krakenWebSocketAdapter.stopI8CSubscriptionAudit();
      console.log(`[PaperExecution:${this.mode}] I8C subscription audit stopped`);
    } catch (error) {
      console.error(`[PaperExecution:${this.mode}] Error stopping I8C audit:`, error);
    }
    
    // Phase 8.8.3-B9.FIX-WS-START: Stop WebSocket adapter on engine stop
    try {
      krakenWebSocketAdapter.stop();
      console.log(`[PaperExecution:${this.mode}] Kraken WebSocket adapter stopped`);
    } catch (error) {
      console.error(`[PaperExecution:${this.mode}] Error stopping WebSocket adapter:`, error);
    }

    console.log(`[PaperExecution:${this.mode}] Stopped paper trading engine`);
  }

  // I7-ROOT-FIX: Expose engine status for diagnostics
  public getEngineStatusSnapshot() {
    return {
      mode: this.mode,
      isRunning: this.isRunning,
      lastCycleAt: this.lastCycleAt, // Phase 8.8.3-I7-PM-FOCUS: Tick timestamp
      lastCycleAtIso: this.lastCycleAt
        ? new Date(this.lastCycleAt).toISOString()
        : null,
      lastEvaluateAt: this.lastEvaluateAt,
      lastEvaluateAtIso: this.lastEvaluateAt
        ? new Date(this.lastEvaluateAt).toISOString()
        : null,
      lastExitChecks: this.lastExitChecks.slice(-20),
    };
  }

  /**
   * Phase 8.8.3-I7-PRICE-FIX (A2): Get detailed price status for diagnostics
   * Returns per-position pricing info for the i7-price/status endpoint
   */
  public async getI7PriceStatus(): Promise<{
    isRunning: boolean;
    lastTickAt: string | null;
    lastExitEvalAt: string | null;
    positions: Array<{
      symbol: string;
      priceSource: string;
      priceAgeMs: number;
      lastPriceAt: string | null;
      lastExitEvalPrice: number | null;
      sl: number | null;
      tp: number | null;
      slTriggered: boolean;
      tpTriggered: boolean;
    }>;
  }> {
    const openPositions = await storage.getPaperSimOpenPositions(this.mode);
    const now = Date.now();
    
    const positions = await Promise.all(openPositions.map(async (pos) => {
      const priceResult = await livePricingAdapter.getPriceWithFallback(pos.symbol, 5000);
      const sl = pos.stopLoss ? parseFloat(pos.stopLoss) : null;
      const tp = pos.takeProfit ? parseFloat(pos.takeProfit) : null;
      const currentPrice = priceResult?.price ?? null;
      
      // Check if exit would trigger at current price
      const slTriggered = sl !== null && currentPrice !== null && currentPrice <= sl;
      const tpTriggered = tp !== null && currentPrice !== null && currentPrice >= tp;
      
      return {
        symbol: pos.symbol,
        priceSource: priceResult?.source ?? 'none',
        priceAgeMs: priceResult ? now - new Date(priceResult.timestamp).getTime() : -1,
        lastPriceAt: priceResult?.timestamp ?? null,
        lastExitEvalPrice: currentPrice,
        sl,
        tp,
        slTriggered,
        tpTriggered
      };
    }));
    
    return {
      isRunning: this.isRunning,
      lastTickAt: this.lastCycleAt ? new Date(this.lastCycleAt).toISOString() : null,
      lastExitEvalAt: this.lastEvaluateAt ? new Date(this.lastEvaluateAt).toISOString() : null,
      positions
    };
  }

  /**
   * Phase 8.8.3: Force-close a position for manual stop
   * Public wrapper for private closePosition with manual_stop exit condition.
   * Used by ActivePortfolioManager.forceCloseAllOpenPositionsOnStop()
   * 
   * @param positionId - The position ID to close
   * @param exitPrice - Current market price for the position
   * @param priceSource - Source of the exit price (e.g., 'manual_stop', 'live_pricing')
   * @returns Success status and any error message
   */
  async forceClosePosition(
    positionId: string,
    exitPrice: number,
    priceSource: string = 'manual_stop'
  ): Promise<{ success: boolean; error?: string }> {
    console.log('[DEBUG-B9][ENGINE_FORCE_CLOSE]', {
      positionId,
      exitPrice,
      priceSource,
      mode: this.mode,
    });

    try {
      const exitCondition: ExitCondition = {
        type: 'manual_stop',
        price: exitPrice,
        reason: 'Manual stop requested by user',
      };

      await this.closePosition(positionId, exitPrice, exitCondition, priceSource);
      
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[DEBUG-B9][ENGINE_FORCE_CLOSE_FAILED]', {
        positionId,
        error: errorMessage,
      });
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Phase 8.8.3-B7.A: Reset all in-memory session state
   * Called during hard reset to ensure no ghost state from previous sessions.
   * Clears: running state, intervals, price history, diagnostics, WebSocket subscriptions
   */
  resetSessionState(): void {
    console.log(`[B7.A][ENGINE] Resetting session state for mode=${this.mode}`);
    
    // B7.MDR: Capture pre-reset cache sizes for verification (Directive Section F)
    const prePriceHistory = this.priceHistory.size;
    const preTickLogs = this.priceTickLogs.length;
    const preTickTime = this.lastPriceTickTime.size;
    console.log(`[ENGINE][RESET][PRE] priceHistory=${prePriceHistory}, tickLogs=${preTickLogs}, lastPriceTickTime=${preTickTime}`);
    
    // Clear running state
    this.isRunning = false;
    this.isCycleRunning = false;
    
    // Clear monitoring interval
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    // Clear price history cache
    this.priceHistory.clear();
    
    // Clear session start timestamp (zeroes RTB metrics)
    engineSessionStart.set(this.mode, null);
    
    // Clear price tick diagnostics
    this.priceTickLogs = [];
    this.lastPriceTickTime.clear();
    
    // Clear last cycle summary
    this.lastCycleSummary = {};
    
    // B7.MDR: Log post-reset verification (Directive Section D)
    console.log(`[ENGINE][RESET] Cleared price snapshot and bar caches (priceHistory=${this.priceHistory.size}, tickLogs=${this.priceTickLogs.length}, lastPriceTickTime=${this.lastPriceTickTime.size})`);
    
    // B7.A Enhancement: Clear WebSocket subscriptions to prevent stale price feeds
    try {
      krakenWebSocketAdapter.clearAllSubscriptions();
      console.log(`[B7.A][ENGINE] WebSocket subscriptions cleared`);
    } catch (wsErr) {
      console.warn(`[B7.A][ENGINE] WebSocket clear warning:`, wsErr);
    }
    
    // B7.A Enhancement: Stop AJ17 diagnostic session
    try {
      aj17DiagnosticRunner.stopSessionAndGenerateReport().catch(err => {
        console.warn(`[B7.A][ENGINE] AJ17 stop warning:`, err);
      });
      console.log(`[B7.A][ENGINE] AJ17 diagnostics stopped`);
    } catch (diagErr) {
      console.warn(`[B7.A][ENGINE] AJ17 diagnostics warning:`, diagErr);
    }
    
    // Phase 8.8.4-C.5: Stop RTB refresh cycle during reset
    readyToBuyService.stopRefreshCycle(this.mode);
    console.log(`[B7.A][ENGINE] RTB refresh cycle stopped`);
    
    // Phase 8.8.4-C.6: Clear engine start time for TCL failsafe during reset
    readyToBuyService.clearEngineStartTime(this.mode);
    
    console.log(`[B7.A][ENGINE] Session state reset complete for mode=${this.mode}`);
  }

  private async monitoringCycle(): Promise<void> {
    // Re-entrancy guard: skip if previous cycle is still running
    if (this.isCycleRunning) {
      console.log(`[PaperExecution:${this.mode}] Skipping cycle - previous cycle still running`);
      return;
    }

    // Skip if engine has been stopped
    if (!this.isRunning) {
      console.log(`[PaperExecution:${this.mode}] Skipping cycle - engine stopped`);
      return;
    }

    this.isCycleRunning = true;
    
    // Phase 8.8.3-I7-PM-FOCUS: Track cycle timestamp
    this.lastCycleAt = Date.now();
    
    try {
      // Phase 8.8.3-I7-PM-FOCUS: Get current open positions count for ENGINE_TICK log
      const openPositions = await storage.getPaperSimOpenPositions(this.mode);
      console.log(`[I7-PM-FOCUS][ENGINE_TICK] mode=${this.mode} positions=${openPositions.length} ts=${new Date().toISOString()}`);
      
      // Step 1: Check open positions for exit conditions
      await this.checkOpenPositions();

      // Note: Signal scanning removed by Directive 8.8.4-A3.R9.3
      // Trade creation flows through: FX5 → SignalOrchestrator → SQE → RTB → TCL
    } catch (error) {
      console.error(`[PaperExecution:${this.mode}] Monitoring cycle error:`, error);
      
      // Log error to trade logs (Phase 27.F.15.B.2: Global mode-based)
      await storage.createActiveTradeLog(this.mode, {
        tradeId: null,
        positionId: null,
        eventType: 'error',
        message: `Monitoring cycle error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        metadata: {
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.stack : undefined,
          mode: this.mode
        }
      });
    } finally {
      this.isCycleRunning = false;
    }
  }

  /**
   * P19-B7.2c — process one PENDING maker position per monitor tick (Kyle model,
   * SIMPLIFIED 2026-07-02). A pending is a resting maker order: it holds a slot but has
   * no fill. Two outcomes, FILL WINS in the same tick (R2):
   *  1. FILL — honest side-aware trade-through: the real price traded through the resting
   *     limit (buy: price ≤ limit) → state 'pending'→'open' at the limit + the maker fee
   *     already reserved at placement. The position then enters the normal exit path on
   *     subsequent ticks.
   *  2. HARD-DROP — past `maker_deadline` (~1h, `maker_max_pending_ms`) → DROPPED, period
   *     (no convert re-evaluation — an unfilled maker buy means price never came to us).
   *     The open position is deleted (slot freed) and its paper_sim_trades row is closed
   *     as closeReason='never_filled' (the TYPED discriminator; visible in the closed
   *     records with no P&L, EXCLUDED from win-rate/expectancy aggregates + learning,
   *     but COUNTED in the maker fill-rate denominator).
   *  R3: for xStock the hard-drop must NOT fire while the market is closed
   *     (weekend window) — a shut book can't honestly fill, so the drop waits for the
   *     first open tick (conservative approximation, documented in the scope).
   */
  private async _processPendingMaker(position: any, currentPrice: number): Promise<void> {
    const limit = position.makerLimitPrice != null ? parseFloat(position.makerLimitPrice) : NaN;
    if (!Number.isFinite(limit)) {
      console.error(`[P19-B7.2c][PENDING_INVALID:${this.mode}] ${position.symbol} pending with no maker_limit_price — leaving untouched (investigate)`);
      return;
    }
    // ONE outcome per tick via the shared PURE logic (paper + VTS parity by construction;
    // side-aware comparator, FILL WINS over the deadline in the same tick — R2).
    // Zero/garbage-price guard (Langston Step-4): a non-positive tick (feed glitch) would
    // satisfy `0 <= limit` and spuriously FILL a buy — treat it as no-price (null), exactly
    // like the VTS resolve loop's `price > 0 ? price : null`. A null price can still hard-drop.
    const safePrice = Number.isFinite(currentPrice) && currentPrice > 0 ? currentPrice : null;
    const side = (position.side ?? 'buy') as 'buy' | 'sell';
    const deadlineMs = position.makerDeadline ? new Date(position.makerDeadline).getTime() : null;
    const outcome = evaluatePendingMaker({ side, currentPrice: safePrice, limit, nowMs: Date.now(), deadlineMs });
    if (outcome === 'fill') {
      // NOTE: openedAt stays stamped at PLACEMENT, not at this fill — resting time is
      // included in any holding-duration analytic (cosmetic; EV/expectancy unaffected
      // since entry price is the limit either way). A true in-market duration needs a
      // filledAt stamp — Phase-25 fill-rate report card decides if it wants one.
      await storage.updatePaperSimOpenPosition(this.mode, position.id, {
        state: 'open',
        currentPrice: currentPrice.toString(),
        lastUpdated: new Date(),
      } as any);
      console.log(`[P19-B7.2c][MAKER_FILLED:${this.mode}] ${position.symbol}: price ${currentPrice} traded through limit ${limit} — pending→open at ${makerFillPrice(limit)} + maker fee (reserved at placement)`);
      return;
    }
    if (outcome === 'drop') {
      // R3: xStock — never fire the drop inside the weekend-closed window.
      if ((position.assetClass ?? 'crypto_spot') === 'xstock_spot' && !isXstockMarketOpenUTC(position.symbol, new Date())) {
        return; // market shut — wait for the first open tick
      }
      const tradeId = (position.metadata as any)?.tradeId;
      if (tradeId) {
        await storage.updatePaperSimTrade(this.mode, tradeId, {
          closedAt: new Date(),
          closeReason: 'never_filled', // TYPED discriminator — visible, excluded from aggregates/learning
        } as any);
      }
      await storage.deletePaperSimOpenPosition(this.mode, position.id);
      console.log(`[P19-B7.2c][MAKER_NEVER_FILLED:${this.mode}] ${position.symbol}: pending maker at ${limit} hit the hard-drop deadline unfilled — dropped (slot freed, never-filled record${tradeId ? '' : ' — no tradeId on metadata, position removed only'})`);
    }
    // 'rest' — still resting; nothing to do this tick.
  }

  private async checkOpenPositions(): Promise<void> {
    // I7-ROOT-FIX: Track evaluation timing
    this.lastEvaluateAt = Date.now();
    this.lastExitChecks = [];
    
    const openPositions = await storage.getPaperSimOpenPositions(this.mode);
    
    // Phase 8.8.3-I7-PRICE-FIX (A3): Aggregate exit evaluation stats
    let positionsEvaluated = 0;
    let withWsPrice = 0;
    let withRestPrice = 0;
    let withoutPrice = 0;
    let slHits = 0;
    let tpHits = 0;

    for (const position of openPositions) {
      try {
        // Phase 8.8.3-I7-WS-D (D5): Use WebSocket cache FIRST with 2-second stale threshold
        // Only fall back to REST if WS cache is stale > 2 seconds
        const priceResult = await livePricingAdapter.getPriceWithFallback(position.symbol, 2000);
        
        let currentPrice: number;
        let priceSource: string;
        
        // Phase 8.8.3-B9: Strict price source validation - no mock pricing
        if (priceResult !== null && priceResult.price !== null && priceResult.source !== 'no_reliable_price') {
          // Phase 8.8.3-B9: Reject mock prices in production mode
          if (priceResult.source === 'mock') {
            console.warn(`[B9.PRICING][SKIP_DUE_TO_MOCK] ${position.symbol}: Mock price rejected, skipping position check`);
            withoutPrice++;
            continue;
          }
          currentPrice = priceResult.price;
          priceSource = priceResult.source;
          
          // Phase 8.8.3-I7-PRICE-FIX: Track price source stats
          if (priceSource === 'kraken_ws') {
            withWsPrice++;
            console.log(`[I7-WS-D][ENGINE_WS_PRICE] symbol=${position.symbol} price=${currentPrice}`);
          } else if (priceSource === 'kraken_rest' || priceSource === 'binance' || priceSource === 'coingecko') {
            withRestPrice++;
          }
        } else {
          // Phase 8.8.3-I7: Fallback to Kraken REST if cache unavailable
          // Use the resolver to get correct REST pair format
          try {
            const restPair = getKrakenRestPair(position.symbol);
            console.log(`[I7][REST_FALLBACK] symbol=${position.symbol} -> restPair=${restPair}`);
            
            const ticker = await this.krakenService.getTicker(restPair);
            const tickerData = Object.values(ticker)[0];
            if (!tickerData) {
              console.warn(`[B9.PRICING][SKIP_DUE_TO_NO_PRICE] ${position.symbol}: No Kraken REST data, skipping position check`);
              withoutPrice++;
              continue;
            }
            
            // 8.9.2: Calculate midpoint from bid/ask, fallback to last trade
            const ask = parseFloat(tickerData.a[0]);
            const bid = parseFloat(tickerData.b[0]);
            const lastTrade = parseFloat(tickerData.c[0]);
            currentPrice = (ask > 0 && bid > 0) ? (ask + bid) / 2 : lastTrade;
            priceSource = 'kraken_rest';
            withRestPrice++;
            
            console.log(`[8.9.2][REST_TICK] ${position.symbol} bid=${bid} ask=${ask} mid=${currentPrice.toFixed(8)}`);
            
            // Phase 8.8.3-I7: Broadcast this REST price to frontend
            // Normalize to internal format for consistent cache keys
            const internalSymbol = normalizeToInternalSymbol(position.symbol);
            livePricingAdapter.updateFromWebSocket(internalSymbol, currentPrice, 'kraken_ws');
            console.log(`[I7][REST_BROADCAST] symbol=${internalSymbol} price=${currentPrice}`);
          } catch (krakenError) {
            console.warn(`[B9.PRICING][SKIP_DUE_TO_NO_PRICE] ${position.symbol}: Kraken REST failed, skipping position check`, krakenError);
            withoutPrice++;
            continue;
          }
        }
        
        // Phase 8.8.3-B3.5: Log PRICE_TICK for cadence verification
        const now = Date.now();
        const lastTick = this.lastPriceTickTime.get(position.symbol) || now;
        const diffMs = now - lastTick;
        this.lastPriceTickTime.set(position.symbol, now);

        // ── P19-B7.2c: PENDING maker pre-pass — a resting maker order holds a slot but
        // has NO fill, so it never enters the TEC exit path. Fill (honest trade-through)
        // wins over the deadline in the same tick (R2). Handled then `continue`d.
        if ((position as any).state === 'pending') {
          await this._processPendingMaker(position, currentPrice);
          positionsEvaluated++;
          continue;
        }
        
        const tickEntry = {
          symbol: position.symbol,
          refreshedAt: new Date().toISOString(),
          diffMs: diffMs
        };
        
        // Keep last 100 entries (ring buffer behavior)
        if (this.priceTickLogs.length >= this.MAX_PRICE_TICK_LOGS) {
          this.priceTickLogs.shift();
        }
        this.priceTickLogs.push(tickEntry);
        
        console.log(`[PRICE_TICK] symbol=${position.symbol} refreshed_at=${tickEntry.refreshedAt} diff_ms=${diffMs} source=${priceSource}`);
        
        // Phase 8.8.3-I7-PM-FOCUS: ENGINE_PRICE_READ diagnostic
        console.log(`[I7-PM-FOCUS][ENGINE_PRICE_READ] symbol=${position.symbol} source=${priceSource} ageMs=${diffMs} price=${currentPrice}`);
        
        // Phase 8.8.3-I6 B1: Diagnostic logging for trade engine live price usage
        console.log(`[8.8.3-I6][ENGINE_LIVE_PRICE] symbol=${position.symbol} price=${currentPrice} source=${priceSource} age=${diffMs}ms`);
        
        positionsEvaluated++;
        const avgPrice = parseFloat(position.avgPrice);
        const stopLoss = position.stopLoss ? parseFloat(position.stopLoss) : null;
        const takeProfit = position.takeProfit ? parseFloat(position.takeProfit) : null;
        
        // Phase 8.8.3-I7-WS-C (C2 Stage 7): Generate trace ID and log engine price read
        const engineTraceId = priceTraceService.generateTraceId(position.symbol.replace('/', ''));
        priceTraceService.recordStage(engineTraceId, 7, 'ENGINE_PRICE_READ', {
          internal_symbol: position.symbol,
          engine_price: currentPrice,
          source: priceSource
        });

        // Phase 8.8.3-I6 B3: Calculate current P/L using LIVE price
        const pnl = (currentPrice - avgPrice) * parseFloat(position.quantity);
        const pnlPercent = ((currentPrice - avgPrice) / avgPrice) * 100;
        
        // Phase 8.8.3-I6 B3: Diagnostic logging for P/L calculation
        console.log(`[8.8.3-I6][ENGINE_PNL_CALC] symbol=${position.symbol} entry=${avgPrice} live=${currentPrice} pnl=${pnl.toFixed(4)} pnlPct=${pnlPercent.toFixed(4)}%`);

        // Update position with current P/L
        await storage.updatePaperSimOpenPosition(this.mode, position.id, {
          currentPrice: currentPrice.toString(),
          unrealizedPnl: pnl.toString(),
          unrealizedPnlPercent: pnlPercent.toString()
        });

        // Check for exit conditions
        // Phase 8.8.3-I7-WS-C: Pass trace ID for Stage 8 logging
        const evalStartedAt = Date.now();
        const exitCondition = await this.checkExitConditions(
          position,
          currentPrice,
          avgPrice,
          stopLoss,
          takeProfit,
          engineTraceId
        );

        // I7-ROOT-FIX: Track exit evaluation for diagnostics
        this.lastExitChecks.push({
          symbol: position.symbol,
          slotNumber: (position as any).slotNumber,
          price: currentPrice,
          priceSource: priceSource,
          evaluatedAt: new Date(evalStartedAt).toISOString(),
          triggeredExit: exitCondition !== null
        });

        if (exitCondition) {
          // Phase 8.8.3-I7-PRICE-FIX: Track exit types
          if (exitCondition.type === 'stop_hit') slHits++;
          if (exitCondition.type === 'target_hit') tpHits++;
          
          // [B8.PNL][EXIT_SOURCE] - Log price source before calling closePosition
          console.log(`[B8.PNL][EXIT_SOURCE]`, JSON.stringify({
            symbol: position.symbol,
            side: position.side,
            currentPrice: currentPrice,
            entryPrice: avgPrice,
            priceSource: priceSource,
            closeReason: exitCondition.type
          }));
          
          await this.closePosition(position.id, currentPrice, exitCondition, priceSource);
        }
      } catch (error) {
        console.error(`[PaperExecution:${this.mode}] Error checking position ${position.symbol}:`, error);
      }
    }
    
    // Phase 8.8.3-I7-PRICE-FIX (A3): Enhanced EVAL_EXIT aggregate log with price stats
    console.log(`[I7-PRICE-FIX][EVAL_EXIT] cycleId=${this.lastCycleAt} positionsEvaluated=${positionsEvaluated} withWsPrice=${withWsPrice} withRestPrice=${withRestPrice} withoutPrice=${withoutPrice} slHits=${slHits} tpHits=${tpHits}`);
  }

  private async checkExitConditions(
    position: any,
    currentPrice: number,
    avgPrice: number,
    stopLoss: number | null,
    takeProfit: number | null,
    traceId?: string
  ): Promise<ExitCondition | null> {
    // Phase 8.8.3-I6 B2: Calculate distance to SL/TP using live price
    const distanceToTP = takeProfit ? ((takeProfit - currentPrice) / currentPrice) * 100 : null;
    const distanceToSL = stopLoss ? ((currentPrice - stopLoss) / currentPrice) * 100 : null;
    
    // Phase 8.8.3-I7-WS-C (C2 Stage 8): Log exit evaluation
    if (traceId) {
      priceTraceService.recordStage(traceId, 8, 'EXIT_EVAL', {
        symbol: position.symbol,
        distSL: distanceToSL,
        distTP: distanceToTP
      });
    }
    
    // Phase 8.8.3-I6 B2: Diagnostic logging for SL/TP evaluation
    console.log(`[8.8.3-I6][EXIT_EVAL] symbol=${position.symbol} livePrice=${currentPrice} tp=${takeProfit} sl=${stopLoss} distTP=${distanceToTP?.toFixed(4)}% distSL=${distanceToSL?.toFixed(4)}%`);

    // B65.2 (2026-04-23): paper engages the full ATR-based trailing engine.
    // Break-even lock on 1×ATR gain, target-lock + moonbag on target hit (if
    // strategy qualifies), trailing stop in moonbag mode, 4h duration cap,
    // concurrency cap via reserved-slots policy. The legacy percentage-based
    // trailing block below is GONE (it fought the ATR engine). Max-holding-
    // period metadata is preserved as a separate per-position override.
    const metadata = position.metadata as Record<string, any>;
    const atrAtOpen = metadata?.atr_at_open ? parseFloat(metadata.atr_at_open) : 0;
    const diAtOpen = metadata?.di_at_open ? parseFloat(metadata.di_at_open) : 50;
    const volNoiseAtOpen = metadata?.vol_noise_at_open ? parseFloat(metadata.vol_noise_at_open) : 0.3;

    if (stopLoss !== null || takeProfit !== null) {
      // Current open-position count drives the concurrency cap for paper.
      // Reading size from storage once per exit-check is cheap enough; if
      // this becomes a hot path we'll cache at the service level.
      const currentOpenPositions = await storage.getPaperSimOpenPositions(this.mode);
      const currentSlotTotal = currentOpenPositions.length;

      // B79.TEC (2026-05-08): assetClass MUST come from the position record,
      // not a hardcoded literal. paper_sim_open_positions.asset_class has
      // been populated since B69 — we read it directly. If a row somehow
      // lacks it (legacy data), throw rather than silently default to
      // crypto_spot (CLAUDE.md §11 NO_FALLBACK doctrine).
      const positionAssetClass = (position as any).assetClass as AssetClass | undefined;
      if (!positionAssetClass) {
        throw new Error(
          `[TEC_PE_MISSING_ASSET_CLASS] paper position id=${position.id} symbol=${position.symbol} ` +
          `has no assetClass. Backfill via the B69 schema migration before retrying.`,
        );
      }
      // B80 (2026-05-13): Option C+ rehydrate seed. Built once on the first
      // exit-cycle for an open position post-deploy. Subsequent cycles: the
      // engine state is in memory, seed is ignored (only fires when state
      // doesn't exist yet). Per Langston rev2 §4.4.
      const { getTrailingState: _getTSForSeed } = await import('./trailing-exit-controller.js');
      const existingTecStatePE = _getTSForSeed(position.id);
      const tecSeedPE = existingTecStatePE
        ? undefined
        : {
            tradeMode: ((position as any).tradeMode === 'TRAILING_TAKE'
              ? 'TRAILING_TAKE'
              : 'TARGET') as 'TARGET' | 'TRAILING_TAKE',
            ladderRung: (position as any).ladderRungsHit ?? 0,
            originalStopPrice:
              (position as any).originalStopPrice ?? (stopLoss ?? undefined),
          };

      const decision = await evaluateTECExit({
        // B80 (2026-05-13): per-trade keying. paper/live positions key by
        // the DB row id (paper_sim_open_positions.id).
        tradeId: position.id,
        symbol: position.symbol,
        entryPrice: avgPrice,
        stopPrice: stopLoss ?? -Infinity,
        targetPrice: takeProfit ?? Infinity,
        currentPrice,
        atr: atrAtOpen,
        holdDurationMs: 0,   // paper handles metadata.maxHoldingMs inline below (W2.1)
        maxHoldMs: Infinity, // disable global timeout branch here
        context: {
          exchange: 'kraken',
          assetClass: positionAssetClass,
          strategy: position.strategyName,
          regime: (position as any).regime,
        },
        useTrailing: true,
        DI: diAtOpen,
        volNoise: volNoiseAtOpen,
        callerMode: this.mode === 'live' ? 'live' : 'paper',
        sourcePool: (position as any).sourcePool ?? null,
        currentSlotTotal,
        // B80: Option C+ seed (only on first cycle post-restart).
        seed: tecSeedPE,
      });

      // B65.2: if the engine ratcheted the stop (break-even lock, target
      // lock, or trailing), write the new stop back to the open-position
      // row so the next exit-check cycle sees it AND the UI shows the
      // ratcheted stop instead of the static entry-time stop.
      if (decision.newStopPrice !== undefined && stopLoss !== null && decision.newStopPrice > stopLoss) {
        await storage.updatePaperSimOpenPosition(this.mode, position.id, {
          stopLoss: decision.newStopPrice.toString(),
        });
      }

      // B80 (2026-05-13, Langston rev2 #1): runtime invariant assertion on
      // every exit-cycle iteration. Per-trade keying means displayed stop
      // (position.stopLoss) MUST equal engine state's currentStopPrice
      // (decision.newStopPrice). Divergence indicates a keying contract
      // break; surface for next pre-audit.
      if (decision.newStopPrice !== undefined && stopLoss !== null && avgPrice > 0) {
        const epsilon = Math.max(0.00001, 0.0001 * avgPrice);
        // Compare the engine's reported stop against the value we'd just
        // written back (post-ratchet). If the engine returned a stop that's
        // LOWER than the current displayed stop, that's a violation —
        // engine should never ratchet downward.
        const effectiveDisplayedStop =
          decision.newStopPrice > stopLoss ? decision.newStopPrice : stopLoss;
        const delta = Math.abs(effectiveDisplayedStop - decision.newStopPrice);
        if (delta > epsilon) {
          console.error(
            `[B80][TEC_KEYING_INVARIANT_VIOLATION] tradeId=${position.id} symbol=${position.symbol} ` +
            `displayed=${effectiveDisplayedStop.toFixed(6)} engine=${decision.newStopPrice.toFixed(6)} ` +
            `delta=${delta.toFixed(6)} epsilon=${epsilon.toFixed(6)}`
          );
        }
      }

      // B65.2: write trade_mode on mode change (TARGET → TRAILING_TAKE).
      if (decision.modeChanged) {
        await storage.updatePaperSimOpenPosition(this.mode, position.id, {
          tradeMode: 'TRAILING_TAKE',
        });
      }

      if (decision.shouldExit) {
        switch (decision.exitReason) {
          case 'target_hit':
            console.log(`[8.8.3-I6][EXIT_TRIGGER] symbol=${position.symbol} type=target_hit price=${currentPrice}`);
            return {
              type: 'target_hit',
              price: currentPrice,
              reason: `Price ${currentPrice.toFixed(2)} reached target ${(takeProfit ?? 0).toFixed(2)}`,
            };
          case 'stop_hit':
            console.log(`[8.8.3-I6][EXIT_TRIGGER] symbol=${position.symbol} type=stop_hit price=${currentPrice}`);
            return {
              type: 'stop_hit',
              price: currentPrice,
              reason: `Price ${currentPrice.toFixed(2)} hit stop ${(stopLoss ?? 0).toFixed(2)}`,
            };
          case 'break_even_stop':
            // B65.2-HF3: BE-lock-ratcheted stop was hit before trade reached
            // target. Reuse the existing stop_hit ExitCondition type on the
            // paper side to keep downstream P&L math identical; the reason
            // string carries the BE-protect semantics and the closed-trade
            // row records 'break_even_stop' in the closeReason column.
            console.log(`[B65.2][EXIT_TRIGGER] symbol=${position.symbol} type=break_even_stop price=${currentPrice} ratcheted_stop=${decision.newStopPrice?.toFixed(4)}`);
            return {
              type: 'stop_hit',
              price: currentPrice,
              reason: `Break-even protection: ratcheted stop at ${decision.newStopPrice?.toFixed(2)} hit before target`,
            };
          case 'trailing_stop_hit':
            console.log(`[B65.2][EXIT_TRIGGER] symbol=${position.symbol} type=trailing_stop_hit price=${currentPrice} ratcheted_stop=${decision.newStopPrice?.toFixed(4)}`);
            return {
              type: 'trailing_stop_hit',
              price: currentPrice,
              reason: `Trailing stop at ${decision.newStopPrice?.toFixed(2)} hit after moonbag ratchet`,
            };
          case 'moonbag_timeout':
            console.log(`[B65.2][EXIT_TRIGGER] symbol=${position.symbol} type=moonbag_timeout price=${currentPrice}`);
            return {
              // Reuse the existing trailing_stop_hit exit bucket on the DB
              // side so we don't need a new enum — the close reason will
              // be suffixed (see closePosition). Callers reading the
              // ExitCondition.type can still distinguish via the reason string.
              type: 'trailing_stop_hit',
              price: currentPrice,
              reason: `Moonbag duration cap reached (4h) — forced close at ${currentPrice.toFixed(2)}`,
            };
        }
      }
    }

    // Per-position max holding period (separate from the global 4h moonbag
    // cap above — this is a position-level operator override that typically
    // targets much longer holds, e.g. a "close this swing trade after 7d"
    // rule). Unchanged by B65.2.
    //
    // W2.1 (2026-06-06): the hold is now carried as an explicit MILLISECONDS
    // value in `metadata.maxHoldingMs`. Previously this read
    // `metadata.maxHoldingPeriod` and treated it as HOURS, which silently
    // enforced a bar-count of 24 as 24 HOURS. We now compare elapsed ms to the
    // hold ms directly (no unit guessing); the reason string still shows
    // hours-held for readability.
    const maxHoldingMs =
      typeof metadata?.maxHoldingMs === 'number' && isFinite(metadata.maxHoldingMs)
        ? metadata.maxHoldingMs
        : undefined;
    if (maxHoldingMs !== undefined) {
      const openTime = new Date(position.openedAt).getTime();
      const elapsedMs = Date.now() - openTime;

      if (elapsedMs >= maxHoldingMs) {
        const hoursHeld = elapsedMs / (1000 * 60 * 60);
        const maxHours = maxHoldingMs / (1000 * 60 * 60);
        return {
          type: 'max_holding_period',
          price: currentPrice,
          reason: `Max holding period of ${maxHours.toFixed(1)}h exceeded (held ${hoursHeld.toFixed(1)}h)`
        };
      }
    }

    return null;
  }

  private async closePosition(
    positionId: string,
    exitPrice: number,
    exitCondition: ExitCondition,
    priceSource?: string
  ): Promise<void> {
    const position = await storage.getPaperSimOpenPosition(this.mode, positionId);
    if (!position) {
      console.warn(`[PaperExecution:${this.mode}] Position ${positionId} not found`);
      return;
    }

    // [B8.PNL][CLOSE_ATTEMPT] - Log before any math is done
    console.log(`[B8.PNL][CLOSE_ATTEMPT]`, JSON.stringify({
      symbol: position.symbol,
      strategy: position.strategyName,
      side: position.side,
      quantity: position.quantity,
      entryPrice: position.avgPrice,
      rawExitPriceParam: exitPrice,
      exitPriceSource: priceSource ?? 'unknown',
      mode: this.mode,
      positionOpenedAt: position.openedAt,
      now: new Date().toISOString()
    }));

    const avgPrice = parseFloat(position.avgPrice); // Actual entry price (with slippage)
    const quantity = parseFloat(position.quantity);
    const entryValue = avgPrice * quantity;
    
    // Phase 8.8.3-C2: Get intended entry price for gross P/L calculation
    const intendedEntryPrice = position.intendedEntryPrice 
      ? parseFloat(position.intendedEntryPrice) 
      : avgPrice; // Fallback for old positions
    const intendedEntryValue = intendedEntryPrice * quantity;

    // Apply exit slippage and fees
    const _b45FeePct = this.feePercentFor(position.symbol, asValidAssetClass((position as { assetClass?: unknown }).assetClass) ?? undefined); // P19-B6.5d (OBJ-4): prefer the position stamp; B-4.5 per-class
    // P19-B4b.1: exit fill via the DEPTH-WALKED OrderPlacer port. The close ALWAYS
    // full-fills (R2 — a market exit always gets out, never a phantom stuck position);
    // the placer walks the live bid snapshot and prices any beyond-book remainder with
    // the DB-resolved per-class penalty (no magic constant; Langston Q-A). Cold book →
    // requestedPrice worsened by the penalty, loudly. Closes are NOT depth-gated (you
    // must always be able to exit), so there is no skip path here.
    const _closeClass = asValidAssetClass((position as any).assetClass) ?? safeResolveAssetClass(position.symbol, 'kraken');
    const _closeCfg = _closeClass ? await resolveFillDepthGateConfig(_closeClass) : null;
    const _closeSnap = _closeClass ? await getDepthSnapshot(position.symbol, _closeClass) : null;
    const _closeFill = await this.orderPlacer.closeOrder({
      symbol: position.symbol, side: 'sell', quantity, requestedPrice: exitPrice, mode: this.mode, positionId,
      assetClass: _closeClass ?? undefined,
      bookBids: _closeSnap?.bids,
      beyondDepthPenaltyBps: _closeCfg?.beyondDepthPenaltyBps,
    });
    if (_closeFill.status !== 'filled') {
      // C3 CLOSE-SEAM STATE RULE: a non-filled close leaves the position OPEN (close NOT
      // recorded), retried next exit-monitor cycle — never half-closed. Nothing above this
      // point has mutated the position. Paper always fills; this guards live.
      console.error(`[PaperExecution:${this.mode}][CLOSE_FILL_NONFILLED] ${position.symbol} pos=${positionId} status=${_closeFill.status} — position left OPEN, retry next cycle (paper fills must be atomic)`);
      return;
    }
    const actualExitPrice = _closeFill.fillPrice;
    const exitFee = _closeFill.feeQuote;
    
    // Get entry costs from position (persisted at entry time)
    const entryFee = position.entryFee ? parseFloat(position.entryFee) : (entryValue * (_b45FeePct / 100));
    const entrySlippage = position.entrySlippage ? parseFloat(position.entrySlippage) : 0;
    const exitSlippage = _closeFill.slippageQuote; // P19-B3a: from the close FillResult (== exitSlippagePerUnit * quantity)

    // Phase 8.8.3-C2: P/L breakdown per directive
    // Gross P/L = Pure market movement (no slippage, no fees)
    const grossPnl = (exitPrice - intendedEntryPrice) * quantity;
    
    // Total Cost = All execution costs
    const totalCost = entryFee + exitFee + entrySlippage + exitSlippage;
    const totalFees = entryFee + exitFee;
    
    // Net P/L = Gross P/L minus all costs
    const netPnl = grossPnl - totalCost;
    const netPnlPercent = intendedEntryValue > 0 ? (netPnl / intendedEntryValue) * 100 : 0;
    
    // Legacy fields for backward compatibility
    const totalSlippage = entrySlippage + exitSlippage;
    const pnlPercent = netPnlPercent; // For backward compatibility

    // [B8.PNL] Anomaly guard: Check for >100% price move within 5 minutes
    const priceMoveRatio = avgPrice > 0 ? Math.abs((actualExitPrice - avgPrice) / avgPrice) : 0;
    if (priceMoveRatio > 1 && position.openedAt) {
      const msOpen = Date.now() - new Date(position.openedAt).getTime();
      if (msOpen < 5 * 60 * 1000) {
        console.error(`[B8.PNL][ANOMALOUS_CLOSE]`, JSON.stringify({
          symbol: position.symbol,
          strategy: position.strategyName,
          side: position.side,
          quantity: quantity,
          entryPrice: avgPrice,
          actualExitPrice: actualExitPrice,
          priceMoveRatio: priceMoveRatio,
          priceMovePercent: (priceMoveRatio * 100).toFixed(2) + '%',
          msOpen: msOpen,
          closeReason: exitCondition.type,
          priceSource: priceSource ?? 'unknown'
        }));
      }
    }

    // [B8.PNL][CLOSE_COMPUTED] - Log computed values before DB write
    console.log(`[B8.PNL][CLOSE_COMPUTED]`, JSON.stringify({
      symbol: position.symbol,
      strategy: position.strategyName,
      side: position.side,
      quantity: quantity,
      entryPrice: avgPrice,
      actualExitPrice: actualExitPrice,
      profit: netPnl,
      profitPct: pnlPercent,
      closeReason: exitCondition.type,
      mode: this.mode
    }));

    // Phase 8.8.3-C5-5: Consolidated close log (reduced from verbose C2 debug logs)
    console.log(`[PaperExecution:${this.mode}] Position closed ${position.symbol}: Entry $${avgPrice.toFixed(2)} -> Exit $${actualExitPrice.toFixed(2)}, Net P/L: $${netPnl.toFixed(2)} (${netPnlPercent.toFixed(2)}%), Costs: $${totalCost.toFixed(2)}, Reason: ${exitCondition.type}`);
    
    // Directive 8.8.4-L1: Capture trade outcome data for learning aggregation
    const holdDurationMs = position.openedAt ? Date.now() - new Date(position.openedAt).getTime() : 0;
    dataAggregator.capture('TRADE_OUTCOME', {
      symbol: position.symbol,
      strategy: position.strategyName || 'unknown',
      profit: netPnl,
      profitPct: netPnlPercent,
      duration: holdDurationMs,
      stopLossHit: exitCondition.type === 'stop_hit',
      takeProfitHit: exitCondition.type === 'target_hit',
      closeReason: exitCondition.type,
      entryPrice: avgPrice,
      exitPrice: actualExitPrice,
      quantity: quantity
    }).catch(() => {});

    // B70 Step 3.5: exit-decision archive — actual active-engine exit. Fire-and-
    // forget, try/catch wrapped — must never block closePosition.
    try {
      const { archiveExitDecision } = await import('./data-archive/exit-decision-archiver.js');
      const { asValidAssetClass, safeResolveAssetClass } = await import('../../shared/asset-classes.js');
      const exitReasonMap: Record<string, 'BE_stop' | 'SL_hit' | 'TP_target_hit' | 'TRAIL_hit' | 'time_stop' | 'manual' | 'other'> = {
        stop_hit: 'SL_hit',
        target_hit: 'TP_target_hit',
        trailing_stop_hit: 'TRAIL_hit',
        break_even_stop: 'BE_stop',
        timeout: 'time_stop',
        manual_stop: 'manual',
      };
      const mappedReason = exitReasonMap[exitCondition.type] ?? 'other';
      const exchange = (position as any).exchange ?? 'kraken';
      // P19-B4a (C4): prefer the position's authoritative stamp; cold-resolve only
      // if the stamp is missing/invalid. archiveExitDecision requires a non-null
      // asset_class, so on a null resolution we skip the archive write entirely
      // (archive-only, fire-and-forget) rather than persist a wrong/blank class.
      const assetClass =
        asValidAssetClass((position as any).assetClass) ?? safeResolveAssetClass(position.symbol, exchange);
      const rMultiple =
        position.stopLoss && position.avgPrice && position.avgPrice !== position.stopLoss
          ? (actualExitPrice - avgPrice) /
            Math.abs(avgPrice - parseFloat(String(position.stopLoss)))
          : undefined;
      // P19-B4a (C4): asset_class is REQUIRED on the archive row — skip the write
      // on an unclassifiable symbol rather than persist a wrong/blank class.
      if (assetClass === null) {
        console.warn(`[B70][ARCH] paper exit-decision archive skipped — unclassifiable ${position.symbol} (no valid asset class)`);
      } else {
      archiveExitDecision({
        mode: tradingModeToRunMode(this.mode), // ITEM-4 step 2 (D1): this engine's OWN mode
        tradeId: positionId,
        symbol: position.symbol,
        exchange,
        assetClass,
        source: 'active-execution-engine',
        strategy: position.strategyName ?? undefined,
        exitReason: mappedReason,
        entryPrice: avgPrice,
        exitPrice: actualExitPrice,
        pnlPct: netPnlPercent,
        rMultiple,
        durationMin: holdDurationMs / 60000,
        stateSnapshot: {
          mode: this.mode,
          quantity,
          entryFee,
          exitFee,
          entrySlippage,
          exitSlippage,
          totalCost,
          grossPnl,
          netPnl,
          priceSource,
          sourcePool: (position as any).sourcePool,
        },
      });
      } // P19-B4a (C4): end assetClass-present guard
    } catch (b70Err) {
      console.warn(
        `[B70][ARCH] paper exit-decision archive enqueue failed:`,
        b70Err instanceof Error ? b70Err.message : b70Err,
      );
    }

    // Find the corresponding trade record
    const trades = await storage.getPaperSimTradesBySymbol(this.mode,  position.symbol);
    const trade = trades.find(t => t.openedAt && !t.closedAt);
    
    if (trade) {
      // B65.2: read the final trailing-engine state for this symbol so the
      // closed-trade row preserves whether the trade ended in moonbag mode.
      // If no state exists (trade opened before the engine started tracking
      // it, or cleared already), default to TARGET.
      // B65.4: also capture ladder rung count from the same state.
      // B65.4.2 (2026-04-28): also capture observability fields for the
      // closed-trade record (originalStopPrice, latchTriggerPrice,
      // rungTargetHistory). All optional; null on persisted trades that
      // closed before this state was tracked.
      const { getTrailingState: _getTES } = await import('./trailing-exit-controller.js');
      // B80 (2026-05-13): per-trade keying — look up engine state by position.id.
      const _finalState = _getTES(position.id);
      const finalTradeMode: 'TARGET' | 'TRAILING_TAKE' = _finalState?.tradeMode ?? 'TARGET';
      const finalLadderRung: number = _finalState?.ladderRung ?? 0;
      const finalOriginalStop: number | null = _finalState?.originalStopPrice ?? null;
      const finalLatchTrigger: number | null = _finalState?.latchTriggerPrice ?? null;
      const finalRungHistory: number[] | null = _finalState?.rungTargetHistory ?? null;

      // Update trade record - Phase 8.8.3-C2: Include all cost/P&L breakdown fields
      await storage.updatePaperSimTrade(this.mode, trade.id, {
        exitPrice: actualExitPrice.toString(),
        pnl: netPnl.toString(),
        pnlPercent: pnlPercent.toString(),
        fees: totalFees.toString(),
        slippage: totalSlippage.toString(),
        closeReason: exitCondition.type,
        closedAt: new Date(),
        // Phase 8.8.3-C2: New cost transparency fields
        entryFee: entryFee.toString(),
        exitFee: exitFee.toString(),
        totalFee: totalFees.toString(),
        intendedEntryPrice: intendedEntryPrice.toString(),
        actualEntryPrice: avgPrice.toString(),
        entrySlippage: entrySlippage.toString(),
        targetExitPrice: exitPrice.toString(),
        actualExitPrice: actualExitPrice.toString(),
        exitSlippage: exitSlippage.toString(),
        totalCost: totalCost.toString(),
        grossPnl: grossPnl.toString(),
        netPnl: netPnl.toString(),
        netPnlPercent: netPnlPercent.toString(),
        tradeMode: finalTradeMode, // B65.2
        ladderRungsHit: finalLadderRung, // B65.4
        // B65.4.2: ladder mechanics observability columns. Drizzle schema
        // has these as numeric/jsonb so we pass strings/array/null directly.
        originalStopPrice: finalOriginalStop !== null ? finalOriginalStop.toString() : null,
        latchTriggerPrice: finalLatchTrigger !== null ? finalLatchTrigger.toString() : null,
        rungTargetHistory: finalRungHistory,
      });

      // Log the exit event with C2 breakdown
      await storage.createActiveTradeLog(this.mode, {
        tradeId: trade.id,
        positionId: positionId,
        eventType: 'position_closed',
        message: `Position closed: ${position.symbol} - ${exitCondition.reason}`,
        metadata: {
          exitPrice: actualExitPrice,
          slippage: totalSlippage,
          fees: totalFees,
          pnl: netPnl,
          pnlPercent: pnlPercent,
          closeReason: exitCondition.type,
          // C2 breakdown
          grossPnl,
          netPnl,
          entryFee,
          exitFee,
          entrySlippage,
          exitSlippage,
          totalCost
        }
      });
      
      // Directive 8.8.4-M5C.1: Record paper trade for VTS comparison audit
      try {
        const paperTradeRecord: PaperTradeRecord = {
          symbol: position.symbol,
          strategy: position.strategyName || 'unknown',
          entryPrice: avgPrice,
          exitPrice: actualExitPrice,
          di: parseFloat((trade as any).di || '0'),
          gsi: parseFloat((trade as any).gsi || '0.5'),
          profit: netPnl > 0 ? netPnl : 0,
          loss: netPnl < 0 ? Math.abs(netPnl) : 0,
          positionSize: quantity * avgPrice,
          timestamp: new Date().toISOString()
        };
        recordPaperTrade(paperTradeRecord);
        console.log(`[M5C.1][ACTIVE_TRADE_RECORDED] ${position.symbol}/${position.strategyName} profit=${netPnl.toFixed(2)}`);
      } catch (recordErr) {
        console.warn(`[M5C.1][ACTIVE_RECORD_FAILED] ${position.symbol}:`, recordErr);
      }
    }

    // B67.4 (2026-05-01): per-(regime, strategy) outcome feedback EMA update.
    // Mirrors the same hook in vts-service:persistRealPriceTrade — both close
    // paths feed the same singleton OutcomeFeedbackStore so signal evaluation
    // (active or VTS) reads a unified per-tuple history.
    try {
      const regimeAtOpen = (position as any).regime;
      const strategyName = position.strategyName;
      if (regimeAtOpen && strategyName && Number.isFinite(netPnlPercent)) {
        const { outcomeFeedbackStore } = await import('../core/metrics/outcome-feedback-store.js');
        const { getMarketContextEngine } = await import('./market-context-engine.js');
        const cfg = getMarketContextEngine().getCurrentOutcomeFeedbackConfig();
        if (cfg !== null) {
          // B79.0n.EXECUTION CHUNK B (2026-05-27): position-record SSOT.
          // Read assetClass directly from the position record (canonical SSOT
          // write at createPaperSimOpenPosition L2147). Defensive fallback to
          // safeResolveAssetClass is BELT-AND-SUSPENDERS, NOT load-bearing —
          // L922 B79.TEC NO_FALLBACK hard-fails on a position missing
          // assetClass before flow ever reaches this hook. The fallback locks
          // safe behavior against future drift (e.g., new caller paths that
          // bypass L922 invariants). Per-class isolation prevents crypto
          // outcome contamination of xstock signals and vice-versa.
          // [Pre-B79.0n.EXECUTION: re-resolved from symbol via
          // safeResolveAssetClass(position.symbol, 'kraken') — drift cleanup
          // per Langston Step 1.a Q4-B audit + Step 2 B2 reframe.]
          const { safeResolveAssetClass } = await import('../../shared/asset-classes.js');
          const _assetClass = (position as any).assetClass ?? safeResolveAssetClass(position.symbol, 'kraken');
          if (_assetClass !== null) {
            // ITEM-4 step 2 (D9): this per-mode engine writes ITS OWN partition
            // (carried mode → RunMode via the single mapping site) — a paper_sim
            // close can never blend into the vts-trained aggregate (#210/D9 fix).
            const { getCalibrationEpoch } = await import('../core/metrics/calibration-epoch.js');
            const _learnSource = tradingModeToRunMode(this.mode);
            outcomeFeedbackStore.updateEma(
              _learnSource,
              _assetClass,
              regimeAtOpen,
              strategyName,
              netPnlPercent,
              cfg.alpha,
              Date.now(),
              // B-5 (Obj-12): class-scoped epoch (most-specific-wins; wildcard
              // when no class row exists for this source).
              getCalibrationEpoch(_learnSource, _assetClass),
            );
          }
        }
      }
    } catch (err) {
      console.warn(
        '[B67.4][paper-execution] outcome feedback update failed:',
        err instanceof Error ? err.message : err,
      );
    }

    // [AJ19-B] Trade lifecycle CLOSE event - track slot counts before/after delete
    const slotCountBefore = (await storage.getPaperSimOpenPositions(this.mode)).length;
    let deleteSuccessful = false;
    let deleteError: string | undefined;
    
    // B65.2 / B80 (2026-05-13): clear trailing engine state after close-row
    // is updated with the final tradeMode. Decrements the concurrent-moonbag
    // counter if this trade was in TRAILING_TAKE mode. Pre-B80 keyed by
    // symbol — wiped state for ALL concurrent positions on the symbol.
    // Post-B80 keyed by position.id — only this position's state is cleared,
    // other concurrent positions on the same symbol are untouched.
    try {
      const { clearTrailingState } = await import('./trailing-exit-controller.js');
      clearTrailingState(position.id);
    } catch (err) {
      console.error(`[B65.2][TEC] Failed to clear trailing state for positionId=${position.id} symbol=${position.symbol}:`, err);
    }

    // Delete open position with error handling for AJ19-B
    try {
      await storage.deletePaperSimOpenPosition(this.mode, positionId);
      deleteSuccessful = true;
      console.log(`[AJ19-B][DELETE_SUCCESS] positionId=${positionId} | symbol=${position.symbol}`);
      
      // Phase 8.8.3-B3.6: Unsubscribe from Kraken WebSocket after position close
      // Phase 8.8.3-I6-FIX: Enhanced diagnostic logging for unsubscription audit
      try {
        krakenWebSocketAdapter.unsubscribeFromSymbols([position.symbol]);
        console.log(`[8.8.3-I6-FIX][WS_UNSUB] closedSymbol=${position.symbol} | action=unsubscribe`);
        console.log(`[KrakenWS] Unsubscribed from ${position.symbol} after position close`);
      } catch (wsUnsubError) {
        console.warn(`[8.8.3-I6-FIX][WS_UNSUB_FAILED] symbol=${position.symbol} error=${wsUnsubError}`);
        console.warn(`[KrakenWS] Failed to unsubscribe from ${position.symbol}:`, wsUnsubError);
      }
    } catch (delErr: any) {
      deleteError = delErr.message || 'Unknown delete error';
      console.error(`[AJ19-B][DELETE_FAILED] positionId=${positionId} | symbol=${position.symbol} | error=${deleteError}`);
    }
    
    // Get slot count after delete attempt
    const slotCountAfter = (await storage.getPaperSimOpenPositions(this.mode)).length;
    
    // Map exit condition to close reason enum
    const closeReasonMap: Record<string, 'SL' | 'TP' | 'TRAILING_STOP' | 'MANUAL' | 'KILL_SWITCH' | 'ENGINE_STOP' | 'UNKNOWN'> = {
      'stop_hit': 'SL',
      'target_hit': 'TP',
      'trailing_stop_hit': 'TRAILING_STOP',
      'max_holding_period': 'UNKNOWN',
      'guardrail': 'KILL_SWITCH'
    };
    
    // Log AJ19-B close event
    try {
      await aj19bDiagnostic.logClose({
        tradeId: trade?.id,
        positionId: positionId,
        symbol: position.symbol,
        closeReason: closeReasonMap[exitCondition.type] || 'UNKNOWN',
        closedValue: actualExitPrice * quantity,
        pnl: netPnl,
        slotCountBefore,
        slotCountAfter,
        deleteSuccessful,
        deleteError,
        mode: this.mode
      }, this.mode);
    } catch (aj19bErr) {
      console.error('[AJ19-B] Error logging close event:', aj19bErr);
    }

    // [8.8.3-F][CLOSE] REB 8.8.3-F: Lifecycle log for trade closed
    console.log(`[8.8.3-F][CLOSE]`, JSON.stringify({
      tradeId: trade?.id || null,
      symbol: position.symbol,
      strategy: position.strategyName,
      direction: position.side,
      entryPrice: avgPrice,
      exitPrice: actualExitPrice,
      size: quantity,
      grossPnl: grossPnl,
      netPnl: netPnl,
      pnlPercent: pnlPercent,
      fees: totalFees,
      closeReason: exitCondition.type,
      timestamp: new Date().toISOString()
    }));
    
    // [AJ18] Trade lifecycle - CLOSE event
    const openTime = position.openedAt ? new Date(position.openedAt).getTime() : Date.now();
    const holdingMinutes = (Date.now() - openTime) / 60000;
    aj18Diagnostic.logTradeLifecycle({
      cycleId: aj18Diagnostic.getCycleId(),
      eventType: 'CLOSE',
      tradeId: trade?.id,
      symbol: position.symbol,
      strategy: position.strategyName,
      entryPrice: avgPrice,
      exitPrice: actualExitPrice,
      pnl: netPnl,
      closeReason: exitCondition.type,
      holdingDurationMinutes: holdingMinutes
    });

    // [8.8.3-I1] Trade lifecycle close event
    const isForceClose = exitCondition.type === 'manual_stop' || exitCondition.type === 'guardrail';
    if (isForceClose) {
      i1TradeLifecycleDiagnostics.logForceClose(
        trade?.id || positionId,
        position.symbol,
        position.strategyName || 'unknown',
        actualExitPrice,
        netPnl
      );
    } else {
      const closeReason = exitCondition.type as any;
      i1TradeLifecycleDiagnostics.logClose(
        trade?.id || positionId,
        position.symbol,
        position.strategyName || 'unknown',
        closeReason,
        actualExitPrice,
        netPnl,
        'normal'
      );
    }

    console.log(`[PaperExecution:${this.mode}] Position ${position.symbol} closed successfully`);
    
    // Phase 8.8.3-C5-3: P/L Sanity Check - verify P/L calculations match
    c5FinancialDiagnostics.logPnlReconciliation(
      this.mode,
      trade?.id || positionId,
      position.symbol,
      grossPnl,
      entryFee,
      entrySlippage,
      exitFee,
      exitSlippage,
      netPnl
    );
    
    // Phase 8.8.3-C5-1: Balance Reconciliation after trade close
    const isManualClose = exitCondition.type === 'manual_stop';
    await c5FinancialDiagnostics.logBalanceReconciliation(
      this.mode,
      isManualClose ? 'manual_close' : 'trade_close'
    );

    // Phase 8.8.4-C.12: Emit TRADE_CLOSED event (triggers RTB promotion via event handler)
    // B79.0n.EXECUTION CHUNK A (2026-05-27): populate assetClass from position
    // record (canonical SSOT write at L2147 createPaperSimOpenPosition). Same
    // C-7 doctrine as PromotionEvent — additive optional field, zero handler
    // breakage. See TradeClosedEvent interface in server/lib/event-bus.ts.
    const _tcAssetClass = (position as any).assetClass as string | undefined;
    // B79.0n.EXECUTION CHUNK A canary (per Langston Step 2 B2) — runtime probe
    // for operators to confirm assetClass populates correctly per class once
    // xstock active trading lights up at WIRE-IN (#14). Optional, no-cost.
    console.log(
      `[B79.0n.EXECUTION][EMIT_TRADE_CLOSED] mode=${this.mode} class=${_tcAssetClass ?? 'undefined'} symbol=${position.symbol} tradeId=${trade?.id || positionId}`
    );
    eventBus.emitTradeClosed({
      mode: this.mode,
      symbol: position.symbol,
      strategy: position.strategyName || 'unknown',
      tradeId: trade?.id || positionId,
      pnl: netPnl,
      timestamp: new Date().toISOString(),
      assetClass: _tcAssetClass,
    });
  }

  /**
   * Phase 8.8.4-B + C.5 + C.12 + C.14.B: Check for RTB Queue Promotion
   * Called via event handlers (TCL_ACTIVATED, TRADE_CLOSED) when promotion may be possible
   * Phase C.12: Uses tclWatchdog for event-driven TCL state management
   * Phase C.14.B: Multi-signal promotion - promotes all eligible signals up to openSlots limit
   */
  private async checkRtbPromotion(): Promise<void> {
    try {
      // Phase 8.8.4-C.12: Check TCL activation state via watchdog
      const tclActive = tclWatchdog.isActive(this.mode);
      if (!tclActive) {
        const tclStatus = tclWatchdog.getStatus(this.mode);
        console.log(`[8.8.4-C.12][TCL_WARMUP] mode=${this.mode}, state=${tclStatus.state}, elapsed=${(tclStatus.elapsedMs/1000).toFixed(0)}s - skipping promotion`);
        return;
      }

      // Phase 8.8.4-C.14.B: Calculate available slots for multi-signal promotion
      const openPositions = await storage.getPaperSimOpenPositions(this.mode);
      const modeSettings = await buildSettingsFromGuardrails(this.mode);
      const maxTrades = modeSettings.maxOpenTrades || 15;
      let openSlots = maxTrades - openPositions.length;

      if (openSlots <= 0) {
        console.log(`[RTB-Promotion:${this.mode}] At capacity (${openPositions.length}/${maxTrades}), skipping promotion`);
        return;
      }

      console.log(`[8.8.4-C.14.B][MULTI_PROMOTE] mode=${this.mode}, openSlots=${openSlots}, maxTrades=${maxTrades}`);

      // Phase 8.8.4-C.14.B: Get all ranked signals and promote up to openSlots
      const rankedSignals = await readyToBuyService.getRankedSignals(this.mode, openSlots);

      if (!rankedSignals || rankedSignals.length === 0) {
        console.log(`[RTB-Promotion:${this.mode}] No queued signals available for promotion`);
        return;
      }

      let promotedCount = 0;
      let failedCount = 0;

      // Phase 8.8.4-C.14.B: Loop through ranked signals and promote all eligible
      for (const signal of rankedSignals) {
        if (openSlots <= 0) {
          console.log(`[8.8.4-C.14.B][SLOT_LIMIT] No more open slots, stopping promotion loop`);
          break;
        }

        // Phase 14.1 HF8 (B1): Duplicate FinalScore check REMOVED — SQE already enforces FinalScore >= 0.35
        // (signal_quality_evaluator.ts line 130). Signals reaching this point have already passed SQE.
        const finalScore = parseFloat(signal.finalScore || '0');
        console.log(`[11.0E][TCL_PROMOTE] ${signal.symbol}/${signal.strategy} with FinalScore ${finalScore.toFixed(4)}`);

        // B-5 AMR (Obj-6, pre-audit §2 site 2): promotion-time RE-CHECK —
        // queue residency means admission-time checks can stale; hard-pause
        // and slot-cap are re-asked per signal here. Under enforce a block
        // DEFERS the signal (stays in queue); shadow records the would-block.
        {
          // P19-B6.5d: prefer the carried signal stamp (collision-correct); safe-resolve
          // only as fallback, and flag a missing stamp — a stamp absent on the active
          // promotion path is a pipe-entry bug (Langston §B stamp-missing-active).
          const _promoStamp = asValidAssetClass(signal.metadata?.assetClass);
          const _promoClass = _promoStamp ?? safeResolveAssetClass(signal.symbol, 'kraken');
          if (!_promoStamp && _promoClass) {
            console.warn(`[P19-B6.5d][STAMP_MISSING_ACTIVE] rtb_promotion re-derived asset class for ${signal.symbol} — the sizing stamp should have been carried`);
          }
          if (_promoClass !== null) {
            try {
              const { evaluateAmrGates } = await import('../core/governance/amr-gates.js');
              const sameClassCount = openPositions.filter(p => (asValidAssetClass((p as { assetClass?: unknown }).assetClass) ?? safeResolveAssetClass(p.symbol, 'kraken')) === _promoClass).length;
              const gate = evaluateAmrGates({
                assetClass: _promoClass,
                site: 'rtb_promotion',
                strategy: signal.strategy,
                openPositionCountForClass: sameClassCount,
              });
              if (!gate.allowed) {
                console.log(`[B-5][RTB][AMR_GATE] DEFER ${signal.symbol}: ${gate.blocks.map(b => b.gate).join(',')} (mode=${gate.mode})`);
                continue;
              }
            } catch (gateErr) {
              console.warn(`[B-5][RTB] AMR gate error (promotion continues): ${gateErr instanceof Error ? gateErr.message : gateErr}`);
            }
          }
        }

        // P19-B7.2b (Kyle model 2026-07-01): a maker-chosen signal is NOT posted as a
        // resting order in the RTBQ (the B7.2 make-then-take-POST branch was removed —
        // wrong stage; the signal carries a decision only while queued). At promotion it
        // proceeds to open. The real Kraken maker resting-order placement + fill/timeout/
        // convert lifecycle is post-promotion = Phase-21 (RUNNING_ISSUES + Phase-21 plan);
        // dormant in Phase-19, so a promoted maker-chosen signal opens through the normal
        // path below with its chosen mode carried on the signal for the [11.8B] gate.

        // Directive 8.8.4-A3.R1: RTB removal must precede trade creation to prevent double-activation
        // Step 1: Remove signal from RTB queue BEFORE attempting trade execution
        await readyToBuyService.promoteSignal(signal.id, 'pending');
        console.log(`[8.8.4-A3.R1][PROMOTION_ORDER] RTB signal ${signal.symbol} removed before trade creation`);
        
        // Step 2: Execute the promoted signal (create trade)
        const tradeResult = await this.executePromotedSignal(signal);

        if (tradeResult.success && tradeResult.tradeId) {
          // Step 3: Update signal with actual trade ID
          await readyToBuyService.promoteSignal(signal.id, tradeResult.tradeId);
          
          // Step 4: Emit PROMOTION event for diagnostics (after both removal and trade creation succeed)
          eventBus.emitPromotion({
            mode: this.mode,
            symbol: signal.symbol,
            strategy: signal.strategy,
            signalId: signal.signalId,
            tradeId: tradeResult.tradeId,
            timestamp: new Date().toISOString(),
          });
          
          console.log(`[RTB-Promotion:${this.mode}] ✅ Successfully promoted ${signal.symbol}/${signal.strategy} -> Trade ${tradeResult.tradeId}`);
          promotedCount++;
          openSlots--;
        } else {
          // Trade execution failed - signal already removed from RTB, log warning
          console.warn(`[RTB-Promotion:${this.mode}] ⚠️ Failed to execute promoted signal: ${tradeResult.error || 'unknown error'}`);
          console.warn(`[8.8.4-A3.R1][PROMOTION_ORDER] Signal ${signal.symbol} was removed from RTB but trade failed - signal not restored`);
          failedCount++;
        }
      }

      console.log(`[8.8.4-C.14.B][PROMOTION_SUMMARY] mode=${this.mode}, promoted=${promotedCount}, failed=${failedCount}, remainingSlots=${openSlots}`);
    } catch (error) {
      console.error(`[RTB-Promotion:${this.mode}] Error during promotion check:`, error);
    }
  }

  /**
   * Phase 8.8.4-B: Execute a promoted RTB signal
   */
  private async executePromotedSignal(signal: any): Promise<{ success: boolean; tradeId?: string; error?: string }> {
    try {
      const entryPrice = parseFloat(signal.entryPrice);
      const stopPrice = parseFloat(signal.stopPrice);
      const targetPrice = signal.targetPrice ? parseFloat(signal.targetPrice) : entryPrice * 1.02; // Default 2% target
      const quantity = signal.quantity ? parseFloat(signal.quantity) : undefined;
      const notional = signal.notional ? parseFloat(signal.notional) : undefined;

      // Build a StrategySignal compatible object for processSignal
      const promotedSignal: StrategySignal = {
        symbol: signal.symbol,
        strategy: signal.strategy,
        type: 'LONG',
        entryPrice: entryPrice,
        stopPrice: stopPrice,
        targetPrice: targetPrice,
        confidence: parseFloat(signal.confidence),
        timestamp: new Date(),
        reason: `RTB Promoted (FinalScore: ${signal.finalScore || '0'})`,
        signalId: signal.signalId,
        quantity: quantity,
        estimatedValue: notional,
        preComputedNotional: notional,
        // reorg-B3 (#233): carry the at-queue EV inputs from the rtb row's TYPED columns onto the
        // promoted StrategySignal (typed top-level fields, NOT metadata) so the open-gate Net-
        // Expectancy kernel reads the routing-time FX5 survivor snapshot. Parsed string→number here
        // (decimal columns arrive as strings); NULL stays NULL → kernel documented defaults at the
        // gate (DI=50 / strong-trend 0.40 floor). The DB columns remain the queryable SSOT for the
        // OBJ-4 rtb-metrics EV-reject breakdown; this object field is only the in-memory carrier.
        diAtQueue: signal.diAtQueue != null ? parseFloat(signal.diAtQueue) : null,
        dbsScoreAtQueue: signal.dbsScoreAtQueue != null ? parseFloat(signal.dbsScoreAtQueue) : null,
        // P19-B7.2 (OBJ-3): carry the best-of-both maker/taker snapshot onto the promoted
        // signal so the [11.8B] open-gate reads the CHOSEN-mode netEV (the single-consistent
        // number), not a taker-only recompute — this is what lets a maker-chosen crypto
        // opener (taker-EV<0, maker-adjusted-EV>0) pass the gate. NULL (pre-B7.2 rows) →
        // the gate falls back to its taker recompute (no behavior change).
        chosenEntryMode: (signal.chosenEntryMode as 'taker' | 'maker' | undefined) ?? 'taker',
        chosenNetEv: signal.chosenNetEv != null ? parseFloat(signal.chosenNetEv) : null,
        // P19-B7.2c: the gen-time TAKER-leg netEV (produced by the kernel inside
        // decideMakerTaker at signal-gen — taker-priced by construction). Read by the
        // marketable-at-placement stored-taker check: if a maker order can't be rested
        // (market already through the limit), takerNetEv>0 → open as taker now, else drop.
        takerNetEv: signal.takerNetEv != null ? parseFloat(signal.takerNetEv) : null,
        metadata: {
          source: 'RTB_PROMOTION',
          originalSignalId: signal.signalId,
          rtbQueueId: signal.id,
          queuedAt: signal.queuedAt,
          // reorg-B3 (#233): carry the rtb row's persisted sourcePool onto the promoted signal so the
          // open-gate Net-Expectancy kernel can take the STRONG-TREND pWin branch. The conversion
          // previously dropped sourcePool → the open-gate saw `undefined` → the kernel always used the
          // standard DI branch, so the dbsScore thread (H2 — the lone EV-relevant fix) could NEVER
          // fire on a real promoted signal. Read from the rtb row's persisted metadata.sourcePool
          // (queueSQESignal enrichedMetadata). The open-gate reads it via `signal.metadata?.sourcePool`.
          sourcePool: (signal.metadata as any)?.sourcePool,
        }
      } as any;

      // P19-B6.5e: read the typed open outcome directly from processSignal — no more
      // brittle trade-count-delta inference (which silently mapped EVERY post-guardrail
      // failure to a generic "no new trade created" and hid the actual stage). The
      // openFailed stage+reason now flow straight through to the promote-loop log.
      const outcome = await this.processSignal(promotedSignal);
      if (outcome.opened) {
        return { success: true, tradeId: outcome.tradeId };
      }
      return { success: false, error: `${outcome.stage}: ${outcome.reason}` };
    } catch (error: any) {
      return { success: false, error: error.message || 'Exception during promoted signal execution' };
    }
  }

  // Directive 8.8.4-A3.R9.3: Deprecated methods removed
  // - scanForSignals() - removed
  // - checkSymbolForSignal() - removed  
  // - injectForcedTrade() - removed
  // All signal generation now flows through: FX5 → SignalOrchestrator → SQE → RTB → TCL

  // Phase 8.8.3-J7: Added cycleContext parameter for paper-mode sizing
  // Phase 8.8.4-A: Added signalId for SLAL lifecycle tracking
  private async executeSimulatedTrade(
    // reorg-B3 (#233): diAtQueue/dbsScoreAtQueue are the at-queue EV inputs carried onto the
    // promoted signal (already parsed string→number at the rtb-row→StrategySignal conversion).
    // Optional → a non-promotion-path signal (FX5/orchestrator direct) simply has them undefined
    // → kernel documented defaults.
    signal: StrategySignal & { quantity?: number; estimatedValue?: number; signalId?: string; diAtQueue?: number | null; dbsScoreAtQueue?: number | null; chosenEntryMode?: 'taker' | 'maker'; chosenNetEv?: number | null; takerNetEv?: number | null },
    settings: TradingSettings,
    cycleContext?: { portfolioValue: number; guardrails: GuardrailsV2 | null }
  ): Promise<OpenOutcome> {
    // P19-B6.5e: returns a typed OpenOutcome. Every post-guardrail early-exit below
    // records an `openFailed` (so the I3 invariant reconciles) AND returns a labelled
    // `{opened:false,stage,reason}` — the open can no longer silently vanish.
    console.log(`[PaperExecution:${this.mode}] Signal detected for ${signal.symbol}:`);
    console.log(`  Strategy: ${signal.strategy}, Confidence: ${(signal.confidence * 100).toFixed(1)}%`);
    console.log(`  Entry: ${signal.entryPrice.toFixed(2)}, Stop: ${signal.stopPrice.toFixed(2)}, Target: ${signal.targetPrice.toFixed(2)}`);

    // [AJ19] Log signal generated for diagnostic tracking
    aj19Diagnostic.logSignalGenerated({
      symbol: signal.symbol,
      strategy: signal.strategy,
      entryPrice: signal.entryPrice,
      stopPrice: signal.stopPrice,
      targetPrice: signal.targetPrice,
      confidence: signal.confidence,
      estimatedValue: signal.estimatedValue,
      quantity: signal.quantity,
      mode: this.mode
    });

    // [AJ19] DryRunNoGuardrails mode: Skip guardrails and trade creation, just log
    if (aj19Diagnostic.isDryRunNoGuardrails()) {
      aj19Diagnostic.logWouldBeTrade({
        symbol: signal.symbol,
        strategy: signal.strategy,
        entryPrice: signal.entryPrice,
        stopPrice: signal.stopPrice,
        targetPrice: signal.targetPrice,
        confidence: signal.confidence,
        estimatedValue: signal.estimatedValue,
        quantity: signal.quantity,
        portfolioValue: cycleContext?.portfolioValue,
        mode: this.mode,
        reason: 'Signal passed filters and strategies - would open trade in normal mode'
      });
      
      console.log(`[AJ19][DRY_RUN_NO_GUARDRAILS] Skipping guardrails and trade creation for ${signal.symbol}`);
      // P19-B6.5e: pre-attempt skip (no recordAttempt yet) → NOT recorded as openFailed.
      return { opened: false, stage: 'DRY_RUN', reason: 'dry-run-no-guardrails' };
    }

    // Phase 8.8.3-H4: Pre-trade guardrail checks (replaces legacy RiskManager)
    // AJ10.1: Include pre-computed notional from P2 sizing so MAX_POSITION check trusts it
    // Phase 8.8.4-A: Include signalId for SLAL lifecycle tracking
    const tradeCandidate: TradeCandidate = {
      symbol: signal.symbol,
      strategy: signal.strategy,
      entryPrice: signal.entryPrice,
      stopPrice: signal.stopPrice,
      targetPrice: signal.targetPrice,
      // AJ10.1: Pass the pre-sized estimatedValue so checkPositionSizeCap trusts it
      preComputedNotional: signal.estimatedValue,
      // Phase 8.8.4-A: SLAL lifecycle tracking ID
      signalId: signal.signalId,
    };

    // [B4] Log funnel attempt - signal generated, entering guardrail check
    b4Diagnostics.logFunnelEvent({
      symbol: signal.symbol,
      strategy: signal.strategy,
      stage: 'attempt',
      block_reason: null
    });

    const riskCheck = await checkGuardrailRisk(this.mode, tradeCandidate);

    if (!riskCheck.ok) {
      // [B4] Log funnel attempt blocked by guardrails
      b4Diagnostics.logFunnelEvent({
        symbol: signal.symbol,
        strategy: signal.strategy,
        stage: 'attempt',
        block_reason: riskCheck.code || riskCheck.reason || 'GUARDRAIL_BLOCK'
      });
      console.log(`[PaperExecution:${this.mode}] Paper trade rejected by guardrails: ${riskCheck.reason}`);
      
      // [8.8.3-H4][GUARDRAIL_BLOCK] Lifecycle log for guardrail rejection
      console.log(`[8.8.3-H4][GUARDRAIL_BLOCK]`, JSON.stringify({
        symbol: signal.symbol,
        strategy: signal.strategy,
        direction: 'long',
        entryPrice: signal.entryPrice,
        reason: riskCheck.reason,
        code: riskCheck.code,
        timestamp: new Date().toISOString()
      }));
      
      // [27.F.14.B] INSTRUMENTATION: Risk check failed
      console.log(`[27.F.14.B][PaperSim] risk_check_failed {symbol:"${signal.symbol}", reason:"${riskCheck.reason}"}`);
      contextBridge.broadcast({
        type: 'trading_pipeline_event' as any,
        payload: {
          mode: this.mode,
          eventType: 'risk_check_failed',
          message: `${signal.symbol} rejected: ${riskCheck.reason}`,
          timestamp: new Date().toISOString(),
          metadata: {
            symbol: signal.symbol,
            reason: riskCheck.reason,
            code: riskCheck.code,
            signal: tradeCandidate
          }
        }
      });
      
      // Log rejection
      await storage.createActiveTradeLog(this.mode, {
        tradeId: null,
        positionId: null,
        eventType: 'trade_rejected',
        message: `Trade rejected: ${signal.symbol} - ${riskCheck.reason}`,
        metadata: {
          signal: tradeCandidate,
          rejectionReason: riskCheck.reason,
          code: riskCheck.code
        }
      });
      
      // Phase 8.8.3-J: Execution Attempt Audit - BLOCKED decision (non-blocking)
      this.logExecutionAttempt({
        mode: this.mode,
        symbol: signal.symbol,
        strategy: signal.strategy,
        decision: 'BLOCKED',
        blockReason: riskCheck.code as any,
        blockDetail: riskCheck.reason,
        entryPrice: signal.entryPrice.toString(),
        stopPrice: signal.stopPrice.toString(),
        targetPrice: signal.targetPrice.toString(),
        confidence: (signal.confidence * 100).toString(),
      }).catch(err => console.error('[8.8.3-J][AUDIT_ERROR] Failed to log blocked execution attempt:', err));

      // P19-B6.5e: guardrail block already counted via checkGuardrailRisk→recordBlock;
      // label the outcome but do NOT recordOpenFailed (would double-count).
      return { opened: false, stage: 'GUARDRAIL_BLOCK', reason: riskCheck.reason || riskCheck.code || 'guardrail_block' };
    }

    // Directive 11.8B: Net Expectancy Gate
    // Check if trade has positive mathematical expectancy after fees & slippage
    // B63: Forward sourcePool + dbsScore so the kernel uses DBS-based pWin for Path D signals.
    //
    // reorg-B3 (#233): DI + dbsScore now come from the TYPED rtb_signals columns (di_at_queue /
    // dbs_score_at_queue) — the routing-time FX5 survivor snapshot frozen at queue — NOT from
    // metadata (where they were never populated → kernel defaults, the #233 bug). Decimal columns
    // arrive as strings; parse them. NULL → pass `undefined` and let the kernel apply its DOCUMENTED
    // default (expectancy.ts `DI = DI ?? 50`; net-expectancy-kernel.ts `dbsScore ?? 0` → strong-trend
    // 0.40 floor). NO coerce at THIS layer (Kyle #10): a NULL column reproduces today's default-path
    // behavior exactly, deterministically. We deliberately do NOT add a metadata fallback for these
    // two — they were never in metadata, so a fallback could only ever return undefined→default.
    //
    // NULL-on-strong-trend reachability (Langston conditions 3+4): for CRYPTO the floor default is
    // belt-and-suspenders, NOT load-bearing — a strong-trend signal (sourcePool 'quant-strong_trend',
    // |DBS|>=0.35) can ONLY originate from the FX5 scanner path, which ALWAYS carries dbsScore into
    // the pool, so dbs_score_at_queue is provably non-null for crypto strong-trend. For XSTOCK there
    // is no crypto FX5 source yet, so an xstock strong-trend signal reaches here with a NULL
    // dbs_score_at_queue → the floor handler IS load-bearing there and fails SAFE (lower pWin, fewer
    // entries). That xstock EV-input gap is surfaced (RUNNING_ISSUES), not papered over.
    // VolNoise/prices remain metadata reads (unpopulated → kernel defaults; VolNoise is not a kernel
    // EV input — ranking-only — so reorg-B3 deliberately does not thread it).
    const expectancyResult = evaluateTradeExpectancy(signal.symbol, {
      entryPrice: signal.entryPrice,
      targetPrice: signal.targetPrice,
      stopPrice: signal.stopPrice,
      DI: signal.diAtQueue ?? undefined,
      VolNoise: signal.metadata?.VolNoise,
      prices: signal.metadata?.prices,
      sourcePool: (signal as any).sourcePool ?? signal.metadata?.sourcePool,
      dbsScore: signal.dbsScoreAtQueue ?? undefined,
      // P19-B6.5d (OBJ-4): thread the carried stamp so EV friction is priced by the
      // signal's actual class, not re-derived from a (possibly collision) symbol.
    }, asValidAssetClass(signal.metadata?.assetClass) ?? undefined);

    // reorg-B3 (#233, OBJ-4): record the EV inputs that just reached the kernel — the OBJ-6 proof
    // surface. A sample with dbsScore non-null + usedStrongTrendBranch=true proves the routing-time
    // dbsScore reached evaluateTradeExpectancy and took the strong-trend pWin branch (the #233 fix
    // working), vs defaulting to the floor. Forward-instrumentation: only fills on the active path.
    const _evSourcePool = (signal as any).sourcePool ?? signal.metadata?.sourcePool;
    rtbMetricsService.recordEvInputSample({
      symbol: signal.symbol,
      strategy: signal.strategy,
      assetClass: asValidAssetClass(signal.metadata?.assetClass) ?? undefined,
      DI: signal.diAtQueue ?? null,
      dbsScore: signal.dbsScoreAtQueue ?? null,
      sourcePool: _evSourcePool,
      usedStrongTrendBranch: _evSourcePool === 'quant-strong_trend',
      netEV: expectancyResult.netEV,
      isTradeable: expectancyResult.isTradeable,
      rejectionReason: expectancyResult.rejectionReason,
      timestamp: Date.now(),
    });

    // ── P19-B7.2 (OBJ-3): honor the best-of-both chosen-mode netEV ────────────
    // evaluateTradeExpectancy recomputes the TAKER leg (its only rejection is the
    // EV sign, netEV>0). The best-of-both decision was made once at signal-gen and
    // snapshotted as chosen_net_ev (the single-consistent number — for maker it is
    // the haircut-adjusted, pFill-weighted maker netEV). Take the EV-SIGN pass/fail
    // from that snapshot so a maker-chosen crypto opener (taker netEV<0, chosen
    // netEV>0) passes while its taker recompute would reject. The taker recompute
    // still supplies score/pWin/diagnostics. NULL snapshot (pre-B7.2 rows / a
    // non-snapshotted path) → fall back to the taker isTradeable (no change).
    // The chosen-leg taker branch equals this recompute exactly (same at-queue DI,
    // same kernel, same friction), so a taker-chosen signal is unaffected.
    const _b72ChosenNetEv = (signal as any).chosenNetEv != null ? Number((signal as any).chosenNetEv) : null;
    const _b72ChosenMode: 'taker' | 'maker' = ((signal as any).chosenEntryMode as 'taker' | 'maker') ?? 'taker';
    const _b72IsTradeable = _b72ChosenNetEv != null ? (_b72ChosenNetEv > 0) : expectancyResult.isTradeable;
    const _b72EffectiveNetEv = _b72ChosenNetEv != null ? _b72ChosenNetEv : expectancyResult.netEV;

    if (!_b72IsTradeable) {
      // [B4] Log funnel attempt blocked by Net Expectancy Gate
      b4Diagnostics.logFunnelEvent({
        symbol: signal.symbol,
        strategy: signal.strategy,
        stage: 'attempt',
        block_reason: 'EV_REJECT'
      });

      const _b72RejReason = _b72ChosenNetEv != null
        ? `chosen ${_b72ChosenMode} NetEV=${_b72EffectiveNetEv.toFixed(6)} (best-of-both non-positive after friction + haircut)`
        : expectancyResult.rejectionReason;
      console.log(`[11.8B][EV_BLOCK] ${signal.symbol} rejected: ${_b72RejReason}`);
      console.log(`[PaperExecution:${this.mode}] Paper trade rejected by Net Expectancy Gate: ${_b72RejReason}`);

      // Log rejection
      await storage.createActiveTradeLog(this.mode, {
        tradeId: null,
        positionId: null,
        eventType: 'trade_rejected',
        message: `Trade rejected by Net Expectancy Gate: ${signal.symbol} - ${_b72RejReason}`,
        metadata: {
          signal: tradeCandidate,
          rejectionReason: _b72RejReason,
          code: 'EV_REJECT',
          // P19-B7.2: the effective (chosen-mode best-of-both) EV drove the decision.
          ev: _b72EffectiveNetEv,
          chosenEntryMode: _b72ChosenMode,
          takerNetEv: expectancyResult.netEV,
          score: expectancyResult.score
        }
      });

      // P19-B6.5e: Net-Expectancy gate is a POST-guardrail open-stage failure.
      rtbMetricsService.recordOpenFailed(signal.symbol, signal.strategy, 'EV_REJECT', _b72RejReason || 'negative net expectancy');
      return { opened: false, stage: 'EV_REJECT', reason: _b72RejReason || 'negative net expectancy' };
    }

    // Log expectancy gate pass with score for future analytics
    // P19-B7.2: report the chosen entry mode + its effective (best-of-both) EV.
    console.log(`[11.8B][EV_PASS] ${signal.symbol} mode=${_b72ChosenMode} EV=${_b72EffectiveNetEv.toFixed(6)} (taker=${expectancyResult.netEV.toFixed(6)}) Score=${expectancyResult.score.toFixed(1)}`);

    // [B4] Log funnel RTB - signal passed all guardrails, ready to buy
    b4Diagnostics.logFunnelEvent({
      symbol: signal.symbol,
      strategy: signal.strategy,
      stage: 'rtb',
      block_reason: null
    });

    // [27.F.14.B] INSTRUMENTATION: Risk check passed
    console.log(`[27.F.14.B][PaperSim] risk_check_passed {symbol:"${signal.symbol}"}`);
    contextBridge.broadcast({
      type: 'trading_pipeline_event' as any,
      payload: {
        mode: this.mode,
        eventType: 'risk_check_passed',
        message: `${signal.symbol} passed all risk checks`,
        timestamp: new Date().toISOString(),
        metadata: { symbol: signal.symbol }
      }
    });

    // Phase 8.8.3-J7: Use pre-sized quantity from signal (computed at P2)
    // For paper mode, use the pre-computed quantity; for live mode, use fallback calculation
    let quantity: number;
    let portfolioValue: number;
    let riskAmount: number;
    
    if (this.mode === 'paper' && signal.quantity && signal.quantity > 0) {
      // J7: Use pre-sized quantity from P2
      quantity = signal.quantity;
      portfolioValue = cycleContext?.portfolioValue || 0;
      const riskPct = parseFloat(String(cycleContext?.guardrails?.portfolioRiskPerTradePct || '1.50'));
      riskAmount = (portfolioValue * riskPct) / 100;
      console.log(`[J7][EXEC_P3] Using pre-sized quantity: ${quantity.toFixed(8)} (portfolio: $${portfolioValue.toFixed(2)})`);
    } else {
      // Fallback for live mode or if no pre-sized quantity (should not happen in paper mode after J7)
      portfolioValue = parseFloat(settings.portfolioValue || '0');
      if (portfolioValue <= 0) {
        console.error(`[J7][EXEC_P3_ERROR] No valid portfolio value for ${this.mode} mode - cannot size position`);
        rtbMetricsService.recordOpenFailed(signal.symbol, signal.strategy, 'SIZING_INVALID', `no valid portfolio value (${portfolioValue})`);
        return { opened: false, stage: 'SIZING_INVALID', reason: `no valid portfolio value (${portfolioValue})` };
      }
      const riskPerTradePct = parseFloat(settings.riskPerTradePct || '4.0');
      riskAmount = (portfolioValue * riskPerTradePct) / 100;
      const stopDistance = Math.abs(signal.entryPrice - signal.stopPrice);
      quantity = stopDistance > 0 ? riskAmount / stopDistance : 0;
      console.log(`[J7][EXEC_P3_FALLBACK] Calculated quantity: ${quantity.toFixed(8)} (mode: ${this.mode})`);
    }
    
    if (quantity <= 0) {
      console.log(`[8.8.3-F][RISK_REJECT] Invalid position size (quantity=${quantity}) - skipping trade`);
      rtbMetricsService.recordOpenFailed(signal.symbol, signal.strategy, 'SIZING_INVALID', `invalid position size (quantity=${quantity})`);
      return { opened: false, stage: 'SIZING_INVALID', reason: `invalid position size (quantity=${quantity})` };
    }

    // P19-B4b.1: resolve the position class BEFORE the depth gate + fill — an
    // unclassifiable symbol skips here rather than reaching the fill with no class.
    const _openClass = asValidAssetClass(signal.metadata?.assetClass) ?? safeResolveAssetClass(signal.symbol, 'kraken');
    if (_openClass === null) {
      console.warn('[P19-B4b.1][OPEN_SKIP] unclassifiable ' + signal.symbol + ' — refusing to open without a class');
      rtbMetricsService.recordOpenFailed(signal.symbol, signal.strategy, 'UNCLASSIFIABLE', 'unclassifiable symbol at open');
      return { opened: false, stage: 'UNCLASSIFIABLE', reason: 'unclassifiable symbol at open' };
    }

    // P19-B4b.1 (#295): 24/5 book-depth-sufficiency + warmth gate BEFORE the fill,
    // replacing the B4a-C3 RTH liquid-fill-window clock proxy. Fail-closed — a missing
    // config / cold / thin / insufficient book skips the open loudly (observable counter).
    const _gate = await this._evaluateOpenDepthGate(signal.symbol, _openClass, signal.entryPrice * quantity);
    if (!_gate.pass || !_gate.snapshot) {
      console.warn(`[P19-B4b.1][DEPTH_GATE_BLOCK:${this.mode}] ${signal.symbol} (${_openClass}) ${_gate.reason} — skipping open`);
      recordDepthGateBlock(_openClass, _gate.reason); // fine-grained per-class counter (unchanged)
      // P19-B6.5e: ALSO fold into the I3 invariant so the open no longer vanishes from attempts=opened+blocked+openFailed.
      rtbMetricsService.recordOpenFailed(signal.symbol, signal.strategy, 'DEPTH_GATE', _gate.reason);
      return { opened: false, stage: 'DEPTH_GATE', reason: _gate.reason };
    }

    // P19-B6.6 (#236): price-discovery-LIVENESS — the 2nd half of the fill-time "is the
    // book real?" guard. Runs AFTER the depth gate (cheap single top-of-book row) passes —
    // depth-first ordering, explicit. xStock-ONLY (crypto trades 24/7, no holiday/halt
    // analog → a liveness gate would false-block a quiet altcoin). Fail-closed: the token's
    // `last` must have actually MOVED within the window, else the book is dead-but-quoted
    // (holiday / LULD halt / glitch / feed death) → block. Same recordDepthGateBlock
    // telemetry path; the reason codes (flat_last vs no_data/sparse/liveness_*) distinguish
    // a genuine dead market from a feed/config outage. Dormant until B7b (§9.1).
    if (_openClass === 'xstock_spot') {
      const _live = await evaluateXstockPriceLiveness(signal.symbol);
      if (!_live.live) {
        console.warn(`[P19-B6.6][LIVENESS_BLOCK:${this.mode}] ${signal.symbol} (${_openClass}) ${_live.reason} — skipping open`);
        recordDepthGateBlock(_openClass, _live.reason); // distinct reason bucket from the depth gate
        rtbMetricsService.recordOpenFailed(signal.symbol, signal.strategy, 'LIVENESS_GATE', _live.reason);
        return { opened: false, stage: 'LIVENESS_GATE', reason: _live.reason };
      }
    }

    // ── P19-B7.2c: post-promotion PENDING maker order (Kyle model, SIMPLIFIED 2026-07-02).
    // A maker-chosen promotion does NOT fill now — it RESTS as a state='pending' position
    // (holds a slot) at the maker limit (= the signal entry) until the real price trades
    // through it (monitor pre-pass → 'open' at limit + maker fee) or the hard-drop deadline
    // fires (→ DROPPED, period — no convert re-evaluation). EXCEPT: if the market is ALREADY
    // through the limit at placement (best ask ≤ limit for a buy), a real post-only would
    // REJECT — so run the stored-taker check instead: the gen-time takerNetEv (the kernel's
    // taker leg inside decideMakerTaker — taker-priced by construction; gate is a gen
    // snapshot ≤~30s stale via the promotion loop, the fill is live — documented
    // approximation) → >0 falls through to the NORMAL taker fill below with the record
    // flipped to taker (accounting-only; the EV kernel never reads the mode), else DROP
    // (maker_marketable_dropped — a non-trade, never a closed-trade P&L).
    let _b72cEffectiveMode: 'taker' | 'maker' = _b72ChosenMode;
    let _b72cPendingMaker = false;
    const _b72cLimit = signal.entryPrice;
    if (_b72ChosenMode === 'maker') {
      const _b72cBestAsk = _gate.snapshot.asks[0]?.price;
      if (_b72cBestAsk != null && isMarketableAtPlacement('buy', _b72cBestAsk, _b72cLimit)) {
        const _b72cStoredTakerEv = signal.takerNetEv;
        if (_b72cStoredTakerEv != null && _b72cStoredTakerEv > 0) {
          _b72cEffectiveMode = 'taker';
          console.log(`[P19-B7.2c][MARKETABLE_TAKER_FALLBACK:${this.mode}] ${signal.symbol}: maker limit ${_b72cLimit} already marketable (bestAsk=${_b72cBestAsk}) — stored takerNetEv=${_b72cStoredTakerEv.toFixed(6)}>0 → opening as taker now`);
        } else {
          console.log(`[P19-B7.2c][MAKER_MARKETABLE_DROPPED:${this.mode}] ${signal.symbol}: maker limit ${_b72cLimit} already marketable (bestAsk=${_b72cBestAsk}) and stored takerNetEv=${_b72cStoredTakerEv ?? 'null'} not positive — dropped (non-trade)`);
          rtbMetricsService.recordOpenFailed(signal.symbol, signal.strategy, 'MAKER_MARKETABLE_DROPPED', 'maker limit marketable at placement; stored taker EV not positive');
          return { opened: false, stage: 'MAKER_MARKETABLE_DROPPED', reason: 'maker marketable at placement; taker EV not positive' };
        }
      } else {
        _b72cPendingMaker = true;
      }
    }

    // P19-B4b.1: entry fill via the DEPTH-WALKED OrderPlacer port — the placer walks the
    // gate's ask snapshot → VWAP fill (replaces the flat 0.05% slippage). `partial` = the
    // book thinned between gate and fill (size the position down); `rejected` = no fillable book.
    // P19-B7.2c: SKIPPED for a pending maker — no fill happens now; the position rests at
    // the limit with the maker fee RESERVED (charged only if/when the monitor pre-pass fills it).
    let actualEntryPrice: number;
    let entryFee: number;
    let totalSlippage: number;
    if (_b72cPendingMaker) {
      actualEntryPrice = _b72cLimit;
      entryFee = _b72cLimit * quantity * getFrictionForAssetClass(_openClass).feeRateMaker;
      totalSlippage = 0; // a maker fill at the resting limit pays no taker slippage
    } else {
    const _openFill = await this.orderPlacer.openOrder({
      symbol: signal.symbol, side: 'buy', quantity, intendedPrice: signal.entryPrice,
      mode: this.mode, assetClass: _openClass, bookAsks: _gate.snapshot.asks,
    });
    if (_openFill.status === 'rejected') {
      console.error(`[PaperExecution:${this.mode}][OPEN_FILL_REJECTED] ${signal.symbol} reason=${_openFill.reason} — skipping trade`);
      rtbMetricsService.recordOpenFailed(signal.symbol, signal.strategy, 'FILL_REJECTED', `fill rejected: ${_openFill.reason ?? 'no fillable book'}`);
      return { opened: false, stage: 'FILL_REJECTED', reason: `fill rejected: ${_openFill.reason ?? 'no fillable book'}` };
    }
    if (_openFill.status !== 'filled' && _openFill.status !== 'partial') {
      // `delayed` is a live-only outcome paper never produces; any other status → skip.
      console.error(`[PaperExecution:${this.mode}][OPEN_FILL_NONFILLED] ${signal.symbol} status=${_openFill.status} — skipping trade`);
      rtbMetricsService.recordOpenFailed(signal.symbol, signal.strategy, 'FILL_REJECTED', `fill non-filled status=${_openFill.status}`);
      return { opened: false, stage: 'FILL_REJECTED', reason: `fill non-filled status=${_openFill.status}` };
    }
    // P19-B4b.1 (Langston hold #1): SIZE DOWN to the ACTUAL filled qty. Reassigning
    // `quantity` here is the SINGLE point that makes every downstream consumer — trade +
    // open-position record writes, portfolio heat, risk-concentration weights, broadcasts,
    // SLAL — use the filled qty, never the requested qty (the partial-open exposure
    // split-brain). The EV/risk pre-checks ran earlier on the requested size, correctly.
    if (_openFill.status === 'partial') {
      console.warn(`[P19-B4b.1][OPEN_PARTIAL:${this.mode}] ${signal.symbol} requested=${quantity} filled=${_openFill.fillQty} remaining=${_openFill.remainingQty} — sizing position to filled qty`);
    }
    quantity = _openFill.fillQty;
    if (!(quantity > 0)) {
      console.error(`[PaperExecution:${this.mode}][OPEN_FILL_ZERO] ${signal.symbol} filledQty=0 — skipping`);
      rtbMetricsService.recordOpenFailed(signal.symbol, signal.strategy, 'FILL_REJECTED', 'filled quantity = 0');
      return { opened: false, stage: 'FILL_REJECTED', reason: 'filled quantity = 0' };
    }
    actualEntryPrice = _openFill.fillPrice;
    entryFee = _openFill.feeQuote;
    totalSlippage = _openFill.slippageQuote;
    }
    const positionValue = actualEntryPrice * quantity;

    console.log(`  Quantity: ${quantity.toFixed(4)}, Position Value: $${positionValue.toFixed(2)}`);
    console.log(`  Entry Slippage: $${totalSlippage.toFixed(2)}, Entry Fee: $${entryFee.toFixed(2)}`);

    // [27.F.14.B] INSTRUMENTATION: Order computed
    console.log(`[27.F.14.B][PaperSim] order_computed {symbol:"${signal.symbol}", quantity:${quantity.toFixed(4)}, entry:${actualEntryPrice.toFixed(2)}, stop:${signal.stopPrice.toFixed(2)}, target:${signal.targetPrice.toFixed(2)}}`);
    contextBridge.broadcast({
      type: 'trading_pipeline_event' as any,
      payload: {
        mode: this.mode,
        eventType: 'order_computed',
        message: `Order ready: ${quantity.toFixed(4)} ${signal.symbol} @ $${actualEntryPrice.toFixed(2)}`,
        timestamp: new Date().toISOString(),
        metadata: {
          symbol: signal.symbol,
          quantity: quantity,
          entryPrice: actualEntryPrice,
          stopPrice: signal.stopPrice,
          targetPrice: signal.targetPrice,
          positionValue: positionValue,
          slippage: totalSlippage,
          fees: entryFee
        }
      }
    });

    // Phase 8.8.3-I7-PM-FOCUS (C1): Check for duplicate BEFORE creating trade
    // This prevents orphan trade records when duplicate is detected
    const existingPositions = await storage.getPaperSimOpenPositions(this.mode);
    const existingPositionForSymbol = existingPositions.find(p => p.symbol === signal.symbol);
    if (existingPositionForSymbol) {
      const existingCount = existingPositions.filter(p => p.symbol === signal.symbol).length;
      console.log(`[I7-PM-FOCUS][DUP_GUARD_BLOCK] symbol=${signal.symbol} existingCount=${existingCount} action="skip_new_position"`);
      
      // Phase 8.8.4-A: SLAL - Record EXECUTION failure (duplicate position)
      if (signal.signalId) {
        signalLifecycleAudit.recordExecution(
          signal.signalId,
          this.mode,
          signal.symbol,
          signal.strategy,
          false, // failure
          { existingCount, reason: 'duplicate_position' },
          'DUPLICATE_POSITION'
        );
      }
      // P19-B5a: TCL duplicate-position reject capture (active path; the paper
      // engine open only runs when paper-active → dormant by construction).
      // This is the ONLY active-path TCL reject: max_open_trades is a cycle-level
      // promotion DEFER (signals stay queued), not a per-signal reject, so it is
      // NOT captured (would be semantically-false telemetry). finalScore is not
      // threaded to the engine here; confidence_modulated (signal.confidence) is.
      try {
        // P19-B6.5d (OBJ-5): prefer the carried stamp; safe-resolve fallback; on a
        // genuinely-unclassifiable symbol SKIP the archive row rather than mislabel it
        // crypto_spot (the old silent tail-default would pollute per-class reject telemetry).
        const _evalClass = asValidAssetClass(signal.metadata?.assetClass) ?? safeResolveAssetClass(signal.symbol, 'kraken');
        if (_evalClass !== null) {
          const { archiveSignalEval } = await import('./data-archive/signal-eval-archiver.js');
          archiveSignalEval({
            mode: tradingModeToRunMode(this.mode),
            symbol: signal.symbol,
            exchange: 'kraken',
            assetClass: _evalClass,
            source: 'active-execution-engine',
            strategy: signal.strategy,
            rejectStage: 'tcl',
            confidenceModulated: signal.confidence,
            gateDecision: { gate: 'tcl', accepted: false, reason: 'duplicate_position', existingCount },
          });
        } else {
          console.warn(`[P19-B6.5d][ARCH] TCL-reject signal-eval archive SKIPPED for ${signal.symbol} — unclassifiable (no crypto_spot mislabel)`);
        }
      } catch (b70Err) {
        console.warn(`[B70][ARCH] TCL-reject signal-eval archive enqueue failed:`, b70Err instanceof Error ? b70Err.message : b70Err);
      }
      rtbMetricsService.recordOpenFailed(signal.symbol, signal.strategy, 'DUP_POSITION', `duplicate position (existingCount=${existingCount})`);
      return { opened: false, stage: 'DUP_POSITION', reason: `duplicate position (existingCount=${existingCount})` }; // Exit early - do not create trade or position
    }

    // [27.F.14.DIAG] Create trade record with comprehensive error handling
    // AJ10.3: Diagnostic logging for Open Trades vs Opened metrics mismatch
    console.log(`[AJ10.3][TRADE_CREATE_START] symbol=${signal.symbol} | strategy=${signal.strategy} | qty=${quantity.toFixed(8)} | estimatedValue=$${(signal.estimatedValue || 0).toFixed(2)}`);
    
    try {
      // Directive 10.3: Extract signal type fields for persistence.
      // P19-B3b: signalType/patternType/patternStrength are not first-class on
      // StrategySignal — they are carried in signal.metadata (set by the pattern
      // recognizer; see pattern-recognizer.test metadata.patternType). Read from
      // there with the same top-level-then-metadata fallback the signal
      // orchestrator uses (signal-orchestrator.ts:666), defaulting to QUANT/null.
      const sigMeta = signal.metadata ?? {};
      const signalType = sigMeta.signalType || 'QUANT';
      const patternType = sigMeta.patternType || null;
      const patternStrength = sigMeta.patternStrength?.toString() || null;
      
      console.log(`[10.3] Trade Execute: ${signal.symbol} | Type=${signalType} | Pattern=${patternType || 'N/A'} | Strength=${patternStrength || 'N/A'}`);
      
      // B65.1-HF2 (2026-04-23): baseCurrency is NOT NULL on paper_sim_trades. Derive from symbol.
      const baseCurrency = signal.symbol.split('/')[0] || signal.symbol;

      // B67.3 follow-up: persist cohort hash on trade record at trade-open. Used at
      // end-of-observation cohort comparison to group closed trades by capped (0)
      // vs uncapped (1). Cohort assignment is deterministic on symbol via FNV-1a
      // — same hash function the gate uses, computed inline here at trade-open.
      const pairIdHash = assignCohortHashForPersistence(signal.symbol);

      // B67.2.1: capture regime classifier confidence + macro modifier + phase
      // at trade-open per Kyle directive 2026-04-29 (master plan §0.11.D). Read
      // from MCE's cached snapshot for this symbol; values may be undefined if
      // MCE cache is cold for this pair (rare).
      const _b67_2_1_mce = (() => { try { return getMarketContextEngine(); } catch { return null; } })();
      // B79.0n.MCE: append required assetClass — the cache is keyed by (symbol, assetClass).
      // P19-B4a (C4): prefer the signal stamp; cold-cache (null context) on an
      // unclassifiable symbol — enrichment-only, never skip the trade for it.
      const _b67Class = asValidAssetClass(signal.metadata?.assetClass) ?? safeResolveAssetClass(signal.symbol, 'kraken');
      const _b67_2_1_ctx = (_b67Class && _b67_2_1_mce) ? (_b67_2_1_mce.getCachedContext(signal.symbol, _b67Class) ?? null) : null;
      const _b67_2_1_macro = _b67_2_1_mce?.getCurrentMacroContext() ?? null;
      const _b67_2_1_phaseWeights = _b67_2_1_mce?.getCurrentPhaseWeights() ?? null;
      const _b67_2_1_phase = _b67_2_1_ctx?.regime.phase ?? null;
      const _b67_2_1_phaseWeight = (_b67_2_1_phase && _b67_2_1_phaseWeights)
        ? _b67_2_1_phaseWeights[`${signal.strategy}_${_b67_2_1_phase}`] ?? null
        : null;
      const _b67_2_1_modulatedConf = _b67_2_1_ctx?.regime.confidence ?? null;
      const _b67_2_1_modifierValue = _b67_2_1_macro?.modifier.value ?? null;
      // confidence_raw = modulated / modifier_value (reverse-derived; same approach as ablation row)
      const _b67_2_1_rawConf = (_b67_2_1_modulatedConf !== null && _b67_2_1_modifierValue !== null && _b67_2_1_modifierValue > 0)
        ? _b67_2_1_modulatedConf / _b67_2_1_modifierValue
        : _b67_2_1_modulatedConf;

      // P19-B4a (C4): authoritative position class — prefer the signal stamp, cold-resolve
      // only if absent/invalid. Computed BEFORE any DB write so an unclassifiable symbol
      // skips the trade entirely rather than opening a position with no/blank class.
      const _tradeClass = asValidAssetClass(signal.metadata?.assetClass) ?? safeResolveAssetClass(signal.symbol, 'kraken');
      if (_tradeClass === null) {
        console.warn('[B79.TEC][TRADE_SKIP] unclassifiable ' + signal.symbol + ' — refusing to open a position without a class');
        rtbMetricsService.recordOpenFailed(signal.symbol, signal.strategy, 'UNCLASSIFIABLE', 'unclassifiable symbol at trade-create');
        return { opened: false, stage: 'UNCLASSIFIABLE', reason: 'unclassifiable symbol at trade-create' };
      }

      // ── P19-B7.2b (OBJ-B): the maker/taker entry fee-mode + its per-side fee RATE for
      // this trade's asset class, carried onto the paper-active open-position + closed-trade
      // records so the UI can show WHICH fee the ENTRY paid. _b72ChosenMode is the decision
      // snapshot (from rtb_signals.chosen_entry_mode via the promoted signal; defaults taker).
      // The rate is the class's per-side rate for that mode (fail-hard via cost-model). Once
      // the B7.2c pending maker-fill sim lands, a maker-chosen promotion fills at the maker
      // rate; a taker-chosen fills immediately at taker — so the recorded rate matches the
      // actual entry fill by construction (this code doesn't run until active trading is ON,
      // which is after B7.2c). Entry-leg only — the exit pays taker for both classes today.
      const _b72Friction = getFrictionForAssetClass(_tradeClass);
      // P19-B7.2c: keyed on the EFFECTIVE mode — the marketable-at-placement taker
      // fallback flips maker→taker, and the record must show the fee actually paid.
      const _b72EntryFeeRate = _b72cEffectiveMode === 'maker' ? _b72Friction.feeRateMaker : _b72Friction.feeRateTaker;

      const trade = await storage.createPaperSimTrade(this.mode, {
        symbol: signal.symbol,
        baseCurrency,
        strategyName: signal.strategy,
        side: 'buy',
        quantity: quantity.toString(),
        entryPrice: actualEntryPrice.toString(),
        stopLoss: signal.stopPrice.toString(),
        takeProfit: signal.targetPrice.toString(),
        fees: entryFee.toString(),
        slippage: totalSlippage.toString(),
        confidence: (signal.confidence * 100).toString(),
        openedAt: new Date(),
        signalType: signalType as 'QUANT' | 'PATTERN' | 'HYBRID',
        patternType: patternType as any,
        patternStrength: patternStrength,
        // Batch 19E: Persist sourcePool from signal metadata
        sourcePool: (signal as any)?.metadata?.sourcePool || (signal as any)?.sourcePool || null,
        // B67.3: cohort marker (0=capped treatment / 1=uncapped control)
        pairIdHash,
        // B67.2.1: regime classifier confidence + macro modifier + phase
        regimeConfidenceRaw: _b67_2_1_rawConf,
        macroModifierValue: _b67_2_1_modifierValue,
        phase: _b67_2_1_phase,
        phaseAgeSeconds: _b67_2_1_ctx?.regime.phaseAgeSeconds ?? null,
        strategyPhaseWeight: _b67_2_1_phaseWeight,
        regimeConfidenceModulated: _b67_2_1_modulatedConf,
        // P19-B7.2b (OBJ-B): the maker/taker entry fee-mode + per-side rate.
        chosenEntryMode: _b72cEffectiveMode,
        entryFeeRate: _b72EntryFeeRate.toString(),
        metadata: signal.metadata || {}
      });

      // AJ10.3: Diagnostic - trade record created
      console.log(`[AJ10.3][TRADE_RECORD_OK] tradeId=${trade.id} | symbol=${signal.symbol}`);

      // [B4] Log funnel opened - trade successfully created
      b4Diagnostics.logFunnelEvent({
        symbol: signal.symbol,
        strategy: signal.strategy,
        stage: 'opened',
        block_reason: null
      });

      // Note: Duplicate guard moved to BEFORE trade creation (I7-PM-FOCUS C1)
      // Old I7-ROOT-FIX (C) removed - duplicate guard now prevents orphan trades

      // Phase 8.8.3-I10: Get volume data (FX5 first, then cache/Kraken fallback)
      let volume24h = 0;
      let volumeBucket: 'High' | 'Medium' | 'Low' | 'Very Low' = 'Very Low';
      
      // Try FX5 metadata first (authoritative source at trade creation)
      if (signal.metadata?.volume24h && signal.metadata.volume24h > 0) {
        volume24h = signal.metadata.volume24h;
        volumeBucket = marketVolumeCache.classifyVolume(volume24h);
        console.log(`[I10-VOLUME] Using FX5 volume for ${signal.symbol}: $${(volume24h/1000000).toFixed(2)}M (${volumeBucket})`);
      } else {
        // Try active filter pool
        const poolEntry = activeFilterPool.getSymbolVolumeInfo(signal.symbol, this.mode);
        if (poolEntry.volume24h > 0) {
          volume24h = poolEntry.volume24h;
          volumeBucket = poolEntry.volumeBucket;
          console.log(`[I10-VOLUME] Using pool volume for ${signal.symbol}: $${(volume24h/1000000).toFixed(2)}M (${volumeBucket})`);
        } else {
          // Fallback: Fetch from Kraken via cache (async but non-blocking for position creation)
          try {
            const cachedVolume = await marketVolumeCache.getVolume(signal.symbol);
            volume24h = cachedVolume.volume24h;
            volumeBucket = cachedVolume.volumeBucket;
            console.log(`[I10-VOLUME] Using Kraken fallback for ${signal.symbol}: $${(volume24h/1000000).toFixed(2)}M (${volumeBucket})`);
          } catch (volError) {
            console.warn(`[I10-VOLUME] Failed to get volume for ${signal.symbol}:`, volError);
          }
        }
      }

      // Create open position - Phase 8.8.3-C-FINAL: Include entryFee
      // Directive 10.3: Include signal type fields
      const openPosition = await storage.createPaperSimOpenPosition(this.mode, {
        symbol: signal.symbol,
        strategyName: signal.strategy,
        side: 'buy',
        quantity: quantity.toString(),
        avgPrice: actualEntryPrice.toString(),
        currentPrice: actualEntryPrice.toString(),
        stopLoss: signal.stopPrice.toString(),
        takeProfit: signal.targetPrice.toString(),
        unrealizedPnl: '0',
        unrealizedPnlPercent: '0',
        confidence: (signal.confidence * 100).toString(),
        volume24h: volume24h.toString(),
        volumeBucket: volumeBucket,
        entryFee: entryFee.toString(),
        intendedEntryPrice: signal.entryPrice.toString(),
        entrySlippage: totalSlippage.toString(),
        signalType: signalType as 'QUANT' | 'PATTERN' | 'HYBRID',
        patternType: patternType as any,
        patternStrength: patternStrength,
        // B69: asset class dimensions — explicit, not DB-default-reliant (Kyle §11)
        // B79.TEC (2026-05-08, Langston Finding 2): resolve from symbol+exchange
        // instead of hardcoding 'crypto_spot'. Otherwise the new per-class TEC
        // dispatch (line ~927) becomes a silent no-op the moment any non-crypto
        // symbol enters paper — exactly the latent failure mode this batch fights.
        exchange: 'kraken',
        // P19-B4a (C4): use the class resolved + skip-guarded above (stamp-preferred).
        assetClass: _tradeClass,
        // Batch 19E: Persist sourcePool from signal metadata
        sourcePool: (signal as any)?.metadata?.sourcePool || (signal as any)?.sourcePool || null,
        // P19-B7.2b (OBJ-B): the maker/taker entry fee-mode + per-side rate.
        chosenEntryMode: _b72cEffectiveMode,
        entryFeeRate: _b72EntryFeeRate.toString(),
        // P19-B7.2c: a maker-chosen promotion RESTS as state='pending' at the limit,
        // holding a slot, until the monitor pre-pass fills it (real trade-through) or
        // the hard-drop deadline fires (dropped — never a closed trade). Taker/filled
        // positions keep the default state='open' with NULL maker fields.
        ...(_b72cPendingMaker ? {
          state: 'pending',
          makerLimitPrice: _b72cLimit.toString(),
          makerDeadline: new Date(Date.now() + resolveMakerMaxPendingMs(_openClass)),
        } : {}),
        metadata: {
          ...signal.metadata,
          tradeId: trade.id,
          highWaterMark: actualEntryPrice.toString(), // retained for legacy dashboards; no longer consumed by exit logic
          expectancyScore: expectancyResult.score, // Directive 11.8B: Trade quality score
          expectancyEV: expectancyResult.ev, // Directive 11.8B: Net expectancy
          // B65.2 (2026-04-23): volatility snapshot at open, consumed by the
          // trailing-exit engine at every subsequent exit-check cycle.
          atr_at_open: (signal as any)?.metadata?.atr ?? 0,
          // reorg-B3.1 (#378): read the at-queue DI carried on the promoted signal (reorg-B3) so the
          // trailing-exit engine sees the REAL routing-time DI, not the constant 50 that the dead
          // metadata.DI read always produced. Falls back to the legacy metadata.DI then 50 for any
          // non-promotion-path signal. (vol_noise_at_open stays metadata-based: VolNoise is not a
          // kernel EV input and was deliberately not threaded by reorg-B3.)
          di_at_open: (signal as any)?.diAtQueue ?? (signal as any)?.metadata?.DI ?? 50,
          vol_noise_at_open: (signal as any)?.metadata?.VolNoise ?? 0.3,
        }
      });

      // AJ10.3: Diagnostic - open position created
      console.log(`[AJ10.3][OPEN_POSITION_OK] positionId=${openPosition.id} | symbol=${signal.symbol} | tradeId=${trade.id}`);

      // P19-B5a: terminal ADMIT capture — the position ACTUALLY OPENED (survived
      // SQE, RTB confidence-revalidation, and the TCL dedup gate). Distinct from the
      // orchestrator 'admitted' row (which marks SQE-pass → queued); source
      // 'active-execution-engine' disambiguates the funnel endpoint. Dormant until
      // paper-active (the open path only runs then). Fire-and-forget, try/catch.
      try {
        const { archiveSignalEval } = await import('./data-archive/signal-eval-archiver.js');
        archiveSignalEval({
          mode: tradingModeToRunMode(this.mode),
          symbol: signal.symbol,
          exchange: 'kraken',
          assetClass: _tradeClass,
          source: 'active-execution-engine',
          strategy: signal.strategy,
          rejectStage: 'admitted',
          confidenceModulated: signal.confidence,
          gateDecision: { gate: 'admitted', accepted: true, path: 'paper-execution-open', entryPrice: actualEntryPrice, stopPrice: signal.stopPrice, targetPrice: signal.targetPrice },
          features: { entrySlippage: totalSlippage, entryFee },
        });
      } catch (b70Err) {
        console.warn(`[B70][ARCH] paper-open admit signal-eval archive enqueue failed:`, b70Err instanceof Error ? b70Err.message : b70Err);
      }

      // Phase 8.8.4-A: SLAL - Record EXECUTION success (trade successfully opened)
      if (signal.signalId) {
        signalLifecycleAudit.recordExecution(
          signal.signalId,
          this.mode,
          signal.symbol,
          signal.strategy,
          true, // success
          {
            tradeId: trade.id,
            positionId: openPosition.id,
            quantity,
            actualEntryPrice,
            positionValue,
            entryFee,
            entrySlippage: totalSlippage,
          }
        );
      }

      // Phase 8.8.3-B3.6: Subscribe to Kraken WebSocket for real-time price updates
      // Phase 8.8.3-I8C: Subscribe each NEW trade immediately upon creation
      try {
        // I8C-ENGINE-SUBCALL: Subscribe to new trade with I8C logging
        krakenWebSocketAdapter.i8cSubscribeNewTrade(signal.symbol, 'new_trade');
        console.log(`[8.8.3-I6-FIX][WS_SUB_NEW] newSymbol=${signal.symbol} | action=subscribe`);
        console.log(`[KrakenWS] Subscribed to ${signal.symbol} for real-time price updates`);
      } catch (wsSubError) {
        console.warn(`[8.8.3-I6-FIX][WS_SUB_FAILED] symbol=${signal.symbol} error=${wsSubError}`);
        console.warn(`[KrakenWS] Failed to subscribe to ${signal.symbol} (REST fallback active):`, wsSubError);
      }

      // Phase 8.8.3-B9: Seed price cache with entry price to prevent mock fallback
      livePricingAdapter.seedLastKnownGoodPrice(signal.symbol, actualEntryPrice);
      console.log(`[B9.PRICING][ENTRY_SEED] ${signal.symbol}: Seeded at entry price $${actualEntryPrice.toFixed(2)}`)

      // [AJ19-B] Trade lifecycle OPEN event - log slot counts
      try {
        const openPositionsAfter = await storage.getPaperSimOpenPositions(this.mode);
        await aj19bDiagnostic.logOpen({
          tradeId: trade.id,
          positionId: openPosition.id,
          symbol: signal.symbol,
          quantity: quantity.toString(),
          notionalValue: positionValue,
          openPrice: actualEntryPrice,
          slotCountBefore: openPositionsAfter.length - 1, // Before this position was added
          slotCountAfter: openPositionsAfter.length,
          mode: this.mode
        }, this.mode);
      } catch (aj19bErr) {
        console.error('[AJ19-B] Error logging open event:', aj19bErr);
      }

      // Log the entry event
      await storage.createActiveTradeLog(this.mode, {
        tradeId: trade.id,
        positionId: null,
        eventType: 'position_opened',
        message: `Position opened: ${signal.symbol} (${signal.strategy}) - Entry: $${actualEntryPrice.toFixed(2)}, Stop: $${signal.stopPrice.toFixed(2)}, Target: $${signal.targetPrice.toFixed(2)}`,
        metadata: {
          strategy: signal.strategy,
          entryPrice: actualEntryPrice,
          stopPrice: signal.stopPrice,
          targetPrice: signal.targetPrice,
          quantity: quantity,
          positionValue: positionValue,
          slippage: totalSlippage,
          fees: entryFee,
          confidence: signal.confidence
        }
      });

      console.log(`[PaperExecution:${this.mode}] Simulated trade opened: ${signal.symbol} (Trade ID: ${trade.id})`);

      // REB 8.8.3-I: Consume RTB signal when trade opens (remove from Ready-to-Buy)
      try {
        const consumedSignal = await storage.consumeSignalBySymbol(this.mode, signal.symbol);
        if (consumedSignal) {
          console.log(`[8.8.3-I][RTB_CONSUMED] Signal ${consumedSignal.id} consumed for ${signal.symbol}`);
        }
      } catch (consumeError) {
        console.warn(`[8.8.3-I][RTB_CONSUMED] Failed to consume signal for ${signal.symbol}:`, consumeError);
      }

      // [8.8.3-F][OPEN] REB 8.8.3-F: Lifecycle log for trade opened
      console.log(`[8.8.3-F][OPEN]`, JSON.stringify({
        tradeId: trade.id,
        symbol: signal.symbol,
        strategy: signal.strategy,
        direction: 'long',
        entryPrice: actualEntryPrice,
        size: quantity,
        stopLoss: signal.stopPrice,
        takeProfit: signal.targetPrice,
        confidence: signal.confidence,
        timestamp: new Date().toISOString()
      }));
      
      // [AJ18] Trade lifecycle - OPEN event
      aj18Diagnostic.logTradeLifecycle({
        cycleId: aj18Diagnostic.getCycleId(),
        eventType: 'OPEN',
        tradeId: trade.id,
        symbol: signal.symbol,
        strategy: signal.strategy,
        entryPrice: actualEntryPrice
      });

      // [8.8.3-I2] Record successful RTB open in central metrics service (source of truth)
      rtbMetricsService.recordOpen(signal.symbol, signal.strategy);
      
      // [8.8.3-I1] Also record in I1 diagnostics for detailed event history
      i1RtbDiagnostics.recordOpen(signal.symbol, signal.strategy, trade.id);
      i1TradeLifecycleDiagnostics.logOpen(trade.id, signal.symbol, signal.strategy, actualEntryPrice, 'normal');

      // [27.F.14.DIAG] DIAGNOSTIC: Trade insert successful
      console.log(`[DB] trade_insert_ok {tradeId:${trade.id}, symbol:${signal.symbol}}`);
      contextBridge.broadcast({
        type: 'active_trade_opened' as any,
        mode: this.mode,
        payload: {
          tradeId: trade.id,
          symbol: signal.symbol,
          strategy: signal.strategy,
          entryPrice: actualEntryPrice,
          quantity: quantity,
          timestamp: new Date().toISOString()
        }
      });
      
      // Phase 8.8.3-J: Execution Attempt Audit - OPENED decision (non-blocking)
      this.logExecutionAttempt({
        mode: this.mode,
        symbol: signal.symbol,
        strategy: signal.strategy,
        decision: 'OPENED',
        entryPrice: actualEntryPrice.toString(),
        stopPrice: signal.stopPrice.toString(),
        targetPrice: signal.targetPrice.toString(),
        confidence: (signal.confidence * 100).toString(),
        portfolioValue: portfolioValue.toString(),
        riskAmount: riskAmount.toString(),
        positionSize: quantity.toString(),
        tradeId: trade.id,
      }).catch(err => console.error('[8.8.3-J][AUDIT_ERROR] Failed to log opened execution attempt:', err));

      // P19-B6.5e: the position opened — return the typed success outcome (recordOpen
      // already fired at :2574). This replaces executePromotedSignal's trade-count-delta inference.
      return { opened: true, tradeId: trade.id };
    } catch (err: any) {
      // [27.F.14.DIAG] DIAGNOSTIC: Trade insert failed
      console.error(`[DB] trade_insert_err {symbol:${signal.symbol}, error:${err.message}}`);
      // P19-B6.5e: the trade/position insert threw — count it as a post-guardrail open
      // failure (TRADE_INSERT_ERROR) and return a typed outcome instead of re-throwing into
      // processSignal's swallowing catch. The open no longer vanishes on a DB error.
      rtbMetricsService.recordOpenFailed(signal.symbol, signal.strategy, 'TRADE_INSERT_ERROR', err?.message || 'trade/position insert threw');
      return { opened: false, stage: 'TRADE_INSERT_ERROR', reason: err?.message || 'trade/position insert threw' };
    }
  }

  private calculateVWAP(priceData: PriceData[]): number {
    if (priceData.length === 0) return 0;

    // Use most recent VWAP from price data
    const latest = priceData[priceData.length - 1];
    return latest.vwap ? parseFloat(latest.vwap) : parseFloat(latest.close);
  }

  private calculateSMA(priceData: PriceData[], period: number): number {
    if (priceData.length === 0) return 0;
    
    const relevantData = priceData.slice(-period);
    const sum = relevantData.reduce((acc, candle) => acc + parseFloat(candle.close), 0);
    return sum / relevantData.length;
  }

  // Public methods for external control
  async getStatus(): Promise<{ isRunning: boolean; openPositions: number }> {
    const openPositions = await storage.getPaperSimOpenPositions(this.mode);
    return {
      isRunning: this.isRunning,
      openPositions: openPositions.length
    };
  }

  async getOpenPositions() {
    return await storage.getPaperSimOpenPositions(this.mode);
  }

  async getTradeHistory(limit: number = 50) {
    return await storage.getPaperSimTrades(this.mode, { limit, closedOnly: true });
  }

  async getTradeLogs(limit: number = 100) {
    return await storage.getActiveTradeLogs(this.mode, { limit });
  }

  async getStats() {
    return await storage.getPaperSimStats(this.mode);
  }

  // Phase 27.F.14.DIAG: Telemetry accessor for last cycle diagnostics
  getLastCycleSummary() {
    return this.lastCycleSummary;
  }

  /**
   * Phase 8.8.3-J: Log execution attempt to audit table (non-blocking)
   * Records every P3 decision (execution_attempt → OPENED or BLOCKED)
   * 
   * Phase 8.8.3-J7.5: Engine-gated - only logs when engine is ACTIVE
   * This matches Filter Insights behavior where metrics only accumulate while trading
   */
  private async logExecutionAttempt(audit: Omit<InsertExecutionAttemptAudit, 'createdAt'>): Promise<void> {
    // J7.5: Engine-gated logging - skip if engine not running
    if (!this.isRunning) {
      console.log(`[8.8.3-J7][AUDIT_SKIP] Engine not running - skipping execution audit for ${audit.symbol}`);
      return;
    }
    
    try {
      await storage.createExecutionAttemptAudit(audit);
      console.log(`[8.8.3-J][AUDIT] Execution attempt logged: ${audit.decision} for ${audit.symbol}`);
    } catch (err) {
      console.error(`[8.8.3-J][AUDIT_ERROR] Failed to log execution attempt:`, err);
    }
  }

  /**
   * Phase 37/B6: Process external signal from SignalOrchestrator
   * Public method for SignalOrchestrator to submit signals for execution
   * 
   * REB 8.8.3-F: Restored execution using guardrails_v2 + risk-manager path
   * B6: Trust pre-sized signals from orchestrator, only fall back if missing
   */
  async processSignal(signal: StrategySignal): Promise<OpenOutcome> {
    // P19-B6.5e: returns the typed OpenOutcome threaded from executeSimulatedTrade so
    // executePromotedSignal can read success directly (no trade-count-delta inference).
    // The pre-attempt guard-returns below happen BEFORE checkGuardrailRisk's recordAttempt,
    // so they DON'T touch the I3 invariant — they only label "did not open + why".
    if (!this.isRunning) {
      // Phase 8.8.3-I7-PM-FOCUS: BLOCK_AFTER_STOP diagnostic
      console.log(`[I7-PM-FOCUS][BLOCK_AFTER_STOP] symbol=${signal.symbol} reason="engine_stopped"`);
      console.log(`[PaperExecution:${this.mode}] Cannot process signal - engine not running`);
      return { opened: false, stage: 'OTHER', reason: 'engine not running' };
    }

    // Directive 8.8.4-C.3: Signal origin validation
    // All signals must come through the proper pipeline (SignalOrchestrator → RTB)
    const signalMetadata = (signal as any).metadata;
    const validSources = ['RTB_PROMOTION', 'FX5', 'SIGNAL_ORCHESTRATOR'];
    const signalSource = signalMetadata?.source;
    
    if (!signalSource || !validSources.includes(signalSource)) {
      console.warn(`[8.8.4-C.3][ORIGIN_REJECT] Signal rejected - invalid source: ${signalSource || 'none'}. Valid sources: ${validSources.join(', ')}`);
      console.warn(`[8.8.4-C.3][ORIGIN_REJECT] Symbol: ${signal.symbol}, Strategy: ${signal.strategy}`);
      // Allow processing but log warning - full enforcement after verification period
    }

    const signalAny = signal as any;
    const fieldsPresent: string[] = [];
    if (signal.symbol) fieldsPresent.push('symbol');
    if (signal.strategy) fieldsPresent.push('strategy');
    if (signal.entryPrice) fieldsPresent.push('entryPrice');
    if (signal.stopPrice) fieldsPresent.push('stopPrice');
    if (signal.targetPrice) fieldsPresent.push('targetPrice');
    if (signal.confidence) fieldsPresent.push('confidence');
    if (signalAny.quantity) fieldsPresent.push('quantity');
    if (signalAny.estimatedValue) fieldsPresent.push('estimatedValue');
    if (signalAny.preComputedNotional) fieldsPresent.push('preComputedNotional');
    
    b5SizingAudit.logSignalReceivedByEngine({
      strategy: signal.strategy,
      symbol: signal.symbol,
      entryPrice: signal.entryPrice,
      quantity: signalAny.quantity ?? null,
      estimatedValue: signalAny.estimatedValue ?? null,
      fieldsPresent,
    });

    try {
      const systemContext = await storage.getSystemContext(this.mode);
      if (!systemContext || !systemContext.lastStartedBy) {
        console.error(`[PaperExecution:${this.mode}] No system context or user for ${this.mode} mode`);
        return { opened: false, stage: 'OTHER', reason: 'no system context / user' };
      }

      const settings = await buildSettingsFromGuardrails(this.mode, systemContext.lastStartedBy);
      
      if (settings.killSwitchTripped) {
        console.log(`[8.8.3-F][RISK_REJECT] Kill switch tripped - signal rejected for ${signal.symbol}`);
        return { opened: false, stage: 'OTHER', reason: 'kill switch tripped' };
      }

      // ══════════════════════════════════════════════════════════════════════════════
      // Directive 11.7R-E: Governance gate MOVED to SQE (HF9 Item B)
      // SQE now enforces strategy eligibility before signals reach paper execution.
      // We KEEP the stability computation here because 11.7S mode modulation below
      // depends on regimeStability for sizing, stop, and target adjustments.
      // ══════════════════════════════════════════════════════════════════════════════
      const signalMetadata = signalAny.metadata || {};

      // Compute global stability from available metrics (needed by 11.7S mode modulation)
      const stabilityResult = computeGlobalStability(
        signalMetadata.driftScore || 0.5,
        signalMetadata.volZ || 0,
        signalMetadata.regimeConfidence || signal.confidence || 0.5
      );
      const regimeStability: RegimeStability = stabilityResult.stability;
      // ══════════════════════════════════════════════════════════════════════════════
      
      // ══════════════════════════════════════════════════════════════════════════════
      // Directive 11.7S — Strategy Mode Modulation
      // ══════════════════════════════════════════════════════════════════════════════
      // B-5 AMR (Obj-5 consumer swap): under the ACTIVE per-class flag the
      // class POSTURE replaces the per-signal stability mode. The legacy
      // stability inputs ride signal-metadata DEFAULTS (0.5/0/0.5) on many
      // signals (pre-audit §1) — the shadow ledger's would-vs-actual
      // divergence from this is expected, not a bug. disabled/shadow: the
      // legacy path below is bit-identical (parity gate A2).
      let strategyMode: StrategyMode = resolveStrategyMode(regimeStability);
      let modeOverlay: StrategyModeOverlay = getModeOverlay(strategyMode);
      // P19-B6.5d: prefer the carried signal stamp (collision-correct); safe-resolve
      // fallback + flag a missing stamp (Langston §B stamp-missing-active).
      const _amrStamp = asValidAssetClass(signal.metadata?.assetClass);
      const _amrClass = _amrStamp ?? safeResolveAssetClass(signal.symbol, 'kraken');
      if (!_amrStamp && _amrClass) {
        console.warn(`[P19-B6.5d][STAMP_MISSING_ACTIVE] execution_entry re-derived asset class for ${signal.symbol} — the sizing stamp should have been carried`);
      }
      if (_amrClass !== null) {
        try {
          const { getActiveModeForClass } = await import('./amr-weather-report.js');
          const { getModeOverlayForClass } = await import('../core/governance/strategy-modes.js');
          const amrMode = getActiveModeForClass(_amrClass);
          if (amrMode !== null) {
            strategyMode = amrMode;
            modeOverlay = getModeOverlayForClass(amrMode, _amrClass);
            console.log(`[B-5][Paper][AMR_ACTIVE] ${signal.symbol}: class posture ${amrMode} (${_amrClass}) replaces stability mode`);
          }
        } catch (amrErr) {
          console.warn(`[B-5][Paper] AMR posture read failed (legacy path): ${amrErr instanceof Error ? amrErr.message : amrErr}`);
        }

        // B-5 AMR (Obj-6): execution-entry gate — roster/floor/pause/slot-cap.
        // F3 precedence: the kill-switch checks upstream and TCL downstream
        // remain independent ANDs; this is solely the AMR question. Shadow =
        // dry-run onto the ledger; active = real block.
        // B1 (Langston Step-4): the slot-count fetch is ISOLATED — a storage
        // hiccup degrades to a count-less gate call (slot gate skips, the
        // roster/floor/pause gates still run + fail-closed under active),
        // never to skipping the whole gate.
        let _sameClassCount: number | undefined;
        try {
          const _gateOpenPositions = await storage.getPaperSimOpenPositions(this.mode);
          _sameClassCount = _gateOpenPositions.filter(p => (asValidAssetClass((p as { assetClass?: unknown }).assetClass) ?? safeResolveAssetClass(p.symbol, 'kraken')) === _amrClass).length;
        } catch (countErr) {
          console.warn(`[B-5][Paper] open-position count fetch failed (slot gate skips this signal): ${countErr instanceof Error ? countErr.message : countErr}`);
        }
        const { evaluateAmrGates } = await import('../core/governance/amr-gates.js');
        const gate = evaluateAmrGates({
          assetClass: _amrClass,
          site: 'execution_entry',
          strategy: signal.strategy,
          sourcePool: (signal as any).sourcePool ?? signal.metadata?.sourcePool,
          confidence: signalMetadata.regimeConfidence || signal.confidence || 0.5,
          openPositionCountForClass: _sameClassCount,
        });
        if (!gate.allowed) {
          console.log(`[B-5][Paper][AMR_GATE] BLOCK ${signal.symbol}: ${gate.blocks.map(b => b.gate).join(',')} (mode=${gate.mode})`);
          return { opened: false, stage: 'OTHER', reason: `AMR execution-entry gate block: ${gate.blocks.map(b => b.gate).join(',')}` };
        }
      }
      
      // 11.7S: Check if signal meets confidence floor for current mode
      const signalConfidence = signalMetadata.regimeConfidence || signal.confidence || 0.5;
      // B-5: floor read off the RESOLVED overlay — identical to the legacy
      // meetsConfidenceFloor(conf, stability) when AMR is not applied, and the
      // per-class floor when it is.
      if (!(signalConfidence >= modeOverlay.confidenceFloor)) {
        console.log(`[11.7S][Paper] SKIP: ${signal.symbol} ${signal.strategy} - confidence ${signalConfidence.toFixed(2)} < floor ${modeOverlay.confidenceFloor} (mode=${strategyMode})`);
        return { opened: false, stage: 'OTHER', reason: `confidence ${signalConfidence.toFixed(2)} < floor ${modeOverlay.confidenceFloor}` };
      }
      
      console.log(`[11.7S][Paper] Mode: ${strategyMode} | Size×${modeOverlay.positionSizeMultiplier} | Stop×${modeOverlay.stopLossDistanceMultiplier} | TP×${modeOverlay.takeProfitDistanceMultiplier}`);
      
      // 11.7S: Apply mode overlay to stop/target distances
      // B63 Item 14: Strong-trend lane mode-overlay BYPASS (mirrored from vts-runner).
      // Signals routed via quant-strong_trend use native geometry to preserve the intended
      // archetype RR (2:1 for strong_bull_trend, 3:1 for vwap_pullback Variant E).
      const paperSourcePool = (signal as any).sourcePool ?? signal.metadata?.sourcePool;
      const useNativeGeometry = paperSourcePool === 'quant-strong_trend';
      if (signal.stopPrice && signal.targetPrice) {
        const stopDistance = signal.entryPrice - signal.stopPrice;
        const targetDistance = signal.targetPrice - signal.entryPrice;
        const adjustedStopDistance = useNativeGeometry
          ? stopDistance
          : stopDistance * modeOverlay.stopLossDistanceMultiplier;
        const adjustedTargetDistance = useNativeGeometry
          ? targetDistance
          : targetDistance * modeOverlay.takeProfitDistanceMultiplier;
        signalAny.stopPrice = signal.entryPrice - adjustedStopDistance;
        signalAny.targetPrice = signal.entryPrice + adjustedTargetDistance;
        const geomNote = useNativeGeometry ? ' [B63 Item 14 bypass]' : '';
        console.log(`[11.7S][Paper] ${signal.symbol}: Stop ${signal.stopPrice.toFixed(4)}→${signalAny.stopPrice.toFixed(4)} | TP ${signal.targetPrice.toFixed(4)}→${signalAny.targetPrice.toFixed(4)}${geomNote}`);
      }
      
      // 11.7S: Store mode info on signal for downstream logging
      signalAny.strategyMode = strategyMode;
      signalAny.modeOverlay = modeOverlay;
      signalAny.regimeStability = regimeStability;
      // ══════════════════════════════════════════════════════════════════════════════

      const hasQuantity = signalAny.quantity != null && signalAny.quantity > 0;
      const hasEstimatedValue = signalAny.estimatedValue != null && signalAny.estimatedValue > 0;
      
      if (hasQuantity && hasEstimatedValue) {
        // 11.7S: Apply mode overlay to pre-sized signals as well
        const originalQty = signalAny.quantity;
        const originalValue = signalAny.estimatedValue;
        signalAny.quantity = originalQty * modeOverlay.positionSizeMultiplier;
        signalAny.estimatedValue = originalValue * modeOverlay.positionSizeMultiplier;
        signalAny.preComputedNotional = signalAny.estimatedValue;
        console.log(`[B6][TRUST_SIZED] ${signal.symbol}: qty=${signalAny.quantity.toFixed(8)}, value=$${signalAny.estimatedValue.toFixed(2)} (mode=${strategyMode}, ×${modeOverlay.positionSizeMultiplier})`);
      } else {
        console.log(`[B6][FALLBACK_SIZING] Signal missing sizing fields for ${signal.symbol}, will size in executeSimulatedTrade`);
        const guardrails = await storage.getGuardrailsV2({ mode: this.mode });
        // [9.6.3] Use mode-only query (mode-based architecture - userId not needed for storage lookup)
        const portfolioState = await storage.getPortfolioState({ mode: this.mode });
        const portfolioValue = portfolioState ? parseFloat(String(portfolioState.balance)) : 0;
        
        if (portfolioValue > 0) {
          // P19-B4a (C4): prefer the signal stamp; reuse the _amrClass resolved
          // upstream (line ~2590) otherwise. Skip sizing on an unclassifiable
          // symbol rather than throw — mirrors the SIZING_FAILED skip-return below.
          const _sizeClass = asValidAssetClass(signal.metadata?.assetClass) ?? _amrClass;
          if (_sizeClass === null) {
            console.warn('[B6][SIZING_SKIP] unclassifiable ' + signal.symbol + ' — cannot size, skipping');
            return { opened: false, stage: 'OTHER', reason: 'unclassifiable symbol at fallback sizing' };
          }
          const sizingResult = sizeActivePositionForSignal({
            mode: this.mode, // P19-B4b D5: per-mode concentration sizing
            portfolioValue,
            guardrails,
            entryPrice: signal.entryPrice,
            stopPrice: signal.stopPrice,
            symbol: signal.symbol,
            strategy: signal.strategy as any,
            // B-NEW-43 chunk 3: thread the signal's source pool so Phase 14.5
            // pattern-pool reduced sizing applies (was an undeclared ref in TS2304).
            sourcePool: (signal as any)?.metadata?.sourcePool,
            // B79.0n.ORCHESTRATOR (2026-05-27): REQUIRED per-class dispatch key.
            // P19-B4a (C4): stamp-preferred / _amrClass-reuse, skip-guarded above —
            // no silent crypto_spot fallback (Langston Step 2 Probe 8 ACK).
            assetClass: _sizeClass,
          });

          if (sizingResult.quantity > 0 && sizingResult.estimatedValue > 0) {
            // P19-B7.1 (OBJ-5, Langston CHANGE-1): record the SIZED signal's effective-risk-fraction
            // for the clamp-bind watch — INSIDE the opened-gate so the population is EXACTLY opened
            // positions (per actually-SIZED signal, NOT per candidate). A clamped-to-zero-but-valid
            // result would otherwise stamp ratio=0 → bound=true and inflate boundRate with non-trades,
            // biasing the Phase-25 go/no-go (boundRate >~15-20% flips the ranker to realized-$EV).
            if (sizingResult.sizingDetails) {
              rtbMetricsService.recordSizingClampSample({
                symbol: signal.symbol,
                strategy: signal.strategy,
                assetClass: typeof _sizeClass === 'string' ? _sizeClass : undefined,
                effectiveRiskFractionRatio: sizingResult.sizingDetails.effectiveRiskFractionRatio,
                wasClamped: sizingResult.sizingDetails.wasClamped,
                timestamp: Date.now(),
              });
            }
            // 11.7S: Apply mode overlay to position size
            const adjustedQuantity = sizingResult.quantity * modeOverlay.positionSizeMultiplier;
            const adjustedValue = sizingResult.estimatedValue * modeOverlay.positionSizeMultiplier;
            signalAny.quantity = adjustedQuantity;
            signalAny.estimatedValue = adjustedValue;
            signalAny.preComputedNotional = adjustedValue;
            console.log(`[B6][FALLBACK_SIZED] ${signal.symbol}: qty=${adjustedQuantity.toFixed(8)}, value=$${adjustedValue.toFixed(2)} (mode=${strategyMode}, ×${modeOverlay.positionSizeMultiplier})`);
          } else {
            console.log(`[B6][SIZING_FAILED] Zero sizing result for ${signal.symbol} - skipping`);
            return { opened: false, stage: 'SIZING_INVALID', reason: 'zero sizing result (fallback)' };
          }
        } else {
          console.error(`[B6][SIZING_ERROR] Invalid portfolio value for fallback sizing: ${portfolioValue}`);
          return { opened: false, stage: 'SIZING_INVALID', reason: `invalid portfolio value for fallback sizing (${portfolioValue})` };
        }
      }

      // Note: Directive 11.7R-E hard governance filter applied before sizing (lines 2134-2160)
      // Note: Directive 11.7S mode overlay applied after governance (lines 2163-2193)
      // If we reach here, strategy is eligible for execution with mode overlay applied

      // 11.7S: Record mode execution for analytics
      // B-5 (F2): per-class counters when the class resolves; the class-aware
      // call also bumps the legacy aggregate.
      if (_amrClass !== null) {
        const { recordModeExecutionForClass } = await import('../core/governance/strategy-modes.js');
        recordModeExecutionForClass(strategyMode, _amrClass);
      } else {
        recordModeExecution(strategyMode);
      }
      
      console.log(`[8.8.3-F][PROCESS] Processing signal for ${signal.symbol} via guardrails_v2 path`);
      // P19-B6.5e: thread the typed open outcome up to executePromotedSignal.
      return await this.executeSimulatedTrade(signal, settings);

    } catch (error) {
      console.error(`[PaperExecution:${this.mode}] Error processing signal for ${signal.symbol}:`, error);
      // P19-B6.5e: a setup-stage throw (settings/storage/AMR import) BEFORE the attempt —
      // not an open-stage openFailed (no recordAttempt fired); label it for the caller.
      return { opened: false, stage: 'OTHER', reason: `processSignal error: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
  
  /**
   * Phase 8.8.3-B3.5: Get price tick diagnostic logs
   * Returns last 100 PRICE_TICK entries for cadence verification
   */
  getPriceTickLogs(): Array<{ symbol: string; refreshedAt: string; diffMs: number }> {
    return [...this.priceTickLogs];
  }
  
  /**
   * Phase 8.8.3-B3.5: Get price tick diagnostic summary
   * Returns average interval and cadence health status
   */
  getPriceTickDiagnostics(): {
    logCount: number;
    avgIntervalMs: number;
    minIntervalMs: number;
    maxIntervalMs: number;
    isHealthy: boolean;
    lastTick: string | null;
    mode: 'live' | 'paper';
  } {
    if (this.priceTickLogs.length === 0) {
      return {
        logCount: 0,
        avgIntervalMs: 0,
        minIntervalMs: 0,
        maxIntervalMs: 0,
        isHealthy: false,
        lastTick: null,
        mode: this.mode
      };
    }
    
    const intervals = this.priceTickLogs.filter(l => l.diffMs > 0).map(l => l.diffMs);
    const avgIntervalMs = intervals.length > 0 
      ? Math.round(intervals.reduce((sum, i) => sum + i, 0) / intervals.length)
      : 0;
    const minIntervalMs = intervals.length > 0 ? Math.min(...intervals) : 0;
    const maxIntervalMs = intervals.length > 0 ? Math.max(...intervals) : 0;
    
    // Healthy if average interval is under 3 seconds (allowing for jitter)
    const isHealthy = avgIntervalMs > 0 && avgIntervalMs <= 3000;
    
    const lastLog = this.priceTickLogs[this.priceTickLogs.length - 1];
    
    return {
      logCount: this.priceTickLogs.length,
      avgIntervalMs,
      minIntervalMs,
      maxIntervalMs,
      isHealthy,
      lastTick: lastLog?.refreshedAt || null,
      mode: this.mode
    };
  }
}
