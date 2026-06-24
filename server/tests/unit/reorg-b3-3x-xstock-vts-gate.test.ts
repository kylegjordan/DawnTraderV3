/**
 * reorg-B3.3x — xStock VTS un-strangle: the SHARED `normalizeAndGateTarget` gate is now run on the xStock
 * eval-cycle path (after `callStrategyDetect`, BEFORE the Net-EV kernel), with the SAME tag-vs-drop disposition
 * crypto uses. This pins the disposition CONTRACT eval-cycle implements + that the xStock-shaped inputs
 * (entryPrice / stopLoss / takeProfit / per-class minRR/reachAtrMax / atr) drive the normalizer correctly.
 *
 * (The normalizer math itself is also covered by reorg-b3-3y; this fixes the xStock-side reason→disposition
 * partition so a future edit can't silently move a reason between the tag bucket and the drop bucket.)
 */
import { describe, it, expect } from 'vitest';
import { normalizeAndGateTarget, type TargetNormalizeReason } from '../../core/calculations/signal-target-normalizer.js';

// The reorg-B3.3x eval-cycle disposition: QUALITY → tag-and-simulate (vtsGateVerdict set); VALIDITY → drop.
// This MUST stay in sync with the inline block in xstock_spot/eval-cycle.ts and with crypto vts-runner.
const TAG_REASONS: ReadonlySet<TargetNormalizeReason> = new Set<TargetNormalizeReason>(['rr_below_min', 'unreachable']);
function disposition(reason: TargetNormalizeReason | undefined): 'pass' | 'tag' | 'drop' {
  if (reason === undefined) return 'pass';
  return TAG_REASONS.has(reason) ? 'tag' : 'drop';
}

// xStock-representative per-class gate (expectancy_gates for xstock_spot: minRR 2.5, reach 4.0 ATRs).
function xstockGate(entry: number, stop: number, target: number, atr: number) {
  return normalizeAndGateTarget({
    entryPrice: entry, stopPrice: stop, targetPrice: target,
    floorPct: 0, minRR: 2.5, atr, reachAtrMax: 4.0,
  });
}

describe('reorg-B3.3x xStock VTS gate — reason→disposition partition', () => {
  it('healthy long (stop<entry<target, RR≥2.5, reachable) → PASS (vtsGateVerdict stays "passed")', () => {
    const r = xstockGate(100, 99, 103, 1.0); // rr=3.0, atrsToTarget=3.0 ≤ 4.0
    expect(r.ok).toBe(true);
    expect(disposition(r.reason)).toBe('pass');
  });

  it('valid low-RR long → rr_below_min → TAG-and-simulate (the un-strangle payoff)', () => {
    const r = xstockGate(100, 99, 101.5, 1.0); // rr=1.5 < 2.5, reachable
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('rr_below_min');
    expect(disposition(r.reason)).toBe('tag');
  });

  it('far-but-valid target → unreachable → TAG-and-simulate', () => {
    const r = xstockGate(100, 90, 130, 1.0); // rr=3.0 ≥ 2.5 but atrsToTarget=30 > 4.0
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('unreachable');
    expect(disposition(r.reason)).toBe('tag');
  });

  it('reward≤0 (target≤entry) → invalid_geometry → DROP (reorg-B3.3y validity, inherited for free on xStock)', () => {
    const r = xstockGate(100, 97, 100, 1.0); // target == entry
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('invalid_geometry');
    expect(disposition(r.reason)).toBe('drop');
  });

  it('ATR unavailable (atr≤0) → invalid_atr → DROP (wiring/data garbage)', () => {
    const r = xstockGate(100, 99, 103, 0);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('invalid_atr');
    expect(disposition(r.reason)).toBe('drop');
  });
});
