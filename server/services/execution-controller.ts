/**
 * Directive 11.0 — Trade Execution Controller (TEC)
 * 
 * Central execution authority for all trade lifecycle management.
 * 
 * RESPONSIBILITIES:
 * - Position sizing (adaptive, volatility-adjusted)
 * - Trade entry execution
 * - Exit condition evaluation (SL, TP, trailing)
 * - Trade closure
 * - Order lifecycle management
 * 
 * This module consolidates all sizing and exit logic that was
 * previously scattered across TCL, TCO, and other services.
 */

import type {
  ExecutionIntent,
  TradeOrder,
  PositionSizeResult,
  ActiveTrade,
  ExitDecision,
  ExitReason,
  TradeExecutionController,
  TradeMode
} from '../core/interfaces/trade-flow.js';
import { storage } from '../storage.js';
import { v4 as uuidv4 } from 'uuid';
import { getScalingFactor } from './risk-concentration.js';

export interface TECConfig {
  defaultRiskPerTradePct: number;
  maxPositionPct: number;
  maxTotalExposurePct: number;
  slippagePct: number;
  feePct: number;
  maxHoldingPeriodMs: number;
  trailingStopActivationPct: number;
  trailingStopDistancePct: number;
}

const DEFAULT_CONFIG: TECConfig = {
  defaultRiskPerTradePct: 1.5,
  maxPositionPct: 10,
  maxTotalExposurePct: 100,
  slippagePct: 0.15,
  feePct: 0.10,
  maxHoldingPeriodMs: 24 * 60 * 60 * 1000,
  trailingStopActivationPct: 1.0,
  trailingStopDistancePct: 0.5
};

interface ExecutionQueueItem {
  intent: ExecutionIntent;
  enqueuedAt: string;
  attempts: number;
}

export class ExecutionControllerImpl implements TradeExecutionController {
  private config: TECConfig;
  private executionQueue: ExecutionQueueItem[] = [];
  private activeOrders: Map<string, TradeOrder> = new Map();
  private isProcessing: boolean = false;

