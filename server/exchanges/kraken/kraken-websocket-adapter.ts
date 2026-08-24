import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { crc32 as zlibCrc32 } from 'zlib'; // #507: zlib.crc32 -- present from Node 20.15 (staging runs 20.20.0); no new dependency
import { contextBridge } from '../../services/context-bridge.js';
import type { PriceProducer } from '../../services/live-pricing-adapter.js';
// B78.1: removed `import { livePricingAdapter } from './live-pricing-adapter.js'`.
// Cycle break: ws-adapter is now a leaf in the exchange layer. live-pricing-adapter
// subscribes to ws-adapter's 'priceTick' events at module-load instead of
// ws-adapter calling livePricingAdapter.updateCache(...). For the broadcast
// payload's `mode` field, ws-adapter exposes bindTradingModeGetter(getter); if no
// getter is bound it defaults to 'paper' and warns ONCE.
import { krakenPairMetadataService } from './kraken-pair-metadata-service.js';
import { 
  resolveByKrakenWsPair, 
  normalizeToInternalSymbol, 
  toKrakenWS, 
  mapKrakenPairToInternal, 
  isMappable,
  getSymbolMappingDetails
} from '../../markets/kraken-symbol-resolver.js';
import { priceTraceService } from '../../services/price-trace-service.js';
import { krakenAssetPairsService } from '../../markets/kraken-asset-pairs-service.js';
import { priceCache } from '../../services/price-cache.js';
import { volumeClassifier, VolumeTier, TIER_THRESHOLDS } from '../../services/market-data/volume-classifier.js';
import { translateV2ToV1, isValidV2TickerUpdate, KrakenV2TickerUpdate } from '../../services/market-data/kraken-v2-translator.js';
import * as fs from 'fs';

/**
 * Directive 8.9.0-B: Kraken WebSocket v2 Price Engine
 * 
 * Connects to Kraken's Spot WebSocket v2 feed for real-time ticker updates.
 * Replaces REST-based price fetching for open trade monitoring.
 * 
 * Features:
 * - Real-time ticker subscriptions via wss://ws.kraken.com/v2
 * - BBO (best-bid-offer) event trigger for continuous updates
 * - Snapshot on subscribe for immediate price data
 * - Dynamic symbol subscription management
 * - Automatic reconnection with exponential backoff
 * - Price cache integration with LivePricingAdapter
 * - WebSocket broadcasts to connected clients
 * - Diagnostic logging for price cadence verification
 * 
 * v2 Upgrade Benefits:
 * - Updates on any bid/offer change, not just trades
 * - Immediate snapshot data on subscription
 * - Better coverage for low-volume pairs
 */

interface KrakenTickerPayload {
  a: [string, number, string];  // Ask [price, wholeLotVolume, lotVolume]
  b: [string, number, string];  // Bid [price, wholeLotVolume, lotVolume]
  c: [string, string];          // Last trade closed [price, lotVolume]
  v: [string, string];          // Volume [today, 24h]
  p: [string, string];          // VWAP [today, 24h]
  t: [number, number];          // Trade count [today, 24h]
  l: [string, string];          // Low [today, 24h]
  h: [string, string];          // High [today, 24h]
  o: [string, string];          // Open [today, 24h]
}

interface PriceTickLog {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  timestamp: string;
  receivedAt: number;
  intervalMs: number;
}

interface SymbolStats {
  lastUpdate: number;
  updateCount: number;
  intervals: number[];
  firstUpdate: number; // Phase 8.8.3-I4: Track when first tick received
  warningLogged?: boolean; // 8.8.9: Track if Sentinel warning was logged (reset on each tick)
}

/**
 * Phase 8.8.3-I4: Per-symbol timing stats for diagnostics
 */
interface PerSymbolTimingStats {
  symbol: string;
  lastTickTime: string;
  lastTickAgeMs: number;
  ticksPerMinute: number;
  source: string;
  updateCount: number;
}

// B78.1: 'priceTick' event payload (matches livePricingAdapter.updateCache signature)
export interface PriceTickEvent {
  symbol: string;
  price: number;
  source: 'kraken_ws';
  /**
   * B-EXIT-PROVENANCE (#741) — REQUIRED, never optional. `source` is 'kraken_ws' for BOTH the
   * ticker print and the book midpoint, which is precisely how a ghost-contaminated mid reached the
   * exit monitor wearing a clean feed's badge. This says which HANDLER emitted it. Required + closed
   * means a fourth producer is a COMPILE ERROR rather than a silent absence (#546).
   */
  producer: PriceProducer;
  traceId?: string;
}

export class KrakenWebSocketAdapter extends EventEmitter {
  private ws: WebSocket | null = null;
  private isConnected: boolean = false;
  private isConnecting: boolean = false;
  private subscribedSymbols: Set<string> = new Set();
  private pendingSubscriptions: Set<string> = new Set();
  private unrecognizedSymbols: Set<string> = new Set(); // Phase 8.8.3: Track symbols that fail normalization
  private reconnectAttempts: number = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private lastPongTime: number = Date.now();

  // B78.1: cycle-break inversion state
  private tradingModeGetter: (() => 'paper' | 'live') | null = null;
  private tradingModeWarnedOnce: boolean = false;
  private priceTickCount: number = 0;
  private priceTickWindowStart: number = Date.now();
  private priceTickRateInterval: NodeJS.Timeout | null = null;
  
  // Phase 8.8.3-I7-WS-A: Diagnostic tracking for subscription and tick flow audit
  private firstTickReceived: Set<string> = new Set(); // Track which symbols have received first tick
  private subscriptionAcks: Map<string, { acked: boolean; timestamp: number }> = new Map();
  private subscriptionRequests: Map<string, { krakenWsPair: string; internalSymbol: string; timestamp: number }> = new Map();
  private unmappedTicks: Map<string, { count: number; lastSeen: number }> = new Map(); // Track unmapped tick events for gap reporting
  
  // Phase 8.8.3-I7-WS-F: Subscription health monitoring
  private subscriptionHealthInterval: NodeJS.Timeout | null = null;
  private readonly ACK_TIMEOUT_MS = 5000; // 5 seconds without ACK
  private readonly NO_TICK_TIMEOUT_MS = 10000; // 10 seconds without tick after ACK
  
  // 8.9.4-Patch: Stateful mini-book tracking for stable mid-price computation
  private orderBooks = new Map<string, { bids: Map<number, number>; asks: Map<number, number> }>();
  // B-BOOK-TRUNCATE-HOTFIX (#507): the RAW price/qty strings per level, kept beside the numeric
  // book because Kraken computes its checksum over the STRING representations (decimal point
  // removed, leading zeros stripped) -- a float round-trip would silently change the input.
  private bookRaw = new Map<string, { bids: Map<number, [string, string]>; asks: Map<number, [string, string]> }>();
  // Subscribed depth PER SYMBOL, recorded from the subscribe ACK -- the depth Kraken GRANTED,
  // never the depth requested. The main subscribe asks 10 and is granted it. The B78.2
  // channel-switch path asks depth 1 and Kraken REJECTS it ('Subscription depth not supported'),
  // so no ack arrives and the previous granted depth stands. ⚠️ WATCH ITEM (Langston, #737): if
  // that request ever DID ack, truncating to a single level would starve the depth gate and
  // silently suppress opens for that symbol -- it fails CLOSED, so no bad fills, but it is the
  // kind of quiet suppression noticed weeks later.
  private bookDepth = new Map<string, number>();
  private bookChecksumMismatches = new Map<string, number>();
  private bookChecksumMatches = new Map<string, number>();
  // #507 remainder: per-symbol price/qty precision from the v2 `instrument` channel. Kraken's
  // checksum is computed over the STRING form at the instrument's own precision -- it sends
  // price/qty as JSON NUMBERS, so `String(2993)` gives '2993' where the CRC input is '299300000'.
  // Measured on the live venue before building this: 0/40 messages matched without it, 40/40 with.
  private symbolPrecision = new Map<string, { price: number; qty: number }>();
  private instrumentSnapshotAt: number | null = null;
  private bookChecksumAttempts = new Map<string, number>();
  // #546 / Langston: a counter DECLARED but never WRITTEN publishes a confident wrong answer --
  // a Step-8 reader sees 'nothing skipped for precision' for a bucket that is not implemented.
  // Kept as state for when the precision feed arms it, but NOT published until then.
  private bookChecksumSkippedNoPrecision = new Map<string, number>();
  private bookCrossedDetections = new Map<string, number>();          // bestBid >= bestAsk AFTER truncation
  private bookUpdatesApplied = new Map<string, number>();             // the DENOMINATOR every rate above needs
  private readonly bookCountersSince = Date.now();                    // so the denominator travels with the number
  // P19-B4b.1: per-symbol last book-update wall-clock (ms) — book-specific freshness
  // for the depth-walked fill warmth gate (distinct from symbolStats.lastUpdate which
  // can conflate ticker + book channels).
  private bookUpdatedAt = new Map<string, number>();
  
  // Phase 8.8.3-I8C: Subscription reliability - open positions provider and audit interval
  private i8cAuditInterval: NodeJS.Timeout | null = null;
  private i8cOpenPositionsProvider: (() => Promise<string[]>) | null = null;
  private i8cIsReconnecting: boolean = false;
  private readonly I8C_AUDIT_INTERVAL_MS = 5000; // 5-second subscription health audit
  // Phase 8.8.3-I8E: Increased stale threshold for low-volume pairs (was 10s)
  // Kraken low-volume pairs tick every 10-40 seconds
  // 30s threshold differentiates low-volume from truly broken connections
  private readonly I8C_STALE_THRESHOLD_MS = 30000; // 30 seconds = truly stale (resubscribe)
  private readonly I8E_LOW_VOLUME_MIN_MS = 5000;  // 5-25s = normal low-volume behavior
  private readonly I8E_LOW_VOLUME_MAX_MS = 25000; // don't resubscribe in this window
  
  // Phase 8.8.3-I7-WS-G: Tick Frequency Stabilization
  private tickFrequencyData: Map<string, {
    lastTickTimestamp: number;
    tickIntervals: number[];
    frozenSince: number | null;
    classification: 'normal' | 'slow' | 'very_slow' | 'frozen';
    correctionAttempts: { timestamp: number }[];
    isUnstable: boolean;
    currentChannel: 'ticker' | 'book';
    bookRevertTimer: NodeJS.Timeout | null;
  }> = new Map();
  private tickFrequencyMonitorInterval: NodeJS.Timeout | null = null;
  private readonly SLOW_THRESHOLD_MS = 3500;
  private readonly VERY_SLOW_THRESHOLD_MS = 6000;
  private readonly FROZEN_THRESHOLD_MS = 10000;
  private readonly MAX_CORRECTION_ATTEMPTS = 3;
  private readonly CORRECTION_WINDOW_MS = 60000; // 60 seconds
  private readonly BOOK_REVERT_DELAY_MS = 120000; // 120 seconds stable before reverting
  
  // Phase 8.8.3-I7-WS-G (G3): Channel hints for low-liquidity pairs
  private readonly KRAKEN_CHANNEL_HINTS = {
    low_liquidity: ['TIA/USD', 'FORTH/USD', 'PROVEEUR', 'BAND/USD', 'SC/USD', 'RLC/EUR', 'OGN/USD'],
    prefer_book: ['TIA/USD', 'BAND/USD', 'SC/USD', 'RLC/EUR']
  };
  
  // Phase 8.8.3-I4 B4: Periodic price tick health logging
  private priceTickHealthInterval: NodeJS.Timeout | null = null;
  private openPositionSymbolsProvider: (() => string[] | Promise<string[]>) | null = null;
  
  // Phase 8.8.5: Tiered Sentinel Architecture
  private lastGlobalHeartbeat: number = 0;
  private lastMessageTime: number = 0;
  private reconnectRetries: number = 0;
  private globalHeartbeatMonitorInterval: NodeJS.Timeout | null = null;
  private channelWatchdogTimers: Map<string, NodeJS.Timeout> = new Map();
  private healthMetricsLoggerInterval: NodeJS.Timeout | null = null;
  private startTime: number = Date.now();
  
  // Phase 8.8.5: Health metrics tracking
  private sentinelResets: number = 0;
  private heartbeatLatencies: number[] = [];
  private restFallbacksBlocked: number = 0;
  private restFallbacksAllowed: number = 0;
  
  // Directive 9.0.A: Safe Heartbeat Monitor tracking
  private lastHeartbeat: number = Date.now();
  private missedHeartbeats: number = 0;
  private resubscribeEvents: number = 0;
  private heartbeat90Interval: NodeJS.Timeout | null = null;
  private readonly HEARTBEAT_90_CHECK_MS = 15000; // Check every 15s per directive
  private readonly HEARTBEAT_90_TIMEOUT_MS = 60000; // 60s timeout per directive
  
  // Phase 8.8.5: Configuration
  // Note: Kraken sends heartbeats ~every 1-2s but only when there are active subscriptions
  // We use lastMessageTime (any message) as the primary liveness check
  private readonly GLOBAL_HEARTBEAT_CHECK_MS = 1000; // 1 Hz check
  private readonly CONNECTION_LIVENESS_TIMEOUT_MS = 45000; // 45 seconds without ANY message = reconnect
  private readonly PING_INACTIVITY_MS = 20000; // Send ping if no message for 20s
  private readonly MAX_RECONNECT_DELAY_BACKOFF_MS = 60000; // Max 60s backoff
  
  private readonly WS_URL = 'wss://ws.kraken.com/v2'; // 8.9.4: Production v2 endpoint with book channel
  private readonly MAX_RECONNECT_ATTEMPTS = 10;
  private readonly BASE_RECONNECT_DELAY_MS = 1000;
  private readonly MAX_RECONNECT_DELAY_MS = 30000;
  private readonly HEARTBEAT_INTERVAL_MS = 30000;
  private readonly STALE_THRESHOLD_MS = 3000;
  private readonly BROADCAST_THROTTLE_MS = 1000;
  private readonly MAX_PRICE_LOGS = 100;
  
  private symbolStats: Map<string, SymbolStats> = new Map();
  private priceTickLogs: PriceTickLog[] = [];
  private lastBroadcastTime: Map<string, number> = new Map();
  
  private readonly MODULE_NAME = 'KrakenWS';

