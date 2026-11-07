/**
 * KD-19 P4 (objective K6; Langston Step-2 C-3) — the VTS exit walk prices over the bids the selection ACCEPTED, so a book
 * the trigger refused (stale, untrusted, absent) hands the walk nothing and the ticker rung answers instead.
 */
import { describe, it, expect } from 'vitest';
import {
  selectCryptoTouch, VTS_EXIT_TOUCH_MAX_AGE_MS, VTS_EXIT_TOUCH_MAX_SPREAD_FRACTION,
  type CryptoBookTop, type CryptoTouchReaders,
} from '../../core/trading/crypto-touch.js';

const NOW = 1_000_000_000;
const POLICY = { maxAgeMs: VTS_EXIT_TOUCH_MAX_AGE_MS, maxSpreadFraction: VTS_EXIT_TOUCH_MAX_SPREAD_FRACTION };
const bids = [{ price: 99.9, qty: 0.5 }, { price: 99.8, qty: 2 }];
const book = (ageMs: number): CryptoBookTop => ({ bids, asks: [{ price: 100.1, qty: 1 }], ageMs, updatedAtMs: NOW - ageMs });
const cached = { bid: 99.7, ask: 100.3, venueObservedAtMs: null, sidesCapturedAtMs: NOW - 1_000, sidesWriter: 'rest_poller' };
const readers = (b: CryptoBookTop | null, trusted = true): CryptoTouchReaders => ({
  normalize: (s) => s, getBook: () => b, isBookTrusted: () => trusted, getCached: () => cached,
});

describe('KD-19 P4 — acceptedBookBids', () => {
  it('a fresh book carries the selection ⇒ its levels, with sizes, are handed on', () => {
    const r = selectCryptoTouch('X/USD', readers(book(500)), NOW, POLICY);
    expect(r.selection.ok && r.selection.quote.basis).toBe('book_top');
    expect(r.acceptedBookBids).toEqual(bids);
  });
  it('⛔ C-3 NEGATIVE: a book older than the VTS exit ceiling hands on NOTHING and the ticker answers', () => {
    const r = selectCryptoTouch('X/USD', readers(book(VTS_EXIT_TOUCH_MAX_AGE_MS + 1)), NOW, POLICY);
    expect(r.selection.ok && r.selection.quote.basis).toBe('ticker_bbo');
    expect(r.acceptedBookBids).toBeNull();
  });
  it('an untrusted book hands on nothing', () => {
    expect(selectCryptoTouch('X/USD', readers(book(500), false), NOW, POLICY).acceptedBookBids).toBeNull();
  });
  it('no book hands on nothing', () => {
    expect(selectCryptoTouch('X/USD', readers(null), NOW, POLICY).acceptedBookBids).toBeNull();
  });
});
