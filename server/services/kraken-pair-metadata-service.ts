/**
 * Phase 8.8.3 - Kraken Pair Metadata Service
 * 
 * Provides deterministic symbol normalization by fetching Kraken AssetPairs metadata.
 * Builds maps for converting between internal symbols and Kraken WebSocket symbols.
 * 
 * Key responsibilities:
 * - Fetch Kraken AssetPairs at startup
 * - Build internalToExchange and exchangeToInternal maps
 * - Provide fast lookup helpers for symbol normalization
 * - Periodic refresh every 12 hours
 */

interface KrakenPairInfo {
  wsname?: string;
  altname: string;
  base: string;
  quote: string;
  status?: string;
}

interface PairMetadataDiagnostics {
  isLoaded: boolean;
  internalSymbolCount: number;
  krakenSymbolCount: number;
  lastLoadAt: string | null;
  lastRefreshAt: string | null;
  loadErrorCount: number;
  lastLoadError: string | null;
  sampleInternalSymbols: string[];
  sampleKrakenSymbols: string[];
}

class KrakenPairMetadataService {
  private internalToExchange: Map<string, string> = new Map();
  private exchangeToInternal: Map<string, string> = new Map();
  private isLoaded: boolean = false;
  private lastLoadAt: Date | null = null;
  private lastRefreshAt: Date | null = null;
  private loadErrorCount: number = 0;
  private lastLoadError: string | null = null;
  private refreshInterval: NodeJS.Timeout | null = null;

  private readonly TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
  private readonly KRAKEN_API_BASE = 'https://api.kraken.com';

  constructor() {
    console.log('[SYM][PAIR_METADATA_SERVICE] Initialized');
  }

  /**
   * Load AssetPairs from Kraken REST API
   * Called once on server startup
   */
  async loadAssetPairs(): Promise<boolean> {
    console.log('[SYM][PAIR_METADATA_LOAD] Starting AssetPairs fetch...');
    
    try {
      const response = await fetch(`${this.KRAKEN_API_BASE}/0/public/AssetPairs`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.error && data.error.length > 0) {
        throw new Error(`Kraken API error: ${data.error.join(', ')}`);
      }
      
      const pairs = data.result as Record<string, KrakenPairInfo>;
      
      if (!pairs || Object.keys(pairs).length === 0) {
        throw new Error('No pairs returned from Kraken API');
      }
      
      this.buildMaps(pairs);
      
      this.isLoaded = true;
      this.lastLoadAt = new Date();
      this.lastLoadError = null;
      
      console.log('[SYM][PAIR_METADATA_LOAD_SUCCESS]', {
        pairCount: Object.keys(pairs).length,
        internalSymbolCount: this.internalToExchange.size,
        exchangeSymbolCount: this.exchangeToInternal.size,
        loadedAt: this.lastLoadAt.toISOString(),
      });
      
      this.scheduleRefresh();
      
      return true;
    } catch (error) {
      this.loadErrorCount++;
      this.lastLoadError = error instanceof Error ? error.message : String(error);
      
      console.error('[SYM][PAIR_METADATA_LOAD_FAILED]', {
        error: this.lastLoadError,
        errorCount: this.loadErrorCount,
      });
      
      return false;
    }
  }

  /**
   * Phase 8.8.4: Dedicated map for WS symbol -> pairId lookups
   * Kept separate from exchangeToInternal to avoid key collisions
   */
  private wsSymbolToPairId = new Map<string, string>();

  /**
   * Build symbol maps from Kraken pair data
   * Atomically swaps map references to avoid partial updates
   * 
   * Phase 8.8.4: Enhanced to support bidirectional mapping including pairId
   */
  private buildMaps(pairs: Record<string, KrakenPairInfo>): void {
    const newInternalToExchange = new Map<string, string>();
    const newExchangeToInternal = new Map<string, string>();
    const newWsSymbolToPairId = new Map<string, string>();
    
    for (const [pairId, info] of Object.entries(pairs)) {
      if (info.status && info.status !== 'online') {
        continue;
      }
      
      const wsSymbol = info.wsname || info.altname;
      const altname = info.altname;
      
      // Forward mappings: internal -> exchange (WS format)
      newInternalToExchange.set(altname, wsSymbol);
      newInternalToExchange.set(altname.toUpperCase(), wsSymbol);
      
      if (altname !== wsSymbol) {
        newInternalToExchange.set(wsSymbol, wsSymbol);
      }
      
      const altnameNoSlash = altname.replace('/', '');
      if (altnameNoSlash !== altname) {
        newInternalToExchange.set(altnameNoSlash, wsSymbol);
        newInternalToExchange.set(altnameNoSlash.toUpperCase(), wsSymbol);
      }
      
      const wsNoSlash = wsSymbol.replace('/', '');
      if (wsNoSlash !== wsSymbol) {
        newInternalToExchange.set(wsNoSlash, wsSymbol);
        newInternalToExchange.set(wsNoSlash.toUpperCase(), wsSymbol);
      }
      
      // Phase 8.8.4: Also map pairId (e.g., XXRPZUSD) to WS symbol
      newInternalToExchange.set(pairId, wsSymbol);
      newInternalToExchange.set(pairId.toUpperCase(), wsSymbol);
      
      // Reverse mappings: exchange (WS format) -> altname
      // Used for display/logging purposes
      newExchangeToInternal.set(wsSymbol, altname);
      newExchangeToInternal.set(wsSymbol.toUpperCase(), altname);
      
      // Phase 8.8.4: WS symbol -> pairId mapping in DEDICATED map
      // This avoids collisions with exchangeToInternal
      newWsSymbolToPairId.set(wsSymbol, pairId);
      newWsSymbolToPairId.set(wsSymbol.toUpperCase(), pairId);
    }
    
    this.internalToExchange = newInternalToExchange;
    this.exchangeToInternal = newExchangeToInternal;
    this.wsSymbolToPairId = newWsSymbolToPairId;
    
    console.log('[SYM][PAIR_METADATA_MAPS_BUILT]', {
      internalToExchangeSize: this.internalToExchange.size,
      exchangeToInternalSize: this.exchangeToInternal.size,
      wsSymbolToPairIdSize: this.wsSymbolToPairId.size,
    });
  }

