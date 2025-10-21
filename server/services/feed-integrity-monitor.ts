import { getMarketDataCoordinator } from './market-data-coordinator';
import { getMarketDataWS } from './market-data-ws';
import fs from 'fs';

/**
 * Feed health status categories
 */
export type FeedHealthStatus = 'healthy' | 'warning' | 'critical';

/**
 * Configuration thresholds (env-configurable)
 */
interface FeedHealthThresholds {
  // WARNING thresholds
  warningReconnects: number;
  warningTickAgeSec: number;
  warningLatencyMs: number;
  warningUptimePercent: number;
  
  // CRITICAL thresholds
  criticalReconnects: number;
  criticalTickAgeSec: number;
  criticalLatencyMs: number;
  criticalUptimePercent: number;
  
  // Grading thresholds
  gradeA: { latencyMs: number; uptimePercent: number; reconnects: number; tickAgeSec: number };
  gradeB: { latencyMs: number; uptimePercent: number; reconnects: number; tickAgeSec: number };
  gradeC: { latencyMs: number; uptimePercent: number; reconnects: number; tickAgeSec: number };
  gradeD: { latencyMs: number; uptimePercent: number; reconnects: number; tickAgeSec: number };
  // Grade F = anything worse than D
  
  // Alert cooldown (seconds)
  alertCooldownSec: number;
}

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
  reconnectCount: number;
  tickAgeSec: number;
  status: FeedHealthStatus;
  lastUpdateISO: string;
}

/**
 * Feed health report with grading
 */
export interface FeedHealthReport {
  timestamp: string;
  overallGrade: 'A' | 'B' | 'C' | 'D' | 'F';
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
  reconnectsSinceLastCheck: number;
  tickAgeSec: number;
}

/**
 * Alert tracking for deduplication
 */
interface AlertState {
  lastAlertTime: number;
  lastStatus: FeedHealthStatus;
  lastGrade: string;
  activeAlertId: string | null;
}

/**
 * Feed Integrity Monitor Service
 * Tracks health metrics for Kraken WebSocket + REST fallback feeds with:
 * - Reconnect tracking from WebSocket layer
 * - Time-based uptime calculation
 * - Configurable thresholds
 * - Alert deduplication with cooldown
 * - Accurate grading based on all metrics
 */
class FeedIntegrityMonitorService {
  private coordinator = getMarketDataCoordinator();
  private ws = getMarketDataWS();
  private healthHistory: HealthSnapshot[] = [];
  private readonly MAX_HISTORY = 12; // 12 snapshots = 1 hour at 5-min intervals
  private lastCheckTime: number = 0;
  private alertState: AlertState = {
    lastAlertTime: 0,
    lastStatus: 'healthy',
    lastGrade: 'A',
    activeAlertId: null,
  };
  
  // Time-based uptime tracking (minutes)
  private uptimeStartTime: number = Date.now();
  private totalMinutes: number = 0;
  private healthyMinutes: number = 0;
  private lastHealthCheckTime: number = Date.now();
  
  // Interval reconnect tracking
  private reconnectsThisInterval = 0;
  
  // Configurable thresholds
  private thresholds: FeedHealthThresholds;

  constructor() {
    this.thresholds = this.loadThresholds();
  }

