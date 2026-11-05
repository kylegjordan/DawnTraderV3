/**
 * `B-ENTRY-GATE` (`#1224`) increment A — THE ENTRY WINDOW AT THE TAKER FILL (scope OBJ-1, OBJ-1b; pre-audit P1, P1b).
 *
 * Kyle KD-10 (2026-11-04): enter only near the price the plan was built on. The window applies to the WORSE side only:
 * a buy that pays more than `w` × the planned risk ABOVE the planned entry is refused. A price below the planned entry is
 * never refused by the window; it is recorded against a cheaper-side floor `m`, WATCH-ONLY in this batch.
 *
 * `adverseR` is `entryFillShadow`'s own measure, `(fill − plannedEntry) / (plannedEntry − stop)` (`entry-booking.ts:60`),
 * so the window and the shadow can never disagree about what "how far from plan" means. Both thresholds are DB settings
 * (`entry_gate` module, per class); the caller reads them and fails hard when a row is absent — no default here.
 *
 * Pure: no I/O, no settings reads.
 */

export type EntryWindowRefusal = 'entry_window';

/**
 * Refuse a fill whose adverse move exceeds the worse-side window. `adverseR === null` (no valid planned risk) is not a
 * window refusal: that geometry is `refuseTakerBooking`'s job, and a guess here would hide it.
 */
export function entryWindowRefusal(adverseR: number | null, worseSideFrac: number): EntryWindowRefusal | null {
  if (!Number.isFinite(worseSideFrac) || worseSideFrac < 0) {
    throw new Error(`entryWindowRefusal: worseSideFrac must be a finite non-negative number, got ${String(worseSideFrac)}`);
  }
  if (adverseR === null || !Number.isFinite(adverseR)) return null;
  return adverseR > worseSideFrac ? 'entry_window' : null;
}

/**
 * The same window for a booking site that has no `entryFillShadow` record (the VTS entries, P3v): the adverse move of
 * `fill` from `plannedEntry`, in units of the planned risk `plannedEntry − stop`, judged against `worseSideFrac`.
 * Same definition as `entryFillShadow.adverseR`; a non-positive planned risk is not a window refusal.
 */
export function entryWindowRefusalAt(fill: number, plannedEntry: number, stop: number, worseSideFrac: number): EntryWindowRefusal | null {
  const plannedRisk = plannedEntry - stop;
  const adverseR = Number.isFinite(fill) && Number.isFinite(plannedEntry) && plannedRisk > 0 ? (fill - plannedEntry) / plannedRisk : null;
  return entryWindowRefusal(adverseR, worseSideFrac);
}

export interface CheaperSideRecord {
  /** `(fill − stop) / (plannedEntry − stop)` = `1 + adverseR`; only for a fill BELOW the planned entry, else null. */
  remainingRiskFrac: number | null;
  /** `remainingRiskFrac < floor`; null when the fill is not below plan or cannot be judged. Never refuses. */
  belowFloor: boolean | null;
}

/** The cheaper-side record (WATCH-ONLY, KD-10). A fill at or above plan carries nulls: the floor does not apply to it. */
export function cheaperSideRecord(adverseR: number | null, floorFrac: number): CheaperSideRecord {
  if (!Number.isFinite(floorFrac) || floorFrac < 0) {
    throw new Error(`cheaperSideRecord: floorFrac must be a finite non-negative number, got ${String(floorFrac)}`);
  }
  if (adverseR === null || !Number.isFinite(adverseR) || adverseR >= 0) return { remainingRiskFrac: null, belowFloor: null };
  const remainingRiskFrac = 1 + adverseR;
  return { remainingRiskFrac, belowFloor: remainingRiskFrac < floorFrac };
}
