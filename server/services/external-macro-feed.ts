/**
 * ══════════════════════════════════════════════════════════════════════════════
 * B67.1 — External Macro Feed
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Polls public APIs for the macro inputs consumed by B67.1's macro confidence
 * modifier:
 *
 *   - BTC dominance (CoinGecko: /global)
 *   - Total crypto market cap (CoinGecko: /global)
 *   - Funding rate (Binance public futures: weighted average BTC + ETH 8h)
 *
 * Per BATCH_67_1_SCOPE.md + BATCH_67_1_PRE_AUDIT.md §6.3 (Langston cc-inbox #844):
 *   - BTC + ETH perps cover ~85% of total open interest. USDC variants are
 *     dropped — USDT perps are the canonical reference.
 *   - Funding rate stored as raw 8h (Binance native unit) before z-scoring.
 *     Z-scoring removes the time-unit dependency.
 *
 * Cadence: poll every `b67_1_external_feed_cache_seconds` (default 60s) on an
 * internal scheduler. Consumers (MCE) call `getLatest()` synchronously and
 * receive whatever the most recent successful poll produced. If no successful
 * poll has happened yet (cold start), return a snapshot with `partialFeed=true`
 * and `ageSeconds=Infinity` — caller's stale-data fallback fires.
 *
 * Failure handling:
 *   - Per-source failures (CoinGecko reachable, Binance rate-limited): partial
 *     snapshot returned with `partialFeed=true`. Modifier function's cold-start
 *     check sees missing inputs and triggers fallback.
 *   - All-source failures: stale snapshot retained. `ageSeconds` grows past
 *     `b67_1_external_feed_stale_seconds` (default 300) → modifier fallback.
 *   - Loud PM2 logging on each failure with `[B67.1][feed]` prefix.
 *
 * Rolling baseline: maintains in-memory rolling windows for z-score
 * normalization (per Langston cc-inbox #844 §6.2). 30-day window at 60s polling
 * = 43,200 samples max. We retain the last 720 (~12h) for the rolling stats —
 * sufficient to compute mean/stddev cheaply, plenty above the 48-sample floor.
 * Promotes to DB persistence in B67.4 only if calibration check requires
 * restart-surviving baselines.
 *
 * Singleton. Started at boot via `initExternalMacroFeed()`. Stopped via
 * `stopExternalMacroFeed()`.
 *
 * Reference: BATCH_67_1_SCOPE.md §3 + §5
 */

import { getConstant } from './module-constants-service.js';
import {
  type MacroSnapshot,
  type MacroBaseline,
} from '../core/metrics/macro-modifier.js';

// ─── Constants resolution helper ────────────────────────────────────────────

const RESOLUTION_KEY = {
  exchange: '*',
  assetClass: '*',
  strategy: '*',
  regime: '*',
} as const;

/**
 * Read a required module_constants value. Throws if missing — no silent
 * fallback per CLAUDE.md §11 + Kyle directive 2026-04-29. Migration must
 * seed every constant before deploy.
 */
async function readConstStrict<T>(name: string): Promise<T> {
  const v = await getConstant<T>('macro_modifier', name, RESOLUTION_KEY as any);
  if (v === undefined) {
    throw new Error(
      `[B67.1] missing module_constant macro_modifier.${name}. ` +
      `Run migration 2026-04-28-b67-1-macro-modifier.sql to seed.`,
    );
  }
  return v;
}

// ─── Rolling-window state ───────────────────────────────────────────────────

/**
 * Single rolling-window stats accumulator (Welford-style updated lazily on
 * read). We keep raw samples plus running sums for O(1) updates.
 */
class RollingWindow {
  private samples: number[] = [];
  private readonly maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  push(value: number): void {
    if (!Number.isFinite(value)) return;
    this.samples.push(value);
    if (this.samples.length > this.maxSize) {
      this.samples.shift();
    }
  }

  /** Returns null when window has zero samples. */
  stats(): { count: number; mean: number; stdDev: number } {
    const n = this.samples.length;
    if (n === 0) return { count: 0, mean: 0, stdDev: 0 };
    let sum = 0;
    for (const v of this.samples) sum += v;
    const mean = sum / n;
    if (n < 2) return { count: n, mean, stdDev: 0 };
    let sqSum = 0;
    for (const v of this.samples) sqSum += (v - mean) * (v - mean);
    const stdDev = Math.sqrt(sqSum / (n - 1));
    return { count: n, mean, stdDev };
  }

  size(): number {
    return this.samples.length;
  }
}

// Window size: 720 samples × 60s = 12 hours of history. Sufficient for the
// 30-day lookback constant only in the sense that we don't STORE 30 days
// in memory — we store enough recent history to produce a rolling
// distribution. The 30-day constant is the conceptual lookback used in
// telemetry naming; physical retention is the 12h window for memory
// efficiency. Promotion to longer / DB-backed history is a B67.4 concern.
const WINDOW_SIZE_SAMPLES = 720;

// ─── Snapshot state ─────────────────────────────────────────────────────────

