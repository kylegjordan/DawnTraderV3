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
 * 4. API EXPOSURE (/api/paper-sim/active-trades)
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
import { KrakenService } from './kraken';
// B65.2: centralized exit-decision primitive shared with VTS
import { evaluateTECExit } from './tec-evaluator';
import { StrategyEngine, type StrategySignal, type TechnicalIndicators } from './strategy-engine';
import { checkGuardrailRisk, type TradeCandidate, type TradeSafetyResultCode } from './trade-safety';
import { buildSettingsFromGuardrails, calculateRiskAmount } from './guardrail-settings';
import type { TradingSettings, PriceData, InsertExecutionAttemptAudit, GuardrailsV2 } from '@shared/schema';
import { contextBridge } from './context-bridge';
import { activeFilterPool, type ActiveFilteredPair } from './active-filter-pool';
import { sizePaperPositionForSignal, validatePaperPortfolioValue, type StrategyType } from './paper-position-sizing';
import { aj16Diagnostic } from './aj16-rtb-diagnostic';
import { aj17DiagnosticRunner } from './aj17-diagnostic-runner';
import { aj18Diagnostic } from './aj18-rtb-diagnostic';
import { aj19bDiagnostic } from './aj19b-lifecycle-diagnostic';
import { aj19Diagnostic } from './aj19-max-position-diagnostic';
import { livePricingAdapter } from './live-pricing-adapter';
import { krakenWebSocketAdapter } from './kraken-websocket-adapter.js';
import { b4Diagnostics } from './b4-diagnostics.js';
import { b5SizingAudit } from './b5-sizing-audit.js';
import { i1RtbDiagnostics } from './i1-rtb-diagnostics-service.js';
import { i1TradeLifecycleDiagnostics } from './i1-trade-lifecycle-diagnostics.js';
import { rtbMetricsService } from './rtb-metrics-service.js';
import { normalizeToInternalSymbol, getKrakenRestPair } from '../markets/kraken-symbol-resolver.js';
import { priceTraceService } from './price-trace-service.js';
import { marketVolumeCache } from './market-volume-cache.js';
import { c5FinancialDiagnostics } from './c5-financial-diagnostics.js';
import { signalLifecycleAudit } from '../core/audit/signal_lifecycle_audit.js';
import { readyToBuyService } from '../core/rtb/ready_to_buy_service.js';
import { tclWatchdog } from '../core/rtb/tcl_watchdog.js';
import { eventBus, type TCLActivatedEvent, type TradeClosedEvent } from '../lib/event-bus.js';
import { dataAggregator } from './data-aggregator.js';
import { DEFAULT_TAKER_FEE, DEFAULT_SLIPPAGE as CANONICAL_SLIPPAGE } from '../config/exchange-defaults';
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

export class PaperExecutionEngine {
  private mode: 'live' | 'paper'; // Phase 27.F.15.B.2: Mode-based only, global per mode
  private isRunning: boolean = false;
  private isCycleRunning: boolean = false; // Re-entrancy guard
  private krakenService: KrakenService;
  private strategyEngine: StrategyEngine;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private priceHistory: Map<string, PriceData[]> = new Map();
  private lastCycleSummary: any = {}; // Phase 27.F.14.DIAG: Cache last cycle for telemetry
  
  // Configuration
  private readonly SLIPPAGE_PERCENT = CANONICAL_SLIPPAGE * 100; // Batch 18J: from exchange-defaults.ts (0.05%)
  private readonly FEE_PERCENT = DEFAULT_TAKER_FEE * 100; // Batch 18J: from exchange-defaults.ts (0.26%)
  private readonly MONITOR_INTERVAL_MS = 1500; // Phase 8.8.3-B3.5: Check every 1.5 seconds for real-time TP/SL evaluation
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
  private readonly CONTINUOUS_PROMOTION_INTERVAL_MS = 30000; // 30 seconds

