import { storage } from "../storage";
import bcrypt from "bcryptjs";

/**
 * Test User Seeder
 * Ensures a test account always exists in non-production environments
 * for automated milestone runners and Replit testing
 */

export async function seedTestUser(): Promise<void> {
  // Skip in production
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  const testEmail = process.env.TEST_USER_EMAIL || "testuser@example.com";
  const testPassword = process.env.TEST_USER_PASSWORD || "TestPass123!";

  try {
    // Check if test user already exists
    const existingUser = await storage.getUserByEmail(testEmail);

    if (existingUser) {
      // Update password to match current environment variable (in case it changed)
      const passwordHash = bcrypt.hashSync(testPassword, 10);
      await storage.updateUser(existingUser.id, { password: passwordHash });
      
      console.log(`[Startup] Test account verified and password updated: ${testEmail}`);
      
      // Log to transparency system
      await storage.createTransparencyLog({
        taskName: 'System Bootstrap',
        resultSummary: `Test account verified and password updated: ${testEmail}`,
        success: true,
        duration: "0",
      });
      
      return;
    }

    // Create test user
    const passwordHash = bcrypt.hashSync(testPassword, 10);
    
    const testUser = await storage.createUser({
      username: "testuser",
      email: testEmail,
      password: passwordHash,
      displayName: "Test User",
      timezone: "UTC",
      isAdmin: true, // Test user is admin for backfill and system operations
      tradingMode: "paper",
      tradingStatus: "stopped",
    });

    // B-NEW-43 chunk 7 (2026-05-23): Phase 41F-L purged user-level trading
    // settings — `storage.createTradingSettings` was removed from the storage
    // class. The seeder used to create per-user TradingSettings for the test
    // user; the architecture is now mode-based (system_context keyed by mode,
    // not user), so no per-user trading-settings row is needed. The call is
    // deleted, not silenced — consistent with chunks 1-3 Phase 41F-L migration.
    console.log(`[Startup] Test account verified or created: ${testEmail}`);

    // Log to transparency system
    await storage.createTransparencyLog({
      taskName: 'System Bootstrap',
      resultSummary: `Test account verified or created: ${testEmail}`,
      success: true,
      duration: "0",
    });
  } catch (error) {
    console.error("[Startup] Error seeding test user:", error);
    
    // Log error to transparency system
    try {
      await storage.createTransparencyLog({
        taskName: 'System Bootstrap',
        resultSummary: `Failed to seed test user: ${error instanceof Error ? error.message : String(error)}`,
        success: false,
        duration: "0",
      });
    } catch (logError) {
      console.error("[Startup] Failed to log transparency error:", logError);
    }
    
    // Don't throw - let app continue even if seeding fails
  }
}
