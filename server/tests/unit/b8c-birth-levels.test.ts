/**
 * Row `8c` (switch-on) — the crypto birth re-base, per stamped form, with condition 1 (no mid fallback) as refusals.
 * Ruling: `B_PRICE_SIDE_BY_JOB_8C_AUDIT_AND_PLAN.md` §9 (amendment 4) items 1-4; §10 prediction (b).
 */
import { describe, it, expect } from 'vitest';
import { baseCryptoLevelsAtBirth, levelGeometryOf } from '../../core/trading/crypto-birth-levels.js';
import type { LevelSpec } from '../../core/trading/level-rebase.js';

const knobs = { maxAgeMs: 60_000, driftRef60s: 0.00429 };
// mid 100, spread 0.2 ⇒ bid 99.9, ask 100.1
const quote = { bid: 99.9, ask: 100.1, basis: 'ticker_bbo', producer: 'rest_poller', ageMs: 15_000 };
const plan = { planEntry: 100, planStop: 98, planTarget: 104 };
const run = (spec: unknown, over: Partial<typeof plan> = {}, q: typeof quote | null = quote) =>
  baseCryptoLevelsAtBirth({ ...plan, ...over, metadata: spec === undefined ? {} : { levelSpec: spec }, quote: q, knobs });

describe('8c birth re-base — the forms', () => {
  it('distance/distance: entry on the ask, maker on the bid, both legs shift by (bid − mid)', () => {
    const r = run({ stop: { form: 'distance' }, target: { form: 'distance' } });
    if (!r.ok) throw new Error(r.reason);
    expect(r.entryPrice).toBe(100.1);
    expect(r.entryPriceMaker).toBe(99.9);
    expect(r.stopPrice).toBeCloseTo(97.9, 12);
    expect(r.targetPrice).toBeCloseTo(103.9, 12);
    expect(r.stamp.levelGeometry).toBe('sided');
    expect(r.stamp.levelBasisAtBirth.stopBasis).toBe('fill_rebased');
    expect(r.alreadySided).toBe(false);
  });
  it('anchor stop stays where the strategy put it (ruling item 1: unchanged under an unmeasured basis)', () => {
    const r = run({ stop: { form: 'anchor' }, target: { form: 'distance' } });
    if (!r.ok) throw new Error(r.reason);
    expect(r.stopPrice).toBe(98);
    expect(r.stamp.levelBasisAtBirth.stopBasis).toBe('plan');
    expect(r.targetPrice).toBeCloseTo(103.9, 12);
  });
  it('proportional scales by bid/mid', () => {
    const r = run({ stop: { form: 'proportional' }, target: { form: 'anchor' } });
    if (!r.ok) throw new Error(r.reason);
    expect(r.stopPrice).toBeCloseTo(98 * 0.999, 12);
    expect(r.targetPrice).toBe(104);
  });
  it('§10 prediction (b): an r_multiple target keeps its R EXACTLY against the ASK (ruling item 2)', () => {
    // plan: entry 100, stop 98, r = 2 ⇒ target 104. Distance stop moves to 97.9; target = ask + 2·(ask − 97.9).
    const r = run({ stop: { form: 'distance' }, target: { form: 'r_multiple', r: 2 } });
    if (!r.ok) throw new Error(r.reason);
    expect(r.targetPrice).toBeCloseTo(100.1 + 2 * (100.1 - 97.9), 12);
    expect((r.targetPrice - r.entryPrice) / (r.entryPrice - r.stopPrice)).toBeCloseTo(2, 12);
    // and NOT against the bid — the item-3 defect would land it sp·(1+r) low
    expect(r.targetPrice).not.toBeCloseTo(99.9 + 2 * (99.9 - 97.9), 6);
  });
  it('a mixed leg re-applies its operator over re-derived terms', () => {
    const spec: LevelSpec = {
      stop: { op: 'max', terms: [{ spec: { form: 'anchor' }, value: 97.95 }, { spec: { form: 'distance' }, value: 98 }] },
      target: { form: 'distance' },
    };
    const r = run(spec);
    if (!r.ok) throw new Error(r.reason);
    expect(r.stopPrice).toBe(97.95); // max(97.95, 97.9) — the anchor wins once the distance term moves onto the bid
  });
  it('stamps the age and the f it implies (§5 ruling)', () => {
    const r = run({ stop: { form: 'distance' }, target: { form: 'distance' } });
    if (!r.ok) throw new Error(r.reason);
    const lb = r.stamp.levelBasisAtBirth;
    expect(lb.ageMs).toBe(15_000);
    expect(lb.stopDistanceFraction).toBeCloseTo((100.1 - 97.9) / 100.1, 12);
    expect(lb.f).toBeCloseTo((0.00429 / lb.stopDistanceFraction) * Math.sqrt(0.25), 12);
    expect(lb.planEntry).toBe(100);
    expect(lb.basis).toBe('ticker_bbo');
  });
});

