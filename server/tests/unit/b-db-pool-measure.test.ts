import { describe, expect, it } from 'vitest';
import { EventEmitter } from 'node:events';
import type pg from 'pg';
import { attachPoolInstrument, siteFromStack } from '../../db-pool-instrument.js';

// B-DB-POOL-GUARD P2 (#1239): the pool measurement. A stand-in pool that behaves like pg-pool 3.7.0 where it
// matters: query() reaches the pool through this.connect(cb) (index.js:399), so a plain query passes BOTH
// wrappers; connect() with no callback returns a promise (the drizzle transaction path); release emits
// 'release'. The clock is injected so wait and hold are exact.

const clock = { t: 0 };
class FakeClient {
  constructor(private pool: FakePool) {}
  release() { this.pool.emit('release', undefined, this); }
}
class FakePool extends EventEmitter {
  waitMs = 0;
  connect(cb?: (err: Error | undefined, client?: FakeClient, done?: () => void) => void) {
    const client = new FakeClient(this);
    clock.t += this.waitMs; // the time the request spent queued
    if (cb) { cb(undefined, client, () => client.release()); return undefined; }
    return Promise.resolve(client);
  }
  query(_text: string, holdMs = 0) {
    return new Promise((resolve) => {
      (this as unknown as { connect: FakePool['connect'] }).connect((_err, client) => {
        clock.t += holdMs;
        client!.release();
        resolve({ rows: [] });
      });
    });
  }
}

function setup() {
  const pool = new FakePool();
  const lines: string[] = [];
  const inst = attachPoolInstrument(pool as unknown as pg.Pool, 'test_pool', { log: (l) => lines.push(l), now: () => clock.t, intervalMs: 3_600_000 });
  inst.stop();
  return { pool, lines, flush: inst.flush };
}
const field = (line: string, k: string) => line.match(new RegExp(`(?:^| )${k}=(\\S+)`))?.[1];

describe('the pool measurement (P2)', () => {
  it('a plain query is counted ONCE although it passes both wrappers (Langston C2)', async () => {
    const { pool, lines, flush } = setup();
    await pool.query('select 1');
    flush();
    expect(field(lines[0], 'checkouts')).toBe('1');
    expect(field(lines[0], 'via_query')).toBe('1');
    expect(field(lines[0], 'via_connect')).toBe('0');
  });

  it('measures WAIT from the request (queue time included) and HOLD to release, into summable buckets', async () => {
    const { pool, lines, flush } = setup();
    pool.waitMs = 1_500;
    async function slowTransactionSite() {
      const client = (await (pool as unknown as { connect: () => Promise<FakeClient> }).connect()) as FakeClient;
      clock.t += 21_000;
      client.release();
    }
    await slowTransactionSite();
    flush();
    const l = lines[0];
    expect(field(l, 'via_connect')).toBe('1');
    expect([field(l, 'wait_gt_100ms'), field(l, 'wait_gt_1000ms'), field(l, 'wait_gt_5000ms')]).toEqual(['1', '1', '0']);
    expect([field(l, 'hold_gt_20000ms'), field(l, 'hold_gt_25000ms')]).toEqual(['1', '0']);
    expect(field(l, 'max_wait_ms')).toBe('1500');
    expect(field(l, 'max_hold_ms')).toBe('21000');
    // Langston C1: the slow checkout is named by its call site, not by the instrument.
    expect(field(l, 'max_hold_site')).toMatch(/^slowTransactionSite@b-db-pool-measure\.test\.ts:\d+/);
    expect(field(l, 'slow_hold_sites')).toMatch(/slowTransactionSite@b-db-pool-measure\.test\.ts:\d+.*=21000$/);
  });

  it('a flush writes one tagged line and resets the minute', async () => {
    const { pool, lines, flush } = setup();
    await pool.query('select 1');
    flush();
    flush();
    expect(lines).toHaveLength(2);
    expect(lines.every((l) => l.startsWith('[B-DB-POOL-GUARD][POOL_MINUTE_V1] pool=test_pool '))).toBe(true);
    expect(field(lines[1], 'checkouts')).toBe('0');
  });

  it('a plain query is labelled by ITS caller, not by pg-pool or the wrapper (Langston record item i)', async () => {
    const { pool, lines, flush } = setup();
    async function slowQuerySite() { await pool.query('select pg_sleep(2)', 2_000); }
    await slowQuerySite();
    flush();
    expect(field(lines[0], 'via_query')).toBe('1');
    expect(field(lines[0], 'max_hold_site')).toMatch(/^slowQuerySite@b-db-pool-measure\.test\.ts:\d+/);
  });

  it('a checkout still held at flush shows in OPEN, not in checkouts (Langston CHANGE 2)', async () => {
    const { pool, lines, flush } = setup();
    const client = (await (pool as unknown as { connect: () => Promise<FakeClient> }).connect()) as FakeClient;
    flush();
    expect([field(lines[0], 'open'), field(lines[0], 'checkouts')]).toEqual(['1', '0']);
    client.release();
    flush();
    expect([field(lines[1], 'open'), field(lines[1], 'checkouts')]).toEqual(['0', '1']);
  });

  it('attaching twice wraps once', () => {
    const pool = new FakePool();
    attachPoolInstrument(pool as unknown as pg.Pool, 'x', { intervalMs: 3_600_000 }).stop();
    const once = pool.connect;
    attachPoolInstrument(pool as unknown as pg.Pool, 'x', { intervalMs: 3_600_000 }).stop();
    expect(pool.connect).toBe(once);
    expect(pool.listenerCount('release')).toBe(1);
  });
});

describe('siteFromStack — what a label looks like on staging (one bundle, no source map)', () => {
  it('skips node_modules and keeps the first two app frames with function names (wrappers are cut at capture)', () => {
    const stack = [
      'Error',
      '    at NodePgPreparedQuery.execute (file:///home/deploy/dawntrader/node_modules/drizzle-orm/node-postgres/session.js:80:3)',
      '    at async boundedTransaction (file:///home/deploy/dawntrader/dist/index.js:5000:7)',
      '    at async registerXstockWriterBootStart (file:///home/deploy/dawntrader/dist/index.js:5100:3)',
      '    at async Object.main (file:///home/deploy/dawntrader/dist/index.js:9000:1)',
    ].join('\n');
    expect(siteFromStack(stack)).toBe('boundedTransaction@index.js:5000<registerXstockWriterBootStart@index.js:5100');
  });
  it('falls back to null when no app frame exists', () => {
    expect(siteFromStack('Error\n    at x (node:internal/process/task_queues:95:5)')).toBeNull();
    expect(siteFromStack(undefined)).toBeNull();
  });
});
