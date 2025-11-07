import { logger } from '../utils/structured-logger';
import { EventEmitter } from 'events';

interface MetricValue {
  value: number;
  timestamp: Date;
  labels: Record<string, string>;
}

interface SLOThreshold {
  target: number;
  amberThreshold: number; // 10% over target
  redThreshold: number;   // 20% over target
  unit: string;
}

interface SLOStatus {
  name: string;
  current: number;
  target: number;
  status: 'green' | 'amber' | 'red';
  breachDuration: number; // milliseconds
  unit: string;
}

export interface SystemMetrics {
  uptime: number;
  cpuUsage: number;
  memoryUsage: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
  };
  eventLoopLag: number;
  timestamp: Date;
}

export interface SubsystemMetrics {
  signalLatency: MetricValue[];
  orderLatency: MetricValue[];
  portfolioLatency: MetricValue[];
  queueDepth: MetricValue[];
  cacheHitRatio: MetricValue[];
  dbQueryLatency: MetricValue[];
}

class MetricsService extends EventEmitter {
  private metrics: Map<string, MetricValue[]> = new Map();
  private startTime: Date = new Date();
  private sloThresholds: Map<string, SLOThreshold> = new Map();
  private sloBreaches: Map<string, Date> = new Map();
  private lastEventLoopCheck: number = Date.now();

  constructor() {
    super();
    this.initializeSLOs();
    this.startEventLoopMonitor();
    logger.info('[MetricsService] Initialized', { service: 'metrics-service', phase: '5C' });
  }

  private initializeSLOs(): void {
    // Define 5 key SLOs from Phase 5C requirements
    this.sloThresholds.set('signal_latency_ms', {
      target: 1000, // 1 second
      amberThreshold: 1100, // 10% over
      redThreshold: 1200,   // 20% over
      unit: 'ms',
    });

    this.sloThresholds.set('order_latency_ms', {
      target: 2000, // 2 seconds
      amberThreshold: 2200,
      redThreshold: 2400,
      unit: 'ms',
    });

    this.sloThresholds.set('portfolio_staleness_ms', {
      target: 5000, // 5 seconds
      amberThreshold: 5500,
      redThreshold: 6000,
      unit: 'ms',
    });

    this.sloThresholds.set('queue_depth', {
      target: 10, // max 10 queued items
      amberThreshold: 11,
      redThreshold: 12,
      unit: 'items',
    });

    this.sloThresholds.set('event_loop_lag_ms', {
      target: 50, // 50ms max lag
      amberThreshold: 55,
      redThreshold: 60,
      unit: 'ms',
    });
  }

  private startEventLoopMonitor(): void {
    setInterval(() => {
      const now = Date.now();
      const lag = now - this.lastEventLoopCheck - 1000; // Expected 1s interval
      this.lastEventLoopCheck = now;

      if (lag > 0) {
        this.recordMetric('event_loop_lag_ms', lag, {
          service: 'event-loop-monitor',
          phase: '5C',
        });
      }
    }, 1000);
  }

  recordMetric(name: string, value: number, labels: Record<string, string> = {}): void {
    const metricValue: MetricValue = {
      value,
      timestamp: new Date(),
      labels,
    };

    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    const values = this.metrics.get(name)!;
    values.push(metricValue);

    // Keep only last 1000 values per metric
    if (values.length > 1000) {
      values.shift();
    }

    // Check SLO thresholds
    this.checkSLO(name, value);

    // Emit metric for WebSocket broadcast
    this.emit('metric', { name, value, labels, timestamp: metricValue.timestamp });

    logger.metric(name, value, labels);
  }

