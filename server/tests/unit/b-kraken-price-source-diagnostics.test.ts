import { afterEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { readFileSync } from 'node:fs';
import { priceCache } from '../../services/price-cache.js';
import { livePricingAdapter } from '../../services/live-pricing-adapter.js';
import { krakenAssetPairsService } from '../../markets/kraken-asset-pairs-service.js';
import { normalizeToInternalSymbol } from '../../markets/kraken-symbol-resolver.js';
import { getLevelBasisFunnel } from '../../core/calculations/level-basis.js';
import { recordTouchSelection, selectTouchPrice, tickerLegFromCachedQuote } from '../../core/calculations/touch-price.js';
import { selectCryptoTouch } from '../../core/trading/crypto-touch.js';
import { buildFunnelSnapshotLine } from '../../services/level-basis-funnel-writer.js';
import { restRateLimiter } from '../../services/market-data/rest-rate-limiter.js';
import {
  captureLevelBasisDiagnostics, krakenPriceSourceDiagnostics, KrakenPriceSourceDiagnostics,
} from '../../services/market-data/kraken-price-source-diagnostics.js';

const symbol = 'BTC/USD';
const alias = 'btc/usd';
const pair = { internalSymbol: symbol, krakenRestPair: 'XBTUSD' };
const ticker = { a: ['102', '1', '2'], b: ['98', '1', '3'], c: ['100'] };
const metadata = (altname: string, wsname: string, base: string) =>
  ({ altname, wsname, base, quote: 'ZUSD', status: 'online', aclass_base: 'currency', aclass_quote: 'currency' });
const fakeVenue = { resolveByKrakenKey: (key: string) => key === 'XXBTZUSD' ? pair : undefined };
const cache = priceCache as unknown as {
  venue: unknown;
  krakenService: { getTicker: (keys: string) => Promise<Record<string, unknown>> };
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
  }, krakenAssetPairsService.resolveByInternal(key)?.krakenPairKey);
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

