import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { PoolClient } from 'pg';
import { describe, expect, it } from 'vitest';
import { pool } from '../../db.js';

const url = (pool as { options?: { connectionString?: string } }).options?.connectionString ?? '';
const localTestDb = /^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1|postgres)(:\d+)?\/test(\?|$)/.test(url);
if (process.env.CI && !localTestDb) throw new Error('Retained-ring guard requires the CI-local test database');

const legacyUpsert = `
  INSERT INTO xstock_book_state_rings (symbol, spreads, seed_basis, source, written_at, persisted_at)
  VALUES ($1, $2, 'judged', 'retained', $3, $4)
  ON CONFLICT (symbol) DO UPDATE SET spreads = EXCLUDED.spreads, seed_basis = EXCLUDED.seed_basis,
    source = EXCLUDED.source, written_at = EXCLUDED.written_at, persisted_at = EXCLUDED.persisted_at
`;
const versionedUpsert = `
  INSERT INTO xstock_book_state_rings
    (symbol, spreads, seed_basis, source, written_at, persisted_at, writer_generation, writer_boot_id, writer_sequence)
  VALUES ($1, $2, 'judged', 'retained', $3, $4, $5, $6, $7)
  ON CONFLICT (symbol) DO UPDATE SET spreads = EXCLUDED.spreads, seed_basis = EXCLUDED.seed_basis,
    source = EXCLUDED.source, written_at = EXCLUDED.written_at, persisted_at = EXCLUDED.persisted_at,
    writer_generation = EXCLUDED.writer_generation, writer_boot_id = EXCLUDED.writer_boot_id,
    writer_sequence = EXCLUDED.writer_sequence
`;

