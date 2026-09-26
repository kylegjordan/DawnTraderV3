// B-REST-SIDES-TO-CACHE (PHASE_19_PLAN row 3n.l) increment 1 — OBJ-8 (the static map carries Kraken's PRIMARY REST
// key), OBJ-10 (each cache row names the writer of its sides), OBJ-11 (six dead rows gone), and P3 (the write-key
// ledger: requested / written / phantom / missing per REST site).
//
// POSITIVE CONTROL: against the code before this increment, the map gives GBP/USD the altname `GBPUSD`, so
// `normalizeToInternalSymbol('ZGBPZUSD')` is the phantom `ZGBPZ/USD`, `refreshBucket` writes GBP/USD's sides under that
// phantom, there is no `sidesWriter`, no ledger line and no `rest-write-keys` module — every test below fails.
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { priceCache } from '../../services/price-cache.js';
import { KRAKEN_SYMBOL_MAP } from '../../markets/kraken-symbol-map.js';
import { normalizeToInternalSymbol, toKrakenRest } from '../../markets/kraken-symbol-resolver.js';
import { buildWriteKeyLedger, WriteKeyAccumulator, formatKeyList } from '../../services/market-data/rest-write-keys.js';

const pc: any = priceCache;
const FAKE = 'ZZ3NL/USD';

/** Kraken REST ticker entry, shaped as `getTicker` returns it. */
function tick(bid: string, ask: string, last: string) {
  return { a: [ask, '1', '1.000'], b: [bid, '1', '1.000'], c: [last, '0.1'], v: ['1', '100'], h: ['1', '2'], l: ['1', '0.5'] };
}

/**
 * Kraken `AssetPairs`, 2026-09-26: EVERY pair whose primary key differs from its altname (44 of 1,451; Step-4 condition
 * C4 — the selection is the whole set, not a sample). The static map must never carry the altname for any of them
 * (OBJ-8's invariant). A pair Kraken adds later is outside this fence; row `3n.l-a` owns the live check.
 */
const ALTNAME_TO_PRIMARY: Record<string, string> = {
  ETCETH: 'XETCXETH', ETCEUR: 'XETCZEUR', ETCUSD: 'XETCZUSD', ETCXBT: 'XETCXXBT', ETHCAD: 'XETHZCAD',
  ETHEUR: 'XETHZEUR', ETHGBP: 'XETHZGBP', ETHJPY: 'XETHZJPY', ETHUSD: 'XETHZUSD', ETHXBT: 'XETHXXBT',
  EURUSD: 'ZEURZUSD', GBPUSD: 'ZGBPZUSD', LTCEUR: 'XLTCZEUR', LTCJPY: 'XLTCZJPY', LTCUSD: 'XLTCZUSD',
  LTCXBT: 'XLTCXXBT', MLNEUR: 'XMLNZEUR', MLNUSD: 'XMLNZUSD', MLNXBT: 'XMLNXXBT', USDCAD: 'ZUSDZCAD',
  USDJPY: 'ZUSDZJPY', USDTUSD: 'USDTZUSD', XBTCAD: 'XXBTZCAD', XBTEUR: 'XXBTZEUR', XBTEUROP: 'XXBTEUROP',
  XBTGBP: 'XXBTZGBP', XBTJPY: 'XXBTZJPY', XBTUSD: 'XXBTZUSD', XBTUSDQ: 'XXBTUSDQ', XBTUSDR: 'XXBTUSDR',
  XDGXBT: 'XXDGXXBT', XLMEUR: 'XXLMZEUR', XLMGBP: 'XXLMZGBP', XLMUSD: 'XXLMZUSD', XLMXBT: 'XXLMXXBT',
  XMREUR: 'XXMRZEUR', XMRUSD: 'XXMRZUSD', XMRXBT: 'XXMRXXBT', XRPCAD: 'XXRPZCAD', XRPEUR: 'XXRPZEUR',
  XRPUSD: 'XXRPZUSD', XRPXBT: 'XXRPXXBT', ZECEUR: 'XZECZEUR', ZECUSD: 'XZECZUSD',
};

beforeAll(() => {
  pc.shutdown(); // stop the refresh and health timers: these tests drive the writers directly
});

afterEach(() => {
  for (const k of ['GBP/USD', 'ZGBPZ/USD', 'BTC/CAD', FAKE]) pc.cache.delete(k);
  for (const b of pc.buckets) b.symbols.clear();
  pc.writeKeyAcc.getPrice.flushLine();
  pc.writeKeyAcc.getBatch.flushLine();
  vi.restoreAllMocks();
});

