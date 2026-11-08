/**
 * Row `8c` — THE SWITCH-ON (`level_basis.crypto_birth_sided_enabled`, seeded 0). Off ⇒ no birth re-base and no walk record;
 * every crypto signal is stamped `levelGeometry: 'mid'` ⇒ every cost site keeps today's arithmetic. NOT fully inert, stated
 * (Langston's Step-4 F4): the open refusal of an UNSTAMPED crypto row is live in both states, and the seam still reads all
 * four `level_basis` rows per crypto signal — a missing or out-of-bounds ceiling row refuses crypto signals even with the
 * switch off. The boot assertion contains that (the process will not start without them); it bites only on a runtime DB
 * edit followed by a cache refresh.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const store: Record<string, number> = {};
vi.mock('../../services/module-constants-service.js', () => ({
  getCachedNumberRequired: (_m: string, c: string) => {
    if (!(c in store)) throw new Error(`missing ${c}`);
    return store[c];
  },
}));
import { readCryptoLevelBuildKnobs, assertLevelBuildKnobsAtBoot } from '../../core/trading/level-build-config.js';

const ROOT = join(__dirname, '..', '..', '..');
const src = (f: string) => readFileSync(join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');

describe('8c switch — the reader', () => {
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
    Object.assign(store, { level_build_max_age_ms: 60_000, level_build_max_spread_fraction: 0.5, level_build_drift_ref_60s: 0.00429 });
  });
  it('0 ⇒ off, 1 ⇒ on', () => {
    store.crypto_birth_sided_enabled = 0;
    expect(readCryptoLevelBuildKnobs().sidedEnabled).toBe(false);
    store.crypto_birth_sided_enabled = 1;
    expect(readCryptoLevelBuildKnobs().sidedEnabled).toBe(true);
  });
  it('anything else, or a missing row, THROWS (no default) — and boot refuses to start', () => {
    store.crypto_birth_sided_enabled = 2;
    expect(() => readCryptoLevelBuildKnobs()).toThrow(/0 or 1/);
    delete store.crypto_birth_sided_enabled;
    expect(() => readCryptoLevelBuildKnobs()).toThrow(/missing/);
    expect(() => assertLevelBuildKnobsAtBoot()).toThrow(/unreadable/);
  });
});

describe('8c switch — what OFF skips (source)', () => {
  const O = src('server/services/signal-orchestrator.ts');
  const E = src('server/services/active-execution-engine.ts');
  it('the whole birth block (walk, re-base, refusal, stamp) sits inside the switch', () => {
    const sw = O.indexOf('      } else {', O.indexOf('      if (!_cbKnobs.sidedEnabled) {'));
    expect(sw).toBeGreaterThan(-1);
    for (const inner of ["stage: 'active_level_build'", 'const _cb = baseCryptoLevelsAtBirth({', 'metadata: { ...(rawSignal.metadata ?? {}), ..._cb.stamp },']) {
      const at = O.indexOf(inner);
      expect(at, inner).toBeGreaterThan(sw);
      expect(at, inner).toBeLessThan(O.indexOf('// ══ F-G-1 (OBJ-7 / OBJ-7b / P1-P3) — VENUE PRICE GRID'));
    }
  });
  it("condition (b): ONE read site — OFF stamps the birth geometry 'mid' (a carried stamp is kept); the open keys on the STAMP", () => {
    const off = O.indexOf('      if (!_cbKnobs.sidedEnabled) {');
    expect(off).toBeGreaterThan(-1);
    const offBody = O.slice(off, O.indexOf('} else {', off));
    expect(offBody).toContain('if (levelGeometryStampOf(rawSignal.metadata) === null) {');
    expect(offBody).toContain("levelGeometry: 'mid'");
    // the open refusal never reads the live switch
    expect(E).toContain("if (_cbOpenClass === 'crypto_spot' && levelGeometryStampOf(signal.metadata) === null) {");
    expect(E).not.toContain('readCryptoLevelBuildKnobs');
    // the switch is read in ONE place in the orchestrator (the birth seam) — the shadows read only the ceilings
    expect((O.match(/\.sidedEnabled/g) ?? []).length).toBe(1);
  });
  it('levelGeometryStampOf: the exact stamp or null', async () => {
    const { levelGeometryStampOf } = await import('../../core/trading/crypto-birth-levels.js');
    expect(levelGeometryStampOf({ levelGeometry: 'mid' })).toBe('mid');
    expect(levelGeometryStampOf({ levelGeometry: 'sided' })).toBe('sided');
    for (const m of [undefined, null, {}, { levelGeometry: 'MID' }, 'mid']) expect(levelGeometryStampOf(m)).toBeNull();
  });
  it("the sided floor and every cost site key on the STAMP, which OFF writes as 'mid'", () => {
    expect(O).toContain("if (sizingContext.assetClass === 'crypto_spot' && _mtGeometry === 'sided') {");
    expect(O).toContain('const _mtGeometry = levelGeometryOf(rawSignal.metadata);');
  });
  it('the migration seeds the switch OFF and asserts exactly four rows', () => {
    const M = src('drizzle/migrations/2026-11-08-b-price-side-8c-level-build-knobs.sql');
    expect(M).toContain("('level_basis', 'crypto_birth_sided_enabled',      '0'::jsonb,");
    expect(M).toContain('IF n <> 4 THEN');
  });
});
