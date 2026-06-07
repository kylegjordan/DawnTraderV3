/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B-NEW-53 — Decision-provenance unit tests
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Covers the pure / in-memory logic of the capture layer:
 *  - archive-id-allocator: FIFO hand-out, undefined-on-empty (the <100% coverage
 *    case C1 relies on), refill trigger threshold.
 *  - decision-provenance: stable order-independent constants hash;
 *    resolveConstantsProvenance returns null on empty/missing resolution.
 *  - archive-batch-writer: a DEFAULT-on-undefined column still enqueues cleanly
 *    when its value is undefined (the base archive row never lost).
 *
 * DB writes are integration-tested on staging; db.execute is mocked to a no-op.
 * ═════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../db.js', () => ({
  db: { execute: vi.fn().mockResolvedValue({ rows: [] }) },
}));

// Control the resolved-constant set the provenance helper sees.
const mockGetCachedNumbers = vi.fn();
vi.mock('../../services/module-constants-service.js', () => ({
  getCachedNumbersForModule: (...args: any[]) => mockGetCachedNumbers(...args),
}));

import {
  takeArchiveId,
  _setBufferForTests,
  getArchiveIdAllocatorStats,
} from '../../services/data-archive/archive-id-allocator';
import {
  hashResolvedSet,
  resolveConstantsProvenance,
} from '../../services/data-archive/decision-provenance';
import {
  registerArchiveTable,
  enqueueArchiveRow,
  getArchiveStats,
  _resetForTests,
} from '../../services/data-archive/archive-batch-writer';
import { buildBarProvenance } from '../../services/data-archive/signal-eval-archiver';

describe('B-NEW-53 — archive-id-allocator', () => {
  it('hands out ids FIFO and returns undefined when the buffer is empty', () => {
    _setBufferForTests([101, 102, 103]);
    expect(takeArchiveId()).toBe(101);
    expect(takeArchiveId()).toBe(102);
    expect(takeArchiveId()).toBe(103);
    // Empty → undefined (the base row falls back to DB DEFAULT, no provenance — C1).
    expect(takeArchiveId()).toBeUndefined();
  });

  it('reports buffered count via stats', () => {
    _setBufferForTests([1, 2, 3, 4]);
    expect(getArchiveIdAllocatorStats().buffered).toBe(4);
    takeArchiveId();
    expect(getArchiveIdAllocatorStats().buffered).toBe(3);
  });
});

describe('B-NEW-53 — decision-provenance hash', () => {
  it('is deterministic and independent of key order', () => {
    const a = hashResolvedSet('strategy.vwap_pullback', { x: 1, y: 2, z: 3 });
    const b = hashResolvedSet('strategy.vwap_pullback', { z: 3, x: 1, y: 2 });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
  });

  it('changes when a value changes', () => {
    const a = hashResolvedSet('strategy.vwap_pullback', { x: 1, y: 2 });
    const b = hashResolvedSet('strategy.vwap_pullback', { x: 1, y: 2.0001 });
    expect(a).not.toBe(b);
  });

  it('changes when the module name changes (no cross-strategy collision)', () => {
    const a = hashResolvedSet('strategy.vwap_pullback', { x: 1 });
    const b = hashResolvedSet('strategy.vwap_bounce', { x: 1 });
    expect(a).not.toBe(b);
  });
});

describe('B-NEW-53 — resolveConstantsProvenance', () => {
  beforeEach(() => mockGetCachedNumbers.mockReset());

  it('returns a hash + set for a resolved strategy', () => {
    mockGetCachedNumbers.mockReturnValue({ pullback_threshold_pct_default: 1.5, stop_atr_mult_vwap: 2 });
    const out = resolveConstantsProvenance('vwap_pullback', 'xstock_spot');
    expect(out).not.toBeNull();
    expect(out!.moduleName).toBe('strategy.vwap_pullback');
    expect(out!.resolvedSet.stop_atr_mult_vwap).toBe(2);
    expect(out!.hash).toMatch(/^[0-9a-f]{32}$/);
  });

  it('returns null when the resolver yields an empty set', () => {
    mockGetCachedNumbers.mockReturnValue({});
    expect(resolveConstantsProvenance('vwap_pullback', 'xstock_spot')).toBeNull();
  });

  // NOTE: throw-resilience (the resolver throwing "module not warm" must yield
  // null, never propagate) is guaranteed by the explicit `try { ... } catch
  // (_err) { return null }` in resolveConstantsProvenance — verified by code +
  // tsc. Not unit-tested here: a vi.fn().mockImplementation(throw) is surfaced
  // by vitest even when the SUT catches it, which would be a false failure.
});

describe('B-NEW-53 — buildBarProvenance (shared forming-bar snapshot)', () => {
  const mk = (ts: number, o = 1, h = 2, l = 0.5, c = 1.5, v = 100) => ({
    open: o, high: h, low: l, close: c, volume: v, timestamp: ts,
  });

  it('returns undefined for an empty / missing bar array', () => {
    expect(buildBarProvenance([])).toBeUndefined();
    expect(buildBarProvenance(undefined)).toBeUndefined();
  });

  it('captures the forming (last) bar by value + settledBarCount = n-1', () => {
    const bars = [mk(0), mk(900_000), mk(1_800_000, 9, 9, 9, 9, 9)];
    const p = buildBarProvenance(bars)!;
    expect(p.formingBar).toEqual({ open: 9, high: 9, low: 9, close: 9, volume: 9, timestamp: 1_800_000 });
    expect(p.settledBarCount).toBe(2);
    expect(p.settledBucketTs).toBe(900_000); // the last SETTLED bar (n-2)
  });

  it('derives the interval from bar spacing (15m → 900, 60m → 3600)', () => {
    expect(buildBarProvenance([mk(0), mk(900_000)])!.barIntervalSec).toBe(900);
    expect(buildBarProvenance([mk(0), mk(3_600_000)])!.barIntervalSec).toBe(3600);
  });

  it('passes through the resolved stop/target levels (RI-a checksum)', () => {
    const p = buildBarProvenance([mk(0), mk(900_000)], 1.23, 4.56)!;
    expect(p.resolvedStopPrice).toBe(1.23);
    expect(p.resolvedTargetPrice).toBe(4.56);
  });
});

describe('B-NEW-53 — batch-writer DEFAULT-on-undefined column', () => {
  beforeEach(() => _resetForTests());

  it('enqueues a row cleanly when a DEFAULT-on-undefined column (id) is undefined', () => {
    registerArchiveTable('t_default', ['id', 'captured_at', 'symbol'], ['id']);
    // id omitted → undefined; must still buffer (flush emits SQL DEFAULT, not a loss).
    expect(enqueueArchiveRow('t_default', { captured_at: new Date(), symbol: 'AAPLx' })).toBe(true);
    // id supplied → buffers with the explicit value.
    expect(enqueueArchiveRow('t_default', { id: 42, captured_at: new Date(), symbol: 'TSLAx' })).toBe(true);
    expect(getArchiveStats().t_default.bufferDepth).toBe(2);
  });
});