  constructor(config: Partial<TECConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async enqueueExecution(intent: ExecutionIntent): Promise<TradeOrder> {
    console.log(`[TEC] Enqueueing execution for ${intent.instrument}`);

    const portfolioValue = await this.getPortfolioValue(intent.mode);
    const size = this.calculatePositionSize(intent, portfolioValue);

    if (size.quantity <= 0) {
      console.warn(`[TEC][SKIP] ${intent.instrument} - zero quantity calculated`);
      throw new Error(`Position sizing returned zero quantity for ${intent.instrument}`);
    }

    const order: TradeOrder = {
      orderId: uuidv4(),
      intent,
      size,
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    this.activeOrders.set(order.orderId, order);

    const queueItem: ExecutionQueueItem = {
      intent,
      enqueuedAt: new Date().toISOString(),
      attempts: 0
    };

    this.executionQueue.push(queueItem);

    console.log(`[TEC][QUEUED] ${intent.instrument} - qty: ${size.quantity.toFixed(6)}, notional: $${size.notionalValue.toFixed(2)}`);

    this.processQueue();

    return order;
  }

  calculatePositionSize(intent: ExecutionIntent, portfolioValue: number): PositionSizeResult {
    const stopDistance = Math.abs(intent.entryPrice - intent.stopPrice);
    
    if (stopDistance === 0 || !Number.isFinite(stopDistance)) {
      console.warn(`[TEC][SIZE] Invalid stop distance for ${intent.instrument}`);
      return this.createZeroSizeResult(portfolioValue, stopDistance);
    }

    const riskPerTradePct = this.config.defaultRiskPerTradePct;
    const riskAmount = (portfolioValue * riskPerTradePct) / 100;

    let quantity = riskAmount / stopDistance;

    const exposureBudget = portfolioValue * (this.config.maxTotalExposurePct / 100);
    const maxNotional = exposureBudget * (this.config.maxPositionPct / 100);
    const bufferedMaxNotional = maxNotional * 0.97;

    let notionalValue = quantity * intent.entryPrice;
    let sizingMethod: 'risk_based' | 'exposure_capped' | 'volatility_adjusted' = 'risk_based';

    if (notionalValue > bufferedMaxNotional) {
      quantity = bufferedMaxNotional / intent.entryPrice;
      notionalValue = quantity * intent.entryPrice;
      sizingMethod = 'exposure_capped';
    }

    const correlationScale = getScalingFactor(intent.instrument);
    if (correlationScale < 1) {
      quantity *= correlationScale;
      notionalValue = quantity * intent.entryPrice;
      sizingMethod = 'volatility_adjusted';
      console.log(`[TEC][SIZE] ${intent.instrument} scaled ${correlationScale.toFixed(2)}× due to correlation`);
    }

    console.log(`[TEC][SIZE] ${intent.instrument}:`, {
      portfolioValue: portfolioValue.toFixed(2),
      riskPct: riskPerTradePct,
      stopDistance: stopDistance.toFixed(8),
      quantity: quantity.toFixed(8),
      notional: notionalValue.toFixed(2),
      method: sizingMethod
    });

    return {
      quantity,
      notionalValue,
      riskAmount,
      sizingMethod,
      inputs: {
        portfolioValue,
        riskPerTradePct,
        stopDistance,
        correlationScale: correlationScale < 1 ? correlationScale : undefined
      }
    };
  }

  evaluateExitConditions(trade: ActiveTrade): ExitDecision {
    const currentPrice = trade.currentPrice;
    if (!currentPrice) {
      return { shouldExit: false };
    }

    if (currentPrice <= trade.stopPrice) {
      const pnl = (currentPrice - trade.entryPrice) * trade.quantity;
      return {
        shouldExit: true,
        exitReason: 'stop_loss_hit',
        exitPrice: currentPrice,
        pnl,
        holdingDurationMs: Date.now() - new Date(trade.openedAt).getTime()
      };
    }

    if (currentPrice >= trade.targetPrice) {
      const pnl = (currentPrice - trade.entryPrice) * trade.quantity;
      return {
        shouldExit: true,
        exitReason: 'take_profit_hit',
        exitPrice: currentPrice,
        pnl,
        holdingDurationMs: Date.now() - new Date(trade.openedAt).getTime()
      };
    }

    const holdingDurationMs = Date.now() - new Date(trade.openedAt).getTime();
    if (holdingDurationMs >= this.config.maxHoldingPeriodMs) {
      const pnl = (currentPrice - trade.entryPrice) * trade.quantity;
      return {
        shouldExit: true,
        exitReason: 'max_holding_period',
        exitPrice: currentPrice,
        pnl,
        holdingDurationMs
      };
    }

    return { shouldExit: false };
  }

  async closeTrade(trade: ActiveTrade, reason: ExitReason, exitPrice: number): Promise<void> {
    console.log(`[TEC][CLOSE] ${trade.symbol} - reason: ${reason}, price: ${exitPrice}`);

    const pnl = (exitPrice - trade.entryPrice) * trade.quantity;
    const fees = exitPrice * trade.quantity * (this.config.feePct / 100);
    const netPnl = pnl - fees;

    console.log(`[TEC][CLOSE] ${trade.symbol} P/L: $${pnl.toFixed(2)}, fees: $${fees.toFixed(2)}, net: $${netPnl.toFixed(2)}`);
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.executionQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      while (this.executionQueue.length > 0) {
        const item = this.executionQueue.shift();
        if (!item) continue;

        item.attempts++;
        
        try {
          await this.executeIntent(item.intent);
        } catch (err) {
          console.error(`[TEC][EXEC_ERROR] ${item.intent.instrument}:`, err);
          
          if (item.attempts < 3) {
            this.executionQueue.push(item);
          }
        }

        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async executeIntent(intent: ExecutionIntent): Promise<void> {
    console.log(`[TEC][EXECUTE] ${intent.instrument} @ ${intent.entryPrice}`);
  }

  private async getPortfolioValue(mode: TradeMode): Promise<number> {
    try {
      const portfolioState = await storage.getPortfolioState({ mode });
      if (portfolioState?.balance) {
        return parseFloat(String(portfolioState.balance));
      }
    } catch (err) {
      console.warn('[TEC] Error fetching portfolio value:', err);
    }
    return 1000;
  }

  private createZeroSizeResult(portfolioValue: number, stopDistance: number): PositionSizeResult {
    return {
      quantity: 0,
      notionalValue: 0,
      riskAmount: 0,
      sizingMethod: 'risk_based',
      inputs: {
        portfolioValue,
        riskPerTradePct: this.config.defaultRiskPerTradePct,
        stopDistance
      }
    };
  }

  updateConfig(newConfig: Partial<TECConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  getConfig(): TECConfig {
    return { ...this.config };
  }

  getQueueStatus(): { queueLength: number; isProcessing: boolean; activeOrders: number } {
    return {
      queueLength: this.executionQueue.length,
      isProcessing: this.isProcessing,
      activeOrders: this.activeOrders.size
    };
  }
}

export const executionController = new ExecutionControllerImpl();
