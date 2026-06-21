/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 12.3.2 — Strategy Shared Helpers
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Technical indicator calculations shared across all 8 new strategy modules.
 * These are pure functions with no external dependencies beyond basic math.
 *
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════
// Global Constants (from STRATEGY_SPECIFICATION_12.3.2_FINAL.md)
// ═══════════════════════════════════════════════════════════════

export const GLOBAL_CONSTANTS = {
  MIN_RR_RATIO: 1.5,
  ATR_PERIOD: 14,
  VOLUME_BASELINE_PERIOD: 20,
  MIN_PATTERN_STRENGTH: 0.55,
  ENTRY_PREMIUM_BPS: 10,       // 0.1% above current price
  MAX_CONFIDENCE: 1.0,
  MIN_CONFIDENCE: 0.0,
  MIN_STOP_DISTANCE_BPS: 30,   // 0.3% minimum stop distance (GUARD-1, Batch 18J: 20 → 30 per 4-LLM consensus)
  ATR_MIN_RATIO: 0.001,        // Reject if ATR(14) < price * 0.001
  ATR_MAX_RATIO: 0.10,         // Clamp: effectiveATR = min(ATR(14), price * 0.10)
} as const;

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface OHLCCandle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp?: number;
}

export interface PatternInput {
  pattern: string;
  direction: 'BUY' | 'SELL';
  strength: number;
  metadata?: Record<string, any>;
}

// ═══════════════════════════════════════════════════════════════
// Technical Indicator Calculations
// ═══════════════════════════════════════════════════════════════

/**
 * ATR (Average True Range) over N periods
 */
export function calculateATR(candles: OHLCCandle[], period: number = GLOBAL_CONSTANTS.ATR_PERIOD): number {
  if (candles.length < period + 1) return 0;

  const trueRanges: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const curr = candles[i];
    const prev = candles[i - 1];
    const highLow = curr.high - curr.low;
    const highClose = Math.abs(curr.high - prev.close);
    const lowClose = Math.abs(curr.low - prev.close);
    trueRanges.push(Math.max(highLow, highClose, lowClose));
  }

  // Use last `period` true ranges for the average
  const recent = trueRanges.slice(-period);
  return recent.reduce((sum, tr) => sum + tr, 0) / recent.length;
}

/**
 * RSI (Relative Strength Index) over N periods
 */
export function calculateRSI(candles: OHLCCandle[], period: number = 14): number {
  if (candles.length < period + 1) return 50; // Neutral default

  const changes: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    changes.push(candles[i].close - candles[i - 1].close);
  }

  const recent = changes.slice(-period);
  let avgGain = 0;
  let avgLoss = 0;

  for (const change of recent) {
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }

  avgGain /= period;
  avgLoss /= period;

  if (avgLoss === 0) return 100;
  if (avgGain === 0) return 0;

  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

/**
 * ADX (Average Directional Index) over N periods
 * Returns array of ADX values for slope calculation
 */
export function calculateADXSeries(candles: OHLCCandle[], period: number = 14): number[] {
  if (candles.length < period * 2) return [0];

  const trueRanges: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const curr = candles[i];
    const prev = candles[i - 1];
    const highLow = curr.high - curr.low;
    const highClose = Math.abs(curr.high - prev.close);
    const lowClose = Math.abs(curr.low - prev.close);
    trueRanges.push(Math.max(highLow, highClose, lowClose));

    const upMove = curr.high - prev.high;
    const downMove = prev.low - curr.low;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  // Compute DX values over sliding windows
  const dxValues: number[] = [];
  for (let i = period; i <= trueRanges.length; i++) {
    const slice = (arr: number[]) => arr.slice(i - period, i);
    const smoothedTR = slice(trueRanges).reduce((a, b) => a + b, 0);
    const smoothedPlusDM = slice(plusDM).reduce((a, b) => a + b, 0);
    const smoothedMinusDM = slice(minusDM).reduce((a, b) => a + b, 0);

    if (smoothedTR === 0) { dxValues.push(0); continue; }

    const plusDI = (smoothedPlusDM / smoothedTR) * 100;
    const minusDI = (smoothedMinusDM / smoothedTR) * 100;
    const diSum = plusDI + minusDI;
    if (diSum === 0) { dxValues.push(0); continue; }

    dxValues.push((Math.abs(plusDI - minusDI) / diSum) * 100);
  }

  // ADX = smoothed DX (simple average over period)
  if (dxValues.length < period) return dxValues.length > 0 ? dxValues : [0];

  const adxValues: number[] = [];
  for (let i = period; i <= dxValues.length; i++) {
    const avg = dxValues.slice(i - period, i).reduce((a, b) => a + b, 0) / period;
    adxValues.push(avg);
  }

  return adxValues.length > 0 ? adxValues : [0];
}

