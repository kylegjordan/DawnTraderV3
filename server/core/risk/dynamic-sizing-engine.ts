/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.3 — Dynamic Sizing Engine (DSE)
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Implements predictive position sizing based on:
 * - Strategy performance (expected edge, confidence)
 * - Market volatility (normalized ATR)
 * - Transaction costs (spread + slippage)
 * - Adaptive learning signals
 * 
 * Core Formula:
 *   size = baseSize × f(expectedEdge, volatility, costFactor, confidence)
 * 
 * Where f is bounded: 0.3 ≤ f ≤ 1.2
 * 
 * Invariants:
 * - T3: Hard Cap - Trade size cannot exceed TradeSafetyService max
 * - T4: Dynamic Base - Base size scales with portfolio balance
 * - T5: Bounded Multiplier - Sizing multiplier 0.3-1.2
 * - T6: Telemetry Provenance - All sizing decisions logged
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

// B65.2 (2026-04-23): MAX_POSITION_RISK migrated from the deleted
// execution-config.ts to the module_constants table under module='risk_sizing'.
// Read through moduleConstantsService with the same 0.1 fallback.
import { getConstant } from '../../services/module-constants-service.js';
import { loadAdaptiveWeights, type AdaptiveWeights } from '../../services/adaptive-learning-repository.js';
import { getRecentCostDrift } from '../../services/monitoring/cost-drift-monitor.js';

let mockAdaptiveWeights: Map<string, Map<string, AdaptiveWeights>> | null = null;

export function setMockAdaptiveWeights(weights: Map<string, Map<string, AdaptiveWeights>> | null): void {
  mockAdaptiveWeights = weights;
}

async function getAdaptiveWeights(regime: string, strategyId: string): Promise<AdaptiveWeights | undefined> {
  if (mockAdaptiveWeights) {
    return mockAdaptiveWeights.get(regime)?.get(strategyId);
  }
  const weights = await loadAdaptiveWeights(regime as any);
  return weights.get(strategyId);
}
import type { MarketRegime } from '../../services/telemetry-repository.js';

export interface DynamicSizeInput {
  strategyId: string;
  symbol: string;
  regime: MarketRegime;
  pool: 'ideal' | 'rotational';
  volatility: number;
  cost: number;
  balance?: number;
}

export interface DynamicSizeResult {
  positionSize: number;
  sizeMultiplier: number;
  baseSize: number;
  breakdown: {
    edgeFactor: number;
    volPenalty: number;
    costPenalty: number;
    confFactor: number;
  };
  capped: boolean;
  cappedAt?: number;
}

export interface DSETelemetry {
  symbol: string;
  regime: MarketRegime;
  pool: 'ideal' | 'rotational';
  positionSize: number;
  sizeMultiplier: number;
  breakdown: DynamicSizeResult['breakdown'];
  timestamp: Date;
}

const DSE_CONFIG = {
  MIN_MULTIPLIER: 0.3,
  MAX_MULTIPLIER: 1.2,
  BASE_EDGE: 0.05,
  EDGE_SENSITIVITY: 4,
  VOL_THRESHOLD: 0.02,
  VOL_FLOOR: 0.7,
  COST_THRESHOLD: 0.001,
  COST_FLOOR: 0.6,
  CONFIDENCE_BASE: 0.5,
  DEFAULT_RISK_PCT: 2,
  COST_PRESSURE_DAMPENING: 0.2,
};

/**
 * Directive 11.3C: Get cost pressure factor based on recent drift alerts.
 * When spreads widen or slippage jumps, dampens position sizing up to 20%.
 * 
 * Formula: costPressure = 1 - (drift × 0.2)
 * Range: 0.8 to 1.0
 */
export function getCostPressureFactor(): number {
  const costDrift = getRecentCostDrift();
  const costPressure = 1 - (costDrift * DSE_CONFIG.COST_PRESSURE_DAMPENING);
  return Math.max(0.8, Math.min(1.0, costPressure));
}

let lastSizeDecision: DSETelemetry | null = null;
const sizeHistory: DSETelemetry[] = [];
const MAX_HISTORY = 100;

