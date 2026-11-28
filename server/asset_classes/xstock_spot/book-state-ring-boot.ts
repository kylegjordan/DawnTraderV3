import { randomUUID } from 'node:crypto';
import type { QueryResult } from 'pg';
import { pool } from '../../db.js';

type RingStoreRow = Record<string, unknown>;
export interface RingWriterAuthority {
  readonly generation: string;
  readonly bootId: string;
}

interface BootConnection {
  query(sql: string, parameters?: string[]): Promise<QueryResult<RingStoreRow>>;
  release(destroy?: boolean): void;
}

const BOOT_BUDGET_MS = 5_000;
const MAX_COMMIT_RECOVERY_RESERVE_MS = 1_000;
const RESTORE_SQL = 'SELECT symbol, spreads, seed_basis, source, written_at, persisted_at FROM xstock_book_state_rings';

function timeLeft(deadline: number): number {
  const remaining = deadline - performance.now();
  if (remaining <= 0) throw new Error('xStock retained-ring boot deadline expired');
  return remaining;
}

async function beforeDeadline<T>(pending: Promise<T>, deadline: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const expired = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error('xStock retained-ring boot deadline expired')), Math.max(0, Math.ceil(deadline - performance.now())));
    });
    const result = await Promise.race([pending, expired]);
    timeLeft(deadline);
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

/** One boot claim, with at most one fresh-primary proof of an ambiguous COMMIT. */
export async function claimAndRestoreRings(
  checkout: () => Promise<BootConnection> = () => pool.connect(),
  budgetMs = BOOT_BUDGET_MS,
): Promise<{ authority: RingWriterAuthority; rows: RingStoreRow[] }> {
  const deadline = performance.now() + budgetMs;
  const bootId = randomUUID();

  async function connect(): Promise<BootConnection> {
    timeLeft(deadline);
    const pending = checkout();
    try {
      return await beforeDeadline(pending, deadline);
    } catch (error) {
      // A pool waiter can still get a client after our deadline. Do not leak it.
      void pending.then(client => client.release(true), () => {});
      throw error;
    }
  }

  type Query = BootConnection['query'];
  async function transaction<T>(work: (query: Query) => Promise<T>, beforeCommit?: (result: T) => void): Promise<T> {
    const client = await connect();
    let committed = false;
    const query: Query = (sql, parameters) => {
      timeLeft(deadline);
      return beforeDeadline(client.query(sql, parameters), deadline);
    };
    try {
      await query('BEGIN ISOLATION LEVEL READ COMMITTED');
      const result = await work(query);
      const remaining = timeLeft(deadline);
      // Leave part of the original budget for an independent read if COMMIT goes silent.
      const reserve = beforeCommit ? Math.min(MAX_COMMIT_RECOVERY_RESERVE_MS, remaining / 2) : 0;
      beforeCommit?.(result);
      const commit = await beforeDeadline(client.query('COMMIT'), deadline - reserve);
      if (commit.command !== 'COMMIT') throw new Error('xStock retained-ring boot transaction did not commit');
      committed = true;
      return result;
    } finally {
      client.release(!committed);
    }
  }

  let attemptedCommit: RingWriterAuthority | undefined;
  try {
    return await transaction(async query => {
      const expected = (await query('SELECT generation::text FROM xstock_book_state_ring_writer_guard WHERE singleton')).rows[0]?.generation;
      if (typeof expected !== 'string') throw new Error('xStock retained-ring writer guard missing');
      const generation = (await query(
        `UPDATE xstock_book_state_ring_writer_guard SET generation = generation + 1, boot_id = $2::uuid
         WHERE singleton AND generation = $1::bigint RETURNING generation::text`,
        [expected, bootId],
      )).rows[0]?.generation;
      if (typeof generation !== 'string') throw new Error('xStock retained-ring boot claim lost to another writer');
      const authority = { bootId, generation };
      const { rows } = await query(RESTORE_SQL);
      return { authority, rows };
    }, ({ authority }) => { attemptedCommit = authority; });
  } catch (error) {
    if (!attemptedCommit) throw error;
    const authority = attemptedCommit;
    return transaction(async query => {
      const proof = await query(
        `SELECT generation::text, boot_id FROM xstock_book_state_ring_writer_guard
         WHERE singleton AND generation = $1::bigint AND boot_id = $2::uuid FOR SHARE`,
        [authority.generation, authority.bootId],
      );
      if (proof.rows[0]?.generation !== authority.generation || proof.rows[0]?.boot_id !== authority.bootId) {
        throw new Error('xStock retained-ring boot COMMIT could not be proved');
      }
      const { rows } = await query(RESTORE_SQL);
      return { authority, rows };
    });
  }
}
