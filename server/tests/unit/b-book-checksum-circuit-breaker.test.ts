/**
 * B-BOOK-CHECKSUM-CIRCUIT-BREAKER (#1220) — pre-audit plan item 10. Every negative ships with its twin.
 *
 * THE DEFECT (2026-10-13, measured in the pre-audit): the checksum mismatch arm deleted the symbol's book and resubscribed
 * BOTH channels. The next delta built a partial book on the empty map, mismatched, and was wiped again — at frame rate —
 * until Kraken rate-limited the connection. A second socket kept delivering into the same book after `this.ws` had been
 * reassigned away from it, and its frames kept the liveness clocks fed, so nothing recovered.
 *
 * THE FIX, as tested here: one socket at a time (`connect()` refuses on the socket's own state, every handler drops a
 * stale socket's events first), and a per-symbol trust machine that HOLDS a mismatching book, sends ONE book-only resync,
 * re-reads the pair's precision once, and either restores trust on a matching snapshot or confirms the book untrusted —
 * cancelling its book channel and refusing it at every reader until an operator re-check.
 *
 * Harness note: the adapter runs recurring intervals, so `vi.runAllTimers` never terminates; tests advance past the
 * specific timeout under test.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  sockets: [] as any[],
  addAlert: vi.fn(async (o: any) => ({ id: 'x', ...o })),
  resolveByKey: vi.fn(async () => ['x']),
}));

vi.mock('ws', async () => {
  const { EventEmitter: EE } = await import('events');
  class FakeWS extends EE {
    static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
    readyState = 0;
    sent: any[] = [];
    terminated = false;
    closeCalls: Array<[number, string]> = [];
    constructor(public url: string, public opts: any) { super(); h.sockets.push(this); }
    send(m: string) { this.sent.push(JSON.parse(m)); }
    ping() {}
    close(code: number, reason: string) { this.closeCalls.push([code, reason]); this.readyState = 2; }
    terminate() { this.terminated = true; this.readyState = 3; }
  }
  return { default: FakeWS };
});

vi.mock('../../services/system-alerts.js', async (orig) => {
  const real: any = await orig();
  return { ...real, addAlert: h.addAlert, resolveAlertsByDedupeKey: h.resolveByKey };
});

import axios from 'axios';
import { KrakenWebSocketAdapter, __resetAssetPairsPrecisionCacheForTest } from '../../exchanges/kraken/kraken-websocket-adapter.js';
import { krakenAssetPairsService } from '../../markets/kraken-asset-pairs-service.js';
import { selectTouchPrice, type TouchLegInput } from '../../core/calculations/touch-price.js';

const SYM = 'SOL/USD'; // a pair whose Kraken v2 name is its internal name (BTC is XBT/USD on the wire)
const PREC = { price: 1, qty: 8 };
type Lvl = { price: number; qty: number };
const lv = (price: number, qty = 1): Lvl => ({ price, qty });

/** The checksum Kraken would send for exactly these levels, computed the way the handler stores them (String()). */
function crcOf(bids: Lvl[], asks: Lvl[], prec = PREC): number {
  const raw = { bids: new Map<number, [string, string]>(), asks: new Map<number, [string, string]>() };
  for (const b of bids) raw.bids.set(b.price, [String(b.price), String(b.qty)]);
  for (const a of asks) raw.asks.set(a.price, [String(a.price), String(a.qty)]);
  return KrakenWebSocketAdapter.computeBookChecksumFromRaw(raw, prec);
}

function makeAdapter(opts: { connected?: boolean } = {}) {
  const adapter: any = new (KrakenWebSocketAdapter as any)();
  const sent: any[] = [];
  adapter.mapKrakenPairToInternalSymbol = (p: string) => p;
  adapter.symbolPrecision.set(SYM, PREC);
  if (opts.connected !== false) {
    adapter.isConnected = true;
    adapter.ws = { readyState: 1, send: (m: string) => sent.push(JSON.parse(m)) };
  }
  adapter.precisionReader = vi.fn(async () => PREC);
  return { adapter, sent };
}

const BIDS = [lv(100), lv(99)];
const ASKS = [lv(101), lv(102)];
function snapshot(adapter: any, bids = BIDS, asks = ASKS, checksum = crcOf(bids, asks)) {
  adapter.handleV2BookUpdate({ type: 'snapshot', data: [{ symbol: SYM, bids, asks, checksum }] });
}
function badDelta(adapter: any) {
  adapter.handleV2BookUpdate({ type: 'update', data: [{ symbol: SYM, bids: [lv(100, 2)], asks: [], checksum: 1 }] });
}
const bookMsgs = (sent: any[], method: string) => sent.filter((m) => m.method === method && m.params?.channel === 'book');
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

