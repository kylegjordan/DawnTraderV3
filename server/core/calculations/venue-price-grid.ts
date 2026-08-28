/**
 * F-G-1 / B-GRID-REPRESENTABILITY (OBJ-7, OBJ-7b, OBJ-3) — VENUE PRICE GRID.
 *
 * WHY THIS EXISTS. Measured 2026-08-27 on 406 closed crypto trades, each matched to its OWN
 * published Kraken `tick_size`: entry prices are 80.8% representable, STOPS 2.7%, TARGETS 9.9%.
 * Entries inherit validity from an observed print; stops and targets are ATR-derived floats and
 * are overwhelmingly prices the venue CANNOT EXPRESS. Two consequences:
 *   (i)  LIVE-PARITY DEBT — in live mode these become real order prices and are rejected or
 *        silently re-priced, so paper and live diverge at the exact moment of exit.
 *   (ii) OBJ-8 DISCRIMINATION — for an off-grid limit, `high > limit` and `high >= limit` are
 *        THE SAME PREDICATE, because `high` can never equal a price the venue cannot express.
 *        Through-vs-touch therefore has an empty discriminating cell BY CONSTRUCTION.
 *
 * DELIBERATELY PURE. No imports, matching its neighbours in this directory. The venue tick is
 * passed IN; resolving it from venue metadata is the caller's job. That keeps the rounding rules
 * — which are geometry decisions — independently testable from the metadata lookup.
 *
 * ⛔ THE ROUNDING FUNCTION TAKES NO GATE RESULT AS INPUT, BY DESIGN (Langston's condition).
 * That mechanically forbids re-rounding a signal to make it pass: rounding to nearest is
 * deterministic, so "round again" could only mean rounding the OTHER way, and choosing the
 * direction that lets a trade through is shopping for a pass.
 */

/** A price's role in the trade, which determines its rounding DIRECTION. */
export type PriceRole = 'entry' | 'stop' | 'target';

export type GridRefusal =
  /** A leg is missing, non-finite or non-positive. No side exists; never default to long. */
  | 'invalid_triple'
  /** stop > entry > target — reads as a clean SHORT. Zero shorts have ever been taken. */
  | 'short_side_unexercised'
  /** Neither long-shaped nor short-shaped (e.g. #915's inverted stop). Not orderable. */
  | 'unorderable_triple'
  /** The venue grid for this symbol is unknown. NEVER silently default (no hard-coded fallback). */
  | 'grid_unknown'
  /** Rounding collapsed the geometry: entry/stop/target no longer strictly separated. */
  | 'degenerate_after_rounding';

export interface GridResult {
  ok: boolean;
  reason?: GridRefusal;
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  /** True where every leg is an exact multiple of the tick. */
  representable: boolean;
}

/**
 * Decimal places implied by a tick, used only to kill floating-point dust after the
 * integer-space arithmetic below. `0.00001` -> 5. Ticks on Kraken are powers of ten today
 * (11 distinct values across 1,437 pairs), but this does NOT assume that — see `snap`.
 */
function decimalsOf(tick: number): number {
  const s = tick.toExponential();
  const exp = Number(s.slice(s.indexOf('e') + 1));
  return exp < 0 ? Math.min(12, -exp) : 0;
}

type Dir = 'nearest' | 'up' | 'down';

/**
 * Snap `price` onto the `tick` grid in integer tick-space.
 *
 * ⚠️ Integer-space is not cosmetic: `price % tick` on floats gives 0.009999999 for values that
 * are exactly on the grid, so a naive modulo would report on-grid prices as off-grid.
 * The `EPS` nudge absorbs that same representation error before flooring/ceiling, so a value
 * already sitting on the grid is never pushed a whole tick away by dust.
 *
 * TIE RULE (entry only, the sole `nearest` caller): HALF-UP. Stated because Langston required
 * it be stated, though he also ruled it is not the decision that matters — DIRECTION is.
 */
function snap(price: number, tick: number, dir: Dir): number {
  const q = price / tick;
  const EPS = 1e-9;
  let n: number;
  if (dir === 'nearest') n = Math.floor(q + 0.5);           // half-up
  else if (dir === 'up') n = Math.ceil(q - EPS);
  else n = Math.floor(q + EPS);
  return Number((n * tick).toFixed(decimalsOf(tick)));
}

/** True when `price` is an exact multiple of `tick`, computed in integer space. */
export function isOnGrid(price: number, tick: number): boolean {
  const q = price / tick;
  return Math.abs(q - Math.round(q)) < 1e-9;
}

/**
 * Round one price according to its ROLE. Exported for fencing; the pipeline calls
 * `roundTripleToGrid`, which is the only form that can see the pairwise invariant.
 *
 * DIRECTION BY ROLE, and the reason is what KIND of quantity each price is:
 *  - ENTRY  is a point estimate (an observed print) -> NEAREST.
 *  - STOP   is a BOUNDARY -> AWAY from entry. Measured: nearest rounding moves the stop TOWARD
 *           entry on 197 of 398 long crypto trades (49.5%), and our stops are structural levels
 *           (`supportLevel`, `min(c2Low,c1Low)`, `parentLow`), so half of all stops would land
 *           INSIDE the structure they were deliberately placed behind. That is a design
 *           violation, not noise. Cost of the safe direction: +0.241% median extra risk.
 *  - TARGET is normally a FLOOR ("at least K x ATR") -> AWAY from entry.
 *    ⛔ EXCEPT where the target is a CAP. `volatility-edge.ts:189` is
 *       `Math.min(measuredMoveTarget, atrTarget)` — its design says AT MOST the measured move,
 *       so rounding it away pushes it PAST the bound it was defined by. A boundary rounded OUT
 *       of the thing it bounds is as wrong as one rounded INTO it. That is the ONLY cap found.
 */
