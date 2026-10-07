/**
 * B-PRICE-FEED-TRUTH increment I3 (#1047) — the Kraken WS adapter no longer drops a message on a symbol-less ACK.
 *
 * The `instrument` subscription's ACK carries no `symbol`; it reached the resolver's `toUpperCase()` and threw, dropping
 * the message — 112 of 112 parse errors over 2026-09-24 → 10-07. The frame below is the one logged on staging at
 * 2026-10-07T09:30:33Z.
 * MUTATION: remove the wrapper's non-string guard AND the ACK's channel branch → test 1 logs a parse error.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { KrakenWebSocketAdapter } from '../../exchanges/kraken/kraken-websocket-adapter.js';

const INSTRUMENT_ACK = JSON.stringify({
  method: 'subscribe',
  result: { channel: 'instrument', snapshot: true, warnings: ['tick_size is deprecated, use price_increment'] },
  success: true,
  time_in: '2026-10-07T09:30:33.022050Z',
});

function adapter(): any {
  return new (KrakenWebSocketAdapter as any)();
}

afterEach(() => vi.restoreAllMocks());

describe('I3 — a symbol-less subscribe ACK', () => {
  it('1 — the instrument ACK no longer throws, and adds no per-symbol state', () => {
    const a = adapter();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    a.handleMessage(Buffer.from(INSTRUMENT_ACK));
    const parseErrors = err.mock.calls.filter((c) => String(c[1] ?? c[0]).includes('Error parsing message') || String(c[0]).includes('Error parsing message'));
    expect(parseErrors).toHaveLength(0);
    expect(log.mock.calls.some((c) => String(c[0]).includes('Sub OK: instrument (all pairs)'))).toBe(true);
    expect(a.subscribedSymbols.size).toBe(0);
    expect(a.subscriptionAcks.size).toBe(0);
  });

  it('2 — control: a ticker ACK with a symbol still records its ack', () => {
    const a = adapter();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    a.handleMessage(Buffer.from(JSON.stringify({ method: 'subscribe', result: { channel: 'ticker', symbol: 'BTC/USD' }, success: true })));
    expect(a.subscriptionAcks.size).toBe(1);
  });

  it('3 — another symbol-less ACK is named by its channel, not thrown', () => {
    const a = adapter();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    a.handleMessage(Buffer.from(JSON.stringify({ method: 'subscribe', result: { channel: 'level3' }, success: true })));
    expect(warn.mock.calls.some((c) => String(c[0]).includes('Sub OK with no symbol: channel=level3'))).toBe(true);
    expect(err).not.toHaveBeenCalled();
  });
});

describe('I3 — the lookup wrapper refuses a bad pair loudly once, then counts where the gap report reads', () => {
  it('4 — undefined, empty and non-string inputs return null; the first of each kind is logged', () => {
    const a = adapter();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(a.mapKrakenPairToInternalSymbol(undefined)).toBeNull();
    expect(a.mapKrakenPairToInternalSymbol(undefined)).toBeNull();
    expect(a.mapKrakenPairToInternalSymbol('')).toBeNull();
    expect(a.mapKrakenPairToInternalSymbol(123)).toBeNull();
    // Counted where a production reader exists (getUnmappedTicks → the gap report), not in a map nothing reads.
    const byKey = new Map(a.getUnmappedTicks().map((e: any) => [e.pair, e.count]));
    expect(byKey.get('badpair:undefined')).toBe(2);
    expect(byKey.get('badpair:empty')).toBe(1);
    expect(byKey.get('badpair:number')).toBe(1);
    const refused = warn.mock.calls.filter((c) => String(c[0]).includes('pair lookup refused'));
    expect(refused).toHaveLength(3); // once per kind, not once per call
  });

  it('5 — a book update with no symbol is counted, keyed by channel (it used to be a bare continue)', () => {
    const a = adapter();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    a.handleV2BookUpdate({ channel: 'book', type: 'update', data: [{ bids: [], asks: [] }] });
    expect(a.unmappedTicks.get('book:undefined')?.count).toBe(1);
  });
});
