/**
 * B-PRICE-SIDE-BY-JOB `#1250` P1 — `rebaseLevels`, per form, per side of the plan, the mixed re-application (BLOCKER-6),
 * the self-consistency at the arriving plan (BLOCKER-7), rounding with the cap bit (C-2), and the refusals.
 */
import { describe, it, expect } from 'vitest';
import { rebaseLevels, isWellFormedLegSpec, type LevelSpec } from '../../core/trading/level-rebase.js';

const base = { planEntry: 100, planStop: 98, planTarget: 104, tick: null as number | null };

describe('#1250 P1 — single forms', () => {
  it('no spec ⇒ every leg on the plan (today, the fail-safe)', () => {
    const r = rebaseLevels({ ...base, fill: 99, spec: undefined });
    expect(r).toMatchObject({ ok: true, stopPrice: 98, targetPrice: 104, stopBasis: 'plan', targetBasis: 'plan' });
  });
  it('anchor ⇒ unchanged on a cheaper fill', () => {
    const r = rebaseLevels({ ...base, fill: 99, spec: { stop: { form: 'anchor' }, target: { form: 'anchor' } } });
    expect(r).toMatchObject({ ok: true, stopPrice: 98, targetPrice: 104, stopBasis: 'plan', targetBasis: 'plan' });
  });
  it.each([[99], [100], [100.5]])('distance ⇒ keeps its distance from the fill (fill %s)', (fill) => {
    const r = rebaseLevels({ ...base, fill, spec: { stop: { form: 'distance' }, target: { form: 'distance' } } });
    if (!r.ok) throw new Error(r.reason);
    expect(r.stopPrice).toBeCloseTo(fill - 2, 12);
    expect(r.targetPrice).toBeCloseTo(fill + 4, 12);
    expect(r.stopBasis).toBe('fill_rebased');
  });
  it('proportional ⇒ scales with the fill', () => {
    const r = rebaseLevels({ ...base, fill: 99, spec: { stop: { form: 'proportional' } } });
    if (!r.ok) throw new Error(r.reason);
    expect(r.stopPrice).toBeCloseTo(98 * 0.99, 12);
    expect(r.targetPrice).toBe(104);
  });
  it('anchor stop × r_multiple target (the observable pairing): R kept against the CARRIED stop', () => {
    const r = rebaseLevels({ ...base, fill: 99, spec: { stop: { form: 'anchor' }, target: { form: 'r_multiple', r: 2 } } });
    if (!r.ok) throw new Error(r.reason);
    expect(r.stopPrice).toBe(98);
    expect(r.targetPrice).toBeCloseTo(99 + 2 * (99 - 98), 12); // 101, not the plan's 104
  });
  it('distance stop × r_multiple target: the target follows the re-based stop', () => {
    const r = rebaseLevels({ ...base, fill: 99, spec: { stop: { form: 'distance' }, target: { form: 'r_multiple', r: 2 } } });
    if (!r.ok) throw new Error(r.reason);
    expect(r.stopPrice).toBeCloseTo(97, 12);
    expect(r.targetPrice).toBeCloseTo(99 + 2 * 2, 12);
  });
});

describe('#1250 BLOCKER-6 — a mixed leg is re-applied whole', () => {
  // pivot_shift shape: max(anchorLow, entry − 1.5·ATR); plan: anchor 97.5, distance 98 ⇒ distance wins (98).
  const pivot: LevelSpec = { stop: { op: 'max', terms: [{ spec: { form: 'anchor' }, value: 97.5 }, { spec: { form: 'distance' }, value: 98 }] } };
  it('the winner flips on a cheaper fill: the anchor holds the stop, never wider than the construction allows', () => {
    const r = rebaseLevels({ ...base, fill: 99, spec: pivot });
    if (!r.ok) throw new Error(r.reason);
    expect(r.stopPrice).toBe(97.5); // winner-only would give 97 — wider than max() ever chooses
  });
  it('no flip on a small move: the distance term still wins and moves 1:1', () => {
    const r = rebaseLevels({ ...base, fill: 99.8, spec: pivot });
    if (!r.ok) throw new Error(r.reason);
    expect(r.stopPrice).toBeCloseTo(97.8, 12);
  });
  // vwap_pullback default target shape: max(anchorTarget, entry + R·risk); plan: anchor 103, 2R 104 ⇒ 2R wins.
  const vwapT: LevelSpec = { target: { op: 'max', terms: [{ spec: { form: 'anchor' }, value: 103 }, { spec: { form: 'r_multiple', r: 2 }, value: 104 }] } };
  it('a target winner flip: the anchor target holds when 2R falls below it', () => {
    const r = rebaseLevels({ ...base, fill: 99, spec: vwapT });
    if (!r.ok) throw new Error(r.reason);
    expect(r.targetPrice).toBe(103); // 2R would be 99 + 2·1 = 101
  });
});

