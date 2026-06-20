/**
 * P19 reorg-B2 (Piece A) — central target-floor normalizer + universal RR gate.
 * Locks the Langston Step-2 resolutions:
 *  - lift target to max(native, entry×(1+floor));
 *  - UNIVERSAL RR gate (native OR lifted), drop (never co-move stop) when rr < minRR;
 *  - geometry guard.
 */
import { normalizeAndGateTarget } from '../../core/calculations/signal-target-normalizer.js';

const FLOOR = 0.035; // 3.5% per-class floor
const MINRR = 2.5;

describe('P19 reorg-B2 — normalizeAndGateTarget', () => {
  it('passes a native target already above the floor with sufficient RR (not lifted)', () => {
    // entry 100, stop 98 (risk 2%), native target 105 (reward 5%) → rr 2.5
    const r = normalizeAndGateTarget({ entryPrice: 100, stopPrice: 98, targetPrice: 105, floorPct: FLOOR, minRR: MINRR });
    expect(r.ok).toBe(true);
    expect(r.lifted).toBe(false);
    expect(r.targetPrice).toBe(105);
    expect(r.rr).toBeCloseTo(2.5, 6);
  });

  it('lifts a sub-floor native target up to the floor', () => {
    // entry 100, stop 99 (risk 1%), native target 101 (1% < 3.5% floor) → lift to 103.5, reward 3.5%, rr 3.5
    const r = normalizeAndGateTarget({ entryPrice: 100, stopPrice: 99, targetPrice: 101, floorPct: FLOOR, minRR: MINRR });
    expect(r.ok).toBe(true);
    expect(r.lifted).toBe(true);
    expect(r.targetPrice).toBeCloseTo(103.5, 6);
    expect(r.rr).toBeCloseTo(3.5, 6);
  });

  it('DROPS a lifted signal whose RR is still below min (wide stop) — never co-moves the stop', () => {
    // entry 100, stop 98 (risk 2%), native target 101 → lift to 103.5 (reward 3.5%) → rr 1.75 < 2.5 → drop
    const r = normalizeAndGateTarget({ entryPrice: 100, stopPrice: 98, targetPrice: 101, floorPct: FLOOR, minRR: MINRR });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('rr_below_min');
    expect(r.lifted).toBe(true);
    // stop is NOT modified by the helper — caller's stopPrice is untouched by construction (pure fn)
  });

  it('UNIVERSAL gate: drops a NATIVE (un-lifted) target that already clears the floor but has sub-min RR', () => {
    // entry 100, stop 95 (risk 5%), native target 110 (reward 10% > floor, not lifted) → rr 2.0 < 2.5 → drop
    const r = normalizeAndGateTarget({ entryPrice: 100, stopPrice: 95, targetPrice: 110, floorPct: FLOOR, minRR: MINRR });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('rr_below_min');
    expect(r.lifted).toBe(false); // gate fires on native signals too, not just lifted ones
  });

  it('accepts RR exactly at the minimum (>=)', () => {
    // entry 100, stop 98 (risk 2%), native target 105 (reward 5%) → rr exactly 2.5
    const r = normalizeAndGateTarget({ entryPrice: 100, stopPrice: 98, targetPrice: 105, floorPct: FLOOR, minRR: 2.5 });
    expect(r.ok).toBe(true);
  });

  it('rejects invalid geometry (stop >= entry)', () => {
    const r = normalizeAndGateTarget({ entryPrice: 100, stopPrice: 101, targetPrice: 110, floorPct: FLOOR, minRR: MINRR });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('invalid_geometry');
  });

  it('rejects non-finite / non-positive inputs', () => {
    expect(normalizeAndGateTarget({ entryPrice: 0, stopPrice: 0, targetPrice: 0, floorPct: FLOOR, minRR: MINRR }).reason).toBe('invalid_geometry');
    expect(normalizeAndGateTarget({ entryPrice: NaN, stopPrice: 98, targetPrice: 105, floorPct: FLOOR, minRR: MINRR }).reason).toBe('invalid_geometry');
  });
});
