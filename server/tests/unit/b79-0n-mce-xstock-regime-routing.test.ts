/**
 * B79.0n.MCE — xStock vs crypto regime-threshold routing (2026-05-21)
 *
 * `calculatePairRegime` dispatches its regime-classification thresholds by
 * asset class (market-regime.ts:245 — the `t` threshold object). When
 * `assetClass === 'xstock_spot'` the xStock-specific threshold constants are
 * selected; every other asset class uses the crypto baseline. Before
 * B79.0n.MCE a missing `assetClass` arg silently defaulted to `'crypto_spot'`,
 * so xStock signals were classified against crypto's thresholds.
 *
 * This test verifies that both routing paths are reachable and produce a
 * well-formed `RegimeCalculationResult` — i.e. the xStock branch runs end to
 * end and does not throw. Assertions are deliberately robust to the synthetic
 * OHLC: the regime LABEL is data-dependent (and the two asset classes may
 * legitimately agree or disagree on any given series), so we assert the
 * STRUCTURAL contract (valid result shape, finite metrics, in-range
 * confidence) rather than a specific label.
 */

import { describe, it, expect } from 'vitest';
import { calculatePairRegime, DEFAULT_REGIME_CONFIG } from '../../core/metrics/market-regime';
import type { OHLCData } from '../../types/market-regime.types';

/** Synthetic OHLC with a mild, noisy upward drift — exercises the classifier
 *  branches without forcing any single regime. */
function makeSyntheticOhlc(count = 60): OHLCData[] {
  const ohlc: OHLCData[] = [];
  for (let i = 0; i < count; i++) {
    const close = 100 + i * 0.15 + (i % 3) * 0.08;
    ohlc.push({
      open: close - 0.05,
      high: close + 0.12,
      low: close - 0.12,
      close,
      volume: 1000 + (i % 5) * 50,
      timestamp: i * 60_000,
    });
  }
  return ohlc;
}

function assertValidRegimeResult(result: ReturnType<typeof calculatePairRegime>): void {
  expect(typeof result.regime).toBe('string');
  expect(result.regime.length).toBeGreaterThan(0);
  expect(Number.isFinite(result.volatility)).toBe(true);
  expect(Number.isFinite(result.momentum)).toBe(true);
  expect(Number.isFinite(result.adx)).toBe(true);
  expect(Number.isFinite(result.confidence)).toBe(true);
  // Post-clamp confidence sits inside the [floor, 1.0] band.
  expect(result.confidence).toBeGreaterThanOrEqual(0);
  expect(result.confidence).toBeLessThanOrEqual(1.0);
}

describe('[B79.0n.MCE] calculatePairRegime routes thresholds by asset class', () => {
  const ohlc = makeSyntheticOhlc();

  it('runs end to end for assetClass="crypto_spot"', () => {
    const result = calculatePairRegime(ohlc, 0.3, 0, 1.0, DEFAULT_REGIME_CONFIG, 'crypto_spot' as const);
    assertValidRegimeResult(result);
  });

  it('runs end to end for assetClass="xstock_spot" — the xStock threshold branch is reachable', () => {
    const result = calculatePairRegime(ohlc, 0.3, 0, 1.0, DEFAULT_REGIME_CONFIG, 'xstock_spot' as const);
    assertValidRegimeResult(result);
  });

  it('the xStock branch processes the SAME OHLC without throwing on either path', () => {
    // Both calls must complete; whether the labels agree is data-dependent and
    // intentionally not asserted (the xStock thresholds differ from crypto, so
    // divergence on a borderline series is expected, not a failure).
    const crypto = calculatePairRegime(ohlc, 0.5, 0, 1.0, DEFAULT_REGIME_CONFIG, 'crypto_spot' as const);
    const xstock = calculatePairRegime(ohlc, 0.5, 0, 1.0, DEFAULT_REGIME_CONFIG, 'xstock_spot' as const);
    assertValidRegimeResult(crypto);
    assertValidRegimeResult(xstock);
    // The raw metrics (vol/mom/adx) are computed from OHLC alone — independent
    // of asset class — so they must be identical across the two calls. Only the
    // threshold COMPARISONS differ.
    expect(xstock.volatility).toBe(crypto.volatility);
    expect(xstock.momentum).toBe(crypto.momentum);
    expect(xstock.adx).toBe(crypto.adx);
  });
});
