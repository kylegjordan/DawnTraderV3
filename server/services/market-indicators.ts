/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.4A — Market Indicators Service
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Provides global market intelligence for the operator dashboard:
 * - Market Regime (global macro climate)
 * - Global Friction Score (execution environment from Top-100 FX5 pool)
 * - Global Directional Bias (Phase 14)
 *
 * Phase 14 (Batch 15): Critical fix — eliminated stale parallel regime data.
 *   - Removed mapToBaseRegime() lossy adapter
 *   - Removed hardcoded regimeNarratives (8-value, non-canonical)
 *   - Now reads regime names, descriptions, and strategies from canonical map SSOT
 *   - MarketRegime type updated to use canonical CanonicalRegimeType
 *
 * Governance Invariants:
 * - M14: Global Friction derived only from Top-100 FX5 pool
 * - M15: Market Regime remains globally calculated
 *
 * ══════════════════════════════════════════════════════════════════════════════
 */

import {
  type CanonicalRegimeType,
  REGIME_NARRATIVES,
  REGIME_DISPLAY_NAMES,
  normalizeRegime,
} from '../config/canonical-regime-strategy-map.js';
import { computeMarketFriction, describeFriction, type FrictionStatus } from '../core/metrics/cost-metrics.js';
import { getMarketContextEngine } from './market-context-engine.js';
import type { GlobalDirectionalBias } from '../types/directional-bias.types.js';
import { getCostMetrics as getCacheMetrics, getCacheSize } from '../core/cache/cost-cache.js';
import { activeFilterPool } from './active-filter-pool.js';
import { getTelemetryAggregator } from './telemetry-aggregator.js';
import { checkRegimeTransition, checkFrictionTransition } from '../utils/market-events.js';
import { getFavoredStrategiesForRegime, getFavoredSignalTypesForRegime } from '../core/strategy-mapper.js';

/**
 * Phase 14: MarketRegime is now CanonicalRegimeType directly.
 * No more lossy 6-value type with EXTREME_NOISE as the only non-canonical member.
 * EXTREME_NOISE is handled by normalizeRegime() -> RANGE_BOUND_STABLE.
 */
export type MarketRegime = CanonicalRegimeType;

export interface RegimeInfo {
  name: MarketRegime;
  description: string;
  favoredStrategies: string[];
}

export interface ExpandedRegimeDescription {
  title: string;
  description: string;
  favoredSignalTypes: string[];
  favoredStrategies: string[];
}

export interface MarketIndicators {
  marketRegime: MarketRegime;
  regimeDescription: string;
  regimeTitle: string;
  regimeScore: number;
  regimePercentage: number;
  favoredSignalTypes: string[];
  favoredStrategies: string[];
  globalFrictionScore: number;
  frictionSampleSize: number;
  frictionDescription: FrictionStatus;
  frictionNarrative: string;
  // Phase 14: Global Directional Bias
  globalDBS: GlobalDirectionalBias | null;
  timestamp: Date;
}

/**
 * Phase 14: Get expanded regime description from canonical SSOT.
 * No more hardcoded regimeNarratives — reads from REGIME_NARRATIVES in canonical map.
 */
function getExpandedRegimeDescriptionFromCanonical(regime: string): ExpandedRegimeDescription {
  // Normalize to canonical name (handles old names via GHOST_REGIME_NORMALIZATION)
  const canonicalRegime = normalizeRegime(regime);
  const narrative = REGIME_NARRATIVES[canonicalRegime];

  return {
    title: narrative.title,
    description: narrative.description,
    favoredStrategies: getFavoredStrategiesForRegime(canonicalRegime),
    favoredSignalTypes: getFavoredSignalTypesForRegime(canonicalRegime)
  };
}

/**
 * Phase 14: Build regime descriptions dynamically from canonical map.
 * This replaces the old static regimeDescriptions object that had 8 hardcoded entries.
 */
export function getRegimeDescriptions(): Record<string, ExpandedRegimeDescription> {
  const descriptions: Record<string, ExpandedRegimeDescription> = {};
  for (const regime of Object.keys(REGIME_NARRATIVES)) {
    descriptions[regime] = getExpandedRegimeDescriptionFromCanonical(regime);
  }
  return descriptions;
}

// Lazy-initialized cache
let _regimeDescriptionsCache: Record<string, ExpandedRegimeDescription> | null = null;
function getCachedRegimeDescriptions(): Record<string, ExpandedRegimeDescription> {
  if (!_regimeDescriptionsCache) {
    _regimeDescriptionsCache = getRegimeDescriptions();
  }
  return _regimeDescriptionsCache;
}

