import { db } from '../db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';

/**
 * Phase 31.I: System User Cache
 * 
 * Provides memoized resolution of system user IDs (e.g., for schedulers)
 * without hardcoding UUIDs in source code.
 */
class SystemUserCacheService {
  private cache: Map<string, string> = new Map();

  /**
   * Resolve a username to its user ID, with memoization
   * @param username - The username to resolve
   * @returns The user ID (UUID)
   */
  async getOrResolve(username: string): Promise<string> {
    // Check cache first
    if (this.cache.has(username)) {
      return this.cache.get(username)!;
    }

    // Query database
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    if (!user) {
      throw new Error(`[SystemUserCache] User not found: ${username}`);
    }

    // Cache and return
    this.cache.set(username, user.id);
    console.log(`[SystemUserCache] Resolved and cached: ${username} → ${user.id}`);
    return user.id;
  }

  /**
   * Clear the cache (useful for tests)
   */
  clearCache(): void {
    this.cache.clear();
  }
}

export const SystemUserCache = new SystemUserCacheService();
