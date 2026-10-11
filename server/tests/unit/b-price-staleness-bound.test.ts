/**
 * B-PRICE-STALENESS-BOUND (sprint row 33, `#743` route B) — the archiver half.
 *   P1  — a `snapshot` frame (the venue replaying a book on a subscribe) never refreshes the mark's AGE: with a prior
 *         entry its `tsMs` and `observed` carry; an `update` frame refreshes both.
 *   P1b — a snapshot with NO prior entry births a COLD mark: `observed: false`, `tsMs` = the replay's receipt time.
 *   P2  — the stall watchdog does not count the weekend close or the Sunday reopen pause as silence: it fires neither at
 *         Sunday 20:00 ET nor at ~20:13 ET (both measured weekly in stderr), and still fires on a real outage after 20:35.
 * The engine half (the cold state at the exit gate) is driven through the real exit loop in
 * `b-xstock-bid-trigger-reland-inc2-chain.test.ts`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const alertSpy = vi.fn();
vi.mock('../../db.js', () => ({ db: { execute: vi.fn(), select: vi.fn(), insert: vi.fn() } }));
vi.mock('../../services/system-alerts.js', () => ({ addAlert: (...a: unknown[]) => { alertSpy(...a); return Promise.resolve({}); } }));
vi.mock('../../services/passive-archive/ohlc-batch-writer.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/passive-archive/ohlc-batch-writer.js')>();
  return { ...actual, bufferOhlcBar: () => true };
});
vi.mock('../../services/passive-archive/ticker-batch-writer.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/passive-archive/ticker-batch-writer.js')>();
  return { ...actual, bufferTickerSnap: () => true };
});
vi.mock('../../asset_classes/xstock_spot/fill-safety-config.js', () => ({
  resolveXstockFillSafetyConfig: async () => ({
    activeFillMaxAgeMs: 15000,
    liquidFillWindowOpenMinEt: 570,
    liquidFillWindowCloseMinEt: 960,
    stallReconnectMsRth: 75000,
    stallReconnectMsOffrth: 750000,
  }),
}));

import {
  _handleMessageForTests, getLatestEquityTick, runStallWatchdogTick, _setArchiverStateForTest,
} from '../../services/passive-archive/equity-spot-archiver.js';

const frame = (type: string, symbol: string, bid: number, ask: number) =>
  Buffer.from(JSON.stringify({ channel: 'ticker', type, data: [{ symbol, bid, ask, last: (bid + ask) / 2 }] }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  alertSpy.mockClear();
});
afterEach(() => vi.useRealTimers());

describe('P1/P1b — a replayed book never refreshes the mark age', () => {
  it('a snapshot with no prior entry births a COLD mark at the replay receipt time', () => {
    vi.setSystemTime(new Date('2026-10-14T15:00:00Z'));
    _handleMessageForTests(frame('snapshot', 'COLDA/USD', 100, 101));
    const t = getLatestEquityTick('COLDA/USD')!;
    expect(t.observed).toBe(false);
    expect(t.tsMs).toBe(Date.parse('2026-10-14T15:00:00Z'));
    expect(t.price).toBe(100.5);
  });

  it('an update observes the mark; a LATER snapshot updates the price but carries the age and the flag (the PLTR shape)', () => {
    vi.setSystemTime(new Date('2026-10-14T15:00:00Z'));
    _handleMessageForTests(frame('update', 'CARRY/USD', 200, 202));
    const t0 = Date.parse('2026-10-14T15:00:00Z');
    expect(getLatestEquityTick('CARRY/USD')).toMatchObject({ observed: true, tsMs: t0, price: 201 });
    vi.setSystemTime(new Date('2026-10-15T11:48:00Z')); // ~20.8 h later, a resubscribe replays the book
    _handleMessageForTests(frame('snapshot', 'CARRY/USD', 191, 213.8));
    const t = getLatestEquityTick('CARRY/USD')!;
    expect(t.tsMs).toBe(t0);          // the age is NOT refreshed …
    expect(t.observed).toBe(true);
    expect(t.price).toBe(202.4);      // … though the price and sides are the venue's current state
    expect(t.raw?.bid).toBe(191);
  });

  it('a snapshot on a COLD mark keeps it cold and keeps its first replay time', () => {
    vi.setSystemTime(new Date('2026-10-14T15:00:00Z'));
    _handleMessageForTests(frame('snapshot', 'COLDB/USD', 50, 51));
    vi.setSystemTime(new Date('2026-10-14T15:30:00Z'));
    _handleMessageForTests(frame('snapshot', 'COLDB/USD', 50, 51));
    expect(getLatestEquityTick('COLDB/USD')).toMatchObject({ observed: false, tsMs: Date.parse('2026-10-14T15:00:00Z') });
  });

  it('CONTROL: an update refreshes the age', () => {
    vi.setSystemTime(new Date('2026-10-14T15:00:00Z'));
    _handleMessageForTests(frame('snapshot', 'CTRL/USD', 10, 11));
    vi.setSystemTime(new Date('2026-10-14T15:00:05Z'));
    _handleMessageForTests(frame('update', 'CTRL/USD', 10, 11));
    expect(getLatestEquityTick('CTRL/USD')).toMatchObject({ observed: true, tsMs: Date.parse('2026-10-14T15:00:05Z') });
  });
});

describe('P2 — the stall watchdog does not count a venue closure as feed silence', () => {
  // Sunday 2026-10-11 20:00 ET (EDT) = 2026-10-12T00:00Z. Last data: Friday close.
  const FRI_CLOSE = Date.parse('2026-10-10T00:00:00Z');
  function arm(close: ReturnType<typeof vi.fn>, closureSeenAt = 0) {
    _setArchiverStateForTest({
      enabled: true, reconnectPending: false, lastMsgAt: FRI_CLOSE, lastDataMsgAt: FRI_CLOSE, closureSeenAt,
      ws: { readyState: 1, close } as any,
    });
  }
  async function at(iso: string) {
    const d = new Date(iso);
    vi.setSystemTime(d);
    await runStallWatchdogTick(d);
  }

  it('no fire at Sunday 20:00 or ~20:13 ET; armed after the pause on the unchanged threshold; a real outage still fires', async () => {
    const close = vi.fn();
    arm(close);
    await at('2026-10-11T18:00:00Z'); // Sun 14:00 ET — the weekend close
    await at('2026-10-12T00:00:16Z'); // Sun 20:00:16 ET — measured fire #1 (09-28)
    await at('2026-10-12T00:13:16Z'); // Sun 20:13:16 ET — measured fire #2
    await at('2026-10-12T00:34:30Z'); // the last pause tick
    expect(close).not.toHaveBeenCalled();
    await at('2026-10-12T00:40:00Z'); // 330 s after the pause, still no data: under 750 s
    expect(close).not.toHaveBeenCalled();
    await at('2026-10-12T00:47:01Z'); // 751 s after the pause with no data: a real outage
    expect(close).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledTimes(1);
  });

  it('CONTROL: with no closure remembered, the same 20:40 ET tick fires (the measured weekly false page)', async () => {
    const close = vi.fn();
    arm(close, 0);
    await at('2026-10-12T00:40:00Z');
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('a weekday outage is unaffected by an old closure stamp', async () => {
    const close = vi.fn();
    const wedNoon = Date.parse('2026-10-14T16:00:00Z');
    _setArchiverStateForTest({
      enabled: true, reconnectPending: false, lastMsgAt: wedNoon - 200_000, lastDataMsgAt: wedNoon - 200_000,
      closureSeenAt: Date.parse('2026-10-12T00:34:30Z'), ws: { readyState: 1, close } as any,
    });
    await at('2026-10-14T16:00:00Z'); // Wed 12:00 ET, regular session: 200 s silent > 75 s
    expect(close).toHaveBeenCalledTimes(1);
  });
});
