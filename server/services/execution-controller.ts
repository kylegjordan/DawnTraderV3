/**
 * Directive 11.0B — Trade Execution Controller (TEC)
 * 
 * Manages active trades with adaptive sizing and trailing exits.
 * 
 * RESPONSIBILITIES:
 * - Trade entry execution
 * - Active trade monitoring
 * - Adaptive trailing stop updates
 * - Adaptive sizing based on trendline feedback
 * - Stop-loss and take-profit closures
 * 
 * NOT ALLOWED:
 * - Initial position sizing (handled at entry)
 * - Queue-based trade scheduling (no FIFO logic)
 * - Re-evaluation or re-ranking of signals
 * - Exposure/correlation/cooldown checks (Signal Orchestrator owns these)
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
  adaptiveSizeExpandPct: number;
  adaptiveSizeContractPct: number;
}

const DEFAULT_CONFIG: TECConfig = {
  trailingStopActivationPct: 1.0,
  trailingStopDistancePct: 0.5,
  maxHoldingPeriodMs: 24 * 60 * 60 * 1000,
  adaptiveSizeExpandPct: 10,
  adaptiveSizeContractPct: 10
};

export interface AdaptiveSizeResult {
  newQuantity: number;
  adjusted: boolean;
  adjustment: 'expand' | 'contract' | 'none';
  reason?: string;
}

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

  /**
   * Directive 11.0B: Adaptive sizing based on trendline feedback
   * 
   * If trendline is reinforced: expand position size by 10%
   * If trendline is weakened: contract position size by 10%
   * 
   * @param trade - Active trade with optional trendline feedback
   * @returns AdaptiveSizeResult with new quantity and adjustment details
   */
  updateAdaptiveSize(trade: ActiveTrade): AdaptiveSizeResult {
    const trendline = trade.trendline;
    
    if (!trendline) {
      return {
        newQuantity: trade.quantity,
        adjusted: false,
        adjustment: 'none',
        reason: 'no_trendline_data'
      };
    }

    let newQuantity = trade.quantity;
    let adjustment: 'expand' | 'contract' | 'none' = 'none';
    let reason: string | undefined;

    if (trendline.reinforced) {
      const expandMultiplier = 1 + (this.config.adaptiveSizeExpandPct / 100);
      newQuantity = trade.quantity * expandMultiplier;
      adjustment = 'expand';
      reason = `trendline_reinforced (+${this.config.adaptiveSizeExpandPct}%)`;
      console.log(`[TEC][ADAPTIVE_SIZE] ${trade.symbol} EXPAND: ${trade.quantity.toFixed(4)} → ${newQuantity.toFixed(4)} (${reason})`);
    } else if (trendline.weakened) {
      const contractMultiplier = 1 - (this.config.adaptiveSizeContractPct / 100);
      newQuantity = trade.quantity * contractMultiplier;
      adjustment = 'contract';
      reason = `trendline_weakened (-${this.config.adaptiveSizeContractPct}%)`;
      console.log(`[TEC][ADAPTIVE_SIZE] ${trade.symbol} CONTRACT: ${trade.quantity.toFixed(4)} → ${newQuantity.toFixed(4)} (${reason})`);
    }

    return {
      newQuantity,
      adjusted: adjustment !== 'none',
      adjustment,
      reason
    };
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
