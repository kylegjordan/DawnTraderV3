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

import fs from 'fs';
import path from 'path';
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
  calculateDirectionalIntegrity,
  calculateVolNoise,
  calculateSigma,
  passesCoreMetricFilters,
  // Batch 19G VN HF: CORE_METRIC_THRESHOLDS import removed — DB-driven thresholds used directly
} from '../utils/analysis-utils.js';
import { getTelemetryAggregator } from './telemetry-aggregator.js';
import { SCANNER_PARAMS } from '../config/system-guards.js';
import { normalizeToInternalSymbol, getSymbolMappingDetails } from '../markets/kraken-symbol-resolver.js';
import { setCostMetrics, getCostMetrics } from '../core/cache/cost-cache.js';
import { ohlcCache } from './ohlc-cache.js';

const SCAN_INTERVAL_SECONDS = 30; // 30 seconds aligned with clock ticks
const SCAN_INTERVAL_MS = SCAN_INTERVAL_SECONDS * 1000; // For backwards compatibility
const CYCLES_PER_HOUR = Math.round(3600 / SCAN_INTERVAL_SECONDS); // 120 for 30s intervals

/**
 * Directive 11.4H.6 Task 1A: Benchmark Symbol Regex Correction
 * Strict regex prevents memecoins like FARTCOIN from being misclassified as benchmarks.
 * 
 * Directive 11.4H.2 Task 1: Benchmark base assets for explicit inclusion
 * These base currencies are always included in both Benchmark Pool (for UI visibility)
 * and Ideal Pool (for VTS scanning and trading)
 * Includes both standard (BTC) and Kraken native (XBT, ETHC, SOLC) formats
 */
import { 
  BENCHMARK_REGEX, 
  BENCHMARK_BASE_COINS, 
  BENCHMARK_STABLECOINS,
  VALID_QUOTE_CURRENCIES,
  CANONICAL_BENCHMARK_SYMBOLS,
  isBenchmarkSymbolStrict 
} from '../config/benchmark-regex.js';
// Phase 14.5: Pattern pool filter thresholds (Batch 19C: regime-aware)
import { PATTERN_POOL_THRESHOLDS, getPatternPoolThresholds } from '../config/pattern-filter-profile.js';
// Batch 19G: PATTERN_GLOBAL_FILTERS and VTS_PATTERN_GLOBAL_FILTERS removed — now read from DB
import { getMarketContextEngine } from './market-context-engine.js';

export const BENCHMARK_BASES = [
  'BTC', 'XBT',           // Bitcoin (standard and Kraken)
  'ETH', 'XETH', 'ETHC',  // Ethereum (standard, Kraken prefixed, suffixed)
  'SOL', 'SOLC',          // Solana (standard and Kraken suffixed)
  'USDT', 'USDC', 'DAI', 'BUSD', 'TUSD'   // Stablecoins (expanded per 11.4H.6)
];

/**
 * Directive 11.4H.6 Task 1A: Check if a symbol is a benchmark asset
 * Uses strict regex to prevent false positives (e.g., FARTCOIN/USDT)
 * 
 * Detection strategy (in order):
 * 1. Strict regex match using BENCHMARK_REGEX (primary)
 * 2. Direct prefix match on raw Kraken symbols (XBTEUR, ETHGBP, etc.)
 * 3. Normalized format check (only if normalization succeeds)
 */
export function isBenchmarkSymbol(symbol: string): boolean {
  if (!symbol) return false;
  
  const upperSymbol = symbol.toUpperCase().trim();
  
  // 1. Strict regex match (Directive 11.4H.6 primary method)
  if (isBenchmarkSymbolStrict(upperSymbol)) {
    return true;
  }
  
  // 2. Direct prefix match on raw symbol base (handles XBTEUR, ETHGBP, etc.)
  // Only match exact benchmark base coins at start, not partial matches
  for (const base of [...BENCHMARK_BASE_COINS, ...BENCHMARK_STABLECOINS]) {
    // Must be exact base followed by quote separator or quote currency
    const basePattern = new RegExp(`^${base}(?:[/_-]|USD|EUR|USDT|USDC)`, 'i');
    if (basePattern.test(upperSymbol)) {
      return true;
    }
  }
  
  // 3. Normalized format check (only if normalization succeeds)
  try {
    const normalized = normalizeToInternalSymbol(symbol);
    if (normalized.includes('UNKNOWN')) {
      return false;
    }
    return isBenchmarkSymbolStrict(normalized);
  } catch {
    return false;
  }
}

// Directive 11.4H.6: Canonical benchmark symbols list (expanded)
export const BENCHMARK_SYMBOLS = [
  'BTC/USD', 'BTC/USDT',
  'ETH/USD', 'ETH/USDT',
  'SOL/USD', 'SOL/USDT',
  'USDT/USD', 'USDC/USD',
  'DAI/USD', 'BUSD/USD', 'TUSD/USD'
];

// Batch 19H: Filter Pipeline Diagnostics — per-scan and 24h rolling data
export interface ScanDiagnostics {
  timestamp: string;
  mode: 'paper' | 'live';
  totalPairsScanned: number;
  allSymbolsScanned: string[];
  quant: {
    global: {
      failed_min_volume: number;
      failed_spread: number;
      failed_daily_range: number;
      failed_min_price: number;
      failed_stablecoin: number;
      failed_quote_currency: number;
      failed_history: number;
      failed_market_cap: number;
      failed_guardrail_risk: number;
      failed_correlation: number;
      already_active: number;
      passed_all_filters: number;
    };
    imf: { failedLQ: number; failedVN: number; failedDI: number; passed: number; total: number; benchmarkBypassed: number };
    survivors: number;
  };
  pattern: {
    global: {
      failed_stablecoin: number;
      failed_min_price: number;
      failed_max_price: number;
      failed_min_volume: number;
      failed_spread: number;
      failed_history: number;
      passed_all_filters: number;
    } | null;
    imf: { failedLQ: number; failedVN: number; failedDI: number; passed: number; total: number; benchmarkBypassed: number } | null;
    survivors: number;
  };
  // Batch 48: Track unique family-qualified pairs for Pipeline Summary reconciliation
  familyQualifiedUnique: number;
  destination: 'active_pool' | 'vts_batch';
  destinationCount: number;
}

const DIAGNOSTICS_ROLLING_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

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

/**
 * Directive 11.4C.1: Raw scan batch for VTS consumption
 * Contains raw data without telemetry scores
 * Directive 11.4H.2: Added poolType for benchmark tagging
 */
export interface ScanBatchPair {
  symbol: string;
  pool: 'ideal' | 'rotational';
  poolType?: 'BENCHMARK' | 'STANDARD'; // Directive 11.4H.2: Tag for UI
  price: number;
  volume24h: number;
  dailyRange: number;
  spread?: number;
  liquidity?: number;
  volatility?: number;
  isBenchmark?: boolean; // Directive 11.4H.2: Benchmark flag
  frictionScore?: number; // Directive 11.4H.2: Friction score for UI
  frictionLabel?: string; // Directive 11.4H.2: Friction label for UI
  frictionColor?: 'green' | 'yellow' | 'orange' | 'red'; // Directive 11.4H.2: Friction color
  lqScore?: number;         // HF9: Log-Liquidity score for IMF diagnostics
  volNoiseScore?: number;   // HF9: VolNoise score for IMF diagnostics
  filterTier?: 'standard' | 'relaxed'; // HF9: IMF filter tier (standard=strict, relaxed=VTS-only)
  sourcePool?: string; // Batch 37: Family-qualified source pool (quant-trend, quant-reversal, etc.)
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
  
  // Directive 11.4C.1: Store current scan batch for VTS consumption
  private currentBatch: Map<'paper' | 'live', ScanBatchPair[]> = new Map([
    ['paper', []],
    ['live', []]
  ]);

  // Batch 19H: Filter Pipeline Diagnostics
  private lastScanDiagnostics: ScanDiagnostics | null = null;
  private scanDiagnosticsHistory: ScanDiagnostics[] = [];

  // Batch 44: Diagnostics persistence directory
  private static readonly DIAG_DIR = path.join(process.cwd(), 'logs', 'fx5_diagnostics');

  constructor() {
    // Phase 8.8.7: FilteredPairsService DEPRECATED - removed
    this.krakenService = new KrakenService();
    // Batch 44: Rehydrate scan diagnostics from disk on startup
    this.rehydrateDiagnostics();
  }

