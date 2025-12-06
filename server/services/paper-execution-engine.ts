import { storage } from '../storage';
import { KrakenService } from './kraken';
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

interface ExitCondition {
  type: 'target_hit' | 'stop_hit' | 'trailing_stop_hit' | 'max_holding_period' | 'guardrail';
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
  private readonly SLIPPAGE_PERCENT = 0.15; // 0.15% slippage
  private readonly FEE_PERCENT = 0.10; // 0.10% trading fee
  private readonly MONITOR_INTERVAL_MS = 1500; // Phase 8.8.3-B3.5: Check every 1.5 seconds for real-time TP/SL evaluation
  private readonly MAX_PRICE_HISTORY = 100; // Keep last 100 candles per symbol
  private readonly RTB_TTL_SECONDS = 30; // REB 8.8.3-I: RTB signals expire after one FX5 cycle (30 seconds)
  
  // Phase 8.8.3-B3.5: Diagnostic counter for price tick cadence verification
  private readonly MAX_PRICE_TICK_LOGS = 100;
  private priceTickLogs: Array<{ symbol: string; refreshedAt: string; diffMs: number }> = [];
  private lastPriceTickTime: Map<string, number> = new Map();

  constructor(mode: 'live' | 'paper') {
    this.mode = mode;
    this.krakenService = new KrakenService();
    this.strategyEngine = new StrategyEngine();
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log(`[PaperExecution:${this.mode}] Already running`);
      return;
    }

    this.isRunning = true;
    
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
      
