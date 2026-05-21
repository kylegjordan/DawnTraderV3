/**
 * B79.0n.UNIVERSE-DISCOVERY — in-memory universe accessor + 5-layer fallback chain.
 *
 * Single source-of-truth bridge between the dynamically-populated DB table
 * `xstock_spot_universe` and the in-memory `XSTOCK_SPOT_REGISTRY` + `XSTOCK_SPOT_SYMBOLS`
 * exports in `shared/asset-classes.ts`.
 *
 * Boot flow (called once at startup by `server/index.ts`):
 *
 *   1. Live discovery — handled separately by xstock-universe-discoverer.ts
 *      (NOT this module's responsibility). Discovery service writes to DB.
 *   2. DB snapshot — this module's `initializeFromDB()` reads
 *      `xstock_spot_universe WHERE is_delisted=false` and populates the in-memory
 *      registry. If DB is reachable + table has rows: this layer succeeds.
 *   3. File cache fallback — if DB read fails OR returns zero rows,
 *      `loadFromFileCache()` reads the last-known-good snapshot at
 *      `/var/lib/dawntrader/xstock-universe-cache.json` (written by discoverer
 *      on each successful refresh).
 *   4. Bootstrap fallback — if both DB + file cache fail, `loadBootstrap()`
 *      uses the hard-coded 20-symbol mega-cap set from `universe-bootstrap.ts`.
 *   5. Fail-fast — if all four layers exhaust, the boot orchestrator in
 *      `server/index.ts` calls `process.exit(1)`. NOT this module's call —
 *      this module just reports `false` from each layer attempt.
 *
 * Runtime flow:
 *   - `getActiveUniverse()` returns the in-memory Set; cached with 1h TTL.
 *   - `getMetadata(symbol)` returns the full entry.
 *   - `refreshFromDB()` invalidates cache + reloads. Called by:
 *     (a) explicit invocation from the discoverer after a successful run,
 *     (b) the manual refresh API endpoint,
 *     (c) lazy-refresh when cache TTL elapses on next `getActiveUniverse()` call.
 *
 * Per Langston Q-PA-4 ACK: sector field is VARCHAR + CHECK constraint at DB
 * level; the internal `XstockSector` TypeScript union still applies post-load
 * (UNCATEGORIZED added for symbols where Finnhub metadata is unavailable).
 */

import { db } from '../../db.js';
import { sql } from 'drizzle-orm';
import fs from 'fs/promises';
import path from 'path';
import type { XstockSpotEntry, XstockSector } from '../../../shared/asset-classes.js';
import {
  _replaceXstockUniverse,
  _XSTOCK_SECTOR_VALUES_FOR_CHECK,
} from '../../../shared/asset-classes.js';
import { UNIVERSE_BOOTSTRAP_SET } from './universe-bootstrap.js';

const FILE_CACHE_PATH = process.env.XSTOCK_UNIVERSE_CACHE_PATH ?? '/var/lib/dawntrader/xstock-universe-cache.json';

const CACHE_TTL_MS = 60 * 60 * 1000;  // 1 hour

interface DbUniverseRow {
  symbol: string;
  name: string;
  sector: string;
  crypto_adjacent: boolean;
  adr: boolean;
  is_delisted: boolean;
}

interface InitResult {
  ok: boolean;
  dbReachable: boolean;
  rowCount: number;
  source: 'db' | 'file_cache' | 'bootstrap' | 'none';
  error?: string;
}

interface CacheState {
  loadedAt: number;
  source: 'db' | 'file_cache' | 'bootstrap' | 'none';
}

let _cacheState: CacheState = { loadedAt: 0, source: 'none' };

function logInfo(...args: unknown[]): void {
  console.log(`[B79.0n.UNIVERSE-DISCOVERY][universe-service]`, ...args);
}
function logWarn(...args: unknown[]): void {
  console.warn(`[B79.0n.UNIVERSE-DISCOVERY][universe-service]`, ...args);
}
function logError(...args: unknown[]): void {
  console.error(`[B79.0n.UNIVERSE-DISCOVERY][universe-service]`, ...args);
}

/**
 * Coerce a DB-returned sector string into a valid XstockSector. Defaults to
 * UNCATEGORIZED for unknown values (defensive; DB CHECK should prevent this).
 */
function coerceSector(raw: string): XstockSector {
  return _XSTOCK_SECTOR_VALUES_FOR_CHECK.has(raw)
    ? (raw as XstockSector)
    : ('UNCATEGORIZED' as XstockSector);
}

function rowsToEntries(rows: DbUniverseRow[]): Map<string, XstockSpotEntry> {
  const m = new Map<string, XstockSpotEntry>();
  for (const r of rows) {
    if (r.is_delisted) continue;
    m.set(r.symbol, {
      name: r.name,
      sector: coerceSector(r.sector),
      adr: r.adr || undefined,
      cryptoAdjacent: r.crypto_adjacent || undefined,
    });
  }
  return m;
}

