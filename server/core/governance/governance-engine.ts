/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.7R — Governance Engine
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Central governance layer that protects the system during regime transitions.
 * 
 * Execution Order (MANDATORY):
 * 1. Signal generated
 * 2. Regime detected
 * 3. Global regime stability classified
 * 4. Core deterministic filters (ROI/EV, Duplicate/cooldown)
 * 5. GOVERNANCE APPLIED ← This engine
 * 6. Scoring & ranking
 * 7. Execution or skip
 * 8. Learning attribution
 * 
 * Governance constrains influence, not data collection.
 * 
 * Schema Version: governance/v1.0
 * ══════════════════════════════════════════════════════════════════════════════
 */

import {
  getStrategyDependency,
  getGovernanceMultiplier,
  isExecutionBlocked,
  getGovernanceProfile,
  type RegimeStability,
  type StrategyDependency,
} from '../../config/strategy-governance.js';

import {
  computeGlobalStability,
  getCachedStability,
  recordRegimeChange,
  getStabilityState,
  type StabilityClassification,
} from './regime-stability.js';

export type GovernanceResultType = 
  | 'ALLOWED'
  | 'THROTTLED'
  | 'BLOCKED_GOVERNANCE';

export interface GovernanceDecision {
  resultType: GovernanceResultType;
  strategy: string;
  dependency: StrategyDependency;
  stability: RegimeStability;
  influenceMultiplier: number;
  reason: string;
  originalScore?: number;
  adjustedScore?: number;
  blockedReason?: string;
}

export interface GovernanceContext {
  symbol: string;
  strategy: string;
  regime: string;
  finalScore: number;
  driftScore: number;
  volZ: number;
  regimeConfidence: number;
  cycleId: string;
}

let governanceStats = {
  allowed: 0,
  throttled: 0,
  blocked: 0,
  lastReset: Date.now(),
};

export function applyGovernance(context: GovernanceContext): GovernanceDecision {
  const { symbol, strategy, regime, finalScore, driftScore, volZ, regimeConfidence, cycleId } = context;
  
  recordRegimeChange(regime);
  
  let stabilityClassification = getCachedStability();
  if (!stabilityClassification || stabilityClassification.cycleId !== cycleId) {
    stabilityClassification = computeGlobalStability(driftScore, volZ, regimeConfidence);
  }
  
  const stability = stabilityClassification.stability;
  const dependency = getStrategyDependency(strategy);
  const multiplier = getGovernanceMultiplier(stability, dependency);
  const blocked = isExecutionBlocked(stability, dependency);
  const profile = getGovernanceProfile(strategy);
  
  if (blocked) {
    governanceStats.blocked++;
    
    const decision: GovernanceDecision = {
      resultType: 'BLOCKED_GOVERNANCE',
      strategy,
      dependency,
      stability,
      influenceMultiplier: 0,
      reason: `${stability}_REGIME`,
      originalScore: finalScore,
      adjustedScore: 0,
      blockedReason: `Strategy ${strategy} (${dependency} dependency) blocked in ${stability} regime`,
    };
    
    console.log(`[11.7R][Governance] BLOCKED ${symbol}: ${strategy} (${dependency}) in ${stability} - ${stabilityClassification.reason}`);
    
    return decision;
  }
  
  if (multiplier < 1.0) {
    governanceStats.throttled++;
    
    const adjustedScore = finalScore * multiplier;
    
    const decision: GovernanceDecision = {
      resultType: 'THROTTLED',
      strategy,
      dependency,
      stability,
      influenceMultiplier: multiplier,
      reason: `Influence reduced to ${(multiplier * 100).toFixed(0)}% due to ${stability} regime`,
      originalScore: finalScore,
      adjustedScore,
    };
    
    console.log(`[11.7R][Governance] THROTTLED ${symbol}: ${strategy} (${dependency}) ${(multiplier * 100).toFixed(0)}% weight in ${stability}`);
    
    return decision;
  }
  
  governanceStats.allowed++;
  
  return {
    resultType: 'ALLOWED',
    strategy,
    dependency,
    stability,
    influenceMultiplier: 1.0,
    reason: 'Full influence allowed in STABLE regime',
    originalScore: finalScore,
    adjustedScore: finalScore,
  };
}

export function getGovernanceStats(): {
  allowed: number;
  throttled: number;
  blocked: number;
  totalDecisions: number;
  blockRate: number;
  throttleRate: number;
  lastReset: number;
} {
  const total = governanceStats.allowed + governanceStats.throttled + governanceStats.blocked;
  
  return {
    ...governanceStats,
    totalDecisions: total,
    blockRate: total > 0 ? governanceStats.blocked / total : 0,
    throttleRate: total > 0 ? governanceStats.throttled / total : 0,
  };
}

export function resetGovernanceStats(): void {
  governanceStats = {
    allowed: 0,
    throttled: 0,
    blocked: 0,
    lastReset: Date.now(),
  };
}

export function getGovernanceStateForUI(): {
  stability: RegimeStability | null;
  metrics: {
    driftScore: number;
    volZ: number;
    regimeConfidence: number;
    flipRate: number;
  } | null;
  reason: string;
  stats: ReturnType<typeof getGovernanceStats>;
  strategyMultipliers: Record<string, number>;
} {
  const stabilityState = getStabilityState();
  const stats = getGovernanceStats();
  
  const strategyMultipliers: Record<string, number> = {};
  
  if (stabilityState.stability) {
    const strategies = [
      'vwap_pullback', 'sma_trend_ride', 'range_trade', 'morning_star',
      'mean_reversion', 'pivot_shift', 'defensive_hedge', 'volatility_edge',
    ];
    
    for (const strategy of strategies) {
      const dependency = getStrategyDependency(strategy);
      strategyMultipliers[strategy] = getGovernanceMultiplier(stabilityState.stability, dependency);
    }
  }
  
  return {
    stability: stabilityState.stability,
    metrics: stabilityState.metrics,
    reason: stabilityState.reason,
    stats,
    strategyMultipliers,
  };
}

export { recordRegimeChange, getStabilityState, computeGlobalStability };
