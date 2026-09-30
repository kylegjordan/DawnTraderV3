/**
 * `3n.q7` B-XSTOCK-BID-TRIGGER-RELAND — INCREMENT 1: THE PER-TICK xSTOCK EXIT FRAME LINE (telemetry only).
 *
 * Plan: `Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_PRE_AUDIT.md` (Step 2 cleared, Langston C1-C3).
 * The line's CONTENT is decided by a pure function and is tested by calling it. WHERE it is emitted, the reason
 * plumbing, and the fence are wiring facts inside a multi-thousand-line engine method, so they are fenced at the
 * SOURCE, with comments stripped first (a comment is where intent is written, so it cannot be a fence).
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { xsExitFrameLine, type XsExitFrameLineInput } from '../../services/xstock-exit-frame-log.js';

const RAW = readFileSync(join(process.cwd(), 'server/services/active-execution-engine.ts'), 'utf-8').replace(/\r\n/g, '\n');
const CODE = RAW.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');

const base = (over: Partial<XsExitFrameLineInput> = {}): XsExitFrameLineInput => ({
  symbol: 'NVDA/USD', positionId: 'pos-1', evalCls: 'xstock',
  frame: { bid: 181.23, ask: 181.31, spread: 0.00044, thr: 0.0123, basis: 'raw_guarded', reason: null },
  mark: 181.27, stopLoss: 176.5, takeProfit: 190.25, bidWouldFire: 'no', markExit: false, exitReason: null,
  ...over,
});

describe('3n.q7 inc-1 — the line (called, not grepped)', () => {
  it('an evaluated xStock tick with sides prints frame=ok and its basis', () => {
    const l = xsExitFrameLine(base())!;
    expect(l).toContain('[3n.q7][XS_FRAME] NVDA/USD pos=pos-1 frame=ok basis=raw_guarded');
    expect(l).toContain('bid=181.23 ask=181.31');
    expect(l).toContain('bidWouldFire=no markExit=n exitReason=none');
    expect(l).not.toContain('class_mismatch');
  });

  // MUTATION: drop the reason from the line (print `unset` or nothing) and this fails (condition 2).
  it.each(['unguarded_not_two_sided', 'unguarded_crossed', 'guarded_crossed', 'guarded_non_finite'])(
    'a hollow frame prints frame=none with its reason: %s', (reason) => {
      const l = xsExitFrameLine(base({ frame: { bid: null, ask: null, spread: null, thr: null, basis: null, reason } }))!;
      expect(l).toContain(`frame=none reason=${reason}`);
    });

  it('a missing frame object on an xStock evaluation prints no_frame_object AND class_mismatch (the mirror case)', () => {
    const l = xsExitFrameLine(base({ frame: null }))!;
    expect(l).toContain('frame=none reason=no_frame_object');
    expect(l).toContain('class_mismatch evalCls=xstock posClass=not_xstock');
  });

  // Langston C2: a frame that EXISTS is never dropped because the evaluator's class resolved `other`.
  it('a frame on a tick the evaluator classed other is EMITTED, with class_mismatch', () => {
    const l = xsExitFrameLine(base({ evalCls: 'other' }));
    expect(l).not.toBeNull();
    expect(l!).toContain('class_mismatch evalCls=other posClass=xstock_spot');
  });

  // MUTATION: emit for every class (drop the null return) and this fails — crypto would flood error.log.
  it('CONTROL — a crypto tick with no frame prints nothing', () => {
    expect(xsExitFrameLine(base({ evalCls: 'crypto', frame: null }))).toBeNull();
  });

  // Langston Step-4 condition 1: a non-level mark exit carries its reason, so it never reads as a bid/mark divergence.
  // MUTATION: drop the exitReason token and this fails.
  it('a mark exit prints its reason (a time close is not a divergence)', () => {
    const l = xsExitFrameLine(base({ markExit: true, exitReason: 'timeout' }))!;
    expect(l).toContain('bidWouldFire=no markExit=y exitReason=timeout');
  });

  // Langston C3 + Step-4 re-derivation: the TRUE worst case (float-noise prices, class_mismatch, a full uuid, the longest
  // symbol, the longest exit reason) measured 315 B before exitReason; it must stay under the 375 B re-budget trigger.
  it('the true worst-case line stays inside the 375 B re-budget trigger', () => {
    const l = xsExitFrameLine(base({
      symbol: 'BRK.B/USD', positionId: '8f9d1d0e-1234-4abc-9def-0123456789ab', evalCls: 'other',
      frame: { bid: 481.23450000000003, ask: 481.98760000000004, spread: 0.00156, thr: 0.01234, basis: 'raw_unguarded', reason: null, trail: 0.00411, ret: 0.00137, tb: 'v' },
      mark: 481.61105000000003, stopLoss: 470.12345600000004, takeProfit: 505.98765400000004,
      bidWouldFire: 'target', markExit: true, exitReason: 'trailing_stop_hit',
    }))!;
    expect(l).toContain('class_mismatch evalCls=other posClass=xstock_spot');
    expect(Buffer.byteLength(l, 'utf8')).toBeLessThan(375);
  });
});

describe('3n.q7 inc-1 — the wiring (source, comments stripped)', () => {
  // MUTATION: remove the emit, or move it away from `invoked++`, and this fails.
  it('the frame line is built and written right after the per-class invoked++', () => {
    const at = CODE.indexOf('this._exitEvalByClass[_evalCls].invoked++;');
    expect(at).toBeGreaterThan(0);
    const after = CODE.slice(at, at + 900);
    expect(after).toMatch(/xsExitFrameLine\(\{[\s\S]*evalCls:\s*_evalCls[\s\S]*frame:\s*xsFrame/);
    expect(after).toMatch(/exitReason:\s*decision\.exitReason \?\? null/);
    expect(after).toMatch(/console\.warn\(_xsLine\)/);
    expect(after).toMatch(/if \(_evalCls === 'xstock'\) this\._xsFramesEmitted\+\+;/);
  });

  // MUTATION: remove the fence and this fails.
  it('the per-cycle fence compares the emitted count to the xStock invoked count and errors on drift', () => {
    expect(CODE).toMatch(/if \(this\._xsFramesEmitted !== this\._exitEvalByClass\.xstock\.invoked\) \{\s*console\.error\(`\[3n\.q7\]\[XS_FRAME_RECONCILE_BROKEN\]/);
    expect(CODE).toMatch(/xsFrames=\$\{this\._xsFramesEmitted\}\/\$\{this\._exitEvalByClass\.xstock\.invoked\}/);
  });

  // MUTATION: drop the reason from the caller's frame object and this fails.
  it('the caller carries the basis and the reason into the frame, and sets the reason on all four hollow arms', () => {
    expect(CODE).toMatch(/\{ bid: xsBid, ask: xsAsk, spread: xsSpread, thr: xsThr, basis: xsSideBasis, reason: xsFrameReason, trail: xsThrBasis\?\.trail \?\? null, ret: xsThrBasis\?\.ret \?\? null, tb: xsThrBasis\?\.tb \?\? null \}/);
    expect(CODE).toMatch(/xsThr = _r\.inputs\.departureThresholdFrac \?\? null;\s*const _tb = readThresholdBasis\(position\.symbol\);/);
    expect(CODE).toMatch(/xsFrameReason = 'unguarded_crossed';/);
    expect(CODE).toMatch(/xsFrameReason = 'unguarded_not_two_sided';/);
    expect(CODE).toMatch(/xsFrameReason = _crossed \? 'guarded_crossed' : 'guarded_non_finite';/);
  });

  // Step-4 condition 4: the X3 run summary no longer calls a lost frame 'converged'.
  // MUTATION: revert the endedBy ternary and this fails.
  it("the X3 END line says frame_lost when the run ended because the bid disappeared", () => {
    expect(CODE).toMatch(/endedBy=\$\{decision\.shouldExit \? 'mark_exit' : \(xsFrame\.bid === null \? 'frame_lost' : 'converged'\)\}/);
  });

  it('the counters reset each cycle, after the fence reads them', () => {
    const fence = CODE.indexOf('[3n.q7][XS_FRAME_RECONCILE_BROKEN]');
    const reset = CODE.indexOf('this._xsFramesEmitted = 0;');
    expect(fence).toBeGreaterThan(0);
    expect(reset).toBeGreaterThan(fence);
  });
});

// Langston inc-2 Step-1 BLOCKER-2: the line carries what the threshold was built from, so a would-refuse computed from a
// chain seeded inside a blowout (its own trailing median is blown) can be told apart from a real one.
describe('3n.q7 inc-1 amendment — the threshold basis on the line', () => {
  it('prints trail, ret and tb from the frame, and none when absent', () => {
    const withBasis = xsExitFrameLine(base({ frame: { bid: 181.23, ask: 181.31, spread: 0.00044, thr: 0.0123, basis: 'raw_guarded', reason: null, trail: 0.00041, ret: 0.00038, tb: 'j' } }))!;
    expect(withBasis).toContain('thr=0.01230 trail=0.00041 ret=0.00038 tb=j');
    const without = xsExitFrameLine(base({ frame: { bid: 181.23, ask: 181.31, spread: 0.00044, thr: 0.0123, basis: 'raw_unguarded', reason: null } }))!;
    // thr is set with no trail ⇒ the prior-frame fallback (inc-2 P9), rendered distinctly from a frame with no threshold
    expect(without).toContain('trail=prior ret=none tb=none');
  });
});

describe('3n.q7 inc-1 amendment — readThresholdBasis at the real tracker (pure: no flag set)', () => {
  it('a cold-seeded chain is vacuous with no seed ring; a chain seeded after a healthy clear is judged and carries that ring median', async () => {
    const T = await import('../../asset_classes/xstock_spot/book-state-tracker');
    T._resetBookStateComparatorsForTest();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    let t = 1_000;
    expect(T.readThresholdBasis('TST/USD')).toBeNull();
    for (let i = 0; i < 25; i++) {
      const bid = 100 + i * 0.01;
      T.advanceBookStateComparator('TST/USD', { bid, ask: bid + 0.1, last: bid, atMs: (t += 1_500) }, 20, true, 3);
    }
    expect(T.readThresholdBasis('TST/USD')).toEqual({ seedRet: null, tb: 'v' });
    const ringMedian = (() => { const c = T.readBookStateComparator('TST/USD')!; const s2 = [...c.spreads].sort((a, b2) => a - b2); const h = s2.length >> 1; return s2.length % 2 ? s2[h] : (s2[h - 1] + s2[h]) / 2; })();
    T.clearBookStateComparator('TST/USD', 'yield_after_60_hollow'); // live + moved ⇒ the ring is retained
    T.advanceBookStateComparator('TST/USD', { bid: 100.3, ask: 100.4, last: 100.3, atMs: (t += 1_500) }, 20, true, 3);
    const judged = T.readThresholdBasis('TST/USD')!;
    expect(judged.tb).toBe('j');
    // the seed's judged-against median survives the ring being consumed — the one outside datum a validated chain has
    expect(judged.seedRet).toBeCloseTo(ringMedian, 12);
    // pure: the refusal basis is still reported as `first` after any number of reads
    T.readThresholdBasis('TST/USD');
    expect(T.takeChainRefusalBasis('TST/USD')!.first).toBe(true);
    warn.mockRestore(); log.mockRestore();
  });
});

// Langston 565e784ce Step 4 BLOCKER-1: `trail` must be the threshold's own PRE-advance input, not a re-read of the ring
// after the advance has pushed this frame into it. Pinned at the capture site (comments stripped).
describe('3n.q7 inc-1 amendment — trail is the predicate input, not a post-advance re-read', () => {
  it('the capture takes _r.inputs.trailingMedianSpreadFrac and the reader no longer returns a median', () => {
    const aee = readFileSync(join(process.cwd(), 'server/services/active-execution-engine.ts'), 'utf8').replace(/\/\/[^\n]*/g, '');
    expect(aee).toMatch(/xsThrBasis = \{ trail: _r\.inputs\.trailingMedianSpreadFrac \?\? null, ret: _tb\?\.seedRet \?\? null, tb: _tb\?\.tb \?\? null \}/);
    const trk = readFileSync(join(process.cwd(), 'server/asset_classes/xstock_spot/book-state-tracker.ts'), 'utf8');
    const at = trk.indexOf('export function readThresholdBasis');
    const fn = trk.slice(at, trk.indexOf('\n}', at) + 2); // to the closing brace (Langston nit (a)): no neighbouring prose
    expect(fn).not.toMatch(/medianOf|_retainedSpreads/);
  });
});

// `3n.q7` increment 2 P9 — `trail=prior` when the threshold came from the prior-frame fallback.
describe('3n.q7 inc-2 P9 — the fallback basis renders distinctly', () => {
  it('a null trail beside a set thr prints prior; a null trail with no thr prints none; a set trail prints its value', () => {
    const f = (trail: number | null, thr: number | null) => xsExitFrameLine(base({ frame: { bid: 181.23, ask: 181.31, spread: 0.00044, thr, basis: 'raw_guarded', reason: null, trail, ret: null, tb: 'v' } }))!;
    expect(f(null, 0.0123)).toContain('trail=prior');
    expect(f(null, null)).toContain('trail=none');
    expect(f(0.00041, 0.0123)).toContain('trail=0.00041');
  });
});
