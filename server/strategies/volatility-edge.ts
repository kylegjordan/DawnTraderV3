/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 12.3.2 — volatility_edge Strategy Implementation
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Type:        HYBRID (pattern + indicator)
 * Direction:   BUY only
 * Regime:      HIGH_VOL_IMPULSE — breakout from ABCD measured-move pattern
 *
 * Identifies ABCD harmonic patterns with a volatility edge: the A-point
 * forms on extreme volume, the C-point holds above VWAP, and the breakout
 * above cPointHigh is confirmed by elevated volume and high volatility
 * percentile. Targets a conservative measured-move or ATR-based exit.
 *
 * BUG-4 FIX: Uses symmetric Fibonacci quality metric centered on 0.618
 * to avoid divide-by-zero at exact golden ratio retracement.
 *
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import type { StrategySignal, TechnicalIndicators } from '../services/strategy-engine';
import type { PriceData } from '@shared/schema';
import {
  calculateATR, calculateRSI, calculateSMA, calculateAvgVolume, calculateMomentum,
  minMomentum, calculateADXSeries, calculateADX, calculateReturnStdDev,
  volatilityPercentile, countMomentumInversions, spearmanRankCorrelation,
  getEffectiveATR, applyGlobalGuards, clampConfidence, parseCandles,
  findLocalMinima, GLOBAL_CONSTANTS,
  type OHLCCandle, type PatternInput
} from './strategy-helpers';
import { REGIMES } from '../config/canonical-regime-strategy-map';

// ═══════════════════════════════════════════════════════════════
// Strategy Constants
// ═══════════════════════════════════════════════════════════════

const VE_A_VOL_MULT          = 2.0;
const VE_MIN_VOL_PERCENTILE  = 80;
const VE_BREAKOUT_BUFFER     = 0.002;
const VE_BREAKOUT_VOL_MULT   = 1.5;
const VE_STOP_BUFFER         = 0.003;
const VE_MEASURED_MOVE_MULT  = 0.85;
const VE_TARGET_ATR_MULT     = 2.5;
const VE_BASE_CONFIDENCE     = 0.40;
const VE_VOL_PCT_WEIGHT      = 0.20;
const VE_FIB_WEIGHT          = 0.20;
const VE_VOL_SCORE_RATE      = 0.05;
const VE_MAX_VOL_BONUS       = 0.15;

const STRATEGY_KEY = 'volatility_edge';
const LOG_PREFIX   = '[12.3.2][VOLATILITY_EDGE]';

// ═══════════════════════════════════════════════════════════════
// Detection Function
// ═══════════════════════════════════════════════════════════════

/**
 * Detect a volatility-edge BUY signal on an ABCD harmonic pattern.
 *
 * Expects ABCD metadata from the pattern detector:
 *   - aPointLow, bPointHigh, cPointLow, cPointHigh
 *
 * The strategy validates the A-point formed on extreme volume, the
 * C-point holds above VWAP, breakout above cPointHigh is confirmed,
 * and the overall volatility regime is elevated.
 *
 * @param indicators    - Current technical indicator snapshot (must include vwap)
 * @param candles       - Raw candle array (will be parsed internally)
 * @param patternSignal - Pattern detection result (expects ABCD-like with metadata)
 * @returns StrategySignal or null if conditions are not met
 */
