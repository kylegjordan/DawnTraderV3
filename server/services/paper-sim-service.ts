/**
 * Paper Trading Simulation Service
 * Provides direct function calls for starting/stopping paper trading simulation
 * Used by both API endpoints and NLAI action handlers
 */

interface SimulationSession {
  sessionId: string;
  startedBy: string;
  startTime: Date;
  isRunning: boolean;
  type: string;
}

// Global state (imported from routes.ts context)
declare global {
  var globalPaperPortfolioManager: any;
  var globalPaperSimOperationLock: Promise<void> | null;
  function registerSimulationSession(session: SimulationSession): void;
  function deregisterSimulationSession(): void;
  function getGlobalSession(): SimulationSession | null;
}

export interface PaperSimResult {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
}

export async function startPaperSimulation(userId: string): Promise<PaperSimResult> {
  try {
    // Check for existing GLOBAL manager (system-wide check)
    if (global.globalPaperPortfolioManager) {
      return {
        success: false,
        message: 'Paper trading simulation already running (system-wide)',
        error: 'Already running',
      };
    }

    // Check for pending operation (prevent race condition)
    if (global.globalPaperSimOperationLock) {
      return {
        success: false,
        message: 'Paper trading operation already in progress',
        error: 'Operation in progress',
      };
    }

    // Create lock to serialize all start/stop operations
    const startPromise = (async () => {
      try {
        const { PaperPortfolioManager } = await import('./paper-portfolio-manager.js');
        const manager = new PaperPortfolioManager(userId);
        
        // Set the global manager before starting to prevent race condition
        global.globalPaperPortfolioManager = manager;
        
        // Register GLOBAL session for status tracking
        (global as any).registerSimulationSession({
          sessionId: `manual_${Date.now()}`,
          startedBy: userId,
          startTime: new Date(),
          isRunning: true,
          type: 'manual'
        });
        
        await manager.start();
      } catch (error) {
        // Rollback on failure - clean up both manager and session
        global.globalPaperPortfolioManager = null;
        (global as any).deregisterSimulationSession();
        throw error;
      } finally {
        global.globalPaperSimOperationLock = null;
      }
    })();

    global.globalPaperSimOperationLock = startPromise;
    await startPromise;
    
    // Emit start acknowledgment log
    const globalSession = (global as any).getGlobalSession() as SimulationSession | null;
    console.log(`[TradeEngine] start_ack { runId: "${globalSession?.sessionId || 'unknown'}", mode: "paper", t: "${new Date().toISOString()}" }`);
    
    return {
      success: true,
      message: 'Paper trading simulation started successfully. Monitoring live market data and executing trades in simulation mode.',
      data: { sessionId: globalSession?.sessionId },
    };
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

export async function stopPaperSimulation(): Promise<PaperSimResult> {
  try {
    // Check GLOBAL manager (system-wide)
    if (!global.globalPaperPortfolioManager) {
      return {
        success: false,
        message: 'Paper trading simulation not running',
        error: 'Not running',
      };
    }

    // Check for pending operation (prevent race condition)
    if (global.globalPaperSimOperationLock) {
      return {
        success: false,
        message: 'Paper trading operation already in progress',
        error: 'Operation in progress',
      };
    }

    // Create lock to serialize all start/stop operations
    const stopPromise = (async () => {
      // Store reference to current manager for rollback
      const currentManager = global.globalPaperPortfolioManager;
      
      try {
        // Clear global manager first to prevent new operations
        global.globalPaperPortfolioManager = null;
        
        // Deregister GLOBAL session
        (global as any).deregisterSimulationSession();
        
        await currentManager.stop();
      } catch (error) {
        // Only restore if no newer manager was started
        if (!global.globalPaperPortfolioManager) {
          global.globalPaperPortfolioManager = currentManager;
          // Re-register session on rollback
          (global as any).registerSimulationSession({
            sessionId: `manual_${Date.now()}`,
            startedBy: 'unknown',
            startTime: new Date(),
            isRunning: true,
            type: 'manual'
          });
        }
        throw error;
      } finally {
        global.globalPaperSimOperationLock = null;
      }
    })();

    global.globalPaperSimOperationLock = stopPromise;
    await stopPromise;
    
    console.log(`[TradeEngine] stop_ack { mode: "paper", t: "${new Date().toISOString()}" }`);
    
    return {
      success: true,
      message: 'Paper trading simulation stopped successfully. Final report generated.',
    };
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

export async function getPaperSimulationStatus(): Promise<any> {
  const isRunning = global.globalPaperPortfolioManager !== null;
  const globalSession = (global as any).getGlobalSession?.() as SimulationSession | null;
  
  return {
    isRunning,
    sessionInfo: globalSession ? {
      sessionId: globalSession.sessionId,
      startTime: globalSession.startTime,
      type: globalSession.type,
    } : null,
  };
}
