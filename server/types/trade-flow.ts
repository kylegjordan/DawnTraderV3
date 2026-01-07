/**
 * Directive 11.0A — Trade Flow Type Definitions
 * 
 * Defines the type contracts for trade lifecycle components.
 * 
 * Trade Lifecycle Flow:
 * [Signal Orchestrator] → [SQE] → [RTB Queue] → [TCL] → [TEC] → [Order Management]
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

export interface TradeExecutionController {
  monitor(trade: ActiveTrade): ExitDecision;
  updateTrailingStop(trade: ActiveTrade): number | null;
  closeTrade(trade: ActiveTrade, reason: ExitReason, exitPrice: number): Promise<void>;
}
