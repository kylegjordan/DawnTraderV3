import { getMarketDataCoordinator } from './market-data-coordinator';
import fs from 'fs';

/**
 * Feed health status categories
 */
export type FeedHealthStatus = 'healthy' | 'warning' | 'critical';

/**
 * Feed health metrics
 */
export interface FeedHealthMetrics {
  feedType: 'websocket' | 'rest_fallback';
  latencyMs: number;
  stalenessSec: number;
  uptimePercent: number;
  pairCount: number;
  errorRate: number;
  status: FeedHealthStatus;
  lastUpdateISO: string;
}

/**
 * Feed health report with grading
 */
export interface FeedHealthReport {
  timestamp: string;
  overallGrade: 'A' | 'B' | 'C' | 'F';
  metrics: FeedHealthMetrics;
  issues: string[];
  summary: string[];
}

/**
 * Rolling health metrics tracker
 */
interface HealthSnapshot {
  timestamp: number;
  latencyMs: number;
  wasHealthy: boolean;
  wasConnected: boolean;
  errorOccurred: boolean;
}

/**
 * Feed Integrity Monitor Service
 * Tracks health metrics for Kraken WebSocket + REST fallback feeds
 */
class FeedIntegrityMonitorService {
  private coordinator = getMarketDataCoordinator();
  private healthHistory: HealthSnapshot[] = [];
  private readonly MAX_HISTORY = 12; // 12 snapshots = 1 hour at 5-min intervals
  private lastCheckTime: number = 0;
  private totalChecks = 0;
  private healthyChecks = 0;
  private errorCount = 0;

  /**
   * Get current feed health metrics
   */
  public getHealthMetrics(): FeedHealthMetrics {
    const status = this.coordinator.getStatus();
    const now = Date.now();
    
    // Calculate latency (time since last tick)
    const latencyMs = status.lastTickAgeMs >= 0 ? status.lastTickAgeMs : 0;
    const stalenessSec = Math.round(latencyMs / 1000);
    
    // Calculate uptime percentage from recent history
    const uptimePercent = this.calculateUptime();
    
    // Calculate error rate from history
    const errorRate = this.calculateErrorRate();
    
    // Determine feed type
    const feedType: 'websocket' | 'rest_fallback' = 
      status.dataSource === 'ws' ? 'websocket' : 'rest_fallback';
    
    // Determine health status
    const healthStatus = this.categorizeHealth(latencyMs, uptimePercent);
    
    return {
      feedType,
      latencyMs: Math.round(latencyMs),
      stalenessSec,
      uptimePercent: parseFloat(uptimePercent.toFixed(2)),
      pairCount: status.subscribedPairs,
      errorRate: parseFloat(errorRate.toFixed(4)),
      status: healthStatus,
      lastUpdateISO: new Date().toISOString(),
    };
  }

  /**
   * Categorize feed health based on latency and uptime
   * 
   * Healthy:  latency < 2s and uptime >= 99%
   * Warning:  latency 2-5s or uptime 95-99%
   * Critical: latency > 5s or uptime < 95%
   */
  private categorizeHealth(latencyMs: number, uptimePercent: number): FeedHealthStatus {
    const latencySec = latencyMs / 1000;
    
    // Critical conditions
    if (latencySec > 5 || uptimePercent < 95) {
      return 'critical';
    }
    
    // Warning conditions
    if (latencySec >= 2 || uptimePercent < 99) {
      return 'warning';
    }
    
    // Healthy
    return 'healthy';
  }

  /**
   * Calculate uptime percentage from history
   * Returns percentage of intervals where feed was healthy
   */
  private calculateUptime(): number {
    if (this.totalChecks === 0) {
      return 100; // No data yet, assume healthy
    }
    
    return (this.healthyChecks / this.totalChecks) * 100;
  }

  /**
   * Calculate error rate from history
   * Returns ratio of failed updates to total attempts
   */
  private calculateErrorRate(): number {
    if (this.totalChecks === 0) {
      return 0;
    }
    
    return this.errorCount / this.totalChecks;
  }

