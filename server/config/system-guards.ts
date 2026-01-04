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

/**
 * Directive 10.4 — Hybrid Integration Parameters
 * 
 * Runtime-tunable constants for ensemble scoring and confluence detection.
 * All hybrid logic MUST import these dynamically - no hardcoding.
 */
export const HYBRID_PARAMS = {
  MIN_SCORE: 0.65,              // Minimum ensemble score required for execution
  MAX_CONFLUENCE_WINDOW: 5,     // Maximum candle gap between Quant and Pattern signals
  // Candle interval for hybrid decay calculation (1 hour = 3600000ms)
  // Directive 10.6: Aligned with Signal Orchestrator's 1H scan interval.
  // Pattern signals persist appropriately between candle closes.
  CANDLE_INTERVAL_MS: 3600000,
  WEIGHTS: {
    QUANT: 0.4,
    PATTERN: 0.4,
    PREDICTIVE: 0.2,            // ML confidence weight (active in 10.6)
  },
  // Directive 10.5: Pattern Decay (Temporal Memory)
  DECAY: {
    ENABLED: true,              // Enable/disable pattern decay
    LAMBDA: 0.15,               // Decay rate per candle interval
    FLOOR: 0.3,                 // Minimum retained influence (30% of original)
  },
} as const;

export type HybridParamsType = typeof HYBRID_PARAMS;

export type SystemGuardsType = typeof SYSTEM_GUARDS;

export function getSystemGuardsInfo(): string {
  return `[9.6][CONFIG] Guards Locked – LQ≥${SYSTEM_GUARDS.MIN_LIQUIDITY_SCORE}, Noise≤${SYSTEM_GUARDS.MAX_VOL_NOISE}, Fee=${(SYSTEM_GUARDS.BASE_FEE_SLIPPAGE * 100).toFixed(1)}%`;
}

console.log(getSystemGuardsInfo());
