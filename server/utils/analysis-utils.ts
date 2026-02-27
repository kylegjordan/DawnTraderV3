/**
 * Directive 9.0.B - Volume Classifier Utility
 * Directive 9.6.A - Now imports thresholds from centralized SYSTEM_GUARDS configuration
 * Directive 10.9B - Verified Pre-Signal Math Guards (non-conflicting with SQE scoring)
 * 
 * Provides standardized classification for liquidity tiers based on 24h volume (USD).
 * Used by FX5 Scanner and Filter Engine to categorize trading pairs.
 * 
 * Pre-Signal Math Guards (Institutional Math):
 * - Log-Liquidity (LQ): Logarithmic liquidity index (0-100)
 * - Directional Integrity (DI): Trend straightness measure (0-100)
 * - Volatility Noise (VolNoise): Market choppiness quantifier (0-1)
 * - Sigma (σ): Standard deviation of returns
 * 
 * These guards execute BEFORE signal orchestration but AFTER FX5 universe selection.
 * They do NOT conflict with SQE scoring which uses FinalScore/RegimeWeight.
 * 
 * Tiers:
 * - SMALL: < $1M USD 24h volume (low liquidity, higher spread risk)
 * - MID: $1M - $10M USD 24h volume (moderate liquidity)
 * - LARGE: > $10M USD 24h volume (high liquidity, tight spreads)
 */

import { SYSTEM_GUARDS } from '../config/system-guards.js';

export type VolumeClass = 'SMALL' | 'MID' | 'LARGE';

export const VOLUME_THRESHOLDS = {
  SMALL_MAX: 1_000_000,    // < $1M = SMALL
  MID_MAX: 10_000_000      // $1M - $10M = MID, > $10M = LARGE
};

/**
 * Classifies a trading pair by its 24h USD volume
 * @param volumeUSD - The 24-hour trading volume in USD
 * @returns 'SMALL' | 'MID' | 'LARGE'
 */
export function classifyVolume(volumeUSD: number): VolumeClass {
  if (volumeUSD < VOLUME_THRESHOLDS.SMALL_MAX) {
    return 'SMALL';
  }
  if (volumeUSD < VOLUME_THRESHOLDS.MID_MAX) {
    return 'MID';
  }
  return 'LARGE';
}

/**
 * Returns human-readable volume classification with value
 * @param volumeUSD - The 24-hour trading volume in USD
 * @returns Formatted string like "MID ($5.2M)"
 */
export function formatVolumeClass(volumeUSD: number): string {
  const volumeClass = classifyVolume(volumeUSD);
  const formattedVol = volumeUSD >= 1_000_000 
    ? `$${(volumeUSD / 1_000_000).toFixed(1)}M`
    : `$${(volumeUSD / 1_000).toFixed(0)}K`;
  return `${volumeClass} (${formattedVol})`;
}

/**
 * Checks if a pair meets minimum liquidity requirements
 * @param volumeUSD - The 24-hour trading volume in USD
 * @param minClass - Minimum required volume class (default: 'MID')
 * @returns true if pair meets minimum liquidity
 */
export function meetsLiquidityRequirement(
  volumeUSD: number, 
  minClass: VolumeClass = 'MID'
): boolean {
  const volumeClass = classifyVolume(volumeUSD);
  const classOrder: Record<VolumeClass, number> = { SMALL: 1, MID: 2, LARGE: 3 };
  return classOrder[volumeClass] >= classOrder[minClass];
}

// ==========================================
// Directive 9.1 — Analysis Utils & Core Metrics
// Mathematical foundation layer for Phase 9+ quantitative computations
// ==========================================

/**
 * Directive 9.1.A: Log-Liquidity (LQ)
 * Logarithmic liquidity index on 0-100 scale.
 * High = stable market depth, Low = illiquid.
 * 
 * @param V - 24h trading volume (USD)
 * @param C - Trade count (24h)
 * @param S - Bid-ask spread
 * @returns LQ value between 0-100
 */
export function calculateLogLiquidity(V: number, C: number, S: number): number {
  const spread = Math.max(S, 1e-8);
  const count = Math.max(C, 1);
  const raw = 10 * (Math.log(V * count) - Math.log(spread / count) - 10);
  return Math.max(0, Math.min(100, raw));
}

/**
 * Directive 9.1.B: Directional Integrity (DI)
 * Measures directional persistence (trend straightness).
 * - >= 65: stable trend
 * - < 30: choppy / non-directional
 * 
 * @param prices - Array of price points
 * @returns DI value between 0-100
 */
