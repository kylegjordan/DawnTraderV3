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

// B79.0n.STRATEGY (2026-05-24): bumped v2.0.0 → v3.0.0 with byAssetClass nested
// shape. Schema version matches bridge/canonical/mapping-regime-strategy.json._schema.
export const CANONICAL_SCHEMA_VERSION = 'regime-mapping/v3.0.0';
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

// REGIME_METRICS descriptions updated 2026-04-23 (B64b Obj 1) to reflect post-B62 DBS-integrated
// classifier behavior and B63 strategy-registration updates. Momentum/ADX/volatility thresholds
// are directional heuristics; the live classifier (server/core/metrics/market-regime.ts
// :: calculatePairRegime) ALSO consumes DBS score as of B62 (2026-04-19). Descriptions now
// note the DBS-awareness and any B63 strategy-registration changes where relevant.
export const REGIME_METRICS: Record<CanonicalRegimeType, RegimeMetrics> = {
  TREND_FRIENDLY_STABLE: {
    momentum: '>0.005',
    adx: '>25',
    volatility: '<0.025',
    description: 'Low noise, low volatility, orderly price action with confirmed directional trend. Post-B62: DBS score is a classifier input; TFS typically correlates with moderate-to-strong directional DBS (|DBS| in 0.15-0.50 band). Post-B63: strong_bull_trend is registered here when DBS crosses 0.35 threshold and routes via the quant-strong_trend sourcePool.'
  },
  HIGH_VOLATILITY_UNSTABLE: {
    momentum: '<-0.005',
    adx: '>25',
    volatility: '>0.03',
    description: 'High volatility, high noise, wide dispersion with strong trend confirmation. Post-B62: DBS-aware classification distinguishes HVU from IE based on volatility-first vs momentum-first dominance.'
  },
  RANGE_BOUND_STABLE: {
    momentum: 'abs<0.002',
    adx: '<20',
    volatility: '<0.015',
    description: 'Flat market with no directionality and narrow range. Post-B62: DBS typically near-neutral (|DBS| < 0.15). RBS is where mean-reversion and range-bound strategies (range_trade, support_bounce) have their strongest historical performance. Note: B63 Item 18 audit found current RegimeWeight formula produces low RW values in RBS despite strong strategy performance — recalibration targeted in B66.'
  },
  IMPULSE_EXPANSION: {
    momentum: '>0.010',
    adx: '>30',
    volatility: '>0.03',
    description: 'Sharp directional moves with trend acceleration and violent expansion. Post-B62 (2026-04-19): classification incorporates DBS score alongside momentum/ADX/volatility — pairs entering IE typically show |DBS| >= 0.50 combined with rapid momentum expansion. Post-B63 (2026-04-21): IE-registered strategies are sma_trend_ride, breakout, vwap_bounce, volatility_edge, dhma, and strong_bull_trend (which routes via quant-strong_trend sourcePool when DBS crosses 0.35).'
  },
  STRUCTURAL_TRANSITION: {
    momentum: '\u00b10.004',
    adx: '20-25',
    volatility: '0.015-0.03',
    description: 'Boundary state between regimes with weakening trend and volatility uplift. Post-B62: DBS-aware classification flags pairs mid-transition before full regime commitment. STRUCTURAL_TRANSITION is often a short-lived regime between TFS and HVU/IE as conditions intensify.'
  }
};

/**
 * B-4.7 (#163): the hand-AUTHORED, class-FREE base map — the single authoring
 * point for regime->strategy membership. NOT exported: every runtime consumer
 * reads the per-class materialized tree below (CANONICAL_REGIME_STRATEGY_MAP)
 * or an identity helper. Per-class membership deltas live in
 * ASSET_CLASS_OVERRIDES (moved here from sync-canonical-bridge in B-4.7 —
 * the bridge now READS the materialized trees instead of re-deriving them).
 */
