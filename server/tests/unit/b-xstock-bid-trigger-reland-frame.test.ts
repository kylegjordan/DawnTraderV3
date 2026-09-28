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
  mark: 181.27, stopLoss: 176.5, takeProfit: 190.25, bidWouldFire: 'no', markExit: false,
  ...over,
});

describe('3n.q7 inc-1 — the line (called, not grepped)', () => {
  it('an evaluated xStock tick with sides prints frame=ok and its basis', () => {
    const l = xsExitFrameLine(base())!;
    expect(l).toContain('[3n.q7][XS_FRAME] NVDA/USD pos=pos-1 frame=ok basis=raw_guarded');
    expect(l).toContain('bid=181.23 ask=181.31');
    expect(l).toContain('bidWouldFire=no markExit=n');
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

  // Langston C3: the budget assumed ~250 B and re-budgets above ~375 B. A realistic worst-case line stays under it.
  it('a realistic long line stays inside the 375 B re-budget trigger', () => {
    const l = xsExitFrameLine(base({
      symbol: 'BRK.B/USD', positionId: '8f9d1d0e-1234-4abc-9def-0123456789ab',
      frame: { bid: 481.2345, ask: 481.9876, spread: 0.00156, thr: 0.01234, basis: 'raw_unguarded', reason: null },
      mark: 481.61105, stopLoss: 470.123456, takeProfit: 505.987654, bidWouldFire: 'target', markExit: true,
    }))!;
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

  it('the counters reset each cycle, after the fence reads them', () => {
    const fence = CODE.indexOf('[3n.q7][XS_FRAME_RECONCILE_BROKEN]');
    const reset = CODE.indexOf('this._xsFramesEmitted = 0;');
    expect(fence).toBeGreaterThan(0);
    expect(reset).toBeGreaterThan(fence);
  });
});
