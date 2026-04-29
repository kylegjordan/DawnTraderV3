/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.0E.1 — Market Regime Type Definitions
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Canonical market regime types for pair-level regime classification.
 * Used by VTS Runner, Strategy Engine, and Telemetry systems.
 *
 * Phase 14 (Batch 15): Regime names updated to remove directional language.
 *
 * Schema: v2.0.0
 * Governance: M46 (Pair regime must be calculated each cycle)
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { REGIMES, type CanonicalRegimeType } from '../config/canonical-regime-strategy-map';

export type MarketRegimeType = CanonicalRegimeType;

export interface OHLCData {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
  vwap?: number; // Batch 50: Kraken OHLC index [5] — needed by detectABCDLong VWAP check
}

export interface RegimeCalculationResult {
  regime: MarketRegimeType;
  volatility: number;
  momentum: number;
  adx: number;
  confidence: number;
}

/**
 * B67.3.5 — TFS branch desaturation scales (resolved from module_constants).
 *
 * Replaces the prior step-function `confidence = 0.70 + bonuses` with a
 * continuous mapping `confidence = min + (max - min) × (mom_factor × dbs ×
 * vol_inv)`. All five values are tunable via DB; no hardcoded constants per
 * §0.9. See `BATCH_67_3_5_PRE_AUDIT.md` §B.2 for derivation.
 *
 * Caller (MCE) resolves these from module_constants on startup with hard-fail
 * on any missing key, then passes the object into `calculatePairRegime` per
 * tick. Same passthrough pattern used for `macroModifier` since B67.1.
 */
export interface RegimeConfig {
  tfsDesatMin: number;
  tfsDesatMax: number;
  tfsMomentumScale: number;
  tfsVolatilityScale: number;
  tfsDbsScale: number;
}

export const REGIME_WEIGHTS: Record<MarketRegimeType, number> = {
  [REGIMES.TREND_FRIENDLY_STABLE]: 0.85,
  [REGIMES.HIGH_VOLATILITY_UNSTABLE]: 0.40,
  [REGIMES.RANGE_BOUND_STABLE]: 0.55,
  [REGIMES.IMPULSE_EXPANSION]: 0.70,
  [REGIMES.STRUCTURAL_TRANSITION]: 0.50
};

export const REGIME_DESCRIPTIONS: Record<MarketRegimeType, string> = {
  [REGIMES.TREND_FRIENDLY_STABLE]: 'Orderly trending market with controlled volatility, ideal for momentum strategies',
  [REGIMES.HIGH_VOLATILITY_UNSTABLE]: 'High volatility with wide dispersion, defensive positioning recommended',
  [REGIMES.RANGE_BOUND_STABLE]: 'Sideways range-bound market, pattern-based strategies favored',
  [REGIMES.IMPULSE_EXPANSION]: 'High volatility with impulsive moves, quantitative edge strategies',
  [REGIMES.STRUCTURAL_TRANSITION]: 'Market regime shifting, hybrid strategies for uncertainty'
};
