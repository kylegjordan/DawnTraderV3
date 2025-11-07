/**
 * Phase 4B: Gemini Adaptive Profiler
 * 
 * Self-regulating telemetry system that learns from runtime behavior
 * and dynamically adjusts cache TTLs and batching intervals
 */

interface ProfileSnapshot {
  ts: number;
  cacheHit: number;
  latency: number;
  cpu: number;
  mem: number;
}

let statsHistory: ProfileSnapshot[] = [];
let isRunning = false;

export class GeminiAdaptiveProfiler {
  private static intervalId: NodeJS.Timeout | null = null;

  static async tick() {
    try {
      // Gather runtime metrics
      const snapshot: ProfileSnapshot = {
        ts: Date.now(),
        cacheHit: this.getCacheHitRatio(),
        latency: this.getAvgLatency(),
        cpu: process.cpuUsage().user / 1e6,
        mem: process.memoryUsage().rss / 1024 / 1024,
      };

      statsHistory.push(snapshot);
      if (statsHistory.length > 30) statsHistory.shift();

      // === Adaptive Logic ===
      // Rule 1: If cache hit ratio drops below 80%, increase TTL to reduce misses
      if (snapshot.cacheHit < 0.8) {
        process.env.DEFAULT_CACHE_TTL = "120000"; // 120s
      } else if (snapshot.cacheHit > 0.9) {
        // Rule 2: If cache hit ratio is very high, can reduce TTL for fresher data
        process.env.DEFAULT_CACHE_TTL = "60000"; // 60s
      }

      // Rule 3: If average latency is high, increase batch interval to reduce overhead
      const avgLatency = this.getMovingAvgLatency();
      if (avgLatency > 140) {
        process.env.TELEMETRY_BATCH_MS = "3000"; // 3s batching
      } else {
        process.env.TELEMETRY_BATCH_MS = "2000"; // 2s batching
      }

      console.log(
        `[Gemini-Adaptive] cache=${snapshot.cacheHit.toFixed(2)} ` +
        `lat=${snapshot.latency.toFixed(0)}ms ` +
        `ttl=${process.env.DEFAULT_CACHE_TTL}ms ` +
        `batch=${process.env.TELEMETRY_BATCH_MS}ms`
      );

      // Record to telemetry if available
      try {
        const { telemetry } = await import('./telemetry-compression.js');
        telemetry.record('adaptive_tick', {
          cacheHit: snapshot.cacheHit,
          latency: snapshot.latency,
          cpu: snapshot.cpu,
          mem: snapshot.mem,
          ttl: Number(process.env.DEFAULT_CACHE_TTL),
          batch: Number(process.env.TELEMETRY_BATCH_MS),
        });
      } catch (error) {
        // Telemetry service may not be available yet
      }
    } catch (error) {
      console.error('[Gemini-Adaptive] Tick error:', error);
    }
  }

  static start() {
    if (isRunning) {
      console.log('[Gemini-Adaptive] Already running');
      return;
    }

    console.log('[Gemini-Adaptive] 🚀 Starting adaptive profiler (60s interval)');
    isRunning = true;

    // Initialize env vars if not set
    if (!process.env.DEFAULT_CACHE_TTL) {
      process.env.DEFAULT_CACHE_TTL = "90000"; // 90s default
    }
    if (!process.env.TELEMETRY_BATCH_MS) {
      process.env.TELEMETRY_BATCH_MS = "2000"; // 2s default
    }

    // Run first tick immediately
    this.tick();

    // Then run every 60 seconds
    this.intervalId = setInterval(() => this.tick(), 60000);
  }

  static stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      isRunning = false;
      console.log('[Gemini-Adaptive] Stopped');
    }
  }

  static getSnapshot(): ProfileSnapshot | null {
    return statsHistory.length > 0 ? statsHistory[statsHistory.length - 1] : null;
  }

  static getHistory(): ProfileSnapshot[] {
    return [...statsHistory];
  }

  private static getCacheHitRatio(): number {
    try {
      // Try to get cache stats from Gemini Cache
      const { cacheStats } = require('./cache');
      const stats = cacheStats();
      return stats.ratio || 0;
    } catch (error) {
      // Fallback: use global cache stats if available
      if ((global as any).cacheStats) {
        return (global as any).cacheStats.ratio || 0;
      }
      return 0;
    }
  }

  private static getAvgLatency(): number {
    // Get current latency from global if available
    if ((global as any).avgLatency) {
      return (global as any).avgLatency;
    }
    
    // Otherwise try to get from profiler
    try {
      const { profiler } = require('./gemini-profiler');
      const metrics = profiler.getMetrics();
      return metrics.avgLatency || 0;
    } catch (error) {
      return 0;
    }
  }

  private static getMovingAvgLatency(): number {
    if (statsHistory.length === 0) return 0;
    const sum = statsHistory.reduce((acc, s) => acc + s.latency, 0);
    return sum / statsHistory.length;
  }
}

// Export singleton start function
export function startAdaptiveProfiler() {
  GeminiAdaptiveProfiler.start();
}

export function stopAdaptiveProfiler() {
  GeminiAdaptiveProfiler.stop();
}

export function getAdaptiveSnapshot() {
  return GeminiAdaptiveProfiler.getSnapshot();
}

export function getAdaptiveHistory() {
  return GeminiAdaptiveProfiler.getHistory();
}
