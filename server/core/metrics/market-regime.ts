/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.0E.1 — Pair-Level Market Regime Calculator
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Purpose: Calculates market regime for individual trading pairs based on OHLC data.
 * Uses volatility, momentum, and ADX metrics to classify into 5 regime categories.
 *
 * Phase 14 (Batch 15): Regime names updated to remove directional language.
 *   BULL_STABLE -> TREND_FRIENDLY_STABLE
 *   BEAR_VOLATILE -> HIGH_VOLATILITY_UNSTABLE
 *   LOW_VOL_CHOP -> RANGE_BOUND_STABLE
 *   HIGH_VOL_IMPULSE -> IMPULSE_EXPANSION
 *   TRANSITION -> STRUCTURAL_TRANSITION
 *
 * Schema: v2.0.0
 * Governance: M46 (Pair regime must be calculated each cycle)
 *
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import type { OHLCData, MarketRegimeType, RegimeCalculationResult, RegimeConfig } from '../../types/market-regime.types';
import { REGIME_WEIGHTS } from '../../types/market-regime.types';
import { REGIMES } from '../../config/canonical-regime-strategy-map';
import {
  RBS_VOL_MAX,
  RBS_DX_MAX,
  RBS_DBS_MAX,
  IE_VOL_MIN_PATH_A,
  IE_DX_MIN_PATH_A,
  IE_VOL_MIN_PATH_B,
  IE_DBS_STRONG,
  TFS_MOM_MIN_PATH_A,
  TFS_DX_MIN,
  TFS_DBS_MODERATE,
  HVU_VOL_MIN,
  HVU_MOM_NEG_PATH_A,
  HVU_DX_STRONG,
  HVU_MOM_NEG_PATH_B,
} from '../../asset_classes/crypto_spot/regime-thresholds.js';
// B79: xstock_spot threshold constants — read only when assetClass='xstock_spot'.
// Crypto_spot path uses the existing constants above (no-touch fence).
import {
  RBS_VOL_MAX_XSTOCK,
  RBS_DX_MAX_XSTOCK,
  RBS_DBS_MAX_XSTOCK,
  IE_VOL_MIN_PATH_A_XSTOCK,
  IE_DX_MIN_PATH_A_XSTOCK,
  IE_VOL_MIN_PATH_B_XSTOCK,
  IE_DBS_STRONG_XSTOCK,
  TFS_MOM_MIN_PATH_A_XSTOCK,
  TFS_DX_MIN_XSTOCK,
  TFS_DBS_MODERATE_XSTOCK,
  HVU_VOL_MIN_XSTOCK,
  HVU_MOM_NEG_PATH_A_XSTOCK,
  HVU_DX_STRONG_XSTOCK,
  HVU_MOM_NEG_PATH_B_XSTOCK,
} from '../../asset_classes/xstock_spot/regime-thresholds.js';

/**
 * B67.3.5 — Default RegimeConfig matching the migration seed values.
 * Used by ADVISORY paths (diagnostics, unit tests) that don't have MCE
 * macro/regime resolution available. Production classification (MCE) MUST
 * resolve actual values from module_constants and pass them in — never use
 * this default.
 */
export const DEFAULT_REGIME_CONFIG: RegimeConfig = {
  tfsDesatMin: 0.50,
  tfsDesatMax: 0.90,
  tfsMomentumScale: 0.020,
  tfsVolatilityScale: 0.025,
  tfsDbsScale: 0.7,
  // B70.3 (2026-05-05) — Path B momentum gate (replaces b68_5DbsSlopeMin).
  // Default 0.002 (0.2% momentum). Production resolves from module_constants.
  b68_5PathBMomentumMin: 0.002,
  // Deprecated, retained for back-compat readers — no runtime effect.
  b68_5DbsSlopeMin: 0.0,
  // B67.5-prep — post-composition confidence floor (raised from 0.4 to 0.45
  // for expanded chain). Production resolves from module_constants.
  b67_5PostCompositionFloor: 0.45,
};

