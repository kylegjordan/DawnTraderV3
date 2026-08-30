import { KrakenService } from '../exchanges/kraken/kraken.js';
import { storage } from '../storage';
import { activeFilterPool } from './active-filter-pool.js';
import { recordSyncSpan, recordSyncSpanMs, syncSpanStart } from './scan-stall-instrument.js';
import { ScanYielder } from './scan-yield.js';
import { getAdaptiveScanManager, type AdaptiveScanBatch } from './adaptive-scan-manager.js';
import { SCANNER_PARAMS } from '../config/system-guards.js';
import { setCostMetrics } from '../core/cache/cost-cache.js';
// B63.3: OHLC + DBS pre-compute imports (for pre-global DBS routing)
import { ohlcCache } from './ohlc-cache.js';
import { computeDirectionalBias } from '../core/metrics/directional-bias.js';
import type { OHLCData } from '../types/market-regime.types.js';
// P19-B5a: active-path pre_filter reject capture (gated on !isPassiveLearning).
import { capturePreFilterReject } from './data-archive/signal-eval-archiver.js';
import { toCanonical } from './utils/symbol-canonicalizer.js';
import { tradingModeToRunMode } from './run-mode-controller.js';

// B63.3: Local ATR helper (mirrors fx5-scanner.ts computeATRFromOHLC — 14-period Wilder)
function computeATR14(ohlcData: OHLCData[]): number {
  if (ohlcData.length < 15) return 0;
  const recent = ohlcData.slice(-15);
  let trSum = 0;
  for (let i = 1; i < recent.length; i++) {
    const hl = recent[i].high - recent[i].low;
    const hc = Math.abs(recent[i].high - recent[i-1].close);
    const lc = Math.abs(recent[i].low - recent[i-1].close);
    trSum += Math.max(hl, hc, lc);
  }
  return trSum / 14;
}

