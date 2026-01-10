/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.4C.3 — Strategy & Regime Harmonization (Rosetta Stone)
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Purpose: Single canonical source for regime-to-strategy mappings.
 * Both VTS and Signal Orchestrator import from this file.
 * 
 * Strategy names use snake_case for canonical storage; UI renders human-readable titles.
 * 
 * Governance: M45, M46, M47
 * Schema: v1.6.7
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import type { SignalType, PatternType } from '../types';

export type MarketRegimeType = 
  | 'BULL_STABLE'
  | 'BEAR_VOLATILE'
  | 'LOW_VOL_CHOP'
  | 'HIGH_VOL_IMPULSE'
  | 'TRANSITION';

export type CanonicalSignalType = 'QUANT' | 'PATTERN' | 'HYBRID';

export interface StrategyMapping {
  signalType: CanonicalSignalType;
  strategies: string[];
  riskMultiplier: number;
  minConfidence: number;
}

export const REGIME_STRATEGY_MAP: Record<MarketRegimeType, StrategyMapping> = {
  HIGH_VOL_IMPULSE: {
    signalType: 'QUANT',
    strategies: ['vwap_bounce', 'liquidity_trap', 'volatility_edge'],
    riskMultiplier: 0.8,
    minConfidence: 0.70
  },
  LOW_VOL_CHOP: {
    signalType: 'PATTERN',
    strategies: ['range_trade', 'support_bounce', 'abcd_long'],
    riskMultiplier: 0.9,
    minConfidence: 0.60
  },
  BULL_STABLE: {
    signalType: 'HYBRID',
    strategies: ['vwap_pullback', 'sma_trend_ride', 'breakout'],
    riskMultiplier: 1.2,
    minConfidence: 0.65
  },
  BEAR_VOLATILE: {
    signalType: 'HYBRID',
    strategies: ['reverse_impulse', 'defensive_hedge'],
    riskMultiplier: 0.7,
    minConfidence: 0.75
  },
  TRANSITION: {
    signalType: 'HYBRID',
    strategies: ['mean_reversion', 'pivot_shift', 'adaptive_flow'],
    riskMultiplier: 0.85,
    minConfidence: 0.55
  }
};

export const STRATEGY_DISPLAY_NAMES: Record<string, string> = {
  vwap_pullback: 'VWAP Pullback',
  sma_trend_ride: 'SMA Trend Ride',
  breakout: 'Breakout',
  vwap_bounce: 'VWAP Bounce',
  liquidity_trap: 'Liquidity Trap',
  abcd_long: 'ABCD Long',
  volatility_edge: 'Volatility Edge',
  reverse_impulse: 'Reverse Impulse',
  defensive_hedge: 'Defensive Hedge',
  mean_reversion: 'Mean Reversion',
  pivot_shift: 'Pivot Shift',
  adaptive_flow: 'Adaptive Flow',
  range_trade: 'Range Trade',
  support_bounce: 'Support Bounce',
  dhma: 'DHMA'
};

export const LEGACY_TO_CANONICAL: Record<string, string> = {
  MomentumPulse: 'vwap_pullback',
  TrendFlow: 'sma_trend_ride',
  BreakoutConfirm: 'breakout',
  H2_Slingshot: 'vwap_bounce',
  ImpulseChaser: 'liquidity_trap',
  TriangleBreakout: 'abcd_long',
  VolatilityEdge: 'volatility_edge',
  ReverseImpulse: 'reverse_impulse',
  DefensiveHedge: 'defensive_hedge',
  MeanReversion: 'mean_reversion',
  PivotShift: 'pivot_shift',
  AdaptiveFlow: 'adaptive_flow',
  RangeTrade: 'range_trade',
  SupportBounce: 'support_bounce',
  BreakdownSniper: 'reverse_impulse',
  DoubleBottom: 'support_bounce'
};

export const CANONICAL_REGIMES: MarketRegimeType[] = [
  'BULL_STABLE',
  'BEAR_VOLATILE', 
  'LOW_VOL_CHOP',
  'HIGH_VOL_IMPULSE',
  'TRANSITION'
];

export const GHOST_REGIME_FALLBACK: Record<string, MarketRegimeType> = {
  BULL_VOLATILE: 'HIGH_VOL_IMPULSE',
  BEAR_STABLE: 'BEAR_VOLATILE',
  EXTREME_NOISE: 'LOW_VOL_CHOP',
  HIGH_VOL_CHOP: 'HIGH_VOL_IMPULSE',
  MIXED_TRANSITION: 'TRANSITION'
};

export function normalizeRegime(regime: string): MarketRegimeType {
  if (CANONICAL_REGIMES.includes(regime as MarketRegimeType)) {
    return regime as MarketRegimeType;
  }
  return GHOST_REGIME_FALLBACK[regime] ?? 'TRANSITION';
}

export function normalizeStrategy(strategy: string): string {
  return LEGACY_TO_CANONICAL[strategy] ?? strategy;
}

export function getStrategyDisplayName(canonicalKey: string): string {
  return STRATEGY_DISPLAY_NAMES[canonicalKey] ?? canonicalKey;
}

export function getStrategyForRegime(regime: MarketRegimeType): StrategyMapping {
  return REGIME_STRATEGY_MAP[regime] ?? REGIME_STRATEGY_MAP.TRANSITION;
}

export function selectRandomStrategy(regime: MarketRegimeType): { signalType: CanonicalSignalType; strategy: string } {
  const mapping = getStrategyForRegime(regime);
  const strategies = mapping.strategies;
  const strategy = strategies[Math.floor(Math.random() * strategies.length)];
  
  return {
    signalType: mapping.signalType,
    strategy
  };
}

export function getAllStrategiesForSignalType(signalType: CanonicalSignalType): string[] {
  const strategies = new Set<string>();
  
  for (const mapping of Object.values(REGIME_STRATEGY_MAP)) {
    if (mapping.signalType === signalType) {
      mapping.strategies.forEach(s => strategies.add(s));
    }
  }
  
  return Array.from(strategies);
}

export function getRegimeRiskMultiplier(regime: MarketRegimeType): number {
  return REGIME_STRATEGY_MAP[regime]?.riskMultiplier ?? 1.0;
}

export const regimeStrategyMap = REGIME_STRATEGY_MAP;