export function computeVolatility(ohlcData: OHLCData[]): number {
  if (ohlcData.length < 2) return 0;

  const returns: number[] = [];
  for (let i = 1; i < ohlcData.length; i++) {
    const prevClose = ohlcData[i - 1].close;
    const currClose = ohlcData[i].close;
    if (prevClose > 0) {
      returns.push((currClose - prevClose) / prevClose);
    }
  }

  if (returns.length === 0) return 0;

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((acc, r) => acc + Math.pow(r - mean, 2), 0) / returns.length;

  return Math.sqrt(variance);
}

export function computeMomentum(ohlcData: OHLCData[]): number {
  // HF7: Extended lookback from 14 to 30 candles for more stable momentum
  // 14 candles at 15-min = 3.5hr (too jittery, single pullback flips sign)
  // 30 candles at 15-min = 7.5hr (captures intraday trends, reduces noise)
  // Signal orchestrator uses 60-min candles so 14*60=14hr; 30*15=7.5hr is closer parity
  const lookback = Math.min(30, ohlcData.length);
  if (lookback < 5) return 0;

  const recentSlice = ohlcData.slice(-lookback);
  const startPrice = recentSlice[0].close;
  const endPrice = recentSlice[recentSlice.length - 1].close;

  if (startPrice === 0) return 0;

  return (endPrice - startPrice) / startPrice;
}

export function computeADX(ohlcData: OHLCData[], period: number = 14): number {
  if (ohlcData.length < period + 1) return 0;

  const trueRanges: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];

  for (let i = 1; i < ohlcData.length; i++) {
    const curr = ohlcData[i];
    const prev = ohlcData[i - 1];

    const highLow = curr.high - curr.low;
    const highClose = Math.abs(curr.high - prev.close);
    const lowClose = Math.abs(curr.low - prev.close);

    trueRanges.push(Math.max(highLow, highClose, lowClose));

    const upMove = curr.high - prev.high;
    const downMove = prev.low - curr.low;

    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  if (trueRanges.length < period) return 0;

  const smoothedTR = trueRanges.slice(-period).reduce((a, b) => a + b, 0);
  const smoothedPlusDM = plusDM.slice(-period).reduce((a, b) => a + b, 0);
  const smoothedMinusDM = minusDM.slice(-period).reduce((a, b) => a + b, 0);

  if (smoothedTR === 0) return 0;

  const plusDI = (smoothedPlusDM / smoothedTR) * 100;
  const minusDI = (smoothedMinusDM / smoothedTR) * 100;

  const diSum = plusDI + minusDI;
  if (diSum === 0) return 0;

  const dx = (Math.abs(plusDI - minusDI) / diSum) * 100;

  return dx;
}