  private readonly instanceId = `ws-adapter-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  
  constructor() {
    super();
    // B78.1: increase max listeners from default (10) since multiple consumers
    // may subscribe to 'priceTick' over time (live-pricing primarily; future
    // observability listeners possible). 50 is generous; we expect 1-3 in practice.
    this.setMaxListeners(50);
    console.log(`[${this.MODULE_NAME}] Kraken WebSocket Adapter initialized (instanceId: ${this.instanceId})`);

    // B78.1: priceTick rate metric. Logs total ticks emitted in the last 60s
    // window so future regressions become visible without log archaeology.
    this.priceTickRateInterval = setInterval(() => {
      const now = Date.now();
      const windowMs = now - this.priceTickWindowStart;
      const ratePerMin = windowMs > 0 ? Math.round((this.priceTickCount * 60_000) / windowMs) : 0;
      console.log(`[B78.1][WS_TICK_RATE] priceTickEventsPerMinute=${ratePerMin} (count=${this.priceTickCount} over ${Math.round(windowMs / 1000)}s)`);
      this.priceTickCount = 0;
      this.priceTickWindowStart = now;
    }, 60_000);
  }

  /**
   * B78.1: Bind a getter for the current trading mode. Called once by
   * live-pricing-adapter at module-load. Replaces the pre-B78.1 direct
   * import + livePricingAdapter.getTradingMode() call from this module
   * (which created the bidirectional cycle with live-pricing-adapter).
   */
  bindTradingModeGetter(getter: () => 'paper' | 'live'): void {
    this.tradingModeGetter = getter;
    console.log(`[B78.1][WS_ADAPTER] tradingMode getter bound by consumer.`);
  }

  /**
   * B78.1: Resolve the current trading mode for broadcast-payload labeling.
   * Default: 'paper' (CLAUDE.md §8.10 no-silent-fallbacks rule applies — we
   * warn ONCE if the getter is unbound; live trading is gated downstream
   * regardless so the default is safe).
   */
  private resolveTradingMode(): 'paper' | 'live' {
    if (this.tradingModeGetter) {
      try {
        return this.tradingModeGetter();
      } catch (err) {
        if (!this.tradingModeWarnedOnce) {
          console.warn(`[B78.1][WS_ADAPTER] tradingModeGetter threw; defaulting to 'paper'. Error:`, err);
          this.tradingModeWarnedOnce = true;
        }
        return 'paper';
      }
    }
    if (!this.tradingModeWarnedOnce) {
      console.warn(`[B78.1][WS_ADAPTER] tradingModeGetter NOT BOUND — broadcasts will be labeled 'paper'. live-pricing-adapter must call bindTradingModeGetter() at startup.`);
      this.tradingModeWarnedOnce = true;
    }
    return 'paper';
  }

  async start(): Promise<void> {
    // Phase 8.8.3-I7-WS-DEBUG: Verify krakenAssetPairsService initialization
    const assetPairsReady = krakenAssetPairsService.isReady();
    const assetPairsSummary = krakenAssetPairsService.getSummary();
    console.log(`[I7-WS-DEBUG] krakenAssetPairsService status:`, {
      instanceId: this.instanceId,
      isReady: assetPairsReady,
      total: assetPairsSummary.total,
      tier1: assetPairsSummary.tier1,
      tier2: assetPairsSummary.tier2
    });
    
    // Phase 8.8.3-B9.FIX-WS-START: Diagnostic log on start
    console.log('[DEBUG-B9][KrakenWS][START]', {
      startedAt: new Date().toISOString(),
      isConnected: this.isConnected,
      isConnecting: this.isConnecting,
      subscribedSymbolCount: this.subscribedSymbols.size,
    });
    
    if (this.isConnected || this.isConnecting) {
      console.log(`[${this.MODULE_NAME}] Already connected or connecting`);
      return;
    }
    
    console.log(`[${this.MODULE_NAME}] Starting WebSocket connection to ${this.WS_URL}`);
    await this.connect();
  }

  stop(): void {
    // Phase 8.8.3-B9.FIX-WS-START: Diagnostic log on stop
    console.log('[DEBUG-B9][KrakenWS][STOP]', {
      stoppedAt: new Date().toISOString(),
      wasConnected: this.isConnected,
      subscribedSymbolCount: this.subscribedSymbols.size,
      pendingSubscriptionCount: this.pendingSubscriptions.size,
    });
    
    console.log(`[${this.MODULE_NAME}] Stopping WebSocket adapter`);
    
    this.cleanup();
    
    if (this.ws) {
      try {
        this.ws.close(1000, 'Normal closure');
      } catch (error) {
        console.error(`[${this.MODULE_NAME}] Error closing WebSocket:`, error);
      }
      this.ws = null;
    }
    
    this.isConnected = false;
    this.isConnecting = false;
    this.subscribedSymbols.clear();
    this.pendingSubscriptions.clear(); // Phase 8.8.3-B9.FIX-WS-START: Clear pending to avoid stale resubscriptions
    this.reconnectAttempts = 0;
    
    console.log('[DEBUG-B9][KrakenWS][STOP_COMPLETE]', {
      subscribedCleared: this.subscribedSymbols.size === 0,
      pendingCleared: this.pendingSubscriptions.size === 0,
    });
  }

  private cleanup(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private async connect(): Promise<void> {
    if (this.isConnecting) return;
    
    this.isConnecting = true;
    this.cleanup();
    
    try {
      this.ws = new WebSocket(this.WS_URL);
      
      this.ws.on('open', () => this.handleOpen());
      this.ws.on('message', (data: WebSocket.Data) => this.handleMessage(data));
      this.ws.on('close', (code: number, reason: Buffer) => this.handleClose(code, reason.toString()));
      this.ws.on('error', (error: Error) => this.handleError(error));
      this.ws.on('pong', () => this.handlePong());
      
    } catch (error) {
      console.error(`[${this.MODULE_NAME}] Connection error:`, error);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  private handleOpen(): void {
    console.log(`[${this.MODULE_NAME}] WebSocket connected`);
    
    // Phase 8.8.3-I8C: Detect reconnect scenario
    const wasReconnect = this.i8cIsReconnecting;
    this.i8cIsReconnecting = false;
    
    this.isConnected = true;
    this.isConnecting = false;
    this.reconnectAttempts = 0;
    this.lastPongTime = Date.now();
    
    this.startHeartbeat();
    
    // Phase 8.8.5: Start global heartbeat monitor and health logger
    this.startGlobalHeartbeatMonitor();
    this.startHealthMetricsLogger();
    
    // Directive 9.0.A: Start 9.0 safe heartbeat monitor
    this.start90HeartbeatMonitor();
    
    if (this.pendingSubscriptions.size > 0) {
      console.log(`[${this.MODULE_NAME}] Subscribing to ${this.pendingSubscriptions.size} pending symbols`);
      this.subscribeToSymbols(Array.from(this.pendingSubscriptions));
      // Phase 8.8.3-I7-WS-A: Do NOT clear pendingSubscriptions here - wait for ACK in handleSystemMessage()
      // Premature clearing prevents detection of pending-ACK state in diagnostics
    }
    
    // Phase 8.8.3-I8C: On reconnect, use I8C helper exclusively for all open positions
    // This avoids double-subscribe and ensures audit tagging
    if (wasReconnect) {
      console.log(`[I8C-WS-RECONNECT] reconnect_detected`);
      // Clear previous subscriptions - I8C helper will resubscribe all open positions
      this.subscribedSymbols.clear();
      this.i8cResubscribeAllOpenPositions();
    } else if (this.subscribedSymbols.size > 0) {
      // Non-reconnect case: resubscribe to existing symbols
      console.log(`[${this.MODULE_NAME}] Resubscribing to ${this.subscribedSymbols.size} symbols`);
      const symbols = Array.from(this.subscribedSymbols);
      this.subscribedSymbols.clear();
      this.subscribeToSymbols(symbols);
    }
    
    contextBridge.broadcast({
      type: 'ws_price_engine',
      payload: {
        status: 'connected',
        timestamp: new Date().toISOString()
      }
    }).catch(err => console.error(`[${this.MODULE_NAME}] Broadcast error:`, err));
  }

  private handleMessage(data: WebSocket.Data): void {
    // Phase 8.8.5: Update last message time for keep-alive logic
    this.lastMessageTime = Date.now();
    
    // Directive 9.0.A: Update heartbeat on any valid message
    this.handleHeartbeatMessage();
    
    // I7-WS-RAW: Log raw incoming Kraken messages (first 200 chars)
    const rawStr = data.toString();
    console.log("[I7-WS-RAW]", rawStr.slice(0, 200));
    
    try {
      const message = JSON.parse(rawStr);
      
      // 8.9.0-B: Handle v2 Ticker Updates (Object Form)
      // v2 format: { channel: "ticker", type: "update"|"snapshot", data: [{symbol, bid, ask, ...}] }
      if (message && typeof message === 'object' && message.channel === 'ticker') {
        if (message.type === 'update' || message.type === 'snapshot') {
          this.handleV2TickerUpdate(message);
        }
        return;
      }
      
      // 8.9.4: Handle v2 Book Updates for continuous midpoint pricing
      // #507: the instrument channel carries per-pair precision. ONE snapshot of every pair, then
      // effectively silent (measured 2026-08-23: 1 snapshot / 1,432 pairs / ~566 KB, then ZERO
      // updates in 60s). Public, unauthenticated, and it rides THIS existing connection -- no new
      // socket, and REST rate limits are untouched.
      if (message && typeof message === 'object' && message.channel === 'instrument') {
        if (message.type === 'snapshot' || message.type === 'update') {
          this.handleInstrumentMessage(message);
        }
        return;
      }

      // v2 format: { channel: "book", type: "update"|"snapshot", data: [{symbol, bids, asks, ...}] }
      if (message && typeof message === 'object' && message.channel === 'book') {
        if (message.type === 'update' || message.type === 'snapshot') {
          this.handleV2BookUpdate(message);
        }
        return;
      }
      
      // 8.9.0-B: Handle v2 Subscription Responses
      // v2 format: { method: "subscribe", result: {...}, success: true/false }
      if (message && typeof message === 'object' && message.method) {
        this.handleV2SystemMessage(message);
        return;
      }
      
      // 8.9.0-B: Handle v2 Heartbeat
      if (message && typeof message === 'object' && message.channel === 'heartbeat') {
        const now = Date.now();
        if (this.lastGlobalHeartbeat > 0) {
          const latency = now - this.lastGlobalHeartbeat;
          this.heartbeatLatencies.push(latency);
          if (this.heartbeatLatencies.length > 60) {
            this.heartbeatLatencies.shift();
          }
        }
        this.lastGlobalHeartbeat = now;
        return;
      }
      
      // 8.9.0-B: Handle v2 Status messages
      if (message && typeof message === 'object' && message.channel === 'status') {
        console.log(`[8.9.0-B][WS] Status: ${message.type}`, message.data);
        return;
      }
      
      // Log unrecognized message formats for debugging
      console.log(`[8.9.0-B][WS] Unrecognized message format:`, rawStr.slice(0, 100));
      
    } catch (error) {
      console.error(`[${this.MODULE_NAME}] Error parsing message:`, error);
    }
  }

  private handleSystemMessage(message: any): void {
    const { event, status, errorMessage, pair, channelName } = message;
    
    switch (event) {
      case 'systemStatus':
        console.log(`[${this.MODULE_NAME}] System status: ${status}`);
        break;
        
      case 'subscriptionStatus':
        if (status === 'subscribed') {
          // Phase 8.8.4: Use mapKrakenPairToInternalSymbol for consistent symbol tracking
          const internalSymbol = this.mapKrakenPairToInternalSymbol(pair);
          if (internalSymbol) {
            console.log(`[${this.MODULE_NAME}] Subscribed to ${channelName} for ${pair} -> ${internalSymbol}`);
            this.subscribedSymbols.add(internalSymbol);
            
            // Phase 8.8.3-I7-WS-A (A2): Clear pending state on ACK
            this.pendingSubscriptions.delete(internalSymbol);
            this.subscriptionRequests.delete(internalSymbol);
            
            // Phase 8.8.3-I7-WS-A (A2): Log subscription acknowledgment
            console.log(`[I7-WS-A][SUB_ACK] kraken_ws_pair=${pair} status=success internal_symbol=${internalSymbol}`);
            this.subscriptionAcks.set(internalSymbol, { acked: true, timestamp: Date.now() });
          } else {
            console.warn(`[${this.MODULE_NAME}] Subscribed to ${channelName} for ${pair} but could not map to internal symbol`);
            // Phase 8.8.3-I7-WS-A (A2): Log ACK with mapping failure
            console.log(`[I7-WS-A][SUB_ACK] kraken_ws_pair=${pair} status=success_unmapped internal_symbol=null`);
          }
        } else if (status === 'error') {
          // Phase 8.8.3-I7-WS-A: Try to map and clear pending state on rejection too
          const failedInternalSymbol = this.mapKrakenPairToInternalSymbol(pair);
          if (failedInternalSymbol) {
            this.pendingSubscriptions.delete(failedInternalSymbol);
            this.subscriptionRequests.delete(failedInternalSymbol);
          }
          console.error(`[${this.MODULE_NAME}] Subscription error for ${pair}: ${errorMessage}`);
          // Phase 8.8.3-I7-WS-A (A2): Log subscription rejection
          console.log(`[I7-WS-A][SUB_REJECT] kraken_ws_pair=${pair} error=${errorMessage}`);
        }
        break;
        
      case 'heartbeat':
        break;
        
      case 'pong':
        this.lastPongTime = Date.now();
        break;
        
      default:
        console.log(`[${this.MODULE_NAME}] Unknown event: ${event}`);
    }
  }

  /**
   * 8.9.0-B: Handle v2 system messages (subscription acks, errors, etc.)
   */
  private handleV2SystemMessage(message: any): void {
    const { method, result, success, error } = message;
    
    if (method === 'subscribe') {
      if (success && result) {
        const symbol = result.symbol;
        const internalSymbol = this.mapKrakenPairToInternalSymbol(symbol);
        
        if (internalSymbol) {
          console.log(`[8.9.0-B][WS] Sub OK: ${symbol} -> ${internalSymbol}`);
          // #507 / Langston BLOCKER-2: record the depth Kraken GRANTED, from the ack, never the
          // depth we asked for. A rejected request (depth:1 is 'not supported') never reaches here,
          // so the previous granted depth stands and truncation stays correct for that symbol.
          if (result.channel === 'book' && Number.isInteger(result.depth) && result.depth > 0) {
            this.bookDepth.set(internalSymbol, result.depth);
          }
          this.subscribedSymbols.add(internalSymbol);
          this.pendingSubscriptions.delete(internalSymbol);
          this.subscriptionRequests.delete(internalSymbol);
          this.subscriptionAcks.set(internalSymbol, { acked: true, timestamp: Date.now() });
        } else {
          console.warn(`[8.9.0-B][WS] Sub OK but unmapped: ${symbol}`);
        }
      } else if (!success) {
        console.error(`[8.9.0-B][WS] Sub Error: ${error}`);
      }
    } else if (method === 'unsubscribe') {
      if (success && result) {
        console.log(`[8.9.0-B][WS] Unsub OK: ${result.symbol}`);
      }
    } else if (method === 'pong') {
      this.lastPongTime = Date.now();
    } else {
      console.log(`[8.9.0-B][WS] System message: ${method}`, success ? 'success' : 'failed');
    }
  }

  /**
   * 8.9.0-B: Handle v2 ticker updates
   * v2 format: { channel: "ticker", type: "update"|"snapshot", data: [{symbol, bid, ask, last, ...}] }
   */
  private handleV2TickerUpdate(message: any): void {
    const updates = message.data || [];
    
    for (const update of updates) {
      if (!isValidV2TickerUpdate(update)) {
        console.warn(`[8.9.0-B][WS_TICK] Invalid v2 ticker update:`, update);
        continue;
      }
      
      const krakenPair = update.symbol;
      const internalSymbol = this.mapKrakenPairToInternalSymbol(krakenPair);
      
      if (!internalSymbol) {
        const existing = this.unmappedTicks.get(krakenPair) || { count: 0, lastSeen: 0 };
        this.unmappedTicks.set(krakenPair, { count: existing.count + 1, lastSeen: Date.now() });
        continue;
      }
      
      const now = Date.now();
      
      // Update Sentinel Health stats
      const stats = this.symbolStats.get(internalSymbol) || {
        lastUpdate: 0,
        updateCount: 0,
        intervals: [],
        firstUpdate: now,
        warningLogged: false
      };
      
      const intervalMs = stats.lastUpdate > 0 ? now - stats.lastUpdate : 0;
      stats.intervals.push(intervalMs);
      if (stats.intervals.length > 100) stats.intervals.shift();
      stats.lastUpdate = now;
      stats.updateCount++;
      stats.warningLogged = false;
      if (stats.firstUpdate === 0) stats.firstUpdate = now;
      this.symbolStats.set(internalSymbol, stats);
      
      // Translate v2 to v1 format and update price cache
      const safeData = translateV2ToV1(update);
      const lastPrice = parseFloat(safeData.c[0]);
      const bid = parseFloat(safeData.b[0]);
      const ask = parseFloat(safeData.a[0]);
      
      if (isNaN(lastPrice) || lastPrice <= 0) {
        console.warn(`[8.9.0-B][WS_TICK] Invalid price for ${internalSymbol}: ${lastPrice}`);
        continue;
      }
      
      // Log tick for debugging (first tick only for each symbol)
      if (!this.firstTickReceived.has(internalSymbol)) {
        this.firstTickReceived.add(internalSymbol);
        console.log(`[8.9.0-B][WS_TICK_V2] FIRST: ${internalSymbol} price=${lastPrice} bid=${bid} ask=${ask}`);
      }
      
      console.log(`[8.9.0-B][WS_TICK] ${internalSymbol} price=${lastPrice}`);
      
      // B78.1: emit priceTick event instead of direct call to livePricingAdapter.
      // live-pricing-adapter subscribes via .on('priceTick', ...) at module-load.
      this.emit('priceTick', { symbol: internalSymbol, price: lastPrice, source: 'kraken_ws', producer: 'kraken_ws_ticker' } as PriceTickEvent);
      this.priceTickCount++;

      // priceCache is updated by live-pricing-adapter's priceTick handler (cycle-broken)
      
      // Update tick frequency tracking
      this.updateTickFrequency(internalSymbol, intervalMs);
      
      // Log for price tick health
      const logEntry: PriceTickLog = {
        symbol: internalSymbol,
        price: lastPrice,
        bid,
        ask,
        timestamp: new Date().toISOString(),
        receivedAt: now,
        intervalMs
      };
      
      this.priceTickLogs.push(logEntry);
      if (this.priceTickLogs.length > this.MAX_PRICE_LOGS) {
        this.priceTickLogs.shift();
      }
      
      // Broadcast to connected clients (throttled)
      const lastBroadcast = this.lastBroadcastTime.get(internalSymbol) || 0;
      if (now - lastBroadcast >= this.BROADCAST_THROTTLE_MS) {
        this.lastBroadcastTime.set(internalSymbol, now);
        contextBridge.broadcast({
          type: 'price_updated',
          payload: {
            symbol: internalSymbol,
            price: lastPrice,
            bid,
            ask,
            source: 'ws_v2',
            timestamp: new Date().toISOString()
          }
        }).catch(err => console.error(`[${this.MODULE_NAME}] Broadcast error:`, err));
      }
    }
  }

  /**
   * 8.9.4-Patch: Stateful mini-book handler for stable mid-price computation
   * v2 format: { channel: "book", type: "update"|"snapshot", data: [{symbol, bids, asks, ...}] }
   * 
   * This replaces stateless "last message" logic with a stateful in-memory mini-book that:
   * - Tracks top-of-book bids/asks per symbol
   * - Properly handles delta updates (qty=0 means deletion)
   * - Ensures stable mid-price computation without "flash-crash" artifacts
   */
  /**
   * #507 remainder: absorb per-pair precision so the book checksum can be computed in Kraken's
   * own string format. Snapshot carries `data.pairs[]`; updates carry the same shape.
   */
  private handleInstrumentMessage(message: any): void {
    const pairs = message?.data?.pairs;
    if (!Array.isArray(pairs)) return;
    let learned = 0;
    for (const pr of pairs) {
      const sym = this.mapKrakenPairToInternalSymbol(pr?.symbol);
      const price = Number(pr?.price_precision);
      const qty = Number(pr?.qty_precision);
      if (!sym || !Number.isInteger(price) || !Number.isInteger(qty)) continue;
      this.symbolPrecision.set(sym, { price, qty });
      learned++;
    }
    this.instrumentSnapshotAt = Date.now();
    console.log(`[#507][INSTRUMENT] absorbed precision for ${learned} pairs (type=${message.type})`);
  }

