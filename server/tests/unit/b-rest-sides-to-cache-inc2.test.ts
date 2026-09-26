// B-REST-SIDES-TO-CACHE (PHASE_19_PLAN row 3n.l) increment 2 — P6/P7 (OBJ-1..3: the REST adapter's writer takes the
// sides it read, pairwise), P8 (OBJ-12: one pairwise side predicate for every producer), P9 (OBJ-13: the "venue pushed"
// field stops moving at the REST fallback and at dual-key REST writes; its counters count instruments), P11 (OBJ-14:
// the sides' writer is named by channel and labels the ticker leg), P12 (OBJ-7: the ticker rung's acceptances split by
// the book's verdict). Plan: `B_REST_SIDES_TO_CACHE_PRE_AUDIT.md` Part B §9.
//
// POSITIVE CONTROL: against the code before this increment, `updateFromRest` takes no sides, the ticker emit states one
// side alone, `updateCache` routes the engine's REST fallback through the WS writer, the dual-key write shares one object,
// the counters count keys, `sidesWriter` is the single literal `ws`, and the funnel has no book-verdict split — every
// test below fails.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { priceCache } from '../../services/price-cache.js';
import { livePricingAdapter, sidesWriterOfProducer } from '../../services/live-pricing-adapter.js';
import { krakenWebSocketAdapter } from '../../exchanges/kraken/kraken-websocket-adapter.js';
import { pairwiseStatedSides } from '../../services/market-data/stated-sides.js';
import { MARK_KIND_BY_PRODUCER } from '../../services/market-data/price-basis.js';
import { normalizeToInternalSymbol } from '../../markets/kraken-symbol-resolver.js';
import { restRateLimiter } from '../../services/market-data/rest-rate-limiter.js';
import { selectTouchPrice, recordTouchSelection, tickerLegFromCachedQuote, type TouchLegInput } from '../../core/calculations/touch-price.js';
import {
  buildLevelBasis,
  getLevelBasisFunnelRow,
  __resetLevelBasisFunnelForTest,
  recordFeedAgreement,
  getFeedAgreementRows,
} from '../../core/calculations/level-basis.js';

const pc: any = priceCache;
const lpa: any = livePricingAdapter;
const kwa: any = krakenWebSocketAdapter;
const SYM = 'ZZINC2/USD';

beforeAll(() => {
  pc.shutdown(); // stop the refresh and health timers: these tests drive the writers directly
});

beforeEach(() => {
  restRateLimiter.reset(); // each REST test is one fetch; a per-symbol cooldown must not re-serve instead of writing
});

afterEach(() => {
  for (const k of [SYM, 'XBT/USD', 'BTC/USD']) pc.cache.delete(k);
  for (const b of pc.buckets) b.symbols.clear();
  vi.restoreAllMocks();
});

/** A warm row, as the WS writer leaves it after a two-sided push. */
function seedWsRow(sym: string, venueAt: number) {
  pc.updateFromWebSocket(sym, 100, 99.9, 100.1, venueAt + 5, venueAt, 'mid', null, 'ws_ticker');
  return pc.getCachedPrice(sym);
}

describe('P6 — `updateFromRest` takes the sides its caller read (OBJ-1, OBJ-3)', () => {
  it('1. a stated pair wins: sides, receipt stamp and the CALLER\'s writer tag; the venue stamp is cleared, not carried', () => {
    const before = seedWsRow(SYM, 1_000);
    expect(before.venueObservedAtMs).toBe(1_000); // control: the prior row carries a venue stamp
    pc.updateFromRest(SYM, 100.05, 'mid', null, { bid: 100.0, ask: 100.1, capturedAtMs: 5_000, writer: 'rest_adapter' });
    const row = pc.getCachedPrice(SYM);
    expect(row).toMatchObject({ bid: 100.0, ask: 100.1, sidesCapturedAtMs: 5_000, venueObservedAtMs: null, sidesWriter: 'rest_adapter', lastSource: 'kraken_rest' });
    expect(row.lastWsMessageAtMs).toBe(before.lastWsMessageAtMs); // a REST write is not a push
    expect(tickerLegFromCachedQuote(row)).toMatchObject({ clockBasis: 'receipt', producer: 'rest_adapter' });
  });

  it('2. ⛔ the arm that must NOT move: no sides stated ⇒ sides, both stamps and the writer are all untouched', () => {
    const before = seedWsRow(SYM, 1_000);
    pc.updateFromRest(SYM, 100.2, 'last', null, null);
    const row = pc.getCachedPrice(SYM);
    for (const f of ['bid', 'ask', 'sidesCapturedAtMs', 'venueObservedAtMs', 'sidesWriter', 'lastWsMessageAtMs']) {
      expect(row[f]).toBe(before[f]);
    }
    expect(row.price).toBe(100.2); // control: the write did happen
  });

  it('3. a cold row with no sides stated gets the legacy pair, which the ladder refuses as synthetic (N-10)', () => {
    pc.updateFromRest(SYM, 50, 'last', null, null);
    const row = pc.getCachedPrice(SYM);
    expect(row).toMatchObject({ bid: 50, ask: 50, sidesCapturedAtMs: null, sidesWriter: null });
    const r = buildLevelBasis({ bid: row.bid, ask: row.ask, capturedAtMs: 1, producer: 'x' } as any, 2, 60_000, 0.5);
    expect(r).toMatchObject({ ok: false, reason: 'locked_or_synthetic_book' });
  });
});

