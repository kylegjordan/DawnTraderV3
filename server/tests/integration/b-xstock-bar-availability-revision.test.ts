/**
 * B-XSTOCK-BAR-AVAILABILITY P2/P3 — real PostgreSQL proof of the immutable
 * event/generation chain and later primary certificate.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { db } from '../../db.js';
import { upsertOhlcRows } from '../../services/passive-archive/ohlc-batch-writer.js';

const RAW_DB_URL = process.env.DATABASE_URL ?? '';
const isTestDb = /^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1|postgres)(:\d+)?\/test(\?|$)/.test(RAW_DB_URL);
const IS_CI = !!process.env.CI;
const TAG = 'B-XSTOCK-BAR-AVAILABILITY-REVISION';
const SYMBOL = 'BAVAILTEST/USD';
const now = Date.now();
const minute = new Date(Math.floor((now - 60_000) / 60_000) * 60_000);
const A1 = new Date(now - 30_000);
const A2 = new Date(now - 20_000);
const A3 = new Date(now - 10_000);
let dbReachable = true;

const bar = (close: string, arrivedAt: Date) => ({
  symbol: SYMBOL,
  assetClass: 'xstock_spot',
  exchange: 'kraken-equities',
  intervalBegin: minute,
  arrivedAt,
  open: '9', high: '11', low: '8', close, volume: '100',
  vwap: '9.5', tradeCount: 7, metadata: { schema_version: 1, test: TAG },
}) as any;

async function rows<T>(query: unknown): Promise<T[]> {
  const result = await query as any;
  return (result?.rows ?? result) as T[];
}

async function cleanup(): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('dawntrader.archive_mode', 'on', true)`);
    await tx.execute(sql`DELETE FROM xstock_bar_revision_event WHERE symbol = ${SYMBOL}`);
    await tx.execute(sql`DELETE FROM xstock_spot_ohlc_1m WHERE symbol = ${SYMBOL}`);
  });
}

beforeAll(async () => {
  try {
    await db.execute(sql`SELECT 1`);
  } catch (error) {
    if (IS_CI) {
      throw new Error(`[${TAG}] PostgreSQL unreachable in CI: ${error instanceof Error ? error.message : error}`);
    }
    dbReachable = false;
    return;
  }
  if (isTestDb) await cleanup();
});

afterAll(async () => {
  if (dbReachable && isTestDb) await cleanup();
});

describe(TAG, () => {
  it('runs only against the isolated test database', () => {
    if (IS_CI) expect(isTestDb).toBe(true);
  });

  it('X@A1 -> identical X@A3 -> changed Y@A2 preserves the exact winner chain', async (ctx) => {
    if (!dbReachable || !isTestDb) ctx.skip();

    await upsertOhlcRows('xstock_spot', [bar('10', A1)]);
    await upsertOhlcRows('xstock_spot', [bar('10', A3)]);
    await upsertOhlcRows('xstock_spot', [bar('99', A2)]);

    const events = await rows<{
      revision_id: string;
      arrived_at: Date;
      close: string;
      projection_applied: boolean;
      projection_generation: string | null;
      supersedes_revision_id: string | null;
      observed_winner_revision_id: string | null;
      payload_hash: string;
      payload_repeated_from_winner: boolean;
      visible_by: Date | null;
      visible_seq: string | null;
    }>(db.execute(sql`
      SELECT revision_id, arrived_at, close::text, projection_applied,
             projection_generation::text, supersedes_revision_id,
             observed_winner_revision_id, payload_hash,
             payload_repeated_from_winner, visible_by, visible_seq::text
      FROM xstock_bar_revision_event
      WHERE symbol = ${SYMBOL}
      ORDER BY arrived_at ASC
    `));
    expect(events).toHaveLength(3); // positive control: the instrument sees all attempts

    const [first, rejected, identicalLater] = events;
    expect(new Set(events.map((event) => event.revision_id)).size).toBe(3);
    expect(first.projection_applied).toBe(true);
    expect(first.projection_generation).toBe('1');
    expect(first.payload_repeated_from_winner).toBe(false);

    expect(identicalLater.projection_applied).toBe(true);
    expect(identicalLater.projection_generation).toBe('2');
    expect(identicalLater.supersedes_revision_id).toBe(first.revision_id);
    expect(identicalLater.payload_hash).toBe(first.payload_hash);
    expect(identicalLater.payload_repeated_from_winner).toBe(true);

    expect(rejected.close).toBe('99.00000000');
    expect(rejected.projection_applied).toBe(false);
    expect(rejected.projection_generation).toBeNull();
    expect(rejected.observed_winner_revision_id).toBe(identicalLater.revision_id);

    for (const event of events) {
      expect(event.visible_by).not.toBeNull();
      expect(Number(event.visible_seq)).toBeGreaterThan(0);
    }

    const [projection] = await rows<{
      close: string;
      arrived_at: Date;
      projection_generation: string;
      winning_revision_id: string;
    }>(db.execute(sql`
      SELECT close::text, arrived_at, projection_generation::text, winning_revision_id
      FROM xstock_spot_ohlc_1m
      WHERE symbol = ${SYMBOL} AND interval_begin = ${minute.toISOString()}::timestamptz
    `));
    expect(projection.close).toBe('10.00000000');
    expect(new Date(projection.arrived_at).getTime()).toBe(A3.getTime());
    expect(projection.projection_generation).toBe('2');
    expect(projection.winning_revision_id).toBe(identicalLater.revision_id);
  });
});
