/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B74 — Crypto Spot Archiver (with hash-mod sharding)
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Persistent WebSocket connections to wss://ws.kraken.com/v2 for the dynamic
 * crypto universe. Hash-mod sharding when the universe exceeds the per-
 * connection limit (b74_crypto_ws_shard_size = 300, per Langston Q3).
 *
 * Universe selection:
 *   - Loaded from universe-loader.loadCryptoSpotUniverse() at startup
 *   - Refreshed daily via cron (server/scripts/b74-refresh-universe.ts)
 *   - Filter: USD/USDT/USDC quotes with ≥ $10k 24h volume
 *
 * Sharding:
 *   - hash(symbol) % shardCount → which connection owns each symbol
 *   - All connections in same Node process; no IPC overhead
 *   - Shard count = ceil(universe.length / 300)
 *
 * Reference: BATCH_74_SCOPE.md v1.1 + Langston cc-inbox #867 + #869.
 *
 * B-CRYPTO-FEED-WATCHDOG (#1232, row 33a): each shard's socket is now a
 * `RecorderConnection` (recorder-connection.ts) — one socket and one reconnect
 * timer per shard, a DATA-frame silence check, the subscribe-reply check and one
 * self-clearing alert. On 2026-10-21 shard0 sat OPEN and silent for 14.08 days
 * because the only reconnect path was the socket's `close` event. This file keeps
 * the recorder's own job (parse, buffer, count) and adds the per-symbol UPDATE
 * clock the feed-health grade and the close-gate's witness vouch read.
 * ═════════════════════════════════════════════════════════════════════════════
 */

import WebSocket from 'ws';
import { loadCryptoSpotUniverse } from './universe-loader.js';
import { bufferOhlcBar } from './ohlc-batch-writer.js';
import { bufferTickerSnap } from './ticker-batch-writer.js';
import { validateOhlcFrame } from './ohlc-frame-validator.js';
import { noteOhlcFrameAccepted, noteOhlcFrameRejected } from './ohlc-frame-skip-tracker.js';
import { RecorderConnection, startRecorderWatch, type RecorderConnectionLiveness } from './recorder-connection.js';

const WS_URL = 'wss://ws.kraken.com/v2';
// B69: unchanged value (crypto_spot was already correct), renamed var for consistency
const ASSET_CLASS = 'crypto_spot' as const;
const SHARD_SIZE = 300;

export interface Shard {
  id: number;
  /** The watched connection (null only in detached test shards). */
  conn: RecorderConnection | null;
  symbols: string[];
  /** Any frame, heartbeats included — the health line's `last_msg_age_ms`. NOT a liveness signal (a heartbeat
   *  arrives about once a second on a subscribed connection); the connection's DATA clock is. */
  lastMsgAt: number;
  /** *persisted*: OHLC bars BUFFERED in the last minute — the health line's `rows_persisted_60s`.
   *  ⚠️ Buffered, not rows persisted (pre-audit R5). Bumped only when `parseOhlcBar` returns true (#1029). */
  rowsPersistedLastMinute: number;
  // B74 v2 cumulative counters
  /** *scanned*: every OHLC bar received, accepted or not — the panel's "scanned (since PID)" (J8). */
  cumulativeOhlcRows: number;
  /** *scanned*: every ticker snap received, malformed and throttled ones included. */
  cumulativeTickerSnaps: number;
  /** *skipped*: OHLC bars the frame guard REJECTED (#1028). Never rate-limited (Step-2 condition C2). */
  ohlcFramesSkipped: number;
}

const state = {
  enabled: true,
  shards: [] as Shard[],
};

/** B-CRYPTO-FEED-WATCHDOG (C1/P6): the subscribed universe, symbol → shard id. Static per process (loaded once at start). */
const symbolShard = new Map<string, number>();
/** Receipt time of the last ticker UPDATE per symbol. A `snapshot` (sent on every subscribe) is the venue replaying the
 *  current state, however old, and does not count as the symbol ticking (the xStock recorder's B-VENUE-QUIET-ALERTING r4 lesson). */
const lastTickerUpdateAt = new Map<string, number>();
/** When THIS process received its first ticker update — the warmth clock (C2: warm once a full live-share window has passed). */
let firstTickerUpdateAtMs: number | null = null;

export function getCryptoSpotStats(nowMs: number = Date.now()): {
  /** SOCKET state: every shard's readyState is OPEN. Not a liveness signal — `connections` carries that, beside it. */
  connected: boolean;
  configuredSymbols: number;
  cumulativeOhlcRows: number;
  cumulativeTickerSnaps: number;
  ohlcFramesSkipped: number;
  shardCount: number;
  /** B-CRYPTO-FEED-WATCHDOG objective 4: per shard, the socket state beside the DATA liveness (precedence in
   *  `RecorderConnection.dataLiveness`). The failure was one shard of two, so it is per shard, never one aggregate. */
  connections: RecorderConnectionLiveness[];
  /** Connections reading 'silent' or 'unknown' — 'starting' is EXCLUDED, so a healthy process does not report
   *  non-zero for the first ~120 s after every restart. ⚠️ NOT an alarm numerator on its own: the panel's DATA_SILENT
   *  counts 'silent' alone, and 'unknown' is a config fault, not a dead feed (Langston Step-9 Step-4 fold-in 2). */
  silentOrUnknownConnections: number;
} {
  const totalSymbols = state.shards.reduce((s, sh) => s + sh.symbols.length, 0);
  const totalOhlc = state.shards.reduce((s, sh) => s + sh.cumulativeOhlcRows, 0);
  const totalTicker = state.shards.reduce((s, sh) => s + sh.cumulativeTickerSnaps, 0);
  const totalSkipped = state.shards.reduce((s, sh) => s + sh.ohlcFramesSkipped, 0);
  const allConnected = state.shards.length > 0 && state.shards.every(sh => sh.conn?.ws?.readyState === WebSocket.OPEN);
  // A shard with no connection (detached test shards only) has no socket, so no data can be arriving: silent.
  const connections = state.shards.map((sh): RecorderConnectionLiveness =>
    sh.conn ? sh.conn.dataLiveness(nowMs) : { key: `crypto-spot:shard${sh.id}`, socketOpen: false, dataLive: 'silent' });
  return {
    connected: allConnected,
    configuredSymbols: totalSymbols,
    cumulativeOhlcRows: totalOhlc,
    cumulativeTickerSnaps: totalTicker,
    ohlcFramesSkipped: totalSkipped,
    shardCount: state.shards.length,
    connections,
    silentOrUnknownConnections: connections.filter((c) => c.dataLive === 'silent' || c.dataLive === 'unknown').length,
  };
}

/** B-CRYPTO-FEED-WATCHDOG (C1/P6): every subscribed symbol of one shard (or all shards) with its age since its last
 *  ticker UPDATE — `null` for a symbol that has not updated in this process. The list IS the universe, so a dark shard
 *  shows as many nulls/old ages, never as a shorter list. Read-only. */
export function getCryptoRecorderSymbolAges(nowMs: number, shardId?: number): { symbol: string; ageMs: number | null }[] {
  const out: { symbol: string; ageMs: number | null }[] = [];
  for (const sh of state.shards) {
    if (shardId !== undefined && sh.id !== shardId) continue;
    for (const symbol of sh.symbols) {
      const at = lastTickerUpdateAt.get(symbol);
      out.push({ symbol, ageMs: at === undefined ? null : Math.max(0, nowMs - at) });
    }
  }
  return out;
}

/** The shard ids, for per-connection grading. */
export function getCryptoRecorderShardIds(): number[] { return state.shards.map((s) => s.id); }

/** C2: the live-share reading is meaningful only once a full window has passed since this process's first ticker update.
 *  The window is the caller's (ONE DB value, `feed_health.recorder_live_window_ms`), so the warmth and the share can never
 *  use different windows. Blind for the first window after every process start — stated in the pre-audit and Step 7. */
export function isCryptoRecorderWarm(nowMs: number, windowMs: number): boolean {
  return firstTickerUpdateAtMs !== null && nowMs - firstTickerUpdateAtMs >= windowMs;
}

/** C3/P7: is this symbol in the recorder's subscribed universe? (GLMR/USD on 2026-10-22 was not — its witness was days old.) */
export function isInCryptoRecorderUniverse(symbol: string): boolean {
  return symbolShard.has(symbol);
}

/** C3/P7: is DATA arriving on the connection that owns this symbol? `null` when the symbol is not in the universe or the
 *  connection's threshold cannot be read (the caller treats unknown as NOT vouched — never as live). Sync, in-memory. */
export function isCryptoRecorderSymbolConnectionLive(symbol: string, nowMs: number): boolean | null {
  const id = symbolShard.get(symbol);
  if (id === undefined) return null;
  const sh = state.shards.find((s) => s.id === id);
  if (!sh?.conn) return null;
  const cfg = sh.conn.resolveConfig();
  if (!cfg) return null;
  return sh.conn.isDataLive(nowMs, cfg.silenceMs);
}

/**
 * Stable hash of a string (FNV-1a 32-bit + Murmur3 finalizer).
 *
 * Bare FNV-1a has a known low-bit bias when input strings share suffixes
 * (e.g., crypto pairs like "BTC/USD", "ETH/USD" all ending in "/USD" produce
 * hashes whose low bits cluster). With shardCount=2 this caused a 364/16 split
 * on 380 input pairs in B74 v1. Murmur3-style finalizer (xor-shift-multiply
 * three times) avalanches the bits so `% shardCount` distributes uniformly.
 */
function fnv1aHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // Murmur3 fmix32 finalizer
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

function assignToShard(symbols: string[], shardCount: number): string[][] {
  const buckets: string[][] = Array.from({ length: shardCount }, () => []);
  for (const sym of symbols) {
    const idx = fnv1aHash(sym) % shardCount;
    buckets[idx].push(sym);
  }
  return buckets;
}

/** B-OHLC-FRAME-GUARD (#1028): returns whether the bar was BUFFERED. The counters stay in the caller,
 *  which holds the shard (pre-audit J3). `volume ?? '0'` is the existing absence default (J6). */
function parseOhlcBar(data: any): boolean {
  const verdict = validateOhlcFrame({
    symbol: data?.symbol,
    intervalBegin: data?.interval_begin,
    open: data?.open,
    high: data?.high,
    low: data?.low,
    close: data?.close,
    volume: data?.volume ?? '0',
    vwap: data?.vwap,
    trades: data?.trades,
  });
  if (!verdict.ok) {
    noteOhlcFrameRejected('crypto-spot', ASSET_CLASS, { symbol: data?.symbol, intervalBegin: data?.interval_begin }, verdict);
    return false;
  }
  const bar = verdict.row;
  bufferOhlcBar(ASSET_CLASS, {
    symbol: bar.symbol,
    assetClass: ASSET_CLASS,
    exchange: 'kraken',
    intervalBegin: bar.intervalBegin,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
    vwap: bar.vwap,
    tradeCount: bar.tradeCount,
  } as any);
  noteOhlcFrameAccepted(ASSET_CLASS, bar.symbol);
  return true;
}

function parseTickerSnap(data: any): void {
  if (!data?.symbol) return;
  bufferTickerSnap(ASSET_CLASS, {
    symbol: data.symbol,
    assetClass: ASSET_CLASS,
    exchange: 'kraken',
    capturedAt: new Date(),
    bid: data.bid != null ? String(data.bid) : null,
    bidQty: data.bid_qty != null ? String(data.bid_qty) : null,
    ask: data.ask != null ? String(data.ask) : null,
    askQty: data.ask_qty != null ? String(data.ask_qty) : null,
    last: data.last != null ? String(data.last) : null,
    volume24h: data.volume != null ? String(data.volume) : null,
    vwap24h: data.vwap != null ? String(data.vwap) : null,
    high24h: data.high != null ? String(data.high) : null,
    low24h: data.low != null ? String(data.low) : null,
    open24h: data.open != null ? String(data.open) : null,
    prevDayClose: null,
    prevDayVolume: null,
    isExtendedHours: null, // crypto trades 24/7
    openInterest: null,
    fundingRate: null,
  } as any);
}

/** Returns whether the frame carried DATA (ohlc / ticker rows) — the connection's silence clock moves only on those —
 *  and a short kind label for the diagnostic ring. Subscribe replies are handed to the connection (P4). */
function handleMessage(shard: Shard, raw: WebSocket.RawData): { data: boolean; kind: string } {
  const now = Date.now();
  shard.lastMsgAt = now;
  let msg: any;
  try {
    msg = JSON.parse(raw.toString());
  } catch {
    return { data: false, kind: 'unparsable' };
  }
  if (msg.method === 'subscribe') {
    // Wire capture 2026-11-04: one reply per symbol per channel; success:false carries `error` and `symbol`.
    shard.conn?.noteSubscribeReply(msg.success === true, typeof msg.symbol === 'string' ? msg.symbol : null);
    return { data: false, kind: msg.success === true ? 'subscribe_ok' : 'subscribe_rejected' };
  }
  if (msg.channel === 'ohlc' && Array.isArray(msg.data)) {
    for (const bar of msg.data) {
      // *scanned* stays unconditional — every bar received (J8); *persisted* follows the return value
      // (#1029 — it used to count bars the old guard discarded); a rejected bar is *skipped*.
      shard.cumulativeOhlcRows++;
      if (parseOhlcBar(bar)) shard.rowsPersistedLastMinute++;
      else shard.ohlcFramesSkipped++;
    }
    return { data: msg.data.length > 0, kind: `ohlc/${msg.type ?? '?'}` };
  } else if (msg.channel === 'ticker' && Array.isArray(msg.data)) {
    const isUpdate = msg.type === 'update';
    for (const snap of msg.data) {
      parseTickerSnap(snap);
      shard.cumulativeTickerSnaps++;
      if (isUpdate && typeof snap?.symbol === 'string') {
        lastTickerUpdateAt.set(snap.symbol, now);
        if (firstTickerUpdateAtMs === null) firstTickerUpdateAtMs = now;
      }
    }
    return { data: msg.data.length > 0, kind: `ticker/${msg.type ?? '?'}` };
  }
  return { data: false, kind: typeof msg.channel === 'string' ? msg.channel : 'other' };
}

function subscribe(shard: Shard, ws: WebSocket): void {
  ws.send(JSON.stringify({
    method: 'subscribe',
    params: { channel: 'ohlc', symbol: shard.symbols, interval: 1 },
  }));
  ws.send(JSON.stringify({
    method: 'subscribe',
    params: { channel: 'ticker', symbol: shard.symbols },
  }));
  console.log(`[B74][crypto-spot][shard${shard.id}] subscribed to ohlc(1) + ticker for ${shard.symbols.length} symbols`);
}

/** The shard's watched connection. Reconnects, silence and alerts are the connection's (recorder-connection.ts). */
function makeShardConnection(shard: Shard): RecorderConnection {
  return new RecorderConnection({
    label: `crypto-spot][shard${shard.id}`,
    recorderKey: `crypto-spot:shard${shard.id}`,
    silenceConstant: 'crypto_spot_silence_ms',
    url: WS_URL,
    configAssetClass: ASSET_CLASS,
    onOpen: (ws) => subscribe(shard, ws),
    onMessage: (raw) => handleMessage(shard, raw),
    isEnabled: () => state.enabled,
    // Two channels, one reply per symbol each (wire capture 2026-11-04).
    expectedSubscribeReplies: () => shard.symbols.length * 2,
  });
}

// Health log every 60s across all shards
setInterval(() => {
  if (!state.enabled || state.shards.length === 0) return;
  const now = Date.now();
  for (const shard of state.shards) {
    const lastMsgAge = shard.lastMsgAt > 0 ? now - shard.lastMsgAt : -1;
    const c = shard.conn;
    const dataAge = c && c.lastDataAtMs > 0 ? now - c.lastDataAtMs : -1;
    // `connected=` is the socket state; `data_age_ms` is what liveness is judged on (#1232). Both printed, never one for the other.
    console.log(
      `[B74][crypto-spot][shard${shard.id}] connected=${c?.ws?.readyState === WebSocket.OPEN} ` +
      `symbols=${shard.symbols.length} last_msg_age_ms=${lastMsgAge} data_age_ms=${dataAge} rows_persisted_60s=${shard.rowsPersistedLastMinute}`
    );
    shard.rowsPersistedLastMinute = 0;
  }
}, 60_000);

export async function startCryptoSpotArchiver(): Promise<void> {
  const result = await loadCryptoSpotUniverse();
  if (result.symbols.length === 0) {
    console.warn('[B74][crypto-spot] universe is empty; archiver not started');
    return;
  }

  const shardCount = Math.max(1, Math.ceil(result.symbols.length / SHARD_SIZE));
  const buckets = assignToShard(result.symbols, shardCount);

  state.enabled = true;
  state.shards = buckets.map((symbols, id) => ({
    id,
    conn: null,
    symbols,
    lastMsgAt: 0,
    rowsPersistedLastMinute: 0,
    cumulativeOhlcRows: 0,
    cumulativeTickerSnaps: 0,
    ohlcFramesSkipped: 0,
  }));
  symbolShard.clear();
  for (const sh of state.shards) for (const sym of sh.symbols) symbolShard.set(sym, sh.id);

  console.log(
    `[B74][crypto-spot] starting ${state.shards.length} shard(s) ` +
    `(${result.symbols.length} symbols total, shard_size_target=${SHARD_SIZE})`
  );

  for (const s of state.shards) {
    s.conn = makeShardConnection(s);
    s.conn.connect();
  }
  startRecorderWatch();
}

export function stopCryptoSpotArchiver(): void {
  state.enabled = false;
  for (const shard of state.shards) {
    shard.conn?.stop();
    shard.conn = null;
  }
  state.shards = [];
  symbolShard.clear();
}

// B-OHLC-FRAME-GUARD P8 (test-only): drive real frames through `handleMessage` against a detached shard,
// so the counter tests read the same bumps production makes (pre-audit A9).
export function _makeShardForTests(id = 0, symbols: string[] = []): Shard {
  return {
    id, conn: null, symbols, lastMsgAt: 0,
    rowsPersistedLastMinute: 0, cumulativeOhlcRows: 0, cumulativeTickerSnaps: 0, ohlcFramesSkipped: 0,
  };
}
export { handleMessage as _handleCryptoMessageForTests };

/** Test-only: install shards (with optional connections) as the running universe, without opening sockets. */
export function _installShardsForTests(shards: Shard[]): void {
  state.enabled = true;
  state.shards = shards;
  symbolShard.clear();
  for (const sh of shards) for (const sym of sh.symbols) symbolShard.set(sym, sh.id);
}
/** Test-only: clear the per-symbol update clock and the warmth clock. */
export function _resetCryptoRecorderClockForTests(): void {
  lastTickerUpdateAt.clear();
  firstTickerUpdateAtMs = null;
  state.shards = [];
  symbolShard.clear();
}
