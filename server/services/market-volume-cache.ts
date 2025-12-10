/**
 * Phase 8.8.3-I10: Market Volume Cache
 * 
 * Provides 5-minute cached volume data from Kraken as fallback
 * when FX5 volume metadata is not available at trade creation.
 * 
 * Key design principles:
 * - No per-tick volume fetching
 * - No per-refresh REST calls
 * - Volume is a trade-time attribute, not a live metric
 */

import { krakenSymbolResolver } from '../markets/kraken-symbol-resolver.js';

const VOLUME_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface VolumeCacheEntry {
  volume24h: number;
  volumeBucket: 'High' | 'Medium' | 'Low' | 'Very Low';
  timestamp: number;
}

class MarketVolumeCache {
  private cache: Map<string, VolumeCacheEntry> = new Map();
  private pendingFetches: Map<string, Promise<VolumeCacheEntry>> = new Map();

  /**
   * Classify volume into buckets per spec:
   * >= $5M = High
   * >= $500K = Medium
   * >= $50K = Low
   * < $50K = Very Low
   */
  classifyVolume(volume: number): 'High' | 'Medium' | 'Low' | 'Very Low' {
    if (volume >= 5_000_000) return 'High';
    if (volume >= 500_000) return 'Medium';
    if (volume >= 50_000) return 'Low';
    return 'Very Low';
  }

  /**
   * Get cached volume entry if still valid
   */
  private getCachedEntry(symbol: string): VolumeCacheEntry | null {
    const entry = this.cache.get(symbol);
    if (!entry) return null;
    
    const now = Date.now();
    if (now - entry.timestamp > VOLUME_CACHE_TTL_MS) {
      this.cache.delete(symbol);
      return null;
    }
    
    return entry;
  }

  /**
   * Set volume in cache
   */
  setVolume(symbol: string, volume24h: number): VolumeCacheEntry {
    const entry: VolumeCacheEntry = {
      volume24h,
      volumeBucket: this.classifyVolume(volume24h),
      timestamp: Date.now()
    };
    this.cache.set(symbol, entry);
    return entry;
  }

  /**
   * Get volume for a symbol - returns cached value or fetches from Kraken
   * This is async because it may need to fetch from Kraken API
   */
  async getVolume(symbol: string): Promise<{ volume24h: number; volumeBucket: 'High' | 'Medium' | 'Low' | 'Very Low' }> {
    // Check cache first
    const cached = this.getCachedEntry(symbol);
    if (cached) {
      return { volume24h: cached.volume24h, volumeBucket: cached.volumeBucket };
    }

    // Check if there's already a pending fetch for this symbol
    const pending = this.pendingFetches.get(symbol);
    if (pending) {
      const result = await pending;
      return { volume24h: result.volume24h, volumeBucket: result.volumeBucket };
    }

    // Fetch from Kraken
    const fetchPromise = this.fetchFromKraken(symbol);
    this.pendingFetches.set(symbol, fetchPromise);
    
    try {
      const result = await fetchPromise;
      return { volume24h: result.volume24h, volumeBucket: result.volumeBucket };
    } finally {
      this.pendingFetches.delete(symbol);
    }
  }

  /**
   * Fetch volume from Kraken REST API
   */
  private async fetchFromKraken(symbol: string): Promise<VolumeCacheEntry> {
    try {
      // Convert canonical symbol (BTC/USD) to Kraken format (XXBTZUSD)
      const krakenSymbol = krakenSymbolResolver.toKrakenTicker(symbol);
      
      const response = await fetch(`https://api.kraken.com/0/public/Ticker?pair=${krakenSymbol}`);
      const data = await response.json();
      
      if (data.error && data.error.length > 0) {
        console.warn(`[I10-VolumeCache] Kraken API error for ${symbol}: ${data.error.join(', ')}`);
        return this.setVolume(symbol, 0);
      }
      
      // Get the first result key (Kraken returns the pair under its internal name)
      const resultKeys = Object.keys(data.result || {});
      if (resultKeys.length === 0) {
        console.warn(`[I10-VolumeCache] No ticker data for ${symbol}`);
        return this.setVolume(symbol, 0);
      }
      
      const ticker = data.result[resultKeys[0]];
      // v[1] is 24h volume in base currency, we need USD volume
      // p[1] is 24h VWAP, we can use c[0] (last price) as approximation
      const volume24hBase = parseFloat(ticker.v?.[1] || '0');
      const lastPrice = parseFloat(ticker.c?.[0] || '0');
      const volume24hUsd = volume24hBase * lastPrice;
      
      console.log(`[I10-VolumeCache] Fetched ${symbol}: Vol=$${(volume24hUsd/1000000).toFixed(2)}M`);
      
      return this.setVolume(symbol, volume24hUsd);
    } catch (error) {
      console.error(`[I10-VolumeCache] Error fetching volume for ${symbol}:`, error);
      return this.setVolume(symbol, 0);
    }
  }

