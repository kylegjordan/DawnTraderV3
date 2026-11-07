/**
 * `B-PRICE-SIDE-BY-JOB` row `8a-P4c` increment 3a-ii (plan §C3, P14; `#1118`) — VTS BOOKED FRICTION, PER LEG.
 *
 * ⭐ SPREAD IS EITHER GEOMETRY OR FRICTION — NEVER BOTH (`cost-model.ts`, `composeSidedFriction`'s docblock). The old
 * booked friction (`composeBookedFriction`) charges the FULL spread on the premise that both legs are mid-priced. Since
 * `8a-P3` (2026-09-15) crypto VTS exits book the BID, so their exit half-spread was paid twice (`#1118`); a maker entry
 * fills at its limit and never paid a half at all. Here each leg carries its half-spread ONLY if it was booked at a
 * level that is not a side:
 *   - entry: `'level'` (a taker at the signal's level) ⇒ ½·spread; `'ask'` (a taker at the guarded ask) or `'limit'`
 *     (a maker filled at its limit) ⇒ none;
 *   - exit: booked on its side (arm `bid`) ⇒ none; booked at a clamp (`clamp_no_bid`, `clamp_no_mark`) ⇒ ½·spread.
 *
 * ⛔ Friction is RECOMPOSED AT CLOSE from the stored components (Langston BLOCKER-1: the VTS calibration epoch is
 * resolved at close, friction was stamped at open — so every close after the deploy must carry the ONE rule).
 * Every input must be present: a missing one is REFUSED, never fabricated (BLOCKER-2). A close cannot be refused, so a
 * refused recomposition keeps the stamped scalar and says so (`basis: 'stamped'`, J7) — the caller alerts and counts.
 * An absent `entryPriceBasis` is a LEGACY row (every open writer stamps it from increment 3 on — BLOCKER-3, no clock):
 * a taker reads `'level'`, a maker `'limit'` — both true of every writer before the stamp existed — and is counted.
 * Pure: no I/O.
 */
import type { VtsBookingArm } from './vts-exit-booking.js';

export type EntryPriceBasis = 'ask' | 'level' | 'limit';

/** The basis an open writer stamps: a maker fills at its limit; a taker at the ask when it was booked there. */
export function entryPriceBasisFor(mode: 'maker' | 'taker', takerBookedAtAsk: boolean): EntryPriceBasis {
  if (mode === 'maker') return 'limit';
  return takerBookedAtAsk ? 'ask' : 'level';
}

export interface VtsLegFrictionInput {
  entryFee: number;
  exitFee: number;
  slippage: number;
  spread: number;
  entryPriceBasis: EntryPriceBasis;
  /** The exit leg was booked on its transactable side (arm `bid`). */
  exitSideBooked: boolean;
  /**
   * KD-19 (c) exit leg (plan P6; Langston BLOCKER-1): the exit price was WALKED over a size we can trust, so it already
   * carries its own impact and the fixed slippage allowance leaves THIS leg. `false`/absent ⇒ the allowance stays (the
   * open-time estimate, a sizeless or unit-lane exit, an uncertain rounded REST size). The entry leg keeps its allowance
   * until the later KD-19 increment (row 17).
   */
  exitImpactPriced?: boolean;
}

/** Round-trip booked friction as a fraction of notional. The spread half is charged ONLY on a leg booked at a level. */
export function composeVtsLegFriction(i: VtsLegFrictionInput): number {
  const entrySpread = i.entryPriceBasis === 'level' ? i.spread / 2 : 0;
  const exitSpread = i.exitSideBooked ? 0 : i.spread / 2;
  // KD-19 (c), C6-narrowed condition: ONE doubled term split per leg — entry always, exit unless its impact was priced.
  const entrySlippage = i.slippage;
  const exitSlippage = i.exitImpactPriced === true ? 0 : i.slippage;
  return i.entryFee + i.exitFee + entrySlippage + exitSlippage + entrySpread + exitSpread;
}

/**
 * KD-19 P6 — the SLIPPAGE allowance's share per leg in the P19-B8.7 cost split, under the same gate as the spread share
 * below (Langston Step-2 r2 condition L2): only a CLOSED row whose friction was RECOMPOSED dropped the exit allowance — a
 * `stamped` close kept the open-time scalar, which still holds the allowance twice, so its exit share stays 1 and the
 * columns still sum to `costs`. Returns multiples of `costSlippageFraction` for each leg.
 */
/** The fields the two cost-split readers take — one record shape, so an open trade and a closed one pass the same way. */
export interface VtsCostSplitRecord {
  entryPriceBasis?: EntryPriceBasis;
  frictionBasis?: VtsFrictionBasis;
  exitBookingArm?: string;
  exitWalk?: { impactPriced?: boolean } | null;
}

export function vtsSlippageShareByLeg(t: VtsCostSplitRecord,
  closed: boolean): { entry: number; exit: number } {
  const exit = closed && t.frictionBasis === 'recomposed' && t.exitWalk?.impactPriced === true ? 0 : 1;
  return { entry: 1, exit };
}

/**
 * The spread's share per leg in the P19-B8.7 five-column cost split (`costEntrySlippage` / `costExitSlippage`), so the
 * columns sum to the booked `costs` under the SAME per-leg rule (Langston 3a-ii FINDING-1: the split still added a full
 * spread after P14, overstating by D×spread on a maker + bid close and D×spread/2 on a taker-at-level + bid close).
 *   - a row with no `entryPriceBasis` is LEGACY: its `frictionCost` was composed with the full spread ⇒ ½ + ½;
 *   - entry: ½ iff the entry was booked at a `'level'`;
 *   - exit: on a CLOSED row whose friction was recomposed, ½ iff the exit booked on a clamp (not `'bid'`); on an OPEN row
 *     or a `stamped` close, 0 — the open-time estimate assumes the exit books its side.
 * Returns the fractions of `spread` for each leg.
 */
