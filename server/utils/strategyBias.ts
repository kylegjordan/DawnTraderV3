/**
 * Directive 8.8.4-L10: Adaptive Strategy Biasing & Exposure Optimization
 * 
 * Computes per-strategy exposure multipliers and allocations based on
 * strategy confidence weights from L9, enabling dynamic risk allocation
 * toward higher-confidence strategies while respecting guardrail constraints.
 * 
 * Formulas:
 * Eₛ = clamp(Wₛ / Wavg, 0.5, 1.5)  - Exposure multiplier per strategy
 * Ealloc,s = Etotal × (Eₛ / ΣEᵢ)   - Proportional allocation of total exposure
 * Rtrade,s = Rbase × Eₛ            - Per-trade risk adjustment
 */

import { computeStrategyWeights, getWeightSync, type StrategyWeightsBundle } from './strategyWeights.js';

export interface StrategyBias {
  strategy: string;
  weight: number;
  multiplier: number;
  allocPercent: number;
}

export interface ExposureBiasBundle {
  strategies: Record<string, StrategyBias>;
  totalAllocPercent: number;
  averageWeight: number;
  lastUpdated: string;
}

let cachedBias: ExposureBiasBundle | null = null;
let biasCacheTimestamp: number = 0;
const BIAS_CACHE_TTL_MS = 60000; // 1 minute cache, synced with weights cache

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Compute exposure multiplier for a single strategy
 * Eₛ = clamp(Wₛ / Wavg, 0.5, 1.5)
 */
function computeExposureMultiplier(weight: number, averageWeight: number): number {
  if (averageWeight <= 0) return 1.0;
  const rawMultiplier = weight / averageWeight;
  return clamp(rawMultiplier, 0.5, 1.5);
}

/**
 * Compute full exposure bias bundle from strategy weights
 */
export async function computeExposureBias(): Promise<ExposureBiasBundle> {
  const now = Date.now();
  
  if (cachedBias && (now - biasCacheTimestamp) < BIAS_CACHE_TTL_MS) {
    return cachedBias;
  }
  
  try {
    const weightsBundle = await computeStrategyWeights();
    
    const weights = weightsBundle.weights;
    const strategies = Object.keys(weights);
    
    if (strategies.length === 0) {
      const defaultBundle: ExposureBiasBundle = {
        strategies: {},
        totalAllocPercent: 0,
        averageWeight: 0,
        lastUpdated: new Date().toISOString()
      };
      cachedBias = defaultBundle;
      biasCacheTimestamp = now;
      return defaultBundle;
    }
    
    // Compute average weight
    const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
    const averageWeight = totalWeight / strategies.length;
    
    // Compute multipliers for each strategy
    const multipliers: Record<string, number> = {};
    let totalMultiplier = 0;
    
    for (const strategy of strategies) {
      const weight = weights[strategy] || 0;
      const multiplier = computeExposureMultiplier(weight, averageWeight);
      multipliers[strategy] = multiplier;
      totalMultiplier += multiplier;
    }
    
    // Compute allocations (normalized to 100%)
    const biasStrategies: Record<string, StrategyBias> = {};
    let totalAllocPercent = 0;
    
    for (const strategy of strategies) {
      const weight = weights[strategy] || 0;
      const multiplier = multipliers[strategy];
      const allocPercent = totalMultiplier > 0 
        ? (multiplier / totalMultiplier) * 100 
        : 100 / strategies.length;
      
      biasStrategies[strategy] = {
        strategy,
        weight,
        multiplier,
        allocPercent
      };
      
      totalAllocPercent += allocPercent;
    }
    
    const bundle: ExposureBiasBundle = {
      strategies: biasStrategies,
      totalAllocPercent,
      averageWeight,
      lastUpdated: new Date().toISOString()
    };
    
    cachedBias = bundle;
    biasCacheTimestamp = now;
    
    console.log(`[L10][BIAS_COMPUTED] Strategies: ${strategies.length}, AvgWeight: ${averageWeight.toFixed(4)}`);
    
    return bundle;
    
  } catch (err) {
    console.error('[L10][BIAS_ERROR] Failed to compute exposure bias:', err);
    
    // Return empty bundle on error
    const fallbackBundle: ExposureBiasBundle = {
      strategies: {},
      totalAllocPercent: 0,
      averageWeight: 0,
      lastUpdated: new Date().toISOString()
    };
    
    return fallbackBundle;
  }
}

/**
 * Synchronous version that reads from cache
 * Returns 1.0 (no bias) if cache not populated
 */
export function getExposureMultiplierSync(strategy: string): number {
  if (!cachedBias || !cachedBias.strategies[strategy]) {
    return 1.0; // No bias when cache unavailable
  }
  return cachedBias.strategies[strategy].multiplier;
}

/**
 * Get exposure multiplier for a specific strategy (async)
 */
export async function getExposureMultiplier(strategy: string): Promise<number> {
  const bundle = await computeExposureBias();
  
  if (!bundle.strategies[strategy]) {
    return 1.0; // Default to no bias
  }
  
  return bundle.strategies[strategy].multiplier;
}

/**
 * Get allocated exposure percentage for a strategy
 */
export async function getAllocatedExposure(strategy: string, totalMaxExposure: number): Promise<number> {
  const bundle = await computeExposureBias();
  
  if (!bundle.strategies[strategy]) {
    // Equal split if strategy not found
    const numStrategies = Object.keys(bundle.strategies).length || 1;
    return totalMaxExposure / numStrategies;
  }
  
  return (bundle.strategies[strategy].allocPercent / 100) * totalMaxExposure;
}

/**
 * Compute adjusted per-trade risk based on strategy bias
 * Rtrade,s = Rbase × Eₛ
 */
export function computeAdjustedRisk(baseRisk: number, strategy: string): number {
  const multiplier = getExposureMultiplierSync(strategy);
  return baseRisk * multiplier;
}

/**
 * Get formatted bias summary for logging
 */
export function getBiasSummaryForLog(): string {
  if (!cachedBias || Object.keys(cachedBias.strategies).length === 0) {
    return 'No bias data available';
  }
  
  const entries = Object.entries(cachedBias.strategies)
    .map(([s, b]) => `${s}=${b.multiplier.toFixed(2)}`)
    .join(' ');
  
  return entries;
}

/**
 * Check if any strategy exceeds the warning threshold (1.5× baseline)
 */
export function getOverbiasedStrategies(): string[] {
  if (!cachedBias) return [];
  
  return Object.entries(cachedBias.strategies)
    .filter(([_, b]) => b.multiplier >= 1.45) // Near max threshold
    .map(([s, _]) => s);
}
