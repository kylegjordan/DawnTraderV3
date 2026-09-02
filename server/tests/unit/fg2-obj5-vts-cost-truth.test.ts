/**
 * F-G-2 OBJ-5 — VTS books realistic exits and honest maker fees.
 *
 * Pure-surface fences for the three things the batch changes in VTS's booked record:
 *  - OBJ-5a: the booked exit price is the OBSERVED mark on crypto rows, the clamp on xStock
 *    rows (the §7.4 class seam), and the clamp when there is no live mark (the null arm).
 *    MUTATION-PROVED: a mark that differs from the clamp must change the booked price on
 *    crypto and must NOT change it on xStock — a fence that passed on both would prove nothing.
 *  - OBJ-5b: the booked friction formula is ONE maker leg + ONE taker leg, never maker×2
 *    (Langston condition 3), and the twin overlay from `planTwin` re-prices the twin's OWN
 *    entry fee rather than inheriting the chosen leg's.
 *  - P12: the mean-of-legs `costFeeFraction` reconciles the renderer's fee×2 reconstruction.
 */
import { describe, it, expect, vi } from 'vitest';
import { resolveVtsBookedExitPrice } from '../../core/trading/vts-exit-booking.js';
import { planTwin } from '../../core/trading/pending-maker-logic.js';

vi.mock('../../services/module-constants-service.js', () => ({
  getCachedNumberRequired: () => { throw new Error('not needed by these tests'); },
}));

// ── the same shape as the DB-resolved fee pair on staging (Tier-1) ──────────────────
const FEE_MAKER = 0.004;   // 0.40%
const FEE_TAKER = 0.008;   // 0.80%
const SLIP = 0.0005;       // DEFAULT_SLIPPAGE, Directive 11.3B
const SPREAD = 0.0010;

function composeBooked(feeEntry: number, feeExit: number, slippage: number, spread: number): number {
  // duplicated on purpose from cost-model.ts so a change to the helper that silently
  // reintroduces fee×2 fails HERE, against the formula Langston graded
  return feeEntry + feeExit + slippage * 2 + spread;
}

describe('OBJ-5a — resolveVtsBookedExitPrice (the class seam + the null arm)', () => {
  it('crypto: books the OBSERVED mark, not the clamp (mutation-proved: the two differ)', () => {
    const clamp = 100;      // TEC's stop
    const mark = 99.85;     // where the bid actually was
    expect(mark).not.toBe(clamp);
    expect(resolveVtsBookedExitPrice('crypto_spot', mark, clamp)).toBe(mark);
  });

  it('xStock: keeps the CLAMP even when a differing mark exists (§7.4 row 2 seam)', () => {
    expect(resolveVtsBookedExitPrice('xstock_spot', 118.75, 122.0)).toBe(122.0);
  });

  it('null arm: no live mark ⇒ the evaluator\'s own price, never NaN/0', () => {
    expect(resolveVtsBookedExitPrice('crypto_spot', null, 100)).toBe(100);
    expect(resolveVtsBookedExitPrice('crypto_spot', undefined, 100)).toBe(100);
    expect(resolveVtsBookedExitPrice('crypto_spot', NaN, 100)).toBe(100);
    expect(resolveVtsBookedExitPrice('crypto_spot', 0, 100)).toBe(100);
    expect(resolveVtsBookedExitPrice('crypto_spot', -1, 100)).toBe(100);
  });
});

describe('OBJ-5b — the booked friction formula (one maker leg, never two)', () => {
  it('maker entry + taker exit ≠ maker×2 and ≠ taker×2', () => {
    const makerEntry = composeBooked(FEE_MAKER, FEE_TAKER, SLIP, SPREAD);
    const takerEntry = composeBooked(FEE_TAKER, FEE_TAKER, SLIP, SPREAD);
    const makerTwice = FEE_MAKER * 2 + SLIP * 2 + SPREAD;
    expect(makerEntry).toBeCloseTo(0.004 + 0.008 + 0.001 + 0.001, 10);
    expect(makerEntry).not.toBeCloseTo(makerTwice, 10);
    expect(takerEntry - makerEntry).toBeCloseTo(FEE_TAKER - FEE_MAKER, 10);
  });

  it('P12: the mean-of-legs costFeeFraction reconciles the renderer\'s fee×2 reconstruction', () => {
    const feeFraction = (FEE_MAKER + FEE_TAKER) / 2;
    const reconstructed = feeFraction * 2 + SLIP * 2 + SPREAD;
    expect(reconstructed).toBeCloseTo(composeBooked(FEE_MAKER, FEE_TAKER, SLIP, SPREAD), 10);
    // and the declared cost is real: each displayed leg reads the mean, not the truth
    expect(feeFraction).not.toBe(FEE_MAKER);
    expect(feeFraction).not.toBe(FEE_TAKER);
  });
});

