/**
 * B-VENUE-QUIET-ALERTING r4 (row 3a1, Step 9) — the cohort's "ticking" count reads venue UPDATES only.
 *
 * Measured on the wire 2026-10-10 19:18Z (`wss://ws-equities.kraken.com`, Saturday, venue shut): subscribing sends one
 * `{"channel":"ticker","type":"snapshot"}` frame per symbol, then heartbeats only. The engine resubscribes on every restart,
 * so before r4 each restart made all 468 symbols read as ticking for a minute and paged on a closed market (11:59:23Z and
 * 17:05:16Z, both followed by `classVerdict: not_quiet, T: 468` pages). These tests drive real frames through the parser.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../db.js', () => ({ db: { execute: vi.fn(), select: vi.fn(), insert: vi.fn() } }));
vi.mock('../../services/system-alerts.js', () => ({ addAlert: vi.fn() }));
vi.mock('../../services/passive-archive/ohlc-batch-writer.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/passive-archive/ohlc-batch-writer.js')>();
  return { ...actual, bufferOhlcBar: () => true };
});
vi.mock('../../services/passive-archive/ticker-batch-writer.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/passive-archive/ticker-batch-writer.js')>();
  return { ...actual, bufferTickerSnap: () => true };
});

import {
  _handleMessageForTests, _resetTickerUpdateClockForTests, countEquitySymbolsUpdatedSince, getLatestEquityTick,
} from '../../services/passive-archive/equity-spot-archiver.js';

const frame = (o: unknown) => Buffer.from(JSON.stringify(o));
const snap = (type: string | undefined, symbols: string[]) =>
  frame({ channel: 'ticker', ...(type ? { type } : {}), data: symbols.map((symbol) => ({ symbol, bid: 100, ask: 100.2, last: 100.1 })) });

beforeEach(() => _resetTickerUpdateClockForTests());

describe('r4: only a venue update counts as ticking', () => {
  it('a subscribe-time SNAPSHOT for every symbol counts zero (the restart replay), though it still writes the mark', () => {
    const t0 = Date.now();
    _handleMessageForTests(snap('snapshot', ['AAPL/USD', 'MSFT/USD', 'ORCL/USD']));
    expect(countEquitySymbolsUpdatedSince(t0 - 1)).toBe(0);
    expect(getLatestEquityTick('AAPL/USD')).not.toBeNull(); // the mark behaviour is unchanged (#743 is row 33's)
  });
  it('an UPDATE counts its symbol; a later snapshot does not refresh the count', () => {
    const t0 = Date.now();
    _handleMessageForTests(snap('update', ['AAPL/USD']));
    _handleMessageForTests(snap('snapshot', ['MSFT/USD']));
    expect(countEquitySymbolsUpdatedSince(t0 - 1)).toBe(1);
  });
  it('a frame with NO type label counts zero (only a labelled change is evidence of ticking)', () => {
    const t0 = Date.now();
    _handleMessageForTests(snap(undefined, ['AAPL/USD']));
    expect(countEquitySymbolsUpdatedSince(t0 - 1)).toBe(0);
  });
  it('the window bounds the count: an update older than `sinceMs` is not ticking now', () => {
    _handleMessageForTests(snap('update', ['AAPL/USD']));
    expect(countEquitySymbolsUpdatedSince(Date.now() + 1)).toBe(0);
  });
});
