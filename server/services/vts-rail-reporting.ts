/**
 * `B-XSTOCK-BID-TRIGGER-RELAND` increment (4a) (row 2, `#1191`) — THE VTS NO-DECISION RAIL'S REPORTING, the IO half.
 * The rules are pure in `server/core/trading/vts-rail.ts`; this file owns the state and the alert-file / DB calls, and the
 * runner calls it at five hooks: a streak crossing (`onCrossing`), an exit decision (`markDecided`), the once-a-minute sweep
 * (`runVtsRailSweep`), and the two unpriced-close sites (`onUnpricedClose`, `onShadowUnpriced`).
 * Plan: `Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_INC4A_PRE_AUDIT.md` r3, P1-P5 (Coltrane APPROVED 2026-10-16).
 *
 * ⛔ RESTART-SAFETY, the reason this is shaped the way it is (Coltrane r1/r2 BLOCKERS):
 *   - the proof that a trade decided after its row was minted is WRITTEN ONTO THE ROW (`decidedAtMs`) at decision time;
 *   - the index `tradeId → alertId` is a cache of the alert file: loaded before the first pass, refreshed by every sweep,
 *     and written AT THE MINT from the row `addAlert` returns (no mint-to-refresh blind window);
 *   - a member's session clock and its Eastern date live on the standing record, so a restart cannot reset or inherit it.
 * Nothing here is awaited by the exit decision itself: the decision mark is fire-and-forget, the sweep runs after the pass.
 */
import {
  vtsXstockJoinsStandingRecord, stepMemberClock, railRowClear, clearEvidence, railRowTradeId, easternDate,
  railKey, memberField, RAIL_KEY_PREFIX, VTS_STANDING_KEY, VTS_RAIL_ACTOR, VTS_RAIL_REF, MEMBER_ESCALATE_AFTER_MS,
  unpricedCloseKey, shadowUnpricedKey, VTS_STUCK_KEY, STUCK_SWEEP_FAILURES, STUCK_CLOSED_MEMBER_SWEEPS, type MemberClock,
} from '../core/trading/vts-rail.js';
import type { ClassVerdict } from './venue-quiet-alerting.js';
import fs from 'node:fs';

/** `decided_<tradeId>` on the standing record: a member decided at this time (single-key merge, never a map rewrite). */
export const decidedField = (tradeId: string) => `decided_${tradeId}`;

