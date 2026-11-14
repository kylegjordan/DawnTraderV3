import cron, { type ScheduledTask } from 'node-cron';
import { getFeedIntegrityMonitor } from '../services/feed-integrity-monitor';
import { AlertsService, formatCheckFailedMessage } from '../services/alerts-service';
import { tradingStateSync } from '../services/trading-state-sync';
import { clusterBus } from '../services/cluster-bus';
import type { FeedHealthReport, LivenessReading } from '../services/feed-integrity-monitor';
import { getXstockSession } from '../asset_classes/xstock_spot/time-of-day';
import { isInXstockWeekendClose } from '../asset_classes/xstock_spot/market-hours';
import { cronRegistry } from '../services/cron-registry.js';
import { logCronArm } from '../services/cron-arm-logger.js';
import { cronOccurrenceRunner } from '../services/cron-occurrence-runner.js';

/**
 * B-FEED-HEALTH-GRADE-ARM (#1123): the trading-session segment of an instant, for the per-cycle liveness line. New York time
 * through the xStock calendar (`getXstockSession` + `isInXstockWeekendClose`), so it follows daylight saving — the fixed UTC
 * bounds it replaced were valid only until 2026-11-01. The labels are unchanged: regular 09:30-16:00 ET, after_hours
 * 16:00-20:00, overnight 20:00-04:00, pre_market 04:00-09:30, weekend Fri 20:00 → Sun 20:00 ET.
 */
export function sessionSegment(d: Date): 'regular' | 'after_hours' | 'overnight' | 'pre_market' | 'weekend' {
  if (isInXstockWeekendClose(d)) return 'weekend';
  const seg = getXstockSession(d);
  return seg === 'regular' ? 'regular' : seg === 'after' ? 'after_hours' : seg === 'pre' ? 'pre_market' : 'overnight';
}

/**
 * B-FEED-HEALTH-GRADE-ARM (#1123, Langston Step-2 C3): one line per class per cycle. `threshold=absent` means NOT GRADED —
 * the grader returns `healthy` for a class with no DB threshold, and that must never print like a graded healthy (#546).
 */
export function formatLivenessLines(reading: LivenessReading | null, now: Date): string[] {
  const segment = sessionSegment(now);
  if (!reading) return [`[FeedIntegrity][liveness] not_graded=no_reading segment=${segment}`];
  if (reading.configMissing) return [`[FeedIntegrity][liveness] not_graded=config_missing segment=${segment}`];
  return reading.classes.map((c) =>
    `[FeedIntegrity][liveness] class=${c.assetClass} freshestAgeMs=${c.freshestAgeMs ?? 'none'} grade=${c.grade} ` +
    `threshold=${c.thresholdPresent ? 'present' : 'absent'} suppressed=${c.suppressed}` +
    `${c.suppressReason ? ` suppressReason=${c.suppressReason}` : ''} symbols=${c.symbolCount} segment=${segment}`);
}

/**
 * Feed Integrity Auto-Check Job
 * Runs every 5 minutes to monitor Kraken feed health
 * Features: Deduplication, alert cooldown, auto-resolution on recovery
 */

