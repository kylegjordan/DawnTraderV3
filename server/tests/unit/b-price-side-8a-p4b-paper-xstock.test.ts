/**
 * B-PRICE-SIDE-BY-JOB row `8a-P4b` — PAPER xSTOCK EXITS AND FILLS ON THE TRANSACTABLE SIDE.
 *
 * The evaluator's behaviour on a `triggerPrice` is already fenced by `8a-P1`/`8a-P2` (a bid below a stop fires while
 * the mid sits above it; `null` ⇒ `no_transactable_side`). What `8a-P4b` changes is WHICH price reaches that slot for
 * an xStock position, and which price a resting xStock order fills against. Those are wiring facts inside a
 * multi-thousand-line engine method, so they are fenced at the SOURCE — each assertion names the object it pins and
 * is RED on the pre-`8a-P4b` source (where these patterns do not exist).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { evaluatePendingMaker } from '../../core/trading/pending-maker-logic.js';
import { isDiscontinuityActive, _testClearAllState, _testGetSymbolEntry, _testInjectDividendCalendar } from '../../services/price-discontinuity-detector.js';
import { seedXstockUniverse } from '../helpers/seed-xstock-universe.js';
import { resolveSentinelLane } from '../../services/tec-evaluator.js';

const AEE = readFileSync(join(process.cwd(), 'server/services/active-execution-engine.ts'), 'utf-8').replace(/\r\n/g, '\n');
const count = (re: RegExp) => (AEE.match(re) ?? []).length;

describe('8a-P4b — J1: the sides are captured once, from the frame the guard judged', () => {
  it('xsBid/xsAsk are assigned on exactly two arms: the validated line and the guard-off arm', () => {
    expect(count(/\bxsBid = _raw\.bid;/g)).toBe(1);
    expect(count(/\bxsAsk = _raw\.ask;/g)).toBe(1);
    expect(count(/\bxsBid = _offRaw\.bid;/g)).toBe(1);
    expect(count(/\bxsAsk = _offRaw\.ask;/g)).toBe(1);
    expect(count(/\bxsBid = /g)).toBe(2);
    expect(count(/\bxsAsk = /g)).toBe(2);
  });

  it('no second read of the equity tick was added (a later frame would be unjudged)', () => {
    // The ONE read is the exit loop's; `8a-P4b` must not add another.
    expect(count(/getLatestEquityTick\(/g)).toBe(1);
  });

  it('the validated capture sits AFTER the unvalidated refusal, so only an admitted frame is captured', () => {
    const refuse = AEE.indexOf("'book_state_unvalidated',");
    const capture = AEE.indexOf('xsBid = _raw.bid;');
    expect(refuse).toBeGreaterThan(0);
    expect(capture).toBeGreaterThan(refuse);
  });

  it('the guard-off arm requires a two-sided, positive frame (J2), never the mark', () => {
    expect(AEE).toMatch(/_offRaw\.bid !== null && _offRaw\.ask !== null && _offRaw\.bid > 0 && _offRaw\.ask >= _offRaw\.bid/);
  });
});

describe('8a-P4b — every cell is a three-way with a named default arm (Langston r1 BLOCKER-1)', () => {
  it('X3: the exit check receives xsBid for xStock, the ladder bid for crypto', () => {
    expect(AEE).toMatch(/_posClass === 'xstock_spot' \? xsBid : \(_lsSel !== null && _lsSel\.ok \? _lsSel\.quote\.bid : null\)/);
  });

  it('X3: the evaluator trigger is three-way — crypto and xStock take the slot, any other class the mark', () => {
    expect(AEE).toMatch(/triggerPrice: positionAssetClass === 'crypto_spot' \? triggerBid\s*\n\s*: positionAssetClass === 'xstock_spot' \? triggerBid[^\n]*\n\s*: currentPrice,/);
  });

  it('X2: the resting target fill is three-way — xStock on xsBid, any other class the mark', () => {
    expect(AEE).toMatch(/_restFillPrice: number \| null = _posClass === 'crypto_spot' \? [^\n]*\n\s*: _posClass === 'xstock_spot' \? xsBid\s*\n\s*: currentPrice;/);
  });

  it('X1: a resting xStock entry fills on the judged ASK (a sell on the bid); any other class keeps the mark', () => {
    expect(AEE).toMatch(/const _isXstockPending = position\.assetClass === 'xstock_spot';/);
    expect(AEE).toMatch(/let fillPrice: number \| null = safePrice;\s*\n\s*if \(_isXstockPending\) \{\s*\n\s*fillPrice = side === 'buy' \? xstockSides\.ask : xstockSides\.bid;/);
    expect(AEE).toMatch(/\}, \{ bid: xsBid, ask: xsAsk, basis: xsSideBasis \}\);/);
  });

  it('X1: the xStock fill stamps the ask it filled on and names the rung', () => {
    expect(AEE).toMatch(/\(_isCryptoPending \|\| _isXstockPending\) && fillPrice !== null \? fillPrice : makerFillPrice\(limit\)/);
    expect(AEE).toMatch(/kraken_equities_ws:raw_\$\{side === 'buy' \? 'ask' : 'bid'\}/);
  });
});

describe('8a-P4b — the X1 decision, on the shared pure logic (red on the mark)', () => {
  it('a resting xStock BUY does NOT fill when the mark has reached the limit but the ask has not', () => {
    const limit = 100;
    const mark = 99.95; // mid ≤ limit — the pre-8a-P4b input filled here
    const ask = 100.05; // no seller at the limit yet
    expect(evaluatePendingMaker({ side: 'buy', transactablePrice: mark, limit, nowMs: 1, deadlineMs: null })).toBe('fill');
    expect(evaluatePendingMaker({ side: 'buy', transactablePrice: ask, limit, nowMs: 1, deadlineMs: null })).toBe('rest');
  });

  it('a resting xStock target SELL does NOT fill when the mark has reached the limit but the bid has not', () => {
    const limit = 110;
    expect(evaluatePendingMaker({ side: 'sell', transactablePrice: 110.02, limit, nowMs: 1, deadlineMs: null })).toBe('fill');
    expect(evaluatePendingMaker({ side: 'sell', transactablePrice: 109.97, limit, nowMs: 1, deadlineMs: null })).toBe('rest');
  });

  it('a null side is no fill this tick (the rest persists), never a fallback', () => {
    expect(evaluatePendingMaker({ side: 'buy', transactablePrice: null, limit: 100, nowMs: 1, deadlineMs: null })).toBe('rest');
  });
});

describe('8a-P4b — P5: the 8a-P3 series is not moved; placements are a new line after the insert', () => {
  it('MAKER_RESTED still prints in the placement path, BEFORE the inserts', () => {
    const rested = AEE.indexOf('[8a-P3][MAKER_RESTED:');
    const placed = AEE.indexOf('[8a-P4b][MAKER_PLACED:');
    const opened = AEE.indexOf('return { opened: true, tradeId: trade.id };');
    expect(rested).toBeGreaterThan(0);
    expect(placed).toBeGreaterThan(rested);
    expect(opened).toBeGreaterThan(placed);
    expect(count(/\[8a-P3\]\[MAKER_RESTED:/g)).toBe(1);
  });
});

describe('8a-P4b — CONDITION-4: the refusal counter is split additively, not duplicated', () => {
  it('the totals stay, and the per-class breakdown prints each leg with its denominator', () => {
    expect(AEE).toMatch(/this\._noTriggerRefusals\+\+;\s*\n\s*this\._exitEvalByClass\[_evalCls\]\.refused\+\+;/);
    expect(AEE).toMatch(/this\._exitEvalInvoked\+\+;\s*\n\s*const _evalCls = /);
    expect(AEE).toMatch(/noTriggerByClass=crypto:\$\{this\._exitEvalByClass\.crypto\.refused\}\/\$\{this\._exitEvalByClass\.crypto\.invoked\}/);
  });
});

describe('8a-P4b J5 — the discontinuity sentinel is lane-exclusive (Langston BLOCKER-J5)', () => {
  const SYM = 'AAPL/USD'; // in the seeded xStock universe (the detector is xStock-only)
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    _testClearAllState();
    seedXstockUniverse();
    _testInjectDividendCalendar([]);
  });
  const VTS_SRC = readFileSync(join(process.cwd(), 'server/services/vts-runner.ts'), 'utf-8').replace(/\r\n/g, '\n');
  const DET = readFileSync(join(process.cwd(), 'server/services/price-discontinuity-detector.ts'), 'utf-8').replace(/\r\n/g, '\n');

  it('paper and VTS advance separate machines — each lane keeps its own single quantity', () => {
    _testClearAllState();
    const t0 = 1_000_000_000_000;
    isDiscontinuityActive(SYM, 99.90, t0, 'paper');      // paper feeds the BID
    isDiscontinuityActive(SYM, 100.00, t0 + 1, 'vts');   // VTS still feeds the MARK
    isDiscontinuityActive(SYM, 99.91, t0 + 2, 'paper');
    isDiscontinuityActive(SYM, 100.01, t0 + 3, 'vts');
    expect(_testGetSymbolEntry(SYM, 'paper')!.lastPrice).toBe(99.91);
    expect(_testGetSymbolEntry(SYM, 'vts')!.lastPrice).toBe(100.01);
  });

  it("VTS calls cannot clear paper's post-gap deferral (the early-fire path): paper clears only on its own confirming tick", () => {
    _testClearAllState();
    const t0 = 1_000_000_000_000;
    isDiscontinuityActive(SYM, 200, t0, 'paper');
    isDiscontinuityActive(SYM, 200, t0 + 10_000, 'paper');
    const resume = isDiscontinuityActive(SYM, 196, t0 + 10_000 + 600_000, 'paper'); // >300 s gap, -2%: halt-resume
    expect(resume.active).toBe(true);
    // VTS calls in between, on the mark, within 0.5% of the resume — under one shared machine these advanced the
    // SAME state and could satisfy the CLEARING test on the wrong quantity.
    isDiscontinuityActive(SYM, 196.5, t0 + 10_000 + 600_500, 'vts');
    isDiscontinuityActive(SYM, 196.6, t0 + 10_000 + 601_000, 'vts');
    expect(_testGetSymbolEntry(SYM, 'paper')!.state).toBe('DISCONTINUITY_ACTIVE');
  });

  it('NON-ADVANCE (Langston J5 condition 1): with paper DISCONTINUITY_ACTIVE on a symbol, a VTS call gets its OWN cold start', () => {
    _testClearAllState();
    const t0 = 1_000_000_000_000;
    isDiscontinuityActive(SYM, 200, t0, 'paper');
    isDiscontinuityActive(SYM, 200, t0 + 10_000, 'paper');
    expect(isDiscontinuityActive(SYM, 196, t0 + 10_000 + 600_000, 'paper').kind).toBe('halt_resume_gap');
    // Keyed by symbol alone, this call would read paper's ACTIVE entry (and could clear it). Keyed by lane it is a
    // brand-new machine: cold_start — not paper's halt, and not inactive.
    const v = isDiscontinuityActive(SYM, 196.2, t0 + 10_000 + 600_100, 'vts');
    expect(v.active).toBe(true);
    expect(v.kind).toBe('cold_start');
    expect(_testGetSymbolEntry(SYM, 'paper')!.state).toBe('DISCONTINUITY_ACTIVE');
  });

  it('condition 2: sentinelLane may never contradict callerMode; an absent lane is derived, never invented', () => {
    expect(resolveSentinelLane('paper', 'paper')).toBe('paper');
    expect(resolveSentinelLane('live', 'live')).toBe('live');
    expect(resolveSentinelLane('vts', 'vts')).toBe('vts');
    expect(resolveSentinelLane('vts', 'vts_shadow')).toBe('vts_shadow');
    expect(resolveSentinelLane('vts', undefined)).toBe('vts');
    expect(() => resolveSentinelLane('paper', 'vts')).toThrow(/contradicts/);
    expect(() => resolveSentinelLane('vts', 'paper')).toThrow(/contradicts/);
    expect(() => resolveSentinelLane('live', 'vts_shadow')).toThrow(/contradicts/);
  });

  it('condition 3: the trailing controller has no detector fallback and no fifth lane', () => {
    const TEC = readFileSync(join(process.cwd(), 'server/services/trailing-exit-controller.ts'), 'utf-8');
    expect(TEC).not.toMatch(/isDiscontinuityActive\(/);
    expect(DET).not.toMatch(/direct_caller'/);
  });

  it('the lane is a REQUIRED argument (no default), and every production caller names its own', () => {
    const sig = /export function isDiscontinuityActive\(([\s\S]*?)\): DiscontinuityResult/.exec(DET)![1];
    expect(sig).toMatch(/currentTs: number,/);
    expect(sig).toMatch(/lane: SentinelLane,/);
    expect(sig).not.toMatch(/lane\??: SentinelLane\s*=/);
    expect(AEE).toMatch(/sentinelLane: this\.mode,/);
    expect(VTS_SRC).toMatch(/sentinelLane: 'vts',/);
    expect(VTS_SRC).toMatch(/sentinelLane: 'vts_shadow',/);
    expect((VTS_SRC.match(/sentinelLane: 'vts'/g) ?? []).length).toBe(1);
  });
});
