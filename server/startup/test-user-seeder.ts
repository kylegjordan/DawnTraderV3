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
      console.log(`[Startup] Test account already exists: ${testEmail}`);
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
      tradingMode: "paper",
      tradingStatus: "stopped",
    });

    // Create default trading settings for test user
    await storage.createTradingSettings({ 
      userId: testUser.id,
    });

    console.log(`[Startup] Test account verified or created: ${testEmail}`);

    // Log to transparency system
    await storage.createTransparencyLog({
      taskName: 'System Bootstrap',
      resultSummary: `Test account verified or created: ${testEmail}`,
      success: true,
      executedAt: new Date(),
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
        executedAt: new Date(),
        duration: "0",
      });
    } catch (logError) {
      console.error("[Startup] Failed to log transparency error:", logError);
    }
    
    // Don't throw - let app continue even if seeding fails
  }
}
