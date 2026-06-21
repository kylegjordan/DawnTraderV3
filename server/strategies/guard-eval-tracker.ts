/**
 * reorg-B2.1 OBJ-4 — Guard-eval suppression tracker (instrumentation PRECURSOR for #372 + #371).
 *
 * In-memory PER-STRATEGY counters for every `applyGlobalGuards` evaluation — pass AND fail — so we can
 * measure (a) how much each strategy is suppressed by the per-class `minRR` (#372, the calibration
 * precursor — "at 2.5 we discard X% of what strong_bull_trend generates") and (b) the reachability
 * ATR-source divergence rate (#371). COUNTERS, NOT per-eval log lines: emitting a log on every guard
 * call would flood the hot path (Langston Step-4 note) — instrumentation must not cost Net Expectancy.
 * Both pass and fail are counted so the suppression/divergence rates have an intact denominator.
 *
 * SERIALIZATION: safe because the active + VTS evaluation pipelines are strictly serial (like
 * `null-reason-tracker.ts`). If guard evaluation ever becomes concurrent, make this eval-local.
 */

import type { GuardDropReason } from './strategy-helpers.js'; // the guard owns the reason taxonomy (type-only, no runtime coupling)

export interface GuardEvalRecord {
  evals: number;        // total guard evaluations (the denominator for rrSuppressionRate)
  passes: number;
  atrDrops: number;     // dropped by invalid ATR (effectiveATR null) — short-circuits BEFORE the RR check
  stopDrops: number;    // dropped by stop-distance — short-circuits BEFORE the RR check
  rrDrops: number;      // dropped by RR < per-class minRR  (the #372 suppression signal)
  reachDrops: number;   // dropped by reachability > per-class reachAtrMax (reached the RR check first)
  rrEvals: number;      // evals that REACHED the RR check (pass + rr_below_min + unreachable) — meanRR denominator
  rrSum: number;        // Σ rr over rrEvals → mean RR (excludes atr/stop short-circuits so it isn't skewed)
  rrMin: number;
  rrMax: number;
}

const _stats = new Map<string, GuardEvalRecord>();

function _blank(): GuardEvalRecord {
  return { evals: 0, passes: 0, atrDrops: 0, stopDrops: 0, rrDrops: 0, reachDrops: 0, rrEvals: 0, rrSum: 0, rrMin: Infinity, rrMax: -Infinity };
}

/** Record one guard evaluation for a strategy. `rr` is the computed reward-to-risk (for the suppression
 *  distribution); `pass` + `dropReason` capture the verdict. Cheap O(1), no I/O. */
export function recordGuardEval(strategy: string, rr: number, pass: boolean, dropReason: GuardDropReason): void {
  let r = _stats.get(strategy);
  if (!r) { r = _blank(); _stats.set(strategy, r); }
  r.evals++;
  // RR distribution is meaningful ONLY for evals that REACHED the RR check — the atr-null + stop-distance
  // guards short-circuit BEFORE it (their `rr` never gates anything), so including their rr would skew
  // meanRR up/down (Langston Step-4 #3). pass / rr_below_min / unreachable all computed-and-used the rr.
  const reachedRR = pass || dropReason === 'rr_below_min' || dropReason === 'unreachable';
  if (reachedRR && Number.isFinite(rr)) {
    r.rrEvals++;
    r.rrSum += rr;
    if (rr < r.rrMin) r.rrMin = rr;
    if (rr > r.rrMax) r.rrMax = rr;
  }
  if (pass) { r.passes++; return; }
  if (dropReason === 'invalid_atr') r.atrDrops++;
  else if (dropReason === 'stop_distance') r.stopDrops++;
  else if (dropReason === 'rr_below_min') r.rrDrops++;
  else if (dropReason === 'unreachable') r.reachDrops++;
}

/** Snapshot the per-strategy stats (for the diagnostics surface that feeds the #372 calibration). */
export function getGuardEvalStats(): Record<string, GuardEvalRecord & { meanRR: number; rrSuppressionRate: number }> {
  const out: Record<string, GuardEvalRecord & { meanRR: number; rrSuppressionRate: number }> = {};
  for (const [k, r] of _stats.entries()) {
    // meanRR over rrEvals (RR-reached only — unskewed); rrSuppressionRate over TOTAL evals (Langston: the
    // right framing for "how much does minRR suppress total output", denominator = all generated signals).
    out[k] = { ...r, meanRR: r.rrEvals > 0 ? r.rrSum / r.rrEvals : 0, rrSuppressionRate: r.evals > 0 ? r.rrDrops / r.evals : 0 };
  }
  return out;
}

export function resetGuardEvalStats(): void { _stats.clear(); }
