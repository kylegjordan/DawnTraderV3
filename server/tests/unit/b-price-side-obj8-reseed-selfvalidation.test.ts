/**
 * B-PRICE-SIDE-BY-JOB r5 OBJ-8 row 8a r3 — THE FOUR-TICK RESEED SEQUENCE, AT THE TRACKER.
 *
 * ⛔⛔ WHY THIS FILE EXISTS, AND IT IS A CORRECTION TO MY OWN EARLIER TEST (Langston C1, 2026-09-13).
 * My r2 fixture restated the engine's rule as a LOCAL BOOLEAN inside the test:
 *     const refuses = r.state !== 'two_sided' || comparatorValidated !== true;
 * ⇒ **delete the engine line it was meant to verify and all 48 tests stay green.** It certified the
 *   restatement, never the decision site — and ticks 3-4 are inexpressible in it, which is exactly
 *   why the r2 blocker walked straight through a suite I had called mutation-proved.
 * ✅ THIS FILE DRIVES THE REAL TRACKER STATE MACHINE — `advanceBookStateComparator`,
 *   `clearBookStateComparator`, `readBookStateComparator` — and asserts the FIELDS the engine
 *   actually branches on. No rule is restated here.
 *
 * ═══ THE MEASURED SEQUENCE (CRM/USD, 2026-09-12, `#958`) ═══
 *   tick 1  a healthy chain: 247.01 / 248.00, spread ≈0.40%, validated
 *   ...     the book collapses to 7.00 / 1000.00 → hollow → 60 ticks withheld → YIELD → clear
 *   tick 2  reseed on the hollow frame. r2 refused here. ✅
 *   tick 3  the SAME frame compares to ITSELF: bidDep = askDep = midDep = 0 against a threshold
 *           ≥ 0.01 ⇒ no arm reachable ⇒ `two_sided` ⇒ and THAT verdict promoted `validated`.
 *   tick 4  `two_sided` + validated ⇒ r2's gate expired ⇒ 503.50 booked ~4.7 s after the yield.
 * ⇒ **A REFERENCE CANNOT JUDGE ITS OWN SEED.** r3 supplies the one datum from outside the new
 *   chain that costs no new knob: the RETAINED SPREAD RING.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  advanceBookStateComparator,
  clearBookStateComparator,
  readBookStateComparator,
  _resetBookStateComparatorsForTest,
} from '../../asset_classes/xstock_spot/book-state-tracker';
import { assessBookState, type BookStateConfig } from '../../asset_classes/xstock_spot/book-state';

const SYM = 'CRM/USD';
const K_REL = 3;
const WINDOW = 20;

const CFG: BookStateConfig = {
  enabled: true, kRel: K_REL, floorPct: 1.0, otherSideHoldPct: 0.5, lastHoldPct: 0.5,
  trailingSpreadWindowSnaps: WINDOW, feedReadEnabled: false, feedStubFractionF: 0.10,
  feedStubWindowMs: 90_000, feedCohortFloor: 50, hollowSkipCap: 60, ownMarkDeviationDPct: 5,
};

const HEALTHY = { bid: 247.01, ask: 248.00, last: 247.25 };
const HOLLOW = { bid: 7, ask: 1000, last: 247.25 };

/**
 * Build the healthy chain that precedes the collapse, as the live path would.
 *
 * ⛔ r5 — THE FRAMES MOVE, AND THEY MUST. My r4 version advanced FIVE IDENTICAL FRAMES, which
 * is not what a live book does, and under r5's movement gate it would not have qualified as one.
 * Four tests failed the moment the gate landed — the FIXTURE was wrong, not the gate.
 * ⚠️ THE CONSEQUENCE, STATED RATHER THAN HIDDEN BY THE NEW FIXTURE: a genuinely healthy but
 *    PERFECTLY FROZEN book never sets `observedMovement`, so its ring is never retained and the
 *    next seed after a yield has no yardstick — the vacuous `seedImplausible = false` case. That
 *    is the SAME residual as the restart path, reached a different way, and it is pinned below
 *    rather than papered over. It fails SAFE only in the sense that nothing is contaminated; it
 *    does NOT refuse.
 */
