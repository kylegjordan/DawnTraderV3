/**
 * B-XSTOCK-BID-TRIGGER-RELAND increment C (row 2, objective 7) — THE VENUE-TRANSITION PAUSE.
 * Plan: `Claude Comms and Packages/Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_INCC_PRE_AUDIT.md` r3 (Langston PROCEED, C5 satisfied).
 * C-P1 the predicate (DST-aware, every edge minute); C-P2..C-P4 fences on the four call sites, each paired with a
 * control fixture that the fence must catch.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isXstockVenueTransitionPause } from '../../asset_classes/xstock_spot/market-hours';

const at = (iso: string) => isXstockVenueTransitionPause(new Date(iso));

describe('C-P1 — the predicate, Eastern time, EDT', () => {
  // 2026-10-12 is a Monday; EDT = UTC-4.
  it('16:15 window: 16:13 no · 16:14 yes · 16:34 yes · 16:35 no', () => {
    expect(at('2026-10-12T20:13:59Z').paused).toBe(false);
    expect(at('2026-10-12T20:14:00Z')).toEqual({ paused: true, window: '16:15' });
    expect(at('2026-10-12T20:34:59Z')).toEqual({ paused: true, window: '16:15' });
    expect(at('2026-10-12T20:35:00Z').paused).toBe(false);
  });
  it('20:15 window Mon-Thu: 20:13 no · 20:14 yes · 20:34 yes · 20:35 no (Monday evening = Tuesday 00:xxZ)', () => {
    expect(at('2026-10-13T00:13:59Z').paused).toBe(false);
    expect(at('2026-10-13T00:14:00Z')).toEqual({ paused: true, window: '20:15' });
    expect(at('2026-10-13T00:34:59Z')).toEqual({ paused: true, window: '20:15' });
    expect(at('2026-10-13T00:35:00Z').paused).toBe(false);
  });
  it('Friday: the 16:15 window applies, and there is NO 20:15 window (the weekend close wins)', () => {
    expect(at('2026-10-16T20:20:00Z')).toEqual({ paused: true, window: '16:15' }); // Fri 16:20 ET
    expect(at('2026-10-17T00:20:00Z').paused).toBe(false);                         // Fri 20:20 ET
  });
  it('Saturday never; Sunday only the reopen window 20:00-20:34 ET', () => {
    expect(at('2026-10-17T20:20:00Z').paused).toBe(false); // Sat 16:20 ET
    expect(at('2026-10-18T20:20:00Z').paused).toBe(false); // Sun 16:20 ET — still the weekend close
    expect(at('2026-10-18T23:59:59Z').paused).toBe(false); // Sun 19:59 ET
    expect(at('2026-10-19T00:00:00Z')).toEqual({ paused: true, window: 'sun_reopen' }); // Sun 20:00 ET
    expect(at('2026-10-19T00:13:00Z')).toEqual({ paused: true, window: 'sun_reopen' });
    expect(at('2026-10-19T00:34:59Z')).toEqual({ paused: true, window: 'sun_reopen' });
    expect(at('2026-10-19T00:35:00Z').paused).toBe(false);
  });
  it('an ordinary minute is not paused', () => {
    expect(at('2026-10-12T15:00:00Z').paused).toBe(false); // Mon 11:00 ET
  });
});

describe('C-P1 — across the 2026-11-01 DST change (EST = UTC-5): the windows move with Eastern time, not UTC', () => {
  it('Sunday 2026-11-01 reopen is at 01:00Z on 11-02 under EST, not 00:00Z', () => {
    expect(at('2026-11-02T00:00:00Z').paused).toBe(false);                               // Sun 19:00 EST — weekend close
    expect(at('2026-11-02T01:00:00Z')).toEqual({ paused: true, window: 'sun_reopen' });  // Sun 20:00 EST
  });
  it('Monday 2026-11-02 16:15 window is at 21:14Z under EST; 20:14Z is no longer paused', () => {
    expect(at('2026-11-02T20:14:00Z').paused).toBe(false);
    expect(at('2026-11-02T21:14:00Z')).toEqual({ paused: true, window: '16:15' });
  });
  it('Monday 2026-11-02 20:15 window is at 01:14Z on 11-03 under EST', () => {
    expect(at('2026-11-03T00:14:00Z').paused).toBe(false);
    expect(at('2026-11-03T01:14:00Z')).toEqual({ paused: true, window: '20:15' });
  });
});

const SRC = (rel: string) => readFileSync(join(__dirname, '..', '..', ...rel.split('/')), 'utf8').split(String.fromCharCode(13)).join('');

describe('C-P2 — the paper exit pause: after the book-state block, before the exit decision, never a price-skip', () => {
  const AEE = SRC('services/active-execution-engine.ts');
  const pauseAt = AEE.indexOf("const _vp = isXstockVenueTransitionPause(new Date());\n          const _pend");
  const evalAt = AEE.indexOf('const exitCondition = await this.checkExitConditions(');
  const advanceAt = AEE.indexOf('advanceBookStateComparator(\n');
  it('CONTROL: all three anchors exist', () => {
    expect(pauseAt).toBeGreaterThan(0); expect(evalAt).toBeGreaterThan(0); expect(advanceAt).toBeGreaterThan(0);
  });
  it('the pause sits after the book-state advance and before the exit decision', () => {
    expect(pauseAt).toBeGreaterThan(advanceAt);
    expect(pauseAt).toBeLessThan(evalAt);
  });
  it('the paused branch never calls _recordPriceSkip and never addAlert', () => {
    const branch = AEE.slice(pauseAt, AEE.indexOf('continue;', pauseAt));
    expect(branch).not.toMatch(/_recordPriceSkip\s*\(/);
    expect(branch).not.toMatch(/addAlert\s*\(/);
  });
  it('CONTROL: a fixture that records a price skip in the branch is caught', () => {
    const f = "const _vp = isXstockVenueTransitionPause(new Date()); await this._recordPriceSkip(position, 'x'); continue;";
    expect(f.slice(0, f.indexOf('continue;'))).toMatch(/_recordPriceSkip\s*\(/);
  });
});

describe('C-P3 — the paper entry refusal precedes the depth read', () => {
  const AEE = SRC('services/active-execution-engine.ts');
  const gate = AEE.indexOf('private async _evaluateOpenDepthGate(');
  const refuse = AEE.indexOf('venue_transition_pause ${_vp.window}`, snapshot: null', gate);
  const depth = AEE.indexOf('const snapshot = await getDepthSnapshot(symbol, assetClass);', gate);
  it('the refusal exists inside the gate and comes before getDepthSnapshot', () => {
    expect(gate).toBeGreaterThan(0); expect(refuse).toBeGreaterThan(gate); expect(depth).toBeGreaterThan(refuse);
  });
});

describe('C-P4 — the VTS: both lanes skip before any look; both opens refuse', () => {
  const VTS = SRC('services/vts-runner.ts');
  it('real lane: the skip sits before the xStock exit selector', () => {
    const skip = VTS.indexOf("_vtsVenuePauseNow(now) !== null) { _vtsVenuePause.realSkips++; continue; }");
    const sel = VTS.indexOf('selectVtsXstockExitBid(trade.symbol', skip);
    expect(skip).toBeGreaterThan(0); expect(sel).toBeGreaterThan(skip);
  });
  it('shadow lane: the skip sits beside the weekend skip', () => {
    const wk = VTS.indexOf("if (trade.assetClass === 'xstock_spot' && isInXstockWeekendClose(new Date(now))) continue;");
    const skip = VTS.indexOf('_vtsVenuePause.shadowSkips++; continue;');
    expect(wk).toBeGreaterThan(0); expect(skip).toBeGreaterThan(wk); expect(skip - wk).toBeLessThan(400);
  });
  it('both registration functions refuse an xStock open during the pause', () => {
    const reg = VTS.indexOf('export async function registerOpenVtsTrade(');
    expect(VTS.indexOf('_vtsVenuePause.opensRefused++;', reg)).toBeGreaterThan(reg);
    const sreg = VTS.indexOf('export async function registerOpenShadowTrade(');
    expect(VTS.indexOf('_vtsVenuePause.shadowOpensRefused++;', sreg)).toBeGreaterThan(sreg);
  });
  it('the VTS pause never feeds the no-decision streak and never alerts', () => {
    const fn = VTS.slice(VTS.indexOf('function _vtsVenuePauseNow('), VTS.indexOf('export function getVtsVenuePauseCounters('));
    expect(fn).not.toMatch(/addAlert\s*\(|noDecision|_vtsNoDecision/);
  });
});
