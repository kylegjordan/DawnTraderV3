/**
 * B-UNIVERSE-REFRESH-ACTS (#1018, KD-26) — Step 3 P11b: the RECORDER half, EXECUTED against real shard connections
 * (a fake `ws`, the real RecorderConnection and the real archiver). Pre-audit §2.3-§2.10.
 *   - an add to a running shard is an incremental subscribe with its own req_id, never a reconnect;
 *     confirmed needs both channels; one rejection or the reply timeout withdraws it (state + unsubscribe), no reconnect
 *   - a shard emptied by drops is resolved BEFORE its socket closes; ids are never reused
 *   - nothing already placed moves; the shard size is a DB row with no fallback, read only when there are fresh adds
 *   - an empty boot starts nothing and the first refresh starts the recorder
 *   - the add grace: a new symbol is not gradable until it ticks or one window passes; the age list tracks the universe
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
    _open() { this.readyState = 1; this.emit('open'); }
    _msg(o: unknown) { this.emit('message', Buffer.from(JSON.stringify(o))); }
    _close(code = 1006) { this.readyState = 3; this.emit('close', code, Buffer.from('')); }
  }
  return { default: FakeWs, WebSocket: FakeWs };
});

const CFG = vi.hoisted(() => ({ rows: {} as Record<string, number> }));
const UNI = vi.hoisted(() => ({ symbols: [] as string[] }));
const FULL_CFG: Record<string, number> = {
  crypto_spot_silence_ms: 120_000,
  futures_silence_ms: 120_000,
  recorder_watch_consecutive_forced_alert: 3,
  recorder_watch_forced_per_hour_alert: 12,
  recorder_watch_clear_after_data_ms: 600_000,
  recorder_subscribe_reply_timeout_ms: 15_000,
  b74_crypto_ws_shard_size: 300,
};
vi.mock('../../services/module-constants-service.js', () => ({
  getCachedNumberRequired: (_m: string, name: string) => {
    const v = CFG.rows[name];
    if (v === undefined) throw new Error(`module_constants: required row missing for ${name}`);
    return v;
  },
  getCachedConstant: () => undefined,
  prefetchModule: async () => {},
  GLOBAL_KEY: {},
}));
vi.mock('../../services/passive-archive/ohlc-batch-writer.js', () => ({ bufferOhlcBar: () => {} }));
vi.mock('../../services/passive-archive/ticker-batch-writer.js', () => ({ bufferTickerSnap: () => {} }));
vi.mock('../../services/passive-archive/universe-loader.js', () => ({
  loadCryptoSpotUniverse: async () => ({ symbols: [...UNI.symbols], batches: [] }),
}));
vi.mock('../../services/passive-archive/crypto-universe-pins.js', () => ({ readCryptoUniversePins: async () => [] }));

import {
  _setRecorderAlertDepsForTests,
  _resetRecorderRegistryForTests,
} from '../../services/passive-archive/recorder-connection.js';
import {
  startCryptoSpotArchiver,
  applyCryptoUniverseChange,
  takeCryptoAddFailures,
  getCryptoRecorderSymbolAges,
  getCryptoRecorderShardIds,
  getCryptoRecorderRunningSymbols,
  _resetCryptoRecorderClockForTests,
} from '../../services/passive-archive/crypto-spot-archiver.js';
import { isValidResolutionEvidence } from '../../services/system-alerts.js';

const T0 = new Date('2026-11-05T10:00:00Z').getTime();
const WINDOW = 60_000;
/** For each resolve: the key, and whether that shard's socket was already terminated at that moment. */
const alerts = { resolved: [] as { key: string; socketTerminated: boolean | null }[] };
/** recorderKey shard id -> the socket opened for it (sockets are created in launch order). */
const socketOfShard = new Map<number, any>();

