/**
 * Directive 11.0 — Trade Flow Interfaces
 * 
 * Defines the contracts between TCL, TCO, and TEC components.
 * 
 * Trade Lifecycle Flow:
 * [Signal Generator] → [TCL] → [TCO] → [TEC] → [Order Management]
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

export type EligibilityRejectionCode =
  | 'KILL_SWITCH'
  | 'MAX_OPEN_POSITIONS'
  | 'MAX_TOTAL_EXPOSURE'
  | 'CORRELATION_EXPOSURE'
  | 'MARKET_REGIME_VETO'
  | 'COOLDOWN_ACTIVE'
  | 'INSUFFICIENT_CONFIDENCE'
  | 'INSTRUMENT_BLOCKED';

export interface EligibilityResult {
  passed: boolean;
  rejectionCode?: EligibilityRejectionCode;
  reason?: string;
  checksPerformed: string[];
  timestamp: string;
}

export interface PositionSizeResult {
  quantity: number;
  notionalValue: number;
  riskAmount: number;
  sizingMethod: 'risk_based' | 'exposure_capped' | 'volatility_adjusted';
  inputs: {
    portfolioValue: number;
    riskPerTradePct: number;
    stopDistance: number;
    volatilityFactor?: number;
    correlationScale?: number;
  };
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
  openedAt: string;
  lastCheckedAt?: string;
}

export interface TradeOrder {
  orderId: string;
  intent: ExecutionIntent;
  size: PositionSizeResult;
  status: 'pending' | 'submitted' | 'filled' | 'rejected' | 'cancelled';
  createdAt: string;
  filledAt?: string;
  fillPrice?: number;
  fillQuantity?: number;
  fees?: number;
}

export interface TradeCriteriaLimiter {
  evaluate(signal: TradeSignal, mode: TradeMode): Promise<EligibilityResult>;
}

export interface TradeControlOperator {
  promote(signal: TradeSignal, mode: TradeMode): Promise<boolean>;
}

export interface TradeExecutionController {
  enqueueExecution(intent: ExecutionIntent): Promise<TradeOrder>;
  calculatePositionSize(intent: ExecutionIntent, portfolioValue: number): PositionSizeResult;
  evaluateExitConditions(trade: ActiveTrade): ExitDecision;
  closeTrade(trade: ActiveTrade, reason: ExitReason, exitPrice: number): Promise<void>;
}
