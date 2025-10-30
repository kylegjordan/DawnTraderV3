import { cortexCore } from './cortex-core';
import { strategyAnalytics } from '../strategy-analytics';
import { portfolioAggregator } from '../portfolio-aggregator';
import { provenanceLogger } from '../provenance-logger'; // Phase 8.6.4
import { SystemUserCache } from '../../utils/system-user-cache'; // Phase 31.I
import fs from 'fs/promises';
import path from 'path';

/**
 * Analytics Scheduler (Phase 8.2)
 * 
 * Runs every 15 minutes to compute and cache:
 * - Strategy-level performance analytics
 * - Portfolio-level aggregations
 * 
 * Results stored in Cortex with 15-min TTL for fast Walter queries
 */

interface AnalyticsSchedulerConfig {
  enabled: boolean;
  intervalMinutes: number;
  logPath: string;
}

class AnalyticsScheduler {
  private readonly MODULE_NAME = 'AnalyticsScheduler';
  private interval: NodeJS.Timeout | null = null;
  private config: AnalyticsSchedulerConfig;
  private lastRun: string | null = null;
  private lastLogTimestamp: number | null = null; // Track logging separately

  constructor() {
    this.config = {
      enabled: process.env.ANALYTICS_SCHEDULER_ENABLED !== 'false',
      intervalMinutes: parseInt(process.env.ANALYTICS_INTERVAL_MINUTES || '15'),
      logPath: path.join(process.cwd(), 'logs/strategy-analytics.log')
    };

    console.log(`[${this.MODULE_NAME}] Initialized - Enabled: ${this.config.enabled}, Interval: ${this.config.intervalMinutes}m`);
  }

  /**
   * Start the analytics scheduler
   */
  async start(): Promise<void> {
    if (!this.config.enabled) {
      console.log(`[${this.MODULE_NAME}] ⚠️ Disabled via ANALYTICS_SCHEDULER_ENABLED=false`);
      return;
    }

    // Run immediately on start
    await this.runAnalyticsCycle();

    // Then run every N minutes
    const intervalMs = this.config.intervalMinutes * 60 * 1000;
    this.interval = setInterval(async () => {
      await this.runAnalyticsCycle();
    }, intervalMs);

    console.log(`[${this.MODULE_NAME}] 🔄 Scheduler started (${this.config.intervalMinutes}m interval)`);
  }

  /**
   * Stop the analytics scheduler
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.log(`[${this.MODULE_NAME}] 🛑 Scheduler stopped`);
    }
  }

  /**
   * Phase 31.I: Resolve scheduler user ID dynamically
   * Prefers: request context → TEST_USER_ID env → testuser123 DB lookup
   */
  private async resolveSchedulerUserId(): Promise<string> {
    // Check for request context (if available)
    const ctx = (global as any).__REQUEST_CONTEXT__?.userId;
    if (typeof ctx === 'string' && ctx.length > 0) {
      return ctx;
    }

    // Allow runtime override for tests
    if (process.env.TEST_USER_ID) {
      return process.env.TEST_USER_ID;
    }

    // Fall back to test account username lookup (cached)
    return await SystemUserCache.getOrResolve('testuser123');
  }

  /**
   * Run a complete analytics cycle
   */
  private async runAnalyticsCycle(): Promise<void> {
    console.log(`[${this.MODULE_NAME}] 📊 Starting analytics cycle...`);
    const cycleStart = Date.now();

    try {
      // Phase 31.I: Use dynamic user ID resolution (no hardcoded UUIDs)
      const userId = await this.resolveSchedulerUserId();
      const modes: ('live' | 'paper')[] = ['live', 'paper'];

      for (const mode of modes) {
        await this.computeAndCacheAnalytics(userId, mode);
      }

      this.lastRun = new Date().toISOString();
      
      const duration = Date.now() - cycleStart;
      console.log(`[${this.MODULE_NAME}] ✅ Analytics cycle completed in ${duration}ms`);

      // Phase 8.3: Track scheduler run for health monitoring
      try {
        const { systemHealthMonitor } = await import('../system-health-monitor');
        systemHealthMonitor.updateSchedulerRun('analytics');
      } catch (err) {
        // Health monitor not available, continue
      }

    } catch (error) {
      console.error(`[${this.MODULE_NAME}] ❌ Analytics cycle failed:`, error);
    }
  }

