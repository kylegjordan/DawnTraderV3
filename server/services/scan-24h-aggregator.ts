/**
 * Phase 8.8.2-UI-ROLLBACK: 24-hour scan activity aggregator
 * 
 * Listens to Stage-3 scanner:breakdown events and maintains rolling 24h metrics
 * for Filter Insights UI Section 2 (24h Filter Activity)
 * 
 * Design:
 * - In-memory rolling window (no DB writes)
 * - Tracks last 24 hours of scan cycles
 * - Provides aggregated metrics: total cycles, unique pairs evaluated/survived
 * - Auto-cleanup of expired entries
 */

import { contextBridge } from './context-bridge';

interface ScanCycleRecord {
  timestamp: Date;
  mode: 'paper' | 'live';
  cycleId: string;
  evaluatedCount: number;
  eligibleCount: number;
  uniquePairsEvaluated: Set<string>; // If we had pair-level data
}

interface Scan24hMetrics {
  mode: 'paper' | 'live';
  totalCycles: number;
  totalEvaluated: number;
  totalSurvived: number;
  avgEvaluatedPerCycle: number;
  avgSurvivedPerCycle: number;
  successRate: number;
  windowStart: string;
  windowEnd: string;
  lastUpdated: string;
}

class Scan24hAggregator {
  private paperCycles: ScanCycleRecord[] = [];
  private liveCycles: ScanCycleRecord[] = [];
  private readonly WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
  private initialized = false;

  constructor() {
    // Intentionally delay initialization until explicitly called
  }

  /**
   * Initialize the aggregator and subscribe to Stage-3 events
   */
  initialize(): void {
    if (this.initialized) {
      console.log('[Scan24hAggregator] Already initialized');
      return;
    }

    // Subscribe to scanner:breakdown events
    this.subscribeToEvents();
    
    // Start cleanup timer (run every 5 minutes)
    setInterval(() => this.cleanup(), 5 * 60 * 1000);

    this.initialized = true;
    console.log('[Scan24hAggregator] Initialized - listening for Stage-3 events');
  }

  /**
   * Subscribe to WebSocket scanner:breakdown events
   */
  private subscribeToEvents(): void {
    // Listen to contextBridge messages
    // Note: This is a simplified approach - in production we'd use a proper event emitter
    const originalBroadcast = contextBridge.broadcast.bind(contextBridge);
    
    contextBridge.broadcast = (update: any) => {
      // Intercept scanner:breakdown events
      if (update.type === 'scanner:breakdown:paper' || update.type === 'scanner:breakdown:live') {
        const mode = update.type === 'scanner:breakdown:paper' ? 'paper' : 'live';
        this.recordCycle(mode, update.payload);
      }
      
      // Continue with original broadcast
      return originalBroadcast(update);
    };
  }

  /**
   * Record a new scan cycle
   */
  private recordCycle(mode: 'paper' | 'live', payload: any): void {
    const record: ScanCycleRecord = {
      timestamp: new Date(),
      mode,
      cycleId: payload.cycleId,
      evaluatedCount: payload.evaluatedCount || 0,
      eligibleCount: payload.eligibleCount || 0,
      uniquePairsEvaluated: new Set(), // Would populate if we had pair-level data
    };

    if (mode === 'paper') {
      this.paperCycles.push(record);
    } else {
      this.liveCycles.push(record);
    }

    console.log(`[Scan24hAggregator] Recorded ${mode} cycle:`, {
      cycleId: record.cycleId,
      evaluated: record.evaluatedCount,
      eligible: record.eligibleCount,
      totalCycles: mode === 'paper' ? this.paperCycles.length : this.liveCycles.length,
    });
  }

  /**
   * Remove cycles older than 24 hours
   */
  private cleanup(): void {
    const cutoff = Date.now() - this.WINDOW_MS;
    
    const paperBefore = this.paperCycles.length;
    this.paperCycles = this.paperCycles.filter(c => c.timestamp.getTime() > cutoff);
    
    const liveBefore = this.liveCycles.length;
    this.liveCycles = this.liveCycles.filter(c => c.timestamp.getTime() > cutoff);

    if (paperBefore !== this.paperCycles.length || liveBefore !== this.liveCycles.length) {
      console.log(`[Scan24hAggregator] Cleanup: paper ${paperBefore}->${this.paperCycles.length}, live ${liveBefore}->${this.liveCycles.length}`);
    }
  }

  /**
   * Get 24h metrics for a specific mode
   */
  getMetrics(mode: 'paper' | 'live'): Scan24hMetrics {
    const cycles = mode === 'paper' ? this.paperCycles : this.liveCycles;
    
    // Clean up expired entries first
    const cutoff = Date.now() - this.WINDOW_MS;
    const validCycles = cycles.filter(c => c.timestamp.getTime() > cutoff);

    if (validCycles.length === 0) {
      return {
        mode,
        totalCycles: 0,
        totalEvaluated: 0,
        totalSurvived: 0,
        avgEvaluatedPerCycle: 0,
        avgSurvivedPerCycle: 0,
        successRate: 0,
        windowStart: new Date(Date.now() - this.WINDOW_MS).toISOString(),
        windowEnd: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
      };
    }

    const totalEvaluated = validCycles.reduce((sum, c) => sum + c.evaluatedCount, 0);
    const totalSurvived = validCycles.reduce((sum, c) => sum + c.eligibleCount, 0);
    const totalCycles = validCycles.length;

    return {
      mode,
      totalCycles,
      totalEvaluated,
      totalSurvived,
      avgEvaluatedPerCycle: totalCycles > 0 ? Math.round(totalEvaluated / totalCycles) : 0,
      avgSurvivedPerCycle: totalCycles > 0 ? Math.round(totalSurvived / totalCycles) : 0,
      successRate: totalEvaluated > 0 ? (totalSurvived / totalEvaluated) * 100 : 0,
      windowStart: new Date(validCycles[0].timestamp).toISOString(),
      windowEnd: new Date(validCycles[validCycles.length - 1].timestamp).toISOString(),
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Get current cycle count (for debugging)
   */
  getStatus(): { paper: number; live: number; initialized: boolean } {
    return {
      paper: this.paperCycles.length,
      live: this.liveCycles.length,
      initialized: this.initialized,
    };
  }
}

// Singleton instance
export const scan24hAggregator = new Scan24hAggregator();
