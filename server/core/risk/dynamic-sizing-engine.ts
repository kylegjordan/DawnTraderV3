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

import { EXECUTION_CONFIG } from '../../config/execution-config.js';
import { loadAdaptiveWeights, type AdaptiveWeights } from '../../services/adaptive-learning-repository.js';
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
};

let lastSizeDecision: DSETelemetry | null = null;
const sizeHistory: DSETelemetry[] = [];
const MAX_HISTORY = 100;

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

  const learningWeights = await loadAdaptiveWeights(regime);
  const strategyWeights = learningWeights.get(strategyId);
  
  const baseEdge = strategyWeights?.expectedEdge ?? 0.05;
  const confidence = strategyWeights?.confidence ?? 0.5;

  const edgeFactor = 1 + (baseEdge - DSE_CONFIG.BASE_EDGE) * DSE_CONFIG.EDGE_SENSITIVITY;
  const volPenalty = Math.max(DSE_CONFIG.VOL_FLOOR, 1 - (volatility / DSE_CONFIG.VOL_THRESHOLD));
  const costPenalty = Math.max(DSE_CONFIG.COST_FLOOR, 1 - (cost / DSE_CONFIG.COST_THRESHOLD));
  const confFactor = DSE_CONFIG.CONFIDENCE_BASE + confidence;

  let multiplier = edgeFactor * volPenalty * costPenalty * confFactor;
  multiplier = Math.min(DSE_CONFIG.MAX_MULTIPLIER, Math.max(DSE_CONFIG.MIN_MULTIPLIER, multiplier));

  const maxPositionRisk = EXECUTION_CONFIG.MAX_POSITION_RISK ?? 0.1;
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
  
  const regimes = ['EXTREME_NOISE', 'BULL_STABLE', 'BULL_VOLATILE', 'BEAR_STABLE', 'BEAR_VOLATILE', 'LOW_VOL_CHOP'];
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