const frames = (s: any) => s.sent.map((x: string) => JSON.parse(x));
/** The req_id'd frames of one method on a socket. */
const reqFrames = (s: any, method: string) => frames(s).filter((f: any) => f.method === method && typeof f.req_id === 'number');
const shardOf = () => {
  const m = new Map<string, number>();
  for (const id of getCryptoRecorderShardIds()) for (const r of getCryptoRecorderSymbolAges(Date.now(), id)) m.set(r.symbol, id);
  return m;
};
const gradable = (sym: string) => getCryptoRecorderSymbolAges(Date.now(), undefined, WINDOW).find((r) => r.symbol === sym)?.gradable;

/** Boot with a universe and a shard size, and map each shard id to its socket. */
async function boot(symbols: string[], shardSize = 300) {
  UNI.symbols = symbols;
  CFG.rows.b74_crypto_ws_shard_size = shardSize;
  const before = sockets.length;
  await startCryptoSpotArchiver();
  getCryptoRecorderShardIds().forEach((id, i) => socketOfShard.set(id, sockets[before + i]));
}
/** Open a socket and answer its open-time subscribe frames (no req_id) the way Kraken does: one reply per symbol per channel. */
function openAndAnswer(s: any) {
  s._open();
  for (const f of frames(s).filter((x: any) => x.method === 'subscribe' && x.req_id === undefined)) {
    for (const sym of f.params.symbol) s._msg({ method: 'subscribe', success: true, result: { channel: f.params.channel, symbol: sym } });
  }
}
const ok = (s: any, sym: string, reqId: number) => s._msg({ method: 'subscribe', success: true, result: { symbol: sym }, req_id: reqId });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  sockets.length = 0;
  socketOfShard.clear();
  CFG.rows = { ...FULL_CFG };
  UNI.symbols = [];
  alerts.resolved = [];
  _setRecorderAlertDepsForTests(async () => ({
    addAlert: async (o: any) => o,
    resolveByKey: async (k: string, _by: string, evidence: string) => {
      expect(isValidResolutionEvidence(evidence)).toBe(true);
      const id = Number(k.split(':shard')[1]);
      alerts.resolved.push({ key: k, socketTerminated: socketOfShard.get(id)?.terminated ?? null });
      return [k];
    },
    hasOpen: async () => false,
  }));
  _resetRecorderRegistryForTests();
  _resetCryptoRecorderClockForTests();
  takeCryptoAddFailures();
});
afterEach(() => {
  _resetRecorderRegistryForTests();
  _resetCryptoRecorderClockForTests();
  _setRecorderAlertDepsForTests(null);
  vi.useRealTimers();
});

