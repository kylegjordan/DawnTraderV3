/**
 * B-XSTOCK-FEE-CONTRACT (#1010, Langston Step-1 ruling 1): the boot sanity rail for the
 * `fee_model` rows, as pure functions so the rail is unit-testable without a database.
 *
 * ⛔ A FEE IS SIGNED. Kraken's Pro xStocks schedule pays a maker REBATE (−0.02 %) at every
 * rung, and futures maker turns negative from rung 11. The old `(0, 0.05]` rail was written
 * when a fee could only be a cost, and it refused to start the server on a correct value.
 *
 * These bounds are SANITY rails against a fat-fingered row (−0.02 typed for −0.0002), not
 * decision constants — so they live in code, not in module_constants (Langston's ruling).
 */
export const FEE_RAIL_MAX = 0.05;
export const MAKER_REBATE_FLOOR = -0.001;

export type FeeConstant = 'spot_taker_fee' | 'spot_maker_fee';

/** null when the value is sane; otherwise the refusal message the warmup throws. */
export function feeRailViolation(assetClass: string, constant: FeeConstant, v: number): string | null {
  if (!Number.isFinite(v)) {
    return `[B45][warmup] fee_model.${constant} for '${assetClass}' = ${v} is not a finite number — refusing to start.`;
  }
  // A taker fee must be STRICTLY positive. The row being absent is already caught upstream —
  // getCachedNumberRequired throws on a missing row — so `> 0` refuses only a deliberately written zero.
  // That refusal is intended: a zero taker fee is not on any schedule we trade today. If a venue schedule ever
  // puts a taker fee at exactly 0, the batch that writes that zero must widen this rail in the same change
  // (Langston, B-XSTOCK-FEE-CONTRACT Step-4 note, 2026-09-11).
  if (constant === 'spot_taker_fee') {
    return v > 0 && v <= FEE_RAIL_MAX
      ? null
      : `[B45][warmup] fee_model.spot_taker_fee for '${assetClass}' = ${v} is outside the sane (0, ${FEE_RAIL_MAX}] taker range — refusing to start.`;
  }
  return v >= MAKER_REBATE_FLOOR && v <= FEE_RAIL_MAX
    ? null
    : `[B45][warmup] fee_model.spot_maker_fee for '${assetClass}' = ${v} is outside the sane [${MAKER_REBATE_FLOOR}, ${FEE_RAIL_MAX}] maker range (a rebate is negative, but never below the floor) — refusing to start.`;
}

/** Per class, after both rates are read: no venue schedule charges more to rest an order than to take one. */
export function makerAboveTakerViolation(assetClass: string, maker: number, taker: number): string | null {
  return maker <= taker
    ? null
    : `[B45][warmup] fee_model for '${assetClass}': maker ${maker} > taker ${taker} — a maker fee above the taker fee is not a venue schedule; refusing to start.`;
}
