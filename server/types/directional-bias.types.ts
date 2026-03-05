/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Phase 14 — Directional Bias Type Definitions
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Directional Bias quantifies price trajectory and strength, independent of
 * structural regime (volatility/stability/noise).
 *
 * Regime answers: "How is the market behaving mechanically?"
 * Directional Bias answers: "Is price going up or down, and how strongly?"
 *
 * 7 categories, symmetric thresholds, extensible and tunable.
 *
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

/**
 * 7 directional bias categories — symmetric around NEUTRAL.
 */
export type DirectionalBiasCategory =
  | 'UP_STRONG'
  | 'UP_MODERATE'
  | 'UP_WEAK'
  | 'NEUTRAL'
  | 'DOWN_WEAK'
  | 'DOWN_MODERATE'
  | 'DOWN_STRONG';

/**
 * All directional bias categories as an ordered array (strongest up to strongest down).
 */
export const DIRECTIONAL_BIAS_CATEGORIES: readonly DirectionalBiasCategory[] = [
  'UP_STRONG',
  'UP_MODERATE',
  'UP_WEAK',
  'NEUTRAL',
  'DOWN_WEAK',
  'DOWN_MODERATE',
  'DOWN_STRONG'
] as const;

/**
 * DBS score-to-category thresholds.
 * Symmetric, interpretable, tunable via config.
 */
export interface DBSThresholds {
  upStrong: number;     // >= this => UP_STRONG (default: 0.60)
  upModerate: number;   // >= this => UP_MODERATE (default: 0.30)
  upWeak: number;       // >= this => UP_WEAK (default: 0.10)
  downWeak: number;     // <= this => DOWN_WEAK (default: -0.10)
  downModerate: number; // <= this => DOWN_MODERATE (default: -0.30)
  downStrong: number;   // <= this => DOWN_STRONG (default: -0.60)
}

export const DEFAULT_DBS_THRESHOLDS: DBSThresholds = {
  upStrong: 0.60,
  upModerate: 0.30,
  upWeak: 0.10,
  downWeak: -0.10,
  downModerate: -0.30,
  downStrong: -0.60
};

/**
 * DBS formula weights. Tunable — must sum to 1.0.
 */
export interface DBSWeights {
  slopeWeight: number;    // w1: log-price slope (default: 0.40)
  returnWeight: number;   // w2: normalized return (default: 0.35)
  emaWeight: number;      // w3: EMA trend alignment (default: 0.25)
}

export const DEFAULT_DBS_WEIGHTS: DBSWeights = {
  slopeWeight: 0.40,
  returnWeight: 0.35,
  emaWeight: 0.25
};

/**
 * DBS configuration.
 */
export interface DBSConfig {
  weights: DBSWeights;
  thresholds: DBSThresholds;
  lookbackPeriod: number;  // Rolling window in candles (default: 48)
  emaPeriods: {
    fast: number;   // EMA fast period (default: 12)
    slow: number;   // EMA slow period (default: 26)
  };
}

export const DEFAULT_DBS_CONFIG: DBSConfig = {
  weights: DEFAULT_DBS_WEIGHTS,
  thresholds: DEFAULT_DBS_THRESHOLDS,
  lookbackPeriod: 48,
  emaPeriods: {
    fast: 12,
    slow: 26
  }
};

/**
 * Pair-level directional bias result.
 */
export interface DirectionalBiasResult {
  score: number;                     // -1.0 to +1.0
  category: DirectionalBiasCategory; // Classified category
  components: {
    slopeComponent: number;          // Weighted log-price slope
    returnComponent: number;         // Weighted normalized return
    emaComponent: number;            // Weighted EMA alignment
  };
}

/**
 * Global directional bias result (aggregated across FX5 universe).
 */
export interface GlobalDirectionalBias {
  score: number;                     // -1.0 to +1.0 (weighted median)
  category: DirectionalBiasCategory;
  pairCount: number;                 // Number of pairs in calculation
  distribution: Record<DirectionalBiasCategory, number>; // Count per category
}

/**
 * Confidence modifier ranges for directional bias integration.
 * Applied as multiplier to strategy confidence.
 */
export interface BiasConfidenceModifier {
  opposing: { min: number; max: number };  // When bias opposes strategy (default: 0.70-0.85)
  neutral: number;                          // When bias is NEUTRAL (default: 1.0)
  aligning: { min: number; max: number };  // When bias aligns with strategy (default: 1.05-1.15)
}

export const DEFAULT_BIAS_CONFIDENCE_MODIFIER: BiasConfidenceModifier = {
  opposing: { min: 0.70, max: 0.85 },
  neutral: 1.0,
  aligning: { min: 1.05, max: 1.15 }
};

/**
 * Display names for directional bias categories (for UI).
 */
export const DIRECTIONAL_BIAS_DISPLAY: Record<DirectionalBiasCategory, { label: string; color: string }> = {
  UP_STRONG: { label: 'Strong Upward', color: 'green' },
  UP_MODERATE: { label: 'Moderate Upward', color: 'green' },
  UP_WEAK: { label: 'Weak Upward', color: 'yellow' },
  NEUTRAL: { label: 'Neutral', color: 'yellow' },
  DOWN_WEAK: { label: 'Weak Downward', color: 'yellow' },
  DOWN_MODERATE: { label: 'Moderate Downward', color: 'orange' },
  DOWN_STRONG: { label: 'Strong Downward', color: 'red' }
};
