// server/services/screener-recalibration-task.ts
// Automated screener recalibration based on paper mode results

import { storage } from '../storage';
import { ScheduledTask } from './scheduler-registry';

export class ScreenerRecalibrationTask implements Omit<ScheduledTask, 'lastRun' | 'nextRun' | 'status'> {
  name = 'Screener Recalibration';
  description = 'Analyzes recent paper-mode results and adjusts filter thresholds';
  frequency = 'Every 4 hours';
  intervalMs = 4 * 60 * 60 * 1000; // 4 hours

  async run(): Promise<void> {
    console.log('[ScreenerRecalibration] Starting recalibration task...');

    try {
      // Get all users
      const users = await storage.getAllUsers();

      for (const user of users) {
        await this.recalibrateForUser(user.id);
      }

      console.log('[ScreenerRecalibration] Recalibration complete');
    } catch (error) {
      console.error('[ScreenerRecalibration] Error during recalibration:', error);
      throw error;
    }
  }

  private async recalibrateForUser(userId: string): Promise<void> {
    try {
      // Get latest calibration to avoid duplicates
      const latestCalibration = await storage.getLatestCalibration({
        mode: 'paper',
        maxAgeHours: 4
      });

      // Skip if already calibrated in the last 4 hours
      if (latestCalibration) {
        console.log(`[ScreenerRecalibration] User ${userId} already calibrated recently, skipping`);
        return;
      }

      // Get recent paper trades for analysis
      const paperTrades = await storage.getAllPaperTrades(userId);
      
      if (paperTrades.length === 0) {
        console.log(`[ScreenerRecalibration] No paper trades for user ${userId}, skipping`);
        return;
      }

      // Analyze trade outcomes
      const winRate = this.calculateWinRate(paperTrades);
      const avgProfit = this.calculateAvgProfit(paperTrades);

      // Phase 27.F.13.M: Get global screener filters (mode-only, no userId)
      const currentFilters = await storage.getScreenerFilters({ mode: 'paper' });
      
      if (!currentFilters) {
        console.log(`[ScreenerRecalibration] No screener filters for user ${userId}, skipping`);
        return;
      }

      // Determine if adjustment is needed
      let adjustmentNeeded = false;
      let adjustmentReason = '';

      if (winRate < 0.4) {
        adjustmentNeeded = true;
        adjustmentReason = `Low win rate (${(winRate * 100).toFixed(1)}%), tightening filters`;
      } else if (winRate > 0.6 && avgProfit > 0) {
        adjustmentNeeded = true;
        adjustmentReason = `High win rate (${(winRate * 100).toFixed(1)}%), loosening filters for more opportunities`;
      }

      if (adjustmentNeeded) {
        // Adjust filters based on performance
        const adjustments: any = {
          userId,
          mode: 'paper' as const,
          reason: adjustmentReason,
          source: 'auto_recalibration'
        };

        // Tighten or loosen filters based on win rate
        if (winRate < 0.4 && currentFilters.minVolume) {
          // Tighten: increase minimum volume requirement
          adjustments.minVolume = (parseFloat(currentFilters.minVolume) * 1.2).toString();
        } else if (winRate > 0.6 && currentFilters.minVolume) {
          // Loosen: decrease minimum volume requirement
          adjustments.minVolume = (parseFloat(currentFilters.minVolume) * 0.9).toString();
        }

        // Create calibration log entry
        await storage.createCalibration(adjustments);

        console.log(`[ScreenerRecalibration] Created calibration for user ${userId}: ${adjustmentReason}`);
      }
    } catch (error) {
      console.error(`[ScreenerRecalibration] Error calibrating for user ${userId}:`, error);
    }
  }

  private calculateWinRate(trades: any[]): number {
    const closedTrades = trades.filter(t => t.status === 'closed');
    if (closedTrades.length === 0) return 0;
    
    const winningTrades = closedTrades.filter(t => 
      t.exitPrice && t.entryPrice && t.exitPrice > t.entryPrice
    );
    
    return winningTrades.length / closedTrades.length;
  }

  private calculateAvgProfit(trades: any[]): number {
    const closedTrades = trades.filter(t => 
      t.status === 'closed' && t.exitPrice && t.entryPrice
    );
    
    if (closedTrades.length === 0) return 0;
    
    const totalProfit = closedTrades.reduce((sum, t) => {
      const profit = ((t.exitPrice - t.entryPrice) / t.entryPrice) * 100;
      return sum + profit;
    }, 0);
    
    return totalProfit / closedTrades.length;
  }
}

export const screenerRecalibrationTask = new ScreenerRecalibrationTask();
