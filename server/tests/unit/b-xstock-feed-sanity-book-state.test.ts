/**
 * B-XSTOCK-FEED-SANITY (#943) — the book-state predicate, on FIXTURES DRAWN FROM THE REAL ROWS.
 *
 * The fixtures are the closes that carry `exit_decision_price` (audit §A.11): the price that DROVE
 * each exit against the archived two-sided frame before it. A hollow fixture must read `hollow`; a
 * session-body fixture must read `two_sided`; a genuine both-sides move must read `two_sided`; a
 * `bid = 0` frame must read `hollow` on the absent-bid branch; no comparator must read `unknown`.
 *
 * ★ EVERY THRESHOLD IS MUTATION-PROVED: a boundary fixture flips exactly when its knob moves. A
 * control that cannot fire is the defect it guards.
 */
import { describe, it, expect } from 'vitest';
import { assessBookState, medianOf, BOOK_STATE_KNOBS, BOOK_STATE_SEED, type BookStateConfig, type BookStateInput } from '../../asset_classes/xstock_spot/book-state.js';

const CFG: BookStateConfig = {
  enabled: true, kRel: 3, floorPct: 1.0, otherSideHoldPct: 0.5, lastHoldPct: 0.5, trailingSpreadWindowSnaps: 20,
  feedReadEnabled: false, feedStubFractionF: 0.10, feedStubWindowMs: 90_000, feedCohortFloor: 50, hollowSkipCap: 60,
  ownMarkDeviationDPct: 5,
};

function frame(now: { bid: number | null; ask: number | null; last: number | null }, prior: { bid: number; ask: number; last: number | null } | null): BookStateInput {
  const mid = prior ? (prior.bid + prior.ask) / 2 : null;
  return {
    bid: now.bid, ask: now.ask, last: now.last,
    priorTwoSidedMid: mid, priorBid: prior?.bid ?? null, priorAsk: prior?.ask ?? null, priorLast: prior?.last ?? null,
    trailingMedianSpreadFrac: prior && mid ? (prior.ask - prior.bid) / mid : null,
  };
}

describe('B-XSTOCK-FEED-SANITY — assessBookState on the real handoff rows (decision price reconstructed on the departed side)', () => {
  // NOW/USD stop_hit 2026-08-29 00:15:00 — decision 118.75; archived frame 143.2 / 143.3 / last 143.2 (audit §A.11).
  it('NOW: a collapsed bid under a held ask and last reads hollow:bid_collapsed', () => {
    const r = assessBookState(frame({ bid: 94.2, ask: 143.3, last: 143.2 }, { bid: 143.2, ask: 143.3, last: 143.2 }), CFG);
    expect(r.state).toBe('hollow'); expect(r.reasons).toContain('bid_collapsed');
  });
  // TGT/USD stop_hit 2026-08-29 00:15:01 — decision 106.075; witness 157 / 167.
  it('TGT: the same shape at a 53 % departure', () => {
    const r = assessBookState(frame({ bid: 45.15, ask: 167, last: 160 }, { bid: 157, ask: 167, last: 160 }), CFG);
    expect(r.state).toBe('hollow'); expect(r.reasons).toContain('bid_collapsed');
  });
  // WEN/USD target_hit 2026-08-29 00:15:03 — decision 13.31; witness 7.7 / 8.36. The ASK arm.
  it('WEN: a spiked ask under a held bid and last reads hollow:ask_spiked (a target hit on a hollow ask)', () => {
    const r = assessBookState(frame({ bid: 7.7, ask: 18.92, last: 8.0 }, { bid: 7.7, ask: 8.36, last: 8.0 }), CFG);
    expect(r.state).toBe('hollow'); expect(r.reasons).toContain('ask_spiked');
  });
  // MOH/USD target_hit 2026-08-27 00:15:02 — decision 281.025, filled 219.8; archived 198.23 / 207.0 / 202.43.
  it('MOH: decided at 281 and filled at 219.8 — the ask arm again', () => {
    const r = assessBookState(frame({ bid: 198.23, ask: 363.82, last: 202.43 }, { bid: 198.23, ask: 207.0, last: 202.43 }), CFG);
    expect(r.state).toBe('hollow'); expect(r.reasons).toContain('ask_spiked');
  });
  // CTVA/USD 2026-09-03 00:15Z (Langston's re-run): a 63 % bid drop.
  it('CTVA: a 63 % bid drop reads hollow', () => {
    const r = assessBookState(frame({ bid: 30.0, ask: 81.0, last: 80.9 }, { bid: 80.8, ask: 81.0, last: 80.9 }), CFG);
    expect(r.state).toBe('hollow');
  });
});

