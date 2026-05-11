/**
 * ════════════════════════════════════════════════════════════════════════════
 * B79.0m.b2 — Per-lane strategy eligibility (extracted for testability)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Extracted from `eval-cycle.ts` per Langston Step 4 nit #1 — a unit test can
 * import the production function directly without pulling in the full eval-
 * cycle dependency graph (MCE, vts-runner, pattern-filter, etc.).
 *
 * Mirrors crypto's `fx5-scanner.ts:1607-1643` lane semantics:
 *   - quant-${family} lane → strategies whose primary STRATEGY_FAMILY_MAP
 *                            matches OR hybrid-eligible (HYBRID_FAMILY_ELIGIBILITY)
 *                            OR multi-family-eligible (MULTI_FAMILY_ELIGIBILITY).
 *   - pattern lane         → strategies whose STRATEGY_FAMILY_MAP === 'pattern'.
 * ════════════════════════════════════════════════════════════════════════════
 */

import {
  STRATEGY_FAMILY_MAP,
  HYBRID_FAMILY_ELIGIBILITY,
  MULTI_FAMILY_ELIGIBILITY,
  type StrategyFamily,
} from '../../config/canonical-regime-strategy-map.js';

/** A single fan-out lane — either a quant-family lane or the pattern lane. */
export type EvalLane =
  | { kind: 'family'; family: StrategyFamily; sourcePool: string }
  | { kind: 'pattern'; sourcePool: 'pattern' };

/**
 * Returns true iff `strategyKey` should fire on the given `lane`.
 *
 * Family lane:
 *   - Primary family match (`STRATEGY_FAMILY_MAP[s] === lane.family`)
 *   - OR `HYBRID_FAMILY_ELIGIBILITY[s]` includes `lane.family`
 *   - OR `MULTI_FAMILY_ELIGIBILITY[s]` includes `lane.family`
 *   - Pattern-only strategies do NOT fire in family lanes.
 *
 * Pattern lane:
 *   - ONLY strategies whose `STRATEGY_FAMILY_MAP[s] === 'pattern'`.
 *   - Hybrid + family + quant strategies do NOT fire in the pattern lane.
 */
export function isStrategyEligibleForLane(strategyKey: string, lane: EvalLane): boolean {
  const stratFamily = STRATEGY_FAMILY_MAP[strategyKey];
  if (lane.kind === 'pattern') {
    return stratFamily === 'pattern';
  }
  // lane.kind === 'family'
  if (stratFamily === 'pattern') return false;
  if (stratFamily === 'hybrid') {
    const parentFams = HYBRID_FAMILY_ELIGIBILITY[strategyKey] ?? [];
    return parentFams.includes(lane.family);
  }
  if (stratFamily === lane.family) return true;
  const additionalFams = MULTI_FAMILY_ELIGIBILITY[strategyKey] ?? [];
  return additionalFams.includes(lane.family);
}
