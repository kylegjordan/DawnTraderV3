/**
 * B-XSTOCK-FEE-CONTRACT (#1010) — FENCES on the migration, the warmup and the single fee resolver.
 * Each prohibition sits beside a positive control that proves the scan can see what it is looking for.
 *
 *  F-1  the corrective fee UPDATEs carry NO value predicate (Langston ruling 2: unconditional SET), and the migration's
 *       in-transaction post-condition block checks every expected fee value, the cost_model delete, and the epoch delta.
 *  F-2  MANIFEST lists the migration exactly once and never the rollback; the rollback re-inserts all five cost_model
 *       rows AND deletes the forward migration's `_migrations` row by its real column, `name` — otherwise a redeploy
 *       after a rollback silently skips the fix. No rollback file anywhere uses the non-existent `filename` column.
 *  F-3  b72-warmup calls the signed rail and no longer prefetches 'cost_model' (a zero-row prefetch refuses boot).
 *  F-4  slippage-fee-model reads no `fee_model` rows itself — the merge site is the only reader (OBJ-4). The runtime
 *       proof is b-xstock-fee-contract-resolver.test.ts; this is the source-level fence.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const SERVER = join(__dirname, '..', '..');
const ROOT = join(SERVER, '..');
const MIGRATIONS = join(ROOT, 'drizzle', 'migrations');
const MIGRATION = readFileSync(join(MIGRATIONS, '2026-09-11-b-xstock-fee-contract.sql'), 'utf8');
const ROLLBACK = readFileSync(join(MIGRATIONS, '2026-09-11-b-xstock-fee-contract-rollback.sql'), 'utf8');
const MANIFEST = readFileSync(join(MIGRATIONS, 'MANIFEST.txt'), 'utf8');
const WARMUP = readFileSync(join(SERVER, 'startup', 'b72-warmup.ts'), 'utf8');
const SLIPPAGE = readFileSync(join(SERVER, 'services', 'slippage-fee-model.ts'), 'utf8');

function sqlCode(src: string): string {
  return src.replace(/--[^\n]*/g, '');
}
function tsCode(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}
function statements(sql: string): string[] {
  return sqlCode(sql).split(';').map((s) => s.trim()).filter(Boolean);
}
function doBlock(sql: string): string {
  const m = sqlCode(sql).match(/DO \$\$([\s\S]*?)END \$\$;/);
  return m ? m[1] : '';
}

describe('F-1 — the corrective fee UPDATE is unconditional and self-checking', () => {
  const feeUpdates = statements(MIGRATION).filter((s) => /^UPDATE\s+module_constants/i.test(s) && /module_name\s*=\s*'fee_model'/.test(s));
  const post = doBlock(MIGRATION);

  it('CONTROL: the scan finds exactly the two xStock fee UPDATEs and the post-condition block', () => {
    expect(feeUpdates).toHaveLength(2);
    expect(feeUpdates.every((s) => /asset_class\s*=\s*'xstock_spot'/.test(s))).toBe(true);
    expect(post.length).toBeGreaterThan(0);
  });

  it('no fee UPDATE filters on the current value', () => {
    for (const s of feeUpdates) {
      const where = s.slice(s.search(/\bWHERE\b/i));
      expect(where).not.toMatch(/\bvalue\b/i);
    }
  });

  it('sets taker 0.0010 and maker -0.0002, and never writes a crypto fee row', () => {
    expect(feeUpdates.some((s) => /value\s*=\s*'0\.0010'::jsonb/.test(s) && /spot_taker_fee/.test(s))).toBe(true);
    expect(feeUpdates.some((s) => /value\s*=\s*'-0\.0002'::jsonb/.test(s) && /spot_maker_fee/.test(s))).toBe(true);
    expect(sqlCode(MIGRATION)).not.toMatch(/UPDATE\s+module_constants[^;]*'fee_model'[^;]*'crypto_spot'/);
  });

  it('the post-condition block checks every expected fee value, the cost_model delete and the epoch delta', () => {
    for (const lit of ["0.0010::numeric", "-0.0002::numeric", "0.008::numeric", "0.004::numeric"]) {
      expect(post).toContain(lit);
    }
    expect(post).toMatch(/IS DISTINCT FROM r\.expected/);
    expect(post).toMatch(/module_name = 'cost_model'/);
    expect(post).toMatch(/r\.post <> r\.pre \+ 1/);
    expect(post).toMatch(/RAISE EXCEPTION/);
  });

  it('runs inside the transaction and tolerates a re-run after the operator rollback', () => {
    const body = sqlCode(MIGRATION);
    expect(body).toMatch(/^\s*BEGIN;/m);
    expect(body.indexOf('DO $$')).toBeLessThan(body.lastIndexOf('COMMIT;'));
    expect(body).toMatch(/DROP TABLE IF EXISTS _bxfc_epoch_before;/);
    expect(body).toMatch(/mc\.updated_by IS DISTINCT FROM 'b-xstock-fee-contract'/);
    expect(body).not.toMatch(/updated_by\s*<>/); // a NULL updated_by would silently skip the bump
    expect(post).toMatch(/pre_by IS DISTINCT FROM 'b-xstock-fee-contract'/);
  });
});

