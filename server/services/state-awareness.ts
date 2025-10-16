import { db } from '../db';
import { portfolioState, strategySettings, guardrails, screenerFilters, userGoalsLive, userGoalsPaper } from '@shared/schema';
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

class StateAwarenessService {
  private cache: StateSnapshot | null = null;
  private cacheTimestamp: number = 0;
  private readonly CACHE_TTL_MS = 5000; // 5 seconds as per spec
  private readonly SERVICE_NAME = 'StateAwareness';

  /**
   * Get the current system state snapshot
   * Uses 5-second cache to balance performance and freshness
   */
  async getStateSnapshot(userId: string, options: { bypassCache?: boolean; includeProvenance?: boolean } = {}): Promise<StateSnapshot | StateSnapshotDebug> {
    const now = Date.now();
    const cacheAge = now - this.cacheTimestamp;

    // Return cached data if still valid and not bypassing cache
    if (!options.bypassCache && this.cache && cacheAge < this.CACHE_TTL_MS) {
      console.log(`[${this.SERVICE_NAME}] ✅ CACHE_HIT: State snapshot (age: ${cacheAge}ms, TTL: ${this.CACHE_TTL_MS}ms)`);
      return this.cache;
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

      // Update cache
      this.cache = snapshot;
      this.cacheTimestamp = now;

      const duration = Date.now() - startTime;
      console.log(`[${this.SERVICE_NAME}] ✅ State snapshot generated in ${duration}ms [trace: ${traceId.substring(0, 12)}...]`);

      // Log provenance
      const dataHash = this.generateDataHash(snapshot);
      await this.logProvenance(traceId, snapshot, dataHash, userId);

      // Return with provenance if requested (for debug endpoint)
      if (options.includeProvenance) {
        return {
          ...snapshot,
          provenance: {
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
          },
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
   */
  private async getGoalsCount(userId: string, mode: 'live' | 'paper', traceId: string): Promise<number> {
    const goals = mode === 'live'
      ? await db.query.userGoalsLive.findMany({
          where: eq(userGoalsLive.userId, userId),
        })
      : await db.query.userGoalsPaper.findMany({
          where: eq(userGoalsPaper.userId, userId),
        });

    return goals.length;
  }

  /**
   * Get guardrails settings for a specific mode
   */
  private async getGuardrails(userId: string, mode: 'live' | 'paper', traceId: string): Promise<any> {
    const result = await db.query.guardrails.findFirst({
      where: and(
        eq(guardrails.userId, userId),
        eq(guardrails.mode, mode)
      ),
    });

    return result ? {
      maxDailyLoss: result.maxDailyLoss ? parseFloat(result.maxDailyLoss) : null,
      maxPositionSize: result.maxPositionSize ? parseFloat(result.maxPositionSize) : null,
      maxConcurrentTrades: result.maxConcurrentTrades,
      minWinRate: result.minWinRate ? parseFloat(result.minWinRate) : null,
      stopLossPercent: result.stopLossPercent ? parseFloat(result.stopLossPercent) : null,
    } : null;
  }

  /**
   * Get screener filters for a specific mode
   */
  private async getScreeners(userId: string, mode: 'live' | 'paper', traceId: string): Promise<any> {
    const result = await db.query.screenerFilters.findFirst({
      where: and(
        eq(screenerFilters.userId, userId),
        eq(screenerFilters.mode, mode)
      ),
    });

    return result ? {
      minVolume24h: result.minVolume24h ? parseFloat(result.minVolume24h) : null,
      minPriceChange: result.minPriceChange ? parseFloat(result.minPriceChange) : null,
      maxPriceChange: result.maxPriceChange ? parseFloat(result.maxPriceChange) : null,
      minLiquidity: result.minLiquidity ? parseFloat(result.minLiquidity) : null,
      excludedPairs: result.excludedPairs || [],
    } : null;
  }

  /**
   * Get trading engine status
   * Note: This is a placeholder - actual implementation would query the trading engine
   */
  private async getTradingStatus(userId: string, traceId: string): Promise<{ paper: 'active' | 'stopped' | 'unknown'; live: 'active' | 'stopped' | 'unknown' }> {
    // TODO: Integrate with actual trading engine status when available
    // For now, return 'stopped' as default
    return {
      paper: 'stopped',
      live: 'stopped',
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
   */
  invalidateCache(): void {
    console.log(`[${this.SERVICE_NAME}] 🗑️ Cache invalidated`);
    this.cache = null;
    this.cacheTimestamp = 0;
  }
}

export const stateAwarenessService = new StateAwarenessService();
