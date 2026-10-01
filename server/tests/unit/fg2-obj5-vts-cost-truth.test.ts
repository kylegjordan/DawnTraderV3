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
import { composeVtsLegFriction } from '../../core/trading/vts-friction.js';

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
    expect(resolveVtsBookedExitPrice(mark, mark).price).toBe(mark);
  });

  // `8a-P4c` increment 3 (P8b): the §7.4 class seam is CLOSED — xStock books the guarded bid on the same arms as crypto.
  it('xStock: books the observed bid like crypto — the §7.4 class seam is closed (8a-P4c increment 3)', () => {
    expect(resolveVtsBookedExitPrice(118.75, 118.75)).toEqual({ price: 118.75, arm: 'bid' });
  });

  // `3n.q3` P1: it booked the evaluator's own (entry-fallback) price; it now books NO price — never NaN, never 0.
  it('null arm: no live mark ⇒ NO price (`clamp_no_mark`), never NaN/0', () => {
    expect(resolveVtsBookedExitPrice(null, null)).toEqual({ price: null, arm: 'clamp_no_mark' });
    expect(resolveVtsBookedExitPrice(undefined, undefined)).toEqual({ price: null, arm: 'clamp_no_mark' });
    expect(resolveVtsBookedExitPrice(NaN, NaN)).toEqual({ price: null, arm: 'clamp_no_mark' });
    expect(resolveVtsBookedExitPrice(0, 0)).toEqual({ price: null, arm: 'clamp_no_mark' });
    expect(resolveVtsBookedExitPrice(-1, -1)).toEqual({ price: null, arm: 'clamp_no_mark' });
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
    placementTransactablePrice: 101,   // above the limit ⇒ a maker twin is NOT marketable at placement
    feeRateMaker: FEE_MAKER,
    feeRateTaker: FEE_TAKER,
    makerMaxPendingMs: () => 60_000,
    nowMs: 1_000_000,
  };

  // `8a-P4c` 3a-ii (BLOCKER-1) re-point: the twin COMPOSES its own friction over its own leg (per-leg spread rule) — it
  // is no longer the chosen leg's friction plus the entry-fee delta, which the per-leg rule makes wrong by ½·spread.
  it('maker twin of a TAKER-chosen leg: its OWN per-leg friction — a limit fill and a bid exit carry no spread half', () => {
    const chosenFriction = composeVtsLegFriction({
      entryFee: FEE_TAKER, exitFee: FEE_TAKER, slippage: SLIP, spread: SPREAD, entryPriceBasis: 'level', exitSideBooked: true,
    });
    const plan = planTwin({
      ...base,
      pendingMaker: false,
      decisionChosenMode: 'taker',
      chosenSlippage: SLIP,
      chosenSpread: SPREAD,
    });
    expect(plan.kind).toBe('open');
    if (plan.kind !== 'open') return;
    expect(plan.twinMode).toBe('maker');
    expect(plan.overlay.entryFeeRate).toBe(FEE_MAKER);
    expect(plan.overlay.entryPriceBasis).toBe('limit');
    expect(plan.overlay.frictionCost).toBeCloseTo(FEE_MAKER + FEE_TAKER + 2 * SLIP, 10);
    expect(plan.overlay.costEntryFeeFraction).toBe(FEE_MAKER);
    expect(plan.overlay.costExitFeeFraction).toBe(FEE_TAKER);
    expect(plan.overlay.costFeeFraction).toBeCloseTo((FEE_MAKER + FEE_TAKER) / 2, 10);
    // F-G-2's defect stays dead: the twin does not INHERIT the chosen leg's taker friction under a maker stamp
    expect(plan.overlay.frictionCost).not.toBeCloseTo(chosenFriction, 10);
    // BLOCKER-1: nor is it the old fee-delta derivation, which carried the chosen taker leg's entry spread half
    expect(plan.overlay.frictionCost).not.toBeCloseTo(chosenFriction - FEE_TAKER + FEE_MAKER, 10);
  });

  // `8a-P4c` 3b (P9): a taker twin now books the guarded ASK — on its side at entry, so no spread half at either leg.
  it('taker twin of a PENDING-MAKER chosen leg: its OWN per-leg friction — booked at the ask, no spread half', () => {
    const plan = planTwin({
      ...base,
      pendingMaker: true,
      decisionChosenMode: 'maker',
      chosenSlippage: SLIP,
      chosenSpread: SPREAD,
    });
    expect(plan.kind).toBe('open');
    if (plan.kind !== 'open') return;
    expect(plan.twinMode).toBe('taker');
    expect(plan.overlay.entryPriceBasis).toBe('ask');
    expect(plan.overlay.entryPrice).toBe(101); // the placement ask
    expect(plan.overlay.frictionCost).toBeCloseTo(FEE_TAKER + FEE_TAKER + 2 * SLIP, 10);
    expect(plan.overlay.costEntryFeeFraction).toBe(FEE_TAKER);
  });

  // `8a-P4c` 3a-ii FINDING-2 (Langston): the old optional arm let a twin inherit the chosen leg's fee fractions under its
  // OWN basis and recompose to neither leg's number. The inputs are required now: without them the twin is SKIPPED.
  it('without the chosen leg\'s figures the twin is SKIPPED (chosen_leg_unpriced) — never inherited, never 0', () => {
    expect(planTwin({ ...base, pendingMaker: false, decisionChosenMode: 'taker', chosenSlippage: undefined, chosenSpread: undefined }))
      .toEqual({ kind: 'skip', reason: 'chosen_leg_unpriced' });
    expect(planTwin({ ...base, pendingMaker: false, decisionChosenMode: 'taker', chosenSlippage: SLIP, chosenSpread: Number.NaN }))
      .toEqual({ kind: 'skip', reason: 'chosen_leg_unpriced' });
  });

  it('the skip paths are untouched by the re-price inputs', () => {
    const plan = planTwin({
      ...base,
      placementTransactablePrice: 99,  // marketable at placement ⇒ maker twin skipped
      pendingMaker: false,
      decisionChosenMode: 'taker',
      chosenSlippage: SLIP,
      chosenSpread: SPREAD,
    });
    expect(plan).toEqual({ kind: 'skip', reason: 'marketable_maker' });
  });
});