  /**
   * Load thresholds from environment or use defaults
   */
  private loadThresholds(): FeedHealthThresholds {
    return {
      // WARNING: ≥3 reconnects OR ≥5s tick age
      warningReconnects: parseInt(process.env.FEED_WARNING_RECONNECTS || '3'),
      warningTickAgeSec: parseInt(process.env.FEED_WARNING_TICK_AGE_SEC || '5'),
      warningLatencyMs: parseInt(process.env.FEED_WARNING_LATENCY_MS || '2000'),
      warningUptimePercent: parseFloat(process.env.FEED_WARNING_UPTIME_PERCENT || '95'),
      
      // CRITICAL: ≥5 reconnects OR ≥10s tick age
      criticalReconnects: parseInt(process.env.FEED_CRITICAL_RECONNECTS || '5'),
      criticalTickAgeSec: parseInt(process.env.FEED_CRITICAL_TICK_AGE_SEC || '10'),
      criticalLatencyMs: parseInt(process.env.FEED_CRITICAL_LATENCY_MS || '5000'),
      criticalUptimePercent: parseFloat(process.env.FEED_CRITICAL_UPTIME_PERCENT || '80'),
      
      // Grading thresholds (all conditions must be met for grade)
      gradeA: {
        latencyMs: parseInt(process.env.FEED_GRADE_A_LATENCY_MS || '500'),
        uptimePercent: parseFloat(process.env.FEED_GRADE_A_UPTIME || '99'),
        reconnects: parseInt(process.env.FEED_GRADE_A_RECONNECTS || '0'),
        tickAgeSec: parseInt(process.env.FEED_GRADE_A_TICK_AGE_SEC || '2'),
      },
      gradeB: {
        latencyMs: parseInt(process.env.FEED_GRADE_B_LATENCY_MS || '1000'),
        uptimePercent: parseFloat(process.env.FEED_GRADE_B_UPTIME || '95'),
        reconnects: parseInt(process.env.FEED_GRADE_B_RECONNECTS || '2'),
        tickAgeSec: parseInt(process.env.FEED_GRADE_B_TICK_AGE_SEC || '5'),
      },
      gradeC: {
        latencyMs: parseInt(process.env.FEED_GRADE_C_LATENCY_MS || '2000'),
        uptimePercent: parseFloat(process.env.FEED_GRADE_C_UPTIME || '90'),
        reconnects: parseInt(process.env.FEED_GRADE_C_RECONNECTS || '5'),
        tickAgeSec: parseInt(process.env.FEED_GRADE_C_TICK_AGE_SEC || '10'),
      },
      gradeD: {
        latencyMs: parseInt(process.env.FEED_GRADE_D_LATENCY_MS || '3000'),
        uptimePercent: parseFloat(process.env.FEED_GRADE_D_UPTIME || '80'),
        reconnects: parseInt(process.env.FEED_GRADE_D_RECONNECTS || '10'),
        tickAgeSec: parseInt(process.env.FEED_GRADE_D_TICK_AGE_SEC || '20'),
      },
      
      // Alert cooldown
      alertCooldownSec: parseInt(process.env.FEED_ALERT_COOLDOWN_SEC || '300'), // 5 minutes
    };
  }

  /**
   * Get current feed health metrics with interval reconnect tracking
   */
  public getHealthMetrics(): FeedHealthMetrics {
    const coordinatorStatus = this.coordinator.getStatus();
    const wsStatus = this.ws.getStatus();
    const now = Date.now();
    
    // Get interval reconnect count from last snapshot
    const reconnectCount = this.healthHistory.length > 0 
      ? this.healthHistory[this.healthHistory.length - 1].reconnectsSinceLastCheck
      : 0;
    
    // Calculate tick age (time since last data update)
    const tickAgeMs = wsStatus.lastTickAgeMs >= 0 ? wsStatus.lastTickAgeMs : 0;
    const tickAgeSec = Math.round(tickAgeMs / 1000);
    
    // Calculate latency (average from recent history)
    const latencyMs = this.calculateAverageLatency();
    
    // Calculate time-based uptime percentage
    const uptimePercent = this.calculateTimeBasedUptime();
    
    // Calculate error rate from history
    const errorRate = this.calculateErrorRate();
    
    // Determine feed type
    const feedType: 'websocket' | 'rest_fallback' = 
      coordinatorStatus.dataSource === 'ws' ? 'websocket' : 'rest_fallback';
    
    // Determine health status using spec thresholds (with interval reconnects)
    const healthStatus = this.categorizeHealthBySpec(reconnectCount, tickAgeSec, latencyMs, uptimePercent);
    
    return {
      feedType,
      latencyMs: Math.round(latencyMs),
      stalenessSec: tickAgeSec,
      uptimePercent: parseFloat(uptimePercent.toFixed(2)),
      pairCount: coordinatorStatus.subscribedPairs,
      errorRate: parseFloat(errorRate.toFixed(4)),
      reconnectCount,
      tickAgeSec,
      status: healthStatus,
      lastUpdateISO: new Date().toISOString(),
    };
  }

