import { db } from '../db';
import { portfolioState, strategySettings, guardrailsV2, screenerFilters, goalsLive, goalsPaper } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { provenanceLogger } from './provenance-logger.js';
import crypto from 'crypto';

interface StateSnapshot {
  timestamp: string;
  trading: {
    paper: 'active' | 'stopped' | 'unknown';
    live: 'active' | 'stopped' | 'unknown';
  };
  balances: {
    paper: number;
    live: number;
  };
  strategies: {
    paper: number;
    live: number;
  };
  goals: {
    paper: number;
    live: number;
  };
  guardrails: {
    paper: any;
    live: any;
  };
  screeners: {
    paper: any;
    live: any;
  };
}

interface StateSnapshotDebug extends StateSnapshot {
  provenance: {
    traceId: string;
    sources: {
      portfolio: string;
      strategies: string;
      goals: string;
      guardrails: string;
      screeners: string;
      tradingStatus: string;
    };
    dataHash: string;
    generatedAt: string;
  };
}

interface CacheEntry {
  snapshot: StateSnapshot;
  provenance: {
    traceId: string;
    sources: {
      portfolio: string;
      strategies: string;
      goals: string;
      guardrails: string;
      screeners: string;
      tradingStatus: string;
    };
    dataHash: string;
    generatedAt: string;
  };
  timestamp: number;
}

class StateAwarenessService {
  private cache: Map<string, CacheEntry> = new Map();
  private readonly CACHE_TTL_MS = 5000; // 5 seconds as per spec
  private readonly SERVICE_NAME = 'StateAwareness';

  /**
   * Get the current system state snapshot
   * Uses 5-second cache to balance performance and freshness
   * Per-user cache ensures data isolation
   */
  async getStateSnapshot(userId: string, options: { bypassCache?: boolean; includeProvenance?: boolean } = {}): Promise<StateSnapshot | StateSnapshotDebug> {
    const now = Date.now();
    const cacheKey = userId;
    const cached = this.cache.get(cacheKey);
    const cacheAge = cached ? now - cached.timestamp : Infinity;

    // Return cached data if still valid and not bypassing cache
    if (!options.bypassCache && cached && cacheAge < this.CACHE_TTL_MS) {
      console.log(`[${this.SERVICE_NAME}] ✅ CACHE_HIT: State snapshot for user ${userId.substring(0, 8)} (age: ${cacheAge}ms, TTL: ${this.CACHE_TTL_MS}ms)`);
      
      // Include provenance if requested (for debug endpoint)
      if (options.includeProvenance) {
        return {
          ...cached.snapshot,
          provenance: cached.provenance,
        } as StateSnapshotDebug;
      }
      
      return cached.snapshot;
    }

    console.log(`[${this.SERVICE_NAME}] 🔄 Generating fresh state snapshot for user ${userId.substring(0, 8)}...`);
    const startTime = Date.now();
    const traceId = `trace_${nanoid(10)}`;

    try {
      // Fetch all data in parallel for performance
      const [paperBalance, liveBalance, paperStrategies, liveStrategies, paperGoals, liveGoals, paperGuardrails, liveGuardrails, paperScreeners, liveScreeners, tradingStatus] = await Promise.all([
        this.getPortfolioBalance(userId, 'paper', traceId),
        this.getPortfolioBalance(userId, 'live', traceId),
        this.getStrategyCount(userId, 'paper', traceId),
        this.getStrategyCount(userId, 'live', traceId),
        this.getGoalsCount(userId, 'paper', traceId),
        this.getGoalsCount(userId, 'live', traceId),
        this.getGuardrails(userId, 'paper', traceId),
        this.getGuardrails(userId, 'live', traceId),
        this.getScreeners(userId, 'paper', traceId),
        this.getScreeners(userId, 'live', traceId),
        this.getTradingStatus(userId, traceId),
      ]);

      // Build the snapshot
      const snapshot: StateSnapshot = {
        timestamp: new Date().toISOString(),
        trading: {
          paper: tradingStatus.paper,
          live: tradingStatus.live,
        },
        balances: {
          paper: paperBalance,
          live: liveBalance,
        },
        strategies: {
          paper: paperStrategies,
          live: liveStrategies,
        },
        goals: {
          paper: paperGoals,
          live: liveGoals,
        },
        guardrails: {
          paper: paperGuardrails,
          live: liveGuardrails,
        },
        screeners: {
          paper: paperScreeners,
          live: liveScreeners,
        },
      };

      // Log provenance
      const dataHash = this.generateDataHash(snapshot);
      await this.logProvenance(traceId, snapshot, dataHash, userId);

      // Build provenance metadata
      const provenance = {
        traceId,
        sources: {
          portfolio: 'portfolio_state',
          strategies: 'strategy_settings',
          goals: 'user_goals_live/user_goals_paper',
          guardrails: 'guardrails',
          screeners: 'screener_filters',
          tradingStatus: 'trading_engine',
        },
        dataHash,
        generatedAt: snapshot.timestamp,
      };

      // Update per-user cache with snapshot AND provenance
      this.cache.set(cacheKey, {
        snapshot,
        provenance,
        timestamp: now,
      });

      const duration = Date.now() - startTime;
      console.log(`[${this.SERVICE_NAME}] ✅ State snapshot generated in ${duration}ms [trace: ${traceId.substring(0, 12)}...] for user ${userId.substring(0, 8)}`);

      // Phase 8.7.4: Broadcast state update via Context Bridge
      try {
        const { contextBridge } = await import('./context-bridge');
        await contextBridge.broadcast({
          type: 'state_update',
          payload: snapshot,
          userId
        });
      } catch (bridgeError: any) {
        console.error(`[${this.SERVICE_NAME}] Failed to broadcast state update:`, bridgeError.message);
      }

      // Return with provenance if requested (for debug endpoint)
      if (options.includeProvenance) {
        return {
          ...snapshot,
          provenance,
        } as StateSnapshotDebug;
      }

      return snapshot;
    } catch (error: any) {
      console.error(`[${this.SERVICE_NAME}] ❌ Failed to generate state snapshot:`, error.message);
      throw new Error(`State snapshot generation failed: ${error.message}`);
    }
  }

