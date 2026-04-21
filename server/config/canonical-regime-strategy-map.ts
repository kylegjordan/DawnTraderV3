/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.7F — Canonical Regime & Strategy Lock-In
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * This file is the SINGLE SOURCE OF TRUTH for all regime, strategy, signal type,
 * and pattern mappings across the entire DawnTrader system.
 *
 * ALL subsystems (VTS, Signal Orchestrator, Telemetry, DSE, RTB, Bridge) MUST
 * import from this file. Local inference or mapping logic is PROHIBITED.
 *
 * Schema Version: regime-mapping/v2.0.0
 * Last Updated: 2026-03-05
 *
 * Changes in v2.0.0 (Phase 14 — Batch 15):
 *   - Regime rename: removed directional language from 5 canonical regime names
 *     BULL_STABLE -> TREND_FRIENDLY_STABLE
 *     BEAR_VOLATILE -> HIGH_VOLATILITY_UNSTABLE
 *     LOW_VOL_CHOP -> RANGE_BOUND_STABLE
 *     HIGH_VOL_IMPULSE -> IMPULSE_EXPANSION
 *     TRANSITION -> STRUCTURAL_TRANSITION
 *   - GHOST_REGIME_NORMALIZATION expanded: old canonical names mapped to new
 *   - Regime descriptions updated to remove directional language
 *   - All strategy mappings preserved (strategies unchanged)
 *
 * Changes in v1.4c (Directive 11.7F-B):
 *   - volZ/trendZ Z-score persistence in telemetry
 *   - Per-regime-strategy DriftScore computation
 *   - Rolling 50-sample Z-score history buffer
 *   - Enhanced API with driftScores payload
 *
 * DO NOT MODIFY without architectural review and full system audit.
 * ══════════════════════════════════════════════════════════════════════════════
 */

export const CANONICAL_SCHEMA_VERSION = 'regime-mapping/v2.0.0';
export const CANONICAL_SCHEMA_METADATA = {
  updatedAt: '2026-04-12T00:00:00Z',  // B59: Updated from 2026-03-05. Sync script now uses fresh timestamps.
  source: 'VTS',
  canonical: true,
  includesDriftScore: true,
  _fields: ['driftScores', 'volZ', 'trendZ']
};

export type CanonicalRegimeType =
  | 'TREND_FRIENDLY_STABLE'
  | 'HIGH_VOLATILITY_UNSTABLE'
  | 'RANGE_BOUND_STABLE'
  | 'IMPULSE_EXPANSION'
  | 'STRUCTURAL_TRANSITION';

export type CanonicalSignalType = 'QUANT' | 'PATTERN' | 'HYBRID';

export type CanonicalPatternType =
  | 'PINBAR'
  | 'ENGULFING'
  | 'INSIDE_BAR'    // Batch 19F: Promoted to canonical (was mapped to ENGULFING)
  | 'MORNING_STAR'
  | 'ABCD'
  | 'TRI_STAR'
  | null;

export interface RegimeMetrics {
  momentum: string;
  adx: string;
  volatility: string;
  description: string;
}

export interface StrategyDefinition {
  strategy: string;
  strategyKey: string;
  signalType: CanonicalSignalType;
  patternType: CanonicalPatternType;
  secondaryMetrics: string;
}

export interface RegimeStrategyMapping {
  metrics: RegimeMetrics;
  strategies: StrategyDefinition[];
  riskMultiplier: number;
  minConfidence: number;
}

export const CANONICAL_REGIMES: readonly CanonicalRegimeType[] = [
  'TREND_FRIENDLY_STABLE',
  'HIGH_VOLATILITY_UNSTABLE',
  'RANGE_BOUND_STABLE',
  'IMPULSE_EXPANSION',
  'STRUCTURAL_TRANSITION'
] as const;

export const CANONICAL_SIGNAL_TYPES: readonly CanonicalSignalType[] = [
  'QUANT',
  'PATTERN',
  'HYBRID'
] as const;

export const CANONICAL_PATTERN_TYPES: readonly CanonicalPatternType[] = [
  'PINBAR',
  'ENGULFING',
  'INSIDE_BAR',    // Batch 19F: Promoted to canonical
  'MORNING_STAR',
  'ABCD',
  'TRI_STAR',
  null
] as const;

