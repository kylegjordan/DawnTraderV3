/**
 * F-G-2 OBJ-5a + `8a-P3` C6 — what price VTS BOOKS when TEC says exit.
 *
 * `evaluateTECExit` clamps `exitPrice` to the trigger on `stop_hit`/`target_hit`
 * (tec-evaluator.ts — design, not a bug: the ACTIVE path discards the clamp and
 * depth-walks a fill). VTS alone consumed the clamp as its booked fill, so every
 * VTS stop-out was recorded at exactly the stop and every target at exactly the target —
 * a world where exiting is free (#914). Kyle 2026-09-02: the learning system learns off
 * REALISTIC exits.
 *
 * ⛔⛔ `8a-P3` — CRYPTO BOOKS THE BID, NOT THE MARK. OBJ-5a booked the observed mark, which is the
 * feed midpoint — a price no seller receives. An exit is a SELL, so the realistic price is the BID
 * (the same bid that decided the exit this tick).
 *
 * Pure so BOTH VTS lanes (real resolver, shadow resolver) call the same function — zero lane drift.
 *
 * ⛔ CLASS SEAM (pre-audit §7.4 row 2): xStock rows KEEP THE CLAMP. The seam's removal is owed to
 * `8a-P4`.
 *
 * THE ARMS, and why they are returned rather than hidden:
 *  - `bid`              — crypto, live mark, usable bid ⇒ the bid.
 *  - `clamp_no_mark`    — no live mark (stale/entry-fallback force-close) ⇒ the evaluator's own price,
 *                         which is the entry-fallback on `stale_timeout` — never NaN, never 0. Unchanged.
 *  - `clamp_no_bid`     — ⚠️ NEW with `8a-P3`: a live mark but no usable bid ⇒ the clamp. The clamp is
 *                         the free-exit fiction this file exists to kill, and this set is strictly larger
 *                         than before, so the caller COUNTS it (Langston r1 F3).
 *  - `clamp_class_seam` — xStock.
 */
export type VtsBookingArm = 'bid' | 'clamp_no_mark' | 'clamp_no_bid' | 'clamp_class_seam';

export interface VtsBookedExit {
  price: number;
  arm: VtsBookingArm;
}

const usable = (x: number | null | undefined): x is number => x != null && Number.isFinite(x) && x > 0;

export function resolveVtsBookedExitPrice(
  assetClass: string,
  observedBid: number | null | undefined,
  observedMark: number | null | undefined,
  clampPrice: number,
): VtsBookedExit {
  if (assetClass !== 'crypto_spot') return { price: clampPrice, arm: 'clamp_class_seam' };
  if (!usable(observedMark)) return { price: clampPrice, arm: 'clamp_no_mark' };
  if (!usable(observedBid)) return { price: clampPrice, arm: 'clamp_no_bid' };
  return { price: observedBid, arm: 'bid' };
}
