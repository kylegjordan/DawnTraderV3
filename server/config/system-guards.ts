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
  VERSION: "Phase14_HF9",
  
  MIN_LIQUIDITY_SCORE: 40,
  MAX_VOL_NOISE: 0.6,
  BASE_FEE_SLIPPAGE: 0.005,
  CORRELATION_THRESHOLD: 0.75,
  PARITY_TOLERANCE: 0.000001,
  MIN_VOLUME_THRESHOLD_USD: 2_000_000,
  
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
    TREND_FRIENDLY_STABLE: ['vwap_pullback', 'vwap_bounce', 'sma_trend_ride', 'abcd_long', 'dhma'],
    IMPULSE_EXPANSION: ['breakout', 'sma_trend_ride', 'liquidity_trap'],
    HIGH_VOLATILITY_UNSTABLE: ['mean_reversion', 'range_trading'],
    RANGE_BOUND_STABLE: ['mean_reversion', 'range_trading'],
    STRUCTURAL_TRANSITION: ['mean_reversion', 'liquidity_trap'],
  },
} as const;

/**
 * Directive 11.7H — IMF (Institutional Math Filters) Thresholds
 * 
 * Schema: metrics-calibration/v1.2
 * 
 * Centralized thresholds for passive learning mode IMF filtering.
 * Used by imf-metrics.ts for OHLC-based pair qualification.
 * 
 * VN_MAX = 0.8 allows broader passive learning data collection
 * while active trading uses stricter SYSTEM_GUARDS.MAX_VOL_NOISE = 0.6
 */
export const IMF_THRESHOLDS = {
  LQ_MIN: 40,           // Minimum log-liquidity score
  VN_MAX: 0.80,         // Maximum volatility noise (passive learning)
  CORR_MAX: 0.95,       // Maximum correlation with benchmark
} as const;

export type IMFThresholdsType = typeof IMF_THRESHOLDS;

/**
 * HF9 Item D: VTS-specific IMF thresholds (relaxed for ML training data collection)
 *
 * These looser thresholds allow more pairs into the VTS pipeline while active
 * trading continues using strict SYSTEM_GUARDS thresholds. Trades from pairs
 * that only pass relaxed filters are tagged with filterTier='relaxed' so ML
 * can analyze their performance separately.
 *
 * Active Trading: LQ >= 40, VN <= 0.60, rho <= 0.75 (SYSTEM_GUARDS)
 * VTS Learning:   LQ >= 25, VN <= 0.95, rho <= 0.95 (VTS_IMF_THRESHOLDS)
 *
 * Note (Batch 18E): VN_MAX raised from 0.80 to 0.95. Market data shows most
 * non-benchmark pairs produce VN=0.82-1.00 on 60-min candles (partly due to
 * short ticker-based price history feeding into VN calculations). At 0.80,
 * the relaxed threshold matched the passive learning strict threshold
 * (IMF_THRESHOLDS.VN_MAX), capturing zero additional pairs. At 0.95, pairs
 * with VN between 0.80-0.95 enter VTS tagged filterTier='relaxed' for ML
 * segmentation.
 */
