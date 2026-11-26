/**
 * B-PRICE-FEED-COVERAGE (#1222) OBJ-5 — the subscription intent survives every reconnect path (pre-audit PART 1, P5-1..P5-4).
 *
 * THE DEFECT (F-3, measured in the pre-audit): the crypto adapter's reconnect branch re-subscribed open positions only, so a
 * symbol the RTB had queued and Kraken had ACKed was dropped on every reconnect; the 9.0 safe resubscribe snapshotted the
 * ACKed set only and cleared `pendingSubscriptions`, so a symbol still waiting for its ACK was dropped there. Nothing retried
 * either until the symbol happened to be re-requested.
 *
 * THE FIX, as tested here: one intent per symbol holding named reasons ('open', 'rtb:<mode>'); every restore sends
 * intent − acked − in-flight-on-this-socket, computed at send time, in paced chunks; the 5 s audit is the retry.
 * Step-4 amend (Langston): one log line per non-audit restore run (zero included), the audit declares 'open' for every
 * position it names, and a pending symbol counts as in flight only through its request stamp.
 * Every negative ships with its twin (the old behaviour, shown to lose the symbol, so the positive discriminates).
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

// handleOpen broadcasts a reconnect event, which logs to the database; keep the test hermetic.
vi.mock('../../services/context-bridge.js', () => ({ contextBridge: { broadcast: vi.fn(async () => {}) } }));

import { KrakenWebSocketAdapter } from '../../exchanges/kraken/kraken-websocket-adapter.js';

const X = 'SOL/USD';
const Y = 'ADA/USD';
const Z = 'DOT/USD';

function makeAdapter(opts: { connected?: boolean } = {}) {
  const adapter: any = new (KrakenWebSocketAdapter as any)();
  const sent: any[] = [];
  adapter.normalToKrakenSymbol = (s: string) => s;
  adapter.mapKrakenPairToInternalSymbol = (p: string) => p;
  // handleOpen starts recurring monitors and a symbol-key check; none of them is under test.
  adapter.startHeartbeat = () => {};
  adapter.startGlobalHeartbeatMonitor = () => {};
  adapter.startHealthMetricsLogger = () => {};
  adapter.start90HeartbeatMonitor = () => {};
  adapter.checkSymbolKeyAgreement = () => {};
  adapter.ws = { readyState: 1, send: (m: string) => sent.push(JSON.parse(m)), close() {} };
  if (opts.connected !== false) {
    adapter.isConnected = true;
    adapter.socketGeneration = 1;
    adapter.socketOpenedAt = Date.now();
  }
  return { adapter, sent };
}

/** Every symbol sent on a ticker subscribe, in send order (duplicates kept, so a double send is visible). */
const tickerSubs = (sent: any[]): string[] =>
  sent.filter((m) => m.method === 'subscribe' && m.params?.channel === 'ticker').flatMap((m) => m.params.symbol);
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

