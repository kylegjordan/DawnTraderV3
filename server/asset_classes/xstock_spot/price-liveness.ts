/**
 * ════════════════════════════════════════════════════════════════════════════
 * P19-B6.6 (#236) — xStock price-discovery-LIVENESS fill gate
 * ════════════════════════════════════════════════════════════════════════════
 *
 * The SECOND half of the fill-time "is the book real?" guard (the first half is
 * the B4b.1 book-depth-sufficiency gate, #295). Both fire at the engine open seam,
 * fail-closed, surfaced via the same `recordDepthGateBlock` telemetry; depth runs
 * FIRST (one cheap top-of-book row), liveness only on depth-pass.
 *
 * WHAT IT CHECKS: has THIS TOKEN's Kraken book actually PRICE-DISCOVERED recently —
 * i.e. has the traded `last` price CHANGED at least `min_moves` times within the
 * last `window_ms`? This catches the #236 hole the depth + freshness gates miss:
 * on a US-equity holiday / half-day / LULD halt / exchange glitch, the 24/5 token
 * feed keeps emitting snapshots (fresh `captured_at`, depth still quoted) but the
 * underlying is closed so `last` is FROZEN — both other gates pass and a fill would
 * land on a dead-but-quoted book at a stale reference price.
 *
 * SEMANTICS (precise — not "is ARCA open"): this gates on the TOKEN's own Kraken-book
 * price-discovery cadence. A liquid token trading 24/7 on Kraken (MU/NVDA) PASSES
 * during a US holiday — correctly, because the paper fill executes on Kraken's live
 * book. "Holiday" is the motivating case, not the mechanism; the gate blocks whenever
 * the token's book stops price-discovering (holiday, halt, glitch, feed death).
 *
 * xStock-ONLY: crypto trades 24/7 globally (no holiday analog); a liveness gate on a
 * quiet altcoin would false-block. The caller only invokes this for `xstock_spot`.
 *
 * WINDOW = 45 min (PINNED, P19_B6_6_PRE_AUDIT.md §0E): calibrated from 3 weekday
 * sessions of archived `xstock_spot_ticker_snap`. 45 passes every genuinely-active
 * admitted name with ≥2× margin (worst-day in-RTH inter-trade p99 ≤20m) while
 * EXCLUDING the deep-but-slow ETF/foreign-equity tokens (EWN/EWP/TOTL, 42–68m) whose
 * ~50-min cadence makes any fill a stale-reference fill. Justified by type-II
 * frozen-but-quoted-book detection speed (a longer window is strictly worse there and
 * does not rescue the slow tail), NOT by "p99 margin". DORMANT until B7b (§9.1).
 *
 * FAIL-CLOSED (rule 11/15): missing config / query timeout / query error / no data /
 * sparse data / flat `last` → BLOCK the open loudly. A safety gate's safe failure is
 * "do not fill". Reason codes distinguish a feed/config outage (`no_data` /
 * `liveness_config_missing` / `liveness_timeout`) from a genuine dead market
 * (`flat_last`) so an outage never masquerades as a holiday.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { db } from '../../db.js';
import { sql } from 'drizzle-orm';
import { getModuleConstants } from '../../services/module-constants-service.js';

export interface PriceLivenessConfig {
  /** Trailing window (ms) over which `last` must have moved (45 min, P19-B6.6). */
  windowMs: number;
  /** Minimum number of `last` CHANGES (trade prints) in the window to be "live". */
  minMoves: number;
  /** Minimum snapshots in the window to trust a verdict (else sparse → fail-closed). */
  minSnaps: number;
  /** Hard timeout (ms) on the windowed query — timeout fails CLOSED (block). */
  queryTimeoutMs: number;
  /** Kill-switch: when false the gate is OFF (passes through). Default-seeded true. */
  enabled: boolean;
}

/** Result of the windowed `last`-move read over `xstock_spot_ticker_snap`. */
export interface LastMoveStats {
  /** Snapshots present in the window. */
  snapCount: number;
  /** Distinct `last` changes (trade prints) in the window. */
  moveCount: number;
  /** Ms since the most recent `last` CHANGE in the window (null when none). */
  msSinceLastMove: number | null;
}

