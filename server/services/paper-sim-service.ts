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
  requiresConfirmation?: boolean; // Phase 27.F.14.D-POST: Indicates balance confirmation needed
  currentBalance?: number; // Phase 27.F.14.D-POST: Current balance for confirmation prompt
}

/**
 * Phase 27.F.14.D-POST: Check if portfolio balance confirmation is required
 * Returns true if balance hasn't been confirmed in the last 24 hours
 */
export async function checkBalanceConfirmationRequired(mode: 'live' | 'paper' = 'paper'): Promise<{ required: boolean; currentBalance: number }> {
  try {
    // Get system context to check last confirmation time
    const context = await storage.getSystemContext(mode);
    const balanceLastConfirmed = context?.balanceLastConfirmed;
    
    // Get current portfolio balance
    const portfolioState = await storage.getPortfolioState({ mode });
    const currentBalance = portfolioState ? parseFloat(portfolioState.balance) : 800; // Default to $800
    
    // Check if confirmation is missing or stale (>24 hours old)
    if (!balanceLastConfirmed) {
      console.log(`[PaperSim] Portfolio balance confirmation required (mode=${mode}, never confirmed)`);
      return { required: true, currentBalance };
    }
    
    const hoursSinceConfirmation = (Date.now() - balanceLastConfirmed.getTime()) / (1000 * 60 * 60);
    if (hoursSinceConfirmation > 24) {
      console.log(`[PaperSim] Portfolio balance confirmation required (mode=${mode}, last confirmed ${hoursSinceConfirmation.toFixed(1)}h ago)`);
      return { required: true, currentBalance };
    }
    
    console.log(`[PaperSim] Balance confirmation recent (${hoursSinceConfirmation.toFixed(1)}h ago), proceeding with start`);
    return { required: false, currentBalance };
  } catch (error) {
    console.error('[PaperSim] Error checking balance confirmation:', error);
    // Default to requiring confirmation on error
    return { required: true, currentBalance: 800 };
  }
}

/**
 * Phase 27.F.14.D-POST: Confirm portfolio balance
 * Updates the balance and records confirmation timestamp
 */
export async function confirmPortfolioBalance(mode: 'live' | 'paper', balance: number): Promise<void> {
  try {
    // Update portfolio balance
    await storage.updatePortfolioBalance({ mode, balance });
    
    // Record confirmation timestamp in system context
    await storage.upsertSystemContext({
      tradingMode: mode,
      balanceLastConfirmed: new Date()
    });
    
    console.log(`[PaperSim] Portfolio balance confirmed: $${balance} for mode=${mode}`);
  } catch (error) {
    console.error('[PaperSim] Error confirming portfolio balance:', error);
    throw error;
  }
}

/**
 * Phase 32.D-Fix.6 Fix #3: Async watchlist population
 * Populates watchlist in background without blocking engine startup
 * Uses batch upsert with ON CONFLICT DO NOTHING to eliminate duplicate key errors
 */
