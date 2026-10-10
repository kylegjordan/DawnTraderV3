/**
 * B-VENUE-QUIET-ALERTING (#526 + #994 + #638; SPRINT_TO_LIVE_PLAN row 3a1) — the quiet-market delivery rule, its
 * pre-registered replay, a CONSTRUCTED stall (no historical stall exists — Langston r2 C3), the engine's escalation paths,
 * and the clearing sweep.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({
  addAlert: vi.fn(),
  mergeAlertMetadata: vi.fn(),
  T: 200,
  threshold: 40 as number | Error,
}));
vi.mock('../../services/system-alerts.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  addAlert: (...a: any[]) => m.addAlert(...a),
  mergeAlertMetadata: (...a: any[]) => m.mergeAlertMetadata(...a),
}));
vi.mock('../../services/module-constants-service.js', async (importOriginal) => {
  const orig = await importOriginal<Record<string, any>>();
  return {
    ...orig,
    getCachedNumberRequired: (module: string, name: string, scope: any) => {
      if (module === 'exit_integrity' && name === 'max_consecutive_price_skips') {
        if (m.threshold instanceof Error) throw m.threshold;
        return m.threshold;
      }
      if (module === 'venue_quiet') {
        return ({ quiet_ticking_min: 346, thin_ticking_min: 50, escalate_after_ms: 1_800_000, resolve_stuck_after_ms: 3_600_000 } as any)[name];
      }
      return orig.getCachedNumberRequired(module, name, scope);
    },
  };
});
vi.mock('../../services/passive-archive/equity-spot-archiver.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  countEquitySymbolsUpdatedSince: () => m.T,
}));

import { ActiveExecutionEngine } from '../../services/active-execution-engine.js';
import {
  VenueQuietState, classVerdict, isQuietMarketReason, isBookStateHoldReason, reasonFamilyOf, joinsStandingRecord,
  familyJoinsStandingRecord, familiesOf,
  priceSkipKeyPattern, standingKey, stuckKey, configKey,
  sweepVenueQuiet, THRESHOLD_SEED_REF,
} from '../../services/venue-quiet-alerting.js';

const CFG = { quietTickingMin: 346, thinTickingMin: 50, escalateAfterMs: 1_800_000, resolveStuckAfterMs: 3_600_000 };
// r4: the verdict reads the venue calendar, so every rule test names its instant (Wednesday 11:00 ET = regular session).
const WEEKDAY = Date.parse('2026-10-07T15:00:00Z');
const AFTER_HOURS = Date.parse('2026-10-07T22:00:00Z');   // Wednesday 18:00 ET
const SATURDAY = Date.parse('2026-10-10T15:00:00Z');      // inside the weekend close

describe('the rule', () => {
  it('quiet-market family is exactly the stale-mark and missing-tick reasons', () => {
    for (const r of ['equity_tick_missing', 'equity_tick_stale_self', 'equity_tick_stale_classwide', 'equity_tick_stale_floor_bound_near_stop']) expect(isQuietMarketReason(r)).toBe(true);
    for (const r of ['book_state_unvalidated', 'book_state_yield_refused', 'equity_age_knob_missing', 'rest_failed', 'rest_no_data']) expect(isQuietMarketReason(r)).toBe(false);
  });
  it('CONSTRUCTED STALL (no historical stall exists): T=0 and T=49 are thin ⇒ page; 50..345 quiet; 346+ not quiet ⇒ page', () => {
    expect(classVerdict(0, CFG, WEEKDAY)).toBe('thin');
    expect(classVerdict(49, CFG, WEEKDAY)).toBe('thin');
    expect(classVerdict(50, CFG, WEEKDAY)).toBe('quiet');
    expect(classVerdict(345, CFG, WEEKDAY)).toBe('quiet');
    expect(classVerdict(346, CFG, WEEKDAY)).toBe('not_quiet');
  });
  it('r4: the weekend close reads CLOSED for every T; the boundaries are the venue calendar (Fri 20:00 to Sun 20:00 ET)', () => {
    for (const t of [0, 49, 200, 468]) expect(classVerdict(t, CFG, SATURDAY)).toBe('closed');
    expect(classVerdict(468, CFG, Date.parse('2026-10-10T00:01:00Z'))).toBe('closed');     // Fri 20:01 ET
    expect(classVerdict(468, CFG, Date.parse('2026-10-09T23:59:00Z'))).toBe('not_quiet');  // Fri 19:59 ET
    expect(classVerdict(468, CFG, Date.parse('2026-10-12T00:01:00Z'))).toBe('not_quiet');  // Sun 20:01 ET
  });
  it('r4: the book-state hold family is exactly the two guard refusals; the families are disjoint', () => {
    expect(isBookStateHoldReason('book_state_unvalidated')).toBe(true);
    expect(isBookStateHoldReason('book_state_yield_refused')).toBe(true);
    for (const r of ['book_state_knob_missing', 'equity_tick_missing', 'rest_failed']) expect(isBookStateHoldReason(r)).toBe(false);
    expect(reasonFamilyOf('equity_tick_stale_classwide')).toBe('quiet_market');
    expect(reasonFamilyOf('book_state_unvalidated')).toBe('book_state');
    expect(reasonFamilyOf('book_state_knob_missing')).toBe('other');
  });
  it('r4/r5: which single family joins the record - never on an unreadable config, never the other family', () => {
    expect(familyJoinsStandingRecord('quiet_market', 'quiet', WEEKDAY)).toBe(true);
    expect(familyJoinsStandingRecord('quiet_market', 'closed', SATURDAY)).toBe(true);
    expect(familyJoinsStandingRecord('quiet_market', 'not_quiet', WEEKDAY)).toBe(false);
    expect(familyJoinsStandingRecord('quiet_market', 'thin', WEEKDAY)).toBe(false);
    expect(familyJoinsStandingRecord('book_state', 'not_quiet', WEEKDAY)).toBe(false);
    expect(familyJoinsStandingRecord('book_state', 'not_quiet', AFTER_HOURS)).toBe(true);
    expect(familyJoinsStandingRecord('book_state', 'quiet', AFTER_HOURS)).toBe(true);
    expect(familyJoinsStandingRecord('book_state', 'closed', SATURDAY)).toBe(true);
    expect(familyJoinsStandingRecord('other', 'quiet', AFTER_HOURS)).toBe(false);
    expect(familyJoinsStandingRecord('other', 'closed', SATURDAY)).toBe(false);
    expect(familyJoinsStandingRecord('quiet_market', null, WEEKDAY)).toBe(false);
  });
  it('r5 BLOCKER-2: THIN pages for EVERY family - a book-state hold after hours on a near-silent feed is our feed impaired', () => {
    expect(familyJoinsStandingRecord('book_state', 'thin', AFTER_HOURS)).toBe(false);
    expect(familyJoinsStandingRecord('quiet_market', 'thin', AFTER_HOURS)).toBe(false);
  });
  it('r5 the minority veto: the streak joins only if EVERY family in it would; an empty set never joins', () => {
    expect(joinsStandingRecord(['quiet_market', 'book_state'], 'quiet', WEEKDAY)).toBe(false);    // book-state in liquid hours vetoes
    expect(joinsStandingRecord(['quiet_market', 'book_state'], 'quiet', AFTER_HOURS)).toBe(true);
    expect(joinsStandingRecord(['book_state', 'quiet_market'], 'not_quiet', AFTER_HOURS)).toBe(false); // the quiet arm vetoes
    expect(joinsStandingRecord(['quiet_market', 'other'], 'closed', SATURDAY)).toBe(false);
    expect(joinsStandingRecord([], 'quiet', AFTER_HOURS)).toBe(false);
    expect([...familiesOf({ equity_tick_stale_classwide: 30, book_state_unvalidated: 10, rest_failed: 0 })].sort()).toEqual(['book_state', 'quiet_market']);
  });
});

// The 46 price-skip rows minted 2026-10-06 after 19:30Z, with the trailing-60 s T at each row's created_at (measured on
// staging 2026-10-07; re-derived by Langston). One row is NOT quiet-family: HUT/USD 20:17:34Z is a book-state refusal.
// A book-state row MUST carry its own instant: that family's rule reads the US session at that instant, and ~9 of these
// rows fall in the 19:30-20:00Z regular window (Langston, 3a1 r5 record item 2). The type makes the instant mandatory.
type ReplayRow = [string, number, 'quiet'] | [string, number, 'book_state', string];
const REPLAY: ReplayRow[] = [
  ['NWL', 401, 'quiet'], ['HUT', 389, 'book_state', '2026-10-06T20:17:34Z'], ['NVT', 245, 'quiet'], ['CAG', 236, 'quiet'], ['ARKK', 195, 'quiet'],
  ['INVH', 248, 'quiet'], ['ALB', 184, 'quiet'], ['PDD', 279, 'quiet'], ['HUM', 197, 'quiet'], ['NET', 183, 'quiet'],
  ['ARKK', 180, 'quiet'], ['PDD', 172, 'quiet'], ['CAG', 172, 'quiet'], ['ALB', 183, 'quiet'], ['HUM', 218, 'quiet'],
  ['NWL', 169, 'quiet'], ['INVH', 157, 'quiet'], ['PDD', 146, 'quiet'], ['CAG', 159, 'quiet'], ['HUM', 148, 'quiet'],
  ['PDD', 151, 'quiet'], ['ARKK', 150, 'quiet'], ['ALB', 150, 'quiet'], ['CAG', 151, 'quiet'], ['HUM', 166, 'quiet'],
  ['PDD', 141, 'quiet'], ['NWL', 158, 'quiet'], ['ARKK', 148, 'quiet'], ['PDD', 144, 'quiet'], ['ALB', 138, 'quiet'],
  ['CAG', 138, 'quiet'], ['ARKK', 137, 'quiet'], ['NET', 140, 'quiet'], ['ARKK', 141, 'quiet'], ['ALB', 134, 'quiet'],
  ['PDD', 138, 'quiet'], ['HUM', 139, 'quiet'], ['OKTA', 147, 'quiet'], ['NWL', 141, 'quiet'], ['INVH', 136, 'quiet'],
  ['CAG', 136, 'quiet'], ['PDD', 137, 'quiet'], ['ALB', 133, 'quiet'], ['NET', 127, 'quiet'], ['HUM', 147, 'quiet'],
  ['OKTA', 125, 'quiet'],
];
// Every replay row is from 2026-10-06 after 19:30Z. The replay calls the PRODUCTION predicate for both families (r5, Langston
// r4 record item b). The quiet family never reads the session, so its rows need no instant; a book-state row is judged at
// its OWN instant (r5 record item 2) — HUT at 20:17:34Z = 16:17 ET, after hours.
const QUIET_ROWS_AT = Date.parse('2026-10-06T20:00:00Z'); // unused by the quiet family's rule; any instant in the window
const atOf = (r: ReplayRow) => (r[2] === 'book_state' ? Date.parse(r[3]) : QUIET_ROWS_AT);
const pages = (rows: ReplayRow[], rule: (t: number) => string) =>
  rows.filter((r) => !joinsStandingRecord([r[2] === 'quiet' ? 'quiet_market' : 'book_state'], rule(r[1]) as any, atOf(r)));
describe('PRE-REGISTERED replay (pre-audit A3, corrected by Langston C1 before any code)', () => {
  it('46 rows; quiet-family pages: 1 of the first-hour 14, 1 of 45; HUT (a book-state hold after hours) no longer pages (r4, Kyle 2026-10-09)', () => {
    expect(REPLAY).toHaveLength(46);
    const verdict = (t: number) => classVerdict(t, CFG, WEEKDAY);
    const quietFam = REPLAY.filter((r) => r[2] === 'quiet');
    expect(quietFam).toHaveLength(45);
    expect(pages(quietFam, verdict).map((r) => r[0])).toEqual(['NWL']);
    expect(pages(quietFam.slice(0, 14), verdict).map((r) => r[0])).toEqual(['NWL']);
    expect(pages(REPLAY, verdict).map((r) => r[0])).toEqual(['NWL']);
  });
  it('MUTATION: with the QUIET test inverted, the replay pages 44 of 46 (every quiet-family row but NWL; HUT joins after hours either way)', () => {
    const inverted = (t: number) => (classVerdict(t, CFG, WEEKDAY) === 'quiet' ? 'not_quiet' : 'quiet');
    expect(pages(REPLAY, inverted)).toHaveLength(44);
    expect(pages(REPLAY, inverted).some((r) => r[0] === 'NWL' && r[1] === 401)).toBe(false); // the T=401 NWL row is the one it drops
  });
});

// ── the engine's escalation paths ────────────────────────────────────────────────────────────────────────────────
type Rec = (this: unknown, p: { id: string; symbol: string; assetClass?: unknown }, reason: string, detail?: string) => Promise<void>;
const record = (ActiveExecutionEngine.prototype as unknown as { _recordPriceSkip: Rec })._recordPriceSkip;
const join = (ActiveExecutionEngine.prototype as any)._joinVenueQuietStanding;
function engine(constructedAgoMs = 10 * 60_000) {
  return {
    _priceSkipStreak: new Map(), _priceSkipReasons: new Map(), _priceSkipEscalated: new Set(),
    _venueQuiet: new VenueQuietState(), _engineConstructedAt: Date.now() - constructedAgoMs, mode: 'paper',
    _joinVenueQuietStanding: join,
  };
}
const XS = { id: 'pos-xs', symbol: 'CAG/USD', assetClass: 'xstock_spot' };
const keys = () => m.addAlert.mock.calls.map((c) => (c[0] as any).dedupe_key);
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(WEEKDAY);
  m.T = 200; m.threshold = 40;
  m.addAlert.mockImplementation(async (o: any) => ({ id: 'row-' + o.dedupe_key, metadata: o.metadata ?? {} }));
  m.mergeAlertMetadata.mockResolvedValue({});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('engine — escalation', () => {
  it('quiet-family on a QUIET class ⇒ no page, the position joins the standing record (metadata carries family, T, verdict)', async () => {
    const e = engine();
    for (let i = 0; i < 40; i++) await record.call(e, XS, 'equity_tick_stale_classwide');
    expect(keys()).toEqual([standingKey('paper')]);
    const merged = m.mergeAlertMetadata.mock.calls[0][1] as any;
    expect(merged.members['pos-xs']).toMatchObject({ symbol: 'CAG/USD', reasonFamily: 'quiet_market', T: 200, classVerdict: 'quiet' });
  });
  it('quiet-family on a NOT-quiet class ⇒ the per-symbol page, with the family in metadata', async () => {
    m.T = 400;
    const e = engine();
    for (let i = 0; i < 40; i++) await record.call(e, XS, 'equity_tick_stale_classwide');
    expect(keys()).toEqual(['price-skip-paper-CAG/USD']);
    expect(m.addAlert.mock.calls[0][0].metadata).toMatchObject({ reasonFamily: 'quiet_market', T: 400, classVerdict: 'not_quiet', positionId: 'pos-xs' });
  });
  it('THIN cohort ⇒ page (default-to-page)', async () => {
    m.T = 10;
    const e = engine();
    for (let i = 0; i < 40; i++) await record.call(e, XS, 'equity_tick_missing');
    expect(keys()).toEqual(['price-skip-paper-CAG/USD']);
    expect(m.addAlert.mock.calls[0][0].metadata.classVerdict).toBe('thin');
  });
  it('a book-state hold INSIDE the regular session pages (an implausible book in liquid hours - Kyle 2026-10-09)', async () => {
    const e = engine();
    for (let i = 0; i < 40; i++) await record.call(e, XS, 'book_state_unvalidated');
    expect(keys()).toEqual(['price-skip-paper-CAG/USD']);
    expect(m.addAlert.mock.calls[0][0].metadata.reasonFamily).toBe('book_state');
  });
  it('r4: a book-state hold AFTER HOURS joins the standing record, no page (an expected overnight hold)', async () => {
    vi.setSystemTime(AFTER_HOURS);
    const e = engine();
    for (let i = 0; i < 40; i++) await record.call(e, XS, 'book_state_yield_refused');
    expect(keys()).toEqual([standingKey('paper')]);
    expect((m.mergeAlertMetadata.mock.calls[0][1] as any).members['pos-xs']).toMatchObject({ reasonFamily: 'book_state' });
  });
  it('r5 the minority veto in the engine: a quiet-dominant streak carrying book-state refusals PAGES in the regular session', async () => {
    const e = engine();
    for (let i = 0; i < 30; i++) await record.call(e, XS, 'equity_tick_stale_classwide');
    for (let i = 0; i < 10; i++) await record.call(e, XS, 'book_state_unvalidated');
    expect(keys()).toEqual(['price-skip-paper-CAG/USD']);
    expect(m.addAlert.mock.calls[0][0].metadata).toMatchObject({ reasonFamily: 'quiet_market', reasonFamilies: ['quiet_market', 'book_state'] });
  });
  it('r5 the same mixed streak AFTER HOURS joins the record (each family would join on its own)', async () => {
    vi.setSystemTime(AFTER_HOURS);
    const e = engine();
    for (let i = 0; i < 30; i++) await record.call(e, XS, 'equity_tick_stale_classwide');
    for (let i = 0; i < 10; i++) await record.call(e, XS, 'book_state_unvalidated');
    expect(keys()).toEqual([standingKey('paper')]);
  });
  it('r5 BLOCKER-2 in the engine: a book-state hold after hours on a THIN feed pages', async () => {
    vi.setSystemTime(AFTER_HOURS);
    m.T = 10;
    const e = engine();
    for (let i = 0; i < 40; i++) await record.call(e, XS, 'book_state_unvalidated');
    expect(keys()).toEqual(['price-skip-paper-CAG/USD']);
    expect(m.addAlert.mock.calls[0][0].metadata).toMatchObject({ reasonFamily: 'book_state', classVerdict: 'thin' });
  });
  it('r4: our own MISSING book-state config still pages after hours (not a thin book - our configuration)', async () => {
    vi.setSystemTime(AFTER_HOURS);
    const e = engine();
    for (let i = 0; i < 40; i++) await record.call(e, XS, 'book_state_knob_missing');
    expect(keys()).toEqual(['price-skip-paper-CAG/USD']);
  });
  it('r4: on the weekend close a quiet-family streak joins the record whatever T reads - 468 (the restart replay) or 0', async () => {
    vi.setSystemTime(SATURDAY);
    for (const t of [468, 0]) {
      vi.clearAllMocks();
      m.addAlert.mockImplementation(async (o: any) => ({ id: 'row-' + o.dedupe_key, metadata: o.metadata ?? {} }));
      m.mergeAlertMetadata.mockResolvedValue({});
      m.T = t;
      const e = engine();
      for (let i = 0; i < 40; i++) await record.call(e, XS, 'equity_tick_stale_no_sigma');
      expect(keys()).toEqual([standingKey('paper')]);
      expect((m.mergeAlertMetadata.mock.calls[0][1] as any).members['pos-xs']).toMatchObject({ classVerdict: 'closed', T: t });
    }
  });
  it('FINDING-1: the threshold moves mid-streak to a value already passed ⇒ the streak still escalates, once', async () => {
    m.T = 400;
    const e = engine();
    for (let i = 0; i < 35; i++) await record.call(e, XS, 'equity_tick_stale_classwide');
    expect(m.addAlert).not.toHaveBeenCalled();
    m.threshold = 30;
    await record.call(e, XS, 'equity_tick_stale_classwide');
    await record.call(e, XS, 'equity_tick_stale_classwide');
    expect(keys()).toEqual(['price-skip-paper-CAG/USD']);
  });
  it('UNSEEDED knob ⇒ a per-class config alert and immediate escalation', async () => {
    m.T = 400;
    m.threshold = new Error("required row missing for exit_integrity.max_consecutive_price_skips. Seed via Drizzle migration");
    const e = engine();
    await record.call(e, XS, 'equity_tick_stale_classwide');
    expect(keys()).toEqual([configKey('paper', 'xstock_spot'), 'price-skip-paper-CAG/USD']);
  });
  it('NOT-WARM knob inside the boot grace ⇒ skip without escalating; past the grace ⇒ page', async () => {
    m.T = 400;
    m.threshold = new Error("module 'exit_integrity' is not warm");
    const fresh = engine(1_000);
    for (let i = 0; i < 50; i++) await record.call(fresh, XS, 'equity_tick_stale_classwide');
    expect(m.addAlert).not.toHaveBeenCalled();
    const old = engine(10 * 60_000);
    await record.call(old, XS, 'equity_tick_stale_classwide');
    expect(keys()).toEqual(['price-skip-paper-CAG/USD']);
  });
});

// ── the clearing sweep ───────────────────────────────────────────────────────────────────────────────────────────
const now = Date.parse('2026-10-07T14:00:00Z');
const row = (key: string, createdMs: number, metadata: Record<string, unknown> = {}) =>
  ({ id: 'id-' + key, dedupe_key: key, state: 'active', created_at: new Date(createdMs).toISOString(), metadata });
function deps(rows: any[], resolveImpl?: (k: string) => Promise<string[]>) {
  return {
    listAlerts: () => rows,
    resolveByKey: vi.fn(async (k: string) => (resolveImpl ? resolveImpl(k) : ['res-' + k])),
    addAlert: vi.fn(async (o: any) => ({ id: 'new-' + o.dedupe_key })),
  };
}
describe('sweep — resolve on a RE-MEASURED condition', () => {
  it('a price-skip row resolves once THIS engine priced the position after the row was minted, citing that position', async () => {
    const st = new VenueQuietState();
    const d = deps([row('price-skip-paper-CAG/USD', now - 60_000, { positionId: 'pos-xs' })]);
    await sweepVenueQuiet({ mode: 'paper', nowMs: now, openPositions: [{ id: 'pos-xs', symbol: 'CAG/USD' }], state: st, cfg: CFG, verdict: 'quiet', deps: d });
    expect(d.resolveByKey).not.toHaveBeenCalled(); // not yet priced
    st.notePriced('pos-xs', now - 1_000);
    await sweepVenueQuiet({ mode: 'paper', nowMs: now, openPositions: [{ id: 'pos-xs', symbol: 'CAG/USD' }], state: st, cfg: CFG, verdict: 'quiet', deps: d });
    expect(d.resolveByKey).toHaveBeenCalledWith('price-skip-paper-CAG/USD', 'active-exit-monitor', 'pos-xs', 'engine');
  });
  it('RESTART between mint and resume: a fresh engine state that prices the position resolves the row', async () => {
    const fresh = new VenueQuietState(); // the pre-restart streak is gone; nothing remembered
    fresh.notePriced('pos-xs', now);
    const d = deps([row('price-skip-paper-CAG/USD', now - 3_600_000, { positionId: 'pos-xs' })]);
    await sweepVenueQuiet({ mode: 'paper', nowMs: now + 1, openPositions: [{ id: 'pos-xs', symbol: 'CAG/USD' }], state: fresh, cfg: CFG, verdict: 'not_quiet', deps: d });
    expect(d.resolveByKey).toHaveBeenCalledTimes(1);
  });
  it('a closed position resolves its row citing the position it was minted for', async () => {
    const d = deps([row('price-skip-paper-PDD/USD', now - 60_000, { positionId: 'pos-pdd' })]);
    await sweepVenueQuiet({ mode: 'paper', nowMs: now, openPositions: [], state: new VenueQuietState(), cfg: CFG, verdict: 'quiet', deps: d });
    expect(d.resolveByKey).toHaveBeenCalledWith('price-skip-paper-PDD/USD', 'active-exit-monitor', 'pos-pdd', 'engine');
  });
  it('a throwing resolve is counted and retried, never thrown; stuck past the bound ⇒ one stuck row; it clears when nothing fails', async () => {
    const st = new VenueQuietState();
    let fail = true;
    const d = deps([row('price-skip-paper-NET/USD', now - 60_000, { positionId: 'p' })], async (k) => { if (fail) throw new Error('lock'); return ['ok-' + k]; });
    const r1 = await sweepVenueQuiet({ mode: 'paper', nowMs: now, openPositions: [], state: st, cfg: CFG, verdict: 'quiet', deps: d });
    expect(r1.failed).toBe(1);
    const r2 = await sweepVenueQuiet({ mode: 'paper', nowMs: now + CFG.resolveStuckAfterMs, openPositions: [], state: st, cfg: CFG, verdict: 'quiet', deps: d });
    expect(r2.failed).toBe(1);
    expect(d.addAlert).toHaveBeenCalledWith(expect.objectContaining({ dedupe_key: stuckKey('paper') }));
    fail = false;
    const d2 = deps([row('price-skip-paper-NET/USD', now - 60_000, { positionId: 'p' }), row(stuckKey('paper'), now)]);
    await sweepVenueQuiet({ mode: 'paper', nowMs: now + CFG.resolveStuckAfterMs + 1, openPositions: [], state: st, cfg: CFG, verdict: 'quiet', deps: d2 });
    expect(d2.resolveByKey).toHaveBeenCalledWith(stuckKey('paper'), 'active-exit-monitor', expect.any(String), 'engine');
  });
  it('the config row clears once the threshold reads, citing its seed', async () => {
    const st = new VenueQuietState();
    st.thresholdReadOk.add('xstock_spot');
    const d = deps([row(configKey('paper', 'xstock_spot'), now - 60_000)]);
    await sweepVenueQuiet({ mode: 'paper', nowMs: now, openPositions: [], state: st, cfg: CFG, verdict: 'quiet', deps: d });
    expect(d.resolveByKey).toHaveBeenCalledWith(configKey('paper', 'xstock_spot'), 'active-exit-monitor', THRESHOLD_SEED_REF, 'engine');
  });
  it('the selector is an exact shape: the stuck key and the standing key are never read as a price-skip symbol', () => {
    const p = priceSkipKeyPattern('paper');
    expect(p.test('price-skip-paper-CAG/USD')).toBe(true);
    expect(p.test(stuckKey('paper'))).toBe(false);
    expect(p.test('price-skip-paper-resolve-stuck-paper')).toBe(false);
    expect(p.test(configKey('paper', 'xstock_spot'))).toBe(false);
    expect(p.test('price-skip-live-CAG/USD')).toBe(false);
  });
  it('BLOCKER-1: every recognised quote is selected (EUR/GBP/CAD/CHF/AUD/USDT/USDC, not only USD), from the shared length bound', async () => {
    const p = priceSkipKeyPattern('paper');
    for (const k of ['price-skip-paper-ETH/EUR', 'price-skip-paper-GBP/USD', 'price-skip-paper-ADA/CAD', 'price-skip-paper-DOT/CHF',
      'price-skip-paper-XRP/AUD', 'price-skip-paper-SOL/USDT', 'price-skip-paper-BTC/USDC', 'price-skip-paper-BRK.B/USD']) expect(p.test(k)).toBe(true);
    const d = deps([row('price-skip-paper-ETH/EUR', now - 60_000, { positionId: 'pos-eur' })]);
    await sweepVenueQuiet({ mode: 'paper', nowMs: now, openPositions: [], state: new VenueQuietState(), cfg: CFG, verdict: 'not_quiet', deps: d });
    expect(d.resolveByKey).toHaveBeenCalledWith('price-skip-paper-ETH/EUR', 'active-exit-monitor', 'pos-eur', 'engine');
  });
  it('BLOCKER-1: a price-skip key the selector rejects is COUNTED and LOGGED, never silently left to freeze its symbol', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const d = deps([row('price-skip-paper-NOSLASH', now - 60_000)]);
    const r = await sweepVenueQuiet({ mode: 'paper', nowMs: now, openPositions: [], state: new VenueQuietState(), cfg: CFG, verdict: 'not_quiet', deps: d });
    expect(r.unmatched).toEqual(['price-skip-paper-NOSLASH']);
    expect(err.mock.calls.some((c) => String(c[0]).includes('[VENUE_QUIET][KEY_UNMATCHED] key=price-skip-paper-NOSLASH'))).toBe(true);
    expect(d.resolveByKey).not.toHaveBeenCalled();
  });
  it('r4: CLOSED neither resolves the standing record nor starts the duration clock - a weekend is not a not-quiet window', async () => {
    const st = new VenueQuietState();
    st.notePriced('pos-a', now - 1);
    const members = { 'pos-a': { symbol: 'CAG/USD', listedAtMs: now - 3_600_000 } };
    const d = deps([row(standingKey('paper'), now - 3_600_000, { members })]);
    await sweepVenueQuiet({ mode: 'paper', nowMs: now, openPositions: [{ id: 'pos-a', symbol: 'CAG/USD' }], state: st, cfg: CFG, verdict: 'closed', deps: d });
    expect(d.resolveByKey).not.toHaveBeenCalled();
    expect(st.notQuietSince).toBeNull();
    const st2 = new VenueQuietState();
    const d2 = deps([row(standingKey('paper'), now - 3_600_000, { members })]);
    for (const dt of [0, CFG.escalateAfterMs, 2 * CFG.escalateAfterMs]) {
      await sweepVenueQuiet({ mode: 'paper', nowMs: now + dt, openPositions: [{ id: 'pos-a', symbol: 'CAG/USD' }], state: st2, cfg: CFG, verdict: 'closed', deps: d2 });
    }
    expect(d2.addAlert).not.toHaveBeenCalled();
  });
  it('r6 (Langston 2026-10-11): the sweep names what HOLDS the standing record open, each member with its own family', async () => {
    const st = new VenueQuietState();
    const members = {
      'pos-a': { symbol: 'ORCL/USD', listedAtMs: now - 3_600_000, reasonFamily: 'book_state' },
      'pos-b': { symbol: 'CRCL/USD', listedAtMs: now - 3_600_000, reasonFamily: 'quiet_market' },
    };
    const open = [{ id: 'pos-a', symbol: 'ORCL/USD' }, { id: 'pos-b', symbol: 'CRCL/USD' }];
    const d = deps([row(standingKey('paper'), now - 3_600_000, { members })]);
    const r1 = await sweepVenueQuiet({ mode: 'paper', nowMs: now, openPositions: open, state: st, cfg: CFG, verdict: 'not_quiet', deps: d });
    expect(r1.held).toEqual([{ symbol: 'ORCL/USD', reasonFamily: 'book_state' }, { symbol: 'CRCL/USD', reasonFamily: 'quiet_market' }]);
    expect(d.resolveByKey).not.toHaveBeenCalledWith(standingKey('paper'), expect.anything(), expect.anything(), expect.anything());
    st.notePriced('pos-b', now);
    const r2 = await sweepVenueQuiet({ mode: 'paper', nowMs: now + 1, openPositions: open, state: st, cfg: CFG, verdict: 'not_quiet', deps: d });
    expect(r2.held).toEqual([{ symbol: 'ORCL/USD', reasonFamily: 'book_state' }]); // the book-state member is what blocks it
    st.notePriced('pos-a', now + 2);
    const r3 = await sweepVenueQuiet({ mode: 'paper', nowMs: now + 3, openPositions: open, state: st, cfg: CFG, verdict: 'not_quiet', deps: d });
    expect(r3.held).toEqual([]);
    expect(d.resolveByKey).toHaveBeenCalledWith(standingKey('paper'), 'active-exit-monitor', 'pos-a', 'engine');
  });
  it('r6: a sweep with no standing record reports nothing held', async () => {
    const r = await sweepVenueQuiet({ mode: 'paper', nowMs: now, openPositions: [], state: new VenueQuietState(), cfg: CFG, verdict: 'quiet', deps: deps([]) });
    expect(r.held).toEqual([]);
  });
  it('r5 BLOCKER-1: the duration page stamps the MEMBER\'s own family and words a book-state member as a refusal, not a missing mark', async () => {
    const st = new VenueQuietState();
    const members = { 'pos-b': { symbol: 'GLW/USD', listedAtMs: now - 3_600_000, reasonFamily: 'book_state' } };
    const d = deps([row(standingKey('paper'), now - 3_600_000, { members })]);
    await sweepVenueQuiet({ mode: 'paper', nowMs: now, openPositions: [{ id: 'pos-b', symbol: 'GLW/USD' }], state: st, cfg: CFG, verdict: 'not_quiet', deps: d });
    await sweepVenueQuiet({ mode: 'paper', nowMs: now + CFG.escalateAfterMs, openPositions: [{ id: 'pos-b', symbol: 'GLW/USD' }], state: st, cfg: CFG, verdict: 'not_quiet', deps: d });
    const call = d.addAlert.mock.calls.find((c) => (c[0] as any).dedupe_key === 'price-skip-paper-GLW/USD')![0] as any;
    expect(call.metadata.reasonFamily).toBe('book_state');
    expect(call.body).toMatch(/Our own book-state check has refused GLW\/USD's order book/);
    expect(call.body).not.toMatch(/no usable mark/);
  });
  it('BLOCKER-2: THIN never resolves the standing record — a dying feed is not the venue resuming — even with every member priced', async () => {
    const st = new VenueQuietState();
    st.notePriced('pos-a', now - 1);
    const members = { 'pos-a': { symbol: 'CAG/USD', listedAtMs: now - 600_000 } };
    const d = deps([row(standingKey('paper'), now - 600_000, { members })]);
    await sweepVenueQuiet({ mode: 'paper', nowMs: now, openPositions: [{ id: 'pos-a', symbol: 'CAG/USD' }], state: st, cfg: CFG, verdict: 'thin', deps: d });
    expect(d.resolveByKey).not.toHaveBeenCalled();
  });
  it('BLOCKER-2: duration escalation under THIN fires, with near-silent-feed wording, never "the cohort is ticking"', async () => {
    const st = new VenueQuietState();
    const members = { 'pos-a': { symbol: 'CAG/USD', listedAtMs: now - 3_600_000 } };
    const d = deps([row(standingKey('paper'), now - 3_600_000, { members })]);
    await sweepVenueQuiet({ mode: 'paper', nowMs: now, openPositions: [{ id: 'pos-a', symbol: 'CAG/USD' }], state: st, cfg: CFG, verdict: 'thin', deps: d });
    await sweepVenueQuiet({ mode: 'paper', nowMs: now + CFG.escalateAfterMs, openPositions: [{ id: 'pos-a', symbol: 'CAG/USD' }], state: st, cfg: CFG, verdict: 'thin', deps: d });
    const call = d.addAlert.mock.calls.find((c) => (c[0] as any).dedupe_key === 'price-skip-paper-CAG/USD')![0] as any;
    expect(call.metadata.classVerdict).toBe('thin');
    expect(call.body).toMatch(/fewer than 50 xStock symbols were updating/);
    expect(call.body).not.toMatch(/cohort was updating/);
  });
  it("r2 condition: the duration page states the SYMBOL's own unpriced time, not the class window, and dates the cohort reading", async () => {
    const st = new VenueQuietState();
    // listed ONE minute into a window that has run 90 minutes by the time the page fires
    const members = { 'pos-a': { symbol: 'CAG/USD', listedAtMs: now + 60_000 } };
    const d = deps([row(standingKey('paper'), now + 60_000, { members })]);
    const run = (t: number) => sweepVenueQuiet({ mode: 'paper', nowMs: t, openPositions: [{ id: 'pos-a', symbol: 'CAG/USD' }], state: st, cfg: CFG, verdict: 'not_quiet', deps: d });
    await run(now);
    await run(now + 90 * 60_000);
    const call = d.addAlert.mock.calls.find((c) => (c[0] as any).dedupe_key === 'price-skip-paper-CAG/USD')![0] as any;
    expect(call.body).toMatch(/for at least 89 min\./);
    expect(call.body).not.toMatch(/90 min/);
    expect(call.body).toContain(`At ${new Date(now + 90 * 60_000).toISOString().slice(11, 16)}Z`);
  });
  it("r2 condition: a last price seen in this process (before the listing) is the symbol's clock, not the listing time", async () => {
    const st = new VenueQuietState();
    st.notePriced('pos-a', now - 10 * 60_000);
    const members = { 'pos-a': { symbol: 'CAG/USD', listedAtMs: now - 5 * 60_000 } };
    const d = deps([row(standingKey('paper'), now - 5 * 60_000, { members })]);
    const run = (t: number) => sweepVenueQuiet({ mode: 'paper', nowMs: t, openPositions: [{ id: 'pos-a', symbol: 'CAG/USD' }], state: st, cfg: CFG, verdict: 'not_quiet', deps: d });
    await run(now);
    await run(now + CFG.escalateAfterMs);
    const call = d.addAlert.mock.calls.find((c) => (c[0] as any).dedupe_key === 'price-skip-paper-CAG/USD')![0] as any;
    expect(call.body).toMatch(/for at least 40 min\./); // 10 min before `now` + the 30-minute window
  });
  it('record item 3: a duration escalation is counted once per window, not re-pushed every minute', async () => {
    const st = new VenueQuietState();
    const members = { 'pos-a': { symbol: 'CAG/USD', listedAtMs: now - 3_600_000 } };
    const d = deps([row(standingKey('paper'), now - 3_600_000, { members })]);
    const run = (t: number) => sweepVenueQuiet({ mode: 'paper', nowMs: t, openPositions: [{ id: 'pos-a', symbol: 'CAG/USD' }], state: st, cfg: CFG, verdict: 'not_quiet', deps: d });
    await run(now);
    const r1 = await run(now + CFG.escalateAfterMs);
    const r2 = await run(now + CFG.escalateAfterMs + 60_000);
    expect(r1.escalated).toEqual(['CAG/USD']);
    expect(r2.escalated).toEqual([]);
  });
  it('the standing record resolves when the class is not quiet and every member has been priced or closed', async () => {
    const st = new VenueQuietState();
    const members = { 'pos-a': { symbol: 'CAG/USD', listedAtMs: now - 600_000 }, 'pos-b': { symbol: 'NET/USD', listedAtMs: now - 600_000 } };
    const d = deps([row(standingKey('paper'), now - 600_000, { members })]);
    await sweepVenueQuiet({ mode: 'paper', nowMs: now, openPositions: [{ id: 'pos-a', symbol: 'CAG/USD' }], state: st, cfg: CFG, verdict: 'not_quiet', deps: d });
    expect(d.resolveByKey).not.toHaveBeenCalled(); // pos-a still unpriced
    st.notePriced('pos-a', now - 1);
    await sweepVenueQuiet({ mode: 'paper', nowMs: now, openPositions: [{ id: 'pos-a', symbol: 'CAG/USD' }], state: st, cfg: CFG, verdict: 'not_quiet', deps: d });
    expect(d.resolveByKey).toHaveBeenCalledWith(standingKey('paper'), 'active-exit-monitor', 'pos-a', 'engine');
  });
  it('DURATION: a member still unpriced escalate_after_ms after the class stopped being quiet pages on its own key', async () => {
    const st = new VenueQuietState();
    const members = { 'pos-a': { symbol: 'CAG/USD', listedAtMs: now - 3_600_000 } };
    const d = deps([row(standingKey('paper'), now - 3_600_000, { members })]);
    await sweepVenueQuiet({ mode: 'paper', nowMs: now, openPositions: [{ id: 'pos-a', symbol: 'CAG/USD' }], state: st, cfg: CFG, verdict: 'not_quiet', deps: d });
    expect(d.addAlert).not.toHaveBeenCalled(); // the market only just resumed
    await sweepVenueQuiet({ mode: 'paper', nowMs: now + CFG.escalateAfterMs, openPositions: [{ id: 'pos-a', symbol: 'CAG/USD' }], state: st, cfg: CFG, verdict: 'not_quiet', deps: d });
    expect(d.addAlert).toHaveBeenCalledWith(expect.objectContaining({ dedupe_key: 'price-skip-paper-CAG/USD', category: 'breakage' }));
  });
});
