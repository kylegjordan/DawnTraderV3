/**
 * #1250 P6 (OBJ-4) — one epoch bump per xStock source whose meaning changes: xstock_spot/paper_sim and xstock_spot/vts, +1,
 * nothing else, registered in the MANIFEST, with a forward-only rollback (the KD-19 template).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(process.cwd(), 'drizzle', 'migrations');
const NAME = '2026-11-08-b-price-side-1250-xstock-epoch.sql';
const fwd = readFileSync(join(dir, NAME), 'utf8');
const rb = readFileSync(join(dir, '2026-11-08-b-price-side-1250-xstock-epoch-rollback.sql'), 'utf8');
const manifest = readFileSync(join(dir, 'MANIFEST.txt'), 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

describe('#1250 P6 — xStock epoch migration', () => {
  it('moves exactly the two xstock_spot rows by +1, in one transaction, with updated_at set', () => {
    expect(fwd).toMatch(/BEGIN;[\s\S]*COMMIT;/);
    expect(fwd).toMatch(/SET value = to_jsonb\(\(value\)::text::numeric \+ 1\), updated_by = 'b-price-side-1250', updated_at = now\(\)/);
    expect(fwd).toMatch(/AND asset_class = 'xstock_spot' AND constant_name IN \('paper_sim', 'vts'\);/);
    expect(fwd).toMatch(/IF n <> 2 THEN/);
    expect(fwd).toMatch(/only the two xstock_spot rows may move, by exactly \+1/);
    expect(fwd).not.toMatch(/'crypto_spot'/);
  });
  it('is registered once, LAST, and the rollback is not', () => {
    expect(manifest.filter((l) => l === NAME)).toHaveLength(1);
    expect(manifest.indexOf(NAME)).toBeGreaterThan(manifest.indexOf('2026-11-07-b-price-side-kd19-vts-epoch.sql'));
    expect(manifest.some((l) => l.includes('1250-xstock-epoch-rollback'))).toBe(false);
  });
  it('the rollback moves FORWARD again and forgets the forward migration', () => {
    expect(rb).toMatch(/numeric \+ 1\), updated_by = 'b-price-side-1250-rollback'/);
    expect(rb).toMatch(new RegExp(`DELETE FROM _migrations WHERE name = '${NAME.replace(/\./g, '\.')}';`));
    expect(rb).not.toMatch(/numeric - 1/);
  });
});