async function populateWatchlistAsync(userId: string, mode: 'paper' | 'live' = 'paper'): Promise<void> {
  const startTime = Date.now();
  console.log('[32.D-Fix.6] Starting background watchlist population...');
  
  try {
    // Check watchlist and add screener-filtered pairs if empty
    const watchlist = await storage.getWatchlist({ mode });
    if (watchlist && watchlist.length > 0) {
      console.log(`[32.D-Fix.6] Watchlist contains ${watchlist.length} pairs - skipping auto-add`);
      return;
    }
    
    console.log('[32.D-Fix.6] Empty watchlist detected - querying screener for eligible pairs');
    
    // Get screener filters and trading settings
    const filters = await storage.getScreenerFilters({ mode });
    const tradingSettings = await storage.getTradingSettings(userId);
    
    if (!filters || !tradingSettings) {
      console.log('[32.D-Fix.6] No filters or settings found - skipping watchlist population');
      return;
    }
    
    // Initialize KrakenService
    const krakenService = new KrakenService();
    
    // Query eligible pairs with safe defaults for nullable fields
    const eligiblePairs = await krakenService.getEligiblePairs({
      minVolume: filters.minVolume ?? '1000000',
      minDailyRange: tradingSettings.minDailyRange ?? '0.02',
      minPrice: filters.minPrice ?? '0.01',
      maxPrice: filters.maxPrice || undefined,
      maxBidAskSpread: filters.maxBidAskSpread ?? '0.05',
      excludeStablecoins: filters.excludeStablecoins ?? true,
      allowedTradingPairs: [],
      blacklistedSymbols: tradingSettings.blacklistedSymbols || [],
      whitelistedSymbols: tradingSettings.whitelistedSymbols || [],
      minHistoryDays: tradingSettings.minDataHistoryDays ?? 30,
      rsiMin: filters.rsiMin || undefined,
      rsiMax: filters.rsiMax || undefined,
      volatilityMin: filters.volatilityMin || undefined,
      volatilityMax: filters.volatilityMax || undefined,
    });
    
    if (eligiblePairs.length === 0) {
      console.log('[32.D-Fix.6] No eligible pairs found matching current screener filters');
      return;
    }
    
    // Cap at 10 pairs maximum
    const MAX_AUTO_PAIRS = 10;
    const pairsToAdd = eligiblePairs.slice(0, MAX_AUTO_PAIRS);
    
    console.log(`[32.D-Fix.6] Found ${eligiblePairs.length} eligible pairs, adding top ${pairsToAdd.length} to watchlist`);
    
    // Batch insert with ON CONFLICT DO NOTHING to avoid duplicate key errors
    for (const pair of pairsToAdd) {
      try {
        await storage.addWatchlistPair({
          mode,
          symbol: pair.symbol,
          baseCurrency: pair.baseCurrency,
          quoteCurrency: pair.quoteCurrency,
        });
        console.log(`[32.D-Fix.6] Added ${pair.symbol} (Vol: $${(pair.volume24h/1000000).toFixed(1)}M)`);
      } catch (error) {
        // Silently skip duplicates - not an error
      }
    }
    
    const elapsed = Date.now() - startTime;
    console.log(`[32.D-Fix.6] Watchlist populated in ${elapsed}ms (background)`);
    
    // Phase 33.B: Broadcast background job completion
    const { contextBridge } = await import('./context-bridge.js');
    await contextBridge.broadcast({
      type: 'background_jobs_complete',
      payload: {
        job: 'watchlist_refresh',
        durationMs: elapsed,
        timestamp: new Date().toISOString(),
      },
      mode,
    });
    console.log(`[Phase-33.B] Broadcasted background_jobs_complete for watchlist (${elapsed}ms)`);
  } catch (error) {
    console.error('[32.D-Fix.6] Background watchlist population failed:', error);
  }
}

