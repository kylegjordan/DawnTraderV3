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
 * - PINBAR (Golden Pinbar): Wick > 2× Body, wick opposite trade direction
 * - ENGULFING (Momentum Engulfing): Body fully engulfs prior body, volume spike
 * - INSIDE_BAR: High < PrevHigh AND Low > PrevLow (compression setup)
 * - THREE_SOLDIERS: Three consecutive bullish candles, each closing higher
 * - MORNING_STAR: Bear → Doji/Small → Bull (closing > halfway into first)
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import type { PatternType, SignalType, Candle, PatternSignal } from '../types';

export type { PatternType, SignalType, Candle, PatternSignal };

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
 * Wick > 2× Body; wick opposite trade direction
 */
function detectPinbar(candles: Candle[], symbol: string, avgVolume: number): PatternSignal | null {
  if (candles.length < 2) return null;
  
  const current = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const body = bodySize(current);
  const range = candleRange(current);
  
  if (body === 0 || range === 0) return null;
  
  const upperW = upperWick(current);
  const lowerW = lowerWick(current);
  
  // Bullish Pinbar: Long lower wick (> 2x body), small upper wick
  if (lowerW > 2 * body && lowerW > upperW * 2) {
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
  
  // Bearish Pinbar: Long upper wick (> 2x body), small lower wick
  if (upperW > 2 * body && upperW > lowerW * 2) {
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
function detectEngulfing(candles: Candle[], symbol: string, avgVolume: number): PatternSignal | null {
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
 */
function detectInsideBar(candles: Candle[], symbol: string): PatternSignal | null {
  if (candles.length < 2) return null;
  
  const current = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  
  // Inside bar: Current range completely inside previous range
  const isInside = current.high < prev.high && current.low > prev.low;
  
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
function detectThreeSoldiers(candles: Candle[], symbol: string): PatternSignal | null {
  if (candles.length < 3) return null;
  
  const c1 = candles[candles.length - 3];
  const c2 = candles[candles.length - 2];
  const c3 = candles[candles.length - 1];
  
  // All three must be bullish
  if (!isBullish(c1) || !isBullish(c2) || !isBullish(c3)) return null;
  
  // Each must close higher than the previous
  if (c2.close <= c1.close || c3.close <= c2.close) return null;
  
  // Each opens within the previous body
  const opensInPrevBody1 = c2.open >= c1.open && c2.open <= c1.close;
  const opensInPrevBody2 = c3.open >= c2.open && c3.open <= c2.close;
  
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
function detectMorningStar(candles: Candle[], symbol: string): PatternSignal | null {
  if (candles.length < 3) return null;
  
  const c1 = candles[candles.length - 3]; // First: Bearish
  const c2 = candles[candles.length - 2]; // Second: Doji/Small body
  const c3 = candles[candles.length - 1]; // Third: Bullish
  
  // First candle must be bearish with substantial body
  if (!isBearish(c1)) return null;
  const c1Body = bodySize(c1);
  const c1Range = candleRange(c1);
  if (c1Range === 0 || c1Body / c1Range < 0.4) return null;
  
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
 */
export function scanPatterns(candles: Candle[], symbol: string = 'UNKNOWN'): PatternSignal[] {
  if (candles.length < 3) return [];
  
  const signals: PatternSignal[] = [];
  const avgVolume = calculateAvgVolume(candles);
  
  // Detect each pattern type
  const pinbar = detectPinbar(candles, symbol, avgVolume);
  if (pinbar) signals.push(pinbar);
  
  const engulfing = detectEngulfing(candles, symbol, avgVolume);
  if (engulfing) signals.push(engulfing);
  
  const insideBar = detectInsideBar(candles, symbol);
  if (insideBar) signals.push(insideBar);
  
  const threeSoldiers = detectThreeSoldiers(candles, symbol);
  if (threeSoldiers) signals.push(threeSoldiers);
  
  const morningStar = detectMorningStar(candles, symbol);
  if (morningStar) signals.push(morningStar);
  
  if (signals.length > 0) {
    console.log(`[10.2][PATTERN] ${symbol}: Detected ${signals.length} pattern(s) - ${signals.map(s => `${s.pattern}(${s.direction})`).join(', ')}`);
  }
  
  return signals;
}

/**
 * Convert PatternSignal to StrategySignal-compatible format
 */
export function patternToTradeSignal(
  pattern: PatternSignal,
  currentPrice: number,
  atr: number = 0
): {
  symbol: string;
  strategy: string;
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
    strategy: `pattern_${pattern.pattern.toLowerCase()}`,
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
class PatternRecognizerService {
  scanPatterns(candles: Candle[], symbol: string): PatternSignal[] {
    return scanPatterns(candles, symbol);
  }
  
  patternToTradeSignal(
    pattern: PatternSignal,
    currentPrice: number,
    atr?: number
  ) {
    return patternToTradeSignal(pattern, currentPrice, atr);
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
