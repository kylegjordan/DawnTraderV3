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
 * ⛔⛔ `8a-P3` — VTS BOOKS THE BID, NOT THE MARK (crypto since `8a-P3`, xStock since `8a-P4c` increment 3). OBJ-5a booked the observed mark, which is the
 * feed midpoint — a price no seller receives. An exit is a SELL, so the realistic price is the BID
 * (the same bid that decided the exit this tick).
 *
 * Pure so BOTH VTS lanes (real resolver, shadow resolver) call the same function — zero lane drift.
 *
 * THE ARMS, and why they are returned rather than hidden:
 *  - `bid`              — live mark, usable bid ⇒ the bid (either class; the caller's guard chose the bid).
 *  - `clamp_no_mark`    — no live mark ⇒ NO PRICE (`3n.q3`). It used to book the evaluator's entry-fallback.
 *  - `clamp_no_bid`     — a live mark but no usable bid ⇒ NO PRICE (`3n.q3`). It used to book the clamp (the mark).
 *
 * ⛔⛔ `3n.q3` B-VTS-NO-DECISION-VALVE (P1) — A CLAMP ARM BOOKS NOTHING. Both clamp arms are reachable ONLY at the max-hold
 * valve: the VTS trigger IS the exit bid on both classes and both lanes, so a missing bid refuses every level decision
 * (`tec-evaluator.ts` step 2b) and only the two valve arms above it can still fire. Kyle's rule for the price side: a SELL
 * takes the BID, and a missing side ⇒ no decision. The valve is the one place a VTS sell is FORCED, so it closes the
 * RECORD (we will not carry an unbounded observation) and books NO PRICE (we never saw one) — `price: null`, and the caller
 * closes the trade `timeout_unpriced` with empty outcomes. The arm names stay: they say WHY there was no price.
 *  ⛔ `8a-P4c` increment 3 (P8b): the `clamp_class_seam` arm is GONE — xStock books on the same three arms as crypto,
 *     its bid from the VTS xStock exit guard (`selectVtsXstockExitBid` in vts-runner.ts). With no class branch left,
 *     the `assetClass` argument was unread and is removed (Langston Step-4 nit; §15 disposition (a)).
 */
export type VtsBookingArm = 'bid' | 'clamp_no_mark' | 'clamp_no_bid';

export interface VtsBookedExit {
  /** `null` ⇔ a clamp arm: the exit closes with no recorded price (`3n.q3`). */
  price: number | null;
  arm: VtsBookingArm;
}

const usable = (x: number | null | undefined): x is number => x != null && Number.isFinite(x) && x > 0;

export function resolveVtsBookedExitPrice(
  observedBid: number | null | undefined,
  observedMark: number | null | undefined,
): VtsBookedExit {
  if (!usable(observedMark)) return { price: null, arm: 'clamp_no_mark' };
  if (!usable(observedBid)) return { price: null, arm: 'clamp_no_bid' };
  return { price: observedBid, arm: 'bid' };
}
