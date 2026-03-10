import { KrakenService } from './kraken';
import { storage } from '../storage';
import { activeFilterPool } from './active-filter-pool.js';
import { getAdaptiveScanManager, type AdaptiveScanBatch } from './adaptive-scan-manager.js';
import { SCANNER_PARAMS } from '../config/system-guards.js';
import { setCostMetrics } from '../core/cache/cost-cache.js';

// ============================================================================
// REB 2.10: Passive Learning Deep Tests - Types & Buffer
// ============================================================================

// REB 2.10: Global cycle counter for diagnostic logging
if (!(globalThis as any).__reb210_cycle) (globalThis as any).__reb210_cycle = 0;

// REB 2.10: History check counter for rate-limited logging
let reb210HistoryCheckCount = 0;
const REB_2_10_HISTORY_LOG_LIMIT = 50;

// REB 2.10: Per-pair snapshot counter (limit to prevent log spam)
let reb210PairSnapshotCount = 0;
const REB_2_10_PAIR_LOG_LIMIT = 100; // Log first 100 pair snapshots per server lifetime

// REB 2.10: CycleStart Snapshot Type
// Directive 10.9E: Removed deprecated rsiMin, rsiMax, volatilityMin, volatilityMax
export interface REB210CycleStartSnapshot {
  cycle: number;
  mode: 'paper' | 'live';
  timestamp: string;
  filters: {
    minVolume: number;
    minLiquidity: number;
    minPrice: number;
    maxPrice: number;
    maxBidAskSpread: number;
    universeSize: number;
    activeTimeframes: string[];
    minHistoryDays: number;
    excludeStablecoins: boolean;
    allowRegulatedOnly: boolean;
  };
}

// REB 2.10: Per-Pair Evaluation Snapshot Type
// Directive 10.9E: Removed deprecated failedRSI, failedVolatility, failedRange (no longer used in filtering)
export interface REB210PairSnapshot {
  cycle: number;
  mode: string;
  pair: string;
  timestamp: string;
  marketData: {
    price: number;
    spreadPct: number;
    volume: number;
    liquidity: number;
    historyDays: number | null;
    quoteCurrency: string;
  };
  filterResults: {
    failedVolume: boolean;
    failedLiquidity: boolean;
    failedPrice: boolean;
    failedSpread: boolean;
    failedStablecoin: boolean;
    failedHistory: boolean;
    passed: boolean;
  };
}

// REB 2.10: CycleSummary Snapshot Type
// Directive 10.9E: Removed deprecated failedRSI, failedVolatility, failedRange
export interface REB210CycleSummarySnapshot {
  cycle: number;
  mode: string;
  timestamp: string;
  totals: {
    evaluated: number;
    survived: number;
  };
  breakdown: {
    failedVolume: number;
    failedLiquidity: number;
    failedPrice: number;
    failedSpread: number;
    failedStablecoin: number;
    failedHistory: number;
    passed: number;
  };
  activePoolSize: number;
}

// REB 2.10: Complete Cycle Record for Buffer
export interface REB210CycleRecord {
  cycleStart: REB210CycleStartSnapshot;
  pairs: REB210PairSnapshot[];
  cycleSummary: REB210CycleSummarySnapshot;
}

// REB 2.10: In-memory Passive Learning Diagnostic Buffer (last 20 cycles)
const REB_2_10_BUFFER_SIZE = 20;
const passiveLearningBuffer: REB210CycleRecord[] = [];

// REB 2.10: Expose buffer getter for API endpoint
export function getPassiveLearningBuffer(): REB210CycleRecord[] {
  return [...passiveLearningBuffer];
}

// REB 2.10: Add a cycle record to buffer (maintains FIFO of last 20)
function addCycleToBuffer(record: REB210CycleRecord): void {
  passiveLearningBuffer.push(record);
  if (passiveLearningBuffer.length > REB_2_10_BUFFER_SIZE) {
    passiveLearningBuffer.shift();
  }
  console.log(`[REB2.10][LearningBuffer] Cycle ${record.cycleStart.cycle} stored (buffer size: ${passiveLearningBuffer.length}/${REB_2_10_BUFFER_SIZE})`);
}

