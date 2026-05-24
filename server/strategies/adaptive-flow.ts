/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 12.3.2 — adaptive_flow Strategy Implementation
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Type:        HYBRID (pattern + indicator)
 * Direction:   BUY only
 * Regime:      LOW_VOL_CHOP — range-bound, directionless markets
 *
 * Identifies three-white-soldiers breakout setups within low-trend (low ADX),
 * high-inversion, high-volatility-percentile environments. Targets a
 * measured move with a wide ATR-based stop for the choppy context.
 *
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import type { StrategySignal, TechnicalIndicators } from '../services/strategy-engine';
import type { PriceData } from '@shared/schema';
import type { AssetClass } from '@shared/asset-classes';
import {
  calculateATR, calculateRSI, calculateSMA, calculateAvgVolume, calculateMomentum,
  minMomentum, calculateADXSeries, calculateADX, calculateReturnStdDev,
  volatilityPercentile, countMomentumInversions, spearmanRankCorrelation,
  getEffectiveATR, applyGlobalGuards, clampConfidence, parseCandles,
  findLocalMinima, GLOBAL_CONSTANTS,
  type OHLCCandle, type PatternInput
} from './strategy-helpers';
import { REGIMES } from '../config/canonical-regime-strategy-map';
import { setNullReason } from '../utils/null-reason-tracker.js';
// B72 (2026-05-05): all strategy levers moved to module='strategy.adaptive_flow'.
// Read in bulk via getCachedNumbersForModule at top of detect(). Module is
// prefetched at server boot in server/startup/b72-warmup.ts.
// AF_STOP_BUFFER (0.003) remains hardcoded — KEEP per LEVER_INVENTORY (structural geometric buffer).
import { getCachedNumbersForModule } from '../services/module-constants-service.js';

// ═══════════════════════════════════════════════════════════════
// Strategy Constants — pre-B72 hardcoded literals migrated to
// module_constants. The structural buffer below is KEEP per inventory.
// ═══════════════════════════════════════════════════════════════
const AF_STOP_BUFFER           = 0.003;

const STRATEGY_KEY = 'adaptive_flow';
const LOG_PREFIX   = '[12.3.2][ADAPTIVE_FLOW]';

// ═══════════════════════════════════════════════════════════════
// Detection Function
// ═══════════════════════════════════════════════════════════════

/**
 * Detect an adaptive-flow BUY signal.
 *
 * Targets low-ADX, choppy environments where a THREE_SOLDIERS pattern
 * emerges with sufficient momentum inversions and elevated volatility
 * percentile, signalling a directional breakout from the chop.
 *
 * @param indicators    - Current technical indicator snapshot
 * @param candles       - Raw candle array (will be parsed internally)
 * @param patternSignal - Pattern detection result (expects THREE_SOLDIERS / BUY)
 * @returns StrategySignal or null if conditions are not met
 */
