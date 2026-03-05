/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Friction & Regime Color Utilities
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Phase 14 (Batch 15): Updated regime badge colors for new canonical names.
 *   TREND_FRIENDLY_STABLE, HIGH_VOLATILITY_UNSTABLE, RANGE_BOUND_STABLE,
 *   IMPULSE_EXPANSION, STRUCTURAL_TRANSITION
 *
 * Ghost regime names (BULL_VOLATILE, BEAR_STABLE, etc.) still handled via
 * includes() matching for backward compatibility with any stale data.
 *
 * Governance Invariants:
 * - M25: Friction thresholds (0-20 green, 21-50 yellow, 51-80 orange, 81-100 red)
 * ══════════════════════════════════════════════════════════════════════════════
 */

export type FrictionColor = 'green' | 'yellow' | 'orange' | 'red';

/**
 * Get color for a friction score (M25 Governance Invariant).
 */
export function getFrictionColor(score: number): FrictionColor {
  if (score <= 20) return 'green';
  if (score <= 50) return 'yellow';
  if (score <= 80) return 'orange';
  return 'red';
}

/**
 * Get CSS badge class name for a regime.
 * Phase 14: Updated to use new canonical regime names as primary matches.
 * Old names still handled via includes() for backward compatibility.
 */
export function getRegimeBadgeClassName(regime: string): string {
  // Phase 14 canonical names (primary)
  if (regime === 'TREND_FRIENDLY_STABLE')      return 'bg-green-500/20 text-green-600 border border-green-500/30';
  if (regime === 'HIGH_VOLATILITY_UNSTABLE')    return 'bg-rose-500/20 text-rose-600 border border-rose-500/30';
  if (regime === 'RANGE_BOUND_STABLE')          return 'bg-yellow-500/20 text-yellow-700 border border-yellow-500/30';
  if (regime === 'IMPULSE_EXPANSION')           return 'bg-emerald-500/20 text-emerald-600 border border-emerald-500/30';
  if (regime === 'STRUCTURAL_TRANSITION')       return 'bg-purple-500/20 text-purple-700 border border-purple-500/30';

  // Legacy ghost regimes (backward compat for stale data in UI)
  if (regime.includes('BULL_STABLE'))           return 'bg-green-500/20 text-green-600 border border-green-500/30';
  if (regime.includes('BULL_VOLATILE'))          return 'bg-emerald-500/20 text-emerald-600 border border-emerald-500/30';
  if (regime.includes('BEAR_STABLE'))           return 'bg-red-500/20 text-red-600 border border-red-500/30';
  if (regime.includes('BEAR_VOLATILE'))          return 'bg-rose-500/20 text-rose-600 border border-rose-500/30';
  if (regime === 'EXTREME_NOISE')               return 'bg-red-600/30 text-red-700 border border-red-600/30';
  if (regime === 'LOW_VOL_CHOP')                return 'bg-yellow-500/20 text-yellow-700 border border-yellow-500/30';
  if (regime === 'HIGH_VOL_CHOP')               return 'bg-orange-500/20 text-orange-700 border border-orange-500/30';
  if (regime === 'HIGH_VOL_IMPULSE')            return 'bg-emerald-500/20 text-emerald-600 border border-emerald-500/30';
  if (regime === 'MIXED_TRANSITION' || regime === 'TRANSITION') return 'bg-purple-500/20 text-purple-700 border border-purple-500/30';

  // Default fallback
  return 'bg-gray-500/20 text-gray-600 border border-gray-500/30';
}

/**
 * Phase 14: Get color for directional bias category.
 */
export function getDirectionalBiasColor(category: string): string {
  switch (category) {
    case 'UP_STRONG':      return 'text-green-500';
    case 'UP_MODERATE':    return 'text-green-400';
    case 'UP_WEAK':        return 'text-yellow-400';
    case 'NEUTRAL':        return 'text-gray-400';
    case 'DOWN_WEAK':      return 'text-yellow-500';
    case 'DOWN_MODERATE':  return 'text-orange-500';
    case 'DOWN_STRONG':    return 'text-red-500';
    default:               return 'text-gray-400';
  }
}

/**
 * Phase 14: Get badge class for directional bias category.
 */
export function getDirectionalBiasBadgeClassName(category: string): string {
  switch (category) {
    case 'UP_STRONG':      return 'bg-green-500/20 text-green-600 border border-green-500/30';
    case 'UP_MODERATE':    return 'bg-green-500/15 text-green-500 border border-green-500/25';
    case 'UP_WEAK':        return 'bg-yellow-500/15 text-yellow-600 border border-yellow-500/25';
    case 'NEUTRAL':        return 'bg-gray-500/15 text-gray-500 border border-gray-500/25';
    case 'DOWN_WEAK':      return 'bg-yellow-500/20 text-yellow-700 border border-yellow-500/30';
    case 'DOWN_MODERATE':  return 'bg-orange-500/20 text-orange-600 border border-orange-500/30';
    case 'DOWN_STRONG':    return 'bg-red-500/20 text-red-600 border border-red-500/30';
    default:               return 'bg-gray-500/15 text-gray-500 border border-gray-500/25';
  }
}
