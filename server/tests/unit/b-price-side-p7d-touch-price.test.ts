// B-PRICE-SIDE-BY-JOB r5 — P-7d (decision D3) and P-7f (decision D6): the touch price is chosen by rule — a valid fresh
// book top, then valid ticker sides within the age, otherwise REFUSE — and every age carries the clock it was measured on.
//
// ONE FIXTURE PER BRANCH, including "neither qualifies" (the pre-audit's verification for P-7d), and one per clock basis
// (P-7f's).
//
// POSITIVE CONTROL: the module does not exist before P-7d. The behavioural controls are mutations, recorded in the
// Step 4 change list: trying the ticker before the book fails test 1; ignoring `bookEligible` fails test 4; dropping
// the age from the policy check fails test 2.
import { describe, it, expect } from 'vitest';
import { selectTouchPrice, type TouchLegInput } from '../../core/calculations/touch-price.js';

const NOW = 1_700_000_000_000;
const POLICY = { maxAgeMs: 15_000, maxSpreadFraction: 0.5 };
const book = (o: Partial<TouchLegInput> = {}): TouchLegInput => ({
  bid: 100, ask: 100.2, stampMs: NOW - 1_000, clockBasis: 'receipt', producer: 'kraken_ws_book', ...o,
});
const ticker = (o: Partial<TouchLegInput> = {}): TouchLegInput => ({
  bid: 99.9, ask: 100.3, stampMs: NOW - 2_000, clockBasis: 'venue', producer: 'kraken_ws_ticker_mid', ...o,
});

describe('P-7d — the touch price, by D3 order', () => {
  it('1. a valid fresh book wins, even when the ticker is valid too', () => {
    const r = selectTouchPrice({ book: book(), bookEligible: true, ticker: ticker(), tickerBasis: 'ticker_bbo' }, NOW, POLICY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.quote).toEqual({ bid: 100, ask: 100.2, basis: 'book_top', ageMs: 1_000, clockBasis: 'receipt', producer: 'kraken_ws_book' });
    expect(r.bookRefusal).toBeNull();
  });

  it('2. a STALE book falls to the ticker, and says why', () => {
    const r = selectTouchPrice(
      { book: book({ stampMs: NOW - 20_000 }), bookEligible: true, ticker: ticker(), tickerBasis: 'ticker_bbo' }, NOW, POLICY,
    );
    expect(r.ok && r.quote.basis).toBe('ticker_bbo');
    expect(r.ok && r.bookRefusal).toBe('stale_book');
  });

  it('3. a CROSSED book falls to the ticker', () => {
    const r = selectTouchPrice(
      { book: book({ bid: 100.5, ask: 100.2 }), bookEligible: true, ticker: ticker(), tickerBasis: 'ticker_bbo' }, NOW, POLICY,
    );
    expect(r.ok && r.quote.basis).toBe('ticker_bbo');
    expect(r.ok && r.bookRefusal).toBe('crossed_book');
  });

  it('4. an INELIGIBLE book (xStock, pre-audit A-9.7) is never used, however good it looks', () => {
    const r = selectTouchPrice(
      { book: book(), bookEligible: false, ticker: ticker({ clockBasis: 'receipt', producer: 'kraken_equities_ws_mid' }), tickerBasis: 'ticker_default' },
      NOW, POLICY,
    );
    expect(r.ok && r.quote.basis).toBe('ticker_default');
    expect(r.ok && r.bookRefusal).toBe('book_not_eligible');
  });

  it('5. ★ NEITHER QUALIFIES: refuse, carrying both reasons — never a midpoint, never a fallback', () => {
    const r = selectTouchPrice(
      { book: book({ ask: null }), bookEligible: true, ticker: ticker({ stampMs: NOW - 60_000 }), tickerBasis: 'ticker_bbo' }, NOW, POLICY,
    );
    expect(r).toEqual({ ok: false, bookRefusal: 'one_sided_book', tickerRefusal: 'stale_book' });
  });

  it('6. nothing at all: both legs report no_book', () => {
    expect(selectTouchPrice({ book: null, bookEligible: true, ticker: null, tickerBasis: 'ticker_bbo' }, NOW, POLICY))
      .toEqual({ ok: false, bookRefusal: 'no_book', tickerRefusal: 'no_book' });
  });

  it('7. an implausibly WIDE ticker refuses rather than anchoring on it', () => {
    const r = selectTouchPrice(
      { book: null, bookEligible: true, ticker: ticker({ bid: 80, ask: 105 }), tickerBasis: 'ticker_default' }, NOW, { maxAgeMs: 15_000, maxSpreadFraction: 0.1 },
    );
    expect(r).toEqual({ ok: false, bookRefusal: 'no_book', tickerRefusal: 'implausible_spread' });
  });
});

describe('P-7f — the clock basis is a field, carried and never inferred', () => {
  it('8. the same stamp on a VENUE clock and on a RECEIPT clock yields the same age under different labels', () => {
    const venue = selectTouchPrice({ book: null, bookEligible: false, ticker: ticker({ clockBasis: 'venue' }), tickerBasis: 'ticker_bbo' }, NOW, POLICY);
    const receipt = selectTouchPrice({ book: null, bookEligible: false, ticker: ticker({ clockBasis: 'receipt' }), tickerBasis: 'ticker_bbo' }, NOW, POLICY);
    expect(venue.ok && receipt.ok).toBe(true);
    if (!venue.ok || !receipt.ok) return;
    expect(venue.quote.ageMs).toBe(receipt.quote.ageMs);
    expect(venue.quote.clockBasis).toBe('venue');
    expect(receipt.quote.clockBasis).toBe('receipt');
  });

  it('9. a venue stamp AHEAD of our clock refuses as age_unknown — no skew tolerance is invented', () => {
    const r = selectTouchPrice(
      { book: null, bookEligible: false, ticker: ticker({ stampMs: NOW + 50 }), tickerBasis: 'ticker_bbo' }, NOW, POLICY,
    );
    expect(r).toEqual({ ok: false, bookRefusal: 'book_not_eligible', tickerRefusal: 'age_unknown' });
  });

  it('10. a quote never carries a midpoint', () => {
    const r = selectTouchPrice({ book: book(), bookEligible: true, ticker: null, tickerBasis: 'ticker_bbo' }, NOW, POLICY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Object.keys(r.quote).sort()).toEqual(['ageMs', 'ask', 'basis', 'bid', 'clockBasis', 'producer']);
  });
});
