/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.7G — Predictive Filter Descriptions
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Human-readable descriptions for all predictive filters and gating conditions.
 * Used by the Predictive Diagnostics UI for operator interpretability.
 * 
 * Schema: predictive-diagnostics/v1.0
 * ══════════════════════════════════════════════════════════════════════════════
 */

export const PREDICTIVE_FILTER_DESCRIPTIONS: Record<string, string> = {
  macroFilter: "Blocks trades during macroeconomic instability (VIX > 30, BTC correlation > 0.8)",
  volatilityFilter: "Pauses signals when realized volatility exceeds 1.5σ of regime baseline",
  confidenceGate: "Requires predictive confidence ≥ configured threshold (default 0.65)",
  riskScreen: "Blocks entries exceeding 1.2× mean risk ratio over 7-day rolling window",
  liquidityFilter: "Ensures sufficient market depth for position sizing",
  trendFilter: "Validates trend alignment with regime expectations",
  momentumFilter: "Confirms momentum strength meets minimum thresholds",
  regimeFilter: "Ensures market regime matches strategy requirements"
};

export const FILTER_STATUS_COLORS: Record<string, string> = {
  PASS: '#22c55e',      // Green
  BLOCKED: '#ef4444',   // Red
  SKIPPED: '#eab308',   // Yellow
  DRIFT: '#f97316'      // Orange
};

export const FILTER_STATUS_LABELS: Record<string, string> = {
  PASS: 'Filter passed',
  BLOCKED: 'Filter failed',
  SKIPPED: 'Filter not evaluated',
  DRIFT: 'Model calibration drift > 1σ'
};

export const WEIGHT_CONTRIBUTION_LABELS: Record<string, string> = {
  volZ: 'Volatility Z-Score',
  trendZ: 'Trend Z-Score',
  adx: 'ADX Strength',
  momentum: 'Momentum',
  rsi: 'RSI',
  volume: 'Volume Profile',
  spread: 'Bid-Ask Spread',
  liquidity: 'Liquidity Score'
};

export const PREDICTIVE_DIAGNOSTICS_SCHEMA = 'predictive-diagnostics/v1.0';