describe('P7 + P8 — every side producer writes both sides or neither (OBJ-2, OBJ-12)', () => {
  it('4. the predicate: both finite and positive, or null; a crossed pair is NOT filtered (the ladder counts it)', () => {
    expect(pairwiseStatedSides(1, 2)).toEqual({ bid: 1, ask: 2 });
    expect(pairwiseStatedSides(2, 1)).toEqual({ bid: 2, ask: 1 });
    for (const [b, a] of [[0, 2], [1, 0], [-1, 2], [NaN, 2], [1, Infinity], [null, 2], [undefined, 2], ['1' as any, 2]]) {
      expect(pairwiseStatedSides(b as any, a as any)).toBeNull();
    }
  });

  it('5. the adapter REST read with a zero bid states NO sides: the warm row keeps its sides and stamps', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const before = seedWsRow(SYM, 1_000);
    const body = { error: [], result: { ZZINC2USD: { a: ['101', '1', '1.000'], b: ['0', '1', '1.000'], c: ['100.5', '0.1'] } } };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
    await lpa.fetchFromKrakenRest(SYM);
    const row = pc.getCachedPrice(SYM);
    expect(row.price).toBe(100.5); // control: the write happened (one-sided ⇒ the last trade is the mark)
    for (const f of ['bid', 'ask', 'sidesCapturedAtMs', 'venueObservedAtMs', 'sidesWriter']) expect(row[f]).toBe(before[f]);
  });

  it('6. the adapter REST read with both sides states them, named `rest_adapter`, on the receipt clock', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const body = { error: [], result: { ZZINC2USD: { a: ['101', '1', '1.000'], b: ['99', '1', '1.000'], c: ['98.5', '0.1'] } } };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
    const t0 = Date.now();
    await lpa.fetchFromKrakenRest(SYM);
    const row = pc.getCachedPrice(SYM);
    expect(row).toMatchObject({ bid: 99, ask: 101, venueObservedAtMs: null, sidesWriter: 'rest_adapter' });
    expect(row.sidesCapturedAtMs).toBeGreaterThanOrEqual(t0);
  });

  it('7. the v2 ticker emit with one non-positive side emits NEITHER side', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(kwa, 'mapKrakenPairToInternalSymbol').mockReturnValue(SYM);
    const events: any[] = [];
    vi.spyOn(kwa, 'emitPriceTick').mockImplementation((e: any) => { events.push(e); });
    kwa.handleV2TickerUpdate({ data: [{ symbol: 'ZZINC2/USD', bid: 0, ask: 100.2, last: 100.1 }] });
    kwa.handleV2TickerUpdate({ data: [{ symbol: 'ZZINC2/USD', bid: 100.0, ask: 100.2, last: 100.1 }] });
    expect(events.length).toBe(2); // control: both frames reached the emit
    expect(events[0]).toMatchObject({ bid: null, ask: null });
    expect(events[1]).toMatchObject({ bid: 100.0, ask: 100.2 });
  });

  it('16. the cache\'s own REST ticker sites write a zero side as NO sides: the warm row keeps its sides and stamps', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const before = seedWsRow(SYM, 1_000);
    pc.krakenService.getTicker = vi.fn().mockResolvedValue({
      ZZINC2USD: { a: ['101', '1', '1'], b: ['0', '1', '1'], c: ['100.5', '0.1'], v: ['1', '1'], h: ['1', '1'], l: ['1', '1'] },
    });
    const bucket = pc.buckets.find((x: any) => x.type === 'openTrade');
    bucket.symbols = new Set([SYM]);
    await pc.refreshBucket(bucket, Date.now());
    const row = pc.getCachedPrice(SYM);
    expect(row.price).toBe(100.5); // control: the pass wrote this row
    for (const f of ['bid', 'ask', 'sidesCapturedAtMs', 'venueObservedAtMs', 'sidesWriter']) expect(row[f]).toBe(before[f]);
  });

  it('8. the book-top guard uses the same predicate (source fence: a NaN level key no longer passes `<= 0`)', () => {
    const src = readFileSync(resolve(__dirname, '../../exchanges/kraken/kraken-websocket-adapter.ts'), 'utf-8');
    expect(src).toContain('if (!pairwiseStatedSides(bestBid, bestAsk)) {');
    expect(src).not.toContain('if (bestBid <= 0 || bestAsk <= 0) {\n        continue;');
    expect(src).not.toMatch(/if \(bestBid <= 0 \|\| bestAsk <= 0\) \{\r?\n\s+continue;/);
  });
});

