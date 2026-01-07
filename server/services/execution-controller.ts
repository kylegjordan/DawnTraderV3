/**
 * Directive 11.0A — Trade Execution Controller (TEC)
 * 
 * Manages active trades with trendline-based adaptive trailing exits.
 * 
 * RESPONSIBILITIES:
 * - Trade entry execution
 * - Active trade monitoring
 * - Adaptive trailing stop updates
 * - Stop-loss and take-profit closures
 * 
 * NOT ALLOWED (per Directive 11.0A):
 * - Initial position sizing (Phase 11.3 will implement predictive sizing)
 * - Queue-based trade scheduling (no FIFO logic)
 * - Re-evaluation or re-ranking of signals
 */

import type {
  ActiveTrade,
  ExitDecision,
  ExitReason,
  TradeExecutionController
} from '../types/trade-flow.js';

export interface TECConfig {
  trailingStopActivationPct: number;
  trailingStopDistancePct: number;
  maxHoldingPeriodMs: number;
}

const DEFAULT_CONFIG: TECConfig = {
  trailingStopActivationPct: 1.0,
  trailingStopDistancePct: 0.5,
  maxHoldingPeriodMs: 24 * 60 * 60 * 1000
};

export class ExecutionControllerImpl implements TradeExecutionController {
  private config: TECConfig;

  constructor(config: Partial<TECConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  monitor(trade: ActiveTrade): ExitDecision {
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

    if (trade.trailingStop && currentPrice <= trade.trailingStop) {
      const pnl = (currentPrice - trade.entryPrice) * trade.quantity;
      return {
        shouldExit: true,
        exitReason: 'trailing_stop_hit',
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

  updateTrailingStop(trade: ActiveTrade): number | null {
    const currentPrice = trade.currentPrice;
    if (!currentPrice) {
      return null;
    }

    const profitPct = ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100;

    if (profitPct < this.config.trailingStopActivationPct) {
      return null;
    }

    const trailingStopDistance = currentPrice * (this.config.trailingStopDistancePct / 100);
    const newTrailingStop = currentPrice - trailingStopDistance;

    if (!trade.trailingStop || newTrailingStop > trade.trailingStop) {
      console.log(`[TEC][TRAILING] ${trade.symbol} updated trailing stop: $${newTrailingStop.toFixed(2)} (profit: ${profitPct.toFixed(1)}%)`);
      return newTrailingStop;
    }

    return trade.trailingStop;
  }

  async closeTrade(trade: ActiveTrade, reason: ExitReason, exitPrice: number): Promise<void> {
    const pnl = (exitPrice - trade.entryPrice) * trade.quantity;
    console.log(`[TEC][CLOSE] ${trade.symbol} - reason: ${reason}, price: $${exitPrice.toFixed(2)}, P/L: $${pnl.toFixed(2)}`);
  }

  updateConfig(newConfig: Partial<TECConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  getConfig(): TECConfig {
    return { ...this.config };
  }
}

export const executionController = new ExecutionControllerImpl();
