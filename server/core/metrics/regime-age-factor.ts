/**
 * ══════════════════════════════════════════════════════════════════════════════
 * B68.4 + B68.5 — Cheap-tier bundle support utilities
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Two pure-function modules co-located here (both small, both consumed at the
 * same emit hook in signal-orchestrator + vts-runner):
 *
 *   B68.4 — Regime-age first-class metric (freshness factor)
 *           Promotes regimePhaseStore age data to a confidence-modulating
 *           factor. Fresh-entry pairs get a small bonus; aged-out pairs get
 *           a small penalty. Independent of B67.2 phase weight (which is
 *           per-(strategy, phase) lookup) — this is a per-pair freshness.
 *
 *   B68.5 — Path B sustainability ablation builder
 *           The actual gate logic lives in market-regime.ts. Here we just
 *           build the ablation-row counterfactual: what would the regime
 *           label have been if the gate had NOT fired? Per pre-audit §D.2:
 *           factor_value_with/without are NUMERIC 0/1 (not strings) — keeps
 *           aggregation queries (AVG, SUM) uniform across factor types.
 *
 * Per BATCH_67_4_PRE_AUDIT.md §B.1 File 3 (B68.5 gate) + scope §B (B68.4).
 * ══════════════════════════════════════════════════════════════════════════════
 */

import type { FactorAlternate, RegimeDecision } from '../../services/factor-ablation-emitter.js';
import type { RegimeAgeConfig } from '../../services/market-context-engine.js';
import type { OHLCData, RegimeConfig } from '../../types/market-regime.types.js';
// B72 (2026-05-05): Path A momentum threshold from module='regime_age'.
import { getCachedNumberRequired } from '../../services/module-constants-service.js';
import { calculatePairRegime, computeMomentum, computeADX } from './market-regime.js';
import { REGIMES } from '../../config/canonical-regime-strategy-map.js';

// ─── B68.4 — Freshness factor ─────────────────────────────────────────────

/**
 * Compute the freshness factor from a pair's regime age + config.
 *
 * Formula:
 *   raw    = 1.0 + (target_age_hours - actual_age_hours) × sensitivity / target_age_hours
 *   factor = clamp(min, max, raw)
 *
 * With seed values (target=6h, sensitivity=0.10, [0.92, 1.05]):
 *   age=0h    → raw = 1.0 + 6/6×0.10  = 1.10 → clamp to 1.05 (ceiling)
 *   age=6h    → raw = 1.0                     = 1.00 (PRIME mid)
 *   age=12h   → raw = 1.0 - 6/6×0.10  = 0.90 → clamp to 0.92 (floor)
 *
 * If `ageMs` is undefined (pair untracked), returns factor=1.0 + coldStart=true
 * — same legitimate-runtime-state pattern as outcome feedback cold-start.
 */
export function computeFreshnessFactor(
  ageMs: number | undefined,
  config: RegimeAgeConfig,
): { factor: number; coldStart: boolean; ageHours: number } {
  if (ageMs === undefined || !Number.isFinite(ageMs)) {
    return { factor: 1.0, coldStart: true, ageHours: 0 };
  }
  const ageHours = ageMs / (1000 * 60 * 60);
  if (config.targetAgeHours <= 0) {
    return { factor: 1.0, coldStart: false, ageHours };
  }
  const raw =
    1.0 +
    ((config.targetAgeHours - ageHours) * config.sensitivity) / config.targetAgeHours;
  const clamped = Math.max(config.factorMin, Math.min(config.factorMax, raw));
  return { factor: clamped, coldStart: false, ageHours };
}

/**
 * Build the B68.4 ablation alternate row.
 * Counterfactual: divide-out the freshness factor to recover what the
 * confidence would have been without B68.4.
 */
export function buildB68_4Alternate(
  realConfidence: number,
  realRegimeLabel: string,
  freshnessResult: { factor: number; coldStart: boolean; ageHours: number },
  targetAgeHours: number,
): FactorAlternate {
  const confidenceWithoutFactor =
    freshnessResult.factor > 0 ? realConfidence / freshnessResult.factor : realConfidence;

  const alternate: RegimeDecision = {
    regimeLabel: realRegimeLabel,
    confidence: confidenceWithoutFactor,
    admissionPossible: true,
    metadata: {
      freshness_factor: freshnessResult.factor,
      confidence_with_factor: realConfidence,
      confidence_without_factor: confidenceWithoutFactor,
      phase_age_hours: freshnessResult.ageHours,
      phase_age_seconds: Math.floor(freshnessResult.ageHours * 3600),
      target_age_hours: targetAgeHours,
      cold_start: freshnessResult.coldStart,
    },
  };

  return {
    factorName: 'b68_4_regime_age',
    factorState: 'alternate_disabled',
    alternateDecision: alternate,
  };
}