  private handleV2BookUpdate(message: any): void {
    const updates = message.data || [];
    
    for (const update of updates) {
      const krakenPair = update.symbol;
      const internalSymbol = this.mapKrakenPairToInternalSymbol(krakenPair);
      
      if (!internalSymbol) {
        continue;
      }
      
      // P19-B8.5 (SWITCH-ON fix, found live 2026-07-15): the 8.9.4-Patch "sequence
      // validation" block that lived here was DELETED — Kraken v2's book `checksum`
      // is a CRC32 of the current top-10 book STATE (docs: book channel, "checksum"),
      // NOT a monotonic sequence number. Treating it as one deleted the ENTIRE
      // mini-book whenever the next CRC happened to be <= the previous (~half of all
      // updates — measured live: 32,521 book deletions in one log window; TAO/USD
      // wiped 13,839 times in 23,939 updates), and the delete never resubscribed
      // ("v2 will resend snapshot on reconnect" — no reconnect happens), so books
      // rebuilt from deltas alone and the #295 depth gate saw no_book/thin_book on
      // almost every open attempt. Latent since 8.9.4 because nothing consumed
      // getBookForFill until the depth gate went live at the B8.5 switch-on.
      // REAL book-integrity validation = compute the CRC32 per Kraken's documented
      // algorithm and resubscribe on mismatch — a named Phase-20 hardening item
      // (RUNNING_ISSUES #507), not a hot-path improvisation.

      // B-BOOK-TRUNCATE-HOTFIX (#507, 2026-08-22) -- THE PHANTOM-BID DEFECT.
      // Kraken v2 book contract (docs: Book (Level 2) + the v2 checksum guide), verbatim:
      //   'After each update, truncate your book to the subscribed depth -- you will not
      //    receive qty: 0 for levels that fall out of scope. If you are subscribed with
      //    depth: 10 and an insert ... results in you having 11 bids, you must remove the
      //    11th worst bid.'
      // This handler NEVER truncated. Every level that fell out of the top-10 was orphaned in
      // the Map forever, and a SNAPSHOT was merged into the stale Map like a delta instead of
      // replacing it. Over hours the book grew a tail of dead levels, and a dead BID from an
      // earlier, higher price sat ABOVE the current real ask -- a crossed book. MEASURED LIVE
      // 2026-08-22: ONDO/USD bid=0.40349 ask=0.36411 (+10.8%), XRP/USD +24.9%, ZEC/USD +33%,
      // a dozen pairs. The paper CLOSE fill walks the bid side, so a stop-triggered SELL filled
      // against a bid that did not exist: ONDO stop_hit exited at 0.4033 against a 0.3696 stop,
      // +8.8% above entry. 26 such exits lifetime = +$187.78 of phantom profit; the real crypto
      // book is -$6.08. The mid (bestBid+bestAsk)/2 was poisoned the same way.
      // Root: the 8.9.4-Patch handler predates anything consuming the book; #507 (07-15) deleted
      // a bogus sequence check and named real validation as unbuilt. Truncation is the half of
      // the contract nobody had read.
      const isSnapshot = message.type === 'snapshot';
      if (isSnapshot || !this.orderBooks.has(internalSymbol)) {
        // A snapshot is the AUTHORITATIVE state: replace, never merge.
        this.orderBooks.set(internalSymbol, { bids: new Map(), asks: new Map() });
        this.bookRaw.set(internalSymbol, { bids: new Map(), asks: new Map() });
      }
      const book = this.orderBooks.get(internalSymbol)!;
      const raw = this.bookRaw.get(internalSymbol)!;
      const depth = this.bookDepth.get(internalSymbol) ?? 10;

      // Apply levels. qty=0 deletes; otherwise set. Raw strings kept for the checksum.
      for (const side of ['bids', 'asks'] as const) {
        const items = update[side];
        if (!items) continue;
        for (const item of items) {
          const priceStr = String(item.price), qtyStr = String(item.qty);
          const price = parseFloat(priceStr), qty = parseFloat(qtyStr);
          if (qty === 0) { book[side].delete(price); raw[side].delete(price); }
          else { book[side].set(price, qty); raw[side].set(price, [priceStr, qtyStr]); }
        }
      }

      // TRUNCATE to the subscribed depth -- the documented, mandatory step this handler lacked.
      this.truncateBook(book, raw, depth);

      // CHECKSUM -- ARMED AND ACTING WHERE PRECISION IS KNOWN. ⚠️ THIS HEADER SAID "OBSERVE ONLY,
      // NEVER ACT" AND "this branch only counts" LONG AFTER THAT STOPPED BEING TRUE -- the mismatch
      // arm below resubscribes and `continue`s. Corrected 2026-08-24 (Langston, at the
      // B-MBIM-SWITCH-ON deploy gate): a comment describing code that is not there, on the trading
      // path, is worse than no comment. The history below is why the observe-only era existed.
      // The first version of this hotfix verified the checksum and resubscribed on mismatch. It
      // could never match: Kraken sends price/qty as JSON NUMBERS, JSON.parse drops the trailing
      // zeros, so String(qty) gives "2993" where Kraken's CRC input is "299300000". Measured
      // against wss://ws.kraken.com/v2 by Langston: 40/40 messages carried a checksum, 0/40
      // matched as written; 40/40 matched once formatted at the instrument's precision. Deployed,
      // that would have resubscribed on EVERY update for EVERY pair -- a book outage and a
      // subscribe storm in place of phantom fills. The unit suite could not see it because it
      // fed strings with the exact formatting the wire does not send.
      // Correct verification needs per-symbol price_precision/qty_precision from the v2
      // `instrument` channel (not yet subscribed) and must FAIL OPEN on unknown precision. That
      // was the follow-up (#507 remainder) and IT HAS SINCE LANDED: `symbolPrecision` is populated
      // from the v2 `instrument` channel, so verification is now ARMED -- it FAILS OPEN on an
      // unmapped symbol (skip, never resubscribe) and ACTS on a genuine mismatch.
      // ⛔ CONSEQUENCE THAT MUST NOT BE LOST: the `continue` in the mismatch arm sits ABOVE the
      // crossed-book detector, so a resubscribing update never reaches that counter. Once this is
      // deployed, `crossedDetections` is NOT the same measurement it was before -- do not read a
      // zero across that boundary as continuity (Langston, 2026-08-24).
      const bump = (m: Map<string, number>) => m.set(internalSymbol, (m.get(internalSymbol) ?? 0) + 1);
      bump(this.bookUpdatesApplied);
      // #507 remainder: verification is ARMED, but ONLY where precision is known. Langston's
      // condition, and it is the difference between a fix and a subscribe storm: an unmapped
      // symbol must SKIP verification, never resubscribe. Fail OPEN.
      if (typeof update.checksum === 'number') {
        const prec = this.symbolPrecision.get(internalSymbol);
        if (!prec) {
          bump(this.bookChecksumSkippedNoPrecision);
        } else {
          bump(this.bookChecksumAttempts);
          const ours = this.computeBookChecksum(raw, prec);
          if (ours === update.checksum) {
            bump(this.bookChecksumMatches);
          } else {
            bump(this.bookChecksumMismatches);
            const n = this.bookChecksumMismatches.get(internalSymbol) ?? 0;
            console.warn(`[#507][BOOK_CHECKSUM_MISMATCH] ${internalSymbol} ours=${ours} theirs=${update.checksum} depth=${depth} count=${n} — book desynced, resubscribing for a fresh snapshot`);
            void this.softResubscribe(internalSymbol);
            continue;
          }
        }
      }
      // CROSSED-BOOK DETECTOR -- the property the fix exists to guarantee, counted rather than
      // grepped for. Langston at the gate: an absence needs an instrument and a denominator.
      // MEASURED pre-fix on the live venue by replicating the old handler: 8,358 of 26,093
      // book states crossed (32.03%) across 6 of 8 pairs including BTC/USD. With truncation +
      // snapshot-replace: 0 of 31,059. Post-deploy this counter must stay at 0.
      if (book.bids.size > 0 && book.asks.size > 0
          && Math.max(...book.bids.keys()) >= Math.min(...book.asks.keys())) {
        bump(this.bookCrossedDetections);
      }

      // P19-B4b.1: stamp book-specific freshness on every applied delta (before the
      // BBO-validity continue below, so a transiently one-sided book still records its age).
      this.bookUpdatedAt.set(internalSymbol, Date.now());

      // 8.9.4-Patch: Compute best bid/ask from stateful mini-book
      const bestBid = book.bids.size > 0 ? Math.max(...book.bids.keys()) : 0;
      const bestAsk = book.asks.size > 0 ? Math.min(...book.asks.keys()) : 0;
      
      if (bestBid <= 0 || bestAsk <= 0) {
        continue;
      }
      
      // 8.9.4-Patch: Calculate stable midpoint from mini-book BBO
      const midpoint = (bestBid + bestAsk) / 2;
      
      const now = Date.now();
      
      // Update Sentinel Health stats
      const stats = this.symbolStats.get(internalSymbol) || {
        lastUpdate: 0,
        updateCount: 0,
        intervals: [],
        firstUpdate: now,
        warningLogged: false
      };
      
      stats.lastUpdate = now;
      stats.warningLogged = false;
      this.symbolStats.set(internalSymbol, stats);
      
      // Log first book update for each symbol
      if (!this.firstTickReceived.has(internalSymbol + '_book')) {
        this.firstTickReceived.add(internalSymbol + '_book');
        console.log(`[8.9.4-P][WS_BOOK_TICK] FIRST: ${internalSymbol} bid=${bestBid} ask=${bestAsk} mid=${midpoint.toFixed(6)}`);
      }
      
      // B78.1: emit priceTick event instead of direct call to livePricingAdapter.
      // ★ #741: THE CONTAMINATED PATH. This midpoint comes from the mini-book whose truncation
      // defect let ghost bids sit above the real ask, and it is emitted with the SAME `source`
      // as a ticker print — which is exactly why the exit monitor could not tell them apart.
      this.emit('priceTick', { symbol: internalSymbol, price: midpoint, source: 'kraken_ws', producer: 'kraken_ws_book_mid' } as PriceTickEvent);
      this.priceTickCount++;
      
      // Broadcast to connected clients (throttled - using separate throttle key for book updates)
      const lastBroadcast = this.lastBroadcastTime.get(internalSymbol) || 0;
      if (now - lastBroadcast >= this.BROADCAST_THROTTLE_MS) {
        this.lastBroadcastTime.set(internalSymbol, now);
        contextBridge.broadcast({
          type: 'price_updated',
          payload: {
            symbol: internalSymbol,
            price: midpoint,
            bid: bestBid,
            ask: bestAsk,
            source: 'ws_book',
            timestamp: new Date().toISOString()
          }
        }).catch(err => console.error(`[${this.MODULE_NAME}] Broadcast error:`, err));
      }
    }
  }

  private handleTickerUpdate(message: any[]): void {
    const [channelId, rawTickerData, channelName, pair] = message;
    
    if (channelName !== 'ticker' || !rawTickerData) return;
    
    try {
      // 8.8.9: Normalize tickerData - handle both object and array forms
      // Kraken sometimes batches updates as arrays
      const tickerData = Array.isArray(rawTickerData) ? rawTickerData[0] : rawTickerData;
      if (!tickerData || typeof tickerData !== 'object') {
        console.warn(`[8.8.9][WS_TICK] Invalid tickerData format for ${pair}:`, typeof tickerData);
        return;
      }
      
      const ticker = tickerData as KrakenTickerPayload;
      
      const lastPrice = parseFloat(ticker.c[0]);
      const bid = parseFloat(ticker.b[0]);
      const ask = parseFloat(ticker.a[0]);
      
      // Phase 8.8.3-I7-WS-C (C1): Generate trace ID for this tick
      const traceId = priceTraceService.generateTraceId(pair.replace('/', ''));
      
      // Phase 8.8.3-I7-WS-C (C2 Stage 1): Log incoming WebSocket tick
      priceTraceService.recordStage(traceId, 1, 'INCOMING_WS_TICK', {
        kraken_symbol: pair,
        ws_price: lastPrice
      });
      
      // Phase 8.8.4: Use mapKrakenPairToInternalSymbol for proper symbol normalization
      // This ensures incoming ticks are keyed by the same internal symbol used in DB
      const internalSymbol = this.mapKrakenPairToInternalSymbol(pair);

      if (!internalSymbol) {
        console.warn(`[${this.MODULE_NAME}][TICKER][UNMAPPED_PAIR]`, { pair });
        // Phase 8.8.3-I7-WS-A: Track unmapped tick events for gap reporting
        const existing = this.unmappedTicks.get(pair) || { count: 0, lastSeen: 0 };
        this.unmappedTicks.set(pair, { count: existing.count + 1, lastSeen: Date.now() });
        console.log(`[I7-WS-A][UNMAPPED_TICK] kraken_ws_pair=${pair} count=${existing.count + 1}`);
        return;
      }
      
      // Phase 8.8.3-I7-WS-C (C2 Stage 2): Log internal symbol mapping
      priceTraceService.recordStage(traceId, 2, 'INTERNAL_MAP', {
        internal_symbol: internalSymbol
      });
      
      const now = Date.now();
      
      if (isNaN(lastPrice) || lastPrice <= 0) {
        console.warn(`[${this.MODULE_NAME}] Invalid price for ${internalSymbol}: ${ticker.c[0]}`);
        return;
      }
      
      // 8.8.9: Update Sentinel Health - get or create stats
      const stats = this.symbolStats.get(internalSymbol) || {
        lastUpdate: 0,
        updateCount: 0,
        intervals: [],
        firstUpdate: now, // Phase 8.8.3-I4: Track first tick time
        warningLogged: false
      };
      
      const intervalMs = stats.lastUpdate > 0 ? now - stats.lastUpdate : 0;
      stats.intervals.push(intervalMs);
      if (stats.intervals.length > 100) stats.intervals.shift();
      stats.lastUpdate = now;
      stats.updateCount++;
      stats.warningLogged = false; // 8.8.9: Reset warning flag on each tick to prevent false Sentinel resets
      // Phase 8.8.3-I4: Ensure firstUpdate is set on first tick
      if (stats.firstUpdate === 0) stats.firstUpdate = now;
      this.symbolStats.set(internalSymbol, stats);
      
      // 8.8.9: Log tick receipt for validation
      console.log(`[8.8.9][WS_TICK] ${internalSymbol} price=${lastPrice}`);
      
      const logEntry: PriceTickLog = {
        symbol: internalSymbol,
        price: lastPrice,
        bid,
        ask,
        timestamp: new Date().toISOString(),
        receivedAt: now,
        intervalMs
      };
      
      this.priceTickLogs.push(logEntry);
      if (this.priceTickLogs.length > this.MAX_PRICE_LOGS) {
        this.priceTickLogs.shift();
      }
      
      // Phase 8.8.3-I5: Diagnostic logging for tick arrival audit
      console.log(`[8.8.3-I5][TICK_ARRIVE] symbol=${internalSymbol} price=${lastPrice} timestamp=${now}`);
      
      // Phase 8.8.3-I8C: TICK-ACK CONFIRMATION - log FIRST tick only to prove subscription succeeded
      if (!this.firstTickReceived.has(internalSymbol)) {
        console.log(`[I8C-WS-TICK][ACK] symbol=${internalSymbol} price=${lastPrice} first_tick=true subscription_confirmed=true`);
      }
      
      // Phase 8.8.3-I7-WS-G (G1): Update tick frequency data
      this.updateTickFrequency(internalSymbol, intervalMs);
      
      // Phase 8.8.3-I7-WS-A (A3): Log first tick received for each pair (only once)
      if (!this.firstTickReceived.has(internalSymbol)) {
        this.firstTickReceived.add(internalSymbol);
        console.log(`[I7-WS-A][FIRST_TICK] kraken_ws_pair=${pair} internal_symbol=${internalSymbol} price=${lastPrice}`);
      }
      
      // Phase 8.8.4: live-pricing-adapter cache update + Stage-3→Stage-4 broadcast handled
      // by live-pricing-adapter's priceTick subscriber (post-B78.1 cycle break).
      // Phase 8.8.3-I7-WS-C: traceId passed in event payload for Stage 3 logging.
      // #742: producer #3 is UNREACHABLE — handleTickerUpdate has no caller and handleMessage
      // routes only v2 by `message.channel`. Stamped anyway so a later reader sees three of
      // three producers labelled, not two-of-three plus a suspected missed stamp.
      this.emit('priceTick', { symbol: internalSymbol, price: lastPrice, source: 'kraken_ws', producer: 'kraken_ws_ticker_v1', traceId } as PriceTickEvent);
      this.priceTickCount++;
      
      // Phase 8.8.4-IA-PRICE-CACHE: Update centralized price cache for active trades
      priceCache.updateFromWebSocket(internalSymbol, lastPrice);
      
      // Phase 8.8.3-I6: Diagnostic logging to confirm WS -> cache pipeline
      console.log(`[I6][WS_CACHE_UPDATE] symbol=${internalSymbol} price=${lastPrice} timestamp=${new Date().toISOString()}`);
      
      // Phase 8.8.3-I7-WS-D: REMOVED duplicate throttledBroadcast call
      // Broadcasts are now handled inside LivePricingAdapter.updateCache() to ensure 1:1 parity
      // OLD: this.throttledBroadcast(internalSymbol, lastPrice, bid, ask, traceId);
      
    } catch (error) {
      console.error(`[${this.MODULE_NAME}] Error processing ticker update:`, error);
    }
  }

  /**
   * Phase 8.8.3-I6-FIX: Throttled broadcast with correct trading mode
   * Gets mode from LivePricingAdapter to ensure paper/live consistency
   * Phase 8.8.3-I7-WS-C: Added traceId parameter for pipeline tracing
   */
  private async throttledBroadcast(symbol: string, price: number, bid: number, ask: number, traceId?: string): Promise<void> {
    const now = Date.now();
    const lastBroadcast = this.lastBroadcastTime.get(symbol) || 0;
    
    if (now - lastBroadcast < this.BROADCAST_THROTTLE_MS) {
      return;
    }
    
    this.lastBroadcastTime.set(symbol, now);
    
    // Phase 8.8.3-I6-FIX (revised B78.1): resolve trading mode via injected getter
    // (cycle-broken; was direct livePricingAdapter.getTradingMode() call).
    const currentMode = this.resolveTradingMode();
    
    try {
      await contextBridge.broadcast({
        type: 'price_updated',
        payload: {
          mode: currentMode,
          symbol,
          price,
          bid,
          ask,
          timestamp: new Date().toISOString(),
          source: 'kraken_ws',
          traceId: traceId || null // Phase 8.8.3-I7-WS-C: Include trace ID in broadcast
        }
      });
      
      // Phase 8.8.3-I7-WS-C (C2 Stage 4): Log broadcast event
      if (traceId) {
        priceTraceService.recordStage(traceId, 4, 'BROADCAST', {
          internal_symbol: symbol,
          price
        });
      }
      
      // Phase 8.8.3-I6-FIX: Diagnostic logging with mode
      console.log(`[8.8.3-I6-FIX][KrakenWS] Broadcast: ${symbol} = $${price} [mode=${currentMode}]`);
    } catch (error) {
      console.error(`[${this.MODULE_NAME}] Broadcast error:`, error);
    }
  }

  private handleClose(code: number, reason: string): void {
    console.log(`[${this.MODULE_NAME}] WebSocket closed: code=${code}, reason=${reason}`);
    this.isConnected = false;
    this.isConnecting = false;
    this.cleanup();
    
    if (code !== 1000) {
      this.scheduleReconnect();
    }
    
    contextBridge.broadcast({
      type: 'ws_price_engine',
      payload: {
        status: 'disconnected',
        code,
        reason,
        timestamp: new Date().toISOString()
      }
    }).catch(err => console.error(`[${this.MODULE_NAME}] Broadcast error:`, err));
  }

  private handleError(error: Error): void {
    console.error(`[${this.MODULE_NAME}] WebSocket error:`, error.message);
  }

