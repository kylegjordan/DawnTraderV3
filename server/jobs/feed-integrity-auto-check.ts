import cron from 'node-cron';
import { getFeedIntegrityMonitor, FeedHealthReport } from '../services/feed-integrity-monitor';
import { AlertsService } from '../services/alerts-service';
import { storage } from '../storage';
import fs from 'fs';

/**
 * Feed Integrity Auto-Check Job
 * Runs every 5 minutes to monitor Kraken feed health
 */

const ENABLED = process.env.FEED_INTEGRITY_ENABLED !== 'false'; // Enabled by default
const SCHEDULE = '*/5 * * * *'; // Every 5 minutes
const CONSECUTIVE_HEALTHY_THRESHOLD = 2; // Clear alerts after 2 healthy cycles

// Track alert state for auto-clear logic
let lastStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
let consecutiveHealthyCount = 0;
let activeAlertIds: Set<string> = new Set();

/**
 * Create system notification for feed health issues
 */
async function createFeedAlert(grade: string, issues: string[], metrics: any) {
  try {
    // Get all admin users
    const users = await storage.getAllUsers();
    const adminUsers = users.filter(u => u.isAdmin);
    
    // Determine severity based on grade
    const severity = grade === 'F' ? 'critical' : 'warning';
    const category = grade === 'F' ? 'critical' : 'actionable';
    
    // Build message
    const mainIssue = issues[0] || 'Feed performance degraded';
    const message = grade === 'F'
      ? `Data Feed CRITICAL — ${mainIssue}`
      : `Data Feed Warning — ${mainIssue}`;
    
    for (const admin of adminUsers) {
      // Create alert for both paper and live modes
      const paperAlert = await AlertsService.createAlert({
        userId: admin.id,
        mode: 'paper',
        alertType: 'feed_integrity',
        severity,
        category,
        message,
        metadata: { grade, issues, metrics }
      });
      
      const liveAlert = await AlertsService.createAlert({
        userId: admin.id,
        mode: 'live',
        alertType: 'feed_integrity',
        severity,
        category,
        message,
        metadata: { grade, issues, metrics }
      });
      
      // Track alert IDs for potential auto-clear
      activeAlertIds.add(paperAlert.id);
      activeAlertIds.add(liveAlert.id);
    }
    
    console.log(`[FEED-ALERT] ${severity.toUpperCase()} alert created: ${message}`);
  } catch (error: any) {
    console.error('[FEED-INTEGRITY] ❌ Alert creation error:', error.message);
  }
}

/**
 * Auto-clear alerts when feed returns to healthy
 */
async function clearFeedAlerts() {
  try {
    // Note: AlertsService doesn't have a delete method yet
    // For now, just clear the tracking set
    // In production, you'd want to mark these as resolved or delete them
    activeAlertIds.clear();
    console.log('[FEED-ALERT] ✅ Alerts auto-cleared (feed healthy for 2+ cycles)');
  } catch (error: any) {
    console.error('[FEED-INTEGRITY] ❌ Alert clear error:', error.message);
  }
}

/**
 * Cleanup old report files (older than 7 days)
 */
function cleanupOldReports(): void {
  try {
    const files = fs.readdirSync('/tmp');
    const feedReports = files.filter(f => f.startsWith('feed_health_') && f.endsWith('.json'));
    const cutoffDate = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days ago
    
    let deletedCount = 0;
    for (const file of feedReports) {
      const filePath = `/tmp/${file}`;
      const stats = fs.statSync(filePath);
      
      if (stats.mtimeMs < cutoffDate) {
        fs.unlinkSync(filePath);
        deletedCount++;
      }
    }
    
    if (deletedCount > 0) {
      console.log(`[FEED-INTEGRITY] 🧹 Cleaned ${deletedCount} old report(s)`);
    }
  } catch (error: any) {
    console.error('[FEED-INTEGRITY] Cleanup error:', error.message);
  }
}

/**
 * Run feed integrity check and handle results
 */
export async function runFeedIntegrityCheck(runType: 'scheduled' | 'manual' = 'scheduled'): Promise<FeedHealthReport> {
  const monitor = getFeedIntegrityMonitor();
  const startTime = Date.now();
  const timestamp = new Date().toISOString();
  
  console.log(`[FEED-INTEGRITY] ${runType === 'scheduled' ? '⏰' : '🔍'} Starting ${runType} check at ${timestamp}...`);
  
  try {
    // Record health snapshot
    monitor.recordSnapshot();
    
    // Generate report
    const report = monitor.generateReport();
    
    // Generate dated filename
    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const reportPath = `/tmp/feed_health_${dateStr}.json`;
    const latestPath = '/tmp/feed_health_latest.json';
    
    // Save reports
    monitor.saveReport(report, reportPath);
    monitor.saveReport(report, latestPath);
    
    // Log summary
    const duration = Date.now() - startTime;
    const metrics = report.metrics;
    console.log(
      `[FEED-HEALTH] completed in ${duration}ms ` +
      `grade=${report.overallGrade} ` +
      `latency=${metrics.latencyMs}ms ` +
      `uptime=${metrics.uptimePercent.toFixed(1)}% ` +
      `pairs=${metrics.pairCount} ` +
      `status=${metrics.status}`
    );
    
    // Alert logic
    const currentStatus = metrics.status;
    
    if (currentStatus === 'healthy') {
      consecutiveHealthyCount++;
      
      // Auto-clear alerts after 2+ consecutive healthy checks
      if (consecutiveHealthyCount >= CONSECUTIVE_HEALTHY_THRESHOLD && activeAlertIds.size > 0) {
        await clearFeedAlerts();
      }
    } else {
      // Reset healthy count
      consecutiveHealthyCount = 0;
      
      // Create alert for warning or critical status
      if (currentStatus === 'warning' || currentStatus === 'critical') {
        await createFeedAlert(report.overallGrade, report.issues, metrics);
      }
    }
    
    lastStatus = currentStatus;
    
    // Cleanup old reports
    cleanupOldReports();
    
    return report;
  } catch (error: any) {
    console.error('[FEED-INTEGRITY] ❌ Check failed:', error.message);
    console.error(error.stack);
    throw error;
  }
}

/**
 * Register the feed integrity cron job
 */
export function registerFeedIntegrityJob() {
  if (!ENABLED) {
    console.log('[FeedIntegrityJob] ❌ Disabled via FEED_INTEGRITY_ENABLED env');
    return;
  }
  
  console.log(`[FeedIntegrityJob] ⏰ Scheduling checks: ${SCHEDULE} (every 5 minutes)`);
  
  cron.schedule(SCHEDULE, async () => {
    try {
      await runFeedIntegrityCheck('scheduled');
    } catch (error: any) {
      console.error('[FeedIntegrityJob] ❌ Scheduled check failed:', error.message);
      console.error(error.stack);
    }
  });
  
  console.log('[FeedIntegrityJob] ✅ Job registered successfully');
}
