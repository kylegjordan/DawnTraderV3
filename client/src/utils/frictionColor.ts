/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.4B — Friction Color Utility (M25 Governance Invariant)
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Provides consistent color coding for Market Friction columns across all tables.
 * 
 * Thresholds:
 * - 0-20:   High Liquidity (Green)
 * - 21-50:  Normal Liquidity (Yellow)
 * - 51-80:  Stressed Liquidity (Orange)
 * - 81-100: Frozen/Illiquid (Red)
 * 
 * Schema Version: v1.6.2
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

export function getRegimeBadgeClassName(regime: string): string {
  if (regime.includes('BULL_STABLE')) return 'bg-green-500/20 text-green-600 border-green-500/30';
  if (regime.includes('BULL_VOLATILE')) return 'bg-emerald-500/20 text-emerald-600 border-emerald-500/30';
  if (regime.includes('BEAR_STABLE')) return 'bg-red-500/20 text-red-600 border-red-500/30';
  if (regime.includes('BEAR_VOLATILE')) return 'bg-rose-500/20 text-rose-600 border-rose-500/30';
  if (regime === 'EXTREME_NOISE') return 'bg-red-600/30 text-red-700 border-red-600/50';
  if (regime === 'LOW_VOL_CHOP') return 'bg-yellow-500/20 text-yellow-700 border-yellow-500/30';
  if (regime === 'HIGH_VOL_CHOP') return 'bg-orange-500/20 text-orange-700 border-orange-500/30';
  if (regime === 'MIXED_TRANSITION') return 'bg-purple-500/20 text-purple-700 border-purple-500/30';
  return 'bg-gray-500/20 text-gray-600 border-gray-500/30';
}

export function formatRegimeTitle(regime: string): string {
  return regime.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
