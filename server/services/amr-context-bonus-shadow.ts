/**
 * ══════════════════════════════════════════════════════════════════════════════
 * B-5 AMR (Obj-10, #217 REVERSAL) — CONTEXT_BONUS wired AT SHADOW
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Kyle ruling 2026-06-11: dead-but-DESIGNED-to-work = FIX, not delete. The
 * CONTEXT_BONUS regime-agreement term (ranking-weights.ts) was designed into
 * rankingScore from the start but was never computable before per-class
 * regime existed (B-4.7). This module computes it FOR REAL on every ranked
 * selection and stamps the evidence on the AMR decision ledger —
 * STRUCTURALLY ABSENT from live ranking composition until the Phase-19
 * flag-flip applies it with shadow-confirmed values.
 *
 * Three terms per signal:
 *   regime agreement — pair regime vs ITS OWN class's dominant vote
 *     (voteStatus-aware: class IDLE ⇒ no term, reason stamped).
 *   confirmation     — crypto: BTC/USD trend (in-system MCE context — the
 *     "awaiting-B67" label was WRONG, B67.1 has been live since April);
 *     xstock: SPY/USD 15-minute bars (729 live bars verified) with the four
 *     SPY pins: CLOSED buckets only; staleness → 'stale_bars' (the third
 *     reason code); off-RTH aligns with class IDLE (no confirmation term);
 *     lookback ≤ stored window boot-asserted.
 *   bull-compatibility mapping — regime → bull-compatible is a DB-tunable
 *     jsonb table (never hardcoded; §11).
 *
 * Ledger stamps per (class, selection): per-signal computed bonuses,
 * agreement states, WOULD-rank-1-changed (the headline shadow question), and
 * ceiling-saturation-rate (#221 leveling decision number: fraction of ranked
 * signals whose net-return component saturates NET_RETURN_CEILING — the
 * xstock under-ranking evidence feed).
 *
 * Values seeded DB-tunable at the documented ±0.06/−0.04 (regime) and
 * +0.03/−0.02 (confirmation) — module_constants `ranking_context_bonus`.
 */

import { getCachedNumberRequired, getCachedConstant } from './module-constants-service.js';
import { getMarketIndicators } from './market-indicators.js';
import { isXstockMarketOpenUTC } from '../asset_classes/xstock_spot/market-hours.js';
import { NET_RETURN_CEILING } from '../config/ranking-weights.js';
import type { AssetClass } from '../../shared/asset-classes.js';

const MOD = 'ranking_context_bonus';

function key(assetClass: AssetClass) {
  return { exchange: '*', assetClass, strategy: '*', regime: '*' };
}

export interface ContextBonusShadowStamp {
  computedAt: number;
  signalCount: number;
  classVoteRegime: string | null;
  classVoteStatus: string;
  confirmationState: 'confirms' | 'disagrees' | 'unavailable' | 'class_idle' | 'stale_bars';
  perSignal: Array<{
    symbol: string;
    pairRegime: string | null;
    agreement: 'agree' | 'disagree' | 'unavailable';
    regimeTerm: number;
    confirmationTerm: number;
    totalBonus: number;
  }>;
  /** Would applying the bonuses have changed the rank-1 selection?
   *  ★ #595: `null` = COULD NOT BE DETERMINED (no signal carried a live rank basis), which is
   *  NOT the same as `false`. Previously the basis was coerced from absent to 0, making this a
   *  comparison of pure bonus that always looked answerable. Same `| null` convention as
   *  `ceilingSaturationRate` below. **Do not read a `null` here as "the bonus changes nothing."** */
  rank1Changed: boolean | null;
  /** ★ #595: how many signals had NO live rank basis and were therefore excluded from the
   *  WOULD-rank-1 comparison. `rank1BasisMissing === signalCount` ⇒ the comparison ran on nothing. */
  rank1BasisMissing: number;
  /** #221: fraction of ranked signals whose net-return input saturates the ceiling (null = inputs absent). */
  ceilingSaturationRate: number | null;
}

function bullCompatible(assetClass: AssetClass, regime: string | null): boolean | null {
  if (!regime) return null;
  const table = getCachedConstant<Record<string, boolean>>(MOD, 'bull_compatible_regimes', key(assetClass));
  if (!table || typeof table !== 'object') {
    throw new Error(`[B-5][#217] bull_compatible_regimes mapping missing for '${assetClass}' — migration seeds it; no fallback by design.`);
  }
  return table[regime] ?? null;
}

// ── Confirmation trend sources ───────────────────────────────────────────────
/** Crypto: BTC/USD regime from the MCE cached context (in-system, no new
 *  feed). Lazy module ref keeps the graph cycle-free (MCE is heavy). */
let _mceMod: typeof import('./market-context-engine.js') | null = null;
void import('./market-context-engine.js').then(m => { _mceMod = m; }).catch(() => { /* stays unavailable */ });

