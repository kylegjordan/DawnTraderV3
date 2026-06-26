import os from 'os';
import { performance } from 'perf_hooks';
import { filePersistence } from './file-persistence';
// P19-B6.7 (#301): the vestigial 2nd-WS coordinator was removed; read the PRIMARY
// adapter's health directly (freshest-symbol age = "is the feed alive at all").
import { krakenWebSocketAdapter } from '../exchanges/kraken/kraken-websocket-adapter.js';
import { freshestSymbolAgeMs } from './market-data/feed-health-aggregate.js';
import { rateControl } from './rate-control';
import { executionTiming } from './execution-timing';

export interface HealthMetrics {
  timestamp: string;
  system: {
    cpuUsage: number;
    memoryUsage: {
      total: number;
      used: number;
      free: number;
      percentUsed: number;
    };
    uptime: number;
  };
  cache: {
    hitRate: number;
    missRate: number;
    totalRequests: number;
    hits: number;
    misses: number;
  };
  latency: {
    cortex: number | null;
    database: number | null;
    api: number | null;
  };
  schedulers: {
    cortexSync: { uptime: number; lastRun: string | null };
    analytics: { uptime: number; lastRun: string | null };
  };
  filePersistence?: {
    successCount: number;
    failureCount: number;
    timeoutCount: number;
    avgLatencyMs: number;
    byCategory: Record<string, { success: number; failed: number; avgLatencyMs: number }>;
  };
  execution?: {
    marketDataSource: 'ws' | 'rest_fallback' | 'N/A';
    lastTickAgeMs: number;
    avgSubmitAckMs: number;
    avgSlippageBps: number;
    avgFeesPerTrade: number;
    ratePressure: string;
  };
  contextRefresh?: {
    lastRefreshISO: string | null;
    avgLatencyMs: number;
    totalRefreshes: number;
    failedRefreshes: number;
    lastDiscrepancyCount: number;
    lastContextSource: string | null; // Phase 8.5 Addendum I
    lastRefreshDelta: number; // Phase 8.5 Addendum I
  };
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'critical';
  warnings: string[];
  criticalIssues: string[];
  metrics: HealthMetrics;
}

export interface AnomalyThresholds {
  cortexLatency: { warning: number; critical: number };
  databaseLatency: { warning: number; critical: number };
  cacheHitRate: { warning: number; critical: number };
  cacheMissRate: { warning: number; critical: number };
}

class SystemHealthMonitor {
  private readonly MODULE_NAME = 'SystemHealthMonitor';
  private startTime: number;
  private latencyTracking: {
    cortex: number[];
    database: number[];
    api: number[];
  };
  
  private cacheStats = {
    hits: 0,
    misses: 0,
  };

  private schedulerStats = {
    cortexSync: { startTime: Date.now(), lastRun: null as string | null },
    analytics: { startTime: Date.now(), lastRun: null as string | null },
  };

  private contextRefreshStats = {
    lastRefreshISO: null as string | null,
    refreshLatencies: [] as number[],
    totalRefreshes: 0,
    failedRefreshes: 0,
    lastDiscrepancyCount: 0,
    lastContextSource: null as string | null, // Phase 8.5 Addendum I
    lastRefreshDelta: 0, // Phase 8.5 Addendum I
  };

  private thresholds: AnomalyThresholds = {
    cortexLatency: { warning: 200, critical: 500 },
    databaseLatency: { warning: 500, critical: 1000 },
    cacheHitRate: { warning: 60, critical: 40 },
    cacheMissRate: { warning: 40, critical: 60 },
  };

  constructor() {
    this.startTime = Date.now();
    this.latencyTracking = {
      cortex: [],
      database: [],
      api: [],
    };
    console.log(`[${this.MODULE_NAME}] ✅ Initialized - System health monitoring active`);
  }

  // Track cache statistics
  recordCacheHit(): void {
    this.cacheStats.hits++;
  }

  recordCacheMiss(): void {
    this.cacheStats.misses++;
  }

  // Track latency measurements
  recordCortexLatency(ms: number): void {
    this.latencyTracking.cortex.push(ms);
    if (this.latencyTracking.cortex.length > 100) {
      this.latencyTracking.cortex.shift();
    }
  }

  recordDatabaseLatency(ms: number): void {
    this.latencyTracking.database.push(ms);
    if (this.latencyTracking.database.length > 100) {
      this.latencyTracking.database.shift();
    }
  }

