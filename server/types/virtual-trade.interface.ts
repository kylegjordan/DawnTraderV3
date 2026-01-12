/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.4C.3 — Virtual Trade Interface (Phase 10 Canonical)
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Purpose: Defines the canonical VirtualTrade interface for the modernized VTS.
 * Replaces all legacy CWQI/NGC/DI/GSI fields with Phase-10 metrics.
 * 
 * Schema: v1.6.7
 * Governance: M45 (All VirtualTrades include regime, signalType, strategy)
 *             M47 (CWQI/NGC/DI/GSI permanently removed)
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import type { SignalType, PatternType } from '../types';
import { CanonicalRegimeType, CanonicalSignalType } from '../config/canonical-regime-strategy-map';

export type MarketRegimeType = CanonicalRegimeType;
export type { CanonicalSignalType };
export type { SignalType, PatternType };

export interface VirtualTradePhase10 {
  id: string;
  symbol: string;
  regime: MarketRegimeType;
  signalType: CanonicalSignalType;
  strategy: string;
  patternType?: PatternType | null;
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
  signalType: CanonicalSignalType;
  strategy: string;
  patternType?: PatternType | null;
  entryPrice: number;
  takeProfit: number;
  stopLoss: number;
  spread: number;
  finalScore: number;
  hybridScore: number;
  predictiveConfidence: number;
  regimeWeight: number;
  decayPenalty: number;
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
