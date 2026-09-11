// B-PRICE-SIDE-BY-JOB r5 — P-7b (pre-audit A-9.3): every path that stops watching a symbol cancels the
// BOOK subscription as well as the TICKER, so book streams are never left live at Kraken and re-subscribes
// never stack.
//
// Three paths shared the defect (Langston Step-1 r5 condition 2): unsubscribeFromSymbols (ticker only),
// clearAllSubscriptions (cleared local state after a ticker-only unsubscribe) and refreshChannel (a
// ticker-only unsubscribe, then subscribing ticker AND book). softResubscribe carried its own raw book
// unsubscribe; after the hoist it must send exactly ONE book unsubscribe per symbol, not two.
//
// POSITIVE CONTROL, run 2026-09-11 against the unfixed adapter at 5526c6ee8:
//   1 FAIL (expected 2 book unsubscribes, got 0) · 2 FAIL (expected 3, got 0) · 3 FAIL (live book subs 3, expected 1)
//   4 PASS (softResubscribe already sent one raw book unsubscribe — this is the no-duplicate guard for the hoist)
//   5 PASS (the disconnected path is unchanged).
// Harness note: the adapter runs recurring intervals, so vi.runAllTimers never terminates (10,000-timer guard);
// the tests advance past the one 500 ms timeout under test instead.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { KrakenWebSocketAdapter } from '../../exchanges/kraken/kraken-websocket-adapter.js';

type Sent = { method: string; params?: { channel?: string; symbol?: string[]; depth?: number } };

function makeConnectedAdapter() {
  const sent: Sent[] = [];
  const adapter: any = new (KrakenWebSocketAdapter as any)();
  adapter.isConnected = true;
  adapter.ws = { readyState: 1, send: (m: string) => sent.push(JSON.parse(m)) };
  adapter.startChannelWatchdog = () => {}; // refreshChannel arms it; not under test here
  return { adapter, sent };
}

// Counts symbols, not messages: one message can carry several symbols.
function count(sent: Sent[], method: 'subscribe' | 'unsubscribe', channel: 'ticker' | 'book'): number {
  return sent
    .filter((m) => m.method === method && m.params?.channel === channel)
    .reduce((n, m) => n + (m.params?.symbol?.length ?? 0), 0);
}

afterEach(() => {
  vi.useRealTimers();
});

describe('P-7b — stopping a symbol cancels its book subscription, on every path', () => {
  it('1. unsubscribeFromSymbols cancels BOTH ticker and book', () => {
    const { adapter, sent } = makeConnectedAdapter();
    adapter.subscribeToSymbols(['BTC/USD', 'ETH/USD']);
    const bookSubs = count(sent, 'subscribe', 'book');
    expect(bookSubs).toBeGreaterThan(0); // control: the subscribe path really sends a book subscription

    adapter.unsubscribeFromSymbols(['BTC/USD', 'ETH/USD']);
    expect(count(sent, 'unsubscribe', 'ticker')).toBe(2);
    expect(count(sent, 'unsubscribe', 'book')).toBe(bookSubs);
  });

  it('2. clearAllSubscriptions cancels the book for every subscribed symbol before forgetting it', () => {
    const { adapter, sent } = makeConnectedAdapter();
    adapter.subscribeToSymbols(['BTC/USD', 'ETH/USD', 'SOL/USD']);
    const bookSubs = count(sent, 'subscribe', 'book');
    // clearAllSubscriptions only unsubscribes CONFIRMED symbols (`subscribedSymbols`, filled when Kraken ACKs).
    // No ACK is simulated here, so mark them confirmed — without this the test would pass or fail on an empty set
    // and say nothing about the book channel. (r1 of this fixture omitted it; its pre-fix FAIL was for that reason.)
    for (const s of ['BTC/USD', 'ETH/USD', 'SOL/USD']) adapter.subscribedSymbols.add(s);

    adapter.clearAllSubscriptions();
    expect(count(sent, 'unsubscribe', 'book')).toBe(bookSubs);
    expect(adapter.subscribedSymbols.size).toBe(0);
  });

  it('3. refreshChannel never stacks book subscriptions', () => {
    vi.useFakeTimers();
    const { adapter, sent } = makeConnectedAdapter();
    adapter.subscribeToSymbols(['BTC/USD']);

    // refreshChannel re-subscribes after a 500 ms timeout; advance past that one timeout only.
    adapter.refreshChannel('BTC/USD');
    vi.advanceTimersByTime(600);
    adapter.refreshChannel('BTC/USD');
    vi.advanceTimersByTime(600);

    // live book subscriptions = sent subscribes - sent unsubscribes; it must stay exactly one
    const live = count(sent, 'subscribe', 'book') - count(sent, 'unsubscribe', 'book');
    expect(live).toBe(1);
  });

  it('4. softResubscribe sends exactly ONE book unsubscribe per symbol after the hoist', async () => {
    vi.useFakeTimers();
    const { adapter, sent } = makeConnectedAdapter();
    adapter.subscribeToSymbols(['BTC/USD']);
    const before = count(sent, 'unsubscribe', 'book');

    // softResubscribe awaits a 500 ms pause before re-subscribing; advance past it only.
    const p = adapter.softResubscribe('BTC/USD');
    await vi.advanceTimersByTimeAsync(600);
    await p;
    expect(count(sent, 'unsubscribe', 'book') - before).toBe(1);
  });

  it('5. while disconnected, unsubscribe sends nothing and only cleans local state (behaviour kept)', () => {
    const { adapter, sent } = makeConnectedAdapter();
    adapter.subscribeToSymbols(['BTC/USD']);
    adapter.isConnected = false;
    const sentBefore = sent.length;

    adapter.unsubscribeFromSymbols(['BTC/USD']);
    expect(sent.length).toBe(sentBefore);
    expect(adapter.subscribedSymbols.has('BTC/USD')).toBe(false);
  });

  it('6. the book unsubscribe uses the GRANTED depth from the subscribe ACK (#507), not a hard-coded 10', () => {
    const { adapter, sent } = makeConnectedAdapter();
    adapter.subscribeToSymbols(['BTC/USD']);
    adapter.bookDepth.set('BTC/USD', 25); // as if Kraken's ACK granted depth 25

    adapter.unsubscribeFromSymbols(['BTC/USD']);
    const bookUnsubs = sent.filter((m) => m.method === 'unsubscribe' && m.params?.channel === 'book');
    expect(bookUnsubs.length).toBe(1);
    expect(bookUnsubs[0].params?.depth).toBe(25);
  });
});
