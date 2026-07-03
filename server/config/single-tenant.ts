// Phase 2C: Single-Tenant Configuration
// Emergency conversion from multi-user to single-tenant architecture
// Date: 2025-11-06

export const SINGLE_TENANT_CONFIG = {
  // Single-tenant mode enabled
  ENABLED: true,
  
  // Global context ID for all operations (replaces per-user isolation)
  GLOBAL_CONTEXT_ID: 'default',
  
  // Mode-based isolation (paper vs live) is preserved
  MODE_ISOLATION: true,
  
  // User authentication still required for access control
  AUTH_REQUIRED: true,
  
  // All authenticated users see the same data
  SHARED_DATA: true,
  
  // Phase 2C metadata
  MIGRATION_DATE: '2025-11-06',
  MIGRATED_FROM: 'multi-user',
  TABLES_MIGRATED: [
    'portfolio_state',
    'strategy_settings',
    'active_engine_sessions',
    'system_context',
    'trading_settings_legacy'
  ]
} as const;

export type SingleTenantConfig = typeof SINGLE_TENANT_CONFIG;

// Runtime assertion: Verify single-tenant mode
export function assertSingleTenant(context: string): void {
  if (!SINGLE_TENANT_CONFIG.ENABLED) {
    console.warn(`[SingleTenantViolation] ${context} - SINGLE_TENANT mode not enabled`);
  }
}

// Helper: Get global context ID
export function getGlobalContextId(): string {
  return SINGLE_TENANT_CONFIG.GLOBAL_CONTEXT_ID;
}

// Helper: Check if user ID should be ignored
export function shouldIgnoreUserId(): boolean {
  return SINGLE_TENANT_CONFIG.ENABLED;
}

// Export as default
export default SINGLE_TENANT_CONFIG;
