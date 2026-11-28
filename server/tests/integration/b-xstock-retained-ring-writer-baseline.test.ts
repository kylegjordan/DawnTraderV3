/**
 * Retained-ring increment 1, D1 baseline: exercise the existing writer and
 * restore against separate PostgreSQL sessions, with no schema change in use.
 * A shutdown deadline does not prove what happened to the submitted statement.
 */
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';

const { load } = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('../../asset_classes/xstock_spot/book-state-tracker.js', () => ({
  restoreRetainedRings: load,
}));

import { pool } from '../../db.js';
import {
  applyRestoredRings, validateRingRows, RING_SHUTDOWN_FLUSH_TIMEOUT_MS,
} from '../../asset_classes/xstock_spot/book-state-ring-store.js';

// Freeze the pre-guard SQL so this baseline still demonstrates the original
// late-write effect after the production entry point switches to guarded boot.
function legacySnapshot(client: PoolClient, payload: string, submittedAt: number) {
  return client.query(`
    INSERT INTO xstock_book_state_rings (symbol, spreads, seed_basis, source, written_at, persisted_at)
    SELECT x.symbol, x.spreads, x.seed_basis, x.source,
           to_timestamp(x.written_at_ms / 1000.0), to_timestamp($1::double precision / 1000.0)
    FROM jsonb_to_recordset($2::jsonb)
         AS x(symbol text, spreads jsonb, seed_basis text, source text, written_at_ms double precision)
    ON CONFLICT (symbol) DO UPDATE SET
      spreads = EXCLUDED.spreads, seed_basis = EXCLUDED.seed_basis, source = EXCLUDED.source,
      written_at = EXCLUDED.written_at, persisted_at = EXCLUDED.persisted_at
  `, [submittedAt, payload]);
}

// Reuse the enrolled application pool. Refuse before checkout unless its
// configured target is the disposable database provided by the test runner.
const url = (pool as { options?: { connectionString?: string } }).options?.connectionString ?? '';
const localTestDb = /^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1|postgres)(:\d+)?\/test(\?|$)/.test(url);
if (process.env.CI && !localTestDb) throw new Error('Retained-ring baseline requires the CI-local test database');

describe.skipIf(!localTestDb)('retained-ring D1: current PostgreSQL writer', () => {
  it('restores the committed row while a timed-out writer waits, then reads its late overwrite', async (ctx) => {
    const schema = `b_ring_baseline_${randomBytes(8).toString('hex')}`;
    const clients: PoolClient[] = [];
    async function checkout() {
      const client = await pool.connect();
      clients.push(client);
      return client;
    }
    const symbol = 'D1-UNTOUCHED/USD';
    const ring = { symbol, spreads: [0.01], seedBasis: 'judged', source: 'retained', writtenAtMs: 1_000 };
    const laterPayload = { ...ring, spreads: [0.04], writtenAtMs: 2_000 };
    const payload = (entry: typeof ring) => JSON.stringify([{
      symbol: entry.symbol, spreads: entry.spreads, seed_basis: entry.seedBasis,
      source: entry.source, written_at_ms: entry.writtenAtMs,
    }]);
    let reader: PoolClient | undefined;
    let blocker: PoolClient | undefined;
    let schemaCreated = false;
    try {
      try {
        reader = await checkout();
      } catch (error) {
        if (process.env.CI) throw error;
        return ctx.skip();
      }
      const target = await reader.query('SELECT current_database() AS name');
      expect(target.rows[0].name).toBe('test');
      await reader.query(`CREATE SCHEMA ${schema}`);
      schemaCreated = true;
      await reader.query(`SET search_path TO ${schema}`);
      await reader.query(readFileSync(
        'drizzle/migrations/2026-09-24-b-book-state-restart-durable.sql', 'utf8',
      ));
      blocker = await checkout();
      const oldWriter = await checkout();
      const replacement = await checkout();
      for (const client of [blocker, oldWriter, replacement]) {
        await client.query(`SET search_path TO ${schema}`);
      }
      const [{ pid: oldPid }] = (await oldWriter.query('SELECT pg_backend_pid() AS pid')).rows;
      const [{ pid: blockerPid }] = (await blocker.query('SELECT pg_backend_pid() AS pid')).rows;

      expect((await legacySnapshot(reader, payload(ring), 3_000)).rowCount).toBe(1);
      await blocker.query('BEGIN');
      await blocker.query('SELECT symbol FROM xstock_book_state_rings WHERE symbol = $1 FOR UPDATE', [symbol]);

      const submittedAt = Date.now();
      const flush = legacySnapshot(oldWriter, payload(laterPayload), submittedAt);
      void flush.catch(() => {});
      const submittedBy = Date.now();
      const timeout = new Promise<'timeout'>(resolve => {
        setTimeout(() => resolve('timeout'), RING_SHUTDOWN_FLUSH_TIMEOUT_MS).unref();
      });
      expect(await Promise.race([flush, timeout])).toBe('timeout');
      const blockers = await reader.query('SELECT pg_blocking_pids($1) AS pids', [oldPid]);
      expect(blockers.rows[0].pids).toContain(blockerPid);

      load.mockImplementation((rows: Array<{ symbol: string }>) => rows.map(r => r.symbol));
      const { rows } = await replacement.query(
        'SELECT symbol, spreads, seed_basis, source, written_at, persisted_at FROM xstock_book_state_rings',
      );
      expect(applyRestoredRings(validateRingRows(rows, 10))).toBe(1);
      expect(load).toHaveBeenCalledWith([{ ...ring, persistedAtMs: 3_000 }]);

      // No write from the replacement is involved. Release the old request,
      // and read independently after the old connection's queued barrier.
      await blocker.query('COMMIT');
      expect((await flush).rowCount).toBe(1);
      const surviving = await reader.query(
        'SELECT spreads, written_at, persisted_at FROM xstock_book_state_rings WHERE symbol = $1', [symbol],
      );
      expect(surviving.rows).toHaveLength(1);
      const [late] = surviving.rows;
      expect(late.spreads).toEqual(laterPayload.spreads);
      expect(late.written_at).toEqual(new Date(2_000));
      expect(late.persisted_at.getTime()).toBeGreaterThanOrEqual(submittedAt);
      expect(late.persisted_at.getTime()).toBeLessThanOrEqual(submittedBy);
    } finally {
      try {
        await blocker?.query('ROLLBACK');
        if (schemaCreated) await reader?.query(`DROP SCHEMA ${schema} CASCADE`);
      } finally {
        for (const client of clients) client.release(true);
        await pool.end();
        vi.clearAllMocks();
      }
    }
  }, 25_000);
});
