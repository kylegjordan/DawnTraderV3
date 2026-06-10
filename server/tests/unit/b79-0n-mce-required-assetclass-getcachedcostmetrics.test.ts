/**
 * B79.0n.MCE — getCachedCostMetrics required-assetClass regression lock (2026-05-21)
 *
 * `getCachedCostMetrics` (server/core/math/cost-model.ts) had its prior
 * crypto_spot silent default removed; the signature is now
 * `getCachedCostMetrics(symbol: string, assetClass: AssetClass)` — both
 * arguments REQUIRED. For crypto_spot the result still equals the existing
 * symbol-keyed cost cache (exact back-compat); for any other asset class the
 * defaults are synthesized from that class's friction module.
 *
 * The `@ts-expect-error` directive below is the regression lock — if a future
 * refactor re-introduces the optional/defaulted assetClass, the directive
 * becomes incorrect and the TypeScript compiler rejects this file with
 * "Unused @ts-expect-error directive." That is the regression-detect signal.
 *
 * Per Kyle directive §11 (no silent defaults) + §15 (NO PATCHES).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { getCachedCostMetrics } from '../../core/math/cost-model';
// B-4.5: the crypto cache seed resolves the DB-governed fee (fail-hard on
// cold cache) — seed the sync cache in-memory like the sibling MCE suites.
import { _seedModuleCacheForTests } from '../../services/module-constants-service.js';
import type { ModuleConstant } from '../../../shared/schema.js';

beforeAll(() => {
  const row = (assetClass: string, constantName: string, value: number) => ({
    moduleName: 'fee_model', exchange: '*', assetClass, strategy: '*', regime: '*',
    constantName, value,
  } as unknown as ModuleConstant);
  _seedModuleCacheForTests('fee_model', [
    row('crypto_spot', 'spot_taker_fee', 0.008),
    row('crypto_spot', 'spot_maker_fee', 0.004),
    row('xstock_spot', 'spot_taker_fee', 0.008),
    row('xstock_spot', 'spot_maker_fee', 0.004),
  ]);
});

describe('[B79.0n.MCE] getCachedCostMetrics requires assetClass', () => {
  it('TYPE LOCK — calling getCachedCostMetrics without assetClass MUST be a compile error', () => {
    function callerMissingAssetClass() {
      // @ts-expect-error — assetClass is REQUIRED per B79.0n.MCE
      return getCachedCostMetrics('BTC/USD');
    }
    expect(typeof callerMissingAssetClass).toBe('function');
  });

  it('TYPE LOCK — calling getCachedCostMetrics WITH assetClass compiles cleanly', () => {
    function callerWithAssetClass() {
      return getCachedCostMetrics('BTC/USD', 'crypto_spot');
    }
    expect(typeof callerWithAssetClass).toBe('function');
  });

  it('returns well-formed cost components for an explicit crypto_spot call', () => {
    // Functional sanity counterpart — the back-compat crypto_spot path must
    // still return the fee/slippage/spread component triple.
    const metrics = getCachedCostMetrics('BTC/USD', 'crypto_spot');
    expect(typeof metrics.fee).toBe('number');
    expect(typeof metrics.slippage).toBe('number');
    expect(typeof metrics.spread).toBe('number');
  });
});