describe('an add to a running shard — incremental, with its own req_id, never a reconnect', () => {
  it('sends ohlc + ticker subscribe frames carrying one req_id for the new symbol, on the existing socket', async () => {
    await boot(['A/USD', 'B/USD']);
    const s = sockets[0];
    openAndAnswer(s);
    const res = await applyCryptoUniverseChange({ add: ['C/USD'], drop: [], occurrenceId: 'occ-1' });
    expect(res).toEqual({
      added: ['C/USD'], dropped: [], untrackedOverflowAdds: [], shardsOpened: [], shardsStopped: [],
    });
    const adds = reqFrames(s, 'subscribe');
    expect(adds.map((f: any) => f.params.channel)).toEqual(['ohlc', 'ticker']);
    expect(adds.every((f: any) => JSON.stringify(f.params.symbol) === '["C/USD"]')).toBe(true);
    expect(new Set(adds.map((f: any) => f.req_id)).size).toBe(1);
    expect(sockets.length).toBe(1);
    expect(s.terminated).toBe(false);
  });

  it('is confirmed only by BOTH channel replies; confirmed starts the grace clock, and nothing is withdrawn', async () => {
    await boot(['A/USD', 'B/USD']);
    const s = sockets[0];
    openAndAnswer(s);
    await applyCryptoUniverseChange({ add: ['C/USD'], drop: [], occurrenceId: 'occ-1' });
    const r = reqFrames(s, 'subscribe')[0].req_id;
    ok(s, 'C/USD', r);
    await vi.advanceTimersByTimeAsync(15_001); // one reply only: the timeout withdraws it
    expect(takeCryptoAddFailures()).toEqual({ rejected: [], unconfirmed: ['C/USD'] });
    expect(getCryptoRecorderRunningSymbols()).toEqual(['A/USD', 'B/USD']);

    await applyCryptoUniverseChange({ add: ['D/USD'], drop: [], occurrenceId: 'occ-2' });
    const r2 = reqFrames(s, 'subscribe').filter((f: any) => f.params.symbol[0] === 'D/USD')[0].req_id;
    ok(s, 'D/USD', r2);
    ok(s, 'D/USD', r2);
    await vi.advanceTimersByTimeAsync(15_001);
    expect(takeCryptoAddFailures()).toEqual({ rejected: [], unconfirmed: [] });
    expect(getCryptoRecorderRunningSymbols()).toEqual(['A/USD', 'B/USD', 'D/USD']);
    expect(sockets.length).toBe(1);
    expect(s.terminated).toBe(false);
  });

  it('one rejected reply withdraws it: gone from the universe, recorded as rejected, unsubscribed, no reconnect', async () => {
    await boot(['A/USD', 'B/USD']);
    const s = sockets[0];
    openAndAnswer(s);
    await applyCryptoUniverseChange({ add: ['C/USD'], drop: [], occurrenceId: 'occ-1' });
    const r = reqFrames(s, 'subscribe')[0].req_id;
    s._msg({ method: 'subscribe', success: false, symbol: 'C/USD', req_id: r, error: 'Currency pair not supported' });
    expect(getCryptoRecorderRunningSymbols()).toEqual(['A/USD', 'B/USD']);
    expect(takeCryptoAddFailures()).toEqual({ rejected: ['C/USD'], unconfirmed: [] });
    const unsub = reqFrames(s, 'unsubscribe');
    expect(unsub.map((f: any) => f.params.channel)).toEqual(['ohlc', 'ticker']);
    expect(unsub.every((f: any) => JSON.stringify(f.params.symbol) === '["C/USD"]')).toBe(true);
    expect(sockets.length).toBe(1);
    expect(s.terminated).toBe(false);
  });

  it('a rejected add that empties its shard retires it with evidence accepted by the production validator', async () => {
    await boot(['A/USD'], 2);
    const s = sockets[0];
    openAndAnswer(s);
    await applyCryptoUniverseChange({ add: ['C/USD'], drop: [], occurrenceId: 'occ-1' });
    const r = reqFrames(s, 'subscribe')[0].req_id;
    await applyCryptoUniverseChange({ add: [], drop: ['A/USD'], occurrenceId: 'occ-2' });
    s._msg({ method: 'subscribe', success: false, symbol: 'C/USD', req_id: r, error: 'Currency pair not supported' });
    await vi.advanceTimersByTimeAsync(0);

    expect(getCryptoRecorderRunningSymbols()).toEqual([]);
    expect(takeCryptoAddFailures()).toEqual({ rejected: ['C/USD'], unconfirmed: [] });
    expect(alerts.resolved.some((x) => x.key.endsWith(':shard0'))).toBe(true);
  });

  it('no reply within the timeout withdraws it as unconfirmed, unsubscribed, no reconnect', async () => {
    await boot(['A/USD', 'B/USD']);
    const s = sockets[0];
    openAndAnswer(s);
    await applyCryptoUniverseChange({ add: ['C/USD'], drop: [], occurrenceId: 'occ-1' });
    await vi.advanceTimersByTimeAsync(14_000);
    expect(getCryptoRecorderRunningSymbols()).toContain('C/USD'); // control: still pending before the timeout
    await vi.advanceTimersByTimeAsync(1_001);
    expect(getCryptoRecorderRunningSymbols()).toEqual(['A/USD', 'B/USD']);
    expect(takeCryptoAddFailures()).toEqual({ rejected: [], unconfirmed: ['C/USD'] });
    expect(reqFrames(s, 'unsubscribe').length).toBe(2);
    expect(sockets.length).toBe(1);
    expect(s.terminated).toBe(false);
  });

  it('an unsubscribe reply (ok or failed) touches no pending add — the add still confirms afterwards', async () => {
    await boot(['A/USD', 'B/USD']);
    const s = sockets[0];
    openAndAnswer(s);
    await applyCryptoUniverseChange({ add: ['C/USD'], drop: ['A/USD'], occurrenceId: 'occ-1' });
    const r = reqFrames(s, 'subscribe')[0].req_id;
    s._msg({ method: 'unsubscribe', success: true, result: { symbol: 'A/USD' }, req_id: r + 1 });
    s._msg({ method: 'unsubscribe', success: false, symbol: 'C/USD', req_id: r + 1, error: 'x' });
    expect(getCryptoRecorderRunningSymbols()).toEqual(['B/USD', 'C/USD']);
    ok(s, 'C/USD', r);
    ok(s, 'C/USD', r);
    await vi.advanceTimersByTimeAsync(15_001);
    expect(takeCryptoAddFailures()).toEqual({ rejected: [], unconfirmed: [] });
    expect(getCryptoRecorderRunningSymbols()).toEqual(['B/USD', 'C/USD']);
  });

  it('a queued add survives a socket close and confirms from the no-req_id replies on reopen', async () => {
    await boot(['A/USD', 'B/USD']);
    const first = sockets[0];
    openAndAnswer(first);
    first._close();

    const res = await applyCryptoUniverseChange({ add: ['C/USD'], drop: [], occurrenceId: 'occ-reopen' });
    expect(res.added).toEqual(['C/USD']);
    expect(reqFrames(first, 'subscribe').filter((f: any) => f.params.symbol.includes('C/USD'))).toEqual([]);

    await vi.advanceTimersByTimeAsync(1_000);
    const reopened = sockets[1];
    openAndAnswer(reopened);
    await vi.advanceTimersByTimeAsync(15_001);

    const replayFrames = frames(reopened).filter((f: any) => f.method === 'subscribe' && f.req_id === undefined);
    expect(replayFrames.length).toBe(2);
    expect(replayFrames.every((f: any) => f.params.symbol.includes('C/USD'))).toBe(true);
    expect(getCryptoRecorderRunningSymbols()).toEqual(['A/USD', 'B/USD', 'C/USD']);
    expect(takeCryptoAddFailures()).toEqual({ rejected: [], unconfirmed: [] });
    expect(reopened.terminated).toBe(false);
  });
});

