/**
 * B-UNIVERSE-REFRESH-ACTS P1 (#1018) — the crypto universe loader's per-fetch record and its
 * DB-only volume floor.
 *
 * Gate arm (a) needs to SEE every fetch: the 2026-10-30 run got an HTTP-200 Kraken error
 * envelope on every Ticker batch and threw nowhere. These cases pin that each failure shape
 * (error envelope, non-2xx, a throw, a silently empty batch) becomes a not-OK record, that the
 * loader itself never throws on a fetch failure, that zero Ticker batches reads INCOMPLETE,
 * and that the floor comes from module_constants with NO fallback.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mc = vi.hoisted(() => ({
  prefetchModule: vi.fn(async () => 1),
  getCachedNumberRequired: vi.fn((): number => 10000),
}));
vi.mock('../../services/module-constants-service.js', () => ({
  prefetchModule: mc.prefetchModule,
  getCachedNumberRequired: mc.getCachedNumberRequired,
  GLOBAL_KEY: { exchange: '*', assetClass: '*', strategy: '*', regime: '*' },
}));

import {
  loadCryptoSpotUniverse,
  isUniverseFetchComplete,
  type UniverseFetchRecord,
} from '../../services/passive-archive/universe-loader';

const PAIRS = {
  XXBTZUSD: { altname: 'XBTUSD', wsname: 'XBT/USD', base: 'XXBT', quote: 'ZUSD', status: 'online' },
  SOLUSD: { altname: 'SOLUSD', wsname: 'SOL/USD', base: 'SOL', quote: 'ZUSD', status: 'online' },
  TINYUSD: { altname: 'TINYUSD', wsname: 'TINY/USD', base: 'TINY', quote: 'ZUSD', status: 'online' },
};
const TICKERS = {
  XXBTZUSD: { c: ['33800', '0'], v: ['0', '50000'] },
  SOLUSD: { c: ['150', '0'], v: ['0', '1000'] },
  TINYUSD: { c: ['0.01', '0'], v: ['0', '100'] }, // $1 — below the floor
};

type Reply = { status?: number; ok?: boolean; body?: unknown; throws?: string };
function mockFetch(assetPairs: Reply, ticker: Reply) {
  return async (url: string | URL): Promise<Response> => {
    const r = url.toString().includes('AssetPairs') ? assetPairs : ticker;
    if (r.throws) throw new Error(r.throws);
    const status = r.status ?? 200;
    return { status, ok: r.ok ?? (status >= 200 && status < 300), json: async () => r.body } as Response;
  };
}
const good = (result: unknown): Reply => ({ body: { error: [], result } });

beforeEach(() => {
  mc.prefetchModule.mockClear();
  mc.getCachedNumberRequired.mockReset();
  mc.getCachedNumberRequired.mockReturnValue(10000);
});

describe('B-UNIVERSE-REFRESH-ACTS P1 — per-fetch records', () => {
  it('a clean run: AssetPairs first, then one Ticker batch, all OK, complete', async () => {
    const r = await loadCryptoSpotUniverse({ minVolumeFloorUsd: 10000, fetchImpl: mockFetch(good(PAIRS), good(TICKERS)) as any });
    expect(r.batches.map(b => b.kind)).toEqual(['asset_pairs', 'ticker']);
    expect(r.batches.every(b => b.ok)).toBe(true);
    expect(r.batches[1].rowsRequested).toBe(3);
    expect(r.batches[1].rowsReturned).toBe(3);
    expect(isUniverseFetchComplete(r.batches)).toBe(true);
    expect(r.symbols).toEqual(['BTC/USD', 'SOL/USD']);
  });

  it('volumeUsdBySymbol carries every candidate that had a ticker, including one below the floor', async () => {
    const r = await loadCryptoSpotUniverse({ minVolumeFloorUsd: 10000, fetchImpl: mockFetch(good(PAIRS), good(TICKERS)) as any });
    expect(r.volumeUsdBySymbol['BTC/USD']).toBeCloseTo(33800 * 50000);
    expect(r.volumeUsdBySymbol['SOL/USD']).toBeCloseTo(150 * 1000);
    expect(r.volumeUsdBySymbol['TINY/USD']).toBeCloseTo(1);
    expect(r.floorUsd).toBe(10000);
  });

  it('an HTTP-200 Kraken error envelope on the Ticker batch is a not-OK record (the 2026-10-30 shape)', async () => {
    const r = await loadCryptoSpotUniverse({
      minVolumeFloorUsd: 10000,
      fetchImpl: mockFetch(good(PAIRS), { body: { error: ['EGeneral:Too many requests'] } }) as any,
    });
    const t = r.batches.find(b => b.kind === 'ticker')!;
    expect(t.ok).toBe(false);
    expect(t.httpStatus).toBe(200);
    expect(t.krakenError).toContain('Too many requests');
    expect(isUniverseFetchComplete(r.batches)).toBe(false);
    expect(r.symbols).toEqual([]);
  });

  it('a non-2xx Ticker response is a not-OK record', async () => {
    const r = await loadCryptoSpotUniverse({
      minVolumeFloorUsd: 10000,
      fetchImpl: mockFetch(good(PAIRS), { status: 503, body: { error: [], result: TICKERS } }) as any,
    });
    const t = r.batches.find(b => b.kind === 'ticker')!;
    expect(t.ok).toBe(false);
    expect(t.httpStatus).toBe(503);
    expect(isUniverseFetchComplete(r.batches)).toBe(false);
  });

  it('a Ticker fetch that throws is caught into a not-OK record; the loader does not throw', async () => {
    const r = await loadCryptoSpotUniverse({
      minVolumeFloorUsd: 10000,
      fetchImpl: mockFetch(good(PAIRS), { throws: 'socket hang up' }) as any,
    });
    const t = r.batches.find(b => b.kind === 'ticker')!;
    expect(t.ok).toBe(false);
    expect(t.httpStatus).toBeNull();
    expect(t.krakenError).toContain('socket hang up');
    expect(t.rowsReturned).toBe(0);
    expect(isUniverseFetchComplete(r.batches)).toBe(false);
  });

  it('a silently empty Ticker batch (200, no error, no rows) is a not-OK record', async () => {
    const r = await loadCryptoSpotUniverse({ minVolumeFloorUsd: 10000, fetchImpl: mockFetch(good(PAIRS), good({})) as any });
    const t = r.batches.find(b => b.kind === 'ticker')!;
    expect(t.ok).toBe(false);
    expect(t.krakenError).toBeNull();
    expect(t.rowsReturned).toBe(0);
    expect(isUniverseFetchComplete(r.batches)).toBe(false);
  });

  it('an AssetPairs fetch that throws leaves zero Ticker batches and reads INCOMPLETE (Langston A1)', async () => {
    const r = await loadCryptoSpotUniverse({
      minVolumeFloorUsd: 10000,
      fetchImpl: mockFetch({ throws: 'ECONNRESET' }, good(TICKERS)) as any,
    });
    expect(r.batches.map(b => b.kind)).toEqual(['asset_pairs']);
    expect(r.batches[0].ok).toBe(false);
    expect(isUniverseFetchComplete(r.batches)).toBe(false);
    expect(r.symbols).toEqual([]);
  });

  it('isUniverseFetchComplete: an OK AssetPairs record with no Ticker batch is INCOMPLETE, not vacuously complete', () => {
    const ap: UniverseFetchRecord = { kind: 'asset_pairs', ok: true, httpStatus: 200, krakenError: null, rowsRequested: null, rowsReturned: 5 };
    expect(isUniverseFetchComplete([ap])).toBe(false);
    expect(isUniverseFetchComplete([])).toBe(false);
  });
});

describe('B-UNIVERSE-REFRESH-ACTS P1 — the floor is DB-governed with no fallback', () => {
  it('with no test override, the floor is read from module_constants after warming the module', async () => {
    mc.getCachedNumberRequired.mockReturnValue(25000);
    const r = await loadCryptoSpotUniverse({ fetchImpl: mockFetch(good(PAIRS), good(TICKERS)) as any });
    expect(mc.prefetchModule).toHaveBeenCalledWith('passive_archive');
    expect(mc.getCachedNumberRequired).toHaveBeenCalledWith(
      'passive_archive', 'b74_crypto_min_volume_24h_usd', expect.objectContaining({ assetClass: '*' }),
    );
    expect(r.floorUsd).toBe(25000);
  });

  it('an absent floor row throws — the loader never substitutes a default', async () => {
    mc.getCachedNumberRequired.mockImplementation(() => { throw new Error('module_constants passive_archive.b74_crypto_min_volume_24h_usd missing'); });
    await expect(loadCryptoSpotUniverse({ fetchImpl: mockFetch(good(PAIRS), good(TICKERS)) as any }))
      .rejects.toThrow(/b74_crypto_min_volume_24h_usd/);
  });
});
