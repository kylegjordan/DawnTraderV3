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
// Directive 12.2.3: walter-memory import removed (file deleted in Batch 6)
import { systemTruthDiagnostic } from './system-truth-diagnostic';
import { provenanceLogger } from './provenance-logger'; // Phase 8.6.3: Provenance tracking

const MODULE_NAME = 'ContextRefresh';

// Phase 3: Canonical user ID for single-tenant setup
const CANONICAL_USER_ID = 'kylegjordan';

export interface RefreshResult {
  success: boolean;
  latencyMs: number;
  source: 'api' | 'direct' | 'resync';
  timestamp: string;
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
  // Phase 3: Refactored to mode-based tracking (single-tenant)
  private lastContextByMode: Map<'live' | 'paper', string> = new Map();

  /**
   * Refresh live context - fetch from backend, update Cortex, emit events
   * Phase 3: Removed userId parameter (single-tenant architecture)
   */
  async refresh(mode: 'live' | 'paper', source: 'api' | 'direct' | 'resync' = 'direct'): Promise<RefreshResult> {
    console.log(`[${this.MODULE_NAME}] 🔄 Refreshing context (${mode}, source=${source})`);
    const start = Date.now();

    // Phase 8.6.3: Generate trace ID for provenance tracking
    const traceId = provenanceLogger.generateTraceId();

    try {
      // Fetch fresh data from backend
      const freshData = await this.fetchFreshData(mode, traceId);

      // Update Cortex cache with fresh data
      await this.updateCortex(mode, freshData, traceId);

      // Update Walter's semantic memory with refreshed context (Phase 8.5 Addendum H)
      await this.updateWalterMemory(mode, freshData, traceId);

      // Run truth check to detect any remaining discrepancies
      // [8.8.3-H11] Fixed: Pre-H9 signature uses mode-only (single-tenant architecture)
      const truthCheck = await systemTruthDiagnostic.runTruthCheck(mode);
      const discrepanciesFound = truthCheck.discrepancies.length;

      // Phase 8.5 Addendum I: Auto-resync if discrepancies detected
      if (discrepanciesFound > 0 && source !== 'resync') {
        console.log(`[${this.MODULE_NAME}] [TruthSync] mismatch detected (${discrepanciesFound} discrepancies) → forced resync`);
        // Trigger secondary refresh to resolve misalignments
        return await this.refresh(mode, 'resync');
      }

      // Calculate latency and update metrics (Phase 8.5 Addendum I: track lastLivePortfolio)
      const latencyMs = Date.now() - start;
      this.updateMetrics(latencyMs, true);
      this.metrics.lastLivePortfolio = freshData.portfolioBalance;

      // Record in SystemHealthMonitor with actual discrepancy count (Phase 8.5 Addendum H)
      systemHealthMonitor.recordContextRefresh(latencyMs, true, discrepanciesFound);

      // Emit WebSocket event for real-time UI updates
      this.emit('contextRefreshed', {
        mode,
        source,
        timestamp: new Date().toISOString(),
        portfolioBalance: freshData.portfolioBalance,
        activeStrategiesCount: freshData.activeStrategies.length,
        discrepanciesFound
      });

      // Phase 8.5 Addendum J: Emit contextUpdated event for Walter rehydration
      this.emit('contextUpdated', mode);

      console.log(`[${this.MODULE_NAME}] ✅ Context refreshed in ${latencyMs}ms (${discrepanciesFound} discrepancies detected)`);

      const result: RefreshResult = {
        success: true,
        latencyMs,
        source,
        timestamp: new Date().toISOString(),
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
        mode,
        discrepanciesFound: 0,
        error: errorMessage
      };
    }
  }