describe('drops — an emptied shard is resolved, then stopped; ids are never reused', () => {
  // Shard size 2 with four symbols: two boot shards. Placement is by hash, so the test reads which symbol landed where.
  const FOUR = ['A/USD', 'B/USD', 'C/USD', 'D/USD'];

  it('dropping every symbol of one shard resolves its watchdog row BEFORE its socket closes, and removes it', async () => {
    await boot(FOUR, 2);
    const ids = getCryptoRecorderShardIds();
    expect(ids).toEqual([0, 1]);
    for (const id of ids) openAndAnswer(socketOfShard.get(id));
    const byShard = shardOf();
    const victim = 1;
    const syms = [...byShard].filter(([, id]) => id === victim).map(([s]) => s);
    expect(syms.length).toBeGreaterThan(0); // control: the hash put symbols on the victim shard

    const res = await applyCryptoUniverseChange({ add: [], drop: syms, occurrenceId: 'occ-9' });
    expect(res.shardsStopped).toEqual([victim]);
    expect(alerts.resolved).toEqual([{ key: `passive-archive-silent:crypto-spot:shard${victim}`, socketTerminated: false }]);
    expect(socketOfShard.get(victim).terminated).toBe(true);
    expect(socketOfShard.get(0).terminated).toBe(false);
    expect(getCryptoRecorderShardIds()).toEqual([0]);
    expect(reqFrames(socketOfShard.get(victim), 'unsubscribe')).toEqual([]); // stopped, not unsubscribed
  });

  it('a partial drop unsubscribes on the shard and keeps it running', async () => {
    await boot(['A/USD', 'B/USD', 'C/USD']); // one shard of three: dropping one leaves it running
    openAndAnswer(sockets[0]);
    const [sym, id] = ['B/USD', 0];
    await applyCryptoUniverseChange({ add: [], drop: [sym], occurrenceId: 'occ-9' });
    const unsub = reqFrames(socketOfShard.get(id), 'unsubscribe');
    expect(unsub.length).toBe(2);
    expect(unsub[0].params.symbol).toEqual([sym]);
    expect(getCryptoRecorderShardIds()).toContain(id);
    expect(alerts.resolved).toEqual([]);
  });

  it('a later overflow opens new shards with ids above every earlier one — a stopped id is never reused', async () => {
    await boot(FOUR, 2);
    for (const id of getCryptoRecorderShardIds()) openAndAnswer(socketOfShard.get(id));
    const byShard = shardOf();
    const victimSyms = [...byShard].filter(([, id]) => id === 1).map(([s]) => s);
    await applyCryptoUniverseChange({ add: [], drop: victimSyms, occurrenceId: 'occ-1' });
    // Placement is by hash, so shard 0 holds however many it got; set the size to exactly that so it is full
    // and every add overflows into new shards (the size is read per apply).
    const left = getCryptoRecorderSymbolAges(Date.now(), 0).length;
    expect(left).toBeGreaterThan(0);
    CFG.rows.b74_crypto_ws_shard_size = left;
    const adds = Array.from({ length: left + 1 }, (_, i) => `N${i}/USD`); // one more than a shard holds: two new shards
    const res = await applyCryptoUniverseChange({ add: adds, drop: [], occurrenceId: 'occ-2' });
    expect(res.shardsOpened).toEqual([2, 3]);
    expect(res.untrackedOverflowAdds).toEqual(adds);
    expect(getCryptoRecorderShardIds()).toEqual([0, 2, 3]);
  });

  it('nothing already placed moves when other symbols are added and dropped', async () => {
    await boot(['A/USD', 'B/USD', 'C/USD', 'D/USD', 'E/USD'], 3);
    for (const id of getCryptoRecorderShardIds()) openAndAnswer(socketOfShard.get(id));
    const before = shardOf();
    const dropped = 'A/USD';
    await applyCryptoUniverseChange({ add: ['X/USD', 'Y/USD'], drop: [dropped], occurrenceId: 'occ-1' });
    const after = shardOf();
    for (const [sym, id] of before) if (sym !== dropped) expect(after.get(sym)).toBe(id);
    expect(after.has(dropped)).toBe(false);
  });
});

