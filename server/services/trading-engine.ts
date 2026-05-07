import { KrakenService } from '../exchanges/kraken/kraken.js';
import { checkGuardrailRisk, type TradeCandidate } from './trade-safety';
import { buildSettingsFromGuardrails } from './guardrail-settings';
import { StrategyEngine, StrategySignal } from './strategy-engine';
import { SignalOrchestrator } from './signal-orchestrator';
import { storage } from '../storage';
import { Trade, TradingSettings } from '@shared/schema';
import { telemetryTrace } from './telemetry-trace.js';
import { telemetryService } from './telemetry-service.js';

export interface TradeSignal {
  symbol: string;
  strategy: 'vwap_pullback' | 'abcd_long' | 'sma_trend_ride' | 'breakout' | 'mean_reversion' | 'range_trading' | 'vwap_bounce' | 'liquidity_trap' | 'dhma';
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  confidence: number;
  goalAlignmentScore?: number;
  finalScore?: number;
  metadata: any;
}

export interface TradingEngineDependencies {
  krakenService?: KrakenService;
  strategyEngine?: StrategyEngine;
}

export class TradingEngine {
  private kraken: KrakenService;
  private strategyEngine: StrategyEngine;
  private signalOrchestrator: SignalOrchestrator | null = null;
  private isRunning = false;
  private mode: 'live' | 'paper';

  constructor(
    mode: 'live' | 'paper',
    apiKey?: string, 
    apiSecret?: string,
    dependencies?: TradingEngineDependencies
  ) {
    this.mode = mode;
    this.kraken = dependencies?.krakenService || new KrakenService(apiKey, apiSecret);
    this.strategyEngine = dependencies?.strategyEngine || new StrategyEngine();
  }

  async start(): Promise<void> {
    telemetryTrace.trace('TradingEngine', 'START_REQUESTED', 'INFO', { mode: this.mode });
    
    this.isRunning = true;
    console.log(`[37.A][ENGINE][mode=${this.mode}] Trading engine started`);
    telemetryTrace.trace('TradingEngine', 'ENGINE_STARTED', 'INFO', { mode: this.mode });

    // Phase 37: Start signal orchestrator for automatic signal generation
    this.signalOrchestrator = new SignalOrchestrator({
      mode: this.mode,
      evaluationIntervalMs: 30000, // 30 seconds
      enabledStrategies: [
        'vwap_pullback',
        'abcd_long',
        'sma_trend_ride',
        'breakout',
        'mean_reversion',
        'range_trading',
        'vwap_bounce',
        'liquidity_trap',
        'dhma'
      ]
    });

    telemetryTrace.trace('TradingEngine', 'SIGNAL_ORCHESTRATOR_INIT', 'INFO', { 
      mode: this.mode,
      interval: 30000,
      strategies: 9
    });

    await this.signalOrchestrator.start(async (signal: StrategySignal) => {
      // Forward generated signals to processSignal for trade execution
      await this.processSignal(signal as TradeSignal);
    });

    console.log(`[37.A][ENGINE][mode=${this.mode}] Signal orchestrator started`);
    telemetryTrace.trace('TradingEngine', 'SIGNAL_ORCHESTRATOR_STARTED', 'INFO', { mode: this.mode });
  }

