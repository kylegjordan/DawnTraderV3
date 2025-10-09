import { responseCacheService } from "./response-cache";

class CachePurgeTask {
  name = "Cache Purge";
  description = "Hourly cleanup of expired cache entries";
  frequency = "Every 1 hour";
  intervalMs = 1 * 60 * 60 * 1000; // 1 hour

  async run(): Promise<void> {
    console.log("[CachePurgeTask] Starting cache purge cycle...");

    try {
      const purgedCount = await responseCacheService.purgeExpired();
      
      if (purgedCount > 0) {
        console.log(`[CachePurgeTask] Successfully purged ${purgedCount} expired cache entries`);
      } else {
        console.log("[CachePurgeTask] No expired entries to purge");
      }
    } catch (error) {
      console.error("[CachePurgeTask] Error during cache purge:", error);
      throw error;
    }
  }
}

export const cachePurgeTask = new CachePurgeTask();
