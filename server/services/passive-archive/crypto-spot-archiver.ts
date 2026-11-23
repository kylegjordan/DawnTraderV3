/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B74 — Crypto Spot Archiver (sharded, membership changed in-app)
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Persistent WebSocket connections to wss://ws.kraken.com/v2 for the dynamic
 * crypto universe, split into shards of at most `passive_archive.b74_crypto_ws_shard_size`
 * symbols (module_constants, read with no fallback — B-UNIVERSE-REFRESH-ACTS §2.10).
 *
 * Universe selection:
 *   - Boot: universe-loader.loadCryptoSpotUniverse() (ungated; floor
 *     `passive_archive.b74_crypto_min_volume_24h_usd`, DB-only).
 *   - Daily: the in-app crypto universe refresh (B-UNIVERSE-REFRESH-ACTS, #1018)
 *     computes the add/drop sets behind its gate and calls
 *     `applyCryptoUniverseChange` — the only way membership changes after boot.
 *
 * Sharding:
 *   - Boot places symbols by hash(symbol) % shardCount, shardCount = ceil(n / shard size).
 *   - After boot a symbol NEVER moves (pre-audit §2.4): an add goes to the least-full
 *     shard under the shard size, a new shard opens only when every shard is full, and
 *     a shard emptied by drops is resolved-then-stopped (§2.9). Shard ids are monotonic
 *     within a process and never reused.
 *   - Membership changes go out as incremental subscribe / unsubscribe frames with
 *     their own req_id — never a reconnect (the reconnect is the watchdog's alarm).
 *
 * Reference: BATCH_74_SCOPE.md v1.1 + Langston cc-inbox #867 + #869;
 * B_UNIVERSE_REFRESH_ACTS_PRE_AUDIT.md §2.3-§2.10.
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
import {
  RecorderConnection, startRecorderWatch, type AddOutcome, type RecorderConnectionLiveness,
} from './recorder-connection.js';

const WS_URL = 'wss://ws.kraken.com/v2';
// B69: unchanged value (crypto_spot was already correct), renamed var for consistency
const ASSET_CLASS = 'crypto_spot' as const;

/** §2.10: the per-connection symbol cap. DB-governed, no fallback — an absent row throws (the bootstrap logs it and the
 *  archiver does not start; the refresh records the throw). */
async function readShardSize(): Promise<number> {
  const { prefetchModule, getCachedNumberRequired, GLOBAL_KEY } = await import('../module-constants-service.js');
  await prefetchModule('passive_archive');
  const n = getCachedNumberRequired('passive_archive', 'b74_crypto_ws_shard_size', GLOBAL_KEY);
  if (!Number.isInteger(n) || n < 1) throw new Error(`passive_archive.b74_crypto_ws_shard_size must be a positive integer, got ${n}`);
  return n;
}

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

const state = { shards: [] as Shard[] };

/** B-CRYPTO-FEED-WATCHDOG (C1/P6): the subscribed universe, symbol → shard id. Set at boot, then changed ONLY by
 *  `applyCryptoUniverseChange` and by an add that fails confirmation (B-UNIVERSE-REFRESH-ACTS). */
const symbolShard = new Map<string, number>();
/** Receipt time of the last ticker UPDATE per symbol. A `snapshot` (sent on every subscribe) is the venue replaying the
 *  current state, however old, and does not count as the symbol ticking (the xStock recorder's B-VENUE-QUIET-ALERTING r4 lesson).
 *  Pruned with the symbol (§2.5) and written only for a symbol still in `symbolShard`, so a re-added symbol never carries a stale age. */
const lastTickerUpdateAt = new Map<string, number>();
/** When THIS process received its first ticker update — the warmth clock (C2: warm once a full live-share window has passed). */
let firstTickerUpdateAtMs: number | null = null;
/** B-UNIVERSE-REFRESH-ACTS §2.3 (J5): the grace clock for symbols added AFTER boot. Absent = a boot symbol (graded as
 *  before). `null` = added to an existing shard and its subscribe not yet confirmed — not gradable until its first update.
 *  A number = confirmed (or placed on a new shard) at that time — gradable at its first update or one window later. */
const subscribedAtMs = new Map<string, number | null>();
/** §2.9: shard ids are monotonic within a process and never reused, so a stopped shard's silent-alert key can never
 *  dedupe-suppress a later shard's genuine page. */
let nextShardId = 0;
/** §2.4: adds that failed confirmation since the refresh last collected them — written by `onAddResult`, read and
 *  cleared by the refresh into its run record (`rejected_adds` / `unconfirmed_adds`). */
const addFailures = { rejected: [] as string[], unconfirmed: [] as string[] };

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
 *  shows as many nulls/old ages, never as a shorter list. Read-only.
 *  B-UNIVERSE-REFRESH-ACTS §2.3: `gradable` is false for a symbol still inside its add grace — added after boot and
 *  neither updated yet nor one `windowMs` past its confirmation (an unconfirmed add is never gradable). Boot symbols are
 *  always gradable. The caller decides what to do with the graced ones; the list still carries them. */
export function getCryptoRecorderSymbolAges(
  nowMs: number, shardId?: number, windowMs?: number,
): { symbol: string; ageMs: number | null; gradable: boolean }[] {
  const out: { symbol: string; ageMs: number | null; gradable: boolean }[] = [];
  for (const sh of state.shards) {
    if (shardId !== undefined && sh.id !== shardId) continue;
    for (const symbol of sh.symbols) {
      const at = lastTickerUpdateAt.get(symbol);
      out.push({ symbol, ageMs: at === undefined ? null : Math.max(0, nowMs - at), gradable: isGradable(symbol, at, nowMs, windowMs) });
    }
  }
  return out;
}

function isGradable(symbol: string, lastUpdateAt: number | undefined, nowMs: number, windowMs?: number): boolean {
  if (!subscribedAtMs.has(symbol)) return true; // a boot symbol
  if (lastUpdateAt !== undefined) return true;  // it has ticked since it was added
  const t = subscribedAtMs.get(symbol);
  return typeof t === 'number' && windowMs !== undefined && nowMs - t >= windowMs;
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

/** B-UNIVERSE-REFRESH-ACTS: the recorder's running universe — the set the refresh gate measures drops against. Empty
 *  when the recorder is not running. Sorted, so a run row's lists are stable. */
export function getCryptoRecorderRunningSymbols(): string[] {
  return [...symbolShard.keys()].sort();
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
    // Wire capture 2026-11-04: one reply per symbol per channel; success:false carries `error` and a top-level `symbol`,
    // success:true carries it at `result.symbol`. A `req_id` is echoed when one was sent (an incremental add, P4).
    shard.conn?.noteSubscribeAck(
      typeof msg.req_id === 'number' ? msg.req_id : null, msg.success === true, replySymbol(msg), now,
    );
    return { data: false, kind: msg.success === true ? 'subscribe_ok' : 'subscribe_rejected' };
  }
  if (msg.method === 'unsubscribe') {
    // §2.4: unsubscribe replies get their own branch and counters — never the subscribe tally.
    shard.conn?.noteUnsubscribeReply(msg.success === true, replySymbol(msg));
    return { data: false, kind: msg.success === true ? 'unsubscribe_ok' : 'unsubscribe_rejected' };
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
      // §2.5: only a symbol still in the universe gets an age — a frame in flight for a just-dropped symbol must not
      // leave a stale entry for it to carry if it is re-added later.
      if (isUpdate && typeof snap?.symbol === 'string' && symbolShard.has(snap.symbol)) {
        lastTickerUpdateAt.set(snap.symbol, now);
        if (firstTickerUpdateAtMs === null) firstTickerUpdateAtMs = now;
      }
    }
    return { data: msg.data.length > 0, kind: `ticker/${msg.type ?? '?'}` };
  }
  return { data: false, kind: typeof msg.channel === 'string' ? msg.channel : 'other' };
}

function replySymbol(msg: any): string | null {
  if (typeof msg?.symbol === 'string') return msg.symbol;
  if (typeof msg?.result?.symbol === 'string') return msg.result.symbol;
  return null;
}

const subscribeFrames = (syms: string[]) => (reqId: number): object[] => [
  { method: 'subscribe', params: { channel: 'ohlc', symbol: syms, interval: 1 }, req_id: reqId },
  { method: 'subscribe', params: { channel: 'ticker', symbol: syms }, req_id: reqId },
];
const unsubscribeFrames = (syms: string[]) => (reqId: number): object[] => [
  { method: 'unsubscribe', params: { channel: 'ohlc', symbol: syms, interval: 1 }, req_id: reqId },
  { method: 'unsubscribe', params: { channel: 'ticker', symbol: syms }, req_id: reqId },
];

/** Remove a symbol from every piece of per-symbol state (§2.4 withdrawal, §2.5 pruning). Not the socket. */
function forgetSymbol(shard: Shard, symbol: string): void {
  const i = shard.symbols.indexOf(symbol);
  if (i >= 0) shard.symbols.splice(i, 1);
  symbolShard.delete(symbol);
  lastTickerUpdateAt.delete(symbol);
  subscribedAtMs.delete(symbol);
}

/** §2.4: an incremental add's answer. Confirmed starts its grace clock; rejected or unconfirmed withdraws it (state
 *  first, then a best-effort unsubscribe in case one channel did take it) and records it for the refresh's run row. */
function onShardAddResult(shard: Shard, symbol: string, outcome: AddOutcome, nowMs: number): void {
  if (symbolShard.get(symbol) !== shard.id) return; // dropped meanwhile
  if (outcome === 'confirmed') { subscribedAtMs.set(symbol, nowMs); return; }
  forgetSymbol(shard, symbol);
  (outcome === 'rejected' ? addFailures.rejected : addFailures.unconfirmed).push(symbol);
  console.warn(`[B74][crypto-spot][shard${shard.id}] add ${outcome}: ${symbol} withdrawn from the universe`);
  if (shard.symbols.length === 0) {
    // §2.9 applies to a shard emptied by withdrawal exactly as to one emptied by a drop.
    const conn = shard.conn;
    shard.conn = null;
    state.shards = state.shards.filter(s => s !== shard);
    void conn?.stopAndResolve(`B-UNIVERSE-REFRESH-ACTS #1018: shard emptied by withdrawn add of ${symbol}`);
    return;
  }
  shard.conn?.sendUnsubscribe([symbol], unsubscribeFrames([symbol]));
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
    // The operator switch gates both the archiver start and refresh-cron registration in passive-archive-bootstrap.
    // Once constructed, a crypto shard stays enabled until its universe retires it through stopAndResolve.
    isEnabled: () => true,
    // Two channels, one reply per symbol each (wire capture 2026-11-04).
    expectedSubscribeReplies: () => shard.symbols.length * 2,
    onAddResult: (symbol, outcome, nowMs) => onShardAddResult(shard, symbol, outcome, nowMs),
  });
}