it('keeps all seven real decision hooks connected to their quote or position identity', () => {
  const sites = {
    'active-execution-engine': { active_entry_fill: '_ft.internalSymbol', exit_trigger: '_lsSym' },
    'signal-orchestrator': { active_level_build: '_cbSym', active_signal_birth: 'symbol' },
    'vts-runner': { vts_signal_birth: 'symbol', vts_entry_fill: '_pt.internalSymbol', vts_exit_trigger: '_et.internalSymbol' },
  };
  for (const [file, expected] of Object.entries(sites)) {
    const source = readFileSync(new URL(`../../services/${file}.ts`, import.meta.url), 'utf8');
    const matches = Array.from(source.matchAll(/recordTouchSelection\(\{[^\r\n]+stage: '([^']+)'[^\r\n]+\}, [^,]+, ([\w.]+)\)/g));
    expect(matches).toHaveLength(Object.keys(expected).length);
    expect(Object.fromEntries(matches.map(match => [match[1], match[2]]))).toEqual(expected);
  }
});

it('reconciles both sources from an inherited alias and freezes the whole opt-in snapshot across an await', async () => {
  const now = 5100;
  vi.spyOn(Date, 'now').mockReturnValue(now);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const stages = [
    ['active', 'active_level_build'], ['active', 'active_signal_birth'],
    ['active', 'active_entry_fill'], ['active', 'exit_trigger'],
    ['vts', 'vts_signal_birth'], ['vts', 'vts_entry_fill'], ['vts', 'vts_exit_trigger'],
  ] as const;
  const walkAllStages = (key: string) => {
    const selection = selectTouchPrice({
      book: null, bookEligible: true, bookTrusted: true,
      ticker: tickerLegFromCachedQuote(priceCache.get(key)), tickerBasis: 'ticker_bbo',
    }, now, { maxAgeMs: 15_000, maxSpreadFraction: 0.5 });
    for (const [lane, stage] of stages) recordTouchSelection({ lane, stage, assetClass: 'crypto_spot' }, selection, key);
  };
  const pairs = {
    XXBTZUSD: metadata('XBTUSD', 'XBT/USD', 'XXBT'),
    XETHZUSD: metadata('ETHUSD', 'ETH/USD', 'XETH'),
    XETHZCAD: { ...metadata('ETHCAD', 'ETH/CAD', 'XETH'), quote: 'ZCAD' },
  };
  const getAssetPairs = vi.spyOn(axios, 'get').mockResolvedValue({ data: { error: [], result: pairs } });

  seedWs(alias, 5000);
  walkAllStages(alias);
  await krakenAssetPairsService.initialize();
  krakenPriceSourceDiagnostics.startIfReady();
  priceCache.updateFromRest(alias, 104, 'last', 104, null);
  walkAllStages(alias);
  writeRest(alias, 5050);
  walkAllStages(alias);
  walkAllStages('ETH/USD'); // explicit refusal on a second canonical symbol

  const defaultResponse = captureLevelBasisDiagnostics();
  expect(defaultResponse).toEqual({ levelBasisFunnel: getLevelBasisFunnel() });
  const oldFileShape = JSON.parse(buildFunnelSnapshotLine(now, {
    startedAtMs: 1, pid: 1, pmUptimeMs: null, pmRestartCount: null, buildSha: 'fixture',
  }));
  expect(Object.keys(oldFileShape)).toEqual(['kind', 'snapshotAt', 'lifetime', 'rows']);
  expect(oldFileShape.rows).toEqual(defaultResponse.levelBasisFunnel);

  const captured = captureLevelBasisDiagnostics(priceCache.getRestReceiptOrdering());
  const evidence = captured.krakenPriceSourceBySymbol!;
  expect(evidence.coverage.globalGaps).toEqual({});
  expect(evidence.coverage.symbols).toContainEqual({
    symbol, inherited: { ws_ticker: 1 }, assigned: { rest_adapter: 1 }, gaps: {},
  });
  expect(evidence.baseline).toHaveLength(14);
  expect(evidence.tracked).toHaveLength(28);
  expect(evidence.untracked).toHaveLength(14);
  expect(evidence.reconciliation).toHaveLength(14);
  expect(evidence.reconciliation.every(row => row.attemptsMatch && row.sourcesMatch)).toBe(true);
  expect(evidence.supplementalOnlyKeys).toEqual([]);
  const ladderKey = 'active:crypto_spot:active_entry_fill:ladder';
  expect(evidence.tracked).toContainEqual({
    key: ladderKey, symbol, attempted: 2, byAcceptedSource: { 'ticker_bbo:ws_ticker': 1, 'ticker_bbo:rest_adapter': 1 },
  });
  const altered = getLevelBasisFunnel().map(row => row.key === ladderKey ? {
    ...row, byAcceptedSource: { 'ticker_bbo:ws_ticker': 3 },
  } : row);
  expect(krakenPriceSourceDiagnostics.snapshot(now, altered).reconciliation).toContainEqual({
    key: ladderKey, attemptsMatch: true, sourcesMatch: false,
  });

  const acrossAwait = JSON.stringify(captured);
  await Promise.resolve().then(() => {
    priceCache.clear();
    writeRest('ETH/USD', 5060);
    walkAllStages('ETH/USD');
  });
  expect(JSON.stringify(captured)).toBe(acrossAwait);
  expect(captureLevelBasisDiagnostics(priceCache.getRestReceiptOrdering()).krakenPriceSourceBySymbol?.coverage.symbols)
    .toContainEqual({ symbol: 'ETH/USD', inherited: {}, assigned: { rest_adapter: 1 }, gaps: {} });
  expect(getLevelBasisFunnel().find(row => row.key === ladderKey)?.attempted).toBe(5);

  // Existing REST cache behavior accepts a typed pair object even if a caller supplies invalid values.
  // It must remain observable after a later adapter pair restores an otherwise adapter-only cache.
  priceCache.updateFromRest('ETH/USD', 101, 'last', 101, {
    bid: 0, ask: 102, capturedAtMs: 5070, writer: 'rest_engine', sizes: null,
  });
  expect(priceCache.get('ETH/USD')).toMatchObject({ bid: 0, sidesWriter: 'rest_engine' });
  writeRest('ETH/USD', 5080);
  expect(captureLevelBasisDiagnostics(priceCache.getRestReceiptOrdering()).krakenPriceSourceBySymbol?.coverage.symbols)
    .toContainEqual({ symbol: 'ETH/USD', inherited: {}, assigned: { rest_adapter: 2 }, gaps: { missing_provenance: 1 } });

  const unknownKey = new KrakenPriceSourceDiagnostics(krakenAssetPairsService);
  unknownKey.bindCache(() => [['UNKNOWN-ALIAS', {
    symbol, bid: 99, ask: 101, sidesWriter: 'ws_ticker', sidesCapturedAtMs: 5000,
  }]]);
  unknownKey.startIfReady();
  expect(unknownKey.snapshot(now, []).coverage.globalGaps).toEqual({ inherited_identity: 1 });
  unknownKey.recordDroppedAssignment('XXBTZUSD');
  unknownKey.recordDroppedAssignment('UNKNOWN-VENUE-PAIR');
  const eth = krakenAssetPairsService.resolveByInternal('ETH/USD')!;
  unknownKey.checkRestResponseIdentity('XXBTZUSD', { ...eth, krakenPairKey: 'XXBTZUSD' });
  expect(unknownKey.snapshot(now, []).coverage).toMatchObject({
    globalGaps: { inherited_identity: 1, dropped_write: 1 },
    symbols: expect.arrayContaining([
      expect.objectContaining({ symbol, gaps: { dropped_write: 1, identity_change: 1 } }),
      expect.objectContaining({ symbol: eth.internalSymbol, gaps: { identity_change: 1 } }),
    ]),
  });

  // An away-and-back primary-key change with no covered quote or read between the publications.
  getAssetPairs.mockResolvedValueOnce({ data: { error: [], result: {
    XXBTZUSD: pairs.XXBTZUSD, ETHUSD: pairs.XETHZUSD, XETHZCAD: pairs.XETHZCAD,
  } } });
  await krakenAssetPairsService.refresh();
  expect(krakenAssetPairsService.resolveByInternal('ETH/USD')?.krakenPairKey).toBe('ETHUSD');
  await krakenAssetPairsService.refresh();
  expect(krakenAssetPairsService.resolveByInternal('ETH/USD')?.krakenPairKey).toBe('XETHZUSD');
  const afterRemap = captureLevelBasisDiagnostics(priceCache.getRestReceiptOrdering()).krakenPriceSourceBySymbol!;
  expect(afterRemap.coverage.symbols).toContainEqual(expect.objectContaining({
    symbol: 'ETH/USD', gaps: { missing_provenance: 1, identity_change: expect.any(Number) },
  }));
  expect(afterRemap.coverage.symbols.find(row => row.symbol === 'ETH/USD')?.gaps.identity_change).toBeGreaterThan(0);

  // BTC keeps the primary. ETH briefly claims the same spelling as its REST alias.
  getAssetPairs.mockResolvedValueOnce({ data: { error: [], result: {
    ...pairs, XETHZUSD: metadata('XXBTZUSD', 'ETH/USD', 'XETH'),
  } } });
  await krakenAssetPairsService.refresh();
  expect(krakenAssetPairsService.resolveByKrakenKey('XXBTZUSD')?.internalSymbol).toBe('BTC/USD');
  expect(krakenAssetPairsService.resolveByRestPair('XXBTZUSD')?.internalSymbol).toBe('ETH/USD');
  await krakenAssetPairsService.refresh();
  const afterAmbiguity = captureLevelBasisDiagnostics(priceCache.getRestReceiptOrdering()).krakenPriceSourceBySymbol!;
  for (const affected of ['BTC/USD', 'ETH/USD']) {
    expect(afterAmbiguity.coverage.symbols.find(row => row.symbol === affected)?.gaps.ambiguous_identity)
      .toBeGreaterThan(0);
  }

  const rawPrimary = 'XETHZCAD';
  expect(krakenAssetPairsService.resolveByKrakenKey(rawPrimary)?.internalSymbol).toBe('ETH/CAD');
  writeRest('ETH/CAD', 5090);
  const walk = selectCryptoTouch(rawPrimary, {
    normalize: normalizeToInternalSymbol, getBook: () => null, isBookTrusted: () => true,
    getCached: key => priceCache.get(key),
  }, now, { maxAgeMs: 15_000, maxSpreadFraction: 0.5 });
  expect(walk.internalSymbol).toBe('XETHZ/CAD');
  expect(walk.selection.ok).toBe(false);
  recordTouchSelection({ lane: 'active', stage: 'active_entry_fill', assetClass: 'crypto_spot' },
    walk.selection, walk.internalSymbol);
  const afterUnresolved = captureLevelBasisDiagnostics(priceCache.getRestReceiptOrdering()).krakenPriceSourceBySymbol!;
  expect(afterUnresolved.coverage.globalGaps).toMatchObject({ unresolved_walk: 1 });
  expect(afterUnresolved.untracked).toContainEqual({
    key: ladderKey, reason: 'unresolved', attempted: 1, byAcceptedSource: {},
  });
});

describe('exact mapping publication coverage', () => {
  const canonical = {
    XXBTZUSD: metadata('XXBTZUSD', 'XBT/USD', 'XXBT'),
    XETHZUSD: metadata('XETHZUSD', 'ETH/USD', 'XETH'),
  };
  const indexOnlyConflict = {
    LOWBTC: metadata('INDEX-ONLY', 'OLD-BTC', 'XXBT'),
    LOWETH: metadata('OLD-ETH', 'INDEX-ONLY', 'XETH'),
    ...canonical,
  };
  const lostWsLookup = {
    LOWBTC: metadata('OLD-REST', 'OLD-WS', 'XXBT'),
    ...canonical,
  };
  const cases = [
    {
      name: 'a transient conflict visible only in the live indexes',
      changed: indexOnlyConflict,
      checkLookup: () => {
        expect(krakenAssetPairsService.resolveByRestPair('INDEX-ONLY')?.internalSymbol).toBe('BTC/USD');
        expect(krakenAssetPairsService.resolveByWsPair('INDEX-ONLY')?.internalSymbol).toBe('ETH/USD');
      },
      gap: 'ambiguous_identity',
      affected: ['BTC/USD', 'ETH/USD'],
    },
    {
      name: 'a lost frozen lookup whose declaration survives',
      changed: lostWsLookup,
      checkLookup: () => {
        expect(krakenAssetPairsService.resolveByInternal('BTC/USD')?.krakenWsPair).toBe('XBT/USD');
        expect(krakenAssetPairsService.resolveByWsPair('XBT/USD')).toBeUndefined();
      },
      gap: 'identity_change',
      affected: ['BTC/USD'],
    },
  ] as const;

  it.each(cases)('keeps a gap after $name is restored', async ({ changed, checkLookup, gap, affected }) => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const getAssetPairs = vi.spyOn(axios, 'get')
      .mockResolvedValue({ data: { error: [], result: canonical } });
    await krakenAssetPairsService.refresh();
    const diagnostics = new KrakenPriceSourceDiagnostics(krakenAssetPairsService);
    diagnostics.bindCache(() => []);
    diagnostics.startIfReady();
    expect(diagnostics.snapshot(5100, []).coverage.symbols.map(row => [row.symbol, row.gaps]))
      .toEqual([['BTC/USD', {}], ['ETH/USD', {}]]);
    expect(krakenAssetPairsService.resolveByWsPair('XBT/USD')?.internalSymbol).toBe('BTC/USD');

    getAssetPairs.mockResolvedValueOnce({ data: { error: [], result: changed } });
    await krakenAssetPairsService.refresh();
    checkLookup();
    diagnostics.observeMappingPublication();
    await krakenAssetPairsService.refresh();
    diagnostics.observeMappingPublication();

    expect(krakenAssetPairsService.resolveByWsPair('XBT/USD')?.internalSymbol).toBe('BTC/USD');
    for (const symbol of affected) {
      expect(diagnostics.snapshot(5100, []).coverage.symbols.find(row => row.symbol === symbol)?.gaps[gap])
        .toBeGreaterThan(0);
    }
  });

  it('flags both claimants when the index-only conflict already exists at startup', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(axios, 'get').mockResolvedValue({ data: { error: [], result: indexOnlyConflict } });
    await krakenAssetPairsService.refresh();
    const diagnostics = new KrakenPriceSourceDiagnostics(krakenAssetPairsService);
    diagnostics.bindCache(() => []);
    diagnostics.startIfReady();

    expect(diagnostics.snapshot(5100, []).coverage.symbols).toEqual(expect.arrayContaining([
      expect.objectContaining({ symbol: 'BTC/USD', gaps: { ambiguous_identity: expect.any(Number) } }),
      expect.objectContaining({ symbol: 'ETH/USD', gaps: { ambiguous_identity: expect.any(Number) } }),
    ]));
    expect(krakenAssetPairsService.resolveByKrakenKey('LOWBTC')?.internalSymbol).toBe('BTC/USD');
    diagnostics.recordAssignment('LOWBTC', {
      symbol: 'BTC/USD', bid: 99, ask: 101, sidesWriter: 'rest_adapter', sidesCapturedAtMs: 5000,
    }, true);
    expect(diagnostics.snapshot(5100, []).coverage.symbols.find(row => row.symbol === 'BTC/USD'))
      .toMatchObject({ gaps: { identity_change: 1 } });
    expect(diagnostics.snapshot(5100, []).coverage.symbols.find(row => row.symbol === 'BTC/USD')?.assigned).toEqual({});
  });
});

