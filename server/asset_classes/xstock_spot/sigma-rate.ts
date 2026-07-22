/**
 * ═══════════════════════════════════════════════════════════════════════════
 * P19-B8.5e — per-symbol realized volatility RATE for the mark-staleness ceiling
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * WHY THIS EXISTS. The exit path's staleness ceiling was ONE GLOBAL 90s constant
 * applied to symbols whose risk-per-second differs ~11× (measured, `#548`): we were
 * blind to ~4% of adverse movement on the fastest name while refusing to act on the
 * SAFEST name 49×/24h. `ceiling = clamp(budget / σ_rate, floor, cap)` replaces it —
 * the time in which THIS symbol can move at most `budget` against us.
 *
 * ★ WHY A SIBLING AND NOT A REUSE (Langston ruling 2026-07-22). `price-liveness.ts`
 * `getRecentLastMoveStats` answers "is the tape alive and how often does it tick" —
 * snapCount / moveCount / msSinceLastMove, all CADENCE. σ_rate is a MAGNITUDE
 * statistic: dispersion of fractional move per unit time. Different numerator,
 * different reduction. What is reused is the READ-PATH CONTRACT — windowed,
 * `(symbol, captured_at)`-index-bounded, Promise.race hard-timed, fail-closed —
 * NOT the function. Overloading that function to return a stat it was not shaped to
 * compute would be the fast-and-wrong path sitting next to the slow-and-right one.
 *
 * ★ CADENCE IS DEMOTED, DELIBERATELY (`#548`, Langston's correction). An earlier draft
 * derived the ceiling from tick CADENCE. Cadence tells you what is NORMAL, not what is
 * SAFE — "too old to trust" is volatility × time. The measured data then showed cadence
 * and risk run OPPOSITE in today's names (the slowest-ticking symbol is the safest), so
 * a cadence rule would have been right TODAY BY LUCK and wrong the moment a
 * thin-AND-volatile name appears. The derivation is risk.
 *
 * ★ σ MUST NOT BE DERIVABLE FROM A THIN SYMBOL'S OWN THIN HISTORY. A young/thin/volatile
 * entrant has little history and therefore reads ARTIFICIALLY CALM — precisely when a
 * stale mark costs most. Below `sigma_min_observations` a symbol does NOT use its own σ;
 * it inherits a CONSERVATIVE class-wide upper-percentile σ. Self-σ is EARNED, not assumed.
 * This is the one place the design could still be right-by-luck, closed explicitly.
 *
 * FAIL-CLOSED: every failure path REJECTS or returns `null`. A caller that cannot obtain
 * a σ must NOT fall back to a wide window — absent σ ⇒ the tightest safe ceiling (the
 * caller's `floor_ms`), never the loosest. Mirrors the S20 price-liveness posture.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { db } from '../../db.js';
import { sql } from 'drizzle-orm';

/** Realized-volatility rate for one symbol over a trailing window. */
export interface SigmaRateStats {
  /** Ticks with a usable prior price in the window (the σ sample size). */
  observations: number;
  /**
   * Realized volatility as a FRACTIONAL move per SECOND: stddev of per-tick
   * fractional returns, divided by the mean inter-tick interval in seconds.
   * `null` when the window yields no usable dispersion (≤1 observation, or a
   * degenerate zero-variance window).
   */
  sigmaRatePerSec: number | null;
}

/** Outcome of resolving a symbol's σ, including WHICH source was used. */
export interface ResolvedSigma {
  sigmaRatePerSec: number;
  /** `self` = the symbol earned its own σ; `classwide` = inherited (not enough history). */
  source: 'self' | 'classwide';
  observations: number;
}

/**
 * Windowed realized-volatility read over `xstock_spot_ticker_snap`, index-bounded by
 * `(symbol, captured_at)` and the time window. Hard-timed via Promise.race — a timeout
 * REJECTS so the caller fails closed. One scan.
 *
 * ★ THE STATISTIC, stated so a reader does not have to infer it: per-tick fractional
 * return `r_i = (last_i - last_{i-1}) / last_{i-1}`, and per-tick elapsed seconds
 * `dt_i`. We return `stddev(r_i) / mean(dt_i)` — a fractional move per second, which is
 * the LINEAR rate the approved `budget / σ_rate` ceiling consumes.
 *
 * ⚠️ KNOWN MODELLING SIMPLIFICATION, recorded not buried: true diffusion scales with
 * √t, not t, so a linear rate OVERSTATES the move available over long horizons and
 * understates it over short ones. It is the approved form for this batch (`#548`
 * Step-2) and is CONSERVATIVE in the regime that matters — the ceiling lands in the
 * seconds-to-minutes range where the linear and √t curves are closest, and erring
 * toward a tighter window is the safe direction. Revisit only with measurement.
 */
