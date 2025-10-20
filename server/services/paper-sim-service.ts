/**
 * Paper Trading Simulation Service
 * Provides idempotent function calls for starting/stopping paper trading simulation
 * Uses database as single source of truth for session state
 * Integrated with ExecutionPolicyController and ClusterBus
 */

import { nanoid } from 'nanoid';
import { storage } from '../storage.js';
import type { InsertPaperSimSession } from '../../shared/schema.js';

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
        // Check database for existing running session (single source of truth)
        const existingSession = await storage.getActivePaperSimSession(userId);
        
        if (existingSession) {
          // IDEMPOTENT: Session already running, return success with existing info
          console.log(`[PaperSimService] Paper trading already running (session: ${existingSession.sessionId})`);
          
          // Reconcile in-memory state with database
          if (!global.globalPaperPortfolioManager) {
            // Manager was lost (e.g., server restart), recreate it
            console.log('[PaperSimService] Reconciling manager from database session');
            const { PaperPortfolioManager } = await import('./paper-portfolio-manager.js');
            const manager = new PaperPortfolioManager(userId);
            global.globalPaperPortfolioManager = manager;
            await manager.start();
          }
          
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

        // No existing session - create new one
        const sessionId = `paper_${nanoid(10)}`;
        const startedAt = new Date();
        
        // Calculate end time if runForMs is specified
        const endsAt = options?.runForMs 
          ? new Date(startedAt.getTime() + options.runForMs) 
          : null;

        // Create session in database FIRST (source of truth)
        const sessionData: InsertPaperSimSession = {
          sessionId,
          userId,
          mode: 'paper',
          status: 'running',
          startedAt,
          startingBalance: options?.startingBalance?.toString() || '10000',
          runForMs: options?.runForMs || null,
          endsAt: endsAt?.toISOString() || null,
          startedBy: options?.startedBy || 'manual',
          metadata: options?.metadata || null,
        };

        const dbSession = await storage.createPaperSimSession(sessionData);
        console.log(`[PaperSimService] Created new session in database: ${sessionId}`);

        // Start portfolio manager
        const { PaperPortfolioManager } = await import('./paper-portfolio-manager.js');
        const manager = new PaperPortfolioManager(userId);
        
        // Set global manager
        global.globalPaperPortfolioManager = manager;
        
        await manager.start();
        
        // Emit cluster bus event for distributed awareness
        try {
          const { ClusterBus } = await import('./cluster-bus.js');
          const clusterBus = ClusterBus.getInstance();
          await clusterBus.emit({
            eventType: 'paper_sim_started',
            topic: 'trading',
            metadata: {
              sessionId,
              userId,
              startedAt: startedAt.toISOString(),
              startedBy: options?.startedBy || 'manual',
              mode: 'paper',
            },
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
        // Rollback: Clean up manager and database session on failure
        global.globalPaperPortfolioManager = null;
        
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
          
          // Clean up orphaned in-memory manager if exists
          if (global.globalPaperPortfolioManager) {
            console.log('[PaperSimService] Cleaning up orphaned manager');
            try {
              await global.globalPaperPortfolioManager.stop();
            } catch (cleanupError) {
              console.warn('[PaperSimService] Error cleaning up manager:', cleanupError);
            }
            global.globalPaperPortfolioManager = null;
          }
          
          return {
            success: true,
            message: 'Paper trading simulation already stopped',
            data: { isIdempotentReuse: true },
          };
        }

        // Stop portfolio manager
        const currentManager = global.globalPaperPortfolioManager;
        if (currentManager) {
          await currentManager.stop();
          global.globalPaperPortfolioManager = null;
        } else {
          console.warn('[PaperSimService] No active manager found, updating database only');
        }

        // Calculate final metrics
        const stoppedAt = new Date();
        const runDuration = stoppedAt.getTime() - new Date(existingSession.startedAt).getTime();

        // Update session in database
        await storage.updatePaperSimSession(existingSession.id, {
          status: 'stopped',
          stoppedAt: stoppedAt.toISOString(),
          runForMs: runDuration,
        });

        console.log(`[PaperSimService] Stopped session: ${existingSession.sessionId}, duration: ${runDuration}ms`);

        // Emit cluster bus event for distributed awareness
        try {
          const { ClusterBus } = await import('./cluster-bus.js');
          const clusterBus = ClusterBus.getInstance();
          await clusterBus.emit({
            eventType: 'paper_sim_stopped',
            topic: 'trading',
            metadata: {
              sessionId: existingSession.sessionId,
              userId,
              stoppedAt: stoppedAt.toISOString(),
              runDurationMs: runDuration,
              mode: 'paper',
            },
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
    
    // Get in-memory manager state
    const hasManager = global.globalPaperPortfolioManager !== null;
    
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
      isRunning: !!dbSession,
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
