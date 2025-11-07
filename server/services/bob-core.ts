/**
 * Bob Core - Phase 7.2
 * 
 * Lightweight coordinator that accelerates Walter by:
 * - Fetching dashboard data in parallel
 * - Caching hot endpoints for short windows
 * - Returning unified responses with fallback support
 * 
 * This is a transparent optimization layer - does not change Walter behavior
 * 
 * Phase 8.3: Integrated with SystemHealthMonitor for diagnostics
 */

import { nanoid } from 'nanoid';

// Configuration
const BOB_ENABLED = process.env.BOB_ENABLED !== 'false'; // Default: enabled
const BOB_PREFETCH_ON_CHAT_OPEN = process.env.BOB_PREFETCH_ON_CHAT_OPEN !== 'false';
const BOB_PREFETCH_ON_MODE_CHANGE = process.env.BOB_PREFETCH_ON_MODE_CHANGE !== 'false';
const CACHE_DEBUG = process.env.CACHE_DEBUG === 'true'; // Phase 4A: Gate verbose logs

// Phase 5B.HF: Add BOB_METRICS_TTL_SECONDS with default
const BOB_METRICS_TTL_SECONDS = Number(process.env.BOB_METRICS_TTL_SECONDS ?? 60);

// Phase 4A Remediation: Unified TTL strategy
const TTL_CONFIG = {
  metadata: 90,      // Symbol metadata, config: 90s
  portfolio: 90,     // Portfolio snapshots: 90s
  diagnostics: 45,   // Diagnostics, scan results: 45s
  default: 30        // Fallback: 30s
};

interface CacheEntry<T = any> {
  key: string;
  value: T;
  expiresAt: number;
  mode?: string;
  tags?: string[];
}

interface BobModule {
  name: string;
  fetchFunctions: Map<string, (context: FetchContext) => Promise<any>>;
}

interface FetchContext {
  mode: 'live' | 'paper';
  userId?: string;
  token?: string;
  traceId?: string; // Phase 8.6.4: Provenance tracking
}

interface CacheStats {
  hits: number;
  misses: number;
  prefetches: number;
  fallbacks: number;
  errors: number;
  lastErrorTime?: Date;
}

// Phase 4A: Request coalescing to prevent duplicate in-flight fetches
const pendingRequests: Map<string, Promise<any>> = new Map();

/**
 * Bob Core Coordinator
 * Manages modules, caching, parallel fetching, and fallback behavior
 * Phase 8.3: Integrated with SystemHealthMonitor for diagnostic tracking
 */
