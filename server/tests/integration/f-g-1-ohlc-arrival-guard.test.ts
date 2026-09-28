/**
 * F-G-1 REOPEN P3 (OBJ-9 ②, #1031) — THE ARRIVAL GUARD, AGAINST A REAL PARTITIONED TABLE.
 *
 * The unit fence proves the writer HANDS `setWhere` to the database. This proves the database
 * DOES what it says: an older arrival written SECOND never overwrites a fresher bar. That is the
 * case P1 + P2 cannot reach — a deploy overlaps two processes, each with its own buffer and its own
 * in-flight map — so it must be proved on real SQL, not on a mock.
 *
 * Drives `upsertOhlcRows` (the writer's own chunked upsert) with EXPLICIT arrival stamps, because
 * `bufferOhlcBar` always stamps now and cannot produce an out-of-order arrival.
 *
 * WRITES: one test symbol into `crypto_spot_ohlc_1m` at 2026-09-15 (partition `_2026_09`, created
 * by the initial-schema migration), deleted before and after. Writes only when DATABASE_URL is the
 * `test` database; in CI a missing database FAILS the file (the #704 lesson — a skip must never
 * read as a pass), locally the DB legs report SKIPPED via `ctx.skip()` at run time (`it.skipIf` is decided at collection,
 * before `beforeAll` can learn the database is absent).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../db.js';
import { sql } from 'drizzle-orm';
import { upsertOhlcRows } from '../../services/passive-archive/ohlc-batch-writer.js';

const RAW_DB_URL = process.env.DATABASE_URL ?? '';
const isTestDb =
  /^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1|postgres)(:\d+)?\/test(\?|$)/.test(RAW_DB_URL);
const IS_CI = !!process.env.CI;
const TAG = 'F-G-1-OHLC-ARRIVAL-GUARD';
const SYM = 'FG1TEST/USD';
const MINUTE = new Date('2026-09-15T12:00:00.000Z');
let dbReachable = true;

const row = (close: string, arrivedAt: Date | null) => ({
  symbol: SYM, assetClass: 'crypto_spot', exchange: 'kraken', intervalBegin: MINUTE,
  open: '1', high: '1', low: '1', close, volume: '1', arrivedAt,
}) as any;

async function stored(): Promise<{ close: string; arrived_at: Date | null } | undefined> {
  const res: any = await db.execute(sql`
    SELECT close::text AS close, arrived_at FROM crypto_spot_ohlc_1m
    WHERE symbol = ${SYM} AND interval_begin = ${MINUTE.toISOString()}::timestamptz`);
  const rows = res?.rows ?? res;
  return Array.isArray(rows) ? rows[0] : undefined;
}
const closeNum = async () => Number((await stored())?.close);
const cleanup = () => db.execute(sql`DELETE FROM crypto_spot_ohlc_1m WHERE symbol = ${SYM}`);

beforeAll(async () => {
  try {
    await db.execute(sql`SELECT 1`);
  } catch (err) {
    if (IS_CI) {
      throw new Error(`[${TAG}] Postgres unreachable in CI — the guard cannot be proved without it, and a green `
        + `suite would be a false all-clear. Original: ${err instanceof Error ? err.message : err}`);
    }
    dbReachable = false;
    console.warn(`[${TAG}] Postgres unreachable — DB legs will report as SKIPPED (not passed).`);
    return;
  }
  if (isTestDb) await cleanup();
});
afterAll(async () => { if (dbReachable && isTestDb) await cleanup(); });

const T0 = new Date('2026-09-15T12:00:10.000Z');
const T1 = new Date('2026-09-15T12:00:20.000Z');
const T2 = new Date('2026-09-15T12:00:30.000Z');

describe(TAG, () => {
  it('the guard is only proved on the test database (guard on the guard)', () => {
    if (IS_CI) expect(isTestDb).toBe(true);
  });

  // CONTROL — the instrument can see a write at all.
  it('CONTROL — a first write lands with its stamp', async (ctx) => {
    if (!dbReachable || !isTestDb) ctx.skip(); // run-time: `it.skipIf` is decided before `beforeAll` runs
    await upsertOhlcRows('crypto_spot', [row('100', T1)]);
    expect(await closeNum()).toBe(100);
    expect(new Date((await stored())!.arrived_at as any).getTime()).toBe(T1.getTime());
  });

  // MUTATION: remove `setWhere` from `upsertOhlcRows` and this fails — the stale close lands.
  it('an OLDER arrival written second does NOT overwrite the fresher bar', async (ctx) => {
    if (!dbReachable || !isTestDb) ctx.skip(); // run-time: `it.skipIf` is decided before `beforeAll` runs
    await upsertOhlcRows('crypto_spot', [row('50', T0)]);
    expect(await closeNum()).toBe(100);
    expect(new Date((await stored())!.arrived_at as any).getTime()).toBe(T1.getTime());
  });

  it('a LATER arrival overwrites', async (ctx) => {
    if (!dbReachable || !isTestDb) ctx.skip(); // run-time: `it.skipIf` is decided before `beforeAll` runs
    await upsertOhlcRows('crypto_spot', [row('200', T2)]);
    expect(await closeNum()).toBe(200);
  });

  // MUTATION: change `<=` to `<` and this fails — the same bar re-offered would be refused.
  it('an EQUAL arrival overwrites (the same bar re-offered is accepted)', async (ctx) => {
    if (!dbReachable || !isTestDb) ctx.skip(); // run-time: `it.skipIf` is decided before `beforeAll` runs
    await upsertOhlcRows('crypto_spot', [row('300', T2)]);
    expect(await closeNum()).toBe(300);
  });

  // MUTATION: drop the `IS NULL` arm and this fails — every row written before the column existed
  // would refuse its next update forever.
  it('a stored NULL stamp (a pre-migration row) accepts the first stamped write', async (ctx) => {
    if (!dbReachable || !isTestDb) ctx.skip(); // run-time: `it.skipIf` is decided before `beforeAll` runs
    await db.execute(sql`UPDATE crypto_spot_ohlc_1m SET arrived_at = NULL
      WHERE symbol = ${SYM} AND interval_begin = ${MINUTE.toISOString()}::timestamptz`);
    await upsertOhlcRows('crypto_spot', [row('400', T0)]);
    expect(await closeNum()).toBe(400);
    expect(new Date((await stored())!.arrived_at as any).getTime()).toBe(T0.getTime());
  });
});
