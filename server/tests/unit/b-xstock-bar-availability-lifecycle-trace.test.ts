import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// R1 (B-XSTOCK-BAR-AVAILABILITY Step 9 re-run plan): a failed writer lifecycle step leaves a
// durable trace, and the trace can never hold or replace the exit.
const state = vi.hoisted(() => ({ addAlert: vi.fn() }));

vi.mock('../../db.js', () => ({ db: {} }));
vi.mock('../../services/system-alerts.js', () => ({ addAlert: state.addAlert }));

import { readFileSync } from 'node:fs';
import {
  PM2_KILL_TIMEOUT_MS,
  SHUTDOWN_BUDGET_MS,
  XSTOCK_BAR_WRITER_BOOT_ID,
  XSTOCK_LIFECYCLE_TRACE_CEILING_MS,
  recordXstockLifecycleFailure,
} from '../../services/passive-archive/xstock-bar-availability.js';

beforeEach(() => {
  state.addAlert.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('R1 lifecycle trace', () => {
  it('writes one warning row per boot and step, naming the step and the error', async () => {
    state.addAlert.mockResolvedValue({});
    await recordXstockLifecycleFailure('shutdown-archive-handoff',
      new Error('local writer handoff counters do not reconcile'));
    expect(state.addAlert).toHaveBeenCalledTimes(1);
    const row = state.addAlert.mock.calls[0][0];
    expect(row.severity).toBe('warning');
    expect(row.dedupe_key).toBe(`xstock-bar-writer-lifecycle-failure:${XSTOCK_BAR_WRITER_BOOT_ID}:shutdown-archive-handoff`);
    expect(row.metadata.step).toBe('shutdown-archive-handoff');
    expect(row.metadata.error).toContain('do not reconcile');
    expect(row.metadata.bootId).toBe(XSTOCK_BAR_WRITER_BOOT_ID);
  });

  it('never throws when the alert store refuses', async () => {
    state.addAlert.mockRejectedValue(new Error('failed to acquire lock'));
    await expect(recordXstockLifecycleFailure('boot-registration', new Error('x'))).resolves.toBeUndefined();
  });

  it('returns at the ceiling when the alert store hangs, so it cannot hold the exit', async () => {
    vi.useFakeTimers();
    state.addAlert.mockReturnValue(new Promise(() => undefined));
    let settled = false;
    const run = recordXstockLifecycleFailure('shutdown-after-handoff', new Error('y')).then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(XSTOCK_LIFECYCLE_TRACE_CEILING_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    await run;
    expect(settled).toBe(true);
  });

  it('keeps the ceiling above the store lock budget (5 s) and short of a stuck exit', () => {
    expect(XSTOCK_LIFECYCLE_TRACE_CEILING_MS).toBeGreaterThan(5_000);
    expect(XSTOCK_LIFECYCLE_TRACE_CEILING_MS).toBeLessThanOrEqual(10_000);
  });

  it('R1 r2: bounds the write by the deadline when less than the ceiling is left', async () => {
    vi.useFakeTimers();
    state.addAlert.mockReturnValue(new Promise(() => undefined));
    let settled = false;
    const run = recordXstockLifecycleFailure('shutdown-after-handoff', new Error('z'), { deadlineAt: Date.now() + 1_000 })
      .then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(1_001);
    await run;
    expect(settled).toBe(true);
  });

  it('R1 r2: skips the write when the deadline has already passed', async () => {
    await recordXstockLifecycleFailure('shutdown-after-handoff', new Error('late'), { deadlineAt: Date.now() - 1 });
    expect(state.addAlert).not.toHaveBeenCalled();
  });

  it('R1 r2 fence: the budget constant matches PM2 kill_timeout in ecosystem.config.cjs, and both bounded waits fit inside it', async () => {
    const cfg = readFileSync('ecosystem.config.cjs', 'utf8');
    // Exactly ONE kill_timeout in the file (Langston R1 r2 note a): a second app above `dawntrader` would make a
    // first-match read grade the wrong block and still pass.
    const all = [...cfg.matchAll(/kill_timeout:\s*(\d+)/g)];
    expect(all).toHaveLength(1);
    expect(Number(all[0][1])).toBe(PM2_KILL_TIMEOUT_MS);
    expect(SHUTDOWN_BUDGET_MS).toBeLessThan(PM2_KILL_TIMEOUT_MS);
    const { RING_SHUTDOWN_FLUSH_TIMEOUT_MS } = await import('../../asset_classes/xstock_spot/book-state-ring-store.js');
    // Each bounded wait fits inside the budget on its own. This is not what guarantees the exit: the trace's
    // DEADLINE does (min of its ceiling and what is left), so a late failure gets only the time remaining
    // (Langston R1 r2 note b).
    expect(RING_SHUTDOWN_FLUSH_TIMEOUT_MS).toBeLessThan(SHUTDOWN_BUDGET_MS);
    expect(XSTOCK_LIFECYCLE_TRACE_CEILING_MS).toBeLessThan(SHUTDOWN_BUDGET_MS);
  });
});
