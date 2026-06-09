/**
 * B70 Step 3.0 — Run-Mode Controller
 *
 * Provides a single source of truth for the system's current operational mode,
 * derived from existing engine-active flags. Used by all B70 archivers to tag
 * rows with the operational state at write time.
 *
 * Design properties (per BATCH_70_SCOPE.md §M, Kyle directive 2026-05-04):
 *  - Three modes: 'vts' | 'paper_sim' | 'live'
 *  - VTS is the default — passive learning runs when no execution engine active
 *  - Pure derivation from existing tradingStateSync.isEngineActive flags
 *  - Does NOT extend the existing 2-mode TradingMode type (Phase 27.4 wiring,
 *    high blast radius — leave it alone)
 *  - Cached refresh (every 5s) so hot-path callers (per-emit archivers running
 *    at thousands of evals/min) don't hit the DB on every call
 *
 * The `mode` value tagged on archive rows is the SYSTEM-STATE field. The
 * `source` field on those same rows is hardcoded per-hook (per Langston
 * cc-inbox #896 refinement, two-column discriminator design).
 */

import { tradingStateSync } from './trading-state-sync.js';

export type RunMode = 'vts' | 'paper_sim' | 'live';

/**
 * ITEM-4 step 2 (2026-06-10): the ONE place the 2-mode TradingMode vocabulary
 * ('paper' | 'live') maps onto the 3-mode RunMode vocabulary — used by
 * carried-tag consumers (archivers, learning store) when a per-mode engine
 * instance states who it is. Per Langston step-2 amendment: exactly one
 * mapping site, never per-call-site. NOT a read of global state — the caller
 * supplies its OWN mode.
 */
export function tradingModeToRunMode(mode: 'paper' | 'live'): RunMode {
  return mode === 'paper' ? 'paper_sim' : 'live';
}

const REFRESH_INTERVAL_MS = 5000;
let cachedMode: RunMode = 'vts'; // Safe default — VTS is what's active today
let lastRefresh = 0;
let refreshInFlight: Promise<void> | null = null;

/**
 * Synchronous accessor for hot-path callers. Returns the most recently cached
 * mode. Cache is refreshed lazily (every 5s) by the async refresh path —
 * callers that want a guaranteed-fresh value should `await refreshMode()`
 * first.
 */
export function getCurrentMode(): RunMode {
  // Fire-and-forget refresh if cache is stale; do not await.
  const now = Date.now();
  if (now - lastRefresh > REFRESH_INTERVAL_MS && !refreshInFlight) {
    refreshInFlight = refreshMode().finally(() => {
      refreshInFlight = null;
    });
    // We deliberately do not await — return the cached value.
  }
  return cachedMode;
}

/**
 * Force a refresh of the cached mode. Returns the resolved value. Safe to
 * call concurrently — internal de-duplication ensures only one refresh fires
 * at a time.
 */
export async function refreshMode(): Promise<RunMode> {
  if (refreshInFlight) {
    await refreshInFlight;
    return cachedMode;
  }
  try {
    lastRefresh = Date.now();
    const [paperActive, liveActive] = await Promise.all([
      tradingStateSync.isEngineActive('paper'),
      tradingStateSync.isEngineActive('live'),
    ]);
    if (liveActive) {
      cachedMode = 'live';
    } else if (paperActive) {
      cachedMode = 'paper_sim';
    } else {
      cachedMode = 'vts';
    }
  } catch (err) {
    // Hold previous value on transient errors; log once per refresh window.
    console.warn(
      `[B70][run-mode] refresh failed, holding cached mode='${cachedMode}'`,
      err instanceof Error ? err.message : err,
    );
  }
  return cachedMode;
}

/**
 * Initialize the controller — primes the cache with a real value at startup.
 * Call from the startup sequence after tradingStateSync is initialized.
 */
export async function initRunModeController(): Promise<void> {
  await refreshMode();
  console.log(`[B70][run-mode] initialized; current mode='${cachedMode}'`);
}

/**
 * Test-only: reset internal state. Do not use in production code.
 */
export function _resetForTests(): void {
  cachedMode = 'vts';
  lastRefresh = 0;
  refreshInFlight = null;
}
