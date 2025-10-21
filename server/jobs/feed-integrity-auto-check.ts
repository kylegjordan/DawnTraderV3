import cron from 'node-cron';
import { getFeedIntegrityMonitor } from '../services/feed-integrity-monitor';
import { AlertsService } from '../services/alerts-service';
import { storage } from '../storage';
import type { FeedHealthReport } from '../services/feed-integrity-monitor';

/**
 * Feed Integrity Auto-Check Job
 * Runs every 5 minutes to monitor Kraken feed health
 * Features: Deduplication, alert cooldown, auto-resolution on recovery
 */

let job: cron.ScheduledTask | null = null;
let isEnabled = false;

/**
 * Run feed integrity check (automated or manual)
 * 
 * @param trigger - 'auto' for scheduled, 'manual' for admin-triggered
 * @returns Feed health report with execution metadata
 */
export async function runFeedIntegrityCheck(trigger: 'auto' | 'manual'): Promise<FeedHealthReport & { duration: number; reportPath: string }> {
  const startTime = Date.now();
  const monitor = getFeedIntegrityMonitor();
  
  console.log(`[FeedIntegrity:${trigger}] Starting feed health check...`);
  
  try {
    // Record health snapshot
    monitor.recordSnapshot();
    
    // Generate report
    const report = monitor.generateReport();
    
    // Save report to file (with date in filename)
    const dateStr = new Date().toISOString().split('T')[0];
    const reportPath = `/tmp/feed_health_${dateStr}.json`;
    monitor.saveReport(report, reportPath);
    
    // Handle alerting with deduplication
    const { metrics, overallGrade } = report;
    const shouldAlert = monitor.shouldSendAlert(metrics.status, overallGrade);
    
    if (shouldAlert) {
      if (metrics.status === 'healthy') {
        // Clear active alert (feed recovered)
        console.log(`[FeedIntegrity] Feed recovered - clearing alert tracking`);
        monitor.updateAlertState(metrics.status, overallGrade, null);
      } else {
        // Create new alert for all admin users (warning or critical)
        const severity = metrics.status === 'critical' ? 'critical' : 'warning';
        const message = `Feed Health: ${metrics.status.toUpperCase()} (Grade ${overallGrade})\n${report.issues.join('\n')}`;
        
        console.log(`[FeedIntegrity] Creating ${severity} alert for admin users`);
        
        // Get all admin users
        const users = await storage.getAllUsers();
        const adminUsers = users.filter(u => u.isAdmin);
        
        // Create alert for each admin user (both modes)
        for (const admin of adminUsers) {
          await AlertsService.createAlert({
            userId: admin.id,
            mode: 'live',
            alertType: 'feed_health',
            severity,
            category: severity === 'critical' ? 'critical' : 'actionable',
            message,
            metadata: {
              grade: overallGrade,
              latencyMs: metrics.latencyMs,
              uptimePercent: metrics.uptimePercent,
              reconnectCount: metrics.reconnectCount,
              tickAgeSec: metrics.tickAgeSec,
              feedType: metrics.feedType,
              trigger,
            },
          });
          
          await AlertsService.createAlert({
            userId: admin.id,
            mode: 'paper',
            alertType: 'feed_health',
            severity,
            category: severity === 'critical' ? 'critical' : 'actionable',
            message,
            metadata: {
              grade: overallGrade,
              latencyMs: metrics.latencyMs,
              uptimePercent: metrics.uptimePercent,
              reconnectCount: metrics.reconnectCount,
              tickAgeSec: metrics.tickAgeSec,
              feedType: metrics.feedType,
              trigger,
            },
          });
        }
        
        monitor.updateAlertState(metrics.status, overallGrade, null);
      }
    } else {
      console.log(`[FeedIntegrity] Alert suppressed (cooldown or duplicate)`);
    }
    
    const duration = Date.now() - startTime;
    
    console.log(`[FeedIntegrity:${trigger}] ✅ Check complete in ${duration}ms - Grade: ${overallGrade}, Status: ${metrics.status}`);
    console.log(`[FeedIntegrity:${trigger}] Metrics: Latency=${metrics.latencyMs}ms, Uptime=${metrics.uptimePercent}%, Reconnects=${metrics.reconnectCount}, TickAge=${metrics.tickAgeSec}s`);
    
    return {
      ...report,
      duration,
      reportPath,
    };
  } catch (error: any) {
    console.error(`[FeedIntegrity:${trigger}] ❌ Check failed:`, error);
    
    // Create critical alert for check failure for all admin users
    try {
      const users = await storage.getAllUsers();
      const adminUsers = users.filter(u => u.isAdmin);
      
      for (const admin of adminUsers) {
        await AlertsService.createAlert({
          userId: admin.id,
          mode: 'live',
          alertType: 'feed_health',
          severity: 'critical',
          category: 'critical',
          message: `Feed Health Check Failed: ${error.message}`,
          metadata: { error: error.message, trigger },
        });
        
        await AlertsService.createAlert({
          userId: admin.id,
          mode: 'paper',
          alertType: 'feed_health',
          severity: 'critical',
          category: 'critical',
          message: `Feed Health Check Failed: ${error.message}`,
          metadata: { error: error.message, trigger },
        });
      }
    } catch (alertError) {
      console.error(`[FeedIntegrity] Failed to create alert:`, alertError);
    }
    
    throw error;
  }
}