/**
 * Current ADX value (last element of ADX series)
 */
export function calculateADX(candles: OHLCCandle[], period: number = 14): number {
  const series = calculateADXSeries(candles, period);
  return series[series.length - 1] || 0;
}

/**
 * SMA (Simple Moving Average) of close prices
 */
export function calculateSMA(candles: OHLCCandle[], period: number): number {
  if (candles.length < period) return 0;
  const recent = candles.slice(-period);
  return recent.reduce((sum, c) => sum + c.close, 0) / period;
}

/**
 * Average volume over N periods
 */
export function calculateAvgVolume(candles: OHLCCandle[], period: number = GLOBAL_CONSTANTS.VOLUME_BASELINE_PERIOD): number {
  if (candles.length < period) return 0;
  const recent = candles.slice(-period);
  return recent.reduce((sum, c) => sum + c.volume, 0) / period;
}

/**
 * Momentum: (close[-1] - close[-n]) / close[-n]
 */
export function calculateMomentum(candles: OHLCCandle[], lookback: number = 14): number {
  if (candles.length < lookback) return 0;
  const start = candles[candles.length - lookback].close;
  const end = candles[candles.length - 1].close;
  if (start === 0) return 0;
  return (end - start) / start;
}

/**
 * Minimum momentum over a lookback window
 */
export function minMomentum(candles: OHLCCandle[], lookback: number): number {
  if (candles.length < lookback + 1) return 0;
  let minMom = Infinity;
  for (let i = candles.length - lookback; i < candles.length; i++) {
    if (i < 1) continue;
    const mom = (candles[i].close - candles[i - 1].close) / candles[i - 1].close;
    if (mom < minMom) minMom = mom;
  }
  return minMom === Infinity ? 0 : minMom;
}

/**
 * Standard deviation of returns over N periods
 */
export function calculateReturnStdDev(candles: OHLCCandle[], period: number): number {
  if (candles.length < period + 1) return 0;
  const returns: number[] = [];
  const slice = candles.slice(-(period + 1));
  for (let i = 1; i < slice.length; i++) {
    if (slice[i - 1].close > 0) {
      returns.push((slice[i].close - slice[i - 1].close) / slice[i - 1].close);
    }
  }
  if (returns.length === 0) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((acc, r) => acc + Math.pow(r - mean, 2), 0) / returns.length;
  return Math.sqrt(variance);
}

/**
 * Volatility percentile rank
 */
export function volatilityPercentile(candles: OHLCCandle[], window: number = 50): number {
  if (candles.length < window + 1) return 50;

  // Compute rolling volatilities
  const vols: number[] = [];
  for (let i = 14; i <= candles.length; i++) {
    const slice = candles.slice(Math.max(0, i - 14), i);
    if (slice.length < 2) continue;
    const returns: number[] = [];
    for (let j = 1; j < slice.length; j++) {
      if (slice[j - 1].close > 0) {
        returns.push((slice[j].close - slice[j - 1].close) / slice[j - 1].close);
      }
    }
    if (returns.length === 0) continue;
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((acc, r) => acc + Math.pow(r - mean, 2), 0) / returns.length;
    vols.push(Math.sqrt(variance));
  }

  if (vols.length < 2) return 50;

  const recentVols = vols.slice(-window);
  const currentVol = recentVols[recentVols.length - 1];
  const belowCount = recentVols.filter(v => v <= currentVol).length;
  return (belowCount / recentVols.length) * 100;
}

/**
 * Count momentum inversions (sign changes) over a lookback window
 */
export function countMomentumInversions(candles: OHLCCandle[], lookback: number = 20): number {
  if (candles.length < lookback + 1) return 0;
  const slice = candles.slice(-lookback - 1);
  let inversions = 0;
  let prevMom = 0;
  for (let i = 1; i < slice.length; i++) {
    const mom = slice[i].close - slice[i - 1].close;
    if (i > 1 && ((prevMom > 0 && mom < 0) || (prevMom < 0 && mom > 0))) {
      inversions++;
    }
    prevMom = mom;
  }
  return inversions;
}

/**
 * Spearman rank correlation between two return series
 */
