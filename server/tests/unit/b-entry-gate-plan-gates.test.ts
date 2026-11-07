/**
 * B-ENTRY-GATE (`#1224`) increment B, P2 — the PLAN gates in the SQE: InvalidTarget and EntryWindow (pre-audit P2, r11-r13).
 * EntryWindow judges only a TAKER-chosen plan, every way it declines to judge is counted (r12 C-2), and the plan travels
 * under its own names so the dormant ROI gate stays dormant (r11, with the positive control Langston required).
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('../../services/module-constants-service.js', async (orig) => {
  const actual = await orig<any>();
  return { ...actual, getCachedNumberRequired: vi.fn((mod: string, key: string) => {
    if (mod === 'entry_gate' && key === 'entry_window_worse_side_frac') return 0.25;
    return actual.getCachedNumberRequired(mod, key);
  }) };
});
// The ROI positive control: the gate's own economics are stubbed so the test isolates its GUARD (truthiness of
// entryPrice && targetPrice && regime), which is the thing r11 must keep asleep.
vi.mock('../../core/calculations/expectancy.js', async (orig) => ({
  ...(await orig<any>()), isSignalProfitable: vi.fn(() => false), getMinROIForRegime: vi.fn(() => 0.05), getDynamicROIThreshold: vi.fn(() => 0.05),
}));
vi.mock('../../core/math/cost-model.js', async (orig) => ({ ...(await orig<any>()), getFrictionForAssetClass: vi.fn(() => ({ feeRateTaker: 0.004, feeRateMaker: 0.002 })) }));
vi.mock('../../core/logging/skipped-signals-logger.js', () => ({ logSkippedSignal: vi.fn() }));

import { applyPlanGates, getEntryWindowTally, evaluateSignalQualitySync, type SQEInput } from '../../core/filters/signal_quality_evaluator';

const base = { signalId: 's', symbol: 'BTC/USD', strategy: 'x', mode: 'paper', assetClass: 'crypto_spot', finalScore: 0.9, regimeWeight: 0.9, chosenNetEv: 0.01 } as SQEInput;
const plan = { planEntry: 100, planStop: 96, planTarget: 108 };
const px = (price: number) => ({ ok: true as const, price, ageMs: 50, source: 'book' });
const run = (over: Partial<SQEInput>, opts: any = { phase: 'refresh' }) => { const f: string[] = []; const o = applyPlanGates({ ...base, ...plan, ...over } as SQEInput, opts, f); return { o, f }; };

describe('P2 — InvalidTarget', () => {
  it('no plan supplied ⇒ the plan gates do not run at all', () => {
    const f: string[] = [];
    expect(applyPlanGates(base, {}, f)).toBeNull();
    expect(f).toEqual([]);
  });
  it('a target that is absent, non-finite or not above the entry refuses', () => {
    for (const t of [null, Number.NaN, 100, 99]) expect(run({ planTarget: t as any, chosenEntryMode: 'maker' }).f.some((x) => x.startsWith('InvalidTarget'))).toBe(true);
    expect(run({ chosenEntryMode: 'maker' }).f).toEqual([]);
  });
});

describe('P2 — EntryWindow judges only a taker, and counts every way it declines', () => {
  it('a taker inside the window passes; one tick past the edge refuses at refresh', () => {
    expect(run({ chosenEntryMode: 'taker', priced: px(101) })).toEqual({ o: 'judged_pass', f: [] });
    const r = run({ chosenEntryMode: 'taker', priced: px(101.01) });
    expect(r.o).toBe('judged_refuse');
    expect(r.f.some((x) => x.startsWith('EntryWindow'))).toBe(true);
  });
  it('at birth it is its own shadow: the same refusal is recorded and never pushed', () => {
    const r = run({ chosenEntryMode: 'taker', priced: px(103) }, { phase: 'birth', entryWindowShadow: true });
    expect(r.o).toBe('shadow_would_refuse');
    expect(r.f).toEqual([]);
  });
  it('a maker plan is never judged (P3: its ask running up changes its fill chance, not its price)', () => {
    expect(run({ chosenEntryMode: 'maker', priced: px(150) })).toEqual({ o: 'skip_maker', f: [] });
  });
  it('absent mode, absent price and a refused price are NAMED skips, each counted (r12 C-2, Q-2)', () => {
    expect(run({ chosenEntryMode: undefined, priced: px(150) }).o).toBe('skip_mode_absent');
    expect(run({ chosenEntryMode: 'taker', priced: undefined }).o).toBe('skip_no_price');
    expect(run({ chosenEntryMode: 'taker', priced: { ok: false, reason: 'class_unresolved' } }).o).toBe('skip_price_refused');
    const t = getEntryWindowTally();
    for (const k of ['refresh:crypto_spot:skip_mode_absent', 'refresh:crypto_spot:skip_no_price', 'refresh:crypto_spot:skip_price_refused', 'birth:crypto_spot:shadow_would_refuse'])
      expect(t[k]).toBeGreaterThanOrEqual(1);
  });
  it('a stop that is absent, non-finite or not below the plan entry is NOT a pass: skip_invalid_geometry, counted (Langston C-1)', () => {
    for (const planStop of [undefined, Number.NaN, Number.POSITIVE_INFINITY, 100, 101] as any[]) {
      const r = run({ chosenEntryMode: 'taker', priced: px(100.5), planStop });
      expect(r.o).toBe('skip_invalid_geometry');
      expect(r.o).not.toBe('judged_pass');
      expect(r.f.some((x) => x.startsWith('EntryWindow'))).toBe(false);
    }
    // birth (the pre-registered shadow denominator): the same plan is a named skip there too, never a pass
    expect(run({ chosenEntryMode: 'taker', priced: px(100.5), planStop: undefined } as any, { phase: 'birth', entryWindowShadow: true }).o).toBe('skip_invalid_geometry');
    expect(getEntryWindowTally()['refresh:crypto_spot:skip_invalid_geometry']).toBeGreaterThanOrEqual(5);
    expect(getEntryWindowTally()['birth:crypto_spot:skip_invalid_geometry']).toBeGreaterThanOrEqual(1);
  });
  it('the exploration lane cannot admit on either plan gate (neither wears the `NetEV ` prefix)', () => {
    expect(run({ chosenEntryMode: 'taker', priced: px(110), planTarget: null }).f.every((x) => !x.startsWith('NetEV '))).toBe(true);
  });
});

describe('r11 — the dormant ROI gate stays dormant: plan names, a truthiness fence, and its positive control', () => {
  it('POSITIVE CONTROL: with entryPrice, targetPrice and regime all truthy, the ROI gate FIRES', () => {
    const r = evaluateSignalQualitySync({ ...base, entryPrice: 100, targetPrice: 100.01, regime: 'trending_bull' } as any);
    expect(r.failures.some((x) => x.startsWith('ROI '))).toBe(true);
  });
  it('the same plan under its own names does NOT wake it', () => {
    const r = evaluateSignalQualitySync({ ...base, ...plan, regime: 'trending_bull' } as any);
    expect(r.failures.some((x) => x.startsWith('ROI '))).toBe(false);
  });
  it('neither field is TRUTHY at either live SQEInput literal (the guard is truthiness, not presence)', () => {
    const lit = (file: string) => {
      const s = readFileSync(file, 'utf-8').replace(/\/\/.*$/gm, '');
      const i = s.indexOf('const sqeInput: SQEInput = {');
      expect(i).toBeGreaterThan(0);
      return s.slice(i, s.indexOf('\n    };', i) > 0 ? s.indexOf('};', i) : s.indexOf('};', i));
    };
    for (const f of ['server/services/signal-orchestrator.ts', 'server/core/rtb/ready_to_buy_service.ts']) {
      const body = lit(f);
      expect(body).toMatch(/planEntry:/);                     // the literal really is the one carrying the plan
      expect(body).not.toMatch(/\bentryPrice\s*:/);
      expect(body).not.toMatch(/\btargetPrice\s*:/);
    }
  });
  it('chosenEntryMode is declared as gated now (r12 C-1), not "never gated on"', () => {
    const s = readFileSync('server/core/filters/signal_quality_evaluator.ts', 'utf-8');
    expect(s).not.toMatch(/chosenEntryMode\?: 'maker' \| 'taker';\s*\/\/ logging\/telemetry only — never gated on/);
  });
});