export async function getSigmaRateStats(
  symbol: string,
  windowMs: number,
  queryTimeoutMs: number,
): Promise<SigmaRateStats> {
  const windowSec = Math.max(1, Math.round(windowMs / 1000));
  const queryP = db.execute<{ obs: string | number; stddev_ret: string | number | null; mean_dt_sec: string | number | null }>(sql`
    WITH w AS (
      SELECT last, captured_at,
             LAG(last)        OVER (ORDER BY captured_at) AS prev_last,
             LAG(captured_at) OVER (ORDER BY captured_at) AS prev_at
      FROM xstock_spot_ticker_snap
      WHERE symbol = ${symbol}
        AND captured_at > NOW() - make_interval(secs => ${windowSec})
        AND last > 0
    ), r AS (
      SELECT (last - prev_last) / prev_last AS ret,
             EXTRACT(EPOCH FROM (captured_at - prev_at)) AS dt_sec
      FROM w
      WHERE prev_last IS NOT NULL AND prev_last > 0 AND prev_at IS NOT NULL
    )
    SELECT count(*) AS obs,
           stddev_samp(ret) AS stddev_ret,
           avg(dt_sec)      AS mean_dt_sec
    FROM r
    WHERE dt_sec > 0
  `);

  let timer: NodeJS.Timeout | undefined;
  const timeoutP = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`sigma-rate query timeout >${queryTimeoutMs}ms`)), queryTimeoutMs);
  });

  try {
    const res = await Promise.race([queryP, timeoutP]);
    const rows = (res as any).rows ?? (res as unknown as any[]);
    const r = Array.isArray(rows) ? rows[0] : undefined;

    const obsRaw = Number(r?.obs ?? 0);
    const observations = Number.isFinite(obsRaw) ? obsRaw : 0;

    const sdRaw = r?.stddev_ret;
    const dtRaw = r?.mean_dt_sec;
    const sd = sdRaw === null || sdRaw === undefined ? NaN : Number(sdRaw);
    const meanDt = dtRaw === null || dtRaw === undefined ? NaN : Number(dtRaw);

    // stddev_samp is NULL at n<2; a zero-variance window is real but unusable as a rate.
    const usable = Number.isFinite(sd) && sd > 0 && Number.isFinite(meanDt) && meanDt > 0;
    return {
      observations,
      sigmaRatePerSec: usable ? sd / meanDt : null,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * The CONSERVATIVE class-wide σ a not-yet-earned symbol inherits: the upper-percentile
 * σ across xStock symbols that DO have enough history. Upper percentile = assume more
 * volatile = tighter ceiling = safer, which is the whole point of the inheritance.
 *
 * Returns `null` when the class itself has no qualifying symbols — the caller must then
 * fail CLOSED (tightest ceiling), never fall back to a wide window.
 */
export async function getClasswideSigmaRate(
  windowMs: number,
  minObservations: number,
  percentile: number,
  queryTimeoutMs: number,
): Promise<number | null> {
  const windowSec = Math.max(1, Math.round(windowMs / 1000));
  const pct = Math.min(Math.max(percentile, 0), 1);

  const queryP = db.execute<{ p: string | number | null }>(sql`
    WITH w AS (
      SELECT symbol, last, captured_at,
             LAG(last)        OVER (PARTITION BY symbol ORDER BY captured_at) AS prev_last,
             LAG(captured_at) OVER (PARTITION BY symbol ORDER BY captured_at) AS prev_at
      FROM xstock_spot_ticker_snap
      WHERE captured_at > NOW() - make_interval(secs => ${windowSec})
        AND last > 0
    ), r AS (
      SELECT symbol,
             (last - prev_last) / prev_last AS ret,
             EXTRACT(EPOCH FROM (captured_at - prev_at)) AS dt_sec
      FROM w
      WHERE prev_last IS NOT NULL AND prev_last > 0 AND prev_at IS NOT NULL
    ), per_symbol AS (
      SELECT symbol,
             count(*) AS obs,
             stddev_samp(ret) AS sd,
             avg(dt_sec) AS mean_dt
      FROM r
      WHERE dt_sec > 0
      GROUP BY symbol
    )
    SELECT percentile_cont(${pct}) WITHIN GROUP (ORDER BY (sd / mean_dt)) AS p
    FROM per_symbol
    WHERE obs >= ${minObservations} AND sd > 0 AND mean_dt > 0
  `);

  let timer: NodeJS.Timeout | undefined;
  const timeoutP = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`classwide-sigma query timeout >${queryTimeoutMs}ms`)), queryTimeoutMs);
  });

  try {
    const res = await Promise.race([queryP, timeoutP]);
    const rows = (res as any).rows ?? (res as unknown as any[]);
    const raw = Array.isArray(rows) ? rows[0]?.p : undefined;
    if (raw === null || raw === undefined) return null;
    const v = Number(raw);
    return Number.isFinite(v) && v > 0 ? v : null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * PURE resolution of which σ a symbol is entitled to use. Separated from the reads so
 * the earn-your-own-σ rule is unit-testable without a database.
 *
 * `self` ONLY when the symbol has ≥ `minObservations` of its own AND a usable rate;
 * otherwise the conservative class-wide value. `null` when neither is available — the
 * caller MUST then apply its tightest ceiling, never a wide one.
 */
export function resolveSigmaRate(
  own: SigmaRateStats,
  classwide: number | null,
  minObservations: number,
): ResolvedSigma | null {
  if (own.observations >= minObservations && own.sigmaRatePerSec !== null && own.sigmaRatePerSec > 0) {
    return { sigmaRatePerSec: own.sigmaRatePerSec, source: 'self', observations: own.observations };
  }
  if (classwide !== null && classwide > 0) {
    return { sigmaRatePerSec: classwide, source: 'classwide', observations: own.observations };
  }
  return null;
}
