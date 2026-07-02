/**
 * Paper Simulation Heartbeat & Recovery Service
 * Phase 23 - Simulation Heartbeat & Recovery
 * 
 * Provides:
 * 1. Heartbeat scheduler (every 30s) to monitor running simulations
 * 2. Recovery logic on application startup
 * 3. Auto-resume functionality for interrupted sessions
 * 4. State consistency checks
 */

import { storage } from '../storage';
import { clusterBus } from './cluster-bus';

class ActiveEngineHeartbeatService {
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private readonly HEARTBEAT_INTERVAL_MS = 30 * 1000; // 30 seconds
  private isRunning = false;

  /**
   * Start the heartbeat scheduler
   */
  start(): void {
    if (this.isRunning) {
      console.log('[PaperSimHeartbeat] Already running');
      return;
    }

    console.log('[PaperSimHeartbeat] Starting heartbeat scheduler (interval: 30s)');
    
    this.isRunning = true;
    
    // Run first check immediately
    this.runHeartbeatCheck();
    
    // Then schedule subsequent checks
    this.heartbeatInterval = setInterval(() => {
      this.runHeartbeatCheck();
    }, this.HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Stop the heartbeat scheduler
   */
  stop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    this.isRunning = false;
    console.log('[PaperSimHeartbeat] Stopped heartbeat scheduler');
  }

  /**
   * Run heartbeat check on all active sessions
   * Phase 27.F.9: Added reconciliation guard to heal state mismatches
   */
  private async runHeartbeatCheck(): Promise<void> {
    try {
      console.log('[PaperSimHeartbeat] Running heartbeat check...');
      
      // Phase 27.F.9: Reconciliation guard - heal any mismatch automatically
      const { getGlobalActiveEngineManager, clearGlobalActiveEngineManager } = await import('./active-engine-service');
      const activeSessions = await storage.getActivePaperSimSessions();
      const globalManager = getGlobalActiveEngineManager();
      
      // Heal orphaned global manager (manager exists but no DB session)
      if (globalManager && activeSessions.length === 0) {
        console.warn('[PaperSimHeartbeat] Orphaned global manager detected – cleaning up');
        clearGlobalActiveEngineManager();
      }
      
      console.log(`[PaperSimHeartbeat] Found ${activeSessions.length} active session(s)`);
      
      if (activeSessions.length === 0) {
        return;
      }

      // Check each session (Phase 27.F.13.C.D: Added null-safety guards)
      for (const session of activeSessions) {
        if (!session) {
          console.warn('[PaperSimHeartbeat] Session undefined — skipping check');
          continue;
        }
        await this.checkSession(session);
      }

      // Emit heartbeat event to cluster bus
      await clusterBus.publish('task_completed', {
        taskType: 'simulation_heartbeat',
        activeSessions: activeSessions.length,
        timestamp: new Date().toISOString(),
        success: true,
      }, 'active_engine_heartbeat');

    } catch (error: any) {
      console.error('[PaperSimHeartbeat] Error during heartbeat check:', error);
      
      // Emit error event
      try {
        await clusterBus.publish('health_alert', {
          alert: 'active_engine_heartbeat_failure',
          error: error.message,
          timestamp: new Date().toISOString(),
        }, 'active_engine_heartbeat');
      } catch (busError) {
        console.error('[PaperSimHeartbeat] Failed to emit health alert:', busError);
      }
    }
  }

  /**
   * Check individual session health and expiration
   * Phase 27.4.2: Added cross-verification with system_context
   * Phase 27.F.13.C.D: Added null-safety guards
   */
  private async checkSession(session: any): Promise<void> {
    try {
      // Phase 27.F.13.C.D: Null-safety guard
      if (!session) {
        console.warn('[PaperSimHeartbeat] Session undefined — skipping check');
        return;
      }
      
      const sessionId = session.id;
      const userId = session.userId;
      
      if (!sessionId || !userId) {
        console.warn('[PaperSimHeartbeat] Session missing required fields — skipping check');
        return;
      }
      
      console.log(`[PaperSimHeartbeat] Checking session ${sessionId} for user ${userId}`);

      // Phase 27.4.2: Cross-verify against system_context (single source of truth)
      // Phase 27.F.13.O: Use mode for global context
      const mode = 'paper';
      const systemContext = await storage.getSystemContext(mode);
      
      if (systemContext) {
        // Check if trading mode is set to paper
        if (systemContext.tradingMode !== 'paper') {
          console.warn(`[PaperSimHeartbeat] ⚠️ Mode mismatch for session ${sessionId}: system_context=${systemContext.tradingMode}, expected=paper`);
          
          // Emit warning
          await clusterBus.publish('health_alert', {
            alert: 'active_engine_mode_mismatch',
            sessionId,
            userId,
            systemContextMode: systemContext.tradingMode,
            expectedMode: 'paper',
            timestamp: new Date().toISOString(),
          }, 'active_engine_heartbeat');
          
          // Auto-correct: Stop the simulation as it's running in wrong mode
          console.log(`[PaperSimHeartbeat] Auto-stopping session ${sessionId} due to mode mismatch`);
          await storage.updatePaperSimSession(sessionId, {
            status: 'stopped',
            stoppedAt: new Date(),
          });
          
          return; // Skip further checks
        }
        
        console.log(`[PaperSimHeartbeat] Mode verification passed: ${systemContext.tradingMode}`);
      }
      
      // Verify in-memory manager exists and check consistency
      const { getActiveEngineStatus } = await import('./active-engine-service');
      const status = await getActiveEngineStatus(userId);
      
      // Phase 27.F.13.C.D: Null-safety guard for reconciliation
      if (!status || !status.reconciliation) {
        console.warn(`[PaperSimHeartbeat] Session ${sessionId} status incomplete — skipping consistency check`);
        return;
      }
      
      if (!status.reconciliation.isConsistent) {
        console.warn(`[PaperSimHeartbeat] ⚠️ Session ${sessionId} is in inconsistent state:`, status.reconciliation);
        
        // Emit warning
        await clusterBus.publish('health_alert', {
          alert: 'active_engine_state_inconsistent',
          sessionId,
          userId,
          reconciliation: status.reconciliation,
          timestamp: new Date().toISOString(),
        }, 'active_engine_heartbeat');
      } else {
        console.log(`[PaperSimHeartbeat] ✅ Session ${sessionId} healthy`);
      }

    } catch (error: any) {
      console.error(`[PaperSimHeartbeat] Error checking session:`, error);
    }
  }

  /**
   * Recovery logic - run on application startup
   * Restores or cleans up interrupted sessions
   */
  async recoverSessions(autoResume: boolean = false): Promise<void> {
    try {
      console.log('[PaperSimHeartbeat] Starting session recovery...');
      
      // Get all sessions marked as running in database
      const sessions = await storage.getActivePaperSimSessions();
      
      if (sessions.length === 0) {
        console.log('[PaperSimHeartbeat] No sessions to recover');
        return;
      }

      console.log(`[PaperSimHeartbeat] Found ${sessions.length} session(s) to recover`);

      for (const session of sessions) {
        // Phase 27.F.13.C.D: Null-safety guard
        if (!session) {
          console.warn('[PaperSimHeartbeat] Session undefined — skipping recovery');
          continue;
        }
        await this.recoverSession(session, autoResume);
      }

      console.log('[PaperSimHeartbeat] ✅ Session recovery complete');

    } catch (error: any) {
      console.error('[PaperSimHeartbeat] Error during session recovery:', error);
    }
  }

  /**
   * Recover individual session
   * Phase 27.F.13.C.D: Added null-safety guards
   */
  private async recoverSession(session: any, autoResume: boolean): Promise<void> {
    try {
      // Phase 27.F.13.C.D: Null-safety guard
      if (!session) {
        console.warn('[PaperSimHeartbeat] Session undefined — skipping recovery');
        return;
      }
      
      const sessionId = session.id;
      const userId = session.userId;
      
      if (!sessionId || !userId) {
        console.warn('[PaperSimHeartbeat] Session missing required fields — skipping recovery');
        return;
      }
      
      const startedAt = new Date(session.startedAt);
      
      console.log(`[PaperSimHeartbeat] Recovering session ${sessionId} (user: ${userId}, started: ${startedAt.toISOString()})`);

      // Check if session should still be running
      // For now, we don't have a duration limit, so check if it was interrupted
      
      if (autoResume) {
        // Auto-resume: Restart the in-memory manager
        console.log(`[PaperSimHeartbeat] Auto-resuming session ${sessionId}...`);
        
        const { startActiveEngine } = await import('./active-engine-service');
        
        // This will check if already running and create manager if needed
        const result = await startActiveEngine(userId);
        
        if (result.success) {
          console.log(`[PaperSimHeartbeat] ✅ Session ${sessionId} auto-resumed successfully`);
          
          // Emit recovery event
          await clusterBus.publish('task_completed', {
            taskType: 'simulation_recovery',
            action: 'auto_resumed',
            sessionId,
            userId,
            timestamp: new Date().toISOString(),
            success: true,
          }, 'active_engine_heartbeat');
        } else {
          console.error(`[PaperSimHeartbeat] Failed to auto-resume session ${sessionId}:`, result.message);
        }
        
      } else {
        // Clean stop: Mark as stopped since server restarted
        console.log(`[PaperSimHeartbeat] Cleanly stopping interrupted session ${sessionId}...`);
        
        await storage.updatePaperSimSession(sessionId, {
          status: 'stopped',
          stoppedAt: new Date(),
        });
        
        console.log(`[PaperSimHeartbeat] ✅ Session ${sessionId} marked as stopped`);
        
        // Emit recovery event
        await clusterBus.publish('task_completed', {
          taskType: 'simulation_recovery',
          action: 'cleanly_stopped',
          sessionId,
          userId,
          timestamp: new Date().toISOString(),
          success: true,
        }, 'active_engine_heartbeat');
      }

    } catch (error: any) {
      console.error(`[PaperSimHeartbeat] Error recovering session:`, error);
    }
  }

  /**
   * Get current heartbeat status
   */
  getStatus(): {
    isRunning: boolean;
    intervalMs: number;
  } {
    return {
      isRunning: this.isRunning,
      intervalMs: this.HEARTBEAT_INTERVAL_MS,
    };
  }
}

// Export singleton instance
export const activeEngineHeartbeat = new ActiveEngineHeartbeatService();