export const REGIME_METRICS: Record<CanonicalRegimeType, RegimeMetrics> = {
  TREND_FRIENDLY_STABLE: {
    momentum: '>0.005',
    adx: '>25',
    volatility: '<0.025',
    description: 'Low noise, low volatility, orderly price action with confirmed directional trend'
  },
  HIGH_VOLATILITY_UNSTABLE: {
    momentum: '<-0.005',
    adx: '>25',
    volatility: '>0.03',
    description: 'High volatility, high noise, wide dispersion with strong trend confirmation'
  },
  RANGE_BOUND_STABLE: {
    momentum: 'abs<0.002',
    adx: '<20',
    volatility: '<0.015',
    description: 'Flat market with no directionality and narrow range'
  },
  IMPULSE_EXPANSION: {
    momentum: '>0.010',
    adx: '>30',
    volatility: '>0.03',
    description: 'Sharp moves with trend acceleration and violent expansion'
  },
  STRUCTURAL_TRANSITION: {
    momentum: '\u00b10.004',
    adx: '20-25',
    volatility: '0.015-0.03',
    description: 'Boundary state between regimes with weakening trend and volatility uplift'
  }
};

export const CANONICAL_REGIME_STRATEGY_MAP: Record<CanonicalRegimeType, RegimeStrategyMapping> = {
  TREND_FRIENDLY_STABLE: {
    metrics: REGIME_METRICS.TREND_FRIENDLY_STABLE,
    strategies: [
      {
        strategy: 'VWAP Pullback',
        strategyKey: 'vwap_pullback',
        signalType: 'QUANT',
        patternType: null,
        secondaryMetrics: 'VWAP deviation < \u22121\u03c3 \u2022 Momentum > 0'
      },
      {
        strategy: 'Morning Star / Evening Star',
        strategyKey: 'morning_star',
        signalType: 'PATTERN',
        patternType: 'MORNING_STAR',
        secondaryMetrics: '3-bar sequence; momentum flip > 0.3%'
      },
      {
        strategy: 'Pivot Shift',
        strategyKey: 'pivot_shift',
        signalType: 'HYBRID',
        patternType: 'MORNING_STAR',
        secondaryMetrics: 'RSI 45\u201355 \u2022 ADX slope > 0.5'
      },
      {
        // B63 — Strong Bull Trend (Path D). LONG-only. Evaluates ONLY for pairs in
        // quant-strong-trend sourcePool (strong_trend family) via vts-runner family gate.
        strategy: 'Strong Bull Trend',
        strategyKey: 'strong_bull_trend',
        signalType: 'QUANT',
        patternType: null,
        secondaryMetrics: 'DBS \u2265 0.35 \u2022 N6 Donchian breakout + 0.15\u00d7ATR \u2022 body \u2264 1.5\u00d7ATR (B63.1: slope gate dropped, N 12\u21926)'
      }
    ],
    riskMultiplier: 1.2,
    minConfidence: 0.65
  },
  HIGH_VOLATILITY_UNSTABLE: {
    metrics: REGIME_METRICS.HIGH_VOLATILITY_UNSTABLE,
    strategies: [
      {
        strategy: 'Mean Reversion',
        strategyKey: 'mean_reversion',
        signalType: 'QUANT',
        patternType: null,
        secondaryMetrics: 'RSI < 30 or > 70 \u2022 Price deviation > 1\u03c3'
      },
      {
        strategy: 'Reverse Impulse',
        strategyKey: 'reverse_impulse',
        signalType: 'HYBRID',
        patternType: 'PINBAR',
        secondaryMetrics: 'Volume > 1.5\u00d7 avg \u2022 Momentum spike < \u22120.5%'
      },
      {
        strategy: 'Defensive Hedge',
        strategyKey: 'defensive_hedge',
        signalType: 'HYBRID',
        patternType: 'ENGULFING',
        secondaryMetrics: 'BTC Corr < 0.3 \u2022 Vol Offset > 1\u03c3'
      },
      {
        strategy: 'Inside Bar Reversal',
        strategyKey: 'inside_bar_reversal',
        signalType: 'PATTERN',
        patternType: 'INSIDE_BAR',  // Batch 19F: Corrected from ENGULFING
        secondaryMetrics: 'Parent > Child \u00d7 1.3 \u2022 Breakout Volume > 1.5\u00d7 avg'
      }
    ],
    riskMultiplier: 0.7,
    minConfidence: 0.75
  },
  RANGE_BOUND_STABLE: {
    metrics: REGIME_METRICS.RANGE_BOUND_STABLE,
    strategies: [
      {
        strategy: 'Range Trading',
        strategyKey: 'range_trade',
        signalType: 'QUANT',
        patternType: null,
        secondaryMetrics: 'Bollinger Bandwidth < 0.14 \u2022 RSI 45\u201355 \u2022 ADX < 20'
      },
      {
        strategy: 'Support Bounce',
        strategyKey: 'support_bounce',
        signalType: 'PATTERN',
        patternType: 'PINBAR',
        secondaryMetrics: 'Price \u2248 Local Min \u00b1 1\u03c3 \u2022 Volume > 1.2\u00d7 avg'
      },
      {
        strategy: 'ABCD Long',
        strategyKey: 'abcd_long',
        signalType: 'QUANT',
        patternType: null,
        secondaryMetrics: 'AB:CD \u2248 1.0 \u2022 Volume > 1.2\u00d7 avg'
      },
      {
        strategy: 'Adaptive Flow',
        strategyKey: 'adaptive_flow',
        signalType: 'HYBRID',
        patternType: 'TRI_STAR',
        secondaryMetrics: 'Momentum inversion \u2265 3 \u2022 Volatility percentile > 70%'
      }
    ],
    riskMultiplier: 0.9,
    minConfidence: 0.60
  },
  IMPULSE_EXPANSION: {
    metrics: REGIME_METRICS.IMPULSE_EXPANSION,
    strategies: [
      {
        strategy: 'SMA Trend Ride',
        strategyKey: 'sma_trend_ride',
        signalType: 'QUANT',
        patternType: null,
        secondaryMetrics: 'SMA(50) > SMA(100) \u2022 ADX > 25 \u2022 RSI 55\u201370'
      },
      {
        strategy: 'Breakout',
        strategyKey: 'breakout',
        signalType: 'QUANT',
        patternType: null,
        secondaryMetrics: 'Momentum > +0.7% \u2022 Volume > 2\u00d7 avg'
      },
      {
        strategy: 'VWAP Bounce',
        strategyKey: 'vwap_bounce',
        signalType: 'QUANT',
        patternType: null,
        secondaryMetrics: 'VWAP deviation > +1\u03c3 \u2022 Momentum \u22120.3\u2013\u22120.6%'
      },
      {
        strategy: 'Volatility Edge',
        strategyKey: 'volatility_edge',
        signalType: 'HYBRID',
        patternType: 'ABCD',
        secondaryMetrics: 'Volatility Percentile > 80 \u2022 Regime mismatch = True'
      },
      {
        strategy: 'DHMA',
        strategyKey: 'dhma',
        signalType: 'QUANT',
        patternType: null,
        secondaryMetrics: 'HMA(9) cross HMA(21) \u2022 ADX flat'
      },
      {
        // B63 — Strong Bull Trend (Path D). Registered in IE because B62 classifier routes
        // |DBS|>=0.50 pairs to IE. Family gate (strong_trend) still enforces exclusivity —
        // strategy only evaluates on quant-strong-trend sourcePool pairs.
        strategy: 'Strong Bull Trend',
        strategyKey: 'strong_bull_trend',
        signalType: 'QUANT',
        patternType: null,
        secondaryMetrics: 'DBS \u2265 0.35 \u2022 N6 Donchian breakout + 0.15\u00d7ATR \u2022 body \u2264 1.5\u00d7ATR (B63.1: slope gate dropped, N 12\u21926)'
      }
    ],
    riskMultiplier: 0.8,
    minConfidence: 0.70
  },
  STRUCTURAL_TRANSITION: {
    metrics: REGIME_METRICS.STRUCTURAL_TRANSITION,
    strategies: [
      {
        strategy: 'Liquidity Trap',
        strategyKey: 'liquidity_trap',
        signalType: 'QUANT',
        patternType: null,
        secondaryMetrics: 'Wick/Body > 2 or Depth Imbalance > 1.4'
      },
      {
        strategy: 'Pivot Shift',
        strategyKey: 'pivot_shift',
        signalType: 'HYBRID',
        patternType: 'MORNING_STAR',
        secondaryMetrics: 'RSI 45\u201355 \u2022 ADX slope > 0.5'
      },
      {
        strategy: 'Morning Star / Evening Star',
        strategyKey: 'morning_star',
        signalType: 'PATTERN',
        patternType: 'MORNING_STAR',
        secondaryMetrics: '3-bar sequence; momentum flip > 0.3%'
      }
    ],
    riskMultiplier: 0.85,
    minConfidence: 0.55
  }
};

