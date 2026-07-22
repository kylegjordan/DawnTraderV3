/**
 * ═══════════════════════════════════════════════════════════════════════════
 * P19-B8.5e — the σ CACHE that makes the per-symbol staleness ceiling affordable
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * WHY THIS EXISTS. The ceiling needs a σ for every open position on EVERY exit-evaluation
 * tick. σ is a windowed aggregate over `xstock_spot_ticker_snap` — far too expensive to
 * read per-position-per-tick. But the exit path is the WRONG place to await a database
 * read: a slow query there delays every position's stop/target evaluation, which is the
 * one thing the exit path must never be late for.
 *
 * ★ THE SHAPE, and why it is this shape: **reads are SYNCHRONOUS and never touch the DB;
 * refreshes are ASYNCHRONOUS and never block an evaluation.** The exit path calls
 * `getCachedSigma()` (pure memory) and separately kicks `ensureSigmaFresh()` which returns
 * IMMEDIATELY and refreshes in the background. A refresh that is slow, failing, or wedged
 * therefore CANNOT delay an exit decision — it can only cause the cache to go stale, which
 * is handled below by failing CLOSED.
 *
 * ★ STALENESS OF THE CACHE ITSELF IS FAIL-CLOSED — the subtle one. A cached σ that is too
 * old is DROPPED rather than used: `getCachedSigma` returns `null`, and the caller's
 * documented contract is that a `null` σ yields the FLOOR (tightest window). So a database
 * outage does not silently freeze a stale-but-plausible σ into place and keep widening
 * windows off it; it degrades toward refusing to trust old marks, which is the safe
 * direction. This mirrors the `mark-staleness` policy's own posture: **every degenerate
 * path lands on the floor, never the cap.**
 *
 * ⚠️ σ IS NOT A PRICE. Do not repurpose this cache as a price/mark cache — it holds a
 * VOLATILITY statistic whose acceptable age (minutes) is orders of magnitude longer than a
 * mark's (seconds). Conflating the two is exactly the error `#548` exists to fix.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import {
  getSigmaRateStats,
  getClasswideSigmaRate,
  resolveSigmaRate,
  type ResolvedSigma,
} from './sigma-rate.js';

interface CacheEntry {
  resolved: ResolvedSigma;
  computedAtMs: number;
}

/** A cached σ plus HOW OLD it is — the age is load-bearing, not diagnostic. */
export type CachedSigmaRead = ResolvedSigma & { ageMs: number };

/** Per-symbol resolved σ. Bounded by the traded universe — no unbounded growth path. */
const cache = new Map<string, CacheEntry>();

/** The conservative class-wide σ a not-yet-earned symbol inherits. */
let classwide: { value: number; computedAtMs: number } | null = null;

/** In-flight guards — a slow refresh must not stack a queue of duplicate reads. */
const inFlight = new Set<string>();
let classwideInFlight = false;

export interface SigmaCacheConfig {
  /** Trailing window the σ statistic is measured over. */
  windowMs: number;
  /** Recompute a symbol's σ once its cached value is older than this. */
  refreshAfterMs: number;
  /** ★ HARD age limit: past this the entry is DROPPED and the caller fails closed. */
  maxAgeMs: number;
  /** Observations a symbol needs before it may use its OWN σ. */
  minObservations: number;
  /** Upper percentile for the inherited class-wide σ. */
  classwidePercentile: number;
  /** Per-query hard timeout — a wedged read must not pin an in-flight slot forever. */
  queryTimeoutMs: number;
}

/**
 * SYNCHRONOUS, pure-memory read. Never touches the database, never awaits.
 *
 * Returns `null` when this symbol has no usable cached σ — either never computed, or
 * cached too long ago to trust. ★ The caller MUST treat `null` as "use the tightest
 * ceiling (floor)", never as "no constraint".
 */
