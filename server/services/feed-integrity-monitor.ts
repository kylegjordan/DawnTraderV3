// P19-B6.7 (#301): the vestigial 2nd-WS subsystem (market-data-coordinator/market-data-ws)
// was removed. The alarm now grades the PRIMARY adapter's real per-symbol tick-age, per
// asset class, with the xStock class market-hours-gated + a post-open warmup grace.
import { krakenWebSocketAdapter } from '../exchanges/kraken/kraken-websocket-adapter.js';
import {
  gradePerClassFeedLiveness,
  type SymbolFreshness,
  type PerClassThresholds,
  type FeedAliveGrade,
} from './market-data/feed-health-aggregate.js';
import { resolveAssetClass } from '../../shared/asset-classes.js';
import { isXstockMarketOpenUTC } from '../asset_classes/xstock_spot/market-hours.js';
import { getCachedNumberRequired } from './module-constants-service.js';
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
  // P19-B6.7 (#301): warmup-grace state for the xStock-class alarm — when the per-symbol
  // market-open gate last transitioned closed→open (suppress xStock critical for
  // warmup_grace_ms after, so the stale-at-close age doesn't false-fire at the bell).
  private xstockWasOpen = false;
  private xstockOpenedAtMs: number | null = null;
  // The primary adapter exposes CUMULATIVE reconnectAttempts; track the delta per cycle.
  private lastReconnectAttempts = 0;
  private configWarnLogged = false;
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
    const now = Date.now();
    const wsStatus = krakenWebSocketAdapter.getStatus();

    // Get interval reconnect count from last snapshot
    const reconnectCount = this.healthHistory.length > 0
      ? this.healthHistory[this.healthHistory.length - 1].reconnectsSinceLastCheck
      : 0;

    // P19-B6.7 (#301): per-asset-class FEED-LEVEL liveness (freshest-symbol age; xStock
    // market-hours-gated + warmup grace). This owns the "is data flowing" dimension.
    const { grade: livenessGrade, worstAgeSec } = this.computeLiveness(now);

    // Calculate latency (average from recent history; now sourced from primary pong RTT)
    const latencyMs = this.calculateAverageLatency();

    // Calculate time-based uptime percentage
    const uptimePercent = this.calculateTimeBasedUptime();

    // Calculate error rate from history
    const errorRate = this.calculateErrorRate();

    // Connection-quality grade (reconnects/latency/uptime). tickAge term is 0 because the
    // per-class LIVENESS grade owns staleness; final status = the worse of the two.
    const connQuality = this.categorizeHealthBySpec(reconnectCount, 0, latencyMs, uptimePercent);
    const healthStatus = this.worseStatus(livenessGrade, connQuality);

    return {
      feedType: 'websocket', // only the primary WS feed exists (no REST fallback post-#301)
      latencyMs: Math.round(latencyMs),
      stalenessSec: worstAgeSec,
      uptimePercent: parseFloat(uptimePercent.toFixed(2)),
      pairCount: wsStatus.subscribedCount,
      errorRate: parseFloat(errorRate.toFixed(4)),
      reconnectCount,
      tickAgeSec: worstAgeSec,
      status: healthStatus,
      lastUpdateISO: new Date().toISOString(),
    };
  }

  /**
   * P19-B6.7 (#301): read the PRIMARY adapter and grade FEED-LEVEL liveness per asset class.
   * Defensive: a missing/unwarmed DB threshold logs once and skips the liveness grade
   * (returns healthy) — the alarm must never crash nor false-fire a critical off a config gap.
   */
  private computeLiveness(now: number): { grade: FeedAliveGrade; worstAgeSec: number } {
    const health: SymbolFreshness[] = krakenWebSocketAdapter
      .getI8EWsHealth()
      .map((h) => ({ symbol: h.symbol, ageMs: h.ageMs }));

    // xStock open-state transition → (re)start the warmup grace on the closed→open edge.
    const anyXstockOpen = health.some(
      (h) => resolveAssetClass(h.symbol, 'kraken') === 'xstock_spot' && isXstockMarketOpenUTC(h.symbol, new Date(now)),
    );
    if (anyXstockOpen && !this.xstockWasOpen) this.xstockOpenedAtMs = now;
    this.xstockWasOpen = anyXstockOpen;

    const warmupGraceMs = this.tryGetConfig('xstock_spot', 'warmup_grace_ms');
    const xstockWarmupRemainingMs =
      this.xstockOpenedAtMs !== null && warmupGraceMs !== null
        ? Math.max(0, warmupGraceMs - (now - this.xstockOpenedAtMs))
        : 0;

    const thresholds: Record<string, PerClassThresholds> = {};
    for (const cls of ['crypto_spot', 'xstock_spot']) {
      const warningMs = this.tryGetConfig(cls, 'warning_age_ms');
      const criticalMs = this.tryGetConfig(cls, 'critical_age_ms');
      if (warningMs !== null && criticalMs !== null) thresholds[cls] = { warningMs, criticalMs };
    }
    if (Object.keys(thresholds).length === 0) {
      return { grade: 'healthy', worstAgeSec: 0 }; // config not warmed yet → do not alarm
    }

    const result = gradePerClassFeedLiveness(health, {
      classify: (sym) => resolveAssetClass(sym, 'kraken'),
      thresholds,
      xstockClassKey: 'xstock_spot',
      isXstockSymbolOpen: (sym) => isXstockMarketOpenUTC(sym, new Date(now)),
      xstockWarmupRemainingMs,
    });

    let worstAgeMs = 0;
    for (const c of result.classes) {
      if (c.suppressed) continue;
      // P19-B6.7 (Langston Step-4 ②): a null-driven critical (no symbol EVER ticked) has no
      // finite age — surface the class critical threshold as a sentinel so stalenessSec does
      // not misleadingly read 0s on a genuinely dead feed.
      const ageMs = c.freshestAgeMs ?? (c.grade === 'critical' ? (thresholds[c.assetClass]?.criticalMs ?? 0) : 0);
      if (ageMs > worstAgeMs) worstAgeMs = ageMs;
    }
    return { grade: result.overall, worstAgeSec: Math.round(worstAgeMs / 1000) };
  }

  /** Read a per-asset-class feed_health knob (DB §11), null if unavailable (never throws). */
  private tryGetConfig(assetClass: string, name: string): number | null {
    try {
      return getCachedNumberRequired('feed_health', name, {
        exchange: '*', assetClass, strategy: '*', regime: '*',
      });
    } catch {
      if (!this.configWarnLogged) {
        this.configWarnLogged = true;
        console.warn(`[FeedIntegrity] feed_health config not warmed yet (${name}/${assetClass}); skipping liveness grade this cycle`);
      }
      return null;
    }
  }

  /** Return the more severe of two feed-health statuses. */
  private worseStatus(a: FeedHealthStatus, b: FeedHealthStatus): FeedHealthStatus {
    const rank: Record<FeedHealthStatus, number> = { healthy: 0, warning: 1, critical: 2 };
    return rank[a] >= rank[b] ? a : b;
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
      // P19-B6.7 (#301): smoothed inter-heartbeat latency proxy (see recordSnapshot note —
      // not a true RTT; Kraken v2 heartbeats are server-pushed).
      return krakenWebSocketAdapter.getHealthMetrics().avgHeartbeatLatency;
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
    const now = Date.now();
    const wsStatus = krakenWebSocketAdapter.getStatus();

    // P19-B6.7 (#301): the primary adapter exposes CUMULATIVE reconnectAttempts; derive the
    // per-interval delta (the prior 2nd-WS exposed a reset-on-read counter).
    const intervalReconnects = Math.max(0, wsStatus.reconnectAttempts - this.lastReconnectAttempts);
    this.lastReconnectAttempts = wsStatus.reconnectAttempts;

    // Per-class FEED-LEVEL liveness owns staleness; latency is a SMOOTHED PROXY (Langston
    // Step-4): true ping→pong RTT is not available from Kraken v2's server-pushed heartbeats,
    // so we use the adapter's averaged inter-heartbeat latency (avg of ≤60 samples) rather
    // than a single sawtooth pong-age point-sample that could throw a lone false WARNING.
    const { grade: livenessGrade, worstAgeSec } = this.computeLiveness(now);
    const latencyMs = krakenWebSocketAdapter.getHealthMetrics().avgHeartbeatLatency;
    const uptimePercent = this.calculateTimeBasedUptime();

    // Healthy iff BOTH liveness and connection-quality are healthy (tickAge term 0 — liveness owns it).
    const connQuality = this.categorizeHealthBySpec(intervalReconnects, 0, latencyMs, uptimePercent);
    const isHealthy = this.worseStatus(livenessGrade, connQuality) === 'healthy';

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
      wasConnected: wsStatus.isConnected,
      errorOccurred: !wsStatus.isConnected,
      reconnectsSinceLastCheck: intervalReconnects,
      tickAgeSec: worstAgeSec,
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
