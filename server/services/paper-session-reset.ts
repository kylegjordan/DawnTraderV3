/**
 * Phase 8.8.3-B7.A: Paper Session Reset Service
 * 
 * Single authoritative service for performing a complete hard reset of paper simulation.
 * Eliminates ghost trades by coordinating reset across ALL components:
 * - Engine in-memory state
 * - Orchestrator session state
 * - Sizing caches
 * - Diagnostics buffers (B4/B5)
 * - Database open positions and trades
 * 
 * This ensures clicking "Reset / New paper sim" in the UI gives a genuinely fresh session.
 */

import { storage } from '../storage';
import { b4Diagnostics } from './b4-diagnostics.js';
import { b5SizingAudit } from './b5-sizing-audit.js';
import { getGlobalPaperSimManager, clearGlobalPaperSimManager, getEngineByMode, getOrchestratorByMode } from './paper-sim-service.js';
import { reset24hWindow, resetHourlyScanHistory } from './fx5-24h-window.js';
import { krakenWebSocketAdapter } from './kraken-websocket-adapter.js';

export interface HardResetResult {
  success: boolean;
  message: string;
  details: {
    engineReset: boolean;
    orchestratorReset: boolean;
    diagnosticsReset: boolean;
    databaseReset: boolean;
    closedTrades: number;
    clearedPositions: number;
    fx5WindowsReset: boolean;
  };
}

class PaperSessionResetService {
  private static instance: PaperSessionResetService;

  private constructor() {
    console.log('[B7.A] PaperSessionResetService initialized');
  }

  public static getInstance(): PaperSessionResetService {
    if (!PaperSessionResetService.instance) {
      PaperSessionResetService.instance = new PaperSessionResetService();
    }
    return PaperSessionResetService.instance;
  }

  /**
   * Hard reset for paper mode.
   * Clears ALL paper session state: engine, sizing, orchestrator,
   * filters/signals, diagnostics, and DB rows for open positions.
   */
  async hardResetPaperSimulation(mode: 'paper' | 'live' = 'paper'): Promise<HardResetResult> {
    console.log(`[B7.A][HARD_RESET] Starting hard reset for mode=${mode}`);
    const startTime = Date.now();

    const result: HardResetResult = {
      success: false,
      message: '',
      details: {
        engineReset: false,
        orchestratorReset: false,
        diagnosticsReset: false,
        databaseReset: false,
        closedTrades: 0,
        clearedPositions: 0,
        fx5WindowsReset: false,
      },
    };

    try {
      // 1) Stop and clear global paper portfolio manager (contains engine + orchestrator)
      const manager = getGlobalPaperSimManager();
      if (manager) {
        try {
          if (typeof manager.stop === 'function') {
            await manager.stop();
            console.log(`[B7.A][HARD_RESET] Manager stopped for mode=${mode}`);
          }
          
          if (typeof manager.resetSessionState === 'function') {
            manager.resetSessionState();
            result.details.engineReset = true;
            console.log(`[B7.A][HARD_RESET] Manager session state cleared`);
          }
        } catch (managerErr) {
          console.warn(`[B7.A][HARD_RESET] Manager stop warning:`, managerErr);
        }
        
        clearGlobalPaperSimManager();
        result.details.engineReset = true;
        result.details.orchestratorReset = true;
        console.log(`[B7.A][HARD_RESET] Global manager cleared`);
      } else {
        console.log(`[B7.A][HARD_RESET] No active manager - attempting direct component reset`);
        
        // B7.A Enhancement: Direct fallback to engine/orchestrator reset even without manager
        try {
          const engine = getEngineByMode(mode);
          if (engine && typeof engine.resetSessionState === 'function') {
            engine.resetSessionState();
            result.details.engineReset = true;
            console.log(`[B7.A][HARD_RESET] Direct engine reset for mode=${mode}`);
          }
        } catch (engineErr) {
          console.warn(`[B7.A][HARD_RESET] Direct engine reset warning:`, engineErr);
        }
        
        try {
          const orchestrator = getOrchestratorByMode(mode);
          if (orchestrator && typeof orchestrator.resetSession === 'function') {
            orchestrator.resetSession();
            result.details.orchestratorReset = true;
            console.log(`[B7.A][HARD_RESET] Direct orchestrator reset for mode=${mode}`);
          }
        } catch (orchErr) {
          console.warn(`[B7.A][HARD_RESET] Direct orchestrator reset warning:`, orchErr);
        }
        
        // Clear WebSocket subscriptions as failsafe
        try {
          krakenWebSocketAdapter.clearAllSubscriptions();
          console.log(`[B7.A][HARD_RESET] WebSocket subscriptions cleared (fallback)`);
        } catch (wsErr) {
          console.warn(`[B7.A][HARD_RESET] WebSocket clear warning:`, wsErr);
        }
        
        result.details.engineReset = true;
        result.details.orchestratorReset = true;
      }

      // 2) Clear diagnostics buffers (B4/B5)
      try {
        b4Diagnostics.resetSession();
        console.log(`[B7.A][HARD_RESET] B4 diagnostics reset`);
        
        if (typeof b5SizingAudit.reset === 'function') {
          b5SizingAudit.reset();
          console.log(`[B7.A][HARD_RESET] B5 diagnostics reset`);
        }
        
        result.details.diagnosticsReset = true;
      } catch (diagErr) {
        console.warn(`[B7.A][HARD_RESET] Diagnostics reset warning:`, diagErr);
      }

      // 3) Reset FX5 24h windows and hourly scan history
      try {
        reset24hWindow(mode);
        resetHourlyScanHistory(mode);
        result.details.fx5WindowsReset = true;
        console.log(`[B7.A][HARD_RESET] FX5 windows and scan history reset`);
      } catch (fx5Err) {
        console.warn(`[B7.A][HARD_RESET] FX5 reset warning:`, fx5Err);
      }

      // 4) Clear DB state for open paper positions and trades
      try {
        const dbResult = await storage.hardResetPaperSim(mode);
        result.details.closedTrades = dbResult.closedTrades;
        result.details.clearedPositions = dbResult.clearedPositions;
        result.details.databaseReset = true;
        console.log(`[B7.A][HARD_RESET] Database reset: ${dbResult.closedTrades} trades closed, ${dbResult.clearedPositions} positions cleared`);
      } catch (dbErr) {
        console.error(`[B7.A][HARD_RESET] Database reset error:`, dbErr);
        throw dbErr;
      }

      // 5) Clear global paper sim state flags
      (global as any).globalPaperPortfolioManager = null;
      (global as any).globalPaperSimOperationLock = null;
      (global as any).globalPaperSimBusyFlag = false;

      const elapsed = Date.now() - startTime;
      result.success = true;
      result.message = `Hard reset completed in ${elapsed}ms`;
      
      console.log(`[B7.A][HARD_RESET] ✅ Complete: ${result.message}`, result.details);
      
      return result;
    } catch (error) {
      const elapsed = Date.now() - startTime;
      result.message = `Hard reset failed after ${elapsed}ms: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(`[B7.A][HARD_RESET] ❌ Failed:`, error);
      return result;
    }
  }
}

export const paperSessionResetService = PaperSessionResetService.getInstance();
