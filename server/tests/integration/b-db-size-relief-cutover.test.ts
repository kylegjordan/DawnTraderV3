import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

// B-DB-SIZE-RELIEF OBJ-4 — the cutover migration and its HELD reversal, executed against a real Postgres
// (pre-audit r4 C-6(1), Step-2 close C-9).
//
// ★ THE SQL IS THE SHIPPED FILES' BYTES (C-9). Each file is read from disk and ONE mechanical substitution is applied:
//   every quoted real parent name in its ARRAY literal, e.g. 'pair_scan_archive', becomes the throwaway
//   'dsrt_pair_scan_archive'. Nothing else is changed, so any later edit to either shipped file is exercised here.
// ★ WHERE IT RUNS: CI (ci.yml's `npm run db:migrate` step and this suite share the service Postgres at DATABASE_URL).
//   Locally, with no reachable database, the suite SKIPS; in CI an unreachable database FAILS the run instead.

const MIG = path.join(__dirname, '../../../drizzle/migrations');
const SIX = ['signal_eval_provenance', 'pair_scan_archive', 'crypto_spot_ticker_snap', 'xstock_perp_ticker_snap',
  'macro_feed_archive', 'exit_decision_archive'];
const T = (name: string) => `dsrt_${name}`;
const substitute = (sql: string): string => {
  let out = sql;
  for (const name of SIX) {
    const quoted = `'${name}'`;
    expect(out.split(quoted).length - 1, `${name} appears quoted exactly once`).toBe(1);
    out = out.split(quoted).join(`'${T(name)}'`);
  }
  return out;
};
const FORWARD = fs.readFileSync(path.join(MIG, '2026-11-08-b-db-size-relief-daily-cutover.sql'), 'utf8');
const REVERSAL = fs.readFileSync(path.join(MIG, 'held', '2026-11-08-b-db-size-relief-cutover-reversal.sql'), 'utf8');

const url = process.env.DATABASE_URL ?? '';
async function reachable(): Promise<boolean> {
  const c = new pg.Client({ connectionString: url, connectionTimeoutMillis: 2000 });
  try { await c.connect(); await c.end(); return true; } catch { return false; }
}
const DB = await reachable();
if (process.env.CI && !DB) throw new Error('B-DB-SIZE-RELIEF integration: the CI database at DATABASE_URL is unreachable');

const MONTHS = ['2026_10', '2026_11', '2026_12', '2027_01', '2027_02', '2027_03', '2027_04', '2027_05', '2027_06',
  '2027_07', '2027_08', '2027_09', '2027_10'];
const bounds = (ym: string): [string, string] => {
  const [y, m] = ym.split('_').map(Number);
  const next = m === 12 ? [y + 1, 1] : [y, m + 1];
  const f = (yy: number, mm: number) => `${yy}-${String(mm).padStart(2, '0')}-01`;
  return [f(y, m), f(next[0], next[1])];
};

