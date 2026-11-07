/**
 * B-CRYPTO-FEED-WATCHDOG (#1232) objective 4, Step 9 — "'Connected' means data arriving", proved AT THE PANEL.
 *
 * Objective 4's Verify clause: "a test proves an OPEN-but-silent shard reads not-live". Langston's Step-9 condition 5
 * puts that test at the Passive Archive panel's STATUS, not at `isDataLive`. So this drives REAL `RecorderConnection`s
 * (over a fake `ws`) inside the REAL crypto-spot archiver's stats, through the REAL `computePassiveArchiveStatus` —
 * only the database and the three other universes' archivers are stubbed.
 *
 * The 2026-10-21 shape: two shards, both sockets OPEN, shard0 receiving nothing for > its silence threshold. Before
 * Step 9 the panel badged that OK (`connected` = every readyState OPEN, and the process-wide ticker counter > 0).
 *
 * POSITIVE CONTROL: with the aggregator's DATA_SILENT arm removed, tests 1, 4 and 6 go red (the status reads OK).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── a fake `ws` (the same driver as b-crypto-feed-watchdog.test.ts) ──
const sockets = vi.hoisted(() => [] as any[]);
vi.mock('ws', async () => {
  const { EventEmitter } = await import('node:events');
  class FakeWs extends EventEmitter {
    static OPEN = 1;
    static CONNECTING = 0;
    readyState = 0;
    sent: string[] = [];
    constructor(public url: string) { super(); sockets.push(this); }
    send(s: string) { this.sent.push(s); }
    terminate() { this.readyState = 3; }
    close() { this.readyState = 2; }
    _open() { this.readyState = 1; this.emit('open'); }
    _msg(o: unknown) { this.emit('message', Buffer.from(JSON.stringify(o))); }
    _close(code = 1006) { this.readyState = 3; this.emit('close', code, Buffer.from('')); }
  }
  return { default: FakeWs, WebSocket: FakeWs };
});

const h = vi.hoisted(() => ({ rows: {} as Record<string, number>, stats: {} as Record<string, any> }));
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
    const v = h.rows[name];
    if (v === undefined) throw new Error(`module_constants: required row missing for ${name}`);
    return v;
  },
  getCachedConstant: () => undefined,
}));
vi.mock('../../services/passive-archive/ohlc-batch-writer.js', () => ({ bufferOhlcBar: () => {} }));
vi.mock('../../services/passive-archive/ticker-batch-writer.js', () => ({ bufferTickerSnap: () => {} }));

// The panel's window counts: every count readable and non-zero, so only the liveness arms can move the status.
// B-DB-POOL-GUARD P5: the panel reads the DIAGNOSTIC pool (`diagDb`), sized by DIAG_POOL_MAX; `db` is kept for
// any other import of the module.
vi.mock('../../db.js', () => {
  const d = {
    execute: vi.fn(async () => ({ rows: [{ bytes: 1024 }] })),
    transaction: vi.fn(async (cb: (tx: any) => Promise<unknown>) => cb({
      execute: async (q: any) => {
        const text = (q?.queryChunks ?? []).map((c: any) => (Array.isArray(c?.value) ? c.value.join('') : '')).join('');
        if (/SET LOCAL statement_timeout/.test(text)) return { rows: [] };
        return { rows: [{ row_count: 3000, sym_count: 500 }] };
      },
    })),
  };
  return { db: d, diagDb: d, DIAG_POOL_MAX: 4 };
});
const statsFor = (name: string) => () => h.stats[name];
vi.mock('../../services/passive-archive/equity-spot-archiver.js', () => ({ getEquitySpotStats: statsFor('xstock_spot') }));
vi.mock('../../services/passive-archive/equity-perp-archiver.js', () => ({ getEquityPerpStats: statsFor('xstock_perp') }));
vi.mock('../../services/passive-archive/crypto-perp-archiver.js', () => ({ getCryptoPerpStats: statsFor('crypto_perp') }));

import { RecorderConnection, _setRecorderAlertDepsForTests, _resetRecorderRegistryForTests } from '../../services/passive-archive/recorder-connection.js';
import {
  _makeShardForTests,
  _installShardsForTests,
  _resetCryptoRecorderClockForTests,
  getCryptoSpotStats,
} from '../../services/passive-archive/crypto-spot-archiver.js';
import { computePassiveArchiveStatus } from '../../services/drift-dashboard-aggregator.js';

const T0 = new Date('2026-11-06T10:00:00Z').getTime();
const TICK = { channel: 'ticker', type: 'update', data: [{ symbol: 'X/USD', bid: 1, ask: 2 }] };

/** Two shards, each a REAL RecorderConnection on a fake socket, opened. Returns their sockets. */
function twoOpenShards(): [any, any] {
  const shards = [_makeShardForTests(0, ['A/USD']), _makeShardForTests(1, ['B/USD'])];
  for (const sh of shards) {
    sh.cumulativeOhlcRows = 1000;
    sh.cumulativeTickerSnaps = 4000; // the process-wide counter is non-zero: NO_TICKER_DATA cannot fire
    sh.conn = new RecorderConnection({
      label: `crypto-spot][shard${sh.id}`,
      recorderKey: `crypto-spot:shard${sh.id}`,
      silenceConstant: 'crypto_spot_silence_ms',
      url: 'wss://example.invalid',
      configAssetClass: 'crypto_spot',
      onOpen: () => {},
      onMessage: (raw) => ({ data: JSON.parse(raw.toString()).channel === 'ticker', kind: 'ticker' }),
      isEnabled: () => true,
      expectedSubscribeReplies: () => 0,
    });
    sh.conn.connect();
  }
  _installShardsForTests(shards);
  const s0 = sockets[sockets.length - 2];
  const s1 = sockets[sockets.length - 1];
  s0._open();
  s1._open();
  return [s0, s1];
}