export const REGIMES = {
  TREND_FRIENDLY_STABLE: 'TREND_FRIENDLY_STABLE' as const,
  HIGH_VOLATILITY_UNSTABLE: 'HIGH_VOLATILITY_UNSTABLE' as const,
  RANGE_BOUND_STABLE: 'RANGE_BOUND_STABLE' as const,
  IMPULSE_EXPANSION: 'IMPULSE_EXPANSION' as const,
  STRUCTURAL_TRANSITION: 'STRUCTURAL_TRANSITION' as const
} as const;

export const STRATEGIES = {
  SMA_TREND_RIDE: 'sma_trend_ride' as const,
  VWAP_PULLBACK: 'vwap_pullback' as const,
  MORNING_STAR: 'morning_star' as const,
  PIVOT_SHIFT: 'pivot_shift' as const,
  MEAN_REVERSION: 'mean_reversion' as const,
  REVERSE_IMPULSE: 'reverse_impulse' as const,
  DEFENSIVE_HEDGE: 'defensive_hedge' as const,
  INSIDE_BAR_REVERSAL: 'inside_bar_reversal' as const,
  RANGE_TRADE: 'range_trade' as const,
  SUPPORT_BOUNCE: 'support_bounce' as const,
  ABCD_LONG: 'abcd_long' as const,
  ADAPTIVE_FLOW: 'adaptive_flow' as const,
  BREAKOUT: 'breakout' as const,
  VWAP_BOUNCE: 'vwap_bounce' as const,
  VOLATILITY_EDGE: 'volatility_edge' as const,
  DHMA: 'dhma' as const,
  LIQUIDITY_TRAP: 'liquidity_trap' as const
} as const;