const CANONICAL_REGIME_STRATEGY_MAP_BASE: Record<CanonicalRegimeType, RegimeStrategyMapping> = {
  TREND_FRIENDLY_STABLE: {
    metrics: REGIME_METRICS.TREND_FRIENDLY_STABLE,
    strategies: [
      {
        strategy: 'VWAP Pullback',
        strategyKey: 'vwap_pullback',
        signalType: 'QUANT',
        patternType: null,
        secondaryMetrics: 'VWAP deviation < \u22121\u03c3 \u2022 Momentum > 0 \u2022 Blocked when DBS \u2264 \u22120.35 (counter-trend LONG guard, B63 Item 10) \u2022 Also eligible in strong-trend lane at DBS \u2265 0.35 with Variant E geometry (4\u00d7ATR stop, 3R target, B63 Items 11\u201312)'
      },
      {
        strategy: 'Morning Star / Evening Star',
        strategyKey: 'morning_star',
        signalType: 'PATTERN',
        patternType: 'MORNING_STAR',
        secondaryMetrics: '3-bar sequence; momentum flip > 0.3% \u2022 Blocked when DBS \u2265 0.35 (B63 Item 6, lane routing) or DBS \u2264 \u22120.35 (counter-trend LONG guard, B63 Item 10)'
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
        secondaryMetrics: 'Volume > 1.5\u00d7 avg \u2022 Momentum spike < \u22120.5% \u2022 Blocked when |DBS| \u2265 0.35 (B63 Items 6 + 10 — counter-trend LONG guard + positive-DBS lane routing)'
      },
      {
        strategy: 'Defensive Hedge',
        strategyKey: 'defensive_hedge',
        signalType: 'HYBRID',
        patternType: 'ENGULFING',
        secondaryMetrics: 'BTC Corr < 0.3 \u2022 Vol Offset > 1\u03c3 \u2022 Blocked when |DBS| \u2265 0.35 (B63 Items 6 + 10)'
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
        secondaryMetrics: 'SMA(50) > SMA(100) \u2022 ADX > 25 \u2022 RSI 55\u201370 \u2022 Blocked when DBS \u2264 \u22120.35 (counter-trend LONG guard, B63 Item 10)'
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
      },
      {
        // B79.0d \u2014 Opening Range Breakout (ORB). xstock_spot ONLY.
        // Triple-defense asset-class guard: detect-internal + signal-orchestrator
        // dispatch-guard + SQE whitelist. Crypto signals never reach detect.
        strategy: 'Opening Range Breakout',
        strategyKey: 'orb',
        signalType: 'QUANT',
        patternType: null,
        secondaryMetrics: 'xstock_spot 24/5 only \u2022 14:30\u201315:00 UTC range \u2022 0.15\u00d7ATR breakout buffer \u2022 1.5\u00d7 vol multiple \u2022 R:R 2:1'
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
      },
      {
        // B79.0d — Opening Range Breakout (ORB). xstock_spot ONLY (regime-boundary
        // breakout natural fit). Triple-defense asset-class guard same as IE entry.
        strategy: 'Opening Range Breakout',
        strategyKey: 'orb',
        signalType: 'QUANT',
        patternType: null,
        secondaryMetrics: 'xstock_spot 24/5 only • 14:30–15:00 UTC range • 0.15×ATR breakout buffer • 1.5× vol multiple • R:R 2:1'
      }
    ],
    riskMultiplier: 0.85,
    minConfidence: 0.55
  }
};

// ── B-4.7 (#163): per-asset-class materialization ──────────────────────────
export const ASSET_CLASSES = ['crypto_spot', 'xstock_spot'] as const;
export type AssetClassKey = typeof ASSET_CLASSES[number];

