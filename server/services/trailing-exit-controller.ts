/**
 * Directive 9.2.A — TrailingExitController (canonical TEC as of B65.2)
 * Directive 11.3A — Enhanced with Cost-Aware Ratchet Logic
 * B65.2 (2026-04-23) — Moonbag qualifier gate, duration cap, concurrency cap,
 *                      stop-writeback callback, module_constants integration.
 *
 * Core trailing-stop computation with adaptive exit logic powered by DI and VolNoise.
 * Implements:
 * - Dynamic Trailing Exit Logic
 * - Two-Stage Latching System (Break-Even + Target Lock)
 * - Mode persistence (TARGET vs TRAILING_TAKE)
 * - 11.3A: Cost-aware floors (netBreakeven, netTargetFloor)
 * - B65.2: Moonbag qualifier (strategy + sourcePool), duration cap,
 *          concurrency cap (mode-aware), stop-writeback callback.
 *
 * With B65.2, this module is the single canonical trailing engine — the
 * Phase-11 `execution-controller.ts` implementation has been deleted.
 */

import {
  calculateDynamicStopDistance,
  calculateTrailingStopPrice,
  isBreakEvenTriggered,
  isTargetLockTriggered,
  type TradeMode
} from '../utils/analysis-utils.js';
import { getCachedCostMetrics, computeNetBreakeven, computeNetTargetFloor } from '../core/math/cost-model.js';
import { getModuleConstants, hasExplicitAssetClassRow } from './module-constants-service.js';
// B-NEW-42b (2026-05-17): price-discontinuity sentinel. Consumed at stop-check
// + target-lock gate sites to short-circuit naive logic during halt-resume
// gaps, corp-action discontinuities, and known ex-dividend windows. Detector
// owns its own per-symbol state cache (lazy 24h eviction); TEC just calls.
import { isDiscontinuityActive } from './price-discontinuity-detector.js';
// B79: market-hours is a leaf module (no imports) — safe static import.
// Used by the TEC stop-freeze guard at top of updatePosition() for xstock_spot.
import { isXstockMarketOpenUTC } from '../asset_classes/xstock_spot/market-hours.js';
// B79.TEC: per-asset-class TEC config cache requires the AssetClass SSOT enum.
// `ACTIVE_ASSET_CLASSES` is the subset that primeTECConfig() warms at boot.
// New asset classes added to `getActiveAssetClasses()` are automatically
// picked up by the next deploy's bootstrap — no per-batch primer edit needed.
import {
  ASSET_CLASSES,
  type AssetClass,
  getActiveAssetClasses,
} from '../../shared/asset-classes.js';

// Debounce persistence writes to avoid excessive I/O.
// B65.2: tunable via `module_constants.trailing_exit.persistence_debounce_ms`.
let persistenceTimer: NodeJS.Timeout | null = null;
const PERSIST_DEBOUNCE_MS = 5000; // 5 second default; matches B65.1 seed.

// B65.2: caller mode for per-mode config resolution and concurrency cap.
export type CallerMode = 'vts' | 'paper' | 'live';

// B65.2: service-level counter tracking concurrent moonbag trades per mode.
// Decoupled from DB so the concurrency cap check is O(1) and free from race
// conditions on simultaneous target-hits within one cycle.
const concurrentMoonbagByMode: Record<CallerMode, number> = {
  vts: 0,
  paper: 0,
  live: 0,
};

export function getConcurrentMoonbagCount(mode: CallerMode): number {
  return concurrentMoonbagByMode[mode];
}

// B65.2: cached trailing_exit module constants with 60s TTL to avoid
// hammering the service per cycle per trade.
interface TrailingExitConfig {
  // Post-B75 (2026-05-06): operator kill-switch for the BE-stop latch. When
  // false, BE never latches and the trade tracks original SL → TP only
  // (matches Exit Strategy Ablation variant K). Set via DB UPDATE on
  // `trailing_exit.break_even_enabled` (default true). Adopted after the
  // 7d ablation showed variant K (no BE) at Sharpe 2.13 vs current J
  // (BE on, trail off) at Sharpe 0.39.
  breakEvenEnabled: boolean;
  breakEvenTriggerR: number;
  targetLockR: number;
  trailDistanceAtrMultiplier: number;
  persistenceDebounceMs: number;
  moonbagQualifyingStrategies: string[];
  moonbagQualifyingSourcePools: Record<string, string[]>;
  moonbagMaxDurationMs: number;
  moonbagCapMode: 'unlimited' | 'reserved_slots';
  moonbagReservedSlots: number;
  // B65.4.1 (2026-04-26): rung-floor buffer multiplier for the slippage-aware
  // floor placement above the just-hit target. See computeNetTargetFloor in
  // cost-model.ts and B65_4_LADDER_COUNTERFACTUAL_ANALYSIS.md.
  rungFloorSlippageBufferMultiplier: number;
}

// B79.TEC (2026-05-08): TEC_DEFAULTS.breakEvenEnabled flipped from true → false.
// Fail-closed default. Reasoning: accidentally-on costs real money on
// BE-stopped trades that exit before reaching target; accidentally-off is a
// degraded-but-functional TEC (trades track original SL → TP only). The
// asymmetric-risk argument is documented in BATCH_79_TEC_SCOPE.md §-1
// and CLAUDE.md §11. This is NOT a silent fallback — it is a documented
// safe-state invoked only when DB row is genuinely unavailable AND
// `[TEC_CACHE_MISS_FATAL]` did not throw (i.e. fields per-key fall-back
// inside primeTECConfig DB read for known asset class).
//
// Live DB state per asset class (verified 2026-05-13 via direct module_constants
// query; Kyle confirmed intended state):
//   crypto_spot  → break_even_enabled = false (variant K winner, B73 ablation)
//   crypto_perp  → break_even_enabled = false
//   xstock_spot  → break_even_enabled = TRUE (Kyle 2026-05-13: BE-protect +
//                   trailing exits are deliberately ENABLED for xstocks.
//                   Earlier code comments / MEMORY.md descriptions that said
//                   "Day 1 default false, flips after B79.4 ablation" were
//                   aspirational and never matched live DB row. Doc sync'd
//                   2026-05-13 to live state.)
//   xstock_perp  → break_even_enabled = false
//   *  (wildcard) → break_even_enabled = false
const TEC_DEFAULTS: TrailingExitConfig = {
  breakEvenEnabled: false, // B79.TEC: fail-closed (was true pre-B79.TEC)
  breakEvenTriggerR: 1.0,
  targetLockR: 1.5,
  trailDistanceAtrMultiplier: 1.0,
  persistenceDebounceMs: 5000,
  moonbagQualifyingStrategies: ['strong_bull_trend', 'sma_trend_ride', 'vwap_pullback', 'breakout'],
  moonbagQualifyingSourcePools: { vwap_pullback: ['quant-strong_trend'] },
  moonbagMaxDurationMs: 14400000, // 4h
  moonbagCapMode: 'reserved_slots',
  moonbagReservedSlots: 1,
  rungFloorSlippageBufferMultiplier: 1.0, // B65.4.1: 1.0 = exactly the per-pair slippage; >1 widens; <1 tightens.
};

// ─── B79.TEC: per-asset-class config cache ─────────────────────────────────
// Replaces the single shared `cachedConfig` with a Map keyed by AssetClass.
// Each entry is an immutable wholesale snapshot of a TrailingExitConfig
// resolved from `module_constants` for that class. Snapshots replace
// wholesale on TTL — never per-field. resolveTECConfig is SYNC: the cache
// is pre-warmed by primeTECConfig at boot, and TTL refreshes happen in the
// background without blocking the caller.
//
// HARD-FAIL doctrine (CLAUDE.md §5 #15 + scope §-1): if primeTECConfig
// cannot resolve required keys for any ACTIVE asset class at boot, the
// process aborts non-zero. A cache miss at runtime therefore means the
// caller passed a class the primer didn't iterate (programmer error),
// and resolveTECConfig throws `[TEC_CACHE_MISS_FATAL]`.
const tecConfigCache = new Map<AssetClass, TrailingExitConfig>();
const tecConfigExpiresAt = new Map<AssetClass, number>();
const tecConfigLastSuccessAt = new Map<AssetClass, number>();
// B79.TEC (2026-05-08, Langston Q1 review): refresh coalescing.
// Without this, every post-expiry call fires another `void refreshTECConfigForClass`
// — under DB slowness, N concurrent refreshes per class can stack.
// In-flight Promise per class ensures only one refresh runs at a time.
const tecConfigRefreshInFlight = new Map<AssetClass, Promise<void>>();
// B79.TEC (Langston Q1): TEC_REFRESH_FAIL counter exposed via diagnostic
// endpoint so degradation is observable. Console-only logging is not enough
// for a kill-switch key — silent staleness while operator is trying to flip
// `break_even_enabled = false` is exactly the failure mode we don't want.
const tecRefreshFailCount = new Map<AssetClass, number>();
const CONFIG_TTL_MS = 60_000;
// B79.TEC (Langston Q1): hard staleness ceiling. If a snapshot is older
// than 5×TTL = 5min, resolveTECConfig stops returning the stale value and
// throws fail-closed. A persistent DB outage past 5min is not "transient"
// anymore — we'd rather fail explicitly than honor an outdated kill-switch.
const CONFIG_MAX_STALENESS_MS = 5 * CONFIG_TTL_MS;

