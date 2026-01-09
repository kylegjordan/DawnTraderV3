/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.0E.1 — Market Regime Type Definitions
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Canonical market regime types for pair-level regime classification.
 * Used by VTS Runner, Strategy Engine, and Telemetry systems.
 * 
 * Schema: v1.6.6
 * Governance: M46 (Pair regime must be calculated each cycle)
 * ══════════════════════════════════════════════════════════════════════════════
 */

export type MarketRegimeType = 
  | 'BULL_STABLE'
  | 'BEAR_VOLATILE'
  | 'LOW_VOL_CHOP'
  | 'HIGH_VOL_IMPULSE'
  | 'TRANSITION';

export interface OHLCData {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
}

export interface RegimeCalculationResult {
  regime: MarketRegimeType;
  volatility: number;
  momentum: number;
  adx: number;
  confidence: number;
}

export const REGIME_WEIGHTS: Record<MarketRegimeType, number> = {
  BULL_STABLE: 0.85,
  BEAR_VOLATILE: 0.40,
  LOW_VOL_CHOP: 0.55,
  HIGH_VOL_IMPULSE: 0.70,
  TRANSITION: 0.50
};

export const REGIME_DESCRIPTIONS: Record<MarketRegimeType, string> = {
  BULL_STABLE: 'Persistent uptrend with controlled volatility, ideal for momentum strategies',
  BEAR_VOLATILE: 'Downtrend with high volatility, defensive positioning recommended',
  LOW_VOL_CHOP: 'Sideways range-bound market, pattern-based strategies favored',
  HIGH_VOL_IMPULSE: 'High volatility with impulsive moves, quantitative edge strategies',
  TRANSITION: 'Market regime shifting, hybrid strategies for uncertainty'
};
