/**
 * P19-B7.2c — PURE pending-maker decision logic, shared by the paper monitor pre-pass
 * (`paper-execution-engine._processPendingMaker`) and the VTS resolve pre-pass
 * (`vts-runner.resolveOpenVirtualTrades`) so the two paths CANNOT drift (R2 parity).
 *
 * Model (Kyle, LOCKED + SIMPLIFIED 2026-07-02):
 *  - FILL: honest side-aware trade-through of the REAL price — a resting BUY fills iff
 *    price ≤ limit; a resting SELL iff price ≥ limit. Never optimistic.
 *  - DROP: past the hard-drop deadline (`maker_max_pending_ms`) → dropped, period
 *    (no convert re-evaluation).
 *  - PRECEDENCE (R2): if a pending both trades through AND is past its deadline in the
 *    SAME tick, FILL WINS (it filled as maker before the deadline).
 *  - The tiered fill-quality knobs are INERT placeholders: a fill is ALWAYS at the
 *    limit exactly (no haircut applied) until Phase-25 calibrates on real fill data.
 */

export type PendingSide = 'buy' | 'sell';
export type PendingOutcome = 'fill' | 'drop' | 'rest';

/** Side-aware honest trade-through: did the real price trade through the resting limit? */
export function tradedThrough(side: PendingSide, currentPrice: number, limit: number): boolean {
  if (!Number.isFinite(currentPrice) || !Number.isFinite(limit)) return false;
  return side === 'buy' ? currentPrice <= limit : currentPrice >= limit;
}

/**
 * Marketable-at-placement: the market is ALREADY at/through the limit the moment the
 * maker order would be placed — a real post-only would REJECT. (Same comparator as the
 * fill; named separately because the CONSEQUENCE differs: at placement it routes to the
 * stored-taker check, at monitor time it is a fill.)
 */
export function isMarketableAtPlacement(side: PendingSide, currentPrice: number, limit: number): boolean {
  return tradedThrough(side, currentPrice, limit);
}

/**
 * One pending order, one tick → one outcome. FILL WINS over the deadline in the same
 * tick (R2). A null/unavailable price can never fill; it can still hard-drop.
 */
export function evaluatePendingMaker(args: {
  side: PendingSide;
  currentPrice: number | null;
  limit: number;
  nowMs: number;
  deadlineMs: number | null;
}): PendingOutcome {
  const { side, currentPrice, limit, nowMs, deadlineMs } = args;
  if (currentPrice != null && tradedThrough(side, currentPrice, limit)) return 'fill'; // FILL WINS (R2)
  if (deadlineMs != null && nowMs >= deadlineMs) return 'drop';
  return 'rest';
}

/**
 * The maker FILL price — ALWAYS the limit, exactly. The inert Phase-25 tier knobs
 * (`maker_late_fill_haircut_pct`, seeded 0) are deliberately NOT inputs here: the
 * OBJ-7 inert-tier test pins fill === limit so an accidental future wiring of the
 * placeholder knobs is caught at CI, not in production fill data (Langston Q4 guard).
 */
export function makerFillPrice(limit: number): number {
  return limit;
}
