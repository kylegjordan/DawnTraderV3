/**
 * Directive 11.7H Task H-03 — VN Parity Verification Test
 *
 * Schema: metrics-calibration/v1.2
 *
 * Validates that IMF VN calculation and analysis-utils canonical VN function
 * produce identical results, ensuring cross-mode parity between:
 * - Passive learning (OHLC cache path via imf-metrics.ts)
 * - Active trading (ticker path via analysis-utils.ts)
 *
 * Batch 19G VN: Updated for log-returns MAD/median formula.
 * The parity contract is unchanged — IMF delegates to canonical, so results must match.
 * Value ranges may differ from pre-19G expectations due to new formula.
 */

import { describe, it, expect } from 'vitest';
import { calculateVolNoise as imfCalculateVolNoise } from '../../core/metrics/imf-metrics';
import { calculateVolNoise as canonicalCalculateVolNoise } from '../../utils/analysis-utils';
import type { OHLCData } from '../../types/market-regime.types';

describe('Directive 11.7H: VN Cross-Mode Parity', () => {

  it('IMF VN matches canonical analysis-utils VN for typical OHLC data', () => {
    const candles: OHLCData[] = [
      { open: 100, high: 102, low: 99, close: 100, volume: 1000, timestamp: 1 },
      { open: 100, high: 103, low: 99, close: 101, volume: 1000, timestamp: 2 },
      { open: 101, high: 104, low: 100, close: 102, volume: 1000, timestamp: 3 },
      { open: 102, high: 103, low: 101, close: 101.5, volume: 1000, timestamp: 4 },
      { open: 101.5, high: 102.5, low: 100.5, close: 101, volume: 1000, timestamp: 5 },
    ];

    const vnIMF = imfCalculateVolNoise(candles);
    const vnCanonical = canonicalCalculateVolNoise(candles.map(c => c.close));

    expect(vnIMF).toBeCloseTo(vnCanonical, 2);
    console.log(`[11.7H][Parity] IMF VN=${vnIMF.toFixed(4)}, Canonical VN=${vnCanonical.toFixed(4)}`);
  });

  it('IMF VN returns 0.5 default for insufficient data (< 3 candles)', () => {
    const tinyCandles: OHLCData[] = [
      { open: 100, high: 102, low: 99, close: 100, volume: 1000, timestamp: 1 },
      { open: 100, high: 103, low: 99, close: 101, volume: 1000, timestamp: 2 },
    ];

    const vnIMF = imfCalculateVolNoise(tinyCandles);
    const vnCanonical = canonicalCalculateVolNoise(tinyCandles.map(c => c.close));

    expect(vnIMF).toBe(0.5);
    expect(vnCanonical).toBe(0.5);
  });

  it('VN values fall within 0-1 range for stable market data', () => {
    const stableCandles: OHLCData[] = [];
    let price = 100;
    for (let i = 0; i < 20; i++) {
      const change = (Math.random() - 0.5) * 0.5;
      price += change;
      stableCandles.push({
        open: price - 0.1,
        high: price + 0.2,
        low: price - 0.2,
        close: price,
        volume: 1000,
        timestamp: i,
      });
    }

    const vnIMF = imfCalculateVolNoise(stableCandles);

    expect(vnIMF).toBeGreaterThanOrEqual(0);
    expect(vnIMF).toBeLessThanOrEqual(1);
    console.log(`[11.7H][Range] Stable market VN=${vnIMF.toFixed(4)}`);
  });

  it('VN calculation is deterministic (same input = same output)', () => {
    const candles: OHLCData[] = [
      { open: 100, high: 102, low: 99, close: 100, volume: 1000, timestamp: 1 },
      { open: 100, high: 103, low: 99, close: 101, volume: 1000, timestamp: 2 },
      { open: 101, high: 104, low: 100, close: 102, volume: 1000, timestamp: 3 },
      { open: 102, high: 103, low: 101, close: 101.5, volume: 1000, timestamp: 4 },
    ];

    const vn1 = imfCalculateVolNoise(candles);
    const vn2 = imfCalculateVolNoise(candles);
    const vn3 = imfCalculateVolNoise(candles);

    expect(vn1).toBe(vn2);
    expect(vn2).toBe(vn3);
  });

  it('Empty OHLC array returns safe default', () => {
    const vnIMF = imfCalculateVolNoise([]);
    expect(vnIMF).toBe(0.5);
  });

  it('VN parity holds for volatile market simulation', () => {
    const volatileCandles: OHLCData[] = [];
    let price = 100;
    for (let i = 0; i < 30; i++) {
      const change = (Math.random() - 0.5) * 5;
      price += change;
      // Ensure price stays positive for log returns
      if (price < 1) price = 1;
      volatileCandles.push({
        open: price - 1,
        high: price + 2,
        low: price - 2,
        close: price,
        volume: 1000,
        timestamp: i,
      });
    }

    const vnIMF = imfCalculateVolNoise(volatileCandles);
    const vnCanonical = canonicalCalculateVolNoise(volatileCandles.map(c => c.close));

    expect(vnIMF).toBeCloseTo(vnCanonical, 2);
    console.log(`[11.7H][Volatile] IMF VN=${vnIMF.toFixed(4)}, Canonical VN=${vnCanonical.toFixed(4)}`);
  });

  it('VN is scale-independent (same % moves at different price levels produce same VN)', () => {
    // This test validates the key property of the Batch 19G log-returns formula
    const makeCandles = (basePrice: number): OHLCData[] => {
      const multipliers = [1, 1.01, 0.99, 1.02, 0.98, 1.015, 0.985, 1.005, 0.995, 1.01];
      let price = basePrice;
      return multipliers.map((m, i) => {
        price = basePrice * m;
        return {
          open: price * 0.999,
          high: price * 1.002,
          low: price * 0.998,
          close: price,
          volume: 1000,
          timestamp: i,
        };
      });
    };

    const lowPriceCandles = makeCandles(1);        // $1 asset
    const highPriceCandles = makeCandles(60000);    // BTC-like price

    const vnLow = imfCalculateVolNoise(lowPriceCandles);
    const vnHigh = imfCalculateVolNoise(highPriceCandles);

    // Same percentage moves should produce same VN (within floating point tolerance)
    expect(vnLow).toBeCloseTo(vnHigh, 4);
    console.log(`[11.7H][Scale] Low price VN=${vnLow.toFixed(4)}, High price VN=${vnHigh.toFixed(4)}`);
  });
});
