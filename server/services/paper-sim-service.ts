/**
 * Paper Trading Simulation Service
 * Provides idempotent function calls for starting/stopping paper trading simulation
 * Uses database as single source of truth for session state
 * Integrated with ExecutionPolicyController and ClusterBus
 */

import { nanoid } from 'nanoid';
import { storage } from '../storage.js';
import type { InsertPaperSimSession } from '../../shared/schema.js';
import { tradingStateSync } from './trading-state-sync.js';
import { KrakenService } from './kraken.js';

export interface PaperSimResult {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
}

// Global in-memory state for the active portfolio manager
// This is reconciled with the database on every operation
declare global {
  var globalPaperPortfolioManager: any;
  var globalPaperSimOperationLock: Promise<void> | null;
}

/**
 * Phase 27.F.9: Synchronized Manager API
 * Provides atomic access to global PaperSim manager with reconciliation
 */
export function getGlobalPaperSimManager(): any {
  return global.globalPaperPortfolioManager || null;
}

export function setGlobalPaperSimManager(manager: any): void {
  global.globalPaperPortfolioManager = manager;
  console.log('[PaperSimService] Manager registered globally');
}

export function clearGlobalPaperSimManager(): void {
  global.globalPaperPortfolioManager = null;
  console.log('[PaperSimService] Manager cleared from global scope');
}

/**
 * Start paper trading simulation (IDEMPOTENT)
 * - Checks database for existing running session
 * - If running session exists, returns success with existing session info
 * - If no running session, creates new session and starts portfolio manager
 * - Emits cluster bus event on new session start
 */
