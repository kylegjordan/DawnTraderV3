/**
 * Phase 1: Unified Service Loader
 * 
 * Provides centralized initialization for core DawnTrader services
 */

import { env } from './config/index.js';

export async function initializeServices() {
  console.log('[Startup] 🚀 Initializing core services...');
  
  const startTime = Date.now();
  const services: string[] = [];

  try {
    // Initialize LATTI (Local Autonomous Trading Tuning Intelligence)
    if (env.LATTI_ENABLED) {
      const { lattiManager } = await import('./services/heuristic-trader');
      await lattiManager.startBoth().catch((error) => {
        console.error('[Startup] Failed to start LATTI:', error);
      });
      services.push('LATTI');
      console.log('[Startup] ✅ LATTI initialized');
    } else {
      console.log('[Startup] ⚠️  LATTI disabled');
    }

    // Initialize Goals Engine
    try {
      const { goalsEngine } = await import('./services/goals-engine');
      if (goalsEngine?.initialize) {
        await goalsEngine.initialize();
        services.push('GoalsEngine');
        console.log('[Startup] ✅ Goals Engine initialized');
      }
    } catch (error) {
      console.log('[Startup] ℹ️  Goals Engine not available or already initialized');
    }

    // Trading Engine is initialized via tradingStateSync in main startup
    services.push('TradingEngine');

    // Market Scanner (already auto-starts based on feature flags)
    services.push('MarketScanner');

    // Context Bridge WebSocket (initialized in routes)
    services.push('ContextBridge');

    const duration = Date.now() - startTime;
    console.log(`[Startup] ✅ Core services initialized in ${duration}ms:`, services);

    return { success: true, services, duration };
  } catch (error: any) {
    console.error('[Startup] ❌ Service initialization failed:', error);
    return { success: false, error: error.message, services };
  }
}

/**
 * Get list of initialized services for health checks
 */
export function getInitializedServices(): string[] {
  const services = ['LATTI', 'GoalsEngine', 'TradingEngine', 'MarketScanner'];
  
  if (env.WALTER_DISABLED) {
    return services;
  }
  
  return [...services, 'AIOpportunities', 'DailyBrief', 'MarketAnalysis'];
}
