/**
 * ============================================================================
 * B63 -- Strong Bull Trend Strategy (Path D)
 * ============================================================================
 *
 * Type:      QUANT
 * Direction: BUY only (LONG)
 * Key:       strong_bull_trend
 *
 * The "continuation lane" for pairs in a confirmed strong positive directional
 * regime. Entry archetype is a Donchian-style N-bar breakout with confirmation
 * buffer and anti-exhaustion gates. Deliberately distinct from existing
 * reversal/pullback strategies — this rides trends, does not pick tops/bottoms.
 *
 * Gates (evaluated in order):
 *   1. DBS >= 0.35 (positive — LONG only)
 *   2. close > N6-bar high + 0.15 * ATR (real breakout with buffer) — B63.1: N reduced 12→6
 *   3. bar body <= 1.5 * ATR (anti-exhaustion — reject blow-off candles)
 *
 * B63.1 (2026-04-20): Slope-rising gate dropped — accounted for 55% of B63's detect nulls
 * without any evidence it filtered out bad trades. N reduced 12→6 to catch continuation
 * breakouts within sustained trends (41% of remaining nulls were "no_breakout" at N=12).
 *
 * Geometry (interim, pre-TEC):
 *   Entry:  close
 *   Stop:   entry - 3.0 * ATR
 *   Target: entry + 6.0 * ATR (2:1 R/R, TEC will replace in later batch)
 *
 * Confidence: 0.70 base + DBS magnitude bonus (up to +0.25), clamped [0.60, 0.95].
 *
 * Routing: Evaluates ONLY for pairs in sourcePool='quant-strong_trend' (family gate
 * enforced by vts-runner + signal-orchestrator). Belt-and-braces internal DBS guard
 * returns null if |DBS| < 0.35 regardless of routing.
 * ============================================================================
 */

import type { StrategySignal, TechnicalIndicators } from '../services/strategy-engine';
import { parseCandles } from './strategy-helpers';
import { setNullReason } from '../utils/null-reason-tracker.js';
import { getCachedNumberRequired, getCachedNumbersForModule } from '../services/module-constants-service.js';

// Strategy constants
// B72 (2026-05-05): SBT_DBS_MIN moved to module_constants.
//   module_name='strategy_dbs_routing_guards', strategy='strong_bull_trend',
//   constant_name='dbs_min_threshold', current value=0.35.
//   Group migrated atomically with parallel mutual-exclusion guards in
//   defensive_hedge.ts, reverse_impulse.ts, morning_star.ts.
//   Integration test: server/tests/integration/b72-dbs-routing-guards-consistency.test.ts
//   Reads via cached sync API; module is prefetched at server boot in
//   server/startup/b72-warmup.ts (no silent fallback per Kyle directive).

// (SBT_DBS_MIN + remaining 9 levers all migrated to module='strategy.strong_bull_trend';
// read in bulk at top of detect() below.)

const STRATEGY_KEY = 'strong_bull_trend';
const LOG_PREFIX = '[B63][STRONG_BULL_TREND]';

/**
 * Detect a Strong Bull Trend entry signal.
 *
 * @param indicators - Technical indicators including dbsScore, dbsSlope, atr
 * @param candles    - Raw candle array (parsed internally)
 * @param _patternSignal - Ignored (this strategy does not use pattern input)
 * @returns StrategySignal or null
 */
