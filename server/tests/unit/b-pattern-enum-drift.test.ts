/**
 * B-PATTERN-ENUM-DRIFT (#1063, hotfix) — the pattern_type enum the code declares must be one the
 * migrations can store.
 *
 * shared/schema.ts declared 'ABCD' in pattern_type while no migration ever created it (TRI_STAR, in the canonical
 * pattern set and routed but undeclared here, was the same gap latent — Kyle 2026-10-02: fix both), so every
 * pattern-confirmed volatility_edge signal failed the position insert at runtime and was re-minted
 * each cycle (#1136). Nothing at build or test time compared the two. This guard does: every value
 * in the declared pgEnum must appear in the initial CREATE TYPE or in a forward ADD VALUE, and the
 * fix's migration is registered (its rollback is not).
 *
 * THE LEG THAT MATTERS ON THE ACTIVE PATH (Langston, Step 4): the sinks write the RAW detector label, not
 * the canonical one — signal-orchestrator.ts:2311 `patternType: patternSig.pattern` and :3266 <- hybrid-
 * integration.ts:186 `patternType: match.pattern`. So the invariant is: every label the detector EMITS must be
 * storable. The third test below checks it: every `pattern: '<X>'` literal in pattern-recognizer.ts must be in the
 * declared pgEnum, so a new detector arm (a future DOJI or TRI_STAR arm) fails here, at CI, not at a live insert.
 * NOT COVERED, stated: a label built at runtime rather than written as a literal, and the `|| 'UNKNOWN'` fallback
 * at signal-orchestrator.ts:2350 (not in the pgEnum; it would fail identically if ever reached).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const MIGRATIONS = 'drizzle/migrations';

const schemaSrc = read('shared/schema.ts');
const manifest = read(`${MIGRATIONS}/MANIFEST.txt`);
const manifestLines = new Set(manifest.split(/\r?\n/).map((l) => l.trim()));
const recognizerSrc = read('server/services/pattern-recognizer.ts');

function declaredPatternTypes(): string[] {
  const m = schemaSrc.match(/pgEnum\("pattern_type",\s*\[([^\]]*)\]\)/);
  if (!m) throw new Error('patternTypeEnum declaration not found in shared/schema.ts');
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

function storablePatternTypes(): Set<string> {
  const out = new Set<string>();
  const create = read(`${MIGRATIONS}/2026-04-22-initial-schema.sql`).match(
    /CREATE TYPE public\.pattern_type AS ENUM \(([^)]*)\)/,
  );
  if (!create) throw new Error('initial CREATE TYPE pattern_type not found');
  for (const v of create[1].matchAll(/'([^']+)'/g)) out.add(v[1]);
  const forward = readdirSync(join(root, MIGRATIONS)).filter(
    (f) => f.endsWith('.sql') && !f.endsWith('-rollback.sql') && manifestLines.has(f),
  );
  for (const f of forward) {
    for (const v of read(`${MIGRATIONS}/${f}`).matchAll(
      /ALTER TYPE\s+(?:public\.)?pattern_type\s+ADD VALUE\s+(?:IF NOT EXISTS\s+)?'([^']+)'/gi,
    )) {
      out.add(v[1]);
    }
  }
  return out;
}

describe('B-PATTERN-ENUM-DRIFT — declared pattern_type values are storable', () => {
  it('the instrument sees the initial five (positive control)', () => {
    const storable = storablePatternTypes();
    for (const v of ['PINBAR', 'ENGULFING', 'INSIDE_BAR', 'MORNING_STAR', 'THREE_SOLDIERS']) {
      expect(storable.has(v), v).toBe(true);
    }
  });

  it('every value shared/schema.ts declares is created by a registered migration', () => {
    const storable = storablePatternTypes();
    const missing = declaredPatternTypes().filter((v) => !storable.has(v));
    expect(missing, `declared in pattern_type but no migration creates: ${missing.join(', ')}`).toEqual([]);
  });

  it('ABCD and TRI_STAR are declared and storable', () => {
    for (const v of ['ABCD', 'TRI_STAR']) {
      expect(declaredPatternTypes(), v).toContain(v);
      expect(storablePatternTypes().has(v), v).toBe(true);
    }
  });

  it('every label the detector emits is declared in the pgEnum (the raw-label sinks write it as-is)', () => {
    const emitted = [...new Set([...recognizerSrc.matchAll(/\bpattern:\s*'([A-Z_]+)'/g)].map((m) => m[1]))];
    // positive control: the instrument sees the detector's emit sites
    expect(emitted.length).toBeGreaterThanOrEqual(6);
    expect(emitted).toContain('ABCD');
    const declared = new Set(declaredPatternTypes());
    const undeclared = emitted.filter((v) => !declared.has(v));
    expect(undeclared, `detector emits labels the pgEnum lacks: ${undeclared.join(', ')}`).toEqual([]);
  });

  it('the forward migration is registered in MANIFEST (rollback is not)', () => {
    expect(manifestLines.has('2026-10-02-b-pattern-enum-drift-abcd.sql')).toBe(true);
    expect(manifestLines.has('2026-10-02-b-pattern-enum-drift-abcd-rollback.sql')).toBe(false);
  });
});