describe('B-XSTOCK-FEED-SANITY — what must NOT read hollow', () => {
  // CRM/USD stop_hit 2026-08-27 11:25:40 — a session-body close the archive reproduces at 0 % gap.
  it('CRM (body): a tight two-sided book that barely moved reads two_sided', () => {
    const r = assessBookState(frame({ bid: 226.65, ask: 226.78, last: 226.7 }, { bid: 226.6, ask: 226.8, last: 226.7 }), CFG);
    expect(r.state).toBe('two_sided');
  });
  it('a genuine move — both sides and last down together, spread unchanged — reads two_sided', () => {
    const r = assessBookState(frame({ bid: 97.0, ask: 97.1, last: 97.05 }, { bid: 100.0, ask: 100.1, last: 100.05 }), CFG);
    expect(r.state).toBe('two_sided');
  });
  it('a genuine move with a wider spread but both sides down reads two_sided (a re-quote is not a hollow)', () => {
    const r = assessBookState(frame({ bid: 96.0, ask: 98.0, last: 97.0 }, { bid: 100.0, ask: 100.2, last: 100.1 }), CFG);
    expect(r.state).toBe('two_sided');
  });
  it('a constructed two-sided 0.05 % book with no departure reads two_sided', () => {
    const r = assessBookState(frame({ bid: 99.975, ask: 100.025, last: 100.0 }, { bid: 99.97, ask: 100.03, last: 100.0 }), CFG);
    expect(r.state).toBe('two_sided');
  });
  it('no comparator yet reads unknown (undecidable, never hollow, never two_sided)', () => {
    const r = assessBookState(frame({ bid: 100, ask: 100.1, last: 100.05 }, null), CFG);
    expect(r.state).toBe('unknown'); expect(r.reasons).toContain('no_comparator');
  });
});

describe('B-XSTOCK-FEED-SANITY — the absent-bid branch (P-B) and the deviation floor (iii)', () => {
  it('bid = 0 reads hollow:absent_bid even with a comparator and a held ask', () => {
    const r = assessBookState(frame({ bid: 0, ask: 100.1, last: 100.05 }, { bid: 100, ask: 100.1, last: 100.05 }), CFG);
    expect(r.state).toBe('hollow'); expect(r.reasons).toEqual(['absent_bid']);
  });
  it('bid absent (null) reads hollow:absent_bid — never a fall-through to last', () => {
    const r = assessBookState(frame({ bid: null, ask: null, last: 100.05 }, { bid: 100, ask: 100.1, last: 100.05 }), CFG);
    expect(r.state).toBe('hollow'); expect(r.reasons).toEqual(['absent_bid']);
  });
  it('(iii): a 5.8 % mid departure with the sides moving in OPPOSITE directions reads hollow:mark_deviation', () => {
    const r = assessBookState(frame({ bid: 99.3, ask: 112.5, last: 100.1 }, { bid: 100.0, ask: 100.2, last: 100.1 }), CFG);
    expect(r.state).toBe('hollow'); expect(r.reasons).toContain('mark_deviation');
  });
});

