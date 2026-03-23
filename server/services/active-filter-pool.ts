/**
 * REB 2.2: Active Filter Pool Service
 *
 * Manages the deduped, non-expired pool of pairs that passed FX5 filters.
 * Restored to Nov 18-20 truth state with:
 * - 5-minute TTL expiry
 * - Scanner-side deduplication
 * - Passive mode behavior (empty pool when engine stopped)
 *
 * Phase 14.5 (Batch 19): Added pattern pool support
 * - Separate pattern pool for pairs that fail quant filters but pass relaxed thresholds
 * - sourcePool field tracks active filter path origin (quant/pattern)
 * - assetClass field for future xStocks/futures expansion
 * - getPatternPool() method for orchestrator routing
 *
 * Truth Sources:
 * - phase_8.6.7_validation.md
 * - phase_8.6.10_mapping.md
 * - DawnTrader_Chat_Archive_11-20-25.md
 * - DawnTrader_Chat_Archive_11-15-25.md
 */

import { storage } from '../storage.js';
import type { SourcePool, AssetClass } from '../config/pattern-filter-profile.js';

// REB 2.2: TTL from truth state (Nov 20 chat archive)
const SYMBOL_COOLDOWN_TTL_MS = 5 * 60 * 1000; // 5 minutes
const VOLUME_CACHE_TTL_MS = 60 * 1000; // 1 minute cache for Kraken ticker fallback

export interface ActiveFilteredPair {
  symbol: string;
  price: number;
  volume24h: number;
  dailyRange: number;
  firstSeen: string;          // ISO timestamp when first added
  lastUpdated: string;        // ISO timestamp when last seen passing filters
  expiresAt: number;          // Unix timestamp when entry expires (TTL)
  source: 'paper' | 'live';   // Trading mode
  sourcePool?: SourcePool;     // Phase 14.5: 'quant' | 'pattern' — which filter path admitted this pair
  assetClass?: AssetClass;     // Phase 14.5: 'crypto_spot' — future-proofing for xStocks etc.
  fx5Snapshot?: {             // Optional: snapshot of FX5 metrics when added
    volume24h: number;
    dailyRange: number;
    price: number;
  };
}

// Volume cache entry for Kraken ticker fallback
interface VolumeCacheEntry {
  volume24h: number;
  volumeBucket: 'High' | 'Medium' | 'Low' | 'Very Low';
  expiresAt: number;
}

class ActiveFilterPoolService {
  // In-memory pools (one per mode)
  private paperPool: Map<string, ActiveFilteredPair> = new Map();
  private livePool: Map<string, ActiveFilteredPair> = new Map();

  // Phase 14.5: Separate pattern pools (one per mode)
  private paperPatternPool: Map<string, ActiveFilteredPair> = new Map();
  private livePatternPool: Map<string, ActiveFilteredPair> = new Map();

  // Batch 22: Family-specific filter pools
  private paperTrendPool: Map<string, ActiveFilteredPair> = new Map();
  private liveTrendPool: Map<string, ActiveFilteredPair> = new Map();
  private paperReversalPool: Map<string, ActiveFilteredPair> = new Map();
  private liveReversalPool: Map<string, ActiveFilteredPair> = new Map();
  private paperBreakoutPool: Map<string, ActiveFilteredPair> = new Map();
  private liveBreakoutPool: Map<string, ActiveFilteredPair> = new Map();
  private paperOscillatorPool: Map<string, ActiveFilteredPair> = new Map();
  private liveOscillatorPool: Map<string, ActiveFilteredPair> = new Map();

  // Volume cache for Kraken ticker fallback (symbol -> volume data)
  private volumeCache: Map<string, VolumeCacheEntry> = new Map();

  // Phase 8.8.7: Telemetry interval for verification
  private telemetryInterval: NodeJS.Timeout | null = null;
  private initialized: boolean = false;

