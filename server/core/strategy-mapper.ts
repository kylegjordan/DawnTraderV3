/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.4H.6A Task 1 — Canonical Strategy Mapper
 * Directive 11.4H.6F — Long-Only Strategy Mapping Correction
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Purpose: Provides regime-based strategy and signal type recommendations.
 * This is the single source of truth for favored strategies/signals per regime.
 * 
 * Governance: All strategies must be long-only compatible. No short-selling or 
 * sell-biased strategy names are permitted (enforced by audit check).
 * 
 * ══════════════════════════════════════════════════════════════════════════════
 */

/**
 * Directive 11.4H.6F Task 2: Audit check for invalid short-biased strategies
 * Validates that no strategy names contain short or sell references
 */
function auditStrategiesForLongOnly(strategies: string[], regime: string): void {
  const invalids = strategies.filter(s => /short|sell/i.test(s));
  if (invalids.length) {
    console.warn(`[11.4H.6F][Audit] Found invalid short-biased strategies for ${regime}: ${invalids.join(", ")}`);
  }
}

export function getFavoredStrategiesForRegime(regime: string): string[] {
  let strategies: string[];
  
  switch (regime) {
    case "BULL_STABLE":
      strategies = ["SMA Trend Ride", "VWAP Pullback", "Morning Star / Evening Star"];
      break;
    case "BULL_VOLATILE":
      strategies = ["Momentum Breakout", "Volatility Expansion", "Quick Scalp"];
      break;
    case "BEAR_STABLE":
      strategies = ["Support Bounce", "Oversold Reversal", "Counter-Trend"];
      break;
    case "BEAR_VOLATILE":
      // Long-only compatible defensive strategies
      strategies = ["Breakdown Pullback", "Counter-Reversal", "Defensive Exit"];
      break;
    case "LOW_VOL_CHOP":
      strategies = ["Range Trade", "Support Bounce", "Mean Reversion"];
      break;
    case "HIGH_VOL_CHOP":
      strategies = ["Volatility Compression", "Dynamic Range Play"];
      break;
    case "HIGH_VOL_IMPULSE":
      strategies = ["Breakout", "Adaptive Flow", "VWAP Bounce"];
      break;
    case "TRANSITION":
    case "MIXED_TRANSITION":
      strategies = ["Pivot Shift", "Morning Star / Evening Star"];
      break;
    case "EXTREME_NOISE":
      strategies = ["Cash", "Wait"];
      break;
    default:
      strategies = ["Range Trade"];
  }
  
  // Directive 11.4H.6F Task 2: Audit for invalid short-biased strategies
  auditStrategiesForLongOnly(strategies, regime);
  
  return strategies;
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
