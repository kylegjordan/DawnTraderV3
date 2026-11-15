/**
 * B-PRICE-SIDE-BY-JOB `#1250` P1 — `rebaseLevels`, per form, per side of the plan, the mixed re-application (BLOCKER-6),
 * the self-consistency at the arriving plan (BLOCKER-7), rounding with the cap bit (C-2), and the refusals.
 */
import { describe, it, expect } from 'vitest';
import { rebaseLevels, isWellFormedLegSpec, resolveTargetIsCap, type LevelSpec } from '../../core/trading/level-rebase.js';
import { roundPriceForRole } from '../../core/calculations/venue-price-grid.js';

const base = { planEntry: 100, planStop: 98, planTarget: 104, tick: null as number | null, planTick: null as number | null, planStorageQuantum: null as number | null };
// Step 9 §13 D1: a single-form r_multiple carries the operands the strategy multiplied (here the plan's own 100 / 98).
const R2 = { form: 'r_multiple' as const, r: 2, builtEntry: 100, builtStop: 98 };

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
    expect(r.stopBasis).toBe(fill === 100 ? 'plan' : 'fill_rebased'); // CHANGE-2: a fill AT plan moves nothing
  });
  it('proportional ⇒ scales with the fill', () => {
    const r = rebaseLevels({ ...base, fill: 99, spec: { stop: { form: 'proportional' } } });
    if (!r.ok) throw new Error(r.reason);
    expect(r.stopPrice).toBeCloseTo(98 * 0.99, 12);
    expect(r.targetPrice).toBe(104);
  });
  it('anchor stop × r_multiple target (the observable pairing): R kept against the CARRIED stop', () => {
    const r = rebaseLevels({ ...base, fill: 99, spec: { stop: { form: 'anchor' }, target: R2 } });
    if (!r.ok) throw new Error(r.reason);
    expect(r.stopPrice).toBe(98);
    expect(r.targetPrice).toBeCloseTo(99 + 2 * (99 - 98), 12); // 101, not the plan's 104
  });
  it('distance stop × r_multiple target: the target follows the re-based stop', () => {
    const r = rebaseLevels({ ...base, fill: 99, spec: { stop: { form: 'distance' }, target: R2 } });
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

describe('#1250 Step-4 CHANGE-2 — the basis names what happened to the VALUE', () => {
  it('a mixed leg whose anchor term wins at both the plan and the fill reads plan, not fill_rebased', () => {
    // volatility_edge shape: min(anchor 104, distance 104.5) ⇒ 104 at the plan; a cheaper fill lowers the distance term to 103.9 …
    const spec: LevelSpec = { target: { op: 'min', terms: [{ spec: { form: 'anchor' }, value: 104 }, { spec: { form: 'distance' }, value: 104.5 }] } };
    const below = rebaseLevels({ ...base, fill: 99.4, spec });
    if (!below.ok) throw new Error(below.reason);
    expect(below.targetPrice).toBeCloseTo(103.9, 12);
    expect(below.targetBasis).toBe('fill_rebased');
    // … but an ABOVE-plan fill raises it to 104.6 and the anchor wins at both prices: the value did not move
    const above = rebaseLevels({ ...base, fill: 100.1, spec });
    if (!above.ok) throw new Error(above.reason);
    expect(above.targetPrice).toBe(104);
    expect(above.targetBasis).toBe('plan');
  });
});

describe('#1250 Step 9 §13 D3 — self-consistency is EXACT on the birth grid (the one-tick tolerance is retired)', () => {
  it('a stamp that does not reproduce the plan keeps the plan and reports the leg', () => {
    const r = rebaseLevels({ ...base, fill: 99, spec: { target: { ...R2, r: 3 } } }); // 100 + 2·3 = 106 ≠ 104
    if (!r.ok) throw new Error(r.reason);
    expect(r.targetPrice).toBe(104);
    expect(r.targetBasis).toBe('plan');
    expect(r.inconsistent).toEqual(['target']);
  });
  it('MUTATION CONTROL (Langston): a leg BUILT at r = 2.1 and stamped r = 2 fails — on the birth grid and unrounded', () => {
    const built = 100 + (100 - 98) * 2.1; // 104.2
    for (const planTick of [0.0001, 0.01, null]) {
      const arriving = planTick === null ? built : roundPriceForRole(built, planTick, 'target', true);
      const r = rebaseLevels({ ...base, planTick, planTarget: arriving, fill: 99, spec: { target: R2 } });
      if (!r.ok) throw new Error(r.reason);
      expect(r.inconsistent, `planTick ${planTick}`).toEqual(['target']);
    }
  });
  it('THE SBET REPLAY: operands that round to 6.1322 / 5.9793 / 6.4382 on 0.0001 are consistent and re-based', () => {
    // Raw construction rounded by role (entry nearest, stop DOWN, target UP). The old check re-derived the target from the
    // ROUNDED pair and missed by 2 ticks; rebuilt from the stamped raw pair it is exact.
    const builtEntry = 6.13224, builtStop = 5.979308225, r = 2;
    const raw = builtEntry + (builtEntry - builtStop) * r;
    const pe = roundPriceForRole(builtEntry, 0.0001, 'entry', true);
    const ps = roundPriceForRole(builtStop, 0.0001, 'stop', true);
    const pt = roundPriceForRole(raw, 0.0001, 'target', true);
    expect(pe).toBeCloseTo(6.1322, 12);
    expect(ps).toBeCloseTo(5.9793, 12);
    expect(pt).toBeCloseTo(6.4382, 12);
    expect(Math.abs((pe + (pe - ps) * r) - pt)).toBeGreaterThan(0.00015); // the old reconstruction misses by > 1 tick
    const res = rebaseLevels({ planEntry: pe, planStop: ps, planTarget: pt, fill: 6.12, tick: 0.0001, planTick: 0.0001, planStorageQuantum: 1e-8,
      spec: { stop: { form: 'anchor' }, target: { form: 'r_multiple', r, builtEntry, builtStop } } });
    if (!res.ok) throw new Error(res.reason);
    expect(res.inconsistent).toEqual([]);
    expect(res.targetBasis).toBe('fill_rebased');
    expect(res.targetPrice).toBeCloseTo(roundPriceForRole(6.12 + (6.12 - ps) * r, 0.0001, 'target', true), 12); // R = 2 on the CARRIED stop
  });
  it('TICK DRIFT (Langston finding 4): born on 0.0001, filled when the map says 0.01 — the check uses the BIRTH grid, the output the fill grid', () => {
    const spec: LevelSpec = { target: { form: 'r_multiple', r: 2, builtEntry: 100.00003, builtStop: 98.00001 } };
    const pt = roundPriceForRole(100.00003 + (100.00003 - 98.00001) * 2, 0.0001, 'target', true);
    const r = rebaseLevels({ ...base, planTarget: pt, planTick: 0.0001, tick: 0.01, fill: 99, spec });
    if (!r.ok) throw new Error(r.reason);
    expect(r.inconsistent).toEqual([]);
    expect(r.targetPrice).toBeCloseTo(Math.round(r.targetPrice * 100) / 100, 9); // on the 0.01 grid
    // graded on the fill grid instead, the same plan reads as inconsistent — the defect this closes
    const wrong = rebaseLevels({ ...base, planTarget: pt, planTick: 0.01, tick: 0.01, fill: 99, spec });
    if (!wrong.ok) throw new Error(wrong.reason);
    expect(wrong.inconsistent).toEqual(['target']);
  });
  it('DIRECTION: a built target just above a tick rounds UP and passes; the same stamp one tick off fails', () => {
    const spec: LevelSpec = { target: { form: 'r_multiple', r: 2, builtEntry: 100, builtStop: 97.999985 } }; // built 104.00003 (0.3 tick above)
    const pt = roundPriceForRole(100 + (100 - 97.999985) * 2, 0.0001, 'target', true);
    expect(pt).toBeCloseTo(104.0001, 9);
    const ok = rebaseLevels({ ...base, planTarget: pt, planTick: 0.0001, fill: 99, spec });
    const off = rebaseLevels({ ...base, planTarget: pt - 0.0001, planTick: 0.0001, fill: 99, spec });
    if (!ok.ok || !off.ok) throw new Error('refused');
    expect(ok.inconsistent).toEqual([]);
    expect(off.inconsistent).toEqual(['target']);
  });
  it('§13.1 C-2: a value defined as itself is compared structurally, never re-rounded on the birth grid', () => {
    // an off-grid distance target (104.00004) arriving with planTick 0.0001 must NOT be re-rounded into a false miss
    const r = rebaseLevels({ ...base, planTarget: 104.00004, planTick: 0.0001, fill: 99, spec: { target: { form: 'distance' } } });
    if (!r.ok) throw new Error(r.reason);
    expect(r.inconsistent).toEqual([]);
    expect(r.targetBasis).toBe('fill_rebased');
  });
  it('a mixed stamp whose terms do not reproduce the plan is refused per leg', () => {
    const r = rebaseLevels({ ...base, fill: 99, spec: { stop: { op: 'max', terms: [{ spec: { form: 'anchor' }, value: 96 }, { spec: { form: 'distance' }, value: 97 }] } } });
    if (!r.ok) throw new Error(r.reason);
    expect(r.stopBasis).toBe('plan');
    expect(r.inconsistent).toEqual(['stop']);
  });
  it('a mixed leg reproduces EXACTLY on the birth grid (the rounded max of its stamped terms)', () => {
    const spec: LevelSpec = { target: { op: 'max', terms: [{ spec: { form: 'anchor' }, value: 103.00004 }, { spec: { form: 'r_multiple', r: 2 }, value: 104.00007 }] } };
    const pt = roundPriceForRole(104.00007, 0.0001, 'target', true); // 104.0001
    const r = rebaseLevels({ ...base, planTarget: pt, planTick: 0.0001, fill: 99, spec });
    if (!r.ok) throw new Error(r.reason);
    expect(r.inconsistent).toEqual([]);
  });
});

describe('#1250 Step 9 §13.1 C-1 — ONE cap derivation, at birth and at the re-base', () => {
  it('a stamp decides by its own bit; no stamp falls back to volatility_edge; null reads as present, not a cap', () => {
    expect(resolveTargetIsCap({ targetIsCap: true }, 'anything')).toBe(true);
    expect(resolveTargetIsCap({}, 'volatility_edge')).toBe(false);
    expect(resolveTargetIsCap(undefined, 'volatility_edge')).toBe(true);
    expect(resolveTargetIsCap(undefined, 'vwap_bounce')).toBe(false);
    expect(resolveTargetIsCap(null, 'volatility_edge')).toBe(false);
  });
  it('the check uses the SAME cap bit as birth: a cap target rounded toward entry reproduces; graded as a floor it misses by one tick', () => {
    const terms: [{ spec: { form: 'anchor' }; value: number }, { spec: { form: 'distance' }; value: number }] =
      [{ spec: { form: 'anchor' }, value: 104.00007 }, { spec: { form: 'distance' }, value: 104.5 }];
    const ptCap = roundPriceForRole(104.00007, 0.0001, 'target', true, true); // DOWN → 104.0000
    const r = rebaseLevels({ ...base, planTarget: ptCap, planTick: 0.0001, fill: 99.4, spec: { target: { op: 'min', terms }, targetIsCap: true } });
    if (!r.ok) throw new Error(r.reason);
    expect(r.inconsistent).toEqual([]);
    const lost = rebaseLevels({ ...base, planTarget: ptCap, planTick: 0.0001, fill: 99.4, spec: { target: { op: 'min', terms } } });
    if (!lost.ok) throw new Error(lost.reason);
    expect(lost.inconsistent).toEqual(['target']);
  });
});

describe('#1250 Step 9 §13.1 C-5 — a malformed leg is VISIBLE, not a silent anchor', () => {
  it('an old-shape single-form r_multiple (no operands) is malformed: nothing moves, and the leg is named', () => {
    const r = rebaseLevels({ ...base, fill: 99, spec: { stop: { form: 'anchor' }, target: { form: 'r_multiple', r: 2 } } });
    if (!r.ok) throw new Error(r.reason);
    expect(r).toMatchObject({ targetPrice: 104, targetBasis: 'plan', inconsistent: [], malformed: ['target'] });
  });
  it('a well-formed stamp reports no malformed legs; an absent leg is not malformed', () => {
    const r = rebaseLevels({ ...base, fill: 99, spec: { target: R2 } });
    if (!r.ok) throw new Error(r.reason);
    expect(r.malformed).toEqual([]);
  });
  it('an r_multiple TERM inside a mixed leg needs no operands (it carries its value)', () => {
    expect(isWellFormedLegSpec({ op: 'max', terms: [{ spec: { form: 'anchor' }, value: 103 }, { spec: { form: 'r_multiple', r: 2 }, value: 104 }] })).toBe(true);
    expect(isWellFormedLegSpec({ form: 'r_multiple', r: 2 })).toBe(false);
    expect(isWellFormedLegSpec({ form: 'r_multiple', r: 2, builtEntry: 98, builtStop: 100 })).toBe(false); // not long
  });
});

describe('#1250 Step-4 FINDING-1 (a) — a plan read back from a decimal(20,8) column, unrounded at birth', () => {
  // A sub-$5 xStock passthrough plan (planTick null): built unrounded, stored at 8 dp by the RTB queue, parsed back.
  const builtEntry = 2.13377777, builtStop = 2.0912345678, r = 2;
  const q8 = (v: number) => Number(v.toFixed(8));
  const builtTarget = builtEntry + (builtEntry - builtStop) * r;
  const arriving = { planEntry: q8(builtEntry), planStop: q8(builtStop), planTarget: q8(builtTarget) };
  const spec: LevelSpec = { stop: { form: 'anchor' }, target: { form: 'r_multiple', r, builtEntry, builtStop } };
  it('POSITIVE CONTROL: without the storage quantum the 8-dp residual alone fails the 1e-9-relative slack (the false FAIL)', () => {
    expect(Math.abs(builtTarget - arriving.planTarget)).toBeGreaterThan(2.2 * 1e-9);
    const r0 = rebaseLevels({ ...arriving, fill: 2.12, tick: null, planTick: null, planStorageQuantum: null, spec });
    if (!r0.ok) throw new Error(r0.reason);
    expect(r0.inconsistent).toEqual(['target']);
  });
  it('with the active arm 1e-8 storage quantum it is consistent and re-based', () => {
    const r1 = rebaseLevels({ ...arriving, fill: 2.12, tick: null, planTick: null, planStorageQuantum: 1e-8, spec });
    if (!r1.ok) throw new Error(r1.reason);
    expect(r1.inconsistent).toEqual([]);
    expect(r1.targetBasis).toBe('fill_rebased');
  });
  it('the quantum does not blunt the check: a plan two storage units (2e-8) off its stamp fails', () => {
    // Detection floor on this path = half a unit of storage error + half a unit of band + the 1e-9 slack ≈ 1e-8 — one unit
    // can hide inside it; two cannot.
    const r2 = rebaseLevels({ ...arriving, planTarget: arriving.planTarget + 2e-8, fill: 2.12, tick: null, planTick: null, planStorageQuantum: 1e-8, spec });
    if (!r2.ok) throw new Error(r2.reason);
    expect(r2.inconsistent).toEqual(['target']);
  });
  it('on the planTick path the quantum is not read (a grid price survives the column losslessly)', () => {
    const a = rebaseLevels({ ...base, planTarget: 104.2, planTick: 0.01, fill: 99, planStorageQuantum: 1e-8, spec: { target: R2 } });
    const b = rebaseLevels({ ...base, planTarget: 104.2, planTick: 0.01, fill: 99, planStorageQuantum: null, spec: { target: R2 } });
    expect(a).toEqual(b);
  });
});

describe('#1250 Step 9 §13.1 C-3 — the VTS lane and the stamp through the database', () => {
  it('VTS: an unrounded plan passes exact at planTick = null', () => {
    const be = 61.44638499999999, bs = 61.17692071428571;
    const pt = be + (be - bs) * 2;
    const r = rebaseLevels({ planEntry: be, planStop: bs, planTarget: pt, fill: 61.39, tick: null, planTick: null, planStorageQuantum: null,
      spec: { stop: { form: 'anchor' }, target: { form: 'r_multiple', r: 2, builtEntry: be, builtStop: bs } } });
    if (!r.ok) throw new Error(r.reason);
    expect(r.inconsistent).toEqual([]);
    expect(r.targetBasis).toBe('fill_rebased');
  });
  it('gridAtBirth.tick and the stamped operands survive a JSON round-trip byte-for-byte (the exactness depends on it)', () => {
    const meta = { gridAtBirth: { resolved: true, tick: 0.0001 }, levelSpec: { target: { form: 'r_multiple', r: 2, builtEntry: 6.13224, builtStop: 5.979308225 } } };
    const back = JSON.parse(JSON.stringify(meta)) as typeof meta;
    expect(Object.is(back.gridAtBirth.tick, 0.0001)).toBe(true);
    expect(Object.is(back.levelSpec.target.builtEntry, 6.13224)).toBe(true);
    expect(Object.is(back.levelSpec.target.builtStop, 5.979308225)).toBe(true);
  });
});

describe('#1250 C-2 + F-G-1 — rounding by role, the cap toward entry', () => {
  it('a re-based stop rounds AWAY from entry and a floor target AWAY', () => {
    const r = rebaseLevels({ planEntry: 100, planStop: 98, planTarget: 104, tick: 0.05, fill: 99.03, planTick: null, planStorageQuantum: null, spec: { stop: { form: 'distance' }, target: { form: 'distance' } } });
    if (!r.ok) throw new Error(r.reason);
    expect(r.stopPrice).toBeCloseTo(97.0, 9);   // 97.03 → down
    expect(r.targetPrice).toBeCloseTo(103.05, 9); // 103.03 → up
  });
  it('a CAP target rounds TOWARD entry', () => {
    const r = rebaseLevels({ planEntry: 100, planStop: 98, planTarget: 104, tick: 0.05, fill: 99.03, planTick: null, planStorageQuantum: null, spec: { target: { form: 'distance' }, targetIsCap: true } });
    if (!r.ok) throw new Error(r.reason);
    expect(r.targetPrice).toBeCloseTo(103.0, 9); // 103.03 → down
  });
  it('an anchor leg is never re-rounded (it arrived on the grid already)', () => {
    const r = rebaseLevels({ planEntry: 100, planStop: 98.02, planTarget: 104, tick: 0.05, fill: 99, planTick: null, planStorageQuantum: null, spec: { stop: { form: 'anchor' } } });
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
    expect(rebaseLevels({ planEntry: 100, planStop: 101, planTarget: 104, tick: null, planTick: null, planStorageQuantum: null, fill: 99, spec: {} })).toEqual({ ok: false, reason: 'plan_not_long' });
  });
  it('a malformed stamp is ignored (anchor), never trusted', () => {
    expect(isWellFormedLegSpec({ form: 'r_multiple' })).toBe(false);
    expect(isWellFormedLegSpec({ op: 'max', terms: [{ spec: { form: 'anchor' }, value: 1 }] })).toBe(false);
    const r = rebaseLevels({ ...base, fill: 99, spec: { stop: { form: 'bogus' } as never } });
    expect(r).toMatchObject({ ok: true, stopPrice: 98, stopBasis: 'plan' });
  });
});

describe('8c amendment 4 item 3 — entryBasis beside the level basis (one transform, two moments)', () => {
  // birth: plan built on the mid 100; bid 99.9, ask 100.1
  const birth = { planEntry: 100, planStop: 98, planTarget: 104, tick: null as number | null, planTick: null as number | null, planStorageQuantum: null as number | null, fill: 99.9, entryBasis: 100.1 };
  it('an r_multiple target is a ratio over OUR geometry: R holds exactly against the ask (prediction (b))', () => {
    const r = rebaseLevels({ ...birth, spec: { stop: { form: 'anchor' }, target: R2 } });
    if (!r.ok) throw new Error(r.reason);
    expect((r.targetPrice - 100.1) / (100.1 - r.stopPrice)).toBeCloseTo(2, 12);
    expect(r.targetPrice).toBeCloseTo(100.1 + 2 * (100.1 - 98), 12); // not 99.9 + 2·(99.9 − 98)
  });
  it('a distance leg moves onto the level basis (the bid), not the entry', () => {
    const r = rebaseLevels({ ...birth, spec: { stop: { form: 'distance' }, target: { form: 'distance' } } });
    if (!r.ok) throw new Error(r.reason);
    expect(r.stopPrice).toBeCloseTo(98 - 0.1, 12);
    expect(r.targetPrice).toBeCloseTo(104 - 0.1, 12);
  });
  it('the long-ness assertion reads the ENTRY basis: a target inside the spread is refused', () => {
    // a distance target 0.15 above the mid lands at 100.05 on the bid — below the ask 100.1
    const r = rebaseLevels({ ...birth, planTarget: 100.15, spec: { target: { form: 'distance' } } });
    expect(r).toEqual({ ok: false, reason: 'rebased_not_long' });
  });
  it('#1250 is the degenerate case: entryBasis omitted ⇒ the fill', () => {
    const a = rebaseLevels({ ...birth, entryBasis: undefined, spec: { target: R2 } });
    const b = rebaseLevels({ ...birth, entryBasis: birth.fill, spec: { target: R2 } });
    expect(a).toMatchObject({ ok: true, targetBasis: 'fill_rebased' }); // a real re-base, not two equal refusals
    expect(a).toEqual(b);
  });
});
