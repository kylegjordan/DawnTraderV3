/**
 * #1250 P8 — the wiring, proved at the source (the engine needs its whole graph to run): argument provenance per call
 * site (Langston BLOCKER-2 — an ORDER fence would pass a swapped argument), the gate, the refusal order, the stamps, and
 * the flip fixtures for the three mixed legs `b1250-level-rebase.test.ts` does not already cover (C-1).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { rebaseLevels, type LevelSpec } from '../../core/trading/level-rebase.js';
import { entryWindowRefusal } from '../../core/trading/entry-window.js';
import { validateStopDistance } from '../../strategies/strategy-helpers.js';

const ROOT = join(__dirname, '..', '..', '..');
const src = (f: string) => readFileSync(join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
const E = src('server/services/active-execution-engine.ts');
const at = (s: string) => { const i = E.indexOf(s); expect(i, s).toBeGreaterThan(-1); return i; };

describe('#1250 — argument provenance, per call site', () => {
  it('the plan-judging gates read the PLAN', () => {
    expect(E).toContain('entryFillShadow({ fill: actualEntryPrice, intended: signal.entryPrice, stop: signal.stopPrice, target: signal.targetPrice, floor: _entryFloor });');
    expect(E).toContain('const _geom = refuseTakerBooking(actualEntryPrice, signal.stopPrice, signal.targetPrice);');
  });
  it('the fill economics read the CARRIED levels; the plan-geometry EV is recorded beside it', () => {
    expect(E).toContain("computeFillEconomics({ ..._feInputs, arm: 'taker', fillPrice: actualEntryPrice, stopPrice: _carriedStop, targetPrice: _carriedTarget })");
    expect(E).toContain("computeFillEconomics({ ..._feInputs, arm: 'taker', fillPrice: actualEntryPrice }) : null;");
    expect(E).toContain('netEvAtFillPlanGeometry: _feTPlan.netEvAtFill');
  });
  it('both durable writes, the audit and the admitted archive read the CARRIED levels', () => {
    expect((E.match(/stopLoss: _carriedStop\.toString\(\), \/\/ #1250/g) ?? []).length).toBe(2);
    expect(E).toContain("decision: 'OPENED',\n        entryPrice: actualEntryPrice.toString(),\n        stopPrice: _carriedStop.toString(),");
    expect(E).toContain('riskAmount: (quantity * Math.abs(actualEntryPrice - _carriedStop)).toFixed(2)');
    expect(E).toContain('entryPrice: actualEntryPrice, stopPrice: _carriedStop, targetPrice: _carriedTarget, ...(_levelRec ?? {}),');
    expect((E.match(/takeProfit: _carriedTarget\.toString\(\),/g) ?? []).length).toBe(2);
    expect(E).toContain('stop:${_carriedStop.toFixed(2)}, target:${_carriedTarget.toFixed(2)}}');
    // mutation guard: no durable write takes the plan stop directly any more
    expect(E).not.toMatch(/^\s*stopLoss: signal\.stopPrice\.toString\(\),\s*$/m);
  });
  it('Step-4 CHANGE-1: NOTHING past the economics refusal reads the plan levels (the absence, not just the conversions)', () => {
    const from = at('if (_feT.refuse && !_fillExplo) {');
    const end = E.indexOf('\n  private ', from); // the end of executeSimulatedTrade
    expect(end).toBeGreaterThan(from);
    const tail = E.slice(from, end);
    expect(tail.match(/signal\.(stopPrice|targetPrice)/g) ?? []).toEqual([]);
  });
  it('signal.* is never assigned (the plan stays the plan)', () => {
    expect(E).not.toMatch(/signal\.(stopPrice|targetPrice)\s*=[^=]/);
  });
});

describe('#1250 — the gate is the blast radius', () => {
  it('the re-base runs only on the xStock taker arm', () => {
    const rb = at('const _rb = rebaseLevels(');
    const gate = E.lastIndexOf("if (_openClass === 'xstock_spot') {", rb);
    expect(gate).toBeGreaterThan(-1);
    expect(rb - gate).toBeLessThan(400);
    // and it sits inside the taker branch: after the maker branch opens, after the taker fill is known
    expect(rb).toBeGreaterThan(at('actualEntryPrice = _openFill.fillPrice;'));
    expect(rb).toBeGreaterThan(at('if (_b72cPendingMaker) {'));
  });
  it('the carried levels start as the plan, so every other path writes the plan', () => {
    expect(E).toContain('let _carriedStop: number = signal.stopPrice;');
    expect(E).toContain('let _carriedTarget: number = signal.targetPrice;');
  });
  it('the floor at the fill is xStock-only and reads the CARRIED stop', () => {
    expect(E).toContain("_openClass === 'xstock_spot' && !validateStopDistance(actualEntryPrice, _carriedStop)");
  });
});

describe('#1250 P3 — ENTRY_WINDOW wins a doubly-refusable row', () => {
  it('the floor and the re-base refusal sit AFTER the window return and BEFORE the economics refusal', () => {
    const win = at("return { opened: false, stage: 'ENTRY_WINDOW', reason: _ewRefusal };");
    const floor = at("_levelRefusal = { stage: 'STOP_DISTANCE_AT_FILL', reason: 'stop_distance_at_fill' };");
    const econ = at('if (_feT.refuse && !_fillExplo) {');
    expect(floor).toBeGreaterThan(win);
    expect(econ).toBeGreaterThan(floor);
  });
  it('a doubly-refusable input exists: an above-plan fill past the window over a distance stop near the floor', () => {
    // plan 100 with a DISTANCE stop 0.305 % below it (passes the plan floor). A fill 1.8 % above plan keeps the distance but
    // lowers its fraction of the fill to 0.2996 % — under the floor — and is far past a 0.25 R window: BOTH would refuse.
    const plan = 100, stop = 99.695, fill = 101.8;
    expect(validateStopDistance(plan, stop)).toBe(true);
    const r = rebaseLevels({ planEntry: plan, planStop: stop, planTarget: 105, fill, spec: { stop: { form: 'distance' } }, tick: null });
    if (!r.ok) throw new Error(r.reason);
    expect(validateStopDistance(fill, r.stopPrice)).toBe(false);
    expect(entryWindowRefusal((fill - plan) / (plan - stop), 0.25)).not.toBeNull();
    // ⇒ the engine reports ENTRY_WINDOW for it: the window returns first (asserted by the source order above).
  });
});

describe('#1250 C-1 — flip fixtures for the remaining mixed legs', () => {
  const base = { planEntry: 100, planStop: 98, planTarget: 104, tick: null as number | null };
  it('adaptive_flow: min(anchor, distance) stop — the min is re-applied, never wider than either term', () => {
    // plan: anchor 97.6, distance 98.0 ⇒ min = 97.6 (anchor). An ABOVE-plan fill raises the distance term but min holds the anchor.
    const spec: LevelSpec = { stop: { op: 'min', terms: [{ spec: { form: 'anchor' }, value: 97.6 }, { spec: { form: 'distance' }, value: 98 }] } };
    const r = rebaseLevels({ ...base, planStop: 97.6, fill: 101, spec });
    if (!r.ok) throw new Error(r.reason);
    expect(r.stopPrice).toBe(97.6);
    // a deep below-plan fill: the distance term falls under the anchor ⇒ the min now takes it
    const r2 = rebaseLevels({ ...base, planStop: 97.6, fill: 99.2, spec });
    if (!r2.ok) throw new Error(r2.reason);
    expect(r2.stopPrice).toBeCloseTo(97.2, 12);
  });
  it('abcd_long: min(distance, R) target', () => {
    const spec: LevelSpec = { target: { op: 'min', terms: [{ spec: { form: 'distance' }, value: 104 }, { spec: { form: 'r_multiple', r: 3 }, value: 106 }] } };
    const r = rebaseLevels({ ...base, fill: 99, spec });
    if (!r.ok) throw new Error(r.reason);
    expect(r.targetPrice).toBeCloseTo(Math.min(103, 99 + 3 * (99 - 98)), 12); // min(103, 102) = 102 — the winner flipped
  });
  it('volatility_edge: min(anchor, distance) CAP target, rounded TOWARD entry', () => {
    const spec: LevelSpec = { target: { op: 'min', terms: [{ spec: { form: 'anchor' }, value: 103.5 }, { spec: { form: 'distance' }, value: 104 }] }, targetIsCap: true };
    const r = rebaseLevels({ planEntry: 100, planStop: 98, planTarget: 103.5, tick: 0.05, fill: 99.03, spec });
    if (!r.ok) throw new Error(r.reason);
    expect(r.targetPrice).toBeCloseTo(103.0, 9); // min(103.5, 103.03) = 103.03 → cap rounds DOWN to 103.00
  });
});

describe('#1250 P0 — the stamp survives every hop, strategy → eval cycle → dispatch → RTB → open', () => {
  it('each hop carries it', () => {
    const evalCycle = src('server/asset_classes/xstock_spot/eval-cycle.ts');
    const dispatch = src('server/asset_classes/xstock_spot/active-dispatch.ts');
    const rtb = src('server/core/rtb/ready_to_buy_service.ts');
    expect(evalCycle).toContain('levelSpec: (strategySignal.metadata as { levelSpec?: unknown } | undefined)?.levelSpec, // #1250 P0');
    expect(dispatch).toContain('...(input.levelSpec !== undefined ? { levelSpec: input.levelSpec } : {}),');
    expect(rtb).toContain('...(input.metadata || {}),'); // the queue keeps every metadata key it is given
    expect(E).toContain('(signal.metadata as { levelSpec?: LevelSpec } | undefined)?.levelSpec');
  });
  it('the orchestrator rounds a cap by the STAMPED bit, the name only for an unstamped signal (C-2)', () => {
    const orch = src('server/services/signal-orchestrator.ts');
    expect(orch).toContain("const _isCap = _stampSpec !== undefined ? _stampSpec.targetIsCap === true : strategyId === ('volatility_edge' as StrategyType);");
  });
});