export interface RailAlertRow {
  id: string;
  dedupe_key?: string | null;
  state: string;
  created_at: string;
  body?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface RailMember extends MemberClock {
  symbol: string;
  reason: string;
  joinedAtMs: number;
}

export interface VtsRailDeps {
  addAlert: (a: Record<string, unknown>) => Promise<RailAlertRow>;
  mergeAlertMetadata: (id: string, patch: Record<string, unknown>) => Promise<RailAlertRow | null>;
  resolveAlert: (id: string, by: string, evidence: string, transport: 'engine') => Promise<unknown>;
  readAllAlerts: () => RailAlertRow[];
  /** Of these VTS trade ids, which are CLOSED in durable state — a PRESENT `vts_open_trades` row with `closed`/`closed_at`
   *  set. An id with no row is NOT closed (it is left for a human), so an empty result can never resolve everything. */
  closedTradeIds: (ids: string[]) => Promise<Set<string>>;
  /** The paper cohort verdict for xStock (`venue-quiet-alerting.ts`); `null` when unreadable. */
  xstockVerdict: (nowMs: number) => ClassVerdict | null;
  /** Is `nowMs` inside the US regular session on a trading day? */
  isRegularSession: (nowMs: number) => boolean;
  /** r5 (Langston condition 4): the alert file's size in bytes — every write rewrites it whole; null when unreadable. */
  alertFileBytes?: () => number | null;
}

/** The six pre-registered counts (audit A3 / objective 11, r4), cumulative since start. `dedupeHits` = an `addAlert` that
 *  returned an EXISTING row; `escalations` = 30-min member pages. Joins are read against A3's attempted column, not zero. */
export const railCounts = { crossings: 0, joins: 0, pagesAttempted: 0, minted: 0, dedupeHits: 0, escalations: 0, markMisses: 0 };

const state = {
  /** tradeId → id of its open `no-trigger-vts-*` row. */
  // A SET per trade (Langston (4a) Step 4, §13 disposition 1): in the migration window a legacy per-SYMBOL row and a new
  // per-TRADE row for the same trade can both be open (different keys, so dedupe does not stop the second mint). With one
  // id per trade the newer row won and the legacy row never got its decision mark — stranded until the trade closed.
  rowByTrade: new Map<string, Set<string>>(),
  /** tradeId of each standing-record member → the record's id. */
  memberRecord: new Map<string, string>(),
  loaded: false,
  sweepInFlight: false,
  lastSweepMs: 0,
  sweepFailures: 0,
  /** tradeId → consecutive sweeps a CLOSED member has survived on the record. */
  closedMemberSweeps: new Map<string, number>(),
};

/** Test seam only. */
export function _resetVtsRailState(): void {
  state.rowByTrade.clear(); state.memberRecord.clear();
  state.loaded = false; state.sweepInFlight = false; state.lastSweepMs = 0; state.sweepFailures = 0; state.closedMemberSweeps.clear();
  for (const k of Object.keys(railCounts) as Array<keyof typeof railCounts>) railCounts[k] = 0;
}
export function _vtsRailIndex(): { rowByTrade: Map<string, Set<string>>; memberRecord: Map<string, string> } {
  return { rowByTrade: state.rowByTrade, memberRecord: state.memberRecord };
}

function isOpen(r: RailAlertRow): boolean { return r.state !== 'resolved'; }
function indexRow(tradeId: string, rowId: string): void {
  const set = state.rowByTrade.get(tradeId) ?? new Set<string>();
  set.add(rowId);
  state.rowByTrade.set(tradeId, set);
}

/** Rebuild the index from the alert file (durable state). Called before the first pass and by every sweep. */
export function loadVtsRailIndex(deps: Pick<VtsRailDeps, 'readAllAlerts'>): void {
  const rows = deps.readAllAlerts();
  state.rowByTrade.clear(); state.memberRecord.clear();
  for (const r of rows) {
    if (!isOpen(r)) continue;
    if ((r.dedupe_key ?? '').startsWith(RAIL_KEY_PREFIX)) {
      const tid = railRowTradeId(r);
      if (tid) indexRow(tid, r.id);
    } else if (r.dedupe_key === VTS_STANDING_KEY) {
      for (const [k, v] of Object.entries(r.metadata ?? {})) {
        if (k.startsWith('member_') && v) state.memberRecord.set(k.slice('member_'.length), r.id);
      }
    }
  }
  state.loaded = true;
}

export function ensureVtsRailIndex(deps: Pick<VtsRailDeps, 'readAllAlerts'>): void {
  if (!state.loaded) {
    try { loadVtsRailIndex(deps); } catch (err) { console.error('[VTS_RAIL][INDEX_LOAD_FAILED]', err instanceof Error ? err.message : err); }
  }
}

/**
 * A pass made an exit decision for this trade. If it has an open rail row or is a standing-record member, write the
 * decision time onto the DURABLE row now (fire-and-forget; a failed write keeps the index entry so the next decision retries).
 */
export function markDecided(tradeId: string, nowMs: number, deps: Pick<VtsRailDeps, 'mergeAlertMetadata'>): void {
  const rowIds = [...(state.rowByTrade.get(tradeId) ?? [])];
  // r5 (Langston condition 3): `mergeAlertMetadata` RETURNS null (it does not throw) when the row is missing or already
  // resolved, so an unwritten mark is counted (`markMisses`, the seventh count) rather than assumed. Either way the index
  // entry goes, and that is deliberate (Langston r5 condition 2, the markDecided half): null means the row is already
  // resolved or gone, so nothing is owed — there is no later decision that could usefully retry it.
  // Store cost, stated (condition 4): each mark is one whole-file rewrite of the alert file, made at most ONCE per open row
  // or membership (the entry leaves the index on the first attempt) — so a pass costs at most (open rail rows + members)
  // rewrites, measured max 118 concurrent open rail rows (2026-10-15T13:41Z), before the standing record absorbs the
  // expected wide books.
  for (const rowId of rowIds) {
    deps.mergeAlertMetadata(rowId, { decidedAtMs: nowMs })
      .then((row) => {
        if (row === null) railCounts.markMisses++;
        const set = state.rowByTrade.get(tradeId);
        if (set) { set.delete(rowId); if (set.size === 0) state.rowByTrade.delete(tradeId); }
      })
      .catch((err) => console.error(`[VTS_RAIL][DECIDED_MARK_FAILED] trade=${tradeId}:`, err instanceof Error ? err.message : err));
  }
  const recId = state.memberRecord.get(tradeId);
  if (recId) {
    deps.mergeAlertMetadata(recId, { [decidedField(tradeId)]: nowMs })
      .then((row) => { if (row === null) railCounts.markMisses++; if (state.memberRecord.get(tradeId) === recId) state.memberRecord.delete(tradeId); })
      .catch((err) => console.error(`[VTS_RAIL][MEMBER_DECIDED_MARK_FAILED] trade=${tradeId}:`, err instanceof Error ? err.message : err));
  }
}

export interface Crossing {
  tradeId: string;
  symbol: string;
  assetClass: string;
  lastReason: string;
  /** When this streak's current run of paging (regular-session) time began — the member clock starts here. */
  pageSinceMs: number;
  title: string;
  body: string;
}

/** Page on the symbol's own key, counting minted vs suppressed, and index the row at the mint. */
async function pageOwnKey(c: Crossing, nowMs: number, deps: VtsRailDeps): Promise<void> {
  railCounts.pagesAttempted++;
  const row = await deps.addAlert({
    triggers_at: new Date(nowMs), category: 'breakage', severity: 'warning',
    title: c.title, body: c.body, metadata: { tradeId: c.tradeId }, dedupe_key: railKey(c.symbol, c.tradeId),
  });
  // A fresh row is created at or after the pre-call stamp; an existing (deduped) one before it (`system-alerts.ts:539-545`).
  const mintedNow = Date.parse(row.created_at) >= nowMs;
  if (mintedNow) railCounts.minted++; else railCounts.dedupeHits++;
  if (row.metadata?.tradeId === c.tradeId && isOpen(row)) indexRow(c.tradeId, row.id); // at-mint index (r3)
}

/** A streak crossed the page threshold. An expected wide/quiet xStock book joins the standing record; all else pages. */
export async function onCrossing(c: Crossing, nowMs: number, deps: VtsRailDeps): Promise<'joined' | 'paged'> {
  railCounts.crossings++;
  let verdict: ClassVerdict | null = null;
  if (c.assetClass === 'xstock_spot' && c.lastReason.startsWith('no_transactable_side (too_old')) {
    try { verdict = deps.xstockVerdict(nowMs); } catch { verdict = null; } // unreadable ⇒ page
  }
  if (c.assetClass === 'xstock_spot' && vtsXstockJoinsStandingRecord(c.lastReason, verdict)) {
    const rec = await deps.addAlert({
      triggers_at: new Date(nowMs), category: 'health_check', severity: 'info',
      title: 'VTS xStock exits waiting on wide or quiet books',
      body: 'Open VTS xStock trades whose exit cannot be decided because the book is too wide (or the market is quiet). '
        + 'This is EXPECTED at the US open and overnight and pages nobody (Kyle #994; row 2 objective 9). Each member, its '
        + 'reason and its session clock are in metadata; a member still stuck after 30 min of regular-session time pages on '
        + 'its own key; a member leaves when its trade decides or closes; the record resolves itself when empty.',
      metadata: {}, dedupe_key: VTS_STANDING_KEY,
    });
    const stored = rec.metadata?.[memberField(c.tradeId)] as RailMember | null | undefined;
    // r5 (Coltrane BLOCKER): a member whose trade DECIDED after it joined is a finished streak, not this one. A re-crossing
    // after that (e.g. decision → restart before the sweep → refusing again) starts a NEW member with a fresh clock; only a
    // re-crossing with NO decision in between (a restart mid-streak) keeps the stored clock — downtime counts, conservative.
    const storedDecided = rec.metadata?.[decidedField(c.tradeId)];
    const prev = stored && !(typeof storedDecided === 'number' && storedDecided > stored.joinedAtMs) ? stored : null;
    const etDate = easternDate(nowMs);
    const member: RailMember = prev ?? {
      symbol: c.symbol, reason: c.lastReason, joinedAtMs: nowMs,
      sessionClockStartMs: c.pageSinceMs, sessionDateEt: easternDate(c.pageSinceMs),
    };
    if (prev) member.reason = c.lastReason;
    if (member.sessionDateEt !== etDate) { member.sessionClockStartMs = c.pageSinceMs; member.sessionDateEt = etDate; }
    const suppressedPages = (typeof rec.metadata?.suppressedPages === 'number' ? rec.metadata.suppressedPages : 0) + 1;
    // ⛔ Langston r5 condition 2: a null return means the record was resolved (or vanished) between `addAlert` and here —
    // the member was NOT written, so this crossing must not be swallowed: fall back to paging on its own key (A4's
    // default-to-page). Member and decision keys are single-key merges; a removed member is a `null` TOMBSTONE that every
    // reader filters (`&& v`), bounded by the record's own lifetime (it resolves when empty) — r5 record item (ii).
    const merged = await deps.mergeAlertMetadata(rec.id, { [memberField(c.tradeId)]: member, [decidedField(c.tradeId)]: null, suppressedPages });
    if (merged === null) {
      await pageOwnKey(c, nowMs, deps);
      return 'paged';
    }
    state.memberRecord.set(c.tradeId, rec.id);
    railCounts.joins++;
    return 'joined';
  }
  await pageOwnKey(c, nowMs, deps);
  return 'paged';
}

/** The once-a-minute sweep — off the exit path, re-measured from durable state, never throws. */
export async function runVtsRailSweep(nowMs: number, deps: VtsRailDeps): Promise<void> {
  if (state.sweepInFlight || nowMs - state.lastSweepMs < 60_000) return;
  state.sweepInFlight = true;
  state.lastSweepMs = nowMs;
  try {
    const all = deps.readAllAlerts();
    const railRows = all.filter((r) => isOpen(r) && (r.dedupe_key ?? '').startsWith(RAIL_KEY_PREFIX));
    const record = all.find((r) => isOpen(r) && r.dedupe_key === VTS_STANDING_KEY) ?? null;
    const members = Object.entries(record?.metadata ?? {})
      .filter(([k, v]) => k.startsWith('member_') && v)
      .map(([k, v]) => [k.slice('member_'.length), v as RailMember] as const);
    const ids = [...new Set([...railRows.map(railRowTradeId).filter((t): t is string => !!t), ...members.map(([t]) => t)])];
    const closed = ids.length ? await deps.closedTradeIds(ids) : new Set<string>();
    let resolved = 0;
    for (const r of railRows) {
      const tid = railRowTradeId(r);
      if (!tid) continue; // cannot be re-measured ⇒ left for a human
      const why = railRowClear(r.created_at, r.metadata?.decidedAtMs, closed.has(tid));
      if (why) { await deps.resolveAlert(r.id, VTS_RAIL_ACTOR, clearEvidence(why, tid), 'engine'); resolved++; }
    }
    let escalated = 0;
    if (record) {
      const regular = deps.isRegularSession(nowMs);
      const etDate = easternDate(nowMs);
      const patch: Record<string, unknown> = {};
      let remaining = 0;
      for (const [tid, m] of members) {
        const decidedAt = record.metadata?.[decidedField(tid)];
        if (closed.has(tid) || (typeof decidedAt === 'number' && decidedAt > m.joinedAtMs)) {
          // r4 FINDING-3: a member the sweep already removed must not come back; count the sweeps it survives.
          if (closed.has(tid)) state.closedMemberSweeps.set(tid, (state.closedMemberSweeps.get(tid) ?? 0) + 1);
          patch[memberField(tid)] = null; patch[decidedField(tid)] = null; continue;
        }
        const clock = stepMemberClock(m, nowMs, regular, etDate);
        if (clock.elapsedMs >= MEMBER_ESCALATE_AFTER_MS) {
          const mins = Math.round(clock.elapsedMs / 60_000);
          await pageOwnKey({
            tradeId: tid, symbol: m.symbol, assetClass: 'xstock_spot', lastReason: m.reason, pageSinceMs: clock.sessionClockStartMs ?? nowMs,
            title: `VTS exit decisions unavailable — ${mins} min with no decision for ${m.symbol}`,
            body: `VTS has made NO exit decision for ${mins} minutes of US regular-session time on open virtual trade ${tid} in `
              + `${m.symbol} (most recent reason: ${m.reason}) — past the ${MEMBER_ESCALATE_AFTER_MS / 60_000}-minute norm for an expected wide `
              + `book (row 2 increment (4a), audit A5: 421 of 423 such streaks ended within 30 min). While this lasts its stop and `
              + `target are NOT evaluated. This row clears itself when the trade decides or closes (${VTS_RAIL_REF}).`,
          }, nowMs, deps);
          patch[memberField(tid)] = null; escalated++; railCounts.escalations++; continue;
        }
        if (clock.sessionClockStartMs !== m.sessionClockStartMs || clock.sessionDateEt !== m.sessionDateEt) {
          patch[memberField(tid)] = { ...m, sessionClockStartMs: clock.sessionClockStartMs, sessionDateEt: clock.sessionDateEt };
        }
        remaining++;
      }
      if (Object.keys(patch).length) await deps.mergeAlertMetadata(record.id, patch);
      if (remaining === 0) {
        // ⛔ Langston r5 condition 1: `remaining` comes from the snapshot read at the top of this sweep, and the sweep is NOT
        // inside the runner's cycle guard — a join can land while it awaits. Re-read the record IMMEDIATELY before resolving
        // and require zero live members; then re-read once more, and page any member whose join landed between that check and
        // the resolve (it is now stranded on a resolved row, and its streak is already latched — it would never page again).
        const liveMembers = (r: RailAlertRow | undefined) => Object.entries(r?.metadata ?? {})
          .filter(([k, v]) => k.startsWith('member_') && v).map(([k, v]) => [k.slice('member_'.length), v as RailMember] as const);
        const fresh = deps.readAllAlerts().find((r) => r.id === record.id);
        if (fresh && isOpen(fresh) && liveMembers(fresh).length === 0) {
          await deps.resolveAlert(record.id, VTS_RAIL_ACTOR, `STANDING-RECORD-EMPTY ${VTS_RAIL_REF}`, 'engine');
          for (const [tid, m] of liveMembers(deps.readAllAlerts().find((r) => r.id === record.id))) {
            await pageOwnKey({
              tradeId: tid, symbol: m.symbol, assetClass: 'xstock_spot', lastReason: m.reason, pageSinceMs: m.sessionClockStartMs ?? nowMs,
              title: `VTS exit decisions unavailable — no decision for ${m.symbol} (joined as the standing record closed)`,
              body: `Open virtual trade ${tid} in ${m.symbol} (most recent reason: ${m.reason}) joined the VTS standing record in the `
                + `instant it resolved, so it is paged on its own key rather than lost (row 2 increment (4a), r5 condition 1). `
                + `This row clears itself when the trade decides or closes (${VTS_RAIL_REF}).`,
            }, nowMs, deps);
          }
        }
      }
    }
    loadVtsRailIndex(deps);
    state.sweepFailures = 0;
    for (const tid of [...state.closedMemberSweeps.keys()]) if (!members.some(([t]) => t === tid)) state.closedMemberSweeps.delete(tid);
    const stuckClosed = [...state.closedMemberSweeps.entries()].filter(([, n]) => n >= STUCK_CLOSED_MEMBER_SWEEPS).map(([t]) => t);
    await reportStuck(stuckClosed.length ? `closed members still listed after ${STUCK_CLOSED_MEMBER_SWEEPS} sweeps: ${stuckClosed.join(', ')}` : null, nowMs, deps);
    console.log(`[VTS_RAIL][SWEEP] railRowsOpen=${railRows.length} resolved=${resolved} members=${members.length} escalated=${escalated} `
      + `crossings=${railCounts.crossings} joins=${railCounts.joins} pagesAttempted=${railCounts.pagesAttempted} minted=${railCounts.minted} `
      + `dedupeHits=${railCounts.dedupeHits} escalations=${railCounts.escalations} markMisses=${railCounts.markMisses} sinceStart `
      + `alertFileBytes=${deps.alertFileBytes?.() ?? 'unread'}`);
  } catch (err) {
    state.sweepFailures++;
    console.error(`[VTS_RAIL][SWEEP_ERROR] consecutive=${state.sweepFailures}`, err instanceof Error ? err.message : err);
    if (state.sweepFailures >= STUCK_SWEEP_FAILURES) {
      try { await reportStuck(`the sweep failed ${state.sweepFailures} times in a row (last: ${err instanceof Error ? err.message : String(err)})`, nowMs, deps); } catch { /* logged above */ }
    }
  } finally {
    state.sweepInFlight = false;
  }
}

/** r4 FINDING-3 — the standing record is `info` and never re-surfaces, so if it stops clearing itself nothing would say so.
 *  `why` non-null ⇒ mint (or keep) the `vts-quiet-resolve-stuck` warning; null ⇒ resolve it if open. */
async function reportStuck(why: string | null, nowMs: number, deps: VtsRailDeps): Promise<void> {
  if (why !== null) {
    await deps.addAlert({
      triggers_at: new Date(nowMs), category: 'breakage', severity: 'warning',
      title: 'VTS standing record is not clearing itself',
      body: `The VTS no-decision rail's standing record (${VTS_STANDING_KEY}) is not being maintained: ${why}. Its members and `
        + `their 30-min escalation depend on the once-a-minute sweep (${VTS_RAIL_REF}); until it recovers, read the record by hand. `
        + `This warning resolves itself when the sweep runs clean.`,
      metadata: { why }, dedupe_key: VTS_STUCK_KEY,
    });
    return;
  }
  const open = deps.readAllAlerts().find((r) => isOpen(r) && r.dedupe_key === VTS_STUCK_KEY);
  if (open) await deps.resolveAlert(open.id, VTS_RAIL_ACTOR, `SWEEP-CLEAN ${VTS_RAIL_REF}`, 'engine');
}

/** Real lane (objective 12): every unpriced close is a warning on its own key, in ANY session, left for a human. */
export async function onUnpricedClose(t: { tradeId: string; symbol: string; assetClass: string; hold: string; exitArm: string; session: 'regular' | 'off_session' }, nowMs: number, deps: Pick<VtsRailDeps, 'addAlert'>): Promise<void> {
  await deps.addAlert({
    triggers_at: new Date(nowMs), category: 'breakage', severity: 'warning',
    title: `VTS trade closed with NO price — ${t.symbol}`,
    body: `Virtual trade ${t.tradeId} (${t.symbol}, ${t.assetClass}) reached the max-hold valve after ${t.hold} with no usable `
      + `price (arm ${t.exitArm}), so it closed \`timeout_unpriced\` with empty outcomes (\`exit_decision_archive\` `
      + `\`time_stop_unpriced\`). Its stop or target may have been missed and the trade is lost to the learning record. `
      + `Raised in ANY session — ${t.session === 'regular' ? 'this one closed inside the US regular session' : 'this one closed OUTSIDE the US regular session, where the no-decision rail never pages'} `
      + `(row 2 increment (4a), objective 12). Its key is this trade's own, so it is a RECORD, not a mute: it cannot block any later page. Resolve by hand once read.`,
    metadata: { tradeId: t.tradeId, symbol: t.symbol, assetClass: t.assetClass, exitArm: t.exitArm, session: t.session },
    dedupe_key: unpricedCloseKey(t.tradeId),
  });
}

/** Shadow lane (objective 12): no page (~6 a day would be a new flood) — one standing count row per class, merged. */
export async function onShadowUnpriced(t: { tradeId: string; symbol: string; assetClass: string }, nowMs: number, deps: Pick<VtsRailDeps, 'addAlert' | 'mergeAlertMetadata'>): Promise<void> {
  const row = await deps.addAlert({
    triggers_at: new Date(nowMs), category: 'health_check', severity: 'info',
    title: `VTS shadow lane: trades closed with no price (${t.assetClass})`,
    body: `A running count of shadow-lane VTS trades that reached the max-hold valve with no usable price and closed `
      + `\`timeout_unpriced\` (\`rtb_shadow_pairings.close_reason\`). Recorded, not paged (row 2 increment (4a), objective 12).`,
    metadata: {}, dedupe_key: shadowUnpricedKey(t.assetClass),
  });
  const md = row.metadata ?? {};
  const dayKey = `day_${easternDate(nowMs)}`;
  const last = Array.isArray(md.lastTrades) ? (md.lastTrades as unknown[]) : [];
  await deps.mergeAlertMetadata(row.id, {
    count: (typeof md.count === 'number' ? md.count : 0) + 1,
    [dayKey]: (typeof md[dayKey] === 'number' ? (md[dayKey] as number) : 0) + 1,
    lastTrades: [...last, { tradeId: t.tradeId, symbol: t.symbol, atMs: nowMs }].slice(-20),
  });
}

/** The production dependencies. */
export async function productionVtsRailDeps(): Promise<VtsRailDeps> {
  const alerts = await import('./system-alerts.js');
  const vq = await import('./venue-quiet-alerting.js');
  const { getXstockSession } = await import('../asset_classes/xstock_spot/time-of-day.js');
  const { isInXstockWeekendClose } = await import('../asset_classes/xstock_spot/market-hours.js');
  const { db } = await import('../db.js');
  const { sql } = await import('drizzle-orm');
  return {
    addAlert: alerts.addAlert as unknown as VtsRailDeps['addAlert'],
    mergeAlertMetadata: alerts.mergeAlertMetadata as unknown as VtsRailDeps['mergeAlertMetadata'],
    resolveAlert: alerts.resolveAlert as unknown as VtsRailDeps['resolveAlert'],
    readAllAlerts: alerts.readAllAlerts as unknown as VtsRailDeps['readAllAlerts'],
    closedTradeIds: async (ids) => {
      // ⛔ An IN list built with `sql.join`, NEVER `= ANY(${ids})`: Drizzle does not bind a JS array as a Postgres array and
      // that form silently returns ZERO rows (`#167`, `cron-fire-evidence-verifier.ts:64-70`).
      // ⛔ CLOSED IS A PRESENT ROW SAYING SO, NEVER AN ABSENT ROW: closed trades keep their `vts_open_trades` row (`closed`,
      // `closed_at`), so an id the query did not return is NOT read as closed — an empty or partial result (a broken query,
      // a wrong id) then resolves nothing instead of everything. A query error throws; the sweep catches it and resolves nothing.
      const res = await db.execute(sql`SELECT id, closed, closed_at FROM vts_open_trades WHERE id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`);
      const rows = ((res as unknown as { rows?: Array<{ id: string; closed: boolean | null; closed_at: unknown }> }).rows ?? []);
      return new Set(rows.filter((r) => r.closed === true || r.closed_at != null).map((r) => r.id));
    },
    xstockVerdict: (nowMs) => vq.classVerdict(vq.measureXstockTicking(nowMs), vq.readVenueQuietConfig(), nowMs),
    isRegularSession: (nowMs) => !isInXstockWeekendClose(new Date(nowMs)) && getXstockSession(nowMs) === 'regular',
    alertFileBytes: () => { try { return fs.statSync(alerts.ALERTS_FILE).size; } catch { return null; } },
  };
}