/**
 * Initialize feed integrity auto-check job
 * Runs every 5 minutes with configurable cron schedule
 */
export function initFeedIntegrityAutoCheck() {
  // Check if disabled via env
  if (process.env.DISABLE_FEED_INTEGRITY_CHECK === 'true') {
    console.log('[FeedIntegrity] Auto-check DISABLED via env');
    return;
  }
  
  if (isEnabled) {
    console.log('[FeedIntegrity] Auto-check already enabled');
    return;
  }
  
  // Get cron schedule from env (default: every 5 minutes with jitter)
  const cronSchedule = process.env.FEED_INTEGRITY_CRON || '*/5 * * * *';
  
  console.log(`[FeedIntegrity] Initializing auto-check with schedule: ${cronSchedule}`);
  
  // Schedule job with timezone enforcement
  job = cron.schedule(
    cronSchedule,
    async () => {
      // Add jitter (0-30 seconds) to avoid thundering herd
      const jitter = Math.floor(Math.random() * 30 * 1000);
      
      console.log(`[FeedIntegrity] Waiting ${jitter}ms jitter before check...`);
      await new Promise(resolve => setTimeout(resolve, jitter));
      
      try {
        await runFeedIntegrityCheck('auto');
      } catch (error) {
        console.error('[FeedIntegrity] Scheduled check failed:', error);
      }
    },
    {
      timezone: 'UTC',
      scheduled: true,
    }
  );
  
  isEnabled = true;
  console.log('[FeedIntegrity] ✅ Auto-check enabled');
  
  // Run initial check after 30 seconds
  setTimeout(async () => {
    console.log('[FeedIntegrity] Running initial check...');
    try {
      await runFeedIntegrityCheck('auto');
    } catch (error) {
      console.error('[FeedIntegrity] Initial check failed:', error);
    }
  }, 30000);
}

/**
 * Stop feed integrity auto-check
 */
export function stopFeedIntegrityAutoCheck() {
  if (job) {
    job.stop();
    job = null;
    isEnabled = false;
    console.log('[FeedIntegrity] Auto-check stopped');
  }
}

/**
 * Check if feed integrity auto-check is enabled
 */
export function isFeedIntegrityAutoCheckEnabled(): boolean {
  return isEnabled;
}

// Alias for backward compatibility
export function registerFeedIntegrityJob() {
  initFeedIntegrityAutoCheck();
}
