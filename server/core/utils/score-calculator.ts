/**
 * Directive 11.0E — Score Calculator Utilities
 * Directive 11.7C — PredictiveConfidence Integration
 * 
 * Centralized FinalScore and RegimeWeight calculation functions.
 * Used by SQE backfill for dynamic recalculation when values are missing.
 * 
 * FinalScore and RegimeWeight are the sole determinants for signal quality.
 * 
 * DIRECTIVE 11.7C: Adds PredictiveConfidence derived from VTS telemetry
 * to drive dynamic ROI thresholding across VTS, SQE, DSS, and RTB.
 */

import { SCORE_WEIGHTS } from '../../config/score-weights.config.js';
import { getRegimePerformance, getVTSTelemetry } from '../logging/vts-telemetry.js';
// B79.0n.SCORING (2026-05-26): AssetClass required for predictive-confidence
// cache-key extension (F-2 per pre-audit §2.5 — was scope-derived empirical
// finding, not D-disposition territory per Langston ACK clarification 4).
import type { AssetClass } from '../../../shared/asset-classes.js';

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

const predictiveConfidenceCache = new Map<string, { value: number; timestamp: number }>();
const CACHE_TTL_MS = 60000;

export interface SignalMetrics {
  hybridScore?: number;
  confidence?: number;
  regimeWeight?: number;
  decayPenalty?: number;
  volatility?: number;
  volume24h?: number;
  trendStrength?: number;
}

/**
 * Calculate FinalScore using centralized SCORE_WEIGHTS
 * Formula: hybridScore × 0.4 + confidence × 0.3 + regimeWeight × 0.2 - decayPenalty × 0.1
 * 
 * DIRECTIVE 11.0E: No NGC fallback - uses confidence directly
 */
export function calculateFinalScore(metrics: SignalMetrics): number {
  const W = SCORE_WEIGHTS.FINAL_SCORE;
  
  const hybridScore = metrics.hybridScore ?? metrics.confidence ?? 0.5;
  const confidence = metrics.confidence ?? 0.5;
  const regimeWeight = metrics.regimeWeight ?? 0.5;
  const decayPenalty = metrics.decayPenalty ?? 0;
  
  const finalScore = 
    hybridScore * W.HYBRID +
    confidence * W.CONFIDENCE +
    regimeWeight * W.REGIME -
    decayPenalty * W.DECAY;
  
  // Directive 11.0E: Post-SQE Safety Hook - ensure numeric integrity
  if (isNaN(finalScore) || finalScore < 0) {
    console.error('[11.0E] Invalid FinalScore computation detected', { hybridScore, confidence, regimeWeight, decayPenalty, finalScore });
    throw new Error('[11.0E] Invalid FinalScore computation');
  }
  
  return Math.max(0, Math.min(1, finalScore));
}

/**
 * Calculate RegimeWeight from signal metrics
 * Based on trend strength and volatility indicators
 */
/*
 * ⚠️ THERE IS DELIBERATELY NO NUMERIC "UNAVAILABLE" SENTINEL HERE — see #546.
 *
 * The first cut of this guard returned `REGIME_WEIGHT_UNAVAILABLE = 0` on a missing input,
 * reasoning that 0 sits below every gate floor and would therefore reject. That was WRONG,
 * and it reproduced the exact class of defect this batch exists to remove:
 *
 *   • `0` is ALREADY the signature of "never written" in this system (#546) — the formula
 *     cannot otherwise return 0, because it clamps at 0.1. So a stored 0 would have been
 *     ambiguous between "never computed" and "computed, but the MCE was missing" — two very
 *     different facts collapsed into one indistinguishable number.
 *   • More fundamentally: it makes ABSENCE REPRESENTABLE AS A VALID-LOOKING SCORE. A reader
 *     (or a downstream average, or a UI cell) treats 0 as an answer, not as an alarm.
 *     Nobody double-checks a zero.
 *
 * ⇒ The return type carries the absence instead: `number | null`. `null` cannot be averaged,
 * cannot be rendered as a confident figure, and cannot be silently compared against a floor —
 * every consumer is forced by the type system to decide what to do about it.
 */

/**
 * Calculate RegimeWeight from signal metrics.
 *
 * ═══ WHY THE `?? 0.5` DEFAULTS ARE GONE (B-REGIME-INPUTS-LIVE, Langston ruling 2026-07-20) ═══
 * This function previously read `metrics.trendStrength ?? 0.5` and `metrics.volatility ?? 0.5`.
 * Combined with hardcoded caller-side defaults, its output was PINNED at 0.6455 against a
 * 0.30 floor — so the RegimeWeight admission gate, one of only two gates that can reject a
 * signal on the active path, had NO REACHABLE REJECT PATH and never rejected anything (#543).
 *
 * ★ A defensive default INSIDE the function whose constant output IS the defect is not a
 * safety net — it is the defect's last line of retreat. With every caller fixed but these
 * defaults left in place, any input arriving `undefined` would be SILENTLY re-substituted and
 * the gate would return to 0.6455 with nothing logged, having passed review. That is the exact
 * NO-PATCHES failure (CLAUDE.md §5 #15), so removing them is not scope widening — it is what
 * OBJ-0 always required.
 *
 * ★ BLAST RADIUS IS ZERO OUTSIDE THE ACTIVE PATH, verified at code (and independently re-read
 * by Langston at `origin/migration/aws-supabase`): this function has exactly THREE non-test
 * callers — `signal_quality_evaluator.ts:531`, `quality_index.ts:299`, `ready_to_buy_service.ts:884`
 * — all active-path. **VTS never calls it.** `vts-runner.ts` imports exactly one symbol from
 * this module (`getPredictiveConfidence`, :43); VTS derives its own regime weight from
 * `calculateRegimeScore(regime,{adx,volatility})/100` (`vts-runner.ts:1659`). Beware: a THIRD,
 * unrelated `calculateRegimeWeight(candles: Candle[])` exists at `multi-timeframe-scanner.ts:172`
 * — same name, different body. Do not conflate them.
 *
 * ⚠️ Do NOT re-add a default here. Callers must supply live MCE-derived values
 * (see `server/core/metrics/regime-inputs.ts`) or reject the signal.
 */
