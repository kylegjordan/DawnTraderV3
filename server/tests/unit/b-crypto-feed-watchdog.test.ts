/**
 * B-CRYPTO-FEED-WATCHDOG (#1232, sprint row 33a) — Step 3 tests, EXECUTED.
 *   P1  one socket + at most one reconnect timer per connection; a replaced socket's late close schedules nothing;
 *       the backoff resets on the first DATA frame, not on open (open-then-silent climbs).
 *   P2  the silence check terminates and reconnects a socket with no DATA frame past its threshold; heartbeats do not count.
 *   P3  thresholds are DB rows; a missing row makes the check inert and raises the config-missing alert.
 *   P4  subscribe replies counted; no reply at all reconnects.
 *   P5  one alert after repeated fruitless forced reconnects; cleared after a full window of data.
 *   P6  the recorder's per-symbol clock: updates only (never snapshots), the universe as denominator (C1), one window for
 *       warmth and share (C2); a half-dead recorder fails the share floor, a handful of quiet coins does not.
 *   P7  the vouched-witness decision.
 * Pre-audit: Claude Comms and Packages/Scope Files/B_CRYPTO_FEED_WATCHDOG_PRE_AUDIT.md.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── a fake `ws`: every socket created is recorded; tests drive open / message / close by hand ──
const sockets = vi.hoisted(() => [] as any[]);
vi.mock('ws', async () => {
  const { EventEmitter } = await import('node:events');
  class FakeWs extends EventEmitter {
    static OPEN = 1;
    static CONNECTING = 0;
    readyState = 0;
    terminated = false;
    sent: string[] = [];
    constructor(public url: string, public opts?: { handshakeTimeout?: number }) { super(); sockets.push(this); }
    send(s: string) { this.sent.push(s); }
    terminate() { this.terminated = true; this.readyState = 3; }
    close() { this.readyState = 2; }
    // test drivers
    _open() { this.readyState = 1; this.emit('open'); }
    _msg(o: unknown) { this.emit('message', Buffer.from(JSON.stringify(o))); }
    _close(code = 1006) { this.readyState = 3; this.emit('close', code, Buffer.from('')); }
  }
  return { default: FakeWs, WebSocket: FakeWs };
});

const CFG = vi.hoisted(() => ({ rows: {} as Record<string, number> }));
const FULL_CFG: Record<string, number> = {
  crypto_spot_silence_ms: 120_000,
  futures_silence_ms: 120_000,
  recorder_watch_consecutive_forced_alert: 3,
  recorder_watch_forced_per_hour_alert: 12,
  recorder_watch_clear_after_data_ms: 600_000,
  recorder_subscribe_reply_timeout_ms: 15_000,
};
vi.mock('../../services/module-constants-service.js', () => ({
  getCachedNumberRequired: (_m: string, name: string) => {
    const v = CFG.rows[name];
    if (v === undefined) throw new Error(`module_constants: required row missing for ${name}`);
    return v;
  },
  getCachedConstant: () => undefined,
}));
vi.mock('../../services/passive-archive/ohlc-batch-writer.js', () => ({ bufferOhlcBar: () => {} }));
vi.mock('../../services/passive-archive/ticker-batch-writer.js', () => ({ bufferTickerSnap: () => {} }));

import {
  RecorderConnection,
  decideSilence,
  decideRecorderAlert,
  decideRecorderAlertClear,
  _setRecorderAlertDepsForTests,
  _resetRecorderRegistryForTests,
} from '../../services/passive-archive/recorder-connection.js';
import {
  _makeShardForTests,
  _handleCryptoMessageForTests,
  _installShardsForTests,
  _resetCryptoRecorderClockForTests,
  getCryptoRecorderSymbolAges,
  isCryptoRecorderWarm,
  isInCryptoRecorderUniverse,
  isCryptoRecorderSymbolConnectionLive,
} from '../../services/passive-archive/crypto-spot-archiver.js';
import { decideWitnessVouch } from '../../core/trading/witness-vouch.js';
import { proportionFresh } from '../../services/market-data/feed-health-aggregate.js';

const alerts = { added: [] as any[], resolved: [] as string[] };
const T0 = new Date('2026-11-05T10:00:00Z').getTime();

function makeConn(over: Partial<ConstructorParameters<typeof RecorderConnection>[0]> = {}) {
  return new RecorderConnection({
    label: 'test][shard0',
    recorderKey: 'test:shard0',
    silenceConstant: 'crypto_spot_silence_ms',
    url: 'wss://example.invalid',
    configAssetClass: 'crypto_spot',
    onOpen: (ws) => ws.send('subscribe'),
    onMessage: (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.method === 'subscribe') { conn.noteSubscribeReply(m.success === true, m.symbol ?? null); return { data: false, kind: 'subscribe' }; }
      return { data: m.channel === 'ticker', kind: m.channel ?? 'other' };
    },
    isEnabled: () => true,
    expectedSubscribeReplies: () => 0,
    ...over,
  });
}
let conn: RecorderConnection;
const last = () => sockets[sockets.length - 1];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  sockets.length = 0;
  CFG.rows = { ...FULL_CFG };
  alerts.added = []; alerts.resolved = [];
  _setRecorderAlertDepsForTests(async () => ({
    addAlert: async (o: any) => { alerts.added.push(o); return o; },
    resolveByKey: async (k: string) => { alerts.resolved.push(k); return [k]; },
  }));
  _resetRecorderRegistryForTests();
  _resetCryptoRecorderClockForTests();
});
afterEach(() => {
  _resetRecorderRegistryForTests();
  _setRecorderAlertDepsForTests(null);
  vi.useRealTimers();
});

describe('P2 — the silence decision (pure)', () => {
  const base = { open: true, reconnectPending: false, nowMs: T0, lastDataAtMs: T0 - 1_000, openedAtMs: T0 - 600_000, silenceMs: 120_000 };
  it('data inside the threshold is ok', () => expect(decideSilence(base)).toBe('ok'));
  it('no data past the threshold forces a reconnect', () =>
    expect(decideSilence({ ...base, lastDataAtMs: T0 - 120_001 })).toBe('force'));
  it('a fresh socket gets its full threshold from the open, not from old data', () =>
    expect(decideSilence({ ...base, lastDataAtMs: T0 - 900_000, openedAtMs: T0 - 60_000 })).toBe('ok'));
  it('not open, or a reconnect already pending, is skipped (the timer owns it)', () => {
    expect(decideSilence({ ...base, open: false, lastDataAtMs: 0 })).toBe('skip');
    expect(decideSilence({ ...base, reconnectPending: true, lastDataAtMs: T0 - 900_000 })).toBe('skip');
  });
});

describe('P1 — one socket, one timer, reset on data', () => {
  it('a replaced socket\'s late close schedules NO second reconnect', () => {
    conn = makeConn();
    conn.connect();
    const first = last();
    first._open();
    conn.forceReconnect('test', Date.now());          // terminates `first`, schedules ONE reconnect
    expect(first.terminated).toBe(true);
    expect(conn.reconnectPending).toBe(true);
    first._close();                                    // the old socket's late close (listeners were removed)
    vi.advanceTimersByTime(1_000);                     // the single timer fires
    expect(sockets.length).toBe(2);                    // exactly one new socket
    expect(conn.reconnectPending).toBe(false);
    vi.advanceTimersByTime(60_000);
    expect(sockets.length).toBe(2);                    // and nothing else opened later
  });
  it('every socket is created with a handshake timeout (a socket stuck CONNECTING is never silence-checked)', () => {
    conn = makeConn();
    conn.connect();
    expect(last().opts?.handshakeTimeout).toBe(15_000);
  });
  it('scheduleReconnect is idempotent while one is pending', () => {
    conn = makeConn();
    conn.connect();
    last()._open();
    last()._close();
    conn.scheduleReconnect();
    conn.scheduleReconnect();
    vi.advanceTimersByTime(30_000);
    expect(sockets.length).toBe(2);
  });
  it('open-then-silent cycles CLIMB the backoff; the first data frame resets it', () => {
    conn = makeConn();
    conn.connect();
    const delays: number[] = [];
    for (let i = 0; i < 4; i++) {
      last()._open();                                  // opens, never sends data
      const before = sockets.length;
      conn.forceReconnect('silent', Date.now());
      const t = (conn as any).reconnectTimer;
      expect(t).not.toBeNull();
      // read the delay the timer was armed with by advancing until the new socket appears
      let waited = 0;
      while (sockets.length === before && waited < 120_000) { vi.advanceTimersByTime(500); waited += 500; }
      delays.push(waited);
    }
    expect(delays[0]).toBeLessThan(delays[2]);         // 1 s, 2 s, 4 s, 8 s — climbing, not stuck at 1 s
    last()._open();
    last()._msg({ channel: 'ticker', type: 'update', data: [{ symbol: 'X/USD' }] });
    expect(conn.backoff.attempts()).toBe(0);           // reset on DATA
  });
  it('an open alone does NOT reset the backoff', () => {
    conn = makeConn();
    conn.connect();
    last()._open();
    conn.forceReconnect('silent', Date.now());
    vi.advanceTimersByTime(1_000);
    last()._open();
    expect(conn.backoff.attempts()).toBe(1);
  });
});

describe('P2/P3 — the watch tick', () => {
  it('a socket with only HEARTBEATS past the threshold is forced (heartbeats are not data)', async () => {
    conn = makeConn();
    conn.connect();
    last()._open();
    last()._msg({ channel: 'ticker', type: 'update', data: [{ symbol: 'X/USD' }] });
    for (let i = 0; i < 5; i++) { vi.advanceTimersByTime(30_000); last()._msg({ channel: 'heartbeat' }); }
    const d = await conn.watchTick(Date.now());
    expect(d).toBe('force');
    expect(sockets[0].terminated).toBe(true);
  });
  it('data within the threshold is left alone', async () => {
    conn = makeConn();
    conn.connect();
    last()._open();
    vi.advanceTimersByTime(60_000);
    last()._msg({ channel: 'ticker', type: 'update', data: [{ symbol: 'X/USD' }] });
    expect(await conn.watchTick(Date.now())).toBe('ok');
    expect(sockets[0].terminated).toBe(false);
  });
  it('a missing DB row makes the check INERT and raises the config-missing alert once', async () => {
    delete CFG.rows.crypto_spot_silence_ms;
    conn = makeConn();
    conn.connect();
    last()._open();
    vi.advanceTimersByTime(600_000);
    expect(await conn.watchTick(Date.now())).toBe('skip');
    expect(await conn.watchTick(Date.now())).toBe('skip');
    await Promise.resolve();
    const missing = alerts.added.filter((a) => a.dedupe_key === 'passive-archive-config-missing');
    expect(missing.length).toBe(1);
    expect(sockets[0].terminated).toBe(false);
  });
});

describe('P4 — subscribe replies', () => {
  it('no reply at all within the timeout reconnects; replies received do not', () => {
    conn = makeConn({ expectedSubscribeReplies: () => 4 });
    conn.connect();
    last()._open();
    vi.advanceTimersByTime(15_001);
    expect(sockets[0].terminated).toBe(true);
    vi.advanceTimersByTime(2_000);
    last()._open();
    last()._msg({ method: 'subscribe', success: true, result: { channel: 'ticker', symbol: 'A/USD' } });
    last()._msg({ method: 'subscribe', success: false, error: 'Currency pair not supported NOTACOIN/USD', symbol: 'NOTACOIN/USD' });
    vi.advanceTimersByTime(15_001);
    expect(last().terminated).toBe(false);
    expect(conn.subscribeOk).toBe(1);
    expect(conn.subscribeRejected).toEqual(['NOTACOIN/USD']);
  });
});

describe('P5 — the alert', () => {
  it('pure: raise on a streak of 3 fruitless forced reconnects, or > 12 in an hour', () => {
    const cfg = { consecutiveForcedAlert: 3, forcedPerHourAlert: 12 };
    expect(decideRecorderAlert({ consecutiveForced: 2, forcedInLastHour: 2, cfg })).toBe(false);
    expect(decideRecorderAlert({ consecutiveForced: 3, forcedInLastHour: 3, cfg })).toBe(true);
    expect(decideRecorderAlert({ consecutiveForced: 0, forcedInLastHour: 13, cfg })).toBe(true);
  });
  it('pure: clears only after a full window of data on the current socket', () => {
    expect(decideRecorderAlertClear({ dataLive: true, liveSinceMs: T0 - 599_999, nowMs: T0, clearAfterDataMs: 600_000 })).toBe(false);
    expect(decideRecorderAlertClear({ dataLive: true, liveSinceMs: T0 - 600_000, nowMs: T0, clearAfterDataMs: 600_000 })).toBe(true);
    expect(decideRecorderAlertClear({ dataLive: false, liveSinceMs: T0 - 900_000, nowMs: T0, clearAfterDataMs: 600_000 })).toBe(false);
  });
  it('end to end: three silent cycles raise ONE alert; ten minutes of data resolve it', async () => {
    conn = makeConn();
    conn.connect();
    for (let i = 0; i < 3; i++) {
      last()._open();
      vi.advanceTimersByTime(121_000);
      await conn.watchTick(Date.now());
      vi.advanceTimersByTime(10_000); // the reconnect timer fires
    }
    await conn.watchTick(Date.now());
    const silent = alerts.added.filter((a) => a.dedupe_key === 'passive-archive-silent:test:shard0');
    expect(silent.length).toBe(1);
    last()._open();
    last()._msg({ channel: 'ticker', type: 'update', data: [{ symbol: 'X/USD' }] });
    for (let i = 0; i < 21; i++) {
      vi.advanceTimersByTime(30_000);
      last()._msg({ channel: 'ticker', type: 'update', data: [{ symbol: 'X/USD' }] });
      await conn.watchTick(Date.now());
    }
    expect(alerts.resolved).toEqual(['passive-archive-silent:test:shard0']);
  });
});

describe('P6 — the crypto recorder\'s per-symbol clock (C1, C2)', () => {
  it('a ticker UPDATE stamps the symbol; a SNAPSHOT does not; heartbeats and replies carry no data', () => {
    const sh = _makeShardForTests(0, ['A/USD', 'B/USD']);
    _installShardsForTests([sh]);
    expect(_handleCryptoMessageForTests(sh, Buffer.from(JSON.stringify({ channel: 'ticker', type: 'snapshot', data: [{ symbol: 'A/USD', bid: 1, ask: 2 }] }))).data).toBe(true);
    expect(getCryptoRecorderSymbolAges(Date.now()).find((r) => r.symbol === 'A/USD')!.ageMs).toBeNull();
    _handleCryptoMessageForTests(sh, Buffer.from(JSON.stringify({ channel: 'ticker', type: 'update', data: [{ symbol: 'A/USD', bid: 1, ask: 2 }] })));
    expect(getCryptoRecorderSymbolAges(Date.now()).find((r) => r.symbol === 'A/USD')!.ageMs).toBe(0);
    expect(_handleCryptoMessageForTests(sh, Buffer.from(JSON.stringify({ channel: 'heartbeat' }))).data).toBe(false);
    expect(_handleCryptoMessageForTests(sh, Buffer.from(JSON.stringify({ method: 'subscribe', success: true, result: {} }))).data).toBe(false);
  });
  it('C1: the denominator is the subscribed universe — a symbol that never updated is a null, not missing', () => {
    const sh = _makeShardForTests(0, ['A/USD', 'B/USD', 'C/USD', 'D/USD']);
    _installShardsForTests([sh]);
    _handleCryptoMessageForTests(sh, Buffer.from(JSON.stringify({ channel: 'ticker', type: 'update', data: [{ symbol: 'A/USD' }] })));
    const ages = getCryptoRecorderSymbolAges(Date.now(), 0);
    expect(ages.length).toBe(4);
    expect(proportionFresh(ages, 7_200_000)).toBe(0.25); // 1 of 4 — a dark shard reads dark
  });
  it('C2: warm only once a FULL window has passed since the first update (blind for the first window)', () => {
    const sh = _makeShardForTests(0, ['A/USD']);
    _installShardsForTests([sh]);
    _handleCryptoMessageForTests(sh, Buffer.from(JSON.stringify({ channel: 'ticker', type: 'update', data: [{ symbol: 'A/USD' }] })));
    expect(isCryptoRecorderWarm(Date.now() + 7_199_999, 7_200_000)).toBe(false);
    expect(isCryptoRecorderWarm(Date.now() + 7_200_000, 7_200_000)).toBe(true);
  });
  it('the share floor: half the universe dark fails 0.60; a handful of quiet coins does not', () => {
    const now = Date.now();
    const half = Array.from({ length: 200 }, (_, i) => ({ symbol: `S${i}`, ageMs: i < 100 ? 1_000 : null }));
    const quiet = Array.from({ length: 200 }, (_, i) => ({ symbol: `S${i}`, ageMs: i < 8 ? 9_000_000 : 1_000 }));
    expect(proportionFresh(half, 7_200_000)).toBeLessThan(0.60);
    expect(proportionFresh(quiet, 7_200_000)).toBeGreaterThanOrEqual(0.60);
    expect(now).toBe(T0);
  });
  it('C3: universe membership and connection liveness are answered in memory; unknown is null, never live', () => {
    const sh = _makeShardForTests(0, ['A/USD']);
    _installShardsForTests([sh]);
    expect(isInCryptoRecorderUniverse('A/USD')).toBe(true);
    expect(isInCryptoRecorderUniverse('GLMR/USD')).toBe(false);
    expect(isCryptoRecorderSymbolConnectionLive('GLMR/USD', Date.now())).toBeNull();
    expect(isCryptoRecorderSymbolConnectionLive('A/USD', Date.now())).toBeNull(); // no connection on a test shard
  });
});

describe('P7 — the vouched witness', () => {
  const base = { inRecorderUniverse: true, connectionLive: true as boolean | null, capturedAtMs: T0 - 60_000, nowMs: T0, maxAgeMs: 21_600_000 };
  it('a fresh witness on a live connection is vouched', () => expect(decideWitnessVouch(base)).toEqual({ vouched: true, reason: 'vouched', ageMs: 60_000 }));
  it('the GLMR/USD shape: not in the recorder ⇒ not vouched', () =>
    expect(decideWitnessVouch({ ...base, inRecorderUniverse: false }).reason).toBe('not_in_recorder'));
  it('the 2026-10-21 shape: the connection is silent ⇒ not vouched, however recent the row looks', () =>
    expect(decideWitnessVouch({ ...base, connectionLive: false }).reason).toBe('connection_not_live'));
  it('unknown liveness is never treated as live', () =>
    expect(decideWitnessVouch({ ...base, connectionLive: null }).reason).toBe('liveness_unknown'));
  it('past the ceiling ⇒ not vouched; at the ceiling ⇒ vouched', () => {
    expect(decideWitnessVouch({ ...base, capturedAtMs: T0 - 21_600_001 }).reason).toBe('too_old');
    expect(decideWitnessVouch({ ...base, capturedAtMs: T0 - 21_600_000 }).vouched).toBe(true);
  });
});