export const STRATEGY_DISPLAY_NAMES: Record<string, string> = {
  sma_trend_ride: 'SMA Trend Ride',
  vwap_pullback: 'VWAP Pullback',
  morning_star: 'Morning Star / Evening Star',
  pivot_shift: 'Pivot Shift',
  mean_reversion: 'Mean Reversion',
  reverse_impulse: 'Reverse Impulse',
  defensive_hedge: 'Defensive Hedge',
  inside_bar_reversal: 'Inside Bar Reversal',
  range_trade: 'Range Trading',
  support_bounce: 'Support Bounce',
  abcd_long: 'ABCD Long',
  adaptive_flow: 'Adaptive Flow',
  breakout: 'Breakout',
  vwap_bounce: 'VWAP Bounce',
  volatility_edge: 'Volatility Edge',
  dhma: 'DHMA',
  liquidity_trap: 'Liquidity Trap',
  // B63: Strong Bull Trend (Path D) — QUANT, LONG-only Donchian breakout
  strong_bull_trend: 'Strong Bull Trend'
};

/**
 * Phase 14: Regime display names for UI rendering.
 * Used by analytics page, market-indicators, and any UI component showing regime labels.
 */
export const REGIME_DISPLAY_NAMES: Record<CanonicalRegimeType, string> = {
  TREND_FRIENDLY_STABLE: 'Trend-Friendly Stable',
  HIGH_VOLATILITY_UNSTABLE: 'High-Volatility Unstable',
  RANGE_BOUND_STABLE: 'Range-Bound Stable',
  IMPULSE_EXPANSION: 'Impulse Expansion',
  STRUCTURAL_TRANSITION: 'Structural Transition'
};

/**
 * Phase 14: Regime narrative descriptions for UI display.
 * Replaces hardcoded regimeNarratives in market-indicators.ts.
 */
export const REGIME_NARRATIVES: Record<CanonicalRegimeType, { title: string; description: string }> = {
  TREND_FRIENDLY_STABLE: {
    title: 'Trend-Friendly Stable',
    description: 'The market is in a steady structural trend with controlled volatility. Price action is orderly and pullbacks are shallow. Momentum-based or trend-following signals are more likely to succeed here because the market structure supports continuation. You can expect trades to stay open longer, aiming for larger gains.'
  },
  HIGH_VOLATILITY_UNSTABLE: {
    title: 'High-Volatility Unstable',
    description: 'The market has high volatility with wide dispersion and noisy price action. Sharp moves and reversals are common. Defensive strategies that favor quick exits or reversal signals may perform better. Position sizes are reduced and stops tighter to account for the wider swings.'
  },
  RANGE_BOUND_STABLE: {
    title: 'Range-Bound Stable',
    description: 'The market is moving sideways with little clear direction and small price changes. Trends do not hold well, so breakout attempts usually fail or reverse quickly. Range-based or counter-trend signals tend to work best because prices often bounce between support and resistance levels. Trades will usually be smaller and shorter, focusing on quick gains.'
  },
  IMPULSE_EXPANSION: {
    title: 'Impulse Expansion',
    description: 'The market is experiencing sharp, impulsive moves with high momentum bursts. Breakouts are more likely to follow through, and trend-following strategies can capture large moves. However, volatility is elevated so position sizing accounts for wider swings. Expect faster trade cycles with active trailing stop adjustments.'
  },
  STRUCTURAL_TRANSITION: {
    title: 'Structural Transition',
    description: 'The market is shifting from one structural regime to another. Conditions are unclear \u2014 volatility changes, trend indicators disagree, and signals can conflict. This is when the system becomes more selective and cautious, often reducing position sizes until a new regime stabilizes.'
  }
};