// Re-export for backward compatibility (some files import regimeDescriptions)
export const regimeDescriptions = new Proxy({} as Record<string, ExpandedRegimeDescription>, {
  get(_, key: string) {
    return getCachedRegimeDescriptions()[key];
  },
  ownKeys() {
    return Object.keys(getCachedRegimeDescriptions());
  },
  getOwnPropertyDescriptor(_, key: string) {
    const desc = getCachedRegimeDescriptions();
    if (key in desc) {
      return { configurable: true, enumerable: true, value: desc[key] };
    }
    return undefined;
  }
});

const REGIME_DESCRIPTIONS_COMPAT: Record<string, RegimeInfo> = {};
for (const regime of Object.keys(REGIME_NARRATIVES) as CanonicalRegimeType[]) {
  const desc = getExpandedRegimeDescriptionFromCanonical(regime);
  REGIME_DESCRIPTIONS_COMPAT[regime] = {
    name: regime,
    description: desc.description,
    favoredStrategies: desc.favoredStrategies,
  };
}

let cachedGlobalRegime: MarketRegime = 'RANGE_BOUND_STABLE';
let cachedGlobalFriction: number = 25;
let cachedGlobalDBSCategory: string = 'NEUTRAL'; // HF6: Cached global DBS category for VTS trade context
let lastUpdate: Date = new Date();

const TOP_100_FALLBACK_PAIRS = [
  'BTC/USD', 'ETH/USD', 'SOL/USD', 'XRP/USD', 'DOGE/USD',
  'ADA/USD', 'AVAX/USD', 'DOT/USD', 'MATIC/USD', 'LINK/USD',
  'ATOM/USD', 'UNI/USD', 'LTC/USD', 'BCH/USD', 'XLM/USD',
];

export function updateGlobalRegime(regime: MarketRegime): void {
  cachedGlobalRegime = regime;
  lastUpdate = new Date();
  console.log(`[11.4A][MarketIndicators] Global regime updated: ${regime}`);
}

export interface FrictionResult {
  score: number;
  sampleSize: number;
  symbolCount: number;
}

let lastFrictionSampleSize = 0;

export function computeGlobalFriction(): number {
  const result = computeGlobalFrictionWithDetails();
  return result.score;
}

export function computeGlobalFrictionWithDetails(): FrictionResult {
  try {
    // Use paper mode for global friction calculation (default mode)
    const pool = activeFilterPool.getActivePool('paper');
    const symbolsToSample = pool.length >= 50
      ? pool.slice(0, 100).map(p => p.symbol)
      : TOP_100_FALLBACK_PAIRS;

    let totalFriction = 0;
    let count = 0;

    // Directive 11.4H.3 Task 1: Collect raw data for audit logging
    const auditData: { symbol: string; spread: number; mid: number; friction: number }[] = [];

    for (const symbol of symbolsToSample) {
      const metrics = getCacheMetrics(symbol);
      if (metrics) {
        const friction = computeMarketFriction(metrics.spread, metrics.slippage, metrics.fee);
        totalFriction += friction;
        count++;

        // Directive 11.4H.3: Collect for audit (spread is in decimal form)
        auditData.push({
          symbol,
          spread: metrics.spread,
          mid: 0, // Mid price not available in cost cache, using spread directly
          friction
        });
      }
    }

    if (count === 0) {
      console.log(`[GlobalFriction][Audit] Sample size: 0 (no metrics available)`);
      lastFrictionSampleSize = 0;
      return { score: 25, sampleSize: 0, symbolCount: symbolsToSample.length };
    }

    const avgFriction = Math.round(totalFriction / count);
    cachedGlobalFriction = avgFriction;
    lastFrictionSampleSize = count;
    lastUpdate = new Date();

    // Directive 11.4H.3 Task 1: Global Friction Audit Logging
    const spreads = auditData.map(d => d.spread);
    const frictionScores = auditData.map(d => d.friction);
    const spreadVariance = spreads.length > 1
      ? spreads.reduce((sum, s) => sum + Math.pow(s - (spreads.reduce((a, b) => a + b, 0) / spreads.length), 2), 0) / spreads.length
      : 0;
    const frictionMin = Math.min(...frictionScores);
    const frictionMax = Math.max(...frictionScores);

    console.log(`[GlobalFriction][Audit] Sample size: ${count}`);
    console.log(`[GlobalFriction][Audit] Spread range: ${(Math.min(...spreads) * 100).toFixed(4)}% - ${(Math.max(...spreads) * 100).toFixed(4)}%`);
    console.log(`[GlobalFriction][Audit] Spread variance: ${(spreadVariance * 10000).toFixed(6)}`);
    console.log(`[GlobalFriction][Audit] Friction range: ${frictionMin} - ${frictionMax}`);
    // Directive 11.4H.6 Task 6: Global Friction Continuous Audit Logging
    console.log(`[11.4H.6][FrictionAudit] Global friction recalculated: ${avgFriction} | Spread range: ${(Math.min(...spreads) * 100).toFixed(4)}%-${(Math.max(...spreads) * 100).toFixed(4)}% | Sample size: ${count}`);
    console.log(`[GlobalFriction][Audit] Global friction result: ${avgFriction}`);

    return { score: avgFriction, sampleSize: count, symbolCount: symbolsToSample.length };
  } catch (err) {
    console.warn('[11.4A][MarketIndicators] Error computing global friction:', err);
    return { score: cachedGlobalFriction, sampleSize: lastFrictionSampleSize, symbolCount: 0 };
  }
}

