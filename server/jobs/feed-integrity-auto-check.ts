import cron from 'node-cron';
import { getFeedIntegrityMonitor } from '../services/feed-integrity-monitor';
import { AlertsService } from '../services/alerts-service';
// Directive 12.2.3: walter-ops-engine import removed (file deleted in Batch 6)
import { storage } from '../storage';
import { tradingStateSync } from '../services/trading-state-sync';
import { clusterBus } from '../services/cluster-bus';
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
    // PHASE 27.F.21.FINAL: Global Gating - Skip ALL checks if trading is inactive
    // Phase 27.F.13.O: Check global engine state (paper and live) instead of per-user
    const [paperActive, liveActive] = await Promise.all([
      tradingStateSync.isEngineActive('paper'),
      tradingStateSync.isEngineActive('live')
    ]);
    const anyTradingActive = paperActive || liveActive;
    
    if (!anyTradingActive) {
      const skipReason = trigger === 'auto' 
        ? 'Auto-check skipped: trading inactive (no active stream to monitor)'
        : 'Manual check skipped: trading inactive (no active stream exists)';
      
      console.log(`[FeedIntegrity:${trigger}] ⏸️  ${skipReason}`);
      
      // PHASE 27.F.21.FINAL: Return dormant report with perfect grade 'A'
      // This excludes dormant periods from feed health grading - when trading is stopped,
      // there's no stream to monitor, so degraded metrics don't reflect actual system health.
      // Grade calculations only consider active trading sessions.
      const dormantReport: FeedHealthReport = {
        timestamp: new Date().toISOString(),
        overallGrade: 'A',
        metrics: {
          feedType: 'websocket',
          latencyMs: 0,
          stalenessSec: 0,
          uptimePercent: 100,
          pairCount: 0,
          errorRate: 0,
          reconnectCount: 0,
          tickAgeSec: 0,
          status: 'healthy',
          lastUpdateISO: new Date().toISOString(),
        },
        issues: [],
        summary: ['Feed monitoring paused - trading inactive'],
      };
      
      const duration = Date.now() - startTime;
      return {
        ...dormantReport,
        duration,
        reportPath: '/tmp/feed_health_dormant.json',
      };
    }
    
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
      // Directive 12.2.3: Walter auto-resolve recording removed (Batch 6)
      monitor.updateAlertState(metrics.status, overallGrade, null);
    }
    
    // Handle new alerts (warnings/critical) with deduplication
    const shouldAlert = monitor.shouldSendAlert(metrics.status, overallGrade);
    
    if (shouldAlert) {
      if (metrics.status !== 'healthy') {
        // PHASE 27.F.21: Check if trading is inactive (dormant mode)
        // Phase 27.F.13.O: Check global engine state (paper and live) instead of per-user
        const users = await storage.getAllUsers();
        const [paperActive, liveActive] = await Promise.all([
          tradingStateSync.isEngineActive('paper'),
          tradingStateSync.isEngineActive('live')
        ]);
        const anyTradingActive = paperActive || liveActive;
        const isDormantMode = !anyTradingActive;
        
        // Create new alert for all admin users (warning or critical)
        const severity = metrics.status === 'critical' ? 'critical' : 'warning';
        const dormantPrefix = isDormantMode ? '[DORMANT] ' : '';
        const message = `${dormantPrefix}Feed Health: ${metrics.status.toUpperCase()} (Grade ${overallGrade})\n${report.issues.join('\n')}`;
        
        if (isDormantMode) {
          console.log(`[FeedIntegrity] 🔇 Dormant mode detected: Suppressing dashboard alerts (trading inactive)`);
        } else {
          console.log(`[FeedIntegrity] Creating ${severity} alert for admin users`);
        }
        
        // Get all admin users
        const adminUsers = users.filter(u => u.isAdmin);
        
        // PHASE 27.F.21: Dormant Mode Handling
        // In dormant mode: Skip user-facing alerts (trading inactive, no active stream to monitor)
        // Directive 12.2.3: Walter anomaly object and dormant logging removed (Batch 6)
        if (isDormantMode) {
          console.log(`[FeedIntegrity-Alert] Dormant mode: Suppressing user-facing alerts (trading inactive)`);
        } else {
          // Active Mode: Create user-facing alerts
          console.log(`[FeedIntegrity-Alert] Active mode: Creating user-facing alerts`);
          
          const alertCategory = severity === 'critical' ? 'critical' : 'actionable';
          
          for (const admin of adminUsers) {
            await AlertsService.createAlert({
              userId: admin.id,
              mode: 'live',
              alertType: 'feed_health',
              severity,
              category: alertCategory,
              message,
              metadata: {
                grade: overallGrade,
                latencyMs: metrics.latencyMs,
                uptimePercent: metrics.uptimePercent,
                reconnectCount: metrics.reconnectCount,
                tickAgeSec: metrics.tickAgeSec,
                feedType: metrics.feedType,
                trigger,
                dormant: false,
              },
            });
            
            await AlertsService.createAlert({
              userId: admin.id,
              mode: 'paper',
              alertType: 'feed_health',
              severity,
              category: alertCategory,
              message,
              metadata: {
                grade: overallGrade,
                latencyMs: metrics.latencyMs,
                uptimePercent: metrics.uptimePercent,
                reconnectCount: metrics.reconnectCount,
                tickAgeSec: metrics.tickAgeSec,
                feedType: metrics.feedType,
                trigger,
                dormant: false,
              },
            });
          }
          
          // Directive 12.2.3: Walter active anomaly processing removed (Batch 6)
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
    }
  );
  
  isEnabled = true;
  console.log('[FeedIntegrity] ✅ Auto-check enabled');
  
  // PHASE 27.F.21: Listen for engine state changes to clear alerts when trading stops
  clusterBus.on('engine_state_changed', async (data: any) => {
    console.log(`[FeedIntegrity][EventListener] 🎧 engine_state_changed event received:`, data);
    const { userId, isActive } = data;
    
    // When trading stops (isActive = false), clear feed-health alerts
    if (isActive === false) {
      console.log(`[FeedIntegrity] 🔇 Trading stopped for user ${userId} - triggering auto-clear of feed-health alerts`);
      await clearFeedHealthAlertsOnStop(userId);
    } else {
      console.log(`[FeedIntegrity] Trading started for user ${userId} (isActive=${isActive}) - no action needed`);
    }
  });
  
  console.log('[FeedIntegrity] ✅ Engine state change listener registered');
  
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

/**
 * PHASE 27.F.21.FINAL: Clear feed-health alerts on trading stop
 * Called when trading mode transitions to inactive
 * 
 * Enhanced to:
 * - Clear only feed-related alerts
 * - Broadcast state update via context bridge
 * 
 * @param userId - User ID to clear alerts for
 */
export async function clearFeedHealthAlertsOnStop(userId: string): Promise<void> {
  try {
    console.log(`[FeedIntegrity] 🔇 Auto-clearing feed-health alerts for user ${userId} (trading stopped)`);
    
    // Use efficient service method to acknowledge all feed-health alerts at once
    const clearedAlerts = await AlertsService.acknowledgeFeedHealthAlerts(userId);
    const totalCleared = clearedAlerts.length;
    
    if (totalCleared > 0) {
      // Count by mode
      const liveFeedAlerts = clearedAlerts.filter(a => a.mode === 'live');
      const paperFeedAlerts = clearedAlerts.filter(a => a.mode === 'paper');
      
      console.log(`[FeedIntegrity] ✅ Cleared ${totalCleared} feed-health alerts (${liveFeedAlerts.length} live, ${paperFeedAlerts.length} paper)`);
      
      // Directive 12.2.3: Walter action logging removed (Batch 6)
      
      // Broadcast state update to refresh UI
      try {
        const { contextBridge } = await import('../services/context-bridge');
        await contextBridge.broadcast({
          type: 'state_update',
          payload: { 
            alerts_cleared: totalCleared, 
            reason: 'trading_stopped',
            timestamp: new Date().toISOString()
          },
          userId
        });
        console.log(`[FeedIntegrity] ✅ Alerts cleared event broadcast to UI`);
      } catch (broadcastError) {
        console.error(`[FeedIntegrity] Failed to broadcast alerts cleared event:`, broadcastError);
      }
    } else {
      console.log(`[FeedIntegrity] No feed-health alerts to clear for user ${userId}`);
    }
    
    console.log(`[FeedIntegrity] Feed monitoring paused - trading inactive (no active stream to monitor)`);
  } catch (error) {
    console.error(`[FeedIntegrity] Failed to clear feed-health alerts for user ${userId}:`, error);
  }
}
