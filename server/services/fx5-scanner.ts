/**
 * FX5 Scanner Service - Always-On 30-Second Market Scanner
 * Directive 11.4C.1: Adaptive Scanning Integration
 * REB 2.6: Passive learning mode enforcement for Active Pool
 * Directive 8.8.4-A3.R7: Central Clock Integration
 * 
 * Architecture (Directive 11.4C.1):
 * - Uses collectAdaptiveBatch() for 100-pair Ideal/Rotational split
 * - 60% Ideal Pool (telemetry top performers)
 * - 40% Rotational Pool (exploration candidates)
 * - Telemetry-driven selection with performance feedback
 * 
 * Legacy Architecture (DEPRECATED):
 * - collectMixedBatch() for 60-pair Top-N/Tier-B rotation
 * 
 * Runtime:
 * - Initializes at server startup
 * - Runs 30-second intervals aligned with Central Clock ticks
 * - Updates Stage-3 cache and emits WebSocket events
 * - Operates independently of trading engine state
 * - REB 2.6: Respects passive learning flag - pool stays empty when passiveLearning=true
 */

import { storage } from '../storage.js';
// Phase 8.8.7: FilteredPairsService DEPRECATED - removed unused import
import { KrakenService } from './kraken.js';
import { updateStage3Cache } from './stage3-state-cache.js';
import { emitStage3Events, FilterBreakdown } from './stage3-emitter.js';
import { collectAdaptiveBatch, BatchResult } from './market-scanner.js';
import { activeFilterPool, type ActiveFilteredPair } from './active-filter-pool.js';
import { nanoid } from 'nanoid';
import type { ScreenerFilters } from '@shared/schema';
import { recordScanFor24h, recordScanCompletion, getCyclesPerHour, get24hSummary } from './fx5-24h-window.js';
import { readyToBuyService } from '../core/rtb/ready_to_buy_service.js';
import { centralClock, ClockTick } from './central-clock.js';
import { dataAggregator } from './data-aggregator.js';
import { 
  classifyVolume, 
  type VolumeClass,
  calculateLogLiquidity,
  calculateDirectionalIntegrity,
  calculateVolNoise,
  calculateSigma,
  passesCoreMetricFilters,
  CORE_METRIC_THRESHOLDS
} from '../utils/analysis-utils.js';
import { getTelemetryAggregator } from './telemetry-aggregator.js';
import { SCANNER_PARAMS } from '../config/system-guards.js';

const SCAN_INTERVAL_SECONDS = 30; // 30 seconds aligned with clock ticks
const SCAN_INTERVAL_MS = SCAN_INTERVAL_SECONDS * 1000; // For backwards compatibility
const CYCLES_PER_HOUR = Math.round(3600 / SCAN_INTERVAL_SECONDS); // 120 for 30s intervals

// Directive 11.4C.1: ScanResult uses Ideal/Rotational pool terminology
interface ScanResult {
  mode: 'paper' | 'live';
  evaluatedCount: number;
  eligibleCount: number;
  ineligibleCount: number;
  breakdown: FilterBreakdown;
  idealCount: number; // Directive 11.4C.1: Ideal pool survivors (primary)
  rotationalCount: number; // Directive 11.4C.1: Rotational pool survivors (primary)
  activePoolCount: number;
}

export class Fx5ScannerService {
  // Phase 8.8.7: FilteredPairsService DEPRECATED - removed unused member
  private krakenService: KrakenService;
  private isRunning = false;
  private startTime: number = 0; // REB 2.8.5B: Track actual scanner start time
  private paperCycleCount: number = 0; // REB 2.8.15: Track cycle number for diagnostics
  private liveCycleCount: number = 0;  // REB 2.8.15: Track cycle number for diagnostics
  private isScanning = false; // Directive 8.8.4-A3.R7: Prevent concurrent scans
  private clockTickHandler: ((tick: ClockTick) => void) | null = null;

  constructor() {
    // Phase 8.8.7: FilteredPairsService DEPRECATED - removed
    this.krakenService = new KrakenService();
  }

  // REB 2.8.5B: Get scanner start time for countdown calculation
  getStartTime(): number {
    return this.startTime;
  }

