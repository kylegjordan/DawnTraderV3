/**
 * Directive A4.R10R-3 — Central Clock Synchronized RTB Refresh Service
 * 
 * Transitions from internal setInterval() to Central Clock tick synchronization.
 * This ensures deterministic refresh scheduling, eliminates drift and overlap,
 * and enables precise measurement of cycle duration and coverage.
 * 
 * Architecture:
 * - Micro-cycle: 15 seconds (one bucket refresh)
 * - Macro-cycle: 120 seconds (full coverage of all 8 buckets)
 * - All pricing sourced exclusively from unified price-cache.ts
 * - No direct Kraken API calls permitted
 * 
 * Directive A4.R10R-3.T4 — Adaptive Concurrency Tuner (ACT)
 * - Dynamically adjusts POOL_SIZE based on cycle duration and CPU headroom
 * - Target cycle duration: 5,000ms
 * - Safe CPU threshold: <60%
 * - Pool range: 3-10 workers
 * 
 * Previous: A4.R10R-2 (Internal setInterval, 15s refresh)
 * Current: A4.R10R-3 (Central Clock sync, bucket-based refresh)
 */

import { priceCache } from './price-cache';
import { readyToBuyService } from '../core/rtb/ready_to_buy_service';
import { centralClock, type ClockTick } from './central-clock';
import type { TradingMode } from './guardrail-policy';
import { 
  ACT_CONFIG, 
  getAdaptivePoolSize, 
  setAdaptivePoolSize 
} from './adaptive-pool-config';

// Re-export for server/index.ts compatibility
export { getAdaptivePoolSize } from './adaptive-pool-config';

// Cycle metrics for adaptive tuning
interface CycleMetrics {
  duration: number;
  cpuLoad: number;
  timestamp: number;
}

const recentCycles: CycleMetrics[] = [];
const MAX_CYCLE_HISTORY = 5;

/**
 * Calculate CPU load based on process.cpuUsage() and cycle duration
 */
function calculateCpuLoad(startCpuUsage: NodeJS.CpuUsage, cycleDurationMs: number): number {
  const endCpuUsage = process.cpuUsage(startCpuUsage);
  // Convert microseconds to percentage of cycle time
  const totalCpuMicros = endCpuUsage.user + endCpuUsage.system;
  const cycleDurationMicros = cycleDurationMs * 1000;
  const cpuPercent = (totalCpuMicros / cycleDurationMicros) * 100;
  return Math.min(100, Math.max(0, cpuPercent));
}

/**
 * Adaptive Concurrency Tuner: Adjust pool size based on performance metrics
 */
function adaptPoolSize(avgDuration: number, cpuLoad: number): void {
  const prevPoolSize = getAdaptivePoolSize();
  let newPoolSize = prevPoolSize;
  
  // Scale UP: Fast cycles with low CPU = room to increase concurrency
  if (avgDuration < ACT_CONFIG.TARGET_DURATION_MS * 0.8 && 
      cpuLoad < ACT_CONFIG.SAFE_CPU_THRESHOLD * 0.8 && 
      prevPoolSize < ACT_CONFIG.MAX_POOL) {
    newPoolSize = prevPoolSize + ACT_CONFIG.SCALE_STEP;
    setAdaptivePoolSize(newPoolSize);
    console.log(`[8.8.4-A4.R10R-3.T4][ACT][POOL_ADJUST] INCREASED poolSize=${newPoolSize} (was ${prevPoolSize}) duration=${avgDuration.toFixed(0)}ms cpu=${cpuLoad.toFixed(1)}%`);
  }
  // Scale DOWN: Slow cycles or high CPU = reduce concurrency
  else if (avgDuration > ACT_CONFIG.TARGET_DURATION_MS * 1.5 || 
           cpuLoad > ACT_CONFIG.SAFE_CPU_THRESHOLD) {
    newPoolSize = Math.max(ACT_CONFIG.MIN_POOL, prevPoolSize - ACT_CONFIG.SCALE_STEP);
    if (newPoolSize !== prevPoolSize) {
      setAdaptivePoolSize(newPoolSize);
      console.log(`[8.8.4-A4.R10R-3.T4][ACT][POOL_ADJUST] DECREASED poolSize=${newPoolSize} (was ${prevPoolSize}) duration=${avgDuration.toFixed(0)}ms cpu=${cpuLoad.toFixed(1)}%`);
    }
  }
}

