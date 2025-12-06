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
import { paperOperationQueue } from '../utils/operation-queue.js';
import { reset24hWindow, resetHourlyScanHistory } from './fx5-24h-window.js';
import { b4Diagnostics } from './b4-diagnostics.js';

console.log('[41E-S][LIVE-CODE] paper-sim-service.ts loaded');
console.log('[41F][QUEUE] Paper operation queue integrated');

export interface PaperSimResult {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
  requiresConfirmation?: boolean; // Phase 27.F.14.D-POST: Indicates balance confirmation needed
  currentBalance?: number; // Phase 27.F.14.D-POST: Current balance for confirmation prompt
}

// Phase 41E-S: Track when busy flag and operation lock were set
let busyFlagSetAt: number | null = null;
let operationLockSetAt: number | null = null;
const BUSY_FLAG_STALE_THRESHOLD_MS = 10000; // 10 seconds (start/stop should complete within 3s)
const OPERATION_LOCK_STALE_THRESHOLD_MS = 10000; // 10 seconds

// Phase 41E-S: Auto-clear stale busy flags, operation locks, and orphaned managers
async function clearStaleBusyFlag() {
  // Clear stale busy flag (after 10 seconds)
  if (global.globalPaperSimBusyFlag && busyFlagSetAt) {
    const age = Date.now() - busyFlagSetAt;
    if (age > BUSY_FLAG_STALE_THRESHOLD_MS) {
      console.log(`[SAFEGUARD] Cleared stale busy flag (age: ${age}ms)`);
      global.globalPaperSimBusyFlag = false;
      busyFlagSetAt = null;
    }
  }
  
  // Clear stale operation locks (after 10 seconds - should complete within 3s)
  if (global.globalPaperSimOperationLock && operationLockSetAt) {
    const age = Date.now() - operationLockSetAt;
    if (age > OPERATION_LOCK_STALE_THRESHOLD_MS) {
      console.log(`[SAFEGUARD] Cleared stale operation lock (age: ${age}ms)`);
      global.globalPaperSimOperationLock = null;
      operationLockSetAt = null;
    }
  }
  
  // Phase 41E-S: Clear orphaned managers (manager exists but no DB session)
  const hasManager = !!getGlobalPaperSimManager();
  if (hasManager) {
    const { db } = await import('../db.js');
    const { paperSimSessions } = await import('../../shared/schema.js');
    const { eq } = await import('drizzle-orm');
    
    const activeSessions = await db
      .select()
      .from(paperSimSessions)
      .where(eq(paperSimSessions.status, 'running'))
      .limit(1);
    
    const hasDbSession = activeSessions.length > 0;
    
    if (!hasDbSession) {
      console.log(`[SAFEGUARD] Detected orphaned manager - clearing...`);
      clearGlobalPaperSimManager();
    }
  }
}

/**
 * Phase 27.F.14.D-POST: Check if portfolio balance confirmation is required
 * Returns true if balance hasn't been confirmed in the last 24 hours
 */