export function getCachedSigma(symbol: string, cfg: SigmaCacheConfig, nowMs = Date.now()): CachedSigmaRead | null {
  const hit = cache.get(symbol);
  if (!hit) return null;
  const ageMs = nowMs - hit.computedAtMs;
  if (ageMs > cfg.maxAgeMs) {
    // Too old to trust at all. DROP it — never hand back a σ this stale.
    cache.delete(symbol);
    return null;
  }
  // ★ `ageMs` is returned, not just used for the drop test. Dropping at max age alone would
  // still let a σ one millisecond inside the bound buy a FULL-WIDTH window — the stale-low-σ
  // fail-open hole. The policy inflates σ by this age so credit decays smoothly instead.
  return { ...hit.resolved, ageMs };
}

/**
 * Kick a background refresh for any of `symbols` whose σ is due. **Returns immediately** —
 * this is deliberately not awaited by the exit path.
 *
 * Errors are swallowed per-symbol by design: a failed refresh must not throw into an
 * evaluation loop, and its consequence is already correct — the entry simply ages out and
 * `getCachedSigma` starts returning `null` (⇒ floor ⇒ safe).
 */
export function ensureSigmaFresh(symbols: string[], cfg: SigmaCacheConfig, nowMs = Date.now()): void {
  // The inherited class-wide σ underpins every not-yet-earned symbol — refresh it first.
  if (!classwideInFlight && (classwide === null || nowMs - classwide.computedAtMs > cfg.refreshAfterMs)) {
    classwideInFlight = true;
    void getClasswideSigmaRate(cfg.windowMs, cfg.minObservations, cfg.classwidePercentile, cfg.queryTimeoutMs)
      .then((v) => {
        if (v !== null && Number.isFinite(v) && v > 0) classwide = { value: v, computedAtMs: Date.now() };
      })
      .catch((err) => {
        console.warn('[P19-B8.5e][SIGMA_CACHE] class-wide σ refresh failed (entries will age out ⇒ floor):',
          err instanceof Error ? err.message : err);
      })
      .finally(() => { classwideInFlight = false; });
  }

  // ★ EXPIRE the class-wide σ on the SAME maxAge bound as per-symbol entries (Langston
  // Step-4, 2026-07-22 — he caught that this was refreshed-or-KEPT and never dropped).
  // Without this the last-good class-wide σ survives a persistent refresh outage forever
  // and keeps feeding every not-yet-earned symbol's re-resolve. Bounded (upper-percentile,
  // sub-threshold symbols only) but it bites in exactly the bad direction if class-wide
  // volatility ROSE during the outage — a stale-LOW σ widening windows. Dropping it makes
  // the module's "everything ages toward the floor" invariant true WITHOUT an asterisk.
  if (classwide !== null && nowMs - classwide.computedAtMs > cfg.maxAgeMs) {
    classwide = null;
  }

  for (const symbol of symbols) {
    if (inFlight.has(symbol)) continue;
    const hit = cache.get(symbol);
    if (hit && nowMs - hit.computedAtMs <= cfg.refreshAfterMs) continue;

    inFlight.add(symbol);
    void getSigmaRateStats(symbol, cfg.windowMs, cfg.queryTimeoutMs)
      .then((own) => {
        const resolved = resolveSigmaRate(own, classwide?.value ?? null, cfg.minObservations);
        if (resolved !== null) {
          cache.set(symbol, { resolved, computedAtMs: Date.now() });
        }
        // resolved === null ⇒ neither own nor class-wide σ available. Deliberately do NOT
        // write anything: the caller then fails closed to the floor, which is correct.
      })
      .catch((err) => {
        console.warn(`[P19-B8.5e][SIGMA_CACHE] σ refresh failed for ${symbol} (will age out ⇒ floor):`,
          err instanceof Error ? err.message : err);
      })
      .finally(() => { inFlight.delete(symbol); });
  }
}

/** Test seam — deterministic state between cases. Not for production use. */
export function __resetSigmaCacheForTests(): void {
  cache.clear();
  classwide = null;
  inFlight.clear();
  classwideInFlight = false;
}

/** Test/diagnostic seam: inject a known σ without a database. */
export function __seedSigmaForTests(symbol: string, resolved: ResolvedSigma, computedAtMs = Date.now()): void {
  cache.set(symbol, { resolved, computedAtMs });
}