/**
 * Extract expected edge from adaptive weights.
 * Priority: expectedEdge > edge > winRate > profitRate > derived from avgWeight
 * 
 * DSE-Compatible Weight Keys:
 * - expectedEdge: Direct expected edge value (0-0.15 typical)
 * - edge: Alias for expectedEdge  
 * - winRate: Win rate (0-1), converted to edge via ×0.1
 * - profitRate: Profit rate, converted to edge via ×0.5
 */
function extractExpectedEdge(weights: AdaptiveWeights | undefined, strategyId: string): number {
  if (!weights || Object.keys(weights).length === 0) return DSE_CONFIG.BASE_EDGE;
  
  if ('expectedEdge' in weights && typeof weights.expectedEdge === 'number') {
    return Math.max(0, Math.min(0.2, weights.expectedEdge));
  }
  if ('edge' in weights && typeof weights.edge === 'number') {
    return Math.max(0, Math.min(0.2, weights.edge));
  }
  if ('winRate' in weights && typeof weights.winRate === 'number') {
    return Math.max(0, Math.min(0.15, weights.winRate * 0.1));
  }
  if ('profitRate' in weights && typeof weights.profitRate === 'number') {
    return Math.max(0, Math.min(0.15, weights.profitRate * 0.5));
  }
  
  const numericValues = Object.values(weights).filter(v => typeof v === 'number') as number[];
  if (numericValues.length === 0) return DSE_CONFIG.BASE_EDGE;
  
  const avgWeight = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
  return Math.max(0.01, Math.min(0.15, avgWeight * 0.08 + 0.03));
}

/**
 * Extract confidence from adaptive weights.
 * Priority: confidence > sampleCount > reliability > derived from weight density
 * 
 * DSE-Compatible Weight Keys:
 * - confidence: Direct confidence value (0-1)
 * - sampleCount: Number of samples, normalized to confidence via /100
 * - reliability: Reliability score (0-1)
 */
function extractConfidence(weights: AdaptiveWeights | undefined, strategyId: string): number {
  if (!weights || Object.keys(weights).length === 0) return 0.5;
  
  if ('confidence' in weights && typeof weights.confidence === 'number') {
    return Math.max(0, Math.min(1, weights.confidence));
  }
  if ('sampleCount' in weights && typeof weights.sampleCount === 'number') {
    return Math.max(0.1, Math.min(1, weights.sampleCount / 100));
  }
  if ('reliability' in weights && typeof weights.reliability === 'number') {
    return Math.max(0, Math.min(1, weights.reliability));
  }
  
  const numericValues = Object.values(weights).filter(v => typeof v === 'number') as number[];
  if (numericValues.length === 0) return 0.5;
  
  const density = Math.min(1, numericValues.length / 5);
  const avgMagnitude = numericValues.reduce((a, b) => a + Math.abs(b), 0) / numericValues.length;
  return Math.max(0.2, Math.min(0.9, density * 0.4 + avgMagnitude * 0.3 + 0.2));
}

