/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.4F.1 — Backward-Compatible Re-export from Canonical Source
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * DEPRECATED: This file now re-exports from canonical-regime-strategy-map.ts
 * All new code should import directly from canonical-regime-strategy-map.ts
 * 
 * This file exists only for backward compatibility with existing imports.
 * It will be removed in a future version once all imports are migrated.
 * 
 * Schema: Directive 11.4F.1
 * Last Updated: 2026-01-12
 * ══════════════════════════════════════════════════════════════════════════════
 */

import type { MarketRegimeType } from '../types/market-regime.types';

export type { MarketRegimeType };

export type {
  CanonicalSignalType,
  CanonicalRegimeType,
  CanonicalPatternType,
} from './canonical-regime-strategy-map';

export {
  CANONICAL_REGIME_STRATEGY_MAP,
  CANONICAL_REGIMES,
  CANONICAL_SIGNAL_TYPES,
  CANONICAL_PATTERN_TYPES,
  REGIME_METRICS,
  STRATEGY_DISPLAY_NAMES,
  LEGACY_TO_CANONICAL,
  GHOST_REGIME_NORMALIZATION,
  normalizeRegime,
  normalizeStrategy,
  getTypeForStrategy,
  getPatternForStrategy,
  getStrategiesForRegime,
  getRegimeMinConfidence,
  isValidCanonicalCombination,
  getAllCanonicalStrategies,
  getAllStrategiesForSignalType,
  selectRandomStrategy,
  CANONICAL_VERSION,
  CANONICAL_SCHEMA_DATE,
} from './canonical-regime-strategy-map';

import {
  CANONICAL_REGIME_STRATEGY_MAP,
  CanonicalSignalType,
  getStrategiesForRegime,
  selectRandomStrategy as canonicalSelectRandomStrategy,
  getRegimeRiskMultiplier as canonicalGetRegimeRiskMultiplier,
  getPatternForStrategy as canonicalGetPatternForStrategy,
} from './canonical-regime-strategy-map';

export interface StrategyMapping {
  signalType: CanonicalSignalType;
  strategies: string[];
  riskMultiplier: number;
  minConfidence: number;
}

export const REGIME_STRATEGY_MAP: Record<MarketRegimeType, StrategyMapping> = {
  BULL_STABLE: {
    signalType: 'HYBRID',
    strategies: getStrategiesForRegime('BULL_STABLE').map(s => s.strategyKey),
    riskMultiplier: CANONICAL_REGIME_STRATEGY_MAP.BULL_STABLE.riskMultiplier,
    minConfidence: CANONICAL_REGIME_STRATEGY_MAP.BULL_STABLE.minConfidence,
  },
  BEAR_VOLATILE: {
    signalType: 'HYBRID',
    strategies: getStrategiesForRegime('BEAR_VOLATILE').map(s => s.strategyKey),
    riskMultiplier: CANONICAL_REGIME_STRATEGY_MAP.BEAR_VOLATILE.riskMultiplier,
    minConfidence: CANONICAL_REGIME_STRATEGY_MAP.BEAR_VOLATILE.minConfidence,
  },
  LOW_VOL_CHOP: {
    signalType: 'PATTERN',
    strategies: getStrategiesForRegime('LOW_VOL_CHOP').map(s => s.strategyKey),
    riskMultiplier: CANONICAL_REGIME_STRATEGY_MAP.LOW_VOL_CHOP.riskMultiplier,
    minConfidence: CANONICAL_REGIME_STRATEGY_MAP.LOW_VOL_CHOP.minConfidence,
  },
  HIGH_VOL_IMPULSE: {
    signalType: 'QUANT',
    strategies: getStrategiesForRegime('HIGH_VOL_IMPULSE').map(s => s.strategyKey),
    riskMultiplier: CANONICAL_REGIME_STRATEGY_MAP.HIGH_VOL_IMPULSE.riskMultiplier,
    minConfidence: CANONICAL_REGIME_STRATEGY_MAP.HIGH_VOL_IMPULSE.minConfidence,
  },
  TRANSITION: {
    signalType: 'HYBRID',
    strategies: getStrategiesForRegime('TRANSITION').map(s => s.strategyKey),
    riskMultiplier: CANONICAL_REGIME_STRATEGY_MAP.TRANSITION.riskMultiplier,
    minConfidence: CANONICAL_REGIME_STRATEGY_MAP.TRANSITION.minConfidence,
  },
};

export function getStrategyForRegime(regime: MarketRegimeType): StrategyMapping {
  return REGIME_STRATEGY_MAP[regime] ?? REGIME_STRATEGY_MAP.TRANSITION;
}

export function selectRegimeStrategy(regime: MarketRegimeType): { 
  signalType: CanonicalSignalType; 
  strategy: string;
  patternType?: string | null;
} {
  const result = canonicalSelectRandomStrategy(regime as any);
  return {
    signalType: result.signalType,
    strategy: result.strategy,
    patternType: result.patternType
  };
}

export function getRegimeRiskMultiplier(regime: MarketRegimeType): number {
  return canonicalGetRegimeRiskMultiplier(regime as any);
}

export const regimeStrategyMap = REGIME_STRATEGY_MAP;

export const STRATEGY_TO_SIGNAL_TYPE: Record<string, CanonicalSignalType> = (() => {
  const lookup: Record<string, CanonicalSignalType> = {};
  for (const mapping of Object.values(CANONICAL_REGIME_STRATEGY_MAP)) {
    for (const stratDef of mapping.strategies) {
      lookup[stratDef.strategyKey] = stratDef.signalType;
    }
  }
  return lookup;
})();
