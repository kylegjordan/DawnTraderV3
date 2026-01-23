/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.7F — Drift Canonical Definitions
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Defines ideal Z-score targets and weights for each canonical regime.
 * Used by DriftScore computation to measure deviation from expected conditions.
 * 
 * Schema Version: regime-mapping/v1.4b
 * ══════════════════════════════════════════════════════════════════════════════
 */

export interface DriftCanonicalEntry {
  idealVolZ: number;
  idealTrendZ: number;
  weightVol: number;
  weightTrend: number;
}

export const DRIFT_CANONICAL: Record<string, DriftCanonicalEntry> = {
  BULL_STABLE: {
    idealVolZ: -1.0,
    idealTrendZ: +1.5,
    weightVol: 0.4,
    weightTrend: 0.6
  },
  BEAR_VOLATILE: {
    idealVolZ: +1.2,
    idealTrendZ: -0.8,
    weightVol: 0.6,
    weightTrend: 0.4
  },
  LOW_VOL_CHOP: {
    idealVolZ: -0.8,
    idealTrendZ: 0.0,
    weightVol: 0.5,
    weightTrend: 0.5
  },
  HIGH_VOL_IMPULSE: {
    idealVolZ: +0.8,
    idealTrendZ: +1.2,
    weightVol: 0.5,
    weightTrend: 0.5
  },
  TRANSITION: {
    idealVolZ: 0.0,
    idealTrendZ: 0.0,
    weightVol: 0.5,
    weightTrend: 0.5
  }
};
