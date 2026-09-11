/**
 * B-OHLC-FRAME-GUARD (#1028, #1029) — the OHLC frame validator, the skip tracker, and the three producers.
 *
 * Plan P8 (B_OHLC_FRAME_GUARD_PRE_AUDIT.md). Every rejection clause is isolated by its own case so that
 * deleting the clause turns exactly that case red (mutation-proved by hand; recorded in the change list).
 * The `#594` stamp-site twin lives with its siblings in p19-b4a-c3-gate-watchdog.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({
  addAlert: vi.fn(),
  bufferOhlcBar: vi.fn(),
}));

vi.mock('../../db.js', () => ({ db: { execute: vi.fn(), select: vi.fn(), insert: vi.fn() } }));
vi.mock('../../services/system-alerts.js', () => ({ addAlert: (...a: unknown[]) => h.addAlert(...a) }));
vi.mock('../../services/passive-archive/ohlc-batch-writer.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/passive-archive/ohlc-batch-writer.js')>();
  return { ...actual, bufferOhlcBar: (...a: unknown[]) => h.bufferOhlcBar(...a) };
});
vi.mock('../../services/passive-archive/ticker-batch-writer.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/passive-archive/ticker-batch-writer.js')>();
  return { ...actual, bufferTickerSnap: () => true };
});

import { validateOhlcFrame, type OhlcFrameInput } from '../../services/passive-archive/ohlc-frame-validator.js';
import {
  noteOhlcFrameAccepted,
  noteOhlcFrameRejected,
  SKIP_LOG_INTERVAL_MS,
  _resetOhlcFrameSkipTrackerForTests,
  _getOhlcFrameStreakForTests,
  _isOhlcFrameAlertLatchedForTests,
} from '../../services/passive-archive/ohlc-frame-skip-tracker.js';
import { ALERT_RE_ARM_MS } from '../../services/passive-archive/ohlc-batch-writer.js';
import { _seedModuleCacheForTests, clearModuleConstantsCache } from '../../services/module-constants-service.js';
import {
  _handleMessageForTests,
  _setArchiverStateForTest,
  _getArchiverCountersForTest,
  _getArchiverClocksForTest,
} from '../../services/passive-archive/equity-spot-archiver.js';
import { _makeShardForTests, _handleCryptoMessageForTests } from '../../services/passive-archive/crypto-spot-archiver.js';
import { KrakenFuturesArchiver } from '../../services/passive-archive/kraken-futures-archiver.js';

const GOOD: OhlcFrameInput = {
  symbol: 'AAPL/USD', intervalBegin: '2026-07-31T09:00:00Z',
  open: 1, high: 2, low: 1, close: 2, volume: '0', vwap: undefined, trades: undefined,
};
const verdictOf = (over: Partial<OhlcFrameInput>) => validateOhlcFrame({ ...GOOD, ...over });
const rejectOf = (over: Partial<OhlcFrameInput>) => {
  const v = verdictOf(over);
  return v.ok ? null : { field: v.field, reason: v.reason };
};
const settle = async () => { await vi.dynamicImportSettled(); await new Promise((r) => setTimeout(r, 10)); };
const frame = (o: unknown) => Buffer.from(JSON.stringify(o));

beforeEach(() => {
  _resetOhlcFrameSkipTrackerForTests();
  clearModuleConstantsCache();
  h.addAlert.mockReset().mockResolvedValue({});
  h.bufferOhlcBar.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('validateOhlcFrame — accepts', () => {
  it('the #594 fence frame (no volume/vwap/trades, volume defaulted before validation — J6)', () => {
    const v = verdictOf({});
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.row).toMatchObject({ symbol: 'AAPL/USD', open: '1', close: '2', volume: '0', vwap: null, tradeCount: null });
      expect(v.row.intervalBegin.toISOString()).toBe('2026-07-31T09:00:00.000Z');
    }
  });
  it('keeps a valid string BYTE-IDENTICAL, never re-formatted through Number', () => {
    const v = verdictOf({ open: '123.45000000', vwap: '0000123.4', volume: '1e-7', trades: '12' });
    expect(v.ok && [v.row.open, v.row.vwap, v.row.volume, v.row.tradeCount]).toEqual(['123.45000000', '0000123.4', '1e-7', 12]);
  });
  it('admits zero and negatives', () => {
    expect(verdictOf({ open: 0, low: -1, close: '-0', volume: 0 }).ok).toBe(true);
  });
  it.each(['1e3', '1E+03', '.5', '5.', '+5', '-5', '1e-7'])('plain decimal string %s', (s) => {
    expect(verdictOf({ close: s }).ok).toBe(true);
  });
});

describe('validateOhlcFrame — each rejection clause, isolated', () => {
  it('(0) symbol', () => {
    expect(rejectOf({ symbol: undefined })).toEqual({ field: 'symbol', reason: 'absent' });
    expect(rejectOf({ symbol: '' })).toEqual({ field: 'symbol', reason: 'empty' });
    expect(rejectOf({ symbol: 5 })).toEqual({ field: 'symbol', reason: 'not_number_or_string' });
  });
  it('(1) type gate — never coerces false / [] / {} to a number', () => {
    for (const bad of [false, [], {}]) expect(rejectOf({ high: bad })).toEqual({ field: 'high', reason: 'not_number_or_string' });
  });
  it('(1) absent and empty', () => {
    expect(rejectOf({ low: undefined })).toEqual({ field: 'low', reason: 'absent' });
    expect(rejectOf({ low: null })).toEqual({ field: 'low', reason: 'absent' });
    expect(rejectOf({ low: '' })).toEqual({ field: 'low', reason: 'empty' });
    expect(rejectOf({ low: '   ' })).toEqual({ field: 'low', reason: 'empty' });
  });
  it('(1b) decimal gate — the strings JS Number() reads and the database refuses (C1, probed on PG 17.6)', () => {
    for (const s of ['12 ', '﻿12', '　12']) {
      expect(Number.isFinite(Number(s))).toBe(true); // the hazard: JS reads 12
      expect(rejectOf({ close: s })).toEqual({ field: 'close', reason: 'not_decimal' });
    }
  });
  it('(1b) decimal gate — non-decimal forms, padding and words', () => {
    for (const s of ['0x10', '0b101', '0o17', '1_000', ' 12', '12 ', '\t12', 'undefined', 'null', 'NaN', 'Infinity', '1,000', '12abc']) {
      expect(rejectOf({ open: s })).toEqual({ field: 'open', reason: 'not_decimal' });
    }
  });
  it('(3) finite — a NaN / Infinity number, and a decimal string that overflows a double', () => {
    expect(rejectOf({ close: Number.NaN })).toEqual({ field: 'close', reason: 'not_finite' });
    expect(rejectOf({ close: -Infinity })).toEqual({ field: 'close', reason: 'not_finite' });
    expect(rejectOf({ close: '1e999' })).toEqual({ field: 'close', reason: 'not_finite' });
  });
  it('(4) column bounds — prices below 10^12, volume below 10^20', () => {
    expect(rejectOf({ high: 1e12 })).toEqual({ field: 'high', reason: 'out_of_range' });
    expect(rejectOf({ high: '999999999999.999999995' })).toEqual({ field: 'high', reason: 'out_of_range' });
    expect(verdictOf({ high: 999_999_999_999 }).ok).toBe(true);
    expect(rejectOf({ volume: 1e20 })).toEqual({ field: 'volume', reason: 'out_of_range' });
    expect(verdictOf({ volume: 1e19 }).ok).toBe(true);
    expect(rejectOf({ vwap: '1e12' })).toEqual({ field: 'vwap', reason: 'out_of_range' });
  });
  it('(5) trades — integer inside int4, null passes', () => {
    expect(verdictOf({ trades: null }).ok).toBe(true);
    expect(rejectOf({ trades: 1.5 })).toEqual({ field: 'trades', reason: 'not_integer' });
    expect(rejectOf({ trades: 2_147_483_648 })).toEqual({ field: 'trades', reason: 'out_of_range' });
  });
  it('(6) intervalBegin — a finite time', () => {
    expect(rejectOf({ intervalBegin: undefined })).toEqual({ field: 'intervalBegin', reason: 'absent' });
    expect(rejectOf({ intervalBegin: '' })).toEqual({ field: 'intervalBegin', reason: 'empty' });
    expect(rejectOf({ intervalBegin: 'not-a-date' })).toEqual({ field: 'intervalBegin', reason: 'invalid_time' });
    expect(rejectOf({ intervalBegin: Number.NaN })).toEqual({ field: 'intervalBegin', reason: 'invalid_time' });
    expect(rejectOf({ intervalBegin: true })).toEqual({ field: 'intervalBegin', reason: 'not_number_or_string' });
  });
  it('reports the FIRST failing field, symbol before values', () => {
    expect(rejectOf({ symbol: '', close: 'NaN' })).toEqual({ field: 'symbol', reason: 'empty' });
  });
});

describe('skip tracker — P4 throttled log (C2)', () => {
  it('one line per producer:class per window, then reports how many it suppressed', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const warn = console.warn as unknown as ReturnType<typeof vi.fn>;
    for (let i = 0; i < 3; i++) {
      noteOhlcFrameRejected('equity-spot', 'xstock_spot', { symbol: 'A/USD', intervalBegin: 60_000 * i }, { field: 'close', reason: 'not_finite' });
    }
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('(+0 suppressed since last line)');
    now.mockReturnValue(1_000_000 + SKIP_LOG_INTERVAL_MS);
    noteOhlcFrameRejected('equity-spot', 'xstock_spot', { symbol: 'A/USD', intervalBegin: 999_000 }, { field: 'close', reason: 'not_finite' });
    expect(warn).toHaveBeenCalledTimes(2);
    expect(String(warn.mock.calls[1][0])).toMatch(/symbol=A\/USD field=close reason=not_finite \(\+2 suppressed since last line\)/);
  });
});

describe('skip tracker — P5 sustained-skip escalation (C1, C6)', () => {
  const reject = (symbol: string, minute: number | string, cls: 'xstock_spot' | 'crypto_perp' = 'xstock_spot') =>
    noteOhlcFrameRejected('equity-spot', cls, { symbol, intervalBegin: minute }, { field: 'close', reason: 'not_finite' });

  it('counts DISTINCT bars: a re-sent minute (in either time form) does not advance the streak', () => {
    reject('A/USD', '2026-07-31T09:00:00Z');
    reject('A/USD', '2026-07-31T09:00:00.000Z');
    reject('A/USD', Date.parse('2026-07-31T09:00:00Z'));
    expect(_getOhlcFrameStreakForTests('xstock_spot', 'A/USD')).toBe(1);
    reject('A/USD', '2026-07-31T09:01:00Z');
    expect(_getOhlcFrameStreakForTests('xstock_spot', 'A/USD')).toBe(2);
  });
  it('an accepted bar resets that symbol', () => {
    reject('A/USD', 1); reject('A/USD', 2);
    noteOhlcFrameAccepted('xstock_spot', 'A/USD');
    expect(_getOhlcFrameStreakForTests('xstock_spot', 'A/USD')).toBe(0);
  });
  it('raises ONCE per class at the cold default (10), with the per-class dedupe key', async () => {
    for (let m = 0; m < 12; m++) reject('A/USD', m * 60_000);
    await settle();
    expect(h.addAlert).toHaveBeenCalledTimes(1);
    expect(h.addAlert.mock.calls[0][0]).toMatchObject({
      category: 'breakage', severity: 'warning', dedupe_key: 'ohlc-frame-skip-sustained-xstock_spot',
      metadata: expect.objectContaining({ threshold: 10, symbolsOverThreshold: 1, suggested_owner: 'CC-C' }),
    });
    expect(String(h.addAlert.mock.calls[0][0].body)).toContain('A/USD (close: not_finite)');
  });
  it('9 distinct bars do not raise (the threshold is the count, not one less)', async () => {
    for (let m = 0; m < 9; m++) reject('A/USD', m * 60_000);
    await settle();
    expect(h.addAlert).not.toHaveBeenCalled();
  });
  it('releases the latch when the raise FAILS, so the next rejection tries again', async () => {
    h.addAlert.mockReset().mockRejectedValueOnce(new Error('disk full')).mockResolvedValue({});
    for (let m = 0; m < 10; m++) reject('A/USD', m * 60_000);
    await settle();
    expect(_isOhlcFrameAlertLatchedForTests('xstock_spot')).toBe(false);
    reject('A/USD', 11 * 60_000);
    await settle();
    expect(h.addAlert).toHaveBeenCalledTimes(2);
  });
  it('re-arms after ALERT_RE_ARM_MS while the fault persists', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(5_000_000);
    for (let m = 0; m < 10; m++) reject('A/USD', m * 60_000);
    reject('A/USD', 10 * 60_000);
    await settle();
    expect(h.addAlert).toHaveBeenCalledTimes(1);
    now.mockReturnValue(5_000_000 + ALERT_RE_ARM_MS);
    reject('A/USD', 11 * 60_000);
    await settle();
    expect(h.addAlert).toHaveBeenCalledTimes(2);
  });
  it('clears the latch once no symbol in the class is still at the threshold (BLOCKER-11 rule)', async () => {
    for (let m = 0; m < 10; m++) reject('A/USD', m * 60_000);
    await settle();
    expect(_isOhlcFrameAlertLatchedForTests('xstock_spot')).toBe(true);
    noteOhlcFrameAccepted('xstock_spot', 'A/USD');
    expect(_isOhlcFrameAlertLatchedForTests('xstock_spot')).toBe(false);
  });
  it('classes do not share a latch or a streak', async () => {
    for (let m = 0; m < 10; m++) reject('A/USD', m * 60_000, 'xstock_spot');
    for (let m = 0; m < 10; m++) reject('A/USD', m * 60_000, 'crypto_perp');
    await settle();
    expect(h.addAlert.mock.calls.map((c) => c[0].dedupe_key).sort())
      .toEqual(['ohlc-frame-skip-sustained-crypto_perp', 'ohlc-frame-skip-sustained-xstock_spot']);
  });
  it('C6: reads the passive_archive knob when warm; an unusable value falls back to 10 and SAYS so', async () => {
    const row = (value: unknown) => ({
      moduleName: 'passive_archive', exchange: '*', assetClass: '*', strategy: '*', regime: '*',
      constantName: 'ohlc_frame_skip_alert_streak', value,
    });
    _seedModuleCacheForTests('passive_archive', [row(3)] as any);
    for (let m = 0; m < 3; m++) reject('A/USD', m * 60_000);
    await settle();
    expect(h.addAlert).toHaveBeenCalledTimes(1);

    _resetOhlcFrameSkipTrackerForTests();
    h.addAlert.mockClear();
    _seedModuleCacheForTests('passive_archive', [row('3')] as any);
    for (let m = 0; m < 3; m++) reject('B/USD', m * 60_000);
    await settle();
    expect(h.addAlert).not.toHaveBeenCalled();
    expect((console.warn as unknown as ReturnType<typeof vi.fn>).mock.calls.some((c) => String(c[0]).includes('not a positive integer'))).toBe(true);
  });
});

describe('producers — the counters (#1029)', () => {
  const badBar = { symbol: 'AAPL/USD', interval_begin: '2026-07-31T09:00:00Z', open: 1, high: 2, low: 1, close: 'NaN' };
  const goodBar = { symbol: 'AAPL/USD', interval_begin: '2026-07-31T09:01:00Z', open: 1, high: 2, low: 1, close: 2 };

  it('xStock spot: rejected → scanned+1 skipped+1 persisted 0, no buffer, no data stamp; accepted → scanned+1 persisted+1', () => {
    _setArchiverStateForTest({ enabled: true, lastMsgAt: 1_000, lastDataMsgAt: 2_000, cumulativeOhlcRows: 0, cumulativeTickerSnaps: 0, ohlcFramesSkipped: 0, rowsPersistedLastMinute: 0 });
    _handleMessageForTests(frame({ channel: 'ohlc', data: [badBar] }));
    expect(_getArchiverCountersForTest()).toMatchObject({ scanned: 1, skipped: 1, persisted: 0 });
    expect(h.bufferOhlcBar).not.toHaveBeenCalled();
    expect(_getArchiverClocksForTest().lastDataMsgAt).toBe(2_000);
    _handleMessageForTests(frame({ channel: 'ohlc', data: [goodBar] }));
    expect(_getArchiverCountersForTest()).toMatchObject({ scanned: 2, skipped: 1, persisted: 1 });
    expect(h.bufferOhlcBar).toHaveBeenCalledTimes(1);
    expect(h.bufferOhlcBar.mock.calls[0][1]).toMatchObject({ symbol: 'AAPL/USD', exchange: 'kraken-equities', close: '2', volume: '0' });
  });
  it('xStock spot: a symbol-less ticker snap is still scanned', () => {
    _setArchiverStateForTest({ cumulativeTickerSnaps: 0 });
    _handleMessageForTests(frame({ channel: 'ticker', data: [{ bid: 1, ask: 2 }] }));
    expect(_getArchiverCountersForTest().tickerScanned).toBe(1);
  });
  it('crypto spot: scanned is unconditional, persisted follows the return value, a rejection is skipped', () => {
    const sh = _makeShardForTests();
    _handleCryptoMessageForTests(sh, frame({ channel: 'ohlc', data: [badBar, goodBar] }));
    expect([sh.cumulativeOhlcRows, sh.rowsPersistedLastMinute, sh.ohlcFramesSkipped]).toEqual([2, 1, 1]);
    _handleCryptoMessageForTests(sh, frame({ channel: 'ticker', data: [{ bid: 1 }] }));
    expect(sh.cumulativeTickerSnaps).toBe(1);
  });
});

describe('producers — futures poll (both perp legs)', () => {
  const candle = (time: number, over: Record<string, unknown> = {}) =>
    ({ time, open: '1', high: '2', low: '1', close: '2', volume: '3', ...over });
  const serve = (candles: unknown[]) =>
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ candles }) })));
  const make = (assetClass: 'xstock_perp' | 'crypto_perp') =>
    new KrakenFuturesArchiver({ assetClass, legLabel: 'test', loadUniverse: async () => [] });
  const poll = (a: KrakenFuturesArchiver, sym = 'PF_XBTUSD'): Promise<number> => (a as any).pollOhlcOnce(sym);
  const mark = (a: KrakenFuturesArchiver, sym = 'PF_XBTUSD') => (a as any).lastOhlcInterval.get(sym);

  it('a null candle among good ones: no throw, good ones buffered once, the mark advanced as today', async () => {
    const a = make('crypto_perp');
    serve([candle(60_000), null, candle(120_000)]);
    await expect(poll(a)).resolves.toBe(2);
    expect(a.getStats()).toMatchObject({ cumulativeOhlcRows: 3, ohlcFramesSkipped: 1 });
    expect(mark(a)).toBe(120_000);
    expect(h.bufferOhlcBar).toHaveBeenCalledTimes(2);
  });
  it('a rejected NEWEST candle leaves the mark unchanged and is re-evaluated next poll', async () => {
    const a = make('crypto_perp');
    serve([candle(60_000), candle(120_000, { close: 'NaN' })]);
    await expect(poll(a)).resolves.toBe(1);
    expect(mark(a)).toBe(60_000);
    await expect(poll(a)).resolves.toBe(0);
    expect(mark(a)).toBe(60_000);
    expect(a.getStats()).toMatchObject({ cumulativeOhlcRows: 3, ohlcFramesSkipped: 2 });
  });
  it('every candle failing the same field (a rename) alerts ONCE across repeated polls', async () => {
    const a = make('crypto_perp');
    serve(Array.from({ length: 12 }, (_, i) => candle((i + 1) * 60_000, { open: undefined })));
    await poll(a);
    await poll(a);
    await settle();
    expect(h.addAlert).toHaveBeenCalledTimes(1);
    expect(h.addAlert.mock.calls[0][0].dedupe_key).toBe('ohlc-frame-skip-sustained-crypto_perp');
    expect(a.getStats()).toMatchObject({ cumulativeOhlcRows: 24, ohlcFramesSkipped: 24 });
  });
  it('two instances do not cross-talk', async () => {
    const x = make('xstock_perp');
    const c = make('crypto_perp');
    serve([candle(60_000, { close: 'NaN' })]);
    await poll(x);
    expect(x.getStats().ohlcFramesSkipped).toBe(1);
    expect(c.getStats().ohlcFramesSkipped).toBe(0);
    expect(_getOhlcFrameStreakForTests('xstock_perp', 'PF_XBTUSD')).toBe(1);
    expect(_getOhlcFrameStreakForTests('crypto_perp', 'PF_XBTUSD')).toBe(0);
  });
  it('C5: a fetch that throws still lands in the catch and moves no counter', async () => {
    const a = make('crypto_perp');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNRESET'); }));
    await expect(poll(a)).resolves.toBe(0);
    expect(a.getStats()).toMatchObject({ cumulativeOhlcRows: 0, ohlcFramesSkipped: 0 });
  });
});
