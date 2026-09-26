/**
 * `B-REST-SIDES-TO-CACHE` (`3n.l`) increment 2, P8 (OBJ-12) — THE ONE "may these two sides be WRITTEN, as a pair" PREDICATE,
 * shared by every producer that carries crypto sides into the unified price cache: the v2 ticker emit, the book-top emit,
 * the live-pricing adapter's REST read, and the cache's own three REST ticker sites.
 *
 * ⛔ PAIRWISE: both sides finite and positive, or NEITHER is written. The cache writers advance `sidesCapturedAtMs` when
 * EITHER side is stated, so a producer that states one side keeps the other side's older value (or, on a cold row, the
 * mark) beside it under a fresh stamp — two positive, unequal sides that pass the whole level ladder while one of them
 * is not what the venue said now (scope r3 BLOCKER-3). Before this module the book emit was pairwise but tested `<= 0`,
 * which a `NaN` passes; the v2 ticker emit guarded each side on its own; and the REST sites wrote a missing side as `0`.
 *
 * ⛔ NOT THE UNCROSSED TEST. A crossed pair is a real venue state; the level ladder refuses it as `crossed_book` and
 * counts it. Filtering it here would hide it from that count. (`xstockTransactableSides` is a DECISION-input predicate
 * and does include it; this one decides only what a producer may store.)
 *
 * Leaf module: no imports.
 */
export function pairwiseStatedSides(
  bid: number | null | undefined,
  ask: number | null | undefined,
): { bid: number; ask: number } | null {
  if (typeof bid !== 'number' || typeof ask !== 'number') return null;
  if (!Number.isFinite(bid) || !Number.isFinite(ask)) return null;
  if (!(bid > 0) || !(ask > 0)) return null;
  return { bid, ask };
}
