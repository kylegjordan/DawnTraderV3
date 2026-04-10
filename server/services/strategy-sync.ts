import { storage } from '../storage';

/**
 * StrategySync Service (Phase 8.5 Addendum K.3 - Global Context)
 *
 * Directive 12.3.2: Updated to include all 17 canonical strategies.
 * Ensures all strategies exist in strategy_settings for the global context.
 * Runs on application startup to maintain data integrity across Dashboard and Cortex.
 * Uses global context instead of per-user strategies (shared workspace).
 *
 * Original 9: vwap_pullback, abcd_long, sma_trend_ride, breakout, mean_reversion,
 *             range_trade, vwap_bounce, liquidity_trap, dhma
 * New 8 (12.3.2): morning_star, inside_bar_reversal, support_bounce, pivot_shift,
 *                  reverse_impulse, defensive_hedge, adaptive_flow, volatility_edge
 *
 * NOTE: 'range_trading' renamed to 'range_trade' for canonical consistency.
 * Both names are accepted (range_trading as legacy alias).
 */

// All 17 canonical strategies
const CORE_STRATEGIES = [
  // Original 9
  'vwap_pullback',
  'abcd_long',
  'sma_trend_ride',
  'breakout',
  'mean_reversion',
  'range_trade',        // Directive 12.3.2: Canonical name (was 'range_trading')
  'vwap_bounce',
  'liquidity_trap',
  'dhma',
  // Directive 12.3.2: 8 new strategies
  'morning_star',
  'inside_bar_reversal',
  'support_bounce',
  'pivot_shift',
  'reverse_impulse',
  'defensive_hedge',
  'adaptive_flow',
  'volatility_edge',
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
      console.log(`[12.3.2][StrategySync] Added ${added.length} missing strategies for global context in ${mode} mode: ${added.join(', ')}`);
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
    console.log('[12.3.2][StrategySync] Starting global strategy sync (17 canonical strategies)...');

    let totalAdded = 0;

    // Sync for each mode (live and paper) in global context
    for (const mode of MODES) {
      const result = await this.syncGlobalStrategies(mode);
      totalAdded += result.added.length;
    }

    const duration = Date.now() - startTime;
    console.log(`[12.3.2][StrategySync] Completed in ${duration}ms: global context processed, ${totalAdded} strategies added`);

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
