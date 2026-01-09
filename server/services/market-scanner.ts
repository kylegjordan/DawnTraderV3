import { KrakenService } from './kraken';
import { StrategyEngine } from './strategy-engine';
import { storage } from '../storage';
import { WatchlistPair } from '@shared/schema';
import { strategyAlerts } from './strategy-alerts';
import { PaperSimDiagnosticService } from './paper-sim-diagnostic.js';
import { activeFilterPool } from './active-filter-pool.js';
import { getAdaptiveScanManager, type AdaptiveScanBatch } from './adaptive-scan-manager.js';
import { SCANNER_PARAMS } from '../config/system-guards.js';

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

// LEGACY — Do NOT wire to Stage-3.
// TODO: Remove in Phase 8.12 (auth+role+stability cleanup)
// This 10-minute scanner is no longer the source of truth for real-time market data.
// Stage-3 is now connected to the FX5 30-second batch scanner instead.
export class MarketScanner {
  private kraken: KrakenService;
  private strategyEngine: StrategyEngine;
  private diagnosticService: PaperSimDiagnosticService;
  private isScanning = false;

  constructor() {
    this.kraken = new KrakenService();
    this.strategyEngine = new StrategyEngine();
    this.diagnosticService = new PaperSimDiagnosticService();
  }

  async startHourlyScanning(): Promise<void> {
    console.log('Starting 10-minute market scanning...');
    
    // Run initial scan
    await this.performScan();
    
    // Schedule 10-minute scans
    setInterval(async () => {
      if (!this.isScanning) {
        await this.performScan();
      }
    }, 10 * 60 * 1000); // 10 minutes
  }

