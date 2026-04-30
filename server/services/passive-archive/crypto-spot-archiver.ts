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
 * ═════════════════════════════════════════════════════════════════════════════
 */

import WebSocket from 'ws';
import { loadCryptoSpotUniverse } from './universe-loader.js';
import { bufferOhlcBar } from './ohlc-batch-writer.js';
import { bufferTickerSnap } from './ticker-batch-writer.js';
import { makeBackoff, type BackoffPolicy } from './reconnect-policy.js';

const WS_URL = 'wss://ws.kraken.com/v2';
const UNIVERSE = 'crypto_spot' as const;
const SHARD_SIZE = 300;

interface Shard {
  id: number;
  ws: WebSocket | null;
  symbols: string[];
  backoff: BackoffPolicy;
  lastMsgAt: number;
  rowsPersistedLastMinute: number;
  // B74 v2 cumulative counters
  cumulativeOhlcRows: number;
  cumulativeTickerSnaps: number;
}

const state = {
  enabled: true,
  shards: [] as Shard[],
};

export function getCryptoSpotStats(): {
  connected: boolean;
  configuredSymbols: number;
  cumulativeOhlcRows: number;
  cumulativeTickerSnaps: number;
  shardCount: number;
} {
  const totalSymbols = state.shards.reduce((s, sh) => s + sh.symbols.length, 0);
  const totalOhlc = state.shards.reduce((s, sh) => s + sh.cumulativeOhlcRows, 0);
  const totalTicker = state.shards.reduce((s, sh) => s + sh.cumulativeTickerSnaps, 0);
  const allConnected = state.shards.length > 0 && state.shards.every(sh => sh.ws?.readyState === WebSocket.OPEN);
  return {
    connected: allConnected,
    configuredSymbols: totalSymbols,
    cumulativeOhlcRows: totalOhlc,
    cumulativeTickerSnaps: totalTicker,
    shardCount: state.shards.length,
  };
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

function parseOhlcBar(data: any): void {
  if (!data?.symbol || !data?.interval_begin) return;
  bufferOhlcBar(UNIVERSE, {
    symbol: data.symbol,
    universe: UNIVERSE,
    intervalBegin: new Date(data.interval_begin),
    open: String(data.open),
    high: String(data.high),
    low: String(data.low),
    close: String(data.close),
    volume: String(data.volume ?? '0'),
    vwap: data.vwap != null ? String(data.vwap) : null,
    tradeCount: data.trades != null ? Number(data.trades) : null,
  } as any);
}

function parseTickerSnap(data: any): void {
  if (!data?.symbol) return;
  bufferTickerSnap(UNIVERSE, {
    symbol: data.symbol,
    universe: UNIVERSE,
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

function handleMessage(shard: Shard, raw: WebSocket.RawData): void {
  shard.lastMsgAt = Date.now();
  let msg: any;
  try {
    msg = JSON.parse(raw.toString());
  } catch {
    return;
  }
  if (msg.channel === 'ohlc' && Array.isArray(msg.data)) {
    for (const bar of msg.data) {
      parseOhlcBar(bar);
      shard.rowsPersistedLastMinute++;
      shard.cumulativeOhlcRows++;
    }
  } else if (msg.channel === 'ticker' && Array.isArray(msg.data)) {
    for (const snap of msg.data) {
      parseTickerSnap(snap);
      shard.cumulativeTickerSnaps++;
    }
  }
}

function subscribe(shard: Shard): void {
  if (!shard.ws) return;
  shard.ws.send(JSON.stringify({
    method: 'subscribe',
    params: { channel: 'ohlc', symbol: shard.symbols, interval: 1 },
  }));
  shard.ws.send(JSON.stringify({
    method: 'subscribe',
    params: { channel: 'ticker', symbol: shard.symbols },
  }));
  console.log(`[B74][crypto-spot][shard${shard.id}] subscribed to ohlc(1) + ticker for ${shard.symbols.length} symbols`);
}

async function connectShard(shard: Shard): Promise<void> {
  if (!state.enabled) return;
  if (shard.ws) {
    try { shard.ws.close(); } catch { /* ignore */ }
    shard.ws = null;
  }
  const ws = new WebSocket(WS_URL);
  shard.ws = ws;

  ws.on('open', () => {
    console.log(`[B74][crypto-spot][shard${shard.id}] connected (attempt ${shard.backoff.attempts() + 1})`);
    shard.backoff.reset();
    subscribe(shard);
  });

  ws.on('message', (raw) => handleMessage(shard, raw));

  ws.on('close', (code, reason) => {
    console.warn(`[B74][crypto-spot][shard${shard.id}] disconnected code=${code} reason=${reason.toString()}`);
    scheduleReconnect(shard);
  });

  ws.on('error', (err) => {
    console.warn(`[B74][crypto-spot][shard${shard.id}] ws error: ${err.message}`);
  });
}

function scheduleReconnect(shard: Shard): void {
  if (!state.enabled) return;
  const delay = shard.backoff.nextDelayMs();
  console.warn(`[B74][crypto-spot][shard${shard.id}] reconnecting in ${delay}ms (attempt ${shard.backoff.attempts()})`);
  setTimeout(() => { connectShard(shard).catch(err => console.error(`[B74][crypto-spot][shard${shard.id}] reconnect failed:`, err)); }, delay);
}

// Health log every 60s across all shards
setInterval(() => {
  if (!state.enabled || state.shards.length === 0) return;
  const now = Date.now();
  for (const shard of state.shards) {
    const lastMsgAge = shard.lastMsgAt > 0 ? now - shard.lastMsgAt : -1;
    console.log(
      `[B74][crypto-spot][shard${shard.id}] connected=${shard.ws?.readyState === WebSocket.OPEN} ` +
      `symbols=${shard.symbols.length} last_msg_age_ms=${lastMsgAge} rows_persisted_60s=${shard.rowsPersistedLastMinute}`
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
    ws: null,
    symbols,
    backoff: makeBackoff(30),
    lastMsgAt: 0,
    rowsPersistedLastMinute: 0,
    cumulativeOhlcRows: 0,
    cumulativeTickerSnaps: 0,
  }));

  console.log(
    `[B74][crypto-spot] starting ${state.shards.length} shard(s) ` +
    `(${result.symbols.length} symbols total, shard_size_target=${SHARD_SIZE})`
  );

  await Promise.all(state.shards.map(s => connectShard(s)));
}

export function stopCryptoSpotArchiver(): void {
  state.enabled = false;
  for (const shard of state.shards) {
    if (shard.ws) {
      try { shard.ws.close(); } catch { /* ignore */ }
      shard.ws = null;
    }
  }
  state.shards = [];
}
