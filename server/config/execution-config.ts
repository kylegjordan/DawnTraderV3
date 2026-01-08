/**
 * Directive 11.0C — Execution Configuration
 * 
 * Centralized configuration for Trade Execution Controller (TEC).
 * All adaptive sizing, trailing stop, and risk parameters are defined here.
 * 
 * This is the single source of truth for TEC behavior.
 */

export const EXECUTION_CONFIG = Object.freeze({
  ADAPTIVE_EXPAND_FACTOR: 1.10,
  ADAPTIVE_CONTRACT_FACTOR: 0.90,
  TRAILING_STOP_BASE: 0.015,
  TRAILING_STOP_ACCELERATION: 0.002,
  MAX_POSITION_RISK: 0.02,
  TRAILING_STOP_ACTIVATION_PCT: 1.0,
  TRAILING_STOP_DISTANCE_PCT: 0.5,
  MAX_HOLDING_PERIOD_MS: 24 * 60 * 60 * 1000,
  VERSION: "v1.0.0"
});

export type ExecutionConfig = typeof EXECUTION_CONFIG;
