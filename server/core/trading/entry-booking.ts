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
