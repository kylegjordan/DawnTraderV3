/**
 * B65.1 — Module Constants Service
 *
 * Central read layer for the `module_constants` table, the 5-dimensional tunable
 * parameter store created in B65. Replaces scattered hardcoded-in-source
 * constants with a DB-driven configuration surface.
 *
 * Resolution hierarchy (most-specific-wins):
 *   1. (exchange, asset_class, strategy, regime)     — most specific
 *   2. (exchange, asset_class, strategy, *)
 *   3. (exchange, asset_class, *, *)
 *   4. (exchange, *, *, *)
 *   5. (*, asset_class, *, *)
 *   6. (*, *, *, *)                                  — global default
 *
 * If no row matches even the global wildcard, returns undefined. Callers should
 * handle undefined explicitly (no silent fallback).
 *
 * Dimension weight rationale (per Langston B65.1 Phase 4 review):
 *   regime:     8   — most specific. Regime-specific tuning dominates because
 *                     per-regime calibration is how DawnTrader adapts to market
 *                     conditions. RBS-specific SCORE_WEIGHTS should beat
 *                     asset-class-wide SCORE_WEIGHTS.
 *   strategy:   4   — next. Per-strategy tuning (e.g. strong_bull_trend-specific
 *                     threshold) beats infrastructure specificity.
 *   asset_class: 2  — asset-class tuning (crypto_perp constants beat crypto_spot
 *                     wildcards) is meaningful but lower priority than strategy/
 *                     regime specialization.
 *   exchange:   1   — exchange-specific tuning is usually the broadest override
 *                     axis (e.g. different fee schedule per exchange). Lowest
 *                     weight so strategy+regime can still win.
 *
 * Consequence: a row with (*, *, strategy=X, *) (score=4) beats a row with
 * (exchange=kraken, asset_class=crypto_spot, *, *) (score=1+2=3). This is
 * intentional — strategy/regime specialization is the primary calibration axis
 * in practice.
 *
 * Cache: 60-second TTL per module, mirroring the pattern established by MCE
 * in server/services/market-context-engine.ts. The cache holds the full rowset
 * per module_name; resolution is done in-memory per read.
 *
 * Reference: MODULARIZATION_SYNTHESIS_FROM_B63_AUDITS.md §3.3
 * Schema:    shared/schema.ts :: moduleConstants
 * Migration: drizzle/migrations/2026-04-23-b65-create-module-constants.sql
 */

import { db } from '../db.js';
import { moduleConstants, type ModuleConstant } from '../../shared/schema.js';
import { eq } from 'drizzle-orm';

const CACHE_TTL_MS = 60_000; // 60s, matches MCE

interface CachedModule {
  rows: ModuleConstant[];
  expiresAt: number;
}

const cache = new Map<string, CachedModule>();

/**
 * Resolution key for a single constant read. All 4 dimension fields are
 * required but can pass '*' to match wildcard rows explicitly (usually callers
 * pass the concrete values they know; wildcards only appear in the DB rows).
 */
export interface ResolutionKey {
  exchange: string;      // e.g. 'kraken', 'binance' — use actual exchange
  assetClass: string;    // e.g. 'crypto_spot', 'crypto_perp', 'xstock'
  strategy: string;      // strategy key, e.g. 'strong_bull_trend'
  regime: string;        // canonical regime key from REGIMES.* enum (see shared/schema and canonical-regime-strategy-map)
}

/**
 * Fetch all rows for a module from DB, cache them for 60s.
 */
async function loadModule(moduleName: string): Promise<ModuleConstant[]> {
  const now = Date.now();
  const cached = cache.get(moduleName);
  if (cached && cached.expiresAt > now) {
    return cached.rows;
  }

  const rows = await db
    .select()
    .from(moduleConstants)
    .where(eq(moduleConstants.moduleName, moduleName));

  cache.set(moduleName, {
    rows,
    expiresAt: now + CACHE_TTL_MS,
  });

  return rows;
}

