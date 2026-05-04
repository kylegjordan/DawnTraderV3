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

import * as fs from 'fs';
import { getConstant } from './module-constants-service.js';
import {
  type MacroSnapshot,
  type MacroBaseline,
} from '../core/metrics/macro-modifier.js';

// B67.1 follow-up 2026-04-29 (Kyle directive): persist the rolling-window
// state so PM2 restarts don't reset the z-score baselines back to cold-start
// (which forces modifier=1.0 + fallbackActive=true for ~48 minutes of
// every restart). Writing JSON to /tmp matches the trailing-state pattern
// from server/services/trade-safety.ts.
const FEED_PERSIST_FILE = '/tmp/external-macro-feed-state.json';

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

/**
 * Persist the feed state to disk. Called after each successful poll. On
 * cold start (first call before init has happened) this is a no-op
 * because state has empty windows.
 */
function persistFeedState(): void {
  try {
    const data = {
      lastSuccessAt: state.lastSuccessAt,
      lastSnapshot: state.lastSnapshot,
      btcDomSamples: (state.btcDomWindow as any).samples ?? [],
      fundingSamples: (state.fundingWindow as any).samples ?? [],
      mcapMomentumSamples: (state.mcapMomentumWindow as any).samples ?? [],
      prevTotalMarketCapUsd: state.prevTotalMarketCapUsd,
    };
    fs.writeFileSync(FEED_PERSIST_FILE, JSON.stringify(data));
  } catch (err) {
    console.warn(
      '[B67.1][feed] Failed to persist state:',
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Restore feed state from disk on init. Called from initExternalMacroFeed.
 * Tolerates missing/corrupt file.
 */
function restoreFeedState(): void {
  try {
    if (!fs.existsSync(FEED_PERSIST_FILE)) return;
    const raw = fs.readFileSync(FEED_PERSIST_FILE, 'utf-8');
    const data = JSON.parse(raw);
    if (typeof data.lastSuccessAt === 'number') state.lastSuccessAt = data.lastSuccessAt;
    if (data.lastSnapshot && typeof data.lastSnapshot === 'object') {
      state.lastSnapshot = data.lastSnapshot;
    }
    // Restore samples by repopulating the rolling windows. Bounded by
    // WINDOW_SIZE_SAMPLES via the push() side-effect in the class.
    if (Array.isArray(data.btcDomSamples)) {
      for (const v of data.btcDomSamples) state.btcDomWindow.push(v);
    }
    if (Array.isArray(data.fundingSamples)) {
      for (const v of data.fundingSamples) state.fundingWindow.push(v);
    }
    if (Array.isArray(data.mcapMomentumSamples)) {
      for (const v of data.mcapMomentumSamples) state.mcapMomentumWindow.push(v);
    }
    if (typeof data.prevTotalMarketCapUsd === 'number') {
      state.prevTotalMarketCapUsd = data.prevTotalMarketCapUsd;
    }
    console.log(
      `[B67.1][feed] Restored from ${FEED_PERSIST_FILE} — ` +
        `windows=(btc:${state.btcDomWindow.size()},fund:${state.fundingWindow.size()},mcap:${state.mcapMomentumWindow.size()})`,
    );
  } catch (err) {
    console.warn(
      '[B67.1][feed] Failed to restore persisted state:',
      err instanceof Error ? err.message : err,
    );
  }
}

let pollTimer: NodeJS.Timeout | null = null;
let pollIntervalSec = 60;

// ─── Upstream HTTP fetchers ─────────────────────────────────────────────────

const COINGECKO_GLOBAL = 'https://api.coingecko.com/api/v3/global';
const BINANCE_PREMIUM_INDEX = 'https://fapi.binance.com/fapi/v1/premiumIndex';
const FETCH_TIMEOUT_MS = 8_000;

// B69.3 (2026-05-04): CoinGecko Demo API key support per Kyle directive.
// Without a key, the unauthenticated endpoint shares an IP-pooled rate limit
// with the rest of the internet and was returning HTTP 429 ~50% of the time
// (verified via PM2 logs 2026-05-04 16:00-19:59). With a Demo key the request
// gets the per-key 30 calls/min quota — well above our 60s poll interval.
// Key lives ONLY in the staging .env file; not committed.
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY ?? '';
if (COINGECKO_API_KEY) {
  console.log('[B67.1][feed] CoinGecko Demo API key present — authenticated requests enabled');
} else {
  console.warn('[B67.1][feed] COINGECKO_API_KEY env var not set — falling back to unauthenticated requests (subject to shared rate limits)');
}

async function fetchWithTimeout(url: string, headers?: Record<string, string>): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: ctl.signal, headers });
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

/**
 * B69.3 (2026-05-04): Single-retry backoff on 429 responses. CoinGecko's
 * rate-limit response includes a Retry-After header but free/Demo tiers
 * sometimes don't populate it, so we use a fixed 3s backoff. One retry only —
 * if both fail, this poll cycle is partial and the next 60s tick will try
 * fresh. Persistent 429 across both attempts logs LOUDLY so we'd notice if
 * the API key is wrong / disabled / over quota.
 */
async function fetchCoinGeckoGlobal(): Promise<{
  btcDominance?: number;
  totalMarketCapUsd?: number;
}> {
  const headers: Record<string, string> = COINGECKO_API_KEY
    ? { 'x-cg-demo-api-key': COINGECKO_API_KEY }
    : {};

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetchWithTimeout(COINGECKO_GLOBAL, headers);
      if (res.ok) {
        const json = (await res.json()) as CoinGeckoGlobal;
        return {
          btcDominance: json.data?.market_cap_percentage?.btc,
          totalMarketCapUsd: json.data?.total_market_cap?.usd,
        };
      }
      if (res.status === 429 && attempt === 1) {
        // Backoff once, then retry
        await new Promise((r) => setTimeout(r, 3_000));
        continue;
      }
      // Non-429 error or 429-after-retry → loud log so we'd see if key is broken
      const isAuthIssue = res.status === 401 || res.status === 403;
      const tag = isAuthIssue ? '[B67.1][feed][AUTH]' : '[B67.1][feed]';
      console.warn(
        `${tag} CoinGecko HTTP ${res.status} (attempt ${attempt}/${attempt === 1 ? 2 : attempt})${
          isAuthIssue ? ' — check COINGECKO_API_KEY env var' : ''
        }`,
      );
      return {};
    } catch (err) {
      if (attempt === 1) {
        await new Promise((r) => setTimeout(r, 3_000));
        continue;
      }
      console.warn(
        '[B67.1][feed] CoinGecko fetch failed:',
        err instanceof Error ? err.message : err,
      );
      return {};
    }
  }
  return {};
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
    // BTC + ETH OI-weighted average. Per Kyle directive 2026-04-29 the
    // weights live in module_constants (b67_1_funding_btc_weight /
    // b67_1_funding_eth_weight) — no fallback for missing constants per the
    // no-fallbacks discipline. Read on each poll cycle so operator tuning
    // takes effect at the next 60s tick without redeploy.
    //
    // Drops gracefully when one perp side is missing — uses the available
    // side at full weight (this is a feed-availability fallback, not a
    // config fallback, so it's allowed and explicitly documented).
    const validBtc = Number.isFinite(btcRate);
    const validEth = Number.isFinite(ethRate);
    if (validBtc && validEth) {
      const btcW = await readConstStrict<number>('b67_1_funding_btc_weight');
      const ethW = await readConstStrict<number>('b67_1_funding_eth_weight');
      return { fundingRate: btcRate * btcW + ethRate * ethW };
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

  // B67.1 follow-up: persist after every poll so the rolling baseline survives
  // PM2 restarts. ~720 sample writes per window × 3 windows = ~2KB JSON;
  // synchronous fs write is well under the 60s poll cadence.
  persistFeedState();

  // B70 Step 3.3: archive snapshot for downstream analysis. Fire-and-forget,
  // try/catch wrapped — must never block the macro poll cycle.
  try {
    const { archiveMacroSnapshot } = await import('./data-archive/macro-feed-archiver.js');
    archiveMacroSnapshot({
      capturedAt: startedAt,
      btcDominance: cg.btcDominance,
      mcapMomentum: mcapMomentum,
      fundingRate: bn.fundingRate,
      modifierValue: undefined, // modifier computed downstream by MCE; this archive is feed-state, not modifier-state
      fallbackActive: partial,
      snapshot: {
        totalMarketCapUsd: cg.totalMarketCapUsd,
        windowSizes: {
          btcDom: state.btcDomWindow.size(),
          funding: state.fundingWindow.size(),
          mcapMomentum: state.mcapMomentumWindow.size(),
        },
        lastSuccessAt: state.lastSuccessAt,
      },
    });
  } catch (archErr) {
    console.warn(
      `[B70][ARCH] macro archive enqueue failed:`,
      archErr instanceof Error ? archErr.message : archErr,
    );
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

  // B67.1 follow-up 2026-04-29: restore persisted rolling-window state from
  // disk so the z-score baselines survive PM2 restarts. Without this, every
  // restart forces modifier=1.0 + fallbackActive=true for the first ~48
  // minutes (cold-start floor). With this, baselines pick up where they left
  // off and the modifier produces real values immediately.
  restoreFeedState();

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
