/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.7C — Adaptive ROI Configuration
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Centralized configuration for dynamic ROI thresholding via PredictiveConfidence.
 * These parameters control how trade acceptance criteria adapt based on:
 * - Market regime (BULL_STABLE, BEAR_VOLATILE, etc.)
 * - PredictiveConfidence from VTS telemetry
 * - Transaction costs (fees + slippage)
 * 
 * Schema: v1.0.0
 * Governance: Directive 11.7C Task 1
 * ══════════════════════════════════════════════════════════════════════════════
 */

export const ROI_FLEX_MULTIPLIER = 0.6;   // ±30% flex range around regime baseline
export const ROI_MIN = 0.010;             // 1.0% minimum threshold
export const ROI_MAX = 0.040;             // 4.0% maximum threshold

export const DEFAULT_FEE = 0.001;         // 0.1% per side (Kraken empirical average)
export const DEFAULT_SLIPPAGE = 0.0015;   // 0.15% (Kraken empirical average)

export const FRICTION_SAFETY_BUFFER = 1.1; // 10% safety buffer above friction floor

export const ADAPTIVE_THRESHOLDS_CONFIG = {
  roiFlexMultiplier: ROI_FLEX_MULTIPLIER,
  roiMin: ROI_MIN,
  roiMax: ROI_MAX,
  defaultFee: DEFAULT_FEE,
  defaultSlippage: DEFAULT_SLIPPAGE,
  frictionSafetyBuffer: FRICTION_SAFETY_BUFFER,
  version: '11.7C.1'
};

console.log(`[11.7C][Config] Adaptive thresholds loaded: ROI bounds [${(ROI_MIN * 100).toFixed(1)}%-${(ROI_MAX * 100).toFixed(1)}%], flex=${ROI_FLEX_MULTIPLIER}`);