describe('B-XSTOCK-FEED-SANITY — every threshold is mutation-proved (one boundary fixture flips per knob)', () => {
  const prior = { bid: 100.0, ask: 100.1, last: 100.05 }; // trailing spread 0.1 % ⇒ threshold = max(3×0.1 %, 1 %) = 1 %
  it('floor_pct: a 1.2 % bid drop is hollow at floor 1 % and two_sided at floor 2 %', () => {
    const f = frame({ bid: 98.85, ask: 100.1, last: 100.05 }, prior); // bid departure from mid 100.05 = 1.2 %
    expect(assessBookState(f, CFG).state).toBe('hollow');
    expect(assessBookState(f, { ...CFG, floorPct: 2.0 }).state).toBe('two_sided');
  });
  it('k_rel: with a 0.5 % trailing spread, a 1.2 % drop is hollow at k=2 (1.0 %) and two_sided at k=3 (1.5 %)', () => {
    const wide = { bid: 99.8, ask: 100.3, last: 100.05 }; // 0.5 % spread on mid 100.05
    const f = frame({ bid: 98.85, ask: 100.3, last: 100.05 }, wide);
    expect(assessBookState(f, { ...CFG, kRel: 2 }).state).toBe('hollow');
    expect(assessBookState(f, { ...CFG, kRel: 3 }).state).toBe('two_sided');
  });
  it('other_side_hold_pct: an ask that moved 0.4 % is "held" at 0.5 % (hollow) and not at 0.3 % (two_sided)', () => {
    const f = frame({ bid: 94.0, ask: 100.5, last: 100.05 }, prior); // ask moved +0.4 % vs prior ask 100.1
    expect(assessBookState(f, CFG).state).toBe('hollow');
    expect(assessBookState(f, { ...CFG, otherSideHoldPct: 0.3 }).state).toBe('two_sided');
  });
  it('last_hold_pct: a last that moved 0.4 % is "held" at 0.5 % (hollow) and not at 0.3 % (two_sided)', () => {
    const f = frame({ bid: 94.0, ask: 100.1, last: 100.45 }, prior); // last moved +0.4 %
    expect(assessBookState(f, CFG).state).toBe('hollow');
    expect(assessBookState(f, { ...CFG, lastHoldPct: 0.3 }).state).toBe('two_sided');
  });
  it('own_mark_deviation_d_pct: the 5.8 % opposite-sides fixture flips at D = 7', () => {
    const f = frame({ bid: 99.3, ask: 112.5, last: 100.1 }, { bid: 100.0, ask: 100.2, last: 100.1 });
    expect(assessBookState(f, CFG).state).toBe('hollow');
    expect(assessBookState(f, { ...CFG, ownMarkDeviationDPct: 7 }).state).toBe('two_sided');
  });
  it('feed read (ii): INERT by knob; enabled + below the cohort floor stays inert; enabled + burst reads hollow', () => {
    const f = { ...frame({ bid: 100, ask: 100.1, last: 100.05 }, prior), feedStubFraction: 0.5, feedCohortN: 400 };
    expect(assessBookState(f, CFG).state).toBe('two_sided'); // feedReadEnabled false
    expect(assessBookState({ ...f, feedCohortN: 10 }, { ...CFG, feedReadEnabled: true }).reasons).toContain('feed_read_inert');
    expect(assessBookState(f, { ...CFG, feedReadEnabled: true }).state).toBe('hollow');
    expect(assessBookState({ ...f, feedStubFraction: 0.05 }, { ...CFG, feedReadEnabled: true }).state).toBe('two_sided');
  });
});

describe('B-XSTOCK-FEED-SANITY — the one list', () => {
  it('BOOK_STATE_KNOBS has exactly twelve names and the seed covers each once', () => {
    expect(BOOK_STATE_KNOBS.length).toBe(12);
    expect(new Set(BOOK_STATE_KNOBS).size).toBe(12);
    for (const k of BOOK_STATE_KNOBS) expect(typeof BOOK_STATE_SEED[k]).toBe('number');
    expect(Object.keys(BOOK_STATE_SEED).length).toBe(12);
  });
  it('medianOf: odd, even, empty', () => {
    expect(medianOf([3, 1, 2])).toBe(2); expect(medianOf([4, 1, 3, 2])).toBe(2.5); expect(medianOf([])).toBeNull();
  });
});

