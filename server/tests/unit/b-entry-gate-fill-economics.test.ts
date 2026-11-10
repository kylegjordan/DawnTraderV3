/**
 * B-ENTRY-GATE (`#1224`) increment A, P4 — the economic test at the price actually paid (Reply A, KD-11).
 * Driven through the real `decideMakerTaker` kernel; the expected values are re-derived by hand from the kernel's formula
 * (pWin = clamp(minPWin + DI/diPWinFactor); rawEV = pWin·distTarget − pLoss·distStop; netEV = rawEV − friction).
 */
import { describe, it, expect } from 'vitest';
import { computeFillEconomics, composeAskEntryMidExitFriction, type FillEconomicsInput } from '../../core/trading/fill-economics';

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
  signalStrength: 0.3, urgencyClass: 'neutral', haircut, measuredBasePWin: 0.317, levelGeometry: 'mid',
  frictionCoverageK: 1,
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

describe('Step-4 C-1 — the taker friction composition is pinned: ask entry (already in the fill) against mid exits', () => {
  it('composeAskEntryMidExitFriction = 2·fee + 1·slippage + ½·spread', () => {
    expect(composeAskEntryMidExitFriction(0.004, 0.0005, 0.001)).toBeCloseTo(0.009, 12);
  });
  it('taker at 100, DI 20: rawEV = 0.5·8 − 0.5·4 = 2.0; friction = 0.009·100 = 0.9 ⇒ netEvAtFill = 1.1 exactly', () => {
    expect(computeFillEconomics(base).netEvAtFill).toBeCloseTo(1.1, 10);
  });
  it('the mid-to-mid composition (2·fee + 2·slip + spread = 0.01) would have charged 1.0 — not what is used', () => {
    expect(computeFillEconomics(base).netEvAtFill).not.toBeCloseTo(1.0, 6);
  });
  it('C-6: the record states whether the spread was measured or a placeholder', () => {
    expect(computeFillEconomics({ ...base, costs: { ...base.costs, spreadSource: 'static_fallback' } as any }).spreadSource).toBe('static_fallback');
    expect(computeFillEconomics(base).spreadSource).toBeNull();
  });
});

describe('Step-4 r3 — the A-12 shadow is fenced to the kernel, and the strong-trend default is a default', () => {
  it('with measuredBasePWin equal to the leg pWin, netEvAtMeasuredBase equals netEvAtFill (taker and maker)', () => {
    for (const arm of ['taker', 'maker'] as const) {
      const r = computeFillEconomics({ ...base, arm });
      const r2 = computeFillEconomics({ ...base, arm, measuredBasePWin: r.pWin });
      expect(r2.netEvAtMeasuredBase).toBeCloseTo(r2.netEvAtFill, 10);
    }
  });
  it('a strong-trend signal with no DBS is defaulted (pWin pinned at the floor); with a DBS it is not', () => {
    const noDbs = computeFillEconomics({ ...base, DI: undefined, sourcePool: 'quant-strong_trend', dbsScore: undefined });
    expect(noDbs.pWinDefaulted).toBe(true);
    expect(noDbs.pWin).toBeCloseTo(base.minPWin, 12);
    expect(computeFillEconomics({ ...base, DI: undefined, sourcePool: 'quant-strong_trend', dbsScore: 0.3 }).pWinDefaulted).toBe(false);
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

describe('OBJ-4 — friction coverage is a probability-free WATCH-ONLY result', () => {
  it('records net reward, complete round-trip friction, ratio, k, and the shadow result', () => {
    const r = computeFillEconomics(base);
    // Base taker: target distance 8; ask-entry/mid-exit friction = 0.009 * 100 = 0.9.
    expect(r.roundTripFrictionAtFill).toBeCloseTo(0.9, 12);
    expect(r.netRewardAtFill).toBeCloseTo(7.1, 12);
    expect(r.frictionCoverageRatio).toBeCloseTo(7.1 / 0.9, 12);
    expect(r.frictionCoverageK).toBe(1);
    expect(r.frictionCoverageWouldRefuse).toBe(false);
  });
  it('the exact >= edge passes and one price tick below it would refuse (comparison mutation control)', () => {
    // Friction is exactly 1. At target distance 2, net reward is 1 = 1 * friction.
    const exactCost = { fee: 0.005, slippage: 0, spread: 0 } as any;
    const edge = computeFillEconomics({ ...base, costs: exactCost, DI: 40, stopPrice: 99.99, targetPrice: 102 });
    const below = computeFillEconomics({ ...base, costs: exactCost, DI: 40, stopPrice: 99.99, targetPrice: 101.99 });
    expect(edge.netEvAtFill).toBeGreaterThan(0);
    expect(edge.frictionCoverageWouldRefuse).toBe(false);
    expect(below.netEvAtFill).toBeGreaterThan(0);
    expect(below.frictionCoverageWouldRefuse).toBe(true);
  });
  it('the shadow never changes the deciding P4 refusal', () => {
    const r = computeFillEconomics({ ...base, costs: { fee: 0.005, slippage: 0, spread: 0 } as any, DI: 40, stopPrice: 99.99, targetPrice: 101.99 });
    expect(r.frictionCoverageWouldRefuse).toBe(true);
    expect(r.refuse).toBe(false);
  });
  it('rejects an invalid k instead of silently substituting a threshold', () => {
    expect(() => computeFillEconomics({ ...base, frictionCoverageK: -1 })).toThrow(/frictionCoverageK must be non-negative/);
  });
  it('maker coverage stays probability-free when the pWin-linked adverse-selection strength changes', () => {
    const variableHaircut = { ...haircut, adverseSelectionStrengthMult: 0.01 };
    const low = computeFillEconomics({ ...base, arm: 'maker', haircut: variableHaircut, signalStrength: 0.1 });
    const high = computeFillEconomics({ ...base, arm: 'maker', haircut: variableHaircut, signalStrength: 0.9 });
    expect(high.netEvAtFill).not.toBeCloseTo(low.netEvAtFill, 12); // P4 still prices adverse selection.
    expect(high.roundTripFrictionAtFill).toBeCloseTo(low.roundTripFrictionAtFill, 12);
    expect(high.netRewardAtFill).toBeCloseTo(low.netRewardAtFill, 12);
    expect(high.frictionCoverageRatio).toBeCloseTo(low.frictionCoverageRatio!, 12);
    expect(high.frictionCoverageWouldRefuse).toBe(low.frictionCoverageWouldRefuse);
  });
});