describe('OBJ-8 — the static map carries the key Kraken answers by', () => {
  it('1. Kraken\'s primary resolves to the internal symbol; the resolver\'s request form is the primary (the price cache still asks by its own `toKrakenSymbol`, scope C1)', () => {
    expect(normalizeToInternalSymbol('ZGBPZUSD')).toBe('GBP/USD');
    expect(normalizeToInternalSymbol('XETCZUSD')).toBe('ETC/USD');
    expect(toKrakenRest('GBP/USD')).toBe('ZGBPZUSD');
    expect(toKrakenRest('ETC/USD')).toBe('XETCZUSD');
    // the compact lookup keys on the internal symbol, so the old request form still resolves (resolver `:34`)
    expect(normalizeToInternalSymbol('GBPUSD')).toBe('GBP/USD');
  });

  it('2. no map row carries an altname whose Kraken primary differs', () => {
    const offenders = KRAKEN_SYMBOL_MAP.filter(r => ALTNAME_TO_PRIMARY[r.krakenRestPair.toUpperCase()] !== undefined)
      .map(r => `${r.internalSymbol}:${r.krakenRestPair}`);
    expect(offenders).toEqual([]);
    // control: the fixture does name rows the map holds (by their primary), so an empty result is not a vacuous pass
    expect(KRAKEN_SYMBOL_MAP.some(r => r.krakenRestPair === 'XXBTZUSD')).toBe(true);
    expect(KRAKEN_SYMBOL_MAP.some(r => r.krakenRestPair === 'ZGBPZUSD')).toBe(true);
  });
});

describe('OBJ-11 — the six dead rows are gone', () => {
  it('3. none of the six internal symbols is in the static map; a live row is (control)', () => {
    const syms = new Set(KRAKEN_SYMBOL_MAP.map(r => r.internalSymbol));
    for (const d of ['EOS/USD', 'ICX/USD', 'MATIC/USD', 'MKR/USD', 'REP/USD', 'WAVES/USD']) expect(syms.has(d)).toBe(false);
    expect(syms.has('ADA/USD')).toBe(true);
  });
});

describe('P3 — the write-key ledger (pure)', () => {
  it('4. requested = written ∪ missing; every written key is requested or a phantom; viaPrimary names the map resolutions', () => {
    const l = buildWriteKeyLedger('refreshBucket', ['GBP/USD', 'BTC/CAD', 'ADA/USD'], [
      { responseKey: 'ZGBPZUSD', writtenKeys: ['GBP/USD'] },
      { responseKey: 'XXBTZCAD', writtenKeys: ['XXBTZ/CAD'] },
      { responseKey: 'ADAUSD', writtenKeys: ['ADA/USD'] },
    ], s => s.replace('/', ''));
    expect(l.written).toEqual(['GBP/USD', 'ADA/USD']);
    expect(l.missing).toEqual(['BTC/CAD']);
    expect(l.phantom).toEqual(['XXBTZ/CAD']);
    expect(l.viaPrimary).toEqual(['GBP/USD<-ZGBPZUSD']);
    expect(new Set([...l.written, ...l.missing])).toEqual(new Set(l.requested));
    expect(l.written.filter(s => l.missing.includes(s))).toEqual([]);
  });

  it('5. a requested symbol Kraken omits is MISSING, not silently absent', () => {
    const l = buildWriteKeyLedger('getBatch', ['GBP/USD'], [], s => s);
    expect(l.missing).toEqual(['GBP/USD']);
    expect(l.written).toEqual([]);
  });

  it('6. the accumulator prints its site\'s line once, then resets; lists are bounded', () => {
    const acc = new WriteKeyAccumulator('getPrice');
    expect(acc.flushLine()).toBeNull();
    acc.add(buildWriteKeyLedger('getPrice', ['X/USD'], [{ responseKey: 'XUSD', writtenKeys: ['Q/USD'] }], s => s));
    const line = acc.flushLine()!;
    expect(line).toContain('site=getPrice calls=1');
    expect(line).toContain('phantomDistinct=1[Q/USD]');
    expect(line).toContain('missingDistinct=1[X/USD]');
    expect(acc.flushLine()).toBeNull();
    expect(formatKeyList(Array.from({ length: 30 }, (_, i) => `K${i}`))).toContain('+5 more');
  });
});