let logs: string[] = [];
beforeEach(() => {
  logs = [];
  vi.spyOn(console, 'log').mockImplementation((...a: any[]) => { logs.push(a.map(String).join(' ')); });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('#1222 OBJ-5 T1 — a reconnect restores the ACKed RTB symbol AND the open position', () => {
  it('T1. reconnect with {X queued by the RTB and ACKed, Y open}: both are subscribed on the new socket, each once', async () => {
    const { adapter, sent } = makeAdapter({ connected: false });
    adapter.addIntentReason(X, 'rtb:paper');
    adapter.subscribedSymbols.add(X); // ACKed on the old socket
    adapter.setI8COpenPositionsProvider(async () => [Y]);
    adapter.i8cIsReconnecting = true;

    adapter.handleOpen();
    await flush();

    const subs = tickerSubs(sent);
    expect(subs.filter((s) => s === X)).toHaveLength(1);
    expect(subs.filter((s) => s === Y)).toHaveLength(1); // the open-position helper sent it; the restore did not re-send
    expect(adapter.getIntentReasons(Y)).toEqual(['open']);
    expect(logs).toContain('[OBJ-5][RESUB] sent=1 candidates=1 reasons=rtb trigger=reconnect');
  });

  it('T1-twin. the same reconnect with X ACKed but NOT in the intent loses X — the pre-fix behaviour', async () => {
    const { adapter, sent } = makeAdapter({ connected: false });
    adapter.subscribedSymbols.add(X);
    adapter.setI8COpenPositionsProvider(async () => [Y]);
    adapter.i8cIsReconnecting = true;

    adapter.handleOpen();
    await flush();

    expect(tickerSubs(sent)).toEqual([Y]);
  });
});

describe('#1222 OBJ-5 T2 — the safe resubscribe restores a symbol that was still pending', () => {
  function stubConnect(adapter: any) {
    adapter.connect = async () => {
      adapter.isConnected = true;
      adapter.socketGeneration++;
      adapter.socketOpenedAt = Date.now();
    };
  }

  it('T2. softResubscribeAll with X pending (sent, not yet ACKed) and Z ACKed: both go out after the reconnect', async () => {
    vi.useFakeTimers();
    const { adapter, sent } = makeAdapter();
    stubConnect(adapter);
    adapter.addIntentReason(X, 'rtb:paper');
    adapter.pendingSubscriptions.add(X);
    adapter.subscribedSymbols.add(Z);

    void adapter.softResubscribeAll();
    await vi.advanceTimersByTimeAsync(4_100);

    const subs = tickerSubs(sent);
    expect(subs).toContain(Z); // the ACKed snapshot
    expect(subs.filter((s) => s === X)).toHaveLength(1); // restored from the intent
    expect(logs).toContain('[OBJ-5][RESUB] sent=1 candidates=1 reasons=rtb trigger=soft_resubscribe');
  });

  it('T2-twin. the same resubscribe with X pending but NOT in the intent loses X — the pre-fix behaviour', async () => {
    vi.useFakeTimers();
    const { adapter, sent } = makeAdapter();
    stubConnect(adapter);
    adapter.pendingSubscriptions.add(X);
    adapter.subscribedSymbols.add(Z);

    void adapter.softResubscribeAll();
    await vi.advanceTimersByTimeAsync(4_100);

    expect(tickerSubs(sent)).toEqual([Z]);
  });

  it('replays an unacknowledged RTB request on a separate socket after a slow handshake', async () => {
    vi.useFakeTimers();
    const { adapter, sent: previousFrames } = makeAdapter({ connected: false });
    adapter.addIntentReason(X, 'rtb:paper');
    adapter.subscribeToSymbols([X]);
    adapter.handleOpen();
    await flush();

    expect(tickerSubs(previousFrames)).toEqual([X]);
    expect(adapter.pendingSubscriptions.has(X)).toBe(true);
    expect(adapter.subscribedSymbols.has(X)).toBe(false);
    expect(adapter.getIntentReasons(X)).toEqual(['rtb:paper']);

    const replacementFrames: unknown[] = [];
    const replacementSocket = {
      readyState: 0,
      send: (frame: string) => replacementFrames.push(JSON.parse(frame)),
      close() {},
    };
    adapter.connect = async () => {
      adapter.ws = replacementSocket;
    };

    await adapter.softResubscribeAll();
    await vi.advanceTimersByTimeAsync(4_100);
    expect(logs).toContain('[OBJ-5][RESUB_DEFERRED] reason=not_connected intent=1 trigger=soft_resubscribe');
    expect(tickerSubs(replacementFrames)).toEqual([]);

    replacementSocket.readyState = 1;
    adapter.handleOpen();
    await flush();

    expect(tickerSubs(replacementFrames)).toEqual([X]);
    expect(tickerSubs(previousFrames)).toEqual([X]);
  });
});

describe('#1222 OBJ-5 T3 — not connected: one deferred line, then the audit restores', () => {
  it('T3. the audit writes ONE deferred line per outage, then restores on the first tick after the socket opens', async () => {
    const { adapter, sent } = makeAdapter({ connected: false });
    adapter.addIntentReason(X, 'rtb:paper');

    expect(await adapter.restoreIntent('audit')).toBe(0);
    expect(await adapter.restoreIntent('audit')).toBe(0);
    const deferred = logs.filter((l) => l.startsWith('[OBJ-5][RESUB_DEFERRED]'));
    expect(deferred).toEqual(['[OBJ-5][RESUB_DEFERRED] reason=not_connected intent=1 trigger=audit']);
    expect(tickerSubs(sent)).toEqual([]);

    adapter.isConnected = true;
    adapter.socketGeneration++;
    adapter.socketOpenedAt = Date.now();
    await adapter.i8cRunSubscriptionAudit(); // no open-position provider: the restore must still run

    expect(tickerSubs(sent)).toEqual([X]);
    expect(logs).toContain('[OBJ-5][RESUB] sent=1 candidates=1 reasons=rtb trigger=audit');
  });

  it('T3-twin. an empty intent writes no deferred line at all', async () => {
    const { adapter } = makeAdapter({ connected: false });
    await adapter.restoreIntent('audit');
    expect(logs.filter((l) => l.startsWith('[OBJ-5][RESUB_DEFERRED]'))).toEqual([]);
  });
});

describe('#1222 OBJ-5 T4 — a symbol the RTB released is not restored; a symbol another reason holds is', () => {
  it('T4. the RTB drops X from its set: X is not restored, Y (still queued) is', async () => {
    const { adapter, sent } = makeAdapter();
    adapter.replaceIntentReasonSet('rtb:paper', [X, Y]);
    adapter.replaceIntentReasonSet('rtb:paper', [Y]);

    await adapter.restoreIntent('audit');

    expect(tickerSubs(sent)).toEqual([Y]);
    expect(adapter.getIntentReasons(X)).toEqual([]);
  });

  it('T4-twin. before the release X IS restored (the release is what removes it)', async () => {
    const { adapter, sent } = makeAdapter();
    adapter.replaceIntentReasonSet('rtb:paper', [X, Y]);
    await adapter.restoreIntent('audit');
    expect(tickerSubs(sent).sort()).toEqual([Y, X].sort());
  });

  it('T4b. union semantics: an RTB release leaves the open position\'s reason, and the close of that position reports "still wanted"', async () => {
    const { adapter, sent } = makeAdapter();
    adapter.addIntentReason(X, 'open');
    adapter.replaceIntentReasonSet('rtb:paper', [X]);
    adapter.replaceIntentReasonSet('rtb:paper', []);
    expect(adapter.getIntentReasons(X)).toEqual(['open']);
    await adapter.restoreIntent('audit');
    expect(tickerSubs(sent)).toEqual([X]);

    adapter.replaceIntentReasonSet('rtb:live', [X]);
    expect(adapter.releaseIntentReason(X, 'open')).toBe(false); // the engine keeps the subscription
    expect(adapter.releaseIntentReason(X, 'rtb:live' as any)).toBe(true); // nothing wants it now
  });
});

describe('#1222 OBJ-5 P5-4 — pacing and the in-flight grace', () => {
  it('a request sent on THIS socket is not re-sent inside the grace; an un-ACKed one is retried after it', async () => {
    vi.useFakeTimers();
    const { adapter, sent } = makeAdapter();
    adapter.addIntentReason(X, 'rtb:paper');

    await adapter.restoreIntent('audit');
    await adapter.restoreIntent('audit');
    expect(tickerSubs(sent)).toEqual([X]); // in flight, not doubled

    vi.advanceTimersByTime(10_001); // no ACK arrived (a refused ticker never clears its request stamp)
    await adapter.restoreIntent('audit');
    expect(tickerSubs(sent)).toEqual([X, X]);
  });

  it('a request stamped on a socket that has since been replaced does not count as in flight', async () => {
    vi.useFakeTimers();
    const { adapter, sent } = makeAdapter();
    adapter.addIntentReason(X, 'rtb:paper');
    await adapter.restoreIntent('audit');

    vi.advanceTimersByTime(5);
    adapter.socketGeneration++;
    adapter.socketOpenedAt = Date.now(); // a new socket opened 5 ms after the request went out on the old one
    await adapter.restoreIntent('audit');
    expect(tickerSubs(sent)).toEqual([X, X]);
  });

  it('30 wanted symbols go out as a chunk of 25, then 5 one second later', async () => {
    vi.useFakeTimers();
    const { adapter, sent } = makeAdapter();
    const syms = Array.from({ length: 30 }, (_, i) => `S${i}/USD`);
    adapter.replaceIntentReasonSet('rtb:paper', syms);

    const p = adapter.restoreIntent('audit');
    await flush();
    expect(tickerSubs(sent)).toHaveLength(25);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await p).toBe(30);
    expect(new Set(tickerSubs(sent)).size).toBe(30);
  });

  it('a paced restore stops when the socket it began on is replaced mid-run', async () => {
    vi.useFakeTimers();
    const { adapter, sent } = makeAdapter();
    adapter.replaceIntentReasonSet('rtb:paper', Array.from({ length: 30 }, (_, i) => `S${i}/USD`));

    const p = adapter.restoreIntent('audit');
    await flush();
    adapter.socketGeneration++;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await p).toBe(25);
    expect(tickerSubs(sent)).toHaveLength(25);
    const runLines = logs.filter((l) => l.startsWith('[OBJ-5][RESUB'));
    expect(runLines).toEqual(['[OBJ-5][RESUB_ABORTED] reason=socket_changed sent=25 candidates=30 reasons=rtb trigger=audit']);
  });

  it('stop() clears the intent; a reconnect never does', () => {
    const { adapter } = makeAdapter();
    adapter.addIntentReason(X, 'open');
    adapter.stop();
    expect(adapter.getSubscriptionIntent()).toEqual({});
  });
});

