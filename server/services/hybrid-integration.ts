/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 10.4 — Hybrid Integration Service
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * The "Intelligent Referee" that merges Quantitative and Pattern signals into
 * Hybrid trades through ensemble scoring. Only issues trades when multiple
 * intelligence sources agree within time, direction, and confidence constraints.
 * 
 * Features:
 * - Ensemble scoring with configurable weights (Quant, Pattern, ML)
 * - Time-window confluence detection (configurable candle gap)
 * - Directional alignment validation
 * - Minimum score threshold enforcement
 * - Full explainability via componentScores
 * - Predictive hook ready for Phase 10.6 ML integration
 * 
 * DO NOT hardcode thresholds - import from HYBRID_PARAMS.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { HYBRID_PARAMS, CANDLE_INTERVALS_MS } from '../config/system-guards.js';
import type { 
  PatternSignal, 
  PatternType,
  SignalType,
  HybridStrategyType,
  ComponentScores,
  Timeframe
} from '../types.js';

export interface QuantSignal {
  symbol: string;
  strategy: string;
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  confidence: number;
  direction: 'BUY' | 'SELL';
  timestamp: number;
  expectancy?: number;
  metadata?: Record<string, any>;
}

export interface HybridSignal extends QuantSignal {
  signalType: 'HYBRID';
  hybridScore: number;
  hybridStrategy: HybridStrategyType;
  patternType: PatternType;
  patternStrength: number;
  effectivePatternStrength: number;  // Directive 10.5: Decayed strength
  decayAge: number;                   // Directive 10.5: Age in candle units
  predictiveConfidence?: number;
  componentScores: ComponentScores;
}

export class HybridIntegrationService {
  /**
   * Directive 10.5 + 10.7: Apply exponential time decay to pattern strength.
   * Pattern signals lose influence as they age, normalized per candle interval.
   * 
   * Formula: effectiveStrength = originalStrength * e^(-λ * Δt)
   * Subject to floor constraint: min(decayed, original * FLOOR)
   * 
   * Directive 10.7: Lambda is scaled by timeframe - lower timeframes decay faster.
   */
  applyPatternDecay(originalStrength: number, deltaCandles: number, timeframe?: Timeframe): number {
    const { ENABLED, LAMBDA, FLOOR } = HYBRID_PARAMS.DECAY;
    if (!ENABLED) return originalStrength;
    
    let adjustedLambda = LAMBDA;
    if (timeframe) {
      const baseInterval = CANDLE_INTERVALS_MS['1h'];
      const targetInterval = CANDLE_INTERVALS_MS[timeframe];
      adjustedLambda = LAMBDA * (baseInterval / targetInterval);
    }
    
    const decayed = originalStrength * Math.exp(-adjustedLambda * deltaCandles);
    return Math.max(decayed, originalStrength * FLOOR);
  }

  computeEnsembleScore(
    quantConf: number, 
    patternStrength: number, 
    mlConf?: number
  ): number {
    const w = HYBRID_PARAMS.WEIGHTS;
    return (
      quantConf * w.QUANT +
      patternStrength * w.PATTERN +
      (mlConf ?? 0.5) * w.PREDICTIVE
    );
  }

  /**
   * Directive 10.7a: Valid timeframe pairs for hybrid confluence
   * Prevents false hybrids from same-timeframe or invalid combinations
   */
  private static readonly VALID_TIMEFRAME_PAIRS: [Timeframe | undefined, Timeframe | undefined][] = [
    ['1h', '15m'],
    ['15m', '5m'],
    ['1h', '5m'],
    [undefined, undefined],  // Allow when timeframe not specified (legacy signals)
    ['1h', undefined],
    ['15m', undefined],
    ['5m', undefined],
    [undefined, '1h'],
    [undefined, '15m'],
    [undefined, '5m'],
  ];

  /**
   * Directive 10.7a: Check if timeframe pair is valid for hybrid confluence
   */
  isValidTimeframePair(quantTimeframe: Timeframe | undefined, patternTimeframe: Timeframe | undefined): boolean {
    // Allow if either is undefined (legacy signals without timeframe metadata)
    if (!quantTimeframe || !patternTimeframe) return true;
    
    // Reject same-timeframe merges
    if (quantTimeframe === patternTimeframe) return false;
    
    // Check against valid pairs
    return HybridIntegrationService.VALID_TIMEFRAME_PAIRS.some(
      ([a, b]) => (quantTimeframe === a && patternTimeframe === b) ||
                  (quantTimeframe === b && patternTimeframe === a)
    );
  }

