/**
 * F-G-1 / B-GRID-REPRESENTABILITY — VENUE PRICE GRID FENCE
 *
 * WHY THIS FILE EXISTS IN THIS SHAPE. The audit for this batch was overturned four times by
 * independent readers, and the single most instructive failure was a fence I had DESIGNED that
 * could not have fired: "assert no stop moved toward entry" measured against the UNROUNDED entry,
 * in a defect where the stop never moves at all. So every case below is written to fail on a
 * SPECIFIC mutation of the production module, and the mutation is named in the test.
 *
 * ⛔ A CONTROL THAT CANNOT FIRE IS THE SAME DEFECT AS THE FENCE IT GUARDS.
 */
import { describe, it, expect } from 'vitest';
import { gcdOfIncrements } from '../../markets/venue-grid-resolver';
import {
  roundTripleToGrid,
  roundPriceForRole,
  roundQuantityForVenue,
  isOnGrid,
} from '../../core/calculations/venue-price-grid';

describe('F-G-1 OBJ-7 — direction by price role', () => {
  // MUTATION: flip the stop to 'nearest' -> 99.99 (toward entry) and this fails.
  it('rounds a long stop AWAY from entry, never toward it', () => {
    // 99.994 is nearer 99.99, but 99.99 is TOWARD entry — a structural stop nudged up lands
    // inside the level it was placed behind. Measured: nearest would do this on 49.5% of stops.
    expect(roundPriceForRole(99.994, 0.01, 'stop', true)).toBe(99.99);
    expect(roundPriceForRole(99.996, 0.01, 'stop', true)).toBe(99.99); // nearest would say 100.00
  });

  // MUTATION: flip the target to 'nearest' or 'down' and this fails.
  it('rounds a long target AWAY from entry (a floor: "at least K x ATR")', () => {
    expect(roundPriceForRole(110.001, 0.01, 'target', true)).toBe(110.01);
  });

  // MUTATION: drop the targetIsCap branch and this fails.
  it('rounds a CAP target TOWARD entry — volatility-edge is Math.min, so away breaks its bound', () => {
    expect(roundPriceForRole(110.009, 0.01, 'target', true, true)).toBe(110.0);
    // and the same number with the cap flag off goes the other way — proves the flag is read
    expect(roundPriceForRole(110.009, 0.01, 'target', true, false)).toBe(110.01);
  });

  // MUTATION: change 'nearest' to a direction and this fails.
  it('rounds entry NEAREST, half-up', () => {
    expect(roundPriceForRole(99.994, 0.01, 'entry', true)).toBe(99.99);
    expect(roundPriceForRole(99.995, 0.01, 'entry', true)).toBe(100.0); // half-UP
  });
});

describe('F-G-1 OBJ-7 — the PAIRWISE invariant (the defect my first fence could not see)', () => {
  // MUTATION: remove the `degenerate_after_rounding` check and this returns ok with risk 0.
  it('REFUSES when rounding collapses the risk distance to zero', () => {
    // Stop 99.99 is ALREADY representable so it does not move; entry 99.9949 rounds nearest
    // to 99.99. Risk distance zero. A fence measured against the unrounded entry sees nothing.
    const r = roundTripleToGrid(99.9949, 99.99, 110.0, 0.01);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('degenerate_after_rounding');
  });

  // MUTATION: measure "away" from the RAW entry instead of the rounded one and this fails.
  it('keeps at least one tick between every leg after rounding', () => {
    const r = roundTripleToGrid(100.004, 99.999, 100.006, 0.01);
    if (r.ok) {
      expect(r.entryPrice - r.stopPrice).toBeGreaterThanOrEqual(0.01 - 1e-9);
      expect(r.targetPrice - r.entryPrice).toBeGreaterThanOrEqual(0.01 - 1e-9);
    } else {
      expect(r.reason).toBe('degenerate_after_rounding');
    }
  });
});

describe('F-G-1 OBJ-7 — refusals that must never silently compute', () => {
  // MUTATION: default the side to long and this fails.
  it('REFUSES a short-shaped triple rather than pricing it — the branch is unexercised', () => {
    const r = roundTripleToGrid(100, 110, 90, 0.01); // stop above, target below = short-shaped
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('short_side_unexercised');
  });

  // MUTATION: treat an unorderable triple as long and this fails.
  it('REFUSES #915 shape — stop above entry AND target above entry', () => {
    const r = roundTripleToGrid(113.13, 117.83, 134.04, 0.01); // real AAVE row
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('unorderable_triple');
  });

  // MUTATION: add any fallback tick and this fails. This is the no-hard-coded-fallback rule.
  it('REFUSES when the venue grid is unknown — never invents one', () => {
    for (const bad of [null, undefined, 0, NaN]) {
      const r = roundTripleToGrid(100, 99, 110, bad as number);
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('grid_unknown');
    }
  });

  it('REFUSES a triple missing or non-positive on any leg — no side exists at all', () => {
    expect(roundTripleToGrid(NaN, 99, 110, 0.01).reason).toBe('invalid_triple');
    expect(roundTripleToGrid(100, 0, 110, 0.01).reason).toBe('invalid_triple');
  });
});

