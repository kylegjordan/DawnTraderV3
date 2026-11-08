import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DAILY_PARTITION_CUTOVERS } from '../../services/data-archive/daily-partition-cutover.js';

// B-DB-SIZE-RELIEF (KD-60) — file-level fences for the OBJ-1 / OBJ-4 migrations and the registry (pre-audit P1-P4,
// r3 C-5(i), r4 C-6, Step-2 close C-10). The behaviour of the SQL itself is exercised against a real database in
// server/tests/integration/b-db-size-relief-cutover.test.ts.

const ROOT = path.join(__dirname, '../../..');
const MIG = path.join(ROOT, 'drizzle/migrations');
const FORWARD_RETENTION = '2026-11-08-b-db-size-relief-retention.sql';
const FORWARD_CUTOVER = '2026-11-08-b-db-size-relief-daily-cutover.sql';
const HELD_REVERSAL = '2026-11-08-b-db-size-relief-cutover-reversal.sql';
const SIX = ['signal_eval_provenance', 'pair_scan_archive', 'crypto_spot_ticker_snap', 'xstock_perp_ticker_snap',
  'macro_feed_archive', 'exit_decision_archive'];
const manifest = fs.readFileSync(path.join(MIG, 'MANIFEST.txt'), 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')); // the runner skips blank and # lines

describe('B-DB-SIZE-RELIEF — the held reversal can never be applied by accident (C-6, C-10)', () => {
  it('the reversal sits in drizzle/migrations/held/, NOT at the top level, and is NOT in MANIFEST.txt', () => {
    expect(fs.existsSync(path.join(MIG, 'held', HELD_REVERSAL))).toBe(true);
    expect(fs.existsSync(path.join(MIG, HELD_REVERSAL))).toBe(false);
    expect(manifest).not.toContain(HELD_REVERSAL);
  });

  it('the two forward migrations ARE in MANIFEST.txt, in order, and the runner\'s bijection still holds', () => {
    const iR = manifest.indexOf(FORWARD_RETENTION);
    const iC = manifest.indexOf(FORWARD_CUTOVER);
    expect(iR).toBeGreaterThan(-1);
    expect(iC).toBeGreaterThan(iR);
    // scripts/db-migrate.ts validateManifest: every top-level *.sql minus names containing "rollback" == MANIFEST
    const fsForward = fs.readdirSync(MIG).filter((f) => f.endsWith('.sql')).filter((f) => !f.toLowerCase().includes('rollback'));
    expect(new Set(fsForward)).toEqual(new Set(manifest));
    expect(manifest.some((f) => f.toLowerCase().includes('rollback'))).toBe(false);
  });

  it('the OBJ-1 rollback exists beside its forward file (applied by hand; db:migrate refuses it)', () => {
    expect(fs.existsSync(path.join(MIG, '2026-11-08-b-db-size-relief-retention-rollback.sql'))).toBe(true);
  });
});

describe('B-DB-SIZE-RELIEF — the migrations\' locking and keys (C-2, P1)', () => {
  for (const f of [FORWARD_CUTOVER, path.join('held', HELD_REVERSAL)]) {
    it(`${f} opens one transaction with SET LOCAL lock_timeout = '5s'`, () => {
      const sql = fs.readFileSync(path.join(MIG, f), 'utf8');
      expect(sql).toMatch(/^BEGIN;\s*\n\s*SET LOCAL lock_timeout = '5s';/m);
      expect((sql.match(/^COMMIT;/gm) ?? []).length).toBe(1);
      for (const t of SIX) expect(sql).toContain(`'${t}'`);
    });
  }

  it('the retention migration conflicts on the six-column primary key, never on constant_name alone', () => {
    const sql = fs.readFileSync(path.join(MIG, FORWARD_RETENTION), 'utf8');
    expect(sql).toContain('ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)');
    expect(sql).toMatch(/'signal_eval_archive\.hot_retention_days',\s+'15'::jsonb/);
  });
});

describe('B-DB-SIZE-RELIEF — the registry (P3, r3 C-5(i))', () => {
  it('the six are APPENDED after the pre-existing six, in order, with a 2026-12-01 cutover', () => {
    const tables = DAILY_PARTITION_CUTOVERS.map((c) => c.table);
    expect(tables.slice(0, 6)).toEqual(['xstock_spot_ticker_snap', 'signal_eval_archive', 'crypto_perp_ohlc_1m',
      'crypto_perp_ticker_snap', 'xstock_bar_revision_event', 'xstock_bar_aggregate_revision']);
    expect(tables.slice(6)).toEqual(SIX);
    for (const c of DAILY_PARTITION_CUTOVERS.slice(6)) expect(c.cutoverDate).toBe('2026-12-01');
  });

  it('the migrations name the same cutover date as the registry', () => {
    for (const f of [FORWARD_CUTOVER, path.join('held', HELD_REVERSAL)]) {
      expect(fs.readFileSync(path.join(MIG, f), 'utf8')).toContain("cutover DATE := DATE '2026-12-01';");
    }
  });
});
