/**
 * `B-PRICE-SIDE-BY-JOB` row `8a-P4c`, increment 3 (plan §C3) — the VTS xStock quote guard, the exit wiring, and the ONE
 * reader of the mark-staleness knobs. Every refusal arm fires on a known input (capability, `#661`); the `#1065` MDB
 * stub-bid frame is the known positive the stateless spread ceiling exists to refuse.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { guardXstockQuote } from '../../asset_classes/xstock_spot/vts-xs-guard.js';
import { XsVtsInstrument, XS_LIVE_REASONS, type XsQuoteRow } from '../../asset_classes/xstock_spot/vts-xs-instrument.js';
import { assertVtsXstockTouchKnobsAtBoot, readVtsXstockExitMaxSpread } from '../../asset_classes/xstock_spot/vts-xs-touch-config.js';
import { stepNoTriggerStreak } from '../../core/trading/vts-no-trigger-streak.js';
import { _seedModuleCacheForTests, clearModuleConstantsCache } from '../../services/module-constants-service.js';
import { STRATEGY_DISPLAY_NAMES } from '../../config/canonical-regime-strategy-map.js';

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
    expect(VTS).toMatch(/maxSpread = readVtsXstockExitMaxSpread\(\);/);
    expect(VTS).not.toMatch(/'vts_xstock_touch'/); // one reader: vts-xs-touch-config.ts
    expect(VTS).toMatch(/computeStalenessCeiling\(/);
  });
  it('both lanes kick the SHARED σ cache for their open xStock symbols', () => {
    expect(VTS).toMatch(/kickVtsXstockSigma\('vts', xstockSymbols\);/);
    expect(VTS).toMatch(/kickVtsXstockSigma\('shadow', xstockSymbols\);/);
    // Langston Step-4 nit: the width of a kick is logged when non-zero
    expect(VTS).toMatch(/\[8a-P4c\]\[VTS_XS_SIGMA\] lane=\$\{lane\} enqueued=\$\{k\.enqueued\}/);
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
  // Langston Step-4 nit: the predicate was narrower than its claim (a `getCachedConstant('mark_staleness', …)` reader
  // passed). Broadened to the BARE LITERAL — any file naming the module is a reader or a verifier.
  const MS_LITERAL = /['"`]mark_staleness['"`]/;
  const code = (f: string) => read(f).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n'); // comments are documentation
  it("only mark-staleness-config.ts (the reader) and b72-warmup.ts (the boot verifier) name the 'mark_staleness' module", () => {
    const files = walk('server');
    expect(files.length).toBeGreaterThan(300); // the walk reached the tree
    const readers = files.filter((f) => MS_LITERAL.test(code(f)));
    expect(readers.sort()).toEqual(['server/asset_classes/xstock_spot/mark-staleness-config.ts', 'server/startup/b72-warmup.ts']);
  });
  it('capability arm — the pattern sees a literal read by ANY reader', () => {
    expect(MS_LITERAL.test("getCachedNumberRequired('mark_staleness', 'floor_ms', k)")).toBe(true);
    expect(MS_LITERAL.test("getCachedConstant<number>('mark_staleness', 'floor_ms', k)")).toBe(true);
    expect(MS_LITERAL.test("getCachedNumberRequired('mark_stalenessX', 'floor_ms', k)")).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Langston Step-4 (2026-09-30) BLOCKER-1 — the class, not the instance: EVERY module a sync reader names is prefetched.
// A seeded row in an unprefetched module is unreachable from a sync caller (`getCachedConstant` throws "is not warm"), and
// a fail-closed caller then reads as QUIET, not broken. `#1123`: the census that built this found two pre-existing misses
// (`feed_health`, `strategy.orb`) beside `vts_xstock_touch`. `vts_xstock_touch` and `strategy.orb` are listed;
// `feed_health` is the ONE declared exception (Langston r2 SPLIT: listing it arms another owner's alerting path).
// ⛔ r2 BLOCKER-3: the census reads SOURCE, not lines — the house style puts the module on the line AFTER `getCached…(`
// (`orb.ts` `strategy_gates`, `strong-bull-trend.ts` `strategy_dbs_routing_guards`), which a per-line scan cannot see.
// Comments are blanked first (newlines kept, so every `:line` still points at the call).
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
const SYNC_READER = /\b(getCachedConstant|getCachedNumbersForModule|getCachedNumberRequired|getCachedStringRequired)\s*(?:<[^>()]*>)?\(\s*([^,\s)]+)/g;
const LITERAL = /^(['"])([^'"]*)\1$/;

/** Blanks block and line comments, keeping every newline so offsets map to the same line. */
function stripComments(src: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, ' ');
  return src.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/\/\/[^\n]*/g, blank);
}

