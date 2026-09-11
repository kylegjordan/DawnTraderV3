/**
 * ═════════════════════════════════════════════════════════════════════════════
 * P19-B-PERPFEED OBJ-3 — Kraken Futures Archiver (generalized engine)
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * The B74 `equity-perp-archiver.ts` singleton, converted to a parameterized
 * class instantiated once per capture leg (xstock_perp, crypto_perp). The
 * venue, protocol, dual-path capture, backoff and stats shape are identical
 * across legs — only the universe, asset-class stamp and log label differ.
 * A copied sibling was rejected at Step-1 review (rule 15); this conversion is
 * behaviour-preserving for the running xstock_perp leg (facade in
 * `equity-perp-archiver.ts` keeps its exact import surface).
 *
 * Dual capture path, unchanged from B74 (original intent quoted there):
 *   1. WebSocket (`wss://futures.kraken.com/ws/v1`) — TICKER ONLY. Kraken
 *      Futures WS v1 has NO candle/kline feed (verified 2026-04-30; the dead
 *      name `candles_trade_1m` is in KNOWN_NONEXISTENT_NAMES — do not re-attempt).
 *   2. REST polling (`https://futures.kraken.com/api/charts/v1/trade/<sym>/1m`)
 *      every 60s, deduped on last-seen interval_begin. Verified 2026-08-17 to
 *      serve crypto perp symbols identically (PF_XBTUSD → 2,000 live candles).
 * ═════════════════════════════════════════════════════════════════════════════
 */

import WebSocket from 'ws';
import { bufferOhlcBar, type ArchiveAssetClass } from './ohlc-batch-writer.js';
import { bufferTickerSnap } from './ticker-batch-writer.js';
import { validateOhlcFrame } from './ohlc-frame-validator.js';
import { noteOhlcFrameAccepted, noteOhlcFrameRejected } from './ohlc-frame-skip-tracker.js';
import { makeBackoff, type BackoffPolicy } from './reconnect-policy.js';

const WS_URL = 'wss://futures.kraken.com/ws/v1';
const REST_BASE = 'https://futures.kraken.com/api/charts/v1/trade';
const REST_POLL_INTERVAL_MS = 60_000;

export interface KrakenFuturesArchiverConfig {
  /** The asset-class stamp — also the batch-writer routing key (table pair). */
  assetClass: ArchiveAssetClass;
  /** Log label, e.g. 'equity-perp' / 'crypto-perp' (keeps the B74 log grammar). */
  legLabel: string;
  /** Universe loader for this leg — returns venue symbol names (PF_*). */
  loadUniverse: () => Promise<string[]>;
}

export interface KrakenFuturesArchiverStats {
  connected: boolean;
  configuredSymbols: number;
  cumulativeOhlcRows: number;
  cumulativeTickerSnaps: number;
  /** OHLC candles the frame guard REJECTED (#1028). */
  ohlcFramesSkipped: number;
}

export class KrakenFuturesArchiver {
  private ws: WebSocket | null = null;
  private symbols: string[] = [];
  private backoff: BackoffPolicy = makeBackoff(30);
  private enabled = false;
  private lastMsgAt = 0;
  /** *persisted*: candles BUFFERED in the last minute — the health line's `rows_persisted_60s`.
   *  ⚠️ Buffered, not rows persisted (pre-audit R5). */
  private rowsPersistedLastMinute = 0;
  private lastOhlcInterval: Map<string, number> = new Map();
  private restPollTimer: NodeJS.Timeout | null = null;
  private healthTimer: NodeJS.Timeout | null = null;
  /** *scanned*: every candle EVALUATED (above the mark), accepted or not — the panel's "scanned (since PID)".
   *  ⚠️ A rejected candle is re-evaluated, and re-counted, every poll until a newer one is accepted (C7). */
  private cumulativeOhlcRows = 0;
  /** *scanned*: every ticker snap received, malformed and throttled ones included. */
  private cumulativeTickerSnaps = 0;
  /** *skipped*: candles the frame guard REJECTED (#1028). An INSTANCE field — two legs, no cross-talk. */
  private ohlcFramesSkipped = 0;

