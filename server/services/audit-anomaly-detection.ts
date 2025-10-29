import type { DatabaseStorage } from '../storage';

export interface AnomalyDetectionResult {
  timestamp: string;
  anomalyType: 'frequency_spike' | 'value_reversion';
  severity: 'warn' | 'critical';
  description: string;
  metadata: {
    userId?: string;
    changedBy?: string;
    fieldName?: string;
    entityType?: string;
    changeCount?: number;
    timeWindow?: string;
    revertedValue?: string;
  };
}

export interface OverrideFrequencyData {
  hour: string;
  paperCount: number;
  liveCount: number;
  totalCount: number;
}

export class AuditAnomalyDetectionService {
  constructor(private storage: DatabaseStorage) {}

  /**
   * Run comprehensive anomaly detection analysis
   */
  async detectAnomalies(): Promise<AnomalyDetectionResult[]> {
    const anomalies: AnomalyDetectionResult[] = [];

    // Detect frequency spikes (>5 changes/hour by same user)
    const frequencyAnomalies = await this.detectFrequencySpikes();
    anomalies.push(...frequencyAnomalies);

    // Detect value reversions (reverted within <10 minutes)
    const reversionAnomalies = await this.detectValueReversions();
    anomalies.push(...reversionAnomalies);

    return anomalies;
  }

  /**
   * Detect frequency spikes: >5 changes/hour by same user
   */
  private async detectFrequencySpikes(): Promise<AnomalyDetectionResult[]> {
    const anomalies: AnomalyDetectionResult[] = [];
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Get all audit logs from last 24 hours
    const recentLogs = await this.storage.getRecentAuditLogs({
      limit: 10000,
    });

    // Filter to last 24 hours
    const last24Hours = recentLogs.filter(
      (log) => new Date(log.timestamp) >= oneDayAgo
    );

    // Group by user and hour
    const userHourMap = new Map<string, Map<string, number>>();

    last24Hours.forEach((log) => {
      const hourKey = new Date(log.timestamp).toISOString().slice(0, 13); // YYYY-MM-DDTHH
      
      if (!userHourMap.has(log.changedBy)) {
        userHourMap.set(log.changedBy, new Map());
      }
      
      const userHours = userHourMap.get(log.changedBy)!;
      userHours.set(hourKey, (userHours.get(hourKey) || 0) + 1);
    });

    // Check for spikes (>5 changes/hour)
    userHourMap.forEach((hours, user) => {
      hours.forEach((count, hour) => {
        if (count > 5) {
          anomalies.push({
            timestamp: new Date().toISOString(),
            anomalyType: 'frequency_spike',
            severity: count > 10 ? 'critical' : 'warn',
            description: `User ${user} made ${count} configuration changes within 1 hour`,
            metadata: {
              changedBy: user,
              changeCount: count,
              timeWindow: hour,
            },
          });
        }
      });
    });

    return anomalies;
  }

  /**
   * Detect value reversions: values reverted within <10 minutes
   */
  private async detectValueReversions(): Promise<AnomalyDetectionResult[]> {
    const anomalies: AnomalyDetectionResult[] = [];
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    // Get recent audit logs
    const recentLogs = await this.storage.getRecentAuditLogs({
      limit: 1000,
    });

    // Filter to last hour for reversion detection
    const lastHour = recentLogs.filter(
      (log) => new Date(log.timestamp) >= oneHourAgo
    );

    // Group by entity type + field + mode
    const fieldMap = new Map<string, typeof lastHour>();

    lastHour.forEach((log) => {
      const key = `${log.entityType}:${log.field}:${log.tradingMode}`;
      if (!fieldMap.has(key)) {
        fieldMap.set(key, []);
      }
      fieldMap.get(key)!.push(log);
    });

    // Check for reversions within 10 minutes
    fieldMap.forEach((logs, fieldKey) => {
      // Sort by timestamp
      const sortedLogs = logs.sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      // Look for reversions
      for (let i = 1; i < sortedLogs.length; i++) {
        const current = sortedLogs[i];
        const previous = sortedLogs[i - 1];

        const timeDiffMs =
          new Date(current.timestamp).getTime() - new Date(previous.timestamp).getTime();
        const timeDiffMinutes = timeDiffMs / (60 * 1000);

        // Check if current.newValue equals previous.oldValue (reversion)
        if (
          timeDiffMinutes < 10 &&
          current.newValue === previous.oldValue &&
          current.oldValue === previous.newValue
        ) {
          anomalies.push({
            timestamp: new Date().toISOString(),
            anomalyType: 'value_reversion',
            severity: 'warn',
            description: `Field "${current.field}" reverted to previous value within ${timeDiffMinutes.toFixed(1)} minutes`,
            metadata: {
              changedBy: current.changedBy,
              fieldName: current.field,
              entityType: current.entityType,
              timeWindow: `${timeDiffMinutes.toFixed(1)} minutes`,
              revertedValue: current.newValue || 'null',
            },
          });
        }
      }
    });

    return anomalies;
  }