describe('P9 — the "venue pushed" field moves only on a push, and its counters count instruments (OBJ-13)', () => {
  it('9. the engine REST fallback through `updateCache` no longer labels the row `kraken_ws` or advances the push field', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const before = seedWsRow(SYM, 1_000);
    lpa.updateCache(SYM, 100.3, 'kraken_rest', 'kraken_rest_engine_fallback_mid', null, null, null, null, 100.29);
    const row = pc.getCachedPrice(SYM);
    expect(row.price).toBe(100.3); // control: the write happened
    expect(row.lastSource).toBe('kraken_rest');
    expect(row.lastWsMessageAtMs).toBe(before.lastWsMessageAtMs);
    // and a genuine push through the same hop still advances it
    lpa.updateCache(SYM, 100.4, 'kraken_ws', 'kraken_ws_ticker_mid', 100.35, 100.45, Date.now(), null, null);
    expect(pc.getCachedPrice(SYM).lastSource).toBe('kraken_ws');
  });

  it('10. a dual-key REST write gives each key its OWN push time, not the normalised key\'s', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(normalizeToInternalSymbol('XBT/USD')).toBe('BTC/USD'); // precondition: a requested spelling that differs
    expect(normalizeToInternalSymbol('XXBTZUSD')).toBe('BTC/USD');
    pc.cache.set('XBT/USD', { ...seedWsRow('XBT/USD', 1_000), lastWsMessageAtMs: 111 });
    pc.cache.set('BTC/USD', { ...seedWsRow('BTC/USD', 1_000), lastWsMessageAtMs: 222 });
    pc.krakenService.getTicker = vi.fn().mockResolvedValue({
      XXBTZUSD: { a: ['101', '1', '1'], b: ['99', '1', '1'], c: ['100', '0.1'], v: ['1', '1'], h: ['1', '1'], l: ['1', '1'] },
    });
    const bucket = pc.buckets.find((b: any) => b.type === 'openTrade');
    bucket.symbols = new Set(['XBT/USD']);
    await pc.refreshBucket(bucket, Date.now());
    expect(pc.getCachedPrice('XBT/USD').bid).toBe(99); // control: the requested key was written
    expect(pc.getCachedPrice('XBT/USD').lastWsMessageAtMs).toBe(111);
    expect(pc.getCachedPrice('BTC/USD').lastWsMessageAtMs).toBe(222);
  });

  it('11. two keys for one instrument count once; a second instrument counts (both counters)', () => {
    pc.clear(); // isolate the singleton for a whole-cache count
    const now = Date.now();
    seedWsRow('XBT/USD', 1_000);
    seedWsRow('BTC/USD', 1_000);
    expect(pc.cache.size).toBe(2); // two KEYS
    expect(pc.countSymbolsWithWsMessageSince(now - 1)).toBe(1); // one instrument
    expect(pc.countSymbolsWithMessageSince(now - 1)).toBe(1);
    seedWsRow(SYM, 1_000);
    expect(pc.countSymbolsWithWsMessageSince(now - 1)).toBe(2); // control: a second instrument does count
    expect(pc.countSymbolsWithMessageSince(now - 1)).toBe(2);
  });
});

