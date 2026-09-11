// B-PRICE-SIDE-BY-JOB r5 — P-7a (decision D3): the crypto trading adapter's ticker subscription asks Kraken for a
// BEST-BID/OFFER trigger (`event_trigger: 'bbo'`) instead of the default trade trigger, so the ticker updates when
// the quote moves — not only when someone trades. On a quiet pair the default leaves the price silent while the
// real quote moves underneath (#1017).
//
// The venue fact is measured, not assumed: scripts/analysis/bbo_trigger_ack_probe.mjs, 2026-09-11 14:28Z —
// crypto v2 ACCEPTED `event_trigger: bbo` (echoed back); the default echoed `trades`; the xStock equities endpoint
// REJECTED the field. This adapter is the crypto v2 socket only; the xStock and archive subscribers are untouched.
//
// POSITIVE CONTROL: test 1 must FAIL against the adapter before P-7a (no event_trigger on the ticker subscribe).
import { describe, it, expect } from 'vitest';
import { KrakenWebSocketAdapter } from '../../exchanges/kraken/kraken-websocket-adapter.js';

type Sent = { method: string; params?: Record<string, unknown> };

function makeConnectedAdapter() {
  const sent: Sent[] = [];
  const adapter: any = new (KrakenWebSocketAdapter as any)();
  adapter.isConnected = true;
  adapter.ws = { readyState: 1, send: (m: string) => sent.push(JSON.parse(m)) };
  return { adapter, sent };
}

describe('P-7a — crypto ticker subscribes with the best-bid/offer trigger', () => {
  it('1. the ticker subscribe carries event_trigger: bbo', () => {
    const { adapter, sent } = makeConnectedAdapter();
    adapter.subscribeToSymbols(['BTC/USD', 'ETH/USD']);
    const tickerSubs = sent.filter((m) => m.method === 'subscribe' && m.params?.channel === 'ticker');
    expect(tickerSubs.length).toBeGreaterThan(0); // control: a ticker subscribe was actually sent
    for (const m of tickerSubs) expect(m.params?.event_trigger).toBe('bbo');
  });

  it('2. the book and instrument subscribes are unchanged (no event_trigger leaks onto other channels)', () => {
    const { adapter, sent } = makeConnectedAdapter();
    adapter.subscribeToSymbols(['BTC/USD']);
    const others = sent.filter((m) => m.method === 'subscribe' && m.params?.channel !== 'ticker');
    expect(others.length).toBeGreaterThan(0);
    for (const m of others) expect(m.params?.event_trigger).toBeUndefined();
  });

  it('3. the ticker unsubscribe is unchanged (Kraken matches an unsubscribe by channel and symbol)', () => {
    const { adapter, sent } = makeConnectedAdapter();
    adapter.subscribeToSymbols(['BTC/USD']);
    adapter.unsubscribeFromSymbols(['BTC/USD']);
    const tickerUnsubs = sent.filter((m) => m.method === 'unsubscribe' && m.params?.channel === 'ticker');
    expect(tickerUnsubs.length).toBe(1);
  });
});
