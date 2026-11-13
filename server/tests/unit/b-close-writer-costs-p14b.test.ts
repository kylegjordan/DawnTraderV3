import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// B-CLOSE-WRITER-COSTS P-14b (pre-audit "AMENDMENT — P-14b" + "P-14b r2", Langston Step-2 gate): the 16 money / class /
// mode column defaults are dropped, by migration AND in shared/schema.ts, so schema and database never disagree.
// The behaviour of the SQL against a real database runs in CI (db:migrate applies the forward file to CI's tables).

const ROOT = path.join(__dirname, '../../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const FORWARD = 'drizzle/migrations/2026-11-13-b-close-writer-costs-drop-defaults.sql';
const ROLLBACK = 'drizzle/migrations/2026-11-13-b-close-writer-costs-drop-defaults-rollback.sql';

const TARGETS: Record<string, string[]> = {
  closed_trades: ['fees', 'slippage', 'entry_fee', 'exit_fee', 'total_fee', 'entry_slippage', 'exit_slippage', 'total_cost',
    'gross_pnl', 'net_pnl', 'net_pnl_percent', 'asset_class'],
  active_open_positions: ['entry_fee', 'entry_slippage', 'asset_class', 'mode'],
};
// the kept DECLARED defaults (Langston's 14, P-14b r2) — opened_at / last_updated use defaultNow(), not .default(
const KEPT: Record<string, string[]> = {
  closed_trades: ['id', 'exchange', 'phantom_fill_suspect', 'record_restored_from_position', 'signal_type', 'trade_mode', 'ladder_rungs_hit'],
  active_open_positions: ['id', 'exchange', 'state', 'trade_mode', 'signal_type'],
};

/** The pgTable(...) block of one table in schema.ts, by its database name. */
function tableBlock(src: string, dbName: string): string {
  const start = src.indexOf(`pgTable("${dbName}"`);
  expect(start, dbName).toBeGreaterThan(-1);
  // the column object closes at the first line that STARTS with '}' ('}, (table) => …' or '});')
  const m = /\n\}/.exec(src.slice(start));
  expect(m, `${dbName} block end`).not.toBeNull();
  return src.slice(start, start + (m as RegExpExecArray).index);
}
function columnLine(block: string, col: string): string {
  const lines = block.split(/\r?\n/).filter((l) => l.includes(`("${col}"`));
  expect(lines.length, col).toBe(1);
  return lines[0];
}

describe('P-14b — shared/schema.ts declares no default on the 16, and keeps the rest', () => {
  const schema = read('shared/schema.ts');
  for (const [table, cols] of Object.entries(TARGETS)) {
    it(`${table}: the targeted columns carry no .default(`, () => {
      const block = tableBlock(schema, table);
      for (const c of cols) expect(columnLine(block, c), `${table}.${c}`).not.toContain('.default(');
    });
  }
  for (const [table, cols] of Object.entries(KEPT)) {
    it(`${table}: the kept columns still carry their .default(`, () => {
      const block = tableBlock(schema, table);
      for (const c of cols) expect(columnLine(block, c), `${table}.${c}`).toContain('.default(');
    });
  }
});

