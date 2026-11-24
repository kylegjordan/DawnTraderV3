/**
 * B-DB-REGIME-ENUM-ALIGN (#1263) — the market_regime enum the code declares must EQUAL the set the
 * registered migrations can store, and every canonical regime must be storable.
 *
 * Before this batch shared/schema.ts declared twelve market_regime values while the migrations could store
 * only the original six: the five canonical regimes and HIGH_VOL_IMPULSE existed in the code's enum and in
 * no database. toDBRegime passed canonical labels straight through, so the telemetry writer's labels (and its
 * TRANSITION fallback) were not storable and a live-mode insert would have been refused. This batch adds the five canonical values by migration, drops HIGH_VOL_IMPULSE
 * from the declaration (no producer emits it; it was never storable), and deletes the mapper.
 *
 * Langston's Step-2 condition 3: assert set EQUALITY, not subset, against the three sources that create the
 * type's values: the initial CREATE TYPE (2026-04-22-initial-schema.sql), the 1A DO-block CREATE TYPE
 * (2026-11-1A-persistent-intelligence.sql, a no-op when the type exists but parsed so a divergence there is
 * seen), and every ALTER TYPE ... ADD VALUE in a MANIFEST-registered forward migration. Equality catches both
 * directions: a declared value no migration creates (the original defect), and a stored value the code no
 * longer declares (which Drizzle would never write and a reader would not expect).
 * NOT COVERED, stated: the live database itself. This reads migration files; P11 of the batch reads the
 * staging enum after deploy.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CANONICAL_REGIMES } from '../../config/canonical-regime-strategy-map';

const root = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const MIGRATIONS = 'drizzle/migrations';
const FORWARD = '2026-11-22-b-db-regime-enum-align.sql';
const ROLLBACK = '2026-11-22-b-db-regime-enum-align-rollback.sql';
const COLUMN_FORWARD = '2026-11-24-b-db-regime-enum-align-telemetry-columns.sql';
const COLUMN_ROLLBACK = '2026-11-24-b-db-regime-enum-align-telemetry-columns-rollback.sql';
const ORIGINAL_SIX = ['EXTREME_NOISE', 'BULL_STABLE', 'BULL_VOLATILE', 'BEAR_STABLE', 'BEAR_VOLATILE', 'LOW_VOL_CHOP'];

const schemaSrc = read('shared/schema.ts');
const manifestLines = new Set(
  read(`${MIGRATIONS}/MANIFEST.txt`)
    .split(/\r?\n/)
    .map((l) => l.trim()),
);

function declaredRegimes(): string[] {
  const m = schemaSrc.match(/pgEnum\("market_regime",\s*\[([^\]]*)\]\)/);
  if (!m) throw new Error('marketRegimeEnum declaration not found in shared/schema.ts');
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

function createTypeValues(file: string): string[] {
  const m = read(`${MIGRATIONS}/${file}`).match(/CREATE TYPE\s+(?:public\.)?market_regime\s+AS ENUM\s*\(([^)]*)\)/);
  if (!m) throw new Error(`CREATE TYPE market_regime not found in ${file}`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

function storableRegimes(): Set<string> {
  const out = new Set<string>();
  for (const f of ['2026-04-22-initial-schema.sql', '2026-11-1A-persistent-intelligence.sql']) {
    if (!manifestLines.has(f)) throw new Error(`${f} is not registered in MANIFEST.txt`);
    for (const v of createTypeValues(f)) out.add(v);
  }
  const forward = readdirSync(join(root, MIGRATIONS)).filter(
    (f) => f.endsWith('.sql') && !f.endsWith('-rollback.sql') && manifestLines.has(f),
  );
  for (const f of forward) {
    for (const v of read(`${MIGRATIONS}/${f}`).matchAll(
      /ALTER TYPE\s+(?:public\.)?market_regime\s+ADD VALUE\s+(?:IF NOT EXISTS\s+)?'([^']+)'/gi,
    )) {
      out.add(v[1]);
    }
  }
  return out;
}

describe('B-DB-REGIME-ENUM-ALIGN — declared market_regime equals the storable set', () => {
  it('the instrument sees the original six in BOTH CREATE TYPE sources (positive control)', () => {
    expect(createTypeValues('2026-04-22-initial-schema.sql').sort()).toEqual([...ORIGINAL_SIX].sort());
    expect(createTypeValues('2026-11-1A-persistent-intelligence.sql').sort()).toEqual([...ORIGINAL_SIX].sort());
  });

  it('the declared pgEnum and the storable set are EQUAL (both directions)', () => {
    const declared = [...new Set(declaredRegimes())].sort();
    const storable = [...storableRegimes()].sort();
    expect(declared).toEqual(storable);
  });

  it('every canonical regime is declared and storable', () => {
    const storable = storableRegimes();
    const declared = new Set(declaredRegimes());
    for (const r of CANONICAL_REGIMES) {
      expect(declared.has(r), `declared: ${r}`).toBe(true);
      expect(storable.has(r), `storable: ${r}`).toBe(true);
    }
  });

  it('HIGH_VOL_IMPULSE is neither declared nor storable', () => {
    expect(declaredRegimes()).not.toContain('HIGH_VOL_IMPULSE');
    expect(storableRegimes().has('HIGH_VOL_IMPULSE')).toBe(false);
  });

  it('the forward migration is registered and its rollback is not', () => {
    expect(manifestLines.has(FORWARD)).toBe(true);
    expect(manifestLines.has(ROLLBACK)).toBe(false);
  });

  it('the Step-9 migration restores all seven writer columns with exact shapes', () => {
    const forward = read(`${MIGRATIONS}/${COLUMN_FORWARD}`);
    const expected = [
      ['source', "VARCHAR\\(20\\) DEFAULT 'unknown'"],
      ['global_regime', 'VARCHAR\\(40\\)'],
      ['pair_friction', 'NUMERIC\\(5,2\\)'],
      ['global_friction', 'NUMERIC\\(5,2\\)'],
      ['pair_directional_bias', 'VARCHAR\\(20\\)'],
      ['global_directional_bias', 'VARCHAR\\(20\\)'],
      ['decay_penalty', 'NUMERIC\\(5,4\\)'],
    ] as const;
    for (const [column, shape] of expected) {
      expect(forward).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${column} ${shape}`, 'i'));
    }
    expect(forward).toContain('postcondition failed');
    expect(manifestLines.has(COLUMN_FORWARD)).toBe(true);
    expect(manifestLines.has(COLUMN_ROLLBACK)).toBe(false);
    expect(read(`${MIGRATIONS}/${COLUMN_ROLLBACK}`)).not.toMatch(/DROP\\s+COLUMN/i);
  });
});
