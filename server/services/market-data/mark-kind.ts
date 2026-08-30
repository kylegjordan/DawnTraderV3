/**
 * B-EXIT-BOOK-AGE-STAMP (P1) — THE ONE DEFINITION OF "is this published price a MIDPOINT or a LAST TRADE".
 *
 * ⛔ WHY THIS FILE EXISTS AT ALL: the rule was written out FOUR TIMES, in four files, and no two
 * of them shared a line — `equity-spot-archiver.ts` (xStock), `kraken-v2-translator.ts` (crypto WS),
 * `live-pricing-adapter.ts` (crypto REST poller) and `active-execution-engine.ts` (crypto REST
 * engine fallback). That is the #641 two-copies shape at four copies. This module is the single home.
 *
 * ⚠️ IT IS A DEDUPLICATION, NOT A BUG FIX. The four statements were CONVERGENT, not copied — they
 * cite different provenance (`8.9.1` for the translator, `P19-B8.5` for the archiver) and they differ
 * in their OUTPUT guards, which is why the callers keep their own guards and only the PREDICATE moves
 * here. Do not fold a caller's finite/positive check into this function: it answers one question.
 *
 * ⛔ A LEAF MODULE ON PURPOSE — it imports nothing. Both asset classes and the engine call it, so any
 * import of its own would create a cycle risk across three subsystems that have no other relationship.
 * `kraken-v2-translator.ts` was the obvious home and was rejected: the xStock archiver importing from
 * a file named for the crypto v2 feed would be a false statement about where its data comes from.
 *
 * ⛔ NEVER RE-DERIVE THE KIND DOWNSTREAM OF THE PRODUCER. `price-cache.ts:402-416` sets
 * `ask: existing?.ask ?? price` and `bid: existing?.bid ?? price`, so on a cold entry
 * `bid === ask === price > 0` and this predicate would answer `'mid'` for a value that may have been
 * a last trade. And `kraken-websocket-adapter.ts` drops bid/ask at its `priceTick` emit. The kind is
 * decided WHERE THE PRICE IS BUILT and carried from there — that is the whole point of the split.
 */

/**
 * `'mid'` when both sides of the book are present, `'last'` otherwise.
 *
 * Accepts NaN as well as 0 for an absent side — the xStock parser coalesces a missing quote to NaN
 * (`equity-spot-archiver.ts`) while the crypto translator coalesces to 0 (`kraken-v2-translator.ts`),
 * and `NaN > 0` is false, so one predicate serves both without either caller changing its coalescing.
 */
export function markKindOf(bid: number, ask: number): 'mid' | 'last' {
  return (bid > 0 && ask > 0) ? 'mid' : 'last';
}
