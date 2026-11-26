import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { activeOpenPositions, closedTradesTable } from '@shared/schema';
import { db } from '../../db.js';
import { hasPaperXstockEntryFill, storage } from '../../storage.js';

const testDb = /^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1|postgres)(:\d+)?\/test(\?|$)/.test(process.env.DATABASE_URL ?? '');
let testDbReachable = false;
const filledAtMs = 1_701_000_000_000;
const fill = {
  kind: 'fill' as const,
  currentPrice: '99',
  proof: { method: 'maker' as const, filledAtMs, quoteArrivedAtMs: filledAtMs - 37 },
  stamp: {
    entryPriceProducer: 'kraken-equities-ws', entryPriceSource: 'kraken_equities_ws:raw_ask',
    entryObservedAtMs: filledAtMs - 43, entryDecisionPrice: '99', entryBookAgeMs: null,
  },
  observedAgeMs: 43,
};
const cancel = { kind: 'cancel' as const, reason: 'hard stop' };
const close = { closedAt: new Date(), closeReason: 'manual_stop' as const, exitPrice: '98' };

async function withTrade<T>(
  options: { method: 'maker' | 'taker'; state?: 'pending' | 'open'; linked?: boolean; filled?: boolean },
  run: (trade: { id: string; symbol: string; quantity: string }, position: { id: string; symbol: string; quantity: string }) => Promise<T>,
) {
  const nonce = randomUUID();
  const positionId = `pos-${nonce}`;
  const tradeId = `trade-${nonce}`;
  const symbol = `XT${nonce.slice(0, 8).toUpperCase()}/USD`;
  const common = { mode: 'paper' as const, symbol, assetClass: 'xstock_spot', quantity: '3', side: 'buy', strategyName: 'strong_bull_trend' as const };
  try {
    await db.insert(closedTradesTable).values({
      ...common, id: tradeId, entryPrice: '100', baseCurrency: symbol.split('/')[0], openedAt: new Date(),
      chosenEntryMode: options.method, fees: '1',
      metadata: { entryPlan: 'preserve', ...(options.filled && { paperXstockEntryFill: { method: options.method, filledAtMs } }) },
    });
    if (options.state) await db.insert(activeOpenPositions).values({
      ...common, id: positionId, state: options.state, avgPrice: '100',
      metadata: options.linked === false ? {} : { tradeId },
    });
    const key = { symbol, quantity: common.quantity };
    return await run({ ...key, id: tradeId }, { ...key, id: positionId });
  } finally {
    await db.delete(activeOpenPositions).where(eq(activeOpenPositions.id, positionId));
    await db.delete(closedTradesTable).where(eq(closedTradesTable.id, tradeId));
  }
}

