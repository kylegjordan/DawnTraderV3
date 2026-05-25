/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B-NEW-44 — equity-spot-archiver diagnostic observability tests
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Locks the rate-limited-non-data-message-logger added to equity-spot-archiver
 * so the diagnostic remains useful long-term without flooding logs.
 *
 * Reference: `Claude Comms and Packages/Langston Design Asks/B_NEW_36_XSTOCK_OHLC_DIAGNOSTIC_2026-05-25.md`
 * ═════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  _resetDiagNonDataState,
  _logDiagNonDataMessageForTests as logDiagNonDataMessage,
} from '../../services/passive-archive/equity-spot-archiver.js';

describe('B-NEW-44 equity-spot diagnostic logger', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    _resetDiagNonDataState();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.useFakeTimers();
  });

  afterEach(() => {
    logSpy.mockRestore();
    vi.useRealTimers();
  });

  it('logs a non-data message on first occurrence with key prefix', () => {
    logDiagNonDataMessage({ method: 'subscribe', result: { channel: 'ohlc', success: true } });
    expect(logSpy).toHaveBeenCalledTimes(1);
    const line = logSpy.mock.calls[0]?.[0] as string;
    expect(line).toMatch(/\[B74\]\[equity-spot\]\[DIAG\]/);
    expect(line).toMatch(/key=method:subscribe/);
  });

  it('suppresses repeated messages with same key within 60s window', () => {
    logDiagNonDataMessage({ method: 'subscribe' });
    logDiagNonDataMessage({ method: 'subscribe' });
    logDiagNonDataMessage({ method: 'subscribe' });
    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it('logs again after the 60s rate-limit window elapses', () => {
    logDiagNonDataMessage({ method: 'subscribe' });
    vi.advanceTimersByTime(60_001);
    logDiagNonDataMessage({ method: 'subscribe' });
    expect(logSpy).toHaveBeenCalledTimes(2);
  });

  it('differentiates keys: method vs error vs channel vs other', () => {
    logDiagNonDataMessage({ method: 'subscribe' });
    logDiagNonDataMessage({ error: { code: 'RateLimit', message: 'too many' } });
    logDiagNonDataMessage({ channel: 'heartbeat' });
    logDiagNonDataMessage({ unknownShape: true });
    expect(logSpy).toHaveBeenCalledTimes(4);
    const keys = logSpy.mock.calls.map((c) => (c[0] as string).match(/key=([^\)]+)\)/)?.[1]);
    expect(keys).toEqual(['method:subscribe', 'error:RateLimit', 'channel:heartbeat', 'other']);
  });

  it('truncates payloads longer than 800 chars and notes the truncation', () => {
    const bigPayload = { method: 'subscribe', filler: 'x'.repeat(2000) };
    logDiagNonDataMessage(bigPayload);
    const line = logSpy.mock.calls[0]?.[0] as string;
    expect(line).toMatch(/\.\.\.\[truncated \d+b\]/);
    // The line should not contain the full filler — confirm truncation actually happened.
    expect(line.length).toBeLessThan(1500);
  });

  it('does not throw on unserializable input', () => {
    const circular: any = {};
    circular.self = circular;
    expect(() => logDiagNonDataMessage(circular)).not.toThrow();
    expect(logSpy).toHaveBeenCalledTimes(1);
    const line = logSpy.mock.calls[0]?.[0] as string;
    expect(line).toMatch(/<unserializable>/);
  });
});