// B79.TEC (Langston Finding 1, 2026-05-08): per-minute resolution-traffic aggregator.
//
// REVISION HISTORY: an earlier draft tracked a `wildcard` resolution-path
// counter intended to fire `[TEC_FIRST_WILDCARD_HIT]` on the first wildcard
// fallback per class. That was DEAD code — `getModuleConstants` doesn't
// surface origin metadata, and `hasExplicitAssetClassRow` already aborts
// boot when the explicit per-class row is missing, so a wildcard fallback
// can never be observed at runtime. Tying the B79.TEC.b 48h verify gate
// to a signal that can't fire was a false-confidence trap.
//
// Current design: track ONLY explicit-resolve traffic per class. The
// per-minute `[TEC_RESOLVE_AGGR]` dump proves traffic is flowing through
// the per-class cache. The B79.TEC.b verify checklist uses live signals
// that can actually fire: diagnostic endpoint readiness, fresh
// `hasExplicitAssetClassRow` probe at decision time, and refresh-fail
// counters from `getTECBootstrapStatus()`.
interface ResolveCounter { resolves: number; }
const resolveCounters = new Map<AssetClass, ResolveCounter>();
let resolveAggrTimer: NodeJS.Timeout | null = null;

function bumpResolveCounter(assetClass: AssetClass): void {
  let counter = resolveCounters.get(assetClass);
  if (!counter) {
    counter = { resolves: 0 };
    resolveCounters.set(assetClass, counter);
  }
  counter.resolves++;
}

function startResolveAggregator(): void {
  if (resolveAggrTimer) return;
  resolveAggrTimer = setInterval(() => {
    if (resolveCounters.size === 0) return;
    const parts: string[] = [];
    for (const [cls, c] of resolveCounters.entries()) {
      parts.push(`${cls}=resolves:${c.resolves}`);
    }
    const minute = new Date().toISOString().slice(0, 16); // YYYY-MM-DDThh:mm
    console.log(`[TEC_RESOLVE_AGGR] minute=${minute} ${parts.join(' ')}`);
    resolveCounters.clear();
  }, 60_000);
  if (typeof resolveAggrTimer.unref === 'function') resolveAggrTimer.unref();
}

/**
 * B79.TEC: Synchronous per-class config lookup.
 *
 * Returns the cached snapshot for the given asset class. The cache is
 * pre-warmed by `primeTECConfig()` at boot before `server.listen()`, so a
 * miss at runtime is a programming error (asset class not in
 * ACTIVE_ASSET_CLASSES). Throws `[TEC_CACHE_MISS_FATAL]`.
 *
 * Stale-entry path: if the entry exists but TTL has elapsed, returns the
 * stale snapshot synchronously AND fires a background refresh (immutable
 * wholesale snapshot replacement). This preserves consistency-within-cycle
 * and avoids rendering the function async.
 */
export function resolveTECConfig(assetClass: AssetClass): TrailingExitConfig {
  const now = Date.now();
  const expiresAt = tecConfigExpiresAt.get(assetClass) ?? 0;

  // B79.TEC (Langston Q1): max-staleness ceiling. If the last successful
  // refresh is older than 5×TTL, the cache is too stale to trust for a
  // kill-switch key. Fail closed instead of returning the snapshot.
  const lastSuccess = tecConfigLastSuccessAt.get(assetClass) ?? 0;
  if (lastSuccess > 0 && now - lastSuccess > CONFIG_MAX_STALENESS_MS) {
    const stalenessMs = now - lastSuccess;
    const msg =
      `[TEC_STALE_FAIL_CLOSED] assetClass=${assetClass} cache age=${stalenessMs}ms exceeds ` +
      `ceiling ${CONFIG_MAX_STALENESS_MS}ms. Refusing to honor a stale kill-switch snapshot. ` +
      `Investigate DB connectivity and [TEC_REFRESH_FAIL] count.`;
    console.error(msg);
    throw new Error(msg);
  }

  // Background refresh on stale entry — non-blocking, fire-and-forget,
  // coalesced via inFlight Map (Langston Q1).
  //
  // B-NEW-40 (2026-05-17): wrap the refresh in Promise.race against a 45s
  // timeout so the inFlight Map ALWAYS releases — even when the underlying pg
  // promise neither resolves nor rejects (the silent-TCP-death failure mode).
  // Without this, a single hung refresh traps the Map entry for the rest of
  // process lifetime, blocking every future refresh attempt and producing the
  // permanent TEC_STALE_FAIL_CLOSED cascade observed 2026-05-15 and -16.
  //
  // 45s budget: pool query_timeout (30s, server/db.ts) rejects the underlying
  // query first; the 15s buffer covers event-loop scheduling, deserialization,
  // and GC. Tighter (30-35s) risks false timeouts on legitimate slow refreshes
  // during transient network blips. Looser (60s+) extends worst-case stale-
  // fail-closed window unnecessarily.
  //
  // Central Clock alignment: per-call one-shot deadline; NOT recurring. Plain
  // setTimeout is correct — subscribing to Central Clock for a 45s one-shot
  // would add subscriber churn for zero scheduling benefit. (See pre-audit
  // §2.6 Central Clock audit + Langston Step 1 Q7.)
  if (now >= expiresAt && !tecConfigRefreshInFlight.has(assetClass)) {
    const REFRESH_TIMEOUT_MS = 45_000;
    let timeoutHandle: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(
          new Error(
            `[TEC_REFRESH_TIMEOUT] assetClass=${assetClass} refresh exceeded ` +
            `${REFRESH_TIMEOUT_MS}ms budget without resolving or rejecting. ` +
            `Underlying pg promise is hung — releasing inFlight Map so next ` +
            `caller can attempt a fresh refresh.`,
          ),
        );
      }, REFRESH_TIMEOUT_MS);
    });

    const promise = Promise.race([
      refreshTECConfigForClass(assetClass),
      timeoutPromise,
    ])
      .catch((err) => {
        const failCount = (tecRefreshFailCount.get(assetClass) ?? 0) + 1;
        tecRefreshFailCount.set(assetClass, failCount);
        const isTimeout =
          err instanceof Error && err.message.startsWith('[TEC_REFRESH_TIMEOUT]');
        const logTag = isTimeout ? '[TEC_REFRESH_TIMEOUT]' : '[TEC_REFRESH_FAIL]';
        console.error(
          `${logTag} assetClass=${assetClass} background refresh failed ` +
          `(consecutive_fail_count=${failCount}):`,
          err,
        );
      })
      .finally(() => {
        if (timeoutHandle !== null) {
          clearTimeout(timeoutHandle);
        }
        tecConfigRefreshInFlight.delete(assetClass);
      });
    tecConfigRefreshInFlight.set(assetClass, promise);
  }

  const cached = tecConfigCache.get(assetClass);
  if (!cached) {
    const msg =
      `[TEC_CACHE_MISS_FATAL] resolveTECConfig called for assetClass=${assetClass} ` +
      `but cache has no entry. ACTIVE_ASSET_CLASSES iteration in primeTECConfig() ` +
      `should have warmed it at boot. Likely cause: caller passed an inactive ` +
      `asset class, OR primeTECConfig() was not awaited at boot. ` +
      `See BATCH_79_TEC_SCOPE.md §1 #8.`;
    console.error(msg);
    throw new Error(msg);
  }
  // B79.TEC (Langston Finding 1): traffic counter only. Wildcard-detection
  // path was dead code — see top-of-file comment block.
  bumpResolveCounter(assetClass);
  return cached;
}

/**
 * B79.TEC: Refresh a single class's snapshot from module_constants.
 *
 * Used both by primeTECConfig (await) and by the background TTL refresh
 * (fire-and-forget). The actual cache write is wholesale-immutable.
 *
 * Throws on DB error so primeTECConfig can aggregate per-class failures.
 * Background callers must catch.
 */
async function refreshTECConfigForClass(assetClass: AssetClass): Promise<void> {
  // B79.TEC: HARD-FAIL assertion — an EXPLICIT per-asset-class row for
  // `break_even_enabled` MUST exist in module_constants. Without this
  // check, getModuleConstants would silently fall back to the wildcard
  // row and primeTECConfig would succeed even when the operator's
  // per-class kill-switch is missing. That's exactly the silent-fallback
  // failure mode this batch fights. See scope §1 #5 + §3 hostile sim.
  const hasExplicit = await hasExplicitAssetClassRow(
    'trailing_exit',
    assetClass,
    'break_even_enabled',
  );
  if (!hasExplicit) {
    throw new Error(
      `module_constants is missing an explicit per-class row for ` +
      `(module=trailing_exit, asset_class=${assetClass}, constant=break_even_enabled). ` +
      `Run Migration 1 (drizzle/migrations/2026-05-08-b79-tec-per-class-be-rows.sql) ` +
      `before starting the app, or insert the row manually via psql.`,
    );
  }

  // Resolve with explicit assetClass.
  const rows = await getModuleConstants('trailing_exit', {
    exchange: 'kraken',
    assetClass,
    strategy: '*',
    regime: '*',
  });

  const pick = <T>(key: string, fallback: T): T =>
    rows[key] !== undefined ? (rows[key] as T) : fallback;

  // Build the snapshot. `break_even_enabled` is asserted to have an explicit
  // per-class row by hasExplicitAssetClassRow above; other keys may resolve
  // via wildcard fallback inside getModuleConstants (intentional — see
  // RUNNING_ISSUES #85 for the B79.x follow-up to extend HARD-FAIL coverage).
  const snapshot: TrailingExitConfig = {
    breakEvenEnabled: pick('break_even_enabled', TEC_DEFAULTS.breakEvenEnabled),
    breakEvenTriggerR: pick('break_even_trigger_r', TEC_DEFAULTS.breakEvenTriggerR),
    targetLockR: pick('target_lock_r', TEC_DEFAULTS.targetLockR),
    trailDistanceAtrMultiplier: pick('trail_distance_atr_multiplier', TEC_DEFAULTS.trailDistanceAtrMultiplier),
    persistenceDebounceMs: pick('persistence_debounce_ms', TEC_DEFAULTS.persistenceDebounceMs),
    moonbagQualifyingStrategies: pick('moonbag_qualifying_strategies', TEC_DEFAULTS.moonbagQualifyingStrategies),
    moonbagQualifyingSourcePools: pick('moonbag_qualifying_source_pools', TEC_DEFAULTS.moonbagQualifyingSourcePools),
    moonbagMaxDurationMs: pick('moonbag_max_duration_ms', TEC_DEFAULTS.moonbagMaxDurationMs),
    moonbagCapMode: pick('moonbag_cap_mode', TEC_DEFAULTS.moonbagCapMode),
    moonbagReservedSlots: pick('moonbag_reserved_slots', TEC_DEFAULTS.moonbagReservedSlots),
    rungFloorSlippageBufferMultiplier: pick('rung_floor_slippage_buffer_multiplier', TEC_DEFAULTS.rungFloorSlippageBufferMultiplier),
  };

  tecConfigCache.set(assetClass, snapshot);
  const now = Date.now();
  tecConfigExpiresAt.set(assetClass, now + CONFIG_TTL_MS);
  // B79.TEC (Langston Q1): stamp last-success time for the staleness-ceiling
  // check + reset consecutive-fail counter so the diagnostic endpoint shows
  // recovery once the DB is back.
  tecConfigLastSuccessAt.set(assetClass, now);
  tecRefreshFailCount.set(assetClass, 0);
}