  /**
   * Schedule periodic refresh of AssetPairs (every 12 hours)
   */
  private scheduleRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
    
    this.refreshInterval = setInterval(async () => {
      console.log('[SYM][PAIR_METADATA_REFRESH] Starting scheduled refresh...');
      
      try {
        const success = await this.refreshAssetPairs();
        if (success) {
          this.lastRefreshAt = new Date();
          console.log('[SYM][PAIR_METADATA_REFRESH_SUCCESS]', {
            refreshedAt: this.lastRefreshAt.toISOString(),
          });
        }
      } catch (error) {
        console.error('[SYM][PAIR_METADATA_REFRESH_FAILED]', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, this.TWELVE_HOURS_MS);
    
    console.log('[SYM][PAIR_METADATA_REFRESH_SCHEDULED]', {
      intervalMs: this.TWELVE_HOURS_MS,
      intervalHours: 12,
    });
  }

  /**
   * Refresh AssetPairs without blocking
   */
  private async refreshAssetPairs(): Promise<boolean> {
    try {
      const response = await fetch(`${this.KRAKEN_API_BASE}/0/public/AssetPairs`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.error && data.error.length > 0) {
        throw new Error(`Kraken API error: ${data.error.join(', ')}`);
      }
      
      const pairs = data.result as Record<string, KrakenPairInfo>;
      
      if (!pairs || Object.keys(pairs).length === 0) {
        throw new Error('No pairs returned from Kraken API during refresh');
      }
      
      this.buildMaps(pairs);
      
      return true;
    } catch (error) {
      this.loadErrorCount++;
      this.lastLoadError = error instanceof Error ? error.message : String(error);
      return false;
    }
  }

  /**
   * Get canonical Kraken WebSocket symbol from internal symbol
   * Returns null if symbol is not recognized
   */
  getCanonicalKrakenSymbol(internalSymbol: string): string | null {
    if (!internalSymbol) return null;
    
    const canonical = this.internalToExchange.get(internalSymbol);
    if (canonical) return canonical;
    
    const upperCanonical = this.internalToExchange.get(internalSymbol.toUpperCase());
    if (upperCanonical) return upperCanonical;
    
    if (internalSymbol.includes('/')) {
      return this.internalToExchange.get(internalSymbol) || null;
    }
    
    return null;
  }

  /**
   * Get internal symbol from Kraken WebSocket symbol
   * Returns altname format (e.g., XRPUSD) - suitable for display
   * Returns null if symbol is not recognized
   */
  getInternalSymbol(krakenSymbol: string): string | null {
    if (!krakenSymbol) return null;
    
    const internal = this.exchangeToInternal.get(krakenSymbol);
    if (internal) return internal;
    
    const upperInternal = this.exchangeToInternal.get(krakenSymbol.toUpperCase());
    if (upperInternal) return upperInternal;
    
    return null;
  }

  /**
   * Phase 8.8.4: Get Kraken pairId from WebSocket symbol
   * Returns pairId format (e.g., XXRPZUSD) - matches DB storage format
   * Uses dedicated wsSymbolToPairId map to avoid collisions
   * Returns null if symbol is not recognized
   */
  getPairId(krakenSymbol: string): string | null {
    if (!krakenSymbol) return null;
    
    const pairId = this.wsSymbolToPairId.get(krakenSymbol);
    if (pairId) return pairId;
    
    const upperPairId = this.wsSymbolToPairId.get(krakenSymbol.toUpperCase());
    if (upperPairId) return upperPairId;
    
    return null;
  }

  /**
   * Check if service has loaded pair metadata
   */
  isMetadataLoaded(): boolean {
    return this.isLoaded;
  }

  /**
   * Get diagnostics for debugging and monitoring
   */
  getDiagnostics(): PairMetadataDiagnostics {
    const internalSymbols = Array.from(this.internalToExchange.keys());
    const krakenSymbols = Array.from(this.exchangeToInternal.keys());
    
    return {
      isLoaded: this.isLoaded,
      internalSymbolCount: this.internalToExchange.size,
      krakenSymbolCount: this.exchangeToInternal.size,
      lastLoadAt: this.lastLoadAt?.toISOString() || null,
      lastRefreshAt: this.lastRefreshAt?.toISOString() || null,
      loadErrorCount: this.loadErrorCount,
      lastLoadError: this.lastLoadError,
      sampleInternalSymbols: internalSymbols.slice(0, 20),
      sampleKrakenSymbols: krakenSymbols.slice(0, 20),
    };
  }

  /**
   * Get all known internal symbols (for debugging)
   */
  getAllInternalSymbols(): string[] {
    return Array.from(this.internalToExchange.keys());
  }

  /**
   * Get all known Kraken symbols (for debugging)
   */
  getAllKrakenSymbols(): string[] {
    return Array.from(this.exchangeToInternal.keys());
  }

  /**
   * Cleanup on shutdown
   */
  shutdown(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
    console.log('[SYM][PAIR_METADATA_SERVICE] Shutdown complete');
  }
}

export const krakenPairMetadataService = new KrakenPairMetadataService();