export function detectVolatilityEdge(
  indicators: TechnicalIndicators,
  candles: any[],
  patternSignal: PatternInput | null
): StrategySignal | null {
  // ── Parse candles ──────────────────────────────────────────
  const ohlc = parseCandles(candles);
  if (ohlc.length < 50 + 15) {
    console.log(`${LOG_PREFIX} Insufficient candles: ${ohlc.length}`);
    return null;
  }

  const { currentPrice, vwap } = indicators;

  // ── Pattern gate — ABCD metadata required ──────────────────
  if (!patternSignal) {
    console.log(`${LOG_PREFIX} No pattern signal`);
    return null;
  }

  const meta = patternSignal.metadata;
  if (
    !meta ||
    typeof meta.aPointLow !== 'number' ||
    typeof meta.bPointHigh !== 'number' ||
    typeof meta.cPointLow !== 'number' ||
    typeof meta.cPointHigh !== 'number'
  ) {
    console.log(`${LOG_PREFIX} Missing ABCD metadata fields (aPointLow, bPointHigh, cPointLow, cPointHigh)`);
    return null;
  }

  const { aPointLow, bPointHigh, cPointLow, cPointHigh } = meta;

  // ── Volume at A-point gate ─────────────────────────────────
  const avgVol = calculateAvgVolume(ohlc, GLOBAL_CONSTANTS.VOLUME_BASELINE_PERIOD);
  // Use metadata aPointVolume if available, otherwise approximate with a
  // candle near the A-point (the caller's pattern detector typically stores
  // the volume). Fallback: use the last candle volume as a proxy.
  const aPointVolume: number = meta.aPointVolume ?? ohlc[ohlc.length - 1].volume;

  if (avgVol <= 0 || aPointVolume < avgVol * VE_A_VOL_MULT) {
    console.log(`${LOG_PREFIX} A-point volume too low: ${aPointVolume.toFixed(2)} < ${(avgVol * VE_A_VOL_MULT).toFixed(2)}`);
    return null;
  }

  // ── Volatility percentile gate ─────────────────────────────
  const volPercentile = volatilityPercentile(ohlc, 50);
  if (volPercentile < VE_MIN_VOL_PERCENTILE) {
    console.log(`${LOG_PREFIX} Vol percentile too low: ${volPercentile.toFixed(2)} < ${VE_MIN_VOL_PERCENTILE}`);
    return null;
  }

  // ── C-point above VWAP gate ────────────────────────────────
  if (cPointLow <= vwap) {
    console.log(`${LOG_PREFIX} C-point low (${cPointLow.toFixed(6)}) <= VWAP (${vwap.toFixed(6)})`);
    return null;
  }

  // ── Breakout confirmation ──────────────────────────────────
  if (currentPrice <= cPointHigh * (1 + VE_BREAKOUT_BUFFER)) {
    console.log(`${LOG_PREFIX} No breakout: price ${currentPrice.toFixed(6)} <= cPointHigh*1.002 (${(cPointHigh * (1 + VE_BREAKOUT_BUFFER)).toFixed(6)})`);
    return null;
  }

  // ── Breakout volume gate ───────────────────────────────────
  const lastCandle = ohlc[ohlc.length - 1];
  const breakoutVolume = lastCandle.volume;
  if (breakoutVolume < avgVol * VE_BREAKOUT_VOL_MULT) {
    console.log(`${LOG_PREFIX} Breakout volume too low: ${breakoutVolume.toFixed(2)} < ${(avgVol * VE_BREAKOUT_VOL_MULT).toFixed(2)}`);
    return null;
  }

  // ── ATR & Effective ATR ────────────────────────────────────
  const effectiveATR = getEffectiveATR(ohlc, currentPrice);
  if (effectiveATR === null) {
    console.log(`${LOG_PREFIX} ATR guard rejected signal`);
    return null;
  }

  // ── Price levels ───────────────────────────────────────────
  const entryPrice = cPointHigh * (1 + VE_BREAKOUT_BUFFER);
  const stopPrice  = cPointLow * (1 - VE_STOP_BUFFER);

  // Measured-move target: cPointLow + (B-A leg) * 0.85
  const measuredMoveTarget = cPointLow + (bPointHigh - aPointLow) * VE_MEASURED_MOVE_MULT;
  const atrTarget          = entryPrice + VE_TARGET_ATR_MULT * effectiveATR;

  // Conservative: take the smaller (closer) target
  const targetPrice = Math.min(measuredMoveTarget, atrTarget);

  // ── Global guards ──────────────────────────────────────────
  if (!applyGlobalGuards(entryPrice, stopPrice, targetPrice, effectiveATR)) {
    console.log(`${LOG_PREFIX} Global guards rejected signal`);
    return null;
  }

  // ── BC Retrace & Fibonacci quality (BUG-4 fix) ─────────────
  const abLeg = bPointHigh - aPointLow;
  const bcRetrace = abLeg > 0
    ? (bPointHigh - cPointLow) / abLeg
    : 0;

  // BUG-4: Symmetric quality metric centered on golden ratio (0.618).
  // fibQuality = max(0, 1 - |bcRetrace - 0.618| / 0.382)
  // This avoids any divide-by-zero and degrades gracefully away from 0.618.
  const fibQuality = Math.max(0, 1.0 - Math.abs(bcRetrace - 0.618) / 0.382);

  // ── Confidence scoring ─────────────────────────────────────
  const patternScore = VE_BASE_CONFIDENCE;
  const volPctScore  = ((volPercentile - VE_MIN_VOL_PERCENTILE) / (100 - VE_MIN_VOL_PERCENTILE)) * VE_VOL_PCT_WEIGHT;
  const fibScore     = fibQuality * VE_FIB_WEIGHT;
  const volumeScore  = Math.min(VE_MAX_VOL_BONUS, (aPointVolume / avgVol - 1) * VE_VOL_SCORE_RATE);

  const rawConfidence = patternScore + volPctScore + fibScore + volumeScore;
  const confidence    = clampConfidence(Math.min(rawConfidence, 0.95));

  console.log(`${LOG_PREFIX} Signal detected`, JSON.stringify({
    entryPrice: entryPrice.toFixed(6),
    stopPrice: stopPrice.toFixed(6),
    targetPrice: targetPrice.toFixed(6),
    confidence: confidence.toFixed(4),
    components: {
      patternScore: patternScore.toFixed(4),
      volPctScore: volPctScore.toFixed(4),
      fibScore: fibScore.toFixed(4),
      volumeScore: volumeScore.toFixed(4),
    },
    abcdPoints: {
      aPointLow: aPointLow.toFixed(6),
      bPointHigh: bPointHigh.toFixed(6),
      cPointLow: cPointLow.toFixed(6),
      cPointHigh: cPointHigh.toFixed(6),
    },
    indicators: {
      bcRetrace: bcRetrace.toFixed(4),
      fibQuality: fibQuality.toFixed(4),
      volPercentile: volPercentile.toFixed(2),
      aPointVolume: aPointVolume.toFixed(2),
      breakoutVolume: breakoutVolume.toFixed(2),
      avgVolume: avgVol.toFixed(2),
      effectiveATR: effectiveATR.toFixed(6),
      vwap: vwap.toFixed(6),
      measuredMoveTarget: measuredMoveTarget.toFixed(6),
      atrTarget: atrTarget.toFixed(6),
    },
  }));

  return {
    symbol: '',   // Set by caller
    strategy: STRATEGY_KEY as any,
    entryPrice,
    stopPrice,
    targetPrice,
    confidence,
    metadata: {
      strategyVersion: '12.3.2',
      type: 'HYBRID',
      direction: 'BUY',
      regime: REGIMES.IMPULSE_EXPANSION,
      pattern: 'ABCD',
      aPointLow,
      bPointHigh,
      cPointLow,
      cPointHigh,
      bcRetrace,
      fibQuality,
      volPercentile,
      aPointVolume,
      breakoutVolume,
      avgVolume: avgVol,
      effectiveATR,
      vwap,
      measuredMoveTarget,
      atrTarget,
      components: {
        patternScore,
        volPctScore,
        fibScore,
        volumeScore,
      },
    },
  };
}

/**
 * Default export — `detect` entry-point for the strategy engine.
 */
export const detect = detectVolatilityEdge;
