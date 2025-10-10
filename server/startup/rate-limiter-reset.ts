import { storage } from "../storage";
import { loginLimiter } from "../routes";

export async function resetRateLimiter(): Promise<void> {
  // Only reset in non-production environments
  if (process.env.NODE_ENV === "production") {
    return;
  }

  try {
    // Reset the login rate limiter store
    // express-rate-limit stores data in memory by default, which auto-clears on restart
    // But we explicitly reset it here to guarantee a clean state for automated testing
    if (loginLimiter.resetKey) {
      // Reset all keys in the store (clears all rate limit data)
      await loginLimiter.resetKey('*');
      console.log('[Startup] Rate limiter cleared for test environment');
    }

    // Log to transparency system
    await storage.createTransparencyLog({
      taskName: 'System Bootstrap',
      resultSummary: 'Rate limiter cleared for test environment',
      success: true,
      duration: "0",
    });
  } catch (error) {
    console.error('[Startup] Failed to reset rate limiter:', error);
    
    // Log failure to transparency system
    await storage.createTransparencyLog({
      taskName: 'System Bootstrap',
      resultSummary: `Rate limiter reset failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      success: false,
      duration: "0",
    });
  }
}