export function detectStrongBullTrend(
  indicators: TechnicalIndicators,
  candles: any[],
  _patternSignal: any | null
): StrategySignal | null {
  const dbs = indicators.dbsScore ?? 0;
  const dbsSlope = indicators.dbsSlope ?? 0;
  const atr = indicators.atr ?? 0;

  // B72: bulk read all strategy levers from module_constants.
  const c = getCachedNumbersForModule('strategy.strong_bull_trend', {
    exchange: '*', assetClass: '*', strategy: STRATEGY_KEY, regime: '*',
  });
  const SBT_DONCHIAN_N            = c.donchian_lookback_bars;
  const SBT_BREAKOUT_BUFFER_ATR   = c.breakout_buffer_atr_mult;
  const SBT_ANTI_EXHAUSTION_ATR   = c.anti_exhaustion_atr_mult;
  const SBT_STOP_ATR_MULT         = c.stop_loss_atr_multiplier;
  const SBT_TARGET_ATR_MULT       = c.target_exit_atr_multiplier;
  const SBT_BASE_CONFIDENCE       = c.base_confidence_score;
  const SBT_MAX_CONFIDENCE        = c.max_confidence_ceiling;
  const SBT_MIN_CONFIDENCE        = c.min_confidence_floor;
  const SBT_DBS_CONFIDENCE_WEIGHT = c.dbs_magnitude_confidence_weight;

  // B72: DBS routing-guard threshold from module_constants (group with the
  // 3 parallel guards in defensive_hedge / reverse_impulse / morning_star).
  const sbtDbsMin = getCachedNumberRequired(
    'strategy_dbs_routing_guards',
    'dbs_min_threshold',
    { exchange: '*', assetClass: '*', strategy: STRATEGY_KEY, regime: '*' },
  );

  // ── Gate 1: DBS magnitude + sign (LONG only) ─────────────────────────────
  if (dbs < sbtDbsMin) {
    setNullReason('dbs_below_threshold');
    return null;
  }

  // B63.1: Slope-rising gate REMOVED. Forensics (B63 first 7.5h) showed this gate
  // accounted for 55% of real detect-level nulls. A pair sitting at DBS=0.60 with
  // stable slope is still a strong trend worth riding — requiring strict acceleration
  // was too restrictive for a trend-riding strategy. DBS >= 0.35 alone is now the
  // directional authority; slope may be used as a confidence bonus in a future revision.
  // Slope value is still received via indicators.dbsSlope for future instrumentation.

  // ── ATR must be positive (required for stop/target geometry) ────────────
  if (atr <= 0) {
    setNullReason('atr_unavailable');
    return null;
  }

  // ── Parse candles ──────────────────────────────────────────────────────
  const ohlc = parseCandles(candles);
  if (ohlc.length < SBT_DONCHIAN_N + 2) {
    setNullReason('insufficient_data');
    return null;
  }

  // ── Gate 3: N-bar Donchian breakout with ATR buffer ─────────────────────
  // N-bar high EXCLUDES the current bar (comparing close vs prior N bars' highs).
  const priorBars = ohlc.slice(-(SBT_DONCHIAN_N + 1), -1);
  const nBarHigh = Math.max(...priorBars.map(c => c.high));
  const currentBar = ohlc[ohlc.length - 1];
  const breakoutBuffer = atr * SBT_BREAKOUT_BUFFER_ATR;
  if (currentBar.close <= nBarHigh + breakoutBuffer) {
    setNullReason('no_breakout');
    return null;
  }

  // ── Gate 4: Anti-exhaustion (body not absurd relative to ATR) ───────────
  const barBody = Math.abs(currentBar.close - currentBar.open);
  if (barBody > atr * SBT_ANTI_EXHAUSTION_ATR) {
    console.log(`${LOG_PREFIX} Anti-exhaustion gate: bar body ${barBody.toFixed(6)} > ${SBT_ANTI_EXHAUSTION_ATR}*ATR (${(atr * SBT_ANTI_EXHAUSTION_ATR).toFixed(6)}). Skipping blow-off candle.`);
    setNullReason('anti_exhaustion');
    return null;
  }

  // ── Entry geometry ──────────────────────────────────────────────────────
  const entryPrice = currentBar.close;
  const stopPrice = entryPrice - (atr * SBT_STOP_ATR_MULT);
  const targetPrice = entryPrice + (atr * SBT_TARGET_ATR_MULT);

  // Sanity: target above entry, stop below entry (guaranteed by constants but cheap to check).
  if (targetPrice <= entryPrice || stopPrice >= entryPrice) {
    console.warn(`${LOG_PREFIX} Geometry validation failed: entry=${entryPrice}, stop=${stopPrice}, target=${targetPrice}`);
    setNullReason('geometry_invalid');
    return null;
  }

  // ── Confidence: base + DBS magnitude bonus ──────────────────────────────
  const dbsBonus = Math.min(SBT_DBS_CONFIDENCE_WEIGHT, Math.abs(dbs) * SBT_DBS_CONFIDENCE_WEIGHT);
  let confidence = SBT_BASE_CONFIDENCE + dbsBonus;
  confidence = Math.min(SBT_MAX_CONFIDENCE, Math.max(SBT_MIN_CONFIDENCE, confidence));

  console.log(
    `${LOG_PREFIX} SIGNAL symbol=pair entry=${entryPrice.toFixed(6)} stop=${stopPrice.toFixed(6)} target=${targetPrice.toFixed(6)} ` +
    `DBS=${dbs.toFixed(3)} slope=${dbsSlope.toFixed(4)} nBarHigh=${nBarHigh.toFixed(6)} atr=${atr.toFixed(6)} confidence=${confidence.toFixed(3)}`
  );

  return {
    symbol: '', // Populated by caller
    strategy: STRATEGY_KEY as any,
    entryPrice,
    stopPrice,
    targetPrice,
    confidence,
    metadata: {
      directive: 'B63',
      type: 'QUANT',              // B63: mirrors morning_star's metadata.type pattern — consumers read signalType from canonical map but this provides parity
      direction: 'BUY',
      dbsScore: dbs,
      dbsSlope,
      nBarHigh,
      breakoutBuffer,
      barBody,
      atr,
      stopAtrMult: SBT_STOP_ATR_MULT,
      targetAtrMult: SBT_TARGET_ATR_MULT,
      interimExit: 'pre-TEC-2:1-fixed',
    },
  };
}
