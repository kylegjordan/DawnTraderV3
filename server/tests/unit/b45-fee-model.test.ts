/**
 * B-4.5 — DB-governed fee model unit locks (scope objective 5).
 * B-XSTOCK-FEE-CONTRACT (#1010): the xStock rows carry Kraken's Pro xStocks schedule — taker 0.0010 /
 * maker −0.0002, a rebate — and crypto keeps spot rung 1 (0.008 / 0.004). Before that batch this suite
 * asserted 0.008 / 0.004 for BOTH classes, i.e. it locked the defect in. Values now come from the one
 * fixture, server/tests/helpers/fee-model-fixture.ts, and are asserted by name, never as bare literals.
 *
 * Locks:
 *  1. Per-class resolution: getFrictionForAssetClass merges each class's DB-governed rates over the
 *     static friction modules; non-fee fields stay static.
 *  2. Fail-hard: a cold module_constants cache makes the friction merge THROW (no silent fallback —
 *     the b72-warmup boot assertion turns this into a deploy-time failure in prod).
 *  3. Tombstone integrity: the static module objects carry NaN fee fields and are NEVER mutated by
 *     the merge (new-object construction).
 *  4. EV flow-through: round-trip taker friction = (taker×2) + (slip×2) + spread
 *     = 1.80 % crypto / 0.42 % xStock.
 *
 * Database-free: the suite seeds the sync cache in-memory with the same shape server boot's
 * prefetchModule('fee_model') produces. The DB-backed path is exercised by CI db:migrate + the staging
 * boot assertion (b72-warmup).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { clearModuleConstantsCache } from '../../services/module-constants-service.js';
import {
  getFrictionForAssetClass,
  getCachedCostMetrics,
  computeTotalRoundTripCost,
} from '../../core/math/cost-model.js';
import { CRYPTO_SPOT_FRICTION } from '../../asset_classes/crypto_spot/friction.js';
import { XSTOCK_SPOT_FRICTION } from '../../asset_classes/xstock_spot/friction.js';
import {
  CRYPTO_SPOT_MAKER_FEE,
  CRYPTO_SPOT_TAKER_FEE,
  XSTOCK_SPOT_MAKER_FEE,
  XSTOCK_SPOT_TAKER_FEE,
  seedFeeModelForTests,
} from '../helpers/fee-model-fixture.js';

beforeAll(() => {
  seedFeeModelForTests();
});

describe('B-4.5: DB-governed fee model', () => {
  it('resolves each class its own rates, statics for non-fee fields', () => {
    const crypto = getFrictionForAssetClass('crypto_spot');
    expect(crypto.feeRateTaker).toBe(CRYPTO_SPOT_TAKER_FEE);
    expect(crypto.feeRateMaker).toBe(CRYPTO_SPOT_MAKER_FEE);
    expect(crypto.spreadRateDefault).toBe(0.0010);
    expect(crypto.slippageRateDefault).toBe(0.0005);
    expect(crypto.maxCostBound).toBe(0.02);

    const xstock = getFrictionForAssetClass('xstock_spot');
    expect(xstock.feeRateTaker).toBe(XSTOCK_SPOT_TAKER_FEE);
    expect(xstock.feeRateMaker).toBe(XSTOCK_SPOT_MAKER_FEE);
    expect(xstock.spreadRateDefault).toBe(0.0012);
    expect(xstock.slippageRateDefault).toBe(0.0005);
    expect(xstock.maxCostBound).toBe(0.02);
  });

  it('the two classes do NOT share a schedule (the B-4.5 account-wide-tier premise, retired)', () => {
    const crypto = getFrictionForAssetClass('crypto_spot');
    const xstock = getFrictionForAssetClass('xstock_spot');
    expect(xstock.feeRateTaker).not.toBe(crypto.feeRateTaker);
    expect(xstock.feeRateMaker).toBeLessThan(0);
  });

  it('FAIL-HARD: cold cache makes the friction merge throw (no silent fallback)', () => {
    clearModuleConstantsCache();
    expect(() => getFrictionForAssetClass('crypto_spot')).toThrow(/fee_model|not warm/);
    expect(() => getFrictionForAssetClass('xstock_spot')).toThrow(/fee_model|not warm/);
    // Restore for subsequent tests/suites in this worker.
    seedFeeModelForTests();
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

  it('EV flow-through: round-trip taker friction = 1.80% crypto / 0.42% xStock', () => {
    const crypto = getFrictionForAssetClass('crypto_spot');
    const cryptoRT = computeTotalRoundTripCost(
      crypto.feeRateTaker, crypto.slippageRateDefault, crypto.spreadRateDefault);
    expect(cryptoRT).toBeCloseTo(0.018, 6); // (0.008*2)+(0.0005*2)+0.0010

    const xstock = getFrictionForAssetClass('xstock_spot');
    const xstockRT = computeTotalRoundTripCost(
      xstock.feeRateTaker, xstock.slippageRateDefault, xstock.spreadRateDefault);
    expect(xstockRT).toBeCloseTo(0.0042, 6); // (0.0010*2)+(0.0005*2)+0.0012

    // xStock synthesizes from the friction merge (no symbol cache) — the fee a consumer actually
    // sees is the xStock taker.
    const metrics = getCachedCostMetrics('AAPLX/USD', 'xstock_spot');
    expect(metrics.fee).toBe(XSTOCK_SPOT_TAKER_FEE);
  });
});
