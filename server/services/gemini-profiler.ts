/**
 * Gemini Profiler - Phase 4A-5
 * 
 * Performance profiling hooks for Gemini-Guided Optimization
 * Tracks metrics toward Phase 4A targets:
 * - Startup time ≤8s
 * - Cache hit ratio ≥85%
 * - API latency ≤110ms
 * - Telemetry reduction ≥60%
 * - Frontend bundle ≤1MB gzipped
 */

interface LatencyBucket {
  count: number;
  totalMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  samples: number[];
}

interface ProfilerMetrics {
  startup: {
    startTime: number;
    serverReadyTime?: number;
    lazyLoadCompleteTime?: number;
    totalStartupMs?: number;
  };
  cache: {
    hits: number;
    misses: number;
    hitRatio: number;
  };
  api: {
    totalRequests: number;
    endpoints: Map<string, LatencyBucket>;
  };
  telemetry: {
    totalLogs: number;
    sampledLogs: number;
    samplingRatio: number;
  };
}

class GeminiProfiler {
  private metrics: ProfilerMetrics = {
    startup: {
      startTime: Date.now(),
    },
    cache: {
      hits: 0,
      misses: 0,
      hitRatio: 0,
    },
    api: {
      totalRequests: 0,
      endpoints: new Map(),
    },
    telemetry: {
      totalLogs: 0,
      sampledLogs: 0,
      samplingRatio: 0,
    },
  };

  private statsIntervalId: NodeJS.Timeout | null = null;

  constructor() {
    // Log metrics summary every 60 seconds
    this.statsIntervalId = setInterval(() => this.logStats(), 60000);
  }

  /**
   * Record server ready event
   */
  recordServerReady() {
    this.metrics.startup.serverReadyTime = Date.now();
    this.metrics.startup.totalStartupMs =
      this.metrics.startup.serverReadyTime - this.metrics.startup.startTime;
    console.log(
      `[Gemini-Profiler] 🚀 Server ready in ${this.metrics.startup.totalStartupMs}ms`
    );
  }

  /**
   * Record lazy loading complete event
   */
  recordLazyLoadComplete() {
    this.metrics.startup.lazyLoadCompleteTime = Date.now();
    const totalTime =
      this.metrics.startup.lazyLoadCompleteTime - this.metrics.startup.startTime;
    console.log(`[Gemini-Profiler] ⚡ Lazy load complete in ${totalTime}ms`);
  }

  /**
   * Record API request latency
   */
  recordApiLatency(endpoint: string, latencyMs: number) {
    this.metrics.api.totalRequests++;

    let bucket = this.metrics.api.endpoints.get(endpoint);
    if (!bucket) {
      bucket = {
        count: 0,
        totalMs: 0,
        minMs: Infinity,
        maxMs: 0,
        p50Ms: 0,
        p95Ms: 0,
        p99Ms: 0,
        samples: [],
      };
      this.metrics.api.endpoints.set(endpoint, bucket);
    }

    bucket.count++;
    bucket.totalMs += latencyMs;
    bucket.minMs = Math.min(bucket.minMs, latencyMs);
    bucket.maxMs = Math.max(bucket.maxMs, latencyMs);

    // Keep last 100 samples for percentile calculation
    bucket.samples.push(latencyMs);
    if (bucket.samples.length > 100) {
      bucket.samples.shift();
    }

    // Calculate percentiles
    const sorted = [...bucket.samples].sort((a, b) => a - b);
    bucket.p50Ms = sorted[Math.floor(sorted.length * 0.5)] || 0;
    bucket.p95Ms = sorted[Math.floor(sorted.length * 0.95)] || 0;
    bucket.p99Ms = sorted[Math.floor(sorted.length * 0.99)] || 0;
  }

  /**
   * Record cache hit
   */
  recordCacheHit() {
    this.metrics.cache.hits++;
    this.updateCacheRatio();
  }

  /**
   * Record cache miss
   */
  recordCacheMiss() {
    this.metrics.cache.misses++;
    this.updateCacheRatio();
  }

  /**
   * Update cache hit ratio
   */
  private updateCacheRatio() {
    const total = this.metrics.cache.hits + this.metrics.cache.misses;
    this.metrics.cache.hitRatio = total > 0 ? this.metrics.cache.hits / total : 0;
  }

  /**
   * Record telemetry stats
   */
  recordTelemetryStats(total: number, sampled: number) {
    this.metrics.telemetry.totalLogs = total;
    this.metrics.telemetry.sampledLogs = sampled;
    this.metrics.telemetry.samplingRatio =
      total > 0 ? sampled / total : 0;
  }