  constructor(private readonly cfg: KrakenFuturesArchiverConfig) {}

  getStats(): KrakenFuturesArchiverStats {
    return {
      connected: this.ws?.readyState === WebSocket.OPEN,
      configuredSymbols: this.symbols.length,
      cumulativeOhlcRows: this.cumulativeOhlcRows,
      cumulativeTickerSnaps: this.cumulativeTickerSnaps,
      ohlcFramesSkipped: this.ohlcFramesSkipped,
    };
  }

  // ── REST polling for OHLC ────────────────────────────────────────────────

  private async pollOhlcOnce(symbol: string): Promise<number> {
    try {
      const resp = await fetch(`${REST_BASE}/${symbol}/1m`);
      if (!resp.ok) return 0;
      const data = await resp.json() as { candles?: Array<{ time: number; open: string; high: string; low: string; close: string; volume?: string } | null> };
      if (!data.candles || data.candles.length === 0) return 0;
      const lastSeen = this.lastOhlcInterval.get(symbol) ?? 0;
      let newCount = 0;
      let maxTime = lastSeen;
      for (const candle of data.candles) {
        // B-OHLC-FRAME-GUARD (#1028): the skip and the mark are TODAY'S (pre-audit P2, r4). `candle?.time`,
        // so a null element cannot throw; a numeric time at or below the mark is skipped exactly as before.
        const time = candle?.time;
        if (typeof time === 'number' && time <= lastSeen) continue;
        // Every other candle is EVALUATED, and *scanned* counts it whether or not it is buffered.
        // ⚠️ C7: a rejected candle stays above the mark and is re-scanned every poll until a newer one is
        // accepted, so a renamed field inflates *scanned* and collapses the panel's store % — a counting
        // artifact, not a feed collapse; read *skipped* beside it. The mark and the re-read are `#1030`.
        this.cumulativeOhlcRows++;
        const verdict = validateOhlcFrame({
          symbol,
          intervalBegin: time,
          open: candle?.open,
          high: candle?.high,
          low: candle?.low,
          close: candle?.close,
          volume: candle?.volume ?? '0',
          vwap: null,
          trades: null,
        });
        if (!verdict.ok) {
          // The mark does NOT move for a rejected candle.
          this.ohlcFramesSkipped++;
          noteOhlcFrameRejected('kraken-futures', this.cfg.assetClass, { symbol, intervalBegin: time }, verdict);
          continue;
        }
        const bar = verdict.row;
        bufferOhlcBar(this.cfg.assetClass, {
          symbol,
          assetClass: this.cfg.assetClass,
          exchange: 'kraken-futures',
          intervalBegin: bar.intervalBegin,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: bar.volume,
          vwap: null,
          tradeCount: null,
        } as any);
        noteOhlcFrameAccepted(this.cfg.assetClass, symbol);
        newCount++;
        if (typeof time === 'number' && time > maxTime) maxTime = time;
      }
      if (maxTime > lastSeen) this.lastOhlcInterval.set(symbol, maxTime);
      return newCount;
    } catch {
      return 0;
    }
  }

  private async pollAllOhlc(): Promise<void> {
    if (!this.enabled || this.symbols.length === 0) return;
    let totalNew = 0;
    for (const sym of this.symbols) {
      totalNew += await this.pollOhlcOnce(sym);
      await new Promise(r => setTimeout(r, 100)); // 100ms space-out so we don't hammer the REST endpoint
    }
    if (totalNew > 0) {
      console.log(`[B74][${this.cfg.legLabel}][rest] polled ${this.symbols.length} symbols, ${totalNew} new bars`);
      this.rowsPersistedLastMinute += totalNew;
    }
  }

  // ── WebSocket for ticker ─────────────────────────────────────────────────

