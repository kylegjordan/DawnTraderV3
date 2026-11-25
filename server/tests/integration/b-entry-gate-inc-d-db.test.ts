import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Client, Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { InsertRtbSignal } from '../../../shared/schema.js';

const mocks = vi.hoisted(() => ({ writer: undefined as unknown, observer: undefined as unknown }));
vi.mock('../../db.js', () => ({ db: mocks.writer, diagDb: mocks.observer }));

const connectionString = process.env.DATABASE_URL ?? '';
const localTestDb = connectionString === 'postgresql://test:test@localhost:5432/test';
const schema = `entry_gate_d_${randomBytes(6).toString('hex')}`;
let reader: Client | undefined;
let writer: Pool | undefined;
let diagnostic: Pool | undefined;
let reachable = false;
let created = false;

describe('Entry Gate increment D with independent PostgreSQL connections', () => {
  beforeAll(async () => {
    if (!localTestDb) {
      if (process.env.CI) throw new Error('Expected the CI test database');
      return;
    }
    reader = new Client({ connectionString, connectionTimeoutMillis: 1500 });
    try {
      await reader.connect();
    } catch (error) {
      if (process.env.CI) throw error;
      return;
    }
    reachable = true;
    // The isolated table uses the real migrated schema and constraints. The
    // production writer and observer both resolve their normal unqualified name.
    await reader.query(`CREATE SCHEMA ${schema}`);
    created = true;
    await reader.query(`CREATE TABLE ${schema}.rtb_signals (LIKE public.rtb_signals INCLUDING ALL)`);
    const config = { connectionString, options: `-c search_path=${schema},public`, max: 1 };
    writer = new Pool(config);
    diagnostic = new Pool(config);
    mocks.writer = drizzle(writer);
    mocks.observer = drizzle(diagnostic);
  });

  afterAll(async () => {
    try {
      await Promise.all([writer?.end(), diagnostic?.end()]);
      if (created) {
        await reader?.query(`DROP TABLE IF EXISTS ${schema}.rtb_signals`);
        await reader?.query(`DROP SCHEMA ${schema}`);
      }
    } finally {
      await reader?.end();
    }
  });

  it('returns two explicit zeros, then counts one snapshot after a confirmed insert, an in-place status change and a reissue', async ctx => {
    if (!reachable) return ctx.skip();
    const { readEntryGateQueueSnapshot } = await import('../../core/observability/entry-gate-evidence.js');
    const { storage } = await import('../../storage.js');
    const read = () => readEntryGateQueueSnapshot();
    expect(await read()).toMatchObject({ crypto: 0, xstock: 0, observed_at: expect.any(Number) });

    const crypto: InsertRtbSignal = {
      mode: 'paper', signalId: 'egd-first', symbol: 'EGD/USD', strategy: 'strong_bull_trend',
      entryPrice: '10', stopPrice: '9', targetPrice: '12', confidence: '0.8', riskScore: '0.2',
      expectedReturn: '0.01', status: 'active', assetClass: 'crypto_spot',
    };
    const inserted = await storage.upsertRtbSignal(crypto);
    expect(inserted.id).toEqual(expect.any(String));
    expect((await reader!.query(
      `SELECT id, status FROM ${schema}.rtb_signals WHERE id = $1`, [inserted.id],
    )).rows).toEqual([{ id: inserted.id, status: 'active' }]);
    expect(await read()).toMatchObject({ crypto: 1, xstock: 0 });

    await reader!.query(`UPDATE ${schema}.rtb_signals SET status = 'reconfirmed' WHERE id = $1`, [inserted.id]);
    await storage.upsertRtbSignal({ ...crypto, signalId: 'egd-xstock', symbol: 'EGDX/USD', assetClass: 'xstock_spot' });
    await storage.upsertRtbSignal({ ...crypto, signalId: 'egd-live', mode: 'live' });
    await storage.upsertRtbSignal({ ...crypto, signalId: 'egd-rejected', symbol: 'EGDR/USD', status: 'rejected' });
    expect(await read()).toMatchObject({ crypto: 1, xstock: 1 });

    const reissued = await storage.upsertRtbSignal({ ...crypto, signalId: 'egd-reissue', entryPrice: '10.5' });
    expect(reissued.id).toBe(inserted.id);
    expect((await reader!.query(
      `SELECT id, signal_id, status, entry_price::float8 FROM ${schema}.rtb_signals WHERE symbol = $1 AND mode = 'paper'`,
      [crypto.symbol],
    )).rows).toEqual([{ id: inserted.id, signal_id: 'egd-first', status: 'active', entry_price: 10.5 }]);
    expect(await read()).toMatchObject({ crypto: 1, xstock: 1 });
  });
});
