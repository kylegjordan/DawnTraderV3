/**
 * TradeBob - Phase 7.6 Module #5
 * 
 * Handles live trading state caching with tight TTLs and event-driven invalidation
 * Provides instant, consistent awareness of positions, orders, fills, PnL, and activity
 * for both Walter and dashboard across LIVE and PAPER modes
 */

import { bobCore, FetchContext } from './bob-core.js';
import { storage } from '../storage.js';

/**
 * TradeBob Module
 * Owns: positions, orders, fills, pnl, activity (hot trading data)
 */
class TradeBobModule {
  private readonly MODULE_NAME = 'TradeBob';
  private readonly ENABLED = process.env.BOB_TRADE_ENABLED !== 'false';
  
  // Per-resource TTLs (in seconds) - tight for hot trading data
  private readonly TTL_POSITIONS = parseInt(process.env.BOB_TRADE_POSITIONS_TTL || '2', 10);
  private readonly TTL_ORDERS = parseInt(process.env.BOB_TRADE_ORDERS_TTL || '1', 10);
  private readonly TTL_FILLS = parseInt(process.env.BOB_TRADE_FILLS_TTL || '3', 10);
  private readonly TTL_PNL = parseInt(process.env.BOB_TRADE_PNL_TTL || '2', 10);
  private readonly TTL_ACTIVITY = parseInt(process.env.BOB_TRADE_ACTIVITY_TTL || '2', 10);

  constructor() {
    if (this.ENABLED) {
      this.registerWithBobCore();
      console.log(`[${this.MODULE_NAME}] ✅ Initialized with event-driven invalidation`);
    } else {
      console.log(`[${this.MODULE_NAME}] ⚠️ Disabled by BOB_TRADE_ENABLED flag`);
    }
  }

  isEnabled(): boolean {
    return this.ENABLED;
  }

  /**
   * Register this module's fetch functions with Bob Core
   */
  private registerWithBobCore() {
    const fetchFunctions = new Map<string, (context: FetchContext) => Promise<any>>();

    fetchFunctions.set('positions', this.fetchPositions.bind(this));
    fetchFunctions.set('orders', this.fetchOrders.bind(this));
    fetchFunctions.set('fills', this.fetchFills.bind(this));
    fetchFunctions.set('pnl', this.fetchPnL.bind(this));
    fetchFunctions.set('activity', this.fetchActivity.bind(this));

    bobCore.registerModule(this.MODULE_NAME, fetchFunctions);
  }

  /**
   * Fetch open positions (active trades)
   * Resource: /api/trades/active (LIVE), /api/paper/trades/open (PAPER)
   */
  private async fetchPositions(context: FetchContext): Promise<any> {
    const startTime = Date.now();
    const { mode = 'live', userId } = context;
    console.log(`[${this.MODULE_NAME}] 🔍 Fetching positions (mode: ${mode})`);

    try {
      if (!userId) {
        throw new Error('userId is required for positions fetch');
      }

      // Get active trades based on mode
      const positions = mode === 'live'
        ? await storage.getActiveTrades(userId)
        : await storage.getOpenPaperTrades(userId);

      const elapsed = Date.now() - startTime;
      console.log(`[${this.MODULE_NAME}] ✅ Positions fetched in ${elapsed}ms (${positions.length} positions)`);

      return positions;
    } catch (error: any) {
      console.error(`[${this.MODULE_NAME}] ❌ Positions fetch failed:`, error.message);
      throw error;
    }
  }

  /**
   * Fetch working orders
   * Resource: /api/trades (LIVE), /api/paper/trades (PAPER)
   */
  private async fetchOrders(context: FetchContext): Promise<any> {
    const startTime = Date.now();
    const { mode = 'live', userId } = context;
    console.log(`[${this.MODULE_NAME}] 🔍 Fetching orders (mode: ${mode})`);

    try {
      if (!userId) {
        throw new Error('userId is required for orders fetch');
      }

      // Get all trades (includes pending orders) based on mode
      const orders = mode === 'live'
        ? await storage.getTrades(userId, {})
        : await storage.getAllPaperTrades(userId);

      const elapsed = Date.now() - startTime;
      console.log(`[${this.MODULE_NAME}] ✅ Orders fetched in ${elapsed}ms (${orders.length} orders)`);

      return orders;
    } catch (error: any) {
      console.error(`[${this.MODULE_NAME}] ❌ Orders fetch failed:`, error.message);
      throw error;
    }
  }

