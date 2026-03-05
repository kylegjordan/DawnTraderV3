/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Phase 14 (Batch 15) — VTS Real Score Calculator
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Replaces the three simulation stubs in vts-runner.ts:
 *   - simulateHybridScore()       → computeRealHybridScore()
 *   - simulatePredictiveConfidence() → (uses getPredictiveConfidence from score-calculator)
 *   - simulateDecayPenalty()       → computeRealDecayPenalty()
 *
 * All functions are deterministic — they use real MCE indicators and OHLC data.
 * No Math.random() calls. Scores vary because market data varies.
 *
 * Governance: Phase 14 scope item WS-4 (VTS Real Strategy Calculations)
 * ══════════════════════════════════════════════════════════════════════════════
 */

import type { MarketIndicators } from '../../types/market-context.js';
import type { OHLCData } from '../../types/market-regime.types';
import type { CanonicalRegimeType } from '../../config/canonical-regime-strategy-map.js';
import {
  CANONICAL_REGIME_STRATEGY_MAP,
} from '../../config/canonical-regime-strategy-map.js';

/**
 * Compute a deterministic hybrid score for a strategy using real market indicators.
 *
 * Each strategy maps to a set of indicator-based heuristics:
 *   - VWAP-based strategies score by proximity to VWAP
 *   - SMA-based strategies score by price position relative to SMA and ADX
 *   - Breakout strategies score by range position and volume
 *   - Pattern strategies score by volatility conditions
 *   - Mean reversion strategies score by distance from fair value
 *
 * @param strategy - The strategy key (e.g., 'vwap_pullback', 'sma_trend_ride')
 * @param indicators - MCE-computed market indicators
 * @param ohlcData - OHLC candle data
 * @param regime - Current market regime
 * @returns Hybrid score in [0.10, 0.95]
 */