export interface LivenessResult { live: boolean; reason: string; }

const REQUIRED_KEYS = ['window_ms', 'min_moves', 'min_snaps', 'query_timeout_ms', 'enabled'] as const;

interface CachedConfig { value: PriceLivenessConfig | null; expiresAt: number; }
let _cache: CachedConfig | null = null;
const _CACHE_TTL_MS = 60_000;
const _NULL_TTL_MS = 5_000;

/** Test-only cache reset. */
export function _testClearPriceLivenessCache(): void { _cache = null; }

/**
 * Resolve the xStock price-liveness config from `module_constants`
 * (module `price_discovery_liveness`, asset_class `xstock_spot`). Returns `null`
 * (fail-closed) if the row set is missing/incomplete or the lookup throws. Both hits
 * and the fail-closed null are cached (short TTL on null) so the open seam never
 * hammers the resolver; a freshly-seeded row appears ≤60s.
 */
export async function resolvePriceLivenessConfig(): Promise<PriceLivenessConfig | null> {
  const now = Date.now();
  if (_cache && now < _cache.expiresAt) return _cache.value;

  let value: PriceLivenessConfig | null = null;
  try {
    const rows = await getModuleConstants('price_discovery_liveness', {
      exchange: '*',
      assetClass: 'xstock_spot',
      strategy: '*',
      regime: '*',
    });
    // window_ms/min_moves/min_snaps/query_timeout_ms are numbers; enabled is boolean.
    const numMissing = (['window_ms', 'min_moves', 'min_snaps', 'query_timeout_ms'] as const)
      .filter((k) => typeof rows[k] !== 'number');
    const enabledOk = typeof rows['enabled'] === 'boolean';
    if (numMissing.length > 0 || !enabledOk) {
      const missing = [...numMissing, ...(enabledOk ? [] : ['enabled'])];
      console.error(
        `[P19-B6.6][PRICE_LIVENESS_CONFIG] FAIL-CLOSED: missing/mistyped module_constants keys [${missing.join(', ')}] — blocking xStock active fills until seeded`,
      );
      value = null;
    } else {
      value = {
        windowMs: rows['window_ms'] as number,
        minMoves: rows['min_moves'] as number,
        minSnaps: rows['min_snaps'] as number,
        queryTimeoutMs: rows['query_timeout_ms'] as number,
        enabled: rows['enabled'] as boolean,
      };
    }
  } catch (err) {
    console.error('[P19-B6.6][PRICE_LIVENESS_CONFIG] resolve threw — FAIL-CLOSED (blocking fills):', err);
    value = null;
  }
  _cache = { value, expiresAt: now + (value ? _CACHE_TTL_MS : _NULL_TTL_MS) };
  return value;
}

/**
 * Windowed `last`-move read over `xstock_spot_ticker_snap`, index-bounded by
 * `(symbol, captured_at)` (`xstock_spot_ticker_snap_<part>_symbol_captured_at_idx`)
 * and the time window. Hard-timed via Promise.race — a timeout REJECTS so the caller
 * fails closed (the orphaned server query is harmless for a per-open gate). One scan.
 */