export function spearmanRankCorrelation(seriesA: number[], seriesB: number[]): number {
  const n = Math.min(seriesA.length, seriesB.length);
  if (n < 3) return 0;

  const a = seriesA.slice(-n);
  const b = seriesB.slice(-n);

  const rankify = (arr: number[]): number[] => {
    const sorted = arr.map((v, i) => ({ v, i })).sort((x, y) => x.v - y.v);
    const ranks = new Array(arr.length);
    let i = 0;
    while (i < sorted.length) {
      let j = i;
      while (j < sorted.length && sorted[j].v === sorted[i].v) j++;
      const avgRank = (i + j - 1) / 2 + 1; // 1-based average rank for ties
      for (let k = i; k < j; k++) ranks[sorted[k].i] = avgRank;
      i = j;
    }
    return ranks;
  };

  const rankA = rankify(a);
  const rankB = rankify(b);

  // Pearson correlation on ranks
  const meanA = rankA.reduce((s, v) => s + v, 0) / n;
  const meanB = rankB.reduce((s, v) => s + v, 0) / n;
  let cov = 0, varA = 0, varB = 0;
  for (let i = 0; i < n; i++) {
    const da = rankA[i] - meanA;
    const db = rankB[i] - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }
  if (varA === 0 || varB === 0) return 0;
  return cov / Math.sqrt(varA * varB);
}

// ═══════════════════════════════════════════════════════════════
// Global Guards (applied before every signal)
// ═══════════════════════════════════════════════════════════════

/**
 * Compute effective ATR with guards
 * Returns null if ATR is too small (reject signal)
 */
export function getEffectiveATR(candles: OHLCCandle[], currentPrice: number): number | null {
  const atr = calculateATR(candles, GLOBAL_CONSTANTS.ATR_PERIOD);

  // GUARD-2: Reject if ATR too small
  if (atr < currentPrice * GLOBAL_CONSTANTS.ATR_MIN_RATIO) {
    return null;
  }

  // Clamp ATR to max ratio
  return Math.min(atr, currentPrice * GLOBAL_CONSTANTS.ATR_MAX_RATIO);
}

/** reorg-B2.1 OBJ-4: value-form of getEffectiveATR — apply the SAME min-floor + max-clamp to an
 *  ALREADY-COMPUTED raw ATR. The in-class detectors + orb/strong_bull_trend compute their own ATR and
 *  don't have a candle array handy at the guard call, so they feed the raw value through this to get the
 *  guard's clamped ATR (identical contract to getEffectiveATR; returns null → guard `invalid_atr` drop). */
export function clampEffectiveATR(rawATR: number, currentPrice: number): number | null {
  if (!(rawATR > 0) || rawATR < currentPrice * GLOBAL_CONSTANTS.ATR_MIN_RATIO) return null;
  return Math.min(rawATR, currentPrice * GLOBAL_CONSTANTS.ATR_MAX_RATIO);
}

/**
 * Validate stop distance (GUARD-1)
 */
export function validateStopDistance(entryPrice: number, stopPrice: number): boolean {
  const distance = Math.abs(entryPrice - stopPrice) / entryPrice;
  return distance >= GLOBAL_CONSTANTS.MIN_STOP_DISTANCE_BPS / 10000;
}

/**
 * reorg-B2.1: a per-class target gate (resolved by the CALLER via `getPerClassTargetGate(assetClass)`
 * and injected here). This keeps strategy-helpers a PURE leaf module — it consumes the resolved shape
 * and never reaches into the module-constants DB resolver itself (preserves the "DO NOT MODIFY / no
 * external deps" contract; Langston design call 2026-06-21). The SSOT stays at the one cached resolver.
 */
export interface PerClassGuardGate {
  minRR: number;       // per-class minimum reward-to-risk (expectancy_gates.min_rr)
  reachAtrMax: number; // per-class max ATRs-to-target (expectancy_gates.reach_atr_max)
}

/**
 * Validate reward-to-risk ratio (GUARD-4). reorg-B2.1: per-class `minRR` is INJECTED (one SSOT at the
 * resolver) — the hardcoded `GLOBAL_CONSTANTS.MIN_RR_RATIO=1.5` no longer gates (it stays only as the
 * coherency seed/floor; the live threshold is the per-class value, killing the prior 1.5-vs-2.5 split-brain).
 */
export function validateRR(entryPrice: number, stopPrice: number, targetPrice: number, minRR: number): boolean {
  const risk = Math.abs(entryPrice - stopPrice);
  const reward = Math.abs(targetPrice - entryPrice);
  if (risk === 0) return false;
  return (reward / risk) >= minRR;
}

