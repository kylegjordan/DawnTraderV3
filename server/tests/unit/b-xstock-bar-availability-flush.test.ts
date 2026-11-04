import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  write: vi.fn(),
  repair: vi.fn(async () => 0),
}));

vi.mock('../../db.js', () => ({ db: {} }));
vi.mock('../../services/system-alerts.js', () => ({ addAlert: vi.fn() }));
vi.mock('../../services/passive-archive/xstock-bar-availability.js', () => ({
  writeXstockProjectionAttempts: state.write,
  repairPendingXstockCertificates: state.repair,
  isXstockAdmissionFailure: (error: unknown) => Boolean(
    error instanceof Error && (error as Error & { xstockAdmissionFailed?: boolean }).xstockAdmissionFailed,
  ),
}));

import { addAlert } from '../../services/system-alerts.js';
import {
  RETRY_BUFFER_MAX,
  XSTOCK_STUCK_FLUSH_ALERT_AT,
  isXstockProjectionRetryable,
  bufferOhlcBar,
  flushAssetClass,
  stopBatchWriter,
  upsertOhlcRows,
} from '../../services/passive-archive/ohlc-batch-writer.js';

beforeEach(() => {
  state.write.mockReset();
  state.write.mockImplementation(async (rows: any[]) => ({
    attempts: rows.map((_: unknown, index: number) => ({
      revisionId: String(index),
      projectionApplied: true,
      payloadRepeatedFromWinner: false,
    })),
    certificates: rows.map((_: unknown, index: number) => ({ revisionId: String(index) })),
    certification: 'certified' as const,
  }));
});

afterEach(async () => {
  await stopBatchWriter();
});

