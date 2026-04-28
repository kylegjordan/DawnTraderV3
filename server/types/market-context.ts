/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Phase 13/14 — Market Context Engine Type Definitions
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Centralized type definitions for the Market Context Engine (MCE).
 * MCE computes indicators + regime + directional bias in a single pass per
 * symbol, eliminating duplicate computation across signal-orchestrator and
 * strategy-engine.
 *
 * Phase 14 additions:
 *   - DirectionalBias field in MarketContext
 *   - Regime names updated to canonical Phase 14 names
 *
 * Addresses: RISK-002 (OHLC Indicator Computation Duplication)
 *
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import type { OHLCData, MarketRegimeType, RegimeCalculationResult } from './market-regime.types';
import type { CanonicalRegimeType } from '../config/canonical-regime-strategy-map';
import type { DirectionalBiasResult } from './directional-bias.types';
// B67.1: macro confidence modifier types — see server/core/metrics/macro-modifier.ts.
// Imported here so MarketContext can carry the macro snapshot + modifier result
// alongside other per-cycle fields, available to downstream consumers (B67.0
// ablation hooks read the modifier value to populate alternate_decision JSONB).
import type { MacroSnapshot, MacroModifierResult } from '../core/metrics/macro-modifier.js';

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
  confidence: number;         // Regime classification confidence (0.4-0.95)
  regimeWeight: number;       // From REGIME_WEIGHTS lookup (used in FinalScore)
  allowedStrategies: string[]; // Strategy keys allowed for this regime
}

/**
 * B67.1 — Macro context attached to MarketContext.
 *
 * Per Kyle directive 2026-04-29: no shadow theater, no conditional null path.
 * Modifier is ALWAYS populated. The downstream consumer (calculatePairRegime)
 * always applies it. Kill-switch use case = set modifier_min=max=1.0 in DB
 * (math produces identity, no special code path).
 *
 * Populated by `market-context-engine.ts` once per refresh cycle (NOT per
 * pair — the macro snapshot is global) and attached identically to every
 * per-pair MarketContext returned in that cycle.
 */
export interface MacroContext {
  snapshot: MacroSnapshot;
  modifier: MacroModifierResult;
}

/**
 * MarketContext — The complete output of MCE.computeContext().
 * Contains pre-computed indicators + regime context + directional bias for a single symbol + OHLC pass.
 */
export interface MarketContext {
  symbol: string;
  timestamp: number;
  indicators: MarketIndicators;
  regime: RegimeContext;
  raw: RegimeCalculationResult; // Full regime result for consumers that need raw metrics
  // Phase 14: Directional Bias
  directionalBias: DirectionalBiasResult;
  // B67.1: macro context (optional — present once macro feed is wired in MCE).
  // null `modifier` field signals b67_1_enabled=false; absent `macro` field
  // signals pre-B67.1 contexts (callers must handle both for back-compat).
  macro?: MacroContext;
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
