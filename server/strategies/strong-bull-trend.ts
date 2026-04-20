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

// Strategy constants
const SBT_DBS_MIN = 0.35;              // Entry threshold (positive — LONG only)
// B63.1: N reduced 12 → 6 after forensics showed 41% of real nulls at N12 (pair in sustained
// uptrend rarely makes new 12-bar highs; 6-bar lookback catches continuation breakouts within trend).
const SBT_DONCHIAN_N = 6;              // N-bar lookback for breakout high
const SBT_BREAKOUT_BUFFER_ATR = 0.15;  // Min ATR fraction above N-bar high for valid breakout
const SBT_ANTI_EXHAUSTION_ATR = 1.5;   // Max bar body as multiple of ATR (reject blow-offs)
const SBT_STOP_ATR_MULT = 3.0;         // Initial stop: entry - 3*ATR
const SBT_TARGET_ATR_MULT = 6.0;       // Interim target (pre-TEC): entry + 6*ATR (2:1 RR)
const SBT_BASE_CONFIDENCE = 0.70;
const SBT_MAX_CONFIDENCE = 0.95;
const SBT_MIN_CONFIDENCE = 0.60;
const SBT_DBS_CONFIDENCE_WEIGHT = 0.25;

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

  // ── Gate 1: DBS magnitude + sign (LONG only) ─────────────────────────────
  if (dbs < SBT_DBS_MIN) {
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