  /**
   * Get override frequency data for charting (last 24 hours, hourly buckets)
   */
  async getOverrideFrequencyData(): Promise<OverrideFrequencyData[]> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    // Get all audit logs from last 24 hours
    const recentLogs = await this.storage.getRecentAuditLogs({
      limit: 10000,
    });

    // Filter to last 24 hours
    const last24Hours = recentLogs.filter(
      (log) => new Date(log.timestamp) >= oneDayAgo
    );

    // Create hourly buckets
    const hourlyData = new Map<string, { paper: number; live: number }>();

    // Initialize 24 hours of buckets
    for (let i = 0; i < 24; i++) {
      const hourDate = new Date(Date.now() - i * 60 * 60 * 1000);
      const hourKey = hourDate.toISOString().slice(0, 13); // YYYY-MM-DDTHH
      hourlyData.set(hourKey, { paper: 0, live: 0 });
    }

    // Count changes by hour and mode
    last24Hours.forEach((log) => {
      const hourKey = new Date(log.timestamp).toISOString().slice(0, 13);
      const bucket = hourlyData.get(hourKey);
      if (bucket) {
        if (log.tradingMode === 'paper') {
          bucket.paper++;
        } else if (log.tradingMode === 'live') {
          bucket.live++;
        }
      }
    });

    // Convert to array and sort by hour
    const result: OverrideFrequencyData[] = Array.from(hourlyData.entries())
      .map(([hour, counts]) => ({
        hour,
        paperCount: counts.paper,
        liveCount: counts.live,
        totalCount: counts.paper + counts.live,
      }))
      .sort((a, b) => a.hour.localeCompare(b.hour));

    return result;
  }

  /**
   * Log anomalies to console with [Audit] prefix
   */
  logAnomalies(anomalies: AnomalyDetectionResult[]): void {
    if (anomalies.length === 0) {
      console.log('[Audit] OverridesAnomaly OK | No anomalies detected in recent audit logs');
      return;
    }

    anomalies.forEach((anomaly) => {
      const prefix = anomaly.severity === 'critical' ? '🔴' : '⚠️';
      console.log(
        `[Audit] OverridesAnomaly ${anomaly.severity.toUpperCase()} ${prefix} | ${anomaly.description}`
      );

      if (anomaly.metadata.changedBy) {
        console.log(`  └─ User: ${anomaly.metadata.changedBy}`);
      }
      if (anomaly.metadata.fieldName) {
        console.log(`  └─ Field: ${anomaly.metadata.fieldName} (${anomaly.metadata.entityType})`);
      }
      if (anomaly.metadata.changeCount) {
        console.log(`  └─ Count: ${anomaly.metadata.changeCount} changes`);
      }
      if (anomaly.metadata.timeWindow) {
        console.log(`  └─ Window: ${anomaly.metadata.timeWindow}`);
      }
    });

    console.log(`[Audit] OverridesAnomaly SUMMARY | ${anomalies.length} anomalies detected`);
  }
}