class XstockUniverseService {
  /**
   * Boot-time DB read. Returns InitResult so the boot orchestrator can
   * distinguish "DB unreachable" (network / auth) from "DB reachable but
   * table empty" (seed migration didn't run) — Langston Q-PA-4 enhancement.
   */
  async initializeFromDB(): Promise<InitResult> {
    try {
      const result: any = await db.execute(sql`
        SELECT symbol, name, sector, crypto_adjacent, adr, is_delisted
        FROM xstock_spot_universe
        WHERE is_delisted = false
        ORDER BY symbol
      `);
      const rows: DbUniverseRow[] = (result?.rows ?? result ?? []) as DbUniverseRow[];
      const rowsArr: DbUniverseRow[] = Array.isArray(rows) ? rows : [];
      const entries = rowsToEntries(rowsArr);
      _replaceXstockUniverse(entries);
      _cacheState = { loadedAt: Date.now(), source: 'db' };
      logInfo(`initializeFromDB OK — loaded ${entries.size} active symbols from xstock_spot_universe`);
      return { ok: true, dbReachable: true, rowCount: rowsArr.length, source: 'db' };
    } catch (err) {
      const errStr = err instanceof Error ? err.message : String(err);
      logError(`initializeFromDB FAILED:`, errStr);
      return { ok: false, dbReachable: false, rowCount: 0, source: 'none', error: errStr };
    }
  }

  /**
   * Layer-3 fallback. Reads the last-known-good snapshot file written by the
   * discoverer service. File contains a JSON array of universe entries.
   * Returns true if file existed + parsed + populated > 0 symbols.
   */
  async loadFromFileCache(): Promise<boolean> {
    try {
      const raw = await fs.readFile(FILE_CACHE_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as Array<{ symbol: string; name: string; sector: string; cryptoAdjacent?: boolean; adr?: boolean }>;
      if (!Array.isArray(parsed) || parsed.length === 0) {
        logWarn(`loadFromFileCache: ${FILE_CACHE_PATH} parsed empty`);
        return false;
      }
      const m = new Map<string, XstockSpotEntry>();
      for (const e of parsed) {
        m.set(e.symbol, {
          name: e.name,
          sector: coerceSector(e.sector),
          adr: e.adr || undefined,
          cryptoAdjacent: e.cryptoAdjacent || undefined,
        });
      }
      _replaceXstockUniverse(m);
      _cacheState = { loadedAt: Date.now(), source: 'file_cache' };
      logWarn(`loadFromFileCache OK — loaded ${m.size} symbols from ${FILE_CACHE_PATH}`);
      return true;
    } catch (err) {
      const errStr = err instanceof Error ? err.message : String(err);
      logWarn(`loadFromFileCache failed:`, errStr);
      return false;
    }
  }

  /**
   * Layer-4 fallback. Hard-coded 20-symbol survival set from
   * universe-bootstrap.ts. Always succeeds (synchronous, no I/O).
   */
  loadBootstrap(): boolean {
    const m = new Map<string, XstockSpotEntry>();
    for (const { symbol, entry } of UNIVERSE_BOOTSTRAP_SET) {
      m.set(symbol, entry);
    }
    _replaceXstockUniverse(m);
    _cacheState = { loadedAt: Date.now(), source: 'bootstrap' };
    logWarn(`loadBootstrap OK — loaded ${m.size} hard-coded mega-cap symbols (layer 4 fallback)`);
    return m.size > 0;
  }

  /**
   * Called by the discoverer after a successful refresh to push the new
   * universe into the in-memory cache + write the file cache for layer-3
   * fallback durability.
   */
  async refreshFromDB(): Promise<InitResult> {
    return this.initializeFromDB();
  }

  /**
   * Write the in-memory universe to disk as the layer-3 fallback. Called by
   * the discoverer after a successful refresh.
   */
  async writeFileCache(entries: Iterable<[string, XstockSpotEntry]>): Promise<void> {
    const arr = Array.from(entries).map(([symbol, e]) => ({
      symbol,
      name: e.name,
      sector: e.sector,
      cryptoAdjacent: e.cryptoAdjacent ?? false,
      adr: e.adr ?? false,
    }));
    const dir = path.dirname(FILE_CACHE_PATH);
    try {
      await fs.mkdir(dir, { recursive: true });
      const tmpPath = `${FILE_CACHE_PATH}.tmp`;
      await fs.writeFile(tmpPath, JSON.stringify(arr, null, 2), { mode: 0o644 });
      await fs.rename(tmpPath, FILE_CACHE_PATH);
      logInfo(`writeFileCache OK — wrote ${arr.length} symbols to ${FILE_CACHE_PATH}`);
    } catch (err) {
      const errStr = err instanceof Error ? err.message : String(err);
      logWarn(`writeFileCache failed (non-fatal — DB is the canonical source):`, errStr);
    }
  }

  /**
   * Diagnostic surface — returns the current cache state. Consumed by the
   * health endpoint.
   */
  getCacheState(): CacheState {
    return { ..._cacheState };
  }
}

export const xstockUniverseService = new XstockUniverseService();