it('keeps the listed quote when an earlier unlisted response row cannot be parsed', async () => {
  const listed = 'ETH/USD';
  cache.venue = {
    isReady: () => true,
    toKrakenRest: (key: string) => key === listed ? 'ETHUSD' : null,
    resolveByKrakenKey: (key: string) => key === 'XETHZUSD' ? {
      internalSymbol: listed, krakenRestPair: 'ETHUSD', krakenPairKey: 'XETHZUSD',
    } : undefined,
  };
  const getTicker = vi.spyOn(cache.krakenService, 'getTicker').mockResolvedValue({
    MALFORMED_UNLISTED: { a: [{ toString: null, valueOf: null }], b: ['99'] },
    XETHZUSD: ticker,
  });
  const rows = await priceCache.getBatch('openTrade', [listed], { restEligible: new Set([listed]) });
  expect(getTicker).toHaveBeenCalledWith('ETHUSD');
  expect(rows.get(listed)).toMatchObject({ bid: 98, ask: 102, sidesWriter: 'rest_batch' });
  expect(priceCache.get(listed)).toEqual(rows.get(listed));
  expect(priceCache.get('MALFORMED_UNLISTED')).toBeNull();
});

it('grades only the direct adapter response tied to the frozen pair while preserving both quote decisions', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(axios, 'get').mockResolvedValue({ data: { error: [], result: {
    XBTUSD: metadata('XBTUSD', 'OLD-WS', 'XXBT'),
    XXBTZUSD: metadata('XXBTZUSD', 'XBT/USD', 'XXBT'),
  } } });
  await krakenAssetPairsService.refresh();
  expect(krakenAssetPairsService.resolveByInternal(symbol)?.krakenPairKey).toBe('XXBTZUSD');
  expect(krakenAssetPairsService.resolveByKrakenKey('XBTUSD')?.krakenPairKey).toBe('XBTUSD');

  const diagnostics = new KrakenPriceSourceDiagnostics(krakenAssetPairsService);
  diagnostics.bindCache(() => []);
  diagnostics.startIfReady();
  vi.spyOn(krakenPriceSourceDiagnostics, 'recordAssignment')
    .mockImplementation((...args) => diagnostics.recordAssignment(...args));
  vi.spyOn(krakenPriceSourceDiagnostics, 'recordWalkOutcomes')
    .mockImplementation((...args) => diagnostics.recordWalkOutcomes(...args));
  const fetchQuote = livePricingAdapter as unknown as { fetchFromKrakenRest(key: string): Promise<unknown> };
  const fetchTicker = vi.spyOn(globalThis, 'fetch');

  for (const [responseKey, bid, ask] of [['XXBTZUSD', 98, 102], ['XBTUSD', 100, 104]] as const) {
    restRateLimiter.reset();
    fetchTicker.mockResolvedValueOnce(new Response(JSON.stringify({ error: [], result: {
      [responseKey]: { ...ticker, a: [String(ask), '1', '2'], b: [String(bid), '1', '3'] },
    } }), { status: 200 }));
    await expect(fetchQuote.fetchFromKrakenRest(symbol)).resolves.toMatchObject({ price: (bid + ask) / 2 });
    const row = priceCache.get(symbol);
    expect(row).toMatchObject({ bid, ask, sidesWriter: 'rest_adapter' });
    const selected = selectTouchPrice({
      book: null, bookEligible: true, bookTrusted: true,
      ticker: tickerLegFromCachedQuote(row), tickerBasis: 'ticker_bbo',
    }, Date.now(), { maxAgeMs: 15_000, maxSpreadFraction: 0.5 });
    expect(selected.ok).toBe(true);
    recordTouchSelection({ lane: 'active', stage: 'active_entry_fill', assetClass: 'crypto_spot' }, selected, symbol);
  }

  expect(fetchTicker).toHaveBeenCalledTimes(2);
  const recorded = diagnostics.snapshot(Date.now(), []);
  expect(recorded.coverage.symbols).toEqual([
    { symbol, inherited: {}, assigned: { rest_adapter: 1 }, gaps: { identity_change: 1 } },
  ]);
  expect(recorded.tracked).toContainEqual({
    key: 'active:crypto_spot:active_entry_fill:ladder',
    symbol, attempted: 2, byAcceptedSource: { 'ticker_bbo:rest_adapter': 2 },
  });

  const inherited = new KrakenPriceSourceDiagnostics(krakenAssetPairsService);
  inherited.bindCache(() => [[symbol, priceCache.get(symbol)!]]);
  inherited.startIfReady();
  expect(inherited.snapshot(Date.now(), []).coverage.symbols).toEqual([
    { symbol, inherited: {}, assigned: {}, gaps: { missing_provenance: 1 } },
  ]);
});
