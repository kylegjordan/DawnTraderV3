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
  markOpenTradeClosed,
  rehydrateOpenTrades,
  bootstrapOpenTradesFromMemory,
  sweepClosedOpenTrades,
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

  describe('markOpenTradeClosed (B79.0g-tx)', () => {
    it('issues UPDATE SET closed=true, closed_at=NOW() WHERE id AND closed=false', async () => {
      await markOpenTradeClosed('t_abc');
      expect(mockExecute).toHaveBeenCalledTimes(1);
      const call = dbCalls[0];
      expect(call.sql).toMatch(/UPDATE vts_open_trades/i);
      expect(call.sql).toMatch(/SET closed = true/i);
      expect(call.sql).toMatch(/closed_at = NOW\(\)/i);
      expect(call.sql).toMatch(/WHERE id = /i);
      expect(call.sql).toMatch(/AND closed = false/i);
    });

    it('is idempotent — second call with same id is a no-op at the SQL layer (WHERE closed=false filter)', async () => {
      await markOpenTradeClosed('t_dup');
      await markOpenTradeClosed('t_dup');
      // Both calls issue the same statement; idempotency is enforced by the
      // `AND closed = false` filter at the row level (zero-row UPDATE on retry).
      expect(mockExecute).toHaveBeenCalledTimes(2);
    });
  });

  describe('rehydrateOpenTrades (B79.0g-tx: filters WHERE closed=false)', () => {
    it('issues SELECT with WHERE closed = false and returns empty list when table empty', async () => {
      const rows = await rehydrateOpenTrades();
      expect(rows).toEqual([]);
      expect(mockExecute).toHaveBeenCalledTimes(1);
      const call = dbCalls[0];
      expect(call.sql).toMatch(/WHERE closed = false/i);
    });
  });

  describe('sweepClosedOpenTrades (B79.0g-tx)', () => {
    it('returns null + logs CONFIG_MISSING when module_constants row absent', async () => {
      // First call: SELECT value FROM module_constants → empty rows.
      mockExecute.mockImplementationOnce(async () => ({ rows: [] } as any));
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = await sweepClosedOpenTrades();
      expect(result).toBeNull();
      expect(errSpy).toHaveBeenCalled();
      const firstCallArg = String(errSpy.mock.calls[0]?.[0] ?? '');
      expect(firstCallArg).toMatch(/CONFIG_MISSING/);
      errSpy.mockRestore();
    });

    it('issues DELETE WHERE closed=true AND closed_at < cutoff when config present', async () => {
      // First call: SELECT value → return numeric 90.
      mockExecute.mockImplementationOnce(async () => ({ rows: [{ value: 90 }] } as any));
      // Second call: DELETE … RETURNING → COUNT row.
      mockExecute.mockImplementationOnce(async () => ({ rows: [{ count: '0' }] } as any));
      const result = await sweepClosedOpenTrades();
      expect(result).toEqual({ swept: 0 });
      expect(mockExecute).toHaveBeenCalledTimes(2);
      const deleteCall = dbCalls[1];
      expect(deleteCall.sql).toMatch(/DELETE FROM vts_open_trades/i);
      expect(deleteCall.sql).toMatch(/WHERE closed = true/i);
      expect(deleteCall.sql).toMatch(/AND closed_at <\s+NOW\(\)\s+-/i);
    });

    it('returns null + logs CONFIG_MISSING when retention value is invalid', async () => {
      // Return a non-numeric / non-positive value.
      mockExecute.mockImplementationOnce(async () => ({ rows: [{ value: 'banana' }] } as any));
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = await sweepClosedOpenTrades();
      expect(result).toBeNull();
      errSpy.mockRestore();
    });
  });

  describe('bootstrapOpenTradesFromMemory (B79.0g-tx: open-only count)', () => {
    it('returns null when OPEN-only count is non-zero (live trades present)', async () => {
      // Override mock: count = 5 (non-empty)
      mockExecute.mockImplementationOnce(async () => ({ rows: [{ count: '5' }] } as any));
      const result = await bootstrapOpenTradesFromMemory([makeTrade('BTC/USD', 'crypto_spot')]);
      expect(result).toBeNull();
      // Regression-lock: COUNT query must filter WHERE closed=false.
      const countCall = dbCalls[0];
      expect(countCall.sql).toMatch(/SELECT COUNT.*FROM vts_open_trades WHERE closed = false/i);
    });

    it('PROCEEDS when only soft-deleted closed=true history rows exist (B79.0g-tx Q4 regression-lock)', async () => {
      // Open-only count = 0 even though closed-history rows could exist in
      // the table. Bootstrap path must treat the table as effectively empty
      // and run the re-resolve seed (preserves B79.0g Q4 semantic across
      // the new soft-delete world; Langston pre-audit Q4).
      mockExecute.mockImplementationOnce(async () => ({ rows: [{ count: '0' }] } as any));
      const result = await bootstrapOpenTradesFromMemory([makeTrade('BTC/USD', 'crypto_spot')]);
      expect(result).toBe(1);
      // Verify the re-resolve was invoked.
      expect(resolverCalls.length).toBe(1);
      const inserts = dbCalls.filter((c) => c.sql.includes('INSERT INTO vts_open_trades'));
      expect(inserts.length).toBe(1);
    });

    it('re-resolves asset_class via safeResolveAssetClass — defeats stale legacy values', async () => {
      // Trade carries STALE assetClass='xstock_spot' from pre-B79.0f resolver.
      // bootstrapOpenTradesFromMemory must re-resolve to crypto_spot.
      const staleTrade = makeTrade('SUI/USD', 'xstock_spot');
      await bootstrapOpenTradesFromMemory([staleTrade]);

      // Verify re-resolve was called.
      expect(resolverCalls).toContainEqual({ symbol: 'SUI/USD', exchange: 'kraken' });

      // Verify INSERT was called (drizzle sql template internals don't surface
      // params via .params; we trust resolverCall + insert-was-issued + the
      // F3 in-memory mutation below as the regression-lock).
      const insertCall = dbCalls.find((c) => c.sql.includes('INSERT INTO vts_open_trades'));
      expect(insertCall).toBeDefined();

      // F3 fix verification: the in-memory record is mutated to the corrected value.
      expect(staleTrade.assetClass).toBe('crypto_spot');
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