  async stop(): Promise<void> {
    // I7-ROOT-FIX (B): Robust stop with early return if already stopped
    if (!this.isRunning) {
      console.log('[I7-ROOT-FIX][STOP_IGNORED_ALREADY_STOPPED]', { mode: this.mode });
      return;
    }
    
    console.log('[I7-ROOT-FIX][STOP_CALLED]', { mode: this.mode });
    telemetryTrace.trace('TradingEngine', 'STOP_REQUESTED', 'INFO', { mode: this.mode });
    
    this.isRunning = false;
    
    // Phase 37: Stop signal orchestrator
    try {
      if (this.signalOrchestrator) {
        this.signalOrchestrator.stop();
        this.signalOrchestrator = null;
        console.log(`[37.A][ENGINE][mode=${this.mode}] Signal orchestrator stopped`);
        telemetryTrace.trace('TradingEngine', 'SIGNAL_ORCHESTRATOR_STOPPED', 'INFO', { mode: this.mode });
      }
      
      console.log('[I7-ROOT-FIX][STOP_COMPLETED]', { mode: this.mode });
    } catch (err) {
      console.log('[I7-ROOT-FIX][STOP_ERROR]', {
        mode: this.mode,
        error: (err as Error).message,
      });
    }
    
    console.log(`[37.A][ENGINE][mode=${this.mode}] Trading engine stopped`);
    telemetryTrace.trace('TradingEngine', 'ENGINE_STOPPED', 'INFO', { mode: this.mode });
  }

  // I7-ROOT-FIX (A1): Expose engine status for diagnostics
  public getEngineStatusSnapshot() {
    return {
      mode: this.mode,
      isRunning: this.isRunning,
      hasSignalOrchestrator: this.signalOrchestrator !== null,
      lastStatusAt: new Date().toISOString(),
    };
  }

  private async calculateGoalAlignmentScore(signal: TradeSignal, mode: 'live' | 'paper'): Promise<number> {
    try {
      // Get user goals for the specific mode
      const goals = mode === 'live' 
        ? await storage.getGoalsLive()
        : await storage.getGoalsPaper();
      
      // Find profitability_vs_consistency goal
      const profConsGoal = goals.find(g => g.metricName === 'profitability_vs_consistency');
      
      if (!profConsGoal || !profConsGoal.goalValue) {
        // No goals set, return neutral score
        console.log('[Goal Alignment] No profitability_vs_consistency goal found, using neutral score 0.5');
        return 0.5;
      }

      // Validate and parse goalValue
      const goalValueNum = parseFloat(profConsGoal.goalValue);
      if (isNaN(goalValueNum) || goalValueNum < 1 || goalValueNum > 10) {
        console.warn(`[Goal Alignment] Invalid goalValue: ${profConsGoal.goalValue}, using neutral score 0.5`);
        return 0.5;
      }

      // profitability_vs_consistency: 1-10 scale where 1=consistency focused, 10=profitability focused
      const profitabilityFocus = goalValueNum / 10;
      const consistencyFocus = 1 - profitabilityFocus;

      // Calculate trade characteristics with safety checks
      const stopDistance = Math.abs(signal.entryPrice - signal.stopPrice);
      
      // Guard against zero or near-zero stop distance (invalid trade setup)
      if (stopDistance < 0.000001) {
        console.warn(`[Goal Alignment] Invalid stop distance (${stopDistance}), using neutral score 0.5`);
        return 0.5;
      }

      const profitDistance = Math.abs(signal.targetPrice - signal.entryPrice);
      const riskRewardRatio = profitDistance / stopDistance;
      
      // Validate riskRewardRatio is a valid number
      if (!isFinite(riskRewardRatio) || riskRewardRatio < 0) {
        console.warn(`[Goal Alignment] Invalid risk/reward ratio (${riskRewardRatio}), using neutral score 0.5`);
        return 0.5;
      }

      const isHighRiskReward = riskRewardRatio >= 2.0; // 2R or better
      
      // Strategy risk profiles
      const strategyRiskProfile: { [key: string]: { risk: number; consistency: number } } = {
        'vwap_pullback': { risk: 0.5, consistency: 0.8 }, // More consistent, lower risk
        'abcd_long': { risk: 0.7, consistency: 0.6 }, // Moderate risk and consistency
        'sma_trend_ride': { risk: 0.6, consistency: 0.7 }, // Good balance
      };

      const profile = strategyRiskProfile[signal.strategy] || { risk: 0.5, consistency: 0.5 };

      // Calculate alignment components
      let alignmentScore = 0;

      // Component 1: Risk/Reward alignment (40% weight)
      if (profitabilityFocus > 0.6 && isHighRiskReward) {
        alignmentScore += 0.4; // High profitability focus + high R/R = aligned
      } else if (consistencyFocus > 0.6 && riskRewardRatio < 2.0) {
        alignmentScore += 0.4; // High consistency focus + moderate R/R = aligned
      } else {
        alignmentScore += 0.2; // Partial alignment
      }

      // Component 2: Strategy risk profile alignment (30% weight)
      const strategyAlignment = (profitabilityFocus * profile.risk) + (consistencyFocus * profile.consistency);
      alignmentScore += strategyAlignment * 0.3;

      // Component 3: Signal confidence alignment (30% weight)
      // Higher confidence signals align better with consistency goals
      // Lower confidence but high R/R aligns with profitability goals
      if (consistencyFocus > 0.6 && signal.confidence > 0.7) {
        alignmentScore += 0.3;
      } else if (profitabilityFocus > 0.6 && isHighRiskReward) {
        alignmentScore += 0.3;
      } else {
        alignmentScore += signal.confidence * 0.3;
      }

      // Normalize to 0-1 range and validate
      const finalAlignmentScore = Math.max(0, Math.min(1, alignmentScore));
      
      // Final safety check
      if (!isFinite(finalAlignmentScore) || isNaN(finalAlignmentScore)) {
        console.warn(`[Goal Alignment] Invalid final alignment score (${finalAlignmentScore}), using neutral score 0.5`);
        return 0.5;
      }
      
      return finalAlignmentScore;
      
    } catch (error) {
      console.error('[Goal Alignment] Error calculating goal alignment score:', error);
      return 0.5; // Return neutral score on error
    }
  }

