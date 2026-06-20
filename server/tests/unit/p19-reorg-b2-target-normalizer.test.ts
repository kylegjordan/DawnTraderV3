/**
 * P19 reorg-B2 (Piece A + Piece C) — central target normalizer: floor-lift + universal RR gate
 * + reachability gate. Locks the Langston Step-2 + fold-into-normalizer consensus:
 *  - lift target to max(native, entry×(1+floor)); strong targets ride ABOVE the floor (dispersion);
 *  - UNIVERSAL RR gate (native OR lifted), drop (never co-move stop) when rr < minRR;
 *  - REACHABILITY gate: atrsToTarget=(target'−entry)/ATR ≤ reachAtrMax (path-invariant feasibility);
 *  - geometry guard.
 */
import { normalizeAndGateTarget } from '../../core/calculations/signal-target-normalizer.js';

const FLOOR = 0.035;   // 3.5% per-class floor
const MINRR = 2.5;
const ATR = 2;         // 2 price units on a 100 entry → 2%
const REACH = 4;       // max ATRs-to-target

describe('P19 reorg-B2 — normalizeAndGateTarget (lift + RR + reachability)', () => {
  it('passes a native target above the floor with sufficient RR + reachable (not lifted)', () => {
    // entry 100, stop 98 (risk 2%), native target 105 (reward 5%) → rr 2.5, atrsToTarget 5/2=2.5 ≤ 4
    const r = normalizeAndGateTarget({ entryPrice: 100, stopPrice: 98, targetPrice: 105, floorPct: FLOOR, minRR: MINRR, atr: ATR, reachAtrMax: REACH });
    expect(r.ok).toBe(true);
    expect(r.lifted).toBe(false);
    expect(r.targetPrice).toBe(105);
    expect(r.rr).toBeCloseTo(2.5, 6);
    expect(r.atrsToTarget).toBeCloseTo(2.5, 6);
  });

  it('DISPERSION: a strong native target rides ABOVE the floor (not clamped down)', () => {
    // entry 100, stop 96 (risk 4%), native target 110 (10% > floor) → not lifted, rr 2.5, atrs 10/4=2.5
    const r = normalizeAndGateTarget({ entryPrice: 100, stopPrice: 96, targetPrice: 110, floorPct: FLOOR, minRR: 2.5, atr: 4, reachAtrMax: 5 });
    expect(r.ok).toBe(true);
    expect(r.lifted).toBe(false);
    expect(r.targetPrice).toBe(110); // rode to its native target, well above the 3.5% floor
  });

  it('lifts a sub-floor native target up to the floor (reachable)', () => {
    // entry 100, stop 99 (risk 1%), native 101 → lift to 103.5 (reward 3.5%), rr 3.5, atrs 3.5/2=1.75
    const r = normalizeAndGateTarget({ entryPrice: 100, stopPrice: 99, targetPrice: 101, floorPct: FLOOR, minRR: MINRR, atr: ATR, reachAtrMax: REACH });
    expect(r.ok).toBe(true);
    expect(r.lifted).toBe(true);
    expect(r.targetPrice).toBeCloseTo(103.5, 6);
    expect(r.rr).toBeCloseTo(3.5, 6);
  });

  it('DROPS sub-RR after the lift (rr_below_min) — never co-moves the stop', () => {
    // entry 100, stop 98 (risk 2%), native 101 → lift 103.5 (reward 3.5%) → rr 1.75 < 2.5 → drop
    const r = normalizeAndGateTarget({ entryPrice: 100, stopPrice: 98, targetPrice: 101, floorPct: FLOOR, minRR: MINRR, atr: ATR, reachAtrMax: REACH });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('rr_below_min');
  });

  it('UNIVERSAL RR gate fires on a NATIVE (un-lifted) sub-RR target too', () => {
    // entry 100, stop 95 (risk 5%), native 110 (>floor, not lifted) → rr 2.0 < 2.5 → drop
    const r = normalizeAndGateTarget({ entryPrice: 100, stopPrice: 95, targetPrice: 110, floorPct: FLOOR, minRR: MINRR, atr: 5, reachAtrMax: REACH });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('rr_below_min');
    expect(r.lifted).toBe(false);
  });

  it('DROPS an UNREACHABLE target (too many ATRs) even with good RR', () => {
    // entry 100, stop 99 (risk 1%), native 101 → lift 103.5 (reward 3.5%), rr 3.5 OK, but atr 0.5 →
    // atrsToTarget 3.5/0.5 = 7 > reachAtrMax 4 → unreachable
    const r = normalizeAndGateTarget({ entryPrice: 100, stopPrice: 99, targetPrice: 101, floorPct: FLOOR, minRR: MINRR, atr: 0.5, reachAtrMax: REACH });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('unreachable');
    expect(r.atrsToTarget).toBeCloseTo(7, 6);
  });

  it('atr<=0 → LOUD invalid_atr (wiring/data bug), distinct from a normal unreachable drop', () => {
    const r = normalizeAndGateTarget({ entryPrice: 100, stopPrice: 98, targetPrice: 105, floorPct: FLOOR, minRR: MINRR, atr: 0, reachAtrMax: REACH });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('invalid_atr'); // never silently masked as 'unreachable' (Langston Step-4)
  });

  it('rejects invalid geometry (stop >= entry)', () => {
    const r = normalizeAndGateTarget({ entryPrice: 100, stopPrice: 101, targetPrice: 110, floorPct: FLOOR, minRR: MINRR, atr: ATR, reachAtrMax: REACH });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('invalid_geometry');
  });
});
