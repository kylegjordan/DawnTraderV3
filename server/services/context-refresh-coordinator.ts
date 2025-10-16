/**
 * Phase 8.5 Addendum H - Context Refresh Coordinator
 * 
 * Fetches live data from backend and synchronizes Cortex + Walter contexts.
 * Emits WebSocket events for real-time UI updates.
 */

import { storage } from '../storage';
import { cortexCore } from './cortex/cortex-core';
import { strategyAnalytics } from './strategy-analytics';
import { portfolioAggregator } from './portfolio-aggregator';
import { systemHealthMonitor } from './system-health-monitor';
import { EventEmitter } from 'events';
import { createMemory } from './walter-memory';
import { systemTruthDiagnostic } from './system-truth-diagnostic';

const MODULE_NAME = 'ContextRefresh';

export interface RefreshResult {
  success: boolean;
  latencyMs: number;
  source: 'api' | 'direct' | 'resync';
  timestamp: string;
  userId: string;
  mode: 'live' | 'paper';
  discrepanciesFound: number;
  error?: string;
}

export interface RefreshMetrics {
  lastRefreshISO: string | null;
  avgLatencyMs: number;
  totalRefreshes: number;
  failedRefreshes: number;
  lastError: string | null;
  lastLivePortfolio: number | null; // Phase 8.5 Addendum I
  lastLiveSyncAt: string | null; // Phase 8.5 Addendum K.4: Last live sync timestamp
  lastPaperSyncAt: string | null; // Phase 8.5 Addendum K.4: Last paper sync timestamp
}

// Phase 8.5 Addendum K.4: Dual-mode data structure
export interface DualModeData {
  live: {
    portfolioBalance: number;
    activeStrategies: string[];
    activeStrategiesCount: number;
    engineActive: boolean;
    engineStatus: 'running' | 'stopped';
    lastSyncAt: string;
    contextAge: number; // seconds since last sync
  };
  paper: {
    portfolioBalance: number;
    activeStrategies: string[];
    activeStrategiesCount: number;
    engineActive: boolean;
    engineStatus: 'running' | 'stopped';
    lastSyncAt: string;
    contextAge: number; // seconds since last sync
  };
  settings: {
    riskPerTrade: number;
    dailyLossKillSwitch: number;
    maxExposurePercent: number;
  };
  timestamp: string;
  source: 'live-api';
}

class ContextRefreshCoordinator extends EventEmitter {
  private readonly MODULE_NAME = MODULE_NAME;
  private metrics: RefreshMetrics = {
    lastRefreshISO: null,
    avgLatencyMs: 0,
    totalRefreshes: 0,
    failedRefreshes: 0,
    lastError: null,
    lastLivePortfolio: null,
    lastLiveSyncAt: null,
    lastPaperSyncAt: null
  };
  private latencyHistory: number[] = [];
  private readonly MAX_LATENCY_SAMPLES = 100;
  
  // Phase 8.5 Addendum J: Track last context to prevent duplicate memory entries
  private lastContextByUser: Map<string, string> = new Map();

