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
import { closeFillFull, type BookLevel } from '../../services/execution/depth-walk.js'; // KD-19 P5: paper's close walk, shared

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

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// KD-19 (b) + (c) exit leg — `B-PRICE-SIDE-BY-JOB` row 17 (scope `B_PRICE_SIDE_BY_JOB_KD19_SCOPE.md` §7 r2; plan
// `B_PRICE_SIDE_BY_JOB_KD19_PRE_AUDIT.md` P5, with Langston's Step-2 BLOCKER-1/-2 and condition L1).
// VTS exits are BOOKED THE WAY PAPER BOOKS THEM: `closeFillFull(quantity, levels we saw, beyondDepthPenaltyBps)` — the same
// function and the same DB-resolved penalty paper's close uses (`order-placer.ts`). The ARM is unchanged and still means
// "booked on its side" (D-K3 / C2: `vts-friction.ts` reads it for the half-spread). Beside it the booking records WHAT WE
// SAW: how many sized levels, how much of the order they held, how much was priced beyond them, and what kind of size it was.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

/** What kind of size priced the exit. `exact` / `rest_rounded_up` = walked over stated sizes; the rest = the top bid. */
export type VtsExitSizeBasis = 'exact' | 'rest_rounded_up' | 'absent' | 'unit_lane' | 'no_depth_config';

/** The bid depth the exit TRIGGER accepted: the book's levels (book rung) or one sized level (ticker rung / xStock row). */
export interface VtsExitDepth {
  levels: ReadonlyArray<BookLevel>;
  basis: 'exact' | 'rest_rounded_up';
}

export interface VtsBookedExitWalk extends VtsBookedExit {
  levelsSeen: number;
  walkedQty: number;
  extrapolatedQty: number;
  sizeBasis: VtsExitSizeBasis;
  /**
   * BLOCKER-1: the walk's verdict on whether the order FITS can be trusted. An exact size is certain. A REST size is a
   * CEILING overstated by less than one whole base unit, so it is certain only when `quantity <= stated - 1` (the true size
   * is above that). ⛔ Never loosen this bound to make (c) reach more closes — that restores BLOCKER-1 (plan §10 L4).
   */
  sizeCertain: boolean;
  /** (c): the exit leg's price already carries its own impact ⇒ the fixed slippage allowance leaves THIS leg. */
  impactPriced: boolean;
}

/** KD-19 P7 — what the close RECORD carries beside the arm (archive `state_snapshot.exitWalk`, the closed VTS JSON). */
export interface VtsExitWalkRecord {
  levelsSeen: number;
  walkedQty: number;
  extrapolatedQty: number;
  sizeBasis: VtsExitSizeBasis;
  sizeCertain: boolean;
  impactPriced: boolean;
}

export function exitWalkRecord(w: VtsBookedExitWalk): VtsExitWalkRecord {
  return { levelsSeen: w.levelsSeen, walkedQty: w.walkedQty, extrapolatedQty: w.extrapolatedQty, sizeBasis: w.sizeBasis,
    sizeCertain: w.sizeCertain, impactPriced: w.impactPriced };
}

/** The walk, guarded. Reached ONLY after the sized-level test (L1), so a throw here is a defect, never a shadow close. */
function walkVtsExit(quantity: number, levels: ReadonlyArray<BookLevel>, penaltyBps: number) {
  if (!(Number.isFinite(quantity) && quantity > 0)) {
    throw new Error(`[KD-19][VTS_EXIT_WALK] invalid quantity ${quantity} reached the walk — the sizeless route must take it`);
  }
  return closeFillFull(quantity, levels, penaltyBps);
}

export function bookVtsExit(i: {
  observedBid: number | null | undefined;
  observedMark: number | null | undefined;
  /** The trade's quantity. The shadow lane's is 0 by construction (unit sizing) ⇒ the top bid. */
  quantity: number;
  depth: VtsExitDepth | null;
  /** `fill_depth_gate.beyond_depth_penalty_bps` for the class; `null` when the config could not be resolved. */
  penaltyBps: number | null;
}): VtsBookedExitWalk {
  const booked = resolveVtsBookedExitPrice(i.observedBid, i.observedMark);
  const top = (sizeBasis: VtsExitSizeBasis): VtsBookedExitWalk => ({
    ...booked, levelsSeen: 0, walkedQty: 0, extrapolatedQty: 0, sizeBasis, sizeCertain: false, impactPriced: false,
  });
  if (booked.price === null) return top('absent');
  // ⛔ L1: the sizeless routes are taken BEFORE any quantity guard — every shadow close arrives with quantity 0.
  if (!(Number.isFinite(i.quantity) && i.quantity > 0)) return top('unit_lane');
  // BLOCKER-2: a level of qty <= 0 is NOT a sized level; it would price the whole order beyond the book at the penalty.
  const levels = (i.depth?.levels ?? []).filter((l) => l.price > 0 && Number.isFinite(l.qty) && l.qty > 0);
  if (i.depth === null || levels.length === 0) return top('absent');
  if (typeof i.penaltyBps !== 'number' || !Number.isFinite(i.penaltyBps)) return top('no_depth_config');
  const walked = walkVtsExit(i.quantity, levels, i.penaltyBps);
  const stated = levels.reduce((s, l) => s + l.qty, 0);
  const sizeCertain = i.depth.basis === 'exact' || i.quantity <= stated - 1;
  return {
    price: walked.avgFillPrice,
    arm: booked.arm,
    levelsSeen: levels.length,
    walkedQty: walked.walkedQty,
    extrapolatedQty: walked.extrapolatedQty,
    sizeBasis: i.depth.basis,
    sizeCertain,
    impactPriced: sizeCertain,
  };
}
