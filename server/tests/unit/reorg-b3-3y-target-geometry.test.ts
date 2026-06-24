/**
 * reorg-B3.3y — symmetric `invalid_geometry`: a valid long requires `stop < entry < target`.
 *
 * reorg-B3.3 (the VTS un-strangle) exposed that `normalizeAndGateTarget`'s geometry guard was ASYMMETRIC —
 * it dropped a missing RISK leg (`stop >= entry`) as `invalid_geometry` but let a missing REWARD leg
 * (`target <= entry`, reward ≤ 0) compute signed `rr ≤ 0` and fall into the `rr_below_min` QUALITY bucket,
 * so on the VTS `'tag'` path it was tag-and-simulated instead of dropped (live: `volatility_edge rr=-0.00`).
 * This pins the reward-leg drop as a VALIDITY reason (mirror of the existing stop-leg test).
 */
import { describe, it, expect } from 'vitest';
import { normalizeAndGateTarget } from '../../core/calculations/signal-target-normalizer.js';

// A geometry with a healthy ATR/reach so the ONLY thing under test is the entry/stop/target relationship.
function gate(entryPrice: number, stopPrice: number, targetPrice: number) {
  return normalizeAndGateTarget({
    entryPrice, stopPrice, targetPrice,
    floorPct: 0, minRR: 2.5, atr: Math.max(1e-9, Math.abs(targetPrice - entryPrice)) / 2, reachAtrMax: 100,
  });
}

describe('reorg-B3.3y normalizeAndGateTarget — symmetric geometry validity', () => {
  it('REWARD leg missing: target < entry → invalid_geometry DROP (the bug B3.3y fixes)', () => {
    const r = gate(100, 97, 98); // target below entry — reward ≤ 0
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('invalid_geometry');
  });

  it('REWARD leg degenerate: target == entry → invalid_geometry DROP', () => {
    const r = gate(100, 97, 100); // zero reward
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('invalid_geometry');
  });

  it('RISK leg missing: stop >= entry → invalid_geometry DROP (pre-existing, regression guard)', () => {
    const r = gate(100, 100, 110); // stop at entry — zero risk
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('invalid_geometry');
  });

  it('a VALID long with low RR is still a QUALITY drop (rr_below_min), NOT validity', () => {
    // stop < entry < target, but rr = (101-100)/(100-99) = 1.0 < minRR 2.5 → genuine low-RR counterfactual.
    const r = gate(100, 99, 101);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('rr_below_min'); // stays in the tag-eligible quality bucket — NOT reclassified
  });

  it('a healthy long (stop < entry < target, RR ≥ minRR, reachable) PASSES', () => {
    const r = gate(100, 99, 103); // rr = 3/1 = 3.0 ≥ 2.5
    expect(r.ok).toBe(true);
    expect(r.reason).toBeUndefined();
  });
});
