import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildLevelBasis,
  getLevelBasisFunnelRow,
  priceForLevelRole,
  recordLevelBasisOutcome,
  getLevelBasisFunnel,
  __resetLevelBasisFunnelForTest,
  type LevelBasis,
  type LevelRole,
  type LevelBasisRefusal,
} from '../../core/calculations/level-basis.js';

/**
 * B-PRICE-SIDE-BY-JOB OBJ-3a — the level basis.
 *
 * ⛔ EVERY TEST HERE IS WRITTEN TO FAIL IF THE DEFECT IS PUT BACK. A test that passes on
 * both the fixed and the broken code is a fence that was never mutation-proved, and this
 * batch's sibling shipped exactly that: a guard certified by a comment that nothing ever
 * executed.
 */

const OK_BOOK = { bid: 100, ask: 102, capturedAtMs: 1_000_000, producer: 'kraken_ws_book' };
const NOW = 1_000_500;
/** Generous by design: the age tests set their own ceiling explicitly. */
const MAX_AGE = 5_000;
/** Generous by design: the plausibility tests set their own ceiling explicitly. */
const MAX_SPREAD = 0.50;

function basisOrThrow(): LevelBasis {
  const r = buildLevelBasis(OK_BOOK, NOW, MAX_AGE, MAX_SPREAD);
  if (!r.ok || !r.basis) throw new Error(`expected a basis, got ${r.reason}`);
  return r.basis;
}

describe('buildLevelBasis — acceptance and the age clause', () => {
  it('accepts a two-sided book and carries both sides', () => {
    const b = basisOrThrow();
    expect(b.bid).toBe(100);
    expect(b.ask).toBe(102);
  });

  it('STATES THE AGE at the site rather than leaving it unbounded', () => {
    // The age clause is the whole of Langston's amendment 1. A basis that cannot say how
    // old it is may not anchor a level.
    expect(basisOrThrow().ageMs).toBe(500);
    expect(basisOrThrow().capturedAtMs).toBe(1_000_000);
  });

  it('REFUSES a book with no capture time — the age clause fails CLOSED, not open', () => {
    // If this ever returns ok:true, an unbounded-age basis can anchor a level, which is
    // exactly "a memory, not an anchor".
    const r = buildLevelBasis({ ...OK_BOOK, capturedAtMs: null }, NOW, MAX_AGE, MAX_SPREAD);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe<LevelBasisRefusal>('age_unknown');
  });

  it('carries the producer through, so a level keeps its provenance', () => {
    expect(basisOrThrow().producer).toBe('kraken_ws_book');
  });
});

describe('buildLevelBasis — it REFUSES, it never falls back to the mid (BLOCKER-2)', () => {
  const cases: Array<[string, Parameters<typeof buildLevelBasis>[0], LevelBasisRefusal]> = [
    ['no book at all', { ...OK_BOOK, bid: null, ask: null }, 'no_book'],
    ['bid only', { ...OK_BOOK, ask: null }, 'one_sided_book'],
    ['ask only', { ...OK_BOOK, bid: null }, 'one_sided_book'],
    ['zero bid', { ...OK_BOOK, bid: 0 }, 'non_finite_side'],
    ['negative ask', { ...OK_BOOK, ask: -1 }, 'non_finite_side'],
    ['NaN bid', { ...OK_BOOK, bid: Number.NaN }, 'non_finite_side'],
    ['crossed book', { ...OK_BOOK, bid: 103, ask: 102 }, 'crossed_book'],
    ['locked book', { ...OK_BOOK, bid: 102, ask: 102 }, 'locked_or_synthetic_book'],
  ];

  for (const [name, input, expected] of cases) {
    it(`refuses ${name} with reason ${expected}, and returns NO basis`, () => {
      const r = buildLevelBasis(input, NOW, MAX_AGE, MAX_SPREAD);
      expect(r.ok).toBe(false);
      expect(r.reason).toBe(expected);
      // ⛔ THE LOAD-BEARING HALF: a refusal must not hand back a usable price. If a basis
      // ever came back here, `?? mid` would have been reintroduced by the back door.
      expect(r.basis).toBeUndefined();
    });
  }

  it('a one-sided book is NOT rescued by inventing the missing side', () => {
    // The hollow books B-XSTOCK-FEED-SANITY measured are exactly this shape.
    const r = buildLevelBasis({ ...OK_BOOK, bid: 100, ask: null }, NOW, MAX_AGE, MAX_SPREAD);
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain('101'); // no fabricated mid anywhere in the result
  });

  it('⛔ a FABRICATED book from the price cache (both sides = the mark) refuses as SYNTHETIC, not crossed', () => {
    // price-cache.ts:408-409 writes `bid: existing?.bid ?? price` — on a first write both sides
    // become the mark. A reader told "crossed" would go looking at the venue; the fault is ours.
    const r = buildLevelBasis({ bid: 250, ask: 250, capturedAtMs: 1_000_000, producer: 'kraken_ws' }, NOW, MAX_AGE, MAX_SPREAD);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe<LevelBasisRefusal>('locked_or_synthetic_book');
    expect(r.basis).toBeUndefined();
  });

  it('reports the STRUCTURAL fault first: a crossed book with no capture time reads crossed_book', () => {
    // Ordering is load-bearing — the two reasons send a reader to different places.
    const r = buildLevelBasis({ bid: 103, ask: 102, capturedAtMs: null, producer: 'x' }, NOW, MAX_AGE, MAX_SPREAD);
    expect(r.reason).toBe<LevelBasisRefusal>('crossed_book');
  });
});