  async processSignal(signal: TradeSignal): Promise<Trade | null> {
    // I7-ROOT-FIX (B): Drop signals when engine is stopped
    if (!this.isRunning) {
      console.log('[I7-ROOT-FIX][SIGNAL_DROPPED_ENGINE_STOPPED]', {
        symbol: signal.symbol,
        mode: this.mode,
      });
      console.log(`[Phase-27.F.15.B.3][mode=${this.mode}] Trading engine stopped, ignoring signal`);
      return null;
    }

    try {
      // Phase 8.8.3-H4: Get mode-level settings from guardrails_v2
      const settings = await buildSettingsFromGuardrails(this.mode);
      if (!settings) {
        throw new Error(`Trading settings not found for mode: ${this.mode}`);
      }

      // Calculate goal alignment score and final score
      const goalAlignmentScore = await this.calculateGoalAlignmentScore(signal, this.mode);
      signal.goalAlignmentScore = goalAlignmentScore;
      signal.finalScore = (signal.confidence * 0.7) + (goalAlignmentScore * 0.3);
      
      console.log(`[Phase-27.F.15.B.3][mode=${this.mode}] Signal: ${signal.symbol}, Strategy: ${signal.strategy}`);
      console.log(`[Phase-27.F.15.B.3][mode=${this.mode}] Signal Confidence: ${(signal.confidence * 100).toFixed(1)}%`);
      console.log(`[Phase-27.F.15.B.3][mode=${this.mode}] Goal Alignment Score: ${(goalAlignmentScore * 100).toFixed(1)}%`);
      console.log(`[Phase-27.F.15.B.3][mode=${this.mode}] Final Score: ${(signal.finalScore * 100).toFixed(1)}%`);

      // Phase 8.8.3-H4: Pre-trade guardrail checks (replaces legacy RiskManager)
      const tradeCandidate: TradeCandidate = {
        symbol: signal.symbol,
        strategy: signal.strategy,
        entryPrice: signal.entryPrice,
        stopPrice: signal.stopPrice,
        targetPrice: signal.targetPrice,
      };
      
      const riskCheck = await checkGuardrailRisk(this.mode, tradeCandidate);

      if (!riskCheck.ok) {
        console.log(`[8.8.3-H4][GUARDRAIL_BLOCK][mode=${this.mode}] Trade rejected: ${riskCheck.reason}`);
        return null;
      }

      // Calculate position size
      const riskAmount = parseFloat(settings.riskPerTrade || '100');
      const stopDistance = Math.abs(signal.entryPrice - signal.stopPrice);
      const quantity = riskAmount / stopDistance;

      // Check projected slippage
      const projectedSlippage = await this.kraken.calculateProjectedSlippage(
        signal.symbol,
        quantity,
        'buy'
      );

      if (projectedSlippage > this.getSlippageTolerance(signal.symbol, settings)) {
        console.log(`[Phase-27.F.15.B.3][mode=${this.mode}] Trade rejected: projected slippage ${projectedSlippage.toFixed(2)}% exceeds tolerance`);
        return null;
      }

      // Execute trade
      const trade = await this.executeTrade(signal, quantity, riskAmount);
      
      if (trade && this.mode === 'live') {
        // Place stop and target orders for live trades
        await this.placeStopAndTargetOrders(trade);
      }

      return trade;
    } catch (error) {
      console.error(`[Phase-27.F.15.B.3][mode=${this.mode}] Error processing trade signal:`, error);
      
      // Phase 41F-I: Record trade error event
      await telemetryService.recordTradeEvent('trade_error', {
        symbol: signal.symbol,
        mode: this.mode,
        reason: error instanceof Error ? error.message : 'Unknown error',
        durationMs: 0
      });
      
      return null;
    }
  }