interface PerClassOverride {
  /**
   * CLASS-INELIGIBILITY excludes: the strategy cannot run for this class at
   * all in this regime — removed from the MATERIALIZED tree (eval universe,
   * allowedStrategies, favored lists alike).
   */
  excludeStrategies: Partial<Record<CanonicalRegimeType, string[]>>;
  /**
   * FAVORED-LIST-ONLY excludes (B-4.7 diff-B R1/R2): the strategy IS
   * evaluable for the class in this regime (stays in the materialized tree —
   * VTS eval loop, MCE allowedStrategies, validation) but is omitted from the
   * bridge's favoredStrategies derivation. The one occupant: strong_bull_trend
   * routes via its own quant-strong_trend lane (sourcePool), so it is not a
   * "favored" pick for getClassMap consumers — but the eval loop MUST still
   * iterate it or the lane is functionally disabled (the pre-B-4.7 flat map
   * carried it; Langston caught the silent drop in diff-B review).
   */
  favoredListExcludes: Partial<Record<CanonicalRegimeType, string[]>>;
  addStrategies: Partial<Record<CanonicalRegimeType, string[]>>;
}

// Moved from sync-canonical-bridge.ts (B.1.5 redeploy unblocker, 2026-05-31),
// with the exclude semantics SPLIT in B-4.7 diff-B R1/R2 — the bridge's flat
// excludeStrategies conflated class-ineligibility (orb-for-crypto,
// defensive_hedge-for-xstock) with favored-list curation (strong_bull_trend).
// Addition rationale: orb in xstock_spot TFS = hand-authored extension
// (B79.0n.STRATEGY) — ORB fires on stable-trend breakouts, not just impulse
// regimes, for xStocks.
const ASSET_CLASS_OVERRIDES: Record<AssetClassKey, PerClassOverride> = {
  crypto_spot: {
    excludeStrategies: {
      // orb is xStock-only microstructure (opening-range) — class-ineligible.
      IMPULSE_EXPANSION: ['orb'],
      STRUCTURAL_TRANSITION: ['orb'],
    },
    favoredListExcludes: {
      TREND_FRIENDLY_STABLE: ['strong_bull_trend'],
      IMPULSE_EXPANSION: ['strong_bull_trend'],
    },
    addStrategies: {},
  },
  xstock_spot: {
    excludeStrategies: {
      // defensive_hedge is BTC-decorrelation — meaningless for xStocks.
      HIGH_VOLATILITY_UNSTABLE: ['defensive_hedge'],
      // base ST orb entry documents B79.0d intent only — not live for xStocks
      // in ST either (B79.0n.STRATEGY kept the TFS+IE placement).
      STRUCTURAL_TRANSITION: ['orb'],
    },
    favoredListExcludes: {
      TREND_FRIENDLY_STABLE: ['strong_bull_trend'],
      IMPULSE_EXPANSION: ['strong_bull_trend'],
    },
    addStrategies: {
      TREND_FRIENDLY_STABLE: ['orb'],
    },
  },
};

/**
 * B-4.7 diff-B R1/R2: favored-list-only excludes, resolved per class+regime.
 * The bridge subtracts these when deriving favoredStrategies; the materialized
 * tree (eval/validation surface) does NOT.
 */
export function getFavoredListExcludes(assetClass: AssetClassKey, regime: CanonicalRegimeType): ReadonlySet<string> {
  return new Set(ASSET_CLASS_OVERRIDES[assetClass].favoredListExcludes[regime] ?? []);
}

/** Find a strategy's full definition anywhere in the base (for adds). */
function findStrategyDefinition(strategyKey: string): StrategyDefinition {
  for (const mapping of Object.values(CANONICAL_REGIME_STRATEGY_MAP_BASE)) {
    const def = mapping.strategies.find(s => s.strategyKey === strategyKey);
    if (def) return def;
  }
  throw new Error(`[B-4.7 #163] ASSET_CLASS_OVERRIDES adds unknown strategyKey '${strategyKey}' — not present anywhere in the base map.`);
}

/**
 * Materialize one class's tree: base order minus excludes, adds appended
 * (order preserved EXACTLY as the bridge's pre-B-4.7 derivation produced —
 * the sync-canonical-bridge byte-identical contract depends on it).
 */