describe('priceForLevelRole — per leg AND per execution intent (BLOCKER-1)', () => {
  it('a TAKER entry lifts the ASK', () => {
    expect(priceForLevelRole(basisOrThrow(), 'entry_taker')).toBe(102);
  });

  it('a RESTING MAKER entry is a BID — this is the arm "ask for entry" got wrong', () => {
    // active-execution-engine.ts:3839 rests the promotion at signal.entryPrice. A resting
    // buy limit is filled by a seller crossing into it; it never lifts an ask.
    expect(priceForLevelRole(basisOrThrow(), 'entry_maker_resting')).toBe(100);
  });

  it('stop and target are SELLS for a long, so both sit on the BID', () => {
    expect(priceForLevelRole(basisOrThrow(), 'stop')).toBe(100);
    expect(priceForLevelRole(basisOrThrow(), 'target')).toBe(100);
  });

  it('THE TWO ENTRY ARMS ARE A FULL SPREAD APART, not half — the error this batch corrects', () => {
    const b = basisOrThrow();
    const taker = priceForLevelRole(b, 'entry_taker');
    const maker = priceForLevelRole(b, 'entry_maker_resting');
    expect(taker - maker).toBe(b.ask - b.bid);
  });

  it('a taker entry and its stop are OPPOSITE BY CONSTRUCTION', () => {
    const b = basisOrThrow();
    expect(priceForLevelRole(b, 'entry_taker')).toBe(b.ask);
    expect(priceForLevelRole(b, 'stop')).toBe(b.bid);
  });

  it('⛔ NO ROLE RETURNS THE MIDPOINT — the mid is unreachable from this function', () => {
    // The whole batch is that a level must never be built on a mid. This asserts the
    // property directly rather than trusting the switch to have no fourth branch.
    const b = basisOrThrow();
    const roles: LevelRole[] = ['entry_taker', 'entry_maker_resting', 'stop', 'target'];
    for (const role of roles) {
      expect(priceForLevelRole(b, role)).not.toBe(b.mid);
    }
  });

  it('carries the mid for telemetry, but it is never equal to a level here', () => {
    expect(basisOrThrow().mid).toBe(101);
  });

  it('throws rather than defaulting when handed an unknown role', () => {
    // A future role must be given a SIDE, not silently inherit one.
    expect(() => priceForLevelRole(basisOrThrow(), 'entry_short' as unknown as LevelRole)).toThrow();
  });
});

const KEY = { lane: 'active' as const, assetClass: 'crypto_spot' };