describe('the shard size — a DB row with no fallback', () => {
  it('a missing row makes an apply with fresh adds reject; an apply with only drops never reads it', async () => {
    await boot(['A/USD', 'B/USD', 'C/USD']);
    openAndAnswer(sockets[0]);
    delete CFG.rows.b74_crypto_ws_shard_size;
    await expect(applyCryptoUniverseChange({ add: ['D/USD'], drop: [], occurrenceId: 'occ-1' })).rejects.toThrow(/b74_crypto_ws_shard_size/);
    await expect(applyCryptoUniverseChange({ add: ['B/USD'], drop: ['A/USD'], occurrenceId: 'occ-2' })).resolves.toMatchObject({ dropped: ['A/USD'], added: [] });
  });

  it('a changed size changes placement: a shard at the new size is full, so adds open a new shard', async () => {
    await boot(['A/USD', 'B/USD']);
    openAndAnswer(sockets[0]);
    CFG.rows.b74_crypto_ws_shard_size = 2;
    const res = await applyCryptoUniverseChange({ add: ['C/USD', 'D/USD'], drop: [], occurrenceId: 'occ-1' });
    expect(res.shardsOpened).toEqual([1]);
    expect(sockets.length).toBe(2);
    expect(reqFrames(sockets[0], 'subscribe')).toEqual([]); // the full shard got no add frames
  });

  it('a non-positive size is refused', async () => {
    await boot(['A/USD']);
    CFG.rows.b74_crypto_ws_shard_size = 0;
    await expect(applyCryptoUniverseChange({ add: ['B/USD'], drop: [], occurrenceId: 'occ-1' })).rejects.toThrow(/positive integer/);
  });
});