  // Batch 44: Persist scan diagnostics to disk (called after each scan cycle)
  private persistDiagnostics(): void {
    try {
      if (!fs.existsSync(Fx5ScannerService.DIAG_DIR)) {
        fs.mkdirSync(Fx5ScannerService.DIAG_DIR, { recursive: true });
      }
      const date = new Date().toISOString().split('T')[0];
      const filePath = path.join(Fx5ScannerService.DIAG_DIR, `diagnostics_${date}.json`);
      // Write only the 24h window (not unbounded history)
      const cutoff = Date.now() - DIAGNOSTICS_ROLLING_WINDOW_MS;
      const recentHistory = this.scanDiagnosticsHistory.filter(
        d => new Date(d.timestamp).getTime() > cutoff
      );
      fs.writeFileSync(filePath, JSON.stringify({
        lastScan: this.lastScanDiagnostics,
        history: recentHistory,
        persistedAt: new Date().toISOString(),
      }));
    } catch (err) {
      console.error('[44][DIAG] Failed to persist diagnostics:', err);
    }
  }

  // Batch 44: Rehydrate scan diagnostics from disk on startup
  private rehydrateDiagnostics(): void {
    try {
      if (!fs.existsSync(Fx5ScannerService.DIAG_DIR)) return;
      const cutoff = Date.now() - DIAGNOSTICS_ROLLING_WINDOW_MS;
      // Read today's and yesterday's files to cover the 24h window
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      const files = [
        path.join(Fx5ScannerService.DIAG_DIR, `diagnostics_${yesterday}.json`),
        path.join(Fx5ScannerService.DIAG_DIR, `diagnostics_${today}.json`),
      ];
      let rehydrated: ScanDiagnostics[] = [];
      for (const filePath of files) {
        if (!fs.existsSync(filePath)) continue;
        try {
          const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          if (data.history && Array.isArray(data.history)) {
            rehydrated.push(...data.history);
          }
          if (data.lastScan && !this.lastScanDiagnostics) {
            this.lastScanDiagnostics = data.lastScan;
          }
        } catch { /* skip corrupted files */ }
      }
      // Filter to 24h window and deduplicate by timestamp
      const seen = new Set<string>();
      this.scanDiagnosticsHistory = rehydrated
        .filter(d => new Date(d.timestamp).getTime() > cutoff)
        .filter(d => {
          if (seen.has(d.timestamp)) return false;
          seen.add(d.timestamp);
          return true;
        })
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      if (this.scanDiagnosticsHistory.length > 0) {
        this.lastScanDiagnostics = this.scanDiagnosticsHistory[this.scanDiagnosticsHistory.length - 1];
        console.log(`[44][DIAG] Rehydrated ${this.scanDiagnosticsHistory.length} scan diagnostics from disk (24h window)`);
      }
    } catch (err) {
      console.error('[44][DIAG] Failed to rehydrate diagnostics:', err);
    }
  }

  // REB 2.8.5B: Get scanner start time for countdown calculation
  getStartTime(): number {
    return this.startTime;
  }

  // Batch 19H: Get last scan diagnostics for API
  getLastScanDiagnostics(): ScanDiagnostics | null {
    return this.lastScanDiagnostics;
  }

