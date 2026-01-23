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
 * Schema Version: regime-mapping/v1.4b
 * Last Updated: 2026-02-02
 * 
 * Changes in v1.4b:
 *   - SMA Trend Ride realigned from BULL_STABLE → HIGH_VOL_IMPULSE
 *   - Range Trade confirmed in LOW_VOL_CHOP with updated metrics
 *   - DriftScore integration enabled
 * 
 * DO NOT MODIFY without architectural review and full system audit.
 * ══════════════════════════════════════════════════════════════════════════════
 */

export const CANONICAL_SCHEMA_VERSION = 'regime-mapping/v1.4b';
export const CANONICAL_SCHEMA_METADATA = {
  updatedAt: '2026-02-02T00:00:00Z',
  source: 'VTS',
  canonical: true,
  includesDriftScore: true
};

export type CanonicalRegimeType = 
  | 'BULL_STABLE'
  | 'BEAR_VOLATILE'
  | 'LOW_VOL_CHOP'
  | 'HIGH_VOL_IMPULSE'
  | 'TRANSITION';

export type CanonicalSignalType = 'QUANT' | 'PATTERN' | 'HYBRID';

export type CanonicalPatternType = 
  | 'PINBAR'
  | 'ENGULFING'
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
  'BULL_STABLE',
  'BEAR_VOLATILE',
  'LOW_VOL_CHOP',
  'HIGH_VOL_IMPULSE',
  'TRANSITION'
] as const;

export const CANONICAL_SIGNAL_TYPES: readonly CanonicalSignalType[] = [
  'QUANT',
  'PATTERN',
  'HYBRID'
] as const;

export const CANONICAL_PATTERN_TYPES: readonly CanonicalPatternType[] = [
  'PINBAR',
  'ENGULFING',
  'MORNING_STAR',
  'ABCD',
  'TRI_STAR',
  null
] as const;

export const REGIME_METRICS: Record<CanonicalRegimeType, RegimeMetrics> = {
  BULL_STABLE: {
    momentum: '>0.005',
    adx: '>25',
    volatility: '<0.025',
    description: 'Sustained uptrend with confirmed directional trend and stable volatility'
  },
  BEAR_VOLATILE: {
    momentum: '<-0.005',
    adx: '>25',
    volatility: '>0.03',
    description: 'Downward impulse with strong bearish trend and high turbulence'
  },
  LOW_VOL_CHOP: {
    momentum: 'abs<0.002',
    adx: '<20',
    volatility: '<0.015',
    description: 'Flat market with no directionality and narrow range'
  },
  HIGH_VOL_IMPULSE: {
    momentum: '>0.010',
    adx: '>30',
    volatility: '>0.03',
    description: 'Strong breakout with trend acceleration and violent expansion'
  },
  TRANSITION: {
    momentum: '±0.004',
    adx: '20-25',
    volatility: '0.015-0.03',
    description: 'Reversal zone with weakening trend and volatility uplift'
  }
};

