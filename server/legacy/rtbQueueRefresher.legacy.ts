/**
 * Legacy RTB Queue Refresher
 * Deprecated under Directive 8.8.4-C.6
 * Replaced by integrated 30-second refresh cycle in ReadyToBuyService
 * Phase 8.8.4-C.5
 * 
 * Original File: server/core/rtb/rtb_queue_refresher.ts
 * Deprecation Date: 2025-12-15
 * 
 * DO NOT USE - This file is archived for reference only.
 * The RTB refresh functionality is now handled by:
 * - ReadyToBuyService.startRefreshCycle() 
 * - ReadyToBuyService.stopRefreshCycle()
 * - ReadyToBuyService.executeRefreshCycle()
 * 
 * These are wired into the PaperExecutionEngine lifecycle.
 */

import cron, { type ScheduledTask } from 'node-cron';
import { readyToBuyService, type RTBQueueStats } from '../core/rtb/ready_to_buy_service';
import type { TradingMode } from '../services/guardrail-policy';

const REFRESH_INTERVAL_CRON = '*/30 * * * * *'; // Every 30 seconds

class RTBQueueRefresher {
  private task: ScheduledTask | null = null;
  private isRunning = false;
  private lastRunTime: Date | null = null;
  private runCount = 0;

  constructor() {
    console.log('[RTB-Refresher][LEGACY] RTB Queue Refresher initialized (DEPRECATED)');
  }

  /**
   * @deprecated Use ReadyToBuyService.startRefreshCycle() instead
   */
  start(): void {
    console.warn('[RTB-Refresher][DEPRECATED] This refresher is deprecated. Use ReadyToBuyService.startRefreshCycle() instead.');
    // No-op - deprecated
  }

  /**
   * @deprecated Use ReadyToBuyService.stopRefreshCycle() instead
   */
  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
      console.log('[RTB-Refresher][LEGACY] Stopped (DEPRECATED)');
    }
  }

  /**
   * @deprecated Refresh is now handled by ReadyToBuyService
   */
  async runRefreshCycle(): Promise<void> {
    console.warn('[RTB-Refresher][DEPRECATED] runRefreshCycle is deprecated');
  }

  private async refreshMode(mode: TradingMode): Promise<{
    expiredCount: number;
    removedCount: number;
    stats: RTBQueueStats;
  }> {
    const expiredCount = await readyToBuyService.cleanupExpiredSignals(mode);
    const { removed: removedCount } = await readyToBuyService.reEvaluateQueue(mode);
    const stats = await readyToBuyService.getQueueStats(mode);
    return { expiredCount, removedCount, stats };
  }

  getStatus(): {
    isRunning: boolean;
    lastRunTime: Date | null;
    runCount: number;
    isScheduled: boolean;
    deprecated: boolean;
  } {
    return {
      isRunning: this.isRunning,
      lastRunTime: this.lastRunTime,
      runCount: this.runCount,
      isScheduled: this.task !== null,
      deprecated: true,
    };
  }

  /**
   * @deprecated Use ReadyToBuyService directly
   */
  async forceRefresh(): Promise<void> {
    console.warn('[RTB-Refresher][DEPRECATED] forceRefresh is deprecated. RTB refresh is now handled by ReadyToBuyService.');
  }
}

export const rtbQueueRefresher = new RTBQueueRefresher();