  /**
   * Refresh live context for a user - fetch from backend, update Cortex, emit events
   */
  async refresh(userId: string, mode: 'live' | 'paper', source: 'api' | 'direct' | 'resync' = 'direct'): Promise<RefreshResult> {
    console.log(`[${this.MODULE_NAME}] 🔄 Refreshing context for user ${userId} (${mode}, source=${source})`);
    const start = Date.now();

    try {
      // Fetch fresh data from backend
      const freshData = await this.fetchFreshData(userId, mode);

      // Update Cortex cache with fresh data
      await this.updateCortex(userId, mode, freshData);

      // Update Walter's semantic memory with refreshed context (Phase 8.5 Addendum H)
      await this.updateWalterMemory(userId, mode, freshData);

      // Run truth check to detect any remaining discrepancies
      const truthCheck = await systemTruthDiagnostic.runTruthCheck(userId, mode);
      const discrepanciesFound = truthCheck.discrepancies.length;

      // Phase 8.5 Addendum I: Auto-resync if discrepancies detected
      if (discrepanciesFound > 0 && source !== 'resync') {
        console.log(`[${this.MODULE_NAME}] [TruthSync] mismatch detected (${discrepanciesFound} discrepancies) → forced resync`);
        // Trigger secondary refresh to resolve misalignments
        return await this.refresh(userId, mode, 'resync');
      }

      // Calculate latency and update metrics (Phase 8.5 Addendum I: track lastLivePortfolio)
      const latencyMs = Date.now() - start;
      this.updateMetrics(latencyMs, true);
      this.metrics.lastLivePortfolio = freshData.portfolioBalance;

      // Record in SystemHealthMonitor with actual discrepancy count (Phase 8.5 Addendum H)
      systemHealthMonitor.recordContextRefresh(latencyMs, true, discrepanciesFound);

      // Emit WebSocket event for real-time UI updates
      this.emit('contextRefreshed', {
        userId,
        mode,
        source,
        timestamp: new Date().toISOString(),
        portfolioBalance: freshData.portfolioBalance,
        activeStrategiesCount: freshData.activeStrategies.length,
        discrepanciesFound
      });

      // Phase 8.5 Addendum J: Emit contextUpdated event for Walter rehydration
      this.emit('contextUpdated', userId);

      console.log(`[${this.MODULE_NAME}] ✅ Context refreshed in ${latencyMs}ms (${discrepanciesFound} discrepancies detected)`);

      const result: RefreshResult = {
        success: true,
        latencyMs,
        source,
        timestamp: new Date().toISOString(),
        userId,
        mode,
        discrepanciesFound
      };

      return result;
    } catch (error) {
      const latencyMs = Date.now() - start;
      this.updateMetrics(latencyMs, false);
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Record failure in SystemHealthMonitor (Phase 8.5 Addendum H)
      systemHealthMonitor.recordContextRefresh(latencyMs, false, 0);
      
      console.error(`[${this.MODULE_NAME}] ❌ Context refresh failed:`, error);

      return {
        success: false,
        latencyMs,
        source,
        timestamp: new Date().toISOString(),
        userId,
        mode,
        discrepanciesFound: 0,
        error: errorMessage
      };
    }
  }

  /**
   * Fetch fresh data from backend (portfolio, strategies, settings)
   * Phase 8.5 Addendum K.3: Uses global context for shared data
   */
  private async fetchFreshData(userId: string, mode: 'live' | 'paper') {
    console.log(`[${this.MODULE_NAME}] [ContextSource] live-api ✓ (global context)`);
    
    const globalContextId = 'default';
    
    // Fetch in parallel - using global context for shared data
    const [portfolioState, strategies, settings, user] = await Promise.all([
      storage.getPortfolioState({ globalContextId, mode }),
      storage.listStrategySettings({ globalContextId, mode }),
      storage.getTradingSettings(userId),
      storage.getUser(userId)
    ]);

    // Get global session for engineActive status
    const globalSession = (global as any).getGlobalSession?.();
    const engineActive = !!(globalSession && globalSession.isRunning);

    // Extract data - NO FALLBACK to 1000 (Phase 8.5 Addendum I)
    // Use actual portfolio_state balance or 0 (matches /api/trading/status)
    const portfolioBalance = portfolioState ? parseFloat(portfolioState.balance) : 0;
    const activeStrategies = strategies
      .filter(s => s.enabled)
      .map(s => s.strategy)
      .sort();

    const freshData = {
      portfolioBalance,
      activeStrategies,
      activeStrategiesCount: activeStrategies.length,
      engineActive,
      mode: (user?.tradingMode || mode) as 'live' | 'paper',
      riskPerTrade: settings?.riskPerTrade ? parseFloat(settings.riskPerTrade.toString()) : 0,
      dailyLossKillSwitch: settings?.dailyLossKillSwitch ? parseFloat(settings.dailyLossKillSwitch.toString()) : 7.0,
      maxExposurePercent: settings?.maxExposurePercent ? parseFloat(settings.maxExposurePercent.toString()) : 100,
      timestamp: new Date().toISOString(),
      source: 'live-api' as const
    };

    console.log(`[${this.MODULE_NAME}] source=live-api (global) portfolio=${portfolioBalance} strategies=${activeStrategies.length}`);
    
    return freshData;
  }