export function getFrictionSampleSize(): number {
  return lastFrictionSampleSize;
}

export function getMarketIndicators(): MarketIndicators {
  // Directive 11.4H.4A-Fix: Get dominant regime from live telemetry instead of stale cache
  const telemetry = getTelemetryAggregator();
  const dominantRegime = telemetry.getDominantRegime();

  // Phase 14: Use normalizeRegime() instead of lossy mapToBaseRegime()
  // This correctly maps any regime name (old canonical, ghost, or new canonical) to current canonical
  const effectiveRegime: MarketRegime = dominantRegime
    ? normalizeRegime(dominantRegime.regime)
    : cachedGlobalRegime;
  const effectiveRegimeScore = dominantRegime?.avgRegimeScore ?? 50;
  const effectivePercentage = dominantRegime?.percentage ?? 0;

  // Update cache for consistency
  if (dominantRegime) {
    cachedGlobalRegime = effectiveRegime;
    lastUpdate = new Date();
  }

  const regimeKey = effectiveRegime as string;
  const expandedRegime = getCachedRegimeDescriptions()[regimeKey]
    ?? getCachedRegimeDescriptions()['RANGE_BOUND_STABLE'];
  const frictionResult = computeGlobalFrictionWithDetails();
  const frictionStatus = describeFriction(frictionResult.score);

  // Directive 11.4H.6A Task 1: Use strategy mapper for dynamic regime-based strategies/signals
  const favoredStrategies = getFavoredStrategiesForRegime(regimeKey);
  const favoredSignalTypes = getFavoredSignalTypesForRegime(regimeKey);

  console.log(`[Phase14][MarketIndicators] regime=${effectiveRegime} score=${effectiveRegimeScore} percentage=${effectivePercentage}%`);
  // Directive 11.4H.6G: Canonical logging for regime-strategy mapping
  console.log(`[11.4H.6G][Canonical] Regime=${effectiveRegime} | Strategies=${favoredStrategies.join(", ")} | Signals=${favoredSignalTypes.join(", ")}`);

  // Phase 14: Compute global directional bias from MCE cache
  let globalDBS: GlobalDirectionalBias | null = null;
  try {
    const mce = getMarketContextEngine();
    const emptyVolumes = new Map<string, number>();
    globalDBS = mce.computeGlobalBias(emptyVolumes);
    if (globalDBS.pairCount > 0) {
      console.log(`[Phase14][MarketIndicators] Global DBS: score=${globalDBS.score.toFixed(3)} category=${globalDBS.category} pairs=${globalDBS.pairCount}`);
    }
  } catch (err) {
    console.warn('[Phase14][MarketIndicators] Global DBS unavailable:', err);
  }

  // HF6: Cache DBS category for VTS trade context getter
  if (globalDBS) {
    cachedGlobalDBSCategory = globalDBS.category;
  }

  // Directive 11.4H.5 Task 3: Check for market event transitions
  checkRegimeTransition(effectiveRegime);
  checkFrictionTransition(frictionStatus.status);

  return {
    marketRegime: effectiveRegime,
    regimeTitle: expandedRegime.title,
    regimeDescription: expandedRegime.description,
    regimeScore: effectiveRegimeScore,
    regimePercentage: effectivePercentage,
    favoredSignalTypes,
    favoredStrategies,
    globalFrictionScore: frictionResult.score,
    frictionSampleSize: frictionResult.sampleSize,
    frictionDescription: frictionStatus,
    frictionNarrative: frictionStatus.narrative,
    globalDBS,
    timestamp: lastUpdate,
  };
}

export function getExpandedRegimeDescription(regime: string): ExpandedRegimeDescription | undefined {
  // Normalize to canonical name first
  const canonical = normalizeRegime(regime);
  return getCachedRegimeDescriptions()[canonical];
}

export function getRegimeInfo(regime: MarketRegime): RegimeInfo {
  return REGIME_DESCRIPTIONS_COMPAT[regime] || REGIME_DESCRIPTIONS_COMPAT['RANGE_BOUND_STABLE'];
}

export function getCurrentRegime(): MarketRegime {
  return cachedGlobalRegime;
}

export function getGlobalFriction(): number {
  return cachedGlobalFriction;
}

/**
 * HF6: Get last computed global DBS category for VTS trade context.
 * Updated each cycle by getMarketIndicators().
 */
export function getLastGlobalDBSCategory(): string {
  return cachedGlobalDBSCategory;
}
