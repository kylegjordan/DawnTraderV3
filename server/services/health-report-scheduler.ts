import fs from 'fs/promises';
import path from 'path';
import { systemHealthMonitor } from './system-health-monitor';
import { selfRepairService } from './self-repair';
import { filePersistence } from './file-persistence';

class HealthReportScheduler {
  private readonly MODULE_NAME = 'HealthReportScheduler';
  private interval: NodeJS.Timeout | null = null;
  private logPath: string;
  private readonly INTERVAL_MS = 60 * 60 * 1000; // 1 hour

  constructor() {
    this.logPath = path.join(process.cwd(), 'logs', 'system-health.log');
  }

  /**
   * Start the hourly health report scheduler
   */
  async start(): Promise<void> {
    console.log(`[${this.MODULE_NAME}] Starting hourly health report scheduler...`);

    // Ensure logs directory exists
    await this.ensureLogDirectory();

    // Generate first report immediately
    await this.generateReport();

    // Schedule hourly reports
    this.interval = setInterval(async () => {
      await this.generateReport();
    }, this.INTERVAL_MS);

    console.log(`[${this.MODULE_NAME}] ✅ Scheduler started (reports every hour)`);
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.log(`[${this.MODULE_NAME}] Scheduler stopped`);
    }
  }

  /**
   * Generate and write health report
   */
  async generateReport(): Promise<void> {
    const startTime = Date.now();
    console.log(`[${this.MODULE_NAME}] 📊 Generating health report...`);

    try {
      const health = systemHealthMonitor.analyzeHealth();
      const repairStats = selfRepairService.getStats();
      
      // Phase 8.4 Addendum C: Get intent classification stats
      let intentSummary = '';
      try {
        const { intentDecisionLogger } = await import('./intent-decision-logger');
        intentSummary = await intentDecisionLogger.getDailySummary();
      } catch (error) {
        console.warn(`[${this.MODULE_NAME}] Intent stats unavailable:`, error);
      }
      
      const report = this.formatReport(health.metrics, health.status, health.warnings, health.criticalIssues, repairStats, intentSummary);

      // Append to log file
      await this.appendToLog(report);

      const duration = Date.now() - startTime;
      console.log(`[${this.MODULE_NAME}] ✅ Health report generated and logged (${duration}ms)`);
      console.log(`[${this.MODULE_NAME}] 📈 Status: ${health.status.toUpperCase()}`);
      
    } catch (error: any) {
      console.error(`[${this.MODULE_NAME}] ❌ Report generation failed:`, error.message);
    }
  }

  /**
   * Format the health report
   */
  private formatReport(metrics: any, status: string, warnings: string[], criticalIssues: string[], repairStats: any, intentSummary?: string): string {
    const timestamp = new Date().toISOString();
    const separator = '='.repeat(80);
    const uptimeHours = Math.floor(metrics.system.uptime / 3600);
    const uptimeMinutes = Math.floor((metrics.system.uptime % 3600) / 60);

    let report = `\n${separator}\n`;
    report += `SYSTEM HEALTH REPORT - ${timestamp}\n`;
    report += `${separator}\n\n`;

    // Overall Status
    report += `OVERALL STATUS: ${status.toUpperCase()}\n\n`;

    // System Metrics
    report += `SYSTEM METRICS:\n`;
    report += `  CPU Usage:        ${metrics.system.cpuUsage}%\n`;
    report += `  Memory Usage:     ${metrics.system.memoryUsage.percentUsed}% (${this.formatBytes(metrics.system.memoryUsage.used)} / ${this.formatBytes(metrics.system.memoryUsage.total)})\n`;
    report += `  Uptime:           ${uptimeHours}h ${uptimeMinutes}m (${metrics.system.uptime}s)\n\n`;

    // Cache Performance
    report += `CACHE PERFORMANCE:\n`;
    report += `  Hit Rate:         ${metrics.cache.hitRate}%\n`;
    report += `  Miss Rate:        ${metrics.cache.missRate}%\n`;
    report += `  Total Requests:   ${metrics.cache.totalRequests}\n`;
    report += `  Cache Hits:       ${metrics.cache.hits}\n`;
    report += `  Cache Misses:     ${metrics.cache.misses}\n\n`;

    // Latency Metrics
    report += `LATENCY METRICS:\n`;
    report += `  Cortex Avg:       ${metrics.latency.cortex !== null ? metrics.latency.cortex + 'ms' : 'N/A'}\n`;
    report += `  Database Avg:     ${metrics.latency.database !== null ? metrics.latency.database + 'ms' : 'N/A'}\n`;
    report += `  API Avg:          ${metrics.latency.api !== null ? metrics.latency.api + 'ms' : 'N/A'}\n\n`;

    // Scheduler Status
    report += `SCHEDULER STATUS:\n`;
    report += `  Cortex Sync:      Uptime ${Math.floor(metrics.schedulers.cortexSync.uptime / 60)}m, Last Run: ${metrics.schedulers.cortexSync.lastRun || 'N/A'}\n`;
    report += `  Analytics:        Uptime ${Math.floor(metrics.schedulers.analytics.uptime / 60)}m, Last Run: ${metrics.schedulers.analytics.lastRun || 'N/A'}\n\n`;

    // File Persistence (Phase 8.4 Addendum E)
    if (metrics.filePersistence) {
      const fp = metrics.filePersistence;
      report += `FILE PERSISTENCE:\n`;
      report += `  Total Saved:      ${fp.successCount} files\n`;
      report += `  Failed:           ${fp.failureCount} files\n`;
      report += `  Timeouts:         ${fp.timeoutCount} files\n`;
      report += `  Avg Latency:      ${fp.avgLatencyMs}ms\n`;
      
      // Category breakdown
      const categories = Object.entries(fp.byCategory).filter(([_, stats]) => (stats as any).success > 0 || (stats as any).failed > 0);
      if (categories.length > 0) {
        report += `  By Category:\n`;
        categories.forEach(([cat, stats]: [string, any]) => {
          const status = stats.failed === 0 ? 'OK' : `${stats.failed} warning${stats.failed !== 1 ? 's' : ''}`;
          const avgLatency = stats.avgLatencyMs || 0;
          report += `    ${cat.padEnd(12)} ${status} (${stats.success} saved, ${avgLatency}ms avg)\n`;
        });
      }
      report += `\n`;
    }

    // Recovery Statistics
    report += `RECOVERY STATISTICS:\n`;
    report += `  Total Repairs:    ${repairStats.totalRepairs}\n`;
    report += `  Successful:       ${repairStats.successfulRepairs}\n`;
    report += `  Failed:           ${repairStats.failedRepairs}\n`;
    report += `  Last Repair:      ${repairStats.lastRepair || 'None'}\n\n`;

    // Phase 8.4 Addendum C: Intent Classification Stats
    if (intentSummary) {
      report += intentSummary + '\n';
    }

    // Warnings
    if (warnings.length > 0) {
      report += `WARNINGS (${warnings.length}):\n`;
      warnings.forEach((warning, index) => {
        report += `  ${index + 1}. ${warning}\n`;
      });
      report += `\n`;
    }

    // Critical Issues
    if (criticalIssues.length > 0) {
      report += `CRITICAL ISSUES (${criticalIssues.length}):\n`;
      criticalIssues.forEach((issue, index) => {
        report += `  ${index + 1}. ${issue}\n`;
      });
      report += `\n`;
    }

    // Recent Repair Actions
    if (repairStats.recentActions.length > 0) {
      report += `RECENT REPAIR ACTIONS (Last ${Math.min(5, repairStats.recentActions.length)}):\n`;
      repairStats.recentActions.slice(-5).forEach((action: any, index: number) => {
        const status = action.success ? '✅' : '❌';
        report += `  ${status} ${action.timestamp}: ${action.action} (${action.duration}ms)\n`;
        if (action.error) {
          report += `     Error: ${action.error}\n`;
        }
      });
      report += `\n`;
    }

    report += `${separator}\n`;

    return report;
  }

  /**
   * Append report to log file
   */
  private async appendToLog(report: string): Promise<void> {
    try {
      await filePersistence.saveFile('log', 'system-health.log', report, { append: true });
    } catch (error: any) {
      console.error(`[${this.MODULE_NAME}] ❌ Failed to write log:`, error.message);
      throw error;
    }
  }

  /**
   * Ensure logs directory exists
   */
  private async ensureLogDirectory(): Promise<void> {
    const logsDir = path.dirname(this.logPath);
    try {
      await fs.mkdir(logsDir, { recursive: true });
    } catch (error: any) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  /**
   * Format bytes to human-readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }
}

// Singleton instance
export const healthReportScheduler = new HealthReportScheduler();
