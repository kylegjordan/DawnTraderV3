/**
 * B-ENTRY-DISTANCE-GUARD — sprint row 59 increment 1 (pre-sprint P1a). Scope, pre-audit and plan:
 * `Claude Comms and Packages/Scope Files/B_ENTRY_DISTANCE_GUARD_{SCOPE,PRE_AUDIT}.md`.
 *
 * OBJ-1 (LIVE): the active engine's taker open refuses a fill at or through the signal's own stop or target, through the
 * shared `refuseTakerBooking` the VTS and the xStock booking already use. The replays are real W1 opens (staging, read
 * 2026-10-10 22:30Z): every one of them opened and was dead or spent at once.
 * OBJ-2 (SHADOW): reward-to-risk at the fill against the live floor, logged, never refused (pre-registered rule, §1.2).
 *
 * `executeSimulatedTrade` needs the whole engine to run, so — as `b-sizing-inc2c-risk-retired.test.ts` does — its wiring is
 * proved at the source (placement and order), and the decisions are driven through the real functions.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { refuseTakerBooking, entryFillShadow } from '../../core/trading/entry-booking';
import { rtbMetricsService } from '../../services/rtb-metrics-service';

// [symbol, strategy, intended, fill, stop, target, how it closed] — W1 xStock taker opens (pre-audit §1.1).
const BELOW_STOP: Array<[string, string, number, number, number, number, string]> = [
  ['STZ/USD', 'pivot_shift', 115.5454, 114.76, 114.92, 117.5458, 'stop_hit'],
  ['CEG/USD', 'sma_trend_ride', 307.8344, 301.0, 301.2963, 320.9107, 'stop_hit'],
  ['INTC/USD', 'morning_star', 114.3843, 112.84, 113.4785, 116.1948, 'stop_hit'],
  ['CRCL/USD', 'morning_star', 84.6446, 82.56, 83.7878, 86.1145, 'stop_hit'],
];
const ABOVE_TARGET: Array<[string, string, number, number, number, number, string]> = [
  ['ANET/USD', 'vwap_pullback', 210.361, 218.45, 207.8788, 215.3254, 'target_hit'],
  ['BBY/USD', 'pivot_shift', 86.6866, 88.93, 85.9451, 88.1695, 'target_hit'],
];

describe('OBJ-1 — the replays: each W1 open the guard exists for is refused with the primitive\'s reason', () => {
  it.each(BELOW_STOP)('%s (%s) filled at or below its stop ⇒ ask_at_or_through_stop', (_s, _st, _i, fill, stop, target) => {
    expect(refuseTakerBooking(fill, stop, target)).toBe('ask_at_or_through_stop');
  });
  it.each(ABOVE_TARGET)('%s (%s) filled at or above its target ⇒ ask_at_or_through_target', (_s, _st, _i, fill, stop, target) => {
    expect(refuseTakerBooking(fill, stop, target)).toBe('ask_at_or_through_target');
  });
  it('a fill strictly between the stop and the target passes', () => {
    expect(refuseTakerBooking(115.0, 114.92, 117.5458)).toBeNull();
  });
});

describe('OBJ-2 — the shadow line: reward-to-risk at the fill, never a refusal', () => {
  it('the knife edge (RR 2.0 by construction, floor 1.95): an adverse fill of 0.02 R would refuse', () => {
    // planned entry 100, stop 99 (R = 1), target 102 ⇒ RR 2.0; fill 100.02 ⇒ (102 − 100.02)/(100.02 − 99) = 1.941…
    const s = entryFillShadow({ fill: 100.02, intended: 100, stop: 99, target: 102, floor: 1.95 });
    expect(s.wouldRefuse).toBe(true);
    expect(s.rrFill).toBeCloseTo(1.9412, 4);
    expect(s.adverseR).toBeCloseTo(0.02, 10);
  });
  it('the same trade filled at its plan clears the floor', () => {
    const s = entryFillShadow({ fill: 100, intended: 100, stop: 99, target: 102, floor: 1.95 });
    expect(s.wouldRefuse).toBe(false);
    expect(s.rrFill).toBeCloseTo(2, 10);
    expect(s.adverseR).toBe(0);
  });
  it('a floor that could not be read gives would_refuse = null, never a guess', () => {
    expect(entryFillShadow({ fill: 100, intended: 100, stop: 99, target: 102, floor: null }).wouldRefuse).toBeNull();
  });
  it('a fill at or below the stop has no RR (OBJ-1 refuses it first)', () => {
    const s = entryFillShadow({ fill: 98.9, intended: 100, stop: 99, target: 102, floor: 1.95 });
    expect(s.rrFill).toBeNull();
    expect(s.wouldRefuse).toBeNull();
  });
  it('xStock morning_star (floor 1.0) — the population OBJ-1 catches and OBJ-2 does not: its INTC replay clears 1.0 at plan', () => {
    const [, , intended, , stop, target] = BELOW_STOP[2];
    expect(entryFillShadow({ fill: intended, intended, stop, target, floor: 1.0 }).wouldRefuse).toBe(false);
  });
});

describe('the wiring, proved at the source (the engine needs its whole graph to run)', () => {
  const src = readFileSync(new URL('../../services/active-execution-engine.ts', import.meta.url), 'utf8');
  const at = (needle: string) => { const i = src.indexOf(needle); expect(i, needle).toBeGreaterThan(-1); return i; };
  it('the taker branch calls the SHARED primitive on the booked fill, records ENTRY_GEOMETRY and returns before any write', () => {
    const call = at('const _geom = refuseTakerBooking(actualEntryPrice, signal.stopPrice, signal.targetPrice);');
    const fill = at('actualEntryPrice = _openFill.fillPrice;');
    const record = at("rtbMetricsService.recordOpenFailed(signal.symbol, signal.strategy, 'ENTRY_GEOMETRY', _geom);");
    const ret = at("return { opened: false, stage: 'ENTRY_GEOMETRY', reason: _geom };");
    const firstWrite = at('storage.createClosedTrade(');
    expect(fill).toBeLessThan(call);
    expect(call).toBeLessThan(record);
    expect(record).toBeLessThan(ret);
    expect(ret).toBeLessThan(firstWrite);
    expect(src.match(/function refuseTakerBooking|const refuseTakerBooking/g)).toBeNull(); // no local copy
  });
  it('the floor is read BEFORE the fill, inside a catch (Langston Step-1 FINDING-1: a throw past the fill is an uncounted exit)', () => {
    const floor = at('try { _entryFloor = getPerClassTargetGate(_openClass, signal.strategy).minRR; }');
    const fill = at('const _openFill = await this.orderPlacer.openOrder({');
    expect(floor).toBeLessThan(fill);
    expect(src).toContain('catch (floorErr) { _entryFloorNote =');
  });
  it('the shadow line is written for every taker open, before the refusal decision', () => {
    expect(at('[ENTRY_GEOMETRY][SHADOW]')).toBeLessThan(at('const _geom = refuseTakerBooking('));
  });
  it('an archive failure on a refusal is logged loudly, never read as "no refusal"', () => {
    expect(src).toContain('[ENTRY_GEOMETRY][ARCHIVE_FAILED]');
    expect(src).toContain("gate: 'entry_fill', accepted: false");
  });
});

describe('the stage is counted, so attempts still reconcile (P19-B6.5e)', () => {
  it('ENTRY_GEOMETRY is a zero-initialised stage and a refusal increments it', () => {
    rtbMetricsService.reset();
    expect(rtbMetricsService.getStats().openFailedByStage.ENTRY_GEOMETRY).toBe(0);
    rtbMetricsService.recordOpenFailed('STZ/USD', 'pivot_shift', 'ENTRY_GEOMETRY', 'ask_at_or_through_stop');
    const s = rtbMetricsService.getStats();
    expect(s.openFailedByStage.ENTRY_GEOMETRY).toBe(1);
    expect(s.openFailedTotal).toBe(1);
  });
});
