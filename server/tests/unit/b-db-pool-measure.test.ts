import { describe, expect, it } from 'vitest';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type pg from 'pg';
import { attachPoolInstrument, fingerprintSql, labelFor, siteFromStack, sqlTextOf } from '../../db-pool-instrument.js';

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
    expect(field(l, 'slow_hold_sql')).toBe('-');
  });

  it('a flush writes one tagged line and resets the minute', async () => {
    const { pool, lines, flush } = setup();
    await pool.query('select 1');
    flush();
    flush();
    expect(lines).toHaveLength(2);
    expect(lines.every((l) => l.startsWith('[B-DB-POOL-GUARD][POOL_MINUTE_V2] pool=test_pool '))).toBe(true);
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

describe('the query-path label when the stack has no app frame (Step 9: stack -> statement fingerprint -> query)', () => {
  it('reads the SQL text from a string or a { text } config, never the parameters', () => {
    expect(sqlTextOf('select 1')).toBe('select 1');
    expect(sqlTextOf({ name: undefined, text: 'select * from "closed_trades" where "id" = $1', types: {} })).toBe('select * from "closed_trades" where "id" = $1');
    expect(sqlTextOf(undefined)).toBeUndefined();
    expect(sqlTextOf({ values: ['secret'] })).toBeUndefined();
  });
  it('fingerprints to a verb from a closed set plus a plain table name', () => {
    expect(fingerprintSql('select "id" from "closed_trades" where "symbol" = $1')).toBe('sql:select:closed_trades');
    expect(fingerprintSql('SELECT x FROM public.active_open_positions')).toBe('sql:select:active_open_positions');
    expect(fingerprintSql('insert into "regime_factor_alternates" ("a") values ($1)')).toBe('sql:insert:regime_factor_alternates');
    expect(fingerprintSql('update "vts_open_trades" set "closed" = $1')).toBe('sql:update:vts_open_trades');
    expect(fingerprintSql('delete from "system_alerts" where x')).toBe('sql:delete:system_alerts');
    expect(fingerprintSql('begin')).toBe('sql:begin');
    expect(fingerprintSql('SET LOCAL statement_timeout = 20000')).toBe('sql:set');
  });
  it('is safe by construction when values are inlined into the text (sql.raw)', () => {
    const inlined = "select * from xstock_spot_ohlc_1m where symbol IN ('SPY/USD','AAPL/USD') and secret = 'hunter2'";
    expect(fingerprintSql(inlined)).toBe('sql:select:xstock_spot_ohlc_1m');
    expect(fingerprintSql("'; drop table x; --")).toBe('sql:other');
    expect(fingerprintSql('select 1 from "' + 'a'.repeat(60) + '"')).toBe('sql:select');
    for (const t of [inlined, "'; drop table x; --", 'select 1 from "' + 'a'.repeat(60) + '"', 'weird ünïcode from ☃']) {
      expect(fingerprintSql(t)).toMatch(/^sql:[a-z0-9_:]+$/);
    }
  });
  it('orders the fallbacks: a code frame wins, then the fingerprint, then query/connect', () => {
    expect(labelFor('caller@index.js:10', 'select 1 from t', true)).toBe('caller@index.js:10');
    expect(labelFor(null, 'select 1 from t', true)).toBe('sql:select:t');
    expect(labelFor(null, undefined, true)).toBe('query');
    expect(labelFor(null, undefined, false)).toBe('connect');
  });
  it('WIRING: a query issued from library code after an await, as drizzle does, is labelled by its statement', async () => {
    // A stand-in for drizzle-orm/query-promise.js: it lives under node_modules (so siteFromStack drops its frames) and
    // returns a THENABLE (not a Promise) whose then() calls pool.query, exactly like QueryPromise.then: the await
    // machinery calls it from a microtask job, so no application frame is on the stack — the staging shape (Step 7).
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b-db-pool-'));
    const mod = path.join(dir, 'node_modules', 'fake-drizzle', 'index.mjs');
    fs.mkdirSync(path.dirname(mod), { recursive: true });
    fs.writeFileSync(mod, 'export function run(pool, text, hold) { return { then(ok, ko) { return pool.query({ text, types: {} }, hold).then(ok, ko); } }; }\n');
    const { run } = await import(pathToFileURL(mod).href);
    const { pool, lines, flush } = setup();
    await run(pool, 'select "id" from "closed_trades" where "symbol" = $1', 30_001);
    flush();
    fs.rmSync(dir, { recursive: true, force: true });
    expect(field(lines[0], 'via_query')).toBe('1');
    expect(field(lines[0], 'max_hold_site')).toBe('sql:select:closed_trades');
    expect(field(lines[0], 'slow_hold_sql')).toBe('sql:select:closed_trades=30001');
    expect(field(lines[0], 'slow_hold_sites')).toBe('-');
  });

  it('the two label kinds rank separately, three each, so statement families cannot crowd out code labels', async () => {
    const { pool, lines, flush } = setup();
    for (const [name, ms] of [['a', 9000], ['b', 8000], ['c', 7000], ['d', 6000]] as const) {
      const fn = { [`site_${name}`]: async () => { const c = (await (pool as unknown as { connect: () => Promise<FakeClient> }).connect()) as FakeClient; clock.t += ms; c.release(); } }[`site_${name}`];
      await fn();
    }
    flush();
    const sites = field(lines[0], 'slow_hold_sites')!;
    expect(sites.split('|')).toHaveLength(3);
    expect(sites).toMatch(/=9000\|.*=8000\|.*=7000$/);
    expect(field(lines[0], 'slow_hold_sql')).toBe('-');
  });
});