// REB 2.10: History filter context type
type HistoryFilterContext = {
  minHistoryDays?: number | null;
  mode: 'paper' | 'live' | 'backtest';
  krakenService: KrakenService;
};

// ============================================================================
// REB 2.11: Final Backend Wiring & Active Pool Stability Validation
// ============================================================================

// REB 2.11: Cycle counter per mode for stress testing oscillation
if (!(globalThis as any).__reb211_stressCycleCount) (globalThis as any).__reb211_stressCycleCount = { paper: 0, live: 0 };

// REB 2.11 A1: Drift Snapshot Type (20-cycle rolling window)
// Directive 10.9E: Removed range from failures (deprecated volatility filter)
export interface REB211DriftSnapshot {
  cycle: number;
  mode: 'paper' | 'live';
  timestamp: string; // ISO string for consistency
  activePoolSize: number;
  survivors: string[];
  failures: {
    price: number;
    volume: number;
    spread: number;
    stablecoin: number;
    history: number;
  };
}

// REB 2.11 A2: Pool Integrity Snapshot
export interface REB211IntegritySnapshot {
  cycle: number;
  mode: 'paper' | 'live';
  timestamp: string;
  activePoolSize: number;
  uniquePairs: boolean;
  expiredRemoved: boolean;
  anomalies: string[];
}

// REB 2.11 A3: Timing Snapshot
export interface REB211TimingSnapshot {
  cycle: number;
  mode: 'paper' | 'live';
  timestamp: string;
  t_fetch: number;
  t_syncFilters: number;
  t_historyFilter: number;
  t_universeLimit: number;
  t_total: number;
}

// REB 2.11 A4: Mismatch Entry
export interface REB211MismatchEntry {
  cycle: number;
  mode: 'paper' | 'live';
  timestamp: string;
  pair: string;
  reason: string;
}

// REB 2.11 B5: Stress Snapshot
export interface REB211StressSnapshot {
  cycle: number;
  mode: 'paper' | 'live';
  timestamp: string;
  injectedDuplicates: number;
  ttlCompressionActive: boolean;
  latencyInjected: boolean;
  universeShift: number | null;
  activePoolBefore: number;
  activePoolAfter: number;
}

// REB 2.11: In-memory diagnostic buffers
const REB_2_11_BUFFER_SIZE = 20;
const driftBuffer: REB211DriftSnapshot[] = [];
const integrityBuffer: REB211IntegritySnapshot[] = [];
const timingBuffer: REB211TimingSnapshot[] = [];
const mismatchBuffer: REB211MismatchEntry[] = [];
const stressBuffer: REB211StressSnapshot[] = [];

// REB 2.11: Getter functions for API endpoint
export function getREB211DriftBuffer(): REB211DriftSnapshot[] {
  return [...driftBuffer];
}

export function getREB211IntegrityBuffer(): REB211IntegritySnapshot[] {
  return [...integrityBuffer];
}

export function getREB211TimingBuffer(): REB211TimingSnapshot[] {
  return [...timingBuffer];
}

export function getREB211MismatchBuffer(): REB211MismatchEntry[] {
  return [...mismatchBuffer];
}

export function getREB211StressBuffer(): REB211StressSnapshot[] {
  return [...stressBuffer];
}

// REB 2.11: Buffer helpers (FIFO, maintains last 20 entries)
function addToDriftBuffer(snapshot: REB211DriftSnapshot): void {
  driftBuffer.push(snapshot);
  if (driftBuffer.length > REB_2_11_BUFFER_SIZE) driftBuffer.shift();
}

function addToIntegrityBuffer(snapshot: REB211IntegritySnapshot): void {
  integrityBuffer.push(snapshot);
  if (integrityBuffer.length > REB_2_11_BUFFER_SIZE) integrityBuffer.shift();
}