  /**
   * Batch fetch volumes for multiple symbols (more efficient)
   * Uses a single Kraken API call for multiple pairs
   */
  async getVolumes(symbols: string[]): Promise<Map<string, { volume24h: number; volumeBucket: 'High' | 'Medium' | 'Low' | 'Very Low' }>> {
    const results = new Map<string, { volume24h: number; volumeBucket: 'High' | 'Medium' | 'Low' | 'Very Low' }>();
    const symbolsToFetch: string[] = [];
    
    // Check cache first for all symbols
    for (const symbol of symbols) {
      const cached = this.getCachedEntry(symbol);
      if (cached) {
        results.set(symbol, { volume24h: cached.volume24h, volumeBucket: cached.volumeBucket });
      } else {
        symbolsToFetch.push(symbol);
      }
    }
    
    // Fetch missing symbols from Kraken in batch
    if (symbolsToFetch.length > 0) {
      try {
        const krakenSymbols = symbolsToFetch.map(s => krakenSymbolResolver.toKrakenTicker(s));
        const response = await fetch(`https://api.kraken.com/0/public/Ticker?pair=${krakenSymbols.join(',')}`);
        const data = await response.json();
        
        if (data.error && data.error.length > 0) {
          console.warn(`[I10-VolumeCache] Kraken batch API error: ${data.error.join(', ')}`);
        }
        
        // Process results
        for (const symbol of symbolsToFetch) {
          const krakenSymbol = krakenSymbolResolver.toKrakenTicker(symbol);
          
          // Find the matching result (Kraken may use different naming)
          let ticker = null;
          for (const [key, value] of Object.entries(data.result || {})) {
            if (key === krakenSymbol || key.includes(krakenSymbol.replace('/', ''))) {
              ticker = value as any;
              break;
            }
          }
          
          if (ticker) {
            const volume24hBase = parseFloat(ticker.v?.[1] || '0');
            const lastPrice = parseFloat(ticker.c?.[0] || '0');
            const volume24hUsd = volume24hBase * lastPrice;
            const entry = this.setVolume(symbol, volume24hUsd);
            results.set(symbol, { volume24h: entry.volume24h, volumeBucket: entry.volumeBucket });
          } else {
            // Symbol not found, set to 0
            const entry = this.setVolume(symbol, 0);
            results.set(symbol, { volume24h: entry.volume24h, volumeBucket: entry.volumeBucket });
          }
        }
      } catch (error) {
        console.error('[I10-VolumeCache] Batch fetch error:', error);
        // Set all missing symbols to 0
        for (const symbol of symbolsToFetch) {
          const entry = this.setVolume(symbol, 0);
          results.set(symbol, { volume24h: entry.volume24h, volumeBucket: entry.volumeBucket });
        }
      }
    }
    
    return results;
  }

  /**
   * Clear the cache
   */
  clear(): void {
    this.cache.clear();
    console.log('[I10-VolumeCache] Cache cleared');
  }

  /**
   * Get cache stats
   */
  getStats(): { size: number; entries: Array<{ symbol: string; volume24h: number; ageMs: number }> } {
    const now = Date.now();
    const entries: Array<{ symbol: string; volume24h: number; ageMs: number }> = [];
    
    for (const [symbol, entry] of this.cache.entries()) {
      entries.push({
        symbol,
        volume24h: entry.volume24h,
        ageMs: now - entry.timestamp
      });
    }
    
    return { size: this.cache.size, entries };
  }
}

export const marketVolumeCache = new MarketVolumeCache();