/**
 * B65.2 / B79.TEC: Public check — does this trade qualify for moonbag mode?
 * Now sync (cache pre-warmed by primeTECConfig). Caller must pass `assetClass`.
 */
export function isMoonbagQualifier(
  assetClass: AssetClass,
  strategy: string,
  sourcePool: string | null | undefined,
  _regime?: string, // retained for call-site compat; per-strategy/regime moonbag override is a future B79.x scope item.
): boolean {
  const cfg = resolveTECConfig(assetClass);
  if (!cfg.moonbagQualifyingStrategies.includes(strategy)) return false;
  const requiredPools = cfg.moonbagQualifyingSourcePools?.[strategy];
  if (requiredPools && requiredPools.length > 0) {
    if (!sourcePool || !requiredPools.includes(sourcePool)) return false;
  }
  return true;
}

/**
 * B65.2 / B79.TEC: Concurrency cap check. Now sync. Caller must pass `assetClass`.
 * - VTS: always true (no cap).
 * - Paper/live: true iff current concurrent moonbags < slot_total - reserved.
 */
export function canEnterMoonbag(
  assetClass: AssetClass,
  mode: CallerMode,
  currentSlotTotal: number,
  _strategy?: string,
  _regime?: string,
): boolean {
  if (mode === 'vts') return true;
  const cfg = resolveTECConfig(assetClass);
  if (cfg.moonbagCapMode === 'unlimited') return true;
  const current = concurrentMoonbagByMode[mode];
  const allowed = currentSlotTotal - cfg.moonbagReservedSlots;
  return current < allowed;
}

/**
 * B65.2 / B79.TEC: Returns the resolved TEC snapshot for the given asset class.
 * Diagnostics + tests. Safe to call frequently — sync map lookup.
 */
export function getResolvedTECConfig(assetClass: AssetClass): TrailingExitConfig {
  return resolveTECConfig(assetClass);
}

/**
 * B79.TEC diagnostic accessor (added 2026-05-16 for TEC stale-fail-closed
 * root-cause investigation per Kyle directive).
 *
 * Returns a read-only snapshot of the internal per-class TEC state maps
 * so an HTTP endpoint can observe whether a refresh is in-flight, the
 * cache's expiry/staleness, and the consecutive-fail count without
 * mutating the maps. Purpose-built to confirm/refute the "refresh promise
 * hangs and locks inFlight Map" hypothesis at incident time.
 */
export interface TECDiagnosticEntry {
  assetClass: AssetClass;
  cached: boolean;
  refreshInFlight: boolean;
  expiresAtMs: number | null;
  msSinceExpiry: number | null;
  lastSuccessAtMs: number | null;
  msSinceLastSuccess: number | null;
  consecutiveFailCount: number;
  staleByCeiling: boolean;
}

export interface TECDiagnosticSnapshot {
  nowMs: number;
  configTtlMs: number;
  maxStalenessMs: number;
  classes: TECDiagnosticEntry[];
}

export function getTECDiagnostics(): TECDiagnosticSnapshot {
  const now = Date.now();
  const classes: TECDiagnosticEntry[] = [];
  // Collect union of all keys across the four state maps so we report a
  // row even for an asset class that's e.g. inFlight but missing from cache.
  const allKeys = new Set<AssetClass>();
  for (const k of tecConfigCache.keys()) allKeys.add(k);
  for (const k of tecConfigExpiresAt.keys()) allKeys.add(k);
  for (const k of tecConfigLastSuccessAt.keys()) allKeys.add(k);
  for (const k of tecConfigRefreshInFlight.keys()) allKeys.add(k);
  for (const k of tecRefreshFailCount.keys()) allKeys.add(k);
  for (const assetClass of allKeys) {
    const expiresAt = tecConfigExpiresAt.get(assetClass) ?? null;
    const lastSuccess = tecConfigLastSuccessAt.get(assetClass) ?? null;
    classes.push({
      assetClass,
      cached: tecConfigCache.has(assetClass),
      refreshInFlight: tecConfigRefreshInFlight.has(assetClass),
      expiresAtMs: expiresAt,
      msSinceExpiry: expiresAt !== null ? now - expiresAt : null,
      lastSuccessAtMs: lastSuccess,
      msSinceLastSuccess: lastSuccess !== null ? now - lastSuccess : null,
      consecutiveFailCount: tecRefreshFailCount.get(assetClass) ?? 0,
      staleByCeiling:
        lastSuccess !== null && now - lastSuccess > CONFIG_MAX_STALENESS_MS,
    });
  }
  return {
    nowMs: now,
    configTtlMs: CONFIG_TTL_MS,
    maxStalenessMs: CONFIG_MAX_STALENESS_MS,
    classes,
  };
}

/**
 * B65.4 / B79.TEC: Test-only helper. Invalidates ALL per-class cache entries
 * so the next resolveTECConfig() call triggers a background refresh on each.
 * Tests that mutate module_constants mid-flight should call this AND await
 * a fresh primeTECConfig() to get synchronously-warm cache state.
 */
export function _testClearEngineConfigCache(): void {
  for (const cls of tecConfigExpiresAt.keys()) {
    tecConfigExpiresAt.set(cls, 0);
  }
  // Clear cache too — forces a hard-miss on next resolve unless re-primed.
  tecConfigCache.clear();
}

/**
 * Directive 9.2.D: Schedule persistence save (debounced)
 */
function schedulePersistence(): void {
  if (persistenceTimer) {
    clearTimeout(persistenceTimer);
  }
  persistenceTimer = setTimeout(async () => {
    try {
      const { persistTrailingStates } = await import('./trade-safety.js');
      persistTrailingStates();
    } catch (err) {
      console.error('[9.2][PERSIST] Failed to schedule persistence:', err);
    }
  }, PERSIST_DEBOUNCE_MS);
}

/**
 * Directive 9.2.D: Update trade mode in database when mode changes
 */
async function syncTradeModeToStorage(symbol: string, tradeMode: TradeMode): Promise<void> {
  try {
    const { storage } = await import('../storage.js');
    // Update paper positions
    const paperPositions = await storage.getPaperSimOpenPositions('paper');
    const paperPosition = paperPositions.find((p: any) => p.symbol === symbol);
    if (paperPosition) {
      await storage.updatePaperSimOpenPosition(paperPosition.id, { tradeMode });
      console.log(`[9.2][MODE_SYNC] ${symbol} DB updated to ${tradeMode}`);
    }
    // Also check live positions
    const livePositions = await storage.getPaperSimOpenPositions('live');
    const livePosition = livePositions.find((p: any) => p.symbol === symbol);
    if (livePosition) {
      await storage.updatePaperSimOpenPosition(livePosition.id, { tradeMode });
      console.log(`[9.2][MODE_SYNC] ${symbol} DB (live) updated to ${tradeMode}`);
    }
  } catch (err) {
    console.error(`[9.2][MODE_SYNC] Failed to sync ${symbol}:`, err);
  }
}

