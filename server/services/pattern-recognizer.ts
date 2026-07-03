/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔒 LOCKED MODULE — Directive 10.2
 * ══════════════════════════════════════════════════════════════════════════════
 * Pattern Recognizer Service - Candlestick Pattern Detection
 * 
 * Purpose: Analyzes OHLCV candle data to detect specific candlestick formations
 * for integration with Signal Orchestrator and VTS pipeline.
 * 
 * Supported Patterns:
 * - PINBAR (Golden Pinbar): Wick > 1.5× Body, wick opposite trade direction (B54: relaxed from 2× for crypto)
 * - ENGULFING (Momentum Engulfing): Body fully engulfs prior body, volume spike
 * - INSIDE_BAR: High < PrevHigh AND Low > PrevLow (compression setup, B54: 0.1% tolerance)
 * - THREE_SOLDIERS: Three consecutive bullish candles, each closing higher
 * - MORNING_STAR: Bear → Doji/Small → Bull (closing > halfway into first)
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import type { PatternType, SignalType, Candle, PatternSignal, Timeframe } from '../types';
import { CANDLE_INTERVALS_MS, TIMEFRAME_WEIGHTS, HYBRID_PARAMS } from '../config/system-guards.js';
// B79.0n.PATTERN-DETECT (2026-05-24) — REQUIRED-assetClass plumbing per
// CLAUDE.md NO PATCHES (rule 15). The 6 detect functions + scanPatterns +
// patternToTradeSignal now type-enforce per-class scoping at the signature.
// Body branching deferred to Layer-3 (xStock shadow-mode evidence). See
// B79_0n_PATTERN_DETECT_SCOPE.md §3 + pre-audit §-8/§-9 for the deferral
// rationale. AssetClass parameter is plumbed through without behavioural
// change — crypto numerics stay byte-identical (NONE-by-construction).
import type { AssetClass } from '@shared/asset-classes';

export type { PatternType, SignalType, Candle, PatternSignal, Timeframe };

/**
 * Directive 10.7: Get timeframe weight for strength adjustment.
 * Higher timeframes (1h) carry more weight than lower ones (5m).
 */
export function getTimeframeWeight(timeframe: Timeframe | undefined): number {
  if (!timeframe) return 1.0;
  return TIMEFRAME_WEIGHTS[timeframe] || 1.0;
}

/**
 * Directive 10.7: Calculate timeframe-adjusted decay lambda.
 * Lower timeframes have faster decay to account for higher noise.
 */
export function getTimeframeAdjustedLambda(baseLambda: number, timeframe: Timeframe | undefined): number {
  if (!timeframe) return baseLambda;
  const baseInterval = CANDLE_INTERVALS_MS['1h'];
  const targetInterval = CANDLE_INTERVALS_MS[timeframe];
  return baseLambda * (baseInterval / targetInterval);
}

/**
 * Directive 10.7: Apply timeframe-aware strength adjustment.
 * Scales raw pattern strength by timeframe weight.
 */
export function applyTimeframeWeightedStrength(
  rawStrength: number,
  timeframe: Timeframe | undefined
): number {
  const weight = getTimeframeWeight(timeframe);
  return rawStrength * weight;
}

/**
 * Calculate candle body size (absolute)
 */
function bodySize(candle: Candle): number {
  return Math.abs(candle.close - candle.open);
}

/**
 * Calculate upper wick size
 */
function upperWick(candle: Candle): number {
  return candle.high - Math.max(candle.open, candle.close);
}

/**
 * Calculate lower wick size
 */
function lowerWick(candle: Candle): number {
  return Math.min(candle.open, candle.close) - candle.low;
}

/**
 * Check if candle is bullish (close > open)
 */
function isBullish(candle: Candle): boolean {
  return candle.close > candle.open;
}

/**
 * Check if candle is bearish (close < open)
 */
function isBearish(candle: Candle): boolean {
  return candle.close < candle.open;
}

/**
 * Calculate candle range (high - low)
 */
function candleRange(candle: Candle): number {
  return candle.high - candle.low;
}

