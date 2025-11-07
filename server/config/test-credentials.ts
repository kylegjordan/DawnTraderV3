/**
 * Phase 5B.HF - Test Credentials Configuration
 * 
 * Centralized configuration for test user credentials.
 * Uses environment variables with secure fallbacks.
 */

export const TEST_USER = process.env.APP_TEST_USERNAME ?? "";
export const TEST_PASS = process.env.APP_TEST_PASSWORD ?? "";

/**
 * Validates that test credentials are configured
 * @returns true if credentials are available
 */
export function hasTestCredentials(): boolean {
  return TEST_USER.length > 0 && TEST_PASS.length > 0;
}

/**
 * Get test credentials with validation
 * @throws Error if credentials are not configured
 */
export function getTestCredentials(): { username: string; password: string } {
  if (!hasTestCredentials()) {
    throw new Error(
      'Test credentials not configured. Please set APP_TEST_USERNAME and APP_TEST_PASSWORD environment variables.'
    );
  }
  return {
    username: TEST_USER,
    password: TEST_PASS,
  };
}
