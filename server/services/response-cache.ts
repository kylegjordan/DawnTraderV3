import { db } from "../db";
import { responseCache, aiTransparencyLog } from "@shared/schema";
import { eq, and, lt, sql } from "drizzle-orm";
import crypto from "crypto";

interface CacheStats {
  totalEntries: number;
  hits: number;
  misses: number;
  hitRate: number;
  expiredEntries: number;
}

interface CacheOptions {
  ttlSeconds?: number;
  logToTransparency?: boolean;
}

class ResponseCacheService {
  private readonly DEFAULT_TTL = 300; // 5 minutes in seconds (Milestone 14: reduced for chat responses)
  private hitCount = 0;
  private missCount = 0;

  /**
   * Generate a unique cache key from user ID, endpoint, and payload
   * 
   * Milestone 14 Design: Hybrid approach for chat responses
   * Format: userId::endpoint::conversationId::SHA256(message)
   * - Plain conversationId for scope visibility
   * - Hashed message for collision-free uniqueness
   * - Identical messages in same conversation always produce identical keys
   * - Different messages never collide (no truncation risk)
   */
  private generateCacheKey(
    userId: string,
    endpoint: string,
    payload?: any
  ): string {
    // For chat messages with conversationId, use hybrid composite key
    if (payload && payload.conversationId && payload.message) {
      const { conversationId, message } = payload;
      // Hash the full message to guarantee uniqueness without truncation collisions
      // Use full 64-char SHA256 hex digest (no truncation per Milestone 14 requirement)
      const messageHash = crypto
        .createHash("sha256")
        .update(message)
        .digest("hex"); // Full 64-character hash
      
      const compositeKey = `${userId}::${endpoint}::${conversationId}::${messageHash}`;
      return compositeKey;
    }
    
    // Fallback to hashed key for other use cases (backward compatibility)
    const dataToHash = JSON.stringify({
      userId,
      endpoint,
      payload: payload || {},
    });

    return crypto
      .createHash("sha256")
      .update(dataToHash)
      .digest("hex")
      .substring(0, 64);
  }

  /**
   * Get cached response if it exists and hasn't expired
   */
  async get(
    userId: string,
    endpoint: string,
    payload?: any
  ): Promise<any | null> {
    const cacheKey = this.generateCacheKey(userId, endpoint, payload);

    try {
      const cached = await db.query.responseCache.findFirst({
        where: and(
          eq(responseCache.userId, userId),
          eq(responseCache.cacheKey, cacheKey)
        ),
      });

      if (!cached) {
        this.missCount++;
        return null;
      }

      // Check if cache entry has expired
      const now = new Date();
      if (cached.expiresAt < now) {
        this.missCount++;
        // Entry expired, delete it
        await db
          .delete(responseCache)
          .where(eq(responseCache.id, cached.id));
        return null;
      }

      // Cache hit! Update hitCount and lastAccessedAt
      this.hitCount++;
      await db
        .update(responseCache)
        .set({
          hitCount: sql`${responseCache.hitCount} + 1`,
          lastAccessedAt: new Date(),
        })
        .where(eq(responseCache.id, cached.id));

      return cached.responseData;
    } catch (error) {
      console.error("[ResponseCache] Error getting cached response:", error);
      this.missCount++;
      return null;
    }
  }

  /**
   * Set a cached response with TTL
   */
  async set(
    userId: string,
    endpoint: string,
    payload: any,
    responseData: any,
    options: CacheOptions = {}
  ): Promise<void> {
    const cacheKey = this.generateCacheKey(userId, endpoint, payload);
    const ttlSeconds = options.ttlSeconds || this.DEFAULT_TTL;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    try {
      // Check if cache entry already exists (should be prevented by unique index)
      const existing = await db.query.responseCache.findFirst({
        where: and(
          eq(responseCache.userId, userId),
          eq(responseCache.cacheKey, cacheKey)
        ),
      });

      if (existing) {
        // Update existing entry
        await db
          .update(responseCache)
          .set({
            endpoint,
            requestPayload: payload,
            responseData,
            expiresAt,
            hitCount: 0, // Reset hit count to 0 for new cached data
            lastAccessedAt: new Date(),
          })
          .where(eq(responseCache.id, existing.id));
      } else {
        // Insert new entry
        await db.insert(responseCache).values({
          userId,
          cacheKey,
          endpoint,
          requestPayload: payload,
          responseData,
          expiresAt,
          hitCount: 0, // Start at 0, will increment to 1 on first hit
        });
      }

      // Log to transparency if requested
      if (options.logToTransparency) {
        await this.logToTransparency(userId, endpoint, "cache_set");
      }
    } catch (error) {
      console.error("[ResponseCache] Error setting cache:", error);
    }
  }

