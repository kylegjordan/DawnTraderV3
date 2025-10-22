import { storage } from '../storage';
import { RiskManager } from './risk-manager';
import { PaperTrade, TradingSettings, InsertPaperTrade } from '@shared/schema';
import { nanoid } from 'nanoid';

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

export class PaperExecutionService {
  private riskManager: RiskManager;
  private userId: string;
  private config: Required<PaperConfig>;
  private isRunning = false;

  constructor(userId: string, config?: PaperConfig) {
    this.userId = userId;
    this.riskManager = new RiskManager();
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

  async processSignal(signal: TradeSignal): Promise<PaperTrade | null> {
    if (!this.isRunning) {
      console.log('[PaperExecution] Service is stopped, ignoring signal');
      return null;
    }

    console.log(`[PaperExecution:${this.userId}] Processing signal for ${signal.symbol} - ${signal.strategy}`);

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
        console.log(`[PaperExecution] Trade rejected: ${riskCheck.reason}`);
        return null;
      }

      // Calculate position size
      const riskAmount = parseFloat(settings.riskPerTrade || '150');
      const stopDistance = Math.abs(signal.entryPrice - signal.stopPrice);
      const quantity = riskAmount / stopDistance;

      // Simulate trade execution
      const trade = await this.simulateExecution(signal, quantity, riskAmount, settings);
      
      console.log(`[PaperExecution] Simulated trade created: ${trade.id} for ${signal.symbol}`);
      return trade;
    } catch (error) {
      console.error('[PaperExecution] Error processing trade signal:', error);
      return null;
    }
  }

  private async simulateExecution(
    signal: TradeSignal,
    quantity: number,
    riskAmount: number,
    settings: TradingSettings
  ): Promise<PaperTrade> {
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

    // Adjust stop and target prices for slippage
    const adjustedStopPrice = signal.stopPrice * slippageMultiplier;
    const adjustedTargetPrice = signal.targetPrice * slippageMultiplier;

    // Generate simulated order ID
    const simulatedOrderId = `SIM-${nanoid(12)}`;

    // Create paper trade record
    const paperTradeData: InsertPaperTrade = {
      userId: this.userId,
      symbol: signal.symbol,
      strategy: signal.strategy,
      status: 'open',
      entryPrice: actualEntryPrice.toString(),
      quantity: quantity.toString(),
      stopPrice: adjustedStopPrice.toString(),
      targetPrice: adjustedTargetPrice.toString(),
      simulatedOrderId,
      entryFee: entryFee.toString(),
      entrySlippage: slippagePercent.toString(),
      simulatedLatencyMs: this.config.latencyMs,
      riskAmount: riskAmount.toString(),
      metadata: {
        ...(signal.metadata || {}),
        simulation: {
          originalEntryPrice: signal.entryPrice,
          originalStopPrice: signal.stopPrice,
          originalTargetPrice: signal.targetPrice,
          appliedSlippageBps: this.config.slippageBps,
          appliedLatencyMs: this.config.latencyMs,
          simulationTimestamp: new Date().toISOString(),
        }
      }
    };

    // Store in paper_trades table
    const trade = await storage.createPaperTrade(paperTradeData);
    
    console.log(`[PaperExecution] Simulated fill: ${quantity} ${signal.symbol} @ ${actualEntryPrice} (slippage: ${slippagePercent.toFixed(4)}%)`);

    return trade;
  }

  async closePaperTrade(
    tradeId: string, 
    exitPrice: number, 
    reason: 'stop' | 'target' | 'manual'
  ): Promise<PaperTrade | null> {
    try {
      const trade = await storage.getPaperTradeById(tradeId);
      if (!trade) {
        console.error(`[PaperExecution] Trade ${tradeId} not found`);
        return null;
      }

      if (trade.status !== 'open') {
        console.error(`[PaperExecution] Trade ${tradeId} is already ${trade.status}`);
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

      // Calculate P&L
      const entryNotional = parseFloat(trade.entryPrice) * parseFloat(trade.quantity);
      const grossPL = exitNotional - entryNotional;
      const totalFees = parseFloat(trade.entryFee || '0') + exitFee;
      const realizedPL = grossPL - totalFees;
      const realizedPLPercent = (realizedPL / entryNotional) * 100;
      const realizedPLR = realizedPL / parseFloat(trade.riskAmount || '0');

      // Update trade
      const updatedTrade = await storage.updatePaperTrade(tradeId, {
        status: 'closed',
        exitPrice: actualExitPrice.toString(),
        exitFee: exitFee.toString(),
        exitSlippage: exitSlippagePercent.toString(),
        realizedPL: realizedPL.toString(),
        realizedPLPercent: realizedPLPercent.toString(),
        realizedPLR: realizedPLR.toString(),
        metadata: {
          ...(trade.metadata as Record<string, any> || {}),
          closeReason: reason,
          closedAt: new Date().toISOString(),
          actualExitPrice,
          exitSlippageApplied: exitSlippagePercent,
        }
      });

      console.log(`[PaperExecution] Closed trade ${tradeId}: ${trade.symbol} @ ${actualExitPrice} (P&L: $${realizedPL.toFixed(2)}, ${realizedPLR.toFixed(2)}R)`);

      return updatedTrade;
    } catch (error) {
      console.error(`[PaperExecution] Error closing trade ${tradeId}:`, error);
      return null;
    }
  }

  async getAllOpenTrades(): Promise<PaperTrade[]> {
    return storage.getOpenPaperTrades(this.userId);
  }

  async getAllTrades(): Promise<PaperTrade[]> {
    return storage.getAllPaperTrades(this.userId);
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
    await storage.deleteAllPaperTrades(this.userId);
    console.log(`[PaperExecution:${this.userId}] All paper trades deleted`);
  }
}
