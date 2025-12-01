import { storage } from '../storage';
import { PaperSimTrade, PaperSimOpenPosition, TradingSettings, InsertPaperSimTrade, InsertPaperSimOpenPosition, InsertPaperSimTradeLog } from '@shared/schema';
import { nanoid } from 'nanoid';
import { buildSettingsFromGuardrails, checkGuardrailRisk, calculateRiskAmount, type TradeCandidate } from './trade-safety';

export interface TradeSignal {
  symbol: string;
  strategy: 'vwap_pullback' | 'abcd_long' | 'sma_trend_ride' | 'breakout' | 'mean_reversion' | 'range_trading' | 'vwap_bounce' | 'liquidity_trap';
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  confidence: number;
  metadata: any;
}

export interface PaperConfig {
  slippageBps?: number; // Slippage in basis points (default: 10 = 0.10%)
  latencyMs?: number; // Simulated latency in milliseconds (default: 250ms)
  feeRate?: number; // Trading fee rate as a percentage (default: 0.16%)
}

/**
 * Paper Execution Service
 * Phase 8.8.3-H4: Uses guardrail-driven checks instead of RiskManager
 */
export class PaperExecutionService {
  private userId: string;
  private config: Required<PaperConfig>;
  private isRunning = false;

  constructor(userId: string, config?: PaperConfig) {
    this.userId = userId;
    this.config = {
      slippageBps: config?.slippageBps ?? parseInt(process.env.PAPER_DEFAULT_SLIPPAGE_BPS || '10'),
      latencyMs: config?.latencyMs ?? parseInt(process.env.PAPER_DEFAULT_LATENCY_MS || '250'),
      feeRate: config?.feeRate ?? 0.16,
    };
  }

  start(): void {
    this.isRunning = true;
    console.log(`[PaperExecution:${this.userId}] Service started with config:`, this.config);
  }

  stop(): void {
    this.isRunning = false;
    console.log(`[PaperExecution:${this.userId}] Service stopped`);
  }

  async processSignal(signal: TradeSignal): Promise<PaperSimTrade | null> {
    if (!this.isRunning) {
      console.log('[PaperExecution] Service is stopped, ignoring signal');
      return null;
    }

    console.log(`[PaperExecution:${this.userId}] Processing signal for ${signal.symbol} - ${signal.strategy}`);

    try {
      // Phase 8.8.3-H4: PaperExecutionService is always paper mode
      const mode = 'paper';
      
      // Phase 8.8.3-H4: Build complete settings from guardrails
      const settings = await buildSettingsFromGuardrails(mode);
      
      const portfolioValue = parseFloat(settings.portfolioValue);
      const riskPct = parseFloat(settings.riskPerTradePct);
      const riskAmount = calculateRiskAmount(portfolioValue, riskPct);
      
      if (riskAmount <= 0) {
        console.error(`[PaperExecution] Invalid risk amount (${riskAmount}) for mode=${mode}`);
        return null;
      }
      
      // Phase 8.8.3-H4: Pre-trade guardrail checks
      const tradeCandidate: TradeCandidate = {
        symbol: signal.symbol,
        strategy: signal.strategy,
        entryPrice: signal.entryPrice,
        stopPrice: signal.stopPrice,
        targetPrice: signal.targetPrice,
      };
      
      const riskCheck = await checkGuardrailRisk(mode, tradeCandidate);

      if (!riskCheck.ok) {
        const reason = riskCheck.reason;
        console.log(`[PaperExecution] Trade rejected: ${reason}`);
        
        // Log rejection to paper_sim_trade_logs
        await storage.createPaperSimTradeLog({
          userId: this.userId,
          tradeId: null,
          positionId: null,
          eventType: 'risk_rejected',
          message: `Signal rejected: ${reason}`,
          metadata: {
            symbol: signal.symbol,
            strategy: signal.strategy,
            entryPrice: signal.entryPrice,
            stopPrice: signal.stopPrice,
            confidence: signal.confidence,
          }
        });
        
        return null;
      }
      
      const stopDistance = Math.abs(signal.entryPrice - signal.stopPrice);
      const quantity = riskAmount / stopDistance;

      // Simulate trade execution
      const trade = await this.simulateExecution(signal, quantity, riskAmount, settings);
      
      console.log(`[PaperExecution] Simulated trade created: ${trade.id} for ${signal.symbol}`);
      return trade;
    } catch (error) {
      console.error('[PaperExecution] Error processing trade signal:', error);
      
      // Log error
      await storage.createPaperSimTradeLog({
        userId: this.userId,
        tradeId: null,
        positionId: null,
        eventType: 'error',
        message: `Error processing signal: ${error instanceof Error ? error.message : 'Unknown error'}`,
        metadata: {
          symbol: signal.symbol,
          strategy: signal.strategy,
          error: error instanceof Error ? error.stack : String(error),
        }
      });
      
      return null;
    }
  }

