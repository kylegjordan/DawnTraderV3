/**
 * B-ENTRY-GATE (`#1224`) increment B, P6 — the queue re-prices the plan at the live ask (pre-audit A-4, scope OBJ-6).
 * `repriceAtAsk` is driven through the real kernel and the real fill-policy function; the refresh wiring is proved at the
 * source (the refresh needs its whole graph to run).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { repriceAtAsk, computeFillEconomics, type FillEconInputs } from '../../core/trading/fill-economics';

const haircut = {
  makerFillProbability: 0.5, adverseSelectionBase: 0.001, adverseSelectionStrengthMult: 0, nonFillCostBase: 0.002,
  nonFillContinuationPenalty: 0, nonFillReversalDiscount: 0, hardFloorContinuationStrength: 2,
};
// plan: entry 100, stop 96, target 108; window 0.25 ⇒ the edge is an ask of 101.
const inputs: FillEconInputs = {
  stopPrice: 96, targetPrice: 108,
  costs: { fee: 0.004, slippage: 0.0005, spread: 0.001 } as any, feeRateMaker: 0.002, feeRateTaker: 0.004,
  DI: 20, sourcePool: undefined, dbsScore: undefined, minPWin: 0.40, maxPWin: 0.60, diPWinFactor: 200,
  signalStrength: 0.3, urgencyClass: 'neutral', haircut, measuredBasePWin: 0.317,
  frictionCoverageK: 0, levelGeometry: 'mid',
};
const at = (ask: number, policy: 'maker_only' | 'maker_preferred', over: Partial<FillEconInputs> = {}) =>
  repriceAtAsk({ inputs: { ...inputs, ...over }, planEntry: 100, planEntryMaker: 100, ask, worseSideFrac: 0.25, policy });

describe('P6 — the taker arm is the open\'s own test at today\'s ask', () => {
  it('takerNetEvAtAsk equals the fill test at that price (same composition as at the open)', () => {
    expect(at(100.5, 'maker_preferred').takerNetEvAtAsk).toBeCloseTo(computeFillEconomics({ ...inputs, arm: 'taker', fillPrice: 100.5 }).netEvAtFill, 12);
  });
  it('an ask above the window strikes the taker arm before the policy; at the edge it does not', () => {
    expect(at(101, 'maker_preferred').windowRefused).toBe(false);
    expect(at(101.01, 'maker_preferred').windowRefused).toBe(true);
  });
  it('the ask moves the taker EV and never the maker EV (the maker rests at the plan)', () => {
    const a = at(99, 'maker_preferred'); const b = at(100.9, 'maker_preferred');
    expect(a.makerNetEVAdjusted).toBe(b.makerNetEVAdjusted);
    expect(a.takerNetEvAtAsk).toBeGreaterThan(b.takerNetEvAtAsk);
  });
});

describe('P6 — the class policy decides, as at birth', () => {
  it('maker_only never chooses the taker, whatever the ask', () => {
    for (const ask of [98, 100, 100.9]) {
      const r = at(ask, 'maker_only');
      expect(r.chosenMode === null || r.chosenMode === 'maker').toBe(true);
    }
  });
  it('maker_preferred falls to the taker when the maker is not admissible and the ask is inside the window', () => {
    // a near-certain non-fill makes the maker inadmissible; DI 20 keeps the taker positive at 100.2
    const r = at(100.2, 'maker_preferred', { haircut: { ...haircut, makerFillProbability: 0.0001, nonFillCostBase: 0.05 } });
    expect(r.admitted).toBe(true);
    expect(r.chosenMode).toBe('taker');
    expect(r.chosenNetEV).toBeCloseTo(r.takerNetEvAtAsk, 12);
  });
  it('the same plan with the ask above the window is NOT admitted, and its EV is never positive', () => {
    const r = at(101.5, 'maker_preferred', { haircut: { ...haircut, makerFillProbability: 0.0001, nonFillCostBase: 0.05 } });
    expect(r.admitted).toBe(false);
    expect(r.windowRefused).toBe(true);
    expect(r.chosenNetEV).toBeLessThanOrEqual(0);
  });
  it('a refusal can never carry a positive EV downstream (the SQE sign check is the delete)', () => {
    for (const ask of [96.5, 100, 103]) for (const p of ['maker_only', 'maker_preferred'] as const) {
      const r = at(ask, p, { DI: -400 });
      if (!r.admitted) expect(!(r.chosenNetEV > 0)).toBe(true);
    }
  });
  it('bad prices throw rather than guess', () => {
    expect(() => at(Number.NaN, 'maker_only')).toThrow(/ask/);
    expect(() => repriceAtAsk({ inputs: { ...inputs, targetPrice: Number.NaN }, planEntry: 100, planEntryMaker: 100, ask: 100, worseSideFrac: 0.25, policy: 'maker_only' })).toThrow(/targetPrice/);
  });
});

describe('P6 rebased onto row 8c — the maker arm prices the triple it is given', () => {
  it('a sided triple is priced at its recorded maker entry with sided friction, not as mid at the plan', () => {
    const mid = repriceAtAsk({ inputs, planEntry: 100, planEntryMaker: 100, ask: 100, worseSideFrac: 0.25, policy: 'maker_preferred' });
    const sided = repriceAtAsk({ inputs: { ...inputs, levelGeometry: 'sided' }, planEntry: 100, planEntryMaker: 99.95, ask: 100, worseSideFrac: 0.25, policy: 'maker_preferred' });
    expect(sided.makerNetEVAdjusted).not.toBe(mid.makerNetEVAdjusted);
  });
  it('Langston N-1: with the geometry held sided, the maker entry alone moves the maker EV (the callee reads planEntryMaker)', () => {
    const sidedAt = (makerEntry: number) => repriceAtAsk({ inputs: { ...inputs, levelGeometry: 'sided' }, planEntry: 100, planEntryMaker: makerEntry, ask: 100, worseSideFrac: 0.25, policy: 'maker_preferred' });
    expect(sidedAt(99.95).makerNetEVAdjusted).not.toBe(sidedAt(100).makerNetEVAdjusted);
    expect(sidedAt(99.95).takerNetEvAtAsk).toBe(sidedAt(100).takerNetEvAtAsk); // the taker arm never reads the maker entry
  });
  it('a bad maker entry throws rather than guess', () => {
    expect(() => repriceAtAsk({ inputs, planEntry: 100, planEntryMaker: Number.NaN, ask: 100, worseSideFrac: 0.25, policy: 'maker_only' })).toThrow(/planEntryMaker/);
  });
  it('the refresh reads the maker entry through the one reader; a sided stamp without it is no decision', () => {
    const src = readFileSync('server/core/rtb/ready_to_buy_service.ts', 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(src).toMatch(/const _rpxMaker = makerEntryOf\(signal\.metadata\);\s*if \(_rpxInputs\.levelGeometry === 'sided' && _rpxMaker === null\) throw new Error/);
    expect(src).toMatch(/planEntryMaker: _rpxInputs\.levelGeometry === 'sided' \? _rpxMaker as number : Number\(signal\.entryPrice\),/);
  });
});

describe('P6 — the refresh wiring, proved at the source', () => {
  const src = readFileSync('server/core/rtb/ready_to_buy_service.ts', 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  it('re-prices only with an ask, through the open\'s resolver and the class policy, after the retirement decision', () => {
    const retire = src.indexOf("if (_rp.decision.action === 'retire')");
    const rp = src.indexOf('_rpx = repriceAtAsk({');
    expect(retire).toBeGreaterThan(0);
    expect(rp).toBeGreaterThan(retire);
    const ri = src.indexOf('const _rpxInputs = resolveFillEconInputs(signal as any, sqeAssetClass);');
    expect(ri).toBeGreaterThan(retire);
    expect(rp).toBeGreaterThan(ri);
    expect(src.slice(ri - 120, ri)).toMatch(/if \(_rpAsk\.ok\) \{\s*try \{\s*$/);
    expect(src).toMatch(/inputs: _rpxInputs,/);
    expect(src).toMatch(/policy: resolveFillPolicy\(sqeAssetClass, 'entry'\)/);
  });
  it('the re-price feeds the SQE sign check and, when admitted, the stored snapshot', () => {
    expect(src).toMatch(/chosenNetEv: _rpx \? _rpx\.chosenNetEV : \(_acq\.refreshedMT\?\.chosenNetEV/);
    expect(src).toMatch(/\.\.\.\(_rpx\?\.admitted \? \{\s*chosenEntryMode: _rpx\.chosenMode!/);
  });
  it('a missing setting is no decision, never a value', () => {
    expect(src).toMatch(/catch \(rpxErr\) \{\s*console\.error\(`\[B-ENTRY-GATE\]\[P6\]\[REPRICE_UNRESOLVED/);
  });
});