export function calculateDirectionalIntegrity(prices: number[]): number {
  if (prices.length < 3) return 50;
  const net = Math.abs(prices[prices.length - 1] - prices[0]);
  const total = prices.slice(1).reduce((s, p, i) => s + Math.abs(p - prices[i]), 0);
  const ratio = net / (total || 1);
  return Math.min(100, Math.max(0, ratio * 100));
}

/**
 * Directive 9.1.C: Volatility Noise (VolNoise)
 * Quantifies market choppiness.
 * Lower = smoother trends, Higher = instability.
 * 
 * @param prices - Array of price points
 * @returns VolNoise value between 0-1
 */
export function calculateVolNoise(prices: number[]): number {
  if (prices.length < 3) return 0.5;
  const diffs = prices.slice(1).map((p, i) => Math.abs(p - prices[i]));
  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  const variance = diffs.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / diffs.length;
  const noise = Math.sqrt(variance) / (mean || 1);
  return Math.min(1, Math.max(0, noise));
}

/**
 * Directive 9.1.D: Sigma Estimator (Corrected)
 * Standard deviation of returns (not raw prices).
 * Adaptive volatility estimator for 3σ spike detection.
 * Smooth trends → low σ, erratic prices → high σ.
 * 
 * @param prices - Array of price points
 * @param window - Rolling window size (default: 20)
 * @returns Sigma value (standard deviation of returns)
 */
export function calculateSigma(prices: number[], window: number = 20): number {
  if (prices.length < window + 1) return 0;
  
  const diffs = prices.slice(1).map((p, i) => p - prices[i]);
  const segment = diffs.slice(-window);

  const mean = segment.reduce((a, b) => a + b, 0) / segment.length;
  const variance = segment.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / segment.length;
  return Math.sqrt(variance);
}

/**
 * Directive 9.3.B: Efficiency Ratio (ER)
 * Measures trend efficiency/directional strength.
 * ER → 1.0: Perfectly smooth trend (net change equals total path)
 * ER → 0.0: Random, noisy chop (net change is small vs total path)
 * 
 * Formula: ER = |Price_t - Price_{t-n}| / Σ|ΔPrice_i|
 * 
 * @param prices - Array of price points
 * @param window - Lookback window (default: 20)
 * @returns ER value between 0-1
 */
export function calculateEfficiencyRatio(prices: number[], window: number = 20): number {
  if (prices.length < window + 1) return 0;
  
  const change = Math.abs(prices[prices.length - 1] - prices[prices.length - window - 1]);
  const volatility = prices.slice(-window).reduce((sum, p, i, arr) =>
    i > 0 ? sum + Math.abs(p - arr[i - 1]) : sum, 0);
  
  if (volatility === 0) return 0;
  
  const ER = +(change / volatility).toFixed(4);
  return Math.min(1, Math.max(0, ER));
}

/**
 * Directive 9.1.F: Filter thresholds for core metrics
 * Directive 9.6.A: Now imports from centralized SYSTEM_GUARDS configuration
 */
export const CORE_METRIC_THRESHOLDS = {
  LQ_MIN: SYSTEM_GUARDS.MIN_LIQUIDITY_SCORE,
  VOL_NOISE_MAX: SYSTEM_GUARDS.MAX_VOL_NOISE,
  DI_TRENDING: SYSTEM_GUARDS.DI_TRENDING,
  DI_CHOPPY: SYSTEM_GUARDS.DI_CHOPPY,
};

/**
 * Directive 9.1.F: Check if pair meets core metric filters
 * @param LQ - Log-Liquidity value
 * @param VolNoise - Volatility Noise value
 * @returns true if pair passes filters
 */
export function passesCoreMetricFilters(LQ: number, VolNoise: number): boolean {
  return LQ >= CORE_METRIC_THRESHOLDS.LQ_MIN && VolNoise <= CORE_METRIC_THRESHOLDS.VOL_NOISE_MAX;
}

/**
 * Directive 9.1: Compute all core metrics for a price series
 * @param prices - Array of historical prices
 * @param volumeUSD - 24h volume in USD
 * @param tradeCount - 24h trade count
 * @param spread - Current bid-ask spread
 * @returns Object with all core metrics
 */
export interface CoreMetrics {
  LQ: number;       // Log-Liquidity (0-100)
  DI: number;       // Directional Integrity (0-100)
  VolNoise: number; // Volatility Noise (0-1)
  Sigma: number;    // Price return volatility
  ER: number;       // Efficiency Ratio (0-1) - Directive 9.3
  passesFilter: boolean;
}