  /**
   * Get portfolio balance for a specific mode
   */
  private async getPortfolioBalance(userId: string, mode: 'live' | 'paper', traceId: string): Promise<number> {
    const globalContextId = 'default';
    
    const result = await db.query.portfolioState.findFirst({
      where: and(
        eq(portfolioState.globalContextId, globalContextId),
        eq(portfolioState.mode, mode)
      ),
    });

    return result ? parseFloat(result.balance) : 0;
  }

  /**
   * Get count of enabled strategies for a specific mode
   */
  private async getStrategyCount(userId: string, mode: 'live' | 'paper', traceId: string): Promise<number> {
    const strategies = await db.query.strategySettings.findMany({
      where: and(
        eq(strategySettings.userId, userId),
        eq(strategySettings.mode, mode),
        eq(strategySettings.enabled, true)
      ),
    });

    return strategies.length;
  }

  /**
   * Get count of goals for a specific mode
   * Phase 27.F.15.A: Goals are now global per mode
   */
  private async getGoalsCount(userId: string, mode: 'live' | 'paper', traceId: string): Promise<number> {
    const goals = mode === 'live'
      ? await db.query.goalsLive.findMany()
      : await db.query.goalsPaper.findMany();

    return goals.length;
  }

  /**
   * Get guardrails settings for a specific mode
   * [9.7] Migrated to guardrails_v2 – legacy dollar fields removed
   */
  private async getGuardrails(userId: string, mode: 'live' | 'paper', traceId: string): Promise<any> {
    // [9.7] Use guardrails_v2 instead of legacy guardrails table
    const result = await db.query.guardrailsV2.findFirst({
      where: eq(guardrailsV2.mode, mode),
    });

    return result ? {
      // [9.7] Return percentage-based fields from guardrails_v2
      portfolioRiskPerTradePct: result.portfolioRiskPerTradePct ? parseFloat(String(result.portfolioRiskPerTradePct)) : null,
      symbolCooldownMinutes: result.symbolCooldownMinutes,
      maxOpenPositions: result.maxOpenPositions,
      dailyLossKillSwitchPct: result.dailyLossKillSwitchPct ? parseFloat(String(result.dailyLossKillSwitchPct)) : null,
      maxPositionPercentPct: result.maxPositionPercentPct ? parseFloat(String(result.maxPositionPercentPct)) : null,
      maxTotalExposurePct: result.maxTotalExposurePct ? parseFloat(String(result.maxTotalExposurePct)) : null,
      killSwitchTripped: result.killSwitchTripped,
    } : null;
  }

  /**
   * Get screener filters for a specific mode
   * Phase 27.F.13.M: userId kept for signature compatibility but settings are global
   */
  private async getScreeners(userId: string, mode: 'live' | 'paper', traceId: string): Promise<any> {
    // Phase 27.F.13.M: Query by mode only (global settings)
    const result = await db.query.screenerFilters.findFirst({
      where: eq(screenerFilters.mode, mode),
    });

    return result ? {
      minVolume: result.minVolume ? parseFloat(result.minVolume) : null,
      minPrice: result.minPrice ? parseFloat(result.minPrice) : null,
      maxPrice: result.maxPrice ? parseFloat(result.maxPrice) : null,
      minMarketCap: result.minMarketCap ? parseFloat(result.minMarketCap) : null,
      maxBidAskSpread: result.maxBidAskSpread ? parseFloat(result.maxBidAskSpread) : null,
      rsiMin: result.rsiMin,
      rsiMax: result.rsiMax,
      volatilityMin: result.volatilityMin ? parseFloat(result.volatilityMin) : null,
      volatilityMax: result.volatilityMax ? parseFloat(result.volatilityMax) : null,
      excludeStablecoins: result.excludeStablecoins,
      minLiquidity: result.minLiquidity ? parseFloat(result.minLiquidity) : null,
      allowRegulatedOnly: result.allowRegulatedOnly,
    } : null;
  }