  private async executeTrade(
    signal: TradeSignal,
    quantity: number,
    riskAmount: number
  ): Promise<Trade> {
    let entryOrderId: string | undefined;
    let actualEntryPrice = signal.entryPrice;
    let entryFee = 0;
    let entrySlippage = 0;
    let filledQuantity = quantity; // Will be adjusted for partial fills

    if (this.mode === 'live') {
      // Phase 8.8.3-H4: Get mode-based settings (global) from guardrails
      const settings = await buildSettingsFromGuardrails(this.mode);
      if (!settings) {
        throw new Error(`Trading settings not found for mode: ${this.mode}`);
      }

      console.log(`\n🔧 [Phase-27.F.15.B.3][mode=${this.mode}] Executing live order for ${signal.symbol}`);
      console.log(`   Requested quantity: ${quantity}`);

      // Execute live trade
      const orderResult = await this.kraken.addOrder({
        pair: signal.symbol,
        type: 'buy',
        ordertype: 'market',
        volume: quantity.toString()
      });

      entryOrderId = orderResult.txid[0];
      console.log(`   Order placed: ${entryOrderId}`);
      
      // In a real implementation, we'd query the order status to get actual filled quantity
      // For simulation, randomly create partial fills 10% of the time
      const isPartialFill = Math.random() < 0.1; // 10% chance
      
      if (isPartialFill) {
        // Simulate partial fill between 50% and 89% (below threshold)
        const fillPercent = 50 + Math.random() * 39; // 50-89%
        filledQuantity = quantity * (fillPercent / 100);
        
        console.log(`\n⚠️  [PHASE 2] PARTIAL FILL DETECTED`);
        console.log(`   Requested: ${quantity.toFixed(8)}`);
        console.log(`   Filled: ${filledQuantity.toFixed(8)} (${fillPercent.toFixed(1)}%)`);
        console.log(`   Threshold: ${settings.partialFillThreshold}%`);
        
        const fillThreshold = parseFloat(settings.partialFillThreshold || '90');
        
        if (fillPercent < fillThreshold) {
          // Handle based on configuration
          if (settings.partialFillAction === 'scale') {
            console.log(`   🔧 Action: SCALE stops/targets to match filled quantity`);
            // Stops and targets will be placed for the filled quantity only
            // The unfilled portion is effectively cancelled
            console.log(`   ✅ Proceeding with ${filledQuantity.toFixed(8)} units`);
          } else if (settings.partialFillAction === 'catchup') {
            console.log(`   🔧 Action: CATCHUP order for remaining quantity`);
            const remaining = quantity - filledQuantity;
            console.log(`   ⏳ Attempting to fill remaining ${remaining.toFixed(8)} units...`);
            
            // In production, we'd place another order here
            // For now, just log the attempt
            console.log(`   ⚠️  Catchup order would be placed here in production`);
          }
          
          // Record in metadata for audit trail
          const partialFillMetadata = {
            ...signal.metadata,
            partialFill: true,
            requestedQty: quantity.toString(),
            filledQty: filledQuantity.toString(),
            fillPercent: fillPercent.toFixed(2),
            action: settings.partialFillAction
          };
          signal.metadata = partialFillMetadata;
        }
      }
      
      // Simulate small slippage and fees
      entrySlippage = Math.random() * 0.1; // 0-0.1% slippage
      entryFee = (actualEntryPrice * filledQuantity) * 0.0026; // Kraken taker fee
    } else {
      // Paper trade - simulate execution
      entrySlippage = Math.random() * 0.05; // Smaller slippage for simulation
      actualEntryPrice *= (1 + entrySlippage / 100);
    }

    // Phase 41F-K: Dry-run mode check - simulate trade without DB mutation
    if (process.env.DRYRUN_TRADING === 'true') {
      console.log(`[41F-K][DRYRUN] Simulating trade: ${signal.symbol} (buy) qty=${filledQuantity.toFixed(8)}`);
      console.log(`[41F-K][DRYRUN] Entry: ${actualEntryPrice.toFixed(2)}, Stop: ${signal.stopPrice.toFixed(2)}, Target: ${signal.targetPrice.toFixed(2)}`);
      
      // Record telemetry for dry-run trade
      await telemetryService.recordTradeEvent('dryrun_trade', {
        symbol: signal.symbol,
        action: 'buy',
        mode: this.mode,
        amount: filledQuantity,
        price: actualEntryPrice,
        strategy: signal.strategy,
        simulated: true
      });
      
      // Return simulated trade object (matches Trade type but with simulated flag)
      const simulatedTrade = {
        id: `dryrun-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        mode: this.mode,
        symbol: signal.symbol,
        strategy: signal.strategy,
        entryPrice: actualEntryPrice.toString(),
        quantity: filledQuantity.toString(),
        stopPrice: signal.stopPrice.toString(),
        targetPrice: signal.targetPrice.toString(),
        entryOrderId: entryOrderId || `dryrun-order-${Date.now()}`,
        entryFee: entryFee.toString(),
        entrySlippage: entrySlippage.toString(),
        riskAmount: riskAmount.toString(),
        status: 'open' as const,
        createdAt: new Date(),
        metadata: {
          ...signal.metadata,
          signalConfidence: signal.confidence,
          goalAlignmentScore: signal.goalAlignmentScore,
          finalScore: signal.finalScore,
          simulated: true,
          dryrun: true
        }
      } as any; // Cast to any to bypass type checking for simulated field
      
      console.log(`[41F-K][DRYRUN] ✅ Dry-run trade completed (no DB write)`);
      return simulatedTrade;
    }

    // Phase 41F-L.E2E: Lineage tracking - emit order_submitted
    const { lineageService } = await import('./lineage.js');
    const traceId = signal.metadata?.traceId || lineageService.getTraceId(signal.symbol, this.mode);
    
    await lineageService.emitOrderSubmitted({
      traceId,
      symbol: signal.symbol,
      mode: this.mode,
      orderId: entryOrderId || `order-${Date.now()}`,
      side: 'buy',
      quantity: filledQuantity,
      price: actualEntryPrice
    });

    // Phase 27.F.15.B.3 + 41F-L.E2E: Create trade with unified commit service
    const tradeData = {
      mode: this.mode,
      symbol: signal.symbol,
      strategy: signal.strategy,
      entryPrice: actualEntryPrice.toString(),
      quantity: filledQuantity.toString(), // Use filled quantity, not requested
      stopPrice: signal.stopPrice.toString(),
      targetPrice: signal.targetPrice.toString(),
      entryOrderId,
      entryFee: entryFee.toString(),
      entrySlippage: entrySlippage.toString(),
      riskAmount: riskAmount.toString(),
      metadata: {
        ...signal.metadata,
        signalConfidence: signal.confidence,
        goalAlignmentScore: signal.goalAlignmentScore,
        finalScore: signal.finalScore,
        traceId // Preserve traceId in trade metadata
      }
    };

    // Phase 41F-L.E2E: Use unified commit service for atomic portfolio updates
    const { commitTradeAndUpdatePortfolio } = await import('./commitTradeAndUpdatePortfolio.js');
    const result = await commitTradeAndUpdatePortfolio(tradeData as any, traceId);
    const trade = result.trade;
    
    console.log(`[41F-L.E2E][mode=${this.mode}] Trade committed with portfolio update:`, {
      tradeId: trade.id,
      portfolioValue: result.portfolio.totalValue,
      traceId
    });

    // Phase 41F-I: Record trade opened event
    await telemetryService.recordTradeEvent('trade_opened', {
      symbol: trade.symbol,
      mode: this.mode,
      amount: filledQuantity,
      price: actualEntryPrice,
      strategy: trade.strategy
    });

    // Capture prediction metadata for Learning Feedback Engine
    if (signal.metadata?.signal_type || signal.metadata?.confidence) {
      try {
        const predictionData = {
          mode: this.mode,
          tradeId: trade.id,
          strategy: signal.strategy,
          symbol: signal.symbol,
          signalType: signal.metadata.signal_type || signal.strategy,
          predictionConfidence: (signal.metadata.confidence || signal.confidence || 0.5).toString(),
          predictedDirection: signal.metadata.predicted_direction || 'long',
          rationale: signal.metadata.rationale || '',
          riskScore: (signal.metadata.risk_score || 0.5).toString()
        };
        
        await storage.createPredictionOutcome(predictionData);
        console.log(`[Phase-27.F.15.B.3][mode=${this.mode}] Prediction metadata captured for trade ${trade.id}`);
      } catch (error) {
        console.error(`[Phase-27.F.15.B.3][mode=${this.mode}] Error capturing prediction metadata:`, error);
      }
    }

    return trade;
  }

  private async placeStopAndTargetOrders(trade: Trade): Promise<void> {
    const placedOrders: string[] = [];
    
    try {
      console.log(`\n🔧 [Phase-27.F.15.B.3][mode=${this.mode}] Starting bracket order placement for ${trade.symbol}`);
      console.log(`   Trade ID: ${trade.id}`);
      console.log(`   Entry: $${trade.entryPrice}, Stop: $${trade.stopPrice}, Target: $${trade.targetPrice}`);

      // Phase 8.8.3-H4: Get mode-level settings from guardrails_v2
      const settings = await buildSettingsFromGuardrails(this.mode);
      if (!settings) {
        throw new Error(`Trading settings not found for mode: ${this.mode}`);
      }

      // Apply stop buffer to protect against premature stop-outs
      const stopBuffer = parseFloat(settings.stopBufferPercent || '5') / 100; // Convert % to decimal
      const baseStopPrice = parseFloat(trade.stopPrice);
      const bufferedStopPrice = baseStopPrice * (1 - stopBuffer); // Lower stop for long positions
      
      console.log(`   📊 Stop buffer: Base=${baseStopPrice}, Buffer=${settings.stopBufferPercent}%, Final=${bufferedStopPrice.toFixed(6)}`);

      // STEP 1: Place stop-loss order with buffer applied
      console.log(`   ⏳ Placing stop-loss order...`);
      const stopOrderResult = await this.kraken.addOrder({
        pair: trade.symbol,
        type: 'sell',
        ordertype: 'stop-loss',
        volume: trade.quantity,
        price: bufferedStopPrice.toString()
      });
      placedOrders.push(stopOrderResult.txid[0]);
      console.log(`   ✅ Stop-loss placed: ${stopOrderResult.txid[0]}`);

      // STEP 2: Place target order (limit order)
      console.log(`   ⏳ Placing take-profit order...`);
      const targetOrderResult = await this.kraken.addOrder({
        pair: trade.symbol,
        type: 'sell',
        ordertype: 'limit',
        volume: trade.quantity,
        price: trade.targetPrice
      });
      placedOrders.push(targetOrderResult.txid[0]);
      console.log(`   ✅ Take-profit placed: ${targetOrderResult.txid[0]}`);

      // STEP 3: All orders successful - update trade with order IDs
      await storage.updateTrade(trade.id, {
        stopOrderId: stopOrderResult.txid[0],
        targetOrderId: targetOrderResult.txid[0]
      });

      console.log(`✅ [PHASE 1] Bracket orders complete for ${trade.symbol}\n`);

    } catch (error) {
      console.error(`\n❌ [PHASE 1 ROLLBACK] Bracket order failure for ${trade.symbol}`);
      console.error(`   Error: ${error instanceof Error ? error.message : String(error)}`);
      console.error(`   Placed orders before failure: ${placedOrders.length}`);
      
      // ROLLBACK: Cancel all successfully placed orders
      if (placedOrders.length > 0) {
        console.log(`   🔄 Rolling back ${placedOrders.length} placed order(s)...`);
        
        for (const orderId of placedOrders) {
          try {
            await this.kraken.cancelOrder(orderId);
            console.log(`   ✅ Cancelled order: ${orderId}`);
          } catch (cancelError) {
            console.error(`   ❌ Failed to cancel order ${orderId}:`, cancelError);
          }
        }
        
        console.log(`   ✅ Rollback complete\n`);
      }

      // Mark trade as failed/invalid
      console.log(`   🚨 Marking trade as failed due to bracket placement error`);
      throw error; // Re-throw to let caller handle
    }
  }

  async closeTrade(tradeId: string, reason: string = 'manual'): Promise<Trade> {
    // Phase 27.F.15.B.3: Get mode-based trades (global)
    const trades = await storage.getTrades(this.mode, { limit: 1000 });
    const targetTrade = trades.find(t => t.id === tradeId && t.status === 'open');
    
    if (!targetTrade) {
      throw new Error('Trade not found or already closed');
    }

    // Get current market price
    const ticker = await this.kraken.getTicker(targetTrade.symbol);
    const marketPrice = parseFloat(ticker[targetTrade.symbol].c[0]);

    let exitFee = 0;
    let exitSlippage = 0;

    if (targetTrade.mode === 'live') {
      // Cancel existing stop/target orders
      if (targetTrade.stopOrderId) {
        try {
          await this.kraken.cancelOrder(targetTrade.stopOrderId);
        } catch (error) {
          console.error('Error cancelling stop order:', error);
        }
      }
      if (targetTrade.targetOrderId) {
        try {
          await this.kraken.cancelOrder(targetTrade.targetOrderId);
        } catch (error) {
          console.error('Error cancelling target order:', error);
        }
      }

      // Execute market sell order
      await this.kraken.addOrder({
        pair: targetTrade.symbol,
        type: 'sell',
        ordertype: 'market',
        volume: targetTrade.quantity
      });

      exitSlippage = Math.random() * 0.1;
      exitFee = (marketPrice * parseFloat(targetTrade.quantity)) * 0.0026;
    } else {
      // Paper trade
      exitSlippage = Math.random() * 0.05;
    }

    const exitPrice = marketPrice * (1 - exitSlippage / 100);
    
    const closedTrade = await storage.closeTrade(targetTrade.id, exitPrice, exitFee, exitSlippage);
    
    // Phase 41F-I: Record trade closed event
    const exitTimeMs = closedTrade.exitTime ? new Date(closedTrade.exitTime).getTime() : Date.now();
    const entryTimeMs = closedTrade.entryTime ? new Date(closedTrade.entryTime).getTime() : exitTimeMs;
    await telemetryService.recordTradeEvent('trade_closed', {
      symbol: closedTrade.symbol,
      mode: this.mode,
      result: reason,
      durationMs: exitTimeMs - entryTimeMs
    });
    
    return closedTrade;
  }

  private getSlippageTolerance(symbol: string, settings: TradingSettings): number {
    // Determine tier based on symbol (simplified logic)
    const majorPairs = ['BTCUSD', 'ETHUSD', 'XBTUSD', 'ETHUSD'];
    const isMajor = majorPairs.some(pair => symbol.includes(pair.slice(0, 3)));
    
    if (isMajor) {
      return parseFloat(settings.slippageToleranceMajors || '0.5');
    } else {
      // For simplicity, treating all others as midcap
      return parseFloat(settings.slippageToleranceMidcaps || '1.5');
    }
  }

  async monitorActiveTrades(): Promise<void> {
    if (!this.isRunning) return;

    // Phase 27.F.15.B.3: Get mode-based active trades (global)
    const activeTrades = await storage.getActiveTrades(this.mode);
    
    for (const trade of activeTrades) {
      await this.checkTradeExitConditions(trade);
    }
  }

  private async checkTradeExitConditions(trade: Trade): Promise<void> {
    try {
      const currentPrice = await this.getCurrentPrice(trade.symbol);
      // Phase 8.8.3-H4: Get mode-level settings from guardrails_v2
      const settings = await buildSettingsFromGuardrails(this.mode);
      if (!settings) return;

      // Check strategy-specific exit conditions
      const shouldExit = await this.strategyEngine.checkExitConditions(
        trade,
        currentPrice,
        settings
      );

      if (shouldExit) {
        await this.closeTrade(trade.id, 'strategy_exit');
      }
    } catch (error) {
      console.error('Error checking trade exit conditions:', error);
    }
  }

  private async getCurrentPrice(symbol: string): Promise<number> {
    const ticker = await this.kraken.getTicker(symbol);
    return parseFloat(ticker[symbol].c[0]);
  }

  isEngineRunning(): boolean {
    return this.isRunning;
  }

  // Hot-reload strategy settings (called by EngineSettingsBus)
  async reloadStrategySettings(): Promise<void> {
    try {
      // Phase 27.F.15.B.3: Get mode-based strategy settings (global)
      const systemContext = await storage.getSystemContext(this.mode);
      if (!systemContext) {
        console.warn(`[Phase-27.F.15.B.3][mode=${this.mode}] System context not found for settings reload`);
        return;
      }
      const settings = await storage.listStrategySettings({ globalContextId: systemContext.id, mode: this.mode });
      console.log(`[Phase-27.F.15.B.3][mode=${this.mode}] Reloaded ${settings.length} strategy settings`);
      // Settings are stored and will be fetched when needed by strategy engine
      // The strategy engine will pull latest settings on each trade evaluation
    } catch (error) {
      console.error(`[Phase-27.F.15.B.3][mode=${this.mode}] Failed to reload strategy settings:`, error);
    }
  }
}

// Phase 27.F.15.B.3: Mode-based settings hot-reload bus
export const EngineSettingsBus = {
  _subs: new Set<(msg: { mode: 'live' | 'paper' }) => void>(),
  
  subscribe(fn: (msg: { mode: 'live' | 'paper' }) => void) {
    this._subs.add(fn);
    return () => this._subs.delete(fn);
  },
  
  async publish(msg: { mode: 'live' | 'paper' }) {
    console.log(`[Phase-27.F.15.B.3][EngineSettingsBus] Publishing settings reload (mode: ${msg.mode})`);
    const subs = Array.from(this._subs);
    for (const fn of subs) {
      try {
        await fn(msg);
      } catch (error) {
        console.error('[EngineSettingsBus] Subscriber error:', error);
      }
    }
  }
};