function addToTimingBuffer(snapshot: REB211TimingSnapshot): void {
  timingBuffer.push(snapshot);
  if (timingBuffer.length > REB_2_11_BUFFER_SIZE) timingBuffer.shift();
}

function addToMismatchBuffer(entry: REB211MismatchEntry): void {
  mismatchBuffer.push(entry);
  if (mismatchBuffer.length > REB_2_11_BUFFER_SIZE * 5) mismatchBuffer.shift(); // Allow 100 mismatches
}

function addToStressBuffer(snapshot: REB211StressSnapshot): void {
  stressBuffer.push(snapshot);
  if (stressBuffer.length > REB_2_11_BUFFER_SIZE) stressBuffer.shift();
}

// ============================================================================
// REB 2.11A: Active Pool / AlreadyActive Breakdown Audit
// ============================================================================

// REB 2.11A - ActiveAuditEntry interface
interface ActiveAuditEntry {
  cycle: number;
  mode: 'paper' | 'live';
  timestamp: string;

  survivors: string[];
  activeBeforeCleanup: string[];
  activeAfterCleanup: string[];

  alreadyActiveReported: string[];
  alreadyActiveShouldBe: string[];
  mismatches: {
    missedPairs: string[];  // should be counted but weren't
    overcountedPairs: string[]; // counted but not actually active
  };
}

// REB 2.11A: Audit buffer (last 20 cycles)
const activeAuditBuffer: ActiveAuditEntry[] = [];

export function getActiveAuditBuffer(limit = 20): ActiveAuditEntry[] {
  return activeAuditBuffer.slice(-limit);
}

function addToActiveAuditBuffer(entry: ActiveAuditEntry): void {
  activeAuditBuffer.push(entry);
  if (activeAuditBuffer.length > 20) {
    activeAuditBuffer.shift();
  }
}

// ============================================================================
// REB 2.11B: Symbol Mapping Trace Diagnostic
// ============================================================================

export interface SymbolTraceEntry {
  cycle: number;
  mode: 'paper' | 'live';

  pair: string;                      // Raw survivor pair string (e.g., "FWOG/USD")
  normalizedPair: string;            // String after scanner normalization
  activePoolEntry: string | null;    // Exact string stored in active-filter-pool, if any
  krakenSymbol: string | null;       // Kraken API pair key (e.g., "XBTUSD") if available

  inActiveBefore: boolean;           // True if raw or normalized pair exists in activeBeforeCleanup
  inActiveAfter: boolean;            // True if raw or normalized pair exists in activeAfterCleanup
  wasCountedAlreadyActive: boolean;  // What scanner *reported*
  shouldBeAlreadyActive: boolean;    // What REB audit says SHOULD be active

  // REB 2.11C: Simplified mismatch types (removed FORMAT since normalization is not the issue)
  mismatchType: 'NONE' | 'MISSING' | 'EXTRA';
}

// REB 2.11B: Symbol trace buffer (400 entries ~= 20 cycles x survivors)
const reb211bSymbolTraceBuffer: SymbolTraceEntry[] = [];

export function getReb211bSymbolTraces(limit = 20): SymbolTraceEntry[] {
  return reb211bSymbolTraceBuffer.slice(-limit);
}

// REB 2.11: Stress test configuration
interface StressTestConfig {
  enabled: boolean;
  universeSizeOverrides: number[];
  ttlCompressionMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
}

function getStressTestConfig(): StressTestConfig {
  const enabled = process.env.REB_2_11_STRESS === '1';
  return {
    enabled,
    universeSizeOverrides: [20, 60, 40, 100, -1], // -1 = restore user value
    ttlCompressionMs: 60 * 1000, // 1 minute TTL during stress
    minLatencyMs: 10,
    maxLatencyMs: 40,
  };
}