  /**
   * Fetch recent fills/executions
   * Resource: /api/trades with status=closed (recent N)
   */
  private async fetchFills(context: FetchContext & { limit?: number }): Promise<any> {
    const startTime = Date.now();
    const { mode = 'live', userId, limit = 50 } = context;
    console.log(`[${this.MODULE_NAME}] 🔍 Fetching fills (mode: ${mode}, limit: ${limit})`);

    try {
      if (!userId) {
        throw new Error('userId is required for fills fetch');
      }

      // Get recent closed trades (fills) based on mode
      const allTrades = mode === 'live'
        ? await storage.getTrades(userId, {})
        : await storage.getAllPaperTrades(userId);

      // Filter to closed trades and sort by exit time, take most recent N
      const fills = allTrades
        .filter(t => t.status === 'closed' && t.exitTime)
        .sort((a, b) => {
          const timeA = new Date(a.exitTime!).getTime();
          const timeB = new Date(b.exitTime!).getTime();
          return timeB - timeA; // Most recent first
        })
        .slice(0, Math.min(limit, 100)); // Cap at 100 max

      const elapsed = Date.now() - startTime;
      console.log(`[${this.MODULE_NAME}] ✅ Fills fetched in ${elapsed}ms (${fills.length} fills)`);

      return fills;
    } catch (error: any) {
      console.error(`[${this.MODULE_NAME}] ❌ Fills fetch failed:`, error.message);
      throw error;
    }
  }

  /**
   * Fetch session PnL & exposure
   * Resource: /api/portfolio/overview (LIVE), /api/paper/metrics/portfolio (PAPER)
   */
  private async fetchPnL(context: FetchContext): Promise<any> {
    const startTime = Date.now();
    const { mode = 'live', userId } = context;
    console.log(`[${this.MODULE_NAME}] 🔍 Fetching PnL (mode: ${mode})`);

    try {
      if (!userId) {
        throw new Error('userId is required for PnL fetch');
      }

      let pnlData;

      if (mode === 'live') {
        // Get live portfolio overview using RiskManager
        const { RiskManager } = await import('./risk-manager.js');
        const riskManager = new RiskManager();
        const liveBalance = await riskManager.getLiveKrakenBalance(userId);
        const metrics = await riskManager.getPortfolioMetrics(userId);
        const winRateData = await riskManager.getWinRate(userId, 30);
        
        pnlData = {
          totalValue: liveBalance.totalValueUSD,
          unrealizedPL: metrics.unrealizedPL,
          realizedPL: metrics.realizedPL,
          currentExposure: metrics.currentExposure,
          openTradesCount: metrics.openTradesCount,
          ...winRateData,
          cash: liveBalance.cashUSD,
          crypto: liveBalance.cryptoUSD,
          cashPercent: liveBalance.totalValueUSD > 0 ? (liveBalance.cashUSD / liveBalance.totalValueUSD) * 100 : 0,
          cryptoPercent: liveBalance.totalValueUSD > 0 ? (liveBalance.cryptoUSD / liveBalance.totalValueUSD) * 100 : 0,
          syncTimestamp: liveBalance.syncTimestamp
        };
      } else {
        // Get paper portfolio metrics
        const { PaperMetricsService } = await import('./paper-metrics.js');
        const metricsService = new PaperMetricsService(userId);
        pnlData = await metricsService.getPortfolioMetrics();
      }

      const elapsed = Date.now() - startTime;
      console.log(`[${this.MODULE_NAME}] ✅ PnL fetched in ${elapsed}ms`);

      return pnlData;
    } catch (error: any) {
      console.error(`[${this.MODULE_NAME}] ❌ PnL fetch failed:`, error.message);
      throw error;
    }
  }