/**
 * Record cycle metrics and trigger adaptive tuning
 * 
 * T4 Requirement: Only adapt pool size after collecting exactly 5 cycles
 * to ensure smooth adaptation using a full rolling average.
 */
function recordCycleMetrics(duration: number, cpuLoad: number): void {
  recentCycles.push({ duration, cpuLoad, timestamp: Date.now() });
  
  // Keep only recent history
  while (recentCycles.length > MAX_CYCLE_HISTORY) {
    recentCycles.shift();
  }
  
  // T4: Only adapt after collecting 5 full cycles (rolling average requirement)
  if (recentCycles.length === MAX_CYCLE_HISTORY) {
    const avgDuration = recentCycles.reduce((sum, c) => sum + c.duration, 0) / recentCycles.length;
    const avgCpu = recentCycles.reduce((sum, c) => sum + c.cpuLoad, 0) / recentCycles.length;
    
    adaptPoolSize(avgDuration, avgCpu);
  }
}

class RTBRefreshService {
  private isRunning = false;
  private isRefreshing = false;
  
  private readonly MICRO_CYCLE_INTERVAL = 15;
  private readonly MACRO_CYCLE_INTERVAL = 120;
  private readonly TOTAL_BUCKETS = this.MACRO_CYCLE_INTERVAL / this.MICRO_CYCLE_INTERVAL;
  
  private signalBuckets: Map<number, Set<string>> = new Map();
  private lastBucketAssignment: Map<string, number> = new Map();

  constructor() {
    for (let i = 0; i < this.TOTAL_BUCKETS; i++) {
      this.signalBuckets.set(i, new Set());
    }
  }

  /**
   * A4.R10R-3.FIX: Made start() idempotent to handle server restarts.
   * Module caching can preserve isRunning=true across restarts, which previously
   * prevented re-subscription to Central Clock ticks. Now we always re-subscribe
   * to ensure reliable tick processing after hot reloads.
   */
  start(): void {
    const wasRunning = this.isRunning;
    this.isRunning = true;

    console.log(`[A4.R10R-3][RTBRefresh] Starting service... (wasRunning=${wasRunning})`);

    centralClock.subscribe('RTBRefreshService', (tick: ClockTick) => {
      this.onTick(tick.tickNumber);
    });

    console.log('[A4.R10R-3][RTBRefresh][SYNCED] Service synchronized with Central Clock (micro=15s, macro=120s, buckets=8)');
    console.log(`[A4.R10R-3][RTBRefresh][INIT] Central Clock running: ${centralClock.getIsRunning()}, tickNumber: ${centralClock.getTickNumber()}`);
  }

  private onTick(tickNumber: number): void {
    if (tickNumber % this.MICRO_CYCLE_INTERVAL !== 0) return;

    if (this.isRefreshing) {
      console.log('[A4.R10R-3][RTBRefresh] Skipping - refresh in progress');
      return;
    }

    const bucketIndex = Math.floor((tickNumber / this.MICRO_CYCLE_INTERVAL) % this.TOTAL_BUCKETS);
    
    this.refreshBucket(bucketIndex, tickNumber).catch(err => {
      console.error(`[A4.R10R-3][RTBRefresh] Bucket ${bucketIndex} error:`, err?.message || err);
    });
  }