describe('P-14b — the migration drops exactly the 16, after its guard, inside one transaction', () => {
  const sql = read(FORWARD);
  it('one transaction with SET LOCAL lock_timeout', () => {
    expect(sql).toMatch(/^BEGIN;\s*\n\s*SET LOCAL lock_timeout = '5s';/m);
    expect((sql.match(/^COMMIT;/gm) ?? []).length).toBe(1);
  });
  it('drops exactly the 16 (table, column) pairs and nothing else', () => {
    const drops = [...sql.matchAll(/^ALTER TABLE (\w+) ALTER COLUMN (\w+)\s+DROP DEFAULT;/gm)].map((m) => `${m[1]}.${m[2]}`).sort();
    const want = Object.entries(TARGETS).flatMap(([t, cs]) => cs.map((c) => `${t}.${c}`)).sort();
    expect(drops).toEqual(want);
    expect(drops.length).toBe(16);
  });
  it('the guard and the before-snapshot run BEFORE the first drop; the postcondition after the last', () => {
    const iSnap = sql.indexOf('CREATE TEMP TABLE _p14b_before');
    const iGuard = sql.indexOf('DO $guard$');
    const iFirstDrop = sql.indexOf('DROP DEFAULT;');
    const iCheck = sql.indexOf('DO $check$');
    expect(iSnap).toBeGreaterThan(-1);
    expect(iSnap).toBeLessThan(iGuard);
    expect(iGuard).toBeLessThan(iFirstDrop);
    expect(sql.lastIndexOf('DROP DEFAULT;')).toBeLessThan(iCheck);
  });
  it('the guard matches by evaluated value and lets an already-dropped target pass (a re-run is a no-op)', () => {
    expect(sql).toContain("EXECUTE format('SELECT (%s)::text', r.d) INTO got;");
    expect(sql).toMatch(/IF r\.d IS NOT NULL THEN/);
  });
  it('a default containing a call is refused BEFORE anything is evaluated (Langston Step 4 A)', () => {
    const iRefuse = sql.indexOf("IF r.d ~ '\\(' THEN");
    expect(iRefuse).toBeGreaterThan(-1);
    expect(iRefuse).toBeLessThan(sql.indexOf('EXECUTE format('));
  });
  it('the postcondition checks the kept defaults by (table, column) pair against the snapshot', () => {
    expect(sql).toMatch(/IS DISTINCT FROM b\.d/);
    expect(sql).toMatch(/kept default\(s\) changed, % appeared/);
  });
  it('the header states the reverse rollback order (Langston C-4)', () => {
    expect(sql).toMatch(/RUN THE ROLLBACK SCRIPT FIRST/);
    expect(sql).toMatch(/cannot go back past d01da3d86/);
  });
});

describe('P-14b — the rollback restores the 16 and is never applied by db:migrate', () => {
  it('SET DEFAULT on exactly the 16 pairs, deletes the ledger row, states the order', () => {
    const rb = read(ROLLBACK);
    const sets = [...rb.matchAll(/^ALTER TABLE (\w+) ALTER COLUMN (\w+)\s+SET DEFAULT /gm)].map((m) => `${m[1]}.${m[2]}`).sort();
    const want = Object.entries(TARGETS).flatMap(([t, cs]) => cs.map((c) => `${t}.${c}`)).sort();
    expect(sets).toEqual(want);
    expect(rb).toContain("DELETE FROM _migrations WHERE name = '2026-11-13-b-close-writer-costs-drop-defaults.sql';");
    expect(rb).toMatch(/run THIS FIRST, then roll the app back/);
  });
  it('MANIFEST carries the forward file and not the rollback', () => {
    const manifest = read('drizzle/migrations/MANIFEST.txt').split(/\r?\n/).map((l) => l.trim());
    expect(manifest).toContain('2026-11-13-b-close-writer-costs-drop-defaults.sql');
    expect(manifest).not.toContain('2026-11-13-b-close-writer-costs-drop-defaults-rollback.sql');
  });
});

describe('P-14b — the restore writer is type-checked end to end (Langston Step 4 C, re-review)', () => {
  // A cast on either side of insertOpenTradeRecordIfNoneOpen takes the restore's field list out of the compile fence:
  // with `as any` on the caller's literal, deleting `assetClass` from it compiles (tsc 324); without, it fails (325).
  it('storage spreads the record typed, and the restore caller passes its literal uncast', () => {
    const storageSrc = read('server/storage.ts');
    expect(storageSrc).toContain("...(record as Omit<InsertClosedTrade, 'mode'>), symbol: canonicalSymbol, assetClass, mode })");
    const restore = read('server/services/trade-record-restore.ts');
    const start = restore.indexOf('storage.insertOpenTradeRecordIfNoneOpen(');
    expect(start).toBeGreaterThan(-1);
    const call = restore.slice(start, restore.indexOf('\n  });', start) + 6);
    expect(call).toMatch(/\n  \}\);$/);
    expect(call).not.toMatch(/as any/);
  });
});

describe('P-14b — getClosedTradesGlobal is deleted (Langston C-2, rule 18)', () => {
  it('no source names it; its archive copy exists', () => {
    expect(read('server/storage.ts')).not.toContain('getClosedTradesGlobal');
    expect(fs.existsSync(path.join(ROOT, '1-system-manual/_archive/deleted-code/getClosedTradesGlobal.20261113-B-CLOSE-WRITER-COSTS.removed'))).toBe(true);
  });
});