  /**
   * Categorize feed health per spec:
   * WARNING: ≥3 reconnects OR ≥5s tick age
   * CRITICAL: ≥5 reconnects OR ≥10s tick age
   */
  private categorizeHealthBySpec(
    reconnectCount: number,
    tickAgeSec: number,
    latencyMs: number,
    uptimePercent: number
  ): FeedHealthStatus {
    // CRITICAL conditions (spec: ≥5 reconnects OR ≥10s tick age)
    if (
      reconnectCount >= this.thresholds.criticalReconnects ||
      tickAgeSec >= this.thresholds.criticalTickAgeSec ||
      latencyMs >= this.thresholds.criticalLatencyMs ||
      uptimePercent < this.thresholds.criticalUptimePercent
    ) {
      return 'critical';
    }
    
    // WARNING conditions (spec: ≥3 reconnects OR ≥5s tick age)
    if (
      reconnectCount >= this.thresholds.warningReconnects ||
      tickAgeSec >= this.thresholds.warningTickAgeSec ||
      latencyMs >= this.thresholds.warningLatencyMs ||
      uptimePercent < this.thresholds.warningUptimePercent
    ) {
      return 'warning';
    }
    
    // Healthy
    return 'healthy';
  }

  /**
   * Calculate average latency from recent history
   */
  private calculateAverageLatency(): number {
    if (this.healthHistory.length === 0) {
      const wsStatus = this.ws.getStatus();
      return wsStatus.lastTickAgeMs >= 0 ? wsStatus.lastTickAgeMs : 0;
    }
    
    const sum = this.healthHistory.reduce((acc, snap) => acc + snap.latencyMs, 0);
    return sum / this.healthHistory.length;
  }

  /**
   * Calculate time-based uptime percentage (minutes healthy / total minutes)
   * More accurate than snapshot-based counting
   */
  private calculateTimeBasedUptime(): number {
    const now = Date.now();
    const elapsedMinutes = (now - this.uptimeStartTime) / (60 * 1000);
    
    if (elapsedMinutes < 1) {
      return 100; // Too early to calculate meaningful uptime
    }
    
    return Math.min(100, (this.healthyMinutes / elapsedMinutes) * 100);
  }

  /**
   * Calculate error rate from history
   * Returns ratio of failed updates to total attempts
   */
  private calculateErrorRate(): number {
    if (this.healthHistory.length === 0) {
      return 0;
    }
    
    const errorCount = this.healthHistory.filter(snap => snap.errorOccurred).length;
    return errorCount / this.healthHistory.length;
  }