describe('#1250 BLOCKER-7 — self-consistency at the arriving plan, one tick', () => {
  it('a stamp that does not reproduce the plan keeps the plan and reports the leg', () => {
    const r = rebaseLevels({ ...base, fill: 99, spec: { target: { form: 'r_multiple', r: 3 } } }); // 100 + 3·2 = 106 ≠ 104
    if (!r.ok) throw new Error(r.reason);
    expect(r.targetPrice).toBe(104);
    expect(r.targetBasis).toBe('plan');
    expect(r.inconsistent).toEqual(['target']);
  });
  it('a stamp within one tick of the rounded plan is accepted', () => {
    const r = rebaseLevels({ ...base, planTarget: 104.01, tick: 0.01, fill: 99, spec: { target: { form: 'r_multiple', r: 2 } } });
    if (!r.ok) throw new Error(r.reason);
    expect(r.targetBasis).toBe('fill_rebased');
    expect(r.inconsistent).toEqual([]);
  });
  it('a mixed stamp whose terms do not reproduce the plan is refused per leg', () => {
    const r = rebaseLevels({ ...base, fill: 99, spec: { stop: { op: 'max', terms: [{ spec: { form: 'anchor' }, value: 96 }, { spec: { form: 'distance' }, value: 97 }] } } });
    if (!r.ok) throw new Error(r.reason);
    expect(r.stopBasis).toBe('plan');
    expect(r.inconsistent).toEqual(['stop']);
  });
});

describe('#1250 C-2 + F-G-1 — rounding by role, the cap toward entry', () => {
  it('a re-based stop rounds AWAY from entry and a floor target AWAY', () => {
    const r = rebaseLevels({ planEntry: 100, planStop: 98, planTarget: 104, tick: 0.05, fill: 99.03, spec: { stop: { form: 'distance' }, target: { form: 'distance' } } });
    if (!r.ok) throw new Error(r.reason);
    expect(r.stopPrice).toBeCloseTo(97.0, 9);   // 97.03 → down
    expect(r.targetPrice).toBeCloseTo(103.05, 9); // 103.03 → up
  });
  it('a CAP target rounds TOWARD entry', () => {
    const r = rebaseLevels({ planEntry: 100, planStop: 98, planTarget: 104, tick: 0.05, fill: 99.03, spec: { target: { form: 'distance' }, targetIsCap: true } });
    if (!r.ok) throw new Error(r.reason);
    expect(r.targetPrice).toBeCloseTo(103.0, 9); // 103.03 → down
  });
  it('an anchor leg is never re-rounded (it arrived on the grid already)', () => {
    const r = rebaseLevels({ planEntry: 100, planStop: 98.02, planTarget: 104, tick: 0.05, fill: 99, spec: { stop: { form: 'anchor' } } });
    if (!r.ok) throw new Error(r.reason);
    expect(r.stopPrice).toBe(98.02);
  });
});

describe('#1250 — refusals', () => {
  it('a fill at or through an anchor stop is refused, never re-based into a non-long', () => {
    expect(rebaseLevels({ ...base, fill: 97.9, spec: { stop: { form: 'anchor' } } })).toEqual({ ok: false, reason: 'rebased_not_long' });
  });
  it('invalid inputs and a non-long plan are refused', () => {
    expect(rebaseLevels({ ...base, fill: NaN, spec: {} })).toEqual({ ok: false, reason: 'invalid_inputs' });
    expect(rebaseLevels({ planEntry: 100, planStop: 101, planTarget: 104, tick: null, fill: 99, spec: {} })).toEqual({ ok: false, reason: 'plan_not_long' });
  });
  it('a malformed stamp is ignored (anchor), never trusted', () => {
    expect(isWellFormedLegSpec({ form: 'r_multiple' })).toBe(false);
    expect(isWellFormedLegSpec({ op: 'max', terms: [{ spec: { form: 'anchor' }, value: 1 }] })).toBe(false);
    const r = rebaseLevels({ ...base, fill: 99, spec: { stop: { form: 'bogus' } as never } });
    expect(r).toMatchObject({ ok: true, stopPrice: 98, stopBasis: 'plan' });
  });
});
