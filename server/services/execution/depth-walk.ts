/**
 * ════════════════════════════════════════════════════════════════════════════
 * P19-B4b.1 — pure DEPTH-WALK fill helper (deterministic, RNG-free)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * The honest friction model for the active paper fill: walk the real order book
 * level-by-level to get the volume-weighted average fill price + whether the book
 * could fully fill the order. Replaces the flat 0.05% slippage on the active seam.
 *
 * PORT-AND-PROVE (Langston Step-2 Q-A/C-Q2a): `walkBook` is a faithful port of the
 * proven book-walk in `slippage-fee-model.ts:91-125 calculatePriceImpact` (VWAP =
 * Σ(price·qty) / Σqty over consumed levels). The golden test `depth-walk.test.ts`
 * pins this port to that reference algorithm across shared inputs.
 *
 * DETERMINISM (Langston C-Q5): NO `Math.random`, no time-seeding, no jitter — the
 * micro-move that made `modelSlippage` non-reproducible is intentionally dropped.
 * Same book + same order → same fill, every time, so paper Net Expectancy is
 * analyzable and sim-to-live parity is assertable.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** One order-book price level. `price` in quote; `qty` in base. */
export interface BookLevel {
  price: number;
  qty: number;
}

export interface WalkResult {
  /** Base qty the book could fill at acceptable levels (≤ orderQty). */
  filledQty: number;
  /** VWAP over the filled portion (0 if nothing filled). */
  avgFillPrice: number;
  /** Quote consumed for the filled portion (Σ price·qty). */
  consumedNotional: number;
  /** True if the book could NOT fully fill orderQty (filledQty < orderQty). */
  exhausted: boolean;
}

/**
 * Walk `levels` (sorted best-first: asks ascending for a buy, bids descending for
 * a sell) consuming up to `orderQty`. Pure + deterministic. Stops when the order
 * is filled or the book is exhausted. Mirrors `calculatePriceImpact`'s consume loop.
 */
export function walkBook(orderQty: number, levels: readonly BookLevel[]): WalkResult {
  let remaining = orderQty;
  let consumedNotional = 0;
  let filledQty = 0;
  for (const { price, qty } of levels) {
    if (remaining <= 0) break;
    if (!(price > 0) || !(qty > 0)) continue; // skip degenerate levels
    const take = Math.min(remaining, qty);
    consumedNotional += take * price;
    filledQty += take;
    remaining -= take;
  }
  const avgFillPrice = filledQty > 0 ? consumedNotional / filledQty : 0;
  return {
    filledQty,
    avgFillPrice,
    consumedNotional,
    exhausted: filledQty + 1e-12 < orderQty,
  };
}

/**
 * OPEN fill (buy): walk the ASK side. May return a partial (exhausted) — the caller
 * (engine open seam) sizes down to `filledQty` and proceeds; it never silently
 * fills the unfillable remainder.
 */
export function openFill(orderQty: number, asks: readonly BookLevel[]): WalkResult {
  return walkBook(orderQty, asks);
}

/**
 * CLOSE fill (sell): walk the BID side, then ALWAYS full-fill (R2 — a market exit
 * always gets out, just at a worse price in a thin book; never a phantom stuck
 * position). Any remainder beyond the captured book is priced at the worst captured
 * bid worsened by `beyondDepthPenaltyBps` (DB-resolved per class — NOT a magic
 * constant; Langston Q-A condition), and blended into the VWAP over the full order.
 * Returns filledQty === orderQty always (full fill).
 */
export function closeFillFull(
  orderQty: number,
  bids: readonly BookLevel[],
  beyondDepthPenaltyBps: number,
): WalkResult {
  const walked = walkBook(orderQty, bids);
  if (!walked.exhausted) return walked;
  const remainder = orderQty - walked.filledQty;
  // worst captured bid = the deepest level we touched; if the book was empty, fall
  // back to the best (only) reference we have — but an empty book here means no
  // captured price at all, so the caller must have a valid reference (guarded upstream).
  const lastTouched = [...bids].reverse().find((l) => l.price > 0 && l.qty > 0);
  const refPrice = walked.filledQty > 0 ? (lastTouched?.price ?? walked.avgFillPrice) : (bids.find((l) => l.price > 0)?.price ?? 0);
  const penalizedPrice = refPrice * (1 - beyondDepthPenaltyBps / 10_000); // worse (lower) for a sell
  const remainderNotional = remainder * penalizedPrice;
  const totalNotional = walked.consumedNotional + remainderNotional;
  return {
    filledQty: orderQty,
    avgFillPrice: totalNotional / orderQty,
    consumedNotional: totalNotional,
    exhausted: false,
  };
}

/**
 * Cumulative notional available across the given book side (for the sufficiency
 * gate: depth ≥ order × multiple). Σ price·qty over all valid levels.
 */
export function cumulativeNotional(levels: readonly BookLevel[]): number {
  let n = 0;
  for (const { price, qty } of levels) {
    if (price > 0 && qty > 0) n += price * qty;
  }
  return n;
}

/** Count of valid (price>0, qty>0) levels — for the min-levels warmth check. */
export function validLevelCount(levels: readonly BookLevel[]): number {
  let c = 0;
  for (const { price, qty } of levels) if (price > 0 && qty > 0) c++;
  return c;
}