describe('an empty boot, then the first refresh', () => {
  it('an empty universe starts nothing; the first refresh opens a shard and the symbols are graced until they tick or a window passes', async () => {
    await boot([]);
    expect(sockets.length).toBe(0);
    expect(getCryptoRecorderShardIds()).toEqual([]);

    const res = await applyCryptoUniverseChange({ add: ['A/USD', 'B/USD'], drop: [], occurrenceId: 'occ-1' });
    expect(res.shardsOpened).toEqual([0]);
    expect(sockets.length).toBe(1);
    expect(getCryptoRecorderRunningSymbols()).toEqual(['A/USD', 'B/USD']);
    // The new shard subscribes on open like a boot shard (no req_id frames).
    openAndAnswer(sockets[0]);
    expect(reqFrames(sockets[0], 'subscribe')).toEqual([]);

    expect(gradable('A/USD')).toBe(false);
    expect(gradable('B/USD')).toBe(false);
    sockets[0]._msg({ channel: 'ticker', type: 'update', data: [{ symbol: 'A/USD', bid: 1, ask: 1.01, last: 1 }] });
    expect(gradable('A/USD')).toBe(true); // ticked since it was added
    expect(gradable('B/USD')).toBe(false);
    vi.setSystemTime(T0 + WINDOW);
    expect(gradable('B/USD')).toBe(true); // one window since it started its clock
  });
});

describe('the add grace and the age list', () => {
  it('a boot symbol is gradable at once; an unconfirmed add never is; a confirmed add is after one window', async () => {
    await boot(['A/USD']);
    const s = sockets[0];
    openAndAnswer(s);
    expect(gradable('A/USD')).toBe(true);
    await applyCryptoUniverseChange({ add: ['C/USD'], drop: [], occurrenceId: 'occ-1' });
    vi.setSystemTime(T0 + 10 * WINDOW);
    expect(gradable('C/USD')).toBe(false); // pending: no clock yet, however long
    const r = reqFrames(s, 'subscribe')[0].req_id;
    ok(s, 'C/USD', r);
    ok(s, 'C/USD', r);
    expect(gradable('C/USD')).toBe(false); // confirmed now: the window starts here
    vi.setSystemTime(T0 + 11 * WINDOW);
    expect(gradable('C/USD')).toBe(true);
  });

  it('the age list is the universe: its length follows adds and drops', async () => {
    await boot(['A/USD', 'B/USD']);
    openAndAnswer(sockets[0]);
    expect(getCryptoRecorderSymbolAges(Date.now()).length).toBe(2);
    await applyCryptoUniverseChange({ add: ['C/USD', 'D/USD'], drop: [], occurrenceId: 'occ-1' });
    expect(getCryptoRecorderSymbolAges(Date.now()).length).toBe(4);
    await applyCryptoUniverseChange({ add: [], drop: ['A/USD'], occurrenceId: 'occ-2' });
    expect(getCryptoRecorderSymbolAges(Date.now()).map((r) => r.symbol).sort()).toEqual(['B/USD', 'C/USD', 'D/USD']);
  });

  it('a ticker frame in flight for a just-dropped symbol leaves no age behind for it', async () => {
    await boot(['A/USD', 'B/USD']);
    const s = sockets[0];
    openAndAnswer(s);
    await applyCryptoUniverseChange({ add: [], drop: ['A/USD'], occurrenceId: 'occ-1' });
    s._msg({ channel: 'ticker', type: 'update', data: [{ symbol: 'A/USD', bid: 1, ask: 1.01, last: 1 }] });
    await applyCryptoUniverseChange({ add: ['A/USD'], drop: [], occurrenceId: 'occ-2' });
    expect(getCryptoRecorderSymbolAges(Date.now()).find((r) => r.symbol === 'A/USD')!.ageMs).toBeNull();
  });
});