/**
 * Score a row's specificity for a given resolution key. Higher = more specific.
 * A non-wildcard match on a dimension scores its weight; a wildcard row scores 0
 * for that dimension. If any dimension has a concrete row value that doesn't
 * match the key's concrete value, the row is REJECTED (not returned here).
 *
 * Weights chosen so strategy+regime specificity dominates exchange+asset_class
 * (dimensions vary in how often they're the most-specific axis for a given
 * constant — for SQE-family constants regime matters most; for TEC the broadest
 * rows are usually enough).
 *
 * Returns null if the row is incompatible with the key.
 */
function scoreRowForKey(row: ModuleConstant, key: ResolutionKey): number | null {
  // Each dimension: either wildcard OR matches the key exactly. Any mismatch rejects.
  let score = 0;
  if (row.exchange !== '*') {
    if (row.exchange !== key.exchange) return null;
    score += 1;
  }
  if (row.assetClass !== '*') {
    if (row.assetClass !== key.assetClass) return null;
    score += 2;
  }
  if (row.strategy !== '*') {
    if (row.strategy !== key.strategy) return null;
    score += 4;
  }
  if (row.regime !== '*') {
    if (row.regime !== key.regime) return null;
    score += 8;
  }
  return score;
}

/**
 * Resolve a single constant value for the given (module, constant_name, key).
 * Returns the value (JSONB — typically a primitive number/string or small object)
 * of the most-specific matching row, or undefined if no row matches.
 *
 * Callers are responsible for type-narrowing the returned JSONB value.
 */
export async function getConstant<T = unknown>(
  moduleName: string,
  constantName: string,
  key: ResolutionKey,
): Promise<T | undefined> {
  const rows = await loadModule(moduleName);

  let best: ModuleConstant | undefined;
  let bestScore = -1;

  for (const row of rows) {
    if (row.constantName !== constantName) continue;
    const score = scoreRowForKey(row, key);
    if (score === null) continue;
    if (score > bestScore) {
      bestScore = score;
      best = row;
    }
  }

  return best ? (best.value as T) : undefined;
}

/**
 * Bulk resolver: returns a map of { constantName → resolved value } for all
 * constants under a module that have at least one compatible row. Convenient
 * for modules that read many constants at once (e.g. TEC pulls 4 values
 * per trade).
 */
export async function getModuleConstants(
  moduleName: string,
  key: ResolutionKey,
): Promise<Record<string, unknown>> {
  const rows = await loadModule(moduleName);

  // Group rows by constantName, pick best per group
  const byConstant = new Map<string, { row: ModuleConstant; score: number }>();

  for (const row of rows) {
    const score = scoreRowForKey(row, key);
    if (score === null) continue;
    const existing = byConstant.get(row.constantName);
    if (!existing || score > existing.score) {
      byConstant.set(row.constantName, { row, score });
    }
  }

  const result: Record<string, unknown> = {};
  for (const [name, entry] of byConstant) {
    result[name] = entry.row.value;
  }
  return result;
}

/**
 * Invalidate cache for a module. Call when a row is inserted/updated via admin
 * API so subsequent reads see the new value without waiting for TTL.
 */
export function invalidateModuleCache(moduleName: string): void {
  cache.delete(moduleName);
}

/**
 * Clear all cached modules. Used in tests and on service restart.
 */
export function clearModuleConstantsCache(): void {
  cache.clear();
}

// ═══════════════════════════════════════════════════════════════════════════
// B72 — Sync-read API for hot-path callers (signal-pipeline strategies, MCE
// per-pair classifiers, etc.) where converting the whole call chain to async
// would blast-radius the signal pipeline. Pattern: warm the module ONCE at
// startup via `prefetchModule()`, then call `getCachedNumberRequired()` from
// any sync code path. Background interval re-warms every CACHE_TTL_MS so
// values picked up from SQL UPDATEs become visible within ~60s without
// requiring callers to await.
//
// Hard-fail policy (Kyle directive 2026-05-01): no silent fallback for
// DB-governed settings. `getCachedNumberRequired` THROWS on cold cache,
// missing row, or wrong type. Bootstrap must call `prefetchModule()` for
// every module a sync caller will read.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Async warmup: forces a fresh DB read into the cache. Call at server boot
 * (and as needed) for every module whose constants are read from sync code.
 * Returns the number of rows loaded.
 */
