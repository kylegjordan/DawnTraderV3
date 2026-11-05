import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  XSTOCK_SNAPSHOT_CONNECT_TIMEOUT_MS,
  XSTOCK_SNAPSHOT_MIN_INTERVAL_MS,
  XSTOCK_SNAPSHOT_STATEMENT_TIMEOUT_MS,
  __resetXstockSnapshotForTests,
  captureXstockDbSnapshot,
} from '../../services/passive-archive/xstock-db-snapshot.js';

// R6a / C4: the statement-timeout snapshot is best-effort, bounded and rate-limited.
beforeEach(() => __resetXstockSnapshotForTests());

function client(opts: { connectFails?: boolean; rows?: unknown[] } = {}) {
  return {
    connect: vi.fn(async () => { if (opts.connectFails) throw new Error('timeout expired'); }),
    query: vi.fn(async () => ({ rows: opts.rows ?? [{ pid: 1, state: 'idle in transaction', wait_event: 'ClientRead' }] })),
    end: vi.fn(async () => undefined),
  };
}

describe('R6a / C4 database snapshot', () => {
  it('writes one stderr line with the backends, then closes its own connection', async () => {
    const c = client();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await captureXstockDbSnapshot('certify statement timeout', () => c as any, 1_000_000)).toBe(true);
    const line = spy.mock.calls.map((a) => String(a[0])).find((s) => s.includes('[DB_SNAPSHOT]'))!;
    expect(line).toContain('"reason":"certify statement timeout"');
    expect(line).toContain('idle in transaction');
    expect(c.end).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('is rate-limited to one snapshot per minute', async () => {
    const factory = vi.fn(() => client() as any);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await captureXstockDbSnapshot('a', factory, 2_000_000)).toBe(true);
    expect(await captureXstockDbSnapshot('b', factory, 2_000_000 + XSTOCK_SNAPSHOT_MIN_INTERVAL_MS - 1)).toBe(false);
    expect(await captureXstockDbSnapshot('c', factory, 2_000_000 + XSTOCK_SNAPSHOT_MIN_INTERVAL_MS)).toBe(true);
    expect(factory).toHaveBeenCalledTimes(2);
    vi.restoreAllMocks();
  });

  it('never throws: a failed connect logs, still closes, and returns false', async () => {
    const c = client({ connectFails: true });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(captureXstockDbSnapshot('x', () => c as any, 3_000_000)).resolves.toBe(false);
    expect(c.end).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });

  it('uses short, separate timeouts: connect 3 s, statement 2 s', () => {
    expect(XSTOCK_SNAPSHOT_CONNECT_TIMEOUT_MS).toBe(3_000);
    expect(XSTOCK_SNAPSHOT_STATEMENT_TIMEOUT_MS).toBe(2_000);
  });
});