/**
 * ⛔⛔ THE DEADLOCK REGRESSION — THE ONE PATH THE ORIGINAL SUITE NEVER RAN.
 *
 * As first shipped the engine advanced the comparator ONLY on a `two_sided` verdict, while the
 * predicate returns `unknown`/`no_comparator` whenever the comparator is absent. `two_sided` was
 * therefore unreachable, the comparator never seeded, and the guard was INERT — measured on
 * staging 2026-09-03: zero `COMPARATOR_SEEDED` in 34 minutes with five open positions and the
 * exit loop demonstrably running.
 *
 * ★ WHY THE SUITE ABOVE MISSED IT: every fixture is built by `frame(now, prior)` WITH a prior. The
 * single no-comparator case asserts `unknown` and stops — it never asks "and then what?". A test
 * that always supplies the state under test cannot discover that the state is never created.
 * ⇒ THIS TEST DRIVES THE CYCLE, not a single verdict.
 */
describe('B-XSTOCK-FEED-SANITY — the seeding cycle CLOSES (deadlock regression)', () => {
  const healthy = { bid: 99.5, ask: 100.5, last: 100.0 };

  it('first call has no comparator and reads unknown/no_comparator', () => {
    const r = assessBookState(frame(healthy, null), CFG);
    expect(r.state).toBe('unknown');
    expect(r.reasons).toContain('no_comparator');
  });

  it('⛔ THE REGRESSION: a seed rule gated ONLY on two_sided never fires, so the cycle never closes', () => {
    const first = assessBookState(frame(healthy, null), CFG);
    const oldRuleWouldSeed = first.state === 'two_sided';           // the shipped condition
    expect(oldRuleWouldSeed).toBe(false);                            // ⇒ inert, forever
  });

  it('✅ THE FIX: seeding on no_comparator closes the cycle — the NEXT verdict is two_sided', () => {
    const first = assessBookState(frame(healthy, null), CFG);
    const newRuleWouldSeed =
      first.state === 'two_sided' ||
      (first.state === 'unknown' && first.reasons.includes('no_comparator'));
    expect(newRuleWouldSeed).toBe(true);

    // seed from that frame, then re-assess against it — the guard must now be able to judge
    const second = assessBookState(frame({ bid: 99.4, ask: 100.4, last: 100.0 }, healthy), CFG);
    expect(second.state).toBe('two_sided');
  });

  // ⛔⛔ THIS TEST USED TO CLAIM "a hollow frame is still never seedable" AND IT WAS VACUOUS.
  // Its fixture passed `healthy` as the PRIOR — so `bid_collapsed` fired and it of course read
  // `hollow`. But THE SEEDING PATH IS `prior = null`, and that case was never run. It is verbatim
  // the failure this same file diagnoses twelve lines above — *a test that always supplies the
  // state under test cannot discover that the state is never created* — reproduced four `it`s
  // later, in the regression suite written to catch it. (Langston, Step-8, 2026-09-03.)
  it('⛔ THE DEFECT, NAMED: a collapsed-but-positive book with NO PRIOR **is** seedable', () => {
    const collapsedNoPrior = assessBookState(frame({ bid: 80.0, ask: 100.5, last: 100.0 }, null), CFG);
    // it does NOT read hollow — every comparator-dependent arm is unreachable without a prior
    expect(collapsedNoPrior.state).toBe('unknown');
    expect(collapsedNoPrior.reasons).toContain('no_comparator');
    const wouldSeed =
      collapsedNoPrior.state === 'two_sided' ||
      (collapsedNoPrior.state === 'unknown' && collapsedNoPrior.reasons.includes('no_comparator'));
    expect(wouldSeed).toBe(true); // ⇒ a hollow-SHAPED frame becomes the reference
  });

  it('CONTROL: the SAME frame WITH a prior reads hollow — so the fixture is the whole difference', () => {
    const collapsedWithPrior = assessBookState(frame({ bid: 80.0, ask: 100.5, last: 100.0 }, healthy), CFG);
    expect(collapsedWithPrior.state).toBe('hollow');
    expect(collapsedWithPrior.reasons).toContain('bid_collapsed');
    // ⇒ the retired assertion was true of THIS fixture and false of the path it claimed to cover.
  });

  it('⛔ AND THE CONSEQUENCE IS A LATCH: a bad seed makes a HEALTHY book read hollow', () => {
    const badSeed = { bid: 80.0, ask: 100.5, last: 100.0 };   // priorMid 90.25
    const recovered = assessBookState(frame(healthy, badSeed), CFG); // 99.5/100.5, mid 100.0
    expect(recovered.state).toBe('hollow');
    expect(recovered.reasons).toContain('mark_deviation');
    // ⇒ without the yield-clears-the-reference fix the engine can never replace this reference:
    //   the hollow branch `continue`s and the yield path falls through, so the advance is
    //   unreachable for as long as the bad seed stands. That is the latch, not a transient.
  });

  it('✅ an ABSENT side is hollow, not no_comparator — so it can never seed either', () => {
    const noBid = assessBookState(frame({ bid: null, ask: 100.5, last: 100.0 }, null), CFG);
    expect(noBid.state).toBe('hollow');
    expect(noBid.reasons).toContain('absent_bid');
  });
});