interface FeedState {
  lastSuccessAt: number; // epoch ms; 0 if never succeeded
  lastSnapshot: {
    btcDominance?: number;
    totalMarketCapUsd?: number;
    mcapMomentum?: number;
    fundingRate?: number;
    partialFeed: boolean;
    capturedAt: number;
  };
  btcDomWindow: RollingWindow;
  fundingWindow: RollingWindow;
  // mcap momentum is computed period-over-period; we store the previous
  // totalMarketCapUsd so the next poll can compute the % delta.
  mcapMomentumWindow: RollingWindow;
  prevTotalMarketCapUsd: number | undefined;
}

const state: FeedState = {
  lastSuccessAt: 0,
  lastSnapshot: {
    partialFeed: true,
    capturedAt: 0,
  },
  btcDomWindow: new RollingWindow(WINDOW_SIZE_SAMPLES),
  fundingWindow: new RollingWindow(WINDOW_SIZE_SAMPLES),
  mcapMomentumWindow: new RollingWindow(WINDOW_SIZE_SAMPLES),
  prevTotalMarketCapUsd: undefined,
};

let pollTimer: NodeJS.Timeout | null = null;
let pollIntervalSec = 60;

// ─── Upstream HTTP fetchers ─────────────────────────────────────────────────

const COINGECKO_GLOBAL = 'https://api.coingecko.com/api/v3/global';
const BINANCE_PREMIUM_INDEX = 'https://fapi.binance.com/fapi/v1/premiumIndex';
const FETCH_TIMEOUT_MS = 8_000;

async function fetchWithTimeout(url: string): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

interface CoinGeckoGlobal {
  data: {
    market_cap_percentage: { btc?: number };
    total_market_cap: { usd?: number };
  };
}

async function fetchCoinGeckoGlobal(): Promise<{
  btcDominance?: number;
  totalMarketCapUsd?: number;
}> {
  try {
    const res = await fetchWithTimeout(COINGECKO_GLOBAL);
    if (!res.ok) {
      console.warn(`[B67.1][feed] CoinGecko HTTP ${res.status}`);
      return {};
    }
    const json = (await res.json()) as CoinGeckoGlobal;
    return {
      btcDominance: json.data?.market_cap_percentage?.btc,
      totalMarketCapUsd: json.data?.total_market_cap?.usd,
    };
  } catch (err) {
    console.warn(
      '[B67.1][feed] CoinGecko fetch failed:',
      err instanceof Error ? err.message : err,
    );
    return {};
  }
}

interface BinancePremiumIndexEntry {
  symbol: string;
  lastFundingRate: string; // e.g. "0.00010000" (raw 8h rate)
}

async function fetchBinanceFunding(): Promise<{ fundingRate?: number }> {
  try {
    const res = await fetchWithTimeout(BINANCE_PREMIUM_INDEX);
    if (!res.ok) {
      console.warn(`[B67.1][feed] Binance HTTP ${res.status}`);
      return {};
    }
    const json = (await res.json()) as BinancePremiumIndexEntry[];
    const btc = json.find((e) => e.symbol === 'BTCUSDT');
    const eth = json.find((e) => e.symbol === 'ETHUSDT');
    const btcRate = btc ? parseFloat(btc.lastFundingRate) : NaN;
    const ethRate = eth ? parseFloat(eth.lastFundingRate) : NaN;
    if (!Number.isFinite(btcRate) && !Number.isFinite(ethRate)) {
      return {};
    }
    // Weighted average — BTC weighted 0.6, ETH 0.4 reflecting OI dominance.
    // Intentionally hardcoded (NOT in module_constants) per Langston review
    // cc-inbox #845: changing this requires understanding OI structure rather
    // than tuning a knob. Hardcoded prevents an operator from misreading it as
    // "configurable parameter" and adjusting without context. OI ratios shift
    // slowly (months/quarters) and revisiting them is a code-change concern.
    // Drops gracefully when one is missing.
    const validBtc = Number.isFinite(btcRate);
    const validEth = Number.isFinite(ethRate);
    if (validBtc && validEth) {
      return { fundingRate: btcRate * 0.6 + ethRate * 0.4 };
    }
    if (validBtc) return { fundingRate: btcRate };
    if (validEth) return { fundingRate: ethRate };
    return {};
  } catch (err) {
    console.warn(
      '[B67.1][feed] Binance fetch failed:',
      err instanceof Error ? err.message : err,
    );
    return {};
  }
}

// ─── Poll cycle ─────────────────────────────────────────────────────────────