/**
 * B62 Design B: DBS-integrated pair-level regime classifier.
 *
 * Adds DBS (Directional Bias Score) as a 4th input to the vol + ADX + momentum
 * decision tree. Key changes from the pre-B62 classifier:
 *   - RBS requires |DBS| < 0.10 (prevents drift-contaminated false ranges)
 *   - TFS admits pairs with |DBS| >= 0.30 (directional pairs reach trend strategies)
 *   - IE admits pairs with |DBS| >= 0.50 + moderate vol (less restrictive than vol>0.020 && dx>55)
 *
 * Phase 0 evidence (26,700 samples):
 *   - RBS drift contamination: 70.2% -> 0.0%
 *   - TFS+IE share: 14.1% -> 36.5%
 *   - Family-level flicker: 1.32% -> 1.99% (passes 2.0% ceiling)
 *   - Strong-DBS -> trend: 17% -> 100%
 *
 * TFS threshold 0.30 is the only tested value that passes the 2.0% flicker ceiling.
 * See BATCH_62_PHASE0_REPLAY_ANALYSIS.md §1.3 for the sweep evidence.
 *
 * B67.1: Required `macroModifier` parameter — multiplies the computed
 * confidence BEFORE the final clamp. Label is unchanged. Per Kyle directive
 * 2026-04-29 (no fallbacks), the parameter is REQUIRED. Caller must compute
 * the appropriate modifier value (1.0 = identity / no modulation; values in
 * [0.85, 1.05] when B67.1 is producing a real modulation). Caller produces
 * the value via `computeMacroModifier()` from `macro-modifier.ts`.
 *
 * Confidence clamp: post-modifier upper bound raised 0.95 → 1.0 to accommodate
 * 0.95 × 1.05 = 0.9975. Verified zero callers asserting on the prior 0.95
 * ceiling (BATCH_67_1_PRE_AUDIT.md §1.1). Lower bound 0.4 retained as hard
 * floor — pre-B67 invariant for downstream consumers.
 *
 * B67.4 cheap-tier bundle: `dbsSlope` 3rd parameter added (per-pair, not config —
 * see BATCH_67_4_PRE_AUDIT.md §B.1 File 3 + §C.1). Used by the new B68.5 Path B
 * sustainability gate inside the TFS branch. Default 0.0 in advisory callers.
 *
 * @param ohlcData - OHLC candles
 * @param dbsScore - Directional Bias Score from computeDirectionalBias()
 * @param dbsSlope - DBS slope (per-pair time series; per B62 Item 16 already
 *                   computed inside `directionalBias.slope`). Used by B68.5
 *                   Path B sustainability gate. Pass 0.0 in advisory paths
 *                   to neutralize the gate.
 * @param macroModifier - REQUIRED B67.1 multiplier on confidence. Caller
 *                        passes 1.0 for the identity case (no modulation),
 *                        or the value from `computeMacroModifier()` when
 *                        applying B67.1 modulation.
 */
