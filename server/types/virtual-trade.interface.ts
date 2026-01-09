/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.0E.1 — Virtual Trade Interface (Phase 10 Canonical)
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Purpose: Defines the canonical VirtualTrade interface for the modernized VTS.
 * Replaces all legacy CWQI/NGC/DI/GSI fields with Phase-10 metrics.
 * 
 * Schema: v1.6.6
 * Governance: M45 (All VirtualTrades include regime, signalType, strategy)
 *             M47 (CWQI/NGC/DI/GSI permanently removed)
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

export type MarketRegimeType = 
  | 'BULL_STABLE'
  | 'BEAR_VOLATILE'
  | 'LOW_VOL_CHOP'
  | 'HIGH_VOL_IMPULSE'
  | 'TRANSITION';

export interface VirtualTradePhase10 {
  id: string;
  symbol: string;
  regime: MarketRegimeType;
  signalType: 'Hybrid' | 'Pattern' | 'Quantitative';
  strategy: string;
  finalScore: number;
  hybridScore: number;
  predictiveConfidence: number;
  regimeWeight: number;
  decayPenalty: number;
  frictionCost: number;
  entryPrice: number;
  exitPrice?: number;
  netProfit?: number;
  grossProfit?: number;
  status: 'open' | 'closed';
  resultType?: 'take_profit' | 'stop_loss' | 'timeout';
  timestamp: number;
  entryTime: number;
  exitTime?: number;
  pool?: 'ideal' | 'rotational';
}

export interface VirtualSignalPhase10 {
  id: string;
  symbol: string;
  regime: MarketRegimeType;
  signalType: 'Hybrid' | 'Pattern' | 'Quantitative';
  strategy: string;
  entryPrice: number;
  takeProfit: number;
  stopLoss: number;
  spread: number;
  finalScore: number;
  hybridScore: number;
  predictiveConfidence: number;
  regimeWeight: number;
  decayPenalty: number;
  patternType?: string;
  patternStrength?: number;
  effectivePatternStrength?: number;
  decayAge?: number;
  timestamp: number;
  pool?: 'ideal' | 'rotational';
}

export interface VTSCycleMetrics {
  cycleId: number;
  pairsEvaluated: number;
  tradesSimulated: number;
  avgFinalScore: number;
  regimeDistribution: Record<MarketRegimeType, number>;
  signalTypeDistribution: Record<string, number>;
  strategiesExecuted: string[];
  cycleDurationMs: number;
  timestamp: number;
}

export type SignalType = 'Hybrid' | 'Pattern' | 'Quantitative';
