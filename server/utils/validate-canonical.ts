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
 * ══════════════════════════════════════════════════════════════════════════════
 */

import canonicalMap from '../../bridge/canonical/mapping-regime-strategy.json' with { type: 'json' };
import { getFavoredStrategiesForRegime, getFavoredSignalTypesForRegime, getCanonicalRegimes } from '../core/strategy-mapper.js';

interface CanonicalEntry {
  favoredStrategies: string[];
  favoredSignalTypes: string[];
}

type CanonicalMapType = Record<string, CanonicalEntry | string>;

// B-NEW-43 chunk 7 (2026-05-23): `resolveJsonModule` (enabled in tsconfig
// chunk 7) types canonicalMap as the JSON's literal shape including the
// `_schema` + `_metadata` leading-underscore keys. The existing cast to
// CanonicalMapType (regime-name -> CanonicalEntry record) is bridged via
// `unknown` per the TS-recommended external-boundary form; consumers
// look up by regime name only and never read the metadata keys.
const typedCanonicalMap = canonicalMap as unknown as CanonicalMapType;

export function validateCanonicalConsistency(): void {
  try {
    console.log(`[11.4H.6G][Canonical Validation] Starting canonical consistency check...`);
  
  const regimes = getCanonicalRegimes();
  let validatedCount = 0;
  let driftCount = 0;

  regimes.forEach(regime => {
    const canonicalEntry = typedCanonicalMap[regime] as CanonicalEntry | undefined;
    if (!canonicalEntry || typeof canonicalEntry === 'string') {
      return;
    }
    
    const canonicalStrategies = canonicalEntry.favoredStrategies;
    const canonicalSignals = canonicalEntry.favoredSignalTypes;
    const localStrategies = getFavoredStrategiesForRegime(regime);
    const localSignals = getFavoredSignalTypesForRegime(regime);
    
    const strategyDrift = localStrategies.filter(s => !canonicalStrategies.includes(s));
    const signalDrift = localSignals.filter(s => !canonicalSignals.includes(s));
    
    if (strategyDrift.length > 0) {
      console.warn(`[11.4H.6G][Canonical Drift] Regime=${regime} → Non-canonical strategies: ${strategyDrift.join(", ")}`);
      driftCount++;
    }
    
    if (signalDrift.length > 0) {
      console.warn(`[11.4H.6G][Canonical Drift] Regime=${regime} → Non-canonical signals: ${signalDrift.join(", ")}`);
      driftCount++;
    }
    
    if (strategyDrift.length === 0 && signalDrift.length === 0) {
      validatedCount++;
    }
  });

  if (driftCount > 0) {
    console.warn(`[11.4H.6G][Canonical Validation] ${driftCount} regimes have drift issues!`);
  }
  
  console.log(`[11.4H.6G][Canonical Validation] Complete: ${validatedCount} regimes verified, ${driftCount} with drift.`);
  } catch (error) {
    console.error(`[11.4H.6G][Canonical Validation] Error during validation:`, error);
  }
}
