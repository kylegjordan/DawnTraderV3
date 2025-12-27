/**
 * Directive 8.8.4-L9: Strategy Confidence Weighting Integration
 * 
 * Computes per-strategy reliability scores (Rₛ) and confidence weights (Wₛ)
 * from L8 calibration coefficients to dynamically bias trade selection.
 * 
 * Formula:
 * Rₛ = clamp(1 - |βₛ - 1| - (σₛ / σₘₐₓ), 0, 1)
 * Wₛ = Rₛ / Σᵢ Rᵢ
 */

import { loadFullCalibration, FullCalibration, CalibrationCoefficients } from './calibration.js';

export interface StrategyReliability {
  strategy: string;
  reliability: number;  // Rₛ (0-1)
  weight: number;       // Wₛ (normalized, sums to 1)
  beta: number;
  stdError: number;
  sampleCount: number;
}

export interface StrategyWeightsBundle {
  weights: Record<string, number>;
  reliabilities: Record<string, number>;
  details: StrategyReliability[];
  lastUpdated: string;
  totalStrategies: number;
}

let cachedWeights: StrategyWeightsBundle | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 60000; // 1 minute cache

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Compute strategy reliability score Rₛ
 * Rₛ = clamp(1 - |βₛ - 1| - (σₛ / σₘₐₓ), 0, 1)
 */
function computeReliabilityScore(
  beta: number,
  stdError: number,
  maxStdError: number
): number {
  const betaDeviation = Math.abs(beta - 1.0);
  const normalizedError = maxStdError > 0 ? stdError / maxStdError : 0;
  const reliability = 1 - betaDeviation - normalizedError;
  return clamp(reliability, 0, 1);
}

/**
 * Compute normalized weights from reliability scores
 * Wₛ = Rₛ / Σᵢ Rᵢ
 */
function normalizeWeights(reliabilities: Record<string, number>): Record<string, number> {
  const totalReliability = Object.values(reliabilities).reduce((sum, r) => sum + r, 0);
  
  if (totalReliability === 0) {
    const count = Object.keys(reliabilities).length;
    const equalWeight = count > 0 ? 1 / count : 0;
    return Object.fromEntries(
      Object.keys(reliabilities).map(k => [k, equalWeight])
    );
  }
  
  return Object.fromEntries(
    Object.entries(reliabilities).map(([k, r]) => [k, r / totalReliability])
  );
}

/**
 * Load and compute strategy weights from latest calibration data
 */
export async function computeStrategyWeights(): Promise<StrategyWeightsBundle> {
  const now = Date.now();
  
  if (cachedWeights && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedWeights;
  }
  
  try {
    const fullCalibration = await loadFullCalibration();
    
    const allCoefficients: { strategy: string; cal: CalibrationCoefficients }[] = [];
    
    if (fullCalibration.global && fullCalibration.global.sampleCount >= 10) {
      allCoefficients.push({ strategy: 'global', cal: fullCalibration.global });
    }
    
    for (const [strategy, cal] of Object.entries(fullCalibration.strategies)) {
      if (cal.sampleCount >= 10) {
        allCoefficients.push({ strategy, cal });
      }
    }
    
    if (allCoefficients.length === 0) {
      const defaultBundle: StrategyWeightsBundle = {
        weights: {},
        reliabilities: {},
        details: [],
        lastUpdated: new Date().toISOString(),
        totalStrategies: 0
      };
      cachedWeights = defaultBundle;
      cacheTimestamp = now;
      return defaultBundle;
    }
    
    const maxStdError = Math.max(
      ...allCoefficients.map(c => c.cal.stdError || 0),
      0.001 // Minimum to avoid division by zero
    );
    
    const reliabilities: Record<string, number> = {};
    const details: StrategyReliability[] = [];
    
    for (const { strategy, cal } of allCoefficients) {
      const reliability = computeReliabilityScore(
        cal.beta,
        cal.stdError || 0,
        maxStdError
      );
      reliabilities[strategy] = reliability;
    }
    
    const weights = normalizeWeights(reliabilities);
    
    for (const { strategy, cal } of allCoefficients) {
      details.push({
        strategy,
        reliability: reliabilities[strategy],
        weight: weights[strategy],
        beta: cal.beta,
        stdError: cal.stdError || 0,
        sampleCount: cal.sampleCount
      });
    }
    
    details.sort((a, b) => b.weight - a.weight);
    
    const bundle: StrategyWeightsBundle = {
      weights,
      reliabilities,
      details,
      lastUpdated: new Date().toISOString(),
      totalStrategies: details.length
    };
    
    console.log(`[L9][STRATEGY_WEIGHTS] Computed weights for ${details.length} strategies`);
    for (const d of details.slice(0, 5)) {
      console.log(`[L9][STRATEGY_WEIGHTS]   ${d.strategy}: R=${d.reliability.toFixed(3)} W=${d.weight.toFixed(3)}`);
    }
    
    cachedWeights = bundle;
    cacheTimestamp = now;
    
    return bundle;
  } catch (error) {
    console.error('[L9][STRATEGY_WEIGHTS][ERROR] Failed to compute weights:', error);
    return {
      weights: {},
      reliabilities: {},
      details: [],
      lastUpdated: new Date().toISOString(),
      totalStrategies: 0
    };
  }
}

/**
 * Get weight for a specific strategy (Wₛ)
 * Returns equal share if strategy not found
 */
export async function getWeight(strategy: string): Promise<number> {
  const bundle = await computeStrategyWeights();
  
  if (bundle.weights[strategy] !== undefined) {
    return bundle.weights[strategy];
  }
  
  if (bundle.totalStrategies > 0) {
    return 1 / bundle.totalStrategies;
  }
  
  return 0.2; // Default fallback
}

/**
 * Synchronous version of getWeight that reads from cache
 * Returns cached weight if available, otherwise returns default
 * Use this in non-async contexts where blocking is not acceptable
 */
export function getWeightSync(strategy: string): number {
  if (cachedWeights && cachedWeights.weights[strategy] !== undefined) {
    return cachedWeights.weights[strategy];
  }
  
  if (cachedWeights && cachedWeights.totalStrategies > 0) {
    return 1 / cachedWeights.totalStrategies;
  }
  
  return 0.2; // Default fallback when cache not populated
}

/**
 * Get reliability score for a specific strategy (Rₛ)
 */
export async function getReliability(strategy: string): Promise<number> {
  const bundle = await computeStrategyWeights();
  return bundle.reliabilities[strategy] ?? 0.5;
}

/**
 * Get all strategy weights for display/logging
 */
export async function getAllWeights(): Promise<Record<string, number>> {
  const bundle = await computeStrategyWeights();
  return bundle.weights;
}

/**
 * Invalidate cache to force recomputation
 */
export function invalidateWeightsCache(): void {
  cachedWeights = null;
  cacheTimestamp = 0;
  console.log('[L9][STRATEGY_WEIGHTS] Cache invalidated');
}

/**
 * Get weight level indicator for UI
 */
export function getWeightLevel(weight: number): 'high' | 'medium' | 'low' {
  if (weight >= 0.75) return 'high';
  if (weight >= 0.5) return 'medium';
  return 'low';
}
