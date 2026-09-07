/**
 * TICKER vs ORDER BOOK — the comparison Kyle asked for directly.
 *
 * ⛔ WHY IT IS AN IN-PROCESS PROBE AND NOT A QUERY: the order book is NEVER PERSISTED. It lives
 * in memory, only while the process runs, and only for symbols we hold or promote. The ticker IS
 * persisted. So no pair of stored rows exists to compare, and the two feeds can only be read
 * against each other at the same instant.
 *
 * ⛔⛔ THE READING IS ONE-DIRECTIONAL AND PRE-REGISTERED: divergence is DISPOSITIVE; agreement is
 * INCONCLUSIVE and may never be read as a licence, because both feeds coexist only on the hot set
 * — the most liquid names — which is exactly where they would agree anyway. No test here asserts
 * a tolerance, because choosing one would decide the answer by picking a bucket edge.
 *
 * THE PROPERTY THAT MATTERS MOST IS TEST 4: the two feeds CROSSED against each other. That is not
 * a difference of degree — it means one feed says you can sell where the other says you can buy,
 * and a level built on either is unsafe. It is counted separately so it can never be diluted into
 * a bucket alongside a one-basis-point rounding difference.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordFeedAgreement,
  getFeedAgreementRows,
  __resetFeedAgreementForTest,
} from '../../core/calculations/level-basis.js';

const row = (cls = 'crypto_spot') => getFeedAgreementRows().find((r) => r.assetClass === cls);

describe('ticker vs order book agreement', () => {
  beforeEach(() => __resetFeedAgreementForTest());

  it('1. ⛔ coverage outcomes are counted APART — "could not compare" is not "matched"', () => {
    recordFeedAgreement({ assetClass: 'crypto_spot', bookBid: 100, bookAsk: 101, tickerBid: 100, tickerAsk: 101 });
    recordFeedAgreement({ assetClass: 'crypto_spot', bookBid: 100, bookAsk: 101, tickerBid: null, tickerAsk: null });
    recordFeedAgreement({ assetClass: 'crypto_spot', bookBid: null, bookAsk: null, tickerBid: 100, tickerAsk: 101 });
    recordFeedAgreement({ assetClass: 'crypto_spot', bookBid: null, bookAsk: null, tickerBid: null, tickerAsk: null });
    const r = row()!;
    expect(r.bothPresent).toBe(1);
    expect(r.bookOnly).toBe(1);
    expect(r.tickerOnly).toBe(1);
    expect(r.neither).toBe(1);
    expect(r.attempted).toBe(4);
    // ⛔ THE DISCRIMINATING PART: only the comparable pair entered the histograms.
    expect(Object.values(r.bidHistogram).reduce((a, b) => a + b, 0)).toBe(1);
  });

  it('2. an exact match lands in the "exact" bucket, not a near bucket', () => {
    recordFeedAgreement({ assetClass: 'crypto_spot', bookBid: 100, bookAsk: 101, tickerBid: 100, tickerAsk: 101 });
    const r = row()!;
    expect(r.bidHistogram['exact']).toBe(1);
    expect(r.askHistogram['exact']).toBe(1);
    expect(r.bidDirection.exact).toBe(1);
    expect(r.maxBidBps).toBe(0);
  });

  it('3. a difference lands in the right basis-point bucket', () => {
    // ticker bid 100.03 vs book 100.00 -> 3 bp -> the 2-5bp bucket
    recordFeedAgreement({ assetClass: 'crypto_spot', bookBid: 100, bookAsk: 101, tickerBid: 100.03, tickerAsk: 101 });
    const r = row()!;
    expect(r.bidHistogram['2-5bp']).toBe(1);
    expect(r.bidDirection.tickerHigher).toBe(1);
    expect(r.maxBidBps).toBeCloseTo(3, 6);
  });

  it('4. ⛔ CROSSED feeds are counted separately — the qualitative failure, never diluted into a bucket', () => {
    // ticker bid (101.5) is ABOVE the book's ask (101) — you cannot sell above where you can buy.
    recordFeedAgreement({ assetClass: 'crypto_spot', bookBid: 100, bookAsk: 101, tickerBid: 101.5, tickerAsk: 102 });
    // and the mirror: ticker ask at/below the book's bid.
    recordFeedAgreement({ assetClass: 'crypto_spot', bookBid: 100, bookAsk: 101, tickerBid: 99, tickerAsk: 100 });
    const r = row()!;
    expect(r.crossedAgainstBook).toBe(2);
    // ⛔ THE DISCRIMINATING ASSERTION: they are ALSO still measured, not swallowed by the flag.
    expect(r.bothPresent).toBe(2);
  });

  it('5. a merely wide-but-uncrossed difference is NOT counted as crossed', () => {
    // 50 bp apart on both sides, but the ticker's bid is still below the book's ask.
    recordFeedAgreement({ assetClass: 'crypto_spot', bookBid: 100, bookAsk: 101, tickerBid: 100.5, tickerAsk: 101.5 });
    const r = row()!;
    expect(r.crossedAgainstBook).toBe(0);
    expect(r.bothPresent).toBe(1);
  });

  it('6. direction is COUNTED, not averaged — a two-sided spread must not cancel to zero', () => {
    recordFeedAgreement({ assetClass: 'crypto_spot', bookBid: 100, bookAsk: 101, tickerBid: 100.1, tickerAsk: 101 });
    recordFeedAgreement({ assetClass: 'crypto_spot', bookBid: 100, bookAsk: 101, tickerBid: 99.9, tickerAsk: 101 });
    const r = row()!;
    // An average of the two signed errors is 0 and would read as perfect agreement.
    expect(r.bidDirection.tickerHigher).toBe(1);
    expect(r.bidDirection.tickerLower).toBe(1);
    expect(r.bidDirection.exact).toBe(0);
  });

  it('7. a non-finite or non-positive side is treated as ABSENT, never as zero', () => {
    recordFeedAgreement({ assetClass: 'crypto_spot', bookBid: 100, bookAsk: 101, tickerBid: 0, tickerAsk: 101 });
    recordFeedAgreement({ assetClass: 'crypto_spot', bookBid: 100, bookAsk: 101, tickerBid: NaN, tickerAsk: 101 });
    const r = row()!;
    expect(r.bookOnly).toBe(2);
    expect(r.bothPresent).toBe(0);
  });

  it('8. asset classes never pool', () => {
    recordFeedAgreement({ assetClass: 'crypto_spot', bookBid: 100, bookAsk: 101, tickerBid: 100, tickerAsk: 101 });
    recordFeedAgreement({ assetClass: 'xstock_spot', bookBid: null, bookAsk: null, tickerBid: 50, tickerAsk: 51 });
    expect(getFeedAgreementRows()).toHaveLength(2);
    expect(row('crypto_spot')!.bothPresent).toBe(1);
    expect(row('xstock_spot')!.tickerOnly).toBe(1);
    expect(row('xstock_spot')!.bothPresent).toBe(0);
  });
});