  /**
   * Phase 8.8.7: Initialize pool with verification logging
   */
  initialize(): void {
    if (this.initialized) return;

    this.initialized = true;
    console.log(`[8.8.7][Verification] ActiveFilterPool initialized: true`);

    // Start 5-minute telemetry logging
    if (!this.telemetryInterval) {
      this.telemetryInterval = setInterval(() => {
        this.logTelemetry();
      }, 5 * 60 * 1000); // 5 minutes

      console.log(`[8.8.7][Telemetry] Started 5-minute telemetry logging`);
    }
  }

  /**
   * Phase 8.8.7: Log telemetry every 5 minutes
   * Phase 14.5: Added pattern pool counts
   */
  private logTelemetry(): void {
    const paperSurvivors = this.getActivePool('paper').length;
    const liveSurvivors = this.getActivePool('live').length;
    const paperPatternSurvivors = this.getPatternPool('paper').length;
    const livePatternSurvivors = this.getPatternPool('live').length;

    console.log(`[8.8.7][Telemetry]\n  FX5 Survivors (paper): ${paperSurvivors}\n  FX5 Survivors (live): ${liveSurvivors}\n  Pattern Pool (paper): ${paperPatternSurvivors}\n  Pattern Pool (live): ${livePatternSurvivors}\n  Pool Initialized: ${this.initialized}`);
  }

  /**
   * Phase 8.8.7: Verify mode awareness
   */
  verifyModeContext(mode: 'paper' | 'live'): boolean {
    const pool = this.getActivePool(mode);
    console.log(`[8.8.7][Verification] Mode context confirmed: ${mode} (${pool.length} pairs)`);
    return true;
  }

  /**
   * Phase 8.8.7: Check if pool is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get the pool for a specific mode
   */
  private getPool(mode: 'paper' | 'live'): Map<string, ActiveFilteredPair> {
    return mode === 'paper' ? this.paperPool : this.livePool;
  }

  /**
   * Phase 14.5: Get the pattern pool for a specific mode
   */
  private getPatternPoolMap(mode: 'paper' | 'live'): Map<string, ActiveFilteredPair> {
    return mode === 'paper' ? this.paperPatternPool : this.livePatternPool;
  }

  /**
   * Remove expired entries from the pool
   * REB 2.2: TTL expiry logic from truth state
   */
  private removeExpiredEntries(mode: 'paper' | 'live'): number {
    const pool = this.getPool(mode);
    const now = Date.now();
    let removedCount = 0;

    for (const [symbol, entry] of pool.entries()) {
      if (now >= entry.expiresAt) {
        pool.delete(symbol);
        removedCount++;
        console.log(`[8.6.7][DEBUG] Removed expired entry: ${symbol} (expired at ${new Date(entry.expiresAt).toISOString()})`);
      }
    }

    if (removedCount > 0) {
      console.log(`[8.6.7][DEBUG] Removed ${removedCount} expired entries from ${mode} pool`);
    }

    return removedCount;
  }

