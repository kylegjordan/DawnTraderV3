/**
 * Directive 8.8.4-A4.R10R-3.T4: Adaptive Concurrency Tuner (ACT) Configuration
 * 
 * Extracted to separate module to avoid circular dependencies between
 * rtb-refresh-service.ts and ready_to_buy_service.ts
 */

export const ACT_CONFIG = {
  MIN_POOL: 3,
  MAX_POOL: 10,
  TARGET_DURATION_MS: 5000,
  SAFE_CPU_THRESHOLD: 60, // %
  SCALE_STEP: 1,
  INITIAL_POOL: 5
};

// Mutable adaptive pool size - shared across modules
let currentPoolSize = ACT_CONFIG.INITIAL_POOL;

/**
 * Get the current adaptive pool size for concurrent signal processing
 */
export function getAdaptivePoolSize(): number {
  return currentPoolSize;
}

/**
 * Set the adaptive pool size (called by RTB Refresh Service)
 */
export function setAdaptivePoolSize(size: number): void {
  currentPoolSize = Math.min(ACT_CONFIG.MAX_POOL, Math.max(ACT_CONFIG.MIN_POOL, size));
}

/**
 * Reset pool size to initial value (for testing/restart)
 */
export function resetAdaptivePoolSize(): void {
  currentPoolSize = ACT_CONFIG.INITIAL_POOL;
}
