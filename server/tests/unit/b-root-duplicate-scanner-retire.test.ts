/**
 * B-ROOT-DUPLICATE-SCANNER-RETIRE (#1161, SPRINT_TO_LIVE_PLAN row 2a0d) — no non-live code subscribes to the Central Clock.
 *
 * The retired copies were two hazards of DIFFERENT kinds (Langston Step-2 C-2): the root `fx5-scanner.ts` and
 * `BATCH_19G_HF2/server/services/fx5-scanner.ts` subscribed under the live scanner's id 'FX5Scanner', so loading either
 * would have REPLACED the live scanner's tick handler; `server/core/system/trading_scheduler.ts` subscribed under its own
 * id and called `centralClock.start()`, so loading it would have ADDED a fan-out. This fence enumerates every subscribe
 * site in compiled code and asserts (C-3) the set is exactly the five live subscribers AND that no subscriber id repeats —
 * so a new copy re-colliding on 'FX5Scanner' fails, not only a new file.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) { if (name !== 'node_modules' && name !== 'tests') walk(p, out); }
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}
const SUB = /centralClock\.subscribe\(\s*([`'"][^`'"]+[`'"]|[\w.]+)/g;
function census(): Array<{ file: string; id: string }> {
  const rows: Array<{ file: string; id: string }> = [];
  for (const dir of ['server', 'shared']) {
    for (const f of walk(join(ROOT, dir))) {
      const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      for (const m of src.matchAll(SUB)) rows.push({ file: relative(ROOT, f).replace(/\\/g, '/'), id: m[1] });
    }
  }
  return rows.sort((a, b) => a.file.localeCompare(b.file));
}

describe('Central Clock subscribers — exactly the five live ones (Langston C3/C-3)', () => {
  const rows = census();
  it('positive control: the census finds the live RTB refresh subscriber', () => {
    expect(rows.some((r) => r.file === 'server/services/rtb-refresh-service.ts' && r.id === "'RTBRefreshService'")).toBe(true);
  });
  it('the set of subscribe sites is exactly the five live subscribers', () => {
    expect(rows).toEqual([
      { file: 'server/asset_classes/xstock_spot/scanner.ts', id: "'XstockSpotScanner'" },
      { file: 'server/core/rtb/tcl_watchdog.ts', id: '`TCL_${mode}`' },
      { file: 'server/services/fx5-scanner.ts', id: "'FX5Scanner'" },
      { file: 'server/services/rtb-refresh-service.ts', id: "'RTBRefreshService'" },
      { file: 'server/utils/market-events.ts', id: "'MarketEventScheduler'" },
    ]);
  });
  it('no subscriber id appears twice (a re-collision replaces a live handler)', () => {
    const ids = rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('the retired files stay retired', () => {
  it.each([
    'fx5-scanner.ts', 'BATCH_19G_HF2', 'server/core/system/trading_scheduler.ts',
    'server/services/behavioral-template.ts', 'server/services/schema-audit.ts', 'server/services/provenance-governance.ts',
    'test-adjustable-guardrails-simple.ts', 'test-adjustable-guardrails.ts', 'test-behavioral-integration.ts',
    'test-historic-replay.ts', 'test-safety-enforcement.ts', 'test-stageb-validation.ts', 'test-stagec-validation.ts',
    'test-validation.ts', 'test-watchlist-execution.ts',
  ])('%s is gone', (p) => {
    expect(existsSync(join(ROOT, p))).toBe(false);
  });
  it('the docs screener export is KEPT as labelled history (left intentionally)', () => {
    expect(existsSync(join(ROOT, 'docs/current_state/screeners_export/backend/fx5-scanner.ts'))).toBe(true);
  });
});
