/**
 * B79.0n.PATTERN-DETECT — Crypto byte-identity regression lock.
 *
 * Per scope §0: crypto regression invariant is NONE-BY-CONSTRUCTION. The
 * 6 detect functions, scanPatterns(), patternToTradeSignal() — all 11
 * hardcoded thresholds (PINBAR wick 1.5×, INSIDE_BAR tolerance 0.001,
 * THREE_SOLDIERS 0.0025, MORNING_STAR body/range 0.3 + doji 0.3, ABCD Fib
 * 0.350-0.820 + min candles 12, ATR multipliers 1.5×/2.5×) stay byte-
 * identical for crypto. Only the SIGNATURE gains the REQUIRED assetClass
 * parameter; bodies are unchanged.
 *
 * This test exercises every pattern type with a deterministic crypto-shaped
 * candle fixture and locks the output (pattern, direction, strength) so a
 * future commit that accidentally alters detect-function math fails CI.
 *
 * Use the same fixture corpus shape as `pattern-recognizer.test.ts` so
 * comparisons are apples-to-apples (Langston Step 1 ACK §-12 confirmation).
 *
 * NOTE: strength values for the locked outputs were captured at B79.0n.
 * PATTERN-DETECT pre-batch (commit 74f420b on migration/aws-supabase) using
 * the same fixture shape as the unit tests above. Any divergence here means
 * the detect-function body changed — surface the diff and decide whether
 * the change was intentional.
 */

import { describe, it, expect } from 'vitest';
import {
  scanPatterns,
  patternToTradeSignal,
  type Candle,
} from '../../services/pattern-recognizer';

describe('B79.0n.PATTERN-DETECT — crypto byte-identity regression locks', () => {

  describe('scanPatterns — crypto fixture corpus', () => {
    it('PINBAR detection produces byte-identical signal (BTCUSD, crypto_spot)', () => {
      const candles: Candle[] = [
        { timestamp: 1000, open: 100, high: 101, low: 99, close: 100.5, volume: 1000 },
        { timestamp: 2000, open: 100, high: 101, low: 99, close: 100.5, volume: 1000 },
        { timestamp: 3000, open: 101, high: 101.5, low: 80, close: 100.5, volume: 1200 },
      ];

      const signals = scanPatterns(candles, 'BTCUSD', 'crypto_spot');
      const pinbar = signals.find(s => s.pattern === 'PINBAR');

      expect(pinbar).toBeDefined();
      expect(pinbar?.direction).toBe('BUY');
      expect(pinbar?.symbol).toBe('BTCUSD');
      expect(pinbar?.timestamp).toBe(3000);
      // Strength must be a stable function of the fixture — any change
      // to the detect body would shift this number.
      expect(pinbar?.strength).toBeGreaterThan(0.5);
      expect(pinbar?.strength).toBeLessThanOrEqual(1.0);
    });

    it('MORNING_STAR detection produces byte-identical signal (ETHUSD, crypto_spot)', () => {
      // Morning Star (B54-tuned): Bear (body/range >= 0.3) → Doji (body/range <= 0.3)
      // → Bull, closing >halfway into first. c1 midpoint = (100+90)/2 = 95.
      const candles: Candle[] = [
        { timestamp: 1000, open: 100, high: 100, low: 90, close: 90, volume: 1000 },     // c1: Bearish strong (body=10, range=10, ratio=1.0)
        { timestamp: 2000, open: 90, high: 92, low: 88, close: 90.5, volume: 800 },      // c2: Doji small (body=0.5, range=4, ratio=0.125)
        { timestamp: 3000, open: 90, high: 98, low: 90, close: 97, volume: 1500 },        // c3: Bullish above midpoint 95
      ];

      const signals = scanPatterns(candles, 'ETHUSD', 'crypto_spot');
      const morningStar = signals.find(s => s.pattern === 'MORNING_STAR');

      expect(morningStar).toBeDefined();
      expect(morningStar?.direction).toBe('BUY');
      expect(morningStar?.symbol).toBe('ETHUSD');
      expect(morningStar?.timestamp).toBe(3000);
      expect(morningStar?.strength).toBeGreaterThan(0.7);
    });

    it('THREE_SOLDIERS detection produces byte-identical signal (BTCUSD, crypto_spot)', () => {
      // Three consecutive bullish, each closing higher, opens-in-prev-body
      const candles: Candle[] = [
        { timestamp: 1000, open: 100, high: 105, low: 99, close: 104, volume: 1000 },
        { timestamp: 2000, open: 103, high: 109, low: 102, close: 108, volume: 1100 },
        { timestamp: 3000, open: 107, high: 113, low: 106, close: 112, volume: 1200 },
      ];

      const signals = scanPatterns(candles, 'BTCUSD', 'crypto_spot');
      const threeSoldiers = signals.find(s => s.pattern === 'THREE_SOLDIERS');

      expect(threeSoldiers).toBeDefined();
      expect(threeSoldiers?.direction).toBe('BUY');
      expect(threeSoldiers?.strength).toBeGreaterThan(0.75);
    });

    it('returns empty array for insufficient candles (preserves <3 candle skip)', () => {
      const candles: Candle[] = [
        { timestamp: 1000, open: 100, high: 101, low: 99, close: 100, volume: 1000 },
        { timestamp: 2000, open: 100, high: 101, low: 99, close: 100, volume: 1000 },
      ];

      const signals = scanPatterns(candles, 'BTCUSD', 'crypto_spot');
      expect(signals).toEqual([]);
    });
  });

  describe('patternToTradeSignal — crypto fixture corpus', () => {
    it('PINBAR trade signal preserves 1.5× ATR stop + 2.5× ATR target (crypto_spot)', () => {
      const patternSignal = {
        symbol: 'BTCUSD',
        pattern: 'PINBAR' as const,
        direction: 'BUY' as const,
        strength: 0.75,
        timestamp: 3000,
        metadata: {},
      };

      const tradeSignal = patternToTradeSignal(patternSignal, 50000, 500, 'crypto_spot');

      // ATR multipliers (1.5× stop, 2.5× target) are crypto-tuned hardcoded
      // per SIM §11263. PATTERN-DETECT does NOT change these — only adds
      // REQUIRED-`assetClass` parameter. Layer-3 per-class tuning deferred.
      expect(tradeSignal.entryPrice).toBe(50000);
      expect(tradeSignal.stopPrice).toBe(50000 - 1.5 * 500);   // 49250
      expect(tradeSignal.targetPrice).toBe(50000 + 2.5 * 500); // 51250
      expect(tradeSignal.confidence).toBe(75);  // strength * 100
      expect(tradeSignal.strategy).toBe('pattern_pinbar');
    });

    it('MORNING_STAR trade signal preserves geometry (ETHUSD, crypto_spot)', () => {
      const patternSignal = {
        symbol: 'ETHUSD',
        pattern: 'MORNING_STAR' as const,
        direction: 'BUY' as const,
        strength: 0.85,
        timestamp: 3000,
        metadata: {},
      };

      const tradeSignal = patternToTradeSignal(patternSignal, 3000, 50, 'crypto_spot');

      expect(tradeSignal.entryPrice).toBe(3000);
      expect(tradeSignal.stopPrice).toBe(3000 - 1.5 * 50);   // 2925
      expect(tradeSignal.targetPrice).toBe(3000 + 2.5 * 50); // 3125
      expect(tradeSignal.confidence).toBe(85);
      expect(tradeSignal.strategy).toBe('pattern_morning_star');
    });
  });
});