export function vtsSpreadShareByLeg(t: VtsCostSplitRecord,
  closed: boolean): { entry: number; exit: number } {
  if (t.entryPriceBasis === undefined) return { entry: 0.5, exit: 0.5 };
  const entry = t.entryPriceBasis === 'level' ? 0.5 : 0;
  const exit = closed && t.frictionBasis === 'recomposed' && t.exitBookingArm !== 'bid' ? 0.5 : 0;
  return { entry, exit };
}

/**
 * The fee per leg for the P19-B8.7 cost columns (Langston 3a-ii r2 FINDING-1): the leg's OWN fee fraction when the record
 * carries both (F-G-2 OBJ-5b onward) — so a maker entry shows the maker fee, and on xStock a REBATE shows as negative —
 * else the blended `costFeeFraction` on both legs (a pre-OBJ-5b row carries nothing finer; its SUM is still right).
 * Returns null when there is no fee figure at all (the columns render em-dashes).
 */
export function vtsFeeByLeg(t: { costFeeFraction?: number; costEntryFeeFraction?: number; costExitFeeFraction?: number }):
  { entry: number; exit: number } | null {
  const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
  if (fin(t.costEntryFeeFraction) && fin(t.costExitFeeFraction)) return { entry: t.costEntryFeeFraction, exit: t.costExitFeeFraction };
  if (fin(t.costFeeFraction)) return { entry: t.costFeeFraction, exit: t.costFeeFraction };
  return null;
}

/** The fields a closing VTS trade carries (all optional on the record: absent on pre-B8.7 / pre-F-G-2 rows). */
export interface VtsFrictionRecord {
  frictionCost: number;
  chosenEntryMode?: 'maker' | 'taker';
  entryPriceBasis?: EntryPriceBasis;
  costEntryFeeFraction?: number;
  costExitFeeFraction?: number;
  costSlippageFraction?: number;
  costSpreadFraction?: number;
}

export type VtsFrictionBasis = 'recomposed' | 'stamped' | 'unpriced';

export interface VtsCloseFriction {
  friction: number;
  /** `recomposed` — the per-leg rule ran. `stamped` — a writer LOST an input (partial absence): the stamped scalar is
   *  kept, and that is the tripwire (alerted). `unpriced` — the record never carried ANY cost input (all four absent):
   *  a lane that was never priced (today the shadow lane, which books `frictionCost: 0`); counted, never alerted
   *  (Langston 3a-ii BLOCKER-1 — a tripwire that fires ~1,870/day on a non-defect decides nothing). */
  basis: VtsFrictionBasis;
  /** The entry basis the recomposition used (`null` when it was refused). */
  entryPriceBasis: EntryPriceBasis | null;
  /** The stamp was absent and the legacy reading was used (counted by the caller; no NEW ones once every pre-stamp trade
   *  has closed, i.e. within MAX_HOLD of the deploy). */
  legacyBasis: boolean;
  /** The first missing input, when refused. */
  missing: string | null;
}

const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

export function recomposeVtsCloseFriction(t: VtsFrictionRecord, exitArm: VtsBookingArm,
  /** KD-19 P6: the booking's `impactPriced` (`bookVtsExit`). Default false — the allowance stays. */
  exitImpactPriced = false): VtsCloseFriction {
  const refuse = (missing: string): VtsCloseFriction =>
    ({ friction: t.frictionCost, basis: 'stamped', entryPriceBasis: null, legacyBasis: false, missing });
  // `unpriced` needs ALL FIVE absent — the four fractions AND `chosenEntryMode` (Langston r2 BLOCKER-1): every priced writer
  // stamps `chosenEntryMode`, so a record that still carries it but lost all four fractions is the MAXIMAL lost-input case
  // and must refuse (and alert), not read as unpriced. The predicate reads exactly the set the shadow-lane fence pins.
  // `legacyBasis: false` is structural on this arm: with no `chosenEntryMode` there is no legacy reading to take.
  const components = [t.costEntryFeeFraction, t.costExitFeeFraction, t.costSlippageFraction, t.costSpreadFraction];
  if (t.chosenEntryMode === undefined && components.every((c) => c === undefined || c === null)) {
    return { friction: t.frictionCost, basis: 'unpriced', entryPriceBasis: null, legacyBasis: false, missing: null };
  }
  if (t.chosenEntryMode !== 'maker' && t.chosenEntryMode !== 'taker') return refuse('chosenEntryMode');
  if (!finite(t.costEntryFeeFraction)) return refuse('costEntryFeeFraction');
  if (!finite(t.costExitFeeFraction)) return refuse('costExitFeeFraction');
  if (!finite(t.costSlippageFraction)) return refuse('costSlippageFraction');
  if (!finite(t.costSpreadFraction)) return refuse('costSpreadFraction');
  const legacyBasis = t.entryPriceBasis === undefined;
  const basis: EntryPriceBasis = t.entryPriceBasis ?? (t.chosenEntryMode === 'maker' ? 'limit' : 'level');
  const friction = composeVtsLegFriction({
    entryFee: t.costEntryFeeFraction,
    exitFee: t.costExitFeeFraction,
    slippage: t.costSlippageFraction,
    spread: t.costSpreadFraction,
    entryPriceBasis: basis,
    exitSideBooked: exitArm === 'bid',
    exitImpactPriced: exitArm === 'bid' && exitImpactPriced,
  });
  return { friction, basis: 'recomposed', entryPriceBasis: basis, legacyBasis, missing: null };
}
