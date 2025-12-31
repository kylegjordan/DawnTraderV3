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
