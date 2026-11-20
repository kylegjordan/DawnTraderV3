/**
 * B-XSTOCK-BAR-AVAILABILITY R7b — the nightly B75 sweep holds the revision partitions an open graded
 * window still needs, until that window's verdict exists (Langston r6 ruling, Discord 1573143973550096385;
 * C6 timing ruling 1573271063721287783).
 *
 * Why: the R2 window's gate read was missed while every session was stopped, and the sweep then dropped
 * two of the window's `xstock_bar_revision_event` partitions (11-09 and 11-10), so the window could no
 * longer be graded. R7 (the unattended verdict runner, 00:15 UTC) makes the verdict independent of a
 * session; R7b makes R7 RETRYABLE — if a runner night fails, the data the next run needs is still hot.
 *
 * The rule, for `xstock_bar_revision_event` ONLY:
 *   - a partition is "in the window" when its range overlaps [graded_window_start, start + 9 days);
 *   - while NO verdict alert has ever been written on `xstock-bar-availability-capacity-verdict:<start>`
 *     (dedupe state `absent`), an age-eligible in-window partition is HELD: not exported, not dropped;
 *   - the hold ends the moment a verdict exists, WHATEVER it says (pass, fail or inconclusive) — the hold
 *     guards the read, never the result;
 *   - a hard cap of HOLD_CAP_DAYS (3) held partitions: beyond it the OLDEST in-window partitions are
 *     released to the normal export-verify-drop path and a CRITICAL alert names them, because the window
 *     can then no longer be graded in full. `revisionHotRetentionDays` stays 8; the hold never edits it.
 *
 * Cost of the cap, recorded for the batch: ~0.7 GiB hot per held day (741,040,128 B measured for 11-09),
 * and at the cap the gate's two whole-table legs read ~1.43x the rows: ~665 s, 55% of its budget.
 *
 * This module is pure: the sweep passes in the eligible partitions, the window start and the verdict
 * key's dedupe state, and acts on the returned plan. The verdict key and window length are defined HERE
 * and imported by the verdict runner, so the writer and the guard cannot drift onto different keys.
 */

export const XSTOCK_REVISION_PARENT = 'xstock_bar_revision_event';
/** The registered graded window is nine days long. */
export const REGISTERED_WINDOW_DAYS = 9;
export const REGISTERED_WINDOW_MS = REGISTERED_WINDOW_DAYS * 86_400_000;
export const VERDICT_KEY_PREFIX = 'xstock-bar-availability-capacity-verdict:';
/** At most this many in-window partitions are held at once (Langston r6). */
export const HOLD_CAP_DAYS = 3;
export const HOLD_ALERT_KEY_PREFIX = 'xstock-bar-availability-sweep-hold:';
export const HOLD_CAP_ALERT_KEY_PREFIX = 'xstock-bar-availability-sweep-hold-cap:';
export const WINDOW_UNREADABLE_ALERT_KEY = 'xstock-bar-availability-sweep-hold-window-unreadable';

/** The ONE read of the governed window start, shared by the verdict runner and the sweep hold. */
export const GRADED_WINDOW_START_SQL =
  `SELECT value #>> '{}' AS start FROM module_constants
    WHERE module_name='xstock_bar_availability' AND constant_name='graded_window_start'
      AND asset_class='*' AND exchange='*' AND strategy='*' AND regime='*'`;

/** Parse the rows of GRADED_WINDOW_START_SQL: exactly one row holding a timestamp, or a refusal. */
export function parseGradedWindowStart(rows: Array<{ start: unknown }>): { ok: true; start: Date } | { ok: false; reason: string } {
  if (rows.length !== 1) return { ok: false, reason: `expected exactly one governed graded_window_start row, found ${rows.length}` };
  const start = new Date(String(rows[0].start));
  if (!Number.isFinite(start.getTime())) return { ok: false, reason: 'governed graded_window_start is not a timestamp' };
  return { ok: true, start };
}

export function verdictKey(windowStart: Date): string {
  return `${VERDICT_KEY_PREFIX}${windowStart.toISOString()}`;
}

export function holdAlertKey(windowStart: Date): string {
  return `${HOLD_ALERT_KEY_PREFIX}${windowStart.toISOString()}`;
}

export function holdCapAlertKey(windowStart: Date): string {
  return `${HOLD_CAP_ALERT_KEY_PREFIX}${windowStart.toISOString()}`;
}

export function registeredWindowEnd(windowStart: Date): Date {
  return new Date(windowStart.getTime() + REGISTERED_WINDOW_MS);
}

/** The subset of the sweep's PartitionRow this rule reads. */
export interface HoldablePartition {
  child: string;
  partitionLabel: string;
  rangeStart: Date;
  rangeEnd: Date;
}

export function overlapsRegisteredWindow(p: HoldablePartition, windowStart: Date): boolean {
  return p.rangeStart.getTime() < registeredWindowEnd(windowStart).getTime()
    && p.rangeEnd.getTime() > windowStart.getTime();
}

export type VerdictKeyState = 'absent' | 'nonterminal' | 'resolved';

export type RevisionHoldPlan =
  /** Not the revision table: the rule does not apply. */
  | { kind: 'not-applicable' }
  /** The governed window start could not be read: hold EVERY eligible partition, raise critical. */
  | { kind: 'window-unreadable'; held: HoldablePartition[]; reason: string }
  /** A verdict exists (any state), or nothing eligible is in the window: process everything normally. */
  | { kind: 'no-hold'; windowStart: Date; verdictPresent: boolean }
  /** Hold `held` (newest first, at most HOLD_CAP_DAYS); `capReleased` are in-window but past the cap. */
  | { kind: 'hold'; windowStart: Date; held: HoldablePartition[]; capReleased: HoldablePartition[] };

export function planRevisionHold(input: {
  parent: string;
  eligible: HoldablePartition[];
  window: { ok: true; start: Date } | { ok: false; reason: string };
  verdictState: VerdictKeyState | null;
}): RevisionHoldPlan {
  if (input.parent !== XSTOCK_REVISION_PARENT) return { kind: 'not-applicable' };
  if (!input.window.ok) {
    // No governed window ⇒ no way to tell which partitions the open window needs. Fail CLOSED for this
    // one table (nothing dropped, critical alert) rather than crash the whole night's sweep for others.
    return { kind: 'window-unreadable', held: [...input.eligible], reason: input.window.reason };
  }
  const windowStart = input.window.start;
  if (input.verdictState !== 'absent') {
    return { kind: 'no-hold', windowStart, verdictPresent: true };
  }
  const inWindow = input.eligible
    .filter((p) => overlapsRegisteredWindow(p, windowStart))
    .sort((a, b) => b.rangeStart.getTime() - a.rangeStart.getTime()); // newest first
  if (inWindow.length === 0) return { kind: 'no-hold', windowStart, verdictPresent: false };
  return {
    kind: 'hold',
    windowStart,
    held: inWindow.slice(0, HOLD_CAP_DAYS),
    capReleased: inWindow.slice(HOLD_CAP_DAYS),
  };
}

/** The set of child tables the sweep must NOT process this run. */
export function heldChildren(plan: RevisionHoldPlan): Set<string> {
  if (plan.kind === 'hold' || plan.kind === 'window-unreadable') return new Set(plan.held.map((p) => p.child));
  return new Set();
}