  /**
   * Compute and cache analytics for a specific user/mode
   */
  private async computeAndCacheAnalytics(userId: string, mode: 'live' | 'paper'): Promise<void> {
    try {
      // Compute strategy analytics
      const strategySnapshot = await strategyAnalytics.computeStrategyAnalytics(userId, mode);

      // Compute portfolio aggregation
      const portfolioSnapshot = await portfolioAggregator.aggregatePortfolio(
        userId,
        mode,
        strategySnapshot.strategies
      );

      // Cache in Cortex with 15-minute TTL (900 seconds)
      const ttl = this.config.intervalMinutes * 60;
      const cacheKey = `analytics_${mode}_${userId}`;
      
      // Phase 8.6.4: Generate traceId for scheduled analytics
      const traceId = provenanceLogger.generateTraceId();
      
      cortexCore.set(cacheKey, {
        strategy_analytics: strategySnapshot,
        portfolio_summary: portfolioSnapshot,
        computed_at: new Date().toISOString(),
        user_id: userId,
        mode
      }, ttl, {
        traceId,
        mode,
        sourceTable: 'strategy_settings'
      });

      console.log(`[${this.MODULE_NAME}] 💾 Cached analytics for user=${userId}, mode=${mode} (TTL: ${ttl}s)`);
      console.log(`[${this.MODULE_NAME}]   - Strategies: ${strategySnapshot.totalStrategies}`);
      console.log(`[${this.MODULE_NAME}]   - Best: ${strategySnapshot.bestPerformer || 'N/A'}`);
      console.log(`[${this.MODULE_NAME}]   - Portfolio Sharpe: ${portfolioSnapshot.portfolioSharpe}`);

      // Log to file every 30 minutes (using separate timestamp tracker)
      const now = Date.now();
      const shouldLog = this.lastLogTimestamp === null 
        ? true 
        : (now - this.lastLogTimestamp) >= 30 * 60 * 1000;

      // Diagnostic logging for cadence visibility
      if (this.lastLogTimestamp !== null && mode === 'live') {
        const minutesSinceLastLog = Math.floor((now - this.lastLogTimestamp) / 60000);
        console.log(`[${this.MODULE_NAME}] 📊 Log check: ${minutesSinceLastLog}m since last log (threshold: 30m, shouldLog: ${shouldLog})`);
      }

      if (shouldLog && mode === 'live') { // Only log once per cycle
        await this.logPerformanceSummary(strategySnapshot, portfolioSnapshot);
        this.lastLogTimestamp = now; // Update log timestamp only when we actually log
        console.log(`[${this.MODULE_NAME}] 📅 Next performance summary in 30 minutes`);
      }

    } catch (error) {
      console.error(`[${this.MODULE_NAME}] ❌ Failed to compute analytics for user=${userId}, mode=${mode}:`, error);
    }
  }

  /**
   * Log performance summary to file
   */
  private async logPerformanceSummary(
    strategySnapshot: any,
    portfolioSnapshot: any
  ): Promise<void> {
    try {
      const timestamp = new Date().toISOString();
      const logEntry = {
        timestamp,
        best_performer: strategySnapshot.bestPerformer || 'N/A',
        worst_performer: strategySnapshot.worstPerformer || 'N/A',
        portfolio_pl_delta: portfolioSnapshot.totalPL,
        average_sharpe: strategySnapshot.averageSharpe,
        portfolio_sharpe: portfolioSnapshot.portfolioSharpe,
        portfolio_volatility: portfolioSnapshot.portfolioVolatility,
        diversification_index: portfolioSnapshot.diversificationIndex,
        total_strategies: strategySnapshot.totalStrategies,
        active_strategies: portfolioSnapshot.activeStrategies
      };

      const logLine = JSON.stringify(logEntry) + '\n';
      
      // Ensure logs directory exists
      const logsDir = path.dirname(this.config.logPath);
      await fs.mkdir(logsDir, { recursive: true });
      
      // Append to log file
      await fs.appendFile(this.config.logPath, logLine);
      
      console.log(`[${this.MODULE_NAME}] 📝 Performance summary logged to ${this.config.logPath}`);
    } catch (error) {
      console.error(`[${this.MODULE_NAME}] ❌ Failed to write log:`, error);
    }
  }

  /**
   * Get analytics from cache (helper for other services)
   */
  getAnalytics(userId: string, mode: 'live' | 'paper'): any | null {
    const cacheKey = `analytics_${mode}_${userId}`;
    return cortexCore.get(cacheKey);
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      enabled: this.config.enabled,
      interval_minutes: this.config.intervalMinutes,
      last_run: this.lastRun,
      running: this.interval !== null
    };
  }
}

// Export singleton instance
export const analyticsScheduler = new AnalyticsScheduler();
