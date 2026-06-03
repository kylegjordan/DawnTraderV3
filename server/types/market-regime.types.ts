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
  /**
   * B.4 foundation (2026-06-03) — per-asset-class TIME-ANCHORED regime
   * lookbacks. The classifier's momentum + ADX windows were hardcoded BAR
   * counts (30 / 14) that silently assumed a 60-minute bar (30h / 14h
   * wall-clock). At 15-minute bars those counts span a quarter of the time, so
   * the lookbacks are re-expressed per class to preserve the intended
   * wall-clock window. DEFAULT_REGIME_CONFIG carries the CRYPTO values (30 / 14)
   * — every crypto + advisory caller is bit-identical to the prior hardcoded
   * literals. Only the xStock production path (MCE.computeContext) overrides
   * these per-class from module_constants (momentum 120 = 30h@15m, ADX 56 =
   * 14h@15m), hard-fail on a missing seed (no silent default). See
   * B_4_FOUNDATION_PRE_AUDIT.md §2 Obj 2.
   */
  momentumLookback: number;  // bars; crypto 30, xStock 120 (both ≈30h wall-clock)
  adxPeriod: number;         // bars; crypto 14, xStock 56  (both ≈14h wall-clock)
  /**
   * B68.5 — Path B sustainability gate (cheap-tier bundle).
   *
   * The TFS branch fires via two paths:
   *   Path A — `mom > 0.003 && dx > 50` (momentum + ADX strong)
   *   Path B — `|DBS| >= 0.30` (directional strength alone)
   *
   * Path B was over-firing on already-exhausted moves on hostile days
   * (B65.6 deferred work). The B68.5 gate requires Path B to be
   * additionally confirmed by a forward-looking signal.
   *
   * **B70.3 (2026-05-05, Langston cc-inbox #901):** Original gate was
   * `dbsSlope >= b68_5DbsSlopeMin` (default 0.0). 7-day calibration data
   * showed -2.0pp predictive lift + -0.4480 avg shift — slope was binary-
   * suppressing winning signals. Replaced with momentum-based gate:
   * `mom > b68_5PathBMomentumMin` (default 0.002 = 0.2% momentum). Momentum
   * is forward-looking + temporally coherent with classifier inputs.
   *
   * Path A is unaffected — momentum + ADX strong enough on their own to admit.
   */
  b68_5PathBMomentumMin: number;

  /**
   * @deprecated B70.3 (2026-05-05) — replaced by `b68_5PathBMomentumMin`.
   * Retained as optional field for back-compat during transition; advisory
   * paths may still seed it with 0.0 but the runtime classifier no longer
   * reads it. Will be fully removed once B68.5 ablation row format is
   * updated and no consumers reference the old name.
   */
  b68_5DbsSlopeMin?: number;

  /**
   * B67.5-prep (2026-05-03) — Post-composition confidence floor.
   *
   * The historical hardcoded 0.4 floor was designed for a chain of 1-2
   * modulators. With 6 modulators (post-B68.3) the worst-case compound
   * penalty stack is ~0.455. With 7 modulators (post-B68.1) it becomes
   * ~0.43 — at the historical floor edge. Per Langston cc-inbox #885 O.1
   * recommendation + Kyle approval 2026-05-03, raised to 0.45 to prevent
   * extreme compound clipping while preserving meaningful differentiation
   * across the lower confidence range.
   *
   * Used at three clamp sites:
   *   - calculatePairRegime terminal clamp
   *   - vts-runner emit hook chain clamp
   *   - signal-orchestrator emit hook chain clamp
   *
   * Tunable via `module_constants.regime_classifier.b67_5_post_composition_floor`
   * — recalibrate from calibration window data without code redeploy.
   */
  b67_5PostCompositionFloor: number;
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
