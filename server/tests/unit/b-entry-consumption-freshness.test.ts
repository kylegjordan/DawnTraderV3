/**
 * B-ENTRY-CONSUMPTION-FRESHNESS — the same captured book must still be fresh at
 * the immediate order-consumption boundary. Functional acceptance is deterministic;
 * the bounded Step-7 population is wiring evidence, never a calendar hold.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const h = vi.hoisted(() => ({
  book: null as null | { asks: Array<{ price: number; qty: number }>; bids: Array<{ price: number; qty: number }>; ageMs: number },
  dbExecute: vi.fn(),
  sourceOrder: [] as string[],
}));

vi.mock('../../db.js', () => ({
  db: { execute: (q: unknown) => { h.sourceOrder.push('db_read'); return h.dbExecute(q); } },
}));
vi.mock('../../exchanges/kraken/kraken-websocket-adapter.js', () => ({
  krakenWebSocketAdapter: {
    getBookForFill: () => { h.sourceOrder.push('crypto_read'); return h.book; },
  },
}));

import {
  assessConsumptionFreshness,
  getDepthSnapshot,
  type DepthSnapshot,
} from '../../services/execution/depth-source.js';
import { rtbMetricsService } from '../../services/rtb-metrics-service.js';

const snap = (over: Partial<DepthSnapshot> = {}): DepthSnapshot => ({
  asks: [{ price: 100, qty: 5 }],
  bids: [{ price: 99, qty: 5 }],
  ageMs: 1_000,
  ageReadStartedMonoMs: 10_000,
  ageReadValid: true,
  source: 'crypto_ws_book',
  ...over,
});

beforeEach(() => {
  h.book = null;
  h.dbExecute.mockReset();
  h.sourceOrder.length = 0;
});
afterEach(() => vi.restoreAllMocks());

describe('the pure consumption-age decision', () => {
  it('adds monotonic elapsed time, passes the exact limit, and refuses limit + 1 ms', () => {
    const atLimit = assessConsumptionFreshness(snap({ ageMs: 4_000 }), 5_000, 11_000);
    expect(atLimit).toEqual({ fresh: true, kind: 'fresh', reason: 'fresh', ageMs: 5_000, elapsedMs: 1_000 });

    const over = assessConsumptionFreshness(snap({ ageMs: 4_001 }), 5_000, 11_000);
    expect(over).toMatchObject({ fresh: false, kind: 'stale_at_consumption', ageMs: 5_001, elapsedMs: 1_000 });
  });

  it('is independent of wall-clock rollback after the source-age sample', () => {
    const dateNow = vi.spyOn(Date, 'now');
    dateNow.mockReturnValueOnce(2_000_000).mockReturnValueOnce(1_000_000);
    const firstWall = Date.now();
    const result = assessConsumptionFreshness(snap({ ageMs: 2_000 }), 5_000, 11_500);
    const secondWall = Date.now();
    expect(secondWall).toBeLessThan(firstWall); // positive control: the wall clock moved backward
    expect(result).toMatchObject({ fresh: true, ageMs: 3_500, elapsedMs: 1_500 });
  });

  it.each([
    ['source validity', snap({ ageReadValid: false }), 5_000, 10_001],
    ['negative base age', snap({ ageMs: -1 }), 5_000, 10_001],
    ['non-finite base age', snap({ ageMs: Number.NaN }), 5_000, 10_001],
    ['negative anchor', snap({ ageReadStartedMonoMs: -1 }), 5_000, 10_001],
    ['non-finite anchor', snap({ ageReadStartedMonoMs: Number.NaN }), 5_000, 10_001],
    ['backward monotonic clock', snap(), 5_000, 9_999],
    ['negative limit', snap(), -1, 10_001],
    ['non-finite limit', snap(), Number.NaN, 10_001],
    ['non-finite current clock', snap(), 5_000, Number.POSITIVE_INFINITY],
    ['overflowed sum', snap({ ageMs: Number.MAX_VALUE, ageReadStartedMonoMs: 0 }), Number.MAX_VALUE, Number.MAX_VALUE],
  ])('fails closed on %s', (_name, snapshot, limit, now) => {
    expect(assessConsumptionFreshness(snapshot, limit, now)).toMatchObject({
      fresh: false,
      kind: 'consumption_clock_invalid',
      ageMs: null,
    });
  });

  it('keeps a side-effecting fake placer uncalled after xStock and crypto delay mutations', () => {
    const placer = vi.fn(() => 'placed');
    const attempt = (snapshot: DepthSnapshot, limit: number, now: number) => {
      const decision = assessConsumptionFreshness(snapshot, limit, now);
      return decision.fresh ? placer() : decision;
    };

    expect(attempt(snap({ source: 'xstock_ticker_snap', ageMs: 13_001 }), 15_000, 12_000)).toMatchObject({
      fresh: false, kind: 'stale_at_consumption', ageMs: 15_001,
    }); // 2-second xStock liveness delay
    expect(attempt(snap({ ageMs: 1_001 }), 5_000, 14_000)).toMatchObject({
      fresh: false, kind: 'stale_at_consumption', ageMs: 5_001,
    }); // 4-second crypto venue-validation delay
    expect(placer).not.toHaveBeenCalled();

    expect(attempt(snap({ ageMs: 999 }), 5_000, 14_000)).toBe('placed');
    expect(placer).toHaveBeenCalledTimes(1); // positive control: the fake can be called
  });
});

describe('the pre-source-read anchor', () => {
  const row = (ageMs: string, bid = '100', bidQty: string | null = '5') => ({
    rows: [{ bid, bid_qty: bidQty, ask: '100.2', ask_qty: '7', age_ms: ageMs }],
  });

  it('is captured once before the crypto read', async () => {
    h.book = { asks: [{ price: 100, qty: 5 }], bids: [{ price: 99, qty: 5 }], ageMs: 750 };
    const mono = vi.spyOn(performance, 'now').mockImplementationOnce(() => {
      h.sourceOrder.push('anchor');
      return 123.5;
    });
    const result = await getDepthSnapshot('BTC/USD', 'crypto_spot');
    expect(result).toMatchObject({ ageMs: 750, ageReadStartedMonoMs: 123.5, ageReadValid: true });
    expect(mono).toHaveBeenCalledTimes(1);
    expect(h.sourceOrder).toEqual(['anchor', 'crypto_read']);
  });

  it('conservatively includes the xStock query/return prefix in elapsed age', async () => {
    h.dbExecute.mockResolvedValueOnce(row('1000'));
    vi.spyOn(performance, 'now').mockImplementationOnce(() => {
      h.sourceOrder.push('anchor');
      return 200;
    });
    const result = await getDepthSnapshot('ABC/USD', 'xstock_spot');
    expect(result).not.toBeNull();
    expect(result!.ageReadStartedMonoMs).toBe(200);
    expect(h.sourceOrder).toEqual(['anchor', 'db_read']);
    expect(assessConsumptionFreshness(result!, 5_000, 2_200)).toMatchObject({
      fresh: true, ageMs: 3_000, elapsedMs: 2_000,
    });
  });

  it('uses the original pre-read anchor for the last-two-sided fallback too', async () => {
    h.dbExecute.mockResolvedValueOnce(row('50', '100', null));
    h.dbExecute.mockResolvedValueOnce(row('120', '99.9', '4'));
    const mono = vi.spyOn(performance, 'now').mockImplementationOnce(() => {
      h.sourceOrder.push('anchor');
      return 333;
    });
    const result = await getDepthSnapshot('ABC/USD', 'xstock_spot', { allowLastTwoSided: true });
    expect(result).toMatchObject({ fromLastTwoSided: true, ageMs: 120, ageReadStartedMonoMs: 333, ageReadValid: true });
    expect(mono).toHaveBeenCalledTimes(1);
    expect(h.sourceOrder).toEqual(['anchor', 'db_read', 'db_read']);
  });

  it.each(['-1', 'not-a-number'])('retains compatibility age 0 but marks invalid source age %s for final refusal', async (age) => {
    h.dbExecute.mockResolvedValueOnce(row(age));
    const result = await getDepthSnapshot('ABC/USD', 'xstock_spot');
    expect(result).toMatchObject({ ageMs: 0, ageReadValid: false });
    expect(assessConsumptionFreshness(result!, 15_000, result!.ageReadStartedMonoMs)).toMatchObject({
      fresh: false, kind: 'consumption_clock_invalid',
    });
  });
});

describe('the production seam and durable contract', () => {
  const engine = readFileSync(new URL('../../services/active-execution-engine.ts', import.meta.url), 'utf8');
  const schema = readFileSync(new URL('../../../shared/schema.ts', import.meta.url), 'utf8');
  const migration = readFileSync(new URL('../../../drizzle/migrations/2026-10-15-b-entry-consumption-freshness.sql', import.meta.url), 'utf8');
  const manifest = readFileSync(new URL('../../../drizzle/migrations/MANIFEST.txt', import.meta.url), 'utf8');
  const exportSql = readFileSync(new URL('../../../scripts/codex-export/export-data.sql', import.meta.url), 'utf8');

  it('one final guard dominates the sole openOrder call with no await or config reread between them', () => {
    expect(engine.match(/this\.orderPlacer\.openOrder\(/g)).toHaveLength(1); // positive control: sole production side effect exists
    const guard = engine.indexOf('const _consumption = assessConsumptionFreshness(_gate.snapshot, _gate.warmthMaxAgeMs);');
    const block = engine.indexOf("return { opened: false, stage: 'CONSUMPTION_FRESHNESS'", guard);
    const order = engine.indexOf('const _openFill = await this.orderPlacer.openOrder({', guard);
    expect(guard).toBeGreaterThan(-1);
    expect(block).toBeGreaterThan(guard);
    expect(order).toBeGreaterThan(block);
    expect(engine.slice(guard, order)).not.toMatch(/\bawait\b/);
    expect(engine.slice(guard, order)).not.toContain('resolveFillDepthGateConfig');
    expect(engine).toContain("return { pass: true, reason: 'ok', snapshot, warmthMaxAgeMs: config.warmthMaxAgeMs };");
  });

  it('covers direct taker and maker-to-taker, while pending maker stays outside consumption', () => {
    const pending = engine.indexOf('if (_b72cPendingMaker) {');
    const immediate = engine.indexOf('const _consumptionArm =', pending);
    expect(pending).toBeGreaterThan(-1);
    expect(immediate).toBeGreaterThan(pending);
    expect(engine.slice(pending, immediate)).toContain('} else {');
    expect(engine).toContain("const _consumptionArm = _b72ChosenMode === 'maker' ? 'maker_to_taker' : 'direct_taker';");
    expect(engine).toContain('[CONSUMPTION_PASS]');
    expect(engine).toContain('[CONSUMPTION_BLOCK]');
  });

  it('has a distinct zero-initialized open-failure stage', () => {
    rtbMetricsService.reset();
    expect(rtbMetricsService.getStats().openFailedByStage.CONSUMPTION_FRESHNESS).toBe(0);
    rtbMetricsService.recordOpenFailed('ABC/USD', 'test', 'CONSUMPTION_FRESHNESS', 'stale_at_consumption');
    expect(rtbMetricsService.getStats().openFailedByStage.CONSUMPTION_FRESHNESS).toBe(1);
  });

  it('persists a separate nullable age with no default/backfill and exports it', () => {
    expect(engine).toContain('entryBookAgeMs: _gate.snapshot.ageMs,');
    expect(engine).toContain('entryBookConsumptionAgeMs: _entryBookConsumptionAgeMs,');
    expect(schema).toContain('entryBookConsumptionAgeMs: doublePrecision("entry_book_consumption_age_ms"),');
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS entry_book_consumption_age_ms DOUBLE PRECISION;/);
    expect(migration).not.toMatch(/entry_book_consumption_age_ms DOUBLE PRECISION\s+DEFAULT|\bUPDATE\s+closed_trades\b/i);
    expect(manifest.trimEnd().endsWith('2026-10-15-b-entry-consumption-freshness.sql')).toBe(true);
    expect(exportSql).toContain('entry_book_age_ms, entry_book_consumption_age_ms, exit_price_producer');
  });
});
