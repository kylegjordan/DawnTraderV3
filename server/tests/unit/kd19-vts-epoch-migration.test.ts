/**
 * KD-19 P8 (objective K5) — one epoch bump per class whose VTS booking changes: crypto_spot/vts and xstock_spot/vts, +1,
 * nothing else, registered in the MANIFEST, with a forward-only rollback.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(process.cwd(), 'drizzle', 'migrations');
const fwd = readFileSync(join(dir, '2026-11-07-b-price-side-kd19-vts-epoch.sql'), 'utf8');
const rb = readFileSync(join(dir, '2026-11-07-b-price-side-kd19-vts-epoch-rollback.sql'), 'utf8');
const manifest = readFileSync(join(dir, 'MANIFEST.txt'), 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

describe('KD-19 P8 — VTS epoch migration', () => {
  it('moves exactly the two vts rows by +1, inside one transaction, with updated_at set', () => {
    expect(fwd).toMatch(/BEGIN;[\s\S]*COMMIT;/);
    expect(fwd).toMatch(/SET value = to_jsonb\(\(value\)::text::numeric \+ 1\), updated_by = 'b-price-side-kd19', updated_at = now\(\)/);
    expect(fwd).toMatch(/AND asset_class IN \('crypto_spot', 'xstock_spot'\) AND constant_name = 'vts';/);
    expect(fwd).toMatch(/IF n <> 2 THEN/);
    expect(fwd).toMatch(/only the two vts rows may move, by exactly \+1/);
    expect(fwd).not.toMatch(/paper_sim'/);
  });
  it('is registered once in the MANIFEST, and the rollback is not', () => {
    expect(manifest.filter((l) => l === '2026-11-07-b-price-side-kd19-vts-epoch.sql')).toHaveLength(1);
    expect(manifest.some((l) => l.includes('kd19-vts-epoch-rollback'))).toBe(false);
  });
  it('the rollback moves FORWARD again and forgets the forward migration', () => {
    expect(rb).toMatch(/numeric \+ 1\), updated_by = 'b-price-side-kd19-rollback'/);
    expect(rb).toMatch(/DELETE FROM _migrations WHERE name = '2026-11-07-b-price-side-kd19-vts-epoch.sql';/);
    expect(rb).not.toMatch(/numeric - 1/);
  });
});
