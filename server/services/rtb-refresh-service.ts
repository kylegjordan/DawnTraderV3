/**
 * 🔒 LOCKED MODULE — DO NOT MODIFY
 * Directive: 8.8.4-A4.R10R-4 (Core System Hardening)
 * Owner: Dawn Trader Core
 * Summary: This module is production-locked. Changes require a formal directive.
 * 
 * Previous: Directive A4.R10R-3 — Central Clock Synchronized RTB Refresh Service
 * 
 * Architecture:
 * - Micro-cycle: 15 seconds (one bucket refresh)
 * - Macro-cycle: 120 seconds (full coverage of all 8 buckets)
 * - All pricing sourced exclusively from unified price-cache.ts
 * - No direct Kraken API calls permitted
 * 
 * Features:
 * - T4: Adaptive Concurrency Tuner (ACT) - dynamic pool sizing
 * - T5: Dynamic Pool Broadcast & Load Balancing - lag protection
 * - R3: RTB Bucket Optimization - 85% cycle duration reduction
 */

import { priceCache } from './price-cache';
import { readyToBuyService } from '../core/rtb/ready_to_buy_service';
import { centralClock, type ClockTick } from './central-clock.js';
import type { TradingMode } from './guardrail-policy';
import { 
  ACT_CONFIG, 
  getAdaptivePoolSize, 
  setAdaptivePoolSize 
} from './adaptive-pool-config';
import { poolBus } from './pool-broadcast';
import { dataAggregator } from './data-aggregator.js';

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

// T5: Smoothed CPU averaging (5-sample rolling)
const cpuSamples: number[] = [];
const MAX_CPU_SAMPLES = 5;

// T5: Event loop lag tracking
let lastExpectedTick = 0;

/**
 * T5: Record CPU sample and return smoothed average
 */
function recordCpuSample(cpu: number): number {
  cpuSamples.push(cpu);
  if (cpuSamples.length > MAX_CPU_SAMPLES) {
    cpuSamples.shift();
  }
  return cpuSamples.reduce((a, b) => a + b, 0) / cpuSamples.length;
}

/**
 * Calculate CPU load based on process.cpuUsage() and cycle duration
 */
function calculateCpuLoad(startCpuUsage: NodeJS.CpuUsage, cycleDurationMs: number): number {
  const endCpuUsage = process.cpuUsage(startCpuUsage);
  const totalCpuMicros = endCpuUsage.user + endCpuUsage.system;
  const cycleDurationMicros = cycleDurationMs * 1000;
  const cpuPercent = (totalCpuMicros / cycleDurationMicros) * 100;
  return Math.min(100, Math.max(0, cpuPercent));
}

/**
 * T5: Broadcast pool size change to dependent services
 */
function broadcastPoolUpdate(newPoolSize: number): void {
  poolBus.emit('POOL_UPDATE', newPoolSize);
  console.log(`[8.8.4-A4.R10R-3.T5][ACT][BROADCAST] pool=${newPoolSize}`);
}

/**
 * Adaptive Concurrency Tuner: Adjust pool size based on performance metrics
 * 
 * T5 Thresholds:
 * - Scale UP: avgCpu < 55% AND avgDuration < 5000ms
 * - Scale DOWN: avgCpu > 60% OR avgDuration > 8000ms
 */
function adaptPoolSize(avgDuration: number, avgCpu: number, eventLoopLag: number): void {
  const prevPoolSize = getAdaptivePoolSize();
  let newPoolSize = prevPoolSize;
  let reason = '';
  
  // T5: Event-loop lag protection - force reduction if lag > 2ms
  if (eventLoopLag > 2) {
    newPoolSize = Math.max(ACT_CONFIG.MIN_POOL, prevPoolSize - 1);
    if (newPoolSize !== prevPoolSize) {
      setAdaptivePoolSize(newPoolSize);
      broadcastPoolUpdate(newPoolSize);
      console.log(`[8.8.4-A4.R10R-3.T5][ACT][POOL_ADJUST] DECREASED poolSize=${newPoolSize} (was ${prevPoolSize}) reason=lag_protection lag=${eventLoopLag.toFixed(2)}ms`);
    }
    return;
  }
  
  // T5: Scale UP - Fast cycles with low CPU
  if (avgDuration < 5000 && avgCpu < 55 && prevPoolSize < ACT_CONFIG.MAX_POOL) {
    newPoolSize = prevPoolSize + ACT_CONFIG.SCALE_STEP;
    reason = 'fast_cycle_low_cpu';
  }
  // T5: Scale DOWN - Slow cycles or high CPU
  else if (avgDuration > 8000 || avgCpu > 60) {
    newPoolSize = Math.max(ACT_CONFIG.MIN_POOL, prevPoolSize - ACT_CONFIG.SCALE_STEP);
    reason = avgCpu > 60 ? 'high_cpu' : 'slow_cycle';
  }
  
  if (newPoolSize !== prevPoolSize) {
    setAdaptivePoolSize(newPoolSize);
    broadcastPoolUpdate(newPoolSize);
    const action = newPoolSize > prevPoolSize ? 'INCREASED' : 'DECREASED';
    console.log(`[8.8.4-A4.R10R-3.T5][ACT][POOL_ADJUST] ${action} poolSize=${newPoolSize} (was ${prevPoolSize}) duration=${avgDuration.toFixed(0)}ms avgCpu=${avgCpu.toFixed(1)}% reason=${reason}`);
  }
}