  /**
   * Fetch recent trade activity (compact stream for widgets)
   * Resource: /api/trading/activity
   */
  private async fetchActivity(context: FetchContext & { limit?: number }): Promise<any> {
    const startTime = Date.now();
    const { mode = 'live', userId, limit = 20 } = context;
    console.log(`[${this.MODULE_NAME}] 🔍 Fetching activity (mode: ${mode}, limit: ${limit})`);

    try {
      if (!userId) {
        throw new Error('userId is required for activity fetch');
      }

      // Get all trades and create activity stream
      const allTrades = mode === 'live'
        ? await storage.getTrades(userId, {})
        : await storage.getAllPaperTrades(userId);

      // Sort by most recent activity (entry or exit time)
      const activity = allTrades
        .map(t => ({
          id: t.id,
          symbol: t.symbol,
          strategy: t.strategy,
          action: t.status === 'closed' ? 'closed' : t.status === 'open' ? 'opened' : 'pending',
          timestamp: t.status === 'closed' ? t.exitTime : t.entryTime,
          pnl: t.status === 'closed' ? parseFloat(t.realizedPL || '0') : null,
          qty: parseFloat(t.quantity || '0')
        }))
        .filter(a => a.timestamp)
        .sort((a, b) => {
          const timeA = new Date(a.timestamp!).getTime();
          const timeB = new Date(b.timestamp!).getTime();
          return timeB - timeA; // Most recent first
        })
        .slice(0, Math.min(limit, 100)); // Cap at 100 max

      const elapsed = Date.now() - startTime;
      console.log(`[${this.MODULE_NAME}] ✅ Activity fetched in ${elapsed}ms (${activity.length} events)`);

      return activity;
    } catch (error: any) {
      console.error(`[${this.MODULE_NAME}] ❌ Activity fetch failed:`, error.message);
      throw error;
    }
  }

  /**
   * Public API: Get open positions with caching
   */
  async getPositions(
    userId: string,
    mode: 'live' | 'paper' = 'live',
    ttl?: number
  ): Promise<any> {
    const key = `trade:positions:${mode}:${userId}`;
    const context: FetchContext = { mode, userId };

    return await bobCore.fetchOrServe(
      key,
      () => this.fetchPositions(context),
      ttl || this.TTL_POSITIONS,
      context,
      ['trade', 'positions', mode]
    );
  }

  /**
   * Public API: Get working orders with caching
   */
  async getOrders(
    userId: string,
    mode: 'live' | 'paper' = 'live',
    ttl?: number
  ): Promise<any> {
    const key = `trade:orders:${mode}:${userId}`;
    const context: FetchContext = { mode, userId };

    return await bobCore.fetchOrServe(
      key,
      () => this.fetchOrders(context),
      ttl || this.TTL_ORDERS,
      context,
      ['trade', 'orders', mode]
    );
  }

  /**
   * Public API: Get recent fills with caching
   */
  async getFills(
    userId: string,
    mode: 'live' | 'paper' = 'live',
    limit: number = 50,
    ttl?: number
  ): Promise<any> {
    const key = `trade:fills:${mode}:${userId}:${limit}`;
    const context = { mode, userId, limit } as FetchContext & { limit?: number };

    return await bobCore.fetchOrServe(
      key,
      () => this.fetchFills(context),
      ttl || this.TTL_FILLS,
      context,
      ['trade', 'fills', mode]
    );
  }

  /**
   * Public API: Get session PnL & exposure with caching
   */
  async getPnL(
    userId: string,
    mode: 'live' | 'paper' = 'live',
    ttl?: number
  ): Promise<any> {
    const key = `trade:pnl:${mode}:${userId}`;
    const context: FetchContext = { mode, userId };

    return await bobCore.fetchOrServe(
      key,
      () => this.fetchPnL(context),
      ttl || this.TTL_PNL,
      context,
      ['trade', 'pnl', mode]
    );
  }

  /**
   * Public API: Get recent trade activity with caching
   */
  async getActivity(
    userId: string,
    mode: 'live' | 'paper' = 'live',
    limit: number = 20,
    ttl?: number
  ): Promise<any> {
    const key = `trade:activity:${mode}:${userId}:${limit}`;
    const context = { mode, userId, limit } as FetchContext & { limit?: number };

    return await bobCore.fetchOrServe(
      key,
      () => this.fetchActivity(context),
      ttl || this.TTL_ACTIVITY,
      context,
      ['trade', 'activity', mode]
    );
  }

  /**
   * Helper: Invalidate all keys with a given prefix using tag-based invalidation
   */
  private invalidateByTag(tag: string): void {
    bobCore.invalidate(tag);
  }

