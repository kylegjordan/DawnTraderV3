/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.7R-E — Strategy Eligibility Hard Filter
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * AUTHORITATIVE function for determining if a strategy can be scored/executed.
 * 
 * This function MUST be called BEFORE scoring, not after.
 * Governance is a HARD EXCLUSION FILTER, not a post-score modifier.
 * 
 * If a strategy is not eligible:
 * - ❌ Never scored
 * - ❌ Never ranked
 * - ❌ Never generates a virtual trade
 * - ❌ Never creates an execution intent
 * 
 * Schema Version: governance/v1.1 (11.7R-E)
 * ══════════════════════════════════════════════════════════════════════════════
 */

import type { RegimeStability, StrategyDependency } from '../../config/strategy-governance.js';
import { getStrategyDependency } from '../../config/strategy-governance.js';

export interface GovernanceBlockLog {
  resultType: 'BLOCKED_GOVERNANCE';
  reason: 'UNSTABLE_REGIME';
  strategy: string;
  stability: RegimeStability;
  dependency: StrategyDependency;
  timestamp: number;
}

let preScoreExclusions = 0;
let lastResetTimestamp = Date.now();

/**
 * AUTHORITATIVE eligibility function.
 * 
 * Must be used everywhere strategy selection occurs.
 * 
 * @param strategy - Strategy name (snake_case)
 * @param stability - Current regime stability
 * @param dependency - Strategy's dependency level (optional, will be looked up if not provided)
 * @returns true if strategy can proceed to scoring, false if blocked
 */
export function isStrategyEligible(
  strategy: string,
  stability: RegimeStability,
  dependency?: StrategyDependency
): boolean {
  const dep = dependency ?? getStrategyDependency(strategy);
  
  if (stability === 'UNSTABLE' && dep === 'HIGH') {
    return false;
  }
  
  return true;
}

/**
 * Log a governance block event for a signal.
 * Called when a signal is filtered out before scoring.
 */
export function logGovernanceBlock(
  signal: { strategy: string; pair?: string; symbol?: string },
  stability: RegimeStability
): GovernanceBlockLog {
  const dependency = getStrategyDependency(signal.strategy);
  
  const log: GovernanceBlockLog = {
    resultType: 'BLOCKED_GOVERNANCE',
    reason: 'UNSTABLE_REGIME',
    strategy: signal.strategy,
    stability,
    dependency,
    timestamp: Date.now(),
  };
  
  preScoreExclusions++;
  
  console.log(
    `[11.7R-E][GOVERNANCE] BLOCKED_GOVERNANCE: ${signal.strategy} ` +
    `(${signal.pair || signal.symbol || 'unknown'}) - ${stability} regime, ${dependency} dependency`
  );
  
  return log;
}

/**
 * Get count of strategies excluded before scoring.
 * Used for UI metric "Strategies Excluded Pre-Scoring".
 */
export function getPreScoreExclusionCount(): number {
  return preScoreExclusions;
}

/**
 * Get pre-score exclusion stats for API/UI.
 */
export function getPreScoreExclusionStats(): {
  excluded: number;
  since: number;
  sinceFormatted: string;
} {
  const elapsed = Date.now() - lastResetTimestamp;
  const hours = Math.floor(elapsed / (1000 * 60 * 60));
  const minutes = Math.floor((elapsed % (1000 * 60 * 60)) / (1000 * 60));
  
  return {
    excluded: preScoreExclusions,
    since: lastResetTimestamp,
    sinceFormatted: hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`,
  };
}

/**
 * Reset exclusion counter (for testing or daily reset).
 */
export function resetPreScoreExclusionCount(): void {
  preScoreExclusions = 0;
  lastResetTimestamp = Date.now();
}

/**
 * Filter signals by governance eligibility BEFORE scoring.
 * 
 * This is the primary enforcement point for 11.7R-E.
 * Must be called after deterministic filters but BEFORE any scoring logic.
 * 
 * @param signals - Array of signals to filter
 * @param stability - Current regime stability
 * @returns Filtered array of eligible signals
 */
export function filterByGovernanceEligibility<T extends { strategy: string; pair?: string; symbol?: string }>(
  signals: T[],
  stability: RegimeStability
): T[] {
  return signals.filter(signal => {
    const dependency = getStrategyDependency(signal.strategy);
    const eligible = isStrategyEligible(signal.strategy, stability, dependency);
    
    if (!eligible) {
      logGovernanceBlock(signal, stability);
    }
    
    return eligible;
  });
}