  // Batch 19H: Get 24h rolling diagnostics with aggregation
  getRolling24hDiagnostics(): {
    totalScans: number;
    totalPairsScanned: number;
    uniquePairsScanned: number;
    // Batch 48: Pipeline reconciliation fields
    totalFamilyQualifiedUnique: number;
    totalDestinationCount: number;
    aggregated: {
      quant: ScanDiagnostics['quant'];
      pattern: ScanDiagnostics['pattern'];
      familyPaths?: Record<string, { imf: { failedLQ: number; failedVN: number; failedDI: number; passed: number; total: number }; survivors: number }>;
    };
  } {
    // Prune entries older than 24h
    const cutoff = Date.now() - DIAGNOSTICS_ROLLING_WINDOW_MS;
    this.scanDiagnosticsHistory = this.scanDiagnosticsHistory.filter(
      d => new Date(d.timestamp).getTime() > cutoff
    );

    const history = this.scanDiagnosticsHistory;
    if (history.length === 0) {
      return {
        totalScans: 0,
        totalPairsScanned: 0,
        uniquePairsScanned: 0,
        totalFamilyQualifiedUnique: 0,
        totalDestinationCount: 0,
        aggregated: {
          quant: {
            global: { failed_min_volume: 0, failed_spread: 0, failed_daily_range: 0, failed_min_price: 0, failed_stablecoin: 0, failed_quote_currency: 0, failed_history: 0, failed_market_cap: 0, failed_guardrail_risk: 0, failed_correlation: 0, already_active: 0, passed_all_filters: 0 },
            imf: { failedLQ: 0, failedVN: 0, failedDI: 0, passed: 0, total: 0, benchmarkBypassed: 0 },
            survivors: 0,
          },
          pattern: { global: null, imf: null, survivors: 0 },
        },
      };
    }

    // Collect unique symbols across all scans
    const uniqueSymbols = new Set<string>();
    let totalPairsScanned = 0;

    // Aggregate quant global
    const aggQuantGlobal = { failed_min_volume: 0, failed_spread: 0, failed_daily_range: 0, failed_min_price: 0, failed_stablecoin: 0, failed_quote_currency: 0, failed_history: 0, failed_market_cap: 0, failed_guardrail_risk: 0, failed_correlation: 0, already_active: 0, passed_all_filters: 0 };
    const aggQuantImf = { failedLQ: 0, failedVN: 0, failedDI: 0, passed: 0, total: 0, benchmarkBypassed: 0 };
    let aggQuantSurvivors = 0;

    // Aggregate pattern global
    const aggPatternGlobal = { failed_stablecoin: 0, failed_min_price: 0, failed_max_price: 0, failed_min_volume: 0, failed_spread: 0, failed_history: 0, passed_all_filters: 0 };
    const aggPatternImf = { failedLQ: 0, failedVN: 0, failedDI: 0, passed: 0, total: 0, benchmarkBypassed: 0 };
    let aggPatternSurvivors = 0;
    let hasPatternData = false;

    // Batch 22 HF2: Family path aggregation
    const aggFamilyPaths: Record<string, { imf: { failedLQ: number; failedVN: number; failedDI: number; passed: number; total: number }; survivors: number }> = {};
    // Batch 48: Pipeline reconciliation accumulators
    let aggFamilyQualifiedUnique = 0;
    let aggDestinationCount = 0;

    for (const d of history) {
      totalPairsScanned += d.totalPairsScanned;
      for (const sym of d.allSymbolsScanned) uniqueSymbols.add(sym);

      // Quant global
      for (const key of Object.keys(aggQuantGlobal) as (keyof typeof aggQuantGlobal)[]) {
        aggQuantGlobal[key] += d.quant.global[key];
      }
      aggQuantImf.failedLQ += d.quant.imf.failedLQ;
      aggQuantImf.failedVN += d.quant.imf.failedVN;
      aggQuantImf.failedDI += d.quant.imf.failedDI ?? 0;
      aggQuantImf.passed += d.quant.imf.passed;
      aggQuantImf.total += d.quant.imf.total;
      aggQuantImf.benchmarkBypassed += d.quant.imf.benchmarkBypassed;
      aggQuantSurvivors += d.quant.survivors;

      // Pattern global
      if (d.pattern.global) {
        hasPatternData = true;
        for (const key of Object.keys(aggPatternGlobal) as (keyof typeof aggPatternGlobal)[]) {
          aggPatternGlobal[key] += d.pattern.global[key];
        }
      }
      if (d.pattern.imf) {
        aggPatternImf.failedLQ += d.pattern.imf.failedLQ;
        aggPatternImf.failedVN += d.pattern.imf.failedVN;
        aggPatternImf.failedDI += d.pattern.imf.failedDI;
        aggPatternImf.passed += d.pattern.imf.passed;
        aggPatternImf.total += d.pattern.imf.total;
      }
      aggPatternSurvivors += d.pattern.survivors;

      // Batch 22 HF2: Aggregate family path data
      if ((d as any).familyPaths) {
        for (const [family, fData] of Object.entries((d as any).familyPaths as Record<string, any>)) {
          if (!aggFamilyPaths[family]) {
            aggFamilyPaths[family] = { imf: { failedLQ: 0, failedVN: 0, failedDI: 0, passed: 0, total: 0 }, survivors: 0 };
          }
          if (fData.imf) {
            aggFamilyPaths[family].imf.failedLQ += fData.imf.failedLQ ?? 0;
            aggFamilyPaths[family].imf.failedVN += fData.imf.failedVN ?? 0;
            aggFamilyPaths[family].imf.failedDI += fData.imf.failedDI ?? 0;
            aggFamilyPaths[family].imf.passed += fData.imf.passed ?? 0;
            aggFamilyPaths[family].imf.total += fData.imf.total ?? 0;
          }
          aggFamilyPaths[family].survivors += fData.survivors ?? 0;
        }
      }
      // Batch 48: Accumulate pipeline reconciliation fields
      aggFamilyQualifiedUnique += d.familyQualifiedUnique ?? 0;
      aggDestinationCount += d.destinationCount ?? 0;
    }

    return {
      totalScans: history.length,
      totalPairsScanned,
      uniquePairsScanned: uniqueSymbols.size,
      totalFamilyQualifiedUnique: aggFamilyQualifiedUnique,
      totalDestinationCount: aggDestinationCount,
      aggregated: {
        quant: {
          global: aggQuantGlobal,
          imf: aggQuantImf,
          survivors: aggQuantSurvivors,
        },
        pattern: {
          global: hasPatternData ? aggPatternGlobal : null,
          imf: hasPatternData ? aggPatternImf : null,
          survivors: aggPatternSurvivors,
        },
        familyPaths: Object.keys(aggFamilyPaths).length > 0 ? aggFamilyPaths : undefined,
      },
    };
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
          
          // Directive 11.4H.6A Task 4: Get engine state to determine scan mode
          let activeMode: 'paper' | 'live' = 'paper';
          let tradingActive = false;
          try {
            const paperContext = await storage.getSystemContext('paper');
            const liveContext = await storage.getSystemContext('live');
            tradingActive = paperContext?.isEngineActive || liveContext?.isEngineActive || false;
            activeMode = liveContext?.isEngineActive ? 'live' : 'paper';
          } catch (err) {
            console.warn('[11.4H.6A][ModeCheck] Failed to get context, defaulting to paper');
          }
          
          console.log(`[11.4H.6A][ModeCheck] Mode=${activeMode} | TradingActive=${tradingActive}`);
          
          // R9.3.HF-6: Add timeout protection to prevent hanging scans
          const timeoutPromise = new Promise<void>((_, reject) => 
            setTimeout(() => reject(new Error('Scan timeout')), SCAN_TIMEOUT_MS)
          );
          
          // Directive 11.4H.6A Task 4: Single scan during passive learning, mode-specific during active trading
          let scanPromise: Promise<any>;
          if (!tradingActive) {
            console.log(`[11.4H.6A][PassiveScan] Passive learning active — running single scan for mode=${activeMode}`);
            scanPromise = this.scanMode(activeMode).catch(err => 
              console.error(`[11.4H.6A][PassiveScan][Error] ${err.message}`)
            );
          } else {
            console.log(`[11.4H.6A][ActiveScan] Trading active — running scan for mode=${activeMode}`);
            scanPromise = this.scanMode(activeMode).catch(err => 
              console.error(`[11.4H.6A][${activeMode}Scan][Error] ${err.message}`)
            );
          }
          
          await Promise.race([scanPromise, timeoutPromise]).catch(err => {
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
    
    // Directive 11.4H.6A Task 4: Determine mode for initial scan
    let initialMode: 'paper' | 'live' = 'paper';
    let initialTradingActive = false;
    try {
      const paperContext = await storage.getSystemContext('paper');
      const liveContext = await storage.getSystemContext('live');
      initialTradingActive = paperContext?.isEngineActive || liveContext?.isEngineActive || false;
      initialMode = liveContext?.isEngineActive ? 'live' : 'paper';
    } catch (err) {
      console.warn('[11.4H.6A][InitialScan] Failed to get context, defaulting to paper');
    }
    
    console.log(`[11.4H.6A][InitialScan] Mode=${initialMode} | TradingActive=${initialTradingActive}`);
    console.log('[FX5Scanner][R9.3.HF-6] Running initial scan');
    
    try {
      await this.scanMode(initialMode);
      console.log(`[FX5Scanner][R9.3.HF-6] ${initialMode} initial scan complete`);
    } catch (err) {
      console.error(`[FX5Scanner][R9.3.HF-6] ${initialMode} initial scan error:`, err);
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
      // Batch 19G: Load quant filters (primary) — backward compatible default path
      const filters = await storage.getScreenerFilters({ mode, filterPath: 'active_quant' });
      if (!filters) {
        console.warn(`[FX5Scanner][${mode}] No filters found for active_quant, skipping scan`);
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

      // Directive 11.4H.4 Task 5: Get engine state BEFORE batch scan to determine passive learning mode
      // When engine is stopped (!isEngineActive), we are in passive learning mode
      // CRITICAL: On context failure, default to NOT passive (filters always apply) for safety
      const earlyContextPromise = storage.getSystemContext(mode);
      const earlyContextTimeout = new Promise<any>((_, reject) => 
        setTimeout(() => reject(new Error('getSystemContext timeout')), 5000)
      );
      let earlyContext: any = null;
      let contextFailed = false;
      try {
        earlyContext = await Promise.race([earlyContextPromise, earlyContextTimeout]);
      } catch (err: any) {
        console.error(`[FX5Scanner][11.4H.4][${mode}] Early getSystemContext failed: ${err.message}`);
        contextFailed = true;
      }
      
      // SAFE DEFAULT: On context failure, assume NOT passive (filters apply to all pairs including benchmarks)
      // Only allow passive mode when we have confirmed engine is stopped
      const isPassiveLearningMode = contextFailed ? false : !(earlyContext?.isEngineActive ?? true);
      console.log(`[FX5Scanner][11.4H.4][${mode}] Passive learning mode: ${isPassiveLearningMode} (contextFailed=${contextFailed}, isEngineActive=${earlyContext?.isEngineActive})`);

      // Batch 19G HF3: Reload quant filters from correct DB row based on mode
      // Previously always loaded 'active_quant' regardless of passive learning state.
      // In VTS/passive learning, vts_quant has different thresholds (e.g., minPrice $0.05 vs $0.25).
      if (isPassiveLearningMode) {
        const vtsQuantRow = await storage.getScreenerFilters({ mode, filterPath: 'vts_quant' });
        if (vtsQuantRow) {
          Object.assign(filters, vtsQuantRow);
          console.log(`[19G][HF3][FX5] Quant filters reloaded from vts_quant (passive learning): minPrice=${vtsQuantRow.minPrice}, minVolume=${vtsQuantRow.minVolume}`);
        }
      }

      // Batch 19G: Load pattern filter row from DB for dual-path scanning
      const patternFilterPath = isPassiveLearningMode ? 'vts_pattern' : 'active_pattern';
      const patternDbRow = await storage.getScreenerFilters({ mode, filterPath: patternFilterPath });
      // Batch 19G HF2: Map ALL DB fields for pattern filter (not just 3)
      // Previously only volume/spread/history were mapped; minPrice, maxPrice,
      // excludeStablecoins, minLiquidity, minMarketCap fell back to quant values.
      const activePatternGlobalFilters = patternDbRow ? {
        MIN_VOLUME_USD: parseFloat(patternDbRow.minVolume ?? '250000'),
        MAX_BID_ASK_SPREAD: parseFloat(patternDbRow.maxBidAskSpread ?? '1.0'),
        MIN_HISTORY_DAYS: patternDbRow.minHistoryDays ?? 14,
        MIN_PRICE: parseFloat(patternDbRow.minPrice ?? '0.25'),
        MAX_PRICE: parseFloat(patternDbRow.maxPrice ?? '100000'),
        EXCLUDE_STABLECOINS: patternDbRow.excludeStablecoins ?? true,
        MIN_LIQUIDITY: parseFloat(patternDbRow.minLiquidity ?? '250000'),
        MIN_MARKET_CAP: parseFloat(patternDbRow.minMarketCap ?? '100000000'),
      } : {
        MIN_VOLUME_USD: 250_000, // Fallback if DB row missing
        MAX_BID_ASK_SPREAD: 1.0,
        MIN_HISTORY_DAYS: 14,
        MIN_PRICE: 0.25,
        MAX_PRICE: 100_000,
        EXCLUDE_STABLECOINS: true,
        MIN_LIQUIDITY: 250_000,
        MIN_MARKET_CAP: 100_000_000,
      };
      console.log(`[19G][FX5] Pattern global filters from DB (${patternFilterPath}):`, activePatternGlobalFilters);

      // Batch 19G: Also load quant IMF DB row for VTS relaxed thresholds
      const quantFilterPath = isPassiveLearningMode ? 'vts_quant' : 'active_quant';
      const quantDbRow = isPassiveLearningMode
        ? await storage.getScreenerFilters({ mode, filterPath: 'vts_quant' })
        : filters; // Active quant is already loaded as 'filters'
      const dbVtsImfThresholds = {
        LQ_MIN: parseFloat(quantDbRow?.lqMin ?? '25'),
        VN_MAX: parseFloat(quantDbRow?.vnMax ?? '0.98'),
        CORR_MAX: parseFloat(quantDbRow?.corrMax ?? '0.95'),
      };

      // Batch 19G: Load pattern IMF thresholds from DB for pattern pool filtering
      let patternConfigValid = true;
      if (!patternDbRow) {
        console.error('[BATCH34][CONFIG_MISSING] No DB row found for pattern filter path. Pattern IMF filtering will be SKIPPED this cycle. Check screener_filters table.');
        patternConfigValid = false;
      }
      const patternImfThresholds = patternConfigValid ? {
        LQ_MIN: parseFloat(patternDbRow!.lqMin!),
        VN_MAX: parseFloat(patternDbRow!.vnMax!),
        DI_MIN: parseFloat(patternDbRow!.diMin!),
      } : null;

    // Batch 22: Load family-specific filter profiles from DB
    const familyFilterPaths = ['trend', 'reversal', 'breakout', 'oscillator'] as const;
    const familyDbRows: Record<string, any> = {};
    const familyImfThresholds: Record<string, { LQ_MIN: number; VN_MAX: number; DI_MIN: number; DI_MAX: number } | null> = {};

    for (const family of familyFilterPaths) {
      const familyPath = isPassiveLearningMode ? `vts_${family}` : `active_${family}`;
      const familyRow = await storage.getScreenerFilters({ mode, filterPath: familyPath });
      familyDbRows[family] = familyRow;
      if (!familyRow) {
        console.error(`[BATCH34][CONFIG_MISSING] No DB row found for family filter path '${familyPath}' \u2014 family IMF filtering will be SKIPPED. Check screener_filters table.`);
        familyImfThresholds[family] = null as any;
        continue;
      }
      familyImfThresholds[family] = {
        LQ_MIN: parseFloat(familyRow.lqMin!),
        VN_MAX: parseFloat(familyRow.vnMax!),
        DI_MIN: parseFloat(familyRow.diMin!),
        DI_MAX: parseFloat(familyRow.diMax!),
      };
      console.log(`[22][FX5] Family filter '${familyPath}': LQ>=${familyImfThresholds[family]!.LQ_MIN} VN<=${familyImfThresholds[family]!.VN_MAX} DI=${familyImfThresholds[family]!.DI_MIN}-${familyImfThresholds[family]!.DI_MAX}`);
    }

      // Directive 11.4C.1: Execute adaptive batch scanning (100 pairs: 60% Ideal + 40% Rotational)
      const batchResult: BatchResult = await collectAdaptiveBatch(
        this.krakenService,
        filters,
        mode,
        {
          passiveLearning: isPassiveLearningMode, // Directive 11.4H.4 Task 5: Pass passive learning flag
          patternFilters: activePatternGlobalFilters, // Batch 19G: Pattern global filters from DB
        }
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
      // Directive 11.4H: Normalize symbols at ingress
      // Directive 11.4H.1 Task 2: Validate metrics before processing
      // Handle undefined/null volume24h gracefully with safe defaults
      
      // Batch 18F+18G: Pre-fetch OHLC data for survivors to populate ohlcCache.
      // Provides ~720 60-min candles for VN/σ/DI (close prices) and LQ (per-candle volume).
      // Sequential fetches avoid Kraken rate limiting.
      // First scan after restart: ~60-70 API calls (~17s). Subsequent: mostly cache hits (<1s).
      const ohlcDataMap = new Map<string, { prices: number[], avgVolumeUSD: number }>();
      for (const s of survivors) {
        if (s.volume24h == null || s.dailyRange == null) continue;
        const sym = normalizeToInternalSymbol(s.symbol);
        try {
          const { ohlc } = await ohlcCache.getOHLCData(sym, 60);
          if (ohlc && ohlc.length >= 10) {
            const closePrices = ohlc.map((c: any) => parseFloat(c.close));
            // Batch 18G: Compute avg USD volume per candle for OHLC-based LQ.
            // Uses typicalPrice × volume (same formula as imf-metrics.ts).
            let totalPriceVolume = 0;
            for (const c of ohlc) {
              const tp = (parseFloat(c.high) + parseFloat(c.low) + parseFloat(c.close)) / 3;
              totalPriceVolume += tp * parseFloat(c.volume || '0');
            }
            const avgVolumeUSD = totalPriceVolume / ohlc.length;
            ohlcDataMap.set(sym, { prices: closePrices, avgVolumeUSD });
          }
        } catch {
          // OHLC fetch failed for this symbol — will fall back to ticker data
        }
      }
      console.log(`[Batch18G][OHLC] Pre-fetched ${ohlcDataMap.size}/${survivors.length} survivors`);

      // Batch 19F HF3: Also pre-fetch OHLC for pattern-only global survivors.
      // Pattern global filter may admit pairs that FAILED quant global filters.
      // Without OHLC data, pattern-only pairs get DI=0 and are rejected by pattern IMF (DI >= 30).
      const patternGlobalSurvivorsForOhlc = (batchResult.patternSurvivors || []).filter(ps => {
        const sym = normalizeToInternalSymbol(ps.symbol);
        return !ohlcDataMap.has(sym); // Only fetch for pairs not already in ohlcDataMap
      });
      if (patternGlobalSurvivorsForOhlc.length > 0) {
        let patternOhlcFetched = 0;
        for (const ps of patternGlobalSurvivorsForOhlc) {
          const sym = normalizeToInternalSymbol(ps.symbol);
          try {
            const { ohlc } = await ohlcCache.getOHLCData(sym, 60);
            if (ohlc && ohlc.length >= 10) {
              const closePrices = ohlc.map((c: any) => parseFloat(c.close));
              let totalPriceVolume = 0;
              for (const c of ohlc) {
                const tp = (parseFloat(c.high) + parseFloat(c.low) + parseFloat(c.close)) / 3;
                totalPriceVolume += tp * parseFloat(c.volume || '0');
              }
              const avgVolumeUSD = totalPriceVolume / ohlc.length;
              ohlcDataMap.set(sym, { prices: closePrices, avgVolumeUSD });
              patternOhlcFetched++;
            }
          } catch {
            // OHLC fetch failed — pattern-only pair will use fallback defaults
          }
        }
        console.log(`[19F][PATTERN_OHLC] Pre-fetched OHLC for ${patternOhlcFetched}/${patternGlobalSurvivorsForOhlc.length} pattern-only pairs`);
      }

      const classifiedSurvivors = survivors
        .filter(s => {
          // Directive 11.4H.1 Task 2: Skip pairs with incomplete metrics
          if (s.volume24h === undefined || s.volume24h === null || s.dailyRange === undefined || s.dailyRange === null) {
            console.debug(`[11.4H.1][FX5] Skipping ${s.symbol}: incomplete metrics (vol=${s.volume24h}, range=${s.dailyRange})`);
            return false;
          }
          return true;
        })
        .map(s => {
        // Directive 11.4H.1 Task 2: Normalize FIRST, then check for stablecoin (correct order)
        const normalizedSymbol = normalizeToInternalSymbol(s.symbol);
        const volumeUSD = typeof s.volume24h === 'number' && !isNaN(s.volume24h) ? s.volume24h : 0;
        
        // Directive 11.4H.4 Task 3: Strict Base/Quote regex for stablecoin detection
        // Prevents false positives like FARTCOIN/USDC being marked as stable
        const isStablePair = /^(USDT|USDC|DAI|PYUSD|USDE)\/(USD|EUR|USDT|USDC|DAI)$/i.test(normalizedSymbol);
        const isStable = isStablePair;
        const isBlueChip = volumeUSD > 50_000_000;
        const volatility = s.dailyRange ?? 0;
        const isStableVol = volatility > 0.0005;
        
        // Directive 11.4H.2 Task 1: Check if symbol is a benchmark asset
        const isBenchmark = isBenchmarkSymbol(normalizedSymbol);
        
        // Directive 11.4H.6 Task 4: Benchmark bypass flags for volatility/boring filters
        // Benchmarks should never be rejected for low volatility or "boring" behavior
        const bypassVolatilityReject = isBenchmark;
        const bypassBoringReject = isBenchmark;
        
        // Directive 11.4H.2: Force include benchmark symbols OR blue-chips OR volatile stablecoins
        const forceInclude = isBenchmark || isBlueChip || (isStable && isStableVol) || bypassVolatilityReject;
        const benchmarkForceInclude = forceInclude;
        
        // Directive 11.4H.2: Tag asset type for UI visibility (separate from poolType)
        const assetType = isBenchmark ? 'BENCHMARK' as const : 'STANDARD' as const;
        const volumeClass = classifyVolume(volumeUSD);
        
        // Directive 11.4H.1 Task 2: Log forced inclusions for audit
        if (forceInclude) {
          console.info(`[FX5-Scanner] Force-included benchmark: ${normalizedSymbol} (blueChip=${isBlueChip}, stablecoin=${isStable && isStableVol})`);
        }
        
        // Directive 9.1.E: Compute core metrics
        const prices = s.priceHistory || s.history || [];
        const tradeCount = s.trades24h || s.tradeCount || 100; // Default trade count if unavailable
        
        // Directive 11.4H.3: Compute spread from ask/bid prices if available
        // Kraken returns ask/bid but not pre-calculated spread
        let spread = 0.001; // Default fallback
        const ask = (s as any).ask || (s as any).askPrice;
        const bid = (s as any).bid || (s as any).bidPrice;
        if (ask && bid && bid > 0) {
          // Calculate spread as decimal (e.g., 0.1% = 0.001)
          spread = (ask - bid) / bid;
        } else if (s.spread) {
          // If spread is provided in percentage form, convert to decimal
          spread = s.spread > 1 ? s.spread / 100 : s.spread;
        } else if ((s as any).bidAskSpread !== undefined) {
          // Directive 11.4H.3: bidAskSpread from market-scanner is ALWAYS in percentage form
          // (e.g., 0.1 means 0.1%, calculated as ((ask-bid)/bid)*100)
          // Always divide by 100 to convert to decimal format
          const bap = (s as any).bidAskSpread;
          spread = bap / 100;
        }
        
        // Directive 11.4H.3: Populate cost cache with spread data during scanning
        // This ensures friction scores vary based on actual market data
        setCostMetrics(normalizedSymbol, { spread });
        
        // Batch 18F+18G: Use pre-fetched OHLC data for ALL IMF metrics.
        // ohlcDataMap provides ~720 60-min candles per symbol: close prices for VN/σ/DI,
        // per-candle avg volume for LQ. Falls back to ticker data if OHLC unavailable.
        const ohlcEntry = ohlcDataMap.get(normalizedSymbol);
        const ohlcPrices = ohlcEntry ? ohlcEntry.prices : prices;
        const imfSource = ohlcEntry
          ? `ohlc(${ohlcPrices.length})`
          : `ticker(${prices.length}pts)`;

        // Batch 18J: LQ standardized on Formula B (log10 scale, 0-100).
        // Formula A (calculateLogLiquidity) saturates at 100 for all crypto pairs.
        // Formula B produces discriminating values: per-candle avg → 30-60, 24h ticker → 50-80.
        // Primary: per-candle OHLC volume. Fallback: 24h ticker volume (same formula).
        const LQ = (ohlcEntry && ohlcEntry.avgVolumeUSD > 0)
          ? Math.min(100, Math.max(0, Math.log10(ohlcEntry.avgVolumeUSD + 1) * 10))
          : Math.min(100, Math.max(0, Math.log10(volumeUSD + 1) * 10));
        let VolNoise = calculateVolNoise(ohlcPrices);
        // Batch 19G VN HF: Pass DB-driven thresholds to passesCoreMetricFilters
        const dbLqMin = parseFloat(filters.lqMin ?? '35');
        const dbVnMax = parseFloat(filters.vnMax ?? '0.93');
        const passesMetricFilter = passesCoreMetricFilters(LQ, VolNoise, dbLqMin, dbVnMax);

        // Directive 11.7H Task H-04: Sanity clamp for out-of-range VN values
        // Prevents rare division or empty-array anomalies from blocking scans
        if (VolNoise > 2 || VolNoise < 0 || !Number.isFinite(VolNoise)) {
          console.warn(`[11.7H][VN] Out-of-range VN=${VolNoise} for ${normalizedSymbol} — defaulting to 0.6`);
          VolNoise = 0.6;
        }

        const DI = calculateDirectionalIntegrity(ohlcPrices);
        const Sigma = calculateSigma(ohlcPrices);
        
        // Directive 9.1.G: Telemetry logging with [9.1] tags
        console.log(`[9.1][FX5] ${s.symbol} LQ=${LQ.toFixed(1)} DI=${DI.toFixed(1)} VN=${VolNoise.toFixed(2)} σ=${Sigma.toFixed(4)} src=${imfSource}`);
        
        // Directive 9.1.F: Log if pair fails core metric filters
        if (!passesMetricFilter) {
          // Batch 19G VN HF: Log DB-driven thresholds instead of hardcoded CORE_METRIC_THRESHOLDS
          console.log(`[9.1][FILTER] Excluding ${s.symbol} - LQ=${LQ.toFixed(1)}, VN=${VolNoise.toFixed(2)} (threshold: LQ>=${dbLqMin}[DB], VN<=${dbVnMax}[DB])`);
        }
        
        return { 
          ...s,
          symbol: normalizedSymbol, // Directive 11.4H: Use normalized symbol
          volumeClass, 
          volumeUSD,
          LQ,
          DI,
          VolNoise,
          Sigma,
          passesMetricFilter,
          forceInclude, // Directive 11.4H Task 3
          benchmarkForceInclude, // Directive 11.4H Task 3
          isBlueChip,
          isStablecoin: isStable && isStableVol, // Directive 11.4H.1: Use correctly named variable
          volatility,
          isBenchmark, // Directive 11.4H.2: Benchmark flag
          assetType, // Directive 11.4H.2: Asset type for UI (BENCHMARK/STANDARD)
          bypassVolatilityReject, // Directive 11.4H.6 Task 4: Benchmark bypass flags
          bypassBoringReject // Directive 11.4H.6 Task 4: Benchmark bypass flags
        };
      });

      // REB 2.8.7: Add survivors to Active Filter Pool (deduped, TTL-managed)
      // Single-gate pattern: Check ONLY isEngineActive (passive learning = !isEngineActive)
      console.log(`[8.6.7][DEBUG] FX5 scan complete - survivors.length=${classifiedSurvivors.length}, eligibleCount=${eligibleCount}`);
      
      // Directive 11.4H.4: Reuse earlyContext instead of duplicate database fetch
      // isEngineActive is derived from earlyContext (already fetched before collectAdaptiveBatch)
      const isEngineActive = earlyContext?.isEngineActive || false;
      console.log(`[FX5Scanner][11.4H.4][${mode}] Engine active: ${isEngineActive} (reused from earlyContext)`);

      // REB 2.8.7: Enforce passive mode - clear pool if engine stopped
      activeFilterPool.enforcePassiveModeIfStopped(mode, isEngineActive);

      // Batch 43: Global quant IMF stage REMOVED.
      // classifiedSurvivors flow directly into the family fan-out (lines below).
      // Family-specific IMF filters (trend/reversal/breakout/oscillator) are the
      // operative quant IMF gate — no redundant global LQ/VN pre-filter.

      // Batch 19F: Pattern pool from dual global filter path
      // ALL 300 pairs went through pattern global filters in collectAdaptiveBatch()
      // Pattern global survivors are further filtered by pattern IMF thresholds here
      const patternGlobalSurvivors = batchResult.patternSurvivors || [];

      // Batch 19F HF: Compute IMF metrics for pattern-only survivors
      // Pattern global filter may admit pairs that FAILED the quant global filter.
      // Those pairs have no IMF metrics in classifiedSurvivors (which only contains quant survivors).
      // We must compute LQ, VN, DI for these pattern-only pairs so the IMF filter can evaluate them.
      const classifiedSymbolSet = new Set(classifiedSurvivors.map(cs => cs.symbol));
      const patternOnlySurvivors = patternGlobalSurvivors.filter(s => {
        const normalizedSym = normalizeToInternalSymbol(s.symbol);
        return !classifiedSymbolSet.has(normalizedSym) && !classifiedSymbolSet.has(s.symbol);
      });

      // Compute IMF metrics for pattern-only pairs (same computation as classifiedSurvivors)
      const patternOnlyClassified = patternOnlySurvivors.map(s => {
        const normalizedSymbol = normalizeToInternalSymbol(s.symbol);
        const volumeUSD = typeof s.volume24h === 'number' && !isNaN(s.volume24h) ? s.volume24h : 0;
        const ohlcEntry = ohlcDataMap.get(normalizedSymbol);
        const ohlcPrices = ohlcEntry ? ohlcEntry.prices : [];

        // Same LQ computation as main classifiedSurvivors (Formula B, log10 scale)
        const LQ = (ohlcEntry && ohlcEntry.avgVolumeUSD > 0)
          ? Math.min(100, Math.max(0, Math.log10(ohlcEntry.avgVolumeUSD + 1) * 10))
          : Math.min(100, Math.max(0, Math.log10(volumeUSD + 1) * 10));
        let VolNoise = ohlcPrices.length > 0 ? calculateVolNoise(ohlcPrices) : 0.6;
        if (VolNoise > 2 || VolNoise < 0 || !Number.isFinite(VolNoise)) VolNoise = 0.6;
        const DI = ohlcPrices.length > 0 ? calculateDirectionalIntegrity(ohlcPrices) : 0;

        console.log(`[19F][PATTERN_IMF] Computing IMF for pattern-only pair ${normalizedSymbol}: LQ=${LQ.toFixed(1)} VN=${VolNoise.toFixed(2)} DI=${DI.toFixed(1)}`);

        return { ...s, symbol: normalizedSymbol, LQ, VolNoise, DI, volumeUSD };
      });

      if (patternOnlyClassified.length > 0) {
        console.log(`[19F][PATTERN_IMF] Computed IMF metrics for ${patternOnlyClassified.length} pattern-only pairs (not in quant survivors)`);
      }

      // Merge: classifiedSurvivors (quant) + patternOnlyClassified (pattern-only) for IMF lookup
      const allClassifiedForPatternLookup = [...classifiedSurvivors, ...patternOnlyClassified];

      // Batch 19G: Pattern IMF thresholds — DB values as base, regime-aware overrides from code
      // DB provides the defaults; getPatternPoolThresholds() overrides when regime data is available
      let activePatternThresholds = {
        LQ_MIN: patternImfThresholds.LQ_MIN,
        VN_MAX: patternImfThresholds.VN_MAX,
        DI_TRENDING_MIN: patternImfThresholds.DI_MIN,
      };
      // Batch 47f15: Code-driven regime overrides DISABLED per Kyle directive.
      // DB values are now the sole authority for pattern IMF thresholds.
      // Regime-specific DI overrides (from Batch 19C) will be migrated to DB-governed
      // model in a future batch. Until then, DB values apply directly.
      // Original regime override code retained as comment for reference:
      // try { const mce = getMarketContextEngine(); const globalRegime = mce.getDominantRegime();
      //   if (globalRegime && globalRegime.pairCount >= 5) {
      //     const regimeOverrides = getPatternPoolThresholds(globalRegime.regime);
      //     activePatternThresholds = { LQ_MIN: regimeOverrides.LQ_MIN, VN_MAX: regimeOverrides.VN_MAX,
      //       DI_TRENDING_MIN: regimeOverrides.DI_TRENDING_MIN }; regimeThresholdsActive = true;
      // }} catch {}
      const regimeThresholdsActive = false;

      // Apply pattern IMF thresholds to pattern global survivors
      // Now uses allClassifiedForPatternLookup which includes BOTH quant survivors AND pattern-only pairs
      const patternPoolSurvivors = patternGlobalSurvivors
        .map(s => {
          const normalizedSym = normalizeToInternalSymbol(s.symbol);
          // Find IMF metrics from ALL classified pairs (quant + pattern-only)
          const classified = allClassifiedForPatternLookup.find(cs => cs.symbol === normalizedSym || cs.symbol === s.symbol);
          return classified ? { ...classified, ...s } : null;
        })
        .filter((s): s is NonNullable<typeof s> => s !== null)
        .filter(s => {
          const lq = s.LQ ?? 0;
          const vn = s.VolNoise ?? 1.0;
          const di = s.DI ?? 0;
          return (
            lq >= activePatternThresholds.LQ_MIN &&
            vn <= activePatternThresholds.VN_MAX &&
            di >= activePatternThresholds.DI_TRENDING_MIN
          );
        });

      console.log(`[19F][PATTERN_POOL] Pattern pool: ${patternPoolSurvivors.length}/${patternGlobalSurvivors.length} passed IMF${regimeThresholdsActive ? ' (regime-adjusted)' : ' (static)'} thresholds (dual-path)`);

      // Batch 19H: Pattern IMF per-metric breakdown
      let patternImfFailedLQ = 0;
      let patternImfFailedVN = 0;
      let patternImfFailedDI = 0;
      const patternImfTotal = patternGlobalSurvivors.length;
      // Re-evaluate which metric failed for each rejected pair
      for (const s of patternGlobalSurvivors) {
        const normalizedSym = normalizeToInternalSymbol(s.symbol);
        const classified = allClassifiedForPatternLookup.find(cs => cs.symbol === normalizedSym || cs.symbol === s.symbol);
        if (!classified) continue;
        const lq = classified.LQ ?? 0;
        const vn = classified.VolNoise ?? 1.0;
        const di = classified.DI ?? 0;
        const passedAll = lq >= activePatternThresholds.LQ_MIN && vn <= activePatternThresholds.VN_MAX && di >= activePatternThresholds.DI_TRENDING_MIN;
        if (!passedAll) {
          if (lq < activePatternThresholds.LQ_MIN) patternImfFailedLQ++;
          if (vn > activePatternThresholds.VN_MAX) patternImfFailedVN++;
          if (di < activePatternThresholds.DI_TRENDING_MIN) patternImfFailedDI++;
        }
      }


    // Batch 22: Run family-specific IMF filters on all classified survivors
    const familyPoolSurvivors: Record<string, typeof classifiedSurvivors> = {};
    const familyImfDiagnostics: Record<string, { failedLQ: number; failedVN: number; failedDI: number; passed: number; total: number }> = {};

    for (const family of familyFilterPaths) {
      const thresholds = familyImfThresholds[family];
      let failedLQ = 0, failedVN = 0, failedDI = 0, passed = 0;
      const survivors: typeof classifiedSurvivors = [];

      for (const s of classifiedSurvivors) {
        const lq = s.LQ ?? 0;
        const vn = s.VolNoise ?? 1;
        const di = s.DI ?? 50;

        if (lq < thresholds.LQ_MIN) { failedLQ++; continue; }
        if (vn > thresholds.VN_MAX) { failedVN++; continue; }
        if (di < thresholds.DI_MIN || di > thresholds.DI_MAX) { failedDI++; continue; }

        passed++;
        survivors.push(s);
      }

      familyPoolSurvivors[family] = survivors;
      familyImfDiagnostics[family] = { failedLQ, failedVN, failedDI, passed, total: classifiedSurvivors.length };
      console.log(`[22][FX5] Family '${family}' IMF: ${passed} passed / ${classifiedSurvivors.length} total (LQ=${failedLQ} VN=${failedVN} DI=${failedDI} failed)`);
    }

      // Batch 43: Build family-qualified union = unique pairs that passed at least one family IMF
      // This replaces the old metricFilteredSurvivors (global quant IMF gate)
      const familyQualifiedSymbolSet = new Set<string>();
      const familyQualifiedUnion: typeof classifiedSurvivors = [];
      for (const survivors of Object.values(familyPoolSurvivors)) {
        for (const s of survivors) {
          if (!familyQualifiedSymbolSet.has(s.symbol)) {
            familyQualifiedSymbolSet.add(s.symbol);
            familyQualifiedUnion.push(s);
          }
        }
      }

      // Batch 35: Compute quant-level DI failures = unique pairs that failed DI in ALL families
      const pairsFailedDiAllFamilies = classifiedSurvivors.filter(s => {
        const di = s.DI ?? 50;
        return !familyFilterPaths.some(f => {
          const t = familyImfThresholds[f];
          return t && di >= t.DI_MIN && di <= t.DI_MAX;
        });
      });
      // Batch 35: Compute pattern benchmark bypassed count
      const patternBenchmarkBypassed = patternPoolSurvivors.filter((s: any) => s.isBenchmark || s.bypassVolatilityReject || s.bypassBoringReject).length;
      // Batch 43: Family-rejected count = classifiedSurvivors that didn't pass any family
      const familyRejectedCount = classifiedSurvivors.length - familyQualifiedUnion.length;
      if (familyRejectedCount > 0) {
        console.log(`[43][FILTER] ${familyRejectedCount}/${classifiedSurvivors.length} quant pairs rejected by all family IMF filters`);
      }

      // Directive 11.4H.2: Log benchmark pair count for diagnostics
      const benchmarkCount = familyQualifiedUnion.filter(s => s.isBenchmark).length;
      if (benchmarkCount > 0) {
        const benchmarkSymbols = familyQualifiedUnion.filter(s => s.isBenchmark).map(s => s.symbol).slice(0, 5);
        console.log(`[11.4H.2][BENCHMARK] ${benchmarkCount} benchmark pairs in family-qualified survivors: ${benchmarkSymbols.join(', ')}${benchmarkCount > 5 ? '...' : ''}`);
      }

      // Batch 43: IMF metrics count from family-qualified union
      const imfMetricsCount = familyQualifiedUnion.filter(s => s.LQ !== undefined || s.VolNoise !== undefined).length;
      console.log(`[43][IMF] Family-qualified survivors: ${familyQualifiedUnion.length}/${classifiedSurvivors.length} (tradingActive=${isEngineActive})`);

      const totalFamilySurvivors = Object.values(familyPoolSurvivors).reduce((sum, arr) => sum + arr.length, 0);
      console.log(`[43][ScanFlow] Global: ${classifiedSurvivors.length} | Family-qualified (unique): ${familyQualifiedUnion.length} | Family-qualified (sum): ${totalFamilySurvivors} | Benchmarks: ${benchmarkCount}`);

      // REB 2.8.7: Single-gate pattern - populate pool ONLY when engine ACTIVE
      if (isEngineActive) {
        // Batch 43: Active pool built from family-qualified union (not global quant IMF)
        const poolStats = activeFilterPool.addSurvivors(mode, familyQualifiedUnion);
        console.log(`[REB 2.8.7][ActivePool] Pool populated: added=${poolStats.added}, updated=${poolStats.updated}, skipped=${poolStats.skipped}, survivors=${familyQualifiedUnion.length} (family-qualified)`);
        // Phase 14.5: Add pattern pool survivors
        if (patternPoolSurvivors.length > 0) {
          const patternStats = activeFilterPool.addPatternPoolSurvivors(mode, patternPoolSurvivors.map(s => ({
            symbol: s.symbol,
            currentPrice: s.currentPrice ?? 0,
            volume24h: s.volume24h ?? 0,
            dailyRange: s.dailyRange ?? 0,
          })));
          console.log(`[14.5][PATTERN_POOL] Pattern pool populated: added=${patternStats.added}, skipped=${patternStats.skipped}`);
        }
      } else {
        // Engine STOPPED: Pool cleared by enforcePassiveModeIfStopped (passive learning)
        // Directive 11.4H.6 Task 3: IMF metrics still persisted above even in passive mode
        console.log(`[REB 2.8.7][ActivePool] Engine stopped - pool cleared (passive learning mode). IMF metrics preserved.`);
      }

      // Get the current active pool (deduped, non-expired)
      const activeFilteredPoolEntries = activeFilterPool.getActivePool(mode);
      
      const cycleStartTimestamp = new Date().toISOString();
      const cycleEndTimestamp = new Date().toISOString();
      
      // Batch 43: Store scan diagnostics — quant IMF now reflects family fan-out aggregate
      // No global quant IMF stage exists. The "imf" section aggregates family-level results.
      const aggFamilyFailedLQ = Object.values(familyImfDiagnostics).reduce((s, d) => s + d.failedLQ, 0);
      const aggFamilyFailedVN = Object.values(familyImfDiagnostics).reduce((s, d) => s + d.failedVN, 0);
      const aggFamilyFailedDI = Object.values(familyImfDiagnostics).reduce((s, d) => s + d.failedDI, 0);
      const scanDiag: ScanDiagnostics = {
        timestamp: new Date().toISOString(),
        mode,
        totalPairsScanned: evaluatedCount,
        allSymbolsScanned: evaluatedSymbols,
        quant: {
          global: { ...breakdown },
          imf: {
            failedLQ: aggFamilyFailedLQ,
            failedVN: aggFamilyFailedVN,
            failedDI: aggFamilyFailedDI,
            passed: totalFamilySurvivors,
            total: classifiedSurvivors.length * familyFilterPaths.length,
            benchmarkBypassed: 0,
          },
          survivors: totalFamilySurvivors,
        },
        pattern: {
          global: batchResult.patternBreakdown ?? null,
          imf: batchResult.patternBreakdown ? {
            failedLQ: patternImfFailedLQ,
            failedVN: patternImfFailedVN,
            failedDI: patternImfFailedDI,
            passed: patternPoolSurvivors.length,
            total: patternImfTotal,
            benchmarkBypassed: patternBenchmarkBypassed,
          } : null,
          survivors: patternPoolSurvivors.length,
        },
        // Batch 22: Family path diagnostics (includes survivor symbols for VTS family tagging)
        familyPaths: Object.fromEntries(
          familyFilterPaths.map(f => [f, {
            imf: familyImfDiagnostics[f] ?? { failedLQ: 0, failedVN: 0, failedDI: 0, passed: 0, total: 0 },
            survivors: familyPoolSurvivors[f]?.length ?? 0,
            survivorSymbols: (familyPoolSurvivors[f] ?? []).map(s => s.symbol),
          }])
        ),
        // Batch 48: Unique pairs that passed at least one family IMF
        familyQualifiedUnique: familyQualifiedUnion.length,
        destination: isEngineActive ? 'active_pool' : 'vts_batch',
        destinationCount: 0,
      };
      this.lastScanDiagnostics = scanDiag;

      // Batch 34: Compute metric distribution stats — combined + per-pool (quant and pattern)
      const allSurvivors = [...classifiedSurvivors, ...patternPoolSurvivors];
      const lqValues = allSurvivors.map(s => s.LQ).filter(v => v !== undefined && v !== null && Number.isFinite(v)).sort((a, b) => a - b);
      const diValues = allSurvivors.map(s => s.DI).filter(v => v !== undefined && v !== null && Number.isFinite(v)).sort((a, b) => a - b);
      const vnValues = allSurvivors.map(s => s.VolNoise).filter(v => v !== undefined && v !== null && Number.isFinite(v)).sort((a, b) => a - b);
      const quantLqValues = classifiedSurvivors.map(s => s.LQ).filter(v => v !== undefined && v !== null && Number.isFinite(v)).sort((a, b) => a - b);
      const quantDiValues = classifiedSurvivors.map(s => s.DI).filter(v => v !== undefined && v !== null && Number.isFinite(v)).sort((a, b) => a - b);
      const patternLqValues = patternPoolSurvivors.map(s => s.LQ).filter(v => v !== undefined && v !== null && Number.isFinite(v)).sort((a, b) => a - b);
      const patternDiValues = patternPoolSurvivors.map(s => s.DI).filter(v => v !== undefined && v !== null && Number.isFinite(v)).sort((a, b) => a - b);

      function computeDistStats(arr: number[]) {
        if (arr.length === 0) return { min: 0, max: 0, median: 0, p25: 0, p75: 0, count: 0 };
        const min = arr[0];
        const max = arr[arr.length - 1];
        const median = arr[Math.floor(arr.length / 2)];
        const p25 = arr[Math.floor(arr.length * 0.25)];
        const p75 = arr[Math.floor(arr.length * 0.75)];
        return { min: Math.round(min * 100) / 100, max: Math.round(max * 100) / 100, median: Math.round(median * 100) / 100, p25: Math.round(p25 * 100) / 100, p75: Math.round(p75 * 100) / 100, count: arr.length };
      }

      (scanDiag as any).metricDistribution = {
        combined: {
          lq: computeDistStats(lqValues),
          di: computeDistStats(diValues),
          vn: computeDistStats(vnValues),
        },
        quant: {
          lq: computeDistStats(quantLqValues),
          di: computeDistStats(quantDiValues),
        },
        pattern: {
          lq: computeDistStats(patternLqValues),
          di: computeDistStats(patternDiValues),
        },
      };

      this.scanDiagnosticsHistory.push(scanDiag);
      // Prune history older than 24h
      const diagCutoff = Date.now() - DIAGNOSTICS_ROLLING_WINDOW_MS;
      this.scanDiagnosticsHistory = this.scanDiagnosticsHistory.filter(
        d => new Date(d.timestamp).getTime() > diagCutoff
      );
      console.log(`[19H][DIAG] Scan diagnostics stored: quant=${scanDiag.quant.survivors} pattern=${scanDiag.pattern.survivors} → ${scanDiag.destination}(${scanDiag.destinationCount})`);

      // Batch 44: Persist diagnostics to disk (survives PM2 restarts)
      this.persistDiagnostics();

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
        familyQualifiedSurvivors: familyQualifiedUnion.length,
        familyRejectedCount,
        eligibleCount,
        idealCount,
        rotationalCount,
        avgDailyRange: classifiedSurvivors.length > 0 
          ? classifiedSurvivors.reduce((a, s) => a + (s.dailyRange || 0), 0) / classifiedSurvivors.length 
          : 0,
        isEngineActive,
        volumeStats
      }).catch(() => {});
      
      // Batch 43: VTS quant survivors = family-qualified union (replaces global quant IMF gate)
      const vtsQuantSurvivors = familyQualifiedUnion.map(s => ({
        ...s,
        filterTier: 'standard' as 'standard' | 'relaxed'
      }));

      // Batch 19G VN HF2: Merge pattern-only IMF survivors into VTS batch
      // Pattern-only pairs passed pattern global + pattern IMF but NOT quant global.
      const vtsQuantSymbolSet = new Set(vtsQuantSurvivors.map(s => s.symbol));
      const patternOnlyImfSurvivors = patternPoolSurvivors
        .filter(s => {
          const sym = normalizeToInternalSymbol(s.symbol);
          return !vtsQuantSymbolSet.has(sym) && !vtsQuantSymbolSet.has(s.symbol);
        })
        .map(s => ({
          ...s,
          symbol: normalizeToInternalSymbol(s.symbol),
          filterTier: 'standard' as 'standard' | 'relaxed',
        }));

      if (patternOnlyImfSurvivors.length > 0) {
        console.log(`[19G_VN_HF2][VTS] Merging ${patternOnlyImfSurvivors.length} pattern-only IMF survivors into VTS batch (passed pattern global+IMF, failed quant global)`);
      }

      // Combined VTS survivors: quant path + pattern-only path
      const vtsFilteredSurvivors = [...vtsQuantSurvivors, ...patternOnlyImfSurvivors];

      // Batch 43: Tag sourcePool — quant symbols = family-qualified union
      const quantSymbols = new Set(familyQualifiedUnion.map(s => s.symbol));
      const patternSymbolSet = new Set(patternPoolSurvivors.map(s => s.symbol));

      // Batch 19F: VTS Sim-to-Live Parity — duplicate pairs that pass BOTH filters
      // A pair in both quant and pattern pools appears TWICE (once per sourcePool)
      // This matches active trading path behavior where the same pair can be in both pools
      const taggedVtsSurvivors: Array<typeof vtsFilteredSurvivors[0] & { sourcePool: string }> = [];
      const bothPoolsCount = { count: 0 };

      // Batch 37: Family-qualified sourcePool tagging
      // Build reverse lookup: symbol -> set of families it survived
      const symbolFamilyMap = new Map<string, Set<string>>();
      for (const [family, survivors] of Object.entries(familyPoolSurvivors)) {
        for (const sv of survivors) {
          if (!symbolFamilyMap.has(sv.symbol)) symbolFamilyMap.set(sv.symbol, new Set());
          symbolFamilyMap.get(sv.symbol)!.add(family);
        }
      }

      for (const s of vtsFilteredSurvivors) {
        const inQuant = quantSymbols.has(s.symbol);
        const inPattern = patternSymbolSet.has(s.symbol);

        if (inQuant) {
          // Create one entry per family the pair survived through
          const families = symbolFamilyMap.get(s.symbol);
          if (families && families.size > 0) {
            for (const family of families) {
              taggedVtsSurvivors.push({ ...s, sourcePool: `quant-${family}` });
            }
          } else {
            // Pair passed quant global+IMF but no family paths -- log error, skip
            console.error(`[37][FX5] ${s.symbol} passed quant filters but has no family path -- CONFIG_MISSING`);
          }
        }
        if (inPattern) {
          taggedVtsSurvivors.push({ ...s, sourcePool: 'pattern' });
          if (inQuant) bothPoolsCount.count++;
        }
        if (!inQuant && !inPattern) {
          // Fallback: pairs that passed VTS-relaxed but neither strict quant nor pattern
          // Assign to all available families from their family path evaluation
          const families = symbolFamilyMap.get(s.symbol);
          if (families && families.size > 0) {
            for (const family of families) {
              taggedVtsSurvivors.push({ ...s, sourcePool: `quant-${family}` });
            }
          } else {
            console.error(`[37][FX5] ${s.symbol} fallback pair has no family -- CONFIG_MISSING, skipping`);
          }
        }
      }

      if (bothPoolsCount.count > 0) {
        console.log(`[19F][VTS_PARITY] ${bothPoolsCount.count} pairs duplicated in both quant+pattern pools for VTS parity`);
      }
      scanDiag.destinationCount = taggedVtsSurvivors.length;

      // Directive 11.4C.1: FX5 does NOT write to telemetry (M70)
      // VTS is the sole source of telemetry writes - FX5 outputs raw data only
      // VTS gets pairs directly from FX5's current scan batch via getCurrentScanBatch()
      this.updateCurrentBatch(mode, taggedVtsSurvivors);
      
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
      
      // Directive 11.4H.3: Log spread audit for first 5 survivors to verify variance
      if (cycleNumber <= 3 && classifiedSurvivors.length > 0) {
        const sampleSurvivors = classifiedSurvivors.slice(0, 5);
        console.log(`[11.4H.3][SpreadAudit][${mode}] Spread sample from ${eligibleCount} survivors:`);
        for (const surv of sampleSurvivors) {
          const cachedMetrics = getCostMetrics(surv.symbol);
          const spread = cachedMetrics?.spread ?? 0.001;
          console.log(`  ${surv.symbol}: spread=${(spread * 100).toFixed(4)}%`);
        }
      }

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

  /**
   * Directive 11.4C.1: Get current scan batch for VTS consumption
   * Returns raw pair data without telemetry scores
   * VTS uses this directly instead of querying telemetry
   */
  getCurrentScanBatch(mode: 'paper' | 'live' = 'paper'): ScanBatchPair[] {
    return this.currentBatch.get(mode) || [];
  }

  /**
   * Directive 11.4C.1: Update current batch after scan
   * Called internally after each scan cycle
   */
  private updateCurrentBatch(mode: 'paper' | 'live', survivors: Array<{
    symbol: string;
    poolType?: 'ideal' | 'rotational';
    currentPrice: number;
    volume24h: number;
    dailyRange: number;
    spread?: number;
    liquidity?: number;
    volatility?: number;
    isBenchmark?: boolean;
    LQ?: number;          // HF9: Log-Liquidity score
    VolNoise?: number;    // HF9: VolNoise score
    filterTier?: 'standard' | 'relaxed';  // HF9: IMF filter tier
    sourcePool?: 'quant' | 'pattern';     // Batch 19F: Filter path source
  }>): void {
    const batch: ScanBatchPair[] = survivors.map(s => ({
      symbol: s.symbol,
      pool: s.poolType || 'ideal',
      price: s.currentPrice,
      volume24h: s.volume24h,
      dailyRange: s.dailyRange,
      spread: s.spread,
      liquidity: s.liquidity,
      volatility: s.volatility,
      isBenchmark: s.isBenchmark, // Directive 11.6F: Propagate benchmark flag for VTS filtering
      lqScore: s.LQ,             // HF9: Propagate LQ for IMF diagnostics
      volNoiseScore: s.VolNoise,  // HF9: Propagate VN for IMF diagnostics
      filterTier: s.filterTier,   // HF9: Propagate filter tier for ML segmentation
      sourcePool: s.sourcePool,   // Batch 19F: Propagate filter path source
    }));
    this.currentBatch.set(mode, batch);
    const benchmarkCount = batch.filter(b => b.isBenchmark).length;
    const relaxedCount = batch.filter(b => b.filterTier === 'relaxed').length;
    const patternPoolCount = batch.filter(b => b.sourcePool === 'pattern').length;
    console.log(`[FX5][19F] Updated batch for ${mode}: ${batch.length} pairs (${benchmarkCount} benchmarks, ${relaxedCount} relaxed-filter, ${patternPoolCount} pattern-path, raw data only)`);
  }
}

// Singleton instance
export const fx5Scanner = new Fx5ScannerService();
