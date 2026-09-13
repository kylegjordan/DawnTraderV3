/**
 * B-PRICE-SIDE-BY-JOB r5 — P-7d (decision D3) and P-7f (decision D6): THE TOUCH PRICE, CHOSEN BY RULE, WITH THE
 * CLOCK ITS AGE WAS MEASURED ON NAMED BESIDE IT.
 *
 * D3: the touch price — what a trigger, a spread check or a mark reads — is the ORDER BOOK's top where the book is
 * valid and fresh; otherwise the TICKER's sides, but only where they are valid and within D6's age; and if neither
 * qualifies, the price-dependent action is REFUSED (for an exit, a hold, per D6). Never a midpoint, never a guess.
 *
 * D6: "Clock basis is a field." Venue-clock age applies where the message carries the venue's timestamp; receipt-clock
 * age applies otherwise. The two are never pooled, and a receipt age is never a claim of known source freshness. So
 * every quote this module returns carries `clockBasis` beside `ageMs`, and the CALLER names the clock of the one stamp
 * it hands over — this module never infers a clock from a number.
 *
 * ⛔ THE STRUCTURAL RULES ARE NOT RESTATED HERE. Each leg goes through `buildLevelBasis`, the one home of "is this a
 * two-sided, uncrossed, stamped, fresh, plausibly narrow book" (no_book, one_sided_book, crossed_book,
 * locked_or_synthetic_book, non_finite_side, age_unknown, stale_book, implausible_spread). A second copy of those
 * checks would drift from the first (#641).
 *
 * ⛔ A VENUE STAMP AHEAD OF OUR CLOCK REFUSES (`age_unknown`), inherited from `buildLevelBasis`: a negative age cannot
 * date anything. No skew tolerance is invented here; the skew between Kraken's clock and ours is to be measured before
 * a decision site wires the venue clock (carried to OBJ-8).
 *
 * ⛔ BOOK ELIGIBILITY IS THE CALLER'S DECLARATION, NOT A DEFAULT. Pre-audit A-9.7: the xStock touch price stays on the
 * ticker until the maintained xStock book passes a checksum-validated control with no crossed books. An ineligible book
 * refuses as `book_not_eligible`, so a reader can tell "we did not use the book" from "the book was bad".
 *
 * PURE: no clock read, no feed import. `nowMs` and the policy are injected, like `buildLevelBasis`.
 * RECORD-ONLY IN COMMIT LAYER 1: no decision reads this yet; OBJ-8 wires it (P-8a exits, P-8c levels).
 */
import {
  buildLevelBasis,
  recordLevelBasisOutcome,
  type LevelBasisRefusal,
  type LevelBasisLane,
} from './level-basis.js';

/** Which clock an age was measured on. Never pooled. */
export type ClockBasis = 'venue' | 'receipt';

/** The quote-derived bases D3 names. `venue_close` belongs to the bar lanes and never reaches this module. */
export type TouchBasis = 'book_top' | 'ticker_bbo' | 'ticker_default';

export interface TouchLegInput {
  bid: number | null | undefined;
  ask: number | null | undefined;
  /** The ONE timestamp this leg's age is measured from, on the clock named in `clockBasis`. */
  stampMs: number | null | undefined;
  clockBasis: ClockBasis;
  producer: string;
}

export interface TouchPolicy {
  /**
   * D6's age for the job asking (entries: the flat limit; exits: the risk-derived ceiling). REQUIRED.
   * ⚠️ ONE ceiling governs BOTH legs (Langston chunk-3 C3): the ticker fallback can be accepted at an age the book was
   * refused for. The live crypto book ceiling is 5,000 ms; the ticker has no ceiling today. Record-only for now: P-8a,
   * which wires this, either passes per-leg ages or states in its commit, with the number, that one ceiling governs both.
   */
  maxAgeMs: number;
  /** The plausibility bound, as a fraction of the mid. REQUIRED, like in `buildLevelBasis`. */
  maxSpreadFraction: number;
}

export interface TouchQuote {
  bid: number;
  ask: number;
  basis: TouchBasis;
  ageMs: number;
  clockBasis: ClockBasis;
  producer: string;
}

export type BookRefusal = LevelBasisRefusal | 'book_not_eligible';

