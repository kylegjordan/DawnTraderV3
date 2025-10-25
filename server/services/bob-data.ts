/**
 * DataBob - Phase 7.3 Module #2
 * 
 * Handles dashboard performance data caching
 * Provides parallel fetching for results, averages, and activity
 */

import { bobCore, FetchContext } from './bob-core';
import { db } from '../db';
import { trades } from '@shared/schema';
import { eq, and, gte, sql, desc } from 'drizzle-orm';
import { provenanceLogger } from './provenance-logger'; // Phase 8.6.4: BoB deep-trace

/**
 * DataBob Module
 * Owns: results, averages, activity data for dashboard and Walter
 */
class DataBobModule {
  private readonly MODULE_NAME = 'DataBob';

  constructor() {
    this.registerWithBobCore();
  }

  /**
   * Register this module's fetch functions with Bob Core
   * Note: Activity not registered due to period filtering incompatibility
   */
  private registerWithBobCore() {
    const fetchFunctions = new Map<string, (context: FetchContext) => Promise<any>>();

    fetchFunctions.set('results', this.fetchResults.bind(this));
    fetchFunctions.set('averages', this.fetchAverages.bind(this));

    bobCore.registerModule(this.MODULE_NAME, fetchFunctions);
  }

  /**
   * Fetch trading results (earnings, win rate, etc.)
   * Mirrors /api/trading/results endpoint
   */
  private async fetchResults(context: FetchContext & { period?: string }): Promise<any> {
    const startTime = Date.now();
    const { mode = 'live', period = 'today', userId } = context;
    console.log(`[${this.MODULE_NAME}] 🔍 Fetching results (mode: ${mode}, period: ${period})${context.traceId ? ` [trace: ${context.traceId.substring(0, 12)}...]` : ''}`);

    try {
      // Phase 27.F.15.B.1-POST: Global query (trades table no longer has user_id)
      // Calculate date range based on period
      const now = new Date();
      let startDate: Date;
      
      switch (period) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        default:
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      }

      // Query trades for the period (global for mode)
      const tradesData = await db.query.trades.findMany({
        where: and(
          eq(trades.mode, mode),
          gte(trades.exitTime, startDate)
        ),
        orderBy: [desc(trades.exitTime)]
      });

      // Calculate results
      const totalTrades = tradesData.length;
      const profitableTrades = tradesData.filter(t => t.realizedPL && Number(t.realizedPL) > 0).length;
      const totalEarnings = tradesData.reduce((sum, t) => sum + Number(t.realizedPL || 0), 0);
      const winRate = totalTrades > 0 ? (profitableTrades / totalTrades) * 100 : 0;
      const averageReturn = totalTrades > 0 
        ? tradesData.reduce((sum, t) => sum + Number(t.realizedPLPercent || 0), 0) / totalTrades 
        : 0;

      const results = {
        totalEarnings: Number(totalEarnings.toFixed(2)),
        numberOfTrades: totalTrades,
        winRate: Number(winRate.toFixed(2)),
        profitableTrades,
        averageReturn: Number(averageReturn.toFixed(2)),
        period
      };

      const duration = Date.now() - startTime;
      
      // Phase 8.6.4: BoB deep-trace logging
      if (context.traceId) {
        await provenanceLogger.logBobTrace({
          traceId: context.traceId,
          bobModule: this.MODULE_NAME,
          operation: 'fetchResults',
          sourceTable: 'trades',
          mode: context.mode,
          globalContextId: 'default',
          cacheHit: false,
          executionTimeMs: duration,
          rowCount: tradesData.length,
          metadata: { period, totalEarnings: results.totalEarnings, winRate: results.winRate }
        });
      }
      
      console.log(`[${this.MODULE_NAME}] ✅ Results fetched in ${duration}ms`);
      
      return results;
    } catch (error: any) {
      console.error(`[${this.MODULE_NAME}] ❌ Results fetch failed:`, error.message);
      throw error;
    }
  }

  /**
   * Fetch trading averages (daily, weekly, monthly)
   * Mirrors /api/trading/averages endpoint
   */
  private async fetchAverages(context: FetchContext): Promise<any> {
    const startTime = Date.now();
    const { mode = 'live', userId } = context;
    console.log(`[${this.MODULE_NAME}] 🔍 Fetching averages (mode: ${mode})${context.traceId ? ` [trace: ${context.traceId.substring(0, 12)}...]` : ''}`);

    try {
      // Phase 27.F.15.B.1-POST: Global query (trades table no longer has user_id)
      // Get all trades for the mode (global)
      const allTrades = await db.query.trades.findMany({
        where: eq(trades.mode, mode)
      });

      // Calculate time-based metrics
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const yearStart = new Date(now.getFullYear(), 0, 1);

      const todayTrades = allTrades.filter(t => t.exitTime && t.exitTime >= today);
      const weekTrades = allTrades.filter(t => t.exitTime && t.exitTime >= weekAgo);
      const monthTrades = allTrades.filter(t => t.exitTime && t.exitTime >= monthStart);
      const yearTrades = allTrades.filter(t => t.exitTime && t.exitTime >= yearStart);

      const calculateEarnings = (trades: any[]) => 
        trades.reduce((sum, t) => sum + Number(t.realizedPL || 0), 0);

      const averages = {
        avgDailyEarnings: Number(calculateEarnings(todayTrades).toFixed(2)),
        avgWeeklyEarnings: Number(calculateEarnings(weekTrades).toFixed(2)),
        avgMonthlyEarnings: Number(calculateEarnings(monthTrades).toFixed(2)),
        avgYearlyEarnings: Number(calculateEarnings(yearTrades).toFixed(2)),
        avgTradesPerDay: todayTrades.length,
        avgEarningsPerTrade: allTrades.length > 0 
          ? Number((calculateEarnings(allTrades) / allTrades.length).toFixed(2))
          : 0
      };

      const duration = Date.now() - startTime;
      
      // Phase 8.6.4: BoB deep-trace logging
      if (context.traceId) {
        await provenanceLogger.logBobTrace({
          traceId: context.traceId,
          bobModule: this.MODULE_NAME,
          operation: 'fetchAverages',
          sourceTable: 'trades',
          mode: context.mode,
          globalContextId: 'default',
          cacheHit: false,
          executionTimeMs: duration,
          rowCount: allTrades.length,
          metadata: { avgDailyEarnings: averages.avgDailyEarnings, avgMonthlyEarnings: averages.avgMonthlyEarnings }
        });
      }
      
      console.log(`[${this.MODULE_NAME}] ✅ Averages fetched in ${duration}ms`);
      
      return averages;
    } catch (error: any) {
      console.error(`[${this.MODULE_NAME}] ❌ Averages fetch failed:`, error.message);
      throw error;
    }
  }

  /**
   * Fetch trading activity (trade count, status)
   * Mirrors /api/trading/activity endpoint
   */
  private async fetchActivity(context: FetchContext & { limit?: number }): Promise<any> {
    const startTime = Date.now();
    const { mode = 'live', limit = 50, userId } = context;
    console.log(`[${this.MODULE_NAME}] 🔍 Fetching activity (mode: ${mode}, limit: ${limit})${context.traceId ? ` [trace: ${context.traceId.substring(0, 12)}...]` : ''}`);

    try {
      // Phase 27.F.15.B.1-POST: Global query (trades table no longer has user_id)
      // Calculate today's range
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      // Get today's trades (global for mode)
      const todayTrades = await db.query.trades.findMany({
        where: and(
          eq(trades.mode, mode),
          gte(trades.exitTime, today)
        ),
        orderBy: [desc(trades.exitTime)],
        limit
      });

      // Calculate activity metrics
      const totalTrades = todayTrades.length;
      const profitableTrades = todayTrades.filter(t => t.realizedPL && Number(t.realizedPL) > 0).length;
      const losingTrades = todayTrades.filter(t => t.realizedPL && Number(t.realizedPL) < 0).length;
      const totalEarnings = todayTrades.reduce((sum, t) => sum + Number(t.realizedPL || 0), 0);

      const activity = {
        numberOfTrades: totalTrades,
        profitableTrades,
        losingTrades,
        totalEarnings: Number(totalEarnings.toFixed(2)),
        trades: todayTrades.map(t => ({
          id: t.id,
          symbol: t.symbol,
          strategy: t.strategy,
          realizedPL: t.realizedPL,
          realizedPLPercent: t.realizedPLPercent,
          exitTime: t.exitTime
        }))
      };

      const duration = Date.now() - startTime;
      
      // Phase 8.6.4: BoB deep-trace logging
      if (context.traceId) {
        await provenanceLogger.logBobTrace({
          traceId: context.traceId,
          bobModule: this.MODULE_NAME,
          operation: 'fetchActivity',
          sourceTable: 'trades',
          mode: context.mode,
          globalContextId: 'default',
          cacheHit: false,
          executionTimeMs: duration,
          rowCount: todayTrades.length,
          metadata: { limit, totalTrades, totalEarnings: activity.totalEarnings }
        });
      }
      
      console.log(`[${this.MODULE_NAME}] ✅ Activity fetched in ${duration}ms`);
      
      return activity;
    } catch (error: any) {
      console.error(`[${this.MODULE_NAME}] ❌ Activity fetch failed:`, error.message);
      throw error;
    }
  }

  /**
   * Get trading results with caching
   * Public API for routes to use
   */
  async getResults(
    userId: string,
    mode: 'live' | 'paper' = 'live',
    period: 'today' | 'week' | 'month' = 'today',
    ttl?: number
  ): Promise<any> {
    const key = `data:results:${mode}:${period}:${userId}`;
    const context = { mode, period, userId } as FetchContext & { period?: string };

    return await bobCore.fetchOrServe(
      key,
      () => this.fetchResults(context),
      ttl,
      { mode, userId },
      ['data', 'results', mode, period]
    );
  }

  /**
   * Get trading averages with caching
   * Public API for routes to use
   */
  async getAverages(
    userId: string,
    mode: 'live' | 'paper' = 'live',
    ttl?: number
  ): Promise<any> {
    const key = `data:averages:${mode}:${userId}`;
    const context: FetchContext = { mode, userId };

    return await bobCore.fetchOrServe(
      key,
      () => this.fetchAverages(context),
      ttl,
      context,
      ['data', 'averages', mode]
    );
  }

  /**
   * Get trading activity WITHOUT caching
   * NOTE: Disabled caching due to period filtering incompatibility with original endpoint
   * This method is kept for backward compatibility but does not use Bob Core
   */
  async getActivity(
    userId: string,
    mode: 'live' | 'paper' = 'live',
    limit: number = 50,
    ttl?: number
  ): Promise<any> {
    const context = { mode, limit, userId } as FetchContext & { limit?: number };
    // Direct fetch without caching
    return await this.fetchActivity(context);
  }

  /**
   * Fetch multiple data endpoints in parallel
   * Used by dashboard and Walter for faster responses
   * NOTE: Activity endpoint fetched directly without caching (period incompatibility)
   */
  async fetchParallel(
    userId: string,
    endpoints: Array<'results' | 'averages' | 'activity'>,
    mode: 'live' | 'paper' = 'live',
    period: 'today' | 'week' | 'month' = 'today',
    ttl?: number
  ): Promise<Record<string, any>> {
    console.log(`[${this.MODULE_NAME}] 🚀 Parallel fetch: ${endpoints.join(', ')} (mode: ${mode})`);
    const startTime = Date.now();

    const promises: Record<string, Promise<any>> = {};

    if (endpoints.includes('results')) {
      promises.results = this.getResults(userId, mode, period, ttl);
    }

    if (endpoints.includes('averages')) {
      promises.averages = this.getAverages(userId, mode, ttl);
    }

    if (endpoints.includes('activity')) {
      // Activity fetched directly without caching (getActivity no longer uses Bob Core)
      promises.activity = this.getActivity(userId, mode, 50, ttl);
    }

    try {
      const results = await Promise.all(
        Object.entries(promises).map(async ([key, promise]) => {
          const value = await promise;
          return [key, value];
        })
      );

      const duration = Date.now() - startTime;
      console.log(`[${this.MODULE_NAME}] ✅ Parallel fetch complete in ${duration}ms`);

      return Object.fromEntries(results);
    } catch (error: any) {
      console.error(`[${this.MODULE_NAME}] ❌ Parallel fetch failed:`, error.message);
      throw error;
    }
  }

  /**
   * Prefetch data for a specific mode
   * Called on app start, Walter chat mount, or mode change
   * Note: Activity endpoint not cached due to period filtering incompatibility
   */
  async prefetchForMode(
    userId: string,
    mode: 'live' | 'paper',
    period: 'today' | 'week' | 'month' = 'today',
    ttl?: number
  ): Promise<void> {
    console.log(`[${this.MODULE_NAME}] 🔄 Prefetching data for ${mode} mode (results, averages only)`);

    const prefetches = [
      bobCore.prefetch(
        `data:results:${mode}:${period}:${userId}`,
        () => this.fetchResults({ mode, period, userId } as FetchContext & { period?: string }),
        ttl,
        { mode, userId },
        ['data', 'results', mode, period]
      ),
      bobCore.prefetch(
        `data:averages:${mode}:${userId}`,
        () => this.fetchAverages({ mode, userId }),
        ttl,
        { mode, userId },
        ['data', 'averages', mode]
      )
    ];

    await Promise.allSettled(prefetches);
    console.log(`[${this.MODULE_NAME}] ✅ Prefetch complete for ${mode} mode`);
  }

  /**
   * Invalidate data cache for a specific mode
   */
  invalidateMode(userId: string, mode: 'live' | 'paper', period: 'today' | 'week' | 'month' = 'today') {
    console.log(`[${this.MODULE_NAME}] 🗑️ Invalidating cache for ${mode} mode`);
    bobCore.invalidate(`data:results:${mode}:${period}:${userId}`);
    bobCore.invalidate(`data:averages:${mode}:${userId}`);
  }
}

// Export singleton instance
export const dataBob = new DataBobModule();
