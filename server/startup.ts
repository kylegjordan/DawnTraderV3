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
    // Directive 11.8B: LATTI system removed - parallel adaptive systems eliminated
    // Phase 11 Predictive Learning is the single authority for parameter adjustment
    console.log('[Startup] [11.8B] LATTI removed - Predictive Learning is single authority');

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
 * Directive 11.8B: Removed LATTI and GoalsEngine (parallel adaptive systems)
 * Phase 11 Predictive Learning is now the single authority
 */
export function getInitializedServices(): string[] {
  const services = ['PredictiveLearning', 'TradingEngine'];
  
  return services;
}