function prefetchedModules(): Set<string> {
  const w = read('server/startup/b72-warmup.ts');
  const start = w.indexOf('const PREFETCH_MODULES = [');
  const blk = w.slice(start, w.indexOf('];', start));
  const set = new Set(Array.from(blk.matchAll(/^\s*'([a-z_0-9.]+)'/gm), (m) => m[1]));
  // The second prefetch site (census: every `prefetchModule(` call outside the service itself).
  if (/await prefetchModule\('passive_archive'\)/.test(read('server/startup/passive-archive-bootstrap.ts'))) set.add('passive_archive');
  return set;
}

/** The DECLARED exceptions — a module read sync but deliberately not prefetched, each with its reason and its PLACED home.
 *  The census asserts this list is exactly its misses (an exception that stops missing is stale and fails), and r3 BLOCKER-4:
 *  the home is checked by READING THE PLAN for the row, never by the shape of a sentence. */
const PREFETCH_EXCEPTIONS: Array<{ module: string; reason: string; batch: string; owner: string; planRow: string }> = [
  { module: 'feed_health',
    reason: 'prefetching it ARMS the feed-liveness grade (feed-integrity-monitor.ts, the only reader), which mints feed_health '
      + 'alerts for both classes — a switch-on of another owner\'s component, not a VTS-instrumentation change (Langston r2)',
    batch: 'B-FEED-HEALTH-GRADE-ARM', owner: 'CC-B', planRow: '3a' },
];

/** The active plan's §4 rows as the plan's own tally rule defines them: a table line of exactly 7 cells whose first cell
 *  is a row id (digits plus at most one letter). Returns id → { batch cell, owner cell }. */
function planRows(): Map<string, { batch: string; owner: string }> {
  const out = new Map<string, { batch: string; owner: string }>();
  for (const line of read('1-system-manual/SPRINT_TO_LIVE_PLAN.md').split('\n')) {
    if (!line.startsWith('|')) continue;
    const c = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((x) => x.trim());
    if (c.length === 7 && /^\d+[a-z]?$/.test(c[0])) out.set(c[0], { batch: c[2], owner: c[3] });
  }
  return out;
}

