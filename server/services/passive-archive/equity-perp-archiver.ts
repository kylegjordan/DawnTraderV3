/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B74 — Equity Perp (PF_*XUSD) Archiver
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Persistent WebSocket connection to wss://futures.kraken.com/ws/v1.
 * Subscribes to OHLC + ticker for the 10 PF_*XUSD perps.
 *
 * Kraken Futures WebSocket protocol differs from Kraken WS v2:
 *   - Subscription payload: { event: 'subscribe', feed: 'ticker', product_ids: ['PF_AAPLXUSD'] }
 *   - For OHLC: feed='candles_trade_1m'
 *
 * Reference: https://docs.futures.kraken.com/#websocket-api
 * ═════════════════════════════════════════════════════════════════════════════
 */

import WebSocket from 'ws';
import { loadEquityPerpUniverse } from './universe-loader.js';
import { bufferOhlcBar } from './ohlc-batch-writer.js';
import { bufferTickerSnap } from './ticker-batch-writer.js';
import { makeBackoff, type BackoffPolicy } from './reconnect-policy.js';

const WS_URL = 'wss://futures.kraken.com/ws/v1';
const UNIVERSE = 'equity_perp' as const;

interface ArchiverState {
  ws: WebSocket | null;
  symbols: string[];
  backoff: BackoffPolicy;
  enabled: boolean;
  lastMsgAt: number;
  rowsPersistedLastMinute: number;
}

const state: ArchiverState = {
  ws: null,
  symbols: [],
  backoff: makeBackoff(30),
  enabled: true,
  lastMsgAt: 0,
  rowsPersistedLastMinute: 0,
};

function parseOhlcBar(msg: any): void {
  if (!msg?.product_id || !msg?.time) return;
  bufferOhlcBar(UNIVERSE, {
    symbol: msg.product_id,
    universe: UNIVERSE,
    intervalBegin: new Date(msg.time),
    open: String(msg.open ?? '0'),
    high: String(msg.high ?? '0'),
    low: String(msg.low ?? '0'),
    close: String(msg.close ?? '0'),
    volume: String(msg.volume ?? '0'),
    vwap: msg.vwap != null ? String(msg.vwap) : null,
    tradeCount: msg.trade_count != null ? Number(msg.trade_count) : null,
  } as any);
  state.rowsPersistedLastMinute++;
}

function parseTickerSnap(msg: any): void {
  if (!msg?.product_id) return;
  bufferTickerSnap(UNIVERSE, {
    symbol: msg.product_id,
    universe: UNIVERSE,
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
    prevDayClose: null,    // not exposed by Kraken Futures WS
    prevDayVolume: null,
    isExtendedHours: null, // n/a for perps (24/7)
    openInterest: msg.openInterest != null ? String(msg.openInterest) : null,
    fundingRate: msg.funding_rate != null ? String(msg.funding_rate) : null,
  } as any);
}

function handleMessage(raw: WebSocket.RawData): void {
  state.lastMsgAt = Date.now();
  let msg: any;
  try {
    msg = JSON.parse(raw.toString());
  } catch {
    return;
  }
  // Kraken Futures sends per-message `feed` field
  if (msg.feed === 'candles_trade_1m_snapshot' || msg.feed === 'candles_trade_1m') {
    parseOhlcBar(msg);
  } else if (msg.feed === 'ticker' || msg.feed === 'ticker_snapshot') {
    parseTickerSnap(msg);
  }
}

function subscribe(ws: WebSocket): void {
  ws.send(JSON.stringify({
    event: 'subscribe',
    feed: 'candles_trade_1m',
    product_ids: state.symbols,
  }));
  ws.send(JSON.stringify({
    event: 'subscribe',
    feed: 'ticker',
    product_ids: state.symbols,
  }));
  console.log(`[B74][equity-perp] subscribed to candles_trade_1m + ticker for ${state.symbols.length} symbols`);
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
}

export function stopEquityPerpArchiver(): void {
  state.enabled = false;
  if (state.ws) {
    try { state.ws.close(); } catch { /* ignore */ }
    state.ws = null;
  }
}
