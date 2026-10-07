/**
 * B-PRICE-FEED-TRUTH increment I2 (#1146, #1173) — the price cache's REST sites ask and file by the VENUE'S OWN pair list.
 *
 * `#1173`: Kraken voids a whole `Ticker` request on one pair it does not list (probed 2026-10-07: `XBTUSD,INVHUSD` →
 * `EQuery:Unknown asset pair`, empty result). The RTB refresh put xStocks into that request, so its crypto members got no
 * REST price on weekdays (2 good `readyToBuy` passes in ~28 h). `#1146`: a response key the static map lacked was filed
 * under a quote-suffix PHANTOM (`XXBTZCAD` → `XXBTZ/CAD`).
 * The fake venue below stands in for `krakenAssetPairsService` (the cache's `venue` field); its `getTicker` mock behaves
 * like Kraken — any unknown pair in the request voids the request.
 * MUTATIONS (each fails a test here): send an unlisted symbol (→ 1 voids all); drop the `restEligible` check in
 * `getBatch` (→ 3, 4); fall back to the resolver for an unresolved key (→ 5); skip the readiness check (→ 6); remove the
 * `XXDG` row from `ASSET_NORMALIZATION` (→ 7).
 */
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { priceCache } from '../../services/price-cache.js';
import { krakenAssetPairsService } from '../../markets/kraken-asset-pairs-service.js';

const pc: any = priceCache;
const realVenue = pc.venue;

type Pair = { internal: string; rest: string; key: string };
const PAIRS: Pair[] = [
  { internal: 'BTC/USD', rest: 'XBTUSD', key: 'XXBTZUSD' },
  { internal: 'ETH/CAD', rest: 'ETHCAD', key: 'XETHZCAD' },
  { internal: 'DOGE/USD', rest: 'XDGUSD', key: 'XDGUSD' },
  { internal: 'CAT/USD', rest: 'CATUSD', key: 'CATUSD' }, // the crypto CAT — the ticker an xStock (Caterpillar) shares
];

function fakeVenue(ready = true) {
  const byInternal = new Map(PAIRS.map(p => [p.internal, p]));
  const byKey = new Map(PAIRS.map(p => [p.key, p]));
  return {
    ready,
    isReady() { return this.ready; },
    toKrakenRest: (s: string) => byInternal.get(s.toUpperCase())?.rest ?? null,
    resolveByKrakenKey: (k: string) => {
      const p = byKey.get(k.toUpperCase());
      return p ? ({ internalSymbol: p.internal, krakenRestPair: p.rest } as any) : undefined;
    },
  };
}

function tick(last: string) {
  return { a: [String(+last + 0.1), '1', '1'], b: [String(+last - 0.1), '1', '1'], c: [last, '0.1'], v: ['1', '1'], h: ['1', '1'], l: ['1', '1'] };
}

/** Kraken's behaviour: answer by primary key, and void the whole request on any pair it does not list. */
function krakenLike(extraResponse: Record<string, any> = {}) {
  const byRest = new Map(PAIRS.map(p => [p.rest, p]));
  return vi.fn(async (pairString: string) => {
    const asked = pairString.split(',');
    if (asked.some(a => !byRest.has(a))) throw new Error('Kraken API error: EQuery:Unknown asset pair');
    const out: Record<string, any> = { ...extraResponse };
    for (const a of asked) out[byRest.get(a)!.key] = tick('100');
    return out;
  });
}

function captureLogs() {
  const logs: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((...a: any[]) => { logs.push(a.join(' ')); });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  return logs;
}

beforeAll(() => { pc.shutdown(); });

afterEach(() => {
  pc.venue = realVenue;
  pc.cache.clear();
  for (const b of pc.buckets) b.symbols.clear();
  pc.legacyMembers.clear();
  pc.writeKeyAcc.getBatch.flushLine();
  pc.venueReadyLogged = false;
  pc.venueNotReadySkips = 0;
  vi.restoreAllMocks();
});

describe('I2 — one symbol Kraken does not list can no longer void the request (#1173)', () => {
  it('1. refreshBucket: an unlisted xStock is not sent; every listed member is written; the ledger counts it', async () => {
    const logs = captureLogs();
    pc.venue = fakeVenue();
    pc.krakenService.getTicker = krakenLike();
    const bucket = pc.buckets.find((b: any) => b.type === 'readyToBuy');
    bucket.symbols = new Set(['BTC/USD', 'ETH/CAD', 'INVH/USD']);
    await pc.refreshBucket(bucket, Date.now());
    expect(pc.krakenService.getTicker).toHaveBeenCalledTimes(1);
    expect(pc.krakenService.getTicker.mock.calls[0][0].split(',').sort()).toEqual(['ETHCAD', 'XBTUSD']);
    expect(pc.getCachedPrice('BTC/USD')?.price).toBe(100);
    expect(pc.getCachedPrice('ETH/CAD')?.price).toBe(100);
    const line = logs.find(l => l.startsWith('[3n.l][WRITE_KEYS] site=refreshBucket'))!;
    expect(line).toContain('requested=3 written=2');
    expect(line).toContain('missing=1[INVH/USD]');
    expect(line).toContain('unlisted=1[INVH/USD]');
    expect(line).toContain('phantom=0[]');
  });

  it('2. control: the old request shape (the unlisted pair sent) voids the batch — the defect the test discriminates', async () => {
    pc.krakenService.getTicker = krakenLike();
    await expect(pc.krakenService.getTicker('XBTUSD,ETHCAD,INVHUSD')).rejects.toThrow('Unknown asset pair');
  });
});

