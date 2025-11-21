/**
 * Phase 8.8.2-UI-FINAL-RESTORE: 24-hour scan activity aggregator
 * 
 * Explicitly called by Stage-3 emitter (no monkey-patching) to maintain rolling 24h metrics
 * for Filter Insights UI Section 2 (24h Filter Activity) and Section 4 (Filter Breakdown)
 * 
 * Design:
 * - In-memory rolling window (no DB writes)
 * - Tracks last 24 hours of scan cycles ONLY when trading engine is ACTIVE
 * - Provides aggregated metrics: total cycles, unique pairs evaluated/survived, breakdown
 * - Auto-cleanup of expired entries
 * - Engine-state gated: resets on ACTIVE→STOPPED transition
 */

import { contextBridge } from './context-bridge.js';
import { storage } from '../storage.js';

interface ScanCycleRecord {
  timestamp: Date;
  mode: 'paper' | 'live';
  cycleId: number;
  evaluatedCount: number;
  eligibleCount: number;
  evaluatedSymbols: Set<string>; // Unique symbols evaluated in this cycle
  survivedSymbols: Set<string>;  // Unique symbols that passed all filters in this cycle
}

interface Scan24hMetrics {
  mode: 'paper' | 'live';
  windowStart: string;
  windowEnd: string;
  totalCycles: number;
  totalEvaluated: number;
  totalSurvived: number;
  uniqueEvaluated: number;
  uniqueSurvived: number;
}

class Scan24hAggregator {
  private paperCycles: ScanCycleRecord[] = [];
  private liveCycles: ScanCycleRecord[] = [];
  private readonly WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
  private initialized = false;

  // Track engine state (ACTIVE vs STOPPED) per mode
  private paperEngineActive = false;
  private liveEngineActive = false;

  constructor() {
    // Intentionally delay initialization until explicitly called
  }

  /**
   * Initialize the aggregator
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('[Scan24hAggregator] Already initialized');
      return;
    }

    // Get initial engine states from database
    await this.syncEngineStatesFromDB();

    // Listen for trading engine state changes via contextBridge
    this.setupStateListeners();

    // Start cleanup timer (run every 5 minutes)
    setInterval(() => this.cleanup(), 5 * 60 * 1000);

    this.initialized = true;
    console.log('[Scan24hAggregator] Initialized - ready to receive explicit scan records');
    console.log(`[Scan24hAggregator] Initial states: paper=${this.paperEngineActive ? 'ACTIVE' : 'STOPPED'}, live=${this.liveEngineActive ? 'ACTIVE' : 'STOPPED'}`);
  }

  /**
   * Sync engine states from database on startup
   */
  private async syncEngineStatesFromDB(): Promise<void> {
    try {
      const [paperContext, liveContext] = await Promise.all([
        storage.getSystemContext('paper'),
        storage.getSystemContext('live'),
      ]);

      this.paperEngineActive = paperContext?.isEngineActive || false;
      this.liveEngineActive = liveContext?.isEngineActive || false;

      console.log('[Scan24hAggregator] Synced engine states from DB:', {
        paper: this.paperEngineActive,
        live: this.liveEngineActive,
      });
    } catch (error) {
      console.error('[Scan24hAggregator] Error syncing engine states from DB:', error);
      // Default to STOPPED
      this.paperEngineActive = false;
      this.liveEngineActive = false;
    }
  }

  /**
   * Setup listeners for trading engine state changes
   */
  private setupStateListeners(): void {
    // Note: contextBridge is a singleton that broadcasts to WebSocket clients
    // We need to monitor the database context updates instead
    // This will be called periodically via manual sync or we check on each recordCycle
    setInterval(() => this.syncEngineStatesFromDB(), 10000); // Sync every 10 seconds
  }

  /**
   * Update engine state for a mode
   * Called when trading_state_changed events occur
   */
  setEngineState(mode: 'paper' | 'live', isActive: boolean): void {
    const wasActive = mode === 'paper' ? this.paperEngineActive : this.liveEngineActive;

    if (mode === 'paper') {
      this.paperEngineActive = isActive;
    } else {
      this.liveEngineActive = isActive;
    }

    // On ACTIVE → STOPPED transition, reset the window
    if (wasActive && !isActive) {
      if (mode === 'paper') {
        this.paperCycles = [];
      } else {
        this.liveCycles = [];
      }
      console.log(`[Scan24hAggregator] Reset ${mode} window (ACTIVE→STOPPED transition)`);
    }

    console.log(`[Scan24hAggregator] Engine state updated: ${mode} = ${isActive ? 'ACTIVE' : 'STOPPED'}`);
  }

