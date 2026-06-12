/**
 * B-4.6-B chunk B — ScanYielder unit tests.
 * Locks: (1) elapsed-time gate (no yield under threshold; yield + reset over
 * it); (2) the yield is a MACROTASK boundary (starved timers actually run —
 * the mechanism the fix exists for); (3) per-cycle count observability.
 */
import { describe, it, expect } from 'vitest';
import { performance } from 'perf_hooks';
import { ScanYielder, SCAN_YIELD_THRESHOLD_MS } from '../../services/scan-yield.js';
import { _resetScanStallInstrument } from '../../services/scan-stall-instrument.js';

function busyWaitMs(ms: number): void {
  const t0 = performance.now();
  while (performance.now() - t0 < ms) {
    // spin — simulates a contiguous synchronous compute span
  }
}

describe('B-4.6-B ScanYielder', () => {
  it('default threshold is the reviewed 20ms design value', () => {
    expect(SCAN_YIELD_THRESHOLD_MS).toBe(20);
  });

  it('does NOT yield below the elapsed threshold (cheap stretches cost nothing)', async () => {
    const y = new ScanYielder('test_lane_cheap', 10_000);
    for (let i = 0; i < 50; i++) {
      await y.maybeYield();
    }
    expect(y.count).toBe(0);
    _resetScanStallInstrument();
  });

  it('yields once the elapsed threshold is exceeded, then resets the budget', async () => {
    const y = new ScanYielder('test_lane_gate', 30);
    busyWaitMs(35); // exceed the 30ms budget with sync work
    await y.maybeYield();
    expect(y.count).toBe(1);
    // budget was reset at the yield — an immediate second boundary is a no-op
    await y.maybeYield();
    expect(y.count).toBe(1);
    _resetScanStallInstrument();
  });

  it('the yield is a MACROTASK boundary: a starved 0ms timer fires mid-loop', async () => {
    const y = new ScanYielder('test_lane_macro', 0); // yield at every boundary
    let timerRan = false;
    setTimeout(() => { timerRan = true; }, 0);
    // Without yields this sync loop would block the timer for its full
    // duration. With per-boundary macrotask yields, the timer fires inside
    // the loop — exactly the starvation the chunk-B fix removes.
    for (let i = 0; i < 5 && !timerRan; i++) {
      busyWaitMs(2);
      await y.maybeYield();
    }
    expect(timerRan).toBe(true);
    expect(y.count).toBeGreaterThan(0);
    _resetScanStallInstrument();
  });

  it('counts are per-instance (per-cycle observability, lanes independent)', async () => {
    const a = new ScanYielder('test_lane_a', 0);
    const b = new ScanYielder('test_lane_b', 0);
    await a.maybeYield();
    await a.maybeYield();
    await b.maybeYield();
    expect(a.count).toBe(2);
    expect(b.count).toBe(1);
    _resetScanStallInstrument();
  });
});
