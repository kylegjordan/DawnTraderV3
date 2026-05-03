/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B74 — Equity Perp (PF_*XUSD) Archiver
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Captures from Kraken Futures via TWO paths:
 *
 *   1. WebSocket (`wss://futures.kraken.com/ws/v1`) — TICKER ONLY.
 *      Subscribes to `feed: 'ticker'` for the 10 PF_*XUSD perps, persists
 *      bid/ask/last/volume/VWAP/openInterest/funding_rate snapshots.
 *
 *   2. REST polling (`https://futures.kraken.com/api/charts/v1/trade/<sym>/1m`)
 *      every 60s. Pulls the most recent 1-min OHLC bars for each perp,
 *      dedupes against last-seen interval_begin, persists new bars only.
 *
 * Why two paths: Kraken Futures WebSocket v1 has NO candle/kline subscription
 * feed (verified 2026-04-30 — earlier B74.0 attempt with `feed: 'candles_trade_1m'`
 * returned no data; that feed name does not exist). The REST charts endpoint
 * IS the canonical source for futures OHLC. Per Langston cc-inbox #873
 * resolution + RUNNING_ISSUES #41 closure.
 *
 * **The non-existent feed name is logged in `KNOWN_NONEXISTENT_NAMES` in
 * `server/services/utils/symbol-canonicalizer.ts`** so future batches don't
 * re-discover the dead end. Per CLAUDE.md §5 rule #14 (Kyle directive
 * 2026-04-30): always add bad names to that registry on discovery.
 *
 * Reference: https://docs.futures.kraken.com/#websocket-api +
 *            https://futures.kraken.com/api/charts/v1/trade/<sym>/<tick>
 * ═════════════════════════════════════════════════════════════════════════════
 */

import WebSocket from 'ws';
import { loadEquityPerpUniverse } from './universe-loader.js';
import { bufferOhlcBar } from './ohlc-batch-writer.js';
import { bufferTickerSnap } from './ticker-batch-writer.js';
import { makeBackoff, type BackoffPolicy } from './reconnect-policy.js';

const WS_URL = 'wss://futures.kraken.com/ws/v1';
const REST_BASE = 'https://futures.kraken.com/api/charts/v1/trade';
const REST_POLL_INTERVAL_MS = 60_000;
// B69: renamed from 'equity_perp' → 'xstock_perp' (tokenized equity perps)
const ASSET_CLASS = 'xstock_perp' as const;

interface ArchiverState {
  ws: WebSocket | null;
  symbols: string[];
  backoff: BackoffPolicy;
  enabled: boolean;
  lastMsgAt: number;
  rowsPersistedLastMinute: number;
  // Last-seen interval_begin per symbol for OHLC dedup
  lastOhlcInterval: Map<string, number>;
  restPollTimer: NodeJS.Timeout | null;
  // Cumulative counters (B74 v2 monitor panel)
  cumulativeOhlcRows: number;
  cumulativeTickerSnaps: number;
}

const state: ArchiverState = {
  ws: null,
  symbols: [],
  backoff: makeBackoff(30),
  enabled: true,
  lastMsgAt: 0,
  rowsPersistedLastMinute: 0,
  lastOhlcInterval: new Map(),
  restPollTimer: null,
  cumulativeOhlcRows: 0,
  cumulativeTickerSnaps: 0,
};

export function getEquityPerpStats(): {
  connected: boolean;
  configuredSymbols: number;
  cumulativeOhlcRows: number;
  cumulativeTickerSnaps: number;
} {
  return {
    connected: state.ws?.readyState === WebSocket.OPEN,
    configuredSymbols: state.symbols.length,
    cumulativeOhlcRows: state.cumulativeOhlcRows,
    cumulativeTickerSnaps: state.cumulativeTickerSnaps,
  };
}

// ── REST polling for OHLC ──────────────────────────────────────────────────

async function pollOhlcOnce(symbol: string): Promise<number> {
  try {
    const resp = await fetch(`${REST_BASE}/${symbol}/1m`);
    if (!resp.ok) return 0;
    const data = await resp.json() as { candles?: Array<{ time: number; open: string; high: string; low: string; close: string; volume?: string }> };
    if (!data.candles || data.candles.length === 0) return 0;
    const lastSeen = state.lastOhlcInterval.get(symbol) ?? 0;
    let newCount = 0;
    let maxTime = lastSeen;
    for (const candle of data.candles) {
      if (candle.time <= lastSeen) continue;
      bufferOhlcBar(ASSET_CLASS, {
        symbol,
        assetClass: ASSET_CLASS,
        exchange: 'kraken-futures',
        intervalBegin: new Date(candle.time),
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume ?? '0',
        vwap: null,
        tradeCount: null,
      } as any);
      newCount++;
      state.cumulativeOhlcRows++;
      if (candle.time > maxTime) maxTime = candle.time;
    }
    if (maxTime > lastSeen) state.lastOhlcInterval.set(symbol, maxTime);
    return newCount;
  } catch (err) {
    return 0;
  }
}

