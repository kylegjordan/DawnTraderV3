/**
 * B-XSTOCK-FEE-CONTRACT (#1010) — FENCES on the migration, the warmup and the single fee resolver.
 * Each prohibition sits beside a positive control that proves the scan can see what it is looking for.
 *
 *  F-1  the corrective fee UPDATEs carry NO value predicate (Langston ruling 2: unconditional SET), and the
 *       migration asserts its own post-conditions inside the transaction.
 *  F-2  MANIFEST lists the migration exactly once and never the rollback; the rollback re-inserts all five
 *       cost_model rows (dt-deploy has no rollback verb — the file is the runbook).
 *  F-3  b72-warmup calls the signed rail and no longer prefetches 'cost_model' (a zero-row prefetch refuses boot).
 *  F-4  slippage-fee-model reads no `fee_model` rows itself — the merge site is the only reader (OBJ-4).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
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

describe('F-1 — the corrective fee UPDATE is unconditional and self-checking', () => {
  const feeUpdates = statements(MIGRATION).filter((s) => /^UPDATE\s+module_constants/i.test(s) && /module_name\s*=\s*'fee_model'/.test(s));

  it('CONTROL: the scan finds exactly the two xStock fee UPDATEs', () => {
    expect(feeUpdates).toHaveLength(2);
    expect(feeUpdates.every((s) => /asset_class\s*=\s*'xstock_spot'/.test(s))).toBe(true);
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

  it('asserts its post-conditions inside the transaction', () => {
    const body = sqlCode(MIGRATION);
    expect(body).toMatch(/^\s*BEGIN;/m);
    expect(body).toMatch(/DO \$\$[\s\S]*RAISE EXCEPTION[\s\S]*END \$\$;/);
    expect(body.indexOf('RAISE EXCEPTION')).toBeLessThan(body.lastIndexOf('COMMIT;'));
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

describe('F-4 — one fee resolver', () => {
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
