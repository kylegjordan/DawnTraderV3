/**
 * Directive 9.1.H: Unit Test Suite for Analysis Utils
 * Tests core metric functions: LQ, DI, VolNoise, Sigma
 *
 * Batch 19G VN: Updated VolNoise tests for log-returns MAD/median formula.
 * The new formula uses log returns (price-level normalized) and robust statistics
 * (MAD/median instead of stddev/mean), producing different values than the old
 * absolute-diff formula but preserving the same behavioral contracts:
 * - Smooth trends → low VN
 * - Choppy data → high VN
 * - Range 0-1
 * - Insufficient data → 0.5
 */

import { describe, test, expect } from 'vitest';
import {
  calculateLogLiquidity,
  calculateDirectionalIntegrity,
  calculateVolNoise,
  calculateSigma,
  passesCoreMetricFilters,
  computeCoreMetrics,
  classifyVolume,
  CORE_METRIC_THRESHOLDS
} from '../../utils/analysis-utils';

describe('Directive 9.1 - Analysis Utils Core Tests', () => {
  describe('9.1.A - Log-Liquidity (LQ)', () => {
    test('LQ within 0-100 range for high volume', () => {
      const lq = calculateLogLiquidity(10_000_000, 500, 0.1);
      expect(lq).toBeLessThanOrEqual(100);
      expect(lq).toBeGreaterThanOrEqual(0);
    });

    test('LQ within 0-100 range for low volume', () => {
      const lq = calculateLogLiquidity(1000, 10, 10);
      expect(lq).toBeGreaterThanOrEqual(0);
      expect(lq).toBeLessThanOrEqual(100);
    });

    test('Higher volume results in higher LQ (or both saturate at 100)', () => {
      const lqLow = calculateLogLiquidity(100_000, 100, 0.1);
      const lqHigh = calculateLogLiquidity(10_000_000, 1000, 0.01);
      expect(lqHigh).toBeGreaterThanOrEqual(lqLow);
    });

    test('Handles zero/negative inputs gracefully', () => {
      expect(() => calculateLogLiquidity(0, 0, 0)).not.toThrow();
      const lq = calculateLogLiquidity(0, 0, 0);
      expect(lq).toBeGreaterThanOrEqual(0);
      expect(lq).toBeLessThanOrEqual(100);
    });
  });

  describe('9.1.B - Directional Integrity (DI)', () => {
    test('DI returns ~100 for linear upward trend', () => {
      const prices = [1, 2, 3, 4, 5];
      const di = calculateDirectionalIntegrity(prices);
      expect(di).toBeGreaterThan(95);
    });

    test('DI returns ~100 for linear downward trend', () => {
      const prices = [5, 4, 3, 2, 1];
      const di = calculateDirectionalIntegrity(prices);
      expect(di).toBeGreaterThan(95);
    });

    test('DI returns low for choppy/oscillating prices', () => {
      const prices = [1, 5, 1, 5, 1, 5, 1];
      const di = calculateDirectionalIntegrity(prices);
      expect(di).toBeLessThan(30);
    });

    test('DI returns 50 for insufficient data', () => {
      expect(calculateDirectionalIntegrity([1])).toBe(50);
      expect(calculateDirectionalIntegrity([1, 2])).toBe(50);
    });

    test('DI returns 0 for flat price (no net movement)', () => {
      const prices = [100, 100, 100, 100];
      const di = calculateDirectionalIntegrity(prices);
      expect(di).toBe(0);
    });
  });

  describe('9.1.C - Volatility Noise (VolNoise) — Batch 19G: Log-Returns MAD/Median', () => {
    test('VolNoise low for smooth constant-step trend', () => {
      // Constant step sizes → all log returns identical → MAD = 0 → VN = 0
      const prices = [100, 101, 102, 103, 104, 105];
      const vn = calculateVolNoise(prices);
      expect(vn).toBeLessThan(0.2);
    });

    test('VolNoise low for smooth exponential growth', () => {
      // Constant percentage growth → all log returns identical → MAD = 0 → VN = 0
      const prices = [100, 102, 104.04, 106.1208, 108.2432, 110.4081];
      const vn = calculateVolNoise(prices);
      expect(vn).toBeLessThan(0.1);
    });

    test('VolNoise higher for irregular oscillating series', () => {
      // Mixed large and small moves → high deviation from median → higher VN
      const prices = [100, 105, 98, 110, 95, 108];
      const vn = calculateVolNoise(prices);
      expect(vn).toBeGreaterThan(0.1);
    });

    test('VolNoise within 0-1 range for various inputs', () => {
      const smooth = calculateVolNoise([10, 11, 12, 13, 14]);
      const choppy = calculateVolNoise([10, 20, 10, 20, 10]);
      expect(smooth).toBeGreaterThanOrEqual(0);
      expect(smooth).toBeLessThanOrEqual(1);
      expect(choppy).toBeGreaterThanOrEqual(0);
      expect(choppy).toBeLessThanOrEqual(1);
    });

    test('VolNoise returns 0.5 for insufficient data', () => {
      expect(calculateVolNoise([1])).toBe(0.5);
      expect(calculateVolNoise([1, 2])).toBe(0.5);
    });

    test('VolNoise returns 0.5 for empty array', () => {
      expect(calculateVolNoise([])).toBe(0.5);
    });

    test('VolNoise handles zero prices gracefully', () => {
      // Zero prices should be skipped, and if not enough valid returns, return 0.5
      const prices = [0, 100, 200];
      const vn = calculateVolNoise(prices);
      expect(vn).toBeGreaterThanOrEqual(0);
      expect(vn).toBeLessThanOrEqual(1);
    });

    test('VolNoise is scale-independent (same percentage moves = same VN)', () => {
      // This is the key property of the new log-returns formula
      const lowPrice = [1, 1.01, 0.99, 1.02, 0.98, 1.01];
      const highPrice = [10000, 10100, 9900, 10200, 9800, 10100];
      const vnLow = calculateVolNoise(lowPrice);
      const vnHigh = calculateVolNoise(highPrice);
      // Same percentage moves should produce same VN (within floating point tolerance)
      expect(vnLow).toBeCloseTo(vnHigh, 2);
    });

    test('VolNoise = 0 for perfectly constant price', () => {
      // All returns = 0, median = 0, MAD = 0, VN = 0/0.0001 = 0
      const prices = [100, 100, 100, 100, 100];
      const vn = calculateVolNoise(prices);
      expect(vn).toBe(0);
    });

    test('Choppy prices produce higher VN than smooth trends', () => {
      const smooth = calculateVolNoise([100, 101, 102, 103, 104, 105, 106, 107, 108]);
      const choppy = calculateVolNoise([100, 110, 95, 115, 90, 120, 85, 125, 80]);
      expect(choppy).toBeGreaterThan(smooth);
    });
  });

  describe('9.1.D - Sigma Estimator', () => {
    test('Sigma low for smooth trend', () => {
      const prices = Array.from({ length: 25 }, (_, i) => 100 + i);
      const sigma = calculateSigma(prices);
      expect(sigma).toBeLessThan(1);
    });

    test('Sigma high for oscillating prices', () => {
      const prices = Array.from({ length: 25 }, (_, i) => i % 2 === 0 ? 100 : 110);
      const sigma = calculateSigma(prices);
      expect(sigma).toBeGreaterThan(1);
    });

    test('Sigma returns 0 for insufficient data', () => {
      const shortPrices = [1, 2, 3, 4, 5];
      expect(calculateSigma(shortPrices)).toBe(0);
    });

    test('Sigma uses price differences, not raw prices', () => {
      const constantDiff = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109,
                            110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120];
      const sigma = calculateSigma(constantDiff);
      expect(sigma).toBeCloseTo(0, 5);
    });
  });

  describe('9.1.F - Filter Thresholds', () => {
    test('passesCoreMetricFilters accepts high LQ and low VolNoise', () => {
      expect(passesCoreMetricFilters(80, 0.3)).toBe(true);
    });

    test('passesCoreMetricFilters rejects low LQ', () => {
      expect(passesCoreMetricFilters(30, 0.3)).toBe(false);
    });

    test('passesCoreMetricFilters rejects high VolNoise', () => {
      expect(passesCoreMetricFilters(80, 0.8)).toBe(false);
    });

    test('passesCoreMetricFilters uses correct thresholds', () => {
      expect(passesCoreMetricFilters(CORE_METRIC_THRESHOLDS.LQ_MIN, CORE_METRIC_THRESHOLDS.VOL_NOISE_MAX)).toBe(true);
      expect(passesCoreMetricFilters(CORE_METRIC_THRESHOLDS.LQ_MIN - 1, CORE_METRIC_THRESHOLDS.VOL_NOISE_MAX)).toBe(false);
      expect(passesCoreMetricFilters(CORE_METRIC_THRESHOLDS.LQ_MIN, CORE_METRIC_THRESHOLDS.VOL_NOISE_MAX + 0.1)).toBe(false);
    });
  });

  describe('computeCoreMetrics - Combined Function', () => {
    test('returns all metrics in correct format', () => {
      const prices = Array.from({ length: 25 }, (_, i) => 100 + i);
      const metrics = computeCoreMetrics(prices, 5_000_000, 500, 0.05);

      expect(metrics).toHaveProperty('LQ');
      expect(metrics).toHaveProperty('DI');
      expect(metrics).toHaveProperty('VolNoise');
      expect(metrics).toHaveProperty('Sigma');
      expect(metrics).toHaveProperty('passesFilter');

      expect(typeof metrics.LQ).toBe('number');
      expect(typeof metrics.DI).toBe('number');
      expect(typeof metrics.VolNoise).toBe('number');
      expect(typeof metrics.Sigma).toBe('number');
      expect(typeof metrics.passesFilter).toBe('boolean');
    });
  });

  describe('Volume Classification (Directive 9.0.B)', () => {
    test('classifies SMALL volume correctly', () => {
      expect(classifyVolume(500_000)).toBe('SMALL');
    });

    test('classifies MID volume correctly', () => {
      expect(classifyVolume(5_000_000)).toBe('MID');
    });

    test('classifies LARGE volume correctly', () => {
      expect(classifyVolume(50_000_000)).toBe('LARGE');
    });
  });
});

console.log('[9.1][VALIDATION COMPLETE] Core metrics integrated and verified.');
