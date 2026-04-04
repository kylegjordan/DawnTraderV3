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
  signalsGenerated: number;  // Batch 21: renamed from tradesSimulated for clarity
  avgFinalScore: number;
  regimeDistribution: Record<MarketRegimeType, number>;
  signalTypeDistribution: Record<string, number>;
  strategiesExecuted: string[];
  cycleDurationMs: number;
  timestamp: number;
}

// Batch 21: VTS evaluation diagnostics — exported for API routes and UI
export interface NullReasonBreakdown {
  conditionsNotMet: number;    // Strategy detect() returned null (no specific reason)
  adxGuard: number;           // ADX < 25 guard (sma_trend_ride)
  duplicatePosition: number;  // Already have pair+strategy combo open (event count)
  uniqueDuplicateCombos: number; // Batch 22 HF3: Distinct pair+strategy combos blocked
  maxOpenTrades: number;      // Portfolio full
  regimeNoStrategies: number; // No strategies enabled for this regime
  familyFilterMismatch: number; // Batch 26: Strategy blocked because pair didn't survive this family's filter path (pre-detect eligibility skip, not a strategy null)
}

// Batch 26: Rejected reasons — signals created by detect() but failed post-generation guards
// These are NOT nulls (strategy fired successfully) and NOT generated (signal didn't become a trade)
export interface RejectedReasonBreakdown {
  netEvBelowFloor: number;    // Net EV < VTS floor — signal existed but EV too low
}

export interface VTSEvalSnapshot {
  timestamp: number;
  quantPairsEvaluated: number;
  patternPairsEvaluated: number;
  // Batch 51: Pair-pool evaluations — counts pair+family combinations, not unique pairs
  // If BTC qualifies for trend + breakout families, that's 2 pair-pool evaluations
  quantPairPoolEvaluations?: number;
  patternPairPoolEvaluations?: number;
  quantStrategyNulls: number;
  patternStrategyNulls?: number;  // Batch 25: Pattern pool null counter (was lumped into quantStrategyNulls)
  patternNoDetection: number;
  patternDetected: number;
  signalsGenerated: number;
  // Batch 24: Pool-level counter split
  quantStrategyEvaluations?: number;
  patternStrategyEvaluations?: number;
  quantSignalsGenerated?: number;
  patternSignalsGenerated?: number;
  // Batch 26: New counters
  signalsRejected?: number;          // Signals created by detect() but rejected by post-generation guard (Net EV floor)
  quantSignalsRejected?: number;
  patternSignalsRejected?: number;
  pairsSkippedNoPrice?: number;      // Pairs skipped because no price data available
  pairsSkippedInsufficientOHLC?: number;  // Pairs skipped because OHLC < 10 candles
  totalStrategyEvaluations: number;  // Batch 21: total detect() calls across all pairs
  nullReasons: NullReasonBreakdown;  // Batch 21: granular null reason tracking
  rejectedReasons?: RejectedReasonBreakdown;  // Batch 26: post-generation guard rejections (NOT nulls)
  byStrategy: Record<string, { evaluated: number; nulls: number; signals: number }>;
  nullReasonDetail?: Record<string, number>;  // Batch 31: granular strategy null reason counts
}