  private handlePong(): void {
    this.lastPongTime = Date.now();
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (!this.ws || !this.isConnected) return;
      
      const now = Date.now();
      if (now - this.lastPongTime > this.HEARTBEAT_INTERVAL_MS * 2) {
        console.warn(`[${this.MODULE_NAME}] No pong received, reconnecting...`);
        this.ws.close(4000, 'Heartbeat timeout');
        return;
      }
      
      try {
        this.ws.ping();
      } catch (error) {
        console.error(`[${this.MODULE_NAME}] Ping error:`, error);
      }
    }, this.HEARTBEAT_INTERVAL_MS);
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      console.error(`[${this.MODULE_NAME}] Max reconnect attempts reached`);
      return;
    }
    
    const delay = Math.min(
      this.BASE_RECONNECT_DELAY_MS * Math.pow(2, this.reconnectAttempts),
      this.MAX_RECONNECT_DELAY_MS
    );
    
    console.log(`[${this.MODULE_NAME}] Scheduling reconnect in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);
    
    // Phase 8.8.3-I8C: Mark as reconnecting so handleOpen knows to resubscribe
    this.i8cIsReconnecting = true;
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }

  subscribeToSymbols(symbols: string[]): void {
    // I7-WS-SUBSCRIBE: Diagnostic logging for subscription call tracing
    console.log("[I7-WS-SUBSCRIBE] subscribe() called with pairs:", symbols);
    
    // Phase 8.8.3-I6-FIX: Enhanced diagnostic logging for subscription audit
    console.log(`[8.8.3-I6-FIX][WS_SUB_REQUEST] internalSymbols=${JSON.stringify(symbols)}`);
    
    const krakenSymbols = symbols
      .map(s => this.normalToKrakenSymbol(s))
      .filter(s => s !== null) as string[];
    
    // Phase 8.8.3-I6-FIX: Log symbol format mapping
    console.log(`[8.8.3-I6-FIX][WS_SUB_MAPPED] krakenSymbols=${JSON.stringify(krakenSymbols)} (mapped from ${symbols.length} internal symbols)`);
    
    // 8.8.9 + Phase 8.8.3-I7-WS-A (A1): Log subscription request with resolver-normalized internal symbol
    for (let i = 0; i < symbols.length; i++) {
      const internalSymbol = symbols[i];
      const krakenWsPair = krakenSymbols[i] || 'unmapped';
      const normalizedInternal = normalizeToInternalSymbol(internalSymbol);
      // 8.8.9: Log subscription request with Kraken symbol mapping
      console.log(`[8.8.9][WS_SUB] Requesting: ${krakenWsPair} (Internal: ${normalizedInternal})`);
      console.log(`[I7-WS-A][SUB_REQ] kraken_ws_pair=${krakenWsPair} internal_symbol=${normalizedInternal}`);
      
      // Track subscription request for diagnostic endpoint
      this.subscriptionRequests.set(normalizedInternal, {
        krakenWsPair,
        internalSymbol: normalizedInternal,
        timestamp: Date.now()
      });
    }
    
    if (krakenSymbols.length === 0) {
      console.warn(`[8.8.3-I6-FIX][WS_SUB_EMPTY] No valid Kraken symbols after mapping - check symbol format`);
      return;
    }
    
    if (!this.isConnected) {
      console.log("[I7-WS-SUBSCRIBE] ERROR: ws not connected, isConnected=", this.isConnected, "ws.readyState=", this.ws?.readyState);
      symbols.forEach(s => this.pendingSubscriptions.add(s));
      console.log(`[8.8.3-I6-FIX][WS_SUB_QUEUED] queued=${symbols.length} (WS not connected)`);
      console.log(`[${this.MODULE_NAME}] Queued ${symbols.length} symbols for subscription (not connected)`);
      return;
    }
    
    // 8.9.4: Subscribe to BOTH ticker and book channels
    // - ticker: provides trade-based updates (fast for liquid pairs)
    // - book: provides BBO updates (continuous for illiquid pairs)
    const tickerSubscribe = {
      method: 'subscribe',
      params: {
        channel: 'ticker',
        symbol: krakenSymbols,
        snapshot: true
      }
    };
    
    // #507 remainder: one subscription, no symbol list, covers every pair. Sent alongside the
    // existing ticker/book subscribes on the SAME socket.
    const instrumentSubscribe = {
      method: 'subscribe',
      params: { channel: 'instrument', snapshot: true }
    };

    const bookSubscribe = {
      method: 'subscribe',
      params: {
        channel: 'book',
        symbol: krakenSymbols,
        depth: 10,  // Top 10 levels for redundancy
        snapshot: true
      }
    };
    // #507: subscribed depth is recorded from the subscribe ACK (granted depth), not here.
    
    // I7-WS-SUBSCRIBE: Log exact payloads being sent
    console.log("[I7-WS-SEND][ticker]", JSON.stringify(tickerSubscribe));
    console.log("[I7-WS-SEND][book]", JSON.stringify(bookSubscribe));
    
    try {
      // 8.9.4: Send both ticker and book subscriptions
      this.ws?.send(JSON.stringify(tickerSubscribe));
      this.ws?.send(JSON.stringify(bookSubscribe));
      // #507 remainder: precision feed, same socket. One snapshot then silence.
      this.ws?.send(JSON.stringify(instrumentSubscribe));
      console.log(`[${this.MODULE_NAME}] Subscribing to ${krakenSymbols.length} symbols (ticker+book): ${krakenSymbols.slice(0, 5).join(', ')}${krakenSymbols.length > 5 ? '...' : ''}`);
      
      // Phase 8.8.3-I6-FIX: Enhanced diagnostic log after subscription update
      console.log('[8.8.3-I6-FIX][WS_SUB_SENT]', {
        sentSymbols: krakenSymbols,
        channels: ['ticker', 'book'],
        currentSubscribed: Array.from(this.subscribedSymbols),
        pendingCount: this.pendingSubscriptions.size,
        totalAfterSend: this.subscribedSymbols.size + krakenSymbols.length,
      });
    } catch (error) {
      console.error(`[8.8.3-I6-FIX][WS_SUB_ERROR]`, error);
      console.error(`[${this.MODULE_NAME}] Subscribe error:`, error);
    }
  }

  unsubscribeFromSymbols(symbols: string[]): void {
    // Phase 8.8.3-I6-FIX: Enhanced diagnostic logging for unsubscription audit
    console.log(`[8.8.3-I6-FIX][WS_UNSUB_REQUEST] internalSymbols=${JSON.stringify(symbols)}`);
    
    const krakenSymbols = symbols
      .map(s => this.normalToKrakenSymbol(s))
      .filter(s => s !== null) as string[];
    
    if (krakenSymbols.length === 0) {
      console.warn(`[8.8.3-I6-FIX][WS_UNSUB_EMPTY] No valid Kraken symbols after mapping`);
      return;
    }
    
    if (!this.isConnected) {
      console.log(`[8.8.3-I6-FIX][WS_UNSUB_SKIP] Not connected - cleaning up local state only`);
      symbols.forEach(s => {
        this.subscribedSymbols.delete(s);
        this.pendingSubscriptions.delete(s);
      });
      return;
    }
    
    // 8.9.0-B: v2 unsubscribe format
    const unsubscribeMessage = {
      method: 'unsubscribe',
      params: {
        channel: 'ticker',
        symbol: krakenSymbols
      }
    };
    
    try {
      this.ws?.send(JSON.stringify(unsubscribeMessage));
      symbols.forEach(s => {
        this.subscribedSymbols.delete(s);
        this.pendingSubscriptions.delete(s);
      });
      // Phase 8.8.3-I6-FIX: Enhanced diagnostic log after unsubscription
      console.log('[8.8.3-I6-FIX][WS_UNSUB_SENT]', {
        unsubscribedSymbols: krakenSymbols,
        remainingSubscribed: Array.from(this.subscribedSymbols),
        remainingCount: this.subscribedSymbols.size,
      });
      console.log(`[${this.MODULE_NAME}] Unsubscribed from ${krakenSymbols.length} symbols`);
    } catch (error) {
      console.error(`[8.8.3-I6-FIX][WS_UNSUB_ERROR]`, error);
      console.error(`[${this.MODULE_NAME}] Unsubscribe error:`, error);
    }
  }

  private normalToKrakenSymbol(symbol: string): string | null {
    // I7-MAP-FIX: PRIORITY 1 - Use new resolver (static map + dynamic fallback)
    const wsPair = toKrakenWS(symbol);
    if (wsPair) {
      console.log(`[I7-MAP-FIX][MAPPED] internal=${symbol} ws=${wsPair}`);
      this.unrecognizedSymbols.delete(symbol);
      return wsPair;
    }
    
    // I7-MAP-FIX: PRIORITY 2 - Use metadata service (handles pairId like XXRPZUSD)
    const canonical = krakenPairMetadataService.getCanonicalKrakenSymbol(symbol);
    if (canonical) {
      console.log(`[I7-MAP-FIX][METADATA] internal=${symbol} ws=${canonical}`);
      this.unrecognizedSymbols.delete(symbol);
      return canonical;
    }
    
    // I7-MAP-FIX: PRIORITY 3 - Convert internal DB format to WS format as last resort
    const wsFormat = this.convertInternalToWsFormat(symbol);
    if (wsFormat) {
      console.log(`[I7-MAP-FIX][FALLBACK_CONVERT] internal=${symbol} ws=${wsFormat}`);
      this.unrecognizedSymbols.delete(symbol);
      return wsFormat;
    }
    
    // I7-MAP-FIX: Symbol is completely unmappable - log and skip
    console.warn(`[I7-MAP-FIX][SUBSCRIBE_SKIPPED] symbol=${symbol} reason="no valid mapping found"`);
    this.unrecognizedSymbols.add(symbol);
    
    return null;
  }

  /**
   * Phase 8.8.4: Convert Kraken internal symbol format to WebSocket format
   * Examples:
   *   XXRPZUSD -> XRP/USD
   *   XXRPZEUR -> XRP/EUR
   *   ADAUSD -> ADA/USD
   *   TRXUSD -> TRX/USD
   *   SUIUSD -> SUI/USD
   *   LDOUSD -> LDO/USD
   *   STXUSD -> STX/USD
   */
  private convertInternalToWsFormat(symbol: string): string | null {
    if (!symbol || symbol.includes('/')) return null;
    
    // Known quote currencies at the end of Kraken symbols
    const quoteCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'JPY', 'CHF', 'AUD', 'USDC', 'USDT'];
    
    for (const quote of quoteCurrencies) {
      if (symbol.endsWith(quote) || symbol.endsWith(`Z${quote}`)) {
        let base = symbol.endsWith(`Z${quote}`) 
          ? symbol.slice(0, -quote.length - 1)  // Remove ZXXX
          : symbol.slice(0, -quote.length);      // Remove XXX
        
        // Handle Kraken's X-prefix convention (XXRP = XRP, XXBT = XBT/BTC)
        if (base.startsWith('X') && base.length > 3) {
          base = base.slice(1);
        }
        
        // Handle Z-prefix quote currencies (ZUSD, ZEUR, etc.)
        const cleanQuote = quote;
        
        // Construct WS format
        const wsFormat = `${base}/${cleanQuote}`;
        return wsFormat;
      }
    }
    
    return null;
  }

  /**
   * I7-MAP-FIX: Map incoming Kraken WS pair to internal symbol
   * Uses the enhanced resolver as PRIMARY source of truth.
   */
  private mapKrakenPairToInternalSymbol(krakenPair: string): string | null {
    // I7-MAP-FIX: PRIORITY 1 - Use new resolver's mapKrakenPairToInternal
    const fromResolver = mapKrakenPairToInternal(krakenPair);
    if (fromResolver) {
      return fromResolver;
    }

    // I7-MAP-FIX: PRIORITY 2 - Try static map by WS pair
    const i7Mapping = resolveByKrakenWsPair(krakenPair);
    if (i7Mapping) {
      return i7Mapping.internalSymbol;
    }

    // I7-MAP-FIX: PRIORITY 3 - Try metadata service pairId (DB format like XXRPZUSD)
    const pairId = krakenPairMetadataService.getPairId(krakenPair);
    if (pairId) {
      const normalized = normalizeToInternalSymbol(pairId);
      return normalized;
    }

    // I7-MAP-FIX: PRIORITY 4 - Try metadata service altname format (like XRPUSD)
    const internalFromMetadata = krakenPairMetadataService.getInternalSymbol(krakenPair);
    if (internalFromMetadata) {
      const normalized = normalizeToInternalSymbol(internalFromMetadata);
      return normalized;
    }

    // I7-MAP-FIX: PRIORITY 5 - Legacy fallback for safety
    const legacy = this.krakenToNormalSymbol(krakenPair);
    if (legacy) {
      return legacy;
    }

    // I7-MAP-FIX: Symbol is completely unmappable - log warning
    console.warn(`[I7-MAP-FIX][UNMAPPED_TICK] kraken_ws_pair=${krakenPair} reason="no valid reverse mapping"`);
    this.unrecognizedSymbols.add(krakenPair);
    
    return null;
  }

  /**
   * Legacy method for basic Kraken pair to normal symbol conversion
   * Only used as fallback when metadata service fails
   */
  private krakenToNormalSymbol(krakenPair: string): string {
    const pair = krakenPair.replace('XBT', 'BTC');
    
    if (!pair.includes('/')) {
      if (pair.endsWith('USD')) {
        const base = pair.slice(0, -3);
        return `${base}/USD`;
      }
      if (pair.endsWith('EUR')) {
        const base = pair.slice(0, -3);
        return `${base}/EUR`;
      }
    }
    
    return pair;
  }

  isHealthy(): boolean {
    if (!this.isConnected) return false;
    
    const now = Date.now();
    const timeSinceLastPong = now - this.lastPongTime;
    
    return timeSinceLastPong < this.HEARTBEAT_INTERVAL_MS * 2;
  }

  getSubscribedSymbols(): string[] {
    return Array.from(this.subscribedSymbols);
  }

  getStaleSymbols(): string[] {
    const now = Date.now();
    const stale: string[] = [];
    
    this.symbolStats.forEach((stats, symbol) => {
      if (now - stats.lastUpdate > this.STALE_THRESHOLD_MS) {
        stale.push(symbol);
      }
    });
    
    return stale;
  }

  /**
   * Phase 8.8.3: Get symbols that failed normalization
   */
  getUnrecognizedSymbols(): string[] {
    return Array.from(this.unrecognizedSymbols);
  }

  /**
   * Phase 8.8.3: Clear unrecognized symbols (for fresh start)
   */
  clearUnrecognizedSymbols(): void {
    this.unrecognizedSymbols.clear();
  }

  getDiagnostics(): {
    wsConnected: boolean;
    subscribedSymbols: string[];
    unrecognizedSymbols: string[];
    lastUpdateBySymbol: Record<string, string>;
    averageIntervalMs: number;
    maxIntervalMs: number;
    minIntervalMs: number;
    staleSymbols: string[];
    cacheSize: number;
    cacheTTL: number;
    reconnectAttempts: number;
    lastPongAgeMs: number;
  } {
    const now = Date.now();
    const lastUpdateBySymbol: Record<string, string> = {};
    let allIntervals: number[] = [];
    
    this.symbolStats.forEach((stats, symbol) => {
      lastUpdateBySymbol[symbol] = new Date(stats.lastUpdate).toISOString();
      allIntervals = allIntervals.concat(stats.intervals.filter(i => i > 0));
    });
    
    const avgInterval = allIntervals.length > 0
      ? allIntervals.reduce((a, b) => a + b, 0) / allIntervals.length
      : 0;
    const maxInterval = allIntervals.length > 0 ? Math.max(...allIntervals) : 0;
    const minInterval = allIntervals.length > 0 ? Math.min(...allIntervals) : 0;
    
    return {
      wsConnected: this.isConnected,
      subscribedSymbols: Array.from(this.subscribedSymbols),
      unrecognizedSymbols: Array.from(this.unrecognizedSymbols),
      lastUpdateBySymbol,
      averageIntervalMs: Math.round(avgInterval),
      maxIntervalMs: maxInterval,
      minIntervalMs: minInterval,
      staleSymbols: this.getStaleSymbols(),
      cacheSize: this.symbolStats.size,
      cacheTTL: 1000,
      reconnectAttempts: this.reconnectAttempts,
      lastPongAgeMs: now - this.lastPongTime
    };
  }

  getPriceLogs(): PriceTickLog[] {
    return [...this.priceTickLogs];
  }

  /**
   * Phase 8.8.3-I4 B2: Get per-symbol timing stats for diagnostics
   */
  getPerSymbolTimingStats(): PerSymbolTimingStats[] {
    const now = Date.now();
    const stats: PerSymbolTimingStats[] = [];
    
    this.symbolStats.forEach((symbolStats, symbol) => {
      // Calculate ticks per minute from intervals
      const timeWindowMs = now - symbolStats.firstUpdate;
      const timeWindowMinutes = timeWindowMs / 60000;
      const ticksPerMinute = timeWindowMinutes > 0 ? symbolStats.updateCount / timeWindowMinutes : 0;
      
      stats.push({
        symbol,
        lastTickTime: new Date(symbolStats.lastUpdate).toISOString(),
        lastTickAgeMs: now - symbolStats.lastUpdate,
        ticksPerMinute: Math.round(ticksPerMinute * 10) / 10, // Round to 1 decimal
        source: 'kraken_ws',
        updateCount: symbolStats.updateCount
      });
    });
    
    return stats;
  }

  /**
   * Phase 8.8.3-I4 B4: Log price tick health for open positions
   * Call this with a list of open position symbols to log their tick health
   */
  logPriceTickHealth(openPositionSymbols: string[]): void {
    const now = Date.now();
    const healthEntries: Array<{
      symbol: string;
      lastTickAgeMs: number;
      ticksPerMinute: number;
      source: string;
    }> = [];
    
    for (const symbol of openPositionSymbols) {
      const stats = this.symbolStats.get(symbol);
      if (stats) {
        const timeWindowMs = now - stats.firstUpdate;
        const timeWindowMinutes = timeWindowMs / 60000;
        const ticksPerMinute = timeWindowMinutes > 0 ? stats.updateCount / timeWindowMinutes : 0;
        
        healthEntries.push({
          symbol,
          lastTickAgeMs: now - stats.lastUpdate,
          ticksPerMinute: Math.round(ticksPerMinute * 10) / 10,
          source: 'kraken_ws'
        });
      } else {
        // Symbol not in stats - no ticks received
        healthEntries.push({
          symbol,
          lastTickAgeMs: -1, // No data
          ticksPerMinute: 0,
          source: 'not_subscribed'
        });
      }
    }
    
    // Log aggregate stats
    const validEntries = healthEntries.filter(e => e.lastTickAgeMs >= 0);
    if (validEntries.length > 0) {
      const ages = validEntries.map(e => e.lastTickAgeMs);
      const minAge = Math.min(...ages);
      const maxAge = Math.max(...ages);
      const avgAge = ages.reduce((a, b) => a + b, 0) / ages.length;
      
      console.log(`[8.8.3-I4][PRICE_TICK_HEALTH] Open positions: ${openPositionSymbols.length}, ` +
        `min/avg/max lastTickAgeMs: ${minAge}/${Math.round(avgAge)}/${maxAge}`);
      
      // Log individual entries if any are stale (> 3 seconds)
      const staleEntries = validEntries.filter(e => e.lastTickAgeMs > 3000);
      if (staleEntries.length > 0) {
        console.warn(`[8.8.3-I4][PRICE_TICK_HEALTH][STALE] ${staleEntries.length} symbols with stale ticks:`, 
          staleEntries.map(e => `${e.symbol}=${e.lastTickAgeMs}ms`).join(', '));
      }
    } else if (openPositionSymbols.length > 0) {
      console.warn(`[8.8.3-I4][PRICE_TICK_HEALTH] No tick data for ${openPositionSymbols.length} open positions`);
    }
  }

  /**
   * Phase 8.8.3-I4 B4: Start periodic 60-second price tick health logging
   * @param openPositionSymbolsProvider Function that returns current open position symbols (sync or async)
   */
  startPriceTickHealthLogging(openPositionSymbolsProvider: () => string[] | Promise<string[]>): void {
    if (this.priceTickHealthInterval) {
      console.log('[8.8.3-I4][PRICE_TICK_HEALTH] Already running, skipping start');
      return;
    }
    
    this.openPositionSymbolsProvider = openPositionSymbolsProvider;
    console.log('[8.8.3-I4][PRICE_TICK_HEALTH] Starting 60-second periodic health logging');
    
    this.priceTickHealthInterval = setInterval(async () => {
      if (this.openPositionSymbolsProvider) {
        try {
          const symbols = await this.openPositionSymbolsProvider();
          if (symbols.length > 0) {
            this.logPriceTickHealth(symbols);
          } else {
            console.log('[8.8.3-I4][PRICE_TICK_HEALTH] No open positions to monitor');
          }
        } catch (error) {
          console.error('[8.8.3-I4][PRICE_TICK_HEALTH] Error getting open positions:', error);
        }
      }
    }, 60000); // 60 seconds
  }

  /**
   * Phase 8.8.3-I4 B4: Stop periodic price tick health logging
   */
  stopPriceTickHealthLogging(): void {
    if (this.priceTickHealthInterval) {
      clearInterval(this.priceTickHealthInterval);
      this.priceTickHealthInterval = null;
      this.openPositionSymbolsProvider = null;
      console.log('[8.8.3-I4][PRICE_TICK_HEALTH] Stopped periodic health logging');
    }
  }

  /**
   * Phase 8.8.3-I8E: Get WS health data for all subscribed symbols
   * Returns detailed health status per symbol for diagnostic endpoint
   */
  getI8EWsHealth(): Array<{
    symbol: string;
    subscribed: boolean;
    lastTickAt: string | null;
    ageMs: number | null;
    isLowVolume: boolean;
    isStale: boolean;
    ticksPerMinute: number;
    classification: string;
  }> {
    const now = Date.now();
    const healthData: Array<{
      symbol: string;
      subscribed: boolean;
      lastTickAt: string | null;
      ageMs: number | null;
      isLowVolume: boolean;
      isStale: boolean;
      ticksPerMinute: number;
      classification: string;
    }> = [];
    
    // Get all subscribed symbols
    for (const symbol of this.subscribedSymbols) {
      const stats = this.symbolStats.get(symbol);
      const ageMs = stats ? now - stats.lastUpdate : null;
      
      // Phase 8.8.3-I8E classification thresholds
      const isLowVolume = ageMs !== null && ageMs > this.I8E_LOW_VOLUME_MIN_MS && ageMs <= this.I8E_LOW_VOLUME_MAX_MS;
      const isStale = ageMs !== null && ageMs > this.I8C_STALE_THRESHOLD_MS;
      
      // Classification
      let classification = 'healthy';
      if (ageMs === null) {
        classification = 'no_ticks_yet';
      } else if (isStale) {
        classification = 'stale';
      } else if (isLowVolume) {
        classification = 'low_volume';
      } else if (ageMs <= 2000) {
        classification = 'healthy';
      } else {
        classification = 'warming_up';
      }
      
      // Calculate ticks per minute
      let ticksPerMinute = 0;
      if (stats) {
        const timeWindowMs = now - stats.firstUpdate;
        const timeWindowMinutes = timeWindowMs / 60000;
        ticksPerMinute = timeWindowMinutes > 0 ? Math.round((stats.updateCount / timeWindowMinutes) * 10) / 10 : 0;
      }
      
      healthData.push({
        symbol,
        subscribed: true,
        lastTickAt: stats ? new Date(stats.lastUpdate).toISOString() : null,
        ageMs,
        isLowVolume,
        isStale,
        ticksPerMinute,
        classification
      });
    }
    
    return healthData;
  }

  getStatus() {
    return {
      isConnected: this.isConnected,
      isConnecting: this.isConnecting,
      subscribedCount: this.subscribedSymbols.size,
      pendingCount: this.pendingSubscriptions.size,
      reconnectAttempts: this.reconnectAttempts,
      healthy: this.isHealthy()
    };
  }

  /**
   * Phase 8.8.3-I9: Get frequency info for a specific symbol
   * Returns source (WS/REST) and frequency bucket (High/Medium/Low/Very Low)
   * 
   * Buckets based on avg tick interval:
   * - High: < 3 seconds
   * - Medium: 3-10 seconds
   * - Low: 10-30 seconds
   * - Very Low: > 30 seconds or unknown
   */
  getSymbolFrequencyInfo(symbol: string): { source: 'WS' | 'REST' | 'Unknown'; frequency: 'High' | 'Medium' | 'Low' | 'Very Low'; avgIntervalMs: number } {
    const stats = this.symbolStats.get(symbol);
    const now = Date.now();
    
    // No stats available - return defaults
    if (!stats || stats.updateCount === 0) {
      return { source: 'REST', frequency: 'Very Low', avgIntervalMs: -1 };
    }
    
    const tickAgeMs = now - stats.lastUpdate;
    const timeWindowMs = now - stats.firstUpdate;
    
    // Guard: need at least 10 seconds of data and 2+ ticks to calculate meaningful interval
    if (timeWindowMs < 10000 || stats.updateCount < 2) {
      // Not enough data yet - classify based on tick age
      const source: 'WS' | 'REST' = tickAgeMs < 25000 ? 'WS' : 'REST';
      return { source, frequency: 'Very Low', avgIntervalMs: -1 };
    }
    
    // Calculate average interval between ticks
    // For N ticks over T time, avg interval = T / (N-1)
    const avgIntervalMs = timeWindowMs / (stats.updateCount - 1);
    
    // Determine source: if last tick was recent (< 25s), it's WebSocket; otherwise REST fallback
    const source: 'WS' | 'REST' = tickAgeMs < 25000 ? 'WS' : 'REST';
    
    // Frequency buckets:
    // < 3 sec avg interval = High (very active trading pair)
    // 3-10 sec = Medium
    // 10-30 sec = Low
    // > 30 sec = Very Low (REST fallback expected)
    let frequency: 'High' | 'Medium' | 'Low' | 'Very Low';
    if (avgIntervalMs < 3000) {
      frequency = 'High';
    } else if (avgIntervalMs < 10000) {
      frequency = 'Medium';
    } else if (avgIntervalMs < 30000) {
      frequency = 'Low';
    } else {
      frequency = 'Very Low';
    }
    
    return { source, frequency, avgIntervalMs: Math.round(avgIntervalMs) };
  }

  /**
   * Phase 8.8.3-B7.A: Clear all subscriptions for hard reset
   * Used during paper simulation reset to prevent stale price updates
   */
  clearAllSubscriptions(): void {
    const prevSubscribed = this.subscribedSymbols.size;
    const prevPending = this.pendingSubscriptions.size;
    const prevStats = this.symbolStats.size;
    const prevTickLogs = this.priceTickLogs.length;
    
    console.log(`[WEBSOCKET][RESET] Starting clear - subscribed=${prevSubscribed}, pending=${prevPending}, stats=${prevStats}, tickLogs=${prevTickLogs}`);
    
    if (this.isConnected && this.subscribedSymbols.size > 0) {
      const symbols = Array.from(this.subscribedSymbols);
      this.unsubscribeFromSymbols(symbols);
      console.log(`[WEBSOCKET][RESET] Unsubscribed from ${symbols.length} symbols`);
    }
    
    this.subscribedSymbols.clear();
    this.pendingSubscriptions.clear();
    this.symbolStats.clear();
    this.priceTickLogs = [];
    
    console.log(`[WEBSOCKET][RESET] Cleared all subscriptions - symbolStats, pending subscriptions, price tick logs`);
  }

  /**
   * Get subscription stats for verification
   */
  getSubscriptionStats(): { subscribedSymbols: number; pendingSubscriptions: number; symbolStats: number; priceTickLogs: number } {
    return {
      subscribedSymbols: this.subscribedSymbols.size,
      pendingSubscriptions: this.pendingSubscriptions.size,
      symbolStats: this.symbolStats.size,
      priceTickLogs: this.priceTickLogs.length
    };
  }

  /**
   * Phase 8.8.3-I7-WS-A: Get diagnostic subscription map for all active positions
   * Returns detailed mapping information for diagnostic endpoint
   */
  async getI7SubscriptionMap(activePositionSymbols: string[]): Promise<Array<{
    internal: string;
    kraken_ws: string;
    kraken_rest: string;
    subscribed: boolean;
    pending: boolean;
    first_tick_received: boolean;
    acked: boolean;
    subscription_status: 'subscribed' | 'pending' | 'never_requested';
  }>> {
    // Import resolver functions dynamically to avoid circular deps (ESM compatible)
    const { getKrakenWsPair, getKrakenRestPair } = await import('../../markets/kraken-symbol-resolver.js');
    
    return activePositionSymbols.map(internalSymbol => {
      const normalizedInternal = normalizeToInternalSymbol(internalSymbol);
      const krakenWsPair = getKrakenWsPair(normalizedInternal) || 'unknown';
      const krakenRestPair = getKrakenRestPair(normalizedInternal) || 'unknown';
      const isSubscribed = this.subscribedSymbols.has(normalizedInternal);
      const isPending = this.pendingSubscriptions.has(normalizedInternal);
      const hasRequest = this.subscriptionRequests.has(normalizedInternal);
      const hasFirstTick = this.firstTickReceived.has(normalizedInternal);
      const ackInfo = this.subscriptionAcks.get(normalizedInternal);
      
      // Determine subscription status for gap analysis
      let subscription_status: 'subscribed' | 'pending' | 'never_requested';
      if (isSubscribed) {
        subscription_status = 'subscribed';
      } else if (isPending || hasRequest) {
        subscription_status = 'pending';
      } else {
        subscription_status = 'never_requested';
      }
      
      return {
        internal: normalizedInternal,
        kraken_ws: krakenWsPair,
        kraken_rest: krakenRestPair,
        subscribed: isSubscribed,
        pending: isPending,
        first_tick_received: hasFirstTick,
        acked: ackInfo?.acked || false,
        subscription_status
      };
    });
  }

  /**
   * Phase 8.8.3-I7-WS-A: Get list of symbols that received first tick
   */
  getFirstTickReceivedSymbols(): string[] {
    return Array.from(this.firstTickReceived);
  }

  /**
   * Phase 8.8.3-I7-WS-A: Get unmapped tick events for gap reporting
   */
  getUnmappedTicks(): Array<{ pair: string; count: number; lastSeen: string }> {
    return Array.from(this.unmappedTicks.entries()).map(([pair, data]) => ({
      pair,
      count: data.count,
      lastSeen: new Date(data.lastSeen).toISOString()
    }));
  }

  /**
   * Phase 8.8.3-I7-WS-A: Clear first tick tracking (for fresh diagnostic runs)
   */
  clearFirstTickTracking(): void {
    this.firstTickReceived.clear();
    this.subscriptionAcks.clear();
    this.subscriptionRequests.clear();
    this.unmappedTicks.clear();
    console.log('[I7-WS-A][RESET] Cleared first tick tracking for fresh diagnostic run');
  }

  /**
   * Phase 8.8.3-I7-WS-F (F1): Audit WebSocket coverage for active symbols
   * Verifies: internal symbol → canonical map → Kraken WS pair → subscription request → subscription ACK
   */
  async auditWebSocketCoverage(activeSymbols: string[]): Promise<{
    symbol: string;
    coverage_status: 'subscribed' | 'pending' | 'missing' | 'unmappable';
    kraken_ws_pair: string | null;
    has_ack: boolean;
    has_ticks: boolean;
    last_tick_age_ms: number | null;
    pair_resolve_error: string | null;
  }[]> {
    const { getKrakenWsPair } = await import('../../markets/kraken-symbol-resolver.js');
    const now = Date.now();
    
    return activeSymbols.map(symbol => {
      const normalizedInternal = normalizeToInternalSymbol(symbol);
      let krakenWsPair: string | null = null;
      let pairResolveError: string | null = null;
      
      try {
        krakenWsPair = getKrakenWsPair(normalizedInternal);
        if (krakenWsPair === normalizedInternal) {
          krakenWsPair = this.normalToKrakenSymbol(normalizedInternal);
        }
      } catch (err: any) {
        pairResolveError = err.message || 'Unknown error resolving pair';
      }
      
      const isSubscribed = this.subscribedSymbols.has(normalizedInternal);
      const isPending = this.pendingSubscriptions.has(normalizedInternal);
      const hasRequest = this.subscriptionRequests.has(normalizedInternal);
      const ackInfo = this.subscriptionAcks.get(normalizedInternal);
      const hasFirstTick = this.firstTickReceived.has(normalizedInternal);
      const stats = this.symbolStats.get(normalizedInternal);
      const lastTickAgeMs = stats ? now - stats.lastUpdate : null;
      
      let coverageStatus: 'subscribed' | 'pending' | 'missing' | 'unmappable';
      if (!krakenWsPair) {
        coverageStatus = 'unmappable';
      } else if (isSubscribed) {
        coverageStatus = 'subscribed';
      } else if (isPending || hasRequest) {
        coverageStatus = 'pending';
      } else {
        coverageStatus = 'missing';
      }
      
      console.log(`[I7-WS-F][COVERAGE_AUDIT] symbol=${normalizedInternal} status=${coverageStatus} ws_pair=${krakenWsPair || 'null'}`);
      
      return {
        symbol: normalizedInternal,
        coverage_status: coverageStatus,
        kraken_ws_pair: krakenWsPair,
        has_ack: ackInfo?.acked || false,
        has_ticks: hasFirstTick,
        last_tick_age_ms: lastTickAgeMs,
        pair_resolve_error: pairResolveError
      };
    });
  }

  /**
   * Phase 8.8.3-I7-WS-F (F2): Automatically subscribe to missing symbols
   * Derives Kraken pair and subscribes dynamically for symbols with coverage gaps
   */
  async autoSubscribeMissingSymbols(activeSymbols: string[]): Promise<{
    attempted: string[];
    subscribed: string[];
    failed: string[];
    unmappable: string[];
  }> {
    const coverageAudit = await this.auditWebSocketCoverage(activeSymbols);
    const missingSymbols = coverageAudit.filter(a => a.coverage_status === 'missing');
    const unmappableSymbols = coverageAudit.filter(a => a.coverage_status === 'unmappable');
    
    const attempted: string[] = [];
    const subscribed: string[] = [];
    const failed: string[] = [];
    const unmappable = unmappableSymbols.map(u => u.symbol);
    
    for (const audit of missingSymbols) {
      if (!audit.kraken_ws_pair) {
        failed.push(audit.symbol);
        continue;
      }
      
      attempted.push(audit.symbol);
      console.log(`[I7-WS-F][AUTO_SUBSCRIBE] symbol=${audit.symbol} kraken_ws_pair=${audit.kraken_ws_pair}`);
      
      try {
        this.subscribeToSymbols([audit.symbol]);
        subscribed.push(audit.symbol);
      } catch (err: any) {
        console.error(`[I7-WS-F][AUTO_SUBSCRIBE_FAIL] symbol=${audit.symbol} error=${err.message}`);
        failed.push(audit.symbol);
      }
    }
    
    console.log(`[I7-WS-F][AUTO_SUBSCRIBE_SUMMARY] attempted=${attempted.length} subscribed=${subscribed.length} failed=${failed.length} unmappable=${unmappable.length}`);
    
    return { attempted, subscribed, failed, unmappable };
  }

  /**
   * Phase 8.8.3-I7-WS-F (F4): Start subscription health monitoring
   * Detects ACK timeouts and no-tick situations
   */
  startSubscriptionHealthMonitoring(): void {
    if (this.subscriptionHealthInterval) {
      console.log('[I7-WS-F][HEALTH_MONITOR] Already running, skipping start');
      return;
    }
    
    console.log('[I7-WS-F][HEALTH_MONITOR] Starting subscription health monitoring');
    
    this.subscriptionHealthInterval = setInterval(() => {
      const now = Date.now();
      
      // Check for ACK timeouts (pending > 5 seconds)
      this.subscriptionRequests.forEach((request, symbol) => {
        const ackInfo = this.subscriptionAcks.get(symbol);
        if (!ackInfo || !ackInfo.acked) {
          const pendingDuration = now - request.timestamp;
          if (pendingDuration > this.ACK_TIMEOUT_MS) {
            console.warn(`[I7-WS-F][ACK_TIMEOUT] symbol=${symbol} kraken_ws_pair=${request.krakenWsPair} pending_ms=${pendingDuration}`);
          }
        }
      });
      
      // Check for no-tick situations (subscribed but no tick after 10 seconds)
      this.subscribedSymbols.forEach(symbol => {
        const ackInfo = this.subscriptionAcks.get(symbol);
        const hasFirstTick = this.firstTickReceived.has(symbol);
        
        if (ackInfo?.acked && !hasFirstTick) {
          const timeSinceAck = now - ackInfo.timestamp;
          if (timeSinceAck > this.NO_TICK_TIMEOUT_MS) {
            console.warn(`[I7-WS-F][NO_TICK] symbol=${symbol} time_since_ack_ms=${timeSinceAck}`);
          }
        }
      });
    }, 5000); // Check every 5 seconds
  }

  /**
   * Phase 8.8.3-I7-WS-F (F4): Stop subscription health monitoring
   */
  stopSubscriptionHealthMonitoring(): void {
    if (this.subscriptionHealthInterval) {
      clearInterval(this.subscriptionHealthInterval);
      this.subscriptionHealthInterval = null;
      console.log('[I7-WS-F][HEALTH_MONITOR] Stopped subscription health monitoring');
    }
  }

  /**
   * Phase 8.8.3-I7-WS-F (F5): Validate symbol map integrity
   * Detects symbols where internal symbol exists but Kraken pair mapping is missing
   */
  async validateSymbolMapIntegrity(activeSymbols: string[]): Promise<{
    total: number;
    valid: number;
    missing_ws_mapping: string[];
    format_mismatches: Array<{ symbol: string; expected: string; actual: string }>;
  }> {
    const { getKrakenWsPair, resolveByInternalSymbol } = await import('../../markets/kraken-symbol-resolver.js');
    
    const missingWsMapping: string[] = [];
    const formatMismatches: Array<{ symbol: string; expected: string; actual: string }> = [];
    let validCount = 0;
    
    for (const symbol of activeSymbols) {
      const normalized = normalizeToInternalSymbol(symbol);
      const mapping = resolveByInternalSymbol(normalized);
      
      if (!mapping) {
        missingWsMapping.push(normalized);
        console.log(`[I7-WS-F][MAP_VALIDATION] symbol=${normalized} status=missing_mapping`);
        continue;
      }
      
      const wsPair = getKrakenWsPair(normalized);
      if (wsPair !== mapping.krakenWsPair) {
        formatMismatches.push({
          symbol: normalized,
          expected: mapping.krakenWsPair,
          actual: wsPair
        });
        console.log(`[I7-WS-F][MAP_VALIDATION] symbol=${normalized} status=mismatch expected=${mapping.krakenWsPair} actual=${wsPair}`);
        continue;
      }
      
      validCount++;
    }
    
    console.log(`[I7-WS-F][MAP_VALIDATION_SUMMARY] total=${activeSymbols.length} valid=${validCount} missing=${missingWsMapping.length} mismatches=${formatMismatches.length}`);
    
    return {
      total: activeSymbols.length,
      valid: validCount,
      missing_ws_mapping: missingWsMapping,
      format_mismatches: formatMismatches
    };
  }

  /**
   * Phase 8.8.3-I7-WS-F (F3): Get enhanced subscription map with coverage_status
   */
  async getI7CoverageMap(activePositionSymbols: string[]): Promise<Array<{
    internal: string;
    kraken_ws: string;
    kraken_rest: string;
    coverage_status: 'subscribed' | 'pending' | 'missing' | 'unmappable';
    subscribed: boolean;
    pending: boolean;
    first_tick_received: boolean;
    acked: boolean;
    last_tick_age_ms: number | null;
    pair_resolve_error: string | null;
  }>> {
    const { getKrakenWsPair, getKrakenRestPair } = await import('../../markets/kraken-symbol-resolver.js');
    const now = Date.now();
    
    return activePositionSymbols.map(internalSymbol => {
      const normalizedInternal = normalizeToInternalSymbol(internalSymbol);
      let krakenWsPair: string = 'unknown';
      let krakenRestPair: string = 'unknown';
      let pairResolveError: string | null = null;
      
      try {
        krakenWsPair = getKrakenWsPair(normalizedInternal) || 'unknown';
        krakenRestPair = getKrakenRestPair(normalizedInternal) || 'unknown';
        
        if (krakenWsPair === normalizedInternal || krakenWsPair === 'unknown') {
          const fallback = this.normalToKrakenSymbol(normalizedInternal);
          if (fallback) krakenWsPair = fallback;
        }
      } catch (err: any) {
        pairResolveError = err.message || 'Unknown error';
      }
      
      const isSubscribed = this.subscribedSymbols.has(normalizedInternal);
      const isPending = this.pendingSubscriptions.has(normalizedInternal);
      const hasRequest = this.subscriptionRequests.has(normalizedInternal);
      const hasFirstTick = this.firstTickReceived.has(normalizedInternal);
      const ackInfo = this.subscriptionAcks.get(normalizedInternal);
      const stats = this.symbolStats.get(normalizedInternal);
      const lastTickAgeMs = stats ? now - stats.lastUpdate : null;
      
      // I7-MAP-FIX: Use isMappable for accurate coverage status
      const symbolIsMappable = isMappable(normalizedInternal);
      
      let coverageStatus: 'subscribed' | 'pending' | 'missing' | 'unmappable';
      if (!symbolIsMappable || krakenWsPair === 'unknown') {
        coverageStatus = 'unmappable';
      } else if (isSubscribed) {
        coverageStatus = 'subscribed';
      } else if (isPending || hasRequest) {
        coverageStatus = 'pending';
      } else {
        coverageStatus = 'missing';
      }
      
      return {
        internal: normalizedInternal,
        kraken_ws: krakenWsPair,
        kraken_rest: krakenRestPair,
        coverage_status: coverageStatus,
        subscribed: isSubscribed,
        pending: isPending,
        first_tick_received: hasFirstTick,
        acked: ackInfo?.acked || false,
        last_tick_age_ms: lastTickAgeMs,
        pair_resolve_error: pairResolveError
      };
    });
  }

  /**
   * Phase 8.8.3-I7-WS-F: Get subscription health status
   */
  getSubscriptionHealthStatus(): {
    ack_timeouts: Array<{ symbol: string; kraken_ws_pair: string; pending_ms: number }>;
    no_tick_symbols: Array<{ symbol: string; time_since_ack_ms: number }>;
  } {
    const now = Date.now();
    const ackTimeouts: Array<{ symbol: string; kraken_ws_pair: string; pending_ms: number }> = [];
    const noTickSymbols: Array<{ symbol: string; time_since_ack_ms: number }> = [];
    
    this.subscriptionRequests.forEach((request, symbol) => {
      const ackInfo = this.subscriptionAcks.get(symbol);
      if (!ackInfo || !ackInfo.acked) {
        const pendingDuration = now - request.timestamp;
        if (pendingDuration > this.ACK_TIMEOUT_MS) {
          ackTimeouts.push({
            symbol,
            kraken_ws_pair: request.krakenWsPair,
            pending_ms: pendingDuration
          });
        }
      }
    });
    
    this.subscribedSymbols.forEach(symbol => {
      const ackInfo = this.subscriptionAcks.get(symbol);
      const hasFirstTick = this.firstTickReceived.has(symbol);
      
      if (ackInfo?.acked && !hasFirstTick) {
        const timeSinceAck = now - ackInfo.timestamp;
        if (timeSinceAck > this.NO_TICK_TIMEOUT_MS) {
          noTickSymbols.push({
            symbol,
            time_since_ack_ms: timeSinceAck
          });
        }
      }
    });
    
    return { ack_timeouts: ackTimeouts, no_tick_symbols: noTickSymbols };
  }

  // ===== Phase 8.8.3-I7-WS-G: Tick Frequency Stabilization =====

  /**
   * Phase 8.8.3-I7-WS-G (G1.1): Update tick frequency data for a symbol
   */
  private updateTickFrequency(symbol: string, intervalMs: number): void {
    const now = Date.now();
    let data = this.tickFrequencyData.get(symbol);
    
    if (!data) {
      data = {
        lastTickTimestamp: now,
        tickIntervals: [],
        frozenSince: null,
        classification: 'normal',
        correctionAttempts: [],
        isUnstable: false,
        currentChannel: 'ticker',
        bookRevertTimer: null
      };
      this.tickFrequencyData.set(symbol, data);
    }
    
    data.lastTickTimestamp = now;
    data.frozenSince = null; // Reset frozen since we got a tick
    
    if (intervalMs > 0) {
      data.tickIntervals.push(intervalMs);
      // Keep last 200 intervals for bucket averaging
      if (data.tickIntervals.length > 200) {
        data.tickIntervals.shift();
      }
      
      const avgInterval = this.calculateRollingAverage(data.tickIntervals, 30000, now);
      console.log(`[I7-WS-G][TICK_INTERVAL] symbol=${symbol} interval=${intervalMs}ms avg=${Math.round(avgInterval)}ms`);
    }
    
    // Update classification
    this.classifyTickFrequency(symbol);
  }

  /**
   * Phase 8.8.3-I7-WS-G (G1.2): Calculate rolling bucket average
   * @param intervals Array of tick intervals
   * @param windowMs Time window in milliseconds
   * @param now Current timestamp
   */
  private calculateRollingAverage(intervals: number[], windowMs: number, now: number): number {
    if (intervals.length === 0) return 0;
    
    // Use up to the last N intervals based on window
    const maxIntervals = Math.min(intervals.length, Math.ceil(windowMs / 1000));
    const recentIntervals = intervals.slice(-maxIntervals);
    
    if (recentIntervals.length === 0) return 0;
    return recentIntervals.reduce((a, b) => a + b, 0) / recentIntervals.length;
  }

  /**
   * Phase 8.8.3-I7-WS-G (G1.2): Get rolling bucket averages for a symbol
   */
  private getRollingAverages(symbol: string): { avg_30s: number; avg_60s: number; avg_180s: number } {
    const data = this.tickFrequencyData.get(symbol);
    if (!data || data.tickIntervals.length === 0) {
      return { avg_30s: 0, avg_60s: 0, avg_180s: 0 };
    }
    
    const now = Date.now();
    return {
      avg_30s: this.calculateRollingAverage(data.tickIntervals, 30000, now),
      avg_60s: this.calculateRollingAverage(data.tickIntervals, 60000, now),
      avg_180s: this.calculateRollingAverage(data.tickIntervals, 180000, now)
    };
  }

  /**
   * Phase 8.8.3-I7-WS-G (G1.3): Classify tick frequency for a symbol
   */
  private classifyTickFrequency(symbol: string): void {
    const data = this.tickFrequencyData.get(symbol);
    if (!data) return;
    
    const { avg_60s } = this.getRollingAverages(symbol);
    const now = Date.now();
    const timeSinceLastTick = now - data.lastTickTimestamp;
    
    let prevClassification = data.classification;
    
    // Check for frozen first
    if (timeSinceLastTick >= this.FROZEN_THRESHOLD_MS) {
      data.classification = 'frozen';
      if (data.frozenSince === null) {
        data.frozenSince = data.lastTickTimestamp;
      }
      console.log(`[I7-WS-G][FROZEN] symbol=${symbol} lastTick=${new Date(data.lastTickTimestamp).toISOString()}`);
    } else if (avg_60s >= this.VERY_SLOW_THRESHOLD_MS) {
      data.classification = 'very_slow';
      data.frozenSince = null;
      console.log(`[I7-WS-G][SLOW_TICK] symbol=${symbol} avg=${Math.round(avg_60s)}ms classification=very_slow`);
    } else if (avg_60s >= this.SLOW_THRESHOLD_MS) {
      data.classification = 'slow';
      data.frozenSince = null;
      console.log(`[I7-WS-G][SLOW_TICK] symbol=${symbol} avg=${Math.round(avg_60s)}ms classification=slow`);
    } else {
      data.classification = 'normal';
      data.frozenSince = null;
      
      // G3.2: If classification improved to normal, schedule book channel revert
      if (prevClassification !== 'normal' && data.currentChannel === 'book') {
        this.scheduleBookChannelRevert(symbol);
      }
    }
  }

  /**
   * Phase 8.8.3-I7-WS-G (G2.1): Trigger corrective action for slow/frozen symbols
   */
  private async triggerCorrectiveAction(symbol: string, reason: 'slow' | 'frozen'): Promise<void> {
    const data = this.tickFrequencyData.get(symbol);
    if (!data || data.isUnstable) return;
    
    const now = Date.now();
    
    // Clean up old attempts outside the window
    data.correctionAttempts = data.correctionAttempts.filter(
      a => now - a.timestamp < this.CORRECTION_WINDOW_MS
    );
    
    // G2.3: Check if we've exceeded max attempts
    if (data.correctionAttempts.length >= this.MAX_CORRECTION_ATTEMPTS) {
      if (!data.isUnstable) {
        data.isUnstable = true;
        console.warn(`[I7-WS-G][UNSTABLE] symbol=${symbol} attempts=${data.correctionAttempts.length}`);
      }
      return;
    }
    
    // Record this attempt
    data.correctionAttempts.push({ timestamp: now });
    
    // G3.1: Check if we should switch to book channel for low-liquidity pairs
    const internalSymbol = normalizeToInternalSymbol(symbol);
    const shouldUseBook = this.KRAKEN_CHANNEL_HINTS.prefer_book.some(
      hint => internalSymbol.includes(hint.replace('/', ''))
    );
    
    if (shouldUseBook && data.currentChannel === 'ticker') {
      await this.switchToBookChannel(symbol);
    } else {
      // G2.1/G2.2: Re-subscribe to ticker for the affected symbol only
      console.log(`[I7-WS-G][RESUBSCRIBE] pair=${symbol} reason=${reason}`);
      this.subscribeToSymbols([symbol]);
    }
  }

  /**
   * Phase 8.8.3-I7-WS-G (G3.1): Switch to book channel for better tick frequency
   */
  private async switchToBookChannel(symbol: string): Promise<void> {
    const data = this.tickFrequencyData.get(symbol);
    if (!data) return;
    
    console.log(`[I7-WS-G][CHANNEL_SWITCH] symbol=${symbol} use=book depth=1`);
    // #507 / Langston BLOCKER-2: do NOT record depth from the REQUEST. Kraken REJECTS depth:1
    // ('Subscription depth not supported'), so the depth-10 stream keeps flowing; recording 1 here
    // would crush this symbol's book to one level per side indefinitely and starve the depth gate
    // and the close walk for exactly the illiquid pairs this path targets. Depth is recorded from
    // the subscribe ACK (result.depth) in handleSubscribeAck -- the depth Kraken GRANTED.
    
    // Get Kraken pair
    const krakenPair = this.normalToKrakenSymbol(symbol);
    if (!krakenPair || !this.isConnected || !this.ws) return;
    
    // B78.2: Subscribe to book channel with depth 1.
    // Pre-B78.2 used the Kraken WS v1 format ({event, pair, subscription}) which
    // the v2 endpoint (wss://ws.kraken.com/v2) silently rejects with "Method(s)
    // not found" since 2026-04-03 (RUNNING_ISSUES #76). Converted to v2 format:
    // {method, params:{channel,symbol,depth}} matching the working ticker/book
    // subscribe path at L1100-1117.
    const subscribeMessage = {
      method: 'subscribe',
      params: {
        channel: 'book',
        symbol: [krakenPair],
        depth: 1,
      },
    };
    
    try {
      this.ws.send(JSON.stringify(subscribeMessage));
      data.currentChannel = 'book';
    } catch (error) {
      console.error(`[I7-WS-G][CHANNEL_SWITCH_ERROR] symbol=${symbol}`, error);
    }
  }

  /**
   * Phase 8.8.3-I7-WS-G (G3.2): Schedule revert to ticker channel after stable period
   */
  private scheduleBookChannelRevert(symbol: string): void {
    const data = this.tickFrequencyData.get(symbol);
    if (!data || data.currentChannel !== 'book') return;
    
    // Clear existing timer if any
    if (data.bookRevertTimer) {
      clearTimeout(data.bookRevertTimer);
    }
    
    data.bookRevertTimer = setTimeout(() => {
      if (data.classification === 'normal') {
        console.log(`[I7-WS-G][CHANNEL_REVERT] symbol=${symbol} from=book to=ticker`);
        data.currentChannel = 'ticker';
        this.subscribeToSymbols([symbol]); // Resubscribe to ticker
      }
      data.bookRevertTimer = null;
    }, this.BOOK_REVERT_DELAY_MS);
  }

  /**
   * Phase 8.8.3-I7-WS-G (G1): Start tick frequency monitoring
   * Runs every 5 seconds to check for slow/frozen symbols and trigger corrections
   */
  startTickFrequencyMonitoring(): void {
    if (this.tickFrequencyMonitorInterval) {
      console.log('[I7-WS-G][FREQ_MONITOR] Already running, skipping start');
      return;
    }
    
    console.log('[I7-WS-G][FREQ_MONITOR] Starting tick frequency monitoring');
    
    this.tickFrequencyMonitorInterval = setInterval(() => {
      const now = Date.now();
      
      this.tickFrequencyData.forEach((data, symbol) => {
        // Re-classify based on current state
        this.classifyTickFrequency(symbol);
        
        // Trigger corrective actions for slow/frozen symbols
        if (data.classification === 'frozen' && !data.isUnstable) {
          this.triggerCorrectiveAction(symbol, 'frozen');
        } else if ((data.classification === 'slow' || data.classification === 'very_slow') && !data.isUnstable) {
          this.triggerCorrectiveAction(symbol, 'slow');
        }
      });
    }, 5000); // Check every 5 seconds
  }

  /**
   * Phase 8.8.3-I7-WS-G: Stop tick frequency monitoring
   */
  stopTickFrequencyMonitoring(): void {
    if (this.tickFrequencyMonitorInterval) {
      clearInterval(this.tickFrequencyMonitorInterval);
      this.tickFrequencyMonitorInterval = null;
      console.log('[I7-WS-G][FREQ_MONITOR] Stopped tick frequency monitoring');
    }
  }

  /**
   * Phase 8.8.3-I7-WS-G (G4.1): Get tick frequency metrics for all symbols
   */
  getTickFrequencyMetrics(): Array<{
    symbol: string;
    lastTickTimestamp: string;
    ticksSinceMs: number;
    intervalCount: number;
    minInterval: number;
    maxInterval: number;
    avg_30s: number;
    avg_60s: number;
    avg_180s: number;
    classification: 'normal' | 'slow' | 'very_slow' | 'frozen';
    isUnstable: boolean;
    correctionAttempts: number;
    currentChannel: 'ticker' | 'book';
  }> {
    const now = Date.now();
    const results: Array<any> = [];
    
    this.tickFrequencyData.forEach((data, symbol) => {
      const averages = this.getRollingAverages(symbol);
      const intervals = data.tickIntervals;
      
      results.push({
        symbol,
        lastTickTimestamp: new Date(data.lastTickTimestamp).toISOString(),
        ticksSinceMs: now - data.lastTickTimestamp,
        intervalCount: intervals.length,
        minInterval: intervals.length > 0 ? Math.min(...intervals) : 0,
        maxInterval: intervals.length > 0 ? Math.max(...intervals) : 0,
        avg_30s: Math.round(averages.avg_30s),
        avg_60s: Math.round(averages.avg_60s),
        avg_180s: Math.round(averages.avg_180s),
        classification: data.classification,
        isUnstable: data.isUnstable,
        correctionAttempts: data.correctionAttempts.length,
        currentChannel: data.currentChannel
      });
    });
    
    return results;
  }

  /**
   * Phase 8.8.3-I7-WS-G (G4.2): Reset tick frequency data
   */
  resetTickFrequencyData(): void {
    // Clear any book revert timers
    this.tickFrequencyData.forEach((data) => {
      if (data.bookRevertTimer) {
        clearTimeout(data.bookRevertTimer);
      }
    });
    
    this.tickFrequencyData.clear();
    console.log('[I7-WS-G][RESET] Cleared all tick frequency data');
  }

  /**
   * Phase 8.8.3-I7-WS-G (G4.3): Get list of unstable symbols
   */
  getUnstableSymbols(): string[] {
    const unstable: string[] = [];
    this.tickFrequencyData.forEach((data, symbol) => {
      if (data.isUnstable) {
        unstable.push(symbol);
      }
    });
    return unstable;
  }

  /**
   * Phase 8.8.3-I7-WS-G: Get channel hints configuration
   */
  getChannelHints(): { low_liquidity: string[]; prefer_book: string[] } {
    return this.KRAKEN_CHANNEL_HINTS;
  }

  // I7-ROOT-FIX (A3): Wrapper for ensuring WS coverage for open positions
  async ensureCoverageForOpenPositions(reason: string): Promise<void> {
    console.log('[I7-ROOT-FIX][WS_COVERAGE]', { reason });
    // Use existing auditWebSocketCoverage and autoSubscribeMissingSymbols
    const { storage } = await import('../../storage.js');
    const openPositions = await storage.getActiveOpenPositions('paper');
    const livePositions = await storage.getActiveOpenPositions('live');
    const allSymbols = [...new Set([...openPositions.map(p => p.symbol), ...livePositions.map(p => p.symbol)])];
    
    if (allSymbols.length > 0) {
      const result = await this.autoSubscribeMissingSymbols(allSymbols);
      console.log('[I7-ROOT-FIX][WS_COVERAGE_RESULT]', {
        reason,
        symbols: allSymbols.length,
        subscribed: result.subscribed.length,
        failed: result.failed.length
      });
    }
  }

  // I7-ROOT-FIX (A3): Wrapper for ensuring tick monitoring is started
  async ensureTickMonitoringStarted(reason: string): Promise<void> {
    console.log('[I7-ROOT-FIX][WS_MONITOR_START]', { reason });
    this.startTickFrequencyMonitoring();
  }

  // ===== Phase 8.8.3-I8C: Subscription Reliability Methods =====

  /**
   * Phase 8.8.3-I8C (1): Set open positions provider for audit and reconnect
   */
  setI8COpenPositionsProvider(provider: () => Promise<string[]>): void {
    this.i8cOpenPositionsProvider = provider;
    console.log('[I8C-STARTUP][PROVIDER_SET] Open positions provider registered');
  }

  /**
   * Phase 8.8.3-I8C (1): Subscribe to all open positions at engine start
   */
  async i8cSubscribeAllOpenPositions(): Promise<{ subscribed: string[]; count: number }> {
    if (!this.i8cOpenPositionsProvider) {
      console.log('[I8C-STARTUP] no open positions provider set');
      return { subscribed: [], count: 0 };
    }

    try {
      const symbols = await this.i8cOpenPositionsProvider();
      
      if (symbols.length === 0) {
        console.log('[I8C-STARTUP] no open positions to subscribe');
        return { subscribed: [], count: 0 };
      }

      const normalizedSymbols = symbols.map(s => normalizeToInternalSymbol(s));
      console.log(`[I8C-STARTUP][ENGINE_INIT_SUBSCRIBE] subscribing_to=[${normalizedSymbols.join(', ')}]`);
      
      this.subscribeToSymbols(normalizedSymbols);
      
      return { subscribed: normalizedSymbols, count: normalizedSymbols.length };
    } catch (error) {
      console.error('[I8C-STARTUP][ERROR] Failed to subscribe to open positions:', error);
      return { subscribed: [], count: 0 };
    }
  }

  /**
   * Phase 8.8.3-I8C (2): Subscribe to a single new trade immediately upon creation
   */
  i8cSubscribeNewTrade(symbol: string, reason: string = 'new_trade'): void {
    const normalizedSymbol = normalizeToInternalSymbol(symbol);
    console.log(`[I8C-ENGINE-SUBCALL] symbol=${normalizedSymbol} reason=${reason}`);
    this.subscribeToSymbols([normalizedSymbol]);
  }

  /**
   * Phase 8.8.3-I8C (3): Resubscribe to all open positions on WebSocket reconnect
   */
  private async i8cResubscribeAllOpenPositions(): Promise<void> {
    if (!this.i8cOpenPositionsProvider) {
      console.log('[I8C-WS-RESUBSCRIBE][RECONNECT] no provider, skipping resubscribe');
      return;
    }

    try {
      const symbols = await this.i8cOpenPositionsProvider();
      
      if (symbols.length === 0) {
        console.log('[I8C-WS-RESUBSCRIBE][RECONNECT] symbols=[]');
        return;
      }

      const normalizedSymbols = symbols.map(s => normalizeToInternalSymbol(s));
      console.log(`[I8C-WS-RESUBSCRIBE][RECONNECT] symbols=[${normalizedSymbols.join(', ')}]`);
      
      this.subscribeToSymbols(normalizedSymbols);
    } catch (error) {
      console.error('[I8C-WS-RESUBSCRIBE][ERROR] Failed to resubscribe:', error);
    }
  }

  /**
   * Phase 8.8.3-I8C (4): Start 5-second subscription health audit
   */
  startI8CSubscriptionAudit(): void {
    if (this.i8cAuditInterval) {
      console.log('[I8C-AUDIT] Already running, skipping start');
      return;
    }

    console.log('[I8C-AUDIT] Starting 5-second subscription health audit');

    this.i8cAuditInterval = setInterval(async () => {
      await this.i8cRunSubscriptionAudit();
    }, this.I8C_AUDIT_INTERVAL_MS);
  }

  /**
   * Phase 8.8.3-I8C (4): Stop subscription health audit
   */
  stopI8CSubscriptionAudit(): void {
    if (this.i8cAuditInterval) {
      clearInterval(this.i8cAuditInterval);
      this.i8cAuditInterval = null;
      console.log('[I8C-AUDIT] Stopped subscription health audit');
    }
  }

  /**
   * Phase 8.8.3-I8C (4): Run subscription health audit
   */
  private async i8cRunSubscriptionAudit(): Promise<void> {
    if (!this.i8cOpenPositionsProvider) {
      return;
    }

    try {
      const openPositions = await this.i8cOpenPositionsProvider();
      
      if (openPositions.length === 0) {
        return;
      }

      const now = Date.now();
      let subscribedCount = 0;
      let missingCount = 0;
      let staleCount = 0;
      const fixes: string[] = [];

      let lowVolumeCount = 0;
      for (const symbol of openPositions) {
        const normalizedSymbol = normalizeToInternalSymbol(symbol);
        const isSubscribed = this.subscribedSymbols.has(normalizedSymbol);
        const stats = this.symbolStats.get(normalizedSymbol);
        const lastTickAgeMs = stats ? now - stats.lastUpdate : null;
        
        // Phase 8.8.3-I8E: Only truly stale (>30s) should trigger resubscription
        // Low-volume pairs (5-25s without tick) are expected and should NOT resubscribe
        const isStale = lastTickAgeMs !== null && lastTickAgeMs > this.I8C_STALE_THRESHOLD_MS;
        const isLowVolume = lastTickAgeMs !== null && 
          lastTickAgeMs > this.I8E_LOW_VOLUME_MIN_MS && 
          lastTickAgeMs <= this.I8E_LOW_VOLUME_MAX_MS;

        if (isSubscribed && !isStale) {
          subscribedCount++;
          if (isLowVolume) {
            lowVolumeCount++; // Track low-volume but healthy subscriptions
          }
        } else if (!isSubscribed) {
          missingCount++;
          fixes.push(normalizedSymbol);
          console.log(`[I8C-AUDIT][FIX] symbol=${normalizedSymbol} reason=missing_subscription`);
        } else if (isStale) {
          staleCount++;
          fixes.push(normalizedSymbol);
          console.log(`[I8E-WS-RESUB] stale_channel_detected symbol=${normalizedSymbol} ageMs=${lastTickAgeMs} threshold=${this.I8C_STALE_THRESHOLD_MS}`);
        }
      }

      // Resubscribe to missing/stale symbols
      if (fixes.length > 0) {
        this.subscribeToSymbols(fixes);
      }

      // Phase 8.8.3-I8E: Enhanced summary with low-volume tracking
      console.log(`[I8C-AUDIT][SUMMARY] total_positions=${openPositions.length} subscribed=${subscribedCount} low_volume=${lowVolumeCount} missing=${missingCount} stale=${staleCount}`);
    } catch (error) {
      console.error('[I8C-AUDIT][ERROR] Failed to run audit:', error);
    }
  }

  /**
   * Phase 8.8.3-I8C (6): Get comprehensive subscription health for diagnostic endpoint
   */
  async getI8CSubscriptionHealth(openPositions?: string[]): Promise<{
    ok: boolean;
    engineRunning: boolean;
    openPositions: string[];
    websocketSubscriptions: string[];
    staleSymbols: string[];
    missingSymbols: string[];
    tickAges: Record<string, number>;
    summary: { total: number; subscribed: number; stale: number; missing: number };
  }> {
    // Get open positions from provider or parameter
    let positions = openPositions || [];
    if (!openPositions && this.i8cOpenPositionsProvider) {
      try {
        positions = await this.i8cOpenPositionsProvider();
      } catch (error) {
        console.error('[I8C] Failed to get open positions:', error);
      }
    }

    const now = Date.now();
    const tickAges: Record<string, number> = {};
    const staleSymbols: string[] = [];
    const missingSymbols: string[] = [];
    let subscribedCount = 0;

    for (const symbol of positions) {
      const normalizedSymbol = normalizeToInternalSymbol(symbol);
      const isSubscribed = this.subscribedSymbols.has(normalizedSymbol);
      const stats = this.symbolStats.get(normalizedSymbol);
      const lastTickAgeMs = stats ? now - stats.lastUpdate : -1;
      
      tickAges[normalizedSymbol] = lastTickAgeMs;

      if (!isSubscribed) {
        missingSymbols.push(normalizedSymbol);
      } else if (lastTickAgeMs > this.I8C_STALE_THRESHOLD_MS) {
        staleSymbols.push(normalizedSymbol);
        subscribedCount++; // Still subscribed, just stale
      } else {
        subscribedCount++;
      }
    }

    const summary = {
      total: positions.length,
      subscribed: subscribedCount,
      stale: staleSymbols.length,
      missing: missingSymbols.length
    };

    return {
      ok: missingSymbols.length === 0 && staleSymbols.length < 2,
      engineRunning: this.isConnected,
      openPositions: positions.map(s => normalizeToInternalSymbol(s)),
      websocketSubscriptions: Array.from(this.subscribedSymbols),
      staleSymbols,
      missingSymbols,
      tickAges,
      summary
    };
  }
  // ==========================================
  // Phase 8.8.5: Tiered Sentinel Architecture
  // ==========================================

  /**
   * Phase 8.8.5: Start global heartbeat monitor (1 Hz)
   * Monitors connection health and sends keep-alive pings
   */
  private startGlobalHeartbeatMonitor(): void {
    if (this.globalHeartbeatMonitorInterval) {
      clearInterval(this.globalHeartbeatMonitorInterval);
    }

    console.log('[8.8.5][HEARTBEAT] Starting global heartbeat monitor (1 Hz)');
    this.lastGlobalHeartbeat = Date.now();
    this.lastMessageTime = Date.now();

    this.globalHeartbeatMonitorInterval = setInterval(() => {
      const now = Date.now();
      const messageAgeMs = now - this.lastMessageTime;
      
      // Phase 8.8.5: Check for stale connection (no messages in 45s)
      // This is more lenient than checking heartbeat specifically because:
      // 1. Kraken only sends heartbeats when there are active subscriptions
      // 2. During idle periods, we rely on pings/pongs to keep connection alive
      if (messageAgeMs > this.CONNECTION_LIVENESS_TIMEOUT_MS) {
        console.warn(`[8.8.5][HEARTBEAT] No messages in ${messageAgeMs}ms (threshold: ${this.CONNECTION_LIVENESS_TIMEOUT_MS}ms), triggering reconnect`);
        this.reconnectWithBackoff();
        return;
      }
      
      // Send keep-alive ping if no messages received in 20s
      if (messageAgeMs > this.PING_INACTIVITY_MS) {
        this.sendKeepalivePing();
      }
    }, this.GLOBAL_HEARTBEAT_CHECK_MS);
  }

  /**
   * Phase 8.8.5: Stop global heartbeat monitor
   */
  private stopGlobalHeartbeatMonitor(): void {
    if (this.globalHeartbeatMonitorInterval) {
      clearInterval(this.globalHeartbeatMonitorInterval);
      this.globalHeartbeatMonitorInterval = null;
      console.log('[8.8.5][HEARTBEAT] Stopped global heartbeat monitor');
    }
  }

  /**
   * Phase 8.8.5: Send keep-alive ping to prevent proxy disconnection
   */
  private sendKeepalivePing(): void {
    if (!this.ws || !this.isConnected) return;
    
    try {
      // B78.2: ping uses v2 format. Pre-B78.2 sent {event:'ping'} (v1 envelope) to
      // the v2 endpoint, which Kraken rejected every 20s (PING_INACTIVITY_MS) with
      // a generic "Method(s) not found" labeled as method:"subscribe" (Kraken's
      // default rejection echo when shape is unrecognizable). Triggered the
      // 142,079 historical rejection log lines. v2 ping is {method:'ping'} per
      // https://docs.kraken.com/api/docs/websocket-v2/ping
      const pingMessage = JSON.stringify({ method: 'ping' });
      this.ws.send(pingMessage);
      console.log('[8.8.5][PING] Sent keep-alive ping (v2 format)');
    } catch (error) {
      console.error('[8.8.5][PING] Failed to send keep-alive:', error);
    }
  }

  /**
   * Phase 8.8.5: Reconnect with exponential backoff
   */
  private reconnectWithBackoff(): void {
    const delay = Math.min(
      this.BASE_RECONNECT_DELAY_MS * Math.pow(2, this.reconnectRetries),
      this.MAX_RECONNECT_DELAY_BACKOFF_MS
    );
    
    console.warn(`[8.8.5][RECONNECT] Reconnecting in ${delay}ms (attempt ${this.reconnectRetries + 1})`);
    
    this.stopGlobalHeartbeatMonitor();
    this.stopHealthMetricsLogger();
    
    if (this.ws) {
      try {
        this.ws.close(4001, 'Heartbeat timeout - reconnecting');
      } catch (e) {
        // Ignore close errors
      }
    }
    
    this.isConnected = false;
    this.isConnecting = false;
    this.i8cIsReconnecting = true;
    this.reconnectRetries++;
    
    setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Phase 8.8.5: Start tier-aware channel watchdog for a symbol
   * Uses VolumeClassifier to determine appropriate timeouts
   */
  startChannelWatchdog(symbol: string): void {
    const normalizedSymbol = normalizeToInternalSymbol(symbol);
    
    // Clear existing watchdog for this symbol
    this.stopChannelWatchdog(normalizedSymbol);
    
    const tier = volumeClassifier.getTier(normalizedSymbol);
    const thresholds = TIER_THRESHOLDS[tier];
    
    console.log(`[8.8.5][WATCHDOG] Starting watchdog for ${normalizedSymbol} (tier=${tier}, reset=${thresholds.resetTimeoutMs}ms)`);
    
    const timer = setTimeout(() => {
      this.handleChannelTimeout(normalizedSymbol, tier);
    }, thresholds.resetTimeoutMs);
    
    this.channelWatchdogTimers.set(normalizedSymbol, timer);
  }

  /**
   * Phase 8.8.5: Stop channel watchdog for a symbol
   */
  stopChannelWatchdog(symbol: string): void {
    const timer = this.channelWatchdogTimers.get(symbol);
    if (timer) {
      clearTimeout(timer);
      this.channelWatchdogTimers.delete(symbol);
    }
  }

  /**
   * Phase 8.8.5: Reset channel watchdog when tick is received
   */
  resetChannelWatchdog(symbol: string): void {
    const normalizedSymbol = normalizeToInternalSymbol(symbol);
    if (this.channelWatchdogTimers.has(normalizedSymbol)) {
      this.startChannelWatchdog(normalizedSymbol);
    }
  }

  /**
   * Phase 8.8.5: Handle channel timeout - refresh single channel without full reconnect
   */
  private handleChannelTimeout(symbol: string, tier: VolumeTier): void {
    console.log(`[8.8.5][WATCHDOG] Channel timeout for ${symbol} (tier=${tier}), refreshing subscription`);
    this.sentinelResets++;
    
    // Refresh single channel
    this.refreshChannel(symbol);
  }

  /**
   * Phase 8.8.5: Refresh a single channel subscription without full reconnect
   */
  refreshChannel(symbol: string): void {
    const normalizedSymbol = normalizeToInternalSymbol(symbol);
    
    console.log(`[8.8.5][REFRESH] Refreshing channel for ${normalizedSymbol}`);
    
    // Unsubscribe and resubscribe to refresh the channel
    this.unsubscribeFromSymbols([normalizedSymbol]);
    
    setTimeout(() => {
      this.subscribeToSymbols([normalizedSymbol]);
      this.startChannelWatchdog(normalizedSymbol);
    }, 500); // Small delay between unsub/sub
  }

  /**
   * Phase 8.8.5: Start health metrics logger (60-second interval)
   */
  private startHealthMetricsLogger(): void {
    if (this.healthMetricsLoggerInterval) {
      clearInterval(this.healthMetricsLoggerInterval);
    }

    console.log('[8.8.5][HEALTH] Starting health metrics logger (60s interval)');
    this.startTime = Date.now();

    this.healthMetricsLoggerInterval = setInterval(() => {
      this.logHealthMetrics();
    }, 60000); // Every 60 seconds
  }

  /**
   * Phase 8.8.5: Stop health metrics logger
   */
  private stopHealthMetricsLogger(): void {
    if (this.healthMetricsLoggerInterval) {
      clearInterval(this.healthMetricsLoggerInterval);
      this.healthMetricsLoggerInterval = null;
      console.log('[8.8.5][HEALTH] Stopped health metrics logger');
    }
  }

  /**
   * Phase 8.8.5: Log health metrics to file and console
   */
  private logHealthMetrics(): void {
    const uptimeMs = Date.now() - this.startTime;
    const uptimeMinutes = Math.floor(uptimeMs / 60000);
    
    const avgLatency = this.heartbeatLatencies.length > 0
      ? Math.round(this.heartbeatLatencies.reduce((a, b) => a + b, 0) / this.heartbeatLatencies.length)
      : 0;

    const healthLog = `[Health Audit]
- Uptime: ${uptimeMinutes} minutes
- Sentinel Resets: ${this.sentinelResets}
- Heartbeat Latency: ${avgLatency}ms
- REST Fallbacks Blocked: ${this.restFallbacksBlocked}
- REST Fallbacks Allowed: ${this.restFallbacksAllowed}
- Subscribed Symbols: ${this.subscribedSymbols.size}
- Connected: ${this.isConnected}
- Timestamp: ${new Date().toISOString()}
`;

    console.log('[8.8.5]' + healthLog);

    // Write to log file
    this.appendToHealthLog(healthLog);
  }

  /**
   * Phase 8.8.5: Append health metrics to rolling log file
   */
  private appendToHealthLog(content: string): void {
    try {
      const logDir = '/tmp/logs';
      const logFile = `${logDir}/websocket_health.log`;
      
      // Ensure directory exists
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      
      // Check if log file needs rotation (>1MB)
      if (fs.existsSync(logFile)) {
        const stats = fs.statSync(logFile);
        if (stats.size > 1024 * 1024) { // 1MB
          const rotatedFile = `${logDir}/websocket_health_${Date.now()}.log`;
          fs.renameSync(logFile, rotatedFile);
          console.log(`[8.8.5][HEALTH] Rotated log file to ${rotatedFile}`);
        }
      }
      
      fs.appendFileSync(logFile, content + '\n---\n');
    } catch (error) {
      console.error('[8.8.5][HEALTH] Failed to write health log:', error);
    }
  }

  /**
   * Phase 8.8.5: Increment REST fallback blocked counter
   */
  incrementRestFallbackBlocked(): void {
    this.restFallbacksBlocked++;
  }

  /**
   * Phase 8.8.5: Increment REST fallback allowed counter
   */
  incrementRestFallbackAllowed(): void {
    this.restFallbacksAllowed++;
  }

  /**
   * Phase 8.8.5: Get current health metrics
   */
  getHealthMetrics(): {
    uptimeMinutes: number;
    sentinelResets: number;
    avgHeartbeatLatency: number;
    restFallbacksBlocked: number;
    restFallbacksAllowed: number;
    subscribedSymbols: number;
    isConnected: boolean;
    channelWatchdogs: number;
  } {
    const uptimeMs = Date.now() - this.startTime;
    const avgLatency = this.heartbeatLatencies.length > 0
      ? Math.round(this.heartbeatLatencies.reduce((a, b) => a + b, 0) / this.heartbeatLatencies.length)
      : 0;

    return {
      uptimeMinutes: Math.floor(uptimeMs / 60000),
      sentinelResets: this.sentinelResets,
      avgHeartbeatLatency: avgLatency,
      restFallbacksBlocked: this.restFallbacksBlocked,
      restFallbacksAllowed: this.restFallbacksAllowed,
      subscribedSymbols: this.subscribedSymbols.size,
      isConnected: this.isConnected,
      channelWatchdogs: this.channelWatchdogTimers.size
    };
  }

  /**
   * Phase 8.8.5: Reset health metrics (for testing)
   */
  resetHealthMetrics(): void {
    this.sentinelResets = 0;
    this.heartbeatLatencies = [];
    this.restFallbacksBlocked = 0;
    this.restFallbacksAllowed = 0;
    this.startTime = Date.now();
    console.log('[8.8.5][HEALTH] Reset health metrics');
  }

  /**
   * Directive 8.9.5: Get latest bid/ask/mid from mini-book for integrity monitoring
   */
  getLatestPriceData(symbol: string): { bid: number; ask: number; mid: number } | null {
    const book = this.orderBooks.get(symbol);
    if (!book || book.bids.size === 0 || book.asks.size === 0) {
      return null;
    }
    
    const bestBid = Math.max(...book.bids.keys());
    const bestAsk = Math.min(...book.asks.keys());
    
    if (bestBid <= 0 || bestAsk <= 0) {
      return null;
    }
    
    return {
      bid: bestBid,
      ask: bestAsk,
      mid: (bestBid + bestAsk) / 2
    };
  }

  /**
   * P19-B4b.1: fill-grade order-book accessor for the depth-walked paper fill +
   * the 24/5 depth-sufficiency gate. Returns the full mini-book as sorted level
   * arrays (asks ascending / bids descending = best-first, the order `walkBook`
   * consumes) plus the book's age in ms (book-specific freshness for the warmth
   * gate). Returns `null` when no two-sided book exists yet (caller fails-closed).
   */
  getBookForFill(symbol: string): {
    asks: Array<{ price: number; qty: number }>;
    bids: Array<{ price: number; qty: number }>;
    ageMs: number;
  } | null {
    const book = this.orderBooks.get(symbol);
    const updatedAt = this.bookUpdatedAt.get(symbol);
    if (!book || updatedAt === undefined || book.asks.size === 0 || book.bids.size === 0) {
      return null;
    }
    const asks = [...book.asks.entries()]
      .filter(([p, q]) => p > 0 && q > 0)
      .sort((a, b) => a[0] - b[0])
      .map(([price, qty]) => ({ price, qty }));
    const bids = [...book.bids.entries()]
      .filter(([p, q]) => p > 0 && q > 0)
      .sort((a, b) => b[0] - a[0])
      .map(([price, qty]) => ({ price, qty }));
    if (asks.length === 0 || bids.length === 0) return null;
    return { asks, bids, ageMs: Date.now() - updatedAt };
  }

  /**
   * Directive 8.9.5: Soft resubscribe for integrity monitor
   * Clears all per-symbol state and resubscribes without disconnecting WebSocket
   */
  /**
   * #507 (Langston, hotfix gate): the observe-only checksum and crossed-book counters, readable
   * on demand rather than inferred from a rotated log. Cumulative since process start, with the
   * start stamp and uptime attached SO THE DENOMINATOR TRAVELS WITH THE NUMBER.
   *
   * ⚠️ PRE-REGISTERED READING, so a high mismatch rate is not misread as the fix failing:
   * MISMATCH IS THE EXPECTED RESULT TODAY. Kraken sends price/qty as JSON numbers, so
   * `String(qty)` cannot reconstruct the CRC input (measured: 0/40 match live, 40/40 once
   * formatted at instrument precision). The v2 `instrument` channel is NOT subscribed -- see the
   * subscribe payloads in this file: `ticker` and `book` only. (An earlier version cited 'zero
   * instrument messages in a 3,000-line log window'. Langston: a tautology in a measurement's
   * clothes -- a log window cannot separate NOT SUBSCRIBED from SUBSCRIBED-BUT-SILENT, so that
   * zero was structurally guaranteed. A presence-check on the subscribe payload reads one way.)
   * ⇒ this counter GAUGES THE PRECISION GAP, NOT BOOK INTEGRITY.
   * ★ The INTEGRITY signal is `crossedDetections`, which must be 0. Pre-fix comparator,
   *   measured live by replicating the old handler: 32.03% of book states crossed.
   * ★ `matches` is the POSITIVE CONTROL for `mismatches`: a zero mismatch count is unreadable
   *   without evidence the branch executed at all. `attempts` proves invocation either way.
   */
  getBookIntegrityCounters(): {
    since: string; uptimeMs: number;
    totals: { updatesApplied: number; checksumAttempts: number; matches: number; mismatches: number; crossedDetections: number };
    bySymbol: Array<{ symbol: string; updatesApplied: number; attempts: number; matches: number; mismatches: number; crossedDetections: number }>;
    note: string;
  } {
    const syms = new Set<string>([
      ...this.bookUpdatesApplied.keys(), ...this.bookChecksumAttempts.keys(),
      ...this.bookChecksumMatches.keys(), ...this.bookChecksumMismatches.keys(),
      ...this.bookCrossedDetections.keys(),
    ]);
    const g = (m: Map<string, number>, k: string) => m.get(k) ?? 0;
    const bySymbol = [...syms].sort().map((symbol) => ({
      symbol,
      updatesApplied: g(this.bookUpdatesApplied, symbol),
      attempts: g(this.bookChecksumAttempts, symbol),
      matches: g(this.bookChecksumMatches, symbol),
      mismatches: g(this.bookChecksumMismatches, symbol),
      crossedDetections: g(this.bookCrossedDetections, symbol),
    }));
    const sum = (f: (r: typeof bySymbol[number]) => number) => bySymbol.reduce((a, r) => a + f(r), 0);
    return {
      since: new Date(this.bookCountersSince).toISOString(),
      uptimeMs: Date.now() - this.bookCountersSince,
      totals: {
        updatesApplied: sum(r => r.updatesApplied), checksumAttempts: sum(r => r.attempts),
        matches: sum(r => r.matches), mismatches: sum(r => r.mismatches),
        crossedDetections: sum(r => r.crossedDetections),
      },
      bySymbol,
      note: 'MISMATCH IS EXPECTED until the v2 instrument precision feed lands (#507 remainder): Kraken sends price/qty as JSON numbers and String() cannot reconstruct the CRC input. The INTEGRITY signal here is crossedDetections, which must be 0 (pre-fix comparator, measured live: 32.03% of book states crossed).',
    };
  }

  /** #507: keep only the best `depth` levels per side. Kraken never sends deletes for levels that
   *  fall out of the subscribed window, so the client MUST do this after every update. */
  private truncateBook(
    book: { bids: Map<number, number>; asks: Map<number, number> },
    raw: { bids: Map<number, [string, string]>; asks: Map<number, [string, string]> },
    depth: number,
  ): void {
    if (book.bids.size > depth) {
      const keep = new Set([...book.bids.keys()].sort((x, y) => y - x).slice(0, depth));
      for (const p of [...book.bids.keys()]) if (!keep.has(p)) { book.bids.delete(p); raw.bids.delete(p); }
    }
    if (book.asks.size > depth) {
      const keep = new Set([...book.asks.keys()].sort((x, y) => x - y).slice(0, depth));
      for (const p of [...book.asks.keys()]) if (!keep.has(p)) { book.asks.delete(p); raw.asks.delete(p); }
    }
  }

  /** #507: Kraken's documented v2 book checksum. Top-10 asks (price ascending) then top-10 bids
   *  (price descending); per level, price then qty with the decimal point removed and leading
   *  zeros stripped; concatenate; CRC32 as unsigned 32-bit. Verified against the official worked
   *  example (expected 3310070434) in the unit test. Static so the test can reach it. */
  static computeBookChecksumFromRaw(
    raw: { bids: Map<number, [string, string]>; asks: Map<number, [string, string]> },
    prec?: { price: number; qty: number },
  ): number {
    // Kraken computes the CRC over the STRING form at the instrument's own precision. The wire
    // sends JSON numbers, so the trailing zeros are already gone by the time we see them --
    // `2993` must become `2993.00000` before the decimal point is stripped, or the input differs
    // from Kraken's by exactly the zeros JSON.parse discarded. When `prec` is absent we fall back
    // to the raw string, which is what the official worked example supplies (already formatted).
    const fmtWith = (v: string, dp: number | undefined) =>
      (dp === undefined ? v : Number(v).toFixed(dp)).replace('.', '').replace(/^0+/, '');
    const fmtP = (v: string) => fmtWith(v, prec?.price);
    const fmtQ = (v: string) => fmtWith(v, prec?.qty);
    const asks = [...raw.asks.entries()].sort((x, y) => x[0] - y[0]).slice(0, 10);
    const bids = [...raw.bids.entries()].sort((x, y) => y[0] - x[0]).slice(0, 10);
    let str = '';
    for (const [, [p, q]] of asks) str += fmtP(p) + fmtQ(q);
    for (const [, [p, q]] of bids) str += fmtP(p) + fmtQ(q);
    return zlibCrc32(str) >>> 0;
  }
  private computeBookChecksum(
    raw: { bids: Map<number, [string, string]>; asks: Map<number, [string, string]> },
    prec?: { price: number; qty: number },
  ): number {
    return KrakenWebSocketAdapter.computeBookChecksumFromRaw(raw, prec);
  }

  async softResubscribe(symbol: string): Promise<void> {
    console.log(`[8.9.5][SOFT_RESUB] Starting soft resubscribe for ${symbol}`);
    
    // Clear ALL per-symbol state to ensure clean resync
    this.orderBooks.delete(symbol);
    this.bookRaw.delete(symbol); // #507: the raw mirror must go with it
    this.symbolStats.delete(symbol);
    this.pendingSubscriptions.delete(symbol);
    this.subscriptionAcks.delete(symbol);
    this.firstTickReceived.delete(symbol);
    this.firstTickReceived.delete(symbol + '_book');
    this.tickFrequencyData.delete(symbol);
    this.lastBroadcastTime.delete(symbol);
    
    console.log(`[8.9.5][SOFT_RESUB] Cleared all state for ${symbol}`);
    
    // Use the existing unsubscribe helper for proper handling
    this.unsubscribeFromSymbols([symbol]);
    
    // Also unsubscribe from book channel (unsubscribeFromSymbols only does ticker)
    const krakenSymbol = this.normalToKrakenSymbol(symbol);
    if (krakenSymbol && this.isConnected) {
      const bookUnsub = {
        method: 'unsubscribe',
        params: { channel: 'book', symbol: [krakenSymbol], depth: 10 }
      };
      try {
        this.ws?.send(JSON.stringify(bookUnsub));
        console.log(`[8.9.5][SOFT_RESUB] Unsubscribed ${symbol} from book channel`);
      } catch (err: any) {
        console.error(`[8.9.5][SOFT_RESUB] Book unsubscribe error:`, err?.message);
      }
    }
    
    // Wait before resubscribing to allow cleanup
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Resubscribe using the existing helper (subscribes to both ticker+book)
    this.subscribeToSymbols([symbol]);
    console.log(`[8.9.5][SOFT_RESUB] Resubscribed ${symbol}`);
  }

  // ==========================================
  // Directive 9.0.A: Safe Heartbeat Monitor
  // ==========================================

  /**
   * Directive 9.0.A: Start 9.0 heartbeat monitor (15s check interval)
   * Triggers safe resubscribe if feed stalls >60s
   */
  start90HeartbeatMonitor(): void {
    if (this.heartbeat90Interval) {
      clearInterval(this.heartbeat90Interval);
    }

    console.log('[9.0][HEARTBEAT] Starting 9.0 heartbeat monitor (15s interval, 60s timeout)');
    this.lastHeartbeat = Date.now();

    this.heartbeat90Interval = setInterval(() => {
      const delta = Date.now() - this.lastHeartbeat;
      
      // Log heartbeat status
      console.log(`[9.0][HEARTBEAT] WebSocket heartbeat received at ${new Date().toISOString()}`);
      
      if (delta > this.HEARTBEAT_90_TIMEOUT_MS) {
        this.missedHeartbeats++;
        console.warn(`[9.0][HEARTBEAT] Missed heartbeat (>${this.HEARTBEAT_90_TIMEOUT_MS / 1000}s). Triggering Safe Resubscribe...`);
        console.log(`[9.0][HEALTH] Missed heartbeat detected (count: ${this.missedHeartbeats})`);
        this.softResubscribeAll();
      }
    }, this.HEARTBEAT_90_CHECK_MS);
  }

  /**
   * Directive 9.0.A: Stop 9.0 heartbeat monitor
   */
  stop90HeartbeatMonitor(): void {
    if (this.heartbeat90Interval) {
      clearInterval(this.heartbeat90Interval);
      this.heartbeat90Interval = null;
      console.log('[9.0][HEARTBEAT] Stopped 9.0 heartbeat monitor');
    }
  }

  /**
   * Directive 9.0.A: Handle heartbeat message (call on any valid message)
   */
  private handleHeartbeatMessage(): void {
    this.lastHeartbeat = Date.now();
  }

  /**
   * Directive 9.0.A: Safe Resubscribe All - clears volatile state before reconnecting
   * Critical from Directive 8.9.5: includes state clearing
   */
  async softResubscribeAll(): Promise<void> {
    console.warn('[9.0] Triggering Safe Resubscribe...');
    this.resubscribeEvents++;

    // 1. Force Close WebSocket
    if (this.ws) {
      try {
        this.ws.close(4090, 'Safe resubscribe - heartbeat timeout');
      } catch (e) {
        // Ignore close errors
      }
    }

    // 2. CLEAR ALL VOLATILE STATE (Critical from Directive 8.9.5)
    this.orderBooks.clear();
    this.symbolStats.clear();
    this.firstTickReceived.clear();
    this.tickFrequencyData.clear();
    this.lastBroadcastTime.clear();
    this.subscriptionAcks.clear();
    
    console.log('[9.0][HEALTH] Cleared all volatile state for safe resubscribe');

    // 3. Mark as reconnecting
    this.isConnected = false;
    this.isConnecting = false;
    this.i8cIsReconnecting = true;

    // 4. Reconnect after short delay (3s per directive)
    const symbolsToResubscribe = Array.from(this.subscribedSymbols);
    this.subscribedSymbols.clear();
    this.pendingSubscriptions.clear();

    setTimeout(async () => {
      console.log(`[9.0][HEALTH] Reconnecting with ${symbolsToResubscribe.length} symbols...`);
      await this.connect();
      
      // Wait for connection to establish
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      if (this.isConnected && symbolsToResubscribe.length > 0) {
        this.subscribeToSymbols(symbolsToResubscribe);
        console.log(`[9.0][HEALTH] Resubscribed to ${symbolsToResubscribe.length} symbols`);
      }
    }, 3000);
  }

  /**
   * Directive 9.0.A: Get 9.0 health metrics
   */
  get90HealthMetrics(): { missedHeartbeats: number; resubscribeEvents: number; lastHeartbeat: Date } {
    return {
      missedHeartbeats: this.missedHeartbeats,
      resubscribeEvents: this.resubscribeEvents,
      lastHeartbeat: new Date(this.lastHeartbeat)
    };
  }
}

export const krakenWebSocketAdapter = new KrakenWebSocketAdapter();
