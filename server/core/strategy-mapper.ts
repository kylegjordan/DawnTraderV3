/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.4H.6G — Canonical Regime-Strategy Enforcement
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Purpose: Provides regime-based strategy and signal type recommendations.
 * This module imports from the canonical JSON file - the SINGLE SOURCE OF TRUTH.
 *
 * Governance:
 * - All mappings MUST come from /bridge/canonical/mapping-regime-strategy.json
 * - No hardcoded regime-strategy arrays permitted
 * - Runtime validation prevents canonical drift
 *
 * B79.0n.STRATEGY (2026-05-24): per-asset-class shape via nested `byAssetClass`.
 * Canonical JSON migrated from flat (v2.0.0) to nested (v3.0.0). Each
 * `getFavoredStrategiesForRegime` / `getFavoredSignalTypesForRegime` call
 * now REQUIRES `assetClass` parameter; legacy callers fail at TS compile time.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 */

import canonicalMap from '../../bridge/canonical/mapping-regime-strategy.json' with { type: 'json' };
import type { AssetClass } from '@shared/asset-classes';

interface CanonicalEntry {
  favoredStrategies: string[];
  favoredSignalTypes: string[];
  minConfidence?: number;
  riskMultiplier?: number;
}

interface CanonicalMapV3 {
  _schema?: string;
  _metadata?: Record<string, unknown>;
  byAssetClass: Record<string, Record<string, CanonicalEntry>>;
}

// B79.0n.STRATEGY: canonical JSON now structured by-asset-class. The cast bridge
// is via `unknown` per the TS-recommended external-boundary form; consumers
// read through the `byAssetClass` field only.
const typedCanonicalMap = canonicalMap as unknown as CanonicalMapV3;

function getClassMap(assetClass: AssetClass): Record<string, CanonicalEntry> {
  const classMap = typedCanonicalMap.byAssetClass?.[assetClass];
  if (!classMap) {
    throw new Error(
      `[11.4H.6G][Mapper] No canonical regime-strategy map for asset class '${assetClass}'. ` +
      `Check bridge/canonical/mapping-regime-strategy.json byAssetClass section.`
    );
  }
  return classMap;
}

export function getFavoredStrategiesForRegime(regime: string, assetClass: AssetClass): string[] {
  const classMap = getClassMap(assetClass);
  const canonical = classMap[regime];
  if (!canonical) {
    console.warn(`[11.4H.6G][Mapper] Missing canonical regime entry: ${regime} for ${assetClass}`);
    return ["Unknown Strategy"];
  }
  console.log(`[11.4H.6G][Mapper] AssetClass=${assetClass} Regime=${regime} | Strategies=${canonical.favoredStrategies.join(", ")}`);
  return canonical.favoredStrategies;
}

export function getFavoredSignalTypesForRegime(regime: string, assetClass: AssetClass): string[] {
  const classMap = getClassMap(assetClass);
  const canonical = classMap[regime];
  if (!canonical) {
    console.warn(`[11.4H.6G][Mapper] Missing canonical regime entry for signals: ${regime} for ${assetClass}`);
    return ["Quantitative"];
  }
  return canonical.favoredSignalTypes;
}

export function getCanonicalRegimes(assetClass: AssetClass): string[] {
  const classMap = getClassMap(assetClass);
  return Object.keys(classMap);
}

/**
 * B79.0n.STRATEGY: returns the list of asset classes for which a canonical
 * regime-strategy map exists. Used by canonical-bridge sync + drift detector.
 */
export function getCanonicalAssetClasses(): string[] {
  return Object.keys(typedCanonicalMap.byAssetClass ?? {});
}
