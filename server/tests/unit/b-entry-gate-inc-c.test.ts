/**
 * B-ENTRY-GATE (`#1224`) increment C — the BIRTH enforcement switch for EntryWindow, per asset class
 * (`entry_gate.entry_window_birth_live`). Langston P7 ruling (b), 2026-11-20: only `true` enforces; a missing or unusable
 * switch is SHADOW (loud, once per class per process), never a refusal; and the switch is read PER CLASS — the last test
 * goes red under the mutation "read the flag class-independently".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('../../core/logging/skipped-signals-logger.js', () => ({ logSkippedSignal: vi.fn() }));

import { _seedModuleCacheForTests, clearModuleConstantsCache } from '../../services/module-constants-service.js';
import {
  resolveBirthEntryWindowMode, _resetBirthLiveLogForTests, applyPlanGates, type SQEInput,
} from '../../core/filters/signal_quality_evaluator';

const row = (assetClass: string, constantName: string, value: unknown) => ({
  moduleName: 'entry_gate', exchange: '*', assetClass, strategy: '*', regime: '*', constantName, value,
}) as any;
const WINDOW = [row('crypto_spot', 'entry_window_worse_side_frac', 0.25), row('xstock_spot', 'entry_window_worse_side_frac', 0.25)];
const seed = (...birth: any[]) => _seedModuleCacheForTests('entry_gate', [...WINDOW, ...birth]);

// A taker birth whose price ran 3% past a 100 -> 96/108 plan: EntryWindow would refuse it.
const plan = { planEntry: 100, planStop: 96, planTarget: 108, chosenEntryMode: 'taker', priced: { ok: true, price: 103, ageMs: 50, source: 'book' } };
const birth = (assetClass: string) => {
  const f: string[] = [];
  const shadow = resolveBirthEntryWindowMode(assetClass) !== 'live';
  const o = applyPlanGates({ signalId: 's', symbol: 'X', strategy: 'x', mode: 'paper', assetClass, ...plan } as unknown as SQEInput,
    { phase: 'birth', entryWindowShadow: shadow }, f);
  return { o, refused: f.some((x) => x.startsWith('EntryWindow')) };
};

let log: ReturnType<typeof vi.spyOn>; let err: ReturnType<typeof vi.spyOn>;
beforeEach(() => { _resetBirthLiveLogForTests(); log = vi.spyOn(console, 'log').mockImplementation(() => {}); err = vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { log.mockRestore(); err.mockRestore(); });
const offLines = (cls: string) => [...log.mock.calls, ...err.mock.calls].map((c) => String(c[0])).filter((s) => s.includes('[B-ENTRY-GATE][INC_C]') && s.includes(`class=${cls}`));

describe('increment C — the birth switch', () => {
  it('row absent ⇒ SHADOW, never a refusal, and the line prints ONCE per class per process', () => {
    seed();
    expect(resolveBirthEntryWindowMode('crypto_spot')).toBe('shadow_absent');
    expect(birth('crypto_spot')).toEqual({ o: 'shadow_would_refuse', refused: false });
    resolveBirthEntryWindowMode('crypto_spot');
    expect(offLines('crypto_spot')).toHaveLength(1);
    expect(offLines('crypto_spot')[0]).toContain('mode=shadow_absent');
  });
  it('false ⇒ SHADOW (an explicit off)', () => {
    seed(row('crypto_spot', 'entry_window_birth_live', false));
    expect(resolveBirthEntryWindowMode('crypto_spot')).toBe('shadow_off');
    expect(birth('crypto_spot').refused).toBe(false);
  });
  it('true ⇒ LIVE: the same birth is refused (the failure is pushed, so it never reaches the queue)', () => {
    seed(row('crypto_spot', 'entry_window_birth_live', true));
    expect(resolveBirthEntryWindowMode('crypto_spot')).toBe('live');
    expect(birth('crypto_spot')).toEqual({ o: 'judged_refuse', refused: true });
    expect(offLines('crypto_spot')).toHaveLength(0);
  });
  it('a value that is not a boolean (e.g. the string "true", or 1) ⇒ SHADOW, logged as an error — only boolean true enforces', () => {
    for (const v of ['true', 1]) {
      _resetBirthLiveLogForTests();
      seed(row('crypto_spot', 'entry_window_birth_live', v));
      expect(resolveBirthEntryWindowMode('crypto_spot')).toBe('shadow_invalid');
      expect(birth('crypto_spot').refused).toBe(false);
    }
    expect(err.mock.calls.some((c) => String(c[0]).includes('mode=shadow_invalid'))).toBe(true);
  });
  it('a cold cache (the read throws) ⇒ SHADOW, logged as an error, never a refusal', () => {
    clearModuleConstantsCache(); // the real cold-cache state: getCachedConstant throws 'module is not warm'
    expect(resolveBirthEntryWindowMode('xstock_spot')).toBe('shadow_unresolved');
    expect(err.mock.calls.some((c) => String(c[0]).includes('[B-ENTRY-GATE][INC_C][BIRTH_LIVE_UNRESOLVED] class=xstock_spot'))).toBe(true);
  });
  it('PER CLASS: xStock true while crypto has no row ⇒ xStock refuses at birth, crypto stays shadow', () => {
    // Mutation guard: a class-independent read (assetClass '*', or one cached value for every class) returns the same
    // answer for both classes — so one of the two assertions below goes red.
    seed(row('xstock_spot', 'entry_window_birth_live', true));
    expect(resolveBirthEntryWindowMode('xstock_spot')).toBe('live');
    expect(resolveBirthEntryWindowMode('crypto_spot')).toBe('shadow_absent');
    expect(birth('xstock_spot').refused).toBe(true);
    expect(birth('crypto_spot').refused).toBe(false);
  });
});

// Step-4 condition 2 (Langston, 2026-11-20): the tests above prove the resolver, not that the orchestrator's birth call
// USES it — reverting the call to `entryWindowShadow: true` left all six green. The orchestrator needs its whole graph to
// run, so the wiring is proved at the source, as in `b-entry-gate-inc-b.test.ts`.
describe('increment C — the orchestrator birth call is wired to the per-class switch', () => {
  const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const src = stripComments(readFileSync('server/services/signal-orchestrator.ts', 'utf-8'));
  const births = src.match(/signalQualityEvaluator\.evaluate\([^;]*phase: 'birth'[^;]*\)/g) ?? [];

  it('exactly one birth SQE call, and its EntryWindow shadow flag comes from the resolver, never a literal', () => {
    expect(births).toHaveLength(1);
    expect(births[0]).toMatch(/entryWindowShadow: _birthEntryWindowShadow\b/);
    expect(births[0]).not.toMatch(/entryWindowShadow: (true|false)\b/);
  });
  it('the flag is "shadow unless the resolver says live", read for the signal\'s own asset class, before the call', () => {
    const def = src.indexOf("const _birthEntryWindowShadow = resolveBirthEntryWindowMode(String(sqeAssetClass)) !== 'live';");
    expect(def).toBeGreaterThan(0);
    expect(births).toHaveLength(1);
    expect(src.indexOf(births[0] as string)).toBeGreaterThan(def);
    expect(src.split('_birthEntryWindowShadow').length - 1).toBe(2); // defined once, used once
  });
});
