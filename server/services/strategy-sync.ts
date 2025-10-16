import { storage } from '../storage';

/**
 * StrategySync Service (Phase 8.5 Addendum K.3 - Global Context)
 * 
 * Ensures all 8 core trading strategies exist in strategy_settings for the global context.
 * Runs on application startup to maintain data integrity across Dashboard, Walter, and Cortex.
 * Uses global context instead of per-user strategies (shared workspace).
 */

// All 8 core strategies
const CORE_STRATEGIES = [
  'vwap_pullback',
  'abcd_long',
  'sma_trend_ride',
  'breakout',
  'mean_reversion',
  'range_trading',
  'vwap_bounce',
  'liquidity_trap',
] as const;

const MODES: ('live' | 'paper')[] = ['live', 'paper'];
const GLOBAL_CONTEXT_ID = 'default';

export class StrategySyncService {
  /**
   * Sync all strategies for global context and mode
   */
  async syncGlobalStrategies(mode: 'live' | 'paper'): Promise<{
    added: string[];
    existing: number;
  }> {
    const existingStrategies = await storage.listStrategySettings({ globalContextId: GLOBAL_CONTEXT_ID, mode });
    const existingStrategyNames = new Set(existingStrategies.map(s => s.strategy));
    
    const missing = CORE_STRATEGIES.filter(strategy => !existingStrategyNames.has(strategy));
    const added: string[] = [];
    
    // Insert missing strategies with enabled=false by default
    for (const strategy of missing) {
      await storage.upsertStrategySettings({
        globalContextId: GLOBAL_CONTEXT_ID,
        mode,
        strategy,
        enabled: false,
        params: JSON.stringify({
          riskLevel: 'medium',
          maxPositionSize: 0.1,
        }),
      });
      added.push(strategy);
    }
    
    if (added.length > 0) {
      console.log(`[StrategySync] Added ${added.length} missing strategies for global context in ${mode} mode: ${added.join(', ')}`);
    }
    
    return {
      added,
      existing: existingStrategies.length,
    };
  }
  
  /**
   * Sync all strategies for all modes (global context)
   */
  async syncAllUsers(): Promise<{
    totalAdded: number;
    usersProcessed: number;
  }> {
    const startTime = Date.now();
    console.log('[StrategySync] Starting global strategy sync...');
    
    let totalAdded = 0;
    
    // Sync for each mode (live and paper) in global context
    for (const mode of MODES) {
      const result = await this.syncGlobalStrategies(mode);
      totalAdded += result.added.length;
    }
    
    const duration = Date.now() - startTime;
    console.log(`[StrategySync] Completed in ${duration}ms: global context processed, ${totalAdded} strategies added`);
    
    return {
      totalAdded,
      usersProcessed: 1, // Global context = 1 "user"
    };
  }
  
  /**
   * Get all core strategy names
   */
  getCoreStrategies(): readonly string[] {
    return CORE_STRATEGIES;
  }
  
  /**
   * Verify all strategies exist for global context and mode
   */
  async verifyUserStrategies(userId: string, mode: 'live' | 'paper'): Promise<boolean> {
    const existingStrategies = await storage.listStrategySettings({ globalContextId: GLOBAL_CONTEXT_ID, mode });
    const existingStrategyNames = new Set(existingStrategies.map(s => s.strategy));
    
    return CORE_STRATEGIES.every(strategy => existingStrategyNames.has(strategy));
  }
}

export const strategySyncService = new StrategySyncService();
