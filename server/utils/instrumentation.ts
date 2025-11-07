import { metricsService } from '../services/metrics-service';
import { logger } from './structured-logger';

export class PerformanceTimer {
  private startTime: number;
  private metricName: string;
  private labels: Record<string, string>;

  constructor(metricName: string, labels: Record<string, string> = {}) {
    this.metricName = metricName;
    this.labels = labels;
    this.startTime = Date.now();
  }

  end(): number {
    const duration = Date.now() - this.startTime;
    metricsService.recordMetric(this.metricName, duration, this.labels);
    return duration;
  }
}

export function instrumentAsync<T>(
  metricName: string,
  labels: Record<string, string>,
  fn: () => Promise<T>
): Promise<T> {
  const timer = new PerformanceTimer(metricName, labels);
  
  return fn()
    .then((result) => {
      timer.end();
      return result;
    })
    .catch((error) => {
      const duration = timer.end();
      logger.error(`[Instrumentation] ${metricName} failed after ${duration}ms`, labels, error);
      throw error;
    });
}

export function instrumentSync<T>(
  metricName: string,
  labels: Record<string, string>,
  fn: () => T
): T {
  const timer = new PerformanceTimer(metricName, labels);
  
  try {
    const result = fn();
    timer.end();
    return result;
  } catch (error) {
    const duration = timer.end();
    logger.error(`[Instrumentation] ${metricName} failed after ${duration}ms`, labels, error as Error);
    throw error;
  }
}

export function recordCacheMetric(hit: boolean, labels: Record<string, string> = {}): void {
  metricsService.recordMetric('cache_hit_ratio', hit ? 1 : 0, {
    ...labels,
    result: hit ? 'hit' : 'miss',
  });
}

export function recordQueueDepth(depth: number, labels: Record<string, string> = {}): void {
  metricsService.recordMetric('queue_depth', depth, labels);
}

export function recordDBQuery(durationMs: number, queryType: string, table: string): void {
  metricsService.recordMetric('db_query_latency_ms', durationMs, {
    queryType,
    table,
  });
}
