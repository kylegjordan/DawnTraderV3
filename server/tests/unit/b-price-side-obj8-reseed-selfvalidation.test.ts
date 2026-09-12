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

/** Build the healthy chain that precedes the collapse, as the live path would. */
function seedHealthyChain(atMs = 1_000): void {
  for (let i = 0; i < 5; i++) {
    advanceBookStateComparator(SYM, { ...HEALTHY, atMs: atMs + i * 1_583 }, WINDOW, true, K_REL);
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

  it('✅ a cold start with NO retained ring still seeds — the ring is evidence, not a precondition', () => {
    // First frame ever for a symbol: nothing retained, so nothing to judge against. It seeds
    // unvalidated (which the engine refuses for one tick) rather than being marked implausible.
    advanceBookStateComparator(SYM, { ...HOLLOW, atMs: 1_000 }, WINDOW, false, K_REL);
    const cmp = readBookStateComparator(SYM)!;
    expect(cmp.seedImplausible).toBe(false);
    expect(cmp.validated).toBe(false);
  });

  it('⛔ an UNREADABLE kRel fails safe — the seed is implausible, never validated', () => {
    seedHealthyChain();
    clearBookStateComparator(SYM, 'yield_after_60_hollow');
    advanceBookStateComparator(SYM, { ...HEALTHY, atMs: 20_000 }, WINDOW, true, null);
    expect(readBookStateComparator(SYM)!.seedImplausible).toBe(true);
    expect(readBookStateComparator(SYM)!.validated).toBe(false);
  });
});
