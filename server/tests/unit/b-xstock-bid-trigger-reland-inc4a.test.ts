/**
 * B-XSTOCK-BID-TRIGGER-RELAND increment (4a) (row 2, `#1191`) — THE VTS NO-DECISION RAIL'S REPORTING.
 * Plan: `Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_INC4A_PRE_AUDIT.md` r1-r4. Coltrane approved r3; r4 folds Langston's review.
 * The alert store is an in-memory fake with the real store's dedupe rule (one NON-resolved row per key; a repeat returns
 * the existing row) — so "restart" is modelled by resetting the reporting module's in-memory state while the store survives.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  vtsXstockJoinsStandingRecord, stepMemberClock, railRowClear, railRowTradeId, railKey, easternDate,
  MEMBER_ESCALATE_AFTER_MS, VTS_STANDING_KEY, VTS_STUCK_KEY, memberField,
} from '../../core/trading/vts-rail';
import {
  onCrossing, markDecided, runVtsRailSweep, loadVtsRailIndex, ensureVtsRailIndex, onUnpricedClose, onShadowUnpriced, onMemberReason,
  _resetVtsRailState, _vtsRailIndex, railCounts, decidedField, type VtsRailDeps, type RailAlertRow,
} from '../../services/vts-rail-reporting';

// ── an in-memory alert store with the production dedupe rule ──
function makeStore() {
  const rows: RailAlertRow[] = [];
  let seq = 0;
  let clock = 0;
  const deps: VtsRailDeps & { rows: RailAlertRow[]; setClock: (ms: number) => void; closed: Set<string>; verdict: any; regular: boolean } = {
    rows, closed: new Set<string>(), verdict: 'not_quiet', regular: true,
    setClock: (ms) => { clock = ms; },
    addAlert: async (a: Record<string, unknown>) => {
      const key = a.dedupe_key as string;
      const existing = rows.find((r) => r.dedupe_key === key && r.state !== 'resolved');
      if (existing) return { ...existing };
      const row: RailAlertRow = {
        id: `a${++seq}`, dedupe_key: key, state: 'scheduled', created_at: new Date(clock).toISOString(),
        body: (a.body as string) ?? '', metadata: { ...((a.metadata as Record<string, unknown>) ?? {}) },
      };
      rows.push(row);
      return { ...row };
    },
    mergeAlertMetadata: async (id, patch) => {
      const r = rows.find((x) => x.id === id);
      if (!r || r.state === 'resolved') return null;
      r.metadata = { ...(r.metadata ?? {}), ...patch };
      return { ...r };
    },
    resolveAlert: async (id, by, evidence) => {
      const r = rows.find((x) => x.id === id);
      if (r) { r.state = 'resolved'; (r as any).resolved_by = by; (r as any).evidence = evidence; }
      return r;
    },
    readAllAlerts: () => rows.map((r) => ({ ...r, metadata: { ...(r.metadata ?? {}) } })),
    closedTradeIds: async (ids) => new Set(ids.filter((i) => deps.closed.has(i))),
    xstockVerdict: () => deps.verdict,
    isRegularSession: () => deps.regular,
  };
  return deps;
}
const flush = () => new Promise((r) => setTimeout(r, 0));
const XS = 'xstock_spot';
const WIDE = 'no_transactable_side (too_wide)';
const OLD = 'no_transactable_side (too_old)';
// Wed 2026-10-14 11:00 ET = 15:00Z; Thu 10-15 same; Fri 10-16 same.
const WED = Date.parse('2026-10-14T15:00:00Z');
const THU = Date.parse('2026-10-15T15:00:00Z');
const FRI = Date.parse('2026-10-16T15:00:00Z');
const crossing = (tradeId: string, symbol: string, lastReason: string, pageSinceMs: number) =>
  ({ tradeId, symbol, assetClass: XS, lastReason, pageSinceMs, title: `t ${symbol}`, body: `b open virtual trade ${tradeId} in ${symbol}` });

beforeEach(() => _resetVtsRailState());

describe('rule 1 — only a positively identified expected wide/quiet book joins (audit A4)', () => {
  it('too_wide joins; too_old joins only on a quiet/closed verdict', () => {
    expect(vtsXstockJoinsStandingRecord(WIDE, null)).toBe(true);
    expect(vtsXstockJoinsStandingRecord(OLD, 'quiet')).toBe(true);
    expect(vtsXstockJoinsStandingRecord(OLD, 'closed')).toBe(true);
  });
  it('everything else pages: too_old on not_quiet/thin/unreadable, no_usable_mark, side_unusable, an unknown string', () => {
    for (const v of ['not_quiet', 'thin', null] as const) expect(vtsXstockJoinsStandingRecord(OLD, v)).toBe(false);
    for (const r of ['no_usable_mark', 'no_transactable_side (side_unusable)', 'no_transactable_side (no_row)', 'something_new'])
      expect(vtsXstockJoinsStandingRecord(r, 'quiet')).toBe(false);
  });
});

describe('rule 2 — the member clock is durable and session-scoped (r3 BLOCKER-2)', () => {
  it('off-session clears it; a stored start from ANOTHER Eastern date restarts at zero (Thursday → Friday)', () => {
    const thu = stepMemberClock({ sessionClockStartMs: null, sessionDateEt: null }, THU, true, easternDate(THU));
    expect(thu.elapsedMs).toBe(0);
    const later = stepMemberClock(thu, THU + 20 * 60_000, true, easternDate(THU));
    expect(later.elapsedMs).toBe(20 * 60_000);
    // the process was DOWN through Thursday's close and restarts Friday still refusing: no off-session sweep ever ran
    const fri = stepMemberClock(later, FRI, true, easternDate(FRI));
    expect(fri.sessionClockStartMs).toBe(FRI);
    expect(fri.elapsedMs).toBe(0); // mutation "drop the date check" would read ~24h
    expect(stepMemberClock(later, THU + 7 * 3600_000, false, easternDate(THU)).sessionClockStartMs).toBeNull();
  });
});

describe('rule 3 — a row clears on a durable condition only', () => {
  it('decided after the mint (ISO created_at parsed) or the trade closed; never on an absent decision', () => {
    const iso = new Date(WED).toISOString();
    expect(railRowClear(iso, WED + 1, false)).toBe('decided_after_mint');
    expect(railRowClear(iso, WED - 1, false)).toBeNull();
    expect(railRowClear(iso, undefined, false)).toBeNull();
    expect(railRowClear(iso, undefined, true)).toBe('trade_closed');
  });
  it('the trade id comes from metadata, else from a pre-(4a) row body', () => {
    expect(railRowTradeId({ metadata: { tradeId: 'vts_x_1' } })).toBe('vts_x_1');
    expect(railRowTradeId({ metadata: {}, body: 'on open virtual trade vts_xstock_spot_1_abc in URI/USD (most recent' })).toBe('vts_xstock_spot_1_abc');
    expect(railRowTradeId({ metadata: {}, body: 'nothing' })).toBeNull();
  });
  it('r4 BLOCKER-1: the key is per TRADE, keeping the family prefix', () => {
    expect(railKey('STZ/USD', 'vts_a')).toBe('no-trigger-vts-STZ/USD-vts_a');
    expect(railKey('STZ/USD', 'vts_a')).not.toBe(railKey('STZ/USD', 'vts_b'));
  });
});

describe('the rail end to end, on the fake store', () => {
  it('an expected wide book JOINS the record and pages nobody; a no_usable_mark crossing PAGES on its own key', async () => {
    const d = makeStore(); d.setClock(WED);
    expect(await onCrossing(crossing('t1', 'STZ/USD', WIDE, WED - 10 * 60_000), WED, d)).toBe('joined');
    expect(await onCrossing(crossing('t2', 'PPL/USD', 'no_usable_mark', WED - 10 * 60_000), WED, d)).toBe('paged');
    expect(d.rows.find((r) => r.dedupe_key === VTS_STANDING_KEY)?.metadata?.[memberField('t1')]).toBeTruthy();
    expect(d.rows.some((r) => r.dedupe_key === railKey('PPL/USD', 't2'))).toBe(true);
    expect(d.rows.some((r) => r.dedupe_key?.startsWith('no-trigger-vts-STZ'))).toBe(false);
    expect(railCounts).toMatchObject({ crossings: 2, joins: 1, pagesAttempted: 1, minted: 1, dedupeHits: 0 });
  });
  it('two trades on ONE symbol each get their own row — no sibling suppression (r4 BLOCKER-1)', async () => {
    const d = makeStore(); d.setClock(WED);
    await onCrossing(crossing('s1', 'ACN/USD', 'no_usable_mark', WED), WED, d);
    await onCrossing(crossing('s2', 'ACN/USD', 'no_usable_mark', WED), WED, d);
    expect(d.rows.filter((r) => r.dedupe_key?.startsWith('no-trigger-vts-ACN/USD-'))).toHaveLength(2);
    expect(railCounts.minted).toBe(2);
    expect(railCounts.dedupeHits).toBe(0);
  });
  it('a re-crossing of the SAME trade while its row is open counts as a dedupe hit, not a mint', async () => {
    const d = makeStore(); d.setClock(WED);
    await onCrossing(crossing('r1', 'KKR/USD', 'no_usable_mark', WED), WED, d);
    d.setClock(WED + 60_000);
    await onCrossing(crossing('r1', 'KKR/USD', 'no_usable_mark', WED), WED + 60_000, d);
    expect(railCounts).toMatchObject({ minted: 1, dedupeHits: 1 });
  });

  it('MUTATION (a) — mint → decision → RESTART before the sweep → still refusing ⇒ the row resolves (the mark is on the row)', async () => {
    const d = makeStore(); d.setClock(WED);
    loadVtsRailIndex(d);
    await onCrossing(crossing('m1', 'NOC/USD', 'no_usable_mark', WED), WED, d);
    markDecided('m1', WED + 30_000, d); await flush();
    _resetVtsRailState();                       // restart: every in-memory structure is gone, the store survives
    ensureVtsRailIndex(d);
    await runVtsRailSweep(WED + 120_000, d);
    const row = d.rows.find((r) => r.dedupe_key === railKey('NOC/USD', 'm1'))!;
    expect(row.state).toBe('resolved');
    expect((row as any).evidence).toMatch(/^DECIDED-AFTER-MINT trade=m1 /);
    expect((row as any).resolved_by).toBe('vts-exit-monitor');
  });
  it('MUTATION (b) — refresh → mint → decision BEFORE the next refresh → restart ⇒ resolves (the index is written AT THE MINT)', async () => {
    const d = makeStore(); d.setClock(WED);
    loadVtsRailIndex(d);                        // the refresh: the index is now EMPTY of this trade
    await onCrossing(crossing('m2', 'BKR/USD', 'no_usable_mark', WED), WED, d);
    expect(_vtsRailIndex().rowByTrade.get('m2')).toBeDefined(); // mutation "no at-mint index write" leaves this undefined
    markDecided('m2', WED + 10_000, d); await flush();
    _resetVtsRailState(); ensureVtsRailIndex(d);
    await runVtsRailSweep(WED + 120_000, d);
    expect(d.rows.find((r) => r.dedupe_key === railKey('BKR/USD', 'm2'))!.state).toBe('resolved');
  });
  it('NEGATIVE — no decision and the trade still open ⇒ the row stays open (a stale row is a visibility cost; a wrong resolve is a lost alarm)', async () => {
    const d = makeStore(); d.setClock(WED);
    await onCrossing(crossing('n1', 'SBUX/USD', 'no_usable_mark', WED), WED, d);
    await runVtsRailSweep(WED + 120_000, d);
    expect(d.rows.find((r) => r.dedupe_key === railKey('SBUX/USD', 'n1'))!.state).toBe('scheduled');
  });
  it('r5 (Langston condition 3) — a decision mark on a row already resolved is COUNTED as markMisses, not assumed written', async () => {
    const d = makeStore(); d.setClock(WED);
    await onCrossing(crossing('x1', 'LIN/USD', 'no_usable_mark', WED), WED, d);
    const row = d.rows.find((r) => r.dedupe_key === railKey('LIN/USD', 'x1'))!;
    row.state = 'resolved';                                   // resolved by hand between the mint and the decision
    markDecided('x1', WED + 1_000, d); await flush();
    expect(railCounts.markMisses).toBe(1);
    expect(_vtsRailIndex().rowByTrade.has('x1')).toBe(false); // nothing left to mark
  });
  it('Langston Step 4 — a LEGACY per-symbol row and a new per-trade row for ONE trade are BOTH marked and BOTH resolve', async () => {
    const d = makeStore(); d.setClock(WED);
    await d.addAlert({ dedupe_key: 'no-trigger-vts-TSN/USD', body: 'VTS has made NO exit decision … on open virtual trade L1 in TSN/USD (most recent reason: x)' });
    loadVtsRailIndex(d);                                                  // the legacy row is indexed from its body
    await onCrossing(crossing('L1', 'TSN/USD', 'no_usable_mark', WED), WED, d); // a new per-trade row for the same trade
    expect(_vtsRailIndex().rowByTrade.get('L1')?.size).toBe(2);           // mutation "one id per trade" reads 1
    markDecided('L1', WED + 5_000, d); await flush();
    await runVtsRailSweep(WED + 60_000, d);
    expect(d.rows.find((r) => r.dedupe_key === 'no-trigger-vts-TSN/USD')!.state).toBe('resolved');
    expect(d.rows.find((r) => r.dedupe_key === railKey('TSN/USD', 'L1'))!.state).toBe('resolved');
  });
  it('the trade closed ⇒ TRADE-CLOSED', async () => {
    const d = makeStore(); d.setClock(WED);
    await onCrossing(crossing('c1', 'DE/USD', 'no_usable_mark', WED), WED, d);
    d.closed.add('c1');
    await runVtsRailSweep(WED + 120_000, d);
    expect((d.rows.find((r) => r.dedupe_key === railKey('DE/USD', 'c1')) as any).evidence).toMatch(/^TRADE-CLOSED trade=c1 /);
  });

  it('a member stuck 30 min of session time pages on its OWN key; one that decides leaves; the record resolves when empty', async () => {
    const d = makeStore(); d.setClock(WED);
    const start = WED - 10 * 60_000; // the streak's paging time began 10 min before the join crossing
    await onCrossing(crossing('w1', 'CDW/USD', WIDE, start), WED, d);
    await onCrossing(crossing('w2', 'IT/USD', WIDE, start), WED, d);
    markDecided('w2', WED + 60_000, d); await flush();             // w2's trade decides ⇒ it will leave
    await runVtsRailSweep(WED + 2 * 60_000, d);
    const rec = () => d.rows.find((r) => r.dedupe_key === VTS_STANDING_KEY)!;
    expect(rec().metadata?.[memberField('w2')]).toBeNull();
    expect(rec().metadata?.[memberField('w1')]).toBeTruthy();
    // 30 min after the streak's start ⇒ w1 escalates on its own key and leaves the record
    await runVtsRailSweep(start + MEMBER_ESCALATE_AFTER_MS, d);
    expect(d.rows.some((r) => r.dedupe_key === railKey('CDW/USD', 'w1'))).toBe(true);
    expect(railCounts.escalations).toBe(1);
    expect(rec().state).toBe('resolved');       // no members left
  });
  it('r5 MUTATION (Coltrane) — member joins → decision → RESTART before the sweep → still refusing ⇒ the member is removed', async () => {
    const d = makeStore(); d.setClock(WED);
    await onCrossing(crossing('j1', 'MMM/USD', WIDE, WED - 25 * 60_000), WED, d);
    await onCrossing(crossing('j2', 'ADP/USD', WIDE, WED - 5 * 60_000), WED, d);      // a sibling that must survive
    markDecided('j1', WED + 60_000, d); await flush();                               // the durable member-decision witness
    _resetVtsRailState(); ensureVtsRailIndex(d);                                      // restart before the sweep
    await runVtsRailSweep(WED + 2 * 60_000, d);
    const rec = d.rows.find((r) => r.dedupe_key === VTS_STANDING_KEY)!;
    expect(rec.metadata?.[memberField('j1')]).toBeNull();                            // gone, not escalated later
    expect(rec.metadata?.[memberField('j2')]).toBeTruthy();                          // the sibling is untouched
    await runVtsRailSweep(WED + 6 * 60_000, d);                                      // j1's OLD clock is past 30 min here
    expect(d.rows.some((r) => r.dedupe_key === railKey('MMM/USD', 'j1'))).toBe(false);
  });
  it('r5 — a re-crossing AFTER a decision starts a fresh member; the old 30-min clock is not inherited', async () => {
    const d = makeStore(); d.setClock(WED);
    await onCrossing(crossing('q1', 'ORCL/USD', WIDE, WED - 25 * 60_000), WED, d);
    markDecided('q1', WED + 60_000, d); await flush();
    _resetVtsRailState(); ensureVtsRailIndex(d);                                      // restart; the sweep has NOT run
    await onCrossing(crossing('q1', 'ORCL/USD', WIDE, WED + 2 * 60_000), WED + 12 * 60_000, d); // refusing again, new streak
    const m = d.rows.find((r) => r.dedupe_key === VTS_STANDING_KEY)!.metadata?.[memberField('q1')] as { joinedAtMs: number; sessionClockStartMs: number };
    expect(m.joinedAtMs).toBe(WED + 12 * 60_000);
    expect(m.sessionClockStartMs).toBe(WED + 2 * 60_000);
    await runVtsRailSweep(WED + 13 * 60_000, d);                                     // old clock: 38 min; new: 11 min
    expect(d.rows.some((r) => r.dedupe_key === railKey('ORCL/USD', 'q1'))).toBe(false);
  });
  it('r5 condition 1 (Langston) — a join that lands WHILE the sweep awaits keeps the record open (re-read before resolving)', async () => {
    const d = makeStore(); d.setClock(WED);
    await onCrossing(crossing('e1', 'EL/USD', WIDE, WED - 5 * 60_000), WED, d);
    markDecided('e1', WED + 10_000, d); await flush();                 // e1 will leave ⇒ the snapshot reads remaining = 0
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const real = d.closedTradeIds;
    d.closedTradeIds = async (ids) => { await gate; return real(ids); };
    const sweep = runVtsRailSweep(WED + 2 * 60_000, d);                 // snapshot taken, now awaiting
    await flush();
    expect(await onCrossing(crossing('e2', 'ES/USD', WIDE, WED), WED + 2 * 60_000, d)).toBe('joined'); // lands mid-sweep
    release(); await sweep;
    const rec = d.rows.find((r) => r.dedupe_key === VTS_STANDING_KEY)!;
    expect(rec.state).not.toBe('resolved');                             // mutation "resolve on the snapshot" reads resolved
    expect(rec.metadata?.[memberField('e2')]).toBeTruthy();
  });
  it('r5 condition 1 — a join that lands between the re-read and the resolve is PAGED on its own key, not lost', async () => {
    const d = makeStore(); d.setClock(WED);
    await onCrossing(crossing('f1', 'FE/USD', WIDE, WED - 5 * 60_000), WED, d);
    markDecided('f1', WED + 10_000, d); await flush();
    const realResolve = d.resolveAlert;
    d.resolveAlert = async (id, by, ev, t) => {                          // the join's merge lands just before the resolve
      const rec = d.rows.find((r) => r.id === id);
      if (rec?.dedupe_key === VTS_STANDING_KEY) rec.metadata = { ...rec.metadata, [memberField('f2')]: { symbol: 'FI/USD', reason: WIDE, joinedAtMs: WED, sessionClockStartMs: WED, sessionDateEt: easternDate(WED) } };
      return realResolve(id, by, ev, t);
    };
    await runVtsRailSweep(WED + 2 * 60_000, d);
    expect(d.rows.find((r) => r.dedupe_key === VTS_STANDING_KEY)!.state).toBe('resolved');
    expect(d.rows.some((r) => r.dedupe_key === railKey('FI/USD', 'f2'))).toBe(true); // mutation "no post-resolve check": false
  });
  it('r5 condition 2 (Langston) — a join whose member write returns null (record resolved underneath) PAGES instead', async () => {
    const d = makeStore(); d.setClock(WED);
    const realMerge = d.mergeAlertMetadata;
    d.mergeAlertMetadata = async (id, patch) => {
      const r = d.rows.find((x) => x.id === id);
      if (r?.dedupe_key === VTS_STANDING_KEY) { r.state = 'resolved'; }  // resolved between addAlert and the merge
      return realMerge(id, patch);
    };
    expect(await onCrossing(crossing('g1', 'GD/USD', WIDE, WED), WED, d)).toBe('paged'); // mutation "ignore null": 'joined'
    expect(d.rows.some((r) => r.dedupe_key === railKey('GD/USD', 'g1'))).toBe(true);
    expect(railCounts.joins).toBe(0);
  });
  it('Coltrane Step 4 BLOCKER-2 — a member whose reason turns NON-expected leaves the record and pages at once', async () => {
    const d = makeStore(); d.setClock(WED);
    await onCrossing(crossing('t1', 'TT/USD', WIDE, WED), WED, d);           // joined on too_wide
    expect(await onMemberReason(crossing('t1', 'TT/USD', WIDE, WED), WED + 60_000, d)).toBe(false); // still expected: stays
    expect(await onMemberReason(crossing('t1', 'TT/USD', 'no_usable_mark', WED), WED + 120_000, d)).toBe(true);
    expect(d.rows.find((r) => r.dedupe_key === VTS_STANDING_KEY)!.metadata?.[memberField('t1')]).toBeNull();
    expect(d.rows.some((r) => r.dedupe_key === railKey('TT/USD', 't1'))).toBe(true);
    expect(railCounts.reasonExits).toBe(1);
    // and a non-member is never paged by this path
    expect(await onMemberReason(crossing('zz', 'ZZ/USD', 'no_usable_mark', WED), WED, d)).toBe(false);
  });
  it('Coltrane Step 4 BLOCKER-2 — an exceptional crossing for a trade that is a member also tombstones the membership', async () => {
    const d = makeStore(); d.setClock(WED);
    await onCrossing(crossing('t2', 'TU/USD', WIDE, WED), WED, d);
    await onCrossing(crossing('t2', 'TU/USD', 'no_usable_mark', WED), WED + 60_000, d);
    expect(d.rows.find((r) => r.dedupe_key === VTS_STANDING_KEY)!.metadata?.[memberField('t2')]).toBeNull();
  });
  it('10 min stays the JOIN threshold and 30 min is a separate clock: a member at 25 min does not page', async () => {
    const d = makeStore(); d.setClock(WED);
    const start = WED - 10 * 60_000;
    await onCrossing(crossing('k1', 'PLD/USD', WIDE, start), WED, d);
    await runVtsRailSweep(start + 25 * 60_000, d);
    expect(d.rows.some((r) => r.dedupe_key === railKey('PLD/USD', 'k1'))).toBe(false);
  });

  it('r4 FINDING-3 — ten failed sweeps raise the stuck warning; a clean sweep resolves it', async () => {
    const d = makeStore(); d.setClock(WED);
    await onCrossing(crossing('f1', 'EWU/USD', WIDE, WED), WED, d);
    const real = d.closedTradeIds;
    d.closedTradeIds = async () => { throw new Error('db down'); };
    for (let i = 0; i < 10; i++) await runVtsRailSweep(WED + (i + 1) * 61_000, d);
    expect(d.rows.find((r) => r.dedupe_key === VTS_STUCK_KEY)?.state).toBe('scheduled');
    d.closedTradeIds = real;
    await runVtsRailSweep(WED + 12 * 61_000, d);
    expect(d.rows.find((r) => r.dedupe_key === VTS_STUCK_KEY)?.state).toBe('resolved');
  });

  it('objective 12 — a real-lane unpriced close is a per-trade warning that names its session; the shadow lane only counts', async () => {
    const d = makeStore(); d.setClock(WED);
    await onUnpricedClose({ tradeId: 'u1', symbol: 'PPL/USD', assetClass: XS, hold: '7d', exitArm: 'clamp_mark', session: 'off_session', lastRefusal: WIDE }, WED, d);
    const u = d.rows.find((r) => r.dedupe_key === 'vts-unpriced-close-u1')!;
    expect(u.body).toMatch(/OUTSIDE the US regular session/);
    expect(u.body).toMatch(/RECORD, not a mute/);
    // objective 12 (Coltrane Step 4 BLOCKER-3): symbol, hold and the last refusal reason are on the record
    expect(u.body).toContain('last refusal reason: no_transactable_side (too_wide)');
    expect(u.metadata).toMatchObject({ symbol: 'PPL/USD', hold: '7d', lastRefusal: WIDE });
    await onShadowUnpriced({ tradeId: 'sh1', symbol: 'A/USD', assetClass: XS, hold: '7d 0h', lastRefusal: 'no_transactable_side' }, WED, d);
    await onShadowUnpriced({ tradeId: 'sh2', symbol: 'B/USD', assetClass: XS, hold: '6d 23h', lastRefusal: null }, WED + 1, d);
    const sh = d.rows.find((r) => r.dedupe_key === 'vts-shadow-unpriced-xstock_spot')!;
    expect(sh.metadata?.count).toBe(2);                 // merged, not a repeated addAlert (which changes nothing)
    expect((sh.metadata?.lastTrades as unknown[]).length).toBe(2);
    expect((sh.metadata?.lastTrades as Array<Record<string, unknown>>)[0]).toMatchObject({ symbol: 'A/USD', hold: '7d 0h', lastRefusal: 'no_transactable_side' });
    expect(d.rows.filter((r) => r.dedupe_key === 'vts-shadow-unpriced-xstock_spot')).toHaveLength(1);
  });
  it('the decided mark on a MEMBER uses its own key on the record (single-key merge, never a map rewrite)', async () => {
    const d = makeStore(); d.setClock(WED);
    await onCrossing(crossing('d1', 'XYL/USD', WIDE, WED), WED, d);
    markDecided('d1', WED + 5, d); await flush();
    expect(d.rows.find((r) => r.dedupe_key === VTS_STANDING_KEY)!.metadata?.[decidedField('d1')]).toBe(WED + 5);
  });
});

describe('fence — the cold cohort count can never be read for a join (r2a)', () => {
  it('the rail crosses only after 10 min of streak, longer than NOT_WARM_GRACE_MS', { timeout: 60_000 }, async () => {
    const { NOT_WARM_GRACE_MS } = await import('../../services/venue-quiet-alerting');
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('server/services/vts-runner.ts', 'utf8');
    const m = /const VTS_NO_TRIGGER_ALERT_AFTER_MS = (\d+) \* 60_000;/.exec(src);
    expect(m).not.toBeNull();
    expect(Number(m![1]) * 60_000).toBeGreaterThan(NOT_WARM_GRACE_MS);
  });
});

describe('P1b — the paper sibling `no-trigger-<mode>-*` clears itself, restart-safe', async () => {
  const { PaperNoTriggerRail } = await import('../../services/paper-no-trigger-clear');
  const mk = () => {
    const d = makeStore();
    const closedPos = new Set<string>();
    const deps = { mergeAlertMetadata: d.mergeAlertMetadata, resolveAlert: d.resolveAlert, readAllAlerts: d.readAllAlerts,
      closedPositionIds: async (_m: string, ids: string[]) => new Set(ids.filter((i) => closedPos.has(i))) };
    return { d, deps, closedPos };
  };
  const mint = async (d: ReturnType<typeof makeStore>, pid: string, sym: string) =>
    d.addAlert({ dedupe_key: `no-trigger-paper-${sym}`, body: 'b', metadata: { positionId: pid } });

  it('mint → decision → RESTART before the sweep ⇒ resolves by the existing active-exit-monitor actor', async () => {
    const { d, deps } = mk(); d.setClock(WED);
    let rail = new PaperNoTriggerRail('paper'); rail.ensureLoaded(deps);   // loaded BEFORE the mint
    rail.noteMint('p1', await mint(d, 'p1', 'ACN/USD'));
    rail.markDecided('p1', WED + 5_000, deps); await flush();
    rail = new PaperNoTriggerRail('paper'); rail.ensureLoaded(deps);       // restart
    expect(await rail.sweep(WED + 60_000, deps)).toBe(1);
    const r = d.rows[0] as any;
    expect(r.state).toBe('resolved');
    expect(r.resolved_by).toBe('active-exit-monitor');
    expect(r.evidence).toMatch(/^DECIDED-AFTER-MINT position=p1 server\/services\/paper-no-trigger-clear\.ts:1$/);
  });
  it('MUTATION — without the at-mint index write the decision is lost and the row stays open', async () => {
    const { d, deps } = mk(); d.setClock(WED);
    const rail = new PaperNoTriggerRail('paper'); rail.ensureLoaded(deps);
    await mint(d, 'p2', 'BKR/USD');                                          // NOT noted at the mint
    rail.markDecided('p2', WED + 5_000, deps); await flush();
    expect(await rail.sweep(WED + 60_000, deps)).toBe(0);                    // the guard the real path must not need
  });
  it('a position_closed log row resolves it; NO decision and NO close row ⇒ stays open; a legacy row with no position id is left', async () => {
    const { d, deps, closedPos } = mk(); d.setClock(WED);
    const rail = new PaperNoTriggerRail('paper'); rail.ensureLoaded(deps);
    rail.noteMint('p3', await mint(d, 'p3', 'DE/USD'));
    rail.noteMint('p4', await mint(d, 'p4', 'SBUX/USD'));
    await d.addAlert({ dedupe_key: 'no-trigger-paper-OLD/USD', body: 'legacy' });
    closedPos.add('p3');
    expect(await rail.sweep(WED + 60_000, deps)).toBe(1);
    expect((d.rows.find((r) => r.dedupe_key === 'no-trigger-paper-DE/USD') as any).evidence).toMatch(/^POSITION-CLOSED position=p3 /);
    expect(d.rows.find((r) => r.dedupe_key === 'no-trigger-paper-SBUX/USD')!.state).toBe('scheduled');
    expect(d.rows.find((r) => r.dedupe_key === 'no-trigger-paper-OLD/USD')!.state).toBe('scheduled');
  });
  it('the live mode never touches the paper rows', async () => {
    const { d, deps } = mk(); d.setClock(WED);
    const paper = new PaperNoTriggerRail('paper'); paper.ensureLoaded(deps);
    paper.noteMint('p5', await mint(d, 'p5', 'KKR/USD'));
    paper.markDecided('p5', WED + 1, deps); await flush();
    const live = new PaperNoTriggerRail('live'); live.ensureLoaded(deps);
    expect(await live.sweep(WED + 60_000, deps)).toBe(0);
  });
});

describe('P1b fence — the engine mints the paper row WITH its position id and indexes it at the mint', () => {
  it('reads the engine source', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('server/services/active-execution-engine.ts', 'utf8');
    expect(src).toMatch(/metadata: \{ positionId: position\.id \},\s*\r?\n\s*dedupe_key: `no-trigger-\$\{this\.mode\}-\$\{position\.symbol\}`/);
    expect(src).toContain('rail.noteMint(_ntPid, _ntRow as any)');
    expect(src).toContain('this._noteNoTriggerRailDecision(position.id as string, decision.noDecisionReason);');
    expect(src).toContain('void this._runNoTriggerRailSweep(); // row 2 (4a) P1b');
  });
});

describe('Coltrane Step 4 BLOCKER-1 — the paper engine marks a rail row DECIDED only on a real decision (the real method)', async () => {
  const { ActiveExecutionEngine } = await import('../../services/active-execution-engine');
  const proto = (ActiveExecutionEngine as any).prototype;
  const make = () => {
    const calls: string[] = [];
    const eng = Object.create(proto);
    eng.mode = 'paper';
    eng._noTriggerRailCtx = () => Promise.resolve({ rail: { markDecided: (pid: string) => { calls.push(pid); } }, deps: {} });
    return { eng, calls };
  };
  it('no_usable_mark (which DOES reach the decision site) cannot clear the row; no_transactable_side cannot either', async () => {
    const { eng, calls } = make();
    expect(eng._noteNoTriggerRailDecision('p1', 'no_usable_mark')).toBe(false);
    expect(eng._noteNoTriggerRailDecision('p1', 'no_transactable_side')).toBe(false);
    await flush();
    expect(calls).toEqual([]);
  });
  it('a real decision (reason undefined) marks the row', async () => {
    const { eng, calls } = make();
    expect(eng._noteNoTriggerRailDecision('p2', undefined)).toBe(true);
    await flush();
    expect(calls).toEqual(['p2']);
  });
  it('the decision site passes the evaluator reason through that method (source fence)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('server/services/active-execution-engine.ts', 'utf8');
    expect(src).toContain('this._noteNoTriggerRailDecision(position.id as string, decision.noDecisionReason);');
    expect(src).not.toContain('rail.markDecided(_dPid, _dAt, deps)');
  });
});

describe('Coltrane Step 4 BLOCKER-2/3 — the runner wiring (source fence; the behaviour is tested above)', () => {
  it('a refusing member is checked on every paging pass; the closes carry hold and the last refusal', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('server/services/vts-runner.ts', 'utf8');
    expect(src).toMatch(/if \(_ntReason !== undefined && _ntPages && !_ntStep\.page && _ntStep\.next !== null && isStandingMember\(tradeId\)\)/);
    expect(src).toContain('await onMemberReason({');
    expect(src).toContain("lastRefusal: _lastRefusal }, now, d))");
    expect(src).toContain('hold: _sHold, lastRefusal: _sLastRefusal }, now, d))');
    expect(src).toContain('if (_ntReason !== undefined) _vtsLastRefusal.set(tradeId, _ntReason);');
  });
});