export interface TrailingState {
  /**
   * B80 (2026-05-13): per-trade keying. TEC state is now keyed by trade.id
   * (VTS: `vts_<assetClass>_<ts>_<rand>`; paper/live: DB UUID). symbol is
   * retained as a display/log field but no longer the Map key. Resolves the
   * multi-trade-per-symbol bug where concurrent trades on FET/USD (e.g.
   * range_trade + support_bounce + morning_star) all shared one TEC state
   * and inherited the FIRST trade's stop as their trigger price. See
   * RUNNING_ISSUES #105 + BATCH_80_SCOPE rev2.
   */
  tradeId: string;
  symbol: string;
  tradeMode: TradeMode;
  entryPrice: number;
  targetPrice: number;     // ORIGINAL target at trade open. Reference only.
  currentStopPrice: number;
  highWaterMark: number;
  breakEvenLatched: boolean;
  targetLatched: boolean;
  lastUpdated: number;
  DI: number;
  VolNoise: number;
  ATR: number;
  // B65.2: set when the trade flips into TRAILING_TAKE mode; used by the
  // duration-cap check to fire `moonbag_timeout` close decisions.
  moonbagEnteredAt?: number;
  // B65.2: caller mode — tracked so concurrency counter decrements on the
  // correct mode when the trade closes.
  callerMode?: CallerMode;
  // B65.4 (2026-04-25): ladder rung tracking. Each time price hits the
  // current rung target, both target and stop ratchet up to a new rung.
  // ladderRung = 0 means trade has not yet entered moonbag (no targets hit).
  // ladderRung = 1 means original target was hit (first moonbag rung).
  // ladderRung = N means N target hits in moonbag mode have occurred.
  // currentRungTarget tracks the active target being aimed at (advances on
  // each rung event). currentRungFloor is the cost-aware floor that the
  // active stop cannot drop below — set to net-target-floor of the
  // PREVIOUS rung's target after each ratchet. Stop = max(currentRungFloor,
  // dynamic_HWM_trail) so HWM-based ratchet still applies between rungs
  // and provides additional upside capture if price runs significantly
  // past the current target without crossing the next one.
  ladderRung: number;
  currentRungTarget: number;
  currentRungFloor: number;
  // B65.4.2 (2026-04-28): observability fields for ladder mechanics in CSV exports.
  // Captured from engine state so reports can show what actually happened without
  // grepping PM2 logs. All optional for backward-compat with persisted states.
  //
  // originalStopPrice: the stop set at trade-open time, before any ratcheting.
  //   Captured once at initializeTrailingState() and never modified.
  // latchTriggerPrice: the actual price at which targetLatch fired (the rung-1
  //   ratchet event). Only set once when targetLatched flips false→true.
  //   Useful because target_lock_r interaction means latch can fire below the
  //   strategy's published target on tight-stop trades.
  // rungTargetHistory: ordered array of rung target prices crossed. Index 0 is
  //   the original target (rung 1 — set when targetLatched), each subsequent
  //   entry is appended on each ratchet event. Length reflects ladderRung at
  //   the moment of capture.
  originalStopPrice?: number;
  latchTriggerPrice?: number;
  rungTargetHistory?: number[];
}

/**
 * B80 (2026-05-13): Option C+ rehydrate seed. Callers (vts-runner / paper-
 * execution-engine) build this from the in-memory trade record on the first
 * exit-cycle for an open trade post-deploy, so the freshly-initialized per-
 * trade TEC state preserves the in-flight `tradeMode`, `ladderRung`, and
 * `originalStopPrice`. Default = current behavior (no seed): bounds the
 * regression surface for callers that don't pass it.
 *
 * `currentRungTarget` is intentionally NOT in the seed — it is fully
 * deterministic from `entryPrice + (ladderRung + 1) * (targetPrice -
 * entryPrice)` (see updatePosition's `rungStepPrice` derivation). Same for
 * `currentRungFloor`, recomputed on the next exit-cycle from the prev rung
 * target.
 */
export interface TrailingStateSeed {
  tradeMode?: TradeMode;
  ladderRung?: number;
  originalStopPrice?: number;
  /**
   * Optional — can be re-derived at next cycle from `stopLoss >= netBreakeven`.
   * Pass through if you want immediate consistency; otherwise leave undefined
   * and the BE-latch will re-evaluate on the first cycle.
   */
  breakEvenLatched?: boolean;
}

export interface PositionUpdate {
  /**
   * B80 (2026-05-13): per-trade keying. TEC state Map is keyed by tradeId.
   * VTS callers pass the OpenVirtualTrade.id; paper/live callers pass the
   * paper_sim_open_positions.id (DB UUID). Required.
   */
  tradeId: string;
  symbol: string;
  entryPrice: number;
  targetPrice: number;
  currentPrice: number;
  DI: number;
  VolNoise: number;
  ATR: number;
  currentStopPrice: number;
  /**
   * B80 (2026-05-13): optional Option C+ rehydrate seed. Callers pass this
   * on the FIRST exit-cycle after PM2 restart so initializeTrailingState
   * reconstructs the in-flight TEC state from trade-record fields. Subsequent
   * cycles pass nothing — the engine state is in memory.
   */
  seed?: TrailingStateSeed;
  /**
   * B-NEW-42b (2026-05-17): optional tick timestamp for the price-discontinuity
   * detector. Production callers omit (defaults to Date.now() — the price-tick
   * arrival time). Test callers pass explicit values to simulate halt timing
   * and discontinuity windows without fake timers.
   */
  currentTs?: number;
  /**
   * B-NEW-42b (2026-05-17) per Langston Step 4 BLOCKER 2: discontinuity result
   * pre-resolved by the caller (typically `tec-evaluator.ts` consults the
   * detector ONCE per logical tick and threads the result down). When provided,
   * `updatePosition` uses this for the target-lock skip decision INSTEAD of
   * calling the detector itself. Eliminates the double-consultation bug where
   * two state-machine advances per logical tick collapsed the intended 2-tick
   * deferral into 1.
   *
   * Direct callers (b65/b80/b79 crypto-path tests) omit this param → no
   * detector gate runs, pre-B-NEW-42b behavior preserved (crypto-path
   * back-compat).
   */
  discontinuity?: { active: boolean; kind?: string };
  // B65.2: extra inputs for moonbag gating + concurrency tracking.
  strategy?: string;
  sourcePool?: string | null;
  regime?: string;
  callerMode?: CallerMode; // default 'paper' for backward compat
  /**
   * B65.2: Result of the caller's upstream `canEnterMoonbag` check.
   * Passed in rather than queried inside updatePosition to avoid turning
   * the update into async. If false, target-lock will still latch but
   * mode WILL NOT flip to TRAILING_TAKE — trade closes at target instead.
   * If caller omits, defaults to true (backward-compatible for paths that
   * haven't been wired to the cap yet).
   */
  moonbagAllowed?: boolean;
  /**
   * B65.2: Result of the caller's upstream `isMoonbagQualifier` check.
   * Same rationale — injected by caller. If false, no trailing.
   * Default true for backward compatibility.
   */
  moonbagQualified?: boolean;
  /**
   * B79.TEC: Asset class of the position. NON-OPTIONAL after B79.TEC
   * per-asset-class TEC config refactor. Drives:
   *   - per-class config lookup via resolveTECConfig(assetClass)
   *   - market-closed stop-freeze (xstock_spot only)
   *
   * No silent fallback (CLAUDE.md §11). Every call site MUST pass an
   * explicit AssetClass — TS compile catches missing ones; runtime callers
   * that bypass the type system throw `[TEC_UPDATE_MISSING_ASSET_CLASS]`.
   */
  assetClass: AssetClass;
}

export interface TrailingUpdateResult {
  /** B80 (2026-05-13): tradeId echoed back for caller-side invariant assertion. */
  tradeId: string;
  symbol: string;
  previousMode: TradeMode;
  newMode: TradeMode;
  modeChanged: boolean;
  newStopPrice: number;
  stopMoved: boolean;
  breakEvenLatched: boolean;
  targetLatched: boolean;
  highWaterMark: number;
  // B65.2: when true, the caller should close the trade at currentPrice with
  // the specified exit reason. Indicates a TEC-authored terminal decision
  // (moonbag duration cap hit; mode-flip refused for qualifier/cap reasons
  // → caller should use static target close).
  closeNow?: boolean;
  closeReason?: 'moonbag_timeout' | 'target_hit_no_trailing';
  // B65.4 (2026-04-25): rung count is propagated through the result so the
  // evaluator + caller can capture it on the closed-trade record. Equals
  // state.ladderRung after this update — 0 if trade hasn't entered moonbag,
  // 1+ if it has (1 = original target hit, 2+ = ratcheted further up the
  // ladder).
  ladderRungsHit: number;
  // B65.4.2 (2026-04-28): observability fields propagated alongside
  // ladderRungsHit. Optional because some paths don't surface them (and
  // legacy persisted states may not have them). Caller persists these to the
  // closed-trade record alongside ladderRungsHit.
  originalStopPrice?: number;
  latchTriggerPrice?: number;
  rungTargetHistory?: number[];
}

const trailingStates = new Map<string, TrailingState>();

// B79: TEC stop-freeze counter for market-closed periods on xstock_spot positions.
// Increments on every updatePosition() call that's short-circuited because the
// equity market is closed. Logged every 100 occurrences so PM2 logs surface the
// rate without spam.
let _b79TecFreezeCount = 0;

/**
 * Directive 9.2.A: Initialize trailing state for a new position.
 * B80 (2026-05-13): keyed by tradeId. Optional `seed` parameter activates
 * Option C+ rehydrate path — caller passes the trade record's in-flight
 * `tradeMode`, `ladderRung`, `originalStopPrice` so a post-deploy restart
 * preserves moonbag trade protection instead of silently downgrading them
 * to TARGET mode. `currentRungTarget` and `currentRungFloor` are deterministic
 * from entry + target + ladderRung and are computed below — NOT seeded.
 */
