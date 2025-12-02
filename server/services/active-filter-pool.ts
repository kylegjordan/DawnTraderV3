/**
 * REB 2.2: Active Filter Pool Service
 * 
 * Manages the deduped, non-expired pool of pairs that passed FX5 filters.
 * Restored to Nov 18-20 truth state with:
 * - 5-minute TTL expiry
 * - Scanner-side deduplication
 * - Passive mode behavior (empty pool when engine stopped)
 * 
 * Truth Sources:
 * - phase_8.6.7_validation.md
 * - phase_8.6.10_mapping.md
 * - DawnTrader_Chat_Archive_11-20-25.md
 * - DawnTrader_Chat_Archive_11-15-25.md
 */

import { storage } from '../storage.js';

// REB 2.2: TTL from truth state (Nov 20 chat archive)
const SYMBOL_COOLDOWN_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface ActiveFilteredPair {
  symbol: string;
  price: number;
  volume24h: number;
  dailyRange: number;
  firstSeen: string;          // ISO timestamp when first added
  lastUpdated: string;        // ISO timestamp when last seen passing filters
  expiresAt: number;          // Unix timestamp when entry expires (TTL)
  source: 'paper' | 'live';   // Trading mode
  fx5Snapshot?: {             // Optional: snapshot of FX5 metrics when added
    volume24h: number;
    dailyRange: number;
    price: number;
  };
}

class ActiveFilterPoolService {
  // In-memory pools (one per mode)
  private paperPool: Map<string, ActiveFilteredPair> = new Map();
  private livePool: Map<string, ActiveFilteredPair> = new Map();

  /**
   * Get the pool for a specific mode
   */
  private getPool(mode: 'paper' | 'live'): Map<string, ActiveFilteredPair> {
    return mode === 'paper' ? this.paperPool : this.livePool;
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
   * Get all non-expired entries from the pool
   */
  getActivePool(mode: 'paper' | 'live'): ActiveFilteredPair[] {
    // Remove expired entries first
    this.removeExpiredEntries(mode);
    
    const pool = this.getPool(mode);
    return Array.from(pool.values());
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
   */
  clearPool(mode: 'paper' | 'live'): void {
    const pool = this.getPool(mode);
    const size = pool.size;
    pool.clear();
    console.log(`[8.6.7][DEBUG] Cleared ${mode} Active Pool (${size} entries removed)`);
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
      if (pool.size > 0) {
        console.log(`[8.8.3-J3][DIAG] PASSIVE_MODE_CLEAR: mode=${mode}, poolSize=${pool.size}, isEngineRunning=${isEngineRunning}`);
        console.log(`[8.6.7][DEBUG] Engine stopped for ${mode} - clearing Active Pool (passive mode enforcement)`);
        this.clearPool(mode);
      }
    } else {
      console.log(`[8.8.3-J3][DIAG] PASSIVE_MODE_SKIP: mode=${mode}, isEngineRunning=${isEngineRunning}, pool preserved`);
    }
  }
}

// Singleton instance
export const activeFilterPool = new ActiveFilterPoolService();
