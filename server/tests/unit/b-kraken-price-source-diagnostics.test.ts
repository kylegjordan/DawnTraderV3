import { afterEach, describe, expect, it, vi } from 'vitest';
import { priceCache } from '../../services/price-cache.js';

const symbol = 'BTC/USD';
const alias = 'btc/usd';
const pair = { internalSymbol: symbol, krakenRestPair: 'XBTUSD' };
const ticker = { a: ['102', '1', '2'], b: ['98', '1', '3'], c: ['100'] };
const fakeVenue = { resolveByKrakenKey: (key: string) => key === 'XXBTZUSD' ? pair : undefined };
const cache = priceCache as unknown as {
  venue: unknown;
  restReceiptOrdering: Map<unknown, unknown>;
  fileRestResponse: (
    data: Record<string, typeof ticker>, requested: ReadonlyMap<string, string>,
    writer: 'rest_poller' | 'rest_batch', now: number, writes: unknown[],
  ) => number;
};
const originalVenue = cache.venue;

function seedWs(key: string, localStamp: number, writer: 'ws_ticker' | 'ws_book' = 'ws_ticker') {
  priceCache.updateFromWebSocket(key, 100, 99, 101, localStamp, 4000, 'mid', null, writer, null);
}

function writeRest(key: string, localStamp: number) {
  priceCache.updateFromRest(key, 100, 'mid', null, {
    bid: 98, ask: 102, capturedAtMs: localStamp, writer: 'rest_adapter', sizes: null,
  });
}

afterEach(() => {
  cache.venue = originalVenue;
  priceCache.clear();
  cache.restReceiptOrdering.clear();
  vi.restoreAllMocks();
});

describe('Kraken REST replacement receipt order (#1146)', () => {
  it.each([4999, 5000, 5001])('compares %i against the incumbent local stamp in both REST setters', (stamp) => {
    vi.spyOn(Date, 'now').mockReturnValue(stamp);
    cache.venue = fakeVenue;
    seedWs(symbol, 5000);
    writeRest(symbol, stamp);
    expect(priceCache.get(symbol)).toMatchObject({
      bid: 98, ask: 102, sidesCapturedAtMs: stamp, venueObservedAtMs: null, sidesWriter: 'rest_adapter',
    });
    seedWs(symbol, 5000, 'ws_book');
    expect(cache.fileRestResponse({ XXBTZUSD: ticker }, new Map(), 'rest_poller', stamp, [])).toBe(0);
    expect(priceCache.get(symbol)).toMatchObject({
      bid: 98, ask: 102, sidesCapturedAtMs: stamp, venueObservedAtMs: null, sidesWriter: 'rest_poller',
      sideSizes: { bidQty: 3, askQty: 2, basis: 'rest_rounded_up' },
    });
    const counts = { eligibleOverwrites: 1, strictInversions: stamp === 4999 ? 1 : 0 };
    expect(priceCache.getRestReceiptOrdering()).toEqual({ rest_adapter: counts, rest_poller: counts });
  });

  it('counts only a named, locally timed replacement of WS sides on the actual cache key', () => {
    vi.spyOn(Date, 'now').mockReturnValue(4999);
    cache.venue = fakeVenue;
    writeRest(symbol, 5001);
    seedWs(alias, 5000);
    priceCache.updateFromRest(alias, 100, 'last', 100, null);
    expect(priceCache.get(alias)?.sidesWriter).toBe('ws_ticker');
    expect(priceCache.getRestReceiptOrdering()).toEqual({});

    const written: unknown[] = [];
    cache.fileRestResponse({ XXBTZUSD: ticker }, new Map([['XBTUSD', alias]]), 'rest_batch', 4999, written);
    expect(written).toEqual([{ responseKey: 'XXBTZUSD', writtenKeys: [symbol, alias] }]);
    expect(priceCache.getRestReceiptOrdering()).toEqual({ rest_batch: { eligibleOverwrites: 1, strictInversions: 1 } });

    seedWs(symbol, Number.NaN);
    writeRest(symbol, 4999);
    seedWs(alias, 5000);
    writeRest(alias, Number.POSITIVE_INFINITY);
    expect(priceCache.getRestReceiptOrdering()).toEqual({ rest_batch: { eligibleOverwrites: 1, strictInversions: 1 } });
  });
});