describe('8c birth re-base — condition 1: every no-side arm REFUSES, none falls back to the mid', () => {
  const ok: LevelSpec = { stop: { form: 'distance' }, target: { form: 'distance' } };
  it('no transactable quote', () => {
    expect(run(ok, {}, null)).toEqual({ ok: false, reason: 'no_transactable_basis' });
    expect(run(ok, {}, { ...quote, bid: 100.2 })).toEqual({ ok: false, reason: 'no_transactable_basis' }); // crossed
    expect(run(ok, {}, { ...quote, bid: NaN })).toEqual({ ok: false, reason: 'no_transactable_basis' });
  });
  it('absent stamp (ruling item 4 — NOT anchor-by-default at birth)', () => {
    expect(run(undefined)).toEqual({ ok: false, reason: 'level_spec_absent' });
  });
  it('malformed stamp: a missing leg, an unknown form, a bad cap bit', () => {
    expect(run({ stop: { form: 'distance' } })).toEqual({ ok: false, reason: 'level_spec_malformed' });
    expect(run({ stop: { form: 'atr' }, target: { form: 'distance' } })).toEqual({ ok: false, reason: 'level_spec_malformed' });
    expect(run({ ...ok, targetIsCap: 'yes' })).toEqual({ ok: false, reason: 'level_spec_malformed' });
    expect(run('distance')).toEqual({ ok: false, reason: 'level_spec_malformed' });
  });
  it('a stamp that does not reproduce the plan is REFUSED, not left on the mid', () => {
    // r = 3 claimed, but the plan target 104 is r = 2
    expect(run({ stop: { form: 'distance' }, target: { form: 'r_multiple', r: 3 } }))
      .toEqual({ ok: false, reason: 'level_spec_inconsistent' });
  });
  it('a target that lands inside the spread is not a long trade (long-ness reads the ASK)', () => {
    // anchor target 100.05: above the mid and the bid, below the ask
    expect(run({ stop: { form: 'distance' }, target: { form: 'anchor' } }, { planTarget: 100.05 }))
      .toEqual({ ok: false, reason: 'rebase_rebased_not_long' });
  });
});

describe('8c birth re-base — idempotent on the sided stamp (the HYBRID re-entry)', () => {
  it('a second pass moves nothing and keeps the first stamp', () => {
    const first = run({ stop: { form: 'distance' }, target: { form: 'distance' } });
    if (!first.ok) throw new Error(first.reason);
    const second = baseCryptoLevelsAtBirth({
      planEntry: first.entryPrice, planStop: first.stopPrice, planTarget: first.targetPrice,
      metadata: { ...first.stamp }, // a hybrid carries levelGeometry + levelBasisAtBirth, NOT necessarily levelSpec
      quote: { ...quote, bid: 99.5, ask: 99.7 }, knobs,
    });
    if (!second.ok) throw new Error(second.reason);
    expect(second.alreadySided).toBe(true);
    expect(second.entryPrice).toBe(first.entryPrice);
    expect(second.stopPrice).toBe(first.stopPrice);
    expect(second.targetPrice).toBe(first.targetPrice);
    expect(second.entryPriceMaker).toBe(99.9); // the bid recorded at the first pass, not the new quote
  });
  it('a sided flag without its basis record is refused, not re-based', () => {
    expect(baseCryptoLevelsAtBirth({ ...plan, metadata: { levelGeometry: 'sided' }, quote, knobs }))
      .toEqual({ ok: false, reason: 'level_geometry_stamp_malformed' });
  });
});

describe('levelGeometryOf — the one reader', () => {
  it("'sided' only on the exact stamp", () => {
    expect(levelGeometryOf({ levelGeometry: 'sided' })).toBe('sided');
    for (const m of [undefined, null, {}, { levelGeometry: 'SIDED' }, { levelGeometry: true }, 'sided', { levelGeometry: 'mid' }]) {
      expect(levelGeometryOf(m)).toBe('mid');
    }
  });
});
