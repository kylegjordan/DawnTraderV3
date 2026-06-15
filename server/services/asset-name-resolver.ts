/**
 * B-NAMES (2026-06-15) — last-resort crypto asset-name resolver.
 *
 * Implements the data-quality backfill half of RUNNING_ISSUES #298. When a
 * crypto symbol's curated local name (the CRYPTO_NAMES map in
 * shared/asset-names.ts) MISSES or merely echoes the ticker (e.g. CHIP→'CHIP'),
 * this background service resolves the real token name from CoinGecko and
 * persists it to the `asset_names` overlay table. The client reads that
 * overlay via GET /api/crypto/asset-names and merges it into the name lookup —
 * curated map still wins (map-first), this fills the gaps.
 *
 * Design (per Claude Comms and Packages/Scope Files/B_NAMES_PRE_AUDIT.md, with
 * Langston Step-2 conditions folded in):
 *   - TIER-0 — pinned id: if the symbol is in SYMBOL_TO_COINGECKO_ID
 *     (market-data.ts), use that coin id DIRECTLY → zero ambiguity, no
 *     /coins/list lookup. These are our most-traded coins; pin-first keeps
 *     disambiguation risk off the symbols that matter most.
 *   - TIER-1 — /coins/list symbol→id(s), then /coins/markets for name + market
 *     cap, then NAMED market-cap-gap disambiguation (see DISAMBIGUATION_* below).
 *   - Negative-cache: a resolved MISS is persisted (name=NULL) with a backoff
 *     horizon so a permanently-unresolvable symbol is not re-hit every sweep.
 *   - Two-way counter: 'ambiguous' (a collision with no clear leader) is
 *     counted SEPARATELY from 'hard_miss' (symbol not on /coins/list at all),
 *     so we can tell "tune the gap" from "needs a curated entry".
 *   - Fail-graceful: any failure leaves the name hidden (already shipped); the
 *     resolver never throws into a request/render path.
 *
 * Runs OFF the request hot path as a throttled background sweep (boot + every
 * 6h). The CoinGecko calls reuse the tier-aware auth + 429 single-retry backoff
 * established in external-macro-feed.ts (B67.1 / B69.3).
 */

import { db } from '../db.js';
import { sql } from 'drizzle-orm';
import { SYMBOL_TO_COINGECKO_ID } from './market-data.js';
import { getCuratedCryptoName } from '../../shared/asset-names.js';

// ──────────────────────────────────────────────────────────────────────────
// Disambiguation constant (Langston Step-2 CONDITION 1 — named, documented)
// ──────────────────────────────────────────────────────────────────────────
//
// CoinGecko ticker collisions are SEVERE: scam / clone tokens routinely share a
// real project's ticker and can out-list it (the listing order is not the
// market). We therefore accept a candidate as the unambiguous owner of a
// ticker ONLY when its market cap dominates — leader ≥ DOMINANCE_MULTIPLE ×
// runner-up AND leader itself above an absolute floor (so two tiny dust tokens
// can't "win" by ratio alone). A lone candidate (no collision) is accepted on
// identity. Anything else → SKIP→hide (counted as 'ambiguous'): rather hide
// the name than render the WRONG project's name, which reads as a data-
// integrity bug. A wrong resolution is never silent/permanent — the row
// carries source+confidence+resolved_at and a manual re-resolve/override path
// (delete or update the asset_names row).
export const DISAMBIGUATION_DOMINANCE_MULTIPLE = 5;          // leader ≥ 5× runner-up market cap
export const DISAMBIGUATION_MIN_MCAP_FLOOR_USD = 10_000_000; // and ≥ $10M absolute, when disambiguating a collision

// ──────────────────────────────────────────────────────────────────────────
// CoinGecko HTTP lane (tier-aware auth + 429 single-retry + throttle)
// ──────────────────────────────────────────────────────────────────────────

const CG_FETCH_TIMEOUT_MS = 10_000;
const CG_MIN_INTERVAL_MS = 1_500;        // throttle floor between CoinGecko calls (demo-tier-safe)
const CG_429_BACKOFF_MS = 3_000;         // mirror external-macro-feed B69.3 fixed backoff
const COINS_LIST_TTL_MS = 24 * 60 * 60 * 1000; // /coins/list refreshed at most daily

