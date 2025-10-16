/**
 * StrategyBob - Strategy Intelligence Optimization Module (Phase 7.5)
 * 
 * Caches strategy-level trading data including performance metrics,
 * signal history, and strategy summaries for near-instant Walter recall.
 * 
 * Part of Bob Core's Tier 1 optimization expansion.
 */

import { bobCore, FetchContext } from './bob-core';
import { storage } from '../storage';
import { provenanceLogger } from './provenance-logger'; // Phase 8.6.4: BoB deep-trace

class StrategyBobModule {
  private readonly MODULE_NAME = 'StrategyBob';
  private readonly TTL_SECONDS = parseInt(process.env.BOB_STRATEGY_TTL_SECONDS || '30', 10);

  constructor() {
    this.registerWithBobCore();
  }

  /**
   * Register this module's fetch functions with Bob Core
   */
  private registerWithBobCore() {
    const fetchFunctions = new Map<string, (context: FetchContext) => Promise<any>>();

    fetchFunctions.set('performance', this.fetchPerformance.bind(this));
    fetchFunctions.set('signals', this.fetchSignals.bind(this));
    fetchFunctions.set('summary', this.fetchSummary.bind(this));

    bobCore.registerModule(this.MODULE_NAME, fetchFunctions);
  }

  /**
   * Fetch strategy performance metrics (win rate, P/L, R-multiple)
   * Adapts existing /api/metrics/strategies and /api/paper/metrics/strategies
   */
  private async fetchPerformance(context: FetchContext & { days?: number }): Promise<any> {
    const startTime = Date.now();
    const { mode = 'live', userId, days = 7 } = context;
    console.log(`[${this.MODULE_NAME}] 🔍 Fetching performance (mode: ${mode}, days: ${days})${context.traceId ? ` [trace: ${context.traceId.substring(0, 12)}...]` : ''}`);

    try {
      if (!userId) {
        throw new Error('userId is required for performance fetch');
      }

      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - days);

      const allTrades = mode === 'live'
        ? await storage.getTrades(userId, {})
        : await storage.getAllPaperTrades(userId);

      const recentTrades = allTrades.filter(t => 
        t.entryTime && new Date(t.entryTime) >= fromDate
      );

      const strategies = ['vwap_pullback', 'abcd_long', 'sma_trend_ride', 'breakout', 'mean_reversion', 'range_trading', 'vwap_bounce', 'liquidity_trap'] as const;
      const strategyMetrics = [];

      for (const strategy of strategies) {
        const strategyTrades = recentTrades.filter(t => t.strategy === strategy);
        const closedTrades = strategyTrades.filter(t => t.status === 'closed');

        const wins = closedTrades.filter(t => parseFloat(t.realizedPL || '0') > 0);
        const winRate = closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0;

        const totalPL = closedTrades.reduce((sum, t) => sum + parseFloat(t.realizedPL || '0'), 0);
        const avgRMultiple = closedTrades.length > 0
          ? closedTrades.reduce((sum, t) => sum + parseFloat(t.realizedPLR || '0'), 0) / closedTrades.length
          : 0;

        const predictionAccuracy = await storage.getPredictionAccuracy(userId, mode, strategy, days);
        const signalWeights = await storage.getSignalWeights(userId, strategy, mode);

        const weightedConfidence = signalWeights.length > 0
          ? signalWeights.reduce((sum, w) => sum + parseFloat(w.weight || '1.0'), 0) / signalWeights.length
          : 1.0;

        const dailyPL: number[] = [];
        for (let i = 0; i < days; i++) {
          const dayStart = new Date();
          dayStart.setDate(dayStart.getDate() - i);
          dayStart.setHours(0, 0, 0, 0);
          const dayEnd = new Date(dayStart);
          dayEnd.setHours(23, 59, 59, 999);

          const dayTrades = closedTrades.filter(t => {
            const exitTime = t.exitTime ? new Date(t.exitTime) : null;
            return exitTime && exitTime >= dayStart && exitTime <= dayEnd;
          });

          const dayTotal = dayTrades.reduce((sum, t) => sum + parseFloat(t.realizedPL || '0'), 0);
          dailyPL.unshift(dayTotal);
        }

        strategyMetrics.push({
          strategy,
          strategyName: strategy.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
          winRate,
          avgRMultiple,
          totalPL,
          predictionAccuracy: predictionAccuracy.accuracy,
          confidence: weightedConfidence,
          totalTrades: strategyTrades.length,
          closedTrades: closedTrades.length,
          openTrades: strategyTrades.length - closedTrades.length,
          dailyPLTrend: dailyPL,
          status: totalPL > 0 ? 'positive' : totalPL < 0 ? 'negative' : 'neutral'
        });
      }

      const elapsed = Date.now() - startTime;
      
      // Phase 8.6.4: BoB deep-trace logging
      if (context.traceId) {
        await provenanceLogger.logBobTrace({
          traceId: context.traceId,
          bobModule: this.MODULE_NAME,
          operation: 'fetchPerformance',
          sourceTable: 'trades',
          mode: context.mode,
          globalContextId: 'default',
          cacheHit: false,
          executionTimeMs: elapsed,
          rowCount: recentTrades.length,
          metadata: { days, strategyCount: strategyMetrics.length }
        });
      }
      
      console.log(`[${this.MODULE_NAME}] ✅ Performance fetched in ${elapsed}ms`);

      return {
        success: true,
        data: strategyMetrics,
        period: `${days} days`
      };
    } catch (error: any) {
      console.error(`[${this.MODULE_NAME}] ❌ Performance fetch failed:`, error.message);
      throw error;
    }
  }

  /**
   * Fetch recent signal history
   * Adapts existing /api/historic-signals
   */
  private async fetchSignals(context: FetchContext & { limit?: number }): Promise<any> {
    const startTime = Date.now();
    const { mode = 'live', userId, limit = 50 } = context;
    console.log(`[${this.MODULE_NAME}] 🔍 Fetching signals (mode: ${mode}, limit: ${limit})${context.traceId ? ` [trace: ${context.traceId.substring(0, 12)}...]` : ''}`);

    try {
      if (!userId) {
        throw new Error('userId is required for signals fetch');
      }

      // getHistoricSignals only takes userId and optional limit (no mode parameter)
      const signals = await storage.getHistoricSignals(userId, limit);

      const elapsed = Date.now() - startTime;
      
      // Phase 8.6.4: BoB deep-trace logging
      if (context.traceId) {
        await provenanceLogger.logBobTrace({
          traceId: context.traceId,
          bobModule: this.MODULE_NAME,
          operation: 'fetchSignals',
          sourceTable: 'historic_signals',
          mode: context.mode,
          globalContextId: 'default',
          cacheHit: false,
          executionTimeMs: elapsed,
          rowCount: signals.length,
          metadata: { limit }
        });
      }
      
      console.log(`[${this.MODULE_NAME}] ✅ Signals fetched in ${elapsed}ms (${signals.length} signals)`);

      return signals;
    } catch (error: any) {
      console.error(`[${this.MODULE_NAME}] ❌ Signals fetch failed:`, error.message);
      throw error;
    }
  }

  /**
   * Fetch strategy settings summary
   * Adapts existing /api/strategies/settings/all
   */
  private async fetchSummary(context: FetchContext): Promise<any> {
    const startTime = Date.now();
    const { mode = 'live', userId } = context;
    console.log(`[${this.MODULE_NAME}] 🔍 Fetching summary (mode: ${mode})${context.traceId ? ` [trace: ${context.traceId.substring(0, 12)}...]` : ''}`);

    try {
      if (!userId) {
        throw new Error('userId is required for summary fetch');
      }

      const settings = await storage.listStrategySettings({ userId, mode: mode as 'live' | 'paper' });

      const elapsed = Date.now() - startTime;
      
      // Phase 8.6.4: BoB deep-trace logging
      if (context.traceId) {
        await provenanceLogger.logBobTrace({
          traceId: context.traceId,
          bobModule: this.MODULE_NAME,
          operation: 'fetchSummary',
          sourceTable: 'strategy_settings',
          mode: context.mode,
          globalContextId: 'default',
          cacheHit: false,
          executionTimeMs: elapsed,
          rowCount: settings.length,
          metadata: { strategyCount: settings.length }
        });
      }
      
      console.log(`[${this.MODULE_NAME}] ✅ Summary fetched in ${elapsed}ms (${settings.length} strategies)`);

      return settings;
    } catch (error: any) {
      console.error(`[${this.MODULE_NAME}] ❌ Summary fetch failed:`, error.message);
      throw error;
    }
  }

  /**
   * Convenience method to get strategy performance from cache
   */
  async getPerformance(
    userId: string,
    mode: 'live' | 'paper' = 'live',
    days: number = 7,
    ttl?: number
  ): Promise<any> {
    const key = `strategy:performance:${mode}:${userId}:${days}`;
    const context = { mode, userId, days } as FetchContext & { days?: number };

    return await bobCore.fetchOrServe(
      key,
      () => this.fetchPerformance(context),
      ttl || this.TTL_SECONDS,
      context,
      ['strategy', 'performance', mode]
    );
  }

  /**
   * Convenience method to get signal history from cache
   */
  async getSignals(
    userId: string,
    mode: 'live' | 'paper' = 'live',
    limit: number = 50,
    ttl?: number
  ): Promise<any> {
    const key = `strategy:signals:${mode}:${userId}:${limit}`;
    const context = { mode, userId, limit } as FetchContext & { limit?: number };

    return await bobCore.fetchOrServe(
      key,
      () => this.fetchSignals(context),
      ttl || this.TTL_SECONDS,
      context,
      ['strategy', 'signals', mode]
    );
  }

  /**
   * Convenience method to get strategy summary from cache
   */
  async getSummary(
    userId: string,
    mode: 'live' | 'paper' = 'live',
    ttl?: number
  ): Promise<any> {
    const key = `strategy:summary:${mode}:${userId}`;
    const context: FetchContext = { mode, userId };

    return await bobCore.fetchOrServe(
      key,
      () => this.fetchSummary(context),
      ttl || this.TTL_SECONDS,
      context,
      ['strategy', 'summary', mode]
    );
  }

  /**
   * Prefetch strategy data for a specific mode
   * Called on Walter chat open and mode change
   */
  async prefetchForMode(
    userId: string,
    mode: 'live' | 'paper',
    includeSignals: boolean = false,
    ttl?: number
  ): Promise<void> {
    console.log(`[${this.MODULE_NAME}] 🔄 Prefetching for ${mode} mode (signals: ${includeSignals})`);

    const prefetchTasks = [
      // Always prefetch summary and performance
      bobCore.prefetch(
        `strategy:summary:${mode}:${userId}`,
        () => this.fetchSummary({ mode, userId }),
        ttl || this.TTL_SECONDS,
        { mode, userId },
        ['strategy', 'summary', mode]
      ),
      bobCore.prefetch(
        `strategy:performance:${mode}:${userId}:7`,
        () => this.fetchPerformance({ mode, userId, days: 7 } as FetchContext & { days?: number }),
        ttl || this.TTL_SECONDS,
        { mode, userId, days: 7 } as FetchContext & { days?: number },
        ['strategy', 'performance', mode]
      )
    ];

    // Optionally prefetch signals (slower, so only on mode change)
    if (includeSignals) {
      prefetchTasks.push(
        bobCore.prefetch(
          `strategy:signals:${mode}:${userId}:50`,
          () => this.fetchSignals({ mode, userId, limit: 50 } as FetchContext & { limit?: number }),
          ttl || this.TTL_SECONDS,
          { mode, userId, limit: 50 } as FetchContext & { limit?: number },
          ['strategy', 'signals', mode]
        )
      );
    }

    await Promise.all(prefetchTasks);
    console.log(`[${this.MODULE_NAME}] ✅ Prefetch complete for ${mode} mode`);
  }
}

// Export singleton instance
export const strategyBob = new StrategyBobModule();