/**
 * Detect Golden Pinbar pattern
 * Wick > 1.5× Body; wick opposite trade direction
 * B54: Relaxed from 2× to 1.5× for crypto (wicky candles are normal).
 * Directional dominance (wick > 2× opposite wick) retained as quality filter.
 */
function detectPinbar(candles: Candle[], symbol: string, avgVolume: number, assetClass: AssetClass): PatternSignal | null {  // B79.0n.PATTERN-DETECT — REQUIRED per-class scope (plumbing-only; body unchanged)
  if (candles.length < 2) return null;
  
  const current = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const body = bodySize(current);
  const range = candleRange(current);
  
  if (body === 0 || range === 0) return null;
  
  const upperW = upperWick(current);
  const lowerW = lowerWick(current);
  
  // Bullish Pinbar: Long lower wick (> 1.5x body), small upper wick
  // B54: Relaxed from 2x to 1.5x for crypto. Directional dominance (2x opposite wick) retained.
  if (lowerW > 1.5 * body && lowerW > upperW * 2) {
    const strength = Math.min(1.0, (lowerW / body) / 4); // Normalize strength
    return {
      symbol,
      pattern: 'PINBAR',
      direction: 'BUY',
      strength: Math.min(1.0, 0.6 + strength * 0.4),
      timestamp: current.timestamp,
      metadata: {
        bodySize: body,
        lowerWick: lowerW,
        upperWick: upperW,
        wickRatio: lowerW / body
      }
    };
  }
  
  // Bearish Pinbar: Long upper wick (> 1.5x body), small lower wick
  // B54: Relaxed from 2x to 1.5x for crypto. Directional dominance (2x opposite wick) retained.
  if (upperW > 1.5 * body && upperW > lowerW * 2) {
    const strength = Math.min(1.0, (upperW / body) / 4);
    return {
      symbol,
      pattern: 'PINBAR',
      direction: 'SELL',
      strength: Math.min(1.0, 0.6 + strength * 0.4),
      timestamp: current.timestamp,
      metadata: {
        bodySize: body,
        lowerWick: lowerW,
        upperWick: upperW,
        wickRatio: upperW / body
      }
    };
  }
  
  return null;
}

/**
 * Detect Momentum Engulfing pattern
 * Candle body fully engulfs prior body; volume spike > 1.2× average
 */
function detectEngulfing(candles: Candle[], symbol: string, avgVolume: number, assetClass: AssetClass): PatternSignal | null {  // B79.0n.PATTERN-DETECT — REQUIRED per-class scope (plumbing-only; body unchanged)
  if (candles.length < 2) return null;
  
  const current = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  
  const currentBody = bodySize(current);
  const prevBody = bodySize(prev);
  
  if (prevBody === 0) return null;
  
  // Volume confirmation: current volume > 1.2x average
  const volumeSpike = current.volume > avgVolume * 1.2;
  
  // Bullish Engulfing: Previous bearish, current bullish, body engulfs
  if (isBearish(prev) && isBullish(current)) {
    const engulfs = current.open <= prev.close && current.close >= prev.open;
    if (engulfs && currentBody > prevBody) {
      const engulfRatio = currentBody / prevBody;
      const volumeBonus = volumeSpike ? 0.15 : 0;
      return {
        symbol,
        pattern: 'ENGULFING',
        direction: 'BUY',
        strength: Math.min(1.0, 0.65 + Math.min(0.2, (engulfRatio - 1) * 0.1) + volumeBonus),
        timestamp: current.timestamp,
        metadata: {
          engulfRatio,
          volumeSpike,
          prevBody,
          currentBody
        }
      };
    }
  }
  
  // Bearish Engulfing: Previous bullish, current bearish, body engulfs
  if (isBullish(prev) && isBearish(current)) {
    const engulfs = current.open >= prev.close && current.close <= prev.open;
    if (engulfs && currentBody > prevBody) {
      const engulfRatio = currentBody / prevBody;
      const volumeBonus = volumeSpike ? 0.15 : 0;
      return {
        symbol,
        pattern: 'ENGULFING',
        direction: 'SELL',
        strength: Math.min(1.0, 0.65 + Math.min(0.2, (engulfRatio - 1) * 0.1) + volumeBonus),
        timestamp: current.timestamp,
        metadata: {
          engulfRatio,
          volumeSpike,
          prevBody,
          currentBody
        }
      };
    }
  }
  
  return null;
}