  /**
   * Event-driven invalidation: Called when trade lifecycle changes
   * Invalidates affected keys immediately (bypasses TTL)
   */
  invalidateOnEvent(
    userId: string,
    mode: 'live' | 'paper',
    eventType: 'order_placed' | 'order_amended' | 'order_canceled' | 'fill' | 'position_update' | 'pnl_update' | 'engine_state'
  ): void {
    console.log(`[${this.MODULE_NAME}] 🔄 Event-driven invalidation: ${eventType} (${mode} mode)`);

    // Invalidate affected resources based on event type
    switch (eventType) {
      case 'order_placed':
      case 'order_amended':
      case 'order_canceled':
        // Invalidate orders and activity (using tags)
        bobCore.invalidate(`trade:orders:${mode}:${userId}`);
        this.invalidateByTag('activity'); // Tag-based for all activity variants
        break;

      case 'fill':
        // Invalidate positions, orders, fills, PnL, and activity
        bobCore.invalidate(`trade:positions:${mode}:${userId}`);
        bobCore.invalidate(`trade:orders:${mode}:${userId}`);
        this.invalidateByTag('fills'); // Tag-based for all fill limits
        bobCore.invalidate(`trade:pnl:${mode}:${userId}`);
        this.invalidateByTag('activity'); // Tag-based for all activity variants
        break;

      case 'position_update':
        // Invalidate positions, PnL, and activity
        bobCore.invalidate(`trade:positions:${mode}:${userId}`);
        bobCore.invalidate(`trade:pnl:${mode}:${userId}`);
        this.invalidateByTag('activity'); // Tag-based for all activity variants
        break;

      case 'pnl_update':
        // Invalidate PnL only
        bobCore.invalidate(`trade:pnl:${mode}:${userId}`);
        break;

      case 'engine_state':
        // Invalidate everything (engine pause/resume)
        bobCore.invalidate(`trade:positions:${mode}:${userId}`);
        bobCore.invalidate(`trade:orders:${mode}:${userId}`);
        this.invalidateByTag('fills'); // Tag-based for all fill limits
        bobCore.invalidate(`trade:pnl:${mode}:${userId}`);
        this.invalidateByTag('activity'); // Tag-based for all activity variants
        break;
    }
  }

  /**
   * Prefetch hot trading data for a specific mode
   * Called on dashboard mount, Walter chat open, mode change
   */
  async prefetchForMode(
    userId: string,
    mode: 'live' | 'paper',
    includeActivity: boolean = false,
    ttl?: number
  ): Promise<void> {
    console.log(`[${this.MODULE_NAME}] 🔄 Prefetching for ${mode} mode (activity: ${includeActivity})`);

    const prefetchTasks = [
      // Always prefetch positions, orders, and PnL
      bobCore.prefetch(
        `trade:positions:${mode}:${userId}`,
        () => this.fetchPositions({ mode, userId }),
        ttl || this.TTL_POSITIONS,
        { mode, userId },
        ['trade', 'positions', mode]
      ),
      bobCore.prefetch(
        `trade:orders:${mode}:${userId}`,
        () => this.fetchOrders({ mode, userId }),
        ttl || this.TTL_ORDERS,
        { mode, userId },
        ['trade', 'orders', mode]
      ),
      bobCore.prefetch(
        `trade:pnl:${mode}:${userId}`,
        () => this.fetchPnL({ mode, userId }),
        ttl || this.TTL_PNL,
        { mode, userId },
        ['trade', 'pnl', mode]
      )
    ];

    // Optionally prefetch activity (only on dashboard mount or mode change)
    if (includeActivity) {
      prefetchTasks.push(
        bobCore.prefetch(
          `trade:activity:${mode}:${userId}:20`,
          () => this.fetchActivity({ mode, userId, limit: 20 } as FetchContext & { limit?: number }),
          ttl || this.TTL_ACTIVITY,
          { mode, userId, limit: 20 } as FetchContext & { limit?: number },
          ['trade', 'activity', mode]
        )
      );
    }

    await Promise.all(prefetchTasks);
    console.log(`[${this.MODULE_NAME}] ✅ Prefetch complete for ${mode} mode`);
  }

  /**
   * Invalidate all trading data for a user/mode
   */
  invalidateAll(userId: string, mode: 'live' | 'paper'): void {
    console.log(`[${this.MODULE_NAME}] 🗑️ Invalidating all trading data for ${mode} mode`);
    bobCore.invalidate(`trade:positions:${mode}:${userId}`);
    bobCore.invalidate(`trade:orders:${mode}:${userId}`);
    this.invalidateByTag('fills'); // Tag-based for all fill limits
    bobCore.invalidate(`trade:pnl:${mode}:${userId}`);
    this.invalidateByTag('activity'); // Tag-based for all activity variants
  }
}

// Export singleton instance
export const tradeBob = new TradeBobModule();
