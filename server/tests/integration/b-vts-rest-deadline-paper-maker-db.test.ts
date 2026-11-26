import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { activeOpenPositions, closedTradesTable } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { observePaperMakerRefusal } from '../../core/trading/paper-maker-refusal-evidence.js';
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

  it('records a placement once for the actual linked paper maker without endangering the slot', async (ctx) => {
    if (!reachable) ctx.skip();
    await withRest({ linked: true }, async (position, tradeId) => {
      const makerPlacedAt = new Date(evaluatedAtMs - 40_000);
      const makerDeadline = new Date(evaluatedAtMs + 20_000);
      await db.update(activeOpenPositions).set({ makerPlacedAt, makerDeadline, makerLimitPrice: '100' })
        .where(eq(activeOpenPositions.id, position.id));
      const pending = (await storage.getActiveOpenPosition('paper', position.id))!;
      const record = storage.recordPaperMakerPlacement.bind(storage);
      expect(await record({ ...pending, mode: 'live' }, tradeId)).toBe(false);
      expect(await record({ ...pending, state: 'open' }, tradeId)).toBe(false);
      expect(await record({ ...pending, assetClass: 'xstock_spot' }, tradeId)).toBe(false);
      expect(await record({ ...pending, id: 'replaced-position' }, tradeId)).toBe(false);
      expect(await record(pending, `${tradeId}-other`)).toBe(false);
      await expect(record(pending, `${tradeId}\0`)).rejects.toThrow();
      expect(await storage.getActiveOpenPosition('paper', position.id)).toEqual(pending);
      expect(await record(pending, tradeId)).toBe(true);
      expect(await record({ ...pending, makerDeadline: new Date(evaluatedAtMs) }, tradeId)).toBe(false);
      const trade = await storage.getClosedTrade('paper', tradeId);
      expect(trade).toMatchObject({ metadata: {
        tradeOnlyEvidence: 'retain', paperMakerPlacement: {
          version: 1, tradeId, positionId: position.id, mode: 'paper', assetClass: 'crypto_spot', symbol: position.symbol,
          makerPlacedAtMs: makerPlacedAt.getTime(), makerDeadlineAtMs: makerDeadline.getTime(),
        },
      } });
      expect(Number((trade?.metadata as { paperMakerPlacement: { limitPrice: string } }).paperMakerPlacement.limitPrice)).toBe(100);
    });
  });

  it('keeps refusal evidence linked to the newer slot and exact pending rest through terminal transition', async (ctx) => {
    if (!reachable) ctx.skip();
    await withRest({ linked: true }, async (position, tradeId) => {
      const epoch = { id: 'engine-a', wallAnchorMs: evaluatedAtMs - 20_000, monotonicAnchorMs: 1_000, periodMs: 4_000 };
      const placement = { placedAtMs: evaluatedAtMs - 40_000, deadlineAtMs: epoch.wallAnchorMs + 6_000 };
      const makerPlacedAt = new Date(placement.placedAtMs);
      const makerDeadline = new Date(placement.deadlineAtMs);
      await db.update(activeOpenPositions).set({ makerPlacedAt, makerDeadline, makerLimitPrice: '100' })
        .where(eq(activeOpenPositions.id, position.id));
      const pending = (await storage.getActiveOpenPosition('paper', position.id))!;
      const first = observePaperMakerRefusal(epoch, placement, {
        observation: 'upstream_refusal', slot: 1, callbackNumber: 1, wallAtMs: epoch.wallAnchorMs + 4_100, monotonicAtMs: 5_100,
      });
      const second = observePaperMakerRefusal(epoch, placement, {
        observation: 'upstream_refusal', slot: 2, callbackNumber: 2, wallAtMs: epoch.wallAnchorMs + 8_100, monotonicAtMs: 9_100,
      }, first);
      const record = storage.recordPaperMakerRefusal.bind(storage);
      expect(await record({ ...pending, id: 'other-rest' }, tradeId, second)).toBe(false);
      expect(await record(pending, `${tradeId}-other`, second)).toBe(false);
      expect(await record(pending, tradeId, { ...second, deadlineAtMs: placement.deadlineAtMs - 1 })).toBe(false);
      expect(await record(pending, tradeId, second)).toBe(true);
      expect(await record(pending, tradeId, second)).toBe(false);
      expect(await record(pending, tradeId, { ...second, sample: { ...second.sample, slot: 1 } })).toBe(false);
      expect(await record(pending, tradeId, { ...second, epochId: 'old', epochAnchorAtMs: epoch.wallAnchorMs - 1 })).toBe(false);
      const nextEpoch = { ...epoch, id: 'engine-b', wallAnchorMs: epoch.wallAnchorMs + 1 };
      const restartedFirst = observePaperMakerRefusal(nextEpoch, placement, { ...first.sample, wallAtMs: first.sample.wallAtMs + 1 });
      const newer = observePaperMakerRefusal(nextEpoch, placement, { ...second.sample, wallAtMs: second.sample.wallAtMs + 1 }, restartedFirst);
      expect(await record(pending, tradeId, newer)).toBe(true);
      const terminalLook = observePaperMakerRefusal(nextEpoch, placement, {
        observation: 'evaluated_side', slot: 3, callbackNumber: 3, wallAtMs: nextEpoch.wallAnchorMs + 12_100, monotonicAtMs: 13_100,
      }, newer);
      expect(terminalLook.recovered?.count).toBe(2);
      expect(await storage.transitionPaperCryptoPendingMaker(position, {
        ...fill, tradeId, refusalEvidence: terminalLook, evaluatedAtMs: terminalLook.sample.wallAtMs,
        quoteArrivedAtMs: placement.deadlineAtMs - 1,
      })).toMatchObject({ status: 'committed', tradeId });
      expect(await record(pending, tradeId, { ...newer, sample: { ...newer.sample, slot: 3 } })).toBe(false);
      const trade = await storage.getClosedTrade('paper', tradeId);
      expect(trade).toMatchObject({ metadata: { tradeOnlyEvidence: 'retain',
        paperMakerRefusal: { positionId: position.id, tradeId, epochId: 'engine-b', sample: { slot: 2 } },
        paperMakerTerminal: { positionId: position.id, outcome: 'fill', refusalEvidence: { recovered: { count: 2 } } },
      } });
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
          outcome: 'fill', positionId: position.id, evaluatedAtMs, quoteArrivedAtMs: evaluatedAtMs - 35, quoteSide: 'ask',
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
