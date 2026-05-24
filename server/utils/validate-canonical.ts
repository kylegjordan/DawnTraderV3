/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.4H.6G Task 4 — Canonical Drift Detection
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Purpose: Validates canonical consistency at runtime startup.
 * Detects any divergence between canonical mapping and runtime behavior.
 *
 * Directive 11.4H.6G-Fix: Now validates both strategies AND signal types.
 *
 * B79.0n.STRATEGY (2026-05-24): canonical JSON migrated to nested byAssetClass
 * shape (v3.0.0). Validation now iterates per-asset-class × per-regime instead
 * of flat per-regime. Drift counted per (assetClass, regime, dimension) tuple.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 */

import canonicalMap from '../../bridge/canonical/mapping-regime-strategy.json' with { type: 'json' };
import { getFavoredStrategiesForRegime, getFavoredSignalTypesForRegime, getCanonicalRegimes, getCanonicalAssetClasses } from '../core/strategy-mapper.js';
import type { AssetClass } from '@shared/asset-classes';

interface CanonicalEntry {
  favoredStrategies: string[];
  favoredSignalTypes: string[];
}

interface CanonicalMapV3 {
  _schema?: string;
  _metadata?: Record<string, unknown>;
  byAssetClass: Record<string, Record<string, CanonicalEntry>>;
}

const typedCanonicalMap = canonicalMap as unknown as CanonicalMapV3;

export function validateCanonicalConsistency(): void {
  try {
    console.log(`[11.4H.6G][Canonical Validation] Starting canonical consistency check (v3.0.0 per-asset-class)...`);

    const assetClasses = getCanonicalAssetClasses();
    let validatedCount = 0;
    let driftCount = 0;

    for (const assetClassStr of assetClasses) {
      const assetClass = assetClassStr as AssetClass;
      const classMap = typedCanonicalMap.byAssetClass?.[assetClassStr];
      if (!classMap) continue;

      const regimes = getCanonicalRegimes(assetClass);

      for (const regime of regimes) {
        const canonicalEntry = classMap[regime];
        if (!canonicalEntry) continue;

        const canonicalStrategies = canonicalEntry.favoredStrategies;
        const canonicalSignals = canonicalEntry.favoredSignalTypes;
        const localStrategies = getFavoredStrategiesForRegime(regime, assetClass);
        const localSignals = getFavoredSignalTypesForRegime(regime, assetClass);

        const strategyDrift = localStrategies.filter(s => !canonicalStrategies.includes(s));
        const signalDrift = localSignals.filter(s => !canonicalSignals.includes(s));

        if (strategyDrift.length > 0) {
          console.warn(`[11.4H.6G][Canonical Drift] AssetClass=${assetClass} Regime=${regime} → Non-canonical strategies: ${strategyDrift.join(", ")}`);
          driftCount++;
        }

        if (signalDrift.length > 0) {
          console.warn(`[11.4H.6G][Canonical Drift] AssetClass=${assetClass} Regime=${regime} → Non-canonical signals: ${signalDrift.join(", ")}`);
          driftCount++;
        }

        if (strategyDrift.length === 0 && signalDrift.length === 0) {
          validatedCount++;
        }
      }
    }

    if (driftCount > 0) {
      console.warn(`[11.4H.6G][Canonical Validation] ${driftCount} (assetClass,regime) tuples have drift issues!`);
    }

    console.log(`[11.4H.6G][Canonical Validation] Complete: ${validatedCount} (assetClass,regime) tuples verified, ${driftCount} with drift, across ${assetClasses.length} asset classes.`);
  } catch (error) {
    console.error(`[11.4H.6G][Canonical Validation] Error during validation:`, error);
  }
}
