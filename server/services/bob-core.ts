/**
 * Bob Core - Phase 7.2
 * 
 * Lightweight coordinator that accelerates Walter by:
 * - Fetching dashboard data in parallel
 * - Caching hot endpoints for short windows
 * - Returning unified responses with fallback support
 * 
 * This is a transparent optimization layer - does not change Walter behavior
 */

import { nanoid } from 'nanoid';

// Configuration
const BOB_ENABLED = process.env.BOB_ENABLED !== 'false'; // Default: enabled
const BOB_METRICS_TTL_SECONDS = parseInt(process.env.BOB_METRICS_TTL_SECONDS || '30');
const BOB_PREFETCH_ON_CHAT_OPEN = process.env.BOB_PREFETCH_ON_CHAT_OPEN !== 'false';
const BOB_PREFETCH_ON_MODE_CHANGE = process.env.BOB_PREFETCH_ON_MODE_CHANGE !== 'false';

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
}

interface CacheStats {
  hits: number;
  misses: number;
  prefetches: number;
  fallbacks: number;
  errors: number;
  lastErrorTime?: Date;
}

/**
 * Bob Core Coordinator
 * Manages modules, caching, parallel fetching, and fallback behavior
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

  constructor() {
    // Start cleanup interval to remove expired cache entries
    setInterval(() => this.cleanupExpiredEntries(), 10000); // Every 10 seconds
  }

  /**
   * Register a Bob module with its fetch functions
   */
  registerModule(name: string, fetchFunctions: Map<string, (context: FetchContext) => Promise<any>>) {
    console.log(`[BobCore] 📦 Registering module: ${name} with ${fetchFunctions.size} functions`);
    this.modules.set(name, { name, fetchFunctions });
  }

  /**
   * Fetch data or serve from cache
   * @param key - Unique cache key
   * @param fetchFn - Function to fetch data on cache miss
   * @param ttl - Time to live in seconds
   * @param context - Fetch context (mode, userId, token)
   * @param tags - Optional tags for cache invalidation
   */
  async fetchOrServe<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl: number = BOB_METRICS_TTL_SECONDS,
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
      console.log(`[BobCore] ✅ CACHE_HIT: ${key} (TTL: ${Math.round((cached.expiresAt - now) / 1000)}s remaining)`);
      return cached.value as T;
    }

    // Cache miss - fetch data
    this.stats.misses++;
    const startTime = Date.now();
    console.log(`[BobCore] ❌ CACHE_MISS: ${key} - fetching...`);

    try {
      const value = await fetchFn();
      const duration = Date.now() - startTime;

      // Store in cache
      this.cache.set(key, {
        key,
        value,
        expiresAt: Date.now() + (ttl * 1000),
        mode: context?.mode,
        tags
      });

      console.log(`[BobCore] 💾 Cached: ${key} (TTL: ${ttl}s, fetch: ${duration}ms)`);
      return value;
    } catch (error: any) {
      this.stats.errors++;
      this.stats.lastErrorTime = new Date();
      console.error(`[BobCore] ⚠️ FETCH_ERROR: ${key} -`, error.message);
      throw error;
    }
  }

  /**
   * Prefetch data without blocking
   * Used to warm cache before it's needed
   */
  async prefetch(
    key: string,
    fetchFn: () => Promise<any>,
    ttl: number = BOB_METRICS_TTL_SECONDS,
    context?: FetchContext,
    tags?: string[]
  ): Promise<void> {
    if (!BOB_ENABLED) {
      return;
    }

    console.log(`[BobCore] 🔄 PREFETCH_START: ${key} (mode: ${context?.mode || 'default'})`);
    
    try {
      await this.fetchOrServe(key, fetchFn, ttl, context, tags);
      this.stats.prefetches++;
      console.log(`[BobCore] ✅ PREFETCH_OK: ${key}`);
    } catch (error: any) {
      console.error(`[BobCore] ⚠️ PREFETCH_FAIL: ${key} -`, error.message);
    }
  }

  /**
   * Invoke fallback when Bob modules fail
   */
  async fallback<T>(key: string, fallbackFn: () => Promise<T>): Promise<T> {
    this.stats.fallbacks++;
    console.log(`[BobCore] 🔄 FALLBACK: ${key} - using original endpoint`);
    
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
      console.log(`[BobCore] 🗑️ INVALIDATED: ${key}`);
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
    console.log(`[BobCore] 🗑️ INVALIDATED_MODE: ${mode} (${keysToDelete.length} entries)`);
    
    return keysToDelete.length;
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
      console.log(`[BobCore] 🧹 Cleaned ${keysToDelete.length} expired cache entries`);
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
