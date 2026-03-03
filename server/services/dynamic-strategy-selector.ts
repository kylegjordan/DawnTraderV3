/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Dynamic Strategy Selector (DSS) - Adaptive Strategy Orchestration
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Directive 12.3.1: Regime Authority Resolution (BUG-006, BUG-008)
 * - Rewired to use calculatePairRegime() for canonical regime classification
 * - EXTREME_NOISE veto preserved as pre-filter using volNoise > 0.6
 * - Strategy candidates now sourced from CANONICAL_REGIME_STRATEGY_MAP
 * - Old SYSTEM_GUARDS.STRATEGY_MAP dependency REMOVED
 *
 * Previous: Used internal 6-regime model (BULL_STABLE, BULL_VOLATILE, BEAR_STABLE,
 *           BEAR_VOLATILE, LOW_VOL_CHOP, EXTREME_NOISE) with SYSTEM_GUARDS thresholds.
 * Now:      Uses canonical 5-regime model from calculatePairRegime() + EXTREME_NOISE veto.
 *
 * Core Design Principles (preserved):
 * - Physics First: No trade executes unless NetEV > 0
 * - Extreme Noise Stop: Market chaos threshold at volNoise > 0.6
 * - Strategy Mapping: Canonical regime → canonical strategy list
 *
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { SYSTEM_GUARDS } from '../config/system-guards.js';
import { RollingStats } from '../utils/rolling-stats.js';
import { calculatePairRegime } from '../core/metrics/market-regime.js';
import type { OHLCData } from '../types/market-regime.types';
import {
  CANONICAL_REGIME_STRATEGY_MAP,
  type CanonicalRegimeType
} from '../config/canonical-regime-strategy-map.js';

// Directive 11.5: Rolling stats for Z-Score normalization in DSS
const dssRollingStats = {
  volNoise: new RollingStats(300),
  trendSlope: new RollingStats(300)
};

/**
 * Directive 12.3.1: DSS regime type is now canonical + EXTREME_NOISE veto
 * EXTREME_NOISE is a pre-filter, not a canonical regime.
 */