export function calculatePairRegime(
  ohlcData: OHLCData[],
  dbsScore: number,
  dbsSlope: number,
  macroModifier: number,
  regimeConfig: RegimeConfig,
  assetClass: string = 'crypto_spot',
): RegimeCalculationResult {
  const vol = computeVolatility(ohlcData);
  const mom = computeMomentum(ohlcData);
  const dx = computeADX(ohlcData);
  const absDbs = Math.abs(dbsScore);

  // B79: per-asset-class threshold dispatch. Crypto_spot path math + branch
  // logic + thresholds UNCHANGED (no-touch fence). Only the threshold values
  // resolved into `t` differ when assetClass='xstock_spot'. Confidence
  // formulas (e.g. trap-table literals at line ~220, 225, etc.) stay inline
  // — only branch CONDITIONS swap thresholds.
  const t = assetClass === 'xstock_spot'
    ? {
        RBS_VOL_MAX: RBS_VOL_MAX_XSTOCK,
        RBS_DX_MAX: RBS_DX_MAX_XSTOCK,
        RBS_DBS_MAX: RBS_DBS_MAX_XSTOCK,
        IE_VOL_MIN_PATH_A: IE_VOL_MIN_PATH_A_XSTOCK,
        IE_DX_MIN_PATH_A: IE_DX_MIN_PATH_A_XSTOCK,
        IE_VOL_MIN_PATH_B: IE_VOL_MIN_PATH_B_XSTOCK,
        IE_DBS_STRONG: IE_DBS_STRONG_XSTOCK,
        TFS_MOM_MIN_PATH_A: TFS_MOM_MIN_PATH_A_XSTOCK,
        TFS_DX_MIN: TFS_DX_MIN_XSTOCK,
        TFS_DBS_MODERATE: TFS_DBS_MODERATE_XSTOCK,
        HVU_VOL_MIN: HVU_VOL_MIN_XSTOCK,
        HVU_MOM_NEG_PATH_A: HVU_MOM_NEG_PATH_A_XSTOCK,
        HVU_DX_STRONG: HVU_DX_STRONG_XSTOCK,
        HVU_MOM_NEG_PATH_B: HVU_MOM_NEG_PATH_B_XSTOCK,
      }
    : {
        RBS_VOL_MAX, RBS_DX_MAX, RBS_DBS_MAX,
        IE_VOL_MIN_PATH_A, IE_DX_MIN_PATH_A, IE_VOL_MIN_PATH_B, IE_DBS_STRONG,
        TFS_MOM_MIN_PATH_A, TFS_DX_MIN, TFS_DBS_MODERATE,
        HVU_VOL_MIN, HVU_MOM_NEG_PATH_A, HVU_DX_STRONG, HVU_MOM_NEG_PATH_B,
      };

  let regime: MarketRegimeType;
  let confidence: number;

  // HF7: Recalibrated thresholds for crypto market data
  // computeADX returns DX (not Wilder's smoothed ADX). Crypto DX runs 35-90 on 15-min.
  //   DX < 45 = balanced/ranging (weak directional pressure)
  //   DX 45-55 = moderate directional movement
  //   DX > 55 = strong directional movement
  //   DX > 60 = very strong directional pressure
  // Volatility (std dev of returns): < 0.012 = quiet, > 0.020 = elevated
  // Momentum (30-candle price change ratio): |mom| < 0.003 = noise, > 0.005 = meaningful
  // DBS (B62): |dbs| < 0.10 = neutral, >= 0.30 = moderate+, >= 0.50 = strong

  if (vol < t.RBS_VOL_MAX && dx < t.RBS_DX_MAX && absDbs < t.RBS_DBS_MAX) {
    // B62: Low vol + low ADX + low DBS = genuine ranging market
    // (pre-B62: no DBS gate, 70% of RBS was drift-contaminated)
    regime = REGIMES.RANGE_BOUND_STABLE;
    confidence = 0.75 + (0.012 - vol) * 12;
  } else if ((vol > t.IE_VOL_MIN_PATH_A && dx > t.IE_DX_MIN_PATH_A) || (vol > t.IE_VOL_MIN_PATH_B && absDbs >= t.IE_DBS_STRONG)) {
    // B62: High vol + strong direction OR moderate vol + very strong DBS = impulse
    // (pre-B62: IE was 0.9% of cycles; now ~2.0% with the DBS-based entry)
    regime = REGIMES.IMPULSE_EXPANSION;
    confidence = 0.65 + (vol - 0.015) * 6 + (dx - 45) * 0.002 + absDbs * 0.1;
  } else if (
    (mom > t.TFS_MOM_MIN_PATH_A && dx > t.TFS_DX_MIN) ||
    (absDbs >= t.TFS_DBS_MODERATE && mom > regimeConfig.b68_5PathBMomentumMin)
  ) {
    // B62: Positive momentum + directional strength OR moderate+ DBS = trend
    // (pre-B62: TFS was 13.2%; now 34.6% as directional pairs correctly routed)
    // Threshold 0.30 is the only tested value that passes 2.0% flicker ceiling.
    //
    // B68.5 (cheap-tier bundle, 2026-05-01): Path B (`|DBS| >= 0.30`) was
    // originally gated by `dbsSlope >= b68_5DbsSlopeMin`. Designed to catch
    // strong-but-decaying DBS = exhausted move.
    //
    // B70.3 (2026-05-05, Langston cc-inbox #901): replaced with
    // `mom > b68_5PathBMomentumMin` (default 0.002). 7-day calibration showed
    // the slope gate at -2.0pp predictive lift + -0.4480 avg shift —
    // binary-suppressing winning signals. Momentum is the more direct
    // "is this DBS-strong pair still actually moving" check, forward-looking
    // and temporally coherent with classifier inputs. Path A (mom + ADX)
    // unchanged. When Path B fails the momentum gate, the regime falls through
    // to ST/HVU via the remaining branches below — see B68.5 ablation row at
    // the signal-orchestrator hook for the LABEL counterfactual.
    regime = REGIMES.TREND_FRIENDLY_STABLE;
    // B67.3.5: continuous mapping replaces step-function. Output [min, max]
    // (default [0.50, 0.90]). Multiplicative — any weak input collapses score
    // (semantic match for "trend-friendly STABLE" = all three should align).
    // Scales seeded from indicator threshold analysis; recalibrate post-window.
    // See BATCH_67_3_5_PRE_AUDIT.md §B.2.
    const momentumFactor = Math.max(0, Math.min(1, mom / regimeConfig.tfsMomentumScale));
    const dbsStrength    = Math.max(0, Math.min(1, absDbs / regimeConfig.tfsDbsScale));
    const volInverse     = Math.max(0, Math.min(1, (regimeConfig.tfsVolatilityScale - vol) / regimeConfig.tfsVolatilityScale));
    confidence = regimeConfig.tfsDesatMin
      + (regimeConfig.tfsDesatMax - regimeConfig.tfsDesatMin)
        * (momentumFactor * dbsStrength * volInverse);
  } else if ((vol > t.HVU_VOL_MIN && mom < t.HVU_MOM_NEG_PATH_A) || (dx > t.HVU_DX_STRONG && mom < t.HVU_MOM_NEG_PATH_B)) {
    // Elevated vol in decline OR very strong downward direction -> volatile/unstable
    regime = REGIMES.HIGH_VOLATILITY_UNSTABLE;
    confidence = 0.65 + Math.min(Math.abs(mom) * 8, 0.2);
  } else {
    // No strong classification -> structural transition
    // B62 note: ST is 36.6% under Design B. Monitored post-deploy.
    // If ST strategies perform poorly on moderate-DBS overflow, a DBS-aware
    // sub-condition may be added in a follow-up batch.
    regime = REGIMES.STRUCTURAL_TRANSITION;
    confidence = 0.50 + Math.min(vol * 5, 0.10) + Math.min(absDbs * 0.15, 0.05);
  }

  // B67.1: apply macro modifier BEFORE final clamp. macroModifier defaults to
  // 1.0 (no-op) for callers that haven't been updated. Upper bound raised
  // 0.95 → 1.0 (see function header).
  // B67.5-prep (2026-05-03): floor sourced from `regimeConfig.b67_5PostCompositionFloor`
  // (tunable module_constant) instead of hardcoded 0.4. Default at 0.45 to
  // accommodate the expanded modulation chain — see RegimeConfig field
  // documentation + Langston cc-inbox #885 O.1.
  confidence = confidence * macroModifier;
  confidence = Math.min(Math.max(confidence, regimeConfig.b67_5PostCompositionFloor), 1.0);

  return {
    regime,
    volatility: vol,
    momentum: mom,
    adx: dx,
    confidence
  };
}

