/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B74 — Universe Loader Unit Tests
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Tests the deterministic universe-selection logic without hitting Kraken's
 * live API. The dynamic crypto universe loader is exercised against a mock
 * fetch implementation that returns a controlled AssetPairs + Ticker response.
 *
 * Static universe loaders (xStocks, perps) read JSON configs and validate
 * the parsed shape.
 *
 * Reference: BATCH_74_SCOPE.md v1.1 + BATCH_74_PRE_AUDIT.md v1.1
 * ═════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  loadEquitySpotUniverse,
  loadEquityPerpUniverse,
  loadCryptoSpotUniverse,
} from '../../services/passive-archive/universe-loader';
import { seedXstockUniverse } from '../helpers/seed-xstock-universe.js';

// B-NEW-43 Phase 2 chunk 5 (2026-05-23): seed XSTOCK_SPOT_SYMBOLS via the
// same _replaceXstockUniverse() path the universe-service uses post-boot.
// loadEquitySpotUniverse reads from the in-memory XSTOCK_SPOT_SYMBOLS Set
// which is empty at module-load time (post-B79.0n.UNIVERSE-DISCOVERY).
beforeAll(() => {
  seedXstockUniverse();
});

describe('B74 — universe loader: static equity configs', () => {
  it('loads xStocks universe with at least 10 known symbols', async () => {
    const symbols = await loadEquitySpotUniverse();
    expect(Array.isArray(symbols)).toBe(true);
    expect(symbols.length).toBeGreaterThanOrEqual(10);
    // Spot-check a few that are guaranteed in the config
    expect(symbols).toContain('AAPL/USD');
    expect(symbols).toContain('GOOGL/USD');
    expect(symbols).toContain('TSLA/USD');
  });

  it('loads perp universe with all 10 verified PF_*XUSD symbols', async () => {
    const symbols = await loadEquityPerpUniverse();
    expect(symbols).toHaveLength(10);
    expect(symbols).toContain('PF_AAPLXUSD');
    expect(symbols).toContain('PF_TSLAXUSD');
    expect(symbols).toContain('PF_SPYXUSD');
  });
});

describe('B74 — universe loader: dynamic crypto universe', () => {
  // Build a mock fetch that simulates AssetPairs + Ticker responses
  function buildMockFetch(pairs: Record<string, any>, tickers: Record<string, any>) {
    return async (url: string | URL): Promise<Response> => {
      const u = url.toString();
      if (u.includes('AssetPairs')) {
        return {
          ok: true,
          json: async () => ({ result: pairs }),
        } as Response;
      }
      if (u.includes('Ticker')) {
        return {
          ok: true,
          json: async () => ({ result: tickers }),
        } as Response;
      }
      throw new Error(`unexpected fetch URL: ${u}`);
    };
  }

  it('filters out non-USD/USDT/USDC quotes', async () => {
    const pairs = {
      XXBTZUSD: { altname: 'XBTUSD', base: 'XXBT', quote: 'ZUSD', status: 'online' },
      XXBTZEUR: { altname: 'XBTEUR', base: 'XXBT', quote: 'ZEUR', status: 'online' }, // EUR — should drop
      XXBTZGBP: { altname: 'XBTGBP', base: 'XXBT', quote: 'ZGBP', status: 'online' }, // GBP — should drop
    };
    const tickers = {
      XXBTZUSD: { c: ['33800.00', '0.001'], v: ['1000', '50000'] },
    };
    const result = await loadCryptoSpotUniverse({
      fetchImpl: buildMockFetch(pairs, tickers) as any,
    });
    expect(result.symbols).toEqual(['BTC/USD']);
    expect(result.filterReasons.wrongQuote).toBe(2);
  });

  it('filters out pairs below 24h volume floor', async () => {
    const pairs = {
      AAAUSDT: { altname: 'AAAUSDT', base: 'AAA', quote: 'USDT', status: 'online' }, // dead
      BBBUSDT: { altname: 'BBBUSDT', base: 'BBB', quote: 'USDT', status: 'online' }, // alive
    };
    const tickers = {
      AAAUSDT: { c: ['0.001', '0'], v: ['0', '500'] },        // 0.001 × 500 = $0.50
      BBBUSDT: { c: ['1.50', '0'], v: ['0', '50000'] },        // 1.50 × 50000 = $75k
    };
    const result = await loadCryptoSpotUniverse({
      minVolumeFloorUsd: 10000,
      fetchImpl: buildMockFetch(pairs, tickers) as any,
    });
    expect(result.symbols).toEqual(['BBB/USDT']);
    expect(result.filterReasons.dead).toBe(1);
  });

  it('filters out offline pairs', async () => {
    const pairs = {
      LIVEUSD: { altname: 'LIVEUSD', base: 'LIVE', quote: 'USD', status: 'online' },
      DEADUSD: { altname: 'DEADUSD', base: 'DEAD', quote: 'USD', status: 'cancel_only' }, // offline
    };
    const tickers = {
      LIVEUSD: { c: ['100', '0'], v: ['0', '50000'] },
    };
    const result = await loadCryptoSpotUniverse({
      fetchImpl: buildMockFetch(pairs, tickers) as any,
    });
    expect(result.symbols).toEqual(['LIVE/USD']);
    expect(result.filterReasons.offline).toBe(1);
  });

  it('normalizes Kraken X-prefix bases (XBT → BTC, XDG → DOGE)', async () => {
    const pairs = {
      XXBTZUSD: { altname: 'XBTUSD', base: 'XXBT', quote: 'ZUSD', status: 'online' },
      XXDGZUSD: { altname: 'XDGUSD', base: 'XXDG', quote: 'ZUSD', status: 'online' },
    };
    const tickers = {
      XXBTZUSD: { c: ['33800', '0'], v: ['0', '50000'] },
      XXDGZUSD: { c: ['0.10', '0'], v: ['0', '10000000'] },
    };
    const result = await loadCryptoSpotUniverse({
      fetchImpl: buildMockFetch(pairs, tickers) as any,
    });
    expect(result.symbols).toContain('BTC/USD');
    expect(result.symbols).toContain('DOGE/USD');
  });

  it('returns empty universe when nothing passes filters', async () => {
    const pairs = {
      DEADEUR: { altname: 'DEADEUR', base: 'DEAD', quote: 'ZEUR', status: 'online' }, // wrong quote
    };
    const result = await loadCryptoSpotUniverse({
      fetchImpl: buildMockFetch(pairs, {}) as any,
    });
    expect(result.symbols).toEqual([]);
  });
});