function newShard(symbols: string[]): Shard {
  return {
    id: nextShardId++,
    conn: null,
    symbols,
    lastMsgAt: 0,
    rowsPersistedLastMinute: 0,
    cumulativeOhlcRows: 0,
    cumulativeTickerSnaps: 0,
    ohlcFramesSkipped: 0,
  };
}

/** Open a shard's connection and register its symbols. */
function launchShard(s: Shard): void {
  for (const sym of s.symbols) symbolShard.set(sym, s.id);
  s.conn = makeShardConnection(s);
  s.conn.connect();
}

// Health log every 60s across all shards
setInterval(() => {
  if (state.shards.length === 0) return;
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
  // §2.2 (boot stays ungated): log the per-fetch records so a boot that silently lost a batch is visible in the log.
  // Stated residual: such a boot starts short; the first refresh adds the missing symbols back (adds are ungated).
  const bad = result.batches.filter(b => !b.ok);
  console.log(
    `[B74][crypto-spot] boot universe fetch: ${result.batches.length} fetch(es), ${bad.length} not OK` +
    (bad.length > 0 ? ` (${bad.map(b => `${b.kind}:${b.httpStatus ?? 'throw'}:${b.krakenError ?? ''}:${b.rowsReturned}/${b.rowsRequested}`).join(', ')})` : '') +
    `; ${result.symbols.length} symbols above the floor`,
  );
  // §2.6 (J2): a held coin is always recorded. A failed pins read does not stop the boot — nothing is dropped at boot,
  // so the only cost is a held coin unrecorded until the first refresh, which refuses on the same failure.
  let pins: string[] = [];
  try {
    const { readCryptoUniversePins } = await import('./crypto-universe-pins.js');
    pins = await readCryptoUniversePins();
  } catch (err) {
    console.error('[B74][crypto-spot] pins read failed at boot; starting without the held-position union:', err instanceof Error ? err.message : err);
  }
  const extra = pins.filter(p => !result.symbols.includes(p));
  if (extra.length > 0) console.log(`[B74][crypto-spot] boot universe + ${extra.length} held symbol(s) below the floor: ${extra.join(', ')}`);
  const symbols = [...result.symbols, ...extra];
  if (symbols.length === 0) {
    console.warn('[B74][crypto-spot] universe is empty; archiver not started (the first refresh starts it)');
    return;
  }

  const shardSize = await readShardSize();
  const shardCount = Math.max(1, Math.ceil(symbols.length / shardSize));
  const buckets = assignToShard(symbols, shardCount);

  symbolShard.clear();
  subscribedAtMs.clear();
  state.shards = buckets.map(symbols => newShard(symbols));

  console.log(
    `[B74][crypto-spot] starting ${state.shards.length} shard(s) ` +
    `(${symbols.length} symbols total, shard_size_target=${shardSize})`
  );

  for (const s of state.shards) launchShard(s);
  startRecorderWatch();
}

export interface CryptoUniverseChangeResult {
  added: string[];
  dropped: string[];
  /** Symbols placed on newly opened shards. Their open-time replies carry no req_id, so add failures are not tracked. */
  untrackedOverflowAdds: string[];
  shardsOpened: number[];
  shardsStopped: number[];
}

/**
 * B-UNIVERSE-REFRESH-ACTS (J7, pre-audit §2.4-§2.10) — apply one refresh's decided change to the running recorder.
 * Order: drops first (state, then unsubscribe; an emptied shard is resolved-then-stopped and removed), then adds
 * (least-full shard with room, as an incremental subscribe with a req_id; a new shard only when every shard is full).
 * Nothing already placed moves. Starts the recorder if it is not running. An add's confirmation arrives later, through
 * `onShardAddResult`; a rejected or unconfirmed add is withdrawn there and surfaces via `takeCryptoAddFailures`.
 */
export async function applyCryptoUniverseChange(
  { add, drop, occurrenceId }: { add: string[]; drop: string[]; occurrenceId: string },
): Promise<CryptoUniverseChangeResult> {
  const out: CryptoUniverseChangeResult = {
    added: [], dropped: [], untrackedOverflowAdds: [], shardsOpened: [], shardsStopped: [],
  };
  const now = Date.now();

  // ── drops ──
  const dropsByShard = new Map<number, string[]>();
  for (const sym of drop) {
    const id = symbolShard.get(sym);
    if (id === undefined) continue;
    const list = dropsByShard.get(id) ?? [];
    list.push(sym);
    dropsByShard.set(id, list);
  }
  for (const [id, syms] of dropsByShard) {
    const shard = state.shards.find(s => s.id === id);
    if (!shard) continue;
    for (const sym of syms) forgetSymbol(shard, sym);
    out.dropped.push(...syms);
    if (shard.symbols.length === 0) {
      // §2.9: an emptied shard's own alerts are resolved before its socket closes, so nothing is left firing for it.
      await shard.conn?.stopAndResolve(
        `B-UNIVERSE-REFRESH-ACTS #1018: shard emptied by crypto universe refresh, occurrence ${occurrenceId}`,
      );
      shard.conn = null;
      state.shards = state.shards.filter(s => s !== shard);
      out.shardsStopped.push(id);
    } else {
      shard.conn?.sendUnsubscribe(syms, unsubscribeFrames(syms));
    }
  }

  // ── adds ──
  const fresh = [...new Set(add)].filter(sym => !symbolShard.has(sym));
  if (fresh.length === 0) return out;
  const shardSize = await readShardSize();
  const addsByShard = new Map<number, string[]>();
  const overflow: string[] = [];
  for (const sym of fresh) {
    let target: Shard | undefined;
    for (const s of state.shards) {
      if (s.symbols.length >= shardSize) continue;
      if (!target || s.symbols.length < target.symbols.length) target = s;
    }
    if (!target) { overflow.push(sym); continue; }
    target.symbols.push(sym);
    symbolShard.set(sym, target.id);
    subscribedAtMs.set(sym, null); // graced until its add is confirmed
    const list = addsByShard.get(target.id) ?? [];
    list.push(sym);
    addsByShard.set(target.id, list);
  }
  for (const [id, syms] of addsByShard) {
    const shard = state.shards.find(s => s.id === id)!;
    shard.conn?.sendAdd(syms, subscribeFrames(syms), 2, now);
    out.added.push(...syms);
  }
  // Every shard full (or none running): open new shards. Their symbols subscribe on open, like boot symbols, but
  // start their grace clock now — a silent new shard is graded after one window, never forgiven indefinitely.
  for (let i = 0; i < overflow.length; i += shardSize) {
    const s = newShard(overflow.slice(i, i + shardSize));
    for (const sym of s.symbols) subscribedAtMs.set(sym, now);
    state.shards.push(s);
    launchShard(s);
    out.shardsOpened.push(s.id);
    out.added.push(...s.symbols);
    out.untrackedOverflowAdds.push(...s.symbols);
  }
  if (overflow.length > 0) startRecorderWatch();
  return out;
}

/** The adds withdrawn since the last call (rejected by the venue, or never confirmed) — read and cleared by the
 *  refresh, which records them on its run row (§2.4). */
export function takeCryptoAddFailures(): { rejected: string[]; unconfirmed: string[] } {
  const copy = { rejected: [...addFailures.rejected], unconfirmed: [...addFailures.unconfirmed] };
  addFailures.rejected.length = 0;
  addFailures.unconfirmed.length = 0;
  return copy;
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
  state.shards = shards;
  symbolShard.clear();
  for (const sh of shards) for (const sym of sh.symbols) symbolShard.set(sym, sh.id);
  nextShardId = shards.length === 0 ? 0 : Math.max(...shards.map(s => s.id)) + 1;
}
/** Test-only: clear the per-symbol update clock and the warmth clock. */
export function _resetCryptoRecorderClockForTests(): void {
  lastTickerUpdateAt.clear();
  firstTickerUpdateAtMs = null;
  state.shards = [];
  symbolShard.clear();
  subscribedAtMs.clear();
  nextShardId = 0;
  addFailures.rejected.length = 0;
  addFailures.unconfirmed.length = 0;
}
