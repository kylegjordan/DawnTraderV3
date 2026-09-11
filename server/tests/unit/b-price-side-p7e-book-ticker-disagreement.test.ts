// B-PRICE-SIDE-BY-JOB r5 — P-7e (decision D3; pre-audit A-9.7): the book-versus-ticker disagreement instrument, shipped
// RECORD-ONLY. A fire means our maintained order book drifted from Kraken's own top of book.
//
// THE CONTROLS THE PRE-AUDIT NAMES: the one-tick injection (every injected pair detected, none invented) and a negative
// control on normal delivery. The live probe's own result was 199 of 199 detected, 0 false; this replays the same shape
// through the in-process rule.
//
// POSITIVE CONTROL: the module does not exist before P-7e. The behavioural controls are mutations, recorded in the Step 4
// change list: firing on the first disagreement fails test 2; letting an unaligned frame reset the streak fails test 4;
// a two-tick threshold fails test 2; arming the alert fails test 7.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  observeBookTickerPair,
  buildBookTickerAlertCopy,
  getBookTickerDisagreementStats,
  __resetBookTickerForTest,
  BOOK_TICKER_ALERT_ARMED,
  type BookTickerObservation,
} from '../../services/market-data/book-ticker-disagreement.js';

const NOW = 1_700_000_000_000;
// BTC/USD, from the P-7i captured frame: bid 77825.8, ask 77825.9, tick 0.1.
const pair = (o: Partial<BookTickerObservation> = {}): BookTickerObservation => ({
  symbol: 'BTC/USD', tickerBid: 77825.8, tickerAsk: 77825.9, bookBid: 77825.8, bookAsk: 77825.9,
  bookReceivedAtMs: NOW - 40, tick: 0.1, ...o,
});

beforeEach(() => __resetBookTickerForTest());

describe('P-7e — the controls', () => {
  it('1. NEGATIVE CONTROL, normal delivery: identical sides never disagree and never fire', () => {
    for (let i = 0; i < 1000; i++) expect(observeBookTickerPair(pair(), NOW).verdict).toBe('agree');
    const s = getBookTickerDisagreementStats();
    expect(s.counts).toMatchObject({ aligned: 1000, agree: 1000, disagree: 0, fires: 0 });
  });

  it('2. ★ ONE-TICK INJECTION: every injected pair is detected, none invented, and isolated ones never fire', () => {
    let injected = 0;
    for (let i = 1; i <= 1000; i++) {
      const inject = i % 5 === 0;
      if (inject) injected++;
      const r = observeBookTickerPair(pair(inject ? { tickerBid: 77825.8 + 0.1 } : {}), NOW);
      expect(r.verdict).toBe(inject ? 'disagree' : 'agree');
    }
    const s = getBookTickerDisagreementStats();
    expect(injected).toBe(200);
    expect(s.counts.disagree).toBe(injected);
    expect(s.counts.agree).toBe(1000 - injected);
    expect(s.counts.fires).toBe(0);
  });
});

describe('P-7e — the rule', () => {
  it('3. three CONSECUTIVE disagreeing pairs fire exactly once; two then an agreement reset the streak', () => {
    const off = pair({ tickerAsk: 77826.1 });
    expect(observeBookTickerPair(off, NOW).verdict).toBe('disagree');
    expect(observeBookTickerPair(off, NOW).verdict).toBe('disagree');
    expect(observeBookTickerPair(pair(), NOW).verdict).toBe('agree');
    expect(observeBookTickerPair(off, NOW).verdict).toBe('disagree');
    expect(observeBookTickerPair(off, NOW).verdict).toBe('disagree');
    expect(observeBookTickerPair(off, NOW).verdict).toBe('fire');
    expect(observeBookTickerPair(off, NOW).verdict).toBe('disagree'); // no re-fire while the streak continues
    expect(getBookTickerDisagreementStats().firesBySymbol).toEqual({ 'BTC/USD': 1 });
  });

  it('4. an UNALIGNED frame neither extends nor resets the streak', () => {
    const off = pair({ tickerAsk: 77826.1 });
    observeBookTickerPair(off, NOW);
    observeBookTickerPair(off, NOW);
    expect(observeBookTickerPair(pair({ tickerAsk: 77826.1, bookReceivedAtMs: NOW - 5_000 }), NOW).verdict).toBe('unaligned');
    expect(observeBookTickerPair(off, NOW).verdict).toBe('fire');
  });

  it('5. crossed or locked books are excluded; no tick and non-positive sides are counted, not judged', () => {
    expect(observeBookTickerPair(pair({ bookBid: 77826, bookAsk: 77825.9 }), NOW).verdict).toBe('crossed_book');
    expect(observeBookTickerPair(pair({ bookBid: 77825.9, bookAsk: 77825.9 }), NOW).verdict).toBe('crossed_book');
    expect(observeBookTickerPair(pair({ tick: null }), NOW).verdict).toBe('no_tick');
    expect(observeBookTickerPair(pair({ tickerBid: 0 }), NOW).verdict).toBe('invalid');
    expect(getBookTickerDisagreementStats().counts).toMatchObject({ crossedBook: 2, noTick: 1, invalid: 1, aligned: 0 });
  });

  it('6. a sub-tick difference agrees; a one-tick move with floating-point residue still counts as one tick', () => {
    expect(observeBookTickerPair(pair({ symbol: 'X/USD', tickerBid: 10.004, bookBid: 10.0, tickerAsk: 10.2, bookAsk: 10.2, tick: 0.01 }), NOW).verdict).toBe('agree');
    // 77825.9 - 77825.8 is 0.09999999999854481 in binary floating point: one tick, not a sub-tick difference
    const r = observeBookTickerPair(pair({ tickerBid: 77825.9, tickerAsk: 77826.0 }), NOW);
    expect(r.verdict).toBe('disagree');
    expect(r.bidTicks).toBeCloseTo(1, 6);
  });
});

describe('P-7e — the alert: record-only, and about our book', () => {
  it('7. the alert is NOT armed, and its copy names local book maintenance rather than a venue disagreement', () => {
    expect(BOOK_TICKER_ALERT_ARMED).toBe(false);
    expect(getBookTickerDisagreementStats().rule).toMatchObject({ armed: false, subject: 'local book maintenance' });
    const c = buildBookTickerAlertCopy('BTC/USD', 1, 0);
    expect(c.body).toMatch(/OUR local book maintenance/);
    expect(c.body).toMatch(/not a disagreement between two venue feeds/i);
  });

  it('8. the crypto v2 ticker handler feeds the maintained book and the published tick, and gates any alert on the arm switch', () => {
    const src = readFileSync(resolve(__dirname, '../../exchanges/kraken/kraken-websocket-adapter.ts'), 'utf-8');
    const start = src.indexOf('private handleV2TickerUpdate(');
    const end = src.indexOf('private ', start + 30);
    const body = src.slice(start, end);
    expect(body).toContain('observeBookTickerPair(');
    expect(body).toContain('this.orderBooks.get(internalSymbol)');
    expect(body).toContain('this.bookUpdatedAt.get(internalSymbol)');
    // the BOOK's top, not the ticker's own sides handed back as the comparator
    expect(body).toContain('bookBid: Math.max(..._bk.bids.keys())');
    expect(body).toContain('bookAsk: Math.min(..._bk.asks.keys())');
    expect(body).toContain("resolveVenueGrid(internalSymbol, 'crypto_spot').tick");
    expect(body).toContain('if (BOOK_TICKER_ALERT_ARMED)');
  });
});
