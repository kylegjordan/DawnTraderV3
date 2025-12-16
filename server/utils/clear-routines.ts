/**
 * Directive 8.8.4-C.14.C: Unified Clear Routines
 * 
 * Centralized helper functions for clearing trading-related queues and caches.
 * Provides consistent logging and error handling across all clear operations.
 */

import { contextBridge } from '../services/context-bridge.js';

/**
 * Clear Ready-to-Buy (RTB) signals queue for a given mode.
 * Broadcasts WebSocket event for immediate frontend synchronization.
 * 
 * @param mode - Trading mode ('paper' or 'live')
 * @param source - Source identifier for logging (e.g., 'ResetButton', 'StopTrading')
 * @returns Number of signals cleared
 */
export async function clearReadyToBuy(mode: 'paper' | 'live', source = 'system'): Promise<number> {
  try {
    const { readyToBuyService } = await import('../core/rtb/ready_to_buy_service.js');
    const cleared = await readyToBuyService.clearQueue(mode);
    
    console.log(`[8.8.4-C.14.C][RTB_CLEAR] source=${source} mode=${mode} cleared=${cleared}`);
    
    // Directive 8.8.4-C.14.D: Mode-scoped WebSocket broadcast with standardized payload
    await contextBridge.broadcast({
      type: 'rtb:cleared',
      payload: { 
        mode,
        timestamp: new Date().toISOString()
      },
      mode  // Mode-scoped to prevent cross-session RTB clears
    });
    
    return cleared;
  } catch (err: any) {
    console.warn(`[8.8.4-C.14.C][RTB_CLEAR][WARN] source=${source} mode=${mode} error=${err?.message || 'Unknown error'}`);
    return 0;
  }
}

/**
 * Clear Active Filter Pool for a given mode.
 * Used when trading stops to enforce passive mode.
 * 
 * @param mode - Trading mode ('paper' or 'live')
 * @param source - Source identifier for logging
 */
export async function clearActiveFilterPool(mode: 'paper' | 'live', source = 'system'): Promise<void> {
  try {
    const { activeFilterPool } = await import('../services/active-filter-pool.js');
    activeFilterPool.clearPool(mode);
    console.log(`[8.8.4-C.14.C][POOL_CLEAR] source=${source} mode=${mode}`);
  } catch (err: any) {
    console.warn(`[8.8.4-C.14.C][POOL_CLEAR][WARN] source=${source} mode=${mode} error=${err?.message || 'Unknown error'}`);
  }
}

/**
 * Clear all trading-related caches and queues for a mode.
 * Combines RTB and Active Filter Pool clearing.
 * 
 * @param mode - Trading mode ('paper' or 'live')
 * @param source - Source identifier for logging
 */
export async function clearAllTradingQueues(mode: 'paper' | 'live', source = 'system'): Promise<{ rtbCleared: number }> {
  const rtbCleared = await clearReadyToBuy(mode, source);
  await clearActiveFilterPool(mode, source);
  
  console.log(`[8.8.4-C.14.C][ALL_CLEAR] source=${source} mode=${mode} rtbCleared=${rtbCleared}`);
  
  return { rtbCleared };
}
