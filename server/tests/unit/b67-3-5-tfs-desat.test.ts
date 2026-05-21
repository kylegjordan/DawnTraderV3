/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B67.3.5 — TFS Branch Desaturation Unit Tests
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Covers the new continuous mapping `confidence = min + (max - min) ×
 * (momentum_factor × dbs_strength × vol_inverse)` that replaced the
 * step-function in market-regime.ts TFS branch.
 *
 * Output range is [0.50, 0.90] using the DEFAULT_REGIME_CONFIG seed values.
 * Reference: BATCH_67_3_5_PRE_AUDIT.md §B.6.
 * ═════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect } from 'vitest';
import {
  calculatePairRegime,
  DEFAULT_REGIME_CONFIG,
} from '../../core/metrics/market-regime';
import type { OHLCData } from '../../types/market-regime.types';
import { REGIMES } from '../../config/canonical-regime-strategy-map';

/**
 * Build OHLC with a controlled momentum and a controlled per-step volatility.
 * Used to land synthetic pairs in specific regions of the (mom, vol) space.
 *
 * Strategy: 60-candle series at price=100 base. Linear price drift to produce
 * a target end-momentum, plus per-candle noise to produce a target volatility.
 */
function makeOhlc(opts: {
  count?: number;
  startPrice?: number;
  endPrice: number;
  perStepNoise: number; // multiplicative noise stddev per candle
}): OHLCData[] {
  const count = opts.count ?? 60;
  const start = opts.startPrice ?? 100;
  const end = opts.endPrice;
  const ohlc: OHLCData[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1); // 0 → 1
    const trend = start + (end - start) * t;
    // Deterministic pseudo-noise so test is reproducible
    const noise = trend * opts.perStepNoise * Math.sin(i * 7.31);
    const close = trend + noise;
    const open = i === 0 ? close : ohlc[i - 1].close;
    const high = Math.max(open, close) * 1.001;
    const low = Math.min(open, close) * 0.999;
    ohlc.push({
      open,
      high,
      low,
      close,
      volume: 1000,
      timestamp: i * 60 * 60 * 1000,
    });
  }
  return ohlc;
}

describe('B67.3.5 — TFS branch desaturation', () => {
  it('strong-all-three pair lands near the upper bound (~0.85-0.90)', () => {
    // Strong end-of-window momentum, low volatility, |DBS| at upper-strong.
    // computeMomentum uses last 30 candles only — series must span enough
    // upward move that the last 30 candles alone show ≥ 2% momentum (the
    // saturation point for the default 0.020 momentum scale).
    const ohlc = makeOhlc({ count: 60, endPrice: 106, perStepNoise: 0.001 });
    const result = calculatePairRegime(ohlc, 0.7, 0, 1.0, DEFAULT_REGIME_CONFIG, 'crypto_spot' as const);
    expect(result.regime).toBe(REGIMES.TREND_FRIENDLY_STABLE);
    expect(result.confidence).toBeGreaterThan(0.80);
    expect(result.confidence).toBeLessThanOrEqual(0.90);
  });

  it('moderate pair lands in the mid range (~0.55-0.75)', () => {
    // Moderate momentum (~1%), moderate vol, |DBS|=0.4
    const ohlc = makeOhlc({ endPrice: 101, perStepNoise: 0.005 });
    const result = calculatePairRegime(ohlc, 0.4, 0, 1.0, DEFAULT_REGIME_CONFIG, 'crypto_spot' as const);
    if (result.regime === REGIMES.TREND_FRIENDLY_STABLE) {
      expect(result.confidence).toBeGreaterThanOrEqual(0.50);
      expect(result.confidence).toBeLessThan(0.80);
    }
  });

  it('zero-DBS classification produces minimum confidence (formula collapses)', () => {
    // Even with positive momentum, |DBS|=0 collapses the multiplicative product
    // → factor product = 0 → confidence = min (0.50).
    const ohlc = makeOhlc({ endPrice: 102, perStepNoise: 0.001 });
    const result = calculatePairRegime(ohlc, 0, 0, 1.0, DEFAULT_REGIME_CONFIG, 'crypto_spot' as const);
    if (result.regime === REGIMES.TREND_FRIENDLY_STABLE) {
      expect(result.confidence).toBeCloseTo(0.50, 2);
    }
  });

  it('confidence stays within [0.50, 0.90] before macro modifier', () => {
    // Many configurations — output bounds must hold.
    const cases: Array<{ end: number; noise: number; dbs: number }> = [
      { end: 100, noise: 0.002, dbs: 0.0 }, // flat
      { end: 105, noise: 0.001, dbs: 0.9 }, // strong
      { end: 98, noise: 0.020, dbs: -0.5 }, // bearish high vol
      { end: 101, noise: 0.005, dbs: 0.30 }, // borderline
    ];
    for (const c of cases) {
      const ohlc = makeOhlc({ endPrice: c.end, perStepNoise: c.noise });
      const result = calculatePairRegime(ohlc, c.dbs, 0, 1.0, DEFAULT_REGIME_CONFIG, 'crypto_spot' as const);
      if (result.regime === REGIMES.TREND_FRIENDLY_STABLE) {
        // Pre-modifier raw is what the desat formula produces; macroModifier=1.0
        // makes post-modifier == raw. Final clamp is [0.4, 1.0], so we check
        // the desat-formula range directly.
        expect(result.confidence).toBeGreaterThanOrEqual(0.50 - 1e-9);
        expect(result.confidence).toBeLessThanOrEqual(0.90 + 1e-9);
      }
    }
  });

  it('macro modifier still scales the desaturated raw confidence', () => {
    const ohlc = makeOhlc({ count: 60, endPrice: 106, perStepNoise: 0.001 });
    const baseline = calculatePairRegime(ohlc, 0.7, 0, 1.0, DEFAULT_REGIME_CONFIG, 'crypto_spot' as const);
    const boosted = calculatePairRegime(ohlc, 0.7, 0, 1.05, DEFAULT_REGIME_CONFIG, 'crypto_spot' as const);
    if (baseline.regime === REGIMES.TREND_FRIENDLY_STABLE) {
      // boosted ≈ baseline × 1.05 (until clamped at 1.0 ceiling)
      const expected = Math.min(baseline.confidence * 1.05, 1.0);
      expect(boosted.confidence).toBeCloseTo(expected, 4);
    }
  });

  it('respects override config (different bounds)', () => {
    const ohlc = makeOhlc({ count: 60, endPrice: 106, perStepNoise: 0.001 });
    const tightConfig = {
      tfsDesatMin: 0.60,
      tfsDesatMax: 0.80,
      tfsMomentumScale: 0.020,
      tfsVolatilityScale: 0.025,
      tfsDbsScale: 0.7,
      b68_5DbsSlopeMin: 0.0,
      b67_5PostCompositionFloor: 0.45,
    };
    const result = calculatePairRegime(ohlc, 0.7, 0, 1.0, tightConfig, 'crypto_spot' as const);
    if (result.regime === REGIMES.TREND_FRIENDLY_STABLE) {
      expect(result.confidence).toBeGreaterThanOrEqual(0.60);
      expect(result.confidence).toBeLessThanOrEqual(0.80);
    }
  });
});
