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
import { readFileSync } from 'fs';
import { join } from 'path';
import { gcdOfIncrements, gridIsDerivedForClass, decideGridAction } from '../../markets/venue-grid-resolver';
import {
  roundTripleToGrid,
  roundPriceForRole,
  roundQuantityForVenue,
  isOnGrid,
  evaluateGridForTagging,
  decimalsOf,
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

describe('F-G-1 OBJ-3 (VTS lane) — evaluateGridForTagging TAGS and never changes anything', () => {
  // MUTATION: have it return the rounded triple in place of the inputs and this fails.
  // ⛔ THE WHOLE POINT: the VTS lane simulates on the NATIVE geometry. If this ever mutated,
  // it would also silently re-price the xStock ACTIVE signal, whose geometry is born in the
  // same lane (eval-cycle.ts:640-642 feeds dispatchXstockActiveSignal at :1165).
  it('is pure — the callers prices are untouched', () => {
    const entry = 100.004, stop = 99.001, target = 110.007;
    const t = evaluateGridForTagging(entry, stop, target, 0.01);
    expect(entry).toBe(100.004);
    expect(stop).toBe(99.001);
    expect(target).toBe(110.007);
    expect(t.wouldBe).not.toBeNull();
    expect(t.wouldBe!.entryPrice).not.toBe(entry); // it DID compute a different value...
  });

  // MUTATION: drop the isOnGrid short-circuit and this fails.
  it('says on_grid when nothing would move', () => {
    const t = evaluateGridForTagging(100.0, 99.0, 110.0, 0.01);
    expect(t.verdict).toBe('on_grid');
  });

  it('says would_round when a leg would move', () => {
    const t = evaluateGridForTagging(100.004, 99.001, 110.007, 0.01);
    expect(t.verdict).toBe('would_round');
  });

  // MUTATION: set isWiringBug false for grid_unknown and this fails.
  // A missing grid is a DATA-WIRING gap, not a property of the signal, and must never be
  // coerced into a quality bucket where it reads as the signal's fault.
  it('flags an unresolvable grid as a WIRING bug, not a quality verdict', () => {
    const t = evaluateGridForTagging(100, 99, 110, null);
    expect(t.verdict).toBe('grid_unknown');
    expect(t.isWiringBug).toBe(true);
    expect(t.wouldBe).toBeNull();
  });

  // MUTATION: remove the minStopDistanceBps branch and this returns would_round.
  it('tags stop_distance_after_rounding as a QUALITY verdict, not a wiring bug', () => {
    // 0.3% of 100 is 0.30; a stop 0.02 away is far inside the floor.
    const t = evaluateGridForTagging(100.0, 99.98, 110.0, 0.01, { minStopDistanceBps: 30 });
    expect(t.verdict).toBe('stop_distance_after_rounding');
    expect(t.isWiringBug).toBe(false);
  });

  it('tags the #915 inverted shape as unorderable rather than guessing a side', () => {
    const t = evaluateGridForTagging(113.13, 117.83, 134.04, 0.01);
    expect(t.verdict).toBe('unorderable');
    expect(t.isWiringBug).toBe(false);
  });
});

describe('F-G-1 — NON-DECIMAL TICKS, fed to the ROUNDING and not only to the GCD', () => {
  // ⛔ THE FENCE GAP THAT LET A LIVE DEFECT THROUGH. 0.0025 was tested only against
  // `gcdOfIncrements`; every rounding case used 0.01 or 0.00001 — powers of ten. So the headline
  // example stopped ONE FUNCTION SHORT of the defect, and `decimalsOf` (which read only the
  // exponent) rounded on-grid products onto a 0.001 grid for exactly the six xStock symbols the
  // GCD test was celebrating. Langston found it at the ref.

  // MUTATION: revert decimalsOf to the exponent-only form and every case here fails.
  it('counts decimals from the whole tick, not just its exponent', () => {
    expect(decimalsOf(0.0025)).toBe(4);   // exponent-only said 3
    expect(decimalsOf(0.25)).toBe(2);     // exponent-only said 1
    expect(decimalsOf(0.0005)).toBe(4);
    expect(decimalsOf(0.01)).toBe(2);
    expect(decimalsOf(1e-8)).toBe(8);
    expect(decimalsOf(1)).toBe(0);
  });

  it('rounds ONTO a 0.0025 grid, the real xStock case', () => {
    for (const [entry, stop, target] of [
      [12.3456, 12.1111, 12.9999],
      [100.0026, 99.4004, 101.7007],
      [7.0063, 6.8001, 7.9002],
    ] as Array<[number, number, number]>) {
      const r = roundTripleToGrid(entry, stop, target, 0.0025);
      expect(r.ok).toBe(true);
      for (const v of [r.entryPrice, r.stopPrice, r.targetPrice]) {
        expect(isOnGrid(v, 0.0025)).toBe(true);
      }
    }
  });

  it('rounds onto a 0.0005 grid too — the other non-decimal tick measured', () => {
    const r = roundTripleToGrid(50.00031, 49.10007, 51.90009, 0.0005);
    expect(r.ok).toBe(true);
    for (const v of [r.entryPrice, r.stopPrice, r.targetPrice]) {
      expect(isOnGrid(v, 0.0005)).toBe(true);
    }
  });

  // ⛔⛔ THE ASSERTION THAT USED TO BE HERE COULD NOT FAIL, AND IT WAS THE ONE GUARDING THE PIECE
  // I CALLED "THE REAL FIX". It read `expect(['not_representable_after_rounding', undefined])
  // .toContain(r.reason)` — and a SUCCESSFUL call returns `reason: undefined`, which is in the
  // array. Langston called it vacuous; a fresh reader then PROVED it, deleting the refusal from
  // the module and getting 38/38 green. Two independent readers, same line.
  // ★ WHY IT WAS WRITTEN THAT WAY, because the reason matters more than the fix: there is NO
  // natural input that trips the self-check while the arithmetic is correct — it guards a defect
  // CLASS, not a case. Rather than admit the branch was unexercised, I widened the assertion
  // until it accepted both outcomes. That is not a weak test; it is a test-shaped comment.
  // ⇒ REPLACED with the strongest thing that CAN fail: a property sweep asserting the success
  // path never emits an off-grid leg, checked with the guard's own predicate. If the arithmetic
  // regresses anywhere in that space, this dies.
  it('PROPERTY — every successful rounding lands on the grid, across the real tick set', () => {
    const ticks = [0.01, 0.1, 1, 0.0001, 0.0025, 0.0005, 1e-5, 1e-8, 0.05];
    let exercised = 0;
    for (const t of ticks) {
      for (const base of [0.00012345, 1.234567, 12.34567, 199.9999, 68000.12345, 1234567.891]) {
        const r = roundTripleToGrid(base, base * 0.97, base * 1.06, t);
        if (!r.ok) continue;               // refusals are covered by their own tests
        exercised++;
        expect(isOnGrid(r.entryPrice, t)).toBe(true);
        expect(isOnGrid(r.stopPrice, t)).toBe(true);
        expect(isOnGrid(r.targetPrice, t)).toBe(true);
        // ⛔ NOT `expect(r.representable).toBe(true)` — a fresh reader pointed out that
        // `representable: true` is HARDCODED on the success return, so asserting it after `ok`
        // restates `ok` and survives deleting the self-check entirely. Decoration, not a check.
      }
    }
    // POSITIVE CONTROL, threshold set from the MEASURED value (46 of 54 combinations round
    // successfully; the other 8 refuse as degenerate). At 30 it carried 16 combinations of slack
    // — a control loose enough to absorb a real regression is barely a control.
    expect(exercised).toBeGreaterThanOrEqual(46);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE SECOND-READER ROUND. Three defects a fresh-context reader found in the blocker-5
// CORRECTION — i.e. in work written to fix a defect, by the same session, in the same context.
// Every one of them is fenced here, because an unfenced fix is a defect waiting for the next edit.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe('F-G-1 — SHAPE IS CHECKED BEFORE THE GRID, so the passthrough path is never shape-blind', () => {
  // MUTATION: move the `!finite(tick)` check back above the isLong/isShort derivation and the
  // SHORT and UNORDERABLE cases fail. ⚠️ NOT "every case here" — my first comment said that, and a
  // fresh reader checked: `invalid_triple` was already first in the original order, and the
  // `grid_unknown` case returns the same reason either way, so two of these four are unchanged by
  // that mutation. TWO controls, not four. The defect was real — a short-shaped or #915-inverted
  // triple on an unresolved xStock grid was NEVER shape-checked and passed into sizing — but a
  // comment that overstates its own coverage is how the next reader mis-sizes a regression.
  it('refuses a SHORT-shaped triple on its shape, even with NO tick at all', () => {
    const r = roundTripleToGrid(100, 110, 90, null);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('short_side_unexercised');
  });

  it('refuses an UNORDERABLE (#915-inverted) triple on its shape, even with NO tick at all', () => {
    // stop ABOVE entry AND target ABOVE entry — neither long- nor short-shaped.
    const r = roundTripleToGrid(100, 105, 110, null);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('unorderable_triple');
  });

  it('refuses a non-finite triple on its shape, even with NO tick at all', () => {
    expect(roundTripleToGrid(NaN, 95, 110, null).reason).toBe('invalid_triple');
    expect(roundTripleToGrid(100, 0, 110, null).reason).toBe('invalid_triple');
  });

  it('still reports grid_unknown when the SHAPE is valid and only the tick is missing', () => {
    const r = roundTripleToGrid(100, 95, 110, null);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('grid_unknown');
  });
});

describe('F-G-1 — a REFUSAL echoes the inputs back UNROUNDED, which is why the seam must not re-gate', () => {
  // This is the fact the passthrough fix rests on, asserted rather than asserted-about. `fail()`
  // returns the ORIGINAL numbers, so on the xStock passthrough path `_r.entryPrice/_r.stopPrice`
  // are the raw floats. Running the post-round stop-distance floor on them and booking
  // `grid_stop_distance_after_rounding` would name a rounding that never happened.
  // MUTATION: make fail() emit zeros/nulls and this fails.
  it('returns the ORIGINAL entry/stop/target on a grid_unknown refusal', () => {
    const r = roundTripleToGrid(100.123456, 95.654321, 110.987654, null);
    expect(r.ok).toBe(false);
    expect(r.entryPrice).toBe(100.123456);
    expect(r.stopPrice).toBe(95.654321);
    expect(r.targetPrice).toBe(110.987654);
    expect(r.representable).toBe(false);
  });

  // ⛔⛔ THE ORDERING ASSERTION THAT USED TO BE HERE DID NOT DISCRIMINATE. It compared three
  // `indexOf` positions and asserted the stop-distance check came after a `} else {` — but
  // DISABLING that check outright, and hoisting it out while leaving the `else` that carries the
  // rounded-value assignment, BOTH kept every position in order. A fresh reader ran both and the
  // suite stayed green. It also did not strip comments, unlike the sibling assertion hardened in
  // the same commit for exactly that reason.
  // ⇒ REPLACED. The seam no longer HAS a decision to order — it dispatches on `decideGridAction`,
  // whose every arm is exercised above. What is left to assert is that the seam CALLS it, written
  // so a bare import cannot satisfy it: the one assertion kept in the writer fence WAS satisfied
  // by an import, which is #918's own shape reproduced in the test guarding #918.
  it('SEAM: the orchestrator CALLS the extracted decision (an import cannot satisfy this)', () => {
    const raw = readFileSync(join(process.cwd(), 'server/services/signal-orchestrator.ts'), 'utf8');
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(code).toMatch(/decideGridAction\s*\(\s*\w+\.assetClass/);
    // and no second copy of the rule has grown back inside the seam
    expect(code).not.toMatch(/_gridIsDerived\s*=/);
  });
});

describe('F-G-1 — A PASSTHROUGH IS NOT A REJECT (the funnel subset invariant)', () => {
  // `active-funnel-tracker.ts` defines preSqeRejects as the sites that DROP a built signal before
  // the SQE, "so they are a true subset of signalsGenerated". A passthrough drops nothing and is
  // counted again downstream, so booking it there would push that stage above its own denominator
  // — Langston's B8.4b defect, reproduced one bucket over. Found by a fresh reader.
  // MUTATION: point recordActiveGridPassthrough at recordActivePreSqeReject and this fails.
  it('lands in gridPassthroughs and leaves preSqeRejects completely untouched', async () => {
    const t = await import('../../core/observability/active-funnel-tracker');
    const before = t.getActiveFunnelStats('paper', 'xstock_spot');
    const rejectsBefore = JSON.stringify(before.preSqeRejects);
    const passBefore = before.gridPassthroughs?.['unresolved_grid'] ?? 0;

    t.recordActiveGridPassthrough('paper', 'xstock_spot', 'unresolved_grid');

    const after = t.getActiveFunnelStats('paper', 'xstock_spot');
    expect(after.gridPassthroughs['unresolved_grid']).toBe(passBefore + 1);
    expect(JSON.stringify(after.preSqeRejects)).toBe(rejectsBefore);
    // ⛔ AND MEASURED AS A DELTA, for the same reason as the test below. The PRE-FIX code wrote
    // exactly the key `grid_unresolved_passthrough` into this bucket, and the tracker reloads a
    // checkpoint from `logs/` at module load — so an absolute `toEqual([])` would fail on any
    // machine carrying a pre-fix checkpoint, for a reason unrelated to the code. Fresh-reader
    // finding, and the pressure such a test creates is to weaken it, which is this file's history.
    const passKeys = (m: Record<string, number>) =>
      Object.keys(m).filter((k) => k.includes('passthrough')).length;
    expect(passKeys(after.preSqeRejects) - passKeys(before.preSqeRejects)).toBe(0);
  });

  // MUTATION: add gridPassthroughs into the preSqeRejects sum anywhere and this fails.
  // ⛔⛔ MEASURED ON DELTAS, NEVER ON ABSOLUTES, AND A FRESH READER PROVED WHY. The tracker
  // reloads a checkpoint from the gitignored `logs/` dir at module load, so its absolute counts
  // carry whatever a previous run left on disk. The reader seeded that file with
  // `signalsGenerated: 5000` and the absolute form of this test PASSED under a mutation that
  // books passthroughs straight into `preSqeRejects` — the one automated control speaking to
  // this claim could be silenced by a file on disk. A delta cannot be, because ambient state
  // cancels out of a before/after subtraction.
  it('does not inflate the pre-SQE stage — measured as a DELTA, immune to ambient checkpoint state', async () => {
    const t = await import('../../core/observability/active-funnel-tracker');
    const sum = (m: Record<string, number>) => Object.values(m).reduce((a, b) => a + b, 0);
    const before = t.getActiveFunnelStats('paper', 'xstock_spot');

    t.recordActiveSignalsGenerated('paper', 'xstock_spot', 1);
    t.recordActiveGridPassthrough('paper', 'xstock_spot', 'unresolved_grid');

    const after = t.getActiveFunnelStats('paper', 'xstock_spot');
    expect(after.signalsGenerated - before.signalsGenerated).toBe(1);
    expect(sum(after.preSqeRejects) - sum(before.preSqeRejects)).toBe(0);   // NOTHING was rejected
    expect(sum(after.gridPassthroughs) - sum(before.gridPassthroughs)).toBe(1);
  });
});

describe('F-G-1 — isOnGrid, the predicate the self-check is built on', () => {
  // ⛔ TWO CONTROLS, BOTH REQUIRED. Tuned in one direction only, this predicate was wrong twice:
  // an ABSOLUTE 1e-9 band over-refused exact multiples at large q, and my first fix (the same
  // 1e-9 scaled by q) started ACCEPTING off-grid prices — strictly worse, because an over-refusal
  // loses a trade and a false accept SHIPS an unplaceable order.

  // MUTATION: restore the absolute `1e-9` band and the last two of these fail.
  it('POSITIVE — accepts exact multiples, including at very large tick counts', () => {
    for (const [p, t] of [
      [100, 0.01], [68000.5, 0.1], [200, 0.0025], [12.3475, 0.0025],
      [0.00012345, 1e-8],
      [68000.5, 0.00001],   // 6.8e9 ticks — the absolute band FAILS this
      [1e6, 0.00001],       // 1e11 ticks — and this
    ] as [number, number][]) {
      expect(isOnGrid(p, t)).toBe(true);
    }
  });

  // MUTATION: scale the band by 1e-9 instead of Number.EPSILON and the last two of these fail.
  it('NEGATIVE — rejects prices that sit between ticks, at every scale', () => {
    for (const [p, t] of [
      [100.005, 0.01], [68000.55, 0.1], [200.00003, 0.0001], [12.34875, 0.0025],
      [68000.500005, 0.00001],    // half a tick out at 6.8e9 ticks
      [1000000.000005, 0.00001],  // half a tick out at 1e11 ticks
    ] as [number, number][]) {
      expect(isOnGrid(p, t)).toBe(false);
    }
  });

  // ⛔ EVERY CONTROL ABOVE IS EXACTLY HALF A TICK OUT — THE EASIEST OFF-GRID CASE TO REJECT.
  // A fresh reader binary-searched the band and found it could be loosened by ~2,800x with all
  // of them still green. A real arithmetic regression does not land at half a tick; it lands a
  // hundredth of one out. These are the controls that actually bracket the tolerance.
  // MUTATION: loosen the band by ~100x and these fail while the half-tick ones do not.
  it('NEGATIVE, TIGHT — rejects a price a HUNDREDTH of a tick off grid', () => {
    for (const [p, t] of [
      [100.0001, 0.01],
      [68000.501, 0.1],
      [200.000025, 0.0025],
      [0.000123450001, 1e-8],
    ] as [number, number][]) {
      expect(isOnGrid(p, t)).toBe(false);
    }
  });
});

describe('F-G-1 — THE SEAM DECISION, called directly', () => {
  // the triple every case below carries; the `apply` arm must hand these back verbatim
  const T = { entryPrice: 100, stopPrice: 95, targetPrice: 110 };

  // ⛔⛔ THIS IS THE BLOCK THAT WAS MISSING, AND ITS ABSENCE WAS PROVED TWICE. The published-vs-
  // derived rule lived inline in `signal-orchestrator.buildSizedSignalForStrategy`, which NO TEST
  // EXECUTES: a fresh reader replaced it with a literal `true` — reinstating blocker-5, crypto
  // passing through UNROUNDED — and the whole suite stayed green. Extracting the PREDICATE and
  // fencing it left the CALL unguarded, so the identical mutation still passed.
  // ⇒ The whole DECISION is a pure function now, and these call it.

  // MUTATION: drop the class test from decideGridAction and this fails. IT IS BLOCKER-5.
  it('CRYPTO with no tick REJECTS — it never passes through', () => {
    expect(decideGridAction('crypto_spot', { ok: false, reason: 'grid_unknown', ...T }).action).toBe('reject');
    expect(decideGridAction('crypto_perp', { ok: false, reason: 'grid_unknown', ...T }).action).toBe('reject');
  });

  // MUTATION: drop the grid_unknown test and this fails.
  it('xSTOCK with no tick PASSES THROUGH — absence is our coverage gap, not a venue fact', () => {
    for (const c of ['xstock_spot', 'xstock_perp']) {
      const d = decideGridAction(c, { ok: false, reason: 'grid_unknown', ...T });
      expect(d.action).toBe('passthrough');
      expect(d.action === 'passthrough' && d.reason).toBe('unresolved_grid');
    }
  });

  // ⛔ THE ARM THAT MAKES THE PASSTHROUGH SAFE, and it is why the branch keys on the REASON and
  // not on the class alone. MUTATION: key the passthrough on the class only and this fails — a
  // short-shaped or #915-inverted xStock triple would then enter sizing having never been checked.
  it('EVERY OTHER refusal still refuses, for xStock too', () => {
    for (const reason of ['invalid_triple', 'short_side_unexercised', 'unorderable_triple',
                          'degenerate_after_rounding', 'not_representable_after_rounding']) {
      expect(decideGridAction('xstock_spot', { ok: false, reason, ...T }).action).toBe('reject');
      expect(decideGridAction('crypto_spot', { ok: false, reason, ...T }).action).toBe('reject');
    }
  });

  // ⛔ THE APPLY ARM CARRIES THE PRICES, AND THE SEAM ASSIGNS FROM THEM. That is what turns
  // Langston's predicted mutation — keep the call, discard the result, hardcode `{action:'apply'}`
  // — from something a test must catch into something that does not COMPILE (measured: 384 -> 390
  // tsc errors under it). MUTATION: drop the price fields from the apply arm and this fails, and
  // so does the orchestrator's build.
  it('a successful rounding is APPLIED, and carries the prices the seam will use', () => {
    for (const c of ['crypto_spot', 'xstock_spot']) {
      const d = decideGridAction(c, { ok: true, ...T });
      expect(d.action).toBe('apply');
      expect(d).toMatchObject({ entryPrice: 100, stopPrice: 95, targetPrice: 110 });
    }
  });

  // An unrecognised class must take the CONSERVATIVE side end-to-end, not only in the predicate.
  it('an unrecognised class REFUSES rather than passing through', () => {
    expect(decideGridAction('something_new', { ok: false, reason: 'grid_unknown', ...T }).action).toBe('reject');
  });
});

describe('F-G-1 — PUBLISHED vs DERIVED has exactly one home', () => {
  // ⛔ THIS IS THE LINE BLOCKER-5 WAS ABOUT, AND IT HAD ZERO COVERAGE. A fresh reader reverted the
  // orchestrator's copy to the tautology (`provenance !== 'venue_published'`, true by construction
  // inside the grid_unknown branch, which let CRYPTO pass through unrounded) and the whole suite
  // stayed green. The rule now lives in ONE exported function, and the fence is on the function.

  // MUTATION: add crypto to the derived set and this fails — that IS blocker-5.
  it('CRYPTO is published: absence of a tick is a real unknown, so it must NOT pass through', () => {
    expect(gridIsDerivedForClass('crypto_spot')).toBe(false);
    expect(gridIsDerivedForClass('crypto_perp')).toBe(false);
  });

  // MUTATION: drop xstock_perp and this fails.
  it('xSTOCK is derived: absence is OUR coverage gap, so it passes through', () => {
    expect(gridIsDerivedForClass('xstock_spot')).toBe(true);
    expect(gridIsDerivedForClass('xstock_perp')).toBe(true);
  });

  // An unknown class must take the CONSERVATIVE side. A new asset class defaulting to "derived"
  // would silently start shipping unrounded prices on the day it is added.
  it('an unrecognised asset class is treated as PUBLISHED — refuse, never pass through', () => {
    expect(gridIsDerivedForClass('something_new')).toBe(false);
    expect(gridIsDerivedForClass('')).toBe(false);
  });
});

describe('F-G-1 — a tag verdict must say WHOSE fault it is', () => {
  // ⚠️ THE MUTATION THIS BLOCK ONCE NAMED IS CAUGHT BY THE SELF-CHECK BLOCK BELOW, NOT HERE —
  // corrected after a fresh reader checked it. Nothing in this block produces
  // `not_representable_after_rounding`, so folding it back into 'unorderable' leaves these three
  // assertions green. Kept because the verdicts it DOES pin are worth pinning; the comment is now
  // honest about which block carries the load. A mutation comment naming a mutation the block
  // cannot catch is how the next reader mis-sizes a regression.
  // MUTATION THIS BLOCK ACTUALLY CATCHES: fold `invalid_triple` back into 'unorderable'.
  it('separates OUR defects from the signal shape', () => {
    expect(evaluateGridForTagging(100, 105, 110, 0.01).verdict).toBe('unorderable');   // signal
    expect(evaluateGridForTagging(NaN, 95, 110, 0.01).verdict).toBe('invalid_triple'); // values
    expect(evaluateGridForTagging(100, 95, 110, null).verdict).toBe('grid_unknown');   // wiring
  });

  // ⚠️ SAME CORRECTION: narrowing `isWiringBug` back to `grid_unknown` only leaves BOTH
  // assertions here green, because neither case produces the reason that narrowing would drop.
  // The self-check block below is what catches it. Fresh-reader finding.
  it('flags a wiring problem as ours, and a shape problem as the signals', () => {
    expect(evaluateGridForTagging(100, 95, 110, null).isWiringBug).toBe(true);
    expect(evaluateGridForTagging(100, 105, 110, 0.01).isWiringBug).toBe(false);
  });
});

describe('F-G-1 — the SELF-CHECK, finally EXERCISED rather than asserted-about', () => {
  // ⛔⛔ THIS BRANCH WAS UNTESTED THROUGH FOUR REVIEW ROUNDS, and both the vacuous assertion I
  // wrote and the tag-verdict arm I later added were unfenced for the SAME reason: I assumed no
  // input could reach it while the arithmetic is correct. That assumption was wrong.
  // ★ THE REACHABLE INPUT: `decimalsOf` CLAMPS AT 12, and `snap` closes with `toFixed(that many)`.
  // So a tick whose decimal form needs MORE than 12 places is truncated on the way out, and the
  // snapped value is not a multiple of the tick. Found by a fresh reader as a note about the
  // clamp; turned into a fence by asking what input would prove it.
  // ⚠️ HONEST SCOPE: no resolver we own can currently PRODUCE such a tick — `gcdOfIncrements`
  // works at 8dp and Kraken publishes powers of ten. This is a real execution of the guard, not
  // a claim that the condition occurs in production.

  const PATHOLOGICAL_TICK = 1.23456789012345e-7; // needs 21 decimals; decimalsOf clamps to 12

  // MUTATION: delete the `if (!representable) return fail(...)` line and this fails.
  // A fresh reader deleted exactly that line and the whole suite stayed green.
  it('REFUSES when its own output is not on the grid, instead of shipping it', () => {
    const r = roundTripleToGrid(1.234567, 1.20, 1.30, PATHOLOGICAL_TICK);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('not_representable_after_rounding');
  });

  // CONTROL: the same triple on a normal tick must SUCCEED — otherwise the test above would pass
  // for any reason at all, which is how the assertion it replaces came to be worthless.
  it('CONTROL — the identical triple on a real tick rounds cleanly', () => {
    const r = roundTripleToGrid(1.234567, 1.20, 1.30, 0.0001);
    expect(r.ok).toBe(true);
    expect(r.representable).toBe(true);
  });

  // MUTATION: map not_representable_after_rounding back to 'unorderable' and this fails.
  // This is the arm that recorded OUR arithmetic defect as a malformed SIGNAL on both VTS lanes.
  it('TAGS it as our defect, not as a malformed signal', () => {
    const tag = evaluateGridForTagging(1.234567, 1.20, 1.30, PATHOLOGICAL_TICK);
    expect(tag.verdict).toBe('not_representable_after_rounding');
    expect(tag.isWiringBug).toBe(true); // OURS, not the signal's
  });
});

describe('F-G-1 — the pre-fix passthrough counts are MIGRATED, not stranded and not deleted', () => {
  // The `keySchema` is deliberately NOT bumped (bumping discards ALL live funnel history for a
  // purely additive field), so counts written by the pre-fix code under the key
  // `grid_unresolved_passthrough` are still on disk inside `preSqeRejects`. Left there, the client
  // renders them forever under a heading reading "Venue Price Grid (VPG) — rejected": the fix
  // would be live for new counts while the tab kept reporting old passthroughs as rejections.
  // MUTATION: drop the migration from the reload and this fails.
  it('moves the legacy key into gridPassthroughs, preserving the count', async () => {
    const t = await import('../../core/observability/active-funnel-tracker');
    const m = t.migrateLegacyPassthroughKey({
      preSqeRejects: { grid_unresolved_passthrough: 7, unmappable_symbol: 2 },
      gridPassthroughs: { unresolved_grid: 3 },
    });
    expect(m.preSqeRejects.grid_unresolved_passthrough).toBeUndefined();
    expect(m.preSqeRejects.unmappable_symbol).toBe(2);   // untouched
    expect(m.gridPassthroughs.unresolved_grid).toBe(10); // 3 + 7, NOT lost and NOT double-counted
  });

  it('is a no-op when there is nothing legacy to move', async () => {
    const t = await import('../../core/observability/active-funnel-tracker');
    const m = t.migrateLegacyPassthroughKey({ preSqeRejects: { unmappable_symbol: 2 } });
    expect(m.preSqeRejects).toEqual({ unmappable_symbol: 2 });
    expect(m.gridPassthroughs).toEqual({});
  });
});

describe('F-G-1 / BLOCKER-7 — snap() carried the SAME absolute-epsilon defect, twelve lines up', () => {
  // ⛔⛔ I FIXED `isOnGrid` AND WALKED PAST `snap`, WHICH ASKS THE IDENTICAL QUESTION IN THE SAME
  // FILE. Langston found it. `rg '1e-9' venue-price-grid.ts` returns FOUR sites and I had fixed
  // ONE — the grep would have returned all of them the first time.
  // ★ This is the block Langston's J8 remedy exists for: when a defect is named, grep the CLASS
  // before fixing the instance, and state what the grep returned.
  //
  // MEASURED, on-grid inputs only, counting inputs moved a FULL TICK, n=200,000 per cell:
  //   tick 1e-5 @ $1k-100k (q~1e10): 14.1% -> 0.0%   |   tick 2e-8 @ $10-300 (q~1e10): 14.4% -> 0.0%
  //   CONTROLS (q <= 1e7) unchanged at 0.0% throughout.
  // MUTATION: restore `const EPS = 1e-9` and the large-q cases fail while the controls do not.
  it('does NOT move an already-on-grid price at large tick counts', () => {
    for (const [tick, price] of [
      [1e-5, 68000.5],
      [1e-5, 1234.56789],
      [2e-8, 200.00000004],
      [2e-8, 12.3456789],
    ] as [number, number][]) {
      const onGrid = Math.round(price / tick) * tick;
      expect(isOnGrid(onGrid, tick)).toBe(true);            // premise
      for (const dir of ['up', 'down'] as const) {
        const snapped = roundPriceForRole(onGrid, tick, dir === 'up' ? 'target' : 'stop', true);
        expect(Math.abs(snapped - onGrid)).toBeLessThan(tick * 0.5);
      }
    }
  });

  // CONTROL: the small-q cases the old constant handled correctly must be untouched by the fix.
  // Without this, tightening the epsilon to zero would also pass the test above.
  it('CONTROL — still absorbs real float dust at ordinary tick counts', () => {
    for (const [tick, price] of [[0.01, 100], [0.0025, 12.3475], [0.1, 68000.5]] as [number, number][]) {
      const onGrid = Math.round(price / tick) * tick;
      expect(roundPriceForRole(onGrid, tick, 'stop', true)).toBeCloseTo(onGrid, 10);
      expect(roundPriceForRole(onGrid, tick, 'target', true)).toBeCloseTo(onGrid, 10);
    }
  });

  // The third instance of the class, in the SIZE path.
  // MUTATION: restore `Math.floor(quantity / step + 1e-9)` and this fails.
  // ⛔ THE VALUE IS CHOSEN, NOT ASSUMED. My first version used 2.5, which floors identically under
  // both epsilons — the test passed under the mutation and I only know that because I ran it.
  // 5.1 at lotDecimals 8 gives lots = 509999999.99999994: a fixed 1e-9 is far too small to lift it
  // over the integer boundary, so the old code floors to 509,999,999 lots and SILENTLY LOSES a
  // whole lot of size. The relative band lifts it correctly.
  // MUTATION: restore `Math.floor(_lots + 1e-9)` and this fails.
  it('roundQuantityForVenue does not silently lose a whole lot at large lot counts', () => {
    const r = roundQuantityForVenue(5.1, 100, 8, null, null);
    expect(r).not.toBeNull();
    expect(r!.quantity).toBeCloseTo(5.1, 9);   // old code returns 5.09999999
  });
});

describe('F-G-1 — a POLICY refusal is not a malformed signal', () => {
  // Langston: I pulled the two arithmetic reasons out of the `unorderable` bucket and left the one
  // that is not a defect at all. A well-formed SHORT is refused because the branch is unexercised
  // — a policy decision — and `unorderable`'s own doc says "not long-shaped and NOT SHORT-SHAPED",
  // which is the one thing that triple demonstrably is.
  // MUTATION: fold short_side_unexercised back into 'unorderable' and this fails.
  it('tags a refused short as a short, not as an unorderable triple', () => {
    expect(evaluateGridForTagging(100, 110, 90, 0.01).verdict).toBe('short_side_unexercised');
    expect(evaluateGridForTagging(100, 105, 110, 0.01).verdict).toBe('unorderable'); // still
  });
});