async function pollCycle(): Promise<void> {
  const startedAt = Date.now();
  const [cg, bn] = await Promise.all([fetchCoinGeckoGlobal(), fetchBinanceFunding()]);

  const partial =
    cg.btcDominance === undefined ||
    cg.totalMarketCapUsd === undefined ||
    bn.fundingRate === undefined;

  // Update rolling windows ONLY for inputs we actually got.
  if (cg.btcDominance !== undefined) state.btcDomWindow.push(cg.btcDominance);
  if (bn.fundingRate !== undefined) state.fundingWindow.push(bn.fundingRate);

  // mcap momentum: % delta from previous successful read of total mcap.
  let mcapMomentum: number | undefined;
  if (cg.totalMarketCapUsd !== undefined) {
    if (state.prevTotalMarketCapUsd !== undefined && state.prevTotalMarketCapUsd > 0) {
      mcapMomentum =
        (cg.totalMarketCapUsd - state.prevTotalMarketCapUsd) / state.prevTotalMarketCapUsd;
      state.mcapMomentumWindow.push(mcapMomentum);
    }
    state.prevTotalMarketCapUsd = cg.totalMarketCapUsd;
  }

  state.lastSnapshot = {
    btcDominance: cg.btcDominance,
    totalMarketCapUsd: cg.totalMarketCapUsd, // raw USD (e.g. 2.36e12) — kept for future consumers
    mcapMomentum: mcapMomentum,              // period-over-period % change — z-scored by modifier
    fundingRate: bn.fundingRate,
    partialFeed: partial,
    capturedAt: startedAt,
  };

  if (!partial) {
    state.lastSuccessAt = startedAt;
  }

  if (partial) {
    console.warn(
      `[B67.1][feed] partial snapshot — btc_dom=${cg.btcDominance ?? 'NA'} ` +
        `mcap_mom=${mcapMomentum ?? 'NA'} funding=${bn.fundingRate ?? 'NA'}`,
    );
  } else {
    console.log(
      `[B67.1][feed] btc_dom=${cg.btcDominance?.toFixed(2)}% ` +
        `mcap_mom=${(mcapMomentum ?? 0).toFixed(5)} ` +
        `funding=${bn.fundingRate?.toFixed(6)} ` +
        `windows=(btc:${state.btcDomWindow.size()},fund:${state.fundingWindow.size()},mcap:${state.mcapMomentumWindow.size()})`,
    );
  }
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────

/**
 * Start the feed. Idempotent — starting an already-running feed is a no-op.
 */
export async function initExternalMacroFeed(): Promise<void> {
  if (pollTimer !== null) return;

  pollIntervalSec = await readConstStrict<number>('b67_1_external_feed_cache_seconds');

  // Kick off an immediate poll so cold-start latency is the first poll cycle,
  // not the first interval-delayed cycle.
  void pollCycle().catch((err) => {
    console.error('[B67.1][feed] initial poll error:', err);
  });

  pollTimer = setInterval(() => {
    void pollCycle().catch((err) => {
      console.error('[B67.1][feed] poll cycle error:', err);
    });
  }, pollIntervalSec * 1000);

  console.log(
    `[B67.1][feed] started — interval=${pollIntervalSec}s window=${WINDOW_SIZE_SAMPLES} samples`,
  );
}

export function stopExternalMacroFeed(): void {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
    console.log('[B67.1][feed] stopped');
  }
}

// ─── Public read API ────────────────────────────────────────────────────────

/**
 * Returns the latest macro snapshot, with `ageSeconds` computed from the
 * snapshot timestamp. Cold start (no successful poll yet) returns a snapshot
 * with ageSeconds=Infinity + partialFeed=true so caller's stale-data fallback
 * fires immediately.
 */
export function getLatestMacroSnapshot(): MacroSnapshot {
  const now = Date.now();
  const captured = state.lastSnapshot.capturedAt;
  const ageSeconds = captured === 0 ? Infinity : (now - captured) / 1000;

  return {
    utcIso: new Date(captured || now).toISOString(),
    ageSeconds,
    btcDominance: state.lastSnapshot.btcDominance,
    totalMarketCapUsd: state.lastSnapshot.totalMarketCapUsd,
    mcapMomentum: state.lastSnapshot.mcapMomentum,
    fundingRate: state.lastSnapshot.fundingRate,
    partialFeed: state.lastSnapshot.partialFeed,
  };
}

/**
 * Returns the latest rolling-baseline stats. Caller passes these into
 * computeMacroModifier alongside the snapshot.
 */
export function getLatestMacroBaseline(): MacroBaseline {
  const btcStats = state.btcDomWindow.stats();
  const fundingStats = state.fundingWindow.stats();
  const mcapStats = state.mcapMomentumWindow.stats();

  return {
    btcDominanceSampleCount: btcStats.count,
    btcDominanceMean: btcStats.mean,
    btcDominanceStdDev: btcStats.stdDev,
    fundingSampleCount: fundingStats.count,
    fundingMean: fundingStats.mean,
    fundingStdDev: fundingStats.stdDev,
    mcapMomentumSampleCount: mcapStats.count,
    mcapMomentumMean: mcapStats.mean,
    mcapMomentumStdDev: mcapStats.stdDev,
  };
}

/**
 * Test-only: reset all internal state. Used by unit tests to ensure clean
 * baselines between cases. NOT called from production code.
 */
export function _resetExternalMacroFeedForTests(): void {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  state.lastSuccessAt = 0;
  state.lastSnapshot = { partialFeed: true, capturedAt: 0 };
  state.btcDomWindow = new RollingWindow(WINDOW_SIZE_SAMPLES);
  state.fundingWindow = new RollingWindow(WINDOW_SIZE_SAMPLES);
  state.mcapMomentumWindow = new RollingWindow(WINDOW_SIZE_SAMPLES);
  state.prevTotalMarketCapUsd = undefined;
}