describe('I2 — getBatch reads every symbol but fetches only the REST-eligible ones (P2b)', () => {
  it('3. a stale INELIGIBLE symbol is neither fetched nor added to the bucket, and is counted ineligible', async () => {
    const logs = captureLogs();
    pc.venue = fakeVenue();
    pc.krakenService.getTicker = krakenLike();
    const res = await pc.getBatch('readyToBuy', ['BTC/USD', 'INVH/USD'], { restEligible: new Set(['BTC/USD']) });
    expect(pc.krakenService.getTicker.mock.calls[0][0]).toBe('XBTUSD');
    expect(res.get('BTC/USD')?.price).toBe(100);
    expect(res.has('INVH/USD')).toBe(false);
    const bucket = pc.buckets.find((b: any) => b.type === 'readyToBuy');
    expect(bucket.symbols.has('INVH/USD')).toBe(false);
    expect(bucket.symbols.has('BTC/USD')).toBe(true);
    pc.logHealthLine();
    const line = logs.find(l => l.includes('site=getBatch'))!;
    expect(line).toContain('requested=1 written=1');
    expect(line).toContain('ineligible=1');
  });

  it('4. a FRESH ineligible row (written by another feed) is still returned — the read list stays all-class', async () => {
    captureLogs();
    pc.venue = fakeVenue();
    pc.krakenService.getTicker = krakenLike();
    pc.updateFromWebSocket('INVH/USD', 55, 54.9, 55.1, Date.now(), null, 'mid', null, 'ws_ticker');
    const res = await pc.getBatch('readyToBuy', ['INVH/USD'], { restEligible: new Set() });
    expect(res.get('INVH/USD')?.price).toBe(55);
    expect(pc.krakenService.getTicker).not.toHaveBeenCalled();
  });

  it('5. COLLISION: an xStock CAT/USD passed as ineligible is never sent, although the venue lists the crypto CAT', async () => {
    captureLogs();
    pc.venue = fakeVenue();
    pc.krakenService.getTicker = krakenLike();
    expect(pc.venue.toKrakenRest('CAT/USD')).toBe('CATUSD'); // precondition: the venue list WOULD have sent it
    await pc.getBatch('readyToBuy', ['CAT/USD', 'BTC/USD'], { restEligible: new Set(['BTC/USD']) });
    expect(pc.krakenService.getTicker.mock.calls[0][0]).toBe('XBTUSD');
    expect(pc.getCachedPrice('CAT/USD')).toBeNull();
  });
});

describe('I2 — responses file by the venue key; nothing else is filed (#1146)', () => {
  it('6. ETH/CAD files under ETH/CAD (no XETHZ/CAD phantom); a key the venue does not name is counted, not filed', async () => {
    const logs = captureLogs();
    pc.venue = fakeVenue();
    pc.krakenService.getTicker = krakenLike({ ZZUNKNOWNKEY: tick('1') });
    const bucket = pc.buckets.find((b: any) => b.type === 'vtsSimulation');
    bucket.symbols = new Set(['ETH/CAD', 'DOGE/USD']);
    await pc.refreshBucket(bucket, Date.now());
    expect(pc.getCachedPrice('ETH/CAD')?.price).toBe(100);
    expect(pc.getCachedPrice('DOGE/USD')?.price).toBe(100);
    expect(pc.getCachedPrice('XETHZ/CAD')).toBeNull();
    expect(Array.from(pc.cache.keys()).sort()).toEqual(['DOGE/USD', 'ETH/CAD']);
    const line = logs.find(l => l.startsWith('[3n.l][WRITE_KEYS] site=refreshBucket'))!;
    expect(line).toContain('unresolved=1');
    expect(line).toContain('phantom=0[]');
  });
});

describe('I2 P5 — refuse until the venue list is ready', () => {
  it('7. nothing is sent while not ready; the transition is logged once, with the wait and the skipped passes', async () => {
    const logs = captureLogs();
    const venue = fakeVenue(false);
    pc.venue = venue;
    pc.initializedAtMs = Date.now() - 5_000;
    pc.krakenService.getTicker = krakenLike();
    const bucket = pc.buckets.find((b: any) => b.type === 'openTrade');
    bucket.symbols = new Set(['BTC/USD']);
    bucket.lastRefresh = 0;
    await pc.refreshBucket(bucket, Date.now());
    await pc.getBatch('openTrade', ['BTC/USD'], { restEligible: new Set(['BTC/USD']) });
    expect(pc.krakenService.getTicker).not.toHaveBeenCalled();
    expect(bucket.lastRefresh).toBe(0); // not advanced: the pass retries
    venue.ready = true;
    await pc.refreshBucket(bucket, Date.now());
    await pc.refreshBucket(bucket, Date.now());
    expect(pc.krakenService.getTicker).toHaveBeenCalled();
    const ready = logs.filter(l => l.includes('[I2][PriceCache][VENUE_READY]'));
    expect(ready).toHaveLength(1);
    expect(ready[0]).toMatch(/waitedMs=\d+ skippedPasses=2/);
  });
});

describe('I2 P3a — the venue list names Dogecoin by Kraken\'s base code', () => {
  it('8. XXDG (Kraken\'s AssetPairs base for DOGE) normalises to DOGE; the short code still does (control)', () => {
    expect(krakenAssetPairsService.normalizeAsset('XXDG')).toBe('DOGE');
    expect(krakenAssetPairsService.normalizeAsset('XDG')).toBe('DOGE');
    expect(krakenAssetPairsService.normalizeAsset('XXBT')).toBe('BTC');
  });
});