  /**
   * Get trading engine status
   * Note: This is a placeholder - actual implementation would query the trading engine
   */
  private async getTradingStatus(userId: string, traceId: string): Promise<{ paper: 'active' | 'stopped' | 'unknown'; live: 'active' | 'stopped' | 'unknown' }> {
    // Phase 8.7.2: Get actual trading engine status
    let paperStatus: 'active' | 'stopped' | 'unknown' = 'stopped';
    let liveStatus: 'active' | 'stopped' | 'unknown' = 'stopped';
    
    // Check paper trading engine status.
    // P19-B4b D5: routed through the per-mode accessor (mode='paper'). NOTE (#297): this dormant
    // agent-intent subsystem is paper-only today; when #297 revives its live branch this 'paper'
    // default must be revisited.
    const { getGlobalActiveEngineManager } = await import('./active-engine-service.js');
    const globalActivePortfolioManager = getGlobalActiveEngineManager('paper');
    if (globalActivePortfolioManager) {
      // Check if it's actually running (has monitoring interval)
      const isRunning = globalActivePortfolioManager.isRunning || 
                       (globalActivePortfolioManager.executionEngine && 
                        globalActivePortfolioManager.executionEngine.isRunning);
      paperStatus = isRunning ? 'active' : 'stopped';
    }
    
    // Check live trading engine status
    const tradingEngines = (global as any).tradingEngines as Map<string, any>;
    const liveEngine = tradingEngines?.get(userId);
    if (liveEngine) {
      liveStatus = liveEngine.isRunning ? 'active' : 'stopped';
    }
    
    return {
      paper: paperStatus,
      live: liveStatus,
    };
  }

  /**
   * Generate SHA-256 hash of the snapshot data for provenance
   */
  private generateDataHash(snapshot: StateSnapshot): string {
    const dataString = JSON.stringify(snapshot);
    return crypto.createHash('sha256').update(dataString).digest('hex');
  }

  /**
   * Log provenance for the state snapshot
   */
  private async logProvenance(traceId: string, snapshot: StateSnapshot, dataHash: string, userId: string): Promise<void> {
    try {
      // Count total rows (rough estimate)
      const rowCount = 
        2 + // portfolio balances (paper + live)
        snapshot.strategies.paper + snapshot.strategies.live +
        snapshot.goals.paper + snapshot.goals.live +
        (snapshot.guardrails.paper ? 1 : 0) + (snapshot.guardrails.live ? 1 : 0) +
        (snapshot.screeners.paper ? 1 : 0) + (snapshot.screeners.live ? 1 : 0);

      // Log provenance for both modes since this is a dual-mode snapshot
      await provenanceLogger.logLineage({
        traceId,
        originatingService: 'bob',
        targetService: 'cortex',
        sourceTable: 'multiple_sources',
        mode: 'live',
        globalContextId: 'default',
        operation: 'aggregate',
        data: snapshot,
        metadata: {
          note: 'BoB → StateAwareness: aggregated system state (dual-mode)',
          dataHash,
          rowCount,
          userId,
          includesPaperMode: true,
          sources: ['portfolio_state', 'strategy_settings', 'user_goals_live', 'user_goals_paper', 'guardrails', 'screener_filters'],
        },
      });

      console.log(`[${this.SERVICE_NAME}] 📊 Provenance logged: ${rowCount} rows, hash: ${dataHash.substring(0, 8)}...`);
    } catch (error: any) {
      console.error(`[${this.SERVICE_NAME}] ⚠️ Failed to log provenance:`, error.message);
      // Don't throw - provenance logging failure shouldn't break the snapshot
    }
  }

  /**
   * Invalidate the cache (used when config changes occur)
   * @param userId - Optional user ID to invalidate only that user's cache, or undefined to clear all
   */
  invalidateCache(userId?: string): void {
    if (userId) {
      const deleted = this.cache.delete(userId);
      console.log(`[${this.SERVICE_NAME}] 🗑️ Cache invalidated for user ${userId.substring(0, 8)} (existed: ${deleted})`);
    } else {
      const size = this.cache.size;
      this.cache.clear();
      console.log(`[${this.SERVICE_NAME}] 🗑️ Cache invalidated for all users (cleared ${size} entries)`);
    }
  }
}

export const stateAwarenessService = new StateAwarenessService();