export function roundPriceForRole(
  price: number,
  tick: number,
  role: PriceRole,
  isLong: boolean,
  targetIsCap = false,
): number {
  if (role === 'entry') return snap(price, tick, 'nearest');
  const awayIsUp = role === 'stop' ? !isLong : isLong;
  const dir: Dir = (role === 'target' && targetIsCap) ? (awayIsUp ? 'down' : 'up')
                                                      : (awayIsUp ? 'up' : 'down');
  return snap(price, tick, dir);
}

/**
 * Round a whole signal onto the venue grid.
 *
 * ⛔⛔ THE INVARIANT IS PAIRWISE, NOT PER-PRICE (Langston, and it is a defect this function
 * exists to avoid). Rounding each price safely on its own does NOT make the PAIR safe: with
 * tick 0.01, a stop of 99.99 is already representable and does not move, while an entry of
 * 99.9949 rounds NEAREST to 99.99 — RISK DISTANCE ZERO. Two guards follow from that:
 *   1. "Away" is measured from the ROUNDED entry, not the raw one. Fix the anchor, then move
 *      the boundaries off it.
 *   2. The ROUNDED TRIPLE is asserted: strict ordering AND at least one tick of separation.
 *      A fence that checks "no stop moved toward entry" against the UNROUNDED entry cannot see
 *      the case above, because there the stop never moves at all.
 */
export function roundTripleToGrid(
  entryPrice: number,
  stopPrice: number,
  targetPrice: number,
  tick: number | null | undefined,
  opts: { targetIsCap?: boolean; symbol?: string } = {},
): GridResult {
  const fail = (reason: GridRefusal): GridResult => ({
    ok: false, reason, entryPrice, stopPrice, targetPrice, representable: false,
  });

  const finite = (v: number) => Number.isFinite(v) && v > 0;
  if (!finite(entryPrice) || !finite(stopPrice) || !finite(targetPrice)) return fail('invalid_triple');

  // NO HARD-CODED FALLBACK. If the venue grid is unknown we refuse; we do not invent one.
  if (!finite(tick as number)) return fail('grid_unknown');
  const t = tick as number;

  // SIDE IS DERIVED FROM THE ORDERING, not carried. `StrategySignal` has no side field, and
  // measured across all 646 closed trades with a full triple: 634 are unambiguously long-shaped,
  // 0 short-shaped, 12 neither (#915's inverted stops).
  const isLong = stopPrice < entryPrice && targetPrice > entryPrice;
  const isShort = targetPrice < entryPrice && stopPrice > entryPrice;

  // ⛔ THE SHORT BRANCH REFUSES AND DOES NOT COMPUTE. A fully-inverted long is ORDERABLE and
  // reads as a clean short; side-inference cannot tell them apart. Zero shorts have ever been
  // taken, so a short-shaped triple today can ONLY be a defect — and pricing it as a valid short
  // would silently launder that defect into a trade. Refusing makes "unexercised" self-announcing
  // rather than a limitation someone has to remember to re-verify at the first real short.
  if (isShort) return fail('short_side_unexercised');
  if (!isLong) return fail('unorderable_triple');

  const e = snap(entryPrice, t, 'nearest');
  const s = roundPriceForRole(stopPrice, t, 'stop', true);
  const g = roundPriceForRole(targetPrice, t, 'target', true, opts.targetIsCap === true);

  // THE PAIRWISE ASSERTION. Strict ordering AND >= 1 tick of separation on both legs.
  const oneTick = t * (1 - 1e-9);
  if (!(e - s >= oneTick) || !(g - e >= oneTick)) return fail('degenerate_after_rounding');

  return {
    ok: true,
    entryPrice: e,
    stopPrice: s,
    targetPrice: g,
    representable: isOnGrid(e, t) && isOnGrid(s, t) && isOnGrid(g, t),
  };
}

/**
 * OBJ-7b kind (i) — VENUE-IMPOSSIBLE. Rounding the PRICE is not enough: the venue quantises
 * SIZE too, and a rounded price on an unroundable quantity is still an invalid order.
 * Quantity rounds DOWN (never buy more than sized), then must clear `ordermin` and `costmin`.
 *
 * Returns null when the order cannot be placed at all — the caller records that as a distinct
 * reject kind from a gate-marginal refusal, because the two mean opposite things: many of these
 * says our sizing is too small for the venue; many gate-marginal says our gates are tuned finer
 * than the market's resolution.
 */
export function roundQuantityForVenue(
  quantity: number,
  price: number,
  lotDecimals: number | null | undefined,
  ordermin: number | null | undefined,
  costmin: number | null | undefined,
): { quantity: number } | null {
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  if (lotDecimals == null || !Number.isFinite(lotDecimals)) return null; // no fallback
  const step = Math.pow(10, -lotDecimals);
  const q = Number((Math.floor(quantity / step + 1e-9) * step).toFixed(Math.min(12, lotDecimals)));
  if (q <= 0) return null;
  if (ordermin != null && Number.isFinite(ordermin) && q < ordermin) return null;
  if (costmin != null && Number.isFinite(costmin) && q * price < costmin) return null;
  return { quantity: q };
}
