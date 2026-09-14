/**
 * `8a-P2` — THE DRIVEN CONTROL FOR `venueMarkNonFinite`.
 *
 * ⛔⛔ WHY THIS FILE EXISTS, AND IT IS A CORRECTION TO SOMETHING I SAID RATHER THAN TO CODE.
 * I read `venueMarkNonFinite = 0` on staging with zero `[VENUE_MARK_NON_FINITE]` lines and
 * reported that I could not interpret it because **I had no positive control** — so the zero could
 * not be told apart from a counter that cannot fire (`#661` leg 1).
 * ★ LANGSTON: *"'I have no positive control' is a claim about what you RAN, not about what
 *   EXISTS."* The branch is a **pure function of one object**, so a DRIVEN control discharges the
 *   instrument **offline, with no live occurrence required.** The absence was in my effort, not in
 *   the world — which is the assert-an-absence-about-your-own-capability shape.
 *
 * ⇒ These tests drive all three reachable shapes plus the negatives. After this, a live zero reads
 *   as legs 2/3 (population/reach) ONLY — never as "the instrument might be dead."
 */
import { describe, it, expect } from 'vitest';
import { isNonActionableVenueMark } from '../../core/trading/venue-mark-actionable.js';
import { isKrakenVenueSource } from '../../services/live-pricing-adapter.js';

/** The real predicate's shape: only Kraken venue sources are trusted marks. */
const isVenue = (s: string) => s === 'kraken_ws' || s === 'kraken_rest' || s === 'kraken_equities_ws';

describe('8a-P2 — the non-actionable venue mark fires, and on the right inputs only', () => {
  it('1. ⛔ NaN from a trusted venue source FIRES — this was the live hole', () => {
    expect(isNonActionableVenueMark({ price: Number.NaN, source: 'kraken_ws' }, isVenue)).toBe(true);
  });

  it('2. ⛔ zero from a trusted venue source FIRES — the other live shape', () => {
    expect(isNonActionableVenueMark({ price: 0, source: 'kraken_ws' }, isVenue)).toBe(true);
  });

  it('3. ⛔ a negative from a trusted venue source FIRES', () => {
    expect(isNonActionableVenueMark({ price: -1, source: 'kraken_rest' }, isVenue)).toBe(true);
  });

  it('4. ⚠️ null FIRES TOO — and this is the arm that makes the counter an UPPER BOUND', () => {
    // The engine's ACCEPT branch already required `price !== null`, so a venue-sourced null was
    // NEVER the hole — it fell through and was merely silent. Counting it is a gain in visibility
    // and it is NOT the defect that was closed.
    // ⇒ A NON-ZERO COUNT OVERSTATES THE HOLE'S RATE **AS A MATTER OF CODE, NOT OF ARGUMENT**, and
    //   a live figure must be partitioned by the emitted value before it is quoted as a rate.
    expect(isNonActionableVenueMark({ price: null, source: 'kraken_ws' }, isVenue)).toBe(true);
  });

  it('5. ⭐ NEGATIVE CONTROL — a GOOD price from a trusted source does NOT fire', () => {
    // Without this, tests 1-4 could all pass on a predicate hardwired to `true`.
    expect(isNonActionableVenueMark({ price: 42.5, source: 'kraken_ws' }, isVenue)).toBe(false);
  });

  it('6. ⭐ NEGATIVE CONTROL — a bad price from an UNTRUSTED source does NOT fire here', () => {
    // ⛔ THE SEPARATION THAT MATTERS: a non-venue source is a PROVENANCE problem with its own log
    // line. If this fired, the two facts would pool and rebuild the conflation this row removed.
    expect(isNonActionableVenueMark({ price: Number.NaN, source: 'last_known_good' }, isVenue)).toBe(false);
    expect(isNonActionableVenueMark({ price: 0, source: 'no_reliable_price' }, isVenue)).toBe(false);
  });

  it('7. ⭐ NEGATIVE CONTROL — a null RESULT does not fire (no object, no claim)', () => {
    expect(isNonActionableVenueMark(null, isVenue)).toBe(false);
  });

  it('7b. ⛔⛔ THE REAL PREDICATE, NOT MY HAND-ROLLED ONE — otherwise the MEMBERSHIP has two homes', () => {
    // ⚠️ FINDING-2. Every test above injects a LOCAL `isVenue`. It matches
    // `live-pricing-adapter.ts:317` TODAY — and NOTHING PINNED THAT. The only existing fence on
    // that function asserts the SHAPE of its test (`source ===` present, `producer` absent) and
    // **not its MEMBERS**. ⇒ tests 1-7 discharge *"the module separates a VALUE problem from a
    // PROVENANCE problem"* — they do NOT discharge *"`last_known_good` is untrusted in
    // production."* Two different claims, and I was quoting the second off the first.
    // ⇒ THIS CASE DRIVES THE COMPOSITION PRODUCTION ACTUALLY RUNS.
    expect(isNonActionableVenueMark({ price: Number.NaN, source: 'kraken_ws' }, isKrakenVenueSource)).toBe(true);
    expect(isNonActionableVenueMark({ price: 42.5, source: 'kraken_ws' }, isKrakenVenueSource)).toBe(false);
    // ⛔ AND THE ARM THAT MATTERS: a bad value from a source production does NOT trust must stay
    //   quiet HERE, because it is the provenance line's fact, not this one's.
    expect(isNonActionableVenueMark({ price: Number.NaN, source: 'last_known_good' }, isKrakenVenueSource)).toBe(false);
  });

  it('7c. ⭐ AND THE TWO PREDICATES AGREE — so the hand-rolled set cannot silently drift', () => {
    // Without this, a future change to the real venue set leaves tests 1-7 green while they stop
    // describing production — the membership drifting apart in its two homes, unnoticed.
    for (const src of ['kraken_ws', 'kraken_rest', 'kraken_equities_ws', 'last_known_good', 'no_reliable_price']) {
      expect(isVenue(src)).toBe(isKrakenVenueSource(src));
    }
  });

  it('8. ⛔⛔ THE INSTRUMENT IS NOW PROVED, SO A LIVE ZERO IS READABLE — this is the whole point', () => {
    // Four firing shapes and four non-firing ones, from one pure function. ⇒ `#661` LEG 1 is
    // DISCHARGED OFFLINE: the counter demonstrably CAN fire, so a production zero means the inputs
    // did not occur — not that the counter is dead.
    // ⚠️ It discharges leg 1 ONLY. Legs 2/3 (population and reach) are untouched by a unit test.
    const firing = [
      { price: Number.NaN, source: 'kraken_ws' },
      { price: 0, source: 'kraken_ws' },
      { price: -1, source: 'kraken_rest' },
      { price: null, source: 'kraken_equities_ws' },
    ];
    const quiet = [
      { price: 42.5, source: 'kraken_ws' },
      { price: Number.NaN, source: 'last_known_good' },
    ];
    expect(firing.every((r) => isNonActionableVenueMark(r, isVenue))).toBe(true);
    expect(quiet.some((r) => isNonActionableVenueMark(r, isVenue))).toBe(false);
  });
});
