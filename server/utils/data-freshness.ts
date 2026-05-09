/**
 * ════════════════════════════════════════════════════════════════════════════
 * B79.0a — Asset-class-aware data-freshness helper
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Single read-site for "is the price/data we have for this pair recent enough
 * to evaluate signals against." Per-class window resolved from
 * `module_constants` `(market_data, *, <assetClass>, *, *, data_freshness_window_ms)`.
 *
 * Per Langston Q2 lock (BATCH_79_0a_SCOPE.md §11): xstock_spot Day 1 value
 * empirically derived from `equity_spot_ticker_snap` p99 inter-tick gap on
 * a 6h sample (90,000 ms = max(p99_max + buffer, central_clock_interval)).
 *
 * Closed-market behavior: when the asset class is xstock_spot and the
 * market is closed (`isXstockMarketOpenUTC(symbol) === false`), helper returns
 * `true` (treat as fresh — explicit contract beats null per Langston Q2).
 * Scanner short-circuits on market-closed gate before reaching this site
 * anyway; this is belt-and-suspenders.
 *
 * Crypto path: no behavioral change — crypto callers either never invoked
 * this helper (and continue to use existing in-memory cache freshness math)
 * OR pass `assetClass='crypto_spot'` and resolve via the wildcard or
 * explicit per-class row in `module_constants`. Day 1 only xstock_spot has
 * a row; crypto wildcard fallback returns the wildcard window if any.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { getModuleConstants } from '../services/module-constants-service.js';
import { isXstockMarketOpenUTC } from '../asset_classes/xstock_spot/market-hours.js';
import { ASSET_CLASSES, type AssetClass } from '../../shared/asset-classes.js';

// In-process cache of resolved window per asset class. TTL 60s mirrors
// the module_constants service cache. Avoids hitting the resolver on
// every per-pair freshness check inside a hot scan loop.
interface CachedWindow { value: number; expiresAt: number; }
const _windowCache = new Map<AssetClass, CachedWindow>();
const _CACHE_TTL_MS = 60_000;

// Sentinel for "no per-class row found AND no wildcard fallback" — caller
// receives `Infinity` so the freshness gate degrades to "always-fresh"
// instead of always-stale. This is INTENTIONAL — a missing window row
// should NOT block signal evaluation. The B79.0a config enforces an
// explicit xstock_spot row exists; crypto path leaves Infinity until a
// future batch promotes it.
const _NO_WINDOW = Number.POSITIVE_INFINITY;

async function _resolveWindowMs(assetClass: AssetClass): Promise<number> {
  const now = Date.now();
  const cached = _windowCache.get(assetClass);
  if (cached && now < cached.expiresAt) return cached.value;

  try {
    const rows = await getModuleConstants('market_data', {
      exchange: 'kraken',
      assetClass,
      strategy: '*',
      regime: '*',
    });
    const raw = rows['data_freshness_window_ms'];
    const value = typeof raw === 'number' ? raw : _NO_WINDOW;
    _windowCache.set(assetClass, { value, expiresAt: now + _CACHE_TTL_MS });
    return value;
  } catch (err) {
    console.warn(`[B79.0a][FRESHNESS] resolve failed for assetClass=${assetClass}; defaulting to always-fresh:`, err);
    _windowCache.set(assetClass, { value: _NO_WINDOW, expiresAt: now + 5_000 });
    return _NO_WINDOW;
  }
}

/**
 * B79.0a: Asset-class-aware freshness gate.
 *
 * @param symbol — pair identifier (used only for logging context; the
 *                 per-pair age comparison happens at the call site that
 *                 also has the lastTickTimestamp)
 * @param assetClass — typed AssetClass; drives window lookup
 * @param lastTickTimestampMs — Date.now()-style ms when this pair's price was
 *                               last refreshed (from cache or DB row)
 * @param now — current ms (defaulted, but injectable for testability)
 *
 * Closed-market for xstock_spot: returns `true` (fresh) — staleness is
 * meaningless during weekend/holiday windows.
 *
 * Returns: `true` iff `now - lastTickTimestampMs <= window_ms` for the
 * resolved per-class window. `false` means signal should NOT evaluate
 * against this stale data.
 */
export async function isPairDataFresh(
  symbol: string,
  assetClass: AssetClass,
  lastTickTimestampMs: number,
  now: number = Date.now(),
): Promise<boolean> {
  // Belt-and-suspenders for closed market (Langston Q2 lock from B79).
  // B79.0c: per-symbol — 24/7 names (Kraken Phase 1) keep normal staleness
  // semantics (don't auto-mark fresh just because it's the weekend).
  if (assetClass === ASSET_CLASSES.XSTOCK_SPOT && !isXstockMarketOpenUTC(symbol)) {
    return true;
  }

  const windowMs = await _resolveWindowMs(assetClass);
  if (!Number.isFinite(windowMs)) return true; // no window configured = always-fresh
  if (lastTickTimestampMs <= 0) return false; // never seen a tick = stale
  return (now - lastTickTimestampMs) <= windowMs;
}

/**
 * B79.0a: Test-only helper to clear the per-class window cache.
 */
export function _testClearFreshnessCache(): void {
  _windowCache.clear();
}