  private checkSLO(metricName: string, value: number): void {
    const threshold = this.sloThresholds.get(metricName);
    if (!threshold) return;

    let status: 'green' | 'amber' | 'red' = 'green';
    let shouldAlert = false;

    if (value >= threshold.redThreshold) {
      status = 'red';
      shouldAlert = true;
    } else if (value >= threshold.amberThreshold) {
      status = 'amber';
      shouldAlert = true;
    }

    if (shouldAlert) {
      const breachStart = this.sloBreaches.get(metricName);
      const now = new Date();

      if (!breachStart) {
        this.sloBreaches.set(metricName, now);
      }

      const breachDuration = breachStart 
        ? now.getTime() - breachStart.getTime() 
        : 0;

      // Alert if breach duration > 5 minutes for RED
      if (status === 'red' && breachDuration > 5 * 60 * 1000) {
        this.emitAlert(metricName, value, threshold, status, breachDuration);
      }
    } else {
      // Clear breach if back to green
      this.sloBreaches.delete(metricName);
    }
  }

  private emitAlert(
    metricName: string,
    value: number,
    threshold: SLOThreshold,
    status: 'amber' | 'red',
    breachDuration: number
  ): void {
    const alert = {
      metric: metricName,
      value,
      target: threshold.target,
      status,
      breachDuration,
      timestamp: new Date(),
    };

    this.emit('alert', alert);

    logger.warn(`[MetricsService] SLO BREACH: ${metricName}`, {
      service: 'metrics-service',
      phase: '5C',
      metric: metricName,
      value,
      target: threshold.target,
      status,
      breachDurationMs: breachDuration,
    });

    // TODO: Webhook placeholder for external alerting
    // await this.sendWebhookAlert(alert);
  }

  getSLOStatus(): SLOStatus[] {
    const status: SLOStatus[] = [];

    for (const [name, threshold] of this.sloThresholds.entries()) {
      const values = this.metrics.get(name) || [];
      const recentValue = values.length > 0 ? values[values.length - 1].value : 0;

      let sloStatus: 'green' | 'amber' | 'red' = 'green';
      if (recentValue >= threshold.redThreshold) {
        sloStatus = 'red';
      } else if (recentValue >= threshold.amberThreshold) {
        sloStatus = 'amber';
      }

      const breachStart = this.sloBreaches.get(name);
      const breachDuration = breachStart 
        ? Date.now() - breachStart.getTime() 
        : 0;

      status.push({
        name,
        current: recentValue,
        target: threshold.target,
        status: sloStatus,
        breachDuration,
        unit: threshold.unit,
      });
    }

    return status;
  }

  getSystemMetrics(): SystemMetrics {
    const memUsage = process.memoryUsage();
    const uptime = Date.now() - this.startTime.getTime();

    // Get event loop lag from recent metrics
    const eventLoopLagValues = this.metrics.get('event_loop_lag_ms') || [];
    const recentLag = eventLoopLagValues.length > 0 
      ? eventLoopLagValues[eventLoopLagValues.length - 1].value 
      : 0;

    return {
      uptime,
      cpuUsage: process.cpuUsage().user / 1000000, // Convert to seconds
      memoryUsage: {
        rss: memUsage.rss,
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
      },
      eventLoopLag: recentLag,
      timestamp: new Date(),
    };
  }

  getSubsystemMetrics(): SubsystemMetrics {
    return {
      signalLatency: this.getRecentMetrics('signal_latency_ms', 100),
      orderLatency: this.getRecentMetrics('order_latency_ms', 100),
      portfolioLatency: this.getRecentMetrics('portfolio_latency_ms', 100),
      queueDepth: this.getRecentMetrics('queue_depth', 100),
      cacheHitRatio: this.getRecentMetrics('cache_hit_ratio', 100),
      dbQueryLatency: this.getRecentMetrics('db_query_latency_ms', 100),
    };
  }

  private getRecentMetrics(name: string, limit: number): MetricValue[] {
    const values = this.metrics.get(name) || [];
    return values.slice(-limit);
  }

  getAllMetrics(): Record<string, MetricValue[]> {
    const result: Record<string, MetricValue[]> = {};
    for (const [name, values] of this.metrics.entries()) {
      result[name] = values.slice(-100); // Last 100 values per metric
    }
    return result;
  }

  reset(): void {
    this.metrics.clear();
    this.sloBreaches.clear();
    this.startTime = new Date();
    logger.info('[MetricsService] Metrics reset', { service: 'metrics-service', phase: '5C' });
  }
}

export const metricsService = new MetricsService();