/**
 * Record cycle metrics and trigger adaptive tuning
 * 
 * T4/T5 Requirement: Only adapt pool size after collecting exactly 5 cycles
 * to ensure smooth adaptation using a full rolling average.
 */
function recordCycleMetrics(duration: number, cpuLoad: number, eventLoopLag: number): void {
  // T5: Use smoothed CPU average
  const avgCpu = recordCpuSample(cpuLoad);
  
  recentCycles.push({ duration, cpuLoad, timestamp: Date.now() });
  
  // Keep only recent history
  while (recentCycles.length > MAX_CYCLE_HISTORY) {
    recentCycles.shift();
  }
  
  // Log T5 load metrics every cycle
  console.log(`[8.8.4-A4.R10R-3.T5][RTBRefresh][LOAD] duration=${duration}ms avgCpu=${avgCpu.toFixed(1)}% lag=${eventLoopLag.toFixed(2)}ms pool=${getAdaptivePoolSize()}`);
  
  // T4/T5: Only adapt after collecting 5 full cycles (rolling average requirement)
  if (recentCycles.length === MAX_CYCLE_HISTORY) {
    const avgDuration = recentCycles.reduce((sum, c) => sum + c.duration, 0) / recentCycles.length;
    
    adaptPoolSize(avgDuration, avgCpu, eventLoopLag);
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
    
    // T5: Calculate event loop lag from expected tick timing
    const expectedTickMs = tickNumber !== undefined ? tickNumber * 1000 : start;
    const eventLoopLag = lastExpectedTick > 0 ? Math.max(0, start - lastExpectedTick - (this.MICRO_CYCLE_INTERVAL * 1000)) : 0;
    lastExpectedTick = start;

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
      
      // T4/T5 Metrics logging
      console.log(`[8.8.4-A4.R10R-3.T4][RTBRefresh][METRICS] duration=${duration}ms cpu=${cpuLoad.toFixed(1)}% poolSize=${getAdaptivePoolSize()}`);
      console.log(`[A4.R10R-3][RTBRefresh][CYCLE_COMPLETE] bucket=${bucketIndex} size=${bucketSize} duration=${duration}ms`);
      
      // Directive 8.8.4-L1: Capture RTB refresh data for learning aggregation
      dataAggregator.capture('RTB_REFRESH', {
        bucket: bucketIndex,
        signalsProcessed: bucketSize,
        duration,
        cpuLoad,
        eventLoopLag,
        poolSize: getAdaptivePoolSize()
      }).catch(() => {});
      
      // Trigger adaptive concurrency tuning with T5 lag tracking
      recordCycleMetrics(duration, cpuLoad, eventLoopLag);
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

  /**
   * Directive 8.8.4-A4.R10R-3.R3: Bucket-optimized signal refresh
   * Only processes signals assigned to the current bucket instead of all signals
   */
  private async refreshModeSignals(mode: TradingMode, bucketIndex: number): Promise<void> {
    const refreshStart = Date.now();
    const signals = await readyToBuyService.getQueuedSignals(mode);

    if (!signals || signals.length === 0) {
      console.log(`[A4.R10R-3.R3][RTBRefresh][SKIP] bucket=${bucketIndex} mode=${mode} (no signals)`);
      return;
    }

    const bucket = this.signalBuckets.get(bucketIndex) || new Set();
    const bucketSignals = signals.filter(s => {
      const signalKey = `${mode}:${s.symbol}:${s.strategy}`;
      return bucket.has(signalKey);
    });

    if (bucketSignals.length === 0) {
      console.log(`[A4.R10R-3.R3][RTBRefresh][SKIP] bucket=${bucketIndex} mode=${mode} (empty bucket)`);
      return;
    }

    // R3: Log bucket activity
    console.log(`[A4.R10R-3.R3][RTBRefresh][BUCKET] bucket=${bucketIndex} size=${bucketSignals.length}`);

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
      const rankStart = Date.now();
      
      // R3: Pass bucket signal keys to refreshAndRank for optimized processing
      await readyToBuyService.refreshAndRank(mode, bucket);
      
      const rankDuration = Date.now() - rankStart;
      
      console.log(`[A4.R10R-3][RTBRefresh] mode=${mode} bucket=${bucketIndex} signals=${bucketSignals.length} priced=${validPrices.size} rankDuration=${rankDuration}ms totalDuration=${Date.now() - refreshStart}ms`);
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
