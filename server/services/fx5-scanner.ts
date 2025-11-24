/**
 * FX5 Scanner Service - Always-On 30-Second Market Scanner
 * REB 2.1 RESTORATION (Phase 8.6.7 Architecture)
 * REB 2.6: Passive learning mode enforcement for Active Pool
 * 
 * Restored to batch-first → FX5 filter architecture per Phase 8.6.7 truth state.
 * Uses collectMixedBatch() for 60-pair Top-N/Tier-B rotation instead of universe-scale filtering.
 * 
 * Architecture:
 * - Initializes at server startup
 * - Runs 30-second intervals for each mode
 * - Loads screener filters and executes batch-first FX5 filtering
 * - Uses collectMixedBatch() from market-scanner.ts (Phase 8.6.7)
 * - Updates Stage-3 cache and emits WebSocket events
 * - Operates independently of trading engine state
 * - REB 2.6: Respects passive learning flag - pool stays empty when passiveLearning=true
 */

import { storage } from '../storage.js';
import { FilteredPairsService } from './filtered-pairs-service.js';
import { KrakenService } from './kraken.js';
import { updateStage3Cache } from './stage3-state-cache.js';
import { emitStage3Events, FilterBreakdown } from './stage3-emitter.js';
import { collectMixedBatch, BatchResult } from './market-scanner.js';
import { activeFilterPool, type ActiveFilteredPair } from './active-filter-pool.js';
import { scan24hAggregator } from './scan-24h-aggregator.js';
import { systemConfigService } from './system-config.js';
import { nanoid } from 'nanoid';
import type { ScreenerFilters } from '@shared/schema';

const SCAN_INTERVAL_MS = 30 * 1000; // 30 seconds
const CYCLES_PER_HOUR = Math.round(3600000 / SCAN_INTERVAL_MS); // 120 for 30s intervals

interface ScanResult {
  mode: 'paper' | 'live';
  evaluatedCount: number;
  eligibleCount: number;
  ineligibleCount: number;
  breakdown: FilterBreakdown;
  topNCount: number;
  tierBCount: number;
  activePoolCount: number;
}

export class Fx5ScannerService {
  private filteredPairsService: FilteredPairsService;
  private krakenService: KrakenService;
  private paperTimer: NodeJS.Timeout | null = null;
  private liveTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor() {
    this.filteredPairsService = new FilteredPairsService();
    this.krakenService = new KrakenService();
  }