export async function startPaperSimulation(
  userId: string,
  options?: {
    startingBalance?: number;
    runForMs?: number;
    startedBy?: string;
    metadata?: any;
  }
): Promise<PaperSimResult> {
  try {
    // Wait for any pending operations to complete
    if (global.globalPaperSimOperationLock) {
      await global.globalPaperSimOperationLock;
    }

    // Create lock to serialize all start/stop operations
    const startPromise = (async () => {
      try {
        // Phase 27.F.9: Prevent duplicates by checking both DB and global state atomically
        const existingSession = await storage.getActivePaperSimSession(userId);
        const existingManager = getGlobalPaperSimManager();
        
        if (existingSession && existingManager) {
          // IDEMPOTENT: Both session and manager exist, return success
          console.log(`[PaperSimService] Paper trading already running (session: ${existingSession.sessionId})`);
          
          return {
            success: true,
            message: 'Paper trading simulation already running',
            data: {
              sessionId: existingSession.sessionId,
              startedAt: existingSession.startedAt,
              status: existingSession.status,
              mode: existingSession.mode,
              isIdempotentReuse: true,
            },
          };
        }
        
        if (existingSession && !existingManager) {
          // Reconcile: DB session exists but manager was lost (e.g., server restart)
          console.log('[PaperSimService] Reconciling manager from database session');
          const { PaperPortfolioManager } = await import('./paper-portfolio-manager.js');
          const manager = new PaperPortfolioManager(userId);
          setGlobalPaperSimManager(manager);
          await manager.start();
          
          return {
            success: true,
            message: 'Paper trading simulation already running (manager reconciled)',
            data: {
              sessionId: existingSession.sessionId,
              startedAt: existingSession.startedAt,
              status: existingSession.status,
              mode: existingSession.mode,
              isIdempotentReuse: true,
              wasReconciled: true,
            },
          };
        }
        
        if (!existingSession && existingManager) {
          // Orphaned manager exists without DB session - clear it
          console.warn('[PaperSimService] Orphaned manager detected without DB session - clearing');
          clearGlobalPaperSimManager();
        }

        // No existing session - create new one atomically
        const sessionId = `paper_${nanoid(10)}`;
        const startedAt = new Date();
        
        // Calculate end time if runForMs is specified
        const endsAt = options?.runForMs 
          ? new Date(startedAt.getTime() + options.runForMs) 
          : null;

        // Phase 27.F.9: Create session in database FIRST (source of truth)
        const sessionData: InsertPaperSimSession = {
          sessionId,
          userId,
          mode: 'paper',
          status: 'running',
          startingBalance: options?.startingBalance?.toString() || '10000',
          runForMs: options?.runForMs || null,
          endsAt: endsAt || null,
          startedBy: options?.startedBy || 'manual',
          metadata: options?.metadata || null,
        };

        const dbSession = await storage.createPaperSimSession(sessionData);
        console.log(`[PaperSimService] Created new session in database: ${sessionId}`);

        // Phase 27.F.17a: Auto-Configuration - Screener-driven watchlist
        console.log('[PaperSimService][AutoWatchlist] Checking auto-configuration...');
        
        // 1. Check watchlist and add screener-filtered pairs if empty
        const watchlist = await storage.getWatchlist({ userId, mode: 'paper' });
        if (!watchlist || watchlist.length === 0) {
          console.log('[PaperSimService][AutoWatchlist] Empty watchlist detected - querying screener for eligible pairs');
          
          try {
            // Get current screener filter settings
            const filters = await storage.getScreenerFilters({ userId, mode: 'paper' });
            console.log('[PaperSimService][AutoWatchlist] Retrieved screener filters:', filters ? 'configured' : 'using defaults');
            
            // Initialize KrakenService
            const krakenService = new KrakenService();
            
            // Query eligible pairs based on current filter settings
            // Note: Some parameters use hardcoded defaults as they're not in screener_filters table
            const eligiblePairs = await krakenService.getEligiblePairs({
              minVolume: filters?.minVolume || '5000000',
              minDailyRange: '6.5', // Hardcoded: Not in screener_filters schema
              minPrice: filters?.minPrice || '0.01',
              maxPrice: filters?.maxPrice || undefined,
              maxBidAskSpread: filters?.maxBidAskSpread || '1.00',
              excludeStablecoins: filters?.excludeStablecoins ?? true,
              allowedTradingPairs: ['USD', 'USDT'], // Hardcoded: Not in screener_filters schema
              blacklistedSymbols: [], // Hardcoded: Not in screener_filters schema
              whitelistedSymbols: [], // Hardcoded: Not in screener_filters schema
              minHistoryDays: 90, // Hardcoded: Not in screener_filters schema
              volatilityMin: filters?.volatilityMin || undefined,
              volatilityMax: filters?.volatilityMax || undefined,
            });
            
            if (eligiblePairs.length === 0) {
              console.log('[PaperSimService][AutoWatchlist] ⚠️  No eligible pairs found matching current screener filters');
              console.log('[PaperSimService][AutoWatchlist] Engine will remain idle until next scan cycle or manual watchlist configuration');
            } else {
              // Cap at 10 pairs maximum to prevent WebSocket overload
              const MAX_AUTO_PAIRS = 10;
              const pairsToAdd = eligiblePairs.slice(0, MAX_AUTO_PAIRS);
              
              console.log(`[PaperSimService][AutoWatchlist] Found ${eligiblePairs.length} eligible pairs, adding top ${pairsToAdd.length} to watchlist`);
              
              for (const pair of pairsToAdd) {
                try {
                  await storage.addWatchlistPair({
                    userId,
                    mode: 'paper',
                    symbol: pair.symbol,
                    baseCurrency: pair.baseCurrency,
                    quoteCurrency: pair.quoteCurrency,
                  });
                  console.log(`[PaperSimService][AutoWatchlist] ✅ Added ${pair.symbol} (Vol: $${(pair.volume24h/1000000).toFixed(1)}M, Range: ${pair.dailyRange.toFixed(1)}%)`);
                } catch (error) {
                  console.warn(`[PaperSimService][AutoWatchlist] Failed to add ${pair.symbol}:`, error);
                }
              }
              
              if (eligiblePairs.length > MAX_AUTO_PAIRS) {
                console.log(`[PaperSimService][AutoWatchlist] Note: ${eligiblePairs.length - MAX_AUTO_PAIRS} additional eligible pairs were not added (10-pair cap)`);
              }
            }
          } catch (error) {
            console.error('[PaperSimService][AutoWatchlist] Error querying screener for eligible pairs:', error);
            console.log('[PaperSimService][AutoWatchlist] Engine will start with empty watchlist (idle state)');
          }
        } else {
          console.log(`[PaperSimService][AutoWatchlist] Watchlist contains ${watchlist.length} pairs - skipping auto-add`);
        }
        
        // 2. Set default minVolume to 5,000,000 in screener filters
        try {
          const filters = await storage.getScreenerFilters({ userId, mode: 'paper' });
          const currentMinVolume = filters?.minVolume ? parseFloat(filters.minVolume) : null;
          
          if (!currentMinVolume || currentMinVolume > 5000000) {
            console.log(`[PaperSimService][Phase-27.F.17] Setting default minVolume to 5,000,000`);
            await storage.upsertScreenerFilters({
              userId,
              mode: 'paper',
              minVolume: '5000000'
            });
          } else {
            console.log(`[PaperSimService][Phase-27.F.17] MinVolume already set to ${currentMinVolume} - keeping existing value`);
          }
        } catch (error) {
          console.warn('[PaperSimService][Phase-27.F.17] Failed to set minVolume:', error);
        }
        
        // Phase 27.F.17b: State Persistence and Broadcast Verification
        console.log('[PaperSimService][Phase-27.F.17b] Setting engine active state...');
        await tradingStateSync.setEngineActive(userId, true);
        
        // Verify system_context status and log with [StateSync] prefix
        const context = await storage.getSystemContext(userId);
        if (context && context.isEngineActive) {
          console.log('[StateSync] paper_engine_status = RUNNING confirmed');
          console.log('[PaperSimService][Phase-27.F.17b] ✅ Verified system_context.isEngineActive = true');
        } else {
          console.warn('[PaperSimService][Phase-27.F.17b] ⚠️ Failed to verify engine active state');
        }

        // Phase 27.F.9: Create and register manager atomically (both local and global)
        const { PaperPortfolioManager } = await import('./paper-portfolio-manager.js');
        const manager = new PaperPortfolioManager(userId);
        
        setGlobalPaperSimManager(manager);
        console.log('[PaperSimService] Manager created and registered globally');
        
        await manager.start();
        
        // Emit cluster bus event for distributed awareness
        try {
          const { clusterBus } = await import('./cluster-bus.js');
          clusterBus.emit('paper_sim_started', {
            sessionId,
            userId,
            startedAt: startedAt.toISOString(),
            startedBy: options?.startedBy || 'manual',
            mode: 'paper',
          });
        } catch (busError) {
          console.warn('[PaperSimService] Failed to emit cluster bus event:', busError);
          // Non-blocking error - simulation still works
        }

        // Emit start acknowledgment log (backward compatibility)
        console.log(`[TradeEngine] start_ack { runId: "${sessionId}", mode: "paper", t: "${startedAt.toISOString()}" }`);
        
        return {
          success: true,
          message: 'Paper trading simulation started successfully. Monitoring live market data and executing trades in simulation mode.',
          data: {
            sessionId: dbSession.sessionId,
            startedAt: dbSession.startedAt,
            status: dbSession.status,
            mode: dbSession.mode,
            startingBalance: dbSession.startingBalance,
          },
        };
      } catch (error: any) {
        // Phase 27.F.9: Rollback - clean up manager using synchronized API
        clearGlobalPaperSimManager();
        
        console.error('[PaperSimService] Error during start, rolling back:', error);
        throw error;
      } finally {
        global.globalPaperSimOperationLock = null;
      }
    })();

    global.globalPaperSimOperationLock = startPromise;
    return await startPromise;
    
  } catch (error: any) {
    console.error('[PaperSimService] Error starting paper trading simulation:', error);
    global.globalPaperSimOperationLock = null;
    return {
      success: false,
      message: `Error starting paper trading simulation: ${error.message}`,
      error: error.message || 'Failed to start paper trading simulation',
    };
  }
}

