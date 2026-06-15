/**
 * B-NAMES (2026-06-15) — asset-name resolver tests.
 *
 * Covers the PURE market-cap-gap disambiguation (the part Langston asked to
 * review) + the curated-name skip helper. The DB + CoinGecko network are not
 * exercised here; `../db.js` is stubbed so importing the resolver module is
 * side-effect-free.
 */
import { describe, it, expect, vi } from 'vitest';

// Stub the db layer so importing the resolver (which imports `../db.js`) does
// not open a real connection. We only test the pure exports.
vi.mock('../../db.js', () => ({ db: { execute: vi.fn() } }));

import {
  disambiguateByMarketCap,
  DISAMBIGUATION_DOMINANCE_MULTIPLE,
  DISAMBIGUATION_MIN_MCAP_FLOOR_USD,
} from '../../services/asset-name-resolver.js';
import { getCuratedCryptoName } from '../../../shared/asset-names.js';

describe('B-NAMES disambiguateByMarketCap', () => {
  it('0 candidates → hard_miss (symbol absent from /coins/list)', () => {
    expect(disambiguateByMarketCap([]).kind).toBe('hard_miss');
  });

  it('single candidate → resolved on identity (no collision possible)', () => {
    // Below the floor, but a lone listing has no collision risk → accept.
    const v = disambiguateByMarketCap([{ id: 'ripple', name: 'XRP Ledger', marketCap: 5_000_000 }]);
    expect(v).toMatchObject({ kind: 'resolved', id: 'ripple', name: 'XRP Ledger', reason: 'single-candidate' });
  });

  it('collision: dominant leader (≥ multiple × runner-up AND above floor) → resolved', () => {
    const v = disambiguateByMarketCap([
      { id: 'real', name: 'Real Project', marketCap: 1_000_000_000 },
      { id: 'clone', name: 'Clone Scam', marketCap: 1_000_000 },
    ]);
    expect(v).toMatchObject({ kind: 'resolved', id: 'real', name: 'Real Project', reason: 'dominant-leader' });
  });

  it('collision: leader below the absolute floor → ambiguous (skip→hide)', () => {
    // Leader 9M dominates 9× but is below the $10M floor → not confident enough.
    const v = disambiguateByMarketCap([
      { id: 'a', name: 'Dust A', marketCap: 9_000_000 },
      { id: 'b', name: 'Dust B', marketCap: 1_000_000 },
    ]);
    expect(v).toMatchObject({ kind: 'ambiguous', reason: 'leader-below-floor' });
  });

  it('collision: no clear leader (leader < multiple × runner-up) → ambiguous', () => {
    const v = disambiguateByMarketCap([
      { id: 'a', name: 'A', marketCap: 100_000_000 },
      { id: 'b', name: 'B', marketCap: 50_000_000 }, // only 2× → below the 5× dominance multiple
    ]);
    expect(v).toMatchObject({ kind: 'ambiguous', reason: 'no-clear-leader' });
  });

  it('null market caps are treated as 0 (a priced leader still wins over an unpriced clone)', () => {
    const v = disambiguateByMarketCap([
      { id: 'priced', name: 'Priced', marketCap: 500_000_000 },
      { id: 'unpriced', name: 'Unpriced Clone', marketCap: null },
    ]);
    expect(v).toMatchObject({ kind: 'resolved', id: 'priced' });
  });

  it('exposes the named disambiguation constants for governance review', () => {
    expect(DISAMBIGUATION_DOMINANCE_MULTIPLE).toBe(5);
    expect(DISAMBIGUATION_MIN_MCAP_FLOOR_USD).toBe(10_000_000);
  });
});

describe('B-NAMES getCuratedCryptoName (resolver skips already-curated symbols)', () => {
  it('returns the real curated name (case-insensitive)', () => {
    expect(getCuratedCryptoName('BTC')).toBe('Bitcoin');
    expect(getCuratedCryptoName('btc')).toBe('Bitcoin');
  });

  it('returns null for a ticker-echo placeholder so the resolver backfills it', () => {
    // CRYPTO_NAMES carries XRP:'XRP' and CHIP:'CHIP' — echoes, not real names.
    expect(getCuratedCryptoName('XRP')).toBeNull();
    expect(getCuratedCryptoName('CHIP')).toBeNull();
  });

  it('returns null for an unmapped symbol', () => {
    expect(getCuratedCryptoName('ZZZNOTACOIN')).toBeNull();
    expect(getCuratedCryptoName('')).toBeNull();
    expect(getCuratedCryptoName(null)).toBeNull();
  });
});
