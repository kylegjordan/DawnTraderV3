/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Phase 13 — Market Context Engine Type Definitions
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Centralized type definitions for the Market Context Engine (MCE).
 * MCE computes indicators + regime in a single pass per symbol, eliminating
 * duplicate VWAP/SMA computation across signal-orchestrator and strategy-engine.
 *
 * Addresses: RISK-002 (OHLC Indicator Computation Duplication)
 *
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import type { OHLCData, MarketRegimeType, RegimeCalculationResult } from './market-regime.types';
import type { CanonicalRegimeType } from '../config/canonical-regime-strategy-map';

/**
 * MarketIndicators — Superset of strategy-engine's TechnicalIndicators.
 *
 * Strategies receive this instead of computing their own VWAP/SMA.
 * Existing TechnicalIndicators fields (vwap, sma, currentPrice, volume, high24h, low24h)
 * are preserved for backward compatibility with all 17 detect*() methods.
 */
export interface MarketIndicators {
  // === Fields matching TechnicalIndicators (strategy-engine.ts lines 36-43) ===
  vwap: number;
  sma: number;
  currentPrice: number;
  volume: number;
  high24h: number;
  low24h: number;

  // === Additional indicators computed by MCE ===
  atr: number;         // Average True Range (14-period)
  volatility: number;  // From calculatePairRegime() — standard deviation of returns
  momentum: number;    // From calculatePairRegime() — 14-period price change ratio
  adx: number;         // From calculatePairRegime() — Average Directional Index
}

/**
 * RegimeContext — Regime classification + metadata from a single computeContext() call.
 */
export interface RegimeContext {
  regime: MarketRegimeType;
  confidence: number;         // Regime classification confidence (0.4–0.95)
  regimeWeight: number;       // From REGIME_WEIGHTS lookup (used in FinalScore)
  allowedStrategies: string[]; // Strategy keys allowed for this regime
}

/**
 * MarketContext — The complete output of MCE.computeContext().
 * Contains pre-computed indicators + regime context for a single symbol + OHLC pass.
 */
export interface MarketContext {
  symbol: string;
  timestamp: number;
  indicators: MarketIndicators;
  regime: RegimeContext;
  raw: RegimeCalculationResult; // Full regime result for consumers that need raw metrics
}

/**
 * MCE configuration options.
 */
export interface MCEConfig {
  smaPeriod: number;       // SMA lookback period (default: 20)
  atrPeriod: number;       // ATR lookback period (default: 14)
  cacheTTLMs: number;      // Cache time-to-live in milliseconds (default: 60000)
}

export const DEFAULT_MCE_CONFIG: MCEConfig = {
  smaPeriod: 20,
  atrPeriod: 14,
  cacheTTLMs: 60_000,
};