/**
 * ⛔ THE WRITER'S OWN INVARIANT, EXERCISED — not asserted from source text (Langston condition 1).
 * A crossed frame (bid > ask) reads `unknown`/`no_comparator` and is therefore seedable at the
 * call site. The refusal lives in the writer so every caller inherits it.
 */
describe('B-XSTOCK-FEED-SANITY — the writer refuses a crossed book (behavioural)', () => {
  it('a crossed frame does NOT become the reference', async () => {
    const { advanceBookStateComparator, readBookStateComparator, _resetBookStateComparatorsForTest } =
      await import('../../asset_classes/xstock_spot/book-state-tracker.js');
    _resetBookStateComparatorsForTest();
    advanceBookStateComparator('XX/USD', { bid: 101, ask: 99, last: 100, atMs: Date.now() }, 20);
    expect(readBookStateComparator('XX/USD')).toBeNull();
  });
  it('CONTROL: an uncrossed frame DOES become the reference — so the refusal is not vacuous', async () => {
    const { advanceBookStateComparator, readBookStateComparator, _resetBookStateComparatorsForTest } =
      await import('../../asset_classes/xstock_spot/book-state-tracker.js');
    _resetBookStateComparatorsForTest();
    advanceBookStateComparator('YY/USD', { bid: 99, ask: 101, last: 100, atMs: Date.now() }, 20);
    const c = readBookStateComparator('YY/USD');
    expect(c).not.toBeNull();
    expect(c!.priorMid).toBe(100);
    expect(c!.spreads.every((x) => x >= 0)).toBe(true);
  });
});

/**
 * ⛔⛔ THE YIELD DROPS THE REFERENCE — the fix for the LATCH Langston found at Step 8.
 * A bad seed makes healthy books read `mark_deviation` forever, and BOTH engine exits bypass the
 * advance (the hollow branch `continue`s, the yield path falls through), so the comparator could
 * never be replaced without a restart. These are BEHAVIOURAL — they call the writer and read the
 * state back — because a regex on the call site is the weakness that shipped `F-CROSSED` blind.
 */
