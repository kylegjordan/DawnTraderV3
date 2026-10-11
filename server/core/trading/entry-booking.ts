/**
 * `B-PRICE-SIDE-BY-JOB` row `8a-P4c` increment 3b (P9; Langston Step-4 r1 FINDING-1 + RIDER-A) — THE VTS ENTRY BOOKING
 * RULES, one module for every booking site (crypto open, xStock open, the twin).
 *
 * A TAKER books the guarded ASK outright; the stop and target stay the signal's levels (pessimism is fine). But an entry
 * leg carries NO spread ceiling (`ENTRY_LEG_NO_SPREAD_CEILING`), and that rationale — "a wider spread makes `ask ≤ limit`
 * harder" — is a RESTING-FILL argument: a taker never tests `ask ≤ limit`. So the booking itself must refuse an ask that
 * inverts the trade's own geometry: an ask AT OR THROUGH the target (the "win" is already spent) or AT OR THROUGH the
 * stop (the trade is born stopped out). Long-only, as every VTS trade is.
 *
 * WHY THE MAKER ARM IS EXEMPT, PER LANE (Langston 3b r2 condition 2): a maker books at its limit, which is the level.
 *   - crypto: BY CONSTRUCTION — `vts-runner.ts` builds `adjustedStopLoss = entryPrice − distance` and
 *     `adjustedTakeProfit = entryPrice + distance` from that same level, so the level sits strictly between them.
 *   - xStock: stop, target and entry are three independent `strategySignal` fields; the level is taken to sit between
 *     them by the signal's own geometry. That half is INFERRED-FROM-CODE — what `invalid_geometry` in `eval-cycle.ts`
 *     enforces has not been read for this purpose.
 *
 * WHAT EACH ARM BUYS on crypto (Langston 3b r2): the TARGET arm is genuinely new protection — the B53 geometry guard
 * refuses on the MID near the target, so an ASK through the target with the mid inside the band reaches here. The STOP
 * arm is reachable only through divergence between two non-simultaneous reads (the cached mid, which the B53 guard
 * already requires to sit above the stop, and the touch read at booking time). It is NOT dead code — keep it.
 *
 * FOURTH CALLER (`B-ENTRY-DISTANCE-GUARD`, sprint row 59): the ACTIVE engine's taker open (`active-execution-engine.ts`,
 * after the depth-walked fill, before any write). The long-only premise holds there too — the open is `side: 'buy'` and the
 * signal is `type: 'LONG'` — and its maker arm is likewise left alone (a maker books at its limit, which
 * `checkStopLossRequired` keeps above the stop).
 *
 * QUANTITY is the fixed dollars at the BOOKED price; a non-positive or non-finite price yields NO quantity (the caller
 * refuses) — never a zero-size trade, never a divide by zero (RIDER-A: one policy for all three sites).
 */
export type TakerBookingRefusal = 'ask_at_or_through_target' | 'ask_at_or_through_stop';

/** Why a TAKER booking at `ask` must be refused, or null when the ask sits strictly between the stop and the target. */
export function refuseTakerBooking(ask: number, stopLoss: number, takeProfit: number): TakerBookingRefusal | null {
  if (Number.isFinite(takeProfit) && ask >= takeProfit) return 'ask_at_or_through_target';
  if (Number.isFinite(stopLoss) && ask <= stopLoss) return 'ask_at_or_through_stop';
  return null;
}

/** Fixed dollars at the booked price; null when the price cannot size a trade. */
export function bookedQuantity(dollarValue: number, price: number | null | undefined): number | null {
  if (price === null || price === undefined || !Number.isFinite(price) || price <= 0) return null;
  if (!Number.isFinite(dollarValue) || dollarValue <= 0) return null;
  return dollarValue / price;
}

/**
 * `B-ENTRY-DISTANCE-GUARD` (sprint row 59 increment 1, OBJ-2 — SHADOW). Reward-to-risk measured at the FILL, against the
 * strategy's live `min_rr`, and the adverse move from the planned entry in units of the planned risk. It refuses nothing:
 * the pre-registered rule (`B_ENTRY_DISTANCE_GUARD_PRE_AUDIT.md` §0, §1.2) sent it to shadow — live it would have refused
 * about three opens in ten, because the floors sit within ~0.017 R of several strategies' own constant RR (`#1183`).
 * `floor === null` ⇒ the floor could not be read; `wouldRefuse` is then null, never a guess.
 */
export interface EntryFillShadow { rrFill: number | null; adverseR: number | null; wouldRefuse: boolean | null }
export function entryFillShadow(a: { fill: number; intended: number; stop: number; target: number; floor: number | null }): EntryFillShadow {
  const fin = (x: number) => Number.isFinite(x);
  const risk = a.fill - a.stop;
  const rrFill = fin(a.fill) && fin(a.stop) && fin(a.target) && risk > 0 ? (a.target - a.fill) / risk : null;
  const plannedRisk = a.intended - a.stop;
  const adverseR = fin(a.intended) && fin(a.fill) && plannedRisk > 0 ? (a.fill - a.intended) / plannedRisk : null;
  const wouldRefuse = a.floor === null || !fin(a.floor) || rrFill === null ? null : rrFill < a.floor;
  return { rrFill, adverseR, wouldRefuse };
}