// REB 2.11 B1: Randomized artificial latency (10-40ms)
async function injectArtificialLatency(config: StressTestConfig): Promise<void> {
  if (!config.enabled) return;
  const delay = config.minLatencyMs + Math.random() * (config.maxLatencyMs - config.minLatencyMs);
  await new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * REB 2.10: Check if a pair passes the minimum history filter
 * Uses Kraken daily OHLC candles to determine trading age
 */
async function passesHistoryFilter(
  pair: string,
  ctx: HistoryFilterContext
): Promise<{ passed: boolean; reason?: 'failedHistory'; days?: number | null }> {
  const { minHistoryDays, mode, krakenService } = ctx;

  if (!minHistoryDays || minHistoryDays <= 0) {
    return { passed: true, days: null };
  }

  const days = await krakenService.getPairHistoryDays(pair, mode);

  // REB 2.10: If we cannot determine history (null), be conservative & fail
  const passed = typeof days === 'number' && days >= minHistoryDays;

  // REB 2.10: History check diagnostics (rate-limited)
  if (reb210HistoryCheckCount < REB_2_10_HISTORY_LOG_LIMIT) {
    reb210HistoryCheckCount++;
    console.log('[REB2.10][HistoryCheck]', {
      pair,
      mode,
      days,
      threshold: minHistoryDays,
      result: passed ? 'PASS' : 'FAIL',
    });
  }

  if (!passed) {
    return { passed: false, reason: 'failedHistory', days };
  }

  return { passed: true, days };
}


/**
 * REB 2.1 — FX5 Scanner Restoration (Phase 8.6.7 Truth State)
 * 
 * Batch-First → FX5 Filter Architecture
 * Restored from: docs/restoration/truth/phase_8.6.7_validation_1763829797709.md
 */

// Directive 11.4C.1: Legacy rotation state REMOVED
// Legacy Top-N/Tier-B rotation replaced by AdaptiveScanManager with Ideal/Rotational pools

// Directive 11.4C.1: BatchResult interface with Ideal/Rotational pool terminology
export interface BatchResult {
  survivors: Array<{
    symbol: string;
    currentPrice: number;
    volume24h: number;
    dailyRange: number;
    fromTopN: boolean; // Legacy field - mapped from poolType for backward compatibility
    poolType: 'ideal' | 'rotational'; // Directive 11.4C.1: Pool source tracking
    priceHistory?: number[];
    history?: number[];
    trades24h?: number;
    tradeCount?: number;
    spread?: number;
    bidAskSpread?: number;
  }>;
  evaluatedSymbols: string[];
  breakdown: {
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
  metrics: {
    evaluatedCount: number;
    eligibleCount: number;
    ineligibleCount: number;
    idealCount: number; // Directive 11.4C.1: Ideal pool survivors
    rotationalCount: number; // Directive 11.4C.1: Rotational pool survivors
    krakenUniverseSize: number;
  };
}


/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.4C.1 — Adaptive Batch Scanner (Replaces collectMixedBatch)
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * New Architecture:
 * - 100 pairs per scan cycle (vs legacy 60)
 * - 60% Ideal Pool (telemetry top performers)
 * - 40% Rotational Pool (exploration candidates)
 * - Telemetry-driven selection with AdaptiveRatioManager
 * - PairFailureTracker with cooldown blacklist
 * 
 * Invariants:
 * M27: AdaptiveScanManager = sole batch generator
 * M29: BatchSize = 100; Ideal:Rotational = 60:40
 * M31: AdaptiveScan runtime ≤ 30s per cycle
 * ══════════════════════════════════════════════════════════════════════════════
 */
export async function collectAdaptiveBatch(
  krakenService: KrakenService,
  filters: any,
  mode: 'paper' | 'live',
  options?: { passiveLearning?: boolean } // Directive 11.4H.4 Task 5: Optional passive learning flag
): Promise<BatchResult> {
  const startTime = Date.now();
  const cycleId = `adaptive_${mode}_${Date.now()}`;
  const isPassiveLearning = options?.passiveLearning ?? false;
  
  console.log(`[AdaptiveScan][11.4C.1] Starting adaptive batch scan (mode=${mode}, passiveLearning=${isPassiveLearning}, cycleId=${cycleId})`);
  
  // Parse filter values
  const parsedFilters = {
    minVolume: parseFloat(filters.minVolume ?? '1000000.00'),
    minLiquidity: parseFloat(filters.minLiquidity ?? '500000.00'),
    minPrice: parseFloat(filters.minPrice ?? '0.01000000'),
    maxPrice: parseFloat(filters.maxPrice ?? '100000.00'),
    maxBidAskSpread: parseFloat(filters.maxBidAskSpread ?? '1.00'),
    universeSize: filters.universeSize ?? 100,
    activeTimeframes: filters.activeTimeframes ?? ['5m', '15m', '1h'],
    minHistoryDays: filters.minHistoryDays ?? 30,
    excludeStablecoins: filters.excludeStablecoins ?? true,
    allowRegulatedOnly: filters.allowRegulatedOnly ?? false,
  };
  
  // STEP 1: Fetch ALL Kraken tickers for universe
  const [tickers, pairsObj] = await Promise.all([
    krakenService.getTicker(),
    krakenService.getTradablePairs()
  ]);
  
  const allPairs = Object.entries(tickers).map(([pairName, ticker]) => ({
    pairName,
    symbol: pairsObj[pairName]?.wsname || pairName,
    volume24h: parseFloat((ticker as any).v[1]),
    ticker,
    pairInfo: pairsObj[pairName],
  })).filter(p => p.pairInfo);
  
  const krakenUniverseSize = allPairs.length;
  console.log(`[AdaptiveScan][11.4C.1] Kraken universe: ${krakenUniverseSize} pairs`);
  
  // STEP 2: Get adaptive batch from AdaptiveScanManager
  const adaptiveScanManager = getAdaptiveScanManager();
  const allSymbols = allPairs.map(p => p.symbol);
  const adaptiveBatch: AdaptiveScanBatch = await adaptiveScanManager.getNextScanBatch(allSymbols);
  
  console.log(`[AdaptiveScan][11.4C.1] Batch selected: Ideal=${adaptiveBatch.idealPairs.length}, Rotational=${adaptiveBatch.rotationalPairs.length}, Excluded=${adaptiveBatch.excludedPairs.length}`);
  
  // Create lookup maps for pool type tracking
  const idealSet = new Set(adaptiveBatch.idealPairs);
  const rotationalSet = new Set(adaptiveBatch.rotationalPairs);
  
  // STEP 3: Build batch with pool type tracking
  let batch = adaptiveBatch.totalBatch.map(symbol => {
    const pair = allPairs.find(p => p.symbol === symbol);
    return {
      ...pair!,
      poolType: idealSet.has(symbol) ? 'ideal' as const : 'rotational' as const,
    };
  }).filter(p => p.pairInfo);
  
  // Directive 11.4C-R2: Guarantee BATCH_SIZE-pair batch by refilling from Kraken universe
  const targetBatchSize = SCANNER_PARAMS.BATCH_SIZE;
  if (batch.length < targetBatchSize) {
    const usedSymbols = new Set(batch.map(p => p.symbol));
    const fillCandidates = allPairs
      .filter(p => !usedSymbols.has(p.symbol) && p.pairInfo)
      .sort((a, b) => b.volume24h - a.volume24h)
      .slice(0, targetBatchSize - batch.length);
    
    const fillPairs = fillCandidates.map(p => ({
      ...p,
      poolType: 'rotational' as const,
    }));
    
    batch = [...batch, ...fillPairs];
    console.log(`[11.4C-R2][AdaptiveScan] Refilled batch: +${fillPairs.length} pairs from Kraken (total=${batch.length})`);
  }
  
  const evaluatedSymbols = batch.map(p => p.symbol);
  
  // STEP 4: Apply FX5 filters to the adaptive batch
  const activeTrades = await storage.getActiveTrades(mode);
  const activeTradeSymbols = new Set(activeTrades.map(t => t.symbol));
  const poolSymbols = new Set(activeFilterPool.getSymbolsRaw(mode));
  
  const breakdown = {
    failed_min_volume: 0,
    failed_spread: 0,
    failed_daily_range: 0, // Deprecated (11.4C.1) but kept for backward compatibility
    failed_min_price: 0,
    failed_stablecoin: 0,
    failed_quote_currency: 0, // Deprecated (11.4C.1) but kept for backward compatibility
    failed_history: 0,
    failed_market_cap: 0,
    failed_guardrail_risk: 0,
    failed_correlation: 0,
    already_active: 0,
    passed_all_filters: 0,
  };
  
  const minVolume = parsedFilters.minVolume;
  const minPrice = parsedFilters.minPrice;
  const maxBidAskSpread = parsedFilters.maxBidAskSpread;
  const excludeStablecoins = parsedFilters.excludeStablecoins;
  // Directive 11.4H.4 Task 3: Strict stablecoin regex for Base/Quote matching
  const isStablePairRegex = /^(USDT|USDC|DAI|PYUSD|USDE)\/(USD|EUR|USDT|USDC|DAI)$/i;
  const minHistoryDays = parsedFilters.minHistoryDays;
  
  // Directive 11.4H.4 Task 5: Benchmark symbols for passive mode filter exemption
  // These pairs bypass ALL filters for correlation tracking in passive learning
  const BENCHMARK_SYMBOLS = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'XBT/USD', 'BTC/EUR', 'ETH/EUR'];
  const benchmarkSet = new Set(BENCHMARK_SYMBOLS.map(s => s.toUpperCase()));
  
  const historyFilterCtx: HistoryFilterContext = {
    minHistoryDays,
    mode,
    krakenService,
  };
  
  const survivors: BatchResult['survivors'] = [];
  let idealSurvivors = 0;
  let rotationalSurvivors = 0;
  let benchmarkExemptCount = 0;
  
  for (const pair of batch) {
    // Directive 11.4H.4 Task 5: Check if this is a benchmark pair
    const isBenchmarkPair = benchmarkSet.has(pair.symbol.toUpperCase());
    const ticker = pair.ticker as any;
    const pairInfo = pair.pairInfo;
    const baseCurrency = pairInfo.base;
    const currentPrice = parseFloat(ticker.c[0]);
    const volume24h = parseFloat(ticker.v[1]);
    const high24h = parseFloat(ticker.h[1]);
    const low24h = parseFloat(ticker.l[1]);
    const dailyRange = low24h > 0 ? ((high24h - low24h) / low24h) * 100 : 0;
    const askPrice = parseFloat(ticker.a[0]);
    const bidPrice = parseFloat(ticker.b[0]);
    const bidAskSpread = bidPrice > 0 ? ((askPrice - bidPrice) / bidPrice) * 100 : 0;
    
    // Directive 11.4H.4 Task 1: Populate cost cache for ALL evaluated pairs (not just survivors)
    // This eliminates the "50 Moderate Liquidity" artifact caused by cache-miss defaults
    setCostMetrics(pair.symbol, { spread: bidAskSpread / 100 }); // Convert percentage to decimal
    
    let rejected = false;
    
    // Directive 11.4H.4 Task 5: Benchmark pairs bypass ALL filters ONLY in passive learning mode
    // This ensures BTC/ETH/SOL are always included in passive learning for correlation tracking
    // In live/paper mode, all pairs (including benchmarks) must pass filters normally
    if (isPassiveLearning && isBenchmarkPair) {
      benchmarkExemptCount++;
      // Skip all filters - benchmark pairs are always included in passive mode
      // Still check if already active to avoid duplicates
      if (poolSymbols.has(pair.symbol) || activeTradeSymbols.has(pair.symbol)) {
        breakdown.already_active++;
        continue;
      }
      // Fall through to survivor recording without rejection
    } else {
      // Non-benchmark pairs: Apply all filters normally
      
      // Already active check
      if (poolSymbols.has(pair.symbol) || activeTradeSymbols.has(pair.symbol)) {
        breakdown.already_active++;
        continue;
      }
      
      // Filter: Stablecoins - Directive 11.4H.4 Task 3: Strict Base/Quote regex
      // Only true stablecoin pairs like USDT/USD are excluded, not FARTCOIN/USDC
      if (!rejected && excludeStablecoins && isStablePairRegex.test(pair.symbol)) {
        breakdown.failed_stablecoin++;
        rejected = true;
      }
      
      // Filter: Min volume
      if (!rejected && volume24h < minVolume) {
        breakdown.failed_min_volume++;
        rejected = true;
      }
      
      // Filter: Min price
      if (!rejected && currentPrice < minPrice) {
        breakdown.failed_min_price++;
        rejected = true;
      }
      
      // Filter: Bid-ask spread
      if (!rejected && bidAskSpread > maxBidAskSpread) {
        breakdown.failed_spread++;
        rejected = true;
      }
      
      // Filter: History (async)
      if (!rejected && minHistoryDays > 0) {
        const historyResult = await passesHistoryFilter(pair.symbol, historyFilterCtx);
        if (!historyResult.passed) {
          breakdown.failed_history++;
          rejected = true;
        }
      }
    }
    
    // Record result to AdaptiveScanManager for telemetry
    if (!rejected) {
      breakdown.passed_all_filters++;
      
      if (pair.poolType === 'ideal') {
        idealSurvivors++;
      } else {
        rotationalSurvivors++;
      }
      
      survivors.push({
        symbol: pair.symbol,
        currentPrice,
        volume24h,
        dailyRange,
        fromTopN: pair.poolType === 'ideal', // Backwards compatibility
        poolType: pair.poolType,
        // Directive 11.4H.3: Pass spread data through for friction calculation
        bidAskSpread,
      });
      
      // Directive 11.4C-R2: VTS is the single source of truth for telemetry
      // Record only pool membership (pass/fail), not default scores
      adaptiveScanManager.recordScanResult(pair.symbol, true, {
        pool: pair.poolType,
      });
    } else {
      // Record filter failure (no default scores)
      adaptiveScanManager.recordScanResult(pair.symbol, false, {
        failureReason: 'filter_failed',
        pool: pair.poolType,
      });
    }
  }
  
  const elapsedMs = Date.now() - startTime;
  console.log(`[AdaptiveScan][11.4C.1] Cycle complete in ${elapsedMs}ms: evaluated=${batch.length}, survivors=${survivors.length} (ideal=${idealSurvivors}, rotational=${rotationalSurvivors})`);
  
  // Directive 11.4H.4 Task 5: Log benchmark exemption diagnostics (passive mode only)
  if (benchmarkExemptCount > 0) {
    console.log(`[11.4H.4][BENCHMARK] ${benchmarkExemptCount} benchmark pairs bypassed filters in passive learning mode for correlation tracking`);
  } else if (isPassiveLearning) {
    console.log(`[11.4H.4][BENCHMARK] No benchmark pairs found in batch (passiveLearning=${isPassiveLearning})`);
  }
  
  // M31 Invariant: Check runtime
  if (elapsedMs > 30000) {
    console.warn(`[AdaptiveScan][M31] ⚠️ Cycle exceeded 30s limit: ${elapsedMs}ms`);
  }
  
  const evaluatedCount = batch.length;
  const eligibleCount = breakdown.passed_all_filters + breakdown.already_active;
  const ineligibleCount = 
    breakdown.failed_min_volume +
    breakdown.failed_spread +
    breakdown.failed_min_price +
    breakdown.failed_stablecoin +
    breakdown.failed_history +
    breakdown.failed_market_cap +
    breakdown.failed_guardrail_risk;
  
  return {
    survivors,
    evaluatedSymbols,
    breakdown,
    metrics: {
      evaluatedCount,
      eligibleCount,
      ineligibleCount,
      idealCount: idealSurvivors,
      rotationalCount: rotationalSurvivors,
      krakenUniverseSize,
    },
  };
}