describe('F-G-1 OBJ-7 — representability, the property the batch exists to create', () => {
  // MUTATION: use `price % tick === 0` instead of integer-space and this fails on float dust.
  it('reports on-grid correctly for ticks where float modulo lies', () => {
    expect(isOnGrid(0.02617, 0.00001)).toBe(true);
    expect(isOnGrid(0.026171234, 0.00001)).toBe(false);
    expect(isOnGrid(79464.8, 0.1)).toBe(true);
  });

  it('every returned leg is an exact multiple of the tick', () => {
    const r = roundTripleToGrid(0.02695550, 0.02617149, 0.02847700, 0.00001); // real BICO row
    expect(r.ok).toBe(true);
    expect(r.representable).toBe(true);
    for (const v of [r.entryPrice, r.stopPrice, r.targetPrice]) {
      expect(isOnGrid(v, 0.00001)).toBe(true);
    }
  });
});

describe('F-G-1 OBJ-7b kind (i) — VENUE-IMPOSSIBLE size', () => {
  // MUTATION: round the quantity UP and this fails.
  it('rounds quantity DOWN to the lot step — never buys more than sized', () => {
    expect(roundQuantityForVenue(1.23456789, 100, 4, null, null)).toEqual({ quantity: 1.2345 });
  });

  // MUTATION: drop the ordermin check and this returns a quantity.
  it('returns null when the rounded quantity falls below ordermin', () => {
    expect(roundQuantityForVenue(0.0001999, 100, 4, 0.001, null)).toBeNull();
  });

  // MUTATION: drop the costmin check and this returns a quantity.
  it('returns null when the rounded NOTIONAL falls below costmin', () => {
    expect(roundQuantityForVenue(0.01, 100, 4, null, 5)).toBeNull();   // 0.01*100 = $1 < $5
    expect(roundQuantityForVenue(0.10, 100, 4, null, 5)).not.toBeNull(); // $10 >= $5
  });

  // MUTATION: add a lotDecimals fallback and this fails.
  it('returns null when lot precision is unknown — never invents one', () => {
    expect(roundQuantityForVenue(1, 100, null, null, null)).toBeNull();
  });
});

describe('F-G-1 OBJ-3 — the DERIVED xStock grid, and why it is a GCD not a decimal count', () => {
  // MUTATION: replace the GCD with a decimal-place count and this fails.
  // ⛔ THIS IS NOT HYPOTHETICAL. Langston invented 0.0025 as a counter-example to my original
  // "round to the coarsest decimal place" method. Run against one real day of xStock prices,
  // 6 of 40 symbols derive EXACTLY 0.0025 and 3 more derive 0.0005. Rounding those to a
  // "coarser" 0.001 would have made every price we emit for them INVALID, because 0.001 is
  // not a multiple of 0.0025.
  it('recovers a NON-DECIMAL increment that a decimal-place count cannot express', () => {
    const prices = [10.0, 10.0025, 10.005, 10.0075, 10.01];
    const inc = prices.slice(1).map((p, i) => p - prices[i]);
    expect(gcdOfIncrements(inc)).toBeCloseTo(0.0025, 10);
  });

  it('recovers a decimal increment where one exists', () => {
    const prices = [308.34, 308.35, 308.38, 308.39];
    const inc = prices.slice(1).map((p, i) => p - prices[i]);
    expect(gcdOfIncrements(inc)).toBeCloseTo(0.01, 10);
  });

  // MUTATION: return the raw gcd instead of null when g <= 1 and this fails.
  // A GCD of one integer unit is a FAILURE to establish a grid, not a 1e-8 tick.
  it('returns null rather than a plausible-looking 1e-8 when no common factor exists', () => {
    expect(gcdOfIncrements([0.00000001, 0.00000003, 0.00000007])).toBeNull();
  });

  it('returns null on too few observations rather than guessing from one increment', () => {
    expect(gcdOfIncrements([0.01])).toBeNull();
    expect(gcdOfIncrements([])).toBeNull();
  });
});
