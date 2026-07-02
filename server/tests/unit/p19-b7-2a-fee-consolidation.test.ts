/**
 * P19-B7.2a (#330) — fee-resolver consolidation: one road to the fee fact.
 *
 * Named guards (scope OBJ-2 + Langston Step-2 CHANGE-3):
 *  1. POISONED-FEE-CANNOT-LEAK — a cache entry can no longer carry a fee at
 *     all (shape), and getCachedCostMetrics' crypto lane composes the fee from
 *     the B-4.5 merge site regardless of what the cache holds.
 *  2. FEE_MODEL VISIBILITY — a fee_model change is visible on the NEXT read
 *     (the fee has no cache TTL by construction).
 *  3. FRICTION-PATH IDENTITY, BOTH CLASSES — computeMarketFriction over
 *     merge-site fees produces identical scores to the pre-B7.2a cache-fee
 *     road on identical spread/slippage, for crypto_spot AND xstock_spot
 *     (provenance not price — and the class-parameterized compose means a
 *     future class fee divergence is HONORED, not flattened to crypto's).
 *  4. CLAMP-FOR-MEASUREMENTS-ONLY — MAX_COST_BOUND still bounds measured
 *     spread/slippage; the governed fee never meets the clamp (structural:
 *     it never enters setCostMetrics).
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { _seedModuleCacheForTests } from '../../services/module-constants-service.js';
import type { ModuleConstant } from '../../../shared/schema.js';

const TIER1_TAKER = 0.008;
const XSTOCK_TAKER_DIVERGED = 0.006; // deliberately DIFFERENT to prove class-honoring

function feeRow(assetClass: string, constantName: string, value: number) {
  return {
    moduleName: 'fee_model', exchange: '*', assetClass, strategy: '*', regime: '*',
    constantName, value,
  } as unknown as ModuleConstant;
}

function seedFees(cryptoTaker: number, xstockTaker: number) {
  _seedModuleCacheForTests('fee_model', [
    feeRow('crypto_spot', 'spot_taker_fee', cryptoTaker),
    feeRow('crypto_spot', 'spot_maker_fee', 0.004),
    feeRow('xstock_spot', 'spot_taker_fee', xstockTaker),
    feeRow('xstock_spot', 'spot_maker_fee', 0.004),
  ]);
}

beforeAll(() => seedFees(TIER1_TAKER, TIER1_TAKER));

describe('P19-B7.2a — one road to the fee fact', () => {
  beforeEach(async () => {
    seedFees(TIER1_TAKER, TIER1_TAKER);
    const { clearCostCache } = await import('../../core/cache/cost-cache.js');
    clearCostCache();
  });

  it('POISONED-FEE-CANNOT-LEAK: the cache SHAPE carries no fee, and the composed fee === the merge site', async () => {
    const { setCostMetrics, getCostMetrics } = await import('../../core/cache/cost-cache.js');
    const { getCachedCostMetrics, getFrictionForAssetClass } = await import('../../core/math/cost-model.js');

    // A legacy-shaped write attempting to smuggle a fee is a compile error now;
    // simulate the runtime equivalent (an any-cast poisoned object) and prove
    // the read path never consults it.
    setCostMetrics('BTC/USD', { slippage: 0.0005, spread: 0.001, ...( { fee: 0.99 } as any) });
    const cached = getCostMetrics('BTC/USD');
    expect(cached && 'fee' in cached).toBe(false); // the poisoned field is not stored

    const composed = getCachedCostMetrics('BTC/USD', 'crypto_spot');
    expect(composed.fee).toBe(getFrictionForAssetClass('crypto_spot').feeRateTaker);
    expect(composed.fee).toBe(TIER1_TAKER);
    expect(composed.spread).toBe(0.001); // measured legs still cache-served
  });

  it('FEE_MODEL VISIBILITY: a fee change is live on the NEXT read — no cache TTL on the fee', async () => {
    const { getCachedCostMetrics } = await import('../../core/math/cost-model.js');
    const { getOrSetCostMetrics } = await import('../../core/cache/cost-cache.js');

    getOrSetCostMetrics('ETH/USD'); // seed a FRESH cache entry (5-min TTL)
    expect(getCachedCostMetrics('ETH/USD', 'crypto_spot').fee).toBe(TIER1_TAKER);

    seedFees(0.005, TIER1_TAKER); // the DB-governed fee changes (e.g. a tier move)
    // The cache entry is still fresh — under the OLD design this read would
    // serve the stale 0.008 for up to 5 minutes. Now: live immediately.
    expect(getCachedCostMetrics('ETH/USD', 'crypto_spot').fee).toBe(0.005);
  });

  it('FRICTION-PATH IDENTITY, BOTH CLASSES: merge-site fees reproduce the friction score exactly, per class', async () => {
    const { computeMarketFriction } = await import('../../core/metrics/cost-metrics.js');
    const { getFrictionForAssetClass } = await import('../../core/math/cost-model.js');

    const spread = 0.0015, slippage = 0.0005;
    // Identity: same fee value in → same score out (provenance not price).
    expect(computeMarketFriction(spread, slippage, getFrictionForAssetClass('crypto_spot').feeRateTaker))
      .toBe(computeMarketFriction(spread, slippage, TIER1_TAKER));
    expect(computeMarketFriction(spread, slippage, getFrictionForAssetClass('xstock_spot').feeRateTaker))
      .toBe(computeMarketFriction(spread, slippage, TIER1_TAKER));

    // Class-honoring (the CHANGE-1 guard): if the classes' fees DIVERGE, the
    // class-parameterized compose must yield DIFFERENT scores — a crypto_spot
    // hardcode at a friction site would flatten this and FAIL here.
    seedFees(TIER1_TAKER, XSTOCK_TAKER_DIVERGED);
    const cryptoScore = computeMarketFriction(spread, slippage, getFrictionForAssetClass('crypto_spot').feeRateTaker);
    const xstockScore = computeMarketFriction(spread, slippage, getFrictionForAssetClass('xstock_spot').feeRateTaker);
    expect(getFrictionForAssetClass('xstock_spot').feeRateTaker).toBe(XSTOCK_TAKER_DIVERGED);
    expect(cryptoScore).not.toBe(xstockScore);
  });

  it('CLAMP-FOR-MEASUREMENTS-ONLY: MAX_COST_BOUND bounds spread/slippage; the governed fee is structurally un-clampable', async () => {
    const { setCostMetrics, getCostMetrics } = await import('../../core/cache/cost-cache.js');
    const { getCachedCostMetrics } = await import('../../core/math/cost-model.js');
    const { MAX_COST_BOUND } = await import('../../config/exchange-defaults.js');

    setCostMetrics('SOL/USD', { slippage: 0.5, spread: 0.5 });
    const cached = getCostMetrics('SOL/USD')!;
    expect(cached.slippage).toBe(MAX_COST_BOUND);
    expect(cached.spread).toBe(MAX_COST_BOUND);

    // A governed fee ABOVE the clamp bound must pass through UNCLAMPED — the
    // fee never enters setCostMetrics, so the clamp cannot touch it.
    seedFees(0.03, TIER1_TAKER); // 3% > MAX_COST_BOUND 2%
    expect(getCachedCostMetrics('SOL/USD', 'crypto_spot').fee).toBe(0.03);
  });

  it('stats wrapper: avgFee === the merge-site class fee (the 4 production stat readers’ shape)', async () => {
    const { setCostMetrics } = await import('../../core/cache/cost-cache.js');
    const { getCostCacheStatsWithFee } = await import('../../core/math/cost-model.js');

    setCostMetrics('ADA/USD', { slippage: 0.001, spread: 0.002 });
    const stats = getCostCacheStatsWithFee();
    expect(stats.avgFee).toBe(TIER1_TAKER);
    expect(stats.symbolCount).toBe(1);
    expect(stats.avgSpread).toBe(0.002);
  });
});