/**
 * Stop paper trading simulation (IDEMPOTENT)
 * - Checks database for running session
 * - If no running session, returns success (already stopped)
 * - If running session exists, stops manager and updates database
 * - Emits cluster bus event on successful stop
 */
export async function stopPaperSimulation(userId: string): Promise<PaperSimResult> {
  try {
    // Wait for any pending operations to complete
    if (global.globalPaperSimOperationLock) {
      await global.globalPaperSimOperationLock;
    }

    // Create lock to serialize all start/stop operations
    const stopPromise = (async () => {
      try {
        // Check database for running session (single source of truth)
        const existingSession = await storage.getActivePaperSimSession(userId);
        
        if (!existingSession) {
          // IDEMPOTENT: No running session, return success
          console.log('[PaperSimService] Paper trading already stopped or not started');
          
          // Phase 27.F.9: Clean up orphaned in-memory manager if exists
          const orphanedManager = getGlobalPaperSimManager();
          if (orphanedManager) {
            console.log('[PaperSimService] Cleaning up orphaned manager');
            try {
              await orphanedManager.stop();
            } catch (cleanupError) {
              console.warn('[PaperSimService] Error cleaning up manager:', cleanupError);
            }
            clearGlobalPaperSimManager();
          }
          
          return {
            success: true,
            message: 'Paper trading simulation already stopped',
            data: { isIdempotentReuse: true },
          };
        }

        // Phase 27.F.9: Stop portfolio manager and clear both references
        const currentManager = getGlobalPaperSimManager();
        if (currentManager) {
          await currentManager.stop();
          clearGlobalPaperSimManager();
        } else {
          console.warn('[PaperSimService] No active manager found, updating database only');
        }

        // Calculate final metrics
        const stoppedAt = new Date();
        const runDuration = stoppedAt.getTime() - new Date(existingSession.startedAt).getTime();

        // Update session in database (end DB session)
        await storage.updatePaperSimSession(existingSession.id, {
          status: 'stopped',
          stoppedAt: stoppedAt,
          runForMs: runDuration,
        });

        console.log(`[PaperSimService] Stopped session: ${existingSession.sessionId}, duration: ${runDuration}ms`);
        console.log('[PaperSimService] Manager cleared (service + global), DB session ended');

        // Phase 27.F.17b: State Persistence and Broadcast Verification
        console.log('[PaperSimService][Phase-27.F.17b] Setting engine inactive state...');
        await tradingStateSync.setEngineActive(userId, false);
        
        // Verify system_context status and log with [StateSync] prefix
        const stoppedContext = await storage.getSystemContext(userId);
        if (stoppedContext && !stoppedContext.isEngineActive) {
          console.log('[StateSync] paper_engine_status = STOPPED confirmed');
          console.log('[PaperSimService][Phase-27.F.17b] ✅ Verified system_context.isEngineActive = false');
        } else {
          console.warn('[PaperSimService][Phase-27.F.17b] ⚠️ Failed to verify engine inactive state');
        }

        // Emit cluster bus event for distributed awareness
        try {
          const { clusterBus } = await import('./cluster-bus.js');
          clusterBus.emit('paper_sim_stopped', {
            sessionId: existingSession.sessionId,
            userId,
            stoppedAt: stoppedAt.toISOString(),
            runDurationMs: runDuration,
            mode: 'paper',
          });
        } catch (busError) {
          console.warn('[PaperSimService] Failed to emit cluster bus event:', busError);
          // Non-blocking error
        }

        // Emit stop acknowledgment log (backward compatibility)
        console.log(`[TradeEngine] stop_ack { mode: "paper", t: "${stoppedAt.toISOString()}" }`);
        
        return {
          success: true,
          message: 'Paper trading simulation stopped successfully. Final report generated.',
          data: {
            sessionId: existingSession.sessionId,
            stoppedAt,
            runDurationMs: runDuration,
          },
        };
      } catch (error: any) {
        console.error('[PaperSimService] Error during stop:', error);
        throw error;
      } finally {
        global.globalPaperSimOperationLock = null;
      }
    })();

    global.globalPaperSimOperationLock = stopPromise;
    return await stopPromise;
    
  } catch (error: any) {
    console.error('[PaperSimService] Error stopping paper trading simulation:', error);
    global.globalPaperSimOperationLock = null;
    return {
      success: false,
      message: `Error stopping paper trading simulation: ${error.message}`,
      error: error.message || 'Failed to stop paper trading simulation',
    };
  }
}

