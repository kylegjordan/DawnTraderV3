// B-PRICE-SIDE-BY-JOB r5 — P-7k (Langston Step-4 chunk 3 (2); PRICING_DATA_ARCHITECTURE.md §3.2 F1): the unified price
// cache states WHICH QUANTITY each row's `price` is — a midpoint or the venue's last trade — and keeps the last trade
// beside it, so the mixture that feeds signal generation is measured BEFORE P-8c moves levels to the transactable side.
//
// POSITIVE CONTROL: against the price cache before P-7k there is no `markKind`, no `lastTradePrice`, no census, no
// `logHealthLine` and no `MARK_KIND_BY_PRODUCER`, so every test below fails.
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { priceCache } from '../../services/price-cache.js';
import { livePricingAdapter } from '../../services/live-pricing-adapter.js';
import { BASIS_BY_PRODUCER, MARK_KIND_BY_PRODUCER } from '../../services/market-data/price-basis.js';

const pc: any = priceCache;
const lpa: any = livePricingAdapter;
const SYM = 'ZZP7K/USD';

beforeAll(() => {
  pc.shutdown(); // stop the refresh and health timers: these tests drive the writers directly
});

afterEach(() => {
  pc.cache.delete(SYM);
  lpa.priceCache.delete(SYM);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('P-7k — every writer states the kind, and the last trade rides beside it', () => {
  it('1. the WS writer stores the stated kind and this write\'s print', () => {
    pc.updateFromWebSocket(SYM, 2576.63, 2576.6, 2576.66, Date.now(), null, 'mid', 2576.65);
    const row = pc.getCachedPrice(SYM);
    expect(row.markKind).toBe('mid');
    expect(row.lastTradePrice).toBe(2576.65);
    expect(typeof row.lastTradeReceivedAtMs).toBe('number');
  });

  it('2. a later write with no print keeps the pair WITH its original receipt time (P-7i\'s carry rule)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    pc.updateFromWebSocket(SYM, 100, 99, 101, Date.now(), null, 'mid', 99.5);
    vi.setSystemTime(1_700_000_005_000);
    pc.updateFromRest(SYM, 100.2, 'mid', null);
    const row = pc.getCachedPrice(SYM);
    expect(row.price).toBe(100.2);
    expect(row.lastTradePrice).toBe(99.5);
    expect(row.lastTradeReceivedAtMs).toBe(1_700_000_000_000);
  });

  it('3. an `undefined` print splits nothing: a fresh row stores neither half', () => {
    pc.updateFromRest(SYM, 50, 'last', undefined);
    const row = pc.getCachedPrice(SYM);
    expect(row.markKind).toBe('last');
    expect(row.lastTradePrice).toBeNull();
    expect(row.lastTradeReceivedAtMs).toBeNull();
  });

  it('4. all three cache REST poller sites state `last` and take `c[0]` as the print (source fence)', () => {
    const src = readFileSync(resolve(__dirname, '../../services/price-cache.ts'), 'utf-8');
    const sites = src.match(/markKind: 'last',\s*\.\.\.carryLastTrade\(this\.cache\.get\(normalizedSymbol\), parseFloat\(ticker\.c\?\.\[0\] \|\| '0'\), now\)/g) ?? [];
    expect(sites.length).toBe(3);
    // control: those three sites really are the ones that store `c[0]` as `price`
    expect((src.match(/price: parseFloat\(ticker\.c\?\.\[0\] \|\| '0'\)/g) ?? []).length).toBe(3);
  });

  it('5. the adapter hop carries the producer\'s kind into the unified row', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    lpa.updateCache(SYM, 2576.63, 'kraken_ws', 'kraken_ws_ticker_mid', 2576.6, 2576.66, Date.now(), null, 2576.65);
    let row = pc.getCachedPrice(SYM);
    expect(row.markKind).toBe('mid');
    expect(row.lastTradePrice).toBe(2576.65);
    lpa.updateCache(SYM, 2576.65, 'kraken_ws', 'kraken_ws_ticker_last', null, null, null, null, 2576.65);
    row = pc.getCachedPrice(SYM);
    expect(row.markKind).toBe('last');
  });

  it('6. the adapter REST leg states the kind from the sides it read', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const body = { error: [], result: { ZZP7KUSD: { a: ['101', '1', '1.000'], b: ['99', '1', '1.000'], c: ['98.5', '0.1'] } } };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
    const r = await lpa.fetchFromKrakenRest(SYM);
    expect(r.price).toBe(100); // control: the leg really read both sides and returned the midpoint
    const row = pc.getCachedPrice(SYM);
    expect(row.markKind).toBe('mid');
    expect(row.lastTradePrice).toBe(98.5);
  });
});