describe('F-2 — manifest and rollback', () => {
  const lines = MANIFEST.split(/\r?\n/).map((l) => l.trim());

  it('the migration is listed exactly once; the rollback never', () => {
    expect(lines.filter((l) => l === '2026-09-11-b-xstock-fee-contract.sql')).toHaveLength(1);
    expect(lines.some((l) => l.includes('b-xstock-fee-contract-rollback'))).toBe(false);
  });

  it('the rollback re-inserts all five cost_model rows and restores the xStock fee pair', () => {
    for (const name of ['default_avg_return', 'default_taker_fee', 'default_slippage', 'default_spread', 'max_cost_bound']) {
      expect(ROLLBACK).toMatch(new RegExp(`'cost_model',\\s*'[^']+',\\s*'\\*',\\s*'\\*',\\s*'\\*',\\s*'${name}'`));
    }
    expect(ROLLBACK).toMatch(/value = '0\.008'::jsonb[^;]*spot_taker_fee/);
    expect(ROLLBACK).toMatch(/value = '0\.004'::jsonb[^;]*spot_maker_fee/);
  });

  it('the rollback deletes the forward migration\'s ledger row by `name`, so a redeploy re-applies the fix', () => {
    expect(sqlCode(ROLLBACK)).toMatch(/DELETE FROM _migrations WHERE name = '2026-09-11-b-xstock-fee-contract\.sql';/);
  });

  it('no rollback file uses the non-existent _migrations.filename column (the real column is name)', () => {
    const rollbacks = readdirSync(MIGRATIONS).filter((f) => f.toLowerCase().includes('rollback') && f.endsWith('.sql'));
    expect(rollbacks.length).toBeGreaterThan(1); // CONTROL: the scan reaches the directory
    const offenders = rollbacks.filter((f) => /_migrations\s+WHERE\s+filename\b/i.test(sqlCode(readFileSync(join(MIGRATIONS, f), 'utf8'))));
    expect(offenders).toEqual([]);
  });
});

describe('F-3 — the warmup', () => {
  const code = tsCode(WARMUP);

  it('CONTROL: the stripped warmup still lists modules the scan must see', () => {
    expect(code).toMatch(/'fee_model'/);
    expect(code).toMatch(/'calibration_epoch'/);
  });

  it('prefetches no cost_model module', () => {
    expect(code).not.toMatch(/'cost_model'/);
  });

  it('runs the signed rail and no longer carries the positive-only check', () => {
    expect(code).toMatch(/feeRailViolation\(/);
    expect(code).toMatch(/makerAboveTakerViolation\(/);
    expect(code).not.toMatch(/v\s*>\s*0\s*&&\s*v\s*<=\s*0\.05/);
  });
});

describe('F-4 — one fee resolver (source-level)', () => {
  const code = tsCode(SLIPPAGE);

  it('CONTROL: the stripped file still shows its merge-site read', () => {
    expect(code).toMatch(/getFrictionForAssetClass\(/);
  });

  it('slippage-fee-model reads no fee_model rows and no module constants', () => {
    expect(code).not.toMatch(/'fee_model'/);
    expect(code).not.toMatch(/getCachedNumber/);
    expect(code).not.toMatch(/resolveFee\(/);
  });
});
