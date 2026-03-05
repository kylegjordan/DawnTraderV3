/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.7F — Drift Canonical Definitions
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Defines ideal Z-score targets and weights for each canonical regime.
 * Used by DriftScore computation to measure deviation from expected conditions.
 *
 * Phase 14 (Batch 15-hotfix): Regime keys updated to match canonical rename.
 *
 * Schema Version: regime-mapping/v2.0.0
 * ══════════════════════════════════════════════════════════════════════════════
 */

export interface DriftCanonicalEntry {
  idealVolZ: number;
  idealTrendZ: number;
  weightVol: number;
  weightTrend: number;
}

export const DRIFT_CANONICAL: Record<string, DriftCanonicalEntry> = {
  TREND_FRIENDLY_STABLE: {
    idealVolZ: -1.0,
    idealTrendZ: +1.5,
    weightVol: 0.4,
    weightTrend: 0.6
  },
  HIGH_VOLATILITY_UNSTABLE: {
    idealVolZ: +1.2,
    idealTrendZ: -0.8,
    weightVol: 0.6,
    weightTrend: 0.4
  },
  RANGE_BOUND_STABLE: {
    idealVolZ: -0.8,
    idealTrendZ: 0.0,
    weightVol: 0.5,
    weightTrend: 0.5
  },
  IMPULSE_EXPANSION: {
    idealVolZ: +0.8,
    idealTrendZ: +1.2,
    weightVol: 0.5,
    weightTrend: 0.5
  },
  STRUCTURAL_TRANSITION: {
    idealVolZ: 0.0,
    idealTrendZ: 0.0,
    weightVol: 0.5,
    weightTrend: 0.5
  }
};