export function initializeTrailingState(
  tradeId: string,
  symbol: string,
  entryPrice: number,
  targetPrice: number,
  initialStopPrice: number,
  DI: number = 50,
  VolNoise: number = 0.3,
  ATR: number = 0,
  seed?: TrailingStateSeed,
): TrailingState {
  // B80: seed-aware ladder reconstruction. Rung step = R = targetPrice - entryPrice.
  // At ladderRung=N (≥1), currentRungTarget = targetPrice + N×R. Deterministic.
  const rungStepPrice = targetPrice - entryPrice;
  const rawSeededRung = seed?.ladderRung ?? 0;
  const seededMode: TradeMode =
    seed?.tradeMode ?? (rawSeededRung >= 1 ? 'TRAILING_TAKE' : 'TARGET');
  // B80 (Langston Phase 1 review revision): defensive mode-rung consistency
  // enforcement. A TRAILING_TAKE state MUST have rung >= 1 and targetLatched=true
  // by engine invariant. If caller seeded TRAILING_TAKE but ladderRung is null
  // or 0 (narrow timing-window case at deploy: mode writeback landed but rung
  // writeback didn't; or pre-B65.4 legacy row), coerce to rung=1 (just-latched
  // semantics) rather than constructing a half-broken state that would silently
  // lose ladder trailing logic on the next exit-cycle. Keeps consistency rules
  // in one place — protects against caller errors AND future callers who don't
  // read scope §4.4 carefully. See BATCH_80 Phase 1 review reply.
  const seededRung = seededMode === 'TRAILING_TAKE' ? Math.max(1, rawSeededRung) : rawSeededRung;
  const seededTargetLatched = seededMode === 'TRAILING_TAKE';
  const seededRungTarget =
    seededRung >= 1 ? targetPrice + seededRung * rungStepPrice : targetPrice;

  const state: TrailingState = {
    tradeId,
    symbol,
    tradeMode: seededMode,
    entryPrice,
    targetPrice,
    currentStopPrice: initialStopPrice,
    highWaterMark: entryPrice,
    breakEvenLatched: seed?.breakEvenLatched ?? false,
    targetLatched: seededTargetLatched,
    lastUpdated: Date.now(),
    DI,
    VolNoise,
    ATR,
    // B65.4 / B80: ladder rung reconstructed from seed if present.
    ladderRung: seededRung,
    currentRungTarget: seededRungTarget,
    currentRungFloor: 0, // will ratchet on next cycle if applicable
    // B65.4.2: originalStopPrice preserved from seed when rehydrating; else
    // captured at init time. Per Langston rev2 #2 callout, on emergency
    // git-revert the pre-fix code lacks Option C+ rehydrate — in-flight
    // moonbag trades will degrade to TARGET on revert. Documented in
    // BATCH_80 rollback playbook.
    originalStopPrice: seed?.originalStopPrice ?? initialStopPrice,
    rungTargetHistory: [],
    // B80: track moonbag counter increment if seeded as TRAILING_TAKE so
    // concurrency cap remains accurate across restarts.
  };

  trailingStates.set(tradeId, state);
  const seedNote = seed ? ` (seeded: rung=${seededRung} mode=${seededMode})` : '';
  console.log(
    `[9.2][EXIT] ${symbol} tradeId=${tradeId} initialized: ` +
    `entry=${entryPrice.toFixed(4)}, target=${targetPrice.toFixed(4)}, ` +
    `stop=${initialStopPrice.toFixed(4)}, mode=${seededMode}${seedNote}`
  );

  // Directive 9.2.D: Schedule persistence save after state creation
  schedulePersistence();

  return state;
}

/**
 * Directive 9.2.A: Get current trailing state for a position.
 * B80: keyed by tradeId.
 */
export function getTrailingState(tradeId: string): TrailingState | undefined {
  return trailingStates.get(tradeId);
}

/**
 * Directive 9.2.A: Update position and compute new trailing stop
 * Implements the two-stage latch system:
 * - Stage 1 (Break-Even): When price gains 1×ATR, stop moves to entry
 * - Stage 2 (Target Lock): When price hits target, stop locks to target, mode → TRAILING_TAKE
 */
