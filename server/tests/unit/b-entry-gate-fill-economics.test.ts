/**
 * B-ENTRY-GATE (`#1224`) increment A, P4 — the economic test at the price actually paid (Reply A, KD-11).
 * Driven through the real `decideMakerTaker` kernel; the expected values are re-derived by hand from the kernel's formula
 * (pWin = clamp(minPWin + DI/diPWinFactor); rawEV = pWin·distTarget − pLoss·distStop; netEV = rawEV − friction).
 */
import { describe, it, expect } from 'vitest';
import { computeFillEconomics, type FillEconomicsInput } from '../../core/trading/fill-economics';

const haircut = {
  makerFillProbability: 0.5, adverseSelectionBase: 0.001, adverseSelectionStrengthMult: 0, nonFillCostBase: 0.002,
  nonFillContinuationPenalty: 0, nonFillReversalDiscount: 0, hardFloorContinuationStrength: 2,
};
// planned entry 100, stop 96, target 108 ⇒ 2:1. Costs: fee 0.004, slippage 0.0005, spread 0.001 (mid model:
// 2·fee + 2·slip + spread = 0.01 of entry).
const base: FillEconomicsInput = {
  arm: 'taker', fillPrice: 100, stopPrice: 96, targetPrice: 108,
  costs: { fee: 0.004, slippage: 0.0005, spread: 0.001 } as any, feeRateMaker: 0.002, feeRateTaker: 0.004,
  DI: 20, sourcePool: undefined, dbsScore: undefined, minPWin: 0.40, maxPWin: 0.60, diPWinFactor: 200,
  signalStrength: 0.3, urgencyClass: 'neutral', haircut, measuredBasePWin: 0.317,
};

describe('P4 — the deciding number is net EV at the PRICE PAID for the ARM THAT FILLS', () => {
  it('taker at plan: pWin 0.50 (DI 20) ⇒ 0.5·8 − 0.5·4 = 2.0, minus friction', () => {
    const r = computeFillEconomics(base);
    expect(r.pWin).toBeCloseTo(0.50, 12);
    expect(r.netEvAtFill).toBeGreaterThan(0);
    expect(r.refuse).toBe(false);
  });
  it('the SAME plan bought higher has less EV — the price paid enters the number', () => {
    const atPlan = computeFillEconomics(base).netEvAtFill;
    const worse = computeFillEconomics({ ...base, fillPrice: 101 }).netEvAtFill;
    expect(worse).toBeLessThan(atPlan);
  });
  it('net EV ≤ 0 at the price paid refuses (Reply A)', () => {
    // pWin at the floor (DI 0 ⇒ 0.40): 0.4·(108−103) − 0.6·(103−96) = 2 − 4.2 < 0
    const r = computeFillEconomics({ ...base, DI: 0, fillPrice: 103 });
    expect(r.netEvAtFill).toBeLessThanOrEqual(0);
    expect(r.refuse).toBe(true);
  });
  it('a maker at its limit carries the adverse-selection cost but NOT the fill-probability weight', () => {
    const maker = computeFillEconomics({ ...base, arm: 'maker' });
    const taker = computeFillEconomics(base);
    // maker pays the maker fee on entry (cheaper) but bears adverse selection 0.001·100 = 0.1; no pFill halving.
    expect(maker.netEvAtFill).toBeGreaterThan(taker.netEvAtFill * 0.5 + 0.5); // would be ~half if pFill-weighted
  });
});

describe('A-12 — the missing-win-probability leg is RECORDED, never decides (Kyle KD-11 owed)', () => {
  it('no DI ⇒ the kernel default (0.60 cap) and pWinDefaulted; the decision still uses the defaulted EV', () => {
    const r = computeFillEconomics({ ...base, DI: undefined });
    expect(r.pWin).toBeCloseTo(0.60, 12);                 // 0.40 + 50/200 = 0.65, clamped
    expect(r.pWinDefaulted).toBe(true);
    expect(r.missingPWinWouldRefuse).toBe(true);
    expect(r.refuse).toBe(!(r.netEvAtFill > 0));          // decided on the defaulted number, not the shadow
  });
  it('the measured-base EV sits beside it: 0.317·8 − 0.683·4 − friction < 0 on a 2:1 plan', () => {
    const r = computeFillEconomics({ ...base, DI: undefined });
    expect(r.netEvAtMeasuredBase).toBeLessThan(0);
    expect(r.netEvAtFill).toBeGreaterThan(r.netEvAtMeasuredBase);
  });
  it('the strong-trend pool takes pWin from DBS, so a missing DI there is NOT a default', () => {
    const r = computeFillEconomics({ ...base, DI: undefined, sourcePool: 'quant-strong_trend', dbsScore: 0.6 });
    expect(r.pWinDefaulted).toBe(false);
  });
  it('a present DI is never flagged, and its real-DI EV is the deciding number', () => {
    const r = computeFillEconomics(base);
    expect(r.pWinDefaulted).toBe(false);
    expect(r.netEvAtRealDi).toBe(r.netEvAtFill);
  });
  it('the real-DI candidate is null (not zero) when no DI was carried — never a guess', () => {
    expect(computeFillEconomics({ ...base, DI: undefined }).netEvAtRealDi).toBeNull();
  });
  it('crypto is in scope too: a crypto signal with no carried DI is flagged exactly like xStock (both classes)', () => {
    expect(computeFillEconomics({ ...base, DI: undefined, sourcePool: 'quant-trend' }).pWinDefaulted).toBe(true);
  });
  it('a non-finite price throws rather than guessing', () => {
    expect(() => computeFillEconomics({ ...base, fillPrice: Number.NaN })).toThrow();
  });
});