function btcTrendBullish(): boolean | null {
  try {
    const mce = _mceMod?.getMarketContextEngine();
    const ctx = (mce as { getCachedContext?: (s: string) => unknown } | undefined)?.getCachedContext?.('BTC/USD') as { regime?: { regime?: string } | string } | undefined;
    const raw = ctx?.regime;
    const regime = typeof raw === 'string' ? raw : raw?.regime;
    return bullCompatible('crypto_spot', typeof regime === 'string' ? regime : null);
  } catch {
    return null;
  }
}

/** xstock: SPY/USD 15m-bar trend — cached 5 min; CLOSED buckets only. */
let spyTrendCache: { value: boolean | null; state: 'ok' | 'stale_bars' | 'unavailable'; at: number } = { value: null, state: 'unavailable', at: 0 };

async function spyTrendBullish(now: number): Promise<{ value: boolean | null; state: 'ok' | 'stale_bars' | 'unavailable' }> {
  if (now - spyTrendCache.at < 300_000) return spyTrendCache;
  try {
    const lookback = getCachedNumberRequired(MOD, 'spy_trend_lookback_bars', key('xstock_spot'));
    const staleMin = getCachedNumberRequired(MOD, 'spy_bar_staleness_minutes', key('xstock_spot'));
    const thresholdPct = getCachedNumberRequired(MOD, 'spy_trend_threshold_pct', key('xstock_spot'));
    const { db } = await import('../db.js');
    const { sql } = await import('drizzle-orm');
    // CLOSED buckets only: bucket_start + 15min <= now (SPY pin 2).
    const res = await db.execute<{ bucket_start: Date; close: string }>(sql`
      SELECT bucket_start, close::text AS close
      FROM xstock_spot_ohlc_15m_snapshot
      WHERE symbol = 'SPY/USD'
        AND bucket_start + INTERVAL '15 minutes' <= NOW()
      ORDER BY bucket_start DESC
      LIMIT ${sql.raw(String(Math.max(2, Math.floor(lookback))))}
    `);
    const rows = ((res as { rows?: Array<{ bucket_start: Date; close: string }> }).rows ?? []) as Array<{ bucket_start: Date; close: string }>;
    if (rows.length < 2) {
      spyTrendCache = { value: null, state: 'unavailable', at: now };
      return spyTrendCache;
    }
    const newestAgeMin = (now - new Date(rows[0].bucket_start).getTime() - 15 * 60_000) / 60_000;
    if (newestAgeMin > staleMin) {
      // SPY pin 3: stale bars are their OWN reason — never silently bullish/bearish.
      spyTrendCache = { value: null, state: 'stale_bars', at: now };
      return spyTrendCache;
    }
    const newest = parseFloat(rows[0].close);
    const oldest = parseFloat(rows[rows.length - 1].close);
    if (!(newest > 0 && oldest > 0)) {
      spyTrendCache = { value: null, state: 'unavailable', at: now };
      return spyTrendCache;
    }
    const movePct = ((newest - oldest) / oldest) * 100;
    spyTrendCache = { value: Math.abs(movePct) < thresholdPct ? null : movePct > 0, state: 'ok', at: now };
    return spyTrendCache;
  } catch {
    spyTrendCache = { value: null, state: 'unavailable', at: now };
    return spyTrendCache;
  }
}

