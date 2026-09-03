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
