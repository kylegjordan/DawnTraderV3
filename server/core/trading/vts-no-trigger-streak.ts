/**
 * `8a-P3` r2 BLOCKER-1 rail + `8a-P4c` increment 3 (P10, rule C / Kyle's `#994`; Langston Step-4 FINDING-1) — ONE STEP of
 * a VTS trade's no-exit-decision streak. Pure, so the paging rule is tested as behaviour rather than as source text.
 *
 * ⭐ KYLE CUT THE PAGE, NOT THE MEASUREMENT. The streak is tracked for every class in every session; only the PAGE is
 * gated. `pages` says whether this instant is paging time (crypto always; xStock only in the US `regular` session). The
 * page clock (`pageSinceMs`) runs only in paging time and RESTARTS after any off-hours gap — so a quote slow to resume at
 * the open cannot page on the strength of an overnight streak, and an in-session streak crossing the close does not
 * page off-hours. A streak pages at most ONCE (the `_recordPriceSkip` idiom). When a decision is made the streak ENDS
 * and is returned whole, so its full length — the cost of "we just hold" — is measured by the caller.
 */
export interface NoTriggerStreak {
  sinceMs: number;
  /** When the current run of PAGING time began; `null` while off-hours. */
  pageSinceMs: number | null;
  alerted: boolean;
  lastReason: string;
}

export interface NoTriggerStep {
  /** The streak to keep (`null` ⇒ delete: a decision was made, or there was none to keep). */
  next: NoTriggerStreak | null;
  /** Raise the page NOW (once per streak). */
  page: boolean;
  /** The streak that a decision just ended, if any. */
  ended: NoTriggerStreak | null;
}

export function stepNoTriggerStreak(
  prev: NoTriggerStreak | undefined,
  noDecisionReason: string | undefined,
  pages: boolean,
  nowMs: number,
  thresholdMs: number,
): NoTriggerStep {
  if (noDecisionReason === undefined) return { next: null, page: false, ended: prev ?? null };
  const next: NoTriggerStreak = prev
    ? { ...prev, lastReason: noDecisionReason }
    : { sinceMs: nowMs, pageSinceMs: null, alerted: false, lastReason: noDecisionReason };
  next.pageSinceMs = pages ? (next.pageSinceMs ?? nowMs) : null;
  const page = !next.alerted && next.pageSinceMs !== null && nowMs - next.pageSinceMs >= thresholdMs;
  if (page) next.alerted = true;
  return { next, page, ended: null };
}