class BobCoreCoordinator {
  private cache: Map<string, CacheEntry> = new Map();
  private modules: Map<string, BobModule> = new Map();
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    prefetches: 0,
    fallbacks: 0,
    errors: 0
  };
  
  // Phase 8.3: Optional health monitor for diagnostics
  private healthMonitor: any = null;

  constructor() {
    // Start cleanup interval to remove expired cache entries
    setInterval(() => this.cleanupExpiredEntries(), 10000); // Every 10 seconds
  }

  /**
   * Set health monitor for diagnostic tracking (Phase 8.3)
   * Allows injection after both modules are loaded to avoid circular deps
   */
  setHealthMonitor(monitor: any) {
    this.healthMonitor = monitor;
    if (CACHE_DEBUG) console.log('[BobCore] 🏥 Health monitor integrated');
  }

  /**
   * Register a Bob module with its fetch functions
   */
  registerModule(name: string, fetchFunctions: Map<string, (context: FetchContext) => Promise<any>>) {
    if (CACHE_DEBUG) console.log(`[BobCore] 📦 Registering module: ${name} with ${fetchFunctions.size} functions`);
    this.modules.set(name, { name, fetchFunctions });
  }

  /**
   * Phase 4A: Determine TTL based on cache key category
   */
  private determineTTL(key: string): number {
    if (key.includes('config') || key.includes('metadata') || key.includes('symbol')) {
      return TTL_CONFIG.metadata;
    }
    if (key.includes('portfolio') || key.includes('snapshot')) {
      return TTL_CONFIG.portfolio;
    }
    if (key.includes('diagnostic') || key.includes('scan')) {
      return TTL_CONFIG.diagnostics;
    }
    return TTL_CONFIG.default;
  }

  /**
   * Fetch data or serve from cache with request coalescing
   * Phase 4A: Unified TTLs + coalescing + quieter logs
   * @param key - Unique cache key
   * @param fetchFn - Function to fetch data on cache miss
   * @param ttl - Time to live in seconds (optional, auto-determined from key)
   * @param context - Fetch context (mode, userId, token)
   * @param tags - Optional tags for cache invalidation
   */
  async fetchOrServe<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl?: number,
    context?: FetchContext,
    tags?: string[]
  ): Promise<T> {
    if (!BOB_ENABLED) {
      // Bob disabled - call fetch function directly
      return await fetchFn();
    }

    const cached = this.cache.get(key);
    const now = Date.now();

    // Check if cache hit and not expired
    if (cached && cached.expiresAt > now) {
      this.stats.hits++;
      if (this.healthMonitor) {
        this.healthMonitor.recordCacheHit();
      }
      if (CACHE_DEBUG) {
        console.log(`[BobCore] ✅ CACHE_HIT: ${key} (TTL: ${Math.round((cached.expiresAt - now) / 1000)}s remaining)`);
      }
      return cached.value as T;
    }

    // Phase 4A: Request coalescing - check for in-flight request
    if (pendingRequests.has(key)) {
      if (CACHE_DEBUG) {
        console.log(`[BobCore] 🔄 COALESCE: ${key} (request already in-flight)`);
      }
      return pendingRequests.get(key) as Promise<T>;
    }

    // Cache miss - fetch data
    this.stats.misses++;
    if (this.healthMonitor) {
      this.healthMonitor.recordCacheMiss();
    }
    const startTime = Date.now();
    if (CACHE_DEBUG) {
      console.log(`[BobCore] ❌ CACHE_MISS: ${key} - fetching...`);
    }

    // Determine TTL if not provided (Phase 4A)
    const finalTTL = ttl !== undefined ? ttl : this.determineTTL(key);

    // Create promise and store in pending map
    const promise = (async () => {
      try {
        const value = await fetchFn();
        const duration = Date.now() - startTime;

        // Store in cache
        this.cache.set(key, {
          key,
          value,
          expiresAt: Date.now() + (finalTTL * 1000),
          mode: context?.mode,
          tags
        });

        if (CACHE_DEBUG) {
          console.log(`[BobCore] 💾 Cached: ${key} (TTL: ${finalTTL}s, fetch: ${duration}ms)`);
        }
        return value;
      } catch (error: any) {
        this.stats.errors++;
        this.stats.lastErrorTime = new Date();
        console.error(`[BobCore] ⚠️ FETCH_ERROR: ${key} -`, error.message);
        throw error;
      } finally {
        // Remove from pending after completion
        pendingRequests.delete(key);
      }
    })();

    pendingRequests.set(key, promise);
    return promise;
  }

  /**
   * Prefetch data without blocking
   * Used to warm cache before it's needed
   */
  async prefetch(
    key: string,
    fetchFn: () => Promise<any>,
    ttl?: number,
    context?: FetchContext,
    tags?: string[]
  ): Promise<void> {
    if (!BOB_ENABLED) {
      return;
    }

    if (CACHE_DEBUG) console.log(`[BobCore] 🔄 PREFETCH_START: ${key} (mode: ${context?.mode || 'default'})`);
    
    try {
      await this.fetchOrServe(key, fetchFn, ttl, context, tags);
      this.stats.prefetches++;
      if (CACHE_DEBUG) console.log(`[BobCore] ✅ PREFETCH_OK: ${key}`);
    } catch (error: any) {
      console.error(`[BobCore] ⚠️ PREFETCH_FAIL: ${key} -`, error.message);
    }
  }

  /**
   * Invoke fallback when Bob modules fail
   */
  async fallback<T>(key: string, fallbackFn: () => Promise<T>): Promise<T> {
    this.stats.fallbacks++;
    if (CACHE_DEBUG) console.log(`[BobCore] 🔄 FALLBACK: ${key} - using original endpoint`);
    
    try {
      return await fallbackFn();
    } catch (error: any) {
      console.error(`[BobCore] ❌ FALLBACK_ERROR: ${key} -`, error.message);
      throw error;
    }
  }

  /**
   * Invalidate cache entries by key or tags
   */
  invalidate(keyOrTag: string) {
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (key === keyOrTag || entry.tags?.includes(keyOrTag)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => {
      this.cache.delete(key);
      if (CACHE_DEBUG) console.log(`[BobCore] 🗑️ INVALIDATED: ${key}`);
    });

    return keysToDelete.length;
  }

  /**
   * Invalidate all cache entries for a specific mode
   */
  invalidateMode(mode: 'live' | 'paper') {
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (entry.mode === mode) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.cache.delete(key));
    if (CACHE_DEBUG) console.log(`[BobCore] 🗑️ INVALIDATED_MODE: ${mode} (${keysToDelete.length} entries)`);
    
    return keysToDelete.length;
  }

  /**
   * Invalidate all cache entries (Phase 8.3 - for self-repair)
   */
  invalidateAll(): number {
    const count = this.cache.size;
    this.cache.clear();
    if (CACHE_DEBUG) console.log(`[BobCore] 🗑️ INVALIDATED_ALL: Cleared ${count} cache entries`);
    return count;
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupExpiredEntries() {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt <= now) {
        keysToDelete.push(key);
      }
    }

    if (keysToDelete.length > 0) {
      keysToDelete.forEach(key => this.cache.delete(key));
      if (CACHE_DEBUG) console.log(`[BobCore] 🧹 Cleaned ${keysToDelete.length} expired cache entries`);
    }
  }

  /**
   * Get cache statistics and health
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    const hitRatio = total > 0 ? (this.stats.hits / total * 100).toFixed(1) : '0.0';

    return {
      enabled: BOB_ENABLED,
      cacheSize: this.cache.size,
      modulesRegistered: this.modules.size,
      stats: {
        ...this.stats,
        hitRatio: `${hitRatio}%`,
        total
      },
      config: {
        ttl: BOB_METRICS_TTL_SECONDS,
        prefetchOnChatOpen: BOB_PREFETCH_ON_CHAT_OPEN,
        prefetchOnModeChange: BOB_PREFETCH_ON_MODE_CHANGE
      }
    };
  }

  /**
   * Get module by name
   */
  getModule(name: string): BobModule | undefined {
    return this.modules.get(name);
  }

  /**
   * Check if Bob is enabled
   */
  isEnabled(): boolean {
    return BOB_ENABLED;
  }
}

// Export singleton instance
export const bobCore = new BobCoreCoordinator();

// Export types
export type { FetchContext, BobModule };