  recordApiLatency(ms: number): void {
    this.latencyTracking.api.push(ms);
    if (this.latencyTracking.api.length > 100) {
      this.latencyTracking.api.shift();
    }
  }

  // Update scheduler stats
  updateSchedulerRun(scheduler: 'cortexSync' | 'analytics'): void {
    this.schedulerStats[scheduler].lastRun = new Date().toISOString();
  }

  // Phase 8.5 Addendum H: Track context refresh operations
  // Phase 8.5 Addendum I: Track source and delta
  recordContextRefresh(latencyMs: number, success: boolean, discrepancyCount: number = 0): void {
    this.contextRefreshStats.lastRefreshISO = new Date().toISOString();
    this.contextRefreshStats.totalRefreshes++;
    
    if (!success) {
      this.contextRefreshStats.failedRefreshes++;
    }

    this.contextRefreshStats.refreshLatencies.push(latencyMs);
    if (this.contextRefreshStats.refreshLatencies.length > 100) {
      this.contextRefreshStats.refreshLatencies.shift();
    }

    this.contextRefreshStats.lastDiscrepancyCount = discrepancyCount;
    
    // Phase 8.5 Addendum I: Mark source as live-api when refresh succeeds with 0 discrepancies
    if (success && discrepancyCount === 0) {
      this.contextRefreshStats.lastContextSource = 'live-api';
      this.contextRefreshStats.lastRefreshDelta = 0;
    }
  }

  // Calculate average latency
  private getAverageLatency(arr: number[]): number | null {
    if (arr.length === 0) return null;
    return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
  }

  // Get current metrics
  getMetrics(): HealthMetrics {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const cpus = os.cpus();
    
    // Calculate CPU usage (average across all cores)
    const cpuUsage = cpus.reduce((acc, cpu) => {
      const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
      const idle = cpu.times.idle;
      return acc + ((total - idle) / total) * 100;
    }, 0) / cpus.length;

    const totalRequests = this.cacheStats.hits + this.cacheStats.misses;
    const hitRate = totalRequests > 0 
      ? Math.round((this.cacheStats.hits / totalRequests) * 100) 
      : 0;
    const missRate = 100 - hitRate;

    const now = Date.now();
    const uptime = Math.floor((now - this.startTime) / 1000);

    const fileStats = filePersistence.getDetailedStats();

    // Transform byCategory to match expected format
    const transformedByCategory: Record<string, { success: number; failed: number; avgLatencyMs: number }> = {
      report: { success: fileStats.byCategory.reports.saved, failed: 0, avgLatencyMs: fileStats.byCategory.reports.avgLatency },
      log: { success: fileStats.byCategory.logs.saved, failed: 0, avgLatencyMs: fileStats.byCategory.logs.avgLatency },
      export: { success: fileStats.byCategory.exports.saved, failed: 0, avgLatencyMs: fileStats.byCategory.exports.avgLatency },
      analysis: { success: fileStats.byCategory.analysis.saved, failed: 0, avgLatencyMs: fileStats.byCategory.analysis.avgLatency },
    };

    return {
      timestamp: new Date().toISOString(),
      system: {
        cpuUsage: Math.round(cpuUsage * 10) / 10,
        memoryUsage: {
          total: totalMem,
          used: usedMem,
          free: freeMem,
          percentUsed: Math.round((usedMem / totalMem) * 100),
        },
        uptime,
      },
      cache: {
        hitRate,
        missRate,
        totalRequests,
        hits: this.cacheStats.hits,
        misses: this.cacheStats.misses,
      },
      latency: {
        cortex: this.getAverageLatency(this.latencyTracking.cortex),
        database: this.getAverageLatency(this.latencyTracking.database),
        api: this.getAverageLatency(this.latencyTracking.api),
      },
      schedulers: {
        cortexSync: {
          uptime: Math.floor((now - this.schedulerStats.cortexSync.startTime) / 1000),
          lastRun: this.schedulerStats.cortexSync.lastRun,
        },
        analytics: {
          uptime: Math.floor((now - this.schedulerStats.analytics.startTime) / 1000),
          lastRun: this.schedulerStats.analytics.lastRun,
        },
      },
      filePersistence: {
        successCount: fileStats.summary.totalSaved,
        failureCount: fileStats.summary.saveErrors,
        timeoutCount: fileStats.summary.timeouts,
        avgLatencyMs: fileStats.latency.overall,
        byCategory: transformedByCategory,
      },
      execution: this.getExecutionMetrics(),
      contextRefresh: this.getContextRefreshMetrics(),
    };
  }

