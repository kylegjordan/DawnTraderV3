import { storage } from '../storage';
import { KrakenService } from './kraken';
import { StrategyEngine, type StrategySignal, type TechnicalIndicators } from './strategy-engine';
import { RiskManager, buildSettingsFromModeLevel } from './risk-manager';
import type { TradingSettings, PriceData } from '@shared/schema';
import { contextBridge } from './context-bridge';

interface ExitCondition {
  type: 'target_hit' | 'stop_hit' | 'trailing_stop_hit' | 'max_holding_period' | 'guardrail';
  price?: number;
  reason: string;
}

export class PaperExecutionEngine {
  private mode: 'live' | 'paper'; // Phase 27.F.15.B.2: Mode-based only, global per mode
  private isRunning: boolean = false;
  private isCycleRunning: boolean = false; // Re-entrancy guard
  private krakenService: KrakenService;
  private strategyEngine: StrategyEngine;
  private riskManager: RiskManager;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private priceHistory: Map<string, PriceData[]> = new Map();
  private lastCycleSummary: any = {}; // Phase 27.F.14.DIAG: Cache last cycle for telemetry
  
  // Configuration
  private readonly SLIPPAGE_PERCENT = 0.15; // 0.15% slippage
  private readonly FEE_PERCENT = 0.10; // 0.10% trading fee
  private readonly MONITOR_INTERVAL_MS = 10000; // Check every 10 seconds
  private readonly MAX_PRICE_HISTORY = 100; // Keep last 100 candles per symbol

  constructor(mode: 'live' | 'paper') {
    this.mode = mode;
    this.krakenService = new KrakenService();
    this.strategyEngine = new StrategyEngine();
    this.riskManager = new RiskManager();
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log(`[PaperExecution:${this.mode}] Already running`);
      return;
    }

    this.isRunning = true;
    console.log(`[PaperExecution:${this.mode}] Starting paper trading engine`);

