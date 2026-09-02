/**
 * F-G-2 OBJ-5a — what price VTS BOOKS when TEC says exit.
 *
 * `evaluateTECExit` clamps `exitPrice` to the trigger on `stop_hit`/`target_hit`
 * (tec-evaluator.ts:275/:284/:377/:416 — design, not a bug: the ACTIVE path discards the
 * clamp and depth-walks a fill). VTS alone consumed the clamp as its booked fill, so every
 * VTS stop-out was recorded at exactly the stop and every target at exactly the target —
 * a world where exiting is free (#914). Kyle 2026-09-02: the learning system learns off
 * REALISTIC exits. This resolves the booked price from the mark the evaluator actually saw.
 *
 * Pure so BOTH VTS lanes (real resolver vts-runner:3238, shadow resolver :3915) call the
 * same function — zero lane drift, OBJ-4's principle.
 *
 * ⛔ CLASS SEAM (pre-audit §7.4 row 2): xStock rows KEEP THE CLAMP. The observed xStock
 * mark can be the 00:15 stub (#943), and booking it would move that contamination into
 * VTS learning in the favourable direction. The seam sits on the BOOKING, never on the
 * decision, and its removal is owed to B-XSTOCK-FEED-SANITY (plan row 3b.b).
 *
 * NULL-ARM: no live mark (stale/entry-fallback force-close) ⇒ keep the evaluator's own
 * price, which is the entry-fallback on `stale_timeout` — never NaN, never 0.
 */
export function resolveVtsBookedExitPrice(
  assetClass: string,
  observedMark: number | null | undefined,
  clampPrice: number,
): number {
  if (assetClass !== 'crypto_spot') return clampPrice;
  if (observedMark == null || !Number.isFinite(observedMark) || observedMark <= 0) return clampPrice;
  return observedMark;
}