describe('#1222 OBJ-5 Step-4 amend item 2 — one line per restore run', () => {
  const runLines = () => logs.filter((l) => l.startsWith('[OBJ-5][RESUB'));

  it('a non-audit restore with nothing to send still writes its line, so a healthy reconnect is visible', async () => {
    const { adapter } = makeAdapter();
    expect(await adapter.restoreIntent('reconnect')).toBe(0);
    expect(runLines()).toEqual(['[OBJ-5][RESUB] sent=0 candidates=0 reasons= trigger=reconnect']);
  });

  it('the 5 s audit stays silent when it has nothing to send', async () => {
    const { adapter } = makeAdapter();
    expect(await adapter.restoreIntent('audit')).toBe(0);
    expect(runLines()).toEqual([]);
  });

  it('a non-audit restore that finds one already running writes a skipped line; an audit that finds one stays silent', async () => {
    vi.useFakeTimers();
    const { adapter } = makeAdapter();
    adapter.replaceIntentReasonSet('rtb:paper', Array.from({ length: 30 }, (_, i) => `S${i}/USD`));

    const p = adapter.restoreIntent('audit');
    await flush();
    expect(await adapter.restoreIntent('reconnect')).toBe(0);
    expect(await adapter.restoreIntent('audit')).toBe(0);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await p).toBe(30);
    expect(runLines()).toEqual([
      '[OBJ-5][RESUB] sent=0 candidates=5 reasons= trigger=reconnect skipped=restore_in_progress',
      '[OBJ-5][RESUB] sent=30 candidates=30 reasons=rtb trigger=audit',
    ]);
  });
});