  private async performScan(): Promise<void> {
    if (this.isScanning) {
      console.log('Scan already in progress, skipping...');
      return;
    }

    this.isScanning = true;
    console.log('\n🔍 Performing market scan...');

    try {
      // Get all users to update their watchlists
      const users = await this.getAllActiveUsers();
      
      // If no users, use default settings for testing
      if (users.length === 0) {
        console.log('No active users found, using default screener settings for testing...');
        const defaultSettings = {
          minVolume: '30000000',
          minDailyRange: '6.5',
          minPrice: '0.01',
          maxBidAskSpread: '1.00',
          excludeStablecoins: true,
          allowedTradingPairs: ['USD', 'USDT'],
          blacklistedSymbols: [],
          whitelistedSymbols: [],
          minHistoryDays: 90
        };
        
        const eligiblePairs = await this.kraken.getEligiblePairs(defaultSettings);
        console.log(`Found ${eligiblePairs.length} eligible pairs with default settings`);
      } else {
        // Process each user with their own settings
        for (const user of users) {
          // Phase 27.F.13.M: Use global screener_filters (mode-only, no userId)
          const screenerSettings = await storage.getScreenerFilters({ mode: 'paper' });
// Phase 41F-L.E2E-PURGE: DISABLED -           const tradingSettings = await storage.getTradingSettings(user.id);
          
          if (!screenerSettings) {
            console.log(`No screener settings found for user ${user.id}, skipping...`);
            continue;
          }

          console.log(`\n👤 Processing user ${user.id} with custom screener filters...`);
          
          // Apply user-specific screener filters (NO HARDCODED FALLBACKS - use database values ONLY)
          const eligiblePairs = await this.kraken.getEligiblePairs({
            minVolume: screenerSettings.minVolume || '0',
            minDailyRange: '0',
            minPrice: screenerSettings.minPrice || undefined,
            maxPrice: screenerSettings.maxPrice || undefined,
            maxBidAskSpread: screenerSettings.maxBidAskSpread || undefined,
            excludeStablecoins: screenerSettings.excludeStablecoins ?? true,
            allowedTradingPairs: [], // User explicitly requires NO currency-based filtering
            blacklistedSymbols: [],
            whitelistedSymbols: [],
            minHistoryDays: undefined,
            rsiMin: screenerSettings.rsiMin || undefined,
            rsiMax: screenerSettings.rsiMax || undefined,
            volatilityMin: screenerSettings.volatilityMin || undefined,
            volatilityMax: screenerSettings.volatilityMax || undefined,
            minLiquidity: screenerSettings.minLiquidity || undefined,
            minMarketCap: screenerSettings.minMarketCap || undefined,
            allowRegulatedOnly: screenerSettings.allowRegulatedOnly ?? false,
            // Phase 27.F.14: Advanced Universe & Signal Controls
            universeSize: screenerSettings.universeSize || undefined,
            quoteCurrencies: screenerSettings.quoteCurrencies as string[] || undefined,
            activeTimeframes: screenerSettings.activeTimeframes as string[] || undefined
          });
          
          console.log(`[27.F.14][MarketScanner] Universe limited to ${screenerSettings.universeSize || 'unlimited'} pairs`);
          
          // Phase 27.F.15.A: Log filter diagnostics for both modes
          await this.logFilterDiagnostics(user.id, 'paper', eligiblePairs);
          await this.logFilterDiagnostics(user.id, 'live', eligiblePairs);
          
          // Update watchlists for both live and paper modes
          await this.updateUserWatchlist(user.id, 'paper', eligiblePairs);
          await this.updateUserWatchlist(user.id, 'live', eligiblePairs);
          
          // Auto-start paper simulation if user has eligible pairs and it's not already running
          await this.ensurePaperSimulationRunning(user.id, eligiblePairs);
          
          // Scan for signals in both modes
          await this.scanForSignals(user.id, 'paper');
          await this.scanForSignals(user.id, 'live');
        }
      }
      
      // Dawn Trader Phase 27.F.13.F: Enhanced automatic cleanup (runs every 10 minutes with scan)
      console.log('\n🧹 Running comprehensive cleanup...');
      
      // 1. Expire old trading signals
      const expiredSignals = await storage.expireAllExpiredSignals();
      console.log(`[Cleanup] ${expiredSignals} expired signals removed`);
      
      // 2. Clean stale filtered pairs (not refreshed in 15 minutes)
      const stalePairs = await storage.cleanStaleWatchlistPairs(15);
      console.log(`[Cleanup] ${stalePairs} stale filtered pairs removed`);
      
      // 3. Clean old closed paper trades (older than 30 days)
      // Directive 8.8.4-A3.R4: Extended retention from 24 hours to 720 hours (30 days)
      const oldPaperTrades = await storage.cleanOldPaperSimTrades('paper', 720);
      console.log(`[Cleanup] ${oldPaperTrades} closed paper trades archived (30-day retention)`);
      
      // 4. Clean old closed live trades (older than 30 days)
      const oldLiveTrades = await storage.cleanOldLiveTrades(30);
      console.log(`[Cleanup] ${oldLiveTrades} closed live trades archived`);
      
      console.log(`✅ Cleanup complete: ${expiredSignals + stalePairs + oldPaperTrades + oldLiveTrades} total records cleaned`);

    } catch (error) {
      console.error('Error during market scan:', error);
    } finally {
      this.isScanning = false;
    }
  }

  private async getAllActiveUsers(): Promise<Array<{ id: string; tradingStatus: string }>> {
    // Query all users from the database who have trading settings
    // The scanner updates watchlists for all users, not just those actively trading
    const allUsers = await storage.getAllUsers();
    
    // Return all users (settings check disabled in Phase 41F-L.E2E-PURGE)
    const usersWithSettings = allUsers.map(user => ({
      id: user.id,
      tradingStatus: user.tradingStatus || 'stopped'
    }));
    
    console.log(`[MarketScan] Found ${usersWithSettings.length} users`);
    return usersWithSettings;
  }