export type MarketRegime =
  | 'EXTREME_NOISE'
  | CanonicalRegimeType;

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
   * Directive 12.3.1: Canonical regime determination from OHLC data
   * Replaces internal 6-regime classification with calculatePairRegime()
   * EXTREME_NOISE check preserved as a pre-filter using volNoise threshold
   *
   * @param ohlcData - OHLC price data for regime calculation
   * @param volNoise - Volatility noise metric for EXTREME_NOISE veto
   * @returns Canonical regime type (or EXTREME_NOISE if chaos detected)
   */
  determineRegimeFromOHLC(ohlcData: OHLCData[], volNoise: number): MarketRegime {
    // Directive 11.5: Push volNoise into rolling stats for Z-Score calculation
    dssRollingStats.volNoise.push(volNoise);

    if (dssRollingStats.volNoise.isWarmedUp(30)) {
      const volZ = dssRollingStats.volNoise.zScore(volNoise);
      console.log(`[12.3.1][DSS_ZScore] volZ=${volZ.toFixed(2)} raw_vol=${volNoise.toFixed(4)}`);
    }

    // 1️⃣ Extreme Noise: Auto-Veto (preserved from original DSS)
    if (volNoise > SYSTEM_GUARDS.MAX_VOL_NOISE) {
      return 'EXTREME_NOISE';
    }

    // 2️⃣ Canonical regime from calculatePairRegime()
    const regimeResult = calculatePairRegime(ohlcData);

    console.log(`[12.3.1][DSS] Canonical regime=${regimeResult.regime}, confidence=${regimeResult.confidence.toFixed(3)}, vol=${regimeResult.volatility.toFixed(4)}, mom=${regimeResult.momentum.toFixed(4)}, adx=${regimeResult.adx.toFixed(1)}`);

    return regimeResult.regime;
  }

  /**
   * Legacy determineRegime() — preserved for backward compatibility
   * Directive 12.3.1: Maps old DSSMetrics to canonical regimes via heuristic
   *
   * NOTE: Callers should migrate to determineRegimeFromOHLC() when OHLC data is available.
   * This method uses a simplified mapping and may not match calculatePairRegime() exactly.
   */
  determineRegime(metrics: DSSMetrics): MarketRegime {
    const vol = metrics.volNoise;
    const trend = metrics.trendSlope;

    // Directive 11.5: Push metrics into rolling stats for Z-Score calculation
    dssRollingStats.volNoise.push(vol);
    dssRollingStats.trendSlope.push(trend);

    const volZ = dssRollingStats.volNoise.zScore(vol);
    const trendZ = dssRollingStats.trendSlope.zScore(trend);

    if (dssRollingStats.volNoise.isWarmedUp(30)) {
      console.log(`[12.3.1][DSS_ZScore] volZ=${volZ.toFixed(2)} trendZ=${trendZ.toFixed(2)} raw_vol=${vol.toFixed(4)} raw_trend=${trend.toFixed(4)}`);
    }

    // 1️⃣ Extreme Noise: Auto-Veto
    if (vol > SYSTEM_GUARDS.MAX_VOL_NOISE) {
      return 'EXTREME_NOISE';
    }

    // 2️⃣ Directive 12.3.1: Map to canonical 5-regime model
    // This is a simplified heuristic — prefer determineRegimeFromOHLC() for accuracy
    if (vol < 0.015 && Math.abs(trend) < 0.002) {
      return 'LOW_VOL_CHOP';
    }
    if (trend > SYSTEM_GUARDS.REGIME_THRESHOLDS.TREND_POSITIVE) {
      return vol >= SYSTEM_GUARDS.REGIME_THRESHOLDS.VOL_LOW ? 'HIGH_VOL_IMPULSE' : 'BULL_STABLE';
    }
    if (trend < -SYSTEM_GUARDS.REGIME_THRESHOLDS.TREND_POSITIVE) {
      return 'BEAR_VOLATILE';
    }
    if (vol > 0.025) {
      return 'HIGH_VOL_IMPULSE';
    }
    return 'TRANSITION';
  }

  /**
   * Evaluates strategies and selects the best one for current market conditions
   * Directive 12.3.1: Now uses CANONICAL_REGIME_STRATEGY_MAP for candidates
   */
  evaluate(
    snapshot: DSSMetrics,
    strategyMetrics: Record<string, StrategyMetrics>
  ): DSSResult {
    const regime = this.determineRegime(snapshot);

    // Veto on Extreme Noise
    if (regime === 'EXTREME_NOISE') {
      console.log(`[12.3.1][DSS] VETO: Extreme Volatility (volNoise=${snapshot.volNoise.toFixed(3)} > 0.6)`);
      return {
        veto: true,
        reason: `Extreme Volatility (volNoise=${snapshot.volNoise.toFixed(3)} > 0.6)`,
        regime
      };
    }

    // Get candidate strategies for this regime from CANONICAL map
    const candidates = this.getCandidatesForRegime(regime);

    if (candidates.length === 0) {
      console.log(`[12.3.1][DSS] VETO: No strategies mapped for regime ${regime}`);
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
      console.log(`[12.3.1][DSS] VETO: No positive NetEV strategy for regime ${regime}`);
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

    console.log(`[12.3.1][DSS] Selected: ${best} (regime=${regime}, confidence=${confidence.toFixed(3)}, netEV=${strategyMetrics[best]?.netEV.toFixed(4)})`);

    return {
      veto: false,
      regime,
      strategy: best,
      confidence,
    };
  }

  /**
   * Directive 12.3.1: Gets candidate strategies from CANONICAL_REGIME_STRATEGY_MAP
   * Replaces SYSTEM_GUARDS.STRATEGY_MAP lookup
   */
  private getCandidatesForRegime(regime: MarketRegime): string[] {
    if (regime === 'EXTREME_NOISE') return [];

    const mapping = CANONICAL_REGIME_STRATEGY_MAP[regime as CanonicalRegimeType];
    if (!mapping) return [];

    return mapping.strategies.map(s => s.strategyKey);
  }

  /**
   * Diagnostic: Returns current regime info for logging/monitoring
   * Directive 12.3.1: Updated to support both legacy and OHLC-based regime
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

  /**
   * Directive 12.3.1: OHLC-based regime info for canonical pipeline
   */
  getRegimeInfoFromOHLC(ohlcData: OHLCData[], volNoise: number, trendSlope: number): {
    regime: MarketRegime;
    volNoise: number;
    trendSlope: number;
    isVeto: boolean;
  } {
    const regime = this.determineRegimeFromOHLC(ohlcData, volNoise);
    return {
      regime,
      volNoise,
      trendSlope,
      isVeto: regime === 'EXTREME_NOISE',
    };
  }
}

let dssInstance: DynamicStrategySelector | null = null;

export function getDynamicStrategySelector(): DynamicStrategySelector {
  if (!dssInstance) {
    dssInstance = new DynamicStrategySelector();
    console.log('[12.3.1][DSS] Dynamic Strategy Selector initialized (canonical regime model)');
  }
  return dssInstance;
}

export { DynamicStrategySelector as DSS };