export function computeRealHybridScore(
  strategy: string,
  indicators: MarketIndicators,
  ohlcData: OHLCData[],
  regime: CanonicalRegimeType
): number {
  const { vwap, sma, currentPrice, atr, high24h, low24h, volatility, momentum, adx } = indicators;

  // Guard against zero/missing data
  if (!currentPrice || currentPrice <= 0 || ohlcData.length < 5) {
    return 0.50; // Neutral fallback
  }

  const safeATR = atr > 0 ? atr : currentPrice * 0.01;
  const range24h = high24h - low24h;
  const safeRange = range24h > 0 ? range24h : currentPrice * 0.02;

  let score: number;

  switch (strategy) {
    // ── VWAP-Based Strategies ──
    case 'vwap_pullback': {
      // Closer to VWAP = better pullback entry; momentum alignment adds quality
      const vwapDist = vwap > 0 ? Math.abs(currentPrice - vwap) / safeATR : 1;
      const pullbackQuality = Math.max(0, 1 - vwapDist / 3);
      const momAlignment = momentum > 0 ? 0.6 : 0.4;
      score = pullbackQuality * 0.55 + momAlignment * 0.35 + 0.10;
      break;
    }

    case 'vwap_bounce': {
      // Price near VWAP with strong volume = bounce candidate
      const vwapProximity = vwap > 0 ? 1 - Math.min(1, Math.abs(currentPrice - vwap) / (safeATR * 2)) : 0.5;
      const adxComponent = Math.min(1, adx / 40);
      score = vwapProximity * 0.50 + adxComponent * 0.30 + 0.20;
      break;
    }

    // ── SMA-Based Strategies ──
    case 'sma_trend_ride': {
      // Price above SMA + strong ADX = trending market
      const aboveSMA = sma > 0 ? (currentPrice > sma ? 0.70 : 0.30) : 0.50;
      const adxStrength = Math.min(1, adx / 50);
      const momBoost = momentum > 0 ? 0.15 : 0;
      score = aboveSMA * 0.45 + adxStrength * 0.35 + momBoost + 0.10;
      break;
    }

    // ── Breakout Strategies ──
    case 'breakout': {
      // Price near range extremes + expanding volatility = breakout signal
      const rangePosition = safeRange > 0 ? (currentPrice - low24h) / safeRange : 0.5;
      const nearExtreme = rangePosition > 0.85 || rangePosition < 0.15 ? 0.8 : 0.4;
      const volExpansion = Math.min(1, volatility / 0.03);
      score = nearExtreme * 0.45 + volExpansion * 0.35 + 0.20;
      break;
    }

    case 'momentum_breakout': {
      // Strong momentum + high ADX + volatility expansion
      const momStrength = Math.min(1, Math.abs(momentum) / 0.01);
      const adxBoost = Math.min(1, adx / 40);
      const dirAlignment = momentum > 0 ? 0.7 : 0.5;
      score = momStrength * 0.35 + adxBoost * 0.30 + dirAlignment * 0.25 + 0.10;
      break;
    }

    // ── Range/Reversion Strategies ──
    case 'range_trade': {
      // Low volatility + price within range + low ADX = range conditions
      const lowVolScore = Math.max(0, 1 - volatility / 0.03);
      const lowADXScore = Math.max(0, 1 - adx / 40);
      const inRange = safeRange > 0 ? 1 - Math.abs((currentPrice - low24h) / safeRange - 0.5) * 2 : 0.5;
      score = lowVolScore * 0.35 + lowADXScore * 0.30 + inRange * 0.25 + 0.10;
      break;
    }

    case 'mean_reversion': {
      // Price deviation from VWAP/SMA indicates reversion opportunity
      const vwapDev = vwap > 0 ? Math.abs(currentPrice - vwap) / safeATR : 0;
      const smaDev = sma > 0 ? Math.abs(currentPrice - sma) / safeATR : 0;
      const avgDev = (vwapDev + smaDev) / 2;
      const reversionSignal = avgDev > 1.5 ? Math.min(1, avgDev / 3) : avgDev / 3;
      const lowADX = Math.max(0, 1 - adx / 50);
      score = reversionSignal * 0.50 + lowADX * 0.30 + 0.20;
      break;
    }

    // ── Support/Resistance Strategies ──
    case 'support_bounce': {
      // Price near low24h = potential support bounce
      const nearSupport = safeRange > 0 ? Math.max(0, 1 - (currentPrice - low24h) / (safeRange * 0.3)) : 0.5;
      const volContraction = Math.max(0, 1 - volatility / 0.025);
      score = nearSupport * 0.50 + volContraction * 0.30 + 0.20;
      break;
    }

    case 'resistance_fade': {
      // Price near high24h = potential fade
      const nearResistance = safeRange > 0 ? Math.max(0, 1 - (high24h - currentPrice) / (safeRange * 0.3)) : 0.5;
      const weakMom = Math.max(0, 1 - Math.abs(momentum) / 0.005);
      score = nearResistance * 0.50 + weakMom * 0.30 + 0.20;
      break;
    }

    // ── Liquidity Strategies ──
    case 'liquidity_trap': {
      // False breakout detection: high vol + reverting momentum
      const highVol = Math.min(1, volatility / 0.025);
      const momReversal = Math.min(1, Math.abs(momentum) / 0.008);
      score = highVol * 0.40 + momReversal * 0.35 + 0.25;
      break;
    }

    // ── Pattern-Based Strategies ──
    case 'double_bottom_breakout':
    case 'head_shoulders_reversal':
    case 'ascending_triangle': {
      // Pattern strategies score based on volatility conditions and ADX
      const volFit = volatility > 0.005 && volatility < 0.04 ? 0.7 : 0.4;
      const adxFit = adx > 15 && adx < 45 ? 0.7 : 0.4;
      score = volFit * 0.45 + adxFit * 0.35 + 0.20;
      break;
    }

    // ── Hybrid Strategies ──
    case 'hybrid_momentum_pattern':
    case 'hybrid_vwap_pattern':
    case 'hybrid_sma_pattern':
    case 'regime_adaptive_blend':
    case 'volatility_regime_switch': {
      // Hybrid strategies blend multiple signals
      const momComponent = Math.min(1, Math.abs(momentum) / 0.008);
      const regimeMapping = CANONICAL_REGIME_STRATEGY_MAP[regime];
      const regimeRisk = regimeMapping?.riskMultiplier ?? 0.5;
      const adxNorm = Math.min(1, adx / 40);
      score = momComponent * 0.30 + regimeRisk * 0.30 + adxNorm * 0.25 + 0.15;
      break;
    }

    default: {
      // Deterministic fallback using regime risk multiplier + indicators
      const regimeMapping = CANONICAL_REGIME_STRATEGY_MAP[regime];
      const riskBase = regimeMapping?.riskMultiplier ?? 0.5;
      const adxNorm = Math.min(1, adx / 40);
      score = riskBase * 0.50 + adxNorm * 0.30 + 0.20;
      break;
    }
  }

  // Clamp to valid range [0.10, 0.95]
  return Math.min(0.95, Math.max(0.10, score));
}

/**
 * Compute real decay penalty based on signal age.
 *
 * In VTS, signals are generated and acted upon in the same cycle,
 * so fresh signals have near-zero decay. This function computes
 * the actual time-based decay using the same formula as RTB.
 *
 * Formula: penalty = lambda * ageMinutes, capped at 0.10
 * For fresh signals (age=0): penalty = 0
 *
 * @param signalTimestamp - When the signal was created (Date or ISO string)
 * @returns Decay penalty in [0, 0.10]
 */
export function computeRealDecayPenalty(signalTimestamp?: Date | string): number {
  if (!signalTimestamp) return 0; // Fresh signal, zero decay

  const ageMs = Date.now() - new Date(signalTimestamp).getTime();
  const ageMinutes = ageMs / (60 * 1000);

  // Same lambda as ready_to_buy_service: gentle linear decay
  const DECAY_LAMBDA = 0.001;
  const rawPenalty = DECAY_LAMBDA * ageMinutes;
  const cappedPenalty = Math.min(rawPenalty, 0.10);

  return Math.round(cappedPenalty * 10000) / 10000;
}