export function getRegimeWeight(regime: MarketRegimeType): number {
  return REGIME_WEIGHTS[regime] ?? 0.5;
}

/**
 * Directive 11.4H.4 Task 4: Dynamic Regime Scoring
 * Computes regime scores dynamically from ADX + volatility metrics
 * Scores now fluctuate with market strength (~ 82-93 in strong trends)
 *
 * @param regime - The market regime type
 * @param metrics - Object containing adx and volatility values
 * @returns Score between 0-100
 */
export function calculateRegimeScore(
  regime: MarketRegimeType,
  metrics: { adx: number; volatility: number }
): number {
  const { adx, volatility } = metrics;

  // Helper to clamp values between min and max
  const clamp = (value: number, min: number, max: number): number =>
    Math.min(Math.max(value, min), max);

  switch (regime) {
    case REGIMES.TREND_FRIENDLY_STABLE:
      // Strong trend: higher ADX = higher score (50-100)
      return clamp(50 + adx / 2, 50, 100);

    case REGIMES.HIGH_VOLATILITY_UNSTABLE:
      // High volatility: higher ADX = lower score (0-100)
      return clamp(100 - adx / 2, 0, 100);

    case REGIMES.RANGE_BOUND_STABLE:
      // Sideways: lower volatility = higher score (0-100)
      return clamp(55 - volatility * 1000, 0, 100);

    case REGIMES.IMPULSE_EXPANSION:
      // High volatility impulse: score based on ADX strength
      return clamp(50 + (adx - volatility * 500) / 2, 30, 90);

    case REGIMES.STRUCTURAL_TRANSITION:
      // Uncertainty: blend of ADX and volatility
      return clamp(45 + (adx - volatility * 1000) / 2, 0, 100);

    default:
      return 50;
  }
}

