/**
 * Directive 10.2 — Pattern Recognizer Unit Tests
 * 
 * Validates candlestick pattern detection for:
 * - PINBAR (Golden Pinbar)
 * - ENGULFING (Momentum Engulfing)
 * - INSIDE_BAR
 * - THREE_SOLDIERS
 * - MORNING_STAR
 */

import { describe, test, expect } from 'vitest';
import { 
  scanPatterns, 
  patternToTradeSignal,
  type Candle, 
  type PatternSignal 
} from '../../services/pattern-recognizer';

describe('Directive 10.2 — Pattern Recognizer', () => {
  
  describe('PINBAR Detection', () => {
    test('Detects bullish pinbar with long lower wick', () => {
      // Bullish pinbar: Long lower wick (>2x body), small upper wick
      // Candle 3: open=101, close=100.5 (body=0.5), high=101.5, low=80 (lowerWick=20.5)
      const candles: Candle[] = [
        { timestamp: 1000, open: 100, high: 101, low: 99, close: 100.5, volume: 1000 },
        { timestamp: 2000, open: 100, high: 101, low: 99, close: 100.5, volume: 1000 },
        { timestamp: 3000, open: 101, high: 101.5, low: 80, close: 100.5, volume: 1200 }
      ];
      
      const signals = scanPatterns(candles, 'BTCUSD', 'crypto_spot');
      const pinbar = signals.find(s => s.pattern === 'PINBAR');
      
      expect(pinbar).toBeDefined();
      expect(pinbar?.direction).toBe('BUY');
      expect(pinbar?.strength).toBeGreaterThanOrEqual(0.6);
      console.log(`[10.2][TEST] Bullish Pinbar detected: strength=${pinbar?.strength.toFixed(2)}`);
    });

    test('Detects bearish pinbar with long upper wick', () => {
      // Bearish pinbar: Long upper wick (>2x body), small lower wick
      // Candle 3: open=100, close=100.5 (body=0.5), high=120, low=99.5 (upperWick=19.5)
      const candles: Candle[] = [
        { timestamp: 1000, open: 100, high: 101, low: 99, close: 100.5, volume: 1000 },
        { timestamp: 2000, open: 100, high: 101, low: 99, close: 100.5, volume: 1000 },
        { timestamp: 3000, open: 100, high: 120, low: 99.5, close: 100.5, volume: 1200 }
      ];
      
      const signals = scanPatterns(candles, 'BTCUSD', 'crypto_spot');
      const pinbar = signals.find(s => s.pattern === 'PINBAR');
      
      expect(pinbar).toBeDefined();
      expect(pinbar?.direction).toBe('SELL');
      expect(pinbar?.strength).toBeGreaterThanOrEqual(0.6);
      console.log(`[10.2][TEST] Bearish Pinbar detected: strength=${pinbar?.strength.toFixed(2)}`);
    });

    test('scanPatterns handles extreme candle data without errors', () => {
      const candles: Candle[] = [
        { timestamp: 1000, open: 100, high: 101, low: 99, close: 100, volume: 1000 },
        { timestamp: 2000, open: 100, high: 101, low: 99, close: 100, volume: 1000 },
        { timestamp: 3000, open: 100, high: 100.1, low: 70, close: 99.9, volume: 1500 }
      ];
      
      expect(() => scanPatterns(candles, 'BTCUSD', 'crypto_spot')).not.toThrow();
      const signals = scanPatterns(candles, 'BTCUSD', 'crypto_spot');
      expect(Array.isArray(signals)).toBe(true);
      console.log(`[10.2][TEST] Extreme data handling: ${signals.length} patterns detected`);
    });
  });

  describe('ENGULFING Detection', () => {
    test('Detects bullish engulfing pattern', () => {
      const candles: Candle[] = generateCandlesWithVolume(20);
      candles.push(
        { timestamp: 21000, open: 102, high: 103, low: 100, close: 100.5, volume: 1000 },
        { timestamp: 22000, open: 100, high: 105, low: 99.5, close: 104, volume: 1500 }
      );
      
      const signals = scanPatterns(candles, 'ETHUSD', 'crypto_spot');
      const engulfing = signals.find(s => s.pattern === 'ENGULFING');
      
      expect(engulfing).toBeDefined();
      expect(engulfing?.direction).toBe('BUY');
      console.log(`[10.2][TEST] Bullish Engulfing: strength=${engulfing?.strength.toFixed(2)}`);
    });

    test('Detects bearish engulfing pattern', () => {
      const candles: Candle[] = generateCandlesWithVolume(20);
      candles.push(
        { timestamp: 21000, open: 100, high: 103, low: 99, close: 102, volume: 1000 },
        { timestamp: 22000, open: 103, high: 104, low: 98, close: 98.5, volume: 1500 }
      );
      
      const signals = scanPatterns(candles, 'ETHUSD', 'crypto_spot');
      const engulfing = signals.find(s => s.pattern === 'ENGULFING');
      
      expect(engulfing).toBeDefined();
      expect(engulfing?.direction).toBe('SELL');
      console.log(`[10.2][TEST] Bearish Engulfing: strength=${engulfing?.strength.toFixed(2)}`);
    });
  });

  describe('INSIDE_BAR Detection', () => {
    test('Detects inside bar compression setup', () => {
      // Inside bar: Current range completely inside previous range
      // Candle 2: high=150, low=60 (range=90)
      // Candle 3: high=140 < 150, low=70 > 60 (inside)
      const candles: Candle[] = [
        { timestamp: 1000, open: 100, high: 101, low: 99, close: 100, volume: 1000 },
        { timestamp: 2000, open: 80, high: 150, low: 60, close: 140, volume: 1000 },
        { timestamp: 3000, open: 100, high: 140, low: 70, close: 120, volume: 800 }
      ];
      
      const signals = scanPatterns(candles, 'BTCUSD', 'crypto_spot');
      const insideBar = signals.find(s => s.pattern === 'INSIDE_BAR');
      
      expect(insideBar).toBeDefined();
      expect(insideBar?.strength).toBeGreaterThanOrEqual(0.6);
      console.log(`[10.2][TEST] Inside Bar: strength=${insideBar?.strength.toFixed(2)}, direction=${insideBar?.direction}`);
    });
  });

  describe('THREE_SOLDIERS Detection', () => {
    test('Detects three white soldiers pattern', () => {
      const candles: Candle[] = [
        { timestamp: 1000, open: 100, high: 103, low: 99, close: 102, volume: 1000 },
        { timestamp: 2000, open: 101, high: 106, low: 100.5, close: 105, volume: 1100 },
        { timestamp: 3000, open: 104, high: 110, low: 103.5, close: 109, volume: 1200 }
      ];
      
      const signals = scanPatterns(candles, 'BTCUSD', 'crypto_spot');
      const soldiers = signals.find(s => s.pattern === 'THREE_SOLDIERS');
      
      expect(soldiers).toBeDefined();
      expect(soldiers?.direction).toBe('BUY');
      expect(soldiers?.strength).toBeGreaterThanOrEqual(0.75);
      console.log(`[10.2][TEST] Three Soldiers: strength=${soldiers?.strength.toFixed(2)}`);
    });
  });

  describe('MORNING_STAR Detection', () => {
    test('Detects morning star reversal pattern', () => {
      const candles: Candle[] = [
        { timestamp: 1000, open: 110, high: 112, low: 98, close: 100, volume: 1500 },
        { timestamp: 2000, open: 100, high: 101, low: 99, close: 100.2, volume: 500 },
        { timestamp: 3000, open: 100, high: 115, low: 99, close: 112, volume: 1400 }
      ];
      
      const signals = scanPatterns(candles, 'BTCUSD', 'crypto_spot');
      const morningStar = signals.find(s => s.pattern === 'MORNING_STAR');
      
      expect(morningStar).toBeDefined();
      expect(morningStar?.direction).toBe('BUY');
      expect(morningStar?.strength).toBeGreaterThanOrEqual(0.7);
      console.log(`[10.2][TEST] Morning Star: strength=${morningStar?.strength.toFixed(2)}`);
    });
  });

  describe('No Pattern Detection', () => {
    test('Returns empty array for random noise', () => {
      const candles: Candle[] = [
        { timestamp: 1000, open: 100, high: 101, low: 99.5, close: 100.3, volume: 1000 },
        { timestamp: 2000, open: 100.2, high: 100.8, low: 99.8, close: 100.1, volume: 950 },
        { timestamp: 3000, open: 100.1, high: 100.6, low: 99.7, close: 100.2, volume: 1020 }
      ];
      
      const signals = scanPatterns(candles, 'BTCUSD', 'crypto_spot');
      
      expect(signals.length).toBe(0);
      console.log(`[10.2][TEST] Random noise: 0 patterns detected (expected)`);
    });

    test('Returns empty array for insufficient candles', () => {
      const candles: Candle[] = [
        { timestamp: 1000, open: 100, high: 105, low: 95, close: 102, volume: 1000 }
      ];
      
      const signals = scanPatterns(candles, 'BTCUSD', 'crypto_spot');
      
      expect(signals.length).toBe(0);
      console.log(`[10.2][TEST] Insufficient data: 0 patterns detected (expected)`);
    });
  });

  describe('Signal Conversion', () => {
    test('patternToTradeSignal produces valid trade signal', () => {
      const patternSignal: PatternSignal = {
        symbol: 'BTCUSD',
        pattern: 'PINBAR',
        direction: 'BUY',
        strength: 0.85,
        timestamp: Date.now(),
        metadata: { wickRatio: 3.5 }
      };
      
      const tradeSignal = patternToTradeSignal(patternSignal, 50000, 500, 'crypto_spot');
      
      expect(tradeSignal.symbol).toBe('BTCUSD');
      expect(tradeSignal.signalType).toBe('PATTERN');
      expect(tradeSignal.confidence).toBe(85);
      expect(tradeSignal.entryPrice).toBe(50000);
      expect(tradeSignal.stopPrice).toBeLessThan(50000);
      expect(tradeSignal.targetPrice).toBeGreaterThan(50000);
      expect(tradeSignal.metadata.patternType).toBe('PINBAR');
      expect(tradeSignal.metadata.patternStrength).toBe(0.85);
      
      console.log(`[10.2][TEST] Trade signal conversion: entry=${tradeSignal.entryPrice}, stop=${tradeSignal.stopPrice.toFixed(2)}, target=${tradeSignal.targetPrice.toFixed(2)}`);
    });

    test('signalType is properly set to PATTERN', () => {
      const patternSignal: PatternSignal = {
        symbol: 'ETHUSD',
        pattern: 'ENGULFING',
        direction: 'BUY',
        strength: 0.75,
        timestamp: Date.now()
      };
      
      const tradeSignal = patternToTradeSignal(patternSignal, 3000, 50, 'crypto_spot');
      
      expect(tradeSignal.signalType).toBe('PATTERN');
      console.log(`[10.2][TEST] SignalType correctly set to 'PATTERN'`);
    });
  });
});

function generateCandlesWithVolume(count: number): Candle[] {
  const candles: Candle[] = [];
  let price = 100;
  for (let i = 0; i < count; i++) {
    const open = price;
    const change = (Math.random() - 0.5) * 2;
    const close = price + change;
    const high = Math.max(open, close) + Math.random();
    const low = Math.min(open, close) - Math.random();
    candles.push({
      timestamp: (i + 1) * 1000,
      open,
      high,
      low,
      close,
      volume: 1000 + Math.random() * 200
    });
    price = close;
  }
  return candles;
}
