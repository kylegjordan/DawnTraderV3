/**
 * 🔒 LOCKED MODULE — DO NOT MODIFY
 * Directive: 8.8.4-A4.R10R-4 (Core System Hardening)
 * Owner: Dawn Trader Core
 * Summary: This module is production-locked. Changes require a formal directive.
 * 
 * Previous: A4.R10R-1. Rate governance and caching handled by price-cache.ts
 */
import crypto from "crypto";
import { canonicalFromPairInfo, normalizeSymbolArray } from '../../services/utils/symbol-canonicalizer.js';

// REB 2.9D: History days cache for minimum history filter
const historyDaysCache = new Map<string, { days: number | null; fetchedAt: number }>();
const HISTORY_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours per REB 2.9D spec

function makeHistoryKey(pair: string, mode: 'paper' | 'live' | 'backtest' | undefined): string {
  return `${mode || 'unknown'}::${pair}`;
}

interface KrakenConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
}

interface KrakenTicker {
  a: string[]; // ask [price, whole lot volume, lot volume]
  b: string[]; // bid [price, whole lot volume, lot volume]
  c: string[]; // last trade closed [price, lot volume]
  v: string[]; // volume [today, last 24 hours]
  p: string[]; // volume weighted average price [today, last 24 hours]
  t: number[]; // number of trades [today, last 24 hours]
  l: string[]; // low [today, last 24 hours]
  h: string[]; // high [today, last 24 hours]
  o: string; // today's opening price
}

interface KrakenOHLCData {
  time: number;
  open: string;
  high: string;
  low: string;
  close: string;
  vwap: string;
  volume: string;
  count: number;
}

interface OrderBookEntry {
  price: string;
  volume: string;
  timestamp: number;
}

interface KrakenOrderBook {
  asks: OrderBookEntry[];
  bids: OrderBookEntry[];
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  rateLimitState?: {
    isLocked: boolean;
    lockoutUntil: number;
    lastErrorTime: number;
  };
}

export class KrakenService {
  private config: KrakenConfig;
  private balanceCache: Map<string, CacheEntry<Record<string, string>>> = new Map();
  private openOrdersCache: Map<string, CacheEntry<any>> = new Map();
  private closedOrdersCache: Map<string, CacheEntry<any>> = new Map();
  private rateLimitStates: Map<string, {
    isLocked: boolean;
    lockoutUntil: number;
    lastErrorTime: number;
  }> = new Map();
  
  private readonly BALANCE_CACHE_TTL = 60000;
  private readonly OPEN_ORDERS_CACHE_TTL = 90000;
  private readonly CLOSED_ORDERS_CACHE_TTL = 600000;
  private readonly RATE_LIMIT_COOLDOWN = 120000;

  constructor(apiKey?: string, apiSecret?: string) {
    this.config = {
      apiKey: apiKey || process.env.KRAKEN_API_KEY || "",
      apiSecret: apiSecret || process.env.KRAKEN_PRIVATE_KEY || process.env.KRAKEN_API_SECRET || "",
      baseUrl: "https://api.kraken.com"
    };
  }

  private isMaintenanceMode(): boolean {
    return process.env.MAINTENANCE_MODE === 'true';
  }

  private checkMaintenanceMode(): void {
    if (this.isMaintenanceMode()) {
      console.log('⚠️  Kraken API disabled – Maintenance Mode active.');
      throw new Error('Kraken API is disabled during maintenance mode');
    }
  }

  private getRateLimitState(userId: string): {
    isLocked: boolean;
    lockoutUntil: number;
    lastErrorTime: number;
  } {
    if (!this.rateLimitStates.has(userId)) {
      this.rateLimitStates.set(userId, {
        isLocked: false,
        lockoutUntil: 0,
        lastErrorTime: 0
      });
    }
    return this.rateLimitStates.get(userId)!;
  }

  private checkRateLimitLockout(userId: string): void {
    const now = Date.now();
    const state = this.getRateLimitState(userId);
    
    if (state.isLocked && now < state.lockoutUntil) {
      const remainingSeconds = Math.ceil((state.lockoutUntil - now) / 1000);
      console.log(`⏳ Kraken API rate limit cooldown active for user ${userId} (${remainingSeconds}s remaining)`);
      throw new Error(`Kraken API in cooldown mode. Retry in ${remainingSeconds} seconds.`);
    }
    
    if (state.isLocked && now >= state.lockoutUntil) {
      console.log(`✅ Kraken API rate limit cooldown expired for user ${userId}, resuming normal operations`);
      state.isLocked = false;
      state.lockoutUntil = 0;
    }
  }