/**
 * Detect Inside Bar pattern
 * High < PrevHigh AND Low > PrevLow (compression setup)
 * B54: Added 0.1% tolerance — crypto bars often touch parent range by a fraction of a pip.
 */
function detectInsideBar(candles: Candle[], symbol: string, assetClass: AssetClass): PatternSignal | null {  // B79.0n.PATTERN-DETECT — REQUIRED per-class scope (plumbing-only; body unchanged)
  if (candles.length < 2) return null;

  const current = candles[candles.length - 1];
  const prev = candles[candles.length - 2];

  // Inside bar: Current range inside previous range (B54: 0.1% tolerance for near-inside bars)
  const tolerance = 0.001; // 0.1%
  const isInside = current.high < prev.high * (1 + tolerance) && current.low > prev.low * (1 - tolerance);
  
  if (isInside) {
    const prevRange = candleRange(prev);
    const currentRange = candleRange(current);
    const compressionRatio = prevRange > 0 ? currentRange / prevRange : 0;
    
    // Direction based on trend context (use previous candle direction)
    const direction = isBullish(prev) ? 'BUY' : 'SELL';
    
    return {
      symbol,
      pattern: 'INSIDE_BAR',
      direction,
      strength: Math.min(1.0, 0.6 + (1 - compressionRatio) * 0.3),
      timestamp: current.timestamp,
      metadata: {
        compressionRatio,
        prevRange,
        currentRange,
        parentDirection: isBullish(prev) ? 'bullish' : 'bearish'
      }
    };
  }
  
  return null;
}

/**
 * Detect Three White Soldiers pattern (bullish)
 * Three consecutive bullish candles, each closing higher
 */
function detectThreeSoldiers(candles: Candle[], symbol: string, assetClass: AssetClass): PatternSignal | null {  // B79.0n.PATTERN-DETECT — REQUIRED per-class scope (plumbing-only; body unchanged)
  if (candles.length < 3) return null;
  
  const c1 = candles[candles.length - 3];
  const c2 = candles[candles.length - 2];
  const c3 = candles[candles.length - 1];
  
  // All three must be bullish
  if (!isBullish(c1) || !isBullish(c2) || !isBullish(c3)) return null;
  
  // Each must close higher than the previous
  if (c2.close <= c1.close || c3.close <= c2.close) return null;
  
  // Each opens within the previous body (B54: 0.25% tolerance for crypto micro-gaps, per Langston review)
  const tol1 = bodySize(c1) * 0.0025; // 0.25% of body
  const tol2 = bodySize(c2) * 0.0025;
  const opensInPrevBody1 = c2.open >= (c1.open - tol1) && c2.open <= (c1.close + tol1);
  const opensInPrevBody2 = c3.open >= (c2.open - tol2) && c3.open <= (c2.close + tol2);
  
  if (opensInPrevBody1 && opensInPrevBody2) {
    const totalGain = (c3.close - c1.open) / c1.open;
    return {
      symbol,
      pattern: 'THREE_SOLDIERS',
      direction: 'BUY',
      strength: Math.min(1.0, 0.75 + totalGain * 2),
      timestamp: c3.timestamp,
      metadata: {
        totalGain,
        c1Close: c1.close,
        c2Close: c2.close,
        c3Close: c3.close
      }
    };
  }
  
  return null;
}

/**
 * Detect Morning Star pattern
 * Bear → Doji/Small → Bull (closing > halfway into first candle)
 */
