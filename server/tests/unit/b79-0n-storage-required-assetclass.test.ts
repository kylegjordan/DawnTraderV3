/**
 * B79.0n.STORAGE — required-assetClass regression lock (2026-05-21)
 *
 * Locks the breaking type-level change made to `storage.getScreenerFilters`.
 * Pre-batch signature was `assetClass?: string` (optional, with silent
 * `'crypto_spot'` default at `storage.ts:952`). Post-batch is
 * `assetClass: AssetClass` (REQUIRED, compile-fail if omitted).
 *
 * The `@ts-expect-error` directive below is the regression lock — if a future
 * refactor accidentally re-introduces the optional shape, this test FAILS to
 * compile (the `@ts-expect-error` becomes incorrect because the omission no
 * longer errors). That is the regression signal.
 *
 * Per Langston Step 2 ACK Q-S2-3 + Concern C: tsconfig has `strict: true`
 * (verified at tsconfig.json:11), so the missing-required-field error fires.
 */

import { describe, it, expect } from 'vitest';
import type { IStorage } from '../../storage';

describe('[B79.0n.STORAGE] getScreenerFilters requires assetClass', () => {
  it('TYPE LOCK — calling getScreenerFilters without assetClass MUST be a compile error', () => {
    // The annotation below asserts that the next line errors at compile time.
    // If this assertion ever stops firing (because the parameter became optional
    // again), the TypeScript compiler will reject this file with "Unused
    // @ts-expect-error directive." That is the regression-detect signal.
    function callerMissingAssetClass(storage: IStorage) {
      // @ts-expect-error — assetClass is REQUIRED per B79.0n.STORAGE
      return storage.getScreenerFilters({ mode: 'paper' });
    }
    // Existence assertion so vitest registers the test as run.
    expect(typeof callerMissingAssetClass).toBe('function');
  });

  it('TYPE LOCK — calling getScreenerFilters with explicit assetClass compiles cleanly', () => {
    function callerWithAssetClass(storage: IStorage) {
      return storage.getScreenerFilters({ mode: 'paper', assetClass: 'crypto_spot' });
    }
    expect(typeof callerWithAssetClass).toBe('function');
  });

  it('TYPE LOCK — getCanonicalScreenerConfig accepts mode+filterPath (no assetClass param)', () => {
    function diagnosticCaller(storage: IStorage) {
      // Helper for UI/diagnostic display — internally hardcodes crypto_spot.
      // NEVER use for asset-class-aware runtime routing (see helper docstring).
      return storage.getCanonicalScreenerConfig({ mode: 'paper', filterPath: 'active_quant' });
    }
    expect(typeof diagnosticCaller).toBe('function');
  });

  // B79.0n.STORAGE (2026-05-21 + Langston Step 4 BLOCKER fix): the upsertScreenerFilters
  // UPDATE WHERE clause previously matched `(mode, filterPath)` only. After the seed
  // migration creates 2 rows per (mode, filterPath) (crypto_spot + xstock_spot), that
  // WHERE matched BOTH rows — either violating the unique index or silently
  // cross-corrupting data. Fix: assetClass added to WHERE + REQUIRED on data shape.
  it('TYPE LOCK — upsertScreenerFilters REQUIRES assetClass on data shape', () => {
    function callerMissingUpsertAssetClass(storage: IStorage) {
      // @ts-expect-error — assetClass is REQUIRED on upsert data per B79.0n.STORAGE BLOCKER fix
      return storage.upsertScreenerFilters({ mode: 'paper', filterPath: 'active_quant' });
    }
    function callerWithUpsertAssetClass(storage: IStorage) {
      return storage.upsertScreenerFilters({
        mode: 'paper',
        assetClass: 'xstock_spot',
        filterPath: 'active_quant'
      });
    }
    expect(typeof callerMissingUpsertAssetClass).toBe('function');
    expect(typeof callerWithUpsertAssetClass).toBe('function');
  });
});
