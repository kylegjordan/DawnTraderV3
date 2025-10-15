import { storage } from '../storage';

/**
 * StrategySync Service (Phase 8.5 Addendum F)
 * 
 * Ensures all 8 core trading strategies exist in strategy_settings for every user.
 * Runs on application startup to maintain data integrity across Dashboard, Walter, and Cortex.
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

export class StrategySyncService {
  /**
   * Sync all strategies for a specific user and mode
   */
  async syncUserStrategies(userId: string, mode: 'live' | 'paper'): Promise<{
    added: string[];
    existing: number;
  }> {
    const existingStrategies = await storage.listStrategySettings({ userId, mode });
    const existingStrategyNames = new Set(existingStrategies.map(s => s.strategy));
    
    const missing = CORE_STRATEGIES.filter(strategy => !existingStrategyNames.has(strategy));
    const added: string[] = [];
    
    // Insert missing strategies with enabled=false by default
    for (const strategy of missing) {
      await storage.upsertStrategySettings({
        userId,
        mode,
        strategy,
        enabled: false,
        // Default parameters (can be adjusted per strategy later)
        params: JSON.stringify({
          riskLevel: 'medium',
          maxPositionSize: 0.1,
        }),
      });
      added.push(strategy);
    }
    
    if (added.length > 0) {
      console.log(`[StrategySync] Added ${added.length} missing strategies for user ${userId} in ${mode} mode: ${added.join(', ')}`);
    }
    
    return {
      added,
      existing: existingStrategies.length,
    };
  }
  
  /**
   * Sync all strategies for all users
   */
  async syncAllUsers(): Promise<{
    totalAdded: number;
    usersProcessed: number;
  }> {
    const startTime = Date.now();
    console.log('[StrategySync] Starting full strategy sync...');
    
    let totalAdded = 0;
    let usersProcessed = 0;
    
    // Get all users
    const users = await storage.getAllUsers();
    
    for (const user of users) {
      for (const mode of MODES) {
        const result = await this.syncUserStrategies(user.id, mode);
        totalAdded += result.added.length;
      }
      usersProcessed++;
    }
    
    const duration = Date.now() - startTime;
    console.log(`[StrategySync] Completed in ${duration}ms: ${usersProcessed} users processed, ${totalAdded} strategies added`);
    
    return {
      totalAdded,
      usersProcessed,
    };
  }
  
  /**
   * Get all core strategy names
   */
  getCoreStrategies(): readonly string[] {
    return CORE_STRATEGIES;
  }
  
  /**
   * Verify all strategies exist for a user
   */
  async verifyUserStrategies(userId: string, mode: 'live' | 'paper'): Promise<boolean> {
    const existingStrategies = await storage.listStrategySettings({ userId, mode });
    const existingStrategyNames = new Set(existingStrategies.map(s => s.strategy));
    
    return CORE_STRATEGIES.every(strategy => existingStrategyNames.has(strategy));
  }
}

export const strategySyncService = new StrategySyncService();