export function detectAdaptiveFlow(
  indicators: TechnicalIndicators,
  candles: any[],
  patternSignal: PatternInput | null,
  assetClass: AssetClass,  // B79.0n.STRATEGY — REQUIRED per-class scope
): StrategySignal | null {
  // B72: bulk read all strategy levers from module_constants.
  // B79.0n.STRATEGY: per-class resolver scope.
  const c = getCachedNumbersForModule('strategy.adaptive_flow', {
    exchange: '*', assetClass, strategy: STRATEGY_KEY, regime: '*',
  });
  const AF_LOOKBACK              = c.momentum_inversion_lookback_bars;
  const AF_MIN_INVERSIONS        = c.min_momentum_inversions;
  const AF_VOL_PERCENTILE_WINDOW = c.volatility_percentile_window_bars;
  const AF_MIN_VOL_PERCENTILE    = c.min_volatility_percentile;
  const AF_VOL_MULT              = c.volume_threshold_multiplier;
  const AF_ADX_MAX               = c.max_adx_trending_threshold;
  const AF_STOP_ATR_MULT         = c.stop_loss_atr_multiplier;
  const AF_TARGET_ATR_MULT       = c.target_exit_atr_multiplier;
  const AF_PATTERN_WEIGHT        = c.pattern_strength_confidence_weight;
  const AF_INVERSION_RATE        = c.inversion_count_confidence_rate;
  const AF_MAX_INVERSION_BONUS   = c.inversion_confidence_bonus_max;
  const AF_VOL_PCT_WEIGHT        = c.volatility_percentile_confidence_weight;
  const AF_HIGH_VOL_BONUS        = c.high_volume_confidence_bonus;

  // ── Parse candles ──────────────────────────────────────────
  const ohlc = parseCandles(candles);
  if (ohlc.length < AF_VOL_PERCENTILE_WINDOW + 15) {
    console.log(`${LOG_PREFIX} Insufficient candles: ${ohlc.length}`);
    setNullReason('insufficient_data');
    return null;
  }

  const { currentPrice } = indicators;

  // ── Pattern gate ───────────────────────────────────────────
  if (!patternSignal) {
    console.log(`${LOG_PREFIX} No pattern signal`);
    setNullReason('no_pattern');
    return null;
  }
  // B57: THREE_SOLDIERS canonicalizes to MORNING_STAR — accept both names
  if ((patternSignal.pattern !== 'THREE_SOLDIERS' && patternSignal.pattern !== 'MORNING_STAR') || patternSignal.direction !== 'BUY') {
    console.log(`${LOG_PREFIX} Pattern mismatch: ${patternSignal.pattern}/${patternSignal.direction}`);
    setNullReason('no_pattern');
    return null;
  }
  if (patternSignal.strength < 0.50) {  // Crypto-calibrated (Batch 18H): 0.55 → 0.50
    console.log(`${LOG_PREFIX} Strength too low: ${patternSignal.strength.toFixed(3)} < 0.50`);
    setNullReason('weak_pattern');
    return null;
  }

  // ── Momentum inversion gate ────────────────────────────────
  const inversionCount = countMomentumInversions(ohlc, AF_LOOKBACK);
  if (inversionCount < AF_MIN_INVERSIONS) {
    console.log(`${LOG_PREFIX} Too few inversions: ${inversionCount} < ${AF_MIN_INVERSIONS}`);
    setNullReason('indicator_filter');
    return null;
  }

  // ── Volatility percentile gate ─────────────────────────────
  const volPercentile = volatilityPercentile(ohlc, AF_VOL_PERCENTILE_WINDOW);
  if (volPercentile < AF_MIN_VOL_PERCENTILE) {
    console.log(`${LOG_PREFIX} Vol percentile too low: ${volPercentile.toFixed(2)} < ${AF_MIN_VOL_PERCENTILE}`);
    setNullReason('volatility_filter');
    return null;
  }

  // ── Volume gate ────────────────────────────────────────────
  const avgVol = calculateAvgVolume(ohlc, GLOBAL_CONSTANTS.VOLUME_BASELINE_PERIOD);
  const lastCandle = ohlc[ohlc.length - 1];
  const currentVolume = lastCandle.volume;

  if (avgVol <= 0 || currentVolume < avgVol * AF_VOL_MULT) {
    console.log(`${LOG_PREFIX} Volume too low: ${currentVolume.toFixed(2)} < ${(avgVol * AF_VOL_MULT).toFixed(2)}`);
    setNullReason('volume_insufficient');
    return null;
  }

  // ── ADX anti-trend gate ────────────────────────────────────
  const adx = calculateADX(ohlc, 14);
  if (adx >= AF_ADX_MAX) {
    console.log(`${LOG_PREFIX} ADX too high (trending): ${adx.toFixed(2)} >= ${AF_ADX_MAX}`);
    setNullReason('indicator_filter');
    return null;
  }

  // ── ATR & Effective ATR ────────────────────────────────────
  const effectiveATR = getEffectiveATR(ohlc, currentPrice);
  if (effectiveATR === null) {
    console.log(`${LOG_PREFIX} ATR guard rejected signal`);
    setNullReason('guard_fail');
    return null;
  }

  // ── Price levels ───────────────────────────────────────────
  const entryPrice = currentPrice * 1.001;

  // Three soldiers low: minimum low of the last 3 candles
  const threeSoldiersLow = Math.min(
    ohlc[ohlc.length - 1].low,
    ohlc[ohlc.length - 2].low,
    ohlc[ohlc.length - 3].low
  );

  // Stop: pick the wider (more protective) of pattern-based and ATR-based
  const patternStop = threeSoldiersLow * (1 - AF_STOP_BUFFER);
  const atrStop     = entryPrice - AF_STOP_ATR_MULT * effectiveATR;
  const stopPrice   = Math.min(patternStop, atrStop);

  const targetPrice = entryPrice + AF_TARGET_ATR_MULT * effectiveATR;

  // ── Global guards ──────────────────────────────────────────
  if (!applyGlobalGuards(entryPrice, stopPrice, targetPrice, effectiveATR)) {
    console.log(`${LOG_PREFIX} Global guards rejected signal`);
    setNullReason('guard_fail');
    return null;
  }

  // ── Confidence scoring ─────────────────────────────────────
  const patternScore    = patternSignal.strength * AF_PATTERN_WEIGHT;
  const inversionScore  = Math.min(AF_MAX_INVERSION_BONUS, (inversionCount - AF_MIN_INVERSIONS + 1) * AF_INVERSION_RATE);
  const volPctScore     = ((volPercentile - AF_MIN_VOL_PERCENTILE) / (100 - AF_MIN_VOL_PERCENTILE)) * AF_VOL_PCT_WEIGHT;
  const volumeBonus     = (currentVolume >= avgVol * 1.8) ? AF_HIGH_VOL_BONUS : 0;

  const rawConfidence   = patternScore + inversionScore + volPctScore + volumeBonus;
  const confidence      = clampConfidence(Math.min(rawConfidence, 0.88));

  console.log(`${LOG_PREFIX} Signal detected`, JSON.stringify({
    entryPrice: entryPrice.toFixed(6),
    stopPrice: stopPrice.toFixed(6),
    targetPrice: targetPrice.toFixed(6),
    confidence: confidence.toFixed(4),
    components: {
      patternScore: patternScore.toFixed(4),
      inversionScore: inversionScore.toFixed(4),
      volPctScore: volPctScore.toFixed(4),
      volumeBonus: volumeBonus.toFixed(4),
    },
    indicators: {
      inversionCount,
      volPercentile: volPercentile.toFixed(2),
      adx: adx.toFixed(2),
      currentVolume: currentVolume.toFixed(2),
      avgVolume: avgVol.toFixed(2),
      effectiveATR: effectiveATR.toFixed(6),
      threeSoldiersLow: threeSoldiersLow.toFixed(6),
      patternStop: patternStop.toFixed(6),
      atrStop: atrStop.toFixed(6),
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
      regime: REGIMES.RANGE_BOUND_STABLE,
      pattern: 'THREE_SOLDIERS',
      patternStrength: patternSignal.strength,
      inversionCount,
      volPercentile,
      adx,
      currentVolume,
      avgVolume: avgVol,
      effectiveATR,
      threeSoldiersLow,
      components: {
        patternScore,
        inversionScore,
        volPctScore,
        volumeBonus,
      },
    },
  };
}

/**
 * Default export — `detect` entry-point for the strategy engine.
 */
export const detect = detectAdaptiveFlow;
