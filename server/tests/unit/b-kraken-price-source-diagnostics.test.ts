import { afterEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { readFileSync } from 'node:fs';
import { priceCache } from '../../services/price-cache.js';
import { krakenAssetPairsService } from '../../markets/kraken-asset-pairs-service.js';
import { getLevelBasisFunnel } from '../../core/calculations/level-basis.js';
import { recordTouchSelection, selectTouchPrice, tickerLegFromCachedQuote } from '../../core/calculations/touch-price.js';
import { buildFunnelSnapshotLine } from '../../services/level-basis-funnel-writer.js';
import {
  captureLevelBasisDiagnostics, krakenPriceSourceDiagnostics, KrakenPriceSourceDiagnostics,
} from '../../services/market-data/kraken-price-source-diagnostics.js';

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

it('keeps all seven real decision hooks connected to their quote or position identity', () => {
  const sites = {
    'active-execution-engine': { active_entry_fill: 'position.symbol', exit_trigger: '_lsSym' },
    'signal-orchestrator': { active_level_build: '_cbSym', active_signal_birth: 'symbol' },
    'vts-runner': { vts_signal_birth: 'symbol', vts_entry_fill: 'trade.symbol', vts_exit_trigger: 'trade.symbol' },
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
  const metadata = (altname: string, wsname: string, base: string) =>
    ({ altname, wsname, base, quote: 'ZUSD', status: 'online', aclass_base: 'currency', aclass_quote: 'currency' });
  vi.spyOn(axios, 'get').mockResolvedValue({ data: { error: [], result: {
    XXBTZUSD: metadata('XBTUSD', 'XBT/USD', 'XXBT'),
    XETHZUSD: metadata('ETHUSD', 'ETH/USD', 'XETH'),
  } } });

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

  const unknownKey = new KrakenPriceSourceDiagnostics(krakenAssetPairsService);
  unknownKey.bindCache(() => [['UNKNOWN-ALIAS', { symbol, sidesWriter: 'ws_ticker', sidesCapturedAtMs: 5000 }]]);
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
});
