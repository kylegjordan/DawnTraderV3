/**
 * Ranking Weights — Phase 14.5 (Batch 19)
 *
 * Signal-family-specific weights for the rankingScore formula.
 * rankingScore is used ONLY for RTB queue ordering — it never influences
 * whether a signal passes SQE quality checks (that's FinalScore's job).
 *
 * Formula (#558 A3):
 *   rankingScore = netReturn * returnWeight
 *                - frictionPenalty * frictionWeight
 *   (the retired `FinalScore * qualityWeight` term and the never-wired `contextBonus` term are
 *    removed; per-family return+friction weights renormalized to sum 1.0 — see RANKING_WEIGHTS.)
 *
 * Design decisions (three-way discussion, 2026-03-17; amended #558 A3):
 * - rankingScore = cross-family desirability (RTB ordering) on return net of friction
 * - Three weight profiles for QUANT / PATTERN / HYBRID
 * - A validated live quality signal may return later (study-gated #588), not the retired finalScore
 */

export interface RankingWeightProfile {
  returnWeight: number;     // Weight for normalized net return
  frictionWeight: number;   // Weight for friction penalty (deducted)
}

// --- Weight Profiles by Signal Family ---
// #558 A3: `qualityWeight` (the retired finalScore term, r=−0.140) and `contextBonusMax`
// (declared-never-wired, #217) are REMOVED per §15 — not left as stubs. The remaining
// return + friction weights are RENORMALIZED per family to sum to 1.0: each family's old
// (return+friction) summed to exactly 0.45, so ×(1/0.45) preserves the return:friction RATIO
// while restoring the full [0,1] range (the score was previously compressed by the dropped
// 0.55 quality+context share). A validated live QUALITY signal may be re-introduced later —
// STUDY-GATED #588, deliberately NOT grafted here (grafting an unvalidated signal would repeat
// the finalScore anti-predictive mistake).
export const RANKING_WEIGHTS: Record<string, RankingWeightProfile> = {
  QUANT:   { returnWeight: 0.78, frictionWeight: 0.22 },  // was quality 0.45 / return 0.35 / friction 0.10 / context 0.10
  PATTERN: { returnWeight: 0.56, frictionWeight: 0.44 },  // was quality 0.30 / return 0.25 / friction 0.20 / context 0.25
  HYBRID:  { returnWeight: 0.67, frictionWeight: 0.33 },  // was quality 0.35 / return 0.30 / friction 0.15 / context 0.20
};

// --- Net Return Normalization ---
// 5% net return = 1.0 ceiling. Below 1% net = floor at 0.2.
export const NET_RETURN_CEILING = 0.05;   // 5% net = normalized 1.0
export const NET_RETURN_FLOOR = 0.002;    // 0.2% net = normalized floor

// --- Context Bonus Rules ---
// Bonus applied when pair regime + global regime agree
// Penalty applied when they disagree
// BTC regime confirmation adds additional small bonus

export const CONTEXT_BONUS = {
  PAIR_GLOBAL_AGREE: 0.06,      // Pair and global regime agree
  PAIR_GLOBAL_DISAGREE: -0.04,  // Pair and global regime disagree
  BTC_CONFIRMS_GLOBAL: 0.03,    // BTC regime confirms global regime
  BTC_DISAGREES_GLOBAL: -0.02,  // BTC regime disagrees with global regime
};

// --- FinalScore Gap Safety Rule ---
// When FinalScore gap > this threshold, FinalScore always wins
// Prevents mediocre signals from beating high-quality signals on return size alone
export const FINAL_SCORE_GAP_OVERRIDE = 0.10;

/**
 * Compute rankingScore for a signal.
 *
 * @param finalScore - Signal quality (0-1, from SQE)
 * @param normalizedNetReturn - Net return after costs, normalized 0-1
 * @param frictionPenalty - Round-trip cost as fraction (0-1)
 * @param contextBonus - Regime agreement bonus (can be negative)
 * @param signalType - 'QUANT' | 'PATTERN' | 'HYBRID'
 */
export function computeRankingScore(
  normalizedNetReturn: number,
  frictionPenalty: number,
  signalType: string
): number {
  const weights = RANKING_WEIGHTS[signalType] || RANKING_WEIGHTS.QUANT;

  // #558 A3: the quality term (retired finalScore, r=−0.140) and the contextBonus term
  // (declared-never-wired #217) are REMOVED. Score is now return − friction on the renormalized
  // per-family weights (which sum to 1.0), so the range is [0,1] uncompressed.
  const score =
    normalizedNetReturn * weights.returnWeight -
    frictionPenalty * weights.frictionWeight;

  // Clamp to 0-1 range
  return Math.max(0, Math.min(1, score));
}

/**
 * Normalize net return to 0-1 scale.
 * 5% net = 1.0 ceiling. Below 0.2% = floor.
 */
export function normalizeNetReturn(netReturn: number): number {
  if (netReturn <= 0) return 0;
  if (netReturn <= NET_RETURN_FLOOR) return 0.1; // minimal credit
  return Math.min(1.0, netReturn / NET_RETURN_CEILING);
}