function detectMorningStar(candles: Candle[], symbol: string, assetClass: AssetClass): PatternSignal | null {  // B79.0n.PATTERN-DETECT — REQUIRED per-class scope (plumbing-only; body unchanged)
  if (candles.length < 3) return null;
  
  const c1 = candles[candles.length - 3]; // First: Bearish
  const c2 = candles[candles.length - 2]; // Second: Doji/Small body
  const c3 = candles[candles.length - 1]; // Third: Bullish
  
  // First candle must be bearish with substantial body
  // B54: Relaxed body/range from 0.4 to 0.3 — crypto bearish candles often carry more wick
  if (!isBearish(c1)) return null;
  const c1Body = bodySize(c1);
  const c1Range = candleRange(c1);
  if (c1Range === 0 || c1Body / c1Range < 0.3) return null;
  
  // Second candle must have small body (doji-like)
  const c2Body = bodySize(c2);
  const c2Range = candleRange(c2);
  if (c2Range > 0 && c2Body / c2Range > 0.3) return null; // Not small enough
  
  // Third candle must be bullish
  if (!isBullish(c3)) return null;
  
  // Third candle must close above halfway point of first candle
  const c1Midpoint = (c1.open + c1.close) / 2;
  if (c3.close <= c1Midpoint) return null;
  
  // Gap down from c1 to c2 is preferred but not required
  const hasGap = c2.high < c1.close;
  const gapBonus = hasGap ? 0.1 : 0;
  
  const c3Body = bodySize(c3);
  const recoveryRatio = c1Body > 0 ? c3Body / c1Body : 0;
  
  return {
    symbol,
    pattern: 'MORNING_STAR',
    direction: 'BUY',
    strength: Math.min(1.0, 0.7 + Math.min(0.2, recoveryRatio * 0.1) + gapBonus),
    timestamp: c3.timestamp,
    metadata: {
      c1Body,
      c2Body,
      c3Body,
      hasGap,
      recoveryRatio,
      c1Midpoint
    }
  };
}

/**
 * Batch 19F: Detect ABCD Harmonic Measured-Move Pattern
 * A = swing low, B = swing high (rally), C = higher low (pullback), D = breakout
 * BC retrace must be 38.2%-78.6% of AB leg (Fibonacci zone)
 * Scans the last 15-50 candles for the A-B-C-D sequence
 */
function detectABCD(candles: Candle[], symbol: string, assetClass: AssetClass): PatternSignal | null {  // B79.0n.PATTERN-DETECT — REQUIRED per-class scope (plumbing-only; body unchanged)
  if (candles.length < 12) return null; // Batch 53: 15→12, allow detection in shorter windows

  // Use last 50 candles (or less if not available)
  const lookback = Math.min(50, candles.length);
  const window = candles.slice(-lookback);

  // Find swing lows and swing highs (using 3-bar pivot detection)
  const swingLows: { index: number; price: number; volume: number }[] = [];
  const swingHighs: { index: number; price: number }[] = [];

  for (let i = 2; i < window.length - 2; i++) {
    const prev2 = window[i - 2];
    const prev1 = window[i - 1];
    const curr = window[i];
    const next1 = window[i + 1];
    const next2 = window[i + 2];

    // Swing low: current low is lower than surrounding 2 bars on each side
    if (curr.low < prev1.low && curr.low < prev2.low &&
        curr.low < next1.low && curr.low < next2.low) {
      swingLows.push({ index: i, price: curr.low, volume: curr.volume });
    }

    // Swing high: current high is higher than surrounding 2 bars on each side
    if (curr.high > prev1.high && curr.high > prev2.high &&
        curr.high > next1.high && curr.high > next2.high) {
      swingHighs.push({ index: i, price: curr.high });
    }
  }

  // Need at least 1 swing low and 1 swing high to form A-B-C pattern
  if (swingLows.length < 2 || swingHighs.length < 1) return null;

  // Try to find the most recent valid A-B-C-D sequence
  // Iterate from most recent swing lows backwards
  for (let ci = swingLows.length - 1; ci >= 1; ci--) {
    const cPoint = swingLows[ci]; // C = more recent higher low

    // Find B (swing high BEFORE C)
    const bCandidates = swingHighs.filter(h => h.index < cPoint.index && h.index > cPoint.index - 20);
    if (bCandidates.length === 0) continue;

    const bPoint = bCandidates[bCandidates.length - 1]; // Most recent B before C

    // Find A (swing low BEFORE B, must be lower than C)
    const aCandidates = swingLows.filter(l =>
      l.index < bPoint.index && l.index > bPoint.index - 25 && l.price < cPoint.price
    );
    if (aCandidates.length === 0) continue;

    const aPoint = aCandidates[aCandidates.length - 1]; // Most recent A before B

    // Validate: B > A (rally)
    if (bPoint.price <= aPoint.price) continue;

    // Validate: C > A and C < B (pullback, higher low)
    if (cPoint.price <= aPoint.price || cPoint.price >= bPoint.price) continue;

    // Calculate BC retrace as percentage of AB leg
    const abLeg = bPoint.price - aPoint.price;
    const bcRetrace = (bPoint.price - cPoint.price) / abLeg;

    // BC retrace must be 35.0%-82.0% of AB leg (Batch 53: widened from 0.382-0.786, crypto overshoots classical Fib)
    if (bcRetrace < 0.350 || bcRetrace > 0.820) continue;

    // Check for D point (breakout above C's high in subsequent candles)
    const cHigh = window[cPoint.index].high;
    let dFound = false;
    for (let d = cPoint.index + 1; d < window.length; d++) {
      if (window[d].high > cHigh) {
        dFound = true;
        break;
      }
    }

    if (!dFound) continue;

    // Strength: closer to 61.8% retrace = higher strength (golden ratio)
    const retraceQuality = 1 - Math.abs(bcRetrace - 0.618) / 0.236; // 0.236 = max distance from 0.618 within [0.382, 0.786]
    const strength = Math.min(1.0, 0.6 + Math.max(0, retraceQuality) * 0.35);

    return {
      symbol,
      pattern: 'ABCD' as PatternType,
      direction: 'BUY',
      strength,
      timestamp: window[window.length - 1].timestamp,
      metadata: {
        aPointLow: aPoint.price,
        bPointHigh: bPoint.price,
        cPointLow: cPoint.price,
        cPointHigh: cHigh,
        aPointVolume: aPoint.volume,
        bcRetrace: parseFloat(bcRetrace.toFixed(4)),
      },
    };
  }

  return null;
}