  /**
   * Record a new scan cycle
   * Called explicitly by Stage3Emitter after each scan completes
   * 
   * @param mode - paper or live
   * @param data - scan cycle data including symbols
   */
  recordCycle(
    mode: 'paper' | 'live',
    data: {
      cycleId: number;
      evaluatedCount: number;
      eligibleCount: number;
      evaluatedSymbols?: string[];
      survivedSymbols?: string[];
    }
  ): void {
    // Phase 8.8.2-DIAGNOSTIC: Log what we receive
    console.log('[Scan24hAggregator][recordCycle] Received:', {
      mode,
      cycleId: data.cycleId,
      evaluatedCount: data.evaluatedCount,
      eligibleCount: data.eligibleCount,
      evaluatedSymbolsLength: data.evaluatedSymbols?.length ?? 0,
      survivedSymbolsLength: data.survivedSymbols?.length ?? 0,
      evaluatedSymbolsSample: data.evaluatedSymbols?.slice(0, 3),
      survivedSymbolsSample: data.survivedSymbols?.slice(0, 3),
    });

    // Gate: only record if engine is ACTIVE for this mode
    const isActive = mode === 'paper' ? this.paperEngineActive : this.liveEngineActive;
    
    if (!isActive) {
      // Silent skip - we don't record passive learning scans
      console.log(`[Scan24hAggregator][recordCycle] Skipped - ${mode} engine is STOPPED`);
      return;
    }

    const record: ScanCycleRecord = {
      timestamp: new Date(),
      mode,
      cycleId: data.cycleId,
      evaluatedCount: data.evaluatedCount || 0,
      eligibleCount: data.eligibleCount || 0,
      evaluatedSymbols: new Set(data.evaluatedSymbols || []),
      survivedSymbols: new Set(data.survivedSymbols || []),
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
      uniqueEvaluated: record.evaluatedSymbols.size,
      uniqueSurvived: record.survivedSymbols.size,
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
        windowStart: new Date(Date.now() - this.WINDOW_MS).toISOString(),
        windowEnd: new Date().toISOString(),
        totalCycles: 0,
        totalEvaluated: 0,
        totalSurvived: 0,
        uniqueEvaluated: 0,
        uniqueSurvived: 0,
      };
    }

    // Aggregate totals
    const totalEvaluated = validCycles.reduce((sum, c) => sum + c.evaluatedCount, 0);
    const totalSurvived = validCycles.reduce((sum, c) => sum + c.eligibleCount, 0);
    const totalCycles = validCycles.length;

    // Calculate unique symbols across all cycles
    const allEvaluatedSymbols = new Set<string>();
    const allSurvivedSymbols = new Set<string>();

    validCycles.forEach(cycle => {
      cycle.evaluatedSymbols.forEach(s => allEvaluatedSymbols.add(s));
      cycle.survivedSymbols.forEach(s => allSurvivedSymbols.add(s));
    });

    return {
      mode,
      windowStart: new Date(validCycles[0].timestamp).toISOString(),
      windowEnd: new Date(validCycles[validCycles.length - 1].timestamp).toISOString(),
      totalCycles,
      totalEvaluated,
      totalSurvived,
      uniqueEvaluated: allEvaluatedSymbols.size,
      uniqueSurvived: allSurvivedSymbols.size,
    };
  }

  /**
   * Get current cycle count (for debugging)
   */
  getStatus(): { paper: number; live: number; initialized: boolean; paperActive: boolean; liveActive: boolean } {
    return {
      paper: this.paperCycles.length,
      live: this.liveCycles.length,
      initialized: this.initialized,
      paperActive: this.paperEngineActive,
      liveActive: this.liveEngineActive,
    };
  }
}

// Singleton instance
export const scan24hAggregator = new Scan24hAggregator();