export const LEGACY_TO_CANONICAL: Record<string, string> = {
  MomentumPulse: 'vwap_pullback',
  TrendFlow: 'sma_trend_ride',
  BreakoutConfirm: 'breakout',
  H2_Slingshot: 'vwap_bounce',
  ImpulseChaser: 'liquidity_trap',
  TriangleBreakout: 'abcd_long',
  VolatilityEdge: 'volatility_edge',
  ReverseImpulse: 'reverse_impulse',
  DefensiveHedge: 'defensive_hedge',
  MeanReversion: 'mean_reversion',
  PivotShift: 'pivot_shift',
  AdaptiveFlow: 'adaptive_flow',
  RangeTrade: 'range_trade',
  SupportBounce: 'support_bounce',
  InsideBarReversal: 'inside_bar_reversal',
  MorningStar: 'morning_star',
  DHMA: 'dhma'
};

/**
 * Phase 14: Ghost Regime Normalization
 * Maps legacy/old regime names to current canonical names.
 * Includes both pre-Phase-14 ghost regimes AND the old Phase-13 canonical names.
 */
export const GHOST_REGIME_NORMALIZATION: Record<string, CanonicalRegimeType> = {
  // Legacy ghost regimes (pre-Phase-14)
  BULL_VOLATILE: 'IMPULSE_EXPANSION',
  BEAR_STABLE: 'HIGH_VOLATILITY_UNSTABLE',
  EXTREME_NOISE: 'RANGE_BOUND_STABLE',
  HIGH_VOL_CHOP: 'IMPULSE_EXPANSION',
  MIXED_TRANSITION: 'STRUCTURAL_TRANSITION',
  // Old canonical names (Phase 13 era -> Phase 14 renamed)
  BULL_STABLE: 'TREND_FRIENDLY_STABLE',
  BEAR_VOLATILE: 'HIGH_VOLATILITY_UNSTABLE',
  LOW_VOL_CHOP: 'RANGE_BOUND_STABLE',
  HIGH_VOL_IMPULSE: 'IMPULSE_EXPANSION',
  TRANSITION: 'STRUCTURAL_TRANSITION',
};

let strategyToSignalTypeCache: Map<string, CanonicalSignalType> | null = null;
let strategyToPatternTypeCache: Map<string, CanonicalPatternType> | null = null;

function buildStrategyCache(): void {
  if (strategyToSignalTypeCache && strategyToPatternTypeCache) return;

  strategyToSignalTypeCache = new Map();
  strategyToPatternTypeCache = new Map();

  for (const mapping of Object.values(CANONICAL_REGIME_STRATEGY_MAP)) {
    for (const stratDef of mapping.strategies) {
      strategyToSignalTypeCache.set(stratDef.strategyKey, stratDef.signalType);
      strategyToPatternTypeCache.set(stratDef.strategyKey, stratDef.patternType);
    }
  }
}

export function normalizeRegime(regime: string): CanonicalRegimeType {
  if (CANONICAL_REGIMES.includes(regime as CanonicalRegimeType)) {
    return regime as CanonicalRegimeType;
  }
  return GHOST_REGIME_NORMALIZATION[regime] ?? 'STRUCTURAL_TRANSITION';
}

export function normalizeStrategy(strategy: string): string {
  if (LEGACY_TO_CANONICAL[strategy]) {
    return LEGACY_TO_CANONICAL[strategy];
  }
  const lowerKey = strategy.toLowerCase().replace(/[\s\/]/g, '_').replace(/-/g, '_');
  if (Object.keys(STRATEGY_DISPLAY_NAMES).includes(lowerKey)) {
    return lowerKey;
  }
  return strategy;
}

export function getTypeForStrategy(strategy: string, throwOnUnknown: boolean = false): CanonicalSignalType {
  buildStrategyCache();
  const normalized = normalizeStrategy(strategy);
  const signalType = strategyToSignalTypeCache!.get(normalized);
  if (!signalType) {
    if (throwOnUnknown) {
      throw new Error(`[11.4F.1] Unknown strategy: ${strategy} (normalized: ${normalized}). Non-canonical strategies are prohibited.`);
    }
    console.warn(`[11.4F.1][Canonical] Unknown strategy fallback: ${strategy} \u2192 HYBRID`);
    return 'HYBRID';
  }
  return signalType;
}

