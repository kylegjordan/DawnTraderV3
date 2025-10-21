import cron from 'node-cron';
import { getFeedIntegrityMonitor } from '../services/feed-integrity-monitor';
import { AlertsService } from '../services/alerts-service';
import { WalterOpsEngine, type AnomalyInput } from '../services/walter-ops-engine';
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
    // Check if any user has active trading (live or paper)
    const users = await storage.getAllUsers();
    const anyTradingActive = await Promise.all(
      users.map(u => tradingStateSync.isEngineActive(u.id))
    ).then(results => results.some(active => active));
    
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
        // PHASE 27.F.21: Check if trading is inactive (dormant mode)
        const users = await storage.getAllUsers();
        const tradingActiveStates = await Promise.all(
          users.map(u => tradingStateSync.isEngineActive(u.id))
        );
        const anyTradingActive = tradingActiveStates.some(active => active);
        const isDormantMode = !anyTradingActive;
        
        // Create new alert for all admin users (warning or critical)
        const severity = metrics.status === 'critical' ? 'critical' : 'warning';
        const dormantPrefix = isDormantMode ? '[DORMANT] ' : '';
        const message = `${dormantPrefix}Feed Health: ${metrics.status.toUpperCase()} (Grade ${overallGrade})\n${report.issues.join('\n')}`;
        
        if (isDormantMode) {
          console.log(`[FeedIntegrity] 🔇 Dormant mode detected: Suppressing dashboard alerts (trading inactive)`);
        } else {
          console.log(`[FeedIntegrity] Creating ${severity} alert for admin users + triggering Walter autonomous maintenance`);
        }
        
        // Get all admin users
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
        
        // PHASE 27.F.21: Dormant Mode Handling
        // In dormant mode: Skip user-facing alerts but still log to Walter's action system
        if (isDormantMode) {
          console.log(`[FeedIntegrity-Alert] Dormant mode: Suppressing user-facing alerts, logging to Walter only`);
          
          // Log to Walter's action system for both modes (silent logging)
          if (adminUsers.length > 0) {
            const primaryAdmin = adminUsers[0];
            
            // Tag anomaly with dormant flag
            const dormantAnomaly = {
              ...anomaly,
              metadata: {
                ...anomaly.metadata,
                isDormant: true,
                suppressReason: 'Trading inactive - no active stream to monitor',
              }
            };
            
            try {
              console.log(`[WalterOps-FeedIntegrity] Dormant mode: Logging to Walter (live) without user alert`);
              const liveAction = await WalterOpsEngine.processAnomaly(primaryAdmin.id, 'live', dormantAnomaly);
              console.log(`[WalterOps-FeedIntegrity] Live action logged: ${liveAction.actionType} - ${liveAction.status}`);
            } catch (walterError) {
              console.error(`[WalterOps-FeedIntegrity] Failed to log dormant live anomaly:`, walterError);
            }
            
            try {
              console.log(`[WalterOps-FeedIntegrity] Dormant mode: Logging to Walter (paper) without user alert`);
              const paperAction = await WalterOpsEngine.processAnomaly(primaryAdmin.id, 'paper', dormantAnomaly);
              console.log(`[WalterOps-FeedIntegrity] Paper action logged: ${paperAction.actionType} - ${paperAction.status}`);
            } catch (walterError) {
              console.error(`[WalterOps-FeedIntegrity] Failed to log dormant paper anomaly:`, walterError);
            }
          }
        } else {
          // Active Mode: Create user-facing alerts AND process via Walter
          console.log(`[FeedIntegrity-Alert] Active mode: Creating user-facing alerts + Walter actions`);
          
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
          
          // Trigger Walter autonomous maintenance for active mode
          if (adminUsers.length > 0) {
            const primaryAdmin = adminUsers[0];
            
            try {
              console.log(`[WalterOps-FeedIntegrity] Processing global feed anomaly (live mode)`);
              const liveAction = await WalterOpsEngine.processAnomaly(primaryAdmin.id, 'live', anomaly);
              console.log(`[WalterOps-FeedIntegrity] Live action result: ${liveAction.actionType} - ${liveAction.status}`);
            } catch (walterError) {
              console.error(`[WalterOps-FeedIntegrity] Failed to process live anomaly:`, walterError);
            }
            
            try {
              console.log(`[WalterOps-FeedIntegrity] Processing global feed anomaly (paper mode)`);
              const paperAction = await WalterOpsEngine.processAnomaly(primaryAdmin.id, 'paper', anomaly);
              console.log(`[WalterOps-FeedIntegrity] Paper action result: ${paperAction.actionType} - ${paperAction.status}`);
            } catch (walterError) {
              console.error(`[WalterOps-FeedIntegrity] Failed to process paper anomaly:`, walterError);
            }
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
    }
  );
  
  isEnabled = true;
  console.log('[FeedIntegrity] ✅ Auto-check enabled');
  
  // PHASE 27.F.21: Listen for engine state changes to clear alerts when trading stops
  clusterBus.on('engine_state_changed', async (data: any) => {
    const { userId, isActive } = data;
    
    // When trading stops (isActive = false), clear feed-health alerts
    if (isActive === false) {
      console.log(`[FeedIntegrity] Trading stopped for user ${userId} - clearing feed-health alerts`);
      await clearFeedHealthAlertsOnStop(userId);
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
 * - Log to Walter for transparency
 * - Broadcast state update via context bridge
 * 
 * @param userId - User ID to clear alerts for
 */
export async function clearFeedHealthAlertsOnStop(userId: string): Promise<void> {
  try {
    console.log(`[FeedIntegrity] 🔇 Auto-clearing feed-health alerts for user ${userId} (trading stopped)`);
    
    // Get all unacknowledged feed-health alerts for this user
    const liveAlerts = await AlertsService.getUnacknowledgedAlerts(userId, 'live');
    const paperAlerts = await AlertsService.getUnacknowledgedAlerts(userId, 'paper');
    
    // Filter to feed-health alerts only
    const liveFeedAlerts = liveAlerts.filter(a => a.alertType === 'feed_health');
    const paperFeedAlerts = paperAlerts.filter(a => a.alertType === 'feed_health');
    
    let totalCleared = 0;
    
    // Acknowledge live mode feed alerts
    for (const alert of liveFeedAlerts) {
      await AlertsService.acknowledgeAlert(alert.id, userId);
      totalCleared++;
    }
    
    // Acknowledge paper mode feed alerts
    for (const alert of paperFeedAlerts) {
      await AlertsService.acknowledgeAlert(alert.id, userId);
      totalCleared++;
    }
    
    if (totalCleared > 0) {
      console.log(`[FeedIntegrity] ✅ Cleared ${totalCleared} feed-health alerts (${liveFeedAlerts.length} live, ${paperFeedAlerts.length} paper)`);
      
      // Create Walter action log entry for transparency (both modes)
      try {
        const logMessage = `Feed alerts cleared automatically on trading stop (${totalCleared} alerts cleared)`;
        
        await WalterOpsEngine.processAnomaly(userId, 'live', {
          source: 'feed',
          component: 'Feed Monitor',
          anomaly: logMessage,
          metrics: {
            alerts_cleared: totalCleared,
            live_alerts: liveFeedAlerts.length,
            paper_alerts: paperFeedAlerts.length,
          },
          severity: 'info',
          metadata: {
            action: 'auto_clear_on_stop',
            reason: 'Trading inactive - no active stream to monitor',
          }
        });
        
        console.log(`[FeedIntegrity] ✅ Walter action logged (live mode)`);
      } catch (walterError) {
        console.error(`[FeedIntegrity] Failed to log Walter action:`, walterError);
      }
    } else {
      console.log(`[FeedIntegrity] No feed-health alerts to clear for user ${userId}`);
    }
    
    console.log(`[FeedIntegrity] Feed monitoring paused - trading inactive (no active stream to monitor)`);
  } catch (error) {
    console.error(`[FeedIntegrity] Failed to clear feed-health alerts for user ${userId}:`, error);
  }
}
