/**
 * LATTI KnowledgeBridge Service (Phase 27.F.14.B - Task 2)
 * 
 * Safely transfers successful parameter adjustments from paper trading mode
 * to live trading mode when performance improvements meet strict safety thresholds.
 * 
 * Safety Criteria:
 * - Win rate improvement ≥15% OR profit factor improvement ≥0.4
 * - Minimum 100 trades in paper mode since last sync
 * - Minimum 12 hours since last sync
 * - Paper mode must be actively running
 * 
 * @module KnowledgeBridge
 */

import { storage } from '../storage';
import type { TradingMode } from '@shared/schema';

interface PerformanceMetrics {
  winRate: number;
  profitFactor: number;
  totalTrades: number;
  avgProfit: number;
  drawdown: number;
}

interface SyncEligibility {
  eligible: boolean;
  reason: string;
  metrics?: {
    paperWinRate: number;
    liveWinRate: number;
    winRateImprovement: number;
    paperProfitFactor: number;
    liveProfitFactor: number;
    profitFactorImprovement: number;
    tradesSinceSync: number;
    hoursSinceSync: number;
  };
}

interface SyncResult {
  success: boolean;
  timestamp: Date;
  parametersTransferred: string[];
  reason: string;
  beforeMetrics: PerformanceMetrics;
  afterMetrics: PerformanceMetrics;
}

export class KnowledgeBridge {
  private readonly MODULE_NAME = 'KnowledgeBridge';
  
  // Safety thresholds
  private readonly MIN_WIN_RATE_IMPROVEMENT = 0.15; // 15%
  private readonly MIN_PROFIT_FACTOR_IMPROVEMENT = 0.4; // 0.4 points
  private readonly MIN_TRADES_SINCE_SYNC = 100;
  private readonly MIN_HOURS_SINCE_SYNC = 12;
  
  /**
   * Check if paper-to-live sync is eligible based on performance and timing
   */
  async checkSyncEligibility(): Promise<SyncEligibility> {
    try {
      // Get system context for both modes
      const paperContext = await storage.getSystemContext('paper');
      const liveContext = await storage.getSystemContext('live');
      
      if (!paperContext || !liveContext) {
        return {
          eligible: false,
          reason: 'Missing system context for one or both modes'
        };
      }
      
      // Check if paper mode is active
      if (!paperContext.active) {
        return {
          eligible: false,
          reason: 'Paper trading mode is not active'
        };
      }
      
      // Check time since last sync
      const lastSyncTime = paperContext.latti_last_mode_sync_time;
      const hoursSinceSync = lastSyncTime 
        ? (Date.now() - new Date(lastSyncTime).getTime()) / (1000 * 60 * 60)
        : Infinity;
      
      if (hoursSinceSync < this.MIN_HOURS_SINCE_SYNC) {
        return {
          eligible: false,
          reason: `Only ${hoursSinceSync.toFixed(1)}h since last sync (minimum: ${this.MIN_HOURS_SINCE_SYNC}h)`
        };
      }
      
      // Get performance metrics for both modes
      const paperMetrics = await this.getPerformanceMetrics('paper', lastSyncTime);
      const liveMetrics = await this.getPerformanceMetrics('live', null);
      
      // Check minimum trades threshold
      if (paperMetrics.totalTrades < this.MIN_TRADES_SINCE_SYNC) {
        return {
          eligible: false,
          reason: `Only ${paperMetrics.totalTrades} trades since last sync (minimum: ${this.MIN_TRADES_SINCE_SYNC})`
        };
      }
      
      // Calculate improvements
      const winRateImprovement = paperMetrics.winRate - liveMetrics.winRate;
      const profitFactorImprovement = paperMetrics.profitFactor - liveMetrics.profitFactor;
      
      // Check if improvement thresholds are met (either condition)
      const winRateMet = winRateImprovement >= this.MIN_WIN_RATE_IMPROVEMENT;
      const profitFactorMet = profitFactorImprovement >= this.MIN_PROFIT_FACTOR_IMPROVEMENT;
      
      if (!winRateMet && !profitFactorMet) {
        return {
          eligible: false,
          reason: `Performance improvement below thresholds (winRate: ${(winRateImprovement * 100).toFixed(1)}% < ${(this.MIN_WIN_RATE_IMPROVEMENT * 100).toFixed(0)}%, profitFactor: ${profitFactorImprovement.toFixed(2)} < ${this.MIN_PROFIT_FACTOR_IMPROVEMENT})`,
          metrics: {
            paperWinRate: paperMetrics.winRate,
            liveWinRate: liveMetrics.winRate,
            winRateImprovement,
            paperProfitFactor: paperMetrics.profitFactor,
            liveProfitFactor: liveMetrics.profitFactor,
            profitFactorImprovement,
            tradesSinceSync: paperMetrics.totalTrades,
            hoursSinceSync
          }
        };
      }
      
      // All criteria met!
      return {
        eligible: true,
        reason: winRateMet 
          ? `Win rate improvement: ${(winRateImprovement * 100).toFixed(1)}% (threshold: ${(this.MIN_WIN_RATE_IMPROVEMENT * 100).toFixed(0)}%)`
          : `Profit factor improvement: ${profitFactorImprovement.toFixed(2)} (threshold: ${this.MIN_PROFIT_FACTOR_IMPROVEMENT})`,
        metrics: {
          paperWinRate: paperMetrics.winRate,
          liveWinRate: liveMetrics.winRate,
          winRateImprovement,
          paperProfitFactor: paperMetrics.profitFactor,
          liveProfitFactor: liveMetrics.profitFactor,
          profitFactorImprovement,
          tradesSinceSync: paperMetrics.totalTrades,
          hoursSinceSync
        }
      };
    } catch (error: any) {
      console.error(`[${this.MODULE_NAME}] ❌ Error checking sync eligibility:`, error.message);
      return {
        eligible: false,
        reason: `Error checking eligibility: ${error.message}`
      };
    }
  }
  