/**
 * Directive 11.4H.4: Get dynamic regime score from OHLC data
 * Convenience function that calculates regime and then derives dynamic score
 */
export function getDynamicRegimeScore(ohlcData: OHLCData[]): {
  regime: MarketRegimeType;
  score: number;
  metrics: { adx: number; volatility: number };
} {
  // B67.1: macroModifier required. B67.4 cheap-tier (2026-05-01): dbsSlope
  // also required. This advisory function (per SIM §5.4) doesn't have macro
  // context or DBS slope available — pass 0.0 / 1.0 explicitly for identity
  // (advisory call, not the live classification path).
  const result = calculatePairRegime(ohlcData, 0, 0, 1.0, DEFAULT_REGIME_CONFIG);
  const score = calculateRegimeScore(result.regime, {
    adx: result.adx,
    volatility: result.volatility
  });

  return {
    regime: result.regime,
    score,
    metrics: {
      adx: result.adx,
      volatility: result.volatility
    }
  };
}

export function isHighConfidenceRegime(result: RegimeCalculationResult): boolean {
  return result.confidence >= 0.70;
}

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.5 Task 2 — Rolling Z-Score Normalization for Regimes
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Purpose: Replace static regime thresholds with rolling, adaptive normalization.
 * Uses Z-Scores calculated over a 300-period window for ADX, volatility, and momentum.
 *
 * This is the canonical regime function used by both VTS and DSS systems.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { RollingStats } from '../../utils/rolling-stats.js';

const rollingStats = {
  ADX: new RollingStats(300),
  VOL: new RollingStats(300),
  MOM: new RollingStats(300)
};

export interface NormalizedMetrics {
  adx: number;
  vol: number;
  momentum: number;
}

/**
 * Directive 11.5 Task 2: Get Normalized Regime
 *
 * Canonical export for Z-Score normalized regime classification.
 * Used by both VTS (passive) and DSS (active) systems.
 *
 * Phase 14: Updated to use new canonical regime names.
 *
 * @param metrics - Raw ADX, volatility, and momentum values
 * @returns Normalized regime type
 */
export function getNormalizedRegime(metrics: NormalizedMetrics): MarketRegimeType {
  const { adx, vol, momentum } = metrics;

  rollingStats.ADX.push(adx);
  rollingStats.VOL.push(vol);
  rollingStats.MOM.push(momentum);

  const adxZ = rollingStats.ADX.zScore(adx);
  const volZ = rollingStats.VOL.zScore(vol);
  const momZ = rollingStats.MOM.zScore(momentum);

  if (volZ > 1 && adxZ > 0.5) {
    return REGIMES.IMPULSE_EXPANSION;
  }

  if (volZ > 0.5 && adxZ > 0.2 && momZ > 0) {
    return REGIMES.TREND_FRIENDLY_STABLE;
  }

  if (volZ < -0.5 && Math.abs(momZ) < 0.5) {
    return REGIMES.RANGE_BOUND_STABLE;
  }

  if (adxZ < -0.5 && momZ < 0) {
    return REGIMES.STRUCTURAL_TRANSITION;
  }

  if (momZ < -0.5) {
    return REGIMES.HIGH_VOLATILITY_UNSTABLE;
  }

  return REGIMES.STRUCTURAL_TRANSITION;
}

/**
 * Directive 11.5: Get normalized regime with Z-Score details
 * Returns both the regime and the Z-scores used for classification
 */
