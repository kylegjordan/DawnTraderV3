/**
 * `B-PRICE-SIDE-BY-JOB` row `8a-P4c` increment 3b (plan §C3, rows P7a / P8c / P8d / P9 / P13 / P11 / P7a-dead) — the VTS
 * ENTRY legs move onto the guarded ASK. Each moved seam is pinned where it lives; the selector's behaviour is tested in
 * `b-price-side-8a-p4c-inc3-guard.test.ts`, and the twin's pricing in `b-price-side-8a-p4c-inc3-friction.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { refuseTakerBooking, bookedQuantity } from '../../core/trading/entry-booking.js';
import { planTwin } from '../../core/trading/pending-maker-logic.js';

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf-8').replace(/\r\n/g, '\n');
const VTS = read('server/services/vts-runner.ts');
const XS = read('server/asset_classes/xstock_spot/eval-cycle.ts');
const SCAN = read('server/asset_classes/xstock_spot/scanner.ts');

describe('8a-P4c 3b — P9 (C8): a TAKER entry books the guarded ask; no ask ⇒ refused (both classes)', () => {
  it('crypto: refused without an ask, booked at the ask with it, quantity at the booked price', () => {
    expect(VTS).toMatch(/if \(_vtsEffectiveMode === 'taker' && placementAsk === null\) \{[\s\S]{0,300}setNullReason\('taker_no_entry_ask'\);\s*return null;/);
    expect(VTS).toMatch(/const _vtsBookedEntry = _vtsEffectiveMode === 'taker' \? \(placementAsk as number\) : entryPrice;/);
    expect(VTS).toMatch(/const _vtsBookedQuantityOrNull = bookedQuantity\(dollarValue, _vtsBookedEntry\);/);
    expect(VTS).toMatch(/const _inv = refuseTakerBooking\(_vtsBookedEntry, adjustedStopLoss, adjustedTakeProfit\);/);
    expect(VTS).toMatch(/entryPrice: _vtsBookedEntry,/);
    expect(VTS).toMatch(/quantity: _vtsBookedQuantity,/);
    expect(VTS).toMatch(/entry: _vtsBookedEntry,/);
    // the maker still rests at the LEVEL
    expect(VTS).toMatch(/makerLimitPrice: entryPrice,\s*makerDeadline: Date\.now\(\) \+ resolveMakerMaxPendingMs\(tradeAssetClass\),/);
    // the stamp follows the booking
    expect(VTS).toMatch(/const _vtsEntryPriceBasis = entryPriceBasisFor\(_vtsEffectiveMode, true\);/);
  });

  it('xStock: refused without an ask (counted + archived), booked at the ask with it, quantity at the booked price', () => {
    expect(XS).toMatch(/if \(_xEffectiveMode === 'taker' && _xEntryAsk === null\) \{\s*_xRefuseBooking\('taker_no_entry_ask',[^\n]*\n\s*continue;\s*\}/);
    expect(XS).toMatch(/const _xInv = refuseTakerBooking\(_xBookedEntry, stopLoss, takeProfit\);/);
    expect(XS).toMatch(/gateDecision: \{ gate: 'entry_ask', accepted: false, reason \}/);
    expect(XS).toMatch(/const _xBookedEntry = _xEffectiveMode === 'taker' \? \(_xEntryAsk as number\) : entryPrice;/);
    expect(XS).toMatch(/const _xQty = bookedQuantity\(dollarValue, _xBookedEntry\);/);
    expect(XS).not.toMatch(/: 0; \/\/ at the BOOKED price/); // no zero-size fallback (RIDER-A)
    expect(XS).toMatch(/entryPrice: _xBookedEntry,/);
    expect(XS).toMatch(/const _xEntryPriceBasis = entryPriceBasisFor\(_xEffectiveMode, true\);/);
  });
});

describe('8a-P4c 3b — P7a: the xStock entry quote is the scanner\'s own ticker read, carried to the evaluator', () => {
  it('the scanner keeps bid, ask, last and capture time (sides never defaulted), and passes the quote', () => {
    expect(SCAN).toMatch(/quote: \{\s*last: parseQuoteNumber\(row\.price\) \?\? NaN,\s*bid: parseQuoteNumber\(row\.bid\),\s*ask: parseQuoteNumber\(row\.ask\),\s*atMs: Number\.isFinite\(capturedMs\) \? capturedMs : null,\s*\}/);
    expect(SCAN).toMatch(/enrich\?\.quote \?\? null,/);
    expect(XS).toMatch(/entryQuote: XsQuoteRow \| null = null,\s*\): Promise<void> \{/);
  });
});

describe('8a-P4c 3b — P8d (X5): a resting xStock buy fills on the guarded ask', () => {
  it('the pending resolve reads the entry selector for xStock (crypto keeps its own touch)', () => {
    expect(VTS).toMatch(/_pFillPrice = selectVtsXstockEntryAsk\(trade\.symbol, _pxRow, trade\.stopLoss \?\? null, now\)\.ask;/);
    expect(VTS).toMatch(/_xsVtsInstrument\.recordPendingLook\(_pxRow, _pLimit\);/); // the S1 comparison survives
  });
});

describe('8a-P4c 3b — the twin: the maker twin rests at the LEVEL; a taker twin books the ask', () => {
  it('both call sites pass the level separately from the booked price, and maybeOpenTwin uses it as the limit', () => {
    expect((VTS.match(/levelPrice: entryPrice,/g) ?? []).length).toBe(1); // crypto
    expect((XS.match(/levelPrice: entryPrice,/g) ?? []).length).toBe(1);  // xStock
    expect(VTS).toMatch(/const entryPrice = input\.levelPrice; \/\/ the maker twin's limit is the LEVEL/);
    expect(VTS).toMatch(/const _twinQty = bookedQuantity\(chosenTrade\.dollarValue, plan\.overlay\.entryPrice\);/);
    expect(VTS).toMatch(/\.\.\.plan\.overlay,\s*quantity: _twinQty,/); // ALWAYS recomputed, never inherited
  });
});

describe('8a-P4c 3b — P13 (X6): the crypto generate path refuses a non-crypto symbol loudly', () => {
  it('a non-crypto class is refused at function entry, before any pricing', () => {
    const fn = VTS.slice(VTS.indexOf('async function generatePhase10Signal('));
    const guard = fn.indexOf("if (_assetClass !== 'crypto_spot') {");
    expect(guard).toBeGreaterThan(0);
    expect(guard).toBeLessThan(fn.indexOf('placementAsk'));
    expect(fn).toMatch(/\[8a-P4c\]\[P13\]\[VTS_GENERATE_NON_CRYPTO_REFUSED\]/);
    // the placement ask is crypto's touch only — no mark fallback branch left
    expect(fn).not.toMatch(/: currentMarketPrice;\s*if \(_vtsMtDecision\.chosenMode === 'maker'\)/);
  });
});

describe('8a-P4c 3b — P11 + P7a-dead', () => {
  it('the no-ask policy is stated as SETTLED at both lanes\' placement sites (no "homed at 8a-P4" left)', () => {
    const AEE = read('server/services/active-execution-engine.ts');
    for (const src of [VTS, AEE]) {
      expect(src).toMatch(/The policy for both lanes is SETTLED \(`8a-P4c` 3b, P11\)/);
      expect(src).not.toMatch(/homed at `8a-P4`\./);
    }
    expect(XS).toMatch(/\[8a-P4c\]\[VTS\]\[MAKER_RESTED\].*ask=\$\{_xEntryAsk \?\? 'none'\}/);
  });
  it('data-freshness.ts is deleted and archived (zero production importers; it wrote only its own cache)', () => {
    expect(existsSync(join(process.cwd(), 'server/utils/data-freshness.ts'))).toBe(false);
    expect(existsSync(join(process.cwd(), '1-system-manual/_archive/deleted-code/data-freshness.20260930-8a-P4c.ts.removed'))).toBe(true);
    for (const src of [SCAN, XS, VTS]) expect(src).not.toMatch(/from '[^']*data-freshness(\.js)?'|isPairDataFresh\(/); // no import, no call
  });
});

// Langston 3b r1 — BLOCKER-1 (the maker twin's own entry), FINDING-1 (no inverted taker booking), RIDER-A (one quantity rule).
describe('8a-P4c 3b r1 fixes — by behaviour', () => {
  const base = {
    twinEnabled: true, limitPrice: 100, feeRateMaker: 0.004, feeRateTaker: 0.008, makerMaxPendingMs: () => 60_000,
    nowMs: 1_000, chosenSlippage: 0.0005, chosenSpread: 0.001,
  };
  it('BLOCKER-1: a MAKER twin of a taker chosen leg records its OWN limit as entryPrice — not the chosen leg\'s ask', () => {
    const plan = planTwin({ ...base, pendingMaker: false, decisionChosenMode: 'taker', placementTransactablePrice: 101 });
    expect(plan.kind).toBe('open');
    if (plan.kind !== 'open') return;
    expect(plan.twinMode).toBe('maker');
    expect(plan.overlay.entryPrice).toBe(100);         // the level
    expect(plan.overlay.makerLimitPrice).toBe(100);    // limit == entry on a maker row again
  });
  it('a TAKER twin records the ask', () => {
    const plan = planTwin({ ...base, pendingMaker: true, decisionChosenMode: 'maker', placementTransactablePrice: 101 });
    if (plan.kind !== 'open') throw new Error('expected open');
    expect(plan.overlay.entryPrice).toBe(101);
  });
  it('FINDING-1: a taker ask at/through the target or at/through the stop is refused; strictly between passes', () => {
    expect(refuseTakerBooking(105, 95, 105)).toBe('ask_at_or_through_target');
    expect(refuseTakerBooking(106, 95, 105)).toBe('ask_at_or_through_target');
    expect(refuseTakerBooking(95, 95, 105)).toBe('ask_at_or_through_stop');
    expect(refuseTakerBooking(94, 95, 105)).toBe('ask_at_or_through_stop');
    expect(refuseTakerBooking(100.5, 95, 105)).toBeNull();
  });
  it('RIDER-A: one quantity rule — dollars at the booked price, null (refused) when the price cannot size', () => {
    expect(bookedQuantity(150, 100)).toBe(1.5);
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, null, undefined]) expect(bookedQuantity(150, bad as never)).toBeNull();
    expect(bookedQuantity(0, 100)).toBeNull();
  });
});