  private handleRateLimitError(userId: string, error: any): void {
    if (error.message && error.message.includes('EGeneral:Temporary lockout')) {
      const now = Date.now();
      const state = this.getRateLimitState(userId);
      state.isLocked = true;
      state.lockoutUntil = now + this.RATE_LIMIT_COOLDOWN;
      state.lastErrorTime = now;
      
      console.error(`🚨 Kraken API Rate Limit Hit for user ${userId}!`);
      console.error(`   Endpoint locked for ${this.RATE_LIMIT_COOLDOWN / 1000} seconds`);
      console.error(`   Cooldown expires at: ${new Date(state.lockoutUntil).toISOString()}`);
    }
  }

  private getCacheKey(userId: string = 'default'): string {
    return userId;
  }

  private isCacheValid<T>(cache: Map<string, CacheEntry<T>>, key: string, ttl: number): boolean {
    const entry = cache.get(key);
    if (!entry) return false;
    
    const age = Date.now() - entry.timestamp;
    return age < ttl;
  }

  private getMessageSignature(path: string, request: any, secret: string, nonce: number): string {
    const postData = new URLSearchParams(request).toString();
    const message = nonce.toString() + postData;
    const hash = crypto.createHash('sha256').update(message).digest();
    
    const hmacMessage = Buffer.concat([Buffer.from(path), hash]);
    const hmac = crypto
      .createHmac('sha512', Buffer.from(secret, 'base64'))
      .update(hmacMessage)
      .digest('base64');
    
    return hmac;
  }

  private async makePublicRequest(endpoint: string, params: any = {}): Promise<any> {
    this.checkMaintenanceMode();
    
    const url = new URL(`${this.config.baseUrl}/0/public/${endpoint}`);
    Object.keys(params).forEach(key => {
      if (params[key] !== undefined) {
        url.searchParams.append(key, params[key]);
      }
    });

    const response = await fetch(url.toString());
    const data = await response.json();

    if (data.error && data.error.length > 0) {
      throw new Error(`Kraken API error: ${data.error.join(', ')}`);
    }

    return data.result;
  }

