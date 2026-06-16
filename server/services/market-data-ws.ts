/**
 * Directive 8.9.0-B: Secondary WebSocket Adapter (Analytics)
 * 
 * Upgraded to Kraken WebSocket v2 for consistent data with primary adapter.
 * Used by FeedIntegrityMonitor, MarketDataCoordinator, and SlippageFeeModel.
 */
import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { translateV2ToV1, isValidV2TickerUpdate } from './market-data/kraken-v2-translator.js';

export interface TickData {
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  timestamp: string;
  source: 'ws' | 'rest_fallback';
  bidVolume?: number;
  askVolume?: number;
}

export interface OrderBookSnapshot {
  symbol: string;
  bids: [number, number][]; // [price, volume]
  asks: [number, number][]; // [price, volume]
  timestamp: string;
}

interface WSConfig {
  url: string;
  heartbeatInterval: number;
  reconnectDelayBase: number;
  reconnectDelayMax: number;
  staleThresholdMs: number;
}

export class MarketDataWebSocket extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: WSConfig;
  private subscribedPairs: Set<string> = new Set();
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private lastTickTimestamp: number = 0;
  private isConnected = false;
  private reconnectCount = 0;
  
  // 8.9.4-Patch: Stateful mini-book tracking for stable mid-price computation
  private orderBooks = new Map<string, { bids: Map<number, number>; asks: Map<number, number> }>();
  private lastSeq: Record<string, number> = {};

  constructor(config?: Partial<WSConfig>) {
    super();
    this.config = {
      url: config?.url || 'wss://ws.kraken.com/v2', // 8.9.4: Production v2 endpoint with book channel
      heartbeatInterval: config?.heartbeatInterval || 30000,
      reconnectDelayBase: config?.reconnectDelayBase || 1000,
      reconnectDelayMax: config?.reconnectDelayMax || 30000,
      staleThresholdMs: config?.staleThresholdMs || 2000,
    };
  }

  public connect(): void {
    if (this.ws) {
      console.log('[MD-WS] Already connected or connecting');
      return;
    }

    console.log(`[MD-WS] Connecting to ${this.config.url}...`);
    this.ws = new WebSocket(this.config.url);

    this.ws.on('open', () => {
      console.log('[MD-WS] ✅ Connected to Kraken WebSocket');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      
      // Resubscribe to all previously subscribed pairs
      if (this.subscribedPairs.size > 0) {
        console.log(`[MD-WS] Resubscribing to ${this.subscribedPairs.size} pairs...`);
        this.subscribedPairs.forEach(pair => this.subscribeToPair(pair));
      }

      this.startHeartbeat();
      this.emit('connected');
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(message);
      } catch (error) {
        console.error('[MD-WS] Error parsing message:', error);
      }
    });

    this.ws.on('error', (error) => {
      console.error('[MD-WS] WebSocket error:', error);
      this.emit('error', error);
    });

    this.ws.on('close', () => {
      console.log('[MD-WS] Connection closed');
      this.isConnected = false;
      this.stopHeartbeat();
      this.ws = null;
      this.scheduleReconnect();
      this.emit('disconnected');
    });

    this.ws.on('pong', () => {
      // Heartbeat acknowledged
      this.lastTickTimestamp = Date.now();
    });
  }

  private handleMessage(message: any): void {
    // 8.9.0-B: Handle v2 Ticker Updates
    // v2 format: { channel: "ticker", type: "update"|"snapshot", data: [{symbol, bid, ask, ...}] }
    if (message && typeof message === 'object' && message.channel === 'ticker') {
      if (message.type === 'update' || message.type === 'snapshot') {
        const updates = message.data || [];
        for (const update of updates) {
          if (!isValidV2TickerUpdate(update)) continue;
          
          const safeData = translateV2ToV1(update);
          const tickData: TickData = {
            symbol: update.symbol,
            bid: parseFloat(safeData.b[0]),
            ask: parseFloat(safeData.a[0]),
            last: parseFloat(safeData.c[0]),
            timestamp: new Date().toISOString(),
            source: 'ws',
            bidVolume: update.bid_qty,
            askVolume: update.ask_qty,
          };
          
          this.lastTickTimestamp = Date.now();
          this.emit('tick', tickData);
          console.log(`[8.9.0-B][MD-WS_TICK] ${update.symbol} price=${tickData.last}`);
        }
      }
      return;
    }
    
    // 8.9.4-Patch: Handle v2 Book Updates with stateful mini-book
    if (message && typeof message === 'object' && message.channel === 'book') {
      if (message.type === 'update' || message.type === 'snapshot') {
        const updates = message.data || [];
        for (const update of updates) {
          const symbol = update.symbol;
          
          // 8.9.4-Patch: Sequence validation for out-of-order detection
          if (update.checksum !== undefined) {
            const seq = update.checksum;
            if (seq <= (this.lastSeq[symbol] ?? 0)) {
              console.warn(`[8.9.4-P][MD-WS][SEQ][${symbol}] Out-of-order delta, resyncing.`);
              this.orderBooks.delete(symbol);
            }
            this.lastSeq[symbol] = seq;
          }
          
          // 8.9.4-Patch: Initialize or get mini-book for this symbol
          if (!this.orderBooks.has(symbol)) {
            this.orderBooks.set(symbol, { bids: new Map(), asks: new Map() });
          }
          const book = this.orderBooks.get(symbol)!;
          
          // 8.9.4-Patch: Apply delta updates to mini-book
          if (update.bids) {
            for (const item of update.bids) {
              const price = parseFloat(item.price);
              const qty = parseFloat(item.qty);
              if (qty === 0) {
                book.bids.delete(price);
              } else {
                book.bids.set(price, qty);
              }
            }
          }
          
          if (update.asks) {
            for (const item of update.asks) {
              const price = parseFloat(item.price);
              const qty = parseFloat(item.qty);
              if (qty === 0) {
                book.asks.delete(price);
              } else {
                book.asks.set(price, qty);
              }
            }
          }
          
          // 8.9.4-Patch: Compute best bid/ask from stateful mini-book
          const sortedBids = Array.from(book.bids.entries()).sort((a, b) => b[0] - a[0]);
          const sortedAsks = Array.from(book.asks.entries()).sort((a, b) => a[0] - b[0]);
          
          // (P19-B4b.2 / #300) Dead 'orderbook' emission + snapshot construction removed.
          // Only consumer chain (market-data-coordinator order-book store -> deleted
          // realtime-paper-executor) is gone. The mini-book + the midpoint-tick emission
          // below are LIVE and unchanged. The OrderBookSnapshot interface export is
          // retained (slippage-fee-model type-imports it).
          this.lastTickTimestamp = Date.now();
          
          // Emit tick with midpoint for stable pricing
          if (sortedBids.length > 0 && sortedAsks.length > 0) {
            const bestBid = sortedBids[0][0];
            const bestAsk = sortedAsks[0][0];
            const midpoint = (bestBid + bestAsk) / 2;
            
            const tickData: TickData = {
              symbol: symbol,
              bid: bestBid,
              ask: bestAsk,
              last: midpoint,
              timestamp: new Date().toISOString(),
              source: 'ws',
            };
            this.emit('tick', tickData);
          }
        }
      }
      return;
    }
    
    // 8.9.0-B: Handle v2 Subscription Responses
    if (message && typeof message === 'object' && message.method) {
      if (message.method === 'subscribe') {
        if (message.success) {
          console.log(`[8.9.0-B][MD-WS] Sub OK: ${message.result?.symbol}`);
        } else {
          console.error(`[8.9.0-B][MD-WS] Sub Error: ${message.error}`);
        }
      }
      return;
    }
    
    // 8.9.0-B: Handle v2 Heartbeat
    if (message && typeof message === 'object' && message.channel === 'heartbeat') {
      this.lastTickTimestamp = Date.now();
      return;
    }
  }

  public subscribeToPair(pair: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.log(`[MD-WS] Queuing subscription for ${pair} (not connected)`);
      this.subscribedPairs.add(pair);
      return;
    }

    this.subscribedPairs.add(pair);

    // 8.9.4: v2 subscription format for ticker (trade-based updates)
    // Book channel provides BBO updates for continuous midpoint pricing
    const tickerSub = {
      method: 'subscribe',
      params: {
        channel: 'ticker',
        symbol: [pair],
        snapshot: true
      }
    };

    // 8.9.4: v2 subscription format for order book (continuous BBO updates)
    const bookSub = {
      method: 'subscribe',
      params: {
        channel: 'book',
        symbol: [pair],
        depth: 10,  // Top 10 levels for redundancy
        snapshot: true
      }
    };

    this.ws.send(JSON.stringify(tickerSub));
    this.ws.send(JSON.stringify(bookSub));
    
    console.log(`[8.9.0-B][MD-WS] Subscribed to ${pair}`);
  }

  public unsubscribeFromPair(pair: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.subscribedPairs.delete(pair);
      return;
    }

    // 8.9.0-B: v2 unsubscribe format
    const tickerUnsub = {
      method: 'unsubscribe',
      params: {
        channel: 'ticker',
        symbol: [pair]
      }
    };

    const bookUnsub = {
      method: 'unsubscribe',
      params: {
        channel: 'book',
        symbol: [pair]
      }
    };

    this.ws.send(JSON.stringify(tickerUnsub));
    this.ws.send(JSON.stringify(bookUnsub));
    this.subscribedPairs.delete(pair);
    
    console.log(`[8.9.0-B][MD-WS] Unsubscribed from ${pair}`);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
        
        // Check if data is stale
        const ageMs = Date.now() - this.lastTickTimestamp;
        if (ageMs > this.config.staleThresholdMs) {
          console.warn(`[MD-WS] Data stale: ${ageMs}ms since last tick`);
          this.emit('stale', ageMs);
        }
      }
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return; // Already scheduled
    }

    const delay = Math.min(
      this.config.reconnectDelayBase * Math.pow(2, this.reconnectAttempts),
      this.config.reconnectDelayMax
    );

    console.log(`[MD-WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectAttempts++;
      this.reconnectCount++;
      this.connect();
    }, delay);
  }

  public disconnect(): void {
    console.log('[MD-WS] Disconnecting...');
    
    this.stopHeartbeat();
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.isConnected = false;
  }

  public getStatus() {
    const ageMs = this.lastTickTimestamp > 0 ? Date.now() - this.lastTickTimestamp : -1;
    
    return {
      connected: this.isConnected,
      reconnects: this.reconnectCount,
      lastTickAgeMs: ageMs,
      subscribedPairs: Array.from(this.subscribedPairs),
      isStale: ageMs > this.config.staleThresholdMs,
    };
  }

  public getLastTickAge(): number {
    return this.lastTickTimestamp > 0 ? Date.now() - this.lastTickTimestamp : -1;
  }

  /**
   * Get and reset reconnect count (for interval-based monitoring)
   */
  public getAndResetReconnectCount(): number {
    const count = this.reconnectCount;
    this.reconnectCount = 0;
    return count;
  }
}

// Singleton instance
let mdWsInstance: MarketDataWebSocket | null = null;

export function getMarketDataWS(): MarketDataWebSocket {
  if (!mdWsInstance) {
    mdWsInstance = new MarketDataWebSocket();
  }
  return mdWsInstance;
}
