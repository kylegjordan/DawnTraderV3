// server/services/market-scan-task.ts
// Automated market scanning for both Paper and Live modes

import { storage } from '../storage';
import { ScheduledTask } from './scheduler-registry';

export class MarketScanTask implements Omit<ScheduledTask, 'lastRun' | 'nextRun' | 'status'> {
  name = 'Market Scan';
  description = 'Runs screening for both Paper and Live modes to identify trading opportunities';
  frequency = 'Every 10 minutes';
  intervalMs = 10 * 60 * 1000; // 10 minutes

  async run(): Promise<void> {
    console.log('[MarketScan] Starting market scan task...');

    try {
      // Get all users
      const users = await storage.getAllUsers();
      let totalScanned = 0;

      for (const user of users) {
        // Scan for both modes
        for (const mode of ['live', 'paper'] as const) {
          const scanned = await this.scanForUser(user.id, mode);
          totalScanned += scanned;
        }
      }

      console.log(`[MarketScan] Market scan complete - scanned ${totalScanned} total opportunities`);
    } catch (error) {
      console.error('[MarketScan] Error during market scan:', error);
      throw error;
    }
  }

  private async scanForUser(userId: string, mode: 'live' | 'paper'): Promise<number> {
    try {
      console.log(`[MarketScan] Scanning ${mode} mode for user ${userId}...`);
      
      const results = await storage.getScreenerResults({ userId, mode, limit: 100 });
      
      console.log(`[MarketScan] Found ${results.length} eligible pairs for user ${userId} (${mode} mode)`);
      return results.length;
    } catch (error) {
      console.error(`[MarketScan] Error scanning for user ${userId} (${mode} mode):`, error);
      return 0;
    }
  }
}

export const marketScanTask = new MarketScanTask();