  /**
   * Record a health snapshot with interval-based reconnect tracking
   */
  public recordSnapshot(): void {
    const coordinatorStatus = this.coordinator.getStatus();
    const now = Date.now();
    
    // Get interval reconnect count (resets counter)
    const intervalReconnects = this.ws.getAndResetReconnectCount();
    
    const wsStatus = this.ws.getStatus();
    const tickAgeMs = wsStatus.lastTickAgeMs >= 0 ? wsStatus.lastTickAgeMs : 0;
    const tickAgeSec = Math.round(tickAgeMs / 1000);
    
    // Note: latencyMs should be ping-pong RTT, but for now using tick age as proxy
    // TODO: Implement proper RTT tracking in MarketDataWebSocket
    const latencyMs = tickAgeMs;
    const uptimePercent = this.calculateTimeBasedUptime();
    
    // Determine if this snapshot is healthy using interval reconnects
    const isHealthy = this.categorizeHealthBySpec(
      intervalReconnects,
      tickAgeSec,
      latencyMs,
      uptimePercent
    ) === 'healthy';
    
    // Update time-based uptime tracking
    if (this.lastHealthCheckTime > 0) {
      const minutesElapsed = (now - this.lastHealthCheckTime) / (60 * 1000);
      this.totalMinutes += minutesElapsed;
      if (isHealthy) {
        this.healthyMinutes += minutesElapsed;
      }
    }
    this.lastHealthCheckTime = now;
    
    // Record snapshot with interval reconnects
    const snapshot: HealthSnapshot = {
      timestamp: now,
      latencyMs,
      wasHealthy: isHealthy,
      wasConnected: coordinatorStatus.wsConnected,
      errorOccurred: !coordinatorStatus.wsConnected && !coordinatorStatus.usingFallback,
      reconnectsSinceLastCheck: intervalReconnects,
      tickAgeSec,
    };
    
    this.healthHistory.push(snapshot);
    
    // Keep only last MAX_HISTORY snapshots
    if (this.healthHistory.length > this.MAX_HISTORY) {
      this.healthHistory.shift();
    }
    
    this.lastCheckTime = now;
  }

  /**
   * Calculate overall grade based on all metrics
   * Grading considers: latency, uptime, reconnects, tick age
   */
  private calculateGrade(metrics: FeedHealthMetrics): 'A' | 'B' | 'C' | 'D' | 'F' {
    const { latencyMs, uptimePercent, reconnectCount, tickAgeSec } = metrics;
    
    // Grade A: Excellent performance
    if (
      latencyMs < this.thresholds.gradeA.latencyMs &&
      uptimePercent >= this.thresholds.gradeA.uptimePercent &&
      reconnectCount <= this.thresholds.gradeA.reconnects &&
      tickAgeSec < this.thresholds.gradeA.tickAgeSec
    ) {
      return 'A';
    }
    
    // Grade B: Good performance
    if (
      latencyMs < this.thresholds.gradeB.latencyMs &&
      uptimePercent >= this.thresholds.gradeB.uptimePercent &&
      reconnectCount <= this.thresholds.gradeB.reconnects &&
      tickAgeSec < this.thresholds.gradeB.tickAgeSec
    ) {
      return 'B';
    }
    
    // Grade C: Acceptable performance
    if (
      latencyMs < this.thresholds.gradeC.latencyMs &&
      uptimePercent >= this.thresholds.gradeC.uptimePercent &&
      reconnectCount <= this.thresholds.gradeC.reconnects &&
      tickAgeSec < this.thresholds.gradeC.tickAgeSec
    ) {
      return 'C';
    }
    
    // Grade D: Poor performance
    if (
      latencyMs < this.thresholds.gradeD.latencyMs &&
      uptimePercent >= this.thresholds.gradeD.uptimePercent &&
      reconnectCount <= this.thresholds.gradeD.reconnects &&
      tickAgeSec < this.thresholds.gradeD.tickAgeSec
    ) {
      return 'D';
    }
    
    // Grade F: Failing
    return 'F';
  }