export async function computeDynamicSize(input: DynamicSizeInput): Promise<DynamicSizeResult> {
  const {
    strategyId,
    symbol,
    regime,
    pool,
    volatility,
    cost,
    balance = 1000,
  } = input;

  const baseRiskPct = DSE_CONFIG.DEFAULT_RISK_PCT;
  const baseSize = balance * (baseRiskPct / 100);

  const strategyWeights = await getAdaptiveWeights(regime, strategyId);
  
  const baseEdge = extractExpectedEdge(strategyWeights, strategyId);
  const confidence = extractConfidence(strategyWeights, strategyId);
  
  const hasAdaptiveData = strategyWeights !== undefined && Object.keys(strategyWeights).length > 0;
  if (hasAdaptiveData) {
    console.log(`[11.3][DSE] Using adaptive weights for ${strategyId}@${regime}: edge=${baseEdge.toFixed(4)}, confidence=${confidence.toFixed(4)}`);
  }

  const edgeFactor = 1 + (baseEdge - DSE_CONFIG.BASE_EDGE) * DSE_CONFIG.EDGE_SENSITIVITY;
  const volPenalty = Math.max(DSE_CONFIG.VOL_FLOOR, 1 - (volatility / DSE_CONFIG.VOL_THRESHOLD));
  const costPenalty = Math.max(DSE_CONFIG.COST_FLOOR, 1 - (cost / DSE_CONFIG.COST_THRESHOLD));
  const confFactor = DSE_CONFIG.CONFIDENCE_BASE + confidence;

  const costPressure = getCostPressureFactor();
  let multiplier = edgeFactor * volPenalty * costPenalty * confFactor * costPressure;
  multiplier = Math.min(DSE_CONFIG.MAX_MULTIPLIER, Math.max(DSE_CONFIG.MIN_MULTIPLIER, multiplier));
  
  if (costPressure < 1.0) {
    console.log(`[11.3C][DSE] Cost pressure dampening applied: ×${costPressure.toFixed(3)}`);
  }

  // B65.2: resolve via module_constants. Fallback preserves the legacy 0.1
  // behavior that the nullish-coalesce used before EXECUTION_CONFIG existed.
  const maxPositionRisk = (await getConstant<number>('risk_sizing', 'max_position_risk', {
    exchange: 'kraken',
    assetClass: 'crypto_spot',
    strategy: strategyId,
    regime: regime as string,
  })) ?? 0.1;
  const maxAllowedSize = balance * maxPositionRisk;
  
  let positionSize = baseSize * multiplier;
  let capped = false;
  let cappedAt: number | undefined;

  if (positionSize > maxAllowedSize) {
    cappedAt = maxAllowedSize;
    positionSize = maxAllowedSize;
    capped = true;
  }

  const result: DynamicSizeResult = {
    positionSize,
    sizeMultiplier: multiplier,
    baseSize,
    breakdown: {
      edgeFactor,
      volPenalty,
      costPenalty,
      confFactor,
    },
    capped,
    cappedAt,
  };

  const telemetry: DSETelemetry = {
    symbol,
    regime,
    pool,
    positionSize,
    sizeMultiplier: multiplier,
    breakdown: result.breakdown,
    timestamp: new Date(),
  };
  lastSizeDecision = telemetry;
  sizeHistory.push(telemetry);
  if (sizeHistory.length > MAX_HISTORY) {
    sizeHistory.shift();
  }

  console.log(`[11.3][DSE] ${symbol} size=${positionSize.toFixed(2)} (×${multiplier.toFixed(3)}) regime=${regime} pool=${pool}${capped ? ' [CAPPED]' : ''}`);

  return result;
}

export function getLastSizeDecision(): DSETelemetry | null {
  return lastSizeDecision;
}

export function getSizeHistory(): DSETelemetry[] {
  return [...sizeHistory];
}

export function getAverageSizeMultiplier(): number {
  if (sizeHistory.length === 0) return 1.0;
  const sum = sizeHistory.reduce((acc, t) => acc + t.sizeMultiplier, 0);
  return sum / sizeHistory.length;
}

export function getAverageSizeMultiplierByRegime(regime: MarketRegime): number {
  const regimeHistory = sizeHistory.filter(t => t.regime === regime);
  if (regimeHistory.length === 0) return 1.0;
  const sum = regimeHistory.reduce((acc, t) => acc + t.sizeMultiplier, 0);
  return sum / regimeHistory.length;
}

export function getDSEDiagnostics(): {
  lastDecision: DSETelemetry | null;
  avgMultiplier: number;
  historyCount: number;
  byRegime: Record<string, { avgMultiplier: number; count: number }>;
} {
  const byRegime: Record<string, { avgMultiplier: number; count: number }> = {};
  
  const regimes = ['EXTREME_NOISE', 'TREND_FRIENDLY_STABLE', 'HIGH_VOLATILITY_UNSTABLE', 'RANGE_BOUND_STABLE', 'IMPULSE_EXPANSION', 'STRUCTURAL_TRANSITION'];
  for (const regime of regimes) {
    const regimeHistory = sizeHistory.filter(t => t.regime === regime);
    if (regimeHistory.length > 0) {
      const sum = regimeHistory.reduce((acc, t) => acc + t.sizeMultiplier, 0);
      byRegime[regime] = {
        avgMultiplier: sum / regimeHistory.length,
        count: regimeHistory.length,
      };
    }
  }

  return {
    lastDecision: lastSizeDecision,
    avgMultiplier: getAverageSizeMultiplier(),
    historyCount: sizeHistory.length,
    byRegime,
  };
}

export function resetDSEHistory(): void {
  sizeHistory.length = 0;
  lastSizeDecision = null;
  console.log('[11.3][DSE] History reset');
}

export { DSE_CONFIG };