export interface RankedSignalLike {
  symbol: string;
  regime?: string | null;
  finalScore?: string | number | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Compute the shadow stamp for one class's ranked set. NEVER mutates ranking;
 * never throws into the selection path (caller wraps).
 */
export async function computeContextBonusShadow(
  assetClass: AssetClass,
  signals: RankedSignalLike[],
  liveRank1Symbol: string | null,
  now: number = Date.now(),
): Promise<ContextBonusShadowStamp> {
  const mi = getMarketIndicators(assetClass);
  const classIdle = mi.voteStatus !== 'LIVE'
    || (assetClass === 'xstock_spot' && !isXstockMarketOpenUTC('SPY/USD', new Date(now)));

  const agreeBonus = getCachedNumberRequired(MOD, 'regime_agreement_bonus', key(assetClass));
  const disagreePenalty = getCachedNumberRequired(MOD, 'regime_disagreement_penalty', key(assetClass));
  const confirmBonus = getCachedNumberRequired(MOD, 'confirmation_bonus', key(assetClass));
  const confirmPenalty = getCachedNumberRequired(MOD, 'confirmation_penalty', key(assetClass));

  // Confirmation input (class-level, one read per selection).
  let confirmationState: ContextBonusShadowStamp['confirmationState'] = 'unavailable';
  let confirmBull: boolean | null = null;
  if (classIdle) {
    confirmationState = 'class_idle'; // SPY pin 4: off-RTH aligns with IDLE
  } else if (assetClass === 'crypto_spot') {
    confirmBull = btcTrendBullish();
    confirmationState = confirmBull === null ? 'unavailable' : 'confirms';
  } else {
    const spy = await spyTrendBullish(now);
    confirmBull = spy.value;
    confirmationState = spy.state === 'ok' ? (confirmBull === null ? 'unavailable' : 'confirms') : spy.state;
  }
  const classVoteBull = classIdle ? null : bullCompatible(assetClass, mi.marketRegime as string);

  const perSignal: ContextBonusShadowStamp['perSignal'] = [];
  let bestAdjusted = -1;
  let bestAdjustedSymbol: string | null = null;
  let saturated = 0;
  let saturationKnown = 0;
  // #595: signals whose LIVE rank basis was absent, so they could not participate
  // in the WOULD-rank-1 comparison at all. Counted, never silently defaulted.
  let rank1BasisMissing = 0;

  for (const s of signals) {
    const pairRegime = (s.regime ?? (s.metadata?.regime as string | undefined)) ?? null;
    const pairBull = classIdle ? null : bullCompatible(assetClass, pairRegime);
    let agreement: 'agree' | 'disagree' | 'unavailable' = 'unavailable';
    let regimeTerm = 0;
    if (pairBull !== null && classVoteBull !== null) {
      agreement = pairBull === classVoteBull ? 'agree' : 'disagree';
      regimeTerm = agreement === 'agree' ? agreeBonus : disagreePenalty;
    }
    let confirmationTerm = 0;
    if (confirmBull !== null && classVoteBull !== null) {
      const confirms = confirmBull === classVoteBull;
      confirmationTerm = confirms ? confirmBonus : confirmPenalty;
      if (confirmationState === 'confirms' && !confirms) confirmationState = 'disagrees';
    }
    const totalBonus = regimeTerm + confirmationTerm;
    perSignal.push({ symbol: s.symbol, pairRegime, agreement, regimeTerm, confirmationTerm, totalBonus });

    // WOULD-rank-1: live ranking + bonus (the live composition stays untouched).
    // ★ #595 (#558 residual — Langston census + CC-B live-row measurement, agreeing):
    // `metadata.rankingScore` AND `finalScore` are BOTH retired keys (#558 A1/A2) and are
    // ABSENT ON EVERY LIVE ROW (measured 4/4). The previous `?? parseFloat(… ?? '0')`
    // turned that absence into a plausible ZERO — the #546 failure — which would have made
    // `adjusted` equal to `totalBonus` for every signal and `rank1Changed` a comparison of
    // pure bonus, i.e. confident-looking output that answers nothing. ABSENT NOW STAYS ABSENT.
    // ⚠️ The correct live rank key is NOT substituted here on purpose: the live picker ranks on
    // `r_multiple` (a reward:risk ratio) while these bonuses are [0,1] score-space, so adding
    // them is dimensionally incoherent. Naming the real destination is #593 rev 2's decision,
    // not this fix's — see RUNNING_ISSUES #595/#593.
    const _liveScoreRaw = s.metadata?.rankingScore as number | undefined;
    const liveScore = typeof _liveScoreRaw === 'number' && Number.isFinite(_liveScoreRaw)
      ? _liveScoreRaw
      : null;
    if (liveScore === null) {
      rank1BasisMissing++;
    } else {
      const adjusted = liveScore + totalBonus;
      if (adjusted > bestAdjusted) {
        bestAdjusted = adjusted;
        bestAdjustedSymbol = s.symbol;
      }
    }

    // #221 saturation: from the expected net edge when the record carries it.
    // ★ #595: was `metadata.expectedEdge` — a retired key, absent 4/4 on live rows. The live
    // equivalent is `netExpectedEdge` (present 4/4; real reader at `ready_to_buy_service.ts:763`).
    // Units verified rather than assumed: `cost-model.ts:281` `netExpectedEdge = grossPnlPct −
    // totalCost`, a RETURN-SPACE FRACTION, which is the same space as `NET_RETURN_CEILING` (0.05).
    const edge = (s.metadata?.netExpectedEdge as number | undefined);
    if (typeof edge === 'number' && Number.isFinite(edge)) {
      saturationKnown++;
      if (edge >= NET_RETURN_CEILING) saturated++;
    }
  }

  return {
    computedAt: now,
    signalCount: signals.length,
    classVoteRegime: classIdle ? null : (mi.marketRegime as string),
    classVoteStatus: classIdle ? 'IDLE_OR_WARMING' : 'LIVE',
    confirmationState,
    perSignal,
    // ★ #595: null when NOTHING carried a live rank basis — the comparison did not run.
    // Reporting `false` there would claim "the bonus would change nothing", which is a
    // finding we did not make.
    rank1Changed: bestAdjustedSymbol === null
      ? null
      : (liveRank1Symbol !== null && bestAdjustedSymbol !== liveRank1Symbol),
    rank1BasisMissing,
    ceilingSaturationRate: saturationKnown > 0 ? saturated / saturationKnown : null,
  };
}
