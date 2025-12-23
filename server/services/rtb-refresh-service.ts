/**
 * Directive 8.8.4-A4.R10R-2 — RTB Refresh Service Extraction
 * 
 * Decouples RTB refresh and rank logic from the FX5 scan loop.
 * Runs as an independent service with its own 15-second refresh interval.
 * All pricing data is sourced exclusively from the unified price-cache.ts.
 * 
 * This service:
 * - Operates independently of FX5 scanner timing
 * - Uses price-cache.ts for all pricing (no direct Kraken calls)
 * - Refreshes and re-ranks RTB signals every 15 seconds
 * - Enforces rate governance compliance via price cache
 */

import { priceCache } from './price-cache';
import { readyToBuyService } from '../core/rtb/ready_to_buy_service';
import type { TradingMode } from './guardrail-policy';

const REFRESH_INTERVAL_MS = 15000;

class RTBRefreshService {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private isRefreshing = false;

  start(): void {
    if (this.isRunning) {
      console.log('[A4.R10R-2][RTBRefresh] Already running');
      return;
    }

    this.isRunning = true;
    console.log('[A4.R10R-2][RTBRefresh] Service started (interval: 15s)');

    this.timer = setInterval(() => {
      this.refreshCycle().catch(err => {
        console.error('[A4.R10R-2][RTBRefresh] Cycle error:', err?.message || err);
      });
    }, REFRESH_INTERVAL_MS);
  }

  private async refreshCycle(): Promise<void> {
    if (this.isRefreshing) {
      console.log('[A4.R10R-2][RTBRefresh] Skipping - refresh in progress');
      return;
    }

    this.isRefreshing = true;
    const startTime = Date.now();

    try {
      console.log('[A4.R10R-2][RTBRefresh][CYCLE_START]');

      for (const mode of ['paper', 'live'] as TradingMode[]) {
        await this.refreshMode(mode);
      }

      const elapsed = Date.now() - startTime;
      console.log(`[A4.R10R-2][RTBRefresh][CYCLE_COMPLETE] duration=${elapsed}ms`);
    } finally {
      this.isRefreshing = false;
    }
  }

  private async refreshMode(mode: TradingMode): Promise<void> {
    const signals = await readyToBuyService.getQueuedSignals(mode);

    if (!signals || signals.length === 0) {
      return;
    }

    const symbols = signals.map((s: { symbol: string }) => s.symbol);

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
      console.log(`[A4.R10R-2][RTBRefresh] mode=${mode} signals=${signals.length} priced=${validPrices.size}`);
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    console.log('[A4.R10R-2][RTBRefresh] Service stopped');
  }

  isActive(): boolean {
    return this.isRunning;
  }
}

export const rtbRefreshService = new RTBRefreshService();
