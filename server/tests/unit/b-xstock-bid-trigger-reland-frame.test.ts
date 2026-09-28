/**
 * `3n.q7` B-XSTOCK-BID-TRIGGER-RELAND — INCREMENT 1: THE PER-TICK xSTOCK EXIT FRAME LINE (telemetry only).
 *
 * Plan: `Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_PRE_AUDIT.md` (Step 2 cleared, Langston C1-C3).
 * The line's CONTENT is decided by a pure function and is tested by calling it. WHERE it is emitted, the reason
 * plumbing, and the fence are wiring facts inside a multi-thousand-line engine method, so they are fenced at the
 * SOURCE, with comments stripped first (a comment is where intent is written, so it cannot be a fence).
 */
import { describe, it, expect } from 'vitest';
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
      frame: { bid: 481.23450000000003, ask: 481.98760000000004, spread: 0.00156, thr: 0.01234, basis: 'raw_unguarded', reason: null },
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
    expect(CODE).toMatch(/\{ bid: xsBid, ask: xsAsk, spread: xsSpread, thr: xsThr, basis: xsSideBasis, reason: xsFrameReason \}/);
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