    // Broadcast engine start
    contextBridge.broadcast({
      type: 'trading_pipeline_event' as any,
      payload: {
        mode: this.mode,
        eventType: 'engine_started',
        message: `${this.mode} paper trading engine started`,
        timestamp: new Date().toISOString()
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

    console.log(`[PaperExecution:${this.mode}] Stopped paper trading engine`);
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
        // Fetch current price
        const ticker = await this.krakenService.getTicker(position.symbol);
        const tickerData = Object.values(ticker)[0];
        
        if (!tickerData) {
          console.warn(`[PaperExecution:${this.mode}] No ticker data for ${position.symbol}`);
          continue;
        }

        const currentPrice = parseFloat(tickerData.c[0]); // Current price
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

    // Delete open position
    await storage.deletePaperSimOpenPosition(this.mode, positionId);

    console.log(`[PaperExecution:${this.mode}] Position ${position.symbol} closed successfully`);
  }

  private async scanForSignals(): Promise<void> {
    // [27.F.14.DIAG] Initialize default summary to prevent stale data on early exits
    const cycleTimestamp = new Date().toISOString();
    
    try {
      // REB 8.8.3-D: Get trading settings from mode-level guardrails
      const modeSettings = await buildSettingsFromModeLevel(this.mode);
      
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
        return;
      }
      
      // Get watchlist pairs to scan
      const watchlist = await storage.getWatchlist({ mode: this.mode });
      
      if (!watchlist || watchlist.length === 0) {
        console.log(`[PaperExecution:${this.mode}] No watchlist pairs configured - skipping signal scan`);
        this.lastCycleSummary = {
          timestamp: cycleTimestamp,
          readyToBuyCount: 0,
          pulledCount: 0,
          evaluatedSymbols: [],
          tradesExecuted: 0,
          mode: this.mode,
          skippedReason: 'no_watchlist'
        };
        return;
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
      
      console.log(`[PaperExecution:${this.mode}] Scanning ${watchlist.length} watchlist pairs for signals...`);
      
      const evaluatedSymbols: string[] = [];
      let readyToBuyCount = 0;
      let tradesExecuted = 0;
      
      // Check open positions limit
      const openPositions = await storage.getPaperSimOpenPositions(this.mode);
      const maxPositions = settings.maxOpenTrades || 3;
      
      if (openPositions.length >= maxPositions) {
        console.log(`[PaperExecution:${this.mode}] Max open positions (${maxPositions}) reached - skipping new signals`);
        this.lastCycleSummary = {
          timestamp: cycleTimestamp,
          readyToBuyCount: 0,
          pulledCount: watchlist.length,
          evaluatedSymbols: watchlist.map(w => w.symbol),
          tradesExecuted: 0,
          mode: this.mode,
          skippedReason: 'max_positions_reached'
        };
        return;
      }
      
      // Scan each watchlist symbol for signals
      for (const pair of watchlist) {
        if (openPositions.length + tradesExecuted >= maxPositions) {
          console.log(`[PaperExecution:${this.mode}] Position limit reached during scan`);
          break;
        }
        
        try {
          evaluatedSymbols.push(pair.symbol);
          const hasSignal = await this.checkSymbolForSignal(pair.symbol, settings);
          if (hasSignal) {
            readyToBuyCount++;
            tradesExecuted++;
          }
        } catch (symbolError) {
          console.error(`[PaperExecution:${this.mode}] Error scanning ${pair.symbol}:`, symbolError);
        }
      }
      
      console.log(`[PaperExecution:${this.mode}] Scan complete: ${evaluatedSymbols.length} symbols, ${readyToBuyCount} signals, ${tradesExecuted} trades`);
      
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
    }
  }

  private async checkSymbolForSignal(symbol: string, settings: TradingSettings): Promise<boolean> {
    // Check if we already have an open position for this symbol
    const existingPosition = await storage.getPaperSimOpenPositionBySymbol(this.mode,  symbol);
    if (existingPosition) {
      // Skip - already have position for this symbol
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

    // Run all strategies and pick the best signal
    const signals: StrategySignal[] = [];

    // VWAP Pullback
    const vwapSignal = this.strategyEngine.detectVWAPPullback(indicators, settings, priceData);
    if (vwapSignal) {
      vwapSignal.symbol = symbol;
      signals.push(vwapSignal);
    }

    // ABCD Long
    const abcdSignal = this.strategyEngine.detectABCDLong(priceData, settings);
    if (abcdSignal) {
      abcdSignal.symbol = symbol;
      signals.push(abcdSignal);
    }

    // SMA Trend Ride
    const smaSignal = this.strategyEngine.detectSMATrendRide(indicators, priceData, settings);
    if (smaSignal) {
      smaSignal.symbol = symbol;
      signals.push(smaSignal);
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

      await this.executeSimulatedTrade(bestSignal, settings);
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

  private async executeSimulatedTrade(signal: StrategySignal, settings: TradingSettings): Promise<void> {
    console.log(`[PaperExecution:${this.mode}] Signal detected for ${signal.symbol}:`);
    console.log(`  Strategy: ${signal.strategy}, Confidence: ${(signal.confidence * 100).toFixed(1)}%`);
    console.log(`  Entry: ${signal.entryPrice.toFixed(2)}, Stop: ${signal.stopPrice.toFixed(2)}, Target: ${signal.targetPrice.toFixed(2)}`);

    // Pre-trade risk checks (using paper mode settings)
    const tradeSignal = {
      symbol: signal.symbol,
      strategy: signal.strategy,
      entryPrice: signal.entryPrice,
      stopPrice: signal.stopPrice,
      targetPrice: signal.targetPrice,
      confidence: signal.confidence,
      goalAlignmentScore: 0.5, // Will be calculated by risk manager
      finalScore: signal.confidence,
      metadata: signal.metadata
    };

    const riskCheck = await this.riskManager.checkPreTradeRisk(
      this.mode,
      tradeSignal,
      settings
    );

    if (!riskCheck.approved) {
      console.log(`[PaperExecution:${this.mode}] Paper trade rejected by risk manager: ${riskCheck.reason}`);
      
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
            signal: tradeSignal
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
          signal: tradeSignal,
          rejectionReason: riskCheck.reason
        }
      });
      
      return;
    }

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

    // Calculate position size based on risk
    const riskAmount = parseFloat(settings.riskPerTrade || '100');
    const stopDistance = Math.abs(signal.entryPrice - signal.stopPrice);
    const quantity = riskAmount / stopDistance;

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

      // Create open position
      await storage.createPaperSimOpenPosition(this.mode, {
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
   * Phase 37: Process external signal from SignalOrchestrator
   * Public method for SignalOrchestrator to submit signals for execution
   */
  async processSignal(signal: StrategySignal): Promise<void> {
    if (!this.isRunning) {
      console.log(`[PaperExecution:${this.mode}] Cannot process signal - engine not running`);
      return;
    }

    try {
      // Get system context for this mode
      const systemContext = await storage.getSystemContext(this.mode);
      if (!systemContext || !systemContext.lastStartedBy) {
        console.error(`[PaperExecution:${this.mode}] No system context or user for ${this.mode} mode`);
        return;
      }

      // Phase 41F-L.E2E-PURGE: getTradingSettings method removed
      // Signal processing temporarily disabled pending migration to guardrails_v2
      console.log(`[PaperExecution:${this.mode}] Signal processing disabled (pending guardrails_v2 migration) for ${signal.symbol}`);
      return;
    } catch (error) {
      console.error(`[PaperExecution:${this.mode}] Error processing signal for ${signal.symbol}:`, error);
    }
  }
}