export async function getRecentLastMoveStats(
  symbol: string,
  windowMs: number,
  queryTimeoutMs: number,
): Promise<LastMoveStats> {
  const windowSec = Math.max(1, Math.round(windowMs / 1000));
  const queryP = db.execute<{ snap_count: string | number; move_count: string | number; ms_since_last_move: string | number | null }>(sql`
    WITH w AS (
      SELECT last, captured_at,
             LAG(last) OVER (ORDER BY captured_at) AS prev_last
      FROM xstock_spot_ticker_snap
      WHERE symbol = ${symbol}
        AND captured_at > NOW() - make_interval(secs => ${windowSec})
    )
    SELECT
      count(*) AS snap_count,
      count(*) FILTER (WHERE last IS DISTINCT FROM prev_last AND prev_last IS NOT NULL) AS move_count,
      EXTRACT(EPOCH FROM (NOW() - max(captured_at) FILTER (WHERE last IS DISTINCT FROM prev_last AND prev_last IS NOT NULL))) * 1000 AS ms_since_last_move
    FROM w
  `);
  let timer: NodeJS.Timeout | undefined;
  const timeoutP = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`liveness query timeout >${queryTimeoutMs}ms`)), queryTimeoutMs);
  });
  try {
    const res = await Promise.race([queryP, timeoutP]);
    const rows = (res as any).rows ?? (res as unknown as any[]);
    const r = Array.isArray(rows) ? rows[0] : undefined;
    const snapCount = Number(r?.snap_count ?? 0);
    const moveCount = Number(r?.move_count ?? 0);
    const rawSince = r?.ms_since_last_move;
    const msSinceLastMove = rawSince === null || rawSince === undefined ? null : Number(rawSince);
    return {
      snapCount: Number.isFinite(snapCount) ? snapCount : 0,
      moveCount: Number.isFinite(moveCount) ? moveCount : 0,
      msSinceLastMove: msSinceLastMove !== null && Number.isFinite(msSinceLastMove) ? msSinceLastMove : null,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * PURE verdict: is the token's book price-discovering? Fail-closed reason taxonomy
 * (Langston Step-2 #3 — a feed/config outage must be distinguishable from a holiday):
 *   - `no_data`          — zero snapshots in the window (feed outage)
 *   - `sparse_snapshots` — snapshots present but < minSnaps (insufficient evidence)
 *   - `flat_last`        — enough snapshots, but < minMoves `last` changes (dead/holiday book)
 *   - `live`             — ≥ minMoves changes (a price-discovering market)
 */
export function assessPriceLiveness(stats: LastMoveStats, config: PriceLivenessConfig): LivenessResult {
  if (stats.snapCount <= 0) {
    return { live: false, reason: 'no_data window had 0 snapshots' };
  }
  if (stats.snapCount < config.minSnaps) {
    return { live: false, reason: `sparse_snapshots snaps=${stats.snapCount}<${config.minSnaps}` };
  }
  if (stats.moveCount < config.minMoves) {
    const ageStr = stats.msSinceLastMove === null ? 'none-in-window' : `${Math.round(stats.msSinceLastMove)}ms`;
    return { live: false, reason: `flat_last moves=${stats.moveCount}<${config.minMoves} lastMove=${ageStr} window=${config.windowMs}ms` };
  }
  return { live: true, reason: 'live' };
}

/**
 * Orchestrate the gate for one xStock symbol at the open seam. NEVER throws (the
 * open path must not blow up). Returns `{ live, reason }`; the caller blocks the open
 * on `!live` and records the reason via `recordDepthGateBlock` + `recordOpenFailed`.
 *
 * `deps` is dependency injection for unit tests (default = real config + real query).
 */
export async function evaluateXstockPriceLiveness(
  symbol: string,
  deps?: {
    resolveConfig?: () => Promise<PriceLivenessConfig | null>;
    getStats?: (symbol: string, windowMs: number, queryTimeoutMs: number) => Promise<LastMoveStats>;
  },
): Promise<LivenessResult> {
  const resolveConfig = deps?.resolveConfig ?? resolvePriceLivenessConfig;
  const getStats = deps?.getStats ?? getRecentLastMoveStats;
  try {
    const config = await resolveConfig();
    if (!config) return { live: false, reason: 'liveness_config_missing' };
    if (!config.enabled) return { live: true, reason: 'liveness_disabled' }; // kill-switch: gate OFF → pass
    let stats: LastMoveStats;
    try {
      stats = await getStats(symbol, config.windowMs, config.queryTimeoutMs);
    } catch (err: any) {
      // Timeout or query error → FAIL-CLOSED (block). Distinguish timeout for telemetry.
      const isTimeout = /timeout/i.test(err?.message ?? '');
      console.error(`[P19-B6.6][PRICE_LIVENESS] ${symbol} stats read ${isTimeout ? 'TIMED OUT' : 'threw'} — fail-closed block:`, err?.message ?? err);
      return { live: false, reason: isTimeout ? 'liveness_timeout' : 'liveness_query_error' };
    }
    return assessPriceLiveness(stats, config);
  } catch (err: any) {
    console.error(`[P19-B6.6][PRICE_LIVENESS] ${symbol} unexpected — fail-closed block:`, err?.message ?? err);
    return { live: false, reason: 'liveness_error' };
  }
}
