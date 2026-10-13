/**
 * B-VENUE-QUIET-ALERTING r7 (row 3a1, Step 9 after the Monday window read FAIL-3).
 * Design: `Claude Comms and Packages/Langston Design Asks/B_VENUE_QUIET_ALERTING_STEP9_R7_DESIGN.md` (r7d).
 *
 *  A.5  the session gate — outside the US regular session a quiet-market streak joins whatever the cohort count (but `thin`).
 *       The three false pages of 2026-10-12 are replayed at their own instants with their own stamped `T`.
 *  A.8  Langston BLOCKER-2 — the duration clock resets when the regular session ends, so a member joining after the close
 *       cannot inherit six hours of in-session not-quiet and be duration-paged at the next flicker.
 *  B.3  FINDING-1 — an off-session `price-skip` row still held when the regular session opens is superseded and its position
 *       handed back to the engine (latch cleared FIRST, then resolve; the sweep mints nothing).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../db.js', () => ({ db: { execute: vi.fn(), select: vi.fn(), insert: vi.fn() } }));
vi.mock('../../services/system-alerts.js', () => ({ addAlert: vi.fn(), isValidResolutionEvidence: () => true }));

import {
  VenueQuietState, classVerdict, familyJoinsStandingRecord, joinsStandingRecord, clearEvidence, standingKey, sweepVenueQuiet,
} from '../../services/venue-quiet-alerting.js';

const CFG = { quietTickingMin: 346, thinTickingMin: 50, escalateAfterMs: 1_800_000, resolveStuckAfterMs: 3_600_000 };
const at = (iso: string) => Date.parse(iso);

describe('A.5 the session gate', () => {
  // The three quiet-only pages of 2026-10-12 (Langston, store-enumerated), each at its own instant with its own stamped T.
  const FAIL3: Array<[string, string, number]> = [
    ['NOC/USD', '2026-10-12T00:16:16Z', 439],  // ramp-up, Sunday 20:16 ET = overnight
    ['NOC/USD', '2026-10-12T00:17:54Z', 388],  // ramp-up
    ['INVH/USD', '2026-10-12T20:16:54Z', 410], // wind-down, Monday 16:16 ET = after hours (78fe1d30)
  ];
  it('each of the three 10-12 rows read not_quiet at its instant — and now joins instead of paging', () => {
    for (const [, iso, t] of FAIL3) {
      expect(classVerdict(t, CFG, at(iso))).toBe('not_quiet');
      expect(joinsStandingRecord(['quiet_market'], 'not_quiet', at(iso))).toBe(true);
    }
  });
  it('in the regular session the cohort test is unchanged: not_quiet pages, quiet joins', () => {
    expect(familyJoinsStandingRecord('quiet_market', 'not_quiet', at('2026-10-12T15:00:00Z'))).toBe(false);
    expect(familyJoinsStandingRecord('quiet_market', 'quiet', at('2026-10-12T15:00:00Z'))).toBe(true);
  });
  it('off-session a THIN feed still pages every family (arm ii), and an unreadable config still pages', () => {
    expect(familyJoinsStandingRecord('quiet_market', 'thin', at('2026-10-12T20:16:54Z'))).toBe(false);
    expect(familyJoinsStandingRecord('quiet_market', null, at('2026-10-12T20:16:54Z'))).toBe(false);
  });
  it('off-session the minority veto still holds for a family that pages there (other)', () => {
    expect(joinsStandingRecord(['quiet_market', 'other'], 'not_quiet', at('2026-10-12T20:16:54Z'))).toBe(false);
  });
  it('DST: the session is read in New York time — 16:16 ET after hours in winter (21:16Z), 15:30 ET regular (20:30Z)', () => {
    expect(familyJoinsStandingRecord('quiet_market', 'not_quiet', at('2026-12-02T21:16:00Z'))).toBe(true);
    expect(familyJoinsStandingRecord('quiet_market', 'not_quiet', at('2026-12-02T20:30:00Z'))).toBe(false);
  });
});

// ── the sweep ─────────────────────────────────────────────────────────────────────────────────────────────────────
const row = (key: string, createdMs: number, metadata: Record<string, unknown> = {}) =>
  ({ id: 'id-' + key, dedupe_key: key, state: 'active', created_at: new Date(createdMs).toISOString(), metadata });
function deps(rows: any[], resolveImpl?: (k: string) => Promise<string[]>) {
  const calls: string[] = [];
  return {
    calls,
    listAlerts: () => rows,
    resolveByKey: vi.fn(async (k: string, _by: string, ev: string) => { calls.push('resolve:' + ev); return resolveImpl ? resolveImpl(k) : ['res-' + k]; }),
    addAlert: vi.fn(async (o: any) => ({ id: 'new-' + o.dedupe_key })),
    clearLatch: vi.fn((id: string) => { calls.push('clear:' + id); }),
  };
}
const sweep = (nowMs: number, open: any[], st: VenueQuietState, verdict: any, d: any) =>
  sweepVenueQuiet({ mode: 'paper', nowMs, openPositions: open, state: st, cfg: CFG, verdict, deps: d });

describe('A.8 BLOCKER-2: the duration clock does not run across the daily close', () => {
  const INVH = { id: 'pos-invh', symbol: 'INVH/USD', assetClass: 'xstock_spot' };
  const standing = (joinedMs: number) => row(standingKey('paper'), joinedMs, {
    members: { 'pos-invh': { symbol: 'INVH/USD', listedAtMs: joinedMs, lastJoinedAtMs: joinedMs, reasonFamilies: ['quiet_market'] } } });
  it('INVH replay: not-quiet since 13:45:37Z, joins at 20:16:54Z, the next sweep reads not_quiet ⇒ NO duration page', async () => {
    const st = new VenueQuietState();
    const d0 = deps([]);
    await sweep(at('2026-10-12T13:45:37Z'), [INVH], st, 'not_quiet', d0);   // the regular session, clock starts
    await sweep(at('2026-10-12T20:15:51Z'), [INVH], st, 'not_quiet', d0);   // 16:15 ET = after hours: the session left regular, the clock resets HERE
    const d = deps([standing(at('2026-10-12T20:16:54Z'))]);
    const r = await sweep(at('2026-10-12T20:17:52Z'), [INVH], st, 'not_quiet', d); // the flicker case Langston named
    expect(r.escalated).toEqual([]);
    expect(d.addAlert).not.toHaveBeenCalled();
  });
  it('the clock restarts at the first after-hours sweep, so 30 min of CONTINUOUS off-session not-quiet still pages', async () => {
    const st = new VenueQuietState();
    await sweep(at('2026-10-12T19:50:00Z'), [INVH], st, 'not_quiet', deps([]));            // regular
    await sweep(at('2026-10-12T20:01:00Z'), [INVH], st, 'not_quiet', deps([]));            // left regular ⇒ reset, restarts here
    const d = deps([standing(at('2026-10-12T20:05:00Z'))]);
    const early = await sweep(at('2026-10-12T20:30:00Z'), [INVH], st, 'not_quiet', d);
    expect(early.escalated).toEqual([]);
    const late = await sweep(at('2026-10-12T20:31:00Z'), [INVH], st, 'not_quiet', d);    // 30 min after 20:01
    expect(late.escalated).toEqual(['INVH/USD']);
  });
  it('MUTATION GUARD: without a session change the clock is inherited — an in-session member past 30 min does page', async () => {
    const st = new VenueQuietState();
    await sweep(at('2026-10-12T14:00:00Z'), [INVH], st, 'not_quiet', deps([]));
    const d = deps([standing(at('2026-10-12T14:10:00Z'))]);
    const r = await sweep(at('2026-10-12T14:31:00Z'), [INVH], st, 'not_quiet', d);
    expect(r.escalated).toEqual(['INVH/USD']);
  });
});

describe('B.3 FINDING-1: an off-session row held into the regular session', () => {
  const XS = { id: 'pos-invh', symbol: 'INVH/USD', assetClass: 'xstock_spot' };
  const KEY = 'price-skip-paper-INVH/USD';
  const offSession = at('2026-10-12T20:16:54Z');   // 78fe1d30's own instant, after hours
  const nextOpen = at('2026-10-13T13:31:00Z');     // 09:31 ET Tuesday
  it('is superseded and handed back: latch cleared FIRST, then resolved with its own token; the sweep mints nothing', async () => {
    const st = new VenueQuietState();
    const d = deps([row(KEY, offSession, { positionId: XS.id, reasonFamilies: ['quiet_market'] })]);
    const r = await sweep(nextOpen, [XS], st, 'quiet', d);
    expect(d.calls).toEqual(['clear:pos-invh', 'resolve:' + clearEvidence.supersededBySessionChange('pos-invh')]);
    expect(r.resolved).toEqual(['res-' + KEY]);
    expect(d.addAlert).not.toHaveBeenCalled();
  });
  it('covers every family — a thin-minted book-state row too', async () => {
    const d = deps([row(KEY, at('2026-10-12T23:00:00Z'), { positionId: XS.id, reasonFamilies: ['book_state'], classVerdict: 'thin' })]);
    await sweep(nextOpen, [XS], new VenueQuietState(), 'not_quiet', d);
    expect(d.clearLatch).toHaveBeenCalledWith('pos-invh');
  });
  it('a row minted IN the regular session is left alone (the engine judged it there)', async () => {
    const d = deps([row(KEY, at('2026-10-13T13:45:00Z'), { positionId: XS.id })]);
    await sweep(at('2026-10-13T14:00:00Z'), [XS], new VenueQuietState(), 'not_quiet', d);
    expect(d.clearLatch).not.toHaveBeenCalled();
    expect(d.resolveByKey).not.toHaveBeenCalled();
  });
  it('still off-session (pre-market) ⇒ left alone until the session is regular', async () => {
    const d = deps([row(KEY, offSession, { positionId: XS.id })]);
    await sweep(at('2026-10-13T12:00:00Z'), [XS], new VenueQuietState(), 'quiet', d);   // 08:00 ET, pre
    expect(d.clearLatch).not.toHaveBeenCalled();
  });
  it('priced after the mint ⇒ PRICED-AFTER-MINT as before, no hand-back', async () => {
    const st = new VenueQuietState();
    st.notePriced(XS.id, nextOpen - 1_000);
    const d = deps([row(KEY, offSession, { positionId: XS.id })]);
    await sweep(nextOpen, [XS], st, 'not_quiet', d);
    expect(d.calls).toEqual(['resolve:' + clearEvidence.pricedAfterMint('pos-invh')]);
  });
  it('a crypto position on the same key shape is never handed back', async () => {
    const d = deps([row('price-skip-paper-BTC/USD', offSession, { positionId: 'pos-btc' })]);
    await sweep(nextOpen, [{ id: 'pos-btc', symbol: 'BTC/USD', assetClass: 'crypto_spot' }], new VenueQuietState(), 'quiet', d);
    expect(d.clearLatch).not.toHaveBeenCalled();
  });
  it('a failing resolve: the latch is already clear, the failure is counted, and the next sweep retries', async () => {
    let fail = true;
    const d = deps([row(KEY, offSession, { positionId: XS.id })], async (k) => { if (fail) throw new Error('db'); return ['res-' + k]; });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const st = new VenueQuietState();
    const r1 = await sweep(nextOpen, [XS], st, 'quiet', d);
    expect(r1.failed).toBe(1);
    expect(d.clearLatch).toHaveBeenCalledTimes(1);
    fail = false;
    const r2 = await sweep(nextOpen + 60_000, [XS], st, 'quiet', d);
    expect(r2.resolved).toEqual(['res-' + KEY]);
  });
});
