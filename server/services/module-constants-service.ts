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
  // P19-B8.1 (defect d): timestamp of the last SUCCESSFUL DB refresh, for
  // stale-serve observability (SWR must not silently mask a wedged refresher).
  lastRefreshedAt: number;
}

const cache = new Map<string, CachedModule>();

// P19-B8.1 (defect d): stale-serve observability. The background refresher
// lands every CACHE_TTL_MS; if a sync read is served >5 intervals past the
// last successful refresh, the refresher is wedged (DB unreachable / crashed
// loop) and we must SAY so — serving last-known-good silently forever would
// hide a dead refresh path. Rate-limited to one warning per module per TTL.
const STALE_WARN_MS = 5 * 60_000;
const staleWarnAt = new Map<string, number>();
function maybeWarnStaleServe(moduleName: string, cached: CachedModule): void {
  const now = Date.now();
  const staleForMs = now - cached.lastRefreshedAt;
  if (staleForMs <= STALE_WARN_MS) return;
  const lastWarn = staleWarnAt.get(moduleName) ?? 0;
  if (now - lastWarn < 60_000) return;
  staleWarnAt.set(moduleName, now);
  console.warn(
    `[module-constants][STALE_SERVE] module '${moduleName}' serving values ${Math.round(staleForMs / 1000)}s past last successful refresh — ` +
    `background refresher may be wedged (DB unreachable?). Serving last-known-good (stale-while-revalidate).`,
  );
}

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
 * GLOBAL_KEY — the explicit "resolve the global / wildcard row" resolution key.
 *
 * P19-B3b (2026-06-13): callers that intentionally want the global wildcard row
 * (no per-exchange/asset-class/strategy/regime specificity) must pass THIS, not
 * an untyped `{}`. `scoreRowForKey` treats every `'*'` dimension here as "match a
 * wildcard row, reject a concrete row" — identical runtime behaviour to the old
 * `{}` arg, but type-safe and self-documenting (`{}` failed under the tightened
 * 4-field `ResolutionKey`). Use ONLY where the constant is seeded as a single
 * global wildcard row (e.g. `per_underlying_cap` b67.3, `factor_ablation`).
 */
export const GLOBAL_KEY: ResolutionKey = {
  exchange: '*',
  assetClass: '*',
  strategy: '*',
  regime: '*',
};

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
    lastRefreshedAt: now,
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
 * B79.0n.MCE: count the raw `module_constants` rows for a module, grouped by
 * the EXACT `asset_class` value on each row (no resolver hierarchy applied).
 *
 * This is a verification helper, NOT a resolution path — it deliberately does
 * NOT do most-specific-wins matching. It answers "how many explicit per-class
 * rows physically exist for this module" so a caller can confirm a seed
 * migration's per-class rows are present (vs. silently falling through to a
 * wildcard row, which the resolver would mask).
 *
 * Uses the same 60s-TTL `loadModule` cache as the resolvers.
 */
export async function countModuleRowsByAssetClass(
  moduleName: string,
): Promise<Record<string, number>> {
  const rows = await loadModule(moduleName);
  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.assetClass] = (counts[row.assetClass] ?? 0) + 1;
  }
  return counts;
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
 * B79.TEC (2026-05-08): assert that an EXPLICIT per-asset-class row exists
 * for the given (module, asset_class, constant_name). Used by the boot-time
 * TEC primer to enforce HARD-FAIL semantics: every ACTIVE asset class must
 * have an explicit `break_even_enabled` row, not just inherit from the
 * `(*,*,*,*)` wildcard. Without this assertion, primeTECConfig would
 * silently succeed via wildcard fallback even when the operator's
 * per-class kill-switch row is missing — exactly the failure mode B79.TEC
 * is designed to prevent.
 *
 * Returns true iff at least one row exists with that explicit asset_class
 * (any exchange/strategy/regime — they may all be wildcards on that side,
 * what matters is the asset_class dimension is concrete).
 *
 * Bypasses the standard wildcard precedence — this is a structural check,
 * not a value resolution. Reads from the same per-module cache populated
 * by `getModuleConstants`, so no extra DB round-trip when called after
 * the first read.
 */
export async function hasExplicitAssetClassRow(
  moduleName: string,
  assetClass: string,
  constantName: string,
): Promise<boolean> {
  const rows = await loadModule(moduleName);
  return rows.some(
    (r) => r.assetClass === assetClass && r.constantName === constantName,
  );
}

/**
 * Invalidate cache for a module. Call when a row is inserted/updated via admin
 * API so subsequent reads see the new value without waiting for TTL.
 *
 * P19-B8.1 (defect d): EXPIRE, don't delete — deletion re-opened the sync-
 * reader "not warm" throw window at every admin write. Expiring makes the next
 * ASYNC read (loadModule) fetch fresh immediately, while SYNC readers keep
 * serving last-known-good until the refresher re-warms (≤60s). Callers that
 * need sync readers to see the new value immediately should `await
 * prefetchModule(moduleName)` instead (the admin write path does).
 */
export function invalidateModuleCache(moduleName: string): void {
  const cached = cache.get(moduleName);
  if (cached) cached.expiresAt = 0;
}

