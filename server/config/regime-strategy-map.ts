/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.0E.1 — Regime → Strategy Mapping Configuration
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Purpose: Maps market regime classifications to appropriate signal types and
 * strategy sets for the modernized VTS.
 * 
 * Schema: v1.6.6
 * Governance: M45 (All VirtualTrades include regime, signalType, strategy)
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import type { MarketRegimeType } from '../types/market-regime.types';
import type { SignalType } from '../types/virtual-trade.interface';

export interface StrategyMapping {
  signalType: SignalType;
  strategies: string[];
  riskMultiplier: number;
  minConfidence: number;
}

export const regimeStrategyMap: Record<MarketRegimeType, StrategyMapping> = {
  BULL_STABLE: {
    signalType: 'Hybrid',
    strategies: ['MomentumPulse', 'TrendFlow', 'BreakoutConfirm'],
    riskMultiplier: 1.2,
    minConfidence: 0.65
  },
  BEAR_VOLATILE: {
    signalType: 'Hybrid',
    strategies: ['BreakdownSniper', 'ReverseImpulse', 'DefensiveHedge'],
    riskMultiplier: 0.7,
    minConfidence: 0.75
  },
  LOW_VOL_CHOP: {
    signalType: 'Pattern',
    strategies: ['RangeTrade', 'SupportBounce', 'TriangleBreakout', 'DoubleBottom'],
    riskMultiplier: 0.9,
    minConfidence: 0.60
  },
  HIGH_VOL_IMPULSE: {
    signalType: 'Quantitative',
    strategies: ['H2_Slingshot', 'ImpulseChaser', 'VolatilityEdge'],
    riskMultiplier: 0.8,
    minConfidence: 0.70
  },
  TRANSITION: {
    signalType: 'Hybrid',
    strategies: ['MeanReversion', 'PivotShift', 'AdaptiveFlow'],
    riskMultiplier: 0.85,
    minConfidence: 0.55
  }
};

export function getStrategyForRegime(regime: MarketRegimeType): StrategyMapping {
  return regimeStrategyMap[regime] ?? regimeStrategyMap.TRANSITION;
}

export function selectRandomStrategy(regime: MarketRegimeType): { signalType: SignalType; strategy: string } {
  const mapping = getStrategyForRegime(regime);
  const strategies = mapping.strategies;
  const strategy = strategies[Math.floor(Math.random() * strategies.length)];
  
  return {
    signalType: mapping.signalType,
    strategy
  };
}

export function getAllStrategiesForSignalType(signalType: SignalType): string[] {
  const strategies = new Set<string>();
  
  for (const mapping of Object.values(regimeStrategyMap)) {
    if (mapping.signalType === signalType) {
      mapping.strategies.forEach(s => strategies.add(s));
    }
  }
  
  return Array.from(strategies);
}

export function getRegimeRiskMultiplier(regime: MarketRegimeType): number {
  return regimeStrategyMap[regime]?.riskMultiplier ?? 1.0;
}
