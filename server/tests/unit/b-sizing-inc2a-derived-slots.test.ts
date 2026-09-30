/**
 * B-SIZING-DEC-RESTORE increment 2a (obj-2 / obj-4, #698) — HOW MANY POSITIONS CAN BE OPEN IS DERIVED.
 *
 * Plan: `Scope Files/B_SIZING_DEC_RESTORE_PRE_AUDIT.md` §14 + §14.4 (Langston's ruling, graded ref a8b20eba9).
 * The stored `max_open_positions` setting is retired. The slot count is `floor(100 / effectiveP)`, where
 * `effectiveP` comes from the SAME resolver the sizer uses (`resolveEffectivePositionPct`), so the count and the
 * trade size cannot disagree (BLOCKER-2). `p` slices the exposure BUDGET, not the balance, so `e` plays no part
 * in the count (his retraction of ADDITION 4).
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

vi.mock('../../services/system-alerts.js', () => ({ addAlert: vi.fn(async () => ({ id: 'test-alert' })) }));
// The sizer's 0.97 buffer is read through the cached-required path. The retired pattern cap's key still answers 0.15
// here (a test value BELOW p = 20) so the 2e mutation below — re-introducing the pattern branch — has a cap to bite on.
vi.mock('../../services/module-constants-service.js', () => ({
  getCachedNumberRequired: vi.fn((module: string, key: string) =>
    module === 'pattern_pool_gates' && key === 'pattern_max_position_pct' ? 0.15 : 0.97),
}));

const _row = { current: null as Record<string, unknown> | null };
vi.mock('../../storage', () => ({
  storage: {
    getGuardrailsV2: async () => _row.current,
    // No portfolio state: the balance leg returns 0 with a warning. The slot count does not read the balance.
    getPortfolioState: async () => null,
  },
}));

import { deriveSlotCount, resolveEffectivePositionPct, sizeActivePositionForSignal } from '../../services/active-position-sizing.js';
import { buildSettingsFromGuardrails } from '../../services/guardrail-settings.js';
import { guardrailPolicy } from '../../services/guardrail-policy.js';

// The engine's two promotion loops refuse admissions on exactly this predicate (active-execution-engine.ts, both
// GUARDRAIL_READ_FAIL sites). It is restated here so the unit legs test what the loops actually do with the value.
const loopsHalt = (slots: number) => !Number.isFinite(slots) || slots <= 0;

describe('deriveSlotCount — floor(100 / effectiveP)', () => {
  it('Kyle\'s reset figure: 5% per position ⇒ 20 slots', () => expect(deriveSlotCount(5)).toBe(20));
  it('today\'s paper: 20% ⇒ 5 slots', () => expect(deriveSlotCount(20)).toBe(5));
  it('live: 30% ⇒ 3 slots (exposure already binds at 3)', () => expect(deriveSlotCount(30)).toBe(3));

  // MUTATION: replace the floor with Math.round and this fails (100 / 30 = 3.33 still floors, 100 / 6.67 = 14.99 does not).
  it('rounds DOWN, never up: 6.67% ⇒ 14, not 15', () => expect(deriveSlotCount(6.67)).toBe(14));

  it('an unreadable percent gives NaN, and the loops HALT on it', () => {
    const s = deriveSlotCount(Number.NaN);
    expect(Number.isNaN(s)).toBe(true);
    expect(loopsHalt(s)).toBe(true);
  });

  // §14.4 D9 (his third addition): p = 0 is not NaN — it is Infinity, which is finite-checked, not NaN-checked.
  it('p = 0 gives Infinity, and the loops HALT on it', () => {
    const s = deriveSlotCount(0);
    expect(s).toBe(Number.POSITIVE_INFINITY);
    expect(loopsHalt(s)).toBe(true);
  });

  it('a negative percent gives a negative count, and the loops HALT on it', () => {
    expect(loopsHalt(deriveSlotCount(-5))).toBe(true);
  });

  // §14.4 D4: p = 0.5 is FINITE and the loops do NOT halt on it — 200 slots. Increment 2b's entry floor of 1 was
  // WITHDRAWN in 2e (Kyle: no limit on the max position %): p = 0.5 is a legal setting; the size band alert sees it.
  it('p = 0.5 ⇒ 200 slots, the loops do not halt — and RULE_012 accepts it (no floor above 0)', () => {
    expect(deriveSlotCount(0.5)).toBe(200);
    expect(loopsHalt(deriveSlotCount(0.5))).toBe(false);
    const failures = guardrailPolicy.validate({ mode: 'paper', maxPositionPercentPct: 0.5 } as any).failures.map((f) => f.ruleId);
    expect(failures).not.toContain('RULE_012');
  });
});

describe('the invariant — N slots never commit more than the exposure budget', () => {
  // BLOCKER-2: obj-5's posture multiplier must land INSIDE resolveEffectivePositionPct. At ×1.25 (AGGRESSIVE) a slot
  // count taken from the raw p would size N trades at 1.25p = 125% of the budget. Taken from the resolver's output it
  // holds by construction. Both multipliers run here so the ×1.25 case is on record before obj-5 exists.
  for (const multiplier of [1, 1.25]) {
    it(`slots × effectiveP ≤ 100 for every p from 0.5% to 100%, posture ×${multiplier}`, () => {
      for (let p = 0.5; p <= 100; p += 0.25) {
        const effectiveP = resolveEffectivePositionPct(p * multiplier);
        expect(deriveSlotCount(effectiveP) * effectiveP, `p=${p} ×${multiplier}`).toBeLessThanOrEqual(100);
      }
    });
  }

  // The same statement through the REAL sizer, in dollars: $3,000, e = 100%, p = 5% ⇒ $145.50 a trade, 20 slots,
  // $2,910 committed = 97% of the budget (the 0.97 buffer). MUTATION: size from a different share than the resolver
  // returns and the committed total moves off the budget.
  it('through the sizer: Kyle\'s $3,000 reset at 5% ⇒ 20 × $145.50 = $2,910 ≤ $3,000', () => {
    const r = sizeActivePositionForSignal({
      mode: 'paper', portfolioValue: 3000, entryPrice: 100, stopPrice: 97, symbol: 'TEST/USD',
      strategy: 'breakout' as any,
      guardrails: { maxPositionPercentPct: '5.00', maxTotalExposurePct: '100.00' } as any,
    });
    const slots = deriveSlotCount(resolveEffectivePositionPct(5));
    expect(slots).toBe(20);
    expect(r.estimatedValue).toBeCloseTo(145.5, 2);
    expect(slots * r.estimatedValue).toBeLessThanOrEqual(3000);
  });

  // 2e Pe5 (Kyle 2026-09-30): the pattern-list cap is GONE — the resolver is the identity, so a pattern trade takes the
  // max position % exactly. MUTATION: put a cap back into the resolver and 20 no longer returns 20.
  it('the resolver is the identity — no pattern-list cap (2e)', () => {
    expect(resolveEffectivePositionPct(20)).toBe(20);
    expect(resolveEffectivePositionPct(5)).toBe(5);
  });

  // And through the REAL sizer: the sizer has NO source-pool input at all since 2e (A2 FINDING-2), so a pattern signal
  // cannot size differently from a quant one — the TYPE forbids passing it. This pins the one size at p = 20.
  it('through the sizer: every signal at p = 20 sizes 3000 x 100% x 20% x 0.97 = $582, and the sizer takes no source pool (2e)', () => {
    const base = { mode: 'paper' as const, portfolioValue: 3000, entryPrice: 100, stopPrice: 97, symbol: 'TEST/USD',
      strategy: 'breakout' as any,
      guardrails: { maxPositionPercentPct: '20.00', maxTotalExposurePct: '100.00' } as any };
    const r = sizeActivePositionForSignal(base);
    expect(r.estimatedValue).toBeCloseTo(582, 2); // 3000 x 100% x 20% x 0.97
    const sizer = readFileSync(join(process.cwd(), 'server/services/active-position-sizing.ts'), 'utf-8').replace(/\r\n/g, '\n');
    const params = sizer.slice(sizer.indexOf('export interface ActivePositionSizingParams {'), sizer.indexOf('export interface ActivePositionSizingResult {'));
    expect(params.length).toBeGreaterThan(100);          // the slice found the interface
    expect(params).toContain('portfolioValue: number;'); // positive control
    expect(params).not.toMatch(/^\s*(sourcePool|assetClass)\??\s*:/m);
  });
});

describe('buildSettingsFromGuardrails — maxOpenTrades is derived from the row, not read from it', () => {
  const row = (p: unknown) => ({
    mode: 'paper', maxPositionPercentPct: p, maxTotalExposurePct: '100.00',
    dailyLossKillSwitchPct: '7.00', killSwitchTripped: false,
    lowPriceThreshold: '1', lowPriceMinStopAtrMult: '1', lowPriceMinPositionNotional: '1',
  });
  const quiet = () => vi.spyOn(console, 'warn').mockImplementation(() => {});

  it('p = 5 ⇒ 20', async () => {
    const w = quiet(); _row.current = row('5.00');
    expect((await buildSettingsFromGuardrails('paper')).maxOpenTrades).toBe(20);
    w.mockRestore();
  });

  it('p = 30 ⇒ 3', async () => {
    const w = quiet(); _row.current = row('30.00');
    expect((await buildSettingsFromGuardrails('paper')).maxOpenTrades).toBe(3);
    w.mockRestore();
  });

  // MUTATION: put a `|| 15`-style default back and this fails. P19-B8.7's rule: no fabricated cap.
  it('an unreadable percent ⇒ NaN, never a substituted number', async () => {
    const w = quiet(); _row.current = row(undefined);
    const s = (await buildSettingsFromGuardrails('paper')).maxOpenTrades;
    expect(Number.isNaN(s)).toBe(true);
    expect(loopsHalt(Number(s))).toBe(true);
    w.mockRestore();
  });

  // The retired column, if a stale row still carried it, must not be what the count comes from.
  it('a stale max_open_positions on the row is ignored', async () => {
    const w = quiet(); _row.current = { ...row('5.00'), maxOpenPositions: 15 };
    expect((await buildSettingsFromGuardrails('paper')).maxOpenTrades).toBe(20);
    w.mockRestore();
  });
});

describe('ONE derivation (§14.4 BLOCKER-1) — every slot reader calls it, nothing re-derives it', () => {
  const src = (f: string) => readFileSync(join(process.cwd(), f), 'utf-8').replace(/\r\n/g, '\n');

  it('the sizer sizes from the resolver', () => {
    expect(src('server/services/active-position-sizing.ts'))
      .toContain('const effectiveMaxPositionPct = resolveEffectivePositionPct(safeMaxPositionPct);');
  });

  // (m5e left this list in increment 2d — the harness is deleted, P-11.)
  it('the settings builder and the state snapshot take the count from deriveSlotCount', () => {
    for (const f of ['server/services/guardrail-settings.ts', 'server/services/state-awareness.ts']) {
      expect(src(f), f).toContain('deriveSlotCount(');
    }
  });

  // (the m5e `floor(e / p)` twin test left with the harness in increment 2d; the legacy-deletion fence now asserts the
  //  harness does not come back.)

  // 2e Step-4 A2 BLOCKER-1 (Langston): since 2e the resolver is the identity, so an UNWRAPPED `deriveSlotCount(p)` is
  // type-clean and behaves the same today — until obj-5's posture term lands inside the resolver, when an unwrapped
  // site would report a slot count the engine does not use. So every call site is SWEPT, never listed: a new unwrapped
  // call in a new file fails here. The hit count is printed as the positive control.
  // Step-4 A2 re-review BLOCKER-1: EVERY JS/TS source extension (.ts .tsx .mts .cts .js .jsx .mjs .cjs — the first walk
  // missed four .cjs scripts), and tests excluded BY PREDICATE, not by one hardcoded folder: any path under a `tests` or
  // `__tests__` directory, and any `*.test.*` / `*.spec.*` file wherever it sits. The printed count is of the non-test
  // JS/TS source files under the four roots.
  const ROOTS = ['server', 'client', 'shared', 'scripts'];
  const SOURCE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
  const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;
  const TEST_DIR = new Set(['tests', '__tests__']);
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (name === 'node_modules' || name === 'dist' || TEST_DIR.has(name)) continue;
      const st = statSync(full);
      if (st.isDirectory()) walk(full, out);
      else if (SOURCE.test(name) && !TEST_FILE.test(name)) out.push(full);
    }
    return out;
  };
  const CALL = /deriveSlotCount\(/g;
  const WRAPPED = 'deriveSlotCount(resolveEffectivePositionPct(';
  const unwrapped = (text: string): number => {
    let n = 0;
    for (const m of text.matchAll(CALL)) {
      const at = m.index ?? 0;
      if (text.slice(Math.max(0, at - 16), at) === 'export function ') continue; // the definition
      if (!text.startsWith(WRAPPED, at)) n++;
    }
    return n;
  };
  it('capability arm — the sweep predicate sees an unwrapped call and passes a wrapped one and the definition', () => {
    expect(unwrapped('const s = deriveSlotCount(p);')).toBe(1);
    expect(unwrapped('const s = deriveSlotCount(resolveEffectivePositionPct(p));')).toBe(0);
    expect(unwrapped('export function deriveSlotCount(effectivePositionPct: number): number {')).toBe(0);
  });
  it('EVERY deriveSlotCount call in the codebase goes through resolveEffectivePositionPct (swept, not listed)', () => {
    const files = ROOTS.flatMap((r) => walk(r));
    let calls = 0;
    const bad: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, 'utf-8');
      const hits = (text.match(CALL) ?? []).length;
      if (hits === 0) continue;
      calls += hits;
      if (unwrapped(text) > 0) bad.push(f);
    }
    console.log(`[A2 BLOCKER-1 sweep] ${files.length} non-test JS/TS source files, ${calls} deriveSlotCount( occurrences incl. the definition`);
    expect(files.length).toBeGreaterThan(500);   // the walk reached the tree
    expect(calls).toBeGreaterThanOrEqual(5);      // positive control: the definition + today's four call sites
    expect(bad).toEqual([]);
  });
});

// (2a's test that POST /orchestrator/updateGuardrail refused maxOpenPositions is gone with the route itself —
//  increment 2d, #1090; the legacy-deletion fence now asserts the route and its schema do not come back.)

describe('2e Pe2 (Kyle 2026-09-30: no backup sizing path) — an unsized signal is REFUSED, never re-sized (source-text)', () => {
  // SOURCE-TEXT, not behaviour: driving processSignal needs the whole engine. P3 (2b) gave the fallback the working
  // balance; 2e deletes the fallback itself. MUTATION: restore the B6 fallback branch and every assertion fails.
  const src = readFileSync(join(process.cwd(), 'server/services/active-execution-engine.ts'), 'utf-8').replace(/\r\n/g, '\n');
  const i = src.indexOf('if (hasQuantity && hasEstimatedValue) {');
  const tail = src.slice(i, i + 4000);
  it('the fallback sizer is gone — no second sizing path in processSignal', () => {
    expect(i).toBeGreaterThan(0);
    expect(src).not.toContain('[B6][FALLBACK_SIZING]');
    expect(src).not.toContain('[B6][FALLBACK_SIZED]');
    expect(src).not.toContain('sizeActivePositionForSignal({');
  });
  it('the else of the two-field test refuses, counts, alerts once per engine session, and returns SIZING_INVALID', () => {
    expect(tail).toContain('[B-SIZING-DEC-RESTORE][UNSIZED_SIGNAL_REFUSED:');
    expect(tail).toContain("rtbMetricsService.recordOpenFailed(signal.symbol, signal.strategy, 'SIZING_INVALID', 'signal arrived unsized");
    expect(tail).toMatch(/dedupe_key: `unsized-signal-\$\{this\.mode\}-\$\{_sessionStart \? _sessionStart\.toISOString\(\) : PROCESS_BOOT_TOKEN\}`/);
    // Step-4 A1 condition 1: with no session the key must not collapse to a constant — a per-process token, stamped once
    expect(src).not.toContain("'no-session'");
    expect(src).toMatch(/^const PROCESS_BOOT_TOKEN = `boot-\$\{new Date\(\)\.toISOString\(\)\}`;$/m);
    expect(tail).toContain("return { opened: false, stage: 'SIZING_INVALID', reason: 'signal arrived unsized");
  });
});