  /**
   * Generate a comprehensive health report
   */
  public generateReport(): FeedHealthReport {
    const metrics = this.getHealthMetrics();
    const issues: string[] = [];
    const summary: string[] = [];
    
    // Calculate grade based on all metrics
    const grade = this.calculateGrade(metrics);
    
    // Identify issues
    if (metrics.reconnectCount >= this.thresholds.criticalReconnects) {
      issues.push(`Critical: ${metrics.reconnectCount} reconnects (threshold: ${this.thresholds.criticalReconnects})`);
    } else if (metrics.reconnectCount >= this.thresholds.warningReconnects) {
      issues.push(`Warning: ${metrics.reconnectCount} reconnects (threshold: ${this.thresholds.warningReconnects})`);
    }
    
    if (metrics.tickAgeSec >= this.thresholds.criticalTickAgeSec) {
      issues.push(`Critical: Data age ${metrics.tickAgeSec}s (threshold: ${this.thresholds.criticalTickAgeSec}s)`);
    } else if (metrics.tickAgeSec >= this.thresholds.warningTickAgeSec) {
      issues.push(`Warning: Data age ${metrics.tickAgeSec}s (threshold: ${this.thresholds.warningTickAgeSec}s)`);
    }
    
    if (metrics.latencyMs >= this.thresholds.criticalLatencyMs) {
      issues.push(`Critical: Latency ${metrics.latencyMs}ms (threshold: ${this.thresholds.criticalLatencyMs}ms)`);
    } else if (metrics.latencyMs >= this.thresholds.warningLatencyMs) {
      issues.push(`Warning: Latency ${metrics.latencyMs}ms (threshold: ${this.thresholds.warningLatencyMs}ms)`);
    }
    
    if (metrics.uptimePercent < this.thresholds.criticalUptimePercent) {
      issues.push(`Critical: Uptime ${metrics.uptimePercent.toFixed(1)}% (threshold: ${this.thresholds.criticalUptimePercent}%)`);
    } else if (metrics.uptimePercent < this.thresholds.warningUptimePercent) {
      issues.push(`Warning: Uptime ${metrics.uptimePercent.toFixed(1)}% (threshold: ${this.thresholds.warningUptimePercent}%)`);
    }
    
    // Check for fallback
    if (metrics.feedType === 'rest_fallback') {
      issues.push('REST fallback engaged (WebSocket unavailable)');
    }
    
    // Generate summary
    summary.push(`Overall Grade: ${grade}`);
    summary.push(`Feed Type: ${metrics.feedType.toUpperCase()}`);
    summary.push(`Latency: ${metrics.latencyMs}ms`);
    summary.push(`Uptime: ${metrics.uptimePercent.toFixed(2)}%`);
    summary.push(`Reconnects: ${metrics.reconnectCount}`);
    summary.push(`Tick Age: ${metrics.tickAgeSec}s`);
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
   * Check if alert should be sent (with deduplication and cooldown)
   * Returns true if alert should be sent, false if suppressed
   */
  public shouldSendAlert(status: FeedHealthStatus, grade: string): boolean {
    const now = Date.now();
    const cooldownMs = this.thresholds.alertCooldownSec * 1000;
    
    // If status improved to healthy, always allow alert (to clear previous alerts)
    if (status === 'healthy' && this.alertState.lastStatus !== 'healthy') {
      return true;
    }
    
    // If status or grade changed, send alert
    if (status !== this.alertState.lastStatus || grade !== this.alertState.lastGrade) {
      return true;
    }
    
    // If within cooldown period, suppress duplicate alert
    if (now - this.alertState.lastAlertTime < cooldownMs) {
      return false;
    }
    
    // Outside cooldown, allow alert
    return true;
  }

  /**
   * Update alert state after sending alert
   */
  public updateAlertState(status: FeedHealthStatus, grade: string, alertId: string | null): void {
    this.alertState = {
      lastAlertTime: Date.now(),
      lastStatus: status,
      lastGrade: grade,
      activeAlertId: alertId,
    };
  }

  /**
   * Get active alert ID (for clearing/resolving)
   */
  public getActiveAlertId(): string | null {
    return this.alertState.activeAlertId;
  }

  /**
   * Reset health counters (for testing)
   */
  public reset(): void {
    this.healthHistory = [];
    this.lastCheckTime = 0;
    this.uptimeStartTime = Date.now();
    this.totalMinutes = 0;
    this.healthyMinutes = 0;
    this.lastHealthCheckTime = Date.now();
    this.reconnectsThisInterval = 0;
    this.alertState = {
      lastAlertTime: 0,
      lastStatus: 'healthy',
      lastGrade: 'A',
      activeAlertId: null,
    };
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
