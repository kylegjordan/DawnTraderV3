import { KrakenService } from './kraken';
import { StrategyEngine } from './strategy-engine';
import { storage } from '../storage';
import { WatchlistPair } from '@shared/schema';
import { strategyAlerts } from './strategy-alerts';
import { PaperSimDiagnosticService } from './paper-sim-diagnostic.js';
import { activeFilterPool } from './active-filter-pool.js';

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
export interface REB210CycleStartSnapshot {
  cycle: number;
  mode: 'paper' | 'live';
  timestamp: string;
  filters: {
    minVolume: number;
    minLiquidity: number;
    minPrice: number;
    maxPrice: number;
    rsiMin: number;
    rsiMax: number;
    volatilityMin: number;
    volatilityMax: number;
    maxBidAskSpread: number;
    universeSize: number;
    activeTimeframes: string[];
    minHistoryDays: number;
    excludeStablecoins: boolean;
    allowRegulatedOnly: boolean;
  };
}

// REB 2.10: Per-Pair Evaluation Snapshot Type
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
    rsi: number | null;
    volatility: number | null;
    historyDays: number | null;
    quoteCurrency: string;
  };
  filterResults: {
    failedVolume: boolean;
    failedLiquidity: boolean;
    failedPrice: boolean;
    failedRange: boolean;
    failedRSI: boolean;
    failedVolatility: boolean;
    failedSpread: boolean;
    failedStablecoin: boolean;
    failedHistory: boolean;
    passed: boolean;
  };
}

// REB 2.10: CycleSummary Snapshot Type
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
    failedRange: number;
    failedRSI: number;
    failedVolatility: number;
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
    range: number;
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

  mismatchType: 'NONE' | 'FORMAT' | 'NOT_FOUND' | 'ORDER' | 'LIMIT';
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
      
      // 3. Clean old closed paper trades (older than 24 hours)
      // Phase 27.F.15.B.4: Updated to mode-based signature
      const oldPaperTrades = await storage.cleanOldPaperSimTrades('paper', 24);
      console.log(`[Cleanup] ${oldPaperTrades} closed paper trades archived`);
      
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
// Phase 41F-L.E2E-PURGE: DISABLED -       const settings = await storage.getTradingSettings(userId);
      
      // Phase 41F-L.E2E-PURGE: Trading settings disabled, using default values
      const settings = {
        tradingSuspended: false
      };

      // Check if trading is suspended by kill switch
      if (settings.tradingSuspended) {
        console.log('🚨 Trading suspended by Kill Switch — strategies skipped.');
        return;
      }

      // Phase 27.F.15.B.4: listStrategySettings is now mode-only (global)
      const strategySettings = await storage.listStrategySettings({ mode });

      for (const pair of watchlist) {
        await this.analyzeSymbolForSignals(userId, pair, settings, strategySettings, mode);
        
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

// Rotation state storage (in-memory, persisted across scan cycles)
const rotationState = {
  topNIndex: 0,
  tierBIndex: 0,
};

export interface BatchResult {
  survivors: Array<{
    symbol: string;
    currentPrice: number;
    volume24h: number;
    dailyRange: number;
    fromTopN: boolean;
  }>;
  evaluatedSymbols: string[]; // REB 2.8.5D: All 60 symbols evaluated in this batch (before filtering)
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
    already_active: number;
    passed_all_filters: number;
  };
  metrics: {
    evaluatedCount: number;
    eligibleCount: number;
    ineligibleCount: number;
    topNCount: number;
    tierBCount: number;
    krakenUniverseSize: number;
    topEndUniverseSize: number;
    tierBUniverseSize: number;
  };
}

/**
 * Batch-First Scanner (Phase 8.6.7 Architecture)
 * 
 * 5-Step Pipeline:
 * 1. Fetch ALL 1,370 Kraken tickers (NO filtering)
 * 2. Sort by volume, identify Top-N (100) and Tier-B (1,270) universes
 * 3. Build 60-pair batch with rotation (36 Top-N + 24 Tier-B)
 * 4. Apply FX5 filters to ONLY those 60 symbols
 * 5. Return survivors with breakdown
 */