describe('xStock logical flush transaction boundary', () => {
  it('sends more than 1000 JSONB rows in one projection call and one population record', async () => {
    const rows = Array.from({ length: 1_001 }, (_, index) => ({
      symbol: `X${index}/USD`,
      intervalBegin: new Date('2026-10-15T00:00:00Z'),
    })) as any[];

    await upsertOhlcRows('xstock_spot', rows, {
      acceptedInputFrames: 1_004,
      bufferSuperseded: 3,
    });

    expect(state.write).toHaveBeenCalledTimes(1);
    expect(state.write).toHaveBeenCalledWith(rows, {
      acceptedInputFrames: 1_004,
      bufferSuperseded: 3,
    });
  });

  it('reuses the same flush ID and snapshot after a transient ambiguous failure', async () => {
    state.write.mockRejectedValueOnce(new Error('connection reset after COMMIT'));
    bufferOhlcBar('xstock_spot', {
      symbol: 'CORZ/USD',
      intervalBegin: new Date('2026-10-15T00:00:00Z'),
    } as any);

    await flushAssetClass('xstock_spot');
    const firstPopulation = state.write.mock.calls[0][1];
    await flushAssetClass('xstock_spot');
    const secondPopulation = state.write.mock.calls[1][1];

    expect(firstPopulation.flushId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(secondPopulation).toEqual(firstPopulation);
    expect(state.write.mock.calls[1][0]).toBe(state.write.mock.calls[0][0]);
  });

  it('retains a snapshot after a normally-permanent admission failure and reuses its flush ID', async () => {
    const admissionError = Object.assign(new Error('column does not exist'), {
      xstockAdmissionFailed: true,
    });
    state.write.mockRejectedValueOnce(admissionError);
    bufferOhlcBar('xstock_spot', {
      symbol: 'CORZ/USD',
      intervalBegin: new Date('2026-10-15T00:00:00Z'),
    } as any);

    await flushAssetClass('xstock_spot');
    const firstPopulation = state.write.mock.calls[0][1];
    await flushAssetClass('xstock_spot');
    const secondPopulation = state.write.mock.calls[1][1];

    expect(secondPopulation).toEqual(firstPopulation);
    expect(state.write.mock.calls[1][0]).toBe(state.write.mock.calls[0][0]);
  });

  it('fail-stops xStock intake at the bound without shedding accepted rows behind a retry', async () => {
    state.write.mockRejectedValueOnce(new Error('connection reset after COMMIT'));
    expect(bufferOhlcBar('xstock_spot', {
      symbol: 'PENDING/USD',
      intervalBegin: new Date('2026-10-15T00:00:00Z'),
    } as any)).toBe(true);
    await flushAssetClass('xstock_spot');

    for (let index = 1; index < RETRY_BUFFER_MAX; index++) {
      expect(bufferOhlcBar('xstock_spot', {
        symbol: `TAIL${index}/USD`,
        intervalBegin: new Date('2026-10-15T00:00:00Z'),
      } as any)).toBe(true);
    }
    expect(bufferOhlcBar('xstock_spot', {
      symbol: 'REFUSED/USD',
      intervalBegin: new Date('2026-10-15T00:00:00Z'),
    } as any)).toBe(false);

    await flushAssetClass('xstock_spot');
    await flushAssetClass('xstock_spot');

    expect(state.write.mock.calls.map((call) => call[0].length)).toEqual([
      1,
      1,
      RETRY_BUFFER_MAX - 1,
    ]);
    expect(state.write.mock.calls.flatMap((call) => call[0])
      .some((row) => row.symbol === 'REFUSED/USD')).toBe(false);
  }, 30_000);

  it('drops a permanently failed snapshot only after its admission-capable write path ran', async () => {
    state.write.mockRejectedValueOnce(new Error('column does not exist'));
    bufferOhlcBar('xstock_spot', {
      symbol: 'MARA/USD',
      intervalBegin: new Date('2026-10-15T00:01:00Z'),
    } as any);

    await flushAssetClass('xstock_spot');
    await flushAssetClass('xstock_spot');
    expect(state.write).toHaveBeenCalledTimes(1);
    expect(state.write.mock.calls[0][1].flushId).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('ends the shutdown drain with two repair calls, so the last one is a fresh run (R5 C1)', async () => {
    state.repair.mockClear();
    await stopBatchWriter();
    expect(state.repair).toHaveBeenCalledTimes(2);
  });

  it('R5d: retains an xStock projection statement timeout and retries the SAME flush ID', async () => {
    state.write.mockRejectedValueOnce(new Error('canceling statement due to statement timeout'));
    bufferOhlcBar('xstock_spot', {
      symbol: 'NVDA/USD',
      intervalBegin: new Date('2026-10-15T00:02:00Z'),
    } as any);

    await flushAssetClass('xstock_spot');
    await flushAssetClass('xstock_spot');
    expect(state.write).toHaveBeenCalledTimes(2);
    expect(state.write.mock.calls[1][1]).toEqual(state.write.mock.calls[0][1]);
    expect(state.write.mock.calls[1][0]).toBe(state.write.mock.calls[0][0]);
  });

  it('R5d: the exemption is xStock-only and timeout-only (#705 keeps its rule elsewhere)', () => {
    const timeout = new Error('canceling statement due to statement timeout');
    expect(isXstockProjectionRetryable('xstock_spot', timeout)).toBe(true);
    expect(isXstockProjectionRetryable('crypto_spot', timeout)).toBe(false);
    expect(isXstockProjectionRetryable('xstock_spot', new Error('column does not exist'))).toBe(false);
    expect(isXstockProjectionRetryable('xstock_spot', new Error('Query read timeout'))).toBe(false);
  });

  it('R5d condition 1: alerts once, naming the flush ID, at the consecutive-failure threshold', async () => {
    vi.mocked(addAlert).mockClear();
    state.write.mockRejectedValue(new Error('canceling statement due to statement timeout'));
    bufferOhlcBar('xstock_spot', {
      symbol: 'AMD/USD',
      intervalBegin: new Date('2026-10-15T00:03:00Z'),
    } as any);
    for (let i = 0; i < XSTOCK_STUCK_FLUSH_ALERT_AT + 3; i += 1) await flushAssetClass('xstock_spot');
    await vi.waitFor(() => expect(vi.mocked(addAlert)).toHaveBeenCalledTimes(1));
    const alert = vi.mocked(addAlert).mock.calls[0][0] as any;
    const flushId = state.write.mock.calls[0][1].flushId;
    expect(alert.dedupe_key).toBe(`xstock-bar-availability-flush-stuck:${flushId}`);
    expect(alert.metadata.consecutiveFailures).toBe(XSTOCK_STUCK_FLUSH_ALERT_AT);

    // A success clears the count: the same number of failures under a NEW flush ID alerts again.
    state.write.mockReset();
    state.write.mockImplementation(async (rows: any[]) => ({
      attempts: rows.map((_: unknown, index: number) => ({
        revisionId: String(index), projectionApplied: true, payloadRepeatedFromWinner: false,
      })),
      certificates: [],
      certification: 'certified' as const,
    }));
    await flushAssetClass('xstock_spot');
    vi.mocked(addAlert).mockClear();
    state.write.mockRejectedValue(new Error('canceling statement due to statement timeout'));
    bufferOhlcBar('xstock_spot', {
      symbol: 'AMD/USD',
      intervalBegin: new Date('2026-10-15T00:04:00Z'),
    } as any);
    for (let i = 0; i < XSTOCK_STUCK_FLUSH_ALERT_AT - 1; i += 1) await flushAssetClass('xstock_spot');
    expect(vi.mocked(addAlert)).not.toHaveBeenCalled();
    await flushAssetClass('xstock_spot');
    await vi.waitFor(() => expect(vi.mocked(addAlert)).toHaveBeenCalledTimes(1));
    state.write.mockReset();
  });

  it('R5d r2: a failed stuck-flush alert releases its claim and the next failure tries again', async () => {
    vi.mocked(addAlert).mockClear();
    vi.mocked(addAlert).mockRejectedValueOnce(new Error('alerts file unwritable'));
    state.write.mockRejectedValue(new Error('canceling statement due to statement timeout'));
    bufferOhlcBar('xstock_spot', {
      symbol: 'TSLA/USD',
      intervalBegin: new Date('2026-10-15T00:05:00Z'),
    } as any);
    for (let i = 0; i < XSTOCK_STUCK_FLUSH_ALERT_AT; i += 1) await flushAssetClass('xstock_spot');
    await vi.waitFor(() => expect(vi.mocked(addAlert)).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 0));
    await flushAssetClass('xstock_spot');
    await vi.waitFor(() => expect(vi.mocked(addAlert)).toHaveBeenCalledTimes(2));
    // Once raised, it stays raised for that flush ID.
    await flushAssetClass('xstock_spot');
    await new Promise((r) => setTimeout(r, 0));
    expect(vi.mocked(addAlert)).toHaveBeenCalledTimes(2);
    state.write.mockReset();
  });
});
