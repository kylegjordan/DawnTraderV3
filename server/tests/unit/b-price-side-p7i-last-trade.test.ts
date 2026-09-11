// B-PRICE-SIDE-BY-JOB r5 — P-7i (decision D7; #952; pre-audit A-9.1 rows 1 and 4): the venue's TRUE LAST TRADE is stored
// separately from the midpoint.
//
// FIXTURE: two ticker frames CAPTURED LIVE from Kraken's public v2 feed at 2026-09-11T17:03:37Z (channel `ticker`, type
// `snapshot`), copied unedited. ETH/USD is the discriminating one: its last trade (2576.65) differs from its midpoint
// (2576.63), so a field that silently carried the midpoint fails.
//
// POSITIVE CONTROL: against the translator, the tick event and the adapter before P-7i there is no `lastTrade` or
// `lastTradePrice` at all, so every test below fails.
// STEP 4 r2 (Langston chunk-3 C1, C2): tests 9-11 fail against r1 (`c501bded3`) — an `undefined` print was stamped with a
// receipt time, and the entry seed erased the pair; test 12 guards the empty-row case and passes on r1 by design.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { translateV2ToV1 } from '../../services/market-data/kraken-v2-translator.js';
import { livePricingAdapter } from '../../services/live-pricing-adapter.js';
import { restRateLimiter } from '../../services/market-data/rest-rate-limiter.js';

const ETH_FRAME = {
  channel: 'ticker',
  type: 'snapshot',
  data: [
    {
      symbol: 'ETH/USD', bid: 2576.6, bid_qty: 0.57925283, ask: 2576.66, ask_qty: 1.94049661, last: 2576.65,
      volume: 54938.92865435, vwap: 2538.08, low: 2432.05, high: 2664.81, change: 129.91, change_pct: 5.31,
      trades: 65796, timestamp: '2026-09-11T17:03:38.364335Z',
    },
  ],
};
const BTC_FRAME = {
  channel: 'ticker',
  type: 'snapshot',
  data: [
    {
      symbol: 'BTC/USD', bid: 77825.8, bid_qty: 0.01147814, ask: 77825.9, ask_qty: 0.4178547, last: 77825.9,
      volume: 3316.23480967, vwap: 77641, low: 76000, high: 79832.3, change: 725.9, change_pct: 0.94,
      trades: 117396, timestamp: '2026-09-11T17:03:38.664607Z',
    },
  ],
};

const SYM = 'ZZP7I/USD';
const adapter = livePricingAdapter as unknown as {
  priceCache: Map<string, any>;
  updateCache: (...a: any[]) => void;
  getPriceWithFallback: (s: string, ms?: number) => Promise<any>;
  fetchFromKrakenRest: (s: string) => Promise<any>;
};

afterEach(() => {
  adapter.priceCache.delete(SYM);
  restRateLimiter.clearSymbolCooldown(SYM);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('P-7i — the translator keeps the print apart from the mark (captured frames)', () => {
  it('1. ETH/USD: `lastTrade` is the frame\'s own `last`, while `c` carries the midpoint', () => {
    const f = ETH_FRAME.data[0];
    const v1 = translateV2ToV1(f);
    expect(v1.markKind).toBe('mid');
    expect(Number(v1.c[0])).toBeCloseTo((f.bid + f.ask) / 2, 9);
    expect(v1.lastTrade).toBe(f.last);
    expect(v1.lastTrade).not.toBeCloseTo(Number(v1.c[0]), 3); // the two jobs really are different numbers here
  });

  it('2. BTC/USD: `lastTrade` equals the venue `last` verbatim', () => {
    const f = BTC_FRAME.data[0];
    expect(translateV2ToV1(f).lastTrade).toBe(f.last);
  });

  it('3. no `last` on the frame means null — never the midpoint, never 0; a one-sided book still keeps the print', () => {
    expect(translateV2ToV1({ symbol: 'X/USD', bid: 9, ask: 10 }).lastTrade).toBeNull();
    const oneSided = translateV2ToV1({ symbol: 'X/USD', bid: 0, ask: 10, last: 9.5 });
    expect(oneSided.markKind).toBe('last');
    expect(oneSided.lastTrade).toBe(9.5);
  });
});

describe('P-7i — the live-pricing adapter stores the print and its receipt time', () => {
  it('4. a ticker write stores the print beside the midpoint, and the exit read returns both', async () => {
    const f = ETH_FRAME.data[0];
    adapter.updateCache(SYM, (f.bid + f.ask) / 2, 'kraken_ws', 'kraken_ws_ticker_mid', f.bid, f.ask, Date.now(), null, f.last);
    const q = await adapter.getPriceWithFallback(SYM, 2000);
    expect(q.price).toBeCloseTo(2576.63, 9);
    expect(q.lastTradePrice).toBe(2576.65);
    expect(typeof q.lastTradeReceivedAtMs).toBe('number');
  });

  it('5. a later write that carries NO print keeps the previous print WITH its original receipt time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    adapter.updateCache(SYM, 100, 'kraken_ws', 'kraken_ws_ticker_mid', 99, 101, Date.now(), null, 99.5);
    vi.setSystemTime(1_700_000_005_000);
    adapter.updateCache(SYM, 100.2, 'kraken_ws', 'kraken_ws_book_mid', 99.9, 100.5, Date.now(), null, null);
    const row = adapter.priceCache.get(SYM);
    expect(row.price).toBe(100.2);
    expect(row.lastTradePrice).toBe(99.5);
    expect(row.lastTradeReceivedAtMs).toBe(1_700_000_000_000); // not re-stamped by the book write
  });

  it('6. the adapter REST path keeps REST `c[0]` as the print while `price` is the midpoint', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const body = { error: [], result: { ZZP7IUSD: { a: ['101', '1', '1.000'], b: ['99', '1', '1.000'], c: ['98.5', '0.1'] } } };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
    const r = await adapter.fetchFromKrakenRest(SYM);
    expect(r.producer).toBe('kraken_rest_poller');
    expect(r.price).toBe(100);
    expect(r.lastTradePrice).toBe(98.5);
    expect(typeof r.lastTradeReceivedAtMs).toBe('number');
  });

  it('7. a rate-limited re-serve carries the cached print and its ORIGINAL receipt time', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const OLD = 1_600_000_000_000;
    adapter.priceCache.set(SYM, {
      symbol: SYM, price: 80, timestamp: new Date(OLD).toISOString(), source: 'kraken_rest', producer: 'kraken_rest_poller',
      observedAt: OLD, cachedAt: Date.now(), bid: null, ask: null, sidesCapturedAtMs: null, venueObservedAtMs: null,
      lastTradePrice: 77, lastTradeReceivedAtMs: OLD,
    });
    restRateLimiter.check(SYM); // arm the cooldown -> the next REST ask is the re-serve
    const r = await adapter.fetchFromKrakenRest(SYM);
    expect(r.producer).toBe('kraken_rest_rate_limited_reserve');
    expect(r.lastTradePrice).toBe(77);
    expect(r.lastTradeReceivedAtMs).toBe(OLD);
  });
});

