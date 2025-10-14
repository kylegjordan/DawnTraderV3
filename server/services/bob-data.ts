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
   */
  private registerWithBobCore() {
    const fetchFunctions = new Map<string, (context: FetchContext) => Promise<any>>();

    fetchFunctions.set('results', this.fetchResults.bind(this));
    fetchFunctions.set('averages', this.fetchAverages.bind(this));
    fetchFunctions.set('activity', this.fetchActivity.bind(this));

    bobCore.registerModule(this.MODULE_NAME, fetchFunctions);
  }

  /**
   * Fetch trading results (earnings, win rate, etc.)
   * Mirrors /api/trading/results endpoint
   */
  private async fetchResults(context: FetchContext): Promise<any> {
    const startTime = Date.now();
    const { mode = 'live', period = 'today', userId } = context;
    console.log(`[${this.MODULE_NAME}] 🔍 Fetching results (mode: ${mode}, period: ${period})`);

    try {
      if (!userId) {
        throw new Error('userId is required for results fetch');
      }

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

      // Query trades for the period
      const tradesData = await db.query.trades.findMany({
        where: and(
          eq(trades.userId, userId),
          eq(trades.tradingMode, mode),
          gte(trades.exitTime, startDate)
        ),
        orderBy: [desc(trades.exitTime)]
      });

      // Calculate results
      const totalTrades = tradesData.length;
      const profitableTrades = tradesData.filter(t => t.profitLoss && t.profitLoss > 0).length;
      const totalEarnings = tradesData.reduce((sum, t) => sum + (t.profitLoss || 0), 0);
      const winRate = totalTrades > 0 ? (profitableTrades / totalTrades) * 100 : 0;
      const averageReturn = totalTrades > 0 
        ? tradesData.reduce((sum, t) => sum + (t.returnPercent || 0), 0) / totalTrades 
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
    console.log(`[${this.MODULE_NAME}] 🔍 Fetching averages (mode: ${mode})`);

    try {
      if (!userId) {
        throw new Error('userId is required for averages fetch');
      }

      // Get all trades for the user
      const allTrades = await db.query.trades.findMany({
        where: and(
          eq(trades.userId, userId),
          eq(trades.tradingMode, mode)
        )
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
        trades.reduce((sum, t) => sum + (t.profitLoss || 0), 0);

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
  private async fetchActivity(context: FetchContext): Promise<any> {
    const startTime = Date.now();
    const { mode = 'live', limit = 50, userId } = context;
    console.log(`[${this.MODULE_NAME}] 🔍 Fetching activity (mode: ${mode}, limit: ${limit})`);

    try {
      if (!userId) {
        throw new Error('userId is required for activity fetch');
      }

      // Calculate today's range
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      // Get today's trades
      const todayTrades = await db.query.trades.findMany({
        where: and(
          eq(trades.userId, userId),
          eq(trades.tradingMode, mode),
          gte(trades.exitTime, today)
        ),
        orderBy: [desc(trades.exitTime)],
        limit
      });

      // Calculate activity metrics
      const totalTrades = todayTrades.length;
      const profitableTrades = todayTrades.filter(t => t.profitLoss && t.profitLoss > 0).length;
      const losingTrades = todayTrades.filter(t => t.profitLoss && t.profitLoss < 0).length;
      const totalEarnings = todayTrades.reduce((sum, t) => sum + (t.profitLoss || 0), 0);

      const activity = {
        numberOfTrades: totalTrades,
        profitableTrades,
        losingTrades,
        totalEarnings: Number(totalEarnings.toFixed(2)),
        trades: todayTrades.map(t => ({
          id: t.id,
          symbol: t.symbol,
          side: t.side,
          profitLoss: t.profitLoss,
          returnPercent: t.returnPercent,
          exitTime: t.exitTime
        }))
      };

      const duration = Date.now() - startTime;
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
    const context: FetchContext = { mode, period, userId };

    return await bobCore.fetchOrServe(
      key,
      () => this.fetchResults(context),
      ttl,
      context,
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
   * Get trading activity with caching
   * Public API for routes to use
   */
  async getActivity(
    userId: string,
    mode: 'live' | 'paper' = 'live',
    limit: number = 50,
    ttl?: number
  ): Promise<any> {
    const key = `data:activity:${mode}:${userId}`;
    const context: FetchContext = { mode, limit, userId };

    return await bobCore.fetchOrServe(
      key,
      () => this.fetchActivity(context),
      ttl,
      context,
      ['data', 'activity', mode]
    );
  }

  /**
   * Fetch multiple data endpoints in parallel
   * Used by dashboard and Walter for faster responses
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
   */
  async prefetchForMode(
    userId: string,
    mode: 'live' | 'paper',
    period: 'today' | 'week' | 'month' = 'today',
    ttl?: number
  ): Promise<void> {
    console.log(`[${this.MODULE_NAME}] 🔄 Prefetching data for ${mode} mode`);

    const prefetches = [
      bobCore.prefetch(
        `data:results:${mode}:${period}:${userId}`,
        () => this.fetchResults({ mode, period, userId }),
        ttl,
        { mode, period, userId },
        ['data', 'results', mode, period]
      ),
      bobCore.prefetch(
        `data:averages:${mode}:${userId}`,
        () => this.fetchAverages({ mode, userId }),
        ttl,
        { mode, userId },
        ['data', 'averages', mode]
      ),
      bobCore.prefetch(
        `data:activity:${mode}:${userId}`,
        () => this.fetchActivity({ mode, limit: 50, userId }),
        ttl,
        { mode, limit: 50, userId },
        ['data', 'activity', mode]
      )
    ];

    await Promise.allSettled(prefetches);
    console.log(`[${this.MODULE_NAME}] ✅ Prefetch complete for ${mode} mode`);
  }

  /**
   * Invalidate data cache for a specific mode
   */
  invalidateMode(userId: string, mode: 'live' | 'paper') {
    console.log(`[${this.MODULE_NAME}] 🗑️ Invalidating cache for ${mode} mode`);
    bobCore.invalidateByTag(['data', mode]);
  }
}

// Export singleton instance
export const dataBob = new DataBobModule();
