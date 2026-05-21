/**
 * ══════════════════════════════════════════════════════════════════════════════
 * B68.1 — Multi-Timeframe Agreement as Confidence Dimension
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Adds the 7th and final B68.x chain modulator. Per-pair higher-timeframe
 * (240-min / 4h) regime agreement on top of the active 1h regime classification.
 * Catches the "DBS ≥ 0.30 from a recent move that's already exhausted" failure
 * mode (master plan §0.10.G) by checking whether the higher-TF view confirms
 * the active-TF regime.
 *
 *   raw × macro × phase × freshness × outcome × volume_regime
 *     × pair_correlation × multi_tf_agreement → clamp [0.45, 1.0]
 *
 * Architecture mirrors B68.3 pair correlation exactly: pure functions over
 * OHLC + asymmetric confidence factor + ablation row schema. Reuses
 * `calculatePairRegime` unchanged for higher-TF classification — zero new
 * regime logic.
 *
 * Per BATCH_68_1_SCOPE.md (Langston-approved cc-inbox #887) +
 * BATCH_68_1_PRE_AUDIT.md (Langston-approved cc-inbox #888):
 *
 *   - Higher TF = Kraken native 240-min OHLC via existing `ohlcCache`
 *     (no DB-archive runtime dependency; B74 archive remains long-term store).
 *   - Higher-TF DBS = 0 in v1 (Path A only — mom + ADX over 30 × 4h candles
 *     = 5 days). v2 follow-up if calibration shows the agreement signal is
 *     too noisy without 4h DBS.
 *   - Three-state classification: CONFIRMED (labels match) → 1.05,
 *     COMPATIBLE (same family) → 1.00, CONFLICTED → 0.95. ST is universally
 *     COMPATIBLE.
 *   - Asymmetric factor range [0.92, 1.05] — penalty floor wider than boost
 *     ceiling (conflicted higher-TF is a stronger negative signal than
 *     confirmed is positive).
 *   - Family map kept LOCAL to this module per Langston cc-inbox #888 D.1
 *     (single-consumer abstraction; canonical regime map untouched).
 *   - Refinement D.1 (cc-inbox #887): explicit `higher_tf_dbs_score: 0` and
 *     `higher_tf_dbs_slope: 0` in ablation metadata. Schema-stable for v2.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import {
  calculatePairRegime,
  DEFAULT_REGIME_CONFIG,
} from './market-regime.js';
import type {
  OHLCData,
  RegimeConfig,
  MarketRegimeType,
} from '../../types/market-regime.types.js';
import { REGIMES } from '../../config/canonical-regime-strategy-map.js';
import type {
  FactorAlternate,
  RegimeDecision,
} from '../../services/factor-ablation-emitter.js';
// B79.0n.MCE: AssetClass threaded into computeMultiTfAgreement so the
// higher-TF re-classification uses the pair's real asset class.
import type { AssetClass } from '../../../shared/asset-classes.js';

/**
 * Family grouping for cross-TF agreement scoring. Logic-only (not tunable):
 *   - directional: TFS, IE  — both express directional movement
 *   - range:       RBS      — explicit no-direction
 *   - volatile:    HVU      — directional but unstable
 *   - transition:  ST       — uncertainty; universally COMPATIBLE
 */
export type RegimeFamily = 'directional' | 'range' | 'volatile' | 'transition';

export const REGIME_FAMILY: Record<MarketRegimeType, RegimeFamily> = {
  [REGIMES.TREND_FRIENDLY_STABLE]:    'directional',
  [REGIMES.IMPULSE_EXPANSION]:        'directional',
  [REGIMES.RANGE_BOUND_STABLE]:       'range',
  [REGIMES.HIGH_VOLATILITY_UNSTABLE]: 'volatile',
  [REGIMES.STRUCTURAL_TRANSITION]:    'transition',
};

/** Resolved config — supplied by MCE via `refreshMultiTfAgreementConfig()`. */
export interface MultiTfAgreementConfig {
  higherTfIntervalMinutes: number;
  minHigherTfSamples: number;
  factorMin: number;
  factorMax: number;
  sensitivity: number;
  compatibleScore: number;
  confirmedScore: number;
  conflictedScore: number;
}

/** Computation result — agreement state + factor + diagnostic metadata. */
export interface MultiTfAgreementResult {
  activeTfRegime: MarketRegimeType;
  /** null on cold-start (insufficient higher-TF samples). */
  higherTfRegime: MarketRegimeType | null;
  higherTfSampleCount: number;
  higherTfVolatility: number;
  higherTfMomentum: number;
  higherTfAdx: number;
  higherTfConfidence: number;
  agreement: 'CONFIRMED' | 'COMPATIBLE' | 'CONFLICTED' | 'COLD_START';
  agreementScore: number;
  /** Confidence factor: clamp(min, max, 1.0 + (score - 0.5) × sensitivity × 2). */
  factor: number;
  coldStart: boolean;
}

/**
 * Pure function: classify the higher-TF regime, derive agreement state, and
 * compute the confidence factor. No state, no I/O — caller fetches the
 * higher-TF OHLC and passes in.
 *
 * Higher-TF DBS hardcoded to 0 in v1 (Path A only — see scope §A.2.1). v2
 * follow-up if calibration shows v1 too noisy.
 */