/**
 * Get paper trading simulation status with state reconciliation
 * - Queries database for authoritative session state
 * - Reconciles with in-memory manager state
 * - Returns unified status with diagnostics
 */
export async function getPaperSimulationStatus(userId: string): Promise<any> {
  try {
    // Get session from database (single source of truth)
    const dbSession = await storage.getActivePaperSimSession(userId);
    
    // Get in-memory manager state (check for both null and undefined)
    const hasManager = !!global.globalPaperPortfolioManager;
    
    // State reconciliation diagnostics
    const isConsistent = (dbSession !== undefined) === hasManager;
    
    if (!isConsistent) {
      console.warn('[PaperSimService] State desync detected:', {
        hasDbSession: !!dbSession,
        hasManager,
        sessionId: dbSession?.sessionId || null,
      });
    }

    return {
      isRunning: !!dbSession || hasManager,
      sessionInfo: dbSession ? {
        sessionId: dbSession.sessionId,
        startTime: dbSession.startedAt,
        mode: dbSession.mode,
        status: dbSession.status,
        startedBy: dbSession.startedBy,
        startingBalance: dbSession.startingBalance,
        runForMs: dbSession.runForMs,
        endsAt: dbSession.endsAt,
      } : null,
      diagnostics: {
        hasDbSession: !!dbSession,
        hasManager,
        isConsistent,
        reconciliationNeeded: !isConsistent,
      },
    };
  } catch (error: any) {
    console.error('[PaperSimService] Error getting status:', error);
    return {
      isRunning: false,
      sessionInfo: null,
      error: error.message,
    };
  }
}