let _warnedNoTier = false;
function cgConfig(): { baseUrl: string; keyHeader: string; apiKey: string } {
  // external-macro-feed.ts enforces COINGECKO_API_TIER at boot (throws if
  // unset), so in real deploys it is always set. This is a fail-graceful read:
  // if somehow unset (e.g. an isolated unit run), warn once + assume demo.
  const tierRaw = process.env.COINGECKO_API_TIER;
  if (!tierRaw && !_warnedNoTier) {
    _warnedNoTier = true;
    console.warn('[B-NAMES] COINGECKO_API_TIER unset — assuming demo tier for name resolution');
  }
  const isPro = (tierRaw ?? 'demo').toLowerCase() === 'pro';
  return {
    baseUrl: isPro ? 'https://pro-api.coingecko.com/api/v3' : 'https://api.coingecko.com/api/v3',
    keyHeader: isPro ? 'x-cg-pro-api-key' : 'x-cg-demo-api-key',
    apiKey: process.env.COINGECKO_API_KEY ?? '',
  };
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

let _lastCgCallAt = 0;
async function throttle(): Promise<void> {
  const since = Date.now() - _lastCgCallAt;
  if (since < CG_MIN_INTERVAL_MS) await sleep(CG_MIN_INTERVAL_MS - since);
  _lastCgCallAt = Date.now();
}

/** Throttled CoinGecko GET with timeout + one 429 retry. Returns parsed JSON or null. */
async function cgFetchJson<T>(path: string): Promise<T | null> {
  const { baseUrl, keyHeader, apiKey } = cgConfig();
  const url = `${baseUrl}${path}`;
  const headers: Record<string, string> = apiKey ? { [keyHeader]: apiKey } : {};

  for (let attempt = 1; attempt <= 2; attempt++) {
    await throttle();
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), CG_FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: ctl.signal, headers });
      if (res.ok) return (await res.json()) as T;
      if (res.status === 429 && attempt === 1) {
        await sleep(CG_429_BACKOFF_MS);
        continue;
      }
      const isAuth = res.status === 401 || res.status === 403;
      console.warn(
        `[B-NAMES] CoinGecko HTTP ${res.status} for ${path} (attempt ${attempt})` +
        (isAuth ? ' — check COINGECKO_API_KEY env var' : ''),
      );
      return null;
    } catch (err) {
      if (attempt === 1) { await sleep(CG_429_BACKOFF_MS); continue; }
      console.warn('[B-NAMES] CoinGecko fetch failed:', err instanceof Error ? err.message : err);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

// ──────────────────────────────────────────────────────────────────────────
// /coins/list index (symbol → candidate coins) — cached up to 24h
// ──────────────────────────────────────────────────────────────────────────

interface CoinsListEntry { id: string; symbol: string; name: string }
interface CoinsMarket { id: string; symbol: string; name: string; market_cap: number | null }

let _coinsListIndex: Map<string, Array<{ id: string; name: string }>> | null = null;
let _coinsListLoadedAt = 0;

/** Build/refresh the UPPER(symbol) → [{id,name}] index from /coins/list. */
async function getCoinsListIndex(): Promise<Map<string, Array<{ id: string; name: string }>> | null> {
  if (_coinsListIndex && Date.now() - _coinsListLoadedAt < COINS_LIST_TTL_MS) return _coinsListIndex;
  const list = await cgFetchJson<CoinsListEntry[]>('/coins/list');
  if (!Array.isArray(list)) return _coinsListIndex; // keep stale index on failure (better than nothing)
  const idx = new Map<string, Array<{ id: string; name: string }>>();
  for (const c of list) {
    if (!c?.symbol || !c?.id) continue;
    const key = c.symbol.toUpperCase();
    const arr = idx.get(key) ?? [];
    arr.push({ id: c.id, name: c.name });
    idx.set(key, arr);
  }
  _coinsListIndex = idx;
  _coinsListLoadedAt = Date.now();
  console.log(`[B-NAMES] /coins/list index loaded: ${idx.size} distinct symbols`);
  return idx;
}

/** Fetch name + market cap for a set of coin ids (one batched /coins/markets call). */
async function fetchMarkets(ids: string[]): Promise<CoinsMarket[]> {
  if (ids.length === 0) return [];
  const idsParam = encodeURIComponent(ids.join(','));
  const data = await cgFetchJson<CoinsMarket[]>(
    `/coins/markets?vs_currency=usd&ids=${idsParam}&per_page=250&page=1`,
  );
  return Array.isArray(data) ? data : [];
}

// ──────────────────────────────────────────────────────────────────────────
// PURE disambiguation — exported for unit testing (the part Langston reviews)
// ──────────────────────────────────────────────────────────────────────────

export type DisambiguationVerdict =
  | { kind: 'resolved'; id: string; name: string; reason: string }
  | { kind: 'ambiguous'; reason: string }
  | { kind: 'hard_miss'; reason: string };

/**
 * Pick the unambiguous owner of a ticker from its CoinGecko candidates by
 * market-cap dominance. See DISAMBIGUATION_* constants for the rule.
 *   - 0 candidates → hard_miss (symbol absent from /coins/list).
 *   - 1 candidate  → resolved (no collision possible; accept on identity).
 *   - >1 candidate → resolved ONLY if leader ≥ floor AND leader ≥ multiple ×
 *     runner-up; otherwise ambiguous (skip→hide).
 */
export function disambiguateByMarketCap(
  candidates: Array<{ id: string; name: string; marketCap: number | null }>,
): DisambiguationVerdict {
  if (candidates.length === 0) return { kind: 'hard_miss', reason: 'no-candidates' };

  const ranked = candidates
    .map((c) => ({ ...c, mc: c.marketCap ?? 0 }))
    .sort((a, b) => b.mc - a.mc);
  const leader = ranked[0];

  if (ranked.length === 1) {
    return { kind: 'resolved', id: leader.id, name: leader.name, reason: 'single-candidate' };
  }

  const runnerUp = ranked[1];
  if (leader.mc < DISAMBIGUATION_MIN_MCAP_FLOOR_USD) {
    return { kind: 'ambiguous', reason: 'leader-below-floor' };
  }
  if (leader.mc < runnerUp.mc * DISAMBIGUATION_DOMINANCE_MULTIPLE) {
    return { kind: 'ambiguous', reason: 'no-clear-leader' };
  }
  return { kind: 'resolved', id: leader.id, name: leader.name, reason: 'dominant-leader' };
}

// ──────────────────────────────────────────────────────────────────────────
// Per-symbol resolution (network)
// ──────────────────────────────────────────────────────────────────────────

type ResolveOutcome =
  | { kind: 'resolved'; name: string; source: 'coingecko' | 'coingecko-pinned' }
  | { kind: 'ambiguous' }
  | { kind: 'hard_miss' }
  | { kind: 'error' };

async function resolveCryptoSymbol(baseSymbol: string): Promise<ResolveOutcome> {
  try {
    // TIER-0: pinned id — zero ambiguity for our most-traded coins.
    const pinnedId = SYMBOL_TO_COINGECKO_ID[baseSymbol];
    if (pinnedId) {
      const markets = await fetchMarkets([pinnedId]);
      const m = markets.find((x) => x.id === pinnedId);
      if (m?.name) return { kind: 'resolved', name: m.name, source: 'coingecko-pinned' };
      // pinned id returned no name (rare) → fall through to tier-1
    }

    // TIER-1: /coins/list symbol→ids → /coins/markets → mcap-gap disambiguation.
    const idx = await getCoinsListIndex();
    if (!idx) return { kind: 'error' };
    const candidates = idx.get(baseSymbol) ?? [];
    if (candidates.length === 0) return { kind: 'hard_miss' };

    const markets = await fetchMarkets(candidates.map((c) => c.id));
    if (markets.length === 0) return { kind: 'error' }; // markets call failed; retry next sweep

    const verdict = disambiguateByMarketCap(
      markets.map((m) => ({ id: m.id, name: m.name, marketCap: m.market_cap })),
    );
    if (verdict.kind === 'resolved') return { kind: 'resolved', name: verdict.name, source: 'coingecko' };
    if (verdict.kind === 'ambiguous') return { kind: 'ambiguous' };
    return { kind: 'hard_miss' };
  } catch (err) {
    console.warn(`[B-NAMES] resolveCryptoSymbol(${baseSymbol}) threw:`, err instanceof Error ? err.message : err);
    return { kind: 'error' };
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Persistence (write-through + negative-cache)
// ──────────────────────────────────────────────────────────────────────────

const CRYPTO_CLASS = 'crypto_spot';

async function writePositive(symbol: string, name: string, source: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO asset_names (symbol, asset_class, name, source, confidence, resolved_at, attempts, next_retry_at)
    VALUES (${symbol}, ${CRYPTO_CLASS}, ${name}, ${source}, 'resolved', now(), 1, NULL)
    ON CONFLICT (symbol, asset_class) DO UPDATE SET
      name = EXCLUDED.name,
      source = EXCLUDED.source,
      confidence = 'resolved',
      resolved_at = now(),
      next_retry_at = NULL
  `);
}

async function writeNegative(symbol: string, confidence: 'ambiguous' | 'hard_miss'): Promise<void> {
  // Backoff horizon grows with attempts (1 day per attempt, capped at 30 days).
  // First miss waits ~1 day before re-trying; manual clear = DELETE the row.
  await db.execute(sql`
    INSERT INTO asset_names (symbol, asset_class, name, source, confidence, resolved_at, attempts, next_retry_at)
    VALUES (${symbol}, ${CRYPTO_CLASS}, NULL, 'miss', ${confidence}, now(), 1, now() + INTERVAL '1 day')
    ON CONFLICT (symbol, asset_class) DO UPDATE SET
      confidence = ${confidence},
      source = 'miss',
      resolved_at = now(),
      attempts = asset_names.attempts + 1,
      next_retry_at = now() + (LEAST(asset_names.attempts + 1, 30) * INTERVAL '1 day')
  `);
}

// ──────────────────────────────────────────────────────────────────────────
// Observable counters (Langston CONDITION 2 — two-way split)
// ──────────────────────────────────────────────────────────────────────────

interface ResolverStats {
  resolved: number;        // tier-1 dominant/single-candidate resolutions
  resolvedPinned: number;  // tier-0 pinned-id resolutions
  ambiguous: number;       // collision, no clear leader / below floor (tune the gap)
  hardMiss: number;        // symbol absent from /coins/list (needs a curated entry)
  errors: number;          // transient network/API errors (retried next sweep)
  swept: number;           // symbols examined this process lifetime
  lastSweepAt: string | null;
  lastSweepResolved: number;
  lastSweepAmbiguous: number;
  lastSweepHardMiss: number;
}

const _stats: ResolverStats = {
  resolved: 0, resolvedPinned: 0, ambiguous: 0, hardMiss: 0, errors: 0,
  swept: 0, lastSweepAt: null, lastSweepResolved: 0, lastSweepAmbiguous: 0, lastSweepHardMiss: 0,
};

export function getAssetNameResolverStats(): ResolverStats {
  return { ..._stats };
}

// ──────────────────────────────────────────────────────────────────────────
// Sweep
// ──────────────────────────────────────────────────────────────────────────

/** Distinct crypto base symbols (from open + historical VTS trades) that have
 *  NO curated name, NO positive overlay row, and are NOT in negative-cache
 *  backoff — i.e. the symbols worth resolving this sweep. */
async function fetchUnresolvedCryptoSymbols(): Promise<string[]> {
  // vts_open_trades carries both live (closed=false) and soft-deleted historical
  // (closed=true) rows, so DISTINCT symbol covers everything the UI ever showed.
  const tradesRes: any = await db.execute(sql`
    SELECT DISTINCT symbol FROM vts_open_trades WHERE asset_class LIKE 'crypto%'
  `);
  const tradeRows: any[] = tradesRes?.rows ?? tradesRes ?? [];
  const bases = new Set<string>();
  for (const r of tradeRows) {
    const base = String(r.symbol ?? '').split('/')[0]?.toUpperCase();
    if (base) bases.add(base);
  }

  const existingRes: any = await db.execute(sql`
    SELECT symbol, name, next_retry_at FROM asset_names WHERE asset_class LIKE 'crypto%'
  `);
  const existingRows: any[] = existingRes?.rows ?? existingRes ?? [];
  const positive = new Set<string>();
  const backingOff = new Set<string>();
  const nowMs = Date.now();
  for (const r of existingRows) {
    const s = String(r.symbol ?? '').toUpperCase();
    if (!s) continue;
    if (r.name) positive.add(s);
    else if (r.next_retry_at && new Date(r.next_retry_at).getTime() > nowMs) backingOff.add(s);
  }

  const out: string[] = [];
  for (const base of bases) {
    if (positive.has(base)) continue;          // already resolved (overlay covers it)
    if (getCuratedCryptoName(base)) continue;  // curated CRYPTO_NAMES map covers it
    if (backingOff.has(base)) continue;        // negative-cache backoff window
    out.push(base);
  }
  return out;
}

let _sweepRunning = false;

/** Resolve all currently-unresolved crypto symbol names. Off the hot path. */
export async function runCryptoNameSweep(trigger: string): Promise<ResolverStats> {
  if (_sweepRunning) {
    console.log(`[B-NAMES][sweep:${trigger}] already running — skipping`);
    return getAssetNameResolverStats();
  }
  _sweepRunning = true;
  const startedAt = Date.now();
  let nResolved = 0, nAmbiguous = 0, nHardMiss = 0;
  try {
    let symbols: string[] = [];
    try {
      symbols = await fetchUnresolvedCryptoSymbols();
    } catch (err) {
      console.error('[B-NAMES][sweep] failed to load unresolved symbols:', err instanceof Error ? err.message : err);
      return getAssetNameResolverStats();
    }
    console.log(`[B-NAMES][sweep:${trigger}] ${symbols.length} unresolved crypto symbol(s) to resolve`);

    for (const sym of symbols) {
      _stats.swept++;
      const outcome = await resolveCryptoSymbol(sym);
      try {
        if (outcome.kind === 'resolved') {
          await writePositive(sym, outcome.name, outcome.source);
          if (outcome.source === 'coingecko-pinned') _stats.resolvedPinned++; else _stats.resolved++;
          nResolved++;
        } else if (outcome.kind === 'ambiguous') {
          await writeNegative(sym, 'ambiguous');
          _stats.ambiguous++; nAmbiguous++;
        } else if (outcome.kind === 'hard_miss') {
          await writeNegative(sym, 'hard_miss');
          _stats.hardMiss++; nHardMiss++;
        } else {
          _stats.errors++; // transient — no negative-cache write, retry next sweep
        }
      } catch (err) {
        _stats.errors++;
        console.warn(`[B-NAMES][sweep] persist failed for ${sym}:`, err instanceof Error ? err.message : err);
      }
    }

    _stats.lastSweepAt = new Date().toISOString();
    _stats.lastSweepResolved = nResolved;
    _stats.lastSweepAmbiguous = nAmbiguous;
    _stats.lastSweepHardMiss = nHardMiss;
    console.log(
      `[B-NAMES][sweep:${trigger}] done in ${Date.now() - startedAt}ms — ` +
      `resolved=${nResolved} ambiguous=${nAmbiguous} hardMiss=${nHardMiss} ` +
      `(lifetime: resolved=${_stats.resolved} pinned=${_stats.resolvedPinned} ` +
      `ambiguous=${_stats.ambiguous} hardMiss=${_stats.hardMiss} errors=${_stats.errors})`,
    );
  } finally {
    _sweepRunning = false;
  }
  return getAssetNameResolverStats();
}

// ──────────────────────────────────────────────────────────────────────────
// Scheduler (boot + every 6h; off the request hot path)
// ──────────────────────────────────────────────────────────────────────────

const SWEEP_INITIAL_DELAY_MS = 90 * 1000;         // let boot settle first
const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;     // 6h

let _sweepTimer: NodeJS.Timeout | null = null;

export function startAssetNameResolver(): void {
  if (_sweepTimer) {
    console.warn('[B-NAMES] startAssetNameResolver called twice — ignoring second call');
    return;
  }
  console.log('[B-NAMES] crypto asset-name resolver scheduled (first run +90s, then every 6h)');
  setTimeout(() => { void runCryptoNameSweep('boot'); }, SWEEP_INITIAL_DELAY_MS);
  _sweepTimer = setInterval(() => { void runCryptoNameSweep('interval'); }, SWEEP_INTERVAL_MS);
}

export function stopAssetNameResolver(): void {
  if (_sweepTimer) { clearInterval(_sweepTimer); _sweepTimer = null; }
}