  private async refreshBucket(bucketIndex: number, tickNumber?: number): Promise<void> {
    this.isRefreshing = true;
    const start = Date.now();
    const startCpuUsage = process.cpuUsage();

    try {
      await this.assignSignalsToBuckets();
      
      const bucket = this.signalBuckets.get(bucketIndex) || new Set();
      const bucketSize = bucket.size;
      
      console.log(`[A4.R10R-3][RTBRefresh][CYCLE_START] bucket=${bucketIndex} size=${bucketSize} poolSize=${getAdaptivePoolSize()}`);

      for (const mode of ['paper', 'live'] as TradingMode[]) {
        await this.refreshModeSignals(mode, bucketIndex);
      }

      const duration = Date.now() - start;
      const cpuLoad = calculateCpuLoad(startCpuUsage, duration);
      
      // T4 Metrics logging
      console.log(`[8.8.4-A4.R10R-3.T4][RTBRefresh][METRICS] duration=${duration}ms cpu=${cpuLoad.toFixed(1)}% poolSize=${getAdaptivePoolSize()}`);
      console.log(`[A4.R10R-3][RTBRefresh][CYCLE_COMPLETE] bucket=${bucketIndex} size=${bucketSize} duration=${duration}ms`);
      
      // Trigger adaptive concurrency tuning
      recordCycleMetrics(duration, cpuLoad);
    } finally {
      this.isRefreshing = false;
    }
  }

  private async assignSignalsToBuckets(): Promise<void> {
    const currentSignalIds = new Set<string>();
    
    for (const mode of ['paper', 'live'] as TradingMode[]) {
      const signals = await readyToBuyService.getQueuedSignals(mode);
      if (!signals) continue;
      
      for (const signal of signals) {
        const signalKey = `${mode}:${signal.symbol}:${signal.strategy}`;
        currentSignalIds.add(signalKey);
        
        if (!this.lastBucketAssignment.has(signalKey)) {
          const hash = this.hashString(signalKey);
          const bucketIndex = hash % this.TOTAL_BUCKETS;
          this.lastBucketAssignment.set(signalKey, bucketIndex);
          this.signalBuckets.get(bucketIndex)?.add(signalKey);
        }
      }
    }
    
    for (const [signalKey, bucketIndex] of this.lastBucketAssignment.entries()) {
      if (!currentSignalIds.has(signalKey)) {
        this.signalBuckets.get(bucketIndex)?.delete(signalKey);
        this.lastBucketAssignment.delete(signalKey);
      }
    }
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  private async refreshModeSignals(mode: TradingMode, bucketIndex: number): Promise<void> {
    const signals = await readyToBuyService.getQueuedSignals(mode);

    if (!signals || signals.length === 0) {
      return;
    }

    const bucket = this.signalBuckets.get(bucketIndex) || new Set();
    const bucketSignals = signals.filter(s => {
      const signalKey = `${mode}:${s.symbol}:${s.strategy}`;
      return bucket.has(signalKey);
    });

    if (bucketSignals.length === 0) {
      return;
    }

    const symbols = bucketSignals.map((s: { symbol: string }) => s.symbol);

    for (const symbol of symbols) {
      priceCache.subscribe(symbol, 'readyToBuy');
    }

    const prices = await priceCache.getBatch('readyToBuy', symbols);

    const validPrices = new Map<string, number>();
    for (const symbol of symbols) {
      const cached = prices.get(symbol);
      if (cached && cached.price > 0) {
        validPrices.set(symbol, cached.price);
      }
    }

    if (validPrices.size > 0) {
      await readyToBuyService.refreshAndRank(mode);
      
      console.log(`[A4.R10R-3][RTBRefresh] mode=${mode} bucket=${bucketIndex} signals=${bucketSignals.length} priced=${validPrices.size}`);
    }
  }

  stop(): void {
    if (!this.isRunning) return;
    
    centralClock.unsubscribe('RTBRefreshService');
    this.isRunning = false;
    console.log('[A4.R10R-3][RTBRefresh] Service stopped');
  }

  isActive(): boolean {
    return this.isRunning;
  }

  getBucketStats(): { bucketIndex: number; size: number }[] {
    const stats: { bucketIndex: number; size: number }[] = [];
    for (let i = 0; i < this.TOTAL_BUCKETS; i++) {
      stats.push({
        bucketIndex: i,
        size: this.signalBuckets.get(i)?.size || 0
      });
    }
    return stats;
  }
}

export const rtbRefreshService = new RTBRefreshService();
