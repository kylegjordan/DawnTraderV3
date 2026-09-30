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

export interface VtsCloseFriction {
  friction: number;
  basis: 'recomposed' | 'stamped';
  /** The entry basis the recomposition used (`null` when it was refused). */
  entryPriceBasis: EntryPriceBasis | null;
  /** The stamp was absent and the legacy reading was used (counted by the caller; must reach 0 after MAX_HOLD). */
  legacyBasis: boolean;
  /** The first missing input, when refused. */
  missing: string | null;
}

const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

export function recomposeVtsCloseFriction(t: VtsFrictionRecord, exitArm: VtsBookingArm): VtsCloseFriction {
  const refuse = (missing: string): VtsCloseFriction =>
    ({ friction: t.frictionCost, basis: 'stamped', entryPriceBasis: null, legacyBasis: false, missing });
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
