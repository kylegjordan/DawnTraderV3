/**
 * Unit tests for Symbol Canonicalizer
 */

import { toCanonical, toKrakenId, normalizeSymbolArray } from './symbol-canonicalizer';

describe('Symbol Canonicalizer', () => {
  describe('toCanonical', () => {
    it('should convert BTC/USD formats', () => {
      expect(toCanonical('XXBTZUSD')).toBe('BTC/USD');
      expect(toCanonical('BTC/USD')).toBe('BTC/USD');
      expect(toCanonical('BTCUSD')).toBe('BTC/USD');
    });

    it('should convert ETH/USDT formats', () => {
      expect(toCanonical('XETHZUSDT')).toBe('ETH/USDT');
      expect(toCanonical('ETH/USDT')).toBe('ETH/USDT');
      expect(toCanonical('ETHUSDT')).toBe('ETH/USDT');
    });

    it('should convert SOL/EUR formats', () => {
      expect(toCanonical('SOL/EUR')).toBe('SOL/EUR');
      expect(toCanonical('SOLEUR')).toBe('SOL/EUR');
    });

    it('should handle base currency only', () => {
      expect(toCanonical('ETH')).toBe('ETH');
      expect(toCanonical('BTC')).toBe('BTC');
    });

    it('should handle empty/invalid input', () => {
      expect(toCanonical('')).toBe('');
      expect(toCanonical(null as any)).toBe('');
    });
  });

  describe('toKrakenId', () => {
    it('should convert BTC/USD to Kraken format', () => {
      expect(toKrakenId('BTC/USD')).toBe('XXBTZZUSD');
    });

    it('should convert ETH/USD to Kraken format', () => {
      expect(toKrakenId('ETH/USD')).toBe('XETHZZUSD');
    });

    it('should handle already-Kraken format', () => {
      expect(toKrakenId('SOLUSD')).toBe('SOLUSD');
    });

    it('should handle invalid input', () => {
      expect(toKrakenId('')).toBe('');
      expect(toKrakenId('ETH')).toBe('ETH');
    });
  });

  describe('normalizeSymbolArray', () => {
    it('should normalize array of mixed formats', () => {
      const input = ['XXBTZUSD', 'ETH/USD', 'SOLEUR', 'BTC'];
      const expected = ['BTC/USD', 'ETH/USD', 'SOL/EUR', 'BTC'];
      expect(normalizeSymbolArray(input)).toEqual(expected);
    });

    it('should handle empty/null input', () => {
      expect(normalizeSymbolArray(null)).toEqual([]);
      expect(normalizeSymbolArray(undefined)).toEqual([]);
      expect(normalizeSymbolArray([])).toEqual([]);
    });

    it('should filter out empty strings', () => {
      const input = ['BTC/USD', '', 'ETH/USD'];
      const expected = ['BTC/USD', 'ETH/USD'];
      expect(normalizeSymbolArray(input)).toEqual(expected);
    });
  });
});