export function updatePosition(update: PositionUpdate): TrailingUpdateResult {
  // ───── B79: market-closed stop-freeze (Langston PIA Q5 placement) ─────
  // For xstock_spot positions, when the equity market is closed (ARCA
  // hours; weekend; future-extension US holidays), short-circuit the entire
  // stop-evaluation. No price action means stops can't fire correctly, and
  // running the evaluation would just spam noise. Crypto_spot defaults
  // pass-through (no gate) to preserve no-touch fence.
  // (B79 Step 4 N1 cleanup: market-hours is a leaf module with NO imports —
  // there is no cycle hazard; static import is the ESM-native, type-checked
  // path. The earlier `require()` was a defensive hold-over and has been
  // removed in favor of the static import at the top of the file.)
  //
  // B79.TEC (2026-05-08): runtime assertion that assetClass was passed.
  // PositionUpdate.assetClass is non-optional in TS, but defensive guard
  // catches any caller that bypasses types (e.g. JS-side test stubs).
  if (!update.assetClass) {
    const msg =
      `[TEC_UPDATE_MISSING_ASSET_CLASS] updatePosition called for symbol=${update.symbol} ` +
      `tradeId=${update.tradeId} without assetClass. Every TEC-evaluated position must carry ` +
      `an explicit AssetClass. See BATCH_79_TEC_SCOPE.md §1 #3.`;
    console.error(msg);
    throw new Error(msg);
  }
  // B80 (2026-05-13): runtime assertion that tradeId was passed. PositionUpdate.tradeId
  // is non-optional in TS, but defensive guard catches any caller that bypasses types.
  if (!update.tradeId) {
    const msg =
      `[TEC_UPDATE_MISSING_TRADE_ID] updatePosition called for symbol=${update.symbol} ` +
      `without tradeId. BATCH_80 requires per-trade keying — every TEC-evaluated position ` +
      `must carry an explicit tradeId. See BATCH_80_SCOPE.md.`;
    console.error(msg);
    throw new Error(msg);
  }
  const { assetClass } = update;
  if (assetClass === 'xstock_spot') {
    // B79.0c: per-symbol — 24/7 names (Kraken Phase 1) get normal stop-eval
    // through the weekend; only ARCA-aligned 24/5 names freeze.
    // B80: freeze GATE keys by symbol (market-hours is a symbol property); freeze
    // STATE lookup keys by tradeId (Langston rev1 §4.3 callout — keep the texture
    // between symbol-level and trade-level explicit).
    if (!isXstockMarketOpenUTC(update.symbol)) {
      _b79TecFreezeCount++;
      if (_b79TecFreezeCount % 100 === 1) {
        console.log(
          `[B79][TEC_FREEZE] ${update.symbol} tradeId=${update.tradeId} ` +
          `(xstock_spot, market closed) — skipping stop-eval (count=${_b79TecFreezeCount})`
        );
      }
      // Return current state unchanged — no stop movement, no mode change.
      const existing = trailingStates.get(update.tradeId);
      const mode = existing?.tradeMode ?? 'PROTECT_GAINS' as TradeMode;
      return {
        tradeId: update.tradeId,
        symbol: update.symbol,
        previousMode: mode,
        newMode: mode,
        modeChanged: false,
        newStopPrice: existing?.currentStopPrice ?? update.currentStopPrice,
        stopMoved: false,
        breakEvenLatched: existing?.breakEvenLatched ?? false,
        targetLatched: existing?.targetLatched ?? false,
        highWaterMark: existing?.highWaterMark ?? update.currentPrice,
        ladderRungsHit: existing?.ladderRung ?? 0,
      };
    }
  }
  // ─────────────────────────────────────────────────────────────────────

  let state = trailingStates.get(update.tradeId);

  if (!state) {
    // B80: Option C+ rehydrate — pass seed if caller provided one. Caller
    // builds seed from trade-record fields on the first exit-cycle for an
    // open trade post-deploy.
    state = initializeTrailingState(
      update.tradeId,
      update.symbol,
      update.entryPrice,
      update.targetPrice,
      update.currentStopPrice,
      update.DI,
      update.VolNoise,
      update.ATR,
      update.seed,
    );
    // B80: if seed indicated TRAILING_TAKE on rehydrate, increment the
    // concurrency counter to preserve cap-enforcement accuracy across restarts.
    if (state.tradeMode === 'TRAILING_TAKE' && update.callerMode) {
      concurrentMoonbagByMode[update.callerMode] += 1;
      console.log(
        `[B80][MOONBAG_REHYDRATE] ${update.symbol} tradeId=${update.tradeId} ` +
        `rehydrated as TRAILING_TAKE (rung=${state.ladderRung}); counter ${update.callerMode}=${concurrentMoonbagByMode[update.callerMode]}`
      );
    }
  }
  
  const previousMode = state.tradeMode;
  const previousStop = state.currentStopPrice;
  let newStopPrice = state.currentStopPrice;
  let modeChanged = false;
  
  state.DI = update.DI;
  state.VolNoise = update.VolNoise;
  state.ATR = update.ATR;
  
  if (update.currentPrice > state.highWaterMark) {
    state.highWaterMark = update.currentPrice;
    console.log(`[9.2][EXIT] ${update.symbol} tradeId=${update.tradeId} new HWM=${state.highWaterMark.toFixed(4)}`);
  }
  
  // B79.TEC: per-asset-class config snapshot (sync map lookup; cache pre-warmed
  // by primeTECConfig at boot). All `cfg.*` reads in this function MUST be
  // taken from this snapshot — never directly from a global cache. This is
  // the structural fix that makes BE-latch (and all other TEC knobs)
  // honor per-class settings instead of silently inheriting crypto_spot's.
  const cfg = resolveTECConfig(assetClass);

  // Directive 11.3A: Get cost metrics for net-aware floor calculations
  // B79.0n.MCE: assetClass REQUIRED — the TEC controller already carries the
  // per-trade `assetClass` (resolved above for resolveTECConfig), so the cost
  // lookup uses that cycle-context value directly.
  const costMetrics = getCachedCostMetrics(update.symbol, assetClass);
  const netBreakeven = computeNetBreakeven(state.entryPrice, costMetrics);
  // B65.4.1 (2026-04-26): rung floor placement uses a slippage buffer above the
  // just-hit target so reversals can't fall below the gain we already achieved.
  // Multiplier is module_constants-resolved per-class via the cfg snapshot.
  const rungFloorMult = cfg.rungFloorSlippageBufferMultiplier;
  const netTargetFloor = computeNetTargetFloor(state.targetPrice, costMetrics, rungFloorMult);

  // Post-B75 (2026-05-06): BE-latch gated by `trailing_exit.break_even_enabled`.
  // B79.TEC (2026-05-08): now resolved per-asset-class. crypto_spot remains
  // false (variant K winner); xstock_spot starts false (Day 1 default;
  // flips after B79.4 ablation evidence per RUNNING_ISSUES #80).
  if (cfg.breakEvenEnabled && !state.breakEvenLatched && state.ATR > 0) {
    // B77 (2026-05-07, RUNNING_ISSUES #71 fix): pass breakEvenTriggerR explicitly
    // so the trailing_exit.break_even_trigger_r module_constant actually drives
    // the gate (was a no-op since B65.1).
    if (isBreakEvenTriggered(update.currentPrice, state.entryPrice, state.ATR, cfg.breakEvenTriggerR)) {
      state.breakEvenLatched = true;
      // Directive 11.3A: Use net breakeven (accounts for costs) instead of gross entry
      newStopPrice = Math.max(newStopPrice, netBreakeven);
      console.log(`[9.2][LOCK] ${update.symbol} tradeId=${update.tradeId} BREAK-EVEN latched @ ${netBreakeven.toFixed(4)} (net, ${cfg.breakEvenTriggerR}×ATR gain, assetClass=${assetClass})`);
    }
  }
  
  // B65.2: moonbag qualifier + concurrency cap + caller mode tracked on state
  const moonbagQualified = update.moonbagQualified !== false; // default true
  const moonbagAllowed = update.moonbagAllowed !== false;     // default true
  state.callerMode = update.callerMode ?? state.callerMode ?? 'paper';

  let closeNow = false;
  let closeReason: TrailingUpdateResult['closeReason'] | undefined;

  // B65.4 (2026-04-25): Ladder model. The original target is treated as
  // rung 1; each subsequent rung is a +R-distance step (where R = original
  // entry-to-stop distance). On each rung event:
  //   - target advances to (current_target + R_step)
  //   - stop locks at the cost-aware floor of the previous rung's target
  //     (i.e. the rung we just hit). This is the rung's locked-in profit.
  //   - ladderRung increments
  //
  // Order of operations within a single update is critical (Langston's Q5
  // ordering-sensitivity test): the rung-target check happens BEFORE HWM
  // update for THIS cycle's currentPrice, so the rung floor is computed
  // against the previous rung's target, not against a HWM that already
  // includes today's spike past the rung target.
  //
  // We process rung events in a loop so a single cycle that gaps past
  // multiple rungs (e.g. price jump on a large candle) ladders up
  // correctly through every rung it cleared. Defense against state drift.

  const originalRiskPerUnit = state.entryPrice - update.currentStopPrice;
  // For the rung step, derive R (risk in price units) from the trade's
  // ORIGINAL entry-to-stop distance. We use update.currentStopPrice ONLY
  // for the very first computation; thereafter the engine doesn't have
  // the original stop anymore (it's been ratcheted). So we capture the
  // step distance once on first ladder evaluation and store via target
  // arithmetic: rung_step = (originalTarget - entryPrice) — this matches
  // the geometry the strategy designed (target distance from entry IS
  // the step size).
  const rungStepPrice = state.targetPrice - state.entryPrice;

  // First, handle the initial target-latch event (rung 0 → rung 1).
  //
  // B-NEW-42b (2026-05-17): discontinuity gate. If the detector flags this
  // tick as a price discontinuity (reverse-split jump, corp-action, halt
  // resume, cold-start), short-circuit the target-lock check. Prevents
  // phantom-promotion to TRAILING_TAKE on what is structurally a non-event
  // (e.g. a 2× single-bar jump crossing target on a 1:2 reverse split).
  // Crypto symbols + idle xStock symbols pass through unchanged (detector
  // returns `{active: false}`).
  // B-NEW-42b (Step 4 fix BLOCKER 2): consume pre-resolved discontinuity from
  // the caller (tec-evaluator hoists the single detector call). Fall back to
  // direct consultation only if discontinuity wasn't provided AND target isn't
  // latched yet (matches pre-Step-4-review behavior for direct callers).
  const targetLockDiscontinuity = state.targetLatched
    ? { active: false }
    : (update.discontinuity ?? isDiscontinuityActive(update.symbol, update.currentPrice, update.currentTs ?? Date.now()));
  if (targetLockDiscontinuity.active) {
    console.log(
      `[B-NEW-42b][TEC_DISCONTINUITY_SKIP_TARGETLOCK] ${update.symbol} ` +
      `tradeId=${update.tradeId} kind=${targetLockDiscontinuity.kind} — ` +
      `deferring target-lock check (currentPrice=${update.currentPrice.toFixed(4)}, ` +
      `targetPrice=${state.targetPrice.toFixed(4)}).`,
    );
  }
  if (!state.targetLatched && !targetLockDiscontinuity.active) {
    if (isTargetLockTriggered(update.currentPrice, state.targetPrice)) {
      state.targetLatched = true;

      if (moonbagQualified && moonbagAllowed) {
        // Enter moonbag at rung 1.
        state.tradeMode = 'TRAILING_TAKE';
        state.moonbagEnteredAt = Date.now();
        state.ladderRung = 1;
        // Lock the cost-aware floor at the original target's net-target floor.
        state.currentRungFloor = netTargetFloor;
        // Advance the rung target by one R-step.
        state.currentRungTarget = state.targetPrice + rungStepPrice;
        // B65.4.2: capture the actual price at which the latch fired (may be
        // different from state.targetPrice if target_lock_r interaction means
        // latch can fire at +1.5R from entry rather than at the strategy's
        // published target). And start rungTargetHistory with the just-hit rung.
        state.latchTriggerPrice = update.currentPrice;
        if (!state.rungTargetHistory) state.rungTargetHistory = [];
        state.rungTargetHistory.push(state.targetPrice);
        modeChanged = true;
        concurrentMoonbagByMode[state.callerMode] += 1;
        newStopPrice = Math.max(newStopPrice, state.currentRungFloor);
        console.log(`[9.2][LADDER] ${update.symbol} tradeId=${update.tradeId} rung=1 (entry-target hit) — new_target=${state.currentRungTarget.toFixed(4)} new_floor=${state.currentRungFloor.toFixed(4)} mode=${state.callerMode} concurrent=${concurrentMoonbagByMode[state.callerMode]}`);
      } else {
        // Qualifier rejected or cap hit → close at target, no ladder.
        // Stop still ratchets to the net-target floor for protection on the close fill.
        newStopPrice = Math.max(newStopPrice, netTargetFloor);
        closeNow = true;
        closeReason = 'target_hit_no_trailing';
        const reason = !moonbagQualified ? 'strategy-not-qualified' : 'concurrency-cap-reached';
        console.log(`[9.2][MODE] ${update.symbol} tradeId=${update.tradeId} → TARGET close (moonbag denied: ${reason})`);
      }
    }
  }

  // Then, while in TRAILING_TAKE, ratchet through any further rungs the
  // current price has cleared. Loop handles multi-rung price gaps.
  if (state.targetLatched && state.tradeMode === 'TRAILING_TAKE' && !closeNow) {
    while (update.currentPrice >= state.currentRungTarget) {
      // The rung we are CROSSING becomes the new floor (cost-aware).
      // B65.4.1: rungFloorMult resolved earlier from module_constants.
      const justHitTarget = state.currentRungTarget;
      const hitFloor = computeNetTargetFloor(justHitTarget, costMetrics, rungFloorMult);
      state.currentRungFloor = Math.max(state.currentRungFloor, hitFloor);
      state.ladderRung += 1;
      state.currentRungTarget = justHitTarget + rungStepPrice;
      // B65.4.2: append the just-crossed rung target to history.
      if (!state.rungTargetHistory) state.rungTargetHistory = [];
      state.rungTargetHistory.push(justHitTarget);
      newStopPrice = Math.max(newStopPrice, state.currentRungFloor);
      console.log(`[9.2][LADDER] ${update.symbol} tradeId=${update.tradeId} rung=${state.ladderRung} (target ${justHitTarget.toFixed(4)} hit) — new_target=${state.currentRungTarget.toFixed(4)} new_floor=${state.currentRungFloor.toFixed(4)}`);
    }
  }

  // Then, duration cap check (only if we are in TRAILING_TAKE and didn't already close).
  if (state.targetLatched && state.tradeMode === 'TRAILING_TAKE' && state.moonbagEnteredAt && !closeNow) {
    const durationMs = Date.now() - state.moonbagEnteredAt;
    if (durationMs > cfg.moonbagMaxDurationMs) {
      closeNow = true;
      closeReason = 'moonbag_timeout';
      console.log(`[9.2][TIMEOUT] ${update.symbol} tradeId=${update.tradeId} moonbag duration ${Math.round(durationMs / 60000)}m exceeded cap ${Math.round(cfg.moonbagMaxDurationMs / 60000)}m — forcing close (rung=${state.ladderRung})`);
    }
  }

  if (state.targetLatched && state.ATR > 0) {
    const dynamicStop = calculateTrailingStopPrice(
      state.highWaterMark,
      state.ATR,
      state.DI,
      state.VolNoise
    );
    // B65.4: floor is now the rung floor (cost-aware, locked-in profit
    // from the most-recent rung target hit). Dynamic HWM trail still
    // applies as a SECONDARY floor so price running far past current rung
    // target without crossing the next one still produces stop ratchet.
    const floorStop = state.currentRungFloor;
    newStopPrice = Math.max(floorStop, dynamicStop);

    const Kprime = calculateDynamicStopDistance(state.DI, state.VolNoise);
    console.log(`[9.2][EXIT] ${update.symbol} tradeId=${update.tradeId} trailing rung=${state.ladderRung}: K'=${Kprime.toFixed(2)}, HWM=${state.highWaterMark.toFixed(4)}, stop=${newStopPrice.toFixed(4)} (rungFloor=${floorStop.toFixed(4)}, nextTarget=${state.currentRungTarget.toFixed(4)})`);
  } else if (state.breakEvenLatched && !state.targetLatched && state.ATR > 0) {
    const dynamicStop = calculateTrailingStopPrice(
      state.highWaterMark,
      state.ATR,
      state.DI,
      state.VolNoise
    );
    // Directive 11.3A: Use net breakeven instead of gross entry
    const floorStop = netBreakeven;
    newStopPrice = Math.max(floorStop, dynamicStop);
    
    const Kprime = calculateDynamicStopDistance(state.DI, state.VolNoise);
    console.log(`[9.2][EXIT] ${update.symbol} tradeId=${update.tradeId} BE trailing: K'=${Kprime.toFixed(2)}, HWM=${state.highWaterMark.toFixed(4)}, stop=${newStopPrice.toFixed(4)} (netFloor=${floorStop.toFixed(4)})`);
  }
  
  state.currentStopPrice = newStopPrice;
  state.lastUpdated = Date.now();
  trailingStates.set(update.tradeId, state);

  const stopMoved = Math.abs(newStopPrice - previousStop) > 0.00001;
  
  // Directive 9.2.D: Schedule persistence save after state mutation
  if (stopMoved || modeChanged) {
    schedulePersistence();
  }
  
  // Directive 9.2.D: Sync trade mode to database when mode changes
  if (modeChanged) {
    syncTradeModeToStorage(update.symbol, state.tradeMode).catch(err => {
      console.error(`[9.2][MODE_SYNC] Background sync failed:`, err);
    });
  }
  
  return {
    tradeId: update.tradeId,
    symbol: update.symbol,
    previousMode,
    newMode: state.tradeMode,
    modeChanged,
    newStopPrice,
    stopMoved,
    breakEvenLatched: state.breakEvenLatched,
    targetLatched: state.targetLatched,
    highWaterMark: state.highWaterMark,
    // B65.2: terminal-decision signals consumed by the caller's exit gate.
    closeNow,
    closeReason,
    // B65.4: ladder rung count (0 = not in moonbag, 1+ = N target hits).
    ladderRungsHit: state.ladderRung,
    // B65.4.2: observability fields surfaced through the update result so
    // callers can persist them on close. originalStopPrice always present
    // for trades initialized via initializeTrailingState; latchTriggerPrice
    // only present after target latched; rungTargetHistory only populated
    // after target latched.
    originalStopPrice: state.originalStopPrice,
    latchTriggerPrice: state.latchTriggerPrice,
    rungTargetHistory: state.rungTargetHistory ? [...state.rungTargetHistory] : undefined,
  };
}

