// B-CLOSE-WRITER-COSTS increment 2 (scope OBJ-3/OBJ-4/OBJ-5; pre-audit P-5..P-8) — open positions carry their mode.
//
// Kyle KD-24 (modes are independent) and KD-25 (one position per symbol per mode). What this file pins:
//   M-1..M-4  the REAL storage methods, run against a recording stand-in for the database; each query's WHERE clause is
//             rendered to SQL by drizzle's own dialect, so the test reads the query that would be sent — not source text.
//   M-5       the declared schema: exactly ONE uniqueness rule on the table, (symbol, mode).
//   M-6       the migration: refuses unless the old rule is exactly unique_symbol_side, swaps it, bounds its lock wait.
//   M-7       the engine's open insert names `mode` and pins `side: 'buy'` (pre-audit (d): side left the key).
//   M-8       every getActiveOpenPositions call site passes a TradingMode (P-7) and the unused by-symbol read is gone (OBJ-8).
//
// POSITIVE CONTROLS (mutation-proved while writing): removing the mode predicate from getActiveOpenPositions fails M-1;
// removing it from the dedup-return's read fails M-4; declaring the unique rule on (symbol) alone fails M-5.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PgDialect } from 'drizzle-orm/pg-core';

const cap = vi.hoisted(() => ({
  wheres: [] as unknown[],
  inserted: [] as Record<string, unknown>[],
  insertError: null as unknown,
  rows: [] as unknown[],
}));

vi.mock('../../db', () => {
  const thenable = (rows: () => unknown[]) => {
    const q: Record<string, unknown> = {};
    q.from = () => q;
    q.where = (c: unknown) => { cap.wheres.push(c); return q; };
    q.orderBy = () => q;
    q.limit = () => q;
    q.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(rows()).then(ok, bad);
    return q;
  };
  return {
    db: {
      select: () => thenable(() => cap.rows),
      insert: () => ({
        values: (v: Record<string, unknown>) => {
          cap.inserted.push(v);
          return { returning: () => (cap.insertError ? Promise.reject(cap.insertError) : Promise.resolve([{ id: 'pos-new', ...v }])) };
        },
      }),
      delete: () => ({ where: (c: unknown) => { cap.wheres.push(c); return Promise.resolve(); } }),
    },
    pool: {},
  };
});

import { storage } from '../../storage';

const dialect = new PgDialect();
const render = (c: unknown) => dialect.sqlToQuery(c as never);
const lastWhere = () => render(cap.wheres[cap.wheres.length - 1]);