async function pollAllOhlc(): Promise<void> {
  if (!state.enabled || state.symbols.length === 0) return;
  let totalNew = 0;
  for (const sym of state.symbols) {
    totalNew += await pollOhlcOnce(sym);
    await new Promise(r => setTimeout(r, 100)); // 100ms space-out so we don't hammer the REST endpoint
  }
  if (totalNew > 0) {
    console.log(`[B74][equity-perp][rest] polled ${state.symbols.length} symbols, ${totalNew} new bars`);
    state.rowsPersistedLastMinute += totalNew;
  }
}

// ── WebSocket for ticker ───────────────────────────────────────────────────

function parseTickerSnap(msg: any): void {
  if (!msg?.product_id) return;
  bufferTickerSnap(ASSET_CLASS, {
    symbol: msg.product_id,
    assetClass: ASSET_CLASS,
    exchange: 'kraken-futures',
    capturedAt: new Date(),
    bid: msg.bid != null ? String(msg.bid) : null,
    bidQty: msg.bid_size != null ? String(msg.bid_size) : null,
    ask: msg.ask != null ? String(msg.ask) : null,
    askQty: msg.ask_size != null ? String(msg.ask_size) : null,
    last: msg.last != null ? String(msg.last) : null,
    volume24h: msg.volume != null ? String(msg.volume) : null,
    vwap24h: msg.vwap != null ? String(msg.vwap) : null,
    high24h: msg.high != null ? String(msg.high) : null,
    low24h: msg.low != null ? String(msg.low) : null,
    open24h: msg.open != null ? String(msg.open) : null,
    prevDayClose: null,
    prevDayVolume: null,
    isExtendedHours: null,
    openInterest: msg.openInterest != null ? String(msg.openInterest) : null,
    fundingRate: msg.funding_rate != null ? String(msg.funding_rate) : null,
  } as any);
  state.cumulativeTickerSnaps++;
}

function handleMessage(raw: WebSocket.RawData): void {
  state.lastMsgAt = Date.now();
  let msg: any;
  try { msg = JSON.parse(raw.toString()); } catch { return; }
  if (msg.feed === 'ticker' || msg.feed === 'ticker_snapshot') {
    parseTickerSnap(msg);
  }
}

function subscribe(ws: WebSocket): void {
  ws.send(JSON.stringify({
    event: 'subscribe',
    feed: 'ticker',
    product_ids: state.symbols,
  }));
  console.log(`[B74][equity-perp] subscribed to ticker for ${state.symbols.length} symbols (OHLC via REST polling at ${REST_POLL_INTERVAL_MS / 1000}s interval)`);
}

async function connect(): Promise<void> {
  if (!state.enabled) return;
  if (state.ws) {
    try { state.ws.close(); } catch { /* ignore */ }
    state.ws = null;
  }
  const ws = new WebSocket(WS_URL);
  state.ws = ws;

  ws.on('open', () => {
    console.log(`[B74][equity-perp] connected (attempt ${state.backoff.attempts() + 1})`);
    state.backoff.reset();
    subscribe(ws);
  });

  ws.on('message', handleMessage);

  ws.on('close', (code, reason) => {
    console.warn(`[B74][equity-perp] disconnected code=${code} reason=${reason.toString()}`);
    scheduleReconnect();
  });

  ws.on('error', (err) => {
    console.warn(`[B74][equity-perp] ws error: ${err.message}`);
  });
}

function scheduleReconnect(): void {
  if (!state.enabled) return;
  const delay = state.backoff.nextDelayMs();
  console.warn(`[B74][equity-perp] reconnecting in ${delay}ms (attempt ${state.backoff.attempts()})`);
  setTimeout(() => { connect().catch(err => console.error('[B74][equity-perp] reconnect failed:', err)); }, delay);
}

// 60-second health log
setInterval(() => {
  if (!state.enabled) return;
  const now = Date.now();
  const lastMsgAge = state.lastMsgAt > 0 ? now - state.lastMsgAt : -1;
  console.log(
    `[B74][equity-perp] connected=${state.ws?.readyState === WebSocket.OPEN} ` +
    `last_msg_age_ms=${lastMsgAge} rows_persisted_60s=${state.rowsPersistedLastMinute}`
  );
  state.rowsPersistedLastMinute = 0;
}, 60_000);

export async function startEquityPerpArchiver(): Promise<void> {
  state.symbols = await loadEquityPerpUniverse();
  if (state.symbols.length === 0) {
    console.warn('[B74][equity-perp] universe is empty; archiver not started');
    return;
  }
  state.enabled = true;
  await connect();

  // Kick off REST polling timer for OHLC. Initial poll happens immediately
  // so we don't have to wait 60s for the first bars.
  state.restPollTimer = setInterval(() => {
    pollAllOhlc().catch(err => console.warn('[B74][equity-perp][rest] poll-cycle failed:', err));
  }, REST_POLL_INTERVAL_MS);
  // Initial poll
  pollAllOhlc().catch(err => console.warn('[B74][equity-perp][rest] initial poll failed:', err));
}

export function stopEquityPerpArchiver(): void {
  state.enabled = false;
  if (state.restPollTimer) {
    clearInterval(state.restPollTimer);
    state.restPollTimer = null;
  }
  if (state.ws) {
    try { state.ws.close(); } catch { /* ignore */ }
    state.ws = null;
  }
}
