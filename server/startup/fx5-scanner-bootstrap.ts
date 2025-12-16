/**
 * REB 2.7: FX5 Scanner Bootstrap - Unconditional Startup
 * Directive 8.8.4-C.15.A: Added health monitoring with auto-recovery
 * 
 * Idempotent helper to start FX5Scanner independent of:
 * - Trading engine state
 * - Route registration
 * - Any other async startup work
 * 
 * Called early from server/index.ts to ensure scanner starts
 * BEFORE complex route registration begins.
 */

let bootstrapped = false;

export async function bootstrapFX5Scanner(): Promise<void> {
  if (bootstrapped) {
    console.log('[FX5Bootstrap] Already bootstrapped, skipping');
    return;
  }

  try {
    console.log('[FX5Bootstrap] Starting FX5 Scanner (unconditional)...');
    
    // Import and start scanner
    const { fx5Scanner } = await import('../services/fx5-scanner.js');
    await fx5Scanner.start();
    
    // C15A: Start health monitor for auto-recovery
    const { fx5HealthMonitor } = await import('../services/fx5-health-monitor.js');
    fx5HealthMonitor.start();
    
    console.log('[FX5Bootstrap] ✅ FX5 Scanner started successfully');
    console.log('[FX5Bootstrap] ✅ FX5 Health Monitor started (auto-recovery enabled)');
    bootstrapped = true;
  } catch (error) {
    console.error('[FX5Bootstrap] ❌ Failed to start FX5 Scanner:', error);
    // Don't throw - allow server startup to continue even if scanner fails
  }
}

/**
 * C15A: Allow manual reset of bootstrap flag (for recovery scenarios)
 */
export function resetBootstrapFlag(): void {
  bootstrapped = false;
  console.log('[FX5Bootstrap] Bootstrap flag reset');
}