  /**
   * Phase 8.5 Addendum K.4: Fetch BOTH live and paper mode data simultaneously
   * This ensures Walter and dashboard always have complete visibility regardless of engine status
   */
  private async fetchDualModeData(userId: string): Promise<DualModeData> {
    console.log(`[${this.MODULE_NAME}] [Addendum-K.4] Fetching dual-mode data (live + paper)`);
    
    const globalContextId = 'default';
    const now = new Date().toISOString();
    
    // Fetch all data in parallel for both modes
    const [
      livePortfolioState,
      paperPortfolioState,
      liveStrategies,
      paperStrategies,
      settings,
      user
    ] = await Promise.all([
      storage.getPortfolioState({ globalContextId, mode: 'live' }),
      storage.getPortfolioState({ globalContextId, mode: 'paper' }),
      storage.listStrategySettings({ globalContextId, mode: 'live' }),
      storage.listStrategySettings({ globalContextId, mode: 'paper' }),
      storage.getTradingSettings(userId),
      storage.getUser(userId)
    ]);

    // Get global session for paper engine status
    const globalSession = (global as any).getGlobalSession?.();
    const paperEngineActive = !!(globalSession && globalSession.isRunning);
    
    // TODO: Add live engine status tracking (currently always false until live trading implemented)
    const liveEngineActive = false;

    // Process live mode data
    const liveBalance = livePortfolioState ? parseFloat(livePortfolioState.balance) : 0;
    const liveActiveStrategies = liveStrategies
      .filter(s => s.enabled)
      .map(s => s.strategy)
      .sort();
    const liveLastSync = this.metrics.lastLiveSyncAt || now;
    const liveContextAge = this.metrics.lastLiveSyncAt 
      ? Math.floor((Date.now() - new Date(this.metrics.lastLiveSyncAt).getTime()) / 1000)
      : 0;

    // Process paper mode data
    const paperBalance = paperPortfolioState ? parseFloat(paperPortfolioState.balance) : 0;
    const paperActiveStrategies = paperStrategies
      .filter(s => s.enabled)
      .map(s => s.strategy)
      .sort();
    const paperLastSync = this.metrics.lastPaperSyncAt || now;
    const paperContextAge = this.metrics.lastPaperSyncAt
      ? Math.floor((Date.now() - new Date(this.metrics.lastPaperSyncAt).getTime()) / 1000)
      : 0;

    // Update sync timestamps
    this.metrics.lastLiveSyncAt = now;
    this.metrics.lastPaperSyncAt = now;

    const dualModeData: DualModeData = {
      live: {
        portfolioBalance: liveBalance,
        activeStrategies: liveActiveStrategies,
        activeStrategiesCount: liveActiveStrategies.length,
        engineActive: liveEngineActive,
        engineStatus: liveEngineActive ? 'running' : 'stopped',
        lastSyncAt: liveLastSync,
        contextAge: liveContextAge
      },
      paper: {
        portfolioBalance: paperBalance,
        activeStrategies: paperActiveStrategies,
        activeStrategiesCount: paperActiveStrategies.length,
        engineActive: paperEngineActive,
        engineStatus: paperEngineActive ? 'running' : 'stopped',
        lastSyncAt: paperLastSync,
        contextAge: paperContextAge
      },
      settings: {
        riskPerTrade: settings?.riskPerTrade ? parseFloat(settings.riskPerTrade.toString()) : 0,
        dailyLossKillSwitch: settings?.dailyLossKillSwitch ? parseFloat(settings.dailyLossKillSwitch.toString()) : 7.0,
        maxExposurePercent: settings?.maxExposurePercent ? parseFloat(settings.maxExposurePercent.toString()) : 100
      },
      timestamp: now,
      source: 'live-api'
    };

    console.log(
      `[${this.MODULE_NAME}] ✅ Dual-mode data fetched: ` +
      `live=$${liveBalance} (${liveActiveStrategies.length} strategies, ${liveEngineActive ? 'running' : 'stopped'}), ` +
      `paper=$${paperBalance} (${paperActiveStrategies.length} strategies, ${paperEngineActive ? 'running' : 'stopped'})`
    );

    return dualModeData;
  }