export type TouchSelection =
  | { ok: true; quote: TouchQuote; bookRefusal: BookRefusal | null }
  | { ok: false; bookRefusal: BookRefusal; tickerRefusal: LevelBasisRefusal };

function assess(leg: TouchLegInput | null, nowMs: number, policy: TouchPolicy) {
  if (leg === null) return { ok: false as const, reason: 'no_book' as LevelBasisRefusal };
  const r = buildLevelBasis(
    { bid: leg.bid, ask: leg.ask, capturedAtMs: leg.stampMs, producer: leg.producer },
    nowMs,
    policy.maxAgeMs,
    policy.maxSpreadFraction,
  );
  return r.ok && r.basis
    ? { ok: true as const, basis: r.basis }
    : { ok: false as const, reason: (r.reason ?? 'no_book') as LevelBasisRefusal };
}

/**
 * Choose the touch price by D3's order: a valid fresh book top, then valid ticker sides within the age, else refuse.
 * `tickerBasis` names what the ticker IS for this instrument (crypto: the best-bid/offer ticker; xStock: the default).
 */
export function selectTouchPrice(
  input: {
    book: TouchLegInput | null;
    bookEligible: boolean;
    ticker: TouchLegInput | null;
    tickerBasis: 'ticker_bbo' | 'ticker_default';
  },
  nowMs: number,
  policy: TouchPolicy,
): TouchSelection {
  let bookRefusal: BookRefusal | null = null;
  if (!input.bookEligible) {
    bookRefusal = 'book_not_eligible';
  } else {
    const b = assess(input.book, nowMs, policy);
    if (b.ok && input.book) {
      return {
        ok: true,
        quote: {
          bid: b.basis.bid, ask: b.basis.ask, basis: 'book_top', ageMs: b.basis.ageMs,
          clockBasis: input.book.clockBasis, producer: input.book.producer,
        },
        bookRefusal: null,
      };
    }
    bookRefusal = b.ok ? 'no_book' : b.reason;
  }

  const t = assess(input.ticker, nowMs, policy);
  if (t.ok && input.ticker) {
    return {
      ok: true,
      quote: {
        bid: t.basis.bid, ask: t.basis.ask, basis: input.tickerBasis, ageMs: t.basis.ageMs,
        clockBasis: input.ticker.clockBasis, producer: input.ticker.producer,
      },
      bookRefusal,
    };
  }
  return { ok: false, bookRefusal, tickerRefusal: t.ok ? 'no_book' : t.reason };
}

/**
 * B-PRICE-SIDE-BY-JOB row `8c` (P1) — record ONE ladder walk as TWO funnel cells.
 *
 * ⛔ WHY IT LIVES HERE AND NOT IN `level-basis.ts`: that module is imported BY this one, so a
 * recorder there taking a `TouchSelection` would be a cycle. The funnel's primitives are exported;
 * this composes them.
 *
 * ⛔ TWO CELLS FROM ONE WALK, NEVER ONE. The `book` cell keeps counting exactly what the pre-`8c`
 * funnel counted — the book rung's own verdict — so that series is CONTINUOUS across this change
 * and the pre-change reading stays comparable. The `ladder` cell counts the walk's overall verdict,
 * which is a NEW population. Langston's condition 1, made structural rather than documentary.
 *
 * ⚠️ THE TWO CELLS ARE NOT INDEPENDENT AND MUST NOT BE SUMMED: every walk increments both exactly
 * once, so `attempted` is equal across them by construction and their ACCEPTED counts are what
 * differ. The gap between them IS the measurement — it is how much rung 2 recovers.
 */
export function recordTouchSelection(
  base: { lane: LevelBasisLane; assetClass: string },
  sel: TouchSelection,
): void {
  // The book rung: `bookRefusal === null` means the book itself carried the selection.
  recordLevelBasisOutcome(
    { ...base, rung: 'book' },
    sel.ok && sel.bookRefusal === null ? { ok: true } : { ok: false, reason: sel.bookRefusal ?? 'no_book' },
  );
  // The ladder: accepted if ANY rung carried it; the refusal recorded is the LAST rung's, because
  // that is the one that had the final say. The book's reason is already in its own cell.
  recordLevelBasisOutcome(
    { ...base, rung: 'ladder' },
    sel.ok ? { ok: true } : { ok: false, reason: sel.tickerRefusal },
  );
}