describe('P-7k — the producer table is total and agrees with the suffixes', () => {
  it('7. MARK_KIND_BY_PRODUCER covers exactly the producers BASIS_BY_PRODUCER covers, and is frozen', () => {
    expect(Object.keys(MARK_KIND_BY_PRODUCER).sort()).toEqual(Object.keys(BASIS_BY_PRODUCER).sort());
    expect(Object.isFrozen(MARK_KIND_BY_PRODUCER)).toBe(true);
  });

  it('8. every `_mid` producer is mid and every `_last` producer is last; the two unsuffixed live producers are named', () => {
    for (const [p, k] of Object.entries(MARK_KIND_BY_PRODUCER)) {
      if (p.endsWith('_mid')) expect(k, p).toBe('mid');
      if (p.endsWith('_last')) expect(k, p).toBe('last');
    }
    expect(MARK_KIND_BY_PRODUCER.kraken_ws_ticker_v1).toBe('last');
    expect(MARK_KIND_BY_PRODUCER.kraken_rest_poller).toBeNull();
  });
});

describe('P-7k — the mixture is readable, one interval per HEALTH line', () => {
  it('9. level reads are counted by kind, printed on the HEALTH line, and reset at each line', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    pc.updateFromWebSocket(SYM, 10, 9.9, 10.1, Date.now(), null, 'mid', null);
    pc.noteLevelRead(pc.getCachedPrice(SYM));
    pc.noteLevelRead(pc.getCachedPrice(SYM));
    pc.noteLevelRead(null); // no row, no read
    pc.logHealthLine();
    pc.logHealthLine();
    const lines = spy.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('[PriceCache][HEALTH]'));
    expect(lines.length).toBe(2);
    expect(lines[0]).toContain('levelReadKind=mid:2,last:0,unknown:0');
    expect(lines[1]).toContain('levelReadKind=mid:0,last:0,unknown:0'); // an interval, not a running total
    expect(lines[0]).toMatch(/rowKind=mid:\d+,last:\d+,unknown:\d+/);
    expect(lines[0]).toMatch(/cacheSize=\d+ rowKind=/); // the existing text is unchanged up to cacheSize
  });

  it('10. the quant lane counts its read BELOW the invalid-price guard (source fence; Langston chunk-4 C1)', () => {
    const src = readFileSync(resolve(__dirname, '../../services/signal-orchestrator.ts'), 'utf-8');
    const at = src.indexOf('const cachedPrice = priceCache.getCachedPrice(symbol);');
    expect(at).toBeGreaterThan(-1);
    const guard = src.indexOf('Invalid price for ${symbol} (not in priceCache)', at);
    const call = src.indexOf('priceCache.noteLevelRead(cachedPrice);', at);
    expect(guard).toBeGreaterThan(at); // control: the guard really follows the read
    expect(src.slice(at, guard)).not.toContain('noteLevelRead'); // r1 counted above the guard
    expect(call).toBeGreaterThan(guard);
    // Structural, not a byte distance (a byte bound broke on line endings): the count sits before the smoother starts.
    expect(call).toBeLessThan(src.indexOf('Directive 9.3: Apply Adaptive Kalman Filter', at));
  });

  it('11. the unreachable v1 WS writer states `last` (source fence)', () => {
    const src = readFileSync(resolve(__dirname, '../../exchanges/kraken/kraken-websocket-adapter.ts'), 'utf-8');
    expect(src).toContain("priceCache.updateFromWebSocket(internalSymbol, lastPrice, null, null, null, null, 'last',");
  });
});