// B79.TEC (2026-05-08): The set of asset classes primeTECConfig iterates at
// boot. Sourced from `getActiveAssetClasses()` so adding a new active class
// (e.g. flipping xstock_perp.active=true) is automatically picked up at the
// next deploy — no per-batch primer edit needed. SSOT lives in
// `shared/asset-classes.ts`.
const ACTIVE_ASSET_CLASSES: readonly AssetClass[] = getActiveAssetClasses();

export interface TECBootstrapResult {
  ready: boolean;
  perClassStatus: Record<AssetClass, {
    ready: boolean;
    lastWarmupAt: number | null;
    error: string | null;
    // B79.TEC (Langston Q1): observable degradation signals.
    // refreshFailCount: consecutive failed background refreshes since last success.
    // stalenessMs: time since last successful refresh; ≥ CONFIG_MAX_STALENESS_MS triggers fail-closed.
    refreshFailCount: number;
    stalenessMs: number;
  }>;
  bootstrapStartedAt: number | null;
  bootstrapCompletedAt: number | null;
}

const tecBootstrap: TECBootstrapResult = {
  ready: false,
  perClassStatus: {} as TECBootstrapResult['perClassStatus'],
  bootstrapStartedAt: null,
  bootstrapCompletedAt: null,
};

/**
 * B79.TEC: Diagnostic accessor for `/api/diagnostics/tec-bootstrap`.
 */
export function getTECBootstrapStatus(): TECBootstrapResult {
  // B79.TEC (Langston Q1): augment per-class status with live refresh-health
  // signals at read time so /api/diagnostics/tec-bootstrap reflects current
  // degradation, not just boot-time state.
  const now = Date.now();
  const liveStatus: TECBootstrapResult['perClassStatus'] =
    {} as TECBootstrapResult['perClassStatus'];
  for (const [cls, base] of Object.entries(tecBootstrap.perClassStatus) as Array<[
    AssetClass,
    TECBootstrapResult['perClassStatus'][AssetClass],
  ]>) {
    const lastSuccess = tecConfigLastSuccessAt.get(cls) ?? 0;
    liveStatus[cls] = {
      ...base,
      refreshFailCount: tecRefreshFailCount.get(cls) ?? 0,
      stalenessMs: lastSuccess > 0 ? now - lastSuccess : -1,
    };
  }
  return {
    ready: tecBootstrap.ready,
    perClassStatus: liveStatus,
    bootstrapStartedAt: tecBootstrap.bootstrapStartedAt,
    bootstrapCompletedAt: tecBootstrap.bootstrapCompletedAt,
  };
}

const PRIME_RETRY_DELAYS_MS = [2_000, 4_000, 8_000]; // total 14s budget per class
const TRANSIENT_ERROR_PATTERNS = [
  /ECONN/i,
  /ETIMEDOUT/i,
  /timeout/i,
  /unavailable/i,
  /closed before establish/i,
  /pool/i,
];

function isTransientError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return TRANSIENT_ERROR_PATTERNS.some((re) => re.test(msg));
}

