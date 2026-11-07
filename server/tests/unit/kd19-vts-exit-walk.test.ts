/**
 * KD-19 (b) + (c) exit leg — `B-PRICE-SIDE-BY-JOB` row 17. Plan `B_PRICE_SIDE_BY_JOB_KD19_PRE_AUDIT.md` P5/P6/P9 with
 * Langston's Step-2 BLOCKER-1, BLOCKER-2 and conditions L1/L2.
 */
import { describe, it, expect } from 'vitest';
import { bookVtsExit, exitWalkRecord, resolveVtsBookedExitPrice } from '../../core/trading/vts-exit-booking.js';
import { closeFillFull } from '../../services/execution/depth-walk.js';
import { composeVtsLegFriction, recomposeVtsCloseFriction, vtsSlippageShareByLeg, vtsSpreadShareByLeg } from '../../core/trading/vts-friction.js';
import { countVtsExitWalk, formatVtsExitCounters, newVtsExitCounters } from '../../core/trading/vts-exit-counters.js';

const BOOK = [{ price: 100, qty: 1 }, { price: 99.5, qty: 1 }, { price: 99, qty: 0.5 }];
const base = { observedBid: 100, observedMark: 100.05, penaltyBps: 50 };

describe('KD-19 P5 — bookVtsExit', () => {
  it('K1: on a book it books EXACTLY paper\'s close walk, bit for bit, and records the split', () => {
    const r = bookVtsExit({ ...base, quantity: 3, depth: { levels: BOOK, basis: 'exact' } });
    const paper = closeFillFull(3, BOOK, 50);
    expect(r.price).toBe(paper.avgFillPrice);
    expect(r.arm).toBe('bid');
    expect(r).toMatchObject({ levelsSeen: 3, walkedQty: 2.5, extrapolatedQty: 0.5, sizeBasis: 'exact', sizeCertain: true, impactPriced: true });
  });

  it('MUTATION CONTROL: booking the top bid on a short book would differ — the walk is what moved the price', () => {
    const r = bookVtsExit({ ...base, quantity: 3, depth: { levels: BOOK, basis: 'exact' } });
    expect(r.price).not.toBe(resolveVtsBookedExitPrice(100, 100.05).price);
    expect(r.price!).toBeLessThan(100);
  });

  it('⛔ L1: quantity 0 (every shadow close) takes the sizeless route BEFORE any guard — the top bid, no throw', () => {
    const r = bookVtsExit({ ...base, quantity: 0, depth: { levels: BOOK, basis: 'exact' } });
    expect(r).toMatchObject({ price: 100, arm: 'bid', sizeBasis: 'unit_lane', walkedQty: 0, extrapolatedQty: 0, impactPriced: false });
  });

  it('L1 CONTROL: the walk itself, handed quantity 0, would book a price of 0', () => {
    expect(closeFillFull(0, BOOK, 50).avgFillPrice).toBe(0);
  });

  it('⛔ BLOCKER-2: a level of size 0 is NOT a sized level — the top bid, never the whole order at the penalty', () => {
    const r = bookVtsExit({ ...base, quantity: 2, depth: { levels: [{ price: 100, qty: 0 }], basis: 'exact' } });
    expect(r).toMatchObject({ price: 100, sizeBasis: 'absent', impactPriced: false });
    expect(closeFillFull(2, [{ price: 100, qty: 0 }], 50).avgFillPrice).toBeCloseTo(99.5, 10); // what it would have booked
  });

  it('no depth ⇒ the top bid, absent', () => {
    expect(bookVtsExit({ ...base, quantity: 2, depth: null })).toMatchObject({ price: 100, sizeBasis: 'absent', impactPriced: false });
  });

  it('no penalty config ⇒ the top bid, labelled no_depth_config', () => {
    const r = bookVtsExit({ ...base, penaltyBps: null, quantity: 2, depth: { levels: BOOK, basis: 'exact' } });
    expect(r).toMatchObject({ price: 100, sizeBasis: 'no_depth_config', impactPriced: false });
  });

  it('an unpriced arm stays unpriced (3n.q3) whatever the depth', () => {
    const r = bookVtsExit({ observedBid: null, observedMark: 100, penaltyBps: 50, quantity: 2, depth: { levels: BOOK, basis: 'exact' } });
    expect(r).toMatchObject({ price: null, arm: 'clamp_no_bid', impactPriced: false });
  });

  describe('⛔ BLOCKER-1: a REST size is a ceiling — certain only when quantity <= stated - 1', () => {
    const rest = (qty: number) => ({ levels: [{ price: 100, qty }], basis: 'rest_rounded_up' as const });
    it('SOL-like: 2.76 against a stated 7 ⇒ certain, the allowance leaves', () => {
      const r = bookVtsExit({ ...base, quantity: 2.76, depth: rest(7) });
      // VWAP over one level = q·p/q, so the price can differ from the bid by one ulp — exactly as paper's walk does.
      expect(r.price!).toBeCloseTo(100, 10);
      expect(r).toMatchObject({ sizeCertain: true, impactPriced: true });
    });
    it('XBT-like: 0.0033 against a stated 1 ⇒ fits on the rounded size, but NOT certain ⇒ the allowance stays', () => {
      const r = bookVtsExit({ ...base, quantity: 0.0033, depth: rest(1) });
      expect(r).toMatchObject({ price: 100, extrapolatedQty: 0, sizeCertain: false, impactPriced: false });
    });
    it('the boundary: quantity == stated - 1 is certain; a hair above is not', () => {
      expect(bookVtsExit({ ...base, quantity: 5, depth: rest(6) }).sizeCertain).toBe(true);
      expect(bookVtsExit({ ...base, quantity: 5.0001, depth: rest(6) }).sizeCertain).toBe(false);
    });
    it('DOT-like: 276 against a stated 6 ⇒ walked short (extrapolated), uncertain', () => {
      const r = bookVtsExit({ ...base, quantity: 276, depth: rest(6) });
      expect(r.extrapolatedQty).toBeCloseTo(270, 10);
      expect(r).toMatchObject({ sizeCertain: false, impactPriced: false });
    });
  });
});

