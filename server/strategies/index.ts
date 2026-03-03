/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 12.3.2 — Strategy Module Registry
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Barrel export for all 8 new strategy modules implemented in Phase 12.3.
 * Each module exports a detect function that can be called by the StrategyEngine.
 *
 * Strategy Types:
 *   PATTERN (3): morning_star, inside_bar_reversal, support_bounce
 *   HYBRID  (5): pivot_shift, reverse_impulse, defensive_hedge, adaptive_flow, volatility_edge
 *
 * All strategies follow the vetted STRATEGY_SPECIFICATION_12.3.2_FINAL.md
 * ══════════════════════════════════════════════════════════════════════════════
 */

export { detectMorningStar } from './morning-star';
export { detectInsideBarReversal } from './inside-bar-reversal';
export { detectSupportBounce } from './support-bounce';
export { detectPivotShift } from './pivot-shift';
export { detectReverseImpulse } from './reverse-impulse';
export { detectDefensiveHedge } from './defensive-hedge';
export { detectAdaptiveFlow } from './adaptive-flow';
export { detectVolatilityEdge } from './volatility-edge';

/**
 * All 8 new strategy keys for type checking and registration
 */
export const NEW_STRATEGY_KEYS = [
  'morning_star',
  'inside_bar_reversal',
  'support_bounce',
  'pivot_shift',
  'reverse_impulse',
  'defensive_hedge',
  'adaptive_flow',
  'volatility_edge',
] as const;

export type NewStrategyKey = typeof NEW_STRATEGY_KEYS[number];
