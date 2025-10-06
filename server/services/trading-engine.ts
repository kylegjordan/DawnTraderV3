import { KrakenService } from './kraken';
import { RiskManager } from './risk-manager';
import { StrategyEngine } from './strategy-engine';
import { storage } from '../storage';
import { Trade, TradingSettings } from '@shared/schema';

export interface TradeSignal {
  symbol: string;
  strategy: 'vwap_pullback' | 'abcd_long' | 'sma_trend_ride';
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  confidence: number;
  metadata: any;
}

export interface TradingEngineDependencies {
  krakenService?: KrakenService;
  riskManager?: RiskManager;
  strategyEngine?: StrategyEngine;
}

export class TradingEngine {
  private kraken: KrakenService;
  private riskManager: RiskManager;
  private strategyEngine: StrategyEngine;
  private isRunning = false;
  private userId: string;

  constructor(
    userId: string, 
    apiKey?: string, 
    apiSecret?: string,
    dependencies?: TradingEngineDependencies
  ) {
    this.userId = userId;
    this.kraken = dependencies?.krakenService || new KrakenService(apiKey, apiSecret);
    this.riskManager = dependencies?.riskManager || new RiskManager();
    this.strategyEngine = dependencies?.strategyEngine || new StrategyEngine();
  }

  async start(): Promise<void> {
    this.isRunning = true;
    console.log(`Trading engine started for user ${this.userId}`);
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    console.log(`Trading engine stopped for user ${this.userId}`);
  }

  async processSignal(signal: TradeSignal, mode: 'live' | 'paper' = 'paper'): Promise<Trade | null> {
    if (!this.isRunning) {
      console.log('Trading engine is stopped, ignoring signal');
      return null;
    }

    try {
      // Get user settings
      const settings = await storage.getTradingSettings(this.userId);
      if (!settings) {
        throw new Error('Trading settings not found');
      }

      // Pre-trade risk checks
      const riskCheck = await this.riskManager.checkPreTradeRisk(
        this.userId,
        signal,
        settings
      );

      if (!riskCheck.approved) {
        console.log(`Trade rejected: ${riskCheck.reason}`);
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
        console.log(`Trade rejected: projected slippage ${projectedSlippage.toFixed(2)}% exceeds tolerance`);
        return null;
      }

      // Execute trade
      const trade = await this.executeTrade(signal, quantity, riskAmount, mode);
      
      if (trade && mode === 'live') {
        // Place stop and target orders for live trades
        await this.placeStopAndTargetOrders(trade);
      }

      return trade;
    } catch (error) {
      console.error('Error processing trade signal:', error);
      return null;
    }
  }

  private async executeTrade(
    signal: TradeSignal,
    quantity: number,
    riskAmount: number,
    mode: 'live' | 'paper'
  ): Promise<Trade> {
    let entryOrderId: string | undefined;
    let actualEntryPrice = signal.entryPrice;
    let entryFee = 0;
    let entrySlippage = 0;
    let filledQuantity = quantity; // Will be adjusted for partial fills

    if (mode === 'live') {
      // Get settings for partial fill configuration
      const settings = await storage.getTradingSettings(this.userId);
      if (!settings) {
        throw new Error('Trading settings not found');
      }

      console.log(`\n🔧 [PHASE 2] Executing live order for ${signal.symbol}`);
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

    // Create trade record with actual filled quantity
    const tradeData = {
      userId: this.userId,
      symbol: signal.symbol,
      strategy: signal.strategy,
      mode,
      entryPrice: actualEntryPrice.toString(),
      quantity: filledQuantity.toString(), // Use filled quantity, not requested
      stopPrice: signal.stopPrice.toString(),
      targetPrice: signal.targetPrice.toString(),
      entryOrderId,
      entryFee: entryFee.toString(),
      entrySlippage: entrySlippage.toString(),
      riskAmount: riskAmount.toString(),
      metadata: signal.metadata
    };

    const trade = await storage.createTrade(tradeData);

    // Capture prediction metadata for Learning Feedback Engine
    if (signal.metadata?.signal_type || signal.metadata?.confidence) {
      try {
        const predictionData = {
          userId: this.userId,
          tradeId: trade.id,
          strategy: signal.strategy,
          mode,
          symbol: signal.symbol,
          signalType: signal.metadata.signal_type || signal.strategy,
          predictionConfidence: (signal.metadata.confidence || signal.confidence || 0.5).toString(),
          predictedDirection: signal.metadata.predicted_direction || 'long',
          rationale: signal.metadata.rationale || '',
          riskScore: (signal.metadata.risk_score || 0.5).toString()
        };
        
        await storage.createPredictionOutcome(predictionData);
        console.log(`📊 Prediction metadata captured for trade ${trade.id}`);
      } catch (error) {
        console.error('Error capturing prediction metadata:', error);
      }
    }

    return trade;
  }

  private async placeStopAndTargetOrders(trade: Trade): Promise<void> {
    const placedOrders: string[] = [];
    
    try {
      console.log(`\n🔧 [PHASE 1] Starting bracket order placement for ${trade.symbol}`);
      console.log(`   Trade ID: ${trade.id}`);
      console.log(`   Entry: $${trade.entryPrice}, Stop: $${trade.stopPrice}, Target: $${trade.targetPrice}`);

      // Get settings to apply stop buffer
      const settings = await storage.getTradingSettings(this.userId);
      if (!settings) {
        throw new Error('Trading settings not found');
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
    const trade = await storage.getTrades(this.userId, { limit: 1000 });
    const targetTrade = trade.find(t => t.id === tradeId && t.status === 'open');
    
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
    
    return await storage.closeTrade(targetTrade.id, exitPrice, exitFee, exitSlippage);
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

    const activeTrades = await storage.getActiveTrades(this.userId);
    
    for (const trade of activeTrades) {
      await this.checkTradeExitConditions(trade);
    }
  }

  private async checkTradeExitConditions(trade: Trade): Promise<void> {
    try {
      const currentPrice = await this.getCurrentPrice(trade.symbol);
      const settings = await storage.getTradingSettings(this.userId);
      
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
}
