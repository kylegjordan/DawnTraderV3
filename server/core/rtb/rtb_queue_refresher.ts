/**
 * Phase 8.8.4-B: RTB Queue Refresher (Background Job)
 * 
 * Runs every 30 seconds to:
 * 1. Re-evaluate queued signals (remove stale/low-quality ones)
 * 2. Clean up expired signals (TTL exceeded)
 * 3. Log queue statistics for monitoring
 * 
 * This ensures the RTB queue stays fresh and only contains
 * viable signals that can be promoted when capacity frees up.
 */

import cron, { type ScheduledTask } from 'node-cron';
import { readyToBuyService, type RTBQueueStats } from './ready_to_buy_service';
import type { TradingMode } from '../../services/guardrail-policy';

const REFRESH_INTERVAL_CRON = '*/30 * * * * *'; // Every 30 seconds

class RTBQueueRefresher {
  private task: ScheduledTask | null = null;
  private isRunning = false;
  private lastRunTime: Date | null = null;
  private runCount = 0;

  constructor() {
    console.log('[RTB-Refresher] RTB Queue Refresher initialized');
  }

  /**
   * Start the background refresh job
   */
  start(): void {
    if (this.task) {
      console.log('[RTB-Refresher] Already running, skipping start');
      return;
    }

    this.task = cron.schedule(REFRESH_INTERVAL_CRON, async () => {
      await this.runRefreshCycle();
    });

    console.log('[RTB-Refresher] Started - running every 30 seconds');
  }

  /**
   * Stop the background refresh job
   */
  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
      console.log('[RTB-Refresher] Stopped');
    }
  }

  /**
   * Run a single refresh cycle for both modes
   */
  async runRefreshCycle(): Promise<void> {
    if (this.isRunning) {
      console.log('[RTB-Refresher] Skipping - previous cycle still running');
      return;
    }

    this.isRunning = true;
    this.runCount++;
    const startTime = Date.now();

    try {
      // Refresh both paper and live queues
      const paperResults = await this.refreshMode('paper');
      const liveResults = await this.refreshMode('live');

      const duration = Date.now() - startTime;
      this.lastRunTime = new Date();

      // Log summary (only if there's activity)
      const totalCleaned = paperResults.expiredCount + liveResults.expiredCount;
      const totalRemoved = paperResults.removedCount + liveResults.removedCount;
      const totalQueued = paperResults.stats.totalQueued + liveResults.stats.totalQueued;

      if (totalCleaned > 0 || totalRemoved > 0 || this.runCount % 10 === 0) {
        console.log(
          `[RTB-Refresher] Cycle #${this.runCount} completed in ${duration}ms: ` +
          `paper=${paperResults.stats.totalQueued} queued, ` +
          `live=${liveResults.stats.totalQueued} queued, ` +
          `expired=${totalCleaned}, removed=${totalRemoved}`
        );
      }

    } catch (error) {
      console.error('[RTB-Refresher] Error during refresh cycle:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Refresh a single mode's queue
   */
  private async refreshMode(mode: TradingMode): Promise<{
    expiredCount: number;
    removedCount: number;
    stats: RTBQueueStats;
  }> {
    // Clean up expired signals first
    const expiredCount = await readyToBuyService.cleanupExpiredSignals(mode);

    // Re-evaluate remaining signals
    const { removed: removedCount } = await readyToBuyService.reEvaluateQueue(mode);

    // Get current stats
    const stats = await readyToBuyService.getQueueStats(mode);

    return { expiredCount, removedCount, stats };
  }

  /**
   * Get refresher status for diagnostics
   */
  getStatus(): {
    isRunning: boolean;
    lastRunTime: Date | null;
    runCount: number;
    isScheduled: boolean;
  } {
    return {
      isRunning: this.isRunning,
      lastRunTime: this.lastRunTime,
      runCount: this.runCount,
      isScheduled: this.task !== null,
    };
  }

  /**
   * Force an immediate refresh cycle (for testing/debugging)
   */
  async forceRefresh(): Promise<void> {
    console.log('[RTB-Refresher] Forcing immediate refresh cycle');
    await this.runRefreshCycle();
  }
}

export const rtbQueueRefresher = new RTBQueueRefresher();
