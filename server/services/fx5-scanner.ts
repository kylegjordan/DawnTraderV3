/**
 * FX5 Scanner Service - Always-On 30-Second Market Scanner
 * Phase 8.8.2 FINAL CORRECTION
 * 
 * This service drives Stage-3 state updates independently of trading engine status.
 * Runs every 30 seconds for both paper and live modes, providing real-time
 * market data via WebSocket events.
 * 
 * Architecture:
 * - Initializes at server startup
 * - Runs 30-second intervals for each mode
 * - Loads screener filters and executes FX5 filtering
 * - Computes breakdown from filter results (NOT diagnostics)
 * - Updates Stage-3 cache and emits WebSocket events
 * - Operates independently of trading engine state
 */

import { storage } from '../storage.js';
import { FilteredPairsService } from './filtered-pairs-service.js';
import { updateStage3Cache } from './stage3-state-cache.js';
import { emitStage3Events, FilterBreakdown } from './stage3-emitter.js';
import type { ScreenerFilters } from '@shared/schema';

const SCAN_INTERVAL_MS = 30 * 1000; // 30 seconds

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
  private paperTimer: NodeJS.Timeout | null = null;
  private liveTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor() {
    this.filteredPairsService = new FilteredPairsService();
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
   */
  private async scanMode(mode: 'paper' | 'live'): Promise<ScanResult | null> {
    try {
      // Load screener filters for this mode
      const filters = await storage.getScreenerFilters({ mode });
      if (!filters) {
        console.warn(`[FX5Scanner][${mode}] No filters found, skipping scan`);
        return null;
      }

      // Execute FX5 filtering via FilteredPairsService
      const result = await this.filteredPairsService.getValidPairs(mode, filters, true);
      
      // Get total universe count (all tradable pairs)
      const evaluatedCount = result.totalPairs;
      const eligibleCount = result.eligiblePairs;
      const ineligibleCount = evaluatedCount - eligibleCount;

      // Compute breakdown from filter results
      const breakdown = await this.computeBreakdown(mode, filters);

      // Get active trades count
      const activeTrades = await storage.getActiveTrades(mode);
      const activePoolCount = activeTrades.length;

      // Calculate rotation stats
      const universeSize = filters.universeSize || 100;
      const topNCount = eligibleCount;
      const tierBCount = 0; // Future enhancement (Phase 8.9)

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

      // Update Stage-3 cache FIRST
      await updateStage3Cache(mode, {
        evaluatedCount,
        eligibleCount,
        ineligibleCount,
        topNCount,
        tierBCount,
        rotation: {
          topEndUniverseSize: universeSize,
          tierBUniverseSize: 0,
        },
        activePoolCount,
        latestEligibleSymbols: result.filteredPairs.slice(0, 10).map(p => p.symbol),
      });

      // Emit Stage-3 WebSocket events SECOND
      await emitStage3Events(mode, breakdown);

      console.log(`[FX5Scanner][${mode}] ✅ Scan complete (evaluated=${evaluatedCount}, eligible=${eligibleCount})`);

      return scanResult;
    } catch (error) {
      console.error(`[FX5Scanner][${mode}] Scan error:`, error);
      return null;
    }
  }

  /**
   * Compute filter breakdown from FX5 results
   * This mirrors the diagnostic logic but uses real-time data
   */
  private async computeBreakdown(
    mode: 'paper' | 'live',
    filters: ScreenerFilters
  ): Promise<FilterBreakdown> {
    // Get all eligible and ineligible pairs with reasons
    // For now, use diagnostic service to get breakdown
    // TODO: Implement direct breakdown computation from FilteredPairsService
    
    const systemContext = await storage.getSystemContext(mode);
    if (!systemContext?.lastStartedBy) {
      // Return empty breakdown if no context
      return {
        failed_min_volume: 0,
        failed_spread: 0,
        failed_daily_range: 0,
        failed_min_price: 0,
        failed_stablecoin: 0,
        failed_quote_currency: 0,
        failed_history: 0,
        failed_market_cap: 0,
        failed_guardrail_risk: 0,
        already_active: 0,
        passed_all_filters: 0,
      };
    }

    // Temporary: Use diagnostic service for breakdown
    // In production, this should compute breakdown directly from FX5 filtering
    const { PaperSimDiagnosticService } = await import('./paper-sim-diagnostic.js');
    const diagnosticService = new PaperSimDiagnosticService();
    
    const diagnosticResult = await diagnosticService.performUniverseScan({
      mode,
      limit: 1546, // Full universe
      trace: false,
      strategies: false, // Just filter breakdown
      userId: systemContext.lastStartedBy,
    });

    return diagnosticResult.breakdown;
  }
}

// Singleton instance
export const fx5Scanner = new Fx5ScannerService();