/**
 * Phase 27.F.8: Reset PaperSim service state
 * Clears all in-memory state to ensure clean startup
 * Call this on server boot to prevent ghost managers from persisting across restarts
 */
export function resetPaperSimService(): void {
  console.log('[PaperSimService] Resetting service state...');
  
  // Clear in-memory manager
  if (global.globalPaperPortfolioManager) {
    console.log('[PaperSimService] Clearing orphaned manager from previous session');
    try {
      // Attempt graceful stop if manager has stop method
      if (typeof global.globalPaperPortfolioManager.stop === 'function') {
        global.globalPaperPortfolioManager.stop().catch((err: any) => {
          console.warn('[PaperSimService] Error during manager cleanup:', err);
        });
      }
    } catch (error) {
      console.warn('[PaperSimService] Failed to stop orphaned manager:', error);
    }
    global.globalPaperPortfolioManager = null;
  }
  
  // Clear operation lock
  if (global.globalPaperSimOperationLock) {
    console.log('[PaperSimService] Clearing operation lock');
    global.globalPaperSimOperationLock = null;
  }
  
  console.log('[PaperSimService] ✅ Reset complete - clean state confirmed');
  console.log('[PaperSimService] Initialized - no active sessions');
  console.log('[PaperSimService] State: { hasManager: false, hasDbSession: false }');
}