      // Subscribe to symbols for existing open positions
      const openPositions = await storage.getPaperSimOpenPositions(this.mode);
      if (openPositions.length > 0) {
        const symbols = openPositions.map(p => p.symbol);
        krakenWebSocketAdapter.subscribeToSymbols(symbols);
        console.log(`[PaperExecution:${this.mode}] Subscribed to ${symbols.length} open position symbols`);
      }
    } catch (error) {
      console.error(`[PaperExecution:${this.mode}] WebSocket adapter start failed (continuing with REST fallback):`, error);
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

    console.log(`[PaperExecution:${this.mode}] Stopped paper trading engine`);
  }

  /**
   * Phase 8.8.3-B7.A: Reset all in-memory session state
   * Called during hard reset to ensure no ghost state from previous sessions.
   * Clears: running state, intervals, price history, diagnostics, WebSocket subscriptions
   */
  resetSessionState(): void {
    console.log(`[B7.A][ENGINE] Resetting session state for mode=${this.mode}`);
    
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
    
    try {
      // Step 1: Check open positions for exit conditions
      await this.checkOpenPositions();

      // Step 2: Scan for new trading opportunities
      await this.scanForSignals();
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
    const openPositions = await storage.getPaperSimOpenPositions(this.mode);

    for (const position of openPositions) {
      try {
        // Phase 8.8.3-B3.6: Use WebSocket cache with REST fallback (5 second stale threshold)
        const restFetcher = async (): Promise<number | null> => {
          try {
            const ticker = await this.krakenService.getTicker(position.symbol);
            const tickerData = Object.values(ticker)[0];
            if (!tickerData) return null;
            return parseFloat(tickerData.c[0]);
          } catch {
            return null;
          }
        };
        
        const priceResult = await livePricingAdapter.getPriceWithFallback(position.symbol, restFetcher, 5000);
        
        let currentPrice: number;
        let priceSource: string;
        
        if (priceResult.price !== null) {
          currentPrice = priceResult.price;
          priceSource = priceResult.source === 'cache' ? 'ws_cache' : 'kraken_rest';
        } else {
          console.warn(`[PaperExecution:${this.mode}] No price data for ${position.symbol}`);
          continue;
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
        const avgPrice = parseFloat(position.avgPrice);
        const stopLoss = position.stopLoss ? parseFloat(position.stopLoss) : null;
        const takeProfit = position.takeProfit ? parseFloat(position.takeProfit) : null;

        // Calculate current P/L
        const pnl = (currentPrice - avgPrice) * parseFloat(position.quantity);
        const pnlPercent = ((currentPrice - avgPrice) / avgPrice) * 100;

        // Update position with current P/L
        await storage.updatePaperSimOpenPosition(this.mode, position.id, {
          currentPrice: currentPrice.toString(),
          unrealizedPnl: pnl.toString(),
          unrealizedPnlPercent: pnlPercent.toString()
        });

        // Check for exit conditions
        const exitCondition = await this.checkExitConditions(
          position,
          currentPrice,
          avgPrice,
          stopLoss,
          takeProfit
        );

        if (exitCondition) {
          await this.closePosition(position.id, currentPrice, exitCondition);
        }
      } catch (error) {
        console.error(`[PaperExecution:${this.mode}] Error checking position ${position.symbol}:`, error);
      }
    }
  }

  private async checkExitConditions(
    position: any,
    currentPrice: number,
    avgPrice: number,
    stopLoss: number | null,
    takeProfit: number | null
  ): Promise<ExitCondition | null> {
    // Check target hit (long position)
    if (takeProfit && currentPrice >= takeProfit) {
      return {
        type: 'target_hit',
        price: currentPrice,
        reason: `Price ${currentPrice.toFixed(2)} reached target ${takeProfit.toFixed(2)}`
      };
    }

    // Check stop hit (long position)
    if (stopLoss && currentPrice <= stopLoss) {
      return {
        type: 'stop_hit',
        price: currentPrice,
        reason: `Price ${currentPrice.toFixed(2)} hit stop ${stopLoss.toFixed(2)}`
      };
    }

    // Check trailing stop (if metadata indicates it)
    const metadata = position.metadata as Record<string, any>;
    if (metadata?.trailingStopPercent && metadata?.highWaterMark) {
      const trailingStopPercent = parseFloat(metadata.trailingStopPercent) / 100;
      const highWaterMark = parseFloat(metadata.highWaterMark);
      const trailingStopPrice = highWaterMark * (1 - trailingStopPercent);

      // Update high water mark if current price is higher
      if (currentPrice > highWaterMark) {
        await storage.updatePaperSimOpenPosition(this.mode, position.id, {
          metadata: {
            ...metadata,
            highWaterMark: currentPrice.toString()
          }
        });
      }

      // Check if trailing stop hit
      if (currentPrice <= trailingStopPrice) {
        return {
          type: 'trailing_stop_hit',
          price: currentPrice,
          reason: `Price ${currentPrice.toFixed(2)} hit trailing stop at ${trailingStopPrice.toFixed(2)} (${(trailingStopPercent * 100).toFixed(1)}% from high ${highWaterMark.toFixed(2)})`
        };
      }
    }

    // Check max holding period
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
    exitCondition: ExitCondition
  ): Promise<void> {
    const position = await storage.getPaperSimOpenPosition(this.mode, positionId);
    if (!position) {
      console.warn(`[PaperExecution:${this.mode}] Position ${positionId} not found`);
      return;
    }

    const avgPrice = parseFloat(position.avgPrice);
    const quantity = parseFloat(position.quantity);
    const entryValue = avgPrice * quantity;

    // Apply exit slippage and fees
    const slippage = exitPrice * (this.SLIPPAGE_PERCENT / 100);
    const actualExitPrice = exitPrice - slippage; // Worse price due to slippage
    const exitValue = actualExitPrice * quantity;
    const exitFee = exitValue * (this.FEE_PERCENT / 100);
    const entryFee = entryValue * (this.FEE_PERCENT / 100);

    // Calculate final P/L
    const grossPnl = exitValue - entryValue;
    const totalFees = entryFee + exitFee;
    const totalSlippage = slippage * quantity; // Total slippage impact
    const netPnl = grossPnl - totalFees;
    const pnlPercent = (netPnl / entryValue) * 100;

    console.log(`[PaperExecution:${this.mode}] Closing position ${position.symbol}:`);
    console.log(`  Entry: ${avgPrice.toFixed(2)}, Exit: ${actualExitPrice.toFixed(2)}`);
    console.log(`  Gross P/L: $${grossPnl.toFixed(2)}, Fees: $${totalFees.toFixed(2)}, Net P/L: $${netPnl.toFixed(2)} (${pnlPercent.toFixed(2)}%)`);
    console.log(`  Reason: ${exitCondition.reason}`);

    // Find the corresponding trade record
    const trades = await storage.getPaperSimTradesBySymbol(this.mode,  position.symbol);
    const trade = trades.find(t => t.openedAt && !t.closedAt);
    
    if (trade) {
      // Update trade record
      await storage.updatePaperSimTrade(this.mode, trade.id, {
        exitPrice: actualExitPrice.toString(),
        pnl: netPnl.toString(),
        pnlPercent: pnlPercent.toString(),
        fees: totalFees.toString(),
        slippage: totalSlippage.toString(),
        closeReason: exitCondition.type,
        closedAt: new Date()
      });

      // Log the exit event
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
          closeReason: exitCondition.type
        }
      });
    }

    // [AJ19-B] Trade lifecycle CLOSE event - track slot counts before/after delete
    const slotCountBefore = (await storage.getPaperSimOpenPositions(this.mode)).length;
    let deleteSuccessful = false;
    let deleteError: string | undefined;
    
    // Delete open position with error handling for AJ19-B
    try {
      await storage.deletePaperSimOpenPosition(this.mode, positionId);
      deleteSuccessful = true;
      console.log(`[AJ19-B][DELETE_SUCCESS] positionId=${positionId} | symbol=${position.symbol}`);
      
      // Phase 8.8.3-B3.6: Unsubscribe from Kraken WebSocket after position close
      try {
        krakenWebSocketAdapter.unsubscribeFromSymbols([position.symbol]);
        console.log(`[KrakenWS] Unsubscribed from ${position.symbol} after position close`);
      } catch (wsUnsubError) {
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

    console.log(`[PaperExecution:${this.mode}] Position ${position.symbol} closed successfully`);
  }

  private async scanForSignals(): Promise<void> {
    // [27.F.14.DIAG] Initialize default summary to prevent stale data on early exits
    const cycleTimestamp = new Date().toISOString();
    
    // [AJ16.7] Start a new diagnostic cycle with unique cycleId
    const cycleId = aj16Diagnostic.startCycle(this.mode);
    console.log(`[AJ16][CYCLE_START] mode=${this.mode} | cycleId=${cycleId}`);
    
    // [AJ18] Start AJ18 diagnostic cycle
    aj18Diagnostic.startCycle(this.mode);
    
    // [AJ19-B] Per-cycle reconciliation DISABLED for normal operation
    // Reconciliation should only run on-demand via API: POST /api/diagnostics/aj19b/reconcile
    // Re-enable by uncommenting below if needed for debugging:
    // try {
    //   if (aj19bDiagnostic.isActive()) {
    //     const reconcileResult = await aj19bDiagnostic.runReconciliation(cycleId, this.mode);
    //     if (reconcileResult.mismatchDetected) {
    //       console.warn(`[AJ19-B][MISMATCH] DB=${reconcileResult.dbOpenCount} vs Guardrail=${reconcileResult.guardrailOpenCount}`);
    //     }
    //   }
    // } catch (reconcileErr) {
    //   console.error('[AJ19-B] Reconciliation check failed:', reconcileErr);
    // }
    
    try {
      // Phase 8.8.3-H4: Get trading settings from guardrails_v2
      const modeSettings = await buildSettingsFromGuardrails(this.mode);
      
      // Check if kill switch is tripped
      if (modeSettings.killSwitchTripped) {
        console.log(`[PaperExecution:${this.mode}] Kill switch is tripped - skipping signal scan`);
        this.lastCycleSummary = {
          timestamp: cycleTimestamp,
          readyToBuyCount: 0,
          pulledCount: 0,
          evaluatedSymbols: [],
          tradesExecuted: 0,
          mode: this.mode,
          skippedReason: 'kill_switch_tripped'
        };
        // [AJ16.6] Force snapshot for early exit (per-cycle, no throttle)
        aj16Diagnostic.forceSnapshot(this.mode, {
          activeFilteredPairs: 0,
          openPositionsCount: 0,
          pairsWithActivePositions: 0
        });
        console.log(`[AJ16][CYCLE_END] mode=${this.mode} | cycleId=${cycleId} | reason=kill_switch_tripped`);
        return;
      }
      
      // REB 8.8.3-D-FIX: Get Active Filtered Pool (replaces watchlist)
      // The Active Filtered Pool contains all pairs that passed FX5 filters (deduped, non-expired)
      const activePool: ActiveFilteredPair[] = activeFilterPool.getActivePool(this.mode);
      
      // [B4] Update active pool count for funnel diagnostics
      b4Diagnostics.updateActivePoolCount(activePool.length);
      
      // Debug log for evaluation input verification
      console.log('[8.8.3-D-FIX][EVAL_INPUT]', {
        mode: this.mode,
        symbolCount: activePool.length,
        sample: activePool.slice(0, 5).map(p => p.symbol),
      });
      
      if (!activePool || activePool.length === 0) {
        console.log(`[PaperExecution:${this.mode}] Active Filtered Pool is empty - skipping signal scan (FX5 may still be populating)`);
        this.lastCycleSummary = {
          timestamp: cycleTimestamp,
          readyToBuyCount: 0,
          pulledCount: 0,
          evaluatedSymbols: [],
          tradesExecuted: 0,
          mode: this.mode,
          skippedReason: 'empty_active_pool'
        };
        // [AJ16.6] Force snapshot for early exit (per-cycle, no throttle)
        aj16Diagnostic.forceSnapshot(this.mode, {
          activeFilteredPairs: 0,
          openPositionsCount: 0,
          pairsWithActivePositions: 0
        });
        console.log(`[AJ16][CYCLE_END] mode=${this.mode} | cycleId=${cycleId} | reason=empty_active_pool`);
        return;
      }
      
      // Phase 8.8.3-J7: Load paper portfolio and guardrails ONCE per cycle (Cycle Context)
      // This is the canonical source for paper-mode position sizing
      let paperPortfolioValue = 0;
      let paperGuardrails: GuardrailsV2 | null = null;
      
      if (this.mode === 'paper') {
        try {
          const paperPortfolio = await storage.getPortfolioState({ mode: 'paper' });
          paperPortfolioValue = validatePaperPortfolioValue(paperPortfolio?.balance, 'scanForSignals');
          paperGuardrails = await storage.getGuardrailsV2({ mode: 'paper' }) || null;
          
          console.log('[J7][CYCLE_CONTEXT]', {
            mode: this.mode,
            portfolioValue: paperPortfolioValue.toFixed(2),
            riskPerTradePct: paperGuardrails?.portfolioRiskPerTradePct || 'default',
            maxPositionPct: paperGuardrails?.maxPositionPercentPct || 'default'
          });
        } catch (portfolioError) {
          console.error('[J7][CYCLE_CONTEXT_ERROR] Failed to load paper portfolio:', portfolioError);
          this.lastCycleSummary = {
            timestamp: cycleTimestamp,
            readyToBuyCount: 0,
            pulledCount: 0,
            evaluatedSymbols: [],
            tradesExecuted: 0,
            mode: this.mode,
            error: 'portfolio_load_failed'
          };
          // [AJ16.6] Force snapshot for early exit (per-cycle, no throttle)
          aj16Diagnostic.forceSnapshot(this.mode, {
            activeFilteredPairs: activePool.length,
            openPositionsCount: 0,
            pairsWithActivePositions: 0
          });
          console.log(`[AJ16][CYCLE_END] mode=${this.mode} | cycleId=${cycleId} | reason=portfolio_load_failed`);
          return;
        }
      }
      
      // REB 8.8.3-D: Build TradingSettings-compatible object from mode-level guardrails only
      // Note: getTradingSettings removed - use guardrails_v2 + defaults
      // Cast to unknown first to avoid type mismatch, then to TradingSettings
      const settings = {
        id: 'runtime-mode-settings',
        globalContextId: 'default',
        userId: null,
        riskPerTradePct: modeSettings.riskPerTradePct || '4.00',
        maxOpenTrades: modeSettings.maxOpenTrades || 3,
        maxExposurePercent: modeSettings.maxExposurePercent || '25.00',
        smaLength: 20,
        minVolume: '30000000.00',
        minDailyRange: '6.50',
        minPrice: '0.01',
        maxBidAskSpread: '1.00',
        excludeStablecoins: true,
        minDataHistoryDays: 90,
        allowedTradingPairs: ['USD', 'USDT'],
        blacklistedSymbols: [],
        whitelistedSymbols: [],
        vwapTimeframe: 60,
        vwapPullbackThreshold: '2.00',
        timezone: 'UTC',
        updatedAt: new Date(),
        riskPerTrade: null,
        slippageToleranceMajors: '0.50',
        slippageToleranceMidcaps: '2.00',
        slippageToleranceSmall: '5.00',
        stopBufferPercent: '0.30',
        aiCapitalAllocation: false,
        timeFormat: '24hr',
      } as unknown as TradingSettings;
      
      console.log(`[PaperExecution:${this.mode}] Scanning ${activePool.length} Active Filtered Pool pairs for signals...`);
      
      const evaluatedSymbols: string[] = [];
      let readyToBuyCount = 0;
      let tradesExecuted = 0;
      
      // Check open positions limit
      const openPositions = await storage.getPaperSimOpenPositions(this.mode);
      const maxPositions = settings.maxOpenTrades || 3;
      
      if (openPositions.length >= maxPositions) {
        console.log(`[PaperExecution:${this.mode}] Max open positions (${maxPositions}) reached - skipping new signals`);
        
        // [AJ18] Log max positions skip event - this is a key diagnostic for RTB starvation
        aj18Diagnostic.logMaxPositionsSkip({
          cycleId,
          openPositions: openPositions.length,
          maxPositions,
          reason: 'max_positions_reached_early_exit'
        });
        
        // [AJ18] Capture snapshot showing we skipped due to max positions
        aj18Diagnostic.captureSnapshot(this.mode, {
          openPositions: openPositions.length,
          maxPositions,
          activePoolSize: activePool.length,
          atMaxCapacity: true,
          skippedScanning: true
        });
        
        this.lastCycleSummary = {
          timestamp: cycleTimestamp,
          readyToBuyCount: 0,
          pulledCount: activePool.length,
          evaluatedSymbols: activePool.map(p => p.symbol),
          tradesExecuted: 0,
          mode: this.mode,
          skippedReason: 'max_positions_reached'
        };
        // [AJ16.6] Force snapshot for early exit (per-cycle, no throttle)
        aj16Diagnostic.forceSnapshot(this.mode, {
          activeFilteredPairs: activePool.length,
          openPositionsCount: openPositions.length,
          pairsWithActivePositions: openPositions.length
        });
        console.log(`[AJ16][CYCLE_END] mode=${this.mode} | cycleId=${cycleId} | reason=max_positions_reached`);
        return;
      }
      
      // REB 8.8.3-D-FIX: Scan each Active Filtered Pool symbol for signals
      // Phase 8.8.3-J7: Pass cycle context (portfolioValue + guardrails) to avoid repeated DB calls
      for (const pair of activePool) {
        if (openPositions.length + tradesExecuted >= maxPositions) {
          console.log(`[PaperExecution:${this.mode}] Position limit reached during scan`);
          break;
        }
        
        try {
          evaluatedSymbols.push(pair.symbol);
          const hasSignal = await this.checkSymbolForSignal(pair.symbol, settings, {
            portfolioValue: paperPortfolioValue,
            guardrails: paperGuardrails
          });
          if (hasSignal) {
            readyToBuyCount++;
            tradesExecuted++;
          }
        } catch (symbolError) {
          console.error(`[PaperExecution:${this.mode}] Error scanning ${pair.symbol}:`, symbolError);
        }
      }
      
      console.log(`[PaperExecution:${this.mode}] Scan complete: ${evaluatedSymbols.length} symbols, ${readyToBuyCount} signals, ${tradesExecuted} trades`);
      
      // [AJ18] Log pool state for this cycle
      aj18Diagnostic.logPoolState({
        cycleId: aj18Diagnostic.getCycleId(),
        activePoolSize: activePool.length,
        symbolsEvaluated: evaluatedSymbols.length,
        symbolsSkipped: activePool.length - evaluatedSymbols.length,
        skipReasons: {},
        rtbCandidatesProposed: readyToBuyCount
      });
      
      // [AJ18] Log max positions evaluation summary (when NOT at max)
      aj18Diagnostic.logMaxPositionsEvaluation({
        cycleId: aj18Diagnostic.getCycleId(),
        openPositions: openPositions.length,
        maxPositions,
        symbolsEvaluated: evaluatedSymbols.length,
        rtbGenerated: readyToBuyCount
      });
      
      // [AJ18] Capture snapshot for this cycle
      aj18Diagnostic.captureSnapshot(this.mode, {
        openPositions: openPositions.length,
        maxPositions,
        activePoolSize: activePool.length,
        atMaxCapacity: openPositions.length >= maxPositions,
        skippedScanning: false
      });
      
      // [AJ16.6] Force snapshot for every cycle (per-cycle, no throttle)
      aj16Diagnostic.forceSnapshot(this.mode, {
        activeFilteredPairs: activePool.length,
        openPositionsCount: openPositions.length,
        pairsWithActivePositions: openPositions.length
      });
      console.log(`[AJ16][CYCLE_END] mode=${this.mode} | cycleId=${cycleId} | evaluated=${evaluatedSymbols.length} | signals=${readyToBuyCount} | trades=${tradesExecuted}`);
      
      // Update summary with scan results
      this.lastCycleSummary = {
        timestamp: cycleTimestamp,
        readyToBuyCount,
        pulledCount: evaluatedSymbols.length,
        evaluatedSymbols,
        tradesExecuted,
        mode: this.mode
      };
    } catch (error) {
      console.error(`[PaperExecution:${this.mode}] Error in signal scanning:`, error);
      this.lastCycleSummary = {
        timestamp: cycleTimestamp,
        readyToBuyCount: 0,
        pulledCount: 0,
        evaluatedSymbols: [],
        tradesExecuted: 0,
        mode: this.mode,
        error: String(error)
      };
      // [AJ16.6] Force snapshot for error path (per-cycle, no throttle)
      aj16Diagnostic.forceSnapshot(this.mode, {
        activeFilteredPairs: 0,
        openPositionsCount: 0,
        pairsWithActivePositions: 0
      });
      console.log(`[AJ16][CYCLE_END] mode=${this.mode} | cycleId=${cycleId} | reason=scan_error`);
    }
  }

  // Phase 8.8.3-J7: Added cycleContext parameter for paper-mode sizing
  private async checkSymbolForSignal(
    symbol: string, 
    settings: TradingSettings,
    cycleContext?: { portfolioValue: number; guardrails: GuardrailsV2 | null }
  ): Promise<boolean> {
    const cycleId = aj16Diagnostic.getCycleId();
    
    // Check if we already have an open position for this symbol
    const existingPosition = await storage.getPaperSimOpenPositionBySymbol(this.mode,  symbol);
    if (existingPosition) {
      // [AJ16.3] Log active position exclusion
      aj16Diagnostic.logPositionExclusion({
        cycleId,
        symbol,
        reason: 'already_has_open_position',
        existingPositionId: existingPosition.id?.toString()
      });
      return false;
    }

    // Fetch current market data and build price history
    const ticker = await this.krakenService.getTicker(symbol);
    const tickerData = Object.values(ticker)[0];
    
    if (!tickerData) {
      return false;
    }

    // Get OHLC data for technical indicators
    const ohlcResponse = await this.krakenService.getOHLCData(symbol, 60); // 1-hour candles
    const ohlcData = ohlcResponse.ohlc;

    if (ohlcData.length === 0) {
      return false;
    }

    // Update price history with SMA field
    const priceData: PriceData[] = ohlcData.map(candle => ({
      id: `${symbol}-${candle.time}`,
      symbol: symbol,
      timestamp: new Date(candle.time * 1000),
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
      vwap: candle.vwap,
      sma: null // Will be calculated
    }));

    this.priceHistory.set(symbol, priceData.slice(-this.MAX_PRICE_HISTORY));

    // Calculate technical indicators
    const currentPrice = parseFloat(tickerData.c[0]);
    const volume24h = parseFloat(tickerData.v[1]); // 24h volume
    const high24h = parseFloat(tickerData.h[1]); // 24h high
    const low24h = parseFloat(tickerData.l[1]); // 24h low

    // Calculate VWAP and SMA from price history
    const vwap = this.calculateVWAP(priceData);
    const sma = this.calculateSMA(priceData, settings.smaLength || 20);

    const indicators: TechnicalIndicators = {
      currentPrice,
      vwap,
      sma,
      volume: volume24h,
      high24h,
      low24h
    };

    // [AJ16.4] Log indicator status for sanity checking
    const indicatorsValid = currentPrice > 0 && vwap > 0 && sma > 0 && volume24h >= 0;
    aj16Diagnostic.logIndicatorStatus({
      cycleId,
      pair: symbol,
      vwap,
      sma,
      currentPrice,
      volume24h,
      isValid: indicatorsValid,
      invalidReason: !indicatorsValid ? (currentPrice <= 0 ? 'invalid_price' : vwap <= 0 ? 'invalid_vwap' : sma <= 0 ? 'invalid_sma' : 'unknown') : undefined
    });

    // Run all strategies and pick the best signal
    const signals: StrategySignal[] = [];
    const strategiesEvaluated: string[] = [];

    // [AJ16.1] Log strategy outputs with signal emit status
    // VWAP Pullback
    const vwapSignal = this.strategyEngine.detectVWAPPullback(indicators, settings, priceData);
    const pctFromVwap = vwap > 0 ? ((currentPrice - vwap) / vwap * 100) : 0;
    aj16Diagnostic.logStrategySignal({
      cycleId, pair: symbol, strategy: 'vwap_pullback', 
      signalEmitted: !!vwapSignal, 
      price: vwapSignal?.entryPrice,
      signalValue: vwapSignal?.confidence,
      reason: vwapSignal ? 'met_criteria' : 'failed_criteria',
      indicators: { vwap, currentPrice, pctFromVwap: pctFromVwap.toFixed(2) }
    });
    if (vwapSignal) {
      vwapSignal.symbol = symbol;
      signals.push(vwapSignal);
      aj18Diagnostic.logSignalGenerated({ cycleId: aj18Diagnostic.getCycleId(), symbol, strategy: 'vwap_pullback', confidence: vwapSignal.confidence });
    } else {
      // [AJ18] Detailed criteria failure
      const vwapFailReason = currentPrice <= vwap ? 'price_below_vwap' : 
                             Math.abs(pctFromVwap) > 2 ? 'not_near_vwap' : 'no_reversal_pattern';
      aj18Diagnostic.logCriteriaFail({ cycleId: aj18Diagnostic.getCycleId(), symbol, strategy: 'vwap_pullback', specificReason: vwapFailReason, indicators: { pctFromVwap: pctFromVwap.toFixed(2) } });
    }

    // ABCD Long
    const abcdSignal = this.strategyEngine.detectABCDLong(priceData, settings);
    aj16Diagnostic.logStrategySignal({
      cycleId, pair: symbol, strategy: 'abcd_long',
      signalEmitted: !!abcdSignal,
      price: abcdSignal?.entryPrice,
      signalValue: abcdSignal?.confidence,
      reason: abcdSignal ? 'met_criteria' : 'failed_criteria'
    });
    if (abcdSignal) {
      abcdSignal.symbol = symbol;
      signals.push(abcdSignal);
      aj18Diagnostic.logSignalGenerated({ cycleId: aj18Diagnostic.getCycleId(), symbol, strategy: 'abcd_long', confidence: abcdSignal.confidence });
    } else {
      aj18Diagnostic.logCriteriaFail({ cycleId: aj18Diagnostic.getCycleId(), symbol, strategy: 'abcd_long', specificReason: 'no_pattern_detected' });
    }

    // SMA Trend Ride
    const smaSignal = this.strategyEngine.detectSMATrendRide(indicators, priceData, settings);
    const pctFromSma = sma > 0 ? ((currentPrice - sma) / sma * 100) : 0;
    aj16Diagnostic.logStrategySignal({
      cycleId, pair: symbol, strategy: 'sma_trend_ride',
      signalEmitted: !!smaSignal,
      price: smaSignal?.entryPrice,
      signalValue: smaSignal?.confidence,
      reason: smaSignal ? 'met_criteria' : 'failed_criteria',
      indicators: { sma, currentPrice, aboveSma: currentPrice > sma }
    });
    if (smaSignal) {
      smaSignal.symbol = symbol;
      signals.push(smaSignal);
      aj18Diagnostic.logSignalGenerated({ cycleId: aj18Diagnostic.getCycleId(), symbol, strategy: 'sma_trend_ride', confidence: smaSignal.confidence });
    } else {
      const smaFailReason = currentPrice <= sma ? 'price_below_sma' : 
                            Math.abs(pctFromSma) > 2 ? 'not_near_sma' : 'no_uptrend';
      aj18Diagnostic.logCriteriaFail({ cycleId: aj18Diagnostic.getCycleId(), symbol, strategy: 'sma_trend_ride', specificReason: smaFailReason, indicators: { pctFromSma: pctFromSma.toFixed(2) } });
    }

    // [8.8.3-J4] Phase J4.2: Add missing 6 strategies for full coverage
    // Breakout Strategy
    const breakoutSignal = this.strategyEngine.detectBreakout(priceData, {});
    aj16Diagnostic.logStrategySignal({
      cycleId, pair: symbol, strategy: 'breakout',
      signalEmitted: !!breakoutSignal,
      price: breakoutSignal?.entryPrice,
      signalValue: breakoutSignal?.confidence,
      reason: breakoutSignal ? 'met_criteria' : 'failed_criteria'
    });
    if (breakoutSignal) {
      breakoutSignal.symbol = symbol;
      signals.push(breakoutSignal);
      aj18Diagnostic.logSignalGenerated({ cycleId: aj18Diagnostic.getCycleId(), symbol, strategy: 'breakout', confidence: breakoutSignal.confidence });
    } else {
      aj18Diagnostic.logCriteriaFail({ cycleId: aj18Diagnostic.getCycleId(), symbol, strategy: 'breakout', specificReason: 'no_consolidation_breakout' });
    }

    // Mean Reversion Strategy
    const meanReversionSignal = this.strategyEngine.detectMeanReversion(indicators, priceData, {});
    aj16Diagnostic.logStrategySignal({
      cycleId, pair: symbol, strategy: 'mean_reversion',
      signalEmitted: !!meanReversionSignal,
      price: meanReversionSignal?.entryPrice,
      signalValue: meanReversionSignal?.confidence,
      reason: meanReversionSignal ? 'met_criteria' : 'failed_criteria'
    });
    if (meanReversionSignal) {
      meanReversionSignal.symbol = symbol;
      signals.push(meanReversionSignal);
      aj18Diagnostic.logSignalGenerated({ cycleId: aj18Diagnostic.getCycleId(), symbol, strategy: 'mean_reversion', confidence: meanReversionSignal.confidence });
    } else {
      aj18Diagnostic.logCriteriaFail({ cycleId: aj18Diagnostic.getCycleId(), symbol, strategy: 'mean_reversion', specificReason: 'not_oversold' });
    }

    // Range Trading Strategy
    const rangeTradingSignal = this.strategyEngine.detectRangeTrading(priceData, {});
    aj16Diagnostic.logStrategySignal({
      cycleId, pair: symbol, strategy: 'range_trading',
      signalEmitted: !!rangeTradingSignal,
      price: rangeTradingSignal?.entryPrice,
      signalValue: rangeTradingSignal?.confidence,
      reason: rangeTradingSignal ? 'met_criteria' : 'failed_criteria'
    });
    if (rangeTradingSignal) {
      rangeTradingSignal.symbol = symbol;
      signals.push(rangeTradingSignal);
      aj18Diagnostic.logSignalGenerated({ cycleId: aj18Diagnostic.getCycleId(), symbol, strategy: 'range_trading', confidence: rangeTradingSignal.confidence });
    } else {
      aj18Diagnostic.logCriteriaFail({ cycleId: aj18Diagnostic.getCycleId(), symbol, strategy: 'range_trading', specificReason: 'no_range_or_not_at_support' });
    }

    // VWAP Bounce Strategy
    const vwapBounceSignal = this.strategyEngine.detectVWAPBounce(indicators, priceData, {});
    aj16Diagnostic.logStrategySignal({
      cycleId, pair: symbol, strategy: 'vwap_bounce',
      signalEmitted: !!vwapBounceSignal,
      price: vwapBounceSignal?.entryPrice,
      signalValue: vwapBounceSignal?.confidence,
      reason: vwapBounceSignal ? 'met_criteria' : 'failed_criteria'
    });
    if (vwapBounceSignal) {
      vwapBounceSignal.symbol = symbol;
      signals.push(vwapBounceSignal);
      aj18Diagnostic.logSignalGenerated({ cycleId: aj18Diagnostic.getCycleId(), symbol, strategy: 'vwap_bounce', confidence: vwapBounceSignal.confidence });
    } else {
      const vwapBounceFailReason = currentPrice > vwap ? 'price_above_vwap' : 'no_bounce_confirmation';
      aj18Diagnostic.logCriteriaFail({ cycleId: aj18Diagnostic.getCycleId(), symbol, strategy: 'vwap_bounce', specificReason: vwapBounceFailReason });
    }

    // Liquidity Trap Strategy
    const liquidityTrapSignal = this.strategyEngine.detectLiquidityTrap(priceData, {});
    aj16Diagnostic.logStrategySignal({
      cycleId, pair: symbol, strategy: 'liquidity_trap',
      signalEmitted: !!liquidityTrapSignal,
      price: liquidityTrapSignal?.entryPrice,
      signalValue: liquidityTrapSignal?.confidence,
      reason: liquidityTrapSignal ? 'met_criteria' : 'failed_criteria'
    });
    if (liquidityTrapSignal) {
      liquidityTrapSignal.symbol = symbol;
      signals.push(liquidityTrapSignal);
      aj18Diagnostic.logSignalGenerated({ cycleId: aj18Diagnostic.getCycleId(), symbol, strategy: 'liquidity_trap', confidence: liquidityTrapSignal.confidence });
    } else {
      aj18Diagnostic.logCriteriaFail({ cycleId: aj18Diagnostic.getCycleId(), symbol, strategy: 'liquidity_trap', specificReason: 'no_trap_pattern' });
    }

    // DHMA Strategy
    const dhmaSignal = this.strategyEngine.detectDHMA(indicators, priceData, {});
    aj16Diagnostic.logStrategySignal({
      cycleId, pair: symbol, strategy: 'dhma',
      signalEmitted: !!dhmaSignal,
      price: dhmaSignal?.entryPrice,
      signalValue: dhmaSignal?.confidence,
      reason: dhmaSignal ? 'met_criteria' : 'failed_criteria'
    });
    if (dhmaSignal) {
      dhmaSignal.symbol = symbol;
      signals.push(dhmaSignal);
      aj18Diagnostic.logSignalGenerated({ cycleId: aj18Diagnostic.getCycleId(), symbol, strategy: 'dhma', confidence: dhmaSignal.confidence });
    } else {
      aj18Diagnostic.logCriteriaFail({ cycleId: aj18Diagnostic.getCycleId(), symbol, strategy: 'dhma', specificReason: 'regime_mismatch' });
    }

    // Execute the highest confidence signal
    if (signals.length > 0) {
      const bestSignal = signals.reduce((prev, current) => 
        current.confidence > prev.confidence ? current : prev
      );

      // [27.F.14.DIAG] DIAGNOSTIC: Signal snapshot with confidence evaluation
      console.log(`[Exec] signal_snapshot {symbol:${bestSignal.symbol}, strategy:${bestSignal.strategy}, confidence:${bestSignal.confidence.toFixed(3)}, entryPrice:${bestSignal.entryPrice.toFixed(2)}}`);

      // [27.F.14.B] INSTRUMENTATION: Candidate selected
      console.log(`[27.F.14.B][PaperSim] candidate_selected {symbol:"${bestSignal.symbol}", strategy:"${bestSignal.strategy}", confidence:${(bestSignal.confidence * 100).toFixed(1)}%}`);
      contextBridge.broadcast({
        type: 'trading_pipeline_event' as any,
        payload: {
          mode: this.mode,
          eventType: 'candidate_selected',
          message: `${bestSignal.symbol}: ${bestSignal.strategy} strategy (${(bestSignal.confidence * 100).toFixed(1)}% confidence)`,
          timestamp: new Date().toISOString(),
          metadata: {
            symbol: bestSignal.symbol,
            strategy: bestSignal.strategy,
            confidence: bestSignal.confidence,
            entryPrice: bestSignal.entryPrice
          }
        }
      });

      // REB 8.8.3-I: Check if symbol already has an active trade/position before RTB enqueue
      // For paper mode, check paper-sim open positions; for live mode, check broadcast trades
      const hasActiveTrade = this.mode === 'paper'
        ? (await storage.getPaperSimOpenPositions(this.mode)).some(pos => pos.symbol === bestSignal.symbol)
        : (await storage.getActiveTrades(this.mode)).some(trade => trade.symbol === bestSignal.symbol);
      
      if (hasActiveTrade) {
        console.log(`[8.8.3-I][RTB_REJECT_ACTIVE] Symbol ${bestSignal.symbol} already has active trade - skipping RTB enqueue`);
        // [AJ16.5] Log RTB rejection due to active position
        aj16Diagnostic.logRTBEvent({
          cycleId,
          pair: bestSignal.symbol,
          eventType: 'RTB_REJECT',
          strategy: bestSignal.strategy,
          confidence: bestSignal.confidence,
          reason: 'already_has_active_position'
        });
        // Still execute the trade logic below if needed, just don't add to RTB
      } else {
        // REB 8.8.3-E: Save signal to trading_signals table for Ready-to-Buy display
        // This populates the RTB tab with real strategy signals from Active Filtered Pool
        // Parse base/quote currencies from symbol (handles "BTC/USD", "BTCUSD", "FETEUR" formats)
        let baseCurrency = '';
        let quoteCurrency = '';
        
        if (bestSignal.symbol.includes('/')) {
          // Format: "BTC/USD" or "VINE/USD"
          const parts = bestSignal.symbol.split('/');
          baseCurrency = parts[0];
          quoteCurrency = parts[1];
        } else {
          // Format: "BTCUSD", "FETEUR", "XBTUSDT" - need to detect quote suffix
          const quotePatterns = ['USDT', 'USD', 'EUR', 'BTC', 'ETH', 'GBP', 'ZUSD', 'ZEUR'];
          let matched = false;
          for (const quote of quotePatterns) {
            if (bestSignal.symbol.endsWith(quote)) {
              baseCurrency = bestSignal.symbol.slice(0, -quote.length);
              quoteCurrency = quote;
              matched = true;
              break;
            }
          }
          if (!matched) {
            // Fallback: assume last 3 chars are quote currency
            baseCurrency = bestSignal.symbol.slice(0, -3);
            quoteCurrency = bestSignal.symbol.slice(-3);
          }
        }
        
        // REB 8.8.3-I: TTL = 30 seconds (one FX5 cycle)
        const expiresAt = new Date(Date.now() + this.RTB_TTL_SECONDS * 1000);
        
        // Phase 8.8.3-J7: Compute position sizing at P2 using cycle context
        let signalQuantity = 0;
        let signalEstimatedValue = 0;
        
        if (this.mode === 'paper' && cycleContext) {
          const sizing = sizePaperPositionForSignal({
            portfolioValue: cycleContext.portfolioValue,
            guardrails: cycleContext.guardrails,
            entryPrice: bestSignal.entryPrice,
            stopPrice: bestSignal.stopPrice,
            symbol: bestSignal.symbol,
            strategy: bestSignal.strategy as StrategyType
          });
          signalQuantity = sizing.quantity;
          signalEstimatedValue = sizing.estimatedValue;
        }
        
        try {
          await storage.saveTradingSignal({
            mode: this.mode,
            symbol: bestSignal.symbol,
            baseCurrency,
            quoteCurrency,
            strategy: bestSignal.strategy as any,
            confidence: bestSignal.confidence.toString(),
            entryPrice: bestSignal.entryPrice.toString(),
            stopPrice: bestSignal.stopPrice.toString(),
            targetPrice: bestSignal.targetPrice.toString(),
            currentPrice: indicators.currentPrice.toString(),
            vwap: indicators.vwap?.toString() || null,
            volume24h: indicators.volume?.toString() || null,
            dailyRange: indicators.high24h && indicators.low24h && indicators.currentPrice > 0
              ? (((indicators.high24h - indicators.low24h) / indicators.currentPrice) * 100).toFixed(2)
              : null,
            status: 'active',
            expiresAt,
            quantity: signalQuantity > 0 ? signalQuantity.toString() : null,
            estimatedValue: signalEstimatedValue > 0 ? signalEstimatedValue.toString() : null,
            metadata: {
              detectedBy: 'paper_execution_engine',
              source: 'active_filtered_pool',
              scanCycle: new Date().toISOString(),
              ttlSeconds: this.RTB_TTL_SECONDS,
              sizingSource: this.mode === 'paper' ? 'paper_position_sizing' : 'none'
            }
          });
          
          console.log('[8.8.3-I][RTB_ENQUEUE]', {
            mode: this.mode,
            symbol: bestSignal.symbol,
            strategy: bestSignal.strategy,
            confidence: bestSignal.confidence,
            quantity: signalQuantity.toFixed(8),
            estimatedValue: signalEstimatedValue.toFixed(2),
            ttlSeconds: this.RTB_TTL_SECONDS,
            expiresAt: expiresAt.toISOString()
          });
          
          // [AJ16.5] Log RTB generation success
          aj16Diagnostic.logRTBEvent({
            cycleId,
            pair: bestSignal.symbol,
            eventType: 'BECAME_RTB',
            strategy: bestSignal.strategy,
            confidence: bestSignal.confidence,
            reason: 'signal_enqueued_to_rtb_list'
          });
        } catch (signalError) {
          console.error(`[8.8.3-I][RTB_ENQUEUE] Failed to save signal for ${bestSignal.symbol}:`, signalError);
        }
        
        // Phase 8.8.3-J7: Pass computed sizing to executeSimulatedTrade
        (bestSignal as any).quantity = signalQuantity;
        (bestSignal as any).estimatedValue = signalEstimatedValue;
      }

      await this.executeSimulatedTrade(bestSignal, settings, cycleContext);
      return true;
    }

    return false;
  }

  /**
   * [27.F.14.B] Inject a forced trade for deterministic testing
   * MSI Guard: Only callable in paper mode
   */
  private async injectForcedTrade(symbol: string, settings: TradingSettings): Promise<void> {
    // MSI Guard: Hard check - this should never be called in live mode
    if (this.mode !== 'paper') {
      console.error(`[27.F.14.B][MSI VIOLATION] injectForcedTrade called in ${this.mode} mode. REJECTED.`);
      return;
    }

    // Check if we already have a position for this symbol
    const existingPosition = await storage.getPaperSimOpenPositionBySymbol(this.mode, symbol);
    if (existingPosition) {
      console.log(`[27.F.14.B][PaperSim] Forced trade skipped - position already exists for ${symbol}`);
      return;
    }

    // Fetch current market data
    const ticker = await this.krakenService.getTicker(symbol);
    const tickerData = Object.values(ticker)[0];
    
    if (!tickerData) {
      console.error(`[27.F.14.B][PaperSim] No ticker data for forced symbol: ${symbol}`);
      return;
    }

    const currentPrice = parseFloat(tickerData.c[0]);

    // Create a simple forced signal
    const forcedSignal: StrategySignal = {
      symbol: symbol,
      strategy: 'vwap_pullback',
      entryPrice: currentPrice,
      stopPrice: currentPrice * 0.98, // 2% stop loss
      targetPrice: currentPrice * 1.04, // 4% target
      confidence: 0.75, // High confidence for testing
      metadata: {
        forced: true,
        source: 'PAPER_FORCE_TRADE_SYMBOL',
        reason: 'Deterministic testing - no qualifying trades found'
      }
    };

    console.log(`[27.F.14.B][PaperSim] Injecting forced trade for ${symbol} @ ${currentPrice.toFixed(2)}`);
    
    // [27.F.14.B] INSTRUMENTATION: Candidate selected
    console.log(`[27.F.14.B][PaperSim] candidate_selected {symbol:"${symbol}", strategy:"forced", confidence:75.0%, forced:true}`);
    contextBridge.broadcast({
      type: 'trading_pipeline_event' as any,
      payload: {
        mode: this.mode,
        eventType: 'candidate_selected',
        message: `${symbol}: FORCED trade for testing (75.0% confidence)`,
        timestamp: new Date().toISOString(),
        metadata: {
          symbol: symbol,
          strategy: 'forced',
          confidence: 0.75,
          entryPrice: currentPrice,
          forced: true
        }
      }
    });

    await this.executeSimulatedTrade(forcedSignal, settings);
  }

  // Phase 8.8.3-J7: Added cycleContext parameter for paper-mode sizing
  private async executeSimulatedTrade(
    signal: StrategySignal & { quantity?: number; estimatedValue?: number },
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
    const tradeCandidate: TradeCandidate = {
      symbol: signal.symbol,
      strategy: signal.strategy,
      entryPrice: signal.entryPrice,
      stopPrice: signal.stopPrice,
      targetPrice: signal.targetPrice,
      // AJ10.1: Pass the pre-sized estimatedValue so checkPositionSizeCap trusts it
      preComputedNotional: signal.estimatedValue,
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

    // [27.F.14.DIAG] Create trade record with comprehensive error handling
    // AJ10.3: Diagnostic logging for Open Trades vs Opened metrics mismatch
    console.log(`[AJ10.3][TRADE_CREATE_START] symbol=${signal.symbol} | strategy=${signal.strategy} | qty=${quantity.toFixed(8)} | estimatedValue=$${(signal.estimatedValue || 0).toFixed(2)}`);
    
    try {
      const trade = await storage.createPaperSimTrade(this.mode, {
        symbol: signal.symbol,
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

      // Create open position
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
        metadata: {
          ...signal.metadata,
          tradeId: trade.id,
          highWaterMark: actualEntryPrice.toString() // For trailing stop tracking
        }
      });

      // AJ10.3: Diagnostic - open position created
      console.log(`[AJ10.3][OPEN_POSITION_OK] positionId=${openPosition.id} | symbol=${signal.symbol} | tradeId=${trade.id}`);

      // Phase 8.8.3-B3.6: Subscribe to Kraken WebSocket for real-time price updates
      try {
        krakenWebSocketAdapter.subscribeToSymbols([signal.symbol]);
        console.log(`[KrakenWS] Subscribed to ${signal.symbol} for real-time price updates`);
      } catch (wsSubError) {
        console.warn(`[KrakenWS] Failed to subscribe to ${signal.symbol} (REST fallback active):`, wsSubError);
      }

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
      console.log(`[PaperExecution:${this.mode}] Cannot process signal - engine not running`);
      return;
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

      const hasQuantity = signalAny.quantity != null && signalAny.quantity > 0;
      const hasEstimatedValue = signalAny.estimatedValue != null && signalAny.estimatedValue > 0;
      
      if (hasQuantity && hasEstimatedValue) {
        console.log(`[B6][TRUST_SIZED] Using pre-sized signal for ${signal.symbol}: qty=${signalAny.quantity.toFixed(8)}, value=$${signalAny.estimatedValue.toFixed(2)}`);
      } else {
        console.log(`[B6][FALLBACK_SIZING] Signal missing sizing fields for ${signal.symbol}, will size in executeSimulatedTrade`);
        const guardrails = await storage.getGuardrailsV2({ mode: this.mode });
        const portfolioState = await storage.getPortfolioState({ mode: this.mode, userId: systemContext.lastStartedBy });
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
            signalAny.quantity = sizingResult.quantity;
            signalAny.estimatedValue = sizingResult.estimatedValue;
            signalAny.preComputedNotional = sizingResult.estimatedValue;
            console.log(`[B6][FALLBACK_SIZED] ${signal.symbol}: qty=${sizingResult.quantity.toFixed(8)}, value=$${sizingResult.estimatedValue.toFixed(2)}`);
          } else {
            console.log(`[B6][SIZING_FAILED] Zero sizing result for ${signal.symbol} - skipping`);
            return;
          }
        } else {
          console.error(`[B6][SIZING_ERROR] Invalid portfolio value for fallback sizing: ${portfolioValue}`);
          return;
        }
      }

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