  /**
   * Update Cortex cache with fresh data
   */
  private async updateCortex(userId: string, mode: 'live' | 'paper', freshData: any) {
    console.log(`[${this.MODULE_NAME}] 💾 Updating Cortex cache for user ${userId} (${mode})`);

    // Recompute analytics with fresh data
    const strategySnapshot = await strategyAnalytics.computeStrategyAnalytics(userId, mode);
    const portfolioSnapshot = await portfolioAggregator.aggregatePortfolio(
      userId,
      mode,
      strategySnapshot.strategies
    );

    // Cache in Cortex with 15-minute TTL
    const ttl = 900; // 15 minutes
    const cacheKey = `analytics_${mode}_${userId}`;
    
    cortexCore.set(cacheKey, {
      strategy_analytics: strategySnapshot,
      portfolio_summary: portfolioSnapshot,
      computed_at: new Date().toISOString(),
      user_id: userId,
      mode,
      refreshed_by: 'ContextRefreshCoordinator'
    }, ttl);

    console.log(`[${this.MODULE_NAME}] ✅ Cortex cache updated (key: ${cacheKey}, TTL: ${ttl}s)`);
  }

  /**
   * Update Walter's semantic memory with refreshed context (Phase 8.5 Addendum H + J)
   * Phase 8.5 Addendum J: Only creates memory if context has changed (prevents duplicate entries)
   */
  private async updateWalterMemory(userId: string, mode: 'live' | 'paper', freshData: any) {
    console.log(`[${this.MODULE_NAME}] 🧠 Checking Walter memory for user ${userId} (${mode})`);

    const memoryContent = `Context refreshed: Portfolio balance $${freshData.portfolioBalance}, ${freshData.activeStrategiesCount} strategies active (${freshData.activeStrategies.join(', ')}), engine ${freshData.engineActive ? 'running' : 'stopped'}, mode: ${mode}`;

    // Phase 8.5 Addendum J: Check if context has changed
    const userKey = `${userId}:${mode}`;
    const lastContext = this.lastContextByUser.get(userKey);
    
    if (lastContext === memoryContent) {
      console.log(`[${this.MODULE_NAME}] ⏭️  Context unchanged, skipping duplicate memory entry`);
      return;
    }

    // Context has changed, create memory and update tracking
    await createMemory(
      userId,
      'observation',
      memoryContent,
      2, // Importance: medium (routine context update)
      {
        source: 'ContextRefreshCoordinator',
        portfolioBalance: freshData.portfolioBalance,
        activeStrategiesCount: freshData.activeStrategiesCount,
        engineActive: freshData.engineActive,
        mode
      }
    );

    this.lastContextByUser.set(userKey, memoryContent);
    console.log(`[${this.MODULE_NAME}] ✅ Walter memory updated (context changed)`);
  }

  /**
   * Update refresh metrics
   */
  private updateMetrics(latencyMs: number, success: boolean) {
    this.metrics.lastRefreshISO = new Date().toISOString();
    this.metrics.totalRefreshes++;
    
    if (!success) {
      this.metrics.failedRefreshes++;
    }

    // Track latency history (rolling average)
    this.latencyHistory.push(latencyMs);
    if (this.latencyHistory.length > this.MAX_LATENCY_SAMPLES) {
      this.latencyHistory.shift();
    }

    // Calculate average latency
    const sum = this.latencyHistory.reduce((acc, val) => acc + val, 0);
    this.metrics.avgLatencyMs = Math.round(sum / this.latencyHistory.length);
  }

  /**
   * Get current refresh metrics
   */
  getMetrics(): RefreshMetrics {
    return { ...this.metrics };
  }