export function getPatternForStrategy(strategy: string): CanonicalPatternType {
  buildStrategyCache();
  const normalized = normalizeStrategy(strategy);
  return strategyToPatternTypeCache!.get(normalized) ?? null;
}

export function getStrategiesForRegime(regime: CanonicalRegimeType): StrategyDefinition[] {
  return CANONICAL_REGIME_STRATEGY_MAP[regime]?.strategies ?? [];
}

export function selectRandomStrategy(regime: CanonicalRegimeType): {
  signalType: CanonicalSignalType;
  strategy: string;
  patternType: CanonicalPatternType;
} {
  const mapping = CANONICAL_REGIME_STRATEGY_MAP[regime];
  if (!mapping || mapping.strategies.length === 0) {
    return { signalType: 'HYBRID', strategy: 'adaptive_flow', patternType: null };
  }

  const stratDef = mapping.strategies[Math.floor(Math.random() * mapping.strategies.length)];
  return {
    signalType: stratDef.signalType,
    strategy: stratDef.strategyKey,
    patternType: stratDef.patternType
  };
}

/**
 * Directive 11.4F.1A: Deterministic strategy selection
 * Returns the primary (first) strategy for a regime - stable across calls
 */
export function selectPrimaryStrategy(regime: CanonicalRegimeType): {
  signalType: CanonicalSignalType;
  strategy: string;
  patternType: CanonicalPatternType;
} {
  const mapping = CANONICAL_REGIME_STRATEGY_MAP[regime];
  if (!mapping || mapping.strategies.length === 0) {
    return { signalType: 'HYBRID', strategy: 'adaptive_flow', patternType: null };
  }

  const stratDef = mapping.strategies[0]; // Always return first/primary strategy
  return {
    signalType: stratDef.signalType,
    strategy: stratDef.strategyKey,
    patternType: stratDef.patternType
  };
}

export function getRegimeRiskMultiplier(regime: CanonicalRegimeType): number {
  return CANONICAL_REGIME_STRATEGY_MAP[regime]?.riskMultiplier ?? 1.0;
}

/**
 * Directive 11.4G: Pattern-to-Canonical Mapping
 * Maps pattern recognizer outputs to canonical pattern types.
 * Non-canonical patterns are mapped to their closest canonical equivalents.
 */
const PATTERN_TO_CANONICAL: Record<string, CanonicalPatternType> = {
  'PINBAR': 'PINBAR',
  'ENGULFING': 'ENGULFING',
  'MORNING_STAR': 'MORNING_STAR',
  'ABCD': 'ABCD',
  'TRI_STAR': 'TRI_STAR',
  'INSIDE_BAR': 'INSIDE_BAR',    // Batch 19F: Now canonical (was mapped to ENGULFING)
  'THREE_SOLDIERS': 'MORNING_STAR', // Bullish continuation -> Morning Star family
  'EVENING_STAR': 'MORNING_STAR',   // Same pattern family
  'DOJI': 'TRI_STAR',              // Indecision -> TriStar family
  'HAMMER': 'PINBAR',              // Wick-based reversal -> Pinbar family
  'SHOOTING_STAR': 'PINBAR',       // Wick-based reversal -> Pinbar family
};

/**
 * Normalize detected pattern to canonical type.
 * Returns null for unrecognized patterns.
 */
export function normalizePatternToCanonical(pattern: string | null): CanonicalPatternType {
  if (!pattern) return null;
  const normalized = pattern.toUpperCase().replace(/[\s-]/g, '_');
  return PATTERN_TO_CANONICAL[normalized] ?? null;
}

/**
 * Directive 11.4G: Context-aware strategy selection
 * Considers detected patterns when selecting strategy from regime mapping.
 * If a pattern is detected and matches a HYBRID/PATTERN strategy, prefer that strategy.
 * This ensures HYBRID/PATTERN signals appear when pattern recognition detects matches.
 *
 * @param regime - Current market regime
 * @param detectedPattern - Pattern detected by pattern recognizer (null if none)
 * @param symbolHash - Optional hash for deterministic diversity (0-99)
 * @returns Strategy definition matching the context, plus trace info
 */
