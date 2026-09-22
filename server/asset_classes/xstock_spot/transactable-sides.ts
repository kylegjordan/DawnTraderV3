/**
 * xstock_spot — THE ONE USABLE-SIDE PREDICATE, shared by every lane that reads xStock sides.
 *
 * ⛔⛔ `8a-P4b` Step 4 BLOCKER-1 (Langston) — the ONE predicate both paper xStock capture sites use (J1 guarded,
 * J2 unguarded). A frame's sides become DECISION inputs (X1 fill on the ask, X2 rest fill on the bid) only if both are
 * present, the bid is positive, and the book is NOT CROSSED (`ask >= bid`). The book-state guard's `two_sided` verdict
 * does NOT carry the uncrossed test (`book-state.ts` computes `twoSidedNow` and the exit path never uses it; a crossed
 * frame has a null mid, so the departure arms compare NaN and pass), and the archiver stores whatever the venue sent.
 * A crossed frame would hand a decision a bid above the ask — optimistic, the one direction row `8a` exists to close.
 * `null` ⇒ no decision and no fill this tick, exactly as a missing side.
 *
 * ⛔ `8a-P4c` P2 (Langston's Step-1 ruling, 2026-09-22): MOVED here from `active-execution-engine.ts` so the VTS lane
 * calls the SAME function. Shared predicate, separate state — each lane owns its own guard state; neither reads the
 * other's. Two copies of "what is a usable side" would drift and nothing would catch it.
 *
 * Leaf module: no imports.
 */
export function xstockTransactableSides(
  raw: { bid: number | null; ask: number | null } | null | undefined,
): { bid: number; ask: number } | null {
  if (!raw || raw.bid === null || raw.ask === null) return null;
  if (!(raw.bid > 0) || !(raw.ask >= raw.bid)) return null; // also rejects NaN
  return { bid: raw.bid, ask: raw.ask };
}
