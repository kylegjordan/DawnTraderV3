/**
 * B-XSTOCK-FEE-CONTRACT (#1010) — a negative (rebate) maker fee flows through every consumer as a
 * signed number, and the fee-model file reads rates only through the single merge site.
 *
 * Audit §A4 found no production code that clamps, refuses or branches on a negative fee between
 * rate resolution and net P&L; these locks keep it that way.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  CRYPTO_SPOT_MAKER_FEE,
  CRYPTO_SPOT_TAKER_FEE,
  XSTOCK_SPOT_MAKER_FEE,
  XSTOCK_SPOT_TAKER_FEE,
  seedFeeModelForTests,
} from '../helpers/fee-model-fixture.js';
import { getFrictionForAssetClass, composeBookedFriction } from '../../core/math/cost-model.js';
import { slippageFeeModel } from '../../services/slippage-fee-model.js';
import { computeRealizedPnl } from '../../core/math/trade-pnl.js';
import { resolveValidatorFeeRates } from '../../services/pre-execution-validator.js';
import {
  decideMakerTaker,
  type MakerTakerDecisionInput,
  type MakerTakerHaircutConfig,
} from '../../core/math/maker-taker-decision.js';

beforeEach(() => {
  seedFeeModelForTests();
});

describe('B-XSTOCK-FEE-CONTRACT — per-class rates at the merge site', () => {
  it('xStock resolves to its own schedule; crypto is untouched', () => {
    const x = getFrictionForAssetClass('xstock_spot');
    expect(x.feeRateTaker).toBe(XSTOCK_SPOT_TAKER_FEE);
    expect(x.feeRateMaker).toBe(XSTOCK_SPOT_MAKER_FEE);
    const c = getFrictionForAssetClass('crypto_spot');
    expect(c.feeRateTaker).toBe(CRYPTO_SPOT_TAKER_FEE);
    expect(c.feeRateMaker).toBe(CRYPTO_SPOT_MAKER_FEE);
  });
});

describe('B-XSTOCK-FEE-CONTRACT — slippage-fee-model reads fees ONLY through the merge site (OBJ-4)', () => {
  it('a diverged row in the merge-site cache is exactly what calculateFees charges', () => {
    seedFeeModelForTests({ 'xstock_spot.spot_taker_fee': 0.0123 });
    const f = slippageFeeModel.calculateFees(1000, false, 'xstock_spot');
    expect(f.totalFees).toBeCloseTo(12.3, 9);
    expect(f.takerFee).toBeCloseTo(12.3, 9);
    expect(f.makerFee).toBe(0);
  });

  it('a maker rebate yields negative fees and a net amount above the gross', () => {
    const f = slippageFeeModel.calculateFees(1000, true, 'xstock_spot');
    expect(f.totalFees).toBeCloseTo(-0.2, 9);
    expect(f.makerFee).toBeCloseTo(-0.2, 9);
    expect(f.netAmount).toBeCloseTo(1000.2, 9);
  });
});

describe('B-XSTOCK-FEE-CONTRACT — booking treats a rebate as a signed cost', () => {
  it('a maker-entry rebate raises net P&L above the zero-fee case', () => {
    const entry = 100;
    const exit = 101;
    const qty = 10;
    const exitFee = exit * qty * XSTOCK_SPOT_TAKER_FEE; // 1.01
    const withRebate = computeRealizedPnl({ actualEntryPrice: entry, actualExitPrice: exit, quantity: qty, entryFee: entry * qty * XSTOCK_SPOT_MAKER_FEE, exitFee });
    const zeroEntryFee = computeRealizedPnl({ actualEntryPrice: entry, actualExitPrice: exit, quantity: qty, entryFee: 0, exitFee });
    expect(withRebate.grossPnl).toBeCloseTo(10, 9);
    expect(withRebate.totalCost).toBeCloseTo(0.81, 9);
    expect(withRebate.netPnl).toBeCloseTo(9.19, 9);
    expect(withRebate.netPnl - zeroEntryFee.netPnl).toBeCloseTo(0.2, 9);
  });

  it('both legs maker: totalCost is NEGATIVE and net exceeds gross', () => {
    const p = computeRealizedPnl({
      actualEntryPrice: 100, actualExitPrice: 101, quantity: 10,
      entryFee: 100 * 10 * XSTOCK_SPOT_MAKER_FEE, exitFee: 101 * 10 * XSTOCK_SPOT_MAKER_FEE,
    });
    expect(p.totalCost).toBeCloseTo(-0.402, 9);
    expect(p.netPnl).toBeGreaterThan(p.grossPnl);
  });

  it('the validator fee resolution passes a negative maker rate through unchanged when no override is set', () => {
    const friction = getFrictionForAssetClass('xstock_spot');
    expect(resolveValidatorFeeRates({ makerFeePct: null, takerFeePct: null }, friction))
      .toEqual({ makerFeePct: XSTOCK_SPOT_MAKER_FEE, takerFeePct: XSTOCK_SPOT_TAKER_FEE });
  });

  it('booked friction with a maker entry sums signed components', () => {
    // −0.0002 entry + 0.0010 exit + 2×0.0005 slippage + 0.0012 spread = 0.0030
    expect(composeBookedFriction(XSTOCK_SPOT_MAKER_FEE, XSTOCK_SPOT_TAKER_FEE, 0.0005, 0.0012)).toBeCloseTo(0.003, 12);
  });
});

describe('B-XSTOCK-FEE-CONTRACT — the maker/taker decision under the corrected xStock schedule (pre-audit A8)', () => {
  // The xStock haircut seeds as they stand in module_constants (maker_taker, p19-b7-2).
  const XSTOCK_HAIRCUT: MakerTakerHaircutConfig = {
    makerFillProbability: 0.50,
    adverseSelectionBase: 0.0010,
    adverseSelectionStrengthMult: 0.0025,
    nonFillCostBase: 0.0008,
    nonFillContinuationPenalty: 0.0025,
    nonFillReversalDiscount: 0.0006,
    hardFloorContinuationStrength: 0.70,
  };
  const input = (feeTaker: number, feeMaker: number): MakerTakerDecisionInput => ({
    entryPrice: 200,
    levelGeometry: 'mid',
    entryPriceMaker: 200,
    stopPrice: 196,
    targetPrice: 210,
    costs: { fee: feeTaker, slippage: 0.0005, spread: 0.0012 },
    feeRateMaker: feeMaker,
    feeRateTaker: feeTaker,
    minPWin: 0.5,
    maxPWin: 0.5,
    diPWinFactor: 200,
    signalStrength: 0.317,
    urgencyClass: 'neutral',
    haircut: XSTOCK_HAIRCUT,
  });

  it('the maker advantage is (taker − maker) + spread + slippage, and grows under a rebate', () => {
    const d = decideMakerTaker(input(XSTOCK_SPOT_TAKER_FEE, XSTOCK_SPOT_MAKER_FEE));
    expect(d.makerEntryAdvantagePct).toBeCloseTo((0.0010 - -0.0002) + 0.0012 + 0.0005, 12);
  });

  it('taker net EV rises by 0.014 × entry and maker-adjusted by pFill × 0.0112 × entry — the margin moves toward taker', () => {
    const before = decideMakerTaker(input(0.008, 0.004));
    const after = decideMakerTaker(input(XSTOCK_SPOT_TAKER_FEE, XSTOCK_SPOT_MAKER_FEE));
    expect(after.takerNetEV - before.takerNetEV).toBeCloseTo(0.014 * 200, 9);
    expect(after.makerNetEVAdjusted - before.makerNetEVAdjusted).toBeCloseTo(0.5 * 0.0112 * 200, 9);
    const marginShift = (after.makerNetEVAdjusted - after.takerNetEV) - (before.makerNetEVAdjusted - before.takerNetEV);
    expect(marginShift).toBeCloseTo(-0.0084 * 200, 9);
  });
});