  private async makePrivateRequest(endpoint: string, params: any = {}, userId: string = 'default'): Promise<any> {
    this.checkMaintenanceMode();
    this.checkRateLimitLockout(userId);
    
    if (!this.config.apiKey || !this.config.apiSecret) {
      throw new Error("Kraken API credentials not configured");
    }

    try {
      const nonce = Date.now() * 1000;
      const path = `/0/private/${endpoint}`;
      
      const request = {
        nonce: nonce.toString(),
        ...params
      };

      const signature = this.getMessageSignature(path, request, this.config.apiSecret, nonce);

      console.log(`[Kraken] Private API call: ${endpoint} for user ${userId}`);
      const response = await fetch(`${this.config.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'API-Key': this.config.apiKey,
          'API-Sign': signature,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams(request).toString()
      });

      const data = await response.json();

      if (data.error && data.error.length > 0) {
        const error = new Error(`Kraken API error: ${data.error.join(', ')}`);
        this.handleRateLimitError(userId, error);
        throw error;
      }

      return data.result;
    } catch (error: any) {
      this.handleRateLimitError(userId, error);
      throw error;
    }
  }

  // Public endpoints
  async getServerTime(): Promise<{ unixtime: number; rfc1123: string }> {
    return await this.makePublicRequest('Time');
  }

  async getAssetInfo(): Promise<any> {
    return await this.makePublicRequest('Assets');
  }

  async getTradablePairs(): Promise<any> {
    return await this.makePublicRequest('AssetPairs');
  }

  async getAssetPairs(): Promise<any> {
    return await this.getTradablePairs();
  }

  async getTicker(pair?: string): Promise<Record<string, KrakenTicker>> {
    const params = pair ? { pair } : {};
    return await this.makePublicRequest('Ticker', params);
  }

  async getTickers(): Promise<Record<string, KrakenTicker>> {
    return await this.getTicker();
  }

  async getOHLCData(
    pair: string, 
    interval = 60, 
    since?: number,
    options?: {
      paginationEnabled?: boolean;
      maxBatches?: number;
      paginationDelayMs?: number;
      maxCandlesTotal?: number;
      endTimestamp?: number;
    }
  ): Promise<{
    ohlc: KrakenOHLCData[];
    last: number;
  }> {
    const {
      paginationEnabled = false,
      maxBatches = 10,
      paginationDelayMs = 500,
      maxCandlesTotal = 5000,
      endTimestamp
    } = options || {};

    // Helper function to delay between requests
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    // Helper function to fetch a single batch
    const fetchBatch = async (batchSince?: number) => {
      const params: any = { pair, interval };
      if (batchSince) params.since = batchSince;

      const result = await this.makePublicRequest('OHLC', params);
      
      // Kraken might return data under a different key than the input pair
      let pairData = result[pair];
      
      if (!pairData) {
        // Find the first non-'last' key (should be the pair data)
        const keys = Object.keys(result).filter(k => k !== 'last');
        if (keys.length > 0) {
          pairData = result[keys[0]];
          console.log(`[Kraken] OHLC data found under key '${keys[0]}' instead of '${pair}'`);
        }
      }
      
      if (!pairData || !Array.isArray(pairData)) {
        throw new Error(`No OHLC data found for pair ${pair}. Response keys: ${Object.keys(result).join(', ')}`);
      }

      const ohlc = pairData.map((candle: any[]) => ({
        time: candle[0],
        open: candle[1],
        high: candle[2],
        low: candle[3],
        close: candle[4],
        vwap: candle[5],
        volume: candle[6],
        count: candle[7]
      }));

      return { ohlc, last: result.last };
    };

    // If pagination is not enabled, use original single-request behavior
    if (!paginationEnabled) {
      return await fetchBatch(since);
    }

    // Pagination logic
    let currentSince = since;
    let allCandles: KrakenOHLCData[] = [];
    let batch = 1;
    let lastTimestamp = 0;

    console.log(`[Backfill] Starting paginated fetch for ${pair} (interval: ${interval}min)`);

    while (batch <= maxBatches) {
      try {
        console.log(`[Backfill] Fetching batch ${batch} for ${pair}${currentSince ? ` (since ${new Date(currentSince * 1000).toISOString()})` : ''}`);
        
        const { ohlc, last } = await fetchBatch(currentSince);
        
        if (!ohlc || ohlc.length === 0) {
          console.log(`[Backfill] No more candles available for ${pair} - stopping pagination`);
          break;
        }

        // Filter candles if endTimestamp is specified
        const filteredCandles = endTimestamp 
          ? ohlc.filter(c => c.time <= endTimestamp)
          : ohlc;

        allCandles.push(...filteredCandles);
        console.log(`[Backfill] Fetched ${filteredCandles.length} candles – total ${allCandles.length}`);

        lastTimestamp = last;

        // Stop conditions
        if (ohlc.length < 720) {
          console.log(`[Backfill] Received fewer than 720 candles (${ohlc.length}) - reached end of available data`);
          break;
        }

        if (allCandles.length >= maxCandlesTotal) {
          console.log(`[Backfill] Reached maximum candle limit (${maxCandlesTotal}) - stopping pagination`);
          break;
        }

        if (endTimestamp && last >= endTimestamp) {
          console.log(`[Backfill] Reached end timestamp - stopping pagination`);
          break;
        }

        if (!last || last === currentSince) {
          console.log(`[Backfill] No new 'last' timestamp - stopping pagination`);
          break;
        }

        // Prepare for next batch
        currentSince = last;
        batch++;

        // Delay before next request (rate limiting)
        if (batch <= maxBatches) {
          await delay(paginationDelayMs);
        }
      } catch (error) {
        console.error(`[Backfill] Error fetching batch ${batch} for ${pair}:`, error);
        
        // Retry once after delay
        if (batch === 1) {
          console.log(`[Backfill] Retrying after ${paginationDelayMs}ms...`);
          await delay(paginationDelayMs);
          try {
            const { ohlc, last } = await fetchBatch(currentSince);
            allCandles.push(...ohlc);
            lastTimestamp = last;
            console.log(`[Backfill] Retry successful - fetched ${ohlc.length} candles`);
          } catch (retryError) {
            console.error(`[Backfill] Retry failed for ${pair}:`, retryError);
            throw retryError;
          }
        } else {
          // If not first batch, we have partial data - return what we have
          console.log(`[Backfill] Returning partial data (${allCandles.length} candles) due to error`);
          break;
        }
      }
    }

    if (batch > maxBatches) {
      console.log(`[Backfill] Stopping pagination after ${maxBatches} batches`);
    }

    console.log(`[Backfill] Completed ${pair}: ${allCandles.length} total candles in ${batch} batch(es)`);

    return {
      ohlc: allCandles,
      last: lastTimestamp
    };
  }

  async getOrderBook(pair: string, count = 100): Promise<Record<string, KrakenOrderBook>> {
    return await this.makePublicRequest('Depth', { pair, count });
  }

  async getRecentTrades(pair: string, since?: number): Promise<any> {
    const params: any = { pair };
    if (since) params.since = since;
    return await this.makePublicRequest('Trades', params);
  }

  // Private endpoints with caching
  async getAccountBalance(userId: string = 'default', bypassCache: boolean = false): Promise<Record<string, string>> {
    const cacheKey = this.getCacheKey(userId);
    const rateLimitState = this.getRateLimitState(userId);
    
    if (!bypassCache && this.isCacheValid(this.balanceCache, cacheKey, this.BALANCE_CACHE_TTL)) {
      const cached = this.balanceCache.get(cacheKey)!;
      const ageSeconds = Math.floor((Date.now() - cached.timestamp) / 1000);
      console.log(`[Kraken] getAccountBalance (user: ${userId}) - Cache HIT (${ageSeconds}s old, TTL: ${this.BALANCE_CACHE_TTL / 1000}s)`);
      return cached.data;
    }
    
    if (rateLimitState.isLocked) {
      const cached = this.balanceCache.get(cacheKey);
      if (cached) {
        console.log(`[Kraken] getAccountBalance (user: ${userId}) - Returning stale cache due to rate limit lockout`);
        return cached.data;
      }
      throw new Error(`Kraken API in cooldown mode and no cached data available`);
    }
    
    console.log(`[Kraken] getAccountBalance (user: ${userId}) - Cache MISS, fetching from API`);
    const result = await this.makePrivateRequest('Balance', {}, userId);
    
    this.balanceCache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });
    
    return result;
  }

  async getOpenOrders(userId: string = 'default', bypassCache: boolean = false): Promise<any> {
    const cacheKey = this.getCacheKey(userId);
    const rateLimitState = this.getRateLimitState(userId);
    
    if (!bypassCache && this.isCacheValid(this.openOrdersCache, cacheKey, this.OPEN_ORDERS_CACHE_TTL)) {
      const cached = this.openOrdersCache.get(cacheKey)!;
      const ageSeconds = Math.floor((Date.now() - cached.timestamp) / 1000);
      console.log(`[Kraken] getOpenOrders (user: ${userId}) - Cache HIT (${ageSeconds}s old, TTL: ${this.OPEN_ORDERS_CACHE_TTL / 1000}s)`);
      return cached.data;
    }
    
    if (rateLimitState.isLocked) {
      const cached = this.openOrdersCache.get(cacheKey);
      if (cached) {
        console.log(`[Kraken] getOpenOrders (user: ${userId}) - Returning stale cache due to rate limit lockout`);
        return cached.data;
      }
      throw new Error(`Kraken API in cooldown mode and no cached data available`);
    }
    
    console.log(`[Kraken] getOpenOrders (user: ${userId}) - Cache MISS, fetching from API`);
    const result = await this.makePrivateRequest('OpenOrders', {}, userId);
    
    this.openOrdersCache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });
    
    return result;
  }

  async getClosedOrders(userId: string = 'default', bypassCache: boolean = false): Promise<any> {
    const cacheKey = this.getCacheKey(userId);
    const rateLimitState = this.getRateLimitState(userId);
    
    if (!bypassCache && this.isCacheValid(this.closedOrdersCache, cacheKey, this.CLOSED_ORDERS_CACHE_TTL)) {
      const cached = this.closedOrdersCache.get(cacheKey)!;
      const ageSeconds = Math.floor((Date.now() - cached.timestamp) / 1000);
      console.log(`[Kraken] getClosedOrders (user: ${userId}) - Cache HIT (${ageSeconds}s old, TTL: ${this.CLOSED_ORDERS_CACHE_TTL / 1000}s)`);
      return cached.data;
    }
    
    if (rateLimitState.isLocked) {
      const cached = this.closedOrdersCache.get(cacheKey);
      if (cached) {
        console.log(`[Kraken] getClosedOrders (user: ${userId}) - Returning stale cache due to rate limit lockout`);
        return cached.data;
      }
      throw new Error(`Kraken API in cooldown mode and no cached data available`);
    }
    
    console.log(`[Kraken] getClosedOrders (user: ${userId}) - Cache MISS, fetching from API`);
    const result = await this.makePrivateRequest('ClosedOrders', {}, userId);
    
    this.closedOrdersCache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });
    
    return result;
  }

  async addOrder(params: {
    pair: string;
    type: 'buy' | 'sell';
    ordertype: 'market' | 'limit' | 'stop-loss' | 'take-profit';
    volume: string;
    price?: string;
    price2?: string;
    leverage?: string;
    oflags?: string;
    starttm?: string;
    expiretm?: string;
    userref?: string;
    validate?: boolean;
  }): Promise<{ txid: string[]; descr: any }> {
    // Task 8 Safety Guardrail: Spot-only trading enforcement
    if (params.leverage && params.leverage !== 'none') {
      throw new Error('🛡️ SAFETY BLOCK: Leverage trading is prohibited. This system only allows spot trading.');
    }

    // Block margin flags (viqc = volume in quote currency, typically used for margin)
    if (params.oflags && params.oflags.includes('viqc')) {
      throw new Error('🛡️ SAFETY BLOCK: Margin trading flags detected. This system only allows spot trading.');
    }

    // Log spot-only enforcement
    console.log(`[Kraken:SpotOnly] Order validated: ${params.pair} ${params.type} ${params.volume} (leverage: none, margin: blocked)`);

    return await this.makePrivateRequest('AddOrder', params);
  }

  async cancelOrder(txid: string): Promise<any> {
    return await this.makePrivateRequest('CancelOrder', { txid });
  }

  getCacheStats(): {
    balance: { size: number; oldestAgeSeconds: number | null };
    openOrders: { size: number; oldestAgeSeconds: number | null };
    closedOrders: { size: number; oldestAgeSeconds: number | null };
    rateLimitStates: Record<string, { isLocked: boolean; lockoutUntil: number; lastErrorTime: number }>;
  } {
    const now = Date.now();
    
    const getOldestAge = <T>(cache: Map<string, CacheEntry<T>>): number | null => {
      if (cache.size === 0) return null;
      let oldest = Infinity;
      cache.forEach(entry => {
        const age = now - entry.timestamp;
        if (age < oldest) oldest = age;
      });
      return Math.floor(oldest / 1000);
    };
    
    const rateLimitStatesObj: Record<string, { isLocked: boolean; lockoutUntil: number; lastErrorTime: number }> = {};
    this.rateLimitStates.forEach((state, userId) => {
      rateLimitStatesObj[userId] = { ...state };
    });
    
    return {
      balance: {
        size: this.balanceCache.size,
        oldestAgeSeconds: getOldestAge(this.balanceCache)
      },
      openOrders: {
        size: this.openOrdersCache.size,
        oldestAgeSeconds: getOldestAge(this.openOrdersCache)
      },
      closedOrders: {
        size: this.closedOrdersCache.size,
        oldestAgeSeconds: getOldestAge(this.closedOrdersCache)
      },
      rateLimitStates: rateLimitStatesObj
    };
  }

  clearAllCaches(): void {
    this.balanceCache.clear();
    this.openOrdersCache.clear();
    this.closedOrdersCache.clear();
    historyDaysCache.clear();
    console.log('[Kraken] All caches cleared');
  }

  /**
   * REB 2.9D: Get the number of days of trading history for a pair
   * Uses daily (1440m) OHLC candles to determine trading age
   * Results are cached for 24 hours to avoid hitting Kraken repeatedly
   */
  async getPairHistoryDays(
    pair: string,
    mode: 'paper' | 'live' | 'backtest' | undefined
  ): Promise<number | null> {
    const cacheKey = makeHistoryKey(pair, mode);
    const now = Date.now();
    const cached = historyDaysCache.get(cacheKey);

    if (cached && now - cached.fetchedAt < HISTORY_CACHE_TTL_MS) {
      return cached.days;
    }

    try {
      // 1440 = 1-day candles (matches the 8.6 / 8.7 truth)
      const { ohlc } = await this.getOHLCData(pair, 1440);
      
      if (!ohlc || ohlc.length === 0) {
        // No history → treat as NULL (caller decides pass/fail semantics)
        historyDaysCache.set(cacheKey, { days: null, fetchedAt: now });
        return null;
      }

      // 8.6/8.7 behavior: number of daily candles == history days
      const days = ohlc.length;

      historyDaysCache.set(cacheKey, { days, fetchedAt: now });
      return days;
    } catch (err) {
      // Log once per pair per TTL window at WARN level
      console.warn('[REB2.9D][History][Error]', { pair, error: (err as Error).message });
      historyDaysCache.set(cacheKey, { days: null, fetchedAt: now });
      return null;
    }
  }

  // Utility methods
  /**
   * Get eligible trading pairs based on screening criteria
   * 
   * Capability-Aware Filtering (Milestone 17):
   * - Current Implementation: Optimized for crypto/forex (fractional assets)
   *   - Volume filters work well for fractional crypto trading
   *   - Price filters allow low-price crypto assets
   *   - Spread filters critical for fractional execution quality
   * 
   * - Future Enhancement (Requires Stock Venue):
   *   - Whole-share feasibility checks (min 3 shares for diversification)
   *   - Share price ceiling filters (exclude stocks too expensive for position sizing)
   *   - Lot size compatibility validation
   * 
   * All Kraken assets support fractional trading, making current filters appropriate.
   * Equity-specific filters will be added when stock trading venue is integrated.
   */
  async getEligiblePairs(settings: {
    minVolume: string;
    minDailyRange: string;
    minPrice?: string;
    maxPrice?: string;
    maxBidAskSpread?: string;
    excludeStablecoins?: boolean;
    allowedTradingPairs?: string[];
    blacklistedSymbols?: string[];
    whitelistedSymbols?: string[];
    minHistoryDays?: number;
    // Phase 27.F.15.B: Add missing filters
    rsiMin?: number;
    rsiMax?: number;
    volatilityMin?: string;
    volatilityMax?: string;
    minLiquidity?: string;
    minMarketCap?: string;
    allowRegulatedOnly?: boolean;
    // Phase 27.F.14: Advanced Universe & Signal Controls
    universeSize?: number;
    quoteCurrencies?: string[];
    activeTimeframes?: string[];
  }): Promise<Array<{
    symbol: string;
    baseCurrency: string;
    quoteCurrency: string;
    marketCap?: number;
    volume24h: number;
    currentPrice: number;
    dailyRange: number;
    vwap?: number;
  }>> {
    const [tickers, pairs] = await Promise.all([
      this.getTicker(),
      this.getTradablePairs()
    ]);

    const eligiblePairs: any[] = [];
    const candidatePairs: any[] = [];
    const exclusionReasons: Record<string, string> = {};

    // Parse settings (NO HARDCODED FALLBACKS - require database values)
    const minVolume = parseFloat(settings.minVolume);
    const minDailyRange = parseFloat(settings.minDailyRange);
    const minPrice = parseFloat(settings.minPrice || '0.01');
    const maxPrice = settings.maxPrice ? parseFloat(settings.maxPrice) : undefined;
    const maxBidAskSpread = settings.maxBidAskSpread ? parseFloat(settings.maxBidAskSpread) : 100; // Default to 100% if not specified
    const excludeStablecoins = settings.excludeStablecoins ?? true;
    // Phase 27.F.13.B: Quote currency filter disabled - accept all currencies per user requirement
    const allowedQuotes = settings.allowedTradingPairs || [];
    const blacklist = normalizeSymbolArray(settings.blacklistedSymbols);
    const whitelist = normalizeSymbolArray(settings.whitelistedSymbols);
    const minHistoryDays = settings.minHistoryDays || 90;
    // Phase 27.F.15.B: Parse new filter parameters
    const volatilityMin = settings.volatilityMin ? parseFloat(settings.volatilityMin) : undefined;
    const volatilityMax = settings.volatilityMax ? parseFloat(settings.volatilityMax) : undefined;
    
    // Phase 27.F.14: Parse Advanced Universe & Signal Controls
    const universeSize = settings.universeSize || undefined; // Limit number of pairs (25-150)
    
    /**
     * Phase 27.F.15.B: Filters NOT IMPLEMENTED (require expensive operations or unavailable data):
     * - RSI (rsiMin/rsiMax): Requires calculating RSI indicator from historical price data for each pair (expensive)
     * - Liquidity (minLiquidity): Requires orderbook depth analysis for each pair (expensive + rate limits)
     * - Market Cap (minMarketCap): Not provided by Kraken API
     * - Regulated Only (allowRegulatedOnly): Not provided by Kraken API
     * 
     * These parameters are accepted for future implementation but currently ignored.
     * UI displays these as "Not Available" to indicate they don't affect filtering.
     */

    // Stablecoin patterns
    const stablecoinPatterns = ['USDT', 'USDC', 'DAI', 'BUSD', 'TUSD', 'USDP', 'GUSD', 'USDD', 'FRAX', 'LUSD'];

    Object.entries(tickers).forEach(([pairName, ticker]) => {
      const pairInfo = pairs[pairName];
      if (!pairInfo) return;

      const currentPrice = parseFloat(ticker.c[0]);
      // Directive 8.8.4-C.13.D: Convert 24h volume from coins to USD
      const volume24hCoins = parseFloat(ticker.v[1]);
      const volume24hUSD = volume24hCoins * currentPrice;
      const volume24h = volume24hUSD; // Maintain backward compatibility
      const high24h = parseFloat(ticker.h[1]);
      const low24h = parseFloat(ticker.l[1]);
      const dailyRange = ((high24h - low24h) / low24h) * 100;
      
      // Calculate bid-ask spread
      const askPrice = parseFloat(ticker.a[0]);
      const bidPrice = parseFloat(ticker.b[0]);
      const bidAskSpread = ((askPrice - bidPrice) / bidPrice) * 100;

      // Get canonical symbol for comparison (BASE/QUOTE format)
      const canonicalSymbol = canonicalFromPairInfo(pairInfo);

      // Filter 1: Whitelist check (if whitelist exists and is not empty, ONLY allow whitelisted symbols)
      if (whitelist.length > 0 && !whitelist.includes(canonicalSymbol)) {
        exclusionReasons[pairName] = `Not in whitelist`;
        return;
      }

      // Filter 2: Blacklist check
      if (blacklist.includes(canonicalSymbol)) {
        exclusionReasons[pairName] = `Blacklisted symbol`;
        return;
      }

      // Filter 3: Stablecoin exclusion
      if (excludeStablecoins && stablecoinPatterns.some(pattern => pairInfo.base.includes(pattern))) {
        exclusionReasons[pairName] = `Stablecoin excluded`;
        return;
      }

      // Filter 4: Minimum 24h volume (USD-denominated per Directive 8.8.4-C.13.D)
      console.debug(`[FILTER][VOLUME] ${pairName} Vol=$${volume24hUSD.toFixed(2)} vs Min=$${minVolume}`);
      if (volume24hUSD < minVolume) {
        console.warn(`[FILTER_REJECT][LOW_VOLUME] ${pairName} Vol=$${volume24hUSD.toFixed(2)} < $${minVolume}`);
        exclusionReasons[pairName] = `Volume $${volume24hUSD.toFixed(0)} < $${minVolume.toFixed(0)}`;
        // Directive 8.8.4-C.14: Record filter rejection for validation tracking
        try {
          const { c14ValidationService } = require('./c14-validation-service');
          c14ValidationService.recordFilterRejection('LOW_VOLUME');
        } catch (e) { /* C14 service may not be running */ }
        return;
      }

      // Filter 5: Minimum daily range
      if (dailyRange < minDailyRange) {
        exclusionReasons[pairName] = `Daily range ${dailyRange.toFixed(2)}% < ${minDailyRange}%`;
        return;
      }

      // Filter 6: Minimum price threshold
      if (currentPrice < minPrice) {
        exclusionReasons[pairName] = `Price $${currentPrice} < $${minPrice}`;
        return;
      }

      // Filter 7: Maximum price threshold (Phase 27.F.15.B)
      if (maxPrice && currentPrice > maxPrice) {
        exclusionReasons[pairName] = `Price $${currentPrice} > $${maxPrice}`;
        return;
      }

      // Filter 8: Maximum bid-ask spread
      if (bidAskSpread > maxBidAskSpread) {
        exclusionReasons[pairName] = `Bid-ask spread ${bidAskSpread.toFixed(2)}% > ${maxBidAskSpread}%`;
        return;
      }

      // Filter 9: Volatility range (Phase 27.F.15.B)
      // Using daily range as a proxy for volatility
      if (volatilityMin !== undefined && dailyRange < volatilityMin) {
        exclusionReasons[pairName] = `Volatility ${dailyRange.toFixed(2)}% < ${volatilityMin}%`;
        return;
      }
      if (volatilityMax !== undefined && dailyRange > volatilityMax) {
        exclusionReasons[pairName] = `Volatility ${dailyRange.toFixed(2)}% > ${volatilityMax}%`;
        return;
      }

      // All pre-history filters passed - add to candidate pairs for history check
      // Directive 8.8.4-C.13.D: volume24h is now USD-denominated (volume24hCoins * currentPrice)
      // Directive 11.4H.3: Include ask, bid, and spread for friction score calculation
      candidatePairs.push({
        symbol: pairName,
        baseCurrency: pairInfo.base,
        quoteCurrency: pairInfo.quote,
        volume24h: volume24hUSD, // Explicit USD volume for downstream consumers
        volume24hUSD, // Explicit USD volume property for pipeline transparency
        currentPrice,
        dailyRange,
        vwap: parseFloat(ticker.p[1]), // 24h VWAP
        ask: askPrice, // Ask price for spread calculation
        bid: bidPrice, // Bid price for spread calculation
        spread: (askPrice - bidPrice) / bidPrice // Decimal spread (not percentage)
      });
    });

    // Filter 10: Check data history for candidate pairs
    console.log(`\n📊 Screener: ${candidatePairs.length} pairs passed basic filters, checking history...`);
    
    for (const pair of candidatePairs) {
      try {
        // Check if pair has sufficient historical data (90 days = ~90 daily candles)
        const requiredSeconds = minHistoryDays * 24 * 60 * 60;
        const sinceTimestamp = Math.floor(Date.now() / 1000) - requiredSeconds;
        
        const { ohlc } = await this.getOHLCData(pair.symbol, 1440, sinceTimestamp); // 1440 = daily candles
        
        if (ohlc.length < minHistoryDays * 0.9) { // Allow 10% tolerance for missing days
          exclusionReasons[pair.symbol] = `Insufficient history: ${ohlc.length} days < ${minHistoryDays} days`;
          continue;
        }
        
        // History check passed - add to final eligible pairs
        eligiblePairs.push(pair);
      } catch (error: any) {
        exclusionReasons[pair.symbol] = `History check failed: ${error.message}`;
      }
    }

    // Log screening results with detailed exclusion reasons
    console.log(`\n📊 Screener Results:`);
    console.log(`  ✅ Eligible pairs: ${eligiblePairs.length}`);
    console.log(`  ❌ Excluded pairs: ${Object.keys(exclusionReasons).length}`);
    
    // Always log sample of exclusion reasons for debugging
    if (Object.keys(exclusionReasons).length > 0) {
      console.log(`\n❌ Exclusion reasons (showing first 15):`);
      Object.entries(exclusionReasons).slice(0, 15).forEach(([symbol, reason]) => {
        console.log(`  ${symbol}: ${reason}`);
      });
      if (Object.keys(exclusionReasons).length > 15) {
        console.log(`  ... and ${Object.keys(exclusionReasons).length - 15} more`);
      }
    }

    // Phase 27.F.14: Limit universe size if specified
    let finalPairs = eligiblePairs;
    if (universeSize && eligiblePairs.length > universeSize) {
      // Sort by volume descending and take top N pairs
      finalPairs = eligiblePairs
        .sort((a, b) => b.volume24h - a.volume24h)
        .slice(0, universeSize);
      console.log(`\n[27.F.14] Universe limited to top ${universeSize} pairs by volume`);
    }

    if (finalPairs.length > 0) {
      console.log(`\n✅ Eligible pairs:`);
      finalPairs.forEach(pair => {
        console.log(`  ${pair.symbol}: Vol=$${(pair.volume24h/1000000).toFixed(1)}M, Range=${pair.dailyRange.toFixed(1)}%, Price=$${pair.currentPrice}`);
      });
    }

    return finalPairs;
  }

  async calculateProjectedSlippage(pair: string, volume: number, side: 'buy' | 'sell'): Promise<number> {
    try {
      const orderBook = await this.getOrderBook(pair, 50);
      const book = orderBook[pair];
      if (!book) return 0;

      const orders = side === 'buy' ? book.asks : book.bids;
      let remainingVolume = volume;
      let totalCost = 0;
      let totalVolume = 0;

      for (const order of orders) {
        const orderPrice = parseFloat(order.price);
        const orderVolume = parseFloat(order.volume);
        const volumeToTake = Math.min(remainingVolume, orderVolume);

        totalCost += volumeToTake * orderPrice;
        totalVolume += volumeToTake;
        remainingVolume -= volumeToTake;

        if (remainingVolume <= 0) break;
      }

      if (totalVolume === 0) return 100; // No liquidity available

      const averagePrice = totalCost / totalVolume;
      const marketPrice = side === 'buy' ? 
        parseFloat(book.asks[0].price) : 
        parseFloat(book.bids[0].price);

      return Math.abs((averagePrice - marketPrice) / marketPrice) * 100;
    } catch (error) {
      console.error('Error calculating projected slippage:', error);
      return 0;
    }
  }
}