/**
 * Calculate average volume from candle data
 */
function calculateAvgVolume(candles: Candle[], lookback: number = 20): number {
  const subset = candles.slice(-Math.min(lookback, candles.length));
  if (subset.length === 0) return 0;
  return subset.reduce((sum, c) => sum + c.volume, 0) / subset.length;
}

/**
 * Main pattern scanning function
 * Scans candle data for all supported patterns
 * 
 * Directive 10.7: Applies timeframe-aware strength weighting.
 * Patterns from lower timeframes (5m) receive reduced weight compared to higher (1h).
 */
// B79.0n.PATTERN-DETECT (2026-05-24) — REQUIRED `assetClass: AssetClass`
// added as third parameter (was: `symbol: string = 'UNKNOWN'` default-eligible).
// All 5 production caller sites updated to thread the call-site asset class:
//   - signal-orchestrator.ts (4 sites — crypto active trading + multi-tf cascade)
//   - vts-runner.ts (3 sites — crypto VTS pool eval)
//   - xstock_spot/eval-cycle.ts (1 site — xstock VTS pool eval)
//   - diagnostic-11.4G.ts (1 site — dev tool)
// + 3 test files updated for signature ripple. Per CLAUDE.md NO PATCHES
// (rule 15), no silent fallback — caller must pass the asset class
// explicitly. Default 'UNKNOWN' symbol kept for back-compat with older
// diagnostic call shapes.
export function scanPatterns(candles: Candle[], symbol: string, assetClass: AssetClass): PatternSignal[] {
  if (candles.length < 3) return [];

  const signals: PatternSignal[] = [];
  const avgVolume = calculateAvgVolume(candles);

  const timeframe = candles[candles.length - 1]?.timeframe;

  // Detect each pattern type — assetClass threaded for future Layer-3 branching
  const pinbar = detectPinbar(candles, symbol, avgVolume, assetClass);
  if (pinbar) signals.push(pinbar);

  const engulfing = detectEngulfing(candles, symbol, avgVolume, assetClass);
  if (engulfing) signals.push(engulfing);

  const insideBar = detectInsideBar(candles, symbol, assetClass);
  if (insideBar) signals.push(insideBar);

  const threeSoldiers = detectThreeSoldiers(candles, symbol, assetClass);
  if (threeSoldiers) signals.push(threeSoldiers);

  const morningStar = detectMorningStar(candles, symbol, assetClass);
  if (morningStar) signals.push(morningStar);

  // Batch 19F: ABCD harmonic measured-move pattern
  const abcd = detectABCD(candles, symbol, assetClass);
  if (abcd) signals.push(abcd);

  for (const signal of signals) {
    const rawStrength = signal.strength;
    signal.strength = applyTimeframeWeightedStrength(rawStrength, timeframe);
    
    if (!signal.metadata) {
      signal.metadata = {};
    }
    signal.metadata.rawStrength = rawStrength;
    signal.metadata.timeframe = timeframe;
    signal.metadata.timeframeWeight = getTimeframeWeight(timeframe);
  }
  
  if (signals.length > 0) {
    const tfLabel = timeframe ? `@${timeframe}` : '';
    console.log(`[10.2][PATTERN] ${symbol}${tfLabel}: Detected ${signals.length} pattern(s) - ${signals.map(s => `${s.pattern}(${s.direction},${s.strength.toFixed(2)})`).join(', ')}`);
  }
  
  return signals;
}