export function selectContextAwareStrategy(
  regime: CanonicalRegimeType,
  detectedPattern: string | null,
  symbolHash?: number
): {
  signalType: CanonicalSignalType;
  strategy: string;
  patternType: CanonicalPatternType;
  selectionReason: 'exact_match' | 'hybrid_fallback' | 'pattern_fallback' | 'diversity' | 'primary';
} {
  const mapping = CANONICAL_REGIME_STRATEGY_MAP[regime];
  if (!mapping || mapping.strategies.length === 0) {
    return { signalType: 'HYBRID', strategy: 'adaptive_flow', patternType: null, selectionReason: 'primary' };
  }

  // Normalize detected pattern to canonical type
  const canonicalPattern = normalizePatternToCanonical(detectedPattern);

  // If pattern detected and maps to canonical, find a matching HYBRID/PATTERN strategy
  if (canonicalPattern) {
    // First try: Find exact pattern match in HYBRID/PATTERN strategies
    const patternMatch = mapping.strategies.find(s =>
      (s.signalType === 'HYBRID' || s.signalType === 'PATTERN') &&
      s.patternType === canonicalPattern
    );

    if (patternMatch) {
      return {
        signalType: patternMatch.signalType,
        strategy: patternMatch.strategyKey,
        patternType: patternMatch.patternType,
        selectionReason: 'exact_match'
      };
    }

    // Second try: Any HYBRID strategy for this regime (pattern provides confluence)
    const hybridFallback = mapping.strategies.find(s => s.signalType === 'HYBRID');
    if (hybridFallback) {
      return {
        signalType: 'HYBRID',
        strategy: hybridFallback.strategyKey,
        patternType: hybridFallback.patternType, // Use strategy's declared pattern, not detected
        selectionReason: 'hybrid_fallback'
      };
    }

    // Third try: Any PATTERN strategy for this regime
    const patternFallback = mapping.strategies.find(s => s.signalType === 'PATTERN');
    if (patternFallback) {
      return {
        signalType: 'PATTERN',
        strategy: patternFallback.strategyKey,
        patternType: patternFallback.patternType, // Use strategy's declared pattern
        selectionReason: 'pattern_fallback'
      };
    }
  }

  // Deterministic diversity: use hash % 100 to select strategy index
  // ~25% of symbols will get non-primary strategy for natural diversity
  if (symbolHash !== undefined && mapping.strategies.length > 1) {
    if (symbolHash % 4 === 0) { // Deterministic 25% selection
      const stratIndex = symbolHash % mapping.strategies.length;
      const stratDef = mapping.strategies[stratIndex];
      return {
        signalType: stratDef.signalType,
        strategy: stratDef.strategyKey,
        patternType: stratDef.patternType,
        selectionReason: 'diversity'
      };
    }
  }

  // Default: primary strategy
  const stratDef = mapping.strategies[0];
  return {
    signalType: stratDef.signalType,
    strategy: stratDef.strategyKey,
    patternType: stratDef.patternType,
    selectionReason: 'primary'
  };
}

/**
 * Compute a simple hash from symbol string for deterministic diversity.
 */
export function symbolToHash(symbol: string): number {
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) {
    hash = ((hash << 5) - hash) + symbol.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash) % 100;
}

export function getRegimeMinConfidence(regime: CanonicalRegimeType): number {
  return CANONICAL_REGIME_STRATEGY_MAP[regime]?.minConfidence ?? 0.55;
}

export function isValidCanonicalCombination(
  regime: string,
  strategy: string,
  signalType: string,
  patternType?: string | null
): { valid: boolean; reason?: string } {
  const normalizedRegime = normalizeRegime(regime);
  const normalizedStrategy = normalizeStrategy(strategy);

  const mapping = CANONICAL_REGIME_STRATEGY_MAP[normalizedRegime];
  if (!mapping) {
    return { valid: false, reason: `Unknown regime: ${regime}` };
  }

  const stratDef = mapping.strategies.find(s => s.strategyKey === normalizedStrategy);
  if (!stratDef) {
    return { valid: false, reason: `Strategy ${strategy} not valid for regime ${regime}` };
  }

  if (stratDef.signalType !== signalType) {
    return { valid: false, reason: `SignalType mismatch: expected ${stratDef.signalType}, got ${signalType}` };
  }

  if (stratDef.signalType !== 'QUANT' && patternType) {
    const expectedPattern = stratDef.patternType;
    if (expectedPattern && patternType !== expectedPattern) {
      return { valid: false, reason: `PatternType mismatch: expected ${expectedPattern}, got ${patternType}` };
    }
  }

  return { valid: true };
}

export function getAllCanonicalStrategies(): string[] {
  const strategies = new Set<string>();
  for (const mapping of Object.values(CANONICAL_REGIME_STRATEGY_MAP)) {
    for (const stratDef of mapping.strategies) {
      strategies.add(stratDef.strategyKey);
    }
  }
  return Array.from(strategies);
}