beforeEach(() => {
  cap.wheres.length = 0; cap.inserted.length = 0; cap.insertError = null; cap.rows = [];
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

const SRC = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8').replace(/\r\n/g, '\n');
const OPEN = { symbol: 'BTC/USD', strategyName: 'momentum', side: 'buy', quantity: '1', avgPrice: '100' } as never;

describe('B-CLOSE-WRITER-COSTS — open positions carry their mode (KD-24, KD-25)', () => {
  it('M-1 getActiveOpenPositions reads ONLY the asked mode', async () => {
    await storage.getActiveOpenPositions('live');
    const q = lastWhere();
    expect(q.sql).toMatch(/"active_open_positions"\."mode" = \$1/);
    expect(q.params).toEqual(['live']);
  });

  it('M-2 deleteActiveOpenPosition deletes by id AND mode — one mode can never delete the other\'s row', async () => {
    await storage.deleteActiveOpenPosition('paper', 'pos-1');
    const q = lastWhere();
    expect(q.sql).toMatch(/"active_open_positions"\."id" = \$1/);
    expect(q.sql).toMatch(/"active_open_positions"\."mode" = \$2/);
    expect(q.params).toEqual(['pos-1', 'paper']);
  });

  it('M-3 the insert carries the METHOD\'s mode, even when the caller\'s own field says otherwise', async () => {
    const r = await storage.createActiveOpenPosition('live', { ...(OPEN as object), mode: 'paper' } as never);
    expect(r.created).toBe(true);
    expect(cap.inserted[0].mode).toBe('live');
  });

  it('M-4 a duplicate (23505) returns the winner IN THIS MODE with created=false (#508 compensation)', async () => {
    cap.insertError = Object.assign(new Error('duplicate key value violates unique constraint "unique_symbol_mode"'), { code: '23505' });
    cap.rows = [{ id: 'pos-winner' }];
    const r = await storage.createActiveOpenPosition('paper', OPEN);
    expect(r).toEqual({ position: { id: 'pos-winner' }, created: false });
    const q = lastWhere();
    expect(q.sql).toMatch(/"active_open_positions"\."symbol" = \$1/);
    expect(q.sql).toMatch(/"active_open_positions"\."mode" = \$2/);
    expect(q.params).toEqual(['BTC/USD', 'paper']);
  });

  it('M-4b findOpenTradeRecord fetches 4 so a count under its cap states the cap (Langston inc-1 C-2)', async () => {
    cap.rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    expect(await storage.findOpenTradeRecord('paper', 'BTC/USD', 'crypto_spot')).toEqual({ status: 'many', ids: ['a', 'b', 'c'], more: true });
    cap.rows = [{ id: 'a' }, { id: 'b' }];
    expect(await storage.findOpenTradeRecord('paper', 'BTC/USD', 'crypto_spot')).toEqual({ status: 'many', ids: ['a', 'b'], more: false });
    const q = lastWhere();
    expect(q.params).toEqual(['paper', 'BTC/USD', 'crypto_spot']);
  });

  it('M-5 the schema declares exactly ONE uniqueness rule on the table: (symbol, mode)', () => {
    const src = SRC('../shared/schema.ts');
    const start = src.indexOf('export const activeOpenPositions = pgTable("active_open_positions"');
    const end = src.indexOf('}));', start);
    expect(start).toBeGreaterThan(-1);
    const block = src.slice(start, end);
    expect(block).toContain('mode: tradingModeEnum("mode").notNull()');
    const rules = block.match(/\b(unique|uniqueIndex)\(/g) ?? [];
    expect(rules).toHaveLength(1);
    expect(block).toContain('unique("unique_symbol_mode").on(table.symbol, table.mode)');
  });

  it('M-6 the migration refuses on an unexpected rule set, swaps the rule in one transaction, bounds its lock wait', () => {
    const m = SRC('../drizzle/migrations/2026-11-05-b-close-writer-costs-open-positions-mode.sql');
    expect(m).toMatch(/BEGIN;[\s\S]*SET LOCAL lock_timeout = '5s';[\s\S]*COMMIT;/);
    expect(m).toContain("IF uniq IS DISTINCT FROM ARRAY['unique_symbol_side']::text[] THEN");
    expect(m).toContain("IF def IS DISTINCT FROM 'UNIQUE (symbol, side)' THEN");
    expect(m).toContain("ADD COLUMN mode trading_mode NOT NULL DEFAULT 'paper'");
    expect(m).toContain('DROP CONSTRAINT unique_symbol_side;');          // no IF EXISTS — absence must fail
    expect(m).toContain('ADD CONSTRAINT unique_symbol_mode UNIQUE (symbol, mode);');
    const manifest = SRC('../drizzle/migrations/MANIFEST.txt');
    expect(manifest).toContain('2026-11-05-b-close-writer-costs-open-positions-mode.sql');
    expect(manifest).not.toContain('2026-11-05-b-close-writer-costs-open-positions-mode-rollback.sql');
  });

  it('M-7 the engine\'s open insert names its mode and pins side: \'buy\' (side is no longer in the key)', () => {
    const e = SRC('services/active-execution-engine.ts');
    const at = e.indexOf('await storage.createActiveOpenPosition(this.mode, {');
    expect(at).toBeGreaterThan(-1);
    const call = e.slice(at, e.indexOf('});', at));
    expect(call).toMatch(/\n\s+mode: this\.mode,/);
    expect(call).toMatch(/\n\s+side: 'buy',/);
  });

  it('M-8 every getActiveOpenPositions call passes a TradingMode; the by-symbol read is deleted (OBJ-8)', () => {
    const files = ['routes.ts', 'index.ts', 'services/active-execution-engine.ts', 'services/active-engine-service.ts',
      'services/active-portfolio-manager.ts', 'storage.ts'];
    const args = new Set<string>();
    for (const f of files) for (const m of SRC(f).matchAll(/getActiveOpenPositions\(([^)]*)\)/g)) args.add(m[1].trim());
    expect(args.size).toBeGreaterThan(0);
    for (const a of args) expect(["'paper'", "'live'", 'this.mode', 'mode', 'mode: TradingMode']).toContain(a);
    for (const f of files) expect(SRC(f)).not.toContain('getActiveOpenPositionBySymbol');
  });
});
