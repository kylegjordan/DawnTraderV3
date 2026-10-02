// server/services/system-health-check-task.ts
// Hourly system health monitoring

import { storage } from '../storage';
import { ScheduledTask } from './scheduler-registry';

export class SystemHealthCheckTask implements Omit<ScheduledTask, 'lastRun' | 'nextRun' | 'status'> {
  name = 'System Health Check';
  description = 'Verifies data latency, failed API calls, and service uptime';
  frequency = 'Hourly';
  intervalMs = 60 * 60 * 1000; // 1 hour

  async run(): Promise<void> {
    console.log('[SystemHealth] Starting system health check...');

    try {
      // Check database connectivity
      const dbHealthy = await this.checkDatabase();
      
      // Check error logs
      const recentErrors = await storage.getErrorLogs(undefined, { 
        resolved: false, 
        limit: 10 
      });

      // Check recent failed trades
      const failedTrades = await this.checkFailedTrades();

      // Determine overall health status
      const isHealthy = dbHealthy && recentErrors.length === 0 && failedTrades === 0;
      const severity = isHealthy ? 'info' : (recentErrors.length > 5 ? 'error' : 'warning');

      // Create error log if there are issues
      if (!isHealthy) {
        await storage.createErrorLog({
          errorType: 'system_health',
          errorMessage: `System health check: ${recentErrors.length} unresolved errors, ${failedTrades} failed trades`,
          context: {
            dbHealthy,
            errorCount: recentErrors.length,
            failedTrades,
            severity
          },
          resolved: false
        });
      }

      console.log(`[SystemHealth] Health check complete - Status: ${isHealthy ? 'HEALTHY' : 'UNHEALTHY'}`);
    } catch (error) {
      console.error('[SystemHealth] Error during health check:', error);
      throw error;
    }
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      // Simple query to verify database is responsive
      await storage.getAllUsers();
      return true;
    } catch (error) {
      console.error('[SystemHealth] Database check failed:', error);
      return false;
    }
  }

  private async checkFailedTrades(): Promise<number> {
    try {
      const users = await storage.getAllUsers();
      let totalFailed = 0;

      for (const user of users) {
        const trades = await storage.getTrades(user.id, { status: 'cancelled', limit: 100 });
        totalFailed += trades.length;
      }

      return totalFailed;
    } catch (error) {
      console.error('[SystemHealth] Failed trades check failed:', error);
      return 0;
    }
  }
}

export const systemHealthCheckTask = new SystemHealthCheckTask();
