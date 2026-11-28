import type { QueryResult } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { claimAndRestoreRings } from '../../asset_classes/xstock_spot/book-state-ring-boot.js';

vi.mock('../../db.js', () => ({ pool: {} }));

const result = (rows: Record<string, unknown>[] = [], command = 'SELECT'): QueryResult => ({
  command, rowCount: rows.length, rows, oid: 0, fields: [],
});

afterEach(() => vi.useRealTimers());

describe('retained-ring startup budget', () => {
  it('includes checkout and discards a client that arrives after the deadline', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const client = { query: vi.fn(), release: vi.fn() };
    const checkout = vi.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 101));
      return client;
    });
    const boot = claimAndRestoreRings(checkout, 100);
    const failed = expect(boot).rejects.toThrow('boot deadline expired');
    await vi.advanceTimersByTimeAsync(100);
    await failed;
    expect(client.release).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(client.release).toHaveBeenCalledExactlyOnceWith(true);
    expect(client.query).not.toHaveBeenCalled();
    expect(checkout).toHaveBeenCalledTimes(1);
  });

  it('includes a hung ring read and never commits or reclaims after expiry', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce(result([], 'BEGIN'))
        .mockResolvedValueOnce(result([{ generation: '0' }]))
        .mockResolvedValueOnce(result([{ generation: '1' }], 'UPDATE'))
        .mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve(result()), 120))),
      release: vi.fn(),
    };
    const checkout = vi.fn(async () => client);
    const boot = claimAndRestoreRings(checkout, 100);
    const failed = expect(boot).rejects.toThrow('boot deadline expired');
    await vi.advanceTimersByTimeAsync(120);
    await failed;
    expect(client.release).toHaveBeenCalledExactlyOnceWith(true);
    expect(client.query.mock.calls.map(([statement]) => statement)).toEqual([
      'BEGIN ISOLATION LEVEL READ COMMITTED',
      expect.stringContaining('SELECT generation::text'),
      expect.stringContaining('UPDATE'),
      expect.stringContaining('FROM xstock_book_state_rings'),
    ]);
    expect(checkout).toHaveBeenCalledTimes(1);
  });

  it('never extends the budget for a slow primary read after an ambiguous commit', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const claimingClient = {
      query: vi.fn()
        .mockResolvedValueOnce(result([], 'BEGIN'))
        .mockResolvedValueOnce(result([{ generation: '0' }]))
        .mockResolvedValueOnce(result([{ generation: '1' }], 'UPDATE'))
        .mockResolvedValueOnce(result([{ symbol: 'LATE/USD' }]))
        .mockImplementationOnce(() => new Promise(() => {})),
      release: vi.fn(),
    };
    const recoveryClient = {
      query: vi.fn()
        .mockResolvedValueOnce(result([], 'BEGIN'))
        .mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve(result()), 51))),
      release: vi.fn(),
    };
    const checkout = vi.fn().mockResolvedValueOnce(claimingClient).mockResolvedValueOnce(recoveryClient);
    const boot = claimAndRestoreRings(checkout, 100);
    const failed = expect(boot).rejects.toThrow('boot deadline expired');
    await vi.advanceTimersByTimeAsync(100);
    await failed;
    expect(claimingClient.release).toHaveBeenCalledExactlyOnceWith(true);
    expect(recoveryClient.release).toHaveBeenCalledExactlyOnceWith(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(recoveryClient.query).toHaveBeenCalledTimes(2);
    expect(checkout).toHaveBeenCalledTimes(2);
  });
});