async function panelRows() {
  const r = await computePassiveArchiveStatus('rolling_24h');
  return Object.fromEntries(r.universes.map((u) => [u.universe, u]));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  sockets.length = 0;
  h.rows = { ...FULL_CFG };
  const ok = { configuredSymbols: 10, cumulativeOhlcRows: 1000, cumulativeTickerSnaps: 4000, ohlcFramesSkipped: 0, connected: true };
  h.stats.xstock_spot = { ...ok }; // NOT a RecorderConnection: no `connections` field, so not graded by the check
  h.stats.xstock_perp = { ...ok, connections: [{ key: 'equity-perp', socketOpen: true, dataLive: 'live' }], silentOrUnknownConnections: 0 };
  h.stats.crypto_perp = { ...ok, connections: [{ key: 'crypto-perp', socketOpen: true, dataLive: 'live' }], silentOrUnknownConnections: 0 };
  _setRecorderAlertDepsForTests(async () => ({ addAlert: async (o: any) => o, resolveByKey: async (k: string) => [k], hasOpen: async () => false }));
  _resetRecorderRegistryForTests();
  _resetCryptoRecorderClockForTests();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  _resetRecorderRegistryForTests();
  _resetCryptoRecorderClockForTests();
  _setRecorderAlertDepsForTests(null);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('objective 4: an OPEN socket is not a live feed, at the Passive Archive panel', () => {
  it('1. the 2026-10-21 shape: both sockets OPEN, shard0 silent past its threshold => DATA_SILENT, never OK', async () => {
    const [s0, s1] = twoOpenShards();
    s0._msg(TICK); s1._msg(TICK);
    // shard1 keeps delivering; shard0 goes dark for longer than its 120 s threshold (no watch tick runs here)
    for (let i = 0; i < 5; i++) { vi.advanceTimersByTime(30_000); s1._msg(TICK); }
    const row = (await panelRows()).crypto_spot;
    expect(row.wsConnected).toBe(true); // the socket state, unchanged in meaning, shown beside...
    expect(row.connectionLiveness).toEqual([ // ...the data liveness, per shard
      { key: 'crypto-spot:shard0', socketOpen: true, dataLive: 'silent' },
      { key: 'crypto-spot:shard1', socketOpen: true, dataLive: 'live' },
    ]);
    expect(row.dataSilentConnections).toBe(1);
    expect(row.status).toBe('DATA_SILENT');
    expect(getCryptoSpotStats().silentOrUnknownConnections).toBe(1);
  });

  it('2. control: both shards delivering => OK', async () => {
    const [s0, s1] = twoOpenShards();
    for (let i = 0; i < 5; i++) { vi.advanceTimersByTime(30_000); s0._msg(TICK); s1._msg(TICK); }
    const row = (await panelRows()).crypto_spot;
    expect(row.dataSilentConnections).toBe(0);
    expect(row.status).toBe('OK');
  });

  it('3. the threshold unreadable => LIVENESS_UNKNOWN, never OK and never silent (condition 2)', async () => {
    const [s0, s1] = twoOpenShards();
    s0._msg(TICK); s1._msg(TICK);
    delete h.rows.crypto_spot_silence_ms;
    const row = (await panelRows()).crypto_spot;
    expect(row.connectionLiveness!.map((c) => c.dataLive)).toEqual(['unknown', 'unknown']);
    expect(row.dataSilentConnections).toBe(0);
    expect(row.status).toBe('LIVENESS_UNKNOWN');
  });

  it('4. open with no data frame yet: STARTING inside the threshold, DATA_SILENT past it (condition 4)', async () => {
    const [, s1] = twoOpenShards();
    s1._msg(TICK);
    vi.advanceTimersByTime(60_000); s1._msg(TICK);
    expect((await panelRows()).crypto_spot.status).toBe('STARTING');
    vi.advanceTimersByTime(61_000); s1._msg(TICK);
    const row = (await panelRows()).crypto_spot;
    expect(row.connectionLiveness![0]).toEqual({ key: 'crypto-spot:shard0', socketOpen: true, dataLive: 'silent' });
    expect(row.status).toBe('DATA_SILENT');
  });

  it('5. a socket DOWN still reads DISCONNECTED (the socket arm outranks every data arm)', async () => {
    const [s0, s1] = twoOpenShards();
    s0._msg(TICK); s1._msg(TICK);
    s0._close();
    const row = (await panelRows()).crypto_spot;
    expect(row.wsConnected).toBe(false);
    expect(row.connectionLiveness![0]).toEqual({ key: 'crypto-spot:shard0', socketOpen: false, dataLive: 'silent' });
    expect(row.status).toBe('DISCONNECTED');
  });

  it('6. a universe with no `connections` (xstock_spot) is NOT graded; absence is never read as silent', async () => {
    twoOpenShards();
    const rows = await panelRows();
    expect(rows.xstock_spot.connectionLiveness).toBeNull();
    expect(rows.xstock_spot.dataSilentConnections).toBeNull();
    expect(rows.xstock_spot.status).toBe('OK');
    // a futures leg (a RecorderConnection) IS graded
    h.stats.xstock_perp.connections = [{ key: 'equity-perp', socketOpen: true, dataLive: 'silent' }];
    expect((await panelRows()).xstock_perp.status).toBe('DATA_SILENT');
  });
});