const B63_STRONG_DBS_THRESHOLD = 0.35; // LONG-only, positive DBS

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
    // B63.3: DBS computed pre-global in collectAdaptiveBatch (hard-contract propagation)
    dbsScore?: number;
    dbsCategory?: string;
    dbsSlope?: number;
    atr?: number;
    routedViaStrongTrend?: boolean;  // True if pair passed globals via strong_trend config
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
    // B63.4: Pre-global DBS diagnostics (exposes the drop-off at each stage)
    preGlobalDbsComputed?: number;     // Pairs with OHLC available for DBS compute
    preGlobalStrongDbs?: number;       // Pairs with DBS >= 0.35 positive BEFORE global filters
    preGlobalStrongDbsSymbols?: string[]; // Which symbols those were
  };
  // Batch 19F: Pattern global filter survivors (dual-path)
  patternSurvivors?: Array<{
    symbol: string;
    currentPrice: number;
    volume24h: number;
    dailyRange: number;
    poolType: 'ideal' | 'rotational';
    bidAskSpread?: number;
  }>;
  // Batch 19H: Pattern global filter per-filter rejection counts
  patternBreakdown?: {
    failed_stablecoin: number;
    failed_min_price: number;
    failed_max_price: number;
    failed_min_volume: number;
    failed_spread: number;
    failed_history: number;
    passed_all_filters: number;
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
  options?: {
    passiveLearning?: boolean; // Directive 11.4H.4 Task 5: Optional passive learning flag
    patternFilters?: {         // Batch 19F: Pattern global filter thresholds for dual-path
      MIN_VOLUME_USD: number;
      MAX_BID_ASK_SPREAD: number;
      MIN_HISTORY_DAYS: number;
      // Batch 19G HF2: All remaining DB fields for pattern-specific filtering
      MIN_PRICE?: number;
      MAX_PRICE?: number;
      EXCLUDE_STABLECOINS?: boolean;
      MIN_LIQUIDITY?: number;
      MIN_MARKET_CAP?: number;
    };
    // B63.3: Strong trend filter config — applied to pairs with |DBS|>=0.35 (positive, LONG).
    // When provided, collectAdaptiveBatch pre-fetches OHLC + computes DBS, and uses these
    // relaxed thresholds for strong-DBS pairs (bypassing standard global filter profile).
    strongTrendFilters?: {
      minVolume: number;
      minPrice: number;
      maxPrice: number;
      maxBidAskSpread: number;
      minHistoryDays: number;
      minLiquidity: number;
      minMarketCap: number;
    };
  }
): Promise<BatchResult> {
  const startTime = Date.now();
  const cycleId = `adaptive_${mode}_${Date.now()}`;
  const isPassiveLearning = options?.passiveLearning ?? false;
  const patternFilters = options?.patternFilters ?? null;
  const strongTrendFilters = options?.strongTrendFilters ?? null;
  
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

  // P19-B6.7 (#396) OBJ-4: PURE telemetry (no behavior change) — when the Kraken universe
  // itself comes back short, the downstream refill (market-scanner ~:600) CANNOT rescue it
  // (it tops up FROM allPairs), so that cycle scans few pairs. Attribute the cause live:
  // was getTicker() short, was getTradablePairs() short, or did the pairInfo join drop rows?
  // The actual fix is homed P19-B6.9 (RUNNING_ISSUES #396); this only captures the evidence.
  if (krakenUniverseSize < SCANNER_PARAMS.BATCH_SIZE) {
    const tickerCount = Object.keys(tickers).length;
    const pairsCount = Object.keys(pairsObj).length;
    const joinDrops = tickerCount - krakenUniverseSize; // ticker keys with no pairInfo match
    console.warn(
      `[AdaptiveScan][11.4C.1][#396] SHORT UNIVERSE ${krakenUniverseSize}/${SCANNER_PARAMS.BATCH_SIZE} — ` +
      `getTicker=${tickerCount} pairs, getTradablePairs=${pairsCount} pairs, pairInfo-join-drops=${joinDrops}. ` +
      `Cause: ${tickerCount < SCANNER_PARAMS.BATCH_SIZE ? 'getTicker SHORT' : pairsCount < tickerCount ? 'getTradablePairs SHORT (join drops)' : 'join-filter'}.`
    );
  }
  
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
  
  // ── B-SCANNER-EGRESS-NORMALISE (#906/#909) — NORMALISE ONCE, HERE, AND ONLY HERE.
  // `pair.symbol` is Kraken's own `wsname` (:563 `pairsObj[pairName]?.wsname`). Every egress
  // below then treated it as the INTERNAL symbol, which it is not for two bases.
  //
  // ⛔ WHY THIS IS NOT COSMETIC — MEASURED AGAINST THE LIVE VENUE (RUNNING_ISSUES:4571):
  //   XBT/USD -> 0 candles, `EQuery:Unknown asset pair`     <- the form WE were sending
  //   BTC/USD -> 721 candles, ok
  //   ETH/USD -> 721 candles, ok                            <- also a wsname; accepted
  // Kraken's OHLC endpoint REJECTS Kraken's own wsname for Bitcoin. That null is cached by
  // `getPairHistoryDays` (kraken.ts:648-653) and `passesHistoryFilter` fails CLOSED on null
  // (:380-381, "be conservative & fail") => a permanent, silent rejection. Universe-wide the
  // class is exactly TWO bases of 661: XBT and XDG (#909's sweep). Both were at ZERO trades.
  //
  // ⛔ WHY *HERE* AND NOWHERE ELSE — this is the ONE point where the batch is FINAL and
  // UNCONSUMED. Earlier is unsafe: the ticker/pairInfo join at :600 keys on the RAW wsname,
  // and the refill dedupe at :611 compares `usedSymbols` against `allPairs` in RAW form, so
  // normalising above either breaks the join or silently admits duplicates.
  // ⛔ AND THE HONEST ARGUMENT FOR *NOT* GOING LATER — my first version of this comment said
  //   "later would mean N call-site edits", WHICH IS FALSE and shipped as such for one commit.
  //   `server/exchanges/kraken/kraken.ts:296` hands the string to Kraken VERBATIM with no
  //   resolver (NOT the deprecated 5-line B78 shim at `server/services/kraken.ts`), so ONE edit
  //   would fix every caller of getOHLCData/getPairHistoryDays. The real reason to fix HERE is
  //   that a venue-boundary fix reaches ONLY the venue call: it would NOT repair the membership
  //   and archive legs above (`poolSymbols`, the stablecoin regex, `benchmarkSet`,
  //   `capturePreFilterReject`, `evaluatedSymbols`), which never reach that call.
  //
  // ⛔⛔ WHAT THIS FIXES IS BITCOIN IN THE ACTIVE LANE **AND DOGECOIN IN THE VTS LANE** — and
  //   my "it does nothing for Dogecoin" was measured with an instrument that CANNOT SEE VTS.
  //   Every `capturePreFilterReject` call is gated `!isPassiveLearning` (`:900`, `:907`, `:914`,
  //   `:1055`+), so `signal_eval_archive` is ACTIVE-LANE ONLY. Live `screener_filters`: the
  //   seven `vts_*` crypto profiles carry `min_price` 0.05, so Dogecoin at 0.0851 CLEARS the
  //   VTS floor, reaches `passesHistoryFilter` at `:922` under the wsname, and fails closed —
  //   venue-probed: `XDG/USD` -> EQuery, `DOGE/USD` -> 721 (controls `ADA/USD` -> 721,
  //   `XBT/USD` -> EQuery, `BTC/USD` -> 721). CORROBORATED: the VTS closed corpus
  //   `logs/virtual_trades` holds ONE doge/xdg occurrence across 151 daily files, against
  //   `ADA/` in 74 of 151. ⇒ Dogecoin is absent from the learning population, not present in
  //   it, and THIS LINE REPAIRS THAT.
  // ⛔ SEPARATELY, IN THE ACTIVE LANE ONLY, DOGECOIN IS EXCLUDED BY A WORKING PRICE FLOOR —
  //   measured 24h: `XBT/USD` has ZERO archive rows (it passes volume and price and
  //   dies at the history filter, whose branches carry no `capturePreFilterReject`, so the
  //   rejection is never archived), while `XDG/USD` has 545 rows carrying `low_price`,
  //   observed 0.0851 against a threshold of 0.25. The active path's min price is 0.25 on
  //   every profile but strong_trend (live `screener_filters`); VTS's is 0.05, so the ACTIVE
  //   floor is what excludes Dogecoin there — a separate, working gate, not this batch's bug.
  //   CONTROL: `ADA/USD` fails the identical gate at 0.2013. ⇒ Dogecoin is excluded BY A
  //   WORKING PRICE FLOOR, not by a symbol form. Whether 0.25 is the right floor is a
  //   DECISION, not a defect, and it is homed as its own item.
  //
  // ⛔ `toCanonical`, NOT `normalizeToInternalSymbol` — AND THE NAME THAT MOTIVATED IT.
  // The resolver's slashed branch (kraken-symbol-resolver.ts:94-99) short-circuits on a
  // ONE-ENTRY table {XBT:BTC} and never reads its own `mapByWsPair`, so it returns XDG/USD
  // unchanged. `toCanonical` (symbol-canonicalizer.ts:98-124) carries XBT->BTC AND XDG->DOGE.
  // That resolver is a 🔒 LOCKED MODULE and its consolidation is homed to Phase 20 (#229),
  // so it is not this batch's to edit.
  //
  // ⛔ BLAST RADIUS — 56 WSNAMES, NOT 26, AND MY FIRST VERSION OF THIS COMMENT WAS WRONG AT
  // THE LINE (Langston, Step 4). `toCanonical` applies ONE map to BOTH positions:
  //   `krakenToStandard[base] || base`  AND  `krakenToStandard[quote] || quote`  (:121-122)
  // The `// Base currencies` / `// Quote currencies` headings in that table are COMMENTS, not
  // structure — so XBT maps in the QUOTE slot too. Census of the live AssetPairs payload
  // (1,437 wsnames): 26 base-side + 31 quote-side, 1 overlap = 56 changed.
  // ⇒ THE 31 ARE THE BTC-QUOTED PAIRS, `AAVE/XBT … ZRX/XBT` — venue-probed: `ADA/XBT` -> 0
  //   candles / `EQuery`, `ADA/BTC` -> 721. After this line their venue calls RESOLVE.
  // ⛔ BUT THEY DO *NOT* BECOME TRADABLE, AND MY FIRST WORDING ("eligible for the survivor set
  //   FOR THE FIRST TIME") WAS THE SAME OVER-REACH TWICE CORRECTED ABOVE — a consequence
  //   asserted without checking the next gate. MEASURED, 24h, source='market-scanner',
  //   symbol LIKE '%/XBT': `low_volume` = 21,574 rows across 31 of 31 distinct symbols.
  //   Every one already REACHES the volume gate and fails it, on the venue-supplied 24h volume
  //   attached at the `:600` join — ABOVE this line, so nothing here moves that number.
  //   ⇒ correct claim FOR THE STANDARD PROFILE: they become ELIGIBLE TO BE ASSESSED. ⛔ It is
  //   FALSE for the strong_trend route, which has no volume floor — hence the guard at `:889`.
  // ⚠️ AND THE REASON THEY FAIL IS A UNITS DEFECT THAT IS LIVE TODAY, INDEPENDENT OF THIS FIX:
  //   `:820` computes `volume24hCoins * currentPrice`, and `currentPrice` is `ticker.c[0]` —
  //   the price in the QUOTE currency. The comment at `:818` states the invariant ("All filter
  //   thresholds are in USD. Must compare like units") and the arithmetic satisfies it ONLY
  //   when the quote IS USD. For `/XBT` the product is BTC-denominated and is compared against
  //   a flat 500,000; measured medians: `/USD` 10,218 vs `/XBT` 0.08. The min-price floor has
  //   the same shape (0.25, quote-denominated). ⇒ a BTC-quoted pair would need ~500,000 BTC of
  //   daily volume to clear a bar meant to read $500,000. Homed as its own item — see the
  //   change list. Excluding the quote slot is NOT the answer: it re-emits a rejected form.
  // ⛔ AND "the raw form stays recoverable at `pair.pairInfo.wsname`" WAS ALSO FALSE — `wsname`
  //   is undefined for exactly the entries that fall back to the REST key, which is precisely
  //   when it would be needed. The guard above makes it moot: those entries are not touched.
  // ⛔⛔ SLASHED-ONLY GUARD — ADDED AFTER A SECOND READER FOUND MY FIRST VERSION UNSAFE.
  // `:564` is `pairsObj[pairName]?.wsname || pairName`, and `wsname` is OPTIONAL
  // (`kraken-pair-metadata-service.ts:15`). When it is absent `symbol` is the COMPACT REST key
  // (`XXBTZUSD`), not a slashed pair — and on non-slashed input `toCanonical` leaves the safe
  // slashed branch entirely:
  //   • Pattern 1 (`symbol-canonicalizer.ts:188-192`) splits on `lastIndexOf('Z')`, so
  //     `XTZUSD` -> base `T`, quote `USD` -> `T/USD`. SILENTLY WRONG, no throw.
  //   • the `PF_`/`PI_` branch (`:157-166`) can THROW — inside this unguarded `.map`, that
  //     would take down the scan cycle.
  //   • and for exactly those entries `pairInfo.wsname` is UNDEFINED, so the raw form is NOT
  //     recoverable afterwards — which is why "recoverable at pairInfo.wsname" was too strong.
  // ⇒ CONVERT ONLY WHAT WE KNOW THE SHAPE OF. A non-slashed entry is left byte-identical, i.e.
  //   exactly as it behaves today, so this cannot regress the compact-key path. The two target
  //   bases are slashed in the venue's own wsname (`XBT/USD`, `XDG/USD`), so the fix still lands.
  batch = batch.map(p => ({
    ...p,
    symbol: p.symbol?.includes('/') ? toCanonical(p.symbol) : p.symbol,
  }));

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

  // B63.3: Pre-fetch OHLC + compute DBS for all batch pairs when strong_trend filters provided.
  // This enables DBS-aware routing: pairs with DBS>=0.35 (positive, LONG-only) get the
  // strong_trend global filter profile; others get the standard profile. Pairs with
  // non-strong DBS or no OHLC fall back to standard filters as before.
  //
  // Rate-limit mitigation: process pairs in batches of 10 concurrent fetches to avoid
  // overwhelming Kraken API on cold cache. ohlcCache has 5-min TTL so after first cycle
  // most pairs are warm and fetches are effectively free.
  const dbsCache = new Map<string, { score: number; category: string; slope: number; atr: number }>();
  if (strongTrendFilters) {
    const preFetchStart = Date.now();
    const B63_OHLC_FETCH_CONCURRENCY = 10; // Kraken-friendly burst size
    // B-4.6-B chunk B: the prefetch loop is THE proven hot segment (soak:
    // batch max 95ms / pair max 72ms sync spans run back-to-back warm →
    // 200-700ms event-loop stall per cycle). Elapsed-gated macrotask yields
    // at BATCH-OF-10 BOUNDARIES ONLY (granularity lock — never mid-batch:
    // the 10 callbacks' sync tails drain as one atomic span by design).
    const _yield46b = new ScanYielder('crypto_prefetch');
    for (let i = 0; i < batch.length; i += B63_OHLC_FETCH_CONCURRENCY) {
      const chunk = batch.slice(i, i + B63_OHLC_FETCH_CONCURRENCY);
      // B-4.6-B chunk A (measurement only): per-pair ATR/DBS sync spans + the
      // batch sum (= the batch's worst-case atomic span when all 10 OHLC
      // fetches resolve warm and the callbacks' sync tails drain back-to-back).
      let _chunkSyncMs = 0;
      await Promise.all(chunk.map(async (pair) => {
        try {
          const { ohlc } = await ohlcCache.getOHLCData(pair.symbol, 60);
          if (!ohlc || ohlc.length < 20) return;
          const _ss46b = syncSpanStart();
          const ohlcFull: OHLCData[] = ohlc.map((c: any) => ({
            open: parseFloat(c.open),
            high: parseFloat(c.high),
            low: parseFloat(c.low),
            close: parseFloat(c.close),
            volume: parseFloat(c.volume || '0'),
            timestamp: typeof c.time === 'number' ? c.time : (c.time ? Date.parse(c.time) : 0),
          }));
          const atr = computeATR14(ohlcFull);
          if (atr <= 0) { _chunkSyncMs += recordSyncSpan('crypto_prefetch_pair', _ss46b, pair.symbol); return; }
          const dbsResult = computeDirectionalBias(ohlcFull, atr);
          let slope = 0;
          const priorOHLC = ohlcFull.slice(0, -3);
          if (priorOHLC.length >= 20) {
            const priorAtr = computeATR14(priorOHLC);
            if (priorAtr > 0) {
              const priorDbs = computeDirectionalBias(priorOHLC, priorAtr);
              slope = dbsResult.score - priorDbs.score;
            }
          }
          dbsCache.set(pair.symbol, { score: dbsResult.score, category: dbsResult.category, slope, atr });
          _chunkSyncMs += recordSyncSpan('crypto_prefetch_pair', _ss46b, pair.symbol);
        } catch {
          // OHLC unavailable — pair will fall back to standard filters (no DBS-aware routing)
        }
      }));
      if (_chunkSyncMs > 0) recordSyncSpanMs('crypto_prefetch_batch', _chunkSyncMs, chunk[0]?.symbol);
      await _yield46b.maybeYield(); // B-4.6-B chunk B: batch-of-10 boundary
    }
    const strongCount = Array.from(dbsCache.values()).filter(d => d.score >= B63_STRONG_DBS_THRESHOLD).length;
    console.log(`[B63.3][AdaptiveScan] Pre-DBS pass: ${dbsCache.size}/${batch.length} pairs with OHLC, ${strongCount} strong-DBS (>=0.35) candidates (${Date.now() - preFetchStart}ms, batched ${B63_OHLC_FETCH_CONCURRENCY} concurrent, yields=${_yield46b.count})`);
  }

  // B-4.6-B chunk-B iteration 2 (chunk-A R1 escalation): whole-iteration spans
  // for the MAIN FILTER loop — iteration-to-iteration timing, so a span
  // INCLUDES any await inside the pair's body (passesHistoryFilter on cold
  // pairs = genuine I/O; documented pollution, read max with that in mind).
  let _ss46bMF = -1;
  for (const pair of batch) {
    if (_ss46bMF >= 0) recordSyncSpan('crypto_main_filter_pair', _ss46bMF);
    _ss46bMF = syncSpanStart();
    // Directive 11.4H.4 Task 5: Check if this is a benchmark pair
    const isBenchmarkPair = benchmarkSet.has(pair.symbol.toUpperCase());
    const ticker = pair.ticker as any;
    const pairInfo = pair.pairInfo;
    const baseCurrency = pairInfo.base;
    const currentPrice = parseFloat(ticker.c[0]);
    // Batch 19F HF2: Kraken ticker.v[1] returns volume in BASE CURRENCY (coins), not USD.
    // Directive 8.8.4-C.13.D mandates USD conversion: volume_coins × currentPrice = volume_USD.
    // All filter thresholds (minVolume, patternMinVolume) are in USD. Must compare like units.
    const volume24hCoins = parseFloat(ticker.v[1]);
    const volume24h = volume24hCoins * currentPrice; // Convert to USD for filter comparison
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

      // B63.3: DBS-aware routing. If this pair has strong positive DBS (>=0.35), apply the
      // strong_trend global filter profile instead of the standard one. This is the key
      // architectural promise of B63 — strong-DBS pairs bypass normal global filters.
      const cachedDbs = dbsCache.get(pair.symbol);
      // ⛔⛔ B-SCANNER-EGRESS-NORMALISE GUARD — A BTC-QUOTED PAIR MAY NOT TAKE THE STRONG-DBS
      // BYPASS. Langston, Step-4 round 3, and it is a REAL deploy risk this batch created.
      // The normalisation at `:714` sits ABOVE the B63.3 prefetch at `:789`, so post-fix the
      // 31 `%/XBT` pairs resolve, gain OHLC, gain a DBS score, and any scoring >= 0.35 lands
      // HERE — on a profile whose live values are `minVolume = 0`, `minPrice = 0.001`
      // (`screener_filters.active_strong_trend`). MEASURED: at least 8 of the 31 clear a
      // 0.001 BTC price floor (WBTC .9995, TBTC .98004, PAXG .0564, ETH .0318, XMR .0064,
      // BCH .0032, AAVE .0016, SOL .00135) — and `TBTC/XBT` carries ~0.001 BTC ≈ $110 of 24h
      // volume against a floor of ZERO.
      // ⇒ THE WHOLE "they only become eligible to be ASSESSED" ARGUMENT RESTS ON THE STANDARD
      //   PROFILE'S VOLUME FLOOR, AND THIS ROUTE DOES NOT HAVE ONE.
      // ⚠️ WHY THE BYPASS IS UNSAFE HERE SPECIFICALLY, rather than merely untested: the money
      //   gates it skips are denominated wrong for a non-USD quote (`:820` multiplies coin
      //   volume by the QUOTE-currency price — see #966). A zero-volume bypass is only ever
      //   safe if the thing being bypassed was measuring the right quantity.
      // ✅ THIS IS A NO-OP FOR TODAY: the 31 already fail `low_volume` on the standard profile
      //   and they continue to, identically — same rows, same label, same archive. It blocks
      //   ONLY the path this batch would otherwise open. Reversible when #966 decides whether
      //   BTC-quoted instruments belong in the universe at all.
      const quoteCcy = pair.symbol?.includes('/') ? pair.symbol.split('/')[1] : '';
      const quoteIsNonUsdCrypto = quoteCcy === 'BTC' || quoteCcy === 'XBT';
      const isStrongBullDbs = !!(strongTrendFilters && cachedDbs && cachedDbs.score >= B63_STRONG_DBS_THRESHOLD
        && !quoteIsNonUsdCrypto);
      const activeMinVolume = isStrongBullDbs ? strongTrendFilters!.minVolume : minVolume;
      const activeMinPrice = isStrongBullDbs ? strongTrendFilters!.minPrice : minPrice;
      const activeMaxBidAskSpread = isStrongBullDbs ? strongTrendFilters!.maxBidAskSpread : maxBidAskSpread;
      const activeMinHistoryDays = isStrongBullDbs ? strongTrendFilters!.minHistoryDays : minHistoryDays;

      // Filter: Min volume (B63.3: uses strong_trend threshold for strong-DBS pairs)
      if (!rejected && volume24h < activeMinVolume) {
        breakdown.failed_min_volume++;
        rejected = true;
        // P19-B5a: active-path pre_filter reject capture (dormant in VTS/passive).
        if (!isPassiveLearning) capturePreFilterReject({ mode: tradingModeToRunMode(mode), symbol: pair.symbol, exchange: 'kraken', assetClass: 'crypto_spot', source: 'market-scanner', label: 'low_volume', gateDetail: { observed: volume24h, threshold: activeMinVolume } });
      }

      // Filter: Min price (B63.3: uses strong_trend threshold for strong-DBS pairs)
      if (!rejected && currentPrice < activeMinPrice) {
        breakdown.failed_min_price++;
        rejected = true;
        if (!isPassiveLearning) capturePreFilterReject({ mode: tradingModeToRunMode(mode), symbol: pair.symbol, exchange: 'kraken', assetClass: 'crypto_spot', source: 'market-scanner', label: 'low_price', gateDetail: { observed: currentPrice, threshold: activeMinPrice } });
      }

      // Filter: Bid-ask spread (B63.3: strong-DBS pairs use strong_trend spread threshold)
      if (!rejected && bidAskSpread > activeMaxBidAskSpread) {
        breakdown.failed_spread++;
        rejected = true;
        if (!isPassiveLearning) capturePreFilterReject({ mode: tradingModeToRunMode(mode), symbol: pair.symbol, exchange: 'kraken', assetClass: 'crypto_spot', source: 'market-scanner', label: 'wide_spread', gateDetail: { observed: bidAskSpread, threshold: activeMaxBidAskSpread } });
      }

      // Filter: History (async, B63.3: strong-DBS pairs use strong_trend history requirement)
      if (!rejected && activeMinHistoryDays > 0) {
        const sbHistoryCtx: HistoryFilterContext = isStrongBullDbs
          ? { ...historyFilterCtx, minHistoryDays: activeMinHistoryDays }
          : historyFilterCtx;
        const historyResult = await passesHistoryFilter(pair.symbol, sbHistoryCtx);
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

      // B63.3: Determine final DBS-tag for downstream routing
      const finalDbs = dbsCache.get(pair.symbol);
      const strongDbsPositive = !!(finalDbs && finalDbs.score >= B63_STRONG_DBS_THRESHOLD);

      survivors.push({
        symbol: pair.symbol,
        currentPrice,
        volume24h,
        dailyRange,
        fromTopN: pair.poolType === 'ideal', // Backwards compatibility
        poolType: pair.poolType,
        // Directive 11.4H.3: Pass spread data through for friction calculation
        bidAskSpread,
        // B63.3: Propagate DBS + routing tag for downstream consumers
        dbsScore: finalDbs?.score,
        dbsCategory: finalDbs?.category,
        dbsSlope: finalDbs?.slope,
        atr: finalDbs?.atr,
        routedViaStrongTrend: strongDbsPositive,
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
  if (_ss46bMF >= 0) recordSyncSpan('crypto_main_filter_pair', _ss46bMF);

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
  
  // Batch 19F: Pattern global filter second pass (dual-path)
  // Runs ALL batch pairs through relaxed pattern thresholds in parallel with quant filters
  let patternSurvivors: BatchResult['patternSurvivors'] = undefined;
  let patternBreakdown: BatchResult['patternBreakdown'] = undefined;

  if (patternFilters) {
    const patternMinVolume = patternFilters.MIN_VOLUME_USD;
    const patternMaxSpread = patternFilters.MAX_BID_ASK_SPREAD;
    const patternMinHistoryDays = patternFilters.MIN_HISTORY_DAYS;
    const patternResults: NonNullable<BatchResult['patternSurvivors']> = [];

    // Batch 19G HF2: Use pattern-specific values for all filters (not quant fallbacks)
    const patternExcludeStablecoins = patternFilters.EXCLUDE_STABLECOINS ?? excludeStablecoins;
    const patternMinPrice = patternFilters.MIN_PRICE ?? minPrice;
    const patternMaxPrice = patternFilters.MAX_PRICE ?? 100_000;
    let stableRejects = 0, priceRejects = 0, volumeRejects = 0, spreadRejects = 0, historyRejects = 0, maxPriceRejects = 0;
    console.log(`[DIAG_PATTERN] THRESHOLDS: minVolume=${patternMinVolume}, maxSpread=${patternMaxSpread}%, minHistory=${patternMinHistoryDays}d, minPrice=${patternMinPrice}, maxPrice=${patternMaxPrice}, excludeStablecoins=${patternExcludeStablecoins}`);

    // B-4.6-B chunk-B iteration 2: whole-iteration spans for the 19F PATTERN
    // loop (same iteration-to-iteration shape + await-pollution caveat as the
    // main filter wrap above).
    let _ss46bPT = -1;
    for (const pair of batch) {
      if (_ss46bPT >= 0) recordSyncSpan('crypto_pattern_pair', _ss46bPT);
      _ss46bPT = syncSpanStart();
      const ticker = pair.ticker as any;
      const pairInfo = pair.pairInfo;
      const currentPrice = parseFloat(ticker.c[0]);
      // Batch 19F HF2: Same coin-to-USD conversion as quant path (Directive 8.8.4-C.13.D)
      const volume24hCoins = parseFloat(ticker.v[1]);
      const volume24h = volume24hCoins * currentPrice; // USD for filter comparison
      const high24h = parseFloat(ticker.h[1]);
      const low24h = parseFloat(ticker.l[1]);
      const dailyRange = low24h > 0 ? ((high24h - low24h) / low24h) * 100 : 0;
      const askPrice = parseFloat(ticker.a[0]);
      const bidPrice = parseFloat(ticker.b[0]);
      const bidAskSpread = bidPrice > 0 ? ((askPrice - bidPrice) / bidPrice) * 100 : 0;

      console.log(`[DIAG_PATTERN] Evaluating pair ${pair.symbol}: price=${currentPrice}, volume24hCoins=${parseFloat(ticker.v[1])}, volume24hUSD=${volume24h}, spread=${bidAskSpread}%`);

      // Pattern global filters (relaxed thresholds)
      // Batch 19G HF2: Stablecoin filter uses pattern-specific setting from DB
      if (patternExcludeStablecoins && isStablePairRegex.test(pair.symbol)) {
        console.log(`[DIAG_PATTERN] REJECTED ${pair.symbol}: stablecoin`);
        stableRejects++;
        continue;
      }

      // Batch 19G HF2: Min price uses pattern-specific threshold from DB
      if (currentPrice < patternMinPrice) {
        console.log(`[DIAG_PATTERN] REJECTED ${pair.symbol}: price ${currentPrice} < ${patternMinPrice}`);
        priceRejects++;
        // P19-B5a: active-path pre_filter reject capture (dormant in VTS/passive).
        if (!isPassiveLearning) capturePreFilterReject({ mode: tradingModeToRunMode(mode), symbol: pair.symbol, exchange: 'kraken', assetClass: 'crypto_spot', source: 'market-scanner', label: 'pattern_low_price', gateDetail: { observed: currentPrice, threshold: patternMinPrice } });
        continue;
      }

      // Batch 19G HF2: Max price filter (pattern-specific from DB)
      if (currentPrice > patternMaxPrice) {
        console.log(`[DIAG_PATTERN] REJECTED ${pair.symbol}: price ${currentPrice} > maxPrice ${patternMaxPrice}`);
        maxPriceRejects++;
        if (!isPassiveLearning) capturePreFilterReject({ mode: tradingModeToRunMode(mode), symbol: pair.symbol, exchange: 'kraken', assetClass: 'crypto_spot', source: 'market-scanner', label: 'pattern_high_price', gateDetail: { observed: currentPrice, threshold: patternMaxPrice } });
        continue;
      }

      // Min volume: pattern threshold (lower than quant)
      if (volume24h < patternMinVolume) {
        console.log(`[DIAG_PATTERN] REJECTED ${pair.symbol}: volume ${volume24h} < ${patternMinVolume}`);
        volumeRejects++;
        if (!isPassiveLearning) capturePreFilterReject({ mode: tradingModeToRunMode(mode), symbol: pair.symbol, exchange: 'kraken', assetClass: 'crypto_spot', source: 'market-scanner', label: 'pattern_low_volume', gateDetail: { observed: volume24h, threshold: patternMinVolume } });
        continue;
      }

      // Bid-ask spread: pattern threshold (wider than quant)
      if (bidAskSpread > patternMaxSpread) {
        console.log(`[DIAG_PATTERN] REJECTED ${pair.symbol}: spread ${bidAskSpread}% > ${patternMaxSpread}%`);
        spreadRejects++;
        if (!isPassiveLearning) capturePreFilterReject({ mode: tradingModeToRunMode(mode), symbol: pair.symbol, exchange: 'kraken', assetClass: 'crypto_spot', source: 'market-scanner', label: 'pattern_wide_spread', gateDetail: { observed: bidAskSpread, threshold: patternMaxSpread } });
        continue;
      }

      // History: pattern threshold (shorter than quant)
      if (patternMinHistoryDays > 0) {
        const historyResult = await passesHistoryFilter(pair.symbol, {
          minHistoryDays: patternMinHistoryDays,
          mode,
          krakenService,
        });
        if (!historyResult.passed) {
          console.log(`[DIAG_PATTERN] REJECTED ${pair.symbol}: history failed`);
          historyRejects++;
          continue;
        }
      }

      patternResults.push({
        symbol: pair.symbol,
        currentPrice,
        volume24h,
        dailyRange,
        poolType: pair.poolType,
        bidAskSpread,
      });
    }
    if (_ss46bPT >= 0) recordSyncSpan('crypto_pattern_pair', _ss46bPT);

    console.log(`[DIAG_PATTERN] SUMMARY: ${patternResults.length} survived out of ${batch.length} total. Rejections: stablecoin=${stableRejects}, price=${priceRejects}, maxPrice=${maxPriceRejects}, volume=${volumeRejects}, spread=${spreadRejects}, history=${historyRejects}`);

    patternSurvivors = patternResults;
    // Batch 19H: Capture per-filter rejection counts for diagnostics
    patternBreakdown = {
      failed_stablecoin: stableRejects,
      failed_min_price: priceRejects,
      failed_max_price: maxPriceRejects,
      failed_min_volume: volumeRejects,
      failed_spread: spreadRejects,
      failed_history: historyRejects,
      passed_all_filters: patternResults.length,
    };
    console.log(`[19F][PATTERN_GLOBAL] Pattern global filter: ${patternResults.length}/${batch.length} pairs passed relaxed thresholds`);
  }

  // B63.4: Compute pre-global DBS diagnostics (visibility into drop-off at each stage)
  const preGlobalStrongDbsEntries = Array.from(dbsCache.entries()).filter(([, d]) => d.score >= B63_STRONG_DBS_THRESHOLD);

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
      // B63.4: Expose pre-global DBS data so UI can show drop-off stage-by-stage.
      preGlobalDbsComputed: dbsCache.size,
      preGlobalStrongDbs: preGlobalStrongDbsEntries.length,
      preGlobalStrongDbsSymbols: preGlobalStrongDbsEntries.map(([sym]) => sym),
    },
    patternSurvivors,
    patternBreakdown,
  };
}