  /**
   * Get performance metrics for a given mode
   */
  private async getPerformanceMetrics(
    mode: TradingMode,
    since: Date | null
  ): Promise<PerformanceMetrics> {
    try {
      // Get trades from paper_sim_trades or live trades (depending on mode)
      const trades = mode === 'paper'
        ? await storage.getPaperSimTrades(since || undefined)
        : await storage.getLiveTrades(since || undefined);
      
      if (!trades || trades.length === 0) {
        return {
          winRate: 0,
          profitFactor: 0,
          totalTrades: 0,
          avgProfit: 0,
          drawdown: 0
        };
      }
      
      // Calculate metrics
      const closedTrades = trades.filter(t => t.status === 'closed');
      const winningTrades = closedTrades.filter(t => (t.profit || 0) > 0);
      const losingTrades = closedTrades.filter(t => (t.profit || 0) < 0);
      
      const totalWins = winningTrades.reduce((sum, t) => sum + (t.profit || 0), 0);
      const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + (t.profit || 0), 0));
      
      const winRate = closedTrades.length > 0 
        ? winningTrades.length / closedTrades.length 
        : 0;
      
      const profitFactor = totalLosses > 0 
        ? totalWins / totalLosses 
        : totalWins > 0 ? 999 : 0;
      
      const avgProfit = closedTrades.length > 0
        ? closedTrades.reduce((sum, t) => sum + (t.profit || 0), 0) / closedTrades.length
        : 0;
      
      // Simple drawdown calculation (max loss from peak)
      let peak = 0;
      let maxDrawdown = 0;
      let runningProfit = 0;
      
