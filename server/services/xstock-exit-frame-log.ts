/**
 * ═════════════════════════════════════════════════════════════════════════════
 * `3n.q7` B-XSTOCK-BID-TRIGGER-RELAND — INCREMENT 1: THE PER-TICK xSTOCK EXIT FRAME LINE
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * TELEMETRY ONLY. It changes no decision. It records, for EVERY evaluated xStock exit tick, the
 * frame the bid trigger would have read, so the re-land's would-refuse rate has a denominator.
 * Plan: `Claude Comms and Packages/Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_PRE_AUDIT.md` (Step 2
 * cleared by Langston 2026-09-29, conditions C1-C3).
 *
 * ⛔ WHY IT EXISTS: the C1 instrument (`X3_BID_DIVERGENCE_START/END` + the `EXIT_TRIGGER` tag) wrote
 * a frame only when a divergence opened or closed or an exit fired — conditioned on the outcome.
 * n = 6 in nine days was *"a census of a different thing"* (Langston), not a small sample.
 *
 * ⛔ A HOLLOW FRAME IS NEVER SILENTLY IDENTICAL TO NO FRAME (condition 2): a frame object with no
 * transactable side prints `frame=none reason=<code>`; a missing frame object prints
 * `reason=no_frame_object`. Both are emitted, never dropped.
 * ⛔ A FRAME THAT EXISTS IS NEVER DROPPED BECAUSE TWO CLASS RESOLVERS DISAGREE (Langston C2): the
 * engine emits when EITHER the evaluator's class is xStock OR a frame object was built, and says
 * `class_mismatch` when the two disagree.
 * Goes to `console.warn` ⇒ `error.log`, which rotates daily and keeps 14 days (the budget is in the
 * plan: ~14 MB per held xStock position per evaluated day; re-budget if a line exceeds ~375 B).
 */

export interface XsExitFrame {
  bid: number | null;
  ask: number | null;
  spread: number | null;
  thr: number | null;
  /** Which arm produced the sides: `raw_guarded` | `raw_unguarded`; null when there are none. */
  basis?: string | null;
  /** Why there are no transactable sides on an evaluated tick; null when there are. */
  reason?: string | null;
  /**
   * The threshold's basis (Langston inc-2 Step-1 BLOCKER-2; fields corrected at his 565e784ce Step 4): `trail` = the
   * chain's trailing median spread the threshold was built from (the predicate's own pre-advance input); `ret` = the
   * retained median the chain's SEED was judged against (the outside datum), null when it seeded vacuously; `tb` = `j`
   * when the chain's seed was judged against a ring, `v` when it seeded vacuously. Null on the unguarded arm.
   */
  trail?: number | null;
  ret?: number | null;
  tb?: 'j' | 'v' | null;
}

export type ExitEvalClass = 'crypto' | 'xstock' | 'other';

export interface XsExitFrameLineInput {
  symbol: string;
  positionId: string;
  /** The evaluator's own class for this position (the population `invoked` counts). */
  evalCls: ExitEvalClass;
  /** The frame the caller built (non-null exactly when the caller resolved the class as xStock). */
  frame: XsExitFrame | null;
  mark: number;
  stopLoss: number | null;
  takeProfit: number | null;
  bidWouldFire: 'stop' | 'target' | 'no';
  markExit: boolean;
  /**
   * WHY the mark arm exited (the evaluator's `exitReason`), or null. Langston Step-4 condition 1: `bidWouldFire`
   * is LEVEL-only, but `markExit` is true for ANY exit reason, including the non-level arms (`timeout`,
   * `stale_timeout`, `moonbag_timeout`, config-gated off today — a lock, not a construction guarantee). Without the
   * reason, a time close would enter the bid-vs-mark discordant cell as a false divergence.
   */
  exitReason: string | null;
}

const f5 = (v: number | null): string => (v === null || !Number.isFinite(v) ? 'none' : v.toFixed(5));

/**
 * The line to emit for one evaluated exit tick, or `null` when this tick is not an xStock tick on
 * EITHER resolver (a crypto row with no frame). Pure: the engine owns the counters and the write.
 */
export function xsExitFrameLine(i: XsExitFrameLineInput): string | null {
  const evalIsXs = i.evalCls === 'xstock';
  if (!evalIsXs && i.frame === null) return null;
  const state =
    i.frame === null ? 'frame=none reason=no_frame_object'
      : (i.frame.bid === null || i.frame.ask === null) ? `frame=none reason=${i.frame.reason ?? 'unset'}`
        : `frame=ok basis=${i.frame.basis ?? 'none'}`;
  // ⛔ Langston Step-4 condition 3 — THE FIRST ARM BELOW IS UNREACHABLE BY CONSTRUCTION TODAY: `evalCls === 'xstock'`
  // ⟺ the stored class is `xstock_spot` ⟹ `asValidAssetClass` returns it ⟹ the caller's `_posClass` is `xstock_spot`
  // ⟹ a frame object IS built. So `reason=no_frame_object` + `evalCls=xstock posClass=not_xstock` cannot print; it is
  // kept as a label for a future resolver change, never as a measured case. The reachable mismatch is one-directional:
  // a stored class outside the union (evalCls `other`) with a frame.
  const mismatch =
    evalIsXs && i.frame === null ? ' class_mismatch evalCls=xstock posClass=not_xstock'
      : !evalIsXs ? ` class_mismatch evalCls=${i.evalCls} posClass=xstock_spot`
        : '';
  const sides = i.frame === null ? ''
    : ` bid=${i.frame.bid ?? 'none'} ask=${i.frame.ask ?? 'none'} spread=${f5(i.frame.spread)} thr=${f5(i.frame.thr)}` +
      ` trail=${f5(i.frame.trail ?? null)} ret=${f5(i.frame.ret ?? null)} tb=${i.frame.tb ?? 'none'}`;
  return `[3n.q7][XS_FRAME] ${i.symbol} pos=${i.positionId} ${state}${mismatch} mark=${i.mark} sl=${i.stopLoss ?? 'none'} tp=${i.takeProfit ?? 'none'}${sides} bidWouldFire=${i.bidWouldFire} markExit=${i.markExit ? 'y' : 'n'} exitReason=${i.exitReason ?? 'none'}`;
}