  /**
   * Get context age in seconds for a user
   */
  getContextAge(userId: string, mode: 'live' | 'paper'): number | null {
    const cacheKey = `analytics_${mode}_${userId}`;
    const analytics = cortexCore.get(cacheKey);

    if (!analytics || !analytics.computed_at) {
      return null;
    }

    const computedAt = new Date(analytics.computed_at).getTime();
    const now = Date.now();
    const ageMs = now - computedAt;
    
    return Math.floor(ageMs / 1000); // Return age in seconds
  }

  /**
   * Check if context needs refresh (age > threshold)
   */
  needsRefresh(userId: string, mode: 'live' | 'paper', thresholdSeconds: number = 30): boolean {
    const age = this.getContextAge(userId, mode);
    
    if (age === null) {
      // No context exists - needs refresh
      return true;
    }

    return age > thresholdSeconds;
  }

  /**
   * Reset metrics (for testing)
   */
  resetMetrics() {
    this.metrics = {
      lastRefreshISO: null,
      avgLatencyMs: 0,
      totalRefreshes: 0,
      failedRefreshes: 0,
      lastError: null,
      lastLivePortfolio: null,
      lastLiveSyncAt: null,
      lastPaperSyncAt: null
    };
    this.latencyHistory = [];
  }

  /**
   * Phase 8.5 Addendum J: Force live context refresh (always refreshes, no staleness check)
   * Returns both refresh result and fresh data payload to avoid redundant fetches
   * 
   * @deprecated Use ensureFreshDualContext() for full live+paper visibility (Addendum K.4)
   */
  async ensureFreshContext(userId: string, mode: 'live' | 'paper' = 'paper'): Promise<{ refreshResult: RefreshResult; freshData: any }> {
    console.log(`[${this.MODULE_NAME}] [Addendum-J] Forcing live context refresh for user ${userId}`);
    
    // Fetch fresh data once
    const freshData = await this.fetchFreshData(userId, mode);
    
    // Perform full refresh using that data
    const refreshResult = await this.performRefreshWithData(userId, mode, freshData, 'direct');
    
    return { refreshResult, freshData };
  }

  /**
   * Phase 8.5 Addendum K.4: Ensure fresh dual-mode context (BOTH live and paper)
   * This guarantees Walter and UI always see complete system state regardless of engine status
   */
  async ensureFreshDualContext(userId: string): Promise<{ dualModeData: DualModeData; latencyMs: number }> {
    console.log(`[${this.MODULE_NAME}] [Addendum-K.4] Forcing dual-mode context refresh for user ${userId}`);
    
    const start = Date.now();
    
    try {
      // Fetch both live and paper data simultaneously
      const dualModeData = await this.fetchDualModeData(userId);
      
      // Update Cortex cache for both modes in parallel
      await Promise.all([
        this.updateCortex(userId, 'live', {
          portfolioBalance: dualModeData.live.portfolioBalance,
          activeStrategies: dualModeData.live.activeStrategies,
          activeStrategiesCount: dualModeData.live.activeStrategiesCount,
          engineActive: dualModeData.live.engineActive,
          mode: 'live' as const,
          ...dualModeData.settings,
          timestamp: dualModeData.timestamp,
          source: 'live-api' as const
        }),
        this.updateCortex(userId, 'paper', {
          portfolioBalance: dualModeData.paper.portfolioBalance,
          activeStrategies: dualModeData.paper.activeStrategies,
          activeStrategiesCount: dualModeData.paper.activeStrategiesCount,
          engineActive: dualModeData.paper.engineActive,
          mode: 'paper' as const,
          ...dualModeData.settings,
          timestamp: dualModeData.timestamp,
          source: 'live-api' as const
        })
      ]);
      
      // Update Walter's memory for both modes
      await Promise.all([
        this.updateWalterMemory(userId, 'live', {
          portfolioBalance: dualModeData.live.portfolioBalance,
          activeStrategies: dualModeData.live.activeStrategies,
          activeStrategiesCount: dualModeData.live.activeStrategiesCount,
          engineActive: dualModeData.live.engineActive,
          mode: 'live'
        }),
        this.updateWalterMemory(userId, 'paper', {
          portfolioBalance: dualModeData.paper.portfolioBalance,
          activeStrategies: dualModeData.paper.activeStrategies,
          activeStrategiesCount: dualModeData.paper.activeStrategiesCount,
          engineActive: dualModeData.paper.engineActive,
          mode: 'paper'
        })
      ]);
      
      const latencyMs = Date.now() - start;
      this.updateMetrics(latencyMs, true);
      
      // Emit contextUpdated event for Walter rehydration
      this.emit('contextUpdated', userId);
      
      console.log(`[${this.MODULE_NAME}] ✅ Dual-mode context refreshed in ${latencyMs}ms`);
      
      return { dualModeData, latencyMs };
    } catch (error) {
      const latencyMs = Date.now() - start;
      this.updateMetrics(latencyMs, false);
      console.error(`[${this.MODULE_NAME}] ❌ Dual-mode context refresh failed:`, error);
      throw error;
    }
  }