describe('#1222 OBJ-5 Step-4 amend item 5 — a pending symbol is in flight only through its request stamp', () => {
  it('a symbol Kraken refused after the open flush (still pending, stamp aged out) is retried', async () => {
    vi.useFakeTimers();
    const { adapter, sent } = makeAdapter();
    adapter.addIntentReason(X, 'rtb:paper');
    adapter.subscribeToSymbols([X]); // stamped + sent on this socket
    adapter.pendingSubscriptions.add(X); // the v2 rejection branch clears neither the pending entry nor the stamp
    expect(tickerSubs(sent)).toEqual([X]);

    await adapter.restoreIntent('audit');
    expect(tickerSubs(sent)).toEqual([X]); // inside the grace: in flight, not doubled

    vi.advanceTimersByTime(10_001);
    await adapter.restoreIntent('audit');
    expect(tickerSubs(sent)).toEqual([X, X]); // retried like any other refused symbol
  });

  it('twin: a pending symbol inside its grace on this socket is NOT re-sent', async () => {
    const { adapter, sent } = makeAdapter();
    adapter.addIntentReason(X, 'rtb:paper');
    adapter.subscribeToSymbols([X]);
    adapter.pendingSubscriptions.add(X);
    await adapter.restoreIntent('audit');
    expect(tickerSubs(sent)).toEqual([X]);
  });
});

describe('#1222 OBJ-5 Step-4 amend item 4 — the audit declares open for every position it names', () => {
  it('after clearAllSubscriptions empties the intent, the next audit puts open back on a still-open position, healthy or not', async () => {
    const { adapter } = makeAdapter();
    adapter.addIntentReason(X, 'open');
    adapter.addIntentReason(Y, 'open');
    adapter.clearAllSubscriptions();
    expect(adapter.getSubscriptionIntent()).toEqual({});

    adapter.subscribedSymbols.add(Y); // Y healthy (subscribed, fresh tick), X missing
    adapter.symbolStats.set(Y, { lastUpdate: Date.now() });
    adapter.setI8COpenPositionsProvider(async () => [X, Y]);
    await adapter.i8cRunSubscriptionAudit();

    expect(adapter.getIntentReasons(X)).toEqual(['open']);
    expect(adapter.getIntentReasons(Y)).toEqual(['open']);
  });

  it('twin: a symbol the provider no longer names gets no open from the audit', async () => {
    const { adapter } = makeAdapter();
    adapter.setI8COpenPositionsProvider(async () => [Y]);
    await adapter.i8cRunSubscriptionAudit();
    expect(adapter.getIntentReasons(X)).toEqual([]);
  });
});
