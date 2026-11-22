/**
 * B-XSTOCK-BAR-AVAILABILITY R7b — the nightly B75 sweep holds the revision partitions an open graded
 * window still needs, until that window's verdict exists (Langston r6 ruling, Discord 1573143973550096385;
 * C6 timing ruling 1573271063721287783).
 *
 * Why: the R2 window's gate read was missed while every session was stopped, and the sweep then dropped
 * three of the window's `xstock_bar_revision_event` partitions (11-09, 11-10 and 11-11), so the window
 * could no longer be graded. R7 (the unattended verdict runner, 00:15 UTC) makes the verdict independent of a
 * session; R7b makes R7 RETRYABLE — if a runner night fails, the data the next run needs is still hot.
 *
 * The rule, for `xstock_bar_revision_event` ONLY:
 *   - a partition is "in the window" when its range overlaps [graded_window_start, start + 9 days);
 *   - while NO verdict alert has ever been written on `xstock-bar-availability-capacity-verdict:<start>`
 *     (dedupe state `absent`), an age-eligible in-window partition is HELD: not exported, not dropped;
 *   - the hold ends the moment a verdict exists, WHATEVER it says (pass, fail or inconclusive) — the hold
 *     guards the read, never the result;
 *   - a hard cap of HOLD_CAP_PARTITIONS (3) held partitions — a count of child tables, not of days: a
 *     daily child is one day, a monthly child is one partition however many days it spans; beyond it the OLDEST in-window partitions are
 *     released to the normal export-verify-drop path and a CRITICAL alert names them, because the window
 *     can then no longer be graded in full. `revisionHotRetentionDays` stays 8; the hold never edits it.
 *
 * Cost of the cap, recorded for the batch: ~0.7 GiB hot per held day (741,040,128 B measured for 11-09),
 * and at the cap the gate's two whole-table legs read ~1.43x the rows: ~665 s, 55% of its budget.
 * What the cap buys: with `revisionHotRetentionDays` 8 against a 9-day window, a window starting at 00:00Z
 * has its first partition become age-eligible the night its runner first falls due, so a cap of 3 covers
 * three runner-failure nights before the oldest in-window day is released (Langston Step-4 ruling 3).
 * A start later in the UTC day falls due one night LATER than its first partition becomes eligible: the
 * R2' window (2026-11-30T01:00Z, Sunday 20:00 ET) holds the 11-30 partition for one night in normal
 * operation (an expected `…-sweep-hold` warning, cleared at the next sweep) and its cap covers two
 * runner-failure nights, not three — pre-registered in the R2' pre-audit section.
 *
 * Alert edges (every key this rule raises has a named clearing edge):
 *   - `…-sweep-hold:<start>` (warning): resolved on a night that holds nothing — a verdict exists, or no
 *     eligible partition is in the window;
 *   - `…-sweep-hold-cap:<start>` (critical): resolved only when a verdict exists for that window; a
 *     cap release is a permanent loss for that window, so it stays until the window is graded;
 *   - both keys for an OLDER window are resolved when the governed start moves (R2' re-registration),
 *     because the sweep then guards the new window only;
 *   - `…-sweep-hold-window-unreadable` (critical): resolved on the first night the window reads again.
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
/** At most this many in-window partitions (child tables, not days) are held at once (Langston r6). */
export const HOLD_CAP_PARTITIONS = 3;
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
  /** Hold `held` (newest first, at most HOLD_CAP_PARTITIONS); `capReleased` are in-window but past the cap. */
  | { kind: 'hold'; windowStart: Date; held: HoldablePartition[]; capReleased: HoldablePartition[] };

/**
 * The plan input. The verdict state is carried INSIDE the readable-window arm, so a readable window
 * without a verdict state cannot be expressed (Langston Step-4 ruling 4: a `null` here used to read as
 * "a verdict exists" and released the hold — fail-open).
 */
export type RevisionHoldInput = {
  parent: string;
  eligible: HoldablePartition[];
  window:
    | { ok: true; start: Date; verdictState: VerdictKeyState }
    | { ok: false; reason: string };
};

export function planRevisionHold(input: RevisionHoldInput): RevisionHoldPlan {
  if (input.parent !== XSTOCK_REVISION_PARENT) return { kind: 'not-applicable' };
  if (!input.window.ok) {
    // No governed window ⇒ no way to tell which partitions the open window needs. Fail CLOSED for this
    // one table (nothing dropped, critical alert) rather than crash the whole night's sweep for others.
    return { kind: 'window-unreadable', held: [...input.eligible], reason: input.window.reason };
  }
  const windowStart = input.window.start;
  if (input.window.verdictState !== 'absent') {
    return { kind: 'no-hold', windowStart, verdictPresent: true };
  }
  const inWindow = input.eligible
    .filter((p) => overlapsRegisteredWindow(p, windowStart))
    .sort((a, b) => b.rangeStart.getTime() - a.rangeStart.getTime()); // newest first
  if (inWindow.length === 0) return { kind: 'no-hold', windowStart, verdictPresent: false };
  return {
    kind: 'hold',
    windowStart,
    held: inWindow.slice(0, HOLD_CAP_PARTITIONS),
    capReleased: inWindow.slice(HOLD_CAP_PARTITIONS),
  };
}

/** The set of child tables the sweep must NOT process this run. */
export function heldChildren(plan: RevisionHoldPlan): Set<string> {
  if (plan.kind === 'hold' || plan.kind === 'window-unreadable') return new Set(plan.held.map((p) => p.child));
  return new Set();
}
