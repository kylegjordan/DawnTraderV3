/**
 * B79.0g — Open VTS trade persistence tests.
 *
 * Mocks the db layer; verifies SQL shape + bootstrap re-resolve behavior.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock db.execute → record args
const dbCalls: Array<{ sql: string; params: any[] }> = [];
const mockExecute = vi.fn(async (q: any) => {
  // q is a drizzle SQL template — capture the queryChunks for inspection
  const sqlText = (q?.queryChunks ?? []).map((c: any) => c?.value ?? c).join(' ');
  const params = q?.params ?? [];
  dbCalls.push({ sql: sqlText, params });
  // For the rehydrate SELECT, return an empty array; for COUNT, return 0
  if (sqlText.toUpperCase().includes('SELECT COUNT')) {
    return { rows: [{ count: '0' }] } as any;
  }
  if (sqlText.toUpperCase().includes('SELECT ID, SYMBOL')) {
    return { rows: [] } as any;
  }
  return { rows: [] } as any;
});

vi.mock('../../db.js', () => ({
  db: { execute: (q: any) => mockExecute(q) },
}));

// Mock safeResolveAssetClass for bootstrap test — proves we re-resolve.
const resolverCalls: Array<{ symbol: string; exchange: string }> = [];
vi.mock('../../../shared/asset-classes.js', async () => {
  const actual = await vi.importActual<any>('../../../shared/asset-classes.js');
  return {
    ...actual,
    safeResolveAssetClass: (symbol: string, exchange: string) => {
      resolverCalls.push({ symbol, exchange });
      // Mimic post-B79.0f resolver: SUI/USD → crypto_spot (NOT xstock_spot).
      if (symbol === 'SUI/USD') return 'crypto_spot';
      if (symbol === 'AAPL/USD') return 'xstock_spot';
      if (symbol === 'BTC/USD') return 'crypto_spot';
      return null;
    },
  };
});

import {
  insertOpenTrade,
  deleteOpenTrade,
  rehydrateOpenTrades,
  bootstrapOpenTradesFromMemory,
  type OpenVirtualTradeRecord,
} from '../../services/vts-trade-persistence.js';

function makeTrade(symbol: string, assetClass: string): OpenVirtualTradeRecord {
  return {
    id: `t_${symbol}_${Math.random()}`,
    symbol,
    assetClass: assetClass as any,
    entryPrice: 100, stopLoss: 95, takeProfit: 110,
    positionSize: 1, dollarValue: 100, quantity: 1,
    regime: 'TREND_FRIENDLY_STABLE',
    signalType: 'QUANT',
    strategy: 'strong_bull_trend',
    pool: 'rotational',
    openedAt: Date.now(),
    finalScore: 0.5,
  };
}

describe('B79.0g — vts-trade-persistence', () => {
  beforeEach(() => {
    dbCalls.length = 0;
    resolverCalls.length = 0;
    mockExecute.mockClear();
  });

  describe('insertOpenTrade', () => {
    it('issues an INSERT with explicit columns + JSONB context', async () => {
      const trade = makeTrade('BTC/USD', 'crypto_spot');
      await insertOpenTrade(trade);
      expect(mockExecute).toHaveBeenCalledTimes(1);
      const call = dbCalls[0];
      expect(call.sql).toMatch(/INSERT INTO vts_open_trades/i);
    });
  });

  describe('deleteOpenTrade', () => {
    it('issues DELETE WHERE id = trade-id', async () => {
      await deleteOpenTrade('t_abc');
      expect(mockExecute).toHaveBeenCalledTimes(1);
      const call = dbCalls[0];
      expect(call.sql).toMatch(/DELETE FROM vts_open_trades WHERE id = /i);
    });
  });

  describe('rehydrateOpenTrades', () => {
    it('issues SELECT and returns empty list when table empty', async () => {
      const rows = await rehydrateOpenTrades();
      expect(rows).toEqual([]);
      expect(mockExecute).toHaveBeenCalledTimes(1);
    });
  });

  describe('bootstrapOpenTradesFromMemory', () => {
    it('returns null when table is non-empty', async () => {
      // Override mock: count = 5 (non-empty)
      mockExecute.mockImplementationOnce(async () => ({ rows: [{ count: '5' }] } as any));
      const result = await bootstrapOpenTradesFromMemory([makeTrade('BTC/USD', 'crypto_spot')]);
      expect(result).toBeNull();
    });

    it('re-resolves asset_class via safeResolveAssetClass — defeats stale legacy values', async () => {
      // Trade carries STALE assetClass='xstock_spot' from pre-B79.0f resolver.
      // bootstrapOpenTradesFromMemory must re-resolve to crypto_spot.
      const staleTrade = makeTrade('SUI/USD', 'xstock_spot');
      await bootstrapOpenTradesFromMemory([staleTrade]);

      // Verify re-resolve was called.
      expect(resolverCalls).toContainEqual({ symbol: 'SUI/USD', exchange: 'kraken' });

      // Verify INSERT was called with the corrected asset_class (crypto_spot, not xstock_spot).
      const insertCall = dbCalls.find((c) => c.sql.includes('INSERT INTO vts_open_trades'));
      expect(insertCall).toBeDefined();
      expect(insertCall!.params).toContain('crypto_spot');
      expect(insertCall!.params).not.toContain('xstock_spot');
    });

    it('skips trades whose symbol fails resolver (returns null)', async () => {
      const unresolvable = makeTrade('UNKNOWN/USD', 'crypto_spot');
      const result = await bootstrapOpenTradesFromMemory([unresolvable]);
      expect(result).toBe(0);
      // No INSERT should have happened (only the COUNT check).
      const inserts = dbCalls.filter((c) => c.sql.includes('INSERT INTO vts_open_trades'));
      expect(inserts.length).toBe(0);
    });

    it('seeds multiple trades when table is empty', async () => {
      const trades = [
        makeTrade('SUI/USD', 'xstock_spot'),  // stale → re-resolves to crypto_spot
        makeTrade('AAPL/USD', 'xstock_spot'), // stays xstock_spot
        makeTrade('BTC/USD', 'crypto_spot'),
      ];
      const result = await bootstrapOpenTradesFromMemory(trades);
      expect(result).toBe(3);

      // 3 distinct re-resolves
      expect(resolverCalls.length).toBe(3);
      // 3 INSERTs
      const inserts = dbCalls.filter((c) => c.sql.includes('INSERT INTO vts_open_trades'));
      expect(inserts.length).toBe(3);
    });
  });
});
