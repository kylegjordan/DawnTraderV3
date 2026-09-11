/**
 * B-XSTOCK-FEE-CONTRACT (#1010) — the signed boot rail for `fee_model` (Langston Step-1 ruling 1).
 *
 * Taker must be a cost in (0, FEE_RAIL_MAX]. Maker may be a venue REBATE, down to
 * MAKER_REBATE_FLOOR. Per class, maker must not exceed taker. Each refusal case sits beside an
 * acceptance case at the same boundary, so a rail that refused everything fails this suite.
 */
import { describe, it, expect } from 'vitest';
import {
  FEE_RAIL_MAX,
  MAKER_REBATE_FLOOR,
  feeRailViolation,
  makerAboveTakerViolation,
} from '../../startup/fee-model-rail.js';
import {
  CRYPTO_SPOT_MAKER_FEE,
  CRYPTO_SPOT_TAKER_FEE,
  XSTOCK_SPOT_MAKER_FEE,
  XSTOCK_SPOT_TAKER_FEE,
} from '../helpers/fee-model-fixture.js';

describe('B-XSTOCK-FEE-CONTRACT — the fee rail accepts the venue schedule', () => {
  it('accepts both classes at their production rates, including the xStock maker rebate', () => {
    expect(feeRailViolation('crypto_spot', 'spot_taker_fee', CRYPTO_SPOT_TAKER_FEE)).toBeNull();
    expect(feeRailViolation('crypto_spot', 'spot_maker_fee', CRYPTO_SPOT_MAKER_FEE)).toBeNull();
    expect(feeRailViolation('xstock_spot', 'spot_taker_fee', XSTOCK_SPOT_TAKER_FEE)).toBeNull();
    expect(feeRailViolation('xstock_spot', 'spot_maker_fee', XSTOCK_SPOT_MAKER_FEE)).toBeNull();
    expect(makerAboveTakerViolation('crypto_spot', CRYPTO_SPOT_MAKER_FEE, CRYPTO_SPOT_TAKER_FEE)).toBeNull();
    expect(makerAboveTakerViolation('xstock_spot', XSTOCK_SPOT_MAKER_FEE, XSTOCK_SPOT_TAKER_FEE)).toBeNull();
  });

  it('CONTROL: the retired positive-only rail would have refused the correct xStock maker rate', () => {
    const oldRailAccepts = (v: number) => v > 0 && v <= 0.05;
    expect(oldRailAccepts(XSTOCK_SPOT_MAKER_FEE)).toBe(false);
    expect(feeRailViolation('xstock_spot', 'spot_maker_fee', XSTOCK_SPOT_MAKER_FEE)).toBeNull();
  });

  it('pins the two bounds (sanity rails, not decision constants)', () => {
    expect(FEE_RAIL_MAX).toBe(0.05);
    expect(MAKER_REBATE_FLOOR).toBe(-0.001);
  });
});

describe('B-XSTOCK-FEE-CONTRACT — the fee rail refuses nonsense, at each boundary', () => {
  it('maker: accepts exactly the floor and the cap, refuses just beyond either', () => {
    expect(feeRailViolation('xstock_spot', 'spot_maker_fee', MAKER_REBATE_FLOOR)).toBeNull();
    expect(feeRailViolation('xstock_spot', 'spot_maker_fee', -0.0011)).toMatch(/maker range/);
    expect(feeRailViolation('xstock_spot', 'spot_maker_fee', -0.02)).toMatch(/refusing to start/); // −0.02 typed for −0.0002
    expect(feeRailViolation('xstock_spot', 'spot_maker_fee', FEE_RAIL_MAX)).toBeNull();
    expect(feeRailViolation('xstock_spot', 'spot_maker_fee', 0.0501)).toMatch(/maker range/);
  });

  it('taker: a rebate is NOT a taker fee — zero and negatives refuse; the cap is inclusive', () => {
    expect(feeRailViolation('xstock_spot', 'spot_taker_fee', 0)).toMatch(/taker range/);
    expect(feeRailViolation('xstock_spot', 'spot_taker_fee', -0.0002)).toMatch(/taker range/);
    expect(feeRailViolation('crypto_spot', 'spot_taker_fee', FEE_RAIL_MAX)).toBeNull();
    expect(feeRailViolation('crypto_spot', 'spot_taker_fee', 0.0501)).toMatch(/taker range/);
  });

  it('non-finite values refuse on both constants', () => {
    for (const constant of ['spot_taker_fee', 'spot_maker_fee'] as const) {
      expect(feeRailViolation('crypto_spot', constant, Number.NaN)).toMatch(/not a finite number/);
      expect(feeRailViolation('crypto_spot', constant, Number.POSITIVE_INFINITY)).toMatch(/not a finite number/);
      expect(feeRailViolation('crypto_spot', constant, Number.NEGATIVE_INFINITY)).toMatch(/not a finite number/);
    }
  });

  it('maker above taker refuses; maker equal to taker is allowed', () => {
    expect(makerAboveTakerViolation('crypto_spot', 0.009, 0.008)).toMatch(/maker 0\.009 > taker 0\.008/);
    expect(makerAboveTakerViolation('crypto_spot', 0.008, 0.008)).toBeNull();
  });
});
