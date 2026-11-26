import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { activeOpenPositions, closedTradesTable } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { db, pool } from '../../db.js';
import { ActiveExecutionEngine } from '../../services/active-execution-engine.js';
import { ActivePortfolioManager } from '../../services/active-portfolio-manager.js';
import { storage } from '../../storage.js';

// Gate writes on the connection the repository pool will actually use.
const { options } = pool as typeof pool & { options: { connectionString?: string } };
const isolated = /^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1|postgres)(:\d+)?\/test$/.test(options.connectionString ?? '');
let reachable = false;

const cancel = { kind: 'cancel' as const, reason: 'operator stop' };
const evaluatedAtMs = 1_701_000_000_000;
const fill = {
  kind: 'fill' as const, currentPrice: '99', evaluatedAtMs, quoteArrivedAtMs: evaluatedAtMs - 35,
  side: 'buy' as const, observedAgeMs: 40,
  stamp: {
    entryPriceProducer: 'kraken-pro', entryPriceSource: 'ticker_bid_ask:kraken_ws',
    entryObservedAtMs: evaluatedAtMs - 40, entryDecisionPrice: '99', entryBookAgeMs: null,
  },
};

async function withRest(options: { linked: boolean; makerTag?: boolean; initialTrade?: boolean }, run: (
  position: { id: string; symbol: string; quantity: string; metadata: { tradeId?: string } },
  tradeId: string,
  insertTrade: (id: string) => ReturnType<typeof storage.createClosedTrade>,
) => Promise<void>) {
  const nonce = randomUUID();
  const id = `p-${nonce}`;
  const tradeId = `t-${nonce}`;
  const symbol = `CR${nonce.slice(0, 8).toUpperCase()}/USD`;
  const common = { symbol, assetClass: 'crypto_spot', quantity: '3.00000000', side: 'buy', strategyName: 'strong_bull_trend' as const };
  const metadata = options.linked ? { tradeId } : {};
  const insertTrade = (id: string) => storage.createClosedTrade('paper', {
    ...common, id, entryPrice: '100', baseCurrency: symbol.split('/')[0], openedAt: new Date(), fees: '1',
    chosenEntryMode: options.makerTag === false ? null : 'maker', metadata: { tradeOnlyEvidence: 'retain', entryPlan: 'preserve' },
  });

  try {
    if (options.initialTrade !== false) await insertTrade(tradeId);
    await db.insert(activeOpenPositions).values({
      ...common, id, mode: 'paper', state: 'pending', avgPrice: '100',
      metadata: { ...metadata, expectancyScore: 0.74, entryPlan: 'position copy' },
    });
    await run({ id, symbol, quantity: common.quantity, metadata }, tradeId, insertTrade);
  } finally {
    await db.delete(activeOpenPositions).where(eq(activeOpenPositions.id, id));
    await db.delete(closedTradesTable).where(eq(closedTradesTable.symbol, symbol));
  }
}