export function computeMultiTfAgreement(
  activeTfRegime: MarketRegimeType,
  higherTfOhlc: OHLCData[] | null,
  config: MultiTfAgreementConfig,
  regimeConfig: RegimeConfig = DEFAULT_REGIME_CONFIG,
  // B79.0n.MCE: REQUIRED — the pair's asset class. Passed through to the
  // higher-TF `calculatePairRegime` call, which now requires an explicit
  // asset class so the higher-TF re-classification uses per-class thresholds.
  assetClass: AssetClass,
): MultiTfAgreementResult {
  // Cold-start guard: insufficient higher-TF samples. Returns identity factor.
  if (!higherTfOhlc || higherTfOhlc.length < config.minHigherTfSamples) {
    return {
      activeTfRegime,
      higherTfRegime: null,
      higherTfSampleCount: higherTfOhlc?.length ?? 0,
      higherTfVolatility: 0,
      higherTfMomentum: 0,
      higherTfAdx: 0,
      higherTfConfidence: 0,
      agreement: 'COLD_START',
      agreementScore: 0,
      factor: 1.0,
      coldStart: true,
    };
  }

  // Higher-TF classification — Path A only (DBS=0, slope=0). macroModifier=1.0
  // so the higher-TF result isn't compounded with the active-TF macro signal.
  const higherTfResult = calculatePairRegime(
    higherTfOhlc,
    0, // higherTfDbsScore — Path A only in v1
    0, // higherTfDbsSlope — Path A only in v1
    1.0, // macroModifier — no compounding
    regimeConfig,
    assetClass, // B79.0n.MCE: pair's asset class threaded into the higher-TF re-classification.
  );

  // Three-state agreement
  const sameLabel = higherTfResult.regime === activeTfRegime;
  const sameFamily =
    REGIME_FAMILY[higherTfResult.regime] === REGIME_FAMILY[activeTfRegime];
  // ST is universally COMPATIBLE — never escalates to CONFLICTED on either side.
  const eitherIsTransition =
    REGIME_FAMILY[higherTfResult.regime] === 'transition' ||
    REGIME_FAMILY[activeTfRegime] === 'transition';

  let agreement: MultiTfAgreementResult['agreement'];
  let agreementScore: number;
  if (sameLabel) {
    agreement = 'CONFIRMED';
    agreementScore = config.confirmedScore;
  } else if (sameFamily || eitherIsTransition) {
    agreement = 'COMPATIBLE';
    agreementScore = config.compatibleScore;
  } else {
    agreement = 'CONFLICTED';
    agreementScore = config.conflictedScore;
  }

  // factor = clamp(min, max, 1.0 + (score - 0.5) × sensitivity × 2). With
  // seed sens=0.05: confirmed=1.05, compatible=1.00, conflicted=0.95.
  const raw = 1.0 + (agreementScore - 0.5) * config.sensitivity * 2;
  const factor = Math.max(config.factorMin, Math.min(config.factorMax, raw));

  return {
    activeTfRegime,
    higherTfRegime: higherTfResult.regime,
    higherTfSampleCount: higherTfOhlc.length,
    higherTfVolatility: higherTfResult.volatility,
    higherTfMomentum: higherTfResult.momentum,
    higherTfAdx: higherTfResult.adx,
    higherTfConfidence: higherTfResult.confidence,
    agreement,
    agreementScore,
    factor,
    coldStart: false,
  };
}

/**
 * Build the B68.1 ablation alternate row.
 *
 * Counterfactual: divide-out the multi_tf_agreement factor to recover what
 * confidence would have been without B68.1. Same divide-out approximation
 * as B67.4 / B68.4 / B68.2 / B68.3 — known limitation at clamp boundaries
 * (Langston OBS-2 from cc-inbox #879).
 *
 * Refinement D.1 (Langston cc-inbox #887): explicit `higher_tf_dbs_score: 0`
 * + `higher_tf_dbs_slope: 0` in metadata. Schema-stable for v2 when 4h DBS
 * pipeline lands — values just stop being zero.
 */
export function buildB68_1Alternate(
  realConfidence: number,
  realRegimeLabel: string,
  result: MultiTfAgreementResult,
  config: MultiTfAgreementConfig,
): FactorAlternate {
  const confidenceWithoutFactor =
    result.factor > 0 ? realConfidence / result.factor : realConfidence;

  const alternate: RegimeDecision = {
    regimeLabel: realRegimeLabel,
    confidence: confidenceWithoutFactor,
    admissionPossible: true,
    metadata: {
      active_tf_regime: result.activeTfRegime,
      higher_tf_regime: result.higherTfRegime,
      higher_tf_interval_minutes: config.higherTfIntervalMinutes,
      higher_tf_sample_count: result.higherTfSampleCount,
      higher_tf_volatility: result.higherTfVolatility,
      higher_tf_momentum: result.higherTfMomentum,
      higher_tf_adx: result.higherTfAdx,
      higher_tf_confidence: result.higherTfConfidence,
      // Refinement D.1 — Langston cc-inbox #887. Hardcoded zero in v1; schema-
      // stable for v2 when 4h DBS pipeline lands.
      higher_tf_dbs_score: 0,
      higher_tf_dbs_slope: 0,
      agreement: result.agreement,
      agreement_score: result.agreementScore,
      multi_tf_factor: result.factor,
      confidence_with_factor: realConfidence,
      confidence_without_factor: confidenceWithoutFactor,
      cold_start: result.coldStart,
    },
  };

  return {
    factorName: 'b68_1_multi_tf_agreement',
    factorState: 'alternate_disabled',
    alternateDecision: alternate,
  };
}