  /**
   * Fetch fresh data from backend (portfolio, strategies, settings)
   * Phase 8.5 Addendum K.3: Uses global context for shared data
   * Phase 8.6.3: Added traceId for provenance tracking
   * Phase 3: Removed userId parameter (single-tenant architecture)
   */
  private async fetchFreshData(mode: 'live' | 'paper', traceId?: string) {
    const fetchStartTime = Date.now(); // Phase 8.6.3: Track execution time for BoB trace
    console.log(`[${this.MODULE_NAME}] [ContextSource] live-api ✓ (global context)${traceId ? ` [trace: ${traceId.substring(0, 12)}...]` : ''}`);
    
    const globalContextId = 'default';
    
    // Phase 3: Use canonical user ID for single-tenant setup
    const userId = CANONICAL_USER_ID;
    
    // Fetch in parallel - using global context for shared data
    const [portfolioState, strategies, user] = await Promise.all([
      storage.getPortfolioState({ globalContextId, mode }),
      storage.listStrategySettings({ globalContextId, mode }),
      storage.getUser(userId)
    ]);

    // Get engine status based on mode (Phase 8.5 Addendum K.4: Accurate engine status)
    let engineActive = false;
    if (mode === 'paper') {
      // Paper mode: check global session
      const globalSession = (global as any).getGlobalSession?.();
      engineActive = !!(globalSession && globalSession.isRunning);
    } else {
      // Live mode: check tradingEngines map
      const tradingEngines = (global as any).tradingEngines as Map<string, any> | undefined;
      const liveEngine = tradingEngines?.get(userId);
      engineActive = !!(liveEngine && liveEngine.isEngineRunning?.());
    }

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
      mode,
      // Phase 3: Default risk settings (no trading_settings table)
      riskPerTrade: 0,
      dailyLossKillSwitch: 7.0,
      maxExposurePercent: 100,
      timestamp: new Date().toISOString(),
      source: 'live-api' as const
    };

    // Phase 8.6.3: Log provenance - Backend → Cortex data flow
    if (traceId) {
      // Log lineage (data flow between services)
      await provenanceLogger.logLineage({
        traceId,
        originatingService: 'bob', // Data originates from database via BoB layer
        targetService: 'cortex',
        sourceTable: 'portfolio_state',
        mode,
        globalContextId,
        operation: 'read',
        data: freshData,
        metadata: { 
          userId,
          tables: ['portfolio_state', 'strategy_settings', 'trading_settings']
        }
      });

      // Log BoB module trace (module-level operation tracking)
      await provenanceLogger.logBobTrace({
        traceId,
        bobModule: 'ContextRefreshCoordinator',
        operation: 'fetchFreshData',
        sourceTable: 'portfolio_state',
        mode,
        globalContextId,
        cacheHit: false,
        executionTimeMs: Date.now() - fetchStartTime,
        rowCount: activeStrategies.length + 1, // portfolio + strategies
        metadata: {
          userId,
          portfolioBalance,
          activeStrategiesCount: activeStrategies.length
        }
      });
    }

    console.log(`[${this.MODULE_NAME}] source=live-api (global) portfolio=${portfolioBalance} strategies=${activeStrategies.length}`);
    
