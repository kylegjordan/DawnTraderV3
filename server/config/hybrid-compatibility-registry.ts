/**
 * Hybrid Strategy Compatibility Registry — Phase 14.5
 *
 * Single source of truth for which quant strategy + pattern type
 * combinations can produce hybrid signals.
 *
 * Used by: signal-orchestrator.ts (active trading) and vts-runner.ts (VTS)
 *
 * Fix per Langston review (Batch 19G): extracted from duplicate definitions
 * in signal-orchestrator.ts and vts-runner.ts into shared registry.
 */

export const HYBRID_COMPATIBILITY: Record<string, { patterns: string[], quantStrategies: string[] }> = {
  pivot_shift: { patterns: ['MORNING_STAR'], quantStrategies: ['vwap_pullback', 'sma_trend_ride', 'dhma'] },
  reverse_impulse: { patterns: ['PINBAR'], quantStrategies: ['mean_reversion', 'range_trade'] },
  defensive_hedge: { patterns: ['ENGULFING'], quantStrategies: ['mean_reversion', 'breakout'] },
  adaptive_flow: { patterns: ['THREE_SOLDIERS'], quantStrategies: ['range_trade', 'abcd_long'] },
  volatility_edge: { patterns: ['ABCD'], quantStrategies: ['breakout', 'vwap_bounce', 'dhma'] },
};

export function findHybridMatch(quantStrategy: string, patternType: string): string | null {
  for (const [hybridName, compat] of Object.entries(HYBRID_COMPATIBILITY)) {
    if (compat.quantStrategies.includes(quantStrategy) && compat.patterns.includes(patternType)) {
      return hybridName;
    }
  }
  return null;
}
