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

import { HYBRID_PARAMS } from '../config/system-guards.js';
import type { 
  PatternSignal, 
  PatternType,
  SignalType,
  HybridStrategyType,
  ComponentScores 
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
   * Directive 10.5: Apply exponential time decay to pattern strength.
   * Pattern signals lose influence as they age, normalized per candle interval.
   * 
   * Formula: effectiveStrength = originalStrength * e^(-λ * Δt)
   * Subject to floor constraint: min(decayed, original * FLOOR)
   */
  applyPatternDecay(originalStrength: number, deltaCandles: number): number {
    const { ENABLED, LAMBDA, FLOOR } = HYBRID_PARAMS.DECAY;
    if (!ENABLED) return originalStrength;
    
    const decayed = originalStrength * Math.exp(-LAMBDA * deltaCandles);
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

      // Directive 10.5: Normalize time delta from ms → candle units
      const deltaCandles = Math.abs(q.timestamp - match.timestamp) / candleIntervalMs;
      const effectiveStrength = this.applyPatternDecay(match.strength, deltaCandles);

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

  private selectHybridStrategy(quant: QuantSignal, pattern: PatternSignal): HybridStrategyType {
    const trendStrategies = ['sma_trend_ride', 'vwap_pullback', 'vwap_bounce'];
    const momentumStrategies = ['breakout', 'dhma'];
    const reversionStrategies = ['mean_reversion', 'range_trading'];
    
    if (trendStrategies.includes(quant.strategy)) {
      return 'H1_TREND_SNIPER';
    }
    if (momentumStrategies.includes(quant.strategy)) {
      return 'H2_SLINGSHOT';
    }
    if (reversionStrategies.includes(quant.strategy)) {
      return 'H3_GATECRASHER';
    }
    return 'H4_MOMENTUM_LINK';
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