describe('B-XSTOCK-FEED-SANITY — a bad seed cannot latch (behavioural)', () => {
  it('clearBookStateComparator drops the reference so the next frame re-seeds', async () => {
    const { advanceBookStateComparator, clearBookStateComparator, readBookStateComparator, _resetBookStateComparatorsForTest } =
      await import('../../asset_classes/xstock_spot/book-state-tracker.js');
    _resetBookStateComparatorsForTest();
    // seed on a COLLAPSED book — the shape that reads `unknown/no_comparator` and is seedable
    advanceBookStateComparator('ZZ/USD', { bid: 80.0, ask: 100.5, last: 100.0, atMs: 1_000 }, 20);
    expect(readBookStateComparator('ZZ/USD')!.priorMid).toBeCloseTo(90.25, 5);
    clearBookStateComparator('ZZ/USD', 'yield_after_60_hollow');
    expect(readBookStateComparator('ZZ/USD')).toBeNull();
    // the next frame re-seeds, on a healthy book this time
    advanceBookStateComparator('ZZ/USD', { bid: 99.5, ask: 100.5, last: 100.0, atMs: 2_000 }, 20);
    expect(readBookStateComparator('ZZ/USD')!.priorMid).toBeCloseTo(100.0, 5);
  });

  it('CONTROL: without the clear the reference SURVIVES — so the drop is not vacuous', async () => {
    const { advanceBookStateComparator, readBookStateComparator, _resetBookStateComparatorsForTest } =
      await import('../../asset_classes/xstock_spot/book-state-tracker.js');
    _resetBookStateComparatorsForTest();
    advanceBookStateComparator('ZZ/USD', { bid: 80.0, ask: 100.5, last: 100.0, atMs: 1_000 }, 20);
    expect(readBookStateComparator('ZZ/USD')).not.toBeNull();
    expect(readBookStateComparator('ZZ/USD')!.priorMid).toBeCloseTo(90.25, 5);
  });

  it('clearing a symbol that has no reference is a no-op, not a throw', async () => {
    const { clearBookStateComparator, readBookStateComparator, _resetBookStateComparatorsForTest } =
      await import('../../asset_classes/xstock_spot/book-state-tracker.js');
    _resetBookStateComparatorsForTest();
    expect(() => clearBookStateComparator('NOPE/USD', 'yield')).not.toThrow();
    expect(readBookStateComparator('NOPE/USD')).toBeNull();
  });

  it('the SEED is labelled unvalidated, and only a two_sided advance validates it', async () => {
    const { advanceBookStateComparator, readBookStateComparator, _resetBookStateComparatorsForTest } =
      await import('../../asset_classes/xstock_spot/book-state-tracker.js');
    _resetBookStateComparatorsForTest();
    advanceBookStateComparator('WW/USD', { bid: 99.5, ask: 100.5, last: 100.0, atMs: 1_000 }, 20);
    const seed = readBookStateComparator('WW/USD')!;
    expect(seed.validated).toBe(false);          // the cold-start frame was judged against nothing
    expect(seed.framesSinceSeed).toBe(0);
    expect(seed.seededAtMs).toBe(1_000);

    advanceBookStateComparator('WW/USD', { bid: 99.6, ask: 100.6, last: 100.1, atMs: 2_000 }, 20, true);
    const validated = readBookStateComparator('WW/USD')!;
    expect(validated.validated).toBe(true);
    expect(validated.framesSinceSeed).toBe(1);
    expect(validated.seededAtMs).toBe(1_000);    // the chain's origin survives validation

    // and validation STICKS across a later unvalidated advance within the same chain
    advanceBookStateComparator('WW/USD', { bid: 99.7, ask: 100.7, last: 100.2, atMs: 3_000 }, 20, false);
    expect(readBookStateComparator('WW/USD')!.validated).toBe(true);
  });

  it('CONTROL: a fresh chain after a clear is unvalidated again — validation does not survive the drop', async () => {
    const { advanceBookStateComparator, clearBookStateComparator, readBookStateComparator, _resetBookStateComparatorsForTest } =
      await import('../../asset_classes/xstock_spot/book-state-tracker.js');
    _resetBookStateComparatorsForTest();
    advanceBookStateComparator('VV/USD', { bid: 99.5, ask: 100.5, last: 100.0, atMs: 1_000 }, 20, true);
    expect(readBookStateComparator('VV/USD')!.validated).toBe(true);
    clearBookStateComparator('VV/USD', 'yield_after_60_hollow');
    advanceBookStateComparator('VV/USD', { bid: 80.0, ask: 100.5, last: 100.0, atMs: 4_000 }, 20);
    const reseeded = readBookStateComparator('VV/USD')!;
    expect(reseeded.validated).toBe(false);
    expect(reseeded.seededAtMs).toBe(4_000);
  });
});