  /**
   * Clear cache for a specific user and endpoint (optional)
   */
  async clear(userId: string, endpoint?: string): Promise<number> {
    try {
      const conditions = endpoint
        ? and(eq(responseCache.userId, userId), eq(responseCache.endpoint, endpoint))
        : eq(responseCache.userId, userId);

      const result = await db.delete(responseCache).where(conditions);

      return result.rowCount || 0;
    } catch (error) {
      console.error("[ResponseCache] Error clearing cache:", error);
      return 0;
    }
  }

  /**
   * Purge all expired cache entries (run periodically by scheduler)
   */
  async purgeExpired(): Promise<number> {
    try {
      const now = new Date();
      const result = await db
        .delete(responseCache)
        .where(lt(responseCache.expiresAt, now));

      const purgedCount = result.rowCount || 0;

      if (purgedCount > 0) {
        console.log(`[ResponseCache] Purged ${purgedCount} expired cache entries`);
        
        // Log to transparency
        await this.logToTransparency("system", "cache_purge", "purge_expired", {
          purgedCount,
        });
      }

      return purgedCount;
    } catch (error) {
      console.error("[ResponseCache] Error purging expired entries:", error);
      return 0;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    try {
      // Count total entries
      const totalResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(responseCache);
      const totalEntries = totalResult[0]?.count || 0;

      // Count expired entries
      const now = new Date();
      const expiredResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(responseCache)
        .where(lt(responseCache.expiresAt, now));
      const expiredEntries = expiredResult[0]?.count || 0;

      // Calculate hit rate
      const totalRequests = this.hitCount + this.missCount;
      const hitRate = totalRequests > 0 ? (this.hitCount / totalRequests) * 100 : 0;

      return {
        totalEntries,
        hits: this.hitCount,
        misses: this.missCount,
        hitRate: Math.round(hitRate * 100) / 100, // Round to 2 decimals
        expiredEntries,
      };
    } catch (error) {
      console.error("[ResponseCache] Error getting stats:", error);
      return {
        totalEntries: 0,
        hits: this.hitCount,
        misses: this.missCount,
        hitRate: 0,
        expiredEntries: 0,
      };
    }
  }

  /**
   * Reset hit/miss counters
   */
  resetCounters(): void {
    this.hitCount = 0;
    this.missCount = 0;
  }

  /**
   * Log cache operations to AI transparency log
   */
  private async logToTransparency(
    userId: string,
    endpoint: string,
    action: string,
    details?: any
  ): Promise<void> {
    try {
      // B-NEW-43 chunk 7 (2026-05-23): `aiTransparencyLog` schema has no
       // `details` column — the structured detail object is serialized into
       // the existing `notes` text field. Same information, schema-honest.
      await db.insert(aiTransparencyLog).values({
        userId,
        taskName: "cache-layer",
        success: true,
        resultSummary: `Cache ${action}`,
        notes: JSON.stringify({
          endpoint,
          action,
          ...details,
        }),
      });
    } catch (error) {
      console.error("[ResponseCache] Error logging to transparency:", error);
    }
  }

  /**
   * Wrapper for caching expensive operations
   */
  async withCache<T>(
    userId: string,
    endpoint: string,
    payload: any,
    operation: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    // Try to get from cache first
    const cached = await this.get(userId, endpoint, payload);
    
    if (cached !== null) {
      return cached as T;
    }

    // Cache miss, execute the operation
    const result = await operation();

    // Store result in cache
    await this.set(userId, endpoint, payload, result, options);

    return result;
  }
}

export const responseCacheService = new ResponseCacheService();
