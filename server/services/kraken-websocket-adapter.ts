import WebSocket from 'ws';
import { contextBridge } from './context-bridge.js';
import { livePricingAdapter } from './live-pricing-adapter.js';
import { krakenPairMetadataService } from './kraken-pair-metadata-service.js';
import { resolveByKrakenWsPair, normalizeToInternalSymbol } from '../markets/kraken-symbol-resolver.js';
import { priceTraceService } from './price-trace-service.js';

/**
 * Phase 8.8.3-B3.6: Kraken WebSocket Price Engine
 * 
 * Connects to Kraken's Spot WebSocket feed for real-time ticker updates.
 * Replaces REST-based price fetching for open trade monitoring.
 * 
 * Features:
 * - Real-time ticker subscriptions via wss://ws.kraken.com
 * - Dynamic symbol subscription management
 * - Automatic reconnection with exponential backoff
 * - Price cache integration with LivePricingAdapter
 * - WebSocket broadcasts to connected clients
 * - Diagnostic logging for price cadence verification
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

export class KrakenWebSocketAdapter {
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
  
  // Phase 8.8.3-I7-WS-A: Diagnostic tracking for subscription and tick flow audit
  private firstTickReceived: Set<string> = new Set(); // Track which symbols have received first tick
  private subscriptionAcks: Map<string, { acked: boolean; timestamp: number }> = new Map();
  private subscriptionRequests: Map<string, { krakenWsPair: string; internalSymbol: string; timestamp: number }> = new Map();
  private unmappedTicks: Map<string, { count: number; lastSeen: number }> = new Map(); // Track unmapped tick events for gap reporting
  
  // Phase 8.8.3-I7-WS-F: Subscription health monitoring
  private subscriptionHealthInterval: NodeJS.Timeout | null = null;
  private readonly ACK_TIMEOUT_MS = 5000; // 5 seconds without ACK
  private readonly NO_TICK_TIMEOUT_MS = 10000; // 10 seconds without tick after ACK
  
  // Phase 8.8.3-I4 B4: Periodic price tick health logging
  private priceTickHealthInterval: NodeJS.Timeout | null = null;
  private openPositionSymbolsProvider: (() => string[] | Promise<string[]>) | null = null;
  
  private readonly WS_URL = 'wss://ws.kraken.com';
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

  constructor() {
    console.log(`[${this.MODULE_NAME}] Kraken WebSocket Adapter initialized`);
  }

  async start(): Promise<void> {
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
    this.isConnected = true;
    this.isConnecting = false;
    this.reconnectAttempts = 0;
    this.lastPongTime = Date.now();
    
    this.startHeartbeat();
    
    if (this.pendingSubscriptions.size > 0) {
      console.log(`[${this.MODULE_NAME}] Subscribing to ${this.pendingSubscriptions.size} pending symbols`);
      this.subscribeToSymbols(Array.from(this.pendingSubscriptions));
      // Phase 8.8.3-I7-WS-A: Do NOT clear pendingSubscriptions here - wait for ACK in handleSystemMessage()
      // Premature clearing prevents detection of pending-ACK state in diagnostics
    }
    
    if (this.subscribedSymbols.size > 0) {
      console.log(`[${this.MODULE_NAME}] Resubscribing to ${this.subscribedSymbols.size} symbols after reconnect`);
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
    try {
      const message = JSON.parse(data.toString());
      
      if (message.event) {
        this.handleSystemMessage(message);
        return;
      }
      
      if (Array.isArray(message) && message.length >= 4) {
        this.handleTickerUpdate(message);
      }
      
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

  private handleTickerUpdate(message: any[]): void {
    const [channelId, tickerData, channelName, pair] = message;
    
    if (channelName !== 'ticker' || !tickerData) return;
    
    try {
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
      
      const stats = this.symbolStats.get(internalSymbol) || {
        lastUpdate: 0,
        updateCount: 0,
        intervals: [],
        firstUpdate: now // Phase 8.8.3-I4: Track first tick time
      };
      
      const intervalMs = stats.lastUpdate > 0 ? now - stats.lastUpdate : 0;
      stats.intervals.push(intervalMs);
      if (stats.intervals.length > 100) stats.intervals.shift();
      stats.lastUpdate = now;
      stats.updateCount++;
      // Phase 8.8.3-I4: Ensure firstUpdate is set on first tick
      if (stats.firstUpdate === 0) stats.firstUpdate = now;
      this.symbolStats.set(internalSymbol, stats);
      
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
      
      // Phase 8.8.3-I7-WS-A (A3): Log first tick received for each pair (only once)
      if (!this.firstTickReceived.has(internalSymbol)) {
        this.firstTickReceived.add(internalSymbol);
        console.log(`[I7-WS-A][FIRST_TICK] kraken_ws_pair=${pair} internal_symbol=${internalSymbol} price=${lastPrice}`);
      }
      
      // Phase 8.8.4: Update LivePricingAdapter cache with properly normalized symbol
      // Phase 8.8.3-I7-WS-C: Pass trace ID for Stage 3 logging
      // Phase 8.8.3-I7-WS-D: updateFromWebSocket now handles both cache update AND broadcast
      // This ensures 1:1 Stage-3 → Stage-4 parity (D3)
      livePricingAdapter.updateFromWebSocket(internalSymbol, lastPrice, 'kraken_ws', traceId);
      
      // Phase 8.8.3-I6: Diagnostic logging to confirm WS -> cache pipeline
      console.log(`[I6][WS_CACHE_UPDATE] symbol=${internalSymbol} price=${lastPrice} timestamp=${new Date().toISOString()}`);
      
      // Phase 8.8.3-I7-WS-D: REMOVED duplicate throttledBroadcast call
      // Broadcasts are now handled inside LivePricingAdapter.updateFromWebSocket() to ensure 1:1 parity
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
    
    // Phase 8.8.3-I6-FIX: Get current trading mode from LivePricingAdapter
    const currentMode = livePricingAdapter.getTradingMode();
    
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
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }

  subscribeToSymbols(symbols: string[]): void {
    // Phase 8.8.3-I6-FIX: Enhanced diagnostic logging for subscription audit
    console.log(`[8.8.3-I6-FIX][WS_SUB_REQUEST] internalSymbols=${JSON.stringify(symbols)}`);
    
    const krakenSymbols = symbols
      .map(s => this.normalToKrakenSymbol(s))
      .filter(s => s !== null) as string[];
    
    // Phase 8.8.3-I6-FIX: Log symbol format mapping
    console.log(`[8.8.3-I6-FIX][WS_SUB_MAPPED] krakenSymbols=${JSON.stringify(krakenSymbols)} (mapped from ${symbols.length} internal symbols)`);
    
    // Phase 8.8.3-I7-WS-A (A1): Log subscription request with resolver-normalized internal symbol
    for (let i = 0; i < symbols.length; i++) {
      const internalSymbol = symbols[i];
      const krakenWsPair = krakenSymbols[i] || 'unmapped';
      const normalizedInternal = normalizeToInternalSymbol(internalSymbol);
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
      symbols.forEach(s => this.pendingSubscriptions.add(s));
      console.log(`[8.8.3-I6-FIX][WS_SUB_QUEUED] queued=${symbols.length} (WS not connected)`);
      console.log(`[${this.MODULE_NAME}] Queued ${symbols.length} symbols for subscription (not connected)`);
      return;
    }
    
    const subscribeMessage = {
      event: 'subscribe',
      pair: krakenSymbols,
      subscription: {
        name: 'ticker'
      }
    };
    
    try {
      this.ws?.send(JSON.stringify(subscribeMessage));
      console.log(`[${this.MODULE_NAME}] Subscribing to ${krakenSymbols.length} symbols: ${krakenSymbols.slice(0, 5).join(', ')}${krakenSymbols.length > 5 ? '...' : ''}`);
      
      // Phase 8.8.3-I6-FIX: Enhanced diagnostic log after subscription update
      console.log('[8.8.3-I6-FIX][WS_SUB_SENT]', {
        sentSymbols: krakenSymbols,
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
    
    const unsubscribeMessage = {
      event: 'unsubscribe',
      pair: krakenSymbols,
      subscription: {
        name: 'ticker'
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
    // Phase 8.8.4: PRIORITY 1 - Use metadata service first (handles pairId like XXRPZUSD)
    // The metadata service maps pairId -> wsSymbol directly from Kraken's AssetPairs
    const canonical = krakenPairMetadataService.getCanonicalKrakenSymbol(symbol);
    
    if (canonical) {
      this.unrecognizedSymbols.delete(symbol);
      return canonical;
    }
    
    // Phase 8.8.4: PRIORITY 2 - Fallback legacy hardcoded mapping for critical symbols
    // This ensures basic functionality if metadata service hasn't loaded yet
    const legacyMapping: Record<string, string> = {
      'BTC/USD': 'XBT/USD',
      'ETH/USD': 'ETH/USD',
      'SOL/USD': 'SOL/USD',
      'XRP/USD': 'XRP/USD',
      'ADA/USD': 'ADA/USD',
      'DOGE/USD': 'DOGE/USD',
      'DOT/USD': 'DOT/USD',
      'AVAX/USD': 'AVAX/USD',
      'MATIC/USD': 'MATIC/USD',
      'LINK/USD': 'LINK/USD',
      'UNI/USD': 'UNI/USD',
      'LTC/USD': 'LTC/USD',
      'ATOM/USD': 'ATOM/USD',
      'SHIB/USD': 'SHIB/USD',
      'TRX/USD': 'TRX/USD',
      'STX/USD': 'STX/USD',
      'LDO/USD': 'LDO/USD',
      'SUI/USD': 'SUI/USD'
    };
    
    if (legacyMapping[symbol]) {
      this.unrecognizedSymbols.delete(symbol);
      return legacyMapping[symbol];
    }
    
    // Phase 8.8.4: PRIORITY 3 - If symbol already has a slash, try passthrough
    if (symbol.includes('/')) {
      const [base, quote] = symbol.split('/');
      if (base === 'BTC') {
        this.unrecognizedSymbols.delete(symbol);
        return `XBT/${quote}`;
      }
      this.unrecognizedSymbols.delete(symbol);
      return symbol;
    }
    
    // Phase 8.8.4: PRIORITY 4 - Convert internal DB format to WS format as last resort
    // This handles cases where metadata hasn't loaded but we have a DB symbol
    const wsFormat = this.convertInternalToWsFormat(symbol);
    if (wsFormat) {
      console.log(`[${this.MODULE_NAME}][SYMBOL_CONVERTED_FALLBACK]`, {
        original: symbol,
        wsFormat,
        metadataLoaded: krakenPairMetadataService.isMetadataLoaded(),
      });
      this.unrecognizedSymbols.delete(symbol);
      return wsFormat;
    }
    
    // Symbol is completely unrecognized - track it
    console.warn('[SYM][UNRECOGNIZED_FOR_WS]', {
      internalSymbol: symbol,
      context: 'normalToKrakenSymbol',
      metadataLoaded: krakenPairMetadataService.isMetadataLoaded(),
    });
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
   * Phase 8.8.3-I7: Map incoming Kraken WS pair to internal symbol
   * Uses the new canonical symbol resolver as PRIMARY source of truth.
   * 
   * Priority order for incoming WS ticks:
   * 1. Try I7 resolver (canonical mapping) - returns BASE/QUOTE format (e.g., AVAX/USD)
   * 2. Try metadata service getPairId() - returns DB format (e.g., XXRPZUSD)
   * 3. Try metadata service getInternalSymbol() - returns altname format (e.g., XRPUSD)
   * 4. Fallback to legacy string manipulation
   */
  private mapKrakenPairToInternalSymbol(krakenPair: string): string | null {
    // Phase 8.8.3-I7: FIRST try the canonical symbol resolver
    const i7Mapping = resolveByKrakenWsPair(krakenPair);
    if (i7Mapping) {
      console.log(`[I7][WS_MAP] krakenPair=${krakenPair} -> internal=${i7Mapping.internalSymbol}`);
      return i7Mapping.internalSymbol;
    }

    // Fallback 1: Try metadata service pairId (DB format like XXRPZUSD)
    const pairId = krakenPairMetadataService.getPairId(krakenPair);
    if (pairId) {
      // Try to normalize pairId through I7 resolver
      const normalized = normalizeToInternalSymbol(pairId);
      console.log(`[I7][WS_MAP_FALLBACK1] krakenPair=${krakenPair} -> pairId=${pairId} -> normalized=${normalized}`);
      return normalized;
    }

    // Fallback 2: Try metadata service altname format (like XRPUSD)
    const internalFromMetadata = krakenPairMetadataService.getInternalSymbol(krakenPair);
    if (internalFromMetadata) {
      const normalized = normalizeToInternalSymbol(internalFromMetadata);
      console.log(`[I7][WS_MAP_FALLBACK2] krakenPair=${krakenPair} -> altname=${internalFromMetadata} -> normalized=${normalized}`);
      return normalized;
    }

    // Fallback 3: Legacy krakenToNormalSymbol for safety
    const legacy = this.krakenToNormalSymbol(krakenPair);
    if (legacy) {
      if (!this.unrecognizedSymbols.has(krakenPair)) {
        console.log(`[${this.MODULE_NAME}][TICKER][I7_LEGACY_FALLBACK]`, {
          krakenPair,
          legacyResult: legacy,
          metadataLoaded: krakenPairMetadataService.isMetadataLoaded(),
        });
      }
      return legacy;
    }

    // Symbol is completely unrecognized
    console.warn('[I7][SYM_UNRECOGNIZED]', {
      internalSymbol: krakenPair,
      context: 'ticker_inbound',
      metadataLoaded: krakenPairMetadataService.isMetadataLoaded(),
    });
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
    const { getKrakenWsPair, getKrakenRestPair } = await import('../markets/kraken-symbol-resolver.js');
    
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
    const { getKrakenWsPair } = await import('../markets/kraken-symbol-resolver.js');
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
    const { getKrakenWsPair, resolveByInternalSymbol } = await import('../markets/kraken-symbol-resolver.js');
    
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
    const { getKrakenWsPair, getKrakenRestPair } = await import('../markets/kraken-symbol-resolver.js');
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
      
      let coverageStatus: 'subscribed' | 'pending' | 'missing' | 'unmappable';
      if (krakenWsPair === 'unknown' || krakenWsPair === normalizedInternal) {
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
}

export const krakenWebSocketAdapter = new KrakenWebSocketAdapter();