  // Phase 8.5 Addendum H: Get context refresh metrics
  // Phase 8.5 Addendum I: Include source and delta
  private getContextRefreshMetrics() {
    const avgLatency = this.contextRefreshStats.refreshLatencies.length > 0
      ? Math.round(
          this.contextRefreshStats.refreshLatencies.reduce((a, b) => a + b, 0) / 
          this.contextRefreshStats.refreshLatencies.length
        )
      : 0;

    return {
      lastRefreshISO: this.contextRefreshStats.lastRefreshISO,
      avgLatencyMs: avgLatency,
      totalRefreshes: this.contextRefreshStats.totalRefreshes,
      failedRefreshes: this.contextRefreshStats.failedRefreshes,
      lastDiscrepancyCount: this.contextRefreshStats.lastDiscrepancyCount,
      lastContextSource: this.contextRefreshStats.lastContextSource,
      lastRefreshDelta: this.contextRefreshStats.lastRefreshDelta,
    };
  }

  // Get execution layer metrics (Phase 8.5)
  private getExecutionMetrics() {
    try {
      // (P19-B4b.2 / #300) Read directly from the live services. The
      // realtime-paper-executor that previously wrapped these (getStatus()) was a
      // dead pass-through over exactly these three sources and has been deleted.
      // (P19-B6.7 / #301) Market-data health now reads the PRIMARY adapter, not the
      // removed 2nd-WS coordinator. No fallback feed exists, so the source is the
      // primary WS when connected; lastTickAge is the freshest-symbol age (display).
      const wsStatus = krakenWebSocketAdapter.getStatus();
      const freshestAgeMs = freshestSymbolAgeMs(krakenWebSocketAdapter.getI8EWsHealth());
      const rateStatus = rateControl.getStatus('private');
      const execTimingMetrics = executionTiming.getMetrics(10);

      return {
        marketDataSource: (wsStatus.isConnected ? 'ws' : 'N/A') as 'ws' | 'rest_fallback' | 'N/A',
        lastTickAgeMs: freshestAgeMs ?? -1,
        avgSubmitAckMs: execTimingMetrics.avgSubmitAckMs,
        avgSlippageBps: execTimingMetrics.avgSlippageBps,
        avgFeesPerTrade: execTimingMetrics.avgFeesPerTrade,
        ratePressure: rateStatus.backpressure,
      };
    } catch (error) {
      // Return default values if executor not initialized
      return {
        marketDataSource: 'N/A' as const,
        lastTickAgeMs: -1,
        avgSubmitAckMs: 0,
        avgSlippageBps: 0,
        avgFeesPerTrade: 0,
        ratePressure: 'NONE',
      };
    }
  }