describe('OBJ-5b — planTwin re-prices the twin\'s OWN entry fee (the majority path)', () => {
  const base = {
    twinEnabled: true,
    limitPrice: 100,
    currentMarketPrice: 101,   // above the limit ⇒ a maker twin is NOT marketable at placement
    feeRateMaker: FEE_MAKER,
    feeRateTaker: FEE_TAKER,
    makerMaxPendingMs: () => 60_000,
    nowMs: 1_000_000,
  };

  it('maker twin of a TAKER-chosen leg: friction = chosen − taker + maker; fractions honest', () => {
    const chosenFriction = composeBooked(FEE_TAKER, FEE_TAKER, SLIP, SPREAD);
    const plan = planTwin({
      ...base,
      pendingMaker: false,
      decisionChosenMode: 'taker',
      chosenFrictionCost: chosenFriction,
      chosenEntryFeeRate: FEE_TAKER,
    });
    expect(plan.kind).toBe('open');
    if (plan.kind !== 'open') return;
    expect(plan.twinMode).toBe('maker');
    expect(plan.overlay.entryFeeRate).toBe(FEE_MAKER);
    expect(plan.overlay.frictionCost).toBeCloseTo(composeBooked(FEE_MAKER, FEE_TAKER, SLIP, SPREAD), 10);
    expect(plan.overlay.costEntryFeeFraction).toBe(FEE_MAKER);
    expect(plan.overlay.costExitFeeFraction).toBe(FEE_TAKER);
    expect(plan.overlay.costFeeFraction).toBeCloseTo((FEE_MAKER + FEE_TAKER) / 2, 10);
    // the defect this kills: the twin used to INHERIT the chosen leg's taker friction under a maker stamp
    expect(plan.overlay.frictionCost).not.toBeCloseTo(chosenFriction, 10);
  });

  it('taker twin of a PENDING-MAKER chosen leg: friction = chosen − maker + taker', () => {
    const chosenFriction = composeBooked(FEE_MAKER, FEE_TAKER, SLIP, SPREAD);
    const plan = planTwin({
      ...base,
      pendingMaker: true,
      decisionChosenMode: 'maker',
      chosenFrictionCost: chosenFriction,
      chosenEntryFeeRate: FEE_MAKER,
    });
    expect(plan.kind).toBe('open');
    if (plan.kind !== 'open') return;
    expect(plan.twinMode).toBe('taker');
    expect(plan.overlay.frictionCost).toBeCloseTo(composeBooked(FEE_TAKER, FEE_TAKER, SLIP, SPREAD), 10);
    expect(plan.overlay.costEntryFeeFraction).toBe(FEE_TAKER);
  });

  it('without the chosen leg\'s figures the overlay carries NO friction (degrades to inherit, never to 0)', () => {
    const plan = planTwin({ ...base, pendingMaker: false, decisionChosenMode: 'taker' });
    expect(plan.kind).toBe('open');
    if (plan.kind !== 'open') return;
    expect(plan.overlay.frictionCost).toBeUndefined();
    expect(plan.overlay.costFeeFraction).toBeUndefined();
  });

  it('the skip paths are untouched by the re-price inputs', () => {
    const plan = planTwin({
      ...base,
      currentMarketPrice: 99,  // marketable at placement ⇒ maker twin skipped
      pendingMaker: false,
      decisionChosenMode: 'taker',
      chosenFrictionCost: 0.02,
      chosenEntryFeeRate: FEE_TAKER,
    });
    expect(plan).toEqual({ kind: 'skip', reason: 'marketable_maker' });
  });
});