// ─── B68.5 — Path B sustainability ablation builder ────────────────────────

/**
 * Build the B68.5 ablation alternate row by re-running `calculatePairRegime`
 * with the Path B gate effectively disabled. Compares the resulting regime
 * label against the real classification; emits a 0/1 numeric per §D.2
 * indicating whether the gate flipped the label.
 *
 * **B70.3 (2026-05-05, Langston cc-inbox #901):** Original gate was
 * `dbsSlope >= b68_5DbsSlopeMin`. Replaced with `mom > b68_5PathBMomentumMin`.
 * The counterfactual now disables the momentum gate by setting
 * `b68_5PathBMomentumMin = -Infinity`.
 *
 * Path A (`mom > 0.003 && dx > 50`) admits regardless of either gate — the
 * flip-detection only fires when Path B was the deciding branch.
 */
export function buildB68_5Alternate(
  ohlcData: OHLCData[],
  dbsScore: number,
  dbsSlope: number,
  macroModifier: number,
  regimeConfig: RegimeConfig,
  realRegimeLabel: string,
  realConfidence: number,
): FactorAlternate {
  // Re-run classification with the gate effectively disabled (momentum min
  // very permissive). Any pair that was REJECTED by the real classifier's
  // Path B will now ADMIT to TFS in this alternate — surfacing the label flip.
  const ungatedConfig: RegimeConfig = {
    ...regimeConfig,
    b68_5PathBMomentumMin: Number.NEGATIVE_INFINITY,
    // legacy field — keep deeply permissive too in case any reader still
    // checks it during transition
    b68_5DbsSlopeMin: Number.NEGATIVE_INFINITY,
  };
  const altResult = calculatePairRegime(
    ohlcData,
    dbsScore,
    dbsSlope,
    macroModifier,
    ungatedConfig,
  );
  const gateFlipped = altResult.regime !== realRegimeLabel;
  const realMomentum = computeMomentum(ohlcData);
  const pathAMomentumFloor = getCachedNumberRequired('regime_age', 'momentum_floor_path_a',
    { exchange: '*', assetClass: '*', strategy: '*', regime: '*' });
  const pathATriggered = realMomentum > pathAMomentumFloor && computeADX(ohlcData) > 50;
  const pathBWouldHaveTriggeredPreGate =
    Math.abs(dbsScore) >= 0.30 && altResult.regime === REGIMES.TREND_FRIENDLY_STABLE;
  const pathBTriggeredPostGate =
    Math.abs(dbsScore) >= 0.30 && realRegimeLabel === REGIMES.TREND_FRIENDLY_STABLE;

  const alternate: RegimeDecision = {
    regimeLabel: altResult.regime, // what the regime WOULD have been without the gate
    confidence: altResult.confidence,
    admissionPossible: true,
    metadata: {
      // §D.2 — numeric 0/1 for dashboard aggregation uniformity
      factor_value_with: gateFlipped ? 1 : 0,
      factor_value_without: 0,
      gate_flipped: gateFlipped ? 1 : 0,
      regime_with_gate: realRegimeLabel,
      regime_without_gate: altResult.regime,
      confidence_with_gate: realConfidence,
      confidence_without_gate: altResult.confidence,
      dbs_score: dbsScore,
      dbs_slope: dbsSlope,
      momentum: realMomentum,
      // B70.3: actual gate threshold + name for downstream analysis
      momentum_min_threshold: regimeConfig.b68_5PathBMomentumMin,
      gate_kind: 'momentum_min',
      // legacy fields preserved for back-compat readers
      slope_min_threshold: regimeConfig.b68_5DbsSlopeMin ?? 0.0,
      path_a_triggered: pathATriggered,
      path_b_would_have_triggered_pre_gate: pathBWouldHaveTriggeredPreGate,
      path_b_triggered_post_gate: pathBTriggeredPostGate,
    },
  };

  return {
    factorName: 'b68_5_path_b_sustainability',
    factorState: 'alternate_disabled',
    alternateDecision: alternate,
  };
}

