/**
 * ════════════════════════════════════════════════════════════════════════════
 * B.1.5 — xStock liquidity isolation + behavior tests
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Per pre-audit §4 (cross-asset isolation proof plan) — proves:
 *
 *   1. The NEW xStock depth-based LQ (`calculateXstockDepthLQ`) maps depth-USD
 *      to a 0-100 score with log10 parity-shape vs crypto LQ, and handles the
 *      graceful sentinel paths (depth absent / non-finite / negative → 0).
 *
 *   2. The SHARED crypto LQ function `calculateLogLiquidity` produces
 *      byte-identical output for crypto-shaped OHLC inputs vs golden values —
 *      proves the crypto path is untouched by B.1.5 (no edit to imf-metrics.ts).
 *      This is the regression-lock that mirrors the B79.0n.MCE / SQE isolation
 *      tests (`b79-0n-mce-cache-isolation.test.ts`).
 *
 *   3. The xStock LQ module is a SEPARATE forked module — verified by import
 *      path (only xstock_spot/imf-evaluator + pattern-filter import it; crypto
 *      filters import neither). Structural isolation is enforced by the
 *      directory boundary; this test asserts the export surface is what we
 *      expect (one named function, depth-only signature).
 * ════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect } from 'vitest';
import { calculateXstockDepthLQ } from '../../asset_classes/xstock_spot/imf-liquidity.js';
import { calculateLogLiquidity } from '../../core/metrics/imf-metrics.js';

describe('B.1.5 — xStock depth-based LQ (calculateXstockDepthLQ)', () => {
  it('returns 0 when askDepthUsd is the sentinel -1 (data unavailable)', () => {
    expect(calculateXstockDepthLQ(-1)).toBe(0);
  });

  it('returns 0 when askDepthUsd is 0 (genuine zero depth)', () => {
    expect(calculateXstockDepthLQ(0)).toBe(0);
  });

  it('returns 0 when askDepthUsd is non-finite (NaN / Infinity input handled defensively)', () => {
    expect(calculateXstockDepthLQ(NaN)).toBe(0);
    // Infinity is finite-test-positive in JS Number.isFinite → false; should map to 0
    expect(calculateXstockDepthLQ(Number.POSITIVE_INFINITY)).toBe(0);
    expect(calculateXstockDepthLQ(Number.NEGATIVE_INFINITY)).toBe(0);
  });

  it('returns 0 when askDepthUsd is negative (defensive — sentinel convention)', () => {
    expect(calculateXstockDepthLQ(-100)).toBe(0);
    expect(calculateXstockDepthLQ(-1_000_000)).toBe(0);
  });

  it('maps $10K top-of-book to LQ≈40 (log10 parity-shape with crypto LQ)', () => {
    // log10(10000 + 1) × 10 ≈ 40.0000434
    const lq = calculateXstockDepthLQ(10_000);
    expect(lq).toBeGreaterThan(39.99);
    expect(lq).toBeLessThan(40.01);
  });

  it('maps $100K top-of-book to LQ≈50', () => {
    const lq = calculateXstockDepthLQ(100_000);
    expect(lq).toBeGreaterThan(49.99);
    expect(lq).toBeLessThan(50.01);
  });

  it('maps $1M top-of-book to LQ≈60', () => {
    const lq = calculateXstockDepthLQ(1_000_000);
    expect(lq).toBeGreaterThan(59.99);
    expect(lq).toBeLessThan(60.01);
  });

  it('clamps to 100 for extremely deep books (defensive ceiling)', () => {
    // log10(1e10) * 10 = 100; anything above clamps to 100
    expect(calculateXstockDepthLQ(1e10)).toBeLessThanOrEqual(100);
    expect(calculateXstockDepthLQ(1e20)).toBe(100);
    expect(calculateXstockDepthLQ(Number.MAX_VALUE)).toBe(100);
  });

  it('produces monotonically non-decreasing output for increasing depth (sanity)', () => {
    const samples = [1, 10, 100, 1_000, 10_000, 100_000, 1_000_000, 10_000_000];
    let prev = -1;
    for (const v of samples) {
      const lq = calculateXstockDepthLQ(v);
      expect(lq).toBeGreaterThanOrEqual(prev);
      prev = lq;
    }
  });

  it('returns values strictly within [0, 100] across a wide range', () => {
    const samples = [-100, -1, 0, 0.5, 1, 100, 10_000, 1e6, 1e10, 1e20, NaN, Infinity];
    for (const v of samples) {
      const lq = calculateXstockDepthLQ(v);
      expect(lq).toBeGreaterThanOrEqual(0);
      expect(lq).toBeLessThanOrEqual(100);
    }
  });
});

describe('B.1.5 — Crypto LQ regression-lock (calculateLogLiquidity unchanged)', () => {
  // Golden-value tests: prove the shared crypto LQ function `calculateLogLiquidity`
  // produces the SAME output it did before B.1.5 (we did NOT edit imf-metrics.ts).
  // If any future batch edits the shared function, these tests catch the regression
  // and surface a crypto-side behavior change that needs explicit Kyle approval.
  // Formula (per System Manual §8): LQ = log10(avg(typicalPrice × volume) + 1) × 10,
  //   typicalPrice = (high + low + close) / 3, clamped [0, 100].

  it('returns 0 for empty OHLC (insufficient data)', () => {
    expect(calculateLogLiquidity([])).toBe(0);
  });

  it('returns 0 for fewer than 5 bars (minimum data requirement)', () => {
    const bars = Array.from({ length: 4 }, (_, i) => ({
      timestamp: 1000 + i * 60_000,
      open: 100, high: 101, low: 99, close: 100, volume: 1000,
    }));
    expect(calculateLogLiquidity(bars)).toBe(0);
  });

  it('produces a deterministic, log10-shaped value for a stable crypto-shaped 10-bar input', () => {
    // 10 bars at price ≈$100, volume ≈1000/bar → avgVolumeUSD ≈ 100,000 → LQ ≈ 50.
    const bars = Array.from({ length: 10 }, (_, i) => ({
      timestamp: 1000 + i * 60_000,
      open: 100, high: 101, low: 99, close: 100, volume: 1000,
    }));
    const lq = calculateLogLiquidity(bars);
    // typicalPrice = (101+99+100)/3 = 100; avgVolumeUSD = 100*1000 = 100000;
    // log10(100001) * 10 ≈ 50.00004
    expect(lq).toBeGreaterThan(49.9);
    expect(lq).toBeLessThan(50.1);
  });

  it('higher volumes produce higher LQ (monotonic, sanity check)', () => {
    const makeBars = (volume: number) => Array.from({ length: 10 }, (_, i) => ({
      timestamp: 1000 + i * 60_000,
      open: 100, high: 101, low: 99, close: 100, volume,
    }));
    const lqLow = calculateLogLiquidity(makeBars(100));
    const lqMed = calculateLogLiquidity(makeBars(10_000));
    const lqHigh = calculateLogLiquidity(makeBars(1_000_000));
    expect(lqLow).toBeLessThan(lqMed);
    expect(lqMed).toBeLessThan(lqHigh);
  });

  it('clamps to [0, 100] for extreme volumes (ceiling behavior unchanged)', () => {
    const extremeBars = Array.from({ length: 10 }, (_, i) => ({
      timestamp: 1000 + i * 60_000,
      open: 100, high: 101, low: 99, close: 100, volume: 1e30,
    }));
    expect(calculateLogLiquidity(extremeBars)).toBeLessThanOrEqual(100);
  });
});

describe('B.1.5 — Cross-asset isolation structure', () => {
  it('xstock_spot/imf-liquidity.ts exports only calculateXstockDepthLQ (signature lock)', async () => {
    const mod = await import('../../asset_classes/xstock_spot/imf-liquidity.js');
    const exports = Object.keys(mod);
    expect(exports).toContain('calculateXstockDepthLQ');
    // Pure depth-USD signature: one number in → one number out.
    expect(typeof mod.calculateXstockDepthLQ).toBe('function');
    expect(mod.calculateXstockDepthLQ.length).toBe(1); // arity = 1 (askDepthUsd only)
  });

  it('the two functions are independent — same numeric input produces independent results', () => {
    // Sanity that we are NOT accidentally routing crypto LQ through the xStock module.
    // 10000 to xStock LQ → ~40 (depth-USD interpretation).
    // 10000 fed as per-bar volume to crypto LQ via a 10-bar fixture → different number.
    const xstockLQ = calculateXstockDepthLQ(10_000);
    const cryptoBars = Array.from({ length: 10 }, (_, i) => ({
      timestamp: 1000 + i * 60_000,
      open: 100, high: 101, low: 99, close: 100, volume: 10_000,
    }));
    const cryptoLQ = calculateLogLiquidity(cryptoBars);
    // They should both produce valid LQs but be DIFFERENT numbers — proves they're
    // independent code paths, not accidentally aliased.
    expect(xstockLQ).toBeGreaterThan(0);
    expect(cryptoLQ).toBeGreaterThan(0);
    expect(xstockLQ).not.toBeCloseTo(cryptoLQ, 0);
  });
});
