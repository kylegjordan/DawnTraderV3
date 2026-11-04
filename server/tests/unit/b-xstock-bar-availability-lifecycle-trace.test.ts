import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// R1 (B-XSTOCK-BAR-AVAILABILITY Step 9 re-run plan): a failed writer lifecycle step leaves a
// durable trace, and the trace can never hold or replace the exit.
const state = vi.hoisted(() => ({ addAlert: vi.fn() }));

vi.mock('../../db.js', () => ({ db: {} }));
vi.mock('../../services/system-alerts.js', () => ({ addAlert: state.addAlert }));

import {
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
});
