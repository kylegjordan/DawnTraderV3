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
    const line = spy.mock.calls.map((c) => String(c[0])).find((s) => s.includes('[B-DB-POOL-GUARD][POOL_CLIENT_ERROR]'));
    // NOTE (Langston C1): this stub carries a code; with real pg and a query in flight the event is
    // "Connection terminated unexpectedly" with NO code (the 25P04 goes to the caller's rejection), so production
    // lines read code=none on that path. The staging process-exit run is the integration evidence.
    expect(line).toContain('code=25P04');
    expect(line).toContain('checkedOut=true');
    // Once released it is idle again: the line is still written (never silent, C2) but the counter does not move.
    pool.emit('release', undefined, client);
    spy.mockClear();
    expect(() => client.emit('error', new Error('later'))).not.toThrow();
    expect(getPoolCheckedOutClientErrorCount()).toBe(before + 1);
    expect(String(spy.mock.calls.at(-1)?.[0])).toContain('checkedOut=false');
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

  it('census: every in-process file that builds a pg Pool attaches the shared guard (Langston: three pools, not two)', () => {
    const root = path.join(__dirname, '..', '..', '..');
    const serverFiles: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const f = path.join(d, e.name);
        // Langston C1: server/scripts is NOT excluded — schedulers import from it at run time.
        if (e.isDirectory()) { if (!['tests', 'node_modules'].includes(e.name)) walk(f); }
        else if (/\.ts$/.test(e.name)) serverFiles.push(f);
      }
    };
    walk(path.join(root, 'server'));
    // Langston C3: DERIVE which root scripts/ files run in-process — every import (static or dynamic) from a
    // non-test server file that resolves under <root>/scripts — instead of a hand-kept literal.
    const rootScripts = path.join(root, 'scripts') + path.sep;
    const inProcessRootScripts = new Set<string>();
    for (const f of serverFiles) {
      const src = fs.readFileSync(f, 'utf8');
      for (const m of src.matchAll(/(?:from\s+|import\()\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
        const resolved = path.resolve(path.dirname(f), m[1]).replace(/\.js$/, '');
        if ((resolved + path.sep).startsWith(rootScripts) || resolved.startsWith(rootScripts)) {
          inProcessRootScripts.add(resolved.endsWith('.ts') ? resolved : `${resolved}.ts`);
        }
      }
    }
    expect([...inProcessRootScripts].map((f) => path.basename(f)).sort()).toEqual(['b-new-34b-prewarm-snapshot.ts']);
    const files = [...serverFiles, ...inProcessRootScripts];
    const builders = files.filter((f) => /new (pg\.)?Pool\(/.test(fs.readFileSync(f, 'utf8')));
    // ⚠️ B-CREW-BOARD-REMOVAL deletes crew-coordination.ts: this list then fails by design — update it there.
    expect(builders.map((f) => path.basename(f)).sort()).toEqual(['b-new-34b-prewarm-snapshot.ts', 'crew-coordination.ts', 'db.ts']);
    // Langston C2: require the SHARED guard. The crew board's empty swallow is the one named exemption (its pool
    // has no transaction, so pool.query's own listener covers it) until B-CREW-BOARD-REMOVAL deletes the file.
    const EXEMPT = new Set(['crew-coordination.ts']);
    const unguarded = builders.filter((f) => !EXEMPT.has(path.basename(f)) && !/attachPoolGuards\(/.test(fs.readFileSync(f, 'utf8')));
    expect(unguarded).toEqual([]);
    // B-DB-POOL-GUARD P3 (Langston Step-4 r1 CHANGE): every in-process pool builder sets a SERVER statement_timeout
    // strictly BELOW its CLIENT query_timeout — pg's query_timeout sends no cancel, so at an equal or larger server
    // value the server bound never fires first. The crew board (same EXEMPT; CLI-only, B-CREW-BOARD-REMOVAL) sets them
    // EQUAL, which does NOT satisfy this (the client timer starts at dispatch, the server's at execution).
    const msOf = (src: string, expr: string): number => {
      const e = expr.trim();
      if (/^[0-9_]+$/.test(e)) return Number(e.replace(/_/g, ''));
      const m = src.match(new RegExp(`const ${e} = ([0-9_]+);`));
      if (!m) throw new Error(`unresolved timeout expression: ${e}`);
      return Number(m[1].replace(/_/g, ''));
    };
    // P5 (Langston): EVERY config in a file, not the first — db.ts now builds two pools (main + diagnostic), and a
    // first-match read would have certified the second one unseen.
    let checked = 0;
    for (const f of builders.filter((b) => !EXEMPT.has(path.basename(b)))) {
      const src = fs.readFileSync(f, 'utf8');
      const servers = [...src.matchAll(/statement_timeout: ([A-Za-z0-9_]+),/g)];
      const clients = [...src.matchAll(/query_timeout: ([A-Za-z0-9_]+),/g)];
      const pools = (src.match(/new (pg\.)?Pool\(/g) ?? []).length;
      expect(servers.length, `${path.basename(f)}: one server statement_timeout per pool`).toBe(pools);
      expect(clients.length, `${path.basename(f)}: one client query_timeout per pool`).toBe(pools);
      servers.forEach((sv, i) => {
        expect(msOf(src, sv[1]), `${path.basename(f)} pool ${i + 1}`).toBeLessThan(msOf(src, clients[i][1]));
        checked++;
      });
    }
    expect(checked).toBe(3); // db.ts main + diagnostic, and the prewarm pool; a new builder must pass too
    // P4 fold (Langston): the same order for every ONE-CONNECTION client that sets both bounds (the pool monitor's own
    // client in db-pool-alerts.ts, the xStock snapshot client). A builder that sets neither is outside this rule.
    const exprMs = (src: string, expr: string): number => {
      const m = expr.trim().match(/^([A-Za-z0-9_]+)(?:\s*\+\s*([0-9_]+))?$/);
      if (!m) throw new Error(`unresolved timeout expression: ${expr}`);
      return msOf(src, m[1]) + (m[2] ? Number(m[2].replace(/_/g, '')) : 0);
    };
    let clients = 0;
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      for (const m of src.matchAll(/new (?:pg\.)?Client\(\{([\s\S]*?)\}\)/g)) {
        const block = m[1];
        const sv = block.match(/statement_timeout: ([A-Za-z0-9_ +]+?),/);
        const cl = block.match(/query_timeout: ([A-Za-z0-9_ +]+?),/);
        if (!sv && !cl) continue;
        expect(sv && cl, `${path.basename(f)}: a client sets one bound without the other`).toBeTruthy();
        expect(exprMs(src, sv![1]), path.basename(f)).toBeLessThan(exprMs(src, cl![1]));
        clients++;
      }
    }
    expect(clients).toBe(3); // xstock-db-snapshot.ts, db-pool-alerts.ts, and the B75 snapshot sweep; a new bounded client must pass too
  }, 30_000); // a whole-tree walk: 1.6 s alone, over the 5 s default under full-suite parallel load (2026-11-08)

  it('no whole-transaction time limit is written into the xStock bar writer (scope r3: OBJ-3b withdrawn; R5d retries only the statement-timeout text)', () => {
    const root = path.join(__dirname, '..', '..', '..');
    for (const f of ['server/services/passive-archive/xstock-bar-availability.ts', 'server/services/passive-archive/ohlc-batch-writer.ts']) {
      const src = fs.readFileSync(path.join(root, f), 'utf8');
      expect(src.length).toBeGreaterThan(1000); // the file was read (control)
      expect(src).not.toMatch(/transaction_timeout/);
    }
  });

  it('exactly one listener is registered on the app pool (a second import does not add another)', async () => {
    const { pool } = await import('../../db.js');
    await import('../../db.js');
    expect(pool.listenerCount('error')).toBe(1);
    expect(pool.listenerCount('connect')).toBe(1);
    expect(pool.listenerCount('acquire')).toBe(1);
    // two 'release' listeners by design: the guard's checked-out flag and the P2 measurement (db-pool-instrument.ts)
    expect(pool.listenerCount('release')).toBe(2);
  });
});
