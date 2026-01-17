/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.5 — Secondary Metric Adjustment Module
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Purpose: Dynamically adjusts secondary metric thresholds based on macro 
 * market conditions. Ensures filters adapt to volatility expansion, 
 * liquidity crunches, and speculative surges.
 * 
 * Schema: v1.7.0
 * Governance: Directive 11.5 Task 3
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { getGlobalMacroCondition, type MacroCondition, type GlobalStats } from './macro-state.js';

export interface MetricRanges {
  VOL_HIGH: number;
  VOL_LOW: number;
  MOM_HIGH: number;
  MOM_LOW: number;
  LQ_MIN: number;
  ADX_MIN: number;
  ADX_HIGH: number;
  VOLNOISE_MAX: number;
}

export const BASE_METRIC_RANGES: MetricRanges = {
  VOL_HIGH: 0.04,
  VOL_LOW: 0.005,
  MOM_HIGH: 0.05,
  MOM_LOW: -0.05,
  LQ_MIN: 40,
  ADX_MIN: 20,
  ADX_HIGH: 50,
  VOLNOISE_MAX: 0.6
};

/**
 * Directive 11.5 Task 3: Adjust Metric Ranges
 * 
 * Dynamically adjusts secondary metric thresholds based on macro conditions:
 * - VOLATILITY_EXPANSION: Widen volatility/momentum thresholds
 * - LIQUIDITY_CRUNCH: Raise minimum liquidity requirement
 * - SPECULATIVE_SURGE: Raise ADX minimum, tighten volatility
 * - NORMAL: Use base ranges
 * 
 * @param baseRanges - Base metric ranges
 * @param globalStats - Global market statistics for condition determination
 * @returns Adjusted metric ranges
 */
export function adjustMetricRanges(
  baseRanges: MetricRanges,
  globalStats: GlobalStats
): MetricRanges {
  const adjustedRanges = { ...baseRanges };
  const condition = getGlobalMacroCondition(globalStats);

  switch (condition) {
    case 'VOLATILITY_EXPANSION':
      adjustedRanges.VOL_HIGH *= 1.25;
      adjustedRanges.MOM_HIGH *= 1.1;
      adjustedRanges.MOM_LOW *= 1.1;
      adjustedRanges.VOLNOISE_MAX *= 1.15;
      break;
      
    case 'LIQUIDITY_CRUNCH':
      adjustedRanges.LQ_MIN += 10;
      adjustedRanges.VOL_HIGH *= 0.85;
      break;
      
    case 'SPECULATIVE_SURGE':
      adjustedRanges.ADX_MIN += 10;
      adjustedRanges.VOL_HIGH *= 0.9;
      adjustedRanges.VOLNOISE_MAX *= 0.85;
      break;
      
    case 'NORMAL':
    default:
      break;
  }

  return adjustedRanges;
}

/**
 * Directive 11.5: Get adjusted ranges using current macro condition
 */
export function getCurrentAdjustedRanges(globalStats?: GlobalStats): MetricRanges {
  if (!globalStats) {
    return { ...BASE_METRIC_RANGES };
  }
  
  return adjustMetricRanges(BASE_METRIC_RANGES, globalStats);
}

/**
 * Directive 11.5: Check if a metric passes its threshold
 */
export function metricsPassThresholds(
  metrics: {
    volatility?: number;
    momentum?: number;
    lq?: number;
    adx?: number;
    volNoise?: number;
  },
  ranges: MetricRanges
): { passes: boolean; failures: string[] } {
  const failures: string[] = [];
  
  if (metrics.lq !== undefined && metrics.lq < ranges.LQ_MIN) {
    failures.push(`LQ=${metrics.lq.toFixed(1)} < ${ranges.LQ_MIN}`);
  }
  
  if (metrics.volNoise !== undefined && metrics.volNoise > ranges.VOLNOISE_MAX) {
    failures.push(`VolNoise=${metrics.volNoise.toFixed(2)} > ${ranges.VOLNOISE_MAX}`);
  }
  
  if (metrics.adx !== undefined && metrics.adx < ranges.ADX_MIN) {
    failures.push(`ADX=${metrics.adx.toFixed(1)} < ${ranges.ADX_MIN}`);
  }
  
  return {
    passes: failures.length === 0,
    failures
  };
}

/**
 * Directive 11.5: Log current metric range adjustments
 */
export function logMetricRangeAdjustments(
  condition: MacroCondition,
  baseRanges: MetricRanges,
  adjustedRanges: MetricRanges
): void {
  const changes: string[] = [];
  
  for (const key of Object.keys(baseRanges) as (keyof MetricRanges)[]) {
    if (baseRanges[key] !== adjustedRanges[key]) {
      changes.push(`${key}: ${baseRanges[key]} → ${adjustedRanges[key]}`);
    }
  }
  
  if (changes.length > 0) {
    console.log(`[11.5][SecondaryMetrics] Condition=${condition} Adjustments: ${changes.join(', ')}`);
  }
}
