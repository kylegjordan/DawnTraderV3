/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B74 — Equity Spot (xStocks) Archiver
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Persistent WebSocket connection to wss://ws-equities.kraken.com.
 * Subscribes to `ohlc` (interval=1) + `ticker` channels for every symbol in
 * `xstocks-universe.json`. Buffers incoming bars + snapshots into the shared
 * batch writers; flushes every 5s.
 *
 * Auto-reconnect with exponential backoff (1s → 30s cap) on disconnect.
 *
 * Per Langston cc-inbox #867 + #869:
 * - Static universe (no dynamic probe)
 * - Dedicated 2-slot DB pool via batch writers
 * - LAST in bootstrap sequence (non-critical infrastructure)
 *
 * Reference: BATCH_74_SCOPE.md v1.1 + BATCH_74_PRE_AUDIT.md v1.1
 * ═════════════════════════════════════════════════════════════════════════════
 */

import WebSocket from 'ws';
import { loadEquitySpotUniverse } from './universe-loader.js';
import { bufferOhlcBar } from './ohlc-batch-writer.js';
import { bufferTickerSnap } from './ticker-batch-writer.js';
import { makeBackoff, type BackoffPolicy } from './reconnect-policy.js';

const WS_URL = 'wss://ws-equities.kraken.com';
// B69: renamed from 'equity_spot' → 'xstock_spot' (tokenized equity, not real equity)
const ASSET_CLASS = 'xstock_spot' as const;

interface ArchiverState {
  ws: WebSocket | null;
  symbols: string[];
  backoff: BackoffPolicy;
  enabled: boolean;
  lastMsgAt: number;
  rowsPersistedLastMinute: number;
  rowsPersistedLastMinuteWindowStart: number;
  // B74 v2: cumulative counters for monitor panel
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
  rowsPersistedLastMinuteWindowStart: Date.now(),
  cumulativeOhlcRows: 0,
  cumulativeTickerSnaps: 0,
};

export function getEquitySpotStats(): {
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

function parseOhlcBar(data: any): void {
  if (!data?.symbol || !data?.interval_begin) return;
  bufferOhlcBar(ASSET_CLASS, {
    symbol: data.symbol,
    assetClass: ASSET_CLASS,
    exchange: 'kraken-equities',
    intervalBegin: new Date(data.interval_begin),
    open: String(data.open),
    high: String(data.high),
    low: String(data.low),
    close: String(data.close),
    volume: String(data.volume ?? '0'),
    vwap: data.vwap != null ? String(data.vwap) : null,
    tradeCount: data.trades != null ? Number(data.trades) : null,
  } as any);
  state.rowsPersistedLastMinute++;
  state.cumulativeOhlcRows++;
}

function parseTickerSnap(data: any): void {
  if (!data?.symbol) return;
  bufferTickerSnap(ASSET_CLASS, {
    symbol: data.symbol,
    assetClass: ASSET_CLASS,
    exchange: 'kraken-equities',
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
    prevDayClose: data.prev_day_close != null ? String(data.prev_day_close) : null,
    prevDayVolume: data.prev_day_volume != null ? String(data.prev_day_volume) : null,
    isExtendedHours: data.is_extended_hours ?? null,
    openInterest: data.open_interest != null ? String(data.open_interest) : null,
    fundingRate: null, // n/a for spot
  } as any);
  state.cumulativeTickerSnaps++;
}

function handleMessage(raw: WebSocket.RawData): void {
  state.lastMsgAt = Date.now();
  let msg: any;
  try {
    msg = JSON.parse(raw.toString());
  } catch {
    return;
  }
  if (msg.channel === 'ohlc' && Array.isArray(msg.data)) {
    for (const bar of msg.data) parseOhlcBar(bar);
  } else if (msg.channel === 'ticker' && Array.isArray(msg.data)) {
    for (const snap of msg.data) parseTickerSnap(snap);
  }
}

function subscribe(ws: WebSocket): void {
  ws.send(JSON.stringify({
    method: 'subscribe',
    params: { channel: 'ohlc', symbol: state.symbols, interval: 1 },
  }));
  ws.send(JSON.stringify({
    method: 'subscribe',
    params: { channel: 'ticker', symbol: state.symbols },
  }));
  console.log(`[B74][equity-spot] subscribed to ohlc(1) + ticker for ${state.symbols.length} symbols`);
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
    console.log(`[B74][equity-spot] connected (attempt ${state.backoff.attempts() + 1})`);
    state.backoff.reset();
    subscribe(ws);
  });

  ws.on('message', handleMessage);

  ws.on('close', (code, reason) => {
    console.warn(`[B74][equity-spot] disconnected code=${code} reason=${reason.toString()}`);
    scheduleReconnect();
  });

  ws.on('error', (err) => {
    console.warn(`[B74][equity-spot] ws error: ${err.message}`);
  });
}

function scheduleReconnect(): void {
  if (!state.enabled) return;
  const delay = state.backoff.nextDelayMs();
  console.warn(`[B74][equity-spot] reconnecting in ${delay}ms (attempt ${state.backoff.attempts()})`);
  setTimeout(() => { connect().catch(err => console.error('[B74][equity-spot] reconnect failed:', err)); }, delay);
}

// 60-second health log
setInterval(() => {
  if (!state.enabled) return;
  const now = Date.now();
  const lastMsgAge = state.lastMsgAt > 0 ? now - state.lastMsgAt : -1;
  console.log(
    `[B74][equity-spot] connected=${state.ws?.readyState === WebSocket.OPEN} ` +
    `last_msg_age_ms=${lastMsgAge} rows_persisted_60s=${state.rowsPersistedLastMinute}`
  );
  state.rowsPersistedLastMinute = 0;
  state.rowsPersistedLastMinuteWindowStart = now;
}, 60_000);

export async function startEquitySpotArchiver(): Promise<void> {
  state.symbols = await loadEquitySpotUniverse();
  if (state.symbols.length === 0) {
    console.warn('[B74][equity-spot] universe is empty; archiver not started');
    return;
  }
  state.enabled = true;
  await connect();
}

export function stopEquitySpotArchiver(): void {
  state.enabled = false;
  if (state.ws) {
    try { state.ws.close(); } catch { /* ignore */ }
    state.ws = null;
  }
}