  /**
   * Start the FX5 scanner for both modes
   * Directive 8.8.4-A3.R7: Uses Central Clock for synchronized timing
   * This runs independently of trading engine state
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[FX5Scanner] Already running');
      return;
    }

    this.isRunning = true;
    this.startTime = Date.now(); // REB 2.8.5B: Set actual start time when scanner starts
    console.log('[FX5Scanner][A3.R8] Starting 30-second scanner with Central Clock integration');

    // Ensure Central Clock is running
    if (!centralClock.getIsRunning()) {
      centralClock.start();
      console.log('[FX5Scanner][A3.R8] Started Central Clock');
    }

    // Directive 8.8.4-A3.R8: 30-second warm-up delay before first scan
    // Ensures TCL and RTB listeners are ready before signals flow
    console.log('[FX5Scanner][A3.R8] Waiting 30 seconds for TCL/RTB warm-up...');
    await new Promise(r => setTimeout(r, 30000));
    console.log('[FX5Scanner][A3.R8] Warm-up complete, starting first scan');

    // R9.3.HF-6: Subscribe to Central Clock FIRST before initial scan
    // This ensures ticks are received even if initial scan takes time
    console.log('[FX5Scanner][R9.3.HF-6] Subscribing to Central Clock BEFORE initial scan');
    
    // Directive 8.8.4-A3.R7: Subscribe to Central Clock for 30-second aligned scans
    // R9.3.HF-6: Added timeout protection to prevent hanging scans
    const SCAN_TIMEOUT_MS = 25000; // 25 second timeout (less than 30s interval)
    
    this.clockTickHandler = async (tick: ClockTick) => {
      if (!this.isRunning || this.isScanning) {
        if (this.isScanning) {
          console.log(`[FX5Scanner][A3.R7][SKIP] tickNumber=${tick.tickNumber} reason=scan_in_progress`);
        }
        return;
      }
      
      // Run every 30 ticks (30 seconds)
      if (tick.tickNumber > 0 && tick.tickNumber % SCAN_INTERVAL_SECONDS === 0) {
        this.isScanning = true;
        const startTime = Date.now();
        try {
          console.log(`[FX5Scanner][A3.R7][TICK] tickNumber=${tick.tickNumber} drift=${tick.drift}ms`);
          
          // R9.3.HF-6: Add timeout protection to prevent hanging scans
          const timeoutPromise = new Promise<void>((_, reject) => 
            setTimeout(() => reject(new Error('Scan timeout')), SCAN_TIMEOUT_MS)
          );
          
          await Promise.race([
            Promise.all([
              this.scanMode('paper').catch(err => console.error('[FX5Scanner] Paper scan error:', err)),
              this.scanMode('live').catch(err => console.error('[FX5Scanner] Live scan error:', err))
            ]),
            timeoutPromise
          ]).catch(err => {
            console.error(`[FX5Scanner][R9.3.HF-6][TIMEOUT] Scan aborted after ${Date.now() - startTime}ms:`, err.message);
          });
          
          console.log(`[FX5Scanner][A3.R7][COMPLETE] tickNumber=${tick.tickNumber} duration=${Date.now() - startTime}ms`);
        } finally {
          this.isScanning = false;
        }
      }
    };

    centralClock.subscribe('FX5Scanner', this.clockTickHandler);
    console.log('[FX5Scanner][R9.3.HF-6] ✅ Subscribed to Central Clock');
    
    // Run initial scan for both modes
    console.log('[FX5Scanner][R9.3.HF-6] Running initial scans');
    try {
      await this.scanMode('paper');
      console.log('[FX5Scanner][R9.3.HF-6] Paper initial scan complete');
    } catch (err) {
      console.error('[FX5Scanner][R9.3.HF-6] Paper initial scan error:', err);
    }
    
    try {
      await this.scanMode('live');
      console.log('[FX5Scanner][R9.3.HF-6] Live initial scan complete');
    } catch (err) {
      console.error('[FX5Scanner][R9.3.HF-6] Live initial scan error:', err);
    }

    console.log('[FX5Scanner][A3.R7] ✅ Started with Central Clock (interval=30s aligned)');
  }

  /**
   * Stop the FX5 scanner
   * Directive 8.8.4-A3.R7: Unsubscribe from Central Clock
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    // Unsubscribe from Central Clock
    if (this.clockTickHandler) {
      centralClock.unsubscribe('FX5Scanner');
      this.clockTickHandler = null;
    }

    this.isRunning = false;
    this.isScanning = false;
    console.log('[FX5Scanner][A3.R7] Stopped');
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

      // REB 2.9C Section 3: Log filter values at cycle start (first 20 cycles only)
      // Directive 10.9E: Removed deprecated rsiMin, rsiMax, volatilityMin, volatilityMax
      const reb29cCycle = mode === 'paper' ? this.paperCycleCount + 1 : this.liveCycleCount + 1;
      if (reb29cCycle <= 20) {
        console.log(`[REB2.9C][FX5][CycleStart] Cycle ${reb29cCycle}/${mode}:`, {
          minVolume: filters.minVolume,
          minLiquidity: filters.minLiquidity,
          minPrice: filters.minPrice,
          maxPrice: filters.maxPrice,
          maxBidAskSpread: filters.maxBidAskSpread,
          universeSize: filters.universeSize,
          activeTimeframes: filters.activeTimeframes,
          minHistoryDays: filters.minHistoryDays,
          excludeStablecoins: filters.excludeStablecoins,
          allowRegulatedOnly: filters.allowRegulatedOnly
        });
      }

      // Directive 11.4C.1: Execute adaptive batch scanning (100 pairs: 60% Ideal + 40% Rotational)
      const batchResult: BatchResult = await collectAdaptiveBatch(
        this.krakenService,
        filters,
        mode
      );
      
      // Extract results from batch pipeline
      // Directive 11.4C.1: Use new Ideal/Rotational metrics (primary)
      const { survivors, evaluatedSymbols, breakdown, metrics } = batchResult;
      const {
        evaluatedCount,
        eligibleCount,
        ineligibleCount,
        idealCount, // Directive 11.4C.1: Primary metric
        rotationalCount, // Directive 11.4C.1: Primary metric
        krakenUniverseSize,
      } = metrics;

      // R9.3.HF-7: Add granular logging to identify bottlenecks
      console.log(`[FX5Scanner][R9.3.HF-7][${mode}] Batch complete, getting active trades...`);
      
      // Directive 11.4C-R2: Enhanced logging with clear breakdown
      // evaluatedCount = pairs sent to filters, eligibleCount = pairs that passed all filters (survivors)
      console.log(
        `[11.4C-R2][AdaptiveScan] Cycle Summary -> ` +
        `Scanned=${evaluatedCount} | Survivors=${eligibleCount} ` +
        `(Ideal=${idealCount}, Rotational=${rotationalCount})`
      );

      // Get active trades count with timeout protection
      const activeTradesPromise = storage.getActiveTrades(mode);
      const activeTradesTimeout = new Promise<any[]>((_, reject) => 
        setTimeout(() => reject(new Error('getActiveTrades timeout')), 5000)
      );
      const activeTrades = await Promise.race([activeTradesPromise, activeTradesTimeout]).catch(err => {
        console.error(`[FX5Scanner][R9.3.HF-7][${mode}] getActiveTrades failed: ${err.message}`);
        return [];
      }) as any[];
      const activePoolCount = activeTrades.length;
      console.log(`[FX5Scanner][R9.3.HF-7][${mode}] Active trades: ${activePoolCount}`);

      // Directive 11.4C.1: Use Ideal/Rotational as primary metrics
      const scanResult: ScanResult = {
        mode,
        evaluatedCount,
        eligibleCount,
        ineligibleCount,
        breakdown,
        idealCount, // Directive 11.4C.1: Primary
        rotationalCount, // Directive 11.4C.1: Primary
        activePoolCount,
      };

      // Directive 9.0.B: Classify survivors by volume
      // Directive 9.1.E: Compute core metrics (LQ, DI, VolNoise, Sigma)
      // Handle undefined/null volume24h gracefully with safe defaults
      const classifiedSurvivors = survivors.map(s => {
        const volumeUSD = typeof s.volume24h === 'number' && !isNaN(s.volume24h) ? s.volume24h : 0;
        const volumeClass = classifyVolume(volumeUSD);
        
        // Directive 9.1.E: Compute core metrics
        const prices = s.priceHistory || s.history || [];
        const tradeCount = s.trades24h || s.tradeCount || 100; // Default trade count if unavailable
        const spread = s.spread || s.bidAskSpread || 0.001; // Default spread if unavailable
        
        const LQ = calculateLogLiquidity(volumeUSD, tradeCount, spread);
        const DI = calculateDirectionalIntegrity(prices);
        const VolNoise = calculateVolNoise(prices);
        const Sigma = calculateSigma(prices);
        const passesMetricFilter = passesCoreMetricFilters(LQ, VolNoise);
        
        // Directive 9.1.G: Telemetry logging with [9.1] tags
        console.log(`[9.1][FX5] ${s.symbol} LQ=${LQ.toFixed(1)} DI=${DI.toFixed(1)} VN=${VolNoise.toFixed(2)} σ=${Sigma.toFixed(4)}`);
        
        // Directive 9.1.F: Log if pair fails core metric filters
        if (!passesMetricFilter) {
          console.log(`[9.1][FILTER] Excluding ${s.symbol} - LQ=${LQ.toFixed(1)}, VN=${VolNoise.toFixed(2)} (threshold: LQ>=${CORE_METRIC_THRESHOLDS.LQ_MIN}, VN<=${CORE_METRIC_THRESHOLDS.VOL_NOISE_MAX})`);
        }
        
        return { 
          ...s, 
          volumeClass, 
          volumeUSD,
          LQ,
          DI,
          VolNoise,
          Sigma,
          passesMetricFilter
        };
      });

      // REB 2.8.7: Add survivors to Active Filter Pool (deduped, TTL-managed)
      // Single-gate pattern: Check ONLY isEngineActive (passive learning = !isEngineActive)
      console.log(`[8.6.7][DEBUG] FX5 scan complete - survivors.length=${classifiedSurvivors.length}, eligibleCount=${eligibleCount}`);
      
      // Check if trading engine is active for this mode (from database, not aggregator)
      // R9.3.HF-7: Add timeout protection for database call
      console.log(`[FX5Scanner][R9.3.HF-7][${mode}] Getting system context...`);
      const contextPromise = storage.getSystemContext(mode);
      const contextTimeout = new Promise<any>((_, reject) => 
        setTimeout(() => reject(new Error('getSystemContext timeout')), 5000)
      );
      const context = await Promise.race([contextPromise, contextTimeout]).catch(err => {
        console.error(`[FX5Scanner][R9.3.HF-7][${mode}] getSystemContext failed: ${err.message}`);
        return null;
      });
      const isEngineActive = context?.isEngineActive || false;
      console.log(`[FX5Scanner][R9.3.HF-7][${mode}] Engine active: ${isEngineActive}`);

      // REB 2.8.7: Enforce passive mode - clear pool if engine stopped
      activeFilterPool.enforcePassiveModeIfStopped(mode, isEngineActive);

      // Directive 9.1.F: Filter out pairs that fail LQ/VolNoise thresholds
      const metricFilteredSurvivors = classifiedSurvivors.filter(s => s.passesMetricFilter);
      const metricFilteredCount = classifiedSurvivors.length - metricFilteredSurvivors.length;
      if (metricFilteredCount > 0) {
        console.log(`[9.1][FILTER] Removed ${metricFilteredCount}/${classifiedSurvivors.length} pairs failing LQ/VolNoise thresholds`);
      }

      // REB 2.8.7: Single-gate pattern - populate pool ONLY when engine ACTIVE
      if (isEngineActive) {
        // Engine ACTIVE: Add survivors to Active Filter Pool (with volume classification and metric filtering)
        const poolStats = activeFilterPool.addSurvivors(mode, metricFilteredSurvivors);
        console.log(`[REB 2.8.7][ActivePool] Pool populated: added=${poolStats.added}, updated=${poolStats.updated}, skipped=${poolStats.skipped}, survivors=${metricFilteredSurvivors.length} (${metricFilteredCount} filtered by 9.1)`);
      } else {
        // Engine STOPPED: Pool cleared by enforcePassiveModeIfStopped (passive learning)
        console.log(`[REB 2.8.7][ActivePool] Engine stopped - pool cleared (passive learning mode)`);
      }

      // Get the current active pool (deduped, non-expired)
      const activeFilteredPoolEntries = activeFilterPool.getActivePool(mode);
      
      const cycleStartTimestamp = new Date().toISOString();
      const cycleEndTimestamp = new Date().toISOString();
      
      // Directive 8.8.4-L1: Capture FX5 scan data for learning aggregation
      // Directive 9.0.B: Include volume classification stats
      const volumeStats = {
        SMALL: classifiedSurvivors.filter(s => s.volumeClass === 'SMALL').length,
        MID: classifiedSurvivors.filter(s => s.volumeClass === 'MID').length,
        LARGE: classifiedSurvivors.filter(s => s.volumeClass === 'LARGE').length
      };
      dataAggregator.capture('FX5_SCAN', {
        mode,
        pairsScanned: evaluatedCount,
        survivors: classifiedSurvivors.length,
        metricFilteredSurvivors: metricFilteredSurvivors.length,
        metricFilteredCount,
        eligibleCount,
        idealCount,
        rotationalCount,
        avgDailyRange: classifiedSurvivors.length > 0 
          ? classifiedSurvivors.reduce((a, s) => a + (s.dailyRange || 0), 0) / classifiedSurvivors.length 
          : 0,
        isEngineActive,
        volumeStats
      }).catch(() => {});
      
      // Directive 11.4C-R2: FX5 seeds minimal telemetry for survivors so VTS can find them
      // VTS is the single source of truth for signal data (signalType, strategy, pattern)
      // FX5 only records pool membership to enable VTS pair selection
      if (SCANNER_PARAMS.ADAPTIVE_ENABLED) {
        const telemetry = getTelemetryAggregator();
        for (const survivor of metricFilteredSurvivors) {
          // Seed minimal telemetry entry - VTS will update with real signal data
          telemetry.recordPairTelemetry(survivor.symbol, {
            finalScore: 0.5, // Neutral baseline - VTS will update with actual score
            pool: survivor.poolType || 'ideal',
            source: 'simulation',
          });
        }
        console.log(`[FX5][11.4C-R2] ${metricFilteredSurvivors.length} survivors seeded to telemetry for VTS selection`);
      }
      
      // REB 2.8.4: Generate unique scan cycle ID (survives server restarts)
      const scanCycleId = `cycle_${mode}_${nanoid(12)}`;

      // REB 2.8.5A: Get real cycles per hour from tracking (not hard-coded)
      const cyclesPerHour = getCyclesPerHour(mode);

      // Update Stage-3 cache FIRST with Directive 11.4C.1 metrics
      // REB 2.2: Use persistent Active Filter Pool instead of fresh pool
      await updateStage3Cache(mode, {
        scanCycleId,
        cycleStartTimestamp,
        cycleEndTimestamp,
        krakenUniverseSize,
        evaluatedCount,
        eligibleCount,
        ineligibleCount,
        idealCount, // Directive 11.4C.1: Ideal pool survivors
        rotationalCount, // Directive 11.4C.1: Rotational pool survivors
        cyclesPerHour,
        cycleFrequencyMs: SCAN_INTERVAL_MS,
        nextScanInMs: SCAN_INTERVAL_MS,
        activePoolCount: activeFilteredPoolEntries.length,
        activeFilteredPool: activeFilteredPoolEntries,
        latestEligibleSymbols: survivors.slice(0, 10).map(s => s.symbol),
      });

      // Emit Stage-3 WebSocket events SECOND
      // REB 2.8.5D: evaluatedSymbols now comes from batchResult (all 60 batch symbols before filtering)
      // survivedSymbols remains the same (only survivors that passed filters)
      const survivedSymbols = survivors.map(s => s.symbol);
      await emitStage3Events(mode, breakdown, { evaluatedSymbols, survivedSymbols });

      // REB 2.8.5A: Record scan completion for FX5-native 24h window & cycles per hour tracking
      const completedAt = Date.now();
      
      // Track cycles per hour (ONLY when engine is ACTIVE)
      // REB 2.8.5C: Changed semantics from "FX5 health" to "trading activity only"
      recordScanCompletion(mode, isEngineActive);
      
      // REB 2.8.8: Compute ineligible symbols (failed at least one filter)
      const survivedSet = new Set(survivedSymbols);
      const ineligibleSymbols = evaluatedSymbols.filter(s => !survivedSet.has(s));
      
      // REB 2.8.8: Convert breakdown to filter failures format (for 24h aggregation)
      const filterFailures: Record<string, number> = {
        failed_min_volume: breakdown.failed_min_volume,
        failed_spread: breakdown.failed_spread,
        failed_daily_range: breakdown.failed_daily_range,
        failed_min_price: breakdown.failed_min_price,
        failed_stablecoin: breakdown.failed_stablecoin,
        failed_quote_currency: breakdown.failed_quote_currency,
        failed_history: breakdown.failed_history,
        failed_market_cap: breakdown.failed_market_cap,
        failed_guardrail_risk: breakdown.failed_guardrail_risk,
        failed_correlation: breakdown.failed_correlation ?? 0, // 10.9C
        already_active: breakdown.already_active,
        passed_all_filters: breakdown.passed_all_filters,
      };
      
      // Track 24h metrics (ONLY when engine is ACTIVE)
      recordScanFor24h(
        mode,
        {
          cycleId: scanCycleId,
          completedAt,
          evaluatedCount,
          eligibleCount,
          evaluatedSymbols,
          survivedSymbols,
          ineligibleSymbols, // REB 2.8.8: Add ineligible symbols
          filterFailures,    // REB 2.8.8: Add filter-level failures
        },
        isEngineActive
      );

      // REB 2.8.15: Early-cycle diagnostic logging (first 20 cycles only)
      const cycleNumber = mode === 'paper' ? ++this.paperCycleCount : ++this.liveCycleCount;
      if (cycleNumber <= 20) {
        const summary24h = get24hSummary(mode);
        console.log(`\n╔═══ [REB 2.8.15] Early-Cycle Diagnostic (Cycle ${cycleNumber}) ═══`);
        console.log(`║ Mode: ${mode.toUpperCase()}`);
        console.log(`║ Cycle ID: ${scanCycleId}`);
        console.log(`║ Engine Active: ${isEngineActive}`);
        console.log(`╠═══ THIS CYCLE ═══`);
        console.log(`║ Batch Composition: Ideal=${idealCount}, Rotational=${rotationalCount} (11.4C.1)`);
        console.log(`║ Evaluated: ${evaluatedCount}`);
        console.log(`║ Survivors (Eligible): ${eligibleCount}`);
        console.log(`╠═══ 24H CUMULATIVE ═══`);
        console.log(`║ Total Cycles: ${summary24h.totalCycles}`);
        console.log(`║ Total Evaluated (24h): ${summary24h.totalEvaluated}`);
        console.log(`║ Unique Evaluated (24h): ${summary24h.uniqueEvaluated}`);
        console.log(`║ Total Survived (24h): ${summary24h.totalSurvived}`);
        console.log(`║ Unique Survived (24h): ${summary24h.uniqueSurvived}`);
        console.log(`║ Ratio (Unique/Total Eval): ${summary24h.totalEvaluated > 0 ? ((summary24h.uniqueEvaluated / summary24h.totalEvaluated) * 100).toFixed(1) : 'N/A'}%`);
        console.log(`╠═══ ACTIVE POOL ═══`);
        console.log(`║ Pool Size (deduped, non-expired): ${activeFilteredPoolEntries.length}`);
        console.log(`║ Pool ≤ Unique Survived: ${activeFilteredPoolEntries.length <= summary24h.uniqueSurvived ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`╚═══════════════════════════════════════════════\n`);
      }

      console.log(`[FX5Scanner][${mode}] ✅ Scan complete (evaluated=${evaluatedCount}, eligible=${eligibleCount})`);

      // A4.R10R-2: RTB refresh now handled by independent RTBRefreshService
      // This decouples RTB lifecycle from FX5 scan timing

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

  /**
   * R9.3.HF-5: Get diagnostic information for debugging
   */
  getDiagnostics(): { isRunning: boolean; isScanning: boolean; paperCycles: number; liveCycles: number; hasClockHandler: boolean } {
    return {
      isRunning: this.isRunning,
      isScanning: this.isScanning,
      paperCycles: this.paperCycleCount,
      liveCycles: this.liveCycleCount,
      hasClockHandler: this.clockTickHandler !== null,
    };
  }

  /**
   * R9.3.HF-5: Get running state
   */
  getIsRunning(): boolean {
    return this.isRunning;
  }
}

// Singleton instance
export const fx5Scanner = new Fx5ScannerService();