  private async updateUserWatchlist(userId: string, mode: 'live' | 'paper', eligiblePairs: any[]): Promise<void> {
    try {
      // Get current user watchlist for this mode
      // Phase 27.F.15.B.4: getWatchlist is now mode-only (global)
      const currentWatchlist = await storage.getWatchlist({ mode });
      const currentSymbols = new Set(currentWatchlist.map(p => p.symbol));

      // Add new eligible pairs to watchlist
      for (const pair of eligiblePairs) {
        if (!currentSymbols.has(pair.symbol)) {
          const watchlistPair: any = {
            userId,
            mode,
            symbol: pair.symbol,
            baseCurrency: pair.baseCurrency,
            quoteCurrency: pair.quoteCurrency,
            volume24h: pair.volume24h.toString(),
            currentPrice: pair.currentPrice.toString(),
            vwap: pair.vwap?.toString(),
            dailyRange: pair.dailyRange.toString(),
            lastScanned: new Date()
          };

          await storage.addWatchlistPair(watchlistPair);
        } else {
          // Update existing pair data
          const existingPair = currentWatchlist.find(p => p.symbol === pair.symbol);
          if (existingPair) {
            await storage.updateWatchlistPair(existingPair.id, {
              volume24h: pair.volume24h.toString(),
              currentPrice: pair.currentPrice.toString(),
              vwap: pair.vwap?.toString(),
              dailyRange: pair.dailyRange.toString(),
              lastScanned: new Date()
            });
          }
        }
      }

      // Remove pairs that no longer meet criteria
      const eligibleSymbols = new Set(eligiblePairs.map(p => p.symbol));
      for (const watchlistPair of currentWatchlist) {
        if (!eligibleSymbols.has(watchlistPair.symbol)) {
          await storage.removeWatchlistPair(watchlistPair.id);
        }
      }

    } catch (error) {
      console.error(`Error updating ${mode} watchlist for user ${userId}:`, error);
    }
  }

