/**
 * B-ENTRY-GATE (`#1224`) increment A — the worse-side entry window and the cheaper-side record at the taker fill.
 * Scope, pre-audit and plan: `Claude Comms and Packages/Scope Files/B_ENTRY_GATE_{SCOPE,PRE_AUDIT}.md` (P1, P1b).
 *
 * Kyle KD-10 (2026-11-04): refuse a fill more than `w` × the planned risk ABOVE the planned entry; never refuse a fill
 * below it, record it against the floor `m` instead. The decisions are driven through the real functions; the engine
 * wiring is proved at the source (the engine needs its whole graph to run, as in `b-entry-distance-guard.test.ts`).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { entryWindowRefusal, entryWindowRefusalAt, cheaperSideRecord } from '../../core/trading/entry-window';
import { entryFillShadow } from '../../core/trading/entry-booking';
import { rtbMetricsService } from '../../services/rtb-metrics-service';

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

// planned entry 100, stop 96 ⇒ planned risk 4; window 0.25 ⇒ the edge is a fill of 101.
const adverse = (fill: number) => entryFillShadow({ fill, intended: 100, stop: 96, target: 108, floor: null }).adverseR;

describe('P1 — the worse-side window (KD-10)', () => {
  it('a fill exactly at the edge (+25 % of the planned risk) passes', () => {
    expect(entryWindowRefusal(adverse(101), 0.25)).toBeNull();
  });
  it('one tick above the edge refuses', () => {
    expect(entryWindowRefusal(adverse(101.01), 0.25)).toBe('entry_window');
  });
  it('any fill below the planned entry is never refused by the window', () => {
    for (const fill of [99.99, 99, 98, 96.5]) expect(entryWindowRefusal(adverse(fill), 0.25)).toBeNull();
  });
  it('no valid planned risk (adverseR null) is not a window refusal', () => {
    expect(entryWindowRefusal(null, 0.25)).toBeNull();
  });
  it('a bad window setting throws rather than guessing', () => {
    expect(() => entryWindowRefusal(0.1, Number.NaN)).toThrow();
    expect(() => entryWindowRefusal(0.1, -0.1)).toThrow();
  });
});

describe('P1b — the cheaper-side record (WATCH-ONLY)', () => {
  it('a fill below plan records remaining risk = 1 + adverseR', () => {
    const r = cheaperSideRecord(adverse(98), 0.40); // adverseR −0.5 ⇒ remaining 0.5
    expect(r.remainingRiskFrac).toBeCloseTo(0.5, 12);
    expect(r.belowFloor).toBe(false);
  });
  it('at the floor ± 1e-6', () => {
    expect(cheaperSideRecord(-0.6 + 1e-6, 0.40).belowFloor).toBe(false); // remaining 0.400001
    expect(cheaperSideRecord(-0.6 - 1e-6, 0.40).belowFloor).toBe(true);  // remaining 0.399999
  });
  it('a fill at or above plan carries nulls (the floor does not apply)', () => {
    expect(cheaperSideRecord(0, 0.40)).toEqual({ remainingRiskFrac: null, belowFloor: null });
    expect(cheaperSideRecord(0.2, 0.40)).toEqual({ remainingRiskFrac: null, belowFloor: null });
    expect(cheaperSideRecord(null, 0.40)).toEqual({ remainingRiskFrac: null, belowFloor: null });
  });
});

describe('the wiring, proved at the source', () => {
  const src = stripComments(readFileSync(new URL('../../services/active-execution-engine.ts', import.meta.url), 'utf8'));
  it('reads both thresholds from the entry_gate module, per class, with the required reader', () => {
    expect(src).toMatch(/getCachedNumberRequired\('entry_gate', 'entry_window_worse_side_frac', _ewKey\)/);
    expect(src).toMatch(/getCachedNumberRequired\('entry_gate', 'entry_cheaper_side_floor_frac', _ewKey\)/);
    expect(src).toMatch(/const _ewKey = \{ exchange: '\*', assetClass: _openClass, strategy: '\*', regime: '\*' \}/);
  });
  it('judges the shadow\'s own adverseR; refuses after the geometry refusal and before the position is written', () => {
    const shadow = src.indexOf('const _shadow = entryFillShadow(');
    const judged = src.indexOf('entryWindowRefusal(_shadow.adverseR, _ewWorseSide)');
    const geom = src.indexOf("stage: 'ENTRY_GEOMETRY'");
    const refuse = src.indexOf("stage: 'ENTRY_WINDOW'");
    const write = src.indexOf('const positionValue = actualEntryPrice * quantity');
    expect(shadow).toBeGreaterThan(0);
    expect(judged).toBeGreaterThan(shadow);
    expect(refuse).toBeGreaterThan(geom);
    expect(write).toBeGreaterThan(refuse);
  });
  it('the window fields ride the ONE _entryShadowRec assignment, so both archive arms carry them', () => {
    expect(src.split('_entryShadowRec = {').length - 1).toBe(1);
    expect(src).toMatch(/_entryShadowRec = \{[\s\S]{0,2500}entryWindowRefused: _ewRefusal !== null/);
  });
  it('a refusal returns ENTRY_WINDOW and archives an entry_fill row; the cheaper side never returns', () => {
    expect(src).toMatch(/return \{ opened: false, stage: 'ENTRY_WINDOW', reason: _ewRefusal \}/);
    expect(src).toMatch(/rejectStage: 'entry_fill'[\s\S]{0,200}reason: _ewRefusal/);
    expect(src).not.toMatch(/belowFloor[^\n]*return \{ opened: false/);
  });
  it('no literal window or floor value in the engine', () => {
    const seg = src.slice(src.indexOf('const _ewKey'), src.indexOf("stage: 'ENTRY_WINDOW'"));
    expect(seg).not.toMatch(/0\.25|0\.4\b|0\.40/);
  });
});

describe('P3 — the resting maker: would-cancel is RECORDED, never acted on (pre-audit A-5)', () => {
  const src = stripComments(readFileSync(new URL('../../services/active-execution-engine.ts', import.meta.url), 'utf8'));
  const start = src.indexOf('private async _processPendingMaker(');
  const body = src.slice(start, src.indexOf('private _reportMakerWouldCancel(', start));
  it('reads the same per-class window setting, spot classes only, buy side only', () => {
    expect(body).toMatch(/if \(side === 'buy' && \(_isCryptoPending \|\| _isXstockPending\) && fillPrice !== null\)/);
    expect(body).toMatch(/getCachedNumberRequired\('entry_gate', 'entry_window_worse_side_frac'/);
  });
  it('the record never feeds a cancel, a drop or the fill decision', () => {
    const seg = body.slice(body.indexOf('_mwcStop'), body.indexOf('const _quoteArrivedAtMs'));
    expect(seg).toContain('this._makerWouldCancel.set(');
    expect(seg).not.toMatch(/_dropUnfilledMaker|return|evaluatePendingMaker/);
    expect(body).not.toMatch(/_makerWouldCancel\.get\([^)]*\)[^;]*\?[^;]*drop/);
  });
  it('the record is reported when the rest resolves, on BOTH outcomes', () => {
    expect(body).toMatch(/this\._reportMakerWouldCancel\(position, 'fill'\)/);
    expect(src).toMatch(/this\._reportMakerWouldCancel\?\.\(position, 'drop'\)/);
  });
});

describe('P3v — the VTS applies the same window at its taker entries (no SQE or queue on that lane)', () => {
  it('entryWindowRefusalAt matches entryFillShadow.adverseR at the edges', () => {
    expect(entryWindowRefusalAt(101, 100, 96, 0.25)).toBeNull();          // exactly +25 %
    expect(entryWindowRefusalAt(101.01, 100, 96, 0.25)).toBe('entry_window');
    expect(entryWindowRefusalAt(90, 100, 96, 0.25)).toBeNull();           // below plan: never the window
    expect(entryWindowRefusalAt(101, 100, 100, 0.25)).toBeNull();         // no planned risk: not a window refusal
  });
  const vts = stripComments(readFileSync(new URL('../../services/vts-runner.ts', import.meta.url), 'utf8'));
  const xs = stripComments(readFileSync(new URL('../../asset_classes/xstock_spot/eval-cycle.ts', import.meta.url), 'utf8'));
  it('crypto VTS entry, the taker twin, and the xStock VTS entry each read the per-class setting and refuse', () => {
    expect(vts).toMatch(/entryWindowRefusalAt\(_vtsBookedEntry, entryPrice, adjustedStopLoss, _ewW\)/);
    expect(vts).toMatch(/entryWindowRefusalAt\(plan\.overlay\.entryPrice, entryPrice, chosenTrade\.stopLoss, _twW\)/);
    expect(xs).toMatch(/entryWindowRefusalAt\(_xBookedEntry, entryPrice, stopLoss, _xEwW\)/);
    for (const src of [vts, xs]) expect(src).toMatch(/getCachedNumberRequired\('entry_gate', 'entry_window_worse_side_frac'/);
  });
  it('each VTS window check sits after the geometry refusal at the same site', () => {
    expect(vts.indexOf('entryWindowRefusalAt(_vtsBookedEntry')).toBeGreaterThan(vts.indexOf('refuseTakerBooking(_vtsBookedEntry'));
    expect(vts.indexOf('entryWindowRefusalAt(plan.overlay.entryPrice')).toBeGreaterThan(vts.indexOf('refuseTakerBooking(plan.overlay.entryPrice'));
    expect(xs.indexOf('entryWindowRefusalAt(_xBookedEntry')).toBeGreaterThan(xs.indexOf('refuseTakerBooking(_xBookedEntry'));
  });
});

describe('P5 — the three 2 % target fallbacks are gone (Kyle decision 7)', () => {
  const rtb = stripComments(readFileSync(new URL('../../core/rtb/ready_to_buy_service.ts', import.meta.url), 'utf8'));
  const eng = stripComments(readFileSync(new URL('../../services/active-execution-engine.ts', import.meta.url), 'utf8'));
  it('no `entry × 1.02` target is fabricated in the ranker, the shadow pool or the promoted open', () => {
    expect(rtb).not.toMatch(/\* 1\.02/);
    expect(eng).not.toMatch(/\* 1\.02/);
  });
  it('the ranker ranks a target-less plan last, the shadow pool skips it, the promoted open refuses it', () => {
    expect(rtb).toMatch(/if \(p\.target == null \|\| !Number\.isFinite\(p\.target\)\) return \{ r: -Infinity, pwinFloored: false \}/);
    expect(rtb).toMatch(/const targetPrice = num\(s\.targetPrice\);\s*if \(targetPrice === null\) continue;/);
    expect(eng).toMatch(/if \(!Number\.isFinite\(targetPrice\) \|\| targetPrice <= 0\) \{[\s\S]{0,300}return \{ success: false, error: 'invalid_target' \}/);
  });
});

describe('the stage is counted, so attempts still reconcile (P19-B6.5e)', () => {
  it('ENTRY_WINDOW is a recorded open-fail stage', () => {
    const before = rtbMetricsService.getStats().openFailedByStage.ENTRY_WINDOW ?? 0;
    rtbMetricsService.recordOpenFailed('TEST/USD', 'vwap_pullback', 'ENTRY_WINDOW', 'entry_window');
    expect(rtbMetricsService.getStats().openFailedByStage.ENTRY_WINDOW).toBe(before + 1);
  });
});