export function getAllStrategiesForSignalType(signalType: CanonicalSignalType): string[] {
  const strategies: string[] = [];
  for (const mapping of Object.values(CANONICAL_REGIME_STRATEGY_MAP)) {
    for (const stratDef of mapping.strategies) {
      if (stratDef.signalType === signalType && !strategies.includes(stratDef.strategyKey)) {
        strategies.push(stratDef.strategyKey);
      }
    }
  }
  return strategies;
}

export const CANONICAL_VERSION = '14.0.0';
export const CANONICAL_SCHEMA_DATE = '2026-03-05';


// ══════════════════════════════════════════════════════════════════════════════
// Batch 22 — Strategy Family Classification
// ══════════════════════════════════════════════════════════════════════════════
// Maps each strategy to its filter family. This determines which IMF filter
// profile a pair must survive to be eligible for that strategy.
//
// A pair can survive MULTIPLE family paths and be evaluated by multiple
// strategy families. This is a FEATURE, not a bug — versatile pairs get
// more evaluation coverage.
//
// Hybrid strategies inherit from BOTH parent families and are eligible
// when a pair survives EITHER parent family's filter path.
// ══════════════════════════════════════════════════════════════════════════════

// B63: Added 'strong_trend' family for Path D (Strong Bull Trend strategy).
// Strong-trend family is exclusive — pairs with |DBS|>=0.35 (positive, LONG-only) route ONLY to this family.
export type StrategyFamily = 'trend' | 'reversal' | 'breakout' | 'oscillator' | 'pattern' | 'hybrid' | 'strong_trend';

export const STRATEGY_FAMILY_MAP: Record<string, StrategyFamily> = {
  // TREND family — want clean directional movement (high DI, low VN)
  vwap_pullback: 'trend',
  sma_trend_ride: 'trend',
  dhma: 'trend',

  // REVERSAL family — want choppy/ranging conditions (low DI, higher VN tolerated)
  mean_reversion: 'reversal',
  range_trade: 'reversal',
  liquidity_trap: 'reversal',

  // BREAKOUT family — want directional expansion (medium-high DI, moderate VN)
  breakout: 'breakout',
  vwap_bounce: 'breakout',

  // PATTERN family — pattern detection drives strategy, tolerant of noise
  morning_star: 'pattern',
  inside_bar_reversal: 'pattern',
  support_bounce: 'pattern',
  abcd_long: 'pattern',

  // HYBRID family — inherits from component families
  pivot_shift: 'hybrid',
  reverse_impulse: 'hybrid',
  defensive_hedge: 'hybrid',
  adaptive_flow: 'hybrid',
  volatility_edge: 'hybrid',

  // B63 STRONG_TREND family — exclusive lane for |DBS|>=0.35 pairs (LONG-only).
  // DI/VN filters disabled for this path; DBS magnitude is the routing key and gate.
  strong_bull_trend: 'strong_trend',
};

// Canonical list of filter families (excluding pattern and hybrid which have their own paths)
// B63: strong_trend added as a 5th quant-side filter family.
export const FILTER_FAMILIES: readonly StrategyFamily[] = ['trend', 'reversal', 'breakout', 'oscillator', 'strong_trend'] as const;

// Which filter families each hybrid strategy can use (inherits from parents)
export const HYBRID_FAMILY_ELIGIBILITY: Record<string, StrategyFamily[]> = {
  pivot_shift: ['trend', 'pattern'],
  reverse_impulse: ['reversal', 'pattern'],
  defensive_hedge: ['reversal', 'breakout'],
  adaptive_flow: ['trend', 'reversal'],
  volatility_edge: ['breakout', 'reversal'],
};

// B63 Item 11 — Strategies eligible in families beyond their primary STRATEGY_FAMILY_MAP entry.
// Unlike HYBRID_FAMILY_ELIGIBILITY (which replaces the primary family for hybrid strategies),
// this map ADDS additional family eligibility on top of the primary. Consumers OR the primary
// family with the entries here to get the full eligibility set.
//
// vwap_pullback primary = 'trend'; additional = 'strong_trend' (promoted by B63 Item 11 for
// the pullback-resumption archetype on strongly-trending pairs, per BATCH_63_COUNTERFACTUAL_AUDIT).
// When routed via sourcePool='quant-strong_trend', vwap_pullback receives the strong-trend
// geometry override per Item 12 (4×ATR stop, 3R target = Variant E).
export const MULTI_FAMILY_ELIGIBILITY: Record<string, StrategyFamily[]> = {
  vwap_pullback: ['strong_trend'],
};
