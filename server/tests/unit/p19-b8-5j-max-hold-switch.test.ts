/**
 * P19-B8.5j — the max-hold master switch (paper / live / VTS).
 *
 * Kyle 2026-07-24: turn the 24h max-hold force-close OFF until the policy is debated.
 * Three DB-governed booleans (enabled_paper / enabled_live / enabled_vts), all seed FALSE,
 * gating the two force-close enforcement sites. This suite regression-locks the WIRING —
 * the same source-guard idiom reorg-b4-shadow-isolation uses for the shadow/real split,
 * because the gates live in a private engine method and two vts-runner call sites that are
 * not cheaply invokable in isolation. Behaviour A/B is proven by the full vitest run diff.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const engineSrc = read('server/services/active-execution-engine.ts');
const vtsSrc = read('server/services/vts-runner.ts');
const warmupSrc = read('server/startup/b72-warmup.ts');
const migration = read('drizzle/migrations/2026-07-24-p19-b8-5j-max-hold-switch.sql');
const manifest = read('drizzle/migrations/MANIFEST.txt');

describe('P19-B8.5j — active-lane (paper/live) gate', () => {
  it('the max_holding_period branch is gated on the switch', () => {
    expect(engineSrc).toMatch(/maxHoldingMs !== undefined && this\.isMaxHoldEnabled\(\)/);
  });
  it('isMaxHoldEnabled resolves enabled_live vs enabled_paper by this.mode', () => {
    expect(engineSrc).toMatch(/this\.mode === 'live' \? 'enabled_live' : 'enabled_paper'/);
    expect(engineSrc).toContain("'max_hold_switch'");
  });
  it('is FAIL-SAFE: a cold module (getCachedConstant throws) resolves to OFF', () => {
    // the try/catch returning false is the load-bearing safety property.
    const m = engineSrc.match(/isMaxHoldEnabled\(\): boolean \{[\s\S]*?catch[\s\S]*?return false/);
    expect(m, 'isMaxHoldEnabled must catch and return false on a cold module').not.toBeNull();
  });
  it('compares === true (a jsonb STRING "false" is JS-truthy and must still read OFF)', () => {
    expect(engineSrc).toMatch(/getCachedConstant<boolean>\('max_hold_switch'[^)]*\) === true/);
  });
});

describe('P19-B8.5j — VTS-lane gate (call-site Infinity, evaluator untouched)', () => {
  it('the real 7-day valve is gated: enabled ? MAX_HOLD_MS : Infinity', () => {
    expect(vtsSrc).toMatch(/maxHoldMs: isVtsMaxHoldEnabled\(\) \? MAX_HOLD_MS : Infinity/);
  });
  it('the shadow 6h cap is gated: enabled ? SHADOW_MAX_HOLD_MS : Infinity', () => {
    expect(vtsSrc).toMatch(/maxHoldMs: isVtsMaxHoldEnabled\(\) \? SHADOW_MAX_HOLD_MS : Infinity/);
  });
  it('is FAIL-SAFE: cold module resolves to OFF', () => {
    const m = vtsSrc.match(/function isVtsMaxHoldEnabled\(\): boolean \{[\s\S]*?catch[\s\S]*?return false/);
    expect(m, 'isVtsMaxHoldEnabled must catch and return false on a cold module').not.toBeNull();
  });
});

describe('P19-B8.5j — wiring', () => {
  it('max_hold_switch is in b72-warmup PREFETCH_MODULES (or the sync read throws)', () => {
    expect(warmupSrc).toContain("'max_hold_switch'");
  });
  it('migration seeds the TRADE-RULE flags FALSE (paper/live) but the VTS safety valve TRUE', () => {
    // paper/live = the 24h trade rule Kyle paused → FALSE.
    for (const k of ['enabled_paper', 'enabled_live']) {
      const re = new RegExp(`'max_hold_switch','\\*','\\*','\\*','\\*','${k}','false'::jsonb`);
      expect(migration, `${k} must seed 'false'::jsonb globally`).toMatch(re);
    }
    // VTS = the 7-day zombie/stale-sim cleanup valve, NOT a trade rule. Seeding it OFF
    // re-introduces the pre-Batch-18I unbounded-trade-map bug (B63→B64). Ships ON (Langston).
    expect(migration, 'enabled_vts must seed true — the VTS valve is memory-safety, not a trade rule')
      .toMatch(/'max_hold_switch','\*','\*','\*','\*','enabled_vts','true'::jsonb/);
  });
  it('the forward migration is registered in MANIFEST (rollback is not)', () => {
    expect(manifest).toContain('2026-07-24-p19-b8-5j-max-hold-switch.sql');
    // the ROLLBACK companion must NOT be registered (operator-only).
    expect(manifest).not.toContain('2026-07-24-p19-b8-5j-max-hold-switch-rollback.sql');
  });
});