describe.skipIf(!localTestDb)('retained-ring D1 database guard', () => {
  it('locks before the symbol row and fences legacy and superseded writes', async (ctx) => {
    const schema = `b_ring_guard_${randomBytes(8).toString('hex')}`;
    const clients: PoolClient[] = [];
    async function checkout() {
      const client = await pool.connect();
      clients.push(client);
      return client;
    }
    let claimant: PoolClient | undefined;
    let created = false;
    try {
      try {
        claimant = await checkout();
      } catch (error) {
        if (process.env.CI) throw error;
        return ctx.skip();
      }
      expect((await claimant.query('SELECT current_database() AS name')).rows[0].name).toBe('test');
      await claimant.query(`CREATE SCHEMA ${schema}`);
      created = true;
      await claimant.query(`SET search_path TO ${schema}`);
      for (const migration of [
        '2026-09-24-b-book-state-restart-durable.sql',
        '2026-11-28-b-xstock-retained-ring-writer-guard.sql',
      ]) {
        await claimant.query(readFileSync(`drizzle/migrations/${migration}`, 'utf8'));
      }
      const writer = await checkout();
      const witness = await checkout();
      for (const client of [writer, witness]) await client.query(`SET search_path TO ${schema}`);

      const symbol = 'D1-GUARD/USD';
      const sourceAt = new Date(1_000);
      const submittedAt = new Date(3_000);
      expect((await writer.query(legacyUpsert, [symbol, '[0.01]', sourceAt, submittedAt])).rowCount).toBe(1);
      expect((await writer.query(legacyUpsert, [symbol, '[0.02]', sourceAt, submittedAt])).rowCount).toBe(1);
      expect((await writer.query("UPDATE xstock_book_state_rings SET spreads = '[0.03]' WHERE symbol = $1", [symbol])).rowCount).toBe(1);

      const [{ pid: claimPid }] = (await claimant.query('SELECT pg_backend_pid() AS pid')).rows;
      const [{ pid: writePid }] = (await writer.query('SELECT pg_backend_pid() AS pid')).rows;
      const bootId = 'bcdd1077-8633-4aa3-8080-d39bd9f3ed05';
      await claimant.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      await claimant.query(
        'UPDATE xstock_book_state_ring_writer_guard SET generation = generation + 1, boot_id = $1 WHERE singleton AND generation = 0',
        [bootId],
      );
      const legacyUpdate = writer.query(
        "UPDATE xstock_book_state_rings SET spreads = '[0.09]' WHERE symbol = $1", [symbol],
      ).then(() => null, (error: unknown) => error);
      await expect.poll(async () => (
        await witness.query('SELECT pg_blocking_pids($1) AS pids', [writePid])
      ).rows[0].pids, { timeout: 3_000 }).toContain(claimPid);

      // If the UPDATE took its tuple lock before the guard, NOWAIT fails.
      expect((await witness.query(
        'SELECT symbol FROM xstock_book_state_rings WHERE symbol = $1 FOR UPDATE NOWAIT', [symbol],
      )).rows).toEqual([{ symbol }]);
      await claimant.query('COMMIT');
      expect(await legacyUpdate).toMatchObject({ code: '55000', message: 'xStock retained-ring writer is fenced' });
      for (const target of [symbol, 'D1-ABSENT/USD']) {
        await expect(writer.query(legacyUpsert, [target, '[0.03]', sourceAt, submittedAt]))
          .rejects.toMatchObject({ code: '55000' });
      }
      await expect(writer.query('DELETE FROM xstock_book_state_rings WHERE symbol = $1', [symbol]))
        .rejects.toMatchObject({ code: '55000' });
      await expect(writer.query('TRUNCATE xstock_book_state_rings')).rejects.toMatchObject({ code: '55000' });

      const newer = [symbol, '[0.04]', sourceAt, submittedAt, 1, bootId, 2];
      expect((await writer.query(versionedUpsert, newer)).rowCount).toBe(1);
      expect((await writer.query(versionedUpsert, [symbol, '[0.05]', sourceAt, submittedAt, 1, bootId, 1])).rowCount).toBe(0);
      expect((await writer.query(versionedUpsert, newer)).rowCount).toBe(0);
      await expect(writer.query("UPDATE xstock_book_state_rings SET spreads = '[0.09]' WHERE symbol = $1", [symbol]))
        .rejects.toMatchObject({ code: '55000', message: 'xStock retained-ring equal version changed payload' });
      for (const [feedStamp, submissionStamp] of [[new Date(2_000), submittedAt], [sourceAt, new Date(4_000)]]) {
        await expect(writer.query(versionedUpsert, [symbol, '[0.04]', feedStamp, submissionStamp, 1, bootId, 2]))
          .rejects.toMatchObject({ code: '55000', message: 'xStock retained-ring equal version changed payload' });
      }
      expect((await witness.query(
        'SELECT symbol, spreads, written_at, persisted_at, writer_generation, writer_boot_id, writer_sequence FROM xstock_book_state_rings',
      )).rows).toEqual([{
        symbol, spreads: [0.04], written_at: sourceAt, persisted_at: submittedAt,
        writer_generation: '1', writer_boot_id: bootId, writer_sequence: '2',
      }]);

      // Reverse the acquisition order. The next boot must wait for this write,
      // then its separate restore statement must see the committed version.
      const replacementBoot = '29427154-71a1-4aad-aaea-4851d0affa3a';
      await writer.query('BEGIN');
      await writer.query(versionedUpsert, [symbol, '[0.06]', sourceAt, submittedAt, 1, bootId, 3]);
      await claimant.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      const nextClaim = claimant.query(
        'UPDATE xstock_book_state_ring_writer_guard SET generation = generation + 1, boot_id = $1 WHERE singleton AND generation = 1',
        [replacementBoot],
      );
      // Handle an unexpected early rejection even if the blocking assertion fails.
      void nextClaim.catch(() => {});
      try {
        await expect.poll(async () => (
          await witness.query('SELECT pg_blocking_pids($1) AS pids', [claimPid])
        ).rows[0].pids, { timeout: 3_000 }).toContain(writePid);
      } finally {
        await writer.query('COMMIT');
      }
      expect((await nextClaim).rowCount).toBe(1);
      const restore = await claimant.query(
        'SELECT spreads, written_at, persisted_at, writer_generation, writer_sequence FROM xstock_book_state_rings WHERE symbol = $1',
        [symbol],
      );
      expect(restore.rows).toEqual([{
        spreads: [0.06], written_at: sourceAt, persisted_at: submittedAt,
        writer_generation: '1', writer_sequence: '3',
      }]);
      await claimant.query('COMMIT');
      for (const target of [symbol, 'D1-ABSENT/USD']) {
        for (const generation of [1, 2]) {
          await expect(writer.query(versionedUpsert, [target, '[0.07]', sourceAt, submittedAt, generation, bootId, 4]))
            .rejects.toMatchObject({ code: '55000', message: 'xStock retained-ring writer is fenced' });
        }
      }
      expect((await witness.query('SELECT symbol, spreads FROM xstock_book_state_rings')).rows).toEqual([{ symbol, spreads: [0.06] }]);
    } finally {
      try {
        for (const client of clients) await client.query('ROLLBACK');
        if (created) await claimant?.query(`DROP SCHEMA ${schema} CASCADE`);
      } finally {
        for (const client of clients) client.release(true);
        await pool.end();
      }
    }
  }, 25_000);
});