  /**
   * Internal method: Perform refresh using already-fetched data (avoids redundant fetch)
   */
  private async performRefreshWithData(userId: string, mode: 'live' | 'paper', freshData: any, source: 'api' | 'direct' | 'resync'): Promise<RefreshResult> {
    const start = Date.now();

    try {
      // Update Cortex cache with fresh data
      await this.updateCortex(userId, mode, freshData);

      // Update Walter's semantic memory with refreshed context (Phase 8.5 Addendum H)
      await this.updateWalterMemory(userId, mode, freshData);

      // Run truth check to detect any remaining discrepancies
      const truthCheck = await systemTruthDiagnostic.runTruthCheck(userId, mode);
      const discrepanciesFound = truthCheck.discrepancies.length;

      // Phase 8.5 Addendum I: Auto-resync if discrepancies detected
      if (discrepanciesFound > 0 && source !== 'resync') {
        console.log(`[${this.MODULE_NAME}] [TruthSync] mismatch detected (${discrepanciesFound} discrepancies) → forced resync`);
        // Trigger secondary refresh to resolve misalignments
        return await this.refresh(userId, mode, 'resync');
      }

      // Calculate latency and update metrics (Phase 8.5 Addendum I: track lastLivePortfolio)
      const latencyMs = Date.now() - start;
      this.updateMetrics(latencyMs, true);
      this.metrics.lastLivePortfolio = freshData.portfolioBalance;

      // Record in SystemHealthMonitor with actual discrepancy count (Phase 8.5 Addendum H)
      systemHealthMonitor.recordContextRefresh(latencyMs, true, discrepanciesFound);

      // Emit WebSocket event for real-time UI updates
      this.emit('contextRefreshed', {
        userId,
        mode,
        source,
        timestamp: new Date().toISOString(),
        portfolioBalance: freshData.portfolioBalance,
        activeStrategiesCount: freshData.activeStrategies.length,
        discrepanciesFound
      });

      // Phase 8.5 Addendum J: Emit contextUpdated event for Walter rehydration
      this.emit('contextUpdated', userId);

      console.log(`[${this.MODULE_NAME}] ✅ Context refreshed in ${latencyMs}ms (${discrepanciesFound} discrepancies detected)`);

      const result: RefreshResult = {
        success: true,
        latencyMs,
        source,
        timestamp: new Date().toISOString(),
        userId,
        mode,
        discrepanciesFound
      };

      return result;
    } catch (error) {
      const latencyMs = Date.now() - start;
      this.updateMetrics(latencyMs, false);
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Record failure in SystemHealthMonitor (Phase 8.5 Addendum H)
      systemHealthMonitor.recordContextRefresh(latencyMs, false, 0);
      
      console.error(`[${this.MODULE_NAME}] ❌ Context refresh failed:`, error);

      return {
        success: false,
        latencyMs,
        source,
        timestamp: new Date().toISOString(),
        userId,
        mode,
        discrepanciesFound: 0,
        error: errorMessage
      };
    }
  }
}

// Singleton instance
export const contextRefreshCoordinator = new ContextRefreshCoordinator();
