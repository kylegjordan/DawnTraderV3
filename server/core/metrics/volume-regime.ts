/**
 * ══════════════════════════════════════════════════════════════════════════════
 * B68.2 — Volume Regime as second confidence dimension
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Adds accumulation/distribution as an orthogonal signal to the price-derived
 * regime classifier (`market-regime.ts`). The classifier reads vol/momentum/
 * ADX/DBS — all four price-derived. This module reads volume in conjunction
 * with price-direction, surfacing a signal the classifier cannot see:
 *
 *   - Rising prices on rising volume    → healthy trend (accumulation)
 *   - Rising prices on declining volume → exhaustion (distributors bailing)
 *   - Falling prices on rising volume   → distribution (sellers in control)
 *   - Falling prices on declining volume → washout / capitulation pending
 *
 * Two pairs in the same TFS regime can have catastrophically different forward
 * outcomes if one is accumulating and the other is distributing. B68.2 closes
 * that gap as a multiplicative confidence modifier in the existing chain:
 *
 *   raw × macro × phase × freshness × outcome × volume_regime → clamp [0.4, 1.0]
 *
 * Architecture mirrors B67.4 outcome feedback + B68.4 freshness factor:
 * pure functions over OHLC, narrow-band confidence factor, cold-start floor,
 * ablation row schema with divide-out counterfactual semantic.
 *
 * Per BATCH_68_2_SCOPE.md (Langston-approved cc-inbox #880) +
 * BATCH_68_2_PRE_AUDIT.md (Langston-approved cc-inbox #881):
 *   - signed-volume / total-volume score formula (vs CMF — v1 simplest)
 *   - 30-bar lookback (matches HF7 momentum lookback)
 *   - Symmetric ±0.40 ACCUMULATION/DISTRIBUTION metadata thresholds
 *   - Sensitivity 0.05 (narrow band — guardrails decorative until calibration
 *     proves signal cleanliness, then widen via DB UPDATE)
 *   - Liquidation-spike metadata flag (§D.1) — boolean: any single bar with
 *     volume > multiplier × lookback_median
 *   - Liquidation-spike multiplier as module_constant from v1 (§D.2)
 *
 * No persistent state. Pure function over the OHLC cache, recomputed per
 * signal eval. The `ohlcCache.getOHLCData(symbol, 60)` call already provides
 * the bars. If cold-pair flicker becomes a problem during calibration,
 * a `volume-regime-store` mirroring `directional-bias-store` is the v2
 * follow-up (NOT in v1 scope).
 *
 * No active gating yet. Pre-B67.5 this modulates the `regime_confidence_modulated`
 * column on trade records but no consumer reads it as an admission gate. The
 * ablation row captures the counterfactual for the calibration window.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import type { OHLCData } from '../../types/market-regime.types.js';
import type {
  FactorAlternate,
  RegimeDecision,
} from '../../services/factor-ablation-emitter.js';

/** Resolved config — supplied by MCE via `refreshVolumeRegimeConfig()`. */
export interface VolumeRegimeConfig {
  lookbackBars: number;
  accumulationThreshold: number;
  distributionThreshold: number;
  factorMin: number;
  factorMax: number;
  sensitivity: number;
  minSamples: number;
  liquidationSpikeMultiplier: number;
}

/** Computation result — score + factor + diagnostic flags. */
export interface VolumeRegimeResult {
  /** Signed-volume / total-volume sum. Bounded [-1, +1]. */
  score: number;
  /** Confidence factor: clamp(min, max, 1.0 + score × sensitivity). */
  factor: number;
  /** True when ohlcData.length < minSamples (factor=1.0, no modulation). */
  coldStart: boolean;
  /** Number of bars actually used in the score computation. */
  sampleCount: number;
  /**
   * §D.1 (Langston cc-inbox #880) — true if any single bar in the lookback
   * has volume > multiplier × median(volumes). Surfaces calibration cohorts
   * for clean-vs-liquidation-contaminated segmentation post-deploy without
   * recomputation.
   */
  hasLiquidationSpike: boolean;
  /** Informational label from score vs accum/dist thresholds. */
  label: 'ACCUMULATION' | 'DISTRIBUTION' | 'NEUTRAL';
}

/**
 * Pure function: compute the volume regime score, confidence factor, and
 * diagnostic flags from OHLC + config. No state, no I/O.
 */