describe.skipIf(!DB)('B-DB-SIZE-RELIEF cutover migration + held reversal, on throwaway parents', () => {
  const client = new pg.Client({ connectionString: url });
  let connected = false;

  async function children(parent: string): Promise<string[]> {
    const r = await client.query(
      `SELECT c.relname FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid JOIN pg_class p ON p.oid = i.inhparent
        WHERE p.relname = $1 ORDER BY c.relname`, [parent]);
    return r.rows.map((x: { relname: string }) => x.relname);
  }

  async function build(): Promise<void> {
    for (const name of SIX) {
      await client.query(`DROP TABLE IF EXISTS ${T(name)} CASCADE`);
      await client.query(`CREATE TABLE ${T(name)} (id bigserial, captured_at timestamptz NOT NULL) PARTITION BY RANGE (captured_at)`);
      for (const ym of MONTHS) {
        const [a, b] = bounds(ym);
        await client.query(`CREATE TABLE ${T(name)}_${ym} PARTITION OF ${T(name)} FOR VALUES FROM ('${a}') TO ('${b}')`);
      }
      await client.query(`INSERT INTO ${T(name)} (captured_at) VALUES ('2026-11-15T12:00:00Z')`); // the live month holds a row
    }
  }

  beforeEach(async () => {
    if (!connected) { await client.connect(); connected = true; }
    await client.query('RESET b_db_size_relief.as_of').catch(() => {});
    await build();
  });

  afterAll(async () => {
    if (!connected) return;
    for (const name of SIX) await client.query(`DROP TABLE IF EXISTS ${T(name)} CASCADE`);
    await client.end();
  });

  it('forward: drops the 11 empty future monthlies per table, keeps the live months, and pre-creates 16 dailies', async () => {
    await client.query(substitute(FORWARD));
    for (const name of SIX) {
      const kids = await children(T(name));
      expect(kids.filter((k) => /_\d{4}_\d{2}$/.test(k))).toEqual([`${T(name)}_2026_10`, `${T(name)}_2026_11`]);
      const dailies = kids.filter((k) => /_\d{4}_\d{2}_\d{2}$/.test(k));
      expect(dailies.length).toBe(16);
      expect(dailies[0]).toBe(`${T(name)}_2026_12_01`);
      expect(dailies[15]).toBe(`${T(name)}_2026_12_16`);
    }
    // the live month's row is untouched, and a December row now lands in a daily
    const r = await client.query(`SELECT count(*)::int AS n FROM ${T('pair_scan_archive')}`);
    expect(r.rows[0].n).toBe(1);
    await client.query(`INSERT INTO ${T('pair_scan_archive')} (captured_at) VALUES ('2026-12-03T00:00:00Z')`);
  });

  it('forward is IDEMPOTENT: a second run (committed but unledgered) passes and changes nothing (C-8)', async () => {
    await client.query(substitute(FORWARD));
    const before = await children(T('signal_eval_provenance'));
    await client.query(substitute(FORWARD));
    expect(await children(T('signal_eval_provenance'))).toEqual(before);
  });

  it('forward REFUSES when a future monthly is not empty, and commits nothing', async () => {
    await client.query(`INSERT INTO ${T('macro_feed_archive')} (captured_at) VALUES ('2027-03-01T00:00:00Z')`);
    await expect(client.query(substitute(FORWARD))).rejects.toThrow(/future monthly dsrt_macro_feed_archive_2027_03/);
    await client.query('ROLLBACK').catch(() => {});
    expect((await children(T('pair_scan_archive'))).length).toBe(13); // nothing dropped in any table
  });

  it('held reversal (before the cutover): drops the dailies and restores the 11 monthlies', async () => {
    await client.query(substitute(FORWARD));
    await client.query(`SET b_db_size_relief.as_of = '2026-11-20'`);
    await client.query(substitute(REVERSAL));
    for (const name of SIX) {
      const kids = await children(T(name));
      expect(kids.filter((k) => /_\d{4}_\d{2}_\d{2}$/.test(k))).toEqual([]);
      expect(kids).toEqual(MONTHS.map((ym) => `${T(name)}_${ym}`));
    }
  });

  it('held reversal REFUSES on or after the cutover date', async () => {
    await client.query(substitute(FORWARD));
    await client.query(`SET b_db_size_relief.as_of = '2026-12-01'`);
    await expect(client.query(substitute(REVERSAL))).rejects.toThrow(/reversal REFUSED: today \(2026-12-01\) is on or after the cutover/);
    await client.query('ROLLBACK').catch(() => {});
  });

  it('held reversal REFUSES when a daily holds a row, and commits nothing', async () => {
    await client.query(substitute(FORWARD));
    await client.query(`INSERT INTO ${T('exit_decision_archive')} (captured_at) VALUES ('2026-12-05T00:00:00Z')`);
    await client.query(`SET b_db_size_relief.as_of = '2026-11-20'`);
    await expect(client.query(substitute(REVERSAL))).rejects.toThrow(/reversal REFUSED: daily dsrt_exit_decision_archive_2026_12_05/);
    await client.query('ROLLBACK').catch(() => {});
    expect((await children(T('pair_scan_archive'))).filter((k) => /_\d{4}_\d{2}_\d{2}$/.test(k)).length).toBe(16);
  });
});
