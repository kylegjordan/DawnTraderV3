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
import { livePricingAdapter } from './live-pricing-adapter.js';

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
    marketDataReset: boolean;
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
   * Phase 8.8.3-A2: Lightweight post-reset integrity audit
   * Verifies system state is clean after reset. Logs diagnostics only, does NOT throw errors.
   */
  private async checkPostResetState(mode: 'paper' | 'live'): Promise<{ passed: boolean; issues: string[] }> {
    console.log(`[A2-AUDIT] Starting post-reset integrity audit for mode=${mode}`);
    const issues: string[] = [];

    try {
      // 1. Paper engine must NOT be running
      const engine = getEngineByMode(mode);
      if (engine && typeof engine.isRunning === 'function' && engine.isRunning()) {
        issues.push(`Engine for mode=${mode} is still running`);
      } else if (engine && engine.isRunning === true) {
        issues.push(`Engine for mode=${mode} is still running (property check)`);
      }

      // 2. No open paper positions in DB
      const openPositions = await storage.getPaperSimOpenPositions(mode);
      if (openPositions.length > 0) {
        issues.push(`Found ${openPositions.length} open positions in DB after reset`);
      }

      // 3. No leftover ready-to-buy signals in orchestrator
      const orchestrator = getOrchestratorByMode(mode);
      if (orchestrator && typeof orchestrator.getReadySignals === 'function') {
        const readySignals = orchestrator.getReadySignals();
        if (readySignals && readySignals.length > 0) {
          issues.push(`Orchestrator has ${readySignals.length} leftover ready signals`);
        }
      }

      // 4. WebSocket adapter has zero active subscriptions
      const wsStats = krakenWebSocketAdapter.getSubscriptionStats();
      if (wsStats.subscribedSymbols > 0) {
        issues.push(`WebSocket adapter has ${wsStats.subscribedSymbols} active subscriptions`);
      }

      // 5. Price cache is empty
      const priceCacheSize = livePricingAdapter.getCacheSize();
      if (priceCacheSize > 0) {
        issues.push(`Price cache has ${priceCacheSize} entries`);
      }

      // 6. FX5 windows check - these should be empty after reset
      // Note: We can't directly check FX5 internal state without new exports,
      // so we rely on the reset calls having succeeded earlier

      const passed = issues.length === 0;
      
      if (passed) {
        console.log(`[A2-AUDIT] ✅ Post-reset integrity audit PASSED - system is clean`);
      } else {
        console.warn(`[A2-AUDIT] ⚠️ Post-reset integrity audit found ${issues.length} issue(s):`, issues);
      }

      return { passed, issues };
    } catch (auditErr) {
      console.warn(`[A2-AUDIT] Audit check failed (non-blocking):`, auditErr);
      return { passed: false, issues: [`Audit error: ${auditErr instanceof Error ? auditErr.message : 'Unknown'}`] };
    }
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
        marketDataReset: false,
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
        
        result.details.engineReset = true;
        result.details.orchestratorReset = true;
      }

      // 1.5) B7.MDR: UNCONDITIONAL Market Data Reset - Always clear price and WebSocket caches
      console.log(`[B7.MDR] Starting market data reset...`);
      try {
        // Get pre-reset stats for verification
        const wsStats = krakenWebSocketAdapter.getSubscriptionStats();
        const priceCacheSize = livePricingAdapter.getCacheSize();
        console.log(`[B7.MDR][PRE] priceCache=${priceCacheSize}, subscribedSymbols=${wsStats.subscribedSymbols}, symbolStats=${wsStats.symbolStats}, priceTickLogs=${wsStats.priceTickLogs}`);
        
        // Clear WebSocket subscriptions (unconditional)
        krakenWebSocketAdapter.clearAllSubscriptions();
        
        // Clear price cache (unconditional)
        livePricingAdapter.clearCache();
        
        // Verify post-reset stats - MUST all be zero
        const wsStatsPost = krakenWebSocketAdapter.getSubscriptionStats();
        const priceCacheSizePost = livePricingAdapter.getCacheSize();
        console.log(`[B7.MDR][POST] priceCache=${priceCacheSizePost}, subscribedSymbols=${wsStatsPost.subscribedSymbols}, symbolStats=${wsStatsPost.symbolStats}, priceTickLogs=${wsStatsPost.priceTickLogs}`);
        
        // Validate all caches are actually cleared
        const allCachesCleared = priceCacheSizePost === 0 && 
          wsStatsPost.subscribedSymbols === 0 && 
          wsStatsPost.symbolStats === 0 && 
          wsStatsPost.priceTickLogs === 0;
        
        if (allCachesCleared) {
          result.details.marketDataReset = true;
          console.log(`[B7.MDR] Market data reset complete - all caches verified empty`);
        } else {
          console.error(`[B7.MDR][FAIL] Market data reset incomplete - caches not fully cleared: priceCache=${priceCacheSizePost}, subscribedSymbols=${wsStatsPost.subscribedSymbols}, symbolStats=${wsStatsPost.symbolStats}, priceTickLogs=${wsStatsPost.priceTickLogs}`);
          result.details.marketDataReset = false;
        }
      } catch (mdErr) {
        console.error(`[B7.MDR][ERROR] Market data reset failed:`, mdErr);
        result.details.marketDataReset = false;
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

      // Phase 8.8.3-A2: Lightweight post-reset integrity audit
      await this.checkPostResetState(mode);

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