    return freshData;
  }

  /**
   * Phase 8.5 Addendum K.4: Fetch BOTH live and paper mode data simultaneously
   * This ensures Walter and dashboard always have complete visibility regardless of engine status
   * Phase 8.6.3: Added traceId for provenance tracking
   * Phase 3: Removed userId parameter (single-tenant architecture)
   */
  private async fetchDualModeData(traceId?: string): Promise<DualModeData> {
    const fetchStartTime = Date.now(); // Phase 8.6.3: Track execution time for BoB trace
    console.log(`[${this.MODULE_NAME}] [Addendum-K.4] Fetching dual-mode data (live + paper)${traceId ? ` [trace: ${traceId.substring(0, 12)}...]` : ''}`);
    
    const globalContextId = 'default';
    const now = new Date().toISOString();
    
    // Phase 3: Use canonical user ID for single-tenant setup
    const userId = CANONICAL_USER_ID;
    
    // Fetch all data in parallel for both modes
    const [
      livePortfolioState,
      paperPortfolioState,
      liveStrategies,
      paperStrategies,
      user
    ] = await Promise.all([
      storage.getPortfolioState({ globalContextId, mode: 'live' }),
      storage.getPortfolioState({ globalContextId, mode: 'paper' }),
      storage.listStrategySettings({ globalContextId, mode: 'live' }),
      storage.listStrategySettings({ globalContextId, mode: 'paper' }),
      storage.getUser(userId)
    ]);

    // Get engine status for both modes
    // Paper engine: uses global session
    const globalSession = (global as any).getGlobalSession?.();
    const paperEngineActive = !!(globalSession && globalSession.isRunning);
    
    // Live engine: check tradingEngines map (exposed globally from routes.ts)
    const tradingEngines = (global as any).tradingEngines as Map<string, any> | undefined;
    const liveEngine = tradingEngines?.get(userId);
    const liveEngineActive = !!(liveEngine && liveEngine.isEngineRunning?.());

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
        // Phase 3: Default risk settings (no trading_settings table)
        riskPerTrade: 0,
        dailyLossKillSwitch: 7.0,
        maxExposurePercent: 100
      },
      timestamp: now,
      source: 'live-api'
    };

    console.log(
      `[${this.MODULE_NAME}] ✅ Dual-mode data fetched: ` +
      `live=$${liveBalance} (${liveActiveStrategies.length} strategies, ${liveEngineActive ? 'running' : 'stopped'}), ` +
      `paper=$${paperBalance} (${paperActiveStrategies.length} strategies, ${paperEngineActive ? 'running' : 'stopped'})`
    );

    // Phase 8.6.3: Log provenance - Database → BoB for both modes
    if (traceId) {
      const executionTimeMs = Date.now() - fetchStartTime;
      
      // Log live mode data flow
      await provenanceLogger.logLineage({
        traceId,
        originatingService: 'bob',
        targetService: 'cortex',
        sourceTable: 'portfolio_state',
        mode: 'live',
        globalContextId,
        operation: 'read',
        data: dualModeData.live,
        metadata: { 
          userId,
          tables: ['portfolio_state', 'strategy_settings', 'trading_settings'],
          modeType: 'live'
        }
      });

      // Log paper mode data flow
      await provenanceLogger.logLineage({
        traceId,
        originatingService: 'bob',
        targetService: 'cortex',
        sourceTable: 'portfolio_state',
        mode: 'paper',
        globalContextId,
        operation: 'read',
        data: dualModeData.paper,
        metadata: { 
          userId,
          tables: ['portfolio_state', 'strategy_settings', 'trading_settings'],
          modeType: 'paper'
        }
      });

      // Log BoB module traces for both modes
      await provenanceLogger.logBobTrace({
        traceId,
        bobModule: 'ContextRefreshCoordinator',
        operation: 'fetchDualModeData_live',
        sourceTable: 'portfolio_state',
        mode: 'live',
        globalContextId,
        cacheHit: false,
        executionTimeMs,
        rowCount: liveActiveStrategies.length + 1,
        metadata: {
          userId,
          portfolioBalance: liveBalance,
          activeStrategiesCount: liveActiveStrategies.length
        }
      });

      await provenanceLogger.logBobTrace({
        traceId,
        bobModule: 'ContextRefreshCoordinator',
        operation: 'fetchDualModeData_paper',
        sourceTable: 'portfolio_state',
        mode: 'paper',
        globalContextId,
        cacheHit: false,
        executionTimeMs,
        rowCount: paperActiveStrategies.length + 1,
        metadata: {
          userId,
          portfolioBalance: paperBalance,
          activeStrategiesCount: paperActiveStrategies.length
        }
      });
    }

    return dualModeData;
  }

  /**
   * Update Cortex cache with fresh data
   * Phase 8.6.3: Added traceId for provenance tracking
   * Phase 3: Removed userId parameter (single-tenant architecture)
   */
  private async updateCortex(mode: 'live' | 'paper', freshData: any, traceId?: string) {
    console.log(`[${this.MODULE_NAME}] 💾 Updating Cortex cache (${mode})`);

    // Phase 3: Use canonical user ID for analytics computation
    const userId = CANONICAL_USER_ID;

    // Recompute analytics with fresh data
    const strategySnapshot = await strategyAnalytics.computeStrategyAnalytics(userId, mode);
    const portfolioSnapshot = await portfolioAggregator.aggregatePortfolio(
      userId,
      mode,
      strategySnapshot.strategies
    );

    // Cache in Cortex with 15-minute TTL
    const ttl = 900; // 15 minutes
    // Phase 3: Mode-based cache key only (single-tenant)
    const cacheKey = `analytics_${mode}`;
    
    const cortexData = {
      strategy_analytics: strategySnapshot,
      portfolio_summary: portfolioSnapshot,
      computed_at: new Date().toISOString(),
      mode,
      refreshed_by: 'ContextRefreshCoordinator'
    };
    
    // Phase 8.6.4: Pass provenance metadata to Cortex
    cortexCore.set(cacheKey, cortexData, ttl, { 
      traceId,
      mode,
      sourceTable: 'portfolio_state' 
    });

    // Phase 8.6.3: Log provenance - Cortex → Walter data flow
    if (traceId) {
      await provenanceLogger.logCortexToWalter({
        traceId,
        sourceTable: 'cortex_cache',
        mode,
        globalContextId: 'default',
        data: cortexData,
        contextType: 'analytics_snapshot',
      });
    }

    console.log(`[${this.MODULE_NAME}] ✅ Cortex cache updated (key: ${cacheKey}, TTL: ${ttl}s)`);
  }

  /**
   * Update Walter's semantic memory with refreshed context (Phase 8.5 Addendum H + J)
   * Phase 8.5 Addendum J: Only creates memory if context has changed (prevents duplicate entries)
   * Phase 3: Removed userId parameter, mode-based tracking (single-tenant)
   */
  private async updateWalterMemory(mode: 'live' | 'paper', freshData: any, traceId?: string) {
    console.log(`[${this.MODULE_NAME}] 🧠 Checking Walter memory (${mode})${traceId ? ` [trace: ${traceId.substring(0, 12)}...]` : ''}`);

    // Phase 3: Use canonical user ID for memory creation
    const userId = CANONICAL_USER_ID;

    const memoryContent = `Context refreshed: Portfolio balance $${freshData.portfolioBalance}, ${freshData.activeStrategiesCount} strategies active (${freshData.activeStrategies.join(', ')}), engine ${freshData.engineActive ? 'running' : 'stopped'}, mode: ${mode}`;

    // Phase 8.5 Addendum J: Check if context has changed
    // Phase 3: Mode-based tracking instead of user+mode
    const lastContext = this.lastContextByMode.get(mode);
    
    if (lastContext === memoryContent) {
      console.log(`[${this.MODULE_NAME}] ⏭️  Context unchanged, skipping duplicate memory entry`);
      return;
    }

    // Directive 12.2.3: Walter memory creation removed (Batch 6)
    // Context change still tracked for deduplication
    this.lastContextByMode.set(mode, memoryContent);

    // Phase 8.6.3: Log provenance data flow
    if (traceId) {
      await provenanceLogger.logWalterToUI({
        traceId,
        endpoint: '/api/context-refresh',
        mode,
        globalContextId: 'default',
        data: { memoryContent, ...freshData },
        userId,
      });
    }

    console.log(`[${this.MODULE_NAME}] ✅ Context refresh completed (context changed)`);
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
   * Get context age in seconds
   * Phase 3: Removed userId parameter (single-tenant, mode-based cache keys)
   */
  getContextAge(mode: 'live' | 'paper'): number | null {
    const cacheKey = `analytics_${mode}`;
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
   * Phase 3: Removed userId parameter (single-tenant)
   */
  needsRefresh(mode: 'live' | 'paper', thresholdSeconds: number = 30): boolean {
    const age = this.getContextAge(mode);
    
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
   * Phase 3: Removed userId parameter (single-tenant)
   * 
   * @deprecated Use ensureFreshDualContext() for full live+paper visibility (Addendum K.4)
   */
  async ensureFreshContext(mode: 'live' | 'paper' = 'paper'): Promise<{ refreshResult: RefreshResult; freshData: any }> {
    console.log(`[${this.MODULE_NAME}] [Addendum-J] Forcing live context refresh`);
    
    // Phase 8.6.3: Generate trace ID for provenance tracking
    const traceId = provenanceLogger.generateTraceId();
    
    // Fetch fresh data once
    const freshData = await this.fetchFreshData(mode, traceId);
    
    // Perform full refresh using that data (Phase 8.6.3: pass traceId for correlation)
    const refreshResult = await this.performRefreshWithData(mode, freshData, 'direct', traceId);
    
    return { refreshResult, freshData };
  }

  /**
   * Phase 8.5 Addendum K.4: Ensure fresh dual-mode context (BOTH live and paper)
   * This guarantees Walter and UI always see complete system state regardless of engine status
   * Phase 3: Removed userId parameter (single-tenant)
   */
  async ensureFreshDualContext(): Promise<{ dualModeData: DualModeData; latencyMs: number }> {
    console.log(`[${this.MODULE_NAME}] [Addendum-K.4] Forcing dual-mode context refresh`);
    
    const start = Date.now();
    // Phase 8.6.3: Generate trace ID for provenance tracking
    const traceId = provenanceLogger.generateTraceId();
    
    try {
      // Fetch both live and paper data simultaneously (Phase 8.6.3: with traceId)
      const dualModeData = await this.fetchDualModeData(traceId);
      
      // Update Cortex cache for both modes in parallel (Phase 8.6.3: with traceId)
      await Promise.all([
        this.updateCortex('live', {
          portfolioBalance: dualModeData.live.portfolioBalance,
          activeStrategies: dualModeData.live.activeStrategies,
          activeStrategiesCount: dualModeData.live.activeStrategiesCount,
          engineActive: dualModeData.live.engineActive,
          mode: 'live' as const,
          ...dualModeData.settings,
          timestamp: dualModeData.timestamp,
          source: 'live-api' as const
        }, traceId),
        this.updateCortex('paper', {
          portfolioBalance: dualModeData.paper.portfolioBalance,
          activeStrategies: dualModeData.paper.activeStrategies,
          activeStrategiesCount: dualModeData.paper.activeStrategiesCount,
          engineActive: dualModeData.paper.engineActive,
          mode: 'paper' as const,
          ...dualModeData.settings,
          timestamp: dualModeData.timestamp,
          source: 'live-api' as const
        }, traceId)
      ]);
      
      // Update Walter's memory for both modes (Phase 8.6.3: with traceId)
      await Promise.all([
        this.updateWalterMemory('live', {
          portfolioBalance: dualModeData.live.portfolioBalance,
          activeStrategies: dualModeData.live.activeStrategies,
          activeStrategiesCount: dualModeData.live.activeStrategiesCount,
          engineActive: dualModeData.live.engineActive,
          mode: 'live'
        }, traceId),
        this.updateWalterMemory('paper', {
          portfolioBalance: dualModeData.paper.portfolioBalance,
          activeStrategies: dualModeData.paper.activeStrategies,
          activeStrategiesCount: dualModeData.paper.activeStrategiesCount,
          engineActive: dualModeData.paper.engineActive,
          mode: 'paper'
        }, traceId)
      ]);
      
      const latencyMs = Date.now() - start;
      this.updateMetrics(latencyMs, true);
      
      // Emit contextUpdated event for Walter rehydration
      this.emit('contextUpdated', 'dual');
      
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
   * Phase 8.6.3: Accepts optional traceId from caller to maintain provenance chain
   * Phase 3: Removed userId parameter (single-tenant)
   */
  private async performRefreshWithData(mode: 'live' | 'paper', freshData: any, source: 'api' | 'direct' | 'resync', traceId?: string): Promise<RefreshResult> {
    const start = Date.now();
    // Phase 8.6.3: Use provided traceId or generate new one
    const finalTraceId = traceId || provenanceLogger.generateTraceId();

    try {
      // Update Cortex cache with fresh data
      await this.updateCortex(mode, freshData, finalTraceId);

      // Update Walter's semantic memory with refreshed context (Phase 8.5 Addendum H)
      await this.updateWalterMemory(mode, freshData, finalTraceId);

      // Run truth check to detect any remaining discrepancies
      // [8.8.3-H11] Fixed: Pre-H9 signature uses mode-only (single-tenant architecture)
      const truthCheck = await systemTruthDiagnostic.runTruthCheck(mode);
      const discrepanciesFound = truthCheck.discrepancies.length;

      // Phase 8.5 Addendum I: Auto-resync if discrepancies detected
      if (discrepanciesFound > 0 && source !== 'resync') {
        console.log(`[${this.MODULE_NAME}] [TruthSync] mismatch detected (${discrepanciesFound} discrepancies) → forced resync`);
        // Trigger secondary refresh to resolve misalignments
        return await this.refresh(mode, 'resync');
      }

      // Calculate latency and update metrics (Phase 8.5 Addendum I: track lastLivePortfolio)
      const latencyMs = Date.now() - start;
      this.updateMetrics(latencyMs, true);
      this.metrics.lastLivePortfolio = freshData.portfolioBalance;

      // Record in SystemHealthMonitor with actual discrepancy count (Phase 8.5 Addendum H)
      systemHealthMonitor.recordContextRefresh(latencyMs, true, discrepanciesFound);

      // Emit WebSocket event for real-time UI updates
      this.emit('contextRefreshed', {
        mode,
        source,
        timestamp: new Date().toISOString(),
        portfolioBalance: freshData.portfolioBalance,
        activeStrategiesCount: freshData.activeStrategies.length,
        discrepanciesFound
      });

      // Phase 8.5 Addendum J: Emit contextUpdated event for Walter rehydration
      this.emit('contextUpdated', mode);

      console.log(`[${this.MODULE_NAME}] ✅ Context refreshed in ${latencyMs}ms (${discrepanciesFound} discrepancies detected)`);

      const result: RefreshResult = {
        success: true,
        latencyMs,
        source,
        timestamp: new Date().toISOString(),
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
        mode,
        discrepanciesFound: 0,
        error: errorMessage
      };
    }
  }
}

// Singleton instance
export const contextRefreshCoordinator = new ContextRefreshCoordinator();
