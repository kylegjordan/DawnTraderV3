/**
 * KD-19 P3 (`B-PRICE-SIDE-BY-JOB`) — the top-of-book size rides WITH the sides it was stated with, and an unstated size is
 * `null`, never 0 (Langston Step-2 BLOCKER-2).
 */
import { describe, it, expect } from 'vitest';
import { priceCache, statedSize, sideSizesOf } from '../../services/price-cache.js';
import { tickerLegFromCachedQuote } from '../../core/calculations/touch-price.js';

const pc: any = priceCache;
const SYM = 'KD19TEST/USD';

describe('KD-19 P3 — statedSize / sideSizesOf', () => {
  it.each([[0, null], ['0', null], ['0.000', null], [-1, null], [Number.NaN, null], [undefined, null], [null, null], ['1.5', 1.5], [2, 2]])(
    'statedSize(%s) = %s', (x, want) => expect(statedSize(x)).toBe(want));
  it('neither side stated ⇒ null; one side stated ⇒ the other is null', () => {
    expect(sideSizesOf(0, undefined, 'exact')).toBeNull();
    expect(sideSizesOf('3.2', 0, 'exact')).toEqual({ bidQty: 3.2, askQty: null, basis: 'exact' });
  });
});

describe('KD-19 P3 — the cache binds the size to the sides', () => {
  it('a WS write with stated sides AND sizes stores both', () => {
    priceCache.updateFromWebSocket(SYM, 100, 99.9, 100.1, Date.now(), null, 'mid', null, 'ws_ticker', { bidQty: 0.5, askQty: 0.7, basis: 'exact' });
    expect(priceCache.get(SYM)?.sideSizes).toEqual({ bidQty: 0.5, askQty: 0.7, basis: 'exact' });
  });
  it('⛔ a later write with NEW sides but no size CLEARS the size — an old size never sits beside new prices', () => {
    priceCache.updateFromWebSocket(SYM, 100.5, 100.4, 100.6, Date.now(), null, 'mid', null, 'ws_ticker', null);
    expect(priceCache.get(SYM)?.bid).toBe(100.4);
    expect(priceCache.get(SYM)?.sideSizes).toBeNull();
  });
  it('a write that states NO sides carries the row\'s sides AND their sizes together', () => {
    priceCache.updateFromWebSocket(SYM, 100, 99.9, 100.1, Date.now(), null, 'mid', null, 'ws_ticker', { bidQty: 0.5, askQty: 0.7, basis: 'exact' });
    priceCache.updateFromWebSocket(SYM, 101, null, null, null, null, 'last', 101, null, { bidQty: 9, askQty: 9, basis: 'exact' });
    const row = priceCache.get(SYM)!;
    expect(row.bid).toBe(99.9);
    expect(row.sideSizes).toEqual({ bidQty: 0.5, askQty: 0.7, basis: 'exact' });
  });
  it('updateFromRest stores the stated sizes with the stated sides, and clears them on sides without sizes', () => {
    priceCache.updateFromRest(SYM, 100, 'mid', null, { bid: 99, ask: 101, capturedAtMs: Date.now(), writer: 'rest_adapter', sizes: { bidQty: 3, askQty: 4, basis: 'rest_rounded_up' } });
    expect(priceCache.get(SYM)?.sideSizes).toEqual({ bidQty: 3, askQty: 4, basis: 'rest_rounded_up' });
    priceCache.updateFromRest(SYM, 100, 'mid', null, { bid: 98, ask: 102, capturedAtMs: Date.now(), writer: 'rest_adapter', sizes: null });
    expect(priceCache.get(SYM)?.sideSizes).toBeNull();
  });
  it('the REST ticker row reads b[2]/a[2] and labels them rounded-up; an absent size is null, not 0', () => {
    const row = pc.restTickerRow(SYM, SYM, { b: ['99', '6', '6.000'], a: ['101', '2', '2.000'], c: ['100'] }, 'rest_poller', Date.now());
    expect(row.sideSizes).toEqual({ bidQty: 6, askQty: 2, basis: 'rest_rounded_up' });
    const row2 = pc.restTickerRow(SYM, SYM, { b: ['99'], a: ['101'], c: ['100'] }, 'rest_poller', Date.now());
    expect(row2.sideSizes).toBeNull();
  });
  it('the ticker leg carries the bid size and its basis to the touch selection', () => {
    const leg = tickerLegFromCachedQuote({ bid: 99, ask: 101, venueObservedAtMs: null, sidesCapturedAtMs: 1, sidesWriter: 'rest_poller', sideSizes: { bidQty: 6, askQty: 2, basis: 'rest_rounded_up' } });
    expect(leg).toMatchObject({ bidQty: 6, sizeBasis: 'rest_rounded_up' });
    expect(tickerLegFromCachedQuote({ bid: 99, ask: 101, venueObservedAtMs: null, sidesCapturedAtMs: 1, sidesWriter: 'ws_ticker' }))
      .toMatchObject({ bidQty: null, sizeBasis: null });
  });
});
