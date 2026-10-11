/**
 * B-PRICE-STALENESS-BOUND (sprint row 33) P3 — `#743` route A, the display half: a re-served price never presents as just
 * observed. The re-serve legs build `timestamp` from the carried `observedAt`, and the peek the RTB "Current" column reads
 * reports the OBSERVATION age, not the receipt age every cache write renews.
 */
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { livePricingAdapter, observedIso } from '../../services/live-pricing-adapter';
import { _replaceXstockUniverse, type XstockSpotEntry } from '../../../shared/asset-classes';
import { UNIVERSE_BOOTSTRAP_SET } from '../../asset_classes/xstock_spot/universe-bootstrap';

beforeAll(() => {
  const fixture = new Map<string, XstockSpotEntry>();
  for (const { symbol, entry } of UNIVERSE_BOOTSTRAP_SET) fixture.set(symbol, entry);
  _replaceXstockUniverse(fixture);
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

const NOW = Date.parse('2026-10-14T15:00:00Z');
const OBSERVED = NOW - 600_000; // ten minutes old
const adapter = livePricingAdapter as any;
function seed(symbol: string, source = 'kraken_rest') {
  adapter.priceCache.set(adapter.normalizeSymbol(symbol), {
    symbol: adapter.normalizeSymbol(symbol), price: 123.45, timestamp: new Date(NOW).toISOString(), source,
    producer: 'kraken_rest_poller', observedAt: OBSERVED, cachedAt: NOW, // receipt just now; observation ten minutes ago
    bid: null, ask: null, sidesCapturedAtMs: null, venueObservedAtMs: null, lastTradePrice: null, lastTradeReceivedAtMs: null,
  });
}

describe('P3 — display ages are observation ages', () => {
  it('observedIso renders the stamp it is given', () => {
    expect(observedIso(OBSERVED)).toBe('2026-10-14T14:50:00.000Z');
  });

  it('peekCachedPrice (the RTB Current column) reports the OBSERVATION age, not the receipt age', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    seed('ETH/USD');
    expect(livePricingAdapter.peekCachedPrice('ETH/USD')!.ageMs).toBe(600_000);
  });

  it('the xStock REST gate re-serve keeps its observation time', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    seed('AAPL/USD', 'kraken_equities_ws');
    const q = await adapter.fetchLivePrice('AAPL/USD');
    expect(q.producer).toBe('xstock_rest_gate_reserve');
    expect(q.timestamp).toBe(new Date(OBSERVED).toISOString());
  });

  it('the all-APIs-failed re-serve keeps its observation time', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    seed('SOL/USD');
    vi.spyOn(adapter, 'fetchFromKrakenRest').mockResolvedValue(null);
    const q = await adapter.fetchLivePrice('SOL/USD');
    expect(q.producer).toBe('last_known_good_all_apis_failed');
    expect(q.timestamp).toBe(new Date(OBSERVED).toISOString());
  });

  it('the fetch-exception re-serve keeps its observation time', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    seed('ADA/USD');
    vi.spyOn(adapter, 'fetchFromKrakenRest').mockRejectedValue(new Error('boom'));
    const q = await adapter.fetchLivePrice('ADA/USD');
    expect(q.producer).toBe('last_known_good_fetch_exception');
    expect(q.timestamp).toBe(new Date(OBSERVED).toISOString());
  });

  it('the rate-limited REST re-serve keeps its observation time; CONTROL: a genuine read is stamped at its read', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    vi.spyOn(adapter, 'fetchFromKrakenRest').mockResolvedValueOnce({ price: 50, observedAt: OBSERVED, producer: 'kraken_rest_rate_limited_reserve', lastTradePrice: null, lastTradeReceivedAtMs: null });
    const q = await adapter.fetchLivePrice('DOT/USD');
    expect(q.timestamp).toBe(new Date(OBSERVED).toISOString());
    vi.spyOn(adapter, 'fetchFromKrakenRest').mockResolvedValueOnce({ price: 50, observedAt: NOW, producer: 'kraken_rest_poller', lastTradePrice: null, lastTradeReceivedAtMs: null });
    const q2 = await adapter.fetchLivePrice('DOT/USD');
    expect(q2.timestamp).toBe(new Date(NOW).toISOString());
  });

  it('FINDING-1: a re-serve whose observation time is not finite is NOT presented — no throw, no false-fresh peek', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    for (const sym of ['NANX/USD', 'AAPL/USD', 'NANY/USD']) {
      seed(sym, sym === 'AAPL/USD' ? 'kraken_equities_ws' : 'kraken_rest');
      adapter.priceCache.get(adapter.normalizeSymbol(sym)).observedAt = Number.NaN;
    }
    expect(livePricingAdapter.peekCachedPrice('NANX/USD')).toBeNull(); // the route reads no peek as venue-quiet
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const gate = await adapter.fetchLivePrice('AAPL/USD');                // the xStock REST gate
    expect(gate.source).toBe('no_reliable_price');
    // decided AT the gate leg, never by a throw caught one leg down
    expect(errSpy.mock.calls.some((c) => String(c[0]).includes('Live fetch exception'))).toBe(false);
    expect(logSpy.mock.calls.some((c) => String(c[0]).includes('[XSTOCK_REST_GATE] symbol=AAPL/USD rest_ask=skipped serving=no_reliable_price'))).toBe(true);
    // Langston gate 3 r2, condition 1: without its guard a leg throws in observedIso, and the catch below ALSO returns
    // no_reliable_price — so the gate, all-APIs-failed and REST-quote legs are asserted to decide WITHOUT an exception
    // (the throw is a second route to the same verdict, invisible to a verdict assertion). The fetch-exception leg
    // (NANY) logs an exception BY DESIGN and cannot carry that assertion: its guard is covered instead because, without
    // it, the throw happens INSIDE the catch with no outer handler, so the call rejects and the await fails the test.
    const exceptions = () => errSpy.mock.calls.filter((c) => String(c[0]).includes('Live fetch exception')).length;
    let e0 = exceptions();
    vi.spyOn(adapter, 'fetchFromKrakenRest').mockResolvedValueOnce(null);  // all-APIs-failed
    expect((await adapter.fetchLivePrice('NANX/USD')).source).toBe('no_reliable_price');
    expect(exceptions()).toBe(e0);
    vi.spyOn(adapter, 'fetchFromKrakenRest').mockRejectedValueOnce(new Error('boom')); // fetch exception (inside the catch)
    expect((await adapter.fetchLivePrice('NANY/USD')).source).toBe('no_reliable_price');
    vi.spyOn(adapter, 'fetchFromKrakenRest').mockResolvedValueOnce({ price: 5, observedAt: Number.NaN, producer: 'kraken_rest_poller', lastTradePrice: null, lastTradeReceivedAtMs: null });
    e0 = exceptions();
    expect((await adapter.fetchLivePrice('NANZ/USD')).source).toBe('no_reliable_price'); // the REST quote leg, no cache row
    expect(exceptions()).toBe(e0);
  });

  it('FENCE: no re-serve leg stamps "now" as its timestamp', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('server/services/live-pricing-adapter.ts', 'utf8').replace(/\r/g, '');
    const legs = src.split('\n').map((l, i) => ({ l, i })).filter(({ l }) => /source: 'last_known_good',/.test(l));
    // Four re-serves: the three fetchLivePrice legs stamp observedIso(...); getPriceWithFallback's last resort passes the
    // cached row's own `timestamp` through unrefreshed (it writes nothing back to the cache).
    expect(legs.length).toBe(4);
    const lines = src.split('\n');
    const stamps = legs.map(({ i }) => lines[i - 1].trim());
    expect(stamps.filter((l) => /^timestamp: observedIso\(/.test(l))).toHaveLength(3);
    expect(stamps.filter((l) => l === 'timestamp: cached.timestamp,')).toHaveLength(1);
    expect(stamps.some((l) => /new Date\(\)/.test(l))).toBe(false);
  });
});