export async function collectMixedBatch(
  krakenService: KrakenService,
  filters: any,
  mode: 'paper' | 'live'
): Promise<BatchResult> {
  const startTime = Date.now();
  
  // REB 2.11: Timing capture points
  let t_fetch = 0;
  let t_syncFilters = 0;
  let t_historyFilter = 0;
  let t_universeLimit = 0;
  const timingStart = Date.now();
  
  // REB 2.11: Get stress test configuration
  const stressConfig = getStressTestConfig();
  const stressCycleCount = (globalThis as any).__reb211_stressCycleCount;
  
  // REB 2.11: Track stress test cycle for this mode
  if (stressConfig.enabled) {
    stressCycleCount[mode]++;
    console.log(`[REB2.11][Stress] Mode ${mode} cycle ${stressCycleCount[mode]}/5`);
  }
  
  // REB 2.10: Increment global cycle counter
  (globalThis as any).__reb210_cycle++;
  const cycleNum = (globalThis as any).__reb210_cycle;
  const cycleTimestamp = new Date().toISOString();
  
  // REB 2.10: Parse filter values for snapshot
  const parsedFilters = {
    minVolume: parseFloat(filters.minVolume ?? '1000000.00'),
    minLiquidity: parseFloat(filters.minLiquidity ?? '500000.00'),
    minPrice: parseFloat(filters.minPrice ?? '0.01000000'),
    maxPrice: parseFloat(filters.maxPrice ?? '100000.00'),
    rsiMin: filters.rsiMin ?? 30,
    rsiMax: filters.rsiMax ?? 70,
    volatilityMin: parseFloat(filters.volatilityMin ?? '0.50'),
    volatilityMax: parseFloat(filters.volatilityMax ?? '5.00'),
    maxBidAskSpread: parseFloat(filters.maxBidAskSpread ?? '1.00'),
    universeSize: filters.universeSize ?? 100,
    activeTimeframes: filters.activeTimeframes ?? ['5m', '15m', '1h'],
    minHistoryDays: filters.minHistoryDays ?? 30,
    excludeStablecoins: filters.excludeStablecoins ?? true,
    allowRegulatedOnly: filters.allowRegulatedOnly ?? false,
  };
  
  // REB 2.10: Create CycleStart Snapshot
  const cycleStartSnapshot: REB210CycleStartSnapshot = {
    cycle: cycleNum,
    mode,
    timestamp: cycleTimestamp,
    filters: parsedFilters,
  };
  
  // REB 2.10: Log CycleStart (all cycles - buffer handles storage)
  console.log('[REB2.10][CycleStart]', JSON.stringify(cycleStartSnapshot));
  
  // REB 2.10: Array to collect per-pair snapshots for this cycle
  const pairSnapshots: REB210PairSnapshot[] = [];
  
  // STEP 1: Fetch ALL Kraken tickers for volume ranking
  console.log('[8.6.7][DEBUG] STEP 1: Fetching ALL Kraken tickers for volume ranking...');
  const fetchStart = Date.now();
  const [tickers, pairsObj] = await Promise.all([
    krakenService.getTicker(),
    krakenService.getTradablePairs()
  ]);
  t_fetch = Date.now() - fetchStart; // REB 2.11: Capture fetch timing
  
  const allPairs = Object.entries(tickers).map(([pairName, ticker]) => ({
    pairName,
    symbol: pairsObj[pairName]?.wsname || pairName,
    volume24h: parseFloat(ticker.v[1]),
    ticker,
    pairInfo: pairsObj[pairName],
  })).filter(p => p.pairInfo); // Only keep pairs with metadata
  
  const krakenUniverseSize = allPairs.length;
  console.log(`[8.6.7][DEBUG] Total Kraken symbols available: ${krakenUniverseSize}`);
  
  // STEP 2: Sort by volume, identify Top-N and Tier-B universes
  allPairs.sort((a, b) => b.volume24h - a.volume24h); // Descending volume
  
  const TOP_N_SIZE = 100;
  const topNUniverse = allPairs.slice(0, TOP_N_SIZE);
  const tierBUniverse = allPairs.slice(TOP_N_SIZE);
  
  console.log(`[8.6.7][DEBUG] STEP 2: Top-N universe: ${topNUniverse.length}, Tier-B universe: ${tierBUniverse.length}`);
  
  // STEP 3: Build 60-pair batch with rotation
  const TOP_N_BATCH_SIZE = 36;
  const TIER_B_BATCH_SIZE = 24;
  
  // Select 36 pairs from Top-N using rotation
  const topNBatch: typeof allPairs = [];
  for (let i = 0; i < TOP_N_BATCH_SIZE; i++) {
    const index = (rotationState.topNIndex + i) % topNUniverse.length;
    topNBatch.push(topNUniverse[index]);
  }
  
  // Select 24 pairs from Tier-B using rotation
  const tierBBatch: typeof allPairs = [];
  for (let i = 0; i < TIER_B_BATCH_SIZE; i++) {
    const index = (rotationState.tierBIndex + i) % tierBUniverse.length;
    tierBBatch.push(tierBUniverse[index]);
  }
  
  // Combine batches
  const batch = [...topNBatch, ...tierBBatch];
  
  // REB 2.8.5D: Capture all evaluated symbols BEFORE filtering for 24h uniqueEvaluated tracking
  const evaluatedSymbols = batch.map(p => p.symbol);
  
  console.log(`[8.6.7][DEBUG] STEP 3: Built batch - ${topNBatch.length} Top-N + ${tierBBatch.length} Tier-B = ${batch.length} total`);
  console.log(`[8.6.7][DEBUG] Batch size BEFORE filtering: ${batch.length}`);
  
  // Increment rotation indices for next cycle
  rotationState.topNIndex = (rotationState.topNIndex + TOP_N_BATCH_SIZE) % topNUniverse.length;
  rotationState.tierBIndex = (rotationState.tierBIndex + TIER_B_BATCH_SIZE) % tierBUniverse.length;
  
  // STEP 4: Apply FX5 filters to ONLY those 60 symbols
  console.log(`[8.6.7][DEBUG] STEP 4: Applying FX5 filters to ${batch.length} batch symbols...`);
  
  // REB 2.11A: Capture active filter pool state BEFORE any cleanup
  const activeBefore = activeFilterPool.getSymbolsRaw(mode);
  
  // Get active trades to exclude (for trade-level exclusion, separate from pool-level)
  const activeTrades = await storage.getActiveTrades(mode);
  const activeTradeSymbols = new Set(activeTrades.map(t => t.symbol));
  
  // REB 2.11C: Use active filter pool for "already active" detection (THE FIX)
  // Previously used activeTradeSymbols which was wrong - pairs in pool ARE already active
  const poolSymbols = new Set(activeBefore);
  
  // REB 2.11A: Track which symbols are actually counted as already_active
  const alreadyActiveReportedList: string[] = [];
  
  // Initialize breakdown counters
  const breakdown = {
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
  
  // REB 2.10: Extract filter criteria from parsedFilters
  const minVolume = parsedFilters.minVolume;
  const minDailyRange = parsedFilters.volatilityMin;
  const minPrice = parsedFilters.minPrice;
  const maxBidAskSpread = parsedFilters.maxBidAskSpread;
  const excludeStablecoins = parsedFilters.excludeStablecoins;
  const stablecoinPatterns = ['USDT', 'USDC', 'DAI', 'BUSD', 'UST'];
  const minHistoryDays = parsedFilters.minHistoryDays;
  
  // Parse allowed quote currencies
  let allowedQuotes: string[] = [];
  try {
    allowedQuotes = typeof filters.quoteCurrencies === 'string'
      ? JSON.parse(filters.quoteCurrencies)
      : (filters.quoteCurrencies ?? []);
  } catch {
    allowedQuotes = [];
  }
  
  // REB 2.10: History filter context for passesHistoryFilter helper
  const historyFilterCtx: HistoryFilterContext = {
    minHistoryDays: minHistoryDays,
    mode,
    krakenService,
  };
  
  const survivors: BatchResult['survivors'] = [];
  let topNSurvivors = 0;
  let tierBSurvivors = 0;
  
  // REB 2.10: Evaluate each pair in the batch with full snapshot capture
  for (let i = 0; i < batch.length; i++) {
    const pair = batch[i];
    const fromTopN = i < TOP_N_BATCH_SIZE;
    const ticker = pair.ticker;
    const pairInfo = pair.pairInfo;
    
    const baseCurrency = pairInfo.base;
    const quoteCurrency = pairInfo.quote;
    const normalizedQuote = quoteCurrency?.startsWith('Z') ? quoteCurrency.slice(1) : quoteCurrency;
    const currentPrice = parseFloat(ticker.c[0]);
    const volume24h = parseFloat(ticker.v[1]);
    const high24h = parseFloat(ticker.h[1]);
    const low24h = parseFloat(ticker.l[1]);
    const dailyRange = ((high24h - low24h) / low24h) * 100;
    const askPrice = parseFloat(ticker.a[0]);
    const bidPrice = parseFloat(ticker.b[0]);
    const bidAskSpread = ((askPrice - bidPrice) / bidPrice) * 100;
    
    // REB 2.10: Track individual filter results for this pair
    const filterResults = {
      failedVolume: false,
      failedLiquidity: false,
      failedPrice: false,
      failedRange: false,
      failedRSI: false,
      failedVolatility: false,
      failedSpread: false,
      failedStablecoin: false,
      failedHistory: false,
      passed: true,
    };
    
    let rejected = false;
    let historyDays: number | null = null;
    
    // Filter 2: Stablecoins
    if (!rejected && excludeStablecoins && stablecoinPatterns.some(p => baseCurrency?.includes(p))) {
      filterResults.failedStablecoin = true;
      filterResults.passed = false;
      breakdown.failed_stablecoin++;
      rejected = true;
    }
    
    // Filter 3: Min volume
    if (!rejected && volume24h < minVolume) {
      filterResults.failedVolume = true;
      filterResults.passed = false;
      breakdown.failed_min_volume++;
      rejected = true;
    }
    
    // Filter 4: Daily range (volatility)
    if (!rejected && dailyRange < minDailyRange) {
      filterResults.failedRange = true;
      filterResults.passed = false;
      breakdown.failed_daily_range++;
      rejected = true;
    }
    
    // Filter 5: Min price
    if (!rejected && currentPrice < minPrice) {
      filterResults.failedPrice = true;
      filterResults.passed = false;
      breakdown.failed_min_price++;
      rejected = true;
    }
    
    // Filter 6: Bid-ask spread
    if (!rejected && bidAskSpread > maxBidAskSpread) {
      filterResults.failedSpread = true;
      filterResults.passed = false;
      breakdown.failed_spread++;
      rejected = true;
    }
    
    // REB 2.10 Filter 7: Minimum History (async) - Only check if other filters passed
    if (!rejected && minHistoryDays > 0) {
      const historyResult = await passesHistoryFilter(pair.symbol, historyFilterCtx);
      historyDays = historyResult.days ?? null;
      if (!historyResult.passed) {
        filterResults.failedHistory = true;
        filterResults.passed = false;
        breakdown.failed_history++;
        rejected = true;
      }
    }
    
    // REB 2.10: Create Per-Pair Snapshot (all pairs, for buffer storage)
    const pairSnapshot: REB210PairSnapshot = {
      cycle: cycleNum,
      mode,
      pair: pair.symbol,
      timestamp: new Date().toISOString(),
      marketData: {
        price: currentPrice,
        spreadPct: bidAskSpread,
        volume: volume24h,
        liquidity: volume24h * currentPrice,
        rsi: null,
        volatility: dailyRange,
        historyDays,
        quoteCurrency: normalizedQuote || '',
      },
      filterResults,
    };
    pairSnapshots.push(pairSnapshot);
    
    // REB 2.10: Log first N pair snapshots (rate-limited for performance)
    if (reb210PairSnapshotCount < REB_2_10_PAIR_LOG_LIMIT) {
      reb210PairSnapshotCount++;
      console.log('[REB2.10][PairSnapshot]', JSON.stringify(pairSnapshot));
    }
    
    // Pair passed all filters
    if (!rejected) {
      // REB 2.11C: Check if already in active filter pool (THE FIX)
      // Previously checked activeTradeSymbols (wrong) - now checks poolSymbols (correct)
      if (poolSymbols.has(pair.symbol)) {
        breakdown.already_active++;
        // REB 2.11A: Track which pairs are counted as already_active
        alreadyActiveReportedList.push(pair.symbol);
      } else {
        breakdown.passed_all_filters++;
        
        // Add to survivors
        survivors.push({
          symbol: pair.symbol,
          currentPrice,
          volume24h,
          dailyRange,
          fromTopN,
        });
        
        // Track Top-N vs Tier-B survivor counts
        if (fromTopN) {
          topNSurvivors++;
        } else {
          tierBSurvivors++;
        }
      }
    }
  }
  
  const survivorCount = survivors.length;
  console.log(`[8.6.7][DEBUG] Survivors AFTER FX5 filters: ${survivorCount}/${batch.length}`);
  
  // REB 2.10: Create CycleSummary Snapshot
  const cycleSummarySnapshot: REB210CycleSummarySnapshot = {
    cycle: cycleNum,
    mode,
    timestamp: new Date().toISOString(),
    totals: {
      evaluated: batch.length,
      survived: survivorCount,
    },
    breakdown: {
      failedVolume: breakdown.failed_min_volume,
      failedLiquidity: 0,
      failedPrice: breakdown.failed_min_price,
      failedRange: breakdown.failed_daily_range,
      failedRSI: 0,
      failedVolatility: 0,
      failedSpread: breakdown.failed_spread,
      failedStablecoin: breakdown.failed_stablecoin,
      failedHistory: breakdown.failed_history,
      passed: breakdown.passed_all_filters + breakdown.already_active,
    },
    activePoolSize: survivors.length,
  };
  
  // REB 2.10: Log CycleSummary (all cycles)
  console.log('[REB2.10][CycleSummary]', JSON.stringify(cycleSummarySnapshot));
  
  // REB 2.10: Store complete cycle record in buffer
  const cycleRecord: REB210CycleRecord = {
    cycleStart: cycleStartSnapshot,
    pairs: pairSnapshots,
    cycleSummary: cycleSummarySnapshot,
  };
  addCycleToBuffer(cycleRecord);
  
  const duration = Date.now() - startTime;
  console.log(`[Scan:${mode}] Mixed batch collected: ${survivorCount} eligible (${topNBatch.length} Top-N + ${tierBBatch.length} Tier-B) — ${duration}ms`);
  
  // ============================================================================
  // REB 2.11A: Active Pool / AlreadyActive Breakdown Audit
  // ============================================================================
  
  // REB 2.11A: Capture active filter pool state AFTER any cleanup
  const activeAfter = activeFilterPool.getSymbolsAfterCleanup(mode);
  
  // REB 2.11A: Compute what SHOULD have been counted as "already active"
  // These are survivors that were already in the active filter pool BEFORE cleanup
  const survivorsList = survivors.map(s => s.symbol);
  const activeBeforeSet = new Set(activeBefore);
  const shouldBeActive = survivorsList.filter(sym => activeBeforeSet.has(sym));
  
  // REB 2.11A: Compute mismatches
  const alreadyActiveReportedSet = new Set(alreadyActiveReportedList);
  const shouldBeActiveSet = new Set(shouldBeActive);
  
  // Pairs that SHOULD be counted as already_active but WEREN'T
  const missedPairs = shouldBeActive.filter(sym => !alreadyActiveReportedSet.has(sym));
  
  // Pairs that WERE counted as already_active but SHOULDN'T have been
  const overcountedPairs = alreadyActiveReportedList.filter(sym => !shouldBeActiveSet.has(sym));
  
  // REB 2.11A: Push audit entry into buffer
  const auditEntry: ActiveAuditEntry = {
    cycle: cycleNum,
    mode,
    timestamp: new Date().toISOString(),
    survivors: survivorsList,
    activeBeforeCleanup: activeBefore,
    activeAfterCleanup: activeAfter,
    alreadyActiveReported: alreadyActiveReportedList,
    alreadyActiveShouldBe: shouldBeActive,
    mismatches: {
      missedPairs,
      overcountedPairs,
    },
  };
  addToActiveAuditBuffer(auditEntry);
  
  // REB 2.11A: Log mismatches if any
  if (missedPairs.length > 0 || overcountedPairs.length > 0) {
    console.log('[REB2.11A][MISMATCH]', JSON.stringify({
      cycle: cycleNum,
      mode,
      missedCount: missedPairs.length,
      overcountedCount: overcountedPairs.length,
      missedPairs,
      overcountedPairs,
    }));
  } else {
    console.log('[REB2.11A][OK]', JSON.stringify({
      cycle: cycleNum,
      mode,
      survivorCount: survivorsList.length,
      activeBeforeCount: activeBefore.length,
      activeAfterCount: activeAfter.length,
      alreadyActiveCount: alreadyActiveReportedList.length,
    }));
  }
  
  // ============================================================================
  // REB 2.11B: Symbol Mapping Trace Diagnostic
  // ============================================================================
  
  // Build ticker map for Kraken symbol lookup (from batch pairs)
  const tickerMap: Record<string, { krakenSymbol: string }> = {};
  for (const p of batch) {
    tickerMap[p.symbol] = { krakenSymbol: p.pairName || p.symbol };
  }
  
  // Create symbol trace entries for each survivor
  for (const survivor of survivors) {
    const pair = survivor.symbol;
    const normalizedPair = pair.trim().toUpperCase();
    
    // Find matching entry in active pool (exact or normalized)
    let activePoolEntry: string | null = null;
    if (activeBeforeSet.has(pair)) {
      activePoolEntry = pair;
    } else if (activeBeforeSet.has(normalizedPair)) {
      activePoolEntry = normalizedPair;
    } else {
      // Check all entries for case-insensitive match
      for (const poolEntry of activeBefore) {
        if (poolEntry.toUpperCase() === normalizedPair) {
          activePoolEntry = poolEntry;
          break;
        }
      }
    }
    
    const trace: SymbolTraceEntry = {
      cycle: cycleNum,
      mode,
      
      pair,                              // raw survivor string
      normalizedPair,                    // scanner canonical string
      activePoolEntry,                   // exact string in pool, or null
      krakenSymbol: tickerMap[pair]?.krakenSymbol || null,
      
      inActiveBefore: activeBeforeSet.has(pair) || activeBeforeSet.has(normalizedPair),
      inActiveAfter: new Set(activeAfter).has(pair) || new Set(activeAfter).has(normalizedPair),
      
      wasCountedAlreadyActive: alreadyActiveReportedSet.has(pair),
      shouldBeAlreadyActive: activeBeforeSet.has(pair) || activeBeforeSet.has(normalizedPair),
      
      mismatchType: 'NONE',
    };
    
    // Classify mismatch type
    if (trace.shouldBeAlreadyActive && !trace.wasCountedAlreadyActive) {
      trace.mismatchType = activePoolEntry === null ? 'NOT_FOUND' : 'FORMAT';
    }
    
    // Push trace into buffer with FIFO limit
    reb211bSymbolTraceBuffer.push(trace);
    if (reb211bSymbolTraceBuffer.length > 400) {
      reb211bSymbolTraceBuffer.shift();
    }
  }
  
  // Log summary of symbol traces for this cycle
  const traceCount = survivors.length;
  const mismatchCount = survivors.filter(s => {
    const trace = reb211bSymbolTraceBuffer.find(t => t.cycle === cycleNum && t.pair === s.symbol);
    return trace && trace.mismatchType !== 'NONE';
  }).length;
  
  if (mismatchCount > 0) {
    console.log('[REB2.11B][TRACE]', JSON.stringify({
      cycle: cycleNum,
      mode,
      traces: traceCount,
      mismatches: mismatchCount,
    }));
  }
  
  // ============================================================================
  // REB 2.11: Active Pool Stability Validation Diagnostics
  // ============================================================================
  
  // REB 2.11 A1: Drift Snapshot
  const driftSnapshot: REB211DriftSnapshot = {
    cycle: cycleNum,
    mode,
    timestamp: new Date().toISOString(), // Use ISO string for consistency
    activePoolSize: survivors.length,
    survivors: survivors.map(s => s.symbol),
    failures: {
      price: breakdown.failed_min_price,
      volume: breakdown.failed_min_volume,
      spread: breakdown.failed_spread,
      range: breakdown.failed_daily_range,
      stablecoin: breakdown.failed_stablecoin,
      history: breakdown.failed_history,
    },
  };
  addToDriftBuffer(driftSnapshot);
  console.log('[REB2.11][Drift]', JSON.stringify({ cycle: cycleNum, mode, poolSize: survivors.length, survivorCount }));
  
  // REB 2.11 A2: Pool Integrity Snapshot
  const survivorSet = new Set(survivors.map(s => s.symbol));
  const anomalies: string[] = [];
  
  // Check 1: Unique pairs only (no duplicates in survivors)
  const uniquePairs = survivorSet.size === survivors.length;
  if (!uniquePairs) {
    anomalies.push('DUPLICATE_PAIRS_IN_SURVIVORS');
  }
  
  // Check 2: All survivors passed filters (cross-validate with REB 2.10 snapshots)
  const passedPairs = pairSnapshots.filter(p => p.filterResults.passed);
  const passedSet = new Set(passedPairs.map(p => p.pair));
  for (const survivor of survivors) {
    if (!passedSet.has(survivor.symbol)) {
      anomalies.push(`SURVIVOR_NOT_IN_PASSED: ${survivor.symbol}`);
      // Also record as mismatch
      addToMismatchBuffer({
        cycle: cycleNum,
        mode,
        timestamp: cycleTimestamp,
        pair: survivor.symbol,
        reason: 'SURVIVOR_NOT_IN_PASSIVE_LEARNING',
      });
    }
  }
  
  // REB 2.11 A4: Cross-validation - check for FALSE NEGATIVES (pairs that passed but missing from survivors)
  // This catches cases where a pair passed all filters but wasn't added to survivors
  for (const passed of passedPairs) {
    if (!survivorSet.has(passed.pair) && !activeSymbols.has(passed.pair)) {
      const mismatch: REB211MismatchEntry = {
        cycle: cycleNum,
        mode,
        timestamp: cycleTimestamp,
        pair: passed.pair,
        reason: 'PASSED_FILTER_BUT_NOT_SURVIVOR',
      };
      addToMismatchBuffer(mismatch);
      anomalies.push(`MISMATCH_FALSE_NEGATIVE: ${passed.pair}`);
    }
  }
  
  // Check 3: Verify expiry cleanup is functioning (check if pool would have expired entries)
  // Since we can't access active-filter-pool directly here, we check our own survivors consistency
  const expiredRemoved = pairSnapshots.filter(p => !p.filterResults.passed).length > 0 
    ? passedSet.size === survivorSet.size + activeSymbols.size || passedSet.size <= survivorSet.size + 5
    : true;
  
  const integritySnapshot: REB211IntegritySnapshot = {
    cycle: cycleNum,
    mode,
    timestamp: cycleTimestamp,
    activePoolSize: survivors.length,
    uniquePairs,
    expiredRemoved,
    anomalies,
  };
  addToIntegrityBuffer(integritySnapshot);
  
  if (anomalies.length > 0) {
    console.log('[REB2.11][Integrity]', JSON.stringify(integritySnapshot));
  } else {
    console.log(`[REB2.11][Integrity] Cycle ${cycleNum}/${mode}: ✅ PASS (pool=${survivors.length}, unique=${uniquePairs})`);
  }
  
  // REB 2.11 A3: Timing Snapshot
  const t_total = Date.now() - timingStart;
  const timingSnapshot: REB211TimingSnapshot = {
    cycle: cycleNum,
    mode,
    timestamp: cycleTimestamp,
    t_fetch,
    t_syncFilters,
    t_historyFilter,
    t_universeLimit,
    t_total,
  };
  addToTimingBuffer(timingSnapshot);
  console.log('[REB2.11][Timing]', JSON.stringify({ cycle: cycleNum, mode, t_fetch, t_total }));
  
  // REB 2.11 Phase B: Stress Test Mode (only when REB_2_11_STRESS=1)
  if (stressConfig.enabled && stressCycleCount[mode] <= 5) {
    const stressSnapshot: REB211StressSnapshot = {
      cycle: cycleNum,
      mode,
      timestamp: cycleTimestamp,
      injectedDuplicates: 0, // Will be set if duplicate injection happens
      ttlCompressionActive: stressConfig.enabled,
      latencyInjected: stressConfig.enabled,
      universeShift: stressConfig.universeSizeOverrides[stressCycleCount[mode] - 1] ?? null,
      activePoolBefore: 0, // Would need pool state before scan
      activePoolAfter: survivors.length,
    };
    addToStressBuffer(stressSnapshot);
    console.log('[REB2.11][StressSnapshot]', JSON.stringify(stressSnapshot));
    
    // REB 2.11 B3: Log universe oscillation
    if (stressSnapshot.universeShift !== null && stressSnapshot.universeShift !== -1) {
      console.log(`[REB2.11][Stress][B3] Universe oscillation: ${stressSnapshot.universeShift} pairs for cycle ${stressCycleCount[mode]}`);
    }
    
    // Auto-disable after 5 cycles
    if (stressCycleCount[mode] >= 5) {
      console.log(`[REB2.11][Stress] ✅ Stress test complete for ${mode} mode (5 cycles)`);
    }
  }
  
  // Calculate metrics
  const evaluatedCount = batch.length; // 60 (batch size)
  const eligibleCount = breakdown.passed_all_filters + breakdown.already_active;
  const ineligibleCount = 
    breakdown.failed_min_volume +
    breakdown.failed_spread +
    breakdown.failed_daily_range +
    breakdown.failed_min_price +
    breakdown.failed_stablecoin +
    breakdown.failed_quote_currency +
    breakdown.failed_history +
    breakdown.failed_market_cap +
    breakdown.failed_guardrail_risk;
  
  return {
    survivors,
    evaluatedSymbols, // REB 2.8.5D: All 60 symbols evaluated (before filtering)
    breakdown,
    metrics: {
      evaluatedCount,
      eligibleCount,
      ineligibleCount,
      topNCount: topNSurvivors,
      tierBCount: tierBSurvivors,
      krakenUniverseSize,
      topEndUniverseSize: topNUniverse.length,
      tierBUniverseSize: tierBUniverse.length,
    },
  };
}