export const CANONICAL_REGIME_STRATEGY_MAP: Record<CanonicalRegimeType, RegimeStrategyMapping> = {
  BULL_STABLE: {
    metrics: REGIME_METRICS.BULL_STABLE,
    strategies: [
      { 
        strategy: 'VWAP Pullback', 
        strategyKey: 'vwap_pullback',
        signalType: 'QUANT', 
        patternType: null,
        secondaryMetrics: 'VWAP deviation < −1σ • Momentum > 0'
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
        secondaryMetrics: 'RSI 45–55 • ADX slope > 0.5'
      }
    ],
    riskMultiplier: 1.2,
    minConfidence: 0.65
  },
  BEAR_VOLATILE: {
    metrics: REGIME_METRICS.BEAR_VOLATILE,
    strategies: [
      { 
        strategy: 'Mean Reversion', 
        strategyKey: 'mean_reversion',
        signalType: 'QUANT', 
        patternType: null,
        secondaryMetrics: 'RSI < 30 or > 70 • Price deviation > 1σ'
      },
      { 
        strategy: 'Reverse Impulse', 
        strategyKey: 'reverse_impulse',
        signalType: 'HYBRID', 
        patternType: 'PINBAR',
        secondaryMetrics: 'Volume > 1.5× avg • Momentum spike < −0.5%'
      },
      { 
        strategy: 'Defensive Hedge', 
        strategyKey: 'defensive_hedge',
        signalType: 'HYBRID', 
        patternType: 'ENGULFING',
        secondaryMetrics: 'BTC Corr < 0.3 • Vol Offset > 1σ'
      },
      { 
        strategy: 'Inside Bar Reversal', 
        strategyKey: 'inside_bar_reversal',
        signalType: 'PATTERN', 
        patternType: 'ENGULFING',
        secondaryMetrics: 'Parent > Child × 1.3 • Breakout Volume > 1.5× avg'
      }
    ],
    riskMultiplier: 0.7,
    minConfidence: 0.75
  },
  LOW_VOL_CHOP: {
    metrics: REGIME_METRICS.LOW_VOL_CHOP,
    strategies: [
      { 
        strategy: 'Range Trading', 
        strategyKey: 'range_trade',
        signalType: 'QUANT', 
        patternType: null,
        secondaryMetrics: 'Bollinger Bandwidth < 0.14 • RSI 45–55 • ADX < 20'
      },
      { 
        strategy: 'Support Bounce', 
        strategyKey: 'support_bounce',
        signalType: 'PATTERN', 
        patternType: 'PINBAR',
        secondaryMetrics: 'Price ≈ Local Min ± 1σ • Volume > 1.2× avg'
      },
      { 
        strategy: 'ABCD Long', 
        strategyKey: 'abcd_long',
        signalType: 'QUANT', 
        patternType: null,
        secondaryMetrics: 'AB:CD ≈ 1.0 • Volume > 1.2× avg'
      },
      { 
        strategy: 'Adaptive Flow', 
        strategyKey: 'adaptive_flow',
        signalType: 'HYBRID', 
        patternType: 'TRI_STAR',
        secondaryMetrics: 'Momentum inversion ≥ 3 • Volatility percentile > 70%'
      }
    ],
    riskMultiplier: 0.9,
    minConfidence: 0.60
  },
  HIGH_VOL_IMPULSE: {
    metrics: REGIME_METRICS.HIGH_VOL_IMPULSE,
    strategies: [
      { 
        strategy: 'SMA Trend Ride', 
        strategyKey: 'sma_trend_ride',
        signalType: 'QUANT', 
        patternType: null,
        secondaryMetrics: 'SMA(50) > SMA(100) • ADX > 25 • RSI 55–70'
      },
      { 
        strategy: 'Breakout', 
        strategyKey: 'breakout',
        signalType: 'QUANT', 
        patternType: null,
        secondaryMetrics: 'Momentum > +0.7% • Volume > 2× avg'
      },
      { 
        strategy: 'VWAP Bounce', 
        strategyKey: 'vwap_bounce',
        signalType: 'QUANT', 
        patternType: null,
        secondaryMetrics: 'VWAP deviation > +1σ • Momentum −0.3–−0.6%'
      },
      { 
        strategy: 'Volatility Edge', 
        strategyKey: 'volatility_edge',
        signalType: 'HYBRID', 
        patternType: 'ABCD',
        secondaryMetrics: 'Volatility Percentile > 80 • Regime mismatch = True'
      },
      { 
        strategy: 'DHMA', 
        strategyKey: 'dhma',
        signalType: 'QUANT', 
        patternType: null,
        secondaryMetrics: 'HMA(9) cross HMA(21) • ADX flat'
      }
    ],
    riskMultiplier: 0.8,
    minConfidence: 0.70
  },
  TRANSITION: {
    metrics: REGIME_METRICS.TRANSITION,
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
        secondaryMetrics: 'RSI 45–55 • ADX slope > 0.5'
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
  BULL_STABLE: 'BULL_STABLE' as const,
  BEAR_VOLATILE: 'BEAR_VOLATILE' as const,
  LOW_VOL_CHOP: 'LOW_VOL_CHOP' as const,
  HIGH_VOL_IMPULSE: 'HIGH_VOL_IMPULSE' as const,
  TRANSITION: 'TRANSITION' as const
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
  liquidity_trap: 'Liquidity Trap'
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

export const GHOST_REGIME_NORMALIZATION: Record<string, CanonicalRegimeType> = {
  BULL_VOLATILE: 'HIGH_VOL_IMPULSE',
  BEAR_STABLE: 'BEAR_VOLATILE',
  EXTREME_NOISE: 'LOW_VOL_CHOP',
  HIGH_VOL_CHOP: 'HIGH_VOL_IMPULSE',
  MIXED_TRANSITION: 'TRANSITION'
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
  return GHOST_REGIME_NORMALIZATION[regime] ?? 'TRANSITION';
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
    console.warn(`[11.4F.1][Canonical] Unknown strategy fallback: ${strategy} → HYBRID`);
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
  'INSIDE_BAR': 'ENGULFING',     // Compression → Engulfing-like breakout
  'THREE_SOLDIERS': 'MORNING_STAR', // Bullish continuation → Morning Star family
  'EVENING_STAR': 'MORNING_STAR',   // Same pattern family
  'DOJI': 'TRI_STAR',              // Indecision → TriStar family
  'HAMMER': 'PINBAR',              // Wick-based reversal → Pinbar family
  'SHOOTING_STAR': 'PINBAR',       // Wick-based reversal → Pinbar family
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

export const CANONICAL_VERSION = '11.4F.1';
export const CANONICAL_SCHEMA_DATE = '2026-01-12';