function materializeClassMap(assetClass: AssetClassKey): Record<CanonicalRegimeType, RegimeStrategyMapping> {
  const overrides = ASSET_CLASS_OVERRIDES[assetClass];
  const out = {} as Record<CanonicalRegimeType, RegimeStrategyMapping>;
  for (const [regime, mapping] of Object.entries(CANONICAL_REGIME_STRATEGY_MAP_BASE)) {
    const regimeKey = regime as CanonicalRegimeType;
    const excludes = new Set(overrides.excludeStrategies[regimeKey] ?? []);
    const adds = overrides.addStrategies[regimeKey] ?? [];
    const kept = mapping.strategies.filter(s => !excludes.has(s.strategyKey));
    const keptKeys = new Set(kept.map(s => s.strategyKey));
    const added = adds.filter(k => !keptKeys.has(k)).map(findStrategyDefinition);
    out[regimeKey] = { ...mapping, strategies: [...kept, ...added] };
  }
  return out;
}

/**
 * B-4.7 (#163): THE canonical map — byAssetClass-nested, matching the runtime
 * JSON shape it generates (the dual-shape ambiguity from B79.0n.STRATEGY /
 * BUG-2026-05-31-A is gone). Same export name as the old flat const so every
 * un-migrated flat reader is a COMPILE ERROR, not a silent misread.
 */