describe('#1073 paper crypto pending maker pair on Postgres', () => {
  beforeAll(async () => {
    if (!isolated) return;
    try {
      await db.execute(sql`SELECT 1`);
      reachable = true;
    } catch (error) {
      if (process.env.CI) throw error;
    }
  });

  it('exercises the isolated database in CI', () => {
    if (process.env.CI) expect(isolated && reachable).toBe(true);
  });

  it('cancels the unique unlinked legacy order through the real flatten path with timing unknown', async (ctx) => {
    if (!reachable) ctx.skip();
    await withRest({ linked: false, makerTag: false }, async (position, tradeId) => {
      const engine = Object.assign(Object.create(ActiveExecutionEngine.prototype), {
        mode: 'paper', _entryFillLooked: new Set(), _makerWouldCancel: new Map(),
      }) as ActiveExecutionEngine;
      const manager = Object.assign(Object.create(ActivePortfolioManager.prototype), {
        mode: 'paper', executionEngine: engine, resolveFlattenPrice: vi.fn(),
      });
      const rest = { ...position, assetClass: 'crypto_spot', state: 'pending' };
      expect(await manager._flattenOne(rest, 'stop', 'manual_stop')).toMatchObject({
        status: 'closed', committed: true, closeReason: 'never_filled',
      });
      expect(await storage.getActiveOpenPosition('paper', position.id)).toBeUndefined();
      const actual = await storage.getClosedTrade('paper', tradeId);
      expect(actual).toMatchObject({
        closeReason: 'never_filled', exitPrice: null,
        metadata: { tradeOnlyEvidence: 'retain', entryPlan: 'preserve', expectancyScore: 0.74,
          paperMakerTerminal: { positionId: position.id, link: 'legacy_unique', timing: 'unknown', refusal: 'unknown' } },
      });
      expect(Number(actual!.fees)).toBe(0);
      expect(Number(actual!.netPnl)).toBe(0);
      expect(await manager._flattenOne(rest, 'stop', 'manual_stop')).toMatchObject({ status: 'left_open', committed: false });
      expect(manager.resolveFlattenPrice).not.toHaveBeenCalled();
    });
  });

  it('keeps zero or multiple legacy matches pending and honors a newly persisted exact link', async (ctx) => {
    if (!reachable) ctx.skip();
    await withRest({ linked: false, initialTrade: false }, async (position, tradeId, insertTrade) => {
      expect(await storage.transitionPaperCryptoPendingMaker(position, cancel)).toMatchObject({ status: 'unresolved' });
      await insertTrade(tradeId);
      const other = `${tradeId}-other`;
      await insertTrade(other);
      expect(await storage.transitionPaperCryptoPendingMaker(position, cancel)).toMatchObject({ status: 'unresolved' });
      expect(await storage.getActiveOpenPosition('paper', position.id)).toMatchObject({ state: 'pending' });
      await db.update(activeOpenPositions).set({ metadata: { tradeId } }).where(eq(activeOpenPositions.id, position.id));
      expect(await storage.transitionPaperCryptoPendingMaker({ ...position, metadata: { tradeId: other } }, cancel))
        .toMatchObject({ status: 'unresolved' });
      expect(await storage.transitionPaperCryptoPendingMaker(position, cancel)).toEqual({ status: 'committed', tradeId });
      expect(await storage.getClosedTrade('paper', other)).toMatchObject({ closedAt: null });
    });
  });

  it('commits fill and its receipt together while a racing or replayed cancellation loses', async (ctx) => {
    if (!reachable) ctx.skip();
    await withRest({ linked: true }, async (position, tradeId) => {
      const [first, second] = await Promise.all([
        storage.transitionPaperCryptoPendingMaker(position, { ...fill, tradeId }),
        storage.transitionPaperCryptoPendingMaker(position, cancel),
      ]);
      expect([first.status, second.status].sort()).toEqual(['committed', 'not_pending']);
      const current = await storage.getActiveOpenPosition('paper', position.id);
      const trade = await storage.getClosedTrade('paper', tradeId);
      if (first.status === 'committed') {
        expect(current).toMatchObject({ state: 'open' });
        expect(trade).toMatchObject({ closedAt: null, metadata: { tradeOnlyEvidence: 'retain', paperMakerTerminal: {
          outcome: 'fill', positionId: position.id, evaluatedAtMs, quoteArrivedAtMs: evaluatedAtMs - 35, side: 'buy',
        } } });
      } else {
        expect(current).toBeUndefined();
        expect(trade).toMatchObject({ closeReason: 'never_filled', metadata: { paperMakerTerminal: { outcome: 'cancel' } } });
      }
      expect(await storage.transitionPaperCryptoPendingMaker(position, cancel)).toEqual({ status: 'not_pending' });
      expect(await storage.getClosedTrade('paper', tradeId)).toEqual(trade);
    });
  });

  it('rolls back a deleted position if its terminal trade update fails', async (ctx) => {
    if (!reachable) ctx.skip();
    await withRest({ linked: true }, async (position, tradeId) => {
      await expect(storage.transitionPaperCryptoPendingMaker(position, { ...cancel, reason: '\0' })).rejects.toThrow();
      expect(await storage.getActiveOpenPosition('paper', position.id)).toMatchObject({ state: 'pending' });
      expect(await storage.getClosedTrade('paper', tradeId)).toMatchObject({ closedAt: null, metadata: { tradeOnlyEvidence: 'retain' } });
      expect(await storage.transitionPaperCryptoPendingMaker(position, cancel)).toEqual({ status: 'committed', tradeId });
    });
  });

  it('queues ordinary inserts and legacy cancellation behind the same key', async (ctx) => {
    if (!reachable) ctx.skip();
    await withRest({ linked: false }, async (position, tradeId, insertTrade) => {
      const key = `open-record:paper:${position.symbol}:crypto_spot`;
      const waitFor = async (count: number) => {
        for (let attempt = 0; attempt < 80; attempt++) {
          const { rows } = await db.execute<{ n: number }>(sql`
            SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND objid = hashtext(${key})::oid AND NOT granted
          `);
          if (rows[0].n === count) return;
          await delay(20);
        }
        throw new Error(`Expected ${count} transactions to wait for the open-record key`);
      };
      const { other, drop } = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
        const other = insertTrade(`${tradeId}-second`);
        void other.catch(() => {});
        await waitFor(1);
        const drop = storage.transitionPaperCryptoPendingMaker(position, cancel);
        void drop.catch(() => {});
        await waitFor(2);
        return { other, drop };
      });
      const [, cancellation] = await Promise.all([other, drop]);
      expect(cancellation).toMatchObject({ status: 'unresolved' });
      expect(await storage.getActiveOpenPosition('paper', position.id)).toMatchObject({ state: 'pending' });
      expect(await storage.getClosedTrade('paper', tradeId)).toMatchObject({ closedAt: null });
    });
  });
});