  constructor(mode: 'live' | 'paper') {
    this.mode = mode;
    this.krakenService = new KrakenService();
    this.strategyEngine = new StrategyEngine();
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
          riskConcentrationAnalyzer.recalculateScores();
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
   * Used by PaperPortfolioManager.forceCloseAllOpenPositionsOnStop()
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
      await storage.createPaperSimTradeLog(this.mode, {
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

      const decision = await evaluateTECExit({
        symbol: position.symbol,
        entryPrice: avgPrice,
        stopPrice: stopLoss ?? -Infinity,
        targetPrice: takeProfit ?? Infinity,
        currentPrice,
        atr: atrAtOpen,
        holdDurationMs: 0,   // paper handles maxHoldingPeriod inline below
        maxHoldMs: Infinity, // disable global timeout branch here
        context: {
          exchange: 'kraken',
          assetClass: 'crypto_spot',
          strategy: position.strategyName,
          regime: (position as any).regime,
        },
        useTrailing: true,
        DI: diAtOpen,
        volNoise: volNoiseAtOpen,
        callerMode: this.mode === 'live' ? 'live' : 'paper',
        sourcePool: (position as any).sourcePool ?? null,
        currentSlotTotal,
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
    if (metadata?.maxHoldingPeriod) {
      const openTime = new Date(position.openedAt).getTime();
      const currentTime = Date.now();
      const hoursHeld = (currentTime - openTime) / (1000 * 60 * 60);
      const maxHours = parseFloat(metadata.maxHoldingPeriod);

      if (hoursHeld >= maxHours) {
        return {
          type: 'max_holding_period',
          price: currentPrice,
          reason: `Max holding period of ${maxHours}h exceeded (held ${hoursHeld.toFixed(1)}h)`
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
    const exitSlippagePerUnit = exitPrice * (this.SLIPPAGE_PERCENT / 100);
    const actualExitPrice = exitPrice - exitSlippagePerUnit; // Worse price due to slippage
    const exitValue = actualExitPrice * quantity;
    const exitFee = exitValue * (this.FEE_PERCENT / 100);
    
    // Get entry costs from position (persisted at entry time)
    const entryFee = position.entryFee ? parseFloat(position.entryFee) : (entryValue * (this.FEE_PERCENT / 100));
    const entrySlippage = position.entrySlippage ? parseFloat(position.entrySlippage) : 0;
    const exitSlippage = exitSlippagePerUnit * quantity;

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

    // Find the corresponding trade record
    const trades = await storage.getPaperSimTradesBySymbol(this.mode,  position.symbol);
    const trade = trades.find(t => t.openedAt && !t.closedAt);
    
    if (trade) {
      // B65.2: read the final trailing-engine state for this symbol so the
      // closed-trade row preserves whether the trade ended in moonbag mode.
      // If no state exists (trade opened before the engine started tracking
      // it, or cleared already), default to TARGET.
      const { getTrailingState: _getTES } = await import('./trailing-exit-controller.js');
      const finalTradeMode: 'TARGET' | 'TRAILING_TAKE' = _getTES(position.symbol)?.tradeMode ?? 'TARGET';

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
      });

      // Log the exit event with C2 breakdown
      await storage.createPaperSimTradeLog(this.mode, {
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
        console.log(`[M5C.1][PAPER_TRADE_RECORDED] ${position.symbol}/${position.strategyName} profit=${netPnl.toFixed(2)}`);
      } catch (recordErr) {
        console.warn(`[M5C.1][PAPER_RECORD_FAILED] ${position.symbol}:`, recordErr);
      }
    }

    // [AJ19-B] Trade lifecycle CLOSE event - track slot counts before/after delete
    const slotCountBefore = (await storage.getPaperSimOpenPositions(this.mode)).length;
    let deleteSuccessful = false;
    let deleteError: string | undefined;
    
    // B65.2: clear trailing engine state after the closed-trade row has been
    // updated with the final tradeMode. clearTrailingState also decrements
    // the concurrent-moonbag counter if this trade was in TRAILING_TAKE mode,
    // freeing a slot for the next setup that hits target.
    try {
      const { clearTrailingState } = await import('./trailing-exit-controller.js');
      clearTrailingState(position.symbol);
    } catch (err) {
      console.error(`[B65.2][TEC] Failed to clear trailing state for ${position.symbol}:`, err);
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
    eventBus.emitTradeClosed({
      mode: this.mode,
      symbol: position.symbol,
      strategy: position.strategyName || 'unknown',
      tradeId: trade?.id || positionId,
      pnl: netPnl,
      timestamp: new Date().toISOString(),
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

      // Get trade count before execution to detect if new trade was created
      const tradesBefore = await storage.getPaperSimTradesBySymbol(this.mode, signal.symbol);
      const openTradesBefore = tradesBefore.filter(t => t.openedAt && !t.closedAt);

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
        metadata: {
          source: 'RTB_PROMOTION',
          originalSignalId: signal.signalId,
          rtbQueueId: signal.id,
          queuedAt: signal.queuedAt,
        }
      } as any;

      // Execute the trade via processSignal
      await this.processSignal(promotedSignal);

      // Check if a new trade was created
      const tradesAfter = await storage.getPaperSimTradesBySymbol(this.mode, signal.symbol);
      const openTradesAfter = tradesAfter.filter(t => t.openedAt && !t.closedAt);

      // Find new trade (if any)
      const newTrade = openTradesAfter.find(t => 
        !openTradesBefore.some(ob => ob.id === t.id)
      );

      if (newTrade) {
        return { success: true, tradeId: newTrade.id };
      } else {
        return { success: false, error: 'No new trade created after processSignal' };
      }
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
    signal: StrategySignal & { quantity?: number; estimatedValue?: number; signalId?: string },
    settings: TradingSettings,
    cycleContext?: { portfolioValue: number; guardrails: GuardrailsV2 | null }
  ): Promise<void> {
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
      return; // Exit early - no trade created, no guardrails checked
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
      await storage.createPaperSimTradeLog(this.mode, {
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
      
      return;
    }

    // Directive 11.8B: Net Expectancy Gate
    // Check if trade has positive mathematical expectancy after fees & slippage
    // B63: Forward sourcePool + dbsScore so the kernel uses DBS-based pWin for Path D signals.
    const expectancyResult = evaluateTradeExpectancy(signal.symbol, {
      entryPrice: signal.entryPrice,
      targetPrice: signal.targetPrice,
      stopPrice: signal.stopPrice,
      DI: signal.metadata?.DI,
      VolNoise: signal.metadata?.VolNoise,
      prices: signal.metadata?.prices,
      sourcePool: (signal as any).sourcePool ?? signal.metadata?.sourcePool,
      dbsScore: signal.metadata?.dbsScore,
    });
    
    if (!expectancyResult.isTradeable) {
      // [B4] Log funnel attempt blocked by Net Expectancy Gate
      b4Diagnostics.logFunnelEvent({
        symbol: signal.symbol,
        strategy: signal.strategy,
        stage: 'attempt',
        block_reason: 'EV_REJECT'
      });
      
      console.log(`[11.8B][EV_BLOCK] ${signal.symbol} rejected: ${expectancyResult.rejectionReason}`);
      console.log(`[PaperExecution:${this.mode}] Paper trade rejected by Net Expectancy Gate: ${expectancyResult.rejectionReason}`);
      
      // Log rejection
      await storage.createPaperSimTradeLog(this.mode, {
        tradeId: null,
        positionId: null,
        eventType: 'trade_rejected',
        message: `Trade rejected by Net Expectancy Gate: ${signal.symbol} - ${expectancyResult.rejectionReason}`,
        metadata: {
          signal: tradeCandidate,
          rejectionReason: expectancyResult.rejectionReason,
          code: 'EV_REJECT',
          ev: expectancyResult.ev,
          score: expectancyResult.score
        }
      });
      
      return;
    }
    
    // Log expectancy gate pass with score for future analytics
    console.log(`[11.8B][EV_PASS] ${signal.symbol} EV=${expectancyResult.ev.toFixed(6)} Score=${expectancyResult.score.toFixed(1)}`);

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
        return;
      }
      const riskPerTradePct = parseFloat(settings.riskPerTradePct || '4.0');
      riskAmount = (portfolioValue * riskPerTradePct) / 100;
      const stopDistance = Math.abs(signal.entryPrice - signal.stopPrice);
      quantity = stopDistance > 0 ? riskAmount / stopDistance : 0;
      console.log(`[J7][EXEC_P3_FALLBACK] Calculated quantity: ${quantity.toFixed(8)} (mode: ${this.mode})`);
    }
    
    if (quantity <= 0) {
      console.log(`[8.8.3-F][RISK_REJECT] Invalid position size (quantity=${quantity}) - skipping trade`);
      return;
    }

    // Apply entry slippage and fees
    const slippage = signal.entryPrice * (this.SLIPPAGE_PERCENT / 100);
    const actualEntryPrice = signal.entryPrice + slippage; // Worse price due to slippage
    const positionValue = actualEntryPrice * quantity;
    const entryFee = positionValue * (this.FEE_PERCENT / 100);
    const totalSlippage = slippage * quantity;

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
      return; // Exit early - do not create trade or position
    }

    // [27.F.14.DIAG] Create trade record with comprehensive error handling
    // AJ10.3: Diagnostic logging for Open Trades vs Opened metrics mismatch
    console.log(`[AJ10.3][TRADE_CREATE_START] symbol=${signal.symbol} | strategy=${signal.strategy} | qty=${quantity.toFixed(8)} | estimatedValue=$${(signal.estimatedValue || 0).toFixed(2)}`);
    
    try {
      // Directive 10.3: Extract signal type fields for persistence
      const signalType = signal.signalType || 'QUANT';
      const patternType = signal.patternType || null;
      const patternStrength = signal.patternStrength?.toString() || null;
      
      console.log(`[10.3] Trade Execute: ${signal.symbol} | Type=${signalType} | Pattern=${patternType || 'N/A'} | Strength=${patternStrength || 'N/A'}`);
      
      // B65.1-HF2 (2026-04-23): baseCurrency is NOT NULL on paper_sim_trades. Derive from symbol.
      const baseCurrency = signal.symbol.split('/')[0] || signal.symbol;

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
        // Batch 19E: Persist sourcePool from signal metadata
        sourcePool: (signal as any)?.metadata?.sourcePool || (signal as any)?.sourcePool || null,
        metadata: {
          ...signal.metadata,
          tradeId: trade.id,
          highWaterMark: actualEntryPrice.toString(), // retained for legacy dashboards; no longer consumed by exit logic
          expectancyScore: expectancyResult.score, // Directive 11.8B: Trade quality score
          expectancyEV: expectancyResult.ev, // Directive 11.8B: Net expectancy
          // B65.2 (2026-04-23): volatility snapshot at open, consumed by the
          // trailing-exit engine at every subsequent exit-check cycle.
          atr_at_open: (signal as any)?.metadata?.atr ?? 0,
          di_at_open: (signal as any)?.metadata?.DI ?? 50,
          vol_noise_at_open: (signal as any)?.metadata?.VolNoise ?? 0.3,
        }
      });

      // AJ10.3: Diagnostic - open position created
      console.log(`[AJ10.3][OPEN_POSITION_OK] positionId=${openPosition.id} | symbol=${signal.symbol} | tradeId=${trade.id}`);

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
      await storage.createPaperSimTradeLog(this.mode, {
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
        type: 'paper_trade_opened' as any,
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
      
    } catch (err: any) {
      // [27.F.14.DIAG] DIAGNOSTIC: Trade insert failed
      console.error(`[DB] trade_insert_err {symbol:${signal.symbol}, error:${err.message}}`);
      throw err; // Re-throw to allow caller to handle
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
    return await storage.getPaperSimTradeLogs(this.mode, { limit });
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
  async processSignal(signal: StrategySignal): Promise<void> {
    if (!this.isRunning) {
      // Phase 8.8.3-I7-PM-FOCUS: BLOCK_AFTER_STOP diagnostic
      console.log(`[I7-PM-FOCUS][BLOCK_AFTER_STOP] symbol=${signal.symbol} reason="engine_stopped"`);
      console.log(`[PaperExecution:${this.mode}] Cannot process signal - engine not running`);
      return;
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
        return;
      }

      const settings = await buildSettingsFromGuardrails(this.mode, systemContext.lastStartedBy);
      
      if (settings.killSwitchTripped) {
        console.log(`[8.8.3-F][RISK_REJECT] Kill switch tripped - signal rejected for ${signal.symbol}`);
        return;
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
      const strategyMode: StrategyMode = resolveStrategyMode(regimeStability);
      const modeOverlay: StrategyModeOverlay = getModeOverlay(strategyMode);
      
      // 11.7S: Check if signal meets confidence floor for current mode
      const signalConfidence = signalMetadata.regimeConfidence || signal.confidence || 0.5;
      if (!meetsConfidenceFloor(signalConfidence, regimeStability)) {
        console.log(`[11.7S][Paper] SKIP: ${signal.symbol} ${signal.strategy} - confidence ${signalConfidence.toFixed(2)} < floor ${modeOverlay.confidenceFloor} (mode=${strategyMode})`);
        return;
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
          const sizingResult = sizePaperPositionForSignal({
            portfolioValue,
            guardrails,
            entryPrice: signal.entryPrice,
            stopPrice: signal.stopPrice,
            symbol: signal.symbol,
            strategy: signal.strategy as any,
          });
          
          if (sizingResult.quantity > 0 && sizingResult.estimatedValue > 0) {
            // 11.7S: Apply mode overlay to position size
            const adjustedQuantity = sizingResult.quantity * modeOverlay.positionSizeMultiplier;
            const adjustedValue = sizingResult.estimatedValue * modeOverlay.positionSizeMultiplier;
            signalAny.quantity = adjustedQuantity;
            signalAny.estimatedValue = adjustedValue;
            signalAny.preComputedNotional = adjustedValue;
            console.log(`[B6][FALLBACK_SIZED] ${signal.symbol}: qty=${adjustedQuantity.toFixed(8)}, value=$${adjustedValue.toFixed(2)} (mode=${strategyMode}, ×${modeOverlay.positionSizeMultiplier})`);
          } else {
            console.log(`[B6][SIZING_FAILED] Zero sizing result for ${signal.symbol} - skipping`);
            return;
          }
        } else {
          console.error(`[B6][SIZING_ERROR] Invalid portfolio value for fallback sizing: ${portfolioValue}`);
          return;
        }
      }

      // Note: Directive 11.7R-E hard governance filter applied before sizing (lines 2134-2160)
      // Note: Directive 11.7S mode overlay applied after governance (lines 2163-2193)
      // If we reach here, strategy is eligible for execution with mode overlay applied

      // 11.7S: Record mode execution for analytics
      recordModeExecution(strategyMode);
      
      console.log(`[8.8.3-F][PROCESS] Processing signal for ${signal.symbol} via guardrails_v2 path`);
      await this.executeSimulatedTrade(signal, settings);
      
    } catch (error) {
      console.error(`[PaperExecution:${this.mode}] Error processing signal for ${signal.symbol}:`, error);
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