      for (const trade of closedTrades) {
        runningProfit += (trade.profit || 0);
        if (runningProfit > peak) {
          peak = runningProfit;
        }
        const drawdown = peak - runningProfit;
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
        }
      }
      
      return {
        winRate,
        profitFactor,
        totalTrades: closedTrades.length,
        avgProfit,
        drawdown: maxDrawdown
      };
    } catch (error: any) {
      console.error(`[${this.MODULE_NAME}] ❌ Error getting performance metrics for ${mode}:`, error.message);
      return {
        winRate: 0,
        profitFactor: 0,
        totalTrades: 0,
        avgProfit: 0,
        drawdown: 0
      };
    }
  }
  
  /**
   * Perform paper-to-live parameter sync
   */
  async syncPaperToLive(): Promise<SyncResult> {
    const timestamp = new Date();
    
    try {
      console.log(`[${this.MODULE_NAME}] 🔄 Starting paper-to-live sync...`);
      
      // Check eligibility first
      const eligibility = await this.checkSyncEligibility();
      
      if (!eligibility.eligible) {
        console.log(`[${this.MODULE_NAME}] ⏭️ Sync not eligible: ${eligibility.reason}`);
        return {
          success: false,
          timestamp,
          parametersTransferred: [],
          reason: eligibility.reason,
          beforeMetrics: await this.getPerformanceMetrics('live', null),
          afterMetrics: await this.getPerformanceMetrics('live', null)
        };
      }
      
      console.log(`[${this.MODULE_NAME}] ✅ Sync eligible: ${eligibility.reason}`);
      
      // Get current parameters from both modes
      const paperGuardrails = await storage.getGuardrails('paper');
      const liveGuardrails = await storage.getGuardrails('live');
      const paperFilters = await storage.getScreenerFilters('paper');
      const liveFilters = await storage.getScreenerFilters('live');
      
      if (!paperGuardrails || !liveGuardrails || !paperFilters || !liveFilters) {
        throw new Error('Failed to load guardrails or filters for one or both modes');
      }
      
      // Capture before metrics
      const beforeMetrics = await this.getPerformanceMetrics('live', null);
      
      // Transfer guardrails (risk parameters)
      const transferredParams: string[] = [];
      
      if (paperGuardrails.risk_per_trade !== liveGuardrails.risk_per_trade) {
        await storage.updateGuardrail('live', 'risk_per_trade', paperGuardrails.risk_per_trade);
        transferredParams.push(`risk_per_trade: ${liveGuardrails.risk_per_trade} → ${paperGuardrails.risk_per_trade}`);
      }
      
      if (paperGuardrails.max_exposure_percent !== liveGuardrails.max_exposure_percent) {
        await storage.updateGuardrail('live', 'max_exposure_percent', paperGuardrails.max_exposure_percent);
        transferredParams.push(`max_exposure_percent: ${liveGuardrails.max_exposure_percent} → ${paperGuardrails.max_exposure_percent}`);
      }
      
      if (paperGuardrails.max_drawdown_percent !== liveGuardrails.max_drawdown_percent) {
        await storage.updateGuardrail('live', 'max_drawdown_percent', paperGuardrails.max_drawdown_percent);
        transferredParams.push(`max_drawdown_percent: ${liveGuardrails.max_drawdown_percent} → ${paperGuardrails.max_drawdown_percent}`);
      }
      
      if (paperGuardrails.max_daily_loss !== liveGuardrails.max_daily_loss) {
        await storage.updateGuardrail('live', 'max_daily_loss', paperGuardrails.max_daily_loss);
        transferredParams.push(`max_daily_loss: ${liveGuardrails.max_daily_loss} → ${paperGuardrails.max_daily_loss}`);
      }
      
      // Transfer screener filters
      if (paperFilters.min_volume_24h !== liveFilters.min_volume_24h) {
        await storage.updateScreenerFilter('live', 'min_volume_24h', paperFilters.min_volume_24h);
        transferredParams.push(`min_volume_24h: ${liveFilters.min_volume_24h} → ${paperFilters.min_volume_24h}`);
      }
      
      if (paperFilters.max_spread_percent !== liveFilters.max_spread_percent) {
        await storage.updateScreenerFilter('live', 'max_spread_percent', paperFilters.max_spread_percent);
        transferredParams.push(`max_spread_percent: ${liveFilters.max_spread_percent} → ${paperFilters.max_spread_percent}`);
      }
      
      // Update sync timestamp in both modes
      await storage.updateSystemContext('paper', { latti_last_mode_sync_time: timestamp });
      await storage.updateSystemContext('live', { latti_last_mode_sync_time: timestamp });
      
      // Log sync event to latti_baseline_history
      await storage.createLattiBaselineHistory({
        trading_mode: 'live',
        trigger_reason: 'knowledge_bridge_sync',
        trades_since_anchor: eligibility.metrics?.tradesSinceSync || 0,
        win_rate_before: eligibility.metrics?.liveWinRate || 0,
        win_rate_after: eligibility.metrics?.paperWinRate || 0,
        profit_factor_before: eligibility.metrics?.liveProfitFactor || 0,
        profit_factor_after: eligibility.metrics?.paperProfitFactor || 0,
        metadata: {
          parametersTransferred: transferredParams,
          winRateImprovement: eligibility.metrics?.winRateImprovement || 0,
          profitFactorImprovement: eligibility.metrics?.profitFactorImprovement || 0,
          hoursSinceLastSync: eligibility.metrics?.hoursSinceSync || 0
        }
      });
      
      // Create audit log
      await storage.createTradingAuditLog({
        userId: 'system',
        action: 'knowledge_bridge_sync',
        mode: 'live',
        triggeredBy: 'latti_knowledge_bridge',
        metadata: {
          parametersTransferred: transferredParams.length,
          details: transferredParams,
          paperMetrics: eligibility.metrics,
          syncReason: eligibility.reason
        }
      });
      
      const afterMetrics = await this.getPerformanceMetrics('live', null);
      
      console.log(`[${this.MODULE_NAME}] ✅ Sync complete - ${transferredParams.length} parameters transferred`);
      transferredParams.forEach(param => {
        console.log(`[${this.MODULE_NAME}]    - ${param}`);
      });
      
      return {
        success: true,
        timestamp,
        parametersTransferred: transferredParams,
        reason: `Successful sync: ${eligibility.reason}`,
        beforeMetrics,
        afterMetrics
      };
    } catch (error: any) {
      console.error(`[${this.MODULE_NAME}] ❌ Sync failed:`, error.message);
      
      return {
        success: false,
        timestamp,
        parametersTransferred: [],
        reason: `Sync failed: ${error.message}`,
        beforeMetrics: await this.getPerformanceMetrics('live', null),
        afterMetrics: await this.getPerformanceMetrics('live', null)
      };
    }
  }
  
  /**
   * Get sync status and next eligible time
   */
  async getSyncStatus() {
    try {
      const paperContext = await storage.getSystemContext('paper');
      const eligibility = await this.checkSyncEligibility();
      
      const lastSyncTime = paperContext?.latti_last_mode_sync_time;
      const hoursSinceSync = lastSyncTime 
        ? (Date.now() - new Date(lastSyncTime).getTime()) / (1000 * 60 * 60)
        : null;
      
      const hoursUntilEligible = lastSyncTime && hoursSinceSync
        ? Math.max(0, this.MIN_HOURS_SINCE_SYNC - hoursSinceSync)
        : 0;
      
      return {
        eligible: eligibility.eligible,
        reason: eligibility.reason,
        lastSyncTime,
        hoursSinceSync,
        hoursUntilEligible,
        nextEligibleTime: lastSyncTime 
          ? new Date(new Date(lastSyncTime).getTime() + this.MIN_HOURS_SINCE_SYNC * 60 * 60 * 1000)
          : new Date(),
        metrics: eligibility.metrics,
        thresholds: {
          minWinRateImprovement: this.MIN_WIN_RATE_IMPROVEMENT,
          minProfitFactorImprovement: this.MIN_PROFIT_FACTOR_IMPROVEMENT,
          minTradesSinceSync: this.MIN_TRADES_SINCE_SYNC,
          minHoursSinceSync: this.MIN_HOURS_SINCE_SYNC
        }
      };
    } catch (error: any) {
      console.error(`[${this.MODULE_NAME}] ❌ Error getting sync status:`, error.message);
      throw error;
    }
  }
}

// Singleton instance
export const knowledgeBridge = new KnowledgeBridge();
