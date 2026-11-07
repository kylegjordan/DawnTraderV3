/**
 * B-PRICE-FEED-COVERAGE (#1222) increment 0 — the xStock entry age reads the in-memory tick, not the DB snapshot.
 *
 * The archiver writes a `xstock_spot_ticker_snap` row for EVERY frame, including the venue's subscribe REPLAY of a book,
 * stamped at receipt — so `NOW() − captured_at` reads a replayed, hours-old book as ≈ 0 ms. Two readers are fixed here:
 *  - the dispatch freshness gate (`judgeDispatchTick`, `active-dispatch.ts`), a queue-admission gate;
 *  - the ENTRY depth snapshot (`applyXstockEntryTickAge`, `depth-source.ts`), which both capital-gating age checks read.
 * Langston's bound condition: test `observed === true` AND the age, or refuse.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('../../db.js', () => ({ db: { execute: async () => ({ rows: [] }) } }));

import { judgeDispatchTick } from '../../asset_classes/xstock_spot/active-dispatch.js';
import { applyXstockEntryTickAge, type DepthSnapshot } from '../../services/execution/depth-source.js';

const NOW = 1_800_000_000_000;
const tick = (ageMs: number, observed = true) => ({ price: 100, tsMs: NOW - ageMs, kind: 'mid' as const, observed });

describe('judgeDispatchTick — the dispatch gate (b) predicate', () => {
  it('no tick ⇒ absent (age null)', () => {
    expect(judgeDispatchTick(null, NOW, 15_000)).toEqual({ arm: 'absent', ageMs: null });
  });
  it('a tick that exists only by a venue replay (observed=false) ⇒ cold, even when its receipt age reads ~0', () => {
    expect(judgeDispatchTick(tick(5, false), NOW, 15_000)).toEqual({ arm: 'cold', ageMs: 5 });
  });
  it('an observed tick older than the limit ⇒ stale', () => {
    expect(judgeDispatchTick(tick(30_000), NOW, 15_000)).toEqual({ arm: 'stale', ageMs: 30_000 });
  });
  it('an observed tick exactly at the limit ⇒ ok (the limit is inclusive, as `ageMs > max` was)', () => {
    expect(judgeDispatchTick(tick(15_000), NOW, 15_000)).toEqual({ arm: 'ok', ageMs: 15_000 });
  });
  it('a negative age (clock went backwards) ⇒ stale, never admitted', () => {
    expect(judgeDispatchTick(tick(-50), NOW, 15_000).arm).toBe('stale');
  });
  it('an observed, fresh tick ⇒ ok', () => {
    expect(judgeDispatchTick(tick(1_000), NOW, 15_000)).toEqual({ arm: 'ok', ageMs: 1_000 });
  });
});

const snap = (ageMs: number, over: Partial<DepthSnapshot> = {}): DepthSnapshot => ({
  asks: [{ price: 100.1, qty: 10 }], bids: [{ price: 99.9, qty: 10 }],
  ageMs, ageReadStartedMonoMs: 0, ageReadValid: true, source: 'xstock_ticker_snap',
  verdict: { bid: 'ok', ask: 'ok', crossed: false }, ...over,
});

describe('applyXstockEntryTickAge — the ENTRY depth snapshot carries one honest age', () => {
  it('no tick ⇒ refused cold_tick (its own reason, never stale_book)', () => {
    expect(applyXstockEntryTickAge(snap(0), null, NOW)).toEqual({ ok: false, reason: 'cold_tick absent' });
  });
  it('THE DEFECT CASE: a replay row reads 0 ms, the tick is unobserved ⇒ refused cold_tick', () => {
    expect(applyXstockEntryTickAge(snap(0), tick(3, false), NOW)).toEqual({ ok: false, reason: 'cold_tick observed=false' });
  });
  it('a replay row reads 0 ms on a book last CHANGED 15.68 h ago ⇒ the carried age becomes the tick age', () => {
    const old = 15.68 * 3_600_000;
    const r = applyXstockEntryTickAge(snap(0), tick(old), NOW);
    expect(r).toMatchObject({ ok: true });
    expect((r as any).snapshot.ageMs).toBe(old);
  });
  it('a DB row older than the tick ⇒ the snapshot is returned unchanged (never looser than today)', () => {
    const s = snap(9_000);
    const r = applyXstockEntryTickAge(s, tick(2_000), NOW);
    expect(r).toEqual({ ok: true, snapshot: s });
  });
  it('ageReadValid is untouched — an unreadable DB age still fails closed at the consumption check', () => {
    const r = applyXstockEntryTickAge(snap(0, { ageReadValid: false }), tick(500), NOW);
    expect((r as any).snapshot.ageReadValid).toBe(false);
  });
  it('a tick with an invalid age ⇒ refused', () => {
    expect(applyXstockEntryTickAge(snap(0), tick(-1), NOW)).toEqual({ ok: false, reason: 'cold_tick tick_age_invalid' });
  });
});

describe('the NO-CLOCK fence reaches the helper the gate now depends on (Kyle 2026-09-03: one standard at every hour)', () => {
  // Same tokens as b-xstock-feed-sanity-fence.test.ts, comment-stripped the same way, minus `Date.now` — which is allowed
  // EXACTLY ONCE, as the default for the age arithmetic's clock (`nowMs: number = Date.now()`), never as a cutoff or hour.
  const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const ds = code(readFileSync(join(__dirname, '../../services/execution/depth-source.ts'), 'utf8'));
  const start = ds.indexOf('export function applyXstockEntryTickAge(');
  const helper = ds.slice(start, ds.indexOf('\n}', start) + 2);
  const NON_NOW_CLOCK = /market-?hours|isMarketOpen|isXstockMarketOpen|liquidFillWindow|get(UTC)?Hours|getUTC(Date|Day)|toLocale|timeZone|\bRTH\b|\bsession\b|premarket|after_?hours|overnight/i;
  it('CONTROL: the helper body was located', () => { expect(helper.length).toBeGreaterThan(200); expect(start).toBeGreaterThan(0); });
  it('no hour, calendar or session term in the helper', () => { expect(helper).not.toMatch(NON_NOW_CLOCK); });
  it('Date.now appears once, only as the clock default', () => {
    expect(helper.split('Date.now').length - 1).toBe(1);
    expect(helper).toMatch(/nowMs: number = Date\.now\(\)/);
  });
});

describe('the engine seam — wired once, xStock only, before warmth, with no counter inside the gate', () => {
  const src = readFileSync(join(__dirname, '../../services/active-execution-engine.ts'), 'utf8');
  const a = src.indexOf('private async _evaluateOpenDepthGate(');
  const body = src.slice(a, src.indexOf("return { pass: true, reason: 'ok', snapshot, warmthMaxAgeMs: config.warmthMaxAgeMs };", a));
  it('CONTROL: the gate body was located', () => { expect(body.length).toBeGreaterThan(500); });
  it('applies the tick age for xstock_spot only, before the first assessWarmth', () => {
    const apply = body.indexOf('applyXstockEntryTickAge(snapshot, getLatestEquityTick(symbol))');
    expect(apply).toBeGreaterThan(0);
    expect(body.lastIndexOf("if (assetClass === 'xstock_spot' && snapshot)", apply)).toBeGreaterThan(0);
    expect(apply).toBeLessThan(body.indexOf("assessWarmth(snapshot, 'asks'"));
  });
  it('the gate itself never calls recordDepthGateBlock (the open-path caller is the only writer)', () => {
    expect(body).not.toMatch(/recordDepthGateBlock\(/);
  });
  it('the REFUSAL arm returns a non-passing gate on the helper\'s reason (a dead `if (!ok) {}` must fail here — M5)', () => {
    expect(body).toMatch(/if \(!_tickAge\.ok\) return \{ pass: false, reason: _tickAge\.reason, snapshot: null, warmthMaxAgeMs: null \};/);
  });
  it('exactly one call site of applyXstockEntryTickAge in the engine', () => {
    expect(src.split('applyXstockEntryTickAge(').length - 1).toBe(1);
  });
});
