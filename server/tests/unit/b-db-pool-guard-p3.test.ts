import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

// B-DB-POOL-GUARD P3 (#1239, increment 3): the app pool's server-side bounds and their ORDER.
// Source-read on purpose: importing server/db.ts builds the live pool. What this pins: the app pool's values
// and its order; EVERY `SET LOCAL statement_timeout` in server code below the pool's statement_timeout (a census
// with a count control); and the xStock snapshot client's server bound below its client bound. The per-builder
// server < client check for every in-process POOL lives in the sibling fence, b-db-pool-guard.test.ts.
const DB_TS = readFileSync(join(__dirname, '../../db.ts'), 'utf8');
const XSTOCK_TS = readFileSync(join(__dirname, '../../services/passive-archive/xstock-bar-availability.ts'), 'utf8');

function constMs(src: string, name: string): number {
  const m = src.match(new RegExp(`const ${name} = ([0-9_]+);`));
  if (!m) throw new Error(`${name} not found`);
  return Number(m[1].replace(/_/g, ''));
}

describe('B-DB-POOL-GUARD P3 — the pool bounds', () => {
  const stmt = constMs(DB_TS, 'POOL_STATEMENT_TIMEOUT_MS');
  const query = constMs(DB_TS, 'POOL_QUERY_TIMEOUT_MS');

  it('the values are the Langston-approved ones (25 s server, 30 s client)', () => {
    expect(stmt).toBe(25_000);
    expect(query).toBe(30_000);
  });

  it('the server bound fires BEFORE the client bound (pg query_timeout sends no cancel)', () => {
    expect(stmt).toBeLessThan(query);
    expect(DB_TS).toMatch(/if \(!\(POOL_STATEMENT_TIMEOUT_MS < POOL_QUERY_TIMEOUT_MS\)\) \{\s*throw new Error/);
  });

  it('POOL_CONFIG carries all three bounds and uses the named constants', () => {
    const cfg = DB_TS.slice(DB_TS.indexOf('const POOL_CONFIG = {'), DB_TS.indexOf('} as const;'));
    expect(cfg).toMatch(/query_timeout: POOL_QUERY_TIMEOUT_MS,/);
    expect(cfg).toMatch(/statement_timeout: POOL_STATEMENT_TIMEOUT_MS,/);
    expect(cfg).toMatch(/idle_in_transaction_session_timeout: 60_000,/);
    expect(cfg).toMatch(/connectionTimeoutMillis: 10_000,/);
  });

  it('the boot line reports all three, so Step 7 can read them from the log', () => {
    for (const k of ['statement_timeout', 'idle_in_transaction_session_timeout', 'connectionTimeoutMillis']) {
      expect(DB_TS).toContain(`${k}=\${POOL_CONFIG.${k}}`);
    }
  });

  it('the xStock transaction bound stays BELOW the pool statement bound (Langston R5d, restated at C2)', () => {
    expect(constMs(XSTOCK_TS, 'XSTOCK_TX_STATEMENT_TIMEOUT_MS')).toBeLessThan(stmt);
  });

  it('EVERY SET LOCAL statement_timeout in server code is below the pool bound (census, not a named list)', () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const f = join(d, e.name);
        if (e.isDirectory()) { if (!['tests', 'node_modules'].includes(e.name)) walk(f); }
        else if (/\.ts$/.test(e.name)) files.push(f);
      }
    };
    walk(join(__dirname, '../..'));
    let sites = 0;
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/SET LOCAL statement_timeout = \$\{([A-Za-z0-9_]+)\}/g)) {
        expect(constMs(src, m[1]), `${f}: ${m[1]}`).toBeLessThan(stmt);
        sites++;
      }
    }
    // Control: the two known sites (xstock-bar-availability 20 s, drift-dashboard-aggregator 4 s) were found.
    expect(sites).toBeGreaterThanOrEqual(2);
  });

  it('the xStock snapshot client sets its server bound below its client bound', () => {
    const snap = readFileSync(join(__dirname, '../../services/passive-archive/xstock-db-snapshot.ts'), 'utf8');
    expect(snap).toMatch(/statement_timeout: XSTOCK_SNAPSHOT_STATEMENT_TIMEOUT_MS,/);
    expect(snap).toMatch(/query_timeout: XSTOCK_SNAPSHOT_STATEMENT_TIMEOUT_MS \+ [1-9][0-9]*,/);
  });
});
