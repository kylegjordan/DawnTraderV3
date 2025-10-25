import { bobCore, type FetchContext } from './bob-core';
import { db } from '../db';
import { trades } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { provenanceLogger } from './provenance-logger'; // Phase 8.6.4: BoB deep-trace

/**
 * TradeBob - Trade & Execution Optimization Module (Phase 7.6)
 * 
 * Caches real-time trade data with very tight TTLs (1s) for instant dashboard updates
 * and Walter AI queries about active positions and recent executions.
 * 
 * Architecture (per architect guidance):
 * - Caches /api/trades/active (combined live+paper) with single key per user
 * - Caches /api/paper/trades/open (paper-only) separately
 * - Provides in-memory filtering for mode-specific data when needed
 * 
 * Event-driven invalidation on trade execution, close, or update.
 */
class TradeBob {
  private readonly MODULE_NAME = 'TradeBob';
  private readonly ENABLED = process.env.BOB_TRADE_ENABLED !== 'false';
  
  // Very tight TTL for real-time trade data
  private readonly TTL_ACTIVE_TRADES = parseInt(process.env.BOB_TRADE_ACTIVE_TTL || '1', 10);

  constructor() {
    console.log(`[${this.MODULE_NAME}] Constructor called - ENABLED: ${this.ENABLED}`);
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

  private registerWithBobCore(): void {
    const fetchFunctions = new Map<string, (context: FetchContext) => Promise<any>>();
    
    fetchFunctions.set('activeTrades', this.fetchActiveTrades.bind(this));
    fetchFunctions.set('openPaperTrades', this.fetchOpenPaperTrades.bind(this));
    
    bobCore.registerModule(this.MODULE_NAME, fetchFunctions);
  }

  // ========================================
  // FETCH FUNCTIONS
  // ========================================

  /**
   * Fetch ALL active trades (live + paper combined) - GLOBAL per mode
   * Phase 27.F.15.A: Trades are now global (no userId filtering)
   * Matches /api/trades/active endpoint behavior
   */
  private async fetchActiveTrades(context: FetchContext): Promise<any> {
    console.log(`[${this.MODULE_NAME}] 🔍 Fetching all active trades (live + paper)${context.traceId ? ` [trace: ${context.traceId.substring(0, 12)}...]` : ''}`);
    
    const start = Date.now();
    const result = await db.query.trades.findMany({
      where: eq(trades.status, 'open'),
      orderBy: (trades, { desc }) => [desc(trades.entryTime)]
    });
    
    const duration = Date.now() - start;
    
    // Phase 8.6.4: BoB deep-trace logging
    if (context.traceId) {
      await provenanceLogger.logBobTrace({
        traceId: context.traceId,
        bobModule: this.MODULE_NAME,
        operation: 'fetchActiveTrades',
        sourceTable: 'trades',
        mode: context.mode,
        globalContextId: 'default',
        cacheHit: false,
        executionTimeMs: duration,
        rowCount: result.length,
        metadata: { tradeCount: result.length }
      });
    }
    
    console.log(`[${this.MODULE_NAME}] ✅ Active trades fetched in ${duration}ms (${result.length} trades)`);
    return result;
  }

  /**
   * Fetch open paper trades only - GLOBAL per mode
   * Phase 27.F.15.A: Trades are now global (no userId filtering)
   * Matches /api/paper/trades/open endpoint behavior
   */
  private async fetchOpenPaperTrades(context: FetchContext): Promise<any> {
    console.log(`[${this.MODULE_NAME}] 🔍 Fetching open paper trades${context.traceId ? ` [trace: ${context.traceId.substring(0, 12)}...]` : ''}`);
    
    const start = Date.now();
    const result = await db.query.trades.findMany({
      where: and(
        eq(trades.status, 'open'),
        eq(trades.mode, 'paper')
      ),
      orderBy: (trades, { desc }) => [desc(trades.entryTime)]
    });
    
    const duration = Date.now() - start;
    
    // Phase 8.6.4: BoB deep-trace logging
    if (context.traceId) {
      await provenanceLogger.logBobTrace({
        traceId: context.traceId,
        bobModule: this.MODULE_NAME,
        operation: 'fetchOpenPaperTrades',
        sourceTable: 'trades',
        mode: 'paper',
        globalContextId: 'default',
        cacheHit: false,
        executionTimeMs: duration,
        rowCount: result.length,
        metadata: { tradeCount: result.length }
      });
    }
    
    console.log(`[${this.MODULE_NAME}] ✅ Open paper trades fetched in ${duration}ms (${result.length} trades)`);
    return result;
  }

  // ========================================
  // TRANSPARENT ROUTING (BobCore Integration)
  // ========================================

  /**
   * Get all active trades (live + paper combined) - GLOBAL
   * Phase 27.F.15.A: userId kept for backwards compatibility but trades are global
   * Used by /api/trades/active endpoint
   */
  async getAllActiveTrades(userId: string): Promise<any> {
    if (!this.ENABLED) {
      return this.fetchActiveTrades({ userId, mode: 'live' });
    }

    const cacheKey = `trade:active:${userId}`;
    const tag = `user:${userId}`;

    return bobCore.fetchOrServe(
      cacheKey,
      () => this.fetchActiveTrades({ userId, mode: 'live' }),
      this.TTL_ACTIVE_TRADES,
      [tag, 'trade:active'],
      'activeTrades'
    );
  }

  /**
   * Get open paper trades only - GLOBAL
   * Phase 27.F.15.A: userId kept for backwards compatibility but trades are global
   * Used by /api/paper/trades/open endpoint
   */
  async getOpenPaperTrades(userId: string): Promise<any> {
    if (!this.ENABLED) {
      return this.fetchOpenPaperTrades({ userId, mode: 'paper' });
    }

    const cacheKey = `trade:paper:open:${userId}`;
    const tag = `user:${userId}`;

    return bobCore.fetchOrServe(
      cacheKey,
      () => this.fetchOpenPaperTrades({ userId, mode: 'paper' }),
      this.TTL_ACTIVE_TRADES,
      [tag, 'trade:paper'],
      'openPaperTrades'
    );
  }

  /**
   * Helper: Filter active trades by mode (in-memory)
   * Used by Walter when mode-specific data is needed
   */
  async getActiveTradesByMode(userId: string, mode: 'live' | 'paper'): Promise<any> {
    const allTrades = await this.getAllActiveTrades(userId);
    return allTrades.filter((trade: any) => trade.mode === mode);
  }

  // ========================================
  // PREFETCH INTEGRATION
  // ========================================

  async prefetchForMode(userId: string, mode: 'live' | 'paper'): Promise<void> {
    if (!this.ENABLED) return;

    console.log(`[${this.MODULE_NAME}] 🔄 Prefetching active trades for ${mode} mode`);
    
    try {
      if (mode === 'paper') {
        // For paper mode, prefetch the paper-specific endpoint
        await this.getOpenPaperTrades(userId);
      } else {
        // For live mode, prefetch the combined active trades
        await this.getAllActiveTrades(userId);
      }
      
      console.log(`[${this.MODULE_NAME}] ✅ Prefetch complete for ${mode} mode`);
    } catch (error) {
      console.error(`[${this.MODULE_NAME}] ❌ Prefetch failed for ${mode} mode:`, error);
    }
  }

  // ========================================
  // EVENT-DRIVEN INVALIDATION
  // ========================================

  /**
   * Invalidate all active trades cache when a trade changes
   * Called on trade execution, close, or update
   */
  invalidateActiveTrades(userId: string): void {
    if (!this.ENABLED) return;
    
    // Invalidate combined active trades
    const cacheKey = `trade:active:${userId}`;
    bobCore.invalidate(cacheKey);
    
    console.log(`[${this.MODULE_NAME}] 🗑️ Invalidated active trades cache (user: ${userId})`);
  }

  /**
   * Invalidate paper trades cache when paper trade changes
   */
  invalidatePaperTrades(userId: string): void {
    if (!this.ENABLED) return;
    
    const cacheKey = `trade:paper:open:${userId}`;
    bobCore.invalidate(cacheKey);
    
    console.log(`[${this.MODULE_NAME}] 🗑️ Invalidated paper trades cache (user: ${userId})`);
  }

  /**
   * Invalidate all trade caches for a user
   */
  invalidateAllForUser(userId: string): void {
    if (!this.ENABLED) return;
    
    bobCore.invalidate(`user:${userId}`);
    console.log(`[${this.MODULE_NAME}] 🗑️ Invalidated all trade caches for user ${userId}`);
  }
}

// Export singleton instance
export const tradeBob = new TradeBob();