describe('KD-19 P6 — the slippage allowance, per leg', () => {
  const parts = { entryFee: 0.004, exitFee: 0.004, slippage: 0.0005, spread: 0.002, entryPriceBasis: 'limit' as const, exitSideBooked: true };
  it('a priced-impact exit drops ONE allowance; the entry keeps its own', () => {
    expect(composeVtsLegFriction({ ...parts, exitImpactPriced: true })).toBeCloseTo(0.004 + 0.004 + 0.0005, 12);
    expect(composeVtsLegFriction(parts)).toBeCloseTo(0.004 + 0.004 + 0.001, 12);
  });
  const rec = { frictionCost: 0.0095, chosenEntryMode: 'maker' as const, entryPriceBasis: 'limit' as const,
    costEntryFeeFraction: 0.004, costExitFeeFraction: 0.004, costSlippageFraction: 0.0005, costSpreadFraction: 0.002 };
  it('recompose: impactPriced only counts on a bid-booked exit', () => {
    expect(recomposeVtsCloseFriction(rec, 'bid', true).friction).toBeCloseTo(0.0085, 12);
    expect(recomposeVtsCloseFriction(rec, 'bid', false).friction).toBeCloseTo(0.009, 12);
    expect(recomposeVtsCloseFriction(rec, 'bid').friction).toBeCloseTo(0.009, 12);
  });
  it('the B8.7 split sums to the booked friction: walked, sizeless, legacy and ⛔ L2 stamped', () => {
    const sum = (t: any, friction: number) => {
      const sh = vtsSpreadShareByLeg(t, true), sl = vtsSlippageShareByLeg(t, true);
      const legs = (t.costEntryFeeFraction ?? 0) + (t.costExitFeeFraction ?? 0)
        + 0.0005 * (sl.entry + sl.exit) + 0.002 * (sh.entry + sh.exit);
      expect(legs).toBeCloseTo(friction, 12);
    };
    const walked = { ...rec, frictionBasis: 'recomposed' as const, exitBookingArm: 'bid', exitWalk: { impactPriced: true } };
    sum(walked, recomposeVtsCloseFriction(rec, 'bid', true).friction);
    const sizeless = { ...rec, frictionBasis: 'recomposed' as const, exitBookingArm: 'bid', exitWalk: { impactPriced: false } };
    sum(sizeless, recomposeVtsCloseFriction(rec, 'bid', false).friction);
    // L2: a STAMPED close kept the open-time scalar (two allowances) — its exit share stays 1 even if the walk was priced.
    const stamped = { ...rec, frictionBasis: 'stamped' as const, exitBookingArm: 'bid', exitWalk: { impactPriced: true } };
    expect(vtsSlippageShareByLeg(stamped, true)).toEqual({ entry: 1, exit: 1 });
    sum(stamped, 0.004 + 0.004 + 0.001);
    expect(vtsSlippageShareByLeg({}, true)).toEqual({ entry: 1, exit: 1 }); // legacy
    expect(vtsSlippageShareByLeg(walked, false)).toEqual({ entry: 1, exit: 1 }); // an OPEN row
  });
});

describe('KD-19 P7/P9 — record and counters', () => {
  it('the record carries the six fields and nothing else', () => {
    const r = bookVtsExit({ ...base, quantity: 3, depth: { levels: BOOK, basis: 'exact' } });
    expect(Object.keys(exitWalkRecord(r)).sort()).toEqual(['extrapolatedQty', 'impactPriced', 'levelsSeen', 'sizeBasis', 'sizeCertain', 'walkedQty']);
  });
  it('counts walked / extrapolated / uncertain / absent / no-config, and prints every field', () => {
    const c = newVtsExitCounters();
    countVtsExitWalk(c.crypto_spot, bookVtsExit({ ...base, quantity: 3, depth: { levels: BOOK, basis: 'exact' } }));
    countVtsExitWalk(c.crypto_spot, bookVtsExit({ ...base, quantity: 0.0033, depth: { levels: [{ price: 100, qty: 1 }], basis: 'rest_rounded_up' } }));
    countVtsExitWalk(c.crypto_spot, bookVtsExit({ ...base, quantity: 2, depth: null }));
    countVtsExitWalk(c.crypto_spot, bookVtsExit({ ...base, penaltyBps: null, quantity: 2, depth: { levels: BOOK, basis: 'exact' } }));
    countVtsExitWalk(c.crypto_spot, bookVtsExit({ ...base, quantity: 0, depth: null })); // unit lane — not counted here
    expect(c.crypto_spot).toMatchObject({ walked: 2, walkExtrapolated: 1, walkUncertain: 1, sizeAbsent: 1, noDepthConfig: 1 });
    expect(formatVtsExitCounters(c)).toContain('walked=2 walkExtrapolated=1 walkUncertain=1 sizeAbsent=1 noDepthConfig=1');
  });
});