let job: ScheduledTask | null = null;
let isEnabled = false;
const JOB_NAME = 'feed_integrity_cron';

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
          uptimePercent: null, // not graded while dormant — never a fabricated 100 (#546)
          reconnectBasis: 'interval',
          ringSpanMs: null,
          ringSamples: 0,
          pairCount: 0,
          errorRate: 0,
          reconnectCount: 0,
          tickAgeSec: 0,
          livenessGrade: 'healthy',
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
    
    for (const line of formatLivenessLines(monitor.getLastLiveness(), new Date())) console.log(line);

    // B-FEED-HEALTH-GRADE-ARM (#1123): the CLEAR — on EVERY healthy cycle, not on a transition (Step 9 r3, Langston BLOCKER-2).
    // The transition read (`getLastStatus`) is in-memory and starts `healthy` on every restart, so the restart that ships a fix
    // and grades healthy at once would never acknowledge a persisted backlog. `acknowledgeFeedHealthAlerts` is idempotent (it
    // filters `acknowledged = false`), so a drained table returns nothing; the line prints only when it acknowledged >= 1. It
    // clears grade-path and check-failed rows alike (both mint alertType 'feed_health'). The verb is acknowledge:
    // `system_alerts` has no resolve state. The dead `getActiveAlertId()` branch that stood here is removed.
    // B-ALERT-INSERT-CONTRACT (#1255, P5): ONE call, for every user's rows (alerts are global per mode; the per-admin loop
    // with a `user_id` filter could never reach a row owned by a user who is not an admin — five live rows were stranded that
    // way). The call also CLOSES the episode (stamps `episodeClosedAt`), so the next recurrence re-raises.
    if (metrics.status === 'healthy') {
      const was = monitor.getLastStatus();
      const cleared = await AlertsService.acknowledgeFeedHealthAlerts();
      if (cleared.length > 0) {
        const live = cleared.filter((a) => a.mode === 'live').length;
        console.log(`[FeedIntegrity][CLEAR] healthy (recorded ${was}): closed ${cleared.length} feed alert episode row(s) (live ${live}, paper ${cleared.length - live})`);
      }
      if (was !== 'healthy') monitor.updateAlertState('healthy', overallGrade);
    }

    // Handle new alerts (warnings/critical) with deduplication
    const shouldAlert = monitor.shouldSendAlert(metrics.status, overallGrade);
    
    if (shouldAlert) {
      if (metrics.status !== 'healthy') {
        // PHASE 27.F.21: Check if trading is inactive (dormant mode)
        // Phase 27.F.13.O: Check global engine state (paper and live) instead of per-user
        const [paperActive, liveActive] = await Promise.all([
          tradingStateSync.isEngineActive('paper'),
          tradingStateSync.isEngineActive('live')
        ]);
        const anyTradingActive = paperActive || liveActive;
        const isDormantMode = !anyTradingActive;
        
        // Create the alert (warning or critical), one row per mode
        const severity = metrics.status === 'critical' ? 'critical' : 'warning';
        const dormantPrefix = isDormantMode ? '[DORMANT] ' : '';
        const message = `${dormantPrefix}Feed Health: ${metrics.status.toUpperCase()} (Grade ${overallGrade})\n${report.issues.join('\n')}`;
        
        if (isDormantMode) {
          console.log(`[FeedIntegrity] 🔇 Dormant mode detected: Suppressing dashboard alerts (trading inactive)`);
        } else {
          console.log(`[FeedIntegrity] Creating ${severity} alert`);
        }
        
        // PHASE 27.F.21: Dormant Mode Handling
        // In dormant mode: Skip user-facing alerts (trading inactive, no active stream to monitor)
        if (isDormantMode) {
          console.log(`[FeedIntegrity-Alert] Dormant mode: Suppressing user-facing alerts (trading inactive)`);
        } else {
          // Active Mode: Create user-facing alerts
          console.log(`[FeedIntegrity-Alert] Active mode: Creating user-facing alerts`);
          
          const alertCategory = severity === 'critical' ? 'critical' : 'actionable';
          
          // B-ALERT-INSERT-CONTRACT (#1255, P4): ONE write per mode under the deterministic alert owner. The per-admin loop
          // that stood here wrote the same row twice per mode; with two admins the second write collided on
          // unique_global_alert in the same second and aborted the check before updateAlertState below.
          const owner = await AlertsService.getAlertOwner();
          if (!owner) {
            console.warn(`[FeedIntegrity-Alert] No admin user to own the alert — not written`);
          } else {
            for (const mode of ['live', 'paper'] as const) {
              await AlertsService.createAlert({
                userId: owner.id,
                mode,
                alertType: 'feed_health',
                severity,
                category: alertCategory,
                message,
                metadata: {
                  grade: overallGrade,
                  latencyMs: metrics.latencyMs,
                  uptimePercent: metrics.uptimePercent ?? 'warming',
                  reconnectBasis: metrics.reconnectBasis,
                  ringSpanMs: metrics.ringSpanMs,
                  reconnectCount: metrics.reconnectCount,
                  tickAgeSec: metrics.tickAgeSec,
                  feedType: metrics.feedType,
                  trigger,
                  dormant: false,
                },
              });
            }
          }
        }
        
        monitor.updateAlertState(metrics.status, overallGrade);
      } else {
        console.log(`[FeedIntegrity] Feed healthy, no action needed`);
      }
    } else if (metrics.status !== 'healthy') {
      console.log(`[FeedIntegrity] Alert suppressed (cooldown or duplicate)`);
    }
    
    const duration = Date.now() - startTime;
    
    console.log(`[FeedIntegrity:${trigger}] ✅ Check complete in ${duration}ms - Grade: ${overallGrade}, Status: ${metrics.status}`);
    console.log(`[FeedIntegrity:${trigger}] Metrics: Heartbeat=${metrics.latencyMs}ms, Uptime=${metrics.uptimePercent === null ? `warming(${metrics.ringSamples})` : `${metrics.uptimePercent}%`}, Reconnects=${metrics.reconnectCount}(${metrics.reconnectBasis}), TickAge=${metrics.tickAgeSec}s`);
    
    return {
      ...report,
      duration,
      reportPath,
    };
  } catch (error: any) {
    console.error(`[FeedIntegrity:${trigger}] ❌ Check failed:`, error);
    
    // Create the critical check-failed alert, one row per mode.
    // B-FEED-HEALTH-GRADE-ARM (Langston Step-1 Q1): THROTTLED through the grade path's own state — a persistent throw used
    // to mint two critical rows per admin every 5 minutes. `CHECK_FAILED` differs from every real grade, so the first
    // successful check after a throw always trips the status/grade-change arm and the healthy transition clears these rows.
    try {
      const failMonitor = getFeedIntegrityMonitor();
      if (!failMonitor.shouldSendAlert('critical', 'CHECK_FAILED')) {
        console.log(`[FeedIntegrity] Check-failed alert suppressed (cooldown or duplicate)`);
      } else {
        // B-ALERT-INSERT-CONTRACT (#1255, P4/P6): ONE write per mode under the alert owner. The cause stays in `message`
        // (the banner renders nothing else), normalized so one kind of failure keeps one row; the full text and the time go
        // in metadata. The constant-text collision this path used to hit came from the duplicate-key error P1 removes.
        const owner = await AlertsService.getAlertOwner();
        if (owner) {
          const errorText = error instanceof Error ? error.message : String(error);
          for (const mode of ['live', 'paper'] as const) {
            await AlertsService.createAlert({
              userId: owner.id,
              mode,
              alertType: 'feed_health',
              severity: 'critical',
              category: 'critical',
              message: formatCheckFailedMessage(error),
              metadata: { error: errorText, trigger, at: new Date().toISOString() },
            });
          }
        } else {
          console.warn(`[FeedIntegrity] No admin user to own the check-failed alert — not written`);
        }
        failMonitor.updateAlertState('critical', 'CHECK_FAILED');
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
export async function initFeedIntegrityAutoCheck(): Promise<void> {
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
  job = cron.createTask(
    cronSchedule,
    async (context) => {
      await cronOccurrenceRunner.runNatural(JOB_NAME, context.date);
    },
    {
      timezone: 'UTC',
    }
  );

  cronRegistry.register({
    name: JOB_NAME,
    task: job!,
    expression: cronSchedule,
    timezone: 'UTC',
    intervalSeconds: 300,
    enabled: true,
    recovery: {
      policyKey: JOB_NAME,
      beforeRun: async () => {
        const jitterMs = Math.floor(Math.random() * 30_000);
        console.log(`[FeedIntegrity] Waiting ${jitterMs}ms jitter before check...`);
        await new Promise(resolve => setTimeout(resolve, jitterMs));
        return { jitter_ms: jitterMs };
      },
      run: async () => {
        await runFeedIntegrityCheck('auto');
      },
    },
  });
  job!.on('execution:missed', (context) => {
    cronOccurrenceRunner.dispatchMissed(JOB_NAME, context.date);
  });
  await cronOccurrenceRunner.prepareJob(JOB_NAME);
  job!.start();
  isEnabled = true;
  console.log('[FeedIntegrity] ✅ Auto-check enabled after startup reconciliation');
  logCronArm(cronRegistry.get(JOB_NAME)!);
  
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
      await cronOccurrenceRunner.runAuxiliary(JOB_NAME, 'boot', () => runFeedIntegrityCheck('auto'));
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
export async function registerFeedIntegrityJob(): Promise<void> {
  await initFeedIntegrityAutoCheck();
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
    
    // B-ALERT-INSERT-CONTRACT (#1255, P5): every user's feed-health rows (global per mode); `userId` names who stopped.
    const clearedAlerts = await AlertsService.acknowledgeFeedHealthAlerts();
    const totalCleared = clearedAlerts.length;
    
    if (totalCleared > 0) {
      // Count by mode
      const liveFeedAlerts = clearedAlerts.filter(a => a.mode === 'live');
      const paperFeedAlerts = clearedAlerts.filter(a => a.mode === 'paper');
      
      console.log(`[FeedIntegrity] ✅ Cleared ${totalCleared} feed-health alerts (${liveFeedAlerts.length} live, ${paperFeedAlerts.length} paper)`);
      
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