  private parseTickerSnap(msg: any): void {
    // *scanned* counts every snap RECEIVED, so it is bumped before the guard (#1029).
    this.cumulativeTickerSnaps++;
    if (!msg?.product_id) return;
    bufferTickerSnap(this.cfg.assetClass, {
      symbol: msg.product_id,
      assetClass: this.cfg.assetClass,
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
  }

  private handleMessage(raw: WebSocket.RawData): void {
    this.lastMsgAt = Date.now();
    let msg: any;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.feed === 'ticker' || msg.feed === 'ticker_snapshot') {
      this.parseTickerSnap(msg);
    }
  }

  private subscribe(ws: WebSocket): void {
    ws.send(JSON.stringify({
      event: 'subscribe',
      feed: 'ticker',
      product_ids: this.symbols,
    }));
    console.log(`[B74][${this.cfg.legLabel}] subscribed to ticker for ${this.symbols.length} symbols (OHLC via REST polling at ${REST_POLL_INTERVAL_MS / 1000}s interval)`);
  }

  private async connect(): Promise<void> {
    if (!this.enabled) return;
    if (this.ws) {
      try { this.ws.close(); } catch { /* ignore */ }
      this.ws = null;
    }
    const ws = new WebSocket(WS_URL);
    this.ws = ws;

    ws.on('open', () => {
      console.log(`[B74][${this.cfg.legLabel}] connected (attempt ${this.backoff.attempts() + 1})`);
      this.backoff.reset();
      this.subscribe(ws);
    });

    ws.on('message', (raw) => this.handleMessage(raw));

    ws.on('close', (code, reason) => {
      console.warn(`[B74][${this.cfg.legLabel}] disconnected code=${code} reason=${reason.toString()}`);
      this.scheduleReconnect();
    });

    ws.on('error', (err) => {
      console.warn(`[B74][${this.cfg.legLabel}] ws error: ${err.message}`);
    });
  }

  private scheduleReconnect(): void {
    if (!this.enabled) return;
    const delay = this.backoff.nextDelayMs();
    console.warn(`[B74][${this.cfg.legLabel}] reconnecting in ${delay}ms (attempt ${this.backoff.attempts()})`);
    setTimeout(() => { this.connect().catch(err => console.error(`[B74][${this.cfg.legLabel}] reconnect failed:`, err)); }, delay);
  }

  async start(): Promise<void> {
    this.symbols = await this.cfg.loadUniverse();
    if (this.symbols.length === 0) {
      console.warn(`[B74][${this.cfg.legLabel}] universe is empty; archiver not started`);
      return;
    }
    this.enabled = true;
    await this.connect();

    // REST polling timer for OHLC; initial poll immediately so we don't wait 60s.
    this.restPollTimer = setInterval(() => {
      this.pollAllOhlc().catch(err => console.warn(`[B74][${this.cfg.legLabel}][rest] poll-cycle failed:`, err));
    }, REST_POLL_INTERVAL_MS);
    this.pollAllOhlc().catch(err => console.warn(`[B74][${this.cfg.legLabel}][rest] initial poll failed:`, err));

    // 60-second health log. Per-instance (the singleton's module-level timer
    // ran unconditionally from import time; a stopped instance keeps quiet).
    this.healthTimer = setInterval(() => {
      if (!this.enabled) return;
      const now = Date.now();
      const lastMsgAge = this.lastMsgAt > 0 ? now - this.lastMsgAt : -1;
      console.log(
        `[B74][${this.cfg.legLabel}] connected=${this.ws?.readyState === WebSocket.OPEN} ` +
        `last_msg_age_ms=${lastMsgAge} rows_persisted_60s=${this.rowsPersistedLastMinute}`
      );
      this.rowsPersistedLastMinute = 0;
    }, 60_000);
  }

  stop(): void {
    this.enabled = false;
    if (this.restPollTimer) {
      clearInterval(this.restPollTimer);
      this.restPollTimer = null;
    }
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
    if (this.ws) {
      try { this.ws.close(); } catch { /* ignore */ }
      this.ws = null;
    }
  }
}