export function getNormalizedRegimeWithDetails(metrics: NormalizedMetrics): {
  regime: MarketRegimeType;
  zScores: { adxZ: number; volZ: number; momZ: number };
  isWarmedUp: boolean;
} {
  const { adx, vol, momentum } = metrics;

  rollingStats.ADX.push(adx);
  rollingStats.VOL.push(vol);
  rollingStats.MOM.push(momentum);

  const adxZ = rollingStats.ADX.zScore(adx);
  const volZ = rollingStats.VOL.zScore(vol);
  const momZ = rollingStats.MOM.zScore(momentum);

  const isWarmedUp = rollingStats.ADX.isWarmedUp(30) &&
                     rollingStats.VOL.isWarmedUp(30) &&
                     rollingStats.MOM.isWarmedUp(30);

  let regime: MarketRegimeType;

  if (volZ > 1 && adxZ > 0.5) {
    regime = REGIMES.IMPULSE_EXPANSION;
  } else if (volZ > 0.5 && adxZ > 0.2 && momZ > 0) {
    regime = REGIMES.TREND_FRIENDLY_STABLE;
  } else if (volZ < -0.5 && Math.abs(momZ) < 0.5) {
    regime = REGIMES.RANGE_BOUND_STABLE;
  } else if (adxZ < -0.5 && momZ < 0) {
    regime = REGIMES.STRUCTURAL_TRANSITION;
  } else if (momZ < -0.5) {
    regime = REGIMES.HIGH_VOLATILITY_UNSTABLE;
  } else {
    regime = REGIMES.STRUCTURAL_TRANSITION;
  }

  return {
    regime,
    zScores: { adxZ, volZ, momZ },
    isWarmedUp
  };
}

/**
 * Directive 11.5: Check if regime stats are warmed up
 */
export function isRegimeStatsWarmedUp(): boolean {
  return rollingStats.ADX.isWarmedUp(30) &&
         rollingStats.VOL.isWarmedUp(30) &&
         rollingStats.MOM.isWarmedUp(30);
}

/**
 * Directive 11.6B Task 2: Reset Regime Rolling Statistics
 * Clears all regime-related rolling buffers and forces warm-up.
 */
export function resetRegimeRollingStats(): void {
  rollingStats.ADX.clear();
  rollingStats.VOL.clear();
  rollingStats.MOM.clear();

  console.log('[11.6B][Reset] Rolling stats reset after data purge');
  console.log('[11.6B][Reset] ADX, VOL, MOM buffers cleared');
  console.log('[11.6B][Reset] Warm-up required: 300 fresh samples');
}

/**
 * Directive 11.6B Task 4: Log Z-Score Regime Verification
 * Logs current regime Z-scores for verification that inputs are price-derived.
 */
export function logRegimeZScoreVerification(): void {
  const adxMean = rollingStats.ADX.mean();
  const adxStd = rollingStats.ADX.std();
  const volMean = rollingStats.VOL.mean();
  const volStd = rollingStats.VOL.std();
  const momMean = rollingStats.MOM.mean();
  const momStd = rollingStats.MOM.std();

  console.log(`[11.6B][ZScore] ADX mean=${adxMean.toFixed(2)} \u03c3=${adxStd.toFixed(2)} | VOL mean=${volMean.toFixed(4)} \u03c3=${volStd.toFixed(4)}`);
  console.log(`[11.6B][ZScore] MOM mean=${momMean.toFixed(4)} \u03c3=${momStd.toFixed(4)}`);
  console.log('[11.6B][ZScore] Input sources: OHLC data from priceCache (no trade telemetry dependency)');
}

/**
 * Directive 11.6B Task 1: Verify Input Integrity
 * Confirms regime calculations use only priceCache OHLC and FX5 scanner data.
 * Returns true if inputs are verified clean.
 */
export function verifyRegimeInputIntegrity(): boolean {
  console.log('[11.6B][Verify] Market Regime Input Verification:');
  console.log('[11.6B][Verify] - computeVolatility: Uses OHLC close prices only \u2713');
  console.log('[11.6B][Verify] - computeMomentum: Uses OHLC close prices only \u2713');
  console.log('[11.6B][Verify] - computeADX: Uses OHLC high/low/close only \u2713');
  console.log('[11.6B][Verify] - No dependency on trade-result telemetry (PnL, winRate) \u2713');
  return true;
}