async function primeOneAssetClass(assetClass: AssetClass): Promise<void> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= PRIME_RETRY_DELAYS_MS.length; attempt++) {
    try {
      await refreshTECConfigForClass(assetClass);
      console.log(`[TEC_PRIME] warming cache for assetClass=${assetClass} OK (attempt=${attempt + 1})`);
      return;
    } catch (err) {
      lastErr = err;
      const isTransient = isTransientError(err);
      if (!isTransient || attempt === PRIME_RETRY_DELAYS_MS.length) {
        // Either not retryable, or exhausted budget.
        throw err;
      }
      const delay = PRIME_RETRY_DELAYS_MS[attempt];
      console.warn(
        `[TEC_PRIME_RETRY] assetClass=${assetClass} attempt=${attempt + 1} ` +
        `transient error; waiting ${delay}ms: ${(err as Error)?.message ?? err}`
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  // Unreachable, but TS satisfaction:
  throw lastErr ?? new Error(`[TEC_PRIME] unknown failure for ${assetClass}`);
}

/**
 * B79.TEC: Boot-time cache primer. Iterates ACTIVE_ASSET_CLASSES and warms
 * a per-class TrailingExitConfig snapshot via `module_constants`. MUST be
 * `await`-ed BEFORE `server.listen()` and BEFORE `loadTrailingStates()`.
 *
 * Failure semantics (HARD-FAIL doctrine — CLAUDE.md §5 #15, scope §-1):
 * if any class fails to prime after the retry budget exhausts, the function
 * THROWS with an aggregate-error report listing every per-class failure.
 * Caller (server/index.ts boot path) catches, logs `[TEC_BOOTSTRAP_FAIL]`,
 * and exits process non-zero. No degraded boot. Same in production AND
 * development per Kyle directive 2026-05-08 (Q3 lock).
 *
 * Retry policy: 3 attempts at 2s/4s/8s = 14s total per class, but ONLY for
 * transient errors (network, timeout, pool exhaustion). Logical errors
 * (missing required key, malformed value) fail immediately.
 */
export async function primeTECConfig(): Promise<void> {
  tecBootstrap.bootstrapStartedAt = Date.now();
  tecBootstrap.ready = false;
  tecBootstrap.bootstrapCompletedAt = null;

  // Initialize per-class status entries.
  for (const cls of ACTIVE_ASSET_CLASSES) {
    tecBootstrap.perClassStatus[cls] = { ready: false, lastWarmupAt: null, error: null };
  }

  // Iterate every active class, accumulate failures rather than fail-fast,
  // so the operator sees ALL missing rows in one boot attempt instead of
  // having to fix-restart-fix-restart through them one at a time.
  const failures: Array<{ cls: AssetClass; err: unknown }> = [];
  for (const cls of ACTIVE_ASSET_CLASSES) {
    try {
      await primeOneAssetClass(cls);
      tecBootstrap.perClassStatus[cls] = {
        ready: true,
        lastWarmupAt: Date.now(),
        error: null,
      };
    } catch (err) {
      failures.push({ cls, err });
      tecBootstrap.perClassStatus[cls] = {
        ready: false,
        lastWarmupAt: null,
        error: (err as Error)?.message ?? String(err),
      };
    }
  }

  if (failures.length > 0) {
    const summary = failures
      .map((f) => `${f.cls}: ${(f.err as Error)?.message ?? f.err}`)
      .join('; ');
    const aggregate =
      `[TEC_BOOTSTRAP_FAIL] primeTECConfig failed for ${failures.length}/${ACTIVE_ASSET_CLASSES.length} ` +
      `active asset classes. Failures: ${summary}. ` +
      `App must not start with a partial TEC config cache.`;
    console.error(aggregate);
    throw new Error(aggregate);
  }

  // Start the per-minute resolution-counter aggregator (lazy — only after
  // a successful bootstrap, so failed-boot processes don't leave timers
  // dangling).
  startResolveAggregator();

  tecBootstrap.bootstrapCompletedAt = Date.now();
  tecBootstrap.ready = true;
  console.log(
    `[TEC_PRIME] bootstrap complete — ${ACTIVE_ASSET_CLASSES.length} active classes warmed ` +
    `(${ACTIVE_ASSET_CLASSES.join(', ')}) in ${tecBootstrap.bootstrapCompletedAt - (tecBootstrap.bootstrapStartedAt ?? 0)}ms`
  );
}

/**
 * Directive 9.2.A: Check if position should be closed (stop hit).
 * B80: keyed by tradeId.
 *
 * B-NEW-42b (2026-05-17): wrapped with price-discontinuity sentinel. When the
 * sentinel returns `active`, the naive `currentPrice <= stop` check is
 * short-circuited. This covers:
 *   - halt-resume gap (visibility-return at a re-priced level looks like a
 *     stop hit but is unfillable in reality);
 *   - corp-action discontinuity (50% drop on a split looks like a stop hit
 *     but is a unit-count change, not a value change);
 *   - known ex-dividend window (1-2h pre-market-open on ex-date);
 *   - cold-start fail-safe (first call per symbol post-restart — see
 *     price-discontinuity-detector.ts §3a-b).
 *
 * Crypto symbols pass through unchanged — detector returns `{active: false}`
 * immediately for non-xStock symbols.
 */
export function shouldClosePosition(
  tradeId: string,
  currentPrice: number,
  // B-NEW-42b: optional tick timestamp for the detector. Defaults to Date.now()
  // (production callers don't need to pass it). Test callers pass explicit
  // timestamps to simulate halt/discontinuity timing.
  currentTs: number = Date.now(),
  // B-NEW-42b (Step 4 fix BLOCKER 2): pre-resolved discontinuity from caller.
  // tec-evaluator consults the detector ONCE per logical tick and threads the
  // same result to both `updatePosition` (target-lock skip) and
  // `shouldClosePosition` (stop-check skip). Eliminates the double-consultation
  // bug that collapsed the 2-tick deferral into 1-tick. Direct callers omit
  // → no gate (pre-B-NEW-42b behavior preserved for crypto-path tests).
  discontinuity?: { active: boolean; kind?: string },
): boolean {
  const state = trailingStates.get(tradeId);
  if (!state) return false;

  // B-NEW-42b: discontinuity gate. Skip stop check if detector flags the tick.
  // Use pre-resolved result if caller provided; else only consult inline if
  // a non-tec-evaluator caller (e.g. ad-hoc test) is using us directly.
  const resolvedDiscontinuity = discontinuity ?? { active: false };
  if (resolvedDiscontinuity.active) {
    console.log(
      `[B-NEW-42b][TEC_DISCONTINUITY_SKIP_STOP] ${state.symbol} ` +
      `tradeId=${tradeId} kind=${resolvedDiscontinuity.kind} — deferring stop check ` +
      `(currentPrice=${currentPrice.toFixed(4)}, stopPrice=${state.currentStopPrice.toFixed(4)}).`,
    );
    return false;
  }

  return currentPrice <= state.currentStopPrice;
}

/**
 * Directive 9.2.A: Clear trailing state when position is closed.
 * B80: keyed by tradeId. Only clears THIS trade's state — other concurrent
 * trades on the same symbol are untouched (the load-bearing fix vs the
 * pre-B80 symbol-keyed behavior).
 */
export function clearTrailingState(tradeId: string): void {
  if (trailingStates.has(tradeId)) {
    const state = trailingStates.get(tradeId);
    // B65.2: decrement the concurrent-moonbag counter if this trade was in
    // trailing mode when cleared. Keeps the cap check accurate across opens
    // and closes happening in any order within a cycle.
    if (state && state.tradeMode === 'TRAILING_TAKE' && state.callerMode) {
      concurrentMoonbagByMode[state.callerMode] = Math.max(0, concurrentMoonbagByMode[state.callerMode] - 1);
    }
    console.log(
      `[9.2][EXIT] ${state?.symbol ?? 'UNKNOWN'} tradeId=${tradeId} cleared: ` +
      `mode=${state?.tradeMode}, finalStop=${state?.currentStopPrice.toFixed(4)}`
    );
    trailingStates.delete(tradeId);
    // Directive 9.2.D: Schedule persistence save after state removal
    schedulePersistence();
  }
}

/**
 * Directive 9.2.D: Export all trailing states for persistence
 */
export function exportAllStates(): TrailingState[] {
  return Array.from(trailingStates.values());
}

/**
 * Directive 9.2.D: Import trailing states from persistence.
 *
 * B80 (2026-05-13): Option C+ drop pattern. The Map key changed from symbol
 * to tradeId. Any legacy state record persisted before B80 lacks a `tradeId`
 * field. Such records are DISCARDED on import — vts-runner / paper-engine
 * will rebuild fresh per-trade TEC state on the next exit-cycle using the
 * Option C+ seed path (initializeTrailingState with seed = trade record's
 * tradeMode/ladderRung/originalStopPrice). This avoids the rev1 Option C
 * silent-downgrade of in-flight moonbag trades to TARGET mode.
 *
 * Per Langston rev2 #2 callout: on emergency `git revert`, the pre-fix
 * build won't have the seed path. In-flight TRAILING_TAKE trades degrade
 * to TARGET at rollback. Acceptable emergency procedure; called out in
 * the rollback playbook.
 */
export function importStates(states: TrailingState[]): void {
  trailingStates.clear();
  // B65.2: rebuild the concurrency counters from the restored states so the
  // cap check remains accurate across a restart.
  concurrentMoonbagByMode.vts = 0;
  concurrentMoonbagByMode.paper = 0;
  concurrentMoonbagByMode.live = 0;
  let migratedCount = 0;
  let droppedLegacyCount = 0;
  for (const stateRaw of states) {
    // B80: legacy pre-B80 state lacks tradeId — drop it. Per-trade state
    // will be rebuilt fresh via seed on next exit-cycle.
    if (!stateRaw.tradeId) {
      droppedLegacyCount++;
      continue;
    }
    // B65.4: backward-compat migration. Persistence files written before the
    // ladder fields existed will not have ladderRung / currentRungTarget /
    // currentRungFloor. Best-effort migration:
    //   - targetLatched=false → ladderRung=0, currentRungTarget=targetPrice
    //   - targetLatched=true → ladderRung=1, currentRungTarget=targetPrice,
    //     currentRungFloor=0 (will be ratcheted up on next cycle's update if
    //     applicable; floor of 0 won't bind because the dynamic HWM trail
    //     dominates anything meaningful).
    // Either way the engine's next cycle reconciles correctly from currentPrice.
    const state = stateRaw as TrailingState;
    let migrated = false;
    if (typeof state.ladderRung !== 'number') {
      state.ladderRung = state.targetLatched ? 1 : 0;
      migrated = true;
    }
    if (typeof state.currentRungTarget !== 'number') {
      state.currentRungTarget = state.targetPrice;
      migrated = true;
    }
    if (typeof state.currentRungFloor !== 'number') {
      state.currentRungFloor = 0;
      migrated = true;
    }
    // B65.4.2 backward-compat: pre-existing persisted states won't have the
    // observability fields. Initialize them to safe defaults — null is fine
    // for trades that latched before B65.4.2 deployed (we'll never know what
    // the latch-trigger price actually was), and rungTargetHistory defaults
    // to an empty array which will start populating on the next ratchet event.
    if (!Array.isArray(state.rungTargetHistory)) {
      state.rungTargetHistory = [];
      migrated = true;
    }
    // originalStopPrice and latchTriggerPrice are intentionally left undefined
    // for migrated states — we cannot reconstruct them from the persistence
    // file (the original stop was never recorded; the latch fired in the past).
    if (migrated) {
      migratedCount++;
    }

    trailingStates.set(state.tradeId, state);
    if (state.tradeMode === 'TRAILING_TAKE' && state.callerMode) {
      concurrentMoonbagByMode[state.callerMode] += 1;
    }
    console.log(
      `[9.2][EXIT] ${state.symbol} tradeId=${state.tradeId} restored: ` +
      `mode=${state.tradeMode}, stop=${state.currentStopPrice.toFixed(4)}, ` +
      `rung=${state.ladderRung}${migrated ? ' (B65.4 migrated)' : ''}`
    );
  }
  if (migratedCount > 0) {
    console.log(`[9.2][B65.4] Migrated ${migratedCount} pre-ladder persisted states with default ladder fields`);
  }
  if (droppedLegacyCount > 0) {
    console.log(
      `[B80][TEC_KEYING] Dropped ${droppedLegacyCount} legacy pre-B80 persisted states ` +
      `(missing tradeId field). Per-trade state will be rebuilt via Option C+ seed on ` +
      `next exit-cycle using trade-record fields.`
    );
  }
  console.log(`[9.2][EXIT] Restored ${trailingStates.size} trailing states (moonbag concurrency: vts=${concurrentMoonbagByMode.vts}, paper=${concurrentMoonbagByMode.paper}, live=${concurrentMoonbagByMode.live})`);
}

/**
 * Directive 9.2.F: Get diagnostic summary.
 * B80: rows now include `tradeId`. Same symbol can appear N times when
 * multiple concurrent trades share a symbol — that is the load-bearing
 * intent of per-trade keying. Consumers that dedupe by symbol must be
 * updated to dedupe by tradeId.
 */
export function getDiagnostics(): {
  activeCount: number;
  targetModeCount: number;
  trailingTakeModeCount: number;
  states: Array<{ tradeId: string; symbol: string; mode: TradeMode; stop: number; latches: string }>;
} {
  const states = Array.from(trailingStates.values());
  return {
    activeCount: states.length,
    targetModeCount: states.filter(s => s.tradeMode === 'TARGET').length,
    trailingTakeModeCount: states.filter(s => s.tradeMode === 'TRAILING_TAKE').length,
    states: states.map(s => ({
      tradeId: s.tradeId,
      symbol: s.symbol,
      mode: s.tradeMode,
      stop: s.currentStopPrice,
      latches: `BE:${s.breakEvenLatched ? 'Y' : 'N'} TGT:${s.targetLatched ? 'Y' : 'N'}`
    }))
  };
}