  /**
   * Get current metrics
   */
  getMetrics(): ProfilerMetrics {
    return { ...this.metrics };
  }

  /**
   * Get Phase 4A target status
   */
  getTargetStatus() {
    const startupMs = this.metrics.startup.totalStartupMs || 0;
    const cacheHitRatio = this.metrics.cache.hitRatio * 100;

    // Calculate average API latency across top endpoints
    let totalLatency = 0;
    let endpointCount = 0;
    for (const bucket of this.metrics.api.endpoints.values()) {
      if (bucket.count > 10) {
        // Only include endpoints with sufficient samples
        totalLatency += bucket.totalMs / bucket.count;
        endpointCount++;
      }
    }
    const avgApiLatency = endpointCount > 0 ? totalLatency / endpointCount : 0;

    const telemetryReduction = (1 - this.metrics.telemetry.samplingRatio) * 100;

    return {
      startup: {
        current: startupMs,
        target: 8000,
        status: startupMs <= 8000 ? '✅' : '❌',
        progress: `${startupMs}ms / 8000ms`,
      },
      cache: {
        current: cacheHitRatio,
        target: 85,
        status: cacheHitRatio >= 85 ? '✅' : '❌',
        progress: `${cacheHitRatio.toFixed(1)}% / 85%`,
      },
      apiLatency: {
        current: avgApiLatency,
        target: 110,
        status: avgApiLatency <= 110 ? '✅' : avgApiLatency === 0 ? '⏳' : '❌',
        progress: avgApiLatency > 0 ? `${avgApiLatency.toFixed(0)}ms / 110ms` : 'measuring...',
      },
      telemetry: {
        current: telemetryReduction,
        target: 60,
        status: telemetryReduction >= 60 ? '✅' : '❌',
        progress: `${telemetryReduction.toFixed(1)}% / 60%`,
      },
    };
  }

  /**
   * Log statistics summary
   * Phase 4B: Enhanced with adaptive profiling metrics
   */
  logStats() {
    const targets = this.getTargetStatus();

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('   Gemini Profiler - Phase 4A/4B Optimization Metrics');
    console.log('═══════════════════════════════════════════════════════');
    console.log(
      `${targets.startup.status} Startup Time:    ${targets.startup.progress}`
    );
    console.log(
      `${targets.cache.status} Cache Hit Ratio: ${targets.cache.progress}`
    );
    console.log(
      `${targets.apiLatency.status} API Latency:     ${targets.apiLatency.progress}`
    );
    console.log(
      `${targets.telemetry.status} Telemetry Reduction: ${targets.telemetry.progress}`
    );
    
    // Phase 4B: Add adaptive profiling metrics
    const cpuUsage = process.cpuUsage().user / 1e6;
    const memUsage = process.memoryUsage().rss / 1024 / 1024;
    const currentLatency = targets.apiLatency.current;
    const cacheHit = this.metrics.cache.hitRatio;
    const batchMs = Number(process.env.TELEMETRY_BATCH_MS) || 2000;
    const ttl = Number(process.env.DEFAULT_CACHE_TTL) || 90000;
    
    console.log('═══════════════════════════════════════════════════════');
    console.log(
      `[Gemini-Profile] CPU=${Math.round(cpuUsage / 1000)}% | ` +
      `Mem=${Math.round(memUsage)} MB | ` +
      `Lat=${Math.round(currentLatency)} ms | ` +
      `CacheHit=${cacheHit.toFixed(2)} | ` +
      `BatchMS=${batchMs} | ` +
      `TTL=${ttl}`
    );
    console.log('═══════════════════════════════════════════════════════');

    // Log top 5 slowest endpoints
    const sortedEndpoints = Array.from(this.metrics.api.endpoints.entries())
      .filter(([_, bucket]) => bucket.count > 5)
      .sort(([_, a], [__, b]) => b.totalMs / b.count - a.totalMs / a.count)
      .slice(0, 5);

    if (sortedEndpoints.length > 0) {
      console.log('\nTop 5 Slowest Endpoints:');
      for (const [endpoint, bucket] of sortedEndpoints) {
        const avg = bucket.totalMs / bucket.count;
        console.log(
          `  ${endpoint.padEnd(40)} avg=${avg.toFixed(0)}ms p95=${bucket.p95Ms}ms (${bucket.count} calls)`
        );
      }
      console.log('');
    }
  }

  /**
   * Shutdown profiler
   */
  shutdown() {
    if (this.statsIntervalId) {
      clearInterval(this.statsIntervalId);
      this.statsIntervalId = null;
    }
    console.log('[Gemini-Profiler] Shutdown complete');
  }
}

// Singleton instance
export const profiler = new GeminiProfiler();