export function computeCoreMetrics(
  prices: number[],
  volumeUSD: number,
  tradeCount: number,
  spread: number
): CoreMetrics {
  const LQ = calculateLogLiquidity(volumeUSD, tradeCount, spread);
  const DI = calculateDirectionalIntegrity(prices);
  const VolNoise = calculateVolNoise(prices);
  const Sigma = calculateSigma(prices);
  const ER = calculateEfficiencyRatio(prices);
  const passesFilter = passesCoreMetricFilters(LQ, VolNoise);
  
  return { LQ, DI, VolNoise, Sigma, ER, passesFilter };
}

// ==========================================
// Directive 9.2 — Dynamic Trade Management
// Adaptive trailing exit logic using DI and VolNoise
// ==========================================

/**
 * Directive 9.2.B: Dynamic Stop Distance Formula
 * Computes K' (adaptive trailing multiplier) from DI and VolNoise.
 * 
 * Formula: K' = K_base × (1 + α×(1 - DI/100) + β×VolNoise)
 * 
 * Where:
 * - K_base: Base trailing multiplier (default: 1.0 ATR)
 * - α: DI sensitivity coefficient (default: 0.5) - lower DI = wider stop
 * - β: VolNoise sensitivity coefficient (default: 0.8) - higher noise = wider stop
 * 
 * @param DI - Directional Integrity (0-100)
 * @param VolNoise - Volatility Noise (0-1)
 * @param K_base - Base trailing multiplier (default: 1.0)
 * @param alpha - DI sensitivity (default: 0.5)
 * @param beta - VolNoise sensitivity (default: 0.8)
 * @returns K' - Adaptive trailing multiplier
 */
export function calculateDynamicStopDistance(
  DI: number,
  VolNoise: number,
  K_base: number = 1.0,
  alpha: number = 0.5,
  beta: number = 0.8
): number {
  const diAdjustment = alpha * (1 - DI / 100);
  const noiseAdjustment = beta * VolNoise;
  const Kprime = K_base * (1 + diAdjustment + noiseAdjustment);
  return Math.max(0.5, Math.min(3.0, Kprime));
}

/**
 * Directive 9.2.B: Calculate trailing stop price
 * Uses adaptive K' multiplier with ATR to compute trailing stop distance.
 * 
 * @param currentPrice - Current market price
 * @param ATR - Average True Range
 * @param DI - Directional Integrity (0-100)
 * @param VolNoise - Volatility Noise (0-1)
 * @returns Trailing stop price
 */
export function calculateTrailingStopPrice(
  currentPrice: number,
  ATR: number,
  DI: number,
  VolNoise: number
): number {
  const Kprime = calculateDynamicStopDistance(DI, VolNoise);
  const trailingDistance = ATR * Kprime;
  return currentPrice - trailingDistance;
}

/**
 * Directive 9.2: Trade mode types for trailing exit system
 */
export type TradeMode = 'TARGET' | 'TRAILING_TAKE';

/**
 * Directive 9.2.C: Break-Even trigger calculation
 * Returns true if price has reached 1×ATR gain from entry.
 * 
 * @param currentPrice - Current market price
 * @param entryPrice - Trade entry price
 * @param ATR - Average True Range
 * @returns true if break-even trigger is reached
 */
export function isBreakEvenTriggered(
  currentPrice: number,
  entryPrice: number,
  ATR: number
): boolean {
  const gain = currentPrice - entryPrice;
  return gain >= ATR;
}

/**
 * Directive 9.2.C: Target Lock trigger calculation
 * Returns true if price has reached the target price.
 * 
 * @param currentPrice - Current market price
 * @param targetPrice - Trade target price
 * @returns true if target lock trigger is reached
 */
export function isTargetLockTriggered(
  currentPrice: number,
  targetPrice: number
): boolean {
  return currentPrice >= targetPrice;
}


/**
 * Directive 10.1.B: Calculate Trend Slope
 * Measures the normalized price change over a period.
 * Positive = bullish trend, Negative = bearish trend, Near 0 = sideways.
 * 
 * Formula: (P_last - P_first) / P_first
 * 
 * @param prices - Array of price points (oldest to newest)
 * @returns Trend slope as decimal (e.g., 0.05 = +5% bullish, -0.05 = -5% bearish)
 */
export function calculateTrendSlope(prices: number[]): number {
  if (prices.length < 2) return 0;
  
  const first = prices[0];
  const last = prices[prices.length - 1];
  
  if (first === 0) return 0;
  
  return (last - first) / first;
}