export function computeVolumeRegime(
  ohlcData: OHLCData[],
  config: VolumeRegimeConfig,
): VolumeRegimeResult {
  // Cold-start: insufficient bars to compute a meaningful score.
  if (!ohlcData || ohlcData.length < config.minSamples) {
    return {
      score: 0,
      factor: 1.0,
      coldStart: true,
      sampleCount: ohlcData?.length ?? 0,
      hasLiquidationSpike: false,
      label: 'NEUTRAL',
    };
  }

  // Slice to the lookback window (most-recent N bars). Score uses the last
  // N bars of close+volume; the very first bar in the slice has no prior
  // close to compute sign() against, so its signed-volume contribution is 0.
  const slice = ohlcData.slice(-config.lookbackBars);
  const sampleCount = slice.length;

  let signedVolumeSum = 0;
  let totalVolumeSum = 0;
  for (let i = 1; i < slice.length; i++) {
    const closeDelta = slice[i].close - slice[i - 1].close;
    const sign = closeDelta > 0 ? 1 : closeDelta < 0 ? -1 : 0;
    const volume = slice[i].volume;
    signedVolumeSum += volume * sign;
    totalVolumeSum += volume;
  }

  // Zero-volume edge: illiquid pair with all zero-volume bars in the
  // lookback. Don't divide by zero; report neutral.
  let score = 0;
  if (totalVolumeSum > 0) {
    score = signedVolumeSum / totalVolumeSum;
  }

  // Liquidation-spike detection (§D.1): median of volumes in the lookback,
  // flag if any single bar exceeds multiplier × median.
  const volumes = slice.map((c) => c.volume).filter((v) => Number.isFinite(v));
  const median = computeMedian(volumes);
  const spikeThreshold = median * config.liquidationSpikeMultiplier;
  const hasLiquidationSpike =
    median > 0 && volumes.some((v) => v > spikeThreshold);

  // Factor mapping: clamp(min, max, 1.0 + score × sensitivity)
  const raw = 1.0 + score * config.sensitivity;
  const factor = Math.max(config.factorMin, Math.min(config.factorMax, raw));

  // Informational label — does NOT affect factor math (factor depends on
  // continuous score). Used in metadata + log lines for human-readable
  // diagnostics.
  let label: VolumeRegimeResult['label'] = 'NEUTRAL';
  if (score >= config.accumulationThreshold) label = 'ACCUMULATION';
  else if (score <= config.distributionThreshold) label = 'DISTRIBUTION';

  return {
    score,
    factor,
    coldStart: false,
    sampleCount,
    hasLiquidationSpike,
    label,
  };
}

/**
 * Build the B68.2 ablation alternate row.
 *
 * Counterfactual: divide-out the volume_regime factor to recover what the
 * confidence would have been without B68.2. Same divide-out approximation
 * as B67.4 / B68.4 — not exact at clamp boundaries (Langston OBS-2 from
 * cc-inbox #879 — known limitation across all chain factors).
 */
export function buildB68_2Alternate(
  realConfidence: number,
  realRegimeLabel: string,
  result: VolumeRegimeResult,
  config: VolumeRegimeConfig,
): FactorAlternate {
  const confidenceWithoutFactor =
    result.factor > 0 ? realConfidence / result.factor : realConfidence;

  const alternate: RegimeDecision = {
    regimeLabel: realRegimeLabel,
    confidence: confidenceWithoutFactor,
    admissionPossible: true,
    metadata: {
      volume_regime_score: result.score,
      volume_regime_factor: result.factor,
      confidence_with_factor: realConfidence,
      confidence_without_factor: confidenceWithoutFactor,
      lookback_bars: config.lookbackBars,
      sample_count: result.sampleCount,
      cold_start: result.coldStart,
      regime_at_eval: realRegimeLabel,
      has_liquidation_spike: result.hasLiquidationSpike,
      label: result.label,
    },
  };

  return {
    factorName: 'b68_2_volume_regime',
    factorState: 'alternate_disabled',
    alternateDecision: alternate,
  };
}

/**
 * Median computation for the liquidation-spike detection. Linear-time partial
 * sort would be cheaper but the lookback (default N=30) is small enough that
 * a full sort + middle-index lookup is dominated by the surrounding ablation
 * + emit cost.
 */
function computeMedian(values: number[]): number {
  if (!values || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}
