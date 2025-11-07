/**
 * Phase 4A-3: Gemini-Guided Cache Optimization
 * 
 * Provides instrumented caching layer with extended TTL, hit/miss tracking,
 * and request coalescing to achieve ≥85% cache hit ratio
 */

import { profiler } from './gemini-profiler';
import { recordCacheMetric } from '../utils/instrumentation';

// Phase 4A Remediation: Gate verbose logs behind debug flag
const CACHE_DEBUG = process.env.CACHE_DEBUG === 'true';

interface CacheEntry {
  v: any;
  exp: number;
}

const cache = new Map<string, CacheEntry>();
let hits = 0;
let misses = 0;

// Request coalescing: prevent duplicate in-flight requests
const pending: Record<string, Promise<any>> = {};

/**
 * Get cached value with instrumentation
 */
export function getCache(key: string): any | null {
  const e = cache.get(key);
  if (!e || e.exp < Date.now()) {
    cache.delete(key);
    misses++;
    profiler.recordCacheMiss(); // Phase 4A-5: Track for profiling
    recordCacheMetric(false, { key }); // Phase 5C: Metrics tracking
    if (CACHE_DEBUG) console.log(`[Gemini-Cache] MISS ${key}`);
    return null;
  }
  hits++;
  profiler.recordCacheHit(); // Phase 4A-5: Track for profiling
  recordCacheMetric(true, { key }); // Phase 5C: Metrics tracking
  if (CACHE_DEBUG) console.log(`[Gemini-Cache] HIT ${key} (TTL: ${Math.floor((e.exp - Date.now()) / 1000)}s remaining)`);
  return e.v;
}

/**
 * Set cache value with extended TTL (default 90s)
 * Phase 4B: Now uses adaptive TTL from environment if available
 */
export function setCache(key: string, v: any, ttl?: number): void {
  // Phase 4B: Use adaptive TTL from environment if no explicit TTL provided
  const adaptiveTTL = ttl || Number(process.env.DEFAULT_CACHE_TTL) || 90000;
  cache.set(key, { v, exp: Date.now() + adaptiveTTL });
  if (CACHE_DEBUG) console.log(`[Gemini-Cache] SET ${key} (TTL: ${adaptiveTTL / 1000}s${ttl ? '' : ' [adaptive]'})`);
}

/**
 * Get cache statistics for profiling
 */
export function cacheStats(): { hits: number; misses: number; ratio: number; size: number } {
  const total = hits + misses;
  const ratio = total === 0 ? 0 : hits / total;
  return { hits, misses, ratio, size: cache.size };
}

/**
 * Request coalescing: prevent duplicate in-flight fetches
 * 
 * @param key - Unique key for the request
 * @param fn - Function that performs the actual fetch
 * @returns Promise that resolves to the fetched data
 */
export async function coalesce<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (key in pending) {
    if (CACHE_DEBUG) console.log(`[Gemini-Cache] COALESCE ${key} (request already in-flight)`);
    return pending[key] as Promise<T>;
  }
  
  if (CACHE_DEBUG) console.log(`[Gemini-Cache] FETCH ${key} (first request)`);
  pending[key] = fn().finally(() => {
    delete pending[key];
  });
  
  return pending[key] as Promise<T>;
}

/**
 * Clear expired entries (run periodically)
 */
export function cleanExpired(): number {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [key, entry] of cache.entries()) {
    if (entry.exp < now) {
      cache.delete(key);
      cleaned++;
    }
  }
  
  if (cleaned > 0 && CACHE_DEBUG) {
    console.log(`[Gemini-Cache] Cleaned ${cleaned} expired entries (${cache.size} remaining)`);
  }
  
  return cleaned;
}

/**
 * Reset cache statistics (for testing)
 */
export function resetStats(): void {
  hits = 0;
  misses = 0;
  if (CACHE_DEBUG) console.log('[Gemini-Cache] Statistics reset');
}

/**
 * Clear all cache entries
 */
export function clearCache(): void {
  const size = cache.size;
  cache.clear();
  if (CACHE_DEBUG) console.log(`[Gemini-Cache] Cleared ${size} entries`);
}

// Run cleanup every 10 seconds
setInterval(cleanExpired, 10000);

// Log cache stats every 60 seconds (Phase 4A: Only if CACHE_DEBUG)
// Phase 5C: Also report to metrics service
setInterval(() => {
  const stats = cacheStats();
  
  // Phase 5C: Record cache hit ratio metric
  import('../services/metrics-service').then(({ metricsService }) => {
    metricsService.recordMetric('cache_hit_ratio', stats.ratio * 100, {
      service: 'cache',
      phase: '5C',
    });
  });
  
  if (!CACHE_DEBUG) return;
  console.log(`[Gemini-Cache] Stats: ${stats.hits} hits, ${stats.misses} misses, ${(stats.ratio * 100).toFixed(1)}% hit ratio, ${stats.size} entries`);
}, 60000);
