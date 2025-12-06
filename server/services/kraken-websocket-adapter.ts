import WebSocket from 'ws';
import { contextBridge } from './context-bridge.js';
import { livePricingAdapter } from './live-pricing-adapter.js';
import { krakenPairMetadataService } from './kraken-pair-metadata-service.js';

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
      this.pendingSubscriptions.clear();
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
          console.log(`[${this.MODULE_NAME}] Subscribed to ${channelName} for ${pair}`);
          const normalized = this.krakenToNormalSymbol(pair);
          this.subscribedSymbols.add(normalized);
        } else if (status === 'error') {
          console.error(`[${this.MODULE_NAME}] Subscription error for ${pair}: ${errorMessage}`);
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
      const normalizedSymbol = this.krakenToNormalSymbol(pair);
      const now = Date.now();
      
      const lastPrice = parseFloat(ticker.c[0]);
      const bid = parseFloat(ticker.b[0]);
      const ask = parseFloat(ticker.a[0]);
      
      if (isNaN(lastPrice) || lastPrice <= 0) {
        console.warn(`[${this.MODULE_NAME}] Invalid price for ${normalizedSymbol}: ${ticker.c[0]}`);
        return;
      }
      
      const stats = this.symbolStats.get(normalizedSymbol) || {
        lastUpdate: 0,
        updateCount: 0,
        intervals: []
      };
      
      const intervalMs = stats.lastUpdate > 0 ? now - stats.lastUpdate : 0;
      stats.intervals.push(intervalMs);
      if (stats.intervals.length > 100) stats.intervals.shift();
      stats.lastUpdate = now;
      stats.updateCount++;
      this.symbolStats.set(normalizedSymbol, stats);
      
      const logEntry: PriceTickLog = {
        symbol: normalizedSymbol,
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
      
      // Phase 8.8.3-B3.6: Update LivePricingAdapter cache with WebSocket price
      livePricingAdapter.updateFromWebSocket(normalizedSymbol, lastPrice, 'kraken_ws');
      
      this.throttledBroadcast(normalizedSymbol, lastPrice, bid, ask);
      
    } catch (error) {
      console.error(`[${this.MODULE_NAME}] Error processing ticker update:`, error);
    }
  }

  private async throttledBroadcast(symbol: string, price: number, bid: number, ask: number): Promise<void> {
    const now = Date.now();
    const lastBroadcast = this.lastBroadcastTime.get(symbol) || 0;
    
    if (now - lastBroadcast < this.BROADCAST_THROTTLE_MS) {
      return;
    }
    
    this.lastBroadcastTime.set(symbol, now);
    
    try {
      await contextBridge.broadcast({
        type: 'price_updated',
        payload: {
          symbol,
          price,
          bid,
          ask,
          timestamp: new Date().toISOString(),
          source: 'kraken_ws'
        }
      });
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
    const krakenSymbols = symbols
      .map(s => this.normalToKrakenSymbol(s))
      .filter(s => s !== null) as string[];
    
    if (krakenSymbols.length === 0) return;
    
    if (!this.isConnected) {
      symbols.forEach(s => this.pendingSubscriptions.add(s));
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
      
      // Phase 8.8.3-B9.FIX-WS-START: Diagnostic log after subscription update
      console.log('[DEBUG-B9][KrakenWS][SUBSCRIPTIONS_UPDATED]', {
        newSymbols: symbols,
        allSubscribed: Array.from(this.subscribedSymbols),
        pendingCount: this.pendingSubscriptions.size,
      });
    } catch (error) {
      console.error(`[${this.MODULE_NAME}] Subscribe error:`, error);
    }
  }

  unsubscribeFromSymbols(symbols: string[]): void {
    const krakenSymbols = symbols
      .map(s => this.normalToKrakenSymbol(s))
      .filter(s => s !== null) as string[];
    
    if (krakenSymbols.length === 0 || !this.isConnected) return;
    
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
      console.log(`[${this.MODULE_NAME}] Unsubscribed from ${krakenSymbols.length} symbols`);
    } catch (error) {
      console.error(`[${this.MODULE_NAME}] Unsubscribe error:`, error);
    }
  }

  private normalToKrakenSymbol(symbol: string): string | null {
    // Phase 8.8.3: Use KrakenPairMetadataService for deterministic normalization
    const canonical = krakenPairMetadataService.getCanonicalKrakenSymbol(symbol);
    
    if (canonical) {
      // Successfully normalized
      this.unrecognizedSymbols.delete(symbol);
      return canonical;
    }
    
    // Fallback: Legacy hardcoded mapping for critical symbols
    // This ensures basic functionality even if metadata service hasn't loaded
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
      'TRX/USD': 'TRX/USD'
    };
    
    if (legacyMapping[symbol]) {
      return legacyMapping[symbol];
    }
    
    // If symbol already has a slash and wasn't found, try passthrough
    if (symbol.includes('/')) {
      const [base, quote] = symbol.split('/');
      if (base === 'BTC') return `XBT/${quote}`;
      // Return the symbol as-is for passthrough (Kraken may accept it)
      return symbol;
    }
    
    // Symbol is unrecognized - track it
    console.warn('[SYM][UNRECOGNIZED_FOR_WS]', {
      internalSymbol: symbol,
      context: 'normalToKrakenSymbol',
      metadataLoaded: krakenPairMetadataService.isMetadataLoaded(),
    });
    this.unrecognizedSymbols.add(symbol);
    
    return null;
  }

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
}

export const krakenWebSocketAdapter = new KrakenWebSocketAdapter();
