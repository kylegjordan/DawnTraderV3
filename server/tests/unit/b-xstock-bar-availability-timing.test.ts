import { beforeEach, describe, expect, it } from 'vitest';
import {
  XSTOCK_TIMING_EDGES_MS,
  __resetXstockTimingForTests,
  bucketIndex,
  recordXstockBarStatementTimeout,
  recordXstockBarTiming,
  takeXstockTimingLine,
} from '../../services/passive-archive/xstock-bar-timing.js';

// R6a (B-XSTOCK-BAR-AVAILABILITY Step 9 re-run plan r5): the 15-minute aggregate timing line.
beforeEach(() => __resetXstockTimingForTests());

describe('R6a timing line', () => {
  it('places samples in fixed-edge buckets, with the 20 s edge as the last bounded bucket and an overflow', () => {
    expect(XSTOCK_TIMING_EDGES_MS.at(-1)).toBe(20_000);
    expect(bucketIndex(0)).toBe(0);
    expect(bucketIndex(50)).toBe(0);
    expect(bucketIndex(51)).toBe(1);
    expect(bucketIndex(20_000)).toBe(XSTOCK_TIMING_EDGES_MS.length - 1);
    expect(bucketIndex(20_001)).toBe(XSTOCK_TIMING_EDGES_MS.length); // overflow: the bound was not in effect
  });

  it('reports n, percentiles, max and bucket counts per leg, then resets every accumulator', () => {
    for (let i = 1; i <= 100; i += 1) recordXstockBarTiming('certify', i * 10); // 10 .. 1000 ms
    recordXstockBarTiming('apply', 75);
    recordXstockBarStatementTimeout('certify');
    const line = takeXstockTimingLine('boot-1');
    expect(line.bootId).toBe('boot-1');
    expect(line.seq).toBe(1);
    expect(line.legs.certify.n).toBe(100);
    expect(line.legs.certify.p50).toBe(500);
    expect(line.legs.certify.p99).toBe(990);
    expect(line.legs.certify.max).toBe(1000);
    expect(line.legs.certify.buckets.reduce((a, b) => a + b, 0)).toBe(100);
    expect(line.legs.apply.n).toBe(1);
    expect(line.legs.admit.n).toBe(0);
    expect(line.legs.admit.p50).toBeNull();
    expect(line.timeouts.certify).toBe(1);

    const next = takeXstockTimingLine('boot-1');
    expect(next.seq).toBe(2); // monotonic per boot: a missing seq is a gap
    expect(next.legs.certify.n).toBe(0);
    expect(next.timeouts.certify).toBe(0);
    expect(next.intervalStartedAt).toBe(line.intervalEndedAt);
  });

  it('bucket counts add across lines, so a window percentile can be recomputed from the log', () => {
    recordXstockBarTiming('apply', 40);
    recordXstockBarTiming('apply', 3_000);
    const a = takeXstockTimingLine('b');
    recordXstockBarTiming('apply', 40);
    const b = takeXstockTimingLine('b');
    const summed = a.legs.apply.buckets.map((n, i) => n + b.legs.apply.buckets[i]);
    expect(summed[bucketIndex(40)]).toBe(2);
    expect(summed[bucketIndex(3_000)]).toBe(1);
  });

  it('ignores non-finite and negative durations', () => {
    recordXstockBarTiming('admit', Number.NaN);
    recordXstockBarTiming('admit', -5);
    expect(takeXstockTimingLine('b').legs.admit.n).toBe(0);
  });
});