describe('the refusal funnel — and its POSITIVE CONTROL', () => {
  beforeEach(() => __resetLevelBasisFunnelForTest());

  it('starts empty', () => {
    expect(getLevelBasisFunnel()).toEqual([]);
  });

  it('⭐ POSITIVE CONTROL — the counter INCREMENTS on every refusal reason', () => {
    // Until this passes, a zero in the funnel is indistinguishable from a counter that
    // never fires (#661 leg 3). This is the arm B-XSTOCK-FEED-SANITY shipped without.
    const inputs: Array<[Parameters<typeof buildLevelBasis>[0], LevelBasisRefusal]> = [
      [{ ...OK_BOOK, bid: null, ask: null }, 'no_book'],
      [{ ...OK_BOOK, ask: null }, 'one_sided_book'],
      [{ ...OK_BOOK, bid: 0 }, 'non_finite_side'],
      [{ ...OK_BOOK, bid: 103, ask: 102 }, 'crossed_book'],
      [{ ...OK_BOOK, bid: 102, ask: 102 }, 'locked_or_synthetic_book'],
      [{ ...OK_BOOK, capturedAtMs: null }, 'age_unknown'],
    ];
    for (const [input, reason] of inputs) {
      const r = buildLevelBasis(input, NOW, MAX_AGE, MAX_SPREAD);
      recordLevelBasisOutcome(KEY, r);
      expect(getLevelBasisFunnelRow(KEY)!.byReason[reason]).toBe(1);
    }
    const f = getLevelBasisFunnelRow(KEY)!;
    expect(f.refused).toBe(6);
    expect(f.accepted).toBe(0);
  });

  it('counts acceptances too, so a refusal RATE has a denominator', () => {
    recordLevelBasisOutcome(KEY, buildLevelBasis(OK_BOOK, NOW, MAX_AGE, MAX_SPREAD));
    recordLevelBasisOutcome(KEY, buildLevelBasis({ ...OK_BOOK, ask: null }, NOW, MAX_AGE, MAX_SPREAD));
    const f = getLevelBasisFunnelRow(KEY)!;
    expect(f).toMatchObject({ attempted: 2, accepted: 1, refused: 1 });
  });

  it('the funnel ARITHMETIC closes — attempted equals accepted plus every refusal', () => {
    for (const input of [OK_BOOK, { ...OK_BOOK, ask: null }, { ...OK_BOOK, bid: 103, ask: 102 }]) {
      recordLevelBasisOutcome(KEY, buildLevelBasis(input, NOW, MAX_AGE, MAX_SPREAD));
    }
    const f = getLevelBasisFunnelRow(KEY)!;
    const summed = Object.values(f.byReason).reduce((a, b) => a + b, 0);
    expect(f.attempted).toBe(f.accepted + summed);
  });
});

describe('the age clause is ENFORCED, not merely stated (Langston catch 2)', () => {
  it('REFUSES a book older than the ceiling the caller declared', () => {
    // r1 returned this as ok:true and trusted the caller to look at ageMs. A guard that
    // cannot fire is the funnel-that-shipped-inert shape one layer up.
    const r = buildLevelBasis({ ...OK_BOOK, capturedAtMs: NOW - 60_000 }, NOW, 5_000, MAX_SPREAD);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe<LevelBasisRefusal>('stale_book');
    expect(r.basis).toBeUndefined();
  });

  it('accepts a book INSIDE the ceiling, so the guard is not simply always-on', () => {
    // The other arm. Without it, "refuses everything" would pass the test above.
    const r = buildLevelBasis({ ...OK_BOOK, capturedAtMs: NOW - 1_000 }, NOW, 5_000, MAX_SPREAD);
    expect(r.ok).toBe(true);
    expect(r.basis!.ageMs).toBe(1_000);
  });

  it('the ceiling is the CALLER\u2019s: the same book passes under a loose one and fails under a tight one', () => {
    const book = { ...OK_BOOK, capturedAtMs: NOW - 3_000 };
    expect(buildLevelBasis(book, NOW, 10_000, MAX_SPREAD).ok).toBe(true);
    expect(buildLevelBasis(book, NOW, 1_000, MAX_SPREAD).reason).toBe<LevelBasisRefusal>('stale_book');
  });

  it('a STRUCTURAL fault outranks staleness — an ancient one-sided book reads one_sided_book', () => {
    // Otherwise a malformed book gets reported as merely old and the real fault is hidden.
    const r = buildLevelBasis({ ...OK_BOOK, ask: null, capturedAtMs: NOW - 999_999 }, NOW, 5_000, MAX_SPREAD);
    expect(r.reason).toBe<LevelBasisRefusal>('one_sided_book');
  });

  it('a capture stamped in the FUTURE is age_unknown, never silently fresh', () => {
    // Clock skew between the venue and this box. Not stale, and not trustworthy either.
    const r = buildLevelBasis({ ...OK_BOOK, capturedAtMs: NOW + 10_000 }, NOW, 5_000, MAX_SPREAD);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe<LevelBasisRefusal>('age_unknown');
  });
});

