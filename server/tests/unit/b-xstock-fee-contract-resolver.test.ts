/**
 * B-XSTOCK-FEE-CONTRACT (#1010, OBJ-4) — slippage-fee-model's `calculateFees` resolves fee rates THROUGH the merge
 * site, `cost-model.getFrictionForAssetClass`, and nowhere else. MUTATION-PROVEN: the merge site is stubbed with
 * sentinel rates and NO `fee_model` cache is seeded, so the pre-batch code — which read the cache directly via its
 * own `resolveFee` — throws on a cold cache and fails this suite; only a call through the merge site passes.
 */
import { describe, it, expect, vi } from 'vitest';

const merge = vi.hoisted(() => ({ calls: [] as string[] }));

vi.mock('../../core/math/cost-model.js', () => ({
  getFrictionForAssetClass: (assetClass: string) => {
    merge.calls.push(assetClass);
    return {
      feeRateTaker: 0.0123,
      feeRateMaker: -0.0045,
      spreadRateDefault: 0,
      slippageRateDefault: 0,
      maxCostBound: 0.02,
      perPairOverrides: {},
    };
  },
}));

import { slippageFeeModel } from '../../services/slippage-fee-model.js';

describe('B-XSTOCK-FEE-CONTRACT — calculateFees resolves through the merge site (mutation-proven)', () => {
  it('charges exactly the sentinel rates the merge site returns, with no fee_model cache seeded', () => {
    const taker = slippageFeeModel.calculateFees(1000, false, 'xstock_spot');
    expect(taker.totalFees).toBeCloseTo(12.3, 9);
    expect(taker.takerFee).toBeCloseTo(12.3, 9);

    const maker = slippageFeeModel.calculateFees(1000, true, 'xstock_spot');
    expect(maker.totalFees).toBeCloseTo(-4.5, 9);
    expect(maker.netAmount).toBeCloseTo(1004.5, 9);

    expect(merge.calls).toEqual(['xstock_spot', 'xstock_spot']);
  });
});
