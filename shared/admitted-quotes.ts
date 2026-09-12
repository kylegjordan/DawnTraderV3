/**
 * shared/admitted-quotes.ts — B-PRICE-SIDE-BY-JOB r5 OBJ-8, row 8f.
 *
 * THE ONE LIST OF QUOTE CURRENCIES THE SYSTEM WILL SETTLE A NEW POSITION IN.
 *
 * ═══ THE THREE CONSUMERS, NAMED HERE SO A CHANGE CANNOT BE MADE BLIND ═══
 * ⛔ EDITING THIS LIST MOVES ALL THREE AT ONCE. That is the point of it, and it is also the
 *    risk — before 2026-09-12 the first two disagreed and nothing compared them.
 *
 *   1. **ARCHIVE SELECTION** — `passive-archive/universe-loader.ts` decides which crypto pairs
 *      we capture OHLC for. Tested in PLAIN space, after `normalizeKrakenAsset`.
 *   2. **DEPLOYABLE BALANCE** — `kraken-mirror-balance.ts` decides which Kraken balance codes
 *      count 1:1 toward the figure a live start is sized against. Matched in RAW space, so it
 *      consumes the PREIMAGE of this list via `rawQuoteFormsOf`, never this list directly.
 *   3. **ADMISSION (row 8f)** — refusing a new position in a pair quoted outside this list.
 *
 * ═══ WHY THESE THREE AND NOT "USD ONLY" (D9, decided 2026-09-11) ═══
 * D9's defect is DENOMINATION: a trade settles in its quote currency and we record the number
 * as dollars, so every figure on it is wrong by the conversion rate. On a FLOATING quote that
 * error is the FX rate; on a quote we hold to a dollar peg it is the peg deviation — two
 * orders of magnitude apart. So "not literally USD" is the wrong cut for D9's purpose.
 *
 * ⛔⛔ BUT THE TEST IS SET MEMBERSHIP, NEVER "IS IT PEGGED" (Langston, 2026-09-12).
 * "Pegged" is an assertion about an asset with no instrument behind it: the day USDC prints
 * 0.88 a peggedness predicate still reads ADMIT and the denomination error silently becomes
 * FX-sized. Membership in this list is a decidable fact readable at any ref. ⇒ **peggedness is
 * the REASON for the list and lives in this comment; it is never the test.**
 * ⚠️ The monitoring gap that leaves is REAL, STATED, AND HOMED: the error is bounded by peg
 *    deviation, currently unmeasured and unmonitored — `PHASE_19_PLAN` row `3n.g`
 *    (`B-QUOTE-PEG-DEVIATION-WATCH`). A depeg is a reason to EDIT THIS LIST, which is one
 *    change in one place, rather than a silent failure of a predicate.
 *
 * ═══ SCOPE ═══
 * ⛔ THIS IS THE ADMISSION SET, NOT A CONVERSION TABLE. A non-USD quote's USD P&L is marked
 *    UNAVAILABLE, never estimated, until `#966`'s timestamped conversion exists — at which
 *    point D9's own "until" clause lifts 8f's refusal. The block is temporary by construction.
 */

/**
 * Quote currencies a new position may be opened in, in PLAIN space (post-normalisation).
 *
 * FROZEN VALUE AND ITS PROVENANCE: this is verbatim the `filter.allowedQuotes` array that
 * `server/config/crypto-universe-filter.json` carried up to ref `a9785babc`, at which point
 * that key was DELETED so no second runtime source survives. The equality is pinned by
 * `server/tests/unit/b-price-side-obj8-admitted-quotes.test.ts`, whose expected values are
 * spelled inline rather than imported from here.
 */
export const ADMITTED_QUOTES: readonly string[] = ['USD', 'USDT', 'USDC'];

/** Membership test in plain space. Policy lives at the call site; this is just the lookup. */
export function isAdmittedQuote(plainQuote: string): boolean {
  return ADMITTED_QUOTES.includes(plainQuote);
}