/**
 * Clear all cached modules. Used in tests and on service restart.
 */
export function clearModuleConstantsCache(): void {
  cache.clear();
}

/**
 * TEST-ONLY (B-4.5): seed a module's rows directly into the sync cache so
 * unit suites can exercise fail-hard consumers (e.g. the fee_model merge in
 * getFrictionForAssetClass) without a database. Produces the same cache shape
 * prefetchModule does; never expires. Throws outside the vitest environment
 * so no production path can reach it.
 */
export function _seedModuleCacheForTests(moduleName: string, rows: ModuleConstant[]): void {
  if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
    throw new Error('_seedModuleCacheForTests is test-only');
  }
  cache.set(moduleName, { rows, expiresAt: Number.MAX_SAFE_INTEGER, lastRefreshedAt: Number.MAX_SAFE_INTEGER });
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
  // P19-B8.1 (defect d, root-caused live on staging): SWAP-ON-SUCCESS, never
  // delete-first. The previous `cache.delete()` opened a window — while the
  // async DB read was in flight, any sync reader of this module found a cold
  // cache and threw "is not warm" (observed ~hourly on dbs_calculation AND
  // amr_friction_sample via the 60s background refresher, widening with DB
  // latency). Now: read fresh FIRST (bypassing the TTL check by querying the
  // DB directly), then atomically replace the entry. If the DB read throws,
  // the previous entry keeps serving (stale-while-revalidate; staleness is
  // bounded + logged via maybeWarnStaleServe, so a wedged refresher is
  // visible, never hidden).
  const rows = await db
    .select()
    .from(moduleConstants)
    .where(eq(moduleConstants.moduleName, moduleName));
  const now = Date.now();
  cache.set(moduleName, {
    rows,
    expiresAt: now + CACHE_TTL_MS,
    lastRefreshedAt: now,
  });
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
  maybeWarnStaleServe(moduleName, cached);

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
 * Sync bulk resolver: returns ALL numeric constants for a given (module, key)
 * as a Record<constantName, number>. Used by per-strategy modules where a
 * detect() call needs many constants at once (10–19 levers per strategy file).
 *
 * Resolves each constant via the same most-specific-wins logic as
 * getCachedConstant. Skips non-numeric values silently (use getCachedConstant
 * directly if you need non-numeric or want to detect missing keys).
 *
 * Throws on cold cache (module not warmed).
 */
export function getCachedNumbersForModule(
  moduleName: string,
  key: ResolutionKey,
): Record<string, number> {
  const cached = cache.get(moduleName);
  if (!cached) {
    throw new Error(
      `module_constants: module '${moduleName}' is not warm. Call prefetchModule('${moduleName}') at server startup before sync reads.`,
    );
  }
  // P19-B8.1 (Langston Step-4 gate): ALL THREE sync readers observe stale-serve
  // — this bulk per-strategy path included, so a wedged refresher can never
  // serve the strategy levers silently-stale forever.
  maybeWarnStaleServe(moduleName, cached);

  // Group by constantName, pick best per group
  const byConstant = new Map<string, { row: ModuleConstant; score: number }>();
  for (const row of cached.rows) {
    const score = scoreRowForKey(row, key);
    if (score === null) continue;
    const existing = byConstant.get(row.constantName);
    if (!existing || score > existing.score) {
      byConstant.set(row.constantName, { row, score });
    }
  }

  const result: Record<string, number> = {};
  for (const [name, entry] of byConstant) {
    const v = entry.row.value;
    if (typeof v === 'number') {
      result[name] = v;
    }
  }
  return result;
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
 * P19-B7.1 (OBJ-1): fail-hard STRING reader — same contract as getCachedNumberRequired
 * but for categorical config (e.g. the active-ranker selection). THROWS on cold cache or
 * missing row (no hidden default — §5 rule 15: a DB-governed setting fails hard when absent,
 * never silently falls back). `allowed`, when given, also rejects an unrecognized value so a
 * typo'd ranker name can't silently pick a wrong sort.
 */
export function getCachedStringRequired(
  moduleName: string,
  constantName: string,
  key: ResolutionKey,
  allowed?: readonly string[],
): string {
  const v = getCachedConstant<unknown>(moduleName, constantName, key);
  if (v === undefined) {
    throw new Error(
      `module_constants: required row missing for ${moduleName}.${constantName} key=${JSON.stringify(key)}. Seed via Drizzle migration.`,
    );
  }
  if (typeof v !== 'string') {
    throw new Error(
      `module_constants: ${moduleName}.${constantName} expected string, got ${typeof v} (${String(v)})`,
    );
  }
  if (allowed && !allowed.includes(v)) {
    throw new Error(
      `module_constants: ${moduleName}.${constantName}='${v}' not in allowed set {${allowed.join(', ')}}`,
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
        // Don't crash the loop — log and continue. Post-B8.1 swap-on-success,
        // a failed refresh leaves the previous entry serving (stale-while-
        // revalidate); persistent staleness surfaces via maybeWarnStaleServe.
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

  // P19-B8.1 (defect d): re-warm instead of invalidate-only, so SYNC readers
  // see the new value immediately with no cold window (swap-on-success).
  await prefetchModule(moduleName);
}
