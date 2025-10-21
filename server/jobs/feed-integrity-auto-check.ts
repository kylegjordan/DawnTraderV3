import cron from 'node-cron';
import { getFeedIntegrityMonitor } from '../services/feed-integrity-monitor';
import { AlertsService } from '../services/alerts-service';
import { WalterOpsEngine, type AnomalyInput } from '../services/walter-ops-engine';
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
    
    // Check if feed recovered to healthy (auto-resolve independent of alert throttling)
    if (metrics.status === 'healthy' && monitor.getActiveAlertId()) {
      console.log(`[FeedIntegrity] Feed recovered - auto-resolving incident`);
      
      // Get all admin users to record auto-resolution
      const users = await storage.getAllUsers();
      const adminUsers = users.filter(u => u.isAdmin);
      
      if (adminUsers.length > 0) {
          const primaryAdmin = adminUsers[0];
          
          // Create auto-resolution records for both modes
          try {
            await WalterOpsEngine.autoResolveIncident(
              primaryAdmin.id,
              'live',
              'feed',
              'Kraken WebSocket',
              {
                previousIssue: `Feed health degraded (Grade ${monitor.getActiveAlertId()})`,
                normalizedMetrics: {
                  latency_ms: metrics.latencyMs,
                  tick_age_sec: metrics.tickAgeSec,
                  reconnect_count: metrics.reconnectCount,
                  uptime_percent: metrics.uptimePercent,
                  grade: overallGrade,
                },
                confidence: metrics.latencyMs < 1000 && metrics.reconnectCount === 0 ? 95 : 80,
                timestamp: new Date(),
              }
            );
            console.log(`[FeedIntegrity] ✅ Live auto-resolution recorded`);
          } catch (error) {
            console.error(`[FeedIntegrity] Failed to record live auto-resolution:`, error);
          }
          
          try {
            await WalterOpsEngine.autoResolveIncident(
              primaryAdmin.id,
              'paper',
              'feed',
              'Kraken WebSocket',
              {
                previousIssue: `Feed health degraded (Grade ${monitor.getActiveAlertId()})`,
                normalizedMetrics: {
                  latency_ms: metrics.latencyMs,
                  tick_age_sec: metrics.tickAgeSec,
                  reconnect_count: metrics.reconnectCount,
                  uptime_percent: metrics.uptimePercent,
                  grade: overallGrade,
                },
                confidence: metrics.latencyMs < 1000 && metrics.reconnectCount === 0 ? 95 : 80,
                timestamp: new Date(),
              }
            );
            console.log(`[FeedIntegrity] ✅ Paper auto-resolution recorded`);
          } catch (error) {
            console.error(`[FeedIntegrity] Failed to record paper auto-resolution:`, error);
          }
        }
        
      monitor.updateAlertState(metrics.status, overallGrade, null);
    }
    
    // Handle new alerts (warnings/critical) with deduplication
    const shouldAlert = monitor.shouldSendAlert(metrics.status, overallGrade);
    
    if (shouldAlert) {
      if (metrics.status !== 'healthy') {
        // Create new alert for all admin users (warning or critical)
        const severity = metrics.status === 'critical' ? 'critical' : 'warning';
        const message = `Feed Health: ${metrics.status.toUpperCase()} (Grade ${overallGrade})\n${report.issues.join('\n')}`;
        
        console.log(`[FeedIntegrity] Creating ${severity} alert for admin users + triggering Walter autonomous maintenance`);
        
        // Get all admin users
        const users = await storage.getAllUsers();
        const adminUsers = users.filter(u => u.isAdmin);
        
        // Prepare anomaly for Walter autonomous maintenance (global system-level)
        const anomaly: AnomalyInput = {
          source: 'feed',
          component: 'Kraken WebSocket',
          anomaly: message,
          metrics: {
            latency_ms: metrics.latencyMs,
            deviation_percent: undefined,
            reconnect_count: metrics.reconnectCount,
            tick_age_sec: metrics.tickAgeSec,
            uptime_percent: metrics.uptimePercent,
          },
          severity,
        };
        
        // Create alerts for each admin user (existing AlertsService flow)
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
        
        // NEW: Trigger Walter autonomous maintenance ONCE per mode (feed ops are global, not per-user)
        // Use first admin as representative user for action tracking
        if (adminUsers.length > 0) {
          const primaryAdmin = adminUsers[0];
          
          try {
            console.log(`[WalterOps-FeedIntegrity] Processing global feed anomaly (live mode)`);
            const liveAction = await WalterOpsEngine.processAnomaly(primaryAdmin.id, 'live', anomaly);
            console.log(`[WalterOps-FeedIntegrity] Live action result: ${liveAction.action_type} - ${liveAction.status}`);
          } catch (walterError) {
            console.error(`[WalterOps-FeedIntegrity] Failed to process live anomaly:`, walterError);
          }
          
          try {
            console.log(`[WalterOps-FeedIntegrity] Processing global feed anomaly (paper mode)`);
            const paperAction = await WalterOpsEngine.processAnomaly(primaryAdmin.id, 'paper', anomaly);
            console.log(`[WalterOps-FeedIntegrity] Paper action result: ${paperAction.action_type} - ${paperAction.status}`);
          } catch (walterError) {
            console.error(`[WalterOps-FeedIntegrity] Failed to process paper anomaly:`, walterError);
          }
        }
        
        monitor.updateAlertState(metrics.status, overallGrade, null);
      } else {
        console.log(`[FeedIntegrity] Feed healthy, no action needed`);
      }
    } else if (metrics.status !== 'healthy') {
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
