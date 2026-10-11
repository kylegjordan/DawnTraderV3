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
import { judgeExitPriceAge, CRYPTO_EXIT_PRICE_MAX_AGE_MS } from '../../core/trading/exit-price-age.js';
import { ageExemptionOfProducer, AGE_EXEMPTION_BY_PRODUCER } from '../../services/market-data/price-basis.js';
import { classifyReserveRow, runReserveRowTripwire, type ReserveRow } from '../../services/reserve-row-tripwire.js';

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

  it('BLOCKER-1 polarity: a frame of any type other than update never refreshes the age (an untyped frame included)', () => {
    vi.setSystemTime(new Date('2026-10-14T15:00:00Z'));
    _handleMessageForTests(frame('update', 'POLAR/USD', 10, 11));
    vi.setSystemTime(new Date('2026-10-14T16:00:00Z'));
    _handleMessageForTests(Buffer.from(JSON.stringify({ channel: 'ticker', data: [{ symbol: 'POLAR/USD', bid: 12, ask: 13, last: 12.5 }] })));
    _handleMessageForTests(frame('mystery', 'POLAR/USD', 12, 13));
    expect(getLatestEquityTick('POLAR/USD')).toMatchObject({ observed: true, tsMs: Date.parse('2026-10-14T15:00:00Z'), price: 12.5 });
    // and with no prior entry, an untyped frame births a COLD mark, never an observed one
    _handleMessageForTests(Buffer.from(JSON.stringify({ channel: 'ticker', data: [{ symbol: 'POLAR2/USD', bid: 1, ask: 2, last: 1.5 }] })));
    expect(getLatestEquityTick('POLAR2/USD')!.observed).toBe(false);
  });

  it('CONDITION-3: a frame with NO mark (the #636 branch) carries tsMs and observed — cold stays cold, observed stays observed', () => {
    vi.setSystemTime(new Date('2026-10-14T15:00:00Z'));
    _handleMessageForTests(frame('snapshot', 'NOMARK1/USD', 20, 21));   // cold
    _handleMessageForTests(frame('update', 'NOMARK2/USD', 30, 31));     // observed
    vi.setSystemTime(new Date('2026-10-14T15:10:00Z'));
    const markless = (symbol: string) => Buffer.from(JSON.stringify({ channel: 'ticker', type: 'update', data: [{ symbol, bid: null, ask: null, last: null }] }));
    _handleMessageForTests(markless('NOMARK1/USD'));
    _handleMessageForTests(markless('NOMARK2/USD'));
    expect(getLatestEquityTick('NOMARK1/USD')).toMatchObject({ observed: false, tsMs: Date.parse('2026-10-14T15:00:00Z'), price: 20.5 });
    expect(getLatestEquityTick('NOMARK2/USD')).toMatchObject({ observed: true, tsMs: Date.parse('2026-10-14T15:00:00Z'), price: 30.5 });
    expect(getLatestEquityTick('NOMARK1/USD')!.raw?.bid).toBeNull(); // the sides DID move
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

describe('P4 (8g) — judgeExitPriceAge: the retained observation decides, the exemption is declared', () => {
  const exempt = (p: string) => ageExemptionOfProducer(p as any) !== null;
  const NOW = 1_800_000_000_000;
  it('the window is the D6 2 s exit limit', () => expect(CRYPTO_EXIT_PRICE_MAX_AGE_MS).toBe(2000));
  it('a rate-limited re-serve 14.3 s old is STALE and not actionable — whatever its cachedAt', () => {
    expect(judgeExitPriceAge({ observedAt: NOW - 14_300, producer: 'kraken_rest_rate_limited_reserve' }, NOW, 2000, exempt))
      .toEqual({ verdict: 'stale', actionable: false, ageMs: 14_300 });
  });
  it('NEGATIVE CONTROL: a genuine read inside the window is fresh', () => {
    expect(judgeExitPriceAge({ observedAt: NOW - 500, producer: 'kraken_ws_ticker_mid' }, NOW, 2000, exempt))
      .toEqual({ verdict: 'fresh', actionable: true, ageMs: 500 });
    expect(judgeExitPriceAge({ observedAt: NOW - 2000, producer: 'kraken_rest_poller' }, NOW, 2000, exempt).actionable).toBe(true);
  });
  it('a missing stamp on a non-exempt producer is NOT fresh (never inferred from a null)', () => {
    expect(judgeExitPriceAge({ observedAt: null, producer: 'kraken_rest_poller' }, NOW, 2000, exempt))
      .toEqual({ verdict: 'unstamped', actionable: false, ageMs: null });
  });
  it('a declared-exempt producer passes BY DECLARATION, with its own verdict so the caller counts it', () => {
    const exemptProducers = Object.entries(AGE_EXEMPTION_BY_PRODUCER).filter(([, v]) => v !== null).map(([k]) => k);
    expect(exemptProducers.sort()).toEqual(['kraken_rest_engine_fallback_last', 'kraken_rest_engine_fallback_mid']);
    for (const p of exemptProducers) {
      expect(judgeExitPriceAge({ observedAt: null, producer: p }, NOW, 2000, exempt)).toEqual({ verdict: 'exempt', actionable: true, ageMs: null });
    }
    // and no re-serve is exempt — the table says so, and the judgement follows it
    for (const p of ['kraken_rest_rate_limited_reserve', 'last_known_good_reserve', 'xstock_rest_gate_reserve']) {
      expect(judgeExitPriceAge({ observedAt: NOW - 60_000, producer: p }, NOW, 2000, exempt).actionable).toBe(false);
    }
  });
});

describe('P4 (8g-bis) — the stored-row tripwire on rate-limited re-serve rows', () => {
  const close = '2026-10-14T15:00:00.000Z';
  const closeMs = Date.parse(close);
  const row = (o: Partial<ReserveRow>): ReserveRow => ({ id: 't1', symbol: 'ZEC/USD', exit_observed_at_ms: closeMs - 14_300, closed_at: close, exit_price_source: 'kraken_rest', ...o });

  it('(a) a null stamp fires', () => expect(classifyReserveRow(row({ exit_observed_at_ms: null }))).toEqual(['null_stamp']));
  it('(b) a stamp equal to the close instant fires (a re-stamp at close)', () => {
    expect(classifyReserveRow(row({ exit_observed_at_ms: closeMs }))).toEqual(['stamp_equals_close']);
    expect(classifyReserveRow(row({ exit_observed_at_ms: String(closeMs) }))).toEqual(['stamp_equals_close']); // numeric arrives as text
  });
  it('(c) a source other than kraken_rest fires', () => expect(classifyReserveRow(row({ exit_price_source: 'last_known_good' }))).toEqual(['wrong_source']));
  it('NEGATIVE CONTROL: a reserve row with an older stamp and source kraken_rest does not fire', () => {
    expect(classifyReserveRow(row({}))).toEqual([]);
  });
  it('the run alerts once per violating row, keyed on the row, and reports how many rows it CHECKED', async () => {
    const alerts: any[] = [];
    const r = await runReserveRowTripwire('paper', 0, {
      listReserveRows: async (mode, since) => { expect(mode).toBe('paper'); expect(since).toBe(0); return [row({ id: 'ok' }), row({ id: 'bad', exit_observed_at_ms: null, exit_price_source: 'mock' })]; },
      addAlert: async (a) => { alerts.push(a); return {}; },
    });
    expect(r.checked).toBe(2);
    expect(r.violating).toEqual([{ id: 'bad', symbol: 'ZEC/USD', violations: ['null_stamp', 'wrong_source'] }]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].dedupe_key).toBe('reserve-row-tripwire-bad');
  });
  it('the production query reads the stored columns of the reserve producer only', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('server/services/reserve-row-tripwire.ts', 'utf8');
    expect(src).toContain("export const RESERVE_PRODUCER = 'kraken_rest_rate_limited_reserve';");
    expect(src).toMatch(/SELECT id, symbol, exit_observed_at_ms, closed_at, exit_price_source\s+FROM closed_trades\s+WHERE mode = \$\{mode\} AND exit_price_producer = \$\{RESERVE_PRODUCER\}/);
  });
});
