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

export type XstockSideSizeVerdict = 'ok' | 'size_short' | 'size_unknown';

/**
 * Row 2 increment B, objective 8 (P2) — THE ONE TOP-OF-BOOK SIZE TEST, shared by paper and the VTS.
 *
 * Does the shown quantity on `side` cover `notionalUsd` at that side's price? `bid` is the side a SELL fills against,
 * `ask` the side a BUY fills against. A missing or non-finite quantity or price ⇒ `size_unknown` — NEVER `?? 0`
 * (reads as short) or `?? Infinity` (reads as ok); the caller decides what unknown means for its job and counts it.
 * A non-finite or non-positive notional THROWS: that is a caller bug, not a market state.
 *
 * What each site does with the verdict is the caller's (pre-audit P3): exit TRIGGERS fire regardless and count it;
 * resting fills (X1, X2) and the VTS entry refuse on `size_short` or `size_unknown`.
 */
export function xstockSideSize(
  side: 'bid' | 'ask',
  raw: { bid: number | null; ask: number | null; bidQty: number | null; askQty: number | null },
  notionalUsd: number,
): XstockSideSizeVerdict {
  if (!Number.isFinite(notionalUsd) || !(notionalUsd > 0)) {
    throw new Error(`xstockSideSize: notional must be a positive finite number, got ${notionalUsd}`);
  }
  const price = side === 'bid' ? raw.bid : raw.ask;
  const qty = side === 'bid' ? raw.bidQty : raw.askQty;
  if (price === null || qty === null || !Number.isFinite(price) || !Number.isFinite(qty)) return 'size_unknown';
  if (!(price > 0) || qty < 0) return 'size_unknown';
  return qty * price >= notionalUsd ? 'ok' : 'size_short';
}
