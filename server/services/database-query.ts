import { storage } from "../storage";
import type { TradingSettings, WatchlistPair, Trade, AIAuditLog, ErrorLog } from "@shared/schema";

/**
 * Database Query Service
 * Provides safe, controlled database access for AI/GPT interactions
 * All queries use predefined templates - no free-text SQL
 */
export class DatabaseQueryService {
  /**
   * Get user's current risk settings
   */
  async getRiskSettings(userId: string): Promise<TradingSettings | null> {
    const settings = await storage.getTradingSettings(userId);
    return settings || null;
  }

  /**
   * Get watchlist/scanner results
   */
  async getWatchlist(userId: string): Promise<WatchlistPair[]> {
    return await storage.getWatchlist(userId);
  }

  /**
   * Get trade history with filters
   */
  async getTrades(
    userId: string,
    filters?: {
      status?: 'open' | 'closed' | 'cancelled';
      symbol?: string;
      strategy?: 'vwap_pullback' | 'abcd_long' | 'sma_trend_ride';
      limit?: number;
    }
  ): Promise<Trade[]> {
    return await storage.getTrades(userId, filters);
  }

  /**
   * Get currently open trades
   */
  async getOpenTrades(userId: string): Promise<Trade[]> {
    return await storage.getActiveTrades(userId);
  }

  /**
   * Get trade statistics
   */
  async getTradeStatistics(userId: string): Promise<{
    totalTrades: number;
    openTrades: number;
    closedTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    totalPL: number;
    avgRMultiple: number;
  }> {
    const trades = await storage.getTrades(userId, { limit: 10000 });
    const openTrades = trades.filter(t => t.status === 'open');
    const closedTrades = trades.filter(t => t.status === 'closed');
    const winningTrades = closedTrades.filter(t => parseFloat(t.realizedPL || '0') > 0);
    const losingTrades = closedTrades.filter(t => parseFloat(t.realizedPL || '0') < 0);
    
    const totalPL = closedTrades.reduce((sum, t) => sum + parseFloat(t.realizedPL || '0'), 0);
    const avgRMultiple = closedTrades.length > 0
      ? closedTrades.reduce((sum, t) => sum + parseFloat(t.realizedPLR || '0'), 0) / closedTrades.length
      : 0;
    
    const winRate = closedTrades.length > 0
      ? (winningTrades.length / closedTrades.length) * 100
      : 0;

    return {
      totalTrades: trades.length,
      openTrades: openTrades.length,
      closedTrades: closedTrades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate,
      totalPL,
      avgRMultiple,
    };
  }

  /**
   * Get AI audit logs
   */
  async getAuditLogs(userId: string, limit = 20): Promise<AIAuditLog[]> {
    return await storage.getAuditLogs(userId, limit);
  }

  /**
   * Get error logs
   */
  async getErrorLogs(
    userId: string,
    filters?: { resolved?: boolean; errorType?: string; limit?: number }
  ): Promise<ErrorLog[]> {
    return await storage.getErrorLogs(userId, filters);
  }

  /**
   * Get specific error log for diagnosis
   */
  async getErrorLogById(errorId: string, userId: string): Promise<ErrorLog | null> {
    const errors = await storage.getErrorLogs(userId, { limit: 1000 });
    return errors.find(e => e.id === errorId) || null;
  }

  /**
   * Get trading performance by strategy
   */
  async getPerformanceByStrategy(userId: string): Promise<{
    strategy: string;
    trades: number;
    winRate: number;
    avgPL: number;
    avgRMultiple: number;
  }[]> {
    const trades = await storage.getTrades(userId, { status: 'closed', limit: 10000 });
    
    const strategies = ['vwap_pullback', 'abcd_long', 'sma_trend_ride'];
    return strategies.map(strategy => {
      const strategyTrades = trades.filter(t => t.strategy === strategy);
      const winners = strategyTrades.filter(t => parseFloat(t.realizedPL || '0') > 0);
      const winRate = strategyTrades.length > 0 ? (winners.length / strategyTrades.length) * 100 : 0;
      const avgPL = strategyTrades.length > 0
        ? strategyTrades.reduce((sum, t) => sum + parseFloat(t.realizedPL || '0'), 0) / strategyTrades.length
        : 0;
      const avgRMultiple = strategyTrades.length > 0
        ? strategyTrades.reduce((sum, t) => sum + parseFloat(t.realizedPLR || '0'), 0) / strategyTrades.length
        : 0;

      return {
        strategy,
        trades: strategyTrades.length,
        winRate,
        avgPL,
        avgRMultiple,
      };
    });
  }

  /**
   * Get recent AI reports
   */
  async getAIReports(userId: string, type?: string, limit = 10) {
    return await storage.getAIReports(userId, type, limit);
  }
}

export const databaseQueryService = new DatabaseQueryService();
