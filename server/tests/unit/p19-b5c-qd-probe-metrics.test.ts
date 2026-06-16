/**
 * P19-B5c — unit tests for the Q-D probe pure metrics (#86).
 * Covers: D5 fire-grid bucket flooring; A1 degenerate-quote policy
 * (ok / crossed / zero_bid / zero_ask / nonpositive_mid / zero_depth);
 * stale boundary; no_snap sentinel; spread/depth correctness.
 */
import { describe, it, expect } from 'vitest';
import {
  computeQdMetrics,
  floorToCadenceGrid,
  type QdRawSnap,
} from '../../asset_classes/xstock_spot/qd-probe-metrics.js';

const FRESH_MS = 600_000; // 10 min freshness ceiling (matches the 2× cadence seed)

function snap(partial: Partial<QdRawSnap>): QdRawSnap {
  return { bid: 100, ask: 100.1, bidQty: 50, askQty: 40, capturedAtMs: null, ...partial };
}

describe('floorToCadenceGrid (D5 — fire-grid bucket, NOT captured_at)', () => {
  it('floors a fire time to the 5-min grid in UTC', () => {
    const fire = Date.UTC(2026, 5, 16, 13, 17, 42, 500);
    expect(floorToCadenceGrid(fire, 5).toISOString()).toBe('2026-06-16T13:15:00.000Z');
  });
  it('is idempotent on an exact grid boundary', () => {
    const onGrid = Date.UTC(2026, 5, 16, 13, 15, 0, 0);
    expect(floorToCadenceGrid(onGrid, 5).getTime()).toBe(onGrid);
  });
  it('two fires in the same bucket floor to the same bucket_start (idempotency basis)', () => {
    const a = Date.UTC(2026, 5, 16, 13, 16, 0, 0);
    const b = Date.UTC(2026, 5, 16, 13, 19, 59, 0);
    expect(floorToCadenceGrid(a, 5).getTime()).toBe(floorToCadenceGrid(b, 5).getTime());
  });
  it('honors a 1-min cadence', () => {
    const fire = Date.UTC(2026, 5, 16, 13, 17, 42, 500);
    expect(floorToCadenceGrid(fire, 1).toISOString()).toBe('2026-06-16T13:17:00.000Z');
  });
  it('throws on a non-positive cadence', () => {
    expect(() => floorToCadenceGrid(Date.now(), 0)).toThrow();
  });
});

describe('computeQdMetrics — valid quote', () => {
  it('computes mid / spread_abs / spread_bps / depth + ok', () => {
    const m = computeQdMetrics(snap({ bid: 100, ask: 100.1, bidQty: 50, askQty: 40 }), 1_000_000, FRESH_MS);
    expect(m.quoteQuality).toBe('ok');
    expect(m.mid).toBeCloseTo(100.05, 8);
    expect(m.spreadAbs).toBeCloseTo(0.1, 8);
    expect(m.spreadBps).toBeCloseTo((0.1 / 100.05) * 10_000, 4); // ≈ 9.995 bps
    expect(m.bidDepthNotional).toBeCloseTo(100 * 50, 4);
    expect(m.askDepthNotional).toBeCloseTo(100.1 * 40, 4);
  });
  it('treats a locked book (bid==ask) as ok with zero spread', () => {
    const m = computeQdMetrics(snap({ bid: 100, ask: 100 }), 1_000_000, FRESH_MS);
    expect(m.quoteQuality).toBe('ok');
    expect(m.spreadBps).toBe(0);
  });
});

describe('computeQdMetrics — A1 degenerate quotes', () => {
  it('crossed (ask < bid) → derived NULL', () => {
    const m = computeQdMetrics(snap({ bid: 100.2, ask: 100.1 }), 1_000_000, FRESH_MS);
    expect(m.quoteQuality).toBe('crossed');
    expect(m.spreadBps).toBeNull();
    expect(m.mid).toBeNull();
    expect(m.bidDepthNotional).toBeNull();
  });
  it('zero / missing bid → zero_bid', () => {
    expect(computeQdMetrics(snap({ bid: 0 }), 1_000_000, FRESH_MS).quoteQuality).toBe('zero_bid');
    expect(computeQdMetrics(snap({ bid: null }), 1_000_000, FRESH_MS).quoteQuality).toBe('zero_bid');
  });
  it('zero / missing ask (bid valid) → zero_ask', () => {
    expect(computeQdMetrics(snap({ bid: 100, ask: 0 }), 1_000_000, FRESH_MS).quoteQuality).toBe('zero_ask');
    expect(computeQdMetrics(snap({ bid: 100, ask: null }), 1_000_000, FRESH_MS).quoteQuality).toBe('zero_ask');
  });
  it('price-valid but zero/missing size → zero_depth (spread KEPT, depth NULL)', () => {
    const m = computeQdMetrics(snap({ bid: 100, ask: 100.1, bidQty: 0, askQty: 40 }), 1_000_000, FRESH_MS);
    expect(m.quoteQuality).toBe('zero_depth');
    expect(m.spreadBps).not.toBeNull();           // spread is real
    expect(m.bidDepthNotional).toBeNull();         // depth absent
    expect(m.askDepthNotional).toBeNull();
    const m2 = computeQdMetrics(snap({ bidQty: null }), 1_000_000, FRESH_MS);
    expect(m2.quoteQuality).toBe('zero_depth');
  });
});

describe('computeQdMetrics — staleness (boundary)', () => {
  it('age ≤ ceiling is NOT stale; age > ceiling IS stale', () => {
    const fire = 2_000_000;
    const atCeiling = computeQdMetrics(snap({ capturedAtMs: fire - FRESH_MS }), fire, FRESH_MS);
    expect(atCeiling.stale).toBe(false); // exactly at the ceiling is still fresh
    const overCeiling = computeQdMetrics(snap({ capturedAtMs: fire - FRESH_MS - 1 }), fire, FRESH_MS);
    expect(overCeiling.stale).toBe(true);
    expect(overCeiling.snapAgeMs).toBe(FRESH_MS + 1);
  });
  it('snap_age_ms is clamped at 0 for a future-dated snap', () => {
    const fire = 1_000_000;
    expect(computeQdMetrics(snap({ capturedAtMs: fire + 5_000 }), fire, FRESH_MS).snapAgeMs).toBe(0);
  });
});

describe('computeQdMetrics — no snap', () => {
  it('null snap → no_snap sentinel, all derived NULL, not stale', () => {
    const m = computeQdMetrics(null, 1_000_000, FRESH_MS);
    expect(m.quoteQuality).toBe('no_snap');
    expect(m.snapAgeMs).toBeNull();
    expect(m.stale).toBe(false);
    expect(m.mid).toBeNull();
    expect(m.spreadBps).toBeNull();
  });
});
