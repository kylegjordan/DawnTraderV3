/**
 * B79.0g — Open VTS trade persistence tests.
 *
 * Mocks the db layer; verifies SQL shape + bootstrap re-resolve behavior.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock db.execute → record args. Captures into module-level `dbCalls` AND
// supports per-test override of the return value via `dbReturnOverrides`
// (queue-style; each entry is consumed in order). This avoids the problem
// where `mockImplementationOnce` would bypass the dbCalls capture path.
const dbCalls: Array<{ sql: string; params: any[] }> = [];
const dbReturnOverrides: any[] = [];
const mockExecute = vi.fn(async (q: any) => {
  // q is a drizzle SQL template — capture the queryChunks for inspection
  const sqlText = (q?.queryChunks ?? []).map((c: any) => c?.value ?? c).join(' ');
  const params = q?.params ?? [];
  dbCalls.push({ sql: sqlText, params });
  if (dbReturnOverrides.length > 0) {
    return dbReturnOverrides.shift();
  }
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
    dbReturnOverrides.length = 0;
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

  // sweepClosedOpenTrades subject-suite REMOVED with its subject
  // (B-TRADE-TIER-REGISTER #599, rule 18 + the B-ARM SUBJECT-vs-PROBE rule —
  // these tests exercised the deleted function itself, not a surviving invariant).

  describe('bootstrapOpenTradesFromMemory (B79.0g-tx: open-only count)', () => {
    it('returns null when OPEN-only count is non-zero (live trades present) — COUNT query filters WHERE closed=false', async () => {
      dbReturnOverrides.push({ rows: [{ count: '5' }] });
      const result = await bootstrapOpenTradesFromMemory([makeTrade('BTC/USD', 'crypto_spot')]);
      expect(result).toBeNull();
      // Regression-lock: COUNT query must filter WHERE closed=false.
      expect(dbCalls[0].sql).toMatch(/SELECT COUNT.*FROM vts_open_trades WHERE closed = false/i);
    });

    it('PROCEEDS when only soft-deleted closed=true history rows exist (B79.0g-tx Q4 regression-lock)', async () => {
      // Open-only count = 0 even though closed-history rows could exist in
      // the table. Bootstrap path must treat the table as effectively empty
      // and run the re-resolve seed (preserves B79.0g Q4 semantic across
      // the new soft-delete world; Langston pre-audit Q4).
      mockExecute.mockImplementationOnce(async () => ({ rows: [{ count: '0' }] } as any));
      const result = await bootstrapOpenTradesFromMemory([makeTrade('BTC/USD', 'crypto_spot')]);
      expect(result).toBe(1);
      // `3n.q3` P9: the trade CARRIES a valid class, so the ticker is not consulted (it was re-resolved before).
      expect(resolverCalls.length).toBe(0);
      const inserts = dbCalls.filter((c) => c.sql.includes('INSERT INTO vts_open_trades'));
      expect(inserts.length).toBe(1);
    });

    // ⛔ `3n.q3` P9 (`#1075`, Langston-approved Step 2) — INVERTED. B79.0g re-resolved EVERY carried class from the ticker
    // to defeat pre-B79.0f stale values; that same re-resolution turned a collision-ticker xStock (SUI, MET, …) into
    // crypto_spot in memory AND in the table. Every trade has been stamped at source since B79.0f, so a VALID carried class
    // is kept and the ticker is the fallback only for a missing or invalid one.
    it('keeps a valid CARRIED class — a collision-ticker xStock stays xstock_spot; the ticker is not consulted', async () => {
      const xs = makeTrade('SUI/USD', 'xstock_spot');
      await bootstrapOpenTradesFromMemory([xs]);
      expect(resolverCalls).toEqual([]);
      expect(dbCalls.find((c) => c.sql.includes('INSERT INTO vts_open_trades'))).toBeDefined();
      expect(xs.assetClass).toBe('xstock_spot');
    });

    it('re-resolves a MISSING or INVALID class from the ticker (the fallback)', async () => {
      const staleTrade = makeTrade('SUI/USD', 'not_a_class');
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
      const unresolvable = makeTrade('UNKNOWN/USD', 'not_a_class'); // `3n.q3`: a valid carried class would not reach the resolver
      const result = await bootstrapOpenTradesFromMemory([unresolvable]);
      expect(result).toBe(0);
      // No INSERT should have happened (only the COUNT check).
      const inserts = dbCalls.filter((c) => c.sql.includes('INSERT INTO vts_open_trades'));
      expect(inserts.length).toBe(0);
    });

    it('seeds multiple trades when table is empty', async () => {
      const trades = [
        makeTrade('SUI/USD', 'xstock_spot'),  // `3n.q3`: carried, valid → kept (no longer re-resolved to crypto_spot)
        makeTrade('AAPL/USD', 'xstock_spot'), // stays xstock_spot
        makeTrade('BTC/USD', 'not_a_class'),  // invalid → re-resolved from the ticker
      ];
      const result = await bootstrapOpenTradesFromMemory(trades);
      expect(result).toBe(3);

      // only the invalid one consults the ticker
      expect(resolverCalls).toEqual([{ symbol: 'BTC/USD', exchange: 'kraken' }]);
      expect(trades[0].assetClass).toBe('xstock_spot');
      expect(trades[2].assetClass).toBe('crypto_spot');
      // 3 INSERTs
      const inserts = dbCalls.filter((c) => c.sql.includes('INSERT INTO vts_open_trades'));
      expect(inserts.length).toBe(3);
    });
  });
});
