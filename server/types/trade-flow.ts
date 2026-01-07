/**
 * Directive 11.0B — Trade Flow Type Definitions
 * 
 * Defines the type contracts for trade lifecycle components.
 * 
 * Trade Lifecycle Flow:
 * [Signal Orchestrator] (exposure, correlation, cooldown)
 *      ↓
 * [SQE] (FinalScore + RegimeWeight)
 *      ↓
 * [Ready-to-Buy Queue]
 *      ↓ (2-min or 15-signal trigger)
 * [TCL] (FinalScore ranking)
 *      ↓
 * [TEC] (adaptive sizing + trailing exits)
 *      ↓
 * [Order Management]
 */

export type TradeMode = 'paper' | 'live';

export type StrategyType = 
  | 'vwap_pullback' 
  | 'abcd_long' 
  | 'sma_trend_ride' 
  | 'breakout' 
  | 'mean_reversion' 
  | 'range_trading' 
  | 'vwap_bounce' 
  | 'liquidity_trap' 
  | 'dhma';

export interface TradeSignal {
  signalId: string;
  symbol: string;
  strategy: StrategyType;
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  confidence: number;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface ExecutionIntent {
  signalId: string;
  instrument: string;
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  strategy: StrategyType;
  confidence: number;
  timestamp: string;
  mode: TradeMode;
}

export type ExitReason =
  | 'stop_loss_hit'
  | 'take_profit_hit'
  | 'trailing_stop_hit'
  | 'max_holding_period'
  | 'manual_close'
  | 'guardrail_triggered';

export interface ExitDecision {
  shouldExit: boolean;
  exitReason?: ExitReason;
  exitPrice?: number;
  pnl?: number;
  holdingDurationMs?: number;
}

/**
 * Directive 11.0B: Trendline feedback for adaptive sizing
 */
export interface Trendline {
  reinforced: boolean;
  weakened: boolean;
  strength?: number;
  lastUpdated?: string;
}

export interface ActiveTrade {
  tradeId: string;
  signalId: string;
  symbol: string;
  strategy: StrategyType;
  mode: TradeMode;
  entryPrice: number;
  quantity: number;
  stopPrice: number;
  targetPrice: number;
  currentPrice?: number;
  trailingStop?: number;
  openedAt: string;
  lastCheckedAt?: string;
  trendline?: Trendline;
}

export interface TradeOrder {
  orderId: string;
  intent: ExecutionIntent;
  status: 'pending' | 'submitted' | 'filled' | 'rejected' | 'cancelled';
  createdAt: string;
  filledAt?: string;
  fillPrice?: number;
  fillQuantity?: number;
  fees?: number;
}

/**
 * Directive 11.0B: Adaptive size adjustment result
 */
export interface AdaptiveSizeResult {
  newQuantity: number;
  adjusted: boolean;
  adjustment: 'expand' | 'contract' | 'none';
  reason?: string;
}

export interface TradeExecutionController {
  monitor(trade: ActiveTrade): ExitDecision;
  updateTrailingStop(trade: ActiveTrade): number | null;
  updateAdaptiveSize(trade: ActiveTrade): AdaptiveSizeResult;
  closeTrade(trade: ActiveTrade, reason: ExitReason, exitPrice: number): Promise<void>;
}