export async function prefetchModule(moduleName: string): Promise<number> {
  // Bypass TTL — always force a fresh read on prefetch.
  cache.delete(moduleName);
  const rows = await loadModule(moduleName);
  ensureBackgroundRefresher();
  return rows.length;
}

/**
 * Sync resolver against the in-memory cache. Returns the value of the most-
 * specific matching row, or undefined if no row matches.
 *
 * Throws if the module has not been prefetched (cold cache). Use
 * `prefetchModule()` at startup before any sync caller hits this.
 */
export function getCachedConstant<T = unknown>(
  moduleName: string,
  constantName: string,
  key: ResolutionKey,
): T | undefined {
  const cached = cache.get(moduleName);
  if (!cached) {
    throw new Error(
      `module_constants: module '${moduleName}' is not warm. Call prefetchModule('${moduleName}') at server startup before sync reads.`,
    );
  }

  let best: ModuleConstant | undefined;
  let bestScore = -1;

  for (const row of cached.rows) {
    if (row.constantName !== constantName) continue;
    const score = scoreRowForKey(row, key);
    if (score === null) continue;
    if (score > bestScore) {
      bestScore = score;
      best = row;
    }
  }

  return best ? (best.value as T) : undefined;
}

/**
 * Sync resolver returning a NUMBER. Throws on cold cache, missing row, or
 * non-numeric value. Use this for B72-migrated levers in hot-path code.
 *
 * Per Kyle directive 2026-05-01: no silent fallback. The throw is the design.
 */
export function getCachedNumberRequired(
  moduleName: string,
  constantName: string,
  key: ResolutionKey,
): number {
  const v = getCachedConstant<unknown>(moduleName, constantName, key);
  if (v === undefined) {
    throw new Error(
      `module_constants: required row missing for ${moduleName}.${constantName} key=${JSON.stringify(key)}. Seed via Drizzle migration.`,
    );
  }
  if (typeof v !== 'number') {
    throw new Error(
      `module_constants: ${moduleName}.${constantName} expected number, got ${typeof v} (${String(v)})`,
    );
  }
  return v;
}

/**
 * Background refresh interval — re-prefetches every warmed module every
 * CACHE_TTL_MS so SQL UPDATEs propagate to sync callers within ~60s.
 * Started lazily on first prefetchModule() call. No-op in test env.
 */
let refresherStarted = false;
function ensureBackgroundRefresher(): void {
  if (refresherStarted) return;
  if (process.env.NODE_ENV === 'test') return;
  refresherStarted = true;
  setInterval(() => {
    const moduleNames = Array.from(cache.keys());
    for (const moduleName of moduleNames) {
      prefetchModule(moduleName).catch((err) => {
        // Don't crash the loop — log and continue. Stale cache is preferable
        // to a crashed refresher; if the DB is unhealthy the consumer reads
        // will throw on missing data anyway.
        // eslint-disable-next-line no-console
        console.error(`[module-constants] background refresh failed for '${moduleName}':`, err);
      });
    }
  }, CACHE_TTL_MS).unref?.();
}


/**
 * Administrative write path. Upserts a constant into the DB and invalidates
 * the cache so the next read picks up the new value.
 *
 * Not exported for general code paths — callers should go through dedicated
 * admin routes with auth. Keeping it here colocated with the read layer so
 * future admin UI can import from one place.
 */
export async function setConstant(
  moduleName: string,
  constantName: string,
  key: Partial<ResolutionKey>,
  value: unknown,
  updatedBy: string,
): Promise<void> {
  await db
    .insert(moduleConstants)
    .values({
      moduleName,
      exchange: key.exchange ?? '*',
      assetClass: key.assetClass ?? '*',
      strategy: key.strategy ?? '*',
      regime: key.regime ?? '*',
      constantName,
      value: value as any,
      updatedBy,
    })
    .onConflictDoUpdate({
      target: [
        moduleConstants.moduleName,
        moduleConstants.exchange,
        moduleConstants.assetClass,
        moduleConstants.strategy,
        moduleConstants.regime,
        moduleConstants.constantName,
      ],
      set: {
        value: value as any,
        updatedAt: new Date(),
        updatedBy,
      },
    });

  invalidateModuleCache(moduleName);
}