export const VTS_IMF_THRESHOLDS = {
  LQ_MIN: 25,
  VN_MAX: 0.95,
  CORR_MAX: 0.95,
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

/**
 * Directive 10.7 — Multi-Timeframe Expansion (Fractal Vision)
 * 
 * Enables cascading multi-timeframe scanning (1H → 15m → 5m)
 * with token-bucket rate limiting for Kraken API safety.
 */
export const TIMEFRAME_CONFIG = {
  INTERVALS: {
    GLOBAL: '1h' as const,      // Trend context layer
    TACTICAL: '15m' as const,   // Pattern setup layer
    PRECISION: '5m' as const,   // Entry confirmation layer
  },
  ENABLED: {
    GLOBAL: true,
    TACTICAL: true,
    PRECISION: true,
  },
  CASCADE: {
    ENABLED: true,
    MAX_CHILD_INTERVALS: 2,     // Restrict cascade depth
    WINDOW_SYNC: true,          // Keep timeframe alignment
  },
  RATE_LIMITS: {
    MAX_REQ_PER_SEC: 10,        // Kraken hard limit
    SAFETY_MARGIN: 0.8,         // 80% utilization ceiling
  },
  CASCADE_CRITERIA: {
    REGIME_WEIGHT_MIN: 0.5,     // 1H → 15m cascade threshold
    PATTERN_STRENGTH_MIN: 0.6,  // 15m → 5m cascade threshold
  },
} as const;

/**
 * Directive 10.7: Candle interval durations in milliseconds
 * Used for decay calculation and timeframe-aware operations.
 */
export const CANDLE_INTERVALS_MS = {
  '1h': 3600000,
  '15m': 900000,
  '5m': 300000,
} as const;

/**
 * Directive 10.7: Timeframe-specific pattern strength weights.
 * Higher timeframes carry more weight in signal scoring.
 */
export const TIMEFRAME_WEIGHTS = {
  '1h': 1.0,
  '15m': 0.8,
  '5m': 0.6,
} as const;

export type TimeframeConfigType = typeof TIMEFRAME_CONFIG;

/**
 * Directive 10.8 — Adaptive Scanning Intelligence (Dual-Pool Scheduler)
 * 
 * Replaces static Tier A/B universe logic with a learning-driven,
 * telemetry-based adaptive pair selection system.
 */
/**
 * Directive 10.9B — Filter Deconfliction Feature Flags
 * 
 * Controls deprecated filter visibility without deleting UI components.
 * Set to false to disable deprecated Risk/Volatility and RSI filters.
 */
export const FILTER_FLAGS = {
  LEGACY_FILTERS_ENABLED: false,    // Deprecated Risk/Volatility/RSI filters (backend removed, UI stubs only)
  INSTITUTIONAL_MATH_ENABLED: true, // Pre-signal LQ, VolNoise, Correlation guards
} as const;

/**
 * Directive 10.9F — Filter Schema Versioning
 * 
 * Tracks filter telemetry schema for auditability.
 * v1.1.0 - Initial 10.9B release
 * v1.2.0 - 10.9C: Rolling 24h window, deprecated RSI/Risk/CWQI, added ρ guard
 * v1.3.0 - 10.9E: Full RSI/Risk/Volatility removal, telemetry expansion
 * v1.3.1 - 10.9F: Quote Currency filter removed, "Execution Quality" rename
 */
export const FILTER_SCHEMA_VERSION = "v1.3.1";

export const SCANNER_PARAMS = {
  ADAPTIVE_ENABLED: true,           // Master feature flag for adaptive scanning
  DUAL_POOL: {
    IDEAL_RATIO: 0.6,               // 60% of pairs from "Ideal" (top performers)
    ROTATIONAL_RATIO: 0.4,          // 40% of pairs from "Rotational" (exploration)
  },
  FAILURE_TRACKING: {
    COOLDOWN_MS: 600000,            // 10-minute cooldown for failed pairs
    MAX_FAILURES: 3,                // Max failures before extended cooldown
    EXTENDED_COOLDOWN_MS: 1800000,  // 30-minute extended cooldown
  },
  TELEMETRY: {
    SCORE_WEIGHTS: {
      FINAL_SCORE: 0.4,             // Weight for FinalScore in ranking
      HYBRID_SCORE: 0.3,            // Weight for HybridScore
      REGIME_WEIGHT: 0.2,           // Weight for RegimeWeight
      PREDICTIVE_CONF: 0.1,         // Weight for ML Predictive Confidence
    },
    HISTORY_WINDOW_MS: 86400000,    // 24-hour history for telemetry
    MIN_SAMPLES: 3,                 // Minimum samples for reliable ranking
  },
  BATCH_SIZE: 300,                  // Total pairs per scan batch (Batch 18: increased from 100)
} as const;

export type ScannerParamsType = typeof SCANNER_PARAMS;

export type SystemGuardsType = typeof SYSTEM_GUARDS;

export function getSystemGuardsInfo(): string {
  return `[9.6][CONFIG] Guards Locked – LQ≥${SYSTEM_GUARDS.MIN_LIQUIDITY_SCORE}, Noise≤${SYSTEM_GUARDS.MAX_VOL_NOISE}, Fee=${(SYSTEM_GUARDS.BASE_FEE_SLIPPAGE * 100).toFixed(1)}%`;
}

console.log(getSystemGuardsInfo());
