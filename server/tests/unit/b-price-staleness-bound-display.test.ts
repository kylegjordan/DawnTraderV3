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
  it('the engine price-read line names the inter-tick cadence for what it is', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('server/services/active-execution-engine.ts', 'utf8');
    expect(src).toContain('[I7-PM-FOCUS][ENGINE_PRICE_READ] symbol=${position.symbol} source=${priceSource} sinceLastTickMs=${diffMs}');
    expect(src).not.toContain('ageMs=${diffMs}');
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
