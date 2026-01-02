/**
 * Directive 9.6.A - Configuration Lock
 * 
 * Single source of truth for all Phase 9 threshold constants.
 * All Phase 9 modules (filter-engine, cwqi-service, analysis-utils, etc.)
 * MUST import from this file to prevent configuration drift.
 * 
 * Tags: [9.6][CONFIG]
 */

export const SYSTEM_GUARDS = {
  VERSION: "Phase10_DSS",
  
  MIN_LIQUIDITY_SCORE: 40,
  MAX_VOL_NOISE: 0.6,
  BASE_FEE_SLIPPAGE: 0.005,
  CORRELATION_THRESHOLD: 0.75,
  PARITY_TOLERANCE: 0.000001,
  
  DI_TRENDING: 65,
  DI_CHOPPY: 30,
  
  MIN_PWIN: 0.40,
  MAX_PWIN: 0.60,
  DI_PWIN_FACTOR: 200,

  REGIME_THRESHOLDS: {
    VOL_LOW: 0.3,
    TREND_POSITIVE: 0.05,
  },

  STRATEGY_MAP: {
    BULL_STABLE: ['vwap_pullback', 'vwap_bounce', 'sma_trend_ride', 'abcd_long', 'dhma'],
    BULL_VOLATILE: ['breakout', 'sma_trend_ride', 'liquidity_trap'],
    BEAR_STABLE: ['mean_reversion', 'range_trading'],
    BEAR_VOLATILE: ['mean_reversion', 'liquidity_trap'],
    LOW_VOL_CHOP: ['mean_reversion', 'range_trading'],
  },
} as const;

export type SystemGuardsType = typeof SYSTEM_GUARDS;

export function getSystemGuardsInfo(): string {
  return `[9.6][CONFIG] Guards Locked – LQ≥${SYSTEM_GUARDS.MIN_LIQUIDITY_SCORE}, Noise≤${SYSTEM_GUARDS.MAX_VOL_NOISE}, Fee=${(SYSTEM_GUARDS.BASE_FEE_SLIPPAGE * 100).toFixed(1)}%`;
}

console.log(getSystemGuardsInfo());
