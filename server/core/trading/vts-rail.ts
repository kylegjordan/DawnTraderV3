/**
 * `B-XSTOCK-BID-TRIGGER-RELAND` increment (4a) (row 2, `#1191`) — THE VTS NO-DECISION RAIL'S REPORTING, the pure half.
 * Plan: `Claude Comms and Packages/Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_INC4A_PRE_AUDIT.md` r3-r5 (Coltrane approved r3;
 * r4 folds Langston's review, r5 Coltrane's durable member-decision witness).
 *
 * WHAT WAS WRONG (measured, audit A1/A3): the rail (`vts-runner.ts`, key `no-trigger-vts-<SYMBOL>`) paged every weekday at
 * the US open on genuinely wide books, NOTHING in code ever resolved a row (335/335 by hand), and each open row blocked its
 * key's next page — 10-13/14/15: 92/103/77 pages attempted, 64/33/21 minted, 28/70/56 suppressed.
 *
 * THE THREE RULES THIS FILE HOLDS, each pure so it is tested as behaviour:
 *   1. WHICH crossing is an EXPECTED wide/quiet book (joins ONE per-class standing record instead of paging) — audit A4.
 *      ONLY `too_wide`, and `too_old` when the paper cohort verdict positively reads `quiet`/`closed`. Everything else
 *      pages on its own key, as before (default-to-page; Coltrane r1 BLOCKER-1).
 *   2. THE MEMBER CLOCK — session no-decision time, durable on the record, restarted on a new Eastern trading date
 *      (Coltrane r2 BLOCKER-2). A member stuck 30 min of session time pages on its own key (audit A5: 421 of 423 in-session
 *      `too_wide` streaks ended within 30).
 *   3. WHEN A ROW CLEARS — re-measured from durable state, never the in-memory streak (objective 10): the trade decided
 *      after the mint (`decidedAtMs` written onto the row at decision time), or the trade is closed.
 */
import type { ClassVerdict } from '../../services/venue-quiet-alerting.js';

/** The evidence token every machine resolve carries (path:line, which `isValidResolutionEvidence` accepts). */
export const VTS_RAIL_REF = 'server/core/trading/vts-rail.ts:1';
/** The machine actor that resolves the rail's rows (`ALERT_ACTORS`, `system-alerts.ts`). */
export const VTS_RAIL_ACTOR = 'vts-exit-monitor';
/** Audit A5: a joined member pages on its own key after this much session no-decision time. */
export const MEMBER_ESCALATE_AFTER_MS = 30 * 60_000;

export const RAIL_KEY_PREFIX = 'no-trigger-vts-';
/** r4 (Langston BLOCKER-1): ONE KEY PER TRADE. 344 open xStock VTS trades sat on 158 symbols (122 with 2-6 trades); a per-
 *  symbol key let a sibling's open row suppress a crossing. The family prefix is kept, so every reader still selects it. */
export const railKey = (symbol: string, tradeId: string) => `${RAIL_KEY_PREFIX}${symbol}-${tradeId}`;
/** r4 FINDING-3: the doorbell for an `info` standing record that stops clearing itself. */
export const VTS_STUCK_KEY = 'vts-quiet-resolve-stuck';
/** Consecutive failed sweeps, or sweeps a closed member survives, before the stuck warning. */
export const STUCK_SWEEP_FAILURES = 10;
export const STUCK_CLOSED_MEMBER_SWEEPS = 3;
/** The xStock standing record (one per class; info, never delivered to Discord). */
export const VTS_STANDING_KEY = 'vts-quiet-xstock_spot';
/** Real-lane unpriced close: one warning per trade (a unique key cannot block a later trade). */
export const unpricedCloseKey = (tradeId: string) => `vts-unpriced-close-${tradeId}`;
/** Shadow-lane unpriced closes: one standing count row per class. */
export const shadowUnpricedKey = (assetClass: string) => `vts-shadow-unpriced-${assetClass}`;
/** Per-member and per-decision fields live as SEPARATE top-level metadata keys, so each write is a single-key merge
 *  (`mergeAlertMetadata` merges top-level keys) and two writers never overwrite each other's member map. */
export const memberField = (tradeId: string) => `member_${tradeId}`;

export const EXPECTED_WIDE = 'no_transactable_side (too_wide)';
export const EXPECTED_OLD = 'no_transactable_side (too_old)';

/** Rule 1 (audit A4). `verdict` is read ONLY in the regular session (the rail never pages off-session), where the paper
 *  module's own code says its count and the 15 s ceiling agree (`venue-quiet-alerting.ts:93-97`). `null` = unreadable. */
export function vtsXstockJoinsStandingRecord(lastReason: string, verdict: ClassVerdict | null): boolean {
  if (lastReason === EXPECTED_WIDE) return true;
  if (lastReason === EXPECTED_OLD) return verdict === 'quiet' || verdict === 'closed';
  return false; // no_usable_mark, no_row, age_unknown, side_unusable, knobs_unavailable, anything unclassified ⇒ page
}

export interface MemberClock {
  sessionClockStartMs: number | null;
  sessionDateEt: string | null;
}

/** Rule 2 (audit P3, r3). Off-session the clock is cleared. In session it starts at the first pass, and a stored start from
 *  a DIFFERENT Eastern date restarts at zero now — an off-session the process never saw (down through the close) must not
 *  carry yesterday's time. Within one session a restart keeps the stored start (downtime counts; conservative). */
export function stepMemberClock(prev: MemberClock, nowMs: number, regular: boolean, etDate: string): MemberClock & { elapsedMs: number } {
  if (!regular) return { sessionClockStartMs: null, sessionDateEt: null, elapsedMs: 0 };
  if (prev.sessionClockStartMs === null || prev.sessionDateEt !== etDate) {
    return { sessionClockStartMs: nowMs, sessionDateEt: etDate, elapsedMs: 0 };
  }
  return { sessionClockStartMs: prev.sessionClockStartMs, sessionDateEt: etDate, elapsedMs: nowMs - prev.sessionClockStartMs };
}

export type RailClear = 'decided_after_mint' | 'trade_closed';

/** Rule 3. `createdAt` is the row's ISO string (`system-alerts.ts:332`), parsed here — never compared as a string. */
export function railRowClear(createdAt: string, decidedAtMs: unknown, tradeClosed: boolean): RailClear | null {
  const mintedMs = Date.parse(createdAt);
  if (typeof decidedAtMs === 'number' && Number.isFinite(mintedMs) && decidedAtMs > mintedMs) return 'decided_after_mint';
  if (tradeClosed) return 'trade_closed';
  return null;
}

export const clearEvidence = (why: RailClear, tradeId: string) =>
  `${why === 'decided_after_mint' ? 'DECIDED-AFTER-MINT' : 'TRADE-CLOSED'} trade=${tradeId} ${VTS_RAIL_REF}`;

/** The trade id a rail row names: `metadata.tradeId` (written at the mint since (4a)), else the body's own wording for a
 *  row minted before this change. `null` ⇒ the row cannot be re-measured and is left for a human. */
export function railRowTradeId(row: { metadata?: Record<string, unknown> | null; body?: string | null }): string | null {
  const m = row.metadata?.tradeId;
  if (typeof m === 'string' && m.length > 0) return m;
  const hit = /open virtual trade (\S+) in /.exec(row.body ?? '');
  return hit ? hit[1] : null;
}

/** Eastern trading date (YYYY-MM-DD) of an instant — the member clock's session identity. */
export function easternDate(nowMs: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(nowMs));
}