/** Non-literal first arguments, each resolved to its module by a definition this test re-reads (never trusted). */
const RESOLVED_NON_LITERALS: Array<{ file: string; expr: string; module: string | null; def: { file: string; re: RegExp } | null }> = [
  { file: 'server/asset_classes/xstock_spot/book-state-config.ts', expr: 'BOOK_STATE_MODULE', module: 'book_state',
    def: { file: 'server/asset_classes/xstock_spot/book-state.ts', re: /BOOK_STATE_MODULE\s*=\s*'book_state'/ } },
  { file: 'server/asset_classes/xstock_spot/vts-xs-touch-config.ts', expr: 'VTS_XSTOCK_TOUCH_MODULE', module: 'vts_xstock_touch',
    def: { file: 'server/asset_classes/xstock_spot/vts-xs-touch-config.ts', re: /VTS_XSTOCK_TOUCH_MODULE\s*=\s*'vts_xstock_touch'/ } },
  { file: 'server/services/amr-context-bonus-shadow.ts', expr: 'MOD', module: 'ranking_context_bonus',
    def: { file: 'server/services/amr-context-bonus-shadow.ts', re: /const MOD\s*=\s*'ranking_context_bonus'/ } },
  { file: 'server/services/passive-archive/ohlc-frame-skip-tracker.ts', expr: 'OHLC_FRAME_SKIP_ALERT_KNOB.module', module: 'passive_archive',
    def: { file: 'server/services/passive-archive/ohlc-frame-skip-tracker.ts', re: /OHLC_FRAME_SKIP_ALERT_KNOB = \{ module: 'passive_archive'/ } },
  // `strategy.${…}` — dynamic over strategy names: sound only while EVERY strategy in the SSOT (`STRATEGY_DISPLAY_NAMES`)
  // has its module prefetched — asserted below from the SSOT itself (Langston r3 condition), so strategy 20 cannot land unwarm.
  { file: 'server/services/data-archive/decision-provenance.ts', expr: 'moduleName', module: null,
    def: { file: 'server/services/data-archive/decision-provenance.ts', re: /const moduleName = `strategy\.\$\{strategy\}`;/ } },
  { file: 'server/services/strategy-engine.ts', expr: '`strategy.${signal.strategy}`', module: null, def: null },
  // The service itself: its four sync readers' own signatures (`moduleName:`) and its internal pass-throughs.
  { file: 'server/services/module-constants-service.ts', expr: 'moduleName', module: null, def: null },
  { file: 'server/services/module-constants-service.ts', expr: 'moduleName:', module: null, def: null },
];

type Read = { at: string; module: string };
function syncReadCensus(files: Array<{ path: string; src: string }>, prefetched: Set<string>):
  { reads: Read[]; multiLine: Read[]; misses: Read[]; unresolved: string[] } {
  const reads: Read[] = [];
  const multiLine: Read[] = [];
  const misses: Read[] = [];
  const unresolved: string[] = [];
  for (const { path, src } of files) {
    const code = stripComments(src);
    const lineAt = (i: number) => code.slice(0, i).split('\n').length;
    for (const m of code.matchAll(SYNC_READER)) {
      const at = `${path}:${lineAt(m.index as number)}`;
      const arg = m[2];
      const lit = LITERAL.exec(arg);
      if (lit) {
        const r = { at, module: lit[2] };
        reads.push(r);
        if (lineAt((m.index as number) + m[0].length - arg.length) !== lineAt(m.index as number)) multiLine.push(r);
        if (!prefetched.has(lit[2])) misses.push(r);
      } else if (!RESOLVED_NON_LITERALS.some((x) => x.file === path && x.expr === arg)) {
        unresolved.push(`${at} ${arg}`);
      }
    }
  }
  return { reads, multiLine, misses, unresolved };
}

describe('8a-P4c inc 3 — BLOCKER-1 class: every sync-read module_constants module is prefetched (swept)', () => {
  const walkAll = (dir: string, out: string[] = []): string[] => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (name === 'node_modules' || name === 'tests' || name === '__tests__') continue;
      if (statSync(full).isDirectory()) walkAll(full, out);
      else if (/\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(name) && !/\.(test|spec)\.[cm]?[jt]sx?$/.test(name)) out.push(full.replace(/\\/g, '/'));
    }
    return out;
  };
  const files = walkAll('server').map((path) => ({ path, src: read(path) }));
  const prefetched = prefetchedModules();
  const census = syncReadCensus(files, prefetched);

  it('the census reaches the tree and the prefetch list (positive control on both instruments)', () => {
    expect(files.length).toBeGreaterThan(300);
    expect(prefetched.has('mark_staleness')).toBe(true);
    expect(prefetched.has('strategy.abcd_long')).toBe(true); // a dotted name — the parse that once read these as absent
    expect(prefetched.has('passive_archive')).toBe(true);
    // measured at 93c6ed052+: 200 literal reads over 219 call sites (the per-line scan saw fewer and missed the multi-line
    // shape); a collapse means the scan broke, not that reads vanished
    expect(census.reads.length).toBeGreaterThanOrEqual(190);
  });

  it('r2 BLOCKER-3 — REAL members of the multi-line shape are seen (the #744 rider: the failure class, on live code)', () => {
    const has = (file: string, module: string) => census.multiLine.some((r) => r.at.startsWith(`${file}:`) && r.module === module);
    expect(has('server/strategies/orb.ts', 'strategy_gates')).toBe(true);
    expect(has('server/strategies/strong-bull-trend.ts', 'strategy_dbs_routing_guards')).toBe(true);
  });

  it('the ONLY misses are the declared exceptions — each with a reason and a placed home — and none is stale', () => {
    expect(PREFETCH_EXCEPTIONS.map((e) => e.module)).toEqual(['feed_health']);
    const rows = planRows();
    expect(rows.size).toBeGreaterThan(200); // the plan parsed (229 rows at build)
    for (const e of PREFETCH_EXCEPTIONS) {
      expect(e.reason.length).toBeGreaterThan(20);
      const row = rows.get(e.planRow);
      expect(row, `plan row ${e.planRow} must exist in SPRINT_TO_LIVE_PLAN.md`).toBeDefined();
      expect((row as { batch: string }).batch).toContain(e.batch);
      expect((row as { owner: string }).owner.startsWith(e.owner)).toBe(true);
      expect(prefetched.has(e.module)).toBe(false);
    }
    // CAPABILITY: the plan check fails on a home that is named but not placed
    expect([...rows.values()].some((r) => r.batch.includes('B-NOT-A-PLACED-BATCH'))).toBe(false);
    expect(rows.get('3')?.batch).toContain('B-VTS-MARK-SIDE'); // a known row reads as itself
    expect([...new Set(census.misses.map((m) => m.module))].sort()).toEqual(PREFETCH_EXCEPTIONS.map((e) => e.module).sort());
    for (const m of ['vts_xstock_touch', 'strategy.orb']) expect(prefetched.has(m)).toBe(true);
  });

  it('r3 condition — EVERY strategy in the SSOT has its module prefetched (the dynamic `strategy.${…}` readers are sound)', () => {
    const keys = Object.keys(STRATEGY_DISPLAY_NAMES);
    expect(keys.length).toBeGreaterThanOrEqual(19); // 19 at build
    expect(keys.filter((k) => !prefetched.has(`strategy.${k}`))).toEqual([]);
  });

  it('every NON-literal module argument is resolved, and each resolution is re-read at its definition', () => {
    expect(census.unresolved).toEqual([]);
    for (const r of RESOLVED_NON_LITERALS) {
      if (r.def) expect(read(r.def.file)).toMatch(r.def.re);
      if (r.module) expect(prefetched.has(r.module)).toBe(true);
    }
  });

  it('CAPABILITY — single-line AND both real multi-line shapes on unlisted modules go red; comments are ignored', () => {
    const fake = [{ path: 'server/fake.ts', src: [
      "const a = getCachedNumberRequired('not_prefetched_mod', 'k', KEY);",
      "const b = getCachedConstant<string>('also_missing', 'k', KEY);",
      "const c = getCachedNumbersForModule(SOME_CONST, KEY);",
      "// getCachedNumberRequired('commented_out', 'k', KEY);",
      "enabled = getCachedConstant<boolean>(",            // the orb.ts shape
      "  'unlisted_gate', 'enabled',",
      "  { exchange: '*', assetClass, strategy: S, regime: '*' },",
      ");",
      "const g = getCachedNumberRequired(",                // the strong-bull-trend.ts shape
      "  'unlisted_guard',",
      "  'dbs_min_threshold',",
      ");",
      "/* getCachedNumberRequired(",
      "  'block_commented', 'k', KEY); */",
    ].join('\n') }];
    const r = syncReadCensus(fake, prefetched);
    expect(r.misses).toEqual([
      { at: 'server/fake.ts:1', module: 'not_prefetched_mod' },
      { at: 'server/fake.ts:2', module: 'also_missing' },
      { at: 'server/fake.ts:5', module: 'unlisted_gate' },
      { at: 'server/fake.ts:9', module: 'unlisted_guard' },
    ]);
    expect(r.multiLine.map((x) => x.module)).toEqual(['unlisted_gate', 'unlisted_guard']);
    expect(r.unresolved).toEqual(['server/fake.ts:3 SOME_CONST']);
  });
});

