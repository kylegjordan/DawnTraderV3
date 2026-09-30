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
}

/** Round-trip booked friction as a fraction of notional. The spread half is charged ONLY on a leg booked at a level. */
export function composeVtsLegFriction(i: VtsLegFrictionInput): number {
  const entrySpread = i.entryPriceBasis === 'level' ? i.spread / 2 : 0;
  const exitSpread = i.exitSideBooked ? 0 : i.spread / 2;
  return i.entryFee + i.exitFee + i.slippage * 2 + entrySpread + exitSpread;
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
export function vtsSpreadShareByLeg(t: { entryPriceBasis?: EntryPriceBasis; frictionBasis?: VtsFrictionBasis; exitBookingArm?: string },
  closed: boolean): { entry: number; exit: number } {
  if (t.entryPriceBasis === undefined) return { entry: 0.5, exit: 0.5 };
  const entry = t.entryPriceBasis === 'level' ? 0.5 : 0;
  const exit = closed && t.frictionBasis === 'recomposed' && t.exitBookingArm !== 'bid' ? 0.5 : 0;
  return { entry, exit };
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

export function recomposeVtsCloseFriction(t: VtsFrictionRecord, exitArm: VtsBookingArm): VtsCloseFriction {
  const refuse = (missing: string): VtsCloseFriction =>
    ({ friction: t.frictionCost, basis: 'stamped', entryPriceBasis: null, legacyBasis: false, missing });
  const components = [t.costEntryFeeFraction, t.costExitFeeFraction, t.costSlippageFraction, t.costSpreadFraction];
  if (components.every((c) => c === undefined || c === null)) {
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
  });
  return { friction, basis: 'recomposed', entryPriceBasis: basis, legacyBasis, missing: null };
}
