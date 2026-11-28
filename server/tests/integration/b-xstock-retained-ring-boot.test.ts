import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { PoolClient } from 'pg';
import { afterAll, describe, expect, it, vi } from 'vitest';

const { checkout, write, load, capture, addAlert } = vi.hoisted(() => ({
  checkout: vi.fn(), write: vi.fn(), load: vi.fn(), capture: vi.fn(), addAlert: vi.fn(),
}));
vi.mock('../../db.js', () => ({ pool: { connect: checkout }, db: { execute: write } }));
vi.mock('../../asset_classes/xstock_spot/book-state-tracker.js', () => ({
  restoreRetainedRings: load, snapshotRetainableRings: capture,
}));
vi.mock('../../asset_classes/xstock_spot/book-state-config.js', () => ({
  resolveBookStateConfigSync: () => ({ trailingSpreadWindowSnaps: 10 }),
}));
vi.mock('../../services/system-alerts.js', () => ({ addAlert }));

import {
  _resetRingStoreForTest, flushRingSnapshotOnShutdown, persistRingSnapshot, restoreRingsAtBoot, snapshotTick,
} from '../../asset_classes/xstock_spot/book-state-ring-store.js';

const { pool } = await vi.importActual<typeof import('../../db.js')>('../../db.js');
const url = (pool as { options?: { connectionString?: string } }).options?.connectionString ?? '';
const localTestDb = /^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1|postgres)(:\d+)?\/test(\?|$)/.test(url);
if (process.env.CI && !localTestDb) throw new Error('Retained-ring boot requires the CI-local test database');

afterAll(() => pool.end());