describe('8a-P4c inc 3 — BLOCKER-1: the spread ceiling is asserted at boot, and read through ONE reader', () => {
  const touchRow = (value: unknown) => ({
    moduleName: 'vts_xstock_touch', exchange: '*', assetClass: 'xstock_spot', strategy: '*', regime: '*',
    constantName: 'exit_max_spread_fraction', value,
  }) as never;
  beforeEach(() => clearModuleConstantsCache());

  it('a seeded, warm row passes and is what the reader returns', () => {
    _seedModuleCacheForTests('vts_xstock_touch', [touchRow(0.0107)]);
    expect(assertVtsXstockTouchKnobsAtBoot()).toBe(0.0107);
    expect(readVtsXstockExitMaxSpread()).toBe(0.0107);
  });
  it('a COLD module (not prefetched) refuses to boot, naming both causes', () => {
    expect(() => assertVtsXstockTouchKnobsAtBoot()).toThrow(/has not been applied, or the module is missing from PREFETCH_MODULES/);
  });
  it('a warm module with no row refuses to boot', () => {
    _seedModuleCacheForTests('vts_xstock_touch', []);
    expect(() => assertVtsXstockTouchKnobsAtBoot()).toThrow(/unreadable/);
  });
  it.each([0, -0.01, 0.05, 0.2])('an out-of-range ceiling (%s) refuses to boot', (v) => {
    _seedModuleCacheForTests('vts_xstock_touch', [touchRow(v)]);
    expect(() => assertVtsXstockTouchKnobsAtBoot()).toThrow(/outside \(0, 0\.05\)/);
  });
  it('b72-warmup lists the module AND runs the assertion', () => {
    const w = read('server/startup/b72-warmup.ts');
    expect(w).toMatch(/^\s*'vts_xstock_touch',$/m);
    expect(w).toMatch(/const v = assertVtsXstockTouchKnobsAtBoot\(\);/);
  });
});

