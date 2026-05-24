import { storage } from '../storage';
import type { AssetClass } from '@shared/asset-classes';

/**
 * StrategySync Service (Phase 8.5 Addendum K.3 - Global Context)
 *
 * Directive 12.3.2: Updated to include all 17 canonical strategies.
 * B63: +1 strong_bull_trend → 18 canonical strategies.
 * B79.0d: +1 orb → 19 canonical strategies.
 * B79.0n.STRATEGY (2026-05-24): CORE_STRATEGIES updated to 19 entries (was 17;
 * RISK-014 from SYSTEM_MANUAL §1878 closed by this update). Per-asset-class sync
 * loop added — strategy_settings rows now scoped by (globalContextId, mode, strategy,
 * assetClass). Schema migration at 2026-05-24-b79-0n-strategy-per-class.sql adds the
 * asset_class column + swaps the UNIQUE constraint.
 *
 * Ensures all strategies exist in strategy_settings for the global context.
 * Runs on application startup to maintain data integrity across Dashboard and Cortex.
 * Uses global context instead of per-user strategies (shared workspace).
 *
 * Original 9: vwap_pullback, abcd_long, sma_trend_ride, breakout, mean_reversion,
 *             range_trade, vwap_bounce, liquidity_trap, dhma
 * New 8 (12.3.2): morning_star, inside_bar_reversal, support_bounce, pivot_shift,
 *                  reverse_impulse, defensive_hedge, adaptive_flow, volatility_edge
 * B63 + B79.0d: strong_bull_trend, orb (the 18th and 19th)
 *
 * NOTE: 'range_trading' renamed to 'range_trade' for canonical consistency.
 * Both names are accepted (range_trading as legacy alias).
 */

// All 19 canonical strategies (was 17 pre-B79.0n.STRATEGY).
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
  // B63 — strong-bull-trend (Path D)
  'strong_bull_trend',
  // B79.0d — Opening Range Breakout (xstock_spot only)
  'orb',
] as const;

const MODES: ('live' | 'paper')[] = ['live', 'paper'];

// B79.0n.STRATEGY: per-asset-class sync loop. xStock rows seed enabled=false
// (active-trading not wired pending WIRE-IN sub-batch #16); crypto rows preserve
// existing `enabled` state by virtue of upsert-not-overwrite shape.
const SYNC_ASSET_CLASSES: AssetClass[] = ['crypto_spot', 'xstock_spot'];

const GLOBAL_CONTEXT_ID = 'default';

export class StrategySyncService {
  /**
   * Sync all strategies for global context + mode + asset class.
   *
   * B79.0n.STRATEGY: added `assetClass` parameter. Existing rows scoped by
   * `(globalContextId, mode, strategy, asset_class)` are preserved unchanged
   * (existsBefore check) — only missing rows get seeded with enabled=false.
   */
  async syncGlobalStrategies(mode: 'live' | 'paper', assetClass: AssetClass): Promise<{
    added: string[];
    existing: number;
  }> {
    const existingStrategies = await storage.listStrategySettings({
      globalContextId: GLOBAL_CONTEXT_ID,
      mode,
      assetClass,
    });
    const existingStrategyNames = new Set(existingStrategies.map(s => s.strategy));

    const missing = CORE_STRATEGIES.filter(strategy => !existingStrategyNames.has(strategy));
    const added: string[] = [];

    // Insert missing strategies with enabled=false by default.
    // B79.0n.STRATEGY: xStock rows seeded enabled=false (active-trading not wired yet);
    // crypto rows historically had enabled=true defaults but only the missing ones get
    // inserted here — pre-existing crypto rows retain their state via the upsert exists-check.
    for (const strategy of missing) {
      await storage.upsertStrategySettings({
        globalContextId: GLOBAL_CONTEXT_ID,
        mode,
        strategy,
        assetClass,
        enabled: false,
        params: JSON.stringify({
          riskLevel: 'medium',
          maxPositionSize: 0.1,
        }),
      });
      added.push(strategy);
    }

    if (added.length > 0) {
      console.log(`[12.3.2][StrategySync] Added ${added.length} missing strategies for global context in ${mode}/${assetClass}: ${added.join(', ')}`);
    }

    return {
      added,
      existing: existingStrategies.length,
    };
  }

  /**
   * Sync all strategies for all modes × all asset classes (global context).
   *
   * B79.0n.STRATEGY: nested loop adds asset-class dimension. Pre-batch was
   * single MODES loop; post-batch is MODES × SYNC_ASSET_CLASSES.
   */
  async syncAllUsers(): Promise<{
    totalAdded: number;
    usersProcessed: number;
  }> {
    const startTime = Date.now();
    console.log('[B79.0n.STRATEGY][StrategySync] Starting global strategy sync (19 canonical strategies × 2 asset classes)...');

    let totalAdded = 0;

    // Sync for each (mode, asset class) combination in global context.
    for (const mode of MODES) {
      for (const assetClass of SYNC_ASSET_CLASSES) {
        const result = await this.syncGlobalStrategies(mode, assetClass);
        totalAdded += result.added.length;
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[B79.0n.STRATEGY][StrategySync] Completed in ${duration}ms: global context processed, ${totalAdded} strategies added across ${MODES.length} modes × ${SYNC_ASSET_CLASSES.length} asset classes`);

    return {
      totalAdded,
      usersProcessed: 1, // Global context = 1 "user"
    };
  }

  /**
   * Get all core strategy names.
   */
  getCoreStrategies(): readonly string[] {
    return CORE_STRATEGIES;
  }

  /**
   * Verify all strategies exist for global context + mode + asset class.
   *
   * B79.0n.STRATEGY: added `assetClass` parameter (defaults to 'crypto_spot' for back-compat
   * with existing callers; new callers should pass explicit assetClass). userId parameter
   * preserved for API surface compat — flagged for Phase 16 cleanup per
   * RUNNING_ISSUES register (userId-as-mode-key legacy theme from B-NEW-43).
   */
  async verifyUserStrategies(_unusedUserId: string, mode: 'live' | 'paper', assetClass: AssetClass = 'crypto_spot'): Promise<boolean> {
    const existingStrategies = await storage.listStrategySettings({
      globalContextId: GLOBAL_CONTEXT_ID,
      mode,
      assetClass,
    });
    const existingStrategyNames = new Set(existingStrategies.map(s => s.strategy));

    return CORE_STRATEGIES.every(strategy => existingStrategyNames.has(strategy));
  }
}

export const strategySyncService = new StrategySyncService();