function seedHealthyChain(atMs = 1_000): void {
  for (let i = 0; i < 5; i++) {
    // a live book ticks: a cent either way, spread held at ~0.40%
    const drift = i * 0.01;
    advanceBookStateComparator(
      SYM,
      { bid: HEALTHY.bid + drift, ask: HEALTHY.ask + drift, last: HEALTHY.last + drift, atMs: atMs + i * 1_583 },
      WINDOW, true, K_REL,
    );
  }
}

/** The engine's own branch condition, read from the tracker rather than restated. */
function engineWouldAct(state: string): boolean {
  const cmp = readBookStateComparator(SYM);
  return state === 'two_sided' && cmp?.validated === true;
}

beforeEach(() => _resetBookStateComparatorsForTest());

describe('8a r3 — the four-tick reseed, driving the real tracker', () => {
  it('tick 1: a healthy chain is validated and its ring holds the instrument spread', () => {
    seedHealthyChain();
    const cmp = readBookStateComparator(SYM)!;
    expect(cmp.validated).toBe(true);
    expect(cmp.seedImplausible).toBe(false);
    expect(cmp.spreads.length).toBeGreaterThan(0);
  });

  it('the collapse reads hollow WHILE the healthy reference stands', () => {
    seedHealthyChain();
    const cmp = readBookStateComparator(SYM)!;
    const r = assessBookState({
      bid: HOLLOW.bid, ask: HOLLOW.ask, last: HOLLOW.last,
      priorTwoSidedMid: cmp.priorMid, priorBid: cmp.priorBid, priorAsk: cmp.priorAsk,
      priorLast: cmp.priorLast, trailingMedianSpreadFrac: 0.004,
    }, CFG);
    expect(r.state).toBe('hollow');
  });

  it('tick 2: the yield-clear RETAINS the ring, and the hollow reseed is marked implausible', () => {
    seedHealthyChain();
    clearBookStateComparator(SYM, 'yield_after_60_hollow');
    expect(readBookStateComparator(SYM)).toBeNull();

    advanceBookStateComparator(SYM, { ...HOLLOW, atMs: 20_000 }, WINDOW, false, K_REL);
    const cmp = readBookStateComparator(SYM)!;
    // seed spread = (1000 - 7) / 503.5 ≈ 197%, retained median ≈ 0.40%, kRel × median = 1.2%.
    expect(cmp.seedImplausible).toBe(true);
    expect(cmp.validated).toBe(false);
  });

  it('⛔ tick 3: the frame DOES read two_sided against its own seed — the circularity, pinned', () => {
    seedHealthyChain();
    clearBookStateComparator(SYM, 'yield_after_60_hollow');
    advanceBookStateComparator(SYM, { ...HOLLOW, atMs: 20_000 }, WINDOW, false, K_REL);

    const cmp = readBookStateComparator(SYM)!;
    const r = assessBookState({
      bid: HOLLOW.bid, ask: HOLLOW.ask, last: HOLLOW.last,
      priorTwoSidedMid: cmp.priorMid, priorBid: cmp.priorBid, priorAsk: cmp.priorAsk,
      priorLast: cmp.priorLast, trailingMedianSpreadFrac: null,
    }, CFG);
    // MEASURED FIRST, then asserted: every departure is exactly 0 against the frame itself.
    expect(r.state).toBe('two_sided');
  });

  it('⛔ tick 3→4: that two_sided verdict must NOT promote validated — this is the r2 defect', () => {
    seedHealthyChain();
    clearBookStateComparator(SYM, 'yield_after_60_hollow');
    advanceBookStateComparator(SYM, { ...HOLLOW, atMs: 20_000 }, WINDOW, false, K_REL);
    // tick 3 advances WITH validatedByTwoSided = true, exactly as the engine would.
    advanceBookStateComparator(SYM, { ...HOLLOW, atMs: 21_583 }, WINDOW, true, K_REL);
    expect(readBookStateComparator(SYM)!.validated).toBe(false);
    // tick 4 — under r2 this is where 503.50 was booked.
    advanceBookStateComparator(SYM, { ...HOLLOW, atMs: 23_166 }, WINDOW, true, K_REL);
    expect(readBookStateComparator(SYM)!.validated).toBe(false);
    expect(engineWouldAct('two_sided')).toBe(false);
  });

  it('✅ NEGATIVE CONTROL: a HEALTHY reseed after the same clear validates immediately', () => {
    // Without this the gate could be satisfied by never validating anything, and the latch the
    // yield-clear exists to fix would come straight back.
    seedHealthyChain();
    clearBookStateComparator(SYM, 'yield_after_60_hollow');
    advanceBookStateComparator(SYM, { ...HEALTHY, atMs: 20_000 }, WINDOW, true, K_REL);
    const cmp = readBookStateComparator(SYM)!;
    expect(cmp.seedImplausible).toBe(false);
    expect(cmp.validated).toBe(true);
    expect(engineWouldAct('two_sided')).toBe(true);
  });

  it('⛔ SECOND CYCLE: a broken chain OWN ring must never become the next seed yardstick', () => {
    // Langston BLOCKER-2. r3 retained the ring UNCONDITIONALLY, so after one yield cycle the
    // retained ring WAS the broken chain: median 1.9722 ⇒ threshold max(3x1.9722, 0.01) = 5.917
    // ⇒ both side arms unreachable ⇒ the book wanders 7/1000 → 7/1200, yields again, and the
    // reseed at spread 1.977 reads PLAUSIBLE against its own predecessor ⇒ validates ⇒ 603.50.
    // Same terminal row, ~3 minutes later instead of 4.7 s.
    seedHealthyChain();
    clearBookStateComparator(SYM, 'yield_after_60_hollow');       // cycle 1: healthy ring retained
    advanceBookStateComparator(SYM, { ...HOLLOW, atMs: 20_000 }, WINDOW, false, K_REL);
    expect(readBookStateComparator(SYM)!.seedImplausible).toBe(true);

    // the book wanders and yields AGAIN; an implausible chain's ring must NOT be retained
    clearBookStateComparator(SYM, 'yield_after_60_hollow');
    advanceBookStateComparator(SYM, { bid: 7, ask: 1200, last: 247.25, atMs: 200_000 }, WINDOW, false, K_REL);
    const cmp = readBookStateComparator(SYM)!;
    // judged against the surviving HEALTHY ring (~0.40%), NOT against 7/1000's 197%
    expect(cmp.seedImplausible).toBe(true);
    expect(cmp.validated).toBe(false);

    // and it still cannot validate itself on the following tick
    advanceBookStateComparator(SYM, { bid: 7, ask: 1200, last: 247.25, atMs: 201_583 }, WINDOW, true, K_REL);
    expect(readBookStateComparator(SYM)!.validated).toBe(false);
    expect(engineWouldAct('two_sided')).toBe(false);
  });

  it('✅ and the healthy ring SURVIVES an implausible seed — it is consumed only by a plausible one', () => {
    seedHealthyChain();
    clearBookStateComparator(SYM, 'yield_after_60_hollow');
    advanceBookStateComparator(SYM, { ...HOLLOW, atMs: 20_000 }, WINDOW, false, K_REL);  // implausible: ring NOT consumed
    clearBookStateComparator(SYM, 'yield_after_60_hollow');
    advanceBookStateComparator(SYM, { ...HEALTHY, atMs: 300_000 }, WINDOW, true, K_REL); // plausible: validates
    expect(readBookStateComparator(SYM)!.seedImplausible).toBe(false);
    expect(readBookStateComparator(SYM)!.validated).toBe(true);
  });

  // ⚠⚠ RESIDUAL, PINNED NOT FIXED (Langston, 2026-09-13). r3/r4 close the YIELD-CLEAR path.
  //    They do NOT close the RESTART path: with no retained ring at all, a process that comes
  //    up mid-hollow seeds unvalidated (refused, correct), and then tick 2 SELF-COMPARES to
  //    zero departures, reads `two_sided`, and VALIDATES. The criterion must not be read as
  //    covering that case.
  it('⚠️ RESIDUAL: a restart mid-hollow still self-validates on tick 2 — pinned, not fixed', () => {
    advanceBookStateComparator(SYM, { ...HOLLOW, atMs: 1_000 }, WINDOW, false, K_REL);
    expect(readBookStateComparator(SYM)!.validated).toBe(false);   // tick 1 refused — correct
    advanceBookStateComparator(SYM, { ...HOLLOW, atMs: 2_583 }, WINDOW, true, K_REL);
    expect(readBookStateComparator(SYM)!.validated).toBe(true);    // ⛔ THE GAP, asserted as-is
  });

  // ✅ r5 — THE CONTAMINATION HALF OF THAT RESIDUAL IS NOW CLOSED, and the pin has to say so or
  //    it under-states in one direction having over-stated in the other (Langston BLOCKER-3:
  //    *the pin as written under-states the residual, so it cannot stand as the statement of it*).
  //    The restart chain still SELF-VALIDATES — that half is open, above. What it can no longer
  //    do is write its broken ring into the slot the mechanism defines as OUTSIDE, because a
  //    frozen artefact never sets `observedMovement`.
  it('✅ r5: a FROZEN restart chain can never contaminate the retained ring', () => {
    // restart mid-hollow, book frozen, then it yields
    advanceBookStateComparator(SYM, { ...HOLLOW, atMs: 1_000 }, WINDOW, false, K_REL);
    advanceBookStateComparator(SYM, { ...HOLLOW, atMs: 2_583 }, WINDOW, true, K_REL);
    expect(readBookStateComparator(SYM)!.observedMovement).toBe(false);
    clearBookStateComparator(SYM, 'yield_after_60_hollow');

    // the next seed has NO retained ring to be judged against — the broken one was not kept
    advanceBookStateComparator(SYM, { bid: 7, ask: 1200, last: 247.25, atMs: 200_000 }, WINDOW, false, K_REL);
    expect(readBookStateComparator(SYM)!.seedImplausible).toBe(false); // vacuous, no ring — stated, not hidden
    expect(readBookStateComparator(SYM)!.observedMovement).toBe(false);
  });

  it('✅ r5: a chain that DID move still retains — the gate is movement, not paranoia', () => {
    seedHealthyChain();                                    // a live book: five frames that MOVE
    expect(readBookStateComparator(SYM)!.observedMovement).toBe(true);
    clearBookStateComparator(SYM, 'yield_after_60_hollow');
    advanceBookStateComparator(SYM, { ...HOLLOW, atMs: 20_000 }, WINDOW, false, K_REL);
    expect(readBookStateComparator(SYM)!.seedImplausible).toBe(true); // judged against the kept ring
  });

  it('⚠️ RESIDUAL, SAME CLASS, REACHED A DIFFERENT WAY: a perfectly FROZEN healthy book never retains', () => {
    // Not a defect of the gate — a consequence of it, and the honest statement of its reach.
    // A book quoting the identical two sides for the whole chain is indistinguishable, BY THIS
    // DISCRIMINATOR, from a frozen artefact. Its ring is not kept, so a later seed is judged
    // against nothing and gets the vacuous `seedImplausible = false`.
    // ✅ It cannot CONTAMINATE (nothing broken is retained either) — but it does NOT REFUSE.
    for (let i = 0; i < 5; i++) {
      advanceBookStateComparator(SYM, { ...HEALTHY, atMs: 1_000 + i * 1_583 }, WINDOW, true, K_REL);
    }
    expect(readBookStateComparator(SYM)!.observedMovement).toBe(false);
    clearBookStateComparator(SYM, 'yield_after_60_hollow');
    advanceBookStateComparator(SYM, { ...HOLLOW, atMs: 20_000 }, WINDOW, false, K_REL);
    expect(readBookStateComparator(SYM)!.seedImplausible).toBe(false); // ⛔ vacuous, asserted as-is
  });

  // ⛔⛔ BLOCKER-4, PINNED AS A TEST RATHER THAN GATED — LANGSTON HAS RULED r5 THE LAST GATE.
  //    Retention happens AT A YIELD, and a yield is proof the reference was unusable; the only
  //    datum from outside is the previous ring; so GENESIS MUST COME FROM SOME YIELDING CHAIN.
  //    A seedJudgedPlausible gate would make the mechanism permanently INERT — the original
  //    deadlock shape this guard already died of once. A SEVENTH positive property fails the same way.
  //
  //    THE HOLE: observedMovement is EARNED on frame 2 of a COLD-SEEDED hollow chain, by that
  //    chain own broken ring — the contaminated median puts both side arms out of reach, so the
  //    book keeps advancing and earns the flag it should not have.
  // ★ MOVEMENT IS A PROPERTY OF THE FEED, NOT OF PLAUSIBILITY. A stub-ask book with a live bid
  //   is the CANONICAL half-hollow shape; FROZEN was the CRM instance, not the class.
  it('⛔ RESIDUAL (BLOCKER-4): a cold hollow seed earns movement from one jiggle, and the ring contaminates', () => {
    // cold start mid-hollow — vacuously plausible, nothing to judge it against
    advanceBookStateComparator(SYM, { bid: 7.00, ask: 1000, last: 247.25, atMs: 1_000 }, WINDOW, false, K_REL);
    expect(readBookStateComparator(SYM)!.seedImplausible).toBe(false);

    // ONE CENT on the live side, stub ask unchanged — the canonical half-hollow shape
    advanceBookStateComparator(SYM, { bid: 7.01, ask: 1000, last: 247.25, atMs: 2_583 }, WINDOW, true, K_REL);
    expect(readBookStateComparator(SYM)!.observedMovement).toBe(true);   // ⛔ earned by a broken book

    // it yields; r5 gate lets that ring through because BOTH its conditions are satisfied
    clearBookStateComparator(SYM, 'yield_after_60_hollow');
    advanceBookStateComparator(SYM, { bid: 7.00, ask: 1000, last: 247.25, atMs: 200_000 }, WINDOW, false, K_REL);
    expect(readBookStateComparator(SYM)!.seedImplausible).toBe(false);   // ⛔ THE HOLE, asserted as-is
  });

  it('✅ a cold start with NO retained ring still seeds — the ring is evidence, not a precondition', () => {
    // First frame ever for a symbol: nothing retained, so nothing to judge against. It seeds
    // unvalidated (which the engine refuses for one tick) rather than being marked implausible.
    advanceBookStateComparator(SYM, { ...HOLLOW, atMs: 1_000 }, WINDOW, false, K_REL);
    const cmp = readBookStateComparator(SYM)!;
    expect(cmp.seedImplausible).toBe(false);
    expect(cmp.validated).toBe(false);
  });

  // ⚠️ RESIDUAL, PINNED NOT CLAIMED (Langston, 2026-09-13): this arm is UNREACHABLE IN
  //    PRODUCTION — `resolveBookStateConfigSync` throwing exits at `aee` `knobs_missing` BEFORE
  //    the advance is reached. It is DEFENSIVE ONLY and nobody may cite it as a live control.
  it('⚠️ defensive only — an UNREADABLE kRel fails safe (unreachable in production)', () => {
    seedHealthyChain();
    clearBookStateComparator(SYM, 'yield_after_60_hollow');
    advanceBookStateComparator(SYM, { ...HEALTHY, atMs: 20_000 }, WINDOW, true, null);
    expect(readBookStateComparator(SYM)!.seedImplausible).toBe(true);
    expect(readBookStateComparator(SYM)!.validated).toBe(false);
  });
});