describe.skipIf(!localTestDb)('guarded startup with real PostgreSQL', () => {
  it.for([
    'normal', 'lost after commit', 'lost before commit', 'silent after commit', 'different boot at same generation',
    'overlap with older write first', 'overlap with newer write first',
  ] as const)(
    '%s', async (mode, ctx) => {
      _resetRingStoreForTest();
      vi.resetAllMocks();
      const schema = `b_ring_boot_${randomBytes(8).toString('hex')}`;
      let witness: PoolClient;
      try {
        witness = await pool.connect();
      } catch (error) {
        if (process.env.CI) throw error;
        return ctx.skip();
      }
      const symbol = 'D1-RESTORE/USD';
      const source = { symbol, spreads: [0.01], seedBasis: 'judged', source: 'retained', writtenAtMs: 1_000 };
      const otherBootId = 'bcdd1077-8633-4aa3-8080-d39bd9f3ed05';
      const unproved = mode === 'lost before commit' || mode === 'different boot at same generation';
      const loseReply = unproved || mode === 'lost after commit' || mode === 'silent after commit';
      const commands: string[][] = [];
      const pids: number[] = [];
      let created = false;
      try {
        expect((await witness.query('SELECT current_database() AS name')).rows[0].name).toBe('test');
        await witness.query(`CREATE SCHEMA ${schema}`);
        created = true;
        await witness.query(`SET search_path TO ${schema}`);
        for (const migration of [
          '2026-09-24-b-book-state-restart-durable.sql',
          '2026-11-28-b-xstock-retained-ring-writer-guard.sql',
        ]) {
          await witness.query(readFileSync(`drizzle/migrations/${migration}`, 'utf8'));
        }
        await witness.query(
          `INSERT INTO xstock_book_state_rings (symbol, spreads, seed_basis, source, written_at, persisted_at)
           VALUES ($1, '[0.01]', 'judged', 'retained', $2, $3)`,
          [symbol, new Date(1_000), new Date(2_000)],
        );
        checkout.mockImplementation(async () => {
          const client = await pool.connect();
          try {
            await client.query(`SET search_path TO ${schema}`);
            pids.push((await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
          } catch (error) {
            client.release(true);
            throw error;
          }
          const statements: string[] = [];
          const attempt = commands.push(statements);
          return {
            release: (destroy?: boolean) => client.release(destroy),
            query: async (statement: string, parameters?: string[]) => {
              statements.push(statement);
              if (statement === 'COMMIT') {
                expect(load).not.toHaveBeenCalled();
                expect(write).not.toHaveBeenCalled();
                if (attempt === 1 && loseReply) {
                  await client.query(unproved ? 'ROLLBACK' : 'COMMIT');
                  if (mode === 'different boot at same generation') {
                    const takeover = await witness.query(
                      'UPDATE xstock_book_state_ring_writer_guard SET generation = 1, boot_id = $1 WHERE singleton AND generation = 0',
                      [otherBootId],
                    );
                    expect(takeover.rowCount).toBe(1);
                  }
                  if (mode === 'silent after commit') return new Promise(() => {});
                  throw new Error('injected lost database reply');
                }
              }
              return client.query(statement, parameters);
            },
          };
        });
        write.mockImplementation(query => drizzle(witness).execute(query));
        load.mockReturnValue([symbol]);
        capture.mockReturnValue([{ ...source, spreads: [0.02], writtenAtMs: 3_000 }]);
        const restore = restoreRingsAtBoot();
        expect(restoreRingsAtBoot()).toBe(restore);
        expect((await persistRingSnapshot()).written).toBe(0);
        const loaded = await restore;

        expect(commands[0]).toMatchObject([
          'BEGIN ISOLATION LEVEL READ COMMITTED',
          expect.stringContaining('SELECT generation::text'), expect.stringContaining('UPDATE'),
          expect.stringContaining('FROM xstock_book_state_rings'), 'COMMIT',
        ]);
        const [{ generation, boot_id }] = (await witness.query(
          'SELECT generation::text, boot_id FROM xstock_book_state_ring_writer_guard',
        )).rows;

        if (!loseReply) {
          expect(commands).toHaveLength(1);
        } else {
          expect(pids).toHaveLength(2);
          expect(pids[1]).not.toBe(pids[0]);
          const recovery = [
            'BEGIN ISOLATION LEVEL READ COMMITTED',
            expect.stringContaining('FOR SHARE'),
          ];
          expect(commands[1]).toEqual(unproved ? recovery : [
            ...recovery, expect.stringContaining('FROM xstock_book_state_rings'), 'COMMIT',
          ]);
        }

        if (unproved) {
          expect(loaded).toBe(0);
          expect(generation).toBe(mode === 'lost before commit' ? '0' : '1');
          expect(boot_id).toBe(mode === 'lost before commit' ? null : otherBootId);
          expect(load).not.toHaveBeenCalled();
          await snapshotTick();
          await flushRingSnapshotOnShutdown();
          expect(write).not.toHaveBeenCalled();
          await vi.waitFor(() => expect(addAlert).toHaveBeenCalledTimes(1));
        } else {
          expect(loaded).toBe(1);
          expect(generation).toBe('1');
          expect(load).toHaveBeenCalledExactlyOnceWith([{ ...source, persistedAtMs: 2_000 }]);
          expect((await persistRingSnapshot(4_000)).written).toBe(1);
          expect(addAlert).not.toHaveBeenCalled();
        }
        const { rows } = await witness.query(
          'SELECT spreads, written_at, persisted_at, writer_generation, writer_boot_id, writer_sequence FROM xstock_book_state_rings',
        );
        expect(rows).toEqual(unproved ? [{
          spreads: [0.01], written_at: new Date(1_000), persisted_at: new Date(2_000),
          writer_generation: null, writer_boot_id: null, writer_sequence: null,
        }] : [{
          spreads: [0.02], written_at: new Date(3_000), persisted_at: new Date(4_000),
          writer_generation: '1', writer_boot_id: boot_id, writer_sequence: '1',
        }]);

        if (mode === 'overlap with older write first' || mode === 'overlap with newer write first') {
          const olderFirst = mode === 'overlap with older write first';
          const writers: PoolClient[] = [];
          try {
            for (let i = 0; i < 2; i++) {
              const client = await pool.connect();
              writers.push(client);
              await client.query(`SET search_path TO ${schema}`);
            }
            const older = { ...source, spreads: [0.03], writtenAtMs: 6_000 };
            const newer = { ...source, spreads: [0.04], writtenAtMs: 5_000 };
            capture.mockReturnValueOnce([older]).mockReturnValueOnce([newer]);
            let unblock!: () => void;
            const held = new Promise<void>(resolve => { unblock = resolve; });
            write.mockReset().mockImplementationOnce(async query => {
              if (!olderFirst) await held;
              return drizzle(writers[0]).execute(query);
            }).mockImplementationOnce(async query => {
              if (olderFirst) await held;
              return drizzle(writers[1]).execute(query);
            });
            // Exercise a wall-clock regression as well as both submission orders.
            // The application captures the older invocation first in both cases.
            const olderWrite = persistRingSnapshot(8_000);
            const newerWrite = persistRingSnapshot(7_000);
            const allResults = Promise.allSettled([olderWrite, newerWrite]);
            const durable = async () => (await witness.query(
              'SELECT spreads, written_at, persisted_at, writer_generation, writer_boot_id, writer_sequence FROM xstock_book_state_rings WHERE symbol = $1',
              [symbol],
            )).rows;
            const expectedNewer = [{
              spreads: [0.04], written_at: new Date(5_000), persisted_at: new Date(7_000),
              writer_generation: '1', writer_boot_id: boot_id, writer_sequence: '3',
            }];
            try {
              expect(await (olderFirst ? olderWrite : newerWrite)).toMatchObject({ written: 1 });
              expect(await durable()).toEqual(olderFirst ? [{
                spreads: [0.03], written_at: new Date(6_000), persisted_at: new Date(8_000),
                writer_generation: '1', writer_boot_id: boot_id, writer_sequence: '2',
              }] : expectedNewer);
            } finally {
              unblock();
              await allResults;
            }
            expect(await olderWrite).toMatchObject({ written: olderFirst ? 1 : 0 });
            expect(await newerWrite).toMatchObject({ written: 1 });
            expect(await durable()).toEqual(expectedNewer);
          } finally {
            for (const writer of writers) writer.release(true);
          }
        }
      } finally {
        try {
          if (created) await witness.query(`DROP SCHEMA ${schema} CASCADE`);
        } finally {
          witness.release(true);
        }
      }
    }, 15_000,
  );
});