  /**
   * Start the FX5 scanner for both modes
   * This runs independently of trading engine state
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[FX5Scanner] Already running');
      return;
    }

    this.isRunning = true;
    console.log('[FX5Scanner] Starting 30-second scanner for paper and live modes');

    // Run initial scan for both modes
    await this.scanMode('paper');
    await this.scanMode('live');

    // Schedule recurring scans
    this.paperTimer = setInterval(async () => {
      try {
        await this.scanMode('paper');
      } catch (error) {
        console.error('[FX5Scanner] Paper scan error:', error);
      }
    }, SCAN_INTERVAL_MS);

    this.liveTimer = setInterval(async () => {
      try {
        await this.scanMode('live');
      } catch (error) {
        console.error('[FX5Scanner] Live scan error:', error);
      }
    }, SCAN_INTERVAL_MS);

    console.log('[FX5Scanner] ✅ Started (interval=30s)');
  }

  /**
   * Stop the FX5 scanner
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    if (this.paperTimer) {
      clearInterval(this.paperTimer);
      this.paperTimer = null;
    }

    if (this.liveTimer) {
      clearInterval(this.liveTimer);
      this.liveTimer = null;
    }

    this.isRunning = false;
    console.log('[FX5Scanner] Stopped');
  }

  /**
   * Execute FX5 scan for a specific mode
   * REB 2.1: Uses batch-first architecture from Phase 8.6.7
   */
  private async scanMode(mode: 'paper' | 'live'): Promise<ScanResult | null> {
    try {
      // Load screener filters for this mode
      const filters = await storage.getScreenerFilters({ mode });
      if (!filters) {
        console.warn(`[FX5Scanner][${mode}] No filters found, skipping scan`);
        return null;
      }

      // REB 2.1: Execute batch-first FX5 scanning (Phase 8.6.7 truth state)
      const batchResult: BatchResult = await collectMixedBatch(
        this.krakenService,
        filters,
        mode
      );
      
      // Extract results from batch pipeline
      const { survivors, breakdown, metrics } = batchResult;
      const {
        evaluatedCount,
        eligibleCount,
        ineligibleCount,
        topNCount,
        tierBCount,
        krakenUniverseSize,
        topEndUniverseSize,
        tierBUniverseSize,
      } = metrics;

      // Get active trades count
      const activeTrades = await storage.getActiveTrades(mode);
      const activePoolCount = activeTrades.length;

      const scanResult: ScanResult = {
        mode,
        evaluatedCount,
        eligibleCount,
        ineligibleCount,
        breakdown,
        topNCount,
        tierBCount,
        activePoolCount,
      };

      // REB 2.2: Add survivors to Active Filter Pool (deduped, TTL-managed)
      // REB 2.2/2.6: Passive mode enforcement - clear pool when engine stopped OR passiveLearning enabled
      console.log(`[8.6.7][DEBUG] FX5 scan complete - survivors.length=${survivors.length}, eligibleCount=${eligibleCount}`);
      
      // Check if trading engine is active for this mode (from database, not aggregator)
      const context = await storage.getSystemContext(mode);
      const isEngineActive = context?.isEngineActive || false;

      // REB 2.6: Check passive learning flag (behavioral control)
      const isPassiveLearning = systemConfigService.isPassiveLearningEnabled();

      // REB 2.2: Enforce passive mode - clear pool if engine stopped
      activeFilterPool.enforcePassiveModeIfStopped(mode, isEngineActive);

      // REB 2.6: Only populate pool if engine ACTIVE AND NOT passive learning
      if (isEngineActive && !isPassiveLearning) {
        // Engine ACTIVE + Passive Learning DISABLED: Add survivors to Active Filter Pool
        const poolStats = activeFilterPool.addSurvivors(mode, survivors);
        console.log(`[8.6.7][DEBUG] Active Pool stats: added=${poolStats.added}, updated=${poolStats.updated}, skipped=${poolStats.skipped}`);
      } else if (isPassiveLearning) {
        // REB 2.6: Passive learning mode - pool stays empty
        console.log(`[8.6.9][PassivePool] Passive learning enabled - Active Pool not populated (correct behavior)`);
      }

      // Get the current active pool (deduped, non-expired)
      const activeFilteredPoolEntries = activeFilterPool.getActivePool(mode);
      
      const cycleStartTimestamp = new Date().toISOString();
      const cycleEndTimestamp = new Date().toISOString();
      
      // REB 2.8.4: Generate unique scan cycle ID (survives server restarts)
      const scanCycleId = `cycle_${mode}_${nanoid(12)}`;

      // Update Stage-3 cache FIRST with Phase 8.6.7 metrics
      // REB 2.2: Use persistent Active Filter Pool instead of fresh pool
      await updateStage3Cache(mode, {
        scanCycleId, // REB 2.8.4: Unique string ID for this scan
        cycleStartTimestamp,
        cycleEndTimestamp,
        krakenUniverseSize,
        evaluatedCount, // Now 60 (batch size) instead of 1,370
        eligibleCount,
        ineligibleCount,
        topNCount,  // Actual Top-N survivors (not stub value)
        tierBCount, // Actual Tier-B survivors (not 0)
        rotation: {
          topEndUniverseSize,  // 100 (Top-N universe size)
          tierBUniverseSize,   // 1,270 (Tier-B universe size)
        },
        cyclesPerHour: CYCLES_PER_HOUR,
        cycleFrequencyMs: SCAN_INTERVAL_MS,
        nextScanInMs: SCAN_INTERVAL_MS,
        activePoolCount: activeFilteredPoolEntries.length, // REB 2.2: Use actual pool size
        activeFilteredPool: activeFilteredPoolEntries, // REB 2.2: Use persistent pool
        latestEligibleSymbols: survivors.slice(0, 10).map(s => s.symbol),
      });

      // Emit Stage-3 WebSocket events SECOND
      // Extract symbol arrays for unique 24h tracking
      const evaluatedSymbols = survivors.map(s => s.symbol); // All evaluated symbols from batch
      const survivedSymbols = survivors.map(s => s.symbol);   // All survivors
      await emitStage3Events(mode, breakdown, { evaluatedSymbols, survivedSymbols });

      console.log(`[FX5Scanner][${mode}] ✅ Scan complete (evaluated=${evaluatedCount}, eligible=${eligibleCount})`);

      return scanResult;
    } catch (error) {
      console.error(`[FX5Scanner][${mode}] Scan error:`, error);
      return null;
    }
  }

  /**
   * REB 2.1: Old computeBreakdown() method removed
   * 
   * Replaced with batch-first collectMixedBatch() from market-scanner.ts
   * See Phase 8.6.7 truth state for architecture details
   */
}

// Singleton instance
export const fx5Scanner = new Fx5ScannerService();
