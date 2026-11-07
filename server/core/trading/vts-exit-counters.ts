/**
 * `3n.q3` B-VTS-NO-DECISION-VALVE (P7, Langston Step-1 condition C1) — the VTS exit counters, KEYED PER ASSET CLASS,
 * one set per lane (real `[8a-P3][VTS_TOUCH]`, shadow `[8a-P3][VTS_SHADOW_TOUCH]`), printed once per resolve pass and reset.
 *
 * ⛔ WHY PER CLASS: before this, the real lane's `exitLooks` counted crypto only while `exitNoTransactableSide` and the
 * clamp counter counted every class — an xStock numerator over a crypto denominator — and the line printed only when a
 * CRYPTO look happened, so a pass holding only xStock trades printed nothing while the reset still wiped its increments.
 * The shadow lane counted crypto only, so it would read 0 for every xStock unpriced close.
 *
 * ⛔ THE UNPRICED COUNTERS REPLACE `bookedNoBidClamp`: after P1 nothing BOOKS at a clamp — a max-hold exit with no usable
 * sell side closes with no price (`timeout_unpriced`) — so a `booked…Clamp` counter would read 0 forever. The counter
 * schema change is also the build boundary (MEMORY 0.a-2: split a boundary by counter schema, never by a clock).
 *  - `unpricedNoBid`  — the arm `clamp_no_bid`: a live mark, no usable bid (Class A).
 *  - `unpricedNoMark` — the arm `clamp_no_mark`: no live mark (Class B).
 *  - `closedUnpriced` — unpriced closes the close loop COMPLETED (twins included, though a twin writes no archive row).
 *    ⚠️ NOT a per-line reconcile with the two arms: the arms are counted BEFORE the pass's reset and the closes AFTER it,
 *    so a pass's `closedUnpriced` prints on the NEXT line (and waits, or is lost on a restart, if the map empties first).
 *    Summed over a window it should equal the arms' sum, less those edge cases (Langston Step-4 record item).
 */
import type { VtsBookingArm } from './vts-exit-booking.js';

export const VTS_COUNTER_CLASSES = ['crypto_spot', 'xstock_spot'] as const;
export type VtsCounterClass = (typeof VTS_COUNTER_CLASSES)[number];

export interface VtsExitCounters {
  exitLooks: number;
  exitNoTransactableSide: number;
  unpricedNoBid: number;
  unpricedNoMark: number;
  closedUnpriced: number;
  /** KD-19 P9: priced exits WALKED over stated sizes; of those, any extrapolated beyond them; and uncertain (rounded) ones. */
  walked: number;
  walkExtrapolated: number;
  walkUncertain: number;
  /** KD-19 P9: priced exits booked at the top bid — no stated size, or no depth config (the latter logged at error). */
  sizeAbsent: number;
  noDepthConfig: number;
  /** KD-19 Step-4 item 2: a PRICED real-lane exit with no quantity (the case paper refuses as `invalid_close_qty`). */
  unitLane: number;
}

export type VtsExitCountersByClass = Record<VtsCounterClass, VtsExitCounters>;

const zero = (): VtsExitCounters => ({
  exitLooks: 0, exitNoTransactableSide: 0, unpricedNoBid: 0, unpricedNoMark: 0, closedUnpriced: 0,
  walked: 0, walkExtrapolated: 0, walkUncertain: 0, sizeAbsent: 0, noDepthConfig: 0, unitLane: 0,
});

export function newVtsExitCounters(): VtsExitCountersByClass {
  return { crypto_spot: zero(), xstock_spot: zero() };
}

/** The class's counter set, or `null` for a class VTS does not trade (it is never counted into another class's cell). */
export function countersFor(c: VtsExitCountersByClass, assetClass: string | undefined): VtsExitCounters | null {
  return assetClass === 'crypto_spot' || assetClass === 'xstock_spot' ? c[assetClass] : null;
}

/** Count one unpriced exit by its arm. A `bid` arm is priced and is never counted here. */
export function countUnpricedArm(c: VtsExitCounters | null, arm: VtsBookingArm): void {
  if (c === null) return;
  if (arm === 'clamp_no_bid') c.unpricedNoBid++;
  else if (arm === 'clamp_no_mark') c.unpricedNoMark++;
}

/** KD-19 P9: count one PRICED booking by how its size was known. Unpriced arms are counted by `countUnpricedArm`. */
export function countVtsExitWalk(c: VtsExitCounters | null, w: { price: number | null; sizeBasis: string; extrapolatedQty: number; sizeCertain: boolean }): void {
  if (c === null || w.price === null) return;
  if (w.sizeBasis === 'exact' || w.sizeBasis === 'rest_rounded_up') {
    c.walked++;
    if (w.extrapolatedQty > 0) c.walkExtrapolated++;
    if (!w.sizeCertain) c.walkUncertain++;
  } else if (w.sizeBasis === 'no_depth_config') c.noDepthConfig++;
  else if (w.sizeBasis === 'absent') c.sizeAbsent++;
  else if (w.sizeBasis === 'unit_lane') c.unitLane++;
}

export function anyVtsExitCount(c: VtsExitCountersByClass): boolean {
  return VTS_COUNTER_CLASSES.some((k) => Object.values(c[k]).some((v) => v > 0));
}

/** `crypto_spot{exitLooks=… …} xstock_spot{…}` — every class always printed, so a zero is a printed zero, not an absence. */
export function formatVtsExitCounters(c: VtsExitCountersByClass): string {
  return VTS_COUNTER_CLASSES.map((k) => {
    const v = c[k];
    return `${k}{exitLooks=${v.exitLooks} exitNoTransactableSide=${v.exitNoTransactableSide} unpricedNoBid=${v.unpricedNoBid} `
      + `unpricedNoMark=${v.unpricedNoMark} closedUnpriced=${v.closedUnpriced} walked=${v.walked} walkExtrapolated=${v.walkExtrapolated} `
      + `walkUncertain=${v.walkUncertain} sizeAbsent=${v.sizeAbsent} noDepthConfig=${v.noDepthConfig} unitLane=${v.unitLane}}`;
  }).join(' ');
}

export function resetVtsExitCounters(c: VtsExitCountersByClass): void {
  for (const k of VTS_COUNTER_CLASSES) c[k] = zero();
}
