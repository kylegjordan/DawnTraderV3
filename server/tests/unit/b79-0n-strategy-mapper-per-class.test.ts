/**
 * B79.0n.STRATEGY (2026-05-24) — strategy-mapper per-class behavior
 *
 * Per scope §4 test #4: verifies the migrated canonical JSON shape (v3.0.0
 * `byAssetClass` nesting) produces correct per-class regime→strategy lookups.
 *
 * Crypto subtree is byte-identical to pre-batch flat shape (regression-lock).
 * xStock subtree adds `orb` to TFS+IE; removes `defensive_hedge` from HVU.
 */

import { describe, it, expect } from 'vitest';
import {
  getFavoredStrategiesForRegime,
  getFavoredSignalTypesForRegime,
  getCanonicalRegimes,
  getCanonicalAssetClasses,
} from '../../core/strategy-mapper';

describe('B79.0n.STRATEGY — strategy-mapper per-class', () => {
  it('getCanonicalAssetClasses returns crypto_spot + xstock_spot', () => {
    const classes = getCanonicalAssetClasses();
    expect(classes).toContain('crypto_spot');
    expect(classes).toContain('xstock_spot');
    expect(classes.length).toBe(2);
  });

  it('crypto + xstock both have all 5 canonical regimes', () => {
    const cryptoRegimes = getCanonicalRegimes('crypto_spot');
    const xstockRegimes = getCanonicalRegimes('xstock_spot');
    const expected = ['HIGH_VOLATILITY_UNSTABLE', 'TREND_FRIENDLY_STABLE', 'IMPULSE_EXPANSION', 'RANGE_BOUND_STABLE', 'STRUCTURAL_TRANSITION'];
    for (const r of expected) {
      expect(cryptoRegimes).toContain(r);
      expect(xstockRegimes).toContain(r);
    }
  });

  it('crypto TFS strategies are byte-identical to pre-batch flat shape', () => {
    const cryptoTFS = getFavoredStrategiesForRegime('TREND_FRIENDLY_STABLE', 'crypto_spot');
    expect(cryptoTFS).toEqual(['vwap_pullback', 'morning_star', 'pivot_shift']);
  });

  it('xStock TFS adds orb to crypto baseline', () => {
    const xstockTFS = getFavoredStrategiesForRegime('TREND_FRIENDLY_STABLE', 'xstock_spot');
    expect(xstockTFS).toContain('orb');
    // Crypto baseline preserved
    expect(xstockTFS).toContain('vwap_pullback');
    expect(xstockTFS).toContain('morning_star');
    expect(xstockTFS).toContain('pivot_shift');
  });

  it('xStock IE adds orb to crypto baseline', () => {
    const xstockIE = getFavoredStrategiesForRegime('IMPULSE_EXPANSION', 'xstock_spot');
    expect(xstockIE).toContain('orb');
  });

  it('xStock HVU removes defensive_hedge (BTC-decorrelation strategy not applicable)', () => {
    const cryptoHVU = getFavoredStrategiesForRegime('HIGH_VOLATILITY_UNSTABLE', 'crypto_spot');
    const xstockHVU = getFavoredStrategiesForRegime('HIGH_VOLATILITY_UNSTABLE', 'xstock_spot');
    expect(cryptoHVU).toContain('defensive_hedge');
    expect(xstockHVU).not.toContain('defensive_hedge');
  });

  it('crypto RBS = xstock RBS (no class-specific surgical edits in RBS)', () => {
    const cryptoRBS = getFavoredStrategiesForRegime('RANGE_BOUND_STABLE', 'crypto_spot');
    const xstockRBS = getFavoredStrategiesForRegime('RANGE_BOUND_STABLE', 'xstock_spot');
    expect(xstockRBS).toEqual(cryptoRBS);
  });

  it('getFavoredSignalTypesForRegime per-class returns sensible values', () => {
    expect(getFavoredSignalTypesForRegime('TREND_FRIENDLY_STABLE', 'crypto_spot')).toContain('QUANT');
    expect(getFavoredSignalTypesForRegime('TREND_FRIENDLY_STABLE', 'xstock_spot')).toContain('QUANT');
  });

  it('unknown asset class throws (no silent fallback)', () => {
    expect(() => getFavoredStrategiesForRegime('TREND_FRIENDLY_STABLE', 'nonexistent_spot' as any))
      .toThrow(/No canonical regime-strategy map for asset class/);
  });

  it('unknown regime returns Unknown Strategy placeholder (warn-not-throw)', () => {
    const result = getFavoredStrategiesForRegime('NONEXISTENT_REGIME', 'crypto_spot');
    expect(result).toEqual(['Unknown Strategy']);
  });
});
