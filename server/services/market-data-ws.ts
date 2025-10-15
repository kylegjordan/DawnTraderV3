import WebSocket from 'ws';
import { EventEmitter } from 'events';

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

  constructor(config?: Partial<WSConfig>) {
    super();
    this.config = {
      url: config?.url || 'wss://ws.kraken.com',
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
    if (Array.isArray(message)) {
      // Price update messages come as arrays
      const [channelId, data, channelName, pair] = message;
      
      if (channelName === 'ticker' && data) {
        const tickData: TickData = {
          symbol: pair,
          bid: parseFloat(data.b[0]), // Best bid
          ask: parseFloat(data.a[0]), // Best ask
          last: parseFloat(data.c[0]), // Last trade
          timestamp: new Date().toISOString(),
          source: 'ws',
          bidVolume: parseFloat(data.b[1]),
          askVolume: parseFloat(data.a[1]),
        };
        
        this.lastTickTimestamp = Date.now();
        this.emit('tick', tickData);
      } else if (channelName === 'book' && data) {
        // Order book update
        const snapshot: OrderBookSnapshot = {
          symbol: pair,
          bids: data.bs || data.b || [],
          asks: data.as || data.a || [],
          timestamp: new Date().toISOString(),
        };
        
        this.emit('orderbook', snapshot);
      }
    } else if (message.event) {
      // System events (subscribed, heartbeat, etc.)
      if (message.event === 'heartbeat') {
        this.lastTickTimestamp = Date.now();
      } else if (message.event === 'subscriptionStatus') {
        console.log(`[MD-WS] Subscription ${message.status}: ${message.pair} (${message.channelName})`);
      }
    }
  }

  public subscribeToPair(pair: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.log(`[MD-WS] Queuing subscription for ${pair} (not connected)`);
      this.subscribedPairs.add(pair);
      return;
    }

    this.subscribedPairs.add(pair);

    // Subscribe to ticker (for prices)
    const tickerSub = {
      event: 'subscribe',
      pair: [pair],
      subscription: { name: 'ticker' }
    };

    // Subscribe to order book (for depth/slippage)
    const bookSub = {
      event: 'subscribe',
      pair: [pair],
      subscription: { name: 'book', depth: 10 }
    };

    this.ws.send(JSON.stringify(tickerSub));
    this.ws.send(JSON.stringify(bookSub));
    
    console.log(`[MD-WS] Subscribed to ${pair}`);
  }

  public unsubscribeFromPair(pair: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.subscribedPairs.delete(pair);
      return;
    }

    const tickerUnsub = {
      event: 'unsubscribe',
      pair: [pair],
      subscription: { name: 'ticker' }
    };

    const bookUnsub = {
      event: 'unsubscribe',
      pair: [pair],
      subscription: { name: 'book' }
    };

    this.ws.send(JSON.stringify(tickerUnsub));
    this.ws.send(JSON.stringify(bookUnsub));
    this.subscribedPairs.delete(pair);
    
    console.log(`[MD-WS] Unsubscribed from ${pair}`);
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
}

// Singleton instance
let mdWsInstance: MarketDataWebSocket | null = null;

export function getMarketDataWS(): MarketDataWebSocket {
  if (!mdWsInstance) {
    mdWsInstance = new MarketDataWebSocket();
  }
  return mdWsInstance;
}