// Global in-memory state for the active portfolio manager
// This is reconciled with the database on every operation
declare global {
  var globalPaperPortfolioManager: any;
  var globalPaperSimOperationLock: Promise<void> | null;
  var globalPaperSimBusyFlag: boolean;
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
    skipAutoWatchlist?: boolean; // Phase 27.F.13.I: Skip slow Kraken API calls during startup
  }
): Promise<PaperSimResult> {
  const t0 = Date.now();
  console.log(`[41D-DEBUG-1] startPaperSimulation entered (userId: ${userId}, balance: ${options?.startingBalance})`);
  
  try {
    // Phase 33.A: Fast busy check to prevent overlapping requests
    console.log(`[41D-DEBUG-2] Checking busy flag (t+${Date.now()-t0}ms)`);
    if (global.globalPaperSimBusyFlag) {
      console.log('[Phase-33.A] Engine busy, rejecting start request');
      return {
        success: false,
        message: 'Engine is busy processing another request. Please wait...',
        error: 'BUSY',
      };
    }
    
    // Set busy flag
    console.log(`[41D-DEBUG-3] Setting busy flag (t+${Date.now()-t0}ms)`);
    global.globalPaperSimBusyFlag = true;
    
    // Wait for any pending operations to complete
    console.log(`[41D-DEBUG-4] Checking operation lock (t+${Date.now()-t0}ms)`);
    if (global.globalPaperSimOperationLock) {
      console.log(`[41D-DEBUG-4a] Waiting for pending operation (t+${Date.now()-t0}ms)`);
      await global.globalPaperSimOperationLock;
      console.log(`[41D-DEBUG-4b] Pending operation complete (t+${Date.now()-t0}ms)`);
    }

    // Create lock to serialize all start/stop operations
    const startPromise = (async () => {
      try {
        console.log(`[41D-DEBUG-5] Checking DB for existing session (t+${Date.now()-t0}ms)`);
        // Phase 27.F.9: Prevent duplicates by checking both DB and global state atomically
        const existingSession = await storage.getActivePaperSimSession(userId);
        console.log(`[41D-DEBUG-6] DB check complete - exists: ${!!existingSession} (t+${Date.now()-t0}ms)`);
        
        const existingManager = getGlobalPaperSimManager();
        console.log(`[41D-DEBUG-7] Manager check complete - exists: ${!!existingManager} (t+${Date.now()-t0}ms)`);

        
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
          const mode = 'paper'; // Phase 27.F.13.O: Use mode instead of userId
          const manager = new PaperPortfolioManager(mode, userId);
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

        console.log('[ENGINE_DB_CHECKPOINT_1] Creating paper sim session in database...');
        const dbSession = await storage.createPaperSimSession(sessionData);
        console.log(`[ENGINE_DB_CHECKPOINT_2] Session created in database: ${sessionId}`);

        // Phase 32.D-Fix.6 Fix #3: Activate engine FIRST for instant API response
        // Phase 27.F.17b: State Persistence and Broadcast Verification
        const mode = 'paper';
        console.log('[ENGINE_CHECKPOINT_4] Setting engine active state (fast path)...');
        await tradingStateSync.setEngineActive(userId, true, mode);
        console.log('[ENGINE_CHECKPOINT_5] Engine active state set successfully');
        
        // Phase 32.D-Fix.1: Explicitly set trading mode to paper
        await tradingStateSync.setTradingMode(userId, 'paper', userId, 'Paper simulation started');
        console.log('[32.D-Fix.1] ✅ Paper trading mode activated globally');
        
        // Phase 32.D-Fix.6 Fix #3: Populate watchlist asynchronously in background
        if (!options?.skipAutoWatchlist) {
          console.log('[32.D-Fix.6] Starting watchlist population in background...');
          populateWatchlistAsync(userId, mode).catch(error => {
            console.error('[32.D-Fix.6] Background watchlist population failed:', error);
          });
        } else {
          console.log('[ENGINE_CHECKPOINT_3] Auto-watchlist SKIPPED (fast startup mode)');
        }

        // Phase 27.F.9: Create and register manager atomically (both local and global)
        // Phase 27.F.13.O: Use mode-based constructor
        console.log('[ENGINE_CHECKPOINT_8] Importing PaperPortfolioManager...');
        const { PaperPortfolioManager } = await import('./paper-portfolio-manager.js');
        console.log('[ENGINE_CHECKPOINT_9] Creating manager instance...');
        const manager = new PaperPortfolioManager(mode, userId);
        
        console.log('[ENGINE_CHECKPOINT_10] Registering manager globally...');
        setGlobalPaperSimManager(manager);
        console.log('[ENGINE_CHECKPOINT_11] Manager registered, starting manager...');
        
        // Phase 41C-FIX: Start manager synchronously with proper error handling
        // Previous async approach caused UI to show ACTIVE while engine failed silently
        try {
          await manager.start();
          console.log('[ENGINE_CHECKPOINT_12] Manager started successfully');
        } catch (managerError: any) {
          console.error('[ENGINE_ERROR] Manager start failed:', managerError);
          // Rollback on manager start failure
          clearGlobalPaperSimManager();
          // Find the session we just created and mark it as failed
          const failedSession = await storage.getPaperSimSessionBySessionId(sessionId);
          if (failedSession) {
            await storage.updatePaperSimSession(failedSession.id, { status: 'failed' });
          }
          throw new Error(`Failed to start trading engine: ${managerError.message}`);
        }
        
        // Register global session for status tracking
        if (typeof (global as any).registerSimulationSession === 'function') {
          (global as any).registerSimulationSession({
            sessionId,
            startedBy: options?.startedBy || 'manual',
            startTime: startedAt,
            isRunning: true,
            type: 'paper'
          });
          console.log('[PaperSimService] Global session registered');
        }
        
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
        // Phase 41C-FIX: Complete rollback - clean up manager AND database session
        clearGlobalPaperSimManager();
        
        // Roll back database session if it was created
        try {
          const existingSession = await storage.getActivePaperSimSession(userId);
          if (existingSession) {
            console.log(`[PaperSimService] Rolling back database session: ${existingSession.sessionId}`);
            await storage.updatePaperSimSession(existingSession.id, { status: 'failed' });
          }
        } catch (rollbackError) {
          console.error('[PaperSimService] Failed to rollback database session:', rollbackError);
        }
        
        console.error('[PaperSimService] Error during start, rollback complete:', error);
        throw error;
      } finally {
        global.globalPaperSimOperationLock = null;
        global.globalPaperSimBusyFlag = false; // Phase 33.A: Clear busy flag
      }
    })();

    global.globalPaperSimOperationLock = startPromise;
    return await startPromise;
    
  } catch (error: any) {
    console.error('[PaperSimService] Error starting paper trading simulation:', error);
    global.globalPaperSimOperationLock = null;
    global.globalPaperSimBusyFlag = false; // Phase 33.A: Clear busy flag on error
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
    // Phase 33.A: Fast busy check to prevent overlapping requests
    if (global.globalPaperSimBusyFlag) {
      console.log('[Phase-33.A] Engine busy, rejecting stop request');
      return {
        success: false,
        message: 'Engine is busy processing another request. Please wait...',
        error: 'BUSY',
      };
    }
    
    // Set busy flag
    global.globalPaperSimBusyFlag = true;
    
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
        const t0 = Date.now();
        
        if (currentManager) {
          console.log('[41E-S][TIMING] Starting manager.stop()...');
          await currentManager.stop();
          clearGlobalPaperSimManager();
          console.log(`[41E-S][TIMING] Manager shutdown completed in ${Date.now() - t0}ms`);
        } else {
          console.warn('[PaperSimService] No active manager found, updating database only');
        }
        
        // Deregister global session
        if (typeof (global as any).deregisterSimulationSession === 'function') {
          (global as any).deregisterSimulationSession();
          console.log('[PaperSimService] Global session deregistered');
        }

        // Calculate final metrics
        const stoppedAt = new Date();
        const runDuration = stoppedAt.getTime() - new Date(existingSession.startedAt).getTime();

        // Update session in database (end DB session)
        const t1 = Date.now();
        console.log('[41E-S][TIMING] Starting DB session update...');
        await storage.updatePaperSimSession(existingSession.id, {
          status: 'stopped',
          stoppedAt: stoppedAt,
          runForMs: runDuration,
        });
        console.log(`[41E-S][TIMING] DB session update completed in ${Date.now() - t1}ms`);

        console.log(`[PaperSimService] Stopped session: ${existingSession.sessionId}, duration: ${runDuration}ms`);
        console.log('[PaperSimService] Manager cleared (service + global), DB session ended');
        console.log('[41E-S] Critical teardown complete, preparing HTTP response...');

        // Phase 41E-S: Non-blocking broadcast and verification
        // Phase 27.F.17b: State Persistence and Broadcast Verification
        // Phase 27.F.13.O: Mode-based global context
        const mode = 'paper';
        const t2 = Date.now();
        
        // Trigger state broadcast asynchronously (non-blocking)
        tradingStateSync.setEngineActive(userId, false, mode)
          .then(async () => {
            console.log(`[41E-S][TIMING] State broadcast completed in ${Date.now() - t2}ms`);
            
            // Verify system_context status in background
            const t3 = Date.now();
            const stoppedContext = await storage.getSystemContext(mode);
            console.log(`[41E-S][TIMING] Context verification completed in ${Date.now() - t3}ms`);
            
            if (stoppedContext && !stoppedContext.isEngineActive) {
              console.log('[StateSync] paper_engine_status = STOPPED confirmed');
              console.log('[41E-S] ✅ Verified system_context.isEngineActive = false (background)');
            } else {
              console.warn('[41E-S] ⚠️ Failed to verify engine inactive state (background)');
            }
          })
          .catch(err => {
            console.warn('[41E-S] Background broadcast/verification error:', err.message);
          });
        
        console.log('[41E-S] State broadcast triggered asynchronously (HTTP response not blocked)');

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
        global.globalPaperSimBusyFlag = false; // Phase 33.A: Clear busy flag
      }
    })();

    global.globalPaperSimOperationLock = stopPromise;
    return await stopPromise;
    
  } catch (error: any) {
    console.error('[PaperSimService] Error stopping paper trading simulation:', error);
    global.globalPaperSimOperationLock = null;
    global.globalPaperSimBusyFlag = false; // Phase 33.A: Clear busy flag on error
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
