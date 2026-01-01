/**
 * Directive 9.0.B - Volume Classifier Utility
 * 
 * Provides standardized classification for liquidity tiers based on 24h volume (USD).
 * Used by FX5 Scanner and Filter Engine to categorize trading pairs.
 * 
 * Tiers:
 * - SMALL: < $1M USD 24h volume (low liquidity, higher spread risk)
 * - MID: $1M - $10M USD 24h volume (moderate liquidity)
 * - LARGE: > $10M USD 24h volume (high liquidity, tight spreads)
 */

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
 * Directive 9.1.F: Filter thresholds for core metrics
 */
export const CORE_METRIC_THRESHOLDS = {
  LQ_MIN: 40,           // Minimum Log-Liquidity (exclude < 40)
  VOL_NOISE_MAX: 0.6,   // Maximum Volatility Noise (exclude > 0.6)
  DI_TRENDING: 65,      // DI threshold for trending market
  DI_CHOPPY: 30,        // DI threshold for choppy market
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
  const passesFilter = passesCoreMetricFilters(LQ, VolNoise);
  
  return { LQ, DI, VolNoise, Sigma, passesFilter };
}