export async function checkBalanceConfirmationRequired(mode: 'live' | 'paper' = 'paper'): Promise<{ required: boolean; currentBalance: number | null }> {
  try {
    // Get system context to check last confirmation time
    const context = await storage.getSystemContext(mode);
    const balanceLastConfirmed = context?.balanceLastConfirmed;
    
    // Phase 41F-L.E2E-FIX: Don't inject $800 fallback, return null if missing
    const portfolioState = await storage.getPortfolioState({ mode });
    const currentBalance = portfolioState ? parseFloat(portfolioState.balance) : null;
    
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
    // Phase 41F-L.E2E-FIX: Return null instead of $800 fallback
    return { required: true, currentBalance: null };
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
    
    // Phase 41F-L.E2E-PURGE: Get mode-level settings
    const filters = await storage.getScreenerFilters({ mode });
    
    if (!filters) {
      console.log('[32.D-Fix.6] No filters found - skipping watchlist population');
      return;
    }
    
    // Import required helper from risk-manager
    const { buildSettingsFromModeLevel } = await import('./risk-manager.js');
    const tradingSettings = await buildSettingsFromModeLevel(mode);
    
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
 * Phase 8.8.3-B7.A: Get engine instance by mode for direct reset
 * Used by PaperSessionResetService when no manager is available
 */
export function getEngineByMode(mode: 'paper' | 'live'): any | null {
  const manager = getGlobalPaperSimManager();
  if (manager && typeof manager.getEngine === 'function') {
    return manager.getEngine();
  }
  // Try to get engine from global scope if manager doesn't expose it
  if (mode === 'paper' && (global as any).globalPaperEngine) {
    return (global as any).globalPaperEngine;
  }
  return null;
}

/**
 * Phase 8.8.3-B7.A: Get orchestrator instance by mode for direct reset
 * Used by PaperSessionResetService when no manager is available
 */
export function getOrchestratorByMode(mode: 'paper' | 'live'): any | null {
  const manager = getGlobalPaperSimManager();
  if (manager && typeof manager.getOrchestrator === 'function') {
    return manager.getOrchestrator();
  }
  // Try to get orchestrator from global scope if manager doesn't expose it
  if (mode === 'paper' && (global as any).globalPaperOrchestrator) {
    return (global as any).globalPaperOrchestrator;
  }
  return null;
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
  console.log(`[41F][QUEUE] startPaperSimulation called (userId: ${userId}, balance: ${options?.startingBalance})`);
  
  // Phase 41F: Use operation queue instead of busy flag and operation lock
  try {
    const queueResult = await paperOperationQueue.enqueue(
    async () => {
      try {
        console.log(`[41D-DEBUG-5] Checking DB for existing session (t+${Date.now()-t0}ms)`);
        // Phase 27.F.9 + Phase 3D: Mode-based session lookup
        const mode = 'paper';
        const existingSession = await storage.getActivePaperSimSession(mode);
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
            shouldBroadcast: false, // Phase 41F-B: No broadcast needed for idempotent reuse
          };
        }
        
        if (existingSession && !existingManager) {
          // Reconcile: DB session exists but manager was lost (e.g., server restart)
          console.log('[PaperSimService] Reconciling manager from database session');
          const { PaperPortfolioManager } = await import('./paper-portfolio-manager.js');
          // Phase 27.F.13.O + Phase 3D: Use mode instead of userId
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
            shouldBroadcast: true, // Phase 41F-B: Broadcast reconciliation
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
        // Note: Single-tenant system - userId not stored in paperSimSessions table
        // Require startingBalance to be provided (no fallback defaults)
        if (!options?.startingBalance) {
          throw new Error('startingBalance is required to start paper trading');
        }
        
        const sessionData: InsertPaperSimSession = {
          sessionId,
          mode: 'paper',
          status: 'running',
          startingBalance: options.startingBalance.toString(),
          runForMs: options?.runForMs || null,
          endsAt: endsAt || null,
          startedBy: options?.startedBy || 'manual',
          metadata: options?.metadata || null,
        };

        console.log('[ENGINE_DB_CHECKPOINT_1] Creating paper sim session in database...');
        const dbSession = await storage.createPaperSimSession(sessionData);
        console.log(`[ENGINE_DB_CHECKPOINT_2] Session created in database: ${sessionId}`);
        
        // [B4] Reset diagnostic session for clean data capture (after DB session created)
        b4Diagnostics.resetSession();
        console.log('[B4] Diagnostic session reset for new simulation');

        // REB 2.8.11: Cache previous portfolio balance for rollback on failure
        const previousPortfolioState = await storage.getPortfolioState({ mode: 'paper' });
        const previousBalance = previousPortfolioState ? parseFloat(previousPortfolioState.balance) : null;
        console.log(`[REB 2.8.11] Cached previous portfolio balance: $${previousBalance} (for rollback if needed)`);

        // Phase 41F-B: Move broadcast-triggering calls OUTSIDE queue job
        // State updates will be done, but broadcasts happen after queue completes (mode already declared above)
        console.log('[ENGINE_CHECKPOINT_4] Queued job - skipping broadcasts (will fire after queue completion)');
        
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
          
          // REB 2.8.11: Sync portfolioState.balance with new startingBalance AFTER manager starts
          // This ensures the session is fully live before touching canonical portfolio state
          // Moved here from before manager.start() to prevent partial initialization on failure
          const startBalance = parseFloat(sessionData.startingBalance);
          console.log(`[REB 2.8.11] Syncing portfolioState.balance = $${startBalance} for paper mode`);
          
          try {
            await storage.updatePortfolioBalance({ 
              mode: 'paper', 
              balance: startBalance 
            });
            console.log('[REB 2.8.11] Portfolio balance synchronized successfully');
          } catch (balanceUpdateError: any) {
            console.error('[REB 2.8.11] Failed to sync portfolio balance:', balanceUpdateError);
            
            // REB 2.8.11: CRITICAL - Stop manager before rollback to prevent divergent state
            // The manager is already running; we must stop it atomically before clearing reference
            console.log('[REB 2.8.11] Stopping manager to prevent divergent state...');
            try {
              await manager.stop();
              console.log('[REB 2.8.11] Manager stopped successfully');
            } catch (stopError: any) {
              console.error('[REB 2.8.11] CRITICAL: Failed to stop manager during rollback:', stopError);
              // Continue with rollback even if stop fails
            }
            
            // Rollback: Restore previous balance to maintain consistency
            if (previousBalance !== null) {
              try {
                await storage.updatePortfolioBalance({ 
                  mode: 'paper', 
                  balance: previousBalance 
                });
                console.log(`[REB 2.8.11] Rolled back to previous balance: $${previousBalance}`);
              } catch (rollbackError: any) {
                console.error('[REB 2.8.11] CRITICAL: Failed to rollback balance:', rollbackError);
              }
            }
            
            // Clean up manager reference and mark session as failed
            clearGlobalPaperSimManager();
            const failedSession = await storage.getPaperSimSessionBySessionId(sessionId);
            if (failedSession) {
              await storage.updatePaperSimSession(failedSession.id, { status: 'failed' });
            }
            
            throw new Error(`Failed to sync portfolio balance: ${balanceUpdateError.message}`);
          }
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
          shouldBroadcast: true, // Phase 41F-B: Trigger broadcasts after queue completion
        };
      } catch (error: any) {
        // Phase 41C-FIX: Complete rollback - clean up manager AND database session
        clearGlobalPaperSimManager();
        
        // Roll back database session if it was created
        try {
          const mode = 'paper';
          const existingSession = await storage.getActivePaperSimSession(mode);
          if (existingSession) {
            console.log(`[PaperSimService] Rolling back database session: ${existingSession.sessionId}`);
            await storage.updatePaperSimSession(existingSession.id, { status: 'failed' });
          }
        } catch (rollbackError) {
          console.error('[PaperSimService] Failed to rollback database session:', rollbackError);
        }
        
        console.error('[PaperSimService] Error during start, rollback complete:', error);
        throw error;
      }
    },
    {
      userId,
      mode: 'paper',
      action: 'start',
    }
  );
    
    // Phase 41F-B-2: Fire state sync & broadcasts OUTSIDE queue job (non-blocking)
    if (queueResult.shouldBroadcast) {
      console.log('[41F-B][BROADCAST] Firing engine state sync and broadcasts (async, non-blocking)');
      const mode = 'paper';
      
      // Update trading state (triggers internal broadcasts) - don't block HTTP response
      tradingStateSync.setEngineActive(userId, true, mode)
        .then(() => tradingStateSync.setTradingMode(userId, 'paper', userId, 'Paper simulation started'))
        .then(() => {
          console.log('[41F-B][BROADCAST] Engine state sync completed successfully');
        })
        .catch(err => {
          console.error('[41F-B][BROADCAST] Error in state sync/broadcast:', err);
        });
    }
    
    return queueResult;
  } catch (error: any) {
    console.error('[41F][QUEUE] startPaperSimulation queue error:', error);
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
  console.log(`[41F][QUEUE] stopPaperSimulation called (userId: ${userId})`);
  
  // Phase 41F: Use operation queue instead of busy flag and operation lock
  try {
    const queueResult = await paperOperationQueue.enqueue(
    async () => {
      try {
        // Phase 3D: Mode-based session lookup
        const mode = 'paper';
        const existingSession = await storage.getActivePaperSimSession(mode);
        
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
            shouldBroadcast: false, // Phase 41F-B: No broadcast needed for idempotent reuse
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

        // REB 2.8.5C: Reset 24h window and hourly scan history on ACTIVE → STOPPED
        console.log('[REB 2.8.5C] Resetting FX5 24h window and hourly scan history for paper mode');
        reset24hWindow('paper');
        resetHourlyScanHistory('paper');

        console.log(`[PaperSimService] Stopped session: ${existingSession.sessionId}, duration: ${runDuration}ms`);
        console.log('[PaperSimService] Manager cleared (service + global), DB session ended');
        console.log('[41F-B] Critical teardown complete, preparing HTTP response...');

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
          shouldBroadcast: true, // Phase 41F-B: Trigger broadcasts after queue completion
        };
      } catch (error: any) {
        console.error('[PaperSimService] Error during stop:', error);
        throw error;
      }
    },
    {
      userId,
      mode: 'paper',
      action: 'stop',
    }
  );
    
    // Phase 41F-B-2: Fire state sync & broadcasts OUTSIDE queue job (non-blocking)
    if (queueResult.shouldBroadcast) {
      console.log('[41F-B][BROADCAST] Firing engine stop state sync and broadcasts (async, non-blocking)');
      const mode = 'paper';
      const t2 = Date.now();
      
      // Update trading state (triggers internal broadcasts) - don't block HTTP response
      tradingStateSync.setEngineActive(userId, false, mode)
        .then(async () => {
          console.log(`[41F-B][BROADCAST] State sync completed in ${Date.now() - t2}ms`);
          
          // Verify system_context status in background
          const t3 = Date.now();
          const stoppedContext = await storage.getSystemContext(mode);
          console.log(`[41F-B][BROADCAST] Context verification completed in ${Date.now() - t3}ms`);
          
          if (stoppedContext && !stoppedContext.isEngineActive) {
            console.log('[41F-B][BROADCAST] ✅ Verified system_context.isEngineActive = false');
          } else {
            console.warn('[41F-B][BROADCAST] ⚠️ Failed to verify engine inactive state');
          }
        })
        .catch(err => {
          console.error('[41F-B][BROADCAST] Error in state sync/broadcast:', err);
        });
    }
    
    return queueResult;
  } catch (error: any) {
    console.error('[41F][QUEUE] stopPaperSimulation queue error:', error);
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
    // Phase 3D: Get session from database using mode (single source of truth)
    const mode = 'paper';
    const dbSession = await storage.getActivePaperSimSession(mode);
    
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
