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
  countEquitySymbolsFramedSince: () => m.T,
}));

import { ActiveExecutionEngine } from '../../services/active-execution-engine.js';
import {
  VenueQuietState, classVerdict, isQuietMarketReason, priceSkipKeyPattern, standingKey, stuckKey, configKey,
  sweepVenueQuiet, THRESHOLD_SEED_REF,
} from '../../services/venue-quiet-alerting.js';

const CFG = { quietTickingMin: 346, thinTickingMin: 50, escalateAfterMs: 1_800_000, resolveStuckAfterMs: 3_600_000 };

describe('the rule', () => {
  it('quiet-market family is exactly the stale-mark and missing-tick reasons', () => {
    for (const r of ['equity_tick_missing', 'equity_tick_stale_self', 'equity_tick_stale_classwide', 'equity_tick_stale_floor_bound_near_stop']) expect(isQuietMarketReason(r)).toBe(true);
    for (const r of ['book_state_unvalidated', 'book_state_yield_refused', 'equity_age_knob_missing', 'rest_failed', 'rest_no_data']) expect(isQuietMarketReason(r)).toBe(false);
  });
  it('CONSTRUCTED STALL (no historical stall exists): T=0 and T=49 are thin ⇒ page; 50..345 quiet; 346+ not quiet ⇒ page', () => {
    expect(classVerdict(0, CFG)).toBe('thin');
    expect(classVerdict(49, CFG)).toBe('thin');
    expect(classVerdict(50, CFG)).toBe('quiet');
    expect(classVerdict(345, CFG)).toBe('quiet');
    expect(classVerdict(346, CFG)).toBe('not_quiet');
  });
});

// The 46 price-skip rows minted 2026-10-06 after 19:30Z, with the trailing-60 s T at each row's created_at (measured on
// staging 2026-10-07; re-derived by Langston). One row is NOT quiet-family: HUT/USD 20:17:34Z is a book-state refusal.
const REPLAY: Array<[string, number, 'quiet' | 'book_state']> = [
  ['NWL', 401, 'quiet'], ['HUT', 389, 'book_state'], ['NVT', 245, 'quiet'], ['CAG', 236, 'quiet'], ['ARKK', 195, 'quiet'],
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
const pages = (rows: typeof REPLAY, rule: (t: number) => string) =>
  rows.filter(([, t, fam]) => fam !== 'quiet' || rule(t) !== 'quiet');
describe('PRE-REGISTERED replay (pre-audit A3, corrected by Langston C1 before any code)', () => {
  it('46 rows; quiet-family pages: 1 of the first-hour 14, 1 of 45; HUT (book-state) pages by design', () => {
    expect(REPLAY).toHaveLength(46);
    const verdict = (t: number) => classVerdict(t, CFG);
    const quietFam = REPLAY.filter((r) => r[2] === 'quiet');
    expect(quietFam).toHaveLength(45);
    expect(pages(quietFam, verdict).map((r) => r[0])).toEqual(['NWL']);
    expect(pages(quietFam.slice(0, 14), verdict).map((r) => r[0])).toEqual(['NWL']);
    expect(pages(REPLAY, verdict).map((r) => r[0])).toEqual(['NWL', 'HUT']);
  });
  it('MUTATION: with the QUIET test inverted, the replay pages 45 of 46 (44 quiet-family + HUT, which pages regardless)', () => {
    const inverted = (t: number) => (classVerdict(t, CFG) === 'quiet' ? 'not_quiet' : 'quiet');
    expect(pages(REPLAY, inverted)).toHaveLength(45);
    expect(pages(REPLAY, inverted)[0]).toEqual(['HUT', 389, 'book_state']); // the T=401 NWL row is the one it drops
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
  it('a NON-quiet-family reason on a QUIET class still pages', async () => {
    const e = engine();
    for (let i = 0; i < 40; i++) await record.call(e, XS, 'book_state_unvalidated');
    expect(keys()).toEqual(['price-skip-paper-CAG/USD']);
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