export const CANONICAL_REGIME_STRATEGY_MAP: Record<AssetClassKey, Record<CanonicalRegimeType, RegimeStrategyMapping>> = {
  crypto_spot: materializeClassMap('crypto_spot'),
  xstock_spot: materializeClassMap('xstock_spot'),
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
  LIQUIDITY_TRAP: 'liquidity_trap' as const,
  // B79.0n.STRATEGY (2026-05-24): STRATEGIES const completion — was 17, now 19.
  // STRATEGY_DISPLAY_NAMES (lines 402-405) already had these two; this enum
  // catches up. RISK-014 closure per SYSTEM_MANUAL §1878.
  STRONG_BULL_TREND: 'strong_bull_trend' as const,  // B63
  ORB: 'orb' as const,                              // B79.0d
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
  strong_bull_trend: 'Strong Bull Trend',
  // B79.0d: Opening Range Breakout — xstock_spot QUANT, calendar-fixed 14:30-15:00 UTC range
  orb: 'Opening Range Breakout'
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
    description: 'The market is in a steady structural trend with controlled volatility. Price action is orderly and pullbacks are shallow. Momentum-based or trend-following signals are more likely to succeed here because the market structure supports continuation. You can expect trades to stay open longer, aiming for larger gains. Pairs with strong directional bias (|DBS| \u2265 0.35) are routed exclusively to the dedicated strong-trend lane (strong_bull_trend + promoted vwap_pullback), which uses native trend-rider geometry and bypasses mode-overlay stop/target multipliers to preserve the designed reward-to-risk ratio (B63 Items 4, 11, 14).'
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
    description: 'The market is experiencing sharp, impulsive moves with high momentum bursts. Breakouts are more likely to follow through, and trend-following strategies can capture large moves. However, volatility is elevated so position sizing accounts for wider swings. Expect faster trade cycles with active trailing stop adjustments. B62 post-audit redefined the IE admission criteria: a pair qualifies as IE when |DBS| \u2265 0.50 AND volatility > 0.015; these thresholds emerged from the B62 72h verification and the post-B62 counterfactual audit. Strongly-directional IE pairs (|DBS| \u2265 0.35 positive) are additionally routed to the strong-trend lane alongside TFS (B63 Item 4).'
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
  DHMA: 'dhma',
  // reorg-B2.3: snake_case StrategyType drift — the orchestrator/paper-position-sizing `StrategyType`
  // union emits `range_trading`, but the canonical key is `range_trade`. Cure it HERE at the SSOT
  // (benefits every `normalizeStrategy` caller, not just the per-class minRR gate). Checked before the
  // lowercase pass, so the exact `range_trading` token maps deterministically.
  range_trading: 'range_trade',
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

  // B-4.7: identity lookup — iterates the class-free BASE (strategy identity
  // is not class-scoped; membership is, and lives in the per-class tree).
  for (const mapping of Object.values(CANONICAL_REGIME_STRATEGY_MAP_BASE)) {
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

/**
 * reorg-B2.3: fail-CLOSED canonical resolver for the per-class minRR gate.
 *
 * `normalizeStrategy` IDENTITY-RETURNS on an unknown token (its contract — `getTypeForStrategy`
 * and others depend on that fall-through). That is exactly why it can't be called bare in a
 * fail-closed gate: an unknown/drifted string would pass through as if canonical and silently
 * resolve to the permissive `*` default. This wrapper adds null-on-miss semantics WITHOUT
 * touching the existing contract: it normalizes (so aliases + the `range_trading` drift are cured)
 * then confirms membership in the `STRATEGY_DISPLAY_NAMES` SSOT. Returns the canonical name, or
 * `null` if the token is not a known canonical strategy (→ the gate logs loud + fails closed).
 */
export function resolveCanonicalStrategy(strategy: string): string | null {
  const normalized = normalizeStrategy(strategy);
  return Object.prototype.hasOwnProperty.call(STRATEGY_DISPLAY_NAMES, normalized) ? normalized : null;
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

// B-4.7 (#163): strategy MEMBERSHIP is class-scoped — REQUIRED assetClass.
export function getStrategiesForRegime(assetClass: AssetClassKey, regime: CanonicalRegimeType): StrategyDefinition[] {
  return CANONICAL_REGIME_STRATEGY_MAP[assetClass][regime]?.strategies ?? [];
}

export function selectRandomStrategy(assetClass: AssetClassKey, regime: CanonicalRegimeType): {
  signalType: CanonicalSignalType;
  strategy: string;
  patternType: CanonicalPatternType;
} {
  const mapping = CANONICAL_REGIME_STRATEGY_MAP[assetClass][regime];
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
export function selectPrimaryStrategy(assetClass: AssetClassKey, regime: CanonicalRegimeType): {
  signalType: CanonicalSignalType;
  strategy: string;
  patternType: CanonicalPatternType;
} {
  const mapping = CANONICAL_REGIME_STRATEGY_MAP[assetClass][regime];
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

// B-4.7: regime metrics are class-FREE by construction (identical across
// classes — the per-class deltas are strategy membership only).
export function getRegimeRiskMultiplier(regime: CanonicalRegimeType): number {
  return CANONICAL_REGIME_STRATEGY_MAP_BASE[regime]?.riskMultiplier ?? 1.0;
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
 * B79.0n.PATTERN-DETECT (2026-05-24): REQUIRED `assetClass` parameter added
 * (plumbing-only then). B-4.7 (#163): the body now reads the per-class
 * materialized tree — the deferred refactor landed; for crypto the tree
 * equals the old flat map minus its excludes, so selection semantics follow
 * the same per-class membership every other consumer sees.
 *
 * @param regime - Current market regime
 * @param detectedPattern - Pattern detected by pattern recognizer (null if none)
 * @param symbolHash - Optional hash for deterministic diversity (0-99)
 * @param assetClass - Per-class scope (plumbing only — body unchanged in B79.0n.PATTERN-DETECT)
 * @returns Strategy definition matching the context, plus trace info
 */
export function selectContextAwareStrategy(
  regime: CanonicalRegimeType,
  detectedPattern: string | null,
  symbolHash: number | undefined,
  assetClass: import('../../shared/asset-classes.js').AssetClass,
): {
  signalType: CanonicalSignalType;
  strategy: string;
  patternType: CanonicalPatternType;
  selectionReason: 'exact_match' | 'hybrid_fallback' | 'pattern_fallback' | 'diversity' | 'primary';
} {
  // B-4.7 (#163, diff-B R3): per-class membership — an UNWIRED class throws
  // (the optional-chain-to-adaptive_flow fallback would silently route every
  // perp selection to one strategy at B80 onboarding — the split-brain class).
  const classTree = CANONICAL_REGIME_STRATEGY_MAP[assetClass as AssetClassKey];
  if (!classTree) {
    throw new Error(`[B-4.7] selectContextAwareStrategy: asset class '${assetClass}' has no materialized regime-strategy tree — wire it in ASSET_CLASS_OVERRIDES before onboarding.`);
  }
  const mapping = classTree[regime];
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

// ════════════════════════════════════════════════════════════════════════════
// P19-B6.5c — exact-match pattern→consuming-canonical-strategy resolver (NO fallback)
// ════════════════════════════════════════════════════════════════════════════
//
// WHY a separate function (not a flag on selectContextAwareStrategy): the crypto
// active orchestrator's pattern path must NOT fall back to an unrelated HYBRID/
// PATTERN strategy when the detected pattern has no consuming strategy in the
// current regime+class — that misattributes the signal and pollutes the WRONG
// strategy's per-strategy Net Expectancy (Langston D3: never map-to-nearest).
// selectContextAwareStrategy (shared with VTS + xStock) keeps its fallback
// contract UNCHANGED; this is a strictly-additive sibling used ONLY by the crypto
// orchestrator pattern path. No match → null (the caller drops the signal; the
// QUANT path independently evaluates the regime's quant strategies, so nothing
// actionable is lost). Patterns are TRIGGERS, not strategies — this never invents
// a strategy and never maps to a non-consuming one.
//
// Coverage is OBSERVABLE, not silent: every drop increments a counter keyed by
// (canonicalPattern, regime, assetClass), peekable via getPatternNoMatchDropStats()
// — a high no-match rate is a real coverage signal (no silent caps).

const patternNoMatchDrops = new Map<string, number>();

function recordPatternNoMatchDrop(
  canonicalPattern: CanonicalPatternType,
  regime: CanonicalRegimeType,
  assetClass: string,
): void {
  const key = `${canonicalPattern ?? 'null'}|${regime}|${assetClass}`;
  patternNoMatchDrops.set(key, (patternNoMatchDrops.get(key) ?? 0) + 1);
}

/** P19-B6.5c: peek the per-(pattern,regime,class) no-match drop counter (gate-10 telemetry). */
export function getPatternNoMatchDropStats(): Record<string, number> {
  return Object.fromEntries(patternNoMatchDrops);
}

/** P19-B6.5c: reset the no-match counter (test hook). */
export function resetPatternNoMatchDropStats(): void {
  patternNoMatchDrops.clear();
}

/**
 * P19-B6.5c — resolve a DETECTED pattern to the CANONICAL strategy that consumes
 * it in the given regime + asset class, EXACT-MATCH ONLY (no fallback chain).
 *
 * Returns the consuming strategy (a PATTERN or HYBRID strategy whose declared
 * `patternType` equals the detected pattern's canonical form), or null if no such
 * strategy is active in this regime+class — in which case the caller MUST drop the
 * pattern signal. On a counted null the (pattern, regime, class) drop counter is
 * incremented; an unrecognized (non-canonical) pattern returns null UNcounted
 * (there was no canonical trigger to consume).
 */
export function resolvePatternConsumingStrategy(
  regime: CanonicalRegimeType,
  detectedPattern: string | null,
  assetClass: import('../../shared/asset-classes.js').AssetClass,
): { strategy: string; signalType: CanonicalSignalType; patternType: CanonicalPatternType } | null {
  const canonicalPattern = normalizePatternToCanonical(detectedPattern);
  if (!canonicalPattern) {
    return null; // unrecognized pattern — nothing to route, not a regime-coverage drop
  }

  const classTree = CANONICAL_REGIME_STRATEGY_MAP[assetClass as AssetClassKey];
  const mapping = classTree?.[regime];
  if (!mapping || mapping.strategies.length === 0) {
    recordPatternNoMatchDrop(canonicalPattern, regime, assetClass);
    return null;
  }

  const match = mapping.strategies.find(s =>
    (s.signalType === 'HYBRID' || s.signalType === 'PATTERN') &&
    s.patternType === canonicalPattern,
  );
  if (!match) {
    recordPatternNoMatchDrop(canonicalPattern, regime, assetClass);
    return null;
  }

  return { strategy: match.strategyKey, signalType: match.signalType, patternType: match.patternType };
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
  return CANONICAL_REGIME_STRATEGY_MAP_BASE[regime]?.minConfidence ?? 0.55;
}

export function isValidCanonicalCombination(
  regime: string,
  strategy: string,
  signalType: string,
  patternType?: string | null
): { valid: boolean; reason?: string } {
  const normalizedRegime = normalizeRegime(regime);
  const normalizedStrategy = normalizeStrategy(strategy);

  // B-4.7 (diff-B R1): canonical-IDENTITY validation domain = BASE ∪ class
  // trees. The base covers historical combinations (e.g. ST+orb rows from the
  // B79.0d window) and lane strategies; the trees cover per-class ADDs
  // (orb -> xstock TFS). Strictly wider than the pre-B-4.7 flat domain —
  // never narrower. Class ELIGIBILITY is enforced elsewhere (strategy_gates /
  // getClassMap / the materialized eval tree).
  if (!CANONICAL_REGIME_STRATEGY_MAP_BASE[normalizedRegime]) {
    return { valid: false, reason: `Unknown regime: ${regime}` };
  }

  let stratDef: StrategyDefinition | undefined =
    CANONICAL_REGIME_STRATEGY_MAP_BASE[normalizedRegime].strategies.find(s => s.strategyKey === normalizedStrategy);
  if (!stratDef) {
    for (const assetClass of ASSET_CLASSES) {
      stratDef = CANONICAL_REGIME_STRATEGY_MAP[assetClass][normalizedRegime]?.strategies.find(s => s.strategyKey === normalizedStrategy);
      if (stratDef) break;
    }
  }
  if (!stratDef) {
    return { valid: false, reason: `Strategy ${strategy} not valid for regime ${regime} in any asset class` };
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
  for (const mapping of Object.values(CANONICAL_REGIME_STRATEGY_MAP_BASE)) {
    for (const stratDef of mapping.strategies) {
      strategies.add(stratDef.strategyKey);
    }
  }
  return Array.from(strategies);
}

export function getAllStrategiesForSignalType(signalType: CanonicalSignalType): string[] {
  const strategies: string[] = [];
  for (const mapping of Object.values(CANONICAL_REGIME_STRATEGY_MAP_BASE)) {
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
  // B79.0m.b2 (2026-05-11): ORB classified as breakout family by signalType
  // 'QUANT' + range-breakout geometry (Langston rev1 Q-L2 confirm). Routes
  // ORB through the breakout family IMF lane when it appears in a regime's
  // strategy set. Pre-deploy crypto byStrategy ORB admit count = 0 (verified);
  // rollback trigger documented in BATCH_79_0m_b2_PRE_AUDIT.md §-1.7.
  orb: 'breakout',

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
//
// DOWNSTREAM BEHAVIOR CHAIN (for any strategy added to this map with 'strong_trend'):
//   1. Family-eligibility gate in server/services/vts-runner.ts OR's primary + additional,
//      so the strategy is admitted when routed via sourcePool='quant-strong_trend'.
//   2. When sourcePool === 'quant-strong_trend', vts-runner attaches a
//      `strongTrendGeometryOverride: { stopAtrMultiplier: 4.0, targetAsRMultiple: 3.0 }`
//      (Variant E per B63 Item 12) to the signal's TechnicalIndicators. Consumer strategies
//      that opt in read from this override; strategies that don't (e.g. strong_bull_trend)
//      use their own locked native constants.
//   3. Mode-overlay lane bypass (B63 Item 14) fires in BOTH vts-runner and paper-execution-
//      engine: NORMAL/DEFENSIVE/SURVIVAL stop/target multipliers are skipped when
//      sourcePool === 'quant-strong_trend', preserving the native (or Variant E) geometry.
//      This prevents the pre-B63 silent RR destruction (2:1 → 1.33:1 in DEFENSIVE, 0.8:1
//      in SURVIVAL) on strong-trend-lane trades.
//   4. First-claim-wins lane arbitration (B63 Item 11): if two strategies in the same
//      strong-trend lane fire on the same pair in the same cycle, the earlier admit wins;
//      subsequent admits log null-reason 'strong_trend_lane_conflict'.
//
// Adding a new entry here activates all 4 downstream behaviors automatically for the named
// strategy. See SYSTEM_MANUAL.md Appendix B63.1 + SYSTEM_IMPACT_MAP.md "Recent Additions (B63)".
export const MULTI_FAMILY_ELIGIBILITY: Record<string, StrategyFamily[]> = {
  vwap_pullback: ['strong_trend'],
};

// ════════════════════════════════════════════════════════════════════════════
// B79 — per-asset-class strategy whitelist (B79.0m.a — DB-authoritative)
// ════════════════════════════════════════════════════════════════════════════
//
// History:
//   B79         — introduced as code constant `XSTOCK_SPOT_ENABLED_STRATEGIES`
//                 (6 quant strategies, Langston Q2 conservative ship)
//   B79 rev 7   — expanded to 9 (6 quant + 3 file-based pattern) per Langston
//                 rev 5 + PIA round-2 Q3 regime-compatibility appendix
//   B79.0d      — added ORB (10 total)
//   B79.0m.a    — MIGRATED FROM CODE TO DB. The `XSTOCK_SPOT_ENABLED_STRATEGIES`
//                 const is DELETED per Langston Step 1 R1 (no dual SSOT).
//                 Authoritative source: `module_constants.strategy_gates.
//                 <assetClass>.<strategy>.enabled` (boolean).
//
// Default-open semantics preserved: an asset class with NO `strategy_gates`
// rows is treated as "all strategies enabled" — back-compat for crypto_spot
// (which has no rows) and future asset classes prior to their B79.x onboarding.
//
// xstock_spot: 10 rows seeded by B79.0m.a (8 enabled by default; orb gated
// separately by its existing strategy_gates row).
//
// Module `strategy_gates` is prefetched at boot via b72-warmup.ts so this
// sync helper can read from the in-memory cache. Cold-cache reads throw;
// the prefetch is a hard-fail boot dependency.

import {
  getCachedConstant,
  type ResolutionKey,
} from '../services/module-constants-service';

/**
 * B79.0m.a: DB-authoritative version. Returns true iff `strategy` is enabled
 * for `assetClass` per `module_constants.strategy_gates.<assetClass>.<strategy>.enabled`.
 *
 * Resolution semantics (most-specific-wins is enforced by getCachedConstant
 * via the scoreRowForKey scorer; rows are matched on
 * exchange/assetClass/regime/strategy with wildcard fallback):
 *   - If a matching row exists with `enabled=true` → returns true.
 *   - If a matching row exists with `enabled=false` → returns false.
 *   - If NO row matches the (assetClass, strategy) tuple (even via wildcard)
 *     → returns true. Default-open back-compat for asset classes pre-onboarding
 *     (crypto_spot has no rows; crypto_perp/xstock_perp pre-B80 etc. have none).
 *
 * For xstock_spot specifically, B79.0m.a seeds all 19 strategy rows explicitly
 * (10 enabled, 9 disabled) so the allowlist is fully queryable from DB.
 *
 * Throws on cold cache — b72-warmup.ts must have prefetched `strategy_gates`.
 */
export function isStrategyEnabledForAssetClass(
  strategy: string,
  assetClass: string,
): boolean {
  const key: ResolutionKey = {
    exchange: '*',
    assetClass,
    regime: '*',
    strategy,
  };
  const value = getCachedConstant<boolean>('strategy_gates', 'enabled', key);
  if (value === undefined) {
    // No explicit row → default-open back-compat.
    return true;
  }
  return value === true;
}