/**
 * Validate target reachability (reorg-B2.1, GUARD-5): the target must be physically traversable within
 * the per-class ATR horizon — `atrsToTarget = |target−entry| / effectiveATR ≤ reachAtrMax`. Assumes
 * `effectiveATR > 0` (applyGlobalGuards rejects `effectiveATR===null` first; getEffectiveATR already
 * floors ATR at ATR_MIN_RATIO), so there is no invalid-ATR case to mask here.
 */
export function validateReachability(entryPrice: number, targetPrice: number, effectiveATR: number, reachAtrMax: number): boolean {
  if (!(effectiveATR > 0)) return false;
  const atrsToTarget = Math.abs(targetPrice - entryPrice) / effectiveATR;
  return atrsToTarget <= reachAtrMax;
}

/** reorg-B2.1 OBJ-4: the guard verdict + the computed values, so a caller can BOTH gate (`pass`) AND
 *  record the suppression instrumentation (`rr` / `dropReason`) from ONE computation — no duplicate math. */
export type GuardDropReason = 'invalid_atr' | 'stop_distance' | 'rr_below_min' | 'unreachable' | null;
export interface GuardResult {
  pass: boolean;
  rr: number;           // reward-to-risk (for the #372 suppression distribution)
  atrsToTarget: number; // reachability metric (for the #371 ATR-divergence measurement)
  dropReason: GuardDropReason;
}

/**
 * Apply all global guards. reorg-B2.1: takes the injected per-class `gate` ({minRR, reachAtrMax}) —
 * pure, no DB resolution here — enforces stop-distance + RR + reachability (GUARD-5), and returns the
 * verdict WITH the computed `rr`/`atrsToTarget`/`dropReason` so the call site can feed the suppression
 * tracker without recomputing. Consolidates the gates the signal-target-normalizer applied so they run
 * at signal generation for ALL strategies (the 8 already-gated file-based + the 10 wired in OBJ-4).
 */
export function applyGlobalGuards(
  entryPrice: number,
  stopPrice: number,
  targetPrice: number,
  effectiveATR: number | null,
  gate: PerClassGuardGate
): GuardResult {
  const risk = Math.abs(entryPrice - stopPrice);
  const rr = risk > 0 ? Math.abs(targetPrice - entryPrice) / risk : 0;
  const atrsToTarget = (effectiveATR !== null && effectiveATR > 0) ? Math.abs(targetPrice - entryPrice) / effectiveATR : Number.POSITIVE_INFINITY;
  if (effectiveATR === null)                                                  return { pass: false, rr, atrsToTarget, dropReason: 'invalid_atr' };
  if (!validateStopDistance(entryPrice, stopPrice))                           return { pass: false, rr, atrsToTarget, dropReason: 'stop_distance' };
  if (!validateRR(entryPrice, stopPrice, targetPrice, gate.minRR))            return { pass: false, rr, atrsToTarget, dropReason: 'rr_below_min' };
  if (!validateReachability(entryPrice, targetPrice, effectiveATR, gate.reachAtrMax)) return { pass: false, rr, atrsToTarget, dropReason: 'unreachable' };
  return { pass: true, rr, atrsToTarget, dropReason: null };
}

/**
 * Clamp confidence to [0, 1]
 */
export function clampConfidence(value: number): number {
  return Math.max(GLOBAL_CONSTANTS.MIN_CONFIDENCE, Math.min(GLOBAL_CONSTANTS.MAX_CONFIDENCE, value));
}

/**
 * Parse candle data from various formats into OHLCCandle
 */
export function parseCandles(rawCandles: any[]): OHLCCandle[] {
  return rawCandles.map(c => ({
    open: parseFloat(c.open || c[1] || 0),
    high: parseFloat(c.high || c[2] || 0),
    low: parseFloat(c.low || c[3] || 0),
    close: parseFloat(c.close || c[4] || 0),
    volume: parseFloat(c.volume || c[6] || 0),
    timestamp: parseFloat(c.timestamp || c[0] || Date.now())
  }));
}

/**
 * Find local minima in candle lows for support level identification
 */
export function findLocalMinima(candles: OHLCCandle[], lookback: number = 50): number[] {
  const slice = candles.slice(-lookback);
  const minima: number[] = [];
  for (let i = 1; i < slice.length - 1; i++) {
    if (slice[i].low < slice[i - 1].low && slice[i].low < slice[i + 1].low) {
      minima.push(slice[i].low);
    }
  }
  return minima;
}