/**
 * Result carrier for RegimeWeight. **Deliberately an OBJECT, never `number | null`.**
 *
 * ═══ WHY NOT `number | null` — this shape was tried and DEFEATED (#546) ═══
 * The first rework returned `number | null`, on the theory that a nullable type forces the
 * caller to handle absence. It does not, because of one language rule:
 *
 *     null      ?? 0.5   →   0.5
 *     undefined ?? 0.5   →   0.5
 *
 * `??` collapses null and undefined identically — it was DESIGNED to — so any `?? 0.5`
 * anywhere downstream silently converts absence into a manufactured score, with no type
 * error and no diagnostic. Measured at the time: **14 live `??` sites on regimeWeight,
 * SEVEN of which coalesce to `0`** — the exact never-written signature #546 forbids — and
 * two of those seven are aggregation paths, where the coerced zeros get AVERAGED into
 * summary statistics. That is the precise mechanism that produced a ~600×-wrong figure in
 * this batch's own investigation: zeros counted as real values.
 *
 * ⇒ A nullable type RECORDS absence. This object ENFORCES handling it: `result ?? x` is a
 * no-op because the object is never nullish, so there is no syntax a future author can
 * write that silently turns absence into a number. They must read `ok`, or the compiler
 * stops them. The escape hatch does not typecheck.
 */
export type RegimeWeightResult =
  | { ok: true; value: number }
  | { ok: false; reason: 'missing_inputs' };

export function calculateRegimeWeight(metrics: SignalMetrics): RegimeWeightResult {
  const { trendStrength, volatility } = metrics;

  // LOUD GUARD, not a substitution. Absence is returned AS absence (#546) — never as a
  // number a downstream reader, average, or UI cell could mistake for a score.
  if (!Number.isFinite(trendStrength) || !Number.isFinite(volatility)) {
    console.error(
      '[B-REGIME-INPUTS-LIVE] calculateRegimeWeight called WITHOUT live inputs — refusing to pin. ' +
        `trendStrength=${String(trendStrength)} volatility=${String(volatility)}. ` +
        'Returning {ok:false} so the caller MUST reject the signal; it is not scored on a ' +
        'constant. This is a caller bug: supply MCE-derived inputs via readRegimeInputs().',
    );
    return { ok: false, reason: 'missing_inputs' };
  }

  const normalizedVolatility = Math.min(1, volatility as number);
  const trendScore = Math.min(1, trendStrength as number);

  const regimeWeight = (trendScore * 0.7) + ((1 - normalizedVolatility) * 0.3);

  return { ok: true, value: Math.max(0.1, Math.min(1, regimeWeight)) };
}

/**
 * Directive 11.7C Task 4: PredictiveConfidence Source
 *
 * Derives PredictiveConfidence from VTS telemetry winRate for a given
 * regime × strategy combination. Uses sigmoid transformation to convert
 * winRate to confidence score, with neutral fallback (0.5) when no data.
 *
 * Formula: confidence = sigmoid((winRate - 0.5) × 6)
 *
 * B79.0n.SCORING (2026-05-26): cache key extended from `${regime}:${strategy}`
 * to `${assetClass}:${regime}:${strategy}` to prevent cross-class telemetry
 * contamination. xstock BULL_STABLE/momentum_breakout winRate is structurally
 * distinct from crypto BULL_STABLE/momentum_breakout winRate — collapsing
 * them onto the same cache slot would silently bias one class with the
 * other's data. F-2 fix per pre-audit §2.5 empirical finding.
 *
 * @param assetClass - Asset class of the symbol (REQUIRED, drives cache isolation)
 * @param symbol - Trading pair symbol (for future per-symbol tracking)
 * @param regime - Market regime (e.g., BULL_STABLE)
 * @param strategy - Strategy name (e.g., momentum_breakout)
 * @returns PredictiveConfidence bounded [0.0, 1.0]
 */
export function getPredictiveConfidence(
  assetClass: AssetClass,
  symbol: string,
  regime: string,
  strategy: string,
): number {
  const cacheKey = `${assetClass}:${regime}:${strategy}`;
  const now = Date.now();

  const cached = predictiveConfidenceCache.get(cacheKey);
  if (cached && (now - cached.timestamp) < CACHE_TTL_MS) {
    return cached.value;
  }

  const perf = getRegimePerformance(regime, strategy);
  if (!perf || perf.winRate == null) {
    return 0.5;
  }

  const confidence = sigmoid((perf.winRate - 0.5) * 6);
  const boundedConfidence = Math.min(Math.max(confidence, 0.0), 1.0);

  predictiveConfidenceCache.set(cacheKey, { value: boundedConfidence, timestamp: now });

  const telemetry = getVTSTelemetry();
  if (telemetry.regimePerformance[regime]?.[strategy]) {
    (telemetry.regimePerformance[regime][strategy] as unknown as { predictiveConfidence: number }).predictiveConfidence = boundedConfidence;
  }

  return boundedConfidence;
}

/**
 * Clear predictive confidence cache (for testing/telemetry refresh)
 */
export function clearPredictiveConfidenceCache(): void {
  predictiveConfidenceCache.clear();
  console.log('[11.7C][Cache] PredictiveConfidence cache cleared');
}
