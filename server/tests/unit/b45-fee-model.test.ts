/**
 * B-4.5 — DB-governed fee model unit locks (scope objective 5).
 *
 * Locks:
 *  1. Per-class resolution: getFrictionForAssetClass merges the DB-governed
 *     Tier-1 rates (taker 0.008 / maker 0.004 decimal) over the static
 *     friction modules for BOTH spot classes; non-fee fields stay static.
 *  2. Fail-hard: a cold module_constants cache makes the friction merge THROW
 *     (no silent fallback — the b72-warmup boot assertion turns this into a
 *     deploy-time failure in prod).
 *  3. Tombstone integrity: the static module objects carry NaN fee fields and
 *     are NEVER mutated by the merge (new-object construction).
 *  4. EV flow-through: round-trip friction at Tier-1 = (0.008×2) + (slip×2)
 *     + spread = 1.80% crypto / 1.82% xstock — the realism this batch ships.
 *     (PREVIOUSLY-STATED ~1.87% xstock in the scope was an estimate mis-add;
 *     the kernel formula on actual statics yields 1.82% — §9.2 delta.)
 *
 * Database-free: the suite seeds the sync cache in-memory with the same shape
 * server boot's prefetchModule('fee_model') produces. The DB-backed path is
 * exercised by CI db:migrate + the staging boot assertion (b72-warmup).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { _seedModuleCacheForTests, clearModuleConstantsCache } from '../../services/module-constants-service.js';
import type { ModuleConstant } from '../../../shared/schema.js';
import {
  getFrictionForAssetClass,
  getCachedCostMetrics,
  computeTotalRoundTripCost,
} from '../../core/math/cost-model.js';
import { CRYPTO_SPOT_FRICTION } from '../../asset_classes/crypto_spot/friction.js';
import { XSTOCK_SPOT_FRICTION } from '../../asset_classes/xstock_spot/friction.js';

const TIER1_TAKER = 0.008;
const TIER1_MAKER = 0.004;

const _b45FeeRow = (assetClass: string, constantName: string, value: number) => ({
  moduleName: 'fee_model', exchange: '*', assetClass, strategy: '*', regime: '*',
  constantName, value,
} as unknown as ModuleConstant);

// In-memory seed — same cache shape server boot's prefetchModule('fee_model')
// produces (the DB-backed path is exercised by CI db:migrate + the staging
// boot assertion); keeps this suite database-free.
function seedFeeModel(): void {
  _seedModuleCacheForTests('fee_model', [
    _b45FeeRow('crypto_spot', 'spot_taker_fee', 0.008),
    _b45FeeRow('crypto_spot', 'spot_maker_fee', 0.004),
    _b45FeeRow('xstock_spot', 'spot_taker_fee', 0.008),
    _b45FeeRow('xstock_spot', 'spot_maker_fee', 0.004),
  ]);
}

beforeAll(() => {
  seedFeeModel();
});

describe('B-4.5: DB-governed fee model', () => {
  it('resolves Tier-1 rates per asset class, statics for non-fee fields', () => {
    const crypto = getFrictionForAssetClass('crypto_spot');
    expect(crypto.feeRateTaker).toBe(TIER1_TAKER);
    expect(crypto.feeRateMaker).toBe(TIER1_MAKER);
    expect(crypto.spreadRateDefault).toBe(0.0010);
    expect(crypto.slippageRateDefault).toBe(0.0005);
    expect(crypto.maxCostBound).toBe(0.02);

    const xstock = getFrictionForAssetClass('xstock_spot');
    expect(xstock.feeRateTaker).toBe(TIER1_TAKER);
    expect(xstock.feeRateMaker).toBe(TIER1_MAKER);
    expect(xstock.spreadRateDefault).toBe(0.0012);
    expect(xstock.slippageRateDefault).toBe(0.0005);
    expect(xstock.maxCostBound).toBe(0.02);
  });

  it('FAIL-HARD: cold cache makes the friction merge throw (no silent fallback)', () => {
    clearModuleConstantsCache();
    expect(() => getFrictionForAssetClass('crypto_spot')).toThrow(/fee_model|not warm/);
    expect(() => getFrictionForAssetClass('xstock_spot')).toThrow(/fee_model|not warm/);
    // Restore for subsequent tests/suites in this worker.
    seedFeeModel();
    expect(() => getFrictionForAssetClass('crypto_spot')).not.toThrow();
  });

  it('TOMBSTONE: static modules carry NaN fees and are never mutated by the merge', () => {
    const merged = getFrictionForAssetClass('crypto_spot');
    // New object, not the static module object.
    expect(merged).not.toBe(CRYPTO_SPOT_FRICTION);
    // Statics remain NaN after merges ran — mutation would poison this.
    expect(Number.isNaN(CRYPTO_SPOT_FRICTION.feeRateTaker)).toBe(true);
    expect(Number.isNaN(CRYPTO_SPOT_FRICTION.feeRateMaker)).toBe(true);
    expect(Number.isNaN(XSTOCK_SPOT_FRICTION.feeRateTaker)).toBe(true);
    expect(Number.isNaN(XSTOCK_SPOT_FRICTION.feeRateMaker)).toBe(true);
    // The merged object carries real numbers.
    expect(Number.isFinite(merged.feeRateTaker)).toBe(true);
  });

  it('EV flow-through: Tier-1 round-trip friction = 1.80% crypto / 1.82% xstock', () => {
    const crypto = getFrictionForAssetClass('crypto_spot');
    const cryptoRT = computeTotalRoundTripCost(
      crypto.feeRateTaker, crypto.slippageRateDefault, crypto.spreadRateDefault);
    expect(cryptoRT).toBeCloseTo(0.018, 6); // (0.008*2)+(0.0005*2)+0.0010

    const xstock = getFrictionForAssetClass('xstock_spot');
    const xstockRT = computeTotalRoundTripCost(
      xstock.feeRateTaker, xstock.slippageRateDefault, xstock.spreadRateDefault);
    expect(xstockRT).toBeCloseTo(0.0182, 6); // (0.008*2)+(0.0005*2)+0.0012

    // xStock synthesizes from the friction merge (no symbol cache) — the fee
    // a consumer actually sees is the Tier-1 taker.
    const metrics = getCachedCostMetrics('AAPLX/USD', 'xstock_spot');
    expect(metrics.fee).toBe(TIER1_TAKER);
  });
});