  private async simulateExecution(
    signal: TradeSignal,
    quantity: number,
    riskAmount: number,
    settings: TradingSettings
  ): Promise<PaperSimTrade> {
    // Simulate latency
    if (this.config.latencyMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.config.latencyMs));
    }

    // Calculate simulated slippage (random within configured range)
    const slippagePercent = (Math.random() * this.config.slippageBps) / 100;
    const slippageMultiplier = 1 + (slippagePercent / 100);
    const actualEntryPrice = signal.entryPrice * slippageMultiplier;

    // Calculate entry fee
    const entryNotional = actualEntryPrice * quantity;
    const entryFee = (entryNotional * this.config.feeRate) / 100;
    const slippageAmount = (actualEntryPrice - signal.entryPrice) * quantity;

    // Adjust stop and target prices for slippage
    const adjustedStopPrice = signal.stopPrice * slippageMultiplier;
    const adjustedTargetPrice = signal.targetPrice * slippageMultiplier;

    // Phase 27.F.13.A: Migrate to Milestone 18 paper_sim_trades table
    // Create paper_sim_trades record (historical ledger - will be closed later)
    const paperSimTradeData: InsertPaperSimTrade = {
      userId: this.userId,
      symbol: signal.symbol,
      strategyName: signal.strategy,
      side: 'buy', // Long-only trading
      quantity: quantity.toString(),
      entryPrice: actualEntryPrice.toString(),
      exitPrice: null, // Will be set when position closes
      stopLoss: adjustedStopPrice.toString(),
      takeProfit: adjustedTargetPrice.toString(),
      pnl: null, // Will be calculated on close
      pnlPercent: null,
      fees: entryFee.toString(),
      slippage: slippageAmount.toString(),
      openedAt: new Date(),
      closedAt: null, // Open position
      closeReason: null,
      confidence: signal.confidence ? signal.confidence.toString() : null,
      metadata: {
        ...(signal.metadata || {}),
        simulation: {
          originalEntryPrice: signal.entryPrice,
          originalStopPrice: signal.stopPrice,
          originalTargetPrice: signal.targetPrice,
          appliedSlippageBps: this.config.slippageBps,
          appliedLatencyMs: this.config.latencyMs,
          simulationTimestamp: new Date().toISOString(),
          riskAmount,
        }
      }
    };

    // Store in paper_sim_trades table
    const trade = await storage.createPaperSimTrade(paperSimTradeData);
    
    // Also create entry in paper_sim_open_positions for active tracking
    const openPositionData: InsertPaperSimOpenPosition = {
      userId: this.userId,
      symbol: signal.symbol,
      strategyName: signal.strategy,
      side: 'buy',
      quantity: quantity.toString(),
      avgPrice: actualEntryPrice.toString(),
      currentPrice: actualEntryPrice.toString(),
      stopLoss: adjustedStopPrice.toString(),
      takeProfit: adjustedTargetPrice.toString(),
      unrealizedPnl: (-entryFee).toString(), // Start with negative due to entry fees
      unrealizedPnlPercent: ((-entryFee / entryNotional) * 100).toString(),
      confidence: signal.confidence ? signal.confidence.toString() : null,
      metadata: {
        tradeId: trade.id, // Link to paper_sim_trades record
        entryFee,
        slippageAmount,
        riskAmount,
      }
    };

    const position = await storage.createPaperSimOpenPosition(openPositionData);

    // Log the position opening
    await storage.createPaperSimTradeLog({
      userId: this.userId,
      tradeId: trade.id,
      positionId: position.id,
      eventType: 'position_opened',
      message: `Opened ${signal.strategy} position: ${quantity.toFixed(4)} ${signal.symbol} @ $${actualEntryPrice.toFixed(2)}`,
      metadata: {
        symbol: signal.symbol,
        strategy: signal.strategy,
        quantity,
        entryPrice: actualEntryPrice,
        stopLoss: adjustedStopPrice,
        takeProfit: adjustedTargetPrice,
        confidence: signal.confidence,
        entryFee,
        slippagePercent,
        slippageAmount,
      }
    });
    
    console.log(`[PaperExecution] Simulated fill: ${quantity.toFixed(4)} ${signal.symbol} @ ${actualEntryPrice.toFixed(2)} (slippage: ${slippagePercent.toFixed(4)}%, fee: $${entryFee.toFixed(2)})`);

    return trade;
  }

  async closePaperTrade(
    tradeId: string, 
    exitPrice: number, 
    reason: 'stop' | 'target' | 'manual'
  ): Promise<PaperSimTrade | null> {
    try {
      const trade = await storage.getPaperSimTrade(tradeId);
      if (!trade) {
        console.error(`[PaperExecution] Trade ${tradeId} not found`);
        return null;
      }

      if (trade.closedAt) {
        console.error(`[PaperExecution] Trade ${tradeId} is already closed`);
        return null;
      }

      // Simulate latency
      if (this.config.latencyMs > 0) {
        await new Promise(resolve => setTimeout(resolve, this.config.latencyMs));
      }

      // Calculate simulated exit slippage
      const exitSlippagePercent = (Math.random() * this.config.slippageBps) / 100;
      const exitSlippageMultiplier = reason === 'stop' 
        ? 1 - (exitSlippagePercent / 100) // Worse price on stop
        : 1 + (exitSlippagePercent / 100); // Better price on target
      
      const actualExitPrice = exitPrice * exitSlippageMultiplier;

      // Calculate exit fee
      const exitNotional = actualExitPrice * parseFloat(trade.quantity);
      const exitFee = (exitNotional * this.config.feeRate) / 100;
      const exitSlippageAmount = (actualExitPrice - exitPrice) * parseFloat(trade.quantity);

      // Calculate P&L
      const entryNotional = parseFloat(trade.entryPrice) * parseFloat(trade.quantity);
      const grossPL = exitNotional - entryNotional;
      const entryFees = parseFloat(trade.fees || '0');
      const totalFees = entryFees + exitFee;
      const realizedPL = grossPL - totalFees;
      const realizedPLPercent = (realizedPL / entryNotional) * 100;

      // Map reason to closeReason
      const closeReasonMap = {
        'stop': 'stop_hit',
        'target': 'target_hit',
        'manual': 'manual'
      };

      // Update trade in paper_sim_trades
      const updatedTrade = await storage.updatePaperSimTrade(tradeId, {
        exitPrice: actualExitPrice.toString(),
        closedAt: new Date(),
        closeReason: closeReasonMap[reason],
        pnl: realizedPL.toString(),
        pnlPercent: realizedPLPercent.toString(),
        fees: totalFees.toString(),
        slippage: (parseFloat(trade.slippage || '0') + exitSlippageAmount).toString(),
        metadata: {
          ...(trade.metadata as Record<string, any> || {}),
          exit: {
            exitFee,
            exitSlippagePercent,
            exitSlippageAmount,
            actualExitPrice,
            closedTimestamp: new Date().toISOString(),
          }
        }
      });

      // Find and delete the corresponding open position
      const openPositions = await storage.getPaperSimOpenPositions(this.userId);
      const matchingPosition = openPositions.find(p => 
        (p.metadata as any)?.tradeId === tradeId
      );

      if (matchingPosition) {
        await storage.deletePaperSimOpenPosition(matchingPosition.id);
      }

      // Log the position closing
      await storage.createPaperSimTradeLog({
        userId: this.userId,
        tradeId,
        positionId: matchingPosition?.id || null,
        eventType: 'position_closed',
        message: `Closed ${trade.strategyName} position: ${trade.symbol} @ $${actualExitPrice.toFixed(2)} (${reason}) - P&L: $${realizedPL.toFixed(2)} (${realizedPLPercent > 0 ? '+' : ''}${realizedPLPercent.toFixed(2)}%)`,
        metadata: {
          symbol: trade.symbol,
          strategy: trade.strategyName,
          quantity: parseFloat(trade.quantity),
          entryPrice: parseFloat(trade.entryPrice),
          exitPrice: actualExitPrice,
          pnl: realizedPL,
          pnlPercent: realizedPLPercent,
          reason,
          exitFee,
          exitSlippagePercent,
          totalFees,
        }
      });

      console.log(`[PaperExecution] Closed trade ${tradeId}: ${trade.symbol} @ ${actualExitPrice.toFixed(2)} (P&L: $${realizedPL.toFixed(2)}, ${realizedPLPercent > 0 ? '+' : ''}${realizedPLPercent.toFixed(2)}%)`);

      return updatedTrade;
    } catch (error) {
      console.error(`[PaperExecution] Error closing trade ${tradeId}:`, error);
      
      // Log error
      await storage.createPaperSimTradeLog({
        userId: this.userId,
        tradeId,
        positionId: null,
        eventType: 'error',
        message: `Error closing trade: ${error instanceof Error ? error.message : 'Unknown error'}`,
        metadata: {
          error: error instanceof Error ? error.stack : String(error),
        }
      });
      
      return null;
    }
  }

  async getAllOpenTrades(): Promise<PaperSimOpenPosition[]> {
    return storage.getPaperSimOpenPositions(this.userId);
  }

  async getAllTrades(): Promise<PaperSimTrade[]> {
    return storage.getPaperSimTrades(this.userId);
  }

  updateConfig(config: Partial<PaperConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
    console.log(`[PaperExecution:${this.userId}] Config updated:`, this.config);
  }

  getConfig(): Required<PaperConfig> {
    return { ...this.config };
  }

  // Reset all paper trades for this user (for testing/fresh start)
  async resetAllTrades(): Promise<void> {
    console.log(`[PaperExecution:${this.userId}] Resetting all paper trades`);
    await storage.deleteAllPaperTrades();
    console.log(`[PaperExecution:${this.userId}] All paper trades deleted`);
  }
}
