/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.4H.6A Task 1 — Canonical Strategy Mapper
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Purpose: Provides regime-based strategy and signal type recommendations.
 * This is the single source of truth for favored strategies/signals per regime.
 * 
 * ══════════════════════════════════════════════════════════════════════════════
 */

export function getFavoredStrategiesForRegime(regime: string): string[] {
  switch (regime) {
    case "BULL_STABLE":
      return ["SMA Trend Ride", "VWAP Pullback", "Morning Star / Evening Star"];
    case "BULL_VOLATILE":
      return ["Momentum Breakout", "Volatility Expansion", "Quick Scalp"];
    case "BEAR_STABLE":
      return ["Support Bounce", "Oversold Reversal", "Counter-Trend"];
    case "BEAR_VOLATILE":
      return ["Breakdown Pullback", "Counter-Reversal", "Fast Exit Short"];
    case "LOW_VOL_CHOP":
      return ["Range Trade", "Support Bounce", "Mean Reversion"];
    case "HIGH_VOL_CHOP":
      return ["Volatility Compression", "Dynamic Range Play"];
    case "HIGH_VOL_IMPULSE":
      return ["Breakout", "Adaptive Flow", "VWAP Bounce"];
    case "TRANSITION":
    case "MIXED_TRANSITION":
      return ["Pivot Shift", "Morning Star / Evening Star"];
    case "EXTREME_NOISE":
      return ["Cash", "Wait"];
    default:
      return ["Range Trade"];
  }
}

export function getFavoredSignalTypesForRegime(regime: string): string[] {
  switch (regime) {
    case "BULL_STABLE":
    case "BEAR_VOLATILE":
      return ["Quantitative", "Pattern"];
    case "BULL_VOLATILE":
    case "BEAR_STABLE":
      return ["Pattern", "Hybrid"];
    case "LOW_VOL_CHOP":
    case "HIGH_VOL_IMPULSE":
      return ["Quantitative", "Hybrid"];
    case "HIGH_VOL_CHOP":
    case "TRANSITION":
    case "MIXED_TRANSITION":
      return ["Hybrid", "Pattern"];
    case "EXTREME_NOISE":
      return [];
    default:
      return ["Quantitative"];
  }
}