describe('P11 — the sides\' writer is named by channel, from the caller (OBJ-14)', () => {
  it('12. every cached producer has a declared writer; the ticker and book channels are told apart through `updateCache`', () => {
    const cached = Object.keys(MARK_KIND_BY_PRODUCER).filter(p => p !== 'no_price_produced' && p !== 'position_entry_price_reused');
    for (const p of cached) expect(sidesWriterOfProducer(p as any)).not.toBe(undefined);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    lpa.updateCache(SYM, 100, 'kraken_ws', 'kraken_ws_ticker_mid', 99.9, 100.1, Date.now(), null, null);
    expect(pc.getCachedPrice(SYM).sidesWriter).toBe('ws_ticker');
    lpa.updateCache(SYM, 100, 'kraken_ws', 'kraken_ws_book_mid', 99.95, 100.05, Date.now(), null, null);
    expect(pc.getCachedPrice(SYM).sidesWriter).toBe('ws_book');
  });

  it('13. the census counts every writer as a number (Step-2 C1: no `NaN` for a writer the table forgot)', () => {
    seedWsRow(SYM, 1_000);
    pc.updateFromWebSocket('BTC/USD', 100, 99.9, 100.1, 1, null, 'mid', null, 'ws_book');
    pc.updateFromRest('XBT/USD', 100, 'mid', null, { bid: 99, ask: 101, capturedAtMs: 1, writer: 'rest_engine' });
    const line: string = pc.sidesWriterCensus([SYM, 'BTC/USD', 'XBT/USD', 'NOPE/USD']);
    expect(line).not.toContain('NaN');
    expect(line).toContain('ws_ticker:1');
    expect(line).toContain('ws_book:1');
    expect(line).toContain('rest_engine:1');
    expect(line).toContain('none:1');
  });

  it('14. the feed-agreement split keys on the sides\' writer: ticker channel, book echo, REST, legacy, unknown', () => {
    const cls = 'zz_inc2_agreement';
    const base = { assetClass: cls, bookBid: 100, bookAsk: 100.2, tickerBid: 100, tickerAsk: 100.2 };
    for (const src of ['ws_ticker', 'ws_book', 'rest_adapter', 'ws', null]) recordFeedAgreement({ ...base, tickerSidesSource: src });
    const row: any = getFeedAgreementRows().find(r => r.assetClass === cls);
    expect(row).toMatchObject({ bothPresent: 5, bothPresentTickerWsTicker: 1, bothPresentTickerWsBook: 1, bothPresentTickerRest: 1, bothPresentTickerWs: 1, bothPresentTickerUnknown: 1 });
  });
});

describe('P12 — the ticker rung\'s acceptances split by the book\'s verdict (OBJ-7)', () => {
  const NOW = 1_700_000_000_000;
  const POLICY = { maxAgeMs: 15_000, maxSpreadFraction: 0.5 };
  const LANE = { lane: 'active' as const, assetClass: 'crypto_spot', stage: 'active_signal_birth' as const };
  const book = (o: Partial<TouchLegInput> = {}): TouchLegInput => ({ bid: 100, ask: 100.2, stampMs: NOW - 1_000, clockBasis: 'receipt', producer: 'b', ...o });
  const ticker = (o: Partial<TouchLegInput> = {}): TouchLegInput => ({ bid: 99.9, ask: 100.3, stampMs: NOW - 2_000, clockBasis: 'receipt', producer: 'rest_adapter', ...o });
  const walk = (i: Parameters<typeof selectTouchPrice>[0]) => recordTouchSelection(LANE, selectTouchPrice(i, NOW, POLICY));
  beforeEach(() => __resetLevelBasisFunnelForTest());

  it('15. no book / ineligible book / stale book each land in their own cell; a book-carried walk lands in none', () => {
    walk({ book: null, bookEligible: true, ticker: ticker(), tickerBasis: 'ticker_bbo' });
    walk({ book: book(), bookEligible: false, ticker: ticker(), tickerBasis: 'ticker_bbo' });
    walk({ book: book({ stampMs: NOW - 60_000 }), bookEligible: true, ticker: ticker(), tickerBasis: 'ticker_bbo' });
    walk({ book: book(), bookEligible: true, ticker: ticker(), tickerBasis: 'ticker_bbo' });
    const ladder: any = getLevelBasisFunnelRow({ ...LANE, rung: 'ladder' });
    expect(ladder.accepted).toBe(4); // control: every walk was accepted
    expect(ladder.tickerAcceptedByBookVerdict).toEqual({ book_absent: 1, book_not_eligible: 1, book_refused: 1 });
    expect(ladder.byAcceptedSource['ticker_bbo:rest_adapter']).toBe(3); // the increment's own effect, by name
    const bookRow: any = getLevelBasisFunnelRow({ ...LANE, rung: 'book' });
    expect(bookRow.tickerAcceptedByBookVerdict).toEqual({ book_absent: 0, book_not_eligible: 0, book_refused: 0 });
  });
});