describe('#961 paper xStock trade transitions on Postgres', () => {
  beforeAll(async () => {
    if (!testDb) return;
    try {
      await db.execute(sql`select 1`);
      testDbReachable = true;
    } catch (error) {
      if (process.env.CI) throw error;
    }
  });

  it('uses only the isolated test database in CI', () => {
    if (process.env.CI) expect(testDb && testDbReachable).toBe(true);
  });

  it('commits maker fill and provenance together, preventing the older cancellation', async (ctx) => {
    if (!testDbReachable) ctx.skip();
    await withTrade({ method: 'maker', state: 'pending' }, async (trade, position) => {
      expect(await storage.transitionPaperXstockPendingMaker(position, trade.id, fill)).toBe(true);
      expect(await storage.transitionPaperXstockPendingMaker(position, trade.id, cancel)).toBe(false);
      expect(await storage.getActiveOpenPosition('paper', position.id)).toMatchObject({ state: 'open' });
      expect(await storage.getPaperXstockTrade(trade)).toMatchObject({
        closedAt: null,
        entryPriceSource: fill.stamp.entryPriceSource,
        metadata: { entryPlan: 'preserve', paperXstockEntryFill: fill.proof, entryObservedAgeMs: 43 },
      });
    });
  });

  it('commits cancellation once, preventing a precomputed fill from reviving it', async (ctx) => {
    if (!testDbReachable) ctx.skip();
    await withTrade({ method: 'maker', state: 'pending' }, async (trade, position) => {
      expect(await storage.transitionPaperXstockPendingMaker(position, trade.id, cancel)).toBe(true);
      expect(await storage.transitionPaperXstockPendingMaker(position, trade.id, fill)).toBe(false);
      expect(await storage.getActiveOpenPosition('paper', position.id)).toBeUndefined();
      const actual = await storage.getPaperXstockTrade(trade);
      expect(actual).toMatchObject({ closeReason: 'never_filled', exitPrice: null, metadata: { neverFilledReason: cancel.reason, entryPlan: 'preserve' } });
      expect(Number(actual?.fees)).toBe(0);
      expect(actual && hasPaperXstockEntryFill(actual)).toBe(false);
    });
  });

  it('rolls back a position removal when Postgres rejects the cancellation stamp', async (ctx) => {
    if (!testDbReachable) ctx.skip();
    await withTrade({ method: 'maker', state: 'pending' }, async (trade, position) => {
      await expect(storage.transitionPaperXstockPendingMaker(position, trade.id, { ...cancel, reason: '\0' })).rejects.toThrow();
      expect(await storage.getActiveOpenPosition('paper', position.id)).toMatchObject({ state: 'pending' });
      expect(await storage.getPaperXstockTrade(trade)).toMatchObject({ closedAt: null, closeReason: null });
      expect(await storage.transitionPaperXstockPendingMaker(position, trade.id, cancel)).toBe(true);
    });
  });

  it('lets either price writer win once and rolls back a rejected price on the exact position', async (ctx) => {
    if (!testDbReachable) ctx.skip();
    for (const reason of ['stop_hit', 'manual_stop'] as const) {
      await withTrade({ method: 'taker', state: 'open', filled: true }, async (trade, position) => {
        await expect(storage.closePaperXstockTrade(trade, position, { ...close, exitPrice: 'invalid' })).rejects.toThrow();
        expect(await storage.getActiveOpenPosition('paper', position.id)).toMatchObject({ state: 'open' });
        expect(await storage.getPaperXstockTrade(trade)).toMatchObject({ closedAt: null });
        const winner = await storage.closePaperXstockTrade(trade, position, { ...close, closeReason: reason });
        const loser = await storage.closePaperXstockTrade(trade, position, {
          ...close, closeReason: reason === 'stop_hit' ? 'manual_stop' : 'stop_hit',
        });
        expect(winner).toMatchObject({ committed: true, trade: { closeReason: reason } });
        expect(loser).toMatchObject({ committed: false, trade: { closeReason: reason } });
        expect(await storage.getActiveOpenPosition('paper', position.id)).toBeUndefined();
      });
    }
  });

  it('refuses unresolved links and pending positions without booking an exit', async (ctx) => {
    if (!testDbReachable) ctx.skip();
    await withTrade({ method: 'maker', state: 'pending', linked: false }, async (trade, position) => {
      expect(await storage.transitionPaperXstockPendingMaker(position, trade.id, fill)).toBe(false);
      expect(await storage.transitionPaperXstockPendingMaker(position, trade.id, cancel)).toBe(false);
      expect(await storage.closePaperXstockTrade(trade, position, close)).toMatchObject({ committed: false });
      expect(await storage.getPaperXstockTrade(trade)).toMatchObject({ closedAt: null, exitPrice: null });
      expect(await storage.getActiveOpenPosition('paper', position.id)).toMatchObject({ state: 'pending' });
    });
    await withTrade({ method: 'maker', state: 'pending' }, async (trade, position) => {
      expect(await storage.closePaperXstockTrade(trade, position, close)).toMatchObject({ committed: false });
      expect(await storage.getPaperXstockTrade(trade)).toMatchObject({ closedAt: null, exitPrice: null });
      expect(await storage.transitionPaperXstockPendingMaker(position, trade.id, cancel)).toBe(true);
    });
    await withTrade({ method: 'taker', state: 'open', linked: false }, async (trade, position) => {
      expect(await storage.closePaperXstockTrade(trade, position, close)).toMatchObject({ committed: false });
      expect(await storage.getActiveOpenPosition('paper', position.id)).toMatchObject({ state: 'open' });
    });
  });

  it('reports the same stored winner to two simultaneous price writers', async (ctx) => {
    if (!testDbReachable) ctx.skip();
    await withTrade({ method: 'taker', state: 'open', filled: true }, async (trade, position) => {
      const results = await Promise.all([
        storage.closePaperXstockTrade(trade, position, { ...close, closeReason: 'stop_hit' }),
        storage.closePaperXstockTrade(trade, position, close),
      ]);
      const committed = results.filter((result) => result.committed);
      expect(committed).toHaveLength(1);
      expect(results.map((result) => result.trade?.closeReason)).toEqual([
        committed[0].trade?.closeReason, committed[0].trade?.closeReason,
      ]);
    });
  });

  it('requires both a completed fill and no remaining position before pricing an orphan', async (ctx) => {
    if (!testDbReachable) ctx.skip();
    for (const options of [
      { method: 'maker' as const, filled: false, committed: false },
      { method: 'taker' as const, filled: false, committed: false },
      { method: 'taker' as const, filled: true, committed: true },
      { method: 'maker' as const, filled: true, committed: true },
      { method: 'taker' as const, filled: true, state: 'open' as const, linked: false, committed: false },
    ]) {
      await withTrade(options, async (trade) => {
        const result = await storage.closePaperXstockTrade(trade, null, { ...close, closeReason: 'engine_stop_cleanup' });
        expect(result.committed).toBe(options.committed);
        expect((await storage.getPaperXstockTrade(trade))?.closeReason).toBe(options.committed ? 'engine_stop_cleanup' : null);
      });
    }
  });
});
