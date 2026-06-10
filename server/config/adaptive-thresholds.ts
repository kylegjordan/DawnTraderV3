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

// Batch 18J: Import canonical fee/slippage from Directive 11.3B source
import { DEFAULT_SLIPPAGE as CANONICAL_SLIPPAGE } from './exchange-defaults';

export const ROI_FLEX_MULTIPLIER = 0.6;   // ±30% flex range around regime baseline
export const ROI_MIN = 0.010;             // 1.0% minimum threshold
export const ROI_MAX = 0.040;             // 4.0% maximum threshold

// B-4.5: DEFAULT_FEE RETIRED — fees are DB-governed (module_constants
// 'fee_model'); ROI-gate callers pass the resolved per-class fee explicitly.
export const DEFAULT_SLIPPAGE = CANONICAL_SLIPPAGE;    // 0.05% (Batch 18J: canonical source — exchange-defaults.ts)

export const FRICTION_SAFETY_BUFFER = 1.1; // 10% safety buffer above friction floor

export const ADAPTIVE_THRESHOLDS_CONFIG = {
  roiFlexMultiplier: ROI_FLEX_MULTIPLIER,
  roiMin: ROI_MIN,
  roiMax: ROI_MAX,
  defaultSlippage: DEFAULT_SLIPPAGE,
  frictionSafetyBuffer: FRICTION_SAFETY_BUFFER,
  version: '11.7C.1'
};

console.log(`[11.7C][Config] Adaptive thresholds loaded: ROI bounds [${(ROI_MIN * 100).toFixed(1)}%-${(ROI_MAX * 100).toFixed(1)}%], flex=${ROI_FLEX_MULTIPLIER}`);
