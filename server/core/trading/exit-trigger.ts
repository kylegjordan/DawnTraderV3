/**
 * B-XSTOCK-BID-TRIGGER-RELAND increment (4b) (sprint row 2, objective 8) — THE ONE EXIT-TRIGGER RULE.
 *
 * Every exit decision site hands the shared evaluator (`tec-evaluator.ts` `evaluateTECExit`) a `triggerPrice`: the price
 * a stop or target is judged against. There are exactly three such sites — paper (`active-execution-engine.ts`), the
 * VTS real lane and the VTS shadow lane (`vts-runner.ts`) — and each used to pick that price in its own words. This
 * module states the rule ONCE; the three sites pass their inputs and use `.price`. It changes no decision: the table
 * below is the rule the three sites already ran (frozen in `b-xstock-bid-trigger-reland-inc4b.test.ts`).
 *
 * THE RULE (a sell is judged on the BID — the side a counterparty fills; `null` ⇒ NO DECISION this cycle, evaluator
 * branch 2b, never a midpoint fallback):
 *   crypto_spot                  → the bid; no bid ⇒ null.
 *   xstock_spot, armed           → the bid; no bid ⇒ null.
 *   xstock_spot, NOT armed       → the MARK, and the reason says which switch left it there.
 *   any other class, policy mark → the MARK (paper: `8a-P4b` r1 BLOCKER-1 — the paper exit loop is class-total over the
 *                                  four-class registry, and a null there would hand the row no decision forever).
 *   any other class, policy none → null (VTS: `3n.q3` Step-4 condition 2 — a class with no branch makes NO level
 *                                  decision instead of deciding on the mark and then reaching a clamp arm).
 *
 * ⛔ THE INPUT IS DISCRIMINATED BY CLASS FIRST (Langston (4b) Step-2 BLOCKER-4). The paper caller's old arm expression
 *    was false on every crypto position; an `armed`-discriminated input would have sent crypto to the mark. A crypto
 *    input here has NO arm field, so it cannot be.
 * ⛔ THE ARM IS A PARAMETER, NEVER POLICY IN HERE (BLOCKER-4's parent, (a) condition 1). Paper's xStock arm is "the
 *    book-state guard ran AND `spread_blown` is on"; the VTS's is always true (its guard is the stateless selector
 *    upstream). This module never reads either switch.
 * ⚠️ NOT A LATCH, AND THERE IS NONE: the design's exit-intent latch is dissolved by construction (pre-audit A4).
 */
import type { TickerRefusal } from '../calculations/touch-price.js';
import type { XsLiveReason } from '../../asset_classes/xstock_spot/vts-xs-instrument.js';

/** Why the paper xStock judged frame yielded no bid this tick (`active-execution-engine.ts` `xsFrameReason`). */
export type XsFrameRefusal = 'unguarded_crossed' | 'unguarded_not_two_sided' | 'guarded_crossed' | 'guarded_non_finite';

/** Which switch left an xStock trigger on the mark. */
export type XsArmOff = 'guard_off' | 'spread_blown_off';

/** Why a bid side was unavailable — the union of the three sites' own refusal vocabularies. */
export type ExitTriggerRefusal = 'no_bid_side' | XsLiveReason | TickerRefusal | XsFrameRefusal;

/** The ONE vocabulary every site prints and counts (Langston (a) condition 2). */
export type ExitTriggerReason = 'ok' | 'class_mark' | 'class_unbranched' | XsArmOff | ExitTriggerRefusal;

export type ExitTriggerInput =
  | { cls: 'crypto_spot'; bid: number | null; bidRefusal: ExitTriggerRefusal | null }
  | {
      cls: 'xstock_spot';
      arm: { armed: true } | { armed: false; armOff: XsArmOff };
      bid: number | null;
      bidRefusal: ExitTriggerRefusal | null;
      /** The mark. `null` only where the lane has none (the VTS); an unarmed xStock then makes no decision. */
      mark: number | null;
    }
  | { cls: 'other'; otherClass: 'mark' | 'none'; mark: number | null };

export interface ExitTriggerSelection {
  /** The price handed to the evaluator as `triggerPrice`. `null` ⇒ no decision this cycle. */
  price: number | null;
  /** What the price is: the transactable bid, the mark, or nothing. */
  basis: 'bid' | 'mark' | 'none';
  reason: ExitTriggerReason;
}

const usable = (x: number | null): x is number => x !== null && Number.isFinite(x);

/** The one exit-trigger rule (see the header). Pure. */
export function selectExitTrigger(input: ExitTriggerInput): ExitTriggerSelection {
  switch (input.cls) {
    case 'crypto_spot':
      return usable(input.bid)
        ? { price: input.bid, basis: 'bid', reason: 'ok' }
        : { price: null, basis: 'none', reason: input.bidRefusal ?? 'no_bid_side' };
    case 'xstock_spot': {
      if (!input.arm.armed) {
        // ⛔ A missing off-reason is a caller bug (pre-audit A10: every unarmed xStock path sets one). It throws; the
        //   paper per-position `try` contains it, so the failure mode is a skipped evaluation on that one position — a HOLD.
        const off = (input.arm as { armOff?: XsArmOff }).armOff;
        if (off !== 'guard_off' && off !== 'spread_blown_off') {
          throw new Error(`selectExitTrigger: an unarmed xStock trigger must name its off-reason, got ${String(off)}`);
        }
        return { price: input.mark, basis: 'mark', reason: off };
      }
      return usable(input.bid)
        ? { price: input.bid, basis: 'bid', reason: 'ok' }
        : { price: null, basis: 'none', reason: input.bidRefusal ?? 'no_bid_side' };
    }
    case 'other':
      return input.otherClass === 'mark'
        ? { price: input.mark, basis: 'mark', reason: 'class_mark' }
        : { price: null, basis: 'none', reason: 'class_unbranched' };
  }
}

/** The input's class for a row's `asset_class` (the classes outside `3n` share the `other` arm). */
export function exitTriggerClass(assetClass: string | null | undefined): 'crypto_spot' | 'xstock_spot' | 'other' {
  return assetClass === 'crypto_spot' || assetClass === 'xstock_spot' ? assetClass : 'other';
}