describe('P-7i — the emitters state the print from the right object (source fence)', () => {
  const src = readFileSync(resolve(__dirname, '../../exchanges/kraken/kraken-websocket-adapter.ts'), 'utf-8');

  it('8. the v2 ticker emit carries the translator\'s print, not `lastPrice` (the midpoint); the book emit states none', () => {
    const v2 = src.indexOf("producer: safeData.markKind === 'mid' ? 'kraken_ws_ticker_mid' : 'kraken_ws_ticker_last'");
    expect(v2).toBeGreaterThan(-1);
    const v2Emit = src.slice(v2, src.indexOf('});', v2));
    expect(v2Emit).toContain('lastTradePrice: safeData.lastTrade');
    const book = src.indexOf("producer: 'kraken_ws_book_mid'");
    expect(book).toBeGreaterThan(-1);
    expect(src.slice(book, src.indexOf('});', book))).toContain('lastTradePrice: null');
  });
});

describe('P-7i r2 — Langston chunk-3 C1 and C2: the pair never splits, and every writer carries it', () => {
  it('9. ★ C1: an `undefined` print keeps the previous pair and never stamps a receipt time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    adapter.updateCache(SYM, 100, 'kraken_ws', 'kraken_ws_ticker_mid', 99, 101, Date.now(), null, 99.5);
    vi.setSystemTime(1_700_000_005_000);
    adapter.updateCache(SYM, 100.1, 'kraken_ws', 'kraken_ws_ticker_mid', 99, 101, Date.now(), null, undefined);
    const row = adapter.priceCache.get(SYM);
    expect(row.lastTradePrice).toBe(99.5);
    expect(row.lastTradeReceivedAtMs).toBe(1_700_000_000_000);
  });

  it('10. ★ C1: on a fresh row, a three-argument write (the test-file shape) stores neither half', () => {
    adapter.updateCache(SYM, 100, 'kraken_ws');
    const row = adapter.priceCache.get(SYM);
    expect(row.lastTradePrice).toBeNull();
    expect(row.lastTradeReceivedAtMs).toBeNull();
  });

  it('11. ★ C2: the entry seed carries the row\'s print WITH its original receipt time', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    adapter.updateCache(SYM, 100, 'kraken_ws', 'kraken_ws_ticker_mid', 99, 101, Date.now(), null, 99.5);
    vi.setSystemTime(1_700_000_120_000); // past the seed's 60 s keep-the-real-price window, so the seed writes
    (livePricingAdapter as unknown as { seedLastKnownGoodPrice: (s: string, p: number) => void }).seedLastKnownGoodPrice(SYM, 98);
    const row = adapter.priceCache.get(SYM);
    expect(row.source).toBe('entry_seed'); // control: the seed really wrote the row
    expect(row.lastTradePrice).toBe(99.5);
    expect(row.lastTradeReceivedAtMs).toBe(1_700_000_000_000);
  });

  it('12. the seed on a row that never printed stores neither half', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    (livePricingAdapter as unknown as { seedLastKnownGoodPrice: (s: string, p: number) => void }).seedLastKnownGoodPrice(SYM, 98);
    const row = adapter.priceCache.get(SYM);
    expect(row.source).toBe('entry_seed');
    expect(row.lastTradePrice).toBeNull();
    expect(row.lastTradeReceivedAtMs).toBeNull();
  });
});