  private async scanForSignals(userId: string, mode: 'live' | 'paper'): Promise<void> {
    try {
      // Phase 27.F.15.B.4: getWatchlist is now mode-only (global)
      const watchlist = await storage.getWatchlist({ mode });
      
      // REB 8.8.3-KS-B: Check kill switch via guardrailPolicy (tradingSuspended removed)
      const { guardrailPolicy } = await import('./guardrail-policy.js');
      const killSwitchTripped = await guardrailPolicy.isKillSwitchTripped(mode);
      if (killSwitchTripped) {
        console.log('🚨 Kill switch tripped — strategies skipped. Resume trading to continue.');
        return;
      }

      // Phase 27.F.15.B.4: listStrategySettings is now mode-only (global)
      const strategySettings = await storage.listStrategySettings({ mode });
      
      // Phase 8.8.3-I3: Provide default settings for SMA calculations
      const defaultSettings = { smaLength: '20' };

      for (const pair of watchlist) {
        await this.analyzeSymbolForSignals(userId, pair, defaultSettings, strategySettings, mode);
        
        // Add delay to respect API rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.error(`Error scanning for signals for user ${userId}:`, error);
    }
  }

  private async analyzeSymbolForSignals(
    userId: string, 
    pair: WatchlistPair, 
    settings: any,
    strategySettings: any[],
    mode: 'live' | 'paper'
  ): Promise<void> {
    try {
      // Get price data for analysis
      const ohlcData = await this.kraken.getOHLCData(pair.symbol, 60); // 1-hour candles
      if (!ohlcData.ohlc || ohlcData.ohlc.length < 20) return;

      // Convert to our PriceData format
      const priceData = ohlcData.ohlc.map((candle, index) => ({
        id: `${pair.symbol}-${candle.time}-${index}`,
        symbol: pair.symbol,
        timestamp: new Date(candle.time * 1000),
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
        vwap: candle.vwap,
        sma: '0' // Will be calculated
      }));

      // Calculate technical indicators
      const currentPrice = parseFloat(priceData[priceData.length - 1].close);
      const vwap = this.strategyEngine.calculateVWAP(priceData.slice(-24)); // 24-hour VWAP
      const sma = this.strategyEngine.calculateSMA(priceData, parseInt(settings.smaLength || '20'));
      
      const indicators = {
        vwap,
        sma,
        currentPrice,
        volume: parseFloat(priceData[priceData.length - 1].volume),
        high24h: Math.max(...priceData.slice(-24).map(p => parseFloat(p.high))),
        low24h: Math.min(...priceData.slice(-24).map(p => parseFloat(p.low)))
      };

      // Helper function to get strategy params
      const getStrategyParams = (strategyName: string) => {
        const strategySetting = strategySettings.find(s => s.strategy === strategyName && s.enabled);
        return strategySetting?.params || null;
      };

      // Check all 8 strategies for signals
      console.log(`\n🔍 Analyzing ${pair.symbol} for strategy signals...`);
      const signals = [];

      // Original 3 strategies (still using TradingSettings)
      signals.push(this.strategyEngine.detectVWAPPullback(indicators, settings, priceData));
      signals.push(this.strategyEngine.detectABCDLong(priceData, settings));
      signals.push(this.strategyEngine.detectSMATrendRide(indicators, priceData, settings));

      // New 5 strategies (using strategy-specific params)
      const breakoutParams = getStrategyParams('breakout');
      if (breakoutParams) {
        signals.push(this.strategyEngine.detectBreakout(priceData, breakoutParams));
      }

      const meanReversionParams = getStrategyParams('mean_reversion');
      if (meanReversionParams) {
        signals.push(this.strategyEngine.detectMeanReversion(indicators, priceData, meanReversionParams));
      }

      const rangeTradingParams = getStrategyParams('range_trading');
      if (rangeTradingParams) {
        signals.push(this.strategyEngine.detectRangeTrading(priceData, rangeTradingParams));
      }

      const vwapBounceParams = getStrategyParams('vwap_bounce');
      if (vwapBounceParams) {
        signals.push(this.strategyEngine.detectVWAPBounce(indicators, priceData, vwapBounceParams));
      }

      const liquidityTrapParams = getStrategyParams('liquidity_trap');
      if (liquidityTrapParams) {
        signals.push(this.strategyEngine.detectLiquidityTrap(priceData, liquidityTrapParams));
      }

      // Filter out null signals
      const validSignals = signals.filter(signal => signal !== null);

      // ===== TELEMETRY: Signal Counter Logging =====
      if (validSignals.length > 0) {
        const signalsByStrategy = validSignals.reduce((acc: Record<string, number>, signal: any) => {
          acc[signal.strategy] = (acc[signal.strategy] || 0) + 1;
          return acc;
        }, {});
        console.log(`📊 [TELEMETRY] Signals generated for ${pair.symbol}:`, signalsByStrategy);
      }

      // Apply conflict resolution if multiple signals found
      let resolvedSignals = validSignals;
      let skippedSignals: any[] = [];
      if (validSignals.length > 1) {
        resolvedSignals = this.resolveConflicts(validSignals, strategySettings);
        skippedSignals = validSignals.filter(s => !resolvedSignals.includes(s));
        console.log(`⚖️ Conflict resolution: ${validSignals.length} signals → ${resolvedSignals.length} resolved for ${pair.symbol}`);
        
        // ===== TELEMETRY: Skipped Signals =====
        if (skippedSignals.length > 0) {
          console.log(`📊 [TELEMETRY] Skipped signals (conflict resolution):`, 
            skippedSignals.map(s => `${s.strategy}(conf=${s.confidence})`).join(', '));
        }

        // ===== ALERT: Conflict Resolution =====
        strategyAlerts.conflictResolution(
          userId,
          pair.symbol,
          validSignals.length,
          resolvedSignals.length,
          skippedSignals.map(s => s.strategy)
        );
      }

      // Process any found signals
      if (resolvedSignals.length > 0) {
        console.log(`✅ Found ${resolvedSignals.length} signal(s) for ${pair.symbol}`);
      }
      
      for (const signal of resolvedSignals) {
        if (signal) {
          signal.symbol = pair.symbol;
          await this.processSignal(userId, mode, signal, pair, indicators);
        }
      }

    } catch (error) {
      console.error(`Error analyzing ${pair.symbol} for user ${userId}:`, error);
    }
  }

  /**
   * Resolve conflicts when multiple strategies trigger on the same symbol
   * Strategy: BEST SCORE WINS - Only 1 signal per asset
   * Prioritization (deterministic):
   * 1. Strategy weight (from settings)
   * 2. Signal confidence
   * 3. Strategy name (alphabetical, for determinism)
   */
  private resolveConflicts(signals: any[], strategySettings: any[]): any[] {
    // Get strategy weight for each signal
    const signalsWithWeight = signals.map(signal => {
      const setting = strategySettings.find(s => s.strategy === signal.strategy);
      const weight = setting?.weight ?? 1.0; // Default weight = 1.0
      return { signal, weight };
    });

    // Sort by: weight (desc) → confidence (desc) → strategy name (asc for determinism)
    signalsWithWeight.sort((a, b) => {
      // 1. Higher weight wins
      if (a.weight !== b.weight) {
        return b.weight - a.weight;
      }
      // 2. Higher confidence wins
      if (a.signal.confidence !== b.signal.confidence) {
        return b.signal.confidence - a.signal.confidence;
      }
      // 3. Alphabetical strategy name (deterministic tiebreaker)
      return a.signal.strategy.localeCompare(b.signal.strategy);
    });

    // Take only the best signal (prevents over-exposure to single asset)
    const bestSignal = signalsWithWeight[0].signal;

    // Log conflict resolution details
    if (signals.length > 1) {
      const dropped = signals.length - 1;
      console.log(`📉 Conflict resolution: ${signals.length} signals → BEST SCORE WINS`);
      console.log(`  ✅ Selected: ${bestSignal.strategy} (weight=${signalsWithWeight[0].weight}, conf=${bestSignal.confidence})`);
      console.log(`  ❌ Dropped: ${dropped} signal(s):`, 
        signalsWithWeight.slice(1).map(s => `${s.signal.strategy}(w=${s.weight},c=${s.signal.confidence})`).join(', '));
    }

    return [bestSignal];
  }

  private async processSignal(
    userId: string, 
    mode: 'live' | 'paper',
    signal: any, 
    pair: WatchlistPair,
    indicators: any
  ): Promise<void> {
    console.log(`Signal detected for user ${userId}:`, {
      symbol: signal.symbol,
      strategy: signal.strategy,
      confidence: signal.confidence,
      entry: signal.entryPrice,
      stop: signal.stopPrice,
      target: signal.targetPrice
    });

    try {
      // Parse symbol to extract base and quote currencies (e.g., "BTCUSD" -> "BTC", "USD")
      const symbolParts = signal.symbol.match(/^([A-Z]+)(USD|USDT|EUR|GBP)$/);
      const baseCurrency = symbolParts ? symbolParts[1] : signal.symbol.slice(0, -3);
      const quoteCurrency = symbolParts ? symbolParts[2] : signal.symbol.slice(-3);

      // Save signal to database with 24-hour expiration
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      // Phase 41F-L.E2E: Lineage tracking - generate traceId and emit signal_snapshot
      const { lineageService } = await import('./lineage.js');
      const traceId = lineageService.getTraceId(signal.symbol, mode);
      
      await lineageService.emitSignalSnapshot({
        traceId,
        symbol: signal.symbol,
        mode,
        strategy: signal.strategy,
        signal: 'buy', // Market scanner generates buy signals
        confidence: signal.confidence,
        metadata: {
          entryPrice: signal.entryPrice,
          stopPrice: signal.stopPrice,
          targetPrice: signal.targetPrice,
          detectedBy: 'market_scanner'
        }
      });

      // Phase 27.F.15.B.4: saveTradingSignal is now mode-only (global)
      await storage.saveTradingSignal({
        mode,
        symbol: signal.symbol,
        baseCurrency,
        quoteCurrency,
        strategy: signal.strategy,
        confidence: signal.confidence.toString(),
        entryPrice: signal.entryPrice.toString(),
        stopPrice: signal.stopPrice.toString(),
        targetPrice: signal.targetPrice.toString(),
        currentPrice: (pair.currentPrice || indicators.currentPrice.toString()),
        vwap: indicators.vwap?.toString() || pair.vwap,
        volume24h: pair.volume24h,
        dailyRange: pair.dailyRange,
        status: 'active',
        expiresAt,
        metadata: {
          detectedBy: 'market_scanner',
          scanCycle: new Date().toISOString(),
          traceId // Preserve traceId for linking to trades
        }
      });

      console.log(`✅ [41F-L.E2E] Trading signal saved with lineage tracking:`, {
        symbol: signal.symbol,
        traceId
      });
      
      // Clean up expired signals for this mode (older than 24 hours)
      // Phase 27.F.15.B.4: expireOldSignals is now mode-only (global)
      const expirationCutoff = new Date();
      expirationCutoff.setHours(expirationCutoff.getHours() - 24);
      await storage.expireOldSignals({ mode, beforeDate: expirationCutoff });
      
    } catch (error) {
      console.error(`Error saving trading signal for ${signal.symbol}:`, error);
    }
  }

  async getMarketOverview(): Promise<{
    totalPairs: number;
    activePairs: number;
    topVolume: any[];
    topPerformers: any[];
  }> {
    try {
      const tickers = await this.kraken.getTicker();
      const pairs = Object.entries(tickers);
      
      const activePairs = pairs.filter(([_, ticker]) => {
        const volume = parseFloat(ticker.v[1]);
        return volume >= 1000000; // At least $1M volume
      });

      const sortedByVolume = activePairs
        .sort((a, b) => parseFloat(b[1].v[1]) - parseFloat(a[1].v[1]))
        .slice(0, 10)
        .map(([symbol, ticker]) => ({
          symbol,
          volume24h: parseFloat(ticker.v[1]),
          price: parseFloat(ticker.c[0]),
          change: ((parseFloat(ticker.c[0]) - parseFloat(ticker.o)) / parseFloat(ticker.o)) * 100
        }));

      const topPerformers = activePairs
        .map(([symbol, ticker]) => ({
          symbol,
          change: ((parseFloat(ticker.c[0]) - parseFloat(ticker.o)) / parseFloat(ticker.o)) * 100,
          price: parseFloat(ticker.c[0]),
          volume: parseFloat(ticker.v[1])
        }))
        .sort((a, b) => b.change - a.change)
        .slice(0, 10);

      return {
        totalPairs: pairs.length,
        activePairs: activePairs.length,
        topVolume: sortedByVolume,
        topPerformers
      };
    } catch (error) {
      console.error('Error getting market overview:', error);
      return {
        totalPairs: 0,
        activePairs: 0,
        topVolume: [],
        topPerformers: []
      };
    }
  }

  /**
   * Phase 27.F.15.A/B: Log comprehensive filter diagnostics to database
   * This enables the Filtered Pairs widget to show real-time scan statistics
   * with detailed breakdown by filter type
   */
  private async logFilterDiagnostics(
    userId: string, 
    mode: 'live' | 'paper', 
    eligiblePairs: any[]
  ): Promise<void> {
    try {
      // Get total universe count
      const tickers = await this.kraken.getTicker();
      const pairsScanned = Object.keys(tickers).length;
      const eligibleCount = eligiblePairs.length;
      
      // Calculate overall stats
      const failurePercent = pairsScanned > 0 
        ? ((pairsScanned - eligibleCount) / pairsScanned * 100).toFixed(2)
        : '0';
      
      // Determine top failure reason
      // Since we don't have access to exclusionReasons here, we use the same heuristic
      // The detailed breakdown is available via /api/paper-sim/diagnostics/scan
      let topFailureReason = 'Quote Currency Filter';
      
      if (parseFloat(failurePercent) > 90) {
        topFailureReason = 'Quote Currency Filter';
      } else if (parseFloat(failurePercent) > 50) {
        topFailureReason = 'Min Volume';
      } else if (eligibleCount > 0) {
        topFailureReason = 'Daily Range';
      }
      
      // Log to database
      // Phase 27.F.15.B.4: logFilterDiagnostic is now mode-only (global)
      await storage.logFilterDiagnostic({
        mode,
        pairsScanned,
        eligiblePairs: eligibleCount,
        topFailureReason,
        failurePercent
      });
      
      console.log(`📊 [FilterDiag] ${mode}: scanned=${pairsScanned}, eligible=${eligibleCount} (${(100 - parseFloat(failurePercent)).toFixed(1)}%)`);
    } catch (error) {
      console.error(`Error logging filter diagnostics for user ${userId} (${mode}):`, error);
    }
  }

  /**
   * Auto-start paper simulation for users with eligible pairs
   * SAFETY: Respects kill switch, trading status, and manual stops
   */
  private async ensurePaperSimulationRunning(userId: string, eligiblePairs: any[]): Promise<void> {
    try {
      // Only auto-start if user has eligible pairs
      if (eligiblePairs.length === 0) {
        console.log(`[MarketScan:AutoStart] User ${userId} has no eligible pairs, skipping auto-start`);
        return;
      }

      // SAFETY CHECK 1: Respect trading settings (kill switch, etc.)
// Phase 41F-L.E2E-PURGE: DISABLED -       const settings = await storage.getTradingSettings(userId);
      // Phase 41F-L.E2E-PURGE: Auto-start disabled - trading settings purged
      console.log(`[MarketScan:AutoStart] Auto-start disabled (Phase 41F-L.E2E-PURGE)`);
      return;
    } catch (error) {
      console.error(`[MarketScan:AutoStart] Error in auto-start check for user ${userId}:`, error);
    }
  }

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
    // @deprecated Legacy fields (11.4C.1) - mapped from Ideal/Rotational for backward compatibility
    topNCount?: number;
    tierBCount?: number;
    topEndUniverseSize?: number;
    tierBUniverseSize?: number;
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
  mode: 'paper' | 'live'
): Promise<BatchResult> {
  const startTime = Date.now();
  const cycleId = `adaptive_${mode}_${Date.now()}`;
  
  console.log(`[AdaptiveScan][11.4C.1] Starting adaptive batch scan (mode=${mode}, cycleId=${cycleId})`);
  
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
  const batch = adaptiveBatch.totalBatch.map(symbol => {
    const pair = allPairs.find(p => p.symbol === symbol);
    return {
      ...pair!,
      poolType: idealSet.has(symbol) ? 'ideal' as const : 'rotational' as const,
    };
  }).filter(p => p.pairInfo);
  
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
  const stablecoinPatterns = ['USDT', 'USDC', 'DAI', 'BUSD', 'UST'];
  const minHistoryDays = parsedFilters.minHistoryDays;
  
  const historyFilterCtx: HistoryFilterContext = {
    minHistoryDays,
    mode,
    krakenService,
  };
  
  const survivors: BatchResult['survivors'] = [];
  let idealSurvivors = 0;
  let rotationalSurvivors = 0;
  
  for (const pair of batch) {
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
    
    let rejected = false;
    
    // Already active check
    if (poolSymbols.has(pair.symbol) || activeTradeSymbols.has(pair.symbol)) {
      breakdown.already_active++;
      continue;
    }
    
    // Filter: Stablecoins
    if (!rejected && excludeStablecoins && stablecoinPatterns.some(p => baseCurrency?.includes(p))) {
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
      });
      
      // Record success to telemetry
      adaptiveScanManager.recordScanResult(pair.symbol, true, {
        finalScore: 0.5,
        pool: pair.poolType,
      });
    } else {
      // Record failure to telemetry
      adaptiveScanManager.recordScanResult(pair.symbol, false, {
        failureReason: 'filter_failed',
        pool: pair.poolType,
      });
    }
  }
  
  const elapsedMs = Date.now() - startTime;
  console.log(`[AdaptiveScan][11.4C.1] Cycle complete in ${elapsedMs}ms: evaluated=${batch.length}, survivors=${survivors.length} (ideal=${idealSurvivors}, rotational=${rotationalSurvivors})`);
  
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
      topNCount: idealSurvivors, // Legacy compatibility: map Ideal → TopN
      tierBCount: rotationalSurvivors, // Legacy compatibility: map Rotational → TierB
      idealCount: idealSurvivors,
      rotationalCount: rotationalSurvivors,
      krakenUniverseSize,
      topEndUniverseSize: adaptiveBatch.idealPairs.length, // Legacy compatibility
      tierBUniverseSize: adaptiveBatch.rotationalPairs.length, // Legacy compatibility
    },
  };
}
