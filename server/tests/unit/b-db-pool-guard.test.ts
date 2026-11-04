import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

// B-DB-POOL-GUARD OBJ-1 (#1239): an idle pooled connection that the database ends must not crash the app.
// pg-pool reports it as pool.emit('error'); with no listener, EventEmitter throws.

describe('the app pool survives an ended idle connection', () => {
  it('control: a pool with no error listener throws on the same event (so the test below can fail)', () => {
    const bare = new pg.Pool({ connectionString: 'postgresql://test:test@localhost:5432/test' });
    expect(() => bare.emit('error', Object.assign(new Error('terminating connection due to administrator command'), { code: '57P01' }), {})).toThrow(
      /administrator command/,
    );
  });

  it('the app pool logs one line naming the code and counts it, and does not throw', async () => {
    const { pool, getPoolIdleClientErrorCount } = await import('../../db.js');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const before = getPoolIdleClientErrorCount();
    expect(() => pool.emit('error', Object.assign(new Error('terminating connection due to administrator command'), { code: '57P01' }), {})).not.toThrow();
    expect(getPoolIdleClientErrorCount()).toBe(before + 1);
    const line = spy.mock.calls.map((c) => String(c[0])).find((s) => s.includes('[B-DB-POOL-GUARD][POOL_IDLE_CLIENT_ERROR]'));
    expect(line).toContain('code=57P01');
    expect(line).toMatch(/total=\d+ idle=\d+ waiting=\d+ count=\d+/);
    spy.mockRestore();
  });

  it('OBJ-1b control: a client checked out with no error listener throws on a connection error', () => {
    const bareClient = new EventEmitter();
    expect(() => bareClient.emit('error', Object.assign(new Error('terminating connection due to transaction timeout'), { code: '25P04' }))).toThrow(
      /transaction timeout/,
    );
  });

  it('OBJ-1b: a CHECKED-OUT client ended by the server logs and counts, and does not throw', async () => {
    const { pool, getPoolCheckedOutClientErrorCount } = await import('../../db.js');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = new EventEmitter();
    pool.emit('connect', client);
    pool.emit('acquire', client);
    const before = getPoolCheckedOutClientErrorCount();
    expect(() => client.emit('error', Object.assign(new Error('terminating connection due to transaction timeout'), { code: '25P04' }))).not.toThrow();
    expect(getPoolCheckedOutClientErrorCount()).toBe(before + 1);
    const line = spy.mock.calls.map((c) => String(c[0])).find((s) => s.includes('[B-DB-POOL-GUARD][POOL_CHECKED_OUT_CLIENT_ERROR]'));
    expect(line).toContain('code=25P04');
    // Once released it is idle again: the per-client listener stays silent (the pool's own listener owns that case).
    pool.emit('release', undefined, client);
    expect(() => client.emit('error', new Error('later'))).not.toThrow();
    expect(getPoolCheckedOutClientErrorCount()).toBe(before + 1);
    spy.mockRestore();
  });

  it('the shared guard works on any pool and attaching twice adds nothing', async () => {
    const { attachPoolGuards, getPoolGuardCounts } = await import('../../db-pool-guards.js');
    const p = new pg.Pool({ connectionString: 'postgresql://test:test@localhost:5432/test' });
    attachPoolGuards(p, 'unit-test-pool');
    attachPoolGuards(p, 'unit-test-pool');
    expect(p.listenerCount('error')).toBe(1);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => p.emit('error', Object.assign(new Error(''), { code: '57P01' }), {})).not.toThrow();
    expect(getPoolGuardCounts('unit-test-pool').idleClientErrors).toBe(1);
    // Langston nit: an empty message falls back to String(err) rather than logging "message=".
    expect(String(spy.mock.calls.at(-1)?.[0])).toMatch(/pool=unit-test-pool code=57P01 message=Error /);
    spy.mockRestore();
  });

  it('census: every in-process file that builds a pg Pool attaches an error guard (Langston: three pools, not two)', () => {
    const root = path.join(__dirname, '..', '..', '..');
    const files: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const f = path.join(d, e.name);
        if (e.isDirectory()) { if (!['tests', 'node_modules', 'scripts'].includes(e.name)) walk(f); }
        else if (/\.ts$/.test(e.name)) files.push(f);
      }
    };
    walk(path.join(root, 'server'));
    files.push(path.join(root, 'scripts', 'b-new-34b-prewarm-snapshot.ts')); // runs in-process via the session-lifecycle controller
    const builders = files.filter((f) => /new (pg\.)?Pool\(/.test(fs.readFileSync(f, 'utf8')));
    expect(builders.map((f) => path.basename(f)).sort()).toEqual(['b-new-34b-prewarm-snapshot.ts', 'crew-coordination.ts', 'db.ts']);
    const unguarded = builders.filter((f) => {
      const s = fs.readFileSync(f, 'utf8');
      return !/attachPoolGuards\(/.test(s) && !/\.on\('error'/.test(s);
    });
    expect(unguarded).toEqual([]);
  });

  it('exactly one listener is registered on the app pool (a second import does not add another)', async () => {
    const { pool } = await import('../../db.js');
    await import('../../db.js');
    expect(pool.listenerCount('error')).toBe(1);
    expect(pool.listenerCount('connect')).toBe(1);
  });
});