  detectConfluence(
    quantSignals: QuantSignal[], 
    patternSignals: PatternSignal[]
  ): HybridSignal[] {
    const hybrids: HybridSignal[] = [];

    for (const q of quantSignals) {
      // Use CANDLE_INTERVAL_MS for both confluence window and decay calculation
      const candleIntervalMs = HYBRID_PARAMS.CANDLE_INTERVAL_MS;
      
      const match = patternSignals.find(
        (p) =>
          p.symbol === q.symbol &&
          p.direction === q.direction &&
          Math.abs(p.timestamp - q.timestamp) <= HYBRID_PARAMS.MAX_CONFLUENCE_WINDOW * candleIntervalMs
      );

      if (!match) continue;

      // Directive 10.7a: Hybrid Timeframe Guard - prevent invalid timeframe combinations
      const quantTimeframe = q.metadata?.timeframe as Timeframe | undefined;
      const patternTimeframe = match.metadata?.timeframe as Timeframe | undefined;
      
      if (!this.isValidTimeframePair(quantTimeframe, patternTimeframe)) {
        console.debug(
          `[HybridIntegration] Skipping invalid confluence: Quant=${quantTimeframe || 'none'}, Pattern=${patternTimeframe || 'none'}`
        );
        continue;
      }

      // Directive 10.5 + 10.7: Normalize time delta and apply timeframe-aware decay
      const deltaCandles = Math.abs(q.timestamp - match.timestamp) / candleIntervalMs;
      const effectiveStrength = this.applyPatternDecay(match.strength, deltaCandles, patternTimeframe);

      const quantConfNormalized = q.expectancy ?? (q.confidence > 1 ? q.confidence / 100 : q.confidence);
      
      // Use effectiveStrength (decayed) in ensemble computation
      const hybridScore = this.computeEnsembleScore(
        quantConfNormalized,
        effectiveStrength,
        match.predictiveConfidence
      );

      if (hybridScore < HYBRID_PARAMS.MIN_SCORE) {
        console.log(
          `[10.5] HybridIntegration: ${q.symbol} confluence found but score=${hybridScore.toFixed(3)} < MIN=${HYBRID_PARAMS.MIN_SCORE} (Raw=${match.strength.toFixed(2)}, Decayed=${effectiveStrength.toFixed(2)}, Age=${deltaCandles.toFixed(1)})`
        );
        continue;
      }

      const hybridStrategy: HybridStrategyType = this.selectHybridStrategy(q, match);

      const hybrid: HybridSignal = {
        ...q,
        signalType: 'HYBRID',
        hybridScore,
        hybridStrategy,
        patternType: match.pattern,
        patternStrength: match.strength,
        effectivePatternStrength: effectiveStrength,
        decayAge: deltaCandles,
        predictiveConfidence: match.predictiveConfidence,
        componentScores: {
          quant: quantConfNormalized,
          pattern: effectiveStrength,  // Use decayed strength in component scores
          ml: match.predictiveConfidence ?? 0.5,
        },
      };

      hybrids.push(hybrid);

      console.log(
        `[10.5] HybridIntegration: ${q.symbol} | Raw=${match.strength.toFixed(2)} | Decayed=${effectiveStrength.toFixed(2)} | Age=${deltaCandles.toFixed(1)} candles | Score=${hybridScore.toFixed(3)}`
      );
    }

    return hybrids;
  }

  /**
   * B79.0n.STRATEGY (2026-05-24): replaces legacy H1_TREND_SNIPER / H2_SLINGSHOT /
   * H3_GATECRASHER / H4_MOMENTUM_LINK taxonomy (stale since canonical map was wired
   * in Batch 13; BUG-007 closure per SYSTEM_MANUAL §1851). New mapping derives the
   * canonical hybrid strategy from the pattern dimension of the confluence
   * (per Directive 11.4H.6G PATTERN_TO_HYBRID).
   *
   * Fallback to 'quant_fallback' returns when the pattern doesn't match a canonical
   * hybrid (rare — should only happen if a non-hybrid quant signal reaches this code
   * path with a non-canonical pattern). Per Q-D Langston ACK, defensive-stronger
   * alternative (throw) deferred to a separate HybridSignal-contract investigation.
   */
  private selectHybridStrategy(_quant: QuantSignal, pattern: PatternSignal): HybridStrategyType {
    const PATTERN_TO_HYBRID: Record<string, HybridStrategyType> = {
      MORNING_STAR:   'pivot_shift',
      PINBAR:         'reverse_impulse',
      ENGULFING:      'defensive_hedge',
      TRI_STAR:       'adaptive_flow',
      ABCD:           'volatility_edge',
    };
    const candidate = PATTERN_TO_HYBRID[pattern.pattern as string];
    if (candidate) return candidate;
    // Non-hybrid quant fallback — pattern doesn't map to a canonical hybrid.
    return 'quant_fallback';
  }

  getHybridParamsInfo(): string {
    return `[10.4][CONFIG] MIN_SCORE=${HYBRID_PARAMS.MIN_SCORE}, WINDOW=${HYBRID_PARAMS.MAX_CONFLUENCE_WINDOW} candles, WEIGHTS={Q:${HYBRID_PARAMS.WEIGHTS.QUANT}, P:${HYBRID_PARAMS.WEIGHTS.PATTERN}, ML:${HYBRID_PARAMS.WEIGHTS.PREDICTIVE}}`;
  }
}

let hybridIntegrationInstance: HybridIntegrationService | null = null;

export function getHybridIntegration(): HybridIntegrationService {
  if (!hybridIntegrationInstance) {
    hybridIntegrationInstance = new HybridIntegrationService();
    console.log(hybridIntegrationInstance.getHybridParamsInfo());
  }
  return hybridIntegrationInstance;
}
