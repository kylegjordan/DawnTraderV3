/**
 * `B-PRICE-SIDE-BY-JOB` row `8a-P4c`, increment 3 (plan §C3) — the VTS xStock quote guard, the exit wiring, and the ONE
 * reader of the mark-staleness knobs. Every refusal arm fires on a known input (capability, `#661`); the `#1065` MDB
 * stub-bid frame is the known positive the stateless spread ceiling exists to refuse.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { guardXstockQuote } from '../../asset_classes/xstock_spot/vts-xs-guard.js';
import type { XsQuoteRow } from '../../asset_classes/xstock_spot/vts-xs-instrument.js';

const NOW = Date.parse('2026-09-30T14:00:00Z');
const row = (o: Partial<XsQuoteRow> = {}): XsQuoteRow => ({ last: 100, bid: 99.95, ask: 100.05, atMs: NOW - 5_000, ...o });
const LIM = { maxAgeMs: 60_000, maxSpreadFraction: 0.0107 };

describe('8a-P4c inc 3 — guardXstockQuote: every arm fires', () => {
  it('ok: a fresh, two-sided, tight quote hands back both sides', () => {
    const g = guardXstockQuote(row(), NOW, LIM);
    expect(g.reason).toBe('ok');
    expect(g.sides).toEqual({ bid: 99.95, ask: 100.05 });
    expect(g.ageMs).toBe(5_000);
  });
  it('no_row', () => expect(guardXstockQuote(null, NOW, LIM)).toMatchObject({ sides: null, reason: 'no_row' }));
  it('age_unknown: no stamp, or a stamp in the future (a fault, never a pass)', () => {
    expect(guardXstockQuote(row({ atMs: null }), NOW, LIM)).toMatchObject({ sides: null, reason: 'age_unknown' });
    expect(guardXstockQuote(row({ atMs: NOW + 1 }), NOW, LIM)).toMatchObject({ sides: null, reason: 'age_unknown' });
  });
  it('too_old: past the ceiling the caller supplies; a NaN ceiling refuses too', () => {
    expect(guardXstockQuote(row({ atMs: NOW - 60_001 }), NOW, LIM)).toMatchObject({ sides: null, reason: 'too_old' });
    expect(guardXstockQuote(row({ atMs: NOW - 60_000 }), NOW, LIM).reason).toBe('ok'); // the boundary is inclusive
    expect(guardXstockQuote(row(), NOW, { ...LIM, maxAgeMs: Number.NaN })).toMatchObject({ sides: null, reason: 'too_old' });
  });
  it('side_unusable: a missing side, a zero bid, a crossed book (the shared paper predicate)', () => {
    expect(guardXstockQuote(row({ bid: null }), NOW, LIM).reason).toBe('side_unusable');
    expect(guardXstockQuote(row({ bid: 0 }), NOW, LIM).reason).toBe('side_unusable');
    expect(guardXstockQuote(row({ bid: 100.1, ask: 100.0 }), NOW, LIM).reason).toBe('side_unusable');
  });
  it('too_wide: past the spread ceiling; an entry leg passes Infinity and is never refused on width', () => {
    const wide = row({ bid: 99, ask: 101 }); // 2% spread
    expect(guardXstockQuote(wide, NOW, LIM)).toMatchObject({ sides: null, reason: 'too_wide' });
    expect(guardXstockQuote(wide, NOW, { ...LIM, maxSpreadFraction: Number.POSITIVE_INFINITY }).reason).toBe('ok');
  });
  it('KNOWN POSITIVE — the #1065 MDB stub-bid frame (bid 335.12 vs a 400.06 mark, symmetric blowout) is refused on width', () => {
    const mdb = row({ last: 400.06, bid: 335.12, ask: 465.0, atMs: NOW - 2_000 });
    const g = guardXstockQuote(mdb, NOW, LIM);
    expect(g.reason).toBe('too_wide');
    expect(g.sides).toBeNull();
    expect(g.spread as number).toBeGreaterThan(0.3);
  });
});

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf-8').replace(/\r\n/g, '\n');
const VTS = read('server/services/vts-runner.ts');

describe('8a-P4c inc 3 — the exit wiring', () => {
  it('both lanes route xStock exits through ONE helper, and the helper fails closed on missing knobs and rows', () => {
    expect((VTS.match(/selectVtsXstockExitBid\(trade\.symbol,/g) ?? []).length).toBe(2); // real + shadow
    expect(VTS).toMatch(/return \{ bid: null, ceilingMs: null, reason: 'knobs_unavailable' \};/);
    expect(VTS).toMatch(/if \(row === null\) return \{ bid: null, ceilingMs: msCfg\.floorMs, reason: 'no_row' \};/);
    expect(VTS).toMatch(/getCachedNumberRequired\('vts_xstock_touch', 'exit_max_spread_fraction', XSTOCK_KNOB_KEY\)/);
    expect(VTS).toMatch(/computeStalenessCeiling\(/);
  });
  it('both lanes kick the SHARED σ cache for their open xStock symbols', () => {
    expect((VTS.match(/kickVtsXstockSigma\(xstockSymbols\);/g) ?? []).length).toBe(2);
  });
  it('the migration seeds the spread ceiling and steps both VTS epochs once', () => {
    const mig = read('drizzle/migrations/2026-09-30-b-price-side-8a-p4c-inc3.sql');
    expect(mig).toMatch(/'vts_xstock_touch', '\*', 'xstock_spot', '\*', '\*', 'exit_max_spread_fraction', '0\.0107'::jsonb/);
    expect(mig).toMatch(/AND mc\.asset_class IN \('crypto_spot', 'xstock_spot'\)/);
    expect(read('drizzle/migrations/MANIFEST.txt')).toContain('2026-09-30-b-price-side-8a-p4c-inc3.sql');
  });
});

// Langston Step-2 r2 σ condition: ONE config source for the σ-cache singletons — no call site passes its own literals.
describe('8a-P4c inc 3 — the mark-staleness knobs have ONE reader (swept)', () => {
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (name === 'node_modules' || name === 'tests' || name === '__tests__') continue;
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.(ts|tsx|mts|cts|js|mjs|cjs)$/.test(name) && !/\.(test|spec)\./.test(name)) out.push(full.replace(/\\/g, '/'));
    }
    return out;
  };
  it("only mark-staleness-config.ts (the reader) and b72-warmup.ts (the boot verifier) read 'mark_staleness' knobs", () => {
    const files = walk('server');
    expect(files.length).toBeGreaterThan(300); // the walk reached the tree
    const readers = files.filter((f) => /getCachedNumberRequired\(\s*'mark_staleness'/.test(read(f)));
    expect(readers.sort()).toEqual(['server/asset_classes/xstock_spot/mark-staleness-config.ts', 'server/startup/b72-warmup.ts']);
  });
  it('capability arm — the pattern sees a literal read', () => {
    expect(/getCachedNumberRequired\(\s*'mark_staleness'/.test("getCachedNumberRequired('mark_staleness', 'floor_ms', k)")).toBe(true);
  });
});