describe('P5 — #913 and the dead constant', () => {
  it('#913 / row 33: the two last-known-good fallback lines name BOTH ages, with no bare age= label (three receipt-age lines elsewhere are left intentionally, change list gate 3 r2)', async () => {
    const { readFileSync } = await import('node:fs');
    const lines = readFileSync('server/services/live-pricing-adapter.ts', 'utf8').replace(/\r/g, '').split('\n')
      .filter((l) => l.includes('[LAST_KNOWN_GOOD_FALLBACK]'));
    expect(lines).toHaveLength(2);
    for (const l of lines) { expect(l).toContain('receiptAgeMs=${cacheAge}'); expect(l).toContain('observedAgeMs=${Date.now() - cached.observedAt}'); expect(l).not.toMatch(/ age=\$\{/); }
  });

  it('#913 by CLASS: every log line printing the inter-tick cadence names it for what it is — never an age', async () => {
    const { readFileSync } = await import('node:fs');
    const lines = readFileSync('server/services/active-execution-engine.ts', 'utf8').replace(/\r/g, '').split('\n')
      .filter((l) => l.includes('console.') && l.includes('${diffMs}'));
    // Enumerated, not counted (Langston gate 3, FINDING-3): the three lines in the cadence block.
    expect(lines.map((l) => (l.match(/\[[^\]]+\](\[[^\]]+\])?/) ?? [''])[0])).toEqual(['[PRICE_TICK]', '[I7-PM-FOCUS][ENGINE_PRICE_READ]', '[8.8.3-I6][ENGINE_LIVE_PRICE]']);
    for (const l of lines) {
      const labels = [...l.matchAll(/(\w+)=\$\{diffMs\}/g)].map((m) => m[1]);
      expect(labels.length).toBe(1);
      expect(['diff_ms', 'sinceLastTickMs']).toContain(labels[0]);
    }
  });
  it('WS_CACHE_FALLBACK_MS is gone from the server tree', async () => {
    const { readFileSync, readdirSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const hits: string[] = [];
    const walk = (d: string) => {
      for (const n of readdirSync(d)) {
        const f = join(d, n);
        if (statSync(f).isDirectory()) { if (n !== 'tests' && n !== 'node_modules') walk(f); }
        else if (f.endsWith('.ts') && readFileSync(f, 'utf8').includes('WS_CACHE_FALLBACK_MS')) hits.push(f);
      }
    };
    walk('server');
    expect(hits).toEqual([]);
    // positive control: the same walk finds the live sibling constant
    expect(readFileSync('server/services/live-pricing-adapter.ts', 'utf8')).toContain('WS_CACHE_FRESH_MS');
  });
});
