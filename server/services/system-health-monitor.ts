import os from 'os';
import { performance } from 'perf_hooks';

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
    };
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
