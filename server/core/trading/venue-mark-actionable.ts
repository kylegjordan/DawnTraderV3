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
 * ⚠️ DECLARED AS A TYPE GUARD (`result is VenueMarkCandidate`), NOT a bare `boolean`, so the caller
 * can read `result.source` / `result.price` inside the branch without a redundant null test. A
 * second null check at the call site would be a SECOND PLACE the predicate lives — the `#641`
 * two-homes shape, in the guard built to stop a conflation.
 */
export function isNonActionableVenueMark(
  result: VenueMarkCandidate | null,
  isVenueSource: (source: string) => boolean,
): result is VenueMarkCandidate {
  if (result === null) return false;
  if (!isVenueSource(result.source)) return false;
  return result.price === null || !Number.isFinite(result.price) || result.price <= 0;
}
