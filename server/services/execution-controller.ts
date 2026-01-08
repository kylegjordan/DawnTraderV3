/**
 * Directive 11.0C — Trade Execution Controller (TEC)
 * 
 * Manages active trades with adaptive sizing and trailing exits.
 * Configuration is loaded from EXECUTION_CONFIG for single source of truth.
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
import { EXECUTION_CONFIG } from '../config/execution-config.js';

export interface TECConfig {
  trailingStopActivationPct: number;
  trailingStopDistancePct: number;
  maxHoldingPeriodMs: number;
  adaptiveSizeExpandPct: number;
  adaptiveSizeContractPct: number;
  trailingStopBase: number;
  trailingStopAcceleration: number;
  maxPositionRisk: number;
  version: string;
}

const DEFAULT_CONFIG: TECConfig = {
  trailingStopActivationPct: EXECUTION_CONFIG.TRAILING_STOP_ACTIVATION_PCT,
  trailingStopDistancePct: EXECUTION_CONFIG.TRAILING_STOP_DISTANCE_PCT,
  maxHoldingPeriodMs: EXECUTION_CONFIG.MAX_HOLDING_PERIOD_MS,
  adaptiveSizeExpandPct: (EXECUTION_CONFIG.ADAPTIVE_EXPAND_FACTOR - 1) * 100,
  adaptiveSizeContractPct: (1 - EXECUTION_CONFIG.ADAPTIVE_CONTRACT_FACTOR) * 100,
  trailingStopBase: EXECUTION_CONFIG.TRAILING_STOP_BASE,
  trailingStopAcceleration: EXECUTION_CONFIG.TRAILING_STOP_ACCELERATION,
  maxPositionRisk: EXECUTION_CONFIG.MAX_POSITION_RISK,
  version: EXECUTION_CONFIG.VERSION
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
   * Directive 11.0C: Adaptive sizing based on trendline feedback
   * Uses EXECUTION_CONFIG for expand/contract factors
   * 
   * If trendline is reinforced: expand position size by ADAPTIVE_EXPAND_FACTOR
   * If trendline is weakened: contract position size by ADAPTIVE_CONTRACT_FACTOR
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
      newQuantity = trade.quantity * EXECUTION_CONFIG.ADAPTIVE_EXPAND_FACTOR;
      adjustment = 'expand';
      reason = `trendline_reinforced (+${this.config.adaptiveSizeExpandPct}%)`;
      console.log(`[TEC][ADAPTIVE_SIZE] ${trade.symbol} EXPAND: ${trade.quantity.toFixed(4)} → ${newQuantity.toFixed(4)} (${reason})`);
    } else if (trendline.weakened) {
      newQuantity = trade.quantity * EXECUTION_CONFIG.ADAPTIVE_CONTRACT_FACTOR;
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

  /**
   * Directive 11.0C: Get TEC config for telemetry/diagnostics exposure
   */
  getTelemetryConfig(): {
    expandFactor: number;
    contractFactor: number;
    trailingBase: number;
    trailingAccel: number;
    maxRisk: number;
    version: string;
  } {
    return {
      expandFactor: EXECUTION_CONFIG.ADAPTIVE_EXPAND_FACTOR,
      contractFactor: EXECUTION_CONFIG.ADAPTIVE_CONTRACT_FACTOR,
      trailingBase: EXECUTION_CONFIG.TRAILING_STOP_BASE,
      trailingAccel: EXECUTION_CONFIG.TRAILING_STOP_ACCELERATION,
      maxRisk: EXECUTION_CONFIG.MAX_POSITION_RISK,
      version: EXECUTION_CONFIG.VERSION
    };
  }
}

export const executionController = new ExecutionControllerImpl();