  // Analyze health status with anomaly detection
  analyzeHealth(): HealthStatus {
    const metrics = this.getMetrics();
    const warnings: string[] = [];
    const criticalIssues: string[] = [];

    // Check Cortex latency
    if (metrics.latency.cortex !== null) {
      if (metrics.latency.cortex >= this.thresholds.cortexLatency.critical) {
        criticalIssues.push(`Cortex latency critical: ${metrics.latency.cortex}ms (threshold: ${this.thresholds.cortexLatency.critical}ms)`);
      } else if (metrics.latency.cortex >= this.thresholds.cortexLatency.warning) {
        warnings.push(`Cortex latency elevated: ${metrics.latency.cortex}ms (threshold: ${this.thresholds.cortexLatency.warning}ms)`);
      }
    }

    // Check Database latency
    if (metrics.latency.database !== null) {
      if (metrics.latency.database >= this.thresholds.databaseLatency.critical) {
        criticalIssues.push(`Database latency critical: ${metrics.latency.database}ms (threshold: ${this.thresholds.databaseLatency.critical}ms)`);
      } else if (metrics.latency.database >= this.thresholds.databaseLatency.warning) {
        warnings.push(`Database latency elevated: ${metrics.latency.database}ms (threshold: ${this.thresholds.databaseLatency.warning}ms)`);
      }
    }

    // Check cache hit rate
    if (metrics.cache.totalRequests > 10) { // Only check if we have meaningful data
      if (metrics.cache.hitRate < this.thresholds.cacheHitRate.critical) {
        criticalIssues.push(`Cache hit rate critical: ${metrics.cache.hitRate}% (threshold: ${this.thresholds.cacheHitRate.critical}%)`);
      } else if (metrics.cache.hitRate < this.thresholds.cacheHitRate.warning) {
        warnings.push(`Cache hit rate low: ${metrics.cache.hitRate}% (threshold: ${this.thresholds.cacheHitRate.warning}%)`);
      }

      // Check cache miss rate
      if (metrics.cache.missRate > this.thresholds.cacheMissRate.critical) {
        criticalIssues.push(`Cache miss rate critical: ${metrics.cache.missRate}% (threshold: ${this.thresholds.cacheMissRate.critical}%)`);
      } else if (metrics.cache.missRate > this.thresholds.cacheMissRate.warning) {
        warnings.push(`Cache miss rate elevated: ${metrics.cache.missRate}% (threshold: ${this.thresholds.cacheMissRate.warning}%)`);
      }
    }

    // Check memory usage
    if (metrics.system.memoryUsage.percentUsed > 90) {
      criticalIssues.push(`Memory usage critical: ${metrics.system.memoryUsage.percentUsed}%`);
    } else if (metrics.system.memoryUsage.percentUsed > 80) {
      warnings.push(`Memory usage high: ${metrics.system.memoryUsage.percentUsed}%`);
    }

    // Check CPU usage
    if (metrics.system.cpuUsage > 90) {
      criticalIssues.push(`CPU usage critical: ${metrics.system.cpuUsage}%`);
    } else if (metrics.system.cpuUsage > 75) {
      warnings.push(`CPU usage high: ${metrics.system.cpuUsage}%`);
    }

    // Check scheduler health - warn if no runs in last 5 minutes
    const now = Date.now();
    const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
    
    if (metrics.schedulers.cortexSync.lastRun) {
      const lastRunTime = new Date(metrics.schedulers.cortexSync.lastRun).getTime();
      const timeSinceLastRun = now - lastRunTime;
      
      if (timeSinceLastRun > STALE_THRESHOLD_MS) {
        warnings.push(`Cortex sync scheduler inactive: last run ${Math.floor(timeSinceLastRun / 60000)}m ago`);
      }
    } else if (metrics.schedulers.cortexSync.uptime > 120) { // Only warn after 2 min uptime
      warnings.push(`Cortex sync scheduler has never run (uptime: ${Math.floor(metrics.schedulers.cortexSync.uptime / 60)}m)`);
    }

    if (metrics.schedulers.analytics.lastRun) {
      const lastRunTime = new Date(metrics.schedulers.analytics.lastRun).getTime();
      const timeSinceLastRun = now - lastRunTime;
      
      if (timeSinceLastRun > STALE_THRESHOLD_MS) {
        warnings.push(`Analytics scheduler inactive: last run ${Math.floor(timeSinceLastRun / 60000)}m ago`);
      }
    } else if (metrics.schedulers.analytics.uptime > 120) {
      warnings.push(`Analytics scheduler has never run (uptime: ${Math.floor(metrics.schedulers.analytics.uptime / 60)}m)`);
    }

    const status = criticalIssues.length > 0 
      ? 'critical' 
      : warnings.length > 0 
        ? 'degraded' 
        : 'healthy';

    return {
      status,
      warnings,
      criticalIssues,
      metrics,
    };
  }

  // Get summary for logging
  getSummary(): string {
    const health = this.analyzeHealth();
    const m = health.metrics;
    
    return `Status: ${health.status.toUpperCase()} | ` +
      `CPU: ${m.system.cpuUsage}% | ` +
      `Memory: ${m.system.memoryUsage.percentUsed}% | ` +
      `Cache Hit Rate: ${m.cache.hitRate}% | ` +
      `Cortex Latency: ${m.latency.cortex || 'N/A'}ms | ` +
      `DB Latency: ${m.latency.database || 'N/A'}ms | ` +
      `Uptime: ${Math.floor(m.system.uptime / 60)}m`;
  }

  // Reset cache stats (for testing)
  resetCacheStats(): void {
    this.cacheStats = { hits: 0, misses: 0 };
    console.log(`[${this.MODULE_NAME}] Cache stats reset`);
  }

  // Get uptime percentage
  getUptimePercentage(): number {
    // For now, we assume 100% uptime since we track from start
    // This could be enhanced to track downtime events
    return 100;
  }
}

// Singleton instance
export const systemHealthMonitor = new SystemHealthMonitor();
