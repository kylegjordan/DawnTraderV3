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
 * Previous: A4.R10R-2 (Internal setInterval, 15s refresh)
 * Current: A4.R10R-3 (Central Clock sync, bucket-based refresh)
 */

import { priceCache } from './price-cache';
import { readyToBuyService } from '../core/rtb/ready_to_buy_service';
import { centralClock, type ClockTick } from './central-clock';
import type { TradingMode } from './guardrail-policy';

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

    try {
      await this.assignSignalsToBuckets();
      
      const bucket = this.signalBuckets.get(bucketIndex) || new Set();
      const bucketSize = bucket.size;
      
      console.log(`[A4.R10R-3][RTBRefresh][CYCLE_START] bucket=${bucketIndex} size=${bucketSize}`);

      for (const mode of ['paper', 'live'] as TradingMode[]) {
        await this.refreshModeSignals(mode, bucketIndex);
      }

      const duration = Date.now() - start;
      console.log(`[A4.R10R-3][RTBRefresh][CYCLE_COMPLETE] bucket=${bucketIndex} size=${bucketSize} duration=${duration}ms`);
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
