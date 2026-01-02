/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔒 LOCKED MODULE — Directive 10.1
 * ══════════════════════════════════════════════════════════════════════════════
 * Dynamic Strategy Selector (DSS) - Adaptive Strategy Orchestration
 * 
 * Purpose: Determines which strategy (if any) to deploy based on market regime
 * (trend × volatility) and mathematical expectancy (Net EV).
 * 
 * Core Design Principles:
 * - Physics First: No trade executes unless NetEV > 0
 * - Extreme Noise Stop: Market chaos threshold at volNoise > 0.6
 * - Flat Market Awareness: Avoids trading during choppy, sideways regimes
 * - Strategy Mapping: Aligns strategy families to regimes
 * 
 * Regimes:
 * - EXTREME_NOISE: volNoise > 0.6 → Auto-veto
 * - BULL_STABLE: trend > +0.05, vol < 0.3
 * - BULL_VOLATILE: trend > +0.05, vol >= 0.3
 * - BEAR_STABLE: trend < -0.05, vol < 0.3
 * - BEAR_VOLATILE: trend < -0.05, vol >= 0.3
 * - LOW_VOL_CHOP: -0.05 <= trend <= +0.05 (sideways)
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { SYSTEM_GUARDS } from '../config/system-guards.js';

export type MarketRegime = 
  | 'EXTREME_NOISE'
  | 'BULL_STABLE'
  | 'BULL_VOLATILE'
  | 'BEAR_STABLE'
  | 'BEAR_VOLATILE'
  | 'LOW_VOL_CHOP';

export interface DSSMetrics {
  volNoise: number;
  trendSlope: number;
}

export interface StrategyMetrics {
  netEV: number;
  confidence: number;
}

export interface DSSResult {
  veto: boolean;
  reason?: string;
  regime: MarketRegime;
  strategy?: string;
  confidence?: number;
}

export class DynamicStrategySelector {
  /**
   * Determines the current market regime based on volatility and trend
   */
  determineRegime(metrics: DSSMetrics): MarketRegime {
    const vol = metrics.volNoise;
    const trend = metrics.trendSlope;

    // 1️⃣ Extreme Noise: Auto-Veto
    if (vol > SYSTEM_GUARDS.MAX_VOL_NOISE) {
      return 'EXTREME_NOISE';
    }

    // 2️⃣ Bull Regimes
    if (trend > SYSTEM_GUARDS.REGIME_THRESHOLDS.TREND_POSITIVE) {
      return vol < SYSTEM_GUARDS.REGIME_THRESHOLDS.VOL_LOW
        ? 'BULL_STABLE'
        : 'BULL_VOLATILE';
    }

    // 3️⃣ Bear Regimes
    if (trend < -SYSTEM_GUARDS.REGIME_THRESHOLDS.TREND_POSITIVE) {
      return vol < SYSTEM_GUARDS.REGIME_THRESHOLDS.VOL_LOW
        ? 'BEAR_STABLE'
        : 'BEAR_VOLATILE';
    }

    // 4️⃣ Flat / Sideways Regime
    return 'LOW_VOL_CHOP';
  }

  /**
   * Evaluates strategies and selects the best one for current market conditions
   * Returns veto if no viable strategy exists
   */
  evaluate(
    snapshot: DSSMetrics,
    strategyMetrics: Record<string, StrategyMetrics>
  ): DSSResult {
    const regime = this.determineRegime(snapshot);

    // Veto on Extreme Noise
    if (regime === 'EXTREME_NOISE') {
      console.log(`[10.1][DSS] VETO: Extreme Volatility (volNoise=${snapshot.volNoise.toFixed(3)} > 0.6)`);
      return { 
        veto: true, 
        reason: `Extreme Volatility (volNoise=${snapshot.volNoise.toFixed(3)} > 0.6)`, 
        regime 
      };
    }

    // Get candidate strategies for this regime
    const candidates = this.getCandidatesForRegime(regime);
    
    if (candidates.length === 0) {
      console.log(`[10.1][DSS] VETO: No strategies mapped for regime ${regime}`);
      return { 
        veto: true, 
        reason: `No strategies mapped for regime ${regime}`, 
        regime 
      };
    }

    // Filter for positive NetEV only (Physics First)
    const viable = candidates.filter(s => {
      const metrics = strategyMetrics[s];
      return metrics && metrics.netEV > 0;
    });

    if (viable.length === 0) {
      console.log(`[10.1][DSS] VETO: No positive NetEV strategy for regime ${regime}`);
      return { 
        veto: true, 
        reason: 'No positive NetEV strategy', 
        regime 
      };
    }

    // Sort by confidence and select the best
    const sorted = viable.sort((a, b) => {
      const confA = strategyMetrics[a]?.confidence || 0;
      const confB = strategyMetrics[b]?.confidence || 0;
      return confB - confA;
    });

    const best = sorted[0];
    const confidence = strategyMetrics[best]?.confidence || 0;

    console.log(`[10.1][DSS] Selected: ${best} (regime=${regime}, confidence=${confidence.toFixed(3)}, netEV=${strategyMetrics[best]?.netEV.toFixed(4)})`);

    return {
      veto: false,
      regime,
      strategy: best,
      confidence,
    };
  }

  /**
   * Gets candidate strategies for a given regime from SYSTEM_GUARDS
   */
  private getCandidatesForRegime(regime: MarketRegime): string[] {
    if (regime === 'EXTREME_NOISE') return [];
    
    const map = SYSTEM_GUARDS.STRATEGY_MAP as Record<string, readonly string[]>;
    return [...(map[regime] || [])];
  }

  /**
   * Diagnostic: Returns current regime info for logging/monitoring
   */
  getRegimeInfo(metrics: DSSMetrics): {
    regime: MarketRegime;
    volNoise: number;
    trendSlope: number;
    isVeto: boolean;
  } {
    const regime = this.determineRegime(metrics);
    return {
      regime,
      volNoise: metrics.volNoise,
      trendSlope: metrics.trendSlope,
      isVeto: regime === 'EXTREME_NOISE',
    };
  }
}

let dssInstance: DynamicStrategySelector | null = null;

export function getDynamicStrategySelector(): DynamicStrategySelector {
  if (!dssInstance) {
    dssInstance = new DynamicStrategySelector();
    console.log('[10.1][DSS] Dynamic Strategy Selector initialized');
  }
  return dssInstance;
}

export { DynamicStrategySelector as DSS };
