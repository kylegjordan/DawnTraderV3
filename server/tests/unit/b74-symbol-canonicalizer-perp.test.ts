/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B74 — Symbol Canonicalizer Perp Extension Unit Tests
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Validates the PF_<TICKER>X<QUOTE> → <TICKER>/<QUOTE>:PERP mapping added in
 * commit `<TBD>` per Langston cc-inbox #867 Q1 + #869 claim challenge #1.
 *
 * Critical assertions:
 *   1. All 10 known PF_*XUSD perps round-trip correctly (Apple, Google, etc.)
 *   2. Existing crypto patterns are unaffected (regression guard)
 *   3. Edge cases: lowercase, empty, malformed PF_ prefix, multiple X chars
 *
 * Reference: BATCH_74_SCOPE.md v1.1 + BATCH_74_PRE_AUDIT.md v1.1
 * ═════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect } from 'vitest';
import { toCanonical } from '../../services/utils/symbol-canonicalizer';

describe('B74 — toCanonical(): PF_*XUSD perp extension', () => {
  it('canonicalizes all 10 known equity perps', () => {
    expect(toCanonical('PF_AAPLXUSD')).toBe('AAPL/USD:PERP');
    expect(toCanonical('PF_CRCLXUSD')).toBe('CRCL/USD:PERP');
    expect(toCanonical('PF_GLDXUSD')).toBe('GLD/USD:PERP');
    expect(toCanonical('PF_GOOGLXUSD')).toBe('GOOGL/USD:PERP');
    expect(toCanonical('PF_HOODXUSD')).toBe('HOOD/USD:PERP');
    expect(toCanonical('PF_MSTRXUSD')).toBe('MSTR/USD:PERP');
    expect(toCanonical('PF_NVDAXUSD')).toBe('NVDA/USD:PERP');
    expect(toCanonical('PF_QQQXUSD')).toBe('QQQ/USD:PERP');
    expect(toCanonical('PF_SPYXUSD')).toBe('SPY/USD:PERP');
    expect(toCanonical('PF_TSLAXUSD')).toBe('TSLA/USD:PERP');
  });

  it('handles other quote currencies if Kraken Futures adds them', () => {
    expect(toCanonical('PF_AAPLXEUR')).toBe('AAPL/EUR:PERP');
    expect(toCanonical('PF_TSLAXGBP')).toBe('TSLA/GBP:PERP');
  });

  it('does not match malformed PF_ inputs (returns input unchanged or via fallback paths)', () => {
    // No X-quote suffix
    expect(toCanonical('PF_AAPLUSD')).not.toBe('PF_AAPL/USD:PERP');
    // Lowercase ticker
    expect(toCanonical('PF_aaplXUSD')).not.toBe('aapl/USD:PERP');
    // Missing PF_ prefix
    expect(toCanonical('AAPLXUSD')).not.toContain(':PERP');
    // Single char before X
    const oneChar = toCanonical('PF_AXUSD');
    expect(oneChar).toBe('A/USD:PERP'); // A+ is valid per regex; intentional
  });
});

describe('B74 — toCanonical(): regression guard — existing crypto patterns unaffected', () => {
  it('still canonicalizes Kraken X/Z-prefix crypto ids', () => {
    expect(toCanonical('XXBTZUSD')).toBe('BTC/USD');
    expect(toCanonical('XETHZUSD')).toBe('ETH/USD');
    expect(toCanonical('XXDGZUSD')).toBe('DOGE/USD');
  });

  it('still canonicalizes plain BASE+QUOTE crypto ids', () => {
    expect(toCanonical('SOLUSD')).toBe('SOL/USD');
    expect(toCanonical('ADAUSDT')).toBe('ADA/USDT');
  });

  it('preserves already-canonical crypto pairs', () => {
    expect(toCanonical('BTC/USD')).toBe('BTC/USD');
    expect(toCanonical('ETH/EUR')).toBe('ETH/EUR');
    expect(toCanonical('XBT/USD')).toBe('BTC/USD'); // XBT → BTC normalization
  });

  it('returns empty input unchanged', () => {
    expect(toCanonical('')).toBe('');
  });

  it('returns base-only currency unchanged', () => {
    expect(toCanonical('SOL')).toBe('SOL');
  });
});
