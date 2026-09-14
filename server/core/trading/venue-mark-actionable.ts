/**
 * `8a-P2` — IS A VENUE-SOURCED MARK ACTIONABLE? ONE PURE PREDICATE, ONE HOME.
 *
 * ⛔⛔ WHY THIS IS ITS OWN MODULE RATHER THAN AN INLINE CONDITION IN THE ENGINE, AND IT IS NOT
 * TIDINESS: the inline version was **UNTESTABLE**, so the counter behind it could only ever be
 * read as *"it has never fired"* — which is indistinguishable from *"it cannot fire."* I reported
 * exactly that and called it an absent positive control.
 * ★ LANGSTON'S CORRECTION, AND IT IS THE REASON THIS FILE EXISTS: *"'I have no positive control'
 *   is a claim about what you RAN, not about what EXISTS."* The branch is a pure function of one
 *   object, so a DRIVEN control discharges the instrument offline and **no live occurrence is
 *   required.** Extracting it is what makes that control possible.
 *
 * ⚠️ THE PREDICATE IS DELIBERATELY BROADER THAN THE DEFECT IT WAS ADDED FOR, AND THAT IS STATED
 * RATHER THAN DISCOVERED LATER: it includes `price === null`, which the engine's ACCEPT branch
 * already excluded, so a venue-sourced `null` was never the hole. ⇒ **A NON-ZERO COUNT IS AN
 * UPPER BOUND ON THE HOLE'S RATE AS A MATTER OF CODE, NOT OF ARGUMENT.** Only `NaN` and
 * `0`/negative were ever reachable as live marks. Partition by the emitted value before quoting
 * a rate.
 */

/** The shape this predicate needs. Deliberately structural — it must not import the adapter. */
export interface VenueMarkCandidate {
  price: number | null;
  source: string;
}

/**
 * TRUE when a source we TRUST hands us a number we cannot act on.
 *
 * ⛔ THIS IS NOT "a source we do not trust" — that is a different fact with its own log line, and
 * pooling the two would rebuild the conflation this row exists to remove. A non-venue source is a
 * PROVENANCE problem; this is a VALUE problem from a good provenance.
 *
 * @param isVenueSource injected so this module stays pure and the control can drive both arms.
 *
 * ⛔⛔ DECLARED `boolean`, **NOT** `result is VenueMarkCandidate`, AND THE TYPE-GUARD VERSION WAS
 * UNSOUND. A `x is T` predicate licenses TS to narrow the **FALSE** branch to `null` — but this
 * returns false for objects that unambiguously ARE `VenueMarkCandidate`: **a perfectly good venue
 * price.** Today's single call site has no `else` and no early `continue`, so nothing breaks; the
 * moment someone writes one, **a healthy venue quote is typed `null` and a `.price` read past it
 * COMPILES.** (Langston, FINDING-1.)
 * ★ AND MY JUSTIFICATION FOR THE GUARD DID NOT SURVIVE CONTACT: I called a `!== null` test at the
 *   call site a SECOND HOME for the predicate. It is not — **the MEMBERSHIP lives here; a null
 *   test at the caller is a null test.** This predicate's subject is a VALUE, not a SHAPE, and the
 *   signature must say so.
 */
export function isNonActionableVenueMark(
  result: VenueMarkCandidate | null,
  isVenueSource: (source: string) => boolean,
): boolean {
  if (result === null) return false;
  if (!isVenueSource(result.source)) return false;
  return result.price === null || !Number.isFinite(result.price) || result.price <= 0;
}