  /**
   * Phase 14.5: Remove expired entries from the pattern pool
   */
  private removeExpiredPatternEntries(mode: 'paper' | 'live'): number {
    const pool = this.getPatternPoolMap(mode);
    const now = Date.now();
    let removedCount = 0;

    for (const [symbol, entry] of pool.entries()) {
      if (now >= entry.expiresAt) {
        pool.delete(symbol);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      console.log(`[14.5][PATTERN_POOL] Removed ${removedCount} expired entries from ${mode} pattern pool`);
    }

    return removedCount;
  }

  /**
   * Add or update symbols in the Active Filter Pool
   * REB 2.2: Implements deduplication logic from truth state
   *
   * Deduplication rule:
   * - If symbol already in pool and NOT expired → skip
   * - If symbol in pool but IS expired → remove old entry, add new one
   * - If symbol NOT in pool → add new entry
   *
   * @param skipPassiveCheck - Set to true to bypass passive mode check (for FX5 scanner integration)
   */
  addSurvivors(
    mode: 'paper' | 'live',
    survivors: Array<{
      symbol: string;
      currentPrice: number;
      volume24h: number;
      dailyRange: number;
    }>,
    skipPassiveCheck: boolean = false
  ): {
    added: number;
    updated: number;
    skipped: number;
  } {
    // REB 2.2: Passive mode enforcement will be handled by FX5 scanner
    // For now, we allow updates (passive check done at scanner level)

    const pool = this.getPool(mode);
    const now = Date.now();
    const nowISO = new Date(now).toISOString();
    const expiresAt = now + SYMBOL_COOLDOWN_TTL_MS; // 5 minutes from now

    let added = 0;
    let updated = 0;
    let skipped = 0;

    // STEP 1: Remove expired entries BEFORE processing new survivors
    this.removeExpiredEntries(mode);

    // STEP 2: Process each survivor
    for (const survivor of survivors) {
      const existing = pool.get(survivor.symbol);

      if (existing) {
        // Symbol already in pool
        if (now >= existing.expiresAt) {
          // Expired - remove and re-add with fresh TTL
          pool.delete(survivor.symbol);
          console.log(`[8.6.10][DEBUG] Expired symbol ${survivor.symbol} - removing and re-adding`);

          const newEntry: ActiveFilteredPair = {
            symbol: survivor.symbol,
            price: survivor.currentPrice,
            volume24h: survivor.volume24h,
            dailyRange: survivor.dailyRange,
            firstSeen: nowISO, // New first seen since expired
            lastUpdated: nowISO,
            expiresAt,
            source: mode,
            sourcePool: 'quant',        // Phase 14.5: quant pool origin
            assetClass: 'crypto_spot',  // Phase 14.5: default asset class
            fx5Snapshot: {
              volume24h: survivor.volume24h,
              dailyRange: survivor.dailyRange,
              price: survivor.currentPrice,
            },
          };

          pool.set(survivor.symbol, newEntry);
          added++;
        } else {
          // Not expired - SKIP (deduplicate)
          // REB 2.2: Truth state requirement - do NOT refresh TTL for non-expired symbols
          skipped++;
          console.log(`[8.6.10][DEBUG] Skipped existing non-expired entry: ${survivor.symbol} (TTL: ${Math.round((existing.expiresAt - now) / 1000)}s remaining)`);
        }
      } else {
        // New symbol - add to pool
        const newEntry: ActiveFilteredPair = {
          symbol: survivor.symbol,
          price: survivor.currentPrice,
          volume24h: survivor.volume24h,
          dailyRange: survivor.dailyRange,
          firstSeen: nowISO,
          lastUpdated: nowISO,
          expiresAt,
          source: mode,
          sourcePool: 'quant',        // Phase 14.5: quant pool origin
          assetClass: 'crypto_spot',  // Phase 14.5: default asset class
          fx5Snapshot: {
            volume24h: survivor.volume24h,
            dailyRange: survivor.dailyRange,
            price: survivor.currentPrice,
          },
        };

        pool.set(survivor.symbol, newEntry);
        added++;
        console.log(`[8.6.10][DEBUG] Added new entry: ${survivor.symbol} (expires in 5 min)`);
      }
    }

    console.log(`[8.6.7][DEBUG] Active Pool update complete: added=${added}, updated=${updated}, skipped=${skipped}, total_size=${pool.size}`);

    return { added, updated, skipped };
  }

  /**
   * Phase 14.5: Add pattern-pool survivors
   * These are pairs that failed quant metric filters but passed relaxed pattern thresholds.
   * Same deduplication logic as addSurvivors() but writes to pattern pool.
   */
  addPatternPoolSurvivors(
    mode: 'paper' | 'live',
    survivors: Array<{
      symbol: string;
      currentPrice: number;
      volume24h: number;
      dailyRange: number;
    }>
  ): {
    added: number;
    skipped: number;
  } {
    const pool = this.getPatternPoolMap(mode);
    const now = Date.now();
    const nowISO = new Date(now).toISOString();
    const expiresAt = now + SYMBOL_COOLDOWN_TTL_MS;

    let added = 0;
    let skipped = 0;

    this.removeExpiredPatternEntries(mode);

    for (const survivor of survivors) {
      const existing = pool.get(survivor.symbol);

      if (existing && now < existing.expiresAt) {
        skipped++;
        continue;
      }

      // Remove expired entry if exists
      if (existing) {
        pool.delete(survivor.symbol);
      }

      const newEntry: ActiveFilteredPair = {
        symbol: survivor.symbol,
        price: survivor.currentPrice,
        volume24h: survivor.volume24h,
        dailyRange: survivor.dailyRange,
        firstSeen: nowISO,
        lastUpdated: nowISO,
        expiresAt,
        source: mode,
        sourcePool: 'pattern',       // Phase 14.5: pattern pool origin
        assetClass: 'crypto_spot',   // Phase 14.5: default asset class
        fx5Snapshot: {
          volume24h: survivor.volume24h,
          dailyRange: survivor.dailyRange,
          price: survivor.currentPrice,
        },
      };

      pool.set(survivor.symbol, newEntry);
      added++;
    }

    console.log(`[14.5][PATTERN_POOL] Pattern pool update: added=${added}, skipped=${skipped}, total_size=${pool.size}`);

    return { added, skipped };
  }

  /**
   * Get all non-expired entries from the pool
   */
  getActivePool(mode: 'paper' | 'live'): ActiveFilteredPair[] {
    // Remove expired entries first
    this.removeExpiredEntries(mode);

    const pool = this.getPool(mode);
    return Array.from(pool.values());
  }

  /**
   * Phase 14.5: Get all non-expired entries from the pattern pool
   */
  getPatternPool(mode: 'paper' | 'live'): ActiveFilteredPair[] {
    this.removeExpiredPatternEntries(mode);
    const pool = this.getPatternPoolMap(mode);
    return Array.from(pool.values());
  }

  // Batch 22: Get family pool survivors
  getFamilyPool(mode: 'paper' | 'live', family: string): ActiveFilteredPair[] {
    const poolMap: Record<string, Map<string, ActiveFilteredPair>> = {
      'paper_trend': this.paperTrendPool,
      'live_trend': this.liveTrendPool,
      'paper_reversal': this.paperReversalPool,
      'live_reversal': this.liveReversalPool,
      'paper_breakout': this.paperBreakoutPool,
      'live_breakout': this.liveBreakoutPool,
      'paper_oscillator': this.paperOscillatorPool,
      'live_oscillator': this.liveOscillatorPool,
    };
    const key = `${mode}_${family}`;
    return Array.from(poolMap[key]?.values() ?? []);
  }

  // Batch 22: Add family pool survivors
  addFamilyPoolSurvivors(mode: 'paper' | 'live', family: string, survivors: any[]): void {
    const poolMap: Record<string, Map<string, ActiveFilteredPair>> = {
      'paper_trend': this.paperTrendPool,
      'live_trend': this.liveTrendPool,
      'paper_reversal': this.paperReversalPool,
      'live_reversal': this.liveReversalPool,
      'paper_breakout': this.paperBreakoutPool,
      'live_breakout': this.liveBreakoutPool,
      'paper_oscillator': this.paperOscillatorPool,
      'live_oscillator': this.liveOscillatorPool,
    };
    const key = `${mode}_${family}`;
    const pool = poolMap[key];
    if (!pool) return;

    const now = new Date().toISOString();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minute TTL

    for (const s of survivors) {
      const symbol = s.symbol;
      pool.set(symbol, {
        symbol,
        price: s.price ?? 0,
        volume24h: s.volume24h ?? s.volumeUSD ?? 0,
        dailyRange: s.dailyRange ?? 0,
        firstSeen: pool.get(symbol)?.firstSeen ?? now,
        lastUpdated: now,
        expiresAt,
        source: mode,
        sourcePool: family as any,
      });
    }
    console.log(`[22][POOL] ${family} pool (${mode}): ${pool.size} pairs`);
  }

  /**
   * Phase 14.5: Get pattern pool size
   */
  getPatternPoolSize(mode: 'paper' | 'live'): number {
    this.removeExpiredPatternEntries(mode);
    return this.getPatternPoolMap(mode).size;
  }

  /**
   * REB 2.11A: Get raw symbols from pool WITHOUT triggering cleanup
   * Used for diagnostic audits that need to see pre-cleanup state
   */
  getSymbolsRaw(mode: 'paper' | 'live'): string[] {
    const pool = this.getPool(mode);
    return Array.from(pool.keys());
  }

  /**
   * REB 2.11A: Get symbols after cleanup
   * Used for diagnostic audits that need to see post-cleanup state
   */
  getSymbolsAfterCleanup(mode: 'paper' | 'live'): string[] {
    this.removeExpiredEntries(mode);
    const pool = this.getPool(mode);
    return Array.from(pool.keys());
  }

  /**
   * Get pool size (non-expired entries)
   */
  getPoolSize(mode: 'paper' | 'live'): number {
    this.removeExpiredEntries(mode);
    const pool = this.getPool(mode);
    return pool.size;
  }

  /**
   * Clear the entire pool for a mode
   * REB 2.2: Used when engine stops (passive mode)
   * Phase 14.5: Also clears pattern pool
   */
  clearPool(mode: 'paper' | 'live'): void {
    const pool = this.getPool(mode);
    const size = pool.size;
    pool.clear();

    // Phase 14.5: Also clear pattern pool
    const patternPool = this.getPatternPoolMap(mode);
    const patternSize = patternPool.size;
    patternPool.clear();

    // Batch 22: Clear family pools
    this.paperTrendPool.clear();
    this.liveTrendPool.clear();
    this.paperReversalPool.clear();
    this.liveReversalPool.clear();
    this.paperBreakoutPool.clear();
    this.liveBreakoutPool.clear();
    this.paperOscillatorPool.clear();
    this.liveOscillatorPool.clear();

    console.log(`[8.6.7][DEBUG] Cleared ${mode} Active Pool (${size} quant + ${patternSize} pattern entries removed)`);
  }

  /**
   * Enforce passive mode behavior: clear pool when engine stops
   * REB 2.2: Truth state requirement from chat archives
   *
   * This should be called by FX5 scanner when engine status changes
   */
  enforcePassiveModeIfStopped(mode: 'paper' | 'live', isEngineRunning: boolean): void {
    if (!isEngineRunning) {
      const pool = this.getPool(mode);
      const patternPool = this.getPatternPoolMap(mode);
      if (pool.size > 0 || patternPool.size > 0) {
        console.log(`[8.6.7][DEBUG] Engine stopped for ${mode} - clearing Active Pool (passive mode enforcement)`);
        this.clearPool(mode);
      }
    }
  }

  /**
   * Phase 8.8.3-I9: Get volume info for a specific symbol
   * Returns volume24h and volume bucket (High/Medium/Low/Very Low)
   * Directive 8.8.4-C.14.A: Handles symbol format normalization (NANOEUR → NANO/EUR)
   */
  getSymbolVolumeInfo(symbol: string, mode: 'paper' | 'live'): { volume24h: number; volumeBucket: 'High' | 'Medium' | 'Low' | 'Very Low' } {
    const pool = this.getPool(mode);

    // Try direct lookup first
    let entry = pool.get(symbol);

    // If not found and symbol has no slash, try to find canonical format
    if (!entry && !symbol.includes('/')) {
      // Try common quote currencies (longest first to avoid partial matches)
      const quoteCurrencies = ['USDT', 'USDC', 'EUR', 'USD', 'BTC', 'ETH', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF'];
      for (const quote of quoteCurrencies) {
        if (symbol.endsWith(quote)) {
          const base = symbol.slice(0, -quote.length);
          const canonicalSymbol = `${base}/${quote}`;
          entry = pool.get(canonicalSymbol);
          if (entry) break;
        }
      }
    }

    // Phase 14.5: Also check pattern pool if not found in quant pool
    if (!entry) {
      const patternPool = this.getPatternPoolMap(mode);
      entry = patternPool.get(symbol);
      if (!entry && !symbol.includes('/')) {
        const quoteCurrencies = ['USDT', 'USDC', 'EUR', 'USD', 'BTC', 'ETH', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF'];
        for (const quote of quoteCurrencies) {
          if (symbol.endsWith(quote)) {
            const base = symbol.slice(0, -quote.length);
            const canonicalSymbol = `${base}/${quote}`;
            entry = patternPool.get(canonicalSymbol);
            if (entry) break;
          }
        }
      }
    }

    if (!entry) {
      return { volume24h: 0, volumeBucket: 'Very Low' };
    }

    const volume24h = entry.volume24h;

    // Volume buckets per spec:
    // > $50M = High
    // $10-50M = Medium
    // $1-10M = Low
    // < $1M = Very Low
    let volumeBucket: 'High' | 'Medium' | 'Low' | 'Very Low';
    if (volume24h > 50000000) {
      volumeBucket = 'High';
    } else if (volume24h >= 10000000) {
      volumeBucket = 'Medium';
    } else if (volume24h >= 1000000) {
      volumeBucket = 'Low';
    } else {
      volumeBucket = 'Very Low';
    }

    return { volume24h, volumeBucket };
  }

  /**
   * Directive 8.8.4-C.14.B: Check if symbol exists in FX5 pool
   * Used for pre-validation before signal processing
   * Phase 14.5: Also checks pattern pool
   */
  hasSymbol(symbol: string, mode: 'paper' | 'live'): boolean {
    const pool = this.getPool(mode);

    // Try direct lookup first
    if (pool.has(symbol)) return true;

    // If not found and symbol has no slash, try canonical format
    if (!symbol.includes('/')) {
      const quoteCurrencies = ['USDT', 'USDC', 'EUR', 'USD', 'BTC', 'ETH', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF'];
      for (const quote of quoteCurrencies) {
        if (symbol.endsWith(quote)) {
          const base = symbol.slice(0, -quote.length);
          const canonicalSymbol = `${base}/${quote}`;
          if (pool.has(canonicalSymbol)) return true;
        }
      }
    }

    // Phase 14.5: Also check pattern pool
    const patternPool = this.getPatternPoolMap(mode);
    if (patternPool.has(symbol)) return true;
    if (!symbol.includes('/')) {
      const quoteCurrencies = ['USDT', 'USDC', 'EUR', 'USD', 'BTC', 'ETH', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF'];
      for (const quote of quoteCurrencies) {
        if (symbol.endsWith(quote)) {
          const base = symbol.slice(0, -quote.length);
          const canonicalSymbol = `${base}/${quote}`;
          if (patternPool.has(canonicalSymbol)) return true;
        }
      }
    }

    return false;
  }

  /**
   * Directive 8.8.4-C.14.B: Get FX5 pool data for a symbol
   * Returns null if symbol not found (for proper NULL storage)
   * Phase 14.5: Also checks pattern pool
   */
  getFX5DataForSymbol(symbol: string, mode: 'paper' | 'live'): { price: number; volume24h: number } | null {
    const pool = this.getPool(mode);

    // Try direct lookup
    let entry = pool.get(symbol);

    // If not found and symbol has no slash, try canonical format
    if (!entry && !symbol.includes('/')) {
      const quoteCurrencies = ['USDT', 'USDC', 'EUR', 'USD', 'BTC', 'ETH', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF'];
      for (const quote of quoteCurrencies) {
        if (symbol.endsWith(quote)) {
          const base = symbol.slice(0, -quote.length);
          const canonicalSymbol = `${base}/${quote}`;
          entry = pool.get(canonicalSymbol);
          if (entry) break;
        }
      }
    }

    // Phase 14.5: Also check pattern pool
    if (!entry) {
      const patternPool = this.getPatternPoolMap(mode);
      entry = patternPool.get(symbol);
      if (!entry && !symbol.includes('/')) {
        const quoteCurrencies = ['USDT', 'USDC', 'EUR', 'USD', 'BTC', 'ETH', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF'];
        for (const quote of quoteCurrencies) {
          if (symbol.endsWith(quote)) {
            const base = symbol.slice(0, -quote.length);
            const canonicalSymbol = `${base}/${quote}`;
            entry = patternPool.get(canonicalSymbol);
            if (entry) break;
          }
        }
      }
    }

    if (!entry) return null;

    return {
      price: entry.price,
      volume24h: entry.volume24h
    };
  }
}

// Singleton instance
export const activeFilterPool = new ActiveFilterPoolService();