beforeEach(() => {
  h.sockets.length = 0;
  h.addAlert.mockClear();
  h.resolveByKey.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('#1220 — the wipe loop is closed at its source', () => {
  it('1. socket DOWN: a mismatching stream clears nothing and sends nothing; the book is held and refused', () => {
    const { adapter } = makeAdapter({ connected: false });
    snapshot(adapter);
    expect(adapter.getBookTrustState(SYM)).toBe('trusted'); // control: the snapshot verified

    badDelta(adapter); // applied, THEN found to disagree — the frame that trips the breaker
    expect(adapter.getBookTrustState(SYM)).toBe('suspect');
    const held = [...adapter.orderBooks.get(SYM).bids.entries()];
    expect(held.length).toBe(2); // HELD — the old arm deleted it here
    for (let i = 0; i < 49; i++) badDelta(adapter);
    expect([...adapter.orderBooks.get(SYM).bids.entries()]).toEqual(held); // nothing after it is applied
    expect(adapter.bookChecksumMismatches.get(SYM)).toBe(1); // one mismatch; the other 49 frames never applied
    expect(adapter.bookFramesIgnoredUntrusted.get(SYM)).toBe(49);
    expect(adapter.bookResyncsSent.get(SYM) ?? 0).toBe(0);
    expect(adapter.getBookForFill(SYM)).toBeNull();
  });

  it('1-twin. the same stream with MATCHING checksums is applied and stays trusted', () => {
    const { adapter } = makeAdapter({ connected: false });
    snapshot(adapter);
    const bids = [lv(100, 2), lv(99)];
    adapter.handleV2BookUpdate({ type: 'update', data: [{ symbol: SYM, bids: [lv(100, 2)], asks: [], checksum: crcOf(bids, ASKS) }] });
    expect(adapter.getBookTrustState(SYM)).toBe('trusted');
    expect(adapter.orderBooks.get(SYM).bids.get(100)).toBe(2);
    expect(adapter.getBookForFill(SYM)).not.toBeNull();
  });

  it('2. N mismatching frames with a resync in flight send ONE resync, never a second, and no wipe', () => {
    vi.useFakeTimers();
    const { adapter, sent } = makeAdapter();
    snapshot(adapter);
    for (let i = 0; i < 20; i++) badDelta(adapter);
    vi.advanceTimersByTime(600);
    expect(bookMsgs(sent, 'unsubscribe').length).toBe(1);
    expect(bookMsgs(sent, 'subscribe').length).toBe(1);
    expect(adapter.bookResyncsSent.get(SYM)).toBe(1);
    expect(adapter.orderBooks.get(SYM).bids.size).toBe(2);
    expect(sent.some((m) => m.params?.channel === 'ticker')).toBe(false); // book-only: the ticker is never touched
  });

  it('3. a mismatching frame stops the cache emit (the book no longer prices anything)', () => {
    const { adapter } = makeAdapter({ connected: false });
    const ticks: any[] = [];
    adapter.on('priceTick', (e: any) => ticks.push(e));
    snapshot(adapter);
    const n = ticks.length;
    expect(n).toBeGreaterThan(0); // control: a trusted book emits
    badDelta(adapter);
    badDelta(adapter);
    expect(ticks.length).toBe(n);
  });
});

describe('#1220 — the breaker: restore, confirm, re-read, re-desync', () => {
  it('4. the resync snapshot MATCHES ⇒ trusted again, the book serves and emits', () => {
    vi.useFakeTimers();
    const { adapter } = makeAdapter();
    snapshot(adapter);
    badDelta(adapter);
    snapshot(adapter, [lv(100, 3)], [lv(101, 3)]);
    expect(adapter.getBookTrustState(SYM)).toBe('trusted');
    expect(adapter.getBookForFill(SYM)?.bids[0]).toEqual({ price: 100, qty: 3 });
    expect(adapter.bookResyncInFlight.has(SYM)).toBe(false);
    expect(h.addAlert).not.toHaveBeenCalled();
  });

  it('5. the resync snapshot MISMATCHES at an unchanged precision ⇒ ONE re-read, then untrusted, book cancelled, alert', async () => {
    vi.useFakeTimers();
    const { adapter, sent } = makeAdapter();
    snapshot(adapter);
    badDelta(adapter);
    vi.advanceTimersByTime(600);
    snapshot(adapter, BIDS, ASKS, 7); // the venue's fresh snapshot, and we still disagree
    await flush();
    expect(adapter.precisionReader).toHaveBeenCalledTimes(1);
    expect(adapter.getBookTrustState(SYM)).toBe('untrusted');
    expect(adapter.bookTrustConfirmed.get(SYM)).toBe(1);
    expect(bookMsgs(sent, 'unsubscribe').length).toBe(2); // the resync's, then the cancel
    await vi.dynamicImportSettled();
    await flush();
    expect(h.addAlert).toHaveBeenCalledTimes(1);
    const a = h.addAlert.mock.calls[0][0];
    expect(a.category).toBe('breakage');
    expect(a.dedupe_key).toMatch(/^book_untrusted:SOL\/USD:\d{4}-\d\d-\d\dT/);
    expect(a.metadata).toMatchObject({ symbol: SYM, reason: 'snapshot_mismatch_at_reread_precision', theirs: 7 });

    // ⛔ and it STAYS stopped: further frames, and every subscribe path, send no book request
    const n = sent.length;
    snapshot(adapter, BIDS, ASKS, 7);
    badDelta(adapter);
    adapter.subscribeToSymbols([SYM]);
    expect(bookMsgs(sent.slice(n), 'subscribe').length).toBe(0);
    expect(sent.slice(n).some((m) => m.method === 'subscribe' && m.params?.channel === 'ticker')).toBe(true); // ticker kept
  });

  it('6. the re-read finds OUR precision was stale ⇒ adopt the venue\'s, one fresh snapshot, then trusted', async () => {
    vi.useFakeTimers();
    const { adapter, sent } = makeAdapter();
    snapshot(adapter);
    badDelta(adapter);
    vi.advanceTimersByTime(600);
    const VENUE = { price: 2, qty: 8 };
    adapter.precisionReader = vi.fn(async () => VENUE);
    snapshot(adapter, BIDS, ASKS, crcOf(BIDS, ASKS, VENUE)); // matches only at the venue's precision
    await flush();
    expect(adapter.symbolPrecision.get(SYM)).toEqual(VENUE);
    expect(adapter.getBookTrustState(SYM)).toBe('suspect'); // not trusted on the HELD snapshot — deltas were dropped
    vi.advanceTimersByTime(600);
    expect(bookMsgs(sent, 'subscribe').length).toBe(2); // the first resync, then the confirming one
    snapshot(adapter, BIDS, ASKS, crcOf(BIDS, ASKS, VENUE));
    expect(adapter.getBookTrustState(SYM)).toBe('trusted');
  });

  it('7. a second desync WITHIN 60 s of a restore confirms without another request', () => {
    vi.useFakeTimers();
    const { adapter, sent } = makeAdapter();
    snapshot(adapter);
    badDelta(adapter);
    vi.advanceTimersByTime(600);
    snapshot(adapter); // restored
    const n = bookMsgs(sent, 'subscribe').length;
    vi.advanceTimersByTime(30_000);
    badDelta(adapter);
    expect(adapter.getBookTrustState(SYM)).toBe('untrusted');
    expect(adapter.bookTrust.get(SYM).reason).toBe('second_desync_within_60s_of_restore');
    expect(bookMsgs(sent, 'subscribe').length).toBe(n);
  });

  it('7-twin. a desync AFTER the 60 s window is a new episode: suspect, one resync', () => {
    vi.useFakeTimers();
    const { adapter } = makeAdapter();
    snapshot(adapter);
    badDelta(adapter);
    vi.advanceTimersByTime(600);
    snapshot(adapter);
    const ep1 = adapter.bookTrust.get(SYM).episodeStartIso;
    vi.advanceTimersByTime(61_000);
    badDelta(adapter);
    expect(adapter.getBookTrustState(SYM)).toBe('suspect');
    expect(adapter.bookTrust.get(SYM).episodeStartIso).not.toBe(ep1);
    expect(adapter.bookResyncsSent.get(SYM)).toBe(2);
  });

  it('8. no snapshot within 30 s on a LIVE socket ⇒ confirmed untrusted', () => {
    vi.useFakeTimers();
    const { adapter } = makeAdapter();
    snapshot(adapter);
    badDelta(adapter);
    vi.advanceTimersByTime(30_100);
    expect(adapter.getBookTrustState(SYM)).toBe('untrusted');
    expect(adapter.bookTrust.get(SYM).reason).toBe('resync_no_snapshot_within_30s');
  });

  it('8-twin. the socket CLOSES under the resync ⇒ no confirm; the next open re-requests it, subscribe only', () => {
    vi.useFakeTimers();
    const { adapter } = makeAdapter();
    snapshot(adapter);
    badDelta(adapter);
    adapter.handleClose(1006, 'gone');
    vi.advanceTimersByTime(30_100);
    expect(adapter.getBookTrustState(SYM)).toBe('suspect');
    const sent2: any[] = [];
    adapter.ws = { readyState: 1, send: (m: string) => sent2.push(JSON.parse(m)), ping() {}, close() {} };
    adapter.handleOpen();
    expect(bookMsgs(sent2, 'subscribe').map((m) => m.params.symbol)).toContainEqual([SYM]);
    expect(bookMsgs(sent2, 'unsubscribe').length).toBe(0); // a fresh socket holds no subscription to cancel
    adapter.stop();
  });

  it('9. a REJECTED book unsubscribe is counted, never retried', () => {
    const { adapter, sent } = makeAdapter();
    snapshot(adapter);
    badDelta(adapter);
    const u = bookMsgs(sent, 'unsubscribe')[0];
    vi.spyOn(console, 'error').mockImplementation(() => {});
    adapter.handleV2SystemMessage({ method: 'unsubscribe', success: false, error: 'Subscription Not Found', req_id: u.req_id });
    expect(adapter.bookUnsubRejected.get(SYM)).toBe(1);
    expect(bookMsgs(sent, 'unsubscribe').length).toBe(1);
  });

  it('9b. a REJECTED book subscribe is attributed to the symbols that request named', () => {
    const { adapter, sent } = makeAdapter();
    adapter.subscribeToSymbols([SYM, 'ETH/USD']);
    const s = bookMsgs(sent, 'subscribe')[0];
    vi.spyOn(console, 'error').mockImplementation(() => {});
    adapter.handleV2SystemMessage({ method: 'subscribe', success: false, error: 'Already subscribed', req_id: s.req_id, symbol: 'ETH/USD' });
    expect(adapter.bookSubscribeRejected.get('ETH/USD')).toBe(1);
    expect(adapter.bookSubscribeRejected.get(SYM) ?? 0).toBe(0);
  });
});

describe('#1220 — the doors: every path that could re-arm or read a refused book', () => {
  function untrusted() {
    const made = makeAdapter();
    made.adapter.bookTrust.set(SYM, {
      state: 'untrusted', episodeStartIso: '2026-10-20T00:00:00.000Z', lastRestoreMs: null, precisionRereadDone: true,
      lastOurs: 1, lastTheirs: 2, reason: 'test', recheck: null,
    });
    return made;
  }

  it('10. subscribeToSymbols withholds the BOOK for an untrusted symbol and keeps the ticker; twin: a trusted one gets both', () => {
    const { adapter, sent } = untrusted();
    adapter.subscribeToSymbols([SYM, 'ETH/USD']);
    const book = bookMsgs(sent, 'subscribe');
    expect(book.length).toBe(1);
    expect(book[0].params.symbol).not.toContain(SYM);
    expect(book[0].params.symbol.length).toBe(1); // ETH/USD — the twin
    const ticker = sent.find((m) => m.method === 'subscribe' && m.params?.channel === 'ticker');
    expect(ticker.params.symbol.length).toBe(2);
  });

  it('11. the raw channel switch is refused for an untrusted symbol', async () => {
    const { adapter, sent } = untrusted();
    adapter.tickFrequencyData.set(SYM, { currentChannel: 'ticker' });
    await adapter.switchToBookChannel(SYM);
    expect(bookMsgs(sent, 'subscribe').length).toBe(0);
  });

  it('12. getBookForFill refuses a held book; getLatestPriceData reports its trust', () => {
    const { adapter } = makeAdapter({ connected: false });
    snapshot(adapter);
    expect(adapter.getLatestPriceData(SYM)?.trust).toBe('trusted');
    badDelta(adapter);
    expect(adapter.getBookForFill(SYM)).toBeNull();
    expect(adapter.getLatestPriceData(SYM)?.trust).toBe('suspect');
  });

  it('13. instrument precision outside 0-18 is refused and counted; twin: 18 is accepted', () => {
    const { adapter } = makeAdapter();
    adapter.symbolPrecision.clear();
    adapter.handleInstrumentMessage({ type: 'snapshot', data: { pairs: [
      { symbol: 'AAA/USD', price_precision: 19, qty_precision: 8 },
      { symbol: 'BBB/USD', price_precision: 18, qty_precision: 0 },
    ] } });
    expect(adapter.symbolPrecision.has('AAA/USD')).toBe(false);
    expect(adapter.bookPrecisionRefused.get('AAA/USD')).toBe(1);
    expect(adapter.symbolPrecision.get('BBB/USD')).toEqual({ price: 18, qty: 0 });
  });

  it('14. the book subscribe asks the same depth the handler defaults to before an ACK (the `?? 10` pin)', () => {
    const { adapter, sent } = makeAdapter();
    adapter.subscribeToSymbols([SYM]);
    expect(bookMsgs(sent, 'subscribe')[0].params.depth).toBe(adapter.BOOK_SUBSCRIBE_DEPTH);
    const many = Array.from({ length: 12 }, (_, i) => lv(100 - i));
    adapter.handleV2BookUpdate({ type: 'snapshot', data: [{ symbol: SYM, bids: many, asks: ASKS }] });
    expect(adapter.orderBooks.get(SYM).bids.size).toBe(adapter.BOOK_SUBSCRIBE_DEPTH);
  });
});

describe('#1220 — the operator re-check', () => {
  it('15. an untrusted book re-checks: one precision read, one book subscribe, a match restores trust and resolves the alert', async () => {
    vi.useFakeTimers();
    const { adapter, sent } = makeAdapter();
    snapshot(adapter);
    badDelta(adapter);
    vi.advanceTimersByTime(600);
    snapshot(adapter, BIDS, ASKS, 7);
    await flush();
    expect(adapter.getBookTrustState(SYM)).toBe('untrusted');
    const ep = adapter.bookTrust.get(SYM).episodeStartIso;
    const subsBefore = bookMsgs(sent, 'subscribe').length;

    const r = await adapter.requestBookRecheck(SYM, 'cc-b');
    expect(r).toMatchObject({ accepted: true });
    expect(bookMsgs(sent, 'subscribe').length).toBe(subsBefore + 1);
    snapshot(adapter); // the venue's snapshot, and now we agree
    expect(adapter.getBookTrustState(SYM)).toBe('trusted');
    await vi.dynamicImportSettled();
    await flush();
    expect(h.resolveByKey).toHaveBeenCalledWith(`book_untrusted:${SYM}:${ep}`, 'cc-b', expect.stringMatching(/^#1220 /), 'engine');
  });

  it('15-twin. a re-check that still disagrees leaves it untrusted, cancels the book again, resolves nothing', async () => {
    vi.useFakeTimers();
    const { adapter, sent } = makeAdapter();
    snapshot(adapter);
    badDelta(adapter);
    vi.advanceTimersByTime(600);
    snapshot(adapter, BIDS, ASKS, 7);
    await flush();
    await adapter.requestBookRecheck(SYM, 'cc-b');
    const unsubs = bookMsgs(sent, 'unsubscribe').length;
    snapshot(adapter, BIDS, ASKS, 7);
    expect(adapter.getBookTrustState(SYM)).toBe('untrusted');
    expect(adapter.bookTrust.get(SYM).recheck).toBeNull();
    expect(bookMsgs(sent, 'unsubscribe').length).toBe(unsubs + 1);
    expect(h.resolveByKey).not.toHaveBeenCalled();
  });

  it('16. a re-check is refused for a trusted book, and while one is already out', async () => {
    const { adapter } = makeAdapter();
    expect(await adapter.requestBookRecheck(SYM, 'cc-b')).toMatchObject({ accepted: false, reason: 'book_not_untrusted' });
    adapter.bookTrust.set(SYM, { state: 'untrusted', episodeStartIso: 'e', lastRestoreMs: null, precisionRereadDone: true,
      lastOurs: 1, lastTheirs: 2, reason: 't', recheck: { by: 'cc-b', requestedAtMs: 0 } });
    expect(await adapter.requestBookRecheck(SYM, 'cc-b')).toMatchObject({ accepted: false, reason: 'recheck_in_flight' });
  });

  it('17. trust survives every reset path: stop() and the safe resubscribe never forget an untrusted book', () => {
    vi.useFakeTimers();
    const { adapter } = makeAdapter();
    adapter.bookTrust.set(SYM, { state: 'untrusted', episodeStartIso: 'e', lastRestoreMs: null, precisionRereadDone: true,
      lastOurs: 1, lastTheirs: 2, reason: 't', recheck: null });
    adapter.ws = { readyState: 1, send() {}, close() {}, ping() {} };
    void adapter.softResubscribeAll();
    adapter.stop();
    expect(adapter.getBookTrustState(SYM)).toBe('untrusted');
  });
});

describe('#1220 — the readers: a refused book never comes back one rung down', () => {
  const NOW = 1_700_000_000_000;
  const POLICY = { maxAgeMs: 15_000, maxSpreadFraction: 0.5 };
  const leg = (producer: string): TouchLegInput => ({ bid: 99.9, ask: 100.1, stampMs: NOW - 1_000, arrivalMs: NOW - 1_000, clockBasis: 'receipt', producer });

  it('18. an untrusted book refuses as `book_untrusted`, not `book_not_eligible`, and a REST ticker still prices', () => {
    const r = selectTouchPrice({ book: leg('kraken_ws_book'), bookEligible: true, bookTrusted: false, ticker: leg('rest_poller'), tickerBasis: 'ticker_bbo' }, NOW, POLICY);
    expect(r.ok && r.bookRefusal).toBe('book_untrusted');
    expect(r.ok && r.quote.producer).toBe('rest_poller');
  });

  it('19. ticker sides WRITTEN BY the untrusted book (`ws_book`) are refused too; twin: a trusted book\'s are not', () => {
    const bad = selectTouchPrice({ book: null, bookEligible: true, bookTrusted: false, ticker: leg('ws_book'), tickerBasis: 'ticker_bbo' }, NOW, POLICY);
    expect(bad).toEqual({ ok: false, bookRefusal: 'book_untrusted', tickerRefusal: 'book_untrusted' });
    const ok = selectTouchPrice({ book: null, bookEligible: true, bookTrusted: true, ticker: leg('ws_book'), tickerBasis: 'ticker_bbo' }, NOW, POLICY);
    expect(ok.ok).toBe(true);
  });
});

describe('#1220 — one socket at a time (pre-audit plan 1)', () => {
  function start(adapter: any) {
    void adapter.connect();
    return h.sockets.at(-1);
  }
  function open(_adapter: any, sock: any) {
    sock.readyState = 1;
    sock.emit('open');
  }

  it('20. a second connect() while the first socket is CONNECTING is refused; the handshake is bounded', () => {
    vi.useFakeTimers();
    const adapter: any = new (KrakenWebSocketAdapter as any)();
    const s1 = start(adapter);
    void adapter.connect();
    expect(h.sockets.length).toBe(1);
    expect(s1.opts.handshakeTimeout).toBe(15_000);
    adapter.stop();
  });

  it('20-twin. a connect() over a CLOSING socket detaches, THEN terminates it, and builds one new socket', () => {
    vi.useFakeTimers();
    const adapter: any = new (KrakenWebSocketAdapter as any)();
    const s1 = start(adapter);
    open(adapter, s1);
    s1.readyState = 2; // CLOSING: a graceful close that has not completed
    void adapter.connect();
    expect(h.sockets.length).toBe(2);
    expect(s1.terminated).toBe(true);
    expect(s1.listenerCount('message')).toBe(0);
    expect(adapter.ws).toBe(h.sockets[1]);
    adapter.stop();
  });

  it('21. terminating the old socket schedules NO reconnect against the new one', () => {
    vi.useFakeTimers();
    const adapter: any = new (KrakenWebSocketAdapter as any)();
    const s1 = start(adapter);
    open(adapter, s1);
    s1.readyState = 2;
    void adapter.connect();
    s1.emit('close', 1006, Buffer.from('')); // detached: nothing is listening
    expect(adapter.reconnectTimer).toBeNull();
    adapter.stop();
  });

  it('22. ⛔ an orphan\'s message moves NEITHER liveness clock, its pong does not refresh, its close schedules nothing', () => {
    vi.useFakeTimers();
    const adapter: any = new (KrakenWebSocketAdapter as any)();
    const s1 = start(adapter);
    open(adapter, s1);
    adapter.stop(); // `this.ws` is null; s1 is still attached and still able to emit
    const clocks = () => [adapter.lastMessageTime, adapter.lastHeartbeat, adapter.lastPongTime];
    const before = clocks();
    vi.advanceTimersByTime(5_000);
    s1.emit('message', Buffer.from(JSON.stringify({ channel: 'heartbeat' })));
    s1.emit('pong');
    s1.emit('close', 4001, Buffer.from(''));
    expect(clocks()).toEqual(before);
    expect(adapter.reconnectTimer).toBeNull();
  });

  it('22-twin. the CURRENT socket\'s message does move both clocks', () => {
    vi.useFakeTimers();
    const adapter: any = new (KrakenWebSocketAdapter as any)();
    const s1 = start(adapter);
    open(adapter, s1);
    const before = [adapter.lastMessageTime, adapter.lastHeartbeat];
    vi.advanceTimersByTime(5_000);
    s1.emit('message', Buffer.from(JSON.stringify({ channel: 'heartbeat' })));
    expect(adapter.lastMessageTime).toBeGreaterThan(before[0]);
    expect(adapter.lastHeartbeat).toBeGreaterThan(before[1]);
    adapter.stop();
  });

  it('23. two schedulers firing for ONE drop open exactly ONE socket', () => {
    vi.useFakeTimers();
    const adapter: any = new (KrakenWebSocketAdapter as any)();
    const s1 = start(adapter);
    open(adapter, s1);
    adapter.reconnectWithBackoff(); // scheduler 1: graceful close(4001), connect() after 1 s
    expect(s1.closeCalls[0][0]).toBe(4001);
    s1.readyState = 3;
    s1.emit('close', 4001, Buffer.from('')); // scheduler 2: handleClose → scheduleReconnect, 1 s
    vi.advanceTimersByTime(1_100);
    expect(h.sockets.length).toBe(2);
    adapter.stop();
  });

  it('24. a completed open resets BOTH reconnect counters', () => {
    vi.useFakeTimers();
    const adapter: any = new (KrakenWebSocketAdapter as any)();
    const s1 = start(adapter);
    adapter.reconnectRetries = 6;
    adapter.reconnectAttempts = 3;
    open(adapter, s1);
    expect(adapter.reconnectRetries).toBe(0);
    expect(adapter.reconnectAttempts).toBe(0);
    expect(s1.sent.some((m: any) => m.params?.channel === 'instrument')).toBe(true); // plan 9: once per open
    adapter.stop();
  });
});

describe('#1220 Step-4 BLOCKER-1 — "we could not ask" is not "the venue answered and we still disagree"', () => {
  async function toReread(adapter: any) {
    snapshot(adapter);
    badDelta(adapter);
    vi.advanceTimersByTime(600);
    snapshot(adapter, BIDS, ASKS, 7); // the resync's snapshot, still disagreeing
  }

  it('25. a TRANSPORT failure retries with backoff while the book stays held; only after three failures is it confirmed, naming the transport', async () => {
    vi.useFakeTimers();
    const { adapter } = makeAdapter();
    adapter.precisionReader = vi.fn(async () => { throw new Error('Request failed with status code 429'); });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await toReread(adapter);
    await flush();
    expect(adapter.precisionReader).toHaveBeenCalledTimes(1);
    expect(adapter.getBookTrustState(SYM)).toBe('suspect'); // held, not judged
    await vi.advanceTimersByTimeAsync(2_000);
    expect(adapter.precisionReader).toHaveBeenCalledTimes(2);
    expect(adapter.getBookTrustState(SYM)).toBe('suspect');
    await vi.advanceTimersByTimeAsync(8_000);
    await flush();
    expect(adapter.precisionReader).toHaveBeenCalledTimes(3);
    expect(adapter.getBookTrustState(SYM)).toBe('untrusted');
    expect(adapter.bookTrust.get(SYM).reason).toBe('precision_reread_transport_failed');
    expect(adapter.bookPrecisionTransportFailures.get(SYM)).toBe(3);
  });

  it('25-twin. one transport failure then an ANSWER is judged on the answer, not on the failure', async () => {
    vi.useFakeTimers();
    const { adapter } = makeAdapter();
    let n = 0;
    adapter.precisionReader = vi.fn(async () => { if (n++ === 0) throw new Error('timeout of 10000ms exceeded'); return PREC; });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await toReread(adapter);
    await flush();
    await vi.advanceTimersByTimeAsync(2_000);
    await flush();
    expect(adapter.getBookTrustState(SYM)).toBe('untrusted');
    expect(adapter.bookTrust.get(SYM).reason).toBe('snapshot_mismatch_at_reread_precision');
    expect(adapter.bookPrecisionTransportFailures.get(SYM)).toBe(1);
  });

  it('26. the venue ANSWERS with no usable precision for the pair => judged at the only precision held, which the snapshot failed', async () => {
    vi.useFakeTimers();
    const { adapter } = makeAdapter();
    adapter.precisionReader = vi.fn(async () => null);
    await toReread(adapter);
    await flush();
    expect(adapter.precisionReader).toHaveBeenCalledTimes(1);
    expect(adapter.getBookTrustState(SYM)).toBe('untrusted');
    expect(adapter.bookTrust.get(SYM).reason).toBe('snapshot_mismatch_no_venue_precision');
    expect(adapter.bookPrecisionTransportFailures.get(SYM) ?? 0).toBe(0);
  });

  it('27. a matching snapshot during the retry wait restores the book, and the pending retry then judges nothing', async () => {
    vi.useFakeTimers();
    const { adapter } = makeAdapter();
    adapter.precisionReader = vi.fn(async () => { throw new Error('socket hang up'); });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await toReread(adapter);
    await flush();
    snapshot(adapter); // e.g. a reconnect's snapshot, and we agree
    expect(adapter.getBookTrustState(SYM)).toBe('trusted');
    await vi.advanceTimersByTimeAsync(10_000);
    await flush();
    expect(adapter.getBookTrustState(SYM)).toBe('trusted');
    expect(adapter.precisionReader).toHaveBeenCalledTimes(1);
  });

  it('28. the production reader asks Kraken ONCE for every pair, shared by concurrent callers; a Kraken error array is a transport failure', async () => {
    __resetAssetPairsPrecisionCacheForTest();
    vi.spyOn(krakenAssetPairsService, 'getAllMappings').mockReturnValue([
      { internalSymbol: 'SOL/USD', krakenPairKey: 'SOLUSD' },
      { internalSymbol: 'ETH/USD', krakenPairKey: 'XETHZUSD' },
    ] as any);
    const get = vi.spyOn(axios, 'get').mockResolvedValue({ data: { error: [], result: {
      SOLUSD: { pair_decimals: 2, lot_decimals: 8 }, XETHZUSD: { pair_decimals: 2, lot_decimals: 19 },
    } } } as any);
    const adapter: any = new (KrakenWebSocketAdapter as any)();
    const [sol, eth] = await Promise.all([adapter.precisionReader('SOL/USD'), adapter.precisionReader('ETH/USD')]);
    expect(get).toHaveBeenCalledTimes(1);
    expect(sol).toEqual({ price: 2, qty: 8 });
    expect(eth).toBeNull(); // the venue answered, and 19 is outside 0-18
    expect(await adapter.precisionReader('DOGE/USD')).toBeNull(); // answered, pair not stated
    expect(get).toHaveBeenCalledTimes(1); // the answer is reused, not re-asked

    __resetAssetPairsPrecisionCacheForTest();
    get.mockResolvedValueOnce({ data: { error: ['EGeneral:Too many requests'], result: {} } } as any);
    await expect(adapter.precisionReader('SOL/USD')).rejects.toThrow(/Too many requests/);
    get.mockRejectedValueOnce(new Error('Request failed with status code 503'));
    await expect(adapter.precisionReader('SOL/USD')).rejects.toThrow(/503/);
    __resetAssetPairsPrecisionCacheForTest();
  });

  it('29. the re-check reports the precision it will verify at, and where it came from', async () => {
    const { adapter } = makeAdapter();
    adapter.bookTrust.set(SYM, { state: 'untrusted', episodeStartIso: 'e', lastRestoreMs: null, precisionRereadDone: true,
      lastOurs: 1, lastTheirs: 2, reason: 't', recheck: null });
    adapter.precisionReader = vi.fn(async () => ({ price: 3, qty: 8 }));
    expect(await adapter.requestBookRecheck(SYM, 'cc-b')).toMatchObject({ accepted: true, precision: { price: 3, qty: 8 }, precisionSource: 'asset_pairs', precisionReadError: null });

    const b = makeAdapter().adapter; // twin: the read fails => the held precision is kept, and the response says so
    b.bookTrust.set(SYM, { state: 'untrusted', episodeStartIso: 'e', lastRestoreMs: null, precisionRereadDone: true,
      lastOurs: 1, lastTheirs: 2, reason: 't', recheck: null });
    b.precisionReader = vi.fn(async () => { throw new Error('timeout'); });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await b.requestBookRecheck(SYM, 'cc-b')).toMatchObject({ accepted: true, precision: PREC, precisionSource: 'held_unchanged', precisionReadError: 'timeout' });
  });
});

describe('#1220 Step-4 judgement 6 — the two internal-symbol spellings are checked, not assumed', () => {
  it('30. a pair whose handler key and reader key differ is counted and named; twin: an unloaded map runs nothing', () => {
    const { adapter } = makeAdapter();
    vi.spyOn(krakenAssetPairsService, 'getAllMappings').mockReturnValueOnce([] as any);
    adapter.checkSymbolKeyAgreement();
    expect(adapter.symbolKeyDisagreements).toBeNull();
    vi.spyOn(krakenAssetPairsService, 'getAllMappings').mockReturnValue([
      { krakenWsPair: 'SOL/USD', internalSymbol: 'SOL/USD' },
      { krakenWsPair: 'XBT/USD', internalSymbol: 'BTC/USD' }, // the test adapter's handler map is the identity
    ] as any);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    adapter.checkSymbolKeyAgreement();
    expect(adapter.symbolKeyDisagreements).toMatchObject({ pairs: 2, disagree: 1 });
    expect(adapter.symbolKeyDisagreements.examples[0]).toContain('XBT/USD');
    expect(adapter.getBookIntegrityCounters().symbolKeyAgreement).toMatchObject({ disagree: 1 });
  });
});