describe('P3 + OBJ-8 through the cache — the refreshBucket pass (the path that failed on 2026-09-26)', () => {
  it('7. GBP/USD\'s response lands under GBP/USD with fresh stamped sides; an unmapped primary is named as a phantom', async () => {
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...a: any[]) => { logs.push(a.join(' ')); });
    pc.krakenService.getTicker = vi.fn().mockResolvedValue({ ZGBPZUSD: tick('1.32447', '1.32459', '1.32459'), XXBTZCAD: tick('1', '2', '1.5') });
    const bucket = pc.buckets.find((b: any) => b.type === 'openTrade');
    bucket.symbols = new Set(['GBP/USD', 'BTC/CAD']);
    const before = Date.now();
    await pc.refreshBucket(bucket, before);

    const row = pc.getCachedPrice('GBP/USD');
    expect(row).not.toBeNull();
    expect(row.bid).toBe(1.32447);
    expect(row.ask).toBe(1.32459);
    expect(row.sidesWriter).toBe('rest_poller');
    expect(row.sidesCapturedAtMs).toBeGreaterThanOrEqual(before);
    expect(pc.getCachedPrice('ZGBPZ/USD')).toBeNull();

    const line = logs.find(l => l.startsWith('[3n.l][WRITE_KEYS] site=refreshBucket'))!;
    expect(line).toBeDefined();
    expect(line).toContain('bucket=openTrade');
    expect(line).toContain('requested=2 written=1');
    expect(line).toContain('missing=1[BTC/CAD]');
    expect(line).toMatch(/phantom=1\[[^\]]+\]/);
    expect(line).toContain('viaPrimary=[GBP/USD<-ZGBPZUSD]');
    expect(line).toContain('rest_poller:1');
  });
});

describe('OBJ-10 — each row names the writer of its sides', () => {
  it('8. the WS writer names itself only when it states a side; the adapter REST writer carries the name forward', () => {
    pc.updateFromWebSocket(FAKE, 10, 9.9, 10.1, Date.now(), null, 'mid', null);
    expect(pc.getCachedPrice(FAKE).sidesWriter).toBe('ws');
    pc.updateFromRest(FAKE, 10.05, 'mid', null);
    expect(pc.getCachedPrice(FAKE).sidesWriter).toBe('ws');
    pc.cache.delete(FAKE);
    pc.updateFromWebSocket(FAKE, 10, null, null, null, null, 'mid', null); // a tick with no sides, on a cold row
    expect(pc.getCachedPrice(FAKE).sidesWriter).toBeNull();
  });

  it('9. getPrice names `rest_fetch` and getBatch names `rest_batch`; each prints its own site line at the health tick', async () => {
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...a: any[]) => { logs.push(a.join(' ')); });
    pc.krakenService.getTicker = vi.fn().mockResolvedValue({ ZZ3NLUSD: tick('9.9', '10.1', '10') });

    await pc.getPrice(FAKE, 'readyToBuy');
    expect(pc.getCachedPrice(FAKE).sidesWriter).toBe('rest_fetch');

    pc.cache.delete(FAKE);
    await pc.getBatch('vtsSimulation', [FAKE]);
    expect(pc.getCachedPrice(FAKE).sidesWriter).toBe('rest_batch');

    pc.logHealthLine();
    expect(logs.some(l => l.includes('site=getPrice calls=1 requested=1 written=1'))).toBe(true);
    expect(logs.some(l => l.includes('site=getBatch calls=1 requested=1 written=1'))).toBe(true);
    const n = logs.length;
    pc.logHealthLine();
    expect(logs.slice(n).some(l => l.includes('[3n.l][WRITE_KEYS]'))).toBe(false); // reset: no calls, no site lines
  });

  it('10. a failing fetch is still recorded: the symbol shows as MISSING at the health tick (Step-4 condition C1)', async () => {
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...a: any[]) => { logs.push(a.join(' ')); });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    pc.krakenService.getTicker = vi.fn().mockRejectedValue(new Error('venue down'));
    await pc.getPrice(FAKE, 'readyToBuy');
    await pc.getBatch('vtsSimulation', [FAKE]);
    pc.logHealthLine();
    expect(logs.some(l => l.includes('site=getPrice calls=1 requested=1 written=0') && l.includes(`missingDistinct=1[${FAKE}]`))).toBe(true);
    expect(logs.some(l => l.includes('site=getBatch calls=1 requested=1 written=0') && l.includes(`missingDistinct=1[${FAKE}]`))).toBe(true);
  });
});