describe('8a-P4c inc 3 — BLOCKER-2: the instrument counts the LIVE guard by its own reason', () => {
  const T = Date.parse('2026-09-30T15:00:00Z'); // a weekday, US regular session
  const r0 = (o: Partial<XsQuoteRow> = {}): XsQuoteRow => ({ last: 100, bid: 99.95, ask: 100.05, atMs: T - 5_000, ...o });
  const run = (looks: Array<[XsQuoteRow | null, { reason: (typeof XS_LIVE_REASONS)[number]; ceilingMs: number | null } | null]>) => {
    const lines: string[] = [];
    const inst = new XsVtsInstrument('vts', (l) => lines.push(l));
    inst.beginPass(T);
    for (const [row, live] of looks) inst.recordLook('AAA/USD', row, T, 95, 105, live);
    inst.endPass();
    const pass = lines.find((l) => l.startsWith('[8a-P4c][VTS_XS_TOUCH]')) as string;
    const num = (k: string) => Number((new RegExp(`\\b${k}=(\\d+)`).exec(pass) as RegExpExecArray)[1]);
    const live = JSON.parse((/\blive=(\[[^\]]*\])/.exec(pass) as RegExpExecArray)[1]) as number[];
    return { pass, applied: num('appliedLooks'), refusedLive: num('refusedLive'), looks: num('looks'), live };
  };

  it('every reason lands in its own slot; S1 counts only AGE refusals among applied looks', () => {
    const c = 60_000;
    const r = run([
      [r0(), { reason: 'ok', ceilingMs: c }],
      [null, { reason: 'no_row', ceilingMs: 15_000 }],
      [r0({ atMs: null }), { reason: 'age_unknown', ceilingMs: c }],
      [r0({ atMs: T - 90_000 }), { reason: 'too_old', ceilingMs: c }],
      [r0({ bid: null }), { reason: 'side_unusable', ceilingMs: c }],
      [r0({ bid: 99, ask: 101 }), { reason: 'too_wide', ceilingMs: c }],
      [r0(), { reason: 'knobs_unavailable', ceilingMs: null }],
    ]);
    expect(XS_LIVE_REASONS).toEqual(['ok', 'no_row', 'age_unknown', 'too_old', 'side_unusable', 'too_wide', 'knobs_unavailable']);
    expect(r.live).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect(r.looks).toBe(7);
    expect(r.applied).toBe(6);      // knobs_unavailable applied no ceiling …
    expect(r.refusedLive).toBe(3);  // … and S1's numerator is the three AGE refusals, read from the guard
  });

  it('a total knob outage is VISIBLE — it can no longer read as "no open xStock trades" (the BLOCKER-1 shape)', () => {
    const r = run([[r0(), { reason: 'knobs_unavailable', ceilingMs: null }], [r0(), { reason: 'knobs_unavailable', ceilingMs: null }]]);
    expect(r.applied).toBe(0);
    expect(r.refusedLive).toBe(0);
    expect(r.live[XS_LIVE_REASONS.indexOf('knobs_unavailable')]).toBe(2); // the fault has its own counter
  });

  it('a live too_wide at the 0.0107 ceiling is counted even where the frozen 0.01115 instrument band calls it narrow', () => {
    const r = run([[r0({ bid: 99.45, ask: 100.55 }), { reason: 'too_wide', ceilingMs: 60_000 }]]); // 1.1% spread
    expect(r.live[XS_LIVE_REASONS.indexOf('too_wide')]).toBe(1);
    expect(r.pass).toMatch(/\bwide=0\b/); // the pre-registered instrument band, unchanged by design
  });

  it('the Step-7 extract labels the live vector in the SAME order the instrument emits it', () => {
    const py = read('scripts/analysis/p4c-window-extract.py');
    const m = /^LIVE_REASONS = (\[[^\]]*\])/m.exec(py);
    expect(m).not.toBeNull();
    expect(JSON.parse((m as RegExpExecArray)[1].replace(/'/g, '"'))).toEqual([...XS_LIVE_REASONS]);
  });

  it('both lanes hand the guard verdict itself to the instrument (never a re-derived proxy)', () => {
    expect(VTS).toMatch(/_xsVtsInstrument\.recordLook\(trade\.symbol, _xsRow, Date\.now\(\), trade\.stopLoss \?\? null, trade\.takeProfit \?\? null, _xsExit\);/);
    expect(VTS).toMatch(/_xsShadowInstrument\.recordLook\(trade\.symbol, _sxRow, Date\.now\(\), trade\.stopLoss \?\? null, trade\.takeProfit \?\? null, _sx\);/);
    expect(VTS).toMatch(/\[8a-P4c\]\[VTS_XS_KNOBS_UNAVAILABLE\]/); // and the outage logs
  });
});

describe('8a-P4c inc 3 — FINDING-1: the streak is tracked in every session; only the PAGE is session-gated', () => {
  const MIN = 60_000;
  const TH = 10 * MIN;
  type Step = ReturnType<typeof stepNoTriggerStreak>;
  const drive = (ticks: Array<{ t: number; reason?: string; pages: boolean }>): Step[] => {
    let s: Step['next'] | undefined;
    return ticks.map(({ t, reason, pages }) => {
      const st = stepNoTriggerStreak(s ?? undefined, reason, pages, t, TH);
      s = st.next ?? undefined;
      return st;
    });
  };

  it('crypto (always paging): pages ONCE after the threshold', () => {
    const st = drive([0, 5, 10, 11, 30].map((m) => ({ t: m * MIN, reason: 'no_transactable_side', pages: true })));
    expect(st.map((x) => x.page)).toEqual([false, false, true, false, false]);
  });

  it('xStock off-hours: tracked, NEVER paged; the streak survives into the session and its full length is returned', () => {
    const st = drive([
      { t: 0, reason: 'no_transactable_side', pages: false },          // overnight
      { t: 300 * MIN, reason: 'no_transactable_side', pages: false },  // still overnight, 5 h in — no page
      { t: 301 * MIN, reason: 'no_transactable_side', pages: true },   // the open: the PAGE clock starts now
      { t: 305 * MIN, reason: 'no_transactable_side', pages: true },   // 4 min of paging time — no page
      { t: 312 * MIN, reason: 'no_transactable_side', pages: true },   // 11 min of paging time — page
      { t: 320 * MIN, reason: undefined, pages: true },                 // a decision ends it
    ]);
    expect(st.map((x) => x.page)).toEqual([false, false, false, false, true, false]);
    expect(st[1].next?.sinceMs).toBe(0);            // tracked across off-hours (the old code deleted it)
    expect(st[5].ended?.sinceMs).toBe(0);           // the whole 320-minute streak reaches the caller to be logged
    expect(st[5].ended?.alerted).toBe(true);
    expect(st[5].next).toBeNull();
  });

  it('an in-session streak crossing the close does not page off-hours, and the page clock restarts at the next open', () => {
    const st = drive([
      { t: 0, reason: 'no_usable_mark', pages: true },
      { t: 8 * MIN, reason: 'no_usable_mark', pages: true },    // 8 min in session
      { t: 9 * MIN, reason: 'no_usable_mark', pages: false },   // the close — page clock stops
      { t: 20 * MIN, reason: 'no_usable_mark', pages: false },  // off-hours past the threshold — no page
      { t: 500 * MIN, reason: 'no_usable_mark', pages: true },  // next open — clock restarts at 0
      { t: 505 * MIN, reason: 'no_usable_mark', pages: true },  // 5 min — no page
      { t: 510 * MIN, reason: 'no_usable_mark', pages: true },  // 10 min of the new run — page
    ]);
    expect(st.map((x) => x.page)).toEqual([false, false, false, false, false, false, true]);
    expect(st[3].next?.pageSinceMs).toBeNull();
    expect(st[4].next?.pageSinceMs).toBe(500 * MIN);
  });

  it('r2 FINDING-2 — a trade that paged and stays stuck pages ONCE MORE in each later session (clock and latch restart together)', () => {
    const st = drive([
      { t: 0, reason: 'no_transactable_side', pages: true },
      { t: 10 * MIN, reason: 'no_transactable_side', pages: true },   // session 1 — page
      { t: 30 * MIN, reason: 'no_transactable_side', pages: true },   // still session 1 — silent
      { t: 40 * MIN, reason: 'no_transactable_side', pages: false },  // the close
      { t: 900 * MIN, reason: 'no_transactable_side', pages: true },  // next open — a new run
      { t: 910 * MIN, reason: 'no_transactable_side', pages: true },  // 10 min into it — page again
      { t: 950 * MIN, reason: 'no_transactable_side', pages: true },  // silent for the rest of that run
    ]);
    expect(st.map((x) => x.page)).toEqual([false, true, false, false, false, true, false]);
    expect(st[6].next?.sinceMs).toBe(0); // one streak throughout — only the page clock and latch restarted
  });

  it('a decision with no streak ends nothing', () => {
    expect(stepNoTriggerStreak(undefined, undefined, true, 0, TH)).toEqual({ next: null, page: false, ended: null });
  });
});
