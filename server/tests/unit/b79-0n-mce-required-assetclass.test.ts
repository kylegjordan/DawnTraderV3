/**
 * B79.0n.MCE — required-assetClass regression lock (2026-05-21)
 *
 * Locks the breaking type-level change made to the three core MCE-pipeline
 * signatures whose silent `assetClass = 'crypto_spot'` default was REMOVED and
 * made REQUIRED:
 *
 *   - `calculatePairRegime`           (server/core/metrics/market-regime.ts)
 *   - `MarketContextEngine.computeContext` (server/services/market-context-engine.ts)
 *   - `getFrictionForAssetClass`      (server/core/math/cost-model.ts)
 *
 * Each `@ts-expect-error` directive below is the regression lock — if a future
 * refactor accidentally re-introduces an optional/defaulted shape, the
 * `@ts-expect-error` becomes incorrect (the omission no longer errors) and the
 * TypeScript compiler rejects this file with "Unused @ts-expect-error
 * directive." That is the regression-detect signal.
 *
 * Per Kyle directive §11 (no silent defaults) + §15 (NO PATCHES). tsconfig has
 * `strict: true`, so the missing-required-argument error fires.
 */

import { describe, it, expect } from 'vitest';
import { calculatePairRegime, DEFAULT_REGIME_CONFIG } from '../../core/metrics/market-regime';
import { getFrictionForAssetClass } from '../../core/math/cost-model';
import type { MarketContextEngine } from '../../services/market-context-engine';
import type { OHLCData } from '../../types/market-regime.types';

const FLAT_OHLC: OHLCData[] = Array.from({ length: 30 }, (_v, i) => ({
  open: 100,
  high: 100,
  low: 100,
  close: 100,
  volume: 1000,
  timestamp: i * 60_000,
}));

describe('[B79.0n.MCE] core signatures require assetClass', () => {
  it('TYPE LOCK — calling calculatePairRegime without assetClass MUST be a compile error', () => {
    function callerMissingAssetClass() {
      // @ts-expect-error — assetClass is REQUIRED per B79.0n.MCE
      return calculatePairRegime(FLAT_OHLC, 0, 0, 1.0, DEFAULT_REGIME_CONFIG);
    }
    expect(typeof callerMissingAssetClass).toBe('function');
  });

  it('TYPE LOCK — calling computeContext without assetClass MUST be a compile error', () => {
    function callerMissingAssetClass(mce: MarketContextEngine) {
      // @ts-expect-error — assetClass is REQUIRED per B79.0n.MCE
      return mce.computeContext('BTC/USD', FLAT_OHLC, 100, 1000);
    }
    expect(typeof callerMissingAssetClass).toBe('function');
  });

  it('TYPE LOCK — calling getFrictionForAssetClass without assetClass MUST be a compile error', () => {
    function callerMissingAssetClass() {
      // @ts-expect-error — assetClass is REQUIRED per B79.0n.MCE
      return getFrictionForAssetClass();
    }
    expect(typeof callerMissingAssetClass).toBe('function');
  });

  it('TYPE LOCK — calling calculatePairRegime WITH assetClass compiles cleanly', () => {
    function callerWithAssetClass() {
      return calculatePairRegime(FLAT_OHLC, 0, 0, 1.0, DEFAULT_REGIME_CONFIG, 'crypto_spot' as const);
    }
    expect(typeof callerWithAssetClass).toBe('function');
  });
});