  /**
   * Record a health snapshot
   */
  public recordSnapshot(): void {
    const status = this.coordinator.getStatus();
    const now = Date.now();
    const latencyMs = status.lastTickAgeMs >= 0 ? status.lastTickAgeMs : 0;
    const uptimePercent = this.calculateUptime();
    
    // Determine if this snapshot is healthy
    const isHealthy = this.categorizeHealth(latencyMs, uptimePercent) === 'healthy';
    
    // Record snapshot
    const snapshot: HealthSnapshot = {
      timestamp: now,
      latencyMs,
      wasHealthy: isHealthy,
      wasConnected: status.wsConnected,
      errorOccurred: !status.wsConnected && !status.usingFallback,
    };
    
    this.healthHistory.push(snapshot);
    
    // Keep only last MAX_HISTORY snapshots
    if (this.healthHistory.length > this.MAX_HISTORY) {
      this.healthHistory.shift();
    }
    
    // Update counters
    this.totalChecks++;
    if (isHealthy) {
      this.healthyChecks++;
    }
    if (snapshot.errorOccurred) {
      this.errorCount++;
    }
    
    this.lastCheckTime = now;
  }

  /**
   * Generate a comprehensive health report
   */
  public generateReport(): FeedHealthReport {
    const metrics = this.getHealthMetrics();
    const issues: string[] = [];
    const summary: string[] = [];
    
    // Determine overall grade
    let grade: 'A' | 'B' | 'C' | 'F' = 'A';
    
    if (metrics.status === 'critical') {
      grade = 'F';
      issues.push(`Critical feed outage detected (latency: ${metrics.latencyMs}ms)`);
    } else if (metrics.status === 'warning') {
      grade = metrics.feedType === 'rest_fallback' ? 'C' : 'B';
      issues.push(`Feed performance degraded (latency: ${metrics.latencyMs}ms)`);
    }
    
    // Check for fallback
    if (metrics.feedType === 'rest_fallback') {
      issues.push('REST fallback engaged (WebSocket unavailable)');
      if (grade === 'A') grade = 'B';
    }
    
    // Check uptime
    if (metrics.uptimePercent < 99) {
      issues.push(`Low uptime: ${metrics.uptimePercent.toFixed(1)}%`);
    }
    
    // Generate summary
    summary.push(`Overall Grade: ${grade}`);
    summary.push(`Feed Type: ${metrics.feedType.toUpperCase()}`);
    summary.push(`Latency: ${metrics.latencyMs}ms`);
    summary.push(`Uptime: ${metrics.uptimePercent.toFixed(2)}%`);
    summary.push(`Active Pairs: ${metrics.pairCount}`);
    summary.push(`Error Rate: ${(metrics.errorRate * 100).toFixed(2)}%`);
    summary.push(`Status: ${metrics.status.toUpperCase()}`);
    
    if (issues.length > 0) {
      summary.push('');
      summary.push('Issues:');
      issues.forEach(issue => summary.push(`  - ${issue}`));
    } else {
      summary.push('');
      summary.push('✅ All systems healthy');
    }
    
    return {
      timestamp: metrics.lastUpdateISO,
      overallGrade: grade,
      metrics,
      issues,
      summary,
    };
  }

  /**
   * Get recent health history (for sparkline graphs)
   */
  public getHealthHistory(): HealthSnapshot[] {
    return [...this.healthHistory];
  }

  /**
   * Reset health counters (for testing)
   */
  public reset(): void {
    this.healthHistory = [];
    this.totalChecks = 0;
    this.healthyChecks = 0;
    this.errorCount = 0;
    this.lastCheckTime = 0;
  }

  /**
   * Save report to file
   */
  public saveReport(report: FeedHealthReport, filename: string): void {
    try {
      const reportJson = JSON.stringify(report, null, 2);
      fs.writeFileSync(filename, reportJson);
      console.log(`[FeedIntegrity] Report saved to ${filename}`);
    } catch (error: any) {
      console.error('[FeedIntegrity] Failed to save report:', error.message);
      throw error;
    }
  }
}

// Singleton instance
let monitorInstance: FeedIntegrityMonitorService | null = null;

export function getFeedIntegrityMonitor(): FeedIntegrityMonitorService {
  if (!monitorInstance) {
    monitorInstance = new FeedIntegrityMonitorService();
  }
  return monitorInstance;
}

export { FeedIntegrityMonitorService };
