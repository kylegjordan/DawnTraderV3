/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.4B — Friction & Regime Color Utilities (M25 Governance Invariant)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Provides consistent color coding for Market Friction columns across all tables.
 *
 * Phase 14 (Batch 15): Updated regime badge colors for new canonical names.
 *   TREND_FRIENDLY_STABLE, HIGH_VOLATILITY_UNSTABLE, RANGE_BOUND_STABLE,
 *   IMPULSE_EXPANSION, STRUCTURAL_TRANSITION
 *
 * Ghost regime names (BULL_VOLATILE, BEAR_STABLE, etc.) still handled via
 * includes() matching for backward compatibility with any stale data.
 *
 * Thresholds:
 * - 0-20:   High Liquidity (Green)
 * - 21-50:  Normal Liquidity (Yellow)
 * - 51-80:  Stressed Liquidity (Orange)
 * - 81-100: Frozen/Illiquid (Red)
 *
 * Schema Version: v2.0.0
 * ══════════════════════════════════════════════════════════════════════════════
 */

export type FrictionColor = 'green' | 'yellow' | 'orange' | 'red';

export interface FrictionColorClasses {
  text: string;
  bg: string;
  border: string;
  badge: string;
}

export function getFrictionColor(score: number): FrictionColor {
  if (score <= 20) return 'green';
  if (score <= 50) return 'yellow';
  if (score <= 80) return 'orange';
  return 'red';
}

export function getFrictionColorClasses(score: number): FrictionColorClasses {
  if (score <= 20) {
    return {
      text: 'text-green-600',
      bg: 'bg-green-50',
      border: 'border-green-200',
      badge: 'bg-green-500/20 text-green-600 border-green-500/30',
    };
  }
  if (score <= 50) {
    return {
      text: 'text-yellow-700',
      bg: 'bg-yellow-50',
      border: 'border-yellow-200',
      badge: 'bg-yellow-500/20 text-yellow-700 border-yellow-500/30',
    };
  }
  if (score <= 80) {
    return {
      text: 'text-orange-700',
      bg: 'bg-orange-50',
      border: 'border-orange-200',
      badge: 'bg-orange-500/20 text-orange-700 border-orange-500/30',
    };
  }
  return {
    text: 'text-red-700',
    bg: 'bg-red-50',
    border: 'border-red-200',
    badge: 'bg-red-500/20 text-red-700 border-red-500/30',
  };
}

export function getFrictionCellClassName(score: number): string {
  const colors = getFrictionColorClasses(score);
  return `${colors.text} ${colors.bg} px-2 py-1 rounded`;
}

export function getFrictionBadgeClassName(score: number): string {
  return getFrictionColorClasses(score).badge;
}

export function getFrictionLabel(score: number): string {
  if (score <= 20) return `${score}: High Liquidity`;
  if (score <= 50) return `${score}: Normal Liquidity`;
  if (score <= 80) return `${score}: Stressed Liquidity`;
  return `${score}: Frozen / Illiquid`;
}

/**
 * Get CSS badge class name for a regime.
 * Phase 14: Updated to use new canonical regime names as primary matches.
 * Old names still handled via includes() for backward compatibility.
 */
export function getRegimeBadgeClassName(regime: string): string {
  // Phase 14 canonical names (primary)
  if (regime === 'TREND_FRIENDLY_STABLE')      return 'bg-green-500/20 text-green-600 border-green-500/30';
  if (regime === 'HIGH_VOLATILITY_UNSTABLE')    return 'bg-rose-500/20 text-rose-600 border-rose-500/30';
  if (regime === 'RANGE_BOUND_STABLE')          return 'bg-yellow-500/20 text-yellow-700 border-yellow-500/30';
  if (regime === 'IMPULSE_EXPANSION')           return 'bg-emerald-500/20 text-emerald-600 border-emerald-500/30';
  if (regime === 'STRUCTURAL_TRANSITION')       return 'bg-purple-500/20 text-purple-700 border-purple-500/30';

  // Legacy ghost regimes (backward compat for stale data in UI)
  if (regime.includes('BULL_STABLE'))           return 'bg-green-500/20 text-green-600 border-green-500/30';
  if (regime.includes('BULL_VOLATILE'))          return 'bg-emerald-500/20 text-emerald-600 border-emerald-500/30';
  if (regime.includes('BEAR_STABLE'))           return 'bg-red-500/20 text-red-600 border-red-500/30';
  if (regime.includes('BEAR_VOLATILE'))          return 'bg-rose-500/20 text-rose-600 border-rose-500/30';
  if (regime === 'EXTREME_NOISE')               return 'bg-red-600/30 text-red-700 border-red-600/50';
  if (regime === 'LOW_VOL_CHOP')                return 'bg-yellow-500/20 text-yellow-700 border-yellow-500/30';
  if (regime === 'HIGH_VOL_CHOP')               return 'bg-orange-500/20 text-orange-700 border-orange-500/30';
  if (regime === 'HIGH_VOL_IMPULSE')            return 'bg-emerald-500/20 text-emerald-600 border-emerald-500/30';
  if (regime === 'MIXED_TRANSITION' || regime === 'TRANSITION') return 'bg-purple-500/20 text-purple-700 border-purple-500/30';

  // Default fallback
  return 'bg-gray-500/20 text-gray-600 border-gray-500/30';
}

/**
 * Format a regime name for display (underscore → space, title case).
 */
export function formatRegimeTitle(regime: string): string {
  return regime.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
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
    case 'UP_STRONG':      return 'bg-green-500/20 text-green-600 border-green-500/30';
    case 'UP_MODERATE':    return 'bg-green-500/15 text-green-500 border-green-500/25';
    case 'UP_WEAK':        return 'bg-yellow-500/15 text-yellow-600 border-yellow-500/25';
    case 'NEUTRAL':        return 'bg-gray-500/15 text-gray-500 border-gray-500/25';
    case 'DOWN_WEAK':      return 'bg-yellow-500/20 text-yellow-700 border-yellow-500/30';
    case 'DOWN_MODERATE':  return 'bg-orange-500/20 text-orange-600 border-orange-500/30';
    case 'DOWN_STRONG':    return 'bg-red-500/20 text-red-600 border-red-500/30';
    default:               return 'bg-gray-500/15 text-gray-500 border-gray-500/25';
  }
}
