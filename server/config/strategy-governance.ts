/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.7R — Strategy Governance Configuration
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Defines strategy dependency levels for regime transition governance.
 * 
 * Dependency Levels:
 * - HIGH: Regime-fragile strategies (fully blocked in UNSTABLE, 30% weight in TRANSITION)
 * - MEDIUM: Moderate regime sensitivity (20% weight in UNSTABLE, 60% weight in TRANSITION)
 * - LOW: Regime-resilient strategies (60% weight in UNSTABLE, 100% in TRANSITION)
 * 
 * Safety Default: If a strategy is not mapped, it defaults to HIGH dependency (fail-safe).
 * 
 * Schema Version: governance/v1.0
 * ══════════════════════════════════════════════════════════════════════════════
 */

export type StrategyDependency = 'HIGH' | 'MEDIUM' | 'LOW';

export type RegimeStability = 'STABLE' | 'TRANSITION' | 'UNSTABLE';

export interface StrategyGovernanceProfile {
  dependency: StrategyDependency;
  description: string;
}

export const STRATEGY_GOVERNANCE: Record<string, StrategyDependency> = {
  vwap_pullback:   'HIGH',
  sma_trend_ride:  'HIGH',
  range_trade:     'HIGH',
  morning_star:    'HIGH',
  vwap_bounce:     'HIGH',
  support_bounce:  'HIGH',
  breakout:        'HIGH',
  liquidity_trap:  'HIGH',

  mean_reversion:  'MEDIUM',
  pivot_shift:     'MEDIUM',
  momentum_burst:  'MEDIUM',
  trendpulse:      'MEDIUM',

  defensive_hedge: 'LOW',
  volatility_edge: 'LOW',
  volsurf:         'LOW',
  gridflow:        'LOW',

  // Phase 14: Previously missing — defaulted to HIGH (fail-safe), now explicitly classified
  abcd_long:           'MEDIUM',
  adaptive_flow:       'MEDIUM',
  dhma:                'MEDIUM',
  reverse_impulse:     'HIGH',
  inside_bar_reversal: 'HIGH',
};

export const STRATEGY_GOVERNANCE_PROFILES: Record<string, StrategyGovernanceProfile> = {
  vwap_pullback:   { dependency: 'HIGH', description: 'Trend-following strategy highly dependent on stable regime conditions' },
  sma_trend_ride:  { dependency: 'HIGH', description: 'Moving average strategy requires clear trend direction' },
  range_trade:     { dependency: 'HIGH', description: 'Range-bound strategy fails during regime transitions' },
  morning_star:    { dependency: 'HIGH', description: 'Pattern-based reversal strategy sensitive to false signals in noise' },
  vwap_bounce:     { dependency: 'HIGH', description: 'VWAP bounce requires stable intraday conditions' },
  support_bounce:  { dependency: 'HIGH', description: 'Support/resistance invalidated during regime shifts' },
  breakout:        { dependency: 'HIGH', description: 'Breakout strategies prone to whipsaws during instability' },
  liquidity_trap:  { dependency: 'HIGH', description: 'Liquidity patterns disrupted during market stress' },

  mean_reversion:  { dependency: 'MEDIUM', description: 'Mean reversion can work in transitions with caution' },
  pivot_shift:     { dependency: 'MEDIUM', description: 'Pivot points partially valid during transitions' },
  momentum_burst:  { dependency: 'MEDIUM', description: 'Short-term momentum less regime-dependent' },
  trendpulse:      { dependency: 'MEDIUM', description: 'Adaptive trend detection partially resilient' },

  defensive_hedge: { dependency: 'LOW', description: 'Defensive strategy designed for adverse conditions' },
  volatility_edge: { dependency: 'LOW', description: 'Volatility strategies benefit from regime instability' },
  volsurf:         { dependency: 'LOW', description: 'Volatility surface trading adapts to conditions' },
  gridflow:        { dependency: 'LOW', description: 'Grid trading less sensitive to directional regimes' },

  // Phase 14: Previously missing — now explicitly classified
  abcd_long:           { dependency: 'MEDIUM', description: 'Harmonic pattern partially regime-independent' },
  adaptive_flow:       { dependency: 'MEDIUM', description: 'Chop breakout strategy adapts to regime transitions' },
  dhma:                { dependency: 'MEDIUM', description: 'Dynamic hull MA partially adapts to regime changes' },
  reverse_impulse:     { dependency: 'HIGH', description: 'Reversal signals highly sensitive to regime accuracy' },
  inside_bar_reversal: { dependency: 'HIGH', description: 'Inside bar pattern needs stable context for validation' },
};

export const INFLUENCE_RULES: Record<RegimeStability, Record<StrategyDependency, number>> = {
  STABLE: {
    HIGH: 1.0,
    MEDIUM: 1.0,
    LOW: 1.0,
  },
  TRANSITION: {
    HIGH: 0.30,
    MEDIUM: 0.60,
    LOW: 1.0,
  },
  UNSTABLE: {
    HIGH: 0.0,
    MEDIUM: 0.20,
    LOW: 0.60,
  },
};

export function getStrategyDependency(strategy: string): StrategyDependency {
  const normalized = strategy.toLowerCase().replace(/-/g, '_');
  return STRATEGY_GOVERNANCE[normalized] ?? 'HIGH';
}

export function getGovernanceMultiplier(stability: RegimeStability, dependency: StrategyDependency): number {
  return INFLUENCE_RULES[stability][dependency];
}

export function isExecutionBlocked(stability: RegimeStability, dependency: StrategyDependency): boolean {
  return getGovernanceMultiplier(stability, dependency) === 0;
}

export function getGovernanceProfile(strategy: string): StrategyGovernanceProfile {
  const normalized = strategy.toLowerCase().replace(/-/g, '_');
  return STRATEGY_GOVERNANCE_PROFILES[normalized] ?? {
    dependency: 'HIGH',
    description: 'Unknown strategy - defaulting to HIGH dependency (fail-safe)',
  };
}
