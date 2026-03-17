/**
 * Ranking Weights — Phase 14.5 (Batch 19)
 *
 * Signal-family-specific weights for the rankingScore formula.
 * rankingScore is used ONLY for RTB queue ordering — it never influences
 * whether a signal passes SQE quality checks (that's FinalScore's job).
 *
 * Formula:
 *   rankingScore = FinalScore * qualityWeight
 *                + netReturn * returnWeight
 *                - frictionPenalty * frictionWeight
 *                + contextBonus
 *
 * Design decisions (three-way discussion, 2026-03-17):
 * - FinalScore = signal quality (SQE gate authority, unchanged)
 * - rankingScore = cross-family desirability (RTB ordering)
 * - Three weight profiles for QUANT / PATTERN / HYBRID
 * - Simpler than 6-component model — same discriminating power, fewer moving parts
 */

export interface RankingWeightProfile {
  qualityWeight: number;    // Weight for FinalScore (signal quality)
  returnWeight: number;     // Weight for normalized net return
  frictionWeight: number;   // Weight for friction penalty (deducted)
  contextBonusMax: number;  // Maximum context bonus (regime agreement)
}

// --- Weight Profiles by Signal Family ---

export const RANKING_WEIGHTS: Record<string, RankingWeightProfile> = {
  QUANT: {
    qualityWeight: 0.45,     // Quant: heavier on quality + return
    returnWeight: 0.35,
    frictionWeight: 0.10,
    contextBonusMax: 0.10,
  },
  PATTERN: {
    qualityWeight: 0.30,     // Pattern: heavier on regime fit + friction conditions
    returnWeight: 0.25,
    frictionWeight: 0.20,    // Friction matters more for pattern-pool pairs (lower liquidity)
    contextBonusMax: 0.25,   // Context agreement bonus larger (regime fit critical for patterns)
  },
  HYBRID: {
    qualityWeight: 0.35,     // Hybrid: balanced across all components
    returnWeight: 0.30,
    frictionWeight: 0.15,
    contextBonusMax: 0.20,
  },
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
  finalScore: number,
  normalizedNetReturn: number,
  frictionPenalty: number,
  contextBonus: number,
  signalType: string
): number {
  const weights = RANKING_WEIGHTS[signalType] || RANKING_WEIGHTS.QUANT;

  const score =
    finalScore * weights.qualityWeight +
    normalizedNetReturn * weights.returnWeight -
    frictionPenalty * weights.frictionWeight +
    Math.max(-weights.contextBonusMax, Math.min(weights.contextBonusMax, contextBonus));

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
