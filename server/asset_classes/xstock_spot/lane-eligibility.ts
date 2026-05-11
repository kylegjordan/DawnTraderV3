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
 *   - **Pattern-family strategies ARE eligible in family lanes too** (Kyle
 *     directive 2026-05-11 evening — mirrors crypto, where pattern strategies
 *     fire across quant paths as well as the dedicated pattern pool). The
 *     scanPatterns()-derived patternInput is built per strategy regardless
 *     of lane; pattern strategies gate at detect-time on whether a matching
 *     pattern was detected. Net effect: a pair admitted to family lane(s) AND
 *     pattern lane runs pattern strategies on BOTH iteration paths, matching
 *     crypto's behavior where a pair in both pools produces duplicate VTS-
 *     batch entries.
 *
 * Pattern lane:
 *   - ONLY strategies whose `STRATEGY_FAMILY_MAP[s] === 'pattern'`.
 *   - Hybrid + family + quant strategies do NOT fire in the pattern lane.
 *     (Hybrid strategies fire on their family-eligibility lanes via the
 *     family-lane branch; they don't double-fire on the pattern lane.)
 */
export function isStrategyEligibleForLane(strategyKey: string, lane: EvalLane): boolean {
  const stratFamily = STRATEGY_FAMILY_MAP[strategyKey];
  if (lane.kind === 'pattern') {
    return stratFamily === 'pattern';
  }
  // lane.kind === 'family'
  // B79.0m.b2 followup (Kyle directive 2026-05-11 evening): pattern strategies
  // ARE eligible in family lanes. Was previously `return false` — too
  // restrictive vs. crypto's symbol-pool-union eligibility model.
  if (stratFamily === 'pattern') return true;
  if (stratFamily === 'hybrid') {
    const parentFams = HYBRID_FAMILY_ELIGIBILITY[strategyKey] ?? [];
    return parentFams.includes(lane.family);
  }
  if (stratFamily === lane.family) return true;
  const additionalFams = MULTI_FAMILY_ELIGIBILITY[strategyKey] ?? [];
  return additionalFams.includes(lane.family);
}