/**
 * Convert a detected PatternSignal to trade GEOMETRY (entry/stop/target/confidence).
 *
 * P19-B6.5c (2026-06-17): this function no longer asserts a `strategy`. It used to
 * fabricate a non-canonical `pattern_<name>` label (e.g. `pattern_abcd`) that is NOT
 * a valid `strategy_type` enum value, so the RTB insert (and closed_trades /
 * trades downstream) rejected every pattern signal — the B6.5b dry-run's 8,503
 * drops. Patterns are TRIGGERS, not strategies; the consuming CANONICAL strategy is
 * resolved by the caller (the signal orchestrator) via
 * `resolvePatternConsumingStrategy(regime, pattern, assetClass)` — exact-match,
 * regime+class dependent. This function now returns geometry/confidence only; the
 * recognizer (Directive 10.2 LOCKED) stays free of strategy taxonomy.
 *
 * B79.0n.PATTERN-DETECT — REQUIRED `assetClass`. ATR multipliers (1.5× stop /
 * 2.5× target) stay hardcoded; per-class tuning deferred to Layer-3 (SIM §11263).
 */
export function patternToTradeSignal(
  pattern: PatternSignal,
  currentPrice: number,
  atr: number,
  assetClass: AssetClass,
): {
  symbol: string;
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  confidence: number;
  signalType: SignalType;
  metadata: Record<string, any>;
} {
  // Use ATR for stop/target calculation, fallback to 1% of price
  const stopDistance = atr > 0 ? atr * 1.5 : currentPrice * 0.01;
  const targetDistance = atr > 0 ? atr * 2.5 : currentPrice * 0.02;

  const isBuy = pattern.direction === 'BUY';

  return {
    symbol: pattern.symbol,
    entryPrice: currentPrice,
    stopPrice: isBuy ? currentPrice - stopDistance : currentPrice + stopDistance,
    targetPrice: isBuy ? currentPrice + targetDistance : currentPrice - targetDistance,
    confidence: pattern.strength * 100, // Convert to 0-100 scale
    signalType: 'PATTERN',
    metadata: {
      ...pattern.metadata,
      patternType: pattern.pattern,
      patternStrength: pattern.strength,
      patternDirection: pattern.direction,
      predictiveConfidence: pattern.predictiveConfidence,
      patternTimestamp: pattern.timestamp
    }
  };
}

// Singleton instance for service access
// B79.0n.PATTERN-DETECT (2026-05-24) — instance methods mirror REQUIRED-
// assetClass discipline on the underlying free functions.
class PatternRecognizerService {
  scanPatterns(candles: Candle[], symbol: string, assetClass: AssetClass): PatternSignal[] {
    return scanPatterns(candles, symbol, assetClass);
  }

  patternToTradeSignal(
    pattern: PatternSignal,
    currentPrice: number,
    atr: number | undefined,
    assetClass: AssetClass,
  ) {
    return patternToTradeSignal(pattern, currentPrice, atr ?? 0, assetClass);
  }
}

let instance: PatternRecognizerService | null = null;

export function getPatternRecognizer(): PatternRecognizerService {
  if (!instance) {
    instance = new PatternRecognizerService();
  }
  return instance;
}

export { PatternRecognizerService };
