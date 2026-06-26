import { getMarketDataWS, TickData } from './market-data-ws';
import { EventEmitter } from 'events';

/**
 * Coordinates between WebSocket and REST fallback for market data
 * Routes data to StrategyBob and Cortex
 */

interface MarketDataConfig {
  enableWebSocket: boolean;
  restFallbackEnabled: boolean;
  staleThresholdMs: number;
}

class MarketDataCoordinator extends EventEmitter {
  private wsClient = getMarketDataWS();
  private config: MarketDataConfig;
  private usingFallback = false;
  private latestTicks: Map<string, TickData> = new Map();
  private fallbackCheckInterval: NodeJS.Timeout | null = null;

  constructor(config?: Partial<MarketDataConfig>) {
    super();
    this.config = {
      enableWebSocket: config?.enableWebSocket ?? true,
      restFallbackEnabled: config?.restFallbackEnabled ?? true,
      staleThresholdMs: config?.staleThresholdMs ?? 2000,
    };

    this.setupWebSocketHandlers();
    
    if (this.config.enableWebSocket) {
      this.wsClient.connect();
    }

    // Monitor for fallback needs
    this.startFallbackMonitor();
  }

  /**
   * Setup WebSocket event handlers
   */
  private setupWebSocketHandlers(): void {
    // Forward tick data to consumers
    this.wsClient.on('tick', (tick: TickData) => {
      this.latestTicks.set(tick.symbol, tick);
      this.usingFallback = false;
      
      // Route to StrategyBob/Cortex
      this.emit('tick', tick);
      
      // Update Cortex snapshot
      this.updateCortexSnapshot({
        marketDataSource: 'ws',
        lastWsTickISO: tick.timestamp,
        lastTickSymbol: tick.symbol,
      });
    });

    // Handle connection events
    this.wsClient.on('connected', () => {
      console.log('[MD-Coordinator] WebSocket connected, fallback disabled');
      this.usingFallback = false;
    });

    this.wsClient.on('disconnected', () => {
      console.log('[MD-Coordinator] WebSocket disconnected');
      this.handleFallback();
    });

    this.wsClient.on('stale', (ageMs: number) => {
      console.warn(`[MD-Coordinator] WebSocket data stale (${ageMs}ms), checking fallback...`);
      if (ageMs > this.config.staleThresholdMs) {
        this.handleFallback();
      }
    });

    // Handle WebSocket errors gracefully (prevents app crash)
    this.wsClient.on('error', (error: Error) => {
      console.warn('[MD-Coordinator] WebSocket error (using REST fallback):', error.message);
      this.handleFallback();
    });
  }

  /**
   * Monitor and activate REST fallback when needed
   */
  private startFallbackMonitor(): void {
    this.fallbackCheckInterval = setInterval(() => {
      const wsStatus = this.wsClient.getStatus();
      
      if (wsStatus.isStale || !wsStatus.connected) {
        this.handleFallback();
      }
    }, 5000); // Check every 5 seconds
  }

  /**
   * Activate REST fallback
   */
  private handleFallback(): void {
    if (!this.config.restFallbackEnabled) {
      console.warn('[MD-Coordinator] Fallback disabled, no alternative data source');
      return;
    }

    if (!this.usingFallback) {
      console.log('[MD-Coordinator] ⚠️  Fallback=REST (WS stale > 2s)');
      this.usingFallback = true;
      
      // Update Cortex
      this.updateCortexSnapshot({
        marketDataSource: 'rest_fallback',
        fallbackReason: 'WS stale or disconnected',
      });
    }
  }

  /**
   * Get latest tick for a symbol (WS or fallback)
   */
  public getLatestTick(symbol: string): TickData | undefined {
    return this.latestTicks.get(symbol);
  }

  /**
   * Subscribe to a trading pair
   */
  public subscribeToPair(pair: string): void {
    if (this.config.enableWebSocket) {
      this.wsClient.subscribeToPair(pair);
    }
  }

  /**
   * Unsubscribe from a trading pair
   */
  public unsubscribeFromPair(pair: string): void {
    if (this.config.enableWebSocket) {
      this.wsClient.unsubscribeFromPair(pair);
    }
  }

  /**
   * Get current data source
   */
  public getDataSource(): 'ws' | 'rest_fallback' {
    return this.usingFallback ? 'rest_fallback' : 'ws';
  }

  /**
   * Get status for health monitoring
   */
  public getStatus() {
    const wsStatus = this.wsClient.getStatus();
    
    return {
      dataSource: this.getDataSource(),
      wsConnected: wsStatus.connected,
      wsReconnects: wsStatus.reconnects,
      lastTickAgeMs: wsStatus.lastTickAgeMs,
      subscribedPairs: wsStatus.subscribedPairs.length,
      usingFallback: this.usingFallback,
    };
  }

  /**
   * Update Cortex snapshot with market data info
   */
  private updateCortexSnapshot(data: any): void {
    // This will be integrated with Cortex in next step
    this.emit('cortex-update', data);
  }

  /**
   * Disconnect and cleanup
   */
  public shutdown(): void {
    if (this.fallbackCheckInterval) {
      clearInterval(this.fallbackCheckInterval);
    }
    this.wsClient.disconnect();
    console.log('[MD-Coordinator] Shutdown complete');
  }
}

// Singleton instance
let coordinatorInstance: MarketDataCoordinator | null = null;

export function getMarketDataCoordinator(): MarketDataCoordinator {
  if (!coordinatorInstance) {
    coordinatorInstance = new MarketDataCoordinator();
  }
  return coordinatorInstance;
}

export { MarketDataCoordinator };