describe('the funnel is KEYED by lane and class (Langston catch 1)', () => {
  beforeEach(() => __resetLevelBasisFunnelForTest());

  it('⛔ an active-crypto refusal and a vts-xstock refusal do NOT share a bucket', () => {
    // W-1 wires BOTH lanes. r1's flat counters would have merged these and answered
    // questions about neither population.
    const active = { lane: 'active' as const, assetClass: 'crypto_spot' };
    const vts = { lane: 'vts' as const, assetClass: 'xstock_spot' };
    recordLevelBasisOutcome(active, buildLevelBasis({ ...OK_BOOK, ask: null }, NOW, MAX_AGE, MAX_SPREAD));
    recordLevelBasisOutcome(vts, buildLevelBasis({ ...OK_BOOK, bid: null }, NOW, MAX_AGE, MAX_SPREAD));
    recordLevelBasisOutcome(vts, buildLevelBasis(OK_BOOK, NOW, MAX_AGE, MAX_SPREAD));

    expect(getLevelBasisFunnelRow(active)).toMatchObject({ attempted: 1, accepted: 0, refused: 1 });
    expect(getLevelBasisFunnelRow(vts)).toMatchObject({ attempted: 2, accepted: 1, refused: 1 });
    expect(getLevelBasisFunnel()).toHaveLength(2);
  });

  it('a lane/class never attempted returns undefined rather than a zero row', () => {
    // A zero row would read as "measured, and nothing happened". Nothing was measured.
    expect(getLevelBasisFunnelRow({ lane: 'vts', assetClass: 'crypto_spot' })).toBeUndefined();
  });
});

describe('the plausibility guard — a book can be FRESH and untradeable (live evidence, 2026-09-05)', () => {
  // Real books recorded by B-XSTOCK-FEED-SANITY at the weekly shutdown. Every one of them
  // passes every structural check: two-sided, positive, bid < ask, freshly stamped.
  const SHUTDOWN_BOOKS: Array<[string, number, number, number]> = [
    ['ARKK/USD', 80.01, 105.00, 0.270],
    ['SLV/USD', 55.00, 63.50, 0.143],
    ['LI/USD', 11.70, 12.60, 0.074],
  ];

  it('⛔ REFUSES the real ARKK shutdown book, whose ask sat 22% above the last trade', () => {
    const r = buildLevelBasis(
      { bid: 80.01, ask: 105.0, capturedAtMs: NOW - 100, producer: 'kraken_equities_ws' },
      NOW, MAX_AGE, 0.05,
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toBe<LevelBasisRefusal>('implausible_spread');
    expect(r.basis).toBeUndefined();
  });

  it('the measured spread fractions match what the guard computes, on all three real books', () => {
    for (const [, bid, ask, expected] of SHUTDOWN_BOOKS) {
      const frac = (ask - bid) / ((bid + ask) / 2);
      expect(frac).toBeCloseTo(expected, 3);
      // Just under its own fraction refuses; just over accepts. Both arms, per book.
      expect(buildLevelBasis({ bid, ask, capturedAtMs: NOW - 10, producer: 'x' }, NOW, MAX_AGE, frac * 0.99).reason)
        .toBe<LevelBasisRefusal>('implausible_spread');
      expect(buildLevelBasis({ bid, ask, capturedAtMs: NOW - 10, producer: 'x' }, NOW, MAX_AGE, frac * 1.01).ok)
        .toBe(true);
    }
  });

  it('⛔ a FRESH book is not thereby a TRADEABLE one — the two faults are separate', () => {
    // age_unknown/stale_book catch a price that is OLD. Nothing caught a price that is WIDE.
    const wideButFresh = { bid: 80.01, ask: 105.0, capturedAtMs: NOW, producer: 'x' };
    expect(buildLevelBasis(wideButFresh, NOW, MAX_AGE, 0.05).reason).toBe<LevelBasisRefusal>('implausible_spread');
    // and the same book under a permissive ceiling is accepted, so the guard is not always-on
    expect(buildLevelBasis(wideButFresh, NOW, MAX_AGE, 0.90).ok).toBe(true);
  });

  it('a STRUCTURAL fault still outranks an implausible one', () => {
    // A crossed book is not "too wide" — it is broken, and must say so.
    expect(buildLevelBasis({ bid: 105, ask: 80, capturedAtMs: NOW, producer: 'x' }, NOW, MAX_AGE, 0.001).reason)
      .toBe<LevelBasisRefusal>('crossed_book');
  });

  it('a normal tight book passes comfortably', () => {
    expect(buildLevelBasis(OK_BOOK, NOW, MAX_AGE, 0.05).ok).toBe(true);
  });
});
